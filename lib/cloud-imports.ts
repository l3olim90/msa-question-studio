import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { postgresConnection, supabaseAdmin, sourceBucket } from './cloud';
import { getModules, withBank } from './bank-data';
import { HttpError } from './security';
import type { ImportJob, ImportReview, ImportRecord } from './source-imports';
import { manifestSchema } from './import-schema';

export const uploadMetadata = z
  .object({
    module: z.string(),
    kind: z.enum(['MST', 'EXAM']),
    academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
    semester: z.enum(['1', '2']),
  })
  .strict();
export type CloudImportRow = ImportJob & {
  manifest: z.infer<typeof manifestSchema>;
  review: ImportReview | null;
  bundle_path: string | null;
  review_revision: number;
  lease_token: string | null;
  attempts: number;
  question_hash: string | null;
};
export const checkImportId = (id: string) => {
  if (!/^ui-[0-9a-f-]{36}$/.test(id))
    throw new HttpError(400, 'Invalid import identifier.');
  return id;
};
export async function cloudImportRow(id: string): Promise<CloudImportRow> {
  checkImportId(id);
  const [row] =
    await postgresConnection()`SELECT * FROM studio.import_jobs WHERE id=${id}`;
  if (!row) throw new HttpError(404, 'Import not found.');
  return row as CloudImportRow;
}
export function publicJob(row: CloudImportRow) {
  const {
    id,
    module,
    paper_id,
    status,
    created_at,
    updated_at,
    error,
    log,
    review_revision,
  } = row;
  return {
    id,
    module,
    paper_id,
    status,
    created_at,
    updated_at,
    error,
    log,
    review_revision,
  };
}
export async function getCloudImport(id: string) {
  const row = await cloudImportRow(id);
  return { job: publicJob(row), review: row.review };
}
export async function listCloudImports() {
  const sql = postgresConnection();
  const rows =
    await sql`SELECT * FROM studio.import_jobs ORDER BY created_at DESC LIMIT 100`;
  const [worker] =
    await sql`SELECT last_seen FROM studio.worker_status WHERE id='imports'`;
  return {
    imports: rows.map((r) => publicJob(r as CloudImportRow)),
    storage: 'supabase',
    workerLastSeen: worker?.last_seen || null,
  };
}
export async function prepareCloudImport(raw: unknown) {
  const metadata = uploadMetadata.parse(raw);
  const years = metadata.academicYear.split('/').map(Number);
  if (years[1] !== years[0] + 1)
    throw new HttpError(
      422,
      'Use consecutive academic years, for example 2026/2027.',
    );
  const selectedModule = await withBank(() =>
    getModules().find((m) => m.id === metadata.module),
  );
  if (!selectedModule) throw new HttpError(422, 'Choose an existing module.');
  const id = 'ui-' + randomUUID(),
    paperId =
      selectedModule.id + '-' + metadata.kind + '-' + randomUUID().slice(0, 8);
  const manifest = manifestSchema.parse({
    batch: id,
    module: selectedModule,
    papers: [
      {
        id: paperId,
        kind: metadata.kind,
        academic_year: metadata.academicYear,
        semester: metadata.semester,
        question_pdf: 'questions.pdf',
        solution_pdf: 'solutions.pdf',
      },
    ],
  });
  const sql = postgresConnection(),
    now = new Date().toISOString();
  // Allocate ownership before creating fixed-path upload tokens. No arbitrary storage paths.
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(73511203)`;
    const [count] =
      await tx`SELECT count(*)::int AS n FROM studio.import_jobs WHERE status IN ('uploading','queued','extracting','commit_queued','committing') AND created_at > ${new Date(Date.now() - 86400000).toISOString()}`;
    if (count.n >= 20)
      throw new HttpError(
        429,
        'The import queue is full. Wait for existing imports to finish.',
      );
    await tx`INSERT INTO studio.import_jobs(id,module,paper_id,status,created_at,updated_at,manifest) VALUES(${id},${selectedModule.id},${paperId},'uploading',${now},${now},${tx.json(manifest)})`;
  });
  const uploads = await Promise.all(
    ['questions', 'solutions'].map(async (kind) => {
      const { data, error } = await supabaseAdmin()
        .storage.from(sourceBucket)
        .createSignedUploadUrl(`imports/${id}/${kind}.pdf`, { upsert: false });
      if (error || !data)
        throw new HttpError(
          503,
          'Could not prepare PDF uploads. Retry shortly.',
        );
      return { kind, url: data.signedUrl };
    }),
  );
  return { id, uploads };
}
export async function submitCloudImport(id: string) {
  const row = await cloudImportRow(id);
  if (row.status !== 'uploading')
    throw new HttpError(
      409,
      'This upload was already submitted. Refresh imports.',
    );
  // Full signature/hash/page validation is repeated by the worker before extraction.
  for (const kind of ['questions', 'solutions']) {
    const { data, error } = await supabaseAdmin()
      .storage.from(sourceBucket)
      .info(`imports/${id}/${kind}.pdf`);
    if (error || !data || !Number(data.size) || Number(data.size) > 52428800)
      throw new HttpError(
        422,
        'Upload both PDF files, each no larger than 50 MB, before submitting.',
      );
  }
  await postgresConnection()`UPDATE studio.import_jobs SET status='queued',updated_at=${new Date().toISOString()} WHERE id=${id} AND status='uploading'`;
  return { id };
}
export async function saveCloudReview(
  id: string,
  records: ImportRecord[],
  paperVerified: boolean,
  paperNotes: string,
  revision?: number,
) {
  const row = await cloudImportRow(id),
    review = row.review;
  if (row.status !== 'review' || !review)
    throw new HttpError(409, 'This import is not ready for review.');
  if (revision !== row.review_revision)
    throw new HttpError(
      409,
      'Another session changed this review. Reopen the latest version before saving.',
    );
  if (
    records.length !== review.records.length ||
    new Set(records.map((r) => r.id)).size !== records.length
  )
    throw new HttpError(422, 'Keep one record for every extracted question.');
  for (const record of records) {
    const original = review.records.find((r) => r.id === record.id);
    if (
      !original ||
      original.paper_id !== record.paper_id ||
      original.source_question !== record.source_question
    )
      throw new HttpError(422, 'Do not change source identifiers.');
  }
  review.records = records;
  review.taxonomy_verified = true;
  review.taxonomy_reviewer_notes =
    'Existing approved module taxonomy; unchanged by upload.';
  review.papers[0].verified = paperVerified;
  review.papers[0].reviewer_notes = paperNotes;
  const sql = postgresConnection();
  const updated =
    await sql`UPDATE studio.import_jobs SET review=${sql.json(review as never)},review_revision=review_revision+1,updated_at=${new Date().toISOString()} WHERE id=${id} AND status='review' AND review_revision=${revision} RETURNING id`;
  if (!updated.length)
    throw new HttpError(
      409,
      'The review changed while saving. Reopen its latest version.',
    );
  return getCloudImport(id);
}
export async function commitCloudImport(id: string, revision?: number) {
  const row = await cloudImportRow(id),
    review = row.review;
  if (row.status !== 'review' || !review)
    throw new HttpError(409, 'This import is not ready to add to the bank.');
  if (revision !== row.review_revision)
    throw new HttpError(409, 'Reopen the latest review before approving it.');
  if (
    !review.papers.every((p) => p.verified && p.reviewer_notes.trim()) ||
    !review.records.every(
      (r) => r.verified && r.reviewer_notes.trim() && !r.issues.length,
    )
  )
    throw new HttpError(
      422,
      'Verify every question and the whole paper, record notes and resolve all issues before approval.',
    );
  const updated =
    await postgresConnection()`UPDATE studio.import_jobs SET status='commit_queued',error=NULL,attempts=0,updated_at=${new Date().toISOString()} WHERE id=${id} AND status='review' AND review_revision=${revision} RETURNING id`;
  if (!updated.length)
    throw new HttpError(409, 'The review changed while approving. Reopen it.');
  return { id };
}
export async function retryCloudImport(id: string) {
  const updated =
    await postgresConnection()`UPDATE studio.import_jobs SET status='queued',error=NULL,attempts=0,lease_token=NULL,lease_until=NULL,updated_at=${new Date().toISOString()} WHERE id=${checkImportId(id)} AND status='error' RETURNING id`;
  if (!updated.length)
    throw new HttpError(409, 'Only failed extractions can be retried.');
  return { id };
}

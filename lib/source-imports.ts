import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { database, transaction } from './database';
import { moduleFor } from './modules';
import { getBank } from './bank-data';
import { extractedSchema, manifestSchema } from './import-schema';
import { HttpError } from './security';
import { serverConfig } from './server-config';
import { auditContent } from './observability';

export const importRecordSchema =
  extractedSchema.shape.questions.element.extend({
    id: z.string(),
    paper_id: z.string(),
    verified: z.boolean(),
    reviewer_notes: z.string().max(3000),
  });
export type ImportRecord = z.infer<typeof importRecordSchema>;
export type ImportReview = {
  module: { id: string };
  taxonomy_verified: boolean;
  taxonomy_reviewer_notes: string;
  papers: {
    id: string;
    verified: boolean;
    reviewer_notes: string;
    question_page_count: number;
    solution_page_count: number;
    expected_source_questions: string[];
  }[];
  records: ImportRecord[];
};
export type ImportJob = {
  id: string;
  module: string;
  paper_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  error: string | null;
  log: string | null;
  review_revision?: number;
};
const runtime = globalThis as typeof globalThis & {
  studioImportWorkers?: Set<string>;
};
const workers = (runtime.studioImportWorkers ||= new Set<string>());
export function importPaths(id: string) {
  if (!/^ui-[0-9a-f-]{36}$/.test(id))
    throw new HttpError(400, 'Invalid import identifier.');
  return {
    inbox: resolve('imports/inbox', id),
    stage: resolve('imports/staging', id),
  };
}
export function getImport(id: string) {
  const row = database()
    .prepare('SELECT * FROM import_jobs WHERE id=?')
    .get(id) as ImportJob | undefined;
  if (!row) throw new HttpError(404, 'Import not found.');
  const { stage } = importPaths(id);
  if (['extracting', 'committing'].includes(row.status) && !workers.has(id)) {
    const committed = getBank().questions.some(
      (q) => q.paper_id === row.paper_id,
    );
    row.status = committed
      ? 'committed'
      : existsSync(join(stage, 'review.json'))
        ? 'review'
        : 'error';
    row.error = committed
      ? null
      : 'The previous import request was interrupted. Review any recovered extraction, or upload the pair again.';
    database()
      .prepare(
        'UPDATE import_jobs SET status=?,error=?,updated_at=? WHERE id=?',
      )
      .run(row.status, row.error, new Date().toISOString(), id);
  }
  const review = existsSync(join(stage, 'review.json'))
    ? (JSON.parse(
        readFileSync(join(stage, 'review.json'), 'utf8'),
      ) as ImportReview)
    : null;
  return { job: row, review };
}
export function listImports() {
  return (
    database()
      .prepare('SELECT id FROM import_jobs ORDER BY created_at DESC LIMIT 100')
      .all() as { id: string }[]
  ).map((row) => getImport(row.id).job);
}
function runBank(id: string, command: 'extract' | 'commit', argument: string) {
  workers.add(id);
  const child = spawn(
    process.execPath,
    ['scripts/run.mjs', 'bank', command, argument],
    {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  const capture = (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-24000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  let settled = false;
  function finish(code: number | null, error?: Error) {
    if (settled) return;
    settled = true;
    workers.delete(id);
    const clean = JSON.parse(
      auditContent(log + (error ? '\n' + error.message : '')),
    ) as string;
    const status =
      code === 0
        ? command === 'extract'
          ? 'review'
          : 'committed'
        : command === 'commit'
          ? 'review'
          : 'error';
    const message =
      code === 0
        ? null
        : `PDF ${command === 'extract' ? 'extraction' : 'commit'} failed. Check the processing log, correct the issue and retry. For PDF processing errors, install requirements-import.txt and check PYTHON.`;
    try {
      database()
        .prepare(
          'UPDATE import_jobs SET status=?,updated_at=?,error=?,log=? WHERE id=?',
        )
        .run(status, new Date().toISOString(), message, clean, id);
    } catch {
      console.warn(
        '[Import] Could not save final import status. The staged review remains on disk.',
      );
    }
  }
  child.on('error', (error) => finish(1, error));
  child.on('close', (code) => finish(code));
}
function assertIdle() {
  if (
    database()
      .prepare(
        "SELECT id FROM import_jobs WHERE status IN ('extracting','committing') LIMIT 1",
      )
      .get()
  )
    throw new HttpError(
      409,
      'Another import is processing. Wait for it to finish before starting another.',
    );
}
export async function startImport(form: FormData) {
  if (!serverConfig().key)
    throw new HttpError(
      422,
      'Configure the provider API key in .env before extracting PDFs.',
    );
  const moduleConfig = moduleFor(z.string().parse(form.get('module')));
  const kind = z.enum(['MST', 'EXAM']).parse(form.get('kind'));
  const id = 'ui-' + randomUUID(),
    paperId = `${moduleConfig.id}-${kind}-${randomUUID().slice(0, 8)}`;
  const { inbox } = importPaths(id);
  const metadata = manifestSchema.parse({
    batch: id,
    module: moduleConfig,
    papers: [
      {
        id: paperId,
        kind: form.get('kind'),
        academic_year: form.get('academicYear'),
        semester: form.get('semester'),
        question_pdf: 'questions.pdf',
        solution_pdf: 'solutions.pdf',
      },
    ],
  });
  const year = metadata.papers[0].academic_year.split('/').map(Number);
  if (year[1] !== year[0] + 1)
    throw new HttpError(
      422,
      'Academic year must be consecutive years, for example 2026/2027.',
    );
  const pdfs = await Promise.all(
    ['questionPdf', 'solutionPdf'].map(async (field) => {
      const file = form.get(field);
      if (!(file instanceof File) || !file.size || file.size > 50 * 1024 * 1024)
        throw new HttpError(
          422,
          'Choose both a question PDF and a worked-solution PDF, each no larger than 50 MB.',
        );
      const buffer = Buffer.from(await file.arrayBuffer());
      if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')))
        throw new HttpError(
          422,
          'The uploaded files must be valid PDF documents.',
        );
      return buffer;
    }),
  );
  // Identical paper content must not be imported twice, regardless of its filename.
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(pdfs[0]).digest('hex');
  if (
    getBank().questions.some(
      (q) =>
        (q as unknown as { question_source_sha256?: string })
          .question_source_sha256 === hash,
    )
  )
    throw new HttpError(
      409,
      'This question paper is already in the source bank.',
    );
  transaction((db) => {
    assertIdle();
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, 'questions.pdf'), pdfs[0]);
    writeFileSync(join(inbox, 'solutions.pdf'), pdfs[1]);
    writeFileSync(
      join(inbox, 'manifest.json'),
      JSON.stringify(metadata, null, 2),
    );
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO import_jobs(id,module,paper_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    ).run(id, moduleConfig.id, paperId, 'extracting', now, now);
  });
  runBank(id, 'extract', join(inbox, 'manifest.json'));
  return { id };
}
export async function retryImport(id: string) {
  const { job } = getImport(id);
  if (job.status !== 'error')
    throw new HttpError(409, 'Only a failed extraction can be retried.');
  const { inbox } = importPaths(id);
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(join(inbox, 'manifest.json'), 'utf8')),
  );
  const form = new FormData();
  form.set('module', manifest.module.id);
  form.set('kind', manifest.papers[0].kind);
  form.set('academicYear', manifest.papers[0].academic_year);
  form.set('semester', manifest.papers[0].semester);
  form.set(
    'questionPdf',
    new File([readFileSync(join(inbox, 'questions.pdf'))], 'questions.pdf', {
      type: 'application/pdf',
    }),
  );
  form.set(
    'solutionPdf',
    new File([readFileSync(join(inbox, 'solutions.pdf'))], 'solutions.pdf', {
      type: 'application/pdf',
    }),
  );
  return startImport(form);
}
export function saveImportReview(
  id: string,
  records: ImportRecord[],
  paperVerified: boolean,
  paperNotes: string,
) {
  const { job, review } = getImport(id);
  if (job.status !== 'review' || !review)
    throw new HttpError(
      409,
      'This import is not ready for review. Refresh its status.',
    );
  if (
    records.length !== review.records.length ||
    new Set(records.map((r) => r.id)).size !== records.length
  )
    throw new HttpError(
      422,
      'Keep one review record for every extracted question.',
    );
  for (const record of records) {
    const original = review.records.find((r) => r.id === record.id);
    if (
      !original ||
      original.paper_id !== record.paper_id ||
      original.source_question !== record.source_question
    )
      throw new HttpError(422, 'Do not change the source record identifiers.');
  }
  review.records = records;
  review.taxonomy_verified = true;
  review.taxonomy_reviewer_notes =
    'Existing approved module taxonomy; unchanged by this upload.';
  review.papers[0].verified = paperVerified;
  review.papers[0].reviewer_notes = paperNotes;
  writeFileSync(
    join(importPaths(id).stage, 'review.json'),
    JSON.stringify(review, null, 2),
  );
  return { job, review };
}
export function commitImport(id: string) {
  const { job, review } = getImport(id);
  if (job.status !== 'review' || !review)
    throw new HttpError(409, 'This import is not ready to add to the bank.');
  if (
    !review.papers.every((p) => p.verified && p.reviewer_notes.trim()) ||
    !review.records.every(
      (r) => r.verified && r.reviewer_notes.trim() && !r.issues.length,
    )
  )
    throw new HttpError(
      422,
      'Verify every question and the whole paper, record reviewer notes, and resolve all extraction issues before adding sources.',
    );
  transaction((db) => {
    assertIdle();
    db.prepare(
      'UPDATE import_jobs SET status=?,error=NULL,updated_at=? WHERE id=?',
    ).run('committing', new Date().toISOString(), id);
  });
  runBank(id, 'commit', id);
  return { id };
}

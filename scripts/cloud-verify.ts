// Explicit live integration check. Creates uniquely identified fixtures and removes only those fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  postgresConnection,
  closeCloud,
  supabaseAdmin,
  sourceBucket,
  safeError,
} from '../lib/cloud';
import { withBank, getBank, referenceImage } from '../lib/bank-data';
import {
  approveQuestion,
  getQuestion,
  deleteQuestion,
  listQuestions,
} from '../lib/repository';
import {
  auditGeneration,
  auditProvider,
  recordPrompt,
  auditContent,
} from '../lib/observability';
import { resultSchema } from '../lib/history';
import {
  prepareCloudImport,
  submitCloudImport,
  getCloudImport,
  cloudImportRow,
  saveCloudReview,
  commitCloudImport,
} from '../lib/cloud-imports';
import { claimImport, processImport } from '../lib/cloud-worker';
import { signedAsset } from '../lib/cloud-assets';
import { acquireGenerationSlot } from '../lib/generation-slot';
process.env.STUDIO_STORAGE = 'supabase';
const sql = postgresConnection(),
  session = randomUUID();
let questionId: string | undefined, importId: string | undefined;
console.log('Checking source asset registry...');
const beforeAssetNames = new Set(
  (await sql`SELECT name FROM studio.source_assets`).map((r) => r.name),
);
function pdf(lines: string[]) {
  const stream =
    'BT /F1 12 Tf 40 700 Td ' +
    lines
      .map(
        (s, i) =>
          (i ? '0 -24 Td ' : '') + '(' + s.replace(/[()\\]/g, '\\$&') + ') Tj',
      )
      .join('\n') +
    ' ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let data = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(data));
    data += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(data);
  data += `xref\n0 6\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return data;
}
try {
  console.log('Checking database access rules...');
  const [privateSchema] =
    await sql`SELECT has_schema_privilege('anon','studio','USAGE') AS anon,has_schema_privilege('authenticated','studio','USAGE') AS users`;
  assert.equal(privateSchema.anon, false);
  assert.equal(privateSchema.users, false);
  console.log('Checking bucket privacy...');
  const { data: bucket, error } =
    await supabaseAdmin().storage.getBucket(sourceBucket);
  assert.ifError(error);
  assert.equal(bucket!.public, false);
  console.log('Checking cloud source snapshot...');
  await withBank(async () => {
    const bank = getBank();
    assert(bank.questions.length >= 128);
    const name = Object.keys(bank.images)[0];
    console.log('Checking diagram download...');
    assert(
      (
        await referenceImage(
          name,
          bank.images[name as keyof typeof bank.images],
        )
      ).startsWith('data:image/'),
    );
    console.log('Checking signed image access...');
    const response = await fetch(await signedAsset('diagram/' + name), {
      signal: AbortSignal.timeout(15000),
    });
    assert(response.ok);
  });
  console.log(
    'PASS: private schema/bucket, remote source retrieval and signed diagrams.',
  );
  const fixture = resultSchema.parse(
    JSON.parse(readFileSync('test-output/history-fixture.json', 'utf8')),
  );
  fixture.brief.topic = fixture.effectiveBrief.topic = 'EM1-2';
  fixture.brief.subtopics =
    fixture.effectiveBrief.subtopics =
    fixture.draft.syllabus_ids =
    fixture.feasibility.selected_subtopics =
      ['EM1-2.3'];
  fixture.review.passed =
    fixture.review.scope_passed =
    fixture.review.format_passed =
      true;
  fixture.draft.title = 'Cloud verification ' + session;
  const first = await approveQuestion(fixture);
  questionId = first.id;
  const outcomes = await Promise.allSettled([
    approveQuestion(fixture, first.id, 1),
    approveQuestion(fixture, first.id, 1),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await getQuestion(first.id)).revision, 2);
  assert((await listQuestions('EM1', session)).some((q) => q.id === first.id));
  await deleteQuestion(first.id, 2);
  await assert.rejects(() => getQuestion(first.id), /no longer/);
  console.log(
    'PASS: Postgres approval, concurrent replacement conflict, search and deletion.',
  );
  await auditGeneration(
    {
      operation: 'generate',
      sessionId: session,
      input: { secret: process.env.SUPABASE_SECRET_KEY },
    },
    async () => {
      await recordPrompt('EM1@test', 'test-hash', 'EM1');
      await auditProvider(
        { text: { format: { name: 'review' } }, input: 'fixture' },
        'fixture',
        'fixture',
        async () => ({
          output: [],
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
      );
      return { fixture: true };
    },
  );
  const [trace] =
    await sql`SELECT * FROM studio.traces WHERE session_id=${session}`;
  assert.equal(trace.status, 'success');
  assert.equal(trace.prompt_version, 'EM1@test');
  assert(!trace.input_json.includes(process.env.SUPABASE_SECRET_KEY));
  assert(
    !auditContent({ url: process.env.DATABASE_URL }).includes(
      process.env.DATABASE_URL!,
    ),
  );
  const [spans] =
    await sql`SELECT count(*)::int AS n FROM studio.trace_spans WHERE trace_id=${trace.id}`;
  assert.equal(spans.n, 1);
  const release1 = await acquireGenerationSlot(),
    release2 = await acquireGenerationSlot();
  await assert.rejects(() => acquireGenerationSlot(), /capacity/);
  await release1();
  await release2();
  console.log(
    'PASS: cloud traces, usage, credential redaction and shared generation capacity.',
  );
  const upload = await prepareCloudImport({
    module: 'EM1',
    kind: 'MST',
    academicYear: '2026/2027',
    semester: '1',
  });
  importId = upload.id;
  for (const item of upload.uploads) {
    const lines =
      item.kind === 'questions'
        ? [
            'Synthetic verification ' + session,
            'Q1 [2 marks]',
            'Given z = 3 + 4j, find the modulus of z.',
          ]
        : [
            'Synthetic worked solution',
            'Q1: modulus = sqrt(3^2 + 4^2) = 5.',
            'Award 1 mark for the substitution and 1 mark for 5.',
          ];
    const response = await fetch(item.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdf(lines),
    });
    assert.equal(response.status, 200);
  }
  await submitCloudImport(upload.id);
  assert.equal((await getCloudImport(upload.id)).job.status, 'queued');
  if (process.argv.includes('--live-import')) {
    const claimed = await claimImport(upload.id);
    assert(claimed);
    await processImport(claimed);
    let current = await getCloudImport(upload.id);
    assert.equal(current.job.status, 'review', current.job.error || '');
    assert.equal(current.review!.records.length, 1);
    const record = current.review!.records[0];
    assert(
      record.question.includes('3') &&
        record.question.includes('4') &&
        record.solution.includes('5'),
    );
    current = await saveCloudReview(
      upload.id,
      [
        {
          ...record,
          verified: true,
          issues: [],
          reviewer_notes:
            'Synthetic cloud integration fixture; checked 3+4j modulus is 5. Fixture removed after test.',
        },
      ],
      true,
      'One question and solution checked; temporary integration fixture.',
      current.job.review_revision,
    );
    await assert.rejects(
      () =>
        saveCloudReview(
          upload.id,
          current.review!.records,
          true,
          'Stale review',
          0,
        ),
      /Another session/,
    );
    await commitCloudImport(upload.id, current.job.review_revision);
    const commit = await claimImport(upload.id);
    assert(commit);
    await processImport(commit);
    current = await getCloudImport(upload.id);
    assert.equal(current.job.status, 'committed', current.job.error || '');
    const [source] =
      await sql`SELECT count(*)::int AS n FROM studio.source_questions WHERE paper_id=${current.job.paper_id}`;
    assert.equal(source.n, 1);
    console.log(
      'PASS: live provider PDF extraction, persisted review, stale review conflict, worker approval and cloud source promotion.',
    );
  }
  console.log('PASS: signed direct PDF upload and durable import queue.');
} catch (e) {
  console.error(safeError(e));
  process.exitCode = 1;
} finally {
  if (questionId) {
    await sql`DELETE FROM studio.repository_events WHERE question_id=${questionId}`;
    await sql`DELETE FROM studio.repository_revisions WHERE question_id=${questionId}`;
    await sql`DELETE FROM studio.repository_questions WHERE id=${questionId}`;
  }
  await sql`DELETE FROM studio.trace_spans WHERE trace_id IN (SELECT id FROM studio.traces WHERE session_id=${session})`;
  await sql`DELETE FROM studio.traces WHERE session_id=${session}`;
  if (importId) {
    const row = await cloudImportRow(importId);
    await sql`DELETE FROM studio.source_questions WHERE paper_id=${row.paper_id}`;
    const assets =
      await sql`SELECT name,path FROM studio.source_assets WHERE name LIKE ${'%' + row.paper_id + '%'}`;
    for (const asset of assets)
      if (!beforeAssetNames.has(asset.name)) {
        await sql`DELETE FROM studio.source_assets WHERE name=${asset.name}`;
        const [uses] =
          await sql`SELECT count(*)::int AS n FROM studio.source_assets WHERE path=${asset.path}`;
        if (!uses.n)
          await supabaseAdmin().storage.from(sourceBucket).remove([asset.path]);
      }
    const { data: files } = await supabaseAdmin()
      .storage.from(sourceBucket)
      .list('imports/' + importId, { limit: 100 });
    if (files?.length)
      await supabaseAdmin()
        .storage.from(sourceBucket)
        .remove(files.map((f) => 'imports/' + importId + '/' + f.name));
    await sql`DELETE FROM studio.import_jobs WHERE id=${importId}`;
  }
  await closeCloud();
}

import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { database, closeDatabase } from '../lib/database';
import {
  approveQuestion,
  getQuestion,
  listQuestions,
  deleteQuestion,
} from '../lib/repository';
import { resultSchema } from '../lib/history';
import {
  auditGeneration,
  auditProvider,
  auditContent,
  recordPrompt,
} from '../lib/observability';
import { loadPrompts } from '../lib/prompts';
import { configurationIssues } from '../lib/configuration';
import { getBank } from '../lib/bank-data';
import { retrieve } from '../lib/retrieval';
import { selectBase } from '../lib/similar';
import { generate } from '../lib/generation';
import { worksheetDocument } from '../lib/word';
import {
  parseSourceMarking,
  normalizeSourceParents,
} from '../lib/source-marking';
import { importRequest } from '../lib/import-retry';
import { POST as paperRoute } from '../app/api/worksheets/route';
import { POST as approveRoute } from '../app/api/repository/route';
import { GET as tracesRoute } from '../app/api/traces/route';
import { POST as importRoute } from '../app/api/imports/route';
import {
  importPaths,
  getImport,
  saveImportReview,
  commitImport,
} from '../lib/source-imports';

const previousEnv = { ...process.env },
  originalFetch = globalThis.fetch;
const directory = mkdtempSync(resolve('test-output/features-'));
process.env.STUDIO_DB_PATH = join(directory, 'studio.sqlite');
process.env.AUDIT_CAPTURE_CONTENT = 'true';
process.env.TEST_SECRET = 'private-test-credential';
const fixture = resultSchema.parse(
  JSON.parse(readFileSync('test-output/history-fixture.json', 'utf8')),
);
fixture.brief.topic = fixture.effectiveBrief.topic = 'EM1-2';
fixture.brief.subtopics =
  fixture.effectiveBrief.subtopics =
  fixture.draft.syllabus_ids =
  fixture.feasibility.selected_subtopics =
    ['EM1-2.3'];
fixture.draft.answer_key = 'The blue and green shaded regions represent water.';
fixture.review.scope_passed = true;
fixture.review.format_passed = true;
fixture.promptVersion = loadPrompts('EM1').version;
fixture.promptHash = loadPrompts('EM1').hash;
const headers = {
  'Content-Type': 'application/json',
  ...(process.env.APP_PASSWORD
    ? {
        Authorization:
          'Basic ' +
          Buffer.from(
            (process.env.APP_USERNAME || 'studio') +
              ':' +
              process.env.APP_PASSWORD,
          ).toString('base64'),
      }
    : {}),
};
const request = (url: string, body: unknown) =>
  new Request('http://127.0.0.1' + url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
try {
  const malformedMarking = String.raw`{"steps":[{"criterion":"$\sqrt{3^2+4^2}$","marks":1}]}`;
  const fixedMarking = parseSourceMarking(malformedMarking);
  assert.deepEqual(fixedMarking, {
    steps: [{ criterion: '$\\sqrt{3^2+4^2}$', marks: 1 }],
  });
  assert.deepEqual(
    parseSourceMarking(JSON.stringify(fixedMarking)),
    fixedMarking,
  );
  assert.equal(parseSourceMarking('null'), null);
  assert.throws(() => parseSourceMarking('{broken}'));
  assert.deepEqual(
    normalizeSourceParents({
      questions: [{ source_question: 'Q1', parent_question: '' }],
    }),
    { questions: [{ source_question: 'Q1', parent_question: 'Q1' }] },
  );
  let importAttempts = 0;
  assert.equal(
    await importRequest(async () => {
      if (++importAttempts === 1) throw new TypeError('fetch failed');
      return 'recovered';
    }),
    'recovered',
  );
  assert.equal(importAttempts, 2);
  importAttempts = 0;
  await assert.rejects(
    () =>
      importRequest(async () => {
        importAttempts++;
        throw new Error('permanent extraction failure');
      }),
    /permanent/,
  );
  assert.equal(importAttempts, 1);
  const first = await approveQuestion(fixture);
  assert.equal(first.revision, 1);
  fixture.draft.title = 'Refined water question';
  assert.notEqual(
    (await getQuestion(first.id)).result.draft.title,
    fixture.draft.title,
    'working edits cannot mutate approved content',
  );
  const second = await approveQuestion(fixture, first.id, first.revision);
  assert.equal(second.revision, 2);
  await assert.rejects(() => approveQuestion(fixture, first.id, 1), /another session/);
  assert.equal(
    database().prepare('SELECT count(*) AS n FROM repository_revisions').get()!
      .n,
    2,
  );
  closeDatabase();
  assert.equal((await getQuestion(first.id)).result.draft.title, fixture.draft.title);
  const restart = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.env.STUDIO_DB_PATH);console.log(db.prepare('SELECT revision FROM repository_questions WHERE deleted_at IS NULL').get().revision);db.close();",
    ],
    { encoding: 'utf8', env: process.env },
  );
  assert.equal(restart.status, 0, restart.stderr);
  assert.equal(restart.stdout.trim(), '2');
  assert.equal((await listQuestions('EM2')).length, 0);
  assert.equal((await listQuestions('EM1', 'refined')).length, 1);
  assert.equal(
    (
      await approveRoute(
        request('/api/repository', { result: fixture, approved: false }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await approveRoute(
        new Request('http://127.0.0.1/api/repository', {
          method: 'POST',
          headers: { ...headers, origin: 'https://untrusted.example' },
          body: '{}',
        }),
      )
    ).status,
    403,
  );
  await assert.rejects(
    () =>
      approveQuestion({
        ...fixture,
        review: { ...fixture.review, passed: false },
      }),
    /recheck/,
  );
  const worksheet = {
    title: 'Water and geometry worksheet',
    includeName: true,
    includeClass: true,
    instructions: 'Answer every question. Show your working.',
    sections: [
      { name: 'Section A', questions: [{ id: first.id, revision: 2 }] },
    ],
  };
  assert.equal(
    (await paperRoute(request('/api/worksheets', worksheet))).status,
    200,
  );
  assert.equal(
    (
      await paperRoute(
        request('/api/worksheets', {
          ...worksheet,
          sections: [
            { name: 'Section A', questions: [{ id: first.id, revision: 1 }] },
          ],
        }),
      )
    ).status,
    409,
  );
  const paper = {
    ...worksheet,
    sections: [
      { name: 'Section A', questions: [{ id: first.id, result: fixture }] },
      {
        name: 'Section B',
        questions: [
          {
            id: crypto.randomUUID(),
            result: {
              ...fixture,
              draft: {
                ...fixture.draft,
                question:
                  'For a tank of radius $3$ cm, calculate its area using $A=\\pi r^2$.',
                answer_key: '$9\\pi\\,\\mathrm{cm}^2$',
                solutions: [
                  {
                    title: 'Circle area',
                    content:
                      'Substitute $r=3$ into $A=\\pi r^2$ to obtain $A=9\\pi\\,\\mathrm{cm}^2$.',
                    marking: [
                      {
                        part: '',
                        criterion:
                          'Correct substitution and exact area with units.',
                        marks: 4,
                      },
                    ],
                  },
                ],
                diagrams: [],
              },
            },
          },
        ],
      },
    ],
  };
  for (const lecturer of [false, true]) {
    const document = worksheetDocument(paper, [[], []], lecturer);
    writeFileSync(
      join(directory, lecturer ? 'lecturer.docx' : 'student.docx'),
      document,
    );
    const xml = strFromU8(unzipSync(document)['word/document.xml']);
    assert(
      xml.includes('Worksheet generated by AI. Review before assessment use.'),
    );
    assert(
      xml.includes('Name:') &&
        xml.includes('Class:') &&
        xml.includes('Answer key'),
    );
    assert(
      xml.includes('Section A') &&
        xml.includes('Section B') &&
        xml.includes('Question 2'),
    );
    assert(xml.includes('Full worked solutions') === lecturer);
    assert(xml.includes('Proposed marking allocation') === lecturer);
    assert(
      xml.includes('<m:oMath>') &&
        xml.includes('<wpg:wgp>') &&
        xml.includes('fill="norm"'),
    );
    new DOMParser({
      onError: (level) => {
        if (level === 'fatalError') throw new Error('Invalid worksheet XML');
      },
    }).parseFromString(xml, 'text/xml');
  }
  const noFields = strFromU8(
    unzipSync(
      worksheetDocument({ ...paper, includeName: false, includeClass: false }, [
        [],
        [],
      ]),
    )['word/document.xml'],
  );
  assert(!noFields.includes('Name:') && !noFields.includes('Class:'));
  await deleteQuestion(first.id, 2);
  assert.equal((await listQuestions()).length, 0);
  await assert.rejects(() => getQuestion(first.id), /no longer/);
  assert.equal(
    (await paperRoute(request('/api/worksheets', worksheet))).status,
    404,
  );
  assert.equal(
    database().prepare('SELECT count(*) AS n FROM repository_revisions').get()!
      .n,
    2,
  );
  console.log(
    'PASS: SQLite approval/replacement/delete/revision conflicts, cross-process persistence, authenticated APIs, current repository worksheet validation and student/lecturer DOCX structure.',
  );

  globalThis.fetch = async () => {
    throw new Error('Local logging must not send telemetry.');
  };
  const call = () =>
    auditProvider(
      {
        instructions: 'Private prompt private-test-credential',
        input: JSON.stringify({
          question: 'Question',
          headers: { authorization: 'do-not-store' },
          image_url: 'private-image',
          encrypted_content: 'private-reasoning',
        }),
        text: { format: { name: 'review' } },
      },
      'openai',
      'fixture-model',
      async () => ({
        output: [{ type: 'output_text', text: 'Final answer' }],
        usage: {
          input_tokens: 100,
          output_tokens: 25,
          input_tokens_details: { cached_tokens: 20 },
        },
      }),
    );
  await Promise.all(
    [1, 2].map(async () =>
      auditGeneration(
        {
          operation: 'generate',
          sessionId: crypto.randomUUID(),
          input: { brief: fixture.brief },
        },
        async () => {
          await recordPrompt(fixture.promptVersion!, fixture.promptHash!, 'EM1');
          await call();
          return structuredClone(fixture);
        },
      ),
    ),
  );
  const traces = database().prepare('SELECT * FROM traces').all();
  const spans = database().prepare('SELECT * FROM trace_spans').all();
  assert.equal(traces.length, 2);
  assert.equal(spans.length, 2);
  assert.notEqual(spans[0].trace_id, spans[1].trace_id);
  assert.equal(
    JSON.parse(String(spans[0].usage_json)).input_tokens_details.cached_tokens,
    20,
  );
  for (const secret of [
    'private-test-credential',
    'private-image',
    'private-reasoning',
    'do-not-store',
  ])
    assert(!JSON.stringify(spans).includes(secret));
  assert(JSON.stringify(spans).includes('Private prompt'));
  await assert.rejects(
    () =>
      auditGeneration({ operation: 'refine' }, () =>
        auditProvider({}, 'azure', 'model', async () => {
          throw new Error('fixture failure');
        }),
      ),
    /fixture failure/,
  );
  assert.equal(
    database()
      .prepare("SELECT count(*) AS n FROM traces WHERE status='error'")
      .get()!.n,
    1,
  );
  process.env.AUDIT_CAPTURE_CONTENT = 'false';
  await auditGeneration({ operation: 'generate' }, async () => {
    await call();
    return structuredClone(fixture);
  });
  const metadataOnly = database()
    .prepare('SELECT * FROM traces ORDER BY rowid DESC LIMIT 1')
    .get()!;
  assert.equal(metadataOnly.output_json, null);
  assert.equal(
    (
      await tracesRoute(
        new Request('http://127.0.0.1/api/traces?id=' + traces[0].id, {
          headers,
        }),
      )
    ).status,
    200,
  );
  assert(
    !auditContent({ image: 'data:image/png;base64,AAAA' }).includes('AAAA'),
  );
  console.log(
    'PASS: local traces, concurrent isolation, model usage, failures, redaction, content opt-out and no telemetry network calls.',
  );

  const activeTopics = getBank()
    .topics.filter((t) => t.status === 'Active')
    .map((t) => ({
      id: t.taxonomy_id,
      module: t.module_id,
      parent: t.parent_id,
      level: t.level,
    }));
  assert(
    configurationIssues(
      { ...fixture.brief, subtopics: [], totalMarks: 0 },
      activeTopics,
    ).every((issue) => issue.recommendation.length > 0),
  );
  assert(
    configurationIssues({ ...fixture.brief, topic: 'EM2-1' }, activeTopics)
      .length,
  );
  assert.equal(loadPrompts('EM1').module, 'EM1');
  assert.equal(loadPrompts('EM2').moduleVersion, null);
  assert.notEqual(loadPrompts('EM1').hash, loadPrompts('EM2').hash);
  assert.throws(() => loadPrompts('../EM1'));
  const ctx = retrieve(fixture.brief);
  const base = ctx.examples.find((q) => q.question_type === 'Written')!;
  assert.equal(
    selectBase(ctx, { mode: 'similar', sourceIds: [base.question_id] })
      ?.question_id,
    base.question_id,
  );
  assert.throws(
    () => selectBase(ctx, { mode: 'similar', sourceIds: ['missing'] }),
    /Recommendation/,
  );
  const selected = new Set(
    Array.from(
      { length: 200 },
      () => selectBase(ctx, { mode: 'similar' })?.question_id,
    ),
  );
  if (ctx.examples.filter((q) => q.question_type === 'Written').length > 1)
    assert(selected.size > 1);
  const received: {
    generation_mode: string;
    base_reference: { id: string };
  }[] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    const payload =
      typeof body.input === 'string'
        ? JSON.parse(body.input)
        : JSON.parse(body.input[0].content[0].text);
    received.push(payload);
    const value =
      body.text.format.name === 'marks_feasibility'
        ? fixture.feasibility
        : body.text.format.name === 'review'
          ? { ...fixture.review, scope_passed: true, format_passed: true }
          : fixture.draft;
    return Response.json({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify(value) }],
        },
      ],
    });
  };
  const similar = await generate(
    'fixture-key',
    fixture.brief,
    undefined,
    '',
    { provider: 'openai' },
    undefined,
    { mode: 'similar', sourceIds: [base.question_id] },
  );
  assert.equal(similar.sourceQuestionId, base.question_id);
  assert.equal(similar.generationMode, 'similar');
  assert(
    received.length >= 3 &&
      received.every(
        (value) =>
          value.generation_mode === 'similar' &&
          value.base_reference.id === base.question_id,
      ),
  );
  const refined = await generate(
    'fixture-key',
    fixture.brief,
    fixture.draft,
    'Keep the task and improve the wording.',
    { provider: 'openai' },
    undefined,
    { sourceQuestionId: base.question_id },
  );
  assert.equal(refined.sourceQuestionId, base.question_id);
  assert.equal(refined.generationMode, 'similar');
  // A model repair must not silently remove the mandatory worksheet answer key.
  let keyReviews = 0;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    const stage = body.text.format.name;
    const value =
      stage === 'marks_feasibility'
        ? fixture.feasibility
        : stage === 'review'
          ? {
              ...fixture.review,
              passed: ++keyReviews > 1,
              scope_passed: true,
              format_passed: true,
              issues: keyReviews === 1 ? ['Clarify the wording.'] : [],
            }
          : {
              ...fixture.draft,
              answer_key: keyReviews ? '' : fixture.draft.answer_key,
            };
    return Response.json({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify(value) }],
        },
      ],
    });
  };
  await assert.rejects(
    () =>
      generate('fixture-key', fixture.brief, undefined, '', {
        provider: 'openai',
      }),
    /revised question is missing its answer key/,
  );
  console.log(
    'PASS: actionable configuration checks, module prompt identity/fallback, random compatible base selection held through planner/author/review.',
  );

  const badForm = new FormData();
  badForm.set('module', 'EM1');
  badForm.set('kind', 'MST');
  badForm.set('academicYear', '2026/2027');
  badForm.set('semester', '1');
  badForm.set('questionPdf', new File(['not a PDF'], 'test.pdf'));
  badForm.set('solutionPdf', new File(['not a PDF'], 'solution.pdf'));
  const authOnly: Record<string, string> = process.env.APP_PASSWORD
    ? { Authorization: headers.Authorization! }
    : {};
  assert.equal(
    (
      await importRoute(
        new Request('http://127.0.0.1/api/imports', {
          method: 'POST',
          headers: authOnly,
          body: badForm,
        }),
      )
    ).status,
    422,
  );
  assert.throws(() => importPaths('../outside'), /Invalid/);
  const id = 'ui-' + crypto.randomUUID();
  database()
    .prepare(
      'INSERT INTO import_jobs(id,module,paper_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    )
    .run(
      id,
      'EM1',
      'fixture-paper',
      'review',
      new Date().toISOString(),
      new Date().toISOString(),
    );
  const { stage } = importPaths(id);
  mkdirSync(stage, { recursive: true });
  const record = {
    id: 'R1',
    paper_id: 'fixture-paper',
    source_question: 'Q1',
    verified: false,
    reviewer_notes: '',
    issues: ['Unresolved'],
  };
  writeFileSync(
    join(stage, 'review.json'),
    JSON.stringify({
      module: { id: 'EM1' },
      records: [record],
      papers: [{ id: 'fixture-paper', verified: false, reviewer_notes: '' }],
    }),
  );
  assert.throws(() => commitImport(id), /Verify every/);
  assert.throws(
    () => saveImportReview(id, [], true, 'Reviewed'),
    /every extracted/,
  );
  assert.equal(getImport(id).review!.records[0].verified, false);
  console.log(
    'PASS: upload format validation, import path containment, record coverage and source approval gates.',
  );
  unlinkSync(join(stage, 'review.json'));
  rmdirSync(stage);
  writeFileSync(
    'test-output/latest-feature-fixtures.json',
    JSON.stringify({ directory }),
  );
} finally {
  closeDatabase();
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env))
    if (!(key in previousEnv)) delete process.env[key];
  Object.assign(process.env, previousEnv);
}

import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import katex from 'katex';
import { briefSchema, reviewSchema } from '../lib/schema';
import {
  resultSchema,
  recordRefinement,
  restoreVersion,
  addQuestions,
  emptyHistory,
  updateQuestion,
  readHistory,
} from '../lib/history';
import { retrieve, sourceQuestions } from '../lib/retrieval';
import { generate, validatePlan } from '../lib/generation';
import { selectBase } from '../lib/similar';
import { formulasForBrief, formulaSource } from '../lib/formula-catalog';
import catalog from '../data/formula-catalog.json';
import {
  listTerminology,
  saveTerminology,
  deleteTerminology,
  terminologyIssues,
} from '../lib/terminology';
import { approveQuestion, getQuestion, listQuestions } from '../lib/repository';
import { saveWorksheet, deleteWorksheet } from '../lib/saved-worksheets';
import { closeDatabase } from '../lib/database';
import { POST as sourceRoute } from '../app/api/source-questions/route';
import { GET as sheetRoute } from '../app/api/formula-sheet/route';
import {
  GET as rulesRoute,
  POST as saveRuleRoute,
} from '../app/api/terminology/route';

process.env.STUDIO_DB_PATH = join(
  mkdtempSync(resolve('test-output/team-')),
  'studio.sqlite',
);
const fetchBefore = globalThis.fetch;
const fixture = resultSchema.parse(
  JSON.parse(readFileSync('test-output/history-fixture.json', 'utf8')),
);
fixture.brief = fixture.effectiveBrief = briefSchema.parse({
  module: 'EM1',
  topic: 'EM1-2',
  subtopics: ['EM1-2.3'],
  questionType: 'Structured',
  totalMarks: 4,
  difficulty: 'Challenging',
  nonRoutine: true,
});
fixture.draft.syllabus_ids = ['EM1-2.3'];
fixture.feasibility = {
  selected_subtopics: ['EM1-2.3'],
  total_marks: 4,
  omitted_subtopics: [],
  marks_reason: '',
  specification_adjustments: [],
  resolved_specifications: '',
};
fixture.draft.question =
  'A complex number has modulus 5 and lies in the first quadrant. Its imaginary part is 4. Determine its Cartesian form.';
fixture.draft.title = 'Interpret a complex number';
fixture.draft.answer_key = '$3+4j$';
fixture.draft.diagrams = [];
fixture.draft.solutions = [
  {
    title: 'Solution',
    content:
      'The real part is positive and equals $\\sqrt{25-16}=3$. Thus $z=3+4j$.',
    marking: [
      {
        part: '',
        criterion:
          'Interpret the quadrant and modulus, form the equation and find z.',
        marks: 4,
      },
    ],
  },
];
const goodReview = {
  passed: true,
  scope_passed: true,
  format_passed: true,
  issues: [],
  summary: 'Fixture review.',
  context_passed: true,
  context_summary: 'Not applicable.',
  scope_evidence: [
    {
      task: 'Select a Cartesian value using polar modulus',
      evidence: 'EM1-2.3 modulus and quadrant definitions.',
    },
  ],
  non_routine_passed: true,
  non_routine_parts: [
    'Standalone task: interpret the modulus and quadrant without a prescribed method.',
  ],
  preservation_passed: true,
  preservation_notes: 'Only requested wording changed.',
};
fixture.review = goodReview;
const request = (body: unknown) =>
  new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
try {
  assert.equal(
    briefSchema.parse({ ...fixture.brief, difficulty: 'Basic', totalMarks: 15 })
      .totalMarks,
    10,
  );
  assert.equal(
    briefSchema.parse({ ...fixture.brief, difficulty: 'Basic' }).nonRoutine,
    false,
  );
  assert.equal(
    briefSchema.parse({
      ...fixture.brief,
      questionType: 'MCQ',
      totalMarks: 10,
      difficulty: 'Basic',
    }).totalMarks,
    2,
  );
  assert.throws(
    () =>
      validatePlan(
        { ...fixture.feasibility, total_marks: 15 },
        retrieve({ ...fixture.brief, difficulty: 'Basic' }),
      ),
    /10 marks/,
  );
  const legacy = resultSchema.parse({
    ...fixture,
    brief: { ...fixture.brief, difficulty: 'Basic' },
    effectiveBrief: { ...fixture.effectiveBrief, difficulty: 'Basic' },
  });
  assert.equal(
    legacy.brief.totalMarks,
    4,
    'Reading legacy results must not rewrite their marks.',
  );
  assert.equal(
    (await approveQuestion(legacy)).marks,
    4,
    'Existing approved Basic drafts remain readable and re-approvable.',
  );

  const revised = recordRefinement(
    fixture,
    {
      ...fixture,
      draft: { ...fixture.draft, title: 'Reworded complex number' },
    },
    'Improve the title only.',
  );
  const restored = restoreVersion(revised, 0);
  assert.deepEqual(restored.draft, fixture.draft);
  assert.equal(restored.previousVersions.length, 2);
  assert.equal(
    restored.previousVersions[1].result.draft.title,
    revised.draft.title,
  );
  assert.equal(fixture.previousVersions.length, 0);
  let history = addQuestions(emptyHistory(), [fixture, fixture, fixture]);
  history = updateQuestion(history, revised);
  assert.equal(history.batches.length, 1);
  assert.equal(history.batches[0].results[1].previousVersions.length, 0);
  assert.deepEqual(
    readHistory(JSON.stringify(history)).batches[0].results[0],
    revised,
  );
  const saved = await approveQuestion(revised);
  closeDatabase();
  assert.deepEqual(
    (await getQuestion(saved.id)).result.previousVersions,
    revised.previousVersions,
  );

  const paper = await saveWorksheet({
    title: 'Worksheet with provenance',
    instructions: 'Answer all questions.',
    includeName: true,
    includeClass: true,
    sections: [
      {
        name: 'Reasoning',
        questions: [{ id: saved.id, revision: saved.revision }],
      },
    ],
  });
  let uses = (await listQuestions()).find(
    (q) => q.id === saved.id,
  )!.worksheets!;
  assert.equal(uses[0].title, paper.title);
  assert.equal(uses[0].section, 'Reasoning');
  await approveQuestion(restored, saved.id, saved.revision);
  uses = (await listQuestions()).find((q) => q.id === saved.id)!.worksheets!;
  assert.equal(
    uses[0].questionRevision,
    1,
    'Worksheet usage preserves the selected earlier revision.',
  );
  await deleteWorksheet(paper.id, paper.revision);
  assert.deepEqual(
    (await listQuestions()).find((q) => q.id === saved.id)!.worksheets,
    [],
  );

  const rule = await saveTerminology({
    module: 'EM1',
    avoid: 'trajectory',
    prefer: 'path',
    reason: 'Preferred assessment wording.',
  });
  assert.equal((await listTerminology('EM1')).length, 1);
  assert.equal((await listTerminology('EM2')).length, 0);
  await assert.rejects(
    () => saveTerminology({ ...rule, avoid: 'TRAJECTORY' }),
    /already exists/,
  );
  await assert.rejects(() => saveTerminology(rule, rule.id, 999), /changed/);
  assert.equal(
    terminologyIssues(
      { ...fixture.draft, question: 'Describe this trajectory clearly.' },
      [rule],
    ).length,
    1,
  );
  assert.equal(
    terminologyIssues(
      { ...fixture.draft, question: 'Describe trajectories clearly.' },
      [rule],
    ).length,
    0,
    'Rules match phrases, not arbitrary substrings.',
  );
  assert.equal(
    (
      await rulesRoute(
        new Request('http://localhost/api/terminology?module=EM1'),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await saveRuleRoute(
        new Request('http://localhost/api/terminology', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://untrusted.example',
          },
          body: JSON.stringify({ rule }),
        }),
      )
    ).status,
    403,
  );

  const ctx = retrieve({
    ...fixture.brief,
    subtopics: ['EM1-2.3', 'EM1-2.4', 'EM1-2.5'],
  });
  const rows = sourceQuestions(ctx.brief);
  const beyond = rows.find(
    (q) =>
      !ctx.examples.some((example) => example.question_id === q.question_id),
  )!;
  assert(
    beyond,
    'Fixture must exercise a source outside the few-shot shortlist.',
  );
  assert.equal(
    selectBase(ctx, { mode: 'similar', sourceQuestionId: beyond.question_id })
      ?.question_id,
    beyond.question_id,
  );
  assert.throws(
    () => selectBase(ctx, { mode: 'similar', sourceQuestionId: 'missing' }),
    /no longer eligible/,
  );
  assert.throws(
    () =>
      selectBase(retrieve({ ...fixture.brief, questionType: 'MCQ' }), {
        mode: 'similar',
        sourceQuestionId: beyond.question_id,
      }),
    /no longer eligible/,
  );
  const sourceResponse = await sourceRoute(request(ctx.brief));
  assert.equal(sourceResponse.status, 200);
  assert(
    (await sourceResponse.json()).references.some(
      (r: { id: string }) => r.id === beyond.question_id,
    ),
  );

  assert.equal(
    createHash('sha256')
      .update(readFileSync('data/' + formulaSource.file))
      .digest('hex'),
    formulaSource.sha256,
  );
  const sheetResponse = await sheetRoute();
  assert.equal(sheetResponse.status, 200);
  assert.equal(sheetResponse.headers.get('content-type'), 'application/pdf');
  for (const entry of catalog.modules.EM1.entries)
    katex.renderToString(entry.latex, { throwOnError: true, strict: 'error' });
  assert.equal(
    formulasForBrief({ module: 'EM2', subtopics: ['EM1-2.3'] }),
    null,
  );
  const formulas = formulasForBrief({ module: 'EM1', subtopics: ['EM1-6.7'] })!;
  assert(formulas.entries.every((e) => /ARCTAN|ARCSIN/.test(e.id)));
  assert(!JSON.stringify(formulas.entries).includes('Laplace'));

  // Every quality failure triggers a bounded repair even if the reviewer says passed=true.
  for (const failure of [
    'context_passed',
    'preservation_passed',
    'non_routine_passed',
    'scope_evidence',
    'terminology',
  ] as const) {
    let reviews = 0,
      authors = 0;
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init!.body as string),
        stage = body.text.format.name;
      const input = JSON.parse(
        typeof body.input === 'string'
          ? body.input
          : body.input[0].content[0].text,
      );
      assert(
        input.saved_terminology_rules.some(
          (r: { id: string }) => r.id === rule.id,
        ),
      );
      assert(
        input.previous,
        'The planner, author, repair and reviewer all need the baseline.',
      );
      assert.equal(input.edit, 'Improve wording only.');
      assert(body.instructions.includes('surgical'));
      let value: unknown = fixture.feasibility;
      if (stage === 'review') {
        reviews++;
        value = {
          ...goodReview,
          ...(reviews === 1 && failure !== 'terminology'
            ? { [failure]: failure === 'scope_evidence' ? [] : false }
            : {}),
        };
      } else if (stage === 'module_question') {
        authors++;
        value = {
          ...fixture.draft,
          question:
            failure === 'terminology' && authors === 1
              ? 'Determine the trajectory of this complex number.'
              : fixture.draft.question,
        };
      }
      return Response.json({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: JSON.stringify(value) }],
          },
        ],
      });
    };
    const result = await generate(
      'fixture',
      fixture.brief,
      fixture.draft,
      'Improve wording only.',
    );
    assert(result.review.passed);
    assert.equal(authors, 2);
    assert.equal(reviews, 2);
  }
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string),
      stage = body.text.format.name;
    const input = JSON.parse(
      typeof body.input === 'string'
        ? body.input
        : body.input[0].content[0].text,
    );
    assert.equal(input.base_reference.id, beyond.question_id);
    assert.deepEqual(input.similar_variation, {
      numbers: false,
      context: true,
    });
    assert(input.available_formula_sheet.entries.length);
    calls++;
    const value =
      stage === 'marks_feasibility'
        ? { ...fixture.feasibility, selected_subtopics: ctx.brief.subtopics }
        : stage === 'review'
          ? goodReview
          : { ...fixture.draft, syllabus_ids: ctx.brief.subtopics };
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
    'fixture',
    { ...ctx.brief, useFormulaSheet: true },
    undefined,
    '',
    {},
    undefined,
    {
      mode: 'similar',
      sourceQuestionId: beyond.question_id,
      variation: { numbers: false, context: true },
    },
  );
  assert.equal(similar.sourceQuestionId, beyond.question_id);
  assert(similar.formulaSheet);
  assert.equal(calls, 3);
  assert(
    !reviewSchema.safeParse({
      passed: true,
      scope_passed: true,
      format_passed: true,
      issues: [],
      summary: 'Missing quality checks',
    }).success,
  );
  await deleteTerminology(rule.id, rule.revision);
  assert.equal((await listTerminology('EM1')).length, 0);
  console.log(
    'PASS: Basic/MCQ marks, legacy compatibility, revision comparison/restore/persistence, worksheet usage, shared terminology/concurrency, full source browsing, selected-base binding, formula PDF/hash/LaTeX/scope filtering, and independent quality repair gates.',
  );
} finally {
  globalThis.fetch = fetchBefore;
  closeDatabase();
}

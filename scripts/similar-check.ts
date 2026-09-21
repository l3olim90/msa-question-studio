import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceQuestions, retrieve } from '../lib/retrieval';
import { sourceRequest, sourceMarkTotal } from '../lib/source-selection';
import { similarBrief, selectBase, refinementSource } from '../lib/similar';
import { generateMcqCandidates } from '../lib/candidates';
import { generate, validatePlan } from '../lib/generation';
import { resultSchema, recordRefinement } from '../lib/history';
import {
  approveQuestion,
  getQuestion,
  deleteQuestion,
} from '../lib/repository';
import { closeDatabase } from '../lib/database';
import { POST as browse } from '../app/api/source-questions/route';
import { briefSchema } from '../lib/schema';

const filter = {
  module: 'EM1',
  questionType: 'Structured' as const,
  topic: 'EM1-2',
  difficulty: 'Basic' as const,
};
const originalFetch = globalThis.fetch;
try {
  const basic = sourceQuestions(filter);
  assert(basic.length > 0);
  assert(
    basic.every(
      (q) =>
        q.module_id === filter.module &&
        q.topic_id === filter.topic &&
        q.question_type === 'Written' &&
        q.perceived_difficulty === filter.difficulty,
    ),
  );
  const stale = {
    ...filter,
    subtopics: [],
    totalMarks: -100,
    partCount: 100,
    specifications: 'stale'.repeat(1000),
  };
  assert.deepEqual(
    sourceQuestions(stale),
    basic,
    'Hidden inputs must not narrow or block source browsing.',
  );
  assert.equal(sourceRequest(stale), sourceRequest(filter));
  assert.notEqual(
    sourceRequest(filter),
    sourceRequest({ ...filter, difficulty: 'Challenging' }),
  );
  assert.throws(
    () => sourceQuestions({ ...filter, module: 'EM2' }),
    /active topic/,
  );
  assert.throws(() => sourceQuestions({ ...filter, difficulty: 'Hard' }));
  const challenging = sourceQuestions({ ...filter, difficulty: 'Challenging' });
  assert(
    challenging.length &&
      challenging.every((q) => q.perceived_difficulty === 'Challenging'),
  );
  assert.throws(
    () =>
      selectBase(
        { brief: filter },
        { mode: 'similar', sourceQuestionId: challenging[0].question_id },
      ),
    /no longer matches/,
  );
  const basicMcqs = sourceQuestions({ ...filter, questionType: 'MCQ' });
  assert(
    basicMcqs.length &&
      basicMcqs.every(
        (q) => q.perceived_difficulty === 'Basic' && q.question_type === 'MCQ',
      ),
  );
  const empty = await browse(
    new Request('http://localhost/api/source-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...filter,
        topic: 'EM1-3',
        questionType: 'MCQ',
        difficulty: 'Challenging',
      }),
    }),
  );
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).references, []);
  const response = await browse(
    new Request('http://localhost/api/source-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stale),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).references.length, basic.length);

  const base = basic.find((q) => q.question_marks === '4')!;
  assert(base);
  const selected = similarBrief(stale, false, base);
  assert.equal(selected.totalMarks, 4);
  assert.equal(selected.difficulty, 'Basic');
  assert(selected.subtopics.includes(base.subtopic_id));
  assert.equal(selected.specifications, '');
  assert.equal(
    briefSchema.parse({ ...selected, totalMarks: 4 }).totalMarks,
    10,
    'New Basic questions still total 10.',
  );
  assert.equal(sourceMarkTotal('3.5'), 3.5);
  assert.equal(sourceMarkTotal(''), null);
  const fractional = sourceQuestions({ ...filter, topic: 'EM1-6' }).find(
    (q) => q.question_marks === '3.5',
  )!;
  assert(fractional);
  const fractionalBrief = similarBrief(
    { ...filter, topic: 'EM1-6' },
    false,
    fractional,
  );
  assert.equal(retrieve(fractionalBrief, true).brief.totalMarks, 3.5);
  const policy = { mode: 'similar', refining: false, sourceMarks: 4 };
  const plan = {
    selected_subtopics: selected.subtopics,
    total_marks: 4,
    difficulty: 'Basic',
    omitted_subtopics: [],
    marks_reason: '',
    specification_adjustments: [],
    resolved_specifications: '',
  };
  const ctx = retrieve(selected, true);
  validatePlan(plan, ctx, policy);
  assert.throws(
    () => validatePlan({ ...plan, total_marks: 10 }, ctx, policy),
    /retain the source marks/,
  );
  assert.throws(
    () => validatePlan({ ...plan, difficulty: 'Challenging' }, ctx, policy),
    /retain the selected difficulty/,
  );
  validatePlan(
    {
      ...plan,
      total_marks: 6,
      marks_reason: 'Source marks missing; assigned for the work.',
    },
    ctx,
    { ...policy, sourceMarks: null },
  );
  validatePlan(
    {
      ...plan,
      total_marks: 8,
      difficulty: 'Challenging',
      marks_reason: 'Explicitly requested refinement.',
    },
    ctx,
    { ...policy, refining: true },
  );

  const fixture = resultSchema.parse(
    JSON.parse(readFileSync('test-output/history-fixture.json', 'utf8')),
  );
  const goodReview = {
    passed: true,
    scope_passed: true,
    format_passed: true,
    issues: [],
    summary: 'Fixture review.',
    context_passed: true,
    context_summary: 'No context.',
    scope_evidence: [
      { task: 'Fixture task', evidence: 'Source scope retained.' },
    ],
    non_routine_passed: true,
    non_routine_parts: [],
    preservation_passed: true,
    preservation_notes: 'Only the requested change.',
  };
  let change: {
    marks?: number;
    difficulty?: 'Basic' | 'Intermediate' | 'Challenging';
  } = {};
  const received: {
    base_reference: { id: string };
    source_marks: number | null;
    references?: { id: string }[];
    reference_examples?: { id: string }[];
  }[] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    const payload = JSON.parse(
      typeof body.input === 'string'
        ? body.input
        : body.input[0].content[0].text,
    );
    received.push(payload);
    const brief = payload.brief;
    const value =
      body.text.format.name === 'marks_feasibility'
        ? {
            ...plan,
            selected_subtopics: brief.subtopics,
            total_marks: change.marks ?? brief.totalMarks,
            difficulty: change.difficulty ?? brief.difficulty,
            marks_reason: change.marks
              ? 'Assigned or changed as requested.'
              : '',
            specification_adjustments: change.difficulty
              ? ['User requested a difficulty change.']
              : [],
          }
        : body.text.format.name === 'review'
          ? goodReview
          : {
              ...fixture.draft,
              title: 'Source adaptation fixture',
              answer_key: '$5$',
              question: `For candidate ${payload.candidate_context?.index ?? 1}, given a complex number $z=3+4j$, determine its modulus.`,
              question_type: brief.questionType,
              parts: [],
              diagrams: [],
              options:
                brief.questionType === 'MCQ'
                  ? ['5', '6', '7', '8'].map((text, index) => ({
                      label: 'ABCD'[index],
                      text,
                    }))
                  : [],
              correct_option: brief.questionType === 'MCQ' ? 'A' : null,
              total_marks: brief.totalMarks,
              syllabus_ids: brief.subtopics,
              solutions: [
                {
                  title: 'Solution',
                  content: 'The modulus is $\\sqrt{3^2+4^2}=5$.',
                  marking: [
                    {
                      part: '',
                      criterion: 'Correct calculation.',
                      marks: brief.totalMarks,
                    },
                  ],
                },
              ],
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
  const options = {
    mode: 'similar' as const,
    sourceQuestionId: base.question_id,
  };
  const first = resultSchema.parse(
    await generate('fixture', stale, undefined, '', {}, undefined, options),
  );
  assert.equal(first.draft.total_marks, 4);
  assert.equal(first.effectiveBrief.difficulty, 'Basic');
  assert.deepEqual(first.references.map(ref => ref.id), [base.question_id]);
  assert.equal(first.exactExamples, 1);
  await assert.rejects(() => generate('fixture', first.effectiveBrief, first.draft, 'Clarify the wording.', {}, undefined, { sourceQuestionId: 'missing-source' }), { status: 422 });
  for (const input of received) {
    for (const key of ['references', 'reference_examples'] as const) {
      if (input[key]) assert.deepEqual(input[key].map((ref: {id:string}) => ref.id), [base.question_id]);
    }
  }
  assert(
    received.every(
      (input) =>
        input.base_reference.id === base.question_id &&
        input.source_marks === 4,
    ),
  );
  change = { marks: 8, difficulty: 'Challenging' };
  const revised = resultSchema.parse(
    await generate(
      'fixture',
      first.effectiveBrief,
      first.draft,
      'Make this Challenging and worth 8 marks.',
      {},
      undefined,
      { sourceQuestionId: base.question_id },
    ),
  );
  assert.equal(revised.effectiveBrief.totalMarks, 8);
  assert.equal(revised.effectiveBrief.difficulty, 'Challenging');
  assert.deepEqual(revised.references.map(ref => ref.id), [base.question_id]);
  assert.equal(
    refinementSource(revised.effectiveBrief, base.question_id)?.question_id,
    base.question_id,
  );
  change = {};
  const wording = resultSchema.parse(
    await generate(
      'fixture',
      revised.effectiveBrief,
      revised.draft,
      'Clarify the wording only.',
      {},
      undefined,
      { sourceQuestionId: base.question_id },
    ),
  );
  assert.equal(wording.effectiveBrief.totalMarks, 8);
  assert.equal(wording.effectiveBrief.difficulty, 'Challenging');
  assert.equal(received.at(-1)!.base_reference.id, base.question_id);
  const approved = await approveQuestion(
    recordRefinement(
      first,
      revised,
      'Make this Challenging and worth 8 marks.',
    ),
  );
  const reopened = await getQuestion(approved.id);
  assert.equal(reopened.result.effectiveBrief.difficulty, 'Challenging');
  assert.equal(reopened.result.previousVersions[0].result.draft.total_marks, 4);
  await deleteQuestion(approved.id, approved.revision);

  change = {};
  const mcqCandidates = await generateMcqCandidates(
    'fixture',
    { ...filter, questionType: 'MCQ', subtopics: [], totalMarks: -20 },
    {},
    { mode: 'similar', sourceQuestionId: basicMcqs[0].question_id },
  );
  assert.equal(mcqCandidates.candidates.length, 3);
  assert(
    mcqCandidates.candidates.every(
      (candidate) =>
        candidate.effectiveBrief.difficulty === 'Basic' &&
        candidate.effectiveBrief.totalMarks === 2 &&
        candidate.sourceQuestionId === basicMcqs[0].question_id,
    ),
  );
  assert(mcqCandidates.candidates.every(candidate => candidate.references.length === 1 && candidate.references[0].id === basicMcqs[0].question_id));
  const unmarkedFilter = { ...filter, topic: 'EM1-3' };
  const unmarked = sourceQuestions(unmarkedFilter).find(
    (q) => !q.question_marks,
  )!;
  change = { marks: 6 };
  const assigned = await generate(
    'fixture',
    unmarkedFilter,
    undefined,
    '',
    {},
    undefined,
    { mode: 'similar', sourceQuestionId: unmarked.question_id },
  );
  assert.equal(
    assigned.draft.total_marks,
    6,
    'AI may assign marks when the source has none, including Basic sources.',
  );
  assert.equal(received.at(-1)!.source_marks, null);
  assert.equal(assigned.effectiveBrief.difficulty, 'Basic');
  console.log(
    'PASS: four-field source filters, hidden-input isolation, source/Basic/fractional marks, source difficulty, unmarked AI allocation, explicit mark/difficulty refinements, provenance and history persistence.',
  );
} finally {
  globalThis.fetch = originalFetch;
  closeDatabase();
}

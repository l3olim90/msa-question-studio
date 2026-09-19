import { withBank, referenceImage } from './bank-data';
import { loadPrompts } from './prompts';
import { recordPrompt } from './observability';
import { reviewWithCalculations } from './review-calculations';
import { repairDraftMath } from './math-repair';
import { moduleFor } from './modules';
import { layoutLabels } from './label-layout';
import { desmosExpressions } from './desmos';
import { renderGraphShapes } from './graph';
import {
  providerResponse,
  connectionSchema,
  modelFor,
  type Connection,
} from './providers';
import {
  draftSchema,
  reviewSchema,
  feasibilitySchema,
  jsonSchema,
  type Draft,
} from './schema';
import { retrieve, references } from './retrieval';
import { calculate } from './calculator';
import { selectBase, similarBrief, type GenerationOptions } from './similar';
import katex from 'katex';
// Hidden new-question controls must not constrain similar or MCQ authoring.
function authoringBrief(brief: ReturnType<typeof retrieve>['brief'], mode: 'new' | 'similar') {
  if (mode === 'similar') {
    const { creativeContext: _creative, multipleParts: _multiple, autoParts: _auto, partCount: _count, ...sourceBrief } = brief;
    return sourceBrief;
  }
  const { multipleParts, partCount: _partCount, ...common } = brief;
  return brief.questionType === 'MCQ'
    ? common
    : brief.autoParts
      ? { ...common, multipleParts }
      : brief;
}
export class DraftReviewError extends Error {}
export const MODEL = 'gpt-5.6-sol';
export { mathParts } from './math-text';
import { mathParts, repairMathValues, repairLatex } from './math-text';

export function validateDraft(
  value: unknown,
  ctx: ReturnType<typeof retrieve>,
  mode: 'new' | 'similar' = 'new',
) {
  const d = draftSchema.parse(repairMathValues(value));
  for (const diagram of d.diagrams) {
    for (const shape of diagram.shapes) {
      if (shape.type === 'math') {
        shape.text = repairLatex(shape.text);
        katex.renderToString(shape.text, {
          throwOnError: true,
          strict: 'ignore',
        });
      }
    }
    for (const shape of diagram.shapes)
      if (
        shape.type === 'curve' &&
        (shape.points.length < 4 || (shape.points.length - 1) % 3 !== 0)
      )
        throw new Error(
          'A curve needs a start point and cubic control-point triples.',
        );
    if (diagram.graph) {
      desmosExpressions(diagram.graph);
      diagram.shapes = renderGraphShapes(diagram.graph);
    } else if (!diagram.shapes.length)
      throw new Error('A diagram needs shapes or a graph specification.');
    else diagram.shapes = layoutLabels(diagram.shapes);
  }
  if (d.question_type !== ctx.brief.questionType)
    throw new Error('The generated question type does not match the brief.');
  if (ctx.brief.questionType === 'MCQ') {
    if (
      d.total_marks !== 2 ||
      d.parts.length ||
      d.options.length !== 4 ||
      d.options.map((o) => o.label).join('') !== 'ABCD' ||
      !d.correct_option ||
      d.solutions.length !== 1 ||
      d.solutions[0].marking.length !== 1 ||
      d.solutions[0].marking[0].marks !== 2
    )
      throw new Error(
        'An MCQ must have four options, one correct answer and a single 2-or-0 award.',
      );
  } else {
    if (
      d.options.length ||
      d.correct_option !== null ||
      new Set(d.parts.map((p) => p.label)).size !== d.parts.length
    )
      throw new Error('A structured question must have unique part labels, no MCQ options and no correct-option selection.');
    if (mode !== 'similar' &&
      (ctx.brief.multipleParts && ctx.brief.autoParts
        ? d.parts.length < 2 || d.parts.length > 6
        : d.parts.length !==
          (ctx.brief.multipleParts ? ctx.brief.partCount : 0))
    )
      throw new Error(
        'The structured question does not match the requested part count.',
      );
  }
  const ids = new Set([ctx.topic.taxonomy_id, ...ctx.allowed.map((t) => t.id)]);
  if (
    ctx.subs.some((sub) => !d.syllabus_ids.includes(sub.taxonomy_id)) ||
    d.syllabus_ids.some((id) => !ids.has(id))
  )
    throw new Error('The draft does not match the selected syllabus scope.');
  if (d.total_marks !== ctx.brief.totalMarks)
    throw new Error(
      'The generated total does not match the requested marks. Please retry.',
    );
  for (const sol of d.solutions)
    if (
      Math.abs(sol.marking.reduce((n, m) => n + m.marks, 0) - d.total_marks) >
      1e-6
    )
      throw new Error('The marks do not add up for every solution.');
  for (const text of [
    d.question,
    d.answer_key,
    ...d.parts.map((p) => p.prompt),
    ...d.options.map((o) => o.text),
    ...d.solutions.flatMap((s) => [
      s.content,
      ...s.marking.map((m) => m.criterion),
    ]),
  ])
    for (const m of mathParts(text))
      katex.renderToString(m.latex, { throwOnError: true, strict: 'ignore' });
  return d;
}
function readJSON(r: any) {
  const text = r.output
    ?.flatMap((x: any) => x.content || [])
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('');
  if (!text)
    throw new Error(
      'The model did not return a draft. It may have declined the request.',
    );
  return JSON.parse(text);
}
async function generateInBank(
  key: string,
  raw: unknown,
  previous?: unknown,
  edit = '',
  settings: Partial<Connection> = {},
  candidateContext?: { index: number; prior: Draft[] },
  options: GenerationOptions = {},
) {
  const mode = options.mode === 'similar' || (previous && options.sourceQuestionId) ? 'similar' : 'new';
  const requested = retrieve(mode === 'similar' ? similarBrief(raw, !!previous) : raw);
  const base = previous
    ? requested.examples.find((q) => q.question_id === options.sourceQuestionId)
    : selectBase(requested, options);
  const generationContext = {
    generation_mode:
      base || (previous && options.sourceQuestionId) ? 'similar' : 'new',
    base_reference: base ? promptExamples([base])[0] : null,
  };
  const prompts = loadPrompts(requested.brief.module);
  await recordPrompt(prompts.version, prompts.hash, requested.brief.module);
  const structuredTargetContract = prompts.text.structured_contract;
  const connection = {
    ...connectionSchema.parse(settings),
    apiVersion: settings.apiVersion,
  };
  const response = (key: string, body: any) =>
    providerResponse(key, body, connection);
  let ctx = requested;
  let refs = references(ctx);
  const calcLog: { expression: string; result: string }[] = [];
  const cached = new Map<string, string>();
  let attempted = 0,
    repeats = 0;
  const instructions =
    'Module conventions: ' +
    moduleFor(ctx.brief.module).notation +
    ' ' +
    structuredTargetContract +
    ' ' +
    prompts.text.author +
    ' ' +
    prompts.moduleContext +
    ' ' +
    prompts.text.similar;
  let input: any[] = [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: JSON.stringify({
            ...generationContext,
            user_instructions: prompts.text.user_context,
            candidate_context: candidateContext
              ? {
                  index: candidateContext.index,
                  prior: candidateContext.prior.map((d) => ({
                    question: d.question,
                    options: d.options,
                  })),
                }
              : null,
            brief: authoringBrief(ctx.brief, mode),
            selected_subtopics: ctx.subs.map((s) => ({
              id: s.taxonomy_id,
              name: s.name,
            })),
            syllabus: ctx.subs.map((s) => ({
              id: s.taxonomy_id,
              excerpt: s.syllabus_excerpt,
            })),
            allowed_same_topic_prerequisites: ctx.allowed,
            references: promptExamples(ctx.examples),
            previous: previous ? draftSchema.parse(previous) : null,
            edit: edit.slice(0, 3000),
          }),
        },
        ...(await Promise.all(refs.map(async (ref) => ({...ref, images: await Promise.all(ref.images.map(async img => ({...img, url: await referenceImage(img.name, img.url)})))})))).flatMap((ref) =>
          ref.images.flatMap((img) => [
            {
              type: 'input_text',
              text: `Source diagram: ${ref.id} / ${img.name}`,
            },
            { type: 'input_image', image_url: img.url, detail: 'high' },
          ]),
        ),
      ],
    },
  ];
  const planInstructions =
    prompts.text.planner +
    ' ' +
    prompts.moduleContext +
    ' ' +
    prompts.text.similar;
  const planBody = {
    instructions: planInstructions,
    input: JSON.stringify({
      ...generationContext,
      user_instructions: prompts.text.user_context,
      brief: authoringBrief(ctx.brief, mode),
      edit,
      candidate_context: candidateContext
        ? {
            index: candidateContext.index,
            prior: candidateContext.prior.map((d) => ({
              question: d.question,
              options: d.options,
            })),
          }
        : null,
      syllabus: ctx.subs.map((s) => ({
        id: s.taxonomy_id,
        name: s.name,
        excerpt: s.syllabus_excerpt,
      })),
      references: promptExamples(ctx.examples),
    }),
    text: {
      format: {
        type: 'json_schema',
        name: 'marks_feasibility',
        strict: true,
        schema: jsonSchema(feasibilitySchema),
      },
    },
  };
  let feasibility = validatePlan(
    readJSON(await response(key, planBody)),
    requested,
  );
  if (feasibility.total_marks !== requested.brief.totalMarks) {
    // Reconsider every proposed marks change before accepting a departure from the user's priority.
    feasibility = validatePlan(
      readJSON(
        await response(key, {
          ...planBody,
          instructions: planInstructions + ' ' + prompts.text.reconsider_marks,
          input: [
            input[0],
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: JSON.stringify({ proposed_plan: feasibility }),
                },
              ],
            },
          ],
        }),
      ),
      requested,
    );
  }
  ctx = retrieve({
    ...requested.brief,
    subtopics: feasibility.selected_subtopics,
    totalMarks: feasibility.total_marks,
    specifications: feasibility.resolved_specifications,
  });
  // Planning can narrow coverage; preserve the originally selected base and its diagrams.
  if (base && !ctx.examples.some((q) => q.question_id === base.question_id))
    ctx.examples = [base, ...ctx.examples].slice(0, 6);
  refs = references(ctx);
  input = [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: JSON.stringify({
            ...generationContext,
            user_instructions: prompts.text.user_context,
            candidate_context: candidateContext
              ? {
                  index: candidateContext.index,
                  prior: candidateContext.prior.map((d) => ({
                    question: d.question,
                    options: d.options,
                  })),
                }
              : null,
            brief: authoringBrief(ctx.brief, mode),
            selected_subtopics: ctx.subs.map((s) => ({
              id: s.taxonomy_id,
              name: s.name,
            })),
            syllabus: ctx.subs.map((s) => ({
              id: s.taxonomy_id,
              excerpt: s.syllabus_excerpt,
            })),
            allowed_same_topic_prerequisites: ctx.allowed,
            references: promptExamples(ctx.examples),
            previous: previous ? draftSchema.parse(previous) : null,
            edit: edit.slice(0, 3000),
            configuration_adjustments: feasibility,
          }),
        },
        ...(await Promise.all(refs.map(async (ref) => ({...ref, images: await Promise.all(ref.images.map(async img => ({...img, url: await referenceImage(img.name, img.url)})))})))).flatMap((ref) =>
          ref.images.flatMap((img) => [
            {
              type: 'input_text',
              text: `Source diagram: ${ref.id} / ${img.name}`,
            },
            { type: 'input_image', image_url: img.url, detail: 'high' },
          ]),
        ),
      ],
    },
  ];
  const format = {
    type: 'json_schema',
    name: 'module_question',
    strict: true,
    schema: jsonSchema(draftSchema),
  };
  const validateAuthored = async (value: unknown) => {
    try {
      return await repairDraftMath(
        value,
        (v) => validateDraft(v, ctx, mode),
        async (draft, issue) =>
          readJSON(
            await response(key, {
              instructions: instructions + ' ' + prompts.text.format_repair,
              input: [
                input[0],
                {
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: JSON.stringify({ draft, formatting_error: issue }),
                    },
                  ],
                },
              ],
              text: { format },
            }),
          ),
      );
    } catch (error) {
      if ((error as Error).name === 'ParseError')
        throw new DraftReviewError(
          'The candidate still contains invalid mathematical notation after a formatting repair.',
        );
      throw error;
    }
  };
  let draft: Draft | undefined;
  for (let round = 0; round < 8; round++) {
    const r = await response(key, {
      instructions,
      input,
      text: { format },
      tools: [
        {
          type: 'function',
          name: 'calculate',
          description: prompts.text.author_calculator,
          strict: true,
          parameters: {
            type: 'object',
            properties: { expression: { type: 'string' } },
            required: ['expression'],
            additionalProperties: false,
          },
        },
      ],
    });
    const calls = r.output.filter((o: any) => o.type === 'function_call');
    if (!calls.length) {
      draft = await validateAuthored(readJSON(r));
      break;
    }
    input.push(...r.output);
    for (const call of calls) {
      let result,
        expression = 'Invalid tool arguments';
      attempted++;
      try {
        expression = JSON.parse(call.arguments).expression;
        if (cached.has(expression)) {
          result = cached.get(expression)!;
          repeats++;
        } else if (attempted > 24) {
          result =
            'Calculator budget reached. Complete the draft using existing results.';
        } else {
          try {
            result = calculate(expression);
          } catch (e) {
            result = `Calculation failed: ${(e as Error).message}. Rewrite using a single supported expression; no assignments.`;
          }
          cached.set(expression, result);
          calcLog.push({ expression, result });
        }
      } catch (e) {
        result = `Calculation failed: ${(e as Error).message}`;
        calcLog.push({ expression, result });
      }
      input.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: result,
      });
    }
    if (attempted >= 24 || repeats >= 2) break;
  }
  if (!draft) {
    const r = await response(key, {
      instructions: instructions + ' ' + prompts.text.author_finalize,
      input: [
        input[0],
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                calculator_results: calcLog,
                requirement:
                  'Complete the draft now. Keep the original brief, syllabus and references.',
              }),
            },
          ],
        },
      ],
      text: { format },
    });
    draft = await validateAuthored(readJSON(r));
  }
  if (
    base &&
    draft.question.replace(/\s+/g, ' ').trim() ===
      base.question.replace(/\s+/g, ' ').trim()
  )
    throw new DraftReviewError(
      'The similar question repeated its source. Retry to generate a fresh variation.',
    );
  if (!draft.answer_key.trim())
    throw new DraftReviewError(
      'The generated question is missing its answer key. Retry to generate a complete question.',
    );
  let currentCalculations: { expression: string; result: string }[] = [];
  const reviewDraft = async () => {
    const reviewed = await reviewWithCalculations(
      (body) => response(key, body),
      {
        instructions:
          prompts.text.review +
          ' ' +
          structuredTargetContract +
          ' ' +
          prompts.moduleContext +
          ' ' +
          prompts.text.similar,
        input: JSON.stringify({
          candidate_context: candidateContext
            ? {
                index: candidateContext.index,
                prior: candidateContext.prior.map((d) => ({
                  question: d.question,
                  options: d.options,
                })),
              }
            : null,
          brief: authoringBrief(ctx.brief, mode),
          ...generationContext,
          requested_brief: authoringBrief(requested.brief, mode),
          configuration_plan: feasibility,
          reference_examples: promptExamples(ctx.examples),
          syllabus: ctx.subs.map((s) => ({
            id: s.taxonomy_id,
            excerpt: s.syllabus_excerpt,
          })),
          draft,
          authoring_calculation_history: calcLog,
        }),
        text: {
          format: {
            type: 'json_schema',
            name: 'review',
            strict: true,
            schema: jsonSchema(reviewSchema),
          },
        },
      },
      prompts,
    );
    currentCalculations = reviewed.calculations;
    const checked = reviewSchema.parse(readJSON(reviewed.response));
    const shadingRequested = /\bshad(?:ed|ing)\b/i.test(
      requested.brief.specifications +
        ' ' +
        edit +
        ' ' +
        draft!.question +
        ' ' +
        draft!.parts.map((p) => p.prompt).join(' '),
    );
    if (
      shadingRequested &&
      (/\b(?:graph|curve|integral|area)\b/i.test(
        requested.brief.specifications + ' ' + edit,
      ) ||
        draft!.diagrams.some((d) => d.graph)) &&
      !draft!.diagrams.some(
        (d) => d.placement === 'question' && d.graph?.regions.length,
      )
    ) {
      checked.passed = false;
      checked.format_passed = false;
      checked.issues.push(
        'The requested student-facing shaded graph is missing. Add a question-placement graph with valid graph.regions boundaries and interval.',
      );
    }
    return checked;
  };
  let review = await reviewDraft();
  const repairLimit = ctx.brief.questionType === 'Structured' ? 2 : 1;
  for (
    let repair = 0;
    (!review.passed || !review.scope_passed || !review.format_passed) &&
    repair < repairLimit;
    repair++
  ) {
    const strategy = repair === 0 ? prompts.text.repair : prompts.text.reauthor;
    const repaired = await response(key, {
      instructions:
        instructions + ' ' + strategy + ' ' + prompts.text.repair_checks,
      input: [
        input[0],
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                draft,
                review,
                current_draft_calculations: currentCalculations,
                authoring_calculation_history: calcLog,
              }),
            },
          ],
        },
      ],
      text: { format },
    });
    draft = await validateAuthored(readJSON(repaired));
    review = await reviewDraft();
  }
  if (!review.passed || !review.scope_passed || !review.format_passed)
    throw new DraftReviewError(
      'The question could not pass the module-scope and question-format checks after revision. ' +
        review.issues.slice(0, 3).join(' '),
    );

  if (!draft.answer_key.trim())
    throw new DraftReviewError(
      'The revised question is missing its answer key. Retry to generate a complete question.',
    );

  if (
    base &&
    draft.question.replace(/\s+/g, ' ').trim() ===
      base.question.replace(/\s+/g, ' ').trim()
  )
    throw new DraftReviewError(
      'The similar question repeated its source. Retry to generate a fresh variation.',
    );

  return {
    draft,
    generationMode: (base || (previous && options.sourceQuestionId)
      ? 'similar'
      : 'new') as 'new' | 'similar',
    sourceQuestionId:
      base?.question_id || (previous ? options.sourceQuestionId : undefined),
    promptModule: prompts.module,
    promptVersion: prompts.version,
    promptHash: prompts.hash,
    references: refs,
    review,
    feasibility,
    calculations: currentCalculations,
    calculationHistory: calcLog,
    exactExamples: ctx.exactCount,
    provider: connection.provider,
    model: modelFor(connection),
    reasoning: 'high',
    brief: requested.brief,
    effectiveBrief: {
      ...ctx.brief,
      partCount:
        ctx.brief.multipleParts && ctx.brief.autoParts
          ? draft.parts.length
          : ctx.brief.partCount,
    },
  };
}

export function validatePlan(value: unknown, ctx: ReturnType<typeof retrieve>) {
  const plan = feasibilitySchema.parse(value);
  if (ctx.brief.questionType === 'MCQ' && plan.total_marks !== 2)
    throw new Error('MCQ plans must retain exactly 2 marks.');
  const requested = new Set(ctx.brief.subtopics);
  const chosen = new Set(plan.selected_subtopics);
  const omitted = new Set(plan.omitted_subtopics.map((s) => s.id));
  if (
    chosen.size !== plan.selected_subtopics.length ||
    omitted.size !== plan.omitted_subtopics.length ||
    [...chosen].some((id) => !requested.has(id)) ||
    [...omitted].some((id) => !requested.has(id) || chosen.has(id)) ||
    [...requested].some((id) => !chosen.has(id) && !omitted.has(id))
  )
    throw new Error(
      'The configuration plan did not account for the selected sub-topics. Please retry.',
    );
  if (plan.total_marks !== ctx.brief.totalMarks && !plan.marks_reason.trim())
    throw new Error(
      'The configuration plan did not explain the marks change. Please retry.',
    );
  return plan;
}

export function promptExamples(rows: ReturnType<typeof retrieve>['examples']) {
  return rows.map((q) => ({
    id: q.question_id,
    source: `${q.paper_type} ${q.academic_year} S${q.semester} ${q.source_question}`,
    question: q.question,
    solution: q.solution,
    alternatives: [
      q.alternative_solution_1,
      q.alternative_solution_2,
      q.alternative_solution_3,
    ].filter(Boolean),
    marking_scheme_json: q.marking_scheme_json,
    alternative_marking: [
      q.alternative_marking_scheme_1_json,
      q.alternative_marking_scheme_2_json,
      q.alternative_marking_scheme_3_json,
    ],
    marks: q.question_marks,
    difficulty: q.perceived_difficulty,
    subtopics: [q.subtopic_id, ...q.additional_subtopic_ids_json],
  }));
}

export function generate(...args: Parameters<typeof generateInBank>) { return withBank(() => generateInBank(...args)); }

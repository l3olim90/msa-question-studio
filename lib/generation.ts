import { withBank, referenceImage } from './bank-data';
import { loadPrompts } from './prompts';
import { recordPrompt } from './observability';
import { reviewWithCalculations } from './review-calculations';
import { repairDraftMath } from './math-repair';
import { moduleFor } from './modules';
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
  generationPlanSchema,
  jsonSchema,
  type Draft,
} from './schema';
import { retrieve, references } from './retrieval';
import { calculate } from './calculator';
import { selectBase, similarBrief, refinementSource, type GenerationOptions } from './similar';
import { sourceMarkTotal } from './source-selection';
import { listTerminology, terminologyIssues } from './terminology';
import { formulasForBrief } from './formula-catalog';
import { verifyFormulaSource } from './formula-source';
import { assertProfessionalContent } from './content-safety';
import { HttpError } from './security';
// Hidden new-question controls must not constrain similar or MCQ authoring.
function authoringBrief(
  brief: ReturnType<typeof retrieve>['brief'],
  mode: 'new' | 'similar',
) {
  if (mode === 'similar') {
    const {
      creativeContext: _creative,
      multipleParts: _multiple,
      autoParts: _auto,
      partCount: _count,
      ...sourceBrief
    } = brief;
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
export { validateDraft } from './draft-validation';
import { validateDraft } from './draft-validation';

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
  const mode =
    options.mode === 'similar' || (previous && options.sourceQuestionId)
      ? 'similar'
      : 'new';
  const base = previous
    ? options.sourceQuestionId
      ? refinementSource(raw, options.sourceQuestionId)
      : undefined
    : selectBase({ brief: raw }, options);
  const requested = retrieve(
    mode === 'similar' ? similarBrief(raw, !!previous, base) : raw,
    mode === 'similar',
  );
  if (mode === 'similar' && !base)
    throw new HttpError(422, 'The original source question is unavailable. Browse sources and choose an active source for a new similar question.');
  if (base) requested.examples = [base];
  const terminologyRules = await listTerminology(requested.brief.module);
  assertProfessionalContent({ specifications: requested.brief.specifications, edit, previous }, 'Request');
  assertProfessionalContent(terminologyRules, 'Saved terminology');
  assertProfessionalContent(promptExamples(requested.examples), 'Source material');
  if (requested.brief.useFormulaSheet) verifyFormulaSource();
  const generationContext = {
    is_refinement: !!previous,
    source_marks: sourceMarkTotal(base?.question_marks),
    generation_mode:
      base || (previous && options.sourceQuestionId) ? 'similar' : 'new',
    base_reference: base ? promptExamples([base])[0] : null,
    similar_variation: options.variation || { numbers: false, context: false },
    saved_terminology_rules: terminologyRules.map(
      ({ id, avoid, prefer, reason, revision }) => ({
        id,
        avoid,
        prefer,
        reason,
        revision,
      }),
    ),
    available_formula_sheet: requested.brief.useFormulaSheet
      ? formulasForBrief(requested.brief)
      : null,
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
    prompts.text.similar +
    ' ' +
    prompts.text.quality_contract;
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
        ...(
          await Promise.all(
            refs.map(async (ref) => ({
              ...ref,
              images: await Promise.all(
                ref.images.map(async (img) => ({
                  ...img,
                  url: await referenceImage(img.name, img.url),
                })),
              ),
            })),
          )
        ).flatMap((ref) =>
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
    prompts.text.similar +
    ' ' +
    prompts.text.quality_contract;
  const planBody = {
    instructions: planInstructions,
    input: JSON.stringify({
      ...generationContext,
      user_instructions: prompts.text.user_context,
      brief: authoringBrief(ctx.brief, mode),
      edit,
      previous: previous ? draftSchema.parse(previous) : null,
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
        schema: jsonSchema(generationPlanSchema),
      },
    },
  };
  const planningPolicy = { mode, refining: !!previous, sourceMarks: sourceMarkTotal(base?.question_marks) };
  let feasibility = validatePlan(
    readJSON(await response(key, planBody)),
    requested,
    planningPolicy,
  );
  if (mode !== 'similar' && feasibility.total_marks !== requested.brief.totalMarks) {
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
      planningPolicy,
    );
  }
  ctx = retrieve({
    ...requested.brief,
    subtopics: feasibility.selected_subtopics,
    totalMarks: feasibility.total_marks,
    difficulty: feasibility.difficulty ?? requested.brief.difficulty,
    specifications: feasibility.resolved_specifications,
  }, mode === 'similar');
  generationContext.available_formula_sheet = ctx.brief.useFormulaSheet
    ? formulasForBrief(ctx.brief)
    : null;
  // Similar generation and refinement use only the selected source, including
  // its diagrams. The full syllabus context still constrains validity.
  if (base) ctx.examples = [base];
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
        ...(
          await Promise.all(
            refs.map(async (ref) => ({
              ...ref,
              images: await Promise.all(
                ref.images.map(async (img) => ({
                  ...img,
                  url: await referenceImage(img.name, img.url),
                })),
              ),
            })),
          )
        ).flatMap((ref) =>
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
          prompts.text.similar +
          ' ' +
          prompts.text.quality_contract,
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
          previous: previous ? draftSchema.parse(previous) : null,
          edit,
          allowed_same_topic_prerequisites: ctx.allowed,
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
    const wordingIssues = terminologyIssues(draft!, [
      ...terminologyRules,
      ...(ctx.brief.module === 'EM1'
        ? [
            { avoid: 'locus', prefer: 'path' },
            { avoid: 'antiderivative', prefer: 'indefinite integral' },
            { avoid: 'antiderivatives', prefer: 'indefinite integrals' },
          ]
        : []),
    ]);
    if (wordingIssues.length) {
      checked.scope_passed = false;
      checked.issues.push(...wordingIssues);
    }
    if (!checked.scope_evidence.length) {
      checked.scope_passed = false;
      checked.issues.push(
        'Supply affirmative syllabus evidence for every assessed task and required method.',
      );
    }
    if (ctx.brief.nonRoutine && !checked.non_routine_parts.length) {
      checked.non_routine_passed = false;
      checked.issues.push(
        'Identify and verify at least one non-routine task requiring interpretation and method choice.',
      );
    }
    if (
      !checked.context_passed ||
      !checked.non_routine_passed ||
      !checked.preservation_passed ||
      !checked.scope_passed
    )
      checked.passed = false;
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
    const strategy =
      repair === 0 || previous ? prompts.text.repair : prompts.text.reauthor;
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
      'The question could not pass the module-scope, context-plausibility and question-format checks after revision. ' +
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
    similarVariation: mode === 'similar' ? options.variation : undefined,
    terminologyRules: generationContext.saved_terminology_rules,
    formulaSheet: generationContext.available_formula_sheet
      ? {
          version: generationContext.available_formula_sheet.version,
          title: generationContext.available_formula_sheet.source.title,
          sha256: generationContext.available_formula_sheet.source.sha256,
          entries: generationContext.available_formula_sheet.entries.map(
            ({ id, name, page, latex }) => ({ id, name, page, latex }),
          ),
        }
      : undefined,
    promptModule: prompts.module,
    promptVersion: prompts.version,
    promptHash: prompts.hash,
    references: refs,
    review,
    feasibility,
    calculations: currentCalculations,
    calculationHistory: calcLog,
    exactExamples: refs.filter(ref => ref.match === 'Exact sub-topic').length,
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

export function validatePlan(value: unknown, ctx: ReturnType<typeof retrieve>, policy: { mode: string; refining: boolean; sourceMarks: number | null } = { mode: 'new', refining: false, sourceMarks: null }) {
  const plan = feasibilitySchema.parse(value);
  if (policy.mode !== 'similar' && !Number.isSafeInteger(plan.total_marks))
    throw new Error('New-question plans must use a whole number of marks.');
  if ((policy.mode !== 'similar' || !policy.refining) && plan.difficulty && plan.difficulty !== ctx.brief.difficulty)
    throw new Error('The first generation must retain the selected difficulty. Change difficulty through an explicit refinement.');
  if (policy.mode === 'similar' && !policy.refining) {
    if (policy.sourceMarks !== null && ctx.brief.questionType !== 'MCQ' && plan.total_marks !== policy.sourceMarks)
      throw new Error('The first similar question must retain the source marks. Change marks through an explicit refinement.');
    if (plan.selected_subtopics.length !== ctx.brief.subtopics.length || plan.omitted_subtopics.length)
      throw new Error('The first similar question must retain the source scope.');
  }
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

export function generate(...args: Parameters<typeof generateInBank>) {
  return withBank(() => generateInBank(...args));
}

import { z } from 'zod';
import { storedBriefSchema, draftSchema, feasibilitySchema } from './schema';
import { safeSourceUrl } from './source-url';
const sourceUrl = z
  .string()
  .refine(safeSourceUrl, 'Use an application-managed source image.');

const referenceSchema = z.object({
  totalMarks: z.string().nullable(),
  parentMarks: z.string().nullable(),
  screenshots: z.array(z.object({ page: z.number(), url: sourceUrl })),
  id: z.string(),
  label: z.string(),
  question: z.string(),
  solution: z.string(),
  alternatives: z.array(z.string()),
  difficulty: z.string(),
  marking: z.unknown(),
  images: z.array(z.object({ name: z.string(), url: sourceUrl })),
  match: z.string(),
  questionType: z.enum(['MCQ', 'Structured']).optional(),
  alternativeMarking: z.array(z.unknown()).optional(),
});
const resultSnapshotSchema = z.object({
  manual: z.boolean().optional(),
  draft: draftSchema,
  references: z.array(referenceSchema),
  review: z.object({
    passed: z.boolean(),
    scope_passed: z.boolean().optional(),
    format_passed: z.boolean().optional(),
    issues: z.array(z.string()),
    summary: z.string(),
    context_passed: z.boolean().optional(),
    context_summary: z.string().optional(),
    scope_evidence: z
      .array(z.object({ task: z.string(), evidence: z.string() }))
      .optional(),
    non_routine_passed: z.boolean().optional(),
    non_routine_parts: z.array(z.string()).optional(),
    preservation_passed: z.boolean().optional(),
    preservation_notes: z.string().optional(),
  }),
  calculations: z.array(
    z.object({ expression: z.string(), result: z.string() }),
  ),
  exactExamples: z.number(),
  brief: storedBriefSchema,
  effectiveBrief: storedBriefSchema,
  feasibility: feasibilitySchema,
  promptVersion: z.string().optional(),
  promptHash: z.string().optional(),
  promptModule: z.string().optional(),
  traceId: z.string().optional(),
  auditWarning: z.string().optional(),
  generationMode: z.enum(['new', 'similar']).optional(),
  sourceQuestionId: z.string().optional(),
  similarVariation: z
    .object({ numbers: z.boolean(), context: z.boolean() })
    .optional(),
  terminologyRules: z
    .array(
      z.object({
        id: z.string(),
        avoid: z.string(),
        prefer: z.string(),
        reason: z.string(),
        revision: z.number(),
      }),
    )
    .optional(),
  formulaSheet: z
    .object({
      version: z.string(),
      title: z.string(),
      sha256: z.string(),
      entries: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          page: z.number(),
          latex: z.string(),
        }),
      ),
    })
    .optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  reasoning: z.string().optional(),
  calculationHistory: z
    .array(z.object({ expression: z.string(), result: z.string() }))
    .optional(),
});
export const resultSchema = resultSnapshotSchema.extend({
  previousVersions: z
    .array(
      z.object({
        savedAt: z.iso.datetime(),
        change: z.string().max(3000),
        result: resultSnapshotSchema,
      }),
    )
    .default([]),
});
export type Result = z.infer<typeof resultSchema>;
export function recordRefinement(
  previous: Result,
  next: Result,
  change: string,
): Result {
  const { previousVersions, ...snapshot } = previous;
  return {
    ...next,
    previousVersions: [
      ...previousVersions,
      {
        savedAt: new Date().toISOString(),
        change: change.slice(0, 3000),
        result: snapshot,
      },
    ],
  };
}
export function restoreVersion(current: Result, index: number): Result {
  const version = current.previousVersions[index];
  if (!version) throw new Error('This refinement version is unavailable.');
  return recordRefinement(
    current,
    { ...version.result, previousVersions: [] },
    `Restored version ${index + 1}`,
  );
}
export type Ref = Result['references'][number];
export const HISTORY_KEY = 'msa-question-history-v1';
const historySchema = z
  .object({
    version: z.literal(1),
    sessionId: z.uuid(),
    batches: z.array(
      z.object({
        id: z.uuid(),
        createdAt: z.iso.datetime(),
        results: z.array(resultSchema).min(1).max(3),
      }),
    ),
    activeId: z.uuid().nullable(),
    candidateIndex: z.number().int().min(0).max(2),
  })
  .refine(
    (s) =>
      s.activeId === null
        ? s.candidateIndex === 0
        : s.batches.some(
            (b) => b.id === s.activeId && b.results[s.candidateIndex],
          ),
    'Invalid active history question',
  );
export type QuestionHistory = z.infer<typeof historySchema>;
export const emptyHistory = (): QuestionHistory => ({
  version: 1,
  sessionId: crypto.randomUUID(),
  batches: [],
  activeId: null,
  candidateIndex: 0,
});
export function readHistory(raw: string) {
  return historySchema.parse(JSON.parse(raw));
}
export function addQuestions(
  state: QuestionHistory,
  results: Result[],
  id = crypto.randomUUID(),
): QuestionHistory {
  const batch = { id, createdAt: new Date().toISOString(), results };
  return {
    ...state,
    batches: [...state.batches, batch],
    activeId: batch.id,
    candidateIndex: 0,
  };
}
export function updateQuestion(
  state: QuestionHistory,
  result: Result,
): QuestionHistory {
  return {
    ...state,
    batches: state.batches.map((batch) =>
      batch.id !== state.activeId
        ? batch
        : {
            ...batch,
            results: batch.results.map((old, index) =>
              index === state.candidateIndex ? result : old,
            ),
          },
    ),
  };
}
export function selectQuestion(
  state: QuestionHistory,
  id: string,
  index: number,
): QuestionHistory {
  if (!state.batches.find((batch) => batch.id === id)?.results[index])
    return state;
  return { ...state, activeId: id, candidateIndex: index };
}
// Clearing the working preview does not remove any drafts from this visit.
export function deselectQuestion(state: QuestionHistory): QuestionHistory {
  return { ...state, activeId: null, candidateIndex: 0 };
}
export function draftSetup(result: Result) {
  // Refinements can alter marks/difficulty. Keep the original creation settings
  // and source choice when revisiting the question, including older snapshots.
  const original = result.previousVersions[0]?.result ?? result;
  const generationMode =
    original.generationMode ?? (original.sourceQuestionId ? 'similar' : 'new');
  const sourceQuestionId =
    generationMode === 'similar' ? original.sourceQuestionId || '' : '';
  return {
    brief: original.brief,
    generationMode,
    variation: original.similarVariation ?? { numbers: false, context: false },
    sourceQuestionId,
    references: sourceQuestionId
      ? original.references.filter((ref) => ref.id === sourceQuestionId)
      : [],
  };
}

import { z } from 'zod';
import { briefSchema, draftSchema, feasibilitySchema } from './schema';

const referenceSchema = z.object({
  totalMarks: z.string().nullable(),
  parentMarks: z.string().nullable(),
  screenshots: z.array(z.object({ page: z.number(), url: z.string() })),
  id: z.string(),
  label: z.string(),
  question: z.string(),
  solution: z.string(),
  alternatives: z.array(z.string()),
  difficulty: z.string(),
  marking: z.unknown(),
  images: z.array(z.object({ name: z.string(), url: z.string() })),
  match: z.string(),
});
export const resultSchema = z.object({
  manual: z.boolean().optional(),
  draft: draftSchema,
  references: z.array(referenceSchema),
  review: z.object({
    passed: z.boolean(),
    issues: z.array(z.string()),
    summary: z.string(),
  }),
  calculations: z.array(
    z.object({ expression: z.string(), result: z.string() }),
  ),
  exactExamples: z.number(),
  brief: briefSchema,
  effectiveBrief: briefSchema,
  feasibility: feasibilitySchema,
  promptVersion: z.string().optional(),
  promptHash: z.string().optional(),
});
export type Result = z.infer<typeof resultSchema>;
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
        ? s.batches.length === 0
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

import { storedBriefSchema, type Brief } from './schema';

export const sourceFilterSchema = storedBriefSchema.pick({
  module: true,
  questionType: true,
  topic: true,
  difficulty: true,
});
export type SourceFilter = Pick<
  Brief,
  'module' | 'questionType' | 'topic' | 'difficulty'
>;

// Hidden new-question inputs cannot affect browsing or invalidate a selection.
export function sourceRequest(filter: SourceFilter) {
  const { module, questionType, topic, difficulty } = filter;
  return JSON.stringify({ module, questionType, topic, difficulty });
}

export function sourceMarkTotal(sourceMarks?: string | null) {
  const marks = Number(sourceMarks);
  return Number.isFinite(marks) && marks > 0 && marks <= Number.MAX_SAFE_INTEGER
    ? marks
    : null;
}

import { randomInt } from 'node:crypto';
import { HttpError } from './security';
import { sourceQuestions } from './retrieval';
import { getBank } from './bank-data';
import { storedBriefSchema } from './schema';
import { sourceFilterSchema, sourceMarkTotal } from './source-selection';
export type GenerationOptions = {
  mode?: 'new' | 'similar';
  sourceIds?: string[];
  sourceQuestionId?: string;
  variation?: { numbers: boolean; context: boolean };
};
// Ignore hidden controls before parsing, including invalid values left by an
// older client. Similar questions take their context and structure from a base.
export function similarBrief(
  raw: unknown,
  refining = false,
  base?: ReturnType<typeof sourceQuestions>[number],
) {
  const filter = sourceFilterSchema.parse(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Choose a source question.');
  if (!refining && !base) throw new Error('Choose a source question.');
  const normalized = storedBriefSchema.parse({
    ...raw,
    creativeContext: false,
    multipleParts: false,
    autoParts: false,
    partCount: 2,
    ...(!refining
      ? { specifications: '', nonRoutine: false, useFormulaSheet: false }
      : {}),
    ...(!refining && base
      ? {
          subtopics: getBank()
            .topics.filter(
              (t) =>
                t.status === 'Active' &&
                t.module_id === filter.module &&
                t.parent_id === filter.topic &&
                [
                  base.subtopic_id,
                  ...base.additional_subtopic_ids_json,
                ].includes(t.taxonomy_id),
            )
            .map((t) => t.taxonomy_id),
          totalMarks:
            filter.questionType === 'MCQ'
              ? 2
              : (sourceMarkTotal(base.question_marks) ??
                (filter.difficulty === 'Challenging' ? 15 : 10)),
        }
      : {}),
  });
  // Similar MCQs follow the explicitly selected source difficulty. New MCQs
  // continue to use the existing Intermediate default.
  return {
    ...normalized,
    totalMarks: filter.questionType === 'MCQ' ? 2 : normalized.totalMarks,
  };
}

// A later refinement may change difficulty; provenance still identifies the
// original source rather than applying the initial browsing filter again.
export function refinementSource(raw: unknown, id: string) {
  const filter = sourceFilterSchema.parse(raw);
  const source = getBank().questions.find((q) => q.question_id === id);
  return source
    ? sourceQuestions({
        ...filter,
        difficulty: source.perceived_difficulty,
      }).find((q) => q.question_id === id)
    : undefined;
}
export function selectBase(
  ctx: { brief: unknown },
  options: GenerationOptions = {},
) {
  if (options.mode !== 'similar') return undefined;
  const rows = sourceQuestions(ctx.brief).filter(
    (q) => !options.sourceIds || options.sourceIds.includes(q.question_id),
  );
  if (options.sourceQuestionId) {
    const selected = rows.find(
      (q) => q.question_id === options.sourceQuestionId,
    );
    if (!selected)
      throw new HttpError(
        422,
        'The selected source no longer matches the module, question type, topic and difficulty. Browse sources again.',
      );
    return selected;
  }
  if (!rows.length)
    throw new HttpError(
      422,
      'No compatible source question is available. Recommendation: change the module, question type, topic or difficulty, or use Generate new.',
    );
  return rows[randomInt(rows.length)];
}

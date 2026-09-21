import { randomInt } from 'node:crypto';
import { HttpError } from './security';
import type { retrieve } from './retrieval';
import { sourceQuestions } from './retrieval';
export type GenerationOptions = {
  mode?: 'new' | 'similar';
  sourceIds?: string[];
  sourceQuestionId?: string;
  variation?: { numbers: boolean; context: boolean };
};
// Ignore hidden controls before parsing, including invalid values left by an
// older client. Similar questions take their context and structure from a base.
export function similarBrief(raw: unknown, refining = false) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return {
    ...raw,
    creativeContext: false,
    multipleParts: false,
    autoParts: false,
    partCount: 2,
    ...(!refining ? { specifications: '' } : {}),
  };
}
export function selectBase(
  ctx: ReturnType<typeof retrieve>,
  options: GenerationOptions = {},
) {
  if (options.mode !== 'similar') return undefined;
  const rows = sourceQuestions(ctx.brief).filter(
    (q) =>
      q.question_type ===
        (ctx.brief.questionType === 'MCQ' ? 'MCQ' : 'Written') &&
      (!options.sourceIds || options.sourceIds.includes(q.question_id)),
  );
  if (options.sourceQuestionId) {
    const selected = rows.find(
      (q) => q.question_id === options.sourceQuestionId,
    );
    if (!selected)
      throw new HttpError(
        422,
        'The selected source is no longer eligible for this topic, sub-topic and question type. Browse sources again.',
      );
    return selected;
  }
  if (!rows.length)
    throw new HttpError(
      422,
      'No compatible few-shot example is available for a similar question. Recommendation: select a topic with verified examples of this question type, or use Generate new.',
    );
  return rows[randomInt(rows.length)];
}

import { randomInt } from 'node:crypto';
import { HttpError } from './security';
import type { retrieve } from './retrieval';
export type GenerationOptions = {
  mode?: 'new' | 'similar';
  sourceIds?: string[];
  sourceQuestionId?: string;
};
export function selectBase(
  ctx: ReturnType<typeof retrieve>,
  options: GenerationOptions = {},
) {
  if (options.mode !== 'similar') return undefined;
  const rows = ctx.examples.filter(
    (q) =>
      q.question_type ===
        (ctx.brief.questionType === 'MCQ' ? 'MCQ' : 'Written') &&
      (!options.sourceIds || options.sourceIds.includes(q.question_id)),
  );
  if (!rows.length)
    throw new HttpError(
      422,
      'No compatible few-shot example is available for a similar question. Recommendation: select a topic with verified examples of this question type, or use Generate new.',
    );
  return rows[randomInt(rows.length)];
}

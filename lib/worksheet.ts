import { z } from 'zod';
export const worksheetConfigSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    includeName: z.boolean(),
    includeClass: z.boolean(),
    instructions: z.string().max(5000),
    sections: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(150),
          questions: z
            .array(
              z.object({ id: z.uuid(), revision: z.number().int().positive() }),
            )
            .max(100),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine((paper) => {
    const ids = paper.sections.flatMap((section) =>
      section.questions.map((q) => q.id),
    );
    return ids.length <= 100 && new Set(ids).size === ids.length;
  }, 'Use up to 100 questions, each included once.');
export const worksheetSchema = worksheetConfigSchema.refine(
  (paper) => paper.sections.every((section) => section.questions.length > 0),
  'Add questions to every section or remove empty sections before exporting.',
);
export type Worksheet = z.infer<typeof worksheetConfigSchema>;

// Destination index is the insertion position after removing the dragged card.
export function reorderQuestion<
  T extends { id: string },
  S extends { id: string; questions: T[] },
>(
  sections: S[],
  questionId: string,
  destinationId: string,
  position: number,
): S[] {
  const question = sections
    .flatMap((s) => s.questions)
    .find((q) => q.id === questionId);
  if (!question || !sections.some((s) => s.id === destinationId))
    return sections;
  return sections.map((section) => {
    const questions = section.questions.filter((q) => q.id !== questionId);
    if (section.id === destinationId)
      questions.splice(
        Math.max(0, Math.min(position, questions.length)),
        0,
        question,
      );
    return { ...section, questions };
  });
}

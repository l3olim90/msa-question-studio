import { z } from 'zod';
export const worksheetSchema = z
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
            .min(1)
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
export type Worksheet = z.infer<typeof worksheetSchema>;

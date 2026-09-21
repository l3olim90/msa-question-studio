import { worksheetSchema } from '@/lib/worksheet';
import { getQuestions } from '@/lib/repository';
import { readBody, apiError, HttpError } from '@/lib/security';
export async function POST(request: Request) {
  try {
    const paper = worksheetSchema.parse(await readBody(request));
    const entries = await getQuestions(
      paper.sections.flatMap((section) => section.questions.map((q) => q.id)),
    );
    const sections = paper.sections.map((section) => ({
      name: section.name,
      questions: section.questions.map((selected) => {
        const entry = entries.get(selected.id)!;
        if (entry.revision !== selected.revision)
          throw new HttpError(
            409,
            `“${entry.title}” has a newer approved revision. Refresh the repository and reselect it before exporting.`,
          );
        return { id: entry.id, result: { draft: entry.result.draft } };
      }),
    }));
    return Response.json(
      { ...paper, sections },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}

import { worksheetSchema } from '@/lib/worksheet';
import { getQuestion } from '@/lib/repository';
import { readBody, apiError, HttpError } from '@/lib/security';
export async function POST(request: Request) {
  try {
    const paper = worksheetSchema.parse(await readBody(request));
    const sections = await Promise.all(paper.sections.map(async (section) => ({
      name: section.name,
      questions: await Promise.all(section.questions.map(async (selected) => {
        const entry = await getQuestion(selected.id);
        if (entry.revision !== selected.revision)
          throw new HttpError(
            409,
            `“${entry.title}” has a newer approved revision. Refresh the repository and reselect it before exporting.`,
          );
        return {id: entry.id, result: {draft: entry.result.draft}};
      })),
    })));
    return Response.json(
      { ...paper, sections },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}

import { withBank, getBank } from '@/lib/bank-data';
import { readBody, apiError } from '@/lib/security';
import { references, sourceQuestions } from '@/lib/retrieval';
export async function POST(request: Request) {
  try {
    const raw = await readBody(request);
    return await withBank(() => {
      const rows = sourceQuestions(raw);
      return Response.json(
        {
          references: references({ examples: rows, images: getBank().images, brief: { subtopics: rows.map(q => q.subtopic_id) } }),
          exactExamples: rows.length,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    });
  } catch (e) {
    return apiError(e);
  }
}

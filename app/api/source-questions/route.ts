import { withBank } from '@/lib/bank-data';
import { readBody, apiError } from '@/lib/security';
import { references, retrieve, sourceQuestions } from '@/lib/retrieval';
export async function POST(request: Request) {
  try {
    const raw = await readBody(request);
    return await withBank(() => {
      const ctx = retrieve(raw),
        rows = sourceQuestions(raw);
      return Response.json(
        {
          references: references({ ...ctx, examples: rows }),
          exactExamples: rows.length,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    });
  } catch (e) {
    return apiError(e);
  }
}

import { z } from 'zod';
import { readBody, apiError } from '@/lib/security';
import {
  approveQuestion,
  deleteQuestion,
  getQuestion,
  listQuestions,
} from '@/lib/repository';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    return Response.json(
      query.has('id')
        ? await getQuestion(z.uuid().parse(query.get('id')))
        : {
            questions: await listQuestions(
              query.get('module') || '',
              (query.get('search') || '').slice(0, 150),
            ),
          },
      { headers },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const body = z
      .object({
        result: z.unknown(),
        id: z.uuid().optional(),
        revision: z.number().int().positive().optional(),
        approved: z.literal(true),
      })
      .strict()
      .parse(await readBody(request, 20_000_000));
    const { result: _result, ...summary } = await approveQuestion(
      body.result,
      body.id,
      body.revision,
    );
    return Response.json(summary, {
      headers,
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const body = z
      .object({ id: z.uuid(), revision: z.number().int().positive() })
      .strict()
      .parse(await readBody(request));
    await deleteQuestion(body.id, body.revision);
    return Response.json({ deleted: true }, { headers });
  } catch (error) {
    return apiError(error);
  }
}

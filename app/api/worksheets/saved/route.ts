import { z } from 'zod';
import { readBody, apiError } from '@/lib/security';
import {
  listWorksheets,
  getWorksheet,
  saveWorksheet,
  deleteWorksheet,
} from '@/lib/saved-worksheets';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    return Response.json(
      id
        ? await getWorksheet(z.uuid().parse(id))
        : { worksheets: await listWorksheets() },
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
        configuration: z.unknown(),
        id: z.uuid().optional(),
        revision: z.number().int().positive().optional(),
      })
      .strict()
      .parse(await readBody(request));
    return Response.json(
      await saveWorksheet(body.configuration, body.id, body.revision),
      { headers },
    );
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
    await deleteWorksheet(body.id, body.revision);
    return Response.json({ deleted: true }, { headers });
  } catch (error) {
    return apiError(error);
  }
}

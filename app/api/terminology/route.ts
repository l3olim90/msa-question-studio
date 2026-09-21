import { z } from 'zod';
import { withBank } from '@/lib/bank-data';
import { moduleFor } from '@/lib/modules';
import { readBody, apiError } from '@/lib/security';
import {
  listTerminology,
  saveTerminology,
  deleteTerminology,
} from '@/lib/terminology';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  try {
    const moduleId = z
      .string()
      .regex(/^[A-Z][A-Z0-9_-]{0,19}$/)
      .parse(new URL(request.url).searchParams.get('module'));
    return Response.json({ rules: await listTerminology(moduleId) }, { headers });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const body = z
      .object({
        rule: z.unknown(),
        id: z.uuid().optional(),
        revision: z.number().int().positive().optional(),
      })
      .strict()
      .parse(await readBody(request));
    await withBank(() =>
      moduleFor(z.object({ module: z.string() }).parse(body.rule).module),
    );
    return Response.json(
      await saveTerminology(body.rule, body.id, body.revision),
      { headers },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    const body = z
      .object({ id: z.uuid(), revision: z.number().int().positive() })
      .strict()
      .parse(await readBody(request));
    await deleteTerminology(body.id, body.revision);
    return Response.json({ deleted: true }, { headers });
  } catch (e) {
    return apiError(e);
  }
}

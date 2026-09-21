import { z } from 'zod';
import { withBank } from '@/lib/bank-data';
import { moduleFor } from '@/lib/modules';
import { readBody, apiError, HttpError } from '@/lib/security';
import { assertProfessionalContent } from '@/lib/content-safety';
import { reviewEducationalInput } from '@/lib/safety-review';
import { serverConfig } from '@/lib/server-config';
import { acquireGenerationSlot } from '@/lib/generation-slot';
import {
  listTerminology,
  saveTerminology,
  deleteTerminology,
  terminologyInput,
} from '@/lib/terminology';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  try {
    const moduleId = z
      .string()
      .regex(/^[A-Z][A-Z0-9_-]{0,19}$/)
      .parse(new URL(request.url).searchParams.get('module'));
    return Response.json(
      { rules: await listTerminology(moduleId) },
      { headers },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    const body = z
      .object({
        rule: z.unknown(),
        id: z.uuid().optional(),
        revision: z.number().int().positive().optional(),
      })
      .strict()
      .parse(await readBody(request));
    const rule = terminologyInput.parse(body.rule);
    assertProfessionalContent(rule, 'Terminology rule');
    await withBank(() =>
      moduleFor(z.object({ module: z.string() }).parse(body.rule).module),
    );
    const configured = serverConfig();
    if (!configured.key.trim())
      throw new HttpError(
        503,
        'The terminology safety check is unavailable. Contact the app maintainer.',
      );
    release = await acquireGenerationSlot();
    await reviewEducationalInput(
      { terminologyRule: rule },
      configured.key,
      configured.connection,
    );
    return Response.json(
      await saveTerminology(body.rule, body.id, body.revision),
      { headers },
    );
  } catch (e) {
    return apiError(e);
  } finally {
    try {
      await release?.();
    } catch {
      console.warn(
        'Could not release the safety-check lease; it will expire automatically.',
      );
    }
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

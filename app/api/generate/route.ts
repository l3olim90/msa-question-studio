import { ServiceResponseError } from '@/lib/service-response';
import { generate, DraftReviewError } from '@/lib/generation';
import { generateMcqCandidates } from '@/lib/candidates';
import { serverConfig } from '@/lib/server-config';
import { readBody, HttpError, apiError } from '@/lib/security';
import { acquireGenerationSlot } from '@/lib/generation-slot';
import { z } from 'zod';
import { auditGeneration } from '@/lib/observability';
import { assertProfessionalContent } from '@/lib/content-safety';
import { reviewEducationalInput } from '@/lib/safety-review';
import { draftSchema } from '@/lib/schema';
const payload = z
  .object({
    brief: z.unknown(),
    previous: z.unknown().optional(),
    edit: z.string().max(3000).optional(),
    mode: z.enum(['new', 'similar']).default('new'),
    sourceIds: z.array(z.string().max(100)).max(6).optional(),
    sourceQuestionId: z.string().min(1).max(100).optional(),
    variation: z
      .object({ numbers: z.boolean(), context: z.boolean() })
      .strict()
      .optional(),
    sessionId: z.uuid().optional(),
    questionId: z
      .string()
      .regex(/^[0-9a-f-]{36}:[0-2]$/)
      .optional(),
  })
  .strict();
export async function POST(request: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    const body = payload.parse(await readBody(request));
    // Validate before reserving capacity or sending anything to a provider.
    const parsedBrief =
      body.mode === 'similar' && !body.previous
        ? { specifications: '' }
        : z
            .object({ specifications: z.string().max(3000).default('') })
            .parse(body.brief);
    const userText = {
      additionalContext: parsedBrief.specifications,
      refinement: body.edit || '',
      previous: body.previous ? draftSchema.parse(body.previous) : undefined,
    };
    assertProfessionalContent(userText);
    if (body.previous && body.mode === 'similar')
      throw new HttpError(
        422,
        'Use Refine draft to change a displayed question. Generate similar starts a separate draft from source examples.',
      );
    const configured = serverConfig();
    const key = configured.key.trim();
    if (!key || key.length > 500)
      throw new HttpError(
        422,
        'Configure the selected provider API key in the server .env file and restart the app.',
      );
    const connection = configured.connection;
    release = await acquireGenerationSlot();
    const brief = body.brief as { questionType?: string };
    return Response.json(
      await auditGeneration(
        {
          sessionId: body.sessionId,
          questionId: body.questionId,
          operation: body.previous
            ? 'refine'
            : body.mode === 'similar'
              ? 'similar'
              : 'generate',
          input: {
            brief: body.brief,
            previous: body.previous,
            edit: body.edit,
            mode: body.mode,
            sourceIds: body.sourceIds,
            sourceQuestionId: body.sourceQuestionId,
            variation: body.variation,
          },
        },
        async () => {
          if (
            userText.additionalContext.trim() ||
            userText.refinement.trim() ||
            userText.previous
          )
            await reviewEducationalInput(userText, key, connection);
          return brief?.questionType === 'MCQ' && !body.previous
            ? await generateMcqCandidates(key, brief, connection, {
                mode: body.mode,
                sourceIds: body.sourceIds,
                sourceQuestionId: body.sourceQuestionId,
                variation: body.variation,
              })
            : await generate(
                key,
                brief,
                body.previous,
                body.edit,
                connection,
                undefined,
                {
                  mode: body.mode,
                  sourceIds: body.sourceIds,
                  sourceQuestionId: body.sourceQuestionId,
                  variation: body.variation,
                },
              );
        },
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    if (e instanceof DraftReviewError)
      return apiError(
        new HttpError(
          422,
          'The question did not pass the assessment quality checks. Revise the request and try again.',
        ),
      );
    if (e instanceof ServiceResponseError)
      return Response.json(
        { error: e.message, retryable: e.retryable },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    if ((e as Error).name === 'ParseError')
      return apiError(
        new HttpError(
          422,
          'The generated maths could not be formatted correctly. Please retry.',
        ),
      );
    return apiError(e);
  } finally {
    try {
      await release?.();
    } catch {
      console.warn(
        'Could not release the generation lease; it will expire automatically.',
      );
    }
  }
}

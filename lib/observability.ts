import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { store } from './store';
import { APP_VERSION } from './version';

type Audit = { id: string; capture: boolean; failed: boolean };
const current = new AsyncLocalStorage<Audit>();
const now = () => new Date().toISOString();

// Local content excludes credentials, reference image bytes and hidden reasoning.
export function auditContent(value: unknown): string {
  const secrets = Object.entries(process.env)
    .filter(
      ([key, value]) =>
        value && /(?:KEY|PASSWORD|SECRET|TOKEN|DATABASE_URL)$/.test(key),
    )
    .map(([, value]) => value!);
  let encoded =
    JSON.stringify(value, (key, item) => {
      if (
        /^(?:instructions|user_instructions|system|developer|image_url|encrypted_content|_anthropicContent|thinking|signature|headers|authorization|api_key)$/i.test(
          key,
        )
      )
        return undefined;
      if (
        item &&
        typeof item === 'object' &&
        [
          'reasoning',
          'thinking',
          'redacted_thinking',
          'input_image',
          'image',
        ].includes(item.type)
      )
        return undefined;
      if (typeof item === 'string' && /^\s*[[{]/.test(item)) {
        try {
          return JSON.parse(auditContent(JSON.parse(item)));
        } catch {
          /* ordinary prose */
        }
      }
      return item;
    }) ?? 'null';
  for (const secret of secrets)
    encoded = encoded.split(secret).join('[redacted]');
  encoded = encoded
    .replace(
      /data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/gi,
      '[image omitted]',
    )
    .replace(/Bearer\s+[^\s"\\]+/gi, 'Bearer [redacted]');
  return encoded.length > 2_000_000
    ? JSON.stringify({ truncated: true, preview: encoded.slice(0, 2_000_000) })
    : encoded;
}
async function safely(audit: Audit, run: () => Promise<void>) {
  try {
    await run();
  } catch {
    audit.failed = true;
    console.warn(
      '[Audit] Database write failed; question processing continues.',
    );
  }
}
export async function recordPrompt(
  version: string,
  hash: string,
  module?: string,
) {
  const audit = current.getStore();
  if (audit)
    await safely(audit, async () => {
      await store.run(
        'UPDATE traces SET prompt_version=?,prompt_hash=?,module=? WHERE id=?',
        version,
        hash,
        module || null,
        audit.id,
      );
    });
}
export async function auditGeneration<T>(
  details: {
    sessionId?: string;
    questionId?: string;
    operation: 'generate' | 'similar' | 'refine' | 'import';
    input?: unknown;
  },
  run: () => Promise<T>,
): Promise<T> {
  const audit: Audit = {
    id: randomUUID(),
    capture: process.env.AUDIT_CAPTURE_CONTENT === 'true',
    failed: false,
  };
  return current.run(audit, async () => {
    await safely(audit, async () => {
      await store.run(
        'INSERT INTO traces(id,operation,session_id,question_id,started_at,status,app_version,input_json) VALUES(?,?,?,?,?,?,?,?)',

        audit.id,
        details.operation,
        details.sessionId || null,
        details.questionId || null,
        now(),
        'running',
        APP_VERSION,
        audit.capture ? auditContent(details.input) : null,
      );
    });
    try {
      const output = await run();
      await safely(audit, async () => {
        await store.run(
          'UPDATE traces SET ended_at=?,status=?,output_json=? WHERE id=?',

          now(),
          'success',
          audit.capture ? auditContent(output) : null,
          audit.id,
        );
      });
      if (output && typeof output === 'object') {
        const attach = (result: object) =>
          Object.assign(result, {
            traceId: audit.id,
            ...(audit.failed
              ? {
                  auditWarning:
                    'The trace could not be fully saved. Check the configured database connection and storage.',
                }
              : {}),
          });
        const candidates = (output as { candidates?: object[] }).candidates;
        if (candidates) candidates.forEach(attach);
        else attach(output);
      }
      return output;
    } catch (error) {
      await safely(audit, async () => {
        await store.run(
          'UPDATE traces SET ended_at=?,status=?,error=? WHERE id=?',
          now(),
          'error',
          auditContent(error instanceof Error ? error.message : String(error)),
          audit.id,
        );
      });
      throw error;
    }
  });
}
export async function auditProvider<
  T extends { output?: unknown; usage?: unknown },
>(
  body: {
    instructions?: unknown;
    input?: unknown;
    text?: { format?: { name?: string } };
  },
  provider: string,
  model: string,
  run: () => Promise<T>,
): Promise<T> {
  const audit = current.getStore();
  if (!audit) return run();
  const id = randomUUID();
  await safely(audit, async () => {
    await store.run(
      'INSERT INTO trace_spans(id,trace_id,name,provider,model,started_at,status,input_json) VALUES(?,?,?,?,?,?,?,?)',

      id,
      audit.id,
      body.text?.format?.name || 'model-call',
      provider,
      model,
      now(),
      'running',
      audit.capture
        ? auditContent({ input: body.input })
        : null,
    );
  });
  try {
    const output = await run();
    await safely(audit, async () => {
      await store.run(
        'UPDATE trace_spans SET ended_at=?,status=?,usage_json=?,output_json=? WHERE id=?',

        now(),
        'success',
        auditContent(output.usage),
        audit.capture ? auditContent(output.output) : null,
        id,
      );
    });
    return output;
  } catch (error) {
    await safely(audit, async () => {
      await store.run(
        'UPDATE trace_spans SET ended_at=?,status=?,error=? WHERE id=?',

        now(),
        'error',
        auditContent(error instanceof Error ? error.message : String(error)),
        id,
      );
    });
    throw error;
  }
}

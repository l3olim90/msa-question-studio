import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { APP_VERSION } from './version';

type AuditResult = {
  draft?: unknown;
  review?: { passed?: boolean };
  brief?: unknown;
  effectiveBrief?: unknown;
  calculations?: unknown[];
};
type ProviderUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

type Attributes = Record<string, string | number | boolean | undefined>;
type Span = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  status?: { code: number };
  attributes: { key: string; value: { stringValue: string } }[];
};
type Audit = {
  traceId: string;
  rootId: string;
  spans: Span[];
  common: Attributes;
  config: { url: string; authorization: string; content: boolean };
};
const current = new AsyncLocalStorage<Audit>();
const timestamp = () => (BigInt(Date.now()) * BigInt(1000000)).toString();
const attributes = (values: Attributes) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value: { stringValue: String(value) } }));

function configuration(): Audit['config'] | null {
  if (process.env.LANGFUSE_ENABLED !== 'true') return null;
  try {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
    const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
    const base = new URL(
      process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    );
    if (
      !publicKey ||
      !secretKey ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !(
        base.protocol === 'https:' ||
        (base.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
      )
    )
      throw new Error();
    return {
      url: base.href.replace(/\/$/, '') + '/api/public/otel/v1/traces',
      authorization:
        'Basic ' + Buffer.from(publicKey + ':' + secretKey).toString('base64'),
      content: process.env.LANGFUSE_CAPTURE_CONTENT === 'true',
    };
  } catch {
    console.warn(
      '[Langfuse] Invalid or missing server configuration; tracing skipped.',
    );
    return null;
  }
}

// Do not export headers, credentials, reference image bytes, or hidden reasoning.
function content(value: unknown): string {
  const secrets = Object.entries(process.env)
    .filter(
      ([key, value]) => value && /(?:KEY|PASSWORD|SECRET|TOKEN)$/.test(key),
    )
    .map(([, value]) => value!);
  let text =
    JSON.stringify(value, (key, item) => {
      if (
        /^(?:image_url|encrypted_content|_anthropicContent|thinking|signature|headers|authorization|api_key)$/i.test(
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
      return item;
    }) ?? 'null';
  for (const secret of secrets) text = text.split(secret).join('[redacted]');
  return text.length > 60000
    ? JSON.stringify({ truncated: true, preview: text.slice(0, 60000) })
    : text;
}

function startSpan(
  audit: Audit,
  name: string,
  values: Attributes,
  root = false,
): Span {
  const span: Span = {
    traceId: audit.traceId,
    spanId: root ? audit.rootId : randomBytes(8).toString('hex'),
    ...(root ? {} : { parentSpanId: audit.rootId }),
    name,
    kind: 1,
    startTimeUnixNano: timestamp(),
    attributes: attributes({ ...audit.common, ...values }),
  };
  audit.spans.push(span);
  return span;
}
function finish(span: Span, failed = false) {
  span.endTimeUnixNano = timestamp();
  span.status = { code: failed ? 2 : 1 };
  if (failed)
    span.attributes.push(
      ...attributes({
        'langfuse.observation.level': 'ERROR',
        'langfuse.observation.status_message':
          'Operation failed; see the application response.',
      }),
    );
}
export function recordPrompt(version: string, hash: string) {
  const audit = current.getStore();
  if (!audit) return;
  const values = {
    'langfuse.version': version,
    'langfuse.trace.metadata.prompt_version': version,
    'langfuse.trace.metadata.prompt_hash': hash,
  };
  Object.assign(audit.common, values);
  // Set the root metadata too, before any provider call is made.
  if (
    audit.spans[0] &&
    !audit.spans[0].attributes.some((a) => a.key === 'langfuse.version')
  )
    audit.spans[0].attributes.push(...attributes(values));
}

async function flush(audit: Audit) {
  try {
    const response = await fetch(audit.config.url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: audit.config.authorization,
        'x-langfuse-ingestion-version': '4',
      },
      body: JSON.stringify({
        resourceSpans: [
          {
            resource: {
              attributes: attributes({
                'service.name': 'msa-question-studio',
                'service.version': APP_VERSION,
              }),
            },
            scopeSpans: [
              { scope: { name: 'msa-question-studio' }, spans: audit.spans },
            ],
          },
        ],
      }),
    });
    if (!response.ok) throw new Error();
    const result = (await response.json()) as {
      partialSuccess?: {
        rejectedSpans?: string | number;
        errorMessage?: string;
      };
    };
    if (
      Number(result.partialSuccess?.rejectedSpans || 0) > 0 ||
      result.partialSuccess?.errorMessage
    )
      throw new Error();
  } catch {
    // Export is best-effort and must never turn a valid question into an error.
    console.warn(
      '[Langfuse] Trace export failed or was partially rejected; question processing is unaffected.',
    );
  }
}

export async function auditGeneration<T>(
  details: {
    sessionId?: string;
    questionId?: string;
    operation: 'generate' | 'refine';
  },
  run: () => Promise<T>,
): Promise<T> {
  const config = configuration();
  if (!config) return run();
  const audit: Audit = {
    traceId: randomBytes(16).toString('hex'),
    rootId: randomBytes(8).toString('hex'),
    spans: [],
    config,
    common: {
      'langfuse.trace.name': 'question.' + details.operation,
      'langfuse.session.id': details.sessionId,
      'langfuse.release': APP_VERSION,
      'langfuse.trace.metadata.operation': details.operation,
      'langfuse.trace.metadata.question_id': details.questionId,
    },
  };
  return current.run(audit, async () => {
    const span = startSpan(
      audit,
      'question.' + details.operation,
      { 'langfuse.observation.type': 'span' },
      true,
    );
    try {
      const output = await run();
      const results = (output as { candidates?: AuditResult[] })
        ?.candidates || [output as AuditResult];
      span.attributes.push(
        ...attributes({
          'langfuse.observation.metadata.question_count': results.length,
          'langfuse.observation.metadata.review_passed': results.every(
            (result) => result.review?.passed,
          ),
          'langfuse.observation.metadata.review_calculations': results.reduce(
            (count: number, result) =>
              count + (result.calculations?.length || 0),
            0,
          ),
        }),
      );
      if (config.content)
        span.attributes.push(
          ...attributes({
            'langfuse.observation.output': content(
              results.map((r) => ({
                draft: r.draft,
                review: r.review,
                brief: r.brief,
                effectiveBrief: r.effectiveBrief,
              })),
            ),
          }),
        );
      finish(span);
      return output;
    } catch (error) {
      finish(span, true);
      throw error;
    } finally {
      await flush(audit);
    }
  });
}

export async function auditProvider<
  T extends { output?: unknown; usage?: ProviderUsage },
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
  const span = startSpan(audit, body.text?.format?.name || 'model-call', {
    'langfuse.observation.type': 'generation',
    'langfuse.observation.model.name': model,
    'langfuse.observation.metadata.provider': provider,
    'langfuse.observation.model.parameters': JSON.stringify({
      reasoning_effort: 'high',
    }),
  });
  if (audit.config.content)
    span.attributes.push(
      ...attributes({
        'langfuse.observation.input': content({
          instructions: body.instructions,
          input: body.input,
        }),
      }),
    );
  try {
    const output = await run();
    const usage = output.usage;
    if (usage) {
      const input = usage.input_tokens,
        outputTokens = usage.output_tokens;
      const cached =
        usage.input_tokens_details?.cached_tokens ||
        usage.cache_read_input_tokens ||
        0;
      const cacheWrite = usage.cache_creation_input_tokens || 0;
      const details =
        provider === 'anthropic'
          ? {
              input,
              output: outputTokens,
              input_cache_read: cached,
              input_cache_creation: cacheWrite,
            }
          : {
              input: Math.max(0, (input || 0) - cached),
              output: outputTokens,
              input_cache_read: cached,
            };
      span.attributes.push(
        ...attributes({
          'langfuse.observation.usage_details': JSON.stringify(details),
        }),
      );
    }
    if (audit.config.content)
      span.attributes.push(
        ...attributes({
          'langfuse.observation.output': content(output.output),
        }),
      );
    finish(span);
    return output;
  } catch (error) {
    finish(span, true);
    throw error;
  }
}

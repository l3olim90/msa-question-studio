import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

export function cloudEnabled() {
  const mode =
    process.env.STUDIO_STORAGE || (process.env.VERCEL ? 'supabase' : 'local');
  if (!['local', 'supabase'].includes(mode))
    throw new Error('STUDIO_STORAGE must be local or supabase.');
  if (process.env.VERCEL && mode !== 'supabase')
    throw new Error('Vercel requires STUDIO_STORAGE=supabase.');
  return mode === 'supabase';
}
let connection: ReturnType<typeof postgres> | undefined;
export function postgresConnection() {
  if (!process.env.DATABASE_URL)
    throw new Error('Set the server DATABASE_URL before using Supabase.');
  if (connection) return connection;
  const raw = postgres(process.env.DATABASE_URL, {
    ssl: 'require',
    prepare: false,
    max: 1,
    connect_timeout: 15,
    idle_timeout: 20,
    max_lifetime: 60 * 20,
    onnotice: () => {},
  });
  // Reserve the connection for each independent operation. This prevents
  // transaction pipelining through Supavisor while allowing callers to run
  // concurrently. Native begin() reserves it for the whole transaction.
  const query = async (
    strings: TemplateStringsArray,
    ...values: postgres.ParameterOrFragment<never>[]
  ) => {
    const reserved = await raw.reserve();
    try {
      return await reserved(strings, ...values);
    } finally {
      reserved.release();
    }
  };
  connection = Object.assign(query, raw, {
    unsafe: async (...args: Parameters<typeof raw.unsafe>) => {
      const reserved = await raw.reserve();
      try {
        return await reserved.unsafe(...args);
      } finally {
        reserved.release();
      }
    },
  }) as unknown as typeof raw;
  return connection;
}
export async function closeCloud() {
  await connection?.end({ timeout: 5 });
  connection = undefined;
}
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY on the server.');
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export const sourceBucket = 'studio-sources';

export function safeError(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  const secrets = Object.entries(process.env).filter(
    ([k, v]) => v && /(?:KEY|PASSWORD|SECRET|TOKEN|DATABASE_URL)$/.test(k),
  );
  for (const [, value] of secrets)
    message = message.split(value!).join('[redacted]');
  return message.replace(
    /postgres(?:ql)?:\/\/[^\s"']+/gi,
    '[database connection redacted]',
  );
}

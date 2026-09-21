import postgres, { type TransactionSql } from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { databaseExecutor } from './database-connection';

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
let executor: ReturnType<typeof databaseExecutor> | undefined;
export function postgresConnection() {
  if (!process.env.DATABASE_URL)
    throw new Error('Set the server DATABASE_URL before using Supabase.');
  if (connection) return connection;
  const options = {
    ssl: 'require' as const,
    prepare: false,
    max: 1,
    // Supported by postgres.js; omitted from its public Options type.
    max_pipeline: 1,
    connect_timeout: 5,
    idle_timeout: 20,
    max_lifetime: 60 * 20,
    onnotice: () => {},
  };
  const create = () => postgres(process.env.DATABASE_URL!, options);
  const pool = (executor = databaseExecutor(create, {
    queueMs: process.env.VERCEL ? 5000 : 120000,
    preflightMs: 6000,
    idleMs: 15000,
    queryMs: 20000,
  }));
  // Helpers such as sql.json create parameters without opening a connection.
  const helpers = create();
  const query = async (
    strings: TemplateStringsArray,
    ...values: postgres.ParameterOrFragment<never>[]
  ) => {
    return pool.run((sql) => sql(strings, ...values));
  };
  connection = Object.assign(query, helpers, {
    unsafe: (...args: Parameters<typeof helpers.unsafe>) =>
      pool.run((sql) => sql.unsafe(...args)),
    begin: (work: (sql: TransactionSql) => Promise<unknown>) =>
      pool.run((sql) => sql.begin(work), process.env.VERCEL ? 20000 : 120000),
    end: () => pool.close(),
  }) as unknown as ReturnType<typeof postgres>;
  return connection;
}
export async function closeCloud() {
  await executor?.close();
  connection = undefined;
  executor = undefined;
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

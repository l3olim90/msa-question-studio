import { AsyncLocalStorage } from 'node:async_hooks';
import { cloudEnabled, postgresConnection } from './cloud';
import type { Sql, TransactionSql } from 'postgres';

type Value = string | number | null;
type Row = Record<string, unknown>;
export type Store = {
  all<T = Row>(query: string, ...values: Value[]): Promise<T[]>;
  get<T = Row>(query: string, ...values: Value[]): Promise<T | undefined>;
  run(query: string, ...values: Value[]): Promise<void>;
};
const current = new AsyncLocalStorage<Store>();
let localQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = localQueue.then(work, work);
  localQueue = next.catch(() => {});
  return next;
}
function pgQuery(query: string) {
  let n = 0;
  return query
    .replace(/\?/g, () => '$' + ++n)
    .replace(/\binstr\(/g, 'strpos(')
    .replace(
      /\b(repository_questions|repository_revisions|repository_events|traces|trace_spans|import_jobs|worksheet_configs)\b/g,
      'studio.$1',
    );
}
function pgStore(sql: Sql | TransactionSql): Store {
  const all = async <T = Row>(query: string, ...values: Value[]) =>
    Array.from(await sql.unsafe(pgQuery(query), values)) as T[];
  return {
    all,
    get: async <T = Row>(q: string, ...v: Value[]) =>
      (await all<T>(q, ...v))[0],
    run: async (q, ...v) => {
      await all(q, ...v);
    },
  };
}
async function localStore(): Promise<Store> {
  const { database } = await import('./database');
  const db = database();
  return {
    all: async <T = Row>(q: string, ...v: Value[]) =>
      db.prepare(q).all(...v) as T[],
    get: async <T = Row>(q: string, ...v: Value[]) =>
      db.prepare(q).get(...v) as T | undefined,
    run: async (q, ...v) => {
      db.prepare(q).run(...v);
    },
  };
}
async function withStore<T>(work: (store: Store) => Promise<T>) {
  const existing = current.getStore();
  if (existing) return work(existing);
  if (cloudEnabled()) return work(pgStore(postgresConnection()));
  return serialize(async () => work(await localStore()));
}
export const store: Store = {
  all: <T = Row>(q: string, ...v: Value[]) =>
    withStore((db) => db.all<T>(q, ...v)),
  get: <T = Row>(q: string, ...v: Value[]) =>
    withStore((db) => db.get<T>(q, ...v)),
  run: (q, ...v) => withStore((db) => db.run(q, ...v)),
};
export async function atomic<T>(work: (db: Store) => Promise<T>): Promise<T> {
  if (current.getStore()) return work(current.getStore()!);
  if (cloudEnabled())
    return postgresConnection().begin(async (sql) => {
      const db = pgStore(sql);
      return current.run(db, () => work(db));
    }) as Promise<T>;
  return serialize(async () => {
    const db = await localStore();
    await db.run('BEGIN IMMEDIATE');
    try {
      const value = await current.run(db, () => work(db));
      await db.run('COMMIT');
      return value;
    } catch (e) {
      await db.run('ROLLBACK');
      throw e;
    }
  });
}

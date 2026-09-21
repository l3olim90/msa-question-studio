import type { Sql } from 'postgres';

export class DatabaseUnavailableError extends Error {
  constructor(public operationMayHaveRun: boolean) {
    super(
      'The database connection was interrupted or did not respond in time.',
    );
    this.name = 'DatabaseUnavailableError';
  }
}
function connectionFailure(error: unknown) {
  const code = (error as { code?: string })?.code || '';
  return /^(?:CONNECTION_|CONNECT_TIMEOUT|ECONN|EPIPE|ETIMEDOUT|08|57P0)/.test(
    code,
  );
}
async function deadline<T>(
  work: PromiseLike<T>,
  ms: number,
  mayHaveRun: boolean,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new DatabaseUnavailableError(mayHaveRun)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Serialize whole operations (including transactions), not individual queries
// inside a transaction. This also prevents Supavisor transaction pipelining.
export function databaseExecutor(
  create: () => Sql,
  limits = { queueMs: 5000, preflightMs: 6000, idleMs: 15000, queryMs: 20000 },
) {
  let client: Sql | undefined;
  let lastUsed = 0;
  let queue: Promise<unknown> = Promise.resolve();
  async function discard() {
    const previous = client;
    client = undefined;
    // Destroy sockets, including a hanging query/reservation, before reopening.
    await previous?.end({ timeout: 0 }).catch(() => {});
  }
  async function ready() {
    // Wall-clock expiry still works when the host has frozen all JS timers.
    if (client && Date.now() - lastUsed > limits.idleMs) await discard();
    for (let attempt = 0; attempt < 2; attempt++) {
      client ??= create();
      try {
        await deadline(client.unsafe('SELECT 1'), limits.preflightMs, false);
        return client;
      } catch {
        console.warn(
          'Database preflight failed; replacing the connection before starting the operation.',
        );
        await discard();
      }
    }
    throw new DatabaseUnavailableError(false);
  }
  async function run<T>(
    work: (sql: Sql) => PromiseLike<T>,
    timeout = limits.queryMs,
  ): Promise<T> {
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waiting = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        reject(new DatabaseUnavailableError(false));
      }, limits.queueMs);
    });
    const task = queue.then(async () => {
      clearTimeout(timer);
      // A request that timed out in the queue must never execute later.
      if (expired) throw new DatabaseUnavailableError(false);
      const sql = await ready();
      try {
        return await deadline(work(sql), timeout, true);
      } catch (error) {
        if (
          error instanceof DatabaseUnavailableError ||
          connectionFailure(error)
        ) {
          console.warn(
            'Database operation lost its connection or exceeded its deadline; discarding the connection without replaying the operation.',
          );
          await discard();
          // Do not replay a write/transaction: its commit may have succeeded.
          throw new DatabaseUnavailableError(true);
        }
        throw error;
      } finally {
        lastUsed = Date.now();
      }
    });
    queue = task.catch(() => {});
    try {
      return await Promise.race([task, waiting]);
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    run,
    close: async () => {
      await queue;
      await discard();
    },
  };
}

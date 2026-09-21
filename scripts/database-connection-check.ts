import assert from 'node:assert/strict';
import type { Sql } from 'postgres';
import {
  databaseExecutor,
  DatabaseUnavailableError,
} from '../lib/database-connection';
import { apiError } from '../lib/security';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const never = () => new Promise<never>(() => {});
const limits = { queueMs: 200, preflightMs: 10, idleMs: 10000, queryMs: 15 };
let created = 0,
  closed = 0,
  writes = 0;
const fake = (ping: () => Promise<unknown>) =>
  ({
    unsafe: ping,
    end: async () => {
      closed++;
    },
  }) as unknown as Sql;

// A dead socket is discarded before the write starts, then a fresh one is used.
let executor = databaseExecutor(() => {
  created++;
  return fake(created === 1 ? never : async () => []);
}, limits);
assert.equal(await executor.run(async () => ++writes), 1);
assert.equal(created, 2);
assert.equal(closed, 1);
await executor.close();

// Bound an outage; never execute the caller's work on a failed connection.
created = closed = writes = 0;
executor = databaseExecutor(() => {
  created++;
  return fake(never);
}, limits);
await assert.rejects(() => executor.run(async () => ++writes), {
  operationMayHaveRun: false,
});
assert.equal(created, 2);
assert.equal(closed, 2);
assert.equal(writes, 0);
await executor.close();

// A write that loses its reply must not be replayed automatically.
created = closed = writes = 0;
executor = databaseExecutor(() => {
  created++;
  return fake(async () => []);
}, limits);
await assert.rejects(
  () =>
    executor.run(() => {
      writes++;
      return never();
    }),
  { operationMayHaveRun: true },
);
assert.equal(writes, 1);
assert.equal(closed, 1);
assert.equal(await executor.run(async () => 'recovered'), 'recovered');
assert.equal(created, 2);
const sqlError = Object.assign(new Error('private SQL details'), {
  code: '23505',
});
await assert.rejects(
  () =>
    executor.run(async () => {
      throw sqlError;
    }),
  (error) => error === sqlError,
);
assert.equal(
  closed,
  1,
  'ordinary constraint errors do not reset a healthy connection',
);
await assert.rejects(
  () =>
    executor.run(async () => {
      throw Object.assign(new Error('socket details'), { code: 'ECONNRESET' });
    }),
  { operationMayHaveRun: true },
);
assert.equal(closed, 2);
await executor.close();

// A queued request must not execute after its caller has received a timeout.
writes = 0;
executor = databaseExecutor(() => fake(async () => []), {
  ...limits,
  queueMs: 10,
  queryMs: 100,
});
let release: () => void = () => {};
const blocked = executor.run(
  () =>
    new Promise<void>((resolve) => {
      release = resolve;
    }),
);
const queued = executor.run(async () => ++writes);
await assert.rejects(() => queued, { operationMayHaveRun: false });
release();
await blocked;
assert.equal(await executor.run(async () => 'next'), 'next');
assert.equal(writes, 0);
await executor.close();

// Wall-clock idle expiry does not depend on a timer firing during suspension.
created = 0;
executor = databaseExecutor(
  () => {
    created++;
    return fake(async () => []);
  },
  { ...limits, idleMs: 2 },
);
await executor.run(async () => 'first');
await pause(5);
await executor.run(async () => 'after idle');
assert.equal(created, 2);
await executor.close();

for (const mayHaveRun of [false, true]) {
  const response = apiError(new DatabaseUnavailableError(mayHaveRun));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.retryable, !mayHaveRun);
  assert(body.error.includes('draft'));
  if (mayHaveRun) assert(body.error.includes('before retrying'));
}
console.log(
  'PASS: stale socket recovery, bounded outages, idle recycling, no write replay, queue expiry without delayed writes, healthy SQL errors and safe 503 responses.',
);

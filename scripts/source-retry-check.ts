import assert from 'node:assert/strict';
import { sourceQuestionsRequest } from '../lib/source-request';
const original = globalThis.fetch;
const body = JSON.stringify({
  module: 'EM1',
  questionType: 'Structured',
  topic: 'EM1-2',
  difficulty: 'Basic',
});
const timing = { timeoutMs: 100, retryDelayMs: 0 };
let calls = 0;
const request = (
  signal = new AbortController().signal,
  progress = (_value: unknown) => {},
) => sourceQuestionsRequest(body, signal, progress, timing);
try {
  const bodies: string[] = [],
    progress: unknown[] = [];
  globalThis.fetch = async (_url, init) => {
    assert.equal(typeof init?.body, 'string');
    bodies.push(init?.body as string);
    calls++;
    if (calls === 1) throw new TypeError('Network unavailable');
    return calls === 2
      ? new Response('<html>Gateway</html>', { status: 502 })
      : Response.json({ references: [], exactExamples: 0 });
  };
  assert.deepEqual(await request(undefined, (value) => progress.push(value)), {
    references: [],
    exactExamples: 0,
  });
  assert.equal(calls, 3);
  assert(bodies.every((value) => value === body));
  assert.deepEqual(progress, [
    { attempt: 1, retrying: false },
    { attempt: 2, retrying: true },
    { attempt: 2, retrying: false },
    { attempt: 3, retrying: true },
    { attempt: 3, retrying: false },
  ]);
  for (const status of [401, 403, 404, 422]) {
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response('<html>Denied</html>', { status });
    };
    await assert.rejects(() => request());
    assert.equal(calls, 1);
  }
  for (const status of [408, 429, 503]) {
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ error: 'Temporary failure' }, { status });
    };
    await assert.rejects(() => request(), /after 3 attempts/);
    assert.equal(calls, 3);
  }
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ references: 'invalid' });
  };
  await assert.rejects(() => request(), /after 3 attempts/);
  assert.equal(calls, 3);
  calls = 0;
  const signals = new Set<AbortSignal>();
  globalThis.fetch = async (_url, init) => {
    calls++;
    const signal = init!.signal!;
    signals.add(signal);
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      }),
    );
  };
  await assert.rejects(
    () =>
      sourceQuestionsRequest(body, new AbortController().signal, () => {}, {
        timeoutMs: 5,
        retryDelayMs: 0,
      }),
    /after 3 attempts/,
  );
  assert.equal(calls, 3);
  assert.equal(signals.size, 3);
  const cancel = new AbortController();
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError('Network');
  };
  await assert.rejects(
    () =>
      request(cancel.signal, (value) => {
        if ((value as { retrying: boolean }).retrying) cancel.abort();
      }),
    { name: 'AbortError' },
  );
  assert.equal(calls, 1);
  const stale = new AbortController();
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    stale.abort();
    return Response.json({ references: [], exactExamples: 0 });
  };
  await assert.rejects(() => request(stale.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
  const pending = new AbortController();
  globalThis.fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init!.signal!.addEventListener(
        'abort',
        () => reject(init!.signal!.reason),
        { once: true },
      );
      pending.abort();
    });
  await assert.rejects(() => request(pending.signal), { name: 'AbortError' });
  console.log(
    'PASS: source retries recover transient failures, stop after three attempts, preserve filters, use fresh timeouts and cancel pending/stale requests. Permanent errors do not retry.',
  );
} finally {
  globalThis.fetch = original;
}

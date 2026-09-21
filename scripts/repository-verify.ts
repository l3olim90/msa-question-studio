// Explicit Supabase integration check. Only uniquely identified test questions
// are written, and every fixture is removed in finally. No provider calls.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closeCloud, safeError } from '../lib/cloud';
import { atomic, store } from '../lib/store';
import { resultSchema } from '../lib/history';
import {
  approveQuestion,
  deleteQuestion,
  getQuestion,
  getQuestions,
  listQuestions,
} from '../lib/repository';
import { POST as approveRoute } from '../app/api/repository/route';
import { POST as worksheetRoute } from '../app/api/worksheets/route';

process.env.STUDIO_STORAGE = 'supabase';
const ids: string[] = [];
const title = 'Repository verification ' + randomUUID();
const request = (path: string, body: unknown) =>
  new Request('http://127.0.0.1' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
try {
  // pnpm test produces this local fixture; no existing team questions are used.
  const fixture = resultSchema.parse(
    JSON.parse(readFileSync('test-output/history-fixture.json', 'utf8')),
  );
  fixture.brief.topic = fixture.effectiveBrief.topic = 'EM1-2';
  fixture.brief.subtopics =
    fixture.effectiveBrief.subtopics =
    fixture.draft.syllabus_ids =
    fixture.feasibility.selected_subtopics =
      ['EM1-2.3'];
  Object.assign(fixture.review, {
    passed: true,
    scope_passed: true,
    format_passed: true,
    context_passed: true,
    non_routine_passed: true,
    preservation_passed: true,
  });
  fixture.draft.title = title + ' A';
  const first = await approveQuestion(fixture);
  ids.push(first.id);
  assert.deepEqual(await getQuestion(first.id), first);
  const other = structuredClone(fixture);
  other.draft.title = title + ' B';
  const second = await approveQuestion(other);
  ids.push(second.id);
  const outcomes = await Promise.allSettled([
    approveQuestion(fixture, first.id, 1),
    approveQuestion(fixture, first.id, 1),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    outcomes.find((r) => r.status === 'rejected')?.reason.status,
    409,
  );
  const current = await getQuestion(first.id);
  assert.equal(current.revision, 2);
  assert.equal(current.created_at, first.created_at);
  const counts = () =>
    store.get<{ revisions: number; events: number }>(
      `SELECT (SELECT count(*)::int FROM repository_revisions WHERE question_id=?) AS revisions,
     (SELECT count(*)::int FROM repository_events WHERE question_id=?) AS events`,
      first.id,
      first.id,
    );
  assert.deepEqual(await counts(), { revisions: 2, events: 2 });

  // Force a history-write failure for this fixture. The single SQL statement
  // must roll back the current row too, without any surrounding transaction.
  await store.run(
    'INSERT INTO repository_revisions(question_id,revision,result_json,approved_at) VALUES(?,?,?,?)',
    first.id,
    3,
    JSON.stringify(fixture),
    new Date().toISOString(),
  );
  await assert.rejects(() => approveQuestion(fixture, first.id, 2), {
    code: '23505',
  });
  assert.deepEqual(await getQuestion(first.id), current);
  assert.deepEqual(await counts(), { revisions: 3, events: 2 });
  await store.run(
    'DELETE FROM repository_revisions WHERE question_id=? AND revision=?',
    first.id,
    3,
  );

  const entries = await getQuestions([second.id, first.id]);
  assert.equal(entries.size, 2);
  assert.equal(entries.get(second.id)?.title, second.title);
  assert.equal((await listQuestions('EM1', title)).length, 2);
  const worksheet = {
    title,
    includeName: false,
    includeClass: false,
    instructions: '',
    sections: [
      {
        name: 'B before A',
        questions: [
          { id: second.id, revision: 1 },
          { id: first.id, revision: 2 },
        ],
      },
    ],
  };
  const paper = await worksheetRoute(request('/api/worksheets', worksheet));
  assert.equal(paper.status, 200);
  assert.deepEqual(
    (await paper.json()).sections[0].questions.map((q: { id: string }) => q.id),
    [second.id, first.id],
  );
  const receipt = await approveRoute(
    request('/api/repository', {
      result: fixture,
      approved: true,
      id: first.id,
      revision: 2,
    }),
  );
  assert.equal(receipt.status, 200);
  const summary = await receipt.json();
  assert.equal(summary.revision, 3);
  assert.equal(summary.result, undefined);
  assert.deepEqual((await getQuestion(first.id)).result, fixture);
  assert.equal(
    (await worksheetRoute(request('/api/worksheets', worksheet))).status,
    409,
  );
  await assert.rejects(() => deleteQuestion(first.id, 2), { status: 409 });
  await deleteQuestion(first.id, 3);
  await assert.rejects(() => approveQuestion(fixture, first.id, 3), {
    status: 404,
  });
  await assert.rejects(() => approveQuestion(fixture, randomUUID(), 1), {
    status: 404,
  });
  assert.equal(
    (await worksheetRoute(request('/api/worksheets', worksheet))).status,
    404,
  );
  console.log(
    'PASS: Supabase approval receipts, complete snapshots, competing replacements, immutable revisions/events, write-failure rollback, summary lists, bulk worksheet order, stale/deleted checks.',
  );
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
} finally {
  try {
    await atomic(async (db) => {
      for (const id of ids) {
        await db.run('DELETE FROM repository_events WHERE question_id=?', id);
        await db.run(
          'DELETE FROM repository_revisions WHERE question_id=?',
          id,
        );
        await db.run('DELETE FROM repository_questions WHERE id=?', id);
      }
    });
  } finally {
    await closeCloud();
  }
}

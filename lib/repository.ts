import { randomUUID } from 'node:crypto';
import { store, atomic } from './store';
import { cloudEnabled } from './cloud';
import { withBank } from './bank-data';
import { resultSchema } from './history';
import { HttpError } from './security';
import { validateDraft } from './generation';
import { retrieve } from './retrieval';
import type { Result } from './history';
import { worksheetUsage, type WorksheetUsage } from './saved-worksheets';

export type RepositorySummary = {
  id: string;
  module: string;
  topic: string;
  difficulty: string;
  question_type: string;
  title: string;
  marks: number;
  revision: number;
  created_at: string;
  updated_at: string;
  worksheets?: WorksheetUsage[];
};
export type RepositoryEntry = RepositorySummary & { result: Result };
const columns =
  'id,module,topic,question_type,title,marks,revision,created_at,updated_at';
export async function listQuestions(module = '', search = '') {
  const rows = await store.all<RepositorySummary & { result_json: string }>(
    `SELECT ${columns},result_json FROM repository_questions WHERE deleted_at IS NULL
    AND (? = '' OR module = ?) AND (? = '' OR instr(lower(title), lower(?)) > 0)
    ORDER BY updated_at DESC, id`,
    module,
    module,
    search,
    search,
  );
  const usage = await worksheetUsage();
  return rows.map(({ result_json, ...summary }) => ({
    ...summary,
    worksheets: usage.get(summary.id) || [],
    difficulty: resultSchema.parse(JSON.parse(result_json)).effectiveBrief
      .difficulty,
  }));
}
export async function getQuestion(
  id: string,
  lock = false,
): Promise<RepositoryEntry> {
  const row = await store.get(
    `SELECT ${columns},result_json FROM repository_questions WHERE id=? AND deleted_at IS NULL${lock && cloudEnabled() ? ' FOR UPDATE' : ''}`,
    id,
  );
  if (!row)
    throw new HttpError(
      404,
      'This question is no longer in the approved repository. Refresh the repository.',
    );
  const { result_json, ...summary } = row;
  const result = resultSchema.parse(JSON.parse(String(result_json)));
  return {
    ...summary,
    difficulty: result.effectiveBrief.difficulty,
    result,
  } as RepositoryEntry;
}
export async function approveQuestion(
  value: unknown,
  id?: string,
  expectedRevision?: number,
): Promise<RepositoryEntry> {
  const result = resultSchema.parse(value);
  if (
    !result.review.passed ||
    result.review.scope_passed === false ||
    result.review.format_passed === false ||
    result.review.context_passed === false ||
    result.review.non_routine_passed === false ||
    result.review.preservation_passed === false
  )
    throw new HttpError(
      422,
      'Refine and recheck this question before approving it. The automatic review has not passed.',
    );
  // Human approval is explicit; deterministic format/mark/scope checks still apply.
  await withBank(() =>
    validateDraft(
      result.draft,
      retrieve(result.effectiveBrief, true),
      result.generationMode,
    ),
  );
  const now = new Date().toISOString();
  const questionId = id || randomUUID();
  return atomic(async (db) => {
    const previous = id ? await getQuestion(id, true) : null;
    if (previous && previous.revision !== expectedRevision)
      throw new HttpError(
        409,
        'This question changed in another session. Reopen its latest approved version before replacing it.',
      );
    const revision = (previous?.revision || 0) + 1;
    const json = JSON.stringify(result);
    if (previous)
      await db.run(
        `UPDATE repository_questions SET module=?,topic=?,question_type=?,title=?,marks=?,revision=?,result_json=?,updated_at=? WHERE id=?`,

        result.effectiveBrief.module,
        result.effectiveBrief.topic,
        result.draft.question_type,
        result.draft.title,
        result.draft.total_marks,
        revision,
        json,
        now,
        questionId,
      );
    else
      await db.run(
        `INSERT INTO repository_questions(id,module,topic,question_type,title,marks,revision,result_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,

        questionId,
        result.effectiveBrief.module,
        result.effectiveBrief.topic,
        result.draft.question_type,
        result.draft.title,
        result.draft.total_marks,
        revision,
        json,
        now,
        now,
      );
    await db.run(
      'INSERT INTO repository_revisions VALUES(?,?,?,?)',
      questionId,
      revision,
      json,
      now,
    );
    await db.run(
      'INSERT INTO repository_events(question_id,revision,action,created_at) VALUES(?,?,?,?)',
      questionId,
      revision,
      previous ? 'replace' : 'approve',
      now,
    );
    return getQuestion(questionId);
  });
}
export async function deleteQuestion(id: string, expectedRevision: number) {
  await atomic(async (db) => {
    const question = await getQuestion(id, true);
    if (question.revision !== expectedRevision)
      throw new HttpError(
        409,
        'This question changed in another session. Refresh before deleting it.',
      );
    const now = new Date().toISOString();
    await db.run(
      'UPDATE repository_questions SET deleted_at=?,updated_at=? WHERE id=?',
      now,
      now,
      id,
    );
    await db.run(
      'INSERT INTO repository_events(question_id,revision,action,created_at) VALUES(?,?,?,?)',
      id,
      question.revision,
      'delete',
      now,
    );
  });
}

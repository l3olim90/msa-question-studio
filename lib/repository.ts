import { randomUUID } from 'node:crypto';
import { store, atomic } from './store';
import { cloudEnabled } from './cloud';
import { withBank } from './bank-data';
import { resultSchema } from './history';
import { HttpError } from './security';
import { validateDraft } from './draft-validation';
import { retrieve } from './retrieval';
import type { Result } from './history';
import { assertProfessionalContent } from './content-safety';
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
type StoredSummary = Omit<RepositorySummary, 'difficulty' | 'worksheets'>;
type StoredQuestion = StoredSummary & { result_json: string };
const columns =
  'id,module,topic,question_type,title,marks,revision,created_at,updated_at';
function missingQuestion() {
  return new HttpError(
    404,
    'This question is no longer in the approved repository. Refresh the repository.',
  );
}
function readQuestion({
  result_json,
  ...summary
}: StoredQuestion): RepositoryEntry {
  const result = resultSchema.parse(JSON.parse(result_json));
  return { ...summary, difficulty: result.effectiveBrief.difficulty, result };
}
export async function listQuestions(module = '', search = '') {
  // Lists need only metadata, not every draft, review and refinement snapshot.
  const difficulty = cloudEnabled()
    ? "result_json::jsonb #>> '{effectiveBrief,difficulty}'"
    : "json_extract(result_json, '$.effectiveBrief.difficulty')";
  const rows = await store.all<RepositorySummary>(
    `SELECT ${columns},${difficulty} AS difficulty FROM repository_questions WHERE deleted_at IS NULL
    AND (? = '' OR module = ?) AND (? = '' OR instr(lower(title), lower(?)) > 0)
    ORDER BY updated_at DESC, id`,
    module,
    module,
    search,
    search,
  );
  const usage = await worksheetUsage();
  return rows.map((summary) => ({
    ...summary,
    worksheets: usage.get(summary.id) || [],
  }));
}
export async function getQuestion(
  id: string,
  lock = false,
): Promise<RepositoryEntry> {
  const row = await store.get<StoredQuestion>(
    `SELECT ${columns},result_json FROM repository_questions WHERE id=? AND deleted_at IS NULL${lock && cloudEnabled() ? ' FOR UPDATE' : ''}`,
    id,
  );
  if (!row) throw missingQuestion();
  return readQuestion(row);
}
// One database snapshot and round trip for all questions in a worksheet.
export async function getQuestions(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, RepositoryEntry>();
  const rows = await store.all<StoredQuestion>(
    `SELECT ${columns},result_json FROM repository_questions WHERE deleted_at IS NULL AND id IN (${unique.map(() => '?').join(',')})`,
    ...unique,
  );
  if (rows.length !== unique.length) throw missingQuestion();
  return new Map(rows.map((row) => [row.id, readQuestion(row)]));
}
export async function approveQuestion(
  value: unknown,
  id?: string,
  expectedRevision?: number,
): Promise<RepositoryEntry> {
  const result = resultSchema.parse(value);
  assertProfessionalContent(result, 'Question and refinement history');
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
  const json = JSON.stringify(result);
  const values = [
    result.effectiveBrief.module,
    result.effectiveBrief.topic,
    result.draft.question_type,
    result.draft.title,
    result.draft.total_marks,
    json,
    now,
    questionId,
    id ? (expectedRevision ?? null) : now,
  ];
  // The revision condition is part of the write, so competing replacements
  // cannot overwrite each other, even without a separate preflight read.
  const mutation = id
    ? `UPDATE repository_questions SET module=?,topic=?,question_type=?,title=?,marks=?,result_json=?,updated_at=?,revision=revision+1
       WHERE id=? AND revision=? AND deleted_at IS NULL`
    : `INSERT INTO repository_questions(module,topic,question_type,title,marks,result_json,updated_at,id,created_at,revision)
       VALUES(?,?,?,?,?,?,?,?,?,1)`;
  const requireSaved = async (saved: StoredSummary | undefined) => {
    if (saved) return saved;
    const exists = await store.get(
      'SELECT id FROM repository_questions WHERE id=? AND deleted_at IS NULL',
      questionId,
    );
    if (!exists) throw missingQuestion();
    throw new HttpError(
      409,
      'This question changed in another session. Reopen its latest approved version before replacing it.',
    );
  };
  let saved: StoredSummary;
  if (cloudEnabled()) {
    // PostgreSQL commits all three writes as one statement, or none. Pass the
    // snapshot between CTEs using RETURNING instead of uploading it twice.
    // Use store so callers' existing transactions still enclose this operation.
    saved = await requireSaved(
      await store.get<StoredSummary>(
        `WITH saved AS (${mutation} RETURNING ${columns},result_json),
       revision_saved AS (
         INSERT INTO repository_revisions(question_id,revision,result_json,approved_at)
         SELECT id,revision,result_json,updated_at FROM saved RETURNING question_id
       ), event_saved AS (
         INSERT INTO repository_events(question_id,revision,action,created_at)
         SELECT saved.id,saved.revision,?,saved.updated_at FROM saved
         JOIN revision_saved ON revision_saved.question_id=saved.id RETURNING question_id
       )
       SELECT ${columns
         .split(',')
         .map((column) => 'saved.' + column)
         .join(',')}
       FROM saved JOIN event_saved ON event_saved.question_id=saved.id`,
        ...values,
        id ? 'replace' : 'approve',
      ),
    );
  } else
    saved = await atomic(async (db) => {
      const summary = await requireSaved(
        await db.get<StoredSummary>(
          `${mutation} RETURNING ${columns}`,
          ...values,
        ),
      );
      await db.run(
        'INSERT INTO repository_revisions(question_id,revision,result_json,approved_at) VALUES(?,?,?,?)',
        questionId,
        summary.revision,
        json,
        now,
      );
      await db.run(
        'INSERT INTO repository_events(question_id,revision,action,created_at) VALUES(?,?,?,?)',
        questionId,
        summary.revision,
        id ? 'replace' : 'approve',
        now,
      );
      return summary;
    });
  return { ...saved, difficulty: result.effectiveBrief.difficulty, result };
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

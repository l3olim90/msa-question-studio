import { randomUUID } from 'node:crypto';
import { atomic, store } from './store';
import { cloudEnabled } from './cloud';
import { HttpError } from './security';
import { worksheetConfigSchema, type Worksheet } from './worksheet';

export type SavedWorksheetSummary = {
  id: string;
  title: string;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type SavedWorksheet = SavedWorksheetSummary & {
  configuration: Worksheet;
};
export type WorksheetUsage = {
  id: string;
  title: string;
  section: string;
  questionRevision: number;
  worksheetRevision: number;
};
export async function worksheetUsage() {
  const rows = await store.all<SavedWorksheetSummary & { config_json: string }>(
    `SELECT ${columns},config_json FROM worksheet_configs ORDER BY updated_at DESC,id`,
  );
  const byQuestion = new Map<string, WorksheetUsage[]>();
  for (const row of rows) {
    const config = worksheetConfigSchema.parse(JSON.parse(row.config_json));
    for (const section of config.sections)
      for (const question of section.questions) {
        const uses = byQuestion.get(question.id) || [];
        uses.push({
          id: row.id,
          title: row.title,
          section: section.name,
          questionRevision: question.revision,
          worksheetRevision: row.revision,
        });
        byQuestion.set(question.id, uses);
      }
  }
  return byQuestion;
}
const columns = 'id,title,revision,created_at,updated_at';
export async function listWorksheets() {
  return store.all<SavedWorksheetSummary>(
    `SELECT ${columns} FROM worksheet_configs ORDER BY updated_at DESC,id`,
  );
}
export async function getWorksheet(
  id: string,
  lock = false,
): Promise<SavedWorksheet> {
  const row = await store.get<SavedWorksheetSummary & { config_json: string }>(
    `SELECT ${columns},config_json FROM worksheet_configs WHERE id=?${lock && cloudEnabled() ? ' FOR UPDATE' : ''}`,
    id,
  );
  if (!row)
    throw new HttpError(
      404,
      'This saved worksheet no longer exists. Refresh the saved worksheet list.',
    );
  const { config_json, ...summary } = row;
  return {
    ...summary,
    configuration: worksheetConfigSchema.parse(JSON.parse(config_json)),
  };
}
export async function saveWorksheet(
  value: unknown,
  id?: string,
  revision?: number,
) {
  const configuration = worksheetConfigSchema.parse(value);
  return atomic(async (db) => {
    const previous = id ? await getWorksheet(id, true) : undefined;
    if (previous && previous.revision !== revision)
      throw new HttpError(
        409,
        'This worksheet changed in another session. Reopen it or save your changes as a new worksheet.',
      );
    const key = id || randomUUID(),
      next = (previous?.revision || 0) + 1,
      now = new Date().toISOString();
    if (previous)
      await db.run(
        'UPDATE worksheet_configs SET title=?,revision=?,config_json=?,updated_at=? WHERE id=?',
        configuration.title,
        next,
        JSON.stringify(configuration),
        now,
        key,
      );
    else
      await db.run(
        'INSERT INTO worksheet_configs(id,title,revision,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        key,
        configuration.title,
        next,
        JSON.stringify(configuration),
        now,
        now,
      );
    return getWorksheet(key);
  });
}
export async function deleteWorksheet(id: string, revision: number) {
  return atomic(async (db) => {
    const previous = await getWorksheet(id, true);
    if (previous.revision !== revision)
      throw new HttpError(
        409,
        'This worksheet changed in another session. Reopen it before deleting.',
      );
    await db.run('DELETE FROM worksheet_configs WHERE id=?', id);
  });
}

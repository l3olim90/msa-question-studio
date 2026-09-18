import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

// Keep live database files out of cloud-synchronised source checkouts.
export function databasePath() {
  return process.env.STUDIO_DB_PATH
    ? resolve(process.env.STUDIO_DB_PATH)
    : join(
        process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'),
        'MSA Question Studio',
        'studio.sqlite',
      );
}
let connection: DatabaseSync | undefined;
let openedPath = '';
export function database() {
  const path = databasePath();
  if (connection && openedPath === path) return connection;
  connection?.close();
  connection = undefined;
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec(
      'PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;',
    );
    const version = Number(
      db.prepare('PRAGMA user_version').get()!.user_version,
    );
    if (version > 1)
      throw new Error(
        'This database needs a newer version of Question Studio.',
      );
    db.exec(`
      CREATE TABLE IF NOT EXISTS repository_questions (
        id TEXT PRIMARY KEY, module TEXT NOT NULL, topic TEXT NOT NULL,
        question_type TEXT NOT NULL, title TEXT NOT NULL, marks REAL NOT NULL,
        revision INTEGER NOT NULL, result_json TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS repository_module ON repository_questions(module, deleted_at, updated_at);
      CREATE TABLE IF NOT EXISTS repository_revisions (
        question_id TEXT NOT NULL REFERENCES repository_questions(id), revision INTEGER NOT NULL,
        result_json TEXT NOT NULL, approved_at TEXT NOT NULL,
        PRIMARY KEY(question_id, revision)
      );
      CREATE TABLE IF NOT EXISTS repository_events (
        id INTEGER PRIMARY KEY, question_id TEXT NOT NULL, revision INTEGER NOT NULL,
        action TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY, operation TEXT NOT NULL, session_id TEXT, question_id TEXT,
        module TEXT, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL,
        app_version TEXT NOT NULL, prompt_version TEXT, prompt_hash TEXT,
        input_json TEXT, output_json TEXT, error TEXT
      );
      CREATE INDEX IF NOT EXISTS trace_started ON traces(started_at DESC);
      CREATE TABLE IF NOT EXISTS trace_spans (
        id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id), name TEXT NOT NULL,
        provider TEXT NOT NULL, model TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT,
        status TEXT NOT NULL, usage_json TEXT, input_json TEXT, output_json TEXT, error TEXT
      );
      CREATE INDEX IF NOT EXISTS span_trace ON trace_spans(trace_id, started_at);
      CREATE TABLE IF NOT EXISTS import_jobs (
        id TEXT PRIMARY KEY, module TEXT NOT NULL, paper_id TEXT NOT NULL,
        status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        error TEXT, log TEXT
      );
      PRAGMA user_version=1;
    `);
    connection = db;
    openedPath = path;
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
export function transaction<T>(run: (db: DatabaseSync) => T): T {
  const db = database();
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = run(db);
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function closeDatabase() {
  connection?.close();
  connection = undefined;
  openedPath = '';
}

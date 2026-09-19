CREATE TABLE IF NOT EXISTS studio.worksheet_configs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  revision INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
ALTER TABLE studio.worksheet_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON studio.worksheet_configs FROM PUBLIC, anon, authenticated;
INSERT INTO studio.migrations(version) VALUES ('202609190001') ON CONFLICT DO NOTHING;

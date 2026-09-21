CREATE TABLE IF NOT EXISTS studio.terminology_rules (
  id TEXT PRIMARY KEY, module TEXT NOT NULL, avoid TEXT NOT NULL,
  prefer TEXT NOT NULL, reason TEXT NOT NULL, revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS terminology_module_term ON studio.terminology_rules(module,lower(avoid));
ALTER TABLE studio.terminology_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON studio.terminology_rules FROM PUBLIC, anon, authenticated;
INSERT INTO studio.migrations(version) VALUES ('202609210001') ON CONFLICT DO NOTHING;

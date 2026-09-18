-- Application data is private: browser/anonymous Supabase roles cannot access it.
CREATE SCHEMA IF NOT EXISTS studio;
REVOKE ALL ON SCHEMA studio FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS studio.migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS studio.repository_questions (
 id text PRIMARY KEY, module text NOT NULL, topic text NOT NULL, question_type text NOT NULL,
 title text NOT NULL, marks double precision NOT NULL, revision integer NOT NULL CHECK(revision > 0),
 result_json text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL, deleted_at text
);
CREATE INDEX IF NOT EXISTS repository_module ON studio.repository_questions(module, deleted_at, updated_at);
CREATE TABLE IF NOT EXISTS studio.repository_revisions (
 question_id text NOT NULL REFERENCES studio.repository_questions(id), revision integer NOT NULL,
 result_json text NOT NULL, approved_at text NOT NULL, PRIMARY KEY(question_id,revision)
);
CREATE TABLE IF NOT EXISTS studio.repository_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, question_id text NOT NULL, revision integer NOT NULL,
 action text NOT NULL, created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS studio.traces (
 id text PRIMARY KEY, operation text NOT NULL, session_id text, question_id text, module text,
 started_at text NOT NULL, ended_at text, status text NOT NULL, app_version text NOT NULL,
 prompt_version text, prompt_hash text, input_json text, output_json text, error text
);
CREATE INDEX IF NOT EXISTS trace_started ON studio.traces(started_at DESC);
CREATE TABLE IF NOT EXISTS studio.trace_spans (
 id text PRIMARY KEY, trace_id text NOT NULL REFERENCES studio.traces(id), name text NOT NULL,
 provider text NOT NULL, model text NOT NULL, started_at text NOT NULL, ended_at text,
 status text NOT NULL, usage_json text, input_json text, output_json text, error text
);
CREATE INDEX IF NOT EXISTS span_trace ON studio.trace_spans(trace_id,started_at);
CREATE TABLE IF NOT EXISTS studio.modules (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS studio.topics (id text PRIMARY KEY, module text NOT NULL REFERENCES studio.modules(id), data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS topics_module ON studio.topics(module);
CREATE TABLE IF NOT EXISTS studio.source_questions (
 id text PRIMARY KEY, module text NOT NULL REFERENCES studio.modules(id), topic text NOT NULL REFERENCES studio.topics(id),
 paper_id text NOT NULL, data jsonb NOT NULL, crops jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS source_module_topic ON studio.source_questions(module,topic);
CREATE INDEX IF NOT EXISTS source_paper ON studio.source_questions(paper_id);
CREATE TABLE IF NOT EXISTS studio.source_assets (name text PRIMARY KEY, path text NOT NULL, mime text NOT NULL);
CREATE TABLE IF NOT EXISTS studio.import_jobs (
 id text PRIMARY KEY, module text NOT NULL, paper_id text NOT NULL, status text NOT NULL,
 created_at text NOT NULL, updated_at text NOT NULL, error text, log text,
 manifest jsonb, review jsonb, bundle_path text, question_hash text,
 lease_token text, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0, review_revision integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS import_queue ON studio.import_jobs(status,created_at);
CREATE TABLE IF NOT EXISTS studio.generation_slots (
 id text PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS studio.worker_status (id text PRIMARY KEY, last_seen timestamptz NOT NULL);
REVOKE ALL ON ALL TABLES IN SCHEMA studio FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA studio FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA studio REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
INSERT INTO studio.migrations(version) VALUES ('202609180001') ON CONFLICT DO NOTHING;

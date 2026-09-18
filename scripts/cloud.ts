import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  postgresConnection,
  closeCloud,
  supabaseAdmin,
  sourceBucket,
  safeError,
} from '../lib/cloud';
import { putAsset } from '../lib/cloud-assets';
import { assetUrl } from '../lib/bank-data';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
async function check() {
  const sql = postgresConnection();
  await sql`SELECT 1`;
  const { error } = await supabaseAdmin().storage.listBuckets();
  if (error)
    throw new Error(
      'Supabase storage authentication failed. Check SUPABASE_SECRET_KEY.',
    );
  console.log('PASS: PostgreSQL and Supabase Storage authentication.');
}
async function migrate() {
  const sql = postgresConnection();
  for (const file of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(73511200)`;
      await tx.unsafe(readFileSync(join('supabase/migrations', file), 'utf8'));
    });
    console.log('Applied migration:', file);
  }
  const storage = supabaseAdmin().storage;
  const { data, error } = await storage.listBuckets();
  if (error) throw error;
  const found = data.find((b) => b.id === sourceBucket);
  if (found?.public)
    throw new Error(
      'studio-sources must be private. Make this bucket private before continuing.',
    );
  if (!found) {
    const created = await storage.createBucket(sourceBucket, {
      public: false,
      fileSizeLimit: 52428800,
      allowedMimeTypes: [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'application/zip',
      ],
    });
    if (created.error) throw created.error;
  }
  console.log('Private source bucket ready.');
}
async function seed() {
  const sql = postgresConnection();
  const bank = read('data/bank.json'),
    modules = read('data/modules.json'),
    crops = read('data/reference-crops.json');
  let uploaded = 0;
  for (const [name, url] of Object.entries(bank.images) as [string, string][]) {
    const match = /^data:([^;]+);base64,(.*)$/.exec(url);
    if (!match) throw new Error('Invalid source diagram ' + name);
    await putAsset(
      'diagram/' + name,
      Buffer.from(match[2], 'base64'),
      match[1],
    );
    uploaded++;
  }
  for (const shots of Object.values(crops) as { page: number; url: string }[][])
    for (const shot of shots) {
      if (!/^\/source-questions\/[A-Za-z0-9_.-]+\.png$/.test(shot.url))
        throw new Error('Invalid seed crop path.');
      const name = 'crop/' + shot.url.split('/').at(-1);
      await putAsset(
        name,
        readFileSync(resolve('public', shot.url.slice(1))),
        'image/png',
      );
      shot.url = assetUrl(name);
      uploaded++;
    }
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(73511201)`;
    for (const m of modules)
      await tx`INSERT INTO studio.modules(id,data) VALUES(${m.id},${tx.json(m)}) ON CONFLICT(id) DO NOTHING`;
    for (const t of bank.topics)
      await tx`INSERT INTO studio.topics(id,module,data) VALUES(${t.taxonomy_id},${t.module_id},${tx.json(t)}) ON CONFLICT(id) DO NOTHING`;
    for (const q of bank.questions)
      await tx`INSERT INTO studio.source_questions(id,module,topic,paper_id,data,crops) VALUES(${q.question_id},${q.module_id},${q.topic_id},${q.paper_id},${tx.json(q)},${tx.json(crops[q.question_id] || [])}) ON CONFLICT(id) DO NOTHING`;
  });
  console.log(
    `Seed complete: ${modules.length} modules, ${bank.questions.length} source questions, ${uploaded} source assets checked/uploaded. Existing rows preserved.`,
  );
}
async function migrateLocal() {
  const { DatabaseSync } = await import('node:sqlite');
  const { databasePath } = await import('../lib/database');
  const path = databasePath();
  if (!existsSync(path)) {
    console.log('No local SQLite database to migrate.');
    return;
  }
  const db = new DatabaseSync(path, { readOnly: true });
  const sql = postgresConnection();
  try {
    const present = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );
    const tables = [
      'repository_questions',
      'repository_revisions',
      'traces',
      'trace_spans',
    ];
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(73511202)`;
      for (const table of tables) {
        if (!present.has(table)) continue;
        const rows = db.prepare('SELECT * FROM ' + table).all();
        for (const row of rows) {
          const keys = Object.keys(row);
          const names = keys.map((k) => '"' + k + '"').join(',');
          await tx.unsafe(
            'INSERT INTO studio.' +
              table +
              '(' +
              names +
              ') VALUES(' +
              keys.map((_, i) => '$' + (i + 1)).join(',') +
              ') ON CONFLICT DO NOTHING',
            keys.map((k) =>
              typeof row[k] === 'bigint' ? String(row[k]) : row[k],
            ) as (string | number | null)[],
          );
        }
        console.log('Local records copied/preserved:', table, rows.length);
      }
      if (present.has('repository_events'))
        for (const row of db.prepare('SELECT * FROM repository_events').all()) {
          await tx`INSERT INTO studio.repository_events(question_id,revision,action,created_at) SELECT ${String(row.question_id)},${Number(row.revision)},${String(row.action)},${String(row.created_at)} WHERE NOT EXISTS (SELECT 1 FROM studio.repository_events WHERE question_id=${String(row.question_id)} AND revision=${Number(row.revision)} AND action=${String(row.action)} AND created_at=${String(row.created_at)})`;
        }
    });
  } finally {
    db.close();
  }
}
try {
  const command = process.argv[2] || 'check';
  if (command === 'check') await check();
  else if (command === 'migrate') {
    await check();
    await migrate();
  } else if (command === 'seed') await seed();
  else if (command === 'migrate-local') await migrateLocal();
  else throw new Error('Use pnpm cloud check | migrate | seed | migrate-local');
} catch (e) {
  console.error(safeError(e));
  process.exitCode = 1;
} finally {
  await closeCloud();
}

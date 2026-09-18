import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  copyFileSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, dirname, sep } from 'node:path';
import { zipSync, unzipSync } from 'fflate';
import { build } from 'esbuild';
import {
  postgresConnection,
  supabaseAdmin,
  sourceBucket,
  safeError,
} from './cloud';
import { loadCloudBank, assetUrl, invalidateCloudBank } from './bank-data';
import { putAsset } from './cloud-assets';
import { taxonomySchema } from './import-schema';
import type { CloudImportRow } from './cloud-imports';
import { auditContent } from './observability';

export async function claimImport(
  onlyId?: string,
): Promise<CloudImportRow | undefined> {
  const sql = postgresConnection(),
    token = randomUUID();
  return sql.begin(async (tx) => {
    await tx`INSERT INTO studio.worker_status(id,last_seen) VALUES('imports',now()) ON CONFLICT(id) DO UPDATE SET last_seen=now()`;
    await tx`UPDATE studio.import_jobs SET status=CASE WHEN attempts>=3 THEN 'error' WHEN status='committing' THEN 'commit_queued' ELSE 'queued' END,error='Previous worker was interrupted; the queued operation will be retried, or use Retry extraction after repeated interruptions.',lease_token=NULL,lease_until=NULL WHERE status IN ('extracting','committing') AND lease_until<now()`;
    const [job] =
      await tx`SELECT * FROM studio.import_jobs WHERE status IN ('queued','commit_queued') AND (${onlyId || ''}='' OR id=${onlyId || ''}) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!job) return;
    const [claimed] =
      await tx`UPDATE studio.import_jobs SET status=${job.status === 'queued' ? 'extracting' : 'committing'},attempts=attempts+1,lease_token=${token},lease_until=now()+interval '5 minutes',updated_at=${new Date().toISOString()},error=NULL WHERE id=${job.id} RETURNING *`;
    return claimed as CloudImportRow;
  });
}
async function download(path: string) {
  const { data, error } = await supabaseAdmin()
    .storage.from(sourceBucket)
    .download(path);
  if (error || !data)
    throw new Error(
      'Could not download a private import file. Retry extraction.',
    );
  return Buffer.from(await data.arrayBuffer());
}
function walk(dir: string, base = dir): [string, Uint8Array][] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name), base)
      : [
          [
            relative(base, join(dir, entry.name)).split(sep).join('/'),
            readFileSync(join(dir, entry.name)),
          ] as [string, Uint8Array],
        ],
  );
}
function unpack(bytes: Uint8Array, dest: string) {
  for (const [name, data] of Object.entries(unzipSync(bytes))) {
    if (name.endsWith('/')) continue;
    const file = resolve(dest, name);
    if (!file.startsWith(resolve(dest) + sep))
      throw new Error('Invalid import bundle path.');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
}
async function runBank(
  appRoot: string,
  workspace: string,
  command: string,
  arg: string,
) {
  mkdirSync(join(appRoot, 'test-output'), { recursive: true });
  const bundle = join(
    appRoot,
    'test-output',
    'cloud-bank-' + randomUUID() + '.mjs',
  );
  await build({
    entryPoints: [join(appRoot, 'scripts/bank.ts')],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
  });
  try {
    return await new Promise<string>((accept, reject) => {
      const child = spawn(process.execPath, [bundle, command, arg], {
        cwd: workspace,
        env: { ...process.env, STUDIO_STORAGE: 'supabase' },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let log = '',
        settled = false;
      const capture = (data: Buffer) => {
        log = (log + data.toString()).slice(-24000);
      };
      child.stdout.on('data', capture);
      child.stderr.on('data', capture);
      const timer = setTimeout(
        () => {
          child.kill();
          finish(
            new Error(
              'Import exceeded 25 minutes. Split the PDFs into smaller paired files and retry.',
            ),
          );
        },
        25 * 60 * 1000,
      );
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else accept(log);
      };
      child.on('error', () =>
        finish(
          new Error(
            'The PDF worker could not start. Check Node and Python installation.',
          ),
        ),
      );
      child.on('close', (code) =>
        finish(
          code === 0
            ? undefined
            : new Error('PDF ' + command + ' failed. ' + safeError(log)),
        ),
      );
    });
  } finally {
    unlinkSync(bundle);
  }
}
export async function processImport(job: CloudImportRow) {
  const appRoot = process.cwd(),
    tempBase = resolve(tmpdir()),
    workspace = mkdtempSync(join(tempBase, 'msa-cloud-import-'));
  const sql = postgresConnection(),
    token = job.lease_token!;
  const heartbeat = setInterval(() => {
    void sql`UPDATE studio.import_jobs SET lease_until=now()+interval '5 minutes' WHERE id=${job.id} AND lease_token=${token}`.catch(
      () => {},
    );
  }, 30000);
  const write = (file: string, data: unknown) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  };
  let log = '';
  try {
    const snapshot = await loadCloudBank();
    write(join(workspace, 'data/bank.json'), snapshot.bank);
    write(join(workspace, 'data/modules.json'), snapshot.modules);
    write(join(workspace, 'data/reference-crops.json'), snapshot.crops);
    mkdirSync(join(workspace, 'scripts'), { recursive: true });
    copyFileSync(
      join(appRoot, 'scripts/pdf_pages.py'),
      join(workspace, 'scripts/pdf_pages.py'),
    );
    const stage = join(workspace, 'imports/staging', job.id),
      inbox = join(workspace, 'imports/inbox', job.id);
    if (job.status === 'extracting') {
      mkdirSync(inbox, { recursive: true });
      for (const kind of ['questions', 'solutions']) {
        const bytes = await download(`imports/${job.id}/${kind}.pdf`);
        if (
          !bytes.length ||
          bytes.length > 52428800 ||
          !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))
        )
          throw new Error(
            'Both source files must be valid PDFs no larger than 50 MB.',
          );
        if (kind === 'questions') {
          const hash = createHash('sha256').update(bytes).digest('hex');
          const [duplicate] =
            await sql`SELECT id FROM studio.source_questions WHERE data->>'question_source_sha256'=${hash} LIMIT 1`;
          if (duplicate)
            throw new Error(
              'This question paper is already in the source bank.',
            );
          await sql`UPDATE studio.import_jobs SET question_hash=${hash} WHERE id=${job.id} AND lease_token=${token}`;
        }
        writeFileSync(join(inbox, kind + '.pdf'), bytes);
      }
      write(join(inbox, 'manifest.json'), job.manifest);
      log = await runBank(
        appRoot,
        workspace,
        'extract',
        join(inbox, 'manifest.json'),
      );
      const review = JSON.parse(
        readFileSync(join(stage, 'review.json'), 'utf8'),
      );
      const archive = zipSync(Object.fromEntries(walk(stage)), { level: 6 });
      if (archive.length > 52428800)
        throw new Error(
          'Rendered review exceeds 50 MB. Split this paper pair into smaller PDFs.',
        );
      const path = `imports/${job.id}/stage-${token}.zip`;
      const { error } = await supabaseAdmin()
        .storage.from(sourceBucket)
        .upload(path, archive, {
          contentType: 'application/zip',
          upsert: false,
        });
      if (error) throw error;
      const updated =
        await sql`UPDATE studio.import_jobs SET status='review',review=${sql.json(review)},review_revision=review_revision+1,bundle_path=${path},lease_token=NULL,lease_until=NULL,updated_at=${new Date().toISOString()},log=${JSON.parse(auditContent(log)) as string} WHERE id=${job.id} AND lease_token=${token} RETURNING id`;
      if (!updated.length)
        throw new Error(
          'Worker lease changed; this extraction was not published.',
        );
    } else {
      if (!job.bundle_path || !job.review)
        throw new Error('Extract and verify the source pair before approval.');
      unpack(await download(job.bundle_path), stage);
      const stageTopics = taxonomySchema.parse(
        JSON.parse(readFileSync(join(stage, 'taxonomy.json'), 'utf8')),
      ).topics;
      const currentTopics = taxonomySchema.parse({
        topics: snapshot.bank.topics.filter((t) => t.module_id === job.module),
      }).topics;
      const ordered = (rows: typeof stageTopics) =>
        JSON.stringify(
          [...rows].sort((a, b) => a.taxonomy_id.localeCompare(b.taxonomy_id)),
        );
      if (ordered(stageTopics) !== ordered(currentTopics))
        throw new Error(
          'The module syllabus changed after extraction. Upload this pair again to review it against the current syllabus.',
        );
      write(join(stage, 'review.json'), job.review);
      log = await runBank(appRoot, workspace, 'commit', job.id);
      const bank = JSON.parse(
        readFileSync(join(workspace, 'data/bank.json'), 'utf8'),
      );
      const crops = JSON.parse(
        readFileSync(join(workspace, 'data/reference-crops.json'), 'utf8'),
      );
      const added = bank.questions.filter(
        (q: { paper_id: string }) => q.paper_id === job.paper_id,
      );
      for (const q of added) {
        for (const name of [...q.images_json, ...q.solution_images_json]) {
          const match = /^data:([^;]+);base64,(.*)$/.exec(bank.images[name]);
          if (!match) throw new Error('Invalid imported diagram.');
          await putAsset(
            'diagram/' + name,
            Buffer.from(match[2], 'base64'),
            match[1],
          );
        }
        for (const shot of crops[q.question_id]) {
          const filename = shot.url.split('/').at(-1),
            name = 'crop/' + filename;
          if (!/^[A-Za-z0-9_.-]+\.png$/.test(filename))
            throw new Error('Invalid source crop name.');
          await putAsset(
            name,
            readFileSync(join(workspace, 'public/source-questions', filename)),
            'image/png',
          );
          shot.url = assetUrl(name);
        }
      }
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(73511201)`;
        const [active] =
          await tx`SELECT id FROM studio.import_jobs WHERE id=${job.id} AND lease_token=${token} AND status='committing' FOR UPDATE`;
        if (!active)
          throw new Error(
            'The approval worker lease changed. Refresh the import status.',
          );
        const [duplicate] =
          await tx`SELECT id FROM studio.source_questions WHERE paper_id=${job.paper_id} OR data->>'question_source_sha256'=${job.question_hash} LIMIT 1`;
        if (duplicate)
          throw new Error('This paper has already been committed.');
        for (const q of added)
          await tx`INSERT INTO studio.source_questions(id,module,topic,paper_id,data,crops) VALUES(${q.question_id},${q.module_id},${q.topic_id},${q.paper_id},${tx.json(q)},${tx.json(crops[q.question_id])})`;
        await tx`UPDATE studio.import_jobs SET status='committed',lease_token=NULL,lease_until=NULL,updated_at=${new Date().toISOString()},log=${JSON.parse(auditContent(log)) as string} WHERE id=${job.id}`;
      });
      invalidateCloudBank();
    }
    console.log('Completed import operation:', job.id, job.status);
  } catch (e) {
    await sql`UPDATE studio.import_jobs SET status=${job.status === 'committing' ? 'review' : 'error'},lease_token=NULL,lease_until=NULL,error=${safeError(e)},log=${JSON.parse(auditContent(log)) as string},updated_at=${new Date().toISOString()} WHERE id=${job.id} AND lease_token=${token}`;
    console.error('Import failed:', job.id, safeError(e));
  } finally {
    clearInterval(heartbeat);
    const target = resolve(workspace);
    if (
      target.startsWith(tempBase + sep) &&
      relative(tempBase, target).startsWith('msa-cloud-import-')
    )
      rmSync(target, { recursive: true, force: true });
  }
}

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { resolve, join, sep } from 'node:path';
const result = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build'],
  { stdio: 'inherit', env: { ...process.env, NITRO_PRESET: 'vercel' } },
);
if (result.status !== 0) process.exit(result.status || 1);
const output = resolve('.vercel/output');
function functions(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name.endsWith('.func')
        ? [join(dir, entry.name)]
        : functions(join(dir, entry.name))
      : [],
  );
}
const targets = functions(join(output, 'functions'));
if (!targets.length)
  throw new Error('Vercel build produced no server function.');
for (const target of targets) {
  copyFileSync('PROMPTS.md', join(target, 'PROMPTS.md'));
  mkdirSync(join(target, 'prompts'), { recursive: true });
  for (const name of readdirSync('prompts').filter((n) => n.endsWith('.md')))
    copyFileSync(join('prompts', name), join(target, 'prompts', name));
}
// Source scans are served through authenticated, short-lived storage links.
const scans = resolve(output, 'static/source-questions');
if (scans.startsWith(output + sep) && existsSync(scans))
  rmSync(scans, { recursive: true, force: true });
console.log(
  'Vercel functions packaged with module prompts; public source scans excluded.',
);

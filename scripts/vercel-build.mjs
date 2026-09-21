import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { resolve, join, sep } from 'node:path';
// Vercel auto-builds root middleware separately, outside Vite's aliases and
// Node runtime. Request handling belongs to Vinext's proxy.ts server entry.
if (['middleware.ts', 'middleware.js'].some((file) => existsSync(file)))
  throw new Error('Use proxy.ts for Vinext request handling; root middleware files create incompatible Vercel routing middleware.');
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
  mkdirSync(join(target, 'data'), { recursive: true });
  copyFileSync('data/MSA Formula Sheet.pdf', join(target, 'data/MSA Formula Sheet.pdf'));
  copyFileSync('PROMPTS.md', join(target, 'PROMPTS.md'));
  mkdirSync(join(target, 'prompts'), { recursive: true });
  for (const name of readdirSync('prompts').filter((n) => n.endsWith('.md')))
    copyFileSync(join('prompts', name), join(target, 'prompts', name));
}
// Source scans are served through short-lived storage links from the app API.
const scans = resolve(output, 'static/source-questions');
if (scans.startsWith(output + sep) && existsSync(scans))
  rmSync(scans, { recursive: true, force: true });
console.log(
  'Vercel functions packaged with module prompts and the shared formula sheet; public source scans excluded.',
);

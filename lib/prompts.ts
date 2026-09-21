import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const promptNames = [
  'quality_contract',
  'structured_contract',
  'author',
  'planner',
  'reconsider_marks',
  'format_repair',
  'author_calculator',
  'author_finalize',
  'review',
  'repair',
  'reauthor',
  'repair_checks',
  'review_calculator',
  'review_finalize',
  'user_context',
  'similar',
] as const;
export type PromptName = (typeof promptNames)[number];

export function parsePrompts(source: string, partial = false) {
  const version = /^Version: (\d{4}-\d{2}-\d{2})\s*$/m.exec(source)?.[1];
  if (
    !version ||
    Number.isNaN(Date.parse(version)) ||
    new Date(version).toISOString().slice(0, 10) !== version
  )
    throw new Error('PROMPTS.md needs a valid Version: YYYY-MM-DD date.');
  const sections = new Map<string, string>();
  for (const match of source.matchAll(
    /^## ([a-z_]+)[ \t]*\r?\n(?:[ \t]*\r?\n)*```text[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm,
  )) {
    if (sections.has(match[1]))
      throw new Error(`Duplicate prompt section: ${match[1]}`);
    if (!match[2].trim()) throw new Error(`Empty prompt section: ${match[1]}`);
    sections.set(match[1], match[2].trim());
  }
  for (const name of partial ? [] : promptNames)
    if (!sections.get(name))
      throw new Error(`PROMPTS.md is missing the ${name} text block.`);
  return {
    version,
    hash: createHash('sha256').update(source).digest('hex'),
    text: Object.fromEntries(sections) as Record<PromptName, string>,
  };
}

// Server-only, loaded once per question so edits apply to the next generation.
// Include PROMPTS.md alongside the application when deploying a production build.
export function loadPrompts(module = 'EM1') {
  if (!/^[A-Z][A-Z0-9_-]{0,19}$/.test(module))
    throw new Error('Invalid prompt module.');
  const sharedSource = readFileSync(
    resolve(process.cwd(), 'PROMPTS.md'),
    'utf8',
  );
  const shared = parsePrompts(sharedSource);
  const file = resolve(process.cwd(), 'prompts', module + '.md');
  const moduleSource = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const overrides = moduleSource ? parsePrompts(moduleSource, true) : null;
  if (
    overrides &&
    !new RegExp('^Module: ' + module + '\\s*$', 'm').test(moduleSource)
  )
    throw new Error(`prompts/${module}.md must declare Module: ${module}.`);
  for (const name of Object.keys(overrides?.text || {}))
    if (![...promptNames, 'module_context'].includes(name as PromptName))
      throw new Error(`Unknown module prompt section: ${name}`);
  return {
    module,
    version: `${module}@${overrides?.version || shared.version}+shared@${shared.version}`,
    sharedVersion: shared.version,
    moduleVersion: overrides?.version || null,
    hash: createHash('sha256')
      .update(
        JSON.stringify({
          module,
          shared: sharedSource,
          overrides: moduleSource,
        }),
      )
      .digest('hex'),
    text: { ...shared.text, ...overrides?.text },
    moduleContext:
      (overrides?.text as Record<string, string> | undefined)?.module_context ||
      '',
  };
}

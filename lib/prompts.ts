import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const promptNames = [
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
] as const;
export type PromptName = (typeof promptNames)[number];

export function parsePrompts(source: string) {
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
    sections.set(match[1], match[2].trim());
  }
  for (const name of promptNames)
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
export function loadPrompts() {
  return parsePrompts(
    readFileSync(resolve(process.cwd(), 'PROMPTS.md'), 'utf8'),
  );
}

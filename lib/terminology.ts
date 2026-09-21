import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { atomic, store } from './store';
import { cloudEnabled } from './cloud';
import { HttpError } from './security';
import type { Draft } from './schema';
import { assertProfessionalContent } from './content-safety';

export const terminologyInput = z
  .object({
    module: z.string().regex(/^[A-Z][A-Z0-9_-]{0,19}$/),
    avoid: z.string().trim().min(1).max(100),
    prefer: z.string().trim().min(1).max(200),
    reason: z.string().trim().max(500).default(''),
  })
  .refine(
    (v) => v.avoid.toLowerCase() !== v.prefer.toLowerCase(),
    'Use different wording for the replacement.',
  );
export type TerminologyRule = z.infer<typeof terminologyInput> & {
  id: string;
  revision: number;
  updated_at: string;
};
export const listTerminology = (module: string) =>
  store.all<TerminologyRule>(
    'SELECT id,module,avoid,prefer,reason,revision,updated_at FROM terminology_rules WHERE module=? ORDER BY avoid,id',
    module,
  );
export async function saveTerminology(
  value: unknown,
  id?: string,
  revision?: number,
) {
  const rule = terminologyInput.parse(value);
  assertProfessionalContent(rule, 'Terminology rule');
  return atomic(async (db) => {
    const existing = id
      ? await db.get<TerminologyRule>(
          `SELECT * FROM terminology_rules WHERE id=?${cloudEnabled() ? ' FOR UPDATE' : ''}`,
          id,
        )
      : undefined;
    if (id && (!existing || existing.revision !== revision))
      throw new HttpError(
        409,
        'This terminology rule changed. Refresh the rules before saving.',
      );
    const duplicate = await db.get(
      'SELECT id FROM terminology_rules WHERE module=? AND lower(avoid)=lower(?) AND id<>?',
      rule.module,
      rule.avoid,
      id || '',
    );
    if (duplicate)
      throw new HttpError(
        409,
        'A rule for this term already exists. Edit the existing rule.',
      );
    const key = id || randomUUID(),
      next = (existing?.revision || 0) + 1,
      now = new Date().toISOString();
    if (existing)
      await db.run(
        'UPDATE terminology_rules SET module=?,avoid=?,prefer=?,reason=?,revision=?,updated_at=? WHERE id=?',
        rule.module,
        rule.avoid,
        rule.prefer,
        rule.reason,
        next,
        now,
        key,
      );
    else
      await db.run(
        'INSERT INTO terminology_rules(id,module,avoid,prefer,reason,revision,updated_at) VALUES(?,?,?,?,?,?,?)',
        key,
        rule.module,
        rule.avoid,
        rule.prefer,
        rule.reason,
        next,
        now,
      );
    return { ...rule, id: key, revision: next, updated_at: now };
  });
}
export async function deleteTerminology(id: string, revision: number) {
  return atomic(async (db) => {
    const rule = await db.get<TerminologyRule>(
      `SELECT * FROM terminology_rules WHERE id=?${cloudEnabled() ? ' FOR UPDATE' : ''}`,
      id,
    );
    if (!rule || rule.revision !== revision)
      throw new HttpError(
        409,
        'This terminology rule changed. Refresh before removing it.',
      );
    await db.run('DELETE FROM terminology_rules WHERE id=?', id);
  });
}
export function terminologyIssues(
  draft: Draft,
  rules: Pick<TerminologyRule, 'avoid' | 'prefer'>[],
) {
  const text = [
    draft.title,
    draft.question,
    ...draft.parts.map((p) => p.prompt),
    ...draft.options.map((o) => o.text),
    draft.answer_key,
    ...draft.solutions.flatMap((s) => [
      s.content,
      ...s.marking.map((m) => m.criterion),
    ]),
    ...draft.diagrams.flatMap((d) => [
      d.caption,
      ...d.shapes.map((s) => s.text),
      ...(d.graph?.labels.map((l) => l.text) || []),
    ]),
  ].join('\n');
  return rules
    .filter((rule) =>
      new RegExp(
        '(?<![\\p{L}\\p{N}_])' +
          rule.avoid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
          '(?![\\p{L}\\p{N}_])',
        'iu',
      ).test(text),
    )
    .map(
      (rule) =>
        `Replace the unsupported term "${rule.avoid}" with syllabus-appropriate wording such as "${rule.prefer}"; recheck the meaning.`,
    );
}

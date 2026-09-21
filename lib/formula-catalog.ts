import catalog from '@/data/formula-catalog.json';
export type FormulaEntry = (typeof catalog.modules.EM1.entries)[number];
type ModuleFormulas = {
  entries: FormulaEntry[];
  excluded: string[];
  policy: string;
};
export function formulasForBrief(brief: {
  module: string;
  subtopics: string[];
}) {
  const moduleFormulas = (catalog.modules as Record<string, ModuleFormulas>)[
    brief.module
  ];
  if (!moduleFormulas) return null;
  const entries = moduleFormulas.entries.filter((entry) =>
    [...entry.syllabusIds, ...entry.prerequisiteFor].some((id) =>
      brief.subtopics.includes(id),
    ),
  );
  if (!entries.length) return null;
  return {
    version: catalog.version,
    source: catalog.source,
    policy: moduleFormulas.policy,
    entries: entries.map((entry) => ({
      ...entry,
      usage: entry.syllabusIds.some((id) => brief.subtopics.includes(id))
        ? 'selected syllabus method'
        : 'prerequisite only; do not assess as an additional topic',
    })),
  };
}
export const formulaSource = catalog.source;

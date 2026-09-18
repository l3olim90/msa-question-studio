import { briefSchema } from './schema';
export type ConfigurationIssue = {
  field: string;
  error: string;
  recommendation: string;
};
type Topic = { id: string; parent: string; module: string; level: string };
export function configurationIssues(
  raw: unknown,
  topics: Topic[],
): ConfigurationIssue[] {
  const parsed = briefSchema.safeParse(raw);
  const hints: Record<string, string> = {
    module: 'Choose an available module.',
    topic: 'Choose an active topic in the selected module.',
    subtopics:
      'Select at least one active sub-topic belonging to this topic, without duplicates.',
    totalMarks: 'Enter a whole number of marks of at least 1.',
    partCount: 'Enter a whole number of parts from 2 to 6.',
    difficulty: 'Choose Basic, Intermediate or Challenging.',
    specifications: 'Shorten the specifications to 3,000 characters.',
  };
  if (!parsed.success)
    return parsed.error.issues.map((issue) => ({
      field: String(issue.path[0] || 'brief'),
      error: issue.message,
      recommendation:
        hints[String(issue.path[0])] || 'Check this setting and try again.',
    }));
  const b = parsed.data;
  const issues: ConfigurationIssue[] = [];
  if (
    !topics.some(
      (t) => t.id === b.topic && t.module === b.module && t.level === 'Topic',
    )
  )
    issues.push({
      field: 'topic',
      error: 'The selected topic is unavailable for this module.',
      recommendation: hints.topic,
    });
  if (
    !b.subtopics.every((id) =>
      topics.some(
        (t) =>
          t.id === id &&
          t.module === b.module &&
          t.parent === b.topic &&
          t.level === 'Sub-topic',
      ),
    )
  )
    issues.push({
      field: 'subtopics',
      error: 'One or more selected sub-topics are outside the active topic.',
      recommendation: hints.subtopics,
    });
  return issues;
}

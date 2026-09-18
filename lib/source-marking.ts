import { repairMathValues } from './math-text';

export function normalizeSourceParents(value: unknown): unknown {
  if (
    !value ||
    typeof value !== 'object' ||
    !('questions' in value) ||
    !Array.isArray(value.questions)
  )
    return value;
  return {
    ...value,
    questions: value.questions.map((question: unknown) => {
      if (
        !question ||
        typeof question !== 'object' ||
        !('parent_question' in question) ||
        !('source_question' in question)
      )
        return question;
      return question.parent_question === '' &&
        typeof question.source_question === 'string'
        ? { ...question, parent_question: question.source_question }
        : question;
    }),
  };
}

// A model can return valid outer JSON containing a marking_json string whose
// LaTeX backslashes are escaped for only one JSON layer. Repair that layer alone.
export function parseSourceMarking(
  source: string,
): Record<string, unknown> | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    let fixed = '',
      inString = false;
    for (let i = 0; i < source.length; i++) {
      const character = source[i];
      if (inString && character === '\\') {
        const next = source[i + 1];
        if (
          next &&
          ('"\\/bfnrt'.includes(next) ||
            (next === 'u' &&
              /^[0-9a-fA-F]{4}$/.test(source.slice(i + 2, i + 6))))
        ) {
          fixed += character + next;
          i++;
        } else fixed += '\\\\';
      } else {
        if (character === '"') inString = !inString;
        fixed += character;
      }
    }
    decoded = JSON.parse(fixed);
  }
  if (
    decoded !== null &&
    (typeof decoded !== 'object' || Array.isArray(decoded))
  )
    throw new Error('Marking JSON must be an object or null.');
  return repairMathValues(decoded) as Record<string, unknown> | null;
}

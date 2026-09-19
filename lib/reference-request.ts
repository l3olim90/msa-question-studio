import type { Brief } from './schema';
// Only fields that influence retrieval belong in the source-check key.
export function referenceRequest(brief: Brief) {
  return JSON.stringify({
    module: brief.module,
    topic: brief.topic,
    subtopics: [...brief.subtopics].sort(),
    questionType: brief.questionType,
    difficulty: brief.difficulty,
    specifications: brief.specifications,
    totalMarks: 2,
    creativeContext: false,
    multipleParts: false,
    autoParts: false,
    partCount: 2,
  });
}

import katex from 'katex';
import { draftSchema } from './schema';
import type { retrieve } from './retrieval';
import { assertProfessionalContent } from './content-safety';
import { layoutLabels } from './label-layout';
import { desmosExpressions } from './desmos';
import { renderGraphShapes } from './graph';
import { mathParts, repairMathValues, repairLatex } from './math-text';

export function validateDraft(
  value: unknown,
  ctx: ReturnType<typeof retrieve>,
  mode: 'new' | 'similar' = 'new',
) {
  const d = draftSchema.parse(repairMathValues(value));
  assertProfessionalContent(d, 'Question');
  for (const diagram of d.diagrams) {
    for (const shape of diagram.shapes) {
      if (shape.type === 'math') {
        shape.text = repairLatex(shape.text);
        katex.renderToString(shape.text, {
          throwOnError: true,
          strict: 'ignore',
        });
      }
    }
    for (const shape of diagram.shapes)
      if (
        shape.type === 'curve' &&
        (shape.points.length < 4 || (shape.points.length - 1) % 3 !== 0)
      )
        throw new Error(
          'A curve needs a start point and cubic control-point triples.',
        );
    if (diagram.graph) {
      desmosExpressions(diagram.graph);
      diagram.shapes = renderGraphShapes(diagram.graph);
    } else if (!diagram.shapes.length)
      throw new Error('A diagram needs shapes or a graph specification.');
    else diagram.shapes = layoutLabels(diagram.shapes);
  }
  if (d.question_type !== ctx.brief.questionType)
    throw new Error('The generated question type does not match the brief.');
  if (ctx.brief.questionType === 'MCQ') {
    if (
      d.total_marks !== 2 ||
      d.parts.length ||
      d.options.length !== 4 ||
      d.options.map((o) => o.label).join('') !== 'ABCD' ||
      !d.correct_option ||
      d.solutions.length !== 1 ||
      d.solutions[0].marking.length !== 1 ||
      d.solutions[0].marking[0].marks !== 2
    )
      throw new Error(
        'An MCQ must have four options, one correct answer and a single 2-or-0 award.',
      );
  } else {
    if (
      d.options.length ||
      d.correct_option !== null ||
      new Set(d.parts.map((p) => p.label)).size !== d.parts.length
    )
      throw new Error(
        'A structured question must have unique part labels, no MCQ options and no correct-option selection.',
      );
    if (
      mode !== 'similar' &&
      (ctx.brief.multipleParts && ctx.brief.autoParts
        ? d.parts.length < 2 || d.parts.length > 6
        : d.parts.length !==
          (ctx.brief.multipleParts ? ctx.brief.partCount : 0))
    )
      throw new Error(
        'The structured question does not match the requested part count.',
      );
  }
  const ids = new Set([ctx.topic.taxonomy_id, ...ctx.allowed.map((t) => t.id)]);
  if (
    ctx.subs.some((sub) => !d.syllabus_ids.includes(sub.taxonomy_id)) ||
    d.syllabus_ids.some((id) => !ids.has(id))
  )
    throw new Error('The draft does not match the selected syllabus scope.');
  if (d.total_marks !== ctx.brief.totalMarks)
    throw new Error(
      'The generated total does not match the requested marks. Please retry.',
    );
  for (const sol of d.solutions)
    if (
      Math.abs(sol.marking.reduce((n, m) => n + m.marks, 0) - d.total_marks) >
      1e-6
    )
      throw new Error('The marks do not add up for every solution.');
  for (const text of [
    d.question,
    d.answer_key,
    ...d.parts.map((p) => p.prompt),
    ...d.options.map((o) => o.text),
    ...d.solutions.flatMap((s) => [
      s.content,
      ...s.marking.map((m) => m.criterion),
    ]),
  ])
    for (const m of mathParts(text))
      katex.renderToString(m.latex, { throwOnError: true, strict: 'ignore' });
  return d;
}

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { formulaSource } from './formula-catalog';
import { HttpError } from './security';
let verifiedStamp = '';
export function verifyFormulaSource() {
  const file = resolve('data', formulaSource.file),
    stat = statSync(file);
  const stamp = `${file}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  if (stamp === verifiedStamp) return;
  if (
    createHash('sha256').update(readFileSync(file)).digest('hex') !==
    formulaSource.sha256
  )
    throw new HttpError(
      409,
      'The formula-sheet PDF changed. Verify and update its syllabus mapping before generating with it.',
    );
  verifiedStamp = stamp;
}

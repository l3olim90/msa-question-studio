import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { formulaSource } from '@/lib/formula-catalog';
import { apiError, HttpError } from '@/lib/security';
export async function GET() {
  try {
    const bytes = await readFile(resolve('data', formulaSource.file));
    if (
      createHash('sha256').update(bytes).digest('hex') !== formulaSource.sha256
    )
      throw new HttpError(
        409,
        'The formula sheet changed. Update and verify its syllabus mapping before using this new PDF.',
      );
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="MSA Formula Sheet.pdf"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

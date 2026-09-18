import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiError, HttpError } from '@/lib/security';
import { getImport, importPaths } from '@/lib/source-imports';
import { cloudEnabled } from '@/lib/cloud';
import { cloudImportRow } from '@/lib/cloud-imports';
import { signedFile } from '@/lib/cloud-assets';
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const id = query.get('id') || '';
    const kind = query.get('kind');
    if (!['questions', 'solutions'].includes(kind || ''))
      throw new HttpError(400, 'Choose a question or solution PDF.');
    if(cloudEnabled()) {
      await cloudImportRow(id);
      return new Response(null,{status:302,headers:{Location:await signedFile(`imports/${id}/${kind}.pdf`),'Cache-Control':'private, no-store'}});
    }
    getImport(id);
    return new Response(
      readFileSync(join(importPaths(id).inbox, kind + '.pdf')),
      {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${kind}.pdf"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}

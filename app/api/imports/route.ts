import { z } from 'zod';
import { cloudEnabled } from '@/lib/cloud';
import {getCloudImport,listCloudImports,prepareCloudImport,submitCloudImport,saveCloudReview,commitCloudImport,retryCloudImport,uploadMetadata} from '@/lib/cloud-imports';
import { authorize, readBody, apiError, HttpError } from '@/lib/security';
import {
  startImport,
  getImport,
  listImports,
  saveImportReview,
  commitImport,
  retryImport,
  importRecordSchema,
} from '@/lib/source-imports';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  try {
    await authorize(request);
    const id = new URL(request.url).searchParams.get('id');
    return Response.json(cloudEnabled() ? (id ? await getCloudImport(id) : await listCloudImports()) : (id ? getImport(id) : { imports: listImports(),storage:'local' }), {
      headers,
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('content-type')?.startsWith('application/json')) {
      const input=await readBody(request);
      if(cloudEnabled() && (input as {action?:string}).action==='prepare') {
        const body=z.object({action:z.literal('prepare'),metadata:uploadMetadata}).strict().parse(input);
        return Response.json(await prepareCloudImport(body.metadata),{headers,status:201});
      }
      const body = z
        .object({ id: z.string(), action: z.enum(['commit', 'retry','submit']), revision:z.number().int().nonnegative().optional() })
        .strict()
        .parse(input);
      if(cloudEnabled()) return Response.json(await (body.action==='submit' ? submitCloudImport(body.id) : body.action==='retry' ? retryCloudImport(body.id) : commitCloudImport(body.id,body.revision)),{headers});
      if(body.action==='submit')throw new HttpError(400,'Use the local PDF upload form.');
      return Response.json(
        body.action === 'retry'
          ? await retryImport(body.id)
          : commitImport(body.id),
        { headers },
      );
    }
    await authorize(request);
    if(cloudEnabled())throw new HttpError(415,'Use direct storage uploads for cloud PDF imports. Refresh the import screen.');
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      throw new HttpError(403, 'Invalid origin.');
    if (
      !request.headers.get('content-type')?.startsWith('multipart/form-data;')
    )
      throw new HttpError(415, 'Upload the PDFs using the source import form.');
    const limit = 101 * 1024 * 1024;
    if (Number(request.headers.get('content-length')) > limit)
      throw new HttpError(413, 'Upload at most two 50 MB PDFs.');
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, 'Choose the PDF files to upload.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, 'Upload at most two 50 MB PDFs.');
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const form = await new Response(bytes, {
      headers: { 'Content-Type': request.headers.get('content-type')! },
    }).formData();
    return Response.json(await startImport(form), { status: 202, headers });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const body = z
      .object({
        id: z.string(),
        records: z.array(importRecordSchema).min(1).max(500),
        paperVerified: z.boolean(),
        paperNotes: z.string().max(3000),
        revision:z.number().int().nonnegative().optional(),
      })
      .strict()
      .parse(await readBody(request, 10_000_000));
    return Response.json(
      cloudEnabled() ? await saveCloudReview(body.id,body.records,body.paperVerified,body.paperNotes,body.revision) : saveImportReview(
        body.id,
        body.records,
        body.paperVerified,
        body.paperNotes,
      ),
      { headers },
    );
  } catch (error) {
    return apiError(error);
  }
}

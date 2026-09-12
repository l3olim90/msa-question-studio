import {readBody,apiError} from '@/lib/security';
import {graphSchema} from '@/lib/schema';
import {desmosExpressions} from '@/lib/desmos';
export async function POST(request:Request){try{const graph=graphSchema.parse(await readBody(request));const key=process.env.DESMOS_API_KEY;if(typeof key!=='string'||!key)throw new Error('Desmos is not configured.');return Response.json({key,expressions:desmosExpressions(graph)},{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}

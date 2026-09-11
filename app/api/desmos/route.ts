import {env} from 'cloudflare:workers';
import {graphSchema} from '@/lib/schema';
import {desmosExpressions} from '@/lib/desmos';
export async function POST(request:Request){try{const graph=graphSchema.parse(await request.json());const key=(env as Record<string,unknown>).DESMOS_API_KEY;if(typeof key!=='string'||!key)throw new Error('Desmos is not configured.');return Response.json({key,expressions:desmosExpressions(graph)},{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:(e as Error).message},{status:400});}}

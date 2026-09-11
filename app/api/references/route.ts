import {retrieve,references} from '@/lib/retrieval';
export async function POST(request:Request){try{const ctx=retrieve(await request.json());return Response.json({references:references(ctx),exactExamples:ctx.exactCount},{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:(e as Error).message},{status:400});}}

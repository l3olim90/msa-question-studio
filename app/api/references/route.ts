import {withBank} from '@/lib/bank-data';
import {readBody,apiError} from '@/lib/security';
import {retrieve,references,topicWideMcqBrief} from '@/lib/retrieval';
export async function POST(request:Request){try{const raw:any=await readBody(request);return await withBank(() => {const ctx=retrieve(raw?.questionType==='MCQ'?topicWideMcqBrief(raw):raw);return Response.json({references:references(ctx),exactExamples:ctx.exactCount},{headers:{'Cache-Control':'no-store'}});});}catch(e){return apiError(e);}}

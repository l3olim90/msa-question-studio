import {ServiceResponseError} from '@/lib/service-response';
import {generate} from '@/lib/generation';
import {generateMcqCandidates} from '@/lib/candidates';
import {serverConfig} from '@/lib/server-config';
import {readBody,generationSlot,HttpError,apiError} from '@/lib/security';
import {z} from 'zod';
const payload=z.object({brief:z.unknown(),previous:z.unknown().optional(),edit:z.string().max(3000).optional()}).strict();
export async function POST(request:Request){let release:(()=>void)|undefined;try{
 const body=payload.parse(await readBody(request));const configured=serverConfig();
 const key=configured.key.trim();
 if(!key||key.length>500)throw new HttpError(422,'Configure the selected provider API key in the server .env file and restart the app.');
 const connection=configured.connection;
 release=generationSlot();const brief=body.brief as any;
 return Response.json(brief?.questionType==='MCQ'&&!body.previous?await generateMcqCandidates(key,brief,connection):await generate(key,brief,body.previous,body.edit,connection),{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof ServiceResponseError)return Response.json({error:e.message,retryable:e.retryable},{status:400,headers:{'Cache-Control':'no-store'}});if((e as Error).name==='ParseError')return apiError(new Error('The generated maths could not be formatted correctly. Please retry.'));return apiError(e);}finally{release?.();}}

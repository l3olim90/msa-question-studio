import {ContentSafetyError} from './content-safety';
import { DatabaseUnavailableError } from './database-connection';
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export async function readBody(request:Request,limit=250000){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new HttpError(403,'Invalid origin.');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'Use application/json.');
 if(Number(request.headers.get('content-length'))>limit)throw new HttpError(413,'Request too large.');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Missing request body.');
 const decoder=new TextDecoder();let size=0,text='';while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new HttpError(413,'Request too large.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
 try{return JSON.parse(text);}catch{throw new HttpError(400,'Invalid request JSON.');}
}
let active=0;const starts:number[]=[];
export function generationSlot(){const now=Date.now();while(starts.length&&starts[0]<now-60000)starts.shift();if(active>=2||starts.length>=6)throw new HttpError(429,'Generation capacity reached. Wait before trying again.');active++;starts.push(now);let released=false;return()=>{if(!released){released=true;active--;}};}
export function apiError(e:unknown){
 if(e instanceof DatabaseUnavailableError)return Response.json({error:e.operationMayHaveRun?'The database connection was interrupted. Check the repository before retrying an approval, as its save may already have completed. Your draft is still available on this page.':'The database is temporarily unavailable. Please try again; your draft is still available on this page.',retryable:!e.operationMayHaveRun},{status:503,headers:{'Cache-Control':'no-store'}});
 const error=e as Error;
 const known=e instanceof HttpError||e instanceof ContentSafetyError;
 // Never send SQL errors, filesystem paths, provider payloads or stack traces.
 return Response.json({error:known?error.message:error?.name==='ZodError'?'Please check the brief and draft format.':'The request could not be completed. Check your selections or try again. If this persists, contact the app maintainer.',retryable:false},{status:e instanceof HttpError?e.status:e instanceof ContentSafetyError?422:error?.name==='ZodError'?400:500,headers:{'Cache-Control':'no-store'}});
}

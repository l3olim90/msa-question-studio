export class ServiceResponseError extends Error {
 constructor(message:string,public retryable:boolean){super(message);this.name='ServiceResponseError';}
}
export async function readServiceJSON(response:Response,service:string):Promise<any>{
 const text=await response.text();
 try{return JSON.parse(text);}catch{
  const auth=response.status===401||response.status===403||response.redirected;
  throw new ServiceResponseError(auth?`${service} returned a sign-in or access page. Refresh the app and check your access.`:`${service} returned ${/^\s*</.test(text)?'an HTML page':'an invalid or incomplete response'} instead of question data (HTTP ${response.status}). This can happen during a service interruption or timeout.`,!auth);
 }
}
// A fresh request uses the identical serialized brief and edit context. At most one retry.
export async function generationRequest(body:string,signal:AbortSignal,onRetry:()=>void){
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body,signal});
   const data=await readServiceJSON(response,'The generation service');
   if(!response.ok)throw new ServiceResponseError(data.error||`Generation failed (HTTP ${response.status}).`,data.retryable===true||response.status>=500||response.status===429);
   return data;
  }catch(error){
   if(signal.aborted||(error as Error).name==='AbortError')throw error;
   const retryable=error instanceof ServiceResponseError?error.retryable:error instanceof TypeError;
   if(attempt||!retryable)throw error;
   onRetry();
   await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},1500);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  }
 }
 throw new Error('Generation failed after retry.');
}

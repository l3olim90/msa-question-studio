import {z} from 'zod';
export const connectionSchema=z.object({provider:z.enum(['openai','azure','anthropic']).default('openai'),endpoint:z.string().max(250).default(''),deployment:z.string().max(100).default('')});
export type Connection=z.infer<typeof connectionSchema> & {apiVersion?:string};
export async function providerError(r:Response,provider:string,key:string){
 let error:any;try{const data:any=await r.json();error=data.error||data;}catch{error={};}
 const clean=(value:unknown)=>typeof value==='string'?value.split(key).join('[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/sk-[a-zA-Z0-9_-]+/g,'[redacted]').replace(/[\u0000-\u001f]/g,' ').slice(0,1000):'';
 const message=clean(error.message),code=clean(error.code||error.type),param=clean(error.param);
 const fallback=r.status===401?'The API key was not accepted.':r.status===429?'Rate or credit limit reached.':r.status===403||r.status===404?'Check model access, resource endpoint and deployment name.':'The provider rejected the request.';
 return new Error(`${provider} request failed (${r.status})${code?` [${code}]`:''}${param?` (${param})`:''}: ${message||fallback}`);
}
export function azureURL(endpoint:string){const u=new URL(endpoint);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!/^([a-z0-9-]+)\.(openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)$/.test(u.hostname)||!['','/','/openai/v1','/openai/v1/'].includes(u.pathname))throw new Error('Enter your Azure resource HTTPS endpoint, for example https://your-resource.openai.azure.com.');return `${u.origin}/openai/v1/responses`;}
export function modelFor(c:Connection){return c.provider==='anthropic'?'claude-sonnet-5':c.provider==='azure'?c.deployment:'gpt-5.6-sol';}
function compatibleSchema(v:any):any{if(Array.isArray(v))return v.map(compatibleSchema);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','minItems','maxItems','default'].includes(k)).map(([k,x])=>[k,compatibleSchema(x)]));return v;}
export function anthropicMessages(input:any){if(typeof input==='string')return [{role:'user',content:input}];const messages:any[]=[];for(const item of input){if(item.type==='anthropic_message'){messages.push({role:'assistant',content:item._anthropicContent});continue;}if(item.type==='function_call_output'){const block={type:'tool_result',tool_use_id:item.call_id,content:item.output};const last=messages.at(-1);if(last?.role==='user'&&Array.isArray(last.content)&&last.content[0]?.type==='tool_result')last.content.push(block);else messages.push({role:'user',content:[block]});continue;}if(!item.role)continue;messages.push({role:item.role,content:typeof item.content==='string'?item.content:item.content.map((c:any)=>{if(c.type==='input_text')return {type:'text',text:c.text};if(c.type==='input_image'){const match=/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(c.image_url);if(!match)throw new Error('Invalid reference image.');return {type:'image',source:{type:'base64',media_type:match[1],data:match[2]}};}throw new Error('Unsupported input block.');})});}return messages;}
export async function providerResponse(key:string,body:any,connection:Connection){
 const c=connectionSchema.parse(connection);const model=modelFor(c);if(!model.trim())throw new Error('Enter your Azure deployment name.');
 let url='https://api.openai.com/v1/responses';let headers:Record<string,string>={'Content-Type':'application/json',Authorization:`Bearer ${key}`};let payload:any={model,reasoning:{effort:'high'},include:['reasoning.encrypted_content'],store:false,max_output_tokens:16000,...body};
 if(c.provider==='azure'){url=azureURL(c.endpoint);headers={'Content-Type':'application/json','api-key':key};}
 if(c.provider==='azure'){
  payload.text={...payload.text,format:{...payload.text.format,schema:compatibleSchema(payload.text.format.schema)}};
 }
 if(c.provider==='anthropic'){url='https://api.anthropic.com/v1/messages';headers={'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'};payload={model,max_tokens:24000,thinking:{type:'adaptive'},system:body.instructions,messages:anthropicMessages(body.input),output_config:{effort:'high',format:{type:'json_schema',schema:compatibleSchema(body.text.format.schema)}},...(body.tools?{tools:body.tools.map((t:any)=>({name:t.name,description:t.description,input_schema:t.parameters,strict:true}))}:{})};}
 const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(180000)});
 if(r.status>=300&&r.status<400)throw new Error('The provider endpoint returned a redirect. Check the endpoint; the API key was not forwarded.');
 if(!r.ok)throw await providerError(r,c.provider,key);
 const data:any=await r.json();if(data.status==='incomplete'||data.stop_reason==='max_tokens')throw new Error('The model ran out of output space. Please simplify the request.');
 if(c.provider!=='anthropic')return data;
 const output:any[]=[{type:'anthropic_message',_anthropicContent:data.content}];for(const block of data.content||[]){if(block.type==='tool_use')output.push({type:'function_call',name:block.name,call_id:block.id,arguments:JSON.stringify(block.input)});if(block.type==='text')output.push({type:'message',content:[{type:'output_text',text:block.text}]});}return {output};
}


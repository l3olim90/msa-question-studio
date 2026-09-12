import {calculate} from './calculator';
export const calculatorTool={type:'function',name:'calculate',description:'Evaluate ONE mathjs expression. Use separate calls for separate results, not comma-separated expressions. Use i and radians.',strict:true,parameters:{type:'object',properties:{expression:{type:'string'}},required:['expression'],additionalProperties:false}};
// Every review starts with a new ledger tied to exactly its current draft.
export async function reviewWithCalculations(response:(body:any)=>Promise<any>,body:any){
 let input=body.input;const calculations:{expression:string;result:string}[]=[];
 let callsUsed=0;const cache=new Map<string,string>();
 for(let round=0;round<4;round++){
  const enabled=round<3&&callsUsed<12;
  const r=await response({...body,input,...(enabled?{tools:[calculatorTool]}:{}),instructions:body.instructions+(enabled?'':' Calculator checks are finished. Return the review JSON now. Never treat a failed or unavailable check as proof of correctness.')});
  const calls=r.output?.filter((o:any)=>o.type==='function_call')||[];
  if(!calls.length)return {response:r,calculations};
  if(!enabled)throw new Error('The review did not finish within its calculator budget.');
  if(typeof input==='string')input=[{role:'user',content:input}];
  input=[...input,...r.output];
  for(const call of calls){let result:string;
   try{
    const {expression}=JSON.parse(call.arguments);if(call.name!=='calculate')throw new Error('Unsupported tool');
    if(++callsUsed>12)throw new Error('Review calculator limit reached');
    if(cache.has(expression))result=cache.get(expression)!;
    else{result=calculate(expression);cache.set(expression,result);calculations.push({expression,result});}
   }catch(error){result=`Calculation failed: ${(error as Error).message}. Use one supported expression per call. This is not a verified result.`;}
   input.push({type:'function_call_output',call_id:call.call_id,output:result});
  }
 }
 throw new Error('The review did not finish.');
}

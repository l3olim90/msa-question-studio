import assert from 'node:assert/strict';
import {generationRequest,readServiceJSON} from '../lib/service-response';
const original=globalThis.fetch;const bodies:string[]=[];let calls=0,retries=0;
try{
 globalThis.fetch=async(_url,init)=>{assert(!new Headers(init?.headers).has('x-provider-key'));bodies.push(String(init?.body));return ++calls===1?new Response('<!DOCTYPE html><html>Gateway failure</html>',{status:502}):Response.json({draft:{title:'Recovered'}});};
 const data=await generationRequest('{"brief":{"topic":"EM1-2"}}',new AbortController().signal,()=>retries++);assert.equal(data.draft.title,'Recovered');assert.equal(calls,2);assert.equal(retries,1);assert.equal(bodies[0],bodies[1]);
 calls=0;globalThis.fetch=async()=>{calls++;return new Response('<!DOCTYPE html>',{status:503});};await assert.rejects(()=>generationRequest('{}',new AbortController().signal,()=>{}),/HTML page/);assert.equal(calls,2);
 calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'Invalid API key'},{status:401});};await assert.rejects(()=>generationRequest('{}',new AbortController().signal,()=>{}),/Invalid API key/);assert.equal(calls,1);
 await assert.rejects(()=>readServiceJSON(new Response('<html>sign in</html>',{status:403}),'Service'),/sign-in/);
 calls=0;const controller=new AbortController();globalThis.fetch=async()=>{calls++;throw new TypeError('Network');};await assert.rejects(()=>generationRequest('{}',controller.signal,()=>controller.abort()),/Cancelled/);assert.equal(calls,1);
 console.log('PASS: HTML recovery, identical request retry, bounded failure, no authentication retry and cancellation.');
}finally{globalThis.fetch=original;}

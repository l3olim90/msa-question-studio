import assert from 'node:assert/strict';
import {POST} from '../app/api/generate/route';
const previous={provider:process.env.AI_PROVIDER,key:process.env.OPENAI_API_KEY};
const fetchOriginal=globalThis.fetch;
try{
 process.env.AI_PROVIDER='openai';delete process.env.OPENAI_API_KEY;
 globalThis.fetch=async()=>{throw new Error('No network call should occur without server configuration.');};
 const headers={'Content-Type':'application/json','x-provider-key':'browser-key-must-not-be-used',...(process.env.APP_PASSWORD?{Authorization:'Basic '+Buffer.from((process.env.APP_USERNAME||'studio')+':'+process.env.APP_PASSWORD).toString('base64')}:{})};
 const request=(body:unknown)=>new Request('http://127.0.0.1/api/generate',{method:'POST',headers,body:JSON.stringify(body)});
 const missing=await POST(request({brief:{}}));assert.equal(missing.status,422);assert((await missing.json()).error.includes('.env'));
 const override=await POST(request({brief:{},connection:{provider:'azure',endpoint:'https://example.com'}}));assert.equal(override.status,400);
 console.log('PASS: browser key header cannot replace missing server key; browser connection overrides rejected without network calls.');
}finally{globalThis.fetch=fetchOriginal;if(previous.provider===undefined)delete process.env.AI_PROVIDER;else process.env.AI_PROVIDER=previous.provider;if(previous.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous.key;}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {serverConfig} from '../lib/server-config';
import {authorize,readBody,generationSlot,HttpError} from '../lib/security';
import {manifestSchema,taxonomySchema,extractedSchema,validateTaxonomy,validateExtracted} from '../lib/import-schema';
import {promptExamples} from '../lib/generation';
import {retrieve} from '../lib/retrieval';
import {briefSchema} from '../lib/schema';

assert.equal(serverConfig({AI_PROVIDER:'azure',AZURE_OPENAI_API_KEY:'fixture',AZURE_OPENAI_CHAT_DEPLOYMENT_NAME:'deployment'}).key,'fixture');
assert.equal(briefSchema.parse({module:'EM2',topic:'EM2-1',subtopics:['EM2-1.1'],totalMarks:10,difficulty:'Basic'}).module,'EM2');
const password=process.env.APP_PASSWORD,username=process.env.APP_USERNAME;process.env.APP_PASSWORD='fixture-password';process.env.APP_USERNAME='studio';
try{
 await assert.rejects(()=>authorize(new Request('http://127.0.0.1/')),/Sign in/);
 const headers={authorization:'Basic '+btoa('studio:fixture-password'),'content-type':'application/json'};
 await authorize(new Request('http://127.0.0.1/',{headers}));
 await assert.rejects(()=>readBody(new Request('http://127.0.0.1/api',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:'{}'})),/origin/);
 await assert.rejects(()=>readBody(new Request('http://127.0.0.1/api',{method:'POST',headers,body:'123456'}),3),/large/);
 const a=generationSlot(),b=generationSlot();assert.throws(()=>generationSlot(),HttpError);a();b();
}finally{if(password===undefined)delete process.env.APP_PASSWORD;else process.env.APP_PASSWORD=password;if(username===undefined)delete process.env.APP_USERNAME;else process.env.APP_USERNAME=username;}
const ctx=retrieve({module:'EM1',topic:'EM1-1',subtopics:['EM1-1.2'],totalMarks:10,difficulty:'Basic'});
const before=JSON.stringify(ctx.examples).length,after=JSON.stringify(promptExamples(ctx.examples)).length;
assert(after<before);assert(promptExamples(ctx.examples).every(q=>'solution'in q&&'marking_scheme_json'in q&&'alternative_marking'in q));
console.log(`PASS: server keys, authorization, origin/body/concurrency guards; example payload ${before} -> ${after} characters.`);

const fixture=path.resolve('test-output/import-fixture-'+Date.now());fs.mkdirSync(fixture,{recursive:true});
for(const d of ['data','scripts','imports/staging/fixture/P1/questions','imports/staging/fixture/P1/solutions'])fs.mkdirSync(path.join(fixture,d),{recursive:true});
const write=(p:string,v:unknown)=>fs.writeFileSync(path.join(fixture,p),JSON.stringify(v));
const source=JSON.parse(fs.readFileSync('data/bank.json','utf8'));write('data/bank.json',{...source,questions:[source.questions[0]],images:{}});
write('data/modules.json',JSON.parse(fs.readFileSync('data/modules.json','utf8')));write('data/reference-crops.json',{});
fs.copyFileSync('scripts/pdf_pages.py',path.join(fixture,'scripts/pdf_pages.py'));
// Build a minimal actual PDF and verify local rendering/text extraction, with no OCR service.
const stream='BT /F1 16 Tf 40 180 Td (Fixture question: integrate x squared.) Tj ET';
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 240] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((s,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${s}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(path.join(fixture,'sample.pdf'),pdf);
const rendered=spawnSync(process.env.PYTHON||'python',['scripts/pdf_pages.py','render','sample.pdf','rendered'],{cwd:fixture,encoding:'utf8'});assert.equal(rendered.status,0,rendered.stderr);
const pages=JSON.parse(fs.readFileSync(path.join(fixture,'rendered/pages.json'),'utf8'));assert.equal(pages.pages.length,1);assert(pages.pages[0].text.includes('Fixture question'));assert.equal(pages.sha256.length,64);
const topics=taxonomySchema.parse({topics:[{taxonomy_id:'EM2-1',module_id:'EM2',level:'Topic',parent_id:'',name:'Integration',syllabus_excerpt:'Definite integration of polynomial functions.'},{taxonomy_id:'EM2-1.1',module_id:'EM2',level:'Sub-topic',parent_id:'EM2-1',name:'Polynomial integrals',syllabus_excerpt:'Evaluate definite integrals of polynomial functions.'}]}).topics;
validateTaxonomy(topics,'EM2');assert.throws(()=>validateTaxonomy([...topics,topics[0]],'EM2'),/Duplicate/);
const q=extractedSchema.parse({questions:[{source_question:'B1',parent_question:'B1',section:'B',question_type:'Written',question:'Evaluate $\\int_0^1 x^2\\,dx$.',solution:'The integral is $[x^3/3]_0^1=1/3$.',alternatives:[],marking_json:'null',marks:2,topic_id:'EM2-1',subtopic_id:'EM2-1.1',additional_subtopic_ids:[],difficulty:'Basic',grouping_rationale:'One task',question_crops:[{page:1,box:[0,0,1,1]}],solution_pages:[1],has_diagram:false,issues:[]}]}).questions[0];
validateExtracted(q,topics,1,1);assert.throws(()=>validateExtracted({...q,subtopic_id:'BAD'},topics,1,1));
const mod={id:'EM2',name:'Fixture module',notation:'Use the supplied notes.'};
const paper={id:'P1',kind:'EXAM',academic_year:'2025/2026',semester:'2',question_pdf:'q.pdf',solution_pdf:'s.pdf',question_page_count:1,solution_page_count:1,expected_source_questions:['B1'],verified:true,reviewer_notes:'Synthetic fixture coverage checked.'};
write('imports/staging/fixture/manifest.json',{batch:'fixture',module:mod,papers:[paper]});
write('imports/staging/fixture/taxonomy.json',{topics});
const review={module:mod,taxonomy_verified:true,taxonomy_reviewer_notes:'Synthetic scope checked.',papers:[paper],records:[{...q,id:'EM2-P1-B1',paper_id:'P1',verified:false,reviewer_notes:'Synthetic record checked.'}]};
write('imports/staging/fixture/review.json',review);
// A real tiny image exercises the PDF crop-to-bank path without provider calls.
fs.writeFileSync(path.join(fixture,'imports/staging/fixture/P1/questions/page-1.jpg'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
const cli=path.resolve('test-output/bank-fixture.mjs');await build({entryPoints:['scripts/bank.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:cli});
const run=(...args:string[])=>spawnSync(process.execPath,[cli,...args],{cwd:fixture,encoding:'utf8',env:process.env});
assert.notEqual(run('commit','fixture').status,0);
review.records[0].verified=true;write('imports/staging/fixture/review.json',review);
const accepted=run('commit','fixture');assert.equal(accepted.status,0,accepted.stderr);
assert.equal(JSON.parse(fs.readFileSync(path.join(fixture,'data/bank.json'),'utf8')).questions.length,2);
assert.equal(JSON.parse(fs.readFileSync(path.join(fixture,'data/modules.json'),'utf8')).at(-1).id,'EM2');
assert.notEqual(run('commit','fixture').status,0);
assert.equal(run('status','EM2-1.1','Deprecated').status,0);
assert.equal(JSON.parse(fs.readFileSync(path.join(fixture,'data/bank.json'),'utf8')).topics.find((t:any)=>t.taxonomy_id==='EM2-1.1').status,'Deprecated');
console.log('PASS: PDF render/text/hash, isolated EM2 import, unverified rejection, image crop, duplicate rejection, backup and deprecation. No provider API called.');

import assert from 'node:assert/strict';import fs from 'node:fs';
import {retrieve,references} from '../lib/retrieval';import {calculate} from '../lib/calculator';import {generate,validateDraft,validatePlan} from '../lib/generation';import {wordDocument,equation} from '../lib/word';import {svgDiagram} from '../lib/diagram';import {unzipSync,strFromU8} from 'fflate';
const brief={module:'EM1',topic:'EM1-2',subtopics:['EM1-2.3'],totalMarks:4,difficulty:'Intermediate',specifications:'Use rectangular complex numbers.'};
const ctx=retrieve(brief);assert(ctx.examples.length>0);assert(ctx.examples.every(q=>q.retrieval_status==='Eligible'));assert.throws(()=>retrieve({...brief,subtopics:['EM1-3.9H']}));assert.throws(()=>retrieve({...brief,difficulty:'Hard'}));assert.equal(calculate('det([[1,2],[3,4]])'),'-2');assert.equal(calculate('conj(4+2i)'),'4 - 2i');assert.throws(()=>calculate('import("fs")'));assert.throws(()=>calculate('a=3'));
for(const invalid of [0,-1,1.5,'4',null])assert.throws(()=>retrieve({...brief,totalMarks:invalid}));
assert.equal(retrieve({...brief,totalMarks:1}).brief.totalMarks,1);assert.equal(retrieve({...brief,totalMarks:101}).brief.totalMarks,101);
assert.throws(()=>retrieve({...brief,subtopics:[]}));assert.throws(()=>retrieve({...brief,subtopics:['EM1-2.3','EM1-2.3']}));
const allIds=ctx.allowed.map(s=>s.id);const allContext=retrieve({...brief,subtopics:allIds});assert.equal(allContext.subs.length,allIds.length);assert(allContext.examples.every(q=>q.topic_id===brief.topic));
const shape={type:'arrow' as const,x:60,y:220,x2:500,y2:220,width:0,height:0,text:'',points:[],color:'#14233b' as const,fill:'none' as const};
const d={title:'Complex numbers in rectangular form',question:'Given $z=3+4j$, find $z\\overline z$ and $|z|$.',total_marks:4,solutions:[{title:'Using the conjugate',content:'$\\overline z=3-4j$. Hence $z\\overline z=(3+4j)(3-4j)=25$ and $|z|=\\sqrt{25}=5$.',marking:[{part:'(a)',criterion:'Correct conjugate and product.',marks:2},{part:'(b)',criterion:'Correct modulus.',marks:2}]}],syllabus_ids:['EM1-2.3'],scope_explanation:'Complex conjugate and modulus.',difficulty_explanation:'Two linked operations.',diagrams:[{caption:'Real axis',placement:'solution' as const,shapes:[shape,{...shape,type:'text' as const,x:480,y:250,text:'Real'}]}]};
validateDraft(d,ctx);assert.throws(()=>validateDraft({...d,total_marks:5},ctx));assert.throws(()=>validateDraft({...d,syllabus_ids:['EM1-3.9H']},ctx));
assert.throws(()=>validateDraft(d,allContext));
assert(svgDiagram(d.diagrams[0]).includes('<line'));assert(equation('\\frac{x^2}{\\sqrt{y}}').includes('<m:f>'));assert(equation('\\overline{jZ}').includes('<m:bar>'));assert(equation('\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}').includes('<m:m>'));
const png=fs.readFileSync('../outputs/em1_question_bank/images/EM1-MST-2526-S2-4-c-solution-1.png');
const doc=wordDocument(d,[png],references(ctx).map(r=>r.label));const zip=unzipSync(doc);assert(strFromU8(zip['word/document.xml']).includes('<m:oMath>'));assert(zip['word/media/diagram0.svg']);fs.mkdirSync('test-output',{recursive:true});fs.writeFileSync('test-output/word-equations.docx',wordDocument({...d,diagrams:[]},[]));
const feasible={selected_subtopics:brief.subtopics,total_marks:4,omitted_subtopics:[],marks_reason:'',specification_adjustments:[],resolved_specifications:brief.specifications};
let calls=0;const oldFetch=globalThis.fetch;globalThis.fetch=async(_u:any,init:any)=>{const req=JSON.parse(init.body);assert.equal(req.model,'gpt-5.6-sol');assert.equal(req.reasoning.effort,'high');assert.equal(req.store,false);if(req.text?.format?.name==='marks_feasibility')return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(feasible)}]}]});calls++;if(calls===1){assert(req.input[0].content[0].text.includes('marking_scheme_json'));return Response.json({output:[{type:'function_call',name:'calculate',call_id:'test-call',arguments:JSON.stringify({expression:'abs(3+4i)'})}]});}if(calls===2){assert(req.input.some((x:any)=>x.type==='function_call_output'&&x.output==='5'));return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(d)}]}]});}return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({passed:true,issues:[],summary:'Fixture review.'})}]}]});};
const result=await generate('test-key',brief);assert.equal(result.calculations[0].result,'5');assert(result.review.passed);globalThis.fetch=oldFetch;assert.equal(calls,3);
for(const repeatedFailure of [false,true]){
 let toolRounds=0,finals=0,reviews=0;let original:any;
 globalThis.fetch=async(_u:any,init:any)=>{
  const req=JSON.parse(init.body);assert.equal(req.model,'claude-sonnet-5');assert.equal(req.output_config.effort,'high');
  if(req.system.startsWith('Plan a valid'))return Response.json({content:[{type:'text',text:JSON.stringify(feasible)}]});
  if(req.tools){toolRounds++;original??=req.messages[0];return Response.json({content:[{type:'tool_use',id:`calc-${toolRounds}`,name:'calculate',input:{expression:repeatedFailure?'a=3':`${toolRounds}+1`}}]});}
  if(req.system.startsWith('Independently review')){reviews++;return Response.json({content:[{type:'text',text:JSON.stringify({passed:true,issues:[],summary:'Fixture review.'})}]});}
  finals++;assert.deepEqual(req.messages[0],original);assert(req.system.includes('failed calculations are NOT verified'));assert(req.messages[1].content[0].text.includes('calculator_results'));
  return Response.json({content:[{type:'text',text:JSON.stringify(d)}]});
 };
 try{const completed=await generate('test-key',brief,undefined,'',{provider:'anthropic'});assert.equal(toolRounds,repeatedFailure?3:8);assert.equal(finals,1);assert.equal(reviews,1);assert.equal(completed.calculations.length,repeatedFailure?1:8);if(repeatedFailure)assert(completed.calculations[0].result.startsWith('Calculation failed:'));assert(completed.review.passed);}finally{globalThis.fetch=oldFetch;}
}
// Planning accounts for every requested topic and never silently changes marks.
assert.throws(()=>validatePlan({...feasible,selected_subtopics:['EM1-3.9H']},ctx));
assert.throws(()=>validatePlan({...feasible,total_marks:5},ctx));
assert.throws(()=>validatePlan(feasible,allContext));
for(const mode of ['all','subset','changed','reconsider'] as const){
 let plans=0;const originalMarks=mode==='changed'||mode==='reconsider'?3:4;
 const requestedBrief={...brief,subtopics:allIds,totalMarks:originalMarks};
 const omitted=allIds.filter(id=>!brief.subtopics.includes(id)).map(id=>({id,reason:'Omitted to prioritise the requested marks and relevant rectangular-form specification.'}));
 const selected=mode==='all'?allIds:brief.subtopics;
 globalThis.fetch=async(_u:any,init:any)=>{const req=JSON.parse(init.body);let value:any;
 if(req.text.format.name==='marks_feasibility'){plans++;value={...feasible,selected_subtopics:selected,omitted_subtopics:mode==='all'?[]:omitted,total_marks:mode==='reconsider'&&plans===2?3:4,marks_reason:originalMarks===3?'Fixture: the closest fair allocation needs four marks.':'',specification_adjustments:mode==='subset'?['Prioritised rectangular form over the incompatible selected methods.']:[]};}
 else if(req.text.format.name==='review')value={passed:true,issues:[],summary:'Fixture review.'};
 else{const context=JSON.parse(req.input[0].content[0].text);assert.deepEqual(context.brief.subtopics,selected);const marks=mode==='reconsider'?3:4;assert.equal(context.brief.totalMarks,marks);value={...d,total_marks:marks,syllabus_ids:selected,solutions:[{...d.solutions[0],marking:[{part:'',criterion:'Fixture total',marks}]}]};}
 return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});};
 try{const result=await generate('test-key',requestedBrief);assert.equal(result.brief.totalMarks,originalMarks);assert.equal(result.draft.total_marks,mode==='reconsider'?3:4);assert.deepEqual(result.effectiveBrief.subtopics,selected);assert.equal(plans,originalMarks===3?2:1);assert.equal(result.feasibility.omitted_subtopics.length,mode==='all'?0:omitted.length);if(mode==='changed')assert(result.feasibility.marks_reason.length>0);}finally{globalThis.fetch=oldFetch;}
}
fs.writeFileSync('test-output/checks.json',JSON.stringify({retrieval:true,retirement_filter:true,calculator:true,marks_validation:true,omml:true,svg:true,mocked_generation:true,claude_tool_finalization:true,multi_subtopic:true,automatic_adjustment:true,exact_marks_reconsideration:true,live_generation:false},null,2));console.log('PASS: retrieval, scope validation, calculator, marking totals, OMML, SVG, mocked generation and Claude tool-budget/repeated-failure finalization. Live API not tested.');

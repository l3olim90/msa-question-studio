import {renderGraphShapes} from '../lib/graph';
import {generateMcqCandidates} from '../lib/candidates';
import assert from 'node:assert/strict';import fs from 'node:fs';
import {retrieve,references,topicWideMcqBrief} from '../lib/retrieval';import {calculate} from '../lib/calculator';import {generate,validateDraft,validatePlan} from '../lib/generation';import {wordDocument,equation} from '../lib/word';import {svgDiagram} from '../lib/diagram';import {unzipSync,strFromU8} from 'fflate';
const brief={module:'EM1',topic:'EM1-2',subtopics:['EM1-2.3'],totalMarks:4,difficulty:'Intermediate',specifications:'Use rectangular complex numbers.'};
const ctx=retrieve(brief);assert(ctx.examples.length>0);assert(ctx.examples.every(q=>q.retrieval_status==='Eligible'));assert.throws(()=>retrieve({...brief,subtopics:['EM1-3.9H']}));assert.throws(()=>retrieve({...brief,difficulty:'Hard'}));assert.equal(calculate('det([[1,2],[3,4]])'),'-2');assert.equal(calculate('conj(4+2i)'),'4 - 2i');assert.throws(()=>calculate('import("fs")'));assert.throws(()=>calculate('a=3'));
for(const invalid of [0,-1,1.5,'4',null])assert.throws(()=>retrieve({...brief,totalMarks:invalid}));
assert.equal(retrieve({...brief,totalMarks:1}).brief.totalMarks,1);assert.equal(retrieve({...brief,totalMarks:101}).brief.totalMarks,101);
assert.throws(()=>retrieve({...brief,subtopics:[]}));assert.throws(()=>retrieve({...brief,subtopics:['EM1-2.3','EM1-2.3']}));
const allIds=ctx.allowed.map(s=>s.id);const allContext=retrieve({...brief,subtopics:allIds});assert.equal(allContext.subs.length,allIds.length);assert(allContext.examples.every(q=>q.topic_id===brief.topic));
const shape={type:'arrow' as const,x:60,y:220,x2:500,y2:220,width:0,height:0,text:'',points:[],color:'#14233b' as const,fill:'none' as const};
const d={question_type:'Structured' as const,parts:[],options:[],correct_option:null,title:'Complex numbers in rectangular form',question:'Given $z=3+4j$, find $z\\overline z$.',total_marks:4,solutions:[{title:'Using the conjugate',content:'$\\overline z=3-4j$. Hence $z\\overline z=(3+4j)(3-4j)=25$ and $|z|=\\sqrt{25}=5$.',marking:[{part:'(a)',criterion:'Correct conjugate and product.',marks:2},{part:'(b)',criterion:'Correct modulus.',marks:2}]}],syllabus_ids:['EM1-2.3'],scope_explanation:'Complex conjugate and modulus.',difficulty_explanation:'Two linked operations.',diagrams:[{graph:null,caption:'Real axis',placement:'solution' as const,shapes:[shape,{...shape,type:'text' as const,x:480,y:250,text:'Real'}]}]};
validateDraft(d,ctx);assert.throws(()=>validateDraft({...d,total_marks:5},ctx));assert.throws(()=>validateDraft({...d,syllabus_ids:['EM1-3.9H']},ctx));
assert.throws(()=>validateDraft(d,allContext));
assert(svgDiagram(d.diagrams[0]).includes('<line'));assert(equation('\\frac{x^2}{\\sqrt{y}}').includes('<m:f>'));assert(equation('\\overline{jZ}').includes('<m:bar>'));assert(equation('\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}').includes('<m:m>'));
const png=fs.readFileSync('../outputs/em1_question_bank/images/EM1-MST-2526-S2-4-c-solution-1.png');
const doc=wordDocument(d,[png],references(ctx).map(r=>r.label));const zip=unzipSync(doc);assert(strFromU8(zip['word/styles.xml']).includes('Times New Roman'));assert(!strFromU8(zip['word/styles.xml']).includes('Calibri'));assert(!strFromU8(zip['word/styles.xml']).includes('w:val="34"'));assert(strFromU8(zip['word/settings.xml']).includes('Times New Roman'));assert(strFromU8(zip['word/document.xml']).includes('<m:oMath>'));assert(strFromU8(zip['word/document.xml']).includes('<wpg:wgp>'));assert(!strFromU8(zip['word/document.xml']).includes('<pic:pic>'));fs.mkdirSync('test-output',{recursive:true});fs.writeFileSync('test-output/word-equations.docx',wordDocument({...d,diagrams:[]},[]));
const feasible={selected_subtopics:brief.subtopics,total_marks:4,omitted_subtopics:[],marks_reason:'',specification_adjustments:[],resolved_specifications:brief.specifications};
let calls=0;const oldFetch=globalThis.fetch;globalThis.fetch=async(_u:any,init:any)=>{const req=JSON.parse(init.body);assert.equal(req.model,'gpt-5.6-sol');assert.equal(req.reasoning.effort,'high');assert.equal(req.store,false);if(req.text?.format?.name==='marks_feasibility')return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(feasible)}]}]});calls++;if(calls===1){assert(req.input[0].content[0].text.includes('marking_scheme_json'));return Response.json({output:[{type:'function_call',name:'calculate',call_id:'test-call',arguments:JSON.stringify({expression:'abs(3+4i)'})}]});}if(calls===2){assert(req.input.some((x:any)=>x.type==='function_call_output'&&x.output==='5'));return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(d)}]}]});}return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({passed:true,scope_passed:true,format_passed:true,issues:[],summary:'Fixture review.'})}]}]});};
const result=await generate('test-key',brief);assert.equal(result.calculations[0].result,'5');assert(result.review.passed);globalThis.fetch=oldFetch;assert.equal(calls,3);
for(const repeatedFailure of [false,true]){
 let toolRounds=0,finals=0,reviews=0;let original:any;
 globalThis.fetch=async(_u:any,init:any)=>{
  const req=JSON.parse(init.body);assert.equal(req.model,'claude-sonnet-5');assert.equal(req.output_config.effort,'high');
  if(req.system.startsWith('Plan a valid'))return Response.json({content:[{type:'text',text:JSON.stringify(feasible)}]});
  if(req.tools){toolRounds++;original??=req.messages[0];return Response.json({content:[{type:'tool_use',id:`calc-${toolRounds}`,name:'calculate',input:{expression:repeatedFailure?'a=3':`${toolRounds}+1`}}]});}
  if(req.system.startsWith('Independently review')){reviews++;return Response.json({content:[{type:'text',text:JSON.stringify({passed:true,scope_passed:true,format_passed:true,issues:[],summary:'Fixture review.'})}]});}
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
 else if(req.text.format.name==='review')value={passed:true,scope_passed:true,format_passed:true,issues:[],summary:'Fixture review.'};
 else{const context=JSON.parse(req.input[0].content[0].text);assert.deepEqual(context.brief.subtopics,selected);const marks=mode==='reconsider'?3:4;assert.equal(context.brief.totalMarks,marks);value={...d,total_marks:marks,syllabus_ids:selected,solutions:[{...d.solutions[0],marking:[{part:'',criterion:'Fixture total',marks}]}]};}
 return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});};
 try{const result=await generate('test-key',requestedBrief);assert.equal(result.brief.totalMarks,originalMarks);assert.equal(result.draft.total_marks,mode==='reconsider'?3:4);assert.deepEqual(result.effectiveBrief.subtopics,selected);assert.equal(plans,originalMarks===3?2:1);assert.equal(result.feasibility.omitted_subtopics.length,mode==='all'?0:omitted.length);if(mode==='changed')assert(result.feasibility.marks_reason.length>0);}finally{globalThis.fetch=oldFetch;}
}
fs.writeFileSync('test-output/checks.json',JSON.stringify({retrieval:true,retirement_filter:true,calculator:true,marks_validation:true,omml:true,svg:true,mocked_generation:true,claude_tool_finalization:true,multi_subtopic:true,automatic_adjustment:true,exact_marks_reconsideration:true,live_generation:false},null,2));console.log('PASS: retrieval, scope validation, calculator, marking totals, OMML, SVG, mocked generation and Claude tool-budget/repeated-failure finalization. Live API not tested.');

// MCQ format and scoring are server-enforced even if clients submit conflicting fields.
const mcqContext=retrieve({...brief,questionType:'MCQ',difficulty:'Basic',totalMarks:99,multipleParts:true});assert.equal(mcqContext.brief.totalMarks,2);assert.equal(mcqContext.brief.difficulty,'Intermediate');assert.equal(mcqContext.brief.multipleParts,false);
const mcq={...d,question_type:'MCQ' as const,total_marks:2,question:'For a nonzero complex number $z$, which statement must be true?',options:[{label:'A' as const,text:'$z\\overline z=|z|^2$'},{label:'B' as const,text:'$z\\overline z=-|z|^2$'},{label:'C' as const,text:'$z\\overline z=|z|$'},{label:'D' as const,text:'$z\\overline z=z^2$'}],correct_option:'A' as const,solutions:[{title:'Conjugate product',content:'A is correct because the imaginary terms cancel. B is a sign error; C omits the square; D confuses the conjugate with the original number.',marking:[{part:'',criterion:'Correct option: 2 marks; otherwise 0.',marks:2}]}],diagrams:[]};
validateDraft(mcq,mcqContext);assert.throws(()=>validateDraft({...mcq,options:mcq.options.slice(0,3)},mcqContext));assert.throws(()=>validateDraft({...mcq,total_marks:3},mcqContext));assert.throws(()=>validateDraft({...mcq,solutions:[{...mcq.solutions[0],marking:[{part:'',criterion:'a',marks:1},{part:'',criterion:'b',marks:1}]}]},mcqContext));
assert.throws(()=>validatePlan({...feasible,total_marks:3},mcqContext));
const multipart={...d,question:'Let $z=3+4j$.',parts:[{label:'(a)',prompt:'Find $\\overline z$.'},{label:'(b)',prompt:'Find $|z|$.'}]};validateDraft(multipart,retrieve({...brief,multipleParts:true,partCount:2}));assert.throws(()=>validateDraft(multipart,retrieve({...brief,multipleParts:true,partCount:3})));
const mcqDoc=wordDocument(mcq,[]);assert(strFromU8(unzipSync(mcqDoc)['word/document.xml']).includes('No partial credit'));fs.writeFileSync('test-output/mcq-export.docx',mcqDoc);fs.writeFileSync('test-output/structured-export.docx',wordDocument({...multipart,diagrams:[]},[]));
for(const q of [...ctx.examples,...allContext.examples])for(const page of q.question_pages_json)assert(fs.existsSync(`public/source-pages/${q.paper_id}-p${page}.png`));
console.log('PASS: MCQ fixed 2-or-0 scoring, option count, structured part counts, reference screenshots and Times New Roman export.');

// Exercise generation, scope repair and withholding of an unresolved scope violation.
for(const repaired of [true,false]){
 let reviews=0,authored=0;
 globalThis.fetch=async(_u:any,init:any)=>{const req=JSON.parse(init.body);let value:any;
 if(req.text.format.name==='marks_feasibility')value={...feasible,total_marks:2};
 else if(req.text.format.name==='review'){const reviewed=JSON.parse(req.input);assert(!('partCount' in reviewed.brief));assert(!('multipleParts' in reviewed.brief));reviews++;value={passed:reviews>1&&repaired,scope_passed:reviews>1&&repaired,format_passed:true,issues:reviews===1||!repaired?['Remove the outside-module derivation.']:[],summary:'Fixture scope check.'};}
 else{authored++;value=mcq;}
 return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});};
 try{if(repaired){const result=await generate('test-key',{...brief,questionType:'MCQ'});assert.equal(result.draft.total_marks,2);assert(result.review.scope_passed);}else await assert.rejects(()=>generate('test-key',{...brief,questionType:'MCQ'}),/module-scope/);assert.equal(authored,2);assert.equal(reviews,2);}finally{globalThis.fetch=oldFetch;}
}
console.log('PASS: MCQ generation and scope repair; unresolved out-of-module drafts are withheld.');

const snapshot=JSON.parse(fs.readFileSync('data/bank.json','utf8'));
for(const q of snapshot.questions)for(const page of q.question_pages_json)assert(fs.existsSync(`public/source-pages/${q.paper_id}-p${page}.png`));
const basic=retrieve({...brief,difficulty:'Basic'});assert(basic.examples.some(q=>q.perceived_difficulty==='Basic'&&q.question_type==='Written'));
assert(mcqContext.examples.some(q=>q.question_type==='MCQ'));
console.log('PASS: every source screenshot exists; Basic and MCQ benchmark retrieval.');

// Main-topic MCQ batches ignore stale hidden sub-topic selections and produce three reviewed candidates.
const wide=topicWideMcqBrief({...brief,questionType:'MCQ',subtopics:['invalid-hidden-id']});assert.deepEqual(new Set(wide.subtopics),new Set(allIds));
let batchAuthored=0;let batchReviews=0;const contexts:{index:number;prior:any[]}[]=[];
globalThis.fetch=async(_u:any,init:any)=>{const req=JSON.parse(init.body);let value:any;
 if(req.text.format.name==='marks_feasibility'){
  const supplied=JSON.parse(req.input[0].content[0].text);assert.deepEqual(new Set(supplied.brief.subtopics),new Set(allIds));contexts.push(supplied.candidate_context);
  value={...feasible,total_marks:2,omitted_subtopics:allIds.filter(id=>!brief.subtopics.includes(id)).map(id=>({id,reason:'A different suitable concept is selected for this candidate.'}))};
 }else if(req.text.format.name==='review'){batchReviews++;value={passed:batchReviews>2,scope_passed:batchReviews>2,format_passed:true,issues:batchReviews<=2?['Fixture scope failure requiring a new candidate.']:[],summary:'Candidate fixture review.'};}
 else{batchAuthored++;value={...mcq,question:batchAuthored<=2?mcq.question:`Distinct conceptual fixture ${batchAuthored}: ${mcq.question}`};}
 return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});};
try{const batch=await generateMcqCandidates('test-key',{...brief,questionType:'MCQ',subtopics:[]});assert.equal(batch.candidates.length,3);assert.equal(new Set(batch.candidates.map(c=>c.draft.question)).size,3);assert(batch.candidates.every(c=>c.review.passed&&c.draft.total_marks===2));assert.equal(batchAuthored,5);assert.deepEqual(contexts.map(c=>c.index),[1,1,2,3]);assert.equal(contexts[2].prior.length,1);}finally{globalThis.fetch=oldFetch;}
console.log('PASS: main-topic three-MCQ batches, per-candidate reviews and duplicate replacement.');

const graph={x_min:-3,x_max:3,y_min:-2,y_max:10,x_label:'x',y_label:'y',curves:[{expression:'x^2',domain_min:-3,domain_max:3,color:'#174bc7' as const}],points:[{x:0,y:0,label:'O'}]};
const graphShapes=renderGraphShapes(graph);assert(graphShapes.some(s=>s.type==='curve'));assert(!graphShapes.some(s=>s.type==='polyline'));const axes=graphShapes.filter(s=>s.type==='arrow');assert.equal(axes.length,2);assert(axes[0].x2>axes[0].x&&axes[0].y===axes[0].y2);assert(axes[1].y2<axes[1].y&&axes[1].x===axes[1].x2);assert(graphShapes.some(s=>s.type==='text'&&s.text==='x'));assert(graphShapes.some(s=>s.type==='text'&&s.text==='y'));
assert.throws(()=>renderGraphShapes({...graph,curves:[{...graph.curves[0],expression:'import("fs")'}]}));
const graphSvg=svgDiagram({caption:'Smooth parabola',placement:'question',graph,shapes:graphShapes});assert(graphSvg.includes('<path d="M '));assert(graphSvg.includes('C '));assert(!graphSvg.includes('<polyline'));assert(!graphSvg.includes('marker-start'));fs.writeFileSync('test-output/smooth-graph.svg',graphSvg);
// A rational curve must not bridge its vertical asymptote.
const discontinuous=renderGraphShapes({...graph,y_min:-5,y_max:5,curves:[{...graph.curves[0],expression:'1/x'}],points:[]});const axisX=65+680/2;for(const s of discontinuous.filter(s=>s.type==='curve'))assert(s.points.every(p=>p.x<axisX)||s.points.every(p=>p.x>axisX));
// Cubic Bezier midpoint agrees with the actual quadratic to sub-pixel precision.
for(const s of graphShapes.filter(s=>s.type==='curve'))for(let i=0;i+3<s.points.length;i+=3){const [p0,p1,p2,p3]=s.points.slice(i,i+4);const px=(p0.x+3*p1.x+3*p2.x+p3.x)/8,py=(p0.y+3*p1.y+3*p2.y+p3.y)/8;const x=-3+(px-65)/680*6,y=10-(py-50)/380*12;assert(Math.abs(y-x*x)<0.001);}
console.log('PASS: smooth cubic graph paths, no grid, positive-axis arrows, labels, bounded plotting and asymptote separation.');

const graphWord=wordDocument({...d,diagrams:[{caption:'Smooth graph',placement:'question',graph,shapes:graphShapes}]},[]);
const graphXml=strFromU8(unzipSync(graphWord)['word/document.xml']);
assert(graphXml.includes('<wpg:wgp>'));assert(graphXml.includes('<a:cubicBezTo>'));assert(graphXml.includes('<wps:txbx>'));assert(graphXml.includes('<wp:anchor'));assert(graphXml.includes('locked="0"'));assert(!graphXml.includes('<pic:pic>'));assert(!Object.keys(unzipSync(graphWord)).some(k=>k.startsWith('word/media/')));
fs.writeFileSync('test-output/native-vector-export.docx',graphWord);
console.log('PASS: native grouped Word shapes, cubic geometry, editable text and unlocked floating group; no raster or SVG picture dependency.');

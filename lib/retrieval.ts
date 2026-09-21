import { getBank, getReferenceCrops } from './bank-data';
import { configurationIssues } from './configuration';
import { HttpError } from './security';
import {briefSchema,storedBriefSchema} from './schema';
import { sourceFilterSchema } from './source-selection';
export function retrieve(raw:unknown,preserveConfiguration=false){
 const bank=getBank();
 const issues=configurationIssues(raw,bank.topics.filter(t=>t.status==='Active').map(t=>({id:t.taxonomy_id,parent:t.parent_id,module:t.module_id,level:t.level})),preserveConfiguration);
 if(issues.length)throw new HttpError(422,issues.map(i=>i.field+': '+i.error+' Recommendation: '+i.recommendation).join(' '));
 const b=(preserveConfiguration?storedBriefSchema:briefSchema).parse(raw);const active=bank.topics.filter(t=>t.status==='Active');const topic=active.find(t=>t.taxonomy_id===b.topic&&t.level==='Topic'&&t.module_id===b.module);const subs=active.filter(t=>b.subtopics.includes(t.taxonomy_id)&&t.parent_id===b.topic);
 const matches=(q:typeof bank.questions[number],id:string)=>q.subtopic_id===id||(q.additional_subtopic_ids_json as string[]).includes(id);
 if(!topic||subs.length!==b.subtopics.length)throw new Error('Choose an active module topic and one or more of its active sub-topics.');
 const activeIds=new Set(active.map(t=>t.taxonomy_id));
 const eligible=bank.questions.filter(q=>q.module_id===b.module&&q.topic_id===b.topic&&q.record_status==='Active'&&q.retrieval_status==='Eligible'&&[q.topic_id,q.subtopic_id,...q.additional_subtopic_ids_json].every(id=>activeIds.has(id)));
 const tokens=(b.specifications+' '+subs.map(t=>t.name).join(' ')).toLowerCase().match(/[a-z]{3,}/g)||[];
 const score=(q:typeof eligible[number])=>b.subtopics.reduce((n,id)=>n+(matches(q,id)?100:0),0)+(q.perceived_difficulty===b.difficulty?90:0)+(q.question_type===(b.questionType==='MCQ'?'MCQ':'Written')?60:0)+tokens.reduce((n,t)=>n+((q.question+' '+q.solution).toLowerCase().includes(t)?1:0),0);
 const ranked=eligible.sort((a,c)=>score(c)-score(a));const selected:typeof eligible=[];
 // Cover each selected sub-topic before filling the usual four-example baseline.
 for(const id of b.subtopics){if(selected.some(q=>matches(q,id)))continue;const q=ranked.find(q=>matches(q,id));if(q&&!selected.includes(q))selected.push(q);}
 if(b.questionType==='MCQ'){const mcqExample=ranked.find(q=>q.question_type==='MCQ');if(mcqExample&&!selected.includes(mcqExample))selected.push(mcqExample);}
 // Include a same-topic Basic benchmark rather than judging Basic only from harder examples.
 if(b.difficulty==='Basic'&&b.questionType==='Structured'){const benchmark=ranked.find(q=>q.perceived_difficulty==='Basic'&&q.question_type==='Written');if(benchmark&&!selected.includes(benchmark))selected.push(benchmark);}
 for(const q of ranked){if(selected.length>=Math.max(4,b.subtopics.length))break;if(!selected.some(x=>x.paper_id===q.paper_id&&x.parent_question===q.parent_question))selected.push(q);}
 selected.splice(6);
 if(!selected.length)throw new Error('No eligible examples exist for this topic. Add verified examples before generating.');
 return {brief:b,topic,subs,examples:selected,exactCount:selected.filter(q=>b.subtopics.some(id=>matches(q,id))).length,allowed:active.filter(t=>t.parent_id===b.topic).map(t=>({id:t.taxonomy_id,name:t.name})),images:bank.images as Record<string,string>};
}
// Browse the entire compatible bank, independently of the ranked few-shot limit.
export function sourceQuestions(raw: unknown) {
 const filter=sourceFilterSchema.parse(raw), bank=getBank();
 const active=bank.topics.filter(t=>t.status==='Active');
 if(!active.some(t=>t.taxonomy_id===filter.topic&&t.module_id===filter.module&&t.level==='Topic'))
  throw new HttpError(422,'Choose an active topic in the selected module.');
 const activeIds=new Set(active.map(t=>t.taxonomy_id));
 return bank.questions.filter(q=>q.module_id===filter.module&&q.topic_id===filter.topic&&q.record_status==='Active'&&q.retrieval_status==='Eligible'&&q.question_type===(filter.questionType==='MCQ'?'MCQ':'Written')&&q.perceived_difficulty===filter.difficulty&&[q.topic_id,q.subtopic_id,...q.additional_subtopic_ids_json].every(id=>activeIds.has(id))).sort((a,b)=>a.question_id.localeCompare(b.question_id));
}
export function references(context:Pick<ReturnType<typeof retrieve>,'examples'|'images'>&{brief:{subtopics:string[]}}){return context.examples.map(q=>({id:q.question_id,questionType:q.question_type==='MCQ'?'MCQ' as const:'Structured' as const,label:`${q.paper_type} AY${q.academic_year} S${q.semester} · ${q.source_question}`,question:q.question,solution:q.solution,alternatives:[q.alternative_solution_1,q.alternative_solution_2,q.alternative_solution_3].filter(Boolean),difficulty:q.perceived_difficulty,totalMarks:q.question_marks||null,parentMarks:q.parent_question_marks||null,screenshots:getReferenceCrops()[q.question_id]||[],marking:q.marking_scheme_json,alternativeMarking:[q.alternative_marking_scheme_1_json,q.alternative_marking_scheme_2_json,q.alternative_marking_scheme_3_json],images:[...q.images_json,...q.solution_images_json].map(name=>({name,url:context.images[name]})),match:context.brief.subtopics.some(id=>q.subtopic_id===id||(q.additional_subtopic_ids_json as string[]).includes(id))?'Exact sub-topic':'Related topic'}));}


// MCQ users choose a main topic; hidden or stale sub-topic selections cannot narrow it.
export function topicWideMcqBrief(raw:unknown){
 if(!raw||typeof raw!=='object')throw new Error('Choose a module and main topic.');
 const value=raw as Record<string,unknown>;
 return briefSchema.parse({...value,questionType:'MCQ',subtopics:getBank().topics.filter(t=>t.status==='Active'&&t.module_id===value.module&&t.parent_id===value.topic).map(t=>t.taxonomy_id)});
}

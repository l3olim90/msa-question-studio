import bank from '@/data/bank.json';
import {briefSchema,type Brief} from './schema';
export function retrieve(raw:unknown){
 const b=briefSchema.parse(raw);const active=bank.topics.filter(t=>t.status==='Active');const topic=active.find(t=>t.taxonomy_id===b.topic&&t.level==='Topic'&&t.module_id===b.module);const subs=active.filter(t=>b.subtopics.includes(t.taxonomy_id)&&t.parent_id===b.topic);
 const matches=(q:typeof bank.questions[number],id:string)=>q.subtopic_id===id||(q.additional_subtopic_ids_json as string[]).includes(id);
 if(!topic||subs.length!==b.subtopics.length)throw new Error('Choose an active EM1 topic and one or more of its active sub-topics.');
 const activeIds=new Set(active.map(t=>t.taxonomy_id));
 const eligible=bank.questions.filter(q=>q.module_id===b.module&&q.topic_id===b.topic&&q.record_status==='Active'&&q.retrieval_status==='Eligible'&&[q.topic_id,q.subtopic_id,...q.additional_subtopic_ids_json].every(id=>activeIds.has(id)));
 const tokens=(b.specifications+' '+subs.map(t=>t.name).join(' ')).toLowerCase().match(/[a-z]{3,}/g)||[];
 const score=(q:typeof eligible[number])=>b.subtopics.reduce((n,id)=>n+(matches(q,id)?100:0),0)+(q.perceived_difficulty===b.difficulty?25:0)+tokens.reduce((n,t)=>n+((q.question+' '+q.solution).toLowerCase().includes(t)?1:0),0);
 const ranked=eligible.sort((a,c)=>score(c)-score(a));const selected:typeof eligible=[];
 // Cover each selected sub-topic before filling the usual four-example baseline.
 for(const id of b.subtopics){if(selected.some(q=>matches(q,id)))continue;const q=ranked.find(q=>matches(q,id));if(q&&!selected.includes(q))selected.push(q);}
 for(const q of ranked){if(selected.length>=Math.max(4,b.subtopics.length))break;if(!selected.some(x=>x.paper_id===q.paper_id&&x.parent_question===q.parent_question))selected.push(q);}
 if(!selected.length)throw new Error('No eligible examples exist for this topic. Add verified examples before generating.');
 return {brief:b,topic,subs,examples:selected,exactCount:selected.filter(q=>b.subtopics.some(id=>matches(q,id))).length,allowed:active.filter(t=>t.parent_id===b.topic).map(t=>({id:t.taxonomy_id,name:t.name})),images:bank.images as Record<string,string>};
}
export function references(context:ReturnType<typeof retrieve>){return context.examples.map(q=>({id:q.question_id,label:`${q.paper_type} AY${q.academic_year} S${q.semester} · ${q.source_question}`,question:q.question,solution:q.solution,alternatives:[q.alternative_solution_1,q.alternative_solution_2,q.alternative_solution_3].filter(Boolean),difficulty:q.perceived_difficulty,marking:q.marking_scheme_json,alternativeMarking:[q.alternative_marking_scheme_1_json,q.alternative_marking_scheme_2_json,q.alternative_marking_scheme_3_json],images:[...q.images_json,...q.solution_images_json].map(name=>({name,url:context.images[name]})),match:context.brief.subtopics.some(id=>q.subtopic_id===id||(q.additional_subtopic_ids_json as string[]).includes(id))?'Exact sub-topic':'Related topic'}));}


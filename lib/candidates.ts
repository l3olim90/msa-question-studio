import {generate} from './generation';
import {topicWideMcqBrief} from './retrieval';
import type {Connection} from './providers';
import type {Draft} from './schema';
export const candidateFingerprint=(d:Draft)=>d.question.toLowerCase().replace(/\s+/g,' ').trim();
export async function generateMcqCandidates(key:string,raw:unknown,settings:Partial<Connection>={}){
 const brief=topicWideMcqBrief(raw);const candidates:Awaited<ReturnType<typeof generate>>[]=[];
 for(let index=0;index<3;index++){
  let accepted=false;
  const attempts:Draft[]=[];
  for(let attempt=0;attempt<2;attempt++){
   const candidate=await generate(key,brief,undefined,'',settings,{index:index+1,prior:[...candidates.map(c=>c.draft),...attempts]});
   const duplicate=candidates.some(c=>candidateFingerprint(c.draft)===candidateFingerprint(candidate.draft));
   if(candidate.review.passed&&!duplicate){candidates.push(candidate);accepted=true;break;}
   attempts.push(candidate.draft);
  }
  if(!accepted)throw new Error(`Could not produce three distinct MCQs that pass review (candidate ${index+1}). Please retry or adjust your specifications.`);
 }
 return {candidates};
}

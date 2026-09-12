import {z} from 'zod';
const id=z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);
export const moduleSchema=z.object({id:z.string().regex(/^[A-Z][A-Z0-9_-]{0,19}$/),name:z.string().min(1),notation:z.string().min(1)});
export const topicSchema=z.object({taxonomy_id:id,module_id:z.string(),parent_id:z.string(),level:z.enum(['Topic','Sub-topic']),name:z.string().min(1),syllabus_excerpt:z.string().min(10),status:z.enum(['Active','Deprecated']).default('Active')});
export const taxonomySchema=z.object({topics:z.array(topicSchema).min(1)});
export const taxonomyChunkSchema=z.object({topics:z.array(topicSchema)});
export const extractedSchema=z.object({questions:z.array(z.object({
 source_question:z.string().min(1),parent_question:z.string().min(1),section:z.enum(['A','B','C','Unstated']),
 question_type:z.enum(['MCQ','Written']),question:z.string().min(10),solution:z.string().min(10),
 alternatives:z.array(z.object({solution:z.string().min(1),marking_json:z.string()})).max(3),
 marking_json:z.string(),marks:z.number().positive().nullable(),topic_id:id,subtopic_id:id,additional_subtopic_ids:z.array(id),
 difficulty:z.enum(['Basic','Intermediate','Challenging']),grouping_rationale:z.string(),
 question_crops:z.array(z.object({page:z.number().int().positive(),box:z.array(z.number().min(0).max(1)).length(4)})).min(1),
 solution_pages:z.array(z.number().int().positive()).min(1),has_diagram:z.boolean(),issues:z.array(z.string())
})).min(1)});
export const manifestSchema=z.object({batch:id,module:moduleSchema,notes:z.string().optional(),taxonomy:z.string().optional(),papers:z.array(z.object({id,kind:z.enum(['EXAM','MST']),academic_year:z.string().regex(/^\d{4}\/\d{4}$/),semester:z.enum(['1','2']),question_pdf:z.string(),solution_pdf:z.string()})).min(1)});
export function validateTaxonomy(topics:z.infer<typeof topicSchema>[],moduleId:string){
 const ids=new Set<string>();for(const t of topics){if(ids.has(t.taxonomy_id)||t.module_id!==moduleId)throw new Error('Duplicate taxonomy ID or wrong module.');ids.add(t.taxonomy_id);}
 for(const t of topics)if(t.level==='Sub-topic'&&!topics.some(p=>p.taxonomy_id===t.parent_id&&p.level==='Topic'))throw new Error('Sub-topic has no parent topic.');
}
export function validateExtracted(q:z.infer<typeof extractedSchema>['questions'][number],topics:z.infer<typeof topicSchema>[],questionPages:number,solutionPages:number){
 const topic=topics.find(t=>t.taxonomy_id===q.topic_id&&t.level==='Topic'&&t.status==='Active');
 if(!topic||!topics.some(t=>t.taxonomy_id===q.subtopic_id&&t.parent_id===topic.taxonomy_id&&t.status==='Active')||!q.additional_subtopic_ids.every(id=>topics.some(t=>t.taxonomy_id===id&&t.level==='Sub-topic'&&t.module_id===topic.module_id&&t.status==='Active')))throw new Error('Question has invalid or inactive topic tags.');
 for(const c of q.question_crops)if(c.page>questionPages||c.box[0]>=c.box[2]||c.box[1]>=c.box[3])throw new Error('Invalid question crop or page.');
 if(q.solution_pages.some(p=>p>solutionPages))throw new Error('Invalid solution page.');
 for(const value of [q.marking_json,...q.alternatives.map(a=>a.marking_json)]){const parsed=JSON.parse(value);if(parsed!==null&&(typeof parsed!=='object'||Array.isArray(parsed)))throw new Error('Marking JSON must be an object or null.');}
}

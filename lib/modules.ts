import modules from '@/data/modules.json';
export {modules};
export function moduleFor(id:string){const m=modules.find(m=>m.id===id);if(!m)throw new Error('Unknown module. Import and verify its syllabus first.');return m;}

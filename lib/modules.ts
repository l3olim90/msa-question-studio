import { getModules } from './bank-data';

export function moduleFor(id:string){const m=getModules().find(m=>m.id===id);if(!m)throw new Error('Unknown module. Import and verify its syllabus first.');return m;}

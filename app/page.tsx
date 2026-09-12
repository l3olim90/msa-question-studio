import Studio from './workspace';
import bank from '@/data/bank.json';
import {modules} from '@/lib/modules';
export default function Home(){return <Studio modules={modules} topics={bank.topics.filter(t=>t.status==='Active').map(({taxonomy_id,parent_id,name,level,module_id})=>({id:taxonomy_id,parent:parent_id,name,level,module:module_id}))}/>;}

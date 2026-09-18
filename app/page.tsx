import Studio from './workspace';
import {getBank,getModules,withBank} from '@/lib/bank-data';

export default async function Home(){return withBank(() => <Studio modules={getModules()} topics={getBank().topics.filter(t=>t.status==='Active').map(({taxonomy_id,parent_id,name,level,module_id})=>({id:taxonomy_id,parent:parent_id,name,level,module:module_id}))}/>);}

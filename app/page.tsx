import Studio from './workspace'; import bank from '@/data/bank.json'; export default function Home(){return <Studio topics={bank.topics.filter(t=>t.status==='Active').map(({taxonomy_id,parent_id,name,level})=>({id:taxonomy_id,parent:parent_id,name,level}))}/> }


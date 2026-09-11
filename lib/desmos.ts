import {graphSchema} from './schema';
import {compilePlotFunction,plotLatex} from './calculator';
export function desmosExpressions(raw:unknown):{latex:string;color:string;fillOpacity?:number}[]{
 const graph=graphSchema.parse(raw);
 const regions=graph.regions.map(r=>{
  if(!(r.x_max>r.x_min)||r.x_min<graph.x_min||r.x_max>graph.x_max)throw new Error('Shading bounds must be a nonempty interval within the graph.');
  const lower=compilePlotFunction(r.lower),upper=compilePlotFunction(r.upper);let visible=false;
  for(let i=0;i<=128;i++){const x=r.x_min+(r.x_max-r.x_min)*i/128,a=lower(x),b=upper(x);if(a===null||b===null||a>b+1e-9)throw new Error('Shading needs finite lower and upper boundaries in the correct order. Split the region where curves cross.');if(b>a&&b>graph.y_min&&a<graph.y_max)visible=true;}
  if(!visible)throw new Error('The shaded region has no visible area in the graph bounds.');
  return {latex:`${plotLatex(r.lower)}\\le y\\le ${plotLatex(r.upper)}\\left\\{${r.x_min}\\le x\\le ${r.x_max}\\right\\}`,color:r.color,fillOpacity:0.25};
 });
 return [...regions,...graph.curves.map(c=>({latex:`y=${plotLatex(c.expression)}\\left\\{${c.domain_min}\\le x\\le ${c.domain_max}\\right\\}`,color:c.color}))];
}

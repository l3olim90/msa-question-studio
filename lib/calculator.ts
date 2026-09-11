import {create,all} from 'mathjs';
const math=create(all,{matrix:'Array'});
const allowed=new Set(['sqrt','abs','arg','conj','re','im','complex','sin','cos','tan','asin','acos','atan','atan2','exp','log','log10','det','inv','transpose','multiply','add','subtract','divide','pow','norm','round','simplify','derivative']);
export function calculate(expression:string){
 if(typeof expression!=='string'||expression.length>600)throw new Error('Calculation too long.');
 const node=math.parse(expression);let count=0;
 node.traverse((n:any)=>{if(++count>120)throw new Error('Calculation too complex.');if(!['OperatorNode','ConstantNode','SymbolNode','FunctionNode','ParenthesisNode','ArrayNode'].includes(n.type))throw new Error('Unsupported calculation syntax.');if(n.type==='FunctionNode'&&!allowed.has(n.fn.name))throw new Error('Unsupported function.');if(n.type==='SymbolNode'&&!allowed.has(n.name)&&!['pi','e','i','x','y','t'].includes(n.name))throw new Error('Unsupported symbol.');if(n.type==='OperatorNode'&&!['+','-','*','/','^'].includes(n.op))throw new Error('Unsupported operator.');});
 const result=String(node.evaluate());if(result.length>4000)throw new Error('Result too long.');return result;
}

import {create,all} from 'mathjs';
const math=create(all,{matrix:'Array'});
const allowed=new Set(['sqrt','abs','arg','conj','re','im','complex','sin','cos','tan','asin','acos','atan','atan2','exp','log','log10','det','inv','transpose','multiply','add','subtract','divide','pow','norm','round','simplify','derivative']);
export function calculate(expression:string){
 if(typeof expression!=='string'||expression.length>600)throw new Error('Calculation too long.');
 const node=math.parse(expression);let count=0;
 node.traverse((n:any)=>{if(++count>120)throw new Error('Calculation too complex.');if(!['OperatorNode','ConstantNode','SymbolNode','FunctionNode','ParenthesisNode','ArrayNode'].includes(n.type))throw new Error('Unsupported calculation syntax.');if(n.type==='FunctionNode'&&!allowed.has(n.fn.name))throw new Error('Unsupported function.');if(n.type==='SymbolNode'&&!allowed.has(n.name)&&!['pi','e','i','x','y','t'].includes(n.name))throw new Error('Unsupported symbol.');if(n.type==='OperatorNode'&&!['+','-','*','/','^'].includes(n.op))throw new Error('Unsupported operator.');});
 const result=String(node.evaluate());if(result.length>4000)throw new Error('Result too long.');return result;
}

export function compilePlotFunction(expression:string){
 if(typeof expression!=='string'||expression.length>200)throw new Error('Graph expression is too long.');
 const functions=new Set(['sqrt','abs','sin','cos','tan','asin','acos','atan','exp','log','log10']);
 // Accept conventional explicit-function notation without enabling assignment evaluation.
 const normalized=normalizePlot(expression);
 const node=math.parse(normalized);let count=0;
 node.traverse((n:any)=>{if(++count>80||!['OperatorNode','ConstantNode','SymbolNode','FunctionNode','ParenthesisNode'].includes(n.type))throw new Error('Unsupported graph expression.');if(n.type==='FunctionNode'&&!functions.has(n.fn.name))throw new Error('Unsupported graph function.');if(n.type==='SymbolNode'&&!functions.has(n.name)&&!['x','pi','e'].includes(n.name))throw new Error('Graph expressions must use x as the variable.');if(n.type==='OperatorNode'&&!['+','-','*','/','^'].includes(n.op))throw new Error('Unsupported graph operator.');});
 const compiled=node.compile();return (x:number)=>{try{const y=compiled.evaluate({x});return typeof y==='number'&&Number.isFinite(y)?y:null;}catch{return null;}};
}

function normalizePlot(expression:string){return expression.trim().replace(/^\s*(?:y|f\(x\))\s*=\s*/, '').replace(/−/g,'-').replace(/²/g,'^2').replace(/³/g,'^3').replace(/\^\{([+-]?\d+)\}/g,'^($1)');}
export function plotLatex(expression:string){compilePlotFunction(expression);return math.parse(normalizePlot(expression)).toTex();}

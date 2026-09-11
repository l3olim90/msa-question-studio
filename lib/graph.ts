import {compilePlotFunction} from './calculator';
import type {Draft} from './schema';
type Shape=Draft['diagrams'][number]['shapes'][number];
export function renderGraphShapes(graph:NonNullable<Draft['diagrams'][number]['graph']>):Shape[]{
 const L=65,R=745,T=50,B=430;const {x_min,x_max,y_min,y_max}=graph;
 if(!(x_max>x_min&&y_max>y_min&&x_min<=0&&x_max>0&&y_min<=0&&y_max>0))throw new Error('Graph bounds must include the origin and positive ends of both axes.');
 const px=(x:number)=>L+(x-x_min)/(x_max-x_min)*(R-L),py=(y:number)=>B-(y-y_min)/(y_max-y_min)*(B-T);
 const base:Shape={type:'line',x:0,y:0,x2:0,y2:0,width:0,height:0,text:'',points:[],color:'#14233b',fill:'none'};
 const shapes:Shape[]=[];
 for(const curve of graph.curves){
  const initialShapeCount=shapes.length;
  const start=Math.max(x_min,curve.domain_min),end=Math.min(x_max,curve.domain_max);if(!(end>start))throw new Error('A graph curve needs a nonempty domain within the viewport.');
  const evaluate=compilePlotFunction(curve.expression);let segment:{x:number;y:number}[]=[];let previous:{x:number;y:number}|null=null;let visible=0;
  const flush=()=>{if(segment.length>=4)shapes.push({...base,type:'curve',points:segment,color:curve.color});segment=[];};
  for(let i=0;i<=96;i++){
   const x=start+(end-start)*i/96,y=evaluate(x);
   if(y===null||y<y_min||y>y_max){flush();previous=null;continue;}
   const point={x:px(x),y:py(y)};visible++;
   if(previous&&Math.abs(py(previous.y)-point.y)<=(B-T)/2){
    const dx=x-previous.x,h=dx/1000;
    const nextY=evaluate(previous.x+h),priorY=evaluate(x-h);
    if(nextY===null||priorY===null){flush();previous={x,y};segment=[point];continue;}
    const from={x:px(previous.x),y:py(previous.y)};
    // One-sided derivatives preserve corners such as abs(x), while smooth functions have matching tangents.
    const slopeStart=(nextY-previous.y)/h,slopeEnd=(y-priorY)/h;
    const lo=Math.min(from.y,point.y),hi=Math.max(from.y,point.y),clamp=(v:number)=>Math.max(lo,Math.min(hi,v));
    if(!segment.length)segment=[from];
    segment.push({x:from.x+(point.x-from.x)/3,y:clamp(py(previous.y+slopeStart*dx/3))},{x:point.x-(point.x-from.x)/3,y:clamp(py(y-slopeEnd*dx/3))},point);
    if(segment.length>=97){flush();segment=[point];}
   }else{flush();segment=[point];}
   previous={x,y};
  }
  flush();if(visible<2||shapes.length===initialShapeCount)throw new Error('A graph curve is not visible in its chosen bounds.');
 }
 // Axis directions are fixed: left to right and bottom to top. Only marker-end gets an arrowhead.
 shapes.push({...base,type:'arrow',x:L,y:py(0),x2:R,y2:py(0)},{...base,type:'arrow',x:px(0),y:B,x2:px(0),y2:T});
 const label=(text:string,x:number,y:number)=>shapes.push({...base,type:'text',text,x:Math.max(10,Math.min(790-text.length*11,x)),y:Math.max(24,Math.min(482,y))});
 label(graph.x_label,R-graph.x_label.length*11,py(0)+28);label(graph.y_label,px(0)+14,T-14);label('0',px(0)+8,py(0)+22);
 for(const point of graph.points){if(point.x<x_min||point.x>x_max||point.y<y_min||point.y>y_max)throw new Error('A labelled graph point lies outside the viewport.');shapes.push({...base,type:'ellipse',x:px(point.x),y:py(point.y),width:6,height:6,fill:'#ffffff'});if(point.label)label(point.label,px(point.x)+10,py(point.y)-12);}
 if(shapes.length>80)throw new Error('The graph is too complex for a clear diagram. Simplify its curves or domains.');
 return shapes;
}

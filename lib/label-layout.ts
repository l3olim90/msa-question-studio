import type {Draft} from './schema';
import katex from 'katex';
type Shape=Draft['diagrams'][number]['shapes'][number];
export function labelMetrics(s:Shape){
 const math=s.type==='math';
 const visible=math?katex.renderToString(s.text,{output:'mathml',throwOnError:false}).replace(/<annotation[\s\S]*?<\/annotation>/g,'').replace(/<[^>]+>/g,'').replace(/&[^;]+;/g,'X'):s.text;
 const width=Math.max(40,Math.min(720,visible.length*13+16));
 const lines:string[]=[];for(const paragraph of s.text.split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(line&&line.length+word.length+1>52){lines.push(line);line='';}line+=(line?' ':'')+word;}lines.push(line);}
 const height=math?(/\\(?:frac|sqrt|sum|int)|\^|_/.test(s.text)?65:36):Math.max(36,lines.length*27+8);
 return {width:math?width:Math.max(40,Math.min(720,Math.max(...lines.map(l=>l.length))*13+16)),height,lines};
}
export function layoutLabels(shapes:Shape[]){
 const occupied:{x:number;y:number;width:number;height:number}[]=[];
 return shapes.map(original=>{if(original.type!=='text'&&original.type!=='math')return original;
 const size=labelMetrics(original);const preferred={x:Math.max(8,Math.min(792-size.width,original.x)),y:Math.max(8,Math.min(492-size.height,original.y-22))};
 const candidates=[preferred];for(let distance=28;distance<=800;distance+=28)for(let dx=-distance;dx<=distance;dx+=28)for(const dy of [-distance,distance])candidates.push({x:preferred.x+dx,y:preferred.y+dy});
 const location=candidates.find(p=>p.x>=8&&p.y>=8&&p.x+size.width<=792&&p.y+size.height<=492&&!occupied.some(b=>p.x<b.x+b.width+8&&p.x+size.width+8>b.x&&p.y<b.y+b.height+8&&p.y+size.height+8>b.y));
 if(!location)throw new Error('The diagram has too many text labels to remain readable. Reduce or shorten its labels.');
 occupied.push({...location,...size});return {...original,x:location.x,y:location.y+22,width:size.width,height:size.height};
 });
}

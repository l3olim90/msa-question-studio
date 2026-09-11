import type {Draft} from './schema';
import {escapeXML as esc} from './diagram';
const unit=(v:number)=>Math.round(v*6858);
const fill=(c:string)=>c==='none'?'<a:noFill/>':`<a:solidFill><a:srgbClr val="${c.replace('#','')}"/></a:solidFill>`;
export function wordShapes(diagram:Draft['diagrams'][number],id:number){
 const shapes=diagram.shapes.map((s,index)=>{
  let x=s.x,y=s.y,w=s.width,h=s.height,geom='',text='';
  if(s.type==='text'){
   y=Math.max(0,y-21);w=Math.max(40,800-x);h=40;
   geom='<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
   text=`<wps:txbx><w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:color w:val="${s.color.slice(1)}"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${esc(s.text)}</w:t></w:r></w:p></w:txbxContent></wps:txbx>`;
  }else if(s.type==='rect'||s.type==='ellipse'){
   if(s.type==='ellipse'){x-=w/2;y-=h/2;}
   geom=`<a:prstGeom prst="${s.type}"><a:avLst/></a:prstGeom>`;
  }else{
   const points=s.type==='line'||s.type==='arrow'?[{x:s.x,y:s.y},{x:s.x2,y:s.y2}]:s.points;
   if(!points.length)return '';
   x=Math.min(...points.map(p=>p.x));y=Math.min(...points.map(p=>p.y));w=Math.max(1,Math.max(...points.map(p=>p.x))-x);h=Math.max(1,Math.max(...points.map(p=>p.y))-y);
   const pt=(p:{x:number,y:number})=>`<a:pt x="${unit(p.x-x)}" y="${unit(p.y-y)}"/>`;
   let path=`<a:moveTo>${pt(points[0])}</a:moveTo>`;
   if(s.type==='curve'){for(let i=1;i+2<points.length;i+=3)path+=`<a:cubicBezTo>${points.slice(i,i+3).map(pt).join('')}</a:cubicBezTo>`;}
   else path+=points.slice(1).map(p=>`<a:lnTo>${pt(p)}</a:lnTo>`).join('');
   geom=`<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${unit(w)}" h="${unit(h)}" fill="none">${path}</a:path></a:pathLst></a:custGeom>`;
  }
  return `<wps:wsp><wps:cNvPr id="${id*100+index+1}" name="${s.type} ${index+1}"/><wps:cNvSpPr${s.type==='text'?' txBox="1"':''}/><wps:spPr><a:xfrm><a:off x="${unit(x)}" y="${unit(y)}"/><a:ext cx="${unit(w)}" cy="${unit(h)}"/></a:xfrm>${geom}${fill(s.type==='text'?'none':s.fill)}<a:ln w="13716">${s.type==='text'?'<a:noFill/>':fill(s.color)}${s.type==='arrow'?'<a:tailEnd type="triangle" w="med" len="med"/>':''}</a:ln></wps:spPr>${text}<wps:bodyPr lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></wps:bodyPr></wps:wsp>`;
 }).join('');
 return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:keepNext/></w:pPr><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="0"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="5486400" cy="3429000"/><wp:wrapTopAndBottom/><wp:docPr id="${id}" name="Editable diagram ${id}" descr="${esc(diagram.caption)}"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"><wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5486400" cy="3429000"/><a:chOff x="0" y="0"/><a:chExt cx="5486400" cy="3429000"/></a:xfrm></wpg:grpSpPr>${shapes}</wpg:wgp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
}

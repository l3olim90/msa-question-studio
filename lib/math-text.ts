// JSON escapes such as \f in an incorrectly escaped LaTeX command become control characters.
// Repair only known command fragments, and only within mathematical content.
export function repairLatex(latex:string){
 return latex.replace(/\u000c(rac|box)(?![A-Za-z])/g,'\\f$1')
 .replace(/\u0008(egin|eta|ar|oldsymbol|ig|igg|inom)(?![A-Za-z])/g,'\\b$1')
 .replace(/\r(ight|ho|angle)(?![A-Za-z])/g,'\\r$1')
 .replace(/\t(ext|imes|heta|an|au|frac)(?![A-Za-z])/g,'\\t$1')
 .replace(/\n(eq|abla|u|otin)(?![A-Za-z])/g,'\\n$1');
}
export function mathParts(text:string){return [...text.matchAll(/(?<!\\)\$((?:\\\$|[^$])+)\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g)].map(m=>({raw:m[0],latex:repairLatex(m[1]??m[2]??m[3]),index:m.index!,display:!!m[2]}));}
export function repairMathText(text:string){let result='',pos=0;for(const part of mathParts(text)){result+=text.slice(pos,part.index)+repairLatex(part.raw);pos=part.index+part.raw.length;}return result+text.slice(pos);}
export function repairMathValues(value:unknown):unknown{if(typeof value==='string')return repairMathText(value);if(Array.isArray(value))return value.map(repairMathValues);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,repairMathValues(v)]));return value;}

import katex from 'katex';
import {DOMParser} from '@xmldom/xmldom';
import {zipSync,strToU8} from 'fflate';
import {mathParts} from './math-text';
import {escapeXML as esc} from './diagram';
import {wordShapes} from './word-shapes';
import type {Draft} from './schema';
const mathRun=(t:string)=>`<m:r><m:rPr><m:sty m:val="p"/></m:rPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><m:t xml:space="preserve">${esc(t)}</m:t></m:r>`;
function convert(n:any):string{
 if(n.nodeType===3)return n.nodeValue.trim()?mathRun(n.nodeValue):'';
 if(n.nodeType!==1)return '';const children=Array.from(n.childNodes).filter((c:any)=>c.nodeType===1) as any[];const c=children.map(convert);const inside=c.join('');
 switch(n.localName){
 case 'annotation':case 'annotation-xml':return '';
 case 'mi':case 'mn':case 'mo':case 'mtext':return mathRun(n.textContent);
 case 'mspace':return mathRun(' ');
 case 'mfrac':return `<m:f><m:num>${c[0]}</m:num><m:den>${c[1]}</m:den></m:f>`;
 case 'msup':return `<m:sSup><m:e>${c[0]}</m:e><m:sup>${c[1]}</m:sup></m:sSup>`;
 case 'msub':return `<m:sSub><m:e>${c[0]}</m:e><m:sub>${c[1]}</m:sub></m:sSub>`;
 case 'msubsup':return `<m:sSubSup><m:e>${c[0]}</m:e><m:sub>${c[1]}</m:sub><m:sup>${c[2]}</m:sup></m:sSubSup>`;
 case 'msqrt':return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${inside}</m:e></m:rad>`;
 case 'mroot':return `<m:rad><m:deg>${c[1]}</m:deg><m:e>${c[0]}</m:e></m:rad>`;
 case 'mover':if(['¯','‾','―','ˉ','\u0305'].includes(children[1]?.textContent))return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${c[0]}</m:e></m:bar>`;return `<m:limUpp><m:e>${c[0]}</m:e><m:lim>${c[1]}</m:lim></m:limUpp>`;
 case 'munder':return `<m:limLow><m:e>${c[0]}</m:e><m:lim>${c[1]}</m:lim></m:limLow>`;
 case 'munderover':return `<m:limUpp><m:e><m:limLow><m:e>${c[0]}</m:e><m:lim>${c[1]}</m:lim></m:limLow></m:e><m:lim>${c[2]}</m:lim></m:limUpp>`;
 case 'mtable':return `<m:m>${inside}</m:m>`;
 case 'mtr':return `<m:mr>${inside}</m:mr>`;
 case 'mtd':return `<m:e>${inside||mathRun(' ')}</m:e>`;
 case 'menclose':return `<m:borderBox><m:e>${inside}</m:e></m:borderBox>`;
 default:return inside;
 }
}
export function equation(latex:string){const html=katex.renderToString(latex,{output:'mathml',throwOnError:true,strict:'ignore'});const dom=new DOMParser().parseFromString(html,'text/xml');const math=dom.getElementsByTagName('math')[0];if(!math)throw new Error('Equation conversion failed.');return `<m:oMath>${convert(math)}</m:oMath>`;}
function paragraph(text:string,style=''){let pos=0,out='';for(const m of mathParts(text)){if(m.index>pos)out+=run(text.slice(pos,m.index));out+=equation(m.latex);pos=m.index+m.raw.length;}out+=run(text.slice(pos));return `<w:p><w:pPr>${style?`<w:pStyle w:val="${style}"/>`:''}<w:spacing w:after="160"/><w:jc w:val="left"/></w:pPr>${out}</w:p>`;}
function run(t:string){return t.split('\n').map((s,i)=>(i?'<w:r><w:br/></w:r>':'')+`<w:r><w:t xml:space="preserve">${esc(s.replace(/\\\$/g,'$'))}</w:t></w:r>`).join('');}
export function wordDocument(d:Draft,images:Uint8Array[],refs:string[]=[]){
 const files:Record<string,Uint8Array>={};let body=paragraph(d.title,'Title')+paragraph(`EM1 · ${d.total_marks} marks`)+paragraph('Question','Heading1')+paragraph(d.question)+d.parts.map(p=>paragraph(`${p.label} ${p.prompt}`)).join('')+d.options.map(o=>paragraph(`${o.label}. ${o.text}`)).join('');let rels='';
 const imageBlock=(i:number)=>wordShapes(d.diagrams[i],i+1)+paragraph(d.diagrams[i].caption);
 d.diagrams.forEach((x,i)=>{if(x.placement==='question')body+=imageBlock(i);});
 d.solutions.forEach((s,i)=>{body+=paragraph(i===0?'Main solution':`Alternative solution ${i}`,'Heading1')+paragraph(s.title)+paragraph(s.content);if(i===0)d.diagrams.forEach((x,j)=>{if(x.placement==='solution')body+=imageBlock(j);});if(d.question_type==='MCQ')body+=paragraph(`Correct answer: ${d.correct_option}. Award 2 marks for the correct option and 0 otherwise. No partial credit.`);else{body+=paragraph('Proposed marking allocation','Heading2');s.marking.forEach(m=>body+=paragraph(`${m.part}: ${m.criterion} [${m.marks} marks]`));}});
 if(refs.length)body+=paragraph('Reference questions','Heading2')+paragraph(refs.join('\n'));
 const xml=(s:string)=>strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+s);
 files['word/document.xml']=xml(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`);
 files['word/styles.xml']=xml('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>');
 files['word/settings.xml']=xml('<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:mathPr><m:mathFont m:val="Times New Roman"/></m:mathPr></w:settings>');
 files['word/_rels/document.xml.rels']=xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="settings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${rels}</Relationships>`);
 files['_rels/.rels']=xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 files['[Content_Types].xml']=xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>');return zipSync(files,{level:6});
}

from pathlib import Path
import json,re,pdfplumber,pypdfium2 as pdfium
from PIL import Image,ImageChops,ImageDraw
root=Path(__file__).resolve().parents[2];site=root/'em1-studio'
bank=json.loads((site/'data/bank.json').read_text(encoding='utf8'));out=site/'public/source-questions';out.mkdir(exist_ok=True)
manifest={};qa=[]
for paper in dict.fromkeys(q['paper_id'] for q in bank['questions']):
 qs=[q for q in bank['questions'] if q['paper_id']==paper];pdf=pdfplumber.open(root/qs[0]['question_source_file']);doc=pdfium.PdfDocument(str(root/qs[0]['question_source_file']))
 for pn in sorted(set(n for q in qs for n in q['question_pages_json'])):
  pg=pdf.pages[pn-1];words=pg.extract_words();im=doc[pn-1].render(scale=2).to_pil().convert('RGB')
  def cut(y):
   # Place boundaries in actual whitespace, preserving superscripts and fractions above labels.
   gaps=[]
   for v in range(max(48,int(y)-38),int(y)-1):
    if not any(c['text'].strip() and 60<c['x0']<560 and c['top']-1<v<c['bottom']+1 for c in pg.chars):gaps.append(v)
   return min(gaps,key=lambda v:abs(v-(y-10))) if gaps else y-18
  parents=[w for w in words if re.fullmatch(r'\*?[ABC]?\d+\.',w['text']) and w['x0']<95 and 45<w['top']<775]
  for q in [q for q in qs if pn in q['question_pages_json']]:
   parent=next((w for w in parents if w['text'].strip('*.')==q['parent_question']),None)
   assert parent,(q['question_id'],pn)
   start=cut(parent['top']);following=[cut(w['top']) for w in parents if w['top']>parent['top']+5]
   sections=[cut(w['top']) for w in words if w['text']=='Section' and w['top']>parent['top'] and w['x0']<95]
   footers=[w['top']-1 for w in words if (w['text'] in ['END','Page'] or w['text'].startswith('(*NOTE:')) and w['top']>parent['top']]
   end=min(following+sections+footers+[780]);ranges=[(start,end)]
   labels=re.findall(r'\(([^)]+)\)',q['source_question'])
   lo,hi=start,end
   for depth,label in enumerate(labels):
    pattern=r'\([a-d]\)' if depth==0 else r'\((?:i|ii|iii|iv)\)'
    marks=[w for w in words if re.fullmatch(pattern,w['text']) and 95<w['x0']<150 and lo<=w['top']<hi]
    first=next(w for w in marks if w['text']=='('+label.split('-')[0]+')')
    last=next(w for w in marks if w['text']=='('+label.split('-')[-1]+')')
    targetlo=max(lo,cut(first['top']));targethi=min([cut(w['top']) for w in marks if w['top']>last['top']+5]+[hi])
    contextend=max(lo,cut(marks[0]['top']))
    ranges=ranges[:-1]+([(lo,contextend)] if contextend-lo>3 else [])+[(targetlo,targethi)]
    lo,hi=targetlo,targethi
   pieces=[]
   for a,z in ranges:
    crop=im.crop((120,round(a*2),1120,round(z*2)))
    box=ImageChops.difference(crop,Image.new('RGB',crop.size,'white')).getbbox()
    if box:pieces.append(crop.crop((0,max(0,box[1]-8),crop.width,min(crop.height,box[3]+8))))
   canvas=Image.new('RGB',(1000,sum(p.height for p in pieces)+12*(len(pieces)-1)+16),'white');y=8
   for piece in pieces:canvas.paste(piece,(0,y));y+=piece.height+12
   name=f'{q["question_id"]}-p{pn}.png';canvas.save(out/name,optimize=True)
   manifest.setdefault(q['question_id'],[]).append({'page':pn,'url':'/source-questions/'+name})
   qa.append((q['question_id'],canvas.copy()))
 pdf.close();doc.close()
(site/'data/reference-crops.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
# Contact sheets for inspection of every crop.
qaout=site/'test-output';qaout.mkdir(exist_ok=True)
for batch in range(0,len(qa),16):
 sheet=Image.new('RGB',(1600,1800),'#dddddd');draw=ImageDraw.Draw(sheet)
 for i,(label,im) in enumerate(qa[batch:batch+16]):
  x=(i%4)*400;y=(i//4)*450;draw.text((x+5,y+5),label,fill='black');im.thumbnail((390,420));sheet.paste(im,(x+5,y+25))
 sheet.save(qaout/f'crops-{batch//16}.png')
print('Cropped',len(qa),'images for',len(manifest),'references')

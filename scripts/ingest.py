from pathlib import Path
import csv,json,base64
from pypdf import PdfReader
root=Path(__file__).resolve().parents[2];dest=Path(__file__).resolve().parents[1]/'data';dest.mkdir(exist_ok=True)
bank=root/'outputs/em1_question_bank'
def read(name):
 with (bank/(name+'.csv')).open(encoding='utf-8-sig',newline='') as f:r=list(csv.DictReader(f))
 for row in r:
  for k in row:
   if k.endswith('_json'):row[k]=json.loads(row[k])
 return r
topics=read('topics');questions=read('questions');pdf=PdfReader(root/'EM1 Notes - ver17Mar26.pdf')
for t in topics:
 page=int(t['source_pdf_page']);following=[int(x['source_pdf_page']) for x in topics if int(x['source_pdf_page'])>page and x['source_file']==t['source_file']]
 end=min(following,default=len(pdf.pages))
 t['syllabus_excerpt']='\n'.join(p.extract_text() or '' for p in pdf.pages[page-1:min(end,len(pdf.pages))])[:18000] if t['status']=='Active' else ''
images={p.name:'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode() for p in (bank/'images').glob('*.png')}
(dest/'bank.json').write_text(json.dumps({'topics':topics,'questions':questions,'images':images},ensure_ascii=False),encoding='utf8')
print('Ingested',len(questions),'questions and',len(topics),'taxonomy entries')

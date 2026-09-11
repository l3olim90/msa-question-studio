from pathlib import Path
import json
import pypdfium2 as pdfium
root=Path(__file__).resolve().parents[2]
site=root/'em1-studio'
bank=json.loads((site/'data/bank.json').read_text(encoding='utf8'))
out=site/'public/source-pages';out.mkdir(parents=True,exist_ok=True)
files={}
for q in bank['questions']:
 for page in q['question_pages_json']:
  files[(q['paper_id'],page)]=root/q['question_source_file']
for (paper,page),path in files.items():
 doc=pdfium.PdfDocument(str(path));assert 1<=page<=len(doc)
 image=doc[page-1].render(scale=1.65).to_pil().convert('RGB')
 image.save(out/f'{paper}-p{page}.png',optimize=True)
 doc.close()
print(f'Rendered {len(files)} original paper pages for {len(bank["questions"])} references.')

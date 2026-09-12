"""Local PDF rendering for the import CLI. No network access."""
import sys,json,hashlib
from pathlib import Path
import pypdfium2 as pdfium
from PIL import Image

mode,source,dest=sys.argv[1:4]
source=Path(source).resolve();dest=Path(dest).resolve()
if mode=='render':
    if source.stat().st_size>50*1024*1024: raise ValueError('PDF exceeds 50 MB')
    doc=pdfium.PdfDocument(str(source))
    if len(doc)>100: raise ValueError('PDF exceeds 100 pages; split into separate imports')
    dest.mkdir(parents=True,exist_ok=True);pages=[]
    for i in range(len(doc)):
        page=doc[i];text=page.get_textpage().get_text_range()
        image=page.render(scale=1.5).to_pil().convert('RGB');name=f'page-{i+1}.jpg';image.save(dest/name,quality=88)
        pages.append({'page':i+1,'text':text,'image':name})
    (dest/'pages.json').write_text(json.dumps({'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'pages':pages},ensure_ascii=False),encoding='utf8')
elif mode=='crop':
    # Rectangles are normalized 0..1, kept within the source page.
    box=json.loads(sys.argv[4]);im=Image.open(source)
    if len(box)!=4 or not 0<=box[0]<box[2]<=1 or not 0<=box[1]<box[3]<=1: raise ValueError('Invalid crop')
    im.crop((int(box[0]*im.width),int(box[1]*im.height),int(box[2]*im.width),int(box[3]*im.height))).save(dest)
else: raise ValueError('Unknown mode')

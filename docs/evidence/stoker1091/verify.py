"""Pixel provenance, recolour boundaries and idempotent append verification."""
import hashlib, io, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
BASE='5276702'
sha=lambda b:hashlib.sha256(b).hexdigest()
atlas=Image.open(ROOT/'src/art/crew.png').convert('RGBA')
old=Image.open(io.BytesIO(subprocess.check_output(['git','show',BASE+':src/art/crew.png'],cwd=ROOT))).convert('RGBA')
a=np.array(atlas); before=np.array(old)
assert a.shape==(2688,96,4)
assert np.array_equal(a[:2496],before), 'Old13 rows changed'
assert set(np.unique(a[...,3]))=={0,255}
cell=a[2496:]
op=cell[...,3]>0
cloth=op & (cell[...,1]==0) & (cell[...,0]==cell[...,2])
hair=op & (cell[...,0]==0) & (cell[...,1]==cell[...,2])
assert cloth.sum()>1000 and hair.sum()>100 and not (cloth & hair).any()
assert not hair[85:].any(), 'Hair key outside head'
ys,xs=np.where(op)
assert ys.max()==189 and ys.min()==26
assert xs.min()>0 and xs.max()<95
foot=np.where(op[-14:])[1].mean()+0.5
assert abs(foot-48)<1.1, foot
assert all(np.all(cell[m][:,k]%4==0) for m,k in [(cloth,0),(hair,1)])
teams=[([34,43,65],[38,30,26]),([110,32,28],[172,123,58]),([47,86,51],[116,72,38]),([112,84,34],[175,168,153])]
board=Image.new('RGB',(960,450),'#1d2931'); d=ImageDraw.Draw(board)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
previews=[]
for i,(clothcolor,haircolor) in enumerate(teams):
    b=cell.copy()
    b[cloth,:3]=np.clip(cell[cloth,0,None]*np.array(clothcolor)/100,0,255).astype('uint8')
    b[hair,:3]=np.clip(cell[hair,1,None]*np.array(haircolor)/100,0,255).astype('uint8')
    assert np.array_equal(b[~(cloth|hair)],cell[~(cloth|hair)])
    im=Image.fromarray(b)
    board.paste(im.resize((192,384),Image.Resampling.NEAREST),(i*240+24,32),im.resize((192,384),Image.Resampling.NEAREST))
    d.text((i*240+24,8),['Blue / black','Red / blond','Green / brown','Gold / grey'][i],font=font,fill='white')
    previews.append(im)
board.save(HERE/'recolour.png')
mask=cell.copy(); mask[cloth,:3]=[255,0,255]; mask[hair,:3]=[0,255,0]
Image.fromarray(mask).resize((384,768),Image.Resampling.NEAREST).save(HERE/'masks.png')
Image.fromarray(cell).save(HERE/'stoker-cell.png')
oldhash=sha(a[:2496].tobytes()); filehash=sha((ROOT/'src/art/crew.png').read_bytes())
subprocess.run([sys.executable,'-I','src/art/src/make_crew.py','--append-stoker'],cwd=ROOT,check=True)
assert sha((ROOT/'src/art/crew.png').read_bytes())==filehash,'Append not idempotent'
data=json.loads((HERE/'generation.json').read_text(encoding='utf-8'))
data.update(reference_sha256=sha(Path(data['reference']).read_bytes()),master_sha256=sha(Path(data['source']).read_bytes()),processed_sha256=sha((ROOT/'src/art/src/stoker.png').read_bytes()),atlas_sha256=filehash,old13_rgba_sha256=oldhash,cloth_pixels=int(cloth.sum()),hair_pixels=int(hair.sum()),foot_center=float(foot),base_commit=BASE)
(HERE/'generation.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({ 'size':atlas.size,'rows':14,'oldRowsUnchanged':13,'cloth':int(cloth.sum()),'hair':int(hair.sum()),'footCenter':float(foot),'recolourCases':4,'nonMaskPixelsUnchanged':True,'appendIdempotent':True },indent=2))

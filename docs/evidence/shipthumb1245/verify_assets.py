"""Check thumbnail coverage and the actual stale-asset build guard."""
import hashlib,json,subprocess,sys
from pathlib import Path
from PIL import Image
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
def run(*args):return subprocess.run([sys.executable,'-I','src/admin.py',*args],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
M=json.loads((ROOT/'src/art/ships/thumbs.json').read_text(encoding='utf-8'))
cfg=json.loads((ROOT/'src/config/game.json').read_text(encoding='utf-8'))
assert set(M['icons'])=={s['id'] for s in cfg['ships']}
assert run('thumbs','--check').returncode==0
atlas=Image.open(ROOT/'src/art/ships/atlas.png').convert('RGBA')
assert atlas.size==(M['cols']*256,M['rows']*160)
assert {a for n,a in atlas.getchannel('A').getcolors()}=={0,255}
for c,r in M['icons'].values():assert atlas.crop((c*256,r*160,(c+1)*256,(r+1)*160)).getbbox()
punt=next(s for s in cfg['ships'] if s['id']=='punt')
p=ROOT/'ships'/(punt['el']+'.js');before=p.read_bytes()
try:
    p.write_bytes(before+b'\n')
    negative=run('thumbs','--check');assert negative.returncode and 'punt' in negative.stdout,negative.stdout
finally:p.write_bytes(before)
manifest=ROOT/'src/art/ships/thumbs.json';before=manifest.read_bytes();index=ROOT/'index.html';indexsha=sha(index)
try:
    manifest.unlink()
    guard=run('build','--code');assert guard.returncode and sha(index)==indexsha,guard.stdout
finally:manifest.write_bytes(before)
assert run('thumbs','--check').returncode==0
host=Path(sys.argv[1]);icons={}
for key in ['steam','oar']:
    p=ROOT/'src/art/battle'/(key+'.png');im=Image.open(p)
    assert im.size==(128,128) and im.mode=='RGBA' and im.getextrema()[3]==(0,255)
    assert p.read_bytes()==(host/'img/ui/globe'/(key+'.png')).read_bytes()
    icons[key]=sha(p)
result=dict(thumbnails=len(M['icons']),atlasBytes=(ROOT/'src/art/ships/atlas.png').stat().st_size,
 binaryAlpha=True,iconsSHA256=icons,changedPuntRejected=True,missingManifestBlocksBuildWithoutWriting=True)
(HERE/'assets.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))

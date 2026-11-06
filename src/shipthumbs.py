"""Prebake the real ship models, using zenith's Sharkside portrait renderer.
python -I src/shipthumbs.py [--check] [--force]
The capture page is built from current sources without changing index.html.
"""
import argparse, base64, hashlib, io, json, math, sys, tempfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
sys.path.insert(0,str(HERE))
import admin
sys.path.insert(0,str(HERE/'tests/render_lab'))
from cdp import Chrome
from PIL import Image
ART=HERE/'art/ships'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def source_sha(p):return hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')).hexdigest()
def source_matches(recorded,p):
    # Older manifests hashed CRLF renderer files before git normalized them to LF.
    b=p.read_bytes().replace(b'\r\n',b'\n')
    return recorded in {hashlib.sha256(b).hexdigest(),hashlib.sha256(b.replace(b'\n',b'\r\n')).hexdigest()}
def wanted():
    ships=json.loads((HERE/'config/game.json').read_text(encoding='utf-8'))['ships']
    return {'renderer':source_sha(HERE/'js/05_thumb.js'), 'ships':{s['id']:source_sha(ROOT/'ships'/(s['el']+'.js')) for s in ships}}
def stale():
    try:
        m=json.loads((ART/'thumbs.json').read_text(encoding='utf-8'));w=wanted()
        bad=[]
        if m['source']['renderer']!=w['renderer']: bad.append('renderer changed')
        for k in sorted(set(w['ships'])|set(m['icons'])):
            if m['source']['ships'].get(k)!=w['ships'].get(k) or k not in m['icons']: bad.append(k)
        if m['atlasSHA256']!=sha(ART/'atlas.png'): bad.append('atlas changed/missing')
        return bad
    except (OSError,KeyError,ValueError): return ['missing/invalid thumbnail atlas or manifest']
def bake(force=False):
    if not force and not stale(): print('Ship thumbnails current');return
    ART.mkdir(parents=True,exist_ok=True)
    want=wanted();all_ids=sorted(want['ships']);images={}
    ship_paths={s['id']:ROOT/'ships'/(s['el']+'.js') for s in json.loads((HERE/'config/game.json').read_text(encoding='utf-8'))['ships']}
    # Reuse verified atlas cells so importing one ship never recaptures the fleet.
    if not force:
        try:
            old=json.loads((ART/'thumbs.json').read_text(encoding='utf-8'))
            atlas=Image.open(ART/'atlas.png').convert('RGBA')
            if source_matches(old['source']['renderer'],HERE/'js/05_thumb.js') and old['atlasSHA256']==sha(ART/'atlas.png') and atlas.size==(old['cols']*256,old['rows']*160):
                for k in all_ids:
                    if source_matches(old['source']['ships'].get(k),ship_paths[k]) and k in old['icons']:
                        c,r=old['icons'][k];im=atlas.crop((c*256,r*160,(c+1)*256,(r+1)*160))
                        if im.getbbox():images[k]=im
        except (OSError,KeyError,ValueError,TypeError):
            images={}
    ids=[k for k in all_ids if k not in images]
    reused=len(images)
    print('Thumbnail update: capture %d, reuse %d'%(len(ids),reused),flush=True)
    page=None
    if ids:
        html=(ROOT/'index.html').read_text(encoding='utf-8')
        match=admin.SHIPS_TAG_RX.search(html)
        if not match:raise RuntimeError('Thumbnail capture needs a split build (run normal build first)')
        capture,_=admin.code_html(admin.work_read,match.group(0)+'\n')
        page=ROOT/'.shipthumb-capture.html'
        assert not page.exists(),page
        page.write_text(capture,encoding='utf-8')
    try:
        with tempfile.TemporaryDirectory(prefix='blockside-thumbs-') as profile:
            for start in range(0,len(ids),4):
                batch=ids[start:start+4]
                with Chrome(9497,profile,gpu='swiftshader') as chrome:
                    ws=chrome.ws;ws.call('Page.enable')
                    ws.call('Page.navigate',{'url':page.as_uri()+'?thumbs='+','.join(batch)+'&prefs=0&cache=0&headless=1'})
                    data=ws.eval('new Promise((resolve,reject)=>{let n=0,t=setInterval(()=>{let p=document.getElementById("ship-thumb-result");if(p){clearInterval(t);resolve(JSON.parse(p.textContent))}else if(++n>1800){clearInterval(t);reject(Error("thumbnail timeout"))}},100)})',await_promise=True)
                    for k in batch:
                        u=data['ships'][k]
                        if not isinstance(u,str): raise RuntimeError('%s: %s'%(k,u))
                        im=Image.open(io.BytesIO(base64.b64decode(u.split(',',1)[1]))).convert('RGBA')
                        assert im.size==(256,160) and im.getbbox(),k
                        images[k]=im
                print('Captured %d/%d: %s'%(len(images)-reused,len(ids),','.join(batch)),flush=True)
    finally:
        if page:page.unlink(missing_ok=True)
    cols=6;rows=math.ceil(len(all_ids)/cols);atlas=Image.new('RGBA',(cols*256,rows*160))
    icons={}
    for i,k in enumerate(all_ids):
        c,r=i%cols,i//cols;atlas.paste(images[k],(c*256,r*160));icons[k]=[c,r]
    atlas.save(ART/'atlas.png',optimize=True)
    m=dict(v=1,w=256,h=160,cols=cols,rows=rows,icons=icons,source=want,atlasSHA256=sha(ART/'atlas.png'))
    (ART/'thumbs.json').write_text(json.dumps(m,indent=1,sort_keys=True)+'\n',encoding='utf-8')
    print('Wrote %d thumbnails, %d bytes'%(len(all_ids),(ART/'atlas.png').stat().st_size))
def main():
    sys.stdout.reconfigure(encoding='utf-8')
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');p.add_argument('--force',action='store_true');a=p.parse_args()
    if a.check:
        bad=stale();print('Ship thumbnails: '+(', '.join(bad) if bad else 'current'));return 1 if bad else 0
    bake(a.force);return 0
if __name__=='__main__':sys.exit(main())

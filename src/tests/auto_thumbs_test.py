"""Real import/build/capture test in a disposable two-ship fixture.
Only sculpture export and unrelated rope/anchor/ship/showlod checks are stubbed.
The registered ship uses the existing punt voxel model as a deterministic input.
"""
import argparse,base64,hashlib,importlib.util,json,re,shutil,sys,tempfile
from pathlib import Path
from unittest.mock import patch
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
def module(path,name):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    sys.stdout.reconfigure(encoding='utf-8');p=argparse.ArgumentParser(description=__doc__);p.add_argument('--cache-root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    with tempfile.TemporaryDirectory(prefix='blockside-import-thumbs-') as td:
        f=Path(td)
        shutil.copytree(ROOT/'src',f/'src',ignore=shutil.ignore_patterns('__pycache__','reports'))
        shutil.copytree(ROOT/'VoxelKit',f/'VoxelKit',ignore=shutil.ignore_patterns('_cache','__pycache__'))
        (f/'ships').mkdir();shutil.copyfile(ROOT/'index.html',f/'index.html')
        for name in ['ship-punt.js','flagloop.js']:shutil.copyfile(ROOT/'ships'/name,f/'ships'/name)
        adm=module(f/'src/admin.py','fixture_admin')
        cfg=adm.load();punt=next(s for s in cfg['ships'] if s['id']=='punt');cfg['ships']=[punt];cfg['parts']={'guns':{}}
        assert not adm.validate(cfg);adm.save(cfg)
        (f/'VoxelKit/_cache').mkdir();source=a.cache_root/punt['vxk'];shutil.copyfile(source,f/'VoxelKit/_cache'/punt['vxk'])
        print('Fixture baseline build',flush=True);adm.act_build()
        def manifest():return json.loads((f/'src/art/ships/thumbs.json').read_text(encoding='utf-8'))
        def cell(m,k):
            c,r=m['icons'][k];return Image.open(f/'src/art/ships/atlas.png').crop((c*256,r*160,(c+1)*256,(r+1)*160)).tobytes()
        old=manifest();pixels=cell(old,'punt')
        with patch.object(adm,'export',side_effect=lambda work,dest:shutil.copyfile(source,dest)), \
             patch.object(adm,'act_ropebind',return_value=[]),patch.object(adm,'act_ancbake',return_value=[]), \
             patch.object(adm,'act_shipcheck',return_value=[]),patch.object(adm,'act_showlod',return_value=[]):
            print('Import a new ship through the real build',flush=True)
            log=adm.act_import('fixture-punt','thumb_probe','Thumbnail probe')
            m=manifest();assert set(m['icons'])=={'punt','thumb_probe'}
            assert cell(m,'punt')==pixels
            assert any('capture 1, reuse 1' in s for s in log),log
            text=(f/'index.html').read_text(encoding='utf-8')
            embedded=json.loads(base64.b64decode(re.search(r'<script type="application/x-asset" id="ship-thumbs"[^>]*>(.*?)</script>',text,re.S)[1]))
            assert 'thumb_probe' in embedded['icons'];adm.act_srccheck()
            atlas_sha=digest(f/'src/art/ships/atlas.png');meta_sha=digest(f/'src/art/ships/thumbs.json')
            assert adm.thumbs_finish()==['Ship thumbnails: current']
            assert digest(f/'src/art/ships/atlas.png')==atlas_sha and digest(f/'src/art/ships/thumbs.json')==meta_sha
            print('Deferred import (--no-build), then normal build',flush=True)
            adm.act_import('fixture-punt','thumb_later','Deferred probe',build=False)
            assert 'thumb_later' not in manifest()['icons']
            log_later=adm.act_build();assert 'thumb_later' in manifest()['icons']
            assert any('capture 1, reuse 2' in s for s in log_later),log_later
            # Renderer errors must propagate rather than report a completed build.
            with patch.object(adm,'run',return_value=(1,'fixture capture failure')):
                try:adm.thumbs_finish()
                except adm.Fail:pass
                else:raise AssertionError('capture failure swallowed')
        result=dict(realImportCreatesAndEmbedsThumbnail=True,unchangedShipPixelsIdentical=True,
                    importCaptured=1,importReused=1,unchangedSyncWritesNothing=True,
                    deferredImportCaptured=1,deferredImportReused=2,captureFailurePropagates=True)
        a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
if __name__=='__main__':main()

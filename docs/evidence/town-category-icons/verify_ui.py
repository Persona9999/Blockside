"""Exercise the real category menu renderer and click handlers in isolated Chrome DOM.
This fixture does not run the town simulation or WebGL renderer.
"""
import argparse
import base64
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'src/tests/render_lab'))
from cdp import Chrome

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--host-root', type=Path, required=True)
args = parser.parse_args()
host = args.host_root
loader = '''const fs=require('fs'),vm=require('vm'),path=require('path');
const c={window:{BSW:{}}};vm.createContext(c);
for(const f of ['town_sample.js','town.js','buildings.js'])vm.runInContext(fs.readFileSync(path.join(process.argv[1],'world',f),'utf8'),c);
process.stdout.write(JSON.stringify(c.window.BSW.townBuildMenu()));'''
menu = json.loads(subprocess.run(['node', '-e', loader, str(host)], check=True, capture_output=True, encoding='utf-8').stdout)
styles = '\n'.join(re.findall(r'<style>(.*?)</style>', (ROOT / 'src/template.html').read_text(encoding='utf-8'), re.S))
esc = re.search(r'function tuiEsc\(t\) \{[^\n]+', (ROOT / 'src/js/89_townui.js').read_text(encoding='utf-8')).group()
html = '''<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>''' + styles + '''
#stage{background:linear-gradient(160deg,#1e343e,#0d1821)} #fixtureNote{position:absolute;left:20px;top:18px;color:#cbbf9e;font-size:13px}
</style><div id="stage" class="twb"><div id="fixtureNote">建築分類圖示 · 隔離介面驗證</div><div id="twbP"></div></div>
<script>var Q=new URLSearchParams();function $(id){return document.getElementById(id)} function modeRule(){return false}function ctrlAdd(){}function townWantSet(){}''' + esc + '''</script>
<script src="../../../src/js/87_townbuild_art.js"></script><script src="../../../src/js/87_townbuild.js"></script><script>twbMenuSet(''' + json.dumps(menu, ensure_ascii=False) + ''');</script></html>'''
fixture = HERE / 'menu-fixture.html'
fixture.write_text(html, encoding='utf-8')
result = {'scope': 'Real 87_townbuild.js renderer, menu setter and click handlers; isolated DOM, not full town simulation', 'views': []}
with Chrome(9491, str(HERE / '_chrome'), width=1280, height=900) as chrome:
    ws = chrome.ws
    ws.call('Page.enable')
    ws.call('Page.navigate', {'url': fixture.as_uri()})
    ws.eval('new Promise((resolve,reject)=>{let n=0,t=setInterval(()=>{if(typeof TWB!=="undefined"&&document.querySelectorAll("#twbTabs button").length===11){clearInterval(t);resolve(true)}else if(++n>200){clearInterval(t);reject(Error("menu load timeout"))}},50)})', await_promise=True)
    ws.eval('Promise.all(Array.from(document.querySelectorAll("#twbTabs img"),i=>i.decode())).then(()=>true)', await_promise=True)
    for width, height in [(1280, 900), (390, 844), (640, 390)]:
        ws.call('Emulation.setDeviceMetricsOverride', {'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': width < 700})
        keys = ws.eval('TWB_CATS.map(c=>c.k)')
        assert len(keys) == 11, keys
        for key in keys:
            point = ws.eval('(()=>{let b=document.querySelector(\'#twbTabs button[data-c="' + key + '"]\');b.scrollIntoView({block:"nearest",inline:"nearest"});let r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
            ws.call('Input.dispatchMouseEvent', dict(type='mousePressed', button='left', clickCount=1, **point))
            ws.call('Input.dispatchMouseEvent', dict(type='mouseReleased', button='left', clickCount=1, **point))
            state = ws.eval('({cat:TWB.cat,item:TWB.item,pressed:document.querySelectorAll("#twbTabs [aria-pressed=true]").length,cards:document.querySelectorAll("#twbItems button").length})')
            assert state['cat'] == key and state['pressed'] == 1 and state['cards'] > 0, state
        ws.eval('document.querySelector(\'#twbTabs button[data-c="house"]\').click();document.getElementById("twbP").scrollTop=0')
        view = ws.eval('(()=>{let p=$("twbP"),r=p.getBoundingClientRect();return {count:document.querySelectorAll("#twbTabs img").length,loaded:Array.from(document.querySelectorAll("#twbTabs img")).every(i=>i.complete&&i.naturalWidth===128),labels:Array.from(document.querySelectorAll("#twbTabs span"),e=>e.textContent),pixelated:getComputedStyle(document.querySelector(".twbCatIcon")).imageRendering,bounds:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},scrollable:p.scrollHeight>p.clientHeight}})()')
        assert view['count'] == 11 and view['loaded'] and view['pixelated'] == 'pixelated', view
        assert view['bounds']['left'] >= 0 and view['bounds']['right'] <= width and view['bounds']['top'] >= 0 and view['bounds']['bottom'] <= height, view
        shot = 'menu-%dx%d.png' % (width, height)
        (HERE / shot).write_bytes(base64.b64decode(ws.call('Page.captureScreenshot', {'format': 'png'})['data']))
        result['views'].append(dict(width=width, height=height, clicked=keys, input='CDP pointer press/release after scrollIntoView', screenshot=shot, **view))
    unknown = ws.eval('twbCategoryHTML({k:"future",name:"學堂<&>"})')
    inherited = ws.eval('twbCategoryHTML({k:"constructor",name:"新分類"})')
    assert unknown == '<span>學堂&lt;&amp;&gt;</span>' and inherited == '<span>新分類</span>', (unknown, inherited)
    ws.eval('twbMenuSet([{k:"future",name:"學堂<&>",items:[{use:"school",name:"學堂"}]}]);document.querySelector(\'#twbTabs button[data-c="future"]\').click()')
    assert ws.eval('TWB.cat') == 'future' and ws.eval('document.querySelector("#twbTabs button.on").textContent') == '學堂<&>'
    result['unknownCategory'] = {'escaped': unknown, 'prototypeKey': inherited, 'clickable': True}
(HERE / 'verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=True, indent=2))

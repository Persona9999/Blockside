"""Render the built trade page in Chrome with representative host market replies.
No town simulation is run; the compiled page, atlas, renderers and controls are real.
"""
import base64
import json
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORE = HERE.parents[2]
HOST = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(CORE / 'src/tests/render_lab'))
from cdp import Chrome

ROWS = [dict(g=g, name=n, cat='goods', town=4000, ship=q, avgBuy=1.33,
             sell=1.5, buy=1.7, canBuy=1000, canSell=1000, price=1.6, base=1.6)
        for g,n,q in [('cask','木桶',66),('wheat','小麥',1000),('iron-ore','鐵礦石',0)]]
ROWS.append(dict(g='@people',name='乘客',cat='people',town=10,ship=4,sell=None,buy=None,canBuy=0,canSell=0))
DATA = dict(ok=True, list=dict(rows=ROWS,fee=.05,funds=5000,townFunds=10000),
            info=dict(id='angra',name='安格拉',year=1666,pop=dict(total=3000),funds=10000,day=0))
HTML = '''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#0d1218}iframe{border:0;width:100%;height:100%}</style>
<script>const DATA=DATA_JSON;window.addEventListener('message',e=>{let d=e.data;if(d&&d.bsmap==='need'&&d.what==='townUI')e.source.postMessage({...DATA,bsmap:'townUI',seq:d.seq,cmd:d.cmd},'*')});</script>
<iframe src="/core/index.html?tui=@host&town=angra&tab=trade"></iframe>'''.replace('DATA_JSON',json.dumps(DATA,ensure_ascii=False))

class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_GET(self):
        if self.path=='/':
            b=HTML.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(b)
        else: super().do_GET()
    def translate_path(self,path):
        clean=path.split('?',1)[0]
        if clean.startswith('/core/img/'): return str(HOST/clean[len('/core/'):])
        if clean.startswith('/core/'): return str(CORE/clean[len('/core/'):])
        return str(HOST/clean.lstrip('/'))

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
result={'scope':__doc__,'views':[]}
try:
    with Chrome(9496,str(HERE/'_chrome'),gpu='swiftshader',width=1280,height=900) as chrome:
        ws=chrome.ws;ws.call('Page.enable')
        ws.call('Page.navigate',{'url':'http://127.0.0.1:%d/'%server.server_port})
        ws.eval('new Promise((resolve,reject)=>{let n=0,t=setInterval(()=>{let w=document.querySelector("iframe").contentWindow;if(w.document.querySelectorAll(".trade-unit").length===3){clearInterval(t);resolve(true)}else if(++n>300){clearInterval(t);reject(Error("trade page timeout"))}},100)})',await_promise=True)
        for width,height in [(1280,900),(375,812)]:
            ws.call('Emulation.setDeviceMetricsOverride',dict(width=width,height=height,deviceScaleFactor=1,mobile=width<700))
            ws.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))',await_promise=True)
            state=ws.eval('''(()=>{let w=document.querySelector('iframe').contentWindow,d=w.document;
              let icons=[...d.querySelectorAll('.trade-unit .battle-icon')];let p=d.querySelector('#tuiP'),table=d.querySelector('.tuiTr');
              return {count:icons.length,labels:icons.map(i=>i.getAttribute('aria-label')),sizes:icons.map(i=>[i.offsetWidth,i.offsetHeight]),
                tableWidth:table.offsetWidth,bodyWidth:d.querySelector('#tuiBody').clientWidth,
                peopleHasUnit:!!table.rows[4].querySelector('.trade-unit'),emptyHasUnit:!!table.rows[3].querySelector('.trade-unit'),
                hasAtlas:icons.every(i=>i.classList.contains('bi-atlas')),bounds:{left:p.getBoundingClientRect().left,right:p.getBoundingClientRect().right},
                baselineWidth:(()=>{let html=icons.map(i=>i.parentElement.innerHTML);icons.forEach(i=>i.parentElement.innerHTML='<small>桶</small>');let old=table.offsetWidth;d.querySelectorAll('.trade-unit').forEach((e,n)=>e.innerHTML=html[n]);return old})()};})()''')
            assert state['count']==3 and state['labels']==['桶']*3 and state['sizes']==[[16,16]]*3,state
            assert state['hasAtlas'] and not state['peopleHasUnit'] and not state['emptyHasUnit'],state
            assert state['tableWidth']<=state['baselineWidth'] and state['tableWidth']<=state['bodyWidth'],state
            assert state['bounds']['left']>=0 and state['bounds']['right']<=width,state
            # Exercise the real quantity control and retain the icons after rerendering.
            ws.eval('document.querySelector("iframe").contentDocument.querySelector(\'button[data-u="1000"]\').click()')
            assert ws.eval('document.querySelector("iframe").contentDocument.querySelector(\'button[data-u="1000"]\').classList.contains("on")')
            ws.eval('new Promise(r=>setTimeout(r,250))',await_promise=True)
            name='trade-%dx%d.png'%(width,height)
            (HERE/name).write_bytes(base64.b64decode(ws.call('Page.captureScreenshot',dict(format='png'))['data']))
            result['views'].append(dict(width=width,height=height,screenshot=name,quantityButton=1000,**state))
finally: server.shutdown();server.server_close()
(HERE/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=True,indent=2))

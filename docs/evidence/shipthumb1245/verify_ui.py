"""Exercise the actual compiled picker in Chrome at desktop and phone widths."""
import base64,json,re,sys,threading,tempfile
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'src/tests/render_lab'))
from cdp import Chrome

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
    def log_message(self,*a):pass
    def do_GET(self):
        if self.path in ('/test','/test-missing'):
            url='/index.html?pick=@host&prefs=0&cache=0'+('&missing=1' if self.path.endswith('missing') else '')
            b=('''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#10171d}iframe{width:100%;height:100%;border:0}</style><script>window.messages=[];window.addEventListener('message',e=>{if(e.data&&e.data.bspick)messages.push(e.data)})</script><iframe src="'''+url+'"></iframe>').encode()
        elif self.path.startswith('/index.html') and 'missing=1' in self.path:
            s=(ROOT/'index.html').read_text(encoding='utf-8')
            pattern=r'(<script type="application/x-asset" id="ship-thumbs"[^>]*>)(.*?)(</script>)'
            def missing(m):
                d=json.loads(base64.b64decode(m[2]));d['icons'].pop('constitution',None)
                return m[1]+base64.b64encode(json.dumps(d).encode()).decode()+m[3]
            s,n=re.subn(pattern,missing,s,flags=re.S);assert n==1
            b=s.encode()
        else:return super().do_GET()
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(b)

server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
out={'scope':__doc__,'views':[]}
try:
    with tempfile.TemporaryDirectory(prefix='blockside-picker-test-') as profile,Chrome(9498,profile,gpu='swiftshader',width=1280,height=900) as chrome:
        ws=chrome.ws;ws.call('Page.enable')
        def ready(path):
            ws.call('Page.navigate',{'url':'http://127.0.0.1:%d%s'%(server.server_port,path)})
            ws.eval('new Promise((resolve,reject)=>{let n=0,t=setInterval(()=>{if(messages.some(m=>m.bspick==="ready")){clearInterval(t);resolve(true)}else if(++n>300){clearInterval(t);reject(Error("picker timeout"))}},100)})',await_promise=True)
        ready('/test')
        for width,height in [(1280,900),(375,812)]:
            ws.call('Emulation.setDeviceMetricsOverride',dict(width=width,height=height,deviceScaleFactor=1,mobile=width<700))
            ws.eval('new Promise(r=>setTimeout(r,300))',await_promise=True)
            state=ws.eval('''(()=>{let d=document.querySelector('iframe').contentDocument,c=[...d.querySelectorAll('.spkC')];let rect=()=>c.map(b=>[b.offsetWidth,b.offsetHeight]);let withThumbs=rect();let st=d.createElement('style');st.textContent='.spkThumb{display:none!important}';d.head.appendChild(st);let withoutThumbs=rect();st.textContent+='#spk .spkG{grid-auto-rows:auto!important}#spk button.spkC{overflow:visible!important}';let originalLayout=rect();st.remove();return {cards:c.length,thumbs:d.querySelectorAll('.spkThumb').length,withThumbs,withoutThumbs,originalLayout,base64PerCard:d.querySelector('#spkG').innerHTML.includes('base64'),decodedHullScripts:d.querySelectorAll('script[src*="ships/ship"]').length,shadow:getComputedStyle(c[0].querySelector('b')).textShadow,panel:d.querySelector('#spk .card').getBoundingClientRect().toJSON(),scrollWidth:d.documentElement.scrollWidth,atlasURL:getComputedStyle(d.querySelector('.spkThumb')).backgroundImage};})()''')
            assert state['cards']==state['thumbs'] and state['cards']>30,state
            assert state['withThumbs']==state['withoutThumbs'] and not state['base64PerCard'] and state['decodedHullScripts']==0,state
            assert all(h>=80 for w,h in state['withThumbs']),state
            assert state['withThumbs']==state['originalLayout'],state
            assert state['scrollWidth']<=width and state['panel']['right']<=width and state['shadow']!='none',state
            # Wait for the one shared PNG to decode before capturing.
            url=state.pop('atlasURL');ws.eval('new Promise((r,j)=>{let i=new Image;i.onload=r;i.onerror=j;i.src='+json.dumps(url[5:-2])+ '})',await_promise=True)
            shot='picker-%dx%d.png'%(width,height);(HERE/shot).write_bytes(base64.b64decode(ws.call('Page.captureScreenshot',{'format':'png'})['data']))
            ws.eval('''(()=>{let d=document.querySelector('iframe').contentDocument;d.querySelector('#spkFT').click();d.querySelector('.spkR[data-k="drive"] button[data-v="steam"]').click()})()''')
            steam=ws.eval('''(()=>{let d=document.querySelector('iframe').contentDocument;return {n:d.querySelectorAll('.spkC').length,icons:d.querySelectorAll('.spkC .i [data-battle-icon="steam"]').length}})()''')
            assert steam['n']>0 and steam['n']==steam['icons'],steam
            ws.eval('''(()=>{let d=document.querySelector('iframe').contentDocument;d.querySelector('.spkR[data-k="drive"] button[data-v="oar"]').click()})()''')
            oar=ws.eval('''(()=>{let d=document.querySelector('iframe').contentDocument;return {n:d.querySelectorAll('.spkC').length,icons:d.querySelectorAll('.spkC .i [data-battle-icon="oar"]').length}})()''')
            assert oar['n']>0 and oar['n']==oar['icons'],oar
            ws.eval('''(()=>{let d=document.querySelector('iframe').contentDocument;d.querySelector('.spkR[data-k="drive"] button[data-v=""]').click();let i=d.querySelector('input[type="search"]');i.value='punt';i.dispatchEvent(new Event('input',{bubbles:true}))})()''')
            assert ws.eval('document.querySelector("iframe").contentDocument.querySelectorAll(".spkC").length')==1
            out['views'].append(dict(width=width,height=height,screenshot=shot,steam=steam,oar=oar,**state))
            ready('/test')
        ready('/test-missing')
        assert ws.eval('document.querySelector("iframe").contentDocument.querySelector(\'.spkC[data-id="constitution"] .spkThumb\')===null')
        ws.eval('document.querySelector("iframe").contentDocument.querySelector(\'.spkC[data-id="constitution"]\').click()')
        ws.eval('new Promise((resolve,reject)=>{let n=0,t=setInterval(()=>{let m=messages.find(m=>m.bspick==="picked");if(m){clearInterval(t);resolve(true)}else if(messages.some(m=>m.bspick==="error")||++n>1200){clearInterval(t);reject(Error(JSON.stringify(messages)))}},100)})',await_promise=True)
        picked=ws.eval('messages.find(m=>m.bspick==="picked").id');assert picked=='constitution',picked
        out['negativeControl']={'missingThumbnail':'constitution','selectionStillWorks':picked}
finally:server.shutdown();server.server_close()
(HERE/'verification.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(out,ensure_ascii=True))

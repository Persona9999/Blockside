"""Compare live picker text against HEAD; exercise steam/oar/magic single-drive labels."""
import base64,json,re,subprocess,sys,tempfile,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'src/tests/render_lab'))
from cdp import Chrome
before=subprocess.run(['git','show','HEAD:index.html'],cwd=ROOT,check=True,capture_output=True).stdout
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
    def log_message(self,*a):pass
    def do_GET(self):
        if self.path.startswith('/test?'):
            target=self.path.split('?',1)[1]
            b=('''<!doctype html><style>html,body{margin:0;height:100%;background:#10171d}iframe{width:100%;height:100%;border:0}</style><script>window.ready=false;addEventListener('message',e=>{if(e.data&&e.data.bspick==='ready')ready=true})</script><iframe src="/'''+target+'?pick=@host&prefs=0"></iframe>').encode()
        elif self.path.startswith('/before.html'):b=before
        elif self.path.startswith('/synthetic.html'):
            s=(ROOT/'index.html').read_text(encoding='utf-8')
            def single(m):
                d=json.loads(base64.b64decode(m[2]))
                for sid in ['punt','stormkaap']:d['ships'][sid]['sails']=0
                return m[1]+base64.b64encode(json.dumps(d).encode()).decode()+m[3]
            s,n=re.subn(r'(<script type="application/x-asset" id="ship-cards"[^>]*>)(.*?)(</script>)',single,s,flags=re.S);assert n==1;b=s.encode()
        else:return super().do_GET()
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(b)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
result={}
try:
    with tempfile.TemporaryDirectory(prefix='blockside-power-labels-') as profile,Chrome(9498,profile,gpu='swiftshader') as chrome:
        ws=chrome.ws;ws.call('Page.enable')
        def rows(page):
            ws.call('Page.navigate',{'url':'http://127.0.0.1:%d/test?%s'%(server.server_port,page)})
            ws.eval('new Promise((r,j)=>{let n=0,t=setInterval(()=>{if(ready){clearInterval(t);r(true)}else if(++n>300){clearInterval(t);j(Error("picker timeout"))}},100)})',await_promise=True)
            return ws.eval('Object.fromEntries([...document.querySelector("iframe").contentDocument.querySelectorAll(".spkC")].map(e=>[e.dataset.id,e.textContent]))')
        old=rows('before.html');new=rows('index.html')
        assert old.keys()==new.keys()
        changed=[]
        for k in old:
            assert re.sub('（蒸氣|（槳|（魔法','（額外動力',new[k])==old[k],(k,old[k],new[k])
            if old[k]!=new[k]:changed.append(k)
        assert changed
        (HERE/'labels-desktop.png').write_bytes(base64.b64decode(ws.call('Page.captureScreenshot',{'format':'png'})['data']))
        example=rows('synthetic.html')
        for sid,label in [('monitor','蒸氣'),('punt','槳'),('stormkaap','魔法')]:assert '（'+label+'）' in example[sid],example[sid]
        result=dict(realCardsCompared=len(old),changedLabels=changed,numericAndOtherTextIdentical=True,
                    syntheticNoSailExamples={s:example[s] for s in ['monitor','punt','stormkaap']})
finally:server.shutdown();server.server_close()
(HERE/'labels.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=True))

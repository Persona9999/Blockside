"""CDP trial through the built entry; inject observability only into served bytes.

Adapted from meadow's barque1300/probe.py. No product source is modified.
"""
import base64
from contextlib import closing
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from threading import Thread
import time
from urllib.request import urlopen

sys.path.insert(0,'D:/Unity/Valhalla/scratchpad/galea1297/python')
from websocket import create_connection

page, output=map(Path,sys.argv[1:3])
root=Path(__file__).resolve().parent
mark='if (DEBUG) window.__game = {'
source=page.read_text(encoding='utf8')
assert source.count(mark)==1
data=source.replace(mark,(root/'trial.js').read_text(encoding='utf8')+'\n'+mark).encode()

class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        if self.path.split('?')[0]=='/'+page.name:
            self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Content-Length',str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else: super().do_GET()

server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(page.parent)))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/{page.name}?debug=1&prefs=0&gfx=low&lerp=0&seed=1315&sea=0&start=1&blue=tungning_trader&red=tungning_trader&mode=sail'
with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
    proc=subprocess.Popen(['C:/Program Files/Google/Chrome/Application/chrome.exe','--headless=new',
        '--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--window-size=1440,1000',
        '--remote-debugging-port=0','--remote-allow-origins=http://localhost','--user-data-dir='+profile,url],
        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        active=Path(profile)/'DevToolsActivePort'
        for _ in range(200):
            if active.exists() and active.read_text().splitlines(): break
            time.sleep(.1)
        port=active.read_text().splitlines()[0]
        tabs=json.load(urlopen(f'http://127.0.0.1:{port}/json/list',timeout=10))
        tab=next(t for t in tabs if t['type']=='page')
        with closing(create_connection(tab['webSocketDebuggerUrl'],timeout=240,origin='http://localhost')) as ws:
            seq=0
            def msg(method,**params):
                global seq
                seq+=1
                ws.send(json.dumps(dict(id=seq,method=method,params=params)))
                while True:
                    response=json.loads(ws.recv())
                    if response.get('id')==seq:
                        if 'error' in response: raise RuntimeError(response['error'])
                        return response['result']
            def run(js):
                result=msg('Runtime.evaluate',expression=js,awaitPromise=True,returnByValue=True)
                if result.get('exceptionDetails'): raise RuntimeError(result['exceptionDetails'])
                return result.get('result',{}).get('value')
            for _ in range(300):
                if run('Boolean(window.tungningTrial && window.__game?.ships()?.[0] && window.__game.stats().t > 0)'): break
                time.sleep(.3)
            else: raise RuntimeError(run('document.body.innerText.slice(0,1600)'))
            report=run('tungningTrial()')
            print(json.dumps(report,ensure_ascii=False),flush=True)
            output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
            # Allow one real render after setting the presentation camera.
            time.sleep(1)
            shot=msg('Page.captureScreenshot',format='png',captureBeyondViewport=False)
            output.with_suffix('.png').write_bytes(base64.b64decode(shot['data']))
            if not report['ok']: raise RuntimeError('Trial assertions failed')
    finally:
        proc.terminate()
        proc.wait(timeout=15)
        server.shutdown()

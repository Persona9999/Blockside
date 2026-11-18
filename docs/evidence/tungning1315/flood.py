# Derived from meadow barque1300/probe.py
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

sys.path.insert(0, 'D:/Unity/Valhalla/scratchpad/galea1297/python')
from websocket import create_connection

page, cases_path, output = map(Path, sys.argv[1:4])
source = page.read_text(encoding='utf-8')
mark = 'if (DEBUG) window.__game = {'
assert source.count(mark) == 1
script = Path(__file__).with_name('probe.js').read_text(encoding='utf-8')
data = source.replace(mark, script + '\n' + mark).encode()

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.split('?')[0] == '/' + page.name:
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(page.parent)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/{page.name}?debug=1&prefs=0&gfx=low&seed=1297&sea=0&start=1&ship=tungning_trader,tungning_trader'
cases = json.loads(cases_path.read_text(encoding='utf-8'))
with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
    proc = subprocess.Popen([r'C:\Program Files\Google\Chrome\Application\chrome.exe', '--headless=new',
                             '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run',
                             '--remote-debugging-port=0', '--remote-allow-origins=http://localhost',
                             '--user-data-dir='+profile, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        active = Path(profile) / 'DevToolsActivePort'
        for _ in range(200):
            if active.exists() and active.read_text().splitlines():
                break
            time.sleep(.1)
        port = active.read_text().splitlines()[0]
        pages = json.load(urlopen(f'http://127.0.0.1:{port}/json/list', timeout=10))
        tab = next(tab for tab in pages if tab['type'] == 'page')
        with closing(create_connection(tab['webSocketDebuggerUrl'], timeout=150, origin='http://localhost')) as ws:
            seq = 0
            def run(js):
                global seq
                seq += 1
                ws.send(json.dumps(dict(id=seq, method='Runtime.evaluate', params=dict(expression=js, returnByValue=True, awaitPromise=True))))
                response = json.loads(ws.recv())['result']
                if response.get('exceptionDetails'):
                    raise RuntimeError(response['exceptionDetails'])
                return response['result'].get('value')

            for _ in range(220):
                if run('Boolean(window.__openHullTrial && window.__game?.ships()?.[0] && window.__game.stats().t > 0)'):
                    break
                time.sleep(.25)
            else:
                raise RuntimeError(run('document.body.innerText.slice(0,700)'))

            result = []
            for case in cases:
                record = run(f'window.__openHullTrial({json.dumps(case)})')
                print(json.dumps(record | {"points":len(record.get("points", []))}, ensure_ascii=False), flush=True)
                result.append(record)
                output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
    finally:
        proc.terminate()
        proc.wait(timeout=15)
        server.shutdown()

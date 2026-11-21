"""Linux host (FAR-78): what admin.py needs to run on a non-Windows machine without a wrapper.
python -I src/tests/linux_host_test.py
  1) Chrome lookup: BS_CHROME first, then google-chrome / chromium / chrome-headless-shell on PATH, then the macOS / Windows paths.
  2) js_globals.cjs through a pipe: output over 64 KB must arrive whole (process.exit used to cut it on Linux). Skipped without node.
  3) _cache fingerprints across OSes: a re-export that differs from the product header only in source link revisions
     (Senate hashes the event path with the platform separator) or in the last digits of a decimal (libm) gets the product's
     values and matches the lock; any other difference (a moved rope end, another work, a changed grid) does not.
Exit 0 = all passed.
"""
import importlib.util, json, os, shutil, subprocess, sys, tempfile, zlib
from pathlib import Path
SRC = Path(__file__).resolve().parents[1]


def module(path, name, env=None):
    old = dict(os.environ)
    os.environ.update(env or {})
    try:
        spec = importlib.util.spec_from_file_location(name, path)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        return m
    finally:
        os.environ.clear()
        os.environ.update(old)


FAILS = []


def check(ok, what):
    print(('  ✓ ' if ok else '  ✗ ') + what)
    if not ok:
        FAILS.append(what)


def chrome():
    print('1) Chrome lookup')
    with tempfile.TemporaryDirectory() as td:
        fake = os.path.join(td, 'chromium')
        open(fake, 'w').write('#!/bin/sh\n')
        os.chmod(fake, 0o755)
        a = module(SRC / 'admin.py', 'admin_env', {'BS_CHROME': '/opt/my/chrome', 'PATH': td})
        check(a.CHROMES[0] == '/opt/my/chrome', 'BS_CHROME comes first: %s' % a.CHROMES[0])
        check(fake in a.CHROMES and a.CHROMES.index(fake) == 1, 'chromium on PATH comes next')
        check(a.CHROMES[-1].endswith('chrome.exe'), 'Windows paths stay last')
        a = module(SRC / 'admin.py', 'admin_path', {'PATH': td})
        check(a.CHROMES[0] == fake, 'without BS_CHROME: the one on PATH')
        for f in ('report.py', 'ropecheck.py', 'tune.py', 'tests/ambient_lab.py', 'tests/render_lab/cdp.py', 'tests/crew_log.py',
                  'tests/uw_lab.py', 'tests/flood_lab.py', 'tests/wrooms_lab.py'):
            check("os.environ.get('BS_CHROME')" in (SRC / f).read_text(encoding='utf-8'), '%s reads BS_CHROME' % f)


def js_globals():
    print('2) js_globals.cjs through a pipe')
    node = shutil.which('node')
    if not node:
        print('  · no node: skipped')
        return
    files = sorted(str(p) for p in (SRC / 'js').glob('*.js'))
    r = subprocess.run([node, '--expose-internals', str(SRC / 'js_globals.cjs')] + files, capture_output=True, text=True, encoding='utf-8')
    try:
        res = json.loads(r.stdout)
    except ValueError as e:
        res = None
        check(False, 'output parses (%d bytes): %s' % (len(r.stdout.encode()), e))
    if res is not None:
        check(len(r.stdout.encode()) > 65536, 'output is over 64 KB (%d bytes), so the pipe cut would have shown' % len(r.stdout.encode()))
        check(len(res) == len(files), 'one entry per file (%d)' % len(files))


def fingerprints():
    print('3) _cache fingerprints across OSes')
    a = module(SRC / 'admin.py', 'admin_fp')
    W, L = 'w-ship@' + 'a' * 64 + '  placed 1', 'w-ship@' + 'b' * 64 + '  placed 1'
    ph = {'exported_at': '2026-11-01T00:00:00Z', 'source': ['# made on Windows', 'link 船殼 ' + W],
          'rig': {'ropes': [{'name': 'r1', 'ends': ['rope:main-P1/0.0904165070328506', 'mast/top'], 'slack': 1.02}]},
          'mpool': [1, 2, 3]}                                   # product-only key (pooled meshes)
    body = b'\x00\x01grid'
    want = a.head_fp({k: v for k, v in ph.items() if k != 'mpool'}, body)   # the lock is the Windows _cache file: no mpool

    def export(h, b=body):
        p = os.path.join(td, 'x.vxk')
        a.vxk_write(p, h, b)
        return p

    def lin(*mods):
        h = json.loads(json.dumps({k: v for k, v in ph.items() if k != 'mpool'}))
        h['exported_at'] = '2026-11-20T00:00:00Z'
        h['source'][1] = 'link 船殼 ' + L
        h['rig']['ropes'][0]['ends'][0] = 'rope:main-P1/0.09041650703285059'
        for f, v in mods:
            f(h, v)
        return h
    with tempfile.TemporaryDirectory() as td:
        p = export(lin())
        check(a.file_fp(p) != want, 'Linux re-export does not match the lock as is')
        n = a.product_plat(p, ph, want)
        check(n == 2 and a.file_fp(p) == want, 'only the link revision and the rope-end digits differ ⇒ aligned (%d), matches the lock' % n)
        cases = [
            ('a rope end moved', lambda h, v: h['rig']['ropes'][0]['ends'].__setitem__(0, v), 'rope:main-P1/0.095'),
            ('another linked work', lambda h, v: h['source'].__setitem__(1, v), 'link 船殼 w-other@' + 'b' * 64 + '  placed 1'),
            ('slack edited', lambda h, v: h['rig']['ropes'][0].__setitem__('slack', v), 1.03),
        ]
        for what, f, v in cases:
            p = export(lin((f, v)))
            before = open(p, 'rb').read()
            n = a.product_plat(p, ph, want)
            check(n == 0 and open(p, 'rb').read() == before, '%s ⇒ not aligned, file untouched' % what)
        p = export(lin(), b'\x00\x02grid')
        check(a.product_plat(p, ph, want) == 0, 'grid changed ⇒ not aligned')


chrome()
js_globals()
fingerprints()
print('✗ %d failed' % len(FAILS) if FAILS else '✓ all passed')
sys.exit(1 if FAILS else 0)

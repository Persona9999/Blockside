"""One config file per ship and remerge (FAR-85).
python -I src/tests/per_ship_test.py --cache-root <folder of .vxk> [--only E,B1,...] [--out result.json]
Runs in a disposable git worktree at HEAD (detached; commits made there have no branch) with this checkout's src/admin.py and
src/shipthumbs.py copied in. Needs numpy (build --ship) and Pillow (thumbnails). --cache-root gives the .vxk of the ships that
get rebuilt (plain ships whose .vxk matches HEAD's fingerprint).
Chrome is not used: the thumbnail capture, the anchor and show-LOD bakes and shipcheck are stood in for by deterministic fakes
(a cell painted from the ship id and its ship file hash; an entry carrying the fingerprint the page would compute), the same on
both sides of every comparison.
  E  save(): load() → save() writes nothing; a reordered list keeps the order, new ships get the next numbers; act_save round trip;
     cards_write rewrites only the measured ship's file, and nothing when the card is the same.
  B1 two branches each import a new ship: the config files do not conflict; after git merge, remerge must write exactly what
     building the second ship on top of the first on one branch writes (index.html, ships/, anchor.js, showlod.js, thumbnails, config).
  B2 one branch rebuilds a ship, the other changes game code (build --code): remerge == the code change applied on the first + build --code.
  B3 the two branches each rebuild a different ship: remerge == the second ship rebuilt on top of the first.
  C  refusals, nothing written: not merging; the same ship rebuilt on both sides (its config file conflicts; message names it);
     that conflict resolved to a fingerprint neither side built. Then: resolved by taking one side ⇒ remerge takes that side's ship file.
  D  merging a branch still on the layout before FAR-85 (a ship renamed inside game.json): remerge moves the change into the
     ship's own file, removes the old files, and the product matches its sources.
"""
import argparse, hashlib, importlib.util, io, json, shutil, subprocess, sys, tempfile
from pathlib import Path
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[2]
GEN = ('index.html', 'src/art/ships/thumbs.json', 'src/art/ships/atlas.png')


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def git(cwd, *a, ok=(0,)):
    p = subprocess.run(['git', *a], cwd=cwd, capture_output=True, text=True, encoding='utf-8')
    assert p.returncode in ok, (a, p.stdout, p.stderr)
    return p.stdout.strip()


class Fixture:
    def __init__(self, td, cache_root):
        self.w = Path(td) / 'wt'
        git(ROOT, 'worktree', 'add', '--detach', str(self.w), 'HEAD')
        for f in ('src/admin.py', 'src/shipthumbs.py'):
            shutil.copyfile(ROOT / f, self.w / f)
        git(self.w, 'add', '--', 'src/admin.py', 'src/shipthumbs.py')
        if git(self.w, 'diff', '--cached', '--name-only'):     # this checkout's tools, uncommitted ⇒ a plumbing commit in the fixture
            git(self.w, 'commit', '-q', '-m', 'per_ship_test: tools under test')
        self.base = git(self.w, 'rev-parse', 'HEAD')
        self.adm = module(self.w / 'src/admin.py', 'per_ship_admin')
        sys.path.insert(0, str(self.w / 'src'))
        sys.path.insert(0, str(self.w / 'src/tests/render_lab'))
        self.st = module(self.w / 'src/shipthumbs.py', 'per_ship_thumbs')
        self.cache, self.src = self.w / 'VoxelKit/_cache', cache_root
        self.cache.mkdir(parents=True, exist_ok=True)

    def close(self):
        git(ROOT, 'worktree', 'remove', '--force', str(self.w))

    def reset(self, rev=None):
        git(self.w, 'merge', '--abort', ok=(0, 128))
        git(self.w, 'checkout', '-q', '-f', '--detach', rev or self.base)
        git(self.w, 'clean', '-q', '-f', '--', 'src', 'ships')
        for f in self.cache.iterdir():
            f.unlink()

    def files(self):
        """Everything remerge or a build may write, with the config: {relative path: bytes}."""
        w = self.w
        out = {p: (w / p).read_bytes() for p in GEN + ('src/template.html', 'src/config/game.json') if (w / p).exists()}
        out.update({'src/config/ships/' + f.name: f.read_bytes() for f in (w / 'src/config/ships').glob('*.json')})
        out.update({'ships/' + f.name: f.read_bytes() for f in (w / 'ships').glob('*.js')})
        for p in ('src/config/vxk_lock.json', 'src/config/ship_cards.json'):
            if (w / p).exists():
                out[p] = (w / p).read_bytes()
        return out

    def commit(self, msg):
        git(self.w, 'add', '-A', '--', 'index.html', 'ships', 'src')
        git(self.w, 'commit', '-q', '-m', msg)
        return git(self.w, 'rev-parse', 'HEAD')

    def merge(self, rev):
        git(self.w, 'merge', '--no-ff', '--no-commit', rev, ok=(0, 1))
        return sorted(set(git(self.w, 'diff', '--name-only', '--diff-filter=U').split()))


def diff(a, b):
    return sorted(k for k in set(a) | set(b) if a.get(k) != b.get(k))


def run(fx, a, res):
    adm, st, w = fx.adm, fx.st, fx.w
    from PIL import Image
    adm.act_srccheck()
    ships, lock = adm.load()['ships'], adm.lock_load()
    fam = {s['id']: adm.ship_family(ships, s['id']) for s in ships}
    ok = [s for s in ships if len(fam[s['id']]) == 1 and (a.cache_root / s['vxk']).is_file()
          and adm.vxk_fp((a.cache_root / s['vxk']).read_bytes()) == lock.get(s['vxk'])]
    assert len(ok) >= 3, 'need three plain ships whose .vxk in --cache-root match their fingerprints (%d)' % len(ok)
    ok.sort(key=lambda s: (a.cache_root / s['vxk']).stat().st_size)     # small ships first: faster builds
    s1, s2, src_new = ok[0], ok[1], ok[2]
    print('ships used: %s, %s; new ships copy %s' % (s1['id'], s2['id'], src_new['id']), flush=True)

    def fake_thumbs():
        """thumbs_finish without Chrome: reuse matching cells, paint the others from (id, ship file hash), pack, re-embed."""
        want = st.wanted()
        images = {}
        try:
            old = json.loads((st.ART / 'thumbs.json').read_text(encoding='utf-8'))
            atlas = Image.open(st.ART / 'atlas.png').convert('RGBA')
            for k, sha in want['ships'].items():
                if old['source']['ships'].get(k) == sha and k in old['icons']:
                    c, r = old['icons'][k]
                    images[k] = atlas.crop((c * 256, r * 160, (c + 1) * 256, (r + 1) * 160))
        except (OSError, KeyError, ValueError):
            pass
        for k, sha in want['ships'].items():
            if k not in images:
                h = hashlib.sha1((k + sha).encode()).digest()
                images[k] = Image.new('RGBA', (256, 160), (h[0], h[1], h[2], 255))
        st.pack(images, want, st.ART)
        html = (w / 'index.html').read_text(encoding='utf-8')
        h1, _ = adm.code_html(adm.work_read, adm.SHIPS_TAG_RX.search(html).group(0) + '\n')
        (w / 'index.html').write_bytes(h1.encode('utf-8'))
        return ['(thumbnails: fake capture)']

    def fake_bake(path, head, want_fn):
        def go(ids=None, force=False, check=False):
            cfg = adm.load()
            want = want_fn(cfg)
            have = adm.baked_parse(path.read_text(encoding='utf-8'), head.split('window.')[1].split(' ')[0]) if path.exists() else {}
            for k in ids or list(want):
                if k in want:
                    have[k] = {'fp': want[k], 'n': 0, 'b64': ''}
            path.write_bytes(adm.baked_text(head, have).encode('utf-8'))
            return ['(%s: fake bake %s)' % (path.name, ','.join(ids or []))]
        return go
    anc = fake_bake(w / 'ships/anchor.js', adm.ANCHOR_HEAD, adm.anc_want)
    lod = fake_bake(w / 'ships/showlod.js', adm.SHOWLOD_HEAD, adm.showlod_want)
    stubs = lambda: [patch.object(adm, 'thumbs_finish', side_effect=fake_thumbs), patch.object(adm, 'act_ancbake', side_effect=anc),
                     patch.object(adm, 'act_showlod', side_effect=lod), patch.object(adm, 'act_shipcheck', return_value=[]),
                     patch.object(adm, 'act_ropebind', return_value=[])]

    def stubbed(fn, *x, **k):
        ps = stubs()
        for p in ps:
            p.start()
        try:
            return fn(*x, **k)
        finally:
            for p in ps:
                p.stop()

    def importing(sid, vxk):
        with patch.object(adm, 'export', side_effect=lambda work, dest: shutil.copyfile(vxk, dest)):
            return stubbed(adm.act_import, 'fixture-' + sid, sid, sid.title(), build=True, only=True)

    def rebuild(s, salt):
        """reimport stand-in: one voxel recoloured (salt picks the colour), fingerprint, build --ship, bakes."""
        p = fx.cache / s['vxk']
        if not p.exists():
            shutil.copyfile(a.cache_root / s['vxk'], p)
        import struct, zlib
        raw = zlib.decompress(p.read_bytes(), -15)
        n = struct.unpack('<I', raw[4:8])[0]
        h, grid = json.loads(raw[8:8 + n].decode('utf-8')), bytearray(raw[8 + n:])
        at = h['nchunks'] * 6 + next(i for i, v in enumerate(grid[h['nchunks'] * 6:]) if v)
        grid[at] = (grid[at] + salt) % 255 + 1
        adm.vxk_write(str(p), h, bytes(grid))
        adm.lock_put(s['vxk'])
        return stubbed(lambda: adm.act_build_ship(s['id']) + anc([s['id']]) + lod([s['id']]))

    res['scenarios'] = {}

    def record(name, good, detail=''):
        res['scenarios'][name] = 'ok' if good else 'FAILED: %s' % detail
        print('%-4s %s %s' % (name, 'ok' if good else 'FAILED', detail), flush=True)
        assert good, (name, detail)

    def refuse(name, want_msg):
        before = fx.files()
        try:
            adm.act_remerge()
            got = None
        except adm.Fail as e:
            got = str(e)
        d = diff(before, fx.files())
        record(name, got is not None and want_msg in got and not d, '%s / written %s' % ((got or 'no Fail')[:300], d))

    only = set(a.only.split(',')) if a.only else None
    on = lambda k: not only or k in only

    # E) save()
    if on('E'):
        fx.reset()
        before = fx.files()
        adm.save(adm.load())
        record('E1', not diff(before, fx.files()), 'load → save rewrote %s' % diff(before, fx.files()))
        adm.act_save(adm.load())
        record('E2', not diff(before, fx.files()), 'act_save rewrote %s' % diff(before, fx.files()))
        c = adm.load()
        c['ships'] = [c['ships'][1], c['ships'][0]] + c['ships'][2:] + [dict(c['ships'][-1], id='zz_new', el='ship-zz-new', vxk='zz_new.vxk')]
        adm.save(c)
        R = adm.recs_read(adm.work_read)
        got = [s['id'] for s in adm.load()['ships']]
        record('E3', got == [s['id'] for s in c['ships']] and R['zz_new']['order'] == max(r['order'] for r in R.values()) and 'lock' not in R['zz_new'],
               'order after save %s' % got[:4])
        fx.reset()
        R = adm.recs_read(adm.work_read)
        sid = adm.recs_order(R)[0]
        card = dict(R[sid]['card'], crew=R[sid]['card']['crew'] + 1)
        adm.cards_write({sid: card})
        d = diff(before, fx.files())
        again = adm.cards_write({sid: card})
        record('E4', d == ['src/config/ships/%s.json' % sid] and adm.recs_read(adm.work_read)[sid]['card'] == card and '沒變' in again and diff(before, fx.files()) == d,
               'cards_write changed %s' % d)
        fx.reset()

    if on('C'):
        fx.reset()
        refuse('C0', '不在合併中')

    def pair(name, left, right, ref):
        """left/right: change on a branch from base (then commit); ref: the right side's change applied on top of left, one branch."""
        fx.reset()
        left()
        L = fx.commit(name + ' left')
        fx.reset()
        right()
        Rv = fx.commit(name + ' right')
        fx.reset(L)
        ref(Rv)
        want = fx.files()
        fx.reset(L)
        U = fx.merge(Rv)
        cfgU = [p for p in U if p.startswith('src/')]
        record(name + '.cfg', not [p for p in cfgU if p not in GEN], 'source conflicts %s' % cfgU)
        log = adm.act_remerge()
        got = fx.files()
        d = diff(want, got)
        record(name, not d, 'remerge differs from the one-branch build: %s' % d)
        res[name + 'Conflicts'] = U
        return log

    take = lambda rev, *paths: git(w, 'checkout', rev, '--', *paths)

    if on('B1'):
        def ref1(Rv):
            take(Rv, 'src/config/ships/probe_b.json')
            shutil.copyfile(a.cache_root / src_new['vxk'], fx.cache / 'probe_b.vxk')
            stubbed(lambda: adm.act_build_ship('probe_b') + anc(['probe_b']) + lod(['probe_b']))
        pair('B1', lambda: importing('probe_a', a.cache_root / s1['vxk']), lambda: importing('probe_b', a.cache_root / src_new['vxk']), ref1)

    if on('B2'):
        def code():
            f = w / 'src/js/07_gfx.js'
            t = f.read_text(encoding='utf-8')
            assert t.count("low: '低'") == 1
            f.write_text(t.replace("low: '低'", "low: '低 '"), encoding='utf-8', newline='')
            stubbed(adm.act_build_code)

        def ref2(Rv):
            take(Rv, 'src/js/07_gfx.js')
            stubbed(adm.act_build_code)
        pair('B2', lambda: rebuild(s1, 1), code, ref2)

    if on('B3'):
        keep = {}

        def right3():
            rebuild(s2, 2)
            keep['vxk'] = (fx.cache / s2['vxk']).read_bytes()

        def ref3(Rv):
            take(Rv, 'src/config/ships/%s.json' % s2['id'])
            (fx.cache / s2['vxk']).write_bytes(keep['vxk'])
            stubbed(lambda: adm.act_build_ship(s2['id']) + anc([s2['id']]) + lod([s2['id']]))
        pair('B3', lambda: rebuild(s1, 1), right3, ref3)

    if on('C'):
        fx.reset()
        rebuild(s1, 1)
        L = fx.commit('C left')
        fx.reset()
        rebuild(s1, 2)
        Rv = fx.commit('C right')
        fx.reset(L)
        U = fx.merge(Rv)
        rec = 'src/config/ships/%s.json' % s1['id']
        assert rec in U, U
        refuse('C1', s1['id'] + '：兩邊都改了')
        R0 = json.loads(git(w, 'show', 'HEAD:' + rec))
        R0['lock'] = R0['lock'][:2] + ('0' if R0['lock'][2] != '0' else '1') + R0['lock'][3:]
        (w / rec).write_text(adm.rec_text(R0), encoding='utf-8', newline='\n')
        refuse('C2', '兩邊的船檔都不是照合併後的指紋')
        take('--ours', rec)
        adm.act_remerge()
        f = 'ships/%s.js' % s1['el']
        record('C3', (w / f).read_bytes() == git_bytes(w, 'HEAD:' + f) and adm.src_check_one(adm.work_read, 'C3')[0],
               'ours resolved: ship file not taken from HEAD')

    if on('D'):
        mig = git(w, 'rev-list', '-1', fx.base, '--', 'src/config/vxk_lock.json')   # the commit that removed it (split-ships)
        old = mig + '^'
        fx.reset(old)
        g = json.loads((w / 'src/config/game.json').read_text(encoding='utf-8'))
        g['ships'][0]['name'] += '（改名）'
        (w / 'src/config/game.json').write_text(adm.dumps(g) + '\n', encoding='utf-8', newline='\n')
        O = fx.commit('D old layout: rename a ship')
        fx.reset()
        U = fx.merge(O)
        log = adm.act_remerge()
        c = adm.load()
        sid = g['ships'][0]['id']
        good = (next(s for s in c['ships'] if s['id'] == sid)['name'] == g['ships'][0]['name'] and 'ships' not in json.loads((w / 'src/config/game.json').read_text(encoding='utf-8'))
                and not (w / 'src/config/vxk_lock.json').exists() and not (w / 'src/config/ship_cards.json').exists() and adm.src_check_one(adm.work_read, 'D')[0])
        record('D', good, 'conflicts %s; log %s' % (U, log[:3]))
    fx.reset()


def git_bytes(cwd, spec):
    return subprocess.run(['git', 'show', spec], cwd=cwd, capture_output=True, check=True).stdout


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--cache-root', type=Path, required=True)
    p.add_argument('--only', help='comma list of E,B1,B2,B3,C,D')
    p.add_argument('--out', type=Path)
    a = p.parse_args()
    a.cache_root = a.cache_root.resolve()
    res = {}
    with tempfile.TemporaryDirectory(prefix='blockside-per-ship-') as td:
        fx = Fixture(td, a.cache_root)
        try:
            run(fx, a, res)
        finally:
            fx.close()
    print(json.dumps(res, ensure_ascii=False, indent=1))
    if a.out:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps(res, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()

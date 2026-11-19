"""build --ship (FAR-81): building one ship must write what the full build writes, and must refuse when it cannot.
python -I src/tests/build_ship_test.py --cache-root <folder of .vxk> [--ids a,b] [--no-each] [--full | --subset] [--new-vxk <file>] [--out result.json]
Runs in a disposable git worktree at HEAD with this checkout's src/admin.py copied in; HEAD's product must match its sources (srccheck).
Needs a Python with numpy (the build's grid packing imports it). --cache-root's .vxk count only where they match HEAD's
fingerprints (src/config/ships/<id>.json lock; cacheMatches in the result); a _cache exported for another version matches none.
  default : A) every ship whose variant family has matching .vxk in --cache-root: build --ship with ONLY that family in _cache
               leaves index.html, ships/ and src/ byte-identical (--ids limits the list, --no-each skips A). A .vxk that matches
               its fingerprint but not the build's bytes (re-exported elsewhere: JSON key order, export time) must be refused
               with nothing written; those are listed under 'refusedCacheBytes'.
            C) refusals: another ship's fingerprint changed, a ship file missing, family incomplete, vxk_inline.py output changed,
               two other ships swapped, the ship's .vxk not matching its fingerprint, unknown id, a family ship's label (el) renamed:
               each must Fail and write nothing.
  --full  : every ship must match. HEAD's admin.py and this admin.py full builds both reproduce HEAD byte-for-byte; then for
            (one voxel of a plain ship edited, a new ship imported with --only, the variant base edited, and import/reimport
            with rope binding run for real — shipcheck_page stubbed to change every rope's bind, so the rebuild after it runs:
            act_build → act_ropebind → act_build against build --ship twice) the full build and build --ship write the same
            bytes, _cache and the per-ship config files (fingerprints) included.
  --subset: --full on the ships that do match (families kept whole; --ids picks a smaller fleet: those ships' families);
            that fleet's full build becomes the fixture's HEAD. A full build packs ~7 s per ship on a 4-core Linux host.
In --full/--subset the thumbnail capture (Chrome) is stubbed on both sides alike.
"""
import argparse, importlib.util, json, shutil, struct, subprocess, sys, tempfile, zlib
from pathlib import Path
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[2]


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def git(cwd, *a, inp=None):
    return subprocess.run(['git', *a], cwd=cwd, check=True, capture_output=True, text=True, input=inp).stdout.strip()


class Fixture:
    def __init__(self, td, cache_root):
        self.w = Path(td) / 'wt'
        git(ROOT, 'worktree', 'add', '--detach', str(self.w), 'HEAD')
        shutil.copyfile(ROOT / 'src/admin.py', self.w / 'src/admin.py')
        self.adm = module(self.w / 'src/admin.py', 'build_ship_admin')
        self.cache, self.src = self.w / 'VoxelKit/_cache', cache_root
        self.cache.mkdir(parents=True, exist_ok=True)

    def close(self):
        git(ROOT, 'worktree', 'remove', '--force', str(self.w))

    def files(self, cache=False):
        """Everything a build may write (and, with cache, the _cache .vxk files): {relative path: bytes}."""
        out = {p: (self.w / p).read_bytes() for p in ('index.html', 'src/template.html', 'src/config/game.json')}
        out.update({'src/config/ships/' + f.name: f.read_bytes() for f in (self.w / 'src/config/ships').glob('*.json')})
        out.update({'ships/' + f.name: f.read_bytes() for f in (self.w / 'ships').glob('*.js')})
        if cache:
            out.update({'VoxelKit/_cache/' + f.name: f.read_bytes() for f in self.cache.iterdir() if f.is_file()})
        return out

    def restore(self, st):
        for f in (self.w / 'ships').glob('*.js'):
            if 'ships/' + f.name not in st:
                f.unlink()
        for f in (self.w / 'src/config/ships').glob('*.json'):
            if 'src/config/ships/' + f.name not in st:
                f.unlink()
        if any(k.startswith('VoxelKit/_cache/') for k in st):
            for f in self.cache.iterdir():
                if f.is_file() and 'VoxelKit/_cache/' + f.name not in st:
                    f.unlink()
        for p, b in st.items():
            (self.w / p).write_bytes(b)

    def fill(self, ids):
        """_cache holds exactly these ships (copied from --cache-root)."""
        for f in self.cache.iterdir():
            if f.is_file():
                f.unlink()
        for s in self.adm.load()['ships']:
            if s['id'] in ids:
                shutil.copyfile(self.src / s['vxk'], self.cache / s['vxk'])


def diff(a, b):
    return sorted(k for k in set(a) | set(b) if a.get(k) != b.get(k))


def edit_voxel(adm, path):
    """Recolour the first solid voxel (one byte of the chunk data), keep the header."""
    import struct, zlib
    raw = zlib.decompress(path.read_bytes(), -15)
    n = struct.unpack('<I', raw[4:8])[0]
    h, grid = json.loads(raw[8:8 + n].decode('utf-8')), bytearray(raw[8 + n:])
    at = h['nchunks'] * 6 + next(i for i, v in enumerate(grid[h['nchunks'] * 6:]) if v)
    grid[at] = grid[at] % 255 + 1
    adm.vxk_write(str(path), h, bytes(grid))


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--cache-root', type=Path, required=True)
    p.add_argument('--ids')
    p.add_argument('--no-each', action='store_true')
    g = p.add_mutually_exclusive_group()
    g.add_argument('--full', action='store_true')
    g.add_argument('--subset', action='store_true')
    p.add_argument('--new-vxk', type=Path)
    p.add_argument('--out', type=Path)
    a = p.parse_args()
    a.cache_root, a.new_vxk = a.cache_root.resolve(), a.new_vxk and a.new_vxk.resolve()
    res = {}
    with tempfile.TemporaryDirectory(prefix='blockside-build-ship-') as td:
        fx = Fixture(td, a.cache_root)
        try:
            run(fx, a, res)
        finally:
            fx.close()
    print(json.dumps(res, ensure_ascii=False, indent=1))
    if a.out:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps(res, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')


def run(fx, a, res):
    adm = fx.adm
    adm.act_srccheck()                                         # HEAD's product is built from HEAD's sources
    ships, lock = adm.load()['ships'], adm.lock_load()
    byid = {s['id']: s for s in ships}
    ok = {s['id'] for s in ships if (a.cache_root / s['vxk']).is_file() and adm.vxk_fp((a.cache_root / s['vxk']).read_bytes()) == lock.get(s['vxk'])}
    fam = {s['id']: adm.ship_family(ships, s['id']) for s in ships}
    usable = [s['id'] for s in ships if fam[s['id']] <= ok]
    res['cacheMatches'], res['usable'] = len(ok), len(usable)
    print('_cache matching its fingerprint: %d of %d ships; usable for build --ship (whole family): %d' % (len(ok), len(ships), len(usable)), flush=True)
    base = fx.files()

    # A) unchanged ships: build --ship with only that family in _cache writes nothing new
    if not a.no_each:
        ids = a.ids.split(',') if a.ids else usable
        res['each'], res['refusedCacheBytes'] = {}, []
        for sid in ids:
            fx.fill(fam[sid])
            try:
                log, why = adm.act_build_ship(sid), None
            except adm.Fail as e:
                log, why = [], str(e)
            d = diff(base, fx.files())
            if why and '重做出來的船檔卻不一樣' in why and not d:
                res['refusedCacheBytes'].append(sid)
                res['each'][sid] = 'refused (_cache bytes differ from the build outside the fingerprint), nothing written'
                print('A %-16s refused, nothing written: %s' % (sid, why.split('，')[0]), flush=True)
                continue
            res['each'][sid] = 'identical' if not d and not why else {'error': why, 'written': d}
            print('A %-16s %s' % (sid, 'identical to HEAD' if not d and not why else 'FAILED: %s / %s' % (why, d)), flush=True)
            assert not d and not why, (sid, why, d, log[-12:])
        fx.restore(base)

    # C) refusals: each must raise Fail with the expected reason and leave every file as it was
    variant = next((s for s in ships if s.get('variant_of') and fam[s['id']] <= ok), None)
    tgt = variant['id'] if variant else usable[0]
    others = [s for s in ships if s['id'] not in fam[tgt]]
    o1, o2 = others[0], others[1]

    def lockset(vxk, fn):
        L = adm.lock_load()
        L[vxk] = fn(L[vxk])
        adm.lock_save(L)

    def swap():
        c = adm.load()
        i, j = c['ships'].index(next(s for s in c['ships'] if s['id'] == o1['id'])), c['ships'].index(next(s for s in c['ships'] if s['id'] == o2['id']))
        c['ships'][i], c['ships'][j] = c['ships'][j], c['ships'][i]
        adm.save(c)

    def inline():
        f = fx.w / 'VoxelKit/vxk_inline.py'
        t = f.read_text(encoding='utf-8')
        k = '"<script>\\n(function () {'                    # the bundle wrapper it writes (not the comment above it)
        assert k in t
        f.write_text(t.replace(k, k.replace('function ()', 'function()')), encoding='utf-8', newline='')
    def relabel(sid):
        c = adm.load()
        s = next(s for s in c['ships'] if s['id'] == sid)
        s['el'] += '-renamed'
        adm.save(c)
    flip = lambda v: v[:2] + ('0' if v[2] != '0' else '1') + v[3:]       # the product records 'c:' + 12 hex of each fingerprint (src_manifest)
    cases = [
        ('another ship fingerprint', tgt, fam[tgt], lambda: lockset(o1['vxk'], flip), '指紋跟成品記的不一樣'),
        ('another ship file missing', tgt, fam[tgt], lambda: (fx.w / adm.ship_file(o1['el'])).unlink(), '不在'),
        ('family incomplete', tgt, {tgt}, lambda: None, '_cache 沒有這艘') if variant else None,
        ('vxk_inline.py output changed', tgt, fam[tgt], inline, '跟現在的成品不一樣'),
        ('two other ships swapped', tgt, fam[tgt], swap, '跟成品的船清單'),
        ('ship .vxk not its fingerprint', tgt, fam[tgt], lambda: lockset(byid[tgt]['vxk'], flip), '跟指紋'),
        ('unknown id', 'no_such_ship', set(), lambda: None, '沒有代號'),
        ('family ship label renamed', tgt, fam[tgt], lambda: relabel(tgt), '跟成品的船清單'),
    ]
    res['refuse'] = {}
    keep_inline = (fx.w / 'VoxelKit/vxk_inline.py').read_bytes()
    for c in filter(None, cases):
        name, sid, fill, setup, want = c
        fx.restore(base)
        (fx.w / 'VoxelKit/vxk_inline.py').write_bytes(keep_inline)
        fx.fill(fill)
        setup()
        before = fx.files()
        try:
            adm.act_build_ship(sid)
            got = None
        except adm.Fail as e:
            got = str(e)
        d = diff(before, fx.files())
        good = got is not None and want in got and not d
        res['refuse'][name] = 'refused, nothing written' if good else {'error': got, 'written': d}
        print('C %-32s %s' % (name, 'refused, nothing written' if good else 'FAILED: %s / %s' % (got, d)), flush=True)
        assert good, (name, got, d)
    fx.restore(base)
    (fx.w / 'VoxelKit/vxk_inline.py').write_bytes(keep_inline)

    if a.full or a.subset:
        same_as_full(fx, a, res, ok, fam, base)


def same_as_full(fx, a, res, ok, fam, head):
    """B) full build vs build --ship on the same inputs (and D: HEAD's admin.py full build == this one)."""
    adm = fx.adm
    head_py = fx.w / 'src/admin_head.py'
    head_py.write_text(git(fx.w, 'show', 'HEAD:src/admin.py') + '\n', encoding='utf-8', newline='')
    old = module(head_py, 'build_ship_admin_head')
    stub = lambda m: patch.object(m, 'thumbs_finish', return_value=['(thumbnail capture stubbed)'])
    ships = adm.load()['ships']
    if a.full:
        assert len(ok) == len(ships), 'every ship must match its fingerprint for --full (%d of %d)' % (len(ok), len(ships))
        keep = ok
    else:
        keep = {s['id'] for s in ships if fam[s['id']] <= ok and (not a.ids or any(s['id'] in fam[i] for i in a.ids.split(',')))}
        c = adm.load()
        c['ships'] = [s for s in c['ships'] if s['id'] in keep]
        E = adm.validate(c)
        if E:                                                  # removed ships may be referenced by the parts table
            c['parts'] = {'guns': {}}
            E = adm.validate(c)
        assert not E, E
        adm.save(c)
    fx.fill(keep)
    st0 = fx.files(cache=True)
    with stub(old):
        old.act_build()
    by_head = fx.files()
    fx.restore(st0)
    with stub(adm):
        adm.act_build()
    base = fx.files(cache=True)
    d = diff(by_head, fx.files())
    res['fullBuildSameAsHeadAdmin'] = not d
    print('D full build: HEAD admin.py vs this admin.py %s' % ('identical' if not d else 'DIFFER: %s' % d), flush=True)
    assert not d, d
    if a.full:
        d = diff(head, fx.files())
        res['fullBuildSameAsHeadProduct'] = not d
        print('D full build reproduces HEAD %s' % ('byte-for-byte' if not d else 'NOT: %s' % d), flush=True)
        assert not d, d
    else:                                                      # the subset product becomes the fixture's HEAD (plumbing commit, nothing pushed)
        git(fx.w, 'add', '-A', '--', 'index.html', 'ships', 'src')
        git(fx.w, 'reset', '--soft', git(fx.w, 'commit-tree', git(fx.w, 'write-tree'), '-p', 'HEAD', inp='build_ship_test subset baseline\n'))
    ships = adm.load()['ships']
    plain = next(s for s in ships if len(fam[s['id']]) == 1)
    variant = next((s for s in ships if s.get('variant_of')), None)
    new_vxk = a.new_vxk or (a.cache_root / plain['vxk'])

    def voxel(s):
        def go():
            edit_voxel(adm, fx.cache / s['vxk'])
            adm.lock_put(s['vxk'])
        return go

    def ropes(vxk):
        raw = zlib.decompress(Path(vxk).read_bytes(), -15)
        n = struct.unpack('<I', raw[4:8])[0]
        return (json.loads(raw[8:8 + n].decode('utf-8')).get('rig') or {}).get('ropes') or []

    def binds(chrome, sid, extra=''):                          # shipcheck_page stand-in: a bind for every rope that differs from the .vxk's
        s = next(x for x in adm.load()['ships'] if x['id'] == sid)
        return {'binds': [[0, 0] if r.get('bind') != [0, 0] else None for r in ropes(fx.cache / s['vxk'])]}

    def roped(act, only):
        """import/reimport with rope binding run for real; the build it ends with must run twice (before and after the binds)."""
        def go():
            wrap = 'act_build_ship' if only else 'act_build'
            with patch.object(adm, 'CHROMES', [sys.executable]), patch.object(adm, 'shipcheck_page', side_effect=binds), \
                 patch.object(adm, 'REPORTS', str(fx.w.parent / 'reports')), patch.object(adm, 'act_ancbake', return_value=[]), \
                 patch.object(adm, 'act_shipcheck', return_value=[]), patch.object(adm, 'act_showlod', return_value=[]), \
                 patch.object(adm, wrap, wraps=getattr(adm, wrap)) as w:
                log = act(only)
            assert w.call_count == 2, (wrap, w.call_count, log[-12:])
            assert any('檔頭改了' in l and '檔頭改了 0 條' not in l for l in log), log[-12:]
        return go
    rp = next((s for s in sorted(ships, key=lambda s: len(fam[s['id']])) if ropes(a.cache_root / s['vxk'])), None)
    assert rp, 'no ship with ropes in this fleet: the rope-binding rebuild cannot be tested'

    def reimp(only):
        def edited(work, dest):
            shutil.copyfile(fx.cache / rp['vxk'], dest)
            edit_voxel(adm, Path(dest))
        with patch.object(adm, 'export', side_effect=edited):
            return adm.act_reimport(rp['id'], build=True, only=only)

    def imp_roped(only):
        with patch.object(adm, 'export', side_effect=lambda work, dest: shutil.copyfile(a.cache_root / rp['vxk'], dest)):
            return adm.act_import('fixture-new-ship', 'probe_new', 'Probe', build=True, only=only)

    def imp(only):
        with patch.object(adm, 'export', side_effect=lambda work, dest: shutil.copyfile(new_vxk, dest)), \
             patch.object(adm, 'act_ropebind', return_value=[]), patch.object(adm, 'act_ancbake', return_value=[]), \
             patch.object(adm, 'act_shipcheck', return_value=[]), patch.object(adm, 'act_showlod', return_value=[]):
            return adm.act_import('fixture-new-ship', 'probe_new', 'Probe', build=only, only=only)
    scen = [('one voxel of %s' % plain['id'], voxel(plain), adm.act_build, lambda: adm.act_build_ship(plain['id'])),
            ('new ship imported (import --only)', lambda: None, lambda: imp(False) + adm.act_build(), lambda: imp(True))]
    if variant:
        b0 = next(s for s in ships if s['id'] == variant['variant_of'])
        scen.append(('one voxel of variant base %s' % b0['id'], voxel(b0), adm.act_build, lambda: adm.act_build_ship(b0['id'])))
    scen += [('reimport --only %s, rope binding run' % rp['id'], lambda: None, roped(reimp, False), roped(reimp, True)),
             ('import --only, rope binding run', lambda: None, roped(imp_roped, False), roped(imp_roped, True))]
    res['sameAsFull'] = {}
    for name, prep, full, one in scen:
        fx.restore(base)
        prep()
        pre = fx.files(cache=True)
        with stub(adm):
            full()
        want = fx.files(cache=True)
        fx.restore(pre)
        with stub(adm):
            one()
        got = fx.files(cache=True)
        d = diff(want, got)
        built = lambda F: {k: v for k, v in F.items() if not k.startswith('VoxelKit/')}
        changed = diff(built(base), built(want))
        res['sameAsFull'][name] = {'identical': not d, 'changedByFullBuild': changed} if not d else {'differ': d}
        print('B %-36s %s (full build changed %d files: %s)' % (name, 'identical' if not d else 'DIFFER: %s' % d, len(changed), ', '.join(changed)), flush=True)
        assert not d, (name, d)
        assert changed, (name, 'the scenario changed nothing')
    fx.restore(base)


if __name__ == '__main__':
    main()

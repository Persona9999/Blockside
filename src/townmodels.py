"""城鎮的建築與城牆模型（TASK-0740）：雕刻作品（Blocksail 建築套件 summit-bourg-fr-01m，規格 Blocksail docs/BUILDING_SPEC.md）⇒ src/js/63_towndata.js（TOWN_KIT）。

  python -I src/townmodels.py export      # 照 MODELS 從雕刻作品匯出 .vxk ⇒ VoxelKit/_cache/town/<名>.vxk（不入版控）
  python -I src/townmodels.py build       # _cache/town/*.vxk ⇒ src/js/63_towndata.js（入版控；同一份輸入兩次逐位元組相同）

遠近四級（Blocksail docs/TOWN_BUILD.md §6；Tim 2026-10-19：「可以預先在匯入時就計算好低模」）—— 低模、貼圖都在這裡算好，遊戲開局只讀：
- 近：原模型（0.1 m 的格子；遊戲照區塊做同色面合併 VK.meshChunk，一種一份、照實例畫）。
- 中：低模 ＝ 4 × 4 × 4 格併一格（0.4 m）：那一塊有 ≥ LO_FILL 格才算有東西、顏色取最多的那一色（同票取色號小的）。
- 遠：貼圖 ＝ 從八個方向（模型的 xy 平面每 45°，k ＝ 0 從 +x 看過來、逆時針）正交照側面，PPM 像素／公尺；
  每一格照「露在外面、最朝鏡頭的那一面」打固定的光；八張排一列進同一張圖集（PNG，alpha ＝ 有沒有東西）。
- 更遠：屋頂殼 —— 遊戲照每棟的 top（最高的格頂，公尺）與 roof（俯視看到的最上面那一格的平均色）每 32 m 一格算。
外部模型（燈籠、酒桶，rig.meshes）在這裡體素化進格子（三角形每 ¼ 格取一點、落到的空格塗那個三角形的材質色）⇒ 四級都有它。
座標照作品（x 臨路寬、y 進深 y 0 ＝ 臨路、z 高）；放到地塊上的公式在 src/js/63_towns.js 檔頭。
"""
import base64, json, os, struct, subprocess, sys, zlib
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(ROOT, 'VoxelKit', '_cache', 'town')
OUT = os.path.join(HERE, 'js', '63_towndata.js')
KIT = 'summit-bourg-fr-01m'
# 名字 ⇒ 用途、型（同一種用途的變化，遊戲照地塊的雜湊挑）；城牆模組 ⇒ part、tier
MODELS = [
    ('house-a', 'house', 'a'), ('house-b', 'house', 'b'), ('house-c', 'house', 'c'),
    ('house-a2', 'house', 'a2'), ('house-b2', 'house', 'b2'), ('house-c2', 'house', 'c2'),
    ('church', 'church', 'a'), ('townhall', 'townhall', 'a'), ('governor', 'governor', 'a'),
    ('tavern', 'tavern', 'a'), ('warehouse', 'warehouse', 'a'), ('market', 'market', 'a'),
    ('wall1-section', 'wall', 'section'), ('wall1-tower', 'wall', 'tower'), ('wall1-gate', 'wall', 'gate'),
    ('wall1-joint', 'wall', 'joint'), ('wall1-end', 'wall', 'end'),
]
LO_F, LO_FILL, PPM = 4, 12, 4                                  # 低模幾格併一格、一塊至少幾格才算有東西、貼圖每公尺幾像素
VIEWS = 8
LIGHT = np.array([0.45, -0.35, 0.82]); LIGHT = LIGHT / np.linalg.norm(LIGHT)


def senate_export(work, out):
    cmd = ['senate', 'cmd', 'sculpture', '--arg', 'op=export', '--arg', 'format=vxk', '--arg', 'work=' + work,
           '--arg', 'include=rig,models,parts,meta', '--arg', 'out=' + out]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode or not os.path.exists(out):
        raise SystemExit('匯出失敗 %s：\n%s' % (work, (r.stdout + r.stderr)[-1500:]))


def act_export():
    os.makedirs(CACHE, exist_ok=True)
    for name, _, _ in MODELS:
        p = os.path.join(CACHE, name + '.vxk')
        senate_export(KIT + '-' + name, os.path.abspath(p))
        print('匯出', name, os.path.getsize(p), 'bytes')


def read_vxk(path):
    raw = zlib.decompress(open(path, 'rb').read(), -15)
    if raw[:4] != b'VXK1': raise SystemExit('%s：不是 VXK1' % path)
    hn = struct.unpack('<I', raw[4:8])[0]
    h = json.loads(raw[8:8 + hn].decode('utf-8'))
    n, p = h['nchunks'], 8 + hn
    keys = np.frombuffer(raw[p:p + n * 6], dtype='<u2').reshape(n, 3)
    data = np.frombuffer(raw[p + n * 6:p + n * 6 + n * 4096], dtype=np.uint8).reshape(n, 16, 16, 16)   # [z][y][x]
    sx, sy, sz = h['size']
    g = np.zeros(((sz + 15) // 16 * 16, (sy + 15) // 16 * 16, (sx + 15) // 16 * 16), dtype=np.uint8)
    for i in range(n):
        cx, cy, cz = (int(v) for v in keys[i])
        g[cz * 16:cz * 16 + 16, cy * 16:cy * 16 + 16, cx * 16:cx * 16 + 16] = data[i]
    return h, g[:sz, :sy, :sx].copy()                           # g[z, y, x]


def rgb332(c):
    r, gg, b = (min(1.0, max(0.0, float(v))) for v in c[:3])
    v = (int(round(r * 7)) << 5) | (int(round(gg * 7)) << 2) | int(round(b * 3))
    return v or 37                                              # 0 ＝ 空 ⇒ 純黑改成很深的灰


def voxelize_models(h, g):
    """外部模型（三角形）⇒ 塗進空格；回傳塗了幾格。"""
    rig = h.get('rig') or {}
    meshes, put = rig.get('meshes') or [], 0
    sz, sy, sx = g.shape
    for m in rig.get('models') or []:
        M = meshes[m['mesh']]
        V = np.array(M['verts'], dtype=np.float64).reshape(-1, 3) + np.array(m['origin'], dtype=np.float64)
        T = np.array(M['tris'], dtype=np.int64).reshape(-1, 3)
        cols = [rgb332(c) for c in M['mats']]
        for t, tri in enumerate(T):
            a, b, c = V[tri[0]], V[tri[1]], V[tri[2]]
            L = max(np.linalg.norm(b - a), np.linalg.norm(c - a), np.linalg.norm(c - b))
            k = max(1, int(np.ceil(L * 4)))
            u, v = np.meshgrid(np.arange(k + 1), np.arange(k + 1))
            msk = (u + v) <= k
            u, v = u[msk] / k, v[msk] / k
            P = a[None, :] + (b - a)[None, :] * u[:, None] + (c - a)[None, :] * v[:, None]
            ix = np.floor(P).astype(np.int64)
            ok = (ix[:, 0] >= 0) & (ix[:, 1] >= 0) & (ix[:, 2] >= 0) & (ix[:, 0] < sx) & (ix[:, 1] < sy) & (ix[:, 2] < sz)
            ix = np.unique(ix[ok], axis=0)
            col = cols[M['tmat'][t]] if M.get('tmat') else 37
            for x, y, z in ix:
                if not g[z, y, x]: g[z, y, x] = col; put += 1
    return put


def pack_chunks(g):
    """g[z, y, x] ⇒ deflate-raw（區塊數 u32、每塊 (cx, cy, cz) u16、每塊 4096 位元組（索引 x ＋ 16y ＋ 256z））⇒ base64。照 (cx, cy, cz) 字典序。"""
    sz, sy, sx = g.shape
    P = np.zeros(((sz + 15) // 16 * 16, (sy + 15) // 16 * 16, (sx + 15) // 16 * 16), dtype=np.uint8)
    P[:sz, :sy, :sx] = g
    nz, ny, nx = P.shape[0] // 16, P.shape[1] // 16, P.shape[2] // 16
    keys, blocks = [], []
    for cx in range(nx):
        for cy in range(ny):
            for cz in range(nz):
                b = P[cz * 16:cz * 16 + 16, cy * 16:cy * 16 + 16, cx * 16:cx * 16 + 16]
                if b.any(): keys.append((cx, cy, cz)); blocks.append(b.tobytes())
    raw = struct.pack('<I', len(keys)) + b''.join(struct.pack('<3H', *k) for k in keys) + b''.join(blocks)
    co = zlib.compressobj(9, zlib.DEFLATED, -15, 9)
    return base64.b64encode(co.compress(raw) + co.flush()).decode('ascii'), len(keys)


def downsample(g, f):
    sz, sy, sx = g.shape
    Z, Y, X = (sz + f - 1) // f, (sy + f - 1) // f, (sx + f - 1) // f
    P = np.zeros((Z * f, Y * f, X * f), dtype=np.uint8); P[:sz, :sy, :sx] = g
    B = P.reshape(Z, f, Y, f, X, f).transpose(0, 2, 4, 1, 3, 5).reshape(Z, Y, X, f * f * f)
    cnt = (B > 0).sum(axis=3)
    out = np.zeros((Z, Y, X), dtype=np.uint8)
    idx = np.argwhere(cnt >= LO_FILL)
    for z, y, x in idx:
        v = B[z, y, x]; v = v[v > 0]
        bc = np.bincount(v, minlength=256); out[z, y, x] = int(np.argmax(bc))   # 最多的那一色（同票 argmax 取色號小的）
    return out


def exposed(g):
    """每一格六個面露不露（+x −x +y −y +z −z）⇒ bool[6, z, y, x]。"""
    f = g > 0
    P = np.pad(f, 1)
    E = np.zeros((6,) + f.shape, dtype=bool)
    E[0] = f & ~P[1:-1, 1:-1, 2:]; E[1] = f & ~P[1:-1, 1:-1, :-2]
    E[2] = f & ~P[1:-1, 2:, 1:-1]; E[3] = f & ~P[1:-1, :-2, 1:-1]
    E[4] = f & ~P[2:, 1:-1, 1:-1]; E[5] = f & ~P[:-2, 1:-1, 1:-1]
    return E


NRM = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], dtype=np.float64)


def impostors(g, mpv):
    """八個方向的側面照 ⇒ (cw, ch, [RGBA uint8[ch, cw, 4] × 8], 寬（公尺）, 高（公尺）)。鏡頭在模型中心往 φk ＝ k·45° 那一邊（xy 平面），往中心看。"""
    sz, sy, sx = g.shape
    E = exposed(g)
    surf = E.any(axis=0)
    z, y, x = np.nonzero(surf)
    col = g[z, y, x]
    cx, cy = sx / 2.0, sy / 2.0
    W = float(np.hypot(sx, sy)) * mpv; H = sz * mpv
    cw, ch = int(np.ceil(W * PPM)), int(np.ceil(H * PPM))
    rgb = np.stack([((col >> 5) & 7) / 7.0, ((col >> 2) & 7) / 7.0, (col & 3) / 3.0], axis=1)
    out = []
    for k in range(VIEWS):
        ph = k * 2 * np.pi / VIEWS
        toc = np.array([np.cos(ph), np.sin(ph), 0.0])           # 往鏡頭
        right = np.array([-np.sin(ph), np.cos(ph)])
        best = np.full(len(z), -2.0); sh = np.zeros(len(z))
        for f in range(6):
            e = E[f][z, y, x]; d = float(NRM[f] @ toc)
            if f >= 4: d = 0.05 if f == 4 else -1.0              # 正交側面照：頂面、底面不朝鏡頭 ⇒ 只有側面都沒露時才拿頂面的光
            better = e & (d > best)
            best = np.where(better, d, best)
            sh = np.where(better, 0.62 + 0.5 * max(0.0, float(NRM[f] @ LIGHT)), sh)
        u = ((x + 0.5 - cx) * right[0] + (y + 0.5 - cy) * right[1]) * mpv + W / 2
        dep = (x + 0.5 - cx) * toc[0] + (y + 0.5 - cy) * toc[1]
        px = np.clip((u * PPM).astype(np.int64), 0, cw - 1)
        py = np.clip(((sz - z - 0.5) * mpv * PPM).astype(np.int64), 0, ch - 1)
        order = np.argsort(dep, kind='stable')                  # 遠的先畫、近的蓋上去
        img = np.zeros((ch, cw, 4), dtype=np.float64)
        img[py[order], px[order], :3] = rgb[order] * sh[order, None]
        img[py[order], px[order], 3] = 1.0
        out.append(img)
    return cw, ch, out, W, H


def bleed(img):
    """透明的像素塗上旁邊有東西的平均色（mipmap 縮小時邊緣不帶黑邊）；alpha 不變。"""
    a = img[..., 3] > 0
    c = img[..., :3].copy()
    filled = a.copy()
    for _ in range(4):
        P = np.pad(c * filled[..., None], ((1, 1), (1, 1), (0, 0))); Q = np.pad(filled.astype(np.float64), 1)
        s = sum(P[1 + dy:P.shape[0] - 1 + dy, 1 + dx:P.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        n = sum(Q[1 + dy:Q.shape[0] - 1 + dy, 1 + dx:Q.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        new = (~filled) & (n > 0)
        c[new] = s[new] / n[new, None]; filled = filled | new
    out = img.copy(); out[..., :3] = c
    return out


def png(rgba):
    h, w, _ = rgba.shape
    raw = b''.join(b'\x00' + rgba[r].tobytes() for r in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def roof_info(g, mpv):
    sz, sy, sx = g.shape
    f = g > 0
    top = int(np.max(np.nonzero(f.any(axis=(1, 2)))[0])) + 1 if f.any() else 0
    has = f.any(axis=0)
    zt = sz - 1 - np.argmax(f[::-1], axis=0)                    # 每一欄最上面那一格
    yy, xx = np.nonzero(has)
    c = g[zt[yy, xx], yy, xx]
    rgb = np.stack([((c >> 5) & 7) / 7.0, ((c >> 2) & 7) / 7.0, (c & 3) / 3.0], axis=1).mean(axis=0) if len(c) else np.zeros(3)
    return round(top * mpv, 2), [round(float(v), 3) for v in rgb], round(float(has.mean()), 3)


def act_build():
    models, cells, rows, src = {}, [], [], []
    for name, use, var in MODELS:
        p = os.path.join(CACHE, name + '.vxk')
        if not os.path.exists(p): raise SystemExit('沒有 %s ⇒ 先跑 python -I src/townmodels.py export' % p)
        h, g = read_vxk(p)
        mpv = float(h.get('meters_per_voxel') or 0.1)
        put = voxelize_models(h, g)
        gb, nch = pack_chunks(g)
        lo = downsample(g, LO_F)
        lb, lnc = pack_chunks(lo)
        cw, ch, imgs, Wm, Hm = impostors(g, mpv)
        top, roof, cover = roof_info(g, mpv)
        meta = {}
        for part in h.get('parts') or []:
            m = part.get('meta') or {}
            if m.get('kind') in ('building', 'wall') and not meta: meta = m   # 最外層那一條（BUILDING_SPEC §5）
        sx, sy, sz = h['size']
        e = {'work': h['work'], 'use': use, 'variant': var, 'size': [sx, sy, sz], 'mpv': mpv, 'n': int((g > 0).sum()), 'models': put,
             'g': gb, 'lo': {'f': LO_F, 'size': list(lo.shape[::-1]), 'n': int((lo > 0).sum()), 'g': lb},
             'im': {'cw': cw, 'ch': ch, 'w': round(Wm, 3), 'h': round(Hm, 3)}, 'top': top, 'roof': roof, 'cover': cover,
             'pts': {k: v for k, v in sorted((h.get('points') or {}).items())}}
        if use == 'wall':
            e['part'] = var; e['tier'] = int(name[4]); e['len'] = float(meta.get('len', 0) or 0) or round(sx * mpv, 2)
        else:
            lot = str(meta.get('lot') or '%d,%d' % (round(sx * mpv), round(sy * mpv))).split(',')
            e['lot'] = [int(lot[0]), int(lot[1])]; e['base'] = float(meta.get('base', 0) or 0)
        models[name] = e
        cells.append((name, cw, ch, imgs))
        src.append('%s@%s（%d 格＋外部模型 %d 格）' % (h['work'], h.get('checksum'), h.get('voxels'), put))
        rows.append('%-14s %4d×%3d×%3d %7d 格 區塊 %3d ｜ 低模 %3d×%3d×%3d %6d 格 ｜ 貼圖 %3d×%3d ×%d ｜ 頂 %.1f m' % (name, sx, sy, sz, e['n'], nch, *e['lo']['size'], e['lo']['n'], cw, ch, VIEWS, top))
    # 圖集：一個模型一列（八張橫排），列照模型順序往下排；寬 ＝ 最寬那一列
    AW = max(cw * VIEWS for _, cw, _, _ in cells); AW = 1 << int(np.ceil(np.log2(AW)))
    AH = sum(ch for _, _, ch, _ in cells); AH = 1 << int(np.ceil(np.log2(AH)))
    atlas = np.zeros((AH, AW, 4), dtype=np.float64)
    y0 = 0
    for name, cw, ch, imgs in cells:
        for k, im in enumerate(imgs): atlas[y0:y0 + ch, k * cw:(k + 1) * cw] = bleed(im)
        models[name]['im'].update({'x': 0, 'y': y0})
        y0 += ch
    a8 = np.clip(np.round(atlas * 255), 0, 255).astype(np.uint8)
    pb = base64.b64encode(png(a8)).decode('ascii')
    kit = {'v': 1, 'kit': KIT, 'views': VIEWS, 'ppm': PPM, 'atlas': {'w': AW, 'h': AH, 'png': pb}, 'models': models}
    head = ('// 城鎮的建築與城牆模型（TASK-0740）—— ⛔ 不手改：python -I src/townmodels.py build 產生（說明見那支的檔頭）。\n'
            '// 來源（雕刻作品@checksum）：' + '；'.join(src) + '\n')
    body = 'var TOWN_KIT = ' + json.dumps(kit, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + ';\n'
    open(OUT, 'w', encoding='utf-8', newline='\n').write(head + body)
    print('\n'.join(rows))
    print('圖集 %d×%d PNG %d KB；輸出 %s（%d KB）' % (AW, AH, len(pb) * 3 // 4 // 1024, OUT, os.path.getsize(OUT) // 1024))


if __name__ == '__main__':
    a = sys.argv[1:]
    if a == ['export']: act_export()
    elif a == ['build']: act_build()
    else: raise SystemExit(__doc__)

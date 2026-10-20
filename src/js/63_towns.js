// ───────────────────────── 城鎮（TASK-0740；只給人看） ─────────────────────────
// Blocksail 的城鎮規劃（格式 Blocksail docs/TOWN_BUILD.md §5、src/MAP_CHUNK.md §8）⇒ 整地、清樹、擺建築與城牆、路著色。第一版只給人看（Tim 2026-10-19 第 10 節第 5 題：
//   砲彈穿過去、船穿過去、不改戰局）⇒ ⛔ 不碰 C.h（模擬查的那一份）：整地只寫進給畫面的 C.hv（地形網格、樹照它），船、擱淺、砲彈打地面照舊讀 C.h
//   ⇒ 城鎮什麼時候到（檔案、外面那一頁生成要好幾秒）都跟戰局無關；無頭（?demo&headless）整段不做。?towns=0 ⇒ 不載城。
// 來源：area.towns（有城的 id 清單）⇒ 檔案 maps/<海域>/towns.js（BSMAP.town，一座一筆）或 ?map=@host 跟外面那一頁要（{ bsmap: 'need', what: 'towns' } ⇒ { bsmap: 'towns', towns }）。
//   規劃的座標以市中心為原點（往東 x、往南 y，公尺）；海域座標 ＝ (ox ＋ kx·x, oy ＋ y)（匯出時算好，Blocksail world/town_export.js）。
// 整地（townHv；每塊海圖塊第一次要畫的時候算、城到了再重算）：路（照 z，路寬一半 ＋ 一個取樣點內整平）先、地塊的 grade（照 h，外擴 TOWN_LOT_PAD）後，
//   外面照邊坡 1 : bank 接回原地形（|高差| ≤ 距離 ÷ bank，路最多接 TOWN_GRADE_REACH 公尺）；只改陸上的點（原本 ≤ 0 的不動 ⇒ 岸線不變）。
// 清樹（townClr）：規劃的 clear（有建築的地塊、路、城牆、碼頭各外擴 2 m；空建地不清）每 TOWN_CLR_G 公尺一格的遮罩 ⇒ 63_trees.js 擺樹時跳過。
// 建築（模型 63_towndata.js TOWN_KIT，src/townmodels.py 匯入時算好近、中、遠三份＋屋頂殼的資料）：地塊帶 model（模型名）⇒ 用那一個；不然照用途挑（同用途的變化照 地塊 id 的雜湊挑 ⇒ 每次一樣）。
//   模型 → 世界（BUILDING_SPEC §1）：a ＝ mx·mpv − 模型寬/2、b ＝ my·mpv − 模型深/2、θ ＝ lot.rot ⇒ 往東 ＝ cx ＋ a·sinθ − b·cosθ、往南 ＝ cy − a·cosθ − b·sinθ、高 ＝ h ＋ mz·mpv；
//   模型比地塊小（金斯敦的地塊照 Lilly 的棋盤）⇒ 臨路那一邊對齊、沿路置中：cx,cy ＝ at ＋ (d − 模型深)/2 ·(cosθ, sinθ)。底下墊一塊石基（townPlinth：到四角最低的地面再下 0.3 m）。
//   城牆（TOWN_BUILD §4）：照牆的 kit 挑一套模組（wall1～wall3 ＝ 一～三級、roman-land-inner／roman-land-outer／roman-sea ＝ 東羅馬城牆 1453；BUILDING_SPEC §6、§6.1）；
//   沒寫 kit ⇒ 一級（等級之後照規模 × 繁榮度換）、寫了但沒有那一套 ⇒ 一級（stat.skip 記 'wall:<kit>'）。
//   門、塔照位置（一套有好幾型塔 ⇒ 照順序輪流：東羅馬外牆方塔、新月塔交替）、兩頭收尾，中間照斷面沿曲線一節一節拉（節數 round(L / len)、每節沿 x 縮放補滿），−y（牆外）朝離城心遠的那一邊。
//   接縫（Tim 2026-10-20：「目前城市地圖的城牆 連接處會也接縫 是否可以參考其他遊戲的作法處理例如圖二的世紀帝國4城牆」）：斷面接成一條折線（每節是兩站之間的弦、相鄰兩節共用一站，路線的頂點一定是站）
//   ⇒ 站上照兩節的角平分面斜接（著色器照 aJ 把那一節沿 x 切成梯形）、接到門／塔／轉角／收尾的那一頭照部件的端面切齊；高度照兩站的地面線性接（坡上順著走，不再一節一階），
//   牆基（模型 z 0 那一層）往下延到腳下最低的地面；轉得急（≥ TOWN_WALL_CORNER）的頂點要有部件蓋著（同世紀帝國轉角的塔）：附近有塔 ⇒ 塔挪到轉角上（stat.snapped），
//   沒有 ⇒ 擺一件轉角（那一套的 joint；沒有 ⇒ 第一型塔；stat.corners）。會改到手擺的塔（君士坦丁堡新擺 6、加拉塔新擺 7〔22 → 29 座〕、挪 9 座）⇒ Tim 2026-10-20 選保留。
// 遠近四級（照樹那一套；距離 TOWN_LOD、TOWN_FAR）：近 原模型、中 低模（0.4 m）、遠 貼圖（八個方向先拍好，取最接近視線的那一張）、更遠 屋頂殼（每 TOWN_SHELL_G 公尺一格的屋頂高與顏色）；
//   每一級的交接帶兩邊都畫、用同一個抖動互補（同一個像素只有一個）。看得到的實例照視錐剔、鏡頭動了 TOWN_REBIN 公尺才重新分組（townBin）。
// 路（TOWN_BUILD 第 10 節第 7 題：地形上著色）：照路的 z 鋪一條貼地的帶子（土路、石板路的顏色）；廣場、碼頭、棧橋同一份網格。
var TOWN_LOD = [160, 800], TOWN_FAR = [2400, 3000], TOWN_BAND = [24, 60, 300], TOWN_REBIN = 8, TOWN_SHELL_G = 32, TOWN_GRADE_REACH = 12, TOWN_LOT_PAD = 2, TOWN_CLR_G = 2, TOWN_ROAD_LIFT = 0.12, TOWN_GROUND_VIEW = 1600;
var TOWN_WALL_CORNER = 30, TOWN_WALL_KMAX = 1;                         // 城牆：轉角件從轉幾度起擺；斜接最多切多斜（tan，1 ＝ 轉 90° 的角平分）
var TOWNS = { on: Q.get('towns') !== '0', list: [], pend: [], ver: 0, want: 0, err: null, kit: null, kitP: null, prog: null, dirty: true, eye: null, sig: '', buf: [], grp: null,
  stat: { towns: 0, lots: 0, inst: 0, walls: 0, corners: 0, snapped: 0, skip: {}, d0: 0, d1: 0, d2: 0, d3: 0, plinth: 0, tris: 0, binMs: 0, kitMs: 0, gradeMs: 0, chunks: 0, drawMs: 0 } };
var TOWN_J0 = [0, 0, 0, 0];                                             // 建築的 aJ（不斜接、不順坡、牆基不延）
var TOWN_USE_ALT = { commandant: ['house'], governor: ['townhall'] };   // 沒有那種模型 ⇒ 用哪一種代（BUILDING_SPEC §7：長官的屋子還沒做）
var TOWN_COL = { main: [0.56, 0.47, 0.34], street: [0.62, 0.58, 0.50], track: [0.50, 0.42, 0.30], plaza: [0.70, 0.66, 0.58], quay: [0.58, 0.56, 0.52], pier: [0.45, 0.33, 0.22], post: [0.30, 0.22, 0.15] };
evOn('bedChunk', function () { TOWNS.dirty = true; }, 0, true);

/** 字串 ⇒ [0, 1)（FNV-1a）：同用途好幾種變化照它挑。 */
function townHash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

// ── 收城（08_seabed.js：BSMAP.town、外面那一頁的 'towns'） ──
/** 海域有城（area.towns）⇒ 去要：檔案讀 maps/<海域>/towns.js、@host 跟外面那一頁要（townGot 收）。 */
function townWant() {
  if (!TOWNS.on || HEADLESS || !BED || !BED.A || !(BED.A.towns || []).length) return;
  TOWNS.want = BED.A.towns.length;
  if (BED.host) { BED.host.postMessage({ bsmap: 'need', what: 'towns' }, '*'); return; }
  TOWNS.pend = [];
  bedScript('maps/' + BED.A.id + '/towns.js').then(function () { var L = TOWNS.pend; TOWNS.pend = []; townGot(L); }, function (e) { TOWNS.err = e.message; console.warn('城鎮：' + e.message); });
}
/** 一批城鎮規劃到了 ⇒ 換成海域／世界座標、要重算整地與清樹的塊重發 'bedChunk'（地形網格、樹照新的重建）、遠景重抽。 */
function townGot(L, err) {
  if (err) { TOWNS.err = err; console.warn('城鎮：' + err); }
  if (!BED || !BED.A || !L || !L.length) return;
  var t0 = performance.now();
  L.forEach(function (p) { if (p && p.format === 'blocksail-town' && !TOWNS.list.some(function (T) { return T.id === p.id; })) TOWNS.list.push(townPrep(p)); });
  TOWNS.ver++; TOWNS.dirty = true; TOWNS.stat.towns = TOWNS.list.length;
  TOWNS.stat.prepMs = +(performance.now() - t0).toFixed(1);
  Object.keys(Object.assign({}, BED.ch, BED.cm)).forEach(function (k) { var C = bedShowC(k); if (C && townOver(C.cx, C.cy)) evEmit('bedChunk', C.cx, C.cy, C); });   // 畫著的那一份（原精度或外圈的中等塊）
  Object.keys(BEDFAR.g).forEach(function (k) {                          // 遠景塊：網格與樹冠殼是照舊的高度建的 ⇒ 丟掉、排回最前面重讀
    if (bedShowC(k)) return;
    var c = k.split('_').map(Number); if (!townOver(c[0], c[1])) return;
    var g = BEDFAR.g[k]; gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.vb); gl.deleteBuffer(g.ib); delete BEDFAR.g[k];
    if (TREES.far[k]) { var s = TREES.far[k]; if (s.vao) { gl.deleteVertexArray(s.vao); gl.deleteBuffer(s.vb); gl.deleteBuffer(s.ib); } delete TREES.far[k]; }
    if (BEDFAR.todo) BEDFAR.todo.unshift([c[0], c[1], 1]);
  });
}
/** 塊 (cx, cy) 跟哪一座城的外框疊到（海域座標）。 */
function townOver(cx, cy) {
  var S = BED.A.chunk, e0 = cx * S, s0 = cy * S;
  return TOWNS.list.some(function (T) { return T.box[0] < e0 + S && T.box[2] > e0 && T.box[1] < s0 + S && T.box[3] > s0; });
}
/** 規劃 ⇒ 一座城（海域座標的路、整地、清樹，世界座標的實例；模型的實例等 TOWN_KIT 解好才建 ⇒ townInst）。 */
function townPrep(p) {
  var ox = +p.ox || 0, oy = +p.oy || 0, kx = +p.kx || 1, D2R = Math.PI / 180, bank = +p.bank || 1.5;
  function E(q) { return [ox + kx * q[0], oy + q[1]]; }
  var box = [1e9, 1e9, -1e9, -1e9];
  function grow(q, r) { box[0] = Math.min(box[0], q[0] - r); box[1] = Math.min(box[1], q[1] - r); box[2] = Math.max(box[2], q[0] + r); box[3] = Math.max(box[3], q[1] + r); }
  var roads = (p.roads || []).map(function (r) {
    var P = r.path.map(E); if (r.closed) P = P.concat([P[0]]);
    var z = (r.z || []).slice(); if (r.closed) z.push(z[0]);
    P.forEach(function (q) { grow(q, r.w / 2 + 4 + TOWN_GRADE_REACH); });
    return { id: r.id, kind: r.kind, w: r.w, P: P, z: z };
  });
  var grade = (p.grade || []).map(function (g) { var R = g.ring.map(E); R.forEach(function (q) { grow(q, TOWN_LOT_PAD + 6); }); return { h: g.h, R: R }; });
  var clr = { rings: ((p.clear || {}).rings || []).map(function (r) { return r.map(E); }),
              paths: ((p.clear || {}).paths || []).map(function (c) { var P = c.path.map(E); return { w: c.w, P: c.closed ? P.concat([P[0]]) : P }; }) };
  clr.rings.forEach(function (R) { R.forEach(function (q) { grow(q, 4); }); });
  clr.paths.forEach(function (c) { c.P.forEach(function (q) { grow(q, c.w); }); });
  (p.lots || []).forEach(function (l) { grow(E(l.at), Math.hypot(l.w, l.d)); });
  (p.piers || []).forEach(function (q) { q.path.forEach(function (a) { grow(E(a), q.w); }); });
  var core = p.core && p.core.ring ? p.core.ring.map(E) : null, cen = [ox, oy];
  if (core) { var sx = 0, sy = 0; core.forEach(function (q) { sx += q[0]; sy += q[1]; }); cen = [sx / core.length, sy / core.length]; }
  return { id: p.id, name: p.name, tier: p.tier, style: p.style, seed: p.seed, p: p, ox: ox, oy: oy, kx: kx, bank: bank, E: E, box: box, roads: roads, grade: grade, clr: clr, cen: cen, D2R: D2R, inst: null, ground: null, shell: null };
}

// ── 整地與清樹（每塊照 TOWNS.ver 算一次；C.h 換過（大漩渦重烤）也重算） ──
/** 給畫面的高度（Int16 分米，同 C.h 的排法）：有城疊到 ⇒ 整過地的那一份（C.hv），沒有 ⇒ C.h 本身。順手算清樹的遮罩（C.tc）。 */
function townHv(C) {
  if (!TOWNS.list.length || !BED || !BED.A) return C.h;
  if (C.tv === TOWNS.ver && C.tvh === C.h) return C.hv || C.h;
  C.tv = TOWNS.ver; C.tvh = C.h; C.hv = null; C.tc = null;
  if (!townOver(C.cx, C.cy)) return C.h;
  var t0 = performance.now(), A = BED.A, S = A.chunk, st = C.step, n = C.n, e0 = C.cx * S, s0 = C.cy * S, h0 = C.h, N = n * n, g = new Float32Array(N), i, j, o;
  for (o = 0; o < N; o++) g[o] = h0[o] / 10;
  function range(a, b, pad, lo) { return [Math.max(0, Math.ceil((a - pad - lo) / st)), Math.min(n - 1, Math.floor((b + pad - lo) / st))]; }
  function clampTo(o2, h, dd, bank) { if (h0[o2] <= 0) return; var lim = dd / bank; if (g[o2] > h + lim) g[o2] = h + lim; else if (g[o2] < h - lim) g[o2] = h - lim; }
  TOWNS.list.forEach(function (T) {
    if (!(T.box[0] < e0 + S && T.box[2] > e0 && T.box[1] < s0 + S && T.box[3] > s0)) return;
    T.roads.forEach(function (r) {                                      // 路：整平到路面（z），路寬一半 ＋ 一個取樣點內
      var pad = r.w / 2 + st, R = pad + TOWN_GRADE_REACH;
      for (var q = 1; q < r.P.length; q++) {
        var a = r.P[q - 1], b = r.P[q], za = r.z[q - 1], zb = r.z[q]; if (za == null || zb == null) continue;
        var ri = range(Math.min(a[0], b[0]), Math.max(a[0], b[0]), R, e0), rj = range(Math.min(a[1], b[1]), Math.max(a[1], b[1]), R, s0);
        var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) {
          var px = e0 + i * st - a[0], py = s0 + j * st - a[1], u = Math.max(0, Math.min(1, (px * dx + py * dy) / L2)), d = Math.hypot(px - u * dx, py - u * dy);
          if (d > R) continue;
          clampTo(j * n + i, za + (zb - za) * u, Math.max(0, d - pad), T.bank);
        }
      }
    });
    T.grade.forEach(function (gr) {                                     // 地塊：整平到 h（外擴 TOWN_LOT_PAD），外面照邊坡接
      var R = gr.R, xs = R.map(function (q) { return q[0]; }), ys = R.map(function (q) { return q[1]; }), reach = TOWN_LOT_PAD + 4 * T.bank;
      var ri = range(Math.min.apply(null, xs), Math.max.apply(null, xs), reach, e0), rj = range(Math.min.apply(null, ys), Math.max.apply(null, ys), reach, s0);
      for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) {
        var x = e0 + i * st, y = s0 + j * st, d = townPip(x, y, R) ? 0 : townPolyDist(x, y, R);
        if (d > reach) continue;
        clampTo(j * n + i, gr.h, Math.max(0, d - TOWN_LOT_PAD), T.bank);
      }
    });
  });
  var hv = new Int16Array(N), ch = 0;
  for (o = 0; o < N; o++) { hv[o] = Math.max(-32768, Math.min(32767, Math.round(g[o] * 10))); if (hv[o] !== h0[o]) ch++; }
  C.hv = ch ? hv : null;
  C.tc = townClrMask(C);
  TOWNS.stat.gradeMs += performance.now() - t0; TOWNS.stat.chunks++;
  return C.hv || C.h;
}
/** 清樹的遮罩：塊裡每 TOWN_CLR_G 公尺一格（格心）落在 clear 的圈或路帶裡 ⇒ 1；整塊都沒有 ⇒ null。 */
function townClrMask(C) {
  var A = BED.A, S = A.chunk, G = TOWN_CLR_G, M = Math.round(S / G), e0 = C.cx * S, s0 = C.cy * S, out = null, i, j;
  function rng(a, b, pad, lo) { return [Math.max(0, Math.floor((a - pad - lo) / G)), Math.min(M - 1, Math.ceil((b + pad - lo) / G))]; }
  function mark(i2, j2) { if (!out) out = new Uint8Array(M * M); out[j2 * M + i2] = 1; }
  TOWNS.list.forEach(function (T) {
    if (!(T.box[0] < e0 + S && T.box[2] > e0 && T.box[1] < s0 + S && T.box[3] > s0)) return;
    T.clr.rings.forEach(function (R) {
      var xs = R.map(function (q) { return q[0]; }), ys = R.map(function (q) { return q[1]; }), ri = rng(Math.min.apply(null, xs), Math.max.apply(null, xs), 0, e0), rj = rng(Math.min.apply(null, ys), Math.max.apply(null, ys), 0, s0);
      for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) if (townPip(e0 + (i + 0.5) * G, s0 + (j + 0.5) * G, R)) mark(i, j);
    });
    T.clr.paths.forEach(function (c) {
      var hw = c.w / 2;
      for (var q = 1; q < c.P.length; q++) {
        var a = c.P[q - 1], b = c.P[q], ri = rng(Math.min(a[0], b[0]), Math.max(a[0], b[0]), hw, e0), rj = rng(Math.min(a[1], b[1]), Math.max(a[1], b[1]), hw, s0);
        for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) if (townSegDist(e0 + (i + 0.5) * G, s0 + (j + 0.5) * G, a, b) <= hw) mark(i, j);
      }
    });
  });
  return out;
}
/** 63_trees.js 擺樹：塊裡 (x, z) 公尺（塊的原點起算）要不要清掉。 */
function townClr(C, x, z) {
  townHv(C); var M = C.tc; if (!M) return false;
  var G = TOWN_CLR_G, m = Math.round(BED.A.chunk / G), i = Math.min(m - 1, Math.max(0, Math.floor(x / G))), j = Math.min(m - 1, Math.max(0, Math.floor(z / G)));
  return M[j * m + i] === 1;
}
/** 63_bed_gl.js：這一塊有城 ⇒ 在用的那幾圈每 4 m 一點（地塊 8 × 12 m，8 m 一點會把整平的台子抹掉）。 */
function townFine(C) { return townHv(C) !== C.h || !!C.tc; }
function townPip(x, y, R) { var c = false; for (var i = 0, j = R.length - 1; i < R.length; j = i++) { var a = R[i], b = R[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function townSegDist(x, y, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, u = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0; return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy); }
function townPolyDist(x, y, R) { var m = Infinity; for (var i = 0, j = R.length - 1; i < R.length; j = i++) m = Math.min(m, townSegDist(x, y, R[j], R[i])); return m; }
/** 世界 (x, z) 的畫面高度（整過地的那一份；那一塊沒載 ⇒ NaN）—— 城牆、石基、棧橋的腳照它放。 */
function townGround(x, z) {
  var q = bedCell(x, z); if (!q) return NaN;
  var C = q.C, h = townHv(C), n = C.n, i = Math.min(n - 2, Math.floor(q.u)), j = Math.min(n - 2, Math.floor(q.v)), fu = q.u - i, fv = q.v - j, o = j * n + i;
  return ((h[o] * (1 - fu) + h[o + 1] * fu) * (1 - fv) + (h[o + n] * (1 - fu) + h[o + n + 1] * fu) * fv) / 10;
}

// ── 模型（TOWN_KIT：src/townmodels.py 匯入時算好）⇒ GPU ──
/** 解一份格子（townmodels.py pack_chunks：deflate-raw 的 區塊數 u32、(cx, cy, cz) u16 × n、4096 × n）⇒ 一份網格（全部區塊的四邊形接在一起）。 */
function townMesh(b64, size) {
  return VK.inflateRaw(VK.b64ToBytes(b64)).then(function (raw) {
    var dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), n = dv.getUint32(0, true), p = 4 + n * 6, ch = [];
    for (var i = 0; i < n; i++) ch.push({ cx: dv.getUint16(4 + i * 6, true), cy: dv.getUint16(6 + i * 6, true), cz: dv.getUint16(8 + i * 6, true), data: raw.subarray(p + i * 4096, p + (i + 1) * 4096) });
    var g = VK.Grid.fromModel({ header: { size: size, voxels: 0 }, chunks: ch }), parts = [], len = 0;
    ch.forEach(function (c) { var m = VK.meshChunk(g, c.cx, c.cy, c.cz); if (m) { parts.push(m); len += m.length; } });
    var all = new Uint16Array(len), o = 0; parts.forEach(function (m) { all.set(m, o); o += m.length; });
    var r = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), nq: len / 16 };
    QIDX.ensure(r.nq);                                                  // 先加長（ensure 會解開現在綁的 VAO）
    gl.bindVertexArray(r.vao); gl.bindBuffer(gl.ARRAY_BUFFER, r.vbo); gl.bufferData(gl.ARRAY_BUFFER, all, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribIPointer(0, 4, gl.UNSIGNED_SHORT, 8, 0);
    gl.enableVertexAttribArray(4); gl.vertexAttribDivisor(4, 1); gl.enableVertexAttribArray(5); gl.vertexAttribDivisor(5, 1); gl.enableVertexAttribArray(6); gl.vertexAttribDivisor(6, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, QIDX.buf); gl.bindVertexArray(null);
    return r;
  });
}
/** TOWN_KIT 全部解好（近、中各一份網格；貼圖集）⇒ TOWNS.kit。第一次要畫才做（非同步；好了才建實例）。 */
function townKit() {
  if (TOWNS.kitP) return TOWNS.kitP;
  var t0 = performance.now(), K = TOWN_KIT, names = Object.keys(K.models).sort(), M = {};
  TOWNS.kitP = Promise.all(names.map(function (nm, mi) {
    var m = K.models[nm];
    return Promise.all([townMesh(m.g, m.size), townMesh(m.lo.g, m.lo.size)]).then(function (L) {
      M[nm] = { nm: nm, i: mi, m: m, lod: L, uc0: [m.mpv, m.size[0] * m.mpv / 2, m.size[1] * m.mpv / 2], uc1: [m.mpv * m.lo.f, m.size[0] * m.mpv / 2, m.size[1] * m.mpv / 2] };
    });
  })).then(function () {
    return new Promise(function (ok) {
      var im = new Image();
      im.onload = function () {
        var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.bindTexture(gl.TEXTURE_2D, null);
        ok(tex);
      };
      im.onerror = function () { ok(null); };
      im.src = 'data:image/png;base64,' + K.atlas.png;
    });
  }).then(function (tex) {
    var byUse = {};
    names.forEach(function (nm) { var m = K.models[nm], k = m.use !== 'wall' ? m.use : (m.set || 'wall' + m.tier) + '-' + m.part; (byUse[k] = byUse[k] || []).push(nm); });   // 城牆：'<套>-<型>'（同型好幾種 ⇒ 名字排序）
    TOWNS.kit = { M: M, names: names, byUse: byUse, tex: tex, aw: K.atlas.w, ah: K.atlas.h, views: K.views };
    TOWNS.stat.kitMs = +(performance.now() - t0).toFixed(1);
    TOWNS.stat.kitTris = names.reduce(function (o, nm) { o[nm] = [M[nm].lod[0].nq * 2, M[nm].lod[1].nq * 2]; return o; }, {});
    TOWNS.list.forEach(function (T) { T.inst = null; }); TOWNS.dirty = true;
  }, function (e) { TOWNS.err = '模型解不開：' + e.message; console.warn('城鎮：' + TOWNS.err); });
  return TOWNS.kitP;
}

// ── 實例（一座城建一次：建築、城牆、石基；屋頂殼、地面的帶子） ──
/** 城 T 的實例：[{ k: 模型名, x, y, z, th（模型 +x 在平面上 ＝ (sinθ, −cosθ)）, sx（沿 x 縮放）, sh（深淺）, r（外框半徑）, pl: 石基 [w, d] 或 null, foot: 屋頂殼用的佔地 m² }]；y 是 NaN ⇒ 等那一塊載進來（townGround）。 */
function townInst(T) {
  var K = TOWNS.kit, p = T.p, out = [], D2R = Math.PI / 180, skip = TOWNS.stat.skip;
  function W(q) { var e = T.E(q); return [e[0] - BED.ax, e[1] - BED.az]; }
  (p.lots || []).forEach(function (l) {
    if (l.use === 'plot' || l.use === 'plaza') return;
    var L = l.model && K.M[l.model] ? [l.model] : K.byUse[l.use] || (TOWN_USE_ALT[l.use] || []).map(function (u) { return K.byUse[u]; }).filter(Boolean)[0];   // 地塊點名了模型（例：加拉塔塔）⇒ 用它；套件裡沒有 ⇒ 照用途挑
    if (!L || !L.length) { skip[l.use] = (skip[l.use] || 0) + 1; return; }
    var nm = L[Math.floor(townHash(T.id + ':' + l.id) * L.length)], m = K.M[nm].m, th = l.rot * D2R, md = m.size[1] * m.mpv, mw = m.size[0] * m.mpv;
    var off = (l.d - md) / 2, c = W([l.at[0] + off * Math.cos(th), l.at[1] + off * Math.sin(th)]);
    out.push({ k: nm, x: c[0], y: l.h, z: c[1], th: th, sx: 1, sh: 0.92 + 0.16 * townHash(l.id + '#'), r: Math.hypot(mw, md) / 2 + 2, top: m.top, pl: [mw, md], foot: mw * md * m.cover, col: m.roof, lot: l.id });
  });
  (p.walls || []).forEach(function (w) { townWall(T, w, out, W); });
  TOWNS.stat.inst = TOWNS.list.reduce(function (s, T2) { return s + (T2 === T ? out.length : (T2.inst || []).length); }, 0);
  TOWNS.stat.lots = TOWNS.list.reduce(function (s, T2) { return s + (T2.p.lots || []).length; }, 0);
  return out;
}
/** 一條城牆 ⇒ 門、塔、轉角、收尾照位置，中間的斷面沿路線接成一條斜接的折線（照 w.kit 挑那一套；BUILDING_SPEC §6）。
 *  t ＝ 從起點沿路線量的長度（閉合的牆繞回來）；部件佔掉 [t0, t1]，兩頭的接口 p0、p1 ＝ 中心 ∓ 半長·軸（軸 ＝ 路線上兩個接口那兩點的弦 ⇒ 擺在頂點上就是角平分）。 */
function townWall(T, w, out, W) {
  var K = TOWNS.kit, P = [], closed = !!w.closed;
  w.path.map(W).forEach(function (q) { var l = P[P.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.01) P.push(q); });   // 重複的點拿掉（頂點轉幾度才量得準）
  if (closed && P.length > 2 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) <= 0.01) P.pop();
  if (P.length < 2) return; if (P.length < 3) closed = false; if (closed) P = P.concat([P[0]]);
  var cum = [0]; for (var i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  var Ltot = cum[cum.length - 1], nV = P.length - 1; if (Ltot < 1) return;   // 頂點 0…nV（閉合 ⇒ nV 跟 0 是同一點）
  var cen = [T.cen[0] - BED.ax, T.cen[1] - BED.az];
  function at(t) { t = closed ? ((t % Ltot) + Ltot) % Ltot : Math.max(0, Math.min(Ltot, t)); for (var q = 1; q < P.length; q++) if (t <= cum[q] || q === P.length - 1) { var L = cum[q] - cum[q - 1] || 1, u = (t - cum[q - 1]) / L; return { x: P[q - 1][0] + (P[q][0] - P[q - 1][0]) * u, z: P[q - 1][1] + (P[q][1] - P[q - 1][1]) * u, a: Math.atan2(P[q][1] - P[q - 1][1], P[q][0] - P[q - 1][0]) }; } return { x: P[0][0], z: P[0][1], a: 0 }; }
  function proj(q) { var best = 0, bd = Infinity; for (var s = 1; s < P.length; s++) { var a = P[s - 1], b = P[s], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)), d = Math.hypot(q[0] - a[0] - u * dx, q[1] - a[1] - u * dy); if (d < bd) { bd = d; best = cum[s - 1] + u * Math.sqrt(L2); } } return best; }
  function dir(s) { var dx = P[s][0] - P[s - 1][0], dz = P[s][1] - P[s - 1][1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }   // 第 s 段（P[s−1] → P[s]）的方向
  function turn(v) { var a = dir(v === 0 ? nV : v), b = dir(v + 1); return Math.atan2(Math.abs(a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1]); }   // 頂點 v（閉合 0…nV−1、開放 1…nV−1）轉了幾度（弧度）
  function put(nm, c, a, sx, outward, sh) {
    var m = K.M[nm].m, hw = m.size[0] * m.mpv * sx / 2, hd = m.size[1] * m.mpv / 2;
    if (outward && -Math.sin(a) * (c[0] - cen[0]) + Math.cos(a) * (c[1] - cen[1]) < 0) a += Math.PI;
    var q = { k: nm, x: c[0], y: NaN, z: c[1], th: a + Math.PI / 2, sx: sx, sh: sh || 0.95 + 0.1 * townHash(w.id + ':' + out.length), r: Math.hypot(hw, hd) + 2, top: m.top, pl: null, foot: 4 * hw * hd * m.cover, col: m.roof, wall: w.id,
              mj: [0, 0, 0, 0], ft: [hw, hd] };                          // mj ＝ 著色器的 aJ（−x、+x 那一頭的斜接、坡度、牆基往下延；後兩個 townWallY 填）、ft ＝ 半長、半厚
    out.push(q); TOWNS.stat.walls++; return q;
  }
  function half(nm) { var m = K.M[nm].m, pa = m.pts['wall-a'], pb = m.pts['wall-b']; return pa && pb ? (pb[0] - pa[0] + 1) * m.mpv / 2 : m.size[0] * m.mpv / 2; }
  var kit = w.kit || 'wall1';
  if (!K.byUse[kit + '-section']) { TOWNS.stat.skip['wall:' + kit] = (TOWNS.stat.skip['wall:' + kit] || 0) + 1; kit = 'wall1'; }
  var gate = (K.byUse[kit + '-gate'] || [])[0], towers = K.byUse[kit + '-tower'] || [], sect = (K.byUse[kit + '-section'] || [])[0], end = (K.byUse[kit + '-end'] || [])[0], joint = (K.byUse[kit + '-joint'] || [])[0];
  if (!sect) return;
  var mS = K.M[sect].m, len = mS.len || 2, mW = mS.size[0] * mS.mpv, shW = 0.95 + 0.1 * townHash(w.id), obs = [];   // 斷面一條牆同一個深淺（一節一個 ⇒ 每 len 公尺一條色差）
  var parts = [];                                                       // 門、塔、轉角：{ nm, t（中心）, h（半長）, tower }
  (w.gates || []).forEach(function (g) { if (gate) parts.push({ nm: gate, t: proj(W(g.at)), h: half(gate) }); });
  (w.towers || []).forEach(function (q, i) { if (towers.length) { var nm = towers[i % towers.length]; parts.push({ nm: nm, t: proj(W(q)), h: half(nm), tower: true }); } });
  var cor = joint || towers[0], gap = Math.max(2 * len, 6);
  function apart(a0, a1, b0, b1) { var d = Infinity; (closed ? [0, Ltot, -Ltot] : [0]).forEach(function (sh) { d = Math.min(d, Math.max(0, b0 + sh - a1, a0 - b1 - sh)); }); return d; }   // 沿牆隔多遠（閉合 ⇒ 繞回來那一邊也算）
  function free(p, t, h) { return parts.every(function (o) { return o === p || apart(t - h, t + h, o.t - o.h, o.t + o.h) >= 0.5; }); }
  if (cor) {                                                            // 轉角（轉得急的頂點）：已經有部件跨在上面 ⇒ 不動；gap 內有塔 ⇒ 塔挪到轉角上；都沒有 ⇒ 擺一件（同世紀帝國轉角的塔）
    var hc = half(cor);
    for (var v = closed ? 0 : 1; v < nV; v++) {
      var tv = cum[v]; if (turn(v) < TOWN_WALL_CORNER * Math.PI / 180) continue;
      if (parts.some(function (o) { return apart(tv, tv, o.t - o.h, o.t + o.h) === 0; })) continue;
      var near = parts.filter(function (o) { return o.tower && apart(tv, tv, o.t - o.h, o.t + o.h) < gap + hc; }).sort(function (a, b) { return apart(tv, tv, a.t, a.t) - apart(tv, tv, b.t, b.t); })[0];
      if (near && free(near, tv, near.h) && (closed || (tv - near.h > 0 && tv + near.h < Ltot))) { near.t = tv; TOWNS.stat.snapped++; continue; }
      if (!closed && (tv - hc < gap || tv + hc > Ltot - gap)) continue;   // 開放的牆兩頭有收尾
      if (!parts.every(function (o) { return apart(tv - hc, tv + hc, o.t - o.h, o.t + o.h) >= (near ? 0.5 : gap); })) continue;
      parts.push({ nm: cor, t: tv, h: hc }); TOWNS.stat.corners++;
    }
  }
  parts.forEach(function (o) {                                          // 擺：軸 ＝ 路線上兩個接口那兩點的弦
    var t = o.t, h = o.h, A = at(t - h), B = at(t + h), s = at(t), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ax = L > 0.01 ? [dx / L, dz / L] : [Math.cos(s.a), Math.sin(s.a)];
    put(o.nm, [s.x, s.z], Math.atan2(ax[1], ax[0]), 1, true);
    obs.push({ t0: t - h, t1: t + h, p0: [s.x - ax[0] * h, s.z - ax[1] * h], p1: [s.x + ax[0] * h, s.z + ax[1] * h], ax: ax });
  });
  if (!closed && end) {                                                 // 收尾：模型的 wall-a（−x 那一面）接牆身 ⇒ 起點那一頭朝外轉 180°
    var mE = K.M[end].m, lE = mE.size[0] * mE.mpv / 2, s0 = at(0), s1 = at(Ltot);
    put(end, [s0.x - Math.cos(s0.a) * lE, s0.z - Math.sin(s0.a) * lE], s0.a + Math.PI, 1, false);
    put(end, [s1.x + Math.cos(s1.a) * lE, s1.z + Math.sin(s1.a) * lE], s1.a, 1, false);
  }
  // 部件之間的空檔 ⇒ 一段一段（s0、s1 ＝ 兩頭的接口與端面的法線；閉合又沒有部件 ⇒ 整圈一段，起點那一站跟最後一節斜接）
  obs.sort(function (a, b) { return a.t0 - b.t0; });
  var runs = [], tip = closed ? null : { t: 0, p: P[0], n: dir(1) };
  if (closed && obs.length) { var oL = obs.reduce(function (m, o) { return o.t1 > m.t1 ? o : m; }); tip = { t: oL.t1 - Ltot, p: oL.p1, n: oL.ax }; }
  obs.forEach(function (o) { if (tip && o.t0 > tip.t) runs.push({ t0: tip.t, t1: o.t0, s0: tip, s1: { p: o.p0, n: o.ax } }); if (!tip || o.t1 > tip.t) tip = { t: o.t1, p: o.p1, n: o.ax }; });
  if (!closed && tip.t < Ltot) runs.push({ t0: tip.t, t1: Ltot, s0: tip, s1: { p: P[nV], n: dir(nV) } });
  if (closed && !obs.length) runs.push({ t0: 0, t1: Ltot, s0: null, s1: null });
  runs.forEach(function (f) {
    var L = f.t1 - f.t0; if (L < len * 0.4) return;
    var vs = [], br = [f.t0], S = [], X, D = [], N = [], j, k;
    for (var v2 = closed ? 0 : 1; v2 < nV; v2++) if (turn(v2) > 1e-3) (closed ? [0, Ltot, -Ltot] : [0]).forEach(function (sh) { var tv2 = cum[v2] + sh; if (tv2 > f.t0 && tv2 < f.t1) vs.push(tv2); });
    vs.sort(function (a, b) { return a - b; });
    vs.forEach(function (tv2) { if (tv2 - br[br.length - 1] >= len / 2 && f.t1 - tv2 >= len / 2) br.push(tv2); }); br.push(f.t1);   // 頂點一定是站（離上一站或尾巴不到半節的不算）
    for (j = 0; j + 1 < br.length; j++) { var n = Math.max(1, Math.round((br[j + 1] - br[j]) / len)); for (k = 0; k < n; k++) S.push(br[j] + k * (br[j + 1] - br[j]) / n); }
    S.push(f.t1);
    X = S.map(function (t, i2) { if (i2 === 0 && f.s0) return f.s0.p; if (i2 === S.length - 1 && f.s1) return f.s1.p; var s = at(t); return [s.x, s.z]; });
    for (k = 0; k + 1 < X.length; k++) { var dx = X[k + 1][0] - X[k][0], dz = X[k + 1][1] - X[k][1], l = Math.hypot(dx, dz) || 1; D.push([dx / l, dz / l]); }
    for (j = 0; j < X.length; j++) {                                  // 每一站的端面法線：兩節的角平分（接口照部件的軸）
      if (j === 0) N.push(f.s0 ? f.s0.n : [D[D.length - 1][0] + D[0][0], D[D.length - 1][1] + D[0][1]]);
      else if (j === X.length - 1) N.push(f.s1 ? f.s1.n : N[0]);
      else N.push([D[j - 1][0] + D[j][0], D[j - 1][1] + D[j][1]]);
    }
    for (k = 0; k + 1 < X.length; k++) {
      var A = X[k], B = X[k + 1], ch = Math.hypot(B[0] - A[0], B[1] - A[1]); if (ch < 0.05) continue;
      var q = put(sect, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], Math.atan2(B[1] - A[1], B[0] - A[0]), ch / mW, true, shW);
      var s = Math.sin(q.th), c = Math.cos(q.th), fl = s * (B[0] - A[0]) - c * (B[1] - A[1]) < 0;   // 翻了面（−y 朝外）⇒ 模型 +x 朝 A
      var kA = townMiter(fl ? N[k + 1] : N[k], s, c), kB = townMiter(fl ? N[k] : N[k + 1], s, c), d = kB - kA, lim = 0.7 * ch / q.ft[1];
      if (Math.abs(d) > lim) {                                          // 內外兩面最短留 3 成（轉太急又沒擺轉角 ⇒ 寧可留縫、不翻面）：先動接部件的那一頭（部件擋著），兩頭都接斷面 ⇒ 一起縮
        var oA = fl ? k + 1 === X.length - 1 && f.s1 : k === 0 && f.s0, oB = fl ? k === 0 && f.s0 : k + 1 === X.length - 1 && f.s1, ex = (Math.abs(d) - lim) * (d > 0 ? 1 : -1);
        if (oA && !oB) kA += ex; else if (oB && !oA) kB -= ex; else { kA *= lim / Math.abs(d); kB *= lim / Math.abs(d); }
      }
      q.mj[0] = kA; q.mj[1] = kB; q.ja = fl ? B : A; q.jb = fl ? A : B;
    }
  });
}
/** 斜接：模型（轉 θ：+x ＝ (sinθ, −cosθ)、+y ＝ (−cosθ, −sinθ)）那一頭的端面要落在法線 n 的鉛直面上 ⇒ 橫過 1 m 沿 x 挪多少（著色器 a ＋＝ b·k）。 */
function townMiter(n, s, c) {
  var nx = s * n[0] - c * n[1], ny = -c * n[0] - s * n[1];
  return Math.abs(nx) < 1e-3 ? 0 : Math.max(-TOWN_WALL_KMAX, Math.min(TOWN_WALL_KMAX, -ny / nx));
}
/** 城牆的實例那一塊載進來了 ⇒ 高度：斷面照兩頭的站（地面；水上照海面 0）線性接 ⇒ 坡度 g，別的部件照中心；牆基（模型 z 0 那一層）往下延到腳下最低的地面再 0.3 m。地面沒載 ⇒ false（下次分組再試）。 */
function townWallY(q) {
  var s = Math.sin(q.th), c = Math.cos(q.th), hw = q.ft[0], hd = q.ft[1], y, g = 0, lo = 0;
  function gnd(p) { return Math.max(0, townGround(p[0], p[1])); }
  if (q.ja) { var ya = gnd(q.ja), yb = gnd(q.jb); y = (ya + yb) / 2; g = (yb - ya) / (2 * hw); } else y = gnd([q.x, q.z]);
  if (!(y === y) || !(g === g)) return false;
  [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]].forEach(function (o) {
    var a = o[0] * hw, b = o[1] * hd, gy = townGround(q.x + a * s - b * c, q.z - a * c - b * s); if (gy === gy) lo = Math.max(lo, y + g * a - gy);
  });
  q.y = y; q.mj[2] = g; q.mj[3] = Math.min(30, lo + 0.3); q.r += Math.abs(g) * hw + q.mj[3];
  return true;
}
/** 城 T 地面的帶子（路照 z、廣場、碼頭、棧橋）⇒ 一份網格（位置、法線、顏色）。 */
function townGroundMesh(T) {
  var V = [], I = [], p = T.p;
  function vtx(x, y, z, c, nx, ny, nz) { V.push(x, y, z, nx == null ? 0 : nx, ny == null ? 1 : ny, nz == null ? 0 : nz, c[0], c[1], c[2]); return V.length / 9 - 1; }
  function W(q) { var e = T.E(q); return [e[0] - BED.ax, e[1] - BED.az]; }
  T.roads.forEach(function (r) {                                        // 路：每 2 m 一段，兩側照路寬一半往外推
    var c = TOWN_COL[r.kind] || TOWN_COL.street, hw = r.w / 2, prev = null;
    for (var q = 1; q < r.P.length; q++) {
      var a = r.P[q - 1], b = r.P[q], za = r.z[q - 1], zb = r.z[q]; if (za == null || zb == null) { prev = null; continue; }
      var L = Math.hypot(b[0] - a[0], b[1] - a[1]), nS = Math.max(1, Math.ceil(L / 2)), tx = (b[0] - a[0]) / (L || 1), tz = (b[1] - a[1]) / (L || 1);
      for (var s = (prev ? 1 : 0); s <= nS; s++) {
        var u = s / nS, x = a[0] + (b[0] - a[0]) * u - BED.ax, z = a[1] + (b[1] - a[1]) * u - BED.az, y = za + (zb - za) * u + TOWN_ROAD_LIFT;
        var l = vtx(x - tz * hw, y, z + tx * hw, c), rr = vtx(x + tz * hw, y, z - tx * hw, c);
        if (prev) I.push(prev[0], l, prev[1], prev[1], l, rr);
        prev = [l, rr];
      }
    }
  });
  (p.lots || []).forEach(function (l) {                                 // 廣場：整平的那一塊鋪石
    if (l.use !== 'plaza') return;
    var th = l.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), y = l.h + 0.06, base = V.length / 9;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) { var dx = s[0] * l.d / 2, dy = s[1] * l.w / 2, c = W([l.at[0] + dx * cs - dy * sn, l.at[1] + dx * sn + dy * cs]); vtx(c[0], y, c[1], TOWN_COL.plaza); });
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  function slab(P0, w, top, bot, col) {                                 // 一條帶子拉成有厚度的板（碼頭、棧橋的面板）
    var P = P0.map(W);
    for (var q = 1; q < P.length; q++) {
      var a = P[q - 1], b = P[q], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L, hw = w / 2;
      var C4 = [[a[0] - tz * hw, a[1] + tx * hw], [b[0] - tz * hw, b[1] + tx * hw], [b[0] + tz * hw, b[1] - tx * hw], [a[0] + tz * hw, a[1] - tx * hw]], base = V.length / 9;
      C4.forEach(function (c) { vtx(c[0], top, c[1], col); }); I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      for (var e = 0; e < 4; e++) {                                     // 四個側面
        var c0 = C4[e], c1 = C4[(e + 1) % 4], nx = c1[1] - c0[1], nz = -(c1[0] - c0[0]), nl = Math.hypot(nx, nz) || 1, b2 = V.length / 9, dk = [col[0] * 0.78, col[1] * 0.78, col[2] * 0.78];
        vtx(c0[0], top, c0[1], dk, nx / nl, 0, nz / nl); vtx(c1[0], top, c1[1], dk, nx / nl, 0, nz / nl); vtx(c1[0], bot, c1[1], dk, nx / nl, 0, nz / nl); vtx(c0[0], bot, c0[1], dk, nx / nl, 0, nz / nl);
        I.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3);
      }
    }
  }
  (p.quay || []).forEach(function (q) { slab(q.path, q.w, 1.0, -2.5, TOWN_COL.quay); });
  (p.piers || []).forEach(function (q) {
    slab(q.path, q.w, 1.4, 1.0, TOWN_COL.pier);
    var P = q.path.map(W);                                              // 樁：每 4 m 一對
    for (var s = 1; s < P.length; s++) {
      var a = P[s - 1], b = P[s], L = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / (L || 1), tz = (b[1] - a[1]) / (L || 1);
      for (var t = 2; t < L; t += 4) [-1, 1].forEach(function (sd) {
        var cx = a[0] + tx * t - tz * sd * (q.w / 2 - 0.3), cz = a[1] + tz * t + tx * sd * (q.w / 2 - 0.3), r = 0.18, base = V.length / 9;
        [[-r, -r], [r, -r], [r, r], [-r, r]].forEach(function (o) { vtx(cx + o[0], 1.0, cz + o[1], TOWN_COL.post, o[0] / r, 0, o[1] / r); vtx(cx + o[0], -4, cz + o[1], TOWN_COL.post, o[0] / r, 0, o[1] / r); });
        for (var e = 0; e < 4; e++) { var i0 = base + e * 2, i1 = base + ((e + 1) % 4) * 2; I.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1); }
      });
    }
  });
  if (!I.length) return null;
  var bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (var k = 0; k < V.length; k += 9) { bb[0] = Math.min(bb[0], V[k]); bb[1] = Math.min(bb[1], V[k + 1]); bb[2] = Math.min(bb[2], V[k + 2]); bb[3] = Math.max(bb[3], V[k]); bb[4] = Math.max(bb[4], V[k + 1]); bb[5] = Math.max(bb[5], V[k + 2]); }
  return townGpu9(new Float32Array(V), new Uint32Array(I), bb);
}
/** 屋頂殼：每 TOWN_SHELL_G 公尺一格（照實例的中心）⇒ 屋頂高（佔地加權的平均頂）、顏色（屋頂色加權）、覆蓋（佔地 ÷ 格面積）；覆蓋 > 0.12 的格畫成一個平頂方塊（頂＋四面往下到地塊最低的 h − 3 m）。 */
function townShell(T) {
  var G = TOWN_SHELL_G, cells = {}, V = [], I = [];
  T.inst.forEach(function (q) {
    if (!(q.y === q.y)) return;
    var i = Math.floor(q.x / G), j = Math.floor(q.z / G), k = i + ',' + j, c = cells[k] || (cells[k] = { i: i, j: j, a: 0, top: 0, r: 0, g: 0, b: 0, lo: 1e9 });
    var f = q.foot; c.a += f; c.top += f * (q.y + q.top * 0.82); c.r += f * q.col[0]; c.g += f * q.col[1]; c.b += f * q.col[2]; c.lo = Math.min(c.lo, q.y - 3);
  });
  Object.keys(cells).sort().forEach(function (k) {
    var c = cells[k], cov = Math.min(1, c.a / (G * G)); if (cov < 0.12) return;
    var top = c.top / c.a, col = [c.r / c.a, c.g / c.a, c.b / c.a], m = (1 - Math.sqrt(cov)) * G / 2, x0 = c.i * G + m, x1 = (c.i + 1) * G - m, z0 = c.j * G + m, z1 = (c.j + 1) * G - m, base = V.length / 9;
    [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(function (q) { V.push(q[0], top, q[1], 0, 1, 0, col[0], col[1], col[2]); });
    I.push(base, base + 3, base + 2, base, base + 2, base + 1);
    var Q = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], NN = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (var e = 0; e < 4; e++) { var a = Q[e], b = Q[(e + 1) % 4], b2 = V.length / 9, d = 0.72; [[a, top], [b, top], [b, c.lo], [a, c.lo]].forEach(function (s) { V.push(s[0][0], s[1], s[0][1], NN[e][0], 0, NN[e][1], col[0] * d, col[1] * d, col[2] * d); }); I.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3); }
  });
  if (!I.length) return null;
  var bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (var k2 = 0; k2 < V.length; k2 += 9) { bb[0] = Math.min(bb[0], V[k2]); bb[1] = Math.min(bb[1], V[k2 + 1]); bb[2] = Math.min(bb[2], V[k2 + 2]); bb[3] = Math.max(bb[3], V[k2]); bb[4] = Math.max(bb[4], V[k2 + 1]); bb[5] = Math.max(bb[5], V[k2 + 2]); }
  return townGpu9(new Float32Array(V), new Uint32Array(I), bb);
}
function townGpu9(V, I, bb) {
  var g = { vao: gl.createVertexArray(), vb: gl.createBuffer(), ib: gl.createBuffer(), n: I.length, bb: bb };
  gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.bufferData(gl.ARRAY_BUFFER, V, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, I, gl.STATIC_DRAW); gl.bindVertexArray(null);
  return g;
}

// ── 著色器 ──
// 體素（近、中）：格座標 ⇒ 模型公尺（uC ＝ 一格幾公尺、模型中心 x、y）⇒ 地塊的轉向 ⇒ 世界；實例 aI ＝ (x, y, z, θ)、aS ＝ (沿 x 縮放, 深淺)、
//   aJ ＝ 城牆的 (−x 那一頭的斜接, +x 那一頭的斜接, 坡度, 牆基往下延)（建築都是 0）：沿 x 照 u 內插的 k ⇒ a ＋＝ b·k（切成梯形，相鄰兩節在角平分面上密合）、
//   高 ＋＝ 坡度·a（用斜接之前的 a ⇒ 端面上每一點的高度都是那一站的高度）、z 0 那一層的底往下延；法線照這個變形的餘因子矩陣轉。
var TOWN_VS = '#version 300 es\nlayout(location=0) in uvec4 aV; layout(location=4) in vec4 aI; layout(location=5) in vec2 aS; layout(location=6) in vec4 aJ; uniform mat4 uVP; uniform vec3 uC; uniform vec3 uEye;\n' +
  'out vec3 vL; out vec3 vW; out vec3 vN; flat out uint vC; flat out uint vF; out float vK; out float vD;\n' +
  'const vec3 NT[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));\n' +
  'void main(){ vec3 p=vec3(aV.xyz); vL=p; float s=sin(aI.w), c=cos(aI.w), a=(p.x*uC.x-uC.y)*aS.x, b=p.y*uC.x-uC.z;\n' +
  ' float u=p.x*uC.x/(2.0*uC.y), k=mix(aJ.x,aJ.y,u), A=1.0+b*(aJ.y-aJ.x)/(2.0*uC.y*aS.x), e=a+b*k;\n' +
  ' vec3 w=vec3(aI.x+e*s-b*c, aI.y+p.z*uC.x+aJ.z*a-(aV.z==0u?aJ.w:0.0), aI.z-e*c-b*s); uint f=aV.w&7u; vec3 m=NT[int(f)];\n' +
  ' m=vec3(m.x-aJ.z*m.z, A*m.y-k*m.x+k*aJ.z*m.z, A*m.z); vN=vec3(m.x*s-m.y*c, m.z, -m.x*c-m.y*s); vF=f; vC=(aV.w>>3u)&255u; vK=aS.y; vW=w; vD=length(aI.xz-uEye.xz); gl_Position=uVP*vec4(w,1.0); }\n';
// 交接：uIn ＝ 這一級從哪裡開始出現（抖動淡入）、uOut ＝ 到哪裡淡出 —— 同一個像素的門檻跟隔壁那一級共用 ⇒ 互補（照實例中心的距離 vD ⇒ 整棟一起換）
var TOWN_FADE = TREE_DITHER + 'uniform vec2 uIn, uOut; bool townCut(float d){ float di=treeDi(gl_FragCoord.xy); return smoothstep(uIn.x,uIn.y,d)<=di || smoothstep(uOut.x,uOut.y,d)>di; }\n';
var TOWN_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + TOWN_FADE + 'in vec3 vL; in vec3 vW; in vec3 vN; flat in uint vC; flat in uint vF; in float vK; in float vD; uniform vec3 uSun,uEye,uFog,uSky,uGround; uniform float uFogD, uEdge; out vec4 o;\n' +
    'const vec3 NT[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));\n' +
    'float h3(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }\n' +
    'void main(){ if(vW.y<uClip) discard; if(townCut(vD)) discard; vec3 n=normalize(vN), nl=NT[int(vF)];\n' +
    ' vec3 base=vec3(float((vC>>5u)&7u)/7.0, float((vC>>2u)&7u)/7.0, float(vC&3u)/3.0); base*=0.92+0.16*h3(floor(vL-nl*0.5));\n' +
    ' vec3 f=fract(vL), e=min(f,1.0-f); float ed=min(e.x,e.y); if(vF<2u){ ed=min(e.y,e.z); } else if(vF<4u){ ed=min(e.x,e.z); }\n' +
    ' base*=mix(1.0-0.18*uEdge,1.0,smoothstep(0.0,0.09,ed));\n' +
    ' float sd=dot(n,uSun), d=max(sd,0.0); float sk=shadowK(vW,n*1.5); vec3 col=base*vK*(mix(uGround,uSky,n.y*0.5+0.5)*0.62+vec3(1.0,0.96,0.88)*d*sk*0.78);\n' +
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
// 貼圖（遠）：實例 aI ＝ (中心 x, 地塊 h, 中心 z, —)、aR ＝ (右手方向 x, z, 寬, 高)（照取的那一張的視線）、aU ＝ (u0, v0, u 寬, v 高)；四邊形 aQ ∈ [−½, ½] × [0, 1]
var TOWN_BB_VS = '#version 300 es\nlayout(location=0) in vec2 aQ; layout(location=4) in vec4 aI; layout(location=5) in vec4 aR; layout(location=6) in vec4 aU; uniform mat4 uVP; uniform vec3 uEye; out vec2 vT; out vec3 vW; out float vK; out float vD;\n' +
  'void main(){ vec3 w=aI.xyz+vec3(aR.x,0.0,aR.y)*aQ.x*aR.z+vec3(0.0,aQ.y*aR.w,0.0); vW=w; vK=aI.w; vD=length(aI.xz-uEye.xz); vT=vec2(aU.x+(aQ.x+0.5)*aU.z, aU.y+(1.0-aQ.y)*aU.w); gl_Position=uVP*vec4(w,1.0); }\n';
var TOWN_BB_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + TOWN_FADE + 'uniform sampler2D uTex; uniform vec3 uEye,uFog; uniform float uFogD,uSunK,uClip; in vec2 vT; in vec3 vW; in float vK; in float vD; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; if(townCut(vD)) discard; vec4 t=texture(uTex,vT); if(t.a<0.5) discard; vec3 col=t.rgb*vK*(0.62+0.38*uSunK);\n' +
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
// 石基：單位方塊（aP ∈ [−½, ½]³）⇒ 實例 aI ＝ (x, 頂 y, z, θ)、aS ＝ (寬, 深, 高, 深淺)
var TOWN_PL_VS = '#version 300 es\nlayout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=4) in vec4 aI; layout(location=5) in vec4 aS; uniform mat4 uVP; out vec3 vN; out vec3 vW; out float vK;\n' +
  'void main(){ float s=sin(aI.w), c=cos(aI.w), a=aP.x*aS.x, b=aP.y*aS.y; vec3 w=vec3(aI.x+a*s-b*c, aI.y+(aP.z-0.5)*aS.z, aI.z-a*c-b*s);\n' +
  ' vN=vec3(aN.x*s-aN.y*c, aN.z, -aN.x*c-aN.y*s); vW=w; vK=aS.w; gl_Position=uVP*vec4(w,1.0); }\n';
var TOWN_PL_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + 'in vec3 vN; in vec3 vW; in float vK; uniform vec3 uSun,uEye,uFog,uSky,uGround,uCol; uniform float uFogD; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; vec3 n=normalize(vN); float d=max(dot(n,uSun),0.0), sk=shadowK(vW,n*1.5); vec3 col=uCol*vK*(0.85+0.15*fract(sin(dot(floor(vW*vec3(2.5,3.3,2.5)),vec3(12.9898,78.233,37.719)))*43758.5453))*(mix(uGround,uSky,n.y*0.5+0.5)*0.62+vec3(1.0,0.96,0.88)*d*sk*0.78);\n' +
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
// 地面的帶子、屋頂殼：位置、法線、顏色（屋頂殼帶交接的抖動）
var TOWN_GR_VS = '#version 300 es\nlayout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC; uniform mat4 uVP; out vec3 vN; out vec3 vW; out vec3 vC; void main(){ vN=aN; vW=aP; vC=aC; gl_Position=uVP*vec4(aP,1.0); }\n';
var TOWN_GR_FS = function (fade) {
  return '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + (fade ? TOWN_FADE : '') + 'in vec3 vN; in vec3 vW; in vec3 vC; uniform vec3 uSun,uEye,uFog,uSky,uGround; uniform float uFogD; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; ' + (fade ? 'if(townCut(length(vW.xz-uEye.xz))) discard; ' : '') + 'vec3 n=normalize(vN); float d=max(dot(n,uSun),0.0), sk=' + (fade ? '1.0' : 'shadowK(vW,n*1.5)') + ';\n' +
    ' vec3 col=vC*(0.9+0.2*fract(sin(dot(floor(vW.xz*1.3),vec2(12.9898,78.233)))*43758.5453))*(mix(uGround,uSky,n.y*0.5+0.5)*0.65+vec3(1.0,0.96,0.88)*d*sk*0.7);\n' +
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
function townProgs() {
  if (TOWNS.prog) return TOWNS.prog;
  var P = { vox: VK.compile(gl, TOWN_VS, TOWN_FS()), bb: VK.compile(gl, TOWN_BB_VS, TOWN_BB_FS()), pl: VK.compile(gl, TOWN_PL_VS, TOWN_PL_FS()), gr: VK.compile(gl, TOWN_GR_VS, TOWN_GR_FS(false)), sh: VK.compile(gl, TOWN_GR_VS, TOWN_GR_FS(true)) };
  P.ib = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];   // 近、中、貼圖、石基的實例（每次分組重寫）
  P.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1]), gl.STATIC_DRAW);
  P.bbVao = gl.createVertexArray(); gl.bindVertexArray(P.bbVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[2]); [4, 5, 6].forEach(function (a, q) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 48, q * 16); });
  // 石基的方塊：六面 × 兩個三角形（位置、法線）
  var V = [], F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  F.forEach(function (n) {
    var u = n[0] ? [0, 1, 0] : [1, 0, 0], v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]].forEach(function (s) { for (var k = 0; k < 3; k++) V.push(n[k] * 0.5 + u[k] * s[0] * 0.5 + v[k] * s[1] * 0.5); V.push(n[0], n[1], n[2]); });
  });
  P.cube = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, P.cube); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  P.plVao = gl.createVertexArray(); gl.bindVertexArray(P.plVao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[3]); [4, 5].forEach(function (a, q) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 32, q * 16); });
  gl.bindVertexArray(null);
  TOWNS.prog = P; return P;
}

// ── 分組與畫 ──
/** 看得到的實例照離鏡頭（水平）多遠分到近、中、貼圖（交接帶兩邊都放）；石基跟著近、中。寫進四個實例緩衝區。 */
function townBin(PL, eye) {
  var t0 = performance.now(), K = TOWNS.kit, NM = K.names.length, cnt = [new Int32Array(NM), new Int32Array(NM)], L0 = TOWN_LOD[0], L1 = TOWN_LOD[1], B0 = TOWN_BAND[0], B1 = TOWN_BAND[1], B2 = TOWN_BAND[2], vis = [], nbb = 0, npl = 0;
  TOWNS.list.forEach(function (T) {
    if (!T.inst) return;
    T.inst.forEach(function (q) {
      if (!(q.y === q.y)) { if (!townWallY(q)) return; T.shDirty = true; }   // 城牆：等那一塊載進來
      var dx = q.x - eye[0], dz = q.z - eye[2], d = Math.sqrt(dx * dx + dz * dz); if (d > TOWN_FAR[1] + 50) return;
      var cy = q.y + q.top / 2, r = q.r + q.top / 2;
      for (var i = 0; i < 6; i++) { var p = PL[i]; if (p[0] * q.x + p[1] * cy + p[2] * q.z + p[3] < -r) return; }
      var mi = K.M[q.k].i, on0 = d < L0 + B0, on1 = d > L0 - B0 && d < L1 + B1, on2 = d > L1 - B1;
      if (on0) cnt[0][mi]++; if (on1) cnt[1][mi]++; if (on2) nbb++;
      if ((on0 || on1) && q.pl) { if (!q.pb) q.pb = townPlinth(q); if (q.pb) npl++; }
      vis.push(q, d, on0, on1, on2);
    });
  });
  var off = [new Int32Array(NM), new Int32Array(NM)], tot = [0, 0];
  for (var l = 0; l < 2; l++) for (var m = 0; m < NM; m++) { off[l][m] = tot[l]; tot[l] += cnt[l][m]; }
  function buf(l, need) { if (!TOWNS.buf[l] || TOWNS.buf[l].length < need) TOWNS.buf[l] = new Float32Array(Math.max(need, 16) * 1.5 | 0); return TOWNS.buf[l]; }
  var D0 = buf(0, tot[0] * 10), D1 = buf(1, tot[1] * 10), D2 = buf(2, nbb * 12), D3 = buf(3, npl * 8), at = [off[0].slice(), off[1].slice()], kb = 0, kp = 0, V8 = K.views;
  for (var v = 0; v < vis.length; v += 5) {
    var q = vis[v], Mq = K.M[q.k], mi2 = Mq.i;
    [0, 1].forEach(function (l2) { if (!vis[v + 2 + l2]) return; var o = at[l2][mi2]++ * 10, D = l2 ? D1 : D0, J = q.mj || TOWN_J0; D[o] = q.x; D[o + 1] = q.y; D[o + 2] = q.z; D[o + 3] = q.th; D[o + 4] = q.sx; D[o + 5] = q.sh; D[o + 6] = J[0]; D[o + 7] = J[1]; D[o + 8] = J[2]; D[o + 9] = J[3]; });
    if (vis[v + 4]) {                                                   // 貼圖：取最接近視線的那一張（模型座標裡鏡頭的方向 φ ⇒ 第 round(φ ÷ 45°) 張）
      var m2 = Mq.m, s = Math.sin(q.th), c = Math.cos(q.th), ex = eye[0] - q.x, ez = eye[2] - q.z, vx = ex * s - ez * c, vy = -ex * c - ez * s;
      var k = ((Math.round(Math.atan2(vy, vx) / (2 * Math.PI / V8)) % V8) + V8) % V8, ph = k * 2 * Math.PI / V8, rmx = -Math.sin(ph), rmy = Math.cos(ph), o2 = kb++ * 12;
      var cx = q.x, cz = q.z;                                           // 模型中心（城牆的斷面沿 x 縮放 ⇒ 貼圖寬也跟著）
      D2[o2] = cx; D2[o2 + 1] = q.y; D2[o2 + 2] = cz; D2[o2 + 3] = q.sh;
      D2[o2 + 4] = rmx * s - rmy * c; D2[o2 + 5] = -rmx * c - rmy * s; D2[o2 + 6] = m2.im.w * q.sx; D2[o2 + 7] = m2.im.h;
      D2[o2 + 8] = (m2.im.x + k * m2.im.cw) / K.aw; D2[o2 + 9] = m2.im.y / K.ah; D2[o2 + 10] = m2.im.cw / K.aw; D2[o2 + 11] = m2.im.ch / K.ah;
    }
    if ((vis[v + 2] || vis[v + 3]) && q.pb) { var o3 = kp++ * 8, P3 = q.pb; D3[o3] = q.x; D3[o3 + 1] = P3[0]; D3[o3 + 2] = q.z; D3[o3 + 3] = q.th; D3[o3 + 4] = q.pl[0] - 0.04; D3[o3 + 5] = q.pl[1] - 0.04; D3[o3 + 6] = P3[1]; D3[o3 + 7] = q.sh; }
  }
  var P = TOWNS.prog;
  [[D0, tot[0] * 10], [D1, tot[1] * 10], [D2, nbb * 12], [D3, npl * 8]].forEach(function (a, i2) { gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[i2]); gl.bufferData(gl.ARRAY_BUFFER, a[0].subarray(0, Math.max(16, a[1])), gl.DYNAMIC_DRAW); });
  TOWNS.grp = { cnt: cnt, off: off, nbb: nbb, npl: npl };
  var S = TOWNS.stat; S.d0 = tot[0]; S.d1 = tot[1]; S.d2 = nbb; S.plinth = npl; S.binMs = +(performance.now() - t0).toFixed(2);
}
/** 石基：地塊頂（h，略低 1 cm 不跟一樓的底面打架）往下到四角與中心最低的地面再 0.3 m；地面沒載 ⇒ null（下次分組再試）。 */
function townPlinth(q) {
  var s = Math.sin(q.th), c = Math.cos(q.th), w = q.pl[0] / 2, d = q.pl[1] / 2, lo = Infinity;
  [[0, 0], [-w, -d], [w, -d], [w, d], [-w, d]].forEach(function (o) { var gy = townGround(q.x + o[0] * s - o[1] * c, q.z - o[0] * c - o[1] * s); lo = Math.min(lo, gy); });
  if (!(lo === lo) || lo === Infinity) return null;
  var top = q.y - 0.01, hgt = Math.max(0.3, top - lo + 0.3);
  return [top, hgt];
}
/** 畫（60_render.js：樹之後）。 */
function townDraw() {
  if (!TOWNS.on || !TOWNS.list.length || !BED || !BED.A || PASS.vp) return;
  if (!TOWNS.kit) { townKit(); return; }
  var t0 = performance.now(), K = TOWNS.kit, P = townProgs(), eye = CAM.eye, PL = bedPlanes(CAM.vp);
  TOWNS.list.forEach(function (T) {
    if (!T.inst) { T.inst = townInst(T); T.ground = townGroundMesh(T); T.shDirty = true; TOWNS.dirty = true; }
  });
  var E = TOWNS.eye;
  if (TOWNS.dirty || !E || Math.abs(E[0] - eye[0]) + Math.abs(E[1] - eye[1]) + Math.abs(E[2] - eye[2]) > TOWN_REBIN) { townBin(PL, eye); TOWNS.eye = eye.slice(); TOWNS.dirty = false; }
  TOWNS.list.forEach(function (T) { if (T.shDirty) { if (T.shell) { gl.deleteVertexArray(T.shell.vao); gl.deleteBuffer(T.shell.vb); gl.deleteBuffer(T.shell.ib); } T.shell = townShell(T); T.shDirty = false; } });
  var cf = gl.isEnabled(gl.CULL_FACE); gl.disable(gl.CULL_FACE);
  var fogD = WX.fog * BED_FOG * CAM.fogK, G = TOWNS.grp, L0 = TOWN_LOD[0], L1 = TOWN_LOD[1], B = TOWN_BAND, tris = 0;
  // 近、中：一種模型一次（照實例）
  var PV = P.vox; gl.useProgram(PV.prog); setCommon(PV); gl.uniform1f(PV.u.uFogD, fogD); gl.uniform3fv(PV.u.uEye, eye);
  for (var l = 0; l < 2; l++) {
    gl.uniform1f(PV.u.uEdge, l ? 0 : 1);
    if (l) { gl.uniform2f(PV.u.uIn, L0 - B[0], L0 + B[0]); gl.uniform2f(PV.u.uOut, L1 - B[1], L1 + B[1]); } else { gl.uniform2f(PV.u.uIn, -2, -1); gl.uniform2f(PV.u.uOut, L0 - B[0], L0 + B[0]); }
    K.names.forEach(function (nm, mi) {
      var n = G.cnt[l][mi]; if (!n) return; var Mm = K.M[nm], g = Mm.lod[l];
      gl.uniform3fv(PV.u.uC, l ? Mm.uc1 : Mm.uc0);
      gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[l]);
      gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 40, G.off[l][mi] * 40); gl.vertexAttribPointer(5, 2, gl.FLOAT, false, 40, G.off[l][mi] * 40 + 16); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 40, G.off[l][mi] * 40 + 24);
      gl.drawElementsInstanced(gl.TRIANGLES, g.nq * 6, gl.UNSIGNED_INT, 0, n); tris += g.nq * 2 * n;
    });
  }
  // 石基
  if (G.npl) {
    var PP = P.pl; gl.useProgram(PP.prog); setCommon(PP); gl.uniform1f(PP.u.uFogD, fogD); gl.uniform3f(PP.u.uCol, 0.62, 0.58, 0.50);
    gl.bindVertexArray(P.plVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, G.npl); tris += 12 * G.npl;
  }
  // 貼圖
  if (G.nbb && K.tex) {
    var PB = P.bb; gl.useProgram(PB.prog); setCommon(PB); gl.uniform1f(PB.u.uFogD, fogD); gl.uniform3fv(PB.u.uEye, eye);
    gl.uniform2f(PB.u.uIn, L1 - B[1], L1 + B[1]); gl.uniform2f(PB.u.uOut, TOWN_FAR[0], TOWN_FAR[1]);
    gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D, K.tex); gl.uniform1i(PB.u.uTex, 11); gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(P.bbVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, G.nbb); tris += 2 * G.nbb;
  }
  // 地面的帶子（貼地、往鏡頭推一點 ⇒ 不跟地形打架）
  var PG = P.gr; gl.useProgram(PG.prog); setCommon(PG); gl.uniform1f(PG.u.uFogD, fogD);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -4);
  TOWNS.list.forEach(function (T) { var g = T.ground; if (!g || !bedSeen(PL, g.bb) || townBoxDist(g.bb, eye) > TOWN_GROUND_VIEW) return; gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_INT, 0); tris += g.n / 3; });
  gl.disable(gl.POLYGON_OFFSET_FILL);
  // 屋頂殼（最遠一級：跟貼圖用同一個抖動互補）
  var PS = P.sh; gl.useProgram(PS.prog); setCommon(PS); gl.uniform1f(PS.u.uFogD, fogD); gl.uniform2f(PS.u.uIn, TOWN_FAR[0], TOWN_FAR[1]); gl.uniform2f(PS.u.uOut, 1e8, 2e8);
  var ns = 0;
  TOWNS.list.forEach(function (T) { var g = T.shell; if (!g || !bedSeen(PL, g.bb) || townBoxFar(g.bb, eye) < TOWN_FAR[0]) return; ns++; gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_INT, 0); tris += g.n / 3; });
  gl.bindVertexArray(null); if (cf) gl.enable(gl.CULL_FACE);
  TOWNS.stat.d3 = ns; TOWNS.stat.tris = tris; TOWNS.stat.drawMs = +(performance.now() - t0).toFixed(2);
}
function townBoxDist(b, e) { var dx = Math.max(b[0] - e[0], 0, e[0] - b[3]), dz = Math.max(b[2] - e[2], 0, e[2] - b[5]); return Math.sqrt(dx * dx + dz * dz); }
function townBoxFar(b, e) { var dx = Math.max(Math.abs(b[0] - e[0]), Math.abs(b[3] - e[0])), dz = Math.max(Math.abs(b[2] - e[2]), Math.abs(b[5] - e[2])); return Math.sqrt(dx * dx + dz * dz); }
/** 讀數（__game.town()）：幾座城、每座的雜湊與實例數、這一格畫了幾個（近、中、貼圖、殼）、三角形、毫秒；at ＝ [x, z] ⇒ 那一點的畫面高度、清不清樹。 */
function townStat(at) {
  var S = TOWNS.stat, o = { on: TOWNS.on, want: TOWNS.want, err: TOWNS.err, towns: TOWNS.list.map(function (T) {
    var u = {}; (T.inst || []).forEach(function (q) { u[q.k] = (u[q.k] || 0) + 1; });
    return { id: T.id, name: T.name, tier: T.tier, seed: T.seed, ox: T.ox, oy: T.oy, lots: (T.p.lots || []).length, roads: T.roads.length, walls: (T.p.walls || []).length, inst: (T.inst || []).length, byModel: u, center: [+(T.ox - BED.ax).toFixed(1), +(T.oy - BED.az).toFixed(1)] };
  }), kit: !!TOWNS.kit, kitMs: S.kitMs, kitTris: S.kitTris, skip: S.skip, drawn: { full: S.d0, low: S.d1, card: S.d2, shells: S.d3, plinth: S.plinth }, tris: S.tris, ms: { draw: S.drawMs, bin: S.binMs, grade: +S.gradeMs.toFixed(1), prep: S.prepMs }, gradedChunks: S.chunks };
  if (at) { var q = bedCell(at[0], at[1]); o.at = { ground: +townGround(at[0], at[1]).toFixed(2), sim: +bedHgt(at[0], at[1]).toFixed(2), clear: q ? townClr(q.C, q.u * q.C.step, q.v * q.C.step) : null }; }
  return o;
}

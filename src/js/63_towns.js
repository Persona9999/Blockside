// ───────────────────────── 城鎮（TASK-0740；只給人看） ─────────────────────────
// Blocksail 的城鎮規劃（格式 Blocksail docs/TOWN_BUILD.md §5、src/MAP_CHUNK.md §8）⇒ 整地、清樹、擺建築與城牆、路著色。第一版只給人看（Tim 2026-10-19 第 10 節第 5 題：
//   砲彈穿過去、船穿過去、不改戰局）⇒ ⛔ 不碰 C.h（模擬查的那一份）：整地只寫進給畫面的 C.hv（地形網格、樹照它），船、擱淺、砲彈打地面照舊讀 C.h
//   ⇒ 城鎮什麼時候到（檔案、外面那一頁生成要好幾秒）都跟戰局無關；無頭（?demo&headless）整段不做。?towns=0 ⇒ 不載城。
// 來源：area.towns（有城的 id 清單）⇒ 檔案 maps/<海域>/towns.js（BSMAP.town，一座一筆）或 ?map=@host 跟外面那一頁要（{ bsmap: 'need', what: 'towns' } ⇒ { bsmap: 'towns', towns }）。
//   規劃的座標以市中心為原點（往東 x、往南 y，公尺）；海域座標 ＝ (ox ＋ kx·x, oy ＋ y)（匯出時算好，Blocksail world/town_export.js）。
// 整地（townHv；每塊海圖塊第一次要畫的時候算、城到了再重算）：路（照 z，路寬一半 ＋ 一個取樣點內整平）先、地塊的 grade（照 h，外擴 TOWN_LOT_PAD）後，
//   外面照邊坡 1 : bank 接回原地形（|高差| ≤ 距離 ÷ bank，路最多接 TOWN_GRADE_REACH 公尺）；只改陸上的點（原本 ≤ 0 的不動 ⇒ 岸線不變）。
// 清樹（townClr）：規劃的 clear（有建築的地塊、路、城牆、碼頭各外擴 2 m；空建地不清）每 TOWN_CLR_G 公尺一格的遮罩 ⇒ 63_trees.js 擺樹時跳過。
// 建築（模型 63_towndata.js TOWN_KIT，src/townmodels.py 匯入時算好近、中、遠三份＋屋頂殼的資料）：照用途挑（同用途的變化照 地塊 id 的雜湊挑 ⇒ 每次一樣；特殊建築的用途就是那一種 ⇒ 只有它的模型挑得到，例：galata-tower）。
//   模型 → 世界（BUILDING_SPEC §1）：a ＝ mx·mpv − 模型寬/2、b ＝ my·mpv − 模型深/2、θ ＝ lot.rot ⇒ 往東 ＝ cx ＋ a·sinθ − b·cosθ、往南 ＝ cy − a·cosθ − b·sinθ、高 ＝ h ＋ mz·mpv；
//   模型比地塊小（金斯敦的地塊照 Lilly 的棋盤）⇒ 臨路那一邊對齊、沿路置中：cx,cy ＝ at ＋ (d − 模型深)/2 ·(cosθ, sinθ)。底下墊一塊石基（townPlinth：到四角最低的地面再下 0.3 m）。
//   城牆（TOWN_BUILD §4）：照牆的 kit 挑一套模組（wall1～wall3 ＝ 一～三級、roman-land-inner／roman-land-outer／roman-sea ＝ 東羅馬城牆 1453；BUILDING_SPEC §6、§6.1）；
//   沒寫 kit ⇒ 一級（等級之後照規模 × 繁榮度換）、寫了但沒有那一套 ⇒ 一級（stat.skip 記 'wall:<kit>'）。
//   門、塔照位置（一套有好幾型塔 ⇒ 照順序輪流：東羅馬外牆方塔、新月塔交替）、兩頭收尾，中間照斷面沿曲線一節一節拉（節數 round(L / len)、每節沿 x 縮放補滿），−y（牆外）朝離城心遠的那一邊。
// 遠近四級（照樹那一套；距離 TOWN_LOD、TOWN_FAR）：近 原模型、中 低模（0.4 m）、遠 貼圖（八個方向先拍好，取最接近視線的那一張）、更遠 屋頂殼（每 TOWN_SHELL_G 公尺一格的屋頂高與顏色）；
//   每一級的交接帶兩邊都畫、用同一個抖動互補（同一個像素只有一個）。看得到的實例照視錐剔、鏡頭動了 TOWN_REBIN 公尺才重新分組（townBin）。
// 布旗（模型帶 flags 的，例：加拉塔塔頂的熱那亞旗）：一塊布、照風飄，只給人看 ⇒ 見下面「布旗」那一段。
// 路（TOWN_BUILD 第 10 節第 7 題：地形上著色）：照路的 z 鋪一條貼地的帶子（土路、石板路的顏色）；廣場、碼頭、棧橋同一份網格。
var TOWN_LOD = [160, 800], TOWN_FAR = [2400, 3000], TOWN_BAND = [24, 60, 300], TOWN_REBIN = 8, TOWN_SHELL_G = 32, TOWN_GRADE_REACH = 12, TOWN_LOT_PAD = 2, TOWN_CLR_G = 2, TOWN_ROAD_LIFT = 0.12, TOWN_GROUND_VIEW = 1600;
var TOWNS = { on: Q.get('towns') !== '0', list: [], pend: [], ver: 0, want: 0, err: null, kit: null, kitP: null, prog: null, dirty: true, eye: null, sig: '', buf: [], grp: null,
  stat: { towns: 0, lots: 0, inst: 0, walls: 0, skip: {}, d0: 0, d1: 0, d2: 0, d3: 0, plinth: 0, tris: 0, binMs: 0, kitMs: 0, gradeMs: 0, chunks: 0, drawMs: 0 } };
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
  Object.keys(BEDFAR.g).forEach(function (k) {                          // 遠景塊：網格與樹冠殼是照舊的高度建的 ⇒ 丟掉、放回去重讀（63_bed_gl.js bedFarStep 照離旗艦遠近挑）
    if (bedShowC(k)) return;
    var c = k.split('_').map(Number); if (!townOver(c[0], c[1])) return;
    bedFarDrop(k);
    if (BEDFAR.todo) BEDFAR.todo.push([c[0], c[1], 1, 0]);
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
    gl.enableVertexAttribArray(4); gl.vertexAttribDivisor(4, 1); gl.enableVertexAttribArray(5); gl.vertexAttribDivisor(5, 1);
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
    var L = K.byUse[l.use] || (TOWN_USE_ALT[l.use] || []).map(function (u) { return K.byUse[u]; }).filter(Boolean)[0];
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
/** 一條城牆 ⇒ 門、塔、收尾照位置，中間斷面沿曲線拉（照 w.kit 挑那一套；BUILDING_SPEC §6）。 */
function townWall(T, w, out, W) {
  var K = TOWNS.kit, P = w.path.map(W); if (w.closed) P = P.concat([P[0]]);
  var cum = [0]; for (var i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  var Ltot = cum[cum.length - 1]; if (Ltot < 1) return;
  var cen = [T.cen[0] - BED.ax, T.cen[1] - BED.az];
  function at(t) { t = Math.max(0, Math.min(Ltot, t)); for (var q = 1; q < P.length; q++) if (t <= cum[q] || q === P.length - 1) { var L = cum[q] - cum[q - 1] || 1, u = (t - cum[q - 1]) / L; return { x: P[q - 1][0] + (P[q][0] - P[q - 1][0]) * u, z: P[q - 1][1] + (P[q][1] - P[q - 1][1]) * u, a: Math.atan2(P[q][1] - P[q - 1][1], P[q][0] - P[q - 1][0]) }; } return { x: P[0][0], z: P[0][1], a: 0 }; }
  function proj(q) { var best = 0, bd = Infinity; for (var s = 1; s < P.length; s++) { var a = P[s - 1], b = P[s], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)), d = Math.hypot(q[0] - a[0] - u * dx, q[1] - a[1] - u * dy); if (d < bd) { bd = d; best = cum[s - 1] + u * Math.sqrt(L2); } } return best; }
  function put(nm, s, a, sx, out2, outward) {
    var m = K.M[nm].m; if (outward) { var ox = -Math.sin(a), oz = Math.cos(a); if (ox * (s.x - cen[0]) + oz * (s.z - cen[1]) < 0) a += Math.PI; }
    out2.push({ k: nm, x: s.x, y: NaN, z: s.z, th: a + Math.PI / 2, sx: sx, sh: 0.95 + 0.1 * townHash(w.id + ':' + out2.length), r: Math.hypot(m.size[0] * m.mpv * sx, m.size[1] * m.mpv) / 2 + 2, top: m.top, pl: null, foot: m.size[0] * m.mpv * sx * m.size[1] * m.mpv * m.cover, col: m.roof, wall: w.id });
    TOWNS.stat.walls++;
  }
  function half(nm) { var m = K.M[nm].m, pa = m.pts['wall-a'], pb = m.pts['wall-b']; return pa && pb ? (pb[0] - pa[0] + 1) * m.mpv / 2 : m.size[0] * m.mpv / 2; }
  var kit = w.kit || 'wall1';
  if (!K.byUse[kit + '-section']) { TOWNS.stat.skip['wall:' + kit] = (TOWNS.stat.skip['wall:' + kit] || 0) + 1; kit = 'wall1'; }
  var gate = (K.byUse[kit + '-gate'] || [])[0], towers = K.byUse[kit + '-tower'] || [], sect = (K.byUse[kit + '-section'] || [])[0], end = (K.byUse[kit + '-end'] || [])[0];
  if (!sect) return;
  var obs = [];                                                         // 沿牆被部件佔掉的 [t0, t1]
  (w.gates || []).forEach(function (g) { if (!gate) return; var t = proj(W(g.at)), s = at(t); put(gate, { x: s.x, z: s.z }, s.a, 1, out, true); obs.push([t - half(gate), t + half(gate)]); });
  (w.towers || []).forEach(function (q, i) { if (!towers.length) return; var tower = towers[i % towers.length], t = proj(W(q)), s = at(t); put(tower, { x: s.x, z: s.z }, s.a, 1, out, true); obs.push([t - half(tower), t + half(tower)]); });
  if (!w.closed && end) {                                               // 收尾：模型的 wall-a（−x 那一面）接牆身 ⇒ 起點那一頭朝外轉 180°
    var mE = K.M[end].m, lE = mE.size[0] * mE.mpv / 2, s0 = at(0), s1 = at(Ltot);
    put(end, { x: s0.x - Math.cos(s0.a) * lE, z: s0.z - Math.sin(s0.a) * lE }, s0.a + Math.PI, 1, out, false);
    put(end, { x: s1.x + Math.cos(s1.a) * lE, z: s1.z + Math.sin(s1.a) * lE }, s1.a, 1, out, false);
  }
  obs.sort(function (a, b) { return a[0] - b[0]; });
  var free = [], t0 = 0; obs.forEach(function (o) { if (o[0] > t0) free.push([t0, o[0]]); t0 = Math.max(t0, o[1]); }); if (t0 < Ltot) free.push([t0, Ltot]);
  var len = K.M[sect].m.len || 2;
  free.forEach(function (f) {
    var L = f[1] - f[0]; if (L < len * 0.4) return;
    var nS = Math.max(1, Math.round(L / len)), sx = L / (nS * len);
    for (var k = 0; k < nS; k++) { var s = at(f[0] + (k + 0.5) * L / nS); put(sect, { x: s.x, z: s.z }, s.a, sx, out, true); }
  });
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

// ── 布旗（Tim 2026-10-20「旗幟可以改成布?(參考船隻)」；只給人看） ──
// 模型的 flags（src/townmodels.py flags_of：雕刻的帆裡 meta kind=flag 那幾面的四個角，模型格座標；BUILDING_SPEC §6.2）⇒ 每個實例每面一塊布：
//   TOWN_FLAG_N ＝ 沿飛 × 沿旗桿幾個質點；綁邊（第 0 欄）釘在旗桿上，其他照 Verlet：重力＋往風速拉的阻力（風向 ＝ WIND、風速 ＝ WIND_SAIL × 天氣，跟帆同一份）
//   ＋陣風、擺動（畫面時間的正弦、每面差一個相位 ⇒ 不抽亂數）＋ TOWN_FLAG_IT 次距離約束（橫、直、斜）。
//   ⛔ 不碰戰局：不讀寫模擬的狀態、不用模擬的亂數、砲彈打不到；鏡頭 TOWN_FLAG_SIM 公尺外不動（停在上一個樣子）、TOWN_LOD[1] 外不畫（貼圖那一級沒拍旗）。
//   畫：照圖案的分界再切格（十字的邊不會被內插糊掉）、一格一色；法線翻到朝鏡頭那一面（布兩面都看得到）；用地面帶子那一支著色器（P.gr）。
var TOWN_FLAG_N = [10, 6], TOWN_FLAG_IT = 6, TOWN_FLAG_SIM = 400, TOWN_FLAG_DT = 1 / 60, TOWN_FLAG_DRAG = 1.6, TOWN_FLAG_DAMP = 0.99;
var TOWN_FLAG_PAT = {                                                   // 圖案：u 沿飛（0 旗桿 → 1 尾）、v 沿旗桿（0 上 → 1 下）；cu、cv ＝ 色塊的分界
  genoa: { cu: [0.44, 0.56], cv: [0.4, 0.6], col: function (u, v) { return Math.abs(u - 0.5) < 0.06 || Math.abs(v - 0.5) < 0.1 ? COL_R : COL_W; } }   // 熱那亞：白底紅十字（聖喬治）
};
/** 城 T 的布旗（實例建好之後建一次）：[{ p, pp: 現在、上一步的質點（世界）, C: 約束 [a, b, 長] …, h: 綁邊的上下兩點, at: 中心, ph: 相位, pat }]。 */
function townFlags(T) {
  var K = TOWNS.kit, out = [], NU = TOWN_FLAG_N[0], NV = TOWN_FLAG_N[1];
  (T.inst || []).forEach(function (q) {
    var m = K.M[q.k].m; if (!m.flags || !(q.y === q.y)) return;
    var s = Math.sin(q.th), c = Math.cos(q.th), mpv = m.mpv, hw = m.size[0] * mpv / 2, hd = m.size[1] * mpv / 2;
    function W(v) { var a = (v[0] * mpv - hw) * q.sx, b = v[1] * mpv - hd; return [q.x + a * s - b * c, q.y + v[2] * mpv, q.z - a * c - b * s]; }   // 模型 → 世界（檔頭的公式）
    m.flags.forEach(function (f, fi) {
      var h0 = W(f.hoist[0]), h1 = W(f.hoist[1]), f0 = W(f.fly[0]), f1 = W(f.fly[1]), p = new Float32Array(NU * NV * 3), C = [];
      for (var i = 0; i < NU; i++) for (var j = 0; j < NV; j++) {
        var u = i / (NU - 1), v = j / (NV - 1), o = (i * NV + j) * 3;
        for (var k = 0; k < 3; k++) p[o + k] = (h0[k] * (1 - v) + h1[k] * v) * (1 - u) + (f0[k] * (1 - v) + f1[k] * v) * u;
      }
      function link(a, b) { C.push(a, b, Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2])); }
      for (var i2 = 0; i2 < NU; i2++) for (var j2 = 0; j2 < NV; j2++) {
        var a = i2 * NV + j2;
        if (i2 + 1 < NU) link(a, a + NV);
        if (j2 + 1 < NV) link(a, a + 1);
        if (i2 + 1 < NU && j2 + 1 < NV) { link(a, a + NV + 1); link(a + 1, a + NV); }
      }
      out.push({ p: p, pp: Float32Array.from(p), C: new Float32Array(C), h: [h0, h1], at: [(h0[0] + f1[0]) / 2, (h0[1] + f1[1]) / 2, (h0[2] + f1[2]) / 2],
                 ph: townHash((q.lot || q.k) + ':flag' + fi) * 6.2832, pat: TOWN_FLAG_PAT[f.pattern] || null, acc: 0, vao: null, vb: null, V: null, n: 0 });
    });
  });
  return out;
}
function townFlagFree(T) { (T.flags || []).forEach(function (F) { if (F.vao) { gl.deleteVertexArray(F.vao); gl.deleteBuffer(F.vb); } }); T.flags = null; }
/** 一步（dt 秒、t ＝ 畫面時間）：Verlet ⇒ 釘綁邊 ⇒ 約束（綁邊那一欄不動）。 */
function townFlagStep(F, dt, t) {
  var p = F.p, pp = F.pp, NU = TOWN_FLAG_N[0], NV = TOWN_FLAG_N[1], wl = Math.hypot(WIND[0], WIND[2]) || 1, wx = WIND[0] / wl, wz = WIND[2] / wl;
  var ws = WIND_SAIL * WX.wind * WIND_SPD * (1 + 0.25 * Math.sin(t * 1.3 + F.ph) + 0.1 * Math.sin(t * 3.7 + F.ph * 2)), kd = TOWN_FLAG_DRAG, dt2 = dt * dt;
  for (var i = 1; i < NU; i++) {
    var u = i / (NU - 1), lat = ws * 0.35 * u * Math.sin(t * 7.1 + F.ph - u * 5), up = ws * 0.12 * u * Math.sin(t * 5.3 + F.ph * 1.7 + u * 4);   // 擺動：越往尾越大、沿布往後傳
    for (var j = 0; j < NV; j++) {
      var o = (i * NV + j) * 3;
      for (var k = 0; k < 3; k++) {
        var x = p[o + k], vel = (x - pp[o + k]) / dt, wv = k === 0 ? wx * ws - wz * lat : k === 2 ? wz * ws + wx * lat : up;
        p[o + k] = x + (x - pp[o + k]) * TOWN_FLAG_DAMP + (kd * (wv - vel) - (k === 1 ? 9.8 : 0)) * dt2; pp[o + k] = x;
      }
    }
  }
  for (var j2 = 0; j2 < NV; j2++) { var v = j2 / (NV - 1), o2 = j2 * 3; for (var k2 = 0; k2 < 3; k2++) p[o2 + k2] = pp[o2 + k2] = F.h[0][k2] * (1 - v) + F.h[1][k2] * v; }
  var C = F.C;
  for (var it = 0; it < TOWN_FLAG_IT; it++) for (var c = 0; c < C.length; c += 3) {
    var a = C[c], b = C[c + 1], wa = a < NV ? 0 : 1, wb = b < NV ? 0 : 1; if (!(wa + wb)) continue;
    var A = a * 3, B = b * 3, dx = p[B] - p[A], dy = p[B + 1] - p[A + 1], dz = p[B + 2] - p[A + 2], L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, e = (L - C[c + 2]) / L / (wa + wb);
    p[A] += dx * e * wa; p[A + 1] += dy * e * wa; p[A + 2] += dz * e * wa; p[B] -= dx * e * wb; p[B + 1] -= dy * e * wb; p[B + 2] -= dz * e * wb;
  }
}
/** 布 ⇒ 三角形（位置、法線、顏色，36 bytes；跟地面帶子同一個佈局）寫進它自己的緩衝區；回傳三角形數。 */
function townFlagMesh(F, eye) {
  var p = F.p, NU = TOWN_FLAG_N[0], NV = TOWN_FLAG_N[1], N = new Float32Array(p.length);
  function P(i, j, k) { return p[(i * NV + j) * 3 + k]; }
  for (var i = 0; i < NU; i++) for (var j = 0; j < NV; j++) {          // 每個質點的法線：沿飛 × 沿旗桿（中央差分）
    var i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, NU - 1), j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, NV - 1), du = [], dv = [];
    for (var k = 0; k < 3; k++) { du.push(P(i1, j, k) - P(i0, j, k)); dv.push(P(i, j1, k) - P(i, j0, k)); }
    var n = norm([du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]]), o = (i * NV + j) * 3;
    N[o] = n[0]; N[o + 1] = n[1]; N[o + 2] = n[2];
  }
  function at(u, v, out, A) {                                           // (u, v) 的位置或法線（四個質點雙線性）
    var fi = u * (NU - 1), fj = v * (NV - 1), i = Math.min(Math.floor(fi), NU - 2), j = Math.min(Math.floor(fj), NV - 2), a = fi - i, b = fj - j;
    for (var k = 0; k < 3; k++) out[k] = (A[(i * NV + j) * 3 + k] * (1 - b) + A[(i * NV + j + 1) * 3 + k] * b) * (1 - a) + (A[((i + 1) * NV + j) * 3 + k] * (1 - b) + A[((i + 1) * NV + j + 1) * 3 + k] * b) * a;
    return out;
  }
  function cuts(n, extra) { var L = []; for (var q = 0; q < n; q++) L.push(q / (n - 1)); return L.concat(extra || []).sort(function (x, y) { return x - y; }); }
  var pat = F.pat, Us = cuts(NU, pat && pat.cu), Vs = cuts(NV, pat && pat.cv), nv = (Us.length - 1) * (Vs.length - 1) * 6;
  if (!F.V || F.V.length < nv * 9) F.V = new Float32Array(nv * 9);
  var V = F.V, w = 0, ps = [0, 0, 0], ns = [0, 0, 0];
  for (var a2 = 0; a2 + 1 < Us.length; a2++) for (var b2 = 0; b2 + 1 < Vs.length; b2++) {
    var u0 = Us[a2], u1 = Us[a2 + 1], v0 = Vs[b2], v1 = Vs[b2 + 1], col = pat ? pat.col((u0 + u1) / 2, (v0 + v1) / 2) : COL_W;
    [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]].forEach(function (c) {
      at(c[0], c[1], ps, p); at(c[0], c[1], ns, N);
      var fl = (eye[0] - ps[0]) * ns[0] + (eye[1] - ps[1]) * ns[1] + (eye[2] - ps[2]) * ns[2] < 0 ? -1 : 1;   // 背面朝鏡頭 ⇒ 法線翻過來
      V[w++] = ps[0]; V[w++] = ps[1]; V[w++] = ps[2]; V[w++] = ns[0] * fl; V[w++] = ns[1] * fl; V[w++] = ns[2] * fl; V[w++] = col[0]; V[w++] = col[1]; V[w++] = col[2];
    });
  }
  if (!F.vao) {
    F.vao = gl.createVertexArray(); F.vb = gl.createBuffer(); gl.bindVertexArray(F.vao); gl.bindBuffer(gl.ARRAY_BUFFER, F.vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  } else { gl.bindVertexArray(F.vao); gl.bindBuffer(gl.ARRAY_BUFFER, F.vb); }
  gl.bufferData(gl.ARRAY_BUFFER, V.subarray(0, w), gl.DYNAMIC_DRAW); F.n = w / 9;
  return F.n / 3;
}

// ── 著色器 ──
// 體素（近、中）：格座標 ⇒ 模型公尺（uC ＝ 一格幾公尺、模型中心 x、y）⇒ 地塊的轉向 ⇒ 世界；實例 aI ＝ (x, y, z, θ)、aS ＝ (沿 x 縮放, 深淺)
var TOWN_VS = '#version 300 es\nlayout(location=0) in uvec4 aV; layout(location=4) in vec4 aI; layout(location=5) in vec2 aS; uniform mat4 uVP; uniform vec3 uC; uniform vec3 uEye;\n' +
  'out vec3 vL; out vec3 vW; out vec3 vN; flat out uint vC; flat out uint vF; out float vK; out float vD;\n' +
  'const vec3 NT[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));\n' +
  'void main(){ vec3 p=vec3(aV.xyz); vL=p; float s=sin(aI.w), c=cos(aI.w), a=(p.x*uC.x-uC.y)*aS.x, b=p.y*uC.x-uC.z;\n' +
  ' vec3 w=vec3(aI.x+a*s-b*c, aI.y+p.z*uC.x, aI.z-a*c-b*s); uint f=aV.w&7u; vec3 m=NT[int(f)];\n' +
  ' vN=vec3(m.x*s-m.y*c, m.z, -m.x*c-m.y*s); vF=f; vC=(aV.w>>3u)&255u; vK=aS.y; vW=w; vD=length(aI.xz-uEye.xz); gl_Position=uVP*vec4(w,1.0); }\n';
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
      if (!(q.y === q.y)) { var gy = townGround(q.x, q.z); if (!(gy === gy)) return; q.y = gy; T.shDirty = true; }   // 城牆：等那一塊載進來
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
  var D0 = buf(0, tot[0] * 6), D1 = buf(1, tot[1] * 6), D2 = buf(2, nbb * 12), D3 = buf(3, npl * 8), at = [off[0].slice(), off[1].slice()], kb = 0, kp = 0, V8 = K.views;
  for (var v = 0; v < vis.length; v += 5) {
    var q = vis[v], Mq = K.M[q.k], mi2 = Mq.i;
    [0, 1].forEach(function (l2) { if (!vis[v + 2 + l2]) return; var o = at[l2][mi2]++ * 6, D = l2 ? D1 : D0; D[o] = q.x; D[o + 1] = q.y; D[o + 2] = q.z; D[o + 3] = q.th; D[o + 4] = q.sx; D[o + 5] = q.sh; });
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
  [[D0, tot[0] * 6], [D1, tot[1] * 6], [D2, nbb * 12], [D3, npl * 8]].forEach(function (a, i2) { gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[i2]); gl.bufferData(gl.ARRAY_BUFFER, a[0].subarray(0, Math.max(16, a[1])), gl.DYNAMIC_DRAW); });
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
    if (!T.inst) { T.inst = townInst(T); T.ground = townGroundMesh(T); townFlagFree(T); T.shDirty = true; TOWNS.dirty = true; }
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
      gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 24, G.off[l][mi] * 24); gl.vertexAttribPointer(5, 2, gl.FLOAT, false, 24, G.off[l][mi] * 24 + 16);
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
  // 布旗（同一支著色器；近、中那兩級的距離內才畫，鏡頭附近才動）
  var now = performance.now() / 1000, fdt = Math.min(0.1, Math.max(0, now - (TOWNS.flagT || now))), nfl = 0; TOWNS.flagT = now; TOWNS.flagClock = (TOWNS.flagClock || 0) + fdt;
  TOWNS.list.forEach(function (T) {
    if (!T.flags) T.flags = townFlags(T);
    T.flags.forEach(function (F) {
      var d = Math.hypot(F.at[0] - eye[0], F.at[2] - eye[2]); if (d > TOWN_LOD[1]) return;
      for (var i = 0; i < 6; i++) { var pl = PL[i]; if (pl[0] * F.at[0] + pl[1] * F.at[1] + pl[2] * F.at[2] + pl[3] < -6) return; }
      if (d < TOWN_FLAG_SIM) { F.acc += fdt; var ns2 = 0; while (F.acc >= TOWN_FLAG_DT && ns2 < 4) { townFlagStep(F, TOWN_FLAG_DT, TOWNS.flagClock); F.acc -= TOWN_FLAG_DT; ns2++; } if (ns2 === 4) F.acc = 0; }
      tris += townFlagMesh(F, eye); gl.drawArrays(gl.TRIANGLES, 0, F.n); nfl++;
    });
  });
  TOWNS.stat.flags = nfl;
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
  }), kit: !!TOWNS.kit, kitMs: S.kitMs, kitTris: S.kitTris, skip: S.skip, drawn: { full: S.d0, low: S.d1, card: S.d2, shells: S.d3, plinth: S.plinth, flags: S.flags || 0 }, tris: S.tris, ms: { draw: S.drawMs, bin: S.binMs, grade: +S.gradeMs.toFixed(1), prep: S.prepMs }, gradedChunks: S.chunks };
  if (at) { var q = bedCell(at[0], at[1]); o.at = { ground: +townGround(at[0], at[1]).toFixed(2), sim: +bedHgt(at[0], at[1]).toFixed(2), clear: q ? townClr(q.C, q.u * q.C.step, q.v * q.C.step) : null }; }
  return o;
}

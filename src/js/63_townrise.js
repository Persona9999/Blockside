// ───────────────────────── 建築的建造演出（TASK-0908；只給人看） ─────────────────────────
// Tim 2026-10-25：「可以嘗試給目前的建築加上建造演出（先做獨立功能 之後在串接上去）…演出過程中可以搭腳手架或其他裝飾（磚頭 木材等建材堆積 打地基等）」
//   一次演一棟：施工進度 p（0～1）⇒ 那一棟的格子只畫門檻 ≤ p 的那幾格（門檻 ＝ Blocksail tools/townrise.py 算好的 bo：照 g 的非空格順序一格一個位元組；
//   有雕刻的施工階段 meta 照 meta，沒有照自動算法）＋ 照 p 現算的施工裝飾（地基、腳手架、建材堆）。
//   畫法：四周留白（RISE_PAD 格；腳手架、建材堆放在那裡）的一份 VoxelKit 網格 ⇒ 只重新網格化這一步變過的區塊（Grid.cv）⇒ 城鎮那一支著色器畫一個實例；
//   uC 的半寬、半深加上留白 ⇒ 模型的格落在原本那一棟的位置（著色器見 63_towns.js TOWN_VS）。演的那一棟不進分組（townBin）⇒ 原本的格子、貼圖、石基、玻璃都不畫。
//   ⛔ 只給人看：不碰規劃、城鎮帳、整地；停下來（townRiseStop）就換回原本那一棟。
//   入口（獨立功能，還沒接施工進度與點建築的選單 TASK-0909）：網址 ?rise=1 ⇒ 左下角一塊小面板（選一棟、拉進度、播放）；
//   測試用 __game.townRise（90_main.js）。施工進度之後接 Blocksail 的營造（TASK-0891、0894）：townRiseSet(p) 就是那個接口。
var RISE = { T: null, lot: null, nm: null, d: null, p: 1, play: 0, t0: 0, dur: 24, G: null, occ: null, mesh: null, gpu: null, cv: null, deco: [], ver: 0, panel: null, picking: false, stat: {} };
var RISE_UI = Q.get('rise') === '1';                                  // 面板（見檔頭）
var RISE_PAD = 14, RISE_TOP = 16;                                      // 四周留白、頂上多留幾格（腳手架比蓋到的高出一截）
var RISE_C = { dirt: 104, dirt2: 68, stone: 145, stone2: 146, pole: 136, plank: 173, brick: 164, brick2: 201, sand: 213 };   // rgb332（63_towns.js 著色器照 vC 解）

/** 一份模型的區塊表（townmodels.py pack_chunks）⇒ Promise<{ keys: [[cx, cy, cz] …], data: [Uint8Array(4096) …] }>。 */
function townRiseChunks(b64) {
  return VK.inflateRaw(VK.b64ToBytes(b64)).then(function (raw) {
    var dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), n = dv.getUint32(0, true), p = 4 + n * 6, keys = [], data = [];
    for (var i = 0; i < n; i++) { keys.push([dv.getUint16(4 + i * 6, true), dv.getUint16(6 + i * 6, true), dv.getUint16(8 + i * 6, true)]); data.push(raw.subarray(p + i * 4096, p + (i + 1) * 4096)); }
    return { keys: keys, data: data };
  });
}

/** 模型 nm（townKitMake 留下的 rise：{ g, bo }）⇒ Promise<演出用的資料>：每一格（格座標、色、門檻）照門檻排好、腳下的佔地、每一步的最高格。 */
function townRiseLoad(nm) {
  var K = TOWNS.kit, Mm = K && K.M[nm];
  if (!Mm || !Mm.rise) return Promise.reject(new Error(nm + ' 沒有施工順序（Blocksail tools/townmodels.py build 之前的模型資料）'));
  if (Mm.riseD) return Promise.resolve(Mm.riseD);
  return Promise.all([townRiseChunks(Mm.rise.g), VK.inflateRaw(VK.b64ToBytes(Mm.rise.bo))]).then(function (A) {
    var G = A[0], B = A[1], m = Mm.m, sx = m.size[0], sy = m.size[1], sz = m.size[2];
    var n = 0; G.data.forEach(function (c) { for (var li = 0; li < 4096; li++) if (c[li]) n++; });
    if (B.length !== n) throw new Error(nm + '：施工順序 ' + B.length + ' 格 ≠ 格子 ' + n + ' 格');
    var X = new Uint16Array(n), Y = new Uint16Array(n), Z = new Uint16Array(n), C = new Uint8Array(n), O = new Uint8Array(n), cnt = new Int32Array(257), j = 0;
    G.data.forEach(function (c, i) {
      var k = G.keys[i];
      for (var li = 0; li < 4096; li++) if (c[li]) { X[j] = k[0] * 16 + (li & 15); Y[j] = k[1] * 16 + ((li >> 4) & 15); Z[j] = k[2] * 16 + (li >> 8); C[j] = c[li]; O[j] = B[j] || 255; cnt[O[j] + 1]++; j++; }
    });
    for (var v = 1; v < 257; v++) cnt[v] += cnt[v - 1];                  // 照門檻排（計數排序；同門檻照區塊表的順序）⇒ ord；at[v] ＝ 門檻 ≤ v 的有幾格
    var at = cnt.slice(1), pos = cnt.slice(0, 256), ord = new Int32Array(n);
    for (j = 0; j < n; j++) ord[pos[O[j]]++] = j;
    var top = new Uint16Array(n + 1), foot = new Uint8Array(sx * sy), fz = new Uint16Array(sx * sy).fill(65535);
    for (j = 0; j < n; j++) { var q = ord[j]; top[j + 1] = Math.max(top[j], Z[q] + 1); var f = X[q] + sx * Y[q]; foot[f] = 1; if (Z[q] < fz[f]) fz[f] = Z[q]; }
    Mm.riseD = { nm: nm, sx: sx, sy: sy, sz: sz, mpv: m.mpv, n: n, X: X, Y: Y, Z: Z, C: C, O: O, ord: ord, at: at, top: top, foot: foot, fz: fz };
    return Mm.riseD;
  });
}

/** 進度 p ⇒ 這一步看得到幾格（照門檻排好的前幾格）。 */
function townRiseCount(D, p) { var v = Math.max(0, Math.min(255, 1 + Math.round(Math.max(0, Math.min(1, p)) * 254))); return v < 1 ? 0 : D.at[v]; }

/** 開始演一棟：城 T 的地塊 lot（規劃的那一塊 id）、從進度 p 開始；play ＞ 0 ⇒ 用幾秒從 p 演到完工。⇒ Promise<讀數>。 */
function townRiseStart(T, lot, p, play) {
  var q = townRiseInst(T, lot); if (!q) return Promise.reject(new Error('城 ' + (T && T.id) + ' 沒有擺出地塊 ' + lot + ' 的建築'));
  townRiseStop();
  return townRiseLoad(q.k).then(function (D) {
    var sx = D.sx + RISE_PAD * 2, sy = D.sy + RISE_PAD * 2, sz = D.sz + RISE_TOP;
    RISE.T = T; RISE.lot = lot; RISE.nm = q.k; RISE.d = D; RISE.n = 0; RISE.deco = []; RISE.mesh = {}; RISE.dirtyAll = true;
    RISE.G = new VK.Grid([sx, sy, sz]); RISE.occ = new Uint8Array(sx * sy * sz); RISE.cv = new Uint32Array(RISE.G.tab.length);
    RISE.p = -1; townRiseSet(p == null ? 0 : p);
    RISE.play = play > 0 ? play : 0; RISE.t0 = performance.now(); RISE.p0 = RISE.p;
    TOWNS.dirty = true;                                                   // 重新分組 ⇒ 原本那一棟不畫（townBin）
    townRisePanelShow();
    return townRiseStat();
  });
}
/** 停下來：放掉 GPU、原本那一棟回來。 */
function townRiseStop() {
  if (RISE.gpu) { gl.deleteVertexArray(RISE.gpu.vao); gl.deleteBuffer(RISE.gpu.vbo); }
  var had = !!RISE.T;
  RISE.T = RISE.lot = RISE.nm = RISE.d = RISE.G = RISE.occ = RISE.gpu = null; RISE.mesh = null; RISE.deco = []; RISE.play = 0;
  if (had) TOWNS.dirty = true;
  townRisePanelShow();
}
/** 城 T 的地塊 lot 現在擺出來的那一棟（實例會因為換模型組重建 ⇒ 每次照地塊 id 找）。 */
function townRiseInst(T, lot) { if (!T || !T.inst) return null; for (var i = 0; i < T.inst.length; i++) if (T.inst[i].lot === lot) return T.inst[i]; return null; }
/** 分組時跳過演的那一棟（63_towns.js townBin）。 */
function townRiseHides(T, q) { return RISE.T === T && q.lot != null && q.lot === RISE.lot; }

/** 設進度（施工進度之後從這裡接：營造的完成度）：只改這一步跟上一步不一樣的格；網格化留到畫的時候。 */
function townRiseSet(p) {
  var D = RISE.d; if (!D) return;
  p = Math.max(0, Math.min(1, p)); if (p === RISE.p) return; RISE.p = p;
  var G = RISE.G, occ = RISE.occ, P = RISE_PAD, SX = G.sx, SY = G.sy, n1 = townRiseCount(D, p), j, q, x, y, z, k;
  for (j = RISE.n; j < n1; j++) { q = D.ord[j]; x = D.X[q] + P; y = D.Y[q] + P; z = D.Z[q]; G.set(x, y, z, D.C[q]); occ[x + SX * (y + SY * z)] = 1; }
  for (j = RISE.n - 1; j >= n1; j--) { q = D.ord[j]; x = D.X[q] + P; y = D.Y[q] + P; z = D.Z[q]; G.set(x, y, z, 0); occ[x + SX * (y + SY * z)] = 0; }
  RISE.n = n1;
  var old = RISE.deco, nu = townRiseDeco(D, p, n1), seen = new Set();   // 施工裝飾：這一步該有的 ⇒ 舊的拿掉（那一格沒被房子佔掉的）、新的補上（只放空格）
  for (j = 0; j < nu.length; j += 2) seen.add(nu[j]);
  for (j = 0; j < old.length; j += 2) { k = old[j]; if (!seen.has(k) && !occ[k]) G.set(k % SX, ((k / SX) | 0) % SY, (k / (SX * SY)) | 0, 0); }
  for (j = 0; j < nu.length; j += 2) { k = nu[j]; if (!occ[k]) G.set(k % SX, ((k / SX) | 0) % SY, (k / (SX * SY)) | 0, nu[j + 1]); }
  RISE.deco = nu;
}

/** 施工裝飾（照進度現算；格的 key ＝ x ＋ SX·(y ＋ SY·z)，留白後的格座標）⇒ [key, 色, key, 色, …]。
 *  ① 地基（0～0.06）：佔地鋪一層翻開的土、外緣一圈石頭照進度沿外緣砌起來。
 *  ② 腳手架（0.04～0.95）：外框往外 2～3 格一圈立柱（每 1.5 m 一根＋四角），高 ＝ 蓋到的最高格 ＋ 1.2 m（不超過完工的頂）；每 2 m 一層 2 格寬的走板；
 *     最後一段（0.88～0.95）從上往下拆。
 *  ③ 建材堆（0～0.9）：臨路那一側的留白裡排三堆：石（打地基用，0～0.3 用完）、磚（牆，0.05～0.65）、木料（廊、屋頂，0.4～0.9）；堆高照剩下多少。 */
function townRiseDeco(D, p, n1) {
  var out = [], G = RISE.G, P = RISE_PAD, SX = G.sx, SY = G.sy, SZ = G.sz, C = RISE_C;
  function put(x, y, z, c) { if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return; out.push(x + SX * (y + SY * z), c); }
  function hsh(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  // ① 地基
  if (p < 0.06) {
    var ring = [], sx = D.sx, sy = D.sy;
    for (var y = 0; y < sy; y++) for (var x = 0; x < sx; x++) {
      if (!D.foot[x + sx * y]) continue;
      put(x + P, y + P, 0, hsh(x, y) < 0.3 ? C.dirt2 : C.dirt);
      var edge = x === 0 || y === 0 || x === sx - 1 || y === sy - 1 || !D.foot[x - 1 + sx * y] || !D.foot[x + 1 + sx * y] || !D.foot[x + sx * (y - 1)] || !D.foot[x + sx * (y + 1)];
      if (edge) ring.push(x, y, Math.atan2(y - sy / 2, x - sx / 2));
    }
    var fr = Math.min(1, p / 0.05);                                     // 外緣照角度一段一段砌（從臨路那一邊的左角開始）
    for (var i = 0; i < ring.length; i += 3) if ((ring[i + 2] + Math.PI) / (2 * Math.PI) <= fr) { put(ring[i] + P, ring[i + 1] + P, 1, C.stone); put(ring[i] + P, ring[i + 1] + P, 2, (i / 3) % 3 ? C.stone : C.stone2); }
  }
  // ② 腳手架
  if (p > 0.04 && p < 0.95) {
    var full = Math.min(D.sz + 12, D.top[n1] + 12), h = p > 0.88 ? Math.round(full * (0.95 - p) / 0.07) : full, x0 = P - 3, y0 = P - 3, x1 = P + D.sx + 2, y1 = P + D.sy + 2;
    if (h > 0) {
      var poles = [];
      function side(ax, ay, bx, by) { var L = Math.max(Math.abs(bx - ax), Math.abs(by - ay)), k = Math.max(1, Math.round(L / 15)); for (var s = 0; s <= k; s++) poles.push(Math.round(ax + (bx - ax) * s / k), Math.round(ay + (by - ay) * s / k)); }
      side(x0, y0, x1, y0); side(x1, y0, x1, y1); side(x1, y1, x0, y1); side(x0, y1, x0, y0);
      for (var a = 0; a < poles.length; a += 2) for (var z = 0; z < h; z++) put(poles[a], poles[a + 1], z, C.pole);
      for (var lv = 20; lv < h - 2; lv += 20) {                             // 走板：外框外 1～2 格一圈、立柱那一圈一條橫桿
        for (var xx = x0; xx <= x1; xx++) { put(xx, y0 + 1, lv, C.plank); put(xx, y0 + 2, lv, C.plank); put(xx, y1 - 1, lv, C.plank); put(xx, y1 - 2, lv, C.plank); put(xx, y0, lv + 10, C.pole); put(xx, y1, lv + 10, C.pole); }
        for (var yy = y0; yy <= y1; yy++) { put(x0 + 1, yy, lv, C.plank); put(x0 + 2, yy, lv, C.plank); put(x1 - 1, yy, lv, C.plank); put(x1 - 2, yy, lv, C.plank); put(x0, yy, lv + 10, C.pole); put(x1, yy, lv + 10, C.pole); }
      }
    }
  }
  // ③ 建材堆（臨路那一側：y ＜ P 的留白；寬不夠就照比例縮）
  function left(a, b) { return p <= a ? 1 : p >= b ? 0 : 1 - (p - a) / (b - a); }
  var piles = [[C.stone, C.stone2, left(0, 0.3), 9], [C.brick, C.brick2, left(0.05, 0.65), 10], [C.plank, C.pole, left(0.4, 0.9), 7]], W = Math.max(6, Math.floor((D.sx - 8) / 3)), px = P + 4;
  piles.forEach(function (pl, i) {
    var hh = Math.round(pl[3] * pl[2]); if (hh <= 0) return;
    var w = Math.min(W - 2, i === 2 ? 30 : 12), dpt = i === 2 ? 5 : 7;
    for (var z = 0; z < hh; z++) for (var y = 0; y < dpt - Math.floor(z / 3); y++) for (var x = Math.floor(z / 3); x < w - Math.floor(z / 3); x++)
      put(px + i * W + x, P - 3 - dpt + y, z, i === 2 ? ((z & 1) ? pl[0] : pl[1]) : (((x >> 1) + (y >> 1) + z) & 1 ? pl[0] : pl[1]));
  });
  return out;
}

/** 這一步變過的區塊（Grid.cv 跟上次記的不一樣）連同六個鄰塊重新網格化（鄰塊貼著的面會被這一塊的格擋住或露出來）⇒ 接成一份 ⇒ GPU。 */
function townRiseMesh() {
  var G = RISE.G; if (!G) return;
  var cv = RISE.cv, NXY = G.nx * G.ny, re = new Set(), t0 = performance.now();
  for (var i = 0; i < G.tab.length; i++) {
    if (!RISE.dirtyAll && cv[i] === G.cv[i]) continue;
    cv[i] = G.cv[i];
    var cz = (i / NXY) | 0, cy = ((i - cz * NXY) / G.nx) | 0, cx = i - cz * NXY - cy * G.nx;
    re.add(i);
    if (cx > 0) re.add(i - 1); if (cx < G.nx - 1) re.add(i + 1); if (cy > 0) re.add(i - G.nx); if (cy < G.ny - 1) re.add(i + G.nx); if (cz > 0) re.add(i - NXY); if (cz < G.nz - 1) re.add(i + NXY);
  }
  RISE.dirtyAll = false;
  if (!re.size) return;
  re.forEach(function (k) {
    var kz = (k / NXY) | 0, ky = ((k - kz * NXY) / G.nx) | 0, kx = k - kz * NXY - ky * G.nx, m = G.tab[k] ? VK.meshChunk(G, kx, ky, kz) : null;
    if (m) RISE.mesh[k] = m; else delete RISE.mesh[k];
  });
  var len = 0, parts = []; Object.keys(RISE.mesh).forEach(function (k2) { var a = RISE.mesh[k2]; parts.push(a); len += a.length; });
  var all = new Uint16Array(len), o = 0; parts.forEach(function (a) { all.set(a, o); o += a.length; });
  if (!RISE.gpu) RISE.gpu = townUpload(all);
  else {
    QIDX.ensure(all.length / 16);                                       // 先加長（ensure 會解開現在綁的 VAO）
    gl.bindVertexArray(RISE.gpu.vao); gl.bindBuffer(gl.ARRAY_BUFFER, RISE.gpu.vbo); gl.bufferData(gl.ARRAY_BUFFER, all, gl.DYNAMIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, QIDX.buf); gl.bindVertexArray(null);
    RISE.gpu.nq = all.length / 16;
  }
  RISE.stat.remesh = re.size; RISE.stat.meshMs = +(performance.now() - t0).toFixed(2); RISE.stat.quads = all.length / 16;
}
/** 演的那一棟的實例欄位（同 townGhostDraw：aS.z 1e6 ⇒ 永遠是近那一級、不淡出）＋ uC（加上留白）。 */
function townRiseBind(PV) {
  var q = townRiseInst(RISE.T, RISE.lot), D = RISE.d; if (!q || !D || !RISE.gpu || !RISE.gpu.nq) return false;
  var B = RISE.ib || (RISE.ib = gl.createBuffer());
  gl.bindBuffer(gl.ARRAY_BUFFER, B); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([q.x, q.y, q.z, q.th, q.sx, q.sh, 1e6, 0, 0, 0, 0]), gl.DYNAMIC_DRAW);
  gl.uniform3f(PV.u.uC, D.mpv, (D.sx / 2 + RISE_PAD) * D.mpv, (D.sy / 2 + RISE_PAD) * D.mpv);
  gl.bindVertexArray(RISE.gpu.vao); gl.bindBuffer(gl.ARRAY_BUFFER, B);
  gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 44, 0); gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 44, 16); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 44, 28);
  return true;
}
/** 畫（63_towns.js townDraw：近、中兩級之後；同一支著色器、uniform 照用）⇒ 畫了幾個三角形。播放中 ⇒ 先推進度。 */
function townRiseDraw(P) {
  if (RISE_UI && !RISE.panel) townRisePanel();
  if (!RISE.T) return 0;
  if (RISE.play) {
    var f = Math.min(1, (performance.now() - RISE.t0) / 1000 / RISE.play);
    townRiseSet(RISE.p0 + (1 - RISE.p0) * f); townRisePanelSync();
    if (f >= 1) RISE.play = 0;
  }
  townRiseMesh();
  var PV = P.vox; gl.useProgram(PV.prog);
  gl.uniform1f(PV.u.uEdge, 1); gl.uniform2f(PV.u.uIn, -2, -1); gl.uniform2f(PV.u.uOut, 1e7, 2e7);
  if (!townRiseBind(PV)) { gl.bindVertexArray(null); return 0; }
  gl.drawElementsInstanced(gl.TRIANGLES, RISE.gpu.nq * 6, gl.UNSIGNED_INT, 0, 1); gl.bindVertexArray(null);
  return RISE.gpu.nq * 2;
}
/** 陰影那一趟（63_towns.js townDepth）：同一份網格只寫深度。 */
function townRiseDepth(P) {
  if (!RISE.T || !RISE.gpu) return 0;
  var PD = P.dVox; gl.useProgram(PD.prog); setCommon(PD);
  if (!townRiseBind(PD)) { gl.bindVertexArray(null); return 0; }
  gl.drawElementsInstanced(gl.TRIANGLES, RISE.gpu.nq * 6, gl.UNSIGNED_INT, 0, 1); gl.bindVertexArray(null);
  return 1;
}
/** 讀數（__game.townRise('stat')）。 */
function townRiseStat() {
  var D = RISE.d;
  return { town: RISE.T ? RISE.T.id : null, lot: RISE.lot, model: RISE.nm, p: RISE.p, play: RISE.play, shown: RISE.n, total: D ? D.n : 0, deco: RISE.deco.length / 2,
    quads: RISE.stat.quads || 0, remesh: RISE.stat.remesh || 0, meshMs: RISE.stat.meshMs || 0 };
}

// ── 面板（網址 ?rise=1；獨立功能的入口）：選一棟（下一次點畫面 ⇒ townHitAt）、拉進度、播放、停 ──
function townRisePanel() {
  if (RISE.panel || !RISE_UI) return RISE.panel;
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50;background:rgba(20,24,30,0.86);color:#e8e4da;font:13px/1.5 sans-serif;padding:8px 10px;border-radius:6px;min-width:260px';
  el.innerHTML = '<div style="font-weight:bold">建造演出（TASK-0908）</div><div data-k="nm">還沒選建築</div>' +
    '<input data-k="p" type="range" min="0" max="1000" value="1000" style="width:100%">' +
    '<div><button data-k="pick">選一棟</button> <button data-k="play">▶ 播放</button> <button data-k="stop">■ 停</button> <span data-k="pct"></span></div>';
  document.body.appendChild(el);
  function $(k) { return el.querySelector('[data-k="' + k + '"]'); }
  $('pick').onclick = function () { RISE.picking = true; $('nm').textContent = '點畫面上的一棟建築…'; };
  $('play').onclick = function () { if (!RISE.T) return; if (RISE.p >= 1) townRiseSet(0); RISE.p0 = RISE.p; RISE.t0 = performance.now(); RISE.play = RISE.dur * (1 - RISE.p0) || RISE.dur; };
  $('stop').onclick = function () { townRiseStop(); };
  $('p').oninput = function () { if (!RISE.T) return; RISE.play = 0; townRiseSet(+this.value / 1000); townRisePanelSync(); };
  window.addEventListener('pointerdown', function (e) {
    if (!RISE.picking || e.target !== cv) return;
    e.stopPropagation(); e.preventDefault(); RISE.picking = false;
    var h = townHitAt(e.clientX, e.clientY);
    if (!h || !h.lot) { $('nm').textContent = '沒點到建築'; return; }
    townRiseStart(h.T, h.lot.id, 0, 0).then(function () { $('nm').textContent = h.name + '（' + h.q.k + '）'; townRisePanelSync(); }, function (er) { $('nm').textContent = er.message; });
  }, true);
  RISE.panel = el;
  return el;
}
function townRisePanelShow() { var el = townRisePanel(); if (!el) return; if (!RISE.T) el.querySelector('[data-k="nm"]').textContent = '還沒選建築'; townRisePanelSync(); }
function townRisePanelSync() {
  var el = RISE.panel; if (!el) return;
  el.querySelector('[data-k="p"]').value = Math.round((RISE.T ? RISE.p : 1) * 1000);
  el.querySelector('[data-k="pct"]').textContent = RISE.T ? Math.round(RISE.p * 100) + '%' : '';
}

// ───────────────────────── 建築的建造演出與工地（TASK-0908、0912；只給人看） ─────────────────────────
// Tim 2026-10-25：「可以嘗試給目前的建築加上建造演出（先做獨立功能 之後在串接上去）…演出過程中可以搭腳手架或其他裝飾（磚頭 木材等建材堆積 打地基等）」
//   「然後把城鎮的房子逐步建造機制套用到遊戲中吧」「另外家族 城鎮建造建築也都走工地 有建造進度」（TASK-0912）
//   一個工地 ＝ 一塊地塊上的一棟：施工進度 p（0～1）⇒ 那一棟的格子只畫門檻 ≤ p 的那幾格（門檻 ＝ Blocksail tools/townrise.py 算好的 bo：照 g 的非空格順序一格一個位元組；
//   有雕刻的施工階段 meta 照 meta，沒有照自動算法）＋ 照 p 現算的施工裝飾（地基、腳手架、建材堆）。
//   畫法：四周留白（RISE_PAD 格；腳手架、建材堆放在那裡）的一份 VoxelKit 網格 ⇒ 只重新網格化這一步變過的區塊（Grid.cv）⇒ 城鎮那一支著色器畫一個實例；
//   uC 的半寬、半深加上留白 ⇒ 模型的格落在原本那一棟的位置（著色器見 63_towns.js TOWN_VS）。工地上的那一棟不進分組（townBin）⇒ 原本的格子、貼圖、石基、玻璃都不畫。
//   工地有兩種來源（RISE.S，鍵 ＝ 城 id ＋ '/' ＋ 地塊 id）：
//     sim  ＝ 城鎮帳的工地（Blocksail 地球儀 townUI 'sites' ⇒ { 地塊 id: 進度 ‰ }；城鎮模式每 RISE_POLL 毫秒問一次，順便帶這一頁的時刻 ⇒ 那一頁的世界時間跟上、帳往前走）；
//          帳上不再是工地（蓋好了）⇒ 拿掉、換回原本的畫法。
//          城鎮、家族自動蓋的（Blocksail town.js townAutoBuild）是那一頁擺上地圖的 ⇒ 問的時候帶這座城拿到的版本 av，那一頁比較新 ⇒ 回覆附新的規劃 ⇒ townReplace。
//     demo ＝ 演出（點建築的面板「演出建造過程」、?rise=1 的面板、__game.townRise）：從 p 演到完工；演完（auto）或按停 ⇒ 換回帳上的樣子（還在蓋 ⇒ 照帳的進度）。
//   ⛔ 只給人看：不碰規劃、城鎮帳、整地。施工本身（工天、雇工、建材）全在 Blocksail world/prod.js、auto.js。
//   入口：網址 ?rise=1 ⇒ 左下角一塊小面板（選一棟、拉進度、播放）；點建築的資訊面板（89_townbld.js，TASK-0909）；測試用 __game.townRise（90_main.js）。
var RISE = { S: {}, demo: null, dur: 24, panel: null, picking: false, poll: { on: true, at: 0, busy: false, n: 0, fail: 0, last: null, av: {}, swaps: 0 }, stat: {} };   // av：每座城拿到的規劃是那一頁自動擺放的第幾版
var RISE_UI = Q.get('rise') === '1';                                  // 面板（見檔頭）
var RISE_PAD = 14, RISE_TOP = 16, RISE_LAYER = 0.2;                  // RISE_LAYER：一層的格數 ≥ 每層中位數的這麼多才算「蓋到這一層」（煙囪、鐘塔那幾層不算 ⇒ 腳手架不被細細的一根拉高）                                      // 四周留白、頂上多留幾格（腳手架比蓋到的高出一截）
var RISE_C = { dirt: 104, dirt2: 68, stone: 145, stone2: 146, pole: 136, plank: 177, brick: 164, brick2: 201, sand: 213 };   // rgb332（63_towns.js 著色器照 vC 解）
var RISE_POLL = 2000, RISE_HOLD = 1.5;                                // 問工地的間隔（毫秒）；演出演到完工之後停多久才換回去（秒）

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
    var foot = new Uint8Array(sx * sy), F = new Int32Array(sz);          // F[z] ＝ 完工時那一層幾格（腳手架的高度照它判：townRiseSet）
    for (j = 0; j < n; j++) { foot[X[j] + sx * Y[j]] = 1; F[Z[j]]++; }
    var L = Array.prototype.filter.call(F, function (v) { return v > 0; }).sort(function (a, b) { return a - b; }), Fmin = Math.max(1, (L[L.length >> 1] || 1) * RISE_LAYER);
    Mm.riseD = { nm: nm, sx: sx, sy: sy, sz: sz, mpv: m.mpv, n: n, X: X, Y: Y, Z: Z, C: C, O: O, ord: ord, at: at, foot: foot, F: F, Fmin: Fmin };
    return Mm.riseD;
  });
}

/** 進度 p ⇒ 這一步看得到幾格（照門檻排好的前幾格）。 */
function townRiseCount(D, p) { var v = Math.max(0, Math.min(255, 1 + Math.round(Math.max(0, Math.min(1, p)) * 254))); return v < 1 ? 0 : D.at[v]; }
function townRiseKey(T, lot) { return T.id + '/' + lot; }

/** 開一個工地（城 T 的地塊 lot、從進度 p 開始）⇒ Promise<工地>。同一塊地已經有 ⇒ 照用。模型載入之前那一塊照舊畫原本那一棟（還沒進 RISE.S）。 */
function townRiseOpen(T, lot, p) {
  var key = townRiseKey(T, lot), had = RISE.S[key];
  if (had) return Promise.resolve(had);
  var q = townRiseInst(T, lot); if (!q) return Promise.reject(new Error('城 ' + (T && T.id) + ' 沒有擺出地塊 ' + lot + ' 的建築'));
  return townRiseLoad(q.k).then(function (D) {
    if (RISE.S[key]) return RISE.S[key];                                  // 等模型的時候另一條路先開了
    var sx = D.sx + RISE_PAD * 2, sy = D.sy + RISE_PAD * 2, sz = D.sz + RISE_TOP;
    var s = { key: key, T: T, lot: lot, nm: q.k, d: D, p: -1, n: 0, deco: [], mesh: {}, dirtyAll: true, gpu: null, ib: null, pl: null, sim: null, play: 0, t0: 0, p0: 0, auto: false, stat: {},
      G: new VK.Grid([sx, sy, sz]), occ: new Uint8Array(sx * sy * sz), V: new Int32Array(D.sz) };   // V[z] ＝ 這一步那一層畫了幾格；sim ＝ 帳上的進度（0～1；null ＝ 帳上沒有這個工地）
    s.cv = new Uint32Array(s.G.tab.length);
    RISE.S[key] = s;
    townRiseSet(s, p == null ? 0 : p);
    TOWNS.dirty = true;                                                   // 重新分組 ⇒ 原本那一棟不畫（townBin）
    return s;
  });
}
/** 收掉一個工地：放掉 GPU、原本那一棟回來。 */
function townRiseClose(s) {
  if (!s || RISE.S[s.key] !== s) return;
  if (s.gpu) { gl.deleteVertexArray(s.gpu.vao); gl.deleteBuffer(s.gpu.vbo); }
  if (s.ib) gl.deleteBuffer(s.ib);
  delete RISE.S[s.key]; if (RISE.demo === s) RISE.demo = null;
  TOWNS.dirty = true;
}

/** 演一棟（點建築的面板、?rise=1、__game.townRise）：城 T 的地塊 lot、從進度 p 開始；play ＞ 0 ⇒ 用幾秒從 p 演到完工；auto ⇒ 演完停 RISE_HOLD 秒自己換回去。⇒ Promise<讀數>。 */
function townRiseStart(T, lot, p, play, auto) {
  if (RISE.demo && (RISE.demo.T !== T || RISE.demo.lot !== lot)) townRiseStop();
  return townRiseOpen(T, lot, p).then(function (s) {
    RISE.demo = s; s.auto = !!auto;
    townRiseSet(s, p == null ? 0 : p);
    s.play = play > 0 ? play : 0; s.t0 = performance.now(); s.p0 = s.p;
    townRisePanelShow();
    return townRiseStat();
  });
}
/** 停演：帳上還是工地 ⇒ 回到帳的進度；不是 ⇒ 收掉、原本那一棟回來。 */
function townRiseStop() {
  var s = RISE.demo; RISE.demo = null;
  if (s) { s.play = 0; s.auto = false; if (s.sim != null) townRiseSet(s, s.sim); else townRiseClose(s); }
  townRisePanelShow();
}
/** 城 T 的地塊 lot 現在擺出來的那一棟（實例會因為換模型組重建 ⇒ 每次照地塊 id 找）。 */
function townRiseInst(T, lot) { if (!T || !T.inst) return null; for (var i = 0; i < T.inst.length; i++) if (T.inst[i].lot === lot) return T.inst[i]; return null; }
/** 工地那一棟的石基（63_towns.js townBin）：地基那一段（RISE_PLINTH）做完才出現。 */
var RISE_PLINTH = 0.03;
function townRisePlinth(s) { return s.p >= RISE_PLINTH; }
/** 分組時跳過工地上的那一棟（63_towns.js townBin）⇒ 那個工地｜null。 */
function townRiseHides(T, q) { return q.lot != null ? RISE.S[townRiseKey(T, q.lot)] || null : null; }

/** 城鎮帳的工地（Blocksail townUI 'sites'）：城 T 現在在蓋的 { 地塊 id: 進度 ‰ } ⇒ 開新的、更新進度、帳上沒了的收掉（正在演的那一棟照演，演完再照帳）。 */
function townRiseSites(T, map) {
  if (!T) return;
  map = map || {};
  Object.keys(RISE.S).forEach(function (k) {
    var s = RISE.S[k]; if (s.T.id !== T.id) return;
    s.T = T;                                                              // 規劃換過（townReplace）⇒ 照新的那一份找實例
    if (map[s.lot] != null) return;
    s.sim = null; if (RISE.demo !== s) townRiseClose(s);                    // 蓋好了（或拆了）⇒ 換回原本的畫法
  });
  Object.keys(map).forEach(function (lot) {
    var p = Math.max(0, Math.min(999, +map[lot] || 0)) / 1000, s = RISE.S[townRiseKey(T, lot)];
    if (s) { s.sim = p; if (RISE.demo !== s) townRiseSet(s, p); return; }
    if (!townRiseInst(T, lot)) return;                                    // 那一棟還沒擺出來（規劃剛換、模型組還在解）⇒ 下一次再開
    townRiseOpen(T, lot, p).then(function (s2) { s2.sim = p; if (RISE.demo !== s2) townRiseSet(s2, p); }, function (er) { RISE.stat.err = er.message; });
  });
}
/** 城鎮模式：每 RISE_POLL 毫秒問外面那一頁這座城的工地（帶這一頁的時刻；89_townui.js tuiAsk）。太舊的地球儀沒有 'sites' ⇒ 連兩次沒回就不再問。 */
function townRisePoll() {
  var P = RISE.poll, now = performance.now();
  if (!P.on || P.busy || !tuiOk()) return;
  var T = twbTown(); if (!T || !T.inst) return;
  if (T.inst !== P.inst) { P.inst = T.inst; P.at = 0; }                    // 規劃換了（建築模式剛蓋、復原）⇒ 馬上問（剛蓋的那一棟不要先完整閃一下才變工地）
  if (now - P.at < RISE_POLL) return;
  P.busy = true; P.at = now;
  var av = P.av[T.id] != null ? P.av[T.id] : T.p && T.p.live && T.p.live.av != null ? T.p.live.av : null;
  tuiAsk('sites', { tod: todNow(), av: av }, function (r) {
    P.busy = false; P.at = performance.now();
    if (!r.ok) { P.last = (r.why || []).join('；'); if (++P.fail >= 2) P.on = false; return; }
    P.fail = 0; P.n++; P.last = r.day != null ? '第 ' + r.day + ' 天' : null;
    if (r.av != null) P.av[T.id] = r.av;
    if (r.town && townReplace(r.town)) P.swaps++;                       // 那一頁剛把自動蓋的擺上地圖 ⇒ 換規劃（新的那一棟下一次問到時才開工地：實例還沒擺）
    townRiseSites(twbTown() || T, r.sites);
  });
}

/** 設進度（工地 s；演出、帳都從這裡進）：只改這一步跟上一步不一樣的格；網格化留到畫的時候。 */
function townRiseSet(s, p) {
  var D = s && s.d; if (!D) return;
  p = Math.max(0, Math.min(1, p)); if (p === s.p) return; s.p = p;
  var G = s.G, occ = s.occ, P = RISE_PAD, SX = G.sx, SY = G.sy, n1 = townRiseCount(D, p), j, q, x, y, z, k;
  var V = s.V;
  for (j = s.n; j < n1; j++) { q = D.ord[j]; x = D.X[q] + P; y = D.Y[q] + P; z = D.Z[q]; G.set(x, y, z, D.C[q]); occ[x + SX * (y + SY * z)] = 1; V[z]++; }
  for (j = s.n - 1; j >= n1; j--) { q = D.ord[j]; x = D.X[q] + P; y = D.Y[q] + P; z = D.Z[q]; G.set(x, y, z, 0); occ[x + SX * (y + SY * z)] = 0; V[z]--; }
  s.n = n1;
  for (var hz = 0, zz = 0; zz < D.sz; zz++) if (V[zz] > 0 && D.F[zz] >= D.Fmin) hz = zz + 1;   // 蓋到哪一層（見 RISE_LAYER）
  var old = s.deco, nu = townRiseDeco(s, p, hz), seen = new Set();       // 施工裝飾：這一步該有的 ⇒ 舊的拿掉（那一格沒被房子佔掉的）、新的補上（只放空格）
  for (j = 0; j < nu.length; j += 2) seen.add(nu[j]);
  for (j = 0; j < old.length; j += 2) { k = old[j]; if (!seen.has(k) && !occ[k]) G.set(k % SX, ((k / SX) | 0) % SY, (k / (SX * SY)) | 0, 0); }
  for (j = 0; j < nu.length; j += 2) { k = nu[j]; if (!occ[k]) G.set(k % SX, ((k / SX) | 0) % SY, (k / (SX * SY)) | 0, nu[j + 1]); }
  s.deco = nu;
  if ((p >= RISE_PLINTH) !== (s.pl === true)) { s.pl = p >= RISE_PLINTH; TOWNS.dirty = true; }   // 石基出現／拿掉 ⇒ 重新分組
}

/** 施工裝飾（工地 s；照進度現算；格的 key ＝ x ＋ SX·(y ＋ SY·z)，留白後的格座標）⇒ [key, 色, key, 色, …]。
 *  ① 地基（0～0.06）：佔地鋪一層翻開的土、外緣一圈石頭照進度沿外緣砌起來。
 *  ② 腳手架（0.04～0.95）：外框往外 2～3 格一圈立柱（每 1.5 m 一根＋四角），高 ＝ 蓋到的那一層（hz，見 RISE_LAYER）＋ 1.2 m；每 2 m 一層 2 格寬的走板；
 *     最後一段（0.88～0.95）從上往下拆。
 *  ③ 建材堆（0～0.9）：臨路那一側的留白裡排三堆：石（打地基用，0～0.3 用完）、磚（牆，0.05～0.65）、木料（廊、屋頂，0.4～0.9）；堆高照剩下多少。 */
function townRiseDeco(s, p, hz) {
  var D = s.d, out = [], G = s.G, P = RISE_PAD, SX = G.sx, SY = G.sy, SZ = G.sz, C = RISE_C;
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
    var full = Math.min(D.sz + 12, hz + 12), h = p > 0.88 ? Math.round(full * (0.95 - p) / 0.07) : full, x0 = P - 3, y0 = P - 3, x1 = P + D.sx + 2, y1 = P + D.sy + 2;
    if (h > 0) {
      var poles = [];
      function side(ax, ay, bx, by) { var L = Math.max(Math.abs(bx - ax), Math.abs(by - ay)), k = Math.max(1, Math.round(L / 15)); for (var s2 = 0; s2 <= k; s2++) poles.push(Math.round(ax + (bx - ax) * s2 / k), Math.round(ay + (by - ay) * s2 / k)); }
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

/** 工地 s 這一步變過的區塊（Grid.cv 跟上次記的不一樣）連同六個鄰塊重新網格化（鄰塊貼著的面會被這一塊的格擋住或露出來）⇒ 接成一份 ⇒ GPU。 */
function townRiseMesh(s) {
  var G = s.G; if (!G) return;
  var cv = s.cv, NXY = G.nx * G.ny, re = new Set(), t0 = performance.now();
  for (var i = 0; i < G.tab.length; i++) {
    if (!s.dirtyAll && cv[i] === G.cv[i]) continue;
    cv[i] = G.cv[i];
    var cz = (i / NXY) | 0, cy = ((i - cz * NXY) / G.nx) | 0, cx = i - cz * NXY - cy * G.nx;
    re.add(i);
    if (cx > 0) re.add(i - 1); if (cx < G.nx - 1) re.add(i + 1); if (cy > 0) re.add(i - G.nx); if (cy < G.ny - 1) re.add(i + G.nx); if (cz > 0) re.add(i - NXY); if (cz < G.nz - 1) re.add(i + NXY);
  }
  s.dirtyAll = false;
  if (!re.size) return;
  re.forEach(function (k) {
    var kz = (k / NXY) | 0, ky = ((k - kz * NXY) / G.nx) | 0, kx = k - kz * NXY - ky * G.nx, m = G.tab[k] ? VK.meshChunk(G, kx, ky, kz) : null;
    if (m) s.mesh[k] = m; else delete s.mesh[k];
  });
  var len = 0, parts = []; Object.keys(s.mesh).forEach(function (k2) { var a = s.mesh[k2]; parts.push(a); len += a.length; });
  var all = new Uint16Array(len), o = 0; parts.forEach(function (a) { all.set(a, o); o += a.length; });
  if (!s.gpu) s.gpu = townUpload(all);
  else {
    QIDX.ensure(all.length / 16);                                       // 先加長（ensure 會解開現在綁的 VAO）
    gl.bindVertexArray(s.gpu.vao); gl.bindBuffer(gl.ARRAY_BUFFER, s.gpu.vbo); gl.bufferData(gl.ARRAY_BUFFER, all, gl.DYNAMIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, QIDX.buf); gl.bindVertexArray(null);
    s.gpu.nq = all.length / 16;
  }
  s.stat.remesh = re.size; s.stat.meshMs = +(performance.now() - t0).toFixed(2); s.stat.quads = all.length / 16;
}
/** 工地那一棟的實例欄位（同 townGhostDraw：aS.z 1e6 ⇒ 永遠是近那一級、不淡出）＋ uC（加上留白）。 */
function townRiseBind(s, PV) {
  var q = townRiseInst(s.T, s.lot), D = s.d; if (!q || !D || !s.gpu || !s.gpu.nq) return false;
  var B = s.ib || (s.ib = gl.createBuffer());
  gl.bindBuffer(gl.ARRAY_BUFFER, B); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([q.x, q.y, q.z, q.th, q.sx, q.sh, 1e6, 0, 0, 0, 0]), gl.DYNAMIC_DRAW);
  gl.uniform3f(PV.u.uC, D.mpv, (D.sx / 2 + RISE_PAD) * D.mpv, (D.sy / 2 + RISE_PAD) * D.mpv);
  gl.bindVertexArray(s.gpu.vao); gl.bindBuffer(gl.ARRAY_BUFFER, B);
  gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 44, 0); gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 44, 16); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 44, 28);
  return true;
}
/** 畫（63_towns.js townDraw：近、中兩級之後；同一支著色器、uniform 照用）⇒ 畫了幾個三角形。先問工地、推演出的進度。 */
function townRiseDraw(P) {
  if (RISE_UI && !RISE.panel) townRisePanel();
  townRisePoll();
  var s0 = RISE.demo;
  if (s0 && s0.play) {
    var f = Math.min(1, (performance.now() - s0.t0) / 1000 / s0.play);
    townRiseSet(s0, s0.p0 + (1 - s0.p0) * f); townRisePanelSync();
    if (f >= 1 && !s0.auto) s0.play = 0;
    if (s0.auto && performance.now() - s0.t0 > (s0.play + RISE_HOLD) * 1000) townRiseStop();   // 演完停一下 ⇒ 換回帳上的樣子
  }
  var keys = Object.keys(RISE.S); if (!keys.length) return 0;
  var PV = P.vox, tris = 0; gl.useProgram(PV.prog);
  gl.uniform1f(PV.u.uEdge, 1); gl.uniform2f(PV.u.uIn, -2, -1); gl.uniform2f(PV.u.uOut, 1e7, 2e7);
  keys.forEach(function (k) {
    var s = RISE.S[k]; townRiseMesh(s);
    if (!townRiseBind(s, PV)) return;
    gl.drawElementsInstanced(gl.TRIANGLES, s.gpu.nq * 6, gl.UNSIGNED_INT, 0, 1); tris += s.gpu.nq * 2;
  });
  gl.bindVertexArray(null);
  return tris;
}
/** 陰影那一趟（63_towns.js townDepth）：同一份網格只寫深度。 */
function townRiseDepth(P) {
  var keys = Object.keys(RISE.S); if (!keys.length) return 0;
  var PD = P.dVox, n = 0; gl.useProgram(PD.prog); setCommon(PD);
  keys.forEach(function (k) { var s = RISE.S[k]; if (!s.gpu || !townRiseBind(s, PD)) return; gl.drawElementsInstanced(gl.TRIANGLES, s.gpu.nq * 6, gl.UNSIGNED_INT, 0, 1); n++; });
  gl.bindVertexArray(null);
  return n;
}
/** 一個工地的讀數。 */
function townRiseOne(s) {
  return { town: s.T.id, lot: s.lot, model: s.nm, p: s.p, sim: s.sim, play: s.play, shown: s.n, total: s.d.n, deco: s.deco.length / 2, quads: s.stat.quads || 0, remesh: s.stat.remesh || 0, meshMs: s.stat.meshMs || 0 };
}
/** 讀數（__game.townRise('stat')）：演的那一棟（舊的欄位照留）＋ 全部工地 ＋ 問工地的狀態。 */
function townRiseStat() {
  var s = RISE.demo, o = s ? townRiseOne(s) : { town: null, lot: null, model: null, p: 1, play: 0, shown: 0, total: 0, deco: 0, quads: 0, remesh: 0, meshMs: 0 };
  o.sites = Object.keys(RISE.S).map(function (k) { return townRiseOne(RISE.S[k]); });
  o.poll = { on: RISE.poll.on, n: RISE.poll.n, fail: RISE.poll.fail, last: RISE.poll.last, av: RISE.poll.av, swaps: RISE.poll.swaps };
  if (RISE.stat.err) o.err = RISE.stat.err;
  return o;
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
  $('play').onclick = function () { var s = RISE.demo; if (!s) return; if (s.p >= 1) townRiseSet(s, 0); s.p0 = s.p; s.t0 = performance.now(); s.play = RISE.dur * (1 - s.p0) || RISE.dur; };
  $('stop').onclick = function () { townRiseStop(); };
  $('p').oninput = function () { var s = RISE.demo; if (!s) return; s.play = 0; townRiseSet(s, +this.value / 1000); townRisePanelSync(); };
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
function townRisePanelShow() { var el = townRisePanel(); if (!el) return; if (!RISE.demo) el.querySelector('[data-k="nm"]').textContent = '還沒選建築'; townRisePanelSync(); }
function townRisePanelSync() {
  var el = RISE.panel; if (!el) return;
  var s = RISE.demo;
  el.querySelector('[data-k="p"]').value = Math.round((s ? s.p : 1) * 1000);
  el.querySelector('[data-k="pct"]').textContent = s ? Math.round(s.p * 100) + '%' : '';
}

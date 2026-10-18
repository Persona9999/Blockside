// ───────────────────────── 海圖塊：陸地與海底（TASK-0721） ─────────────────────────
// Tim 2026-10-19：「讓地圖可以匯出到Blockside 在Blockside可以在海岸附近開戰(或小島) 然後地形也可以加入珊瑚礁 暗礁等海底地形 可以先定一出一套通用格式
//   (目前構想是1平方公里作為一格地圖 然後海戰時會載入附近9格地圖 …) 然後整體移動到另一格地圖格時重新載入另一格座標為中心的9格」
// 格式：src/MAP_CHUNK.md。一個海域 ＝ maps/<海域>/area.js（BSMAP.area）＋ 一塊一檔 maps/<海域>/<cx>_<cy>.js（BSMAP.chunk）；全是深海的塊沒有檔。
// 開法：?map=<海域>[&site=<第幾個開戰位置>] —— 世界原點（兩隊正中間）＝ 那個位置；沒給 ?map ⇒ BED ＝ null ⇒ 每一處都走原本那一條（戰局逐位元組不變）。
// 載入：焦點（還在打的船的中心）所在那一塊為中心、載 (2·(ring＋prefetch)＋1)² 塊（預設 5×5，其中 3×3 是「在用的」）；焦點走進別塊 ⇒ 換中心、載新的、丟太遠的。
//   ⛔ 模擬只讀載好的塊：每一步之前看每艘船 margin 公尺內的塊都載好了沒（bedWait）—— 沒有 ⇒ 這一步先不走（畫面迴圈）⇒ 戰局跟載入快慢無關。
//   快轉、無頭（?demo）沒有畫面迴圈可以等 ⇒ 開戰前整個海域一次載完（bedBoot）。
// 查詢（模擬用）：bedHgt(x, z) 海底／地面高度（m，海面 0、水下是負的；雙線性）、bedMat(x, z) 底質（BED_MAT）、bedGrad(x, z) 坡度。海域外、深海塊 ⇒ 深海 area.deep。
var BED = null;
var BED_MAT = { DEEP: 0, SAND: 1, REEF: 2, SHOAL: 3, ROCK: 4, BEACH: 10, LAND: 11, CLIFF: 12 };
var BED_CFG = Object.assign({ ring: 1, prefetch: 1, margin: 300 }, CFG.map || {});   // config/game.json map：在用幾圈、多預載幾圈、船旁邊多少公尺內一定要載好
window.BSMAP = {                                                         // 海圖檔（<script>）載進來呼叫這兩支
  area: function (o) { if (BED && BED.wantArea === o.id) BED.gotArea = o; },
  chunk: function (id, cx, cy, b64) { if (!BED || !BED.A || BED.A.id !== id) return; var k = bedKey(cx, cy), w = BED.pend[k]; if (w) w(b64); }
};
function bedKey(cx, cy) { return cx + '_' + cy; }
function bedScript(src) {
  return new Promise(function (ok, bad) {
    var s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = function () { s.remove(); ok(); }; s.onerror = function () { s.remove(); bad(new Error('載不到 ' + src)); };
    document.head.appendChild(s);
  });
}
/** 開機（90_main.js 跟船一起等）：有 ?map ⇒ 讀海域、定原點；快轉／無頭 ⇒ 整個海域載完，不然 ⇒ 開戰位置附近先載好。 */
function bedBoot() {
  var id = Q.get('map'); if (!id) return Promise.resolve();
  if (!/^[a-z0-9_-]+$/.test(id)) return Promise.reject(new Error('海域名稱只能是小寫英數、底線、連字號：' + id));
  BED = { wantArea: id, A: null, ch: {}, pend: {}, idx: null, cx: null, cy: null, top: -Infinity, miss: 0, loads: 0, drops: 0 };
  return bedScript('maps/' + id + '/area.js').then(function () {
    var A = BED.gotArea; if (!A) throw new Error('maps/' + id + '/area.js 沒有呼叫 BSMAP.area');
    BED.A = A; BED.G = A.chunk / A.step; BED.n = A.n; BED.nx = A.x[1] - A.x[0] + 1;
    BED.has = new Uint8Array(BED.nx * (A.y[1] - A.y[0] + 1));            // 這一塊有沒有檔（0 ＝ 深海或海域外）
    A.chunks.forEach(function (c) { var i = bedIdx(c[0], c[1]); if (i >= 0) BED.has[i] = c[2] ? 1 : 0; });
    BED.slot = new Array(BED.has.length);                                // 載好的塊照編號放（查詢不用字串）
    var si = Math.max(0, Math.min((A.sites || []).length - 1, +(Q.get('site') || 0) | 0)), S0 = (A.sites || [])[si];
    BED.site = si; BED.ax = S0 ? S0.x : (A.x[0] + A.x[1] + 1) * A.chunk / 2; BED.az = S0 ? S0.y : (A.y[0] + A.y[1] + 1) * A.chunk / 2;   // 世界原點在海域的哪裡（往東、往南公尺）
    if (DEMO >= 0 || HEADLESS) return Promise.all(A.chunks.filter(function (c) { return c[2]; }).map(function (c) { return bedLoad(c[0], c[1]); }));
    return bedFocus(0, 0, true);
  });
}
function bedIdx(cx, cy) { var A = BED.A, i = cx - A.x[0], j = cy - A.y[0]; return i < 0 || j < 0 || i >= BED.nx || cy > A.y[1] ? -1 : j * BED.nx + i; }
function bedLoad(cx, cy) {
  var k = bedKey(cx, cy), i = bedIdx(cx, cy);
  if (i < 0 || !BED.has[i] || BED.slot[i] || BED.pend[k]) return BED.pend[k] ? BED.pend[k].p : Promise.resolve();
  var w = function (b64) { var C = bedDecode(b64); if (C.cx !== cx || C.cy !== cy) throw new Error('海圖塊 ' + k + ' 的檔頭寫的是 ' + C.cx + '_' + C.cy);
    BED.slot[i] = C; BED.ch[k] = C; BED.top = Math.max(BED.top, C.max); BED.loads++; evEmit('bedChunk', cx, cy, C); };
  BED.pend[k] = w;
  w.p = bedScript('maps/' + BED.A.id + '/' + k + '.js').then(function () { delete BED.pend[k]; }, function (e) { delete BED.pend[k]; throw e; });
  return w.p;
}
/** 解碼一塊（跟世界地圖工具 tools/export_chunks.cjs encodeChunk 一一對應；格式 src/MAP_CHUNK.md）⇒ { cx, cy, n, step, h: Int16Array（分米）, mat: Uint8Array, min, max（公尺） } */
function bedDecode(b64) {
  var bin = atob(b64), b = new Uint8Array(bin.length), p = 4;
  for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  if (b[0] !== 66 || b[1] !== 83 || b[2] !== 67 || b[3] !== 49) throw new Error('不是海圖塊（BSC1）');
  function u() { var v = 0, m = 1, c; do { c = b[p++]; v += (c & 127) * m; m *= 128; } while (c >= 128); return v; }
  function zg(v) { return v & 1 ? -(v + 1) / 2 : v / 2; }
  var ver = u(); if (ver !== 1) throw new Error('海圖塊版本 ' + ver + ' 不認得');
  var cx = zg(u()), cy = zg(u()), n = u(), step = u() / 100, N = n * n, h = new Int16Array(N), mat = new Uint8Array(N), run = 0, mn = 1e9, mx = -1e9;
  for (var j = 0; j < n; j++) for (var x = 0; x < n; x++) {
    var o = j * n + x, d;
    if (run > 0) { run--; d = 0; }
    else { var t = u(); if (t & 1) { run = t >> 1; d = 0; } else d = zg(t >> 1); }
    var L = x ? h[o - 1] : (j ? h[o - n] : 0), pred = x && j ? L + h[o - n] - h[o - n - 1] : L;
    h[o] = pred + d; if (h[o] < mn) mn = h[o]; if (h[o] > mx) mx = h[o];
  }
  for (var k = 0; k < N;) { var v = u(), c = u(); mat.fill(v, k, k + c); k += c; }
  return { cx: cx, cy: cy, n: n, step: step, h: h, mat: mat, min: mn / 10, max: mx / 10 };
}
/** 焦點（世界座標）⇒ 換中心：要的塊（中心 ± ring＋prefetch）載進來、不要的（也不在任何船旁邊）丟掉。first ⇒ 回傳等全部載好的 Promise。畫面迴圈每格叫（90_main.js）。 */
function bedFocus(fx, fz, first) {
  var A = BED.A, cx = Math.floor((fx + BED.ax) / A.chunk), cy = Math.floor((fz + BED.az) / A.chunk);
  if (!first && cx === BED.cx && cy === BED.cy) return null;
  BED.cx = cx; BED.cy = cy;
  var R = BED_CFG.ring + BED_CFG.prefetch, ps = [];
  for (var j = cy - R; j <= cy + R; j++) for (var i = cx - R; i <= cx + R; i++) ps.push(bedLoad(i, j));
  var keep = bedNear();
  Object.keys(BED.ch).forEach(function (k) {
    var C = BED.ch[k]; if (Math.abs(C.cx - cx) <= R && Math.abs(C.cy - cy) <= R || keep[k]) return;
    delete BED.ch[k]; BED.slot[bedIdx(C.cx, C.cy)] = undefined; BED.drops++; evEmit('bedDrop', C.cx, C.cy);
  });
  return Promise.all(ps);
}
/** 每艘還在的船 margin 公尺內的塊（鍵 ⇒ true）。 */
function bedNear() {
  var A = BED.A, M = BED_CFG.margin, out = {};
  SHIPS.forEach(function (sh) {
    if (sh.sunk) return;
    var e = sh.px + BED.ax, s = sh.pz + BED.az;
    for (var j = Math.floor((s - M) / A.chunk); j <= Math.floor((s + M) / A.chunk); j++)
      for (var i = Math.floor((e - M) / A.chunk); i <= Math.floor((e + M) / A.chunk); i++) out[bedKey(i, j)] = [i, j];
  });
  return out;
}
/** 模擬這一步可不可以走：每艘船 margin 內有檔的塊都載好了 ⇒ false；還沒 ⇒ 叫它載、回 true（畫面迴圈這一格先不走模擬）。 */
function bedWait() {
  if (!BED || !BED.A) return false;
  var near = bedNear(), wait = false;
  Object.keys(near).forEach(function (k) {
    var c = near[k], i = bedIdx(c[0], c[1]);
    if (i >= 0 && BED.has[i] && !BED.slot[i]) { bedLoad(c[0], c[1]); wait = true; }
  });
  if (wait) BED.miss++;
  return wait;
}
/** 焦點：還在打的船的中心（都沒了 ⇒ 鏡頭看的地方）。 */
function bedFocusAuto() {
  if (!BED || !BED.A) return;
  var x = 0, z = 0, n = 0;
  SHIPS.forEach(function (sh) { if (!sh.sunk) { x += sh.px; z += sh.pz; n++; } });
  if (!n) { x = CAM.eye[0]; z = CAM.eye[2]; n = 1; }
  bedFocus(x / n, z / n, false);
}
// 查詢：世界 (x, z) ⇒ 那一塊的取樣格（g：海域裡第幾個取樣點，含小數）
function bedCell(x, z) {
  var A = BED.A, gx = (x + BED.ax) / A.step, gz = (z + BED.az) / A.step, cx = Math.floor(gx / BED.G), cy = Math.floor(gz / BED.G), i = bedIdx(cx, cy);
  var C = i >= 0 ? BED.slot[i] : null;
  return C ? { C: C, u: gx - cx * BED.G, v: gz - cy * BED.G } : null;
}
/** 海底／地面高度（m；海面 0）。 */
function bedHgt(x, z) {
  var q = bedCell(x, z); if (!q) return BED.A.deep;
  var C = q.C, n = C.n, i = Math.min(n - 2, Math.floor(q.u)), j = Math.min(n - 2, Math.floor(q.v)), fu = q.u - i, fv = q.v - j, h = C.h, o = j * n + i;
  return ((h[o] * (1 - fu) + h[o + 1] * fu) * (1 - fv) + (h[o + n] * (1 - fu) + h[o + n + 1] * fu) * fv) / 10;
}
/** 底質（最近的取樣點）。 */
function bedMat(x, z) { var q = bedCell(x, z); if (!q) return BED_MAT.DEEP; var n = q.C.n; return q.C.mat[Math.min(n - 1, Math.round(q.v)) * n + Math.min(n - 1, Math.round(q.u))]; }
/** 坡度 [∂h/∂x, ∂h/∂z]（往高處）。 */
function bedGrad(x, z) { var e = BED.A.step; return [(bedHgt(x + e, z) - bedHgt(x - e, z)) / (2 * e), (bedHgt(x, z + e) - bedHgt(x, z - e)) / (2 * e)]; }

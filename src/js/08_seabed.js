// ───────────────────────── 海圖塊：陸地與海底（TASK-0721） ─────────────────────────
// Tim 2026-10-19：「讓地圖可以匯出到Blockside 在Blockside可以在海岸附近開戰(或小島) 然後地形也可以加入珊瑚礁 暗礁等海底地形 可以先定一出一套通用格式
//   (目前構想是1平方公里作為一格地圖 然後海戰時會載入附近9格地圖 …) 然後整體移動到另一格地圖格時重新載入另一格座標為中心的9格」
// 格式：src/MAP_CHUNK.md。一個海域 ＝ maps/<海域>/area.js（BSMAP.area）＋ 一塊一檔 maps/<海域>/<cx>_<cy>.js（BSMAP.chunk）；全是深海的塊沒有檔。
// 開法：?map=<海域>[&site=<第幾個開戰位置>] —— 世界原點（兩隊正中間）＝ 那個位置；沒給 ?map ⇒ BED ＝ null ⇒ 每一處都走原本那一條（戰局逐位元組不變）。
// 載入：焦點（還在打的船的中心）所在那一塊為中心、載 (2·(ring＋prefetch)＋1)² 塊（預設 5×5，其中 3×3 是「在用的」）；焦點走進別塊 ⇒ 換中心、載新的、丟太遠的。
//   ⛔ 模擬只讀載好的塊：每一步之前看每艘船 margin 公尺內的塊都載好了沒（bedWait）—— 沒有 ⇒ 這一步先不走（畫面迴圈）⇒ 戰局跟載入快慢無關。
//   快轉、無頭（?demo）沒有畫面迴圈可以等 ⇒ 開戰前整個海域一次載完（bedBoot）。
// 查詢（模擬用）：bedHgt(x, z) 海底／地面高度（m，海面 0、水下是負的；雙線性）、bedMat(x, z) 底質（BED_MAT）、bedGrad(x, z) 坡度。海域外、深海塊 ⇒ 深海 area.deep。
// 大漩渦（08_sea.js VX；Tim 2026-10-19：「漏斗內當深海、外面照海圖」）：漏斗的水面深到 −200 m 以下、海圖的深海才 −150 m ⇒ 以前船在漏斗裡每一步都判擱淺、被拆格。
//   解碼時（bedVxBake）把漩渦烤進每一塊的高度：h' ＝ vxH ＋ w·h ＋ (1 − w)·deep —— 離中心 BED_VX_IN·r 以內 w ＝ 0（那一點的水面下 |deep|，底質當深海）、
//   BED_VX_OUT·r 以外 w ＝ 1（水面下幾公尺照海圖；地形跟著漏斗的尾巴一起往下移，離中心 3 km 只移不到 2 m）、中間平滑接上。
//   ⇒ 模擬（擱淺、砲彈打到海底、艦長避淺、錨）跟畫面（海底網格、白沫、樹）讀的是同一份，不用各自改。原始高度留在 C.h0／C.mat0；換天氣（vxInit）⇒ bedVxSync 重烤。
//   沒有漩渦 ⇒ C.h 就是解碼的那一份（戰局逐位元組不變）。⚠ 遠景的粗塊建完網格就丟資料 ⇒ 開戰後才換天氣的話，遠景照舊（離中心 ≥ 2.5 km，漩渦在那裡只差幾公尺）。
var BED = null;
var BED_VX_IN = 1.5, BED_VX_OUT = 2.5;                                   // 漩渦半徑 r 的幾倍：以內全是深海、以外全照海圖
var BED_MAT = { DEEP: 0, SAND: 1, REEF: 2, SHOAL: 3, ROCK: 4, BEACH: 10, LAND: 11, CLIFF: 12 };
var BED_CFG = Object.assign({ ring: 1, prefetch: 1, margin: 300 }, CFG.map || {});   // config/game.json map：在用幾圈、多預載幾圈、船旁邊多少公尺內一定要載好
window.BSMAP = {                                                         // 海圖檔（<script>）載進來呼叫這兩支（?map=@host ⇒ 收到外面那一頁回的也照樣叫）
  area: function (o) { if (BED && (BED.host || BED.wantArea === o.id)) BED.gotArea = o; },
  town: function (o) { if (BED && BED.A) TOWNS.pend.push(o); },          // maps/<海域>/towns.js：一座城一筆（63_towns.js townWant 讀完一起收）
  chunk: function (id, cx, cy, b64, coarse) { if (!BED || !BED.A || BED.A.id !== id) return; var k = bedKey(cx, cy), w = BED.pend[k], v = BED.peek[k]; if (w && !coarse) w(b64); if (v) v(b64); }   // coarse：粗的遠景塊 ⇒ 只給遠景（⛔ 不進模擬）
};
function bedKey(cx, cy) { return cx + '_' + cy; }
function bedScript(src) {
  return new Promise(function (ok, bad) {
    var s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = function () { s.remove(); ok(); }; s.onerror = function () { s.remove(); bad(new Error('載不到 ' + src)); };
    document.head.appendChild(s);
  });
}
// ?map=@host：海圖不讀檔，跟開這一頁的那一頁要（Blocksail 地球儀「就地開戰」：iframe 的父頁或 window.open 的開啟者，照世界地圖當場生成）。
//   這一頁 ⇒ 那一頁：{ bsmap: 'need', what: 'area' | 'chunk', cx, cy, peek }（peek ＝ 遠景要的，可以晚一點）
//   那一頁 ⇒ 這一頁：{ bsmap: 'area', area }、{ bsmap: 'chunk', cx, cy, b64, coarse? }（跟檔案裡 BSMAP.area／BSMAP.chunk 的參數一樣；coarse ＝ 回 peek 的粗塊，只給遠景）、{ bsmap: 'error', what, cx, cy, msg }
//   轉場（03_camera.js camTrans）：這一頁 ⇒ 那一頁 'started'（開戰了、鏡頭停在正上方）、'left'（拉到正上方了；x、z ＝ 我艦在世界的哪裡、shipHdg ＝ 我艦船頭朝哪）；
//                                兩個都帶 hdg ＝ 正上方那一張畫面上方朝哪（度，北 0 順時針）⇒ 地球儀轉過來對齊海岸線；
//                                那一頁 ⇒ 這一頁 'go'（地球儀淡進來了 ⇒ 降下去）、'leave'（要回地球儀 ⇒ 拉上去）
//   城鎮（area.towns 有才要；63_towns.js）：這一頁 ⇒ 那一頁 { bsmap: 'need', what: 'towns' }；那一頁 ⇒ 這一頁 { bsmap: 'towns', towns: [規劃…] }（出錯 { bsmap: 'error', what: 'towns', msg }）
//   只收 BED.host 送來的訊息。
function bedGet(cx, cy, peek) {                                          // cx ＝ null ⇒ area.js
  if (!BED.host) return bedScript(cx == null ? 'maps/' + BED.wantArea + '/area.js' : 'maps/' + BED.A.id + '/' + bedKey(cx, cy) + '.js');
  return new Promise(function (ok, bad) {
    var k = cx == null ? 'area' : bedKey(cx, cy) + (peek ? '+' : '');
    (BED.ask[k] = BED.ask[k] || []).push([ok, bad]);
    BED.host.postMessage({ bsmap: 'need', what: cx == null ? 'area' : 'chunk', cx: cx, cy: cy, peek: !!peek }, '*');
  });
}
function bedHostMsg(e) {
  var d = e.data; if (!BED || !BED.host || e.source !== BED.host || !d || !d.bsmap) return;
  var ks = d.bsmap === 'area' || d.what === 'area' ? ['area'] : d.coarse ? [bedKey(d.cx, d.cy) + '+'] : [bedKey(d.cx, d.cy), bedKey(d.cx, d.cy) + '+'], err = d.bsmap === 'error' ? new Error('海圖：' + (d.msg || '要不到')) : null;
  if (d.bsmap === 'go' || d.bsmap === 'leave') { camTransSet(d.bsmap === 'go' ? 'go' : 'out'); return; }
  if (d.bsmap === 'towns' || (d.bsmap === 'error' && d.what === 'towns')) { townGot(d.towns || [], d.msg); return; }   // 城鎮規劃（63_towns.js；只給人看 ⇒ 不等它）
  if (d.bsmap === 'area') BSMAP.area(d.area);
  else if (d.bsmap === 'chunk' && BED.A) BSMAP.chunk(BED.A.id, d.cx, d.cy, d.b64, !!d.coarse);
  ks.forEach(function (k) { var L = BED.ask[k]; delete BED.ask[k]; (L || []).forEach(function (f) { if (err) f[1](err); else f[0](); }); });
}
/** 告訴外面那一頁（只有 ?map=@host）：'started' ＝ 開戰了（鏡頭停在正上方）、'left' ＝ 拉到正上方了 —— 畫好兩格才送（地球儀照這個淡進／淡出）。 */
function bedHostSay(what, o) {
  if (!BED || !BED.host) return;
  requestAnimationFrame(function () { requestAnimationFrame(function () { BED.host.postMessage(Object.assign({ bsmap: what }, (typeof o === 'function' ? o() : o) || {}), '*'); }); });   // o 可以是函式：送的那一刻才算
}
/** 開機（90_main.js 跟船一起等）：有 ?map ⇒ 讀海域、定原點；快轉／無頭 ⇒ 整個海域載完，不然 ⇒ 開戰位置附近先載好。 */
function bedBoot() {
  var id = Q.get('map'); if (!id) return Promise.resolve();
  var host = id === '@host' ? (window.parent !== window ? window.parent : window.opener) : null;
  if (id === '@host' && !host) return Promise.reject(new Error('?map=@host 要開在 Blocksail 的頁面裡（iframe 或 window.open）'));
  if (!host && !/^[a-z0-9_-]+$/.test(id)) return Promise.reject(new Error('海域名稱只能是小寫英數、底線、連字號：' + id));
  BED = { wantArea: id, host: host, ask: {}, A: null, ch: {}, pend: {}, peek: {}, idx: null, cx: null, cy: null, top: -Infinity, miss: 0, loads: 0, drops: 0 };
  if (host) window.addEventListener('message', bedHostMsg);
  return bedGet(null).then(function () {
    var A = BED.gotArea; if (!A) throw new Error((host ? '外面那一頁' : 'maps/' + id + '/area.js') + ' 沒有給 BSMAP.area');
    BED.A = A; BED.G = A.chunk / A.step; BED.n = A.n; BED.nx = A.x[1] - A.x[0] + 1;
    BED.has = new Uint8Array(BED.nx * (A.y[1] - A.y[0] + 1));            // 這一塊有沒有檔（0 ＝ 深海或海域外）
    A.chunks.forEach(function (c) { var i = bedIdx(c[0], c[1]); if (i >= 0) BED.has[i] = c[2] ? 1 : 0; });
    BED.slot = new Array(BED.has.length);                                // 載好的塊照編號放（查詢不用字串）
    var si = Math.max(0, Math.min((A.sites || []).length - 1, +(Q.get('site') || 0) | 0)), S0 = (A.sites || [])[si];
    BED.site = si; BED.ax = S0 ? S0.x : (A.x[0] + A.x[1] + 1) * A.chunk / 2; BED.az = S0 ? S0.y : (A.y[0] + A.y[1] + 1) * A.chunk / 2;   // 世界原點在海域的哪裡（往東、往南公尺）
    townWant();                                                          // 海域有城（area.towns）⇒ 去要規劃（63_towns.js；只給人看、不等它、無頭不要）
    if (DEMO >= 0 || HEADLESS) return Promise.all(A.chunks.filter(function (c) { return c[2]; }).map(function (c) { return bedLoad(c[0], c[1]); }));
    return bedFocus(0, 0, true);
  });
}
function bedIdx(cx, cy) { var A = BED.A, i = cx - A.x[0], j = cy - A.y[0]; return i < 0 || j < 0 || i >= BED.nx || cy > A.y[1] ? -1 : j * BED.nx + i; }
function bedLoad(cx, cy) {
  var k = bedKey(cx, cy), i = bedIdx(cx, cy);
  if (i < 0 || !BED.has[i] || BED.slot[i] || BED.pend[k]) return BED.pend[k] ? BED.pend[k].p : Promise.resolve();
  var w = function (b64) { if (BED.slot[i]) return; var C = bedDecode(b64);   // 已經有了（遠景讀同一塊的那一份檔也會叫到這裡）⇒ 不重來 if (C.cx !== cx || C.cy !== cy) throw new Error('海圖塊 ' + k + ' 的檔頭寫的是 ' + C.cx + '_' + C.cy);
    BED.slot[i] = C; BED.ch[k] = C; BED.top = Math.max(BED.top, C.max); BED.loads++; evEmit('bedChunk', cx, cy, C); };
  BED.pend[k] = w;
  w.p = bedGet(cx, cy).then(function () { delete BED.pend[k]; }, function (e) { delete BED.pend[k]; throw e; });
  return w.p;
}
/** 只給畫面（63_bed_gl.js 遠景）：讀一塊的檔、交回 base64 —— ⛔ 不放進 BED.slot／BED.ch（模擬照舊只查 bedLoad 載的、照船旁邊 margin 等）。 */
function bedPeek(cx, cy) {
  var k = bedKey(cx, cy);
  return new Promise(function (ok, bad) {
    BED.peek[k] = function (b64) { delete BED.peek[k]; ok(b64); };
    bedGet(cx, cy, true).then(function () { if (BED.peek[k]) { delete BED.peek[k]; bad(new Error('海圖塊 ' + k + ' 沒有呼叫 BSMAP.chunk')); } }, function (e) { delete BED.peek[k]; bad(e); });
  });
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
  var fo = null, foN = 0, vg = null, vgN = 0;                            // 選用的段（MAP_CHUNK.md §4）：1 ＝ 林地覆蓋、2 ＝ 植被（每點長得出哪幾種，位元 ＝ area.vis）；不認得的記號 ⇒ 停（之後的段讀不了）
  while (p < b.length) {
    var tg = u(); if (tg !== 1 && tg !== 2) break;
    var sn = u(), sa = tg === 1 ? new Uint8Array(sn * sn) : new Uint32Array(sn * sn);   // 植被：一點最多 32 種（2026-10-19 第三批之後超過 16）
    for (k = 0; k < sa.length;) { v = u(); c = u(); sa.fill(v, k, k + c); k += c; }
    if (tg === 1) { fo = sa; foN = sn; } else { vg = sa; vgN = sn; }
  }
  var C = { cx: cx, cy: cy, n: n, step: step, h: h, mat: mat, h0: h, mat0: mat, min: mn / 10, max: mx / 10, min0: mn / 10, max0: mx / 10, fo: fo, foN: foN, vg: vg, vgN: vgN, vxk: 'none' };
  bedVxBake(C);
  return C;
}
/** 現在的漩渦（沒有 ⇒ 'none'）：烤過的塊記著它，變了才重烤。 */
function bedVxKey() { return VX ? [VX.rv, VX.rc2, VX.D, VX.De, VX.re2].join(',') : 'none'; }
/** 把漩渦烤進一塊的高度與底質（上面的說明）；沒有漩渦 ⇒ 換回原始的那一份。 */
function bedVxBake(C) {
  var key = bedVxKey(); if (C.vxk === key) return false;
  C.vxk = key;
  if (!VX || !BED || !BED.A) { C.h = C.h0; C.mat = C.mat0; C.min = C.min0; C.max = C.max0; return true; }
  var A = BED.A, n = C.n, N = n * n, h = new Int16Array(N), mat = new Uint8Array(C.mat0), mn = 1e9, mx = -1e9;
  var ox = C.cx * A.chunk - BED.ax, oz = C.cy * A.chunk - BED.az, r0 = BED_VX_IN * VX.rv, r1 = BED_VX_OUT * VX.rv;
  for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
    var o = j * n + i, x = ox + i * C.step, z = oz + j * C.step, w = bedSmooth(r0, r1, Math.hypot(x, z));
    var v = Math.round((vxH(x, z) + w * C.h0[o] / 10 + (1 - w) * A.deep) * 10);
    h[o] = Math.max(-32768, Math.min(32767, v)); if (w < 0.5) mat[o] = BED_MAT.DEEP;
    if (h[o] < mn) mn = h[o]; if (h[o] > mx) mx = h[o];
  }
  C.h = h; C.mat = mat; C.min = mn / 10; C.max = mx / 10;
  return true;
}
/** smoothstep（a ⇒ 0、b ⇒ 1）。 */
function bedSmooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
/** 換了天氣（08_sea.js vxInit 叫）：載好的塊照新的漩渦重烤；有變 ⇒ 重算 BED.top、再發一次 'bedChunk'（海底網格、白沫、樹照新的高度重建）。 */
function bedVxSync() {
  if (!BED || !BED.A || !BED.slot) return;
  var re = [];
  BED.slot.forEach(function (C) { if (C && bedVxBake(C)) re.push(C); });
  if (!re.length) return;
  BED.top = -Infinity; BED.slot.forEach(function (C) { if (C) BED.top = Math.max(BED.top, C.max); });
  re.forEach(function (C) { evEmit('bedChunk', C.cx, C.cy, C); });
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
  var q = bedCell(x, z); if (!q) return BED.A.deep + (VX ? vxH(x, z) : 0);   // 大漩渦：深海也在那一點的水面下（bedVxBake）
  var C = q.C, n = C.n, i = Math.min(n - 2, Math.floor(q.u)), j = Math.min(n - 2, Math.floor(q.v)), fu = q.u - i, fv = q.v - j, h = C.h, o = j * n + i;
  return ((h[o] * (1 - fu) + h[o + 1] * fu) * (1 - fv) + (h[o + n] * (1 - fu) + h[o + n + 1] * fu) * fv) / 10;
}
/** 底質（最近的取樣點）。 */
function bedMat(x, z) { var q = bedCell(x, z); if (!q) return BED_MAT.DEEP; var n = q.C.n; return q.C.mat[Math.min(n - 1, Math.round(q.v)) * n + Math.min(n - 1, Math.round(q.u))]; }
/** 坡度 [∂h/∂x, ∂h/∂z]（往高處）。 */
function bedGrad(x, z) { var e = BED.A.step; return [(bedHgt(x + e, z) - bedHgt(x - e, z)) / (2 * e), (bedHgt(x, z + e) - bedHgt(x, z - e)) / (2 * e)]; }

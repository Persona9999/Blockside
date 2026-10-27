// ───────────────────────── 樓梯自檢（TASK-0838；Tim 2026-10-23「松島號甲板下的樓梯都有偏移現象(有個洞) 且還有樓梯口被堵死…確保出口正常 並輸出錯誤報告可以提供修正參考」）─────────────────────────
// 匯入檢查（75_shipcheck.js）開戰量完之後叫：每一座梯子（關聯 meta kind=ladders 的 foot／lo／hi／head；繩梯不量 —— 踏板是繩、頂端在桅上）逐座量三樣：
//   ① 梯口的洞：head 腳下那一層（head z − 1）裡、梯子頂上那一塊四周封閉的空格 ＝ 開口；開口裡底下沒有這座梯子的格、往下掉超過 LDC_FALL 格 ＝ 洞。
//      洞在梯頂那一頭（沿梯子的走向）⇒ 兩個修法都量過再建議：整座往那邊挪幾格（撞幾格、挪完還剩幾格洞、挪過去的 head 走不走得出去）、那幾格補甲板。
//      head 踩在洞上 ⇒ ✗；整座挪 LDC_GAP 格以上就蓋得掉一半以上的洞（梯子偏了：沿走向、橫向各試 ±LDC_TRY 格）⇒ ⚠；其他（艙口本來就比梯子寬、一格的縫）只寫進開口那一欄、不報。
//      開口連到外面（梯子靠在甲板邊上：艏樓後緣、艦橋側面）⇒ 沒有開口、不量洞。
//   ② 兩端站不站得住：foot／head 腳下那一格是不是實心（懸空；踩在別座的洞上 ⇒ 點名那一座）、頭上 NAV_HEAD 格空不空、
//      離那一層甲板的地板（meta floor／walk）差幾格（> NAV_DZ ⇒ 沒到甲板面）。
//   ③ 兩端走不走得出去：每一座的洞先當成補好了（洞 ① 報過；這裡量的是補好之後還有沒有別的東西堵住），從 foot／head 起（站不住 ⇒ LDC_SNAP 格內最近站得住的一格）
//      照走路格的規則一格一格走（頭上 NAV_HEAD 格空、高低差 ≤ NAV_DZ、不在砲與家具裡、不踩任何一座梯子的格），LDC_WALK 格內走得到離起點 LDC_OUT 格以上、那一層的走路格
//      （42_hands.js navBuild 能走的點）才算出得去；走不到 ⇒ 報出口前方擋住的是什麼（哪幾格、屬於哪條關聯、哪座梯子、哪個模型）。
//   ④ 梯頂接不上甲板：hi（最上面那一階）到 head 那一段，梯子寬度裡腳下上下 NAV_DZ 格內沒有踩得到的面（實心、上面空）、連續 LDC_GAP_ERR 柱以上 ⇒ ✗、LDC_GAP～LDC_GAP_ERR−1 柱 ⇒ ⚠（艙口梯子梯頂到艙口邊的小縫；康塞普西翁號船樓的梯子：梯頂停在半空離艙壁 4～7 格，① ② ③ 都看不到）。
//   ⛔ 尋路（42_hands.js makeHands）接梯子兩頭是在 5～10 點內找走路格 ⇒ 洞、堵住的出口它都接得上，只看「尋路沒收這一座」那一條看不出來（松島號 15 座全收、11 座 head 踩在洞上）。
// 只讀：家具擺好之後量；CREW_BLOCK 換成這艘的、量完換回去 ⇒ 戰局一位元不動（只有 ?shipcheck 叫）。
// 結果：[{ name, decks: [foot 那層, head 那層], axis, open, hole, issues: [{ lv, what, msg, fix }], map: [字串…] }]；admin.py 寫成 reports/ladcheck_<船>.md。
var LDC_GAP = 2, LDC_GAP_ERR = 4, LDC_TRY = 8, LDC_OUT = 4, LDC_R = 30, LDC_OPEN_MAX = 2500, LDC_WALK = 24, LDC_SNAP = 3, LDC_FALL = 3, LDC_NEAR = 12, LDC_MAPW = 64, LDC_MAPH = 28;
/** 量這艘的每一座梯子（繩梯除外）。 */
function ladCheck(sh) {
  var T = sh.T, g = navBase(T), cb = CREW_BLOCK, lads = shipLadders(T).filter(function (l) { return !l.rope; }), out = [];
  CREW_BLOCK = crewBlockOf(sh);
  try {
    var own = ldcCells(T, g, lads), who = {};
    own.forEach(function (o, k) { for (var key in o.set) who[key] = k; });
    var K = { lads: lads, own: own, all: { set: who }, O: lads.map(function (l, k) { return ldcOpen(T, g, l, own[k]); }) };   // all：每一座梯子的格（站的時候都不算地板）；O：① 每座的開口與洞
    K.gf = ldcFilled(g, K.O, -1);                                        // 洞都補上的格子：③ 照它走
    lads.forEach(function (l, k) { out.push(ldcOne(sh, g, K, k)); });
  } finally { CREW_BLOCK = cb; }
  return out;
}
/** 反向對照（75_shipcheck.js 照 ?ladtest=<梯名>:<做法> 叫；開戰前、只改記憶體裡這一型的格子與固定點，⛔ 不寫回任何檔）：
 *    shift:dx,dy ＝ 那一座整座（格子＋四個點）挪 (dx, dy) 格；cut:n ＝ 靠 head 那一頭 n 柱的格拿掉（點不動）；pillar ＝ head 正前方第 2 格立一根 NAV_HEAD 格高的柱子；
 *    box ＝ head 四周（離 2～3 格那兩圈，梯口那幾柱除外）圍 NAV_HEAD 格高的牆（出口整個堵死）；
 *    drop ＝ ⑤ ⑥ 甲板連通當成沒有這一座（格子、點都不動；deckLink 不走它的邊）。⇒ 讀數一行（改了什麼）。 */
function ladTest(T, spec) {
  var a = String(spec).split(':'), lads = shipLadders(T).filter(function (l) { return !l.rope; }), g = T.base, k = -1;
  lads.forEach(function (l, i) { if (k < 0 && (l.name === a[0] || l.name.slice(-a[0].length - 1) === '/' + a[0])) k = i; });
  if (k < 0) return '找不到梯子 ' + a[0];
  if (a[1] === 'drop') { T.dlkDrop = lads[k].name; return lads[k].name + ' 在甲板連通（⑤ ⑥）裡當成沒有'; }
  var l = lads[k], C = ldcCells(T, g, lads)[k], O = ldcOpen(T, g, l, C), H = O.H, mat = g.get(H[0], H[1], H[2] - 1) || 1, n = 0;
  if (a[1] === 'shift') {
    var d = (a[2] || '0,0').split(',').map(Number), v = {}, part = (T.h.parts || []).filter(function (q) { return q.path === l.part; })[0], nm = l.name === l.part ? '' : l.name.slice(l.part.length + 1);
    Object.keys(C.set).forEach(function (kk) { kk = +kk; var z = Math.floor(kk / (g.sx * g.sy)), r = kk - z * g.sx * g.sy, y = Math.floor(r / g.sx), x = r - y * g.sx; v[kk] = [x, y, z, g.get(x, y, z)]; g.set(x, y, z, 0); });
    Object.keys(v).forEach(function (kk) { var c = v[kk]; g.set(c[0] + d[0], c[1] + d[1], c[2], c[3]); n++; });
    Object.keys(part.points).forEach(function (pk) { var i = pk.lastIndexOf('.'); if ((i < 0 ? '' : pk.slice(0, i)) !== nm) return; var q = part.points[pk]; part.points[pk] = [q[0] + d[0], q[1] + d[1], q[2]]; });
    var L = ladCells(T, l.part), out = [];                               // 格子清單（46_carpenter.js 的快取）也換成挪過去的
    for (var i = 0; i < L.length; i += 3) { var kk = ldcKey(g, L[i], L[i + 1], L[i + 2]), m = v[kk] !== undefined; out.push(L[i] + (m ? d[0] : 0), L[i + 1] + (m ? d[1] : 0), L[i + 2]); }
    T.ladCells[l.part] = new Int16Array(out);
    return l.name + ' 整座挪 (' + d.join(', ') + ') 格（' + n + ' 格＋固定點）';
  }
  var ax = O.ax < 0 ? 0 : O.ax, sg = O.sg || 1, cols = [];
  if (a[1] === 'cut') {                                                  // cut:n ＝ 梯子靠 head 那一頭 n 柱的格拿掉（④ 梯頂接不上甲板）；四個點不動
    var nc = +(a[2] || 3), top = -1e9, cut = {};
    Object.keys(C.set).forEach(function (kk) { kk = +kk; var z = Math.floor(kk / (g.sx * g.sy)), r = kk - z * g.sx * g.sy, y = Math.floor(r / g.sx), x = r - y * g.sx; top = Math.max(top, sg * (ax ? y : x)); });
    Object.keys(C.set).forEach(function (kk) { kk = +kk; var z = Math.floor(kk / (g.sx * g.sy)), r = kk - z * g.sx * g.sy, y = Math.floor(r / g.sx), x = r - y * g.sx; if (sg * (ax ? y : x) > top - nc) { g.set(x, y, z, 0); cut[kk] = 1; n++; } });
    var L2 = ladCells(T, l.part), o2 = [];
    for (var j = 0; j < L2.length; j += 3) if (!cut[ldcKey(g, L2[j], L2[j + 1], L2[j + 2])]) o2.push(L2[j], L2[j + 1], L2[j + 2]);
    T.ladCells[l.part] = new Int16Array(o2);
    return l.name + ' 靠 head 那一頭 ' + nc + ' 柱的格拿掉（' + n + ' 格）';
  }
  if (a[1] === 'pillar') cols.push([H[0] + (ax ? 0 : 2 * sg), H[1] + (ax ? 2 * sg : 0)]);
  else if (a[1] === 'box') { var oc = {}; O.cells.forEach(function (c) { oc[c[0] + g.sx * c[1]] = 1; });
    for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) >= 2 && !oc[H[0] + dx + g.sx * (H[1] + dy)]) cols.push([H[0] + dx, H[1] + dy]); }   // 兩格厚（⛔ 一格厚 ⇒ 走路格每 2 格一點，跨得過去）；梯口（開口）那幾柱不圍
  else return '不認得的做法 ' + a[1] + '（shift:dx,dy｜cut:n｜pillar｜box｜drop）';
  cols.forEach(function (c) { for (var h = 0; h < NAV_HEAD; h++) if (!g.get(c[0], c[1], H[2] + h)) { g.set(c[0], c[1], H[2] + h, mat); n++; } });
  return l.name + ' 的 head ' + ldcAt(H) + (a[1] === 'pillar' ? ' 正前方第 2 格立一根柱子' : ' 四周圍一圈牆') + '（' + cols.length + ' 柱、' + n + ' 格）';
}
/** 一行讀數：量幾座、幾座有問題（✗／⚠ 各幾座）。 */
function ladSummary(L) {
  if (!L.length) return '沒有梯子';
  var e = L.filter(function (r) { return r.issues.some(function (i) { return i.lv === 'error'; }); }).length, w = L.filter(function (r) { return r.issues.length && !r.issues.some(function (i) { return i.lv === 'error'; }); }).length;
  return L.length + ' 座：' + (e + w ? '✗ ' + e + ' 座、⚠ ' + w + ' 座、✓ ' + (L.length - e - w) + ' 座' : '全部 ✓') + '（梯口的洞、兩端站不站得住、走不走得出去；繩梯不量）';
}
function ldcKey(g, x, y, z) { return x + g.sx * (y + g.sy * z); }
function ldcRng(a) { return a[0] === a[1] ? '' + a[0] : a[0] + '–' + a[1]; }
function ldcAt(P) { return '（' + P[0] + ', ' + P[1] + ', ' + P[2] + '）'; }
/** p 離折線 P（foot、lo、hi、head）多遠（格）。 */
function ldcSegD(p, P) {
  var best = 1e9;
  for (var i = 0; i + 1 < P.length; i++) {
    var a = P[i], b = P[i + 1], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    var t = dd ? clamp(((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / dd, 0, 1) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t, p[2] - a[2] - d[2] * t));
  }
  return best;
}
/** 每座梯子自己的格：那一件關聯的格子清單（parts[].cellRuns，46_carpenter.js ladCells）分給最近的那一座（LDC_NEAR 格內）；
 *  沒有格子清單 ⇒ lo～hi 底下 3 格內的實心格（估的：est）。⇒ [{ set: { 鍵: 1 }, cols: { x+sx*y: [zmin, zmax] }, n, est }]。 */
function ldcCells(T, g, lads) {
  var out = lads.map(function () { return { set: {}, cols: {}, n: 0, est: false }; });
  function put(o, x, y, z) {
    o.set[ldcKey(g, x, y, z)] = 1; o.n++;
    var c = x + g.sx * y, v = o.cols[c]; if (!v) o.cols[c] = [z, z]; else { v[0] = Math.min(v[0], z); v[1] = Math.max(v[1], z); }
  }
  var byPart = {};
  lads.forEach(function (l, k) { (byPart[l.part] = byPart[l.part] || []).push(k); });
  Object.keys(byPart).forEach(function (part) {
    var ks = byPart[part], C = ladCells(T, part);
    if (C) {
      for (var i = 0; i < C.length; i += 3) {
        var p = [C[i] + 0.5, C[i + 1] + 0.5, C[i + 2] + 1], bk = -1, bd = LDC_NEAR;
        ks.forEach(function (k) { var d = ldcSegD(p, lads[k].pts); if (d <= bd) { bd = d; bk = k; } });
        if (bk >= 0) put(out[bk], C[i], C[i + 1], C[i + 2]);
      }
    }
    ks.forEach(function (k) {
      if (C && out[k].n) return;
      var P = lads[k].pts, lo = P[1] || P[0], hi = P[P.length - 2] || P[P.length - 1], o = out[k]; o.est = true;
      var x0 = Math.floor(Math.min(lo[0], hi[0])) - 3, x1 = Math.floor(Math.max(lo[0], hi[0])) + 3, y0 = Math.floor(Math.min(lo[1], hi[1])) - 3, y1 = Math.floor(Math.max(lo[1], hi[1])) + 3, z0 = Math.min(lo[2], hi[2]) - 4, z1 = Math.max(lo[2], hi[2]);
      for (var z = Math.max(0, z0); z <= z1; z++) for (var y = Math.max(0, y0); y <= y1; y++) for (var x = Math.max(0, x0); x <= x1; x++)
        if (g.get(x, y, z) && ldcSegD([x + 0.5, y + 0.5, z + 1], [lo, hi]) <= 3) put(o, x, y, z);
    });
  });
  return out;
}
/** ① 一座的幾何與開口：foot／head（格）、走向、兩端的甲板、開口（head 腳下那一層 zt 裡梯子頂上那一塊封閉的空格）、洞。 */
function ldcOpen(T, g, l, C) {
  var f = l.pts[0], h = l.pts[l.pts.length - 1], F = [Math.floor(f[0]), Math.floor(f[1]), f[2]], H = [Math.floor(h[0]), Math.floor(h[1]), h[2]];
  var dx = H[0] - F[0], dy = H[1] - F[1], ax = Math.abs(dx) >= Math.abs(dy) ? (Math.abs(dx) >= 2 ? 0 : -1) : (Math.abs(dy) >= 2 ? 1 : -1), sg = ax < 0 ? 0 : (ax ? dy : dx) > 0 ? 1 : -1;
  var dk = ladDecks(T, l), O = { F: F, H: H, ax: ax, sg: sg, dirN: ax < 0 ? '' : (sg > 0 ? '+' : '−') + 'xy'[ax], dk: dk, zt: H[2] - 1, th: dk && dk[1] ? dk[1].thick : 5, cells: [], leak: false, HO: [], hs: {} };
  var zt = O.zt, seeds = [], ok = {}, xs = [1e9, -1e9], ys = [1e9, -1e9];
  O.inLad = function (x, y, z) { return !!C.set[ldcKey(g, x, y, z)]; };
  function open(x, y) { return x >= 0 && y >= 0 && x < g.sx && y < g.sy && (!g.get(x, y, zt) || O.inLad(x, y, zt)); }
  O.cov = function (x, y, o) { var v = C.cols[(x - (o ? o[0] : 0)) + g.sx * (y - (o ? o[1] : 0))]; return !!v && v[0] <= zt; };   // 這一柱底下有這座梯子的格（o：挪過去的量）
  O.fall = function (x, y) { var n = 0; while (n < 60 && zt - 1 - n >= 0 && !g.get(x, y, zt - 1 - n)) n++; return n; };
  O.holes = function (o) { return O.cells.filter(function (c) { return !O.cov(c[0], c[1], o) && !O.inLad(c[0], c[1], zt) && O.fall(c[0], c[1]) > LDC_FALL; }); };
  Object.keys(C.cols).forEach(function (c) { c = +c; var x = c % g.sx, y = (c - x) / g.sx; if (C.cols[c][0] <= zt && open(x, y)) seeds.push([x, y]); });
  if (open(H[0], H[1])) seeds.push([H[0], H[1]]);
  O.seeds = seeds.length;
  seeds.forEach(function (s) { xs = [Math.min(xs[0], s[0]), Math.max(xs[1], s[0])]; ys = [Math.min(ys[0], s[1]), Math.max(ys[1], s[1])]; });
  var q = seeds.slice(); q.forEach(function (s) { ok[s[0] + g.sx * s[1]] = 1; });
  for (var qi = 0; qi < q.length && !O.leak; qi++) {
    var p = q[qi]; O.cells.push(p);
    if (O.cells.length > LDC_OPEN_MAX || p[0] <= xs[0] - LDC_R || p[0] >= xs[1] + LDC_R || p[1] <= ys[0] - LDC_R || p[1] >= ys[1] + LDC_R) O.leak = true;
    for (var d = 0; d < 4; d++) { var x = p[0] + NAV_DX[d], y = p[1] + NAV_DY[d], kk = x + g.sx * y; if (!ok[kk] && open(x, y)) { ok[kk] = 1; q.push([x, y]); } }
  }
  if (O.leak) O.cells = [];
  O.HO = O.holes(null); O.HO.forEach(function (c) { O.hs[c[0] + g.sx * c[1]] = 1; });
  return O;
}
/** 洞補上之後的格子（③ 照它走）：每一座（skip 那座除外）的洞、z 從 zt 往下 th 格當成實心。 */
function ldcFilled(g, O, skip) {
  var F = {}, n = 0;
  O.forEach(function (o, k) { if (k === skip) return; o.HO.forEach(function (c) { F[c[0] + g.sx * c[1]] = [o.zt - o.th + 1, o.zt]; n++; }); });
  if (!n) return g;
  return { sx: g.sx, sy: g.sy, sz: g.sz, get: function (x, y, z) { var v = F[x + g.sx * y]; return v && z >= v[0] && z <= v[1] ? 1 : g.get(x, y, z); } };
}
/** (x, y) 那一柱、z 上下 NAV_DZ 格裡離 z 最近、站得住的高度（腳下實心、頭上 NAV_HEAD 格空、腳下不是梯子的格（A.set）、不在砲與家具裡）；沒有 ⇒ -1。 */
function ldcStand(g, A, x, y, z) {
  if (x < 1 || y < 1 || x >= g.sx - 1 || y >= g.sy - 1) return -1;
  for (var d = 0; d <= NAV_DZ * 2; d++) {
    var zz = z + (d & 1 ? (d + 1) >> 1 : -(d >> 1)); if (zz < 1 || zz >= g.sz) continue;
    if (!g.get(x, y, zz - 1) || g.get(x, y, zz) || A.set[ldcKey(g, x, y, zz - 1)] !== undefined) continue;
    var ok = true; for (var h = 1; h < NAV_HEAD; h++) if (g.get(x, y, zz + h)) { ok = false; break; }
    if (ok && !blocked(x, y, zz)) return zz;
  }
  return -1;
}
/** ③ 從 P 起走得出去嗎：N ＝ 那一層的走路格（沒有 ⇒ 走得到 30 格以上就算）。⇒ { ok, at: 起點, n: 走到幾格, snap: 起點離 P 幾格, why }。 */
function ldcWalk(g, A, P, N) {
  var S = null, sd = 0;
  for (var r = 0; r <= LDC_SNAP && !S; r++) for (var dy = -r; dy <= r && !S; dy++) for (var dx = -r; dx <= r && !S; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    var z = ldcStand(g, A, P[0] + dx, P[1] + dy, P[2]); if (z >= 0) { S = [P[0] + dx, P[1] + dy, z]; sd = r; }
  }
  if (!S) return { ok: false, n: 0, why: 'stand' };
  var seen = {}, q = [S], n = 0; seen[S[0] + g.sx * S[1]] = 1;
  function goal(p) {                                                     // 離起點 LDC_OUT 格以上、落在那一層的走路格上（⛔ 只看走路格 ⇒ 起點旁的那一點就算：走路格每 2 格一點，一格厚的牆它跨得過去）
    if (!N) return n >= 30; if (Math.max(Math.abs(p[0] - S[0]), Math.abs(p[1] - S[1])) < LDC_OUT) return false;
    var i = navCell(N, [p[0] + 0.5, p[1] + 0.5, p[2]]); return i >= 0 && N.ok[i] && Math.abs(N.Z[i] - p[2]) <= NAV_DZ;
  }
  for (var k = 0; k < q.length; k++) {
    var p = q[k]; n++;
    if (goal(p)) return { ok: true, at: S, n: n, snap: sd };
    var st = [];
    for (var d = 0; d < 8; d++) {
      var x = p[0] + NAV_DX[d], y = p[1] + NAV_DY[d], key = x + g.sx * y;
      if (Math.abs(x - S[0]) > LDC_WALK || Math.abs(y - S[1]) > LDC_WALK) { st[d] = -1; continue; }
      var z2 = ldcStand(g, A, x, y, p[2]); st[d] = z2;
      if (z2 < 0 || Math.abs(z2 - p[2]) > NAV_DZ || seen[key]) continue;
      if (d >= 4 && (st[d === 4 || d === 5 ? 0 : 1] < 0 || st[d === 4 || d === 6 ? 2 : 3] < 0)) continue;   // 斜走切到角（同 navStep）
      seen[key] = 1; q.push([x, y, z2]);
    }
  }
  return { ok: false, at: S, n: n, snap: sd, why: 'walk' };
}
/** (x, y, z) 這一格是哪條關聯的：外框包得住的關聯裡最小的那條；最小的也大過半艘船 ⇒ 船殼／甲板。 */
function ldcPartAt(T, x, y, z) {
  var best = null, bv = 1e18, V = T.h.size[0] * T.h.size[1] * T.h.size[2];
  (T.h.parts || []).forEach(function (q) {
    var b = q.box; if (!b || b.length < 6 || x < b[0] || y < b[1] || z < b[2] || x > b[3] || y > b[4] || z > b[5]) return;
    var v = (b[3] - b[0] + 1) * (b[4] - b[1] + 1) * (b[5] - b[2] + 1); if (v < bv) { bv = v; best = q; }
  });
  return best && bv < V / 2 ? best.path : '船殼／甲板的格';
}
/** 出口走不出去時：P 往 dirs（[dx, dy]…）1～4 格、左右各 2 格，每一柱站不住的原因 ⇒ [{ who, n, x: [a, b], y: [a, b], z: [a, b], cells }]
 *  （擋住的東西：模型、別座梯子的格、關聯的實心格、沒有地板）。me ＝ 這一座的序號（自己的格不算擋）。 */
function ldcBlockers(T, g, K, me, P, dirs, km, sm) {
  var by = {}, who = K.all.set;
  function hit(nm, x, y, z, st) {
    var o = by[nm] || (by[nm] = { who: nm, n: 0, x: [x, x], y: [y, y], z: [z, z], cells: [], st: !!st });
    o.n++; o.x = [Math.min(o.x[0], x), Math.max(o.x[1], x)]; o.y = [Math.min(o.y[0], y), Math.max(o.y[1], y)]; o.z = [Math.min(o.z[0], z), Math.max(o.z[1], z)]; o.cells.push([x, y]);
  }
  dirs.forEach(function (D) {
    for (var k = 1; k <= (km || 4); k++) for (var s = -(sm === undefined ? 2 : sm); s <= (sm === undefined ? 2 : sm); s++) {
      var x = P[0] + D[0] * k + D[1] * s, y = P[1] + D[1] * k + D[0] * s, z = P[2];
      if (ldcStand(g, K.all, x, y, z) >= 0) continue;
      var m = CREW_BLOCK.filter(function (M) { var b = M.bb; return x >= Math.floor(b[0]) - 1 && x <= Math.ceil(b[3]) + 1 && y >= Math.floor(b[1]) - 1 && y <= Math.ceil(b[4]) + 1 && z >= b[2] - 3 && z <= b[5]; })[0];
      if (m && blocked(x, y, z)) { hit((m.station ? '取用點的火藥桶 ' : '模型 ') + (m.path || m.name), x, y, z, m.station); continue; }   // 取用點（23_powder.js）：遊戲擺的，不是雕刻作品
      var zs = -1, ow = -1;                                              // 站的那一格往上 NAV_HEAD 格裡的實心 ⇒ 擋住的格（牆、柱、甲板、別座梯子）
      for (var hh = 0; hh < NAV_HEAD && zs < 0; hh++) { var kk = ldcKey(g, x, y, z + hh); if (g.get(x, y, z + hh) && who[kk] !== me) { zs = z + hh; ow = who[kk] === undefined ? -1 : who[kk]; } }
      if (zs >= 0) { hit(ow >= 0 ? K.lads[ow].name + ' 的踏板' : ldcPartAt(T, x, y, zs), x, y, zs); continue; }
      var w = who[ldcKey(g, x, y, z - 1)]; if (w === me) continue;      // 自己的踏板：不算擋
      if (w !== undefined) { hit(K.lads[w].name + ' 的踏板', x, y, z - 1); continue; }
      var fl = false; for (var b2 = 1; b2 <= NAV_DZ + 1; b2++) if (g.get(x, y, z - b2)) { fl = true; break; }
      if (!fl) hit('沒有地板（開口、船外）', x, y, z - 1);
    }
  });
  return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.n - a.n; });
}
/** 量一座（② ③，① 的開口與洞已經在 K.O[k]）。 */
function ldcOne(sh, g, K, me) {
  var T = sh.T, NV = sh.nav, l = K.lads[me], C = K.own[me], O = K.O[me], F = O.F, H = O.H, dk = O.dk, ax = O.ax, sg = O.sg, dirN = O.dirN, zt = O.zt, HO = O.HO;
  var R = { name: l.name, issues: [], map: [], cells: C.n, est: C.est }, X = [];
  function add(lv, what, msg, fix) { R.issues.push({ lv: lv, what: what, msg: msg, fix: fix }); }
  R.axis = ax < 0 ? '直上直下' : '梯頂往 ' + dirN;
  R.decks = dk ? [dk[0] ? dk[0].name : '（判不出）', dk[1] ? dk[1].name : '（判不出）'] : null;
  var NL = NV ? NV.ladders.filter(function (L) { return L.name === l.name; })[0] : null;
  function lvN(k, P) { var li = NL ? (k ? NL.hi : NL.lo) : dk && dk[k] ? dk[k].i : NV ? lvOf(NV.levels, P[2]) : -1; return NV && li >= 0 && NV.levels[li] ? NV.levels[li].N : null; }
  function onHole(P) { for (var j = 0; j < K.O.length; j++) if (j !== me && K.O[j].zt === P[2] - 1 && K.O[j].hs[P[0] + g.sx * P[1]]) return K.lads[j].name; return null; }   // 踩在別座的洞上
  if (C.est) add('warn', '格子清單', '梯子那件關聯沒有格子清單（parts[].cellRuns）⇒ 梯子的格照 lo～hi 底下 3 格內的實心格估', 'python -I admin.py cells --id ' + T.id);
  // ── ② 兩端站不站得住、到不到甲板面 ──
  var E = { foot: { P: F, k: 0, nm: '梯腳 foot', fall: 0 }, head: { P: H, k: 1, nm: '梯頂 head', fall: 0 } };
  ['foot', 'head'].forEach(function (key) {
    var e = E[key], P = e.P, d = dk && dk[e.k], fz = d ? deckWalk(d, P[0] + 0.5, P[1] + 0.5) : null;
    if (!g.get(P[0], P[1], P[2] - 1)) { var n = 1; while (n < 60 && P[2] - 1 - n >= 0 && !g.get(P[0], P[1], P[2] - 1 - n)) n++; e.fall = n; e.on = onHole(P); }
    if (fz !== null && Math.abs(P[2] - fz) > NAV_DZ) add(NL ? 'error' : 'warn', key === 'head' ? '梯頂沒到甲板面' : '梯腳沒到甲板面', e.nm + ldcAt(P) + '，' + d.name + '在那裡的地板 z ' + fz + '（' + (P[2] > fz ? '高' : '低') + ' ' + Math.abs(P[2] - fz) + ' 格）⇒ ' + (NL ? '尋路照那一層的走路格接（' + (dk.link ? 10 : 5) + ' 點內找），人爬到' + (key === 'head' ? '頂' : '底') + '要跳 ' + Math.abs(P[2] - fz) + ' 格' : '尋路沒收這一座（預備水手、傷員不走）'),
      e.nm + ' 擺在' + d.name + '的地板上（z ' + fz + '）；它真的通到別層 ⇒ 梯子 meta ' + l.name.split('/').pop() + '.decks 指定那兩層（造船規格 §9.3）');
    else if (dk && !d && hullDecks(T).length) add(NL ? 'error' : 'warn', key === 'head' ? '梯頂判不出在哪一層' : '梯腳判不出在哪一層', e.nm + ldcAt(P) + ' 離每一層甲板的地板都太遠（−3～+20 格外）' + (NL ? '' : ' ⇒ 尋路沒收這一座'), '擺在宣告了 kind=deck 的甲板上，或 meta <梯名>.decks 指定兩層（造船規格 §9.3）');
    if (key === 'foot' && e.fall) add(e.on ? 'error' : 'warn', '梯腳懸空', e.nm + ldcAt(P) + ' 腳下是空的（往下 ' + (e.fall >= 60 ? '60 格以上' : e.fall + ' 格') + '才有實心）' + (e.on ? '：踩在 ' + e.on + ' 的梯口洞上' : ''),
      e.on ? e.on + ' 的洞補好就站得住（見那一座的「梯口有洞」）；或 foot 挪到旁邊的甲板上' : 'foot 擺在踩得到的地板上（固定點 ＝ 腳踩的那一格空氣，底下要是實心）');
    var hd = -1; for (var k = 0; k < NAV_HEAD; k++) if (g.get(P[0], P[1], P[2] + k)) { hd = k; break; }
    if (hd >= 0) add('warn', key === 'head' ? '梯頂頭上太低' : '梯腳頭上太低', e.nm + ldcAt(P) + ' 頭上 ' + hd + ' 格就碰到實心（z ' + (P[2] + hd) + '，' + ldcPartAt(T, P[0], P[1], P[2] + hd) + '）⇒ 走路格要 ' + NAV_HEAD + ' 格空', '那幾格挖開，或 ' + key + ' 挪到頭上空的地方');
  });
  // ── ① 梯口的洞 ──
  R.open = !O.seeds ? '沒有開口（梯頂跟甲板齊平、或在甲板外）' : O.leak ? '開口連到外面（梯子靠在甲板邊上）⇒ 不量洞' : '';
  if (O.cells.length) {
    var bx = [1e9, -1e9], by = [1e9, -1e9]; O.cells.forEach(function (c) { bx = [Math.min(bx[0], c[0]), Math.max(bx[1], c[0])]; by = [Math.min(by[0], c[1]), Math.max(by[1], c[1])]; });
    R.open = 'x ' + ldcRng(bx) + '、y ' + ldcRng(by) + '（' + O.cells.length + ' 格，z ' + zt + '）';
  }
  if (HO.length) {
    var FP = O.cells.filter(function (c) { return O.cov(c[0], c[1], null) || O.inLad(c[0], c[1], zt); });   // 開口裡梯子蓋到的
    var hx = [1e9, -1e9], hy = [1e9, -1e9], fl = 0; HO.forEach(function (c) { hx = [Math.min(hx[0], c[0]), Math.max(hx[1], c[0])]; hy = [Math.min(hy[0], c[1]), Math.max(hy[1], c[1])]; fl = Math.max(fl, O.fall(c[0], c[1])); });
    var parts = [], best = null, sOK = false, sTxt = '';
    if (ax >= 0 && FP.length) {
      var A = function (c) { return sg * c[ax]; }, Lt = function (c) { return c[1 - ax]; }, rg = function (L, k) { if (k < 0) return L.map(function (c) { return '(' + c[0] + ', ' + c[1] + ')'; }).join('、'); var a = [1e9, -1e9]; L.forEach(function (c) { a = [Math.min(a[0], c[k]), Math.max(a[1], c[k])]; }); return 'xy'[k] + ' ' + ldcRng(a); };
      var fa = [1e9, -1e9], fw = [1e9, -1e9]; FP.forEach(function (c) { fa = [Math.min(fa[0], A(c)), Math.max(fa[1], A(c))]; fw = [Math.min(fw[0], Lt(c)), Math.max(fw[1], Lt(c))]; });
      var bey = HO.filter(function (c) { return A(c) > fa[1]; }), beh = HO.filter(function (c) { return A(c) < fa[0]; }), mid = HO.filter(function (c) { return A(c) >= fa[0] && A(c) <= fa[1]; });
      var sid = mid.filter(function (c) { return Lt(c) < fw[0] || Lt(c) > fw[1]; }), inn = mid.filter(function (c) { return Lt(c) >= fw[0] && Lt(c) <= fw[1]; });
      if (bey.length) parts.push('梯頂那一頭（往 ' + dirN + '）空 ' + (Math.max.apply(null, bey.map(A)) - fa[1]) + ' 排 ' + bey.length + ' 格（' + rg(bey, ax) + '）');
      if (sid.length) { var lo = sid.filter(function (c) { return Lt(c) < fw[0]; }).length, hi2 = sid.length - lo; parts.push('梯子兩側 ' + sid.length + ' 格（' + rg(sid, 1 - ax) + '；梯子寬 ' + 'xy'[1 - ax] + ' ' + ldcRng(fw) + (lo !== hi2 ? '；−' + 'xy'[1 - ax] + ' 那側 ' + lo + ' 格、+' + 'xy'[1 - ax] + ' 那側 ' + hi2 + ' 格' : '') + '）'); }
      if (inn.length) parts.push('梯子頂上的角沒蓋到 ' + inn.length + ' 格（' + (inn.length <= 4 ? rg(inn, -1) : rg(inn, 0) + '、' + rg(inn, 1)) + '）');
      if (beh.length) parts.push('梯腳那一頭 ' + beh.length + ' 格（' + rg(beh, ax) + '）');
      // 整座挪幾格最好：沿走向、橫向各試 ±1～±LDC_TRY 格，挑挪完剩的洞最少（再來撞的格最少、挪得最少）的那一個；蓋不掉一半的洞 ⇒ 不算（憲法號的艙口比梯子寬一倍，挪哪邊都只少一兩成）
      var hit = function (o) { var n = 0, hz = [1e9, -1e9]; Object.keys(C.set).forEach(function (kk) { kk = +kk; var z = Math.floor(kk / (g.sx * g.sy)), r = kk - z * g.sx * g.sy, y = Math.floor(r / g.sx), x = r - y * g.sx, x2 = x + o[0], y2 = y + o[1];
        if (g.get(x2, y2, z) && K.all.set[ldcKey(g, x2, y2, z)] !== me) { n++; hz = [Math.min(hz[0], z), Math.max(hz[1], z)]; } }); return [n, hz]; };
      [0, 1].forEach(function (lat) {
        for (var d = -LDC_TRY; d <= LDC_TRY; d++) {
          if (!d) continue;
          var o = lat ? [ax ? d : 0, ax ? 0 : d] : [ax ? 0 : sg * d, ax ? sg * d : 0], rem = O.holes(o).length; if (rem * 2 > HO.length) continue;   // 蓋不掉一半的洞 ⇒ 不是偏（開口本來就比梯子大）
          var h2 = hit(o), c2 = { o: o, d: d, lat: lat, rem: rem, hit: h2[0], hz: h2[1] };
          if (!best || rem < best.rem || (rem === best.rem && (c2.hit < best.hit || (c2.hit === best.hit && Math.abs(d) < Math.abs(best.d))))) best = c2;
        }
      });
      if (best) {                                                         // 挑到的那個再量：挪過去的 foot 站不站得住、head 走不走得出去（原本的位置當成空出來了）
        var o = best.o, gm = { sx: g.sx, sy: g.sy, sz: g.sz, get: function (x, y, z) { return C.set[ldcKey(g, x, y, z)] ? 0 : g.get(x, y, z); } };
        var nf = [F[0] + o[0], F[1] + o[1], F[2]], nh = [H[0] + o[0], H[1] + o[1], H[2]], fOk = ldcStand(gm, K.all, nf[0], nf[1], nf[2]) === nf[2];
        var gs = ldcFilled(gm, K.O, me), ws = ldcWalk(gs, K.all, nh, lvN(1, nh)), wb = ws.ok ? [] : ldcBlockers(T, gs, K, me, ws.at || nh, [ax ? [0, sg] : [sg, 0]]);
        var dn = (o[0] ? (o[0] > 0 ? '+x' : '−x') : (o[1] > 0 ? '+y' : '−y')), n = Math.abs(o[0] || o[1]);
        best.dir = dn; best.n = n; sOK = !best.hit && !best.rem && fOk && ws.ok;
        sTxt = '整座梯子（格子＋foot／lo／hi／head 四個點）往 ' + dn + ' 挪 ' + n + ' 格' + (sOK ? '（量過：不撞格、挪完開口蓋滿、兩頭站得住、head 走得出去）' :
          '（量過：' + [best.hit ? '⚠ 會撞 ' + best.hit + ' 格實心（z ' + ldcRng(best.hz) + '）' : '不撞格', best.rem ? '挪完開口還剩 ' + best.rem + ' 格洞' : '挪完開口蓋滿', fOk ? '' : '⚠ 挪過去的 foot ' + ldcAt(nf) + ' 站不住',
            ws.ok ? '' : '⚠ 挪過去的 head ' + ldcAt(nh) + ' 走不出去' + (wb.length ? '（' + wb.slice(0, 2).map(function (b) { return b.who; }).join('、') + ' 擋住）' : '')].filter(Boolean).join('、') + '）');
      }
    } else parts.push(ax < 0 ? '直上直下的梯子：洞 x ' + ldcRng(hx) + '、y ' + ldcRng(hy) : '開口裡沒有梯子蓋到的格');
    var fill = '洞的那幾格補甲板（x ' + ldcRng(hx) + '、y ' + ldcRng(hy) + ' 裡的 ' + HO.length + ' 格，z ' + (zt - O.th + 1) + '–' + zt + '，同那一層甲板的厚度）' + (E.head.fall ? '、head 就站在補好的甲板上' : '');
    var fixes = sTxt ? (sOK ? [sTxt, '或' + fill] : [fill, '或' + sTxt]) : [fill];
    var off = best && best.n >= LDC_GAP;                                  // 挪 LDC_GAP 格以上就能少掉洞 ⇒ 梯子偏了
    R.hole = { n: HO.length, x: hx, y: hy, shift: best ? best.dir + ' ' + best.n : '', shiftOk: sOK };
    var hh = E.head.fall && O.hs[H[0] + g.sx * H[1]], txt = '梯子沒蓋到的洞 ' + HO.length + ' 格（往下掉最多 ' + (fl >= 60 ? '60 格以上' : fl + ' 格') + '）：' + parts.join('；');
    if (hh || off || !FP.length) add(hh ? 'error' : 'warn', '梯口有洞', '開口 ' + R.open + ' 裡' + txt + (hh ? '；head 就踩在洞上' : off ? '；梯子偏了（往 ' + best.dir + ' 挪 ' + best.n + ' 格洞最少）' : ''), fixes.join('；'));
    else R.open += '；' + txt + ' —— 開口比梯子大、梯子沒偏（整座挪 ' + LDC_GAP + ' 格以上才蓋得掉一半的洞的話才算偏）、head 站在甲板上 ⇒ 不報';   // 艙口本來就比梯子寬（憲法號的貨艙口 28 × 39 格）：兩側、梯腳那一頭的空、一兩排的縫不算偏
  } else if (E.head.fall) add('error', '梯頂懸空', '梯頂 head' + ldcAt(H) + ' 腳下是空的（往下 ' + (E.head.fall >= 60 ? '60 格以上' : E.head.fall + ' 格') + '才有實心）' + (E.head.on ? '：踩在 ' + E.head.on + ' 的梯口洞上' : '') + ' ⇒ 爬到頂踩出去就掉',
    'head 擺在踩得到的甲板上（固定點 ＝ 腳踩的那一格空氣），或那一格底下補甲板');
  // ── ④ 梯頂接不上甲板：hi 到 head 那一段沿走向逐柱看 —— 梯子那一條寬度裡、腳下那一層（沿 hi → head 內插）上下 NAV_DZ 格內有沒有踩得到的面（同走路格的高低差）（梯子的格、甲板、艙壁頂；實心而且上面空 ⇒ 貼著梯子的舷牆不算）
  //   Tim 2026-10-27（康塞普西翁號）：船樓的梯子梯頂停在半空、離 break 艙壁 4～7 格，自檢全 ✓ —— ① 開口連到外面就不量洞、② 只看 head 那一格 ⇒ 這一段沒人量
  //   連續空 LDC_GAP 柱以上才報（空 1 柱 ＝ 艙口邊的縫，同 ① 不報）；LDC_GAP_ERR 柱（0.4 m）以上 ✗、以下 ⚠（加這條時 31 艘裡：康塞普西翁號 4–7 柱 6 座 ✗；
  //   別的船 9 座都是艙口梯子 2–3 柱 ⇒ ⚠，原本 ① 把它算成「開口比梯子大」不報）；① 已經報了梯口有洞 ⇒ 不重報
  if (ax >= 0 && !R.issues.some(function (i) { return i.what === '梯口有洞'; })) {
    var hp = l.pts.length > 2 ? l.pts[l.pts.length - 2] : l.pts[0], a0 = Math.floor(hp[ax]), lw = [1e9, -1e9];
    Object.keys(C.cols).forEach(function (c) { c = +c; var x = c % g.sx, y = (c - x) / g.sx, t = ax ? x : y; lw = [Math.min(lw[0], t), Math.max(lw[1], t)]; });
    if (lw[0] > lw[1]) lw = [H[1 - ax] - 2, H[1 - ax] + 2];
    var gap = null, run = null;
    for (var a = a0; sg * (H[ax] - a) > 0; a += sg) {                 // hi 那一柱也量（拿掉梯頂那幾柱 ⇒ hi 自己就懸空）
      var sup = false, zl = Math.round(hp[2] + (H[2] - hp[2]) * (a - a0) / (H[ax] - a0)) - 1;   // 腳下那一層：沿 hi → head 內插
      for (var t = lw[0]; t <= lw[1] && !sup; t++) for (var z = Math.max(0, zl - NAV_DZ); z <= zl + NAV_DZ && !sup; z++) { var x = ax ? t : a, y = ax ? a : t; if (g.get(x, y, z) && !g.get(x, y, z + 1)) sup = true; }   // 踩得到的面（實心、上面空）⇒ 貼著梯子的舷牆不算
      if (sup) { run = null; continue; }
      run = run ? [run[0], a] : [a, a];
      if (!gap || Math.abs(run[1] - run[0]) > Math.abs(gap[1] - gap[0])) gap = run.slice();
    }
    var gn = gap ? Math.abs(gap[1] - gap[0]) + 1 : 0, zg = gap ? Math.round(hp[2] + (H[2] - hp[2]) * (gap[0] - a0) / (H[ax] - a0)) - 1 : 0;
    if (gn >= LDC_GAP) {
      for (var a2 = Math.min(gap[0], gap[1]); a2 <= Math.max(gap[0], gap[1]); a2++) for (var t2 = lw[0]; t2 <= lw[1]; t2++) X.push(ax ? [t2, a2] : [a2, t2]);
      var fall = 1e9; for (var t3 = lw[0]; t3 <= lw[1]; t3++) { var x3 = ax ? t3 : gap[0], y3 = ax ? gap[0] : t3, n3 = 0; while (n3 < 60 && zg - n3 >= 0 && !g.get(x3, y3, zg - n3)) n3++; fall = Math.min(fall, n3); }
      R.gap = { n: gn, at: 'xy'[ax] + ' ' + ldcRng([Math.min(gap[0], gap[1]), Math.max(gap[0], gap[1])]) };
      add(gn >= LDC_GAP_ERR ? 'error' : 'warn', '梯頂接不上甲板', '梯子最上面那一階 hi' + ldcAt([Math.floor(hp[0]), Math.floor(hp[1]), hp[2]]) + ' 到梯頂 head' + ldcAt(H) + ' 之間，' + R.gap.at + ' 那 ' + gn + ' 柱（梯子寬 ' + 'xy'[1 - ax] + ' ' + ldcRng(lw) + '）腳下上下 ' + NAV_DZ + ' 格內沒有踩得到的面（往下 ' + (fall >= 60 ? '60 格以上' : fall + ' 格') + '才有）⇒ 梯子頂端停在半空、沒接到甲板邊，爬到頂要跨過去',
        '整座梯子（格子＋foot／lo／hi 三個點，head 不動）往 ' + dirN + ' 挪 ' + gn + ' 格、讓梯頂貼著甲板邊；或那 ' + gn + ' 柱補踏板／平台');
    }
  }
  // ── ③ 兩端走不走得出去（每一座的洞都當成補好了）──
  ['head', 'foot'].forEach(function (key) {
    var e = E[key], P = e.P, N = lvN(e.k, P), w = ldcWalk(K.gf, K.all, P, N);
    if (w.ok) {
      if (w.snap) R['snap_' + key] = w.snap;
      if (ax < 0) return;                                                // 正前方（梯頂沿走向往前、梯腳往後退）2 格內被擋 ⇒ 走得出去但要繞（Tim：「頂端出口前方…那根柱子擋住」）
      var sd = key === 'head' ? sg : -sg, FB = ldcBlockers(T, K.gf, K, me, w.at, [[ax ? 0 : sd, ax ? sd : 0]], 2, 0).filter(function (b) { return b.who.indexOf('沒有地板') < 0; });
      if (FB.length) { FB.forEach(function (b) { b.cells.forEach(function (c) { X.push(c); }); });
        add('warn', key === 'head' ? '梯頂正前方擋住' : '梯腳正前方擋住', e.nm + ldcAt(P) + ' 往 ' + (sd > 0 ? '+' : '−') + 'xy'[ax] + ' 1–2 格：' + FB.map(function (b) { return b.who + '（x ' + ldcRng(b.x) + '、y ' + ldcRng(b.y) + '、z ' + ldcRng(b.z) + '）'; }).join('、') + ' ⇒ 走得出去，但要往旁邊繞',
          FB.every(function (b) { return b.st; }) ? '取用點是遊戲擺的（23_powder.js：彈藥庫 hoist ⇒ 桶擺在梯腳那一層）⇒ 擺桶時讓開梯子兩頭的正前方（遊戲那側），或船隻配置頁換位置；雕刻作品不用改' : '擋住的那幾格挪開，或梯子轉個方向／挪到正前方空的地方'); }
      return;
    }
    var dirs = ax < 0 ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[ax ? 0 : (key === 'head' ? sg : -sg), ax ? (key === 'head' ? sg : -sg) : 0]];
    var B = ldcBlockers(T, K.gf, K, me, w.at || P, dirs), Bs = B.slice(0, 3).map(function (b) { b.cells.forEach(function (c) { X.push(c); }); return b.who + '（x ' + ldcRng(b.x) + '、y ' + ldcRng(b.y) + '、z ' + ldcRng(b.z) + '，' + b.n + ' 柱）'; });
    var where = (key === 'head' ? '頂端' : '底端') + (dirs.length > 1 ? '四周' : '往 ' + (dirs[0][0] ? (dirs[0][0] > 0 ? '+x' : '−x') : (dirs[0][1] > 0 ? '+y' : '−y'))) + ' 1–4 格';
    var filled = (key === 'head' && HO.length) || e.on, st = B.length && B.slice(0, 3).every(function (b) { return b.st; });   // 只被取用點的桶擋住：遊戲擺的（彈藥庫 hoist ⇒ 桶擺在梯腳那一層），尋路照樣接（10 格內）⇒ ⚠、修法在遊戲那側
    if (st) { add('warn', key === 'head' ? '梯頂出口被取用點擋住' : '梯腳出口被取用點擋住', e.nm + ldcAt(P) + (w.why === 'stand' ? ' 附近 ' + LDC_SNAP + ' 格內沒有站得住的格' : ' 起走 ' + LDC_WALK + ' 格內走不到那一層的走路格') + '：' + Bs.join('、'),
      '取用點是遊戲擺的（23_powder.js；彈藥庫 meta hoist ⇒ 桶擺在梯腳那一層的空地）⇒ 擺桶時離梯子兩頭遠一點（遊戲那側），或船隻配置頁換取用點的位置；雕刻作品不用改'); return; }
    add(NL ? 'error' : 'warn', key === 'head' ? '梯頂出口堵住' : '梯腳出口堵住', e.nm + ldcAt(P) + (w.why === 'stand' ? ' 附近 ' + LDC_SNAP + ' 格內沒有站得住的格' : ' 起走 ' + LDC_WALK + ' 格內走不到' + (N ? '那一層的走路格' : '開闊的地方') + '（只走得到 ' + w.n + ' 格）') +
      (filled ? '（洞當成補好了量的：補了洞還是出不去）' : '') + (NL ? '' : '（尋路沒收這一座：只有第一人稱會走）') + (Bs.length ? '；' + where + '：' + Bs.join('、') : ''),
      Bs.length ? '把擋住的那幾格挪開或挖開（' + B.slice(0, 3).map(function (b) { return b.who; }).join('、') + '），或 ' + key + ' 挪到出得去的那一邊' : key + ' 擺在甲板上走得開的地方（四周至少一邊頭上 ' + NAV_HEAD + ' 格空、高低差 ≤ ' + NAV_DZ + ' 格）');
  });
  if (R.issues.some(function (i) { return i.what !== '格子清單' && i.what.indexOf('頭上太低') < 0; })) R.map = ldcMap(g, K, me, X);
  return R;
}
/** 梯口那一層（z ＝ zt）的平面圖（給報告）：# 實心　L 底下有這座梯子　l 別座梯子（站的高度往上 NAV_HEAD 格裡有它的格）　_ 洞　. 空　H head　X 出口擋住的那幾柱；上面是 +y、右邊是 +x。 */
function ldcMap(g, K, me, X) {
  var O = K.O[me], C = K.own[me], zt = O.zt, H = O.H, who = K.all.set, x0, x1, y0, y1;
  if (O.cells.length) { x0 = 1e9; x1 = -1e9; y0 = 1e9; y1 = -1e9; O.cells.forEach(function (c) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); }); x0 -= 8; x1 += 8; y0 -= 4; y1 += 4; }
  else { x0 = H[0] - 12; x1 = H[0] + 12; y0 = H[1] - 8; y1 = H[1] + 8; }
  X.forEach(function (c) { x0 = Math.min(x0, c[0] - 1); x1 = Math.max(x1, c[0] + 1); y0 = Math.min(y0, c[1] - 1); y1 = Math.max(y1, c[1] + 1); });
  if (x1 - x0 + 1 > LDC_MAPW) { x0 = Math.max(x0, H[0] - (LDC_MAPW >> 1)); x1 = x0 + LDC_MAPW - 1; }
  if (y1 - y0 + 1 > LDC_MAPH) { y0 = Math.max(y0, H[1] - (LDC_MAPH >> 1)); y1 = y0 + LDC_MAPH - 1; }
  var xs = {}; X.forEach(function (c) { xs[c[0] + g.sx * c[1]] = 1; });
  function other(x, y) { for (var h = 0; h <= NAV_HEAD; h++) { var w = who[ldcKey(g, x, y, zt + h)]; if (w !== undefined && w !== me) return true; } return false; }
  var out = ['z ' + zt + '（head 腳下那一層）：x ' + x0 + '–' + x1 + '（左 → 右）、y ' + y1 + '–' + y0 + '（上 → 下）'];
  for (var y = y1; y >= y0; y--) {
    var s = '';
    for (var x = x0; x <= x1; x++) {
      var c = x + g.sx * y;
      s += x === H[0] && y === H[1] ? 'H' : xs[c] ? 'X' : O.hs[c] ? '_' : other(x, y) ? 'l' : O.inLad(x, y, zt) || (O.cov(x, y, null) && !g.get(x, y, zt)) ? 'L' : g.get(x, y, zt) ? '#' : '.';
    }
    out.push(('    ' + y).slice(-4) + ' ' + s);
  }
  return out;
}
// ───────────────────────── ⑤ 甲板連不連得到、⑥ 艙底下不下得去（TASK-1028；Tim 2026-10-27「樓梯自檢是否能檢查無法連通的甲板(含貨艙)」）─────────────────────────
// ①～④ 一座一座量；整艘船「每一層、每一塊走不走得到」照尋路自己的圖量（42_hands.js makeHands、handRoute）：
//   節點 ＝ 「層:區域」（navBuild 的走路格、navRegions 切的塊，NAV_MINREG 點以上），邊 ＝ 尋路收了的梯子（sh.nav.ladders 的 ra／rb）
//   ＋ 尋路沒收、一頭在艙底的梯子（sh.ladDrop：貨艙梯子 —— 梯腳不在任何一層，尋路不走、第一人稱照樣爬）。
//   艙底：最下層甲板的高度範圍以下多量一層（navBuild 同一套：那一段高度裡最高的站位、頭上 NAV_HEAD 格空），只留船殼裡的點（腳的高度往 ±x、±y 都碰得到實心），
//   一塊 DLK_HOLD m² 以上才算一個艙（底艙甲板底下、船頭船尾沒鋪甲板的那幾段）。
//   主幹 ＝ 甲板那幾層的點加起來最多的那一群（艙底不算進來挑）。⑤ 整層一點都不在主幹 ✗、層裡一塊 DLK_LOST m² 以上不在主幹 ⚠；
//   ⑥ 艙底一個艙 DLK_LOST m² 以上不在主幹 ⚠（艙底不在尋路裡、只有第一人稱下得去 ⇒ 同 ③「尋路沒收這一座」照 ⚠；DLK_HOLD 以上的列在報告的表裡）。
//   DLK_LOST 10 m²（一間 3 × 3 m 的房間）：加這條時 25 艘船裡甲板接不到的塊 2–4 m² 88 塊、4–10 m² 29 塊 ＝ 橫樑之間只剩 1.2 m 的船尾艙（船員的頭高切成小島，第一人稱照樣走）、
//   划手座之間（皇家號一艘 55 塊）、一格寬的邊；10 m² 以上 16 塊 ＝ 整片甲板的一段（蘇士奎哈納號後半、維吉尼亞號砲廓外）、露砲台頂、底艙一段隔間 ⇒ 只報這些（小的照樣列在報告的表裡）。
//   艙底（⑥）10 m² 以上接不到的：三叉戟號 721、夜燈號 502、潮墓號 404、收穫號 251、炎羽號 182、藍鯊號 151 m² 的貨艙，加幾個 13–16 m² 的隔艙。
//   堡壘、砲台（T.fixed）不量：層是照地形高度切的、沒有艙底。
//   ⛔ 照第一人稱（81_fps.js 一步上 0.6 m、下 0.8 m）量不行：康塞普西翁號的貨艙一座梯子都沒有，第一人稱卻從底艙甲板前緣踩上船殼內側的弧面，
//      一路走得下去也爬得回來 ⇒ 量起來「通」。這裡照走路格（一步 NAV_DZ）＋梯子量。
// 只讀（同 ladCheck）：艙底那一層 navBuild 會記進 T.navC（鍵是它自己的高度範圍，尋路拿不到）。結果：{ levels, hold, issues, skip }；admin.py 寫進 reports/ladcheck_<船>.md。
var DLK_LOST = 10, DLK_TAB = 2, DLK_HOLD = 4, DLK_SNAP = 5;
function deckLink(sh) {
  var out = { levels: [], hold: [], issues: [] }, cb = CREW_BLOCK;
  if (sh.T.fixed) { out.skip = '堡壘、砲台不量（層照地形高度切、沒有艙底）'; return out; }
  if (!sh.nav) { out.skip = '沒有走路格（這艘沒有預備水手、也不會落水 ⇒ makeHands 沒建）'; return out; }
  CREW_BLOCK = crewBlockOf(sh);
  try { dlkRun(sh, out); } finally { CREW_BLOCK = cb; }
  return out;
}
function dlkRun(sh, out) {
  var T = sh.T, NV = sh.nav, g = navBase(T), LV = NV.levels, a2 = NAV_C * NAV_C * S * S, drop = T.dlkDrop, id = {}, par = [], pts = [], via = {};
  function node(k, n, deck) { if (id[k] === undefined) { id[k] = par.length; par.push(par.length); pts.push(deck ? n : 0); } }
  function root(a) { while (par[a] !== a) a = par[a] = par[par[a]]; return a; }
  function join(a, b) { if (a === undefined || b === undefined) return false; a = root(a); b = root(b); if (a !== b) par[b] = a; return true; }
  LV.forEach(function (L, i) { L.N.regs.forEach(function (n, r) { node(i + ':' + r, n, true); }); });
  NV.ladders.forEach(function (L) { if (L.name !== drop) join(id[L.lo + ':' + L.ra], id[L.hi + ':' + L.rb]); });
  var zlo = 1e9; LV.forEach(function (L) { if (!L.tur) zlo = Math.min(zlo, L.zr[0]); });
  var HN = zlo - 1 > NAV_HEAD ? dlkHoldNav(sh, g, [1, zlo - 1]) : null, hmin = Math.ceil(DLK_HOLD / a2), lmin = Math.ceil(DLK_LOST / a2), tmin = Math.ceil(DLK_TAB / a2);
  if (HN) HN.sp.n.forEach(function (n, s) { if (n >= hmin) node('h:' + s, n, false); });
  (sh.ladDrop || []).forEach(function (d) {
    if (d.rope || d.name === drop || Math.min(d.a[2], d.b[2]) >= zlo) return;   // 只接一頭在艙底的（貨艙梯子）；其他沒收的照尋路的判斷（不走）
    var e = [d.a, d.b].map(function (p) { return dlkEnd(sh, HN, zlo, p); });
    if (e[0] && e[1] && join(id[e[0]], id[e[1]])) e.forEach(function (k) { var v = k[0] === 'h' ? (via[k] = via[k] || []) : null; if (v && v.indexOf(d.name) < 0) v.push(d.name); });   // 兩頭都在艙底的（風暴角號 hold-mag）只記一次
  });
  var tot = {}, main = -1;
  Object.keys(id).forEach(function (k) { var r = root(id[k]); tot[r] = (tot[r] || 0) + pts[id[k]]; });
  Object.keys(tot).forEach(function (r) { if (main < 0 || tot[r] > tot[main]) main = +r; });
  LV.forEach(function (L, i) {
    var N = L.N, B = dlkBoxes(N), all = 0, inM = 0, far = [];
    N.regs.forEach(function (n, r) { all += n; if (root(id[i + ':' + r]) === main) inM += n; else if (n >= tmin) far.push(B[r]); });   // 表裡列 DLK_TAB m² 以上的、報 DLK_LOST 以上的
    var m2 = +(all * a2).toFixed(1), where = L.key + ' ' + L.name;
    out.levels.push({ key: L.key, name: L.name, m2: m2, main: +(inM * a2).toFixed(1), lost: far });
    if (!all) return;
    if (!inM) out.issues.push({ lv: 'error', what: '甲板走不到', where: where, msg: L.name + '的走路格（約 ' + m2 + ' m²）一塊都接不到主幹 ⇒ 沒有梯子通到這一層的地板（預備水手、傷員到不了）',
      fix: '從相鄰那一層放一座梯子接到這一層的地板（kind=ladders 四個點，兩頭落在甲板的地板上；造船規格 §9.3）；梯子已經在 ⇒ 看匯入檢查「尋路沒收這一座」那幾條' });
    else far.forEach(function (b) { if (b.n >= lmin) out.issues.push({ lv: 'warn', what: '甲板有一塊走不到', where: where, msg: L.name + '裡 ' + dlkAt(b) + '（約 ' + b.m2 + ' m²）接不到這一層別的地方、也沒有梯子接',
      fix: '那一塊開門洞或放梯子接回去；本來就不站人（艙房頂、堆的東西上面）⇒ 不理' }); });
  });
  if (HN) {
    var HB = dlkBoxes(HN), SB = HN.sp.n.map(function () { return { x: [1e9, -1e9], y: [1e9, -1e9], z: [1e9, -1e9], n: 0, m2: 0, parts: 0 }; });
    HB.forEach(function (b, r) { var t = SB[HN.sp.of[r]]; ['x', 'y', 'z'].forEach(function (a) { t[a] = [Math.min(t[a][0], b[a][0]), Math.max(t[a][1], b[a][1])]; }); t.n += b.n; t.parts++; });
    SB.forEach(function (t) { t.m2 = +(t.n * a2).toFixed(1); });
    HN.sp.n.forEach(function (n, s) {
      var k = 'h:' + s; if (id[k] === undefined) return;
      var b = SB[s], ok = root(id[k]) === main; b.ok = ok; b.via = via[k] || []; out.hold.push(b);
      if (!ok && b.n >= lmin) out.issues.push({ lv: 'warn', what: '艙底下不去', where: '艙底 ' + dlkAt(b), msg: '最下層甲板以下、船殼裡站得住的一塊：' + dlkAt(b) + '（約 ' + b.m2 + ' m²、頭上 ' + (NAV_HEAD * S).toFixed(1) + ' m 以上）沒有梯子下得去',
        fix: '從上面那層甲板開梯井、放一座梯子下到艙底（梯腳踩艙底、head 在甲板的地板上；kind=ladders 四個點；造船規格 §9.3）' });
    });
  }
}
/** 艙底那一層的走路格：navBuild 照高度範圍 zr 建（同一套站位、家具），只留船殼裡的點，重切連通塊；
 *  再把塊併成「艙」（N.sp：of ＝ 每一塊屬於第幾個艙、n ＝ 每個艙幾點）—— 相鄰兩點高低差 ≤ FP_UP（第一人稱一步）就算同一個艙：
 *  船底弧面照走路格（一步 NAV_DZ）會切成一層一層的台階、一格寬的邊，下到艙底的人照第一人稱走得過去（三叉戟號 y 128 那條 5 m² 的邊、夜燈號龍骨上那條 4 m²）。 */
function dlkHoldNav(sh, g, zr) {
  var N0 = navBuild(sh, { zr: zr }), Z = N0.Z.slice(), nx = N0.nx;
  for (var i = 0; i < Z.length; i++) if (Z[i] >= 0 && !dlkIn(g, N0.x0 + (i % nx) * NAV_C, ((i / nx) | 0) * NAV_C, Z[i] + 1)) Z[i] = -1;
  var N = { x0: N0.x0, nx: nx, ny: N0.ny, Z: Z, blk: N0.blk, rot: null };
  navRegions(N);
  var par = N.regs.map(function (n, r) { return r; });
  function root(a) { while (par[a] !== a) a = par[a] = par[par[a]]; return a; }
  for (i = 0; i < Z.length; i++) {
    var r = N.reg[i]; if (r < 0) continue;
    for (var d = 0; d < 8; d++) { var j = i + NAV_DX[d] + NAV_DY[d] * nx, q = j >= 0 && j < Z.length ? N.reg[j] : -1; if (q >= 0 && q !== r && Math.abs(Z[j] - Z[i]) <= FP_UP) par[root(q)] = root(r); }
  }
  var of = [], sn = [], at = {};
  N.regs.forEach(function (n, r) { var t = root(r); if (at[t] === undefined) { at[t] = sn.length; sn.push(0); } of[r] = at[t]; sn[at[t]] += n; });
  N.sp = { of: of, n: sn };
  return N;
}
/** (x, y, z) 在船殼裡：往 ±x、±y 走到格子邊以前都碰得到實心（船外的點至少有一邊一路空到邊）。 */
function dlkIn(g, x, y, z) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(function (d) { for (var a = x + d[0], b = y + d[1]; a >= 0 && b >= 0 && a < g.sx && b < g.sy; a += d[0], b += d[1]) if (g.get(a, b, z)) return true; return false; });
}
/** 梯子一頭 p 接到哪一個節點：落在某一層（42_hands.js lvAt：有甲板 meta 照那一欄的地板）⇒ 那一層 DLK_SNAP 點內最近的走路格；在最下層甲板以下 ⇒ 艙底那一層的。 */
function dlkEnd(sh, HN, zlo, p) {
  if (p[2] < zlo) { var j = HN ? navSnap(HN, p, DLK_SNAP) : -1; return j >= 0 ? 'h:' + HN.sp.of[HN.reg[j]] : null; }
  var LV = sh.nav.levels, li = lvAt(sh, p), i = li >= 0 && LV[li] ? navSnap(LV[li].N, p, DLK_SNAP) : -1;
  return i >= 0 ? li + ':' + LV[li].N.reg[i] : null;
}
/** 每一塊（N.regs 的第幾塊）的範圍（船的格座標）與面積。 */
function dlkBoxes(N) {
  var B = N.regs.map(function () { return { x: [1e9, -1e9], y: [1e9, -1e9], z: [1e9, -1e9], n: 0 }; }), a2 = NAV_C * NAV_C * S * S;
  for (var i = 0; i < N.reg.length; i++) {
    var r = N.reg[i]; if (r < 0) continue;
    var b = B[r], x = N.x0 + (i % N.nx) * NAV_C, y = ((i / N.nx) | 0) * NAV_C, z = N.Z[i];
    b.x = [Math.min(b.x[0], x), Math.max(b.x[1], x)]; b.y = [Math.min(b.y[0], y), Math.max(b.y[1], y)]; b.z = [Math.min(b.z[0], z), Math.max(b.z[1], z)]; b.n++;
  }
  B.forEach(function (b) { b.m2 = +(b.n * a2).toFixed(1); });
  return B;
}
function dlkAt(b) { return 'x ' + ldcRng(b.x) + '、y ' + ldcRng(b.y) + '、z ' + ldcRng(b.z); }
/** 一行讀數。 */
function deckLinkSummary(D) {
  if (D.skip) return D.skip;
  var e = D.issues.filter(function (i) { return i.lv === 'error'; }).length, w = D.issues.length - e;
  return D.levels.length + ' 層' + (D.hold.length ? '＋艙底 ' + D.hold.length + ' 塊' : '') + '：' + (e + w ? '✗ ' + e + '、⚠ ' + w : '都接得到') + '（照尋路的走路格＋梯子）';
}

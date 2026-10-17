// ───────────────────────── 木匠：修梯子、補甲板破洞、恢復通道（TASK-0676 ②；Tim 2026-10-17：「然後是木工(可以修理梯子 甲板破洞 補上通道)」） ─────────────────────────
// 人數在船隻配置頁（crew.carpenter，預設 2）；要有走路格（42_hands.js sh.nav）才上船，開戰時生在待命那一層，平常跟預備水手一樣在船裡走動。
// 走路、爬梯子、找路都照預備水手那一套（42_hands.js stepHand／handRoute），只是不補砲班、不搬傷員，只接「修」的工作（job.kind ＝ 'repair'）：
//   · 梯子（優先；Tim：「木工的修復機制可以單純是還原該子模組(梯子)」）：尋路判成斷了的梯子、它那件關聯（meta kind=ladders）有格子清單（檔頭 parts[].cellRuns，
//     admin.py part_cells）⇒ 站到還接得上的那一頭，修 CARP_LAD_T 秒 ⇒ 那一件被打掉的格照開戰時全部補回來（一件裡有好幾座梯子 ⇒ 一起好）。
//     繩梯（橫繩斷了）不修：繩不是格子；沒有格子清單的舊檔 ⇒ 只補踏板那兩格。
//   · 甲板破洞（Tim：「修復甲板機制就交給妳發揮了(要考慮性能) 直接補破洞?」）：開戰時能走、現在不能走的走路點連成一個洞 ＝ 一件工作；
//     木匠站到洞邊走得到的那一點，修 CARP_HOLE_T0 ＋ CARP_HOLE_K × 洞的點數 秒 ⇒ 整個洞腳下那一層（每點 NAV_C × NAV_C 格、開戰時的高度）一次補回來。
//     連著兩塊以上的洞（甲板被打成兩塊不通）先修 ＝ 恢復通道。
//   性能：要修的清單只在尋路刷新（navRefresh，每 NAV_RE 秒、有被打到才刷）之後重掃一次（sh.carp.at ＝ NV.refreshN），平常點名只是挑；修好的那件到下一次刷新之前不再挑。
//   補回來的格 ＝ 開戰時那一格的顏色（restoreVoxel：網格重建、進水、尋路跟著更新，removeVoxel 反過來）；尋路刷新之後才看得到（梯子接回去、兩塊接回一塊）。
//   細節設定「尋路更新」關（NAV_RE 0）⇒ 走路格不會變 ⇒ 看不到洞、梯子不會斷 ⇒ 木匠只會閒逛。
// 木匠倒下、陣亡 ⇒ 沒人修；掉到別層 ⇒ 照舊是木匠；落水爬回來 ⇒ 當預備水手（同其他職位）。0 人 ⇒ 戰局跟以前一位元不差（不生、不抽 rnd()）。
var CARP_LAD_T = 6, CARP_HOLE_T0 = 2, CARP_HOLE_K = 0.5;                     // 修一件梯子幾秒；補一個洞 ＝ 2 秒 ＋ 每點 0.5 秒
/** 開戰時（makeCrew，預備水手之後）：生 sh.cw.carpenter 個木匠在待命那一層最大的那一塊（照順序平均分開，不抽 rnd()）。 */
function carpInit(sh, crew, add) {
  var n = sh.cw.carpenter || 0, NV = sh.nav; sh.carpWant = NV ? n : 0; sh.carp = null;
  if (!NV || !n) return;
  var N = NV.levels[NV.home].N, C0 = N.bigCells.length ? N.bigCells : N.cells, hr = {};
  NV.ladders.forEach(function (L) { if (L.lo === NV.home) hr[L.ra] = 1; if (L.hi === NV.home) hr[L.rb] = 1; });   // 有梯子接著的那幾塊（同 makeHands：憲法號、餘燼號的底艙最大那一塊沒有梯子）
  if (Object.keys(hr).length && !hr[N.reg[C0[0]]]) {
    var br = -1, bn = 0; Object.keys(hr).forEach(function (r) { var k2 = N.cells.filter(function (c) { return N.reg[c] === +r; }).length; if (k2 > bn) { bn = k2; br = +r; } });
    if (br >= 0) C0 = N.cells.filter(function (c) { return N.reg[c] === br; });
  }
  if (!C0.length) { sh.carpWant = 0; return; }
  sh.carp = { lad: 0, holes: 0, cells: 0, log: [], todo: [], at: -1, done: {} };
  for (var k = 0; k < n; k++) {
    var i = C0[Math.floor((k + 0.5) / n * C0.length)];
    add(ROLE.CARPENTER, navPos(N, i), null, 1);
    var c = crew[crew.length - 1]; c.art = ART_CARPENTER; c.deck = NV.levels[NV.home].key;
    c.hand = { lv: NV.home, wait: 1 + k, legs: [], wp: null, k: 0, climb: null, job: null, to: null };
  }
}
/** 補回一格（開戰時那一格的顏色）：removeVoxel（20_shatter.js）反過來 —— 網格、進水、尋路跟著更新。那一格現在已經有東西 ⇒ 不動、回 0。 */
function restoreVoxel(sh, x, y, z, col) {
  if (!col || sh.grid.get(x, y, z)) return 0;
  sh.grid.set(x, y, z, col);
  evEmit('cell', sh, x, y, z); sh.lost--;
  if (z < sh.T.sz) { sh.flood[z * 3]--; sh.flood[z * 3 + 1] -= y > sh.T.cy ? 1 : -1; sh.flood[z * 3 + 2] -= x > sh.T.cx ? 1 : -1; }
  if (sh.fl) floodTouch(sh, x, y, z);
  if (NAV_RE > 0 && sh.nav) navDirty(sh, x, y, z);
  return col;
}
/** 梯子那一件關聯的格（檔頭 parts[].cellRuns ⇒ 格座標，31_drive.js drvCells；同型的船共用）；沒有 ⇒ null。 */
function ladCells(T, path) {
  var C = T.ladCells || (T.ladCells = {}); if (path in C) return C[path];
  var q = (T.h.parts || []).filter(function (p) { return p.path === path; })[0];
  return (C[path] = q && q.cellRuns && q.cellRuns.length ? drvCells(T, q.cellRuns) : null);
}
/** 要修的（尋路刷新之後重掃）：[{ key, kind: 'lad'｜'hole', lv, cell（木匠站的走路點）, pri, … }]。 */
function carpScan(sh) {
  var NV = sh.nav, out = [], G = sh.grid, T = sh.T, seen = {};
  NV.ladders.forEach(function (L, j) {
    if (!L.broken || L.rj) return;                                       // 繩梯不修（繩不是格子）
    var C = L.part ? ladCells(T, L.part) : null, key = C ? 'P' + L.part : 'L' + j;
    if (seen[key]) return;
    if (C ? drvLeft(G, C) * 3 >= C.length : L.steps.every(function (p) { return G.get(p[0], p[1], p[2]); })) return;   // 格子都還在（斷在兩頭的甲板 ⇒ 交給補洞）
    var st = L.ra >= 0 && NV.reach.indexOf(L.lo) >= 0 ? [L.lo, L.ia] : L.rb >= 0 && NV.reach.indexOf(L.hi) >= 0 ? [L.hi, L.ib] : null; if (!st) return;
    seen[key] = 1; out.push({ key: key, kind: 'lad', j: j, C: C, lv: st[0], cell: st[1], pri: 0 });
  });
  NV.levels.forEach(function (Lv, lv) {
    var N = Lv.N, Z0 = Lv.Z0; if (!Z0 || NV.reach.indexOf(lv) < 0) return;   // Z0：這一層第一次重算之前的走路格高度（42_hands.js navRefresh）；沒有 ⇒ 這一層沒被打過
    var nx = N.nx, ny = N.ny, n = nx * ny, comp = null, i, d, b;
    function nb(a, k) { var x = a % nx + NAV_DX[k], y = ((a / nx) | 0) + NAV_DY[k]; return x < 0 || y < 0 || x >= nx || y >= ny ? -1 : x + y * nx; }   // ⛔ 不用 navStep：洞（Z < 0）它一律回 −1
    for (i = 0; i < n; i++) {
      if (!(Z0[i] >= 0 && N.Z[i] < 0) || N.blk[i]) continue;
      if (!comp) comp = new Uint8Array(n);
      if (comp[i]) continue;
      var q = [i], R = {}, st = -1; comp[i] = 1;                         // 一個洞：連在一起的洞點、碰到哪幾塊、站在哪
      for (var h = 0; h < q.length; h++) for (d = 0; d < 8; d++) {
        b = nb(q[h], d); if (b < 0) continue;
        if (N.ok[b]) { R[N.reg[b]] = 1; if (st < 0) st = b; }
        else if (!comp[b] && Z0[b] >= 0 && N.Z[b] < 0 && !N.blk[b]) { comp[b] = 1; q.push(b); }
      }
      if (st >= 0) out.push({ key: 'H' + lv + ':' + i, kind: 'hole', lv: lv, cell: st, hole: q, pri: Object.keys(R).length >= 2 ? 1 : 2 });   // 連著兩塊以上 ＝ 通道
    }
  });
  return out;
}
/** 每次點名（survey）：閒著的木匠接一件（梯子 ＞ 通道 ＞ 其他洞；同一級挑最近、走得到的）。 */
function carpTick(sh) {
  var NV = sh.nav, K = sh.carp; if (!K || !NV || sh.struck || sh.sunk || sh.broken) return;
  var C = sh.crew.filter(function (c) { return c.role === ROLE.CARPENTER && able(c); }); if (!C.length) return;
  if (K.at !== (NV.refreshN || 0)) { K.at = NV.refreshN || 0; K.todo = carpScan(sh); K.done = {}; if (K.todo.length) medComps(sh); }   // 尋路刷新過 ⇒ 重掃；medComps：「層:區域」照沒斷的梯子連成幾群（44_medic.js；只看區域與梯子，便宜）
  if (!K.todo.length) return;
  var taken = {}; C.forEach(function (c) { if (c.hand.job) taken[c.hand.job.key] = 1; });
  for (var k in K.done) taken[k] = 1;
  C.forEach(function (c) {
    var H = c.hand; if (H.job || H.climb) return;
    var fr = handReg(sh, c), cw = fr >= 0 ? NV.comp[H.lv + ':' + fr] : undefined, legs = null, best = null; if (cw === undefined) return;   // 站在走路格外（剛爬上來、在路上）⇒ 下一次
    var L = K.todo.filter(function (t) { if (taken[t.key]) return false; var N = NV.levels[t.lv].N; return NV.comp[t.lv + ':' + N.reg[t.cell]] === cw; });   // 走得到的（同一群）
    L.sort(function (a, b) { return carpD(NV, a, c) - carpD(NV, b, c); });
    for (var k = 0; k < L.length && !legs; k++) {                       // 同一群裡 handRoute 還是可能失敗（梯子正在排隊之類）⇒ 下一個
      var N = NV.levels[L[k].lv].N; best = L[k];
      legs = handRoute(sh, H.lv, best.lv, c.pos[0], navPos(N, best.cell)[0], fr, N.reg[best.cell]);
    }
    if (!legs) return;
    taken[best.key] = 1;
    H.job = { kind: 'repair', key: best.key, t: best, lv: best.lv, at: 0 };
    H.legs = legs.concat([{ w: best.lv, to: best.cell }]); H.wp = null; c.moving = false;
  });
}
/** 挑件的距離：梯子 ＞ 通道 ＞ 其他洞，同一級照沿船長的距離＋換層。 */
function carpD(NV, t, c) { var p = navPos(NV.levels[t.lv].N, t.cell); return t.pri * 1e6 + Math.abs(p[0] - c.pos[0]) + 150 * Math.abs(t.lv - c.hand.lv); }
/** 到了（42_hands.js handJoin）：站著修，修滿那件的秒數 ⇒ 補回去。不在那一層（路斷了）⇒ 作廢。 */
function carpJoin(sh, c) {
  var H = c.hand, J = H.job, t = J.t;
  if (!J.at) {
    if (H.lv !== J.lv) { H.job = null; H.wait = 0.5; return; }
    J.at = SIMT; c.home = c.pos.slice(); return;
  }
  if (SIMT - J.at < (t.kind === 'lad' ? CARP_LAD_T : CARP_HOLE_T0 + CARP_HOLE_K * t.hole.length)) return;
  var n = t.kind === 'lad' ? carpFixLadder(sh, t) : carpFixHole(sh, t.lv, t.hole), K = sh.carp;
  if (n) { if (t.kind === 'lad') { K.lad++; note(sh, '木匠修好了梯子（' + sh.nav.ladders[t.j].name.split('/').pop() + '）'); } else K.holes++; K.cells += n; }
  K.log.push({ t: +SIMT.toFixed(1), what: t.kind, key: t.key, n: n }); K.done[t.key] = 1;
  H.job = null; H.wait = 0.5;
}
/** 梯子：那一件關聯被打掉的格全部補回來（沒有格子清單 ⇒ 只補踏板）⇒ 補了幾格。 */
function carpFixLadder(sh, t) {
  var B = sh.T.base, n = 0, C = t.C;
  if (C) { for (var i = 0; i < C.length; i += 3) if (restoreVoxel(sh, C[i], C[i + 1], C[i + 2], B.get(C[i], C[i + 1], C[i + 2]))) n++; }
  else sh.nav.ladders[t.j].steps.forEach(function (p) { if (restoreVoxel(sh, p[0], p[1], p[2], B.get(p[0], p[1], p[2]))) n++; });
  return n;
}
/** 洞：每一點腳下那一層（NAV_C × NAV_C 格、開戰時的高度）照開戰時的船補回來 ⇒ 補了幾格。 */
function carpFixHole(sh, lv, cells) {
  var Lv = sh.nav.levels[lv], N = Lv.N, Z0 = Lv.Z0, B = sh.T.base, n = 0;
  cells.forEach(function (i) {
    var z = (Z0 ? Z0[i] : N.Z[i]) - 1; if (!(z >= 0)) return;
    var gx = N.x0 + (i % N.nx) * NAV_C, gy = ((i / N.nx) | 0) * NAV_C;
    for (var dy = 0; dy < NAV_C; dy++) for (var dx = 0; dx < NAV_C; dx++) if (restoreVoxel(sh, gx + dx, gy + dy, z, B.get(gx + dx, gy + dy, z))) n++;
  });
  return n;
}
/** HUD 一段：木匠（在修／還能動、修好的梯子與洞）。 */
function carpText(sh) {
  if (!sh.carp) return '';
  var C = sh.crew.filter(function (c) { return c.role === ROLE.CARPENTER && able(c); }), w = C.filter(function (c) { return c.hand.job; }).length;
  return '　木匠 ' + C.length + (w ? '（修 ' + w + '）' : '') + (sh.carp.lad || sh.carp.holes ? '　修好 梯 ' + sh.carp.lad + '、洞 ' + sh.carp.holes : '');
}

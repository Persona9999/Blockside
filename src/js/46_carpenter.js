// ───────────────────────── 木匠：修梯子、補甲板破洞、恢復通道（TASK-0676 ②；Tim 2026-10-17：「然後是木工(可以修理梯子 甲板破洞 補上通道)」） ─────────────────────────
// 人數 ＝ 設施配員（36_rooms.js staffSlots；Tim 2026-10-17：「加一件木工台設施，走同一套設施配員」「然後可以有預設數量(每船最少1)」）：
//   木工台（furniture 裡 role ＝ 'bench' 那一種，擺在甲板上）每張配 staff.carpenter 位；船隻配置頁的 crew.carpenter 是全船上限。
//   擺在哪都行（Tim：「木工台不用限制擺放位置 哨兵號也放吧(艙內也可以放)」）：砲甲板、艙房（木工間 rooms.workshop，醫療艙也能擺）。
//   每船至少 furniture.bench.auto 張（最少 1）：全船（甲板＋艙房）擺的不夠 ⇒ 先在木工台那一層（benchDeck：水線以上最低那層砲甲板）自動補，
//   照抽水機的找法（45_pumps.js pumpAuto：船身中段、中線上先試）；沒有砲甲板、擺不下（哨兵號）⇒ 開戰時擺在待命那一層的中段（benchNavFill：開戰才有走路格）。
//   沒有木工台這種道具（設定檔沒寫）⇒ 照舊：crew.carpenter 就是人數、生在待命那一層（戰局跟以前一位元不差）。
// 要有走路格（42_hands.js sh.nav）才上船；開戰時生在木工台旁（走得到的話；走不到 ⇒ 待命那一層），平常跟預備水手一樣在船裡走動。
// 木材（Tim 2026-10-17：「可以參考彈藥箱機制 木工修補要消耗道具(木材?) 要跑回木工台拿」）：補一格用一份木材（c.wood）。
//   開戰時每位木匠身上帶滿 furniture.bench.carry 份；木工台存 wood 份（每張；被打壞 ⇒ 拿不到）。身上用完、又有東西要修 ⇒ 走回走得到、還有存量的那張台
//   （同一群、沿船長最近），站 CARP_WOOD_T 秒拿到滿（台上剩多少拿多少）。修的時候帶的不夠 ⇒ 補到用完為止，那一件留著、拿了木材再回來補完。
//   一張台都沒有（沒有走路格之類）或沒有木工台這種道具 ⇒ 不用木材（c.wood ＝ Infinity；跟以前一樣）。
//   手上拿著木材（41_crew_art.js heldItem 'plank'，點陣圖；跟送藥手抱藥筒同一層）：身上還有木材就拿著。
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
var CARP_WOOD_T = 3;                                                          // 在木工台拿木材幾秒
/** 木工台是哪一種道具（furniture 裡 role ＝ 'bench' 的第一種）；沒有 ⇒ null。 */
function benchIt() { for (var k in FURN) if (FURN[k].role === 'bench') return k; return null; }
/** 那一型自動補木工台的那一層：水線以上最低那層砲甲板（沒有 ⇒ 最上面那層；沒有砲甲板 ⇒ null）。 */
function benchDeck(T) { var ds = hullDeckKit(T).decks; return ds.filter(function (D) { return D.zr[0] >= T.zw; })[0] || ds[ds.length - 1] || null; }
/** 甲板 D 的擺法 items（會改它；36_rooms.js deckItems 呼叫）：D 是木工台那一層、全船擺的木工台不到預設張數 ⇒ 補到夠。 */
function benchFill(T, D, items) {
  var it = benchIt(), BD = it && benchDeck(T); if (!BD || deckId(BD) !== deckId(D)) return;
  var have = items.filter(function (q) { return q.it === it; }).length + benchRooms(T, it);
  hullDeckKit(T).decks.forEach(function (E) {
    if (deckId(E) === deckId(D)) return;
    var pl = deckPlan(T.id, deckId(E)); if (pl.items) have += roomCheck(T, { grid: deckGrid(T, E) }, 'deck', pl.items).items.filter(function (q) { return q.it === it; }).length;
  });
  var want = Math.max(1, Math.round(+FURN[it].auto || 1)) - have;
  if (want > 0) pumpAuto(T, D, items, it, want);
}
/** 艙房裡擺了幾張木工台（照擺法；36_rooms.js roomItems）。 */
function benchRooms(T, it) { var n = 0; hullRooms(T).forEach(function (r) { roomItems(T, r, roomPlan(T.id, r.name)).items.forEach(function (p) { if (p.it === it) n++; }); }); return n; }
/** 開戰時（carpInit，走路格建好之後）：全船的木工台還不到預設張數（沒有砲甲板、擺不下）⇒ 在待命那一層的中段補（C0：木匠會生的那一塊），也是模型（會被打）。 */
function benchNavFill(sh, it, C0) {
  var NV = sh.nav, B = sh.benches = sh.benches || [], want = Math.max(1, Math.round(+FURN[it].auto || 1)) - B.length, f = FURN[it], T = sh.T, N = NV.levels[NV.home].N;
  for (var k = 0; k < want && C0.length; k++) {
    var P = navPos(N, C0[Math.floor((k + 0.5) / want * C0.length)]), at = [Math.round(P[0] - f.size[0] / 2), Math.round(P[1] - f.size[1] / 2), Math.round(P[2])];
    var bb = [at[0], at[1], at[2], at[0] + f.size[0], at[1] + f.size[1], at[2] + f.size[2] + 1], nm = (NV.levels[NV.home].name || NV.levels[NV.home].key) + f.name + '-' + (B.length + 1);
    var m = { T: T, k: sh.models.length, name: nm, path: 'nav/' + nm, kind: 'furn', item: it, hold: 0, room: null, hp: f.hp, hpMax: f.hp, mesh: furnMesh(T, it, 'x'), origin: at, bb: bb, pts: {}, meta: { kind: 'furniture', item: it },
      c: [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2], foot: VK.pack(Math.floor(bb[0] + 1), Math.floor(bb[1] + 1), at[2] - 1), alive: true };
    sh.models.push(m); B.push(m);
    for (var bx = Math.max(0, Math.floor((bb[0] - 12) / 16)); bx <= Math.floor((bb[3] + 12) / 16); bx++) (sh.mIdx[bx] = sh.mIdx[bx] || []).push(m);   // 命中分桶（10_ship.js modelIndex 同一套）
  }
}
/** 木工台旁、從待命那一層走得到的走路點 ⇒ { lv, ci }；走不到 ⇒ null。 */
function benchSpot(sh, m) {
  var NV = sh.nav, lv = lvOf(NV.levels, m.origin[2]); if (lv < 0 || NV.reach.indexOf(lv) < 0) return null;
  var N = NV.levels[lv].N, ci = navSnap(N, [m.c[0], m.c[1], m.origin[2]], 8);
  return ci >= 0 && handRoute(sh, NV.home, lv, m.c[0], m.c[0], undefined, N.reg[ci]) ? { lv: lv, ci: ci } : null;
}
/** 開戰時（makeCrew，預備水手之後）：照設施配員生木匠（上限 sh.cw.carpenter）—— 木工台旁走得到的生在台旁，其他的在待命那一層最大的那一塊（照順序平均分開，不抽 rnd()）。 */
function carpInit(sh, crew, add) {
  var NV = sh.nav, it = benchIt(), cap = it ? Math.max(1, sh.cw.carpenter || 0) : sh.cw.carpenter || 0; sh.carp = null;   // 有木工台這種道具 ⇒ 每船至少一位（舊存檔的 0 也照 1）
  if (!NV || !cap) { sh.carpWant = 0; sh.carpSlots = it ? 0 : cap; return; }
  var N = NV.levels[NV.home].N, C0 = N.bigCells.length ? N.bigCells : N.cells, hr = {};
  NV.ladders.forEach(function (L) { if (L.lo === NV.home) hr[L.ra] = 1; if (L.hi === NV.home) hr[L.rb] = 1; });   // 有梯子接著的那幾塊（同 makeHands：憲法號、餘燼號的底艙最大那一塊沒有梯子）
  if (Object.keys(hr).length && !hr[N.reg[C0[0]]]) {
    var br = -1, bn = 0; Object.keys(hr).forEach(function (r) { var k2 = N.cells.filter(function (c) { return N.reg[c] === +r; }).length; if (k2 > bn) { bn = k2; br = +r; } });
    if (br >= 0) C0 = N.cells.filter(function (c) { return N.reg[c] === br; });
  }
  if (it) benchNavFill(sh, it, C0);                                     // 甲板、艙房擺的不夠預設張數 ⇒ 待命那一層補
  var B = sh.benches || [], S = it ? staffSlots([B.length ? B : [{ item: it }]], 'carpenter') : null;   // 一張都擺不下（那一塊沒有走路點）⇒ 當作有一張
  var n = S ? Math.min(cap, S.length) : cap;                             // 沒有木工台這種道具 ⇒ 照舊（crew.carpenter 就是人數）
  sh.carpWant = n; sh.carpSlots = S ? S.length : cap;
  var at = [], hn = 0, BF = it ? FURN[it] : null;
  B.forEach(function (m) { m.spot = benchSpot(sh, m); m.wood = Math.max(0, +BF.wood || 0); });   // spot：台旁走得到的那一點（拿木材走這裡）；wood：存量
  if (B.length) NV.ladders.forEach(function (L) { L.q = 0; });          // handRoute 會記排隊人數；這裡只是試走
  for (var q = 0; q < n; q++) { var bm = S && S[q].m.origin ? S[q].m : null; at.push(bm ? bm.spot : null); if (!at[q]) hn++; }
  if (!C0.length && hn) { sh.carpWant = 0; return; }
  sh.carp = { lad: 0, holes: 0, cells: 0, log: [], todo: [], at: -1, done: {}, fetch: 0, used: 0 };   // fetch：拿了幾趟木材；used：從台上拿走幾份
  for (var k = 0, h = 0; k < n; k++) {
    var lv = at[k] ? at[k].lv : NV.home, i = at[k] ? at[k].ci : C0[Math.floor((h++ + 0.5) / hn * C0.length)];
    add(ROLE.CARPENTER, navPos(NV.levels[lv].N, i), null, 1);
    var c = crew[crew.length - 1]; c.art = ART_CARPENTER; c.deck = NV.levels[lv].key; c.wood = B.length ? Math.max(0, +BF.carry || 0) : Infinity;   // 身上的木材（沒有台 ⇒ 不用）
    c.hand = { lv: lv, wait: 1 + k, legs: [], wp: null, k: 0, climb: null, job: null, to: null };
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
  var C = sh.crew.filter(function (c) { return c.role === ROLE.CARPENTER && crewAble(c); }); if (!C.length) return;
  if (K.at !== (NV.refreshN || 0)) { K.at = NV.refreshN || 0; K.todo = carpScan(sh); K.done = {}; if (K.todo.length) medComps(sh); }   // 尋路刷新過 ⇒ 重掃；medComps：「層:區域」照沒斷的梯子連成幾群（44_medic.js；只看區域與梯子，便宜）
  if (!K.todo.length) return;
  var taken = {}; C.forEach(function (c) { if (c.hand.job) taken[c.hand.job.key] = 1; });
  for (var k in K.done) taken[k] = 1;
  C.forEach(function (c) {
    var H = c.hand; if (H.job || H.climb) return;
    var fr = handReg(sh, c), cw = fr >= 0 ? NV.comp[H.lv + ':' + fr] : undefined, legs = null, best = null; if (cw === undefined) return;   // 站在走路格外（剛爬上來、在路上）⇒ 下一次
    if (!(c.wood > 0)) { carpFetch(sh, c, fr, cw); return; }             // 身上沒木材 ⇒ 先回木工台拿
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
/** 身上沒木材：走回同一群、還有存量、沒被打壞的木工台（沿船長最近）；一張都沒有 ⇒ 閒著。 */
function carpFetch(sh, c, fr, cw) {
  var NV = sh.nav, H = c.hand, L = (sh.benches || []).filter(function (m) { return m.alive && m.wood > 0 && m.spot && NV.comp[m.spot.lv + ':' + NV.levels[m.spot.lv].N.reg[m.spot.ci]] === cw; });
  L.sort(function (a, b) { return Math.abs(a.c[0] - c.pos[0]) + 150 * Math.abs(a.spot.lv - H.lv) - Math.abs(b.c[0] - c.pos[0]) - 150 * Math.abs(b.spot.lv - H.lv); });
  for (var k = 0; k < L.length; k++) {
    var m = L[k], N = NV.levels[m.spot.lv].N, legs = handRoute(sh, H.lv, m.spot.lv, c.pos[0], navPos(N, m.spot.ci)[0], fr, N.reg[m.spot.ci]);
    if (!legs) continue;
    H.job = { kind: 'wood', key: 'W' + m.k, m: m, lv: m.spot.lv, at: 0 };
    H.legs = legs.concat([{ w: m.spot.lv, to: m.spot.ci }]); H.wp = null; c.moving = false; return;
  }
}
/** 到了木工台（42_hands.js handJoin）：站 CARP_WOOD_T 秒 ⇒ 拿到滿（台上剩多少拿多少；台在這段時間被打壞 ⇒ 空手）。 */
function carpWood(sh, c) {
  var H = c.hand, J = H.job, m = J.m;
  if (!J.at) { if (H.lv !== J.lv) { H.job = null; H.wait = 0.5; return; } J.at = SIMT; c.home = c.pos.slice(); return; }
  if (SIMT - J.at < CARP_WOOD_T) return;
  var get = m.alive ? Math.min(Math.max(0, (+FURN[m.item].carry || 0) - c.wood), m.wood) : 0;
  m.wood -= get; c.wood += get; sh.carp.fetch++; sh.carp.used += get;
  H.job = null; H.wait = 0.5;
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
  var W = { n: c.wood, more: false }, n = t.kind === 'lad' ? carpFixLadder(sh, t, W) : carpFixHole(sh, t.lv, t.hole, W), K = sh.carp;   // W：身上的木材（補一格用一份；用完 ⇒ more）
  c.wood -= n;
  if (n && !W.more) { if (t.kind === 'lad') { K.lad++; note(sh, '木匠修好了梯子（' + sh.nav.ladders[t.j].name.split('/').pop() + '）'); } else K.holes++; }
  K.cells += n;
  K.log.push({ t: +SIMT.toFixed(1), what: t.kind, key: t.key, n: n, more: W.more }); if (!W.more) K.done[t.key] = 1;   // 木材不夠補完 ⇒ 那一件留著（拿了木材再來）
  H.job = null; H.wait = 0.5;
}
/** 梯子：那一件關聯被打掉的格全部補回來（沒有格子清單 ⇒ 只補踏板）⇒ 補了幾格。 */
function carpFixLadder(sh, t, W) {
  var B = sh.T.base, n = 0, C = t.C;
  function one(x, y, z) { var col = B.get(x, y, z); if (!col || sh.grid.get(x, y, z)) return; if (n >= W.n) { W.more = true; return; } if (restoreVoxel(sh, x, y, z, col)) n++; }
  if (C) { for (var i = 0; i < C.length; i += 3) one(C[i], C[i + 1], C[i + 2]); }
  else sh.nav.ladders[t.j].steps.forEach(function (p) { one(p[0], p[1], p[2]); });
  return n;
}
/** 洞：每一點腳下那一層（NAV_C × NAV_C 格、開戰時的高度）照開戰時的船補回來 ⇒ 補了幾格。 */
function carpFixHole(sh, lv, cells, W) {
  var Lv = sh.nav.levels[lv], N = Lv.N, Z0 = Lv.Z0, B = sh.T.base, n = 0;
  cells.forEach(function (i) {
    var z = (Z0 ? Z0[i] : N.Z[i]) - 1; if (!(z >= 0)) return;
    var gx = N.x0 + (i % N.nx) * NAV_C, gy = ((i / N.nx) | 0) * NAV_C;
    for (var dy = 0; dy < NAV_C; dy++) for (var dx = 0; dx < NAV_C; dx++) {
      var col = B.get(gx + dx, gy + dy, z); if (!col || sh.grid.get(gx + dx, gy + dy, z)) continue;
      if (n >= W.n) { W.more = true; return; }
      if (restoreVoxel(sh, gx + dx, gy + dy, z, col)) n++;
    }
  });
  return n;
}
/** 讀數（__game.carp）：木工台（中心、還在不在、走得到的點、存量）、木匠 { want, slots, cap }、每位木匠在哪一層、身上的木材、離最近的木工台幾格；修好幾件、拿了幾趟。 */
function carpInfo(sh) {
  var B = sh.benches || [], C = sh.crew.filter(function (c) { return c.role === ROLE.CARPENTER; }), K = sh.carp;
  return { want: sh.carpWant || 0, slots: sh.carpSlots || 0, cap: sh.cw.carpenter || 0, lad: K ? K.lad : 0, holes: K ? K.holes : 0, cells: K ? K.cells : 0, fetch: K ? K.fetch : 0, used: K ? K.used : 0,
    benches: B.map(function (m) { return { name: m.name, c: m.c.map(Math.round), alive: m.alive, reach: !!m.spot, wood: m.wood }; }),
    crew: C.map(function (c) { return { deck: c.deck, st: c.st, wood: isFinite(c.wood) ? c.wood : null, job: c.hand && c.hand.job ? c.hand.job.kind : null, near: B.length ? Math.round(Math.min.apply(null, B.map(function (m) { return Math.hypot(c.pos[0] - m.c[0], c.pos[1] - m.c[1]); }))) : null }; }) };
}
/** HUD 一段：木匠（在修／拿木材、還能動、修好的梯子與洞、台上還剩幾份木材）。 */
function carpText(sh) {
  if (!sh.carp) return '';
  var C = sh.crew.filter(function (c) { return c.role === ROLE.CARPENTER && crewAble(c); }), w = C.filter(function (c) { return c.hand.job && c.hand.job.kind === 'repair'; }).length, g = C.filter(function (c) { return c.hand.job && c.hand.job.kind === 'wood'; }).length;
  var B = sh.benches || [], left = B.reduce(function (a, m) { return a + (m.alive ? m.wood : 0); }, 0);
  return '　木匠 ' + C.length + (w ? '（修 ' + w + '）' : '') + (g ? '（拿木材 ' + g + '）' : '') + (sh.carp.lad || sh.carp.holes ? '　修好 梯 ' + sh.carp.lad + '、洞 ' + sh.carp.holes : '') + (B.length ? '　木材 ' + left : '');
}

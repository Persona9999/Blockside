// ───────────────────────── 抽水機（TASK-0604；Tim 2026-10-16） ─────────────────────────
// 船本來就有的抽水（基礎抽水量 cfg.pump，噸／分；33_flood.js pumpK）一直都有、不用人；這裡是玩家在甲板上另外擺的抽水機，加在基礎量上面。
// 照史實（Tim：「抽水泵是否可以參考史實上是如何運作的(能安裝在哪裡?)」「以及應該要有操作的水手才有作用」「可以分成兩種抽水泵 人力跟蒸汽動力」）：
//   · 人力（鏈式抽水機，config furniture.pump，power hand）：吸水端在泵井（主桅腳旁、龍骨上方，艙底的水都流到那裡），泵管直直往上，
//     在水線以上的甲板搖 ⇒ 只能擺在主桅前後 PUMP_WELL_X（3 m）、中線兩側 PUMP_WELL_Y（1.2 m）以內（36_rooms.js placeOk ← pumpPlaceWhy）；沒有桅的船照船身中段。
//     要水手搖：艙裡有水（PUMP_WET 噸以上）才從預備水手派（點名時跟補位一起排，pri 1：交戰那一舷的砲班先補），水抽乾了放回去；
//     積水多（排水量的 PUMP_URGENT：憲法號約 11 噸；Tim 2026-10-16：「積水多的時候抽水機優先於醫療艙派人」）⇒ 抽水機排在醫療艙前面，
//     還缺人就把醫療艙值班的人（staff）叫過來；⛔ 正在扛傷員的（carry）不打斷 —— 打斷 ⇒ 傷員丟在半路。
//     抽水量 ＝ tpm ×（到崗 ÷ crew，最多 1）。
//   · 蒸汽（furniture.spump，power steam）：只有蒸汽船（額外動力 > 0、不是魔法）擺得了；擺在中線上（PUMP_WELL_Y 以內）；不用人，
//     抽水量 ＝ tpm × 鍋爐還能供汽的比例（31_drive.js 每座鍋爐：被打壞 ⇒ 0；這裡另外看泡在艙內的水裡 ⇒ 0）—— 莫尼特號 1862 年就是水淹到鍋爐、蒸汽沒了、抽水機停了才沉的。
//     沒標鍋爐（造船規格 §9.6）的蒸汽船 ⇒ 當作一直有蒸汽。
//   · 兩種都一樣：被打壞（模型，跟砲同一套血量）⇒ 不抽；泡在水裡（腳下那一格在海面下、或艙內的水滿了一半）⇒ 不抽。
//     同一種加總封頂 furniture[].cap（噸／分，全船）。
// 沒擺抽水機 ⇒ sh.pumps ＝ null：不派人、不抽 rnd()、pumpK 照舊 ⇒ 戰局一位元不動。
// 自動擺（Tim 2026-10-21「604 GO」；出廠：人力 1 台、蒸汽 0 台 —— TASK-1069，Tim 2026-10-28「先讓現在每艘船上有至少一個抽水泵」）：那一層甲板玩家沒改過（自動、或設定檔的自訂預設；36_rooms.js deckItems）而且是抽水機那一層
//   （人力：pumpAt —— 水線以上的砲甲板主桅旁擺得下的第一層，benchDeck 先；蒸汽：水線以上最低那層 benchDeck，跟 ?pumps= 同一層）
//   ⇒ 每一種補到 furniture[].autoDeck 台（pumpFill：這一層已經有的先扣掉；照位置規則、離泵井最近的格先；蒸汽的只有蒸汽船；擺不下就少擺）。
//   人力的哪一層主桅旁都擺不下（sanroman、reale、fusta、punt）⇒ 開戰時照走路格補一台（pumpNavFill；同木工台的退路，不在甲板編輯器裡）。
//   ⛔ 跟木工台的「每船至少」（auto）不一樣：玩家自己改過那一層（存檔有這一層）⇒ 照他擺的，拿掉就是拿掉（抽水機是加裝的，船本來的抽水在基礎量裡）。
//   0 ⇒ 不擺（戰局跟 TASK-1069 以前一位元不差）。道具設定頁調台數；船隻配置頁甲板編輯器另有一鍵「擺滿抽水機」（擺到全船上限）。
var PUMP_URGENT = 0.005;                                         // 積水佔設計排水量幾成算「多」（抽水機優先於醫療艙）
var PUMP_WELL_X = 30, PUMP_WELL_Y = 12, PUMP_WET = 2;            // 格（一格 0.1 m）：主桅前後 3 m、中線兩側 1.2 m（物品的中心）；艙裡幾噸水才派人去搖
/** 那一型的泵井在哪（格座標 x）：主桅 ＞ 桅的中間那根 ＞ 船身中段。 */
function pumpWellX(T) {
  var M = (T.masts || []).filter(function (m) { return m.name === '主桅'; })[0] || (T.masts || [])[Math.floor(((T.masts || []).length - 1) / 2)];
  return M ? M.x : Math.round((T.hx0 + T.hx1) / 2);
}
/** 那一型是不是蒸汽船（照船隻設定：額外動力 > 0、ships[].drive 不是 magic、不是槳帆船）。
 *  槳帆船（持火號、皇家號、平底船、福斯塔）的額外動力是槳（31_drive.js：有槳座的槳模型 ⇒ kind 'oar'）⇒ 沒有鍋爐，⛔ 以前照「base > 0」也擺得了蒸汽抽水機。 */
function pumpSteamShip(T) { var h = hullInfo(T.id); return shipCfg(T.id).base > 0 && !(h && h.drive === 'magic') && !pumpOarShip(T); }
/** 那一型有沒有槳（跟船隻配置頁的船員、開戰時 31_drive.js 同一條：雕刻模型 meta kind=oar、有槳座 pivot）。 */
function pumpOarShip(T) { return ((T.rig && T.rig.models) || []).some(function (m) { return (m.meta || {}).kind === 'oar' && !!(m.points || {}).pivot; }); }
/** 甲板格子 G（36_rooms.js deckGrid；G.T ＝ 船型）上擺抽水機 p 的位置規則：可以 ⇒ ''，不行 ⇒ 原因。 */
function pumpPlaceWhy(G, p) {
  var f = FURN[p.it], T = G.T; if (!f || !f.place || !T) return '';
  var t = itemTiles(p.it, p.r), cx = G.x0 + (p.x + t[0] / 2) * ROOM_TILE, cy = G.y0 + (p.y + t[1] / 2) * ROOM_TILE;
  if (Math.abs(cy - T.cy) > PUMP_WELL_Y) return f.name + '要擺在中線上（兩側 ' + (PUMP_WELL_Y * S).toFixed(1) + ' m 以內：泵管直通艙底的泵井）';
  if (f.place === 'well' && Math.abs(cx - pumpWellX(T)) > PUMP_WELL_X) return f.name + '要擺在主桅旁（前後 ' + (PUMP_WELL_X * S).toFixed(1) + ' m 以內：泵井在主桅腳）';
  if (f.power === 'steam' && !pumpSteamShip(T)) return f.name + '只有蒸汽船擺得了（額外動力 > 0、不是魔法）';
  return '';
}
// 量的時候：?pumps=人力台數,蒸汽台數 ⇒ 每一型在水線以上最低那層甲板，照位置規則（離泵井／中線最近的格先）另外擺上（蓋在存檔與設定檔的擺法上面；跟 ?roomfn= 同一類）
var PUMP_Q = Q.has('pumps') ? Q.get('pumps').split(',').map(function (v) { return Math.max(0, Math.min(16, Math.round(+v) || 0)); }) : null;
/** 照位置規則在甲板 D 上再擺 n 台 it（items ＝ 已經擺的，會改它）：離泵井（人力）或船身中段（蒸汽）最近、中線上的格先試，兩個方向都試。
 *  不壓梯子兩頭（Tim 2026-10-28「全船隊跟火藥桶有關的梯子警告」那一批之後：聖羅曼號自動補的木工台擺在船尾樓梯頂正前方 ⇒ 樓梯自檢 ⚠）：
 *  先只挑外框外 LAD_KEEP 格不碰任何一座梯子 foot／head（同一層：上下 6 格內）的格；整層都碰 ⇒ 照舊不管梯子再挑一次（跟 23_powder.js ladFirst 同一個退路：只換位置、不會變少）。 */
function pumpAuto(T, D, items, it, n) {
  var G = deckGrid(T, D), wx = FURN[it].place === 'well' ? pumpWellX(T) : Math.round((T.hx0 + T.hx1) / 2), C = [], i, j, got = 0;
  for (j = 0; j < G.ny; j++) for (i = 0; i < G.nx; i++) C.push([i, j, Math.abs(G.x0 + (i + 0.5) * ROOM_TILE - wx) + 3 * Math.abs(G.y0 + (j + 0.5) * ROOM_TILE - T.cy)]);
  C.sort(function (a, b) { return a[2] - b[2] || a[1] - b[1] || a[0] - b[0]; });
  var LE = []; shipLadders(T).forEach(function (L) { LE.push(L.pts[0], L.pts[L.pts.length - 1]); });
  function nearLad(p) {
    var t = itemTiles(p.it, p.r), xa = G.x0 + p.x * ROOM_TILE, ya = G.y0 + p.y * ROOM_TILE, xb = xa + t[0] * ROOM_TILE - 1, yb = ya + t[1] * ROOM_TILE - 1, z = G.zt[p.x + p.y * G.nx];
    return LE.some(function (q) { return Math.abs(q[2] - z) <= 6 && q[0] >= xa - LAD_KEEP && q[0] <= xb + LAD_KEEP && q[1] >= ya - LAD_KEEP && q[1] <= yb + LAD_KEEP; });
  }
  for (var pass = 0; pass < 2 && got < n; pass++)
    for (var c = 0; c < C.length && got < n; c++) for (var r = 0; r < 2; r++) { var p = { it: it, x: C[c][0], y: C[c][1], r: r }; if (!pass && nearLad(p)) continue; if (!placeOk(G, 'deck', items, p)) { items.push(p); got++; break; } }
  return got;
}
/** 人力抽水機自動擺在哪一層甲板（記在船型上 T.pumpAt ＝ { id: 甲板 id（哪一層都擺不下 ⇒ null）, ok }；TASK-1069）：
 *  水線以上的砲甲板（那一層頂 zr[1] 高過水線），benchDeck 先、再由低往高；照設定檔的擺法（自動的取用點、設定檔的預設；⛔ 不看玩家存的 ⇒ 每一型固定一層），
 *  照位置規則（主桅前後 3 m、中線）試擺一台，第一個擺得下的那一層；哪一層都擺不下 ⇒ ok 沒有 ⇒ 開戰時照走路格補（pumpNavFill）。
 *  labelle、zeehaen、oxford、sentinel：最低那層主桅旁站不住（或那一層根本不到主桅）⇒ 換一層；
 *  sanroman、reale、fusta、punt：哪一層砲甲板主桅旁都站不住（主甲板主桅那一段、槳帆船的甲板、只有船頭船尾兩小塊砲台）⇒ 走路格。
 *  🩸 試過的退路（都拿掉了）：① 接得到梯子的格先（船型層級從梯子兩頭沿站得住的格走）兩頭都猜錯 —— phoenix 本來走得到的被換到走不到的、susquehanna 照樣走不到；
 *     ② 只看中線 ⇒ reale 擺到主桅前 14.8 m；③ 放寬到 6 m ⇒ sanroman 主桅後 4 m 擠掉一位軍官、擋到船尾樓梯頂（甲板格子不知道人站哪、梯頂在抽水機頭上）。
 *     走路格是開戰時、人站好之後才補 ⇒ 知道人站哪、走不走得到。 */
function pumpAt(T) {
  if (T.pumpAt) return T.pumpAt;
  var bd = benchDeck(T), ds = hullDeckKit(T).decks.filter(function (D) { return D.zr[1] > T.zw; }).sort(function (a, b) { return (b === bd) - (a === bd) || a.zr[0] - b.zr[0]; }), DF = roomPlanDefault(T.id);
  var A = T.pumpAt = { id: null, ok: false };
  ds.some(function (D) {
    var pl = DF[deckId(D)], its = pl && pl.type === 'deck' && pl.items ? roomCheck(T, { grid: deckGrid(T, D) }, 'deck', pl.items).items : deckAutoItems(T, D);
    if (!pumpAuto(T, D, its.filter(function (q) { return FURN[q.it].role !== 'pump'; }), 'pump', 1)) return false;
    A.id = deckId(D); A.ok = true; return true;
  });
  return A;
}
/** 開戰時（pumpInit 一開始，走路格建好之後）：人力的每船自動擺幾台（autoDeck）> 0、這一型哪一層砲甲板主桅旁都擺不下（pumpAt 沒找到：sanroman、reale、fusta、punt）、
 *  全船一台人力的都沒有 ⇒ 照走路格補一台（同木工台的退路 46_carpenter.js benchNavFill）：站在水線以上、從待命那一層走得到的最低那一層，離泵井最近、中線上、
 *  不碰梯子兩頭（外框外 LAD_KEEP 格）、不疊別的道具的那一點；都沒有 ⇒ 待命那一層有梯子接著的那一塊（carpHomeCells）。也是模型（會被打）。不在甲板編輯器裡。 */
function pumpNavFill(sh, crew) {
  var T = sh.T, NV = sh.nav, f = FURN.pump, n = f ? Math.round(+f.autoDeck || 0) : 0, CR = crew || sh.crew || [];   // crew：makeCrew 還沒交給 sh.crew
  if (!NV || n <= 0 || pumpAt(T).ok || (sh.pumps && sh.pumps.list.some(function (p) { return p.hand; }))) return;
  var wx = pumpWellX(T), LE = [], F = sh.models.filter(function (m) { return m.kind === 'furn'; }), list = sh.pumps ? sh.pumps.list : [];
  shipLadders(T).forEach(function (L) { LE.push(L.pts[0], L.pts[L.pts.length - 1]); });
  function boxAt(P) { var a = [Math.round(P[0] - f.size[0] / 2), Math.round(P[1] - f.size[1] / 2), Math.round(P[2])]; return [a[0], a[1], a[2], a[0] + f.size[0], a[1] + f.size[1], a[2] + f.size[2] + 1]; }
  function bad(b) {
    return LE.some(function (p) { return p[2] >= b[2] - 6 && p[2] <= b[5] && Math.max(b[0] - p[0], p[0] - b[3], b[1] - p[1], p[1] - b[4], 0) <= LAD_KEEP; }) ||   // 梯子兩頭：腳下 6 格到抽水機頂（上一層的梯頂在它頭上也算擋）
      F.some(function (m) { return m.bb[0] < b[3] && b[0] < m.bb[3] && m.bb[1] < b[4] && b[1] < m.bb[4] && m.bb[2] < b[5] && b[2] < m.bb[5]; }) ||
      CR.some(function (c) { var p = c.pos; return p && p[0] >= b[0] - 3 && p[0] <= b[3] + 3 && p[1] >= b[1] - 3 && p[1] <= b[4] + 3 && Math.abs(p[2] - b[2]) <= 6; });   // 已經站好的人（軍官、砲班、槳手…；開戰時才補 ⇒ 人先站了）
  }
  function near(L, c) { var P = navPos(L.N, c); return [P, Math.abs(P[0] - wx) + 3 * Math.abs(P[1] - T.cy), L]; }
  // 先挑站在水線以上、從待命那一層走得到的格（由低往高一層一層找；🩸 只看待命那一層 ⇒ punt 補在貨艙、腳下在海面下 ⇒ 一開戰就算泡水、不抽）；都沒有 ⇒ 待命那一層照舊
  var lvs = NV.reach.slice().sort(function (a, b) { return NV.levels[a].zr[0] - NV.levels[b].zr[0]; }), RT = {};
  function pick() {
    for (var i = 0; i < lvs.length; i++) {
      var L = NV.levels[lvs[i]], C = L.N.cells.map(function (c) { return near(L, c).concat([c]); }).filter(function (q) { return q[0][2] > T.zw; }).sort(function (a, b) { return a[1] - b[1]; });
      for (var k = 0; k < C.length; k++) {
        if (bad(boxAt(C[k][0]))) continue;
        var key = lvs[i] + ':' + L.N.reg[C[k][3]]; if (RT[key] === undefined) RT[key] = !!handRoute(sh, NV.home, lvs[i], C[k][0][0], C[k][0][0], undefined, L.N.reg[C[k][3]]);
        if (RT[key]) return C[k];
      }
    }
    var H = NV.levels[NV.home], C0 = carpHomeCells(sh).map(function (c) { return near(H, c); }).sort(function (a, b) { return a[1] - b[1]; });
    return C0.filter(function (q) { return !bad(boxAt(q[0])); })[0] || C0[0];
  }
  for (var got = 0; got < n; got++) {
    var pk = pick(); if (!pk) break;
    var bb = boxAt(pk[0]), at = bb.slice(0, 3), nm = (pk[2].name || pk[2].key) + f.name + '-' + (list.length + 1);
    var m = { T: T, k: sh.models.length, name: nm, path: 'nav/' + nm, kind: 'furn', item: 'pump', hold: 0, room: null, hp: f.hp, hpMax: f.hp, mesh: furnMesh(T, 'pump', 'x'), origin: at, bb: bb, pts: {}, meta: { kind: 'furniture', item: 'pump' },
      c: [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2], foot: VK.pack(Math.floor(bb[0] + 1), Math.floor(bb[1] + 1), at[2] - 1), alive: true };
    sh.models.push(m); F.push(m);
    for (var bx = Math.max(0, Math.floor((bb[0] - 12) / 16)); bx <= Math.floor((bb[3] + 12) / 16); bx++) (sh.mIdx[bx] = sh.mIdx[bx] || []).push(m);   // 命中分桶（10_ship.js modelIndex 同一套）
    list.push({ m: m, it: 'pump', f: f, deck: pk[2].key, hand: true, need: 0, have: 0, tpm: 0, why: '' });
  }
  NV.ladders.forEach(function (L) { L.q = 0; });                        // handRoute 會記排隊人數；這裡只是試走
  if (list.length && !sh.pumps) sh.pumps = { list: list, x: 0, t: 0, called: 0 };
}
/** 那一型擺得了哪幾種抽水機（道具 id；蒸汽的只有蒸汽船）。 */
function pumpKinds(T) { return Object.keys(FURN).filter(function (it) { var f = FURN[it]; return f.role === 'pump' && (f.power !== 'steam' || pumpSteamShip(T)); }); }
/** 玩家沒改過的甲板 D（自動、或設定檔的自訂預設；36_rooms.js deckItems，items 會改）：D 是抽水機那一層（人力 pumpAt、蒸汽 benchDeck）⇒ 每一種補到 furniture[].autoDeck 台（這一層已經有的先扣掉；見檔頭「自動擺」）。⇒ 補了幾台。 */
function pumpFill(T, D, items) {
  var BD = benchDeck(T), got = 0;
  pumpKinds(T).forEach(function (it) {
    var n = Math.round(+FURN[it].autoDeck || 0), well = FURN[it].place === 'well', at = well ? pumpAt(T).id : BD && deckId(BD); if (n <= 0 || at !== deckId(D)) return;   // 人力的照 pumpAt 那一層（TASK-1069）、蒸汽的照舊 benchDeck
    n -= items.filter(function (q) { return q.it === it; }).length; if (n > 0) got += pumpAuto(T, D, items, it, n);
  });
  return got;
}
/** 甲板編輯器的「擺滿抽水機」（71_input.js；items 會改）：每一種擺到全船上限（cap ÷ 每台抽水量；沒有上限 ⇒ 8 台）、扣掉全船已經擺的（have：道具 ⇒ 台數）。⇒ { 道具: 這次擺了幾台 }。 */
function pumpFillMax(T, D, items, have) {
  var o = {};
  pumpKinds(T).forEach(function (it) { var f = FURN[it], max = f.cap > 0 && f.tpm > 0 ? Math.floor(f.cap / f.tpm + 1e-9) : 8, n = max - (have[it] || 0); o[it] = n > 0 ? pumpAuto(T, D, items, it, n) : 0; });
  return o;
}
/** 開戰時（10_ship.js，shipRooms 之後）：甲板擺法裡的抽水機 ⇒ 模型（加進 sh.models，跟砲同一套血量、命中）；sh.pumps ＝ { list, ... }，沒有 ⇒ null。 */
function pumpModels(sh) {
  var T = sh.T, list = [], decks = hullDeckKit(T).decks, bd = benchDeck(T), bench = sh.models.filter(function (m) { return m.kind === 'furn' && FURN[m.item] && FURN[m.item].role === 'bench'; }), loft = sh.models.filter(function (m) { return m.kind === 'furn' && FURN[m.item] && FURN[m.item].role === 'loft'; });   // 木工台（46_carpenter.js）：艙房裡的（shipRooms 做好的）＋下面甲板上的 ⇒ sh.benches
  sh.pumps = null; sh.benches = null; sh.lofts = null;                   // lofts：帆布櫃（47_sailmaker.js）
  var qd = PUMP_Q ? decks.filter(function (D) { return D.zr[0] >= T.zw; })[0] || decks[decks.length - 1] : null;   // ?pumps= 擺在哪一層：水線以上最低那層
  decks.forEach(function (D) {
    var pl = deckPlan(T.id, deckId(D)), G = deckGrid(T, D), its = pl.items ? roomCheck(T, { grid: G }, 'deck', pl.items).items : [];
    if (D === qd || D === bd || deckId(D) === pumpAt(T).id) its = deckItems(T, D, pl).items.slice();      // 木工台那一層、人力抽水機自動擺的那一層（pumpAt）：照 deckItems（含自動補的木工台、抽水機；自動的取用點不是抽水機、下面照 role 篩掉）
    if (D === qd) { pumpAuto(T, D, its, 'pump', PUMP_Q[0] || 0); if (pumpSteamShip(T)) pumpAuto(T, D, its, 'spump', PUMP_Q[1] || 0); }
    its.forEach(function (q) {
      var f = FURN[q.it]; if (!f || (f.role !== 'pump' && f.role !== 'bench' && f.role !== 'loft')) return;
      var lx = q.r ? f.size[1] : f.size[0], ly = q.r ? f.size[0] : f.size[1], t = itemTiles(q.it, q.r);
      var at = [G.x0 + q.x * ROOM_TILE + Math.floor((t[0] * ROOM_TILE - lx) / 2), G.y0 + q.y * ROOM_TILE + Math.floor((t[1] * ROOM_TILE - ly) / 2), G.zt[q.x + q.y * G.nx]];
      var bb = [at[0], at[1], at[2], at[0] + lx, at[1] + ly, at[2] + f.size[2] + 1], nm = D.name + f.name + '-' + (list.length + 1);
      var m = { T: T, k: sh.models.length, name: nm, path: deckId(D) + '/' + nm, kind: 'furn', item: q.it, hold: 0, room: null, hp: f.hp, hpMax: f.hp, mesh: furnMesh(T, q.it, q.r ? 'y' : 'x'), origin: at, bb: bb, pts: {}, meta: { kind: 'furniture', item: q.it },
        c: [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2], foot: VK.pack(Math.floor(bb[0] + 1), Math.floor(bb[1] + 1), at[2] - 1), alive: true };
      sh.models.push(m);
      if (f.role === 'bench') { bench.push(m); return; }
      if (f.role === 'loft') { loft.push(m); return; }
      list.push({ m: m, it: q.it, f: f, deck: D.key, hand: f.power !== 'steam', need: 0, have: 0, tpm: 0, why: '' });
    });
  });
  if (list.length) sh.pumps = { list: list, x: 0, t: 0, called: 0 };
  if (bench.length) sh.benches = bench;
  if (loft.length) sh.lofts = loft;
}
/** 開戰時（makeCrew 最後，medInit 之後）：人力抽水機旁邊的走路點（從待命那一層走得到）；走不到 ⇒ 記原因（派不了人 ⇒ 不抽）。 */
function pumpInit(sh, crew) {
  pumpNavFill(sh, crew);                                                 // 哪一層砲甲板主桅旁都擺不下的那幾型 ⇒ 照走路格補一台（TASK-1069）
  var P = sh.pumps, NV = sh.nav; if (!P) return;
  P.list.forEach(function (p) {
    if (!p.hand) return;
    if (!NV) { p.why = '這艘沒有走路格（沒有預備水手）⇒ 派不了人'; return; }
    var lv = lvOf(NV.levels, p.m.origin[2]);
    if (lv < 0 || NV.reach.indexOf(lv) < 0) { p.why = '那一層甲板走不到'; return; }
    var N = NV.levels[lv].N, ci = navSnap(N, [p.m.c[0], p.m.c[1], p.m.origin[2]], 8);
    if (ci < 0 || !handRoute(sh, NV.home, lv, p.m.c[0], p.m.c[0], undefined, N.reg[ci])) { p.why = '抽水機旁邊走不到'; return; }
    p.lv = lv; p.cell = ci;
  });
  NV && NV.ladders.forEach(function (L) { L.q = 0; });                  // handRoute 會記排隊人數；這裡只是試走
}
// 泡水照 33_flood.js 的通用判定（wetAt、wetLatch）：抽水機 ＝ 海面或艙內的水滿一半；鍋爐 ＝ 只看艙內（⛔ 看海面：鍋爐本來就在水線下的艙底，莫尼特號開場就判成「沒有蒸汽」）。
var PUMP_WET_IN = 0.5;
/** 蒸汽還有幾成（0–1）：每座鍋爐沒被打壞（31_drive.js）、沒泡在水裡；沒標鍋爐 ⇒ 1；不是蒸汽船 ⇒ 0。 */
function pumpSteamK(sh) {
  var D = sh.drive; if (!D || D.kind !== 'steam') return 0;
  var C = D.C; if (!C || !C.B.length) return 1;
  if (C.cells) return C.steam;                                           // 動力件（31_drive.js drvPartsTick，TASK-0653）：全船的蒸汽（鍋爐剩幾成＋曲線、泡水熄火、蒸汽管）
  var on = 0, all = 0;
  C.B.forEach(function (c) { c.b.seats.forEach(function (p, j) { all++; if (c.ok[j] && !wetAt(sh, p, { sea: false, inner: PUMP_WET_IN })) on++; }); });
  return all ? on / all : 1;
}
/** 積水多（抽水機優先於醫療艙）：有人力抽水機、艙裡的水 ≥ 設計排水量 × PUMP_URGENT（至少 PUMP_WET）。pumpTick 算、記在 sh.pumps.urgent。 */
function pumpUrgent(sh) { return !!(sh.pumps && sh.pumps.urgent); }
/** 艙裡有沒有水（要不要派人去搖）。 */
function pumpWater(sh) { return shipWaterT(sh) >= PUMP_WET; }
/** 每次點名（0.5 秒，32_hull.js survey，callHands 之前）：每台抽水機要幾個人、現在抽多少 ⇒ sh.pumps.x（全船另外加的噸／分，33_flood.js pumpK）。 */
function pumpTick(sh) {
  var P = sh.pumps; if (!P) return;
  var wet = pumpWater(sh), stK = null, sum = {};
  P.list.forEach(function (p) {
    var k = 0, n = p.f.crew || 1;
    if (p.m.alive) wetLatch(p, wetAt(sh, [p.m.c[0], p.m.c[1], p.m.origin[2] + 1], { inner: PUMP_WET_IN }));   // 泡水：連兩次在水裡才算、連兩次乾了才回來
    var mine = p.hand ? sh.crew.filter(function (c) { return c.role === ROLE.HAND && crewAble(c) && c.hand.job && c.hand.job.pump === p; }) : [];
    p.need = p.hand && wet && p.m.alive && !p.wet && p.cell !== undefined && !sh.struck ? n : 0;
    if (mine.length > p.need) mine.sort(function (a, b) { return (a.hand.job.at ? 1 : 0) - (b.hand.job.at ? 1 : 0); }).slice(0, mine.length - p.need).forEach(function (c) { c.hand.job = null; c.hand.legs = []; c.hand.wait = 1; });   // 多出來的放回去（還沒到的先放）
    var at = mine.filter(function (c) { return c.hand.job && c.hand.job.at; }); p.have = at.length;
    var pe = p.hand && sh.effOn ? effAvg(sh, at) : 1;                   // 工作效率（TASK-0720，39_eff.js）：到崗的人平均；蒸汽、沒開 ⇒ 字面上的 1
    if (!p.m.alive) p.why = '打壞了';
    else if (p.wet) p.why = '泡在水裡';
    else if (p.hand) { if (p.cell !== undefined) { k = Math.min(1, p.have / n); p.why = !wet ? '艙裡沒水（不派人）' : p.have < n ? '人手 ' + p.have + '／' + n : ''; } }   // 走不到 ⇒ 照 pumpInit 記的原因
    else { if (stK === null) stK = pumpSteamK(sh); k = stK; p.why = k < 1 ? (k <= 0 ? '沒有蒸汽（鍋爐壞了或淹了）' : '蒸汽剩 ' + Math.round(k * 100) + '%') : ''; }
    p.tpm = (+p.f.tpm || 0) * k * pe * Math.max(0, p.m.hp / p.m.hpMax);   // 打傷了照剩下的血量打折；pe 乘在 k 的 Math.min(1, …) 外面（⛔ 放裡面 ⇒ 人到齊時加成被封頂吃掉）
    (sum[p.it] = sum[p.it] || { v: 0, cap: +p.f.cap > 0 ? +p.f.cap : Infinity }).v += p.tpm;
  });
  P.x = Object.keys(sum).reduce(function (a, k) { return a + Math.min(sum[k].v, sum[k].cap); }, 0);
  var W = shipWaterT(sh);
  P.urgent = P.list.some(function (p) { return p.need > 0; }) && W >= Math.max(PUMP_WET, PUMP_URGENT * (sh.T.disp || 0));
  if (P.urgent) {                                                   // 還缺幾個人（派了、在路上的都算）⇒ 從醫療艙值班的人叫過來（還沒到的先叫）
    var go = 0; sh.crew.forEach(function (c) { if (c.role === ROLE.HAND && crewAble(c) && c.hand.job && c.hand.job.kind === 'pump') go++; });
    var short = P.list.reduce(function (a, p) { return a + p.need; }, 0) - go;
    if (short > 0) sh.crew.filter(function (c) { return c.role === ROLE.HAND && crewAble(c) && c.hand.job && c.hand.job.kind === 'staff' && !c.hand.climb; })
      .sort(function (a, b) { return (a.hand.job.at ? 1 : 0) - (b.hand.job.at ? 1 : 0); }).slice(0, short)
      .forEach(function (c) { c.hand.job = null; c.hand.legs = []; c.hand.wait = 0; P.pulled = (P.pulled || 0) + 1; });
  }
  P.sum = sum; P.t = SIMT;
}
/** 點名時（callHands，medNeeds 之後）：人力抽水機還缺的人 ⇒ 加進 need（cell ＝ 抽水機旁那一點）。 */
function pumpNeeds(sh, need) {
  var P = sh.pumps; if (!P) return;
  var go = {}; sh.crew.forEach(function (c) { if (c.role === ROLE.HAND && crewAble(c) && c.hand.job && c.hand.job.kind === 'pump') { var k = c.hand.job.key; go[k] = (go[k] || 0) + 1; } });
  P.list.forEach(function (p) {
    var n = p.need - (go[p.m.path] || 0);
    if (n > 0) need.push({ kind: 'pump', key: p.m.path, lv: p.lv, n: n, x: p.m.c[0], cell: p.cell, pump: p, pri: 1 });
  });
}
/** 到了（handJoin）：站在抽水機旁搖；不在那一層（路斷了）⇒ 這一趟作廢。 */
function pumpJoin(sh, c) {
  var H = c.hand, J = H.job;
  if (J.at) return;
  if (H.lv !== J.lv || !J.pump.m.alive) { H.job = null; H.wait = 1; return; }
  J.at = true; c.home = c.pos.slice(); sh.pumps.called++;
}
/** 全船現在的抽水量（噸／分）：（基礎 ＋ 抽水機）× 抽水倍率（FL_PUMPK，TASK-1058；⇒ 讀數、HUD 跟實際抽得掉的對得上）。 */
function pumpNow(sh) { return ((sh.cfg.pump === undefined ? PUMP_REF : sh.cfg.pump) + (sh.pumps ? sh.pumps.x : 0)) * FL_PUMPK; }
/** HUD 一行：抽水（有擺抽水機才顯示）。 */
function pumpText(sh) {
  var P = sh.pumps; if (!P) return '';
  var hn = 0, hh = 0, up = 0; P.list.forEach(function (p) { hn += p.need; hh += p.have; if (p.tpm > 0) up++; });
  return '　抽水 ' + pumpNow(sh).toFixed(1) + ' 噸／分（抽水機 ' + up + '/' + P.list.length + ' 台在抽' + (hn ? '、人手 ' + hh + '/' + hn : '') + (P.urgent ? '、積水多：先派抽水機' : '') + '）';
}
/** 讀數（__game.pumps）：基礎、抽水機每台的狀態與原因；沒擺 ⇒ 只有基礎。 */
function pumpInfo(sh) {
  var P = sh.pumps;
  return { base: sh.cfg.pump, now: +pumpNow(sh).toFixed(2), water: +shipWaterT(sh).toFixed(1), urgent: !!(P && P.urgent), pulled: P ? P.pulled || 0 : 0, steam: P && P.list.some(function (p) { return !p.hand; }) ? +pumpSteamK(sh).toFixed(2) : null,
    pumps: P ? P.list.map(function (p) { return { name: p.m.name, item: p.it, hand: p.hand, alive: p.m.alive, hp: p.m.hp, need: p.need, have: p.have, tpm: +p.tpm.toFixed(2), why: p.why }; }) : [] };
}

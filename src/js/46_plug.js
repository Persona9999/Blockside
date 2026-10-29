// ───────────────────────── 補漏：脫離交戰後全員抽水、木匠用補丁堵水線下的破口（Blocksail TASK-1099；Tim 2026-10-29） ─────────────────────────
// Tim：「脫離戰鬥後 船隻的抽水能力可以大幅提升(避免戰損沈船) 然後木工可以開始補漏水部分(暫時補漏水 實際可以填充很低強度的物質 或是單純讓那裏先不漏水)」
//   「修補方案會影響下次進戰鬥」「低強度物質就是讓水暫時不漏進來 但是下次重彈會輕易被打破(且可以考慮現實中如何處理)」
//   拍板（同日）：低強度補丁格、只在脫離交戰後補、回地球儀時照木材一次補完、抽水 ×4 照人數。
// 史實：打完仗全員輪班搖抽水機（砲班空出來）；木匠從艙內把纏麻絮、抹油脂的錐形木塞（shot plug）敲進彈孔，大一點的洞釘鉛皮、背後墊焦油帆布 ——
//   都是臨時的，再挨一發就掉，進港換船板才算修好（港口修船另外做）。
// ① 全員抽水（plugTick，每次點名 32_hull.js survey）：不在交戰（plugCalm：航海、城鎮模式）⇒ sh.pumpAll ＝ 1 ＋ (PLUG_PUMP − 1) × 站得住的人 ÷ 開局人數
//    （33_flood.js pumpK 乘它：基礎抽水＋甲板上的抽水機一起）；人死光了也不會比平常少。交戰、一般海戰 ⇒ 1（pumpK 不乘，抽水照舊；木匠也不接補漏）。
// ② 破口（plugScan）：每個 (x, z) 兩舷船殼最外那一格（33_flood.js flSkin，船型的外形）往艙內走，沒碰到還在的格、先走到開戰時就空著的（艙內）⇒ 通 ＝ 漏
//    （同 flHoleRedo 的判法，⛔ 不讀 sh.fl：進水第 0 檔（公式）也要補）；只看現在的水線往上 PLUG_ABOVE 格以下（船晃、浪打得到的）。
//    PLUG_C × PLUG_C 格（沿船長 × 高，1 m 見方）一塊 ＝ 一件工作；要補的格 ＝ 每一點從外往內被打掉、開戰時有的那幾格（到艙內為止）。格子變了（sh.lost）、水線動了 2 格以上才重掃。
//    ⛔ 0.5 m 一塊（上一版）：半徑 0.4 m 的洞切成 5～8 塊、邊角一兩格也各跑一趟 ⇒ 三個洞 60 秒只堵好 7／16 塊、進水只從 4.0 降到 3.2 m³/s（量的，2026-10-29）
// ③ 木匠（46_carpenter.js carpTick 接件，plugJobs）：不在交戰才有這一種，排在梯子之前（先保船：pri −1 − 水頭幾公尺 ÷ 20 ⇒ 離水線越深越先、同一公尺照距離）。
//    站在那一塊艙內那一側走得到的走路點（plugSpot：腳下地板往上 CARP_ANC_UP、往下 CARP_ANC_DN 格內，同帆的綁定點；
//    洞在甲板底下（艙底多半不是走路格）⇒ 最下面那一層離它最近的點、從艙口下去補，每往下 1 m 多 PLUG_DOWN 秒；走路格都沒有 ⇒ 不接，回地球儀時照樣補）；
//    洞上面 1 m 那一格的艙內積水滿 PLUG_WET 以上 ⇒ 先不接（搆不到洞，等抽水把水降下來）。到了 ⇒ PLUG_T0 ＋ PLUG_K × 洞口幾格（plugTime）秒 ⇒ 那一塊每一格補成補丁、用 1 份木材。
//    ⛔ 補好不記 K.done：同一塊之後又被打開（下一次脫離交戰）照樣要補 ⇒ 重掃不到就是補好了。
// ④ 補丁（sh.plugs：VK.pack 的集合）：補回去的格、顏色 PLUG_COL（焦油帆布的深褐）；硬度、材質照 PLUG_MAT（05_material.js matK／matAt 先看它）
//    ⇒ 補著不漏；任何一格挨打（20_shatter.js removeVoxel ⇒ plugHit）⇒ 下一次點名連著的補丁整片脫落（plugLoose，交戰中也算）⇒ 整個洞又開了 —— 木塞、鉛皮挨一發就掉。
//    量的（2026-10-29，兩艘的海戰、水線上 0.6 m、__game.shot 3 m 外各 6 發）：打補丁、打旁邊 1 m 的橡木都會漏（這個距離砲彈本來就打穿橡木），
//    漏的洞口 6 磅砲 636 vs 265 格、迴旋砲 511 vs 163 格（投石機 89 vs 579，6 發太少、不算數）。
//    記號打掉之後留著（打掉那一下的消耗是拆完才查硬度：20_shatter.js、21_gunnery.js），
//    那一格被別的方式補回來（46_carpenter.js restoreVoxel）才拿掉 ⇒ 照原本的材質；船況只帶還在的（57_core.js corePlugOut）。
// ⑤ 回地球儀（03_camera.js 報 'left' 之前，plugAll）：還有漏口、木匠還站得住、木材（木匠身上＋木工台）還有 ⇒ 照水頭深的先一次補完、木材用完為止（地圖上的時間夠，不用走過去）。
// ⑥ 船況（57_core.js）：戰後狀態多一格 plugs（哪幾格是補丁，同 cells 的編法）⇒ 下一場 coreShipIn 補回來之後照樣是補丁。舊的船況沒有這一格 ⇒ 照舊。
// 讀數：__game.plug(i) ⇒ { calm, pumpAll, open（還在漏的塊）, cells（那些塊要補幾格）, plugs（還在的補丁格數）, fixed（木匠堵好幾塊）, all（回地球儀那一次補了幾塊）, lost（脫落幾格）, list }；?plug=0 ⇒ 關掉（A/B）
var PLUG_PUMP = 4, PLUG_C = 10, PLUG_ABOVE = 10, PLUG_T0 = 4, PLUG_K = 0.5, PLUG_WET = 0.6, PLUG_DOWN = 1, PLUG_SNAP = 15;   // PLUG_SNAP：站位從洞往內找幾個走路點（一點 NAV_C 格 ⇒ 3 m）；PLUG_DOWN：洞在甲板底下 ⇒ 每往下一公尺多幾秒（爬下去、爬上來）〔設計〕
var PLUG_COL = (2 << 5) | (1 << 2);                                     // 深褐（3-3-2 色：R 2／7、G 1／7、B 0）
var PLUG_MAT = { name: '補丁（木塞、焦油帆布）', kind: 'wood', density: 0.5, hard: 0.1, flammable: 0.8 };   // hard：橡木 1 的一成〔設計〕
/** 現在算不算脫離交戰：航海、城鎮模式（88_modeswitch.js 交戰是 'fight'；一般海戰的玩法也不算）。?plug=0 ⇒ 永遠不算（A/B：不抽水、不補漏，跟以前一樣）。 */
var PLUG_ON = Q.get('plug') !== '0';
function plugCalm() { return PLUG_ON && (MODE === 'sail' || MODE === 'town'); }
/** 現在的水線（格 z；同 32_hull.js 公式模式那一行，⛔ 不算浪的起伏 bob：一直在變 ⇒ 每次點名都重掃）。 */
function plugWz(sh) { return Math.min(sh.T.sz - 1, Math.floor(sh.T.zw + (sh.sink - sh.lift) / S)); }
/** 補丁那一格被打掉（20_shatter.js removeVoxel）⇒ 記下來，下一次點名（plugTick）整片脫落。 */
function plugHit(sh, x, y, z) { if (sh.plugLoosing) return; var p = VK.pack(x, y, z); if (sh.plugs.has(p)) (sh.plugHit || (sh.plugHit = [])).push(p); }   // plugLoosing：脫落那一下自己拆的不再記
/** 整片脫落（每次點名，交戰中也算）：挨打的那一格起、六個方向連著的補丁格全部打掉（removeVoxel ⇒ 進水、尋路照常）⇒ 整個洞又開了。 */
function plugLoose(sh) {
  var H = sh.plugHit; sh.plugHit = null; if (!H || !sh.plugs || !sh.plugs.size || isOut(sh)) return;
  var G = sh.grid, seen = {}, n = 0, D = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; sh.plugLoosing = true;
  H.forEach(function (p0) {
    var q = [p0]; seen[p0] = 1;
    for (var h = 0; h < q.length; h++) {
      var p = q[h], x = p & 2047, y = (p >> 11) & 1023, z = p >> 21;
      if (h && G.get(x, y, z) && removeVoxel(sh, x, y, z, false)) n++;
      D.forEach(function (d) { var x2 = x + d[0], y2 = y + d[1], z2 = z + d[2], p2 = VK.pack(x2, y2, z2); if (!seen[p2] && sh.plugs.has(p2) && G.get(x2, y2, z2)) { seen[p2] = 1; q.push(p2); } });
    }
  });
  sh.plugLoosing = false;
  if (n) { sh.plugLost = (sh.plugLost || 0) + n; note(sh, '補丁被打掉了（' + n + ' 格），又開始漏水'); }
}
/** 每次點名：補丁整片脫落（plugLoose）、全員抽水的倍率（sh.pumpAll）。 */
function plugTick(sh) {
  if (sh.plugHit) plugLoose(sh);
  var k = 1;
  if (plugCalm() && !isOut(sh)) {
    var n0 = 0, ok = 0, r;
    for (r in sh.coreN0 || {}) n0 += sh.coreN0[r];
    for (r = 0; r < sh.crew.length; r++) if (crewAble(sh.crew[r])) ok++;
    k = 1 + (PLUG_PUMP - 1) * (n0 > 0 ? Math.min(1, ok / n0) : 0);
  }
  sh.pumpAll = k;
}
/** 還在漏的塊 ⇒ [{ key, side, pts: [[x, z, [y…]]…], n（要補幾格）, c: [x, y, z]（艙內那一側的中心）, head（離水線幾格，越大越深）, spot: { lv, ci, down }｜null }]。
 *  格子沒變、水線沒動 2 格以上 ⇒ 照上一次（force ⇒ 重掃）。 */
function plugScan(sh, force) {
  var wz = plugWz(sh), P = sh.plugScan;
  if (!force && P && P.lost === sh.lost && Math.abs(P.wz - wz) < 2) return P.L;
  var L = [];
  if (sh.lost > 0) {
    var K = flSkin(sh.T), B = K.B, G = sh.grid, zMax = Math.min(K.zTop - 1, wz + PLUG_ABOVE), by = {}, x, z, side;
    for (z = 0; z <= zMax; z++) for (x = K.x0; x <= K.x1; x++) {
      var k = z * K.nxv + x - K.x0;
      for (side = 0; side < 2; side++) {
        var y0 = side ? K.yM[k] : K.yP[k]; if (y0 < 0 || G.get(x, y0, z)) continue;   // 最外那一格還在 ⇒ 不通（絕大多數一格就判完）
        var s = side ? 1 : -1, ys = [], yi = -1;
        for (var t = 0; t < 30; t++) { var y = y0 + s * t; if (G.get(x, y, z)) break; if (!B.get(x, y, z)) { yi = y; break; } ys.push(y); }
        if (yi < 0 || !ys.length) continue;
        var key = side + ':' + (((x - K.x0) / PLUG_C) | 0) + ':' + ((z / PLUG_C) | 0), b = by[key];
        if (!b) { b = by[key] = { key: 'K' + key, side: side, pts: [], n: 0, sx: 0, sy: 0, sz: 0 }; L.push(b); }
        b.pts.push([x, z, ys]); b.n += ys.length; b.sx += x; b.sy += yi; b.sz += z;
      }
    }
    L.forEach(function (b) { var m = b.pts.length; b.c = [b.sx / m + 0.5, b.sy / m + 0.5, b.sz / m + 0.5]; b.head = Math.max(0, wz - b.c[2]); b.spot = plugSpot(sh, b.c); });
  }
  sh.plugScan = { lost: sh.lost, wz: wz, L: L };
  return L;
}
/** 那一塊艙內那一側、木匠站得到的走路點 ⇒ { lv, ci, down（m：要從那一層往下爬多深）}｜null：
 *  ① 同 carpAnchors：腳下地板往上 CARP_ANC_UP、往下 CARP_ANC_DN 格內，最接近的那一層；
 *  ② 都不在 ⇒ 洞在甲板底下（艙底多半不是走路格：風暴角號能走的最低一層是下層砲甲板，地板 z 58、水線 z 50 ⇒ 水線下的洞一個都搆不到，量的）⇒
 *     那一點附近地板最低、比洞高的那一層（從艙口下去補，畫面上不演）。 */
function plugSpot(sh, c) {
  var NV = sh.nav, best = null, low = null; if (!NV) return null;
  var H = NV.levels[NV.home].N, C0 = carpHomeCells(sh), cw = C0.length ? NV.comp[NV.home + ':' + H.reg[C0[0]]] : undefined;   // 木匠生的那一群（46_carpenter.js carpHomeCells）
  NV.reach.forEach(function (lv) {
    var N = NV.levels[lv].N, ci = plugSnap(NV, lv, c, PLUG_SNAP, cw); if (ci < 0) return;
    var dz = c[2] - N.Z[ci];
    if (dz <= CARP_ANC_UP && dz >= -CARP_ANC_DN) { if (!best || Math.abs(dz) < best.d) best = { lv: lv, ci: ci, d: Math.abs(dz) }; }
    else if (dz < 0 && (!low || N.Z[ci] < low.z)) low = { lv: lv, ci: ci, z: N.Z[ci] };
  });
  return best ? { lv: best.lv, ci: best.ci, down: 0 } : low ? { lv: low.lv, ci: low.ci, down: +((low.z - c[2]) * S).toFixed(2) } : null;
}
/** 第 lv 層、c 附近 r 點內，屬於群 cw（NV.comp）的走路點裡平面最近的那一點；沒有 ⇒ −1。
 *  ⛔ 直接 navSnap（上一版）：風暴角號右舷的洞吸到下層砲甲板一小塊不連通的走路點（自己一群）⇒ 工作一直排著、木匠走不到、沒人接（量的，2026-10-29）。 */
function plugSnap(NV, lv, c, r, cw) {
  var N = NV.levels[lv].N, p = N.sh ? navRestP(N, c) : c, cx = Math.round((p[0] - 0.5 - N.x0) / NAV_C), cy = Math.round((p[1] - 0.5) / NAV_C), best = -1, bd = 1e9;
  for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
    var x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= N.nx || y >= N.ny) continue;
    var i = x + y * N.nx; if (!N.ok[i] || NV.comp[lv + ':' + N.reg[i]] !== cw) continue;
    var d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; }
  }
  return best;
}
/** 木匠的工作（carpTick 接到損壞表後面）：站得到、洞那裡積水沒有太深的塊 ⇒ [{ key, kind: 'plug', b, lv, cell, pri, extra（秒：爬下去、爬上來）}]。 */
function plugJobs(sh) {
  var out = [];
  plugScan(sh).forEach(function (b) {
    var p = b.spot; if (!p) return;
    if (sh.fl && wetAt(sh, [b.c[0], b.c[1], b.c[2] + 10], { sea: false, inner: PLUG_WET })) return;   // 洞上面 1 m 那一格的水快滿了（人搆不到洞）⇒ 等抽水
    out.push({ key: b.key, kind: 'plug', b: b, lv: p.lv, cell: p.ci, pri: -1 - Math.floor(b.head * S) / 20, extra: p.down * PLUG_DOWN });   // 水頭照每公尺一級：同一級照距離（⛔ 照格比 ⇒ 同一個洞深一格的那塊在另一個洞 ⇒ 兩個洞之間來回跑）
  });
  return out;
}
/** 那一塊現在還要補的格（到了才看：路上可能又被打、別人先補了）⇒ [[x, y, z]…]。 */
function plugCells(sh, b) {
  var G = sh.grid, out = [];
  b.pts.forEach(function (q) { q[2].forEach(function (y) { if (!G.get(q[0], y, q[1])) out.push([q[0], y, q[1]]); }); });
  return out;
}
/** 堵一塊要幾秒（還沒乘工作效率）：PLUG_T0 ＋ PLUG_K × 洞口幾格（船殼表面那一層：同一個 (x, z) 往內幾格都只算一格 —— 木塞、鉛皮蓋的是洞口）＋ 爬下去爬上來。
 *  ⛔ 照要補的格數（上一版）：一發砲彈的洞半徑 0.4 m 上下、穿過 2～3 格船板 ⇒ 一個洞 100 多格、60 秒，三個洞 60 秒只堵好 3／8 塊（量的，2026-10-29）。 */
function plugTime(t, cells) {
  var seen = {}, n = 0; cells.forEach(function (p) { var k = p[0] + ':' + p[2]; if (!seen[k]) { seen[k] = 1; n++; } });
  return PLUG_T0 + PLUG_K * n + (t.extra || 0);
}
/** 補成補丁：那一格補回去（顏色 PLUG_COL）、記在 sh.plugs ⇒ 補了沒有。 */
function plugSet(sh, x, y, z) {
  if (!restoreVoxel(sh, x, y, z, PLUG_COL)) return false;
  (sh.plugs || (sh.plugs = new Set())).add(VK.pack(x, y, z));
  return true;
}
/** 木匠到了、修滿秒數（carpJoin）：那一塊每一格補成補丁、用 1 份木材（W.n ＜ 1 ⇒ 一格都不補、W.more）⇒ 補了幾格。 */
function plugFix(sh, cells, W) {
  if (!(W.n >= 1)) { W.more = true; return 0; }
  var n = 0; cells.forEach(function (p) { if (plugSet(sh, p[0], p[1], p[2])) n++; });
  return n;
}
/** 那一格是不是補丁（05_material.js matK／matAt）。 */
function plugAt(sh, x, y, z) { return !!(sh.plugs && sh.plugs.size && sh.plugs.has(VK.pack(x | 0, y | 0, z | 0))); }
/** 回地球儀（03_camera.js 'left' 之前）：還在漏的塊照水頭深的先，木匠站得住、木材還有 ⇒ 一塊用 1 份補完 ⇒ 補了幾塊。交戰中、出局了 ⇒ 不補。 */
function plugAll(sh) {
  if (!sh || !plugCalm() || isOut(sh)) return 0;
  var C = sh.crew.filter(function (c) { return c.role === ROLE.CARPENTER && crewAble(c); }); if (!C.length) return 0;
  var B = (sh.benches || []).filter(function (m) { return m.alive && m.wood > 0; }), n = 0;
  function take() {                                                     // 用一份：先拿木匠身上的，再拿木工台的
    for (var i = 0; i < C.length; i++) if (C[i].wood >= 1) { C[i].wood -= 1; return true; }
    for (var j = 0; j < B.length; j++) if (B[j].wood >= 1) { B[j].wood -= 1; if (sh.carp) sh.carp.used++; return true; }
    return false;
  }
  plugScan(sh, true).slice().sort(function (a, b) { return b.head - a.head || (a.key < b.key ? -1 : 1); }).forEach(function (b) {
    var cells = plugCells(sh, b); if (!cells.length || !take()) return;
    cells.forEach(function (p) { plugSet(sh, p[0], p[1], p[2]); }); n++;
  });
  sh.plugAllN = n;
  if (n) note(sh, '木匠在回航途中堵好了 ' + n + ' 處水線下的破口（補丁）');
  return n;
}
/** 讀數（__game.plug）。 */
function plugInfo(sh) {
  var L = sh ? plugScan(sh, true) : [];
  var np = 0; if (sh && sh.plugs) sh.plugs.forEach(function (p) { if (hullGp(sh.grid, p)) np++; });   // 還在的補丁格（打掉的記號留著，見 ④）
  return { calm: plugCalm(), pumpAll: sh ? +(sh.pumpAll || 1).toFixed(3) : 1, open: L.length, cells: L.reduce(function (a, b) { return a + b.n; }, 0), plugs: np, fixed: sh && sh.carp ? sh.carp.plugs || 0 : 0, all: sh ? sh.plugAllN || 0 : 0,
    lost: sh ? sh.plugLost || 0 : 0, list: L.map(function (b) { return { key: b.key, side: b.side ? '左' : '右', c: b.c.map(Math.round), n: b.n, head: +b.head.toFixed(1), spot: b.spot }; }) };
}

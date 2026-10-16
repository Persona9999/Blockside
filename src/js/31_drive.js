// ───────────────────────── 動力（TASK-0630；Tim 2026-10-15「把船隻速度算法重新規範化 根據動力來源(帆 蒸汽機 魔法(幽靈船)) 去推動船」） ─────────────────────────
// 每艘船一份動力源清單（sh.drive.P，driveInit 開戰時建）：
//   · 帆（sail）：每面帆一個，作用點 ＝ 那面帆的面積中心（格座標；作品的姿勢，帆桁轉的不算）。完好度 ＝ 帆的血量（掉了 0；收著的不出力、不算受損）。
//   · 蒸汽機（steam）：輸出物件 ＝ 螺旋槳模型（meta kind=propeller，作用點 ＝ 固定點 hub，幾個就分幾份）；沒有 ⇒ 船尾中線、水線下 1.5 m（T.wl0 往內 4 格）。
//       完好度 ＝ 螺旋槳還在（模型）／船尾那一塊格子還剩幾成（退路，±10 格的方塊，每半秒數一次）×（0.5 ＋ 0.5 × 煙囪還在幾成；沒有煙囪 ⇒ ×1）
//       × 動力的那一條鏈（有標才算；造船規格 §9.6）：主機 → 軸 → 螺旋槳，鍋爐供汽 —— 見下面「動力源與輸出物件」。
//   · 魔法（magic，幽靈船；ships[].drive = "magic"）：當成蒸汽機、沒有實體 ⇒ 作用點 ＝ 船（中線、T.cx），完好度 ＝ 船殼還剩幾成（grid.count／orig）。
//   有額外動力（cfg.base > 0）才有蒸汽機／魔法；種類照 ships[].drive（沒寫 ⇒ steam）。
// 推力與加速度（每一步，sail() 呼叫 driveStep）：
//   每個動力源有一個「單獨推動時的航速」v（帆：舊公式的滿帆航速 × 帆的比例；額外動力：cfg.base 節 × 俥鐘），推力 F ＝ k·v²，水阻 ＝ k·v|v|
//   ⇒ 最高航速 ＝ √Σv²：跟以前「帆² ＋ 額外動力²」的合成一模一樣（Tim 2026-10-14 的「兩者動力相加」）⇒ 預設設定下最高航速不變；變的是怎麼加減速。
//   k（水阻係數，kN／(m/s)²）＝ drive.kDrag × 排水量^⅔（噸）—— 照憲法號校準：舊的一階追速（時間常數 20 秒）從 0 到 90% 約 46 秒，這裡同一艘也約 46 秒。
//   加速度 ＝ (ΣF − 水阻) ÷ (實際質量 × 細節設定「加速慣性」)；實際質量 ＝ 開戰時的重量 − 打掉的（massLost）＋ 艙內進水（粒子模式 fl.vol；公式模式照下沉換算）。
//   ⇒ 船越重、最高航速越低，加速越慢（τ ∝ 質量 ÷ (k·v)）；進水越多越難加速。
//   錨咬著、拋錨（6）、電腦讓開友艦砲線（throttle < 1）而且比該有的快 ⇒ 照舊 6 秒內收到該有的航速（下錨、轉帆擋風；⛔ 只靠水阻 ⇒ 戰列跟不上指揮官的油門）。
// 受損降輸出：帆照血量（舊的 sailFrac 一樣）；額外動力 ⇒ 每個動力源的完好度合起來是「現在最多出得了幾成推力」，俥鐘要的超過就給到上限（Tim：「會嘗試按照全動力去給輸出(不超過目前最大輸出)」）。
// 力矩（Tim：「帆透過桅杆 會有力矩 且會受風向影響」）：帆除了往前推，還有往下風推的側向力（推力 × drive.side × |sin 相對風向|）；
//   以「完好時的配置」當平衡點（這一段帆都在時的面積中心、所有螺旋槳都在時的推力中心）⇒ 只有受損的不平衡才轉船：
//   前面的帆被打掉 ⇒ 帆的中心往後 ⇒ 船尾被推往下風 ⇒ 船頭往上風偏（迎風偏轉）；雙螺旋槳打掉一邊 ⇒ 往壞的那一邊偏。
//   大小 ＝ 「吃掉幾成舵效」：(力矩 ÷ (總推力 × 水線長／4)) × 最大轉向率 × 細節設定「帆的力矩」（夾 ±1.5 倍）；舵照舊可以修回來。
// 俥鐘（額外動力的控制；Tim：「拆成兩套」「額外動力…模擬俥鐘的介面(用點陣圖)」「放在羅盤右側」→ 2026-10-16 改「左側按鈕上方」「橫版的話 就放在左下角吧」「也要支援快捷鍵操作」）：drive.tele 9 格（航速的比例：前進全速…停俥…後退全速）；
//   E ＝ 往前撥一格、T ＝ 往後撥一格；點或拖俥鐘（橫版在畫面左下角、直版在左邊那一欄大圓鈕上方）。推力 ＝ 比例² × 全推力（航速 ∝ 比例）。電腦的船一直全速前進（跟以前一樣）。
// 不抽 rnd()、不讀畫面的設定 ⇒ 同一個種子、同一份設定照樣逐字重現（但戰局跟改之前不一樣：加減速、受損的偏轉都變了）。
// 動力源與輸出物件（Tim 2026-10-15：「可以有多個動力源綁訂到一個動力輸出物件(例如 螺旋槳) 然後物件可以有meta根據輸出動力調整轉速」；2026-10-16「接下來希望可以串上螺旋槳」）：
//   動力源 ＝ 主機（關聯 meta kind=engine，固定點 core；份量照 ihp ＞ nhp ＞ 1）；輸出物件 ＝ 螺旋槳（上面那幾個 steam 項）。都照造船規格 §9.6 的 meta，沒標 ⇒ 照舊（一具看不見的主機推全部的輸出）。
//   綁法：主機 meta propeller（＝ 螺旋槳模型的名字或路徑）⇒ 照它；否則有軸（kind=shaft，aft、fwd）⇒ 軸的 aft 離哪個螺旋槳的 hub（或 shaft-fwd）最近就接哪個、主機接 fwd 離 core 最近的那根軸；
//     都沒有 ⇒ 平分給每個輸出物件。⇒ 多具主機可以推同一個螺旋槳（推力在螺旋槳合起來），一具主機也可以分給好幾個。
//   壞了沒有（每半秒、跟 survey 一起）：主機 core、每座鍋爐 boiler-n、軸 aft／fwd 旁 ±8 格的格子剩不到開局的一半 ⇒ 那一件壞了（規格的建議判法；開局就 0 格 ⇒ 量不出來、當作好的）。
//     主機壞 ⇒ 它那一份沒了；軸斷 ⇒ 接在那根軸上的螺旋槳收不到；鍋爐 ⇒ 全船的蒸汽照還在的座數打折（每組鍋爐都供給每具主機）；螺旋槳（模型）被打飛 ⇒ 綁在它上面的動力出不來。
//   煙（78_funnel.js）：主機全壞 ⇒ 每根煙囪停煙；某組鍋爐全壞 ⇒ 它 meta funnel 那根停煙。
//   轉速（畫面）：螺旋槳照自己那一份推力轉 —— 推力 ∝ 轉速² ⇒ 轉速 ＝ rpm_max × √(推力 ÷ 完好時全速的推力)，倒車反轉；1.5 秒內跟上（DRV_SPIN_T）。
//     rpm_max ＝ 螺旋槳模型 meta rpm_max（沒有 ⇒ drive.rpm，預設 80 —— ⚠ 不是史料）。轉法照規格：往前走時照右手定則繞 +axis 轉、繞固定點 hub；借小艇擺動那一套（modelLocal 的 m.sw／spv／sax）畫。
//     只給人看：轉角不回到模擬裡（被打中、碰撞照舊用模型外框）。
// ⏳ 第二版（TASK-0630 驗收）：繩帆物理開著時用布上的風壓算帆的推力（各檔一個乘數）、物件重量預先算好、風洞沙盒。
var DRIVE_CFG = CFG.drive || {};
var DRV_KD = +DRIVE_CFG.kDrag || 0.0615, DRV_SIDE = DRIVE_CFG.side === undefined ? 0.6 : +DRIVE_CFG.side;
var TELE = DRIVE_CFG.tele || [1, 0.6, 0.35, 0.15, 0, -0.15, -0.35, -0.6, -1];
var TELE_NAME = DRIVE_CFG.teleNames || ['前進全速', '前進半速', '前進慢速', '前進微速', '停俥', '後退微速', '後退慢速', '後退半速', '後退全速'];
var TELE_FULL = TELE.indexOf(1) >= 0 ? TELE.indexOf(1) : 0;               // 開局：全速前進（跟以前額外動力一直開著一樣）
var DRV_RPM0 = +DRIVE_CFG.rpm > 0 ? +DRIVE_CFG.rpm : 80, DRV_SPIN_T = 1.5, DRV_PART_R = 8;   // 螺旋槳預設最高轉速（rpm；⚠ 不是史料）、轉速跟上的時間常數（秒）、部件壞了沒有數幾格（±格）
/** 一面帆的面積中心（格座標；雙層布的兩層一起算，中心不變）。 */
function sailCentroid(s) {
  var v = s.verts, A = 0, cx = 0, cy = 0, cz = 0;
  for (var j = 0; j < s.tris.length; j += 3) {
    var a = s.tris[j] * 3, b = s.tris[j + 1] * 3, d = s.tris[j + 2] * 3;
    var w = len(cross([v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]], [v[d] - v[a], v[d + 1] - v[a + 1], v[d + 2] - v[a + 2]])) / 2;
    A += w; cx += w * (v[a] + v[b] + v[d]) / 3; cy += w * (v[a + 1] + v[b + 1] + v[d + 1]) / 3; cz += w * (v[a + 2] + v[b + 2] + v[d + 2]) / 3;
  }
  return A > 0 ? [cx / A, cy / A, cz / A] : [s.bb ? (s.bb[0] + s.bb[3]) / 2 : 0, s.bb ? (s.bb[1] + s.bb[4]) / 2 : 0, s.bb ? (s.bb[2] + s.bb[5]) / 2 : 0];
}
/** 船尾退路的完好度：作用點 ±10 格方塊裡的格子數。 */
function driveCount(G, p) {
  var x = Math.floor(p[0]), y = Math.floor(p[1]), z = Math.floor(p[2]), n = 0;
  for (var dz = -10; dz <= 10; dz++) for (var dy = -10; dy <= 10; dy++) for (var dx = -10; dx <= 10; dx++) if (G.get(x + dx, y + dy, z + dz)) n++;
  return n;
}
/** 部件固定點旁 ±DRV_PART_R 格的格子數（主機、鍋爐、軸壞了沒有）。 */
function drvCount(G, p) {
  var x = Math.floor(p[0]), y = Math.floor(p[1]), z = Math.floor(p[2]), r = DRV_PART_R, n = 0;
  for (var dz = -r; dz <= r; dz++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) if (G.get(x + dx, y + dy, z + dz)) n++;
  return n;
}
/** 船型 T 的動力部件（造船規格 §9.6；關聯 meta，固定點已經是格心；載入時算一次）：主機、鍋爐（每座一點）、軸。 */
function drvParts(T) {
  if (T.drvParts) return T.drvParts;
  var E = [], B = [], SH = [];
  (T.h.parts || []).forEach(function (q) {
    var m = q.meta, pt = q.points || {}; if (!m) return;
    if (m.kind === 'engine' && pt.core) E.push({ name: q.path, p: pt.core.slice(), w: +m.ihp > 0 ? +m.ihp : +m.nhp > 0 ? +m.nhp : 1, prop: m.propeller ? String(m.propeller) : '' });
    else if (m.kind === 'boiler') {
      var seats = [], nb = Math.max(1, Math.round(+m.boilers || 1));
      for (var j = 1; j <= nb; j++) if (pt['boiler-' + j]) seats.push(pt['boiler-' + j].slice());
      if (!seats.length && pt.uptake) seats.push(pt.uptake.slice());
      if (seats.length) B.push({ name: q.path, seats: seats, funnel: m.funnel ? String(m.funnel) : '' });
    } else if (m.kind === 'shaft' && pt.aft && pt.fwd) SH.push({ name: q.path, aft: pt.aft.slice(), fwd: pt.fwd.slice() });
  });
  var G0 = T.hullG || T.base;                                             // 開局的格子：船殼（24_armor.js 把會轉的裝甲拆出去 ⇒ T.hullG；sh.grid 也是從它來的）；沒有 ⇒ 整艘
  E.forEach(function (e) { e.n0 = drvCount(G0, e.p); });
  B.forEach(function (b) { b.n0 = b.seats.map(function (p) { return drvCount(G0, p); }); });
  SH.forEach(function (s) { s.n0 = [drvCount(G0, s.aft), drvCount(G0, s.fwd)]; });
  return (T.drvParts = { E: E, B: B, SH: SH });
}
function drvD2(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; }
function drvUp(n, n0) { return !(n0 > 0) || n * 2 >= n0; }               // 剩一半以上 ＝ 好的；開局就 0 格 ⇒ 量不出來、當作好的
/** 綁定（driveInit 呼叫；steam 輸出物件都建好之後）：每個輸出物件接哪根軸、每具主機推哪幾個輸出物件 ⇒ 每個輸出物件完好時分到的份量 w。 */
function drvBind(sh, outs) {
  var PT = drvParts(sh.T), C = { E: [], SH: [], B: [], fnOff: null };
  outs.forEach(function (o) {                                             // 軸：aft 離 hub（或 shaft-fwd）最近、24 格以內
    var at = o.m ? o.m.pts['shaft-fwd'] || o.p : o.p, best = -1, bd = 24 * 24;
    PT.SH.forEach(function (s, j) { var d = drvD2(s.aft, at); if (d < bd) { bd = d; best = j; } });
    o.shaft = best;
  });
  PT.SH.forEach(function (s) { C.SH.push({ s: s, ok: 1 }); });
  PT.B.forEach(function (b) { C.B.push({ b: b, ok: b.seats.map(function () { return 1; }) }); });
  var W = PT.E.reduce(function (a, e) { return a + e.w; }, 0);
  PT.E.forEach(function (e) {
    var to = [];
    if (e.prop) outs.forEach(function (o, j) { if (o.m && (o.m.path === e.prop || o.m.name === e.prop)) to.push(j); });
    if (!to.length && PT.SH.length) {                                     // 接 fwd 離 core 最近的那根軸 ⇒ 那根軸上的輸出物件
      var bs = -1, bd = 1e18;
      PT.SH.forEach(function (s, j) { var d = drvD2(s.fwd, e.p); if (d < bd) { bd = d; bs = j; } });
      outs.forEach(function (o, j) { if (o.shaft === bs) to.push(j); });
    }
    if (!to.length) outs.forEach(function (o, j) { to.push(j); });
    C.E.push({ e: e, f: e.w / W, to: to, ok: 1 });
  });
  outs.forEach(function (o, j) {
    o.j = j;
    o.w = C.E.length ? C.E.reduce(function (a, c) { return a + (c.to.indexOf(j) >= 0 ? c.f / c.to.length : 0); }, 0) : 1 / outs.length;
    o.rpmMax = o.m && +o.m.meta.rpm_max > 0 ? +o.m.meta.rpm_max : DRV_RPM0; o.rpm = 0; o.ang = 0;
    if (o.m && !o.m.hang) { var mt = o.m.meta, ax = norm([+mt.axis_x || 0, +mt.axis_y || 0, +mt.axis_z || 0]); o.ax = len(ax) > 0.5 ? ax : [1, 0, 0]; }
  });
  return C;
}
/** 開戰時（makeShip 最後）：建動力源清單、水阻係數。 */
function driveInit(sh) {
  var T = sh.T, P = [], info = hullInfo(T.id) || {};
  sh.sails.forEach(function (s) { if (s.flag || !s.area) return; var c = sailCentroid(s); P.push({ kind: 'sail', s: s, p: c, w: 1, F: 0, Fy: 0, ok: 1 }); });
  var base = +sh.cfg.base || 0;
  if (base > 0) {
    var kind = info.drive === 'magic' ? 'magic' : 'steam';
    if (kind === 'magic') P.push({ kind: 'magic', p: [T.cx, T.cy, T.zw], w: 1, F: 0, Fy: 0, ok: 1 });
    else {
      var props = sh.models.filter(function (m) { return m.meta && m.meta.kind === 'propeller'; });
      if (props.length) props.forEach(function (m) { var h = m.pts.hub || m.c; P.push({ kind: 'steam', m: m, p: h.slice(), w: 1 / props.length, F: 0, Fy: 0, ok: 1, out: m.name }); });
      else if (drvParts(T).SH.length) drvParts(T).SH.forEach(function (s, j, A) { P.push({ kind: 'steam', p: s.aft.slice(), w: 1 / A.length, F: 0, Fy: 0, ok: 1, n0: driveCount(T.hullG || T.base, s.aft), stern: true, out: s.name + '（螺旋槳是格子）' }); });   // 有軸、螺旋槳不是模型（拿破崙號）⇒ 推力在軸的 aft 端
      else { var sp = [T.wl0 + 4, T.cy, Math.max(2, T.zw - 15)]; P.push({ kind: 'steam', p: sp, w: 1, F: 0, Fy: 0, ok: 1, n0: driveCount(T.hullG || T.base, sp), stern: true, out: '船尾' }); }
    }
  }
  var chain = base > 0 && !(info.drive === 'magic') ? drvBind(sh, P.filter(function (p) { return p.kind === 'steam'; })) : null;
  sh.drive = { P: P, C: chain, kind: base > 0 ? (info.drive === 'magic' ? 'magic' : 'steam') : null, k: DRV_KD * Math.pow(Math.max(1, T.disp || 1), 2 / 3),
    L: Math.max(5, ((T.wl1 || T.hx1) - (T.wl0 || T.hx0)) * S), M: null, W: 0, cap: 1, Fx: 0, drag: 0, a: 0, tq: 0, om: 0, vT: 0 };
  sh.tele = TELE_FULL; sh.power = base > 0 ? TELE[sh.tele] : 0;
}
/** 艙內積水（噸）：粒子模式 ＝ fl.vol（還在算的時候）；其他（公式模式、斷了、開始沉）⇒ 照下沉量用浮力表換算（跟 floodPct 同一套）。 */
function shipWaterT(sh) {
  if (sh.fl && !sh.broken && !sh.sinkingFinal && !sh.sunk) return sh.fl.vol * RHO_W;
  if (!(sh.sink > 0) || !sh.T.hyd) return 0;
  var base = sh.T.disp - (sh.mass0 || shipT(sh)) + massLost(sh), L0 = liftFor(sh.T, base);
  return L0 === null ? 0 : Math.max(0, base - tonsAt(sh.T, L0 - sh.sink));
}
/** 每半秒（survey）：實際質量、每個額外動力源的完好度。 */
function driveSurvey(sh) {
  var D = sh.drive; if (!D) return;
  var m0 = sh.mass0 || shipT(sh);
  D.W = shipWaterT(sh); D.M = Math.max(1, m0 - massLost(sh) + D.W);
  var F = funnelsOf(sh.T), fu = 1;                                          // ⛔ 不用 funnelUp：它的快取由 funnelSmoke 更新、慢動作時不跑 ⇒ 戰局會跟著顯示設定變（審查 2026-10-16）
  if (F.length) { var up = 0; F.forEach(function (f) { if (f.model ? sh.models.some(function (q) { return q.path === f.model && q.alive && !q.moved; }) : f.n0 > 0 && funnelCount(sh.grid, f.p) * 2 >= f.n0) up++; }); fu = up / F.length; }
  D.fu = fu;
  var C = D.C, bk = 1, G = sh.grid, cut = [];
  if (C) {                                                                // 動力的那一條鏈：主機、軸、鍋爐（沒標 ⇒ 都是空的、這一段什麼都不改）
    C.E.forEach(function (c) { var u = drvUp(drvCount(G, c.e.p), c.e.n0) ? 1 : 0; if (c.ok && !u) cut.push('主機'); c.ok = u; });
    C.SH.forEach(function (c) { var u = drvUp(drvCount(G, c.s.aft), c.s.n0[0]) && drvUp(drvCount(G, c.s.fwd), c.s.n0[1]) ? 1 : 0; if (c.ok && !u) cut.push('螺旋槳軸'); c.ok = u; });
    var on = 0, all = 0;
    C.B.forEach(function (c) { c.b.seats.forEach(function (p, j) { var u = drvUp(drvCount(G, p), c.b.n0[j]) ? 1 : 0; if (c.ok[j] && !u) cut.push('鍋爐'); c.ok[j] = u; on += u; all++; }); });
    if (all) bk = on / all;
    var F = funnelsOf(sh.T), eAll = C.E.length > 0 && !C.E.some(function (c) { return c.ok; });
    C.fnOff = F.length && (eAll || C.B.length) ? F.map(function (f) {    // 主機全壞 ⇒ 每根停煙；通這根煙囪的鍋爐全壞 ⇒ 這根停煙
      if (eAll) return true;
      var B2 = C.B.filter(function (c) { return c.b.funnel === f.name; });
      return B2.length > 0 && !B2.some(function (c) { return c.ok.some(function (u) { return u; }); });
    }) : null;
  }
  D.P.forEach(function (p, i) {
    if (p.kind === 'magic') p.ok = clamp(sh.grid.count / (sh.orig || 1), 0, 1);
    else if (p.kind === 'steam') {
      var alive = p.m ? p.m.alive && !p.m.moved : true;
      var k = p.m ? (alive ? 1 : 0) : p.n0 ? clamp(driveCount(sh.grid, p.p) / p.n0, 0, 1) : 1;
      if (p.m && p.alive0 !== undefined && p.alive0 && !alive) cut.push('螺旋槳');
      p.alive0 = alive;
      if (C && C.E.length) {                                              // 這個輸出物件收得到幾成：推它的每具主機（還在、軸沒斷）的份量 ÷ 完好時的份量
        var got = 0;
        C.E.forEach(function (c) { if (c.ok && c.to.indexOf(p.j) >= 0) got += c.f / c.to.length; });
        k *= p.w > 0 ? got / p.w : 0;
      }
      if (C && p.shaft >= 0 && C.SH[p.shaft] && !C.SH[p.shaft].ok) k = 0;
      if (C) k *= bk;
      p.ok = k * (0.5 + 0.5 * fu);
    }
  });
  if (cut.length && !sh.sunk && D.kind === 'steam') note(sh, cut.filter(function (v, j) { return cut.indexOf(v) === j; }).join('、') + '被打壞了 ⇒ 額外動力只剩 ' + Math.round(clamp(D.P.reduce(function (a, p) { return a + (p.kind === 'steam' ? p.w * p.ok : 0); }, 0), 0, 1) * 100) + '%');
}
/** 俥鐘撥一格（d：−1 往前、+1 往後；E／T、點俥鐘）。 */
function teleStep(sh, d) { if (!sh || !(sh.cfg.base > 0)) return; teleSet(sh, sh.tele + d); }
function teleSet(sh, i) {
  if (!sh || !(sh.cfg.base > 0)) return;
  i = clamp(Math.round(i), 0, TELE.length - 1); if (i === sh.tele) return;
  sh.tele = i; sh.power = TELE[i]; sh.teleT = performance.now();
  var D = sh.drive, cap = D ? D.cap : 1;
  note(sh, '俥鐘：' + TELE_NAME[i] + (cap < 0.98 && Math.abs(TELE[i]) > Math.sqrt(cap) + 0.005 ? '（' + (D.kind === 'magic' ? '魔力' : '引擎') + '只剩 ' + Math.round(cap * 100) + '% 推力）' : ''));
}
/** 每一步（sail() 裡，算完舊公式的「單獨推動時的航速」之後）：推力、水阻、加速度 ⇒ sh.spd；力矩記在 D.tq（轉向率在 driveYaw，舵算完才知道 rmax）。
 *  vS：帆在這一段、全部完好時的航速（舊公式 target ÷ sailFrac 的那一份；0 ＝ 帆不出力）；vB：額外動力全速的航速（m/s；0 ＝ 沒有或不出力）；
 *  brake：錨咬著、拋錨 ⇒ 6 秒內停。 */
/** 帆的推力照視風（TASK-0639；Tim 2026-10-16：「帆提供的速度要考慮到船目前的相對速度(不能跑的比風速快)」→「加成是讓帆的推力加成(但推力應該是相對於風速的)」「推力改成照船上感受到的風（視風）算」）：
 *  帆推力的倍率 0…1（乘在 k·v² 上；v ＝ 帆單獨推得到的航速，航速倍率照舊乘在裡面 ＝ 推力的加成）。
 *  視風 A ＝ 真風（羅盤上的風速 Vw ＝ windKnots ÷ 1.944，往風吹去的方向）− 船速（往船頭）；α ＝ 視風從哪裡來、離船頭幾度（0 ＝ 正頂風、180 ＝ 正後方）。
 *  倍率 ＝ (|A|／|A₀|)² × 吃得到風(α)／吃得到風(α₀)，夾在 0…1 ——
 *    · A₀ ＝ 航速倍率 ＝ 船隻設定預設（LIM.speed，1.5）的船、在這個風向用帆單獨跑到的航速（sh.vS1，31_sailing.js）時的視風 ⇒ 預設設定的船（寫實玩法）跑到那個航速時倍率剛好 1（航速不變）；
 *      比預設快的加成（娛樂 ×1.4、夜隼號的 3）才被視風限住（Tim 2026-10-16）。
 *    · 吃得到風：視風從船頭 50° 以內來 ⇒ 0（帆桁最多轉 40°，30_rig_physics.js BRACE_MAX ⇒ 帆被吹回來）、75° 以外 ⇒ 1，中間平滑。
 *  ⇒ 航速倍率高的船越跑越快 ⇒ 視風往船頭轉、順風時視風變小 ⇒ 推力掉 ⇒ 停在帆還吃得到風的航速；跑不贏風（帆看起來不會被反吹）。
 *  基準點自己就吃不到風（往風裡開、POLAR 照舊給 0.25 的那一段；逆風性能 upwind 高的船更常落在這裡）⇒ 照舊，只是船速比基準快之後推力照 ((Vw − 船速)／(Vw − 基準))² 掉、追上風速 ⇒ 0：
 *    頂風怎麼走照舊由頂風失速管，但光靠帆跑不贏風（⛔ 只照舊 ⇒ 夜隼號（逆風 ×3）離正頂風 60° 光靠帆 20.7 節、風 17.5 節）。
 *  ⛔ 341bfec 只限「沿風那一份」⇒ 夜隼號（航速 ×3、娛樂 ×1.4）橫風、側順風光靠帆比風快，視風從船頭來、帆被反吹。 */
var SAIL_AW0 = 50, SAIL_AW1 = 75;                                       // 視風離船頭幾度開始吃得到風、幾度吃滿（度）
function sailCatch(a) { var t = clamp((a - SAIL_AW0) / (SAIL_AW1 - SAIL_AW0), 0, 1); return t * t * (3 - 2 * t); }
function apparent(Vw, deg, v) { var r = deg / 57.2958, ax = Vw * Math.cos(r) - v, ay = Vw * Math.sin(r), l = Math.hypot(ax, ay); return [l, l > 1e-6 ? Math.acos(clamp(-ax / l, -1, 1)) * 57.2958 : 0]; }   // [視風大小, 從離船頭幾度來]
function sailWindK(sh, v, deg) {
  var Vw = windKnots() / 1.944; if (!(Vw > 0)) return 0;
  var R = apparent(Vw, deg, sh.vS1 || 0), c0 = sailCatch(R[1]);
  if (c0 < 0.02 || R[0] < 1e-3) { var v1 = sh.vS1 || 0, s = sh.spd; if (s <= v1 || Vw - v1 < 0.1) return s < Vw ? 1 : 0; var r = (Vw - s) / (Vw - v1); return clamp(r * r, 0, 1) * (s < Vw ? 1 : 0); }
  var A = apparent(Vw, deg, sh.spd), q = A[0] / R[0];
  return clamp(q * q * sailCatch(A[1]) / c0, 0, 1);
}
function driveStep(sh, dt, vS, vB, deg, brake) {
  var D = sh.drive; if (!D) return;
  if (D.M === null) driveSurvey(sh);
  var k = D.k, P = D.P, i, p;
  // 帆：總推力 ＝ k·(vS × sailFrac)²（跟舊公式同一個最高航速），照每面「面積 × 血量」分給每一面；側向力往下風
  var lee = 0;
  if (vS > 0) { var Wl = M4.dir(sh.inv, WIND[0], 0, WIND[2]); lee = Wl[1] > 0 ? 1 : Wl[1] < 0 ? -1 : 0; }   // 風吹去的方向在格 +y（右舷）⇒ 下風在右舷
  var sideK = DRV_SIDE * Math.abs(Math.sin(deg / 57.2958)), sumA = 0, sumOn = 0, rx = 0, ry = 0, ra = 0;
  for (i = 0; i < P.length; i++) {
    p = P[i]; if (p.kind !== 'sail') continue;
    var s = p.s, on = !s.dead && !s.furled, inSet = setHas(s, sh.sailSet);
    p.ok = s.dead ? 0 : s.hp / s.hpMax;
    p.on = on; p.wA = on ? s.area * s.hp / s.hpMax : 0; sumOn += p.wA;
    if (inSet) { rx += s.area * p.p[0]; ry += s.area * p.p[1]; ra += s.area; }   // 完好時這一段帆的中心（平衡點）
    sumA += s.area;
  }
  var frac = sumA > 0 ? sumOn / sh.sailArea0 : 0, Fs = vS > 0 ? k * (vS * frac) * (vS * frac) * sailWindK(sh, vS * frac, deg) : 0, Fx = 0, Tq = 0, Fabs = 0;   // sailWindK：船跑得比風快 ⇒ 帆不推（TASK-0639）
  if (ra > 0) { rx /= ra; ry /= ra; }
  for (i = 0; i < P.length; i++) {
    p = P[i]; if (p.kind !== 'sail') continue;
    p.F = sumOn > 0 ? Fs * p.wA / sumOn : 0; p.Fy = p.F * sideK * lee;
    Fx += p.F; Fabs += p.F;
    Tq += (p.p[0] - rx) * S * p.Fy - (p.p[1] - ry) * S * p.F;            // 船頭往右舷轉的力矩（kN·m）：前面往右推、或右舷那一邊往前推 ⇒ 正（格座標是左手系，照這個寫）
  }
  // 額外動力：俥鐘要的推力（比例² × 全推力），完好度合起來是上限；照每個動力源的「份數 × 完好度」分
  var cap = 0, eq = 0, ex = 0, ey = 0, ew = 0;
  for (i = 0; i < P.length; i++) { p = P[i]; if (p.kind === 'sail') continue; cap += p.w * p.ok; ex += p.w * p.p[0]; ey += p.w * p.p[1]; ew += p.w; }
  D.cap = cap;
  if (ew > 0) { ex /= ew; ey /= ew; }
  var r = sh.power || 0, want = r * Math.abs(r), give = vB > 0 ? Math.sign(want) * Math.min(Math.abs(want), cap) : 0, Fe = give * k * vB * vB;
  for (i = 0; i < P.length; i++) {
    p = P[i]; if (p.kind === 'sail') continue;
    p.F = cap > 0 ? Fe * p.w * p.ok / cap : 0; p.Fy = 0;
    Fx += p.F; Fabs += Math.abs(p.F);
    Tq -= (p.p[1] - ey) * S * p.F;
  }
  D.Fx = Fx; D.give = give; D.want = want;
  var Ff = k * vB * vB;                                                   // 螺旋槳轉速（畫面）：自己那一份推力 ÷ 完好時全速分到的推力 ⇒ √ ⇒ × rpm_max
  for (i = 0; i < P.length; i++) {
    p = P[i]; if (!p.ax || !p.m) continue;
    var live = p.m.alive && !p.m.moved, tr = live && Ff > 0 && p.w > 0 ? p.F / (Ff * p.w) : 0;
    p.rpm += ((tr >= 0 ? 1 : -1) * Math.sqrt(Math.abs(tr)) * p.rpmMax - p.rpm) * Math.min(1, dt / DRV_SPIN_T);
    if (!live) continue;
    p.ang += p.rpm * dt * Math.PI / 30; if (p.ang > Math.PI) p.ang -= 2 * Math.PI; else if (p.ang < -Math.PI) p.ang += 2 * Math.PI;
    p.m.spv = p.m.pts.hub || p.p; p.m.sax = p.ax; p.m.sw = p.ang;          // modelLocal 的「繞 spv、沿 sax 轉 sw」（小艇擺動那一套；21_gunnery.js）
  }
  var vT = Fx >= 0 ? Math.sqrt(Fx / k) : -Math.sqrt(-Fx / k); D.vT = vT;   // 只靠這些推力最後會到的航速
  if (sh.spd0) { sh.spd = vT; sh.spd0 = false; }                          // 開局就在走
  var M = D.M * (DRV_INERTIA || 1);
  if (brake) { sh.spd += (0 - sh.spd) * Math.min(1, dt / 6); D.a = 0; }     // 錨咬著、拋錨 ⇒ 照舊 6 秒內停下
  else if ((sh.throttle || 1) < 1 && sh.spd > vT) { sh.spd += (vT - sh.spd) * Math.min(1, dt / 6); D.a = 0; }   // 電腦放慢（讓砲線、戰列等後面的）⇒ 轉帆擋風，6 秒內收到該有的航速
  else {
    D.drag = k * sh.spd * Math.abs(sh.spd);
    D.a = (Fx - D.drag) / M;
    var nv = sh.spd + D.a * dt;
    if ((sh.spd - vT) * (nv - vT) < 0) nv = vT;                             // 不衝過頭（Euler 一步越過平衡點 ⇒ 停在平衡點）
    sh.spd = nv;
  }
  D.tq = Tq; D.Fabs = Fabs; D.brake = brake;
}
/** 力矩 ⇒ 轉向率（rad/s，加在舵給的轉向率上）：吃掉幾成舵效 ＝ 力矩 ÷ (總推力 × 水線長／4)，夾 ±1.5，× 最大轉向率 × 細節設定「帆的力矩」。
 *  yaw 變大 ＝ 船頭往左舷 ⇒ 往右舷轉的力矩取負。錨咬著、拋錨、沉了 ⇒ 0。 */
function driveYaw(sh, rmax) {
  var D = sh.drive; if (!D) return 0;
  var ref = (D.Fabs || 0) * D.L / 4, om = ref > 1e-6 && !D.brake && !sh.sunk ? -clamp(D.tq / ref, -1.5, 1.5) * rmax * DRV_TQ : 0;
  D.om = om;
  return om;
}
/** 讀數（__game.drive、詳細資訊）：每個動力源的種類、完好度、推力（kN）。 */
function driveInfo(sh) {
  var D = sh.drive; if (!D) return null;
  return { kind: D.kind, k: +D.k.toFixed(3), massT: D.M === null ? null : Math.round(D.M), waterT: Math.round(D.W), cap: +D.cap.toFixed(3), tele: sh.tele, power: sh.power, want: +(D.want || 0).toFixed(3), give: +(D.give || 0).toFixed(3),
    Fx: +D.Fx.toFixed(1), drag: +D.drag.toFixed(1), a: +D.a.toFixed(4), vTkn: +(D.vT * 1.9438).toFixed(2), tq: Math.round(D.tq), omDeg: +(D.om * 57.2958).toFixed(3), funnels: D.fu === undefined ? null : +D.fu.toFixed(2),
    P: D.P.map(function (p) { return { kind: p.kind, name: p.s ? p.s.name : p.out || '', at: p.p.map(function (v) { return Math.round(v); }), ok: +(p.ok || 0).toFixed(2), on: p.kind === 'sail' ? !!p.on : undefined, F: +p.F.toFixed(1), Fy: +p.Fy.toFixed(1),
      w: p.kind === 'sail' ? undefined : +p.w.toFixed(3), rpm: p.ax ? +p.rpm.toFixed(1) : undefined, shaft: p.shaft >= 0 && D.C ? D.C.SH[p.shaft].s.name : undefined }; }),
    chain: D.C ? { engines: D.C.E.map(function (c) { return { name: c.e.name, share: +c.f.toFixed(3), to: c.to, ok: c.ok }; }), shafts: D.C.SH.map(function (c) { return { name: c.s.name, ok: c.ok }; }),
      boilers: D.C.B.map(function (c) { return { name: c.b.name, funnel: c.b.funnel, ok: c.ok.slice() }; }), funnelsOff: D.C.fnOff ? D.C.fnOff.slice() : null } : null };
}
/** 詳細資訊那一行：額外動力的俥鐘與輸出。 */
function driveText(sh) {
  var D = sh.drive; if (!D || !D.kind) return '';
  var nm = D.kind === 'magic' ? '魔力' : '引擎';
  var pr = D.P.filter(function (p) { return p.ax; });
  return '⚙ ' + TELE_NAME[sh.tele] + '（' + nm + ' ' + Math.round(D.cap * 100) + '%' + (D.cap < 0.98 && Math.abs(D.want || 0) > D.cap + 0.005 ? '・給不足' : '') +
    (pr.length ? '・螺旋槳 ' + pr.map(function (p) { return p.m.alive && !p.m.moved ? Math.round(Math.abs(p.rpm)) + ' rpm' : '沒了'; }).join('／') : '') + '）';
}
// ── 俥鐘（#teleBox：上 E、下 T 兩顆鍵帽夾著 canvas 點陣圖；先畫在低解析度的格子上、放大不平滑 ⇒ 像素風；字照正常解析度蓋上去） ──
// 位置（Tim 2026-10-16：「俥鐘 可以先放到左側按鈕上方 然後可以稍微縮小一些 並且在上下顯示快捷鍵」「橫版的話 就放在左下角吧」）：
//   橫版 ⇒ 畫面左下角（CSS #teleBox；除錯那一行 #tip 上面）；直版手機（≤ 760 px，左邊那組大圓鈕是直的一欄）⇒ 貼在那一欄的正上方（teleFit 每格照按鈕的位置擺）。
var TELE_W = 34, TELE_H = 112, TELE_PX = 2;                              // 畫面上的寬高（CSS px）；點陣的一格 ＝ 2 px
var TELE_NARROW = window.matchMedia ? window.matchMedia('(max-width:760px)') : null;
function teleY(i) { return 10 + (TELE_H - 20) * i / (TELE.length - 1); }  // 第 i 格的高度（CSS px）
/** 直版：貼在左邊那一欄大圓鈕（#helmL）的正上方、置中；橫版：左下角（CSS），下面那排大圓鈕（#ctlRow）伸到左邊、會碰到 ⇒ 抬到那排上面（⛔ 800 px 寬時那排鋪滿整個寬度，俥鐘被 A 蓋住）。 */
function teleFit(box) {
  var L = '', B = '', r;
  if (TELE_NARROW && TELE_NARROW.matches) {
    var h = $('helmL'); if (!h) return;
    r = h.getBoundingClientRect(); L = Math.round(r.left + (r.width - box.offsetWidth) / 2) + 'px'; B = Math.round(window.innerHeight - r.top + 6) + 'px';
  } else {
    var row = $('ctlRow'); r = row && row.getBoundingClientRect();
    if (r && r.width && r.left < 12 + (box.offsetWidth || 40) + 8) B = Math.round(window.innerHeight - r.top + 6) + 'px';
  }
  if (box.style.left !== L || box.style.bottom !== B) { box.style.left = L; box.style.bottom = B; }
}
function teleDraw(sh) {
  var c2 = $('telc'), box = $('teleBox'); if (!c2 || !box) return;
  var show = !!(sh && sh.cfg && sh.cfg.base > 0) && RUNNING;
  if (box.style.display !== (show ? '' : 'none')) box.style.display = show ? '' : 'none';
  if (show) teleFit(box);
  var ob = $('obsB');                                                     // 觀察模式那一行（meadow 7e1f879，72_floodui.js；也在左下角）：俥鐘在 ⇒ 挪到俥鐘右邊、不在 ⇒ 照她的 CSS
  if (ob) { var oL = show ? Math.round(box.getBoundingClientRect().right + 8) + 'px' : ''; if (ob.style.left !== oL) ob.style.left = oL; }
  if (!show) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2), W = TELE_W, H = TELE_H;
  if (c2.width !== W * dpr || c2.height !== H * dpr) { c2.width = W * dpr; c2.height = H * dpr; }
  var lw = W / TELE_PX, lh = H / TELE_PX, lo = c2.lo || (c2.lo = document.createElement('canvas'));
  if (lo.width !== lw || lo.height !== lh) { lo.width = lw; lo.height = lh; }
  var q = lo.getContext('2d'); q.clearRect(0, 0, lw, lh);
  // 黃銅外框、象牙色面板：前進（上）白底、停俥一條、後退（下）紅底
  q.fillStyle = '#5a3d12'; q.fillRect(0, 0, lw, lh);
  q.fillStyle = '#b8862e'; q.fillRect(1, 1, lw - 2, lh - 2);
  q.fillStyle = '#e8dfc4'; q.fillRect(3, 3, lw - 6, lh - 6);
  var ys = function (i) { return Math.round(teleY(i) / TELE_PX); }, stopI = TELE.indexOf(0) >= 0 ? TELE.indexOf(0) : (TELE.length - 1) / 2;
  q.fillStyle = '#c9493a'; q.fillRect(3, ys(stopI) + 3, lw - 6, lh - 6 - ys(stopI));
  q.fillStyle = '#222'; for (var i = 0; i < TELE.length; i++) q.fillRect(3, ys(i), 4, 1);
  q.fillRect(3, ys(stopI) - 1, lw - 6, 2);
  // 撥桿：黃銅的把手在現在那一格
  var cur = sh.tele, py = ys(cur), lit = performance.now() - (sh.teleT || -1e9) < 250;
  q.fillStyle = '#3b2a0c'; q.fillRect(lw - 6, 3, 2, lh - 6);             // 撥桿的槽（右邊）
  q.fillStyle = lit ? '#fff1a8' : '#e2b13c'; q.fillRect(lw - 9, py - 2, 7, 4);
  q.fillStyle = '#7a5a18'; q.fillRect(lw - 9, py + 2, 7, 1);
  var g = c2.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c2.width, c2.height);
  g.imageSmoothingEnabled = false; g.drawImage(lo, 0, 0, c2.width, c2.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.font = 'bold 8px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
  var LB = ['全', '半', '慢', '微', '停', '微', '慢', '半', '全'];
  for (i = 0; i < TELE.length; i++) { g.fillStyle = i === cur ? '#000' : i > stopI ? '#fff' : '#3a2a10'; g.fillText(TELE.length === 9 ? LB[i] : (Math.round(Math.abs(TELE[i]) * 100) + ''), 7, teleY(i)); }
  var D = sh.drive;
  if (D && D.cap < 0.98) { g.fillStyle = 'rgba(0,0,0,.55)'; var cy = teleY(stopI), up = (cy - teleY(0)) * (1 - Math.sqrt(D.cap)); g.fillRect(3, teleY(0) - 5, 3, up + 1); g.fillRect(3, teleY(TELE.length - 1) + 5 - up, 3, up); }   // 給不出的那幾格（受損）：左邊一條暗的
}
/** 點或拖俥鐘：照按到的高度挑最近的那一格。 */
(function () {
  var c2 = $('telc'); if (!c2) return;
  var down = false;
  function pick(e) {
    var me = SHIPS[PLAYER_I]; if (!me || !RUNNING) return;
    var r = c2.getBoundingClientRect(), y = (e.clientY - r.top) / (r.height || 1) * TELE_H, best = 0, bd = 1e9;
    for (var i = 0; i < TELE.length; i++) { var d = Math.abs(teleY(i) - y); if (d < bd) { bd = d; best = i; } }
    teleSet(me, best);
  }
  c2.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); down = true; try { c2.setPointerCapture(e.pointerId); } catch (x) { } pick(e); });
  c2.addEventListener('pointermove', function (e) { if (down) pick(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { c2.addEventListener(ev, function () { down = false; }); });
})();

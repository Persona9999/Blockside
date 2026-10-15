// ───────────────────────── 動力（TASK-0630；Tim 2026-10-15「把船隻速度算法重新規範化 根據動力來源(帆 蒸汽機 魔法(幽靈船)) 去推動船」） ─────────────────────────
// 每艘船一份動力源清單（sh.drive.P，driveInit 開戰時建）：
//   · 帆（sail）：每面帆一個，作用點 ＝ 那面帆的面積中心（格座標；作品的姿勢，帆桁轉的不算）。完好度 ＝ 帆的血量（掉了 0；收著的不出力、不算受損）。
//   · 蒸汽機（steam）：綁螺旋槳模型（meta kind=propeller，作用點 ＝ 固定點 hub，幾個就分幾份）；沒有 ⇒ 船尾中線、水線下 1.5 m（T.wl0 往內 4 格）。
//       完好度 ＝ 螺旋槳還在（模型）／船尾那一塊格子還剩幾成（退路，±10 格的方塊，每半秒數一次）×（0.5 ＋ 0.5 × 煙囪還在幾成；沒有煙囪 ⇒ ×1）。
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
// 俥鐘（額外動力的控制；Tim：「拆成兩套」「額外動力…模擬俥鐘的介面(用點陣圖)」「放在羅盤右側」「也要支援快捷鍵操作」）：drive.tele 9 格（航速的比例：前進全速…停俥…後退全速）；
//   E ＝ 往前撥一格、T ＝ 往後撥一格；點或拖羅盤右邊的俥鐘。推力 ＝ 比例² × 全推力（航速 ∝ 比例）。電腦的船一直全速前進（跟以前一樣）。
// 不抽 rnd()、不讀畫面的設定 ⇒ 同一個種子、同一份設定照樣逐字重現（但戰局跟改之前不一樣：加減速、受損的偏轉都變了）。
// ⏳ 第二版（TASK-0630 驗收）：繩帆物理開著時用布上的風壓算帆的推力（各檔一個乘數）、物件重量預先算好、螺旋槳照輸出轉、風洞沙盒。
var DRIVE_CFG = CFG.drive || {};
var DRV_KD = +DRIVE_CFG.kDrag || 0.0615, DRV_SIDE = DRIVE_CFG.side === undefined ? 0.6 : +DRIVE_CFG.side;
var TELE = DRIVE_CFG.tele || [1, 0.6, 0.35, 0.15, 0, -0.15, -0.35, -0.6, -1];
var TELE_NAME = DRIVE_CFG.teleNames || ['前進全速', '前進半速', '前進慢速', '前進微速', '停俥', '後退微速', '後退慢速', '後退半速', '後退全速'];
var TELE_FULL = TELE.indexOf(1) >= 0 ? TELE.indexOf(1) : 0;               // 開局：全速前進（跟以前額外動力一直開著一樣）
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
      else { var sp = [T.wl0 + 4, T.cy, Math.max(2, T.zw - 15)]; P.push({ kind: 'steam', p: sp, w: 1, F: 0, Fy: 0, ok: 1, n0: driveCount(T.base, sp), stern: true, out: '船尾' }); }
    }
  }
  sh.drive = { P: P, kind: base > 0 ? (info.drive === 'magic' ? 'magic' : 'steam') : null, k: DRV_KD * Math.pow(Math.max(1, T.disp || 1), 2 / 3),
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
  var F = funnelsOf(sh.T), fu = 1;
  if (F.length) { var up = 0; F.forEach(function (f, j) { if (funnelUp(sh, f, j)) up++; }); fu = up / F.length; }
  D.fu = fu;
  D.P.forEach(function (p) {
    if (p.kind === 'magic') p.ok = clamp(sh.grid.count / (sh.orig || 1), 0, 1);
    else if (p.kind === 'steam') {
      var k = p.m ? (p.m.alive && !p.m.moved ? 1 : 0) : p.n0 ? clamp(driveCount(sh.grid, p.p) / p.n0, 0, 1) : 1;
      p.ok = k * (0.5 + 0.5 * fu);
    }
  });
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
  var frac = sumA > 0 ? sumOn / sh.sailArea0 : 0, Fs = vS > 0 ? k * (vS * frac) * (vS * frac) : 0, Fx = 0, Tq = 0, Fabs = 0;
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
    P: D.P.map(function (p) { return { kind: p.kind, name: p.s ? p.s.name : p.out || '', at: p.p.map(function (v) { return Math.round(v); }), ok: +(p.ok || 0).toFixed(2), on: p.kind === 'sail' ? !!p.on : undefined, F: +p.F.toFixed(1), Fy: +p.Fy.toFixed(1) }; }) };
}
/** 詳細資訊那一行：額外動力的俥鐘與輸出。 */
function driveText(sh) {
  var D = sh.drive; if (!D || !D.kind) return '';
  var nm = D.kind === 'magic' ? '魔力' : '引擎';
  return '⚙ ' + TELE_NAME[sh.tele] + '（' + nm + ' ' + Math.round(D.cap * 100) + '%' + (D.cap < 0.98 && Math.abs(D.want || 0) > D.cap + 0.005 ? '・給不足' : '') + '）';
}
// ── 俥鐘（羅盤右側；canvas 點陣圖：先畫在低解析度的格子上、放大不平滑 ⇒ 像素風；字照正常解析度蓋上去） ──
var TELE_W = 44, TELE_H = 150, TELE_PX = 2;                              // 畫面上的寬高（CSS px）；點陣的一格 ＝ 2 px
function teleY(i) { return 14 + (TELE_H - 28) * i / (TELE.length - 1); }  // 第 i 格的高度（CSS px）
function teleDraw(sh) {
  var c2 = $('telc'); if (!c2) return;
  var show = !!(sh && sh.cfg && sh.cfg.base > 0);
  if (c2.style.display !== (show ? '' : 'none')) { c2.style.display = show ? '' : 'none'; $('nav').classList.toggle('tele', show); }
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
  q.fillStyle = '#3b2a0c'; q.fillRect(lw - 9, 3, 2, lh - 6);
  q.fillStyle = lit ? '#fff1a8' : '#e2b13c'; q.fillRect(lw - 13, py - 2, 10, 5);
  q.fillStyle = '#7a5a18'; q.fillRect(lw - 13, py + 2, 10, 1);
  var g = c2.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c2.width, c2.height);
  g.imageSmoothingEnabled = false; g.drawImage(lo, 0, 0, c2.width, c2.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.font = 'bold 9px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
  var LB = ['全', '半', '慢', '微', '停', '微', '慢', '半', '全'];
  for (i = 0; i < TELE.length; i++) { g.fillStyle = i === cur ? '#000' : i > stopI ? '#fff' : '#3a2a10'; g.fillText(TELE.length === 9 ? LB[i] : (Math.round(Math.abs(TELE[i]) * 100) + ''), 9, teleY(i)); }
  g.fillStyle = '#3a2a10'; g.font = 'bold 8px sans-serif'; g.fillText('進', 22, 9); g.fillStyle = '#fff'; g.fillText('退', 22, H - 8);
  var D = sh.drive;
  if (D && D.cap < 0.98) { g.fillStyle = 'rgba(0,0,0,.55)'; var cy = teleY(stopI), up = (cy - teleY(0)) * (1 - Math.sqrt(D.cap)); g.fillRect(4, teleY(0) - 6, 3, up + 1); g.fillRect(4, teleY(TELE.length - 1) + 6 - up, 3, up); }   // 給不出的那幾格（受損）：左邊一條暗的
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

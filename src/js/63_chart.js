// ───────────────────────── 小地圖（海圖；玩法規則 chart，04_modes.js：航海，TASK-0746 ⑤） ─────────────────────────
// Tim 2026-10-20：「航海模式下 是否可以加一個小地圖(海圖)」「橫版畫面時 放在右下角」「直版也先放右下角」。
// 只有畫面：海圖塊進來（08_seabed.js 'bedChunk' 細的、63_bed_gl.js bedFarPut 遠景的粗塊）就畫進一張整個海域的底圖（一點 CHART_M 公尺（chartPx：一塊幾點 ＝ A.chunk ÷ 32），跟遠景的粗塊同一個點距；
//   海域跟著旗艦走 ⇒ 底圖跟著窗換，疊到的照搬：chartWin），
//   細的那一份蓋過粗的；顏色照高度：陸地（沙灘、低地、山）、淺到我艦過不去（船底＋電腦讓開淺水的 BEDAV_CLR）、淺海、深海；水下的珊瑚礁、礁石另外標紅。
//   內陸水（河、湖；段 3，Tim 2026-10-27「是否可以讓小地圖上顯示河流」）：一點照它蓋到的那一塊（32 m 見方）裡有沒有內陸水的取樣點 ⇒ 有就畫成河的藍，
//     照有水的成數混（至少 CHART_RIVER_MIN）⇒ 比一點還窄的河（10 m 寬的支流）也留一條一點寬的線，不會因為中心那一點剛好在岸上就整段斷掉。
// 每 6 格畫面（hudFrame）畫一次：北朝上、我艦在中間（三角形尖端 ＝ 船頭）、走過的航跡、出發點 ⚓（開戰位置 ＝ 世界原點；停靠 ⇒ 泊位）、比例尺；
//   右上角「＋」拉近、「−」拉遠（滾輪也行）：半徑 0.5、1、1.5（開局）、2.5、4、7 km、整個海域。
//   ⇒ 最外圈會落在海域窗外的那幾級跳過（chartLvOk；窗照畫質「海圖讀取範圍」：近只到 1.5 km、中到 2.5 km、遠到 4 km，再拉遠 ＝ 整個海域）。
// 位置：右下角、右邊那一排按鈕的上面（橫版、直版都是；照按鈕現在的位置算）—— ⛔ #stage 的 canvas 樣式是 inset:0 滿版 ⇒ 要先 inset:auto。⛔ 不讀不寫模擬 ⇒ 無頭不訂閱、戰局一位元不動；沒有海圖（?map）或玩法沒開 ⇒ 不建、不顯示。
var CHART = { A: null, im: null, g: null, res: null, cv: null, box: null, zb: null, zoom: 2, trail: [], trT: -1, need: 6.5 };
if (Q.has('chartz') && isFinite(+Q.get('chartz'))) CHART.zoom = Math.max(0, Math.min(6, Math.round(+Q.get('chartz'))));   // ?chartz=0..6：開局的範圍（量測、截圖用）
var CHART_M = 32, CHART_R = [500, 1000, 1500, 2500, 4000, 7000, 0], CHART_TRAIL = 900;   // 底圖一點幾公尺（以前「一塊 32 點」⇒ 塊從 1024 改 512 m 時照公尺換：chartPx）；範圍（半徑 m；0 ＝ 整個海域；開局 1.5 km）；航跡最多幾點（2 秒一點 ⇒ 30 分鐘）
var CHART_COL = { deep: [18, 52, 92], mid: [29, 86, 140], shoal: [62, 150, 190], danger: [150, 225, 230], reef: [222, 120, 100], sand: [214, 196, 140], low: [118, 156, 88], hill: [92, 128, 70], high: [140, 128, 104], river: [58, 128, 206], ice: [226, 236, 244] };   // ice：南極的冰棚（BED_MAT.ICE）
var CHART_RIVER_MIN = 0.75;                                              // 內陸水：一點裡只有一個取樣點有水也至少混這麼多成的河色（窄的河看得到）
/** 海域變了（或第一次）⇒ 新的一張底圖（全部先塗深海）、把已經載好的細塊畫上去。 */
/** 底圖一塊幾點（照公尺：CHART_M 一點）。 */
function chartPx() { return Math.max(1, Math.round(BED.A.chunk / CHART_M)); }
function chartReady() {
  if (!BED || !BED.A || !modeRule('chart')) return false;
  if (CHART.A === BED.A) return true;
  var A = BED.A, nx = BED.nx, ny = A.y[1] - A.y[0] + 1, c = document.createElement('canvas');
  c.width = nx * chartPx(); c.height = ny * chartPx();
  var g = c.getContext('2d'), d = CHART_COL.deep; g.fillStyle = 'rgb(' + d.join(',') + ')'; g.fillRect(0, 0, c.width, c.height);
  CHART.A = A; CHART.im = c; CHART.g = g; CHART.res = {}; CHART.trail = []; CHART.trT = -1; CHART.need = chartNeed();
  CHART.x0 = A.x[0]; CHART.y0 = A.y[0]; CHART.nx = nx; CHART.ny = ny;  // 底圖蓋的範圍（塊號）：海域跟著旗艦走 ⇒ chartWin 換
  for (var k in BED.ch) chartPut(BED.ch[k]);
  for (k in BED.cm) chartPut(BED.cm[k]);                                 // 外圈的中等塊（chartPut 只收更細的 ⇒ 順序無關）
  return true;
}
/** 吃水的門檻：我艦那一型（主選單的第一艘）龍骨線最低那一點到設計水線（32_ground.js groundKeel）＋ BEDAV_CLR —— 比它淺的水畫成「過不去」。
 *  船型還沒載好（海圖塊先到）⇒ 6.5（風暴角號 4.97 ＋ 1.5）。 */
function chartNeed() {
  var T = HULLT[myHull()]; if (!T) return 6.5;
  var K = groundKeel(T), lo = Infinity; K.forEach(function (p) { lo = Math.min(lo, p[1]); });
  return isFinite(lo) ? (T.zw - lo) * S + BEDAV_CLR : 6.5;
}
function chartRGB(h, m) {
  var C = CHART_COL;
  if (m === BED_MAT.ICE) return C.ice;                                   // 冰棚：頂在海面上幾十公尺，照高度會畫成綠的低地
  if (h > 0) return h < 3 ? C.sand : h < 40 ? C.low : h < 200 ? C.hill : C.high;
  var dp = -h;
  if ((m === BED_MAT.REEF || m === BED_MAT.ROCK) && dp < 12) return C.reef;
  return dp < CHART.need ? C.danger : dp < 20 ? C.shoal : dp < 80 ? C.mid : C.deep;
}
/** 一塊畫進底圖（細的 n 大 ⇒ 蓋過粗的；粗的不蓋細的）。 */
function chartPut(C) {
  if (!chartReady() || !C) return;
  var k = bedKey(C.cx, C.cy); if (CHART.res[k] >= C.n) return;
  var i0 = C.cx - CHART.x0, j0 = C.cy - CHART.y0; if (i0 < 0 || j0 < 0 || i0 >= CHART.nx || j0 >= CHART.ny) return;
  CHART.res[k] = C.n;
  var P = chartPx(), img = CHART.g.createImageData(P, P), D = img.data, n = C.n, wd = C.wd, f = (n - 1) / P, R = CHART_COL.river;
  for (var j = 0; j < P; j++) for (var i = 0; i < P; i++) {
    var u = Math.min(n - 1, Math.round((i + 0.5) / P * (n - 1))), v = Math.min(n - 1, Math.round((j + 0.5) / P * (n - 1))), o = v * n + u;
    var c = chartRGB(C.h0[o] / 10, C.mat0[o]), q = (j * P + i) * 4;
    if (wd) {                                                            // 內陸水（檔頭）：這一點蓋到的取樣點裡有幾成是水
      var a0 = Math.floor(i * f), a1 = Math.min(n - 1, Math.ceil((i + 1) * f)), b0 = Math.floor(j * f), b1 = Math.min(n - 1, Math.ceil((j + 1) * f)), w = 0, t = 0;
      for (var b = b0; b <= b1; b++) for (var a = a0; a <= a1; a++) { t++; if (wd[b * n + a]) w++; }
      if (w) { var k2 = Math.max(CHART_RIVER_MIN, w / t); c = [c[0] + (R[0] - c[0]) * k2, c[1] + (R[1] - c[1]) * k2, c[2] + (R[2] - c[2]) * k2]; }
    }
    D[q] = c[0]; D[q + 1] = c[1]; D[q + 2] = c[2]; D[q + 3] = 255;
  }
  CHART.g.putImageData(img, i0 * P, j0 * P);
}
evOn('bedChunk', function (cx, cy, C) { chartPut(C); }, 0, true);
evOn('bedWin', function () { chartWin(); }, 0, true);
/** 海域的窗換了（08_seabed.js bedWinApply）：照新的範圍換一張底圖 —— 兩個窗疊到的那一塊照搬（畫好的不重畫），新進來的先塗深海、塊到了再畫。 */
function chartWin() {
  if (!CHART.im || CHART.A !== BED.A) return;
  var A = BED.A, nx = A.x[1] - A.x[0] + 1, ny = A.y[1] - A.y[0] + 1, P = chartPx(), c = document.createElement('canvas');
  c.width = nx * P; c.height = ny * P;
  var g = c.getContext('2d'), d = CHART_COL.deep; g.fillStyle = 'rgb(' + d.join(',') + ')'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(CHART.im, (CHART.x0 - A.x[0]) * P, (CHART.y0 - A.y[0]) * P);
  var res = {}; Object.keys(CHART.res).forEach(function (k) { var q = k.split('_').map(Number); if (bedIdx(q[0], q[1]) >= 0) res[k] = CHART.res[k]; });
  CHART.im = c; CHART.g = g; CHART.res = res; CHART.x0 = A.x[0]; CHART.y0 = A.y[0]; CHART.nx = nx; CHART.ny = ny;
}
/** 畫面上那一張（第一次要畫才建）：外框裡一張 canvas ＋ 右上角「＋」拉近、「−」拉遠（Tim 2026-10-20「小地圖是否可以加上縮放按鍵」）；滾輪也能縮放。 */
function chartEl() {
  if (CHART.box) return CHART.box;
  var b = document.createElement('div'); b.id = 'chartBox';
  b.style.cssText = 'position:absolute; right:10px; bottom:120px; z-index:6; display:none; pointer-events:auto; touch-action:manipulation;';
  var c = document.createElement('canvas'); c.id = 'chart'; c.title = '海圖（＋／− 或滾輪縮放）';
  c.style.cssText = 'position:static; inset:auto; display:block; border-radius:10px; border:1px solid rgba(232,194,106,.55); background:rgba(8,22,38,.7); cursor:default; touch-action:manipulation;';
  b.appendChild(c);
  var z = document.createElement('div'); z.style.cssText = 'position:absolute; right:5px; top:5px; display:flex; flex-direction:column; gap:4px;';
  [['＋', -1, '拉近'], ['−', 1, '拉遠（看更大範圍）']].forEach(function (q) {
    var k = document.createElement('button'); k.type = 'button'; k.textContent = q[0]; k.title = q[2]; k.dataset.d = q[1];
    k.style.cssText = 'width:24px; height:24px; padding:0; border-radius:6px; border:1px solid rgba(232,194,106,.7); background:rgba(8,22,38,.8); color:#f3ead8; font:bold 15px/1 sans-serif; cursor:pointer;';
    k.addEventListener('click', function (e) { e.stopPropagation(); chartZoom(q[1]); k.blur(); });   // blur：⛔ 留著焦點 ⇒ 空白鍵（齊射）會再按一次這顆
    z.appendChild(k);
  });
  b.appendChild(z);
  ['pointerdown', 'mousedown', 'touchstart', 'dblclick'].forEach(function (t) { b.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true }); });   // 點小地圖不算點海面（瞄準、轉鏡頭）
  c.addEventListener('click', function (e) { e.stopPropagation(); if (chartNavView()) chartMode(false); else chartMode(true); });   // 海圖模式（檔尾；TASK-1272）：只有 chartNavOk 的頁開得起來，其他頁點了什麼都不做
  b.addEventListener('wheel', function (e) { e.preventDefault(); e.stopPropagation(); chartZoom(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  $('stage').appendChild(b);
  CHART.cv = c; CHART.zb = z.children;
  return (CHART.box = b);
}
/** 這一級看得到的範圍都在海域的窗裡嗎（Tim 2026-10-25：「小地圖問題是有一個縮放階級下 最外圈完全不會載入」「縮放的級數跟著海域窗走」）：
 *  窗跟著旗艦走（08_seabed.js bedWinNeed）只保證旗艦那一塊 ± m 塊（m ＝ 半徑 − 換窗的那幾成）在窗裡 ⇒ 半徑超過 m 塊的那一級，最外圈落在窗外、永遠不會載入 ⇒ 跳過；
 *  ⛔ 量的（「中」窗 ±4 km、開場的窗西 8 塊東 7 塊）：4 km 那一級北、東各一排在窗外，7 km 那一級 26 排。整個海域（0）＝ 窗本身 ⇒ 一定可以；海域不跟著旗艦走（沒有 BED.win）⇒ 每一級都可以。 */
function chartLvOk(z) {
  var R = CHART_R[z]; if (!R || !BED || !BED.A || !BED.win) return true;
  var w = bedWinR(), m = w - Math.max(1, Math.round(w * BED_WIN_SHIFT));
  return R <= m * BED.A.chunk;
}
/** 換範圍：d −1 拉近、+1 拉遠（到頭就停；跳過最外圈會落在窗外的那幾級）；d 0 ⇒ 現在這一級不行（換了畫質）就往近的挪。 */
function chartZoom(d) {
  var z = CHART.zoom;
  if (d) { for (var q = z + d; q >= 0 && q < CHART_R.length; q += d) if (chartLvOk(q)) { z = q; break; } }
  else while (z > 0 && !chartLvOk(z)) z--;
  if (z !== CHART.zoom) { CHART.zoom = z; HUDN = 0; }
  if (CHART.zb) {
    var lo = true, hi = true; for (var q2 = 0; q2 < CHART_R.length; q2++) if (chartLvOk(q2)) { if (q2 < z) lo = false; if (q2 > z) hi = false; }
    CHART.zb[0].disabled = lo; CHART.zb[1].disabled = hi; [].forEach.call(CHART.zb, function (k) { k.style.opacity = k.disabled ? '.4' : '1'; });
  }
}
/** 每 6 格畫面（61_hud.js hudFrame）：沒開就藏起來。 */
function chartDraw(me) {
  var on = RUNNING && me && chartReady();
  if (!on) { if (CHART.box && CHART.box.style.display !== 'none') CHART.box.style.display = 'none'; return; }
  var bx0 = chartEl(), c = CHART.cv, A = CHART.A, ch = A.chunk, port = innerHeight > innerWidth, W = port ? 132 : 176, dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (bx0.style.display === 'none') { bx0.style.display = 'block'; chartZoom(0); }
  else if (!chartLvOk(CHART.zoom)) chartZoom(0);                       // 畫質換成窗比較小的 ⇒ 這一級的最外圈落在窗外 ⇒ 往近的挪
  if (c.width !== W * dpr) { c.width = c.height = W * dpr; c.style.width = c.style.height = W + 'px'; }
  // 右下角、右邊那一排按鈕的上面：跟 c 橫向重疊的按鈕裡最高的那一個的頂 ⇒ 底
  var top = innerHeight - 8;
  ['helmR', 'ctlRow', 'navBox'].forEach(function (id) { var e = $(id); if (!e || !e.offsetParent) return; var r = e.getBoundingClientRect(); if (r.right > innerWidth - W - 16 && r.height) top = Math.min(top, r.top); });
  var bt = Math.max(8, innerHeight - top + 8) + 'px'; if (bx0.style.bottom !== bt) bx0.style.bottom = bt;
  // 航跡：模擬時間 2 秒一點（新的一場 ⇒ 清掉）
  if (SIMT < CHART.trT) CHART.trail = [];
  if (SIMT - CHART.trT >= 2 || CHART.trT < 0) { CHART.trT = SIMT; CHART.trail.push([me.px, me.pz]); if (CHART.trail.length > CHART_TRAIL) CHART.trail.shift(); }
  var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, W);
  var e0 = CHART.x0 * ch, s0 = CHART.y0 * ch, ew = CHART.nx * ch, sw = CHART.ny * ch;                // 底圖蓋的範圍（往東、往南公尺；海域跟著旗艦走 ⇒ 現在的窗）
  var R = CHART_R[CHART.zoom], ce = BED.ax + me.px, cs = BED.az + me.pz;                            // 中心：我艦（整個海域 ⇒ 海域中心）
  if (!R) { R = Math.max(ew, sw) / 2; ce = e0 + ew / 2; cs = s0 + sw / 2; }
  var kp = chartPx() / ch, sc = W / (2 * R);                                                          // 底圖每公尺幾點；畫面每公尺幾 px
  function P(e, s) { return [W / 2 + (e - ce) * sc, W / 2 + (s - cs) * sc]; }
  g.save(); g.beginPath(); g.roundRect ? g.roundRect(0, 0, W, W, 10) : g.rect(0, 0, W, W); g.clip();
  g.fillStyle = 'rgb(' + CHART_COL.deep.join(',') + ')'; g.fillRect(0, 0, W, W);
  g.imageSmoothingEnabled = true;
  g.drawImage(CHART.im, (ce - R - e0) * kp, (cs - R - s0) * kp, 2 * R * kp, 2 * R * kp, 0, 0, W, W);
  chartTowns(g, P, sc, W);                                                                            // 城鎮（路、建築、城牆、圖示）
  if (CHART.trail.length > 1) {                                                                       // 航跡
    g.strokeStyle = 'rgba(255,236,170,.75)'; g.lineWidth = 1.4; g.setLineDash([3, 3]); g.beginPath();
    CHART.trail.forEach(function (p, i) { var q = P(BED.ax + p[0], BED.az + p[1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    var qn = P(BED.ax + me.px, BED.az + me.pz); g.lineTo(qn[0], qn[1]); g.stroke(); g.setLineDash([]);   // 接到現在的位置
  }
  if (CNAV.pts) {                                                                                     // 海圖模式的路線（檔尾；TASK-1272）
    g.strokeStyle = 'rgba(243,234,216,.95)'; g.lineWidth = 1.6; g.beginPath();
    CNAV.pts.forEach(function (p, i) { var q = P(BED.ax + p[0], BED.az + p[1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke();
  }
  if (CNAV.to) { var tq = P(CNAV.to[0], CNAV.to[1]); g.strokeStyle = '#e8564a'; g.lineWidth = 2; chartX(g, tq, 4); }   // 標記
  var o = P(BED.ax, BED.az); g.font = '12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f0c56a'; g.fillText('⚓', o[0], o[1]);   // 出發點 ＝ 開戰位置（世界原點；海域的原點對齊固定的格線之後不一定在這裡）
  var m = P(BED.ax + me.px, BED.az + me.pz), F = fwd(me.yaw), dx = F[0], dz = F[2], L = 7;           // 我艦：畫面右 ＝ 東、下 ＝ 南
  g.beginPath(); g.moveTo(m[0] + dx * L * 1.4, m[1] + dz * L * 1.4); g.lineTo(m[0] - dx * L + dz * L * 0.7, m[1] - dz * L - dx * L * 0.7); g.lineTo(m[0] - dx * L * 0.5, m[1] - dz * L * 0.5); g.lineTo(m[0] - dx * L - dz * L * 0.7, m[1] - dz * L + dx * L * 0.7); g.closePath();
  g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = '#10243a'; g.lineWidth = 1.2; g.stroke();
  g.restore();
  // 北、比例尺、範圍
  g.font = 'bold 11px sans-serif'; g.fillStyle = '#e8c26a'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('N', W / 2, 3);
  var bar = [100, 200, 500, 1000, 2000, 5000].filter(function (v) { return v * sc <= W * 0.35; }).pop() || 100, bx = 8, by = W - 9;
  g.strokeStyle = '#f3ead8'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx, by - 3); g.lineTo(bx, by); g.lineTo(bx + bar * sc, by); g.lineTo(bx + bar * sc, by - 3); g.stroke();
  g.font = '10px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillStyle = '#f3ead8'; g.fillText(bar >= 1000 ? bar / 1000 + ' km' : bar + ' m', bx, by - 3);
}
/** 城鎮（63_towns.js TOWNS.list；Tim 2026-10-20「航海小地圖上 是否可以顯示城鎮Icon(同時好像看不到城鎮 只有地形? 可以的話也顯示城鎮)」）：
 *  路（實際的寬、至少 1.2 px，外面一圈深色描邊；顏色 TOWN_COL）、城牆、建築（實例的佔地 pl 照屋頂的顏色 col；模型還沒到 ⇒ 地塊的框）、
 *  市中心（T.cen）一個城鎮圖示（同 Blocksail 地球儀的 townIcon：圓底、白牆、屋頂、門）＋ 名字。座標都是海域的往東、往南（實例 ＝ 減掉 BED.ax、BED.az 的）。 */
function chartTowns(g, P, sc, W) {
  if (!TOWNS.list.length) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  TOWNS.list.forEach(function (T) {                                     // 路、城牆、建築：先畫進那座城的圖層（chartTownLayer），每格只貼上去
    var L = chartTownLayer(T, sc, dpr);
    if (!L) { chartTownDraw(g, P, sc, T); return; }
    var p0 = P(L.e0, L.s0); g.drawImage(L.cv, p0[0] - L.pad, p0[1] - L.pad, L.cv.width / dpr, L.cv.height / dpr);
  });
  chartTownIcons(g, P, W);
}
// 城的圖層（TASK-0817）：以前每格把每座城的路、城牆、每一棟建築重畫一次 —— 君士坦丁堡（1,232 條路、12,854 個實例）一格 3 ms 起、53 秒合計 9.5 s。
//   ⇒ 照現在的比例（sc）在一張離屏畫布上畫一次，比例、實例（模型到了、重建）換了才重畫；太大（> CHART_TOWN_MAX 點）⇒ 照舊每格直接畫。
var CHART_TOWN_MAX = 4096;
function chartTownLayer(T, sc, dpr) {
  var R = townDistRest(T), b = R && R.box[0] <= R.box[2] ? townBoxAdd(T.box.slice(), R.box) : T.box;   // 城區（TASK-0817）：還沒建的那幾區也畫 ⇒ 圖層的範圍要包進它們
  var pad = 4, w = Math.ceil(((b[2] - b[0]) * sc + 2 * pad) * dpr), h = Math.ceil(((b[3] - b[1]) * sc + 2 * pad) * dpr), L = T.chartL;
  if (w > CHART_TOWN_MAX || h > CHART_TOWN_MAX) return null;
  if (L && L.sc === sc && L.dpr === dpr && L.inst === T.inst && L.rest === R) return L;
  var cv = L ? L.cv : document.createElement('canvas'); cv.width = w; cv.height = h;
  var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  chartTownDraw(g, function (e, s) { return [(e - b[0]) * sc + pad, (s - b[1]) * sc + pad]; }, sc, T);
  return (T.chartL = { cv: cv, sc: sc, dpr: dpr, inst: T.inst, rest: R, e0: b[0], s0: b[1], pad: pad });
}
/** 一座城的路、城牆、建築（P：海域的往東、往南 ⇒ 畫面 px）。 */
function chartTownDraw(g, P, sc, T) {
  function rgb(c, k) { return 'rgb(' + c.map(function (v) { return Math.round(Math.min(1, v * (k || 1)) * 255); }).join(',') + ')'; }
  function path(L) { g.beginPath(); L.forEach(function (q, i) { var p = P(q[0], q[1]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); }
  function quad(C) { path(C); g.closePath(); g.fill(); }
  g.lineJoin = 'round'; g.lineCap = 'round';
  //   還沒建的那幾區（城區，TASK-0817；townDistRest）：路、碼頭棧橋、地塊的框先畫在底下 ⇒ 小地圖上整座城都在（以前只有建了的那幾區，其他一片空白）
  var R = townDistRest(T);
  if (R) {
    [0, 1].forEach(function (pass) {
      R.roads.forEach(function (r) { var w = Math.max(1.2, r.w * sc); path(r.path.map(T.E)); g.lineWidth = pass ? w : w + 1.6; g.strokeStyle = pass ? rgb(TOWN_COL[r.kind] || TOWN_COL.street, 1.15) : 'rgba(30,20,10,.55)'; g.stroke(); });
      R.quay.forEach(function (q) { var c = q.kind === 'mole' ? TOWN_COL.mole : !q.kind || q.kind === 'wharf' ? TOWN_COL.quay : TOWN_COL.pier, w = Math.max(1.2, (q.w || 6) * sc); path(q.path.map(T.E)); g.lineWidth = pass ? w : w + 1.6; g.strokeStyle = pass ? rgb(c, 1.15) : 'rgba(30,20,10,.55)'; g.stroke(); });
    });
    R.lots.forEach(lotBox);
  }
  [0, 1].forEach(function (pass) {                                    // 路：先描邊、再路面
    T.roads.forEach(function (r) { var w = Math.max(1.2, r.w * sc); path(r.P); g.lineWidth = pass ? w : w + 1.6; g.strokeStyle = pass ? rgb(TOWN_COL[r.kind] || TOWN_COL.street, 1.15) : 'rgba(30,20,10,.55)'; g.stroke(); });
    //   碼頭線、棧橋（Blocksail TASK-0899：碼頭棧橋是一種特殊的路 ⇒ 小地圖照路畫，Tim 2026-10-24「在小地圖顯示」）：顏色同遊戲裡的面（碼頭、石堤石色，木棧橋木色）
    (T.p.quay || []).concat(T.p.piers || []).forEach(function (q) {
      var c = q.kind === 'mole' ? TOWN_COL.mole : !q.kind || q.kind === 'wharf' ? TOWN_COL.quay : TOWN_COL.pier, w = Math.max(1.2, (q.w || 6) * sc);
      path(q.path.map(T.E)); g.lineWidth = pass ? w : w + 1.6; g.strokeStyle = pass ? rgb(c, 1.15) : 'rgba(30,20,10,.55)'; g.stroke();
    });
  });
  (T.p.walls || []).forEach(function (w) { var P2 = w.path.map(T.E); if (w.closed) P2.push(P2[0]); path(P2); g.lineWidth = Math.max(1.5, (w.w || 4) * sc); g.strokeStyle = 'rgb(170,160,140)'; g.stroke(); });
  if (T.inst) T.inst.forEach(function (q) {                           // 建築、城牆的部件：模型的 +x ＝ (sinθ, −cosθ)、+y ＝ (−cosθ, −sinθ)
    var hw = q.pl ? q.pl[0] / 2 : q.ft ? q.ft[0] : 0, hd = q.pl ? q.pl[1] / 2 : q.ft ? q.ft[1] : 0; if (!hw) return;
    var s = Math.sin(q.th), c = Math.cos(q.th), x = q.x + BED.ax, z = q.z + BED.az;
    g.fillStyle = rgb(q.col || [0.6, 0.45, 0.35], q.sh || 1);
    quad([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (k) { var a = k[0] * hw, b = k[1] * hd; return [x + a * s - b * c, z - a * c - b * s]; }));
  });
  else (T.p.lots || []).forEach(function (l) {                         // 模型還沒到 ⇒ 地塊的框（空建地、廣場不畫）
    if (l.use === 'plot' || l.use === 'plaza') return;
    lotBox(l);
  });
  function lotBox(l) {
    var t = l.rot * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), hd = l.d / 2, hw = l.w / 2;
    g.fillStyle = 'rgba(190,150,110,.85)'; quad([[-hd, -hw], [hd, -hw], [hd, hw], [-hd, hw]].map(function (k) { return T.E([l.at[0] + k[0] * c - k[1] * s, l.at[1] + k[0] * s + k[1] * c]); }));
  }
}
/** 城鎮圖示＋名字（在路、建築上面；每格畫）。 */
function chartTownIcons(g, P, W) {
  g.font = 'bold 10px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  TOWNS.list.forEach(function (T) {                                     // 圖示＋名字（在路、建築上面）
    var p = P(T.cen[0], T.cen[1]), x = p[0], y = p[1] - 2; if (x < -40 || y < -20 || x > W + 40 || y > W + 20) return;
    g.beginPath(); g.arc(x, y, 7.5, 0, 6.2832); g.fillStyle = 'rgba(5,15,25,.8)'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(243,234,216,.9)'; g.stroke();
    g.fillStyle = '#f3ead8'; g.fillRect(x - 3.5, y - 0.4, 7, 4.2);                                     // 牆
    g.beginPath(); g.moveTo(x - 4.8, y); g.lineTo(x, y - 4.6); g.lineTo(x + 4.8, y); g.closePath(); g.fillStyle = '#e8c26a'; g.fill();   // 屋頂
    g.fillStyle = '#2a1607'; g.fillRect(x - 0.9, y + 1.4, 1.8, 2.4);                                  // 門
    if (T.name) { g.lineWidth = 3; g.strokeStyle = 'rgba(5,15,25,.85)'; g.strokeText(T.name, x + 10, y); g.fillStyle = '#f3ead8'; g.fillText(T.name, x + 10, y); }
  });
}
/** 讀數（?debug=1 的 __game.chart()）：開了沒、範圍、吃水門檻、底圖畫了幾塊（細／粗）、航跡幾點、畫面上的位置。 */
function chartInfo() {
  var r = CHART.res || {}, ks = Object.keys(r), b = CHART.box && CHART.box.style.display !== 'none' ? CHART.cv.getBoundingClientRect() : null;
  return { on: !!b, zoom: CHART_R[CHART.zoom], need: +CHART.need.toFixed(2), fine: ks.filter(function (k) { return r[k] > 100; }).length, coarse: ks.filter(function (k) { return r[k] <= 100; }).length, trail: CHART.trail.length,
    box: b ? [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)] : null, view: [innerWidth, innerHeight] };
}

// ───────────────────────── 海圖模式（航海模式的變體；TASK-1272） ─────────────────────────
// Tim 2026-11-11：「航海模式下點右下角的小地圖 會拉到很高的俯視角(大約是顯示小地圖全圖)」「然後這時可以點海面自動導航(相當於地球儀航行功能 只是維持在航海模式)」
//   「然後再次點小地圖可以切回航海模式」「這個一樣是只在battle.html的功能」；五題：「照常跑」「可以繼續開(關閉導航就變回手動 開回導航會繼續開往標記點)」
//   「一樣取消 參考目前航海模式」「可以縮放」「同一個3D場景拉高」；「海圖模式可以只加載遠景(粗略)地形(除了船附近地塊)」。
// 只在嵌著的頁：被外面那一頁嵌著（?map=@host —— 路線要它的局部尋路）而且外殼掛了 BS_SHELL.chartNav（battle.html 的外殼才掛）⇒ Blockside 自己的 index.html 點小地圖什麼都不做。
// · 鏡頭：03_camera.js camChart（同一個場景、正上方、北朝上、跟著我艦；拖曳平移、滾輪／兩指縮放）。開場的高度 ＝ 畫面短的那一邊剛好裝下小地圖現在那一級的範圍；
//   最高 ＝ 畫面長的那一邊不超出海域的窗（窗外沒有地形 ⇒ 拉更高只會看到缺塊）。地形不另外載：細的照舊跟著船（08_seabed.js bedFocus），窗裡其他的本來就是遠景的粗塊（63_bed_gl.js BEDFAR）。
// · 目的地：點海面（y＝0 平面）⇒ CNAV.to（海域的往東、往南公尺）⇒ 跟外面那一頁要路線（{bsmap:'need', what:'leg'}；Blocksail world/mapgen.js serve ⇒ legplan，同地球儀的局部尋路）
//   ⇒ CNAV.pts（世界 x、z）。我艦照路線開（31_sailing.js：自動航行的那一支、排在指揮官的命令前面；chartHelm 照往來船的 trafficAhead 往前看 300 m），
//   淺水、讓船照舊接管（54_helm.js helmTakeover）；剩 DOCK_SLOW 以內減速；離終點 CNAV_ARR 以內 ⇒ 拋錨（拋錨模式）、標記收掉。
// · 規則（Tim 的第 2、3 題）：導航 ＝ 自動航行。打舵 ⇒ 照舊換手動（71_input.js doAct）⇒ 路線不管了、標記留著；手動、拋錨 ⇒ 換回自動 ⇒ 從現在的位置重要一條路去標記點。
// · 只有航海開得起來（玩法規則 chartNav，04_modes.js）：⚔ 交戰點小地圖不開；開著的時候換進交戰 ⇒ 降回航海鏡頭（Tim 2026-11-13「自動降回」）。導航不收（同切回航海鏡頭）。
// · 點到陸地、太淺、開不到 ⇒ 外面那一頁的尋路回 snapped／cut（開到最近開得到的地方）⇒ 說原因（chartWhy）。
//   太淺 ⇒ 外面那一頁要帶 trim（Blocksail globe.html legOptBattle）：⛔ 沒帶 ⇒ 淺水在 legplan 只是軟擋，路線直接開進淺水、不說原因（2026-11-13 托爾圖加量到：一路穿過 0.9 m）。
// · 卡住（CNAV_STUCK_T 秒走不出 CNAV_STUCK_M 公尺的圈：頂在棧橋上、在頂風轉不過來）⇒ 換手動、說原因、標記留著 —— 同打舵那一條：駛離之後開自動航行 ⇒ 從那裡重要一條路。
//   ⛔ 沒有這一條 ⇒ 2026-11-13 托爾圖加出港往頂風的方向導航：繞開頂風時頂到棧橋（finger），模擬 140 秒動不到 5 m，畫面一直寫「導航中」。
var CNAV = { to: null, pts: null, end: null, seq: 0, ask: 0, arr: false, sail: null, why: '', info: null, el: null, said: false, mv: null };   // mv：卡住偵測的那一圈（{ t: SIMT, x, z }）
var CNAV_ARR = 40, CNAV_HMIN = 150, CNAV_K = Math.tan(0.45), CNAV_WAIT = 15000, CNAV_SNAP = 150;   // 到了（離終點幾 m）、鏡頭最低（m）、垂直視角一半的 tan、等路線最多幾毫秒、終點離標記幾 m 以上才說原因
var CNAV_STUCK_T = 60, CNAV_STUCK_M = 25;                                  // 卡住：模擬幾秒內離那一圈的中心不到幾公尺（照常開 2 m/s 以上 ⇒ 60 秒 120 m；頂風轉過來 helmIrons 幾秒內就順風繞開）
/** 這一頁有沒有海圖模式（檔頭）。 */
function chartNavOk() { return !!(RUNNING && BED && BED.host && BED.A && modeRule('chart') && shellCall('chartNav')); }
function chartNavView() { return !!(CAM.chart && !CAM.chart.out); }
/** 海域的窗的半徑（m；同 chartLvOk 的 m 塊 —— 窗換之前保證裝得下的那一圈）；沒有窗 ⇒ 整個海域的一半。 */
function chartNavR() {
  var A = BED.A;
  if (!BED.win) return Math.max(BED.nx, A.y[1] - A.y[0] + 1) * A.chunk / 2;
  var w = bedWinR(); return (w - Math.max(1, Math.round(w * BED_WIN_SHIFT))) * A.chunk;
}
/** 鏡頭最高：畫面長的那一邊（半寬 ＝ 高 × tan × 寬高比）不超出窗。 */
function chartNavHMax() { var asp = Math.max(1, cv.clientWidth / Math.max(1, cv.clientHeight)); return Math.max(CNAV_HMIN * 2, chartNavR() / (CNAV_K * asp)); }
/** 開／關海圖模式（點小地圖；__game.chartNav({view})）。 */
function chartMode(on) {
  if (!on) { if (CAM.chart) camChartSet('out'); return false; }
  if (!chartNavOk() || !modeRule('chartNav') || FP.on || CAM.tr) return false;   // chartNav：只有航海（04_modes.js；⚔ 交戰點小地圖不開）
  var asp = cv.clientWidth / Math.max(1, cv.clientHeight), R = CHART_R[CHART.zoom] || chartNavR();
  camChartSet({ H: clamp(R / (CNAV_K * Math.min(1, asp)), CNAV_HMIN, chartNavHMax()), pan: [0, 0] });
  if (!CNAV.said) { CNAV.said = true; note(SHIPS[PLAYER_I], '海圖：點海面設目的地（自動航行開過去）；拖曳平移、滾輪縮放；再點小地圖回航海'); }
  HUDN = 0; return true;
}
/** 點海面（畫面 px）⇒ 那一點（y＝0）設成目的地。 */
function chartTap(x, y) {
  var R = townRayOf(x, y), p = R[0], d = R[1]; if (!(d[1] < -1e-6)) return null;
  var t = -p[1] / d[1], wx = p[0] + d[0] * t, wz = p[2] + d[2] * t;
  return chartGo([BED.ax + wx, BED.az + wz]);
}
/** 設目的地（海域的往東、往南公尺）：要路線、換自動航行（拋錨中 ⇒ 先起錨）。 */
function chartGo(to) {
  var me = SHIPS[PLAYER_I]; if (!me || me.sunk || !BED || !BED.host) return null;
  CNAV.to = [+to[0], +to[1]]; CNAV.arr = false; CNAV.why = ''; CNAV.info = null;
  if (SAIL !== 'auto') { if (me.anc) anchorWeighAll(me); setSailMode('auto'); }
  CNAV.sail = SAIL; chartAsk();
  return CNAV.to;
}
/** 跟外面那一頁要一條路：從我艦現在的位置到標記（seq 只收最新那一次的回覆）。等的時候路線先拿掉 ⇒ 照現在的船頭開。 */
function chartAsk() {
  var me = SHIPS[PLAYER_I]; if (!me || !CNAV.to) return;
  CNAV.seq++; CNAV.ask = performance.now(); CNAV.pts = CNAV.end = CNAV.mv = null;
  BED.host.postMessage({ bsmap: 'need', what: 'leg', seq: CNAV.seq, from: [BED.ax + me.px, BED.az + me.pz], to: CNAV.to.slice() }, '*');
}
/** 外面那一頁回的路線（08_seabed.js bedHostMsg 'leg'）：{ seq, ok, pts（海域的往東、往南 m）, snapped, cut, km, need, why } */
function chartLegGot(d) {
  if (d.seq !== CNAV.seq || !CNAV.to) return;
  var me = SHIPS[PLAYER_I], ms = Math.round(performance.now() - CNAV.ask); CNAV.ask = 0;
  if (!d.ok || !d.pts || d.pts.length < 2) { CNAV.why = '開不到那裡：' + (d.why || '找不到航線'); note(me, CNAV.why, true); CNAV.to = null; CNAV.info = { ok: false, ms: ms }; return; }
  CNAV.pts = d.pts.map(function (q) { return [q[0] - BED.ax, q[1] - BED.az]; });
  var e = d.pts[d.pts.length - 1], off = Math.hypot(e[0] - CNAV.to[0], e[1] - CNAV.to[1]);
  CNAV.end = CNAV.pts[CNAV.pts.length - 1];
  CNAV.info = { ok: true, n: d.pts.length, km: d.km, snapped: !!d.snapped, cut: !!d.cut, off: Math.round(off), need: d.need, ms: ms };
  if (off > CNAV_SNAP) { CNAV.why = chartWhy(CNAV.to, d.need) + ' —— 開到最近開得到的地方（離標記 ' + Math.round(off) + ' m）'; note(me, CNAV.why, true); }
}
/** 標記那一點為什麼開不到（照這一頁載著的海床；沒載到 ⇒ 不猜，只說開不到）。need：外面那一頁的尋路要多深（吃水 ＋ 餘裕）。 */
function chartWhy(to, need) {
  var x = to[0] - BED.ax, z = to[1] - BED.az, h = bedCell(x, z) ? bedHgt(x, z) : null, nd = need || CHART.need;
  if (h === null) return '那裡開不到';
  if (h > 0) return '那裡是陸地';
  if (h > -nd) return '那裡太淺（約 ' + Math.max(0, -h).toFixed(1) + ' m，這艘要 ' + nd.toFixed(1) + ' m）';
  return '那裡開不到（水道太窄、太淺，或被陸地擋住）';
}
/** 我艦照路線開（31_sailing.js 自動航行；只有 CNAV.pts 在的時候叫）：⇒ { yaw, v }；到了 ⇒ 標記 arr、交給 chartNavFrame 拋錨。 */
function chartHelm(sh) {
  if (SAIL !== 'auto' || CNAV.arr) return null;
  var P = CNAV.pts, L = P[P.length - 1], left = Math.hypot(L[0] - sh.px, L[1] - sh.pz);
  if (left < CNAV_ARR) { CNAV.arr = true; return null; }
  var a = trafficAhead(sh, P), dx = a[0] - sh.px, dz = a[1] - sh.pz;
  return { yaw: Math.atan2(-dz, dx), v: left < DOCK_SLOW ? DOCK_VMIN + (DOCK_VMAX - DOCK_VMIN) * left / DOCK_SLOW : Infinity };
}
/** 每一格（控制器的 frame）：不該開著的海圖鏡頭關掉；到了 ⇒ 拋錨；導航再開 ⇒ 重要路線；等太久 ⇒ 放棄。 */
function chartNavFrame() {
  if (CAM.chart && !CAM.chart.out && chartNavOk() && !modeRule('chartNav')) {   // 換進交戰（88_modeswitch.js fightTick）⇒ 降回航海鏡頭（同再點一次小地圖：0.6 秒）；導航照開（Tim 2026-11-13「自動降回」）
    camChartSet('out'); if (SHIPS[PLAYER_I]) note(SHIPS[PLAYER_I], '交戰 —— 海圖降回航海鏡頭' + (CNAV.to ? '（導航照開）' : ''));
  }
  if (CAM.chart && (!chartNavOk() || FP.on || CAM.tr)) camChartSet(null);
  if (!CNAV.to) { CNAV.sail = SAIL; return; }
  var me = SHIPS[PLAYER_I];
  if (!RUNNING || !me || me.sunk || !modeRule('chart') || !BED || !BED.host) { CNAV.to = CNAV.pts = CNAV.end = null; CNAV.ask = 0; return; }   // 換模式（進城、停靠）、新的一場 ⇒ 標記收掉
  if (CNAV.arr) { CNAV.to = CNAV.pts = CNAV.end = null; CNAV.arr = false; if (SAIL === 'auto') setSailMode('off'); note(me, '到了 —— 拋錨'); CNAV.sail = SAIL; return; }
  if (SAIL === 'auto' && CNAV.sail !== 'auto') chartAsk();               // 導航再開（手動、拋錨 ⇒ 自動）：從現在的位置重找一條去標記點
  CNAV.sail = SAIL;
  if (SAIL === 'auto' && CNAV.pts && !CNAV.ask) {                       // 卡住偵測：走出那一圈 ⇒ 換一圈；在圈裡待滿 CNAV_STUCK_T 秒 ⇒ 換手動（標記留著）
    var M = CNAV.mv;
    if (!M || Math.hypot(me.px - M.x, me.pz - M.z) > CNAV_STUCK_M) CNAV.mv = { t: SIMT, x: me.px, z: me.pz };
    else if (SIMT - M.t > CNAV_STUCK_T) {
      CNAV.mv = null; setSailMode('manual'); CNAV.sail = SAIL;
      CNAV.why = '卡住了（' + CNAV_STUCK_T + ' 秒走不到 ' + CNAV_STUCK_M + ' m）—— 換手動；駛離之後開自動航行會重找一條路'; note(me, CNAV.why, true);
    }
  } else CNAV.mv = null;
  if (CNAV.ask && performance.now() - CNAV.ask > CNAV_WAIT) { CNAV.ask = 0; CNAV.why = '開不到那裡：航線算太久'; note(me, CNAV.why, true); CNAV.to = null; }
}
/** 畫面上的路線與標記（每一格；61_hud.js hudFrame）：只在海圖鏡頭拉上去之後畫在一張蓋在場景上的透明畫布（世界 y＝0 投到畫面）。 */
function chartNavDraw() {
  var on = CAM.chart && !CAM.chart.out && CAM.chart.s > 0.7, c = CNAV.el;
  if (!on) { if (c && c.style.display !== 'none') c.style.display = 'none'; return; }
  if (!c) { c = CNAV.el = document.createElement('canvas'); c.id = 'chartNav'; c.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:5;'; $('stage').appendChild(c); }
  var W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2), q = CAM.vp;
  if (c.style.display === 'none') c.style.display = 'block';
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  function S(x, z) { var w = q[3] * x + q[11] * z + q[15]; return w > 0.1 ? [((q[0] * x + q[8] * z + q[12]) / w + 1) / 2 * W, (1 - (q[1] * x + q[9] * z + q[13]) / w) / 2 * H] : null; }
  g.lineJoin = g.lineCap = 'round';
  if (CNAV.pts) [['rgba(8,22,38,.8)', 6], ['#f3ead8', 2.5]].forEach(function (st) {   // 路線：深色描邊 ＋ 米白
    g.strokeStyle = st[0]; g.lineWidth = st[1]; g.beginPath(); var on0 = false;
    CNAV.pts.forEach(function (p) { var s = S(p[0], p[1]); if (!s) { on0 = false; return; } if (on0) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); on0 = true; });
    g.stroke();
  });
  if (CNAV.to) {                                                         // 標記：紅 ✕（點的那一點）；終點不在標記上（開不到）⇒ 終點一圈
    var t = S(CNAV.to[0] - BED.ax, CNAV.to[1] - BED.az);
    if (t) { g.strokeStyle = 'rgba(8,22,38,.85)'; g.lineWidth = 5; chartX(g, t, 8); g.strokeStyle = '#e8564a'; g.lineWidth = 2.5; chartX(g, t, 8); }
    var e = CNAV.end && CNAV.info && CNAV.info.off > CNAV_SNAP ? S(CNAV.end[0], CNAV.end[1]) : null;
    if (e) { g.beginPath(); g.arc(e[0], e[1], 7, 0, 6.2832); g.strokeStyle = '#e8c26a'; g.lineWidth = 2.5; g.stroke(); }
  }
  g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top'; g.lineWidth = 3; g.strokeStyle = 'rgba(8,22,38,.85)'; g.fillStyle = '#f3ead8';
  var tip = CNAV.ask ? '找航線中…' : CNAV.to ? (SAIL === 'auto' ? '導航中（打舵 ⇒ 手動；再開自動航行 ⇒ 繼續開往標記）' : '標記留著 —— 開自動航行繼續開過去') : '點海面設目的地';
  g.strokeText('海圖・' + tip, W / 2, 10); g.fillText('海圖・' + tip, W / 2, 10);
}
function chartX(g, p, r) { g.beginPath(); g.moveTo(p[0] - r, p[1] - r); g.lineTo(p[0] + r, p[1] + r); g.moveTo(p[0] + r, p[1] - r); g.lineTo(p[0] - r, p[1] + r); g.stroke(); }
/** 讀數（__game.chartNav）：鏡頭（開了沒、高度、進度）、標記、路線幾點、等多久、上一次路線的讀數、為什麼。 */
function chartNavInfo() {
  var C = CAM.chart;
  return { ok: chartNavOk(), view: chartNavView(), H: C ? Math.round(C.H) : null, h: C ? Math.round(C.h) : null, s: C ? +C.s.toFixed(2) : 0, hmax: BED && BED.A ? Math.round(chartNavHMax()) : null,
    to: CNAV.to, pts: CNAV.pts ? CNAV.pts.length : 0, ask: CNAV.ask ? Math.max(1, Math.round(performance.now() - CNAV.ask)) : 0,   // ask：等了幾毫秒（剛問 ⇒ 至少 1：⛔ 0 會被讀成沒在等）
    sail: SAIL, info: CNAV.info, why: CNAV.why };
}

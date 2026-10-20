// ───────────────────────── 小地圖（海圖；玩法規則 chart，04_modes.js：航海，TASK-0746 ⑤） ─────────────────────────
// Tim 2026-10-20：「航海模式下 是否可以加一個小地圖(海圖)」「橫版畫面時 放在右下角」「直版也先放右下角」。
// 只有畫面：海圖塊進來（08_seabed.js 'bedChunk' 細的、63_bed_gl.js bedFarPut 遠景的粗塊）就畫進一張整個海域的底圖（一塊 CHART_PX 點 ⇒ 1 km 的塊 32 m 一點，跟遠景的粗塊同一個點距），
//   細的那一份蓋過粗的；顏色照高度：陸地（沙灘、低地、山）、淺到我艦過不去（船底＋電腦讓開淺水的 BEDAV_CLR）、淺海、深海；水下的珊瑚礁、礁石另外標紅。
// 每 6 格畫面（hudFrame）畫一次：北朝上、我艦在中間（三角形尖端 ＝ 船頭）、走過的航跡、海域原點 ⚓（地球儀的出發點 ＝ 停靠的港口）、比例尺；
//   右上角「＋」拉近、「−」拉遠（滾輪也行）：半徑 0.5、1、1.5（開局）、2.5、4、7 km、整個海域。
// 位置：右下角、右邊那一排按鈕的上面（橫版、直版都是；照按鈕現在的位置算）—— ⛔ #stage 的 canvas 樣式是 inset:0 滿版 ⇒ 要先 inset:auto。⛔ 不讀不寫模擬 ⇒ 無頭不訂閱、戰局一位元不動；沒有海圖（?map）或玩法沒開 ⇒ 不建、不顯示。
var CHART = { A: null, im: null, g: null, res: null, cv: null, box: null, zb: null, zoom: 2, trail: [], trT: -1, need: 6.5 };
if (Q.has('chartz') && isFinite(+Q.get('chartz'))) CHART.zoom = Math.max(0, Math.min(6, Math.round(+Q.get('chartz'))));   // ?chartz=0..6：開局的範圍（量測、截圖用）
var CHART_PX = 32, CHART_R = [500, 1000, 1500, 2500, 4000, 7000, 0], CHART_TRAIL = 900;   // 一塊幾點；範圍（半徑 m；0 ＝ 整個海域；開局 1.5 km）；航跡最多幾點（2 秒一點 ⇒ 30 分鐘）
var CHART_COL = { deep: [18, 52, 92], mid: [29, 86, 140], shoal: [62, 150, 190], danger: [150, 225, 230], reef: [222, 120, 100], sand: [214, 196, 140], low: [118, 156, 88], hill: [92, 128, 70], high: [140, 128, 104] };
/** 海域變了（或第一次）⇒ 新的一張底圖（全部先塗深海）、把已經載好的細塊畫上去。 */
function chartReady() {
  if (!BED || !BED.A || !modeRule('chart')) return false;
  if (CHART.A === BED.A) return true;
  var A = BED.A, nx = BED.nx, ny = A.y[1] - A.y[0] + 1, c = document.createElement('canvas');
  c.width = nx * CHART_PX; c.height = ny * CHART_PX;
  var g = c.getContext('2d'), d = CHART_COL.deep; g.fillStyle = 'rgb(' + d.join(',') + ')'; g.fillRect(0, 0, c.width, c.height);
  CHART.A = A; CHART.im = c; CHART.g = g; CHART.res = {}; CHART.trail = []; CHART.trT = -1; CHART.need = chartNeed();
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
  if (h > 0) return h < 3 ? C.sand : h < 40 ? C.low : h < 200 ? C.hill : C.high;
  var dp = -h;
  if ((m === BED_MAT.REEF || m === BED_MAT.ROCK) && dp < 12) return C.reef;
  return dp < CHART.need ? C.danger : dp < 20 ? C.shoal : dp < 80 ? C.mid : C.deep;
}
/** 一塊畫進底圖（細的 n 大 ⇒ 蓋過粗的；粗的不蓋細的）。 */
function chartPut(C) {
  if (!chartReady() || !C) return;
  var k = bedKey(C.cx, C.cy); if (CHART.res[k] >= C.n) return;
  var i0 = C.cx - CHART.A.x[0], j0 = C.cy - CHART.A.y[0]; if (i0 < 0 || j0 < 0 || i0 >= BED.nx || C.cy > CHART.A.y[1]) return;
  CHART.res[k] = C.n;
  var P = CHART_PX, img = CHART.g.createImageData(P, P), D = img.data, n = C.n;
  for (var j = 0; j < P; j++) for (var i = 0; i < P; i++) {
    var u = Math.min(n - 1, Math.round((i + 0.5) / P * (n - 1))), v = Math.min(n - 1, Math.round((j + 0.5) / P * (n - 1))), o = v * n + u;
    var c = chartRGB(C.h0[o] / 10, C.mat0[o]), q = (j * P + i) * 4;
    D[q] = c[0]; D[q + 1] = c[1]; D[q + 2] = c[2]; D[q + 3] = 255;
  }
  CHART.g.putImageData(img, i0 * P, j0 * P);
}
evOn('bedChunk', function (cx, cy, C) { chartPut(C); }, 0, true);
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
  b.addEventListener('wheel', function (e) { e.preventDefault(); e.stopPropagation(); chartZoom(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  $('stage').appendChild(b);
  CHART.cv = c; CHART.zb = z.children;
  return (CHART.box = b);
}
/** 換範圍：d −1 拉近、+1 拉遠（到頭就停）。 */
function chartZoom(d) {
  CHART.zoom = Math.max(0, Math.min(CHART_R.length - 1, CHART.zoom + d)); HUDN = 0;
  if (CHART.zb) { CHART.zb[0].disabled = CHART.zoom === 0; CHART.zb[1].disabled = CHART.zoom === CHART_R.length - 1; [].forEach.call(CHART.zb, function (k) { k.style.opacity = k.disabled ? '.4' : '1'; }); }
}
/** 每 6 格畫面（61_hud.js hudFrame）：沒開就藏起來。 */
function chartDraw(me) {
  var on = RUNNING && me && chartReady();
  if (!on) { if (CHART.box && CHART.box.style.display !== 'none') CHART.box.style.display = 'none'; return; }
  var bx0 = chartEl(), c = CHART.cv, A = CHART.A, ch = A.chunk, port = innerHeight > innerWidth, W = port ? 132 : 176, dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (bx0.style.display === 'none') { bx0.style.display = 'block'; chartZoom(0); }
  if (c.width !== W * dpr) { c.width = c.height = W * dpr; c.style.width = c.style.height = W + 'px'; }
  // 右下角、右邊那一排按鈕的上面：跟 c 橫向重疊的按鈕裡最高的那一個的頂 ⇒ 底
  var top = innerHeight - 8;
  ['helmR', 'ctlRow', 'navBox'].forEach(function (id) { var e = $(id); if (!e || !e.offsetParent) return; var r = e.getBoundingClientRect(); if (r.right > innerWidth - W - 16 && r.height) top = Math.min(top, r.top); });
  var bt = Math.max(8, innerHeight - top + 8) + 'px'; if (bx0.style.bottom !== bt) bx0.style.bottom = bt;
  // 航跡：模擬時間 2 秒一點（新的一場 ⇒ 清掉）
  if (SIMT < CHART.trT) CHART.trail = [];
  if (SIMT - CHART.trT >= 2 || CHART.trT < 0) { CHART.trT = SIMT; CHART.trail.push([me.px, me.pz]); if (CHART.trail.length > CHART_TRAIL) CHART.trail.shift(); }
  var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, W);
  var e0 = A.x[0] * ch, s0 = A.y[0] * ch, ew = (A.x[1] + 1) * ch - e0, sw = (A.y[1] + 1) * ch - s0;   // 海域在底圖上的範圍（往東、往南公尺）
  var R = CHART_R[CHART.zoom], ce = BED.ax + me.px, cs = BED.az + me.pz;                            // 中心：我艦（整個海域 ⇒ 海域中心）
  if (!R) { R = Math.max(ew, sw) / 2; ce = e0 + ew / 2; cs = s0 + sw / 2; }
  var kp = CHART_PX / ch, sc = W / (2 * R);                                                          // 底圖每公尺幾點；畫面每公尺幾 px
  function P(e, s) { return [W / 2 + (e - ce) * sc, W / 2 + (s - cs) * sc]; }
  g.save(); g.beginPath(); g.roundRect ? g.roundRect(0, 0, W, W, 10) : g.rect(0, 0, W, W); g.clip();
  g.fillStyle = 'rgb(' + CHART_COL.deep.join(',') + ')'; g.fillRect(0, 0, W, W);
  g.imageSmoothingEnabled = true;
  g.drawImage(CHART.im, (ce - R - e0) * kp, (cs - R - s0) * kp, 2 * R * kp, 2 * R * kp, 0, 0, W, W);
  if (CHART.trail.length > 1) {                                                                       // 航跡
    g.strokeStyle = 'rgba(255,236,170,.75)'; g.lineWidth = 1.4; g.setLineDash([3, 3]); g.beginPath();
    CHART.trail.forEach(function (p, i) { var q = P(BED.ax + p[0], BED.az + p[1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    var qn = P(BED.ax + me.px, BED.az + me.pz); g.lineTo(qn[0], qn[1]); g.stroke(); g.setLineDash([]);   // 接到現在的位置
  }
  var o = P(0, 0); g.font = '12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f0c56a'; g.fillText('⚓', o[0], o[1]);   // 海域原點 ＝ 地球儀的出發點
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
/** 讀數（?debug=1 的 __game.chart()）：開了沒、範圍、吃水門檻、底圖畫了幾塊（細／粗）、航跡幾點、畫面上的位置。 */
function chartInfo() {
  var r = CHART.res || {}, ks = Object.keys(r), b = CHART.box && CHART.box.style.display !== 'none' ? CHART.cv.getBoundingClientRect() : null;
  return { on: !!b, zoom: CHART_R[CHART.zoom], need: +CHART.need.toFixed(2), fine: ks.filter(function (k) { return r[k] > 100; }).length, coarse: ks.filter(function (k) { return r[k] <= 100; }).length, trail: CHART.trail.length,
    box: b ? [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)] : null, view: [innerWidth, innerHeight] };
}

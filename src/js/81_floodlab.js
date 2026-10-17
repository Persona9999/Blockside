// ───────────────────────── 進水報表（沙盒；TASK-0654） ─────────────────────────
// Tim 2026-10-16：「沙盒可以做專門的報表紀錄水的變化細節與畫面對應 方便比對」（先量接縫是哪一種再動手）。
// ?lab=flood（＋ ship=<船>,<另一艘>、phx=mid／high／full ⇒ 進水粗／中／細）⇒ 船在沙盒裡浮穩（不開帆、另一艘移遠）、在水線下打幾個洞，
//   之後每 every 秒記一筆：進水讀數（33_flood.js flReadout）、水面網格（三角形、那一次重做幾毫秒）、接縫分類（flSeams）、同一刻的截圖（固定鏡頭）。
//   截圖那一刻 FL_SNAP（水面網格當場重做、不內插）⇒ 圖跟讀數是同一刻；量完 FL_SNAP／FL_STAT 還原。
// 結果寫進頁面上 id ＝ lab 的 pre（JSON；截圖是 data URL）；無頭 Chrome --dump-dom 讀：src/tests/flood_lab.py 寫成並排的 HTML 報表（../reports/，不入版控）。
//   ?debug=1 時 __game.floodLab(o) 同一套、回傳同一份。
// 參數（網址同名）：holes（x:dz:side:r，以 ; 分隔：x ＝ 水線那一段船長的比例 0–1、dz ＝ 水線下幾格、side 0 ＝ 格 +y 那一舷、r ＝ 半徑幾格；不給 ⇒ 預設三個）、
//   dur（秒，預設 60）、every（秒，預設 10）、fyaw、fpitch、fdist、fty（鏡頭；fty ＝ 注視點在船中心上面幾公尺，看底艙給負的；⛔ 不叫 dist／pitch：dist 是開局兩艘船的距離、pitch 是 ?cam=deck 的俯角 —— 撞名量過：dist=38 把另一艘擺到旁邊、進水整個不一樣）、cut（half ＝ 剖面、none；預設 half）、deck（拿掉幾層甲板，預設 0）、xray（1 ＝ 透視）、
//   boom（殉爆開局，TASK-0662：彈藥庫編號，0 後、1 前、0,1 兩間；浮穩之後直接整間炸 ⇒ 沒另外給 holes 就不打預設的洞；每一筆多記 ex ＝ 艙內最高水面離海面幾公尺（flabEx），另有每秒一筆的 trace）、
//   w（截圖寬，預設 480）、flat（1 ＝ 浪設 0）、focus（step ＝ 每一筆把鏡頭對準水面差最大的那條兩池交界；cell:x:y ＝ 固定對準那一欄最高的水面 —— 照 fpitch／fdist 拉近、鏡頭擺在往船中心那一側，fyaw 不用）。
// ⛔ 只在 ?lab=flood 或 __game.floodLab 才跑；一般遊戲一行都不多算。
// 鏡頭用自由鏡頭（CAM.mode 0：注視點 CAM.tgt、yaw／pitch／dist 照給的）。⛔ mode 4 是「我艦看向敵艦」：注視點固定在我艦中心上 4 m、yaw 照敵艦方向 ⇒ fyaw、對準都沒效（量過：focus 對準的點被蓋回船中心）。
// ⚠ 要帶 seed（flood_lab.py 沒給就補 seed=3）：沒帶 ⇒ 每次開都是隨機的一局，浮穩的姿勢、洞的位置、進水都不一樣（量過：同一組參數兩次 t 38 是 130／138 m³）；
//   帶了 ⇒ 兩次逐位元相同（帆繩物理開關都一樣）。
var FLAB_HOLES = [[0.35, 8, 0, 4], [0.55, 12, 1, 4], [0.7, 6, 0, 3]];

/** 在第 sh 艘、格 (x, z) 那一舷（side 0 ＝ 格 +y、1 ＝ −y）的船殼打一個半徑 r 格的洞（從最外那一格往艙內打穿）。__game.hole 與進水報表共用。 */
function labHole(sh, x, z, side, r) {
  var B = sh.T.base, y0 = -1, y, s = side ? 1 : -1, n = 0; r = r || 4;
  if (side) { for (y = 0; y < sh.T.cy; y++) if (B.get(x, y, z)) { y0 = y; break; } } else { for (y = B.sy - 1; y > sh.T.cy; y--) if (B.get(x, y, z)) { y0 = y; break; } }
  if (y0 < 0) return null;
  for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
    if (dx * dx + dz * dz > r * r) continue;
    for (var t = 0; t < 16; t++) { var yy = y0 + s * t; if (t > 2 && !B.get(x + dx, yy, z + dz)) break; if (removeVoxel(sh, x + dx, yy, z + dz, false)) n++; }
  }
  sh.rs.flush(); return { removed: n, skin: y0 };
}

/** 截圖：畫布縮到寬 w 的 JPEG（data URL）。畫布開著 preserveDrawingBuffer（01_gl.js）⇒ render() 之後隨時讀得到。 */
function flabShot(w) {
  var h = Math.round(cv.height * w / cv.width), c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
  c2.getContext('2d').drawImage(cv, 0, 0, w, h); return c2.toDataURL('image/jpeg', 0.82);
}

/** 接縫地圖（俯視，一格一個方塊；x 往右 ＝ 船頭方向的格 x、y 往下 ＝ 格 y）：
 *  方塊顏色 ＝ 哪一池（同一池同色，只用綠到藍 ⇒ 不跟紅、橘、洋紅撞；越深 ＝ 越高的甲板，高的畫在上面）、紅 ＝ 整塊沒畫（中心都判在船殼外）、橘框 ＝ 船殼邊切掉幾片、洋紅點 ＝ 有水但太薄沒畫；
 *  綠粗線 ＝ 兩池交界（兩片平面之間沒有面）、黃線 ＝ 懸空的邊（鄰格裝得了水但乾的）。 */
function flabMap(st, px) {
  var M = st.map, c2 = document.createElement('canvas'), W = M.NX * px + 2, H = M.NY * px + 2, g = c2.getContext('2d'); c2.width = W; c2.height = H;
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, H);
  M.top.slice().sort(function (a, b) { return a[2] - b[2]; }).forEach(function (q) {
    var x = 1 + q[0] * px, y = 1 + q[1] * px;
    g.fillStyle = q[4] === 2 ? '#e02020' : 'hsl(' + (90 + (q[3] * 53) % 160) + ',45%,' + (66 - Math.min(24, q[2] * 3)) + '%)'; g.fillRect(x, y, px, px);
    if (q[4] === 1) { g.strokeStyle = '#ff8c00'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, px - 2, px - 2); }
  });
  g.fillStyle = '#d000d0'; (st.thin || []).forEach(function (q) { g.beginPath(); g.arc(1 + (q[0] + 0.5) * px, 1 + (q[1] + 0.5) * px, px * 0.22, 0, 7); g.fill(); });
  M.edge.forEach(function (e) {
    var x = 1 + e[0] * px, y = 1 + e[1] * px, d = e[2];
    g.strokeStyle = e[3] === 1 ? '#0a8a2a' : '#e6c200'; g.lineWidth = e[3] === 1 ? 3 : 2; g.beginPath();
    if (d === 0) { g.moveTo(x, y); g.lineTo(x, y + px); } else if (d === 1) { g.moveTo(x + px, y); g.lineTo(x + px, y + px); } else if (d === 2) { g.moveTo(x, y); g.lineTo(x + px, y); } else { g.moveTo(x, y + px); g.lineTo(x + px, y + px); }
    g.stroke();
  });
  return c2.toDataURL('image/png');
}

/** 整個報表：o 見檔頭。回 { hull, lv, o, holes, rows: [{ t, fl, mesh, seam, img, map }] }。
 *  ⚠ 截圖每次跑都會差一點（量過：還沒進水的 t 8 兩次就不一樣，換掉 Math.random 也一樣 ⇒ 畫面裡有別的跟真實時間走的東西）⇒ 比圖照像素差的大小比，不比位元組。 */
function floodLab(o) {
  o = Object.assign({ holes: FLAB_HOLES, dur: 60, every: 10, yaw: 2.6, pitch: 0.42, dist: 0, cut: 'half', deck: 0, xray: false, w: 480, flat: false }, o || {});
  var seaK = SEA_K; if (o.flat) SEA_K = 0;
  flowMode('sandbox'); reset(); AUTOFIRE = false; flowRun(false);
  var sh = SHIPS[0], i;
  SHIPS.forEach(function (s2) { s2.sailSet = 0; s2.power = 0; s2.manual = true; s2.rudder = 0; });
  if (SHIPS[1]) { SHIPS[1].px += 3000; SHIPS[1].pz += 3000; }
  for (i = 0; i < Math.round(LAB_SETTLE / DT); i++) simStep();
  sh.M = shipMatrix(sh); sh.inv = M4.inv(sh.M); sh.center = shipCenter(sh);
  var out = { hull: sh.T.id, seed: SEED, lv: FLOOD_LV, c: sh.fl ? sh.fl.F.c : null, sea: SEA_K, o: { dur: o.dur, every: o.every, cut: o.cut, deck: o.deck, xray: !!o.xray }, holes: [], rows: [] };
  if (!sh.fl) { out.err = '進水是公式模式（物理效果的「進水」第 0 檔）⇒ 沒有艙內的水可畫；網址加 phx=mid／high／full'; SEA_K = seaK; return out; }
  var T = sh.T, x0 = T.wl0, x1 = T.wl1;
  if (o.boom) o.boom.forEach(function (k) { var g = sh.mags[k]; if (g) magBoom(sh, g); out.holes.push({ boom: k, mag: g ? g.name : null }); });   // 殉爆開局（TASK-0662）：整間直接炸（同 __game.ignite(0, k, 'mag')）
  (o.boom && !o.holesSet ? [] : o.holes).forEach(function (hd) {
    var x = Math.round(x0 + (x1 - x0) * hd[0]), sk = labSkin(sh, x, hd[2]);
    var z = sk ? sk.z - hd[1] : null, r = z === null ? null : labHole(sh, x, z, hd[2], hd[3]);
    out.holes.push({ x: x, z: z, side: hd[2], r: hd[3], removed: r ? r.removed : 0 });
  });
  // 鏡頭：對著船中、看艙內（剖面拿掉靠鏡頭那一半）
  var cc = shipCenter(sh); camSet({ tgt: [cc[0], cc[1] + (o.ty || 0), cc[2]], trYaw: null, trMe: null });   // 注視點：船中心往上 ty 公尺（看底艙 ⇒ 負的）
  camSet({ follow: null, mode: 0, yaw: o.yaw, pitch: o.pitch, dist: o.dist > 0 ? o.dist : Math.max(60, (x1 - x0) * S * 0.95) });
  CUTV.half = o.cut === 'half'; CUTV.deck = o.deck | 0; FLX3 = !!o.xray;
  var snap0 = FL_SNAP, stat0 = FL_STAT; FL_SNAP = FL_STAT = true;
  var n = Math.round(o.every / DT), steps = Math.max(1, Math.round(o.dur / o.every)), tn = Math.max(1, Math.round(1 / DT));
  out.trace = [];                                                       // 每秒一筆：[t, 水 m³, 進 m³/s, 出 m³/s, 艙內最高水面 − 海面 m, 高出海面的水 m³, 下沉 m]（flabEx）
  for (var k = 0; k <= steps; k++) {
    var focusAt = null;
    if (k) { for (i = 0; i < n; i++) { simStep(); if (i % 30 === 29) remesh(Infinity); if (i % tn === tn - 1) { var ex = flabEx(sh); out.trace.push([+SIMT.toFixed(1), +sh.fl.vol.toFixed(1), +sh.fl.inQ.toFixed(2), +sh.fl.outQ.toFixed(2), ex.max, ex.vol, +sh.sink.toFixed(2)]); } } }
    remesh(Infinity); camSet({ snap: true }); camUpdate(1); render();
    if (o.focus === 'step' && sh.fl.mesh && sh.fl.mesh.stat) {             // 對準水面差最大的那條兩池交界（高的那一邊），拉近再拍
      var E = sh.fl.mesh.stat.map.edge.filter(function (e) { return e[3] === 1 && e[4] > 0; }).sort(function (a, b) { return b[4] - a[4]; })[0];
      if (o.focusCell) {                                                  // focus=cell:x:y ⇒ 固定對準那一欄（改前改後同一個角度比）：那一欄最高的水面
        var TT = sh.fl.mesh.stat.map.top.filter(function (q) { return q[0] === o.focusCell[0] && q[1] === o.focusCell[1]; }).sort(function (a, b) { return b[2] - a[2]; })[0];
        var Fc = sh.fl.F, hcell = TT ? M4.pt(sh.M, Fc.X0 + (TT[0] + 0.5) * Fc.c, Fc.Y0 + (TT[1] + 0.5) * Fc.c, (TT[2] + 1) * Fc.c)[1] : null;
        E = TT ? [TT[0], TT[1], -1, 1, 0, hcell] : null;
      }
      if (E) {
        var F2 = sh.fl.F, M = sh.M, gx = F2.X0 + (E[0] + 0.5 + (E[2] === 0 ? -0.5 : E[2] === 1 ? 0.5 : 0)) * F2.c, gy = F2.Y0 + (E[1] + 0.5 + (E[2] === 2 ? -0.5 : E[2] === 3 ? 0.5 : 0)) * F2.c;
        var gzz = (E[5] - (M[1] * gx + M[5] * gy + M[13])) / M[9], P = M4.pt(M, gx, gy, gzz);
        var ccn = shipCenter(sh); camSet({ yaw: Math.atan2(ccn[2] - P[2], ccn[0] - P[0]) });   // 鏡頭擺在那一點往船中心那一側（從艙裡往船殼看）⇒ 對準時 fyaw 不用
        camSet({ tgt: [P[0], P[1] - E[4] * 0.5, P[2]], trYaw: null, trMe: null, snap: true }); camUpdate(1); render();
        focusAt = { ix: E[0], iy: E[1], dir: E[2], dh: +E[4].toFixed(2) };
      }
    }
    var me = sh.fl.mesh, st = me && me.stat ? me.stat : null, dh = st ? st.dh.slice().sort(function (a, b) { return a - b; }) : [];
    out.rows.push({ t: +SIMT.toFixed(1), fl: flReadout(sh), ex: flabEx(sh, true), ship: { broken: !!sh.broken, final: !!sh.sinkingFinal, sunk: !!sh.sunk }, focus: focusAt, cam: { eye: CAM.eye.map(function (v) { return +v.toFixed(2); }), look: (CAM.look || CAM.tgt).map(function (v) { return +v.toFixed(2); }) },
      mesh: me ? { tris: me.n / 3, quads: me.quads, ms: +(me.ms || 0).toFixed(2), falls: me.fn ? me.fn / 6 : 0, sides: me.sideN || 0, spill: me.fallN || 0, sideMax: me.sst ? +me.sst.max.toFixed(2) : 0, sideAt: me.sst ? me.sst.at : null, sideXo: me.sst ? me.sst.xo : 0, sideXf: me.sst ? me.sst.xf : 0, sideXoAt: me.sst && me.sst.xoAt ? me.sst.xoAt.slice(0, 8) : null, sideXn: me.sst ? me.sst.xn : 0, sideXoMax: me.sst ? me.sst.xoMax : 0, depBlit: FL_DEPBLIT, fst: me.fst || null } : null,
      seam: st ? { tops: st.tops, pools: st.pools, join: st.join, step: st.step, open: st.open, wall: st.wall, cutTops: st.cutTops, cutPieces: st.cutPieces, outTops: st.outTops,
        dhMed: dh.length ? +dh[dh.length >> 1].toFixed(2) : 0, dhMax: dh.length ? +dh[dh.length - 1].toFixed(2) : 0,
        openAt: st.map.edge.filter(function (e) { return e[3] === 2; }).slice(0, 12).map(function (e) { return e.slice(0, 3); }) } : null,   // 懸空的邊（水邊 noise 會上的那幾邊）：[x, y, 方向] ⇒ focus=cell:x:y 拉近看
      img: flabShot(o.w), map: st ? flabMap(st, sh.fl.F.c >= 10 ? 10 : 6) : null });
  }
  FL_SNAP = snap0; FL_STAT = stat0; SEA_K = seaK;
  return out;
}

/** 艙內水面高出海面多少（TASK-0662；Tim 2026-10-16 殉爆後艙內的水停在海面以上不退）：每一格有水的水格，水面（照 flTick head 同一套：格底 ＋ 裝了幾成 × 格高，裝超過一成照算 ⇒ 擠出來的也看得到）減那一點正上方的海面（seaH，照浪）。
 *  回 { max 最高那格高出幾 m、at 那一格 [ix, iy, iz]、fill 那一格裝了幾成、n 高出 0.3 m 以上的格數、vol 高出海面的水 m³（每格只算海面以上那一截）、over 裝超過的格數、overV 裝超過的水 m³；room ⇒ 另外 roomBelow 海面以下還空著的 m³、roomWet 其中已經有水的格、nWetRoom 那幾格的格數 }。只讀。 */
function flabEx(sh, room) {
  var fl = sh.fl, F = fl.F, c = F.c, NX = F.NX, NXY = NX * F.NY, M = sh.M, Vc = Math.pow(c * S, 3), hc = c * S, r = { max: -99, at: null, fill: 0, n: 0, vol: 0, over: 0, overV: 0 };
  var h0 = M[1] * (F.X0 + 0.5 * c) + M[5] * (F.Y0 + 0.5 * c) + M[13], dhx = M[1] * c, dhy = M[5] * c, dhz = M[9] * c;
  for (var t = 0; t < fl.actN; t++) {
    var i = fl.act[t], A = fl.A[i], cp = fl.cap[i]; if (!(A > 1e-4) || !(cp > 0.02)) continue;
    var ix = i % NX, iy = ((i / NX) | 0) % F.NY, iz = (i / NXY) | 0, f = A / (cp * Vc), hb = h0 + ix * dhx + iy * dhy + iz * dhz, h = hb + f * hc;
    var P = M4.pt(M, F.X0 + (ix + 0.5) * c, F.Y0 + (iy + 0.5) * c, iz * c), sea = seaH(P[0], P[2], SIMT), e = h - sea;
    if (f > 1.001) { r.over++; r.overV += A - cp * Vc; }
    if (e > r.max) { r.max = e; r.at = [ix, iy, iz]; r.fill = f; }
    if (e > 0.3) r.n++;
    if (e > 0) r.vol += A * Math.min(1, e / Math.max(1e-6, f * hc));
  }
  if (room) {                                                           // 海面以下還空著多少（每一格裝到海面那一點的高度為止）、其中已經有水的那幾格
    var rb = 0, rbW = 0, nw = 0;
    for (var i2 = 0; i2 < F.N; i2++) { var cp2 = fl.cap[i2]; if (!(cp2 > 0.02)) continue; var jx = i2 % NX, jy = ((i2 / NX) | 0) % F.NY, jz = (i2 / NXY) | 0, P2 = M4.pt(M, F.X0 + (jx + 0.5) * c, F.Y0 + (jy + 0.5) * c, jz * c), f2 = clamp((seaH(P2[0], P2[2], SIMT) - P2[1]) / hc, 0, 1), rr2 = f2 * cp2 * Vc - fl.A[i2]; if (rr2 <= 0) continue; rb += rr2; if (fl.A[i2] > 1e-4) { rbW += rr2; nw++; } }
    r.roomBelow = +rb.toFixed(0); r.roomWet = +rbW.toFixed(0); r.nWetRoom = nw;
  }
  r.max = +r.max.toFixed(2); r.fill = +r.fill.toFixed(2); r.vol = +r.vol.toFixed(1); r.overV = +r.overV.toFixed(1);
  return r;
}

/** 換個鏡頭再拍一張（__game.floodView；找報表的固定角度用）：o ＝ { yaw, pitch, dist, ty, cut: 'half'|'none', deck, xray, w }，沒給的照現在的。回 data URL。 */
function floodView(o) {
  o = o || {};
  if (o.ty !== undefined && SHIPS[0]) { var cc = shipCenter(SHIPS[0]); camSet({ tgt: [cc[0], cc[1] + o.ty, cc[2]], trYaw: null, trMe: null }); }
  var cs = { follow: null, mode: 0 }; ['yaw', 'pitch', 'dist'].forEach(function (k) { if (o[k] !== undefined) cs[k] = o[k]; }); camSet(cs);
  if (o.cut !== undefined) CUTV.half = o.cut === 'half'; if (o.deck !== undefined) CUTV.deck = o.deck | 0; if (o.xray !== undefined) FLX3 = !!o.xray;
  var snap0 = FL_SNAP; FL_SNAP = true; camSet({ snap: true }); camUpdate(1); render(); FL_SNAP = snap0;
  return flabShot(o.w || 480);
}

/** 網址 ?lab=flood 的參數 ⇒ floodLab 的 o。 */
function flLabOpts() {
  var o = {};
  if (Q.has('boom')) o.boom = Q.get('boom').split(',').filter(function (w) { return w !== ''; }).map(Number);   // 殉爆開局：boom=0（後彈藥庫）、1（前）、0,1；有給 boom 又沒給 holes ⇒ 不另外打洞
  if (Q.has('holes')) o.holesSet = true;
  if (Q.has('holes')) o.holes = Q.get('holes').split(';').filter(function (w) { return w; }).map(function (w) { return w.split(':').map(Number); });
  ['dur', 'every', 'deck', 'w'].forEach(function (k) { if (Q.has(k)) o[k] = +Q.get(k); });
  [['fyaw', 'yaw'], ['fpitch', 'pitch'], ['fdist', 'dist'], ['fty', 'ty']].forEach(function (kk) { if (Q.has(kk[0])) o[kk[1]] = +Q.get(kk[0]); });
  if (Q.has('cut')) o.cut = Q.get('cut');
  if (Q.has('focus')) { o.focus = Q.get('focus'); var fm = /^cell:(\d+):(\d+)$/.exec(o.focus); if (fm) { o.focus = 'step'; o.focusCell = [+fm[1], +fm[2]]; } }
  if (Q.get('xray') === '1') o.xray = true;
  if (Q.get('flat') === '1') o.flat = true;
  return o;
}

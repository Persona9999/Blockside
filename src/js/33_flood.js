// ───────────────────────── 進水：粒子模式（TASK-0525） ─────────────────────────
// 兩種模式（Tim 2026-10-13）：物理效果的「進水」第 0 檔 ＝ 公式（32_hull.js：水線下破洞數 × √水深）；1–3 檔 ＝ 粒子（粗／中／細）。全開 ＝ 細。
// 粒子模式：進水量、下沉、傾斜完全由艙內的水決定 ——
//   · 破口：船殼最外那一層被打掉、而且往艙內一路通到原本是空的地方（flHoleRedo），每 c × c 格算一塊（面積 ＝ 通的格數 × S²）。
//     流量照 Torricelli：FL_C × 面積 × √(2g × 水頭差) × 滑桿／預設（細節設定的「進水速度」；預設 0.35 ⇒ ×1 ＝ 物理的流量）。
//     水頭差 ＝ 外面的水面（seaH，照浪）減艙內在那個洞的水面，兩邊都不低於洞本身 ⇒ 浮出水面的洞不進水；艙內的水比外面高 ⇒ 往外流。
//   · 流進來的水是粒子（每顆帶 vj m³）：從洞往艙內噴（初速 √(2g × 水頭差)），照重力在船的座標裡落下，碰到船體或水面就併進水格。粒子滿了 ⇒ 直接併進洞旁那一格。
//   · 水格（每格 c 格見方，存水量 m³）：往下流（照那一格最密的那一層開著幾成：甲板擋、艙口與破洞讓水下去）；滿了往上擠；
//     往旁邊流照水面的世界高度（船的矩陣，含傾斜與浪的搖晃）⇒ 船一傾斜，水往低的那一舷跑，再把船壓得更斜（自由液面）。
//   · 抽水機：每秒從最低的那一層水抽掉 FL_PUMP × pumpK ×（滑桿／預設）m³（FL_PUMP 約每分鐘 18 噸：四台鏈式抽水機全力抽；pumpK ＝ 那一型的基礎抽水量 cfg.pump／18，TASK-0604）。
//     ⛔ 照公式那邊的抽水換算（0.004 m/s × 水線面積 ≈ 每秒 0.84 m³）⇒ 比水線附近那幾個洞進得還快，戰鬥 420 秒艙裡一滴水都留不住（量過）。
//   · 船：艙內的水 ＝ 加上去的重量 ⇒ 照浮力表（32_hull.js liftFor）算多吃水多少，sh.sink 照它慢慢跟過去（FL_TAU 秒）；
//     水的重心偏哪一舷 ⇒ 往那邊傾斜（穩心高 FL_GM，見下）、偏船頭船尾 ⇒ 縱傾（FL_GML）；上限跟公式一樣（開始沉之前 0.21 rad、縱傾 0.07）。
//     開始沉（下沉 4.2 m）之後照舊加速沉下去；斷成兩截照舊（公式，一定沉）。
// 精細等級 FL_LV：c 水格邊長幾格、ev 幾步算一次水格、jn 粒子上限（每艘）、vj 每顆帶多少 m³、dn 每次最多重算幾格被打壞的水格與破口。
// 戰局：自己的亂數 rndF（開局重設）；各檔水格不同 ⇒ 各檔是各自的一局（同一個種子各自逐字重現）。⛔ 不碰 rnd()、不讀畫面的設定。
//   進水模式開戰時決定（FLOOD_LV，70_flow.js），戰鬥中改了下一場生效。
var FL_LV = [null, { c: 10, ev: 4, jn: 300, vj: 0.25, dn: 120 }, { c: 7, ev: 2, jn: 800, vj: 0.08, dn: 200 }, { c: 5, ev: 2, jn: 2000, vj: 0.03, dn: 300 }];
// FL_GM 穩心高（Tim 2026-10-13：傾斜收一點）：1.1 m（巡防艦的量級）⇒ 水往低的那一舷跑（自由液面），一舷有洞積 200 噸就斜到上限 12°、兩舷都有洞也一樣；
//   4 m ⇒ 一舷有洞 180／380／600／840 噸時 1.9°／4.7°／8.4°／12°，兩舷都有洞 1,140 噸才 3.7°（沙盒 60 秒量的；2 m、3 m 還是很快頂到上限，5 m 一舷 830 噸才 8.3°）。
var FL_C = 1.0, FL_PUMP = 0.3, FL_GM = 4, FL_GML = 60, FL_TAU = 2;
var FL_HIDE = false, FLOOD_LV = 0, RSF0 = 0x3C6EF372, rsF = SEED ^ RSF0;
function rndF() { rsF |= 0; rsF = rsF + 0x6D2B79F5 | 0; var t = Math.imul(rsF ^ rsF >>> 15, 1 | rsF); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function rgF(a, b) { return a + (b - a) * rndF(); }
/** 船型 T 的水格（邊長 c 格；第一次用到時算，掛在 T.flc[c]）：兩舷船殼最外那一格（yP／yM，每個 (x, z)）、每格能裝多少（cap：艙內空的比例）、往下通多少（pd：最密那一層開著的比例）。
 *  照船殼 T.hullG（砲帶的裝甲拆掉之後，24_armor.js；沒有裝甲 ＝ T.base）：⛔ 照含裝甲的 ⇒ 砲塔圓筒當成外殼，sh.grid 裡沒有它 ⇒ flHoleRedo 一量就是破口。 */
function flType(T, c) {
  var K = T.flc || (T.flc = {}); if (K[c]) return K[c];
  var B = T.hullG, zTop = Math.min(B.sz, T.zw + 46), x0 = Math.max(0, T.wl0 - 4), x1 = Math.min(B.sx - 1, T.wl1 + 4), cy = T.cy, TW = T.hullTW, HB = T.hullHB;
  var nxv = x1 - x0 + 1, yP = new Int16Array(nxv * zTop).fill(-1), yM = new Int16Array(nxv * zTop).fill(-1), ylo = 1e9, yhi = -1, x, y, z;
  for (z = 0; z < Math.min(zTop, T.hullTH); z++) for (x = x0; x <= x1; x++) {
    var hb = HB[z * TW + x]; if (!hb) continue;
    var k = z * nxv + x - x0;
    for (y = Math.min(B.sy - 1, Math.ceil(cy + hb)); y > cy; y--) if (B.get(x, y, z)) { yP[k] = y; break; }
    for (y = Math.max(0, Math.floor(cy - hb - 1)); y < cy; y++) if (B.get(x, y, z)) { yM[k] = y; break; }
    if (yP[k] < 0 || yM[k] < 0) { yP[k] = yM[k] = -1; continue; }
    if (yM[k] < ylo) ylo = yM[k]; if (yP[k] > yhi) yhi = yP[k];
  }
  var NX = Math.ceil(nxv / c), NY = Math.ceil((yhi - ylo + 1) / c), NZ = Math.ceil(zTop / c), N = NX * NY * NZ;
  var F = { c: c, X0: x0, Y0: ylo, NX: NX, NY: NY, NZ: NZ, N: N, nxv: nxv, zTop: zTop, yP: yP, yM: yM, cap: new Float32Array(N), pd: new Float32Array(N), op: new Float32Array(N * c), ol: new Float32Array(N * c) };   // op：每格每一層空著幾格（水照層疊上去：畫水面、flPd）；ol：那一層開著幾成（那一層沒有艙內 ⇒ −1）
  var intC = new Int32Array(N), solC = new Int32Array(N), intL = new Int32Array(N * c), solL = new Int32Array(N * c);
  for (z = 0; z < zTop; z++) for (x = x0; x <= x1; x++) {
    var kk = z * nxv + x - x0, a = yM[kk] + 1, b = yP[kk] - 1; if (yP[kk] < 0 || b < a) continue;
    var cxi = ((x - x0) / c) | 0, czi = (z / c) | 0, lz = z % c;
    for (var cyi = ((a - ylo) / c) | 0; cyi <= (((b - ylo) / c) | 0); cyi++) {
      var lo = Math.max(a, ylo + cyi * c), hi = Math.min(b, ylo + cyi * c + c - 1), cell = (czi * NY + cyi) * NX + cxi;
      intC[cell] += hi - lo + 1; intL[cell * c + lz] += hi - lo + 1;
    }
  }
  B.each(function (x, y, z) {
    if (z >= zTop || x < x0 || x > x1) return;
    var kk = z * nxv + x - x0; if (!(y > yM[kk] && y < yP[kk])) return;
    var cell = (((z / c) | 0) * NY + (((y - ylo) / c) | 0)) * NX + (((x - x0) / c) | 0); solC[cell]++; solL[cell * c + z % c]++;
  });
  for (var i = 0; i < N; i++) {
    F.cap[i] = (intC[i] - solC[i]) / (c * c * c);
    var p = 1, any = false;
    for (var l = 0; l < c; l++) { var il = intL[i * c + l]; F.op[i * c + l] = il - solL[i * c + l]; F.ol[i * c + l] = il > 0 ? (il - solL[i * c + l]) / il : -1; if (il > 0) { any = true; p = Math.min(p, (il - solL[i * c + l]) / il); } }
    F.pd[i] = any ? p : 0;
  }
  return K[c] = F;
}
/** 開一艘船的進水狀態（makeShip；公式模式 ⇒ null）。 */
function flNew(sh) {
  var L = FL_LV[FLOOD_LV]; if (!L) return null;
  var F = flType(sh.T, L.c), N = F.N, H = 2 * F.NX * F.NZ;
  return { L: L, F: F, cap: F.cap.slice(), pd: F.pd.slice(), op: F.op.slice(), ol: F.ol.slice(), A: new Float32Array(N), on: new Uint8Array(N), act: new Int32Array(4096), actN: 0, dmark: new Uint8Array(N), dirty: [],
    hA: new Float32Array(H), hX: new Float32Array(H), hY: new Float32Array(H), hZ: new Float32Array(H), hYi: new Float32Array(H), hAcc: new Float32Array(H), hmark: new Uint8Array(H), hon: new Uint8Array(H), hdirty: [], holes: [],
    J: { n: 0, p: new Float32Array(L.jn * 3), v: new Float32Array(L.jn * 3), vol: new Float32Array(L.jn), life: new Float32Array(L.jn) },
    vol: 0, area: 0, open: 0, inQ: 0, outQ: 0, inTot: 0, outTot: 0, pumped: 0, comX: 0, comY: 0, sinkT: 0, step: 0, gen: 0, mesh: null,
    dq: new Float32Array(N), dqOn: new Uint8Array(N), dqL: [], dqT: 0, fo: new Map() };   // dq…：往下流的量（只給畫面的水幕，flFalls；⛔ 模擬不讀）；fo：每一格往下流的開口在哪（快取）
}
function flAct(fl, i) {
  if (fl.on[i]) return; fl.on[i] = 1;
  if (fl.actN >= fl.act.length) { var a = new Int32Array(fl.act.length * 2); a.set(fl.act); fl.act = a; }
  fl.act[fl.actN++] = i;
}
/** 打掉一格（20_shatter.js removeVoxel）：那一格所在的水格、靠近船殼的話那一塊破口，記下來待重算。 */
function floodTouch(sh, x, y, z) {
  var fl = sh.fl, F = fl.F, c = F.c;
  if (z >= F.zTop || z < 0 || x < F.X0 || x >= F.X0 + F.nxv) return;
  var iy = ((y - F.Y0) / c) | 0, bx = ((x - F.X0) / c) | 0, bz = (z / c) | 0;
  if (y >= F.Y0 && iy < F.NY) { var i = (bz * F.NY + iy) * F.NX + bx; if (!fl.dmark[i]) { fl.dmark[i] = 1; fl.dirty.push(i); } }
  var k = z * F.nxv + x - F.X0, yp = F.yP[k]; if (yp < 0) return;
  var side = Math.abs(y - yp) <= Math.abs(y - F.yM[k]) ? 0 : 1, d = side ? y - F.yM[k] : yp - y;
  if (d > 30 || d < -2) return;
  var h = (side * F.NX + bx) * F.NZ + bz; if (!fl.hmark[h]) { fl.hmark[h] = 1; fl.hdirty.push(h); }
}
/** 被打壞的水格重算（照現在的格）：能裝多少、往下通多少。 */
function flCellRedo(sh, fl, i) {
  var F = fl.F, c = F.c, ix = i % F.NX, iy = ((i / F.NX) | 0) % F.NY, iz = (i / (F.NX * F.NY)) | 0, Gd = sh.grid, it = 0, st = 0, p = 1, any = false;
  for (var l = 0; l < c; l++) {
    var z = iz * c + l, il = 0, sl = 0; fl.op[i * c + l] = 0; fl.ol[i * c + l] = -1; if (z >= F.zTop) continue;
    for (var dx = 0; dx < c; dx++) {
      var x = F.X0 + ix * c + dx; if (x - F.X0 >= F.nxv) break;
      var k = z * F.nxv + x - F.X0; if (F.yP[k] < 0) continue;
      var a = Math.max(F.yM[k] + 1, F.Y0 + iy * c), b = Math.min(F.yP[k] - 1, F.Y0 + iy * c + c - 1);
      for (var y = a; y <= b; y++) { il++; if (Gd.get(x, y, z)) sl++; }
    }
    fl.op[i * c + l] = il - sl; fl.ol[i * c + l] = il > 0 ? (il - sl) / il : -1; it += il; st += sl; if (il > 0) { any = true; p = Math.min(p, (il - sl) / il); }
  }
  fl.cap[i] = (it - st) / (c * c * c); fl.pd[i] = any ? p : 0;
  fl.fo.delete(i);                                                        // 水幕的開口照新的格重找（只給畫面）
}
/** 一塊破口重算：c × c 個船殼最外的點，每點從外往裡走，先碰到還在的格 ⇒ 不通；先走到原本是空的（艙內）⇒ 通。面積 ＝ 通的點數 × S²，記下中心與艙內那一側。 */
function flHoleRedo(sh, fl, h) {
  var F = fl.F, c = F.c, side = (h / (F.NX * F.NZ)) | 0, r = h % (F.NX * F.NZ), bx = (r / F.NZ) | 0, bz = r % F.NZ, Gd = sh.grid, B = sh.T.hullG, s = side ? 1 : -1;
  var n = 0, sx = 0, sy = 0, sz = 0, si = 0;
  for (var dz = 0; dz < c; dz++) for (var dx = 0; dx < c; dx++) {
    var x = F.X0 + bx * c + dx, z = bz * c + dz; if (x - F.X0 >= F.nxv || z >= F.zTop) continue;
    var k = z * F.nxv + x - F.X0, y0 = side ? F.yM[k] : F.yP[k]; if (y0 < 0) continue;
    for (var t = 0; t < 30; t++) { var y = y0 + s * t; if (Gd.get(x, y, z)) break; if (!B.get(x, y, z)) { n++; sx += x; sy += y0; sz += z; si += y; break; } }
  }
  fl.hA[h] = n * S * S;
  if (n) { fl.hX[h] = sx / n + 0.5; fl.hY[h] = sy / n + 0.5; fl.hZ[h] = sz / n + 0.5; fl.hYi[h] = si / n + 0.5; if (!fl.hon[h]) { fl.hon[h] = 1; fl.holes.push(h); } }
}
/** 第 i 格的水往下流得過去幾成：從這一格最下面那層往上、到水（W 格，照層疊）淹到的那一層為止，每層開著幾成取最小（Tim 2026-10-15：「水會跑到平頂上(且高出海平面) 應該要流下去才對」）。
 *  ⛔ 以前（pd）整格每一層取最小 ⇒ 格子上半截有頂板、甲板 ⇒ 0 ⇒ 天花板底下那兩層的水永遠下不去（維吉尼亞號砲廓頂底下：船晃、下沉過之後留在高處，比海面還高）。
 *  水上面的頂板不算；水底下（或水本身那一層）有甲板 ⇒ 照舊擋住。 */
function flPd(fl, i, W) {
  var c = fl.F.c, o = i * c, p = 1, any = false;
  for (var l = 0; l < c; l++) { var f = fl.ol[o + l]; if (f < 0) continue; any = true; if (f < p) p = f; var n = fl.op[o + l]; if (n > 0) { if (W <= n) break; W -= n; } }
  return any ? p : 0;
}
/** 艙內那一點 (x, y, z)（格座標）所在的水格；不在格子範圍 ⇒ −1。 */
function flCell(F, x, y, z) {
  var ix = Math.floor((x - F.X0) / F.c), iy = Math.floor((y - F.Y0) / F.c), iz = Math.floor(z / F.c);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= F.NX || iy >= F.NY || iz >= F.NZ) return -1;
  return (iz * F.NY + iy) * F.NX + ix;
}
/** 水併進第 i 格（那一格裝不了水 ⇒ 往上找三格）。 */
function flDeposit(fl, i, v) {
  var NXY = fl.F.NX * fl.F.NY;
  for (var t = 0; t < 4 && i >= 0 && i < fl.F.N; t++, i += NXY) if (fl.cap[i] > 0.02) { fl.A[i] += v; flAct(fl, i); return; }
  fl.lost = (fl.lost || 0) + v;
}
/** 斷成兩截、開始沉的船（Tim 2026-10-15：「斷成兩截、開始沉的船也繼續算進水給人看（只改畫面與讀數，沉的速度照舊），沉完就停」）：
 *  照樣跑 floodStep（水灌進去、讀數有積水與破口），但 ——
 *  · 下沉照舊（32_hull.js：開始沉之後照公式、不看水）；傾斜照「開始沉那一刻」的水（fl.keep，floodTilt 讀它）⇒ 船的動作一位元都不變；
 *  · 亂數用這艘自己的一串（fl.rsV）⇒ 不動到全場共用的 rsF，別艘的進水照舊；
 *  · 沉沒（sh.sunk）就不再跑（⛔ 以前照算 ⇒ 沉掉的船積到 8 萬噸、白耗 CPU）。 */
function floodVis(sh, fl, dt) {
  if (!fl.keep) fl.keep = { vol: fl.vol, comX: fl.comX, comY: fl.comY };
  var r = rsF; rsF = fl.rsV === undefined ? (SEED ^ RSF0 ^ Math.imul(0x9E3779B9, sh.i + 1)) : fl.rsV;
  var t0 = DEBUG ? performance.now() : 0; floodStep(sh, fl, dt); if (DEBUG) { FL_VISMS += performance.now() - t0; FL_VISN++; }
  fl.rsV = rsF; rsF = r; fl.vis = true;
}
var FL_VISMS = 0, FL_VISN = 0;
/** 抽水的倍率（TASK-0604）：那一型的基礎抽水量（噸／分，cfg.pump）÷ PUMP_REF。⛔ 沒有 pump（舊存檔、外部傳進來的 cfg）⇒ 1（照以前）。 */
function pumpK(sh) { var p = sh.cfg.pump; return p === undefined || !isFinite(p) ? 1 : p / PUMP_REF; }
/** 每一步（32_hull.js stepShip，粒子模式）：粒子飛、每 ev 步算一次水格（破口進出水、往下往旁邊流、抽水、讀數）。 */
function floodStep(sh, fl, dt) {
  if (!(dt > 0)) return;
  var F = fl.F, L = fl.L, J = fl.J, Vc = Math.pow(F.c * S, 3), gL = M4.dir(sh.inv, 0, -G, 0), i, o;
  // 粒子：照重力（船的座標，格／秒²）落下；碰到船體、滿的水格、出界或活太久 ⇒ 併進上一個位置的水格
  for (i = 0; i < J.n; i++) {
    o = i * 3;
    var px = J.p[o], py = J.p[o + 1], pz = J.p[o + 2], c0 = flCell(F, px, py, pz);
    J.v[o] += gL[0] * dt; J.v[o + 1] += gL[1] * dt; J.v[o + 2] += gL[2] * dt;
    J.p[o] += J.v[o] * dt; J.p[o + 1] += J.v[o + 1] * dt; J.p[o + 2] += J.v[o + 2] * dt; J.life[i] -= dt;
    var c1 = flCell(F, J.p[o], J.p[o + 1], J.p[o + 2]);
    if (J.life[i] <= 0 || c1 < 0 || sh.grid.get(Math.floor(J.p[o]), Math.floor(J.p[o + 1]), Math.floor(J.p[o + 2])) || fl.A[c1] >= fl.cap[c1] * Vc * 0.95) {
      flDeposit(fl, c0 >= 0 ? c0 : c1, J.vol[i]);
      var j = --J.n;
      if (i !== j) { J.p.copyWithin(o, j * 3, j * 3 + 3); J.v.copyWithin(o, j * 3, j * 3 + 3); J.vol[i] = J.vol[j]; J.life[i] = J.life[j]; }
      i--;
    }
  }
  if (++fl.step % L.ev) return;
  flTick(sh, fl, dt * L.ev);
}
function flTick(sh, fl, dtc) {
  var S3 = S * S * S, F = fl.F, L = fl.L, J = fl.J, c = F.c, NX = F.NX, NY = F.NY, NXY = NX * NY, N = F.N, A = fl.A, cap = fl.cap, pd = fl.pd, M = sh.M, Vc = Math.pow(c * S, 3), hc = c * S, fk = sh.cfg.flood / LIM.flood[2], i, k, m;   // 滑桿／預設：預設 ⇒ 物理的流量
  // 0. 被打壞的水格、破口（每次最多 dn 個 ⇒ 一發殉爆不會卡一下）
  for (k = 0; k < L.dn && fl.dirty.length; k++) { i = fl.dirty.shift(); fl.dmark[i] = 0; flCellRedo(sh, fl, i); }
  for (k = 0; k < L.dn && fl.hdirty.length; k++) { var hd = fl.hdirty.shift(); fl.hmark[hd] = 0; flHoleRedo(sh, fl, hd); }
  // 水面的世界高度：格 (ix, iy, iz) 的底 ＋ 裝了幾成 × 格高
  var h0 = M[1] * (F.X0 + 0.5 * c) + M[5] * (F.Y0 + 0.5 * c) + M[13], dhx = M[1] * c, dhy = M[5] * c, dhz = M[9] * c;
  function head(i) { var ix = i % NX, iy = ((i / NX) | 0) % NY, iz = (i / NXY) | 0; return h0 + ix * dhx + iy * dhy + iz * dhz + (cap[i] > 0 ? A[i] / (cap[i] * Vc) : 0) * hc; }
  // 1. 破口：外面的水面 vs 艙內在洞那裡的水面（都不低於洞）⇒ 進或出
  var inQ = 0, outQ = 0, area = 0, open = 0;
  for (k = 0; k < fl.holes.length; k++) {
    var h = fl.holes[k], ar = fl.hA[h]; if (!(ar > 0)) continue;
    area += ar; open++;
    var side = (h / (NX * F.NZ)) | 0, s = side ? 1 : -1, P = M4.pt(M, fl.hX[h], fl.hY[h], fl.hZ[h]), hOut = seaH(P[0], P[2], SIMT);
    var ci = flCell(F, fl.hX[h], fl.hYi[h] + s * 0.5 * c, fl.hZ[h]), hIn = -1e9;
    if (ci >= 0 && A[ci] > 1e-6) { var q = ci; while (q + NXY < N && A[q] >= cap[q] * Vc * 0.98 && A[q + NXY] > 1e-6) q += NXY; hIn = head(q); }
    var d = Math.max(hOut, P[1]) - Math.max(hIn, P[1]);
    if (d > 0.001) {
      var dv = FL_C * ar * Math.sqrt(2 * G * d) * fk * dtc; inQ += dv;
      fl.hAcc[h] += dv;
      var sp = Math.sqrt(2 * G * d) / S;                                        // 噴進來的速度（格／秒）
      for (var nJ = 0; fl.hAcc[h] >= L.vj && nJ < ACC_CAP * 16; nJ++) {  // 防呆：一步最多 4096 份（≈ 80 m³ 以上才會碰到；00_core.js accFix）
        fl.hAcc[h] -= L.vj;
        if (J.n < L.jn) {
          var jo = J.n * 3; J.p[jo] = fl.hX[h] + rgF(-0.4, 0.4) * c; J.p[jo + 1] = fl.hYi[h] + s; J.p[jo + 2] = fl.hZ[h] + rgF(-0.4, 0.4) * c;
          J.v[jo] = rgF(-0.25, 0.25) * sp; J.v[jo + 1] = s * rgF(0.5, 1.0) * sp; J.v[jo + 2] = rgF(-0.1, 0.25) * sp; J.vol[J.n] = L.vj; J.life[J.n] = 3; J.n++;
        } else if (ci >= 0) flDeposit(fl, ci, L.vj);
      }
      accFix(fl.hAcc, h, L.vj, '進水');
    } else if (d < -0.001 && ci >= 0) {
      var ov = Math.min(FL_C * ar * Math.sqrt(2 * G * -d) * fk * dtc, A[ci]); A[ci] -= ov; outQ += ov;
      if (PHX.water && ov > 0.01) wpPour(P, M4.dir(M, 0, -s, 0), ov / dtc);    // 往外流：只給人看（13_water.js，自己的亂數）
    }
  }
  if (fl.tops) { var dq = doorInflow(sh, fl, dtc, head); inQ += dq[0]; area += dq[1]; open += dq[2]; }   // 門沒了的開口（25_doors.js；沒有門的船沒有 fl.tops）
  fl.inQ = inQ / dtc; fl.outQ = outQ / dtc; fl.inTot += inQ; fl.outTot += outQ; fl.area = area; fl.open = open;
  // 2. 水格：往下（照這一格往下通幾成）、滿了往上擠、往旁邊（照水面的世界高度；來回換方向走 ⇒ 不偏一邊）
  var n0 = fl.actN, act = fl.act, dir = fl.gen & 1, t, j;
  for (t = 0; t < n0; t++) {
    i = act[t]; var a = A[i]; if (a <= 1e-7) continue;
    var pdi = i >= NXY ? flPd(fl, i, a / S3) : 0;                          // 往下通幾成：只看水那一層以下（flPd）
    if (pdi > 0.02) { j = i - NXY; var room = cap[j] * Vc - A[j]; if (room > 0) { m = Math.min(a, room) * Math.min(1, pdi * 4); A[i] -= m; A[j] += m; flAct(fl, j); if (!fl.dqOn[i]) { fl.dqOn[i] = 1; fl.dqL.push(i); } fl.dq[i] += m; } }   // dq：往下流了多少（只記，水幕用）
    var ex = A[i] - cap[i] * Vc;
    if (ex > 1e-6 && i + NXY < N && cap[i + NXY] > 0.02 && flPd(fl, i + NXY, A[i + NXY] / S3) > 0.02) { A[i] -= ex; A[i + NXY] += ex; flAct(fl, i + NXY); }
  }
  for (t = 0; t < n0; t++) {
    i = act[dir ? n0 - 1 - t : t]; if (A[i] <= 1e-7 || !(cap[i] > 0.02) || A[i] / (cap[i] * Vc) < 0.03) continue;
    var hi = head(i), ix = i % NX, iy = ((i / NX) | 0) % NY;
    for (var nb = 0; nb < 4; nb++) {
      j = nb === 0 ? (ix > 0 ? i - 1 : -1) : nb === 1 ? (ix < NX - 1 ? i + 1 : -1) : nb === 2 ? (iy > 0 ? i - NX : -1) : (iy < NY - 1 ? i + NX : -1);
      if (j < 0 || !(cap[j] > 0.02)) continue;
      var dh = hi - head(j); if (dh <= 1e-4) continue;
      m = Math.min(0.5 * dh / hc * Math.min(cap[i], cap[j]) * Vc * 0.25, A[i] * 0.25);
      A[i] -= m; A[j] += m; flAct(fl, j); hi = head(i);
    }
  }
  // 3. 抽水：從最低的那幾層抽（⛔ act 要重拿：上面 flAct 可能換過一條更長的陣列）
  act = fl.act;
  var need = FL_PUMP * pumpK(sh) * fk * dtc, lowz = 1e9;
  for (t = 0; t < fl.actN; t++) if (A[act[t]] > 1e-7) lowz = Math.min(lowz, (act[t] / NXY) | 0);
  for (var zz = lowz; zz < lowz + 3 && need > 0 && lowz < 1e9; zz++) for (t = 0; t < fl.actN && need > 0; t++) {
    i = act[t]; if (((i / NXY) | 0) !== zz || A[i] <= 0) continue; m = Math.min(A[i], need); A[i] -= m; need -= m; fl.pumped += m;
  }
  // 4. 收掉空的格；讀數：水量、重心（公尺，離船型中線：x 往船頭、y 往格 +y 那一舷為正）
  var w = 0, mx = 0, my = 0, keep = 0, cx = sh.T.cx, cy = sh.T.cy;
  for (t = 0; t < fl.actN; t++) {
    i = act[t];
    if (A[i] <= 1e-7) { A[i] = 0; fl.on[i] = 0; continue; }
    act[keep++] = i; w += A[i];
    mx += A[i] * (F.X0 + ((i % NX) + 0.5) * c - cx); my += A[i] * (F.Y0 + ((((i / NX) | 0) % NY) + 0.5) * c - cy);
  }
  fl.actN = keep;
  for (t = 0; t < J.n; t++) { w += J.vol[t]; mx += J.vol[t] * (J.p[t * 3] - cx); my += J.vol[t] * (J.p[t * 3 + 1] - cy); }
  fl.vol = w; fl.comX = w > 0 ? mx / w * S : 0; fl.comY = w > 0 ? my / w * S : 0; fl.gen++; fl.dqT += dtc;
}
/** 艙內的水 ⇒ 該多吃水多少（m）：浮力表上「少掉的重量 − 水」跟「少掉的重量」的差。 */
function floodSinkT(sh, fl) {
  if (sh.flBase === undefined) return 0;
  var W = fl.vol * RHO_W, a = liftFor(sh.T, sh.flBase), b = liftFor(sh.T, sh.flBase - W);
  return fl.sinkT = a === null || b === null ? 0 : Math.max(0, a - b);
}
/** 水的重心 ⇒ 橫傾、縱傾的目標（rad；正負跟公式一樣：水在格 +y 那一舷 ⇒ 正 ⇒ 那一舷（右舷）往下；水在船頭 ⇒ 負 ⇒ 船頭往下）。 */
function floodTilt(sh, fl) {
  var k = fl.keep || fl;                                              // 開始沉之後照那一刻的水（floodVis 留的 keep）⇒ 水照樣灌給人看，船怎麼斜跟以前一模一樣
  var W = k.vol * RHO_W, D = (sh.mass0 || shipT(sh)) + W, lim = sh.sinkingFinal ? 0.55 : 0.21;
  return [clamp(Math.atan(W * k.comY / (D * FL_GM)), -lim, lim), -clamp(Math.atan(W * k.comX / (D * FL_GML)), -0.07, 0.07)];
}

// ── 畫：艙內的水面（每一格水柱的頂，四個角照同一個世界高度擺 ⇒ 船傾斜時水面還是平的）；噴進來的粒子跟點精靈一起畫 ──
function flGL() {
  P.pool = VK.compile(gl,
    '#version 300 es\nlayout(location=0) in vec4 aP; layout(location=1) in float aZ0; uniform mat4 uModel,uVP; uniform float uMix; out vec3 vW; out float vF; void main(){ vec4 w=uModel*vec4(aP.xy,mix(aZ0,aP.z,uMix),1.0); vW=w.xyz; vF=aP.w; gl_Position=uVP*w; }\n',
    '#version 300 es\nprecision highp float; in vec3 vW; in float vF; uniform vec3 uEye,uSun,uFog,uSky; uniform float uFogD,uSeaT,uX; out vec4 o;\n' + SHADOW_GLSL +
    'void main(){ vec2 r=vec2(sin(vW.x*3.1+uSeaT*2.3)+sin(vW.z*4.3-uSeaT*1.7),cos(vW.z*2.7-uSeaT*1.9)+cos(vW.x*3.7+uSeaT*2.1))*0.03; vec3 n=normalize(vec3(r.x,1.0,r.y));\n' +
    ' vec3 v=normalize(uEye-vW); float fr=0.04+0.96*pow(1.0-max(dot(n,v),0.0),5.0), sk=shadowK(vW,n);\n' +
    ' vec3 c=mix(vec3(0.08,0.27,0.3)*(0.45+0.55*sk),uSky*0.75,clamp(fr*0.8+0.08,0.0,1.0))+vec3(1.0,0.92,0.75)*pow(max(dot(reflect(-v,n),uSun),0.0),90.0)*(0.25+sk);\n' +
    ' if(uX>0.5) c=mix(c,vec3(0.2,0.6,0.95),0.45);\n' +
    ' float fd=length(vW-uEye); o=vec4(mix(c,uFog,1.0-exp(-fd*uFogD)),uX>0.5?0.62:0.78); }\n');
  // 水幕（flFalls）：一道 ＝ 一片直立、繞船的鉛直軸轉向鏡頭的長條；aP 軸上那一點（格座標）、aQ ＝ (左右 ±1、0 上 1 下、長度 m、寬度 m 的上一格)、aW ＝ 這一格的寬度 m
  P.fall = VK.compile(gl,
    '#version 300 es\nlayout(location=0) in vec3 aP; layout(location=1) in vec4 aQ; layout(location=2) in float aW; uniform mat4 uModel,uVP; uniform vec3 uEye; uniform float uMix; out vec3 vW; out vec2 vT; out float vL;\n' +
    'void main(){ vec4 w=uModel*vec4(aP,1.0); vec3 ax=normalize(mat3(uModel)*vec3(0.0,0.0,1.0)), r=cross(ax,uEye-w.xyz); float l=length(r); r=l>1e-4?r/l:vec3(1.0,0.0,0.0);\n' +
    ' w.xyz+=r*aQ.x*0.5*mix(aQ.w,aW,uMix); vW=w.xyz; vT=aQ.xy; vL=aQ.z; gl_Position=uVP*w; }\n',
    '#version 300 es\nprecision highp float; in vec3 vW; in vec2 vT; in float vL; uniform vec3 uEye,uFog,uSky; uniform float uFogD,uSeaT,uX; out vec4 o;\n' +
    'void main(){ float u=vT.x, v=vT.y, k=floor((u+1.0)*3.5); float st=0.5+0.5*sin(v*vL*7.0-uSeaT*11.0+k*1.9)*sin(v*vL*2.3-uSeaT*5.0+k*0.7);\n' +   // 往下捲的條紋（每一條相位不同）
    ' vec3 c=mix(vec3(0.1,0.3,0.34),uSky*0.8+vec3(0.12),0.25+0.45*st); if(uX>0.5) c=mix(c,vec3(0.2,0.6,0.95),0.45);\n' +
    ' float a=(0.55+0.3*st)*(1.0-smoothstep(0.55,1.0,abs(u)))*smoothstep(0.0,0.06,v);\n' +
    ' float fd=length(vW-uEye); o=vec4(mix(c,uFog,1.0-exp(-fd*uFogD)),a); }\n');
}
// ── 水幕（TASK-0651；Tim 2026-10-16：「艙內進水 …… 是否可以連接正在往下流動的水(類似瀑布效果)」）──
//   模擬裡水往下一層流是直接搬水量（flTick 第 2 步）⇒ 畫面上上下兩池是斷開的兩片。這裡照 flTick 記的往下流量（fl.dq，只記不改）每一格畫一道：
//   · 開口：那一格擋水的那一層（開著的比例最小、而且 < FLF_OPEN）裡空著的格（艙口、打穿的洞）—— 中心、寬（快取 fl.fo，那一格被打壞就重找）；整層都開著（艙裡的大空間）⇒ 不畫（不是瀑布，是水整團往下）。
//   · 從開口往下沿著格子找：碰到有水面的那一格（這一次的水面高度）或實心的格（地板）就停 ⇒ 上下兩池接起來。
//   · 寬 ＝ FLF_W0 ＋ FLF_WK × √流量（m³／秒），夾在開口的寬以內；流量 < FLF_MIN 不畫（上一次有畫的 ⇒ 掉到一半才收，不在門檻上閃）；落差 < FLF_DROP 格不畫（底艙肋骨間那種淺的不算瀑布）。兩次重做之間寬度照 uMix 內插（跟水面同一個骨架）。
//   · 落點冒水花（flPushJets，點精靈）。純畫面：不碰 rnd()、不改水量；畫質設定 GFX.fall 關 ⇒ 不畫。
var FLF_MIN = 0.004, FLF_W0 = 0.25, FLF_WK = 1.0, FLF_OPEN = 0.85, FLF_DROP = 4;
function flFallAt(sh, fl, i) {
  var o = fl.fo.get(i); if (o !== undefined) return o;
  var F = fl.F, c = F.c, ix = i % F.NX, iy = ((i / F.NX) | 0) % F.NY, iz = (i / (F.NX * F.NY)) | 0, best = -1, bl = 2;
  for (var l = 0; l < c; l++) { var f = fl.ol[i * c + l]; if (f >= 0 && f < bl) { bl = f; best = l; } }
  o = null;
  if (best >= 0 && bl < FLF_OPEN && bl > 0) {
    var z = iz * c + best, n = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (var dx = 0; dx < c; dx++) {
      var x = F.X0 + ix * c + dx; if (x - F.X0 >= F.nxv) break;
      var k = z * F.nxv + x - F.X0; if (F.yP[k] < 0) continue;
      var a = Math.max(F.yM[k] + 1, F.Y0 + iy * c), b = Math.min(F.yP[k] - 1, F.Y0 + iy * c + c - 1);
      for (var y = a; y <= b; y++) if (!sh.grid.get(x, y, z)) { n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (n) o = { x: sx / n + 0.5, y: sy / n + 0.5, z: z + 1, w: (Math.max(x1 - x0, y1 - y0) + 1) * S };
  }
  fl.fo.set(i, o); return o;
}
function flFalls(sh, fl, me, TI, tops) {
  var F = fl.F, M = sh.M, L = me.falls || (me.falls = []), old = new Map(), t, q = 0;
  for (t = 0; t < L.length; t++) old.set(L[t].i, L[t].w);
  L.length = 0;
  var dt = fl.dqT; fl.dqT = 0;
  for (t = 0; t < fl.dqL.length; t++) {
    var i = fl.dqL[t], r = dt > 0 ? fl.dq[i] / dt : 0; fl.dq[i] = 0; fl.dqOn[i] = 0;
    if (!GFX.fall || r < FLF_MIN * (old.has(i) ? 0.5 : 1)) continue;
    var at = flFallAt(sh, fl, i); if (!at) continue;
    var X = Math.floor(at.x), Y = Math.floor(at.y), z1 = 0;
    for (var z = at.z - 2; z >= 0; z--) {                                 // 往下找落點：有水面的那一格（水面以下）或實心的格
      var k = flCell(F, at.x, at.y, z), ti = k >= 0 ? TI[k] : -1;
      if (ti >= 0) { var zs = (tops[ti + 1] - (M[1] * at.x + M[5] * at.y + M[13])) / M[9]; if (z <= zs) { z1 = Math.max(z, zs); break; } }
      if (sh.grid.get(X, Y, z)) { z1 = z + 1; break; }
    }
    if (at.z - z1 < FLF_DROP) continue;
    var w = clamp(FLF_W0 + FLF_WK * Math.sqrt(r), FLF_W0, Math.max(FLF_W0, at.w)), w0 = old.has(i) ? old.get(i) : w;
    L.push({ i: i, x: at.x, y: at.y, z0: at.z, z1: z1, w: w, w0: w0, r: r });
  }
  fl.dqL.length = 0;
  var B = me.fbuf && me.fbuf.length >= L.length * 48 ? me.fbuf : (me.fbuf = new Float32Array(Math.max(48 * 16, L.length * 96)));   // 每道 6 個頂點 × (3 ＋ 4 ＋ 1)
  for (t = 0; t < L.length; t++) {
    var f = L[t], len = (f.z0 - f.z1) * S, V = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
    for (var e = 0; e < 6; e++) { var s = V[e][0], v = V[e][1], o = q * 8; B[o] = f.x; B[o + 1] = f.y; B[o + 2] = v ? f.z1 : f.z0; B[o + 3] = s; B[o + 4] = v; B[o + 5] = len; B[o + 6] = f.w0; B[o + 7] = f.w; q++; }
  }
  if (!me.fvao) {
    me.fvao = gl.createVertexArray(); me.fvb = gl.createBuffer(); me.fcap = 0;
    gl.bindVertexArray(me.fvao); gl.bindBuffer(gl.ARRAY_BUFFER, me.fvb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
  }
  gl.bindVertexArray(me.fvao); gl.bindBuffer(gl.ARRAY_BUFFER, me.fvb);
  if (q * 8 > me.fcap) { me.fcap = B.length; gl.bufferData(gl.ARRAY_BUFFER, me.fcap * 4, gl.DYNAMIC_DRAW); }
  if (q) gl.bufferSubData(gl.ARRAY_BUFFER, 0, B, 0, q * 8);
  gl.bindVertexArray(null);
  me.fn = q;
}
/** 艙內水面的網格（格座標，每個頂點 [x, y, z, 裝了幾成, 上一格的 z]）：水格有算過、而且離上次重做過了 FL_MESH_MS 才重做（關鍵格）。
 *  Tim 2026-10-15：「水的網格更新(顯示變動)不用完全跟模擬同步」「水網格是否可以加入類似骨架的概念去微調(中間變化用內插)」「更新頻率可以更低」——
 *    模擬照算；畫面每 FL_MESH_MS 毫秒（真實時間）做一格關鍵格，兩格之間著色器照 uMix 從上一格的高度內插過去（⛔ 每次水格算完就重做 ⇒ 粗檔每 4 步、細檔每 2 步重建一次）。
 *    拓撲（哪幾格、每格切成哪幾片）跟上一格一樣 ⇒ 從畫面上現在的高度接著內插（水面慢慢升降）；不一樣（新的格進水、水退了）⇒ 直接換。
 *  代價：畫面的水比模擬晚最多一格；兩格之間船晃動，水面跟著船斜一下（網格在船的座標裡）。 */
var FL_MESH_MS = 500, FL_FLAT = 1;
function flMesh(sh, fl) {
  var F = fl.F, c = F.c, NX = F.NX, NY = F.NY, NXY = NX * NY, A = fl.A, cap = fl.cap, M = sh.M, Vc = Math.pow(c * S, 3), hc = c * S;
  var me = fl.mesh || (fl.mesh = { vao: gl.createVertexArray(), vb: gl.createBuffer(), buf: new Float32Array(6 * 5 * 512), old: new Float32Array(6 * 5 * 512), sig: [], n: 0, cap: 0, gen: -1, tw: -1e9 });
  var now = performance.now();
  if (me.gen === fl.gen || (me.n && now - me.tw < FL_MESH_MS)) return me;   // 還沒有網格（剛開始進水）⇒ 馬上做
  var mix0 = me.n ? flMix(me) : 1, oldN = me.n, oldSig = me.sig, tmp = me.old; me.old = me.buf; me.buf = tmp.length >= me.old.length ? tmp : new Float32Array(me.old.length); me.sig = [];   // 舊的那一格留著（接著內插用）
  me.tw = now;
  var h0 = M[1] * (F.X0 + 0.5 * c) + M[5] * (F.Y0 + 0.5 * c) + M[13], q = 0, t, i, u;
  // 每一格水面（上面那一格沒水的）的世界高度：水照層疊上去（flLevel）⇒ ⛔ 照「裝了幾成 × 格高」⇒ 只有底下一層空著的格（船殼彎進來、甲板梁）裝滿了水面畫在整格的頂，浮在半空
  var TI = me.ti && me.ti.length === F.N ? me.ti : (me.ti = new Int32Array(F.N).fill(-1)), tops = me.tops || (me.tops = []), S3 = S * S * S, op = fl.op;
  for (t = 0; t < tops.length; t += 2) TI[tops[t]] = -1; tops.length = 0;
  for (t = 0; t < fl.actN; t++) {
    i = fl.act[t]; if (!(cap[i] > 0.02) || A[i] < 0.02 * cap[i] * Vc) continue;
    u = i + NXY; if (u < F.N && cap[u] > 0.02 && A[u] >= 0.02 * cap[u] * Vc) continue;          // 上面那一格也有水 ⇒ 不是水面
    var ix = i % NX, iy = ((i / NX) | 0) % NY, iz = (i / NXY) | 0, W = A[i] / S3, hl = 0;
    for (var l = 0; l < c && W > 1e-6; l++) { var o = op[i * c + l]; if (o <= 0) continue; if (W >= o) { W -= o; hl = l + 1; } else { hl = l + W / o; W = 0; } }   // 空著 0 格的那一層（甲板）水過不去也不停在那裡 ⇒ 跳過
    if (W > 1e-6) hl = c;
    var hw = M[1] * (F.X0 + (ix + 0.5) * c) + M[5] * (F.Y0 + (iy + 0.5) * c) + M[9] * (iz * c + hl) + M[13];
    TI[i] = tops.length; tops.push(i, hw);
  }
  flFalls(sh, fl, me, TI, tops);                                          // 往下流的水幕（跟水面同一格重做）
  // 連成一池（Tim 2026-10-15：「角度有平滑 但是沒有接起來」）：左右前後相鄰（同一層或差一層）、水面差不到半格 ⇒ 同一池。
  //   同一池裡每個角只算一次（那個角周圍四格裡、這一池的水面平均）⇒ 相鄰兩格用的是同一個角 ⇒ 一定接得起來。
  //   ⛔ 以前每一格自己算四個角（周圍水柱裡、跟「這一格」差不到半格的平均）⇒ 同一個角兩邊各算各的、高度不一樣 ⇒ 每一片都斜得平順，片跟片之間裂開。
  var TN = tops.length / 2, par = new Int32Array(TN);
  for (t = 0; t < TN; t++) par[t] = t;
  function root(a) { while (par[a] !== a) a = par[a] = par[par[a]]; return a; }
  for (t = 0; t < TN; t++) {
    i = tops[t * 2]; var jx0 = i % NX, jy0 = ((i / NX) | 0) % NY;
    for (var nb = 0; nb < 2; nb++) {
      if (nb ? jy0 >= NY - 1 : jx0 >= NX - 1) continue;
      for (var dzn = -1; dzn <= 1; dzn++) {
        var jn = i + (nb ? NX : 1) + dzn * NXY; if (jn < 0 || jn >= F.N) continue;
        var tj = TI[jn]; if (tj < 0 || Math.abs(tops[tj + 1] - tops[t * 2 + 1]) >= 0.5 * hc) continue;
        var ra = root(t), rb = root(tj / 2); if (ra !== rb) par[ra] = rb;
      }
    }
  }
  var CS = new Map(), NC = (NX + 1) * (NY + 1);                           // 角 (ix, iy) × 池 ⇒ [水面加總, 幾格]
  for (t = 0; t < TN; t++) {
    i = tops[t * 2]; var r0 = root(t), qx = i % NX, qy = ((i / NX) | 0) % NY;
    for (var cc = 0; cc < 4; cc++) {
      var key = r0 * NC + (qy + (cc >> 1)) * (NX + 1) + qx + (cc & 1), e = CS.get(key);
      if (e) { e[0] += tops[t * 2 + 1]; e[1]++; } else CS.set(key, [tops[t * 2 + 1], 1]);
    }
  }
  var PS = new Float64Array(TN), PN = new Int32Array(TN);                 // 每一池的水面平均
  for (t = 0; t < TN; t++) { var rp = root(t); PS[rp] += tops[t * 2 + 1]; PN[rp]++; }
  function corner(r, ix, iy) { var e = CS.get(r * NC + iy * (NX + 1) + ix); return FL_FLAT * PS[r] / PN[r] + (1 - FL_FLAT) * e[0] / e[1]; }
  // 每格切成 KS × KS 小片（約 2 格見方；Tim 2026-10-15：「進水顯示是否能嘗試跟鄰近的水表面合併成柔和曲面」）：高度照四個角（已跟鄰格平均）雙線性內插 ⇒ 相鄰的水面連成平順的一片；
  //   每一小片照中心那一點在不在兩舷船殼之間（flType 的 yM／yP，那個高度那一欄）⇒ 不在就不畫（Tim：「船殼外部也能進水」—— ⛔ 整格畫一塊 ⇒ 靠船殼那幾格的正方形伸出船外，最多 c − 1 格）。
  var KS = Math.max(1, Math.round(c / 2)), sc = c / KS, nxv = F.nxv, YP = F.yP, YM = F.yM, ZT = F.zTop, TRI6 = [0, 1, 2, 0, 2, 3];
  function bil(H, u, v) { return (H[0] * (1 - u) + H[1] * u) * (1 - v) + (H[3] * (1 - u) + H[2] * u) * v; }
  var INS = new Uint8Array(KS * KS);
  /** 格座標 (x, y)、水面世界高度 hw 那一點在不在兩舷船殼之間（那個高度那一欄）。 */
  function flInside(x, y, hw) {
    var z = Math.floor(clamp((hw - (M[1] * x + M[5] * y + M[13])) / M[9], 0, ZT - 1)), X = Math.floor(x), Y = Math.floor(y), kk = z * nxv + X - F.X0;
    return X >= F.X0 && X - F.X0 < nxv && YP[kk] >= 0 && Y > YM[kk] && Y < YP[kk] ? 1 : 0;
  }
  for (t = 0; t < tops.length; t += 2) {
    i = tops[t]; var hw0 = tops[t + 1], jx = i % NX, jy = ((i / NX) | 0) % NY, jz = (i / NXY) | 0, f = Math.min(1, A[i] / (cap[i] * Vc));
    var x0 = F.X0 + jx * c, y0 = F.Y0 + jy * c, zl = jz * c - c, zh = jz * c + 2 * c, rt = root(t / 2);   // zl／zh：只防呆（同一池相鄰的差不到半格 ⇒ 角落在這一格上下一格以內；夾到了才會裂）
    var H = [corner(rt, jx, jy), corner(rt, jx + 1, jy), corner(rt, jx + 1, jy + 1), corner(rt, jx, jy + 1)];
    if ((q + 6 * KS * KS) * 5 > me.buf.length) { var nb = new Float32Array(Math.max(me.buf.length * 2, (q + 6 * KS * KS) * 10)); nb.set(me.buf); me.buf = nb; }
    var inn = 0; for (var a = 0; a < KS; a++) for (var b = 0; b < KS; b++) if ((INS[a * KS + b] = flInside(x0 + (a + 0.5) * sc, y0 + (b + 0.5) * sc, bil(H, (a + 0.5) / KS, (b + 0.5) / KS)))) inn++;
    if (!inn) continue;
    var G = inn === KS * KS ? Math.min(2, KS) : KS, gs = c / G;               // 整格都在船殼裡 ⇒ 2 × 2 就夠（⛔ 每格都細切 ⇒ 粗檔維吉尼亞號 4,226 → 99,070 個三角形，每次進水更新都重建）；碰到船殼的那幾格才細切、丟掉外面的
    for (a = 0; a < G; a++) for (b = 0; b < G; b++) {
      if (G === KS && !INS[a * KS + b]) continue;                             // 這一片在船殼外（或那一欄沒有船殼）
      var u0 = a / G, u1 = (a + 1) / G, v0 = b / G, v1 = (b + 1) / G; me.sig.push(i * 64 + G * 8 + a * 4 + b);   // sig：拓撲（哪一格、切幾片、第幾片）
      var cs = [[x0 + a * gs, y0 + b * gs, bil(H, u0, v0)], [x0 + (a + 1) * gs, y0 + b * gs, bil(H, u1, v0)], [x0 + (a + 1) * gs, y0 + (b + 1) * gs, bil(H, u1, v1)], [x0 + a * gs, y0 + (b + 1) * gs, bil(H, u0, v1)]];
      for (var e6 = 0; e6 < 6; e6++) {
        var p = cs[TRI6[e6]], z = clamp((p[2] - (M[1] * p[0] + M[5] * p[1] + M[13])) / M[9], zl, zh);   // 同一個世界高度 ⇒ 船傾斜時水面還是平的
        me.buf[q * 5] = p[0]; me.buf[q * 5 + 1] = p[1]; me.buf[q * 5 + 2] = z; me.buf[q * 5 + 3] = f; me.buf[q * 5 + 4] = z; q++;
      }
    }
  }
  // 骨架內插（逐片）：這一片上一格也有（同一格、同樣切法、同一片 ⇒ 6 個頂點的 x、y 跟順序都一樣）⇒ 起點 ＝ 它畫面上現在的高度（上一格的起點、終點照 mix0 內插）；
  //   上一格沒有（新進水的格、切法變了）⇒ 起點 ＝ 終點（直接出現）。⛔ 整份網格一樣才接 ⇒ 還在進水時每一格都有新的格進來 ⇒ 一次都接不上（量過 9 次重做 0 次）
  var OM = new Map(), O = me.old, Bf = me.buf, same = 0;
  for (var s = 0; s < oldSig.length; s++) OM.set(oldSig[s], s);
  for (var s2 = 0; s2 < me.sig.length; s2++) {
    var ko = OM.get(me.sig[s2]); if (ko === undefined || (ko + 1) * 6 > oldN) continue;
    same++;
    for (var v = 0; v < 6; v++) { var vo = (ko * 6 + v) * 5, vn = (s2 * 6 + v) * 5; Bf[vn + 4] = O[vo + 4] + (O[vo + 2] - O[vo + 4]) * mix0; }
  }
  gl.bindVertexArray(me.vao); gl.bindBuffer(gl.ARRAY_BUFFER, me.vb);
  if (q * 5 > me.cap) { me.cap = me.buf.length; gl.bufferData(gl.ARRAY_BUFFER, me.cap * 4, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16); }
  if (q) gl.bufferSubData(gl.ARRAY_BUFFER, 0, me.buf, 0, q * 5);
  gl.bindVertexArray(null);
  me.n = q; me.gen = fl.gen; me.same = same; me.quads = me.sig.length; return me;   // same：這一次接著內插的片數
}
/** 這一格內插到哪（0 ＝ 上一格的高度、1 ＝ 這一格的）。 */
function flMix(me) { return clamp((performance.now() - me.tw) / FL_MESH_MS, 0, 1); }
/** 畫艙內的水面（海與白沫之後；開始沉、斷了就不畫 —— 那時候海已經畫進船艙）。 */
function flDraw() {
  if (!P.pool || FL_HIDE) return;                                           // FL_HIDE：對照用（__game.flood(i, { hide: true })）
  var any = false, fs = [];
  SHIPS.forEach(function (sh) {
    var fl = sh.fl; if (!fl || !fl.actN || ((sh.broken || sh.sinkingFinal) && !fl.vis) || sh.sunk) return;   // 沉船的水照畫（floodVis）
    var me = flMesh(sh, fl); if (GFX.fall && me.fn) fs.push([sh, me]); if (!me.n) return;
    if (!any) { any = true; gl.useProgram(P.pool.prog); setCommon(P.pool); gl.uniform1f(P.pool.u.uX, FLX3 ? 1 : 0); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE); if (FLX3) gl.disable(gl.DEPTH_TEST); }   // 停格的「🔍 透視」開著 ⇒ 隔著船殼看得到（72_floodui.js）
    gl.uniformMatrix4fv(P.pool.u.uModel, false, sh.M); gl.uniform1f(P.pool.u.uMix, flMix(me)); gl.bindVertexArray(me.vao); gl.drawArrays(gl.TRIANGLES, 0, me.n);
  });
  if (fs.length) {                                                          // 水幕（flFalls）：跟水面同一套混色、不寫深度
    if (!any) { any = true; gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE); if (FLX3) gl.disable(gl.DEPTH_TEST); }
    gl.useProgram(P.fall.prog); setCommon(P.fall); gl.uniform1f(P.fall.u.uX, FLX3 ? 1 : 0);
    fs.forEach(function (e) { gl.uniformMatrix4fv(P.fall.u.uModel, false, e[0].M); gl.uniform1f(P.fall.u.uMix, flMix(e[1])); gl.bindVertexArray(e[1].fvao); gl.drawArrays(gl.TRIANGLES, 0, e[1].fn); });
  }
  if (any) { gl.depthMask(true); gl.enable(gl.DEPTH_TEST); }
}
/** 噴進來的粒子放進點精靈的緩衝（60_render.js 的 pushPt）。 */
function flPushJets(pushPt) {
  var b = 0.55 + 0.45 * WX.sun, col = [0.72 * b, 0.84 * b, 0.9 * b];
  SHIPS.forEach(function (sh) {
    var fl = sh.fl; if (!fl || ((sh.broken || sh.sinkingFinal) && !fl.vis) || sh.sunk) return;
    var J = fl.J, M = sh.M;
    for (var i = 0; i < J.n; i++) { var o = i * 3; pushPt(M4.pt(M, J.p[o], J.p[o + 1], J.p[o + 2]), 0.12 + 0.6 * Math.cbrt(J.vol[i]), col, 0.75, -1); }
    var FS = GFX.fall && !FL_HIDE && fl.mesh && fl.mesh.fn ? fl.mesh.falls : null;   // 水幕的落點：每一道每一格幾顆水花（只給畫面：Math.random，⛔ 不碰 rnd()／rndF()）
    if (FS) for (var k = 0; k < FS.length; k++) {
      var f = FS[k], n = 1 + Math.min(3, Math.round(f.r * 6)), hw = f.w / S * 0.5;
      for (var e = 0; e < n; e++) pushPt(M4.pt(M, f.x + (Math.random() - 0.5) * 2 * hw, f.y + (Math.random() - 0.5) * 2 * hw, f.z1 + Math.random() * 3), 0.05 + 0.08 * Math.random(), [0.85 * b, 0.92 * b, 0.95 * b], 0.45, -1);
    }
  });
}

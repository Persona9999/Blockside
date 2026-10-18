// ───────────────────────── 擱淺（TASK-0721） ─────────────────────────
// 有海圖（?map，08_seabed.js BED）才有；沒有 ⇒ 每一支第一行就回去（戰局逐位元組不變）。⛔ 不抽 rnd()。
// 船底：龍骨線上 7 點（船型的水線前後端往內 15 格之間；每一點是那一欄中線附近最低的實心格 ⇒ 船頭船尾翹起來的照實際）。
// 每一步（50_sim.js，碰撞之後）：每一點的海底比它高多少（pen）——
//   · 碰到 ⇒ 航速每秒扣 (0.5 ＋ 2.5 × pen)，往高處開再多扣一倍（往深處退出來比較容易）；壓進去超過 1.2 m ⇒ 沿坡往低處推（不會整艘開上岸）。
//   · 剛碰上、或還在動（> 0.8 m/s）每一秒 ⇒ 船底那一點附近打掉 硬度 × 速度² × 1.5 格（最多 40 格；船殼破了照常進水）：
//     珊瑚礁 1、礁石／岩壁 1.5、陸地 0.6、沙灘 0.4、沙底／沙洲 0.25 ⇒ 撞礁比擱在沙上重得多。
//   · 讀數：sh.grnd ＝ { t 最後一次撞的時刻, m 底質, pen 壓進去多深, lost 打掉幾格 }（離開海底 ⇒ null，lost 留在 sh.grndLost）。
var GRD_HARD = { 0: 0.3, 1: 0.25, 2: 1.0, 3: 0.25, 4: 1.5, 10: 0.4, 11: 0.6, 12: 1.5 };
var GRD_OFF = null;                                                      // 撞點附近的格（照離撞點的距離排；半徑 6 格）
function groundKeel(T) {
  if (T.keel) return T.keel;
  var G = T.base, out = [];
  for (var k = 0; k < 7; k++) {
    var x = Math.round(T.wl0 + 15 + (T.wl1 - T.wl0 - 30) * k / 6), z = T.zw;
    for (var zz = 0; zz < T.zw; zz++) { var hit = false; for (var y = Math.round(T.cy) - 3; y <= Math.round(T.cy) + 3 && !hit; y++) if (G.get(x, y, zz)) hit = true; if (hit) { z = zz; break; } }
    out.push([x, z]);
  }
  return (T.keel = out);
}
function groundStep(sh) {
  if (!BED || sh.sunk) return;
  var K = groundKeel(sh.T), best = 0, bp = null, low = Infinity;
  for (var k = 0; k < K.length; k++) {
    var p = M4.pt(sh.M, K[k][0], sh.T.cy, K[k][1]), pen = bedHgt(p[0], p[2]) - p[1];
    if (p[1] < low) low = p[1];
    if (pen > best) { best = pen; bp = p; }
  }
  sh.keelY = low;                                                        // 船底最低點（世界 y）：54_helm.js bedAvoid 照它算吃水
  if (!bp) { if (sh.grnd) sh.grnd = null; return; }
  var m = bedMat(bp[0], bp[2]), hard = GRD_HARD[m] !== undefined ? GRD_HARD[m] : 0.5, g = bedGrad(bp[0], bp[2]), gl = Math.hypot(g[0], g[1]);
  var F = fwd(sh.yaw), dir = sh.spd < 0 ? -1 : 1, up = gl > 1e-6 ? dir * (F[0] * g[0] + F[2] * g[1]) / gl : 0, v0 = Math.abs(sh.spd);
  sh.spd *= Math.max(0, 1 - DT * (0.5 + 2.5 * best) * (1 + Math.max(0, up)));
  if (best > 1.2 && gl > 1e-6) { var push = Math.min(0.5, (best - 1.2) * 0.25); sh.px -= g[0] / gl * push; sh.pz -= g[1] / gl * push; }
  if (!sh.grnd) {
    sh.grnd = { t: SIMT, m: m, pen: best, lost: 0 };
    note(sh, (m === BED_MAT.REEF ? '撞上珊瑚礁' : m === BED_MAT.ROCK || m === BED_MAT.CLIFF ? '撞上礁石' : m >= BED_MAT.BEACH ? '衝上岸' : '擱淺') + '（' + v0.toFixed(1) + ' m/s）', true);
    groundHit(sh, bp, v0, hard);
  } else if (v0 > 0.8 && SIMT - sh.grnd.t >= 1) { sh.grnd.t = SIMT; groundHit(sh, bp, v0, hard); }
  sh.grnd.pen = best; sh.grnd.m = m;
}
function groundHit(sh, p, v, hard) {
  var want = Math.min(40, Math.round(hard * v * v * 1.5)); if (want <= 0) return;
  if (!GRD_OFF) {
    GRD_OFF = [];
    for (var dz = 0; dz <= 6; dz++) for (var dy = -6; dy <= 6; dy++) for (var dx = -6; dx <= 6; dx++) if (dx * dx + dy * dy + dz * dz <= 36) GRD_OFF.push([dx, dy, dz, dx * dx + dy * dy + dz * dz]);
    GRD_OFF.sort(function (a, b) { return a[3] - b[3] || a[2] - b[2] || a[1] - b[1] || a[0] - b[0]; });
  }
  var L = M4.pt(sh.inv, p[0], p[1], p[2]), x0 = Math.round(L[0]), y0 = Math.round(L[1]), z0 = Math.round(L[2]), got = 0;
  for (var i = 0; i < GRD_OFF.length && got < want; i++) {
    var o = GRD_OFF[i], x = x0 + o[0], y = y0 + o[1], z = z0 + o[2];
    if (sh.grid.get(x, y, z) > 0 && removeVoxel(sh, x, y, z, true)) got++;
  }
  sh.grnd.lost += got; sh.grndLost = (sh.grndLost || 0) + got;
  if (got) { smoke(p, [0, 0.4, 0], 2, false); sfx('crack', p, 1.2); }
}

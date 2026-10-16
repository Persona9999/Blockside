// ───────────────────────── 平滑渲染（TASK-0616 第二段；Tim 2026-10-15：鐵甲艦光滑的裝甲）─────────────────────────
// 哪幾格：雕刻作品關聯的 meta render=smooth（巢狀照最近一層）⇒ .vxk 檔頭 render ⇒ T.smG（05_material.js）。
// 怎麼畫：
//   · VoxelKit 的方塊網格化跳過這幾格自己的面（grid.sm），但它們照樣擋住旁邊格子的面 ⇒ 一般格貼著平滑格的那一面不畫。
//   · 平滑面 ＝ surface nets：每一個「平滑格貼著空氣」的面換成四個頂點（那一面的四個格角），格角的位置往表面拉：
//       ① 那個格角周圍 8 格裡、有格與沒格的邊的中點平均（naive surface nets；落在格角 ±0.5 的小方塊裡）；
//       ② 再跟周圍 3×3×3 的格角（同一面的：實心的方向跟自己同側）平均一次 ⇒ 36° 的斜甲板不會一階一階；最後夾回格角 ±0.5。
//     周圍 8 格有一般格（不是平滑的實心）⇒ 頂點釘在格角上 ⇒ 跟方塊的角對齊、不露縫。
//     ①② 只看附近的格子 ⇒ 兩個區算到同一個格角，位置一定一樣（區的交界不裂）；法線也照附近的格子算（交界不斷光）。
//   · 一區 64³ 格一份網格（三角形＋索引，P.tri／P.dtri 畫，跟砲這些模型同一支著色器：陰影、剖面、點光源、水下的色都有）。
//     船型載入時建一份（船原本的樣子），開戰時每艘共用；被打掉格 ⇒ 附近 ±2 格碰得到的區各自重建（每一格畫面最多 SM_FRAME 區；快轉一次做完）。
// ⛔ 只改畫面：打中、進水、重量照舊看格子。斷開漂走的那一團照方塊畫（它的網格是新建的，沒有 sm）。
var SM_R = 64, SM_FRAME = 3;
var SM_C8 = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
var SM_E12 = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
var SM_UAX = [1, 2, 0], SM_VAX = [2, 0, 1];
function smRk(T, x, y, z) { var nx = Math.ceil(T.h.size[0] / SM_R), ny = Math.ceil(T.h.size[1] / SM_R); return (x >> 6) + nx * ((y >> 6) + ny * (z >> 6)); }
/** 船型 T：有平滑格 ⇒ 每個有平滑格的區建一份網格（T.smP：區 ⇒ 網格），T.smRK ＝ 那幾個區。 */
function smoothSetup(T) {
  T.smP = null; T.smRK = null; if (!T.smG) return;
  var G = T.smG, RK = T.smRK = new Set(), t0 = performance.now();
  for (var cz = 0; cz < G.nz; cz++) for (var cy = 0; cy < G.ny; cy++) for (var cx = 0; cx < G.nx; cx++) if (G.tab[G.ci(cx, cy, cz)]) RK.add(smRk(T, cx * 16, cy * 16, cz * 16));
  T.smP = new Map();
  RK.forEach(function (rk) { var m = smBuild(T, T.hullG || T.base, rk, null); if (m) T.smP.set(rk, m); });   // T.hullG：船殼（砲帶的裝甲另外建，24_armor.js armorMesh）
  T.ms.smooth = +(performance.now() - t0).toFixed(1);
}
/** 一艘船開戰：共用船型那一份（被打到的區才各自重建）。 */
function smoothShip(sh) { smShare(sh, sh.T.smP); }
/** o（船，或砲帶的裝甲 24_armor.js）共用 P 那幾區的網格（P ＝ null ⇒ 沒有平滑面）。 */
function smShare(o, P) {
  o.smR = null; o.smD = null; if (!P) return;
  o.smR = new Map(); o.smD = new Set();
  P.forEach(function (m, rk) { o.smR.set(rk, { vao: m.vao, vb: m.vb, ib: m.ib, n: m.n, own: false }); });
}
/** 打掉 (x, y, z)：±2 格碰得到的、有平滑格的區排進重建。 */
function smTouch(sh, x, y, z) {
  var T = sh.T; if (!sh.smD) return;
  for (var dz = -2; dz <= 2; dz += 4) for (var dy = -2; dy <= 2; dy += 4) for (var dx = -2; dx <= 2; dx += 4) {
    var rk = smRk(T, Math.max(0, x + dx), Math.max(0, y + dy), Math.max(0, z + dz)); if (T.smRK.has(rk)) sh.smD.add(rk);
  }
}
/** 重建最多 n 區（回：做了幾區）。 */
function smFlush(sh, n) {
  if (!sh.smD || !sh.smD.size) return 0;
  var done = 0, list = [];
  sh.smD.forEach(function (rk) { if (done++ < n) list.push(rk); });
  list.forEach(function (rk) {
    sh.smD.delete(rk);
    var old = sh.smR.get(rk), m = smBuild(sh.T, sh.grid, rk, old && old.own ? old : null, sh.pin);   // pin：裝甲貼著的船殼（24_armor.js；船沒有）
    if (m) sh.smR.set(rk, m); else { if (old && old.own) smFree(old); sh.smR.delete(rk); }
  });
  return list.length;
}
function smFree(m) { gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); gl.deleteVertexArray(m.vao); }
/** 畫這艘的平滑面（drawModels 裡、cutSet 之後）。M ＝ 世界矩陣（沒給 ＝ sh.M；砲帶的裝甲給它轉過的那個，24_armor.js armSmDraw）。 */
function smDraw(prog, sh, M) {
  if (!sh.smR || !sh.smR.size) return;
  gl.uniformMatrix4fv(prog.u.uModel, false, M || sh.M);
  if (prog.u.uGlow) gl.uniform1f(prog.u.uGlow, 0);
  sh.smR.forEach(function (m) { gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); });
}
/** 一區的網格（g ＝ 現在的格子；reuse ＝ 這艘自己的舊緩衝，有就覆寫）⇒ { vao, vb, ib, n, own } 或 null（這一區沒有平滑面）。
 *  pg（砲帶的裝甲，24_armor.js）：只用來釘格角的另一份格子（拆出來之前貼著的船殼）—— 碰到它的格角只釘高度（z：貼著甲板、不往上縮），水平照樣平滑；它自己不出面、不算實心。
 *  ⛔ 三個方向都釘 ⇒ 圓筒底那一圈是轉 0° 時的格角階梯 ⇒ 砲塔一轉，階梯跟著轉、跟甲板上的座圈對不上，一圈鋸齒（Tim 2026-10-16：「旋轉砲塔旋轉後 會導致底下甲板出現破圖」）。 */
function smBuild(T, g, rk, reuse, pg) {
  var SG = T.smG, nx = Math.ceil(T.h.size[0] / SM_R), ny = Math.ceil(T.h.size[1] / SM_R);
  var rx = rk % nx, ry = Math.floor(rk / nx) % ny, rz = Math.floor(rk / (nx * ny)), x0 = rx * SM_R, y0 = ry * SM_R, z0 = rz * SM_R;
  var SX = T.h.size[0] + 2, SXY = SX * (T.h.size[1] + 2);
  function key(X, Y, Z) { return X + SX * Y + SXY * Z; }
  var info = new Map();                                                  // 格角 ⇒ { o: 偏移, g: 實心的方向, pin, srf }
  function corner(X, Y, Z) {
    var k = key(X, Y, Z), r = info.get(k); if (r) return r;
    var occ = [], pin = false, pz = false, gx = 0, gy = 0, gz = 0, n = 0, i;
    for (i = 0; i < 8; i++) {
      var c = SM_C8[i], vx = X - 1 + c[0], vy = Y - 1 + c[1], vz = Z - 1 + c[2], s = g.get(vx, vy, vz) ? 1 : 0;
      occ.push(s); if (s) { if (!SG.get(vx, vy, vz)) pin = true; gx += c[0] - 0.5; gy += c[1] - 0.5; gz += c[2] - 0.5; n++; } else if (pg && pg.get(vx, vy, vz)) pz = true;
    }
    var ox = 0, oy = 0, oz = 0, ne = 0;
    for (i = 0; i < 12; i++) {
      var a = SM_E12[i][0], b = SM_E12[i][1]; if (occ[a] === occ[b]) continue;
      var A = SM_C8[a], B = SM_C8[b]; ox += (A[0] + B[0]) / 2 - 0.5; oy += (A[1] + B[1]) / 2 - 0.5; oz += (A[2] + B[2]) / 2 - 0.5; ne++;
    }
    r = { srf: n > 0 && n < 8, pin: pin, pz: !pin && pz, o: ne ? [ox / ne, oy / ne, oz / ne] : [0, 0, 0], g: [gx, gy, gz] };   // pz：只釘高度（碰到 pg 的格角）
    info.set(k, r); return r;
  }
  var vidx = new Map(), V = [], F = [], MG = T.matG, MM = T.matM, MR = T.matR;   // V：每個頂點 [X, Y, Z, r, g, b, 面數, 金屬度, 粗糙度]；F：每個面 4 個頂點編號
  function vert(X, Y, Z, col, mi) {
    var k = key(X, Y, Z), i = vidx.get(k);
    if (i === undefined) { i = V.length; vidx.set(k, i); V.push([X, Y, Z, 0, 0, 0, 0, 0, 0]); }
    var v = V[i]; v[3] += ((col >> 5) & 7) / 7; v[4] += ((col >> 2) & 7) / 7; v[5] += (col & 3) / 3; v[6]++;
    if (MM) { v[7] += MM[mi]; v[8] += MR[mi]; }
    return i;
  }
  var CORN = [[0, 0], [1, 0], [1, 1], [0, 1]], P = [0, 0, 0];
  for (var cz = z0 >> 4; cz < Math.min(SG.nz, (z0 + SM_R) >> 4); cz++) for (var cy = y0 >> 4; cy < Math.min(SG.ny, (y0 + SM_R) >> 4); cy++) for (var cx = x0 >> 4; cx < Math.min(SG.nx, (x0 + SM_R) >> 4); cx++) {
    var ch = SG.tab[SG.ci(cx, cy, cz)]; if (!ch) continue;
    for (var li = 0; li < 4096; li++) {
      if (!ch[li]) continue;
      var x = cx * 16 + (li & 15), y = cy * 16 + ((li >> 4) & 15), z = cz * 16 + (li >> 8), col = g.get(x, y, z); if (!col) continue;
      var mi = MG ? MG.get(x, y, z) : 0;                                  // 這一格的材質（05_material.js；沒寫 ⇒ 0 ＝ 全船預設）
      for (var ax = 0; ax < 3; ax++) for (var sg = -1; sg <= 1; sg += 2) {
        P[0] = x; P[1] = y; P[2] = z; P[ax] += sg;
        if (g.get(P[0], P[1], P[2])) continue;                            // 旁邊有格 ⇒ 不是表面
        var ua = SM_UAX[ax], va = SM_VAX[ax], q = [];
        for (var e = 0; e < 4; e++) {
          var cc = CORN[sg > 0 ? e : 3 - e], L = [x, y, z];
          L[ax] += sg > 0 ? 1 : 0; L[ua] += cc[0]; L[va] += cc[1];
          q.push(vert(L[0], L[1], L[2], col, mi));
        }
        F.push(q);
      }
    }
  }
  if (!F.length) { if (reuse) smFree(reuse); return null; }
  // 頂點位置與法線：① 自己的偏移 ② 周圍同一面的格角平均 ⇒ 夾回格角 ±0.5；釘住的 ＝ 格角本身
  var buf = new Float32Array(V.length * 11);
  for (var i = 0; i < V.length; i++) {
    var v = V[i], X = v[0], Y = v[1], Z = v[2], me = corner(X, Y, Z), px = X, py = Y, pz = Z, nxv = 0, nyv = 0, nzv = 0;
    var sx = 0, sy = 0, sz = 0, sn = 0;
    for (var dz = -1; dz <= 1; dz++) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var o = corner(X + dx, Y + dy, Z + dz); if (!o.srf) continue;
      if (o.g[0] * me.g[0] + o.g[1] * me.g[1] + o.g[2] * me.g[2] <= 0) continue;   // 另一面（薄板的背面）⇒ 不混
      nxv -= o.g[0]; nyv -= o.g[1]; nzv -= o.g[2];
      if (o.pin) { sx += dx; sy += dy; sz += dz; } else { sx += dx + o.o[0]; sy += dy + o.o[1]; sz += dz + (o.pz ? 0 : o.o[2]); }
      sn++;
    }
    if (!me.pin && sn) {
      var f = 0.5;
      px = X + clamp((1 - f) * me.o[0] + f * sx / sn, -0.5, 0.5); py = Y + clamp((1 - f) * me.o[1] + f * sy / sn, -0.5, 0.5); pz = me.pz ? Z : Z + clamp((1 - f) * me.o[2] + f * sz / sn, -0.5, 0.5);
    }
    var nl = Math.hypot(nxv, nyv, nzv) || 1;
    buf.set([px, py, pz, nxv / nl, nyv / nl, nzv / nl, v[3] / v[6], v[4] / v[6], v[5] / v[6], v[7] / v[6], v[6] && MM ? v[8] / v[6] : 0.5], i * 11);
  }
  var idx = new Uint32Array(F.length * 6);
  for (var j = 0; j < F.length; j++) { var Q = F[j]; idx.set([Q[0], Q[1], Q[2], Q[0], Q[2], Q[3]], j * 6); }
  var m = reuse || { vao: gl.createVertexArray(), vb: gl.createBuffer(), ib: gl.createBuffer(), n: 0, own: true };
  if (!reuse) {
    gl.bindVertexArray(m.vao); gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
    [[0, 0, 3], [1, 3, 3], [2, 6, 3], [3, 9, 2]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[2], gl.FLOAT, false, 44, a[1] * 4); });   // 3：金屬度、粗糙度（P.tri 的 aM；TASK-0627）
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.bindVertexArray(null);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(m.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW); gl.bindVertexArray(null);
  m.n = idx.length; m.own = true; m.verts = V.length; m.faces = F.length;
  return m;
}

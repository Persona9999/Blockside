// ───────────────────────── 海圖塊的畫面（TASK-0721；只給人看） ─────────────────────────
// 每塊一份網格（P.tri：位置、法線、顏色；照常吃陰影與霧），載進來（08_seabed.js 'bedChunk'）就排隊建、丟掉（'bedDrop'）就刪。
//   在用的那幾圈（中心 ± ring）每 8 m 一點、預載的那一圈每 16 m；四邊往下垂 40 m 的裙邊 ⇒ 粗細不同的兩塊接在一起也看不到縫。
//   水下的部分由海面的折射（07_gfx.js 折射：高）透出來，越深越被水的顏色蓋掉 ⇒ 礁、沙洲在淺水裡看得出顏色。
var BEDGL = {}, BEDGL_Q = [], BEDGL_ID = null, BED_FOG = 0.4;
var BED_COL = { 0: [0.33, 0.35, 0.31], 1: [0.74, 0.70, 0.52], 2: [0.46, 0.55, 0.40], 3: [0.86, 0.81, 0.62], 4: [0.40, 0.38, 0.35], 10: [0.84, 0.77, 0.57], 12: [0.43, 0.41, 0.38] };
function bedCol(h, m) {
  if (m === BED_MAT.LAND) {                                              // 陸地：低的綠、往上變褐、很高變灰
    var t = Math.min(1, Math.max(0, h / 450)), u = Math.min(1, Math.max(0, (h - 900) / 900));
    var c = [0.30 + 0.16 * t, 0.43 - 0.03 * t, 0.20 + 0.10 * t];
    return [c[0] + (0.52 - c[0]) * u, c[1] + (0.50 - c[1]) * u, c[2] + (0.47 - c[2]) * u];
  }
  return BED_COL[m] || BED_COL[0];
}
evOn('bedChunk', function (cx, cy) { BEDGL_Q.push(bedKey(cx, cy)); }, 0, true);
evOn('bedDrop', function (cx, cy) { var k = bedKey(cx, cy), g = BEDGL[k]; if (g) { gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.vb); gl.deleteBuffer(g.ib); delete BEDGL[k]; } }, 0, true);
function bedLod(C) { var R = BED_CFG.ring; return Math.abs(C.cx - BED.cx) <= R && Math.abs(C.cy - BED.cy) <= R ? 2 : 4; }
/** 一塊 ⇒ 網格（stride：每幾個取樣點取一個）。頂點：位置 3、法線 3、顏色 3（世界座標：原點 ＝ 開戰位置）。 */
function bedMesh(C, stride) {
  var n = C.n, m = (n - 1) / stride + 1, A = BED.A, G = BED.G, st = A.step, h = C.h, nv = m * m + 4 * m, V = new Float32Array(nv * 9), I = [];
  var ox = C.cx * G * st - BED.ax, oz = C.cy * G * st - BED.az;
  function put(k, i, j, dy) {
    var o = j * n + i, y = h[o] / 10, il = Math.max(0, i - stride), ir = Math.min(n - 1, i + stride), jl = Math.max(0, j - stride), jr = Math.min(n - 1, j + stride);
    var gx = (h[j * n + ir] - h[j * n + il]) / 10 / ((ir - il) * st), gz = (h[jr * n + i] - h[jl * n + i]) / 10 / ((jr - jl) * st), L = Math.sqrt(gx * gx + 1 + gz * gz), c = bedCol(y, C.mat[o]);
    var q = k * 9; V[q] = ox + i * st; V[q + 1] = y + dy; V[q + 2] = oz + j * st; V[q + 3] = -gx / L; V[q + 4] = 1 / L; V[q + 5] = -gz / L; V[q + 6] = c[0]; V[q + 7] = c[1]; V[q + 8] = c[2];
  }
  for (var j = 0; j < m; j++) for (var i = 0; i < m; i++) put(j * m + i, i * stride, j * stride, 0);
  for (j = 0; j < m - 1; j++) for (i = 0; i < m - 1; i++) { var a = j * m + i; I.push(a, a + m, a + 1, a + 1, a + m, a + m + 1); }
  // 裙邊：四條邊各 m 點，往下 40 m
  var edges = [[0, 0, 1, 0], [0, m - 1, 1, 0], [0, 0, 0, 1], [m - 1, 0, 0, 1]];
  edges.forEach(function (e, q) {
    var base = m * m + q * m;
    for (var t = 0; t < m; t++) { var ii = e[0] + e[2] * t, jj = e[1] + e[3] * t; put(base + t, ii * stride, jj * stride, -40); }
    for (t = 0; t < m - 1; t++) { var a0 = (e[1] + e[3] * t) * m + e[0] + e[2] * t, a1 = (e[1] + e[3] * (t + 1)) * m + e[0] + e[2] * (t + 1); I.push(a0, a1, base + t, a1, base + t + 1, base + t); }
  });
  return { V: V, I: new Uint32Array(I) };
}
function bedUpload(k, C, lod) {
  var M = bedMesh(C, lod), g = BEDGL[k] || { vao: gl.createVertexArray(), vb: gl.createBuffer(), ib: gl.createBuffer() };
  gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.bufferData(gl.ARRAY_BUFFER, M.V, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  gl.disableVertexAttribArray(3);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, M.I, gl.STATIC_DRAW); gl.bindVertexArray(null);
  g.n = M.I.length; g.lod = lod; g.cx = C.cx; g.cy = C.cy; BEDGL[k] = g;
}
/** 畫（60_render.js：帆之後、折射複製之前）。每格最多建 2 塊（新載的、粗細要換的）⇒ 換中心那一下不會卡一大格。 */
function bedDraw() {
  if (!BED || !BED.A) return;
  var built = 0;
  while (BEDGL_Q.length && built < 2) { var k = BEDGL_Q.shift(), C = BED.ch[k]; if (C) { bedUpload(k, C, bedLod(C)); built++; } }
  Object.keys(BEDGL).forEach(function (k2) { var g = BEDGL[k2], C2 = BED.ch[k2]; if (C2 && built < 2 && g.lod !== bedLod(C2)) { bedUpload(k2, C2, bedLod(C2)); built++; } });
  gl.useProgram(P.tri.prog); setCommon(P.tri); cutSet(P.tri, null);
  gl.uniform1f(P.tri.u.uFogD, WX.fog * BED_FOG);                         // 霧淡一點：島要從幾公里外就看得到（船照原本的霧）
  gl.uniform1f(P.tri.u.uLit, 1); if (P.tri.u.uGlow) gl.uniform1f(P.tri.u.uGlow, 0);
  gl.uniformMatrix4fv(P.tri.u.uModel, false, BEDGL_ID || (BEDGL_ID = M4.ident()));
  gl.vertexAttrib2f(3, 0, 0);                                            // 金屬度（P.tri aM）：地形不是金屬
  Object.keys(BEDGL).forEach(function (k3) { var g = BEDGL[k3]; gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_INT, 0); });
  gl.bindVertexArray(null);
}

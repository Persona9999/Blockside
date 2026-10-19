// ───────────────────────── 海圖塊的畫面（TASK-0721；只給人看） ─────────────────────────
// 每塊一份網格（P.tri：位置、法線、顏色；照常吃陰影與霧），載進來（08_seabed.js 'bedChunk'）就排隊建、丟掉（'bedDrop'）就刪。
//   在用的那幾圈（中心 ± ring）每 8 m 一點、預載的那一圈每 16 m；四邊往下垂 40 m 的裙邊 ⇒ 粗細不同的兩塊接在一起也看不到縫。
//   水下的部分由海面的折射（07_gfx.js 折射：高）透出來，越深越被水的顏色蓋掉 ⇒ 礁、沙洲在淺水裡看得出顏色。
// 遠景（BEDFAR）：載入的 5×5 以外也要看得到島 ⇒ 整個海域有檔的塊每塊照 32 m 抽一份粗網格（bedMesh stride 8），開戰後在背景一塊一塊讀
//   （08_seabed.js bedPeek：⛔ 不放進模擬查的那一份；離開戰位置近的先讀），網格建好就丟掉解碼的資料。那一塊有細的（BEDGL）就畫細的、沒有才畫粗的 ⇒ 不疊在一起。
//   多遠看得到：鏡頭的遠裁切面 5 km（03_camera.js）、地形的霧淡成 0.4 倍（BED_FOG）⇒ 晴天 4 km 外還剩一成的輪廓。
// 岸邊的白沫（BEDFOAM）：5×5 那幾塊的高度照 8 m 一格放進一張貼圖（R16F、雙線性），海的著色器（01_gl.js）照「海面 − 海底」< 2 m 畫一圈白沫。只給人看。
var BEDGL = {}, BEDGL_Q = [], BEDGL_ID = null, BED_FOG = 0.4, BED_FAR_ST = 8;
var BEDFAR = { g: {}, todo: null, busy: false, n: 0, bytes: 0, ms: 0 };
var BEDDRAW = { n: 0, cull: 0, tris: 0 };                                // 上一格畫了幾塊、剔掉幾塊、幾個三角形（__game.bed）
var BEDFOAM = { tex: null, dirty: true, cx: null, cy: null, ox: 0, oz: 0, sp: 8, N: 0, ms: 0, builds: 0 };
var BED_COL = { 0: [0.33, 0.35, 0.31], 1: [0.74, 0.70, 0.52], 2: [0.46, 0.55, 0.40], 3: [0.86, 0.81, 0.62], 4: [0.40, 0.38, 0.35], 10: [0.84, 0.77, 0.57], 12: [0.43, 0.41, 0.38] };
function bedCol(h, m) {
  if (m === BED_MAT.LAND) {                                              // 陸地：低的綠、往上變褐、很高變灰
    var t = Math.min(1, Math.max(0, h / 450)), u = Math.min(1, Math.max(0, (h - 900) / 900));
    var c = [0.30 + 0.16 * t, 0.43 - 0.03 * t, 0.20 + 0.10 * t];
    return [c[0] + (0.52 - c[0]) * u, c[1] + (0.50 - c[1]) * u, c[2] + (0.47 - c[2]) * u];
  }
  return BED_COL[m] || BED_COL[0];
}
evOn('bedChunk', function (cx, cy) { BEDGL_Q.push(bedKey(cx, cy)); BEDFOAM.dirty = true; }, 0, true);
evOn('bedDrop', function (cx, cy) { var k = bedKey(cx, cy), g = BEDGL[k]; BEDFOAM.dirty = true; if (g) { gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.vb); gl.deleteBuffer(g.ib); delete BEDGL[k]; } }, 0, true);
function bedLod(C) { var R = BED_CFG.ring; return Math.abs(C.cx - BED.cx) <= R && Math.abs(C.cy - BED.cy) <= R ? 2 : 4; }
/** 一塊 ⇒ 網格（stride：每幾個取樣點取一個）。頂點：位置 3、法線 3、顏色 3（世界座標：原點 ＝ 開戰位置）。
 *  點距照這一塊自己的 C.step（遠景塊可以是粗的：@host 的 peek 回 32 m 一點的 33×33，src/MAP_CHUNK.md §5）；塊的原點照海域的 A.chunk。 */
function bedMesh(C, stride) {
  var n = C.n, m = (n - 1) / stride + 1, A = BED.A, st = C.step, h = C.h, nv = m * m + 4 * m, V = new Float32Array(nv * 9), I = [];
  var ox = C.cx * A.chunk - BED.ax, oz = C.cy * A.chunk - BED.az;
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
  var g = bedGpu(bedMesh(C, lod), BEDGL[k]);
  g.lod = lod; g.cx = C.cx; g.cy = C.cy; g.bb = bedBox(C); BEDGL[k] = g;
}
/** 一塊的外框（世界座標；高度含往下垂 40 m 的裙邊）。 */
function bedBox(C) { var x0 = C.cx * BED.A.chunk - BED.ax, z0 = C.cy * BED.A.chunk - BED.az; return [x0, C.min - 40, z0, x0 + BED.A.chunk, C.max, z0 + BED.A.chunk]; }
/** 視錐的六個面（從 VP 抽：每個面 a·x + b·y + c·z + d ≥ 0 在裡面）。 */
function bedPlanes(m) {
  var P = [], r = function (i) { return [m[i], m[4 + i], m[8 + i], m[12 + i]]; }, w = r(3);
  [0, 1, 2].forEach(function (i) { var a = r(i); P.push([w[0] + a[0], w[1] + a[1], w[2] + a[2], w[3] + a[3]], [w[0] - a[0], w[1] - a[1], w[2] - a[2], w[3] - a[3]]); });
  return P;
}
/** 外框整個在某一面外面 ⇒ 看不到（保守：只剔除確定看不到的）。 */
function bedSeen(P, b) {
  for (var i = 0; i < 6; i++) { var p = P[i]; if (p[0] * (p[0] > 0 ? b[3] : b[0]) + p[1] * (p[1] > 0 ? b[4] : b[1]) + p[2] * (p[2] > 0 ? b[5] : b[2]) + p[3] < 0) return false; }
  return true;
}
/** 網格 ⇒ GPU（g 給了就重用那一組 VAO 與緩衝區）。 */
function bedGpu(M, g) {
  g = g || { vao: gl.createVertexArray(), vb: gl.createBuffer(), ib: gl.createBuffer() };
  gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.bufferData(gl.ARRAY_BUFFER, M.V, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  gl.disableVertexAttribArray(3);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, M.I, gl.STATIC_DRAW); gl.bindVertexArray(null);
  g.n = M.I.length; return g;
}
/** 遠景：每格最多做一塊 —— 那一塊現在載著（BED.ch）就直接抽，沒有就讀檔（bedPeek，同時只讀一塊）。 */
function bedFarStep() {
  var F = BEDFAR;
  if (!F.todo) {                                                         // 第一次：有檔的塊，離開戰位置近的先
    var A = BED.A, sx = BED.ax / A.chunk - 0.5, sy = BED.az / A.chunk - 0.5;
    F.todo = A.chunks.filter(function (c) { return c[2]; }).sort(function (a, b) { return Math.hypot(a[0] - sx, a[1] - sy) - Math.hypot(b[0] - sx, b[1] - sy) || a[1] - b[1] || a[0] - b[0]; });
  }
  if (F.busy || !F.todo.length) return;
  var c = F.todo.shift(), k = bedKey(c[0], c[1]);
  if (BED.ch[k]) { bedFarPut(k, BED.ch[k], 0); return; }
  F.busy = true;
  bedPeek(c[0], c[1]).then(function (b64) { F.busy = false; var t0 = performance.now(), C = bedDecode(b64); bedFarPut(k, C, performance.now() - t0); },
    function (e) { F.busy = false; console.warn('遠景：' + e.message); });
}
function bedFarPut(k, C, ms) {
  if (!BED || !BED.A || BEDFAR.g[k]) return;
  var t0 = performance.now(), M = bedMesh(C, Math.max(1, Math.round(BED_FAR_ST * BED.A.step / C.step))), g = bedGpu(M, null);   // 32 m 一點：細的塊（4 m）每 8 點取一點，粗的（32 m）每點都取
  g.bb = bedBox(C); BEDFAR.g[k] = g; treeFar(k, C);                    // treeFar：遠景的樹（貼圖；63_trees.js） BEDFAR.n++; BEDFAR.bytes += M.V.byteLength + M.I.byteLength; BEDFAR.ms += ms + performance.now() - t0;
}
/** 白沫的高度貼圖：中心 ± (ring＋prefetch) 那幾塊，每 2 個取樣點（8 m）一格；沒載的、深海塊 ⇒ deep。換中心、載進來、丟掉之後重建。 */
function bedFoamTex() {
  var Fm = BEDFOAM, A = BED.A;
  if (BED.cx === null || !Fm.dirty && Fm.cx === BED.cx && Fm.cy === BED.cy) return;
  var t0 = performance.now(), R = BED_CFG.ring + BED_CFG.prefetch, n = A.n, sk = 2, per = (n - 1) / sk, W = (2 * R + 1) * per, D = new Float32Array(W * W).fill(A.deep);
  for (var cj = 0; cj <= 2 * R; cj++) for (var ci = 0; ci <= 2 * R; ci++) {
    var C = BED.ch[bedKey(BED.cx - R + ci, BED.cy - R + cj)]; if (!C) continue;
    for (var j = 0; j < per; j++) { var r = (cj * per + j) * W + ci * per, s = j * sk * n; for (var i = 0; i < per; i++) D[r + i] = C.h[s + i * sk] / 10; }
  }
  if (!Fm.tex) { Fm.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, Fm.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
  gl.bindTexture(gl.TEXTURE_2D, Fm.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, W, W, 0, gl.RED, gl.FLOAT, D); gl.bindTexture(gl.TEXTURE_2D, null);
  Fm.dirty = false; Fm.cx = BED.cx; Fm.cy = BED.cy; Fm.N = W; Fm.sp = A.step * sk; Fm.ox = (BED.cx - R) * A.chunk - BED.ax; Fm.oz = (BED.cy - R) * A.chunk - BED.az;
  Fm.ms = performance.now() - t0; Fm.builds++;
}
/** 海的著色器（60_render.js 畫海那一段）：白沫的高度貼圖接第 10 號；沒有海圖 ⇒ uBedOn 0（整段跳過）。 */
function bedWaterU(u) {
  var on = !!(BED && BED.A && BEDFOAM.tex);
  gl.uniform1f(u.uBedOn, on ? 1 : 0);
  gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D, on ? BEDFOAM.tex : DUMMY); gl.uniform1i(u.uBedT, 10); gl.activeTexture(gl.TEXTURE0);
  if (on) gl.uniform4f(u.uBedR, BEDFOAM.ox, BEDFOAM.oz, BEDFOAM.sp, BEDFOAM.N);
}
// 遠海（轉場拉高時；Tim 2026-10-19：「海面問題可以額外貼一張圖嗎」「拉進後就隱藏這張海面色的填充圖」）：
//   海面網格只有 4 km 半徑、深海塊沒有網格 ⇒ 從 10 km 往下看是中間一個圓、外面空的。⇒ 海之後畫一大片平面（鏡頭正下方 ±40 km、海面下 0.5 m），
//   顏色照海從高處看的顏色＋同一套霧：網格以內海面在它前面（照常畫，看得到海底），網格以外它蓋掉水下的東西（海底、空的），陸地照樣在它上面。
//   只在鏡頭高於 BEDSEA_H（3 km）畫：3 km 以下畫面四角都在網格裡（16:9 ⇒ 0.99 × 高度），本來就被蓋住 ⇒ 關掉不會跳。平常的海戰鏡頭不會到這麼高。
var BEDSEA = { prog: null, vao: null, u: null, col: [0.11, 0.25, 0.31] }, BEDSEA_H = 3000;
function bedSeaDraw() {
  if (!BED || !BED.A || CAM.eye[1] < BEDSEA_H) return;
  var S = BEDSEA;
  if (!S.prog) {
    S.prog = VK.compile(gl,
      '#version 300 es\nlayout(location=0) in vec2 aP; uniform mat4 uVP; uniform vec3 uEye; out vec3 vW; void main(){ vW=vec3(uEye.x+aP.x*40000.0,-0.5,uEye.z+aP.y*40000.0); gl_Position=uVP*vec4(vW,1.0); }\n',
      '#version 300 es\nprecision highp float; in vec3 vW; uniform vec3 uEye,uFog,uCol; uniform float uFogD; out vec4 o; void main(){ float fd=length(vW-uEye); o=vec4(mix(uCol,uFog,1.0-exp(-fd*uFogD)),1.0); }\n');
    S.vao = gl.createVertexArray(); var vb = gl.createBuffer();
    gl.bindVertexArray(S.vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
  }
  var cf = gl.isEnabled(gl.CULL_FACE); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
  gl.useProgram(S.prog.prog); setCommon(S.prog); gl.uniform3fv(S.prog.u.uCol, S.col);
  gl.bindVertexArray(S.vao); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.bindVertexArray(null);
  if (cf) gl.enable(gl.CULL_FACE);
}
/** 畫（60_render.js：帆之後、折射複製之前）。每格最多建 2 塊（新載的、粗細要換的）⇒ 換中心那一下不會卡一大格。 */
function bedDraw() {
  if (!BED || !BED.A) return;
  var built = 0;
  while (BEDGL_Q.length && built < 2) { var k = BEDGL_Q.shift(), C = BED.ch[k]; if (C) { bedUpload(k, C, bedLod(C)); built++; } }
  Object.keys(BEDGL).forEach(function (k2) { var g = BEDGL[k2], C2 = BED.ch[k2]; if (C2 && built < 2 && g.lod !== bedLod(C2)) { bedUpload(k2, C2, bedLod(C2)); built++; } });
  if (!built) bedFarStep();                                              // 遠景：這一格沒在建細的才做
  bedFoamTex();
  gl.useProgram(P.tri.prog); setCommon(P.tri); cutSet(P.tri, null);
  gl.uniform1f(P.tri.u.uFogD, WX.fog * BED_FOG * CAM.fogK);                         // 霧淡一點：島要從幾公里外就看得到（船照原本的霧）
  gl.uniform1f(P.tri.u.uLit, 1); if (P.tri.u.uGlow) gl.uniform1f(P.tri.u.uGlow, 0);
  gl.uniformMatrix4fv(P.tri.u.uModel, false, BEDGL_ID || (BEDGL_ID = M4.ident()));
  gl.vertexAttrib2f(3, 0, 0);                                            // 金屬度（P.tri aM）：地形不是金屬
  var PL = bedPlanes(PASS.vp || CAM.vp), D = BEDDRAW; D.n = D.cull = D.tris = 0;   // 視錐外的塊不畫（鏡頭後面、旁邊的島；BEDDRAW ⇒ __game.bed().draw）
  function one(g) { if (g.bb && !bedSeen(PL, g.bb)) { D.cull++; return; } D.n++; D.tris += g.n / 3; gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_INT, 0); }
  Object.keys(BEDGL).forEach(function (k3) { one(BEDGL[k3]); });
  Object.keys(BEDFAR.g).forEach(function (k4) { if (!BEDGL[k4]) one(BEDFAR.g[k4]); });   // 遠景：細的沒有的那幾塊
  gl.bindVertexArray(null);
}

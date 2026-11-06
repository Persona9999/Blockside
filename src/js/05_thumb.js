// Renderer adapted from zenith, Blockside 17b958d (TASK-1130); same projection and lighting as Sharkside.
/** 船型縮圖（方舷放置的船塢、艦隊；TASK-1130）：從左舷偏船頭、斜上方看過去的正交投影 —— 每一型同一個角度、同一盞光（左上），透明底、精緻像素風（alpha 只有 0／255、外緣一圈深色輪廓）。
 *  船殼的格：朝鏡頭的三個面（左舷、船頭、頂）至少露一面的才畫，每格點一個小方塊（z 緩衝照格中心），亮度照露出來那幾面的法線對光；模型、帆照 topImg 的網格（旗不算），三角形照像素中心填。
 *  每一型各自縮到畫布裡（不是同一個比例尺：小艇才認得出來）。先畫兩倍大、四點合成一點（兩點以上有東西才算有 ⇒ 沒有半透明毛邊）、再描輪廓。原始格子（開戰後打掉的不跟）。
 *  o：w、h 畫布（預設 256×160）、pad 四邊留白（預設 8）、az 鏡頭從正左舷往船頭偏幾度（預設 30）、el 仰角（預設 24）。回 canvas；沒有東西 ⇒ null。 */
var THUMB_V = 1;                                                          // 畫法的版本：改了角度、光、合成規則就加一 ⇒ 外殼記的縮圖來源跟著變（Sharkside build.py --check 抓得到舊了）
function thumbImg(T, o) {
  o = o || {};
  var OW = o.w || 256, OH = o.h || 160, PAD = o.pad === undefined ? 8 : o.pad, SS = 2, W = OW * SS, H = OH * SS, G = T.base, i, j, k;
  var az = (o.az === undefined ? 30 : o.az) * Math.PI / 180, el = (o.el === undefined ? 24 : o.el) * Math.PI / 180;
  var E = [Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)];   // 往鏡頭（左舷 −y、船頭 +x、上 +z）
  var R = [Math.cos(az), Math.sin(az), 0], U = [E[1] * R[2] - E[2] * R[1], E[2] * R[0] - E[0] * R[2], E[0] * R[1] - E[1] * R[0]];   // 畫面往右、往上（U ＝ E × R）
  var Lt = norm([-0.5 * R[0] + 0.75 * U[0] + 0.45 * E[0], -0.5 * R[1] + 0.75 * U[1] + 0.45 * E[1], -0.5 * R[2] + 0.75 * U[2] + 0.45 * E[2]]);   // 光：畫面左上、偏鏡頭這一側
  function lit(nx, ny, nz) { var l = Math.hypot(nx, ny, nz) || 1; return 0.5 + 0.55 * Math.max(0, (nx * Lt[0] + ny * Lt[1] + nz * Lt[2]) / l); }
  var vu = [], vv = [], vd = [], vc = [], u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  function grow(u, v) { if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
  G.each(function (x, y, z, c) {                                          // 格：露在鏡頭這一側的面（左舷 −y、船頭 +x、頂 +z）
    var p = !G.get(x, y - 1, z), b = !G.get(x + 1, y, z), t = !G.get(x, y, z + 1);
    if (!p && !b && !t) return;
    var X = x + 0.5, Y = y + 0.5, Z = z + 0.5, u = X * R[0] + Y * R[1], v = -(X * U[0] + Y * U[1] + Z * U[2]), s = lit(b ? 1 : 0, p ? -1 : 0, t ? 1 : 0);
    vu.push(u); vv.push(v); vd.push(X * E[0] + Y * E[1] + Z * E[2]);
    vc.push((Math.min(255, ((c >> 5) & 7) * 255 / 7 * s) << 16) | (Math.min(255, ((c >> 2) & 7) * 255 / 7 * s) << 8) | Math.min(255, (c & 3) * 255 / 3 * s));
    grow(u - 0.7, v - 0.7); grow(u + 0.7, v + 0.7);
  });
  var L = [];                                                             // 網格：[頂點, 三角形, 每個三角形的顏色 或 null, 單色, 位移]（同 topImg）
  (T.rig.models || []).forEach(function (m) { var M = T.rig.meshes && T.rig.meshes[m.mesh]; if (M && M.verts && M.tris) L.push([M.verts, M.tris, M.tmat ? function (t) { return M.mats[M.tmat[t]] || [0.5, 0.5, 0.5]; } : null, [0.5, 0.5, 0.5], m.origin || [0, 0, 0]]); });
  (T.rig.sails || []).forEach(function (sl) { if (!isFlag(sl) && sl.verts && sl.tris) L.push([sl.verts, sl.tris, null, sl.color || [0.95, 0.92, 0.85], [0, 0, 0]]); });   // 帆的預設色同 sideImg
  L.forEach(function (q) { var V = q[0], f = q[4]; for (i = 0; i < V.length; i += 3) { var X = V[i] + f[0], Y = V[i + 1] + f[1], Z = V[i + 2] + f[2]; grow(X * R[0] + Y * R[1], -(X * U[0] + Y * U[1] + Z * U[2])); } });
  if (u1 < u0) return null;
  var K = Math.min((W - 2 * PAD * SS) / (u1 - u0), (H - 2 * PAD * SS) / (v1 - v0)), ou = (W - (u1 - u0) * K) / 2 - u0 * K, ov = (H - (v1 - v0) * K) / 2 - v0 * K;   // 一格幾點、置中
  var zb = new Float32Array(W * H).fill(-1e9), px = new Uint32Array(W * H), has = new Uint8Array(W * H);
  function put(c, r, d, rgb) { if (c < 0 || r < 0 || c >= W || r >= H) return; var p = r * W + c; if (d <= zb[p]) return; zb[p] = d; px[p] = rgb; has[p] = 1; }
  var sz = Math.max(1, Math.ceil(K * 1.35)), hs = sz / 2;                  // 一格投影出來大約 1.35 格寬
  for (i = 0; i < vu.length; i++) {
    var c0 = Math.round(vu[i] * K + ou - hs), r0 = Math.round(vv[i] * K + ov - hs);
    for (j = 0; j < sz; j++) for (k = 0; k < sz; k++) put(c0 + k, r0 + j, vd[i], vc[i]);
  }
  L.forEach(function (q) {
    var V = q[0], I = q[1], col = q[2], f = q[4];
    function P(n) { var X = V[n] + f[0], Y = V[n + 1] + f[1], Z = V[n + 2] + f[2]; return [(X * R[0] + Y * R[1]) * K + ou, -(X * U[0] + Y * U[1] + Z * U[2]) * K + ov, X * E[0] + Y * E[1] + Z * E[2], X, Y, Z]; }
    for (var t = 0; t < I.length; t += 3) {
      var A = P(I[t] * 3), B = P(I[t + 1] * 3), D = P(I[t + 2] * 3), rgb = col ? col(t / 3) : q[3];
      var s = 0.5 + 0.55 * Math.abs(norm([(B[4] - A[4]) * (D[5] - A[5]) - (B[5] - A[5]) * (D[4] - A[4]), (B[5] - A[5]) * (D[3] - A[3]) - (B[3] - A[3]) * (D[5] - A[5]), (B[3] - A[3]) * (D[4] - A[4]) - (B[4] - A[4]) * (D[3] - A[3])]).reduce(function (a2, n2, m2) { return a2 + n2 * Lt[m2]; }, 0));   // 網格兩面都算（帆、帆桁可能只有一面）
      var cc = (Math.min(255, rgb[0] * 255 * s) << 16) | (Math.min(255, rgb[1] * 255 * s) << 8) | Math.min(255, rgb[2] * 255 * s);
      var area = (B[0] - A[0]) * (D[1] - A[1]) - (D[0] - A[0]) * (B[1] - A[1]);
      if (Math.abs(area) < 0.5) {                                          // 比一點還小（或側立）⇒ 頂點、邊的中點點上去（同 topImg）
        [A, B, D].forEach(function (Q, m2, S3) { var N = S3[(m2 + 1) % 3]; put(Math.floor(Q[0]), Math.floor(Q[1]), Q[2], cc); put(Math.floor((Q[0] + N[0]) / 2), Math.floor((Q[1] + N[1]) / 2), (Q[2] + N[2]) / 2, cc); });
        continue;
      }
      var cA = Math.max(0, Math.floor(Math.min(A[0], B[0], D[0]))), cB = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], D[0])));
      var rA = Math.max(0, Math.floor(Math.min(A[1], B[1], D[1]))), rB = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], D[1])));
      for (var r = rA; r <= rB; r++) for (var c = cA; c <= cB; c++) {
        var X0 = c + 0.5, Y0 = r + 0.5;
        var w0 = ((B[0] - X0) * (D[1] - Y0) - (D[0] - X0) * (B[1] - Y0)) / area, w1 = ((D[0] - X0) * (A[1] - Y0) - (A[0] - X0) * (D[1] - Y0)) / area, w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        put(c, r, w0 * A[2] + w1 * B[2] + w2 * D[2], cc);
      }
    }
  });
  var cv = document.createElement('canvas'); cv.width = OW; cv.height = OH;
  var g = cv.getContext('2d'), im = g.createImageData(OW, OH), dd = im.data, on = new Uint8Array(OW * OH);
  for (j = 0; j < OH; j++) for (i = 0; i < OW; i++) {                    // 四點合成一點：兩點以上有東西 ⇒ 有，顏色取有東西那幾點的平均
    var n = 0, sr = 0, sg = 0, sb = 0;
    for (k = 0; k < 4; k++) { var p = (j * SS + (k >> 1)) * W + i * SS + (k & 1); if (has[p]) { n++; sr += px[p] >> 16; sg += (px[p] >> 8) & 255; sb += px[p] & 255; } }
    if (n < 2) continue;
    var o4 = (j * OW + i) * 4; dd[o4] = sr / n; dd[o4 + 1] = sg / n; dd[o4 + 2] = sb / n; dd[o4 + 3] = 255; on[j * OW + i] = 1;
  }
  for (j = 0; j < OH; j++) for (i = 0; i < OW; i++) {                    // 輪廓：空的那一點上下左右碰到船 ⇒ 深海藍（Sharkside 介面的底色系，深底、淺底都描得出邊）
    if (on[j * OW + i] || !((i > 0 && on[j * OW + i - 1]) || (i < OW - 1 && on[j * OW + i + 1]) || (j > 0 && on[(j - 1) * OW + i]) || (j < OH - 1 && on[(j + 1) * OW + i]))) continue;
    var o5 = (j * OW + i) * 4; dd[o5] = 8; dd[o5 + 1] = 18; dd[o5 + 2] = 32; dd[o5 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return cv;
}
// Offline capture only: no fleet, simulation, preferences or render loop.
function shipThumbCapturePage(query) {
  var out = { v: THUMB_V, ships: {} }, ids = query === 'all' ? HULL_LIST.map(function (h) { return h.id; }) : query.split(',').filter(Boolean);
  ids.reduce(function (p, id) {
    return p.then(function () { return loadHull(id).then(function (T) { var cv = thumbImg(T); out.ships[id] = cv ? cv.toDataURL('image/png') : { err: 'empty thumbnail' }; }, function (e) { out.ships[id] = { err: String(e && e.message || e) }; }); });
  }, Promise.resolve()).then(function () { var pre = document.createElement('pre'); pre.id = 'ship-thumb-result'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre); });
}

// ───────────────────────── 平滑式：模型的網格照船殼的平滑面畫（TASK-0865；Tim 2026-10-23） ─────────────────────────
// Tim：「船頭標誌可以改金屬嗎 另外我看炮門好像也還不是金屬」「應該說 要開網格平滑(參考金屬艦體)」。
// 為什麼：模型的 material 只給反光（TASK-0859，62_simview.js modelMat）；方塊網格一整面同一個法線 ⇒ 反光整面同一個亮度，看不出金屬（陰雨天量過：蓋板平均只差 15 階）。
//   船殼的金屬看得出來，是平滑面（15_smooth.js surface nets）的法線連續變化 ⇒ 模型走同一套。
// 哪幾件：模型 meta render=smooth；或沒寫 render、material（混合寫法照第一個成分）在材質表標 smooth（iron、boiler）—— 同關聯的規則（05_material.js）；render=voxel ⇒ 方塊。
//   照 meta 選算法的同一個入口（62_lathe.js meshAlgo）：一份網格的模型全部標同一種才換。
// 怎麼做（msmTris）：
//   · 匯出的網格（軸對齊、格點座標）還原成格子：62_shell.js shellVox（同外殼式；顏色 ＝ 網格的材質序號）；
//   · 那份格子整份平滑：15_smooth.js smCpu（同船殼、螺旋槳：格角往表面拉、周圍同一面平均、夾回格角 ±0.5；法線照附近的格子），顏色照材質序號查 mats；
//   · 每一區的頂點與索引展開成模型的三角形（每個頂點 位置 3、法線 3、色 3；座標換回網格的：起點 ＋ 格 × 一格多大）。
//   做不出來（不是方塊匯出的網格、太大）⇒ null ⇒ 照原本的方塊網格。金屬度照舊走材質變體（62_simview.js meshFor 的 aM）。
// ⛔ 只換畫的那一份（GPU 的三角形）：佔格 occ、碰撞、站位照原本的網格 ⇒ 戰局不變。
//   · 擺法轉了 z 角（不是 90° 的倍數）的模型：匯出時角度烤進頂點、座標捨到 0.01（松島號船頭收窄那 6 片蓋板 rz −7.7°～−12.7°）⇒ shellVox 認不出格點。
//     msmAlign：照水平的邊推出轉了幾度（每條邊的角度 ×4 取圓平均 ⇒ 90° 的倍數不算）、轉回去、吸到 0.05 的格點上 ⇒ 還原成格子；做完頂點與法線再轉回來。
var MSM_SNAP = 0.05;
/** 繞 z 轉了非直角的網格 ⇒ { m：轉回軸對齊、吸過格點的網格, th：轉了幾度（弧度）}；本來就對齊、或推不出角度 ⇒ null。 */
function msmAlign(m) {
  var V = m.verts, Tr = m.tris, E = [], bin = {}, tot = 0, i, k;
  for (var t = 0; t < Tr.length; t += 3) for (k = 0; k < 3; k++) {
    var a = Tr[t + k] * 3, b = Tr[t + (k + 1) % 3] * 3, dx = V[b] - V[a], dy = V[b + 1] - V[a + 1], L = Math.hypot(dx, dy);
    if (Math.abs(V[b + 2] - V[a + 2]) > 1e-3 || L < 0.5) continue;      // 只看水平、夠長的邊
    var deg = ((Math.atan2(dy, dx) * 180 / Math.PI) % 90 + 90) % 90; if (deg > 45) deg -= 90;   // 90° 的倍數不算 ⇒ −45～45
    E.push([deg, L]); var bk = Math.round(deg * 2); bin[bk] = (bin[bk] || 0) + L; tot += L;
  }
  if (!E.length) return null;
  var best = null; for (var bk2 in bin) if (best === null || bin[bk2] > bin[best]) best = bk2;   // 照邊長加權的眾數（0.5° 一格）：上下面三角形的對角線角度不同，⛔ 不取平均
  if (bin[best] < 0.6 * tot) return null;                                 // 邊的方向不一致（不是轉了一個角的方塊網格）
  var sw = 0, sd = 0; E.forEach(function (e) { if (Math.abs(e[0] - best / 2) <= 0.5) { sd += e[0] * e[1]; sw += e[1]; } });
  var th = sd / sw * Math.PI / 180; if (Math.abs(th) < 1e-3) return null;
  var c = Math.cos(-th), s = Math.sin(-th), W = new Float64Array(V.length), x0 = 0, y0 = 0;
  for (i = 0; i < V.length; i += 3) { W[i] = V[i] * c - V[i + 1] * s; W[i + 1] = V[i] * s + V[i + 1] * c; W[i + 2] = V[i + 2]; }
  x0 = W[0]; y0 = W[1];
  for (i = 0; i < V.length; i++) {                                       // 吸格點：跟第一個頂點的差捨到 MSM_SNAP（差太多 ⇒ 不是格點網格）
    var base = i % 3 === 0 ? x0 : i % 3 === 1 ? y0 : 0, d = W[i] - base, r = Math.round(d / MSM_SNAP) * MSM_SNAP;
    if (Math.abs(d - r) > 0.02) return null;
    W[i] = base + r;
  }
  return { m: { verts: W, tris: Tr, tmat: m.tmat, mats: m.mats }, th: th };
}
/** 一份網格（verts、tris、tmat、mats）⇒ 平滑式的三角形；做不出來 ⇒ null。st（給了 ⇒ 填讀數：格、一格多大、頂點、三角形、轉回去的角度）。 */
function msmTris(m, st) {
  var X = shellVox(m), A = null;
  if (!X) { A = msmAlign(m); if (A) { X = shellVox(A.m); m = A.m; } }
  if (!X) return null;
  var nx = X.n[0], ny = X.n[1], nz = X.n[2], nxy = nx * ny, G = new VK.Grid([nx, ny, nz]), cnt = 0;
  for (var i = 0; i < X.s.length; i++) if (X.s[i]) {
    var cl = X.col[i]; if (cl < 0 || cl > 253) return null;               // 格子的值 ＝ 材質序號 ＋ 1（0 ＝ 空；VK.Grid 一格一個 byte）
    G.set(i % nx, ((i / nx) | 0) % ny, (i / nxy) | 0, cl + 1); cnt++;
  }
  if (!cnt) return null;
  var T = { h: { size: [nx, ny, nz] } }, o = { SG: G, mm: 0, mr: 0.5, rgb: function (v) { return m.mats[v - 1] || [0.5, 0.5, 0.5]; } };
  var out = [], c = X.c, O = X.o, nt = 0;
  smRegions(T, G).forEach(function (rk) {
    var r = smCpu(T, G, rk, null, o); if (!r) return;
    var b = r.buf, I = r.idx;
    for (var j = 0; j < I.length; j++) {
      var k = I[j] * 11;
      out.push(O[0] + b[k] * c, O[1] + b[k + 1] * c, O[2] + b[k + 2] * c, b[k + 3], b[k + 4], b[k + 5], b[k + 6], b[k + 7], b[k + 8]);
    }
    nt += I.length / 3;
  });
  if (!nt) return null;
  if (A) {                                                               // 轉回原本的角度（位置與法線）
    var rc = Math.cos(A.th), rs = Math.sin(A.th);
    for (var q = 0; q < out.length; q += 9) {
      var px = out[q], py = out[q + 1], qx = out[q + 3], qy = out[q + 4];
      out[q] = px * rc - py * rs; out[q + 1] = px * rs + py * rc; out[q + 3] = qx * rc - qy * rs; out[q + 4] = qx * rs + qy * rc;
    }
  }
  if (st) { st.voxels = cnt; st.cell = c; st.tris = nt; st.n = [nx, ny, nz]; st.rot = A ? +(A.th * 180 / Math.PI).toFixed(2) : 0; }
  return new Float32Array(out);
}

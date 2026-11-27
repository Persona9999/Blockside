// 帆的損傷網格（TASK-1402；Tim 2026-11-27「然後帆如果改成不是固定切成50份 而是根據面積分配呢(根據面積切成一組網格(可以比Mesh三角形細)
//   紀錄哪些部分被打破然後透過這個決定要移除哪部份三角(打破) 或是只改貼圖」「照損傷網格做」；
//   「那火燒帆也可以同步傷害損傷網格嗎(同時是否能處理帆被打斷的模擬 例如一部分帆已經被徹底打斷就應該撕裂 之前會出現虛擬連結)」）。
//
// 網格：每面帆的布模板（c.T，細格）照作品的形狀（p0）攤在最開的兩個軸上（跟 11_rig_gpu.js sailRagH 同一個挑法），
//   切成 SDMG.cell 公尺一格（一軸最多 SDMG.max 格，大帆的格子跟著放大）；格子中心落在哪個三角形 ⇒ 那一格在帆裡（tri），
//   離哪一個頂點最近（重心座標最大的那一點）⇒ 那一格歸那一點（own：火燒穿那一點 ⇒ 它的格子算壞）。模板第一次用才算、放在模板上（同型的船共用）。
// 狀態（c.dm，物理開著、布在才有；clothInit 清掉，收帆再張、斷開帶走都帶著）：
//   dg ＝ 每格被砲彈打掉幾成（0..255，畫面照它挖洞：著色器內插後 ＞ 一半 ＋ 雜訊 ⇒ discard、邊上一圈毛邊的顏色）；
//   dl ＝ 每格壞了沒（推力照它：31_sailing.js clothIntact ＝ 1 − 壞的格數 ÷ 帆裡的格數）——砲彈打掉過半、鏈彈撕開的三角形、火燒穿的點、斷開掉下去的那一塊都算；
//   b ＝ 每個細格點燒穿了沒（49_burn.js burnSail 寫）；v ＝ 改過就換一個號碼（畫面照它重傳貼圖）。
// 打斷（sdgTear）：看得到的點（沒藏、沒燒穿、沒被砲彈打掉；綁著的點一律算）照「兩點都看得到、中間沒被打掉過半」的邊連成幾塊；
//   跟任何一個綁著的點都不連的那幾塊 ⇒ 真的斷開：它跟外面的約束全斷、藏起來、變成布片飄下去（34_shreds.js shredCut；燒過、打掉的三角形不變布片）；
//   兩塊都綁著（撕成兩半）⇒ 兩塊之間還連著的約束斷掉（以前畫面上斷了、物理上還被看不到的邊拉著 ＝ 虛擬連結）。
//   ⛔ 只斷「分成兩塊」的那幾條：洞裡的點不斷（斷了那一點會掉下去，從它內插的三角形被拉成長條 —— 2026-10-12 的布帶）。
// ⛔ 物理關著不建網格：推力照血量（31_sailing.js sailIntact）。
var SDMG = { cell: 0.2, max: 128, solidR: 0.3, ramp: 1, cutK: 3, samp: 5 };   // cell／solidR：公尺；ramp：洞邊往內外各漸變幾格；cutK：一條邊取 samp 個點、幾個被打掉就算斷
var SDMG_UNIT = 22, SDMG_SEQ = 0, SDMG_P = null, SDMG_BALL0 = { ammo: 0, v: [0, 0, 0] };   // SDMG_UNIT：畫帆時損傷貼圖綁在第幾號；SDMG_BALL0：不是砲彈撕的（火燒、斷開）⇒ 布片的初速只有亂數
/** 布模板 T（細格）的網格：攤開的兩個軸 i1、i2、起點 u0／v0、一格幾格長 h、W × H 格；每點的格座標 U／V（以格為單位）、所在的格 vc；
 *  每格在哪個三角形 tri（−1 ＝ 帆外）、歸哪一點 own；帆裡幾格 nIn；每點的格（osS／osL，CSR）、每點的三角形（vtS／vtL）。 */
function sdgTpl(T) {
  if (T.sdg) return T.sdg;
  var n = T.n, p0 = T.p0, tr = T.tris, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], i, j, k;
  for (i = 0; i < n; i++) for (k = 0; k < 3; k++) { var x = p0[i * 3 + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; }
  var ex = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], i1 = 0, i2 = 1;
  if (ex[0] <= ex[1] && ex[0] <= ex[2]) { i1 = 1; i2 = 2; } else if (ex[1] <= ex[2]) { i1 = 0; i2 = 2; }
  var h = Math.max(SDMG.cell / S, ex[i1] / SDMG.max, ex[i2] / SDMG.max, 1e-3), W = Math.max(1, Math.ceil(ex[i1] / h)), H = Math.max(1, Math.ceil(ex[i2] / h));
  var U = new Float32Array(n), V = new Float32Array(n), vc = new Int32Array(n);
  for (i = 0; i < n; i++) { U[i] = (p0[i * 3 + i1] - lo[i1]) / h; V[i] = (p0[i * 3 + i2] - lo[i2]) / h; vc[i] = Math.min(W - 1, Math.floor(U[i])) + W * Math.min(H - 1, Math.floor(V[i])); }
  var tri = new Int32Array(W * H).fill(-1), own = new Int32Array(W * H).fill(-1), nIn = 0, nt = tr.length / 3;
  for (j = 0; j < nt; j++) {
    var a = tr[j * 3], b = tr[j * 3 + 1], c = tr[j * 3 + 2], ax = U[a], ay = V[a], bx = U[b] - ax, by = V[b] - ay, cx = U[c] - ax, cy = V[c] - ay, den = bx * cy - by * cx;
    if (Math.abs(den) < 1e-9) continue;
    var x0 = Math.max(0, Math.floor(Math.min(ax, U[b], U[c]))), x1 = Math.min(W - 1, Math.floor(Math.max(ax, U[b], U[c]))), y0 = Math.max(0, Math.floor(Math.min(ay, V[b], V[c]))), y1 = Math.min(H - 1, Math.floor(Math.max(ay, V[b], V[c])));
    for (var iy = y0; iy <= y1; iy++) for (var ix = x0; ix <= x1; ix++) {
      var q = ix + iy * W; if (tri[q] >= 0) continue;
      var px = ix + 0.5 - ax, py = iy + 0.5 - ay, wb = (px * cy - py * cx) / den, wc = (bx * py - by * px) / den, wa = 1 - wb - wc;
      if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
      tri[q] = j; own[q] = wa >= wb && wa >= wc ? a : wb >= wc ? b : c; nIn++;
    }
  }
  var osS = new Int32Array(n + 1), osL = new Int32Array(nIn), vtS = new Int32Array(n + 1), vtL = new Int32Array(tr.length), at;
  for (i = 0; i < W * H; i++) if (own[i] >= 0) osS[own[i] + 1]++;
  for (i = 0; i < n; i++) osS[i + 1] += osS[i];
  at = Int32Array.from(osS); for (i = 0; i < W * H; i++) if (own[i] >= 0) osL[at[own[i]]++] = i;
  for (i = 0; i < tr.length; i++) vtS[tr[i] + 1]++;
  for (i = 0; i < n; i++) vtS[i + 1] += vtS[i];
  at = Int32Array.from(vtS); for (i = 0; i < tr.length; i++) vtL[at[tr[i]]++] = (i / 3) | 0;
  return (T.sdg = { i1: i1, i2: i2, h: h, W: W, H: H, U: U, V: V, vc: vc, tri: tri, own: own, nIn: nIn || 1, osS: osS, osL: osL, vtS: vtS, vtL: vtL });
}
/** 這面布的損傷狀態（沒有就建一份全好的）。 */
function sdgOf(c) {
  if (c.dm) return c.dm;
  var D = sdgTpl(c.T);
  return (c.dm = { dg: new Uint8Array(D.W * D.H), dl: new Uint8Array(D.W * D.H), n: 0, b: new Uint8Array(c.T.n), v: ++SDMG_SEQ });
}
function sdgLose(D, dm, q) { if (D.tri[q] >= 0 && !dm.dl[q]) { dm.dl[q] = 1; dm.n++; } }
/** 彈點 L（布現在的位置，格座標）⇒ 布攤開時的格座標 [u, v]：最近的細格點周圍那幾個三角形裡，離 L 最近的那一點的重心座標、套回攤開的位置。 */
function sdgHit(c, D, L) {
  var n = c.T.n, tr = c.T.tris, bi = 0, bd = Infinity, i, best = null, bdt = Infinity;
  if (!SDMG_P || SDMG_P.length < n * 3) SDMG_P = new Float32Array(n * 3);
  var P = clothFine(c, SDMG_P);
  for (i = 0; i < n; i++) { var dx = P[i * 3] - L[0], dy = P[i * 3 + 1] - L[1], dz = P[i * 3 + 2] - L[2], d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; bi = i; } }
  for (var e = D.vtS[bi]; e < D.vtS[bi + 1]; e++) {
    var t = D.vtL[e], a = tr[t * 3] * 3, b = tr[t * 3 + 1] * 3, d3 = tr[t * 3 + 2] * 3;
    var e0 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e1 = [P[d3] - P[a], P[d3 + 1] - P[a + 1], P[d3 + 2] - P[a + 2]], v2 = [L[0] - P[a], L[1] - P[a + 1], L[2] - P[a + 2]];
    var d00 = dot(e0, e0), d01 = dot(e0, e1), d11 = dot(e1, e1), d20 = dot(v2, e0), d21 = dot(v2, e1), den = d00 * d11 - d01 * d01; if (!(Math.abs(den) > 1e-12)) continue;
    var wb = Math.max(0, (d11 * d20 - d01 * d21) / den), wc = Math.max(0, (d00 * d21 - d01 * d20) / den), wa = Math.max(0, 1 - wb - wc), s = wa + wb + wc; wa /= s; wb /= s; wc /= s;   // 投影到三角形的平面、落在外面就夾回邊上
    var qx = P[a] + e0[0] * wb + e1[0] * wc - L[0], qy = P[a + 1] + e0[1] * wb + e1[1] * wc - L[1], qz = P[a + 2] + e0[2] * wb + e1[2] * wc - L[2], dd = qx * qx + qy * qy + qz * qz;
    if (dd < bdt) { bdt = dd; var A = tr[t * 3], B = tr[t * 3 + 1], C = tr[t * 3 + 2]; best = [D.U[A] * wa + D.U[B] * wb + D.U[C] * wc, D.V[A] * wa + D.V[B] * wb + D.V[C] * wc]; }
  }
  return best || [D.U[bi], D.V[bi]];
}
/** 在格座標 (u, v) 打掉一個半徑 r 公尺的圓：每格照離圓心多遠給幾成（圓周上 ＝ 一半，往內外各 SDMG.ramp 格漸變 ⇒ 著色器內插出來是圓的、雜訊推得動邊）；過半 ⇒ 壞了。 */
function sdgDisk(D, dm, u, v, r) {
  var rc = r / S / D.h, R = SDMG.ramp, x0 = Math.max(0, Math.floor(u - rc - R - 1)), x1 = Math.min(D.W - 1, Math.ceil(u + rc + R + 1)), y0 = Math.max(0, Math.floor(v - rc - R - 1)), y1 = Math.min(D.H - 1, Math.ceil(v + rc + R + 1));
  for (var iy = y0; iy <= y1; iy++) for (var ix = x0; ix <= x1; ix++) {
    var k = clamp((rc - Math.hypot(ix + 0.5 - u, iy + 0.5 - v)) / (2 * R) + 0.5, 0, 1), q = ix + iy * D.W, g = Math.round(k * 255);
    if (g > dm.dg[q]) dm.dg[q] = g;
    if (k >= 0.5) sdgLose(D, dm, q);
  }
  dm.v = ++SDMG_SEQ;
}
/** 藏起來的細格點（c.tv：鏈彈撕開、斷開掉下去的）⇒ 它們的三角形蓋到的格算壞。 */
function sdgTv(c, D, dm) {
  var tr = c.T.tris, tv = c.tv;
  for (var q = 0; q < D.tri.length; q++) { var t = D.tri[q]; if (t >= 0 && !dm.dl[q] && (tv[tr[t * 3]] || tv[tr[t * 3 + 1]] || tv[tr[t * 3 + 2]])) sdgLose(D, dm, q); }
}
/** 火燒穿了這幾個細格點（49_burn.js burnSail）⇒ 它們的格算壞，再看有沒有哪一塊因此斷開。 */
function sdgBurn(sh, s, c, list) {
  var D = sdgTpl(c.T), dm = sdgOf(c);
  list.forEach(function (q) { for (var e = D.osS[q]; e < D.osS[q + 1]; e++) sdgLose(D, dm, D.osL[e]); });
  sdgTear(sh, c, s, null);
}
/** 斷開（見檔頭）：回 true ＝ 斷了約束或藏了點。b：撕它的砲彈（布片的初速；火燒、斷開 ⇒ null）。 */
function sdgTear(sh, c, s, b) {
  var dm = c.dm; if (!dm || !c.p || !c.pin) return false;
  var D = sdgTpl(c.T), T = c.T.sim, fi = T.fine, n = T.n, ea = T.ea, eb = T.eb, ba = T.ba, bb = T.bb, dg = dm.dg, i, u, v;
  var vis = new Uint8Array(n), gone = new Uint8Array(c.T.n), par = new Int32Array(n), anc = Uint8Array.from(c.pin), inv = new Int32Array(c.T.n).fill(-1);
  for (i = 0; i < n; i++) inv[fi[i]] = i;
  if (c.tt) c.tt.forEach(function (t) { var j = inv[t.i]; if (j >= 0 && !sh.ropes[t.j].dead && !(sh.tCut && sh.tCut[t.j]) && !c.tv[t.i]) anc[j] = 1; });   // 帆腳：不是釘住、是被繩拉著（tethOf）⇒ 繩還在也算綁著
  for (i = 0; i < c.T.n; i++) if (dm.b[i] || dg[D.vc[i]] >= 128) gone[i] = 1;   // 燒穿、被打掉的點（不變布片）
  for (i = 0; i < n; i++) { var f = fi[i]; vis[i] = anc[i] || !c.tv[f] && !gone[f] ? 1 : 0; par[i] = i; }
  function fd(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
  function un(x, y) { x = fd(x); y = fd(y); if (x !== y) par[x < y ? y : x] = x < y ? x : y; }
  function cut(x, y) {                                                   // 這條邊中間被砲彈打掉過半（取 samp 個點、cutK 個以上）
    var fx = fi[x], fy = fi[y], m = 0;
    for (var k = 0; k < SDMG.samp; k++) { var t = (k + 0.5) / SDMG.samp, cx = Math.min(D.W - 1, Math.floor(D.U[fx] + (D.U[fy] - D.U[fx]) * t)), cy = Math.min(D.H - 1, Math.floor(D.V[fx] + (D.V[fy] - D.V[fx]) * t)); if (dg[cx + cy * D.W] >= 128) m++; }
    return m >= SDMG.cutK;
  }
  for (i = 0; i < ea.length; i++) { u = ea[i]; v = eb[i]; if (!c.brk[i] && vis[u] && vis[v] && !cut(u, v)) un(u, v); }
  var keep = new Uint8Array(n), any = false, chg = 0, bridge = 0;
  for (i = 0; i < n; i++) if (vis[i] && anc[i]) { keep[fd(i)] = 1; any = true; }
  if (!any) return false;                                                // 一個綁著的點都沒有 ⇒ 整面鬆了（另外處理：c.loose）
  // 每一點歸哪一塊（home）：看得到的 ＝ 它那一塊；看不到的（洞裡、燒穿、藏起來的）⇒ 沿還在的邊從最近的那一塊漫過去（同一步照編號先到先得）。
  //   一條還在的約束兩端歸不同塊 ⇒ 那兩塊在畫面上是分開的、物理上還被它拉著（虛擬連結）：兩端都看得到 ⇒ 斷那一條；
  //   一端看不到（夾在兩塊之間的洞裡的點）⇒ 那一點藏起來、它所有的約束都斷（只斷約束不藏的話，它被一邊拉走，另一邊從它內插的三角形被拉成長條）。
  var home = new Int32Array(n).fill(-1), adS = new Int32Array(n + 1), adL = new Int32Array(ea.length * 2), at, Q = [], qh = 0;
  for (i = 0; i < ea.length; i++) if (!c.brk[i]) { adS[ea[i] + 1]++; adS[eb[i] + 1]++; }
  for (i = 0; i < n; i++) adS[i + 1] += adS[i];
  at = Int32Array.from(adS); for (i = 0; i < ea.length; i++) if (!c.brk[i]) { adL[at[ea[i]]++] = eb[i]; adL[at[eb[i]]++] = ea[i]; }
  for (i = 0; i < n; i++) if (vis[i]) { home[i] = fd(i); Q.push(i); }
  while (qh < Q.length) { u = Q[qh++]; for (var e = adS[u]; e < adS[u + 1]; e++) { v = adL[e]; if (home[v] < 0) { home[v] = home[u]; Q.push(v); } } }
  var br = new Uint8Array(n);
  for (i = 0; i < ea.length; i++) {
    u = ea[i]; v = eb[i]; if (c.brk[i] || home[u] < 0 || home[v] < 0 || home[u] === home[v]) continue;
    if (vis[u] && vis[v]) { c.brk[i] = 1; chg++; } else { if (!vis[u]) br[u] = 1; if (!vis[v]) br[v] = 1; }
  }
  for (i = 0; i < ba.length; i++) { u = ba[i]; v = bb[i]; if (!c.bbrk[i] && home[u] >= 0 && home[v] >= 0 && home[u] !== home[v]) { c.bbrk[i] = 1; chg++; } }
  var nb = [];                                                           // 這一次才藏的夾在中間的點（以前就藏著的不算新的 ⇒ 不重做布片）
  for (i = 0; i < n; i++) if (br[i]) { bridge++; if (!c.tv[fi[i]]) { c.tv[fi[i]] = 1; nb.push(fi[i]); } }
  if (bridge) {
    for (i = 0; i < ea.length; i++) if (!c.brk[i] && (br[ea[i]] || br[eb[i]])) { c.brk[i] = 1; chg++; }
    for (i = 0; i < ba.length; i++) if (!c.bbrk[i] && (br[ba[i]] || br[bb[i]])) { c.bbrk[i] = 1; chg++; }
  }
  var nd = 0; for (i = 0; i < n; i++) if (vis[i] && !keep[fd(i)]) nd++;  // 沒綁的那幾塊（下面照物理連不到綁著的點 ⇒ 藏起來、變布片）
  if (!chg && !nd) return false;
  for (i = 0; i < n; i++) par[i] = i;                                    // 斷完：照還在的約束（拉伸＋彎曲）連到綁著的點的留著，其他藏起來
  for (i = 0; i < ea.length; i++) if (!c.brk[i]) un(ea[i], eb[i]);
  for (i = 0; i < ba.length; i++) if (!c.bbrk[i]) un(ba[i], bb[i]);
  keep.fill(0); for (i = 0; i < n; i++) if (anc[i]) keep[fd(i)] = 1;
  var old = Uint8Array.from(c.tv), hid = nb.length;
  nb.forEach(function (f) { old[f] = 0; });                              // 夾在中間藏起來的點：算這一次新藏的（推力扣它的格；它碰到的三角形照 gone 不變布片）
  for (i = 0; i < n; i++) if (!keep[fd(i)] && !c.tv[fi[i]]) { c.tv[fi[i]] = 1; hid++; }
  if (hid) { for (i = 0; i < c.T.n; i++) if (c.tv[i] && !old[i]) for (var e = D.osS[i]; e < D.osS[i + 1]; e++) sdgLose(D, dm, D.osL[e]); }
  c.torn = true; c.tearV = (c.tearV || 0) + 1;
  if (hid) shredCut(sh, c, old, b || SDMG_BALL0, gone);
  return true;
}
// ── 畫面：每艘一張損傷貼圖（R8；一面帆一塊、四周留一格空的 ⇒ 內插不會借到隔壁那塊）──
/** 這艘（船或斷開帶走的那一團）的貼圖怎麼排：第一次有帆受損才排、排一次就不動（頂點的座標才不用整份重填）。回那一面的那一塊（沒有損傷 ⇒ null）。 */
function sdgTile(ow, o) {
  if (!o.dm) return null;
  var A = ow.sdt, C = ow.cl || [];
  if (!A) {
    A = ow.sdt = { tex: null, AW: 512, AH: 0, t: [] };
    var x = 0, y = 0, rh = 0;
    C.forEach(function (c, k) {
      var D = sdgTpl(c.T), w = D.W + 2, h = D.H + 2;
      if (x + w > A.AW) { x = 0; y += rh; rh = 0; }
      A.t[k] = { x: x, y: y, D: D, v: 0 }; x += w; rh = Math.max(rh, h);
    });
    A.AH = Math.max(1, y + rh);
  }
  var k = C.indexOf(o); return k >= 0 ? A.t[k] || null : null;
}
/** 第 i 個細格點的貼圖座標（＋2：沒有損傷的帆、別的緩衝這一欄是 0 ⇒ 著色器照 ＞ 1.5 判有沒有）。 */
function sdgVu(A, t, i) { return (t.x + 1 + t.D.U[i]) / A.AW + 2; }
function sdgVv(A, t, i) { return (t.y + 1 + t.D.V[i]) / A.AH + 2; }
/** 畫這艘的帆之前：改過的那幾塊傳上去、綁在 SDMG_UNIT。沒有損傷 ⇒ 不綁（頂點那一欄是 0，著色器不讀）。 */
function sdgBind(ow) {
  var A = ow.sdt; if (!A) return;
  gl.activeTexture(gl.TEXTURE0 + SDMG_UNIT);
  if (!A.tex) {
    A.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, A.tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, A.AW, A.AH, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(A.AW * A.AH));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  } else gl.bindTexture(gl.TEXTURE_2D, A.tex);
  (ow.cl || []).forEach(function (c, k) {
    var t = A.t[k], dm = c && c.dm; if (!t || !dm || t.v === dm.v) return;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texSubImage2D(gl.TEXTURE_2D, 0, t.x + 1, t.y + 1, t.D.W, t.D.H, gl.RED, gl.UNSIGNED_BYTE, dm.dg); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    t.v = dm.v;
  });
  gl.activeTexture(gl.TEXTURE0);
}

// ───────────────────────── 表演船遠近分級（TASK-1104；總單 TASK-1100 第 4 期）─────────────────────────
// 表演船（58_traffic.js trafficShow：往來的船、還沒變成真的船）照離鏡頭的水平距離分級：近 原模、中 低模（0.4 m 一塊）、遠 八方向貼圖（還沒做：先畫中那一級）。
// 距離表（Tim 2026-10-29「交給你判斷 這部分之後可能要看情況調整(看畫面表現)」；erina 定，理由寫在 TASK-1104）：
//   近→中 SHOWLOD.L.n 公尺、不乘倍率；中→遠 SHOWLOD.L.f × 倍率 lk（同建築：格子長、寬、高最大的那一邊 ÷ 24 m，限 1～4）。常數只放這一處，?debug=1 下 __game.showlod({ n, f }) 即時調。
//   距離 ＝ 鏡頭到船格子中心的水平距離；每格照船現在的位置分一次（船會動 ⇒ 不走建築「鏡頭移動 8 m 才重新分組」那一條），陰影、反射、主畫面三趟照同一份（SHOWLOD.lv）。
// 中那一級（烘好的，ships/showlod.js；admin.py showlod 跑成品的 ?showlodbake=<船型> 烘）：
//   船殼格 ＋ 烘那一刻不會動的模型與裝飾（體素化：三角形每半格取一點、往法線反方向四分之一格那一格）⇒ 4×4×4 併成一塊：
//   64 格裡滿 SHOWLOD_FILL 格算有東西、顏色取最多的那一色（同 Blocksail tools/townmodels.py downsample；船只讓從外面看得到的格投票：六個軸向掃進來第一個碰到的格）；
//   ⚠ 船是空心的（船殼板一兩格厚）⇒ 從外面灌空氣（一塊 64 格全空才通），灌不到的空塊算船裡 ⇒ 實心；貼著船裡的塊不管滿幾格都留 ⇒ 斜的船殼板不破洞。
//   遊戲讀進來網格化一次（VoxelKit RegionSet，同船殼的格式）⇒ P.vox 原樣畫，uModel ＝ sh.M × 平移 off × 縮放 4（vL 變成 0.4 m 一格：每格明暗、格邊都照大塊；光照、霧、陰影同一套）。
//   帆、繩、旗、船員、會動的模型（帆桁、吊著的小艇、門、砲塔、錨、燈、迴旋砲、螺旋槳）、裝甲照舊畫；平滑面、玻璃、烘進去的模型與裝飾不畫（rbatShip、glsDraw 跳過）。
//   烘進去的模型這一格不是純平移（門開了、砲縮進去、錨拋下去）⇒ 照舊畫（低模裡那一份是烘的樣子；160 m 外看不出來）。
// 不分級（照原模畫，讀數記在 none）：不是表演船（我艦、敵對了的、被打過的 npc.real）、格子被打掉過（grid.ver ≠ 0）、那一型沒烘或指紋對不上。
// 指紋：config/vxk_lock.json 那一型的 c:（成品 blockside-src 的 files 記前 12 碼）＋ SHOWLOD_V（算法改了就加一）⇒ 對不上那一型不分級（照原模，不會畫錯）。
// 開關：?showlod=0（或 ?rb=0）⇒ 跟改前一樣；?debug=1 下 __game.showlod(false／true)。⛔ 只動畫面：不讀寫模擬的狀態、不抽 rnd()、不改 SHIPS 的順序。
var SHOWLOD_V = 2, SHOWLOD_K = 4, SHOWLOD_FILL = 12, SHOWLOD_LK = 24;
var SHOWLOD = {
  on: RBAT_ON && Q.get('showlod') !== '0',
  L: { n: 160, nb: 24, f: 800, fb: 60 },                               // 距離表（公尺）：n 近→中、f 中→遠（× lk）；nb、fb 交接帶的半寬（還沒用：交接帶先硬換）
  st: 0, err: null, raw: null,                                           // 檔：0 還沒要、1 在載、2 好了、3 載不到（err）；raw ＝ 檔裡每一型還沒解的那一份
  T: {},                                                                 // 船型 id ⇒ { rs, L（off、縮放 4 的局部矩陣）, lk, mk、dk（烘進去的模型、裝飾序號：1）, quads } ／ null（沒有、對不上）／ 'busy'（在解）
  lv: new Uint8Array(16), Mm: new Float32Array(256),                     // 這一格第 o 艘畫哪一級（0 近、1 中）、中那一級的矩陣（第 o 艘在 Mm[o·16 …]）
  stat: { f: -1, near: 0, mid: 0, far: 0, none: 0, quads: 0, ms: 0 }
};
/** 一型的倍率：格子長、寬、高最大的那一邊（公尺）÷ 24，限 1～4（同建築 63_towns.js 的 lk）。 */
function showlodLk(G) { return clamp(Math.max(G.sx, G.sy, G.sz) * S / SHOWLOD_LK, 1, 4); }
/** 這一格的模型這一刻是不是純平移（rbatModelL 的最後那一條、沒有只給畫面的位移）。 */
function showlodPlain(m) { return !(m.swM || m.sw || (m.spinB && m.spinB.mt) || (m.rot && m.piv) || m.hd || m.ancD || m.vsl || m.vpre || m.gsl); }
/** 這一型的成品指紋（blockside-src 記的 'lock c:…'）＋ 算法版本；讀不到 ⇒ null。 */
function showlodFp(id) {
  var c = CFG.ships.filter(function (s) { return s.id === id; })[0];
  if (!c || !c.vxk) return null;
  if (SHOWLOD.src === undefined) { try { SHOWLOD.src = JSON.parse(document.getElementById('blockside-src').textContent).files; } catch (e) { SHOWLOD.src = null; } }
  var f = SHOWLOD.src && SHOWLOD.src['VoxelKit/_cache/' + c.vxk];
  return f ? SHOWLOD_V + ' ' + f : null;
}
/** 第一艘表演船出現 ⇒ 載 ships/showlod.js（同 flagloop.js：<script>，成品不准 fetch）。 */
function showlodNeed() {
  var D = SHOWLOD; if (D.st) return;
  D.st = 1;
  function fail(e) { D.st = 3; D.err = String(e && e.message || e); }
  try {
    var s = document.createElement('script'); s.src = ((window.BS_SHELL && window.BS_SHELL.ships) || '') + 'ships/showlod.js';
    s.onload = function () { var o = window.BS_SHOWLOD; window.BS_SHOWLOD = null; if (!o || !o.types) { fail('ships/showlod.js 裡沒有資料'); return; } D.raw = o.types; D.st = 2; };
    s.onerror = function () { fail('載不到 ' + s.src); };
    document.head.appendChild(s);
  } catch (e) { fail(e); }
}
/** 第一次用到這一型 ⇒ 解開（非同步）、建格子、網格化；這一格先不分級。 */
function showlodType(T) {
  var D = SHOWLOD, id = T.id, t = D.T[id];
  if (t !== undefined) return t && t !== 'busy' ? t : null;
  if (D.st !== 2) return null;
  var r = D.raw && D.raw[id];
  if (!r || r.fp !== showlodFp(id)) { D.T[id] = null; return null; }      // 沒烘、指紋對不上（作品重新匯入過、算法改過）⇒ 這一型不分級
  D.T[id] = 'busy';
  VK.inflateRaw(VK.b64ToBytes(r.b64)).then(function (u) {
    var n = r.n, G = new VK.Grid(n), x, y, z, i = 0;
    for (z = 0; z < n[2]; z++) for (y = 0; y < n[1]; y++) for (x = 0; x < n[0]; x++, i++) if (u[i]) G.set(x, y, z, u[i]);
    var rs = new VK.RegionSet(gl, G, QIDX); rs.buildAll();
    var L = new Float32Array([SHOWLOD_K, 0, 0, 0, 0, SHOWLOD_K, 0, 0, 0, 0, SHOWLOD_K, 0, r.off[0], r.off[1], r.off[2], 1]);
    var mk = new Uint8Array((r.mk.length ? Math.max.apply(null, r.mk) : 0) + 1), dk = new Uint8Array((r.dk.length ? Math.max.apply(null, r.dk) : 0) + 1);
    r.mk.forEach(function (k) { mk[k] = 1; }); r.dk.forEach(function (k) { dk[k] = 1; });
    D.T[id] = { rs: rs, L: L, lk: showlodLk(T.hullG || T.base), mk: mk, dk: dk, quads: rs.quads() };
  }).catch(function (e) { D.T[id] = null; D.err = id + '：' + String(e && e.message || e); });
  return null;
}
/** 這一格每艘畫哪一級（frameBegin：rbatPrep 之前；鏡頭、內插過的 sh.M 都定了）。 */
function showlodPrep() {
  var D = SHOWLOD, ns = SHIPS.length, st = D.stat, eye = CAM.eye, t0 = performance.now(), o;
  if (D.lv.length < ns) { D.lv = new Uint8Array(ns * 2); D.Mm = new Float32Array(ns * 32); }
  st.f = RFR; st.near = st.mid = st.far = st.none = st.quads = 0;
  for (o = 0; o < ns; o++) {
    var sh = SHIPS[o]; D.lv[o] = 0;
    if (sh.sink > 40) continue;
    if (!D.on || !eye || !trafficShow(sh) || sh.grid.ver !== 0) { st.none++; continue; }
    if (!D.st) showlodNeed();
    var t = showlodType(sh.T); if (!t) { st.none++; continue; }
    var G = sh.grid, M = sh.M, cx = G.sx / 2, cy = G.sy / 2, cz = G.sz / 2;
    var wx = M[0] * cx + M[4] * cy + M[8] * cz + M[12], wz = M[2] * cx + M[6] * cy + M[10] * cz + M[14], d = Math.hypot(wx - eye[0], wz - eye[2]);
    if (d < D.L.n) { st.near++; continue; }
    D.lv[o] = 1; m4Into(D.Mm, o * 16, M, t.L); st.quads += t.quads;
    if (d < D.L.f * t.lk) st.mid++; else st.far++;                      // 遠那一級（貼圖）還沒做 ⇒ 照中那一級畫，讀數分開記
  }
  st.ms = performance.now() - t0;
}
/** 第 o 艘這一格畫中那一級 ⇒ 那一型的資料；不是 ⇒ null（rbatShip、drawHulls、glsDraw 照它跳過或換畫）。 */
function showlodMid(o, sh) { return SHOWLOD.lv[o] === 1 ? SHOWLOD.T[sh.T.id] : null; }
/** drawHulls 的中那一級：低模（同一支 P.vox／P.dvox；不剖面、不給船殼上的燈）。 */
function showlodHull(prog, o, t) {
  cutSet(prog, null); vlampSet(prog, null);
  gl.uniformMatrix4fv(prog.u.uModel, false, SHOWLOD.Mm, o * 16, 16);
  t.rs.draw();
}

// ── 烘（?showlodbake=<船型>：admin.py showlod 用無頭 Chrome 跑成品、讀頁面上 id 是 showlod 的 pre）──
// 開一場（同 75_shipcheck.js：那一型跟憲法號擺在最遠的距離、還沒跑），拿第 0 艘（剛開場、沒被打過）的格子與模型烘。結果：
//   { id, fp, n：塊數 [x, y, z], off：第 0 塊在船格座標的哪一格（4 的倍數）, b64：每塊一個色碼（0 空；x 最快、再 y、再 z；未壓縮，admin.py 壓）,
//     mk、dk：烘進去的模型、裝飾序號, stat：{ cells 船殼格, mcells 模型格, kept／dropped（原本的格落在留下／丟掉的塊）, inner 灌不到的空塊, blocks 留下的塊, quads, ms } }
function showlodBakePage(id) {
  var R = { id: id };
  function done() { var pre = document.createElement('pre'); pre.id = 'showlod'; document.body.appendChild(pre); pre.textContent = JSON.stringify(R); uiAway(); window.__showlod = R; }
  Promise.all([loadHull(id), loadHull('constitution')]).then(function () {
    if (!hullInfo(id)) { R.err = '設定檔 ships 沒有這一型'; done(); return; }
    FLEET_DBG = [{ team: 'blue', hull: id }, { team: 'red', hull: 'constitution' }]; flowMode('eve'); DIST = LIM_DIST[1];
    WIND_FIX = { rot: 0, s0: 1 };
    reset();
    var o = showlodBake(SHIPS[0]); for (var k in o) R[k] = o[k];
    R.fp = showlodFp(id);
    done();
  }).catch(function (e) { R.err = String(e && e.stack || e); done(); });
}
/** 一艘（剛開場）⇒ 中那一級的塊（見上）。 */
function showlodBake(sh) {
  var t0 = performance.now(), T = sh.T, G = sh.grid, K = SHOWLOD_K, anc = (sh.anc || []).map(function (a) { return a.m; }), lo = [0, 0, 0], hi = [G.sx, G.sy, G.sz], i, j, k;
  // ① 哪幾個模型、裝飾烘進去（這一刻是純平移、不是會動的那幾種）＋ 它們的三角形（格座標）
  var parts = [], mk = [], dk = [];
  function take(tri, W) {
    for (i = 0; i < tri.length; i += 9) for (j = 0; j < 3; j++) { var v = W[j] * tri[i] + W[4 + j] * tri[i + 1] + W[8 + j] * tri[i + 2] + W[12 + j]; if (v < lo[j]) lo[j] = v; if (v > hi[j]) hi[j] = v; }
    parts.push({ tri: tri, W: W });
  }
  sh.models.forEach(function (m, k) {
    if (!m.alive || m.vox || m.hang || m.spinB || m.rot || m.piv || m.hd || isLamp(m) || anc.indexOf(m) >= 0 || kindProp(m.kind, 'anim') || !showlodPlain(m)) return;
    var mi = m.rmesh !== undefined ? m.rmesh : m.mesh, rm = T.rig.meshes[mi]; if (!rm || !T.meshes[mi]) return;
    mk.push(k); take(meshTriFor(T, mi, rm), trans(m.origin[0], m.origin[1], m.origin[2]));
  });
  (sh.decos || []).forEach(function (d, k) {
    var rm = T.rig.meshes[d.mesh]; if (!rm || !T.meshes[d.mesh] || d.gone || d.L || d.gm || (d.foot >= 0 && !hullGp(G, d.foot))) return;
    dk.push(k); take(meshTriFor(T, d.mesh, rm), trans(d.origin[0], d.origin[1], d.origin[2]));
  });
  // ② 範圍：船格 ∪ 模型，往外對齊到 4 的倍數、兩邊各多留一塊空的（灌空氣從外圈起）
  var off = [0, 1, 2].map(function (a) { return Math.floor(lo[a] / K) * K - K; }), n = [0, 1, 2].map(function (a) { return Math.ceil(hi[a] / K) + 2 - off[a] / K; });
  var NB = n[0] * n[1] * n[2], cnt = new Uint8Array(NB), F = new VK.Grid([n[0] * K, n[1] * K, n[2] * K]), st = { cells: 0, mcells: 0 };
  // ③ 細格：船殼照抄、模型的三角形每半格取一點（往法線反方向 0.25 格那一格；那一格已經有船殼 ⇒ 不蓋）
  G.each(function (x, y, z, c) { F.set(x - off[0], y - off[1], z - off[2], c); st.cells++; });
  parts.forEach(function (p) {
    var t = p.tri, W = p.W;
    for (i = 0; i < t.length; i += 27) {
      var A = [], c = rgb332(t[i + 6], t[i + 7], t[i + 8]);
      for (j = 0; j < 3; j++) { var q = i + j * 9; A.push([W[0] * t[q] + W[4] * t[q + 1] + W[8] * t[q + 2] + W[12], W[1] * t[q] + W[5] * t[q + 1] + W[9] * t[q + 2] + W[13], W[2] * t[q] + W[6] * t[q + 1] + W[10] * t[q + 2] + W[14]]); }
      var nr = [W[0] * t[i + 3] + W[4] * t[i + 4] + W[8] * t[i + 5], W[1] * t[i + 3] + W[5] * t[i + 4] + W[9] * t[i + 5], W[2] * t[i + 3] + W[6] * t[i + 4] + W[10] * t[i + 5]];
      var e1 = sub(A[1], A[0]), e2 = sub(A[2], A[0]), ns = Math.max(1, Math.ceil(Math.max(len(e1), len(e2), len(sub(e1, e2))) / 0.5));
      for (var a = 0; a <= ns; a++) for (var b = 0; b <= ns - a; b++) {
        var u = a / ns, w = b / ns, x = Math.floor(A[0][0] + e1[0] * u + e2[0] * w - nr[0] * 0.25) - off[0], y = Math.floor(A[0][1] + e1[1] * u + e2[1] * w - nr[1] * 0.25) - off[1], z = Math.floor(A[0][2] + e1[2] * u + e2[2] * w - nr[2] * 0.25) - off[2];
        if (!F.get(x, y, z) && F.set(x, y, z, c) === 0) st.mcells++;
      }
    }
  });
  // ④ 從外面看得到的格（V）：沿六個軸向從外面一條一條掃進來，第一個碰到的格 ⇒ 顏色只讓它們投票（船殼板一格厚、後面的甲板、肋材不搶顏色）
  var FX = F.sx, FY = F.sy, FZ = F.sz, V = new VK.Grid([FX, FY, FZ]), a0, a1, s;
  function ray(x, y, z, dx, dy, dz) { while (x >= 0 && y >= 0 && z >= 0 && x < FX && y < FY && z < FZ) { if (F.get(x, y, z)) { V.set(x, y, z, 1); return; } x += dx; y += dy; z += dz; } }
  for (a0 = 0; a0 < FY; a0++) for (a1 = 0; a1 < FZ; a1++) { ray(0, a0, a1, 1, 0, 0); ray(FX - 1, a0, a1, -1, 0, 0); }
  for (a0 = 0; a0 < FX; a0++) for (a1 = 0; a1 < FZ; a1++) { ray(a0, 0, a1, 0, 1, 0); ray(a0, FY - 1, a1, 0, -1, 0); }
  for (a0 = 0; a0 < FX; a0++) for (a1 = 0; a1 < FY; a1++) { ray(a0, a1, 0, 0, 0, 1); ray(a0, a1, FZ - 1, 0, 0, -1); }
  // ⑤ 每塊滿幾格、最多的那一色（看得到的格投票；這一塊沒有看得到的格 ⇒ 全部的格投票）
  var col = new Uint8Array(NB), H = new Uint16Array(64 * 256), H2 = new Uint16Array(64 * 256), bx, by, bz;
  for (var cz = 0; cz < F.nz; cz++) for (var cy = 0; cy < F.ny; cy++) for (var cx = 0; cx < F.nx; cx++) {
    var ci = F.ci(cx, cy, cz), ch = F.tab[ci], vh = V.tab[ci]; if (ch === null) continue;
    H.fill(0); H2.fill(0);
    for (var li = 0; li < 4096; li++) { var v = ch[li]; if (!v) continue; s = (((li & 15) >> 2) | ((((li >> 4) & 15) >> 2) << 2) | (((li >> 8) >> 2) << 4)) * 256 + v; H[s]++; if (vh && vh[li]) H2[s]++; }
    for (k = 0; k < 64; k++) {
      var best = 0, bn = 0, tot = 0, b2 = 0, bn2 = 0; for (j = 1; j < 256; j++) { var h = H[k * 256 + j], h2 = H2[k * 256 + j]; tot += h; if (h > bn) { bn = h; best = j; } if (h2 > bn2) { bn2 = h2; b2 = j; } }   // 一樣多 ⇒ 色碼小的
      if (!tot) continue;
      if (bn2) best = b2;
      bx = cx * 4 + (k & 3); by = cy * 4 + ((k >> 2) & 3); bz = cz * 4 + (k >> 4);
      var bi = bx + n[0] * (by + n[1] * bz); cnt[bi] = tot; col[bi] = best;
    }
  }
  // ⑥ 從外面灌空氣：全空的塊才通；灌不到的全空塊 ＝ 船裡（實心）
  var out = new Uint8Array(NB), Qa = new Int32Array(NB), qh = 0, qt = 0;
  function push(x, y, z) { if (x < 0 || y < 0 || z < 0 || x >= n[0] || y >= n[1] || z >= n[2]) return; var q = x + n[0] * (y + n[1] * z); if (out[q] || cnt[q]) return; out[q] = 1; Qa[qt++] = q; }
  push(0, 0, 0);
  while (qh < qt) { var q = Qa[qh++], x = q % n[0], y = Math.floor(q / n[0]) % n[1], z = Math.floor(q / (n[0] * n[1])); push(x - 1, y, z); push(x + 1, y, z); push(x, y - 1, z); push(x, y + 1, z); push(x, y, z - 1); push(x, y, z + 1); }
  // ⑦ 留哪幾塊：滿 SHOWLOD_FILL 格、或貼著船裡；船裡的空塊實心（顏色照船殼最多的那一色：看不到，除非旁邊的塊被丟掉）
  var hist = new Uint32Array(256); for (k = 0; k < NB; k++) if (cnt[k]) hist[col[k]]++;
  var ic = 1, icn = 0; for (j = 1; j < 256; j++) if (hist[j] > icn) { icn = hist[j]; ic = j; }
  function inner(x, y, z) { if (x < 0 || y < 0 || z < 0 || x >= n[0] || y >= n[1] || z >= n[2]) return false; var q = x + n[0] * (y + n[1] * z); return !cnt[q] && !out[q]; }
  var res = new Uint8Array(NB); st.kept = st.dropped = st.inner = st.blocks = 0;
  for (bz = 0; bz < n[2]; bz++) for (by = 0; by < n[1]; by++) for (bx = 0; bx < n[0]; bx++) {
    k = bx + n[0] * (by + n[1] * bz);
    if (!cnt[k]) { if (!out[k]) { res[k] = ic; st.inner++; } continue; }
    if (cnt[k] >= SHOWLOD_FILL || inner(bx - 1, by, bz) || inner(bx + 1, by, bz) || inner(bx, by - 1, bz) || inner(bx, by + 1, bz) || inner(bx, by, bz - 1) || inner(bx, by, bz + 1)) { res[k] = col[k]; st.kept += cnt[k]; st.blocks++; }
    else st.dropped += cnt[k];
  }
  var s = ''; for (i = 0; i < NB; i += 32768) s += String.fromCharCode.apply(null, res.subarray(i, Math.min(NB, i + 32768)));
  st.ms = Math.round(performance.now() - t0);
  return { n: n, off: off, b64: btoa(s), mk: mk, dk: dk, stat: st };
}
/** 模型的顏色（0～1）⇒ VoxelKit 的色碼（RGB 3-3-2；0 是空格 ⇒ 純黑記成 1）。 */
function rgb332(r, g, b) { var c = (Math.round(clamp(r, 0, 1) * 7) << 5) | (Math.round(clamp(g, 0, 1) * 7) << 2) | Math.round(clamp(b, 0, 1) * 3); return c || 1; }

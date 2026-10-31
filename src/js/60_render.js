// ───────────────────────── 畫 ─────────────────────────
var CUBE = null, DEBVAO = null, DEBBUF = null, PTVAO = null, PTBUF = null, SKYVAO = null, SEAG = null;
function geometry() {
  // 方塊：24 頂點（每面 4 個，各帶法線）
  var F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], V = [], I = [];
  F.forEach(function (n, fi) {
    var a = n[0] ? 0 : n[1] ? 1 : 2, u = (a + 1) % 3, w = (a + 2) % 3;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { var p = [0, 0, 0]; p[a] = n[a] * 0.5; p[u] = c[0] * 0.5; p[w] = c[1] * 0.5; V.push(p[0], p[1], p[2], n[0], n[1], n[2]); });
    var b = fi * 4, flip = (n[a] > 0) ? false : true;
    if (!flip) I.push(b, b + 1, b + 2, b, b + 2, b + 3); else I.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  DEBVAO = gl.createVertexArray(); gl.bindVertexArray(DEBVAO);
  var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
  DEBBUF = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, DEBBUF); gl.bufferData(gl.ARRAY_BUFFER, DINST.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 0); gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 36, 16); gl.vertexAttribDivisor(3, 1);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 36, 32); gl.vertexAttribDivisor(4, 1);
  gl.bindVertexArray(null);
  PTVAO = gl.createVertexArray(); gl.bindVertexArray(PTVAO); PTBUF = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, PTBUF); gl.bufferData(gl.ARRAY_BUFFER, PBUF.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 16); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32); gl.bindVertexArray(null);
  SKYVAO = gl.createVertexArray(); gl.bindVertexArray(SKYVAO); var sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0); gl.bindVertexArray(null);
}
// 海面網格的細緻度（畫質）：seg 一圈幾格、min 最密的網格間距（m）、det 細漣漪幾道。網格間距往外照比例變粗（同心圓，跟透視一樣近密遠疏），到 4 km
var SEA_NZ_P = 0.8;                                                   // 細漣漪每道的相位雜訊（圈；01_gl.js detail）：0 ＝ 以前的畫法（一格一格的菱形格子）；0.8 量過（TASK 單）
var SEA_DBG = {};                                                   // 海面試驗場的覆寫（__game.seaDbg；det 漣漪道數、an 解析浪的法線倍率）—— 平常是空的
var SEA_LV = [{ seg: 96, min: 1.2, det: 4 }, { seg: 160, min: 0.7, det: 8 }, { seg: 256, min: 0.4, det: 14 }];
/** 海面網格（第 lv 檔）：同心圓，頂點 (dx, dz, 那一圈的間距)，離中心 4 km；中心每格跟著鏡頭（render 給 uC）。 */
function seaGrid(lv) {
  var L = SEA_LV[lv], seg = L.seg, f = 2 * Math.PI / seg, R = [0], i, j;
  while (R[R.length - 1] < 4000) { var r0 = R[R.length - 1]; R.push(r0 + Math.max(L.min, r0 * f)); }
  var V = new Float32Array(R.length * seg * 3), I = new Uint32Array((R.length - 1) * seg * 6), q = 0;
  for (i = 0; i < R.length; i++) for (j = 0; j < seg; j++) { var k = (i * seg + j) * 3, a = j * f; V[k] = Math.cos(a) * R[i]; V[k + 1] = Math.sin(a) * R[i]; V[k + 2] = Math.max(L.min, R[i] * f); }
  for (i = 0; i < R.length - 1; i++) for (j = 0; j < seg; j++) { var a0 = i * seg + j, a1 = i * seg + (j + 1) % seg; I[q++] = a0; I[q++] = a0 + seg; I[q++] = a1; I[q++] = a1; I[q++] = a0 + seg; I[q++] = a1 + seg; }
  var g = SEAG || { vao: gl.createVertexArray(), vb: gl.createBuffer(), ib: gl.createBuffer() };
  gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.bufferData(gl.ARRAY_BUFFER, V, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, I, gl.STATIC_DRAW); gl.bindVertexArray(null);
  g.n = I.length; g.lv = lv; g.snap = L.min * 2; g.verts = V.length / 3; SEAG = g;
}
/** 船殼外形（原本的，不管被打掉多少）：每個 (x, z) 最外那一格離中線多遠（格）⇒ 海的著色器拿來判斷「在不在船艙裡」。
 *  這裡只算資料（T.hullHB、寬高）；上 GPU 是所有船型併成一個貼圖陣列（hullArr，畫的時候看到新的船型才重建）。 */
function hullTex(T, hb) {                              // hb ＝ 快取的那張（06_cache.js）
  T.hullTW = T.base.sx; T.hullTH = Math.min(256, T.base.sz);
  T.hullHB = hb || hullMask(T);                        // 存快取、對拍用（__game.hullCheck）
  T.hullSea = hullSeaMask(T);                          // 海的著色器用的那一張（砲口、舷窗補起來）；模擬照舊讀 hullHB
}                                                      // 俯視的頂面（T.hullRoof ＝ hullRoof(T)）在載入的下一步另算（05_hull.js；一型約 0.15–0.25 s，跟這一步擠在一起 ⇒ 那一步變長）
/** 海面遮罩補縫（TASK-0654；Tim 2026-10-16：「炮口進水會變成一個很明顯的長條形」「我發現穿進來的好像是海面」）：
 *  hullMask 是每個 (x, z) 最外那一格 ⇒ 砲口那幾層、砲口那幾欄沒有船殼 ⇒ 半寬掉到 0（量過：憲法號 z 88–108、112–126，例 x 185–187 上下都是 49、中間 0）
 *  ⇒ 海的著色器當成船外，船一沉到砲口高，海面就沿著那幾欄整條橫穿進船艙。
 *  這裡每一欄 x 沿 z 補縫：上下 HULL_FILL_M 公尺內都有船殼 ⇒ 取兩邊較小的那個半寬（缺口補起來，外形的上緣、下緣不往外長）。
 *  ⛔ 只給海面遮罩（hullArr 上傳的貼圖）；進水模擬、游泳、碎帆照舊讀 T.hullHB（一位元不動 ⇒ 戰局不變）。 */
var HULL_FILL_M = 1.5;
function hullSeaMask(T) {
  var TW = T.hullTW, TH = T.hullTH, hb = T.hullHB, R = Math.max(1, Math.ceil(HULL_FILL_M / S)), out = new Uint8Array(hb);
  for (var x = 0; x < TW; x++) for (var z = 0; z < TH; z++) {
    var dn = 0, up = 0;                                                  // z 下面、上面 R 格（不含 z）裡最大的半寬
    for (var k = 1; k <= R; k++) {
      if (z - k >= 0) { var a = hb[(z - k) * TW + x]; if (a > dn) dn = a; }
      if (z + k < TH) { var b = hb[(z + k) * TW + x]; if (b > up) up = b; }
    }
    var f = Math.min(dn, up); if (f > out[z * TW + x]) out[z * TW + x] = f;
  }
  return out;
}
/** 海面遮罩的頂面（Tim 2026-10-30「船舷有高低起伏 低的部分海面會流進來 但是高的地方被擋住 出現破碎狀」）：
 *  hullSea 是側視的外形 ⇒ 甲板上方那幾層的半寬是船舷的 ⇒ 甲板沉到海面下時，船舷高的那幾欄照樣把海挖掉、低的那幾欄（舷門、砲門、舷弧）海畫進來 ⇒ 甲板上一條一條碎掉。
 *  ⇒ 再加一張俯視的圖：每一柱 (x, y) 從上往下第一段實心的頂 ＋ 1（那一段底下隔了 HULL_ROOF_GAP_M 以上的空氣還有船身 ⇒ 桅樓、吊著的小艇這種懸空的，往下接著找），
 *  再填窪（從格的邊往裡、每次從最低的那一柱往四鄰擴：鄰柱 ＝ max(自己, 進來那一柱)）⇒ 每一柱 ＝ 海要從船外漫到這一柱，最少得越過多高：
 *  艙口、梯口 ⇒ 周圍甲板的高（浮著的時候不會從艙口看到底艙的海）；船舷圍著的甲板 ⇒ 船舷最低的那個缺口（海一漫過缺口，整片甲板一起淹）；
 *  沒有甲板的小船、槳帆船 ⇒ 舷緣最低那一點（浮著的時候船艙是乾的）。
 *  🩸 只照頂面（不填窪）⇒ 沒有甲板的船浮著就從船艙裡畫出海（dromon、fusta 量到幾千柱）；方形閉運算補艙口 ⇒ 桅杆到船舷只隔 3.6 m，桅杆那幾欄的甲板整條被補到船舷高（甲板淹了照樣挖一條乾帶）。
 *  船斜著沉 ⇒ 低的那一側先漫過船舷，整片甲板照海面一起淹 —— ⛔ 不是每一點各自等海高過缺口的高度（量過：船舷整圈封閉的船，缺口比甲板高 1–2 m —— Concepción 中位數 1.2 m、Gloire 1.9 m；憲法號有舷門 0.1 m）：
 *  被墊高、填窪值一樣、四鄰相連的柱是一片積水區（面積大的前 255 片編號），每片記最前、最後、最左、最右那四柱；著色器照船現在的姿勢算這四點（在缺口的高度）在世界裡最低的那個，比海面低 ⇒ 整片淹。
 *  🩸 只記一個出口 ⇒ 船左右對稱、兩側一樣高的缺口只記到一側，往另一側傾就淹不進來。
 *  回 3 張 W × sy ＋ 8 列表疊起來（hullArr 照這個順序接在側視外形底下）：頂面、填窪後、積水區編號（0 ＝ 沒有）；表的第 2j、2j ＋ 1 列 ＝ 第 id 片第 j 個極端點的 x ／ qx、y ／ qy（qx、qy ＝ 照船型大小縮成一個位元組，T.hullRoofQ）。
 *  著色器：比頂面低 ⇒ 船艙裡；比填窪高，或那一片的極端點有一個比這裡的海面低 ⇒ 海；0 ＝ 那一柱沒有格（船外）。⛔ 只給海面遮罩（同 hullSeaMask）。 */
var HULL_ROOF_GAP_M = 5;
function hullRoof(T) {
  var B = T.base, W = T.hullTW, TH = T.hullTH, SY = B.sy, n = W * SY, NW = (TH + 31) >> 5, G = Math.round(HULL_ROOF_GAP_M / S), bits = new Uint32Array(n * NW), R = new Uint8Array(n * 3 + 8 * W), out = R.subarray(0, n);
  B.each(function (x, y, z) { if (z < TH && x < W && y < SY) bits[(y * W + x) * NW + (z >> 5)] |= 1 << (z & 31); });
  function find(o, z, set) {                                            // z（含）往下第一格實心（set）／空氣 ⇒ 第幾層；沒有 ⇒ −1
    for (var w = z >> 5; w >= 0; w--) {
      var v = set ? bits[o + w] : ~bits[o + w];
      if (w === z >> 5 && (z & 31) < 31) v &= (1 << ((z & 31) + 1)) - 1;
      if (v) return (w << 5) + 31 - Math.clz32(v);
    }
    return -1;
  }
  for (var c = 0; c < W * SY; c++) {
    var o = c * NW, t = find(o, TH - 1, true);
    while (t >= 0) {
      var b = find(o, t, false), nt = b < 0 ? -1 : find(o, b, true);  // b ＝ 這一段底下第一格空氣、nt ＝ 再往下下一段的頂
      if (nt < 0 || b - nt < G) break;
      t = nt;
    }
    out[c] = t < 0 ? 0 : Math.min(255, t + 1);
  }
  var fo = hullFill(out, W, SY), qx = Math.ceil(W / 256), qy = Math.ceil(SY / 256), lab = new Int32Array(n).fill(-1), st = new Int32Array(n), Ls = [], cx, cy, k;
  R.set(fo, n); T.hullRoofQ = [qx, qy];
  for (c = 0; c < n; c++) {                                             // 積水區：墊高過、填窪值一樣、四鄰相連的一片 ⇒ { n, 四個極端點 [x0 那柱, x1, y0, y1] }
    if (fo[c] <= out[c] || lab[c] >= 0) continue;
    var lk = { n: 0, c: [c, c, c, c], id: 0 }, sp = 0; lab[c] = Ls.length; Ls.push(lk); st[sp++] = c;
    while (sp) {
      var p = st[--sp]; cx = p % W; cy = (p - cx) / W; lk.n++;
      if (cx < lk.c[0] % W) lk.c[0] = p; if (cx > lk.c[1] % W) lk.c[1] = p;
      if (cy < Math.floor(lk.c[2] / W)) lk.c[2] = p; if (cy > Math.floor(lk.c[3] / W)) lk.c[3] = p;
      for (k = 0; k < 4; k++) {
        var d = k === 0 ? (cx > 0 ? p - 1 : -1) : k === 1 ? (cx < W - 1 ? p + 1 : -1) : k === 2 ? p - W : p + W;
        if (d >= 0 && d < n && lab[d] < 0 && fo[d] === fo[c] && fo[d] > out[d]) { lab[d] = lab[c]; st[sp++] = d; }
      }
    }
  }
  var tb = 3 * n, top = Ls.slice().sort(function (a, b) { return b.n - a.n; }).slice(0, Math.min(255, W - 1));   // 面積大的前 255 片編號；排不進去的 ⇒ 0（著色器只照填窪）
  top.forEach(function (lk, i) {
    lk.id = i + 1;
    for (k = 0; k < 4; k++) { var q = lk.c[k], px = q % W; R[tb + 2 * k * W + lk.id] = Math.floor(px / qx); R[tb + (2 * k + 1) * W + lk.id] = Math.floor((q - px) / W / qy); }
  });
  for (c = 0; c < n; c++) if (lab[c] >= 0) R[2 * n + c] = Ls[lab[c]].id;
  T.hullLakes = [Ls.length, top.length ? top[0].n : 0];
  T.hullDecks = top.filter(function (lk, i) { return i < 16 && lk.n >= 0.1 * top[0].n; }).map(function (lk) {   // 甲板（面積到最大那片一成的積水區，前 16 片）：[缺口高, 四個極端點的 x, y]（格；hullUniforms 照它判甲板淹了沒）
    var e = [fo[lk.c[0]]]; lk.c.forEach(function (q) { e.push(q % W + 0.5, Math.floor(q / W) + 0.5); }); return e;
  });
  return R;
}
/** 填窪（0–255 的高度圖，四鄰）：照高度分 256 桶，邊上的柱先進桶，每次從最低的桶拿一柱、四鄰還沒到的 ＝ max(鄰柱, 這一柱) 放進它的桶。
 *  🩸 記「從哪個出口漫進來」分片 ⇒ 填到缺口那一層時，船舷頂等高的每一格都變成新的出口，甲板沿著船舷被切成一條一條（Concepción 船中那片的極端點三個是同一點）⇒ 分片改照連通（hullRoof）。 */
function hullFill(a, W, H) {
  var n = W * H, o = new Uint8Array(a), seen = new Uint8Array(n), nb = new Int32Array(4), next = new Int32Array(n), head = new Int32Array(256).fill(-1), k, c, lv;
  function push(c, v) { o[c] = v; seen[c] = 1; next[c] = head[v]; head[v] = c; }
  for (c = 0; c < n; c++) { var x = c % W, y = (c - x) / W; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) push(c, a[c]); }
  for (lv = 0; lv < 256; lv++) while ((c = head[lv]) >= 0) {
    head[lv] = next[c]; var cx = c % W;
    nb[0] = cx > 0 ? c - 1 : -1; nb[1] = cx < W - 1 ? c + 1 : -1; nb[2] = c >= W ? c - W : -1; nb[3] = c < n - W ? c + W : -1;
    for (k = 0; k < 4; k++) { var d = nb[k]; if (d >= 0 && !seen[d]) push(d, Math.max(a[d], lv)); }
  }
  return o;
}
function hullMask(T) {
  var TW = T.base.sx, TH = Math.min(256, T.base.sz), CY = T.cy, hb = new Uint8Array(TW * TH);
  T.base.each(function (x, y, z) { if (z >= TH) return; var d = Math.min(255, Math.ceil(Math.abs(y + 0.5 - CY))); if (d > hb[z * TW + x]) hb[z * TW + x] = d; });
  return hb;
}
function resize() {
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5), w = Math.max(1, cv.clientWidth * dpr | 0), h = Math.max(1, cv.clientHeight * dpr | 0);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  var k = GFX_RES[GFX.res] || 1;                                       // 解析度（畫質）：場景照這個大小畫，最後縮放貼到畫布
  camSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
}
// ── 畫質管線（TASK-0522；設定在 07_gfx.js 的 GFX） ──
// 場景畫在自己的 framebuffer RT.A（反鋸齒開 ⇒ MSAA 4×），大小 ＝ 畫布 × 解析度；畫完解析到 RT.B、縮放貼到畫布。
// RT.B 也是折射的「海底下那一層」：畫完不透明的東西、畫海之前，A 的顏色與深度複製到 B（GFX.refr ＝ 2），海的著色器讀它。
// 陰影（cascade；shadowPass）：照鏡頭切成幾段距離，一段一層陰影圖（正交投影罩住那一段視錐，從太陽那邊看的深度）：船殼、模型、帆、斷開的那一團、地形、樹、城鎮都畫進去；
//   收的那邊（體素、模型、帆、海、地形、樹、城）照那一點離鏡頭多深挑一段。陰影關 ⇒ 1×1 的假圖（取樣器的型別要對，⛔ 沒綁 ⇒ 畫不出來）。
// 反射：鏡頭對海面（y ＝ 0）鏡像，把船畫進 RT.R（低 1/4、高 1/2 解析度；水面以下丟掉），海照螢幕座標＋法線擾動讀。浪的起伏不進鏡像（擾動蓋過去）。
// ⛔ 這裡不碰模擬的狀態（反向對照見 07_gfx.js）。帆與繩的緩衝（buildRig／sailBuf）一格只做一次，在所有趟之前（prepRig）。
var RT = null, SHM = null, DUMMY = null, PASS = { vp: null, eye: null, clip: -1e9, sh: 1 }, LAST_BOLT = null;
var REFL_VP = new Float32Array(16);                                    // 反射那一趟的 VP（reflPass：M4.mul 同一條算式寫進這一份，S11 ⇒ 每格不配置）
var MIRROR = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), FAR_M = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 1]);
function mkTex(ifmt, fmt, type, w, h, lin, cmp) {
  var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
  var f = lin ? gl.LINEAR : gl.NEAREST; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (cmp) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL); }
  return t;
}
function mkRB(fmt, w, h, s) { var r = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, r); if (s) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, fmt, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, fmt, w, h); return r; }
/** framebuffer：col／dep 是貼圖或 renderbuffer（null ＝ 沒有）。 */
function mkFB(col, dep) {
  var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  function at(pt, o) { if (!o) return; if (o instanceof WebGLTexture) gl.framebufferTexture2D(gl.FRAMEBUFFER, pt, gl.TEXTURE_2D, o, 0); else gl.framebufferRenderbuffer(gl.FRAMEBUFFER, pt, gl.RENDERBUFFER, o); }
  at(gl.COLOR_ATTACHMENT0, col); at(gl.DEPTH_ATTACHMENT, dep);
  if (!col) { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
  var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb: f, col: col, dep: dep, ok: ok };
}
function freeFB(o) { if (!o) return; gl.deleteFramebuffer(o.fb); [o.col, o.dep].forEach(function (x) { if (x instanceof WebGLTexture) gl.deleteTexture(x); else if (x) gl.deleteRenderbuffer(x); }); }
/** 場景、解析、反射的 framebuffer：大小、反鋸齒、反射品質變了才重建。MSAA 建不起來 ⇒ 不反鋸齒（RT.s ＝ 0）。 */
var AA_MAXS = 0;                                                         // 顯示卡的 MAX_SAMPLES：不會變 ⇒ 問一次（跟 CSM_MAXTEX 一樣；⛔ 每格 getParameter）
function targets(w, h) {
  var s = GFX.aa ? Math.min(4, AA_MAXS || (AA_MAXS = gl.getParameter(gl.MAX_SAMPLES) || 0)) : 0, rq = GFX.refl;
  if (RT && RT.w === w && RT.h === h && RT.want === s && RT.rq === rq) return;
  if (RT) { freeFB(RT.A); freeFB(RT.B); freeFB(RT.R); }
  RT = { w: w, h: h, want: s, s: s, rq: rq };
  RT.A = mkFB(mkRB(gl.RGBA8, w, h, s), mkRB(gl.DEPTH_COMPONENT24, w, h, s));
  if (!RT.A.ok && s) { freeFB(RT.A); RT.s = 0; RT.A = mkFB(mkRB(gl.RGBA8, w, h, 0), mkRB(gl.DEPTH_COMPONENT24, w, h, 0)); }
  RT.B = mkFB(mkTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, w, h, true), mkTex(gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, w, h, false));
  if (rq) { var d = rq === 2 ? 2 : 4, rw = Math.max(1, w / d | 0), rh = Math.max(1, h / d | 0); RT.R = mkFB(mkTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, rw, rh, true), mkRB(gl.DEPTH_COMPONENT24, rw, rh, 0)); RT.R.w = rw; RT.R.h = rh; }
  else RT.R = null;
}
/** 陰影圖：深度貼圖陣列（SHM.tex，第 4 號），一段（cascade）一層、大小照畫質（關 ⇒ 1×1 的假圖）；段數 SHM.k ＝ 畫質頁的「段數」（07_gfx.js SHK.count；單張 ＝ 1）、大小 ＝「低／高：陰影圖」。
 *  有陸地 ⇒ 另一個同樣大的陣列 SHM.st：每一層只有陸地（地形、樹、城鎮）的「靜態」深度，那一段的範圍換了、太陽換了方向、或滿 CSM_REFRESH 秒才重畫（csmStatic）；
 *  每一格把它整張複製（blitFramebuffer）到 SHM.tex 那一層、再疊畫船 ⇒ 陸地不用每一格每一段重畫。沒有陸地 ⇒ 不配這一份、每一格清掉再畫船。
 *  SHM.cs[i] ＝ 第 i 段 { F（畫進 SHM.tex 第 i 層）, S（SHM.st 第 i 層）, m（矩陣）, r（半寬）, C（中心）, key, dirty, t（靜態那一層上次畫的時間）, off, bz }。
 *  gen：陣列重配過幾次（靜態那一層裡的東西跟著沒了 ⇒ 要重畫）。 */
// 段數、最遠距離、分界、交界、範圍放大、陰影圖大小、陸地快取、單張還是分段：畫質頁的「陰影細項」（07_gfx.js SHK；Tim 2026-10-21），改了下一格就照新的配。
var CSM_UP = 1500, CSM_DOWN = 400, CSM_REFRESH = 1.0;                    // 深度範圍往太陽那邊多推（高山、桅頂）、往地下多推；陸地快取那一層最久多久重畫一次（秒）
var CSM_SIMPLE = SHK.mode === 0;                                         // 單張陰影（shadowSimple）；畫質頁「陰影細項」的畫法（網址 ?csm=1 ⇒ 分段）。每一格 shadowMaps 照 SHK 更新
// 陰影圖大小（Tim 2026-10-21「是否可以調高一下 中高畫質的陰影解析度(特別是離鏡頭近的部分)」）：中 2048、高 4096（07_gfx.js SHK n1／n2），
//   夾在顯示卡的上限（MAX_TEXTURE_SIZE）、總量 CSM_TEXELS 以內（深度 24 位元一格佔 4 bytes：兩張 4096² ≈ 134 MB）⇒ 分段 4 段的「高」是 2048 一層（4 × 4096² ≈ 268 MB 太多）。
var CSM_TEXELS = 2 * 4096 * 4096, CSM_MAXTEX = 0;
/** 畫質「全開」（陰影第 3 檔；Tim 2026-10-21「繪製陰影&植物距離再多1.5倍」）：分段的最遠距離、單張的範圍 × 1.5；陰影圖與柔邊照「高」。 */
function shFar() { return GFX.shadow >= 3 ? 1.5 : 1; }
function shadowMaps() {
  CSM_SIMPLE = SHK.mode === 0;
  var n = [1, SHK.n1, SHK.n2, SHK.n2][GFX.shadow] || 1, k = CSM_SIMPLE ? 1 : Math.min(CSM_MAX, SHK.count);
  n = Math.min(n, CSM_MAXTEX || (CSM_MAXTEX = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096));
  while (n > 512 && k * n * n > CSM_TEXELS) n /= 2;
  if (SHM && SHM.n === n && SHM.k === k) return;
  if (SHM) shadowFree();
  SHM = { n: n, k: k, on: false, cs: [], tex: null, st: null, stOn: false, layers: 0, gen: 0, rr: 0, splits: [], eye: new Float32Array(3), fw: new Float32Array([0, 0, -1]),
    csD: new Float32Array(CSM_MAX), csL: new Float32Array(CSM_MAX), csW: new Float32Array(CSM_MAX), bs: [], csO: new Float32Array(CSM_MAX), csB: new Float32Array(CSM_MAX), mats: new Float32Array(CSM_MAX * 16), stat: { redraws: 0, last: null, ms: 0 } };
}
function shadowFree() {
  SHM.cs.forEach(function (c) { gl.deleteFramebuffer(c.F.fb); if (c.S) gl.deleteFramebuffer(c.S.fb); });
  if (SHM.tex) gl.deleteTexture(SHM.tex); if (SHM.st) gl.deleteTexture(SHM.st);
  SHM.cs = []; SHM.tex = SHM.st = null; SHM.layers = 0; SHM.stOn = false; SHM.gen++;
}
/** 一個深度貼圖陣列（k 層、比較模式 ⇒ sampler2DArrayShadow）。 */
function csmArr(k) {
  var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.DEPTH_COMPONENT24, SHM.n, SHM.n, k, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, gl.LINEAR); });
  [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, gl.CLAMP_TO_EDGE); });
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  return t;
}
function csmFB(t, k) {
  var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, t, 0, k); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb: f, ok: ok };
}
/** 陰影圖陣列照段數配；有陸地才多配靜態那一份（第一次看到陸地 ⇒ 重配）。 */
function shadowGrow() {
  var st = !CSM_SIMPLE && SHK.cache === 1 && landWant();              // 單張、分段沒開陸地快取：每一格整張重畫 ⇒ 不要靜態那一份
  if (SHM.layers >= SHM.k && (SHM.stOn || !st)) return;
  shadowFree();
  SHM.tex = csmArr(SHM.k); if (st) SHM.st = csmArr(SHM.k); SHM.stOn = st;
  for (var i = 0; i < SHM.k; i++) SHM.cs.push({ F: csmFB(SHM.tex, i), S: st ? csmFB(SHM.st, i) : null, m: FAR_M, r: 0, C: [0, 0, 0], key: '', dirty: true, t: -1e9, off: 0, bz: 0, bare: undefined });   // bare：那一層現在只有靜態那一份（那一份的 t；沒有陸地 ⇒ −1）、沒有船
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  SHM.layers = SHM.k;
}
/** GPU 的格這一格給哪幾艘（Tim 2026-10-13：「優先選最近的 N 條船」「只選視野範圍內最近的」；N 是畫質設定）：
 *  （陰影 2026-10-20 起改成照鏡頭分段（shadowPass），不再每艘一格）
 *  · MSLOTS：船艙遮罩與透視，GFX.masks 艘（0～MASK_NEAR）；排不進去的沒有。
 *  船數 ≤ N ⇒ 全部、照 SHIPS 的順序（一對一跟以前一樣）；否則 ⇒ 外接球碰到鏡頭視錐的船裡離鏡頭最近的 N 艘，
 *  上一格已經在裡面的打九折（⛔ 不打折 ⇒ 兩艘差不多遠時每一格換來換去、遮罩閃）；選到的照 SHIPS 的順序排。 */
var MSLOTS = [];
MSLOTS.rest = [];
function gpuSlots() {
  var cand = null;
  function pick(n, prev) {
    var L;
    if (SHIPS.length <= n) L = SHIPS.slice();
    else {
      if (!cand) {
        var vp = CAM.vp, pl = [];                                         // 視錐的六個面（列優先的矩陣：第 r 列 ＝ vp[r], vp[4+r], vp[8+r], vp[12+r]）
        [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]].forEach(function (q) {
          var a = [0, 1, 2, 3].map(function (c) { return vp[c * 4 + 3] + q[1] * vp[c * 4 + q[0]]; }), l = Math.hypot(a[0], a[1], a[2]) || 1;
          pl.push(a.map(function (v) { return v / l; }));
        });
        cand = SHIPS.map(function (s) {
          var B = s.T.base, R = s.T.shR || (s.T.shR = 0.5 * S * Math.hypot(B.sx, B.sy, B.sz)), c = M4.pt(s.M, B.sx / 2, B.sy / 2, B.sz / 2);
          return { s: s, vis: s.sink <= 40 && pl.every(function (p) { return p[0] * c[0] + p[1] * c[1] + p[2] * c[2] + p[3] > -R; }), d: Math.hypot(c[0] - CAM.eye[0], c[1] - CAM.eye[1], c[2] - CAM.eye[2]) };
        });
      }
      L = cand.filter(function (o) { return o.vis; }).map(function (o) { return { s: o.s, d: o.d * (prev.indexOf(o.s) >= 0 ? 0.9 : 1) }; })
        .sort(function (a, b) { return a.d - b.d || a.s.i - b.s.i; }).slice(0, n).map(function (o) { return o.s; }).sort(function (a, b) { return a.i - b.i; });
    }
    L.rest = SHIPS.filter(function (s) { return L.indexOf(s) < 0; });
    return L;
  }
  MSLOTS = pick(Math.min(GFX.masks, MASK_NEAR), MSLOTS);
}
function ortho(r, n, f, ry) { return new Float32Array([1 / r, 0, 0, 0, 0, 1 / (ry || r), 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]); }   // ry：上下的半寬另給（分段陰影的長方形；沒給 ⇒ 正方形）
/** 帆與繩的緩衝：一格最多做一次（之後陰影、反射、場景都用同一份）；沒走模擬的那一格不重做。 */
function prepRig() {
  floopTick();                                                          // 循環布（11_rig_loop.js）：還在烘就烘一小段
  for (var i = 0, ns = SHIPS.length, n = ns + PIECES.length; i < n; i++) {   // 船、再斷開的那一團（⛔ SHIPS.concat(PIECES)：每格一個新陣列）
    var ow = i < ns ? SHIPS[i] : PIECES[i - ns], dirty = ow.rigDirty;
    if (dirty) buildRig(ow);
    if (ow.sink > 40) continue;
    var tb = DEBUG ? performance.now() : 0, live = PHYS && ow.crew, same = live && rigSame(ow) && !dirty;   // rigSame 每一格都比（記下重做那一刻的輸入）
    // 這一格沒走模擬（暫停、慢動作、高更新率的空格、__game.cam）⇒ 帆與垂繩的輸入一個都沒變 ⇒ 上一份照用（11_rig_gpu.js rigSame）
    if (dirty || (live && !same)) { sailBuf(ow); if (!live) ow.sbK = null; }   // 物理開著：船上的帆照模擬每一步重做（只傳動的；靜的、索引變了才傳）；斷開的那一團是靜態的。沒開物理時重做的 ⇒ 之後開了一定重做
    if (live && !same) looseBuf(ow);
    if (RIG_CHK && (dirty || live)) rigChk(ow, live);                // ?rigchk=1：重做的那一格驗動靜分開傳的那一份、沒重做的那一格驗上一份
    if (ow.anc) chainBuf(ow);                                         // 鐵鍊（76_anchor.js；跟帆繩物理開關無關；用內插過的 sh.inv ⇒ 每一格做）
    if (i < ns) poleBuf(ow);                                          // 陣營旗的旗桿（77_colours.js；旗面是帆，上面 sailBuf 一起畫）
    if (ow.fx) floopFxFrame(ow);                                      // 循環布：這一格的下風方向、風速檔位、帆桁轉角（只是 uniform，不重做緩衝）
    if (DEBUG) PROF.buf += performance.now() - tb;
  }
}
// 重網格化（TASK-0531）：打掉的格要重建那幾個區塊的網格（VoxelKit RegionSet：dirty 裡的區塊 → meshChunk → 那一區重新上傳）。
//   畫面迴圈每一格最多 RM_BUDGET 塊（殉爆、斷船一次上千塊 ⇒ 那一格卡 170 ms）；先做斷開的那幾團（新建的）、再做船
//   ⇒ 半截船先長出來、船身那邊才拿掉 ⇒ 中間那幾格只會兩份疊在一起（位置一樣、看不出來），不會開洞。
//   快轉（__game.run、?demo）一次做完（remesh(Infinity)）⇒ 縮圖不變。只動畫面：格子本身在模擬那一步就改好了。
//   ⛔ 不改 VoxelKit：RegionSet.dirty 是公開的 Set，這裡先把超出預算的拿出來、flush 完再放回去。
var RM_BUDGET = 96;
function rsAllDirty(rs) { var t = rs.grid.tab; for (var i = 0; i < t.length; i++) if (t[i] !== null) rs.dirty.add(i); }   // 新建的一團：整份排進去（＝ buildAll，只是分批）
function rsFlushSome(rs, n) {
  var k = rs.dirty.size; if (k <= n) { rs.flush(); return k; }
  var rest = [], j = 0;
  rs.dirty.forEach(function (i) { if (j++ >= n) rest.push(i); });
  rest.forEach(function (i) { rs.dirty.delete(i); }); rs.flush(); rest.forEach(function (i) { rs.dirty.add(i); });
  return n;
}
function remesh(budget) {
  var left = budget;
  PIECES.concat(SHIPS).forEach(function (o) { if (left > 0 && o.rs.dirty.size) left -= rsFlushSome(o.rs, left); });
  var sl = budget === Infinity ? Infinity : SM_FRAME;                    // 平滑面（15_smooth.js）：一區比一塊貴 ⇒ 另外算，每一格最多 SM_FRAME 區
  SHIPS.forEach(function (sh) { if (sl > 0 && sh.smD && sh.smD.size) sl -= smFlush(sh, sl); });
  SHIPS.forEach(function (sh) { if (sh.arm) { var r = armRemesh(sh, left, sl); left = r[0]; sl = r[1]; } });   // 砲帶的裝甲（24_armor.js）：船殼排完才輪到
}
function drawHulls(prog, pd) {                                         // pd：哪一趟（60_rbatch.js RBAT.pd）；陰影那一段只畫 csmIn 判進那一段的（RBAT.cs 的第 k 位 ＝ pd.b）；反射、主畫面只畫 viewVis 判看得到的（第 4、5 位；關著 ⇒ pd.b ＝ 0 ⇒ 全畫）
  var b = pd.b, cs = RBAT.cs;
  SHIPS.forEach(function (sh, i) { if (sh.sink > 40 || (b && !(cs[i] & b))) return; cutSet(prog, sh); vlampSet(prog, sh); gl.uniformMatrix4fv(prog.u.uModel, false, sh.M); rbatHull(sh.rs, sh.T.pristine); if (sh.arm) armDraw(prog, sh); });   // cutSet：剖面與隱藏甲板（74_cutaway.js）；rbatHull：沒被打到的區照船型的合併緩衝一段一次畫（60_rbatch.js，S8）；armDraw：砲帶的裝甲（24_armor.js，跟著砲轉）
  cutSet(prog, null); vlampSet(prog, null);
  PIECES.forEach(function (pc, j) { if (b && !(cs[RBAT.ns + j] & b)) return; gl.uniformMatrix4fv(prog.u.uModel, false, pc.M); pc.rs.draw(); });
}
var RFR = 0;                                                           // 第幾次 render()（frameBegin 加一）：模型的表（60_rbatch.js rbatPrep）、地形網格（bedBuild）、陰影的紀錄照它
/** 模型那一段：船的模型、裝飾、平滑面（15_smooth.js）、裝甲的平滑面（24_armor.js），斷開的那一團的模型，飛出去的模型 ——
 *  照這一格的表畫（60_rbatch.js：frameBegin 的 rbatPrep 整理一次、每一趟 rbatReplay 照 GL 以前的呼叫順序重播；以前每一趟自己走一遍、矩陣靠 modelWorld 快取）。 */
function drawModels(prog, pd) {
  if (prog === P.tri && RBAT_INST && P.triI && !cutOn()) rbatColour(pd);   // 反射、主畫面：同一艘裡離得夠開的同一份網格一次畫（60_rbatch.js，S7）；剖面開著、?inst=0、編不起來 ⇒ 照表一個一個畫
  else rbatReplay(prog, pd);
}
/** 燈（餘燼號船尾三盞燈籠 meta kind=lantern、夜燈號船首像的提燈 kind=light）：燈罩發光、光暈、點光源。 */
function isLamp(m) { return !!(m.meta && (m.meta.kind === 'lantern' || m.meta.kind === 'light')); }
/** 火焰在哪（船的格座標）：固定點 wick（造船規格：火焰中心）；沒有 ⇒ 模型中心。 */
function lampAt(m) { return m.pts && m.pts.wick ? m.pts.wick : m.c; }
/** 這一格的點光源（01_gl.js LAMP_GLSL）：離鏡頭近的 LAMP_N 盞；亮度跟著燈晃、天越暗越亮（跟光暈同一條）。只給人看、不抽 rnd()。 */
var LAMPS = { n: 0, p: new Float32Array(LAMP_N * 4), c: new Float32Array(LAMP_N * 4) }, LAMP_R = 6, LAMP_I = 0.5;
/** 船殼上的燈（格子，config ships[].lamps：at ＝ 中心（格座標）、r ＝ 半徑幾格、color ＝ 發光的那種格子（rgb332 代碼）、rgb ＝ 光色）還亮著嗎：中心旁 3×3×3 還有格子。 */
function vlampOn(sh, L) { var x = Math.floor(L.at[0]), y = Math.floor(L.at[1]), z = Math.floor(L.at[2]); for (var dz = -1; dz <= 1; dz++) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (sh.grid.get(x + dx, y + dy, z + dz)) return true; return false; }
var VLAMP_U = { p: new Float32Array(VLAMP_N * 4), c: new Float32Array(VLAMP_N * 4), l: new Float32Array(VLAMP_N) };   // l：每盞點了幾成（船殼上的燈 ＝ shipLit()；著火的火光 ＝ 1）
/** 畫這艘船的船殼前：它的燈（亮著的）給著色器；ow ＝ null（斷開的那一團、陰影那一趟）⇒ 0 盞。 */
function vlampSet(prog, sh) {
  if (!prog.u.uVGN) return;
  var Ls = sh && !sh.sunk ? sh.vlamps : null, n = Ls ? Math.min(VLAMP_N, Ls.length) : 0, p = VLAMP_U.p, c = VLAMP_U.c;
  gl.uniform1i(prog.u.uVGN, n); if (!n) return;
  for (var i = 0, k = 0, lit = shipLit(); i < n; i++, k += 4) { var L = Ls[i]; p[k] = L.at[0]; p[k + 1] = L.at[1]; p[k + 2] = L.at[2]; p[k + 3] = L.r; c[k] = L.rgb[0]; c[k + 1] = L.rgb[1]; c[k + 2] = L.rgb[2]; c[k + 3] = L.color; VLAMP_U.l[i] = i < sh.vlampN ? lit : 1; }   // 逐個寫（⛔ 每盞兩個暫時的陣列）
  gl.uniform4fv(prog.u.uVG, VLAMP_U.p); gl.uniform4fv(prog.u.uVGC, VLAMP_U.c); gl.uniform1f(prog.u.uVGK, 0.85 + 0.1 * Math.sin(SIMT * 1.3)); if (prog.u.uVGL) gl.uniform1fv(prog.u.uVGL, VLAMP_U.l);
}
function lampsUpdate() {
  var L = [], E = CAM.eye, lit = shipLit();                          // lit：船燈點了幾成（08_weather.js；白天 0 ⇒ 船燈不佔點光源的名額）
  SHIPS.forEach(function (sh) {
    if (sh.sink > 40) return;
    sh.vlamps = lit ? (sh.T.lamps || []).filter(function (V) { return vlampOn(sh, V); }) : [];   // 船殼上的燈：被打掉 ⇒ 熄（發光、點光源、光暈一起）
    sh.vlampN = sh.vlamps.length;                                     // 前 vlampN 盞是船殼上的燈（照 lit），後面 burnLamps 加的火光照舊全亮
    sh.vlamps.forEach(function (V, j) { var w = M4.pt(sh.M, V.at[0], V.at[1], V.at[2]); L.push({ w: w, k: (0.9 + 0.1 * Math.sin(SIMT * 1.3 + j)) * lit, rgb: V.rgb, d: (w[0] - E[0]) * (w[0] - E[0]) + (w[1] - E[1]) * (w[1] - E[1]) + (w[2] - E[2]) * (w[2] - E[2]) }); });
    if (sh.burn) burnLamps(sh, L, E);                                 // 著火（59_burnfx.js）：最大的幾個火場也當成船殼上的燈（燒著的格發光、光暈）＋點光源；燒著的帆一盞
    if (lit) sh.models.forEach(function (m) { if (!m.alive || !isLamp(m)) return; var q = lampAt(m), w = M4.pt(sh.M, q[0], q[1], q[2]); L.push({ w: w, k: lampGlow(m), d: (w[0] - E[0]) * (w[0] - E[0]) + (w[1] - E[1]) * (w[1] - E[1]) + (w[2] - E[2]) * (w[2] - E[2]) }); });
  });
  var pl = fpLamp(); if (pl) L.push(pl);                               // 第一人稱的玩家自帶一盞燈（81_fps.js fpLamp；d −1 ⇒ 排第一個，一定有名額）
  L.sort(function (a, b) { return a.d - b.d; });
  LAMPS.n = Math.min(LAMP_N, L.length);
  for (var i = 0; i < LAMPS.n; i++) {
    var l = L[i], I = l.I !== undefined ? l.I : LAMP_I * l.k * (1.6 - wxLum());   // l.I：自己給亮度的燈（玩家的燈：艙裡白天也暗，不照天色）
    var cl = l.rgb || [1, 0.62, 0.25];                                 // 模型的燈 ＝ 暖橘；船殼上的燈照 config 的光色
    LAMPS.p.set([l.w[0], l.w[1], l.w[2], l.R || LAMP_R], i * 4); LAMPS.c.set([cl[0] * I, cl[1] * I, cl[2] * I, 0], i * 4);
  }
}
/** 燈籠／提燈：亮度 0.8–1 慢慢晃，照模擬時間與燈的編號（⛔ 不抽 rnd()：只給人看）；打飛了就熄。 */
function lanternK(m) { var t = SIMT * 1.7 + m.k * 2.39; return 0.8 + 0.1 * Math.sin(t) + 0.1 * Math.sin(t * 2.71 + 1.3); }
/** 燈罩發光（uGlow）、點光源用的亮度：晃動 × 點了幾成（shipLit；沒開世界時間 ⇒ × 1，一位元不變）。 */
function lampGlow(m) { return lanternK(m) * shipLit(); }
function lanternHalo(push) {
  var lit = shipLit();                                                // 船燈點了幾成：光暈整個乘（白天 0 ⇒ 不畫）；著火的火光照舊
  SHIPS.forEach(function (sh) {
    if (sh.sink > 40) return;
    (sh.vlamps || []).forEach(function (V, j) { var k = 0.9 + 0.1 * Math.sin(SIMT * 1.3 + j), f = j < sh.vlampN ? lit : 1; push(M4.pt(sh.M, V.at[0], V.at[1], V.at[2]), V.r * S * (2.4 + 0.4 * k) * (V.ha || 1), V.rgb, (0.18 + 0.2 * k * (1.6 - wxLum())) * f); });   // 船殼上的燈的光暈（照它的光色）
    if (lit) sh.models.forEach(function (m) {
      if (!m.alive || !isLamp(m)) return;
      var k = lanternK(m), sz = Math.max(m.bb[3] - m.bb[0], m.bb[5] - m.bb[2]) * S, q = lampAt(m);   // 燈多大（公尺）；光暈在火焰那一點
      push(M4.pt(sh.M, q[0], q[1], q[2]), sz * (2.4 + 0.4 * k), [1, 0.6, 0.2], (0.18 + 0.2 * k * (1.6 - wxLum())) * lit);   // 天越暗越亮（暴風雨的 lum 比晴天低）
    });
  });
}
function drawSails(prog, pd) {                                         // pd：同 drawHulls
  if (prog.u.uSailT) gl.uniform1i(prog.u.uSailT, SAIL_UNIT);           // 帆的貼圖集（TASK-0579；11_rig_gpu.js sailTex）：固定第 9 號
  if (prog.u.uFireT) gl.uniform1f(prog.u.uFireT, BURN.sailBurn);      // 帆燒到穿要幾秒（01_gl.js BURN_GLSL；49_burn.js）
  var fx = floopFxProg(prog), FX = null;                               // 循環布（11_rig_loop.js）：繩帆固定的船改用變體、排到最後畫（還沒烘好、編不過 ⇒ null，照以前）
  for (var i = 0, ns = SHIPS.length, n = ns + PIECES.length, b = pd.b, bt = null; i < n; i++) {   // 船、再斷開的那一團（⛔ SHIPS.concat(PIECES)：每輪一個新陣列）；i ＝ RBAT 的 owner 順序
    var ow = i < ns ? SHIPS[i] : PIECES[i - ns];
    if (ow.sink > 40 || !ow.sb || !ow.sb.n || (b && !(RBAT.cs[i] & b))) continue;
    if (fx && ow.fx && ow.sb.fxOn) { (FX || (FX = [])).push(ow); continue; }
    cutSet(prog, ow); gl.uniformMatrix4fv(prog.u.uModel, false, ow.M);
    var st = ow.T && ow.T.sailTexGL;                                    // 第 9 號：這一趟上次綁的就是這張（同一型的船）⇒ 不再綁（bt；S3）。還沒建、沒有貼圖集 ⇒ 照以前每次 sailTex（第一次建在第 9 號上）
    if (!st || st !== bt) { gl.activeTexture(gl.TEXTURE0 + SAIL_UNIT); gl.bindTexture(gl.TEXTURE_2D, bt = sailTex(ow.T)); gl.activeTexture(gl.TEXTURE0); }
    gl.bindVertexArray(ow.sb.vao); gl.drawElements(gl.TRIANGLES, ow.sb.n, gl.UNSIGNED_INT, 0);
  }
  if (!FX) return;
  gl.useProgram(fx.prog); setCommon(fx); floopBind(fx);                // 同一趟（PASS 的矩陣、影子、剪裁）換成變體
  if (fx.u.uSailT) gl.uniform1i(fx.u.uSailT, SAIL_UNIT); if (fx.u.uFireT) gl.uniform1f(fx.u.uFireT, BURN.sailBurn);
  bt = null;
  FX.forEach(function (ow) {
    cutSet(fx, ow); gl.uniformMatrix4fv(fx.u.uModel, false, ow.M); floopFxSet(fx, ow);
    var st = ow.T && ow.T.sailTexGL;
    if (!st || st !== bt) { gl.activeTexture(gl.TEXTURE0 + SAIL_UNIT); gl.bindTexture(gl.TEXTURE_2D, bt = sailTex(ow.T)); gl.activeTexture(gl.TEXTURE0); }
    gl.bindVertexArray(ow.sb.vao); gl.drawElements(gl.TRIANGLES, ow.sb.n, gl.UNSIGNED_INT, 0);
  });
  gl.useProgram(prog.prog);
}
/** 每一段的遠端（離鏡頭多深，公尺）與開始跟下一段混的地方：畫質頁設的分界、交界（07_gfx.js shkSplits；預設 60／145／375／1,500 m，跟以前 practical split 0.85 的 4 段差不多）。 */
function csmSplits() { var o = shkSplits(); SHM.bs = o.bs; return o.far; }
/** 陰影（cascade；Tim 2026-10-20「改用其他遊戲常見的 shadow cascades 取代每艘船自己的陰影(且陸地也吃得到)」「基於Camera配置陰影」）：
 *  1. 鏡頭的視錐照深度切 SHM.k 段（csmSplits：畫質頁的分界；下一段從上一段的交界開始畫 ⇒ 收的那邊混兩段的那一帶兩段都有）。
 *  2. 每段的範圍（2026-10-24 重寫，TASK-0877；Tim「Shadow map會超出Camera範圍(特別是精度最高的一個)」「不同層級的Map重疊嚴重 且有時還會斷開」「是否可以參考現成的算法」）：
 *     那一段視錐（8 個角）先用場景的高度帶裁（csmBand：csmFit 沿線量到那一段的地面最低～最高＋上面可能有的東西）—— 空中、地底收不到影子，不算；
 *     剩下的那一塊在太陽座標裡取緊的長方形（右、上兩軸各自的半寬 rx、ry ＝ 那一塊的一半 × 邊上留 CSM_MARGIN 格 × 畫質頁的「範圍放大」SHK.pad）。
 *     參考 DX SDK CascadedShadowMaps11 的 fit to cascade（每段只罩自己那一段視錐）＋ SDSM 照場景收緊（這裡用 CPU 沿線量代替讀深度圖）。
 *     以前是整段視錐的外接球、正方形：球裡大半是空中與鏡頭背後，鏡頭一拉高，第 0 段只罩到海面上那層空中；高的俯視四段的球幾乎一樣大、疊在同一個地方
 *     （同一組鏡頭量：每一點平均被 2.6～4.0 張圖罩住；Tim 2026-10-24 截圖：紅框一大半在鏡頭外）。
 *  3. 不閃（stable cascades 的做法）：半寬走一級 2^(1/CSM_Q)（約 9%）的階梯（csmStep），要的比現在大 ⇒ 換大一級；比現在小 CSM_HYST 級以上才換小；
 *     中心對齊陰影圖的格子（右、上兩軸各照自己的格子大小），要的那一塊還在現在的範圍裡 ⇒ 中心不動、矩陣不換；朝太陽那一軸對齊 64 m、留半個 CSM_UP／CSM_DOWN 的餘裕。
 *     ⇒ 鏡頭平移：影子的邊不爬不閃；轉鏡頭：範圍一級一級換（換的那一格格子的位置變一次），不是每一格連續變。
 *  4. 收的那邊（01_gl.js shSel）用第一張罩得到那一點的圖（DX SDK 的 map-based selection）：近的幾張格子細，罩到哪裡就用到哪裡（以前照深度挑段，
 *     第 0、1 段的圖罩著畫面下緣的海也用不到）；高度帶量漏的塔、山不在前一張裡 ⇒ 落到下一張，不會整塊沒影子。在圖最外面「交界」那一圈跟下一張混。
 *     所以每一段要畫的船只照範圍判，不照那一段的深度（csmIn 的 d0 ＝ −∞，d1 ＝ 最遠距離）。這一段裁完什麼都不剩（整段在天上）⇒ 那一層不用（FAR_M），著色器自然用下一張。
 *  5. 矩陣換了（中心換一步、範圍換一級、太陽換方向、陣列重配）⇒ 那一段的靜態那一層（陸地）要重畫；矩陣沒換但滿 CSM_REFRESH 秒（樹、城、地形塊陸續載進來）⇒ 一格最多補一段。
 *  6. 每一格每一段：靜態那一層複製過來（沒有陸地 ⇒ 清掉），再畫船殼、模型、帆、斷開的那一團 —— 只畫落在那一段範圍裡的（太陽方向看過去的投影）。 */
var CSM_Q = 8, CSM_HYST = 2, CSM_MARGIN = 6;                             // 半寬一級 2^(1/8)；比現在小 2 級才換小；長方形的邊上留 6 格（柔邊取樣、沿法線推出去的那一點也要在圖裡）
// 陰影圖的「上」跟著鏡頭轉：一圈分幾級（?csmrot=16 ⇒ 22.5° 一級；預設 0 ＝ 不轉，固定照太陽）。2026-10-24 托爾圖加 4 種鏡頭 × 8 個方位平均量：16 級只有很高的俯視（1,500 m、仰角 0.9）
//   每一段的面積再小約 30%，其他三種差不多或略大（量化一級最多偏 17°，橫的帶子一歪外框就寬）—— 換來轉鏡頭時一圈換 16 次格子 ⇒ 不值得，預設關。
var CSM_ROT = Q.has('csmrot') ? +Q.get('csmrot') | 0 : 0;
/** 半寬照階梯（見上 3.）：現在的還夠、又沒大太多 ⇒ 不換；不然換成剛好夠的那一級。 */
function csmStep(cur, need) {
  if (cur && need <= cur && need > cur * Math.pow(2, -CSM_HYST / CSM_Q)) return cur;
  return Math.pow(2, Math.ceil(Math.log2(Math.max(1, need)) * CSM_Q) / CSM_Q);
}
// 一段視錐的 12 條稜（Q8 照 rays 的順序：第 j 條線的近端 2j、遠端 2j+1；rays ＝ 左下、右下、左上、右上）
var CSM_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [2, 6], [6, 4], [4, 0], [1, 3], [3, 7], [7, 5], [5, 1]];
/** 一段視錐裁到高度帶 [lo, hi] 剩下的那一塊的頂點（凸多面體跟兩個水平面的交：帶裡的角＋稜跟兩個面的交點）；整段都在帶外 ⇒ 空的。 */
function csmClip(Q, lo, hi) {
  var out = [];
  Q.forEach(function (p) { if (p[1] >= lo && p[1] <= hi) out.push(p); });
  CSM_EDGES.forEach(function (e) {
    var a = Q[e[0]], b = Q[e[1]];
    [lo, hi].forEach(function (Y) { if ((a[1] - Y) * (b[1] - Y) < 0) { var t = (Y - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, Y, a[2] + (b[2] - a[2]) * t]); } });
  });
  return out;
}
function shadowPass() {
  if (!CAM.inv) { SHM.on = false; return; }                             // 鏡頭還沒算過（第一格）
  var t0 = performance.now(), k = SHM.k, sp = SHM.splits = csmSplits(), bs = SHM.bs, I = CAM.inv, landA = landWant(), land = SHM.stOn && SHK.cache === 1 && landA, now = t0 / 1000;
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);   // 照自己要的狀態畫，不靠前一個畫法留下來的（清、寫深度都要 depthMask）
  gl.disable(gl.CULL_FACE); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
  gl.viewport(0, 0, SHM.n, SHM.n);
  csmOwners();                                                          // 每個船、斷開的那一團的外接球：這一格算一次（csmIn 每一段只查）
  if (CSM_SIMPLE) { shadowSimple(); PASS.vp = null; gl.disable(gl.POLYGON_OFFSET_FILL); return; }
  // 視錐的四條稜（近裁切面的角 ⇒ 遠裁切面的角）；鏡頭往前 ＝ 兩個面中心的連線
  function un(x, y, z) { var w = I[3] * x + I[7] * y + I[11] * z + I[15], p = M4.pt(I, x, y, z); return [p[0] / w, p[1] / w, p[2] / w]; }
  var E = CAM.eye, nc = un(0, 0, -1), fc = un(0, 0, 1), fw = [fc[0] - nc[0], fc[1] - nc[1], fc[2] - nc[2]], fl = Math.hypot(fw[0], fw[1], fw[2]) || 1;
  fw = [fw[0] / fl, fw[1] / fl, fw[2] / fl];
  function dep(p) { return (p[0] - E[0]) * fw[0] + (p[1] - E[1]) * fw[1] + (p[2] - E[2]) * fw[2]; }
  var rays = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(function (q) { var a = un(q[0], q[1], -1), b = un(q[0], q[1], 1); return { a: a, b: b, da: dep(a), db: dep(b) }; });
  function at(R, d) { var t = (d - R.da) / (R.db - R.da); return [R.a[0] + (R.b[0] - R.a[0]) * t, R.a[1] + (R.b[1] - R.a[1]) * t, R.a[2] + (R.b[2] - R.a[2]) * t]; }
  // 太陽那個方向的座標軸（跟矩陣的 lookAt 同一個 up ⇒ 對齊的格子就是陰影圖的格子）
  var up0 = Math.abs(SUN[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0], V0 = M4.lookAt([SUN[0], SUN[1], SUN[2]], [0, 0, 0], up0);
  var ax = [[V0[0], V0[4], V0[8]], [V0[1], V0[5], V0[9]], [V0[2], V0[6], V0[10]]];
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  // 陰影圖的「上」跟著鏡頭朝向轉（view-aligned light space，TASK-0877）：每一段裁過高度帶之後在畫面上是一條橫的帶子，太陽座標的格子是斜的 ⇒ 外框比帶子大一圈、段跟段的外框互相疊；
  //   轉到「上」＝ 鏡頭往前在太陽那個平面上的投影 ⇒ 帶子跟格子同向。轉的角度量化成 CSM_ROT 一級、偏過一級的 3/4 才換（遲滯）⇒ 轉鏡頭時一圈最多換 CSM_ROT 次（換的那一格格子的位置變一次），平移不受影響。
  var rfx = dot3(fw, ax[0]), rfy = dot3(fw, ax[1]);
  if (CSM_ROT && Math.hypot(rfx, rfy) > 0.05) {                           // 鏡頭幾乎順著太陽看 ⇒ 投影太短，照上一次的
    var rth = Math.atan2(rfx, rfy), rst = Math.PI * 2 / CSM_ROT, rq = SHM.rot;
    if (rq === undefined || Math.abs((rth - rq * rst + 3 * Math.PI) % (2 * Math.PI) - Math.PI) > rst * 0.75) rq = SHM.rot = Math.round(rth / rst);
  }
  if (CSM_ROT && SHM.rot) {
    var rc = Math.cos(SHM.rot * Math.PI * 2 / CSM_ROT), rs = Math.sin(SHM.rot * Math.PI * 2 / CSM_ROT);
    up0 = [0, 1, 2].map(function (j) { return ax[1][j] * rc + ax[0][j] * rs; }); V0 = M4.lookAt([SUN[0], SUN[1], SUN[2]], [0, 0, 0], up0);
    ax = [[V0[0], V0[4], V0[8]], [V0[1], V0[5], V0[9]], [V0[2], V0[6], V0[10]]];
  }
  var sk = SUN.map(function (v) { return v.toFixed(4); }).join(',') + ';' + SHK.nrm + ',' + SHK.bias + ';' + (CSM_ROT ? SHM.rot || 0 : '');   // 太陽方向＋沿法線推、深度偏差（畫質頁改了 ⇒ 矩陣、偏移重算）＋轉了幾級
  SHM.eye.set(E); SHM.fw.set(fw);
  var DD = SHK.dist * shFar(), fit = csmFit(un, fw, DD), z0 = SHM.z0 = SHK.fit ? fit[0] : 0, z1 = SHM.z1 = SHK.fit ? Math.max(z0 + 20, fit[1]) : DD, zk = shFar();   // 分段貼合畫面（見 csmFit；關著也要量高度帶）
  // 每一段多長照畫質頁的公尺數、從 z0 起算，z1 只截掉超過的（超過的段是空的）—— ⛔ 不照比例縮進 [z0, z1]（Tim 2026-10-24：甲板上鏡頭只抬一點點解析度差很多 ——
  //   畫面上緣碰不到海平線 ⇒ z1 從 1500 塌成 64，縮進去的第 0 段從 60 m 變 2.6 m，一格之內解析度差十倍）
  sp = SHM.splits = sp.map(function (v, j) { return j === k - 1 ? z1 : Math.min(z1, z0 + v * zk); }); bs = SHM.bs = bs.map(function (v) { return Math.min(z1, z0 + v * zk); });
  var refreshed = false, sl = Math.min(400, 1 / Math.max(0.15, SUN[1] / Math.sqrt(Math.max(1e-6, 1 - SUN[1] * SUN[1]))));   // 影子拉多長（每公尺高；太陽越低越長，最多 400 倍 ⇒ 實際上限見 csmIn）
  var n = SHM.n, mg = n / (n - 2 * CSM_MARGIN) * SHK.pad;
  for (var i = 0; i < k; i++) {
    var c = SHM.cs[i]; if (!c) continue;
    var d0 = i ? bs[i - 1] : z0, d1 = sp[i], Q8 = [];
    rays.forEach(function (R) { Q8.push(at(R, Math.max(d0, R.da))); Q8.push(at(R, Math.min(d1, R.db))); });
    var yb = csmBand(d0, d1), P = d1 - d0 < 1 ? [] : csmClip(Q8, yb[0], yb[1]);   // 整段在 z1 之後（前一段已經罩到畫面上最遠的地面）⇒ 空的
    if (!P.length) {                                                     // 整段在天上（或地底）：這一層不用，收的那邊往下一段找（見上 4.）
      if (c.key !== 'empty') { c.key = 'empty'; c.m = FAR_M; c.r = c.rx = c.ry = 0; c.bare = undefined; shLog('段是空的', { i: i, d0: Math.round(d0), d1: Math.round(d1), band: yb.map(Math.round) }); }
      continue;
    }
    var lx0 = 1e9, lx1 = -1e9, ly0 = 1e9, ly1 = -1e9, lz0 = 1e9, lz1 = -1e9;
    P.forEach(function (p) {
      var x = dot3(p, ax[0]), y = dot3(p, ax[1]), z = dot3(p, ax[2]);
      lx0 = Math.min(lx0, x); lx1 = Math.max(lx1, x); ly0 = Math.min(ly0, y); ly1 = Math.max(ly1, y); lz0 = Math.min(lz0, z); lz1 = Math.max(lz1, z);
    });
    // 範圍與遲滯（見上 3.；Tim 2026-10-20「有時候陰影會閃爍」：以前每格照取整重算，浮點的雜訊剛好壓在取整的邊上 ⇒ 兩個值來回跳）
    var hx = Math.max(4, (lx1 - lx0) / 2 * mg), hy = Math.max(4, (ly1 - ly0) / 2 * mg), mx = (lx0 + lx1) / 2, my = (ly0 + ly1) / 2;
    var same = c.key && c.key !== 'empty' && c.gen === SHM.gen && c.sk === sk;
    var rx = csmStep(same && c.rx, hx), ry = csmStep(same && c.ry, hy), tx = 2 * rx / n, ty = 2 * ry / n, cx, cy;
    if (same && rx === c.rx && ry === c.ry && Math.abs(mx - c.cx) + hx <= rx && Math.abs(my - c.cy) + hy <= ry) { cx = c.cx; cy = c.cy; }
    else { cx = Math.round(mx / tx) * tx; cy = Math.round(my / ty) * ty; }
    // 朝太陽那一軸：長方形裡、高度帶裡的每一點都要在深度範圍內（著色器 shIn 的 |z| < 1；csmIn 的 3. 也靠這一條）⇒ 帶子上下兩個水平面在長方形四個角的深度取最低、最高
    //   （太陽低的時候帶子沿太陽方向很長，只照裁出來那一塊會不夠）；再往太陽多推 CSM_UP（範圍外更高的山、桅頂）、往下 CSM_DOWN。
    var sy = Math.max(0.05, ax[2][1]);
    [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b2) {
      var x = cx + a * rx, y = cy + b2 * ry;
      lz0 = Math.min(lz0, (yb[0] - x * ax[0][1] - y * ax[1][1]) / sy); lz1 = Math.max(lz1, (yb[1] - x * ax[0][1] - y * ax[1][1]) / sy);
    }); });
    var zt = same && c.zt >= lz1 + CSM_UP * 0.5 && c.zt <= lz1 + CSM_UP * 1.5 ? c.zt : Math.ceil((lz1 + CSM_UP) / 64) * 64;
    var zb = same && c.zb <= lz0 - CSM_DOWN * 0.5 && c.zb >= lz0 - CSM_DOWN * 1.5 ? c.zb : Math.floor((lz0 - CSM_DOWN) / 64) * 64;
    var key = [rx, ry, Math.round(cx / tx), Math.round(cy / ty), zt, zb].join('|');
    if (key !== c.key || !same) {
      var far = zt - zb, eye = [0, 1, 2].map(function (j) { return ax[0][j] * cx + ax[1][j] * cy + ax[2][j] * zt; }), tm = Math.max(tx, ty);
      c.key = key; c.gen = SHM.gen; c.sk = sk; c.dirty = true; c.why = '範圍換了'; c.rx = rx; c.ry = ry; c.r = Math.max(rx, ry); c.cx = cx; c.cy = cy; c.zt = zt; c.zb = zb;
      c.C = [0, 1, 2].map(function (j) { return ax[0][j] * cx + ax[1][j] * cy + ax[2][j] * (zt + zb) / 2; });
      c.m = M4.mul(ortho(rx, 0, far, ry), M4.lookAt(eye, [eye[0] - SUN[0], eye[1] - SUN[1], eye[2] - SUN[2]], up0));
      c.off = SHK.nrm * tm; c.bz = Math.max(0.03, SHK.bias * tm) / far;   // 沿法線推、深度偏差（畫質頁；預設各 1.5 格，偏差至少 3 cm；長方形照粗的那一軸的格子）
      shLog('段換位置', { i: i, rx: Math.round(rx), ry: Math.round(ry), C: c.C.map(function (v) { return Math.round(v); }), band: yb.map(Math.round) });
    }
    if (land && c.bg !== BED_MESH_GEN && !c.dirty) {                              // 地形網格換過（63_bed_gl.js bedMeshChanged）：換的那一塊碰到這一段 ⇒ 馬上重畫（⛔ 等滿一秒 ⇒ 粗網格的影子蓋在細網格上，那一整塊暗一下）
      var Lg = BED_MESH_LOG, PLc = bedPlanes(c.m), hit = !(c.bg >= 0) || !Lg.length || Lg[0][0] > c.bg + 1;   // 記錄被截掉了 ⇒ 當成碰到
      for (var q = Lg.length - 1; q >= 0 && !hit && Lg[q][0] > c.bg; q--) if (!Lg[q][1] || bedSeen(PLc, Lg[q][1])) hit = true;
      if (hit) { c.dirty = true; c.why = '地形換網格'; } else c.bg = BED_MESH_GEN;
    }
    if (land && c.S && (c.dirty || (!refreshed && i === SHM.rr % k && now - c.t > CSM_REFRESH))) { if (!c.dirty) { refreshed = true; c.why = '滿一秒'; } csmStatic(c, i); }
    // 這一格：陸地快取關著（預設）⇒ 清掉、陸地整張重畫（跟單張一樣，陰影圖跟這一格的場景一定是同一份）；
    //   開著 ⇒ 靜態那一層複製過來（沒有 ⇒ 清掉）。再畫船。這一段沒有船、上一格也沒有、靜態那一層也沒換 ⇒ 那一層本來就對，整段跳過（省一次 n² 的複製）
    var any = csmIn(i, c, ax, E, fw, -1e9, sp[k - 1], sl), ver = land && c.S ? c.t : -1;   // 船只照範圍判、不照這一段的深度：這張圖罩到的點不管多深都用它（見上 4.）
    if (landA && !land) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, c.F.fb); gl.clear(gl.DEPTH_BUFFER_BIT); PASS.vp = c.m;
      var t1 = performance.now(), st0 = { r: c.r, bed: bedDepth(bedPlanes(c.m)), trees: treeDepth(), towns: townDepth() };
      st0.ms = +(performance.now() - t1).toFixed(2); SHM.stat.redraws++; SHM.stat.last = st0; c.dirty = false; c.bare = undefined;
      if (!any) continue;
    } else {
    if (!any && c.bare === ver) continue;
    gl.bindFramebuffer(gl.FRAMEBUFFER, c.F.fb);
    if (land && c.S) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, c.S.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, c.F.fb); gl.blitFramebuffer(0, 0, SHM.n, SHM.n, 0, 0, SHM.n, SHM.n, gl.DEPTH_BUFFER_BIT, gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER, c.F.fb); }
    else gl.clear(gl.DEPTH_BUFFER_BIT);
    c.bare = any ? null : ver;
    if (!any) continue;
    }
    PASS.vp = c.m;
    shadowCasters(i);
  }
  SHM.rr++; SHM.on = true;
  PASS.vp = null; gl.disable(gl.POLYGON_OFFSET_FILL);
  SHM.stat.ms = +(performance.now() - t0).toFixed(2); shLogTick();
}
/** 分段貼合畫面（Tim 2026-10-21「參考看看這個的算法呢」＝ dihara 的 cascaded-shadow-maps：PSSM＋穩定的分段＋SDSM —— 讀深度圖找畫面上最近、最遠的深度，分段只切那一段）：
 *  WebGL 讀回深度圖要等 GPU（卡一格）⇒ 在 CPU 上做：畫面上 CSM_FIT_NX × CSM_FIT_NY 條線（含四個角）沿著走，碰到「地面（bedHgt，海 ＝ 0）＋ 上面可能有的東西」
 *  （海上 CSM_TOP：桅頂；陸上 CSM_LAND_TOP：樹、房子）那一層的深度取最小 ⇒ z0；碰到地面的深度取最大（往下走到最遠距離都沒碰到 ⇒ 最遠距離）⇒ z1。往天上的線不算。
 *  步長從 2 m 起每步 × 1.12（最多 40 m），碰到「上面可能有的東西」那一層 ⇒ 跟上一步之間對半找到那一層（2026-10-24；以前退回上一步）；z0 再往鏡頭讓 CSM_Z0_PAD。
 *  線縫裡量漏的高東西：分段的收的那邊會落到下一張圖（01_gl.js shSel），不會沒影子。
 *  以前（csmNear，2026-10-21 早上）陸地只看地形塊的外框 ⇒ 鏡頭底下有一塊高地就整個退回 0、前兩段又在空中（Tim：「開了Cascade陰影反而變糊了一點」）。
 *  ⇒ [z0, z1]；分界、交界照畫質頁的公尺數從 z0 起算、超過 z1 的截掉（shadowPass；2026-10-24 以前是照比例縮放到 [z0, z1] ⇒ z1 一跳，每一段跟著忽大忽小）。
 *  沿路每一步也記下那一點離鏡頭的深度、底下的地面高、地面＋上面可能有的東西（CSMF；TASK-0877）⇒ 每一段的高度帶（csmBand）。「貼合畫面」關著也照量（只是不縮分界）。 */
var CSM_TOP = 80, CSM_LAND_TOP = 40, CSM_Z0_PAD = 10, CSM_FIT_NX = 8, CSM_FIT_NY = 6;
var CSMF = { d: new Float32Array(8192), lo: new Float32Array(8192), hi: new Float32Array(8192), n: 0 };
function csmFit(un, fw, D) {
  var land = !!(BED && BED.A && landWant()), z0 = Infinity, z1 = 0, F = CSMF; F.n = 0;
  for (var iy = 0; iy < CSM_FIT_NY; iy++) for (var ix = 0; ix < CSM_FIT_NX; ix++) {
    var a = un(-1 + 2 * ix / (CSM_FIT_NX - 1), -1 + 2 * iy / (CSM_FIT_NY - 1), -1), b = un(-1 + 2 * ix / (CSM_FIT_NX - 1), -1 + 2 * iy / (CSM_FIT_NY - 1), 1);
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    var cf = Math.max(1e-3, dx * fw[0] + dy * fw[1] + dz * fw[2]), tEnd = D / cf, t = 0, tp = 0, st = 2, first = -1, hit = -1;
    while (t <= tEnd) {
      var x = a[0] + dx * t, y = a[1] + dy * t, z = a[2] + dz * t, g0 = land ? bedHgt(x, z) : 0, g = Math.max(0, g0), top = g + (g > 0.5 ? CSM_LAND_TOP : CSM_TOP);
      if (F.n < F.d.length) { F.d[F.n] = t * cf; F.lo[F.n] = Math.min(g0, 0); F.hi[F.n] = top; F.n++; }   // 地面低過海平面的乾地（−40 m 的湖岸）也算進帶裡
      if (first < 0 && y <= top) {                                       // 碰到「上面可能有的東西」那一層：上一步跟這一步之間對半找 5 次（以前直接退回上一步：一步最多 40 m，鏡頭拉高時第 0 段整段落在空中）
        var fa = tp, fb = t;
        for (var fi = 0; fi < 5; fi++) { var fm = (fa + fb) / 2, gm = land ? Math.max(0, bedHgt(a[0] + dx * fm, a[2] + dz * fm)) : 0; if (a[1] + dy * fm <= gm + (gm > 0.5 ? CSM_LAND_TOP : CSM_TOP)) fb = fm; else fa = fm; }
        first = fa;
      }
      if (y <= g) { hit = t; break; }
      if (dy >= 0 && y > g + CSM_TOP + 2000) break;                       // 往上、早就高過所有東西 ⇒ 不會再碰到
      tp = t; t += st; st = Math.min(st * 1.12, 40);
    }
    if (first < 0) continue;                                            // 這條線上沒有東西（天空）
    z0 = Math.min(z0, first * cf); z1 = Math.max(z1, hit >= 0 ? hit * cf : D);
  }
  if (!isFinite(z0)) return [0, D];                                     // 整個畫面都是天空
  return [Math.max(0, Math.floor(z0 - CSM_Z0_PAD)), Math.min(D, Math.ceil(z1 + 20))];
}
/** 第 [d0, d1] 那一段的高度帶（csmClip 照它裁）：csmFit 沿線記下、深度落在那一段前後 CSM_BAND_PAD 公尺內的取樣 ⇒ 地面最低 − 5 m ～ 地面＋上面可能有的東西 ＋ 10 m。
 *  那一段一個取樣都沒有 ⇒ 用全部的取樣；連一個都沒有（不會發生：每條線至少記一步）⇒ 海面那一帶。
 *  ⚠ 取樣是 8 × 6 條線、一步最多 40 m：線縫裡的塔、山尖可能高過帶子 ⇒ 那幾點落到下一段（01_gl.js shadowK 的退路），不會沒影子。 */
var CSM_BAND_PAD = 60;
function csmBand(d0, d1) {
  var F = CSMF, lo = Infinity, hi = -Infinity, alo = Infinity, ahi = -Infinity;
  for (var i = 0; i < F.n; i++) {
    alo = Math.min(alo, F.lo[i]); ahi = Math.max(ahi, F.hi[i]);
    if (F.d[i] >= d0 - CSM_BAND_PAD && F.d[i] <= d1 + CSM_BAND_PAD) { lo = Math.min(lo, F.lo[i]); hi = Math.max(hi, F.hi[i]); }
  }
  if (!isFinite(lo)) { lo = alo; hi = ahi; }
  if (!isFinite(lo)) { lo = 0; hi = CSM_TOP; }
  return [lo - 5, hi + 10];
}
/** 第 k 段畫哪幾個（drawHulls／drawModels／drawSails 的 pd.b）：外接球（船 ＝ 船型的格子外框對角線的一半；斷開的那一團 30 m）
 *  1. 它跟它的影子落得到 [d0, d1] 的深度：球心離鏡頭的深度 ± (半徑 ＋ 影子長)，影子長 ＝ 直徑 × sl（照太陽高度，最多 400 m）
 *     （分段 2026-10-24 起 d0 ＝ −∞、d1 ＝ 最遠距離：一張圖罩到的點不管多深都用它 ⇒ 只剔掉影子落不到最遠距離以內的；單張 ⇒ 不剔）；
 *  2. 太陽方向看過去碰到那一段的範圍。
 *  3. （分段）整個落在前面某一張圖的內圈（扣掉混下一張的「交界」那一圈與柔邊那幾格）⇒ 不畫進這一段：太陽方向看過去，影子跟它落在同一個位置，
 *     那一塊收影子的點一定先被前面那一張罩到、用前面那一張（01_gl.js shSel）⇒ 這一張畫了也沒人讀。近處的船因此只進最前面那一兩段（2026-10-24 以前照深度剔）。
 *  每個只判一次、記在 RBAT.cs 的第 k 位（60_rbatch.js）；回傳這一段有沒有任何一個。 */
function csmIn(k, c, ax, E, fw, d0, d1, sl) {
  var O = RBAT, b = 1 << k, any = false, mg = 1 - (3 * SHK.soft + 4) / SHM.n;
  for (var i = 0; i < O.n; i++) {
    var st = O.cst[i], hit = st === 1;
    if (st === 2) {
      var px = O.cp[i * 3], py = O.cp[i * 3 + 1], pz = O.cp[i * 3 + 2], R = O.cR[i];
      var dc = (px - E[0]) * fw[0] + (py - E[1]) * fw[1] + (pz - E[2]) * fw[2], ext = R + Math.min(400, 2 * R * sl);
      if (!(dc + ext < d0 || dc - ext > d1)) {
        var dx = px - c.C[0], dy = py - c.C[1], dz = pz - c.C[2];
        hit = Math.abs(dx * ax[0][0] + dy * ax[0][1] + dz * ax[0][2]) < c.rx + R && Math.abs(dx * ax[1][0] + dy * ax[1][1] + dz * ax[1][2]) < c.ry + R;   // 長方形：右、上各自的半寬
        if (hit && !CSM_SIMPLE) {
          var lx = px * ax[0][0] + py * ax[0][1] + pz * ax[0][2], ly = px * ax[1][0] + py * ax[1][1] + pz * ax[1][2];
          for (var j = 0; j < k && hit; j++) {
            var q = SHM.cs[j], f = mg * (1 - SHK['b' + (j + 1)]);       // 第 j 張的內圈（j < k ≤ 最後一段 ⇒ 第 j 段一定有「交界」那一項）
            if (q.key && q.key !== 'empty' && Math.abs(lx - q.cx) + R <= q.rx * f && Math.abs(ly - q.cy) + R <= q.ry * f) hit = false;
          }
        }
      }
    }
    if (hit) { O.cs[i] |= b; any = true; }
  }
  return any;
}
// 陰影那一趟的「畫的東西」＝ 這一格的 owner（60_rbatch.js RBAT：船照 SHIPS、再斷開的那一團照 PIECES；drawHulls／drawModels／drawSails 照同一個順序查 cs）。
//   外接球一格算一次（csmOwners，shadowPass 開頭；這一格的 render() 裡 sh.M、pc.c 都不動）⇒ ⛔ 以前每段一個閉包、船殼／模型／帆各叫一次，每次重算 M4.pt。
//   cst：0 不畫（沉了）、1 一定畫（斷開的那一團沒有中心）、2 照球判。陣列 rbatPrep 配好（不夠才換大的）。
function csmOwners() {
  var O = RBAT;
  for (var i = 0; i < O.n; i++) {
    var o = O.own[i], p, R;
    O.cs[i] = 0; O.cst[i] = 2;
    if (o.crew) { if (o.sink > 40) { O.cst[i] = 0; continue; } var B = o.T.base; R = o.T.shR || (o.T.shR = 0.5 * S * Math.hypot(B.sx, B.sy, B.sz)); p = M4.pt(o.M, B.sx / 2, B.sy / 2, B.sz / 2); }
    else { p = o.c || (o.M ? [o.M[12], o.M[13], o.M[14]] : null); R = 30; if (!p) { O.cst[i] = 1; continue; } }
    O.cp[i * 3] = p[0]; O.cp[i * 3 + 1] = p[1]; O.cp[i * 3 + 2] = p[2]; O.cR[i] = R;   // Float64Array：存的就是算出來的那個 double
  }
}
/** 一段陰影圖畫船殼、模型、帆（P.dvox、P.dtri（一次畫多個 ⇒ P.dtriI）、P.dsail；分段 shadowPass 與單張 shadowSimple 共用）：只畫 csmIn 判進第 k 段的（RBAT.pd.sh：b ＝ 第 k 位）。 */
function shadowCasters(k) {
  var pd = RBAT.pd.sh; pd.k = k; pd.b = 1 << k;
  gl.useProgram(P.dvox.prog); setCommon(P.dvox); drawHulls(P.dvox, pd);
  if (RBAT_INST && P.dtriI) rbatDepth(pd);                              // 模型那一段一次畫多個（60_rbatch.js，S5：只寫深度 ⇒ 順序無關）；?inst=0／編不起來 ⇒ 照以前一個一個畫
  else { gl.useProgram(P.dtri.prog); setCommon(P.dtri); drawModels(P.dtri, pd); }
  gl.useProgram(P.dsail.prog); setCommon(P.dsail); drawSails(P.dsail, pd);   // 帆另一支：貼圖的洞不投影子（TASK-0579）
}
/** 一段的靜態那一層：地形（63_bed_gl.js bedDepth，照那一段的範圍剔除）、樹（63_trees.js treeDepth）、城鎮的建築與城牆（63_towns.js townDepth）只寫深度。 */
function csmStatic(c, i) {
  var t0 = performance.now();
  gl.bindFramebuffer(gl.FRAMEBUFFER, c.S.fb); gl.clear(gl.DEPTH_BUFFER_BIT);
  PASS.vp = c.m;
  var st = { r: c.r, bed: bedDepth(bedPlanes(c.m)), trees: treeDepth(), towns: townDepth() };
  c.dirty = false; c.t = performance.now() / 1000; c.bg = BED_MESH_GEN;
  st.ms = +(performance.now() - t0).toFixed(2); SHM.stat.redraws++; SHM.stat.last = st;
  if (c.why !== '滿一秒') shLog('靜態重畫', { i: i, why: c.why || '?', r: st.r, bed: st.bed, trees: st.trees, towns: st.towns, ms: st.ms });   // 滿一秒那種每秒都有 ⇒ 不印
}
// 有沒有陸地（載進來的網格有高過海平面的）：沒有 ⇒ 不配靜態那一份、不畫地形樹城。
function landWant() {
  if (!BED || !BED.A || !GFX.shadow) return false;
  for (var k in BEDGL) if (BEDGL[k].C && BEDGL[k].C.max > 0.3) return true;
  return false;
}
/** 單張陰影（CSM_SIMPLE；Tim 2026-10-20「狀況跟之前差不多 我懷疑是cascade算法問題 是否可以先用一般陰影算法試看看」⇒「目前陰影穩定不閃了(確認是cascade原因)」）：最一般的方向光陰影 ——
 *  一張陰影圖罩住鏡頭看的那一點往前推三成範圍的地方，半寬 R 照鏡頭離那一點多遠分級（SIMPLE_R，換級有重疊）；中心每一格對齊陰影圖的格子（太陽方向的平面）。
 *  每一格整張重畫（船、地形、樹、城都畫），⛔ 沒有靜態那一層、沒有複製、沒有遲滯 ⇒ 陰影圖跟這一格的場景一定是同一份。範圍最外面那一圈（85%～98%）淡掉（uShEdge）。 */
// 範圍（Tim 2026-10-20「陰影不能只處理攝影機範圍(要稍微大一些)」「陰影之間應該要有重疊區」）：半寬一級比一級大、往前只推三成（鏡頭背後、兩側也罩到）；
//   換級有重疊：要的比這一級大 ⇒ 馬上換大的；要的比這一級小 ⇒ 等到比下一級的八成還小才換小的 ⇒ 鏡頭距離剛好在交界時不會一下大一下小。
//   半寬那幾級 × 畫質頁的「單張：範圍」（SHK.sR）、往前推幾成 ＝「單張：往前推」（SHK.ahead）、沿法線推與深度偏差 ＝ SHK.nrm、SHK.bias（07_gfx.js；Tim 2026-10-21）。
var SIMPLE_R = [200, 300, 450, 650, 900, 1200], SIMPLE_DOWN = 0.8;
function shadowSimple() {
  var c = SHM.cs[0]; if (!c) { SHM.on = false; return; }
  var RS = SIMPLE_R.map(function (r) { return Math.round(r * SHK.sR * shFar()); });
  var t0 = performance.now(), e = CAM.eye, lk = CAM.look || CAM.tgt, h = Math.hypot(lk[0] - e[0], lk[1] - e[1], lk[2] - e[2]), want = h * 2 + 150, R = RS[RS.length - 1];
  for (var i = 0; i < RS.length; i++) if (RS[i] >= want) { R = RS[i]; break; }
  var cur = SHM.simpleR, ci = RS.indexOf(cur);                     // 換級的重疊（見上）：往小換要比下一級的八成還小
  if (ci >= 0 && R < cur) { var lower = RS[ci - 1]; if (!(lower && want < lower * SIMPLE_DOWN)) R = cur; else { R = lower; for (var i2 = ci - 1; i2 > 0 && want < RS[i2 - 1] * SIMPLE_DOWN; i2--) R = RS[i2 - 1]; } }
  SHM.simpleR = R;
  var fx = lk[0] - e[0], fz = lk[2] - e[2], fl = Math.hypot(fx, fz), cc = fl > 1e-3 ? [lk[0] + fx / fl * R * SHK.ahead, lk[1], lk[2] + fz / fl * R * SHK.ahead] : [lk[0], lk[1], lk[2]];
  var up0 = Math.abs(SUN[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0], V0 = M4.lookAt([SUN[0], SUN[1], SUN[2]], [0, 0, 0], up0);
  var ax = [[V0[0], V0[4], V0[8]], [V0[1], V0[5], V0[9]], [V0[2], V0[6], V0[10]]], tx = 2 * R / SHM.n, C = [0, 0, 0];
  for (var j = 0; j < 3; j++) { var a = ax[j], s = j < 2 ? tx : R, v = Math.round((cc[0] * a[0] + cc[1] * a[1] + cc[2] * a[2]) / s) * s; C[0] += a[0] * v; C[1] += a[1] * v; C[2] += a[2] * v; }   // 右、上對齊一格；朝太陽那一軸對齊 R
  var D = R + CSM_UP, near = 0, far = D + R + CSM_DOWN;
  c.m = M4.mul(ortho(R, near, far), M4.lookAt([C[0] + SUN[0] * D, C[1] + SUN[1] * D, C[2] + SUN[2] * D], C, up0)); c.r = c.rx = c.ry = R; c.C = C; c.key = '';   // key：換回分段 ⇒ 重算
  c.off = SHK.nrm * tx; c.bz = Math.max(0.03, SHK.bias * tx) / (far - near);
  gl.bindFramebuffer(gl.FRAMEBUFFER, c.F.fb); gl.clear(gl.DEPTH_BUFFER_BIT); PASS.vp = c.m;
  var st = landWant() ? { r: R, bed: bedDepth(bedPlanes(c.m)), trees: treeDepth(), towns: townDepth() } : { r: R };
  PASS.vp = c.m;
  csmIn(0, c, ax, e, [0, 0, -1], -1e9, 1e9, 0);
  shadowCasters(0);
  SHM.splits = [1e9]; SHM.bs = [1e9]; SHM.eye.set(e); SHM.fw.set([0, 0, -1]); SHM.on = true;
  st.ms = +(performance.now() - t0).toFixed(2); SHM.stat.redraws++; SHM.stat.last = st; SHM.stat.ms = st.ms;
  if (SHLOG.r !== R) { shLog('單張換範圍', { R: R, was: SHLOG.r || null, want: Math.round(want) }); SHLOG.r = R; }
  shLogTick();
}
// 陰影與鏡頭的紀錄（Tim 2026-10-20「另外可以輸出log去察看鏡頭 陰影等資訊」）：Debug 模式（dbgOn）開著才記。
//   事件：哪一段換了位置、靜態那一層為什麼重畫（範圍換了／地形換網格／滿一秒）、畫了多少、幾毫秒、陸地有沒有、單張換了範圍那一級 —— 每一筆帶這一格的鏡頭；
//   另外每秒一行總覽（鏡頭的眼、看的點、距離、俯仰、方位、模式＋每一段的範圍）。都印在主控台（開頭「[陰影]」），最近 SHLOG.max 筆存著：主控台打 __shadowLog() 叫出來（地球儀嵌的也行）。
var SHLOG = { buf: [], max: 600, last: 0, land: null };
function shLogCam() {
  var r1 = function (v) { return Math.round(v * 10) / 10; }, lk = CAM.look || CAM.tgt;
  return { eye: CAM.eye.map(r1), look: lk ? lk.map(r1) : null, dist: r1(CAM.dist), pitch: +CAM.pitch.toFixed(3), yaw: +CAM.yaw.toFixed(3), mode: CAM.mode };
}
function shLog(kind, o) {
  if (!dbgOn()) return;
  var e = { f: RFR, t: +(performance.now() / 1000).toFixed(3), kind: kind, cam: shLogCam() };
  for (var k in o) e[k] = o[k];
  SHLOG.buf.push(e); if (SHLOG.buf.length > SHLOG.max) SHLOG.buf.splice(0, SHLOG.buf.length - SHLOG.max);
  console.log('[陰影] ' + kind + ' 格' + e.f + ' ' + JSON.stringify(o) + ' 鏡頭 ' + JSON.stringify(e.cam));
}
window.__shadowLog = function (n) { return SHLOG.buf.slice(-(n || SHLOG.max)); };
/** 每秒一行總覽、陸地有沒有換了（shadowPass／shadowSimple 結尾叫）。 */
function shLogTick() {
  if (!dbgOn()) return;
  var now = performance.now() / 1000, land = !!landWant();
  if (land !== SHLOG.land) { SHLOG.land = land; shLog('陸地', { on: land }); }
  if (now - SHLOG.last < 1) return;
  SHLOG.last = now;
  shLog('每秒', { mode: CSM_SIMPLE ? '單張' : '分段', n: SHM.n, z0: SHM.z0 || 0, z1: SHM.z1 || 0, cs: SHM.cs.slice(0, SHM.k).map(function (c) { return { rx: Math.round(c.rx), ry: Math.round(c.ry), C: c.C.map(function (v) { return Math.round(v); }) }; }),
    splits: SHM.splits.map(function (v) { return Math.round(v); }), ms: SHM.stat.ms, redraws: SHM.stat.redraws, meshGen: BED_MESH_GEN });
}
// 陰影範圍的除錯線（Tim 2026-10-20「可以嘗試在畫面上畫debug線條(可以檢測debug模式是否開啟) 用來排查shadow分配範圍」）：
//   要另外帶 ?shdbg=1 才畫（Tim 2026-10-21「關掉debug模式下 陰影繪製的線條吧(改成要額外帶參數才畫 只開debug不畫)」）——只開 Debug（dbgOn）不畫；畫質頁「陰影細項」的「顯示分段」照舊也畫。
//   每一張陰影圖罩住的範圍 ⇒ 海平面上（y 0.6 m）一個框（太陽方向的長方體跟海平面的交線）：照鏡頭分段 ⇒ 第 1～4 段 紅、黃、綠、青；單張 ⇒ 洋紅，裡面再一個 85% 的框（從那裡開始淡掉）。
//   照鏡頭分段時另外畫「收的那邊換段」的線（離鏡頭的深度 ＝ 那一段的遠端，在海平面上是一條直線）：同一個顏色、短一點。不做深度測試 ⇒ 被地形擋住也看得到。
//   羅盤下面那一行除錯資訊多「陰影」那一段（shadowDbgText，61_hud.js）。
var SHDBG = { prog: null, vao: null, vb: null }, SHDBG_COL = [[1, 0.25, 0.2], [1, 0.85, 0.2], [0.3, 1, 0.3], [0.3, 0.9, 1]], SHDBG_ON = Q.get('shdbg') === '1';
function shadowDebugDraw() {
  if (!(SHDBG_ON || SHK.show) || !SHM || !SHM.on || !SHM.cs.length) return;   // ?shdbg=1，或畫質頁「陰影細項」的「顯示分段」
  var V = [], y0 = 0.6;
  function seg(a, b, col) { V.push(a[0], a[1], a[2], col[0], col[1], col[2], b[0], b[1], b[2], col[0], col[1], col[2]); }
  SHM.cs.forEach(function (c, i) {
    if (i >= SHM.k || !c.m || c.m === FAR_M) return;
    var Mi = M4.inv(c.m), col = CSM_SIMPLE ? [1, 0.3, 1] : SHDBG_COL[i % 4];
    function edge(x, y) { var a = M4.pt(Mi, x, y, -1), b = M4.pt(Mi, x, y, 1), d = b[1] - a[1], t = Math.abs(d) > 1e-6 ? (y0 - a[1]) / d : 0; return [a[0] + (b[0] - a[0]) * t, y0, a[2] + (b[2] - a[2]) * t]; }
    function rect(s) { var q = [edge(-s, -s), edge(s, -s), edge(s, s), edge(-s, s)]; for (var j = 0; j < 4; j++) seg(q[j], q[(j + 1) % 4], col); }
    rect(1); if (CSM_SIMPLE) rect(SHK.edge);
    var m = edge(0, 0); seg([m[0] - 4, y0, m[2]], [m[0] + 4, y0, m[2]], col); seg([m[0], y0, m[2] - 4], [m[0], y0, m[2] + 4], col);   // 中心一個十字
    if (!CSM_SIMPLE && SHM.splits[i] < 1e8) {                            // 收的那邊換段的線：海平面上 dot(p − 眼, 往前) ＝ 遠端
      var E = SHM.eye, F = SHM.fw, hl = Math.hypot(F[0], F[2]); if (hl < 1e-3) return;
      var hx = F[0] / hl, hz = F[2] / hl, den = F[0] * hx + F[2] * hz; if (Math.abs(den) < 1e-3) return;
      var s = SHM.splits[i], a2 = (s + (E[1] - y0) * F[1]) / den, p = [E[0] + hx * a2, y0, E[2] + hz * a2], L = s * 1.2;
      seg([p[0] - hz * L, y0, p[2] + hx * L], [p[0] + hz * L, y0, p[2] - hx * L], col);
    }
  });
  if (!V.length) return;
  if (!SHDBG.prog) {
    SHDBG.prog = VK.compile(gl, '#version 300 es\nlayout(location=0) in vec3 aP; layout(location=1) in vec3 aC; uniform mat4 uVP; out vec3 vC; void main(){ vC=aC; gl_Position=uVP*vec4(aP,1.0); }\n',
      '#version 300 es\nprecision mediump float; in vec3 vC; out vec4 o; void main(){ o=vec4(vC,1.0); }\n');
    SHDBG.vao = gl.createVertexArray(); SHDBG.vb = gl.createBuffer();
    gl.bindVertexArray(SHDBG.vao); gl.bindBuffer(gl.ARRAY_BUFFER, SHDBG.vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
  }
  var dt = gl.isEnabled(gl.DEPTH_TEST), bl = gl.isEnabled(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  gl.useProgram(SHDBG.prog.prog); setCommon(SHDBG.prog);
  gl.bindVertexArray(SHDBG.vao); gl.bindBuffer(gl.ARRAY_BUFFER, SHDBG.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.LINES, 0, V.length / 6); gl.bindVertexArray(null);
  if (dt) gl.enable(gl.DEPTH_TEST); if (bl) gl.enable(gl.BLEND);
}
// 陰影範圍的除錯塗色（Tim 2026-10-24「可以優化Shadowmap Debug工具方便妳查看 目前只有提示線 我覺得可以填上半透明顏色(對應線的顏色」；TASK-0877）：同一個開關（?shdbg=1、「顯示分段」）。
//   照 Unity 的 Show Cascades：畫完海之後，每個像素從深度還原世界座標、照著色器挑段（01_gl.js shSel、shFade，同一支）塗那一段的顏色（半透明；圖最外面混下一張的那一圈
//   照混的比例混兩段的顏色，最遠距離淡掉的那一截跟著淡）⇒ 塗到哪個顏色，那裡就是用那一張圖；沒塗 ＝ 沒有影子（比最遠距離遠、或每一張都沒罩到）。
//   每一張圖的邊框也照實描在地表、船、房子上（那一點剛好落在圖的邊上，寬約 1.5 個畫面像素）—— 海平面那個框（shadowDebugDraw）在陸地上會差一截，這一條不會。
//   深度：場景（多重取樣）的深度解析到 RT.B.dep 再讀 ⇒ 開著的時候，之後讀它的（艙內的水）這一格讀到的是畫完海的深度。
var SHFILL = { prog: null, vao: null, col: new Float32Array(CSM_MAX * 3) }, SHFILL_A = 0.3;
function shadowDebugFill(w, h) {
  if (!(SHDBG_ON || SHK.show) || !SHM || !SHM.on || !SHM.cs.length) return;
  if (!SHFILL.prog) {
    SHFILL.prog = VK.compile(gl, '#version 300 es\nvoid main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.0-1.0,0.0,1.0); }\n',
      '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + 'uniform mat4 uInv; uniform highp sampler2D uDep; uniform vec2 uView; uniform vec3 uCol[' + CSM_MAX + ']; uniform float uA; out vec4 o;\n' +
      'void main(){ vec2 uv=gl_FragCoord.xy/uView; float z=texture(uDep,uv).r; vec4 q=uInv*vec4(uv*2.0-1.0,z*2.0-1.0,1.0); vec3 w=q.xyz/q.w;\n' +
      ' float t; int k=shSel(w,vec3(0.0),t); vec3 c=vec3(0.0); float a=0.0;\n' +
      ' if(k>=0){ c=mix(uCol[k],uCol[min(k+1,' + (CSM_MAX - 1) + ')],t); a=uA*(1.0-shFade(w)); }\n' +
      ' for(int i=0;i<' + CSM_MAX + ';i++){ if(i>=uCsN) break; vec4 p=uShM[i]*vec4(w,1.0); float e=max(abs(p.x),abs(p.y)), f=fwidth(e)*1.5; if(abs(p.z)<1.0 && e<1.0 && e>1.0-f){ c=uCol[i]; a=0.9; } }\n' +   // fwidth 在 discard 之前（迴圈照 uCsN，每個像素一樣）
      ' if(z>=1.0 || a<=0.0 || uShOn<0.5) discard; o=vec4(c,a); }\n');   // uShOn：01_gl.js setCommon 看著色器有沒有用到它才給陰影那一整組（沒用到 ⇒ uCsN 一直是 0，什麼都不塗）
    SHFILL.vao = gl.createVertexArray();
  }
  for (var i = 0; i < CSM_MAX; i++) SHFILL.col.set(CSM_SIMPLE ? [1, 0.3, 1] : SHDBG_COL[i % 4], i * 3);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, RT.A.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, RT.B.fb);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, RT.A.fb);
  var dt = gl.isEnabled(gl.DEPTH_TEST), bl = gl.isEnabled(gl.BLEND);
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  var P2 = SHFILL.prog, u = P2.u; gl.useProgram(P2.prog); setCommon(P2);
  gl.uniformMatrix4fv(u.uInv, false, CAM.inv); gl.uniform2f(u.uView, w, h); gl.uniform3fv(u.uCol, SHFILL.col); gl.uniform1f(u.uA, SHFILL_A);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, RT.B.dep); gl.uniform1i(u.uDep, 3); gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(SHFILL.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  gl.depthMask(true); if (dt) gl.enable(gl.DEPTH_TEST); if (!bl) gl.disable(gl.BLEND);
}
/** 除錯資訊那一行的「陰影」（61_hud.js）：模式、每一張的半寬、這一格畫陰影幾毫秒、靜態那一層／整張重畫過幾次。 */
function shadowDbgText() {
  if (!SHM || !SHM.on) return '陰影 關';
  return '陰影 ' + (CSM_SIMPLE ? '單張' : '分段（' + Math.round(SHM.z0 || 0) + '～' + Math.round(SHM.z1 || 0) + ' m）') + ' ' + SHM.cs.slice(0, SHM.k).map(function (c) { return c.rx === c.ry ? Math.round(c.r) : Math.round(c.rx) + '×' + Math.round(c.ry); }).join('／') + ' m　' + SHM.n + '²　' + SHM.stat.ms + ' ms　重畫 ' + SHM.stat.redraws;
}
/** 陰影圖用在哪（量測與除錯；__game.shadowCover，TASK-0877）：畫面上 nx × ny 條線沿著走到地面（海 ＝ 0、陸地 bedHgt；步法同 csmFit，碰到再對半找），
 *  每一點照著色器挑段（csmPick ＝ 01_gl.js shadowK 那一套）⇒ 每一段：用到幾點（n）、圖上被畫面裡的地面碰到的格（16 × 16 格）佔幾成（vis：這張圖有多少落在畫面裡）、
 *  被用到的格佔幾成（used）、半寬（rx、ry）；全部：挑到的那張圖沒罩到這一點（gap：斷開）幾點、每一點平均被幾張圖罩住（over：重疊）。只看地面，船、房子不算。 */
function shadowCover(nx, ny) {
  if (!SHM || !SHM.on || !CAM.inv) return null;
  nx = nx || 96; ny = ny || 54;
  var I = CAM.inv, E = CAM.eye, F = SHM.fw, D = SHK.dist * shFar(), land = !!(BED && BED.A && landWant()), G = 16, k = SHM.k;
  function un(x, y, z) { var w = I[3] * x + I[7] * y + I[11] * z + I[15], p = M4.pt(I, x, y, z); return [p[0] / w, p[1] / w, p[2] / w]; }
  function gh(x, z) { return land ? Math.max(0, bedHgt(x, z)) : 0; }
  var cs = [], tot = 0, gap = 0, over = 0, far = 0;
  for (var i = 0; i < k; i++) { var c = SHM.cs[i]; cs.push({ n: 0, vis: new Uint8Array(G * G), used: new Uint8Array(G * G), rx: c.rx || c.r, ry: c.ry || c.r }); }
  for (var iy = 0; iy < ny; iy++) for (var ix = 0; ix < nx; ix++) {
    var sx = -1 + 2 * (ix + 0.5) / nx, sy = -1 + 2 * (iy + 0.5) / ny, a = un(sx, sy, -1), b = un(sx, sy, 1);
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    var cf = Math.max(1e-3, dx * F[0] + dy * F[1] + dz * F[2]), tEnd = D / cf, t = 0, tp = 0, st = 1, hit = -1;
    while (t <= tEnd) {
      if (a[1] + dy * t <= gh(a[0] + dx * t, a[2] + dz * t)) { hit = t; break; }
      if (dy >= 0 && a[1] + dy * t > 3000) break;
      tp = t; t += st; st = Math.min(st * 1.08, 20);
    }
    if (hit < 0) continue;
    for (var j = 0; j < 8; j++) { var tm = (tp + hit) / 2; if (a[1] + dy * tm <= gh(a[0] + dx * tm, a[2] + dz * tm)) hit = tm; else tp = tm; }
    var P = [a[0] + dx * hit, a[1] + dy * hit, a[2] + dz * hit], d = (P[0] - E[0]) * F[0] + (P[1] - E[1]) * F[1] + (P[2] - E[2]) * F[2];
    tot++;
    var in4 = [], nIn = 0;
    for (i = 0; i < k; i++) {
      var q = M4.pt(SHM.cs[i].m, P[0], P[1], P[2]), e = Math.max(Math.abs(q[0]), Math.abs(q[1])), ok = e < 1 && Math.abs(q[2]) < 1;
      in4.push(ok); if (ok) { nIn++; cs[i].vis[Math.min(G - 1, (q[1] * 0.5 + 0.5) * G | 0) * G + Math.min(G - 1, (q[0] * 0.5 + 0.5) * G | 0)] = 1; }
    }
    over += nIn;
    var s = csmPick(P, d);
    if (s === -2) { far++; continue; }                                      // 比最遠距離還遠（最後一段淡掉之後）：本來就沒有影子
    if (s < 0) { gap++; continue; }
    cs[s].n++; var q2 = M4.pt(SHM.cs[s].m, P[0], P[1], P[2]);
    cs[s].used[Math.min(G - 1, (q2[1] * 0.5 + 0.5) * G | 0) * G + Math.min(G - 1, (q2[0] * 0.5 + 0.5) * G | 0)] = 1;
  }
  function pc(u) { var n = 0; for (var x = 0; x < u.length; x++) n += u[x]; return Math.round(n / u.length * 100); }
  return { pts: tot, gap: gap, far: far, over: tot ? +(over / tot).toFixed(2) : 0, z0: Math.round(SHM.z0 || 0), z1: Math.round(SHM.z1 || 0),
    cs: cs.map(function (c) { return { n: c.n, vis: pc(c.vis), used: pc(c.used), rx: Math.round(c.rx), ry: Math.round(c.ry) }; }) };
}
/** 收的那一點用哪一段（照 01_gl.js shSel；shadowCover 用）：第一張罩得到它的圖（邊上留柔邊那幾格）；都沒罩到 ⇒ −1（斷開）；比最遠距離還遠 ⇒ −2。 */
function csmPick(P, d) {
  var mg = 1 - (3 * SHK.soft + 4) / SHM.n;
  if (d >= SHM.csD[SHM.k - 1]) return -2;
  for (var i = 0; i < SHM.k; i++) { var q = M4.pt(SHM.cs[i].m, P[0], P[1], P[2]); if (Math.max(Math.abs(q[0]), Math.abs(q[1])) < mg && Math.abs(q[2]) < 1) return i; }
  return -1;
}
/** 著色器的 uShM、uCsD／L／O／B／W（每一段的矩陣、遠端、開始淡的地方、沿法線推多少、深度偏差、圖最外面混下一張的那一圈；沒用到的段 ⇒ FAR_M）。 */
function shadowMats() {
  for (var i = 0; i < CSM_MAX; i++) {
    var c = SHM.on && i < SHM.k ? SHM.cs[i] : null;
    SHM.mats.set(c ? c.m : FAR_M, i * 16); SHM.csD[i] = c ? SHM.splits[i] : 0; SHM.csL[i] = c ? SHM.bs[i] : 0; SHM.csO[i] = c ? c.off : 0; SHM.csB[i] = c ? c.bz : 0;
    SHM.csW[i] = c && !CSM_SIMPLE && i < SHM.k - 1 ? SHK['b' + (i + 1)] : 0;   // 畫質頁的「交界 1～3」；最後一段的「交界」照深度淡（csL）
  }
}
/** 破洞底下的海（TASK-0643）：畫完海之後、白沫之前。只落在深度還是清空值的像素（LESS），著色器再用 hullHit 只留海被丟掉的那一塊。⛔ 不寫深度、不混色。 */
function abyssDraw() {
  gl.disable(gl.BLEND); gl.depthMask(false); gl.depthFunc(gl.LESS);
  gl.useProgram(P.abyss.prog); setCommon(P.abyss); gl.uniformMatrix4fv(P.abyss.u.uCamInv, false, CAM.inv); hullUniforms(P.abyss);
  gl.uniform1f(P.abyss.u.uAbY, VX ? vxH(CAM.tgt[0], CAM.tgt[2]) : 0);   // 那一片海平面的高度：大漩渦 ⇒ 鏡頭看的那一點的漏斗水面（⛔ 照 0 ⇒ 漏斗裡的船從破洞往下看是霧色）
  gl.bindVertexArray(SKYVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
}
/** 船艙遮罩的貼圖陣列（uHullA，第 1 號）：載好的每一型一層（T.hullLayer），寬高取最大的那一型；載了新的船型 ⇒ 重建。 */
var HULLA = { tex: null, key: '' };
function hullArr() {
  var Ts = Object.keys(HULLT).map(function (id) { return HULLT[id]; }).filter(function (T) { return T.hullHB; }), key = Ts.map(function (T) { return T.id; }).join(',');
  if (HULLA.tex && HULLA.key === key) return;
  if (HULLA.tex) gl.deleteTexture(HULLA.tex);
  var W = 1, H = 1, MX = gl.getParameter(gl.MAX_TEXTURE_SIZE);         // 每層：0..高 ＝ 側視的半寬，接著 3 × sy ＋ 8 列 ＝ 俯視的頂面、填窪、積水區與它的表（hullRoof）；放不下 ⇒ 那一型只用側視（T.hullRoofOn）
  Ts.forEach(function (T) { T.hullRoofOn = !!T.hullRoof && T.hullTH + 3 * T.base.sy + 8 <= MX; W = Math.max(W, T.hullTW); H = Math.max(H, T.hullTH + (T.hullRoofOn ? 3 * T.base.sy + 8 : 0)); });
  var t = HULLA.tex = gl.createTexture(); HULLA.key = key;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R8, W, H, Math.max(1, Ts.length), 0, gl.RED, gl.UNSIGNED_BYTE, null);
  Ts.forEach(function (T, k) { T.hullLayer = k; gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, k, T.hullTW, T.hullTH, 1, gl.RED, gl.UNSIGNED_BYTE, T.hullSea || T.hullHB);   // 海面遮罩用補過縫的那張（hullSeaMask）
    if (T.hullRoofOn) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, T.hullTH, k, T.hullTW, 3 * T.base.sy + 8, 1, gl.RED, gl.UNSIGNED_BYTE, T.hullRoof); });
  [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, gl.NEAREST); });
  [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, gl.CLAMP_TO_EDGE); });
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
}
/** 反射：鏡像的鏡頭把船畫進 RT.R（水面以下丟掉）。低 ＝ 船身；高 ＝ 再加砲、模型與帆。 */
function reflPass() {
  var R = RT.R; gl.bindFramebuffer(gl.FRAMEBUFFER, R.fb); gl.viewport(0, 0, R.w, R.h);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  PASS.vp = m4Into(REFL_VP, 0, CAM.vp, MIRROR); PASS.eye = [CAM.eye[0], -CAM.eye[1], CAM.eye[2]]; PASS.clip = 0; PASS.sh = 0;
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);                   // 船的矩陣是鏡射（shipBaseMatrix）、反射的鏡頭又鏡射一次 ⇒ 兩次抵銷，繞序照常（CCW）
  gl.useProgram(P.vox.prog); setCommon(P.vox); drawHulls(P.vox, RBAT.pd.rf);
  if (GFX.refl === 2) {
    gl.disable(gl.CULL_FACE); gl.useProgram(P.tri.prog); setCommon(P.tri); gl.uniform1f(P.tri.u.uLit, 1); drawModels(P.tri, RBAT.pd.rf); drawColours(P.tri, RBAT.pd.rf);
    gl.useProgram(P.sail.prog); setCommon(P.sail); drawSails(P.sail, RBAT.pd.rf);
  }
  PASS.vp = null; PASS.eye = null; PASS.clip = -1e9; PASS.sh = 1;
}
/** 船艙遮罩的 uniform（海與白沫共用，01_gl.js HULL_GLSL）。開始沉（sinkingFinal）之前，船艙裡不畫海水（Tim 2026-10-12：船身下沉一點點，海面就從破洞、甲板開口看進去像淹了） */
var MASK_OFF = -1;                                                        // ?debug=1 的 __game.mask(k)：第 k 艘的遮罩關掉（量 4 艘時每一格遮罩都有作用：關掉那艘 ⇒ 它的船艙裡才看得到海）
var HULL_DECK_HOLD = 3, HULL_DECK_SINK = 0.5;                            // 甲板淹了 ⇒ 遮罩整艘關掉；最後一次淹過之後再撐幾秒才打開（船晃回來、浪一退 ⇒ 不要一閃一閃）；只算進水沉下去（sh.sink）這麼多的船
                                                                          // 🩸 不看 sink ⇒ 乾舷低的船（sentinel、monitor、virginia、reale：缺口離水面 0.5–1.1 m）好好的、縱傾 1–3° 就整艘關掉，艙口、砲門看進去一片海（Tim 2026-10-12 那個）
/** 甲板淹了沒（hullUniforms）：T.hullDecks 每一片的四個極端點（在缺口的高度）照船現在的姿勢算到世界，有一點比船中心的海面低 ⇒ 海已經漫上甲板（同著色器判積水區破了沒） */
function hullDeckSea(s, sea) {
  var D = s.T.hullDecks, M = s.M;
  if (D) for (var i = 0; i < D.length; i++) { var e = D[i]; for (var j = 1; j < 9; j += 2) if (M[1] * e[j] + M[5] * e[j + 1] + M[9] * e[0] + M[13] < sea) return true; }
  return false;
}
var HU = { f: -1, inv: new Float32Array(MASK_NEAR * 16), hide: new Float32Array(MASK_NEAR), k: new Float32Array(MASK_NEAR * 4), xb: new Float32Array(MASK_NEAR * 4), r: new Float32Array(MASK_NEAR * 4), y: new Float32Array(MASK_NEAR * 4) };
function hullUniforms(prog) {
  var u = prog.u;
  if (HU.f !== RFR) {                                                     // 一格填一次（f ＝ RFR；S3）：海、破洞底下的海、白沫都叫，同一次 render() 裡 MSLOTS、船的 inv 不動；每支程式照舊各傳一次
    HU.f = RFR; hullArr(); HU.hide.fill(0); HU.r.fill(0);
    for (var i = 0; i < MASK_NEAR; i++) {                                 // 遮罩的每一格（gpuSlots MSLOTS）照那艘船型的那一層；排不進去的船 ⇒ 沒有遮罩
      var s = MSLOTS[i], T = s && s.T;
      if (s) HU.inv.set(s.inv, i * 16);                                   // 透視（nearShip）也用
      if (!T || !T.hullHB || T.hullLayer === undefined) continue;
      var sea = seaH(s.center[0], s.center[2], SIMT);
      if (s.sink >= HULL_DECK_SINK && hullDeckSea(s, sea)) s.deckSeaT = SIMT;
      var wet = s.deckSeaT !== undefined && SIMT - s.deckSeaT < HULL_DECK_HOLD;   // 甲板淹了 ⇒ 整艘不遮（Tim 2026-10-30「水淹沒上層甲板時 直接取消海水遮罩」：甲板上的橫樑、吊艇架底下照頂面照樣挖掉，淹了還一條一條碎）
      HU.hide[i] = !s.sinkingFinal && !s.sunk && !wet && s.i !== MASK_OFF ? 1 : 0;
      HU.k[i * 4] = T.hullTW; HU.k[i * 4 + 1] = T.hullTH; HU.k[i * 4 + 2] = T.cy; HU.k[i * 4 + 3] = T.hullLayer;
      if (T.hullRoofOn) { HU.r[i * 4] = T.base.sy; HU.r[i * 4 + 1] = T.hullRoofQ[0]; HU.r[i * 4 + 2] = T.hullRoofQ[1]; HU.r[i * 4 + 3] = sea; }   // 頂面（hullRoof）：sy、極端點的縮放、船中心的海面（積水區破了沒照它比，⛔ 照每一點自己的浪 ⇒ 浪峰一過局部判破、又碎）；0 ⇒ 只用側視
      HU.y[i * 4] = s.M[1]; HU.y[i * 4 + 1] = s.M[5]; HU.y[i * 4 + 2] = s.M[9]; HU.y[i * 4 + 3] = s.M[13];   // 格 → 世界的高度那一列（出口那一點在世界多高）
    }
  }
  gl.uniform1fv(u.uHide, HU.hide); gl.uniformMatrix4fv(u.uInv, false, HU.inv); gl.uniform4fv(u.uHullK, HU.k); gl.uniform4fv(u.uHullR, HU.r); gl.uniform4fv(u.uHullY, HU.y);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, HULLA.tex); gl.uniform1i(u.uHullA, 1);
  gl.activeTexture(gl.TEXTURE0);
}
/** 畫一格：一段一段叫（GL 的呼叫順序跟以前整支寫在一起時一樣）—— 準備（frameBegin）→ 陰影圖 → 反射 → 主畫面的不透明（mainOpaque）→ 海（mainWater）→ 半透明、粒子、雨（mainOverlay）→ 收尾（frameEnd）。
 *  ⛔ 主畫面那幾段的函式名不帶 shadow／csm／refl（量測的工具照呼叫堆疊的名字分哪一趟；堆疊別疊太深）。 */
function render() {
  var fr = frameBegin();
  if (GFX.shadow && !cutOn()) shadowPass(); else SHM.on = false;   // 剖面、隱藏甲板開著 ⇒ 不算陰影（拿掉的甲板不擋光；74_cutaway.js）
  shadowMats();
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D_ARRAY, SHM.tex);   // 陰影圖陣列：固定第 4 號（01_gl.js SHADOW_GLSL）
  gl.activeTexture(gl.TEXTURE0);
  viewVis();                                                             // 反射、主畫面：鏡頭外的船不畫（60_rbatch.js，TASK-0813）—— 陰影判完、鏡頭定了才判
  if (RT.R) reflPass();
  mainOpaque(fr); mainWater(fr); mainOverlay(fr); frameEnd(fr);
  RBAT.pd.rf.b = RBAT.pd.mn.b = 0;                                       // 這一格以外沒人照它畫 ⇒ 放回全畫
}
/** 一格的準備：畫布大小、閃電與世界時間的天色、framebuffer、陰影圖、遮罩的格、燈、帆與繩的緩衝、地形網格 ⇒ fr（之後幾段要的：畫的大小、要還原的天色）。 */
function frameBegin() {
  resize(); var w = CAM.w, h = CAM.h; RFR++;                          // RFR：這一格的模型表（rbatPrep）、地形網格（bedBuild）照它
  // 閃電（天氣，08_weather.js）：那一格的天空與環境光拉亮、0.3 秒內退掉；雷聲照距離延後（340 m/s）。只在畫面，畫完把天色還回去（frameEnd）
  var bolt = wxBolt(SIMT), sky0 = SKY, hor0 = HORIZON, tod0 = todApply();   // 世界時間（08_weather.js；有 ?tod= 才開）：太陽、天色照時刻 —— 在記下 sky0／hor0 之後套（⛔ 之前 ⇒ 結尾還原成套過的、一格一格疊上去）
  if (bolt && bolt.f > 0) { SKY = lerp3(SKY, [0.82, 0.86, 0.98], bolt.f * 0.7); HORIZON = lerp3(HORIZON, [0.76, 0.79, 0.88], bolt.f * 0.6); }
  if (bolt && bolt.n !== LAST_BOLT) { LAST_BOLT = bolt.n; if (RUNNING && !STILL) setTimeout(function () { sfx('thunder', null, 1 / (1 + bolt.d / 1500)); }, bolt.d / 340 * 1000); }
  targets(w, h); shadowMaps(); gpuSlots(); shadowGrow(); lampsUpdate();             // gpuSlots：這一格船艙遮罩給哪幾艘（視野裡最近的幾艘：畫質設定）
  if (!DUMMY) { DUMMY = mkTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 1, 1, false); }
  prepRig();
  rbatPrep();                                                            // 模型那一段的表（60_rbatch.js）：陰影、反射、主畫面照同一張畫
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D_ARRAY, null); gl.activeTexture(gl.TEXTURE0);   // 畫陰影圖時不綁著它（⛔ 綁著 ⇒ 讀寫同一張）
  bedBuild();                                                            // 這一格要換的地形網格先建（63_bed_gl.js）⇒ 陰影與主畫面用同一份
  return { w: w, h: h, sky0: sky0, hor0: hor0, tod0: tod0 };
}
/** 主畫面的不透明：天、船殼、碎片、船員、模型、旗、繩、鏈彈、帆、陸地、樹、城鎮。 */
function mainOpaque(fr) {
  var w = fr.w, h = fr.h;
  gl.bindFramebuffer(gl.FRAMEBUFFER, RT.A.fb); gl.viewport(0, 0, w, h);
  gl.clearColor(HORIZON[0], HORIZON[1], HORIZON[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  // 天
  gl.depthMask(false); gl.useProgram(P.sky.prog); setCommon(P.sky); gl.uniformMatrix4fv(P.sky.u.uInv, false, CAM.inv);
  gl.uniform3fv(P.sky.u.uSunC, SUNC); if (P.sky.u.uNight) gl.uniform1f(P.sky.u.uNight, TOD_NIGHT);   // 太陽（夜裡是月亮）圓盤的顏色、星星（08_weather.js；沒開世界時間 ⇒ 照舊的太陽、沒有星星）
  gl.bindVertexArray(SKYVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true);
  // 船與斷開的那幾團
  // 船的矩陣是鏡射（shipBaseMatrix：照雕刻引擎的手性）⇒ 船殼的正面變成順時針；帆的著色器看 gl_FrontFacing 翻法線，也要跟著
  gl.enable(gl.CULL_FACE); gl.frontFace(gl.CW); gl.useProgram(P.vox.prog); setCommon(P.vox); drawHulls(P.vox, RBAT.pd.mn); gl.frontFace(gl.CCW);
  // 碎片
  var n = 0;
  for (var i = 0; i < D.n; i++) {                                     // ⛔ 每顆不配置（S11：最多 DMAX 顆）—— 黏在船上的照 M4.pt 同一條算式就地算
    var o = i * 3, k = n * 9, fade = Math.min(1, D.life[i] / 1.5), x = D.p[o], y = D.p[o + 1], z = D.p[o + 2];
    if (D.st[i] === 2) { var Ms = SHIPS[D.ship[i]].M; DINST[k] = Ms[0] * x + Ms[4] * y + Ms[8] * z + Ms[12]; DINST[k + 1] = Ms[1] * x + Ms[5] * y + Ms[9] * z + Ms[13]; DINST[k + 2] = Ms[2] * x + Ms[6] * y + Ms[10] * z + Ms[14]; }
    else { DINST[k] = x; DINST[k + 1] = y; DINST[k + 2] = z; }
    DINST[k + 3] = D.size[i] * fade;
    DINST[k + 4] = D.q[i * 4]; DINST[k + 5] = D.q[i * 4 + 1]; DINST[k + 6] = D.q[i * 4 + 2]; DINST[k + 7] = D.q[i * 4 + 3]; DINST[k + 8] = D.col[i] + D.sh[i] * 256; n++;   // 形狀放在色的 256 以上（01_gl.js P.deb）
  }
  if (n) {
    gl.useProgram(P.deb.prog); setCommon(P.deb); gl.bindVertexArray(DEBVAO); gl.bindBuffer(gl.ARRAY_BUFFER, DEBBUF); gl.bufferSubData(gl.ARRAY_BUFFER, 0, DINST, 0, n * 9);
    gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, n);
  }
  drawCrew();
  // 模型、繩與帆
  gl.disable(gl.CULL_FACE); gl.useProgram(P.tri.prog); setCommon(P.tri);
  gl.uniform1f(P.tri.u.uLit, 1); drawModels(P.tri, RBAT.pd.mn); drawColours(P.tri, RBAT.pd.mn);   // 陣營旗（77_colours.js）
  gl.uniform1f(P.tri.u.uLit, 0); gl.vertexAttrib3f(1, 0, 1, 0);
  for (var j = 0, ns = SHIPS.length, no = ns + PIECES.length, bm = RBAT.pd.mn.b; j < no; j++) {   // 船、再斷開的那一團（⛔ SHIPS.concat(PIECES)：每格一個新陣列）；j ＝ RBAT 的 owner 順序（bm：鏡頭外的不畫，viewVis）
    var ow = j < ns ? SHIPS[j] : PIECES[j - ns];
    if (ow.sink > 40 || (bm && !(RBAT.cs[j] & bm))) continue;
    cutSet(P.tri, ow); gl.uniformMatrix4fv(P.tri.u.uModel, false, ow.M);
    if (ow.lines && ow.lines.n) { gl.bindVertexArray(ow.lines.vao); gl.drawArrays(gl.LINES, 0, ow.lines.n); }
    if (PHYS && ow.ll && ow.ll.n) { gl.bindVertexArray(ow.ll.vao); gl.drawArrays(gl.LINES, 0, ow.ll.n); }
    if (ow.chain && ow.chain.n) { gl.bindVertexArray(ow.chain.vao); gl.drawArrays(gl.LINES, 0, ow.chain.n); }
    if (ow.ropeT && ow.ropeT.n) { gl.bindVertexArray(ow.ropeT.vao); gl.drawArrays(gl.TRIANGLES, 0, ow.ropeT.n); }   // 繩梯的繩：管子（11_rig_gpu.js ropeTube）
    if (BLD.on && ow.bldLines && ow.bldLines.n) { gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(ow.bldLines.vao); gl.drawArrays(gl.LINES, 0, ow.bldLines.n); gl.enable(gl.DEPTH_TEST); }   // 建造的預覽框（82_build.js bldLines；穿牆看得到）
    if ((ROOMS_DBG || (BLD.on && BLD.lines)) && ow.rooms && ow.rooms.length) { if (!ow.roomLines) roomLines(ow); gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(ow.roomLines.vao); gl.drawArrays(gl.LINES, 0, ow.roomLines.n); gl.enable(gl.DEPTH_TEST); }   // 空艙房的外框（?rooms=1；穿過船殼看得到）
  }
  if (BALLS.some(function (b) { return b.ammo === 2; })) {               // 鏈彈的鐵鍊（76_anchor.js csBuf；世界座標）
    var csl = csBuf(); if (csl.n) { cutSet(P.tri, null); gl.uniformMatrix4fv(P.tri.u.uModel, false, CS_ID || (CS_ID = M4.ident())); gl.bindVertexArray(csl.vao); gl.drawArrays(gl.LINES, 0, csl.n); }
  }
  gl.frontFace(gl.CW); gl.useProgram(P.sail.prog); setCommon(P.sail); drawSails(P.sail, RBAT.pd.mn); gl.frontFace(gl.CCW);
  bedDraw();                                                             // 陸地與海底（63_bed_gl.js；有海圖才有）
  treeDraw();                                                            // 島上的樹（63_trees.js）
  townDraw();                                                            // 城鎮（63_towns.js；有城才有）
  twbDraw();                                                             // 城鎮建築模式的預覽（87_townbuild.js：半透明的房子與路面帶、線框；⛔ 要在地形、樹、城之後）
}
/** 主畫面的海：折射複製、海面、破洞底下的海、遠海、內陸水、陰影範圍的除錯線。 */
function mainWater(fr) {
  var w = fr.w, h = fr.h;
  // 折射（高）：畫海之前的場景複製到 RT.B（顏色＋深度），海的著色器讀它
  if (GFX.refr === 2) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, RT.A.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, RT.B.fb);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, RT.A.fb);
  }
  // 海
  if (GFX.refr) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
  if (!SEAG || SEAG.lv !== GFX.sea) seaGrid(GFX.sea);
  gl.useProgram(P.water.prog); setCommon(P.water); gl.uniform1f(P.water.u.uDet, SEA_DBG.det !== undefined ? SEA_DBG.det : SEA_LV[GFX.sea].det); gl.uniform1f(P.water.u.uAn, SEA_DBG.an !== undefined ? SEA_DBG.an : 1);
  gl.uniform1f(P.water.u.uNzP, SEA_DBG.p !== undefined ? SEA_DBG.p : SEA_NZ_P);   // 打散重複：細漣漪每道的相位雜訊（01_gl.js detail）   // SEA_DBG：海面試驗場（src/tests/sea_lab.py，__game.seaDbg）才給；平常 {} ⇒ 照畫質
  if (SEA_DBG.c) gl.uniform2f(P.water.u.uC, SEA_DBG.c[0], SEA_DBG.c[1]); else   // 除錯：網格中心釘在世界的 c（只挪網格、鏡頭不動 ⇒ 量畫面跟不跟著網格變）
  gl.uniform2f(P.water.u.uC, Math.round(CAM.eye[0] / SEAG.snap) * SEAG.snap, Math.round(CAM.eye[2] / SEAG.snap) * SEAG.snap);   // 中心照網格間距對齊 ⇒ 近處的頂點不在浪上滑動
  gl.uniform1f(P.water.u.uReflOn, RT.R ? 1 : 0); gl.uniform1f(P.water.u.uRefr, GFX.refr); gl.uniform2f(P.water.u.uView, w, h);
  gl.uniform1f(P.water.u.uRefrD, BED ? 1600 : 500); gl.uniform1f(P.water.u.uRefrK, BED ? 0.12 : 0.3);
  gl.uniform1f(P.water.u.uEdge, SEA_DBG.edge !== undefined ? SEA_DBG.edge : SEA_EDGE_ON);   // 岸線照像素（01_gl.js shoreW）
  gl.uniform1f(P.water.u.uDbgM, SEA_DBG.m || 0);   // 除錯：1 岸邊白沫、2 太陽反光、4 水面的影子、8 淺水透明 —— 加起來 ＝ 一起關
  var sw = SEA_DBG.sw || [SEA_EDGE[1], SEA_EDGE[2], SEA_EDGE[3], SEA_SURF[2]];   // 岸線細碎、沖刷、碎浪的高度、碎浪那一圈多寬（__game.seaDbg 的 sw 可以覆寫）
  if (!bedShoreOn()) sw = [sw[0], 0, 0, 0];                              // 離岸距離場還沒到（63_bed_gl.js BEDSHW 在 Worker 算）⇒ 碎浪、沖刷先關（⛔ 照空的貼圖 d ＝ 0 ⇒ 每一處都當岸邊、低地整片被沖刷淹）
  gl.uniform4f(P.water.u.uSw, sw[0], sw[1], sw[2], sw[3]);
  bedWaterU(P.water.u);                                                  // 岸邊的白沫（63_bed_gl.js；沒有海圖 ⇒ 關）   // 水下透出來的東西多遠就看不到（m）、每公尺吸掉多少：有海圖 ⇒ 淺海的礁、沙洲看得出顏色（TASK-0721）；沒有 ⇒ 照舊 500 m、0.3
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, RT.R ? RT.R.col : DUMMY); gl.uniform1i(P.water.u.uRefl, 6);
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, RT.B.col); gl.uniform1i(P.water.u.uScene, 7);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, RT.B.dep); gl.uniform1i(P.water.u.uSceneD, 3);
  hullUniforms(P.water);
  gl.uniform1f(P.water.u.uXr, FLX3 || CUTV.half ? 1 : 0);              // 停格的「🔍 透視」、剖面：船附近的海面不畫（72_floodui.js、74_cutaway.js；只拿掉甲板 ⇒ 船殼裡本來就不畫海，船邊照畫）
  for (var i = 0; i < MASK_NEAR; i++) {                                  // 遮罩的格（gpuSlots MSLOTS）：排不進去的船沒有透視（⛔ 每格 MASK_NEAR 個閉包）
    var s = MSLOTS[i], b = s ? xrBox(s.T) : null, e = s && CUTV.half ? cutSide(s) * XR_CUT : 0;   // 剖面：往鏡頭那一側多拿掉 XR_CUT 格（⛔ 只拿船邊 6 m ⇒ 從側面看，鏡頭到船之間的海面把水線下整片擋住）
    HU.xb[i * 4] = b ? b[0] : 0; HU.xb[i * 4 + 1] = b ? b[1] + e / 2 : 0; HU.xb[i * 4 + 2] = b ? b[2] : -1e9; HU.xb[i * 4 + 3] = b ? b[3] + Math.abs(e) / 2 : -1e9;
  }
  gl.uniform4fv(P.water.u.uXb, HU.xb);
  gl.bindVertexArray(SEAG.vao); gl.drawElements(gl.TRIANGLES, SEAG.n, gl.UNSIGNED_INT, 0);
  abyssDraw();                                                           // 破洞底下的海（TASK-0643；01_gl.js P.abyss）：海在船殼外形裡被丟掉、又什麼都沒畫到的像素 ⇒ 深海色
  bedSeaDraw();                                                          // 遠海（63_bed_gl.js；只有海圖、鏡頭高於 3 km：轉場拉高時海面網格外面的那一圈）
  bedWaterDraw();                                                        // 內陸水：湖、河、瀑布的水幕（63_bed_gl.js；海圖塊有段 3 才有）
  shadowDebugFill(w, h);                                                 // 陰影範圍的除錯塗色＋地表上的邊框（同一個開關；下面 shadowDebugFill）
  shadowDebugDraw();                                                     // 陰影範圍的除錯線（Debug 模式才畫；下面 shadowDebugDraw）
}
/** 主畫面的半透明與最上面那幾層：白沫、艙內的水、玻璃、城裡的燈、粒子＋砲彈、3D 雨滴、雨。 */
function mainOverlay(fr) {
  var w = fr.w, h = fr.h;
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  if (!FLX3 && !CUTV.half) wpDrawFoam(hullUniforms);                                              // 船邊水花的白沫（13_water.js）：貼著浪、不寫深度
  flDraw();                                                              // 艙內的水面（33_flood.js，粒子模式）
  glsDraw();                                                             // 玻璃（15_smooth.js；TASK-0753）：半透明、不寫深度 ⇒ 不透明的、海、艙內的水都畫完才畫
  townGlsDraw();                                                         // 城裡建築的玻璃（63_towns.js；同上那一套，近那一級才畫）
  shipWinDraw();                                                         // 船窗夜裡亮（63_shipwin.js；同上，白天、沒開世界時間不畫）
  townGlowDraw();                                                        // 城裡夜裡的燈：亮窗、光點（63_towns.js；加法、不寫深度 ⇒ 同上；白天不畫）
  inspHiDraw();                                                          // 船隻觀察勾了的部件高亮（86_inspect.js；隔著船殼看得到 ⇒ 透明的都畫完才畫；沒勾 ⇒ 一行就回）
  // 粒子＋砲彈＋瞄準點
  var m = 0;
  function pushPt(p, s, c, a, ty) { if (m * 9 >= PBUF.length) return; var k = m * 9; PBUF[k] = p[0]; PBUF[k + 1] = p[1]; PBUF[k + 2] = p[2]; PBUF[k + 3] = s; PBUF[k + 4] = c[0]; PBUF[k + 5] = c[1]; PBUF[k + 6] = c[2]; PBUF[k + 7] = a; PBUF[k + 8] = ty === undefined ? -1 : ty; m++; }
  for (var i = 0; i < PT.n && m * 9 < PBUF.length; i++) {               // 粒子：照 pushPt 的欄位直接寫（⛔ 每顆不配置，S11；滿了 ⇒ pushPt 也是什麼都不寫）
    var f = PT.life[i] / PT.max[i], s = PT.s1[i] + (PT.s0[i] - PT.s1[i]) * f, k = m * 9, j = i * 3, ty = PT.ty[i];
    PBUF[k] = PT.p[j]; PBUF[k + 1] = PT.p[j + 1]; PBUF[k + 2] = PT.p[j + 2]; PBUF[k + 3] = s; PBUF[k + 4] = PT.c[j]; PBUF[k + 5] = PT.c[j + 1]; PBUF[k + 6] = PT.c[j + 2];
    PBUF[k + 7] = PT.a[i] * Math.min(1, f * 3); PBUF[k + 8] = ty === undefined ? -1 : ty; m++;
  }
  wpPushSpray(pushPt);                                                   // 船邊水花的水滴（13_water.js）
  flPushJets(pushPt);                                                    // 從破口噴進來的水（33_flood.js）
  rdPushSplash(pushPt);                                                  // 雨滴打在海面與船上的水花（14_rain.js）
  lanternHalo(pushPt);                                                   // 燈籠的光暈
  BALLS.forEach(function (b) {
    if (b.gf) { pushPt(b.p, 0.75, [1, 0.5, 0.1], 1); pushPt(sub(b.p, mul(b.v, 0.03)), 0.5, [1, 0.25, 0.05], 0.8); return; }   // 希臘火：一團火＋拖尾（28_fire.js）
    if (b.bolt) { var bv = norm(b.v); pushPt(b.p, 0.12, [0.2, 0.2, 0.22], 1); for (var bk = 1; bk <= 6; bk++) pushPt(sub(b.p, mul(bv, bk * 0.18)), 0.09, [0.42, 0.28, 0.13], 1);   // 弩箭：鐵頭＋1 m 的木桿（10_ship.js AMMO_BOLT）
      if (b.fire) { pushPt(sub(b.p, mul(bv, 0.15)), 0.34, [1, 0.55, 0.12], 0.95); pushPt(sub(b.p, mul(bv, 0.4)), 0.24, [1, 0.3, 0.05], 0.7); }   // 火箭：箭頭後面綁著一團火（AMMO_FIRE）
      return; }
    if (b.stone) { pushPt(b.p, 0.42, [0.46, 0.44, 0.4], 1); return; }   // 石彈（投石機，AMMO_STONE）：一顆灰石頭
    if (b.ammo !== 2) { pushPt(b.p, 0.32, [0.08, 0.08, 0.08], 1); return; }
    var w = csBar(b); pushPt(sub(b.p, mul(w, CS_HALF)), 0.32, [0.08, 0.08, 0.08], 1); pushPt(add(b.p, mul(w, CS_HALF)), 0.32, [0.08, 0.08, 0.08], 1);   // 鏈彈：鍊子兩頭各一顆（21_gunnery.js csBar）
  });
  var mWorld = m;                                                       // mWorld 之後的：另一批畫、不做深度測試（被船身擋住也看得到；透視時的破口標記）。瞄準圈改在 UI 層畫（61_hud.js aimRingUi）
  if (FLX3) flHoleMarks(pushPt);                                         // 停格的「🔍 透視」開著：破口畫成點、隔著船殼看得到（72_floodui.js）
  if (m) {
    gl.depthMask(false); gl.useProgram(P.pt.prog); setCommon(P.pt); gl.uniform1f(P.pt.u.uPx, CAM.h / (2 * Math.tan(0.45)));
    gl.uniform1f(P.pt.u.uUseFx, FX_TEX ? 1 : 0); if (FX_TEX) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, FX_TEX); gl.uniform1i(P.pt.u.uFx, 0); }
    gl.bindVertexArray(PTVAO); gl.bindBuffer(gl.ARRAY_BUFFER, PTBUF); gl.bufferSubData(gl.ARRAY_BUFFER, 0, PBUF, 0, m * 9);
    if (mWorld) gl.drawArrays(gl.POINTS, 0, mWorld);
    if (m > mWorld) { gl.disable(gl.DEPTH_TEST); gl.drawArrays(gl.POINTS, mWorld, m - mWorld); gl.enable(gl.DEPTH_TEST); }
    gl.depthMask(true);
  }
  rdDraw();                                                              // 3D 雨滴（14_rain.js；畫質的「雨滴（3D）」）：做深度測試、不寫深度
  // 雨（天氣 × 畫質的「雨」）：最上面一層，不做深度測試
  var rk = WX.rain * [0, 0.55, 1][GFX.rain || 0];
  if (rk > 0) {
    gl.enable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.useProgram(P.rain.prog);
    gl.uniform1f(P.rain.u.uT, SIMT); gl.uniform1f(P.rain.u.uRain, rk); gl.uniform2f(P.rain.u.uView, w, h);
    gl.uniform1f(P.rain.u.uYaw, Math.atan2(CAM.look[2] - CAM.eye[2], CAM.look[0] - CAM.eye[0]));
    gl.bindVertexArray(SKYVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.enable(gl.DEPTH_TEST);
  }
}
/** 一格的收尾：天色還原（閃電、世界時間）、RT.A 解析、縮放貼到畫布。 */
function frameEnd(fr) {
  var w = fr.w, h = fr.h;
  SKY = fr.sky0; HORIZON = fr.hor0; todRestore(fr.tod0);
  gl.disable(gl.BLEND); gl.bindVertexArray(null);
  // 收尾：RT.A（MSAA ⇒ 先解析到 RT.B）縮放貼到畫布
  var src = RT.A.fb;
  if (RT.s) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, RT.A.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, RT.B.fb); gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST); src = RT.B.fb; }
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, cv.width, cv.height, gl.COLOR_BUFFER_BIT, w === cv.width && h === cv.height ? gl.NEAREST : gl.LINEAR);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}


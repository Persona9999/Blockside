// ───────────────────────── 一格要畫的模型表（RBAT；render 管線大修 S2）─────────────────────────
// 模型那一段（drawModels：船的模型 → 裝飾 → 平滑面 → 裝甲的平滑面，斷開的那一團的模型，飛出去的模型）一格只整理一次（rbatPrep：frameBegin 裡、prepRig 之後），
//   陰影的每一段、反射、主畫面都照這一張表重播（rbatReplay）⇒ GL 的呼叫跟以前每一趟自己走一遍逐一相同（同樣的判斷、順序、uniform 的值）。
// 一格一張表（rbatPrep）：世界矩陣照以前同一條算式、同一個捨入點（⛔ 不合併乘法、不跨格留：d.L、m.vsl、ancD 原地改，renderLerp 每格換 sh.M，remesh 換 smR）。
//   以前的 modelWorld（WeakMap，每個模型每格一個快取物件、一個閉包）拿掉；斷開的那一團的模型以前每一趟各乘一次，現在一格一次。
// 畫的東西（owner）：0..ns-1 ＝ SHIPS（沉了 sink > 40 的沒有項目）、ns..n-1 ＝ PIECES；cs ＝ 陰影第 k 段畫不畫（第 k 位，60_render.js csmIn 填）。
// 項目（item）照以前畫的順序排；FLY（飛出去的模型）沒有 owner，排在最後（i0[n] 起）。陣列不夠才加倍、之後一直重用（艦隊實驗室最多 FLEET_MAX 艘、斷開的那一團沒有上限）。
// ⛔ 只讀模擬的狀態：表、矩陣都是 RBAT 自己的陣列；meshGpu（家具第一次畫到才上傳）照以前只給要畫的。
// 一次畫多個（instanced；S4 起）：網址的開關（RBAT_ON／RBAT_INST／RBAT_GEO／RBAT_TAU）、uMs 的矩陣 RBAT.pal、能不能用的對拍 __rbatProbe（檔尾）；程式在 01_gl.js（P.triI／P.dtriI）。
var RBAT = {
  f: -1,                                                             // 這張表是第幾次 render()（RFR）
  n: 0, ns: 0, own: [], nPrev: 0,                                    // owner：船、再斷開的那一團
  i0: new Int32Array(17),                                            // 第 o 個的項目 ＝ [i0[o], i0[o + 1])；i0[n] 起是 FLY
  cs: new Uint8Array(16),                                            // 陰影：第 k 段畫不畫（第 k 位；rbatPrep 清、csmIn 填）
  cst: new Uint8Array(16), cp: new Float64Array(48), cR: new Float64Array(16),   // 陰影的外接球（60_render.js csmOwners）：0 不畫（沉了）／1 一定畫（斷開的那一團沒有中心）／2 照球判；中心、半徑
  ni: 0, cap: 0, niPrev: 0,
  cls: null,                                                         // 0 模型、1 裝飾、2 平滑面（一區）、3 裝甲的平滑面（一區）、4 斷開的那一團的模型、5 飛出去的模型
  ow: null, slot: null,                                              // 哪一個 owner（FLY ＝ −1）；第幾個（sh.models／sh.decos／smR 的 Map 裡第幾個／pc.mods／FLY）
  el: null, off: null, cnt: null, vao: [],                           // 畫法：0 drawArrays、1 drawElements（UNSIGNED_INT）；索引從第幾個 byte（平滑面一區一份 ⇒ 0）；幾個頂點／索引；VAO
  glow: null, M: null,                                               // uGlow（燈：lanternK，其他 0；Float64Array ⇒ 存的就是以前傳的那個 double）；世界矩陣（第 i 個在 M[i·16 …]）
  ref: [],                                                           // 矩陣從誰算（m／d／sh／裝甲那一塊 a／斷開的那一團的 m／f）：?rbchk=1 對拍用
  // 每一趟（pass descriptor）：b ＝ 只畫 cs 有這一位的 owner（0 ⇒ 全畫）；depth ＝ 只寫深度
  pd: { sh: { name: 'sh', k: 0, b: 0, depth: true }, rf: { name: 'rf', k: -1, b: 0, depth: false }, mn: { name: 'mn', k: -1, b: 0, depth: false } },
  pal: new Float32Array(INST_MAX * 16),                              // 一次畫多個的矩陣（P.triI／P.dtriI 的 uMs）：一批最多 INST_K 個，照 16 個 float 抄 RBAT.M（長度照上限 ⇒ 不用等 programs()）
  gl: {},                                                            // 這裡建的 GL 物件（pb ＝ 對拍的分身程式與轉換回饋的緩衝）記在一處 ⇒ 以後要處理 context lost 照這裡重建
  stat: { f: -1, owners: 0, items: 0, chk: 0, matMiss: 0, itemMiss: 0 }   // 讀數（__rbat.stat）：matMiss／itemMiss ＝ ?rbchk=1 對拍不一樣的項目數（量測工具 > 0 ⇒ 不過）
};
var RBAT_CHK = Q.get('rbchk') === '1';                             // ?rbchk=1：每格整理完照以前的算式重算一遍、逐位元比（rbatCheck）
// 開關（網址，像 ?lerp=0；量測工具拿同一份成品 A/B 對拍用 —— 不進設定、不進 __game）：?rb=0 全部照以前一個一個畫；?rbinst=0（或 ?inst=0）不用一次畫多個的程式；
//   ?rbgeo=0 同一艘裡不換順序；?rbtau=<公尺> 除錯用的 τ（很大 ⇒ 全部算一群；沒給 ⇒ −1 ＝ 照算的）。照它們畫的：陰影（S5，rbatDepth）；反射、主畫面還是一個一個畫（S6／S7 起）。
var RBAT_ON = Q.get('rb') !== '0', RBAT_INST = RBAT_ON && Q.get('rbinst') !== '0' && Q.get('inst') !== '0', RBAT_GEO = RBAT_ON && Q.get('rbgeo') !== '0';
var RBAT_TAU = isFinite(parseFloat(Q.get('rbtau'))) ? parseFloat(Q.get('rbtau')) : -1;
/** 項目的陣列加倍（整理到一半也行：前面的照抄）。 */
function rbatGrow() {
  var R = RBAT, L = Math.max(256, R.cap * 2);
  function cp(a, b) { if (a) b.set(a); return b; }
  R.cls = cp(R.cls, new Uint8Array(L)); R.ow = cp(R.ow, new Int32Array(L)); R.slot = cp(R.slot, new Int32Array(L)); R.el = cp(R.el, new Uint8Array(L));
  R.off = cp(R.off, new Int32Array(L)); R.cnt = cp(R.cnt, new Int32Array(L)); R.glow = cp(R.glow, new Float64Array(L)); R.M = cp(R.M, new Float32Array(L * 16));
  R.cap = L;
}
/** 加一個項目；W ＝ 世界矩陣（M4.mul 的 Float32Array、sh.M、f.M：照抄 16 個值 ⇒ 跟以前直接傳給 uniformMatrix4fv 的一樣）。 */
function rbatAdd(c, o, k, ref, vao, el, off, cnt, glow, W) {
  var R = RBAT, i = R.ni;
  if (i >= R.cap) rbatGrow();
  R.cls[i] = c; R.ow[i] = o; R.slot[i] = k; R.ref[i] = ref; R.vao[i] = vao; R.el[i] = el; R.off[i] = off; R.cnt[i] = cnt; R.glow[i] = glow;
  R.M.set(W, i * 16); R.ni = i + 1;
}
// 平滑面那幾區（Map 的 forEach）：照這一個的 this 加（⛔ 每格不生閉包）
var RBAT_SM = { c: 2, o: 0, k: 0, ref: null, W: null };
function rbatSmAdd(m) { var S = RBAT_SM; rbatAdd(S.c, S.o, S.k++, S.ref, m.vao, 1, 0, m.n, 0, S.W); }
/** 一格的表（render → frameBegin，prepRig 之後；一次 render() 一次，RFR）。判斷、順序、算式照以前的 drawModels／smDraw／armSmDraw 原樣抄。 */
function rbatPrep() {
  var R = RBAT, ns = SHIPS.length, n = ns + PIECES.length, o, k;
  if (n + 1 > R.i0.length) {
    var L = Math.max(n + 1, R.i0.length * 2);
    R.i0 = new Int32Array(L); R.cs = new Uint8Array(L); R.cst = new Uint8Array(L); R.cp = new Float64Array(L * 3); R.cR = new Float64Array(L);
  }
  R.f = RFR; R.n = n; R.ns = ns; R.ni = 0;
  for (o = 0; o < n; o++) {
    var ow = o < ns ? SHIPS[o] : PIECES[o - ns];
    R.own[o] = ow; R.cs[o] = 0; R.i0[o] = R.ni;
    if (o < ns) { if (!(ow.sink > 40)) rbatShip(ow, o); }
    else if (ow.mods) rbatPiece(ow, o);
  }
  R.i0[n] = R.ni;
  for (k = 0; k < FLY.length; k++) {                                  // 飛出去的模型（燈熄了、不看陰影的段：以前就沒判）
    var f = FLY[k], me = f.T.meshes[f.mesh]; if (!me || !f.M) continue; if (!me.vao) meshGpu(me);
    rbatAdd(5, -1, k, f, me.vao, 0, 0, me.n, 0, f.M);
  }
  for (o = n; o < R.nPrev; o++) R.own[o] = null;                      // 上一格多的放掉（斷開的那一團沉了、漂走了：不留著它）
  for (k = R.ni; k < R.niPrev; k++) R.vao[k] = R.ref[k] = null;
  R.nPrev = n; R.niPrev = R.ni;
  R.stat.f = RFR; R.stat.owners = n; R.stat.items = R.ni;
  if (RBAT_CHK) rbatCheck();
}
/** 一艘：模型 → 裝飾 → 平滑面 → 裝甲的平滑面。 */
function rbatShip(sh, o) {
  var T = sh.T, L = sh.models, k, m, me;
  for (k = 0; k < L.length; k++) {
    m = L[k]; me = T.meshes[m.mesh]; if (!m.alive || !me || (m.vox && !m.moved)) continue; if (!me.vao) meshGpu(me);   // m.vox：螺旋槳畫它自己的格（24_armor.js armDraw）
    var dv = m.ancD || m.vsl;                                         // 只給畫面的位移（格座標，左乘在 modelLocal 外面 ⇒ 帆的碰撞、斷船、打飛都看不到）：錨沒有 vsl、砲沒有 ancD
    rbatAdd(0, o, k, m, me.vao, 0, 0, me.n, isLamp(m) ? lanternK(m) : 0,   // 取用點的火藥桶是後加的模型，沒有 meta
      M4.mul(sh.M, dv ? M4.mul(trans(dv[0], dv[1], dv[2]), modelLocal(m)) : modelLocal(m)));   // ancD：拋下去的模型錨，畫在鐵鍊那一端（76_anchor.js chainStep）；vsl：砲門關上時砲往裡縮（62_ports.js，TASK-0719）
  }
  L = sh.decos;
  if ((GFX.deco || portOn(sh)) && L) for (k = 0; k < L.length; k++) {   // 裝飾（TASK-0682；畫質「裝飾」關著 ⇒ 不畫）；砲門蓋板：「砲門的開關演出」輪到這艘 ⇒ 不看「裝飾」（62_ports.js portOn）
    var d = L[k]; me = T.meshes[d.mesh];
    if (!me || d.gone || (!GFX.deco && d.meta.kind !== 'portlid') || (d.foot >= 0 && !hullGp(sh.grid, d.foot))) continue; if (!me.vao) meshGpu(me);   // gone：砲門蓋板被打掉了；腳下那一格被打掉 ⇒ 不畫
    rbatAdd(1, o, k, d, me.vao, 0, 0, me.n, isLamp(d) ? lanternK(d) : 0, M4.mul(sh.M, d.L || trans(d.origin[0], d.origin[1], d.origin[2])));   // L：砲門蓋板繞鉸鏈轉過的擺法（沒在動 ⇒ null ＝ 模型的樣子）
  }
  var S = RBAT_SM; S.o = o;
  if (sh.smR && sh.smR.size) { S.c = 2; S.k = 0; S.ref = sh; S.W = sh.M; sh.smR.forEach(rbatSmAdd); }   // 平滑渲染的格（15_smooth.js）：跟模型同一支著色器
  if (sh.arm) for (k = 0; k < sh.arm.length; k++) {                  // 砲帶的裝甲的平滑面（24_armor.js；螺旋槳掉了 ⇒ 不畫）
    var a = sh.arm[k]; if (!(a.smR && a.smR.size && !(a.prop && propGone(a)))) continue;
    S.c = 3; S.k = 0; S.ref = a; S.W = armM(a); a.smR.forEach(rbatSmAdd);
  }
  S.ref = S.W = null;
}
/** 斷開的那一團：跟著它走的模型。 */
function rbatPiece(pc, o) {
  for (var k = 0, L = pc.mods; k < L.length; k++) {
    var m = L[k], me = pc.T.meshes[m.mesh]; if (!me) continue; if (!me.vao) meshGpu(me);
    rbatAdd(4, o, k, m, me.vao, 0, 0, me.n, 0, M4.mul(pc.M, m.L));
  }
}
/** 照表畫模型那一段（60_render.js drawModels）：prog ＝ 這一趟的程式（P.tri／P.dtri，呼叫的人已經 useProgram＋setCommon）、pd ＝ 哪一趟。
 *  GL 的呼叫照以前的順序：aM 常數 → 每艘（cutSet；模型、裝飾：uModel、uGlow、畫；平滑面、裝甲的平滑面：一份網格開頭 uModel＋uGlow 0、每區畫）
 *  → uGlow 0、cutSet(null) → 斷開的那一團的模型（照陰影的段）→ 飛出去的模型。畫完：prog 還綁著、uGlow 0、剖面關（之後的旗桿、繩、鏈彈照這個畫）。
 *  uGlow 只在值換了才傳（S3）：g ＝ 這一趟上次傳的（每一趟從 NaN 起 ⇒ 第一個一定傳，不靠上一趟、別人留下的）；燈不多 ⇒ 一趟幾乎只傳一兩次。 */
function rbatReplay(prog, pd) {
  var R = RBAT, u = prog.u, M = R.M, b = pd.b, cs = R.cs, ns = R.ns, n = R.n, gu = u.uGlow, g = NaN, o, i, e;
  gl.vertexAttrib2f(3, 0, 0.5);                                         // P.tri 的 aM（金屬度、粗糙度；TASK-0627）：模型的 VAO 沒開這個屬性 ⇒ 讀這個常數 ⇒ 不反光（平滑渲染的 VAO 自己帶）
  for (o = 0; o < ns; o++) {
    var sh = R.own[o];
    if (sh.sink > 40 || (b && !(cs[o] & b))) continue;
    cutSet(prog, sh);                                                   // 剖面與隱藏甲板（74_cutaway.js）
    for (i = R.i0[o], e = R.i0[o + 1]; i < e; i++) {
      if (R.cls[i] < 2) {
        gl.uniformMatrix4fv(u.uModel, false, M, i * 16, 16);
        if (gu && R.glow[i] !== g) gl.uniform1f(gu, g = R.glow[i]);
        gl.bindVertexArray(R.vao[i]); gl.drawArrays(gl.TRIANGLES, 0, R.cnt[i]);
      } else {                                                          // 平滑面：一份網格（這艘的、裝甲的那一塊）第一區設矩陣、燈熄
        if (!R.slot[i]) { gl.uniformMatrix4fv(u.uModel, false, M, i * 16, 16); if (gu && g !== 0) gl.uniform1f(gu, g = 0); }
        gl.bindVertexArray(R.vao[i]); gl.drawElements(gl.TRIANGLES, R.cnt[i], gl.UNSIGNED_INT, R.off[i]);
      }
    }
  }
  if (gu && g !== 0) gl.uniform1f(gu, 0);                              // 斷開的那一團、飛出去的模型：燈熄了（已經是 0 ⇒ 不再傳）
  cutSet(prog, null);
  for (o = ns; o < n; o++) {                                            // 跟著斷開的那一團走的模型
    if (b && !(cs[o] & b)) continue;
    for (i = R.i0[o], e = R.i0[o + 1]; i < e; i++) { gl.uniformMatrix4fv(u.uModel, false, M, i * 16, 16); gl.bindVertexArray(R.vao[i]); gl.drawArrays(gl.TRIANGLES, 0, R.cnt[i]); }
  }
  for (i = R.i0[n], e = R.ni; i < e; i++) { gl.uniformMatrix4fv(u.uModel, false, M, i * 16, 16); gl.bindVertexArray(R.vao[i]); gl.drawArrays(gl.TRIANGLES, 0, R.cnt[i]); }
}
// ── 陰影一次畫多個（render 管線大修 S5）──
// 陰影那一段只寫深度、深度測試 LESS、不混色、偏移照每個三角形自己的頂點算 ⇒ 每一格最後留下的就是最小的那個深度，誰先畫都一樣
//   ⇒ 同一份網格（VAO＋畫法＋起點＋數量）的項目不分哪艘、哪一類（模型、裝飾含砲門蓋板、平滑面、裝甲的平滑面、斷開的那一團、飛出去的）收成一桶，一桶一次畫（P.dtriI，滿 INST_K 個換下一批）。
// 桶一格整理一次（第一段陰影要畫時；表是這一格的）；每一段只挑 cs 有這一位的 owner、FLY 沒有 owner ⇒ 一定畫（以前也沒判；這一段有東西才會走到這裡）
//   ⇒ 畫的項目集合跟以前一個一個畫的一模一樣，頂點的算式是 S4 對拍過的 P.dtriI ⇒ 陰影圖逐位元組相同。
// 桶：同一個 VAO 的串成一列（same；模型一份網格一個 VAO ⇒ 幾乎都只有一桶），桶裡的項目照表的順序串起來（nx）。陣列不夠才加倍、之後一直重用（⛔ 每格不配置）。
var RBAT_BK = { f: -1, n: 0, nPrev: 0, cap: 0, map: new Map(), vao: [], el: null, off: null, cnt: null, h: null, t: null, same: null, nx: new Int32Array(0) };
function rbatBkGrow() {
  var B = RBAT_BK, L = Math.max(64, B.cap * 2);
  function cp(a, b) { if (a) b.set(a); return b; }
  B.el = cp(B.el, new Uint8Array(L)); B.off = cp(B.off, new Int32Array(L)); B.cnt = cp(B.cnt, new Int32Array(L));
  B.h = cp(B.h, new Int32Array(L)); B.t = cp(B.t, new Int32Array(L)); B.same = cp(B.same, new Int32Array(L)); B.cap = L;
}
/** 這一格的桶（一格一次；RFR 換了才重排）。 */
function rbatBuckets() {
  var R = RBAT, B = RBAT_BK, m = B.map, i, j;
  if (B.f === R.f) return B;
  B.f = R.f; B.n = 0; m.clear();
  if (B.nx.length < R.cap) B.nx = new Int32Array(R.cap);
  for (i = 0; i < R.ni; i++) {
    var v = R.vao[i], el = R.el[i], off = R.off[i], cnt = R.cnt[i], j0 = m.get(v);
    for (j = j0 === undefined ? -1 : j0; j >= 0 && !(B.el[j] === el && B.off[j] === off && B.cnt[j] === cnt); j = B.same[j]);
    B.nx[i] = -1;
    if (j < 0) {
      if (B.n >= B.cap) rbatBkGrow();
      j = B.n++; B.vao[j] = v; B.el[j] = el; B.off[j] = off; B.cnt[j] = cnt; B.h[j] = B.t[j] = i;
      B.same[j] = j0 === undefined ? -1 : j0; m.set(v, j);
    } else { B.nx[B.t[j]] = i; B.t[j] = i; }
  }
  for (j = B.n; j < B.nPrev; j++) B.vao[j] = null;                        // 上一格多的放掉（不留著已經換掉的 VAO）
  B.nPrev = B.n;
  return B;
}
/** 陰影第 pd.k 段的模型那一段（取代 drawModels(P.dtri)；60_render.js shadowCasters）：P.dtriI 一桶一次畫。 */
function rbatDepth(pd) {
  var R = RBAT, B = rbatBuckets(), p = P.dtriI, M = R.M, pal = R.pal, cs = R.cs, b = pd.b, K = INST_K, j, i, k, q, s, o;
  gl.useProgram(p.prog); setCommon(p);                                  // uVP ＝ 這一段的矩陣（PASS.vp）
  gl.vertexAttrib2f(3, 0, 0.5);                                         // 第 3 號屬性的常數照以前（rbatReplay 每一趟開頭都設；是 context 的狀態，不是 VAO 的）
  for (j = 0; j < B.n; j++) {
    for (k = 0, i = B.h[j]; i >= 0; i = B.nx[i]) {
      o = R.ow[i]; if (o >= 0 && b && !(cs[o] & b)) continue;
      for (q = 0, s = i * 16; q < 16; q++) pal[k * 16 + q] = M[s + q];
      if (++k === K) { rbatDepthDraw(B, j, p.u, k); k = 0; }
    }
    if (k) rbatDepthDraw(B, j, p.u, k);
  }
}
function rbatDepthDraw(B, j, u, k) {
  gl.uniformMatrix4fv(u.uMs, false, RBAT.pal, 0, k * 16);
  gl.bindVertexArray(B.vao[j]);
  if (B.el[j]) gl.drawElementsInstanced(gl.TRIANGLES, B.cnt[j], gl.UNSIGNED_INT, B.off[j], k);
  else gl.drawArraysInstanced(gl.TRIANGLES, 0, B.cnt[j], k);
}
/** ?rbchk=1：照以前 drawModels／smDraw／armSmDraw 的迴圈與算式（每個矩陣重新乘一次）再走一遍，跟表逐項比：
 *  同一個東西、同一個順序、VAO／頂點數／uGlow 一樣（不一樣 ⇒ itemMiss）；矩陣 16 個 float 逐位元相同（不一樣 ⇒ matMiss）。只在 render() 裡、整理完馬上比（之後 renderLerp 會把 sh.M 換回去）。 */
function rbatCheck() {
  var R = RBAT, S = R.stat, q = 0, A = R.M && new Uint32Array(R.M.buffer), o;   // R.M：第一個項目才配（主選單、還沒有船 ⇒ null，下面也不會讀到）
  function one(c, ow, ref, me, glow, W) {
    if (q >= R.ni) { S.itemMiss++; q++; return; }
    if (R.cls[q] !== c || R.ow[q] !== ow || R.ref[q] !== ref || R.vao[q] !== me.vao || R.off[q] !== 0 || R.cnt[q] !== me.n || R.glow[q] !== glow) S.itemMiss++;
    var w = W instanceof Float32Array ? W : new Float32Array(W), B = new Uint32Array(w.buffer, w.byteOffset, 16);
    for (var j = 0; j < 16; j++) if (A[q * 16 + j] !== B[j]) { S.matMiss++; break; }
    S.chk++; q++;
  }
  SHIPS.forEach(function (sh, i) {
    if (sh.sink > 40) return;
    sh.models.forEach(function (m) {
      var me = sh.T.meshes[m.mesh]; if (!m.alive || !me || (m.vox && !m.moved)) return;
      var dv = m.ancD || m.vsl;
      one(0, i, m, me, isLamp(m) ? lanternK(m) : 0, M4.mul(sh.M, dv ? M4.mul(trans(dv[0], dv[1], dv[2]), modelLocal(m)) : modelLocal(m)));
    });
    if (GFX.deco || portOn(sh)) (sh.decos || []).forEach(function (d) {
      var me = sh.T.meshes[d.mesh]; if (!me || d.gone || (!GFX.deco && d.meta.kind !== 'portlid') || (d.foot >= 0 && !hullGp(sh.grid, d.foot))) return;
      one(1, i, d, me, isLamp(d) ? lanternK(d) : 0, M4.mul(sh.M, d.L || trans(d.origin[0], d.origin[1], d.origin[2])));
    });
    if (sh.smR && sh.smR.size) sh.smR.forEach(function (m) { one(2, i, sh, m, 0, sh.M); });
    if (sh.arm) sh.arm.forEach(function (a) { if (a.smR && a.smR.size && !(a.prop && propGone(a))) a.smR.forEach(function (m) { one(3, i, a, m, 0, armM(a)); }); });
  });
  PIECES.forEach(function (pc, j) { (pc.mods || []).forEach(function (m) { var me = pc.T.meshes[m.mesh]; if (me) one(4, R.ns + j, m, me, 0, M4.mul(pc.M, m.L)); }); });
  FLY.forEach(function (f) { var me = f.T.meshes[f.mesh]; if (me && f.M) one(5, -1, f, me, 0, f.M); });
  if (q !== R.ni) S.itemMiss++;
  for (o = 0; o <= R.n; o++) if (R.i0[o] > (o < R.n ? R.i0[o + 1] : R.ni)) S.itemMiss++;   // 每個 owner 的範圍接得起來
}
// ── 一次畫多個的程式對拍（render 管線大修 S4；?debug=1 才有 window.__rbatProbe，量測工具每一組最後叫一次；S5–S7 用 P.triI／P.dtriI 之前的閘門）──
// P.triI／P.dtriI 只差「uModel 從 uMs[gl_InstanceID] 讀」（01_gl.js instVS）；GLSL 不保證動態索引編出一樣的算式 ⇒ 量，不猜：
//   兩對各連一份轉換回饋（transform feedback）的分身 —— 同一串原始碼（TRI_VS＋TRI_FS 抓 gl_Position、vW、vN、vC、vM；DTRI_VS＋只寫深度 抓 gl_Position），
//   光柵化關掉（RASTERIZER_DISCARD）、照 POINTS 畫 ⇒ 每個頂點進去一次、出來一筆。這一格表裡的每一項：舊的 uModel＋drawArrays、新的 uMs＋drawArraysInstanced，
//   抓出來的照 Uint32 逐一比 ⇒ 每支 { items, verts, mismatch（不一樣的頂點數）, maxUlp }（量測工具：mismatch > 0 ⇒ 不過）。
//   排法 ＝ 之後真的一次畫多個的排法：同一個 VAO 的項目照表的順序放進 uMs 的第 0、1、2…格，滿 INST_K 個換下一批（0..K−1 輪著用）；舊的照同一個順序一個一個畫。
//   頂點數：模型、裝飾、斷開的那一團、FLY ＝ me.n；平滑面 ＝ 那一區的頂點（m.verts；共用的那一份 smShare 沒抄 ⇒ 照緩衝的大小 ÷ 44 bytes）。
//   分身是另外連的一份 ⇒ 很強的證據、不是證明；最後照量測工具的畫面（無 MSAA 逐像素）。只在量測那台（ANGLE D3D11、RTX 2060）證過，別的後端要再跑一次。
//   動到的 GL 狀態（程式、VAO、轉換回饋、ARRAY_BUFFER、RASTERIZER_DISCARD、畫的 framebuffer、第 3 號屬性的常數）跑完照原樣放回去；⛔ 不寫模擬、不改表。
/** 轉換回饋的分身：同一串原始碼、連結前指定要抓的輸出（照順序接在一起）；連不起來 ⇒ null。uniform 照 VK.compile 收（setCommon 照樣能給）。 */
function rbatTfLink(vs, fs, vary) {
  var p = gl.createProgram(), u = {}, i, n, S = [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].map(function (a) { var s = gl.createShader(a[0]); gl.shaderSource(s, a[1]); gl.compileShader(s); gl.attachShader(p, s); return s; });
  gl.transformFeedbackVaryings(p, vary, gl.INTERLEAVED_ATTRIBS); gl.linkProgram(p);
  S.forEach(function (s) { gl.deleteShader(s); });                     // 連完才放（還掛在程式上 ⇒ 程式放掉時一起放）
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); return null; }
  for (i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { var a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
  return { prog: p, u: u };
}
/** 一對分身（L 舊的、I 一次畫多個的），w ＝ 一個頂點抓幾個 float。抓不到 gl_Position（有的驅動不給）⇒ 只抓其他的（vW 一樣 ＋ 同一個 uVP ⇒ gl_Position 一樣），pos ＝ false。 */
function rbatTfPair(vs, fs, vary) {
  var o = { pos: true, L: rbatTfLink(vs, fs, vary), I: null, w: 0 };
  if (!o.L && vary.length > 1) { o.pos = false; vary = vary.slice(1); o.L = rbatTfLink(vs, fs, vary); }
  if (o.L) o.I = rbatTfLink(instVS(vs), fs, vary);
  if (!o.L || !o.I) throw new Error('__rbatProbe：轉換回饋的分身連不起來（' + vary.join(',') + '）');
  vary.forEach(function (v) { o.w += v === 'gl_Position' ? 4 : 3; });
  o.L.w = o.I.w = o.w; return o;
}
/** 第 i 項（平滑面）那一區的頂點數；表是上一次 render() 的、那一區已經換掉（重建、smFree）⇒ 0（不比）。RG：Map ⇒ 照順序的陣列（同一份 Map 只轉一次）。 */
function rbatPbVerts(i, RG) {
  var R = RBAT, mp = R.ref[i] && R.ref[i].smR, a = mp && RG.get(mp), m;
  if (mp && !a) RG.set(mp, a = Array.from(mp.values()));
  m = a && a[R.slot[i]]; if (!m || m.vao !== R.vao[i]) return 0;
  if (m.verts) return m.verts;
  gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); return gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) / 44;   // 一個頂點 11 個 float（15_smooth.js smBuild）
}
/** 一段轉換回饋：T 這支分身把 C[c0..c1) 每一批畫一次（inst ⇒ uMs＋一次畫多個；不然 uModel 一個一個），抓到的讀進 dst ⇒ 回讀了幾個 Uint32。neg ⇒ 第一批第一個矩陣差 1 個 ULP（反向：要抓得到）。 */
function rbatPbRun(T, inst, C, c0, c1, dst, neg) {
  var R = RBAT, M = R.M, pal = R.pal, u = T.u, n = 0, c, j, q, b, s;
  gl.useProgram(T.prog); setCommon(T);                                 // uVP 兩邊一樣（PASS.vp || CAM.vp）；取樣器照 setCommon 放第 4、8 號（⛔ 都在第 0 號 ⇒ 兩種取樣器同一號，畫不出來）
  gl.beginTransformFeedback(gl.POINTS);
  for (c = c0; c < c1; c++) {
    b = C[c]; gl.bindVertexArray(b.vao);
    if (inst) {
      for (j = 0; j < b.it.length; j++) for (q = 0, s = b.it[j] * 16; q < 16; q++) pal[j * 16 + q] = M[s + q];
      if (neg && c === c0) new Uint32Array(pal.buffer, 48, 1)[0] ^= 1;   // 平移 x 的最後一位
      gl.uniformMatrix4fv(u.uMs, false, pal, 0, 16 * b.it.length); gl.drawArraysInstanced(gl.POINTS, 0, b.nv, b.it.length);
    } else for (j = 0; j < b.it.length; j++) { gl.uniformMatrix4fv(u.uModel, false, M, b.it[j] * 16, 16); gl.drawArrays(gl.POINTS, 0, b.nv); }
    n += b.nv * b.it.length;
  }
  gl.endTransformFeedback();
  var e = gl.getError(); if (e) throw new Error('__rbatProbe：GL 錯誤 0x' + e.toString(16) + '（' + (inst ? '一次畫多個' : '舊的') + '那一段）');   // ⛔ 沒畫成 ⇒ 緩衝裡是上一段的，比起來會「一樣」
  gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, dst, 0, n * T.w);
  return n * T.w;
}
/** 比兩段抓到的（nw 個 Uint32，一個頂點 w 個）：不一樣的頂點數、最大差幾個 ULP（照 float 的順序把位元換成整數再相減）累加進 r。 */
function rbatPbCmp(A, B, nw, w, r) {
  for (var j = 0, v = -1; j < nw; j++) {
    var a = A[j], b = B[j]; if (a === b) continue;
    if ((j / w | 0) !== v) { v = j / w | 0; r.mismatch++; }
    var d = Math.abs((a & 0x80000000 ? -(a & 0x7fffffff) : a) - (b & 0x80000000 ? -(b & 0x7fffffff) : b)); if (d > r.maxUlp) r.maxUlp = d;
  }
}
/** window.__rbatProbe(neg)：這一格的表（上一次 render() 整理的）全部比一次（見上）。 */
function rbatProbe(neg) {
  var R = RBAT, out = { K: INST_K, items: 0, stale: 0, err0: 0, triI: null, dtriI: null };
  if (!R.ni) return out;
  var s0 = { prog: gl.getParameter(gl.CURRENT_PROGRAM), vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING), tf: gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING),
    tfb: gl.getParameter(gl.TRANSFORM_FEEDBACK_BUFFER_BINDING), ab: gl.getParameter(gl.ARRAY_BUFFER_BINDING), fb: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
    rd: gl.isEnabled(gl.RASTERIZER_DISCARD), a3: gl.getVertexAttrib(3, gl.CURRENT_VERTEX_ATTRIB) }, pb = null, i;
  out.err0 = gl.getError();                                            // 之前留下的錯（清掉 ⇒ 下面每一段才判得準；遊戲本身不讀 getError）
  try {
    // 一批一批：同一個 VAO、照表的順序，滿 INST_K 個換下一批；C ＝ 每一批照第一次出現的順序
    var G = new Map(), RG = new Map(), C = [], big = 0, sl = 0;
    for (i = 0; i < R.ni; i++) {
      var c = R.cls[i], vao = R.vao[i], nv = c === 2 || c === 3 ? rbatPbVerts(i, RG) : R.cnt[i], L = G.get(vao), b = L && L[L.length - 1];
      if (!nv || !gl.isVertexArray(vao) || (b && b.nv !== nv)) { out.stale++; continue; }
      if (!b || b.it.length === INST_K) { if (!L) G.set(vao, L = []); L.push(b = { vao: vao, nv: nv, it: [] }); C.push(b); }
      b.it.push(i); out.items++; big = Math.max(big, b.it.length * nv); sl = Math.max(sl, b.it.length);
    }
    pb = R.gl.pb || (R.gl.pb = { tri: rbatTfPair(TRI_VS, TRI_FS, ['gl_Position', 'vW', 'vN', 'vC', 'vM']), dtri: rbatTfPair(DTRI_VS, DEPTH_ONLY_FS, ['gl_Position']),   // DEPTH_ONLY_FS ＝ programs() 的 NOFS（同一串）
      tf: gl.createTransformFeedback(), buf: gl.createBuffer(), cap: 0, A: null, B: null, on: false });
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, pb.tf); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, pb.buf); pb.on = true;
    var cap = Math.max(big, 1 << 18) * pb.tri.w;                         // 一個緩衝：最大的一批放得下、小的湊一段（少讀回幾次）
    if (pb.cap < cap) { gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, cap * 4, gl.DYNAMIC_COPY); pb.A = new Uint32Array(cap); pb.B = new Uint32Array(cap); pb.cap = cap; }
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); gl.enable(gl.RASTERIZER_DISCARD); gl.vertexAttrib2f(3, 0, 0.5);   // aM 常數照 rbatReplay（模型的 VAO 沒開第 3 號）
    [['triI', P.triI, pb.tri], ['dtriI', P.dtriI, pb.dtri]].forEach(function (x) {
      var T = x[2], r = out[x[0]] = { linked: !!x[1], pos: T.pos, items: out.items, verts: 0, mismatch: 0, maxUlp: 0, slots: sl }, per = Math.floor(pb.cap / T.w), c0 = 0, c1, n;
      while (c0 < C.length) {
        for (c1 = c0, n = 0; c1 < C.length && (c1 === c0 || n + C[c1].nv * C[c1].it.length <= per); c1++) n += C[c1].nv * C[c1].it.length;
        var nw = rbatPbRun(T.L, false, C, c0, c1, pb.A);
        if (rbatPbRun(T.I, true, C, c0, c1, pb.B, neg && !c0) !== nw) throw new Error('__rbatProbe：兩段抓的數量不一樣');
        rbatPbCmp(pb.A, pb.B, nw, T.w, r); r.verts += n; c0 = c1;
      }
    });
  } finally {
    if (gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE)) gl.endTransformFeedback();
    if (pb && pb.on) { gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null); pb.on = false; }
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, s0.tf); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, s0.tfb);
    if (!s0.rd) gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, s0.fb); gl.bindBuffer(gl.ARRAY_BUFFER, s0.ab); gl.bindVertexArray(s0.vao); gl.useProgram(s0.prog);
    if (s0.a3 instanceof Float32Array) gl.vertexAttrib4fv(3, s0.a3);
  }
  return out;
}
// 除錯（?debug=1）：__rbat.stat 讀數；__rbat.check() ＝ 畫一格、那一格整理完就對拍（回 stat）；__rbatProbe() ＝ 一次畫多個的程式對拍（見上）
if (DEBUG) window.__rbat = { stat: RBAT.stat, tab: RBAT, check: function () { var c = RBAT_CHK; RBAT_CHK = true; try { render(); } finally { RBAT_CHK = c; } return RBAT.stat; } };
if (DEBUG) window.__rbatProbe = rbatProbe;

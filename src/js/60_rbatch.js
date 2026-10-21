// ───────────────────────── 一格要畫的模型表（RBAT；render 管線大修 S2）─────────────────────────
// 模型那一段（drawModels：船的模型 → 裝飾 → 平滑面 → 裝甲的平滑面，斷開的那一團的模型，飛出去的模型）一格只整理一次（rbatPrep：frameBegin 裡、prepRig 之後），
//   陰影的每一段、反射、主畫面都照這一張表重播（rbatReplay）⇒ GL 的呼叫跟以前每一趟自己走一遍逐一相同（同樣的判斷、順序、uniform 的值）。
// 一格一張表（rbatPrep）：世界矩陣照以前同一條算式、同一個捨入點（⛔ 不合併乘法、不跨格留：d.L、m.vsl、ancD 原地改，renderLerp 每格換 sh.M，remesh 換 smR）。
//   以前的 modelWorld（WeakMap，每個模型每格一個快取物件、一個閉包）拿掉；斷開的那一團的模型以前每一趟各乘一次，現在一格一次。
// 畫的東西（owner）：0..ns-1 ＝ SHIPS（沉了 sink > 40 的沒有項目）、ns..n-1 ＝ PIECES；cs ＝ 陰影第 k 段畫不畫（第 k 位，60_render.js csmIn 填）。
// 項目（item）照以前畫的順序排；FLY（飛出去的模型）沒有 owner，排在最後（i0[n] 起）。陣列不夠才加倍、之後一直重用（艦隊實驗室最多 FLEET_MAX 艘、斷開的那一團沒有上限）。
// ⛔ 只讀模擬的狀態：表、矩陣都是 RBAT 自己的陣列；meshGpu（家具第一次畫到才上傳）照以前只給要畫的。
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
  stat: { f: -1, owners: 0, items: 0, chk: 0, matMiss: 0, itemMiss: 0 }   // 讀數（__rbat.stat）：matMiss／itemMiss ＝ ?rbchk=1 對拍不一樣的項目數（量測工具 > 0 ⇒ 不過）
};
var RBAT_CHK = Q.get('rbchk') === '1';                             // ?rbchk=1：每格整理完照以前的算式重算一遍、逐位元比（rbatCheck）
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
// 除錯（?debug=1）：__rbat.stat 讀數；__rbat.check() ＝ 畫一格、那一格整理完就對拍（回 stat）
if (DEBUG) window.__rbat = { stat: RBAT.stat, tab: RBAT, check: function () { var c = RBAT_CHK; RBAT_CHK = true; try { render(); } finally { RBAT_CHK = c; } return RBAT.stat; } };

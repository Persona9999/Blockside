// ───────────────────────── 繩與帆的 GPU 緩衝 ─────────────────────────
function buildRig(owner) {          // 還綁著的繩（靜態，照雕刻作品的形狀）；帆在 sailBuf、垂下來的繩在 looseBuf
  var L = [], hide = {};
  (owner.sails || []).forEach(function (s, k) {                       // 收起來的帆，它自己的繩（s.lines：sheet、tack…）不畫（Tim 2026-10-15：收帆後會浮空）；物理開著 ⇒ 收攏演完、帆真的藏起來才藏。只是不畫：判斷照舊
    if (!s.furled || s.dead || !s.lines) return; var c = owner.cl && owner.cl[k];
    if (PHYS && c && c.p && !c.hidden) return;
    if (PHYS && c && c.fz && !c.gone && !c.loose) return;               // 收帆停在演完那一刻（30_rig_physics.js furlFreeze）⇒ 繩留著
    s.lines.forEach(function (j) { hide[j] = 1; });
  });
  var tj = PHYS && owner.tJ, tc = PHYS && owner.tCut;                  // 跟著帆腳走的 sheet、tack（30_rig_physics.js tethOf）：looseBuf 每一格畫；tCut：帆腳被打掉、已經垂下來的（tethCut）
  var CR = owner.crew && owner.T ? climbRopes(owner.T) : null, TB = CR ? [] : null;   // 繩梯的繩畫成管子（climbRopes）
  owner.ropes.forEach(function (r, j) {
    if (r.dead || hide[j] || tj && tj[j] || tc && tc[j]) return;
    if (CR && CR[j]) { ropeTube(TB, r.pts, r.col, Math.max(ROPE_TUBE_MIN, owner.T.rig.ropes[j].radius || 0)); return; }
    for (var j = 0; j + 5 < r.pts.length; j += 3) L.push(r.pts[j], r.pts[j + 1], r.pts[j + 2], r.col[0], r.col[1], r.col[2], r.pts[j + 3], r.pts[j + 4], r.pts[j + 5], r.col[0], r.col[1], r.col[2]);
  });
  owner.lines = upload(owner.lines, new Float32Array(L), 6, [[0, 3, 0], [2, 3, 3]]);
  if (TB) owner.ropeT = upload(owner.ropeT, new Float32Array(TB), 6, [[0, 3, 0], [2, 3, 3]]);   // 60_render.js 跟線同一趟畫（三角形）
  owner.rigDirty = false;
}
// 繩梯的繩畫成實心的細管（Tim 2026-10-17：「繩梯的繩子可以粗一點」）：一般的繩照舊一條線（1 像素，雕刻的粗細只拿來算碰撞）；
//   繩梯 ＝ 橫繩組 climb 的每一道（meta climb）＋它掛的那兩根母繩（每一道的端點 rope:母繩/比例）⇒ 照雕刻的粗細（radius，格；最細 ROPE_TUBE_MIN）畫六角管、不打光（顏色同線）。
var ROPE_TUBE_MIN = 0.15, ROPE_TUBE_SIDES = 6;
/** 船型 T 的繩梯是哪幾條繩（{ j: 1 }；沒有 ⇒ null；同一型算一次）。 */
function climbRopes(T) {
  if (T.climbR !== undefined) return T.climbR;
  var R = (T.rig && T.rig.ropes) || [], idx = {}, S = null;
  function full(fr, n) { return fr ? fr + '/' + n : n; }
  R.forEach(function (r, j) { idx[full(r.frame || '', r.name)] = j; });
  R.forEach(function (r, j) {
    if (!r.meta || !+r.meta.climb) return;
    (S = S || {})[j] = 1;
    (r.ends || []).forEach(function (e) { if (typeof e !== 'string' || e.indexOf('rope:') !== 0) return; var q = e.slice(5), i = q.lastIndexOf('/'), k = idx[full(r.frame || '', q.slice(0, i))]; if (k !== undefined) S[k] = 1; });
  });
  return (T.climbR = S);
}
/** 一條繩（pts：格座標，三個一組）畫成半徑 w 的六角管，三角形推進 TB（位置 3、色 3）。 */
function ropeTube(TB, P, col, w) {
  for (var i = 0; i + 5 < P.length; i += 3) {
    var a = [P[i], P[i + 1], P[i + 2]], b = [P[i + 3], P[i + 4], P[i + 5]], d = sub(b, a), dl = len(d); if (dl < 1e-6) continue;
    d = mul(d, 1 / dl);
    var u = Math.abs(d[2]) > 0.9 ? [1, 0, 0] : norm([d[1], -d[0], 0]), v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]], R = [];
    for (var k = 0; k <= ROPE_TUBE_SIDES; k++) { var t = k / ROPE_TUBE_SIDES * 6.28319, o = add(mul(u, Math.cos(t) * w), mul(v, Math.sin(t) * w)); R.push(o); }
    for (k = 0; k < ROPE_TUBE_SIDES; k++) {
      var p0 = add(a, R[k]), p1 = add(a, R[k + 1]), q0 = add(b, R[k]), q1 = add(b, R[k + 1]);
      [p0, p1, q1, p0, q1, q0].forEach(function (p) { TB.push(p[0], p[1], p[2], col[0], col[1], col[2]); });
    }
  }
}
/** 帆的網格（一個 owner 一份，索引畫）：頂點法線 ＝ 相鄰三角形的面積加權平均 ⇒ 布是圓的，不是一面一面的。
 *  關物理 ⇒ 位置就是雕刻作品那一刻（T.p0），只在 rigDirty 時重做；開物理 ⇒ 模擬走過一步才重做（沒走的那一格照用上一份：rigSame、60_render.js prepRig）。
 *  帆的布片（34_shreds.js）接在帆後面、同一個緩衝 ⇒ 陰影、反射照帆畫。
 *  動、靜分兩份（render 管線大修 R1；Tim：「只有被破壞時重算網格」）：重做時只算、只傳動的那份（位置、法線：ow.sb.vbo，bufferSubData）；
 *    靜的（色、貼圖集的 uv、著火、雜訊座標：ow.sb.sbo）與索引（ow.sb.ebo）只在變的那一刻傳變的那一段（sailBuf 的 put 跟上一次每一面的樣子 ow.sb.L 比）：
 *    撕開、收好那一捲少了幾點 ⇒ 從那一面起的索引；著火、撲滅、貼圖集、陣營換了 ⇒ 那一面的靜的；畫的帆換了（藏起來、掉了、布片新增或拿掉）⇒ 從那一面起整段。
 *    整面不畫的帆（藏起來、掉了、收起來沒留那一捲）本來就不在緩衝裡：不算位置、不傳、不畫（Tim：「整張帆被破壞除外(就不用算了)」）⇒ 畫的永遠是一段、一個 owner 一個 drawElements。 */
// 頂點：動的 ＝ 位置 3、法線 3；靜的 ＝ 色 3、貼圖集的 uv 2（TASK-0579；沒有貼圖 ⇒ u ＝ −1，著色器照色畫）、著火 4（TASK-0717：火燒到的時間 a、撲滅的時間 x —— 49_burn.js s.burn，
//   沒燒過 ＝ BURN_NEVER ⇒ 著色器那一段整個跳過；雜訊座標 ＝ 作品形狀的 ((x＋y)·S, z·S) 公尺 ⇒ 布被吹動時焦痕跟著布、不會滑）。著色器（01_gl.js P.sail／P.dsail）一字沒改。
var SBV = null, SBI = null, SBN = null, SBP = null, SBD = null, SB_STRIDE = 15, SB_DW = 6, SB_SW = 9, SAIL_UNIT = 9, SAIL_DUMMY = null;
/** 帆的貼圖集（30_rig_physics.js sailAtlas）⇒ GL 貼圖（第一次畫才建，記在船型上）；沒有 ⇒ 1×1 的空貼圖（取樣器一定要綁一張）。 */
function sailTex(T) {
  if (T && T.sailAtlas && !T.sailTexGL) {
    var A = T.sailAtlas, t = T.sailTexGL = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, A.w, A.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, A.data);
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST); });   // 像素畫：一格一格（⛔ LINEAR ⇒ 洞的邊緣跟隔壁的色混在一起）
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE); });
  }
  if (T && T.sailTexGL) return T.sailTexGL;
  if (!SAIL_DUMMY) { SAIL_DUMMY = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, SAIL_DUMMY); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255])); }
  return SAIL_DUMMY;
}
/** 這一格畫哪幾面帆、哪幾片布片：每一面叫一次 put(o, T, P, n, tris, col, tv, vc, uv, r, bF, g0)，回這一格跟著帆腳畫的繩 { td, tk }（looseBuf）。
 *  o：布（sh.cl[k]）或布片本身、T：它的模板；P：細格位置（暫存區 SBP，下一面就蓋掉）；tv：不畫的細格點（撕開的洞、收好那一捲少的）；vc：每個頂點的顏色（沒有貼圖集時的退路，
 *  30_rig_physics.js texColors）；uv＋r：貼圖集的那一格；bF：著火（s.burn）、g0：雜訊座標用的作品形狀。
 *  sailBuf（動靜分開傳）與 sailFill（?rigchk=1 對拍用的整份）共用 ⇒ 畫哪幾面、位置怎麼算只有一份。 */
function sailWalk(ow, put) {
  var isShip = !!ow.crew, F = isShip && PHYS && ow.shreds && ow.shreds.length ? ow.shreds : null, A = ow.T && ow.T.sailAtlas, m1 = 1;
  (ow.cl || []).forEach(function (c) { m1 = Math.max(m1, c.T.n); });
  if (F) F.forEach(function (f) { m1 = Math.max(m1, f.n); });
  if (!SBN || SBN.length < m1 * 3) { SBN = new Float32Array(m1 * 3); SBP = new Float32Array(m1 * 3); }
  var td = [], tk = '';                                                  // 這一格跟著帆腳畫的繩（looseBuf）
  (ow.cl || []).forEach(function (c, k) {
    var P;
    if (isShip) {
      var s = ow.sails[k], keep = furlKeep(s) && (PHYS ? !c.gone && !c.loose && (!c.p || c.hidden) : true);   // 收好的帆留一捲（30_rig_physics.js furlBundle；只是畫）
      if (!keep && (PHYS ? (!c.p || c.hidden || c.gone) : (s.dead || s.furled))) return;
      var frz = keep && PHYS && c.fz;                                    // 物理開著、收攏演完過 ⇒ 停在演完那一刻（30_rig_physics.js furlFreeze）；沒演過（開局就收著）⇒ 照舊那一捲
      if (keep) { P = frz ? furlFrozen(ow, c, SBP) : furlBundle(ow, c, SBP); var lost = furlLost(ow, s, c); }   // lost：靠的帆桁、格不在了的那幾點不畫（30_rig_physics.js furlLost）
      if (frz && c.tt) c.tt.forEach(function (t) { if (ow.ropes[t.j].dead || ow.tCut && ow.tCut[t.j] || lost && lost[t.i]) return; var o = t.i * 3; td.push({ t: t, x: P[o], y: P[o + 1], z: P[o + 2] }); tk += t.j + ','; });   // 帆腳的繩跟著凍結的帆腳
    }
    if (!P) P = (PHYS || !isShip) && c.p ? (isShip && c.furlF !== null && c.furlF !== undefined ? furlDraw(c, clothFine(c, SBP), c.furlF, ow) : clothFine(c, SBP)) : c.T.p0;   // furlDraw：收帆張帆的演出（30_rig_physics.js）
    if (isShip && PHYS && c.tt && c.p && !c.hidden && !c.gone && !c.loose) c.tt.forEach(function (t) { if (ow.ropes[t.j].dead || ow.tCut && ow.tCut[t.j]) return; var o = t.i * 3; td.push({ t: t, x: P[o], y: P[o + 1], z: P[o + 2] }); tk += t.j + ','; });   // 畫出來的帆腳（收帆演出時也是）
    put(c, c.T, P, c.T.n, c.T.tris, c.T.col, keep ? lost : c.torn ? c.tv : null, c.T.vcol, c.T.uv, A && c.T.ti !== undefined ? sailRect(ow, A, c.T.ti) : null, isShip ? ow.sails[k].burn : c.bf, c.T.p0);   // 斷開那一團帶走的帆：c.bf（22_pieces.js）
  });
  if (F) F.forEach(function (f) { put(f, f.T, f.p, f.n, f.T.sim.tris, f.col, null, null, f.uv, A && f.uv && f.ti !== undefined ? sailRect(ow, A, f.ti) : null, null, null); });   // 布片：有貼圖的帆撕下來的照原處的圖（34_shreds.js shredCut 記 uv）
  return { td: td, tk: tk };
}
/** ?rigchk=1 對拍用：以前那一份 —— 整份重填暫存區（SBV 頂點 SB_NV 個 × 15、SBI 索引 SB_NI 個），回 { td, tk }。只讀、不傳 GPU（rigChk 拿來跟 GPU 上那一份比）。 */
var SB_NV = 0, SB_NI = 0;
function sailFill(ow) {
  var nv = 0, ni = 0, mv = 0, mi = 0, A = ow.T && ow.T.sailAtlas;
  (ow.cl || []).forEach(function (c) { mv += c.T.n; mi += c.T.tris.length; });
  if (ow.crew && PHYS && ow.shreds) ow.shreds.forEach(function (f) { mv += f.n; mi += f.T.sim.tris.length; });
  if (!SBV || SBV.length < mv * SB_STRIDE) SBV = new Float32Array(Math.ceil(Math.max(1, mv) * 1.33) * SB_STRIDE);
  if (!SBI || SBI.length < mi) SBI = new Uint32Array(Math.ceil(Math.max(1, mi) * 1.33));
  var f = sailWalk(ow, function (o, T, p, n, tr, col, tv, vc, uv, r, bF, g0) {
    var base = nv, j, i;
    SBN.fill(0, 0, n * 3);
    for (j = 0; j < tr.length; j += 3) {
      if (tv && (tv[tr[j]] || tv[tr[j + 1]] || tv[tr[j + 2]])) continue;
      var a = tr[j] * 3, b = tr[j + 1] * 3, d = tr[j + 2] * 3;
      var ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      SBN[a] += nx; SBN[a + 1] += ny; SBN[a + 2] += nz; SBN[b] += nx; SBN[b + 1] += ny; SBN[b + 2] += nz; SBN[d] += nx; SBN[d + 1] += ny; SBN[d + 2] += nz;
      SBI[ni++] = base + tr[j]; SBI[ni++] = base + tr[j + 1]; SBI[ni++] = base + tr[j + 2];
    }
    for (i = 0; i < n; i++) {
      var o6 = (base + i) * SB_STRIDE, q = i * 3;
      SBV[o6] = p[q]; SBV[o6 + 1] = p[q + 1]; SBV[o6 + 2] = p[q + 2]; SBV[o6 + 3] = SBN[q]; SBV[o6 + 4] = SBN[q + 1]; SBV[o6 + 5] = SBN[q + 2];
      if (vc) { SBV[o6 + 6] = vc[q]; SBV[o6 + 7] = vc[q + 1]; SBV[o6 + 8] = vc[q + 2]; } else { SBV[o6 + 6] = col[0]; SBV[o6 + 7] = col[1]; SBV[o6 + 8] = col[2]; }
      if (uv && r) { SBV[o6 + 9] = (r[0] + uv[i * 2] * r[2]) / A.w; SBV[o6 + 10] = (r[1] + uv[i * 2 + 1] * r[3]) / A.h; } else { SBV[o6 + 9] = -1; SBV[o6 + 10] = -1; }
      if (bF) { SBV[o6 + 11] = bF.a[i]; SBV[o6 + 12] = bF.x[i]; } else { SBV[o6 + 11] = BURN_NEVER; SBV[o6 + 12] = BURN_NEVER; }
      if (g0) { SBV[o6 + 13] = (g0[q] + g0[q + 1]) * S; SBV[o6 + 14] = g0[q + 2] * S; } else { SBV[o6 + 13] = 0; SBV[o6 + 14] = 0; }
    }
    nv += n;
  });
  SB_NV = nv; SB_NI = ni;
  return f;
}
/** 帆的緩衝（動靜分開，見上）：動的照現在的狀態整份重算、重傳；靜的與索引跟上一次每一面的樣子（ow.sb.L）比，只重填、只傳變的那一段。
 *  ow.sb.SV／IV：靜的、索引在 CPU 的那一份（傳一段要從它拿；不夠就加大三成、GPU 那份整份重配）；gs／gi／gd：GPU 上靜的、索引、動的配了多大。
 *  算的式子、順序跟以前一模一樣（sailFill 那一份；?rigchk=1 每一格逐位元對拍）⇒ 畫出來一位元不差。tDraw／tKey／tJ／rigDirty 的副作用照舊。 */
function sailBuf(ow) {
  var B = ow.sb, A = ow.T && ow.T.sailAtlas, mv = 0, np = 0, nv = 0, ni = 0, s0 = -1, i0 = -1, RG = [], j;   // s0：從第幾面起靜的整段重填；i0：從第幾面起索引重填；RG：只重填靜的那幾段（頂點起點、個數）
  if (!B) {
    B = ow.sb = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), sbo: gl.createBuffer(), ebo: gl.createBuffer(), n: 0, nv: 0, L: [], SV: new Float32Array(0), IV: new Uint32Array(0), gs: 0, gi: 0, gd: 0 };
    gl.bindVertexArray(B.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.vbo); [[0, 0, 3], [1, 3, 3]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[2], gl.FLOAT, false, SB_DW * 4, a[1] * 4); });
    gl.bindBuffer(gl.ARRAY_BUFFER, B.sbo); [[2, 0, 3], [3, 3, 2], [4, 5, 4]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[2], gl.FLOAT, false, SB_SW * 4, a[1] * 4); });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.ebo); gl.bindVertexArray(null);
  }
  // 暫存區照這一艘現在要畫的配、不夠就加大三成（TASK-0669：以前開局時 30_rig_physics.js clothSetup 照最大那一型先配 ⇒ 物理檔碰畫的緩衝）
  (ow.cl || []).forEach(function (c) { mv += c.T.n; });
  if (ow.crew && PHYS && ow.shreds) ow.shreds.forEach(function (f) { mv += f.n; });
  if (!SBD || SBD.length < mv * SB_DW) SBD = new Float32Array(Math.ceil(Math.max(1, mv) * 1.33) * SB_DW);
  var L = B.L, f = sailWalk(ow, put), td = f.td, tk = f.tk;
  L.length = np;                                                         // 後面沒了的那幾面（最後一面藏起來、最舊的布片拿掉）：不畫就好（畫 B.n 個索引）
  if (ow.crew) { ow.tDraw = td; if (tk !== (ow.tKey || '')) { ow.tKey = tk; ow.tJ = {}; td.forEach(function (d) { ow.tJ[d.t.j] = 1; }); ow.rigDirty = true; } }   // 換了哪幾條 ⇒ 下一格 buildRig 重做（不畫那幾條）
  var SV = B.SV, IV = B.IV, vcap = SV.length / SB_SW;
  if (B.gs !== SV.length) { gl.bindBuffer(gl.ARRAY_BUFFER, B.sbo); gl.bufferData(gl.ARRAY_BUFFER, SV, gl.STATIC_DRAW); B.gs = SV.length; }
  else if (s0 >= 0 || RG.length) {
    gl.bindBuffer(gl.ARRAY_BUFFER, B.sbo);
    for (j = 0; j < RG.length; j += 2) gl.bufferSubData(gl.ARRAY_BUFFER, RG[j] * SB_SW * 4, SV, RG[j] * SB_SW, RG[j + 1] * SB_SW);
    if (s0 >= 0 && nv > L[s0].vb) gl.bufferSubData(gl.ARRAY_BUFFER, L[s0].vb * SB_SW * 4, SV, L[s0].vb * SB_SW, (nv - L[s0].vb) * SB_SW);
  }
  if (B.gi !== IV.length) { gl.bindVertexArray(B.vao); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, IV, gl.STATIC_DRAW); gl.bindVertexArray(null); B.gi = IV.length; }   // 索引是 VAO 的狀態 ⇒ 先綁自己的 VAO
  else if (i0 >= 0 && ni > L[i0].ib) { gl.bindVertexArray(B.vao); gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, L[i0].ib * 4, IV, L[i0].ib, ni - L[i0].ib); gl.bindVertexArray(null); }
  gl.bindBuffer(gl.ARRAY_BUFFER, B.vbo);
  if (B.gd !== vcap) { gl.bufferData(gl.ARRAY_BUFFER, vcap * SB_DW * 4, gl.DYNAMIC_DRAW); B.gd = vcap; }   // 跟靜的一樣大（加大才重配）
  if (nv) gl.bufferSubData(gl.ARRAY_BUFFER, 0, SBD, 0, nv * SB_DW);
  B.n = ni; B.nv = nv;
  if (RIG_CHK) {
    ow.sbChk = { d: SBD.slice(0, nv * SB_DW), tk: tk };                  // 對拍用：這一次傳上去的動的那一份
    var sc = rigStat(); sc.sbDyn = (sc.sbDyn || 0) + 1; if (s0 >= 0 || RG.length) sc.sbStat = (sc.sbStat || 0) + 1; if (i0 >= 0) sc.sbIdx = (sc.sbIdx || 0) + 1;   // 重做幾次、其中靜的、索引傳了幾次
  }
  function put(o, T, p, n, tr, col, tv, vc, uv, r, bF, g0) {
    var q = L[np] || (L[np] = { o: null }), base = nv, j, i, x;
    if (s0 < 0 && (q.o !== o || q.T !== T || q.n !== n)) s0 = np;      // 畫的帆換了 ⇒ 從這一面起頂點全挪了：靜的、索引整段重填
    var st = s0 >= 0;
    if (st || !sailDropSame(q.d, tv, n)) { if (i0 < 0) i0 = np; q.d = tv ? sailDropCopy(q.d, tv, n) : null; }   // 撕開、收好那一捲少了幾點 ⇒ 從這一面起索引重填（頂點不動）
    if (st || q.r !== r || q.A !== A || q.bf !== bF || bF && sailBurnNew(B.SV, base, n, bF)) {   // 著火（燒到的時間、撲滅）、貼圖集、陣營換了 ⇒ 這一面的靜的重填
      if (B.SV.length < (base + n) * SB_SW) { x = new Float32Array(Math.ceil((base + n) * 1.33) * SB_SW); x.set(B.SV.subarray(0, base * SB_SW)); B.SV = x; }
      var Z = B.SV;
      for (i = 0; i < n; i++) {
        var w = (base + i) * SB_SW, k = i * 3;
        if (vc) { Z[w] = vc[k]; Z[w + 1] = vc[k + 1]; Z[w + 2] = vc[k + 2]; } else { Z[w] = col[0]; Z[w + 1] = col[1]; Z[w + 2] = col[2]; }
        if (uv && r) { Z[w + 3] = (r[0] + uv[i * 2] * r[2]) / A.w; Z[w + 4] = (r[1] + uv[i * 2 + 1] * r[3]) / A.h; } else { Z[w + 3] = -1; Z[w + 4] = -1; }
        if (bF) { Z[w + 5] = bF.a[i]; Z[w + 6] = bF.x[i]; } else { Z[w + 5] = BURN_NEVER; Z[w + 6] = BURN_NEVER; }
        if (g0) { Z[w + 7] = (g0[k] + g0[k + 1]) * S; Z[w + 8] = g0[k + 2] * S; } else { Z[w + 7] = 0; Z[w + 8] = 0; }
      }
      if (!st) { if (RG.length && RG[RG.length - 2] + RG[RG.length - 1] === base) RG[RG.length - 1] += n; else RG.push(base, n); }   // 挨著的併成一段
    }
    q.o = o; q.T = T; q.n = n; q.r = r; q.A = A; q.bf = bF; q.vb = base; q.ib = ni;
    var iw = i0 >= 0, N = SBN, D = SBD;
    if (iw && B.IV.length < ni + tr.length) { x = new Uint32Array(Math.ceil((ni + tr.length) * 1.33)); x.set(B.IV.subarray(0, ni)); B.IV = x; }
    var I = B.IV;
    N.fill(0, 0, n * 3);
    for (j = 0; j < tr.length; j += 3) {                                 // 法線：照舊跳過撕開的三角形、同樣的順序加（Float32 累加 ⇒ 順序一換就差一位元）
      if (tv && (tv[tr[j]] || tv[tr[j + 1]] || tv[tr[j + 2]])) continue;
      var a = tr[j] * 3, b = tr[j + 1] * 3, d = tr[j + 2] * 3;
      var ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[d] += nx; N[d + 1] += ny; N[d + 2] += nz;
      if (iw) { I[ni] = base + tr[j]; I[ni + 1] = base + tr[j + 1]; I[ni + 2] = base + tr[j + 2]; }
      ni += 3;
    }
    for (i = 0; i < n; i++) { var o6 = (base + i) * SB_DW, k3 = i * 3; D[o6] = p[k3]; D[o6 + 1] = p[k3 + 1]; D[o6 + 2] = p[k3 + 2]; D[o6 + 3] = N[k3]; D[o6 + 4] = N[k3 + 1]; D[o6 + 5] = N[k3 + 2]; }
    nv += n; np++;
  }
}
/** 不畫的細格點（tv：撕開的洞、收好那一捲少的；null ＝ 全畫）跟上一次記的 d 一樣。照 truthy 比（畫的時候也是照 truthy 跳）。 */
function sailDropSame(d, tv, n) {
  if (!d || !tv) return !d && !tv;
  for (var i = 0; i < n; i++) if (d[i] !== (tv[i] ? 1 : 0)) return false;
  return true;
}
function sailDropCopy(d, tv, n) {
  if (!d || d.length !== n) d = new Uint8Array(n);
  for (var i = 0; i < n; i++) d[i] = tv[i] ? 1 : 0;
  return d;
}
/** 著火（s.burn：起火、延燒、撲滅都改同一份的 a／x）跟靜的那一份（base 起 n 個頂點）記的不一樣 ⇒ true。都是 Float32 ⇒ 直接比。 */
function sailBurnNew(Z, base, n, bF) {
  for (var i = 0, w = base * SB_SW + 5; i < n; i++, w += SB_SW) if (Z[w] !== bF.a[i] || Z[w + 1] !== bF.x[i]) return true;
  return false;
}
/** 細格的位置：照權重從物理的粗格內插（粗格就是細格 ⇒ 原樣）。 */
/** 垂下來的繩（物理開著才有）：模擬走過才重做（60_render.js prepRig）。暫存區 LBV 不夠就加大三成（以前每一格一份新的陣列）；
 *  照舊是 float64 算完才寫進 Float32Array（＝ 以前 new Float32Array(L) 的那一次轉換）⇒ 傳上去的位元組一樣。
 *  GPU 那份配到 LBV 那麼大、之後 bufferSubData（不夠才重配；R1）。 */
var LBV = null;
/** 填 LBV（td：跟著帆腳畫的繩，sailWalk 的）⇒ 填了幾個 float。 */
function looseFill(sh, td) {
  var need = 0, n = 0, j, k;
  for (j = 0; j < sh.loose.length; j++) need += Math.max(0, sh.loose[j].n - 1) * 12;
  for (j = 0; j < td.length; j++) need += Math.max(0, Math.ceil(sh.ropes[td[j].t.j].pts.length / 3) - 1) * 12;
  if (!LBV || LBV.length < need) LBV = new Float32Array(Math.ceil(Math.max(1, need) * 1.33));
  var L = LBV;
  for (j = 0; j < sh.loose.length; j++) {
    var o = sh.loose[j], p = o.p, c = o.col;
    for (var i = 0; i + 1 < o.n; i++) { var a = i * 3; L[n++] = p[a]; L[n++] = p[a + 1]; L[n++] = p[a + 2]; L[n++] = c[0]; L[n++] = c[1]; L[n++] = c[2]; L[n++] = p[a + 3]; L[n++] = p[a + 4]; L[n++] = p[a + 5]; L[n++] = c[0]; L[n++] = c[1]; L[n++] = c[2]; }
  }
  for (j = 0; j < td.length; j++) {                                     // 跟著帆腳走的 sheet、tack（sailBuf 記的畫出來的帆腳）：靠帆腳那一端移到帆腳、另一端不動、中間照弧長內插
    var d = td[j], t = d.t, r = sh.ropes[t.j], q = r.pts, cc = r.col, e = t.ce * 3, mx = d.x - q[e], my = d.y - q[e + 1], mz = d.z - q[e + 2], m = q.length / 3, px = 0, py = 0, pz = 0;
    for (k = 0; k < m; k++) {
      var w = t.t[k], x = q[k * 3] + mx * w, y = q[k * 3 + 1] + my * w, z = q[k * 3 + 2] + mz * w;
      if (k) { L[n++] = px; L[n++] = py; L[n++] = pz; L[n++] = cc[0]; L[n++] = cc[1]; L[n++] = cc[2]; L[n++] = x; L[n++] = y; L[n++] = z; L[n++] = cc[0]; L[n++] = cc[1]; L[n++] = cc[2]; }
      px = x; py = y; pz = z;
    }
  }
  return n;
}
function looseBuf(sh) {
  var n = looseFill(sh, sh.tDraw || []), o = sh.ll;
  if (!o) {
    o = sh.ll = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), n: 0, cap: 0 }; gl.bindVertexArray(o.vao); gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo);
    [[0, 3, 0], [2, 3, 3]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, 6 * 4, a[2] * 4); }); gl.bindVertexArray(null);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo);
  if (o.cap < n) { o.cap = LBV.length; gl.bufferData(gl.ARRAY_BUFFER, o.cap * 4, gl.DYNAMIC_DRAW); }
  if (n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, LBV, 0, n);
  o.n = n / 6;
  if (RIG_CHK) sh.llChk = LBV.slice(0, n);
}
// 帆與垂繩的緩衝什麼時候重做（60_render.js prepRig）：物理開著的船，照模擬每走一步重做；這一格沒走模擬（暫停、慢動作、高更新率的空格、__game.cam／cut 這種只畫一格的）
//   ⇒ 輸入一個都沒變 ⇒ 上一份照用。輸入 ＝ 布、布片、垂繩、燒到的時間（都只在模擬那一步改，或改的地方設 rigDirty：setPhys、收帆張帆、降旗、帆匠、著火、57_core）。
//   rigSame 再多比一串（不只 SIMT）：物理開關、貼圖集、船殼格數（收好那一捲靠的格）、每面帆的狀態與陣列換過沒 ⇒ 除錯工具在模擬外改了也照樣重做。
//   ?rigchk=1（DEBUG）：每一格照以前整份重填的那一份（sailFill、looseFill）再填一次、跟 GPU 上那一份逐位元比（沒重做的那一格驗 rigSame、重做的那一格驗動靜分開只傳變的那一段），
//   不一樣 ⇒ __rbat.stat.rigMiss ＋1（rigChk 對拍的次數；sbDyn／sbStat／sbIdx：帆重做幾次、其中靜的、索引傳了幾次）。
var RIG_CHK = DEBUG && Q.get('rigchk') === '1', RK = null, RK_N = 0, RK_SAME = true;
function rkPut(v) { if (RK[RK_N] !== v) { RK[RK_N] = v; RK_SAME = false; } RK_N++; }
/** 這一格帆與垂繩的輸入跟上一次重做時一樣 ⇒ true；不一樣 ⇒ 記下這一格的（ow.sbK）、回 false。只在物理開著的船上叫（每一格都叫，才記得住重做那一刻的）。 */
function rigSame(ow) {
  RK = ow.sbK || (ow.sbK = []); RK_N = 0; RK_SAME = true;
  rkPut(SIMT); rkPut(PHYS); rkPut(ow.T && ow.T.sailAtlas); rkPut(ow.grid && ow.grid.count); rkPut(ow.cl); rkPut(ow.sails);
  rkPut(ow.shreds); rkPut(ow.shreds && ow.shreds.length); rkPut(ow.loose); rkPut(ow.loose && ow.loose.length); rkPut(ow.tCut);
  var C = ow.cl || [], S = ow.sails || [];
  for (var k = 0; k < C.length; k++) {
    var c = C[k], s = S[k];
    rkPut(c); rkPut(c.p); rkPut(c.hidden); rkPut(c.gone); rkPut(c.loose); rkPut(c.fz); rkPut(c.furlF); rkPut(c.torn); rkPut(c.tv); rkPut(c.tt);
    rkPut(s); rkPut(s && s.furled); rkPut(s && s.dead); rkPut(s && s.burn);
  }
  if (RK.length !== RK_N) { RK.length = RK_N; RK_SAME = false; }
  return RK_SAME && !!ow.sb;
}
function rigStat() { var R = window.__rbat || (window.__rbat = {}); return R.stat || (R.stat = {}); }
/** 兩份 float／int 陣列的前 n 個逐位元一樣（b 剛好 n 個）。 */
function rigEq(a, b, n) {
  if (b.length !== n) return false;
  var A = new Uint32Array(a.buffer, a.byteOffset, n), B = new Uint32Array(b.buffer, b.byteOffset, n);
  for (var i = 0; i < n; i++) if (A[i] !== B[i]) return false;
  return true;
}
/** ?rigchk=1：照現在的狀態用以前整份重填的那一份再填一次（不傳、不改 tDraw／tKey／rigDirty），跟 GPU 上那一份比（帆：動的 ＝ 上一次傳的、靜的與索引 ＝ CPU 那一份）。
 *  live：物理開著的船 ⇒ 垂繩也比。 */
function rigChk(ow, live) {
  var K = ow.sbChk, st = rigStat(), bad = !K || !ow.sb || live && !ow.llChk;
  if (!bad) {
    var f = sailFill(ow);
    bad = f.tk !== K.tk || !sailEq(ow.sb, K.d);
    if (!bad && live) { var nl = looseFill(ow, f.td); bad = !rigEq(LBV, ow.llChk, nl); }   // 先填（填的時候 LBV 可能換一份大的）才拿 LBV
  }
  st.rigChk = (st.rigChk || 0) + 1; st.rigMiss = (st.rigMiss || 0) + (bad ? 1 : 0);
}
/** 帆：GPU 上那一份（動的 D、靜的 B.SV、索引 B.IV）跟 sailFill 剛填好的（SBV、SBI）逐位元一樣。 */
function sailEq(B, D) {
  var nv = SB_NV, ni = SB_NI, v, k;
  if (B.nv !== nv || B.n !== ni || D.length !== nv * SB_DW || !rigEq(SBI, B.IV.subarray(0, ni), ni)) return false;
  var X = new Uint32Array(SBV.buffer, 0, nv * SB_STRIDE), Y = new Uint32Array(D.buffer, D.byteOffset, nv * SB_DW), Z = new Uint32Array(B.SV.buffer, 0, nv * SB_SW);
  for (v = 0; v < nv; v++) {
    for (k = 0; k < SB_DW; k++) if (X[v * SB_STRIDE + k] !== Y[v * SB_DW + k]) return false;
    for (k = 0; k < SB_SW; k++) if (X[v * SB_STRIDE + SB_DW + k] !== Z[v * SB_SW + k]) return false;
  }
  return true;
}
function upload(o, data, stride, attrs) {
  if (!o) { o = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), n: 0 }; gl.bindVertexArray(o.vao); gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo);
    attrs.forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, stride * 4, a[2] * 4); }); gl.bindVertexArray(null); }
  gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); o.n = data.length / stride;
  return o;
}


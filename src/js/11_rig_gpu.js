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
 *  帆的布片（34_shreds.js）接在帆後面、同一個緩衝 ⇒ 陰影、反射照帆畫。 */
// 頂點：位置 3、法線 3、色 3、貼圖集的 uv 2（TASK-0579；沒有貼圖 ⇒ u ＝ −1，著色器照色畫）、著火 4（TASK-0717：火燒到的時間 a、撲滅的時間 x —— 49_burn.js s.burn，
//   沒燒過 ＝ BURN_NEVER ⇒ 著色器那一段整個跳過；雜訊座標 ＝ 作品形狀的 ((x＋y)·S, z·S) 公尺 ⇒ 布被吹動時焦痕跟著布、不會滑）
var SBV = null, SBI = null, SBN = null, SBP = null, SB_STRIDE = 15, SAIL_UNIT = 9, SAIL_DUMMY = null;
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
/** 帆的網格：照現在的狀態填暫存區（SBV 頂點 SB_NV 個、SBI 索引 SB_NI 個），回這一格跟著帆腳畫的繩 { td, tk }。只讀、不傳 GPU（sailBuf 傳；?rigchk=1 的 rigChk 拿來對拍）。 */
var SB_NV = 0, SB_NI = 0;
function sailFill(ow) {
  var nv = 0, ni = 0, isShip = !!ow.crew, F = isShip && PHYS && ow.shreds && ow.shreds.length ? ow.shreds : null, A = ow.T && ow.T.sailAtlas;
  // 暫存區照這一艘現在要畫的配、不夠就加大三成（TASK-0669：以前開局時 30_rig_physics.js clothSetup 照最大那一型先配 ⇒ 物理檔碰畫的緩衝）
  var mv = 0, mi = 0, m1 = 1; (ow.cl || []).forEach(function (c) { mv += c.T.n; mi += c.T.tris.length; m1 = Math.max(m1, c.T.n); });
  if (F) F.forEach(function (f) { mv += f.n; mi += f.T.sim.tris.length; m1 = Math.max(m1, f.n); });
  if (!SBV || SBV.length < mv * SB_STRIDE) SBV = new Float32Array(Math.ceil(Math.max(1, mv) * 1.33) * SB_STRIDE);
  if (!SBI || SBI.length < mi) SBI = new Uint32Array(Math.ceil(Math.max(1, mi) * 1.33));
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
    put(P, c.T.n, c.T.tris, c.T.col, keep ? lost : c.torn ? c.tv : null, c.T.vcol, c.T.uv, A && c.T.ti !== undefined ? sailRect(ow, A, c.T.ti) : null, isShip ? ow.sails[k].burn : c.bf, c.T.p0);   // 斷開那一團帶走的帆：c.bf（22_pieces.js）
  });
  if (F) F.forEach(function (f) { put(f.p, f.n, f.T.sim.tris, f.col, null, null, f.uv, A && f.uv && f.ti !== undefined ? sailRect(ow, A, f.ti) : null, null, null); });   // 布片：有貼圖的帆撕下來的照原處的圖（34_shreds.js shredCut 記 uv）
  function put(p, n, tr, col, tv, vc, uv, r, bF, g0) {                    // tv：藏起來的細格點（撕開的洞）；vc：每個頂點的顏色（沒有貼圖集時的退路，30_rig_physics.js texColors）；uv＋r：貼圖集的那一格；bF：著火（s.burn）、g0：雜訊座標用的作品形狀
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
      var o = (base + i) * SB_STRIDE, q = i * 3;
      SBV[o] = p[q]; SBV[o + 1] = p[q + 1]; SBV[o + 2] = p[q + 2]; SBV[o + 3] = SBN[q]; SBV[o + 4] = SBN[q + 1]; SBV[o + 5] = SBN[q + 2];
      if (vc) { SBV[o + 6] = vc[q]; SBV[o + 7] = vc[q + 1]; SBV[o + 8] = vc[q + 2]; } else { SBV[o + 6] = col[0]; SBV[o + 7] = col[1]; SBV[o + 8] = col[2]; }
      if (uv && r) { SBV[o + 9] = (r[0] + uv[i * 2] * r[2]) / A.w; SBV[o + 10] = (r[1] + uv[i * 2 + 1] * r[3]) / A.h; } else { SBV[o + 9] = -1; SBV[o + 10] = -1; }
      if (bF) { SBV[o + 11] = bF.a[i]; SBV[o + 12] = bF.x[i]; } else { SBV[o + 11] = BURN_NEVER; SBV[o + 12] = BURN_NEVER; }
      if (g0) { SBV[o + 13] = (g0[q] + g0[q + 1]) * S; SBV[o + 14] = g0[q + 2] * S; } else { SBV[o + 13] = 0; SBV[o + 14] = 0; }
    }
    nv += n;
  }
  SB_NV = nv; SB_NI = ni;
  return { td: td, tk: tk };
}
function sailBuf(ow) {
  var f = sailFill(ow), td = f.td, tk = f.tk, nv = SB_NV, ni = SB_NI;
  if (ow.crew) { ow.tDraw = td; if (tk !== (ow.tKey || '')) { ow.tKey = tk; ow.tJ = {}; td.forEach(function (d) { ow.tJ[d.t.j] = 1; }); ow.rigDirty = true; } }   // 換了哪幾條 ⇒ 下一格 buildRig 重做（不畫那幾條）
  if (!ow.sb) {
    ow.sb = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), ebo: gl.createBuffer(), n: 0 };
    gl.bindVertexArray(ow.sb.vao); gl.bindBuffer(gl.ARRAY_BUFFER, ow.sb.vbo);
    [[0, 0, 3], [1, 3, 3], [2, 6, 3], [3, 9, 2], [4, 11, 4]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[2], gl.FLOAT, false, SB_STRIDE * 4, a[1] * 4); });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ow.sb.ebo); gl.bindVertexArray(null);
  }
  gl.bindVertexArray(ow.sb.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, ow.sb.vbo); gl.bufferData(gl.ARRAY_BUFFER, SBV.subarray(0, nv * SB_STRIDE), gl.DYNAMIC_DRAW);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, SBI.subarray(0, ni), gl.DYNAMIC_DRAW); gl.bindVertexArray(null);
  ow.sb.n = ni;
  if (RIG_CHK) ow.sbChk = { v: SBV.slice(0, nv * SB_STRIDE), i: SBI.slice(0, ni), tk: tk };   // 對拍用：這一次傳上去的那一份
}
/** 細格的位置：照權重從物理的粗格內插（粗格就是細格 ⇒ 原樣）。 */
/** 垂下來的繩（物理開著才有）：模擬走過才重做（60_render.js prepRig）。暫存區 LBV 不夠就加大三成（以前每一格一份新的陣列）；
 *  照舊是 float64 算完才寫進 Float32Array（＝ 以前 new Float32Array(L) 的那一次轉換）⇒ 傳上去的位元組一樣。 */
var LBV = null;
/** 填 LBV（td：跟著帆腳畫的繩，sailFill 的）⇒ 填了幾個 float。 */
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
  var n = looseFill(sh, sh.tDraw || []);
  sh.ll = upload(sh.ll, LBV.subarray(0, n), 6, [[0, 3, 0], [2, 3, 3]]);
  if (RIG_CHK) sh.llChk = LBV.slice(0, n);
}
// 帆與垂繩的緩衝什麼時候重做（60_render.js prepRig）：物理開著的船，照模擬每走一步重做；這一格沒走模擬（暫停、慢動作、高更新率的空格、__game.cam／cut 這種只畫一格的）
//   ⇒ 輸入一個都沒變 ⇒ 上一份照用。輸入 ＝ 布、布片、垂繩、燒到的時間（都只在模擬那一步改，或改的地方設 rigDirty：setPhys、收帆張帆、降旗、帆匠、著火、57_core）。
//   rigSame 再多比一串（不只 SIMT）：物理開關、貼圖集、船殼格數（收好那一捲靠的格）、每面帆的狀態與陣列換過沒 ⇒ 除錯工具在模擬外改了也照樣重做。
//   ?rigchk=1（DEBUG）：沒重做的那一格照樣填一份、跟上一次傳的逐位元比，不一樣 ⇒ __rbat.stat.rigMiss ＋1（rigChk 對拍的次數 rigChk）。
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
/** ?rigchk=1：這一格沒重做 ⇒ 照現在的狀態再填一份（不傳、不改 tDraw／tKey／rigDirty），跟上一次傳上去的比。 */
function rigChk(ow) {
  var K = ow.sbChk, L = ow.llChk, st = rigStat(), bad = !K || !L;
  if (!bad) {
    var f = sailFill(ow), nl = looseFill(ow, f.td);                     // 兩份都填完才比（填的時候暫存區可能換一份大的）
    bad = f.tk !== K.tk || !rigEq(SBV, K.v, SB_NV * SB_STRIDE) || !rigEq(SBI, K.i, SB_NI) || !rigEq(LBV, L, nl);
  }
  st.rigChk = (st.rigChk || 0) + 1; st.rigMiss = (st.rigMiss || 0) + (bad ? 1 : 0);
}
function upload(o, data, stride, attrs) {
  if (!o) { o = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), n: 0 }; gl.bindVertexArray(o.vao); gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo);
    attrs.forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, stride * 4, a[2] * 4); }); gl.bindVertexArray(null); }
  gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); o.n = data.length / stride;
  return o;
}


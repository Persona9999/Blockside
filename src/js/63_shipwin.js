// ── 船窗夜裡亮（TASK-1103；Tim 2026-10-29「同時可以讓船隻的窗戶也在夜晚發光」；演出規格統一 TASK-1100 第 3 期；只給人看） ──
// 窗從哪來：船的玻璃（材質表寫了 clear 的格，05_material.js T.glsXYZ）就是窗 —— 建築要另外標 part=window，船不用（造船規格的窗本來就是玻璃）⇒ 現有作品不用改。
//   載入那種船時抽一次（winExtract，掛在 T.win；同一種船共用）。格式同建築（Blocksail tools/townmodels.py glass_of；63_towns.js「夜裡的燈」）：
//   { a 薄的那一軸（0 ＝ x、1 ＝ y）, s 往外的正負, d 那一團最外那一層的外面, r [[z0, z1, u0, u1], …] 投影到那一面的形狀（u ＝ 另一軸；格的邊，z1、u1 不含） }。
// 窗的定義（建築與船同一份，兩邊照同一套算 —— 改了要兩邊一起改；src/SHOW_SPEC.md §2.1）：
//   ① 玻璃 26 連通一團。
//   ② 一團裡同時有「平面朝 x」和「平面朝 y」的格 ⇒ 照平面拆開（船尾窗跟兩舷窗照 6 連通鋪成一整片、建築轉角的窗）：
//      每格看水平的玻璃鄰格 —— 只有 x 向的鄰格 ⇒ 平面朝 y（a ＝ 1）、只有 y 向 ⇒ a ＝ 0、兩向都有或都沒有（轉角、斜面的階梯、一格寬的直條）⇒ 未定；
//      未定的格跟著最近的已定格（26 連通的廣度優先，同一步照格的順序）；再照同一向 26 連通各成一團。一團只有一種平面（平的窗）⇒ 不拆，跟以前一樣。
//   ③ 每一團的往外：四個水平方向（−y、＋y、−x、＋x 的順序）先比「從那一格往那邊一路空到外框外」的格有幾格（看得到外面）取最多；
//      一樣多（都是 0：中庭、天井的窗）⇒ 比「每格往那邊連著空幾格」的總和（最多看 WIN_LOOK 公尺；建築以前只比這個）；再一樣 ⇒ 先試的那一向。總和 0 ⇒ 不算窗。
//      為什麼先比外框外：船的艙深過 6 m、窗外又有欄杆、走廊（船尾的觀景廊）⇒ 只比 6 m 內的空格，康塞普西翁號 23 扇有 17 扇朝艙裡（2026-10-31 量）。
//   ④ 投影面積 < WIN_MIN 平方公尺的不算。
var WIN_LOOK = 6.0, WIN_MIN = 0.1, WIN_DIRS = [[1, -1], [1, 1], [0, -1], [0, 1]];   // 同 townmodels.py GLASS_LOOK、GLASS_MIN、TURN_OUT 的順序
/** 玻璃格 P（Int16Array x, y, z, …）、佔格 occ(x, y, z)（任何格，玻璃也算）、外框 sx × sy × sz、每格幾公尺 mpv ⇒ [{ a, s, d, r, c: [第幾格 …] } …]（c：哪幾格玻璃，打掉判斷用）。 */
function winExtract(P, occ, sx, sy, sz, mpv) {
  var n = P.length / 3, K = Math.max(1, Math.round(WIN_LOOK / mpv)), at = new Map(), i, j, k;
  var key = function (x, y, z) { return (z * sy + y) * sx + x; };
  var ord = []; for (i = 0; i < n; i++) ord.push(i);
  ord.sort(function (p, q) { return P[3 * p + 2] - P[3 * q + 2] || P[3 * p + 1] - P[3 * q + 1] || P[3 * p] - P[3 * q]; });   // 格的順序 ＝ z、y、x（同 numpy 的 nonzero ⇒ 一團的編號照它第一格）
  for (i = 0; i < n; i++) at.set(key(P[3 * i], P[3 * i + 1], P[3 * i + 2]), i);
  var nb = function (c, f) { var x = P[3 * c], y = P[3 * c + 1], z = P[3 * c + 2]; for (var dz = -1; dz <= 1; dz++) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { if (!dx && !dy && !dz) continue; var q = at.get(key(x + dx, y + dy, z + dz)); if (q !== undefined) f(q); } };
  var lab = new Int32Array(n).fill(-1), blobs = [];
  for (j = 0; j < n; j++) {                                           // ① 26 連通
    var s0 = ord[j]; if (lab[s0] >= 0) continue;
    var B = [s0]; lab[s0] = blobs.length;
    for (k = 0; k < B.length; k++) nb(B[k], function (q) { if (lab[q] < 0) { lab[q] = blobs.length; B.push(q); } });
    blobs.push(B);
  }
  var out = [];
  blobs.forEach(function (B) {
    B.sort(function (p, q) { return P[3 * p + 2] - P[3 * q + 2] || P[3 * p + 1] - P[3 * q + 1] || P[3 * p] - P[3 * q]; });
    winSplit(B, P, at, key, nb).forEach(function (C) { var w = winOne(C, P, occ, sx, sy, sz, K, mpv); if (w) out.push(w); });
  });
  return out;
}
/** ② 一團 B ⇒ 照平面拆成幾團（只有一種平面 ⇒ [B]）。 */
function winSplit(B, P, at, key, nb) {
  var tag = new Map(), has = [false, false];
  B.forEach(function (c) {
    var x = P[3 * c], y = P[3 * c + 1], z = P[3 * c + 2];
    var hx = at.has(key(x - 1, y, z)) || at.has(key(x + 1, y, z)), hy = at.has(key(x, y - 1, z)) || at.has(key(x, y + 1, z));
    var t = hx && !hy ? 1 : hy && !hx ? 0 : -1; tag.set(c, t); if (t >= 0) has[t] = true;
  });
  if (!(has[0] && has[1])) return [B];
  var Qd = B.filter(function (c) { return tag.get(c) >= 0; });        // 未定的格跟著最近的已定格
  for (var k = 0; k < Qd.length; k++) { var t = tag.get(Qd[k]); nb(Qd[k], function (q) { if (tag.get(q) === -1) { tag.set(q, t); Qd.push(q); } }); }
  var seen = new Set(), out = [];
  B.forEach(function (c) {
    if (seen.has(c)) return;
    var t = tag.get(c), C = [c]; seen.add(c);
    for (var k = 0; k < C.length; k++) nb(C[k], function (q) { if (!seen.has(q) && tag.get(q) === t) { seen.add(q); C.push(q); } });
    C.sort(function (p, q) { return P[3 * p + 2] - P[3 * q + 2] || P[3 * p + 1] - P[3 * q + 1] || P[3 * p] - P[3 * q]; });
    out.push(C);
  });
  return out;
}
/** ③④ 一團 C ⇒ 一扇窗（不算窗 ⇒ null）。 */
function winOne(C, P, occ, sx, sy, sz, K, mpv) {
  var best = null;
  WIN_DIRS.forEach(function (D) {
    var a = D[0], s = D[1], score = 0, ext = 0;
    C.forEach(function (c) {
      var x = P[3 * c], y = P[3 * c + 1], z = P[3 * c + 2], run = 0, k = 1;
      for (; ; k++) {
        var x2 = a === 0 ? x + s * k : x, y2 = a === 0 ? y : y + s * k, inb = x2 >= 0 && x2 < sx && y2 >= 0 && y2 < sy;
        if (!inb) { if (k <= K) run += K - k + 1; ext++; break; }    // 出了外框 ⇒ 後面都算空（同 townmodels.py：外框外 ＝ 空）
        if (occ(x2, y2, z)) break;
        if (k <= K) run++;
      }
      score += run;
    });
    if (score && (!best || ext > best.ext || (ext === best.ext && score > best.score))) best = { score: score, ext: ext, a: a, s: s };
  });
  if (!best) return null;
  var a = best.a, s = best.s, d = s > 0 ? -1e9 : 1e9, cells = new Set();
  C.forEach(function (c) { var w = P[3 * c + a], u = P[3 * c + 1 - a], z = P[3 * c + 2]; d = s > 0 ? Math.max(d, w + 1) : Math.min(d, w); cells.add(z * 65536 + u); });
  if (cells.size * mpv * mpv < WIN_MIN) return null;
  var L = Array.from(cells).sort(function (p, q) { return p - q; }), rows = [];
  for (var i = 0; i < L.length;) {                                    // 每一層 z：u 連續的一段一條；跟上一層同一段 ⇒ 併成一條
    var z = Math.floor(L[i] / 65536), st = L[i] % 65536, pv = st;
    for (i++; ; i++) {
      var more = i < L.length && Math.floor(L[i] / 65536) === z, u = more ? L[i] % 65536 : -1;
      if (more && u === pv + 1) { pv = u; continue; }
      var prev = null; for (var q = 0; q < rows.length; q++) if (rows[q][1] === z && rows[q][2] === st && rows[q][3] === pv + 1) { prev = rows[q]; break; }
      if (prev) prev[1]++; else rows.push([z, z + 1, st, pv + 1]);
      if (!more) break;
      st = pv = u;
    }
  }
  return { a: a, s: s, d: d, r: rows, c: C.slice() };
}
// ── 畫（只在世界時間的夜裡：TOD_LIT > 0；沒開世界時間、白天 ⇒ 整段跳過）──
//   哪扇亮：雜湊（63_towns.js twH，同建築）照船的穩定 id ＋ 第幾扇 —— 往來的船用清單的 id（npc.id）、其他的船用開場時的序號（SHIPS 的序號會往前補，⛔ 不能直接用）；
//     幾成亮照 TOD_WIN（同城裡的窗）。⛔ 不照世界座標（船會動 ⇒ 一直換）；?shipwinxz=1 ⇒ 改回照船心的世界 x、z（對照組：同一個讀數報得出換掉的窗）。
//   近（船心離鏡頭 < 近那一級的距離 TOWN_LOD[0]，交接帶 TOWN_BAND[0]，同建築、同表演船的分級）：窗片（貼在那一團外面、往外 0.08 格；只畫朝鏡頭那一面 ⇒ 從艙裡看不到）；
//   遠：每扇一個光點（看板、最小 TL_PX 像素，同城裡的光點）。都跟著船的矩陣 sh.M 走。
//   玻璃打掉（15_smooth.js glsTouch）⇒ 那艘的窗重建：那一扇有任何一格玻璃不在了 ⇒ 不亮。
// ?shipwin=0 ⇒ 不畫（量效能的對照組）。讀數 __game.shipwin()：每艘亮著哪幾扇。
var SHIPWIN = { on: Q.get('shipwin') !== '0', xz: Q.get('shipwinxz') === '1', prog: null, progJ: null, quad: null, stat: { ships: 0, cards: 0, glow: 0, ms: 0 } };
var SHIPWIN_VS = '#version 300 es\nlayout(location=0) in vec4 aP; layout(location=1) in vec3 aN; uniform mat4 uVP, uModel; uniform vec3 uEye; uniform vec2 uKey; uniform float uTWin, uTLT;\n' +
  'out vec3 vW; out float vD; flat out vec3 vCol;\n' + TL_HASH_GLSL +
  'void main(){ vec3 w=(uModel*vec4(aP.xyz,1.0)).xyz, n=mat3(uModel)*aN; float h=twH(uKey,aP.w); vW=w; vD=length(uModel[3].xz-uEye.xz); vCol=vec3(0.0);\n' +
  ' if(h>=uTWin || dot(uEye-w,n)<=0.0){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }\n' +   // 背對鏡頭（從艙裡看）⇒ 不畫
  ' vCol=twCol(h)*(0.94+0.06*sin(uTLT*(1.3+fract(h*7.0))+h*40.0)); gl_Position=uVP*vec4(w,1.0); }\n';
var SHIPWIN_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + TOWN_FADE + 'in vec3 vW; in float vD; flat in vec3 vCol; uniform vec3 uEye; uniform float uFogD, uClip, uTLK; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; if(townCut(vD)) discard; float fd=length(vW-uEye); o=vec4(vCol*1.25*uTLK*exp(-fd*uFogD*0.5),1.0); }\n';
};
// 光點：四邊形 aQ ∈ [−½, ½] × [0, 1]；aA ＝ (窗心（格座標）, 半徑 m)、aB ＝ (往外（格座標）, 第幾扇)
var SHIPWIN_GLOW_VS = '#version 300 es\nlayout(location=0) in vec2 aQ; layout(location=4) in vec4 aA; layout(location=5) in vec4 aB;\n' +
  'uniform mat4 uVP, uModel; uniform vec3 uEye, uR, uU; uniform vec2 uKey, uWin; uniform float uPx, uTLK, uTWin, uFogD; out vec2 vQ; flat out vec3 vCol;\n' + TL_HASH_GLSL +
  'void main(){ vec3 p=(uModel*vec4(aA.xyz,1.0)).xyz, e=uEye-p, nw=normalize(mat3(uModel)*aB.xyz); float d=length(e), h=twH(uKey,aB.w), k=h<uTWin?uTLK:0.0;\n' +
  ' k*=smoothstep(uWin.x,uWin.y,length(uModel[3].xz-uEye.xz))*smoothstep(-0.05,0.3,dot(nw,e/max(d,0.001)));\n' +
  ' float s=max(aA.w,uPx*d*' + TL_PX.toFixed(2) + '); k*=pow(aA.w/s,0.3)*exp(-d*uFogD*0.5);\n' +
  ' vQ=vec2(aQ.x*2.0,aQ.y*2.0-1.0); vCol=twCol(h)*k; if(k<=0.003){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }\n' +
  ' vec3 w=p+e/max(d,0.001)*min(s*0.7,d*0.5)+(uR*vQ.x+uU*vQ.y)*s; gl_Position=uVP*vec4(w,1.0); }\n';
/** 那種船的窗（第一次問才抽，掛在 T.win；沒有玻璃 ⇒ []）。 */
function shipWins(T) {
  if (T.win === undefined) { var B = T.base; T.win = T.glsXYZ ? winExtract(T.glsXYZ, function (x, y, z) { return B.get(x, y, z) > 0; }, B.sx, B.sy, B.sz, S) : []; }
  return T.win;
}
/** 這艘船的雜湊 id（第一次問才定、之後不變）。 */
function shipWinKey(sh) {
  if (sh.wkey === undefined) {
    if (sh.npc && sh.npc.id) { var h = 0x811c9dc5, s = String(sh.npc.id); for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; sh.wkey = h & 0xffffff; }   // 24 位元 ⇒ 轉 float 不掉位
    else sh.wkey = 0xffffff - sh.i;
  }
  return sh.wkey;
}
/** 63_towns.js twH 的 CPU 版（讀數用；同一個數）。 */
var TWH_F = new Float32Array(3), TWH_U = new Uint32Array(TWH_F.buffer);
function twHash(x, z, id) {
  TWH_F[0] = x; TWH_F[1] = z; TWH_F[2] = id;
  var h = (Math.imul(TWH_U[0], 0x8da6b343) ^ Math.imul(TWH_U[1], 0xd8163841) ^ Math.imul(TWH_U[2], 0xcb1ab31f)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0; h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}
/** 這艘的雜湊兩個數（uKey）：平常 ＝ (id, 0)；對照組 ＝ 船心的世界 x、z。 */
function shipWinKeyXZ(sh) { return SHIPWIN.xz ? [sh.M[12], sh.M[14]] : [shipWinKey(sh), 0]; }
/** 這艘的窗片、光點（玻璃打掉 ⇒ 重建；那一扇有一格不在 ⇒ 不放）。 */
function shipWinBuild(sh) {
  var W = shipWins(sh.T), P = sh.T.glsXYZ, g = sh.grid, V = [], G = [], ok = [];
  W.forEach(function (w, wi) {
    for (var j = 0; j < w.c.length; j++) { var c = w.c[j]; if (!g.get(P[3 * c], P[3 * c + 1], P[3 * c + 2])) return; }
    ok.push(wi);
    var d = w.d + w.s * 0.08, n = w.a ? [0, w.s, 0] : [w.s, 0, 0], z0 = 1e9, z1 = -1e9, u0 = 1e9, u1 = -1e9;
    w.r.forEach(function (r) {
      [[r[2], r[0]], [r[3], r[0]], [r[3], r[1]], [r[2], r[0]], [r[3], r[1]], [r[2], r[1]]].forEach(function (q) { if (w.a) V.push(q[0], d, q[1], wi, n[0], n[1], n[2]); else V.push(d, q[0], q[1], wi, n[0], n[1], n[2]); });
      z0 = Math.min(z0, r[0]); z1 = Math.max(z1, r[1]); u0 = Math.min(u0, r[2]); u1 = Math.max(u1, r[3]);
    });
    var cz = (z0 + z1) / 2, cu = (u0 + u1) / 2, dc = w.d + w.s * 1.5;  // 光點：窗心往外 0.15 m（同城裡的光點）
    if (w.a) G.push(cu, dc, cz); else G.push(dc, cu, cz);
    G.push(Math.max(z1 - z0, u1 - u0) * S * 0.75, n[0], n[1], n[2], wi);
  });
  var m = sh.winM || (sh.winM = { vao: gl.createVertexArray(), vb: gl.createBuffer(), gvao: gl.createVertexArray(), gb: gl.createBuffer(), n: 0, ng: 0, ok: [] });
  if (!m.init) {
    gl.bindVertexArray(m.vao); gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 16);
    gl.bindVertexArray(m.gvao); gl.bindBuffer(gl.ARRAY_BUFFER, SHIPWIN.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.gb); [[4, 0], [5, 16]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribDivisor(a[0], 1); gl.vertexAttribPointer(a[0], 4, gl.FLOAT, false, 32, a[1]); });
    gl.bindVertexArray(null); m.init = true;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.gb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(G), gl.STATIC_DRAW);
  m.n = V.length / 7; m.ng = G.length / 8; m.ok = ok; sh.winD = false;
}
/** 重開一場（70_flow.js reset）：丟掉這艘的窗。 */
function shipWinFree(sh) { var m = sh.winM; if (m) { gl.deleteBuffer(m.vb); gl.deleteBuffer(m.gb); gl.deleteVertexArray(m.vao); gl.deleteVertexArray(m.gvao); sh.winM = null; } }
/** 著色器：第一次要畫時送出編譯，編好之前回 null（那幾格不畫）。 */
function shipWinProgs() {
  if (SHIPWIN.prog) return SHIPWIN.prog;
  var J = SHIPWIN.progJ || (SHIPWIN.progJ = { win: glProgStart(SHIPWIN_VS, SHIPWIN_FS()), glow: glProgStart(SHIPWIN_GLOW_VS, TOWN_GLOW_FS) });
  if (!glProgReady(J.win) || !glProgReady(J.glow)) return null;
  SHIPWIN.prog = { win: glProgEnd(J.win), glow: glProgEnd(J.glow) };
  SHIPWIN.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, SHIPWIN.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1]), gl.STATIC_DRAW);
  return SHIPWIN.prog;
}
/** 船窗那一趟（60_render.js，城裡的燈之後）：加法、不寫深度。反射、陰影那一趟不畫；剖面開著不畫。 */
function shipWinDraw() {
  var st = SHIPWIN.stat; st.ships = st.cards = st.glow = 0;
  if (!SHIPWIN.on || TOD0 === null || !(TOD_LIT > 0) || PASS.vp || cutOn()) return;
  var L = SHIPS.filter(function (sh) { return sh.T.glsXYZ && sh.sink <= 40 && shipWins(sh.T).length; }); if (!L.length) return;
  var Pg = shipWinProgs(); if (!Pg) return;
  var t0 = performance.now(), L0 = TOWN_LOD[0], B0 = TOWN_BAND[0], cf = gl.isEnabled(gl.CULL_FACE);
  gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
  var PW = Pg.win; gl.useProgram(PW.prog); setCommon(PW);
  gl.uniform1f(PW.u.uTWin, TOD_WIN); gl.uniform1f(PW.u.uTLK, TOD_LIT); gl.uniform1f(PW.u.uTLT, SIMT); gl.uniform2f(PW.u.uIn, -2, -1); gl.uniform2f(PW.u.uOut, L0 - B0, L0 + B0);
  L.forEach(function (sh) {
    if (!sh.winM || sh.winD) shipWinBuild(sh); st.ships++;
    if (!sh.winM.n || Math.hypot(sh.M[12] - CAM.eye[0], sh.M[14] - CAM.eye[2]) > L0 + B0) return;
    var k = shipWinKeyXZ(sh); gl.uniform2f(PW.u.uKey, k[0], k[1]); gl.uniformMatrix4fv(PW.u.uModel, false, sh.M);
    gl.bindVertexArray(sh.winM.vao); gl.drawArrays(gl.TRIANGLES, 0, sh.winM.n); st.cards += sh.winM.ok.length;
  });
  var PG = Pg.glow, f = norm(sub(CAM.look, CAM.eye)), r = norm([-f[2], 0, f[0]]), u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];   // 鏡頭的右、上
  gl.useProgram(PG.prog); setCommon(PG); gl.uniform3fv(PG.u.uR, r); gl.uniform3fv(PG.u.uU, u);
  gl.uniform1f(PG.u.uPx, 2 * Math.tan(0.45) / CAM.h); gl.uniform1f(PG.u.uTLK, TOD_LIT); gl.uniform1f(PG.u.uTWin, TOD_WIN); gl.uniform2f(PG.u.uWin, L0 - B0, L0 + B0);
  L.forEach(function (sh) {
    if (!sh.winM.ng || Math.hypot(sh.M[12] - CAM.eye[0], sh.M[14] - CAM.eye[2]) < L0 - B0) return;
    var k = shipWinKeyXZ(sh); gl.uniform2f(PG.u.uKey, k[0], k[1]); gl.uniformMatrix4fv(PG.u.uModel, false, sh.M);
    gl.bindVertexArray(sh.winM.gvao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, sh.winM.ng); st.glow += sh.winM.ng;
  });
  gl.bindVertexArray(null); gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); if (cf) gl.enable(gl.CULL_FACE);
  st.ms = +(performance.now() - t0).toFixed(2);
}
/** 讀數：每艘幾扇窗、哪幾扇亮著（照同一個雜湊與 TOD_WIN 算；打掉的不算）。 */
function shipWinStat() {
  var out = { on: SHIPWIN.on, xz: SHIPWIN.xz, lit: +TOD_LIT.toFixed(3), win: +TOD_WIN.toFixed(3), draw: SHIPWIN.stat, ships: [] };
  SHIPS.forEach(function (sh, i) {
    if (!sh.T.glsXYZ || !shipWins(sh.T).length) return;
    var k = shipWinKeyXZ(sh), ok = sh.winM ? sh.winM.ok : shipWins(sh.T).map(function (w, wi) { return wi; });
    out.ships.push({ i: i, name: sh.name || sh.T.id, hull: sh.T.id, key: k, wins: shipWins(sh.T).length, ok: ok.length, on: TOD_LIT > 0 ? ok.filter(function (wi) { return twHash(k[0], k[1], wi) < TOD_WIN; }) : [] });
  });
  return out;
}
// ── 停港的船燈寫進城鎮光源格（TASK-1103：碼頭的燈照得到船身、船的燈照得到棧橋與地面）──
//   繫在泊位上的船（sh.moor 有位置：停港的往來船、停好的我艦）的燈籠、提燈、船殼上的燈 ⇒ 63_towns.js townLampGrid 一起排：照多遠同城裡的燈籠（TL_TYPE[0].r）、
//     亮度照船燈自己的（LAMP_I ×（1.6 − 亮度），同 lampsUpdate；城裡燈籠的 2.0 照船身 ⇒ 風暴角號四盞綠燈把整個船尾照成一團螢光綠，2026-10-31 截圖），光色照它自己的；這幾盞就不再進船自己的 8 盞點光源（lampsUpdate 看 sh.tlIn：不然自己的船身照兩次）。
//   船殼、模型的著色器吃城鎮光源格（01_gl.js voxFS、TRI_FS 的 townLamp）⇒ 碼頭、街燈照到船；白天、沒有城 ⇒ 一進函式就回 0（戰鬥模式畫面不變）。
//   停港的船換了（繫上、離開、燈被打掉）⇒ 簽名換了 ⇒ 光源格重排。位置照重排那一刻（停港的船只晃幾公分）。
var SHIP_TL = Q.get('shiptl') !== '0';                              // ?shiptl=0 ⇒ 互照整段關掉（船燈不進光源格、船的著色器不吃它；對照組）
function townShipMoored(sh) { return sh.moor && sh.moor.x != null && !sh.sunk && sh.sink <= 40; }
/** 停港的帶燈船的簽名（哪幾艘、各亮著幾盞）。 */
function townShipSig() {
  var s = ''; if (!SHIP_TL) return s;
  s += Math.round((1.6 - wxLum()) * 20) + '|';                         // 亮度變了（入夜、天氣）⇒ 也重排
  SHIPS.forEach(function (sh) {
    if (!townShipMoored(sh)) return;
    var n = (sh.vlampN || 0); sh.models.forEach(function (m) { if (m.alive && isLamp(m)) n++; });
    if (n) s += shipWinKey(sh) + ':' + n + ',';
  });
  return s;
}
/** 停港的船燈 ⇒ [x, y, z, 照多遠, r, g, b, 相位, …]（世界座標）；順手標 sh.tlIn。 */
function townShipLamps() {
  var out = [], R = TL_TYPE[0].r, I = LAMP_I * (1.6 - wxLum()), C = [1, 0.62, 0.25];   // C：模型的燈的暖橘（同 lampsUpdate）
  SHIPS.forEach(function (sh) {
    sh.tlIn = false; if (!SHIP_TL || !townShipMoored(sh)) return;
    (sh.T.lamps || []).forEach(function (V, j) { if (!vlampOn(sh, V)) return; var w = M4.pt(sh.M, V.at[0], V.at[1], V.at[2]); out.push(w[0], w[1], w[2], R, V.rgb[0] * I, V.rgb[1] * I, V.rgb[2] * I, j * 1.7); sh.tlIn = true; });
    sh.models.forEach(function (m) { if (!m.alive || !isLamp(m)) return; var q = lampAt(m), w = M4.pt(sh.M, q[0], q[1], q[2]); out.push(w[0], w[1], w[2], R, C[0] * I, C[1] * I, C[2] * I, m.k * 2.39); sh.tlIn = true; });
  });
  return out;
}

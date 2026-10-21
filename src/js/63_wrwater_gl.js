// ───────────────────────── 艙內的水：照房間畫（TASK-0811；TASK-0804 的畫面那一半） ─────────────────────────
// Tim 2026-10-22：「我希望至少水面要是平滑的（不能碎裂）」「顯示上 模擬房間表面的水傾斜跟波動」；同一天「完成後繼續進水相關的部分吧（畫面渲染）」⇒ 先做畫面、模擬（TASK-0808）後接。
// 做法：
//   · 一間房（33_wrooms.js 烘焙）一片水：每一欄（WR_C × WR_C 格）一塊，四個角 ＝ 同一間房、這一角周圍有水面的欄的世界高度平均 ⇒ 角兩邊共用、一定接得起來；
//     房間跟房間之間的高低差只出在牆上（兩間各畫各的、不互相平均）。
//   · 同一把尺：每一欄的水面照 33_wrwater.js wrColZ（模擬照用）換成高度；⛔ 不照水格「裝了幾成 × 格高」。
//   · 跟地球水平：頂點帶水面的世界高度，頂點著色器每一格畫面照船現在的姿態（uModel）換回船上的 z ⇒ 船晃的時候不用重做網格、水面照樣是平的；
//     z 夾在那一欄的上下界以內（兩次重做之間船晃太多也不會穿出甲板）。
//   · 靠牆、船殼、地板的那幾欄：每一格（0.1 m）看水面那一點落在哪一間 —— 是這一間的空氣才畫那一格（⛔ 整欄畫一塊 ⇒ 伸進牆裡、船殼外、高出地板）。整欄都是 ⇒ 2 × 2 片就夠。
//   · 重做：每 WRW_MS 一次（跟水格的 FL_MESH_MS 一樣），兩次之間照角的高度內插（角的鍵：哪一間 × 哪一角）。進水報表截圖時（FL_SNAP）每次都重做。
// 水從哪來（只給畫面，⛔ 不改戰局、不讀亂數）：
//   TASK-0808 之前 ⇒ 照現在的水格（33_flood.js sh.fl）分到房間（wrwBridge：每一格水從格底往上一層一層裝，那一層的空氣在哪幾間就照格數分過去），再每間拉平（33_wrwater.js wrLevelRoom）。
//   TASK-0808 之後 ⇒ 直接讀房間模擬的每欄水量（同一把尺）。
// 開關：畫質「艙內水面的畫法」（07_gfx.js GFX.proom；網址 ?g_proom=0／1）；進水報表 rooms=0／1。
var WRW_MS = 500, WRW_G = 2;
// 頂點：aP ＝ (x, y, 水面世界高度（這次重做的）, 水邊值)、aH0 ＝ 上一次重做時這一點畫面上的世界高度、aR ＝ 這一欄的 z 上下界（格座標）。
var WRW_VS = '#version 300 es\nlayout(location=0) in vec4 aP; layout(location=1) in float aH0; layout(location=2) in vec2 aR; uniform mat4 uModel,uVP; uniform float uMix,uVox; out vec3 vW; out float vF; out vec2 vG;\n' +
  'void main(){ float h=mix(aH0,aP.z,uMix), k=uModel[2][1]; float z=k>1e-4?(h-(uModel[0][1]*aP.x+uModel[1][1]*aP.y+uModel[3][1]))/k:aR.y; z=clamp(z,aR.x,aR.y);\n' +
  ' vec4 w=uModel*vec4(aP.xy,z,1.0); vW=w.xyz; vF=aP.w; vG=aP.xy*uVox; gl_Position=uVP*w; }\n';
/** 第 i 格水格每一層的空氣分到哪幾間：[l, 房, 格數, l, 房, 格數, …]（照 l 由下往上）。同型共用、照進水檔位的格大小各一份（wrxOf(T).split）。 */
function wrwSplit(T, F, i) {
  var X = wrxOf(T), W = T.wrm, SP = X.split && X.split.c === F.c ? X.split : (X.split = { c: F.c, m: new Map() }), e = SP.m.get(i);
  if (e) return e;
  var c = F.c, NX = F.NX, NXY = NX * F.NY, ix = i % NX, iy = ((i / NX) | 0) % F.NY, iz = (i / NXY) | 0, xa = F.X0 + ix * c, ya = F.Y0 + iy * c, yb = ya + c - 1;
  e = []; var all = new Map();
  for (var l = 0; l < c; l++) {
    var z = iz * c + l; if (z < 0 || z >= W.zTop) continue;
    var cnt = new Map();
    for (var x = xa; x < xa + c; x++) {
      var xi = x - W.x0; if (xi < 0 || xi >= W.nxv) continue;
      var k = z * W.nxv + xi;
      for (var q = W.rowS[k]; q < W.rowS[k + 1]; q++) {
        var a = Math.max(ya, W.ry0[q]), b = Math.min(yb, W.ry1[q]); if (a > b) continue;
        var r = W.regRoom[W.runReg[q]]; cnt.set(r, (cnt.get(r) || 0) + b - a + 1);
      }
    }
    cnt.forEach(function (n, r) { e.push(l, r, n); all.set(r, (all.get(r) || 0) + n); });
  }
  e.all = []; all.forEach(function (n, r) { e.all.push(r, n); e.allN = (e.allN || 0) + n; });   // 整格出現過的房間（那一層沒有房間 ⇒ 照它分；打穿的地方，TASK-0809 之前烘焙的房間沒有那幾格）
  SP.m.set(i, e); return e;
}
/** 整格都沒有房間（炸開的地方）⇒ 六個鄰格出現過的房間合起來 [房, 格數, …]（e.near、e.nearN；算一次留著）。 */
function wrwNear(T, F, i, e) {
  if (e.near) return e;
  var NX = F.NX, NXY = NX * F.NY, ix = i % NX, iy = ((i / NX) | 0) % F.NY, iz = (i / NXY) | 0, m = new Map();
  [ix > 0 ? i - 1 : -1, ix < NX - 1 ? i + 1 : -1, iy > 0 ? i - NX : -1, iy < F.NY - 1 ? i + NX : -1, iz > 0 ? i - NXY : -1, iz < F.NZ - 1 ? i + NXY : -1].forEach(function (k) {
    if (k < 0) return; var a = wrwSplit(T, F, k).all; for (var q = 0; q < a.length; q += 2) m.set(a[q], (m.get(a[q]) || 0) + a[q + 1]);
  });
  e.near = []; e.nearN = 0; m.forEach(function (n, r) { e.near.push(r, n); e.nearN += n; });
  return e;
}
/** 現在的水格 ⇒ 每間房幾單位（me.U，小數）。那一層沒有房間（打穿、不在烘焙的艙內空氣裡）⇒ 照整格出現過的房間分；整格都沒有 ⇒ 照六個鄰格的；還是沒有 ⇒ 記在 me.lost（m³，只給讀數）。 */
function wrwBridge(sh, me) {
  var fl = sh.fl, F = fl.F, c = F.c, A = fl.A, op = fl.op, S3 = S * S * S, U = me.U, lost = 0, tot = 0;
  U.fill(0);
  for (var t = 0; t < fl.actN; t++) {
    var i = fl.act[t], w = A[i] / S3; if (!(w > 1e-9)) continue;            // 這一格的水（格數）
    tot += w;
    var e = wrwSplit(sh.T, F, i), p = 0;
    if (!e.allN) { wrwNear(sh.T, F, i, e); if (e.nearN) { for (var q3 = 0; q3 < e.near.length; q3 += 2) U[e.near[q3]] += w * e.near[q3 + 1] / e.nearN * WR_U; continue; } }   // 整格都沒有房間 ⇒ 照六個鄰格的房間分
    for (var l = 0; l < c && w > 1e-9; l++) {
      var o = op[i * c + l]; if (o <= 0) continue;                            // 空著 0 格的那一層（甲板）：水過不去也不停在那裡（同 flMesh）
      var take = Math.min(w, o), n = 0, q; w -= take;
      while (p < e.length && e[p] < l) p += 3;
      for (q = p; q < e.length && e[q] === l; q += 3) n += e[q + 2];
      if (!n) { if (!e.allN) { lost += take; continue; } for (q = 0; q < e.all.length; q += 2) U[e.all[q]] += take * e.all[q + 1] / e.allN * WR_U; continue; }
      for (q = p; q < e.length && e[q] === l; q += 3) U[e[q + 1]] += take * e[q + 2] / n * WR_U;
    }
    if (w > 1e-9) { if (e.allN) for (var q2 = 0; q2 < e.all.length; q2 += 2) U[e.all[q2]] += w * e.all[q2 + 1] / e.allN * WR_U; else lost += w; }   // 裝超過格的容量的（擠上去還沒搬）⇒ 一樣照整格的房間分
  }
  me.lost = lost * S3; me.tot = tot * S3;
}
function wrwMix(me) { return FL_SNAP ? 1 : clamp((performance.now() - me.tw) / WRW_MS, 0, 1); }
// ── 細波（TASK-0811 驗收第 4 條；Tim 2026-10-22「顯示上 模擬房間表面的水傾斜跟波動」）：只給畫面 ──
//   噴進來的粒子（33_flood.js fl.J）往下掉、穿過它所在那一間的水面（wrwMesh 記的 me.hk）、水幕落到水面（fl.mesh.falls）⇒ 記一個漣漪點 [x, y（船的格座標）, 起點（SIMT）, 強度]；
//   同一個地方 0.3 秒內只起一圈、每艘最多 WRW_RN 圈、活 WRW_RT 秒。著色器（WRW_RIP_GLSL）照點往外擴的同心圓擾動法線、波峰加一點白沫。
//   時間照 SIMT（uSeaT）⇒ 暫停就停、慢動作就慢。⛔ 不抽 rnd()、不改水量：關掉（畫質「艙內水面的畫法」水格）戰局逐位相同。
var WRW_RN = 24, WRW_RT = 2.2, WRW_RGAP = 0.12;
var WRW_RIP_DECL = 'uniform vec4 uRip[' + WRW_RN + ']; uniform int uRipN; uniform vec4 uAx;\n';   // uRip ＝ (x, y（船上的公尺）, 起點秒, 強度)；uAx ＝ 船的 x、y 軸在世界 xz 上的方向
var WRW_RIP_GLSL = ' float wrRf=0.0; for(int i=0;i<' + WRW_RN + ';i++){ if(i>=uRipN) break; vec4 q=uRip[i]; float ag=uSeaT-q.z; if(ag<0.0) continue;\n' +
  '  float f0=0.2+0.85*ag; vec2 dv=vG-q.xy; float d=length(dv); if(d>f0+0.12) continue;\n' +
  '  float a=q.w*exp(-1.6*ag)*(1.0-smoothstep(f0-0.04,f0+0.12,d))*exp(-2.2*max(f0-d,0.0)), ph=17.0*(d-f0);\n' +   // 波前往外 0.85 m／秒、越往裡越淡、越老越淡
  '  vec2 gg=(d>1e-3?dv/d:vec2(0.0))*sin(ph)*a*0.32; r+=vec2(gg.x*uAx.x+gg.y*uAx.z,gg.x*uAx.y+gg.y*uAx.w); wrRf+=a*smoothstep(0.55,1.0,cos(ph)); }\n';
var WRW_RIP_FOAM = ' c=mix(c,vec3(0.82,0.9,0.92),clamp(wrRf,0.0,1.0)*0.45);\n';
/** 每一格畫面（flDraw）：照粒子、水幕記漣漪點（只看最多約 300 顆粒子，輪流）。 */
function wrwRipples(sh, me) {
  var fl = sh.fl, J = fl.J, W = sh.T.wrm, M = sh.M, C = W.c, NCK = W.NCX * W.NCY, R = me.rip || (me.rip = []), now = SIMT, HK = me.hk;
  while (R.length && (now - R[0][2] > WRW_RT || now < R[0][2])) R.shift();   // 照時間排：最老的在前（重開一局 SIMT 歸零 ⇒ 全清）
  if (!HK || !HK.size || now - (me.ripT === undefined ? -1 : me.ripT) < WRW_RGAP && now >= me.ripT) return;   // 整艘限速：WRW_RGAP 秒最多起一圈（⛔ 不限 ⇒ 噴流一格起好幾圈、24 圈一下就輪完，每一圈活不到半秒、看不見）
  var done = false;
  function add(x, y, z, amp) {
    if (done) return;
    var r = wrRoomAt(W, Math.floor(x), Math.floor(y), Math.floor(z)); if (r < 0) return;
    var h = HK.get(r * NCK + Math.floor((x - W.x0) / C) * W.NCY + Math.floor((y - W.ylo) / C)); if (h === undefined) return;
    var wy = M[1] * x + M[5] * y + M[9] * z + M[13]; if (wy > h + 0.08 || wy < h - 0.35) return;   // 剛好在水面那一帶
    for (var k = R.length - 1; k >= 0 && now - R[k][2] < 0.3; k--) { var dx = (R[k][0] - x) * S, dy = (R[k][1] - y) * S; if (dx * dx + dy * dy < 0.25) return; }
    R.push([x, y, now, amp]); if (R.length > WRW_RN) R.shift();
    done = true; me.ripT = now;
  }
  var step = Math.max(1, Math.ceil(J.n / 300)), off = me.ripK = ((me.ripK || 0) + 1) % step;
  for (var i = off; i < J.n; i += step) { var o = i * 3; if (J.v[o + 2] < 0) add(J.p[o], J.p[o + 1], J.p[o + 2], Math.min(1, 0.35 + 0.6 * Math.cbrt(J.vol[i]))); }
  var FS = GFX.fall && fl.mesh && fl.mesh.fn ? fl.mesh.falls : null;     // 水幕的落點：落到水面 ⇒ 一直起波（照流量）
  if (FS) for (var k2 = 0; k2 < FS.length; k2++) { var f = FS[k2]; add(f.x, f.y, f.z1 + 0.5, Math.min(1, 0.3 + f.r)); }
}
/** 畫房間的水面之前：這一艘的漣漪點、船軸（P.wpool 的 uRip、uRipN、uAx）。 */
function wrwRipU(p, sh, me) {
  var R = me.rip || [], A = me.ripA || (me.ripA = new Float32Array(WRW_RN * 4)), M = sh.M;
  for (var i = 0; i < R.length; i++) { A[i * 4] = R[i][0] * S; A[i * 4 + 1] = R[i][1] * S; A[i * 4 + 2] = R[i][2]; A[i * 4 + 3] = R[i][3]; }
  gl.uniform4fv(p.u.uRip, A); gl.uniform1i(p.u.uRipN, R.length);
  var ax = Math.hypot(M[0], M[2]) || 1, ay = Math.hypot(M[4], M[6]) || 1;
  gl.uniform4f(p.u.uAx, M[0] / ax, M[2] / ax, M[4] / ay, M[6] / ay);
}
/** 重做一艘的房間水面（到時間才做）⇒ me（vao、n 個頂點、讀數 st）。 */
function wrwMesh(sh) {
  var T = sh.T, W = T.wrm, X = wrxOf(T), M = sh.M, NR = W.roomVox.length, NCOL = W.colRoom.length, C = W.c;
  var me = sh.wrw || (sh.wrw = { vao: gl.createVertexArray(), vb: gl.createBuffer(), buf: new Float32Array(7 * 6 * 1024), n: 0, cap: 0, tw: -1e9, U: new Float64Array(NR), u: new Int32Array(NCOL), h: new Float64Array(NR), cv: new Map(), st: null });
  var now = performance.now();
  if (!FL_SNAP && me.n && now - me.tw < WRW_MS) return me;
  var mix0 = me.n ? wrwMix(me) : 1, prev = me.cv, j, r;
  me.tw = now;
  wrwBridge(sh, me); me.u.fill(0); var tB = performance.now();
  var wetR = [];
  for (r = 0; r < NR; r++) { var Ur = Math.round(me.U[r]); me.h[r] = Ur >= 1 ? wrLevelRoom(W, X, M, r, Ur, me.u) : NaN; if (Ur >= 1) wetR.push(r); }
  // 每一欄有水面（有水、沒滿）的世界高度 ⇒ 角（同一間房）累加
  var tL = performance.now(), NCX1 = W.NCX + 1, NCC = NCX1 * (W.NCY + 1), CS = new Map(), cols = [], hcol = [], HK = me.hk = new Map(), NCK = W.NCX * W.NCY;   // HK：(房, 欄) ⇒ 水面世界高度（細波 wrwRipples 查）
  function addC(k, v) { var e = CS.get(k); if (e) { e[0] += v; e[1]++; } else CS.set(k, [v, 1]); }
  wetR.forEach(function (r) {
    for (var j = W.roomCol0[r]; j < W.roomCol0[r + 1]; j++) {
      var u = me.u[j]; if (u <= 0 || u >= wrColCap(W, X, j)) continue;    // 沒水、滿到天花板 ⇒ 沒有水面
      var z = wrColZ(W, X, j, u), hw = M[1] * X.cx[j] + M[5] * X.cy[j] + M[9] * z + M[13], base = r * NCC + W.colCY[j] * NCX1 + W.colCX[j];
      cols.push(j); hcol.push(hw); HK.set(r * NCK + W.colCX[j] * W.NCY + W.colCY[j], hw);
      addC(base, hw); addC(base + 1, hw); addC(base + NCX1, hw); addC(base + NCX1 + 1, hw);
    }
  });
  var cv = new Map();                                                       // 角 ⇒ [這次的起點（上一次畫面上的高度）, 終點]
  CS.forEach(function (e, k) { var v = e[0] / e[1], p = prev.get(k); cv.set(k, [p ? p[0] + (p[1] - p[0]) * mix0 : v, v]); });
  me.cv = cv;
  // 每一欄：照四個角雙線性內插；整欄的每一格水面都落在這一間 ⇒ WRW_G × WRW_G 片，否則只畫落在這一間的那幾格
  var q = 0, quads = 0, clip = 0, vox = 0;
  function bil(H, u, v) { return (H[0] * (1 - u) + H[1] * u) * (1 - v) + (H[3] * (1 - u) + H[2] * u) * v; }
  function grow(nq) { if ((q + nq * 6) * 7 > me.buf.length) { var nb = new Float32Array(Math.max(me.buf.length * 2, (q + nq * 6) * 14)); nb.set(me.buf); me.buf = nb; } }
  var TRI6 = [0, 1, 2, 0, 2, 3], IN = new Uint8Array(C * C);
  for (var t = 0; t < cols.length; t++) {
    j = cols[t]; r = W.colRoom[j];
    var gx = W.colCX[j], gy = W.colCY[j], base = r * NCC + gy * NCX1 + gx, x0 = W.x0 + gx * C, y0 = W.ylo + gy * C, wc = Math.min(C, W.nxv - gx * C), hc = Math.min(C, W.ny - gy * C);
    var K4 = [base, base + 1, base + NCX1 + 1, base + NCX1], H0 = [], H1 = [];
    for (var a = 0; a < 4; a++) { var cc = cv.get(K4[a]); H0.push(cc[0]); H1.push(cc[1]); }
    var zlo = W.colZ0[j], zhi = W.colZ0[j] + W.colNZ[j], n = 0, b, Lmin = 1e9, Lmax = -1e9;
    for (a = 0; a < 4; a++) {                                               // 水面經過哪幾層：雙線性的極值在四個角 ⇒ 四個角的 z 夾出來
      var zc = (H1[a] - (M[1] * (x0 + (a === 1 || a === 2 ? wc : 0)) + M[5] * (y0 + (a >= 2 ? hc : 0)) + M[13])) / M[9], Lc = Math.floor(zc - 1e-3);
      Lmin = Math.min(Lmin, Lc); Lmax = Math.max(Lmax, Lc);
    }
    var full = Lmax - Lmin < 4;                                             // 那幾層這一欄每一格都是這間房 ⇒ 整欄都畫（⛔ 不用一格一格查）
    for (var L = Lmin; L <= Lmax && full; L++) { var dl = L - zlo; if (dl < 0 || dl >= W.colNZ[j] || W.cnt[W.colOff[j] + dl] !== wc * hc) full = false; }
    if (full) n = wc * hc;
    else for (a = 0; a < wc; a++) for (b = 0; b < hc; b++) {
      var xv = x0 + a, yv = y0 + b, hs = bil(H1, (a + 0.5) / wc, (b + 0.5) / hc), zs = (hs - (M[1] * (xv + 0.5) + M[5] * (yv + 0.5) + M[13])) / M[9];
      if ((IN[a * C + b] = wrRoomAt(W, xv, yv, Math.floor(zs - 1e-3)) === r ? 1 : 0)) n++;
    }
    if (!n) continue;
    if (n === wc * hc) full = true;
    var G = full ? WRW_G : 0, SP = [];                                      // SP：要畫的片 [u0, u1, v0, v1]；切邊的欄每一行（同一個 x）連著的格併成一條
    if (full) { for (a = 0; a < G; a++) for (b = 0; b < G; b++) SP.push(a / G, (a + 1) / G, b / G, (b + 1) / G); }
    else for (a = 0; a < wc; a++) for (b = 0; b < hc; b++) {
      if (!IN[a * C + b]) continue;
      var b1 = b; while (b1 + 1 < hc && IN[a * C + b1 + 1]) b1++;
      SP.push(a / wc, (a + 1) / wc, b / hc, (b1 + 1) / hc); b = b1;
    }
    grow(SP.length / 4); if (!full) clip++; vox += n;
    for (var sp = 0; sp < SP.length; sp += 4) {
      var u0 = SP[sp], u1 = SP[sp + 1], v0 = SP[sp + 2], v1 = SP[sp + 3];
      var CN = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      for (var e6 = 0; e6 < 6; e6++) {
        var cu = CN[TRI6[e6]][0], cvv = CN[TRI6[e6]][1], o7 = q * 7;
        me.buf[o7] = x0 + cu * wc; me.buf[o7 + 1] = y0 + cvv * hc; me.buf[o7 + 2] = bil(H1, cu, cvv); me.buf[o7 + 3] = 0;
        me.buf[o7 + 4] = bil(H0, cu, cvv); me.buf[o7 + 5] = zlo; me.buf[o7 + 6] = zhi; q++;
      }
      quads++;
    }
  }
  gl.bindVertexArray(me.vao); gl.bindBuffer(gl.ARRAY_BUFFER, me.vb);
  if (q * 7 > me.cap) {
    me.cap = me.buf.length; gl.bufferData(gl.ARRAY_BUFFER, me.cap * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 16);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
  }
  if (q) gl.bufferSubData(gl.ARRAY_BUFFER, 0, me.buf, 0, q * 7);
  gl.bindVertexArray(null);
  me.n = q;
  var Ut = 0; wetR.forEach(function (r) { Ut += Math.round(me.U[r]); });
  me.st = { rooms: wetR.length, cols: cols.length, clip: clip, vox: vox, quads: quads, tris: q / 3, m3: +(Ut / WR_U * S * S * S).toFixed(2), src: +me.tot.toFixed(2), lost: +me.lost.toFixed(3), ms: +(performance.now() - now).toFixed(2), msB: +(tB - now).toFixed(2), msL: +(tL - tB).toFixed(2) };
  return me;
}

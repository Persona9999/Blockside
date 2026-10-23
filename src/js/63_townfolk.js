// ───────────────────────── 城鎮居民（TASK-0846、0849；只給人看） ─────────────────────────
// Tim 2026-10-23：「參考這個畫風 以及Blockside的水手顯示架構(頭髮 衣服部分區域 可換色) 讓目前Blocksail的城鎮可以顯示居民在路上走動吧 … 然後居民素材只放在Blocksail(參考城鎮建築)」
//   「把鎮民相關機制獨立成一份.js 然後整理一下相關邏輯(鎮民單純是顯示用 不用完整模擬)」
// 只給人看：不碰模擬亂數 rnd()、模擬地形 C.h；位置只照畫面時間算（townFolkAt），不逐格推進 ⇒ 同一個時間點畫面相同，掉幀、暫停、離開又回來都不會走偏。
// 效能（Tim 2026-10-23「鎮民只在攝影機附近出現 且畫面外的不模擬」）：只畫鏡頭 TOWN_FOLK_OUT 以內（跟城鎮近景那一級對齊）；
//   每位的整條路線先算好外框（a.bb）⇒ 外框離鏡頭太遠、或整個在視錐外 ⇒ 連位置都不算；城整座太遠 ⇒ 連路網都不建。
// 素材：Blocksail world/townkit/_folk.js（tools/townfolk.py 產生：一列一個角色 96×192 PNG-8，繪製時預留鮮青色頭髮＋鮮洋紅主衣標記，轉成水手同款 (L, 0, L) 與 (0, L, L)），
//   跟著城鎮用到的模型一起向 Blocksail 索取（63_towns.js townKit ⇐ townFolkNeed），載入時走 41_crew_art.js 的 crewArt(im) 展開成「左半底圖｜右半遮罩」貼圖。
// 路網：每座城把 T.roads（扣掉門口短接線 link-door 與水面下的段）在交叉口切開、端點 2 m 內併成節點 ⇒ 路網圖；照總路長每 TOWN_FOLK_STEP 公尺一位（上限 TOWN_FOLK_MAX）。
// 路線：每位居民第一次算路網時就照 townHash 走好一條固定的路線（起點那條邊 ＋ 最多 TOWN_FOLK_HOPS 段、路口不折返、偶爾在路口停步），
//   之後沿路線走過去、停一下、原路走回來，一直來回 ⇒ 一圈的時間表（legs）排好，畫的時候照時間二分查到那一段。角色列、衣服色、髮色、步速、車道偏移也照 townHash。
// 接進 63_towns.js 的地方：townKit／townKitMake（townFolkNeed、townFolkTex）、townKitGpuFree（townFolkFree）、townProgs（著色器 folk、townFolkGl）、
//   townDraw 布旗之後（townFolkDraw）、townReplace（路沒改 ⇒ 沿用 T.folk）、townStat（townFolkStat、townFolkSum、'street'）。
var TOWN_FOLK = Q.get('townfolk') !== '0';                               // ?townfolk=0：不載、不畫城鎮居民（對照組）
var TOWN_FOLK_OUT = [160, 200], TOWN_FOLK_STEP = 14, TOWN_FOLK_MAX = 260, TOWN_FOLK_HOPS = 8;

// 看板：四邊形 aQ ∈ [−½, ½] × [0, 1]（P.quad），實例 aI ＝ (x, y, z, 高)、aS ＝ (寬比, 高比, 前傾, 彈跳)、aU ＝ (u0, v0, u1, v1)、aC ＝ (衣色號, 髮色號, 深淺, 0)
//   底圖與換色遮罩同 41_crew_art.js crewArt（左半底圖、右半遮罩：R ＝ 衣服、G ＝ 頭髮；底圖標記區的灰階 R/G/B ＝ L ∈ [4, 252]，L ＝ 100 還原代表色 ⇒ 乘 2.55）；吃城鎮陰影、夜裡的街燈與霧。
var TOWN_FOLK_VS = '#version 300 es\nlayout(location=0) in vec2 aQ; layout(location=4) in vec4 aI; layout(location=5) in vec4 aS; layout(location=6) in vec4 aU; layout(location=7) in vec4 aC; uniform mat4 uVP; uniform vec3 uEye, uRight; out vec2 vUV; out vec3 vW; out float vD; flat out ivec2 vC; flat out float vK;\n' +
  'void main(){ float h=aI.w*aS.y, w=aI.w*0.5*aS.x, x=aQ.x*w+aQ.y*aS.z*aI.w; vec3 p=aI.xyz+uRight*x+vec3(0.0,aQ.y*h+aS.w,0.0);\n' +
  ' vUV=vec2(mix(aU.x,aU.z,aQ.x+0.5),mix(aU.w,aU.y,aQ.y)); vW=p; vD=length(aI.xz-uEye.xz); vC=ivec2(aC.xy+0.5); vK=aC.z; gl_Position=uVP*vec4(p,1.0); }\n';
var TOWN_FOLK_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + TLAMP_GLSL + TOWN_FADE + 'uniform sampler2D uTex; uniform vec3 uClothC[8], uHairC[8], uEye, uFog, uBkK; uniform float uFogD; in vec2 vUV; in vec3 vW; in float vD; flat in ivec2 vC; flat in float vK; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; if(townCut(vD)) discard; vec4 t=texture(uTex,vUV); if(t.a<0.5) discard; vec4 m=texture(uTex,vUV+vec2(0.5,0.0)); vec3 c=t.rgb;\n' +
    ' int ci=clamp(vC.x,0,7), hi=clamp(vC.y,0,7); c=mix(c,clamp(uClothC[ci]*(t.r*2.55),0.0,1.0),m.r); c=mix(c,clamp(uHairC[hi]*(t.r*2.55),0.0,1.0),m.g);\n' +
    ' float sk=shadowK(vW,vec3(0.0,1.2,0.0)); vec3 lit=(0.58+0.42*(0.45*uSunK+0.55*sk))*uBkK+townLamp(vW,vec3(0.0,1.0,0.0))*0.85;\n' +
    ' vec3 col=c*vK*lit; float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};

/** townKit 跟外面那一頁多要的那一份（索引有 folk 才要）。 */
function townFolkNeed(I) { return TOWN_FOLK && I.folk ? ['_folk'] : []; }
/** 解開 Blocksail 傳來的 _folk.js ⇒ Promise<{ tex, rows, names, clothU, clothN, hairN } | null>；reuse ＝ 換一組模型時沿用的那一組（貼圖不重做）。 */
function townFolkTex(I, d, reuse) {
  if (reuse && reuse.folk) return Promise.resolve(reuse.folk);
  if (!TOWN_FOLK || !d || !d.png) return Promise.resolve(null);
  return new Promise(function (ok) {
    var im = new Image();
    im.onload = function () {
      var A = crewArt(im), C = d.cloth || I.folk.cloth || [], cu = new Float32Array(24);
      for (var i = 0; i < 8; i++) { var c = C[i % Math.max(1, C.length)] || [120, 120, 120]; cu[i * 3] = c[0] / 255; cu[i * 3 + 1] = c[1] / 255; cu[i * 3 + 2] = c[2] / 255; }
      ok({ tex: texFrom(A.cv, true), rows: d.rows || 9, names: I.folk.names || [], clothU: cu, clothN: Math.min(8, C.length || 8), hairN: Math.min(8, HAIR_KEYS.length) });   // 著色器的衣色、髮色表各 8 格
    };
    im.onerror = function () { ok(null); };
    im.src = 'data:image/png;base64,' + d.png;
  });
}
/** 丟掉模型組 K 時一起丟貼圖（keep 還在用同一份 ⇒ 留著）。 */
function townFolkFree(K, keep) { if (K.folk && K.folk.tex && !(keep && keep.folk === K.folk)) gl.deleteTexture(K.folk.tex); }
/** 看板的實例緩衝（townProgs 建好 P.quad 之後）：一位 16 個 float ＝ aI、aS、aU、aC。 */
function townFolkGl(P) {
  P.folkBuf = gl.createBuffer(); P.folkVao = gl.createVertexArray(); gl.bindVertexArray(P.folkVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.folkBuf); [4, 5, 6, 7].forEach(function (a, q) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 64, q * 16); });
}

/** 城 T 的路網與居民（第一次要畫這座城時算一次；建築模式改了路 ⇒ townReplace 不沿用 T.folk，下次重算）。 */
function townFolkPrep(T, F) {
  var G = townFolkGraph(T), edges = G.edges, N = G.roadM < 8 ? 0 : Math.max(6, Math.min(TOWN_FOLK_MAX, Math.round(G.roadM / TOWN_FOLK_STEP)));
  G.agents = [];
  for (var i = 0; i < N; i++) {
    var k = T.id + ':folk:' + i, target = townHash(k + ':e') * G.roadM, ei = 0;
    while (ei + 1 < edges.length && edges[ei].cum < target) ei++;
    var a = { id: i, spd: 1.15 + 0.45 * townHash(k + ':s'), lane: (townHash(k + ':l') - 0.5) * 0.65, art: (i < F.rows ? i : Math.floor(townHash(k + ':a') * F.rows)) % F.rows,
      cloth: Math.floor(townHash(k + ':c') * F.clothN) % F.clothN, hair: Math.floor(townHash(k + ':h') * F.hairN) % F.hairN,
      hgt: 1.68 + 0.16 * townHash(k + ':g'), sh: 0.94 + 0.12 * townHash(k + ':k'), ph: townHash(k + ':p') * 6.2832,
      e: ei, t: 0, dir: 1, stop: false, face: 1 };                       // e／t／dir／stop：這一格的位置（townFolkAt 照時間寫，不是狀態）；face：朝左朝右的遲滯（只是畫面）
    townFolkRoute(G, a, k, townHash(k + ':d') < 0.5 ? 1 : -1);
    G.agents.push(a);
  }
  T.folk = G;
  return G;
}
/** 路網圖：路段在交叉口切開（別條路的頂點落在這一段中間 ≤ 2.2 m ⇒ T 字路口也連得上）、端點 2 m 內併成節點。 */
function townFolkGraph(T) {
  var ax = BED.ax, az = BED.az, R = T.roads.filter(function (r) { return r.P && r.P.length >= 2 && r.w >= 2 && r.kind !== 'link-door'; });
  if (!R.length) R = T.roads.filter(function (r) { return r.P && r.P.length >= 2; });
  var raw = [], pts = [];
  R.forEach(function (r) {
    for (var q = 1; q < r.P.length; q++) {
      var za = r.z && r.z[q - 1], zb = r.z && r.z[q]; if ((za != null && za <= 0.05) || (zb != null && zb <= 0.05)) continue;   // 水面下的段（棧橋下、淹掉的路）
      var a = [r.P[q - 1][0] - ax, r.P[q - 1][1] - az], b = [r.P[q][0] - ax, r.P[q][1] - az], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1.5) continue;
      raw.push({ a: a, b: b, w: r.w || 3, L: L }); pts.push(a, b);
    }
  });
  var segs = [];
  raw.forEach(function (s) {
    var dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L2 = s.L * s.L, cuts = [0, 1];
    pts.forEach(function (p) {
      var u = ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dz) / L2; if (u <= 0.08 || u >= 0.92 || u * s.L < 1.5 || (1 - u) * s.L < 1.5) return;
      if (Math.hypot(p[0] - (s.a[0] + dx * u), p[1] - (s.a[1] + dz * u)) <= 2.2) cuts.push(u);
    });
    cuts.sort(function (x, y) { return x - y; });
    for (var i = 1; i < cuts.length; i++) {
      var u0 = cuts[i - 1], u1 = cuts[i]; if ((u1 - u0) * s.L < 1.2 && i < cuts.length - 1) continue;
      segs.push({ a: [s.a[0] + dx * u0, s.a[1] + dz * u0], b: [s.a[0] + dx * u1, s.a[1] + dz * u1], w: s.w });
    }
  });
  var nodes = [], edges = [], Ltot = 0;
  function nodeOf(p) {
    for (var i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i].x - p[0], nodes[i].z - p[1]) <= 2.0) return i;
    nodes.push({ x: p[0], z: p[1], adj: [] }); return nodes.length - 1;
  }
  segs.forEach(function (s) {
    var u = nodeOf(s.a), v = nodeOf(s.b); if (u === v) return;
    var A = nodes[u], B = nodes[v], dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz); if (L < 1.2) return;
    var ei = edges.length, ux = dx / L, uz = dz / L;
    Ltot += L;
    edges.push({ a: u, b: v, ax: A.x, az: A.z, dx: ux, dz: uz, nx: -uz, nz: ux, L: L, w: s.w, cum: Ltot });   // cum：照路長挑起點那條邊
    A.adj.push({ e: ei, dir: 1 }); B.adj.push({ e: ei, dir: -1 });
  });
  return { nodes: nodes, edges: edges, roadM: Ltot, line: null };
}
/** 居民 a 的固定路線與一圈的時間表：從起點那條邊照 townHash 往前走最多 TOWN_FOLK_HOPS 段（路口不折返、死巷就停），去程、終點停一下、原路回程、起點停一下。
 *  a.legs[i] ＝ { e, dir, t0, t1（邊上從第幾公尺走到第幾公尺；停步 t0 ＝ t1）, c1（這一段結束是一圈的第幾秒） }；a.per ＝ 一圈幾秒；a.off ＝ 起始時間差（大家不同步）。 */
function townFolkRoute(G, a, k, dir) {
  var edges = G.edges, nodes = G.nodes, hops = [{ e: a.e, dir: dir }], rest = [];
  for (var h = 1; h < TOWN_FOLK_HOPS; h++) {
    var p = hops[h - 1], e = edges[p.e], nd = nodes[p.dir > 0 ? e.b : e.a], cand = nd.adj.filter(function (c) { return c.e !== p.e; });
    if (!cand.length) break;
    var r = townHash(k + ':r' + h);
    hops.push(cand[Math.floor(r * cand.length) % cand.length]);
    rest.push(townHash(k + ':w' + h) < 0.16 ? 1.0 + 1.8 * r : 0);           // 走到這個路口停一下的機率與秒數（跟 0846 一樣）
  }
  var legs = [], c = 0;
  function walk(p, d) { var L = edges[p.e].L; c += L / a.spd; legs.push({ e: p.e, dir: d, t0: d > 0 ? 0 : L, t1: d > 0 ? L : 0, c1: c }); }
  function stop(s) { if (!(s > 0)) return; var g = legs[legs.length - 1]; c += s; legs.push({ e: g.e, dir: g.dir, t0: g.t1, t1: g.t1, c1: c }); }
  for (var i = 0; i < hops.length; i++) { walk(hops[i], hops[i].dir); stop(i < rest.length ? rest[i] : 1.5 + 2 * townHash(k + ':end')); }   // 去程，最後一段停在終點
  for (var j = hops.length - 1; j >= 0; j--) { walk(hops[j], -hops[j].dir); stop(j > 0 ? rest[j - 1] : 1.5 + 2 * townHash(k + ':home')); }   // 原路回程，回到起點也停一下
  var bb = [1e9, -10, 1e9, -1e9, 300, -1e9];                             // 整條路線的外框（同 bedSeen、townBoxDist 的格式；水平含車道偏移 3 m，高度先取寬 —— 建路網時地面不一定到了）
  hops.forEach(function (p) { var e = edges[p.e], x1 = e.ax + e.dx * e.L, z1 = e.az + e.dz * e.L; bb[0] = Math.min(bb[0], e.ax - 3, x1 - 3); bb[2] = Math.min(bb[2], e.az - 3, z1 - 3); bb[3] = Math.max(bb[3], e.ax + 3, x1 + 3); bb[5] = Math.max(bb[5], e.az + 3, z1 + 3); });
  a.legs = legs; a.per = c; a.off = townHash(k + ':t') * c; a.bb = bb;
}
/** 時間 clock（秒）時居民 a 在哪：寫進 a.e、a.t（邊上第幾公尺）、a.dir、a.stop。測試用的排隊（G.line）⇒ 前幾位站在同一條街上。 */
function townFolkAt(G, a, clock) {
  if (G.line && a.id < G.line.n) { var E = G.edges[G.line.e]; a.e = G.line.e; a.t = Math.min(E.L - 1.5, 4.0 + a.id * 1.9); a.dir = a.id % 2 ? 1 : -1; a.stop = true; return; }
  var L = a.legs, u = (clock + a.off) % a.per, lo = 0, hi = L.length - 1;
  while (lo < hi) { var m = (lo + hi) >> 1; if (L[m].c1 <= u) lo = m + 1; else hi = m; }
  var g = L[lo], c0 = lo ? L[lo - 1].c1 : 0, f = g.c1 > c0 ? Math.min(1, (u - c0) / (g.c1 - c0)) : 0;
  a.e = g.e; a.dir = g.dir; a.t = g.t0 + (g.t1 - g.t0) * f; a.stop = g.t0 === g.t1;
}
/** 測試用（__game.town('street')）：挑城 T 市中心附近最長的一段街道，前 F.rows 位排在那條街上（每個角色一位）⇒ 回傳機位（給 __game.cam 對焦拍街景）。
 *  walk（__game.town('walk')）⇒ 同一個機位、不排隊（排過的放回去照路線走）。 */
function townFolkStreet(T, F, walk) {
  var G = T.folk || townFolkPrep(T, F); if (!G.edges.length) return null;
  var cx = T.ox - BED.ax, cz = T.oy - BED.az, best = 0, bestSc = -1e9;
  G.edges.forEach(function (e, i) {
    var sc = e.L * 0.6 - Math.hypot(e.ax + e.dx * e.L / 2 - cx, e.az + e.dz * e.L / 2 - cz) * 0.35;
    if (sc > bestSc && e.L >= 20 && e.w >= 3) { bestSc = sc; best = i; }
  });
  G.line = walk ? null : { e: best, n: Math.min(F.rows, G.agents.length) };
  Object.keys(T.gt || {}).forEach(function (gk) { if (T.gt[gk].dirty) T.gt[gk].edit = true; });   // 還沒建的地面區不等背景預算（同建築模式改到的區）⇒ 截圖時地面在
  var E = G.edges[best], tx = E.ax + E.dx * 11.5, tz = E.az + E.dz * 11.5, ty = (townRoadHeight(tx, tz) || 2) + 1.3;
  return { tgt: [+tx.toFixed(2), +ty.toFixed(2), +tz.toFixed(2)], yaw: +(Math.atan2(-E.dz, -E.dx) + 0.14).toFixed(4), pitch: 0.12, dist: 11.5, mode: 0, track: false, tr: null };
}

/** 畫出所有城鎮看得到的居民（townDraw 布旗之後；clock ＝ 城鎮的畫面時間）⇒ 三角形數。 */
function townFolkDraw(P, K, eye, PL, fogD, clock) {
  TOWNS.stat.folk = TOWNS.stat.folkPos = 0;
  var F = K && K.folk; if (!TOWN_FOLK || !F || !P.folk) return 0;
  var fwd = sub(CAM.look, eye), rl = Math.hypot(fwd[2], fwd[0]) || 1, rx = -fwd[2] / rl, rz = fwd[0] / rl;
  var maxD = TOWN_FOLK_OUT[1], rows = F.rows, B = TOWNS.folkArr || (TOWNS.folkArr = new Float32Array(256 * 16)), n = 0, npos = 0;
  TOWNS.list.forEach(function (T) {
    var b = T.box, bx = Math.max(b[0] - BED.ax - eye[0], 0, eye[0] - (b[2] - BED.ax)), bz = Math.max(b[1] - BED.az - eye[2], 0, eye[2] - (b[3] - BED.az));
    if (Math.hypot(bx, bz) > maxD) return;                              // 整座城都在範圍外 ⇒ 連路網都不建（位置只看時間，回來時照樣接得上）
    var G = T.folk || townFolkPrep(T, F);
    G.agents.forEach(function (a) {
      var ln = G.line && a.id < G.line.n;
      if (!ln && (townBoxDist(a.bb, eye) > maxD || !bedSeen(PL, a.bb))) return;   // 整條路線都太遠、或整個在畫面外 ⇒ 不算
      townFolkAt(G, a, clock); npos++;
      var e = G.edges[a.e], off = (0.18 * a.dir + (ln ? ((a.id % 3) - 1) * 0.28 : a.lane)) * Math.max(0.3, Math.min(2.8, e.w - 1.2));   // 靠右走（照前進方向）＋ 車道偏移
      var x = e.ax + e.dx * a.t + e.nx * off, z = e.az + e.dz * a.t + e.nz * off;
      if (Math.hypot(x - eye[0], z - eye[2]) > maxD) return;
      var y = townRoadHeight(x, z); if (!(y === y) || y <= 0.05) return;
      y += TOWN_ROAD_LIFT;
      for (var i = 0; i < 6; i++) { var pl = PL[i]; if (pl[0] * x + pl[1] * (y + 0.9) + pl[2] * z + pl[3] < -2.2) return; }
      var mv = (e.dx * rx + e.dz * rz) * a.dir;
      if (mv > 0.08) a.face = 1; else if (mv < -0.08) a.face = -1;
      var sx = 1, sy = 1, lean = 0, bob = 0;
      if (a.stop) { var br = Math.sin(clock * 2.2 + a.ph); sy = 1 + 0.012 * br; sx = 1 - 0.008 * br; lean = a.face * 0.015 * br; }   // 停著：呼吸
      else { var w = clock * a.spd * 1.45 + a.ph, r = Math.abs(Math.sin(w * 6.2832)); bob = 0.065 * r; lean = a.face * (0.055 + 0.035 * Math.sin(w * 6.2832)); sy = 0.96 + 0.04 * r; sx = 1.03 - 0.03 * r; }   // 走路：彈跳、前傾（同水手）
      if (B.length < (n + 1) * 16) { var B2 = new Float32Array(B.length * 2); B2.set(B); B = TOWNS.folkArr = B2; }
      var o = n++ * 16, v0 = a.art / rows, v1 = (a.art + 1) / rows;
      B[o] = x; B[o + 1] = y; B[o + 2] = z; B[o + 3] = a.hgt;
      B[o + 4] = sx; B[o + 5] = sy; B[o + 6] = lean; B[o + 7] = bob;
      B[o + 8] = a.face > 0 ? 0 : 0.5; B[o + 9] = v0; B[o + 10] = a.face > 0 ? 0.5 : 0; B[o + 11] = v1;
      B[o + 12] = a.cloth; B[o + 13] = a.hair; B[o + 14] = a.sh; B[o + 15] = a.face;
    });
  });
  TOWNS.stat.folk = n; TOWNS.stat.folkPos = npos;                       // folkPos：這一格算了幾位的位置（外框過了、還沒照實際位置剔）
  if (!n) return 0;
  var PF = P.folk; gl.useProgram(PF.prog); setCommon(PF);
  gl.uniform1f(PF.u.uFogD, fogD); gl.uniform3fv(PF.u.uEye, eye); gl.uniform3f(PF.u.uRight, rx, 0, rz);
  gl.uniform2f(PF.u.uIn, -2, -1); gl.uniform2f(PF.u.uOut, TOWN_FOLK_OUT[0], TOWN_FOLK_OUT[1]);
  gl.uniform3fv(PF.u.uClothC || PF.u['uClothC[0]'], F.clothU); gl.uniform3fv(PF.u.uHairC || PF.u['uHairC[0]'], HAIR_U.subarray(0, 24));
  gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D, F.tex); gl.uniform1i(PF.u.uTex, 11); gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(P.folkVao); gl.bindBuffer(gl.ARRAY_BUFFER, P.folkBuf);
  gl.bufferData(gl.ARRAY_BUFFER, B.subarray(0, n * 16), gl.DYNAMIC_DRAW);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
  return 2 * n;
}

/** 讀數：城 T 的那一份（townStat 每座城的 folk）。 */
function townFolkStat(T) {
  var G = T.folk; if (!G) return null;
  return { agents: G.agents.length, edges: G.edges.length, nodes: G.nodes.length, roadM: Math.round(G.roadM), line: G.line,
    sample: G.agents.slice(0, 8).map(function (a) { var e = G.edges[a.e]; return { id: a.id, art: a.art, cloth: a.cloth, hair: a.hair, legs: a.legs.length, per: +a.per.toFixed(1), t: +a.t.toFixed(2), x: +(e.ax + e.dx * a.t).toFixed(1), z: +(e.az + e.dz * a.t).toFixed(1) }; }) };
}
/** 讀數：全部城加起來（townStat 頂層的 folk）。 */
function townFolkSum() {
  var F = TOWNS.kit && TOWNS.kit.folk; if (!F) return null;
  return { rows: F.rows, names: F.names, cloth: F.clothN, hair: F.hairN, total: TOWNS.list.reduce(function (s, T) { return s + (T.folk ? T.folk.agents.length : 0); }, 0), pos: TOWNS.stat.folkPos || 0, drawn: TOWNS.stat.folk || 0, clock: +(TOWNS.flagClock || 0).toFixed(3) };   // clock：位置照的那個畫面時間
}

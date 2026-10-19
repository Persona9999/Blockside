// ───────────────────────── 樹（程序生成；只給人看，Tim 2026-10-19） ─────────────────────────
// Tim：「嘗試用程序生成樹木吧(需要是通用架構) 樹本身也是透過程序生成(定義跟 枝幹 樹葉等) 讓樹有隨機性 然後可以支援不同樹種(保留擴充性 先做一種就好)」
// 樹種一張表（TREE_SPECIES）：一棵樹 ＝ 樹幹 ＋ 一層一層的枝（每一層從上一層的枝幹長出來）＋ 長在最後一層枝尖的樹葉。
//   加一種樹 ＝ 在表裡加一筆（形狀全在參數裡，程式不分樹種）；樹葉的長法照 leaf.kind 分派（TREE_LEAF；現在只有 cluster ＝ 一團一團的葉簇）。
// treeSkel(種, 種子) ⇒ 骨架（枝幹的折線、半徑、枝尖）；treeMesh(骨架, 細度) ⇒ 網格：
//   細度 0 ＝ 細的（近景）、1 ＝ 低模（中景：枝少一層、葉簇併成每根枝一大團、管子邊數少）；遠景的貼圖由 63_trees.js 照細的那一份拍。
// 同一個骨架出兩種細度 ⇒ 換細度時輪廓不跳。亂數一律 treeRng（自己的種子）：⛔ 不抽戰局的 rnd()（樹只給人看，開不開樹戰局逐位元組相同）。
// 網格：頂點 10 個 float ＝ 位置 3、法線 3、顏色 3、搖晃權重 1（0 ＝ 樹根不動、1 ＝ 葉尖晃最多）；索引 Uint16。模型座標：樹根在原點、y 朝上、單位公尺。
var TREE_SPECIES = {
  broadleaf: {
    name: '闊葉樹',                                                     // 加勒比海島上的熱帶闊葉林（海葡萄、桃花心木那一類的輪廓）：矮壯、樹冠寬
    height: [8, 14],                                                    // 樹幹（含樹冠）高，公尺（每棵隨機）
    trunk: { r: [0.22, 0.34], taper: 0.45, bend: 0.12, segs: 6, sides: [7, 4], lean: 0.08, col: [0.33, 0.25, 0.17], top: 0.62 },   // top：樹幹長到總高的幾成（上面是樹冠）
    levels: [                                                           // 分枝：n 枝、長在母枝的 from 那一段、跟母枝夾 angle 度、長 len × 母枝長、粗 r × 母枝在那裡的粗、up 往上翹
      { n: [4, 6], from: [0.45, 1.0], angle: [38, 62], len: [0.55, 0.75], r: 0.55, bend: 0.18, up: 0.25, segs: 4, sides: [5, 3] },
      { n: [3, 4], from: [0.35, 0.95], angle: [28, 52], len: [0.45, 0.65], r: 0.5, bend: 0.22, up: 0.12, segs: 3, sides: [3, 0] }   // sides 0 ＝ 低模不畫這一層
    ],
    leaf: { kind: 'cluster', per: [2, 3], size: [1.3, 2.1], flat: 0.7, col: [0.21, 0.37, 0.14], vary: 0.14, along: 0.35 },   // 每個枝尖 per 團、團的半徑 size 公尺、扁一點（flat）、along：沿最後一段往回也長
    place: { spacing: 9, hMin: 2.5, hMax: 650, slopeMax: 0.65, mats: [11], forest: 0.55, scale: [0.8, 1.2] },   // 63_trees.js：每 spacing 公尺一個候選點；海拔、坡度（tan）、底質（11 ＝ LAND）；forest ＝ 林地佔幾成（照雜訊成片）
    variants: 6                                                         // 每種先生幾棵不同的（實例照位置挑一棵、再轉、再縮放）
  }
};

/** 有種子的亂數（mulberry32）：⇒ 回一個函式，每叫一次回 [0, 1)。 */
function treeRng(seed) {
  var a = seed >>> 0;
  return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function treeIn(R, a) { return a[0] + (a[1] - a[0]) * R(); }
function treeNorm(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
/** 跟 d 垂直的兩個單位向量（建管子的環、轉分枝的方向）。 */
function treePerp(d) {
  var a = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  var u = treeNorm([a[1] * d[2] - a[2] * d[1], a[2] * d[0] - a[0] * d[2], a[0] * d[1] - a[1] * d[0]]);
  return [u, [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]];
}

/** 骨架：{ sp, h, br: [{ pts, r0, r1, lv, par }], tips: [{ p, d, br }] }。lv −1 ＝ 樹幹；par ＝ 母枝在 br 裡的編號。 */
function treeSkel(sp, seed) {
  var S = TREE_SPECIES[sp], R = treeRng(seed), h = treeIn(R, S.height), out = { sp: sp, h: h, br: [], tips: [] }, T = S.trunk;
  var lean = [(R() - 0.5) * 2 * T.lean, 1, (R() - 0.5) * 2 * T.lean];
  grow(-1, [0, 0, 0], treeNorm(lean), h * T.top, treeIn(R, T.r), -1);
  return out;
  function grow(lv, p0, dir, len, r0, par) {
    var L = lv < 0 ? T : S.levels[lv], segs = L.segs, pts = [p0], d = dir, p = p0;
    for (var s = 1; s <= segs; s++) {
      var b = L.bend;
      d = treeNorm([d[0] + (R() - 0.5) * 2 * b, d[1] + (R() - 0.5) * 2 * b + (L.up || 0) / segs, d[2] + (R() - 0.5) * 2 * b]);
      p = [p[0] + d[0] * len / segs, p[1] + d[1] * len / segs, p[2] + d[2] * len / segs]; pts.push(p);
    }
    var me = out.br.length, r1 = r0 * (lv < 0 ? T.taper : 0.35);
    out.br.push({ pts: pts, r0: r0, r1: r1, lv: lv, par: par, len: len });
    var nx = lv + 1;
    if (nx >= S.levels.length) { out.tips.push({ p: p, d: d, br: me, len: len }); return; }
    var C = S.levels[nx], n = Math.round(treeIn(R, C.n)), az0 = R() * 6.2832;
    if (lv < 0) out.tips.push({ p: p, d: d, br: me, len: len * 0.3, top: true });   // 樹幹頂：也長一團（樹冠中間不空）
    for (var k = 0; k < n; k++) {
      var f = C.from[0] + (C.from[1] - C.from[0]) * (k + 0.3 + 0.4 * R()) / n, at = treeAt(pts, f), rr = r0 + (r1 - r0) * f;
      var pd = treeNorm([pts[Math.min(segs, Math.floor(f * segs) + 1)][0] - pts[Math.floor(f * segs)][0], pts[Math.min(segs, Math.floor(f * segs) + 1)][1] - pts[Math.floor(f * segs)][1], pts[Math.min(segs, Math.floor(f * segs) + 1)][2] - pts[Math.floor(f * segs)][2]]);
      var az = az0 + k * 2.39996 + (R() - 0.5) * 0.6, an = treeIn(R, C.angle) * Math.PI / 180, B = treePerp(pd), ca = Math.cos(az), sa = Math.sin(az);
      var side = [B[0][0] * ca + B[1][0] * sa, B[0][1] * ca + B[1][1] * sa, B[0][2] * ca + B[1][2] * sa];
      var cd = treeNorm([pd[0] * Math.cos(an) + side[0] * Math.sin(an), pd[1] * Math.cos(an) + side[1] * Math.sin(an) + C.up, pd[2] * Math.cos(an) + side[2] * Math.sin(an)]);
      var cl = (lv < 0 ? h * (1 - T.top) * 1.6 : len) * treeIn(R, C.len) * (1 - 0.3 * f);
      grow(nx, at, cd, cl, rr * C.r, me);
    }
  }
}
/** 折線上 f（0～1，照段數平分）那一點。 */
function treeAt(pts, f) {
  var n = pts.length - 1, x = Math.max(0, Math.min(n - 1e-6, f * n)), i = Math.floor(x), t = x - i, a = pts[i], b = pts[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** 骨架 ⇒ 網格。lod 0 細、1 低模。⇒ { V: Float32Array（10 個一組）, I: Uint16Array, h, w（樹冠半寬，遠景貼圖的框用） }。 */
function treeMesh(K, lod) {
  var S = TREE_SPECIES[K.sp], R = treeRng(K.br.length * 7919 + Math.round(K.h * 100) + lod), V = [], I = [], w = 0;
  function vert(p, n, c, sw) { V.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], sw); w = Math.max(w, Math.abs(p[0]), Math.abs(p[2])); return V.length / 10 - 1; }
  K.br.forEach(function (b) {
    var L = b.lv < 0 ? S.trunk : S.levels[b.lv], sides = L.sides[lod]; if (!sides) return;
    var P = b.pts, n = P.length, base = V.length / 10, col = S.trunk.col, kc = 0.9 + 0.2 * R();
    for (var i = 0; i < n; i++) {
      var d = treeNorm(i < n - 1 ? [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1], P[i + 1][2] - P[i][2]] : [P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]]);
      var B = treePerp(d), r = b.r0 + (b.r1 - b.r0) * i / (n - 1), sw = Math.min(1, Math.max(0, (P[i][1] / K.h) * 0.6 + (b.lv + 1) * 0.15)), dk = b.lv < 0 && i === 0 ? 0.75 : 1;
      for (var s = 0; s < sides; s++) {
        var a = s / sides * 6.2832, nn = [B[0][0] * Math.cos(a) + B[1][0] * Math.sin(a), B[0][1] * Math.cos(a) + B[1][1] * Math.sin(a), B[0][2] * Math.cos(a) + B[1][2] * Math.sin(a)];
        vert([P[i][0] + nn[0] * r, P[i][1] + nn[1] * r, P[i][2] + nn[2] * r], nn, [col[0] * kc * dk, col[1] * kc * dk, col[2] * kc * dk], sw);
      }
    }
    for (i = 0; i < n - 1; i++) for (s = 0; s < sides; s++) {
      var a0 = base + i * sides + s, a1 = base + i * sides + (s + 1) % sides, b0 = a0 + sides, b1 = a1 + sides;
      I.push(a0, b0, a1, a1, b0, b1);
    }
  });
  // 樹葉：細 ⇒ 每個枝尖 per 團（沿最後一段往回也長）；低模 ⇒ 每根母枝的枝尖併成一大團（中心 ＝ 平均、半徑涵蓋）
  var Lf = S.leaf, blobs = [];
  if (lod === 0) K.tips.forEach(function (t) {
    var b = K.br[t.br], m = Math.round(treeIn(R, Lf.per)) + (t.top ? 1 : 0);
    for (var j = 0; j < m; j++) { var q = treeAt(b.pts, 1 - Lf.along * R()); blobs.push({ c: [q[0] + (R() - 0.5) * 1.2, q[1] + (R() - 0.2) * 0.8, q[2] + (R() - 0.5) * 1.2], r: treeIn(R, Lf.size) }); }
  });
  else {
    var G = {};
    K.tips.forEach(function (t) { var k = t.top ? 'top' : K.br[t.br].par; (G[k] = G[k] || []).push(t.p); });
    Object.keys(G).forEach(function (k) {
      var L = G[k], c = [0, 0, 0]; L.forEach(function (p) { c[0] += p[0] / L.length; c[1] += p[1] / L.length; c[2] += p[2] / L.length; });
      var r = 0; L.forEach(function (p) { r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])); });
      blobs.push({ c: c, r: r * 0.8 + Lf.size[1] });
    });
  }
  var mid = [0, K.h * 0.7, 0];
  blobs.forEach(function (bl) { TREE_LEAF[Lf.kind](bl, Lf, R, mid, K.h, vert, I, V); });
  return { V: new Float32Array(V), I: new Uint16Array(I), h: K.h, w: w };
}
// 樹葉的長法（leaf.kind ⇒ 函式）：加一種（棕櫚葉 frond、針葉 needle…）＝ 在這裡加一個。
var TREE_ICO = (function () {                                            // 正二十面體（12 點、20 面；葉簇的底）
  var t = (1 + Math.sqrt(5)) / 2, P = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(treeNorm);
  var F = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  return { P: P, F: F };
})();
var TREE_LEAF = {
  /** 一團葉簇：扁一點的二十面體、每個頂點抖一點；法線一半照團、一半照「從樹冠中心往外」⇒ 整個樹冠像一顆柔和的球，不是一顆一顆的硬塊；下半部暗一點（樹冠裡面的陰影）。 */
  cluster: function (bl, Lf, R, mid, h, vert, I, V) {
    var base = V.length / 10, k = 1 + (R() - 0.5) * 2 * Lf.vary, c0 = [Lf.col[0] * k, Lf.col[1] * (1 + (R() - 0.5) * Lf.vary), Lf.col[2] * k];
    var out = treeNorm([bl.c[0] - mid[0], (bl.c[1] - mid[1]) * 0.6 + 0.4, bl.c[2] - mid[2]]);
    TREE_ICO.P.forEach(function (p) {
      var j = 0.82 + 0.36 * R(), q = [bl.c[0] + p[0] * bl.r * j, bl.c[1] + p[1] * bl.r * j * Lf.flat, bl.c[2] + p[2] * bl.r * j];
      var n = treeNorm([p[0] + out[0], p[1] * 1.2 + out[1], p[2] + out[2]]), dk = 0.72 + 0.28 * (p[1] * 0.5 + 0.5);
      vert(q, n, [c0[0] * dk, c0[1] * dk, c0[2] * dk], Math.min(1, 0.55 + 0.45 * bl.c[1] / h));
    });
    for (var f = 0; f < TREE_ICO.F.length; f++) I.push(base + TREE_ICO.F[f]);
  }
};

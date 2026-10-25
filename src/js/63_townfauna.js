// ───────────────────────── 城鎮的動物（TASK-0933、0934；只給人看） ─────────────────────────
// Tim 2026-10-25：「動物可以跟鎮民一樣用2D圖片演出(會移動 晃動) 且可以有野生動物(用一樣的演出)」「動物可以先用點陣圖(參考 /scp-canvas )」「可能用64*64的點陣圖試試」
// 只給人看：同鎮民（63_townfolk.js）—— 不碰模擬亂數 rnd()、不寫城鎮帳；位置只照畫面時間算（townFaunaAt），掉幀、暫停、離開又回來都不會走偏；?fauna=0 ⇒ 不載、不畫（對照組）。
// 素材：Blocksail world/townkit/_fauna.js（tools/fauna.py 產生）：一種動物一列（毛色多的幾列）、兩格（站著、邁步），一格 cell × cell、朝右、腳底貼最下面那一列；
//   kinds[id] ＝ { rows, size（一格的邊長，公尺）, spd（m／s）, dens（圈裡每幾 m² 一隻）, herd（野外一群幾隻）, roam（一群在幾公尺內晃） }。
//   跟鎮民一起向 Blocksail 要（townKit ⇐ townFaunaNeed）；載入時走 crewArt 展開成「底圖｜遮罩」（遮罩是空的：點陣圖不用換色），畫的時候借鎮民那一支著色器（P.folk）。
// 兩種動物：
//   ① 圈裡的（家畜）：模型的固定點 pen-<物種>-<組><號>（Blocksail BUILDING_SPEC §5）—— 同一組兩點 ＝ 長方形的對角、三點以上 ＝ 照號碼連成的凸多邊形；
//     點 ＝ 動物的中心走得到的地方（作者量好離牆、槽半個身長）⇒ 在多邊形裡隨機挑幾個點、直線來回（凸的 ⇒ 直線不出圈）。隻數 ＝ 面積 ÷ dens（至少 1、至多 TOWN_PEN_MAX）。
//     房子還在蓋（63_townrise.js townRiseHides）⇒ 那一棟不放。實例換了、工地進度換了 ⇒ 重擺（同建築裡的工人）。
//   ② 城外的（野生動物）：規劃的 live.fauna ＝ 那座城一帶地球儀物種表查得到的陸上動物（Blocksail globe.html townLive；網址 ?wild=a,b ⇒ 換成這幾種，測試用）⇒
//     鏡頭附近的世界格子照雜湊放幾群（城外 ＝ 不在任何一座城的地塊、路旁邊），一群在 roam 公尺內晃；地面要到了才擺（townGround），水上、城裡、太陡的點不去。
var TOWN_FAUNA = Q.get('fauna') !== '0';
var TOWN_PEN_RE = /^pen-([a-z_]+)-([a-z]?)(\d+)$/, TOWN_PEN_MAX = 8, TOWN_FAUNA_HOPS = 5;   // HOPS：一隻在幾個點之間輪流走
var TOWN_WILD_CELL = 110, TOWN_WILD_P = 0.3, TOWN_WILD_NEAR = 5000, TOWN_WILD_GAP = [14, 10];   // 城外（見「② 城外的」）：一格幾公尺、幾成的格有一群、照多遠內的城挑物種、離地塊與路多遠才算城外

/** townKit 跟外面那一頁多要的（索引有 fauna 才要）。 */
function townFaunaNeed(I) { return TOWN_FAUNA && I.fauna && I.fauna.file ? [I.fauna.file] : []; }
/** D ＝ townModels 收到的那一組 ⇒ Promise<{ tex, kinds, rows, cell, frames, w, h } | null>；reuse ＝ 換一組模型時沿用的那一組。 */
function townFaunaTex(I, D, reuse) {
  if (reuse && reuse.fauna) return Promise.resolve(reuse.fauna);
  var d = TOWN_FAUNA && I.fauna && D && D[I.fauna.file]; if (!d || !d.png) return Promise.resolve(null);
  return new Promise(function (ok) {
    var im = new Image();
    im.onload = function () { ok({ tex: texFrom(crewArt(im).cv, true), kinds: d.kinds, ids: d.ids, cell: d.cell, frames: d.frames, w: im.width, h: im.height, rows: im.height / d.cell }); };
    im.onerror = function () { ok(null); };
    im.src = 'data:image/png;base64,' + d.png;
  });
}
function townFaunaFree(K, keep) { if (K.fauna && K.fauna.tex && !(keep && keep.fauna === K.fauna)) gl.deleteTexture(K.fauna.tex); }

// ── 共用：一隻動物在幾個點之間走、停 ──
/** P ＝ 走得到的點 [{ x, z }]（第一點 ＝ 起點）⇒ a.legs（同建築裡的工人：{ c1, p, q }）、a.per、a.off；停的秒數照雜湊（2～9 秒，雞短一點）。 */
function townFaunaLegs(a, P, k) {
  var legs = [], c = 0, n = P.length;
  for (var i = 0; i < n; i++) {
    var p = P[i], q = P[(i + 1) % n], st = (a.size < 0.8 ? 1.2 : 2.5) + 6 * townHash(k + ':st' + i);
    c += st; legs.push({ c1: c, p: i, q: i });
    if (q !== p) { c += Math.hypot(q.x - p.x, q.z - p.z) / a.spd; legs.push({ c1: c, p: i, q: (i + 1) % n }); }
  }
  a.P = P; a.legs = legs; a.per = c; a.off = townHash(k + ':t') * c;
}
/** 時間 clock 時 a 在哪 ⇒ a.x／a.z、a.mx／a.mz（往哪走；停著 ＝ 0）、a.stop。 */
function townFaunaAt(a, clock) {
  var L = a.legs, u = ((clock + a.off) % a.per + a.per) % a.per, lo = 0, hi = L.length - 1;
  while (lo < hi) { var m = (lo + hi) >> 1; if (L[m].c1 <= u) lo = m + 1; else hi = m; }
  var g = L[lo], c0 = lo ? L[lo - 1].c1 : 0, f = g.c1 > c0 ? Math.min(1, (u - c0) / (g.c1 - c0)) : 0, p = a.P[g.p], q = a.P[g.q];
  a.x = p.x + (q.x - p.x) * f; a.z = p.z + (q.z - p.z) * f; a.stop = g.p === g.q; a.mx = q.x - p.x; a.mz = q.z - p.z;
}
/** 一隻的設定（種類、第幾種毛色、大小 ± 6%、深淺、相位）。 */
function townFaunaMake(F, sp, k, extra) {
  var K = F.kinds[sp], a = { sp: sp, k: k, row: K.rows[Math.floor(townHash(k + ':v') * K.rows.length) % K.rows.length],
    size: K.size * (0.94 + 0.12 * townHash(k + ':g')), spd: K.spd * (0.85 + 0.3 * townHash(k + ':s')), sh: 0.94 + 0.12 * townHash(k + ':k'), ph: townHash(k + ':p') * 6.2832, face: townHash(k + ':f') < 0.5 ? 1 : -1 };
  return Object.assign(a, extra);
}
/** 凸多邊形 Q（[{x, z}]，扇形切三角形）裡照雜湊挑一點。 */
function townFaunaInPoly(Q, k) {
  var tri = [], tot = 0;
  for (var i = 1; i + 1 < Q.length; i++) { var A = Q[0], B = Q[i], C = Q[i + 1], s = Math.abs((B.x - A.x) * (C.z - A.z) - (C.x - A.x) * (B.z - A.z)) / 2; tot += s; tri.push([A, B, C, tot]); }
  var h = townHash(k + ':tri') * tot, T = tri.filter(function (t) { return t[3] >= h; })[0] || tri[tri.length - 1];
  var r1 = Math.sqrt(townHash(k + ':r1')), r2 = townHash(k + ':r2'), wa = 1 - r1, wb = r1 * (1 - r2), wc = r1 * r2;
  return { x: T[0].x * wa + T[1].x * wb + T[2].x * wc, z: T[0].z * wa + T[1].z * wb + T[2].z * wc, area: tot };
}

// ── ① 圈裡的 ──
/** 城 T 的家畜 ⇒ T.pen ＝ { inst, sk, list, pens: [每一組的讀數], bb }（實例或工地換了才重算）。 */
function townPenPrep(T, F) {
  var K = TOWNS.kit, list = [], pens = [];
  (T.inst || []).forEach(function (q) {
    var M = K && K.M[q.k], m = M && M.m; if (!m || q.wall || !(q.y === q.y) || !m.pts) return;
    if (townRiseHides(T, q)) return;                                     // 還在蓋（或演建造）⇒ 圈還沒圍好
    var G = {};
    Object.keys(m.pts).sort().forEach(function (nm) { var r = TOWN_PEN_RE.exec(nm); if (r && F.kinds[r[1]]) (G[r[1] + ':' + r[2]] || (G[r[1] + ':' + r[2]] = [])).push([+r[3], m.pts[nm]]); });
    var s = Math.sin(q.th), c = Math.cos(q.th), mpv = m.mpv, hw = m.size[0] * mpv / 2, hd = m.size[1] * mpv / 2;
    function W(v) { var a = (v[0] * mpv - hw) * q.sx, b = v[1] * mpv - hd; return { x: q.x + a * s - b * c, z: q.z - a * c - b * s, y: q.y + (v[2] - 0.5) * mpv }; }   // 同 townWorkPrep 的 W
    Object.keys(G).sort().forEach(function (gk) {
      var sp = gk.split(':')[0], V = G[gk].sort(function (x, y) { return x[0] - y[0]; }).map(function (e) { return e[1]; });
      if (V.length === 2) V = [V[0], [V[1][0], V[0][1], V[0][2]], V[1], [V[0][0], V[1][1], V[0][2]]];   // 兩點 ⇒ 長方形的四角
      if (V.length < 3) return;
      var Q = V.map(W), y = Q.reduce(function (s0, p) { return s0 + p.y; }, 0) / Q.length, key = T.id + ':pen:' + q.lot + ':' + gk;
      var area = townFaunaInPoly(Q, key).area, n = Math.max(1, Math.min(TOWN_PEN_MAX, Math.round(area / F.kinds[sp].dens)));
      pens.push({ lot: q.lot, use: m.use, sp: sp, g: gk.split(':')[1], area: +area.toFixed(2), n: n, x: +(Q.reduce(function (s0, p) { return s0 + p.x; }, 0) / Q.length).toFixed(2), y: +y.toFixed(2), z: +(Q.reduce(function (s0, p) { return s0 + p.z; }, 0) / Q.length).toFixed(2), yaw: +Math.atan2(s, c).toFixed(4) });
      for (var j = 0; j < n; j++) {
        var k = key + ':' + j, a = townFaunaMake(F, sp, k, { y: y, pen: true }), P = [];
        for (var h = 0; h < TOWN_FAUNA_HOPS; h++) P.push(townFaunaInPoly(Q, k + ':' + h));
        townFaunaLegs(a, P, k); list.push(a);
      }
    });
  });
  var bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  list.forEach(function (a) { a.P.forEach(function (p) { bb[0] = Math.min(bb[0], p.x - 2); bb[1] = Math.min(bb[1], a.y); bb[2] = Math.min(bb[2], p.z - 2); bb[3] = Math.max(bb[3], p.x + 2); bb[4] = Math.max(bb[4], a.y + 3); bb[5] = Math.max(bb[5], p.z + 2); }); });
  T.pen = { inst: T.inst, sk: townRiseWorkSig(T), list: list, pens: pens, bb: bb };
  return T.pen;
}

// ── ② 城外的 ──
// 範圍：不照城的外框（金斯敦的外框好幾公里，外框外離港口太遠、城鎮模式看不到）⇒ 鏡頭附近的世界格子（TOWN_WILD_CELL 公尺一格，照雜湊 TOWN_WILD_P 的格有一群），
//   「城外」＝ 不在任何一座城的地塊、路旁邊（townBuilt：離地塊 TOWN_WILD_GAP[0]、離路 [1] 公尺以內的 20 m 格都算城裡）⇒ 城郊的空地、出城的路邊看得到，蓋了房子的地方沒有。
//   哪幾種 ＝ TOWN_WILD_NEAR 公尺內最近那一座有物種的城（townWildKinds）。格子照海域的絕對座標切 ⇒ 鏡頭走開又回來，同一格還是同一群。
/** 這座城要放哪幾種野生動物：?wild=a,b（測試）⇒ 那幾種；不然 ⇒ 規劃的 live.fauna（地球儀的物種表）；圖裡沒有的不算。 */
function townWildKinds(T, F) {
  var w = Q.get('wild'), L = w ? w.split(',') : (T.p && T.p.live && T.p.live.fauna) || [];
  return L.filter(function (sp, i) { return F.kinds[sp] && L.indexOf(sp) === i; });
}
/** 城 T 蓋了東西的地方 ⇒ T.built ＝ { p, S: 20 m 格的集合 }（地塊中心外擴半條對角線＋GAP[0]、路每 10 m 一點外擴半寬＋GAP[1]；規劃換了才重算）。 */
function townBuilt(T) {
  if (T.built && T.built.p === T.p) return T.built;
  var G = 20, S = new Set(), ax = BED.ax, az = BED.az;
  function disc(x, z, r) { for (var gx = Math.floor((x - r) / G); gx <= Math.floor((x + r) / G); gx++) for (var gz = Math.floor((z - r) / G); gz <= Math.floor((z + r) / G); gz++) S.add(gx + ',' + gz); }
  (T.p.lots || []).forEach(function (l) { if (!l.at) return; var e = T.E(l.at); disc(e[0] - ax, e[1] - az, Math.hypot(l.w || 10, l.d || 10) / 2 + TOWN_WILD_GAP[0]); });
  T.roads.forEach(function (r) {
    var P = r.P || [];
    for (var i = 1; i < P.length; i++) { var a = P[i - 1], b = P[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10)); for (var j = 0; j <= n; j++) disc(a[0] + (b[0] - a[0]) * j / n - ax, a[1] + (b[1] - a[1]) * j / n - az, (r.w || 3) / 2 + TOWN_WILD_GAP[1]); }
  });
  T.built = { p: T.p, G: G, S: S };
  return T.built;
}
/** 地面在這一點多高：那一塊的地形資料還沒到（bedShowC 沒有）⇒ NaN。
 *  ⛔ 不直接用 townGround：資料沒到的塊它退回模擬的地形（bedCell），跟之後畫出來的地面可能對不上。
 *  ⚠ 資料到了、地形網格還沒建（63_bed_gl.js BEDGL）的那一陣子，畫面上那裡是海 ⇒ 動物先站在「海」上，網格建好就接上（2026-10-25 隱藏的預覽窗格：meshes 0 時連內陸的養殖場四周也是海，過一陣子建好，野化的豬站在草地上）。 */
function townFaunaGround(x, z) {
  var S = BED.A.chunk; if (!bedShowC(Math.floor((x + BED.ax) / S) + '_' + Math.floor((z + BED.az) / S))) return NaN;
  return townGround(x, z);
}
/** 這一點能不能站：地面畫出來了、在水面上、不在任何一座城蓋了東西的地方。NaN ＝ 地面還沒到；−1 ＝ 不行。 */
function townWildGround(x, z) {
  var h = townFaunaGround(x, z); if (!(h === h)) return NaN;
  if (h <= 0.4) return -1;
  for (var i = 0; i < TOWNS.list.length; i++) {
    var T = TOWNS.list[i], b = T.box; if (x < b[0] - BED.ax - 200 || x > b[2] - BED.ax + 200 || z < b[1] - BED.az - 200 || z > b[3] - BED.az + 200) continue;
    var B = townBuilt(T); if (B.S.has(Math.floor(x / B.G) + ',' + Math.floor(z / B.G))) return -1;
  }
  return h;
}
/** 世界格子 (gx, gz) 那一群（沒有 ⇒ false；附近還沒有城、或城沒有物種 ⇒ null，不記，下次再問）。 */
function townWildCell(gx, gz, F) {
  var M = TOWNS.wildMap; if (!M || M.ax !== BED.ax || M.az !== BED.az || M.F !== F || M.m.size > 4000) M = TOWNS.wildMap = { ax: BED.ax, az: BED.az, F: F, m: new Map() };
  var key = gx + ',' + gz, H = M.m.get(key); if (H !== undefined) return H;
  var k = 'wild:' + key;
  if (townHash(k) >= TOWN_WILD_P) { M.m.set(key, false); return false; }
  var C = TOWN_WILD_CELL, ux = (gx + 0.15 + 0.7 * townHash(k + ':x')) * C, uz = (gz + 0.15 + 0.7 * townHash(k + ':z')) * C, best = null, bd = TOWN_WILD_NEAR;   // ux／uz：海域的絕對座標
  TOWNS.list.forEach(function (T) {
    var b = T.box, d = Math.hypot(Math.max(b[0] - ux, 0, ux - b[2]), Math.max(b[1] - uz, 0, uz - b[3]));
    if (d < bd && townWildKinds(T, F).length) { bd = d; best = T; }
  });
  if (!best) return null;
  var S = townWildKinds(best, F), sp = S[Math.floor(townHash(k + ':sp') * S.length) % S.length], K = F.kinds[sp];
  H = { sp: sp, k: k, town: best.id, cx: ux - BED.ax, cz: uz - BED.az, R: K.roam, n: K.herd[0] + Math.floor(townHash(k + ':n') * (K.herd[1] - K.herd[0] + 1)), ok: null, tried: -1e9, list: [] };
  M.m.set(key, H);
  return H;
}
/** 鏡頭 eye 周圍 r 公尺的格子裡的群（照 townWildCell）。 */
function townWildNear(eye, r, F) {
  var C = TOWN_WILD_CELL, out = [], x0 = Math.floor((eye[0] + BED.ax - r) / C), x1 = Math.floor((eye[0] + BED.ax + r) / C), z0 = Math.floor((eye[2] + BED.az - r) / C), z1 = Math.floor((eye[2] + BED.az + r) / C);
  for (var gx = x0; gx <= x1; gx++) for (var gz = z0; gz <= z1; gz++) { var H = townWildCell(gx, gz, F); if (H) out.push(H); }
  return out;
}
/** 一群第一次進到鏡頭附近 ⇒ 照地面擺（地面還沒到 ⇒ 半秒後再試）：中心站不住 ⇒ 這一群不放；每一隻在 R 內挑 HOPS 個站得住、跟中心差不到 max(3, R／2) 公尺高、跟上一點的中點也站得住的點。 */
function townWildPlace(H, F) {
  var now = performance.now(); if (now - H.tried < 500) return; H.tried = now;
  var h0 = townWildGround(H.cx, H.cz); if (!(h0 === h0)) return;
  if (h0 < 0) { H.ok = false; return; }
  var dz = Math.max(3, H.R / 2), list = [];
  for (var j = 0; j < H.n; j++) {
    var k = H.k + ':' + j, P = [{ x: H.cx, z: H.cz }], wait = false;
    for (var t = 0; t < 4 * TOWN_FAUNA_HOPS && P.length < TOWN_FAUNA_HOPS; t++) {
      var r = H.R * Math.sqrt(townHash(k + ':r' + t)), th = 6.2832 * townHash(k + ':a' + t), x = H.cx + r * Math.cos(th), z = H.cz + r * Math.sin(th);
      var g = townWildGround(x, z), L = P[P.length - 1], gm = townWildGround((x + L.x) / 2, (z + L.z) / 2);
      if (!(g === g) || !(gm === gm)) { wait = true; break; }
      if (g > 0 && gm > 0 && Math.abs(g - h0) < dz) P.push({ x: x, z: z });
    }
    if (wait) return;                                                    // 這一群有一點的地面還沒到 ⇒ 整群晚一點再擺（不擺半群）
    if (P.length > 1) P.shift();                                         // 中心只是參考點；有別的點就不從中心出發
    var a = townFaunaMake(F, H.sp, k, { pen: false }); townFaunaLegs(a, P, k); list.push(a);
  }
  H.list = list; H.ok = true;
}

// ── 畫 ──
/** 畫出鏡頭附近的動物（townDraw 鎮民之後；借 P.folk 那一支著色器與實例緩衝）⇒ 三角形數。 */
function townFaunaDraw(P, K, eye, PL, fogD, clock) {
  var S = TOWNS.stat; S.fauna = S.faunaPen = S.faunaWild = 0; S.faunaMs = 0;
  var F = K && K.fauna; if (!TOWN_FAUNA || !F || !F.tex || !P.folk) return 0;
  var t0 = performance.now(), fwd = sub(CAM.look, eye), rl = Math.hypot(fwd[2], fwd[0]) || 1, rx = -fwd[2] / rl, rz = fwd[0] / rl, maxD = TOWN_FOLK_OUT[1], n = 0;
  var B = TOWNS.faunaArr || (TOWNS.faunaArr = new Float32Array(256 * 16)), cu = F.cell / (2 * F.w), cv = 1 / F.rows;   // 一格在貼圖上多寬（crewArt 把寬加倍：左半底圖、右半遮罩）
  function put(a, y) {
    for (var i = 0; i < 6; i++) { var pl = PL[i]; if (pl[0] * a.x + pl[1] * (y + a.size * 0.5) + pl[2] * a.z + pl[3] < -a.size) return; }
    var mv = a.stop ? 0 : a.mx * rx + a.mz * rz;
    if (mv > 0.02) a.face = 1; else if (mv < -0.02) a.face = -1;
    var fr = 0, sx = 1, sy = 1, lean = 0, bob = 0;
    if (!a.stop) {                                                       // 走路：兩格輪流（大的步子慢）＋ 一點彈跳
      var w = clock * a.spd / (a.size * 0.32) + a.ph; fr = Math.floor(w) & 1; bob = 0.02 * a.size * Math.abs(Math.sin(w * Math.PI)); lean = a.face * 0.02;
    } else if (a.sp === 'chicken') {                                     // 停著的雞：一下一下往前啄
      var pk = Math.sin(clock * 2.3 + a.ph); if (pk > 0.6) { lean = a.face * 0.22 * (pk - 0.6) / 0.4; sy = 1 - 0.1 * (pk - 0.6) / 0.4; }
    } else { var br = Math.sin(clock * 1.6 + a.ph); sy = 1 + 0.01 * br; lean = a.face * 0.01 * br; }   // 其他：呼吸
    if (B.length < (n + 1) * 16) { var B2 = new Float32Array(B.length * 2); B2.set(B); B = TOWNS.faunaArr = B2; }
    var o = n * 16, u0 = fr * cu, u1 = u0 + cu; n++;
    B[o] = a.x; B[o + 1] = y; B[o + 2] = a.z; B[o + 3] = a.size;
    B[o + 4] = 2 * sx; B[o + 5] = sy; B[o + 6] = lean; B[o + 7] = bob;   // 寬比 2：著色器的寬 ＝ 高 × ½ × 寬比，一格是正方形
    B[o + 8] = a.face > 0 ? u0 : u1; B[o + 9] = a.row * cv; B[o + 10] = a.face > 0 ? u1 : u0; B[o + 11] = (a.row + 1) * cv;
    B[o + 12] = 0; B[o + 13] = 0; B[o + 14] = a.sh; B[o + 15] = a.face;
  }
  TOWNS.list.forEach(function (T) {
    var b = T.box, bx = Math.max(b[0] - BED.ax - eye[0], 0, eye[0] - (b[2] - BED.ax)), bz = Math.max(b[1] - BED.az - eye[2], 0, eye[2] - (b[3] - BED.az));
    if (T.inst && Math.hypot(bx, bz) <= maxD) {                         // 圈裡的：城在範圍裡才看
      var PN = T.pen && T.pen.inst === T.inst && T.pen.sk === townRiseWorkSig(T) ? T.pen : townPenPrep(T, F);
      if (PN.list.length && townBoxDist(PN.bb, eye) <= maxD && bedSeen(PL, PN.bb)) PN.list.forEach(function (a) {
        townFaunaAt(a, clock); if (Math.hypot(a.x - eye[0], a.z - eye[2]) > maxD) return;
        var m0 = n; put(a, a.y); if (n > m0) S.faunaPen++;
      });
    }
  });
  townWildNear(eye, maxD + 40, F).forEach(function (H) {
    if (H.ok === false || Math.hypot(H.cx - eye[0], H.cz - eye[2]) > maxD + H.R) return;
    if (H.ok === null) { townWildPlace(H, F); if (!H.ok) return; }
    H.list.forEach(function (a) {
      townFaunaAt(a, clock); if (Math.hypot(a.x - eye[0], a.z - eye[2]) > maxD) return;
      var y = townFaunaGround(a.x, a.z); if (!(y === y) || y <= 0.3) return;   // 地形塊收掉了（船開遠）⇒ 不畫
      var m0 = n; put(a, y); if (n > m0) S.faunaWild++;
    });
  });
  S.fauna = n;
  if (!n) { S.faunaMs = +(performance.now() - t0).toFixed(3); return 0; }
  var PF = P.folk; gl.useProgram(PF.prog); setCommon(PF);
  gl.uniform1f(PF.u.uFogD, fogD); gl.uniform3fv(PF.u.uEye, eye); gl.uniform3f(PF.u.uRight, rx, 0, rz);
  gl.uniform2f(PF.u.uIn, -2, -1); gl.uniform2f(PF.u.uOut, TOWN_FOLK_OUT[0], TOWN_FOLK_OUT[1]); gl.uniform1i(PF.u.uTex, 11);
  gl.bindVertexArray(P.folkVao); gl.bindBuffer(gl.ARRAY_BUFFER, P.folkBuf);
  gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D, F.tex); gl.activeTexture(gl.TEXTURE0);
  gl.bufferData(gl.ARRAY_BUFFER, B.subarray(0, n * 16), gl.DYNAMIC_DRAW);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
  S.faunaMs = +(performance.now() - t0).toFixed(3);
  return 2 * n;
}

// ── 讀數與測試 ──
/** 城 T 的那一份（townStat 每座城的 fauna）：圈裡的每一組、這座城給野生動物的物種。 */
function townFaunaStat(T) {
  var F = TOWNS.kit && TOWNS.kit.fauna;
  return { pens: T.pen ? T.pen.pens : null, penAnimals: T.pen ? T.pen.list.length : 0, wildKinds: F ? townWildKinds(T, F) : null };
}
/** 全部加起來（townStat 頂層的 fauna）；wild ＝ 記住的野外格子裡的群（ok null ＝ 地面還沒到、false ＝ 站不住）。 */
function townFaunaSum() {
  var F = TOWNS.kit && TOWNS.kit.fauna; if (!F) return null;
  var H = []; if (TOWNS.wildMap) TOWNS.wildMap.m.forEach(function (h) { if (h) H.push(h); });
  return { ok: !!F.tex, ids: F.ids, rows: F.rows, drawn: TOWNS.stat.fauna || 0, pen: TOWNS.stat.faunaPen || 0, wild: TOWNS.stat.faunaWild || 0, ms: TOWNS.stat.faunaMs || 0,
    herds: H.map(function (h) { return { sp: h.sp, town: h.town, n: h.n, ok: h.ok, placed: h.list.length, x: +h.cx.toFixed(1), z: +h.cz.toFixed(1) }; }) };
}
/** 測試用（__game.town('fauna') ／ 'fauna:<物種>'）：城 T 裡那一種的圈 ⇒ 從臨路那一邊斜上方看進去；沒有圈 ⇒ 鏡頭周圍 1.5 km 內最近一群站得住的（地面到了的才算）⇒ 從南邊看。 */
function townFaunaCam(T, F, sp) {
  var PN = T.inst ? (T.pen && T.pen.inst === T.inst ? T.pen : townPenPrep(T, F)) : null, best = null;
  (PN ? PN.pens : []).forEach(function (p) { if ((!sp || p.sp === sp) && (!best || p.n > best.n)) best = p; });
  if (best) return { pen: best, cam: { tgt: [best.x, +(best.y + 0.6).toFixed(2), best.z], yaw: best.yaw, pitch: 0.38, dist: best.sp === 'chicken' ? 6 : 11, mode: 0, track: false, tr: null } };
  var e = CAM.eye, H = null, hd = 1e9;
  townWildNear(e, 1500, F).forEach(function (h) {
    if ((sp && h.sp !== sp) || h.ok === false) return;
    if (h.ok === null) { h.tried = -1e9; townWildPlace(h, F); }
    var d = Math.hypot(h.cx - e[0], h.cz - e[2]); if (h.ok && d < hd) { hd = d; H = h; }
  });
  if (!H) return null;
  var y = townFaunaGround(H.cx, H.cz);
  return { herd: { sp: H.sp, town: H.town, n: H.n, x: +H.cx.toFixed(1), z: +H.cz.toFixed(1) }, cam: { tgt: [+H.cx.toFixed(2), +(y + 0.8).toFixed(2), +H.cz.toFixed(2)], yaw: -Math.PI / 2, pitch: 0.3, dist: H.R + 10, mode: 0, track: false, tr: null } };
}

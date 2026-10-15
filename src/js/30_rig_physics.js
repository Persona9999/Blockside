// ───────────────────────── 帆與繩的物理（可關） ─────────────────────────
// 開（PHYS）：帆是一塊布（質點＋距離約束，Verlet），被「相對風」（真風 − 船速）吹鼓 —— 轉向、頂風時帆會往另一邊鼓；
//   斷掉的繩與掉下來的帆不消失：掛在還綁著的那一端擺，整個鬆脫就往下掉，落到甲板上會停住。
//   帆被打穿：洞裡那一塊布切成布片，照同一套布的物理飄下去（34_shreds.js）。
// 關：跟以前一樣 —— 帆停在雕刻作品模擬的那一刻、斷掉的就不見。
// ⛔ 物理只管畫出來的樣子：航速、命中、帆算不算數照原本的規則（s.dead／s.furled），而且這一段不碰 rnd()
//   ⇒ 開或關，同一個種子走出同一局。
// 座標：船的格座標（跟繩與帆的資料同一套）；重力與相對風用 sh.inv 換進來（1 格 ＝ S 公尺，速度單位 格/秒）。
var WIND_SAIL = 10;           // 推帆的風速（m/s）；WIND 的大小是煙飄的速度，只共用方向。Tim 2026-10-12：7 太不明顯 ⇒ 10，再乘細節設定的風壓（WIND_K）
var GUST = [0.24, 0.12, 0.06], FLUTTER = 0.35, SLACK = 1.02;   // 陣風三個頻率的幅度、布上走過去的波紋（風壓 ±35%）、布比作品的形狀鬆 2%（鼓得深一點）
var KW = 0.05;                // 風壓：加速度（格/秒²）＝ KW ×（相對風在法線上的分量）²
var KD = 0.3, DAMP = 0.985;   // 繩的空氣阻力（1/秒）、每一步的速度保留
var SEG = 6;                  // 布與繩的迭代次數、帆幾步走一次、垂繩上限照物理分級（09_phx.js rigLv：高 ＝ 4 次、隔一步（30 Hz）、500 條）
var CACC = null, CCNT = null, PHYS_MS = 0, PROF = { cloth: 0, rope: 0, shred: 0, buf: 0, cc: 0, ccN: 0, ccHit: 0, ccQ: 0, ccMax: 0, ccGeo: 0 };   // cc：帆的碰撞花的 ms、ccN 跑了幾次、ccHit 每次第一輪找到的接觸（＝ 那一刻還穿著的；clothContacts）、ccQ 排了幾面（解不完的下一步再排）
// 帆桁追風（物理開著才轉）：方帆桁讓帆的法線落在「相對風吹去的方向」與船頭的角平分線上，最多轉離正橫 40°（再多就頂到支索與 shroud）；
//   gaff／boom（後桅縱帆）往下風擺，帆面跟船身的夾角 ＝ (180° − 相對風角)／2，8°–80°；頂風 ±25° 內不換邊（遲滯）。每秒最多轉 8°。
//   帆的綁點、帆腳與綁在帆桁上的繩跟著轉（繩照弧長在兩端之間內插：一端綁甲板的 brace 就只有帆桁那一頭轉）。
//   ⚠ 帆桁轉了，砲彈打到帆桁的位置跟著變 ⇒ 物理開或關不再走出逐格同一局（只差在打到帆桁的那幾下）。
var BRACE_MAX = 0.70, BOOM_MIN = 0.14, BOOM_MAX = 1.40, BRACE_RATE = 0.14, BRACE_HYST = 2.7;
function braceYards(sh, wl, dt) {
  var psi = Math.atan2(wl[1], wl[0]);                                // 相對風吹去的方向（格座標、從船頭往 +y 量）：0 ＝ 正後方來的風
  if (Math.abs(psi) < BRACE_HYST || !sh.braceSide) sh.braceSide = psi >= 0 ? 1 : -1;
  sh.yards.forEach(function (m) {
    if (!m.alive) return;
    var tgt = m.yk === 'gaff' || m.yk === 'boom' ? -sh.braceSide * clamp((Math.PI - Math.abs(psi)) / 2, BOOM_MIN, BOOM_MAX)
      : Math.abs(psi) < BRACE_HYST ? clamp(psi / 2, -BRACE_MAX, BRACE_MAX) : sh.braceSide * BRACE_MAX;
    m.rot += clamp(tgt - m.r0 - m.rot, -BRACE_RATE * dt, BRACE_RATE * dt);
  });
  sh.psi = psi;
}
// 掛著的模型擺（Tim 2026-10-14：吊艇架上的小艇跟著繩子搖晃；物理開著才擺，跟帆桁追風一樣只管畫出來的樣子）：
//   單擺，轉軸 ＝ 兩條吊索上端的連線（10_ship.js hangFalls）。ψ ＝ 偏離鉛直的角度：ψ'' ＝ −(g sinψ ＋ a cosψ)／L − c ψ'，
//   a ＝ 吊點（世界）在擺動方向上的加速度（船橫搖、轉向、被打中一晃 ⇒ 擺起來）。畫出來的角度 ＝ 重力在船身座標裡的方向 ＋ ψ（船傾斜時照樣朝下）。
//   吊索跟著轉（繞同一根軸，上端在軸上不動）。最多 ±0.6 rad（再多就撞船殼）。
var SWING_DAMP = 0.35, SWING_MAX = 0.6;
function rotAxis(P, q, A, ang) {
  var c = Math.cos(ang), s = Math.sin(ang), v = sub(P, q), d = dot(A, v), x = cross(A, v);
  return [q[0] + v[0] * c + x[0] * s + A[0] * d * (1 - c), q[1] + v[1] * c + x[1] * s + A[1] * d * (1 - c), q[2] + v[2] * c + x[2] * s + A[2] * d * (1 - c)];
}
function swingHangs(sh, gv) {
  (sh.hangs || []).forEach(function (m) {
    if (!m.alive) return;
    var A = m.sax, e = norm(cross(A, [0, 0, -1])), gA = dot(gv, A), gp = sub(gv, mul(A, gA)), eq = Math.atan2(dot(gp, e), -gp[2]);
    var w = M4.pt(sh.M, m.spv[0], m.spv[1], m.spv[2]), a = 0;
    if (m.pw && m.pw2) { var ew = norm(M4.dir(sh.M, e[0], e[1], e[2])); a = clamp(dot([(w[0] - 2 * m.pw[0] + m.pw2[0]) / (DT * DT), (w[1] - 2 * m.pw[1] + m.pw2[1]) / (DT * DT), (w[2] - 2 * m.pw[2] + m.pw2[2]) / (DT * DT)], ew), -30, 30); }
    m.pw2 = m.pw; m.pw = w;
    var L = m.sL * S;
    m.psiV += (-(G * Math.sin(m.psi) + a * Math.cos(m.psi)) / L - SWING_DAMP * m.psiV) * DT; m.psi += m.psiV * DT;
    m.sw = clamp(eq + m.psi, -SWING_MAX, SWING_MAX);
    if (Math.abs(m.sw - m.swA) > 0.004) {                                // 吊索跟著轉（上端在軸上）
      m.swA = m.sw;
      m.falls.forEach(function (j) {
        var r = sh.ropes[j]; if (r.dead) return;
        var p0 = r.pts0, out = new Float32Array(p0.length);
        for (var k = 0; k < p0.length; k += 3) { var q = rotAxis([p0[k], p0[k + 1], p0[k + 2]], m.spv, A, m.sw); out[k] = q[0]; out[k + 1] = q[1]; out[k + 2] = q[2]; }
        r.pts = out; r.bb = ropeBox(out);
      });
      sh.rigDirty = true;
    }
  });
}
/** 物理關掉 ⇒ 掛著的回到作品的位置。 */
function unswingHangs(sh) { (sh.hangs || []).forEach(function (m) { m.sw = m.swA = m.psi = m.psiV = 0; m.pw = m.pw2 = null; m.falls.forEach(function (j) { var r = sh.ropes[j]; if (!r.dead) { r.pts = r.pts0; r.bb = ropeBox(r.pts); } }); }); }
/** 綁在帆桁上的繩重算形狀（帆桁轉了 0.25° 以上才算；物理關掉時 rot 歸零 ⇒ 回到作品的形狀）。 */
function yardRopes(sh, force) {
  var moved = force || sh.yards.some(function (m) { return Math.abs(m.rot - (m.rotA || 0)) > 0.004; });
  if (!moved) return;
  sh.yards.forEach(function (m) { m.rotA = m.rot; });
  sh.yRopes.forEach(function (r) {
    var A = r.ya >= 0 ? sh.models[r.ya] : null, B = r.yb >= 0 ? sh.models[r.yb] : null;
    if ((!A || !A.rot) && (!B || !B.rot)) { r.pts = r.pts0; r.bb = ropeBox(r.pts); return; }
    var p0 = r.pts0, n = p0.length / 3, acc = new Float32Array(n), tot = 0, j;
    for (j = 1; j < n; j++) { tot += Math.hypot(p0[j * 3] - p0[j * 3 - 3], p0[j * 3 + 1] - p0[j * 3 - 2], p0[j * 3 + 2] - p0[j * 3 - 1]); acc[j] = tot; }
    var out = new Float32Array(p0.length);
    for (j = 0; j < n; j++) {
      var P0 = [p0[j * 3], p0[j * 3 + 1], p0[j * 3 + 2]], t = tot > 0 ? acc[j] / tot : 0;
      var pa = A && A.rot ? rotZ(P0, A.piv, A.rot) : P0, pb = B && B.rot ? rotZ(P0, B.piv, B.rot) : P0;
      if (A && B && A === B) pb = pa;
      out[j * 3] = pa[0] * (1 - t) + pb[0] * t; out[j * 3 + 1] = pa[1] * (1 - t) + pb[1] * t; out[j * 3 + 2] = P0[2];
    }
    r.pts = out; r.bb = ropeBox(out);
  });
  sh.rigDirty = true;
}
/** 綁著的布點跟著帆桁轉（每一步都放回「作品的位置繞轉軸轉 rot」；鬆開的點交給物理）。 */
function yardPins(sh, c) {
  var T = c.T.sim, yk = T.yk; if (!yk) return;
  for (var i = 0; i < T.n; i++) {
    if (!c.pin[i] || yk[i] < 0) continue;
    var m = sh.models[yk[i]]; if (!m.rot) { if (!c.yr) continue; }
    var o = i * 3, w = rotZ([T.p0[o], T.p0[o + 1], T.p0[o + 2]], m.piv, m.rot);
    c.p[o] = c.q[o] = w[0]; c.p[o + 1] = c.q[o + 1] = w[1];
  }
  c.yr = sh.yards.some(function (m) { return m.rot; });
}
/** 一面帆的布（兩艘船共用；載入時算一次）：
 *  只留一層 —— 雕刻作品的帆是正反兩層、相差 0.11 格，兩層都畫遠看會互相打架成棋盤格；
 *  邊（距離約束）＋ 同一條格線上隔一點的兩點（跨點約束，布不會揉成一團）；
 *  外緣在轉角（> 29°）處切成幾段：筆直的那幾段是綁在帆桁／支索／斜桁上的邊（作品裡整條固定在線段上；鼓起來的自由邊不會直），
 *  綁邊上的點各自找靠的格（0.6 m 內）或繩（0.4 m 內）—— 帆桁被打掉一截，只有那一截的布鬆開；
 *  不在綁邊上的角 ＝ 帆腳：綁在帆自己的繩（sheet／tack，端點 1 m 內）、旁邊的格或繩上。
 *  hk：0 不綁、1 格、2 繩、3 找不到靠的（帆還在就綁著）、4 模型（帆桁：綁邊靠在帆桁的網格上）。
 *  sim.yk：每個綁著的粗格點跟著哪根帆桁轉（帆桁追風，見 braceYards；-1 ＝ 不轉）。 */
function clothTemplate(H, s) {                         // H：船型（帆的布模板、繩的外框在 H.cloth／H.rbox）
  var v = s.verts, tr = s.tris, nv = v.length / 3, h = nv >> 1, T = [], one = nv % 2 === 0, i, j, k;
  for (j = 0; j < tr.length; j += 3) {
    var lo = tr[j] < h;
    if ((tr[j + 1] < h) !== lo || (tr[j + 2] < h) !== lo) one = false;
    if (lo) T.push(tr[j], tr[j + 1], tr[j + 2]);
  }
  if (!one || T.length * 2 !== tr.length) { T = Array.prototype.slice.call(tr); h = nv; }
  var n = h, p0 = new Float32Array(v.slice(0, n * 3));
  function P(q) { return [p0[q * 3], p0[q * 3 + 1], p0[q * 3 + 2]]; }
  var E = new Map(), ea = [], eb = [], use = [];
  for (j = 0; j < T.length; j += 3) for (k = 0; k < 3; k++) {
    var a = T[j + k], b = T[j + (k + 1) % 3], kk = a < b ? a * 65536 + b : b * 65536 + a, e = E.get(kk);
    if (e === undefined) { e = ea.length; E.set(kk, e); ea.push(a); eb.push(b); use.push(0); }
    use[e]++;
  }
  // 外緣：只被一個三角形用到的邊，接成一圈
  var bn = []; for (i = 0; i < n; i++) bn.push([]);
  ea.forEach(function (a, e) { if (use[e] === 1) { bn[a].push(eb[e]); bn[eb[e]].push(a); } });
  var loop = [], st = -1; for (i = 0; i < n; i++) if (bn[i].length === 2) { st = i; break; }
  if (st >= 0) { var pv = -1, cu = st; do { loop.push(cu); var nx = bn[cu][0] === pv ? bn[cu][1] : bn[cu][0]; pv = cu; cu = nx; } while (cu !== st && cu !== undefined && loop.length <= n); }
  var L = loop.length, corner = [];
  for (k = 0; k < L; k++) { var A = P(loop[(k + L - 1) % L]), M = P(loop[k]), C = P(loop[(k + 1) % L]); if (dot(norm(sub(M, A)), norm(sub(C, M))) < Math.cos(0.5)) corner.push(k); }
  var hk = new Int8Array(n), hv = new Int32Array(n).fill(-1), sides = [];
  for (k = 0; k < corner.length; k++) {
    var side = [], k1 = corner[(k + 1) % corner.length];
    for (var t = corner[k]; ; t = (t + 1) % L) { side.push(loop[t]); if (t === k1 && side.length > 1) break; if (side.length > L) break; }
    var a0 = P(side[0]), a1 = P(side[side.length - 1]), ch = len(sub(a1, a0)), md = 0;
    side.forEach(function (q) { var w = P(q); md = Math.max(md, Math.sqrt(segDist2(w, a0[0], a0[1], a0[2], a1[0], a1[1], a1[2]))); });
    var bound = ch > 25 && md < 0.75;
    sides.push({ n: side.length, len: +ch.toFixed(1), dev: +md.toFixed(2), bound: bound });
    if (bound) side.forEach(function (q) { hk[q] = 3; });
  }
  function ropeNear(w, r2) {
    var best = -1, bd = r2, r = Math.sqrt(r2);
    H.rig.ropes.forEach(function (o, j2) {
      var b2 = H.rbox[j2]; if (w[0] < b2[0] - r || w[0] > b2[3] + r || w[1] < b2[1] - r || w[1] > b2[4] + r || w[2] < b2[2] - r || w[2] > b2[5] + r) return;
      for (var q = 0; q + 5 < o.pts.length; q += 3) { var d = segDist2(w, o.pts[q], o.pts[q + 1], o.pts[q + 2], o.pts[q + 3], o.pts[q + 4], o.pts[q + 5]); if (d < bd) { bd = d; best = j2; } }
    });
    return best;
  }
  for (i = 0; i < n; i++) {
    if (hk[i] !== 3) continue;
    var yw = yardNear(H, P(i), 3); if (yw >= 0) { hk[i] = 4; hv[i] = yw; continue; }   // 綁在帆桁上（帆桁改成模型之後，那裡已經沒有格）
    var w = P(i), an = anchorNear(H, w[0], w[1], w[2], 6);
    if (an >= 0) { hk[i] = 1; hv[i] = an; } else { var rp = ropeNear(w, 16); if (rp >= 0) { hk[i] = 2; hv[i] = rp; } }
  }
  // 掛在斜桁頂上的旗（三叉戟號的 ensign；Tim 2026-10-15：船尾旗飄在空中）：綁邊上面幾點靠在 gaff 上、下面幾點找不到靠的（3）⇒
  //   gaff 追風轉了、旗留在作品的位置。旗有任何一點綁在帆桁上 ⇒ 整條綁邊都歸那根帆桁（跟著轉、帆桁沒了一起鬆開）；跟轉的 yk 在下面照 hv 給。
  var flagYard = -1; if (isFlag(s)) for (i = 0; i < n; i++) if (hk[i] === 4) { flagYard = hv[i]; break; }
  if (flagYard >= 0) for (i = 0; i < n; i++) if (hk[i] === 3) { hk[i] = 4; hv[i] = flagYard; }
  if (s.pins) { hk.fill(0); hv.fill(-1); s.pins.forEach(function (q) { hk[q] = s.pinK; hv[q] = s.pinV; }); }   // 明寫的綁邊（陣營旗：靠旗桿那一邊釘在桅頂那一格；⛔ 不照外緣直不直猜）
  var own = []; H.rig.ropes.forEach(function (r, j2) { if (sailRope(r, s.name)) own.push(j2); });   // 帆自己的 sheet、tack（10_ship.js sailRope：照 meta，沒有才照名字）
  var clews = 0, clewYard = {};                          // 帆腳 → 跟哪根帆桁轉（-1 ＝ 不轉）
  if (!s.pins) corner.forEach(function (kc) {
    var q = loop[kc]; if (hk[q]) return;
    var w = P(q), best = -1, bd = 100, end = null;
    own.forEach(function (j2) { var pts = H.rig.ropes[j2].pts; [0, pts.length - 3].forEach(function (o) { var dx = pts[o] - w[0], dy = pts[o + 1] - w[1], dz = pts[o + 2] - w[2], d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = j2; end = [pts[o], pts[o + 1], pts[o + 2]]; } }); });
    clewYard[q] = end ? yardNear(H, end, 3) : -1;        // 帆自己的 sheet 靠帆那一端在哪根帆桁上（topsail 以上：下一根帆桁的兩端）；course 的綁甲板繩栓 ⇒ 不轉（basecamp 2026-10-12）
    if (best < 0) { var an = anchorNear(H, w[0], w[1], w[2], 6); if (an >= 0) { hk[q] = 1; hv[q] = an; clews++; return; } best = ropeNear(w, 16); }
    if (best >= 0) { hk[q] = 2; hv[q] = best; clews++; }
  });
  var pins = 0; for (i = 0; i < n; i++) if (hk[i]) pins++;
  // 物理在粗格上算（規則格 ⇒ 隔一點取一點：25×25 → 13×13，約束少 4 倍）；畫的時候細格照權重從粗格內插回來
  var cg = coarseOf(n, T);
  // Contact geometry must retain the authored fine surface at initialization.
  // Coarsening moved interpolated vertices through thin masts before any wind.
  cg = { idx: Array.from({ length: n }, function (_, i) { return i; }), tris: T,
    mi: new Uint16Array(n * 4), mw: new Float32Array(n * 4), kind: 'contact-fine' };
  for (i = 0; i < n; i++) { cg.mi[i * 4] = i; cg.mw[i * 4] = 1; }
  var sim = meshCons(cg.idx.map(P), cg.tris);
  sim.fine = cg.idx; sim.hk = new Int8Array(cg.idx.length); sim.hv = new Int32Array(cg.idx.length);
  cg.idx.forEach(function (f, ci) { sim.hk[ci] = hk[f]; sim.hv[ci] = hv[f]; });
  // 跟著哪根帆桁轉：綁邊上的點 ＝ 這面帆的帆桁（meta sail）裡離這一點最近的那根（線段：方帆桁 arm-P–arm-S、gaff／boom pivot–end）；
  //   帆腳 ＝ 它的 sheet 綁在哪根帆桁上（上面的 clewYard）。course 的帆腳綁在甲板繩栓上、不轉 ⇒ 帆桁轉了，帆頂跟著轉、帆腳留著，中間的布交給物理。
  //   ⛔ 帆腳跟著自己的帆桁轉 ⇒ course 整面被拖著轉、sheet 與 tack 也被拖離繩栓（2026-10-12 的版本）。
  var ys = []; (H.rig.models || []).forEach(function (m, k) {
    var mt = m.meta || {}, pt = m.points || {}; if (mt.kind !== 'yard' || mt.sail !== s.name || !pt.pivot) return;
    var a = pt['arm-P'] || pt.pivot, b = pt['arm-S'] || pt.end || pt.pivot; ys.push({ k: k, a: a, b: b });
  });
  sim.yk = new Int16Array(cg.idx.length).fill(-1);
  if (ys.length) cg.idx.forEach(function (f, ci) {
    if (!sim.hk[ci]) return;
    if (f in clewYard) { sim.yk[ci] = clewYard[f]; return; }
    var w = P(f), bi = -1, bd = 1e18;
    ys.forEach(function (y) { var d = segDist2(w, y.a[0], y.a[1], y.a[2], y.b[0], y.b[1], y.b[2]); if (d < bd) { bd = d; bi = y.k; } });
    sim.yk[ci] = bi;
  });
  if (flagYard >= 0) cg.idx.forEach(function (f, ci) { if (sim.hk[ci] === 4) sim.yk[ci] = sim.hv[ci]; });   // 旗跟著它掛的帆桁轉（帆桁的 meta sail 是別面帆 ⇒ 上面的 ys 找不到它）
  var foot = -1; Object.keys(clewYard).forEach(function (q) { if (clewYard[q] >= 0) foot = clewYard[q]; });
  var vcol = texColors(s.texture, n);                   // 有貼圖（旗）⇒ 每個頂點照 UV 取貼圖的顏色；整面的顏色（布片、碎布）取平均
  return { name: s.name, col: vcol ? vcol.avg : s.color || [0.95, 0.92, 0.85], vcol: vcol ? vcol.c : null, uv: vcol ? Float32Array.from(s.texture.uv.slice(0, n * 2)) : null, n: n, p0: p0, tris: new Uint16Array(T), sim: sim, mi: cg.mi, mw: cg.mw, grid: cg.kind,
    hk: hk, hv: hv, sides: sides, pins: pins, clews: clews, foot: foot };   // foot：帆腳跟著轉的帆桁（-1 ＝ 不轉；砲彈打帆照高度內插轉角用）
}
/** 旗的貼圖（.vxk 帆的 texture：w×h 的 RGBA、base64，uv 每個頂點一對）⇒ 前 n 個頂點（正面那一份）的顏色：每個頂點取它四周一格布寬的平均（不透明的才算）。
 *  Tim 2026-10-13：夜隼號的旗變成白旗 —— 遊戲畫帆只用一個顏色，夜隼號那面旗的顏色欄是帆布白（憲法號的是紅）。沒有貼圖 ⇒ null（照舊單色）。 */
function texColors(tx, n) {
  if (!tx || !tx.rgba || !tx.uv || tx.uv.length < n * 2 || !tx.w || !tx.h) return null;
  var b = atob(tx.rgba), W = tx.w, H = tx.h, am = tx.alpha_min || 0, f = 0.5 / Math.sqrt(n), c = new Float32Array(n * 3), avg = [0, 0, 0], i;
  if (b.length < W * H * 4) return null;
  for (i = 0; i < n; i++) {
    var u = tx.uv[i * 2], v = tx.uv[i * 2 + 1], x0 = clamp(Math.floor((u - f) * W), 0, W - 1), x1 = clamp(Math.ceil((u + f) * W) - 1, x0, W - 1);
    var y0 = clamp(Math.floor((v - f) * H), 0, H - 1), y1 = clamp(Math.ceil((v + f) * H) - 1, y0, H - 1), r = 0, g = 0, bl = 0, k = 0;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) { var o = (y * W + x) * 4; if (b.charCodeAt(o + 3) < am) continue; r += b.charCodeAt(o); g += b.charCodeAt(o + 1); bl += b.charCodeAt(o + 2); k++; }
    if (!k) { r = g = bl = 242; k = 1; }
    c[i * 3] = r / k / 255; c[i * 3 + 1] = g / k / 255; c[i * 3 + 2] = bl / k / 255; avg[0] += c[i * 3] / n; avg[1] += c[i * 3 + 1] / n; avg[2] += c[i * 3 + 2] / n;
  }
  return { c: c, avg: avg };
}
/** 帆的貼圖集（一個船型一張；TASK-0579）：每面有貼圖的帆一格，四周多一圈重複邊上的像素（NEAREST 取到 u ＝ 1 不會讀到隔壁那格）；
 *  alpha 照 vxk 的 alpha_min 先二值化（≥ ⇒ 255、< ⇒ 0）⇒ 著色器 a < 0.5 就 discard（洞）。
 *  rect[k] ＝ 第 k 面帆在集裡的 [x, y, w, h]（不含那一圈；沒有貼圖 ⇒ null）；列優先、第 0 列 ＝ 圖的最上面（＝ uv 的 v ＝ 0），上傳不翻。
 *  Tim 2026-10-14：透明的地方變成白色、解析度也上不去 —— 之前每個頂點只取一色（texColors），細節只到布料頂點、四周全透明就填白。 */
var SAIL_ATLAS_W = 1024;
function sailAtlas(sails) {
  var rect = [], x = 0, y = 0, rowH = 0, W = 1, Hh = 1, any = false;
  sails.forEach(function (s, k) {
    var tx = s.texture; rect.push(null);
    if (!tx || !tx.rgba || !tx.uv || !tx.w || !tx.h) return;
    var w = tx.w + 2, h = tx.h + 2;
    if (x + w > SAIL_ATLAS_W) { x = 0; y += rowH; rowH = 0; }
    rect[k] = [x + 1, y + 1, tx.w, tx.h]; x += w; rowH = Math.max(rowH, h); W = Math.max(W, x); Hh = Math.max(Hh, y + rowH); any = true;
  });
  if (!any) return null;
  var D = new Uint8Array(W * Hh * 4);
  sails.forEach(function (s, k) {
    var r = rect[k]; if (!r) return;
    var tx = s.texture, b = atob(tx.rgba), am = tx.alpha_min || 0, w = tx.w, h = tx.h;
    if (b.length < w * h * 4) { rect[k] = null; return; }
    for (var yy = -1; yy <= h; yy++) for (var xx = -1; xx <= w; xx++) {
      var sx = clamp(xx, 0, w - 1), sy = clamp(yy, 0, h - 1), o = (sy * w + sx) * 4, d = ((r[1] + yy) * W + r[0] + xx) * 4;
      D[d] = b.charCodeAt(o); D[d + 1] = b.charCodeAt(o + 1); D[d + 2] = b.charCodeAt(o + 2); D[d + 3] = b.charCodeAt(o + 3) >= am ? 255 : 0;
    }
  });
  return { w: W, h: Hh, data: D, rect: rect };
}
/** 一塊布的約束：邊（三角形的邊）＋ 跨點（同一條格線上隔一點的兩點，布不會揉成一團）；靜止長度 ＝ 雕刻作品那一刻的距離。 */
function meshCons(pos, T) {
  var n = pos.length, E = new Map(), ea = [], eb = [], adj = [], te = [], i, j, k;
  for (i = 0; i < n; i++) adj.push([]);
  for (j = 0; j < T.length; j += 3) for (k = 0; k < 3; k++) {
    var a = T[j + k], b = T[j + (k + 1) % 3], kk = a < b ? a * 65536 + b : b * 65536 + a, e = E.get(kk);
    if (e === undefined) { e = ea.length; E.set(kk, e); ea.push(a); eb.push(b); adj[a].push(b); adj[b].push(a); }
    te.push(e);
  }
  var B = new Set(), ba = [], bb = [];
  for (i = 0; i < n; i++) for (j = 0; j < adj[i].length; j++) for (k = j + 1; k < adj[i].length; k++) {
    var x = adj[i][j], y = adj[i][k];
    if (dot(norm(sub(pos[x], pos[i])), norm(sub(pos[y], pos[i]))) > -0.9) continue;
    var kb = x < y ? x * 65536 + y : y * 65536 + x; if (B.has(kb)) continue; B.add(kb); ba.push(x); bb.push(y);
  }
  var p0 = new Float32Array(n * 3), rest = new Float32Array(ea.length), brest = new Float32Array(ba.length);
  pos.forEach(function (w, q) { p0[q * 3] = w[0]; p0[q * 3 + 1] = w[1]; p0[q * 3 + 2] = w[2]; });
  for (i = 0; i < ea.length; i++) rest[i] = len(sub(pos[ea[i]], pos[eb[i]])) * SLACK;
  for (i = 0; i < ba.length; i++) brest[i] = len(sub(pos[ba[i]], pos[bb[i]])) * SLACK;
  return { n: n, p0: p0, tris: T, te: new Uint16Array(te), ea: new Uint16Array(ea), eb: new Uint16Array(eb), rest: rest, ba: new Uint16Array(ba), bb: new Uint16Array(bb), brest: brest };
}
/** 細格 → 粗格：方帆 N×N、三角帆（第 r 列 N−r 點）、N 是單數 ⇒ 取偶數列偶數行；其他形狀 ⇒ 不縮（粗格 ＝ 細格）。
 *  回：idx（粗格點 → 細格點）、tris（粗格三角形）、mi／mw（每個細格點由哪幾個粗格點、各佔多少內插）。 */
function coarseOf(n, T) {
  var N = Math.round(Math.sqrt(n)), M = Math.round((Math.sqrt(8 * n + 1) - 1) / 2), kind = null, off = null, i, j, k;
  function ok(rc) {
    for (j = 0; j < T.length; j += 3) for (k = 0; k < 3; k++) { var a = rc(T[j + k]), b = rc(T[j + (k + 1) % 3]); if (Math.abs(a[0] - b[0]) > 1 || Math.abs(a[1] - b[1]) > 1) return false; }
    return true;
  }
  var sq = function (q) { return [Math.floor(q / N), q % N]; };
  if (N * N === n && N % 2 && ok(sq)) kind = 'sq';
  else if (M * (M + 1) / 2 === n && M % 2) {
    off = []; for (i = 0; i <= M; i++) off.push(i * M - i * (i - 1) / 2);
    var row = new Int32Array(n); for (i = 0; i < M; i++) for (j = off[i]; j < off[i + 1]; j++) row[j] = i;
    var tr = function (q) { return [row[q], q - off[row[q]]]; };
    if (ok(tr)) { kind = 'tri'; N = M; }
  }
  var mi = new Int32Array(n * 4), mw = new Float32Array(n * 4);
  if (!kind) {
    for (i = 0; i < n; i++) { mi[i * 4] = i; mw[i * 4] = 1; }
    return { kind: 'full', idx: Array.from({ length: n }, function (_, q) { return q; }), tris: Array.prototype.slice.call(T), mi: mi, mw: mw };
  }
  var Nc = (N + 1) / 2, idx = [], ct = [], R, C;
  var offc = []; for (R = 0; R <= Nc; R++) offc.push(kind === 'sq' ? R * Nc : R * Nc - R * (R - 1) / 2);
  function rowLen(R) { return kind === 'sq' ? Nc : Nc - R; }
  function fine(r, c) { return kind === 'sq' ? r * N + c : off[r] + c; }
  function cc(r, c) { return offc[r / 2] + c / 2; }                    // 細格 (r, c)（都是偶數）在粗格的編號
  for (R = 0; R < Nc; R++) for (C = 0; C < rowLen(R); C++) idx.push(fine(2 * R, 2 * C));
  for (R = 0; R + 1 < Nc; R++) for (C = 0; C + 1 < rowLen(R); C++) {
    var a = offc[R] + C;
    if (kind === 'sq') { ct.push(a, a + 1, a + Nc + 1, a, a + Nc + 1, a + Nc); continue; }
    ct.push(a, a + 1, offc[R + 1] + C);
    if (C + 2 < rowLen(R)) ct.push(a + 1, offc[R + 1] + C + 1, offc[R + 1] + C);
  }
  for (var r = 0; r < N; r++) for (var c = 0; c < (kind === 'sq' ? N : N - r); c++) {
    var f = fine(r, c) * 4, w = [];
    if (!(r & 1) && !(c & 1)) w = [[r, c]];
    else if (!(r & 1)) w = [[r, c - 1], [r, c + 1]];
    else if (!(c & 1)) w = [[r - 1, c], [r + 1, c]];
    else w = kind === 'sq' ? [[r - 1, c - 1], [r - 1, c + 1], [r + 1, c - 1], [r + 1, c + 1]] : [[r - 1, c + 1], [r + 1, c - 1]];   // 三角帆的對角線是 (r+1, c)–(r, c+1) 那一斜
    w.forEach(function (x, q) { mi[f + q] = cc(x[0], x[1]); mw[f + q] = 1 / w.length; });
  }
  return { kind: kind, idx: idx, tris: ct, mi: mi, mw: mw };
}
function clothSetup(H, C) {                            // 船型 H 的布模板；暫存區（兩艘、各型共用）照目前最大的那一型配；C ＝ 快取的記錄（06_cache.js：rbox、cloth）
  H.rbox = C ? C.rbox : H.rig.ropes.map(function (r) { return ropeBox(r.pts); });
  var n0 = H.nSail0 === undefined ? H.rig.sails.length : H.nSail0;      // 作品自己的帆（快取只存這幾面）；後面是陣營旗（77_colours.js teamFlagsSetup，每次現算）
  H.cloth = H.rig.sails.map(function (s, k) { if (C && k < n0 && C.cloth[k]) return C.cloth[k]; var t = clothTemplate(H, s); t.ti = k; return t; });   // ti：第幾面帆 ⇒ 貼圖集的哪一格（布片、斷開的那一團也認得）
  H.sailAtlas = sailAtlas(H.rig.sails.concat(H.teamExtra || [])); H.sailTexGL = null;   // teamExtra：陣營旗紅方那份、替換作品旗的藍紅兩份（77_colours.js teamFlagsSetup；畫的時候 sailRect 挑）              // 貼圖集不進快取（照 vxk 現算；GL 貼圖第一次畫才建，11_rig_gpu.js sailTex）
  var mv = 1, mc = 1, sv = 0, si = 0;
  H.cloth.forEach(function (C) { mv = Math.max(mv, C.n); mc = Math.max(mc, C.sim.n); sv += C.n; si += C.tris.length; });
  if (!CACC || CACC.length < mc * 3) { CACC = new Float32Array(mc * 3); CCNT = new Uint8Array(mc); }
  if (!SBV || SBV.length < Math.max(1, sv) * SB_STRIDE) SBV = new Float32Array(Math.max(1, sv) * SB_STRIDE);
  if (!SBI || SBI.length < Math.max(1, si)) SBI = new Uint32Array(Math.max(1, si));
  if (!SBN || SBN.length < mv * 3) { SBN = new Float32Array(mv * 3); SBP = new Float32Array(mv * 3); }
}
/** 張開的帆從雕刻作品那一刻的形狀開始（開局、收帆後再張、物理剛打開）。 */
function clothInit(c) {
  c.contactWarm = false;
  c.contactSides = Object.create(null);
  var T = c.T.sim; c.p = Float32Array.from(T.p0); c.q = Float32Array.from(T.p0);
  c.pin = new Uint8Array(T.n); for (var i = 0; i < T.n; i++) c.pin[i] = T.hk[i] ? 1 : 0;
  c.brk = new Uint8Array(T.ea.length); c.bbrk = new Uint8Array(T.ba.length); c.tv = new Uint8Array(c.T.n); c.torn = false; c.loose = false; c.free = 0; c.gone = false; c.npin = -1;
}
/** 靠的東西還在不在：格（被打掉 ⇒ 不在）、繩（斷了）、模型（飛了）；3 ＝ 帆還算數就在。 */
function holds(sh, s, k, v) { return k === 1 ? gp(sh.grid, v) > 0 : k === 2 ? !sh.ropes[v].dead : k === 3 ? !!s && !s.dead : k === 4 ? sh.models[v].alive : false; }
function clothPins(sh, s, c) {
  var T = c.T.sim, n = 0;
  for (var i = 0; i < T.n; i++) if (c.pin[i]) { if (holds(sh, s, T.hk[i], T.hv[i])) n++; else c.pin[i] = 0; }
  c.npin = n;
}
/** 撕開：打到的那一點 r 格內的邊斷掉（布上開一個洞，大一點就裂成兩半）。r：鏈彈 7、實心與爆裂穿過 3。
 *  洞裡那一塊布不是消失：切成布片、照物理飄下去（34_shreds.js shredCut；b ＝ 砲彈）。 */
function tearCloth(sh, s, L, r, b) {
  var c = sh.cl && sh.cl[s.k]; if (!PHYS || !c || !c.p) return;
  var old = Uint8Array.from(c.tv);                                     // 撕之前藏著的（之前的洞）⇒ 只有這一發新藏的才變布片
  var T = c.T.sim, p = c.p, r2 = (r || 7) * (r || 7), bi = 0, bd = 1e9, i;
  for (i = 0; i < T.n; i++) { var dx = p[i * 3] - L[0], dy = p[i * 3 + 1] - L[1], dz = p[i * 3 + 2] - L[2], d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; bi = i; } }   // 照布現在的位置
  var cx = p[bi * 3], cy = p[bi * 3 + 1], cz = p[bi * 3 + 2];
  function near(q) { var dx = p[q * 3] - cx, dy = p[q * 3 + 1] - cy, dz = p[q * 3 + 2] - cz; return dx * dx + dy * dy + dz * dz < r2; }
  for (i = 0; i < T.ea.length; i++) if (near(T.ea[i]) || near(T.eb[i])) c.brk[i] = 1;
  for (i = 0; i < T.ba.length; i++) if (near(T.ba[i]) || near(T.bb[i])) c.bbrk[i] = 1;
  // 畫的那層：碰到斷掉約束的粗格點，從它內插的細格點都不畫（洞的邊緣多吃一圈）。
  // ⛔ 只藏彈點附近的細格點：粗格點間距約 1 m，常常只切斷一個粗格點 —— 它沒了約束一直往下掉，
  //   旁邊沒藏到的細格三角形還從它內插，被拉成一條條直到海裡的布帶（Tim 2026-10-12 截到）。
  var touch = new Uint8Array(T.n), mi = c.T.mi, mw = c.T.mw;
  for (i = 0; i < T.ea.length; i++) if (c.brk[i]) { touch[T.ea[i]] = 1; touch[T.eb[i]] = 1; }
  for (i = 0; i < c.T.n; i++) for (var k = 0; k < 4; k++) { var o = i * 4 + k; if (!mw[o]) break; if (touch[mi[o]]) { c.tv[i] = 1; break; } }
  c.torn = true;
  if (b) shredCut(sh, c, old, b);
}
function solve(ea, eb, rest, brk, p, pin, k) {
  for (var e = 0; e < ea.length; e++) {
    if (brk && brk[e]) continue;
    var a = ea[e], b = eb[e], wa = pin[a] ? 0 : 1, wb = pin[b] ? 0 : 1; if (!(wa + wb)) continue;
    var ia = a * 3, ib = b * 3, dx = p[ib] - p[ia], dy = p[ib + 1] - p[ia + 1], dz = p[ib + 2] - p[ia + 2], l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-9) continue;
    var f = (l - rest[e]) / l * k / (wa + wb);
    if (wa) { p[ia] += dx * f; p[ia + 1] += dy * f; p[ia + 2] += dz * f; }
    if (wb) { p[ib] -= dx * f; p[ib + 1] -= dy * f; p[ib + 2] -= dz * f; }
  }
}
/** 落在格子裡（甲板、船殼）⇒ 退回上一步的位置（上一步本來就在格子裡的不管：繩頭從錨格裡長出來）。 */
function hitGrid(g, p, q, o) {
  if (g.get(Math.floor(p[o]), Math.floor(p[o + 1]), Math.floor(p[o + 2])) && !g.get(Math.floor(q[o]), Math.floor(q[o + 1]), Math.floor(q[o + 2]))) { p[o] = q[o]; p[o + 1] = q[o + 1]; p[o + 2] = q[o + 2]; }
}
function clothStep(sh, c, wl, gv) {                    // c.kw：風壓倍率（帆的布片，34_shreds.js；帆 ＝ 1）；c.ev：這一塊幾步走一次（遠方的船放大，physStep）
  var T = c.T.sim, n = T.n, p = c.p, q = c.q, pin = c.pin, tr = T.tris, A = CACC, N = CCNT, HC = (c.ev || rigLv().every) * DT, dt2 = HC * HC, inv = 1 / (3 * HC), dmp = DAMP * DAMP, kw = KW * (c.kw || 1), i, j, x;
  A.fill(0, 0, n * 3); N.fill(0, 0, n);
  for (j = 0; j < tr.length; j += 3) {           // 風壓：每個三角形沿法線推，大小 ∝（相對風在法線上的分量）²，相對風扣掉布自己的速度
    if (c.torn && (c.brk[T.te[j]] || c.brk[T.te[j + 1]] || c.brk[T.te[j + 2]])) continue;
    var a = tr[j] * 3, b = tr[j + 1] * 3, d = tr[j + 2] * 3;
    var ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    var rx = wl[0] - (p[a] - q[a] + p[b] - q[b] + p[d] - q[d]) * inv, ry = wl[1] - (p[a + 1] - q[a + 1] + p[b + 1] - q[b + 1] + p[d + 1] - q[d + 1]) * inv, rz = wl[2] - (p[a + 2] - q[a + 2] + p[b + 2] - q[b + 2] + p[d + 2] - q[d + 2]) * inv;
    var dn = rx * nx + ry * ny + rz * nz, f = kw * dn * Math.abs(dn);
    f *= 1 + FLUTTER * Math.sin((p[a] * 0.9 + p[a + 2]) * 0.06 - SIMT * 5.5);   // 一道一道走過布面的風（不抽亂數）
    var fx = f * nx, fy = f * ny, fz = f * nz;
    A[a] += fx; A[a + 1] += fy; A[a + 2] += fz; A[b] += fx; A[b + 1] += fy; A[b + 2] += fz; A[d] += fx; A[d + 1] += fy; A[d + 2] += fz;
    N[a / 3]++; N[b / 3]++; N[d / 3]++;
  }
  for (i = 0; i < n; i++) {
    if (pin[i]) continue;
    var o = i * 3, kk = N[i] ? 1 / N[i] : 0;
    for (x = 0; x < 3; x++) { var cur = p[o + x], vel = (cur - q[o + x]) * dmp; q[o + x] = cur; p[o + x] = cur + vel + (A[o + x] * kk + gv[x]) * dt2; }
    if (c.loose) hitGrid(sh.grid, p, q, o);
  }
  for (var it = 0, itn = rigLv().it; it < itn; it++) { solve(T.ea, T.eb, T.rest, c.torn ? c.brk : null, p, pin, 1); if (it & 1) solve(T.ba, T.bb, T.brest, c.torn ? c.bbrk : null, p, pin, 0.5); }
}
/** 剛斷的繩 ⇒ 垂下來的繩：重新取樣（每段 ≤ SEG 格，原本的弧度與鬆緊照留），兩端各記著靠什麼；被打斷的從斷點分成兩段。 */
function spawnLoose(sh, r) {
  var src = r.pts, m = src.length / 3, P = [], i, t;
  for (i = 0; i + 1 < m; i++) {
    var a = [src[i * 3], src[i * 3 + 1], src[i * 3 + 2]], b = [src[i * 3 + 3], src[i * 3 + 4], src[i * 3 + 5]], k = Math.max(1, Math.ceil(len(sub(b, a)) / SEG));
    for (t = 0; t < k; t++) P.push(lerp3(a, b, t / k));
  }
  P.push([src[m * 3 - 3], src[m * 3 - 2], src[m * 3 - 1]]);
  function end(an, mk, pr) { return an >= 0 ? [1, an] : mk !== undefined ? [4, mk] : pr !== undefined ? [2, pr] : [0, -1]; }
  var ea = end(r.a, r.ma, r.pa), eb = end(r.b, r.mb, r.pb), parts = [[P, ea, eb]];
  if (r.cutL) {
    var bi = 0, bd = 1e9;
    for (i = 0; i + 1 < P.length; i++) { var d = segDist2(r.cutL, P[i][0], P[i][1], P[i][2], P[i + 1][0], P[i + 1][1], P[i + 1][2]); if (d < bd) { bd = d; bi = i; } }
    parts = [[P.slice(0, bi + 1), ea, [0, -1]], [P.slice(bi + 1), [0, -1], eb]];
  }
  parts.forEach(function (pt) {
    var Q = pt[0], n = Q.length; if (n < 2) return;
    var p = new Float32Array(n * 3), rest = new Float32Array(n - 1);
    Q.forEach(function (w, j) { p[j * 3] = w[0]; p[j * 3 + 1] = w[1]; p[j * 3 + 2] = w[2]; if (j) rest[j - 1] = len(sub(w, Q[j - 1])); });
    var o = { p: p, q: Float32Array.from(p), rest: rest, n: n, pin: new Uint8Array(n), hk: [pt[1][0], pt[2][0]], hv: [pt[1][1], pt[2][1]], col: r.col, free: 0 };
    o.pin[0] = o.hk[0] ? 1 : 0; o.pin[n - 1] = o.hk[1] ? 1 : 0;
    ropePins(sh, o); sh.loose.push(o);
  });
  if (sh.loose.length > rigLv().loose) {                                  // 太多 ⇒ 先丟已經整條鬆掉的，再丟最早的
    var drop = sh.loose.findIndex(function (o) { return !o.pin[0] && !o.pin[o.n - 1]; });
    sh.loose.splice(drop >= 0 ? drop : 0, 1);
  }
}
function ropePins(sh, o) {
  if (o.pin[0] && !holds(sh, null, o.hk[0], o.hv[0])) o.pin[0] = 0;
  if (o.pin[o.n - 1] && !holds(sh, null, o.hk[1], o.hv[1])) o.pin[o.n - 1] = 0;
}
function ropeStep(sh, o, wl, gv, dt) {                 // dt：這一次走多久（遠方的船 ＝ 幾步一次 × DT；沒給 ＝ DT）
  dt = dt || DT;
  var p = o.p, q = o.q, n = o.n, pin = o.pin, dt2 = dt * dt, dmp = dt === DT ? DAMP : Math.pow(DAMP, dt / DT), i, x;
  for (i = 0; i < n; i++) {
    if (pin[i]) continue;
    var j = i * 3;
    for (x = 0; x < 3; x++) { var cur = p[j + x], vel = (cur - q[j + x]) * dmp; q[j + x] = cur; p[j + x] = cur + vel + (gv[x] + KD * (wl[x] - vel / dt)) * dt2; }
    hitGrid(sh.grid, p, q, j);
  }
  for (var it = 0, itn = rigLv().it; it < itn; it++) for (i = 0; i + 1 < n; i++) {
    var wa = pin[i] ? 0 : 1, wb = pin[i + 1] ? 0 : 1; if (!(wa + wb)) continue;
    var ia = i * 3, ib = ia + 3, dx = p[ib] - p[ia], dy = p[ib + 1] - p[ia + 1], dz = p[ib + 2] - p[ia + 2], l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-9) continue;
    var f = (l - o.rest[i]) / l / (wa + wb);
    if (wa) { p[ia] += dx * f; p[ia + 1] += dy * f; p[ia + 2] += dz * f; }
    if (wb) { p[ib] -= dx * f; p[ib + 1] -= dy * f; p[ib + 2] -= dz * f; }
  }
}
function underWater(sh, p, i) { var w = M4.pt(sh.M, p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); return w[1] < seaH(w[0], w[2], SIMT) - 0.5; }
/** 每一步：相對風與重力換進船的格座標 → 剛斷的繩變成垂下來的繩 → 每面帆、每條垂下來的繩各走一步；每 0.1 秒量一次靠的東西還在不在。 */
// ── 遠方的船帆與繩降速（Tim 2026-10-14：「可以設定降速模擬，特別是遠方船隻」）──
// 物理設定「遠方帆繩」；每艘每一步照離鏡頭多遠、在不在視野裡給倍率 m（1 ＝ 照常）：
//   布：每 every × m 步走一次（時間間隔跟著放大；最多 RIG_FAR_HC 秒 ⇒ Verlet 的布步長太大會炸開，m 照它截）；垂下來的繩：每 m 步走一次、dt ＝ m × DT。
//   這一段本來就只管畫出來的樣子（不碰 rnd()、不改命中）⇒ 開關不改戰局。鏡頭還沒算過（快轉、無頭對拍）⇒ 照常。
var RIG_FAR = [null, { d1: 150, m1: 2, d2: 1e9, m2: 2, off: 2 }, { d1: 100, m1: 2, d2: 200, m2: 3, off: 4 }], RIG_FAR_HC = 0.1;
function rigFarM(sh) {
  var F = RIG_FAR[PHX.rigfar], e = CAM.eye, vp = CAM.vp; if (!F || !e || !vp) return 1;
  var B = sh.T.base, R = 0.5 * S * Math.hypot(B.sx, B.sy, B.sz), c = M4.pt(sh.M, B.sx / 2, B.sy / 2, B.sz / 2), d = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]);
  var m = d > F.d2 ? F.m2 : d > F.d1 ? F.m1 : 1, cw = vp[3] * c[0] + vp[7] * c[1] + vp[11] * c[2] + vp[15], vis = d < R;
  if (!vis && cw > 0.1) { var k = 1 + 2 * R / cw, x = (vp[0] * c[0] + vp[4] * c[1] + vp[8] * c[2] + vp[12]) / cw, y = (vp[1] * c[0] + vp[5] * c[1] + vp[9] * c[2] + vp[13]) / cw; vis = Math.abs(x) < k && Math.abs(y) < k; }   // 外接球大概碰到畫面
  return vis ? m : Math.max(m, F.off);
}
function physStep(sh) {
  var W = norm(WIND), ws = WIND_SAIL * WIND_K * (1 + GUST[0] * Math.sin(SIMT * 0.9 + sh.phase) + GUST[1] * Math.sin(SIMT * 2.7 + 1.3) + GUST[2] * Math.sin(SIMT * 6.1 + sh.phase * 2)) * WX.wind * WIND_SPD;   // 陣風（不用亂數）；天氣：暴風雨 ×2.2；風速會變（08_weather.js）
  var wl = M4.dir(sh.inv, W[0] * ws - sh.vel[0], W[1] * ws - sh.vel[1], W[2] * ws - sh.vel[2]), gv = M4.dir(sh.inv, 0, -G, 0);
  var si = Math.round(SIMT / DT), chk = si % 6 === 0, i, ev = rigLv().every, m = sh.rigM = rigFarM(sh), evk = ev * Math.max(1, Math.min(m, Math.floor(RIG_FAR_HC / (ev * DT) + 1e-6)));   // evk：布幾步走一次（遠方放大）
  var ccOn = PHX.sailhit > 0 && PHX.rig >= 3;                       // 帆的碰撞（09_phx.js；Tim 2026-10-15：選項、預設關、帆與繩「高」才算）
  if (sh.yards.length) { braceYards(sh, wl, DT); if (chk) yardRopes(sh); }
  if (sh.hangs) swingHangs(sh, gv);
  for (i = 0; i < sh.ropes.length; i++) { var r = sh.ropes[i]; if (r.dead && !r.lz) { r.lz = true; if (!r.moved) spawnLoose(sh, r); } }
  sh.sails.forEach(function (s, k) {
    var c = sh.cl[k];
    if (c.gone) return;
    if (s.dead && !c.loose) {                                         // 物理打開之前就掉了的（late）⇒ 現在才垂下來；收著的時候掉的 ⇒ 不畫
      if (!c.late || s.furled) { c.gone = true; return; }
      clothInit(c); c.hidden = false; c.loose = true;
    }
    c.late = false;
    if (s.furled && !s.dead) {                                       // 收帆：物理開著 ⇒ 先演一段收上去（畫面上往帆桁／綁邊收攏，FURL_IN 秒）再藏；判斷照舊立刻算收起來（s.furled：航速、命中、鏈彈）
      if (c.hidden || !c.p || c.loose) { c.hidden = true; c.furlF = null; return; }
      c.furlF = (c.furlF === null || c.furlF === undefined ? 1 : c.furlF) - DT / FURL_IN;
      if (c.furlF <= 0) { c.hidden = true; c.furlF = null; sh.rigDirty = true; return; }   // rigDirty：它的繩跟著藏（11_rig_gpu.js buildRig）
    } else if (c.furlF !== null && c.furlF !== undefined && !c.hidden) { c.furlF += DT / FURL_OUT; if (c.furlF >= 1) c.furlF = null; }   // 張帆（或收到一半又張）：從帆桁放下來
    var reopen = c.hidden === true && !s.furled;                       // 收著 ⇒ 張開（⛔ 開局那一次 c.hidden 是 undefined ⇒ 不演）
    if (c.hidden || !c.p) { var keep = c.p && c.torn ? { brk: c.brk, bbrk: c.bbrk, tv: c.tv } : null; clothInit(c); c.hidden = false; if (keep) { c.brk = keep.brk; c.bbrk = keep.bbrk; c.tv = keep.tv; c.torn = true; } if (reopen) { c.furlF = 0; sh.rigDirty = true; } }   // 收帆再張：形狀重來、破洞留著；從收攏的樣子放下來（furlF 0 → 1）
    if (chk || c.npin < 0) clothPins(sh, s, c);
    yardPins(sh, c);
    c.ev = evk;
    if ((si + k + sh.i + 1) % evk === 0) { var t0 = DEBUG ? performance.now() : 0; clothStep(sh, c, wl, gv); if (DEBUG) PROF.cloth += performance.now() - t0; }
    if (ccOn && (si + k + sh.i + 1) % evk === 0 && c.p && !c.hidden && !c.gone) CC_Q.push({ sh: sh, c: c });   // 帆的碰撞（TASK-0603）：開了才排、跟布同一步；這一步全部的船走完才照時間預算解（clothContactsRun，50_sim.js）
    if (chk && c.loose && !c.npin) { c.free += 0.1; if (c.free > 12 || underWater(sh, c.p, 0) && underWater(sh, c.p, c.T.sim.n >> 1)) c.gone = true; }
  });
  for (i = 0; i < sh.loose.length; i++) {
    var o = sh.loose[i];
    if (chk) {
      ropePins(sh, o);
      if (!o.pin[0] && !o.pin[o.n - 1]) { o.free += 0.1; if (o.free > 15 || underWater(sh, o.p, 0) && underWater(sh, o.p, o.n - 1)) { sh.loose.splice(i--, 1); continue; } }
    }
    if (m > 1 && (si + i + sh.i) % m) continue;                          // 遠方：每 m 步走一次
    var t1 = DEBUG ? performance.now() : 0; ropeStep(sh, o, wl, gv, m * DT); if (DEBUG) PROF.rope += performance.now() - t1;
  }
  var t2 = DEBUG ? performance.now() : 0; shredStep(sh, wl, gv, si, chk); if (DEBUG) PROF.shred += performance.now() - t2;   // 帆的布片（34_shreds.js）
}
/** 開關物理（選單、B 鍵、下方按鈕）：開 ⇒ 帆從雕刻作品那一刻的形狀開始動；之前就斷掉的繩、掉下來的帆也垂下來
 *  （被斷開的那一團帶走的、一開始就不畫的除外）。關 ⇒ 回到靜態。 */
function setPhys(on) {
  PHYS = on;
  if (on && !PHX.rig) PHX.rig = PHX_RIG_LAST; else if (!on && PHX.rig) { PHX_RIG_LAST = PHX.rig; PHX.rig = 0; }   // 物理分級的「帆與繩」跟著走（09_phx.js）
  $('physT').classList.toggle('on', on); if (typeof phxShow === 'function' && $('phxB')) phxShow();
  SHIPS.forEach(function (sh) {
    sh.loose = []; sh.shreds = [];
    if (!on) { (sh.yards || []).forEach(function (m) { m.rot = 0; }); if (sh.yRopes) yardRopes(sh, true); unswingHangs(sh); }   // 關 ⇒ 帆桁回到作品的角度、小艇不擺
    sh.ropes.forEach(function (r) { r.lz = !!(r.never || r.moved); });
    sh.cl.forEach(function (c, k) { c.p = null; c.hidden = true; c.loose = false; c.torn = false; c.gone = !!c.moved; c.late = sh.sails[k].dead; });
    sh.rigDirty = true;
  });
  if (RUNNING && SHIPS.length) note(SHIPS[PLAYER_I], on ? '帆與繩的物理：開（帆被風吹鼓、斷掉的會垂下來）' : '帆與繩的物理：關（靜態）');
}

// TASK-0603: contacts are solved on the rendered fine triangles. Their barycentric
// corrections are transferred to the coarse degrees of freedom, excluding pins.
// These caches contain geometry only; destroyed body cells/models are checked live.
var CLOTH_CONTACT_MARGIN = 0.12;
// 收帆、張帆的演出（Tim 2026-10-15：「開啟帆繩物理時，收帆放帆是否可以多一小段演出（不影響判斷）」）：只改畫出來的樣子（11_rig_gpu.js sailBuf → furlDraw）。
//   c.furlF ＝ 張開了幾成（1 張開、0 收攏；null ＝ 沒在演）；收帆 FURL_IN 秒、張帆 FURL_OUT 秒。物理照常走、判斷照 s.furled 立刻生效。
var FURL_IN = 1.2, FURL_OUT = 1.6;
/** 畫面上收攏：每個細格點往它的「收攏點」（模板 T.gath：最近的綁在帆桁上的點；沒有帆桁 ⇒ 最近的綁點）靠過去，f ＝ 張開幾成（緩動）。 */
function furlDraw(c, P, f) {
  var T = c.T, g = T.gath;
  if (!g) {                                                           // 第一次用到才算（模板共用；用設計那一刻的形狀找最近的）
    var pins = [], yard = []; for (var i = 0; i < T.n; i++) if (T.hk[i]) { pins.push(i); if (T.hk[i] === 4) yard.push(i); }
    var src = yard.length ? yard : pins; g = T.gath = new Int32Array(T.n).fill(-1);
    if (src.length) for (i = 0; i < T.n; i++) { var bd = 1e18; for (var j = 0; j < src.length; j++) { var q = src[j], dx = T.p0[i * 3] - T.p0[q * 3], dy = T.p0[i * 3 + 1] - T.p0[q * 3 + 1], dz = T.p0[i * 3 + 2] - T.p0[q * 3 + 2], d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; g[i] = q; } } }
  }
  var e = f * f * (3 - 2 * f), k = 0.04 + 0.96 * e;                     // 收到底留 4%（一捲布，不是一條線）
  for (i = 0; i < T.n; i++) { var a = g[i]; if (a < 0 || a === i) continue; for (var ax = 0; ax < 3; ax++) P[i * 3 + ax] = P[a * 3 + ax] + (P[i * 3 + ax] - P[a * 3 + ax]) * k; }
  return P;
}
// 效能（ame 2026-10-15，Tim：「接手效能，在她的碰撞做法上加篩選和降頻」；碰撞的做法本身照 Sirius 的）：
//   · 開關：物理設定「帆的碰撞」（09_phx.js），預設關、帆與繩「高」才算；關 ⇒ 一行都不跑。
//   · 排隊＋時間預算：布走的那一步才排（physStep），全部的船走完再解；最久沒解的先解。平均每步最多花 CC_MS 毫秒：
//     一面帆解一次常常就超過（4–6 ms）⇒ 超出的記成欠的（CC_DEBT），之後幾步先還、不解 ⇒ 不會再一步幾百毫秒，也不會每步都多一面帆的時間。
//   · 整面篩：帆的外框碰不到船殼格、模型、繩 ⇒ 整面跳過；模型的矩陣與外框每艘每步算一次（ccModels），不是每面帆各算一次。
//   · 繩：線段清單照 pts 那一份陣列建一次（帆桁轉了 pts 會換新陣列 ⇒ 重建；⛔ 以前每次都建一棵排序的樹）。
//   · 輪數：第一次 CC_PASS[0]、之後每次 CC_PASS[1]（Sirius 原本 48／12；?ccpass=48,12 量正確性用）。
var CC_Q = [], CC_MS = +(Q.get('ccms') || 1.5), CC_DEBT = 0, CC_WALK = 12, CC_REGION = 30, CC_STEP = +(Q.get('ccstep') || 1);   // CC_STEP：一次接觸修正最多把一個點推幾格   // CC_WALK：船殼格往外找出口最多走幾格（1.2 m；帆只會穿進去幾格）
/** 這一步排到的帆，照最久沒解的先解，花到 CC_MS 毫秒為止（至少一面）。50_sim.js：全部的船 physStep 之後。 */
function clothContactsRun() {
  if (!CC_Q.length) return;
  CC_DEBT = Math.max(0, CC_DEBT - CC_MS);
  if (CC_DEBT > 0) { if (DEBUG) PROF.ccQ += CC_Q.length; CC_Q.length = 0; return; }   // 還在還之前超出的時間
  CC_Q.forEach(function (q) { if (!q.sh.T.ccGeometry) { var tg = performance.now(); ccGeometry(q.sh); if (DEBUG) PROF.ccGeo += performance.now() - tg; } });   // 第一次才建（不算進時間預算）
  var si = Math.round(SIMT / DT), t0 = performance.now(), n = 0;
  CC_Q.sort(function (a, b) { return (a.c.ccLast === undefined ? -1 : a.c.ccLast) - (b.c.ccLast === undefined ? -1 : b.c.ccLast); });
  for (var i = 0; i < CC_Q.length && performance.now() - t0 < CC_MS; i++) {
    var q = CC_Q[i], t1 = DEBUG ? performance.now() : 0; clothContacts(q.sh, q.c, t0 + CC_MS); q.c.ccLast = si; n++;   // 輪流：解過（或切到一半）的排到後面；切到一半的下次從 c.ccCur 接著做（⛔ 不排到後面 ⇒ 同一面一直佔著，另一艘的帆輪不到）
    if (DEBUG) PROF.ccMax = Math.max(PROF.ccMax, performance.now() - t1);
    if (DEBUG) { PROF.ccN++; PROF.ccHit += q.c.contactStats ? q.c.contactStats.first : 0; }
  }
  var used = performance.now() - t0; CC_DEBT += Math.max(0, used - CC_MS);
  if (DEBUG) { PROF.cc += used; PROF.ccQ += CC_Q.length; }
  CC_Q.length = 0;
}
/** 這艘船每個還在的模型：矩陣、反矩陣、世界外框（每步算一次，幾面帆共用）。 */
function ccModels(sh, geo) {
  var si = Math.round(SIMT / DT); if (sh.ccMB && sh.ccMB.si === si) return sh.ccMB.list;
  var list = [];
  (sh.models || []).forEach(function (m) {
    if (!m.alive || !geo.mb[m.mesh]) return;
    var matrix = modelLocal(m), b = geo.mb[m.mesh], corners = [];
    for (var k = 0; k < 8; k++) corners.push(M4.pt(matrix, b[k & 1 ? 3 : 0], b[k & 2 ? 4 : 1], b[k & 4 ? 5 : 2]));
    list.push({ m: m, matrix: matrix, inverse: null, box: ccBox(corners) });   // 反矩陣碰得到才算（下面）
  });
  sh.ccMB = { si: si, list: list }; return list;
}
var CC_PASS = (Q.get('ccpass') || '6,1').split(',').map(Number);   // 第一次（剛張開）幾輪、之後每次幾輪；?ccpass=48,12 ＝ Sirius 原本的（量正確性用）
function ccBox(points) {
  var b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  points.forEach(function (p) { for (var a = 0; a < 3; a++) { b[a] = Math.min(b[a], p[a]); b[a + 3] = Math.max(b[a + 3], p[a]); } }); return b;
}
function ccOverlap(a, b, r) { for (var k = 0; k < 3; k++) if (a[k] > b[k + 3] + r || a[k + 3] < b[k] - r) return false; return true; }
function ccTree(items) {
  if (!items.length) return null;
  var b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  items.forEach(function (o) { for (var a = 0; a < 3; a++) { b[a] = Math.min(b[a], o.b[a]); b[a + 3] = Math.max(b[a + 3], o.b[a + 3]); } });
  if (items.length <= 8) return { b: b, items: items };
  var axis = 0; for (var a = 1; a < 3; a++) if (b[a + 3] - b[a] > b[axis + 3] - b[axis]) axis = a;
  items.sort(function (x, y) { return x.b[axis] + x.b[axis + 3] - y.b[axis] - y.b[axis + 3]; });
  var mid = items.length >> 1; return { b: b, l: ccTree(items.slice(0, mid)), r: ccTree(items.slice(mid)) };
}
function ccQuery(tree, b, radius, out) {
  if (!tree || !ccOverlap(tree.b, b, radius)) return;
  if (tree.items) tree.items.forEach(function (o) { if (ccOverlap(o.b, b, radius)) out.push(o); });
  else { ccQuery(tree.l, b, radius, out); ccQuery(tree.r, b, radius, out); }
}
function ccGeometry(sh) {
  // ame：只收帆附近的船殼格（全部的帆在雕刻那一刻的外框、外擴 CC_REGION 格）；模型的三角形樹用到才建（ccMesh）。
  //   ⛔ 以前一開始就走完整艘的格（約 140 萬）、替 180 個模型每個建一棵排序的樹 ⇒ 第一次 2.5 秒。
  var H = sh.T; if (H.ccGeometry) return H.ccGeometry;
  var R = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  (H.cloth || []).forEach(function (t) { for (var i = 0; i < t.n; i++) for (var a = 0; a < 3; a++) { var w = t.p0[i * 3 + a]; if (w < R[a]) R[a] = w; if (w > R[a + 3]) R[a + 3] = w; } });
  for (var a = 0; a < 3; a++) { R[a] -= CC_REGION; R[a + 3] += CC_REGION; }
  var rows = new Map(), boxes = [];
  H.base.each(function (x, y, z) { if (x < R[0] || x > R[3] || y < R[1] || y > R[4] || z < R[2] || z > R[5]) return; var key = x + H.base.sx * z, row = rows.get(key); if (!row) rows.set(key, row = { x: x, z: z, ys: [] }); row.ys.push(y); });
  rows.forEach(function (row) {
    row.ys.sort(function (a, b) { return a - b; }); var start = row.ys[0], end = start;
    for (var j = 1; j <= row.ys.length; j++) { var y = row.ys[j]; if (y !== end + 1) { boxes.push({ b: [row.x, start, row.z, row.x + 1, end + 1, row.z + 1] }); start = y; } end = y; }
  });
  var mb = (H.rig.meshes || []).map(function (m) {           // 每個模型網格的外框（便宜；篩用）
    if (!m.tris || !m.tris.length) return null;
    var b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (var i = 0; i < m.verts.length; i += 3) for (var a2 = 0; a2 < 3; a2++) { var w = m.verts[i + a2]; if (w < b[a2]) b[a2] = w; if (w > b[a2 + 3]) b[a2 + 3] = w; }
    return b;
  });
  return H.ccGeometry = { body: ccTree(boxes), mb: mb, meshes: [], H: H };
}
/** 第 k 個模型網格的三角形樹（用到才建、建了留著）。 */
function ccMesh(geo, k) {
  var t = geo.meshes[k]; if (t !== undefined) return t;
  var m = geo.H.rig.meshes[k], ts = [], volume = 0;
  for (var i = 0; i < m.tris.length; i += 3) { var p = []; for (var j = 0; j < 3; j++) { var v = m.tris[i + j] * 3; p.push([m.verts[v], m.verts[v + 1], m.verts[v + 2]]); } volume += dot(p[0], cross(p[1], p[2])); ts.push({ p: p, b: ccBox(p), id: i / 3 }); }
  t = ccTree(ts); if (t) t.orientation = volume < 0 ? -1 : 1;
  return (geo.meshes[k] = t);
}
function ccBary(p, v) {
  var a = sub(v[1], v[0]), b = sub(v[2], v[0]), q = sub(p, v[0]), aa = dot(a, a), ab = dot(a, b), bb = dot(b, b), den = aa * bb - ab * ab;
  if (Math.abs(den) < 1e-14) return [1 / 3, 1 / 3, 1 / 3];
  var y = (bb * dot(q, a) - ab * dot(q, b)) / den, z = (aa * dot(q, b) - ab * dot(q, a)) / den; return [1 - y - z, y, z];
}
function ccClosest(p, v) {
  var n = norm(cross(sub(v[1], v[0]), sub(v[2], v[0]))), q = sub(p, mul(n, dot(sub(p, v[0]), n))), w = ccBary(q, v);
  if (w.every(function (x) { return x >= 0; })) return { p: q, w: w };
  var best = null;
  for (var i = 0; i < 3; i++) { var j = (i + 1) % 3, d = sub(v[j], v[i]), t = clamp(dot(sub(p, v[i]), d) / (dot(d, d) || 1), 0, 1), x = add(v[i], mul(d, t)), dd = dot(sub(x, p), sub(x, p)); if (!best || dd < best.d) { var b = [0, 0, 0]; b[i] = 1 - t; b[j] = t; best = { p: x, w: b, d: dd }; } } return best;
}
function ccSegmentTri(a, b, v) {
  var d = sub(b, a), e = sub(v[1], v[0]), f = sub(v[2], v[0]), h = cross(d, f), det = dot(e, h); if (Math.abs(det) < 1e-10) return null;
  var s = sub(a, v[0]), u = dot(s, h) / det, q = cross(s, e), w = dot(d, q) / det, t = dot(f, q) / det;
  if (u < -1e-8 || w < -1e-8 || u + w > 1 + 1e-8 || t < 0 || t > 1) return null;
  return { p: add(a, mul(d, t)), w: [1 - u - w, u, w], t: t };
}
function ccTriangleBox(v, b) {
  var c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], e = [(b[3] - b[0]) / 2, (b[4] - b[1]) / 2, (b[5] - b[2]) / 2], axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], edges = [sub(v[1], v[0]), sub(v[2], v[1]), sub(v[0], v[2])];
  axes.push(cross(edges[0], edges[1])); edges.forEach(function (d) { for (var a = 0; a < 3; a++) axes.push(cross(d, axes[a])); });
  var best = Infinity, normal = null;
  for (var i = 0; i < axes.length; i++) {
    var length = len(axes[i]); if (length < 1e-10) continue; var n = mul(axes[i], 1 / length), p = v.map(function (x) { return dot(sub(x, c), n); }), lo = Math.min.apply(null, p), hi = Math.max.apply(null, p), r = e[0] * Math.abs(n[0]) + e[1] * Math.abs(n[1]) + e[2] * Math.abs(n[2]);
    if (lo > r || hi < -r) return null;
    var plus = r - lo, minus = hi + r, depth = Math.min(plus, minus); if (depth < best) { best = depth; normal = mul(n, plus < minus ? 1 : -1); }
  }
  var q = ccClosest(c, v); return { w: q.w, p: q.p, delta: mul(normal, best + CLOTH_CONTACT_MARGIN) };
}
function ccInside(p, tree) {
  if (!tree || p.some(function (x, a) { return x <= tree.b[a] || x >= tree.b[a + 3]; })) return false;
  var end = [tree.b[3] + 1, p[1] + .000013, p[2] + .000027], faces = [], hits = [];
  ccQuery(tree, ccBox([p, end]), 0, faces);
  faces.forEach(function (f) { var h = ccSegmentTri(p, end, f.p); if (h && h.t > 1e-7) hits.push(h.t); });
  hits.sort(function (a, b) { return a - b; }); return hits.filter(function (t, i) { return !i || Math.abs(t - hits[i - 1]) > 1e-7; }).length % 2 === 1;
}
function ccNearest(p, tree) {
  var best = null;
  function visit(t) {
    if (!t) return; var d = 0; for (var a = 0; a < 3; a++) d += Math.pow(Math.max(t.b[a] - p[a], 0, p[a] - t.b[a + 3]), 2);
    if (best && d > best.d) return;
    if (t.items) t.items.forEach(function (f) { var q = ccClosest(p, f.p), ds = dot(sub(q.p, p), sub(q.p, p)); if (!best || ds < best.d) best = { p: q.p, d: ds, face: f }; });
    else { visit(t.l); visit(t.r); }
  }
  visit(tree); return best;
}
function ccMove(c, ids, weights, delta, mount) {
  var T = c.T, mass = new Map(), denom = 0;
  for (var j = 0; j < 3; j++) for (var k = 0; k < 4; k++) { var at = ids[j] * 4 + k, w = T.mw[at] * weights[j], node = T.mi[at]; if (!w || c.pin[node]) continue; mass.set(node, (mass.get(node) || 0) + w); }
  mass.forEach(function (w) { denom += w * w; }); if (denom < 1e-12) return false;
  var magnitude = len(delta), maxWeight = 0; mass.forEach(function (w) { maxWeight = Math.max(maxWeight, w); });
  var scale = Math.min(1, (c.contactWarm ? 1 : 4) * denom / ((magnitude || 1) * maxWeight));
  var moved = false;
  mass.forEach(function (w, node) {
    var dx = delta[0] * scale * w / denom, dy = delta[1] * scale * w / denom, dz = delta[2] * scale * w / denom, dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var room = CC_STEP - c.ccAcc[node]; if (room <= 1e-4) return;          // 這一次解（clothContacts 一次呼叫）每個點總共最多推 CC_STEP 格（ame：Tim「碰撞會有瞬間帆彈出一大段距離」——
    if (dl > room) { var f = room / dl; dx *= f; dy *= f; dz *= f; dl = room; }   //   一個點一次被推出桅杆 10 格、又被相鄰的六個三角形各推一次 ⇒ 邊拉到 96 格（關碰撞最長 33）；推不完的下一次再推）
    c.ccAcc[node] += dl;
    var d3 = [dx, dy, dz];
    for (var a = 0; a < 3; a++) { var at = node * 3 + a, old = c.p[at], d = d3[a];
    if (Math.abs(d) < 1e-5) continue; c.p[at] += d; var actual = c.p[at] - old;
    if (actual) { c.q[at] += actual; moved = true; }
  } }); return moved;
}
function ccSeparate(c, ids, v, normal, limit, mount) {
  var moved = false;
  for (var j = 0; j < 3; j++) {
    var depth = limit - dot(v[j], normal); if (depth <= 1e-4) continue;
    var w = [0, 0, 0]; w[j] = 1;
    if (ccMove(c, ids, w, mul(normal, depth), mount !== false)) moved = true;
  }
  return moved;
}
function ccBodyPlane(grid, v, cell) {
  var best = null;
  for (var axis = 0; axis < 3; axis++) for (var sign = -1; sign <= 1; sign += 2) {
    var q = cell.slice(), steps = 0;
    while (grid.get(q[0], q[1], q[2]) && steps++ < CC_WALK) q[axis] += sign;   // 往這個方向走到空格（ame：256 ⇒ CC_WALK；帆穿進桅杆沿桅的方向一走就是 256 格 × 每格每個三角形每一輪 ⇒ 一面帆一次 12.7 秒）
    if (steps >= CC_WALK) continue;
    var normal = [0, 0, 0]; normal[axis] = sign;
    var limit = (q[axis] + (sign < 0 ? 1 : 0)) * sign + CLOTH_CONTACT_MARGIN;
    var depth = limit - Math.min.apply(null, v.map(function (p) { return dot(p, normal); }));
    if (!best || depth < best.depth) best = { normal: normal, limit: limit, depth: depth };
  }
  return best;
}
function ccOnSegment(p, a, b) {
  var d = sub(b, a), t = clamp(dot(sub(p, a), d) / (dot(d, d) || 1), 0, 1); return add(a, mul(d, t));
}
function ccPair(a, b, c, d) {
  var u = sub(b, a), v = sub(d, c), w = sub(a, c), aa = dot(u, u), bb = dot(u, v), cc = dot(v, v), dd = dot(u, w), ee = dot(v, w), den = aa * cc - bb * bb;
  var s = den > 1e-12 ? clamp((bb * ee - cc * dd) / den, 0, 1) : 0;
  var t = cc > 1e-12 ? (bb * s + ee) / cc : 0;
  if (t < 0) { t = 0; s = clamp(-dd / (aa || 1), 0, 1); }
  else if (t > 1) { t = 1; s = clamp((bb - dd) / (aa || 1), 0, 1); }
  var p = add(a, mul(u, s)), q = add(c, mul(v, t)); return { p: p, q: q, d: len(sub(p, q)) };
}
function ccCapsule(a, b, v) {
  var crossHit = ccSegmentTri(a, b, v); if (crossHit) return { d: 0, p: crossHit.p, q: crossHit.p };
  var best = null;
  function take(p, q) { var d = len(sub(p, q)); if (!best || d < best.d) best = { d: d, p: p, q: q }; }
  take(ccClosest(a, v).p, a); take(ccClosest(b, v).p, b);
  for (var j = 0; j < 3; j++) { var pair = ccPair(v[j], v[(j + 1) % 3], a, b); take(pair.p, pair.q); }
  return best;
}
function ccClip(poly, axis, bound, sign) {
  var out = [];
  for (var i = 0; i < poly.length; i++) {
    var a = poly[i], b = poly[(i + 1) % poly.length], da = (a[axis] - bound) * sign, db = (b[axis] - bound) * sign;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) out.push(add(a, mul(sub(b, a), da / (da - db))));
  }
  return out;
}
function ccRopeMount(c, ids, v, record, a, b) {
  var T = c.T, r = record.r, radius = record.radius, extent = 2 * radius + CLOTH_CONTACT_MARGIN;
  for (var j = 0; j < 3; j++) {
    var id = ids[j], own = T.hk[id] === 2 && T.hv[id] === record.index;
    if (!own && (!sailRope(r, T.name) || Math.min(len(sub(v[j], a)), len(sub(v[j], b))) > extent)) continue;
    if (!c.pin[id]) continue;
    var contained = true;
    for (var axis = 0; axis < 3 && contained; axis++) for (var sign = -1; sign <= 1 && contained; sign += 2) {
      var poly = ccClip(v, axis, v[j][axis] + sign * extent, sign);
      for (var k = 1; k + 1 < poly.length; k++) if (ccCapsule(a, b, [poly[0], poly[k], poly[k + 1]]).d < radius - 1e-5) { contained = false; break; }
    }
    if (contained) return true;
  }
  return false;
}
function ccAttachment(c, ids, hit, owner, v) {
  // Only the actual fixed edge may enter its own mounting solid. A neighbouring
  // free triangle is not exempt merely because one of its vertices is pinned.
  var T = c.T, closest = Infinity;
  for (var j = 0; j < 3; j++) { var k = (j + 1) % 3, a = ids[j], b = ids[k]; if (!T.hk[a] || !T.hk[b]) continue;
    var owns = owner < 0 ? T.hk[a] === 1 || T.hk[b] === 1 : T.hk[a] === 4 && T.hv[a] === owner && T.hk[b] === 4 && T.hv[b] === owner;
    if (!owns) continue;
    closest = Math.min(closest, Math.sqrt(segDist2(hit.p, v[j][0], v[j][1], v[j][2], v[k][0], v[k][1], v[k][2])));
  }
  return closest <= 0.8;
}
function clothContacts(sh, c, deadline) {   // deadline：performance.now() 到這個時間就先停、記下做到哪個三角形（c.ccCur），下次接著做；回傳這一面掃完了沒
  if (!c.p || c.hidden || c.gone || !c.T.mi) return;
  var T = c.T, geo = ccGeometry(sh), fine = c.contactFine || (c.contactFine = new Float32Array(T.n * 3)), contacts = 0, locked = 0;
  if (!c.ccAcc || c.ccAcc.length !== c.p.length / 3) c.ccAcc = new Float32Array(c.p.length / 3); else c.ccAcc.fill(0);   // 每個點這一次推了多少（ccMove）
  clothFine(c, fine);
  var clothBox = ccBox(Array.from({ length: T.n }, function (_, i) { return Array.from(fine.slice(i * 3, i * 3 + 3)); }));
  var models = ccModels(sh, geo).filter(function (m) { return ccOverlap(clothBox, m.box, 3); });
  models.forEach(function (m) { if (!m.inverse) m.inverse = M4.inv(m.matrix); });
  var ropes = sh.ropes.map(function (r, i) { return { r: r, index: i, radius: sh.T.rig.ropes[i].radius || 0 }; }).filter(function (o) { var r = o.r; return !r.dead && ccOverlap(clothBox, r.bb || ccBox([r.pts.slice(0, 3), r.pts.slice(-3)]), 3); });
  ropes.forEach(function (o) { var r = o.r; if (r.ccPts === r.pts) return;
    var segs = []; for (var j = 0; j + 5 < r.pts.length; j += 3) { var a = [r.pts[j], r.pts[j + 1], r.pts[j + 2]], b = [r.pts[j + 3], r.pts[j + 4], r.pts[j + 5]]; segs.push({ a: a, end: b, b: ccBox([a, b]) }); }
    r.ccSegs = segs; r.ccPts = r.pts;
  });
  var bodyNear = []; ccQuery(geo.body, clothBox, CLOTH_CONTACT_MARGIN, bodyNear);
  if (!models.length && !ropes.length && !bodyNear.length) { c.contactStats = { contacts: 0, unsatisfiedPins: 0, first: 0 }; c.contactWarm = true; return; }   // 整面帆的外框碰不到任何東西 ⇒ 不用一個三角形一個三角形查
  var clothCenter = [0, 0, 0]; for (var vi = 0; vi < T.n; vi++) for (var a = 0; a < 3; a++) clothCenter[a] += fine[vi * 3 + a] / T.n;
  if (!T.mountNormal) {
    var sum = [0, 0, 0];
    for (var ti = 0; ti < T.tris.length; ti += 3) { var v = [T.tris[ti], T.tris[ti + 1], T.tris[ti + 2]].map(function (i) { return Array.from(T.p0.slice(i * 3, i * 3 + 3)); }); sum = add(sum, cross(sub(v[1], v[0]), sub(v[2], v[0]))); }
    T.mountNormal = norm(sum);
  }
  var first = -1, cut = false, start = c.ccCur || 0;
  for (var iteration = 0, passes = c.contactWarm ? CC_PASS[1] : CC_PASS[0]; iteration < passes; iteration++) {   // 輪數（ame：48／12 ⇒ CC_PASS；之後每一次跑仍然接著修 ⇒ 幾步內收斂）
    clothFine(c, fine); var moved = false;
    for (var ti = iteration ? 0 : start; ti < T.tris.length; ti += 3) {
      if (deadline && (ti & 63) === 0 && performance.now() > deadline) { c.ccCur = ti; cut = true; break; }   // 時間到 ⇒ 先停（一面帆切成幾段做，一格不會頓）
      var ids = [T.tris[ti], T.tris[ti + 1], T.tris[ti + 2]]; if (c.torn && ids.some(function (v) { return c.tv[v]; })) continue;
      // Read the latest coarse state: neighbouring triangles share degrees of freedom.
      var v = ids.map(function (q) { var p = [0, 0, 0]; for (var k = 0; k < 4; k++) { var at = q * 4 + k, n = T.mi[at] * 3, w = T.mw[at]; for (var a = 0; a < 3; a++) p[a] += c.p[n + a] * w; } return p; }), box = ccBox(v), cells = [];
      if (bodyNear.length) ccQuery(geo.body, box, 0, cells);
      for (var bi = 0; bi < cells.length; bi++) { var b = cells[bi].b;
        for (var x = Math.max(b[0], Math.floor(box[0])); x < Math.min(b[3], Math.ceil(box[3] + 1e-7)); x++) for (var y = Math.max(b[1], Math.floor(box[1])); y < Math.min(b[4], Math.ceil(box[4] + 1e-7)); y++) for (var z = Math.max(b[2], Math.floor(box[2])); z < Math.min(b[5], Math.ceil(box[5] + 1e-7)); z++) {
          if (!sh.grid.get(x, y, z)) continue; var hit = ccTriangleBox(v, [x, y, z, x + 1, y + 1, z + 1]); if (!hit) continue;
          var plane = ccBodyPlane(sh.grid, v, [x, y, z]);
          contacts++; if (plane && ccSeparate(c, ids, v, plane.normal, plane.limit)) moved = true; else locked++;
        }
      }
      for (var mk = 0; mk < models.length; mk++) { var model = models[mk]; if (!ccOverlap(box, model.box, CLOTH_CONTACT_MARGIN)) continue;
        var local = v.map(function (p) { return M4.pt(model.inverse, p[0], p[1], p[2]); }), localBox = ccBox(local), faces = []; ccQuery(ccMesh(geo, model.m.mesh), localBox, CLOTH_CONTACT_MARGIN, faces);
        var center = mul(add(add(local[0], local[1]), local[2]), 1 / 3);
        if (ccInside(center, ccMesh(geo, model.m.mesh))) {
          var near = ccNearest(center, ccMesh(geo, model.m.mesh)), direction = norm(sub(near.p, center));
          contacts++; if (ccMove(c, ids, [1 / 3, 1 / 3, 1 / 3], M4.dir(model.matrix,
            direction[0] * (Math.sqrt(near.d) + CLOTH_CONTACT_MARGIN), direction[1] * (Math.sqrt(near.d) + CLOTH_CONTACT_MARGIN), direction[2] * (Math.sqrt(near.d) + CLOTH_CONTACT_MARGIN)), true)) moved = true; else locked++;
          continue;
        }
        for (var fi = 0; fi < faces.length; fi++) { var face = faces[fi].p, crossing = null;
          for (var edge = 0; edge < 3 && !crossing; edge++) { var h = ccSegmentTri(local[edge], local[(edge + 1) % 3], face); if (h) { var w = [0, 0, 0]; w[edge] = 1 - h.t; w[(edge + 1) % 3] = h.t; crossing = { p: h.p, w: w }; } }
          for (var edge = 0; edge < 3 && !crossing; edge++) crossing = ccSegmentTri(face[edge], face[(edge + 1) % 3], local);
          if (!crossing) continue;
          var world = M4.pt(model.matrix, crossing.p[0], crossing.p[1], crossing.p[2]);
          var normal = mul(norm(cross(sub(face[1], face[0]), sub(face[2], face[0]))), ccMesh(geo, model.m.mesh).orientation), depth = Math.max.apply(null, local.map(function (p) { return -dot(sub(p, face[0]), normal); })), delta = M4.dir(model.matrix, normal[0], normal[1], normal[2]);
          contacts++; if (ccSeparate(c, ids, v, norm(delta), dot(world, norm(delta)) + CLOTH_CONTACT_MARGIN)) moved = true; else locked++;
          break; // Recompute shared vertices before another face of the same solid.
        }
      }
      for (var ri = 0; ri < ropes.length; ri++) { var rope = ropes[ri].r, radius = ropes[ri].radius + CLOTH_CONTACT_MARGIN; if (!ccOverlap(box, rope.bb || ccBox([rope.pts.slice(0, 3), rope.pts.slice(-3)]), radius)) continue;
        var segments = rope.ccSegs.filter(function (q) { return ccOverlap(q.b, box, radius); });
        for (var rj = 0; rj < segments.length; rj++) { var a = segments[rj].a, b = segments[rj].end, hit = ccCapsule(a, b, v); if (hit.d >= radius) continue;
          if (ccRopeMount(c, ids, v, ropes[ri], a, b)) continue;
          var d = norm(sub(b, a)), normal = sub(T.mountNormal, mul(d, dot(T.mountNormal, d)));
          if (len(normal) < 1e-7) normal = cross(d, [0, 0, 1]);
          var side = c.contactSides[rope.name];
          if (!side) side = dot(sub(clothCenter, a), normal) < 0 ? -1 : 1;
          for (var j = 0; j < 3; j++) if (c.pin[ids[j]] && len(sub(v[j], ccOnSegment(v[j], a, b))) < radius + 3) {
            var signed = dot(sub(v[j], a), normal); if (Math.abs(signed) > radius) side = c.contactSides[rope.name] = signed < 0 ? -1 : 1;
          }
          normal = mul(normal, side);
          normal = norm(normal);
          contacts++; if (ccSeparate(c, ids, v, normal, dot(a, normal) + radius, false)) moved = true; else locked++;
        }
      }
    }
    if (first < 0) first = contacts;
    if (cut) break;
    c.ccCur = 0;
    if (!moved) break;
  }
  c.contactStats = { contacts: contacts, unsatisfiedPins: locked, first: first < 0 ? 0 : first };
  if (!cut) c.contactWarm = true;
  return !cut;
}


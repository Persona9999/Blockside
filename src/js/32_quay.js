// ───────────────────────── 棧橋、海堤的碰撞；停靠的船繫在泊位上（Blocksail TASK-0951） ─────────────────────────
// 只有城（TOWNS.list 有城、規劃到了）才有；沒有 ⇒ 每一支第一行就回去（沒有城的戰局逐位元組不變）。⛔ 不抽 rnd()。
// Tim 2026-10-25：「停靠的船要固定在棧橋上(目前會漂走) 且棧橋可能要加碰撞?」「棧橋 海堤都需要碰撞」
// 碰撞（quayStep；50_sim.js 每一步擱淺之後）：
//   · 擋的東西（照城的規劃，quayObs 每座城一份）：棧橋、T 字頭、支棧橋、長碼頭、石堤（p.piers）、碼頭石岸（p.quay）＝ 折線每一段一條膠囊（半徑 寬/2，同 63_towns.js 畫的那條板）；
//     水上建築的平台（地塊帶 water；Blocksail TASK-0899）＝ 矩形（地塊的 d × w，照 rot 轉）；
//     泊位建築（地塊 use 'berth'；BUILDING_SPEC §6.21）的平台（berth.apron：棧橋邊往外）、魚骨式兩側各半根指形棧橋（berth.fw、伸 QUAY_FINGER 公尺）＝ 矩形。
//   · 船：船身「水線下 QUAY_Z0 到水線上 QUAY_Z1 公尺」那一段（棧橋板面在水上 1.0–1.4 m ⇒ 這一段的船身會碰到板、樁），從這一段最前到最後每 QUAY_DX 公尺一點、
//     半徑 ＝ 那一點前後半格距內、這一段實心格離中線最遠的那一格 ⇒ 船頭船尾窄的照實際、水線上伸出去的船頭（艏樓、船首像底下）也算。
//     ⛔ 以前只量水線上下幾格、水線兩端往內 8 格 ⇒ 水線那一點停在板邊，上面的船頭伸到板面上方好幾公尺（2026-10-25 金斯敦截圖）。
//   · 壓進去 ⇒ 船整艘照壓得最深的那一點沿法線推出來（一步最多 QUAY_PUSH 公尺）；航速扣掉往它撞進去的那一份（正面撞上 ⇒ 停住；斜著擦過 ⇒ 剩下沿著走的那一份），
//     碰到的那一點在船中心前面 ⇒ 船頭往離開它的那一側偏（QUAY_TURN）⇒ 沿著滑開。
//   · 不推：繫在泊位上的（sh.moor）、自動停靠／出航中的我艦（88_modeswitch.js：照畫好的航道走；Tim 2026-10-24「風、碰撞、水深推不開它」）。
//   · 讀數：sh.quayHit ＝ { t 最後一次碰到的時刻, t0 這一次從什麼時候開始碰, kind 碰到哪一種, pen 壓進去多深 }（離開 ⇒ null）。
// 繫泊（moorPull；31_sailing.js 每一步錨之後）：sh.moor ＝ { x, z, yaw }（船的中心、船頭；x 還沒有 ⇒ 第一步照當下的位置記）⇒ 位置、船頭每一步用彈簧（MOOR_PULL，每秒）拉回去、
//   航速歸零 ⇒ 浪照樣晃，風、水流、錨推不走（以前只靠兩錨：錨鍊放 38 m，水流照樣加在船速上 ⇒ 繞錨漂到棧橋外；075e5bd 量到往來的船收帆之後 35 秒還漂 1.5 m）。
//   我艦：停靠過場停好了（88_modeswitch.js dockPull）、直接從城鎮模式開場時離停靠處 MOOR_SNAP 公尺以內（dockGot）⇒ 繫在停靠處（DOCK.here 的 at、yaw）；不是城鎮模式、又在自動開 ⇒ 放開。
//   往來的船：停港（58_traffic.js trafficDock）⇒ 繫在停下來的那一點；出港 ⇒ 放開。
var QUAY_Z0 = 0.1, QUAY_Z1 = 2.5, QUAY_DX = 1.5, QUAY_PUSH = 1, QUAY_TURN = 0.35, MOOR_PULL = 2, MOOR_SNAP = 40;   // 水線下、水線上幾公尺；點距（公尺）；一步最多推幾公尺；偏轉（rad/s，正面撞上時）；彈簧（每秒）；公尺
/** 船的取樣點（船型一份，T.quay；vs ＝ 一格幾公尺）：[[x 格, 半寬 格]…]（上面的說明）。 */
function quayHull(T, vs) {
  if (T.quay) return T.quay;
  var G = T.base, z0 = Math.max(0, Math.floor(T.zw - QUAY_Z0 / vs)), z1 = Math.min(G.sz - 1, Math.ceil(T.zw + QUAY_Z1 / vs)), col = new Float32Array(G.sx).fill(-1), x, y, z;
  for (x = 0; x < G.sx; x++) for (y = 0; y < G.sy; y++) { var d = Math.abs(y + 0.5 - T.cy); if (d <= col[x]) continue; for (z = z0; z <= z1; z++) if (G.get(x, y, z)) { col[x] = d; break; } }   // 每一欄這一段離中線最遠的實心格
  var x0 = 0, x1 = G.sx - 1; while (x0 < x1 && col[x0] < 0) x0++; while (x1 > x0 && col[x1] < 0) x1--;
  var st = Math.max(1, Math.round(QUAY_DX / vs)), n = Math.max(1, Math.ceil((x1 - x0) / st)), out = [];
  for (var k = 0; k <= n; k++) {
    var xc = Math.round(x0 + (x1 - x0) * k / n), hb = 0;
    for (x = Math.max(x0, xc - (st >> 1)); x <= Math.min(x1, xc + (st >> 1)); x++) hb = Math.max(hb, col[x]);
    out.push([xc, hb]);
  }
  return (T.quay = out);
}
/** 一座城擋船的東西（世界座標）：{ segs: [{ a, b, r, kind }], polys: [{ P: [4 點], kind }], bb }；規劃換了（建築模式加水上建築、棧橋重來）⇒ 重算。 */
function quayObs(T) {
  var p = T.p, lots = p.lots || [], key = (p.piers || []).length + ':' + (p.quay || []).length + ':' + lots.length + ':' + BED.ax + ',' + BED.az;
  if (T.quayObs && T.quayObs.p === p && T.quayObs.key === key) return T.quayObs;
  var O = { p: p, key: key, segs: [], polys: [], bb: [1e9, 1e9, -1e9, -1e9] };
  function W(q) { var e = T.E(q); return [e[0] - BED.ax, e[1] - BED.az]; }
  function grow(q, r) { O.bb[0] = Math.min(O.bb[0], q[0] - r); O.bb[1] = Math.min(O.bb[1], q[1] - r); O.bb[2] = Math.max(O.bb[2], q[0] + r); O.bb[3] = Math.max(O.bb[3], q[1] + r); }
  function line(path, w, kind) {
    var P = (path || []).map(W), r = (+w || 4) / 2;
    for (var i = 1; i < P.length; i++) { O.segs.push({ a: P[i - 1], b: P[i], r: r, kind: kind }); grow(P[i - 1], r); grow(P[i], r); }
  }
  (p.piers || []).forEach(function (q) { line(q.path, q.w, q.kind || 'pier'); });
  (p.quay || []).forEach(function (q) { line(q.path, q.w, 'quay'); });
  lots.forEach(function (l) {
    if (!l.water) return;
    var th = l.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
    function pt(a, b) { return W([l.at[0] + cs * a - sn * b, l.at[1] + sn * a + cs * b]); }   // 同 63_towns.js 水上平台的 pt
    var P = [pt(-l.d / 2, -l.w / 2), pt(l.d / 2, -l.w / 2), pt(l.d / 2, l.w / 2), pt(-l.d / 2, l.w / 2)];
    O.polys.push({ P: P, kind: 'wlot' }); P.forEach(function (q) { grow(q, 0); });
  });
  lots.forEach(function (l) {                                           // 泊位建築（Blocksail TASK-0906，BUILDING_SPEC §6.21、TOWN_BUILD §5.19）：平台、指形棧橋（模型畫的，規劃的棧橋線沒有）
    var B = l.berth; if (l.use !== 'berth' || !B) return;
    var th = l.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
    function pt(a, b) { return W([l.at[0] + cs * a - sn * b, l.at[1] + sn * a + cs * b]); }
    function gap(q) { var d = Infinity; O.segs.forEach(function (s) { var c = quaySegPt(q[0], q[1], s.a, s.b); d = Math.min(d, Math.hypot(q[0] - c[0], q[1] - c[1])); }); return d; }
    var s = gap(pt(l.d / 2, 0)) <= gap(pt(-l.d / 2, 0)) ? 1 : -1, a0 = s * (l.d / 2 - Math.max(0, (B.over || 0) - TOWN_BERTH_STRIP));   // 框靠棧橋那一頭在棧橋中線（離棧橋線近的那一頭）；棧橋邊往內 over − 0.49（同 63_towns.js townLotInst）
    function rect(a1, b1, b2, kind) { var P = [pt(a0, b1), pt(a1, b1), pt(a1, b2), pt(a0, b2)]; O.polys.push({ P: P, kind: kind }); P.forEach(function (q) { grow(q, 0); }); }
    if (B.apron > 0) rect(a0 - s * B.apron, -l.w / 2, l.w / 2, 'apron');   // 大船以上：棧橋邊往外一條平台，船靠平台外緣
    var fl = QUAY_FINGER[B.cls];
    if (B.fw > 0 && fl) { rect(a0 - s * fl, -l.w / 2, -l.w / 2 + B.fw / 2, 'finger'); rect(a0 - s * fl, l.w / 2 - B.fw / 2, l.w / 2, 'finger'); }   // 魚骨式：兩側各半根指形棧橋
  });
  return (T.quayObs = O);
}
/** 點 (x, z) 離線段 ab 最近的那一點 ⇒ [qx, qz]。 */
function quaySegPt(x, z, a, b) {
  var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 > 1e-9 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1) : 0;
  return [a[0] + dx * u, a[1] + dz * u];
}
/** 點 (x, z)、半徑 r 跟凸多邊形 P ⇒ { pen, n } ｜ null（沒碰到）；在裡面 ⇒ 從最近的那一條邊推出去。 */
function quayPoly(x, z, r, P) {
  var inside = true, bd = Infinity, bq = null, sgn = 0;
  for (var i = 0; i < P.length; i++) {
    var a = P[i], b = P[(i + 1) % P.length], cr = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (!sgn && Math.abs(cr) > 1e-9) sgn = cr > 0 ? 1 : -1; else if (sgn && cr * sgn < 0) inside = false;
    var q = quaySegPt(x, z, a, b), d = Math.hypot(x - q[0], z - q[1]);
    if (d < bd) { bd = d; bq = q; }
  }
  if (!bq) return null;
  if (inside) { var cx = 0, cz = 0; P.forEach(function (q) { cx += q[0] / P.length; cz += q[1] / P.length; }); var ox = bq[0] - cx, oz = bq[1] - cz, ol = Math.hypot(ox, oz) || 1; return { pen: r + bd, n: [ox / ol, oz / ol] }; }
  if (bd >= r) return null;
  return { pen: r - bd, n: bd > 1e-6 ? [(x - bq[0]) / bd, (z - bq[1]) / bd] : [0, 1] };
}
var QUAY_FINGER = { boat: 10, small: 28 };                             // 指形棧橋從棧橋邊伸幾公尺（BUILDING_SPEC §6.21、TOWN_BUILD §5.19.12；地塊沒記）
var QUAY_NAME = { quay: '碼頭石岸', mole: '石堤', wharf: '長碼頭', wlot: '水上建築的平台', apron: '泊位的平台', finger: '指形棧橋' };
/** 每一步（50_sim.js，擱淺之後；dt：這一小步幾秒）：上面說明的碰撞。 */
function quayStep(sh, dt) {
  if (!BED || !TOWNS.list.length || sh.sunk || sh.fixed || sh.moor || dockOn(sh)) return;
  var T = sh.T, M = sh.M, o = M4.pt(M, 0, 0, 0), ex = M4.pt(M, 1, 0, 0), vs = Math.hypot(ex[0] - o[0], ex[1] - o[1], ex[2] - o[2]), H = quayHull(T, vs);
  var c = sh.center || shipCenter(sh), reach = (T.wl1 - T.wl0) * vs / 2 + 30, best = 0, bn = null, bp = null, bk = '';
  for (var t = 0; t < TOWNS.list.length; t++) {
    var Tw = TOWNS.list[t]; if (!Tw.p || !Tw.E) continue;
    var O = quayObs(Tw);
    if (c[0] < O.bb[0] - reach || c[0] > O.bb[2] + reach || c[2] < O.bb[1] - reach || c[2] > O.bb[3] + reach) continue;
    for (var k = 0; k < H.length; k++) {
      var p = M4.pt(M, H[k][0], T.cy, T.zw), r = H[k][1] * vs, i, hit;
      for (i = 0; i < O.segs.length; i++) {
        var s = O.segs[i];
        if (Math.max(s.a[0], s.b[0]) + s.r + r < p[0] || Math.min(s.a[0], s.b[0]) - s.r - r > p[0] || Math.max(s.a[1], s.b[1]) + s.r + r < p[2] || Math.min(s.a[1], s.b[1]) - s.r - r > p[2]) continue;
        var q = quaySegPt(p[0], p[2], s.a, s.b), d = Math.hypot(p[0] - q[0], p[2] - q[1]), pen = r + s.r - d;
        if (pen > best) { best = pen; bn = d > 1e-6 ? [(p[0] - q[0]) / d, (p[2] - q[1]) / d] : [-Math.sin(sh.yaw), -Math.cos(sh.yaw)]; bp = p; bk = s.kind; }
      }
      for (i = 0; i < O.polys.length; i++) { hit = quayPoly(p[0], p[2], r, O.polys[i].P); if (hit && hit.pen > best) { best = hit.pen; bn = hit.n; bp = p; bk = O.polys[i].kind; } }
    }
  }
  if (!bn) { if (sh.quayHit) sh.quayHit = null; return; }
  var push = Math.min(best, QUAY_PUSH); sh.px += bn[0] * push; sh.pz += bn[1] * push;
  var F = fwd(sh.yaw), v0 = Math.abs(sh.spd), into = -(sh.spd < 0 ? -1 : 1) * (F[0] * bn[0] + F[2] * bn[1]);   // 船走的方向往它撞進去的那一份（1 ＝ 正面）
  if (into > 0) sh.spd *= 1 - into;
  var lever = (bp[0] - c[0]) * F[0] + (bp[2] - c[2]) * F[2], dF = -Math.sin(sh.yaw) * bn[0] - Math.cos(sh.yaw) * bn[1];   // 碰到的那一點在中心前（＋）後；yaw 變大時船頭往法線那一側走多少
  if (into > 0 && Math.abs(dF) > 1e-6) sh.yaw += (dF > 0 ? 1 : -1) * (lever >= 0 ? 1 : -1) * QUAY_TURN * into * dt;   // 碰到的那一頭（前 ⇒ 船頭、後 ⇒ 船尾）往離開它的那一側偏
  var first = !sh.quayHit;
  sh.quayHit = { t: SIMT, kind: bk, pen: +best.toFixed(2), t0: first ? SIMT : sh.quayHit.t0 };
  if (first) note(sh, '撞上' + (QUAY_NAME[bk] || '棧橋') + '（' + v0.toFixed(1) + ' m/s）', true);
}
/** 31_sailing.js（錨那一步之後）：繫在泊位上的船拉回去（上面的說明）。 */
function moorPull(sh, dt) {
  var m = sh.moor; if (!m) return;
  if (sh.sunk || (sh.i === PLAYER_I && (MODE !== 'town' || DOCK.run))) { sh.moor = null; return; }
  var c = shipCenter(sh);
  if (m.x == null) { m.x = c[0]; m.z = c[2]; m.yaw = sh.yaw; }
  var g = Math.min(1, MOOR_PULL * dt), dy = Math.atan2(Math.sin(m.yaw - sh.yaw), Math.cos(m.yaw - sh.yaw));
  sh.px += (m.x - c[0]) * g; sh.pz += (m.z - c[2]) * g; sh.yaw += dy * g; sh.yawRate = 0;
  sh.spd = 0; sh.vel = [0, 0, 0];
}
/** 讀數（__game.quay(i, r)）：第 i 艘（沒給 ＝ 我艦）的取樣點（世界、半徑）、繫泊、最後一次碰撞；離它的中心 r 公尺（沒給 ＝ 150）以內擋船的東西。⛔ 只讀。 */
function quayInfo(i, r) {
  var sh = SHIPS[i == null ? PLAYER_I : i]; if (!sh || !BED) return null;
  var T = sh.T, M = sh.M, o = M4.pt(M, 0, 0, 0), ex = M4.pt(M, 1, 0, 0), vs = Math.hypot(ex[0] - o[0], ex[1] - o[1], ex[2] - o[2]), H = quayHull(T, vs), c = shipCenter(sh), R = r || 150;
  function f(v) { return +v.toFixed(2); }
  function near(q) { return Math.hypot(q[0] - c[0], q[1] - c[2]) < R; }
  var obs = [];
  TOWNS.list.forEach(function (Tw) {
    if (!Tw.p || !Tw.E) return; var O = quayObs(Tw);
    O.segs.forEach(function (s) { var q = quaySegPt(c[0], c[2], s.a, s.b); if (near(q)) obs.push({ town: Tw.id, kind: s.kind, a: s.a.map(f), b: s.b.map(f), r: f(s.r) }); });
    O.polys.forEach(function (p) { if (p.P.some(near)) obs.push({ town: Tw.id, kind: p.kind, P: p.P.map(function (q) { return q.map(f); }) }); });
  });
  return { c: [f(c[0]), f(c[2])], yaw: f(sh.yaw), vs: +vs.toFixed(4), moor: sh.moor || null, hit: sh.quayHit || null,
    pts: H.map(function (h) { var p = M4.pt(M, h[0], T.cy, T.zw); return [f(p[0]), f(p[2]), f(h[1] * vs)]; }), obs: obs };
}
/** 我艦繫在停靠處 d（at ＝ 船的中心）。 */
function moorAt(sh, d) { if (sh && d) sh.moor = { x: d.at[0], z: d.at[1], yaw: d.yaw, dock: d.id }; }

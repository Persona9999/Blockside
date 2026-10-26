// ───────────────────────── 煙囪排煙（Tim 2026-10-15：維吉尼亞號、拿破崙號有煙囪，遊戲裡要冒煙）─────────────────────────
// 哪裡：雕刻作品裡煙囪的關聯（或外部模型）meta kind=funnel，固定點 smoke ＝ 排煙點（煙囪口的中心；造船規格 §9 kind 表）。
//   沒有 smoke ⇒ 從那個部件外框頂面的中心冒（匯入檢查報 ⚠）。
// 冒多少：額外動力在出力（全速前進、倒車：sh.power ≠ 0）⇒ 濃（每秒約 FN_ON 團）；停車（power 0）或沒有額外動力的船 ⇒ 淡（FN_IDLE）。
//   主機全壞（31_drive.js driveSurvey：sh.drive.C.fnOff）⇒ 每根都不冒；通這根的鍋爐全壞 ⇒ 這根不冒；額外動力一成都出不來（cap 0）⇒ 淡。
//   煙往上升、跟著風飄；煙囪口附近（排煙點水平 ±12 格、往下 6 格）的格子剩不到一半（煙囪被打斷）⇒ 不冒（每半秒數一次）；沉了、在沉 ⇒ 不冒。
// ⛔ 只給人看：自己一組亂數（不抽 rnd()）⇒ 戰局跟沒有煙囪一樣。物理設定「煙與水花」照樣少生幾顆（spawnPt）。
var FN_ON = 7, FN_IDLE = 1.5;
var RNG_FN = rngMake('funnel', 0x2F6B1D4D), rndFn = RNG_FN.f, rgFn = RNG_FN.r;   // 煙囪（00_core.js 亂數工廠；以前開局不重設 ⇒ 現在一起重設，只給人看）
/** 船型 T 的煙囪：[{ name, p: 排煙點（格座標）, pt: 有沒有登記 smoke }]（載入時算一次）。 */
function funnelsOf(T) {
  if (T.funnels) return T.funnels;
  var L = [];
  (T.h.parts || []).forEach(function (q) {
    if (!q.meta || q.meta.kind !== 'funnel') return;
    var s = q.points && q.points.smoke, b = q.box;
    L.push({ name: q.path, p: s ? s.slice() : [(b[0] + b[3] + 1) / 2, (b[1] + b[4] + 1) / 2, b[5] + 1], pt: !!s });   // 固定點已經是格心
  });
  (T.rig.models || []).forEach(function (m) {
    if (!m.meta || m.meta.kind !== 'funnel') return;
    var s = m.points && m.points.smoke, b = m.bbox;
    L.push({ name: m.name, p: s ? s.slice() : [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, b[5]], pt: !!s, model: m.name });
  });
  L.forEach(function (f) { if (!f.model) f.n0 = funnelCount(T.base, f.p); });
  return (T.funnels = L);
}
function funnelCount(G, p) {
  var x = Math.floor(p[0]), y = Math.floor(p[1]), z = Math.floor(p[2]), n = 0;
  for (var dz = -6; dz <= 0; dz++) for (var dy = -12; dy <= 12; dy++) for (var dx = -12; dx <= 12; dx++) if (G.get(x + dx, y + dy, z + dz)) n++;
  return n;
}
/** 每一步（50_sim.js，跟 stepPts 一起）：每艘還浮著的船、每根還在的煙囪照出力冒煙。 */
function funnelSmoke(dt) {
  SHIPS.forEach(function (sh) {
    var F = funnelsOf(sh.T); if (!F.length || sh.sunk || sh.sinkingFinal) return;
    var D = sh.drive, off = D && D.C && D.C.fnOff;
    var on = (+sh.cfg.base || 0) > 0 && (sh.power || 0) !== 0 && !(D && D.kind && D.cap <= 0), rate = (on ? FN_ON : FN_IDLE) * dt;
    var A = sh.fnAcc || (sh.fnAcc = F.map(function () { return 0; }));
    F.forEach(function (f, j) {
      if (off && off[j]) return;
      if (!funnelUp(sh, f, j)) return;
      A[j] += rate;
      while (A[j] >= 1) {
        A[j] -= 1;
        var w = M4.pt(sh.M, f.p[0], f.p[1], f.p[2]), g = on ? rgFn(0.14, 0.24) : rgFn(0.35, 0.5);
        var v = [sh.vel[0] * 0.3 + WIND[0] * 0.5 + rgFn(-0.6, 0.6), rgFn(2.2, 3.6), sh.vel[2] * 0.3 + WIND[2] * 0.5 + rgFn(-0.6, 0.6)];
        spawnPt([w[0] + rgFn(-0.3, 0.3), w[1] + 0.2, w[2] + rgFn(-0.3, 0.3)], v, rgFn(6, 9) / smokeK(), [g, g * 0.97, g * 0.94], on ? rgFn(0.45, 0.6) : rgFn(0.25, 0.35),
          rgFn(0.9, 1.3), rgFn(5, 8) * (on ? 1.2 : 0.8), -0.12, 0.35, 0);
      }
    });
  });
}
/** 煙囪還在嗎：煙囪口附近的格子還有原本的一半（每半秒數一次；⛔ 只看排煙點旁邊幾格：煙囪是空心的，口的正中間本來就沒有格子）。外部模型的煙囪 ⇒ 模型還在。 */
function funnelUp(sh, f, j) {
  if (f.model) { var m = sh.models.filter(function (q) { return q.path === f.model; })[0]; return !!(m && m.alive && !m.moved); }
  var U = sh.fnUp || (sh.fnUp = []);
  if (!U[j] || SIMT - U[j].t >= 0.5) U[j] = { t: SIMT, ok: f.n0 > 0 && funnelCount(sh.grid, f.p) * 2 >= f.n0 };
  return U[j].ok;
}
// ───────────────────────── 建築的煙囪（TASK-0990；Tim 2026-10-26：「是否可以讓建築也支援冒煙效果(參考船隻煙囪 標meta) 然後考慮性能只讓近處建築冒煙就好 可以先挑幾個生產建築測試」）─────────────────────────
// 哪裡：城鎮模型的固定點 smoke ＝ 煙囪口（Blocksail BUILDING_SPEC §3「遊戲從這裡冒煙（同 funnel 的 smoke）」；作者已經標好的，Blocksail tools/townmodels.py 照樣寫進索引的 pts）
//   ⇒ 每個實例照燈的那一條公式（63_towns.js townLightGen 的 W）換到世界；每座城一份（T.smk，T.inst 換了 ⇒ 重算）。
// 先開這幾種（TSMK_USE；加一行就開）：鐵匠鋪、麵包坊、磚窯、煉鐵場、蒸餾坊、糖廠、陶坊、伐木場（炭窯）。農莊的灶、住宅的煙囪（part-chimney）先不開。
//   濃淡〔設計〕照燒的東西：rate 每秒幾團、s0 → s1 煙團從多大長到多大（m）、life 秒、g 灰度（煤、焦炭深，木柴淺）、a 不透明。
// 只有近處：離鏡頭水平 TSMK_NEAR 公尺內全量、到 TSMK_FAR 照距離漸少到 0；同時冒的最多 TSMK_MAX 根（最近的先）；工地（63_townrise.js townRiseHides：還在蓋）不冒。
// ⛔ 只給人看：自己一組亂數（不抽 rnd()）、只讀城的實例。
var TSMK_NEAR = 80, TSMK_FAR = 150, TSMK_MAX = 16;
var TSMK_USE = {
  smithy:        { rate: 1.6, s0: 0.4, s1: 2.6, life: 6, g: 0.34, a: 0.4 },    // 鍛爐（煤）
  bakery:        { rate: 1.0, s0: 0.35, s1: 2.4, life: 5, g: 0.62, a: 0.3 },   // 麵包爐（木柴）
  brickworks:    { rate: 2.2, s0: 0.7, s1: 4.5, life: 7, g: 0.45, a: 0.45 },   // 磚窯
  ironworks:     { rate: 3, s0: 1, s1: 6, life: 8, g: 0.3, a: 0.55 },          // 高爐（木炭、焦）
  distillery:    { rate: 1.3, s0: 0.4, s1: 3, life: 6, g: 0.55, a: 0.35 },     // 蒸餾鍋的爐
  'sugar-works': { rate: 2, s0: 0.6, s1: 4, life: 7, g: 0.5, a: 0.4 },        // 煮糖房（燒蔗渣）
  pottery:       { rate: 1.6, s0: 0.5, s1: 3.5, life: 6, g: 0.5, a: 0.4 },     // 陶窯
  'lumber-camp': { rate: 1.2, s0: 0.6, s1: 3.5, life: 6, g: 0.62, a: 0.35 }    // 炭窯（悶燒，白一點）
};
var RNG_TS = rngMake('townsmoke', 0x7F4A7C15), tsmkRnd = RNG_TS.r;
/** 城 T 的冒煙點：[{ q 實例, U 那一種的濃淡, w 世界座標, acc }]（T.inst 換了 ⇒ 重算）。 */
function townSmokePts(T) {
  if (T.smk && T.smk.inst === T.inst) return T.smk.L;
  var K = TOWNS.kit, L = [];
  (T.inst || []).forEach(function (q) {
    var E = !q.wall && K && K.M[q.k]; if (!E) return;                    // K.M 只有解好的那幾款（沒解的那一棟本來就還沒畫）
    var m = E.m, s = m.pts && m.pts.smoke, U = TSMK_USE[m.use]; if (!s || !U || !(q.y === q.y)) return;
    var sn = Math.sin(q.th), c = Math.cos(q.th), mpv = m.mpv, J = q.mj || TOWN_J0, a = (s[0] * mpv - m.size[0] * mpv / 2) * q.sx, b = s[1] * mpv - m.size[1] * mpv / 2;
    L.push({ q: q, U: U, w: [q.x + a * sn - b * c, q.y + s[2] * mpv + J[2] * a, q.z - a * c - b * sn], acc: townHash(T.id + ':' + (q.lot || q.k) + ':smoke') });   // 公式同 townLightGen 的 W；acc 錯開 ⇒ 不會一起冒第一團
  });
  T.smk = { inst: T.inst, L: L };
  return L;
}
/** 每一步（viewStep，跟船的煙囪同一個順序）：鏡頭附近最多 TSMK_MAX 根照濃淡冒煙。 */
function townSmoke(dt) {
  if (!TOWNS.on || !TOWNS.list.length || !CAM.eye) return;
  var E = CAM.eye, C = [];
  TOWNS.list.forEach(function (T) {
    if (!T.inst) return;
    townSmokePts(T).forEach(function (o) { var d = Math.hypot(o.w[0] - E[0], o.w[2] - E[2]); if (d < TSMK_FAR && !townRiseHides(T, o.q)) C.push({ d: d, o: o }); });
  });
  TOWNS.stat.smoke = { near: C.length, on: Math.min(C.length, TSMK_MAX) };   // 讀數（__game.town）
  if (!C.length) return;
  C.sort(function (x, y) { return x.d - y.d; });
  for (var i = 0; i < C.length && i < TSMK_MAX; i++) {
    var o = C[i].o, U = o.U, k = C[i].d <= TSMK_NEAR ? 1 : (TSMK_FAR - C[i].d) / (TSMK_FAR - TSMK_NEAR);
    o.acc += U.rate * k * dt;
    while (o.acc >= 1) {
      o.acc -= 1;
      var g = U.g * tsmkRnd(0.9, 1.1), w = o.w;
      spawnPt([w[0] + tsmkRnd(-0.1, 0.1), w[1] + 0.1, w[2] + tsmkRnd(-0.1, 0.1)], [WIND[0] * 0.4 + tsmkRnd(-0.3, 0.3), tsmkRnd(1, 1.8), WIND[2] * 0.4 + tsmkRnd(-0.3, 0.3)],
        U.life * tsmkRnd(0.8, 1.2) / smokeK(), [g, g * 0.97, g * 0.94], U.a * tsmkRnd(0.85, 1.15), U.s0 * tsmkRnd(0.8, 1.2), U.s1 * tsmkRnd(0.8, 1.2), -0.06, 0.35, 0);
    }
  }
}
// 訂閱（TASK-0669：模擬層只發事件，00_events.js）
evOn('viewStep', funnelSmoke, 1, true);   // 碎木之後、粒子之前（自己的亂數 rndFn，不改戰局）
evOn('viewStep', townSmoke, 1, true);     // 建築的煙囪（自己的亂數 rgTs）

// ───────────────────────── 帆匠：補還掛著的破帆（TASK-0699；TASK-0676 拆出） ─────────────────────────
// Tim 2026-10-18：「先做帆匠：照提案，還掛著的破帆慢慢補回血量，整面掉了不補；照設施配員接」「帆匠可以參考木工 一樣要拿材料去修補(要來回跑)」
//   「不用每秒補 根據損傷計算修補時間 一次補回修好狀態」「帆的外觀&綁的纜索也要修復」「跟帆的那一端斷掉可以修」「另一端固定點沒了無法修(否則無法固定)」
//   「木匠跟帆匠修補完成可以廣播」
// 人數 ＝ 設施配員：帆布櫃（furniture 裡 role ＝ 'loft' 那一種）每件配 staff.sailmaker 位；船隻配置頁的 crew.sailmaker 是全船上限。
//   擺法、每船至少 auto 件、甲板擺不下就開戰時補在待命那一層、櫃旁走得到的點 —— 都跟木工台同一套（46_carpenter.js STATION_ROLES／benchNavFill／benchSpot）。
//   沒有帆布櫃這種道具（設定檔沒寫）⇒ 沒有帆匠（不生、不抽 rnd()，戰局跟以前一位元不差）。
// 帆布（跟木匠的木材同一套）：櫃裡存 furniture.loft.cloth 份，帆匠開戰帶滿 carry 份；補一點血量用一份、接回一條繩用 SM_ROPE_C 份。
//   身上用完、又有帆要補 ⇒ 走回走得到、還有存量、沒被打壞的帆布櫃，站 CARP_WOOD_T 秒拿到滿。手上抱著一捲帆布（41_crew_art.js heldItem 'canvas'）。
// 要補的帆：還掛著（!dead）、不是旗，而且 ① 血量不滿、② 綁在帆上的繩（s.lines）有斷了又接得回去的、③ 布被打穿過（物理開著才有：c.torn）其中一樣。
//   最破的先（血量比例），一樣破挑沿船長近的；一面帆一位帆匠。
// 怎麼補：走到那面帆中心底下、露天甲板（sh.weatherDeck）上走得到的那一點（露天 ⇒ 會被火槍打），站著修：
//   SM_T0 ＋ 補帆時間（細節設定，SAILFIX_T）× 缺的血量比例 ＋ SM_ROPE_T × 要接的繩數 秒 ⇒ 一次修好：血量回滿、繩接回去、布照作品的形狀重來（破洞、撕掉的布片都還原）。
//   帆布不夠 ⇒ 先把帶的那些補成血量（推力先回來），繩與外觀等拿了帆布回來一次修。修到一半帆掉了 ⇒ 作廢。
// 繩（Tim：「跟帆的那一端斷掉可以修」「另一端固定點沒了無法修」）：非帆那一端的每個依靠都還在才接 ——
//   綁的格還在（a／b）、綁的模型沒飛（mods，帆桁也是）、掛的那條繩沒斷（par；掛在同一面帆的另一條斷繩上 ⇒ 那條接得回去就一起接）。
//   被斷開的那一團帶走（moved）、開局就不畫（never／unfixed）、哪裡都不靠的 ⇒ 不接。垂下來的那條（spawnLoose，o.of）收掉。
// 帆匠倒下、陣亡 ⇒ 沒人補；走路、爬梯子、找路都照預備水手（42_hands.js stepHand／handRoute）。
var SM_T0 = 2, SM_ROPE_T = 3, SM_ROPE_C = 20;                               // 每次補帆的基本秒數；接一條繩多幾秒、用幾份帆布
/** 帆布櫃是哪一種道具（furniture 裡 role ＝ 'loft' 的第一種）；沒有 ⇒ null。 */
function loftIt() { return furnRoleIt('loft'); }
/** 開戰時（makeCrew，木匠之後）：照設施配員生帆匠（上限 sh.cw.sailmaker）—— 帆布櫃旁走得到的生在櫃旁，其他的在待命那一層（照順序平均分開，不抽 rnd()）。 */
function smInit(sh, crew, add) {
  var NV = sh.nav, it = loftIt(); sh.sm = null; sh.smWant = 0; sh.smSlots = 0;
  if (!it || !NV) return;
  var cap = Math.max(1, sh.cw.sailmaker || 0), C0 = carpHomeCells(sh), F = FURN[it];
  benchNavFill(sh, it, C0, 'lofts');                                    // 甲板、艙房擺的不夠預設件數 ⇒ 待命那一層補
  var B = sh.lofts || [], S = staffSlots([B.length ? B : [{ item: it }]], 'sailmaker'), n = Math.min(cap, S.length);
  sh.smWant = n; sh.smSlots = S.length;
  B.forEach(function (m) { m.spot = benchSpot(sh, m); m.cloth = Math.max(0, +F.cloth || 0); });   // spot：櫃旁走得到的那一點；cloth：存量
  if (B.length) NV.ladders.forEach(function (L) { L.q = 0; });          // handRoute 會記排隊人數；這裡只是試走
  var at = [], hn = 0;
  for (var q = 0; q < n; q++) { var bm = S[q].m.origin ? S[q].m : null; at.push(bm ? bm.spot : null); if (!at[q]) hn++; }
  if (!C0.length && hn) { sh.smWant = 0; return; }
  sh.sm = { sails: 0, hp: 0, ropes: 0, log: [], fetch: 0, used: 0 };     // sails：修好幾面；hp：補回多少血量；ropes：接回幾條繩；fetch：拿了幾趟帆布；used：從櫃裡拿走幾份
  for (var k = 0, h = 0; k < n; k++) {
    var lv = at[k] ? at[k].lv : NV.home, i = at[k] ? at[k].ci : C0[Math.floor((h++ + 0.5) / hn * C0.length)];
    add(ROLE.SAILMAKER, navPos(NV.levels[lv].N, i), null, 1);
    var c = crew[crew.length - 1]; c.art = ART_SAILMAKER; c.deck = NV.levels[lv].key; c.cloth = B.length ? Math.max(0, +F.carry || 0) : Infinity;   // 身上的帆布（一件櫃都沒有 ⇒ 不用）
    c.hand = { lv: lv, wait: 1 + k, legs: [], wp: null, k: 0, climb: null, job: null, to: null };
  }
}
/** 這條繩接得回去嗎：非帆那一端的依靠都還在（格、模型、母繩；母繩是同一面帆上斷了又接得回去的也算）。 */
/*  seen：這一串正在判的繩 —— 同一面帆的 sheet 與 tack 在帆角互相掛著（par 互指：jib.sheet-S ↔ sheet-P），斷一條另一條跟著斷；
 *  兩條一起接 ⇒ 互相算有靠（⛔ 不記 ⇒ 繞圈判到深度上限，兩條都判成接不回去）。 */
function smRopeOk(sh, j, s, seen) {
  var r = sh.ropes[j]; if (r.moved || r.never || r.unfixed) return false;
  var mods = r.mods || [], par = r.par || [];
  if (!(r.a >= 0 || r.b >= 0 || mods.length || par.length || r.tur)) return false;   // 另一端本來就沒有固定點
  if ((r.a >= 0 && !hullGp(sh.grid, r.a)) || (r.b >= 0 && !hullGp(sh.grid, r.b))) return false;
  if (mods.some(function (k) { return !sh.models[k] || !sh.models[k].alive; })) return false;
  seen = seen || {}; seen[j] = 1;
  return !par.some(function (p) { return sh.ropes[p].dead && !seen[p] && !(s.lines.indexOf(p) >= 0 && smRopeOk(sh, p, s, seen)); });
}
/** 這面帆要補什麼：{ hp：缺幾點血量, ropes：接得回去的斷繩, torn：布被打穿過 }。 */
function smNeed(sh, s) {
  var c = sh.cl && sh.cl[s.k], R = [];
  (s.lines || []).forEach(function (j) { var r = sh.ropes[j]; if ((r.dead || (sh.tCut && sh.tCut[j])) && smRopeOk(sh, j, s, null)) R.push(j); });
  return { hp: Math.max(0, Math.ceil(s.hpMax - s.hp - 1e-6)), ropes: R, torn: !!(c && c.torn) };
}
function smHas(N) { return N.hp > 0 || N.ropes.length > 0 || N.torn; }
/** 帆中心（船的座標，算一次）。 */
function smCenter(s) {
  if (s.smX === undefined) { var v = s.verts, x = 0, n = v.length / 3; for (var i = 0; i < v.length; i += 3) x += v[i]; s.smX = n ? x / n : 0; }
  return s.smX;
}
/** 補這面帆站在哪：露天甲板（走不到 ⇒ 走得到的最上面那層）上、帆中心底下最近的走路點 ⇒ { lv, ci }；沒有 ⇒ null。 */
function smSpot(sh, s) {
  var NV = sh.nav, lv = -1;
  NV.levels.forEach(function (L, i) { if (L.key === sh.weatherDeck && NV.reach.indexOf(i) >= 0) lv = i; });
  if (lv < 0) NV.reach.forEach(function (i) { if (i > lv) lv = i; });
  if (lv < 0) return null;
  var at = (NV.refreshN || 0) + ':' + lv; if (s.smSp && s.smSp.at === at && smSpotOk(NV, s.smSp)) return s.smSp;   // 尋路刷新之前不變 ⇒ 記著
  var Lv = NV.levels[lv], N = Lv.N, x = smCenter(s), p = [x, sh.T.cy, (Lv.zr[0] + Lv.zr[1]) / 2], ci = navSnap(N, p, 8);
  if (ci < 0) {                                                          // 帆中心底下附近沒有走路點（艏斜帆在船頭外、桅腳圍著東西）⇒ 這一層沿船長最近的那一點
    var bd = 1e9; N.cells.forEach(function (i) { if (!N.ok[i]) return; var q = navPos(N, i), d = Math.abs(q[0] - x) + 0.5 * Math.abs(q[1] - sh.T.cy); if (d < bd) { bd = d; ci = i; } });
  }
  return (s.smSp = ci >= 0 ? { lv: lv, ci: ci, at: at } : null);
}
function smSpotOk(NV, sp) { return !!NV.levels[sp.lv].N.ok[sp.ci]; }
/** 每次點名（survey）：閒著的帆匠接一面（最破的先，一樣破挑近的）；身上沒帆布 ⇒ 先回帆布櫃拿。 */
function smTick(sh) {
  var NV = sh.nav, K = sh.sm; if (!K || !NV || sh.struck || sh.sunk || sh.broken) return;
  var C = sh.crew.filter(function (c) { return c.role === ROLE.SAILMAKER && crewAble(c); }); if (!C.length) return;
  var taken = {}, L = null;
  C.forEach(function (c) { if (c.hand.job && c.hand.job.kind === 'sail') taken[c.hand.job.s.k] = 1; });
  C.forEach(function (c) {
    var H = c.hand; if (H.job || H.climb) return;
    var fr = handReg(sh, c); if (fr < 0) return;                         // 站在走路格外（剛爬上來、在路上）⇒ 下一次
    if (!(c.cloth > 0) || c.smShort) { smFetch(sh, c, fr); return; }   // smShort：上一面帶的不夠修完 ⇒ 先回去拿滿（⛔ 不回 ⇒ 剩 10 份接不了一條 20 份的繩，同一面一直重來）
    if (!L) L = sh.sails.filter(function (s) { return !s.dead && !s.flag && smHas(smNeed(sh, s)); });
    var cand = L.filter(function (s) { return !taken[s.k]; });
    cand.sort(function (a, b) { return a.hp / a.hpMax - b.hp / b.hpMax || Math.abs(smCenter(a) - c.pos[0]) - Math.abs(smCenter(b) - c.pos[0]); });
    for (var k = 0; k < cand.length && k < 4; k++) {                    // 同一面試不到（路斷了）⇒ 下一面
      var s = cand[k], sp = smSpot(sh, s); if (!sp) continue;
      var N = NV.levels[sp.lv].N, legs = handRoute(sh, H.lv, sp.lv, c.pos[0], navPos(N, sp.ci)[0], fr, N.reg[sp.ci]); if (!legs) continue;
      taken[s.k] = 1;
      H.job = { kind: 'sail', key: 'S' + s.k, s: s, lv: sp.lv, at: 0 };
      H.legs = legs.concat([{ w: sp.lv, to: sp.ci }]); H.wp = null; c.moving = false;
      return;
    }
  });
}
/** 身上沒帆布：走回走得到、還有存量、沒被打壞的帆布櫃（沿船長最近）；一件都沒有 ⇒ 閒著。 */
function smFetch(sh, c, fr) {
  var NV = sh.nav, H = c.hand, L = (sh.lofts || []).filter(function (m) { return m.alive && m.cloth > 0 && m.spot; });
  L.sort(function (a, b) { return Math.abs(a.c[0] - c.pos[0]) + 150 * Math.abs(a.spot.lv - H.lv) - Math.abs(b.c[0] - c.pos[0]) - 150 * Math.abs(b.spot.lv - H.lv); });
  for (var k = 0; k < L.length; k++) {
    var m = L[k], N = NV.levels[m.spot.lv].N, legs = handRoute(sh, H.lv, m.spot.lv, c.pos[0], navPos(N, m.spot.ci)[0], fr, N.reg[m.spot.ci]);
    if (!legs) continue;
    H.job = { kind: 'cloth', key: 'C' + m.k, m: m, lv: m.spot.lv, at: 0 };
    H.legs = legs.concat([{ w: m.spot.lv, to: m.spot.ci }]); H.wp = null; c.moving = false; return;
  }
}
/** 到了帆布櫃（42_hands.js handJoin）：站 CARP_WOOD_T 秒 ⇒ 拿到滿（櫃裡剩多少拿多少；櫃在這段時間被打壞 ⇒ 空手）。 */
function smCloth(sh, c) {
  var H = c.hand, J = H.job, m = J.m;
  if (!J.at) { if (H.lv !== J.lv) { H.job = null; H.wait = 0.5; return; } J.at = SIMT; c.home = c.pos.slice(); return; }
  if (SIMT - J.at < CARP_WOOD_T) return;
  var get = m.alive ? Math.min(Math.max(0, (+FURN[m.item].carry || 0) - c.cloth), m.cloth) : 0;
  m.cloth -= get; c.cloth += get; sh.sm.fetch++; sh.sm.used += get; c.smShort = false;
  H.job = null; H.wait = 0.5;
}
/** 到了帆底下（42_hands.js handJoin）：照損傷算好要修幾秒，站滿 ⇒ 一次修好（smFix）。不在那一層（路斷了）、帆掉了 ⇒ 作廢。 */
function smJoin(sh, c) {
  var H = c.hand, J = H.job, s = J.s;
  if (!J.at) {
    if (H.lv !== J.lv) { H.job = null; H.wait = 0.5; return; }
    var N0 = smNeed(sh, s); J.at = SIMT; c.home = c.pos.slice();
    J.T = SM_T0 + SAILFIX_T * N0.hp / s.hpMax + SM_ROPE_T * N0.ropes.length; return;
  }
  if (s.dead) { H.job = null; H.wait = 0.5; return; }
  if (SIMT - J.at < J.T) return;
  var Nd = smNeed(sh, s), W = { n: c.cloth, more: false }, n = smFix(sh, s, Nd, W), K = sh.sm;   // W：身上的帆布（用完 ⇒ more）
  c.cloth -= n; c.smShort = W.more;
  K.log.push({ t: +SIMT.toFixed(1), sail: s.name, hp: Nd.hp, ropes: Nd.ropes.length, torn: Nd.torn, used: n, more: W.more });
  if (!W.more && smHas(Nd)) {
    K.sails++; K.ropes += Nd.ropes.length;
    note(sh, '帆匠補好了帆（' + s.name + (Nd.ropes.length ? '，接回 ' + Nd.ropes.length + ' 條繩' : '') + '）');
  }
  H.job = null; H.wait = 0.5;
}
/** 修：帆布夠 ⇒ 血量回滿、繩接回去、布照作品的形狀重來；不夠 ⇒ 帶的全部補成血量（more）。回用了幾份帆布。 */
function smFix(sh, s, Nd, W) {
  var K = sh.sm, cost = Nd.hp + SM_ROPE_C * Nd.ropes.length;
  if (W.n < cost) { var h = Math.min(Nd.hp, Math.floor(W.n)); s.hp = Math.min(s.hpMax, s.hp + h); K.hp += h; W.more = true; return h; }
  s.hp = s.hpMax; K.hp += Nd.hp;
  for (var again = true; again;) {                                       // 掛在同一面帆另一條斷繩上的：那條接回來才接得上 ⇒ 一圈一圈接到不再變
    again = false;
    (s.lines || []).forEach(function (j) { var r = sh.ropes[j]; if ((r.dead || (sh.tCut && sh.tCut[j])) && smRopeOk(sh, j, s, null)) { smRopeBack(sh, j); again = true; } });
  }
  var c = sh.cl && sh.cl[s.k];
  if (c) { c.torn = false; c.tt = undefined; if (c.p && !c.hidden && !c.loose) c.p = null; }   // 下一步物理照作品的形狀重建這面布（30_rig_physics.js physStep：c.p 空 ⇒ clothInit）；收著的 ⇒ 再張開時是完整的
  return cost;
}
/** 接回一條繩：不斷、不再垂著（垂下來的那條收掉）、重畫。 */
function smRopeBack(sh, j) {
  var r = sh.ropes[j];
  r.dead = false; r.lz = false; r.cutL = null; r.offSail = null;
  if (sh.tCut) delete sh.tCut[j];
  if (sh.loose) sh.loose = sh.loose.filter(function (o) { return o.of !== r; });
  sh.rigDirty = true;
}
/** 讀數（__game.sm）：帆布櫃（中心、還在不在、走得到、存量）、帆匠 { want, slots, cap }、每位在哪一層、身上的帆布、在做什麼；修好幾面、補回多少血量、接回幾條繩、拿了幾趟。 */
function smInfo(sh) {
  var B = sh.lofts || [], C = sh.crew.filter(function (c) { return c.role === ROLE.SAILMAKER; }), K = sh.sm;
  return { want: sh.smWant || 0, slots: sh.smSlots || 0, cap: sh.cw.sailmaker || 0, sails: K ? K.sails : 0, hp: K ? K.hp : 0, ropes: K ? K.ropes : 0, fetch: K ? K.fetch : 0, used: K ? K.used : 0, log: K ? K.log.slice(-20) : [],
    lofts: B.map(function (m) { return { name: m.name, c: m.c.map(Math.round), alive: m.alive, reach: !!m.spot, cloth: m.cloth }; }),
    crew: C.map(function (c) { var J = c.hand && c.hand.job; return { deck: c.deck, st: c.st, cloth: isFinite(c.cloth) ? c.cloth : null, job: J ? J.kind : null, sail: J && J.s ? J.s.name : null }; }) };
}
/** HUD 一段：帆匠（在補／拿帆布、還能動、修好幾面、櫃裡還剩幾份帆布）。 */
function smText(sh) {
  if (!sh.sm) return '';
  var C = sh.crew.filter(function (c) { return c.role === ROLE.SAILMAKER && crewAble(c); }), w = C.filter(function (c) { return c.hand.job && c.hand.job.kind === 'sail'; }).length, g = C.filter(function (c) { return c.hand.job && c.hand.job.kind === 'cloth'; }).length;
  var B = sh.lofts || [], left = B.reduce(function (a, m) { return a + (m.alive ? m.cloth : 0); }, 0);
  return '　帆匠 ' + C.length + (w ? '（補 ' + w + '）' : '') + (g ? '（拿帆布 ' + g + '）' : '') + (sh.sm.sails ? '　補好帆 ' + sh.sm.sails : '') + (B.length ? '　帆布 ' + left : '');
}

// ───────────────────────── 站位（TASK-1225） ─────────────────────────
// Tim 2026-11-05：「站位全是照船寫的 … 是否可以手動指定站位 送藥手也是 可以想一套通用架構解決?(同時考慮效能)」「走路格應該是基於甲板(堡壘也可以把地板當成甲板」
// 軍官、陸戰隊、送藥手站哪裡，照順序從四個地方拿：
//   ① 手擺：船隻配置頁的甲板編輯器擺的站位物件（config furniture：role post、post ＝ 職位；跟火藥桶同一套 0.5 m 格與驗證，存在那一層甲板的擺法 ships[].rooms）；
//   ② 作品標的：固定點 post-<職位><號>（檔頭 points 或關聯的 points；z ＝ 腳踩的那一格）；
//   ③ 舊的船規則（40_crew.js makeCrew、23_powder.js makeMonkeys：照舵輪、中線 CY、兩舷成對的砲猜）；
//   ④ 照甲板自動補（只有堡壘、砲台 sh.fixed —— 船的猜法對它們不成立）：先用作品的駐軍工作點 work-*（城鎮工人同一批點，63_townfolk.js；高的先），
//      再在那一層甲板的走路格（42_hands.js navBuild：照甲板 meta 一層一層建）裡挑。
//   ①② 是明寫的 ⇒ 先用；沒寫 ⇒ 船照舊（戰局逐位元不變）。④ 只補 ③ 站不滿的那幾個。
// 效能（2026-11-05 量：開局擺人 憲法號 359 人 5.4 ms、加拉塔堡 28 人 0.4 ms；走路格 憲法號 4 層 118 ms、加拉塔堡 2 層 13 ms）：
//   走路格同一型只建一次（T.navC）；這裡只在現成的格裡挑點，一層約一萬點、挑一次 O(點數)。①② 是查表。
var POST_ROLES = ['officer', 'monkey', 'marine'], POST_GAP = 6, POST_RE = /^post-([a-z]+)\d*$/, POST_WORK_RE = /^work-[a-z]?\d+$/;   // POST_GAP：自動挑的兩點至少隔幾格（0.6 m；⛔ 擠在同一點 ⇒ 幾張人疊成一個）
/** 明寫的站位（①②）：[{ at: [x, y, z], deck: 砲甲板的 key 或 null, src: 'deck'｜'pt' }]。手擺的照配置頁現在的擺法（每場現算：幾層 × 幾件），作品的記在船型上。 */
function postsOf(sh, role) {
  var T = sh.T, out = [];
  (sh.decks || []).forEach(function (D) {
    var pl = deckPlan(T.id, deckId(D)); if (!pl.items) return;
    var G = deckGrid(T, D);
    roomCheck(T, { grid: G }, 'deck', pl.items).items.forEach(function (q) {
      var f = FURN[q.it]; if (!f || f.role !== 'post' || f.post !== role) return;
      out.push({ at: [G.x0 + q.x * ROOM_TILE + 2, G.y0 + q.y * ROOM_TILE + 2, G.zt[q.x + q.y * G.nx]], deck: D.key, src: 'deck' });
    });
  });
  return out.concat(postPts(T).filter(function (p) { return p.role === role; }).map(function (p) { return { at: p.at, deck: postDeck(sh, p.at), src: 'pt' }; }));
}
/** 作品裡的站位固定點（post-<職位><號>）與駐軍工作點（work-*，role ''）：[{ name, role, at }]（記在船型上）。 */
function postPts(T) {
  if (T.postPts) return T.postPts;
  var out = [];
  function scan(P) { Object.keys(P || {}).sort().forEach(function (k) {
    var v = P[k], m = POST_RE.exec(k); if (!v) return;
    var at = [Math.floor(v[0]), Math.floor(v[1]), Math.floor(v[2])];
    if (m && POST_ROLES.indexOf(m[1]) >= 0) out.push({ name: k, role: m[1], at: at });
    else if (POST_WORK_RE.test(k)) out.push({ name: k, role: '', at: at });
  }); }
  scan(T.h.points); (T.h.parts || []).forEach(function (p) { scan(p.points); });
  return T.postPts = out;
}
/** 那一點在哪一層砲甲板（照高度範圍；量不到 ⇒ null）。 */
function postDeck(sh, p) { var D = (sh.decks || []).filter(function (D) { return p[2] >= D.zr[0] - 2 && p[2] <= D.zr[1] + 2; })[0]; return D ? D.key : null; }
/** 那一層砲甲板（key）的走路格（42_hands.js navBuild；同一型同一層只建一次，沒有預備水手的船型開局不建 ⇒ 這裡要用才建）。
 *  CREW_BLOCK 換成這一艘的、建完換回去（擺取用點時還沒進 makeCrew、檢查頁可能是別艘的）。 */
function deckNav(sh, key) {
  var L = navLevels(sh, shipLadders(sh.T)).filter(function (l) { return l.key === key; })[0]; if (!L) return null;
  var keep = CREW_BLOCK; CREW_BLOCK = crewBlockOf(sh); var N = navBuild(sh, L); CREW_BLOCK = keep; return N;
}
/** crew 裡那一種職位幾個。 */
function cntRole(crew, r) { var n = 0; for (var i = 0; i < crew.length; i++) if (crew[i].role === r) n++; return n; }
/** 在 p 那一點（±2 格、上下 2 格）站上去 ⇒ 站位；站不住、有人、在模型裡 ⇒ null。 */
function postStand(g, p, taken) { return standNear(g, Math.floor(p[0]), Math.floor(p[1]), p[2] - 2, p[2] + 2, 14, taken, 2); }
/** ④ 照甲板自動補 n 個站位（只有 sh.fixed）：先用駐軍工作點（高的先），再在走路格裡挑。
 *  officer：最高那一層、離旗（固定點 flag）或那一層重心最近的先；marine：每一層走路格的外緣（牆頂靠胸牆那一圈）；其他：離 near 最近的。 */
function postFill(sh, g, taken, role, n, near) {
  var out = []; if (n <= 0 || !sh.fixed) return out;
  if (role !== 'monkey') postPts(sh.T).filter(function (p) { return !p.role; }).slice().sort(function (a, b) { return b.at[2] - a.at[2] || (a.name < b.name ? -1 : 1); }).forEach(function (p) {
    if (out.length < n) { var at = postStand(g, p.at, taken); if (at) out.push(at); }
  });
  if (out.length >= n) return out;
  var Ls = navLevels(sh, shipLadders(sh.T)).filter(function (L) { return !L.tur; }); if (!Ls.length) return out;
  if (role === 'officer') Ls = [Ls[Ls.length - 1]].concat(Ls.slice(0, -1).reverse());   // 最高那一層先
  var flag = sh.T.h.points && sh.T.h.points.flag, picked = [];
  Ls.forEach(function (L) {
    if (out.length >= n) return;
    var N = navBuild(sh, L), C = N.cells.filter(function (i) { return N.reg[i] === N.big; }); if (!C.length) return;
    var tgt = near || (role === 'officer' && flag ? flag : null);
    if (!tgt) { var sx = 0, sy = 0; C.forEach(function (i) { var p = navPos(N, i); sx += p[0]; sy += p[1]; }); tgt = [sx / C.length, sy / C.length]; }
    if (role === 'marine') C = C.filter(function (i) { for (var d = 0; d < 8; d++) if (navStep(N, i, d) < 0) return true; return false; });   // 外緣：有一邊走不出去
    C = C.map(function (i) { var p = navPos(N, i); return [Math.hypot(p[0] - tgt[0], p[1] - tgt[1]), i, p]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    for (var k = 0; k < C.length && out.length < n; k++) {
      var p = C[k][2]; if (picked.some(function (q) { return Math.abs(q[0] - p[0]) < POST_GAP && Math.abs(q[1] - p[1]) < POST_GAP && Math.abs(q[2] - p[2]) < 8; })) continue;
      var at = standNear(g, Math.floor(p[0]), Math.floor(p[1]), p[2] - 1, p[2] + 1, 14, taken, 0); if (!at) continue;
      picked.push(at); out.push(at);
    }
  });
  return out;
}
/** 堡壘的送藥手（取代 23_powder.js makeMonkeys 的「同一個 x 的兩舷一對砲」）：每門砲照 stationPick 認一個取用點 ⇒ 同一層、同一個取用點的砲分一組，
 *  組裡照離取用點的遠近兩門一對 ⇒ 每一對 cw.monkeys 個（sh.pmWant 照它數）；家 ＝ 手擺／作品標的 monkey 站位（離那一對最近的）⇒ 沒有 ⇒ 取用點與那一對砲尾之間、同一塊走路格上。 */
function postMonkeys(sh, crew, taken, add) {
  var g = navBase(sh.T), mine = postsOf(sh, 'monkey'), used = {}, groups = {}, order = [];
  sh.guns.forEach(function (gn) { monkeyDrop(sh, gn); });
  sh.guns.forEach(function (gn) {
    var deck = gunDeck(gn), st = stationPick(sh, deck, gn), k = deck + ':' + (st ? sh.stations.indexOf(st) : -1);
    if (!groups[k]) { groups[k] = { deck: deck, st: st, guns: [] }; order.push(k); }
    groups[k].guns.push(gn);
  });
  var Ls = navLevels(sh, shipLadders(sh.T)).filter(function (L) { return !L.tur; });
  order.forEach(function (k) {
    var G = groups[k], S = G.st ? G.st.at : null;
    function dist(gn) { var p = gn.drop || gn.model.c; return S ? Math.hypot(p[0] - S[0], p[1] - S[1]) : 0; }
    var gs = G.guns.slice().sort(function (a, b) { return dist(a) - dist(b); });
    for (var j = 0; j < gs.length; j += 2) {
      var two = gs.slice(j, j + 2), mx = 0, my = 0, mz = 0;
      two.forEach(function (gn) { var p = gn.drop || gn.model.c; mx += p[0] / two.length; my += p[1] / two.length; mz += p[2] / two.length; });
      var tgt = S ? [(mx + S[0]) / 2, (my + S[1]) / 2, mz] : [mx, my, mz];
      sh.pmWant += sh.cw.monkeys;
      for (var m = 0; m < sh.cw.monkeys; m++) {
        var at = null, best = -1, bd = 1e9;
        mine.forEach(function (p, i) { if (used[i] || (p.deck && p.deck !== G.deck)) return; var d = Math.hypot(p.at[0] - tgt[0], p.at[1] - tgt[1]); if (d < bd) { bd = d; best = i; } });
        if (best >= 0) { used[best] = 1; at = postStand(g, mine[best].at, taken); }
        if (!at) at = postNavNear(sh, Ls, g, taken, tgt, S);
        if (!at) at = standNear(g, Math.floor(tgt[0]), Math.floor(tgt[1]), Math.floor(mz) - 3, Math.floor(mz) + 3, 12, taken, 8);
        if (!at) continue;
        add(ROLE.POWDER, at, null, 1);
        var c = crew[crew.length - 1]; c.deck = G.deck; c.guns = two; c.pm = { st: 'idle', t: 0 }; c.cart = false;
        two.forEach(function (gn) { if (!gn.pm) gn.pm = c; });
      }
    }
  });
}
/** tgt 那一層走路格上離它最近、跟取用點 S 同一塊（S 沒有 ⇒ 最大那一塊）、站得上去的一點。 */
function postNavNear(sh, Ls, g, taken, tgt, S) {
  var li = lvOf(Ls, Math.round(tgt[2])); if (li < 0) return null;
  var N = navBuild(sh, Ls[li]), si = S ? navSnap(N, S, 4) : -1, reg = si >= 0 ? N.reg[si] : N.big;
  var C = N.cells.filter(function (i) { return N.reg[i] === reg; }).map(function (i) { var p = navPos(N, i); return [Math.hypot(p[0] - tgt[0], p[1] - tgt[1]), i, p]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  for (var k = 0; k < C.length && k < 400; k++) { var p = C[k][2], at = standNear(g, Math.floor(p[0]), Math.floor(p[1]), p[2] - 1, p[2] + 1, 12, taken, 0); if (at) return at; }
  return null;
}

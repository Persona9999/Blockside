// ───────────────────────── 方舷放置：存檔、經濟公式、買東西、轉生、離線 ─────────────────────────
(function (I) {
  'use strict';
  var B = I.BAL;

  // ── 存檔 ──
  function fresh() {
    return {
      v: 1, blocks: 0, blocksRun: 0, blocksAll: 0,                 // 格：手上的、這一輪打下來的、全部打下來的
      zone: 1, maxZone: 1, bestZone: 1, farm: 0,                   // 現在的海域、這一輪最遠、有史以來最遠；farm ＝ 打輸退下來之後贏了幾場
      upg: {}, slots: 1, fleet: ['flyingfish'], own: { flyingfish: 1 }, bp: { flyingfish: 1 },   // own：會造的船；bp：拿到的藍圖（擊敗過那一型）
      doctrine: 'sink', shards: 0, shardsAll: 0, tech: {}, ach: {},
      st: { sunk: 0, cap: 0, boom: 0, bites: 0, battles: 0, wins: 0, losses: 0, pres: 0, playSec: 0, clean: 0, blitz: 0, under: 0 },
      auto: true, speed: 1, gfx: 'mid', mute: false, bgm: 0.35, cam: 'auto', mate: true, seen: 0,
      rate: 0, lastSeen: 0, created: Date.now()
    };
  }
  I.fresh = fresh;
  I.S = fresh();
  function merge(f, o) {
    Object.keys(o).forEach(function (k) {
      if (f[k] && typeof f[k] === 'object' && !Array.isArray(f[k]) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) Object.assign(f[k], o[k]);
      else f[k] = o[k];
    });
    return f;
  }
  I.load = function () {
    var o = I.store.get(I.SAVE_KEY);
    if (o && o.v === 1) I.S = merge(fresh(), o);
    var S = I.S;
    S.fleet = S.fleet.filter(function (id) { return S.own[id] && I.cardOf(id); }).slice(0, S.slots);
    if (!S.fleet.length) S.fleet = ['flyingfish'];
    return S;
  };
  I.save = function () { I.S.lastSeen = Date.now(); return I.store.set(I.SAVE_KEY, I.S); };
  I.wipe = function () { I.store.del(I.SAVE_KEY); I.S = fresh(); };

  // ── 船型（核心的選船卡片：排水量、砲、船員）──
  I.CARDS = {};
  I.NAMES = {};
  I.AUTHORS = {};
  I.initHulls = function () {
    (I.core ? I.core.hulls() : []).forEach(function (h) { I.CARDS[h.id] = h.card || {}; I.NAMES[h.id] = h.name; I.AUTHORS[h.id] = h.author; });
  };
  I.cardOf = function (id) { return I.CARDS[id] || null; };
  I.tons = function (id) { var c = I.CARDS[id]; return c && c.tons || 80; };
  I.nameOf = function (id) { return I.NAMES[id] || id; };

  // ── 等級與倍率 ──
  I.lv = function (id) { return I.S.upg[id] || 0; };
  I.tlv = function (id) { return I.S.tech[id] || 0; };
  I.upgDef = function (id) { return I.UPG.filter(function (u) { return u.id === id; })[0]; };
  I.techDef = function (id) { return I.TECH.filter(function (u) { return u.id === id; })[0]; };
  function eff(id) { var u = I.upgDef(id); return Math.pow(u.eff, I.lv(id)); }
  I.achMul = function () { return Math.pow(1.03, Object.keys(I.S.ach).length); };
  I.shardMul = function () { return 1 + 0.1 * I.S.shardsAll; };
  I.frenzyOn = function () { return I.now() < (I.BT && I.BT.frenzyUntil || 0); };
  I.incomeMul = function () { return I.achMul() * I.shardMul() * (I.frenzyOn() ? 3 : 1); };
  I.atk = function () { return eff('gun') * Math.pow(1.5, I.tlv('trident')); };
  I.def = function () { return eff('hull') * Math.pow(1.5, I.tlv('coral')); };
  I.valueMul = function () { return eff('value'); };
  I.bountyMul = function () { return eff('bounty'); };
  I.reloadT = function () { return B.myReload0 * eff('reload'); };
  I.strikeAt = function () { return Math.max(B.strikeMin, B.strike0 * eff('fear')); };
  I.powderK = function () { return eff('powder'); };
  I.boomMul = function () { return 1 + 0.2 * I.lv('powder'); };
  I.biteR = function () { return 3 + I.lv('teeth'); };
  I.biteMul = function () { return eff('teeth'); };
  I.pumpK = function () { return eff('pump'); };
  I.floodK = function () { return Math.pow(0.96, I.lv('pump')); };
  I.sailK = function () { return eff('sail'); };
  I.offlineEff = function () { return Math.min(1, B.offlineBase + 0.15 * I.tlv('dream')); };
  I.cdMul = function () { return Math.pow(0.85, I.tlv('instinct')); };
  I.speedMax = function () { return 2 + I.tlv('tide'); };

  // ── 海域 ──
  I.region = function (N) {
    var r = Math.floor((N - 1) / 10);
    if (r < I.REGIONS.length) return I.REGIONS[r];
    var base = I.REGIONS[2 + (r - I.REGIONS.length) % (I.REGIONS.length - 2)], depth = r - I.REGIONS.length + 1;
    return { name: I.ABYSS.name + ' ' + depth, ico: I.ABYSS.ico, wx: ['storm', 'clear', 'maelstrom'][r % 3], pool: base.pool, boss: base.boss, say: I.ABYSS.say };
  };
  I.zoneLv = function (N) { return Math.pow(B.lvGrow, N - 1) * (N % 10 === 0 ? B.bossLv : 1) * Math.min(1, B.early0 + (1 - B.early0) * (N - 1) / 10); };   // 新手海：前 10 個海域敵艦弱一點
  I.blockVal = function (N) { return Math.pow(B.vGrow, N - 1); };
  function seeded(s) { return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
  /** 一個海域的編成（照海域號碼定 ⇒ 同一個海域每次都是同一批）。 */
  I.zone = function (N) {
    var R = I.region(N), boss = N % 10 === 0, k = (N - 1) % 10, rg = Math.floor((N - 1) / 10), rnd = seeded(N * 7919 + 13);
    var n = boss ? 1 + Math.min(2, Math.floor(rg / 2)) : I.clamp(1 + Math.floor(k / 4) + Math.floor(rg / 2), 1, 5), foes = [];
    if (boss) foes.push(R.boss);
    var P = R.pool, want = k / 9 * (P.length - 1);
    while (foes.length < n) {
      var w = P.map(function (id, i) { return Math.exp(-Math.pow(i - want, 2) / 0.9) + 0.05; }), tot = w.reduce(function (a, b) { return a + b; }, 0), x = rnd() * tot, j = 0;
      while (j < P.length - 1 && (x -= w[j]) > 0) j++;
      foes.push(P[j]);
    }
    return { n: N, R: R, region: rg, boss: boss, foes: foes, lv: I.zoneLv(N), wx: R.wx, map: R.map || '', site: R.site || 0, timeout: B.timeout0 + B.timeoutPer * foes.length };
  };
  /** 那一型第一次在哪個海域出現（藍圖、造價照它）。 */
  var FZ = null;
  I.firstZone = function (id) {
    if (!FZ) {
      FZ = {};
      Object.keys(I.GIFTS).forEach(function (g) { FZ[g] = Math.max(1, I.GIFTS[g]); });
      for (var N = 1; N <= 90; N++) I.zone(N).foes.forEach(function (f) { if (!FZ[f]) FZ[f] = N; });
    }
    return FZ[id] || 99;
  };

  // ── 收入 ──
  I.gain = function (amt, why) {
    if (!(amt > 0)) return 0;
    var S = I.S; S.blocks += amt; S.blocksRun += amt; S.blocksAll += amt;
    I.emit('gain', amt, why);
    return amt;
  };
  I.spend = function (amt) { if (I.S.blocks < amt) return false; I.S.blocks -= amt; return true; };
  /** 一艘敵艦的身價（還沒乘升級與收入倍率；BAL 那一段）。 */
  I.pool = function (id, N, boss) { return I.blockVal(N) * B.poolK * Math.pow(Math.max(5, I.tons(id)), B.poolExp) * (boss ? B.bossK : 1); };

  // ── 升級 ──
  I.upgCost = function (u, L) { return Math.ceil(u.c0 * Math.pow(u.g, L === undefined ? I.lv(u.id) : L)); };
  I.upgMaxed = function (u) { return u.max > 0 && I.lv(u.id) >= u.max; };
  /** 買 n 級（Infinity ＝ 買得起的全部）；回買了幾級。 */
  I.buyUpg = function (id, n) {
    var u = I.upgDef(id), k = 0;
    while (k < n && !I.upgMaxed(u)) {
      var c = I.upgCost(u); if (!I.spend(c)) break;
      I.S.upg[id] = I.lv(id) + 1; k++;
    }
    if (k) I.emit('buy', 'upg', id, k);
    return k;
  };
  /** n 級要多少（沒上限時照算；到上限就停）。 */
  I.upgCostN = function (u, n) { var L = I.lv(u.id), c = 0; for (var i = 0; i < n && !(u.max > 0 && L + i >= u.max); i++) c += I.upgCost(u, L + i); return c; };
  I.upgAfford = function (u) { var L = I.lv(u.id), have = I.S.blocks, k = 0; while (!(u.max > 0 && L + k >= u.max)) { var c = I.upgCost(u, L + k); if (have < c) break; have -= c; k++; if (k > 999) break; } return k; };

  // ── 深海科技 ──
  I.techCost = function (t) { return Math.ceil(t.c0 * Math.pow(t.g, I.tlv(t.id))); };
  I.buyTech = function (id) {
    var t = I.techDef(id); if (t.max > 0 && I.tlv(id) >= t.max) return false;
    var c = I.techCost(t); if (I.S.shards < c) return false;
    I.S.shards -= c; I.S.tech[id] = I.tlv(id) + 1; I.emit('buy', 'tech', id, 1);
    return true;
  };

  // ── 船與艦隊 ──
  I.shipPrice = function (id) {
    if (id === 'flyingfish') return 0;
    var p = B.shipK * Math.pow(I.tons(id) / 50, B.shipTonExp) * Math.pow(B.shipGrow, I.firstZone(id) - 1);
    var e = Math.pow(10, Math.floor(Math.log10(p)) - 1); return Math.round(p / e) * e;   // 留兩位有效數字
  };
  I.shipList = function () {   // 船塢列的：拿到藍圖的、會造的，照造價排
    var L = Object.keys(I.CARDS).filter(function (id) { return I.firstZone(id) < 99; });
    return L.sort(function (a, b) { return I.shipPrice(a) - I.shipPrice(b); });
  };
  I.buyShip = function (id) {
    var S = I.S; if (S.own[id] || !S.bp[id]) return false;
    if (!I.spend(I.shipPrice(id))) return false;
    S.own[id] = 1;
    if (S.fleet.length < S.slots) S.fleet.push(id);
    else { var w = 0; S.fleet.forEach(function (f, i) { if (I.tons(f) < I.tons(S.fleet[w])) w = i; }); if (I.tons(id) > I.tons(S.fleet[w])) S.fleet[w] = id; }
    I.emit('buy', 'ship', id, 1);
    return true;
  };
  I.slotPrice = function () { var n = I.S.slots; return n < B.slotPrice.length ? B.slotPrice[n] : Infinity; };
  I.buySlot = function () {
    var S = I.S, p = I.slotPrice(); if (!isFinite(p) || !I.spend(p)) return false;
    S.slots++;
    var best = Object.keys(S.own).sort(function (a, b) { return I.tons(b) - I.tons(a); })[0];   // 新的位置先放手上最大的那一型
    if (best && S.fleet.length < S.slots) S.fleet.push(best);
    I.emit('buy', 'slot', S.slots, 1);
    return true;
  };
  I.setSlot = function (i, id) { var S = I.S; if (!S.own[id] || i < 0 || i >= S.slots) return; if (i < S.fleet.length) S.fleet[i] = id; else S.fleet.push(id); I.emit('fleet'); };

  // ── 轉生：潛回亞特蘭提斯 ──
  I.shardsFor = function (z) { return z < B.shardZone ? 0 : Math.floor(0.6 * Math.pow(z - 15, 1.25)); };
  I.canPrestige = function () { return I.shardsFor(I.S.maxZone) > 0; };
  I.startZone = function () { return Math.max(1, Math.min(1 + 5 * I.tlv('current'), Math.floor(I.S.bestZone / 2))); };
  I.prestige = function () {
    var S = I.S, g = I.shardsFor(S.maxZone); if (!g) return 0;
    S.shards += g; S.shardsAll += g; S.st.pres++;
    S.blocks = I.tlv('chest') ? 1000 * Math.pow(10, I.tlv('chest')) : 0; S.blocksRun = 0; S.upg = {};
    S.zone = S.maxZone = I.startZone(); S.farm = 0;
    if (!I.tlv('yard')) { S.slots = 1; S.fleet = ['flyingfish']; S.own = { flyingfish: 1 }; }
    I.emit('prestige', g);
    return g;
  };

  // ── 離線 ──
  I.offline = function (sec) {
    sec = Math.min(sec, B.offlineCap);
    var g = I.S.rate * sec * I.offlineEff();
    return { sec: sec, gain: g > 0 ? g : 0 };
  };

  // ── 成就 ──
  I.checkAch = function () {
    I.ACH.forEach(function (a) { if (!I.S.ach[a.id] && a.t(I.S)) { I.S.ach[a.id] = Date.now(); I.emit('ach', a); } });
  };

  // ── 自動航海士：買最便宜的那一項（只在開了科技、設定沒關的時候）──
  I.mateTick = function () {
    if (!I.tlv('mate') || !I.S.mate) return;
    var best = null, bc = Infinity;
    I.UPG.forEach(function (u) { if (I.upgMaxed(u)) return; var c = I.upgCost(u); if (c < bc) { bc = c; best = u; } });
    if (best && I.S.blocks >= bc) I.buyUpg(best.id, 1);
  };
})(window.BSI = window.BSI || {});

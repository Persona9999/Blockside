// ───────────────────────── 方舷放置：一場一場打（跟核心講話的都在這裡） ─────────────────────────
// 一個海域 ＝ 一場：我方艦隊對那個海域的敵艦（同時在場最多 BAL.fieldFoes 艘，其他的一波一波補上）。
// 強度：火力比 atkR ＝ 我方火力 ÷ 海域強度、船堅比 defR ＝ 我方船堅 ÷ 海域強度 —— 數字可以一直變大，可是換成模擬裡的東西（硬度、每發傷害）都夾在範圍內，
//   ⇒ 戰局永遠是正常的物理，只是跟得上的時候打得快、跟不上的時候打不穿。
// 收入：每一格敵艦被打掉（核心的 sh.lost）就換成格；擊沉、俘獲、殉爆另外有賞金。
(function (I) {
  'use strict';
  var C = I.core, B = I.BAL;
  var BT = I.BT = { phase: 'idle', Z: null, startWall: 0, holdUntil: 0, result: null, income: 0, wave: [], waveN: 0, frenzyUntil: 0, repairUntil: 0,
    myDmg: 1, foeDmg: 1, myHard: 1, eHard: 1, myHole: 1, foeHole: 1, atkR: 1, defR: 1, myLost0: 0, kills: [], seq: 0 };

  if (!C) return;

  // 開火那一刻改那一顆：傷害（砲、帆、人）與打到船殼的洞多大（核心 21_gunnery.js：洞的半徑 ＝ 3.4～4.6 ×（big ? 1.25 : hole）× 硬度^−¼；big 只在那裡用）
  C.on('rptShot', function (sh, g, b) {
    if (BT.phase !== 'fight' || !b) return;
    var mine = sh.team === 'blue';
    if (b.dmg > 0) b.dmg *= mine ? BT.myDmg : BT.foeDmg;
    b.hole = (b.big ? 1.25 : b.hole || 1) * (mine ? BT.myHole : BT.foeHole); b.big = false;
  });
  // 殉爆（核心 73_slowmo 的慢動作同一個事件）
  C.on('blast', function (sh) { if ((BT.phase === 'fight' || BT.phase === 'hold') && sh && sh.team === 'red' && sh.bsi) onBoom(sh); });
  // 廣播（重要的才收；UI 的訊息列）
  C.on('note', function (sh, text, imp) { if (imp && BT.phase !== 'idle' && sh) I.emit('note', sh, text); });

  function mapNow() { var q = new URLSearchParams(location.search); return { map: q.get('map') || '', site: +(q.get('site') || 0) }; }
  I.mapNow = mapNow;
  I.preload = function (ids) {
    var L = ids.filter(function (id, i) { return ids.indexOf(id) === i && !C.loaded(id); });
    return L.reduce(function (p, id) { return p.then(function () { I.emit('loading', id); return C.loadHull(id); }); }, Promise.resolve());
  };

  /** 開打第 N 個海域。海圖不是現在這一張 ⇒ 交給主程式重新載入。 */
  I.startZone = function (N) {
    var S = I.S, Z = I.zone(N), M = mapNow(), seq = ++BT.seq;
    if (Z.map !== M.map || (Z.map && Z.site !== M.site)) { BT.phase = 'reload'; I.emit('reload', Z); return; }
    BT.phase = 'loading'; BT.Z = Z; BT.result = null; BT.income = 0; BT.kills = []; BT.bossSeen = false;
    var mine = S.fleet.filter(function (id) { return S.own[id] && I.cardOf(id); }).slice(0, S.slots);
    if (!mine.length) mine = ['flyingfish'];
    I.emit('zoneLoad', Z);
    return I.preload(mine.concat(Z.foes)).then(function () {
      if (seq !== BT.seq) return;                                   // 中途又換了海域
      BT.atkR = I.atk() / Z.lv; BT.defR = I.def() / Z.lv;
      BT.myDmg = I.clamp(Math.pow(BT.atkR, B.atkExp), B.dmgMin, B.dmgMax); BT.eHard = I.clamp(Math.pow(BT.atkR, -B.atkExp), B.hardMin, B.hardMax);
      BT.myHard = I.clamp(Math.pow(BT.defR, B.defExp), B.hardMin, B.hardMax); BT.foeDmg = I.clamp(Math.pow(BT.defR, -B.defExp), B.dmgMin, B.dmgMax);
      BT.myHole = I.clamp(B.myHole * Math.pow(BT.atkR, B.holeExp), B.holeMin, B.holeMax); BT.foeHole = I.clamp(Math.pow(BT.defR, -B.holeExp), B.holeMin, B.holeMax);
      var first = Z.foes.slice(0, B.fieldFoes); BT.wave = Z.foes.slice(B.fieldFoes); BT.waveN = 1;
      var spec = mine.map(function (h) { return { team: 'blue', hull: h }; }).concat(first.map(function (h) { return { team: 'red', hull: h }; }));
      return C.start(spec, { dist: B.dist, field: spec.length, weather: Z.wx, mode: 'eve', staged: true }).then(function () {
        if (seq !== BT.seq) return;
        C.ships().forEach(apply);
        C.speed(I.S.speed);
        BT.myLost0 = 0; BT.phase = 'fight'; BT.startWall = I.now();
        I.S.st.battles++;
        I.emit('zoneStart', Z);
      });
    }).catch(function (e) { console.error(e); BT.phase = 'error'; I.emit('error', e); });
  };

  /** 開局（或中途進場）那一艘的設定：放置模式的底 × 強度比 × 升級。 */
  function apply(sh) {
    if (sh.bsi) return;
    var Z = BT.Z, N = Z.n;
    sh.bsi = { lostMax: sh.lost || 0, out: false, id: sh.T.id, boss: Z.boss && sh.T.id === Z.R.boss && !BT.bossSeen, acc: 0, accT: 0, cfg0: null };
    if (sh.bsi.boss) BT.bossSeen = true;
    if (sh.team === 'blue') {
      sh.reloadT = I.reloadT();
      sh.cfg.hard *= BT.myHard; sh.cfg.flood *= B.myFlood * I.floodK(); sh.cfg.pump *= B.myPump * I.pumpK();
      sh.cfg.speed *= I.sailK(); sh.cfg.agile *= I.sailK();
      sh.cap = I.S.doctrine;
    } else {
      sh.reloadT = Math.max(B.eReloadMin, B.eReload0 / (1 + B.eReloadPer * (N - 1)));
      sh.cfg.hard *= B.eHard * BT.eHard; sh.cfg.flood *= B.eFlood; sh.cfg.pump *= B.ePump;
      sh.bsi.pool = I.pool(sh.T.id, N, sh.bsi.boss); sh.bsi.D = Math.max(400, B.hitRef * (sh.grid.count || 8000)); sh.bsi.hitPaid = 0; sh.bsi.biteGot = 0;
      powderSoft(sh);
    }
    sh.bsi.cfg0 = { flood: sh.cfg.flood, pump: sh.cfg.pump };
  }
  function powderSoft(sh) {
    var k = I.powderK(); if (k >= 1) return;
    (sh.models || []).forEach(function (m) { if (m.kind === 'powder' && !m.bsiSoft) { m.bsiSoft = true; m.hp = Math.max(1, Math.round(m.hp * k)); m.hpMax = Math.max(1, Math.round((m.hpMax || m.hp) * k)); } });
  }

  // ── 每一格畫面（主程式叫）：收入、降旗、出局、下一波、勝負 ──
  I.battleTick = function () {
    if (BT.phase !== 'fight' && BT.phase !== 'hold') return;
    var Z = BT.Z, ships = C.ships(), st = C.state(), now = I.now(), vm = I.valueMul() * I.incomeMul();
    var strike = I.strikeAt(), redUp = 0, blueUp = 0, myLost = 0, repairing = now < BT.repairUntil;
    ships.forEach(function (sh) {
      if (!sh.bsi) apply(sh);
      if (sh.team === 'blue') {
        myLost += sh.lost || 0;
        if (!C.isOut(sh)) blueUp++;
        if (repairing) { sh.cfg.pump = sh.bsi.cfg0.pump * 4; sh.cfg.flood = 0; } else if (sh.bsi.rep) { sh.cfg.pump = sh.bsi.cfg0.pump; sh.cfg.flood = sh.bsi.cfg0.flood; }
        sh.bsi.rep = repairing;
        return;
      }
      if (sh.team !== 'red') return;
      if ((sh.lost || 0) > sh.bsi.lostMax) {                         // 打下來的格 ⇒ 身價的 hitShare 照飽和曲線領（木匠補回去的不倒扣）
        sh.bsi.lostMax = sh.lost;
        var f = B.hitShare * (1 - Math.exp(-sh.bsi.lostMax / sh.bsi.D)), dp = f - sh.bsi.hitPaid;
        if (dp > 0) { sh.bsi.hitPaid = f; var g = I.gain(sh.bsi.pool * dp * vm, 'hit'); BT.income += g; sh.bsi.acc += g; }
      }
      if (sh.bsi.acc > 0 && now - sh.bsi.accT > 380) { I.emit('float', sh, sh.bsi.acc, 'hit'); sh.bsi.acc = 0; sh.bsi.accT = now; }
      if (BT.phase === 'fight' && !sh.struck && !sh.sunk && !sh.sinkingFinal && sh.crew0 > 0 && 1 - sh.able / sh.crew0 >= strike) {
        C.strike(sh, '降旗（死傷 ' + Math.round((1 - sh.able / sh.crew0) * 100) + '%）—— 骷髏旗嚇壞他們了');
      }
      if (!sh.bsi.out && C.isOut(sh)) onOut(sh);
      if (!C.isOut(sh)) redUp++;
      if (now - (sh.bsi.pwT || 0) > 2000) { sh.bsi.pwT = now; powderSoft(sh); }   // 火藥桶有的是開打之後才擺（彈藥庫的站）
    });
    if (BT.phase === 'hold') { if (now >= BT.holdUntil) next(); return; }
    BT.myLost = myLost;
    if (!blueUp) return finish('lose');
    if (!redUp) { if (BT.wave.length) spawnWave(ships); else return finish('win'); }
    if (st.t > Z.timeout) return finish('timeout');
  };

  function onOut(sh) {
    sh.bsi.out = true;
    var how = sh.struck && !sh.sinkingFinal && !sh.sunk ? 'cap' : 'sink', S = I.S, id = sh.T.id;
    var g = I.gain(sh.bsi.pool * B.outShare * (how === 'cap' ? B.captureK : 1) * I.bountyMul() * I.incomeMul(), how);
    BT.income += g; BT.kills.push({ id: id, how: how, g: g });
    if (how === 'cap') S.st.cap++; else S.st.sunk++;
    if (!S.bp[id] && I.firstZone(id) < 99) { S.bp[id] = 1; I.emit('bp', id); }
    I.emit('kill', sh, how, g);
  }
  function onBoom(sh) {
    if (sh.bsi.boomed) return; sh.bsi.boomed = true;
    var g = I.gain(sh.bsi.pool * B.boomShare * I.boomMul() * I.bountyMul() * I.incomeMul(), 'boom');
    BT.income += g; I.S.st.boom++;
    I.emit('boom', sh, g);
  }
  /** 下一波：在敵方剩下的那一側、離我方艦隊中心 280 m 的地方進場（有海圖 ⇒ 不超出開戰點的開闊水域）。 */
  function spawnWave(ships) {
    var mine = ships.filter(function (s) { return s.team === 'blue' && !C.isOut(s); }), foes = ships.filter(function (s) { return s.team === 'red'; });
    function mid(L) { var x = 0, z = 0; L.forEach(function (o) { x += o.px; z += o.pz; }); return L.length ? [x / L.length, z / L.length] : [0, 0]; }
    var Mc = mid(mine), Ec = mid(foes), dx = Ec[0] - Mc[0], dz = Ec[1] - Mc[1], dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    var take = BT.wave.splice(0, B.fieldFoes); BT.waveN++;
    take.forEach(function (h, i) {
      var off = (i - (take.length - 1) / 2) * 90, x = Mc[0] + dx * 280 - dz * off, z = Mc[1] + dz * 280 + dx * off, r = Math.hypot(x, z);
      if (BT.Z.map && r > 420) { x *= 420 / r; z *= 420 / r; }
      var sh = C.add({ team: 'red', hull: h, x: x, z: z }); if (sh) apply(sh);
    });
    I.emit('wave', BT.waveN, take.length);
  }

  function finish(kind) {
    var S = I.S, Z = BT.Z, N = Z.n, st = C.state();
    BT.phase = 'hold'; BT.result = kind; BT.holdUntil = I.now() + B.hold * 1000;
    var wallSec = Math.max(5, (I.now() - BT.startWall) / 1000 + B.hold), r = BT.income / wallSec;   // 這一場每秒賺多少（離線收益照它）
    S.rate = S.rate ? 0.75 * S.rate + 0.25 * r : r;
    if (kind === 'win') {
      S.st.wins++;
      if (st.t < 30) S.st.blitz = 1;
      if (BT.myLost < 50) S.st.clean = 1;
      if (BT.atkR < 0.6) S.st.under = 1;
      S.maxZone = Math.max(S.maxZone, N + 1); S.bestZone = Math.max(S.bestZone, S.maxZone);
      if (N >= I.GIFTS.pinas && !S.bp.pinas) { S.bp.pinas = 1; I.emit('bp', 'pinas', true); }
      if (S.farm > 0) { S.farm++; if (S.farm > B.retryAfter && S.auto) { S.zone = Math.min(S.maxZone, N + 1); S.farm = 0; } }
      else if (S.auto) S.zone = Math.min(S.maxZone, N + 1);
    } else {
      S.st.losses++;
      if (S.auto && N > 1) { S.zone = N - 1; S.farm = 1; }
    }
    I.emit('result', kind, Z, BT.income);
  }
  function next() { BT.phase = 'idle'; I.startZone(I.S.zone); }
  /** 換海域（手動：上一個、下一個、重打）。 */
  I.goZone = function (N) { var S = I.S; S.zone = I.clamp(N, 1, S.maxZone); S.farm = 0; I.startZone(S.zone); };

  // ── 咬一口（點敵艦、巨齒鯊）──
  var biteAt = 0;
  I.bite = function (sh, big) {
    if (!sh || BT.phase !== 'fight' || sh.team !== 'red' || sh.sunk) return 0;
    if (!big) { if (I.now() - biteAt < 280) return 0; biteAt = I.now(); }
    var n = C.bite(sh, 0.15 + Math.random() * 0.7, Math.random() < 0.5 ? 1 : -1, big ? 9 + I.lv('teeth') : I.biteR());
    if (!n) return 0;
    I.S.st.bites++;
    // 咬下來的格照常算進打下來的格（輪詢那一份）；另外一份咬的獎勵 ×利齒，一艘最多領身價的三成
    var b = sh.bsi, bonus = Math.min(b.pool * 0.3 - b.biteGot, b.pool * 0.15 * n / b.D * I.biteMul());
    if (bonus > 0) { b.biteGot += bonus; BT.income += I.gain(bonus * I.valueMul() * I.incomeMul(), 'bite'); }
    I.emit('bite', sh, n, bonus);
    return n;
  };
  /** 畫面上那一點離哪艘敵艦最近（照船的中心投影；遠的船門檻小一點）。 */
  I.foeAt = function (cx, cy) {
    var best = null, bd = Infinity;
    C.ships().forEach(function (sh) {
      if (sh.team !== 'red' || sh.sunk) return;
      var c = C.center(sh); if (!c) return;
      var p = C.project(c[0], c[1], c[2]); if (!p) return;
      var d = Math.hypot(p.x - cx, p.y - cy), lim = I.clamp(9000 / p.d, 50, 260);
      if (d < lim && d < bd) { bd = d; best = sh; }
    });
    return best;
  };

  // ── 技能 ──
  I.abilReady = function (a) { return I.S.bestZone >= a.zone && I.now() >= (I.S.cd && I.S.cd[a.id] || 0); };
  I.abilLeft = function (a) { return Math.max(0, ((I.S.cd && I.S.cd[a.id]) || 0) - I.now()) / 1000; };
  I.useAbil = function (id) {
    var a = I.ABIL.filter(function (x) { return x.id === id; })[0]; if (!a || !I.abilReady(a) || BT.phase !== 'fight') return false;
    var ships = C.ships();
    if (id === 'volley') ships.forEach(function (sh) { if (sh.team === 'blue' && !C.isOut(sh)) sh.guns.forEach(function (g) { if (g.alive && g.reload > 0.05) g.reload = 0.05; }); });
    if (id === 'frenzy') BT.frenzyUntil = I.now() + a.dur * 1000;
    if (id === 'mega') ships.forEach(function (sh) { if (sh.team === 'red' && !C.isOut(sh)) I.bite(sh, true); });
    if (id === 'repair') BT.repairUntil = I.now() + a.dur * 1000;
    I.S.cd = I.S.cd || {}; I.S.cd[id] = I.now() + a.cd * 1000 * I.cdMul();
    I.emit('abil', a);
    return true;
  };
})(window.BSI = window.BSI || {});

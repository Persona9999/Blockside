// ───────────────────────── 方舷放置：介面（上方資源列、海域卡、左邊的面板、技能列、彈窗） ─────────────────────────
// 全部自己畫：核心的主選單、HUD 都藏起來（idle.css）。元素一律 bsi- 開頭，不跟核心的 id 撞。
(function (I) {
  'use strict';
  var C = I.core, $ = I.$, h = I.h, ROOT, qty = 1, tab = 'fleet', dirty = { panel: true }, rateLog = [], lastTxt = {};

  function txt(id, s) { if (lastTxt[id] === s) return; lastTxt[id] = s; var e = $(id); if (e) e.textContent = s; }
  function html(id, s) { if (lastTxt[id] === s) return; lastTxt[id] = s; var e = $(id); if (e) e.innerHTML = s; }
  I.dirty = function (k) { dirty[k || 'panel'] = true; };

  I.uiInit = function () {
    ROOT = h('div'); ROOT.id = 'bsi';
    ROOT.innerHTML =
      '<div class="bsi-top">' +
        '<div class="brand"><span class="fin">🦈</span><div><b>方舷放置</b><small>鯊魚艦隊的無盡海</small></div></div>' +
        '<div class="cur">' +
          '<div class="res blk" title="格：打下來的每一格船殼"><span class="ico">🧱</span><b id="bsi-blk">0</b><span class="u">格</span><span class="rate" id="bsi-rate"></span></div>' +
          '<div class="res shd" id="bsi-shdBox" title="三叉戟碎片：深海科技的貨幣；累計的每一顆讓收入 +10%"><span class="ico">🔱</span><b id="bsi-shd">0</b></div>' +
          '<div class="mul" id="bsi-mul" title="收入倍率（成就 × 碎片 × 狂潮）"></div>' +
        '</div>' +
        '<div class="btns"><button id="bsi-spd" title="模擬速度"></button><button id="bsi-cam" title="鏡頭"></button><button id="bsi-mute" title="聲音"></button><button id="bsi-set" title="設定">⚙️</button></div>' +
      '</div>' +
      '<div class="bsi-zone" id="bsi-zone">' +
        '<div class="zh"><span class="rico" id="bsi-rico"></span><div><div class="rname" id="bsi-rname"></div><div class="zn" id="bsi-zn"></div></div></div>' +
        '<div class="dots" id="bsi-dots"></div>' +
        '<div class="zstat" id="bsi-zstat"></div>' +
        '<div class="ratio" id="bsi-ratio"></div>' +
        '<div class="znav"><button id="bsi-zprev" title="上一個海域">◀</button><button id="bsi-zauto"></button><button id="bsi-znext" title="下一個海域">▶</button></div>' +
        '<div class="farm" id="bsi-farm"></div>' +
      '</div>' +
      '<button class="bsi-ptog" id="bsi-ptog">☰ 艦隊與升級</button>' +
      '<div class="bsi-panel" id="bsi-panel">' +
        '<div class="tabs" id="bsi-tabs"></div>' +
        '<div class="body" id="bsi-body"></div>' +
      '</div>' +
      '<div class="bsi-abil" id="bsi-abil"></div>' +
      '<div class="bsi-banner" id="bsi-banner"></div>' +
      '<div class="bsi-modal-bg" id="bsi-mbg"><div class="bsi-modal" id="bsi-modal"></div></div>';
    document.body.appendChild(ROOT);
    I.fxInit(ROOT);
    tabsBuild(); abilBuild();
    $('bsi-spd').onclick = function () { var L = I.SPEEDS.filter(function (x) { return x <= I.speedMax(); }), i = (L.indexOf(I.S.speed) + 1) % L.length; I.S.speed = L[i]; C.speed(I.S.speed); topBtns(); };
    $('bsi-cam').onclick = function () { var L = ['auto', 'flag', 'free']; I.S.cam = L[(L.indexOf(I.S.cam) + 1) % 3]; if (I.S.cam !== 'free') I.camStart(); topBtns(); };
    $('bsi-mute').onclick = function () { I.S.mute = !I.S.mute; C.sound({ mute: I.S.mute }); topBtns(); };
    $('bsi-set').onclick = settings;
    $('bsi-zprev').onclick = function () { if (I.S.zone > 1) { I.S.auto = false; I.goZone(I.S.zone - 1); } };
    $('bsi-znext').onclick = function () { if (I.S.zone < I.S.maxZone) I.goZone(I.S.zone + 1); };
    $('bsi-zauto').onclick = function () { I.S.auto = !I.S.auto; if (I.S.auto && I.S.zone < I.S.maxZone && !I.S.farm) I.goZone(I.S.maxZone); zoneCard(); };
    $('bsi-ptog').onclick = function () { ROOT.classList.toggle('pOpen'); };
    $('bsi-mbg').addEventListener('pointerdown', function (e) { if (e.target === this && !this.dataset.lock) modalClose(); });
    topBtns();
    ['buy', 'bp', 'fleet', 'prestige', 'ach'].forEach(function (k) { I.on(k, function () { I.dirty(); }); });
    I.on('zoneStart', function () { zoneCard(); I.dirty(); I.camStart(); });
    I.on('zoneLoad', function (Z) { zoneCard(); banner('<span class="rico">' + Z.R.ico + '</span> 海域 ' + Z.n + (Z.boss ? ' <b class="boss">👑 守將</b>' : '') + '<small>' + I.esc(Z.R.name) + ' —— ' + I.esc(Z.R.say) + '</small>', 'zone'); });
    I.on('result', function (k, Z, g) {
      banner(k === 'win' ? '勝利！<small>海域 ' + Z.n + ' · 這一場 +' + I.fmt(g) + ' 格</small>' : (k === 'timeout' ? '僵持不下，撤退' : '艦隊撤退……') + '<small>' + (I.S.farm ? '先退一個海域練練，再回來挑戰' : '升級一下再來') + '</small>', k);
      zoneCard();
    });
    I.on('gain', function (a) { rateLog.push([I.now(), a]); });
    I.on('abil', function (a) { I.toast(a.ico + ' <b>' + a.name + '</b>！', 'abil', 2500); });
  };

  // ── 上方 ──
  function topBtns() {
    txt('bsi-spd', '⏩ ×' + I.S.speed);
    txt('bsi-cam', { auto: '🎥 自動', flag: '🎥 旗艦', free: '🎥 自由' }[I.S.cam]);
    txt('bsi-mute', I.S.mute ? '🔇' : '🔊');
  }
  I.topBtns = topBtns;
  function rate() {
    var now = I.now(), s = 0; while (rateLog.length && now - rateLog[0][0] > 15000) rateLog.shift();
    rateLog.forEach(function (r) { s += r[1]; });
    return s / 15;
  }

  // ── 海域卡 ──
  function zoneCard() {
    var S = I.S, Z = I.BT.Z && I.BT.Z.n === S.zone ? I.BT.Z : I.zone(S.zone), k = (Z.n - 1) % 10, d = '';
    txt('bsi-rico', Z.R.ico); txt('bsi-rname', Z.R.name + (Z.wx === 'storm' ? ' ⛈' : Z.wx === 'maelstrom' ? ' 🌀' : ''));
    html('bsi-zn', '海域 <b>' + Z.n + '</b>' + (Z.boss ? ' <span class="boss">👑 守將</span>' : '') + '<span class="best">最遠 ' + (S.maxZone) + '</span>');
    for (var i = 0; i < 10; i++) { var n = Z.n - k + i; d += '<i class="' + (n < S.maxZone ? 'done' : '') + (n === Z.n ? ' cur' : '') + (i === 9 ? ' boss' : '') + '"></i>'; }
    html('bsi-dots', d);
    txt('bsi-zauto', S.auto ? '⏵ 自動推進' : '⏸ 原地練功');
    $('bsi-zauto').classList.toggle('on', S.auto);
    $('bsi-zprev').disabled = S.zone <= 1; $('bsi-znext').disabled = S.zone >= S.maxZone;
    txt('bsi-farm', S.farm ? '打輸了，先退一步練練：再贏 ' + Math.max(0, I.BAL.retryAfter + 1 - S.farm) + ' 場回去挑戰' : '');
  }
  I.zoneCard = zoneCard;
  function zoneLive() {
    var BT = I.BT, Z = BT.Z; if (!Z) return;
    var st = C.state(), ships = C.ships(), up = ships.filter(function (s) { return s.team === 'red' && !C.isOut(s); }).length;
    var s = BT.phase === 'loading' ? '⏳ 船隊集結中…' : BT.phase === 'fight' ? '敵艦 ' + up + ' 艘' + (BT.wave.length ? '（後面還有 ' + BT.wave.length + '）' : '') + (BT.waveN > 1 ? ' · 第 ' + BT.waveN + ' 波' : '') + ' · ' + clock(st.t) + ' / ' + clock(Z.timeout) : BT.phase === 'hold' ? (BT.result === 'win' ? '✔ 拿下了' : '✘ 撤退') : '';
    txt('bsi-zstat', s);
    var a = BT.phase === 'loading' ? I.atk() / Z.lv : BT.atkR, d2 = BT.phase === 'loading' ? I.def() / Z.lv : BT.defR;
    html('bsi-ratio', '<span class="' + rc(a) + '" title="我方火力 ÷ 這個海域的強度：越高敵艦越脆、我方砲彈越兇">🎯 火力比 ' + a.toFixed(2) + '</span><span class="' + rc(d2) + '" title="我方船堅 ÷ 這個海域的強度：越高越打不穿">🛡️ 船堅比 ' + d2.toFixed(2) + '</span>');
  }
  function rc(x) { return x >= 1.2 ? 'good' : x >= 0.8 ? 'ok' : 'bad'; }
  function clock(t) { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + ('0' + t % 60).slice(-2); }

  // ── 結果橫幅 ──
  var banT = 0;
  function banner(s, cls) {
    var b = $('bsi-banner'); b.innerHTML = s; b.className = 'bsi-banner on ' + (cls || '');
    clearTimeout(banT); banT = setTimeout(function () { b.className = 'bsi-banner'; }, 3200);
  }
  I.banner = banner;

  // ── 面板 ──
  var TABS = [{ id: 'fleet', ico: '⚓', name: '艦隊' }, { id: 'upg', ico: '🎯', name: '升級' }, { id: 'deep', ico: '🔱', name: '深海' }, { id: 'ach', ico: '🏆', name: '成就' }, { id: 'stat', ico: '📊', name: '紀錄' }];
  function tabsBuild() {
    var T = $('bsi-tabs');
    TABS.forEach(function (t) {
      var b = h('button', '', '<span>' + t.ico + '</span>' + t.name); b.dataset.t = t.id;
      b.onclick = function () { tab = t.id; I.dirty(); };
      T.appendChild(b);
    });
  }
  function panel() {
    [].forEach.call($('bsi-tabs').children, function (b) { b.classList.toggle('on', b.dataset.t === tab); });
    var B = $('bsi-body'), top = B.scrollTop;
    B.innerHTML = '';
    ({ fleet: pFleet, upg: pUpg, deep: pDeep, ach: pAch, stat: pStat })[tab](B);
    B.scrollTop = top;
  }
  function sec(B, title, sub) { var e = h('div', 'sec', '<h3>' + title + (sub ? '<small>' + sub + '</small>' : '') + '</h3>'); B.appendChild(e); return e; }
  function costBtn(cost, ok, label, fn, cls) {
    var b = h('button', 'cost ' + (cls || ''), (label ? '<span class="l">' + label + '</span>' : '') + '🧱 ' + I.fmt(cost));
    b.dataset.cost = cost; b.disabled = !ok; b.onclick = function (e) { e.stopPropagation(); fn(); };
    return b;
  }
  function shipLine(id) {
    var c = I.cardOf(id) || {};
    return '<b>' + I.esc(I.nameOf(id)) + '</b><span class="by">' + I.esc(I.AUTHORS[id] || '') + '</span><span class="spec">' + I.fmt(c.tons || 0) + ' 噸 · ' + (c.guns || 0) + ' 門砲 · ' + (c.crew || 0) + ' 人</span>';
  }
  function pFleet(B) {
    var S = I.S, s1 = sec(B, '我的艦隊', S.fleet.length + ' / ' + S.slots + ' 個位置 · 換船下一場生效');
    S.fleet.forEach(function (id, i) {
      var r = h('div', 'row slot' + (i === 0 ? ' flag' : ''), '<span class="ico">' + (i === 0 ? '🚩' : '⛵') + '</span><div class="mid">' + shipLine(id) + '</div>');
      var sel = h('select'); Object.keys(S.own).sort(function (a, b) { return I.tons(a) - I.tons(b); }).forEach(function (o) { var op = h('option', '', I.esc(I.nameOf(o))); op.value = o; op.selected = o === id; sel.appendChild(op); });
      sel.onchange = function () { I.setSlot(i, sel.value); };
      r.appendChild(sel); s1.appendChild(r);
    });
    var sp = I.slotPrice();
    if (isFinite(sp)) { var r2 = h('div', 'row add', '<span class="ico">➕</span><div class="mid"><b>再一個位置</b><span class="spec">艦隊多一艘船（放手上最大的那一型）</span></div>'); r2.appendChild(costBtn(sp, S.blocks >= sp, '', function () { I.buySlot(); })); s1.appendChild(r2); }
    var s2 = sec(B, '艦隊方針', '我方砲長照這個挑瞄哪裡'), ch = h('div', 'chips');
    I.DOCTRINE.forEach(function (d) {
      var lock = S.bestZone < d.zone, b = h('button', 'chip' + (S.doctrine === d.id ? ' on' : '') + (lock ? ' lock' : ''), d.ico + ' ' + d.name);
      b.title = lock ? '第 ' + d.zone + ' 海域解鎖' : d.tip; b.disabled = lock;
      b.onclick = function () { S.doctrine = d.id; I.BT.phase === 'fight' && C.ships().forEach(function (sh) { if (sh.team === 'blue') sh.cap = d.id; }); I.dirty(); };
      ch.appendChild(b);
    });
    s2.appendChild(ch);
    var cur = I.DOCTRINE.filter(function (d) { return d.id === S.doctrine; })[0]; s2.appendChild(h('div', 'note', cur ? cur.tip : ''));
    var s3 = sec(B, '船塢', '擊敗過的那一型就拿得到藍圖');
    I.shipList().forEach(function (id) {
      var own = S.own[id], bp = S.bp[id], fz = I.firstZone(id), p = I.shipPrice(id);
      var r = h('div', 'row ship' + (own ? ' own' : bp ? '' : ' lock'), '<span class="ico">' + (own ? '✅' : bp ? '📜' : '🔒') + '</span><div class="mid">' + (bp || own ? shipLine(id) : '<b>？？？</b><span class="spec">第 ' + fz + ' 海域' + (I.GIFTS[id] ? '的禮物' : '會遇到') + ' · 擊敗它拿藍圖</span>') + '</div>');
      if (bp && !own) r.appendChild(costBtn(p, S.blocks >= p, '造船', function () { I.buyShip(id); }));
      if (own) r.appendChild(h('span', 'tag', S.fleet.indexOf(id) >= 0 ? '出航中' : '在港'));
      s3.appendChild(r);
    });
  }
  var UPG_TXT = {
    gun: function () { return '火力 ' + I.mulTxt(Math.pow(I.upgDef('gun').eff, I.lv('gun'))); },
    reload: function () { return '裝填 ' + I.reloadT().toFixed(2) + ' 秒'; },
    powder: function () { return '火藥桶 ' + I.pct(I.powderK()) + '、殉爆賞金 ' + I.mulTxt(I.boomMul()); },
    hull: function () { return '船堅 ' + I.mulTxt(Math.pow(I.upgDef('hull').eff, I.lv('hull'))); },
    pump: function () { return '抽水 ' + I.mulTxt(I.pumpK()) + '、進水 ' + I.mulTxt(I.floodK()); },
    sail: function () { return '航速 ' + I.mulTxt(I.sailK()); },
    value: function () { return '一格 ' + I.mulTxt(I.valueMul()); },
    bounty: function () { return '賞金 ' + I.mulTxt(I.bountyMul()); },
    fear: function () { return '死傷 ' + I.pct(I.strikeAt()) + ' 就降旗'; },
    teeth: function () { return '咬 ' + I.biteR() + ' 格寬、' + I.mulTxt(I.biteMul()); }
  };
  function pUpg(B) {
    var q = h('div', 'qty');
    [[1, '×1'], [10, '×10'], [Infinity, '最大']].forEach(function (x) { var b = h('button', qty === x[0] ? 'on' : '', x[1]); b.onclick = function () { qty = x[0]; I.dirty(); }; q.appendChild(b); });
    B.appendChild(q);
    I.UPG_TABS.forEach(function (t) {
      var s = sec(B, t.name);
      I.UPG.filter(function (u) { return u.tab === t.id; }).forEach(function (u) {
        var L = I.lv(u.id), maxed = I.upgMaxed(u), n = qty === Infinity ? Math.max(1, I.upgAfford(u)) : qty, cost = I.upgCostN(u, n);
        var r = h('div', 'row upg', '<span class="ico">' + u.ico + '</span><div class="mid"><b>' + u.name + '</b><span class="lv">Lv ' + L + (u.max ? ' / ' + u.max : '') + '</span><span class="spec">' + u.desc + '</span><span class="now">' + UPG_TXT[u.id]() + '</span></div>');
        if (maxed) r.appendChild(h('span', 'tag', '滿了'));
        else { var b = costBtn(cost, I.S.blocks >= cost, qty === 1 ? '' : '×' + n, function () { I.buyUpg(u.id, n); }); b.dataset.upg = u.id; b.dataset.n = n; r.appendChild(b); }
        s.appendChild(r);
      });
    });
  }
  function pDeep(B) {
    var S = I.S, g = I.shardsFor(S.maxZone), s = sec(B, '潛回亞特蘭提斯', '轉生');
    var p = h('div', 'pres');
    p.innerHTML = '<p>這一輪最遠到過 <b>海域 ' + S.maxZone + '</b>。現在潛回去可以帶走 <b class="shd">🔱 ' + g + '</b> 顆三叉戟碎片。</p>' +
      '<p class="dim">累計的每一顆碎片讓收入 +10%：現在 ' + I.mulTxt(I.shardMul()) + (g ? ' → 轉生後 ' + I.mulTxt(1 + 0.1 * (S.shardsAll + g)) : '') + '。<br>會重來：格、升級、海域、造好的船與艦隊位置（藍圖留著）。從海域 ' + I.startZone() + ' 出發。</p>';
    var b = h('button', 'big', g ? '🐚 潛回亞特蘭提斯（+🔱 ' + g + '）' : '🔒 到達第 ' + I.BAL.shardZone + ' 海域才能潛回去');
    b.disabled = !g; b.onclick = prestigeAsk; p.appendChild(b); s.appendChild(p);
    var s2 = sec(B, '深海科技', '🔱 ' + S.shards + ' 顆可以用 · 轉生也留著');
    I.TECH.forEach(function (t) {
      var L = I.tlv(t.id), maxed = t.max > 0 && L >= t.max, c = I.techCost(t);
      var r = h('div', 'row tech', '<span class="ico">' + t.ico + '</span><div class="mid"><b>' + t.name + '</b><span class="lv">Lv ' + L + (t.max ? ' / ' + t.max : '') + '</span><span class="spec">' + t.desc + '</span></div>');
      if (maxed) r.appendChild(h('span', 'tag', '滿了'));
      else { var b2 = h('button', 'cost shd', '🔱 ' + c); b2.disabled = S.shards < c; b2.onclick = function () { I.buyTech(t.id); if (t.id === 'tide') topBtns(); }; r.appendChild(b2); }
      s2.appendChild(r);
    });
  }
  function pAch(B) {
    var n = Object.keys(I.S.ach).length, s = sec(B, '成就', n + ' / ' + I.ACH.length + ' · 收入 ' + I.mulTxt(I.achMul())), g = h('div', 'achs');
    I.ACH.forEach(function (a) { var on = !!I.S.ach[a.id]; g.appendChild(h('div', 'ach' + (on ? ' on' : ''), '<span class="ico">' + (on ? a.ico : '❔') + '</span><b>' + I.esc(a.name) + '</b><small>' + I.esc(a.desc) + '</small>')); });
    s.appendChild(g);
  }
  function pStat(B) {
    var S = I.S, st = S.st, s = sec(B, '航海日誌');
    [['🧱 這一輪打下來', I.fmt(S.blocksRun) + ' 格'], ['🧱 全部打下來', I.fmt(S.blocksAll) + ' 格'], ['🗺️ 有史以來最遠', '海域 ' + S.bestZone], ['⚔️ 開戰', st.battles + ' 場（贏 ' + st.wins + '、撤退 ' + st.losses + '）'],
      ['⚓ 擊沉', st.sunk + ' 艘'], ['🏳️ 俘獲', st.cap + ' 艘'], ['💥 殉爆', st.boom + ' 次'], ['🦷 咬', st.bites + ' 口'], ['🐚 潛回亞特蘭提斯', st.pres + ' 次'],
      ['⏱️ 航行時間', I.fmtTime(st.playSec)], ['💤 離線效率', I.pct(I.offlineEff())], ['📈 平均收入', I.fmt(S.rate) + ' 格/秒']].forEach(function (x) {
      s.appendChild(h('div', 'kv', '<span>' + x[0] + '</span><b>' + x[1] + '</b>'));
    });
  }
  // 只更新按鈕買不買得起（每 0.2 秒；整個面板只有事件來了才重畫）
  function panelLive() {
    [].forEach.call(ROOT.querySelectorAll('.bsi-panel button.cost'), function (b) {
      if (b.dataset.upg && qty === Infinity) return;               // 「最大」的量會變 ⇒ 交給重畫
      if (b.classList.contains('shd')) return;
      b.disabled = I.S.blocks < +b.dataset.cost;
    });
  }

  // ── 技能列 ──
  function abilBuild() {
    var A = $('bsi-abil');
    A.innerHTML = '<div class="hint" id="bsi-hint">🦈 點敵艦咬一口</div>';
    I.ABIL.forEach(function (a) {
      var b = h('button', 'ab', '<span class="ico">' + a.ico + '</span><span class="nm">' + a.name + '</span><span class="key">' + a.key + '</span><i class="cd"></i>');
      b.id = 'bsi-ab-' + a.id; b.title = a.desc + '（冷卻 ' + a.cd + ' 秒）';
      b.onclick = function () { I.useAbil(a.id); };
      A.appendChild(b);
    });
  }
  function abilLive() {
    var now = I.now();
    I.ABIL.forEach(function (a) {
      var b = $('bsi-ab-' + a.id); if (!b) return;
      var lock = I.S.bestZone < a.zone, left = I.abilLeft(a), cd = a.cd * I.cdMul();
      b.style.display = lock ? 'none' : '';
      b.classList.toggle('wait', left > 0);
      b.classList.toggle('act', a.id === 'frenzy' && now < I.BT.frenzyUntil || a.id === 'repair' && now < I.BT.repairUntil);
      b.style.setProperty('--cd', left > 0 ? (left / cd).toFixed(3) : 0);
    });
  }

  // ── 彈窗 ──
  function modal(inner, lock) {
    var M = $('bsi-modal'), bg = $('bsi-mbg'); M.className = 'bsi-modal'; M.innerHTML = ''; if (typeof inner === 'string') M.innerHTML = inner; else M.appendChild(inner);
    bg.className = 'bsi-modal-bg on'; if (lock) bg.dataset.lock = '1'; else delete bg.dataset.lock;
    return M;
  }
  function modalClose() { $('bsi-mbg').className = 'bsi-modal-bg'; }
  I.modal = modal; I.modalClose = modalClose;
  function prestigeAsk() {
    var g = I.shardsFor(I.S.maxZone), M = modal('<h2>🐚 潛回亞特蘭提斯</h2><p>艦隊要回家了。帶走 <b class="shd">🔱 ' + g + '</b> 顆三叉戟碎片，收入永遠 ' + I.mulTxt(1 + 0.1 * (I.S.shardsAll + g)) + '。</p><p class="dim">格、升級、海域、造好的船會重來；藍圖、成就、深海科技、碎片留著。</p>');
    var r = h('div', 'mbtns'), no = h('button', '', '再打一下'), yes = h('button', 'big', '潛回去');
    no.onclick = modalClose; yes.onclick = function () { modalClose(); I.prestige(); I.save(); I.toast('🐚 回到亞特蘭提斯了。碎片 +' + g + '，重新出航！', 'ach', 6000); I.goZone(I.S.zone); };
    r.appendChild(no); r.appendChild(yes); M.appendChild(r);
  }
  function settings() {
    var S = I.S, M = modal('<h2>⚙️ 設定</h2>'), g = h('div', 'set');
    function row(label, opts, cur, fn) {
      var r = h('div', 'srow', '<span>' + label + '</span>'), c = h('div', 'chips');
      opts.forEach(function (o) { var b = h('button', 'chip' + (o[0] === cur ? ' on' : ''), o[1]); b.onclick = function () { fn(o[0]); settings(); }; c.appendChild(b); });
      r.appendChild(c); g.appendChild(r);
    }
    row('畫質', [['low', '低'], ['mid', '中'], ['high', '高'], ['ultra', '全開']], S.gfx, function (v) { S.gfx = v; C.gfx(v); });
    row('聲音', [[false, '開'], [true, '靜音']], S.mute, function (v) { S.mute = v; C.sound({ mute: v }); topBtns(); });
    row('背景音樂', [[0, '關'], [0.2, '小'], [0.35, '中'], [0.6, '大']], S.bgm, function (v) { S.bgm = v; C.sound({ bgm: v }); });
    row('鏡頭', [['auto', '自動運鏡'], ['flag', '看旗艦'], ['free', '自己轉']], S.cam, function (v) { S.cam = v; I.camStart(); topBtns(); });
    if (I.tlv('mate')) row('自動航海士', [[true, '開'], [false, '關']], S.mate, function (v) { S.mate = v; });
    M.appendChild(g);
    var io = h('div', 'srow col', '<span>存檔</span><textarea id="bsi-io" spellcheck="false" placeholder="匯出的存檔會出現在這裡；貼上別人的存檔再按「匯入」"></textarea>'), r2 = h('div', 'mbtns');
    var ex = h('button', '', '匯出'), im = h('button', '', '匯入'), wipe = h('button', 'danger', '全部重來'), ok = h('button', 'big', '好');
    ex.onclick = function () { I.save(); $('bsi-io').value = btoa(unescape(encodeURIComponent(JSON.stringify(I.S)))); $('bsi-io').select(); };
    im.onclick = function () { try { var o = JSON.parse(decodeURIComponent(escape(atob($('bsi-io').value.trim())))); if (!o || o.v !== 1) throw 0; I.store.set(I.SAVE_KEY, o); location.reload(); } catch (e) { $('bsi-io').value = '看不懂這份存檔 QQ'; } };
    wipe.onclick = function () { if (wipe.dataset.sure) { I.wipe(); location.reload(); } else { wipe.dataset.sure = 1; wipe.textContent = '真的？再按一次'; } };
    ok.onclick = modalClose;
    [ex, im, wipe, ok].forEach(function (b) { r2.appendChild(b); });
    M.appendChild(io); M.appendChild(r2);
    M.appendChild(h('p', 'dim small', 'Blockside 的海戰核心（ame、basecamp、summit… 與每一艘船的作者）× 本鯊魚的放置外殼。存在這個瀏覽器裡。'));
  }
  I.settings = settings;

  // ── 每一格 ──
  var t5 = 0, t1 = 0;
  I.uiFrame = function (dt) {
    if (tab === 'upg' && qty === Infinity && (t1 += dt) > 1) { t1 = 0; dirty.panel = true; }   // 「最大」買得起幾級一直在變
    var S = I.S;
    txt('bsi-blk', I.fmt(S.blocks));
    var r = rate(); txt('bsi-rate', r > 0 ? '+' + I.fmt(r) + '/秒' : '');
    $('bsi-shdBox').style.display = S.shardsAll > 0 ? '' : 'none'; txt('bsi-shd', I.fmt(S.shards));
    var m = I.incomeMul(); txt('bsi-mul', m > 1.001 ? I.mulTxt(m) : ''); $('bsi-mul').classList.toggle('hot', I.frenzyOn());
    if ((t5 += dt) > 0.2) { t5 = 0; zoneLive(); abilLive(); if (dirty.panel) { dirty.panel = false; panel(); } else panelLive(); }
  };
})(window.BSI = window.BSI || {});

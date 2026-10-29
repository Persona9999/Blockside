// ───────────────────────── 方舷放置：飄字、船上的標記、訊息列、自動運鏡 ─────────────────────────
(function (I) {
  'use strict';
  var C = I.core;
  if (!C) return;
  var FL, MK, TS, marks = new Map();

  I.fxInit = function (root) {
    FL = I.h('div', 'bsi-float'); MK = I.h('div', 'bsi-marks'); TS = I.h('div', 'bsi-toasts');
    root.appendChild(MK); root.appendChild(FL); root.appendChild(TS);
  };

  // ── 飄字 ──
  function shipPt(sh, up) {
    var c = C.center(sh); if (!c) return null;
    return C.project(c[0], c[1] + (up || 6), c[2]);
  }
  I.floatAt = function (x, y, html, cls) {
    if (!FL || FL.childElementCount > 46) return;
    var e = I.h('div', 'bsi-fl ' + (cls || ''), html);
    e.style.left = (x + (Math.random() - 0.5) * 50).toFixed(0) + 'px'; e.style.top = (y + (Math.random() - 0.5) * 16).toFixed(0) + 'px';
    e.addEventListener('animationend', function () { e.remove(); });
    FL.appendChild(e);
  };
  I.floatShip = function (sh, html, cls, up) { var p = shipPt(sh, up); if (p) I.floatAt(p.x, p.y, html, cls); };

  // ── 訊息列（左下）──
  I.toast = function (html, cls, ms) {
    if (!TS) return;
    var e = I.h('div', 'bsi-toast ' + (cls || ''), html);
    TS.appendChild(e);
    while (TS.childElementCount > 5) TS.firstChild.remove();
    setTimeout(function () { e.classList.add('out'); setTimeout(function () { e.remove(); }, 500); }, ms || 4200);
  };

  // ── 戰鬥的事件 ⇒ 飄字、訊息 ──
  I.on('float', function (sh, g) { I.floatShip(sh, '+' + I.fmt(g), g > I.BT.income * 0.08 ? 'big' : ''); });
  I.on('bite', function (sh, n, bonus) { I.floatShip(sh, '🦈 咬！' + n + ' 格', 'bite', 2); });
  I.on('kill', function (sh, how, g) {
    I.floatShip(sh, (how === 'cap' ? '🏳️ 俘獲 ' : '⚓ 擊沉 ') + '+' + I.fmt(g), 'kill ' + how, 14);
    I.toast((how === 'cap' ? '🏳️ <b>' + I.esc(sh.name) + '</b> 降旗了 —— 俘獲賞金' : '⚓ <b>' + I.esc(sh.name) + '</b> 沉了 —— 賞金') + ' <span class="g">+' + I.fmt(g) + '</span>', how);
    I.camEvent(sh, 7000);
  });
  I.on('boom', function (sh, g) { I.floatShip(sh, '💥 殉爆！+' + I.fmt(g), 'boom', 18); I.toast('💥 <b>' + I.esc(sh.name) + '</b> 彈藥庫殉爆！額外賞金 <span class="g">+' + I.fmt(g) + '</span>', 'boom'); I.camEvent(sh, 9000); });
  I.on('wave', function (n, k) { I.toast('🚩 第 ' + n + ' 波：敵艦 ' + k + ' 艘進場', 'wave'); });
  I.on('bp', function (id, gift) { I.toast(gift ? '🎁 亞特蘭提斯的禮物：<b>' + I.esc(I.nameOf(id)) + '</b> 的藍圖！（船塢）' : '📜 拿到藍圖：<b>' + I.esc(I.nameOf(id)) + '</b>（' + I.esc(I.AUTHORS[id] || '') + ' 造）—— 船塢可以造了', 'bp', 6000); });
  I.on('ach', function (a) { I.toast('🏆 成就：<b>' + a.ico + ' ' + I.esc(a.name) + '</b>（收入 ×1.03）', 'ach', 6000); });
  I.on('note', function (sh, text) {
    if (!/桅|起火|殉爆|斷|援軍|全員倒下/.test(text)) return;   // 只挑看得到的大事
    I.toast((sh.team === 'blue' ? '🔵 ' : '🔴 ') + I.esc(sh.name) + '：' + I.esc(text), 'note ' + sh.team, 3500);
  });

  // ── 船上的標記（敵艦：名字、浮力條、點了咬一口；我方：小名牌）──
  function mark(sh) {
    var m = marks.get(sh);
    if (m) return m;
    var red = sh.team === 'red', e = I.h('div', 'bsi-mark ' + (red ? 'foe' : 'mine') + (sh.bsi && sh.bsi.boss ? ' boss' : ''));
    e.innerHTML = '<div class="nm">' + (sh.bsi && sh.bsi.boss ? '👑 ' : '') + I.esc(sh.name) + '</div>' + (red && sh.bsi && sh.bsi.pool ? '<div class="val">💰 ' + I.fmt(sh.bsi.pool * I.valueMul() * I.incomeMul()) + '</div>' : '') +
      '<div class="bar"><i></i></div>' + (red ? '<div class="sub"></div>' : '');
    if (red) e.addEventListener('pointerdown', function (ev) { ev.preventDefault(); ev.stopPropagation(); I.bite(sh); });
    MK.appendChild(e);
    m = { e: e, bar: e.querySelector('.bar i'), sub: e.querySelector('.sub'), last: '' };
    marks.set(sh, m);
    return m;
  }
  I.marksClear = function () { marks.forEach(function (m) { m.e.remove(); }); marks.clear(); };
  I.on('zoneLoad', function () { I.marksClear(); });

  var camT = 0, camHold = 0, userT = 0, camSeq = 0;
  I.fxFrame = function (dt) {
    var ph = I.BT.phase;
    if (ph !== 'fight' && ph !== 'hold') { if (marks.size) I.marksClear(); return; }
    var live = new Set();
    C.ships().forEach(function (sh) {
      if (sh.sunk) return;
      var st = C.stat(sh), p = shipPt(sh, sh.team === 'red' ? 13 : 10); if (!st || !p || p.x < -50 || p.y < -50 || p.x > innerWidth + 50 || p.y > innerHeight + 50) return;
      var m = mark(sh); live.add(sh);
      m.e.style.transform = 'translate(' + p.x.toFixed(0) + 'px,' + p.y.toFixed(0) + 'px)';
      var f = st.float, out = C.isOut(sh);
      m.bar.style.width = (f * 100).toFixed(1) + '%';
      m.bar.className = f > 0.6 ? '' : f > 0.3 ? 'mid' : 'low';
      m.e.classList.toggle('out', out);
      if (m.sub) {
        var t = out ? (sh.struck && !sh.sinkingFinal ? '🏳️ 降旗' : '⚓ 沉沒中') : '👥 ' + Math.round(st.crew * 100) + '%　💣 ' + Math.round(st.guns * 100) + '%';
        if (t !== m.last) { m.sub.textContent = t; m.last = t; }
      }
    });
    marks.forEach(function (m, sh) { if (!live.has(sh)) { m.e.remove(); marks.delete(sh); } });
    camFrame(dt);
  };

  // ── 自動運鏡（設定：auto 自動／flag 跟著旗艦／free 自己轉）──
  function alive(team) { return C.ships().filter(function (s) { return s.team === team && !C.isOut(s) && !s.sunk; }); }
  I.camUser = function () { userT = I.now(); };                       // 使用者自己拖了鏡頭 ⇒ 自動運鏡讓 25 秒
  I.camEvent = function (sh, ms) {                                    // 大事（擊沉、殉爆）⇒ 切過去看
    if (I.S.cam !== 'auto' || I.now() - userT < 25000 || !sh || sh.sunk) return;
    C.cam.see(sh); C.cam.set({ dist: 70 + Math.random() * 30, pitch: 0.16 + Math.random() * 0.12 }); camHold = I.now() + ms;
  };
  I.camStart = function () {
    camT = I.now() + 6000; camHold = 0; camSeq = 0;
    if (I.S.cam === 'free') return;
    var me = alive('blue')[0]; if (me) { C.cam.see(me); C.cam.set({ dist: 85, pitch: 0.2 }); }
  };
  function camFrame(dt) {
    var mode = I.S.cam, now = I.now();
    if (mode !== 'auto' || now - userT < 25000) return;
    if (I.BT.phase === 'fight') C.cam.orbit(dt * 7, 0);               // 慢慢繞
    if (now < camHold || now < camT) return;
    camT = now + 9000 + Math.random() * 5000; camSeq++;
    var foes = alive('red'), mine = alive('blue'), shot = camSeq % 3;
    if (shot === 1 && foes.length) { C.cam.see(I.pick(foes)); C.cam.set({ dist: 65 + Math.random() * 40, pitch: 0.1 + Math.random() * 0.2 }); }
    else if (shot === 2 && mine.length) { C.cam.see(I.pick(mine)); C.cam.set({ dist: 90 + Math.random() * 50, pitch: 0.28 + Math.random() * 0.2 }); }
    else if (mine.length) { C.cam.see(mine[0]); C.cam.set({ dist: 150 + Math.random() * 80, pitch: 0.42 + Math.random() * 0.2 }); }
  }
})(window.BSI = window.BSI || {});

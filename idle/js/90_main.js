// ───────────────────────── 方舷放置：開機、標題、主迴圈、鍵盤、離線、換海圖重新載入 ─────────────────────────
(function (I) {
  'use strict';
  var C = I.core, $ = I.$, h = I.h;
  if (!C) { document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#061220;color:#e8f4ff;font:16px sans-serif;z-index:99">這一頁要用有外殼 API 的核心（src/js/91_shellapi.js）建出來 —— python -I src/admin.py shell idle/shell.json</div>'); return; }
  var AUTO_KEY = 'bsidle.auto', started = false;

  // 外殼的掛鉤（核心 71_input.js shellCall）：點畫面 ⇒ 咬最近的敵艦（核心不瞄準、不換成手動）；回主選單 ⇒ 不理
  window.BS_SHELL.tap = function (cx, cy) { var sh = I.foeAt(cx, cy); if (sh) I.bite(sh); return true; };
  window.BS_SHELL.menu = function () { return true; };

  I.initHulls();
  I.load();
  I.uiInit();
  C.gfx(I.S.gfx); C.sound({ mute: I.S.mute, bgm: I.S.bgm });
  document.documentElement.classList.add('bsi-on');

  // ── 鍵盤：全部先攔下來（核心的鍵位在放置模式裡都不該動），只放行自己用的 ──
  window.addEventListener('keydown', function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    e.stopImmediatePropagation();
    if (!started) { if (e.key === 'Enter') go(); return; }
    var k = e.key.toLowerCase();
    var a = I.ABIL.filter(function (x) { return x.key === k; })[0];
    if (a) { e.preventDefault(); I.useAbil(a.id); return; }
    if (k === ' ') { e.preventDefault(); var L = C.ships().filter(function (s) { return s.team === 'red' && !C.isOut(s); }); if (L.length) I.bite(I.pick(L)); return; }
    if (k === 'escape') { I.modalClose(); return; }
    if (k === 'c') { $('bsi-cam').click(); return; }
  }, true);
  window.addEventListener('keyup', function (e) { if (!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) e.stopImmediatePropagation(); }, true);
  // 拖鏡頭 ⇒ 自動運鏡讓開；第一次點 ⇒ 開聲音
  document.addEventListener('pointerdown', function (e) { if (e.target && e.target.id === 'cv') I.camUser(); C.resume(); }, true);

  // ── 換海圖：存檔、帶著網址重新載入，載好直接接著打 ──
  I.on('reload', function (Z) {
    I.save();
    try { window.sessionStorage.setItem(AUTO_KEY, '1'); } catch (e) { /* 照樣重新載入，只是要再按一次出航 */ }
    I.banner('🧭 換海圖：' + I.esc(Z.R.name) + '<small>重新載入中…</small>', 'zone');
    setTimeout(function () { location.replace(location.pathname + (Z.map ? '?map=' + Z.map + '&site=' + Z.site : '')); }, 600);
  });
  I.on('error', function (e) { I.toast('⚠ 開戰失敗：' + I.esc(e && e.message || e) + ' —— 三秒後重試', 'note', 6000); setTimeout(function () { I.startZone(I.S.zone); }, 3000); });

  // ── 標題 ──
  var offl = null;
  if (I.S.lastSeen > 0) { var o = I.offline((I.now() - I.S.lastSeen) / 1000); if (o.sec > 60 && o.gain > 0) offl = o; }
  var auto = false; try { auto = window.sessionStorage.getItem(AUTO_KEY) === '1'; window.sessionStorage.removeItem(AUTO_KEY); } catch (e) { auto = false; }
  function title() {
    var S = I.S, M = I.modal('', true), first = !S.st.battles;
    M.className = 'bsi-modal title';
    M.innerHTML = '<div class="logo">🦈</div><h1>方舷放置<small>鯊魚艦隊的無盡海</small></h1>' +
      (first ? '<p>a~ 艦隊長，歡迎上船！這片海的每一艘船都是方塊一格一格雕出來的 —— 打掉一格就是一格 🧱。<br>升級砲術、造更大的船、一個海域一個海域打過去。打不過就退一步練練，本鯊魚會自己回去挑戰。</p>'
        : '<p>歡迎回來！現在在 <b>海域 ' + S.zone + '</b>（最遠 ' + S.maxZone + '），手上 <b>' + I.fmt(S.blocks) + '</b> 格。</p>') +
      (offl ? '<div class="offl">💤 妳不在的 <b>' + I.fmtTime(offl.sec) + '</b>，艦隊自己打了 <b class="g">+' + I.fmt(offl.gain) + '</b> 格<small>離線效率 ' + I.pct(I.offlineEff()) + '</small></div>' : '') +
      '<div class="load" id="bsi-load">' + I.pick(I.TIPS) + '</div>' +
      '<button class="big go" id="bsi-go" disabled>⏳ 載入中…</button>' +
      '<div class="credit">海戰核心 Blockside（ame 與大家的船）× 外殼 gura</div>';
    $('bsi-go').onclick = go;
  }
  function go() {
    if (started || !C.ready()) return;
    started = true; I.modalClose(); C.resume();
    if (offl) { I.gain(offl.gain, 'offline'); offl = null; }
    I.startZone(I.S.zone);
  }
  title();
  C.on('boot:say', function (s) { var e = $('bsi-load'); if (e && s && s.length < 60) e.textContent = s; });
  (function waitReady() {
    if (!C.ready()) { setTimeout(waitReady, 200); return; }
    var b = $('bsi-go'); if (b) { b.disabled = false; b.textContent = I.S.st.battles ? '⚓ 繼續航行' : '⚓ 出航'; }
    var e = $('bsi-load'); if (e) e.textContent = I.pick(I.TIPS);
    if (auto) go();
  })();

  // ── 主迴圈 ──
  var last = performance.now(), acc1 = 0, acc10 = 0;
  function loop(t) {
    var dt = Math.min(0.25, (t - last) / 1000); last = t;
    try {
      I.battleTick(); I.fxFrame(dt); I.uiFrame(dt);
      if ((acc1 += dt) >= 1) { acc1 = 0; if (started) { I.S.st.playSec++; I.mateTick(); } I.checkAch(); }
      if ((acc10 += dt) >= 10) { acc10 = 0; if (started) I.save(); }
    } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ── 分頁藏起來 ⇒ 模擬停（核心的畫面迴圈停）、回來時照離線算 ──
  var hidAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hidAt = I.now(); I.save(); return; }
    if (!hidAt || !started) return;
    var o = I.offline((I.now() - hidAt) / 1000); hidAt = 0;
    if (o.sec > 30 && o.gain > 0) { I.gain(o.gain, 'offline'); I.toast('💤 離開了 ' + I.fmtTime(o.sec) + '，艦隊自己打了 <span class="g">+' + I.fmt(o.gain) + '</span> 格', 'ach', 7000); }
  });
  window.addEventListener('pagehide', function () { I.save(); });
})(window.BSI = window.BSI || {});

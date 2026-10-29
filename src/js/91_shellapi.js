// ───────────────────────── 外殼 API（外掛外殼頁的程式跟核心講話；2026-10-30 gura，方舷放置 idle.html） ─────────────────────────
// admin.py shell 套出來的頁，外殼設定寫 "opt": { "api": true } ⇒ 開機時 window.BS_SHELL.core ＝ 下面這一包（核心整包是一個閉包，外殼的程式摸不到裡面的名字）。
//   沒有 BS_SHELL（Blockside 自己的 index.html）、或外殼沒要 api ⇒ 只多一個沒人叫的函式與一個訂閱，戰局、畫面一位元不差。
// 只包核心既有的函式：讀（船型清單、卡片、場上的船、戰局狀態）、開戰、開關（跑／停格、模擬速度、畫質、聲音、天氣）、鏡頭、事件訂閱。
//   ⛔ 共用狀態照擁有者寫（admin.py OWNED）：RUNNING／PAUSED／MODE 叫 70_flow.js 的 flow*，鏡頭叫 03_camera.js 的 cam*。
//   場上的船（SHIPS 的物件）照原樣給 ⇒ 外殼要改每艘的東西（sh.cfg 的硬度與進水、sh.reloadT、砲長 sh.cap）在開局之後、模擬第一步之前改；
//   砲彈的傷害在 rptShot（開火那一刻，00_events.js）改那一顆的 b.dmg。
var SHAPI_READY = false;
evOn('boot:ready', function () { SHAPI_READY = true; });
if (window.BS_SHELL && window.BS_SHELL.opt && window.BS_SHELL.opt.api) window.BS_SHELL.core = shapiMake();
function shapiMake() {
  var author = {}; CFG.ships.forEach(function (s) { author[s.id] = s.author || ''; });
  return {
    v: 1,
    on: function (t, fn, order) { evOn(t, fn, order); },              // 事件（00_events.js 的名字：note、blast、rptShot、rptHit、survey、stepEnd、burnNews、boot:say…）
    off: function (t, fn) { return evOff(t, fn); },
    ready: function () { return SHAPI_READY; },                      // 開機的編成載好、可以開戰了（boot:ready）
    say: function () { return BOOT.say; },                           // 載入的那一行字
    /** 船型清單（堡壘 fixed）＋選船卡片的量測（排水量、砲、船員…；72_shippick.js SHIP_CARDS）。 */
    hulls: function () { return HULL_LIST.map(function (h) { return { id: h.id, name: h.name, fixed: !!h.fixed, author: author[h.id] || '', card: SHIP_CARDS[h.id] || null }; }); },
    loadHull: function (id) { return loadHull(id).then(function (T) { return T.id; }); },
    loaded: function (id) { return !!HULLT[id]; },
    /** 開戰：spec ＝ [{ team: 'blue'|'red', hull }]，第一艘是我艦（鏡頭的「我艦」）；船型要先載好。o：dist 開局船頭距離（m）、field 同時在場幾艘（其他的候補）、
     *  weather 天氣、mode 玩法（預設 eve 觀戰 ＝ 全部交給電腦）、staged 分段開（不卡畫面；回 Promise）。 */
    start: function (spec, o) {
      o = o || {};
      if (!spec || !spec.length || !spec.every(function (f) { return HULLT[f.hull]; })) return Promise.reject(new Error('船型還沒載好'));
      if (o.dist) DIST = clamp(Math.round(o.dist), LIM_DIST[0], LIM_DIST[1]);
      if (o.field) FIELD_N = clamp(Math.round(o.field), 2, MAX_SHIPS);
      if (o.weather) setWeather(o.weather);
      FLEET_DBG = spec.map(function (f) { return { team: f.team, hull: f.hull }; }); flowMode(o.mode || 'eve');
      if (o.staged) return startStaged();
      start(); return Promise.resolve();
    },
    ships: function () { return SHIPS; },
    state: function () { return { t: SIMT, running: RUNNING, paused: PAUSED, over: OVER, mode: MODE, speed: SIM_SPEED, staging: FLOW_STAGE, weather: WX_ID }; },
    run: function (on) { flowRun(!!on); },
    pause: function (on) { flowPause(!!on); },
    speed: function (x) { if (x !== undefined) simSpeedSet(x); return SIM_SPEED; },
    isOut: isOut,
    teamDown: teamDown,
    /** 一艘的狀況（都是 0～1，1 ＝ 完好）：float 離開始沉還有多少（sink ÷ 32_hull.js sinkFinalAt）、crew 還站得住的人、guns 還有人操作的砲、masts 還立著的桅。 */
    stat: function (sh) {
      if (!sh) return null;
      var fa = sinkFinalAt(sh);
      return { float: sh.sinkingFinal || sh.sunk ? 0 : clamp(1 - (sh.sink || 0) / (fa > 0 ? fa : 1), 0, 1), crew: (sh.able || 0) / Math.max(1, sh.crew0 || 1),
        guns: (sh.gunsManned || 0) / Math.max(1, sh.guns.length), masts: sh.masts.length ? (sh.mastsUp || 0) / sh.masts.length : 1 };
    },
    center: function (sh) { return sh && sh.M ? shipCenter(sh) : null; },
    /** 世界座標（公尺）⇒ 畫面座標（client px）：照上一格畫面的鏡頭（CAM.vp）；在鏡頭後面 ⇒ null。 */
    project: function (x, y, z) {
      var q = CAM.vp; if (!q) return null;
      var cw = q[3] * x + q[7] * y + q[11] * z + q[15]; if (cw < 0.05) return null;
      var c = M4.pt(q, x, y, z), r = cv.getBoundingClientRect();
      return { x: r.left + (c[0] / cw + 1) / 2 * r.width, y: r.top + (1 - c[1] / cw) / 2 * r.height, d: cw };
    },
    cam: {
      start: function () { camStart(); },
      see: function (sh) { camSee(sh); },                            // 看那一艘（跟著它、繞著它轉；我艦 ⇒ 看我艦）
      cycle: function () { camCycle(); },
      orbit: function (dx, dy) { camOrbit(dx, dy); },
      set: function (o) { camSet(o); },
      get: function () { return { mode: CAM.mode, yaw: CAM.yaw, pitch: CAM.pitch, dist: CAM.dist, aoff: CAM.aoff, see: CAM.see ? CAM.see.i : null, follow: !!CAM.follow }; }
    },
    weather: function (id) { if (id) setWeather(id); return WX_ID; },
    gfx: function (lv) { if (lv && GFX_PRESET[lv]) gfxSet(lv); return gfxLevel(); },
    /** 開聲音（瀏覽器要使用者點過才放得出聲）：外殼在使用者點擊時叫。 */
    resume: function () { initAudio(); if (AC && AC.state === 'suspended') AC.resume(); return AC ? AC.state : null; },
    /** 聲音：{ sfx, amb, bgm（0–1）, mute }；沒給的不動。 */
    sound: function (o) {
      o = o || {};
      ['sfx', 'amb', 'bgm'].forEach(function (k) { if (isFinite(o[k])) SND[k] = clamp(+o[k], 0, 1); });
      if ('mute' in o) muted = !!o.mute;
      sndApply(); return { sfx: SND.sfx, amb: SND.amb, bgm: SND.bgm, mute: muted };
    },
    /** 讓那艘降旗（照 32_hull.js strikeCheck 定了之後那幾步：記收場、廣播、降下旗）；已經降了、沉了 ⇒ false。 */
    strike: function (sh, why) {
      if (!sh || sh.struck || sh.sunk) return false;
      sh.struck = true; sh.fate = why || '降旗'; note(sh, sh.fate, true); strikeColors(sh); return true;
    },
    /** 咬一口（方舷放置的點船、技能）：那艘現在的水線（51_captain.js wlZ）往下 2 格、沿船長 fx（0～1）那一點、side（+1／−1）那一舷的外殼上，
     *  往裡挖一個半徑 r 格的球（照 removeVoxel：進水、尋路的髒區照常記 —— 跟 __game.dig 同一套）＋水花、碎木、一聲。
     *  亂數由外殼給（fx、side 自己抽；碎木的方向用 Math.random），⛔ 不抽戰局的亂數。回挖掉幾格（沉了、那一點沒有船殼 ⇒ 0）。 */
    bite: function (sh, fx, side, r) {
      if (!sh || sh.sunk || !sh.M) return 0;
      var T = sh.T, G = sh.grid, B = T.base, s = side < 0 ? -1 : 1, x = Math.round(T.hx0 + (T.hx1 - T.hx0) * clamp(+fx || 0.5, 0.05, 0.95)), z = Math.max(1, Math.round(wlZ(sh)) - 2), y = -1;
      for (var k = 0; k < B.sy && y < 0; k++) { var yy = s > 0 ? B.sy - 1 - k : k; if (G.get(x, yy, z) > 0) y = yy; }
      if (y < 0) return 0;
      r = clamp(Math.round(r || 5), 2, 24); y -= s * Math.round(r * 0.35);
      var n = 0, got = [];
      for (var a = -r; a <= r; a++) for (var b = -r; b <= r; b++) for (var c = -r; c <= r; c++) {
        if (a * a + b * b + c * c > r * r) continue;
        var col = removeVoxel(sh, x + a, y + b, z + c, true); if (col) { n++; if (got.length < 160) got.push(x + a, y + b, z + c, col); }
      }
      if (!n) return 0;
      if (sh.rs && sh.rs.update) sh.rs.update();
      var w = M4.pt(sh.M, x, y, z);
      splash(w, true); sfx('crack', w, 0.7);
      for (var j = 0; j < got.length; j += 4) spawnDebris(M4.pt(sh.M, got[j] + 0.5, got[j + 1] + 0.5, got[j + 2] + 0.5), add([(Math.random() - 0.5) * 6, 1 + Math.random() * 5, (Math.random() - 0.5) * 6], sh.vel), got[j + 3], 0.05 + Math.random() * 0.06, 6 + Math.random() * 6);
      return n;
    },
    out: function () { return coreOut(); },                          // 戰後狀態（57_core.js；src/CORE_API.md §2）
    add: function (o) { return coreAdd(o); }                         // 中途加船（§4）
  };
}

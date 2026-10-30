// ───────────────────────── 外殼 API（外掛外殼頁的程式跟核心講話；2026-10-30 gura，方舷放置） ─────────────────────────
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
     *  weather 天氣、mode 玩法（預設 eve 觀戰 ＝ 全部交給電腦）、staged 分段開（不卡畫面；回 Promise）、judge: false 核心不判勝負（外殼自己判、自己補船；57_core.js CORE_JUDGE）。 */
    start: function (spec, o) {
      o = o || {};
      if (!spec || !spec.length || !spec.every(function (f) { return HULLT[f.hull]; })) return Promise.reject(new Error('船型還沒載好'));
      CORE_JUDGE = o.judge !== false;
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
      get: function () { return { mode: CAM.mode, yaw: CAM.yaw, pitch: CAM.pitch, dist: CAM.dist, aoff: CAM.aoff, see: CAM.see ? CAM.see.i : null, follow: !!CAM.follow, eye: CAM.eye ? CAM.eye.slice() : null }; }   // eye：鏡頭在哪（世界座標）
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
    /** 畫面上那一點（client px）沿視線打到哪艘船的哪一格（照 71_input.js inPick：每艘船打 VK.raycast，砲帶的裝甲也算；帆不算 ⇒ 穿過帆打到後面的船身）。
     *  水面不擋（射線只看船的格子）、沉沒了還在往下沉的也算（sunk：32_hull.js 開始沉之後再沉 4.8 m 就記沉沒，船還看得到）⇒ 多深還算看得到由外殼照 w 的高度決定。
     *  回 { sh, p：那一格的格心（船的格座標）, d：視線在那艘格座標裡的方向（單位向量）, t：沿視線幾公尺, w：那一點的世界座標 }；沒打到 ⇒ null。只讀，不碰戰局。 */
    pick: function (cx, cy) {
      var q = CAM.inv; if (!q) return null;
      var r = cv.getBoundingClientRect(), nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2;
      var p0 = mul(M4.pt(q, nx, ny, -1), 1 / (q[3] * nx + q[7] * ny - q[11] + q[15])), d = norm(sub(mul(M4.pt(q, nx, ny, 1), 1 / (q[3] * nx + q[7] * ny + q[11] + q[15])), p0));
      var hit = null, on = null, hd = null;
      SHIPS.forEach(function (o) {
        if (!o.grid || !o.inv || !o.M) return;
        var oL = toLocal(o, p0), dL = M4.dir(o.inv, d[0], d[1], d[2]), h = VK.raycast(o.grid, oL, dL, 3000);
        if (o.arm) { var ha = armRay(o, oL, dL, 3000); if (ha && (!h || ha.t < h.t)) h = ha; }
        if (h && (!hit || h.t < hit.t)) { hit = h; on = o; hd = dL; }
      });
      if (!hit) return null;
      var p = [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5];
      return { sh: on, p: p, d: norm(hd), t: hit.t, w: M4.pt(on.M, p[0], p[1], p[2]) };
    },
    /** 咬一口（方舷放置的點船、技能）。at ＝ [x, y, z] 格座標（pick 的 p）⇒ 中心在那一點沿 dir（pick 的 d）往裡 0.35 r；
     *  at ＝ { fx, side, dz } ⇒ 那艘現在的水線（51_captain.js wlZ）＋dz 格（預設 −2）、沿船長 fx（0～1）、side（+1／−1；0 ＝ 對著鏡頭的那一舷）那一舷的外殼，往裡 0.35 r。
     *  形狀：半徑 r 格的球，繞著咬的方向一圈照角度削成鋸齒（牙印）；照 removeVoxel 挖（進水、尋路的髒區照常記 —— 跟 __game.dig 同一套）＋碎木往咬出來的方向噴、一聲、那一點底下的水面濺起來。
     *  水面下也咬得到（沉沒了還在往下沉的也算）。亂數由外殼給（fx、side 外殼抽；碎木的方向用 Math.random），⛔ 不抽戰局的亂數。
     *  回 { n：挖掉幾格, w：中心的世界座標 }；那裡沒有船身 ⇒ null。 */
    bite: function (sh, at, r, dir) {
      if (!sh || !sh.M || !sh.grid) return null;
      r = clamp(Math.round(r || 5), 2, 24);
      var T = sh.T, G = sh.grid, B = T.base, k = r * 0.35, x, y, z, nd;
      if (Array.isArray(at)) {
        nd = dir && len(dir) > 1e-6 ? norm(dir) : [0, 0, -1];
        x = Math.round(at[0] + nd[0] * k); y = Math.round(at[1] + nd[1] * k); z = Math.round(at[2] + nd[2] * k);
      } else {
        at = at || {};
        var s = at.side > 0 ? 1 : at.side < 0 ? -1 : toLocal(sh, CAM.eye)[1] > toLocal(sh, shipCenter(sh))[1] ? 1 : -1;
        x = Math.round(T.hx0 + (T.hx1 - T.hx0) * clamp(+at.fx || 0.5, 0.05, 0.95)); z = Math.max(1, Math.round(wlZ(sh) + (isFinite(at.dz) ? +at.dz : -2))); y = -1;
        for (var j = 0; j < B.sy && y < 0; j++) { var yy = s > 0 ? B.sy - 1 - j : j; if (G.get(x, yy, z) > 0) y = yy; }
        if (y < 0) return null;
        nd = [0, -s, 0]; y -= s * Math.round(k);
      }
      // 牙印：u、v 跟咬的方向 nd 垂直；半徑照繞著 nd 的角度在 0.7 r～r 之間走三角波（一圈 tn 顆牙）
      var hv = Math.abs(nd[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u = norm([nd[1] * hv[2] - nd[2] * hv[1], nd[2] * hv[0] - nd[0] * hv[2], nd[0] * hv[1] - nd[1] * hv[0]]);
      var v = [nd[1] * u[2] - nd[2] * u[1], nd[2] * u[0] - nd[0] * u[2], nd[0] * u[1] - nd[1] * u[0]], tn = Math.max(7, Math.round(r * 1.3)), n = 0, got = [];
      for (var a = -r; a <= r; a++) for (var b = -r; b <= r; b++) for (var c = -r; c <= r; c++) {
        var q2 = a * a + b * b + c * c; if (q2 > r * r) continue;
        var g = Math.atan2(a * v[0] + b * v[1] + c * v[2], a * u[0] + b * u[1] + c * u[2]) / 6.28319 * tn, R = r * (1 - 0.3 * Math.abs(g - Math.floor(g) - 0.5) * 2);
        if (q2 > R * R) continue;
        var col = removeVoxel(sh, x + a, y + b, z + c, true); if (col) { n++; if (got.length < 240) got.push(x + a, y + b, z + c, col); }
      }
      if (!n) return null;
      if (sh.rs && sh.rs.update) sh.rs.update();
      var w = M4.pt(sh.M, x, y, z), ow = norm(M4.dir(sh.M, -nd[0], -nd[1], -nd[2]));   // ow：咬出來的方向（世界）⇒ 碎木往那邊噴
      splash([w[0] + ow[0] * 1.5, 0, w[2] + ow[2] * 1.5], w[1] < 4);              // 鯊魚從那一點下面的水裡跳出來
      sfx('crack', w, 0.7);
      for (var m = 0; m < got.length; m += 4) spawnDebris(M4.pt(sh.M, got[m] + 0.5, got[m + 1] + 0.5, got[m + 2] + 0.5), add(add(mul(ow, 3 + Math.random() * 6), [(Math.random() - 0.5) * 4, 1 + Math.random() * 4, (Math.random() - 0.5) * 4]), sh.vel), got[m + 3], 0.05 + Math.random() * 0.07, 6 + Math.random() * 6);
      return { n: n, w: w };
    },
    /** 憑空一發（方舷放置撿到的特殊武器：天降砲擊、噴火）：從 from 飛到 to（世界座標，公尺）—— 照重力算好初速，正好落在 to（砲彈只吃重力，21_gunnery.js stepBall）。
     *  o：kind 'solid' 實心（預設；洞照 hole）／'shell' 爆裂彈（炸開的半徑 ∝ ∛彈重）／'fire' 希臘火（碰到就潑開、點火延燒，28_fire.js gfSplash）；
     *     v 初速（m/s；預設 160）、m 彈重（kg；預設 10.9 ＝ 爆裂彈半徑的基準，上限 300）、dmg 每發傷害（對砲、對人；預設 1）、hole 洞的半徑倍率（實心；預設 1、上限 3）、
     *     owner 記在哪艘頭上（命中數、rptHit；沒給 ⇒ 我艦）、fx false ⇒ 出手那一點不要火光與聲音。
     *  ⛔ 不叫 rptShot（外殼在 rptShot 改的倍率不套到這一發）、不抽亂數出手（沒有散布）；⚠ 命中那一下照開砲那一條（impact）會抽戰局的亂數 ⇒ 之後的戰局跟沒打的不同。回那顆彈。 */
    shot: function (from, to, o) {
      o = o || {};
      var own = o.owner || SHIPS[PLAYER_I]; if (!own || !from || !to) return null;
      var V = clamp(+o.v || 160, 10, 600), d = sub(to, from), t = Math.max(0.05, len(d) / V), kind = o.kind || 'solid';
      var v = [d[0] / t, d[1] / t + 0.5 * G * t, d[2] / t];               // 吃了 t 秒重力正好落到 to
      var b = { p: from.slice(), v: v, owner: own.i, ammo: kind === 'shell' ? 1 : kind === 'fire' ? AMMO_GF : 0, trav: 0, alive: true, age: 0, bounced: false, big: false,
        hole: clamp(+o.hole || 1, 0.3, 3), dmg: +o.dmg > 0 ? +o.dmg : 1, m: clamp(+o.m || PEN.ref, 1, 300), api: true };
      if (kind === 'fire') b.gf = true;
      BALLS.push(b);
      if (o.fx !== false) {
        var dir = norm(v);
        if (kind === 'fire') evEmit('gfJet', from.slice(), dir, [0, 0, 0]);
        else { flash(add(from, dir), dir, 14, false); smoke(add(from, mul(dir, 1.5)), dir, 10, false); sfx('boom', from, 1); }
      }
      return b;
    },
    out: function () { return coreOut(); },                          // 戰後狀態（57_core.js；src/CORE_API.md §2）
    add: function (o) { return coreAdd(o); },                        // 中途加船（§4）
    addStaged: function (o) { return coreAddStaged(o); }             // 中途加船、分段做（不卡畫面；回 Promise<船｜null>；§4）
  };
}

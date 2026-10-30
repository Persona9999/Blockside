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
/** 畫面上那一點（client px）的視線：o ＝ 近裁切面上那一點、d ＝ 方向（世界座標，單位向量）；鏡頭還沒算好 ⇒ null（pick、ray 共用）。 */
function shapiRay(cx, cy) {
  var q = CAM.inv; if (!q) return null;
  var r = cv.getBoundingClientRect(), nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2;
  var p0 = mul(M4.pt(q, nx, ny, -1), 1 / (q[3] * nx + q[7] * ny - q[11] + q[15]));
  return { o: p0, d: norm(sub(mul(M4.pt(q, nx, ny, 1), 1 / (q[3] * nx + q[7] * ny + q[11] + q[15])), p0)) };
}
/** pick 的模型那一段：射線（船的格座標 oL、dL，t 跟 VK.raycast 同單位）打到 tMax 以前最近的那個還在的模型。換座標照 21_gunnery.js hitModel（砲塔上的 m.hd、帆桁／迴旋砲的 rot）；
 *  先跟外框（外擴一格）量一段，在那一段裡每半格看佔用格（inMesh）。螺旋槳（m.vox）有自己的格 ⇒ 裝甲那一條（armRay）已經量了。回跟 VK.raycast 一樣（x,y,z ＝ 落點那一格）＋ m；沒有 ⇒ null。 */
function shapiMdlRay(o, oL, dL, tMax) {
  var best = null, st = 0.5 / Math.max(1e-6, len(dL));
  o.models.forEach(function (m) {
    if (!m.alive || m.vox) return;
    var P = m.hd ? ndIn(m.hd, oL) : oL, D = m.hd ? ndIn(m.hd, dL, true) : dL;
    if (m.rot && m.piv) { P = unrotL(m, P); D = rotZ(D, [0, 0, 0], -m.rot); }
    var b = m.bb, t0 = 0, t1 = best ? best.t : tMax;
    for (var i = 0; i < 3 && t0 <= t1; i++) {
      if (Math.abs(D[i]) < 1e-9) { if (P[i] < b[i] - 1 || P[i] > b[i + 3] + 1) t1 = -1; continue; }
      var ta = (b[i] - 1 - P[i]) / D[i], tb = (b[i + 3] + 1 - P[i]) / D[i];
      t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
    }
    for (var t = t0; t <= t1; t += st) if (inMesh(m, [P[0] + D[0] * t, P[1] + D[1] * t, P[2] + D[2] * t])) { best = { t: t, m: m }; break; }
  });
  if (!best) return null;
  var L = [oL[0] + dL[0] * best.t, oL[1] + dL[1] * best.t, oL[2] + dL[2] * best.t];
  return { x: Math.floor(L[0]), y: Math.floor(L[1]), z: Math.floor(L[2]), t: best.t, m: best.m };
}
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
        guns: (sh.gunsManned || 0) / Math.max(1, sh.guns.length), masts: sh.masts.length ? (sh.mastsUp || 0) / sh.masts.length : 1,
        sink: sh.sink || 0, deck: sh.T && sh.T.topDeck !== undefined ? sh.T.topDeck : null };   // sink：比設計水線多吃水幾 m；deck：頂層甲板在船中央離設計水線多高（m，32_hull.js sinkLineT；沒有甲板 meta ⇒ null）
    },
    center: function (sh) { return sh && sh.M ? shipCenter(sh) : null; },
    /** 世界座標 (x, z) 那一點現在的海面高度（公尺；08_sea.js seaH，浪照現在的模擬時間）：外殼判「咬在水線下」用。只讀。 */
    seaY: function (x, z) { return seaH(x, z, SIMT); },
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
    /** 物理效果分級（09_phx.js）：lv ＝ 'full'|'high'|'mid'|'low'（PHX_PRESET）或 { 項目: 第幾檔 }（PHX_ITEMS 的 k；沒給的不動、超出範圍夾回去）。
     *  帆與繩、碎木、煙與水花馬上換；模擬步長、進水模式開戰時才定 ⇒ 下一場生效（70_flow.js resetSteps）。回現在那一檔（四檔都對不上 ⇒ 'custom'）。 */
    phx: function (lv) {
      if (typeof lv === 'string' && PHX_PRESET[lv]) phxSet(lv);
      else if (lv && typeof lv === 'object') PHX_ITEMS.forEach(function (it) { var v = parseInt(lv[it.k], 10); if (isFinite(v)) PHX[it.k] = clamp(v, 0, it.opt.length - 1); });
      if (lv) phxSync();
      return phxLevel();
    },
    /** 物理設定頁要的：{ level, v：{ 項目: 第幾檔 }, items：[{ k, name, opt }]（PHX_ITEMS 的拷貝）, preset：核心的四檔, hz：這一場的模擬步長 }。 */
    phxInfo: function () {
      return { level: phxLevel(), v: JSON.parse(JSON.stringify(PHX)), items: PHX_ITEMS.map(function (it) { return { k: it.k, name: it.name, opt: it.opt.slice() }; }),
        preset: JSON.parse(JSON.stringify(PHX_PRESET)), hz: Math.round(1 / DT) };
    },
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
    /** 讓那艘開始沉（跟 32_hull.js「進水太多，開始沉了」同一條：sinkingFinal ⇒ 照進水速度往下沉，沉到開始沉的線再下 4.8 m 記沉沒）。
     *  給外殼收拾打不沉的破船：開始沉的線不低於 4.2 m（sinkLineT）⇒ 吃水淺的船灌滿水了木頭還浮著、泡在水面停住。已經在沉、沉了、降旗了 ⇒ false。 */
    scuttle: function (sh, why) {
      if (!sh || sh.sinkingFinal || sh.sunk || sh.struck) return false;
      sh.sinkingFinal = true; sh.fate = why || '開始沉了'; note(sh, sh.fate, true); return true;
    },
    /** 測試模式的記錄（83_testlog.js：船員的路徑與事件、砲的開火與狀態；只讀 ⇒ 開著關著戰局逐位元組相同）。
     *  on：true 開（這一場從現在起記，之後每一場從開戰起）／false 停（這一場停記，記好的留著拿得到；之後不記）／null 回到核心自己的開關（?test=1）。
     *  teams：只記這幾隊（例 ['blue']；省略 ⇒ 全部）。回現在記不記。 */
    tlog: function (on, teams) {
      TLOG_SHELL = on === true || on === false ? on : null; TLOG_TEAMS = teams && teams.length ? teams.slice() : null;
      if (on === true && (!TLOG || TLOG.off !== undefined)) {
        if (TLOG) { var off = TLOG.off; TLOG.ev.push([+SIMT.toFixed(1), -1, -1, 'resume', off]); delete TLOG.off; TLOG.gun.last.forEach(function (L) { L.shotT = SIMT; L.bearT = null; if (L.q) { L.q.to = off; L.q.end = 'pause'; L.q = null; } }); }   // 暫停那一段不算沒開火：從現在重新起算
        else tlgReset();
      }
      else if (on === false && TLOG && TLOG.off === undefined) TLOG.off = +SIMT.toFixed(1);
      return !!TLOG && TLOG.off === undefined;
    },
    /** 這一場的整份記錄（tlgData）＋戰鬥報表（79_report.js rptData）；沒在記 ⇒ null。 */
    tlogData: function () { var d = tlgData(); if (d) d.report = rptData(); return d; },
    /** 輕的讀數（外殼每秒問一次也不貴）：記了幾點、幾筆、開了幾發、沒開火的那幾段。 */
    tlogInfo: function () {
      if (!TLOG) return null;
      return { on: TLOG.off === undefined, points: TLOG.n, ev: TLOG.ev.length, shots: TLOG.gun.ev.filter(function (e) { return e[3] === 's'; }).length,
        quiet: TLOG.gun.quiet.map(function (q) { return Object.assign({}, q, { n: q.n.slice() }); }) };   // quiet[].ship ＝ 記錄裡的固定編號、name ＝ 那艘的名字
    },
    /** 畫面上那一點（client px）沿視線打到哪艘船的哪一格（照 71_input.js inPick：每艘船打 VK.raycast，砲帶的裝甲（砲塔的殼）也算；帆不算 ⇒ 穿過帆打到後面的船身）。
     *  船上的模型（舵輪、砲、門…）也打得到：照模型的佔用格（shapiMdlRay；Tim 2026-10-30 方舷放置：「旋轉砲塔(莫尼特號) 無法被咬(瞄準不到) 還有一些物件也是(舵輪)」）。
     *  水面不擋（射線只看船的格子）、沉沒了還在往下沉的也算（sunk：32_hull.js 開始沉之後再沉 4.8 m 就記沉沒，船還看得到）⇒ 多深還算看得到由外殼照 w 的高度決定。
     *  回 { sh, p：那一格的格心（船的格座標）, d：視線在那艘格座標裡的方向（單位向量）, t：沿視線幾公尺, w：那一點的世界座標, m：打到的是模型 ⇒ 那個模型 }；沒打到 ⇒ null。只讀，不碰戰局。 */
    pick: function (cx, cy) {
      var R = shapiRay(cx, cy); if (!R) return null;
      var p0 = R.o, d = R.d, hit = null, on = null, hd = null;
      SHIPS.forEach(function (o) {
        if (!o.grid || !o.inv || !o.M) return;
        var oL = toLocal(o, p0), dL = M4.dir(o.inv, d[0], d[1], d[2]), h = VK.raycast(o.grid, oL, dL, 3000);
        if (o.arm) { var ha = armRay(o, oL, dL, 3000); if (ha && (!h || ha.t < h.t)) h = ha; }
        var hm = shapiMdlRay(o, oL, dL, h ? h.t : 3000); if (hm) h = hm;
        if (h && (!hit || h.t < hit.t)) { hit = h; on = o; hd = dL; }
      });
      if (!hit) return null;
      var p = [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5];
      return { sh: on, p: p, d: norm(hd), t: hit.t, w: M4.pt(on.M, p[0], p[1], p[2]), m: hit.m || null };
    },
    /** 畫面上那一點（client px）的視線（世界座標）：{ o：近裁切面上那一點, d：方向（單位向量）}；鏡頭還沒算好 ⇒ null。只讀。
     *  2026-10-30 方舷放置的鏈彈：點在帆、桅杆上（pick 不算帆）⇒ 照視線上離那艘船心最近的那一點打。 */
    ray: function (cx, cy) { var R = shapiRay(cx, cy); return R && { o: R.o.slice(), d: R.d.slice() }; },
    /** 畫面上那一點（client px）沿視線落在海面的哪裡（世界座標；海面照 08_sea.js seaH，有浪 ⇒ 疊代三次）；朝上看、落在鏡頭後面 ⇒ null。只讀。
     *  2026-10-30 方舷放置的火藥桶（Tim：「可以點在海水上會變水雷」）：點到海 ⇒ 水雷放在那裡。 */
    seaAt: function (cx, cy) {
      var q = CAM.inv; if (!q) return null;
      var r = cv.getBoundingClientRect(), nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2;
      var p0 = mul(M4.pt(q, nx, ny, -1), 1 / (q[3] * nx + q[7] * ny - q[11] + q[15])), d = norm(sub(mul(M4.pt(q, nx, ny, 1), 1 / (q[3] * nx + q[7] * ny + q[11] + q[15])), p0));
      if (d[1] > -1e-4) return null;
      var y = 0, p = null;
      for (var i = 0; i < 3; i++) { var t = (y - p0[1]) / d[1]; if (t < 0) return null; p = [p0[0] + d[0] * t, y, p0[2] + d[2] * t]; y = seaH(p[0], p[2], SIMT); }
      p[1] = y; return p;
    },
    /** 哪一艘的船身碰到世界座標 w（那一點 r 格內有船身的格；沉沒了的不算）：第一艘 ⇒ 那艘；都沒有 ⇒ null。只讀（先照格子盒的外接球篩）。水雷用。 */
    hullAt: function (w, r) {
      r = clamp(Math.round(r || 4), 0, 12);
      for (var i = 0; i < SHIPS.length; i++) {
        var o = SHIPS[i]; if (!o.grid || !o.M || !o.inv || o.sunk) continue;
        var B = o.T.base, cc = M4.pt(o.M, B.sx / 2, B.sy / 2, B.sz / 2), rb = 0.5 * S * Math.hypot(B.sx, B.sy, B.sz);
        if (len(sub(cc, w)) > rb + r * S) continue;
        var c = toLocal(o, w), x0 = Math.round(c[0]), y0 = Math.round(c[1]), z0 = Math.round(c[2]);
        for (var x = x0 - r; x <= x0 + r; x++) for (var y = y0 - r; y <= y0 + r; y++) for (var z = z0 - r; z <= z0 + r; z++) if (o.grid.get(x, y, z) > 0) return o;
      }
      return null;
    },
    /** 在世界座標 w 炸開（火藥桶、水雷；23_powder.js 殉爆波及那一套 blastNear：半徑 R 格內的每一艘挖彈坑、傷人、炸模型 —— 艙裡的火藥桶照樣會連鎖）。
     *  o：{ name：被波及的那艘的廣播寫「被 name 的殉爆波及」, f：威力倍率（人、模型；彈坑照 R）, fx：false ⇒ 不要火球、煙、聲音 }。回這一下排了幾個彈坑（＝ 碰到幾艘）。
     *  ⚠ 傷人照開砲那一條會抽戰局的亂數（跟 shot 一樣）。 */
    blast: function (w, R, o) {
      o = o || {}; if (!w) return 0;
      R = clamp(+R || 20, 4, 80);
      var n0 = BLASTS.length;
      if (o.fx !== false) {
        flash(w, [0, 1, 0], Math.round(40 + R * 2), true);
        for (var i = 0; i < 30 + R; i++) spawnPt(add(w, [gaussX() * R * 0.03, rrX(0, R * 0.05), gaussX() * R * 0.03]), [gaussX() * 10, rrX(5, 22), gaussX() * 10], rrX(0.6, 1.6), [1, rrX(0.4, 0.75), 0.12], 0.95, rrX(2, 5), rrX(4, 9), 2, 1.5, 3);   // 火球的粒子用畫面的亂數（12_effects.js RNG_X）⇒ 不抽戰局的
        smoke(w, [0, 1, 0], Math.round(30 + R * 1.5), true);
        if (Math.abs(w[1] - seaH(w[0], w[2], SIMT)) < 1.5) splash(w, true);      // 水面上炸開（水雷）⇒ 水柱
        sfx('blast', w, clamp(R / 30, 0.6, 1.6));
      }
      blastNear({ name: o.name || '爆炸' }, w, R, +o.f > 0 ? +o.f : 1);
      return BLASTS.length - n0;
    },
    /** 咬一口（方舷放置的點船、技能）。at ＝ [x, y, z] 格座標（pick 的 p）⇒ 中心在那一點沿 dir（pick 的 d）往裡 0.35 r；
     *  at ＝ { fx, side, dz } ⇒ 那艘現在的水線（51_captain.js wlZ）＋dz 格（預設 −2）、沿船長 fx（0～1）、side（+1／−1；0 ＝ 對著鏡頭的那一舷）那一舷的外殼，往裡 0.35 r。
     *  形狀：半徑 r 格的球，繞著咬的方向一圈照角度削成鋸齒（牙印）；照 removeVoxel 挖（進水、尋路的髒區照常記 —— 跟 __game.dig 同一套）＋碎木往咬出來的方向噴、一聲、那一點底下的水面濺起來。
     *  裝甲（砲塔的殼、砲帶的裝甲、螺旋槳）照同一個牙印打掉（armRemove）；牙印咬進外框的模型（舵輪、砲、門、火藥桶…）整個咬掉（damageModel 扣光血）。
     *  水面下也咬得到（沉沒了還在往下沉的也算）。亂數由外殼給（fx、side 外殼抽；碎木的方向用 Math.random），⛔ 挖格子不抽戰局的亂數；⚠ 咬到模型照被打飛那一套（blowModel、砲旁的藥箱、火藥桶殉爆）會抽。
     *  回 { n：挖掉幾格（含裝甲）, arm：其中裝甲幾格, mdl：咬掉幾個模型, w：中心的世界座標 }；那裡什麼都沒有 ⇒ null。 */
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
      var v = [nd[1] * u[2] - nd[2] * u[1], nd[2] * u[0] - nd[0] * u[2], nd[0] * u[1] - nd[1] * u[0]], tn = Math.max(7, Math.round(r * 1.3)), n = 0, na = 0, nm = 0, got = [];
      function tooth(a, b, c) {                                           // 離中心 (a, b, c) 格那一格在不在牙印裡
        var q2 = a * a + b * b + c * c; if (q2 > r * r) return false;
        var g = Math.atan2(a * v[0] + b * v[1] + c * v[2], a * u[0] + b * u[1] + c * u[2]) / 6.28319 * tn, R = r * (1 - 0.3 * Math.abs(g - Math.floor(g) - 0.5) * 2);
        return q2 <= R * R;
      }
      for (var a = -r; a <= r; a++) for (var b = -r; b <= r; b++) for (var c = -r; c <= r; c++) {
        if (!tooth(a, b, c)) continue;
        var col = removeVoxel(sh, x + a, y + b, z + c, true); if (col) { n++; if (got.length < 240) got.push(x + a, y + b, z + c, col); }
      }
      // 裝甲（砲帶的、砲塔的殼、螺旋槳；24_armor.js）：同一個牙印，那塊的每一格照它現在的角度換回船的座標比；照 armRemove 打掉（跟 armBlast 同一套）
      //   ⛔ 以前只挖船殼 ⇒ 咬在莫尼特號的砲塔上一格都沒掉（pick 打得到殼，bite 回 null）
      if (sh.arm) sh.arm.forEach(function (A) {
        if (A.prop && propGone(A)) return;
        var Q = armIn(A, [x, y, z]), bb = A.A.bb, e = r + 2;
        for (var az = Math.max(bb[2], Math.floor(Q[2] - e)); az <= Math.min(bb[5], Math.ceil(Q[2] + e)); az++)
          for (var ay = Math.max(bb[1], Math.floor(Q[1] - e)); ay <= Math.min(bb[4], Math.ceil(Q[1] + e)); ay++)
            for (var ax = Math.max(bb[0], Math.floor(Q[0] - e)); ax <= Math.min(bb[3], Math.ceil(Q[0] + e)); ax++) {
              if (!A.grid.get(ax, ay, az)) continue;
              var P = armOut(A, [ax, ay, az]); if (!tooth(P[0] - x, P[1] - y, P[2] - z)) continue;
              var ac = armRemove(sh, A, ax, ay, az); if (ac) { n++; na++; if (got.length < 240) got.push(P[0], P[1], P[2], ac); }
            }
      });
      var w = M4.pt(sh.M, x, y, z), ow = norm(M4.dir(sh.M, -nd[0], -nd[1], -nd[2]));   // ow：咬出來的方向（世界）⇒ 碎木往那邊噴
      // 模型（舵輪、砲、門、火藥桶…）：牙印咬進外框 ⇒ 整個咬掉（damageModel 扣光血 ⇒ 照被打飛那一套飛出去；火藥桶 ⇒ 點著、殉爆）
      //   中心到外框（換到模型的座標，同 shapiMdlRay）不到 0.8 r。⛔ 照模型的中心 m.c 量 ⇒ 舵輪咬在輪緣上，中心在半徑外，一口都沒咬到（量過：餘燼號 r 5）
      sh.models.forEach(function (M) {
        if (!M.alive || M.vox) return;
        var Q = M.hd ? ndIn(M.hd, [x, y, z]) : [x, y, z]; if (M.rot && M.piv) Q = unrotL(M, Q);
        var X = M.bb, dx = Math.max(X[0] - Q[0], 0, Q[0] - X[3]), dy = Math.max(X[1] - Q[1], 0, Q[1] - X[4]), dz = Math.max(X[2] - Q[2], 0, Q[2] - X[5]);
        if (dx * dx + dy * dy + dz * dz > 0.64 * r * r) return;
        damageModel(sh, M, add(mul(ow, 8), sh.vel), Math.max(1, M.hp) + 1); if (!M.alive || M.lit) nm++;
      });
      if (!n && !nm) return null;
      if (n && sh.rs && sh.rs.update) sh.rs.update();
      splash([w[0] + ow[0] * 1.5, 0, w[2] + ow[2] * 1.5], w[1] < 4);              // 鯊魚從那一點下面的水裡跳出來
      sfx('crack', w, 0.7);
      for (var m = 0; m < got.length; m += 4) spawnDebris(M4.pt(sh.M, got[m] + 0.5, got[m + 1] + 0.5, got[m + 2] + 0.5), add(add(mul(ow, 3 + Math.random() * 6), [(Math.random() - 0.5) * 4, 1 + Math.random() * 4, (Math.random() - 0.5) * 4]), sh.vel), got[m + 3], 0.05 + Math.random() * 0.07, 6 + Math.random() * 6);
      return { n: n, w: w, arm: na, mdl: nm };
    },
    /** 切一刀（方舷放置的高壓水柱；Tim 2026-10-30「按住持續噴射 可以平整切割出一條線斬斷船體」）：從 from 射出去的水柱，這一格從打在 a 掃到打在 b（世界座標，公尺）。
     *  挖掉 from、a、b 張開的那一片（扇形）上、離那一片不到 w 格的船殼：每條射線從打到的那一點前 1 格一直挖到後面 pen 公尺 ⇒ 平的一道縫、穿過整個船身。
     *  切斷了龍骨（切過的那一段龍骨層 z ≤ 12 從船尾那頭灌不到船頭那頭；斜著切也算）⇒ 照 breakShip 那一套只留長的那半截當錨 ⇒ 短的那半截在下一步的連通判定裡斷開、倒下落水（22_pieces.js）。
     *  o：w 縫的一半寬（格；預設 1.2、1～4）、pen 穿多深（公尺；預設 20）、fx false ⇒ 不噴水花與碎木。照 removeVoxel 挖（進水、尋路髒區、斷開的一團照常）；
     *  ⛔ 不抽戰局的亂數（碎木的方向用 Math.random）、不碰裝甲與模型。回 { n：挖掉幾格, w：b 那一點, broke：這一刀切斷了龍骨（斷在 x ＝ broke 格）｜0 }；什麼都沒切到 ⇒ null。 */
    cut: function (sh, from, a, b, o) {
      if (!sh || !sh.M || !sh.grid || !from || !a || !b) return null;
      o = o || {};
      var G = sh.grid, B = sh.T.base, w = clamp(+o.w || 1.2, 1, 4), pen = clamp(+o.pen || 20, 1, 80) / S, w2 = w * w, wi = Math.ceil(w);
      var E = toLocal(sh, from), A = toLocal(sh, a), Bp = toLocal(sh, b), ab = len(sub(Bp, A)), ns = Math.max(1, Math.ceil(ab / 0.7));
      var seen = new Set(), n = 0, got = [], keelX = {};
      for (var s = 0; s <= ns; s++) {
        var P = add(A, mul(sub(Bp, A), s / ns)), d = sub(P, E), dl = len(d); if (dl < 1e-6) continue;
        var u = mul(d, 1 / dl), nl = Math.ceil((pen + 1) / 0.7);
        for (var k = 0; k <= nl; k++) {
          var q = add(P, mul(u, k * 0.7 - 1));
          if (q[0] < -wi || q[1] < -wi || q[2] < -wi || q[0] > B.sx + wi || q[1] > B.sy + wi || q[2] > B.sz + wi) continue;
          for (var cz = Math.floor(q[2] - w); cz <= Math.floor(q[2] + w); cz++) for (var cy = Math.floor(q[1] - w); cy <= Math.floor(q[1] + w); cy++) for (var cx = Math.floor(q[0] - w); cx <= Math.floor(q[0] + w); cx++) {
            if (cx < 0 || cy < 0 || cz < 0 || cx >= B.sx || cy >= B.sy || cz >= B.sz) continue;
            var ex = cx + 0.5 - q[0], ey = cy + 0.5 - q[1], ez = cz + 0.5 - q[2]; if (ex * ex + ey * ey + ez * ez > w2) continue;
            var key = VK.pack(cx, cy, cz); if (seen.has(key)) continue; seen.add(key);
            if (!G.get(cx, cy, cz)) continue;
            var col = removeVoxel(sh, cx, cy, cz, true); if (!col) continue;
            n++; if (cz <= 12) keelX[cx] = 1;
            if (got.length < 160 && (n & 3) === 0) got.push(cx, cy, cz, col);
          }
        }
      }
      if (!n) return null;
      if (sh.rs && sh.rs.update) sh.rs.update();
      // 龍骨斷了沒：照連通判（⛔ 照「某個 x 整個斷面一格不剩」⇒ 斜著切過去的一刀每個 x 只切掉一部分，永遠判不斷）——
      //   這艘被水柱切過的龍骨層（z ≤ 12，sh.cutK ＝ 切過的 x 範圍，一刀一刀累積）兩頭各外推 2 格當一段，從船尾那頭的龍骨格灌（6 連通、只走這一段的龍骨層）；
      //   兩頭都有龍骨格、灌不到船頭那頭 ⇒ 斷了：錨只留長的那半截、切過那一段以外（同 breakShip 的 sh.keel；另一半在下一步的連通判定裡斷開）。已經斷過 ⇒ 只看還是錨的那一段。
      var broke = 0, K = sh.keel || [0, 1 << 12], kx = Object.keys(keelX).map(Number);
      if (kx.length) {
        var ck = sh.cutK || (sh.cutK = [Infinity, -Infinity]);
        ck[0] = Math.min(ck[0], Math.min.apply(null, kx)); ck[1] = Math.max(ck[1], Math.max.apply(null, kx));
        var x0 = Math.max(K[0], ck[0] - 2), x1 = Math.min(K[1], ck[1] + 2, B.sx - 1), sy = B.sy, nzk = 13, wx = x1 - x0 + 1;
        if (wx > 2) {
          var vis = new Uint8Array(wx * sy * nzk), st = [], end1 = false, has1 = false, has0 = false;
          for (var yy = 0; yy < sy; yy++) for (var zz = 0; zz < nzk; zz++) {
            if (G.get(x1, yy, zz)) has1 = true;
            if (G.get(x0, yy, zz)) { has0 = true; vis[(zz * sy + yy) * wx] = 1; st.push(x0, yy, zz); }
          }
          while (st.length && !end1) {
            var pz = st.pop(), py = st.pop(), px = st.pop();
            if (px === x1) { end1 = true; break; }
            for (var nb = 0; nb < 6; nb++) {
              var qx = px + (nb === 0 ? 1 : nb === 1 ? -1 : 0), qy = py + (nb === 2 ? 1 : nb === 3 ? -1 : 0), qz = pz + (nb === 4 ? 1 : nb === 5 ? -1 : 0);
              if (qx < x0 || qx > x1 || qy < 0 || qy >= sy || qz < 0 || qz >= nzk) continue;
              var vi = (qz * sy + qy) * wx + (qx - x0); if (vis[vi] || !G.get(qx, qy, qz)) continue;
              vis[vi] = 1; st.push(qx, qy, qz);
            }
          }
          if (has0 && has1 && !end1) broke = Math.round((ck[0] + ck[1]) / 2);
        }
      }
      if (broke) {
        var T = sh.T, lo = Math.max(K[0], T.wl0 !== undefined ? T.wl0 : T.hx0), hi = Math.min(K[1], T.wl1 !== undefined ? T.wl1 : T.hx1), keepAft = broke - lo >= hi - broke;   // 長短照水線那一段（同 breakShip；⛔ 照格子的框 ⇒ 船頭那邊空的格也算長，留錯半截）
        sh.keel = keepAft ? [K[0], x0] : [x1, K[1]];
        sh.breakX = broke; sh.breakSide = keepAft ? 1 : -1; sh.cutK = null;
      }
      var wb = b.slice(), dw = norm(sub(b, from));
      if (o.fx !== false) {
        if (Math.abs(wb[1] - seaH(wb[0], wb[2], SIMT)) < 2) splash([wb[0], 0, wb[2]], false);
        for (var m = 0; m < got.length; m += 4) spawnDebris(M4.pt(sh.M, got[m] + 0.5, got[m + 1] + 0.5, got[m + 2] + 0.5), add(add(mul(dw, 4 + Math.random() * 6), [(Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3]), sh.vel), got[m + 3], 0.03 + Math.random() * 0.05, 3 + Math.random() * 4);
      }
      return { n: n, w: wb, broke: broke };
    },
    /** 憑空一發（方舷放置撿到的特殊武器：天降砲擊、噴火）：從 from 飛到 to（世界座標，公尺）—— 照重力算好初速，正好落在 to（砲彈只吃重力，21_gunnery.js stepBall）。
     *  o：kind 'solid' 實心（預設；洞照 hole）／'shell' 爆裂彈（炸開的半徑 ∝ ∛彈重）／'chain' 鏈彈（橫著一片：斷繩、撕帆、扣帆桁的血，21_gunnery.js cutRig）／'fire' 希臘火（碰到就潑開、點火延燒，28_fire.js gfSplash）；
     *     v 初速（m/s；預設 160）、m 彈重（kg；預設 10.9 ＝ 爆裂彈半徑的基準，上限 300）、dmg 每發傷害（對砲、對人；預設 1）、hole 洞的半徑倍率（實心；預設 1、上限 3）、
     *     owner 記在哪艘頭上（命中數、rptHit；沒給 ⇒ 我艦）、fx false ⇒ 出手那一點不要火光與聲音。
     *  ⛔ 不叫 rptShot（外殼在 rptShot 改的倍率不套到這一發）、不抽亂數出手（沒有散布）；⚠ 命中那一下照開砲那一條（impact）會抽戰局的亂數 ⇒ 之後的戰局跟沒打的不同。回那顆彈。 */
    shot: function (from, to, o) {
      o = o || {};
      var own = o.owner || SHIPS[PLAYER_I]; if (!own || !from || !to) return null;
      var V = clamp(+o.v || 160, 10, 600), d = sub(to, from), t = Math.max(0.05, len(d) / V), kind = o.kind || 'solid';
      var v = [d[0] / t, d[1] / t + 0.5 * G * t, d[2] / t];               // 吃了 t 秒重力正好落到 to
      var b = { p: from.slice(), v: v, owner: own.i, ammo: kind === 'shell' ? 1 : kind === 'chain' ? 2 : kind === 'fire' ? AMMO_GF : 0, trav: 0, alive: true, age: 0, bounced: false, big: false,
        hole: clamp(+o.hole || 1, 0.3, 3), dmg: +o.dmg > 0 ? +o.dmg : 1, m: clamp(+o.m || PEN.ref, 1, 300), api: true };
      if (kind === 'fire') b.gf = true;
      if (kind === 'chain') b.ph = BALLS.length * 2.39996 % 6.28319;    // 鏈彈的起始角：照開砲那一條（21_gunnery.js fire），⛔ 不抽亂數
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

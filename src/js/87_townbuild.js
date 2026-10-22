// ───────────────────────── 城鎮的建築模式（TASK-0742；Blocksail 地球儀「🏘 進入城鎮」⇒ ?map=@host&mode=town&town=<id>） ─────────────────────────
// 區塊職責：建築模式的開關（B、🔨）、分類選單（道路、房屋）、游標 ⇒ 地面 ⇒ 規劃平面公尺、跟外面那一頁要試放／找路／套用／復原、預覽線框（世界座標；60_render.js 畫）。
//   協定（Blocksail world/mapgen.js serve ⇒ mapgen_worker.js edit）：這一頁 ⇒ 那一頁 { bsmap: 'need', what: 'townEdit', town, cmd, seq, q?, op? }；
//   那一頁 ⇒ 這一頁 { bsmap: 'townEdit', seq, cmd, ok, why, …, town?（apply／undo 成功 ⇒ 新的那一份規劃）}（08_seabed.js 轉給 twbGot）。
//     cmd 'open' ⇒ 那一頁拿規劃＋取樣、照存檔重放（第一次開建築模式時要一次）；'try'（q ＝ { x, y, side, use }）⇒ 吸附＋試放的框；
//     'route'（q ＝ { from, to, kind }）⇒ 路線；'apply'（op ＝ { road }｜{ build }）、'undo' ⇒ 新的規劃 ⇒ 63_towns.js townReplace 換掉那一座城。
// 物理意義：規則全在 Blocksail world/town.js（townSnap、townBuildTry、townRoutePlan、townBuild、townAddRoad）—— ⛔ 這一支只問、只畫，不判斷蓋不蓋得了。
//   座標：世界 (x, z) ＝ 規劃 E(q) − (BED.ax, BED.az)、E(q) ＝ (ox ＋ kx·qx, oy ＋ qy)（63_towns.js townPrep）⇒ 反過來 q ＝ ((x ＋ ax − ox) ÷ kx, z ＋ az − oy)。
// 失敗處置：沒有 host（直接開 Blockside）、沒給 ?town、那座城還沒到 ⇒ 開不了，說一聲；回覆裡的 why 照原樣顯示。
var TWB = { on: false, town: Q.get('town') || null, cat: 'house', item: 'house', open: 0, seq: 0, wait: {}, mx: null, my: null, moved: false, q: null, side: 0,
  tr: null, busy: false, again: false, start: null, gl: null, msg: '', msgT: 0, framed: false, ops: 0, last: 0 };   // open：0 沒開、1 開著中、2 好了；tr：最後一則試放／找路的回覆
var TWB_CATS = [
  { k: 'road', name: '🛣 道路', items: [{ k: 'street', name: '街', sub: '寬 5 m' }, { k: 'lane', name: '小路', sub: '寬 2.5 m' }] },
  { k: 'house', name: '🏠 房屋', items: [{ k: 'house', name: '住宅', sub: '8 × 12（轉角 8 × 10）' }] }
];
var TWB_ROUTE_MS = 120;                                                  // 找路最多多久問一次（A* 在那一頁的 Worker 算；游標一直動也不會塞滿）
function twbOk() { return modeRule('town') && BED && BED.host && TWB.town; }
function twbTown() { var T = null; (TOWNS.list || []).forEach(function (t) { if (t.id === TWB.town) T = t; }); return T; }
function twbMsg(t) { TWB.msg = t || ''; TWB.msgT = performance.now(); }
/** 規劃平面公尺 ⇔ 世界 (x, z)。 */
function twbToWorld(T, q) { return [T.ox + T.kx * q[0] - BED.ax, T.oy + q[1] - BED.az]; }
function twbToPlan(T, x, z) { return [(x + BED.ax - T.ox) / T.kx, z + BED.az - T.oy]; }
/** 規劃座標 ⇒ 螢幕（clientX、clientY；地面上那一點）—— __game.twbScreen 用（測試：游標移到某一塊地上）。 */
function twbScreenOf(T, q) {
  var w = twbToWorld(T, q), y = twbHeight(w[0], w[1]), m = CAM.vp, r = cv.getBoundingClientRect();
  var cx = m[0] * w[0] + m[4] * y + m[8] * w[1] + m[12], cy = m[1] * w[0] + m[5] * y + m[9] * w[1] + m[13], cw = m[3] * w[0] + m[7] * y + m[11] * w[1] + m[15];
  return [r.left + (cx / cw + 1) / 2 * r.width, r.top + (1 - cy / cw) / 2 * r.height];
}
/** 畫面高度：整過地的地面（城外 ⇒ 海底／陸地），水面以下當水面（點海 ⇒ 落在水面上）。 */
function twbHeight(x, z) { var h = townGround(x, z); if (!(h === h)) h = bedHgt(x, z); return Math.max(h, 0); }
/** 螢幕 (cx, cy) ⇒ 地面上的世界點 [x, y, z]（射線從眼睛往外每 2 m 一步、碰到地面再二分 12 次；3 km 內沒碰到 ⇒ null）。同 71_input.js inPick 的反投影。 */
function twbGround(cx, cy) {
  var r = cv.getBoundingClientRect(), nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2, bq = CAM.inv;
  var w0 = bq[3] * nx + bq[7] * ny - bq[11] + bq[15], w1 = bq[3] * nx + bq[7] * ny + bq[11] + bq[15];
  var p0 = mul(M4.pt(CAM.inv, nx, ny, -1), 1 / w0), p1 = mul(M4.pt(CAM.inv, nx, ny, 1), 1 / w1), d = norm(sub(p1, p0));
  function at(t) { return [p0[0] + d[0] * t, p0[1] + d[1] * t, p0[2] + d[2] * t]; }
  var a = 0, b = -1;
  for (var t = 0; t <= 3000; t += 2) { var p = at(t); if (p[1] <= twbHeight(p[0], p[2])) { b = t; break; } a = t; }
  if (b < 0) return null;
  for (var k = 0; k < 12; k++) { var m = (a + b) / 2, q = at(m); if (q[1] <= twbHeight(q[0], q[2])) b = m; else a = m; }
  return at(b);
}
/** 跟外面那一頁要（cb(回覆)）。 */
function twbAsk(cmd, extra, cb) {
  if (!twbOk()) { if (cb) cb({ ok: false, why: ['沒有地球儀那一頁（建築模式要從 Blocksail 進城）'] }); return; }
  var s = ++TWB.seq; TWB.wait[s] = cb || null;
  BED.host.postMessage(Object.assign({ bsmap: 'need', what: 'townEdit', town: TWB.town, cmd: cmd, seq: s }, extra || {}), '*');
}
/** 外面那一頁的回覆（08_seabed.js）：apply／undo 成功帶新的規劃 ⇒ 換掉那一座城。 */
function twbGot(d) {
  var cb = TWB.wait[d.seq]; delete TWB.wait[d.seq];
  if (d.ok && d.town) { townReplace(d.town); TWB.tr = null; TWB.moved = true; }
  if (d.ops) TWB.ops = d.ops.length;
  if (cb) cb(d);
}
/** 開關建築模式（B、🔨）。第一次開 ⇒ 那一頁打開這座城（拿規劃＋取樣、照存檔重放）。 */
function twbToggle(on) {
  if (on == null) on = !TWB.on;
  if (on && !twbOk()) { note(SHIPS[PLAYER_I], '建築模式要從 Blocksail 地球儀「🏘 進入城鎮」進來'); return; }
  TWB.on = on; TWB.start = null; TWB.tr = null; TWB.moved = true;
  $('stage').classList.toggle('twb', on);
  if (on && TWB.open === 0) {
    TWB.open = 1; twbMsg('打開城鎮…（第一次要取樣，可能要幾秒）');
    twbAsk('open', null, function (r) { TWB.open = r.ok ? 2 : 0; twbMsg(r.ok ? '建築模式：' + (r.ops && r.ops.length ? '存檔裡有 ' + r.ops.length + ' 步' : '還沒改過') + (r.dropped ? '（' + r.dropped + ' 步套不上、丟掉了）' : '') : '打不開：' + (r.why || []).join('；')); });
  }
  twbUI();
}
function twbPick(cat, item) { TWB.cat = cat; TWB.item = item; TWB.start = null; TWB.tr = null; TWB.moved = true; twbUI(); }
function twbUndo() { if (!TWB.on || TWB.open !== 2) return; twbAsk('undo', null, function (r) { twbMsg(r.ok ? '復原了一步（還有 ' + (r.ops || []).length + ' 步）' : (r.why || []).join('；')); }); }
/** 試放／找路：一次只問一則；回來之前游標又動了 ⇒ 回來再問一次（最新的那個位置）。 */
function twbQuery() {
  if (TWB.open !== 2 || !TWB.q) return;
  if (TWB.busy) { TWB.again = true; return; }
  var road = TWB.cat === 'road';
  if (road && !TWB.start) { TWB.tr = null; return; }
  if (road && performance.now() - TWB.last < TWB_ROUTE_MS) { TWB.again = true; return; }
  TWB.busy = true; TWB.again = false; TWB.last = performance.now();
  var q = TWB.q.slice(), done = function (r) { TWB.busy = false; r.q = q; r.road = road; TWB.tr = r; if (TWB.again) twbQuery(); };
  if (road) twbAsk('route', { q: { from: TWB.start, to: q, kind: TWB.item } }, done);
  else twbAsk('try', { q: { x: q[0], y: q[1], side: TWB.side, use: TWB.item } }, done);
}
/** 點一下：房屋 ⇒ 試放過就蓋；道路 ⇒ 第一下起點（要在路上：那一頁吸）、之後照預覽的路線鋪。右鍵 ⇒ 取消起點。 */
function twbTap(x, y, btn) {
  if (!TWB.on) return false;
  if (btn === 2) { if (TWB.start) { TWB.start = null; TWB.tr = null; twbMsg('取消鋪路'); } return true; }
  if (btn !== 0 || TWB.open !== 2) return true;
  var g = twbGround(x, y), T = twbTown(); if (!g || !T) { twbMsg('點到地面上'); return true; }
  var q = twbToPlan(T, g[0], g[2]), tr = TWB.tr;
  if (tr && tr.q && Math.hypot(tr.q[0] - q[0], tr.q[1] - q[1]) > 3) { TWB.q = q; TWB.tr = null; twbQuery(); twbMsg('等試放（游標動了）…'); return true; }   // 回覆是別的位置的 ⇒ 不照它蓋、重問
  if (TWB.cat === 'road') {
    if (!TWB.start) { TWB.start = q; TWB.q = q; TWB.tr = null; twbMsg('起點 ⇒ 點終點（右鍵取消）'); return true; }
    if (!tr || !tr.ok || !tr.roadOp) { twbMsg(tr && tr.why ? '鋪不了：' + tr.why.join('；') : '等路線…'); return true; }
    twbAsk('apply', { op: tr.roadOp }, function (r) { twbMsg(r.ok ? '鋪好了：' + Math.round(tr.len) + ' m（' + (r.roads || []).length + ' 段）' : '鋪不了：' + (r.why || []).join('；')); });
    TWB.start = null; TWB.tr = null;
    return true;
  }
  if (!tr || tr.road || !tr.ok) { twbMsg(tr && tr.why ? '蓋不了：' + tr.why.join('；') : '等試放…'); return true; }
  var op = { build: tr.lot ? { lot: tr.lot, use: TWB.item } : { on: tr.on, use: TWB.item } };
  twbAsk('apply', { op: op }, function (r) { twbMsg(r.ok ? '蓋好了：' + (r.lot || '') : '蓋不了：' + (r.why || []).join('；')); });
  TWB.tr = null;
  return true;
}
/** 鍵：B 開關、Esc 取消起點／離開、R 換路的哪一側（自動 → 右 → 左）、U 或 Ctrl+Z 復原、1～3 選。 */
function twbKey(k, down, e) {
  if (!modeRule('town')) return false;
  var lk = k.length === 1 ? k.toLowerCase() : k;
  if (lk === 'b') { if (down && !e.repeat) twbToggle(); return true; }
  if (!TWB.on) return false;
  if (!down) return true;
  if (lk === 'Escape') { if (TWB.start) { TWB.start = null; TWB.tr = null; } else twbToggle(false); return true; }
  if (lk === 'r') { TWB.side = TWB.side === 0 ? 1 : TWB.side === 1 ? -1 : 0; TWB.moved = true; TWB.tr = null; twbMsg('貼路的哪一側：' + (TWB.side === 0 ? '跟著游標' : TWB.side > 0 ? '右側' : '左側')); return true; }
  if (lk === 'u' || (lk === 'z' && (e.ctrlKey || e.metaKey))) { twbUndo(); return true; }
  if (lk === '1') { twbPick('road', 'street'); return true; }
  if (lk === '2') { twbPick('road', 'lane'); return true; }
  if (lk === '3') { twbPick('house', 'house'); return true; }
  return false;                                                         // 其他的（停格、設定、鏡頭）照海戰鏡頭
}
/** 每一格：第一次城到了 ⇒ 鏡頭照整座城；游標動了 ⇒ 地面點、問試放／找路；預覽線框；說明那一行。 */
function twbFrame() {
  if (!modeRule('town')) return;
  var T = twbTown();
  if (!TWB.framed && T && !CAM.tr && RUNNING) {                         // 進城：自由鏡頭、斜俯視城中心（轉場降完之後；船在停靠處，拖曳、平移看得到）
    TWB.framed = true;                                                  //   ⛔ 不取城與船的中間：托爾圖加的棧橋離城中心四百多公尺 ⇒ 中間那一點只看得到沙灘（2026-10-22 量到）
    var c = T.cen || [T.ox, T.oy], x = c[0] - BED.ax, z = c[1] - BED.az;
    camSet({ mode: 0, follow: null, pan: [0, 0], tgt: [x, Math.max(0, twbHeight(x, z)), z], dist: 300, pitch: 0.95 });
  }
  if (!TWB.on) { if (TWB.gl && TWB.gl.n) TWB.gl = upload(TWB.gl, new Float32Array(0), 6, [[0, 3, 0], [2, 3, 3]]); return; }
  if (TWB.moved && TWB.mx != null && T) {
    TWB.moved = false;
    var g = twbGround(TWB.mx, TWB.my);
    TWB.q = g ? twbToPlan(T, g[0], g[2]) : null;
    if (!TWB.q && !TWB.start) TWB.tr = null;                            // 游標離開地面 ⇒ 舊的試放不留（⛔ 留著 ⇒ 框照畫、點下去蓋到上一個位置）
    twbQuery();
  } else if (TWB.again && !TWB.busy) twbQuery();
  twbLines(T);
  twbInfo();
}
/** 預覽線框（世界座標）：房屋 ⇒ 那一塊的外框（綠 ＝ 蓋得了、紅 ＝ 蓋不了）；道路 ⇒ 起點的十字、路線（綠／紅；還沒回 ⇒ 起點到游標的直線，黃）。 */
function twbLines(T) {
  var L = [];
  function seg(a, b, c) { L.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
  function P3(q, up) { var w = twbToWorld(T, q); return [w[0], twbHeight(w[0], w[1]) + (up || 0.4), w[1]]; }
  if (T) {
    var tr = TWB.tr, G = [0.45, 1, 0.5], R = [1, 0.3, 0.25], Y = [1, 0.85, 0.3];
    if (TWB.cat === 'house' && tr && !tr.road && tr.at) {
      var th = tr.rot * Math.PI / 180, ux = Math.cos(th), uy = Math.sin(th), hd = tr.d / 2, hw = tr.w / 2, C = [];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) { C.push(P3([tr.at[0] + ux * hd * s[0] - uy * hw * s[1], tr.at[1] + uy * hd * s[0] + ux * hw * s[1]])); });
      var col = tr.ok ? G : R;
      for (var i = 0; i < 4; i++) { seg(C[i], C[(i + 1) % 4], col); seg(C[i], [C[i][0], C[i][1] + 6, C[i][2]], col); seg([C[i][0], C[i][1] + 6, C[i][2]], [C[(i + 1) % 4][0], C[(i + 1) % 4][1] + 6, C[(i + 1) % 4][2]], col); }
      var f = P3([tr.at[0] + ux * hd, tr.at[1] + uy * hd], 0.6), f2 = P3([tr.at[0] + ux * (hd + 3), tr.at[1] + uy * (hd + 3)], 0.6); seg(f, f2, col);   // 門口朝路那一邊
    } else if (TWB.cat === 'road' && TWB.start) {
      var s0 = P3(TWB.start, 0.6); seg([s0[0] - 3, s0[1], s0[2]], [s0[0] + 3, s0[1], s0[2]], Y); seg([s0[0], s0[1], s0[2] - 3], [s0[0], s0[1], s0[2] + 3], Y); seg(s0, [s0[0], s0[1] + 8, s0[2]], Y);
      if (tr && tr.road && tr.path && tr.path.length > 1) { var c2 = tr.ok ? G : R; for (var j = 1; j < tr.path.length; j++) seg(P3(tr.path[j - 1], 0.6), P3(tr.path[j], 0.6), c2); }
      else if (TWB.q) seg(s0, P3(TWB.q, 0.6), tr && tr.road && !tr.ok ? R : Y);
    }
  }
  TWB.gl = upload(TWB.gl, new Float32Array(L), 6, [[0, 3, 0], [2, 3, 3]]);
}
/** 上面那一行：剛做完的訊息留 3 秒；不然照試放／找路的回覆。 */
function twbInfo() {
  var el = $('twbInfo'); if (!el) return;
  var s, tr = TWB.tr;
  if (TWB.msg && performance.now() - TWB.msgT < 3000) s = TWB.msg;
  else if (TWB.open === 1) s = '打開城鎮…';
  else if (TWB.open !== 2) s = '建築模式開不了';
  else if (TWB.cat === 'road') s = !TWB.start ? '點一下既有的路當起點' : !tr || !tr.road ? '找路線…' : tr.ok ? '路線 ' + Math.round(tr.len) + ' m、' + tr.gold + ' 金 —— 點一下鋪（右鍵取消）' : '鋪不了：' + (tr.why || []).join('；');
  else s = !TWB.q ? '游標移到路邊或空建地上' : !tr || tr.road ? '試放…' : tr.ok ? (tr.lot ? '空建地 ' + tr.lot : '路邊 ' + tr.w.toFixed(0) + ' × ' + tr.d + ' m') + ' —— 點一下蓋' + (TWB.side ? '（' + (TWB.side > 0 ? '右' : '左') + '側）' : '') : '蓋不了：' + (tr.why || ['?'])[0];
  if (el.textContent !== s) el.textContent = s;
}
/** 介面：分類分頁＋項目＋復原、離開（#twbToPlan，#stage.twb 才顯示）；🔨 那一顆只在城鎮模式（#stage.townMode）。 */
function twbUI() {
  var P = $('twbP'); if (!P) return;
  var h = '<div id="twbTabs">' + TWB_CATS.map(function (c) { return '<button type="button" data-c="' + c.k + '"' + (c.k === TWB.cat ? ' class="on"' : '') + '>' + c.name + '</button>'; }).join('') + '</div><div id="twbItems">';
  TWB_CATS.forEach(function (c, ci) { if (c.k !== TWB.cat) return; c.items.forEach(function (it, ii) { var n = ci === 0 ? ii + 1 : 3; h += '<button type="button" class="bcard' + (it.k === TWB.item ? ' on' : '') + '" data-c="' + c.k + '" data-i="' + it.k + '"><b>' + it.name + '</b><small>' + it.sub + '（' + n + '）</small></button>'; }); });
  h += '</div><div id="twbOps"><button type="button" id="twbUndo">↶ 復原（U）</button><button type="button" id="twbX">✕ 離開（B）</button></div>';
  P.innerHTML = h;
  P.querySelectorAll('#twbTabs button').forEach(function (b) { b.onclick = function () { var c = TWB_CATS.filter(function (x) { return x.k === b.dataset.c; })[0]; twbPick(c.k, c.items[0].k); }; });
  P.querySelectorAll('#twbItems button').forEach(function (b) { b.onclick = function () { twbPick(b.dataset.c, b.dataset.i); }; });
  $('twbUndo').onclick = twbUndo; $('twbX').onclick = function () { twbToggle(false); };
}
// 城鎮模式（04_modes.js town）：🔨 鈕、開局的 class
(function () {
  if (!modeRule('town')) return;
  $('stage').classList.add('townMode');
  var k = $('twbK'); if (k) k.onclick = function () { twbToggle(); };
  twbUI();
})();
ctrlAdd({ name: 'town', pri: 8, on: function () { return TWB.on; },
  key: function (k, down, e) { if (!twbKey(k, down, e)) return false; e.preventDefault(); return true; },
  hover: function (x, y) { if (!TWB.on) return false; TWB.mx = x; TWB.my = y; TWB.moved = true; return true; },
  tap: function (x, y, btn) { return twbTap(x, y, btn); },
  frame: function () { twbFrame(); }
});

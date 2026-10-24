// ───────────────────────── 城鎮的建築模式（TASK-0742；Blocksail 地球儀「🏘 進入城鎮」⇒ ?map=@host&mode=town&town=<id>） ─────────────────────────
// 區塊職責：建築模式的開關（B、🔨）、分類選單（道路 ＋ 外面那一頁給的：房屋、工坊、港口…）、游標 ⇒ 地面 ⇒ 規劃平面公尺、跟外面那一頁要試放／找路／套用／復原、預覽線框（世界座標；60_render.js 畫）、
//   點到建築 ⇒ 選起來、說它的名字（63_towns.js townHitAt；TASK-0869）。
//   協定（Blocksail world/mapgen.js serve ⇒ mapgen_worker.js edit）：這一頁 ⇒ 那一頁 { bsmap: 'need', what: 'townEdit', town, cmd, seq, q?, op? }；
//   那一頁 ⇒ 這一頁 { bsmap: 'townEdit', seq, cmd, ok, why, …, town?（apply／undo 成功 ⇒ 新的那一份規劃）}（08_seabed.js 轉給 twbGot）。
//     cmd 'open' ⇒ 那一頁拿規劃＋取樣、照存檔重放（第一次開建築模式時要一次）；回的 menu ＝ 道路以外的分類（Blocksail town.js BUILD_MENU；舊的地球儀沒給 ⇒ 只有房屋）；'try'（q ＝ { x, y, side, use }）⇒ 吸附＋試放的框；
//     'route'（q ＝ { from, to, kind }）⇒ 路線；'apply'（op ＝ { road }｜{ build }）、'undo' ⇒ 新的規劃 ⇒ 63_towns.js townReplace 換掉那一座城。
//   存這座城（Blocksail TASK-0873；Tim 2026-10-24「城鎮編輯模式下存檔應該就只存該城鎮的改動」）：💾 或 Ctrl+S ⇒ { bsmap: 'need', what: 'townSave', town, seq } ⇒
//     { bsmap: 'townSave', seq, ok, msg }（Blocksail 那一頁決定存到哪：Editor 版本 ⇒ 只寫這一座城進 world/start/；Build 版本 ⇒ 遊戲存檔）；5 秒沒回 ⇒ 說那一頁太舊、存不了
//     生產建築（農莊、種植園；TASK-0742 第二步）：try 多帶 recipe（玩家選的；沒選 ⇒ 那一頁挑第一條能種的），回覆多 recipe、recipes（{ ok, no: [{ k, name, why }] }）、annex（田：quads 每一格外框）、note；
//       配方那一排（#twbRcp）照回覆長、點一下換；預覽多畫田（半透明）；蓋下去的那一步帶實際用的那一條（重放同一片田）
// 物理意義：規則全在 Blocksail world/town.js（townSnap、townBuildTry、townRoutePlan、townBuild、townAddRoad）—— ⛔ 這一支只問、只畫，不判斷蓋不蓋得了。
//   座標：世界 (x, z) ＝ 規劃 E(q) − (BED.ax, BED.az)、E(q) ＝ (ox ＋ kx·qx, oy ＋ qy)（63_towns.js townPrep）⇒ 反過來 q ＝ ((x ＋ ax − ox) ÷ kx, z ＋ az − oy)。
// 失敗處置：沒有 host（直接開 Blockside）、沒給 ?town、那座城還沒到 ⇒ 開不了，說一聲；回覆裡的 why 照原樣顯示。
var TWB = { on: false, town: Q.get('town') || null, cat: 'house', item: 'house', open: 0, seq: 0, wait: {}, mx: null, my: null, moved: false, q: null, side: 0,
  tr: null, busy: false, again: false, start: null, gl: null, msg: '', msgT: 0, framed: false, ops: 0, last: 0, ghost: null, rib: null, sel: null, recipe: null, rcpSig: '' };   // recipe：生產建築玩家選的配方（換項目 ⇒ 放掉）   // sel：點到的那一棟（townHitAt 的回覆；再點一下、Esc、換項目 ⇒ 放掉）   // ghost：房子的預覽實例（63_towns.js townGhost）；rib：道路預覽的路面帶（GPU）   // open：0 沒開、1 開著中、2 好了；tr：最後一則試放／找路的回覆
var TWB_CATS = [
  { k: 'road', name: '🛣 道路', items: [{ k: 'street', name: '街', sub: '寬 5 m' }, { k: 'lane', name: '小路', sub: '寬 2.5 m' }] },
  { k: 'house', name: '🏠 房屋', items: [{ k: 'house', name: '住宅', sub: '2 × 3 格（轉角 2 × 2）' }] }   // 路邊每 4 m 一格（Blocksail TASK-0840）；轉角只剩 2 格深 ⇒ 8 × 8 的小版住宅
];   // 道路以外那幾類：open 回的 menu 換掉（twbMenuSet）；沒給 ⇒ 照這一份
/** open 回的選單（Blocksail town.js BSW.townBuildMenu：[{ k, name, items: [{ use, name, sub, … }] }]）⇒ 道路之後接上；選單裡的那幾種模型先要（63_towns.js townWantSet ⇒ 預覽畫得出來）。 */
function twbMenuSet(menu) {
  if (!menu || !menu.length) return;
  TWB_CATS = [TWB_CATS[0]].concat(menu.map(function (c) { return { k: c.k, name: c.name, items: c.items.map(function (it) { return { k: it.use, name: it.name, sub: it.sub || '' }; }) }; }));
  if (!TWB_CATS.some(function (c) { return c.k === TWB.cat && c.items.some(function (it) { return it.k === TWB.item; }); })) { TWB.cat = 'road'; TWB.item = 'street'; }
  townWantSet([].concat.apply([], menu.map(function (c) { return c.items.map(function (it) { return it.use; }); })));
  twbUI();
}
/** 選單攤平（數字鍵 1～9 照這個順序：道路兩種、房屋、工坊…）。 */
function twbFlat() { var L = []; TWB_CATS.forEach(function (c) { c.items.forEach(function (it) { L.push({ c: c.k, i: it.k }); }); }); return L; }
var TWB_ROAD_W = { street: 5, lane: 2.5 }, TWB_RIB_STEP = 2, TWB_RIB_LIFT = 0.3, TWB_RIB_A = 0.55;   // 道路預覽：路寬（同 Blocksail world/town.js ROAD_COST）、沿路每幾公尺取一次地面高度、離地多高、透明度
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
/** 測試用（__game.twbProbe）：規劃座標 q ⇒ 世界點、畫面地形（townRoadHeight：路面頂點建的時候讀的那一個）、那一區（63_towns.js T.gt）髒不髒、
 *  畫出來的路面離這一點最近的頂點（讀 GPU 緩衝區；只看朝上的面）的高度與那個頂點位置現在的地形 ⇒ 路面有沒有沉到地形底下。 */
function twbProbe(q) {
  var T = twbTown(); if (!T || !BED || !BED.A) return null;
  var w = twbToWorld(T, q), x = w[0], z = w[1], S = TOWN_GT_SZ, k = Math.floor((x + BED.ax) / S) + '_' + Math.floor((z + BED.az) / S), Q = T.gt && T.gt[k];
  var o = { w: [+x.toFixed(2), +z.toFixed(2)], terr: +townRoadHeight(x, z).toFixed(3), lift: TOWN_ROAD_LIFT, tile: Q ? { k: k, dirty: Q.dirty, built: !!Q.g } : null, vb: null };
  var CS = BED.A.chunk, qc = bedCell(x, z), DC = bedShowC(Math.floor((x + BED.ax) / CS) + '_' + Math.floor((z + BED.az) / CS));   // 畫的那一塊 vs 模擬照等級讀的那一塊（63_towns.js townCell）
  o.cell = { drawn: DC ? DC.step : null, sim: qc ? qc.C.step : null };
  if (Q && Q.g) {
    gl.bindBuffer(gl.ARRAY_BUFFER, Q.g.vb);
    var V = new Float32Array(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) / 4), bd = 1e9, bi = -1; gl.getBufferSubData(gl.ARRAY_BUFFER, 0, V);
    for (var i = 0; i < V.length; i += 9) { var d = Math.hypot(V[i] - x, V[i + 2] - z); if (V[i + 4] > 0.5 && d < bd) { bd = d; bi = i; } }
    if (bi >= 0) o.vb = { y: +V[bi + 1].toFixed(3), d: +bd.toFixed(2), terr: +townRoadHeight(V[bi], V[bi + 2]).toFixed(3) };
  }
  return o;
}
function twbHeight(x, z) { var h = townGround(x, z); if (!(h === h)) h = bedHgt(x, z); return Math.max(h, 0); }
/** 螢幕 (cx, cy) ⇒ 地面上的世界點 [x, y, z]（射線從眼睛往外每 2 m 一步、碰到地面再二分 12 次；3 km 內沒碰到 ⇒ null）。同 71_input.js inPick 的反投影。 */
function twbGround(cx, cy) {
  var R = townRayOf(cx, cy), p0 = R[0], d = R[1];
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
/** 存這座城（💾、Ctrl+S）：那一頁照它的版本決定存到哪、回一句話。 */
function twbSave() {
  if (!twbOk()) { twbMsg('沒有地球儀那一頁（建築模式要從 Blocksail 進城）'); return; }
  var s = ++TWB.seq, done = false;
  TWB.wait[s] = function (r) { done = true; twbMsg(r.ok ? '💾 ' + (r.msg || '存了') : '沒存成：' + (r.msg || (r.why || []).join('；'))); };
  BED.host.postMessage({ bsmap: 'need', what: 'townSave', town: TWB.town, seq: s }, '*');
  twbMsg('存這座城…');
  setTimeout(function () { if (!done && TWB.wait[s]) { delete TWB.wait[s]; twbMsg('地球儀那一頁沒有回（太舊的版本不能從這裡存）'); } }, 5000);
}
/** 外面那一頁的回覆（08_seabed.js）：apply／undo 成功帶新的規劃 ⇒ 換掉那一座城；存這座城（townSave）也走這裡。 */
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
  TWB.on = on; TWB.start = null; TWB.tr = null; TWB.moved = true; TWB.sel = null;
  $('stage').classList.toggle('twb', on);
  if (on && TWB.open === 0) {
    TWB.open = 1; twbMsg('打開城鎮…（第一次要取樣，可能要幾秒）');
    twbAsk('open', null, function (r) { TWB.open = r.ok ? 2 : 0; if (r.ok) twbMenuSet(r.menu); twbMsg(r.ok ? '建築模式：' + (r.ops && r.ops.length ? '存檔裡有 ' + r.ops.length + ' 步' : '還沒改過') + (r.dropped ? '（' + r.dropped + ' 步套不上、丟掉了）' : '') : '打不開：' + (r.why || []).join('；')); });
  }
  twbUI();
}
function twbPick(cat, item) { TWB.cat = cat; TWB.item = item; TWB.start = null; TWB.tr = null; TWB.moved = true; TWB.sel = null; TWB.recipe = null; twbUI(); }
/** 配方那一排（生產建築）：照最後一則試放的 recipes —— 能種的可以點（點了 ⇒ 重問試放）、種不了的灰掉、滑上去看原因；不是生產建築 ⇒ 空的。 */
function twbRcpUI() {
  var el = $('twbRcp'); if (!el) return;
  var tr = TWB.tr, R = tr && !tr.road && tr.recipes, sig = R ? tr.recipe + '|' + R.ok.map(function (x) { return x.k; }).join(',') + '|' + R.no.map(function (x) { return x.k; }).join(',') : '';
  if (sig === TWB.rcpSig) return;
  TWB.rcpSig = sig;
  if (!R) { el.innerHTML = ''; return; }
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  el.innerHTML = '<span>種：</span>' + R.ok.map(function (x) { return '<button type="button" data-k="' + x.k + '"' + (x.k === tr.recipe ? ' class="on"' : '') + '>' + esc(x.name) + '</button>'; }).join('') +
    R.no.map(function (x) { return '<button type="button" disabled title="' + esc(x.why) + '">' + esc(x.name) + '</button>'; }).join('');
  el.querySelectorAll('button[data-k]').forEach(function (b) { b.onclick = function () { TWB.recipe = b.dataset.k; TWB.tr = null; TWB.moved = true; TWB.rcpSig = ''; }; });
}
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
  else twbAsk('try', { q: { x: q[0], y: q[1], side: TWB.side, use: TWB.item, recipe: TWB.recipe } }, done);
}
/** 點一下：房屋 ⇒ 試放過就蓋；道路 ⇒ 第一下起點（要在路上：那一頁吸）、之後照預覽的路線鋪。右鍵 ⇒ 取消起點。 */
function twbTap(x, y, btn) {
  if (!TWB.on) return false;
  if (btn === 2) { if (TWB.start) { TWB.start = null; TWB.tr = null; twbMsg('取消鋪路'); } return true; }
  if (btn !== 0) return true;
  var g = twbGround(x, y), hit = townHitAt(x, y, g ? Math.hypot(g[0] - CAM.eye[0], g[1] - CAM.eye[1], g[2] - CAM.eye[2]) : null);
  if (TWB.sel) { var same = hit && hit.q === TWB.sel.q; TWB.sel = null; if (!hit || same) return true; }   // 選著一棟 ⇒ 這一下先放掉（點到同一棟、空地 ⇒ 就放掉；點到別棟 ⇒ 換選那一棟）
  if (hit) { TWB.sel = hit; TWB.start = null; TWB.tr = null; return true; }   // 點到建築 ⇒ 選起來、說名字（不蓋、不當鋪路的起點；Tim 2026-10-23）
  if (TWB.open !== 2) return true;
  var T = twbTown(); if (!g || !T) { twbMsg('點到地面上'); return true; }
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
  if (tr.recipe) op.build.recipe = tr.recipe;                           // 生產建築：試放實際用的那一條（重放照它長同一片田）
  twbAsk('apply', { op: op }, function (r) { twbMsg(r.ok ? '蓋好了：' + (r.lot || '') + (tr.annex ? '（田 ' + tr.annex.area + ' m²）' : '') : '蓋不了：' + (r.why || []).join('；')); });
  TWB.tr = null;
  return true;
}
/** Esc（71_input.js 在打開設定之前先問這一支；同 81_fps.js fpEscEaten）：建築模式選著一棟 ⇒ 放掉、鋪路有起點 ⇒ 取消 ⇒ 吃掉（true）；都沒有 ⇒ 照舊打開設定。
 *  ⛔ 以前 Esc 寫在 twbKey 裡：71_input.js 的 Esc 先打開設定就 return、從來沒走到這裡（TASK-0869 量到：放掉選取的那一下設定頁跳出來）。 */
function twbEscEaten() {
  if (!TWB.on) return false;
  if (TWB.sel) { TWB.sel = null; return true; }
  if (TWB.start) { TWB.start = null; TWB.tr = null; twbMsg('取消鋪路'); return true; }
  return false;
}
/** 鍵：B 開關選單、R 換路的哪一側（自動 → 右 → 左）、Z 或 Ctrl+Z 復原、Ctrl+S 存這座城、1～9 照選單的順序選（Esc 見 twbEscEaten）。
 *  ⛔ 復原不用 U：U 是 🌍 回到地球儀（66_keys.js hostBack）—— 選單預設開著 ⇒ U 給復原吃掉就永遠回不了地球儀。 */
function twbKey(k, down, e) {
  if (!modeRule('town')) return false;
  var lk = k.length === 1 ? k.toLowerCase() : k;
  if (lk === 'b') { if (down && !e.repeat) twbToggle(); return true; }
  if (!TWB.on) return false;
  if (!down) return true;
  if (lk === 'r') { TWB.side = TWB.side === 0 ? 1 : TWB.side === 1 ? -1 : 0; TWB.moved = true; TWB.tr = null; twbMsg('貼路的哪一側：' + (TWB.side === 0 ? '跟著游標' : TWB.side > 0 ? '右側' : '左側')); return true; }
  if (lk === 's' && e && (e.ctrlKey || e.metaKey)) { if (e.preventDefault) e.preventDefault(); if (!e.repeat) twbSave(); return true; }   // Ctrl+S（擋掉瀏覽器的另存網頁）
  if (lk === 'z') { twbUndo(); return true; }
  if (lk >= '1' && lk <= '9' && lk.length === 1) { var F = twbFlat()[+lk - 1]; if (F) { twbPick(F.c, F.i); return true; } }   // 1～9 照選單的順序（twbFlat）
  return false;                                                         // 其他的（停格、設定、鏡頭）照海戰鏡頭
}
/** 每一格：第一次城到了 ⇒ 鏡頭照整座城；游標動了 ⇒ 地面點、問試放／找路；預覽線框；說明那一行。 */
function twbFrame() {
  if (!modeRule('town')) return;
  var T = twbTown();
  twbTitle(T);
  if (!TWB.framed && T && !CAM.tr && RUNNING) {                         // 進城：自由鏡頭、斜俯視城中心（轉場降完之後；船在停靠處，拖曳、平移看得到）
    TWB.framed = true;                                                  //   ⛔ 不取城與船的中間：托爾圖加的棧橋離城中心四百多公尺 ⇒ 中間那一點只看得到沙灘（2026-10-22 量到）
    var c = T.cen || [T.ox, T.oy], x = c[0] - BED.ax, z = c[1] - BED.az;
    camSet({ mode: 0, follow: null, pan: [0, 0], tgt: [x, Math.max(0, twbHeight(x, z)), z], dist: 300, pitch: 0.95 });
  }
  // 進城預設不開建築模式（Tim 2026-10-23「建築模式按鈕希望改成常駐的Toggle按鈕(且預設改為不開)」；10-22 那一版城到了、轉場降完就自動開一次）：按 🔨 或 B 才開
  if (!TWB.on) { if (TWB.gl && TWB.gl.n) TWB.gl = upload(TWB.gl, new Float32Array(0), 6, [[0, 3, 0], [2, 3, 3]]); TWB.ghost = null; return; }
  if (TWB.moved && TWB.mx != null && T) {
    TWB.moved = false;
    var g = twbGround(TWB.mx, TWB.my);
    TWB.q = g ? twbToPlan(T, g[0], g[2]) : null;
    if (!TWB.q && !TWB.start) TWB.tr = null;                            // 游標離開地面 ⇒ 舊的試放不留（⛔ 留著 ⇒ 框照畫、點下去蓋到上一個位置）
    twbQuery();
  } else if (TWB.again && !TWB.busy) twbQuery();
  twbLines(T);
  twbInfo();
  twbRcpUI();
}
/** 預覽線框（世界座標）：房屋 ⇒ 那一塊的外框（綠 ＝ 蓋得了、紅 ＝ 蓋不了）；道路 ⇒ 起點的十字、路線（綠／紅；還沒回 ⇒ 起點到游標的直線，黃）。 */
function twbLines(T) {
  var L = [];
  function seg(a, b, c) { L.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
  function P3(q, up) { var w = twbToWorld(T, q); return [w[0], twbHeight(w[0], w[1]) + (up || 0.4), w[1]]; }
  if (T) {
    var tr = TWB.tr, G = [0.45, 1, 0.5], R = [1, 0.3, 0.25], Y = [1, 0.85, 0.3];
    if (TWB.cat !== 'road' && tr && !tr.road && tr.at && !TWB.sel) {
      var th = tr.rot * Math.PI / 180, ux = Math.cos(th), uy = Math.sin(th), hd = tr.d / 2, hw = tr.w / 2, C = [];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) { C.push(P3([tr.at[0] + ux * hd * s[0] - uy * hw * s[1], tr.at[1] + uy * hd * s[0] + ux * hw * s[1]])); });
      var col = tr.ok ? G : R;
      for (var i = 0; i < 4; i++) { seg(C[i], C[(i + 1) % 4], col); seg(C[i], [C[i][0], C[i][1] + 6, C[i][2]], col); seg([C[i][0], C[i][1] + 6, C[i][2]], [C[(i + 1) % 4][0], C[(i + 1) % 4][1] + 6, C[(i + 1) % 4][2]], col); }
      var f = P3([tr.at[0] + ux * hd, tr.at[1] + uy * hd], 0.6), f2 = P3([tr.at[0] + ux * (hd + 3), tr.at[1] + uy * (hd + 3)], 0.6); seg(f, f2, col);   // 門口朝路那一邊
      if (tr.annex && tr.annex.quads) {                                  // 田的外緣（每一格的邊只出現一次的那幾條；不看深度 ⇒ 樹後面也看得到）：一格一段、照兩端各自的地面
        var EC = {}, ek = function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); };
        tr.annex.quads.forEach(function (Qd) { for (var e = 0; e < 4; e++) { var a = Qd[e], b = Qd[(e + 1) % 4], k = [ek(a), ek(b)].sort().join('|'); EC[k] = EC[k] ? null : [a, b]; } });
        Object.keys(EC).forEach(function (k) { if (EC[k]) seg(P3(EC[k][0], 0.5), P3(EC[k][1], 0.5), col); });
      }
    } else if (TWB.cat === 'road' && TWB.start) {
      var s0 = P3(TWB.start, 0.6); seg([s0[0] - 3, s0[1], s0[2]], [s0[0] + 3, s0[1], s0[2]], Y); seg([s0[0], s0[1], s0[2] - 3], [s0[0], s0[1], s0[2] + 3], Y); seg(s0, [s0[0], s0[1] + 8, s0[2]], Y);
      if (tr && tr.road && tr.path && tr.path.length > 1) { var c2 = tr.ok ? G : R; for (var j = 1; j < tr.path.length; j++) seg(P3(tr.path[j - 1], 0.6), P3(tr.path[j], 0.6), c2); }
      else if (TWB.q) seg(s0, P3(TWB.q, 0.6), tr && tr.road && !tr.ok ? R : Y);
    }
    var sq = TWB.sel && TWB.sel.q;                                       // 點到的那一棟：外框（townHitAt 量的那一個長方體），黃
    if (sq) {
      var sc = Math.cos(sq.th), ss = Math.sin(sq.th), a2 = sq.pl[1] / 2, b2 = sq.pl[0] / 2, y0 = sq.y, y1 = sq.y + sq.top * sq.sh, B4 = [];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (k) { B4.push([sq.x + sc * a2 * k[0] - ss * b2 * k[1], sq.z + ss * a2 * k[0] + sc * b2 * k[1]]); });
      for (var e = 0; e < 4; e++) {
        var u0 = B4[e], u1 = B4[(e + 1) % 4];
        seg([u0[0], y0, u0[1]], [u1[0], y0, u1[1]], Y); seg([u0[0], y1, u0[1]], [u1[0], y1, u1[1]], Y); seg([u0[0], y0, u0[1]], [u0[0], y1, u0[1]], Y);
      }
    }
  }
  TWB.gl = upload(TWB.gl, new Float32Array(L), 6, [[0, 3, 0], [2, 3, 3]]);
  // 半透明預覽（Tim 2026-10-22「城鎮建造是否可以加上預覽(道路&建築 在Hover狀態下顯示半透明預覽)」）：
  //   房子 ⇒ 試放的那一塊照蓋上去的那一份（id：空建地照原 id、路邊照 townBuild 的 'b' ＋ (nextBuild ＋ 1)）挑同一棟模型；道路 ⇒ 路線照路寬鋪一條貼地的路面帶
  var tr2 = TWB.tr; TWB.ghost = null; var RB = [];
  if (T && TWB.cat !== 'road' && tr2 && !tr2.road && tr2.at && !TWB.sel) {        // h：地塊頂（Blocksail mapgen_worker.js try 回的；舊的地球儀沒回 ⇒ 地塊中心的地面）
    var cw = twbToWorld(T, tr2.at), h2 = tr2.h != null ? tr2.h : twbHeight(cw[0], cw[1]);
    TWB.ghost = townGhost(T, { id: tr2.lot || 'b' + ((T.p.nextBuild || 0) + 1), use: TWB.item, at: tr2.at, rot: tr2.rot, w: tr2.w, d: tr2.d, h: h2 }, !!tr2.ok);
  }
  if (T && TWB.cat === 'road' && TWB.start && tr2 && tr2.road && tr2.path && tr2.path.length > 1) {
    var hw = (TWB_ROAD_W[TWB.item] || TWB_ROAD_W.street) / 2, cc = tr2.ok ? [0.78, 0.74, 0.62] : [0.95, 0.32, 0.26], S2 = [];
    for (var a = 1; a < tr2.path.length; a++) {                         // 沿路每 TWB_RIB_STEP 公尺一點（世界座標），每點的地面高度各取一次
      var p0 = twbToWorld(T, tr2.path[a - 1]), p1 = twbToWorld(T, tr2.path[a]), n = Math.max(1, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / TWB_RIB_STEP));
      for (var b = a === 1 ? 0 : 1; b <= n; b++) S2.push([p0[0] + (p1[0] - p0[0]) * b / n, p0[1] + (p1[1] - p0[1]) * b / n]);
    }
    // 高度：左、中、右三點各取一次，照畫面地形的三角形（63_towns.js townRoadHeight，同地形網格的對角線）—— ⛔ 一點一個高度（雙線性、整條橫斷面同高）
    //   ⇒ 橫坡上那一邊、雙線性比三角形低的地方整片埋進地形（2026-10-23 量：深度測試開著一點都看不到、關掉才出現）
    function rh(x, z) { var h = townRoadHeight(x, z); if (!(h === h)) h = twbHeight(x, z); return Math.max(h, 0) + TWB_RIB_LIFT; }
    var E2 = S2.map(function (q, k) {                                    // 每點往兩側：照前後兩點的方向
      var A = S2[Math.max(0, k - 1)], B = S2[Math.min(S2.length - 1, k + 1)], dx = B[0] - A[0], dz = B[1] - A[1], L2 = Math.hypot(dx, dz) || 1;
      var lx = q[0] - dz / L2 * hw, lz = q[1] + dx / L2 * hw, rx = q[0] + dz / L2 * hw, rz = q[1] - dx / L2 * hw;
      return [lx, rh(lx, lz), lz, q[0], rh(q[0], q[1]), q[1], rx, rh(rx, rz), rz];
    });
    var v = function (e, o) { RB.push(e[o], e[o + 1], e[o + 2], cc[0], cc[1], cc[2]); };
    for (var k = 1; k < E2.length; k++) {                                // 每段兩條：左～中、中～右
      var e0 = E2[k - 1], e1 = E2[k];
      v(e0, 0); v(e0, 3); v(e1, 3); v(e0, 0); v(e1, 3); v(e1, 0);
      v(e0, 3); v(e0, 6); v(e1, 6); v(e0, 3); v(e1, 6); v(e1, 3);
    }
  }
  //   田（生產建築）：每一格一塊半透明的地面（同路面帶那一套，照四個角各自的地形高）—— 綠黃 ＝ 蓋得了、紅 ＝ 蓋不了
  if (T && TWB.cat !== 'road' && tr2 && !tr2.road && tr2.annex && tr2.annex.quads && !TWB.sel) {
    var fc = tr2.ok ? [0.66, 0.8, 0.36] : [0.95, 0.32, 0.26];
    tr2.annex.quads.forEach(function (Qd) {
      var W4 = Qd.map(function (q) { var w = twbToWorld(T, q); return [w[0], twbHeight(w[0], w[1]) + TWB_RIB_LIFT, w[1]]; });
      [0, 1, 2, 0, 2, 3].forEach(function (k) { RB.push(W4[k][0], W4[k][1], W4[k][2], fc[0], fc[1], fc[2]); });
    });
  }
  TWB.rib = upload(TWB.rib, new Float32Array(RB), 6, [[0, 3, 0], [2, 3, 3]]);
}
/** 畫建築模式的預覽（60_render.js mainOpaque 最後：地形、樹、城之後）：房子的半透明實例、道路的半透明路面帶（都照深度：被前面的房子、山擋住）、線框（不看深度、穿地看得到）。
 *  ⛔ 要在地形、樹、城之後畫：關了深度測試的線不寫深度 ⇒ 畫在前面會被後畫的陸地整片蓋掉（2026-10-22 第一版放在船那一段後面，量到預覽框周圍 0 個綠像素）。 */
function twbDraw() {
  if (!TWB.on) return;
  if (TWB.ghost) townGhostDraw(TWB.ghost);
  var hasRib = TWB.rib && TWB.rib.n, hasLine = TWB.gl && TWB.gl.n; if (!hasRib && !hasLine) return;
  gl.useProgram(P.tri.prog); setCommon(P.tri); gl.uniform1f(P.tri.u.uLit, 0); gl.uniform1f(P.tri.u.uGlow, 0); gl.vertexAttrib3f(1, 0, 1, 0); gl.vertexAttrib3f(3, 0, 0, 0);
  cutSet(P.tri, null); gl.uniformMatrix4fv(P.tri.u.uModel, false, CS_ID || (CS_ID = M4.ident()));
  if (hasRib) {
    var cf = gl.isEnabled(gl.CULL_FACE), bs = [gl.BLEND_SRC_RGB, gl.BLEND_DST_RGB, gl.BLEND_SRC_ALPHA, gl.BLEND_DST_ALPHA].map(function (k) { return gl.getParameter(k); });
    gl.disable(gl.CULL_FACE); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendColor(0, 0, 0, TWB_RIB_A); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -4);         // 貼地往鏡頭推一點（同 63_towns.js 地面的帶子）
    gl.bindVertexArray(TWB.rib.vao); gl.drawArrays(gl.TRIANGLES, 0, TWB.rib.n);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.BLEND); gl.blendFuncSeparate(bs[0], bs[1], bs[2], bs[3]); gl.depthMask(true); if (cf) gl.enable(gl.CULL_FACE);
  }
  if (hasLine) { gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(TWB.gl.vao); gl.drawArrays(gl.LINES, 0, TWB.gl.n); gl.enable(gl.DEPTH_TEST); }
  gl.bindVertexArray(null);
}
/** 城名那一行（#twbTown，城鎮模式一直在）：城名、那座城的年份（另一個時空的加標示，括號裡是遊戲現在幾年）、人口 ——
 *  資料是外面那一頁附在規劃上的 live（Blocksail 地球儀的城鎮帳；TASK-0871，Tim 2026-10-23「讓玩家可以知道這座城鎮是另一個時空的」）；沒附 ⇒ 只有城名。 */
function twbTitle(T) {
  var el = $('twbTown'); if (!el) return;
  var L = T && T.p && T.p.live, s = !T ? '' : '🏘 ' + ((L && L.name) || T.name || T.id) + (L ? '　📅 ' + L.year + ' 年' + (L.other ? '・⏳ 另一個時空（現在是 ' + L.gameYear + ' 年）' : '') + '　👥 ' + (+L.pop || 0).toLocaleString('en-US') + ' 人' : '');
  if (el.textContent !== s) { el.textContent = s; el.classList.toggle('on', !!s); }
}
/** 上面那一行：剛做完的訊息留 3 秒；不然照試放／找路的回覆。 */
function twbInfo() {
  var el = $('twbInfo'); if (!el) return;
  var s, tr = TWB.tr;
  if (TWB.sel) s = '🏛 ' + TWB.sel.name + '（' + (TWB.sel.lot ? TWB.sel.lot.w.toFixed(0) + ' × ' + TWB.sel.lot.d + ' m' : TWB.sel.use) + '）—— 再點一下或 Esc 放掉';
  else if (TWB.msg && performance.now() - TWB.msgT < 3000) s = TWB.msg;
  else if (TWB.open === 1) s = '打開城鎮…';
  else if (TWB.open !== 2) s = '建築模式開不了';
  else if (TWB.cat === 'road') s = !TWB.start ? '點一下既有的路當起點' : !tr || !tr.road ? '找路線…' : tr.ok ? '路線 ' + Math.round(tr.len) + ' m、' + tr.gold + ' 金 —— 點一下鋪（右鍵取消）' : '鋪不了：' + (tr.why || []).join('；');
  else s = !TWB.q ? '游標移到路邊或空建地上' : !tr || tr.road ? '試放…' : tr.ok ? (tr.lot ? '空建地 ' + tr.lot : '路邊 ' + tr.w.toFixed(0) + ' × ' + tr.d + ' m') + twbFieldTxt(tr) + ' —— 點一下蓋' + (TWB.side ? '（' + (TWB.side > 0 ? '右' : '左') + '側）' : '') : '蓋不了：' + (tr.why || ['?'])[0];
  if (el.textContent !== s) el.textContent = s;
}
/** 生產建築那一段說明：＋田幾 m²（種什麼；長不滿上限、要放寬路邊也說）＋ 換配方的那一句。 */
function twbFieldTxt(tr) {
  if (!tr.recipe) return '';
  var nm = ((tr.recipes && tr.recipes.ok || []).filter(function (x) { return x.k === tr.recipe; })[0] || { name: tr.recipe }).name, A = tr.annex;
  return '＋田 ' + (A ? A.area + ' m²' + (A.stop === 'short' ? '（長不滿）' : '') + (A.front === 'relaxed' ? '（貼到路邊）' : '') : '?') + '、種' + nm + (tr.note ? '（' + tr.note + '）' : '');
}
/** 介面：分類分頁＋項目＋復原、收起（#twbP，#stage.twb 才顯示）；🔨 那一顆城鎮模式常駐、當開關（61_layout.js 的 town 配置）。 */
function twbUI() {
  var P = $('twbP'); if (!P) return;
  var h = '<div id="twbTabs">' + TWB_CATS.map(function (c) { return '<button type="button" data-c="' + c.k + '"' + (c.k === TWB.cat ? ' class="on"' : '') + '>' + c.name + '</button>'; }).join('') + '</div><div id="twbItems">';
  var nAll = 0;
  TWB_CATS.forEach(function (c) { c.items.forEach(function (it) { var n = ++nAll; if (c.k !== TWB.cat) return; h += '<button type="button" class="bcard' + (it.k === TWB.item ? ' on' : '') + '" data-c="' + c.k + '" data-i="' + it.k + '"><b>' + it.name + '</b><small>' + it.sub + (n <= 9 ? '（' + n + '）' : '') + '</small></button>'; }); });   // 數字鍵只到 9（twbKey）⇒ 第 10 項以後只能點（TASK-0872：工坊 8 種之後選單 12 項）
  h += '</div><div id="twbRcp"></div><div id="twbOps"><button type="button" id="twbSave" title="只存這一座城的改動（Ctrl+S）">💾 存這座城</button><button type="button" id="twbUndo">↶ 復原（Z）</button><button type="button" id="twbX">▾ 收起（B）</button></div>';
  P.innerHTML = h; TWB.rcpSig = null;
  P.querySelectorAll('#twbTabs button').forEach(function (b) { b.onclick = function () { var c = TWB_CATS.filter(function (x) { return x.k === b.dataset.c; })[0]; twbPick(c.k, c.items[0].k); }; });
  P.querySelectorAll('#twbItems button').forEach(function (b) { b.onclick = function () { twbPick(b.dataset.c, b.dataset.i); }; });
  $('twbSave').onclick = twbSave; $('twbUndo').onclick = twbUndo; $('twbX').onclick = function () { twbToggle(false); };
}
// 城鎮模式（04_modes.js town）：🔨 鈕（看不看得見照 61_layout.js 的 town 配置）—— 載入時是城鎮模式就綁；航海裡停靠換進城鎮模式時由 88_modeswitch.js 的 enter 綁（TASK-0867）
function twbBind() {
  if (TWB.bound) return;
  TWB.bound = true;
  var k = $('twbK'); if (k) k.onclick = function () { twbToggle(); };
  twbUI();
}
if (modeRule('town')) twbBind();
ctrlAdd({ name: 'town', pri: 8, on: function () { return TWB.on; },
  key: function (k, down, e) { if (!twbKey(k, down, e)) return false; e.preventDefault(); return true; },
  hover: function (x, y) { if (!TWB.on) return false; TWB.mx = x; TWB.my = y; TWB.moved = true; return true; },
  tap: function (x, y, btn) { return twbTap(x, y, btn); },
  frame: function () { twbFrame(); }
});

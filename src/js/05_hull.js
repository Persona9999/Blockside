// ───────────────────────── 船型（一種船一份；兩艘同型就共用） ─────────────────────────
// 船型 T：內嵌的 .vxk（<script type="application/x-vxk" id="…">）解碼之後的一切 —— 格子（T.base；拿掉砲帶的裝甲 ⇒ 船殼 T.hullG，24_armor.js）、合併過的網格（T.pristine）、
//   繩與帆與模型（T.rig）、模型的網格（T.meshes）、桅（T.masts）、帆的布模板（T.cloth）、水線（T.wl0／wl1／bowHalf）、
//   海面遮罩（T.hullHB）、浮力表（T.hyd／disp），以及從 header 來的中線、外框、設計水線（T.cx／cy／hx0／hx1／zw／sz）。
// 每艘船 sh.T 指向它的船型；⛔ 船型是共用的、不能改（被打掉的格子在 sh.grid：Grid.share 寫的時候才複製那一塊）。
// 只在被選到時才解碼（Tim 2026-10-12：預設只載憲法號，其他船選了才載）—— 資料本身還是內嵌在同一個 HTML 裡
//   （畫廊的 iframe 只開 allow-scripts、讀不了旁邊的檔，展品也要零外部依賴），省的是解碼與網格化的時間和記憶體。
// 公尺／格（S）每種船都要一樣（模擬裡的距離、速度、碰撞都用同一個 S）；不一樣就不載、說為什麼。
// zw0：作品沒有 `kind=ship, waterline_z` 的 meta 時用的設計水線（格的 z）。餘燼號 71 ＝ basecamp 的作品筆記（basecamp-ember-01m/todo.md「水線抬高 z 63 → 71」，
//   Tim：船變高了水線也往上）。⛔ 沒有這一格 ⇒ 用憲法號的 63，多出來那層砲甲板的排水沒算進去（排水量 2,522 噸，跟憲法號 2,154 差不多 —— Tim 2026-10-13 發現）。meta 補上之後以 meta 為準。
// geo：船型的高度（格的 z）與範圍 —— 這些本來寫死成憲法號的數字；沒給的照 GEO0（＝ 原本的數字 ⇒ 憲法號、餘燼號照舊）。
//   夜隼號（summit，2026-10-13 接）只有憲法號一半高：水線 15、主甲板 z 30、後甲板 45、桅頂平台 126（前）／136（主）、桅頂 272 ⇒ 照她的作品量的。
//   桅不在這裡：照帆桁的 meta 判斷（10_ship.js findMasts）。
// 值住在 config/game.json（TASK-0542）：geo0 ＝ 預設（本來寫死成憲法號的數字），每艘船的 geo 只寫跟它不一樣的鍵。各鍵：
//   spar  露天甲板站人的高度 [z0, z1]（陸戰隊、軍官、舵手）；null ⇒ 照 carronade 推、沒有 carronade ⇒ 100–109
//   marines 陸戰隊沿舷牆站的範圍：船尾外框 + [0] 到船頭外框 − [1]；center 船的中心高度（鏡頭看哪裡）；aim 沒有目標時瞄的高度（21_gunnery.js）
//   aimZ 瞄準點的高度夾在這段裡；deckAim 砲長「砲甲板」模式瞄的高度（51_captain.js）；rigAim 砲長「桅」模式瞄的高度
// 船員配置（crew0 ＝ 預設，每艘船的 crew 只寫不一樣的；40_crew.js、23_powder.js、42_hands.js）：
//   officers 軍官（0–8，照順序是船長、大副、二副、三副，再來是見習軍官）、helm 舵手（0–4）、marines 陸戰隊最多幾個、marineGap 陸戰隊沿舷牆每幾格一個、
//   top 每根桅的桅頂水手、monkeys 送藥手（每一對砲幾個：0 ＝ 沒有、1、2）、hands 預備水手人數（沒寫 ⇒ 預備水手的基準人數 HANDS × handsK；夜隼號 ¼）、
//   guns 砲班滿編 { 砲種: 人 }（沒寫的砲種 ⇒ 砲種表 10_ship.js GUNS 的 crew）、shelter 船員避開露天甲板（0／1；42_hands.js shelterLv：莫尼特號 1）、
//   surgeon 船醫的全船上限（0–60；人數照設施配員 ＝ 走得到的病床每張 furniture.bed.staff.surgeon 位，36_rooms.js staffSlots；站在醫療艙裡，有醫療艙才上船；44_medic.js medSurgeons）、carpenter 木匠（0–8；修梯子、補甲板破洞；46_carpenter.js）。
// 船隻清單 ＝ config/game.json 的 ships（el ＝ 內嵌 .vxk 的 id；匯入新船、重新匯入走 admin.py）；選單只列 HTML 裡真的有內嵌資料的那幾艘。
var GEO0 = CFG.geo0, CREW0 = CFG.crew0;
// 船隻配置頁（TASK-0570；Tim 2026-10-14：一型一份、要存檔、預設在後台管理頁設）：玩家改過的船員配置 SHIP_CREW（id → 改過的那幾項；69_prefs.js 存），
//   跟船隻設定（SHIP_CFG，04_state.js）一起在主選單「船隻配置…」那一頁編（71_input.js）。
//   每艘船開戰時用的 ＝ crew0 ← 那艘船的 crew（後台頁）← SHIP_CREW（shipCrew；40_crew.js makeCrew 存進 sh.cw）。
var CREW_ITEMS = [{ k: 'officers', name: '軍官', lim: [0, 8] }, { k: 'helm', name: '舵手', lim: [0, 4] }, { k: 'marines', name: '陸戰隊', lim: [0, 40] },
  { k: 'top', name: '桅頂水手', lim: [0, 8] }, { k: 'monkeys', name: '送藥手', lim: [0, 2] }, { k: 'hands', name: '預備水手', lim: [0, 120] },
  { k: 'shelter', name: '避開露天甲板', lim: [0, 1] }, { k: 'surgeon', name: '船醫上限', lim: [0, 60] }, { k: 'carpenter', name: '木匠', lim: [0, 8] }];
var GUN_CREW_MAX = 8;                                                   // 砲旁的站位只有 8 個（40_crew.js spots）；最少 ＝ 砲種表的 min（少於它那門砲永遠開不了）
var OFFICER_RANKS = ['船長', '大副', '二副', '三副'];                    // 照順序；第五個起 ＝ 見習軍官
var SHIP_CREW = {};
var CREW_SEEN = {};                                                     // id → 這一型最近一次上船的結果 { n 人數, short 站不下的, sig 那時的配置 }（40_crew.js；船隻配置頁照實列）
function crewSig(cw) { return JSON.stringify([CREW_ITEMS.map(function (it) { return cw[it.k]; }), Object.keys(GUNS).map(function (t) { return gunCrew(cw, t); })]); }
function officerRank(i) { return OFFICER_RANKS[i] || '見習軍官'; }
/** 那一型的預設（crew0 ＋ 後台頁寫在那艘船的 crew）。 */
function crewDefault(id) {
  var h = HULL_KNOWN.filter(function (x) { return x.id === id; })[0], d = Object.assign({}, CREW0, h && h.crew);
  if (d.hands === undefined) d.hands = Math.round(HANDS * (d.handsK === undefined ? 1 : d.handsK));
  d.guns = Object.assign({}, d.guns);
  return d;
}
/** 那一型實際用的（預設 ← 玩家改的；網址 ?hands= 蓋過每一型的預備水手）。 */
function shipCrew(id) {
  var c = crewDefault(id), p = SHIP_CREW[id];
  if (p) {
    CREW_ITEMS.forEach(function (it) { if (p[it.k] !== undefined && !(it.k === 'hands' && Q.has('hands'))) c[it.k] = p[it.k]; });
    if (p.guns) Object.keys(p.guns).forEach(function (t) { c.guns[t] = p.guns[t]; });
  }
  return c;
}
function gunCrew(cw, type) { var n = cw.guns && cw.guns[type]; return n === undefined ? GUNS[type].crew : n; }
// 艦名（TASK-0552；Tim 2026-10-14：參考歷史同級艦）：ships[].names ＝ 那一型的艦名池（第一個 ＝ 原名；沒給 ⇒ 只有原名），同一場照編成的順序發（52_fleet.js fleetNames）；
//   池子用完拿公共池 names_pub，再用完 ⇒ 原名＋序號。憲法號：同級的 44 砲巡防艦（合眾國號、總統號），再來是照它們的設計造的 44 砲巡防艦；公共池：同時代美國海軍的巡防艦。
//   餘燼號、夜隼號是 basecamp、summit 的船：她們給艦名池之前只有原名。
var HULL_KNOWN = CFG.ships.map(function (s) { var h = { id: s.id, el: s.el, name: s.name, geo: s.geo, crew: s.crew, rooms: s.rooms, lamps: s.lamps, flags: s.flags, names: s.names && s.names.length ? s.names : [s.name] }; if (s.zw0) h.zw0 = s.zw0; if (s.material) h.material = s.material; if (s.author) h.author = s.author; if (s.drive) h.drive = s.drive; if (s.theme) h.theme = s.theme; if (s.variant_of) h.variant_of = s.variant_of; return h; });   // material：全船預設材質（05_material.js）；author：建造者（admin.py 匯入時從 .vxk 檔頭 owner 記；船隻配置頁顯示）
var SHIP_NAMES_PUB = CFG.names_pub || [];
var HULL_LIST = HULL_KNOWN.filter(function (h) { return !!document.getElementById(h.el); });
var HULL_DEF = (HULL_LIST[0] || HULL_KNOWN[0]).id;                      // 預設的船：清單裡第一艘有內嵌資料的
var HULLS = {}, HULLT = {};                                             // id → 載入中的 Promise ／ 載好的船型
// 裝飾（TASK-0682；Tim 2026-10-17：「裝飾移除是在船隻載入時就不載入裝飾」「可以隱藏的裝飾都不算重量」）：雕刻模型 meta deco=1。
//   載入船型時一律從 rig.models 拿掉（⇒ 不算重量、不被打、不掉下來、不抽 rnd()：開或關戰局逐項相同，07_gfx.js 的規矩）；畫質「裝飾」開著才收進 T.decos、只負責畫（60_render.js drawModels）。
//   關著 ⇒ 只給裝飾用的網格不建、不上 GPU。HULL_DECO：那一份船型載入時的開關 —— 換了 ⇒ decoSync 丟掉、回主選單重新載入（快取鍵也帶它，06_cache.js）。
var HULL_DECO = {};
function isDeco(m) { var v = m && m.meta && m.meta.deco; return v !== undefined && v !== null && v !== '' && v !== '0' && v !== 0 && v !== false; }
/** 載入時拆出裝飾（buildHull 一開頭）：h.rig.models 只留不是裝飾的；回 { decos：要畫的（關著 ⇒ []）, n：作品裡有幾件, skip：只給裝飾用、這次不建的網格編號 }。 */
function decoSplit(h, on) {
  var ms = (h.rig && h.rig.models) || [], keep = [], deco = [], used = {}, skip = {};
  ms.forEach(function (m) { (isDeco(m) ? deco : keep).push(m); });
  if (!deco.length) return { decos: [], all: [], n: 0, skip: null };
  h.rig.models = keep;
  keep.forEach(function (m) { used[m.mesh] = 1; });
  if (on) deco.forEach(function (m) { used[m.mesh] = 1; });
  (h.rig.meshes || []).forEach(function (_, k) { if (!used[k]) skip[k] = 1; });
  return { decos: on ? deco : [], all: deco, n: deco.length, skip: skip };   // all：匯入檢查讀 meta（75_shipcheck.js）
}
/** 畫質「裝飾」換了（gfxShow、回主選單時叫）：載入時開關不一樣的船型丟掉、重新載入。打仗中不動（那幾艘照它載入時的樣子打完；回主選單再換）。 */
function decoSync() {
  if (RUNNING) return;
  var on = !!GFX.deco, bad = Object.keys(HULL_DECO).filter(function (id) { return HULL_DECO[id] !== on; });
  if (!bad.length) return;
  bad.forEach(function (id) { delete HULLS[id]; delete HULLT[id]; delete HULL_DECO[id]; });
  if (typeof pickShip === 'function') pickShip(0, 0);                   // 主選單的船重新載入（開戰鈕寫進度，71_input.js）
}
// 艦隊編成（TASK-0537）：FLEET_SET[0] ＝ 我方（第一艘是我艦）、[1] ＝ 敵方，各是一串船型；每一邊至少 1 艘、合計最多 FLEET_MAX（同時在場 FIELD_N 艘，其他的候補，52_fleet.js）。
//   主選單編；網址 ?blue=我艦,友艦…&red=敵艦,…；舊的 ?ship=我艦,敵艦 照舊（＝ 一邊一艘；?blue／?red 給了那一邊照它）。
var FLEET_SET = [[HULL_DEF], [HULL_DEF]];                                // 預設 ＝ 清單第一艘（HULL_DEF）
if (Q.has('ship')) Q.get('ship').split(',').forEach(function (w, i) { if (i < 2 && hullInfo(w)) FLEET_SET[i] = [w]; });
['blue', 'red'].forEach(function (k, i) { if (!Q.has(k)) return; var L = Q.get(k).split(',').filter(hullInfo); if (L.length) FLEET_SET[i] = L; });
fleetTrim(FLEET_SET);
/** 合計超過 FLEET_MAX ⇒ 從艘數多的那一邊的尾巴拿掉（一樣多 ⇒ 敵方先拿）；每一邊至少留 1 艘。 */
function fleetTrim(F) { while (F[0].length + F[1].length > FLEET_MAX) { var s = F[0].length > F[1].length ? 0 : 1; if (F[s].length <= 1) break; F[s].pop(); } return F; }
/** 編成裡用到的船型（不重複；我艦那一型第一個）。 */
function fleetHulls() { return FLEET_SET[0].concat(FLEET_SET[1]).filter(function (id, i, a) { return a.indexOf(id) === i; }); }
function myHull() { return FLEET_SET[0][0]; }
function hullInfo(id) { return HULL_LIST.filter(function (h) { return h.id === id; })[0] || null; }
/** 船型（解碼、網格化一次，之後都拿同一份）。分成幾步、每步之間讓出一次（Tim 2026-10-12：進到主選單之後才解析，解析完之前不能開戰、但可以調設定）；
 *  每一步開始時呼叫 hullSay（主選單的開戰鈕寫進度）。 */
function loadHull(id) {
  if (HULLS[id]) return HULLS[id];
  var info = hullInfo(id);
  if (!info) return Promise.reject(new Error('沒有這艘船：' + id));
  var t0 = performance.now(), deco = !!GFX.deco, P;
  hullSay(info.name + '：解碼…');
  HULL_DECO[id] = deco;
  return (HULLS[id] = P = yieldUI().then(function () { return Promise.all([VK.loadEmbedded(info.el).then(meshPool), cacheGet(info)]); })   // 解碼與讀快取一起跑（06_cache.js）
    .then(function (r) { return buildHull(info, r[0], t0, r[1], deco); })
    .then(function (T) { if (HULLS[id] === P) { HULLT[id] = T; cachePut(T, info); } return T; }));   // 載到一半被 decoSync 丟掉 ⇒ 不蓋新的那一份
}
/**
 * meta 裡指名別的部件的路徑（TASK-0657 改裝船；Tim：「概念類似 Unity 的 nested prefab」）：原船整艘是改裝船的一條關聯（原船/…）⇒ 原船裡的 meta 互相指名用的還是原船裡的路徑
 * （裝甲 mount=甲板-main/砲塔、鍋爐 funnel=煙囪、彈藥庫 hoist=梯子/turret）。照 nested prefab 的規矩：一個部件（模型）的 meta 字串照它自己那一層往上找 ——
 * 本身就是一條路徑（部件、模型、梯子）⇒ 不動；不是、而「它所在的那幾層＋它」是 ⇒ 換成完整路徑（最近的那一層先）。回：換了幾格。
 * ⛔ 只換「補上前綴才對得上」的字串 ⇒ pos=mid、material=iron 這種永遠不會被當成路徑；沒有巢狀的船一格都不換（對拍逐位元組相同）。
 */
function metaRebase(h) {
  var parts = h.parts || [], models = (h.rig && h.rig.models) || [], P = new Set(), n = 0;
  parts.forEach(function (p) {
    P.add(p.path);
    Object.keys(p.points || {}).forEach(function (k) { var i = k.lastIndexOf('.'); if (i > 0) P.add(p.path + '/' + k.slice(0, i)); });   // 梯子：<部件>/<梯名>（42_hands.js shipLadders）
  });
  models.forEach(function (m) { if (m.name) P.add(m.name); });
  function fix(path, meta) {
    if (!meta || !path || path.indexOf('/') < 0) return;
    var a = path.split('/'), pre = [];
    for (var i = a.length - 1; i >= 1; i--) pre.push(a.slice(0, i).join('/') + '/');
    Object.keys(meta).forEach(function (k) {
      var v = meta[k]; if (k === 'kind' || typeof v !== 'string' || !v || P.has(v)) return;   // kind 不是路徑（⛔ 以前照改：鳳凰號 kind=capstan 旁邊剛好有模型「主砲甲板/capstan」⇒ kind 變成那條路徑；TASK-0672 規格表檢查量出來的）
      for (var j = 0; j < pre.length; j++) if (P.has(pre[j] + v)) { meta[k] = pre[j] + v; n++; return; }
    });
  }
  parts.forEach(function (p) { fix(p.path, p.meta); });
  models.forEach(function (m) { fix(m.name, m.meta); });
  return n;
}
/** 壓縮版的成品（admin.py build 預設；--raw ＝ 原格式；TASK-0583）：header 有 mesh_pool ⇒ rig.meshes 是池子編號 { pool: i }，從 <script id=mesh_pool> 還原（池子只解一次、幾艘船共用）。
 *  池子裡一份 ＝ { v: 不重複的頂點（整數 × q，跟前一點的差值）, t: 三角形的頂點編號（跟前一個的差值）, tmat, mats }；還原成跟原本一樣的三角形（頂點去重過，法線照三角形算 ⇒ 畫出來一樣）。
 *  引用 { pool: i, o: [x, y, z] }：只差起點的網格（同一種砲擺在不同位置）共用一格，o ＝ 這一份自己的起點（整數 × q，換掉差值的第一個頂點 ⇒ 整份平移；TASK-0667）。 */
var MESH_POOL = null, MESH_POOL_M = {};
function meshPool(model) {
  var h = model.header, id = h.mesh_pool; if (!id || !h.rig || !h.rig.meshes) return model;
  if (!MESH_POOL) { var el = document.getElementById(id); if (!el) return Promise.reject(new Error('找不到網格池 #' + id)); MESH_POOL = VK.inflateRaw(VK.b64ToBytes(el.textContent)).then(function (u) { return JSON.parse(new TextDecoder().decode(u)); }); }
  return MESH_POOL.then(function (P) { h.rig.meshes = h.rig.meshes.map(function (m) { return m && m.pool !== undefined ? meshPoolMesh(P, m.pool, m.o) : m; }); return model; });
}
function meshPoolMesh(P, i, o) {
  var key = o ? i + '@' + o.join(',') : i;
  if (MESH_POOL_M[key]) return MESH_POOL_M[key];
  var e = P.meshes[i], q = P.q, v = new Array(e.v.length), t = new Array(e.t.length), x = 0, y = 0, z = 0, k, a = 0;
  if (o && e.v.length) { x = o[0] - e.v[0]; y = o[1] - e.v[1]; z = o[2] - e.v[2]; }   // 起點換成 o（整數，跟原本那一份逐點相同）
  for (k = 0; k < e.v.length; k += 3) { x += e.v[k]; y += e.v[k + 1]; z += e.v[k + 2]; v[k] = x / q; v[k + 1] = y / q; v[k + 2] = z / q; }
  for (k = 0; k < e.t.length; k++) { a += e.t[k]; t[k] = a; }
  return (MESH_POOL_M[key] = { verts: v, tris: t, tmat: e.tmat, mats: e.mats });
}
/** 讓出一次（MessageChannel：一個新的工作 ⇒ 瀏覽器可以先畫一格、處理點擊）。⛔ 不用 setTimeout：分頁在背景時會被壓到一秒一次。 */
function yieldUI() { return new Promise(function (r) { var ch = new MessageChannel(); ch.port1.onmessage = function () { r(); }; ch.port2.postMessage(0); }); }
var hullSay = function () {};                                            // 90_main.js 換成寫進度的那支
/** C：快取的記錄（06_cache.js；null ⇒ 全部現場算）。現場算的時候，要存的那幾份另外留在 T.keep，給 cachePut 存。 */
function buildHull(info, model, t0, C, deco) {
  var h = model.header, t1 = performance.now();                            // 到這裡是解碼（loadEmbedded，跟讀快取一起），之後是網格化
  var DS = decoSplit(h, deco === undefined ? !!GFX.deco : deco);          // 裝飾（TASK-0682）：在一切之前拆掉 ⇒ 之後讀 rig.models 的（重量、繩、帆、家具）都看不到它
  h.metaRebased = metaRebase(h);                                           // 改裝船（TASK-0657）：原船裡的 meta 路徑照它所在的那一層往上找（見 metaRebase）
  if (C && (C.voxels !== h.voxels || C.checksum !== h.checksum)) C = null;  // 雙保險：鍵是 .vxk 原文的雜湊，格數與 checksum 也要一樣
  if (S && Math.abs(h.meters_per_voxel - S) > 1e-9) throw new Error(info.name + ' 是 ' + h.meters_per_voxel + ' 公尺一格，跟已經載入的船（' + S + '）不一樣 —— 模擬只吃同一個比例');
  S = h.meters_per_voxel;
  var T = { id: info.id, name: info.name, model: model, h: h, rig: h.rig || { ropes: [], sails: [] },
    sz: h.size[2], cx: (h.bbox[0] + h.bbox[3]) / 2, cy: h.size[1] / 2, hx0: h.bbox[0], hx1: h.bbox[3], zw: hullZW(h, info), geo: Object.assign({}, GEO0, info.geo), lamps: info.lamps || [], crew: Object.assign({}, CREW0, info.crew) };   // 外框：含艏斜桅與後桅帆桁
  T.cached = !!C; T.keep = C ? null : {};
  T.decos = DS.decos; T.decoAll = DS.all; T.decoN = DS.n; T.meshSkip = DS.skip;                // 裝飾：要畫的、作品裡有幾件、這次不建的網格
  T.ms = {};                                                               // 每一段花多久（毫秒；讀數 window.__vxk.ms）
  function tm(k, f) { var a = performance.now(); f(); T.ms[k] = +(performance.now() - a).toFixed(1); }
  tm('sails', function () { T.sailRecipes = sailRecipes(T, C); });       // 帆只存配方（TASK-0602 ①；29_sailrecipe.js）⇒ 先生出頂點，下面的海面遮罩、縮圖、繩的檢查才讀得到
  var steps = [
    ['格子', function () { tm('grid', function () { T.base = VK.Grid.fromModel(model); }); tm('verify', function () { T.chk = VK.verify(T.base, h); }); tm('material', function () { hullMaterials(T, info); }); tm('armor', function () { armorSetup(T); }); tm('anchor', function () { anchorParts(T); }); }],   // 材質（05_material.js）：每格的材質索引   // 格子不存快取：照解出來的比 checksum   // armorSetup：砲帶的裝甲拆出來（24_armor.js；T.hullG ＝ 船殼，T.base 照舊是整艘）；anchorParts：錨的關聯拆成模型錨（76_anchor.js，TASK-0601）
    ['模型網格', function () { tm('meshes', function () { buildMeshes(T, C && C.models); }); }],
    ['水線與浮力', function () {
      tm('waterline', function () { waterline(T); }); tm('hullTex', function () { hullTex(T, C && C.hb); }); tm('navImg', function () { navImg(T); sideImg(T); });
      tm('hydro', function () { if (C) { T.hyd = C.hyd; T.disp = C.disp; } else hydrostatics(T); });
    }],
    ['船體網格', function () { tm('pristine', function () { T.pristine = new VK.RegionSet(gl, T.hullG, QIDX); if (C) meshesFromCache(T.pristine, C.mesh); else T.pristine.buildAll(); }); smoothSetup(T); tm('armorMesh', function () { armorMesh(T); }); }],   // smoothSetup：平滑渲染的那幾格（15_smooth.js；T.ms.smooth）；合併網格照船殼 T.hullG（沒有裝甲 ＝ T.base），裝甲另建（24_armor.js armorMesh）
    ['桅與帆', function () {
      tm('masts', function () { findMasts(T); }); tm('cloth', function () { teamFlagsSetup(T, info); clothSetup(T, C); });   // 陣營旗（77_colours.js）：合成的帆接在作品的帆後面
      var mt = 12 * KEG_T; (T.rig.models || []).forEach(function (m) { mt += modelT({ kind: modelKind(m) }, 1); });   // 模型的重量（砲照實、取用點 12 桶）
      T.ballast0 = Math.max(0, Math.round((T.disp - T.voxT0 - mt) / 25) * 25);   // 剛好浮在設計水線的壓艙物（滑桿一格 25 噸）
    }]
  ];
  var p = Promise.resolve();
  steps.forEach(function (s, i) { p = p.then(function () { hullSay(info.name + '：' + s[0] + '（' + (i + 1) + '／' + steps.length + '）…'); return yieldUI(); }).then(s[1]); });
  return p.then(function () { T.decodeMs = t1 - t0; T.meshMs = performance.now() - t1; return T; });
}
/** 羅盤中間的船（Tim 2026-10-13：藍色箭頭換成從上面俯瞰的船，載入時算一次、解析度可以低）：
 *  每 NAV_CELL × NAV_CELL 格取最高那一格的顏色（照高度提亮一點 ⇒ 桅頂、甲板、舷牆分得開），裁到有東西的範圍。
 *  畫布：船頭朝上、右舷（格 +y）在右 ⇒ 羅盤只要轉、不用翻。原始格子（沒有砲、帆桁這些模型；開戰後被打掉的也不跟）。 */
var NAV_CELL = 4;
function navImg(T) {
  var G = T.base, C = NAV_CELL, W = Math.ceil(G.sy / C), H = Math.ceil(G.sx / C), top = new Int16Array(W * H).fill(-1), col = new Uint8Array(W * H);
  G.each(function (x, y, z, c) { var i = ((H - 1 - ((x / C) | 0)) * W) + ((y / C) | 0); if (z > top[i]) { top[i] = z; col[i] = c; } });
  var x0 = W, x1 = -1, y0 = H, y1 = -1, i, u, v;
  for (v = 0; v < H; v++) for (u = 0; u < W; u++) if (top[v * W + u] >= 0) { if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; }
  if (x1 < 0) return;
  var cv = document.createElement('canvas'); cv.width = x1 - x0 + 1; cv.height = y1 - y0 + 1;
  var g = cv.getContext('2d'), im = g.createImageData(cv.width, cv.height), d = im.data;
  for (v = y0; v <= y1; v++) for (u = x0; u <= x1; u++) {
    i = v * W + u; var o = ((v - y0) * cv.width + (u - x0)) * 4; if (top[i] < 0) continue;
    var c = col[i], k = 0.62 + 0.38 * clamp((top[i] - T.zw) / 80, 0, 1);
    d[o] = ((c >> 5) & 7) * 255 / 7 * k; d[o + 1] = ((c >> 2) & 7) * 255 / 7 * k; d[o + 2] = (c & 3) * 255 / 3 * k; d[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  T.navImg = cv; T.navU = ((T.cy / C) | 0) - x0 + 0.5; T.navV = (H - 1 - ((T.cx / C) | 0)) - y0 + 0.5;
  T.navX0 = x0; T.navY0 = y0; T.navGH = H;                               // 圖上 (u, v) ⇒ 格 (x, y) ＝ ((H − y0 − v)·C, (x0 + u)·C)：砲位圖（61_hud.js gmapDraw）照它把砲放上去   // 船的中心（格的 cx, cy）在圖上的位置 ⇒ 羅盤照它對準圓心
}
/** 上方艦隊按鈕中間的船（TASK-0552）：從左舷看過去的側面投影（船頭朝右；每 SIDE_CELL × SIDE_CELL 格取最靠左舷那一格的顏色、越往裡越暗），
 *  帆（作品的帆面，旗不算）照每面帆的顏色畫一層墊在後面 ⇒ 認得出是帆船。載入時算一次、裁到有東西的範圍；原始格子（開戰後被打掉的不跟）。 */
var SIDE_CELL = 4;
function sideImg(T) {
  var G = T.base, C = SIDE_CELL, W = Math.ceil(G.sx / C), H = Math.ceil(G.sz / C), near = new Int16Array(W * H).fill(0x7fff), col = new Uint8Array(W * H);
  G.each(function (x, y, z, c) { var i = (H - 1 - ((z / C) | 0)) * W + ((x / C) | 0); if (y < near[i]) { near[i] = y; col[i] = c; } });
  var x0 = W, x1 = -1, y0 = H, y1 = -1, i, u, v;
  function grow(u, v) { if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; }
  for (v = 0; v < H; v++) for (u = 0; u < W; u++) if (near[v * W + u] < 0x7fff) grow(u, v);
  var sails = (T.rig.sails || []).filter(function (s) { return !isFlag(s); });
  sails.forEach(function (s) { for (var j = 0; j < s.verts.length; j += 3) grow(clamp(Math.floor(s.verts[j] / C), 0, W - 1), clamp(H - 1 - Math.floor(s.verts[j + 2] / C), 0, H - 1)); });
  if (x1 < 0) return;
  var hc = document.createElement('canvas'); hc.width = W; hc.height = H;
  var hg = hc.getContext('2d'), im = hg.createImageData(W, H), dd = im.data;
  for (i = 0; i < W * H; i++) {
    if (near[i] === 0x7fff) continue;
    var c = col[i], k = 0.95 - 0.4 * clamp((near[i] - T.cy + G.sy / 2) / G.sy, 0, 1), o = i * 4;
    dd[o] = ((c >> 5) & 7) * 255 / 7 * k; dd[o + 1] = ((c >> 2) & 7) * 255 / 7 * k; dd[o + 2] = (c & 3) * 255 / 3 * k; dd[o + 3] = 255;
  }
  hg.putImageData(im, 0, 0);
  var cv = document.createElement('canvas'); cv.width = x1 - x0 + 1; cv.height = y1 - y0 + 1;
  var g = cv.getContext('2d'); g.translate(-x0, -y0);
  sails.forEach(function (s) {                                          // 一個三角形填一次（⛔ 全部放進同一條路徑 ⇒ 帆是正反兩層、繞向相反，互相抵銷成空的）
    var P3 = s.verts, t = s.tris, sc = s.color || [0.95, 0.92, 0.85];   // 照那面帆自己的顏色（Tim 2026-10-14：餘燼號的帆在圓鈕上變成白的；預設色跟 30_rig_physics.js 同一個）
    g.fillStyle = 'rgba(' + Math.round(sc[0] * 255) + ',' + Math.round(sc[1] * 255) + ',' + Math.round(sc[2] * 255) + ',0.85)';
    for (var j = 0; j < t.length; j += 3) { g.beginPath(); for (var q = 0; q < 3; q++) { var a = t[j + q] * 3, px = P3[a] / C, pz = H - P3[a + 2] / C; if (q) g.lineTo(px, pz); else g.moveTo(px, pz); } g.fill(); }
  });
  g.drawImage(hc, 0, 0);
  cv.wl = isFinite(T.zw) ? clamp(H - T.zw / C - y0, 0, cv.height) : cv.height;   // 設計水線在圖裡第幾個像素（由上往下）：圓鈕照它把船的水線貼在畫的海平面上（61_hud.js sideDraw；Tim 2026-10-15：船飄在空中）
  T.sideImg = cv;
}
/** 設計水線（格的 z）：組裝件或關聯的 meta `kind=ship, waterline_z`（跟 basecamp 提議中）；沒有 ⇒ ZW0（憲法號 63）。 */
function hullZW(h, info) {
  var p = (h.parts || []).filter(function (q) { return q.meta && q.meta.kind === 'ship'; })[0], m = (p && p.meta) || h.meta || {};
  return isFinite(+m.waterline_z) && +m.waterline_z > 0 ? +m.waterline_z : info && info.zw0 ? info.zw0 : ZW0;   // meta ＞ 船型清單的 zw0 ＞ 63
}

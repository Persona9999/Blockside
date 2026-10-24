// ───────────────────────── 城鎮介面（停靠後：🏛 城鎮資訊、💰 貿易；Blocksail TASK-0910、docs/TOWN_UI.md） ─────────────────────────
// 區塊職責：城鎮模式（04_modes.js town）#keys 多兩顆 —— 💰 貿易（T；常用，放在 🔨 旁邊）、🏛 城鎮（I）；面板 #tuiP 右邊一欄，子選單五頁：
//   📋 概況、⚖ 產出與消耗、📦 庫存與價格、📈 統計報表、💰 貿易。
//   Tim 2026-10-25：「希望城鎮模式下（停靠後）有按鈕可以開啟介面 可以顯示城鎮資訊&跟城鎮互動（子選單） 貿易按鈕很常用可以放在外側（建築按鈕旁）
//     子選單可以放城鎮的一些詳細資訊鈕（例如 查看城鎮每日產出資源&消耗資源 目前庫存等 以及統計報表（人口 資源變化圖等） 然後貿易按照之前文件規格 只顯示雙方有的貨物」
// 協定（Blocksail world/mapgen.js serve ⇒ globe.html townUI）：這一頁 ⇒ 那一頁 { bsmap: 'need', what: 'townUI', town, cmd, seq, g?, q?, ship? }；
//   那一頁 ⇒ 這一頁 { bsmap: 'townUI', seq, cmd, ok, why?, … }（08_seabed.js 轉給 tuiGot）：
//     'info' ⇒ { info（Blocksail townInfo：人口、崗位、市場、flow 最近那一天的產出／原料／鎮民吃、hist 歷史）, goods（貨物表的名字）, blds（建築種類的名字）, every（歷史幾天一筆）}
//     'trade' ⇒ { list（world/trade.js tradeList：只列船上有 ∪ 城鎮有庫存的貨）}；'buy'／'sell'（g、q 桶、ship）⇒ { res（tradeDo）, list }
//   ship ＝ 玩家這艘船 { kind, ballastT（那一型剛好浮在設計水線的壓艙物）, wpa（水線面積：水線下那一層的體積 ÷ 層厚，32_hull.js T.hyd）}：那一頁照它開玩家的船隊貨艙、算吃水
// 物理意義：⛔ 這一支不算經濟 —— 數字全照那一頁的城鎮帳（買賣、價格、關稅都在 Blocksail world/stores.js）；這裡只問、只畫。
// 失敗處置：沒有 host、不是城鎮模式 ⇒ 按鈕沒反應、說一聲；5 秒沒回 ⇒ 說那一頁沒回（太舊的地球儀）；回覆的 why 照原樣顯示。
var TUI = { region: null, open: false, tab: 'sum', seq: 0, wait: {}, info: null, goods: {}, blds: {}, every: 7, list: null, msg: '', busy: false, pick: null, charts: {}, last: 'sum' };
var TUI_TABS = [{ k: 'sum', name: '📋 概況' }, { k: 'flow', name: '⚖ 產出與消耗' }, { k: 'stock', name: '📦 庫存與價格' }, { k: 'stats', name: '📈 統計報表' }, { k: 'trade', name: '💰 貿易' }];
var TUI_C = ['#3987e5', '#d95926'];                                     // 圖的兩條線：藍、橘（dataviz 參考色盤第 1、2 格的深色版；深底 #12161d 上驗過：色盲 ΔE 26.8、對比 ≥ 3）
var TUI_JOB = { build: '營造（工地）', garrison: '士兵', forage: '野外採集' };   // 不是建築種類的崗位
var TUI_CAT = { food: '糧食', raw: '原料', cash: '經濟作物', goods: '製品', war: '軍需', metal: '貴金屬', curio: '奇物' };
function tuiOk() { return modeRule('town') && BED && BED.host && TWB.town; }
function tuiEsc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function tuiNum(x, d) { x = +x || 0; return x.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
function tuiGood(g) { var X = TUI.goods[g]; if (X && X.name) return X.name; var R = TUI.list && TUI.list.rows.filter(function (r) { return r.g === g; })[0]; return R ? R.name : g; }
/** 跟外面那一頁要（cb(回覆)）；5 秒沒回 ⇒ cb({ ok: false, why }）。 */
function tuiAsk(cmd, extra, cb) {
  if (!tuiOk()) { if (cb) cb({ ok: false, why: ['城鎮介面要從 Blocksail 地球儀停靠進城'] }); return; }
  var s = ++TUI.seq; TUI.wait[s] = cb || null;
  BED.host.postMessage(Object.assign({ bsmap: 'need', what: 'townUI', town: TWB.town, cmd: cmd, seq: s }, extra || {}), '*');
  setTimeout(function () { var f = TUI.wait[s]; if (f !== undefined) { delete TUI.wait[s]; if (f) f({ ok: false, why: ['地球儀那一頁沒有回（太舊的版本沒有城鎮介面）'] }); } }, 5000);
}
/** 外面那一頁的回覆（08_seabed.js）。 */
function tuiGot(d) { var cb = TUI.wait[d.seq]; delete TUI.wait[d.seq]; if (cb) cb(d); }
/** 玩家這艘船（開船隊貨艙、算吃水用）：船型還沒載好 ⇒ null。 */
function tuiShip() {
  var sh = SHIPS[PLAYER_I], T = sh && sh.T; if (!T) return null;
  var wpa = T.hyd && T.zw > 0 && T.hyd.length > T.zw ? T.hyd[T.zw - 1] / S : 0;
  return { kind: T.id, ballastT: T.ballast0 || 0, wpa: wpa > 0 ? Math.round(wpa * 10) / 10 : null };
}
/** 開關：tab 給了 ⇒ 開那一頁（已經開著同一頁 ⇒ 關）；沒給 ⇒ 開上次那一頁（貿易以外的）。 */
function tuiToggle(tab) {
  if (!tuiOk()) { note(SHIPS[PLAYER_I], '城鎮介面要從 Blocksail 地球儀停靠進城'); return; }
  var t = tab || TUI.last;
  if (TUI.open && TUI.tab === t) { tuiClose(); return; }
  TUI.open = true; TUI.tab = t; if (t !== 'trade') TUI.last = t;
  $('stage').classList.add('tui'); $('stage').classList.toggle('tuiT', t === 'trade');
  tuiLoad();
}
function tuiClose() { TUI.open = false; var st = $('stage'); if (st) { st.classList.remove('tui'); st.classList.remove('tuiT'); } }
function tuiEscEaten() { if (!TUI.open) return false; tuiClose(); return true; }
/** 照現在那一頁問資料、畫（換頁、買賣之後都重問 ⇒ 永遠是城鎮帳現在的數字）。 */
function tuiLoad() {
  tuiUI();
  if (TUI.tab === 'trade') tuiAsk('trade', { ship: tuiShip() }, function (r) { if (r.ok) TUI.list = r.list; else TUI.msg = '開不了貿易：' + (r.why || []).join('；'); tuiUI(); });
  tuiInfo();
}
/** 問城鎮資訊（每一頁都要：上面那一列、貨名 tuiGood；買賣之後城鎮金庫跟著變 ⇒ 重問）。 */
function tuiInfo() {
  tuiAsk('info', null, function (r) { if (r.ok) { TUI.info = r.info; TUI.goods = r.goods || {}; TUI.blds = r.blds || {}; TUI.every = r.every || 7; TUI.region = r.region || null; TUI.faction = r.faction || null; } else TUI.msg = '問不到城鎮資訊：' + (r.why || []).join('；'); tuiUI(); });
}
/** 買賣（side 'buy'｜'sell'、q 桶）：一次只送一筆；回來照新的清單重畫、說成交了多少。 */
function tuiTrade(side, g, q) {
  if (TUI.busy || !(q > 0)) return;
  TUI.busy = true;
  tuiAsk(side, { g: g, q: q, ship: tuiShip() }, function (r) {
    TUI.busy = false;
    if (!r.ok && !r.res) { TUI.msg = (side === 'buy' ? '買不了：' : '賣不了：') + (r.why || []).join('；'); tuiUI(); return; }
    var R = r.res; if (r.list) TUI.list = r.list;
    TUI.msg = R.q > 0 ? (side === 'buy' ? '買了 ' + tuiNum(R.q, R.q % 1 ? 2 : 0) + ' 桶' + tuiGood(g) + '，付 ' + tuiNum(R.pay, 2) + '（含關稅 ' + tuiNum(R.fee, 2) + '）' : '賣了 ' + tuiNum(R.q, R.q % 1 ? 2 : 0) + ' 桶' + tuiGood(g) + '，拿到 ' + tuiNum(R.pay, 2) + '（扣關稅 ' + tuiNum(R.fee, 2) + '）') : (side === 'buy' ? '沒買到' : '沒賣掉');
    if (R.why && R.why.length) TUI.msg += '（' + R.why.join('；') + '）';
    tuiUI(); tuiInfo();
  });
}

// ───────── 畫 ─────────
/** 上面那一列：城名、年份、勢力、人口、城鎮金庫（info 還沒到 ⇒ 照規劃帶的 live）。 */
function tuiHead() {
  var I = TUI.info, T = twbTown(), L = T && T.p && T.p.live;
  var nm = (I && I.name) || (L && L.name) || TWB.town || '', s = '<b>🏘 ' + tuiEsc(nm) + '</b>';
  if (I) s += '<span>📅 ' + I.year + ' 年' + (I.otherTime ? '・⏳ 另一個時空（現在 ' + I.gameYear + ' 年）' : '') + '</span>' + (I.faction ? '<span>🏳 ' + tuiEsc(TUI.faction || I.faction) + '</span>' : '') +
    '<span>👥 ' + tuiNum(I.pop.total) + ' 人</span><span>💰 城鎮金庫 ' + tuiNum(I.funds) + '</span><span>第 ' + (I.day + 1) + ' 天</span>';
  return '<div id="tuiHead">' + s + '<button type="button" id="tuiX" title="關掉（Esc）">✕</button></div>';
}
function tuiTabs() { return '<div id="tuiTabs">' + TUI_TABS.map(function (t) { return '<button type="button" data-t="' + t.k + '"' + (t.k === TUI.tab ? ' class="on"' : '') + '>' + t.name + '</button>'; }).join('') + '</div>'; }
function tuiUI() {
  var P = $('tuiP'); if (!P) return;
  if (!TUI.open) { if (P.innerHTML) P.innerHTML = ''; return; }
  var body = TUI.tab === 'trade' ? tuiTradeHTML() : !TUI.info ? '<p class="tuiDim">問城鎮帳…</p>' : TUI.tab === 'sum' ? tuiSumHTML() : TUI.tab === 'flow' ? tuiFlowHTML() : TUI.tab === 'stock' ? tuiStockHTML() : tuiStatsHTML();
  var sc = P.querySelector('#tuiBody'), top = sc ? sc.scrollTop : 0;
  P.innerHTML = tuiHead() + tuiTabs() + '<div id="tuiBody">' + body + '</div>' + (TUI.msg ? '<div id="tuiMsg">' + tuiEsc(TUI.msg) + '</div>' : '');
  if (sc) P.querySelector('#tuiBody').scrollTop = top;                 // 買賣之後重畫：捲到哪留在哪
  $('tuiX').onclick = tuiClose;
  P.querySelectorAll('#tuiTabs button').forEach(function (b) { b.onclick = function () { if (b.dataset.t !== TUI.tab) { TUI.msg = ''; tuiToggle(b.dataset.t); } }; });
  P.querySelectorAll('button[data-side]').forEach(function (b) { b.onclick = function () { tuiTrade(b.dataset.side, b.dataset.g, +b.dataset.q); }; });
  var sel = $('tuiPick'); if (sel) sel.onchange = function () { TUI.pick = sel.value; tuiUI(); };
  P.querySelectorAll('svg.tuiCh').forEach(tuiHover);
}
/** 概況：人口、勞動、崗位、失業與碼頭、吃飯、建築、家族。 */
function tuiSumHTML() {
  var I = TUI.info, E = I.emi || {}, J = I.jobs || {}, jt = 0, h = '';
  Object.keys(J).forEach(function (k) { jt += J[k]; });
  h += '<div class="tuiTiles">' + [['👥 人口', tuiNum(I.pop.total)], ['💪 勞動人口', tuiNum(I.pop.labor)], ['🔧 有工作', tuiNum(jt)], ['🪑 失業', tuiNum(E.idle || 0)], ['📢 缺工', tuiNum(E.short || 0)], ['⚓ 碼頭上等船', tuiNum(E.dock || 0)],
    ['💰 城鎮金庫', tuiNum(I.funds)], ['👛 鎮民金庫', tuiNum(I.folkFunds)], ['🛡 士兵', tuiNum(I.guard.now) + ' / ' + tuiNum(I.guard.cap)]].map(function (x) { return '<div><small>' + x[0] + '</small><b>' + x[1] + '</b></div>'; }).join('') + '</div>';
  var F = I.fed;
  if (F) { var eat = F.eat || {}, LV = ['荒年糧', '主糧', '家常', '佳餚']; h += '<h4>🍞 昨天吃飯（份）</h4><p>' + [3, 2, 1, 0].map(function (k) { return LV[k] + ' ' + tuiNum((eat[k] || 0) / 1000); }).join('　') + (F.relief ? '　（城鎮免費補了 ' + tuiNum(F.relief / 1000) + ' 份）' : '') + (F.famine ? '　⚠ 飢荒' : '') + '</p>'; }   // 等級照 Blocksail world/food.js FOOD_LEVELS
  var ks = Object.keys(J).sort(function (a, b) { return J[b] - J[a]; });
  h += '<h4>🔧 崗位（今天分到幾人）</h4>' + (ks.length ? '<table class="tuiT"><tr><th>工作</th><th>人</th></tr>' + ks.map(function (k) { return '<tr><td>' + tuiEsc(TUI_JOB[k] || TUI.blds[k] || k) + '</td><td>' + tuiNum(J[k]) + '</td></tr>'; }).join('') + '</table>' : '<p class="tuiDim">還沒有人上工（帳還沒過一天）</p>');
  var B = {}; (I.buildings || []).forEach(function (b) { B[b.type] = (B[b.type] || 0) + 1; });
  var bk = Object.keys(B).sort(function (a, b) { return B[b] - B[a]; });
  h += '<h4>🏗 生產建築（' + tuiNum((I.buildings || []).length) + ' 棟）</h4><p>' + bk.map(function (k) { return tuiEsc(TUI.blds[k] || k) + ' × ' + B[k]; }).join('、') + '</p>';
  var RG = TUI.region;                                                  // 這座城那一區的加總（Blocksail regionInfo：區域 ＝ 那一區的城鎮加總）
  if (RG) h += '<h4>🗺 這一區（' + RG.towns.length + ' 座：' + RG.towns.map(tuiEsc).join('、') + '）</h4><p>人口 ' + tuiNum(RG.pop) + '　勞動 ' + tuiNum(RG.labor) + '　失業 ' + tuiNum(RG.idle) + '　碼頭上 ' + tuiNum(RG.dock) + '　城鎮金庫 ' + tuiNum(RG.funds) + '　生產建築 ' + tuiNum(RG.buildings) + '</p>';
  if (I.families && I.families.length) h += '<h4>👪 家族</h4><p>' + I.families.map(function (f) { return tuiEsc(f.name || f.id || f); }).join('、') + '</p>';
  return h;
}
/** 產出與消耗：最近那一天每種貨 產出、原料、鎮民吃、淨（桶）；照淨值的大小排。 */
function tuiFlowHTML() {
  var F = TUI.info.flow;
  if (!F) return '<p class="tuiDim">帳還沒過一天（開船讓時間走，城鎮帳每天記一次）</p>';
  var keys = {}; ['made', 'used', 'eat'].forEach(function (k) { Object.keys(F[k] || {}).forEach(function (g) { keys[g] = 1; }); });
  var R = Object.keys(keys).map(function (g) { var m = (F.made[g] || 0) / 1000, u = (F.used[g] || 0) / 1000, e = (F.eat[g] || 0) / 1000; return { g: g, m: m, u: u, e: e, n: m - u - e }; });
  R.sort(function (a, b) { return Math.abs(b.n) - Math.abs(a.n) || (a.g < b.g ? -1 : 1); });
  var d = function (x) { return x ? tuiNum(x, 2) : '<span class="tuiDim">–</span>'; };
  return '<p class="tuiDim">昨天（第 ' + TUI.info.day + ' 天）；桶。原料 ＝ 生產建築與工地吃的；鎮民吃 ＝ 鎮民買的＋城鎮補的。</p>' +
    (R.length ? '<table class="tuiT"><tr><th>貨</th><th>產出</th><th>原料</th><th>鎮民吃</th><th>淨</th></tr>' + R.map(function (r) {
      return '<tr><td>' + tuiEsc(tuiGood(r.g)) + '</td><td>' + d(r.m) + '</td><td>' + d(r.u) + '</td><td>' + d(r.e) + '</td><td class="' + (r.n > 0 ? 'up' : r.n < 0 ? 'dn' : '') + '">' + (r.n > 0 ? '＋' : r.n < 0 ? '−' : '') + tuiNum(Math.abs(r.n), 2) + '</td></tr>';
    }).join('') + '</table>' : '<p class="tuiDim">那一天什麼都沒產出、沒用掉</p>');
}
/** 庫存與價格：市場有的、或有人要的貨；照貨物表的類別分段。 */
function tuiStockHTML() {
  var M = TUI.info.market, order = Object.keys(TUI.goods), idx = {}; order.forEach(function (g, i) { idx[g] = i; });
  var co = Object.keys(TUI_CAT), cix = function (g) { var i = co.indexOf((TUI.goods[g] || {}).cat); return i < 0 ? co.length : i; };   // 照類別分段（貨物表本身沒照類別排）、段內照貨物表的順序
  var gs = Object.keys(M).filter(function (g) { return (M[g].stock > 0 || M[g].daily > 0) && (TUI.goods[g] || {}).cat !== 'people'; })   // 人（碼頭上的移民）在概況那一格
    .sort(function (a, b) { return cix(a) - cix(b) || (a in idx ? idx[a] : 1e9) - (b in idx ? idx[b] : 1e9) || (a < b ? -1 : 1); });
  if (!gs.length) return '<p class="tuiDim">市場是空的</p>';
  var h = '<p class="tuiDim">庫存、目標（照每天要用的算的那一點；庫存 ＝ 目標時價格 ＝ 基準價）、每天要（理論消耗）、現在的價格（一桶）。</p><table class="tuiT"><tr><th>貨</th><th>庫存</th><th>目標</th><th>每天要</th><th>價格</th><th>基準</th></tr>', cat = null;
  gs.forEach(function (g) {
    var X = TUI.goods[g] || {}, q = M[g], c = X.cat || '';
    if (c !== cat) { cat = c; h += '<tr class="cat"><td colspan="6">' + tuiEsc(TUI_CAT[c] || c || '其他') + '</td></tr>'; }
    var r = X.price ? q.price / X.price : 1;
    h += '<tr><td>' + tuiEsc(tuiGood(g)) + '</td><td>' + tuiNum(q.stock, 1) + '</td><td>' + tuiNum(q.target, 0) + '</td><td>' + tuiNum(q.daily, 2) + '</td><td class="' + (r > 1.15 ? 'dn' : r < 0.87 ? 'up' : '') + '">' + tuiNum(q.price, 2) + (q.bonus > 1.01 ? ' ⚠' : '') + '</td><td class="tuiDim">' + (X.price != null ? tuiNum(X.price, 2) : '–') + '</td></tr>';
  });
  return h + '</table><p class="tuiDim">⚠ ＝ 長期缺貨、價格往上加成。價格比基準貴兩成以上標紅、便宜一成以上標綠。</p>';
}
/** 統計報表：人口、金庫、失業與碼頭（每天）；選一種貨看庫存、價格、產出與消耗（每 every 天一筆）。 */
function tuiStatsHTML() {
  var H = TUI.info.hist; TUI.charts = {};
  if (!H || !H.day || H.day.pop.length < 2) return '<p class="tuiDim">歷史還不到兩天（開船讓時間走，城鎮帳每天記一格）</p>';
  var D = H.day, xs = D.pop.map(function (_, i) { return D.d0 + i; }), k = function (a) { return a.map(function (x) { return x / 1000; }); };
  var h = tuiChart('pop', '👥 人口', xs, [{ name: '人口', v: D.pop }, { name: '勞動人口', v: D.labor }], 0, '人') +
    tuiChart('fund', '💰 金庫', xs, [{ name: '城鎮金庫', v: k(D.funds) }, { name: '鎮民金庫', v: k(D.folk) }], 0, '') +
    tuiChart('idle', '🪑 失業與碼頭上', xs, [{ name: '失業', v: D.idle }, { name: '碼頭上等船', v: D.dock }], 0, '人');
  var W = H.wk || [];
  if (W.length < 2) return h + '<p class="tuiDim">貨的變化每 ' + TUI.every + ' 天記一筆，還不到兩筆</p>';
  var gs = {}; W.forEach(function (w) { Object.keys(w.g).forEach(function (g) { if ((TUI.goods[g] || {}).cat !== 'people') gs[g] = 1; }); });   // 人（碼頭上的移民）不列
  var L = Object.keys(gs).sort(function (a, b) { return tuiGood(a) < tuiGood(b) ? -1 : 1; });
  if (!TUI.pick || !gs[TUI.pick]) { var best = null, bv = -1; L.forEach(function (g) { var v = 0; W.forEach(function (w) { var r = w.g[g]; if (r) v += r[2]; }); if (v > bv) { bv = v; best = g; } }); TUI.pick = best; }
  var g = TUI.pick, wx = W.map(function (w) { return w.day; }), col = function (i, f) { return W.map(function (w) { var r = w.g[g]; return r ? r[i] / 1000 * (f || 1) : 0; }); };
  var eatUse = W.map(function (w) { var r = w.g[g]; return r ? (r[3] + r[4]) / 1000 / TUI.every : 0; });
  h += '<h4>📦 一種貨（每 ' + TUI.every + ' 天一筆）<select id="tuiPick">' + L.map(function (x) { return '<option value="' + x + '"' + (x === g ? ' selected' : '') + '>' + tuiEsc(tuiGood(x)) + '</option>'; }).join('') + '</select></h4>';
  h += tuiChart('gs', tuiGood(g) + '：庫存', wx, [{ name: '庫存', v: col(0) }], 1, '桶') +
    tuiChart('gp', tuiGood(g) + '：價格（一桶）', wx, [{ name: '價格', v: col(1) }], 2, '') +
    tuiChart('gf', tuiGood(g) + '：每天平均（那 ' + TUI.every + ' 天）', wx, [{ name: '產出', v: col(2, 1 / TUI.every) }, { name: '用掉（原料＋鎮民吃）', v: eatUse }], 2, '桶');
  return h;
}
/** 一張折線圖（SVG）：一個 y 軸、兩條以內（兩條 ⇒ 圖例）；滑過去有十字線與那一天的數字（tuiHover）。資料記在 TUI.charts[id]。 */
function tuiChart(id, title, xs, ser, dec, unit) {
  var W = 520, H = 150, l = 52, r = 10, t = 10, b = 22, lo = Infinity, hi = -Infinity;
  ser.forEach(function (s) { s.v.forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; }); });
  if (hi === lo) { hi += 1; lo = Math.max(0, lo - 1); }
  var pad = (hi - lo) * 0.08; lo = lo >= 0 && lo - pad < 0 ? 0 : lo - pad; hi += pad;
  var X = function (i) { return l + (W - l - r) * (xs.length > 1 ? i / (xs.length - 1) : 0.5); }, Y = function (v) { return t + (H - t - b) * (1 - (v - lo) / (hi - lo)); };
  TUI.charts[id] = { xs: xs, ser: ser, dec: dec, unit: unit, X: X, l: l, r: r, W: W, H: H, t: t, b: b, Y: Y };
  var g = '';
  for (var k = 0; k <= 3; k++) { var v = lo + (hi - lo) * k / 3, y = Y(v); g += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + y + '" y2="' + y + '" class="gr"/><text x="' + (l - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + tuiNum(v, Math.abs(hi - lo) < 10 ? dec : 0) + '</text>'; }
  g += '<text x="' + l + '" y="' + (H - 6) + '">第 ' + xs[0] + ' 天</text><text x="' + (W - r) + '" y="' + (H - 6) + '" text-anchor="end">第 ' + xs[xs.length - 1] + ' 天</text>';
  ser.forEach(function (s, j) { g += '<polyline fill="none" stroke="' + TUI_C[j] + '" stroke-width="2" stroke-linejoin="round" points="' + s.v.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ') + '"/>'; });
  g += '<line class="cx" x1="0" x2="0" y1="' + t + '" y2="' + (H - b) + '" style="display:none"/>' + ser.map(function (s, j) { return '<circle class="cd" r="4" fill="' + TUI_C[j] + '" style="display:none"/>'; }).join('');
  var leg = ser.length > 1 ? '<span class="leg">' + ser.map(function (s, j) { return '<i style="background:' + TUI_C[j] + '"></i>' + tuiEsc(s.name); }).join('　') + '</span>' : '';
  return '<div class="tuiChW"><h5>' + tuiEsc(title) + (unit ? '（' + unit + '）' : '') + leg + '</h5><svg class="tuiCh" data-id="' + id + '" viewBox="0 0 ' + W + ' ' + H + '" >' + g + '</svg><div class="tip" hidden></div></div>';
}
/** 滑過圖：最近的那一天 ⇒ 十字線、點、說明框（數字照那一天）。 */
function tuiHover(svg) {
  var C = TUI.charts[svg.dataset.id], tip = svg.parentNode.querySelector('.tip'), cx = svg.querySelector('.cx'), cd = svg.querySelectorAll('.cd'); if (!C) return;
  svg.onmousemove = function (e) {
    var R = svg.getBoundingClientRect(), x = (e.clientX - R.left) / R.width * C.W, n = C.xs.length, i = Math.max(0, Math.min(n - 1, Math.round((x - C.l) / (C.W - C.l - C.r) * (n - 1)))), px = C.X(i);
    cx.setAttribute('x1', px); cx.setAttribute('x2', px); cx.style.display = '';
    C.ser.forEach(function (s, j) { cd[j].setAttribute('cx', px); cd[j].setAttribute('cy', C.Y(s.v[i])); cd[j].style.display = ''; });
    tip.innerHTML = '第 ' + C.xs[i] + ' 天' + C.ser.map(function (s, j) { return '<br>' + (C.ser.length > 1 ? '<i style="background:' + TUI_C[j] + '"></i>' : '') + tuiEsc(s.name) + ' <b>' + tuiNum(s.v[i], C.dec) + '</b>' + (C.unit ? ' ' + C.unit : ''); }).join('');
    tip.hidden = false; var tx = px / C.W * R.width; tip.style.left = Math.min(R.width - tip.offsetWidth, Math.max(0, tx + 12)) + 'px';
  };
  svg.onmouseleave = function () { cx.style.display = 'none'; cd.forEach(function (c) { c.style.display = 'none'; }); tip.hidden = true; };
}
/** 貿易：只列船上有 ∪ 城鎮有庫存的貨；每一列 城鎮、船上、買一桶、賣一桶、按鈕；底下玩家金庫、載重。 */
function tuiTradeHTML() {
  var L = TUI.list; if (!L) return '<p class="tuiDim">問市場…</p>';
  var btn = function (side, g, q, label, ok) { return '<button type="button" data-side="' + side + '" data-g="' + g + '" data-q="' + q + '"' + (ok && !TUI.busy ? '' : ' disabled') + '>' + label + '</button>'; };
  var h = '<p class="tuiDim">只列船上有的、城鎮有庫存的貨（缺貨的不列）。買價含關稅 ' + Math.round(L.fee * 100) + '%、賣價扣關稅；越買越貴、越賣越便宜（照每一桶的庫存算）。</p>';
  if (!L.rows.length) h += '<p class="tuiDim">船上空的，城鎮市場也是空的</p>';
  else h += '<table class="tuiT tuiTr"><tr><th>貨</th><th>城鎮</th><th>船上</th><th>買一桶</th><th>賣一桶</th><th></th></tr>' + L.rows.map(function (r) {
    var b1 = r.canBuy >= 1, bAll = Math.floor(r.canBuy), s1 = r.ship >= 1 && r.canSell >= 1;
    return '<tr><td>' + tuiEsc(r.name) + '</td><td>' + tuiNum(r.town, 1) + '</td><td>' + (r.ship ? tuiNum(r.ship, r.ship % 1 ? 2 : 0) : '<span class="tuiDim">–</span>') + '</td><td>' + (r.buy == null ? '<span class="tuiDim">–</span>' : tuiNum(r.buy, 2)) + '</td><td>' + tuiNum(r.sell, 2) + '</td><td class="ops">' +
      btn('buy', r.g, 1, '買 1', b1) + btn('buy', r.g, 10, '買 10', r.canBuy >= 10) + btn('buy', r.g, bAll, '買到滿', bAll >= 1) + btn('sell', r.g, 1, '賣 1', s1) + btn('sell', r.g, r.ship, '全賣', r.ship > 0 && r.canSell > 0) + '</td></tr>';
  }).join('') + '</table>';
  var D = L.load;
  h += '<div class="tuiTiles"><div><small>👛 玩家金庫</small><b>' + tuiNum(L.funds, 2) + '</b></div><div><small>💰 城鎮金庫</small><b>' + tuiNum(L.townFunds) + '</b></div>' +
    (D ? '<div><small>⚖ 貨重／壓艙物</small><b>' + tuiNum(D.cargoKg / 1000, 1) + ' / ' + tuiNum(D.ballastKg / 1000, 0) + ' 噸</b></div><div><small>🌊 吃水</small><b>' + (D.overKg > 0 ? (D.draftM != null ? '深 ' + tuiNum(D.draftM, 2) + ' m' : '多 ' + tuiNum(D.overKg / 1000, 1) + ' 噸') : '照設計水線') + '</b></div>' : '<div><small>⚖ 貨艙</small><b>還沒裝過貨</b></div>') + '</div>';
  return h + '<p class="tuiDim">貨重在壓艙物以內 ⇒ 換掉同樣重的壓艙石、吃水不變；超過 ⇒ 吃水變深。</p>';
}
/** 每一格：離開城鎮模式（出航）⇒ 關掉。 */
function tuiFrame() { if (TUI.open && !modeRule('town')) tuiClose(); }
(function () {
  var a = $('tuiTK'), b = $('tuiK');
  if (a) a.onclick = function () { tuiToggle('trade'); };
  if (b) b.onclick = function () { tuiToggle(); };
})();
ctrlAdd({ name: 'townui', pri: 9, on: function () { return TUI.open; },
  key: function (k, down, e) {
    if (!modeRule('town')) return false;
    var lk = k.length === 1 ? k.toLowerCase() : k;
    if (lk !== 't' && lk !== 'i') return false;
    if (down && !e.repeat) tuiToggle(lk === 't' ? 'trade' : null);
    e.preventDefault(); return true;
  },
  frame: function () { tuiFrame(); }
});

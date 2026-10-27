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
// 🏙 城區（D）自己一頁（Tim 2026-10-27「把城區頁面拆成獨立頁面(目前概況頁的分頁包含城區)」）：不在子選單那一排，開著時也不畫那一排。
// 開著 ⇒ 跟外面那一頁說 { bsmap: 'page', open }（城鎮介面、⚙ 設定面板；tuiPageTell）⇒ 地球儀把浮在上面的時間面板收起來（Tim 2026-10-27「時間面板可以在開啟其他頁面時隱藏」）。
// ?tui=@host&town=<城>&tab=<頁>（Tim 2026-10-27「停靠時 下排是否可以多城鎮概況按鈕(開啟城鎮模式的概況頁面)」）：Blocksail 地球儀停靠時直接開這一份面板 ——
//   同 ?pick=@host（72_shippick.js）：不開主選單、不載船、不跑畫面迴圈（90_main.js），頁面透明、只畫 #tuiP（template.html html.tuionly）；
//   資料照樣用上面的協定跟那一頁要（沒有海域、沒有 BED ⇒ 直接收它的 'townUI'）；✕、Esc、點面板外面 ⇒ 關、跟那一頁說 { bsmap: 'tuiClose' }。
var TUI = { region: null, open: false, tab: 'sum', seq: 0, wait: {}, info: null, goods: {}, blds: {}, every: 7, list: null, msg: '', busy: false, pick: null, charts: {}, last: 'sum', unit: 1 };   // unit：貿易一次買賣幾桶（TUI_UNITS 那四檔）
var TUI_TABS = [{ k: 'sum', name: '📋 概況' }, { k: 'flow', name: '⚖ 產出與消耗' }, { k: 'stock', name: '📦 庫存與價格' }, { k: 'stats', name: '📈 統計報表' }, { k: 'trade', name: '💰 貿易' }];   // 🏙 城區不在這一排：自己一頁（D、#tuiDK；外面那一頁有送城區才有，tuiDists；Blocksail TASK-0817）
var TUI_C = ['#3987e5', '#d95926'];                                     // 圖的兩條線：藍、橘（dataviz 參考色盤第 1、2 格的深色版；深底 #12161d 上驗過：色盲 ΔE 26.8、對比 ≥ 3）
var TUI_JOB = { build: '營造（工地）', garrison: '士兵', forage: '野外採集' };   // 不是建築種類的崗位
var TUI_CAT = { food: '糧食', raw: '原料', cash: '經濟作物', goods: '製品', war: '軍需', metal: '貴金屬', curio: '奇物' };
var TUI_HOST = Q.get('tui') === '@host' ? (window.parent !== window ? window.parent : window.opener) : null;   // ?tui=@host（檔頭）
if (TUI_HOST) document.documentElement.classList.add('tuionly');
function tuiOk() { return TUI_HOST ? !!TWB.town : modeRule('town') && BED && BED.host && TWB.town; }
function tuiEsc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function tuiNum(x, d) { x = +x || 0; return x.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
/** 貨物、家常菜的圖示（Blocksail img/goods/<key>.png、img/dishes/<id>.png —— battle.html 跟 img/ 同一層；TASK-0914）：沒有圖 ⇒ 拿掉，只剩名字。
 *  px：邊長（預設 22 ＝ 表格那一欄；夾在一行字裡的清單用 16）。 */
function tuiIcon(dir, k, px) { px = px || 22; return '<img src="img/' + dir + '/' + encodeURIComponent(k) + '.png" alt="" style="width:' + px + 'px;height:' + px + 'px;object-fit:contain;vertical-align:middle;margin-right:' + (px < 22 ? 3 : 5) + 'px" onerror="this.remove()">'; }
/** 昨天吃了什麼（份的比例）：家裡的灶每一道菜（'eat:<貨>' ＝ 直接吃那一種）＋服務建築供的（餐館、酒館、教堂；Blocksail world/food.js foodDay 的 dish、served）。 */
function tuiEatHTML(F) {
  var D = F.dish || {}, S = F.servedDish || {}, sv = Math.max(0, F.served || 0), tot = sv, rows = [], known = 0;
  Object.keys(D).forEach(function (k) { if (D[k] > 0) { tot += D[k]; rows.push({ k: k, q: D[k] }); } });
  Object.keys(S).sort().forEach(function (k) { var q = Math.min(Math.max(0, S[k] || 0), sv - known); if (q > 0) { known += q; rows.push({ k: k, q: q, service: true }); } });
  if (sv > known) rows.push({ k: '', q: sv - known });   // 舊存檔沒有逐菜紀錄：保留總數，不能猜成聖餐。
  if (!(tot > 0)) return '';
  rows.sort(function (a, b) { return b.q - a.q || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0); });
  return '<table class="tuiT"><tr><th>餐點</th><th>份</th><th>比例</th></tr>' + rows.map(function (x) {
    var g = x.k.indexOf('eat:') === 0 ? x.k.slice(4) : null, H = !x.service && (TUI.homeMenu || []).filter(function (m) { return m.id === x.k; })[0], R = x.service && (TUI.serveDishes || {})[x.k],
      nm = x.service ? tuiIcon('dishes', R && R.icon || x.k) + tuiEsc(R && R.name || x.k) : !x.k ? '服務餐點（舊紀錄）' : H ? tuiIcon(H.dir || 'dishes', H.icon) + tuiEsc(H.name) : g ? tuiIcon('goods', g) + tuiEsc(tuiGood(g)) : tuiIcon('dishes', x.k) + tuiEsc(TUI.dishes[x.k] || x.k);
    return '<tr><td>' + nm + '</td><td>' + tuiNum(x.q / 1000) + '</td><td>' + (x.q * 100 / tot).toFixed(1) + '%</td></tr>';
  }).join('') + '</table>';
}
/** 實際食材另列：只用當天保存的廚房＋供餐扣料，不能用菜單倒推或混入日用。 */
function tuiIngredientsHTML(F) {
  if (!F.ingredients) return '<p class="tuiDim">舊紀錄未保存食材明細，過一天後更新。</p>';
  var all = {};
  [F.ingredients.home, F.ingredients.service].forEach(function (o) { Object.keys(o || {}).forEach(function (g) { all[g] = (all[g] || 0) + o[g]; }); });
  var ks = Object.keys(all).filter(function (g) { return all[g] > 0; }).sort(function (a, b) { return all[b] - all[a] || (a < b ? -1 : 1); });
  if (!ks.length) return '<p class="tuiDim">當天沒有消耗食材。</p>';
  return '<p class="tuiDim">廚房（含加餐、免費供應）與服務供餐合計；不含日用及單獨飲品。</p><table class="tuiT"><tr><th>食材</th><th>消耗（桶）</th></tr>' + ks.map(function (g) { return '<tr><td>' + tuiIcon('goods', g) + tuiEsc(tuiGood(g)) + '</td><td>' + tuiNum(all[g] / 1000, 3) + '</td></tr>'; }).join('') + '</table>';
}
/** 社會階層（Blocksail world/stores.js BSW.STRATA；TASK-1007）：每一層的人數、那一池的錢、一人平均、收入從哪來；底下摺著每一層昨天吃了什麼（同上面那張表）。
 *  Tim 2026-10-26「統計資訊可以加上 不同階層的食物消費(吃了甚麼菜單)」；外面那一頁沒送 strata（關掉、舊版）⇒ 不畫。 */
function tuiStrataHTML(I) {
  var L = I.strata; if (!L || !L.length) return '';
  var LV = ['荒年糧', '主糧', '家常', '佳餚'];
  var src = function (o, fam) {
    if (!o) return '工資';
    var t = (o.kind || []).map(function (k) { return k === 'prod' ? '城鎮的生產建築' : k === 'serve' ? '城鎮的服務建築' : k === 'store' ? '倉庫' : k; }).concat((o.type || []).map(function (k) { return TUI.blds[k] || k; }));
    // 社會階層當家族（Blocksail TASK-1007 STRATA fam）：自己經營、賣貨的收入，不是分紅
    if (fam) return '自己經營 ' + tuiNum(fam.n) + ' 座（' + t.join('、') + '）';
    return t.join('、') + '的分紅';
  };
  return '<h4>👥 社會階層</h4><table class="tuiT"><tr><th>階層</th><th>人</th><th>金庫</th><th>一人</th><th>收入</th></tr>' + L.map(function (s) {
    return '<tr><td>' + tuiEsc(s.name) + '</td><td>' + tuiNum(s.pop) + '</td><td>' + tuiNum(s.funds) + '</td><td>' + tuiNum(s.per, 1) + '</td><td>' + tuiEsc(src(s.owns, s.fam)) + '</td></tr>';
  }).join('') + '</table>' + L.map(function (s) {
    var F = s.fed; if (!F) return '';
    var eat = F.eat || {};
    return '<details><summary>🍽 ' + tuiEsc(s.name) + '昨天吃了什麼</summary><p>' + [3, 2, 1, 0].map(function (k) { return LV[k] + ' ' + tuiNum((eat[k] || 0) / 1000); }).join('　') + (F.relief ? '　（城鎮免費補了 ' + tuiNum(F.relief / 1000) + ' 份）' : '') + (F.famine ? '　⚠ 飢荒' : '') + '</p>' + tuiEatHTML(F) + '</details>';
  }).join('');
}
function tuiHomeMenuHTML() {
  var menus = TUI.homeMenu || [];
  if (!menus.length) return '';
  var LV = ['荒年糧', '主糧', '家常', '佳餚'];
  return '<details><summary>🍲 城鎮廚房菜單（' + menus.length + '道）</summary><p class="tuiDim">即做即食，無額外工人；以下為每100份標準用量，實際用料見消耗食材。類別可由成員替代，餐點依價格、物資與預算選用。</p>' + menus.map(function (m) {
    return '<p><b>' + tuiIcon(m.dir || 'dishes', m.icon) + tuiEsc(m.name) + '</b>　' + tuiEsc(LV[m.level] || '') + '<br><small>' + Object.keys(m.per100 || {}).map(function (g) { return tuiIcon('goods', g, 16) + tuiEsc(tuiGood(g)) + ' ' + tuiNum(m.per100[g], 3) + (g.charAt(0) === '@' ? ' 份類別' : ' 桶'); }).join('、') + '</small></p>';
  }).join('') + '</details>';
}
function tuiGood(g) { var X = TUI.goods[g]; if (X && X.name) return X.name; var R = TUI.list && TUI.list.rows.filter(function (r) { return r.g === g; })[0]; return R ? R.name : g; }
/** 跟外面那一頁要（cb(回覆)）；5 秒沒回 ⇒ cb({ ok: false, why }）。 */
function tuiAsk(cmd, extra, cb) {
  if (!tuiOk()) { if (cb) cb({ ok: false, why: ['城鎮介面要從 Blocksail 地球儀停靠進城'] }); return; }
  var s = ++TUI.seq; TUI.wait[s] = cb || null;
  (TUI_HOST || BED.host).postMessage(Object.assign({ bsmap: 'need', what: 'townUI', town: TWB.town, plan: TUI_HOST ? TWB.town : twbUnit(), cmd: cmd, seq: s }, extra || {}), '*');   // plan：現在建的那一份規劃（遠的城區「<城>~<區>」；工地、點建築照它，TASK-0987）
  setTimeout(function () { var f = TUI.wait[s]; if (f !== undefined) { delete TUI.wait[s]; if (f) f({ ok: false, why: ['地球儀那一頁沒有回（太舊的版本沒有城鎮介面）'] }); } }, 5000);
}
/** 外面那一頁的回覆（08_seabed.js）。 */
function tuiGot(d) { var cb = TUI.wait[d.seq]; delete TUI.wait[d.seq]; if (cb) cb(d); }
/** 玩家這艘船（開船隊貨艙、算吃水用）：船型還沒載好 ⇒ null。 */
function tuiShip() {
  var sh = SHIPS[PLAYER_I], T = sh && sh.T; if (!T) return null;
  return Object.assign({ kind: T.id }, tuiHold(T));
}
/** 船型的貨艙數字（噸）：ballastT ＝ 可換壓艙 ＝ 載重（貨在這以內只換掉壓艙石、吃水不變；32_hull.js cargoOf）、fixedT 固定壓艙、stdT／fullT 標準／滿載排水量、
 *  設計水線的水線面積 wpa（m²；量不到 ⇒ null）—— 選船（72_shippick.js 'picked'）也帶給地球儀，地球儀上的 💰 貿易照它算吃水。 */
function tuiHold(T) {
  var wpa = T.hyd && T.zw > 0 && T.hyd.length > T.zw ? T.hyd[T.zw - 1] / S : 0, c = T.cargoT || 0;
  return { ballastT: c, fixedT: Math.max(0, (T.ballast0 || 0) - c), stdT: T.dispStd || 0, fullT: T.dispFull || 0, wpa: wpa > 0 ? Math.round(wpa * 10) / 10 : null };
}
/** 開關：tab 給了 ⇒ 開那一頁（已經開著同一頁 ⇒ 關）；沒給 ⇒ 開上次那一頁（貿易以外的）。 */
function tuiToggle(tab) {
  if (!tuiOk()) { note(SHIPS[PLAYER_I], '城鎮介面要從 Blocksail 地球儀停靠進城'); return; }
  var t = tab || TUI.last;
  if (TUI.open && TUI.tab === t) { tuiClose(); return; }
  TUI.open = true; TUI.tab = t; if (t !== 'trade' && t !== 'dist') TUI.last = t;   // 貿易（T）、城區（D）各有自己的鍵 ⇒ I 開回城鎮資訊那幾頁
  $('stage').classList.add('tui'); $('stage').classList.toggle('tuiT', t === 'trade'); $('stage').classList.toggle('tuiD', t === 'dist');
  tuiLoad();
}
function tuiClose() { TUI.open = false; var st = $('stage'); if (st) { st.classList.remove('tui'); st.classList.remove('tuiT'); st.classList.remove('tuiD'); } if (TUI_HOST) TUI_HOST.postMessage({ bsmap: 'tuiClose' }, '*'); }
function tuiEscEaten() { if (!TUI.open) return false; tuiClose(); return true; }
/** 照現在那一頁問資料、畫（換頁、買賣之後都重問 ⇒ 永遠是城鎮帳現在的數字）。 */
function tuiLoad() {
  tuiUI();
  if (TUI.tab === 'trade') tuiAsk('trade', { ship: tuiShip() }, function (r) { if (r.ok) TUI.list = r.list; else TUI.msg = '開不了貿易：' + (r.why || []).join('；'); tuiUI(); });
  tuiInfo();
}
/** 問城鎮資訊（每一頁都要：上面那一列、貨名 tuiGood；買賣之後城鎮金庫跟著變 ⇒ 重問）。 */
function tuiInfo() {
  tuiAsk('info', null, function (r) { if (r.ok) { TUI.info = r.info; TUI.goods = r.goods || {}; TUI.blds = r.blds || {}; TUI.every = r.every || 7; TUI.region = r.region || null; TUI.faction = r.faction || null; TUI.fleets = r.fleets || []; TUI.hubs = r.hubs || []; TUI.dishes = r.dishes || {}; TUI.serveDishes = r.serveDishes || {}; TUI.homeMenu = r.homeMenu || []; } else TUI.msg = '問不到城鎮資訊：' + (r.why || []).join('；'); tuiUI(); });
}
/** 買賣（side 'buy'｜'sell'、q 桶）：一次只送一筆；回來照新的清單重畫、說成交了多少。 */
function tuiTrade(side, g, q) {
  if (TUI.busy || !(q > 0)) return;
  TUI.busy = true;
  tuiAsk(side, { g: g, q: q, ship: tuiShip() }, function (r) {
    TUI.busy = false;
    if (!r.ok && !r.res) { TUI.msg = (side === 'buy' ? '買不了：' : '賣不了：') + (r.why || []).join('；'); tuiUI(); return; }
    var R = r.res; if (r.list) TUI.list = r.list;
    TUI.msg = R.q > 0 ? (side === 'buy' ? '買了 ' + tuiNum(Math.floor(R.q)) + ' 桶' + tuiGood(g) + '，付 ' + tuiNum(R.pay, 2) + '（含關稅 ' + tuiNum(R.fee, 2) + '）' : '賣了 ' + tuiNum(Math.floor(R.q)) + ' 桶' + tuiGood(g) + '，拿到 ' + tuiNum(R.pay, 2) + '（扣關稅 ' + tuiNum(R.fee, 2) + '）') : (side === 'buy' ? '沒買到' : '沒賣掉');
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
function tuiTabs() { if (TUI.tab === 'dist') return '<h3 id="tuiPg">🏙 城區</h3>'; return '<div id="tuiTabs">' + TUI_TABS.map(function (t) { return '<button type="button" data-t="' + t.k + '"' + (t.k === TUI.tab ? ' class="on"' : '') + '>' + t.name + '</button>'; }).join('') + '</div>'; }
function tuiUI() {
  var P = $('tuiP'); if (!P) return;
  if (!TUI.open) { if (P.innerHTML) P.innerHTML = ''; return; }
  var body = TUI.tab === 'trade' ? tuiTradeHTML() : TUI.tab === 'dist' ? tuiDistHTML() : !TUI.info ? '<p class="tuiDim">問城鎮帳…</p>' : TUI.tab === 'sum' ? tuiSumHTML() : TUI.tab === 'flow' ? tuiFlowHTML() : TUI.tab === 'stock' ? tuiStockHTML() : tuiStatsHTML();
  var sc = P.querySelector('#tuiBody'), top = sc ? sc.scrollTop : 0;
  P.innerHTML = tuiHead() + tuiTabs() + '<div id="tuiBody">' + body + '</div>' + (TUI.msg ? '<div id="tuiMsg">' + tuiEsc(TUI.msg) + '</div>' : '');
  if (sc) P.querySelector('#tuiBody').scrollTop = top;                 // 買賣之後重畫：捲到哪留在哪
  $('tuiX').onclick = tuiClose;
  P.querySelectorAll('#tuiTabs button').forEach(function (b) { b.onclick = function () { if (b.dataset.t !== TUI.tab) { TUI.msg = ''; tuiToggle(b.dataset.t); } }; });
  P.querySelectorAll('button[data-side]').forEach(function (b) { b.onclick = function () { tuiTrade(b.dataset.side, b.dataset.g, +b.dataset.q); }; });
  P.querySelectorAll('button[data-u]').forEach(function (b) { b.onclick = function () { TUI.unit = +b.dataset.u; tuiUI(); }; });
  P.querySelectorAll('button[data-dist]').forEach(function (b) { b.onclick = function () { if (townDistGo(TWB.town, b.dataset.dist)) tuiUI(); }; });
  var sel = $('tuiPick'); if (sel) sel.onchange = function () { TUI.pick = sel.value; tuiUI(); };
  P.querySelectorAll('svg.tuiCh').forEach(tuiHover);
}
/** 概況：人口、勞動、崗位、失業與碼頭、吃飯、建築、家族。 */
function tuiSumHTML() {
  var I = TUI.info, E = I.emi || {}, J = I.jobs || {}, jt = 0, h = '';
  Object.keys(J).forEach(function (k) { jt += J[k]; });
  h += '<div class="tuiTiles">' + [['👥 人口', tuiNum(I.pop.total)], ['💪 勞動人口', tuiNum(I.pop.labor)], ['🔧 有工作', tuiNum(jt)], ['🪑 失業', tuiNum(E.idle || 0)], ['📢 缺工', tuiNum(E.short || 0)], ['⚓ 碼頭上等船', tuiNum(E.dock || 0)],
    ['💰 城鎮金庫', tuiNum(I.funds)], ['👛 鎮民金庫', tuiNum(I.folkFunds)], ['🛡 士兵', tuiNum(I.guard.now) + ' / ' + tuiNum(I.guard.cap)]]
    .concat(I.rent ? [['🏠 房租（昨天）', tuiNum(I.rent.paid, 1) + (I.rent.due > I.rent.paid ? ' / ' + tuiNum(I.rent.due, 1) : '')]] : []).map(function (x) { return '<div><small>' + x[0] + '</small><b>' + x[1] + '</b></div>'; }).join('') + '</div>';
  var F = I.fed;
  if (F) { var eat = F.eat || {}, LV = ['荒年糧', '主糧', '家常', '佳餚']; h += '<h4>🍞 食用餐點（份）</h4><p>' + [3, 2, 1, 0].map(function (k) { return LV[k] + ' ' + tuiNum((eat[k] || 0) / 1000); }).join('　') + (F.relief ? '　（城鎮免費補了 ' + tuiNum(F.relief / 1000) + ' 份）' : '') + (F.famine ? '　⚠ 飢荒' : '') + '</p>' + (F.extra && Object.keys(F.extra).length ? '<p class="tuiDim">餐點份數與比例包含加餐。</p>' : '') + tuiEatHTML(F) + '<h4>🥕 消耗食材（桶）</h4>' + tuiIngredientsHTML(F); }   // 等級照 Blocksail world/food.js FOOD_LEVELS；底下每一道吃了幾成（Tim 2026-10-25「城鎮是否可以顯示鎮民的消耗食物百分比」）
  h += tuiHomeMenuHTML();
  h += tuiStrataHTML(I);
  if (I.rent && I.rent.skip) h += '<p class="tuiDim">🏠 昨天房租沒收滿：' + tuiEsc(I.rent.skip) + '（該收 ' + tuiNum(I.rent.due, 1) + '）</p>';   // 房租（Blocksail world/townstate.js rentDay；TASK-0946）：鎮民的錢不夠吃飯 ⇒ 不收
  var SV = I.svc || {}, SVI = { faith: '⛪', drink: '🍺', dine: '🍲', health: '⚕' };   // 服務建築的滿意度（Blocksail world/food.js serveDay；TASK-0914、0946 酒館與醫院）：昨天想來／來了幾人次、滿意度、收的錢
  Object.keys(SV).forEach(function (k) { var Q = SV[k]; h += '<h4>' + (SVI[k] || '🙂') + ' ' + tuiEsc(Q.name || k) + '（昨天）</h4><p>來了 ' + tuiNum(Q.got) + '／想來 ' + tuiNum(Q.want) + ' 人次　滿意度 ' + Math.round((Q.sat || 0) * 100) + '%　' + (k === 'faith' ? '捐獻' : '收入') + ' ' + tuiNum(Q.paid, 2) + '</p>'; });
  var ks = Object.keys(J).sort(function (a, b) { return J[b] - J[a]; });
  h += '<h4>🔧 崗位（今天分到幾人）</h4>' + (ks.length ? '<table class="tuiT"><tr><th>工作</th><th>人</th></tr>' + ks.map(function (k) { return '<tr><td>' + tuiEsc(TUI_JOB[k] || TUI.blds[k] || k) + '</td><td>' + tuiNum(J[k]) + '</td></tr>'; }).join('') + '</table>' : '<p class="tuiDim">還沒有人上工（帳還沒過一天）</p>');
  var B = {}; (I.buildings || []).forEach(function (b) { B[b.type] = (B[b.type] || 0) + 1; });
  var bk = Object.keys(B).sort(function (a, b) { return B[b] - B[a]; });
  h += '<h4>🏗 建築（生產、公職、服務；' + tuiNum((I.buildings || []).length) + ' 棟）</h4><p>' + bk.map(function (k) { return tuiEsc(TUI.blds[k] || k) + ' × ' + B[k]; }).join('、') + '</p>';
  h += tuiRcpHTML(I);
  var RG = TUI.region;                                                  // 這座城那一區的加總（Blocksail regionInfo：區域 ＝ 那一區的城鎮加總）
  if (RG) h += '<h4>🗺 這一區（' + RG.towns.length + ' 座：' + RG.towns.map(tuiEsc).join('、') + '）</h4><p>人口 ' + tuiNum(RG.pop) + '　勞動 ' + tuiNum(RG.labor) + '　失業 ' + tuiNum(RG.idle) + '　碼頭上 ' + tuiNum(RG.dock) + '　城鎮金庫 ' + tuiNum(RG.funds) + '　生產建築 ' + tuiNum(RG.buildings) + '</p>';
  if (TUI.hubs && TUI.hubs.length) h += '<p class="tuiDim">⚓ 這一區的集散地：' + TUI.hubs.map(tuiEsc).join('、') + '</p>';
  var FL = TUI.fleets || [];                                             // 船隊（Blocksail world/fleet.js；TASK-0911）：停在這裡、開過來、母港在這裡的
  if (FL.length) h += '<h4>⛵ 船隊（' + FL.length + ' 支）</h4><table class="tuiT"><tr><th>主人</th><th>在哪</th><th>載</th><th>趟</th><th>淨賺</th></tr>' + FL.map(function (f) {
    var where = f.at ? (f.at === TWB.town ? '停在這裡' : '停在 ' + (f.atName || f.at)) : (f.fromName || f.from) + ' ⇒ ' + (f.toName || f.to) + '（還 ' + f.left + ' 天）';
    var gs = Object.keys(f.goods).map(function (g) { return tuiIcon('goods', g, 16) + tuiEsc(tuiGood(g)) + ' ' + tuiNum(f.goods[g], 0); }).join('、') || '空船';
    return '<tr><td>' + tuiEsc(f.ownerName || '') + (f.home !== TWB.town ? '<span class="tuiDim">（母港 ' + tuiEsc(f.homeName || f.home) + '）</span>' : '') + '</td><td>' + tuiEsc(where) + '</td><td>' + gs + '</td><td>' + f.trips + '</td><td>' + tuiNum(f.earned, 0) + '</td></tr>';
  }).join('') + '</table>';
  if (I.families && I.families.length) h += '<h4>👪 家族</h4><p>' + I.families.map(function (f) { return tuiEsc(f.name || f.id || f); }).join('、') + '</p>';
  return h;
}
/** 生產配方（Blocksail world/auto.js recipeDay；TASK-0947）：每一種現在跑哪幾條、最近換的（哪天、從哪條、為什麼、停工到哪天）；全部那幾座（含鎖住的原因）摺在底下。 */
function tuiRcpHTML(I) {
  var L = (I.buildings || []).filter(function (b) { return b.rname; }); if (!L.length) return '';
  var fn = {}; (I.families || []).forEach(function (f) { if (f && f.id) fn[f.id] = f.name || f.id; });
  var C = {}; L.forEach(function (b) { var c = C[b.type] || (C[b.type] = {}); c[b.rname] = (c[b.rname] || 0) + 1; });
  var h = '<h4>🔁 生產配方（城鎮、家族各自照缺貨與原料定期重排）</h4><p>' + Object.keys(C).sort().map(function (k) { return tuiEsc(TUI.blds[k] || k) + '：' + Object.keys(C[k]).map(function (r) { return tuiEsc(r) + ' ' + C[k][r]; }).join('、'); }).join('<br>') + '</p>';
  var row = function (b) {
    var off = b.swUntil != null && b.swUntil > I.day ? '<span class="tuiDim">（換配方停工到第 ' + b.swUntil + ' 天）</span>' : '';   // 停工的那幾天：I.day 之後到 swUntil（含）
    return '<tr><td>' + tuiEsc(TUI.blds[b.type] || b.type) + ' <span class="tuiDim">' + tuiEsc(b.id.slice(b.id.indexOf('/') + 1)) + '</span></td><td>' + tuiEsc(b.owner ? fn[b.owner] || b.owner : '城鎮') + '</td><td>' + tuiEsc(b.rname) + off + '</td><td>'
      + (b.sw ? '第 ' + b.sw.day + ' 天' : b.lock ? '🔒' : '–') + '</td><td>' + tuiEsc(b.sw ? b.sw.why : b.lock || '') + '</td></tr>';
  };
  var head = '<table class="tuiT"><tr><th>建築</th><th>主人</th><th>現在</th><th>上次換</th><th>為什麼／鎖住</th></tr>';
  var S = L.filter(function (b) { return b.sw; }).sort(function (a, b) { return b.sw.day - a.sw.day || (a.id < b.id ? -1 : 1); }), lk = L.filter(function (b) { return b.lock; }).length;
  if (S.length) h += '<p class="tuiDim">最近換的（共 ' + S.length + ' 座換過）</p>' + head + S.slice(0, 8).map(row).join('') + '</table>';
  return h + '<details><summary>全部 ' + L.length + ' 座' + (lk ? '（🔒 鎖住不換 ' + lk + ' 座）' : '') + '</summary>' + head + L.map(row).join('') + '</table></details>';
}
/** 產出與消耗：最近那一天每種貨 產出、原料、鎮民吃、淨（桶）；照淨值的大小排。 */
function tuiFlowHTML() {
  var F = TUI.info.flow;
  if (!F) return '<p class="tuiDim">帳還沒過一天（開船讓時間走，城鎮帳每天記一次）</p>';
  var K = ['made', 'used', 'eat', 'exp', 'imp'], keys = {}; K.forEach(function (k) { Object.keys(F[k] || {}).forEach(function (g) { keys[g] = 1; }); });   // exp／imp：船隊在這裡買走、運來賣掉的（Blocksail world/fleet.js）
  var v = function (k, g) { return ((F[k] || {})[g] || 0) / 1000; }, ship = !!(F.exp || F.imp);
  var R = Object.keys(keys).map(function (g) { var r = { g: g, m: v('made', g), u: v('used', g), e: v('eat', g), x: v('exp', g), i: v('imp', g) }; r.n = r.m - r.u - r.e - r.x + r.i; return r; });
  R.sort(function (a, b) { return Math.abs(b.n) - Math.abs(a.n) || (a.g < b.g ? -1 : 1); });
  var d = function (x) { return x ? tuiNum(x, 2) : '<span class="tuiDim">–</span>'; };
  return '<p class="tuiDim">昨天（第 ' + TUI.info.day + ' 天）；桶。原料 ＝ 生產建築與工地吃的；鎮民吃 ＝ 鎮民買的＋城鎮補的' + (ship ? '；船隊運出 ＝ 船隊在這裡買走的、運來 ＝ 運到這裡賣掉的' : '') + '。</p>' +
    (R.length ? '<table class="tuiT"><tr><th>貨</th><th>產出</th><th>原料</th><th>鎮民吃</th>' + (ship ? '<th>船隊運出</th><th>運來</th>' : '') + '<th>淨</th></tr>' + R.map(function (r) {
      return '<tr><td>' + tuiIcon('goods', r.g) + tuiEsc(tuiGood(r.g)) + '</td><td>' + d(r.m) + '</td><td>' + d(r.u) + '</td><td>' + d(r.e) + '</td>' + (ship ? '<td>' + d(r.x) + '</td><td>' + d(r.i) + '</td>' : '') + '<td class="' + (r.n > 0 ? 'up' : r.n < 0 ? 'dn' : '') + '">' + (r.n > 0 ? '＋' : r.n < 0 ? '−' : '') + tuiNum(Math.abs(r.n), 2) + '</td></tr>';
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
    h += '<tr><td>' + tuiIcon('goods', g) + tuiEsc(tuiGood(g)) + '</td><td>' + tuiNum(q.stock, 1) + '</td><td>' + tuiNum(q.target, 0) + '</td><td>' + tuiNum(q.daily, 2) + '</td><td class="' + (r > 1.15 ? 'dn' : r < 0.87 ? 'up' : '') + '">' + tuiNum(q.price, 2) + (q.bonus > 1.01 ? ' ⚠' : '') + '</td><td class="tuiDim">' + (X.price != null ? tuiNum(X.price, 2) : '–') + '</td></tr>';
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
  h += '<h4>📦 一種貨（每 ' + TUI.every + ' 天一筆）' + tuiIcon('goods', g) + '<select id="tuiPick">' + L.map(function (x) { return '<option value="' + x + '"' + (x === g ? ' selected' : '') + '>' + tuiEsc(tuiGood(x)) + '</option>'; }).join('') + '</select></h4>';
  var ic = tuiIcon('goods', g, 16);
  h += tuiChart('gs', tuiGood(g) + '：庫存', wx, [{ name: '庫存', v: col(0) }], 1, '桶', ic) +
    tuiChart('gp', tuiGood(g) + '：價格（一桶）', wx, [{ name: '價格', v: col(1) }], 2, '', ic) +
    tuiChart('gf', tuiGood(g) + '：每天平均（那 ' + TUI.every + ' 天）', wx, [{ name: '產出', v: col(2, 1 / TUI.every) }, { name: '用掉（原料＋鎮民吃）', v: eatUse }], 2, '桶', ic);
  return h;
}
/** 一張折線圖（SVG）：一個 y 軸、兩條以內（兩條 ⇒ 圖例）；滑過去有十字線與那一天的數字（tuiHover）。資料記在 TUI.charts[id]。ic：標題前面的圖示（貨的那幾張；HTML）。 */
function tuiChart(id, title, xs, ser, dec, unit, ic) {
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
  return '<div class="tuiChW"><h5><span>' + (ic || '') + tuiEsc(title) + (unit ? '（' + unit + '）' : '') + '</span>' + leg + '</h5><svg class="tuiCh" data-id="' + id + '" viewBox="0 0 ' + W + ' ' + H + '" >' + g + '</svg><div class="tip" hidden></div></div>';
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
/** 貿易一次買賣幾桶（Tim 2026-10-26「參考海商王 上方的1 10 100 可以多一檔位1000」）：全部的貨共用一檔。 */
var TUI_UNITS = [1, 10, 100, 1000];
/** 按一下買／賣送幾桶（u ＝ 那一檔）：買 ⇒ 不超過現在買得到的（canBuy 取整）；賣 ⇒ 不超過船上有的、城鎮收得起的，賣到剩不到一桶 ⇒ 零頭一起賣掉。0 ⇒ 按鈕不能按。 */
function tuiTradeQ(side, r, u) {
  if (side === 'buy') { var b = Math.min(u, Math.floor(r.canBuy)); return r.buy != null && b >= 1 ? b : 0; }
  var s = Math.min(u, r.ship, r.canSell); if (s < r.ship) s = Math.floor(s);
  return s > 0 ? s : 0;
}
/** 城鎮庫存那一格的字色（Tim 2026-10-26「商品庫存字根據對應基礎價格變色(越高越紅 越低越綠 剛好時為白色」）：現在的曲線價 price ÷ 基準價 base ——
 *  剛好 ⇒ 白；貴 ⇒ 往紅、便宜 ⇒ 往綠，兩倍／一半就是全紅／全綠（照對數，貴兩倍跟便宜一半一樣深）；沒有基準價 ⇒ 不上色。 */
function tuiTradeTint(r) {
  if (!(r.base > 0) || !(r.price > 0)) return '';
  var t = Math.max(-1, Math.min(1, Math.log(r.price / r.base) / Math.LN2)), c = t > 0 ? [255, 90, 74] : [90, 209, 106], a = Math.abs(t);
  return ' style="color:rgb(' + c.map(function (x) { return Math.round(255 + (x - 255) * a); }).join(',') + ')"';
}
/** 貿易：只列船上有 ∪ 城鎮有庫存的貨；上面一排買賣單位；每一列 城鎮 ｜ 賣（按鈕上是賣一桶拿到多少）｜ 貨物圖示 ｜ 買（買一桶付多少）｜ 船上（海商王那樣，Tim 2026-10-26；
 *  按鈕挨著貨要去的那一邊：買 ⇒ 進右邊的船上、賣 ⇒ 進左邊的城鎮）；圖示游標移上去說名字（td.g 的 data-n）；城鎮庫存照價錢上色（tuiTradeTint）；底下玩家金庫、載重。 */
function tuiTradeHTML() {
  var L = TUI.list; if (!L) return '<p class="tuiDim">問市場…</p>';
  var u = TUI.unit;
  var btn = function (side, r, price) {
    var q = tuiTradeQ(side, r, u), ok = q > 0 && !TUI.busy;
    return '<button type="button" data-side="' + side + '" data-g="' + r.g + '" data-q="' + q + '"' + (ok ? '' : ' disabled') + ' title="' + (side === 'buy' ? '買' : '賣') + ' ' + (q > 0 ? tuiNum(q, q % 1 ? 2 : 0) : u) + ' 桶' + tuiEsc(r.name) + (price == null ? '' : '（現在一桶 ' + tuiNum(price, 2) + '）') + '">' + (price == null ? '–' : tuiNum(price, 2)) + '</button>';
  };
  var h = '<p class="tuiDim">只列船上有的、城鎮有庫存的貨（缺貨的不列）。按鈕上是一桶的價錢：買價含關稅 ' + Math.round(L.fee * 100) + '%、賣價扣關稅；越買越貴、越賣越便宜（照每一桶的庫存算）。</p>';
  h += '<div class="tuiU">一次買賣' + TUI_UNITS.map(function (n) { return '<button type="button" data-u="' + n + '"' + (n === u ? ' class="on"' : '') + '>' + tuiNum(n) + '</button>'; }).join('') + '桶</div>';
  if (!L.rows.length) h += '<p class="tuiDim">船上空的，城鎮市場也是空的</p>';
  else h += '<table class="tuiT tuiTr"><tr><th>🏘 城鎮</th><th>賣</th><th>貨</th><th>買</th><th>⛵ 船上</th></tr>' + L.rows.map(function (r) {
    return '<tr><td' + tuiTradeTint(r) + '>' + tuiNum(Math.floor(r.town)) + '</td><td class="b">' + btn('sell', r, r.sell) + '</td>' +
      '<td class="g" data-n="' + tuiEsc(r.name) + '"><img src="img/goods/' + encodeURIComponent(r.g) + '.png" alt="' + tuiEsc(r.name) + '" onerror="this.replaceWith(this.alt)"></td>' +   // 只畫圖示；沒有圖 ⇒ 換成名字
      '<td class="b">' + btn('buy', r, r.buy) + '</td><td>' + (r.ship >= 1 ? tuiNum(Math.floor(r.ship)) : '<span class="tuiDim">–</span>') + '</td></tr>';
  }).join('') + '</table>';
  var D = L.load, Hd = tuiShip();
  h += '<div class="tuiTiles"><div><small>👛 玩家金庫</small><b>' + tuiNum(L.funds, 2) + '</b></div><div><small>💰 城鎮金庫</small><b>' + tuiNum(L.townFunds) + '</b></div>' +
    (D ? '<div><small>⚖ 貨重／載重</small><b>' + tuiNum(D.cargoKg / 1000, 1) + ' / ' + tuiNum(D.ballastKg / 1000, 0) + ' 噸</b></div><div><small>🌊 吃水</small><b>' + (D.overKg > 0 ? (D.draftM != null ? '深 ' + tuiNum(D.draftM, 2) + ' m' : '多 ' + tuiNum(D.overKg / 1000, 1) + ' 噸') : '照設計水線') + '</b></div>' : '<div><small>⚖ 貨艙</small><b>還沒裝過貨</b></div>') +
    (Hd && Hd.fullT ? '<div><small>🚢 排水量 標準／滿載</small><b>' + tuiNum(Hd.stdT) + ' / ' + tuiNum(Hd.fullT) + ' 噸</b></div>' : '') + '</div>';
  return h + '<p class="tuiDim">貨重在載重以內 ⇒ 換掉同樣重的壓艙石、吃水不變；超過 ⇒ 吃水變深。標準排水量 ＝ 沒有貨（壓艙石也卸掉）；滿載 ＝ 載重裝滿、在設計水線。</p>';
}
// ───────── 城區（Blocksail TASK-0817；63_towns.js townDistView、townDistGo）─────────
//   Tim 2026-10-26：「然後城鎮模式可以有選單切換城區」「會跳到選中的城區 並以該城區為中心加載地圖」
/** 這座城的城區（外面那一頁送的規劃帶的 districts；1～N 區）⇒ 清單｜null（太舊的地球儀沒送） */
function tuiDists() { var p = TOWNS.full[TWB.town]; return p && p.districts && p.districts.length ? p.districts : null; }
function tuiDistHTML() {
  var D = tuiDists(); if (!D) return '<p class="tuiDim">這座城沒有分城區。</p>';
  var cur = TOWNS.dist[TWB.town], S = (TOWNS.stat.dist || {})[TWB.town], on = TOWNS.onD[TWB.town] || 0;
  TUI.distSig = tuiDistSig();
  return '<p>選一區 ⇒ 鏡頭跳過去、先建那一區，建好再補隔壁的區（遠的收掉）；鏡頭拖進別區停一下也會換過去。</p>' +
    '<div class="tuiTiles">' + D.map(function (d) {
      var i = D.indexOf(d);
      return '<div' + (d.id === cur ? ' class="cur"' : '') + '><small>' + (d.id === cur ? '📍 現在這一區' : on & (1 << i) ? '✓ 已載入' : '　') + (d.port ? '　⚓ 有碼頭' : '') + '</small><button type="button" data-dist="' + tuiEsc(d.id) + '"' + (d.id === cur ? ' class="on"' : '') + '>' + tuiEsc(d.name) + '</button></div>';
    }).join('') + '</div>' + (S ? '<p class="tuiDim">建了 ' + S.on.length + ' 區：地塊 ' + S.lots + '、路 ' + S.roads + '。</p>' : '');
}
/** 城區頁畫的是哪一份：焦點那一區＋建了哪幾區（換了 ⇒ 重畫；鏡頭拖進別區換焦點不經過按鈕 ⇒ 以前頁上的「現在這一區」停在舊的）。 */
function tuiDistSig() { return (TOWNS.dist[TWB.town] || '') + ':' + (TOWNS.onD[TWB.town] || 0); }
/** 每一格：城區那一顆鈕在城鎮模式、外面那一頁有送城區（1～N 區）才出現；城區頁開著、焦點或建了哪幾區換了 ⇒ 重畫。 */
function tuiDistKey() {
  var k = $('tuiDK'); if (!k) return; var v = modeRule('town') && tuiDists() ? '' : 'none'; if (k.style.display !== v) k.style.display = v;   // .kb 有自己的 display ⇒ 不用 hidden
  if (TUI.open && TUI.tab === 'dist' && TUI.distSig !== tuiDistSig()) tuiUI();
}
/** 每一格：離開城鎮模式（出航）⇒ 關掉。 */
function tuiFrame() { if (TUI.open && !modeRule('town')) tuiClose(); }
/** 每一格：城鎮介面、⚙ 設定面板開著沒 ⇒ 換了才跟外面那一頁說（地球儀照它收時間面板；檔頭）。 */
function tuiPageTell() {
  var o = !!(TUI.open || (typeof GSET !== 'undefined' && GSET.open));
  if (o === TUI.pageSent || !BED || !BED.host) return;
  TUI.pageSent = o; BED.host.postMessage({ bsmap: 'page', open: o }, '*');
}
/** ?tui=@host 開機（90_main.js；檔頭）：收那一頁的回覆、開 tab 那一頁；Esc、點面板外面 ⇒ 關。 */
function tuiBoot() {
  window.addEventListener('message', function (e) { var d = e.data; if (e.source === TUI_HOST && d && d.bsmap === 'townUI') tuiGot(d); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && TUI.open) { e.preventDefault(); tuiClose(); } });
  document.addEventListener('pointerdown', function (e) { var P = $('tuiP'); if (TUI.open && P && !P.contains(e.target)) tuiClose(); });
  var t = Q.get('tab'); tuiToggle(TUI_TABS.some(function (x) { return x.k === t; }) ? t : 'sum');
}
(function () {
  var a = $('tuiTK'), b = $('tuiK'), c = $('tuiDK');
  if (a) a.onclick = function () { tuiToggle('trade'); };
  if (b) b.onclick = function () { tuiToggle(); };
  if (c) c.onclick = function () { tuiToggle('dist'); };
})();
ctrlAdd({ name: 'townui', pri: 9, on: function () { return TUI.open; },
  key: function (k, down, e) {
    if (!modeRule('town')) return false;
    var lk = k.length === 1 ? k.toLowerCase() : k;
    if (lk !== 't' && lk !== 'i' && !(lk === 'd' && tuiDists())) return false;   // D：城區頁（Tim 2026-10-26「可以加上快捷鍵」；城鎮模式的 D 右舵本來就不作用）
    if (down && !e.repeat) tuiToggle(lk === 't' ? 'trade' : lk === 'd' ? 'dist' : null);
    e.preventDefault(); return true;
  },
  frame: function () { tuiFrame(); townDistFrame(); tuiDistKey(); tuiPageTell(); }
});

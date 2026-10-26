// ───────────────────────── 點建築的資訊面板（Blocksail TASK-0909、0912） ─────────────────────────
// 區塊職責：城鎮模式、建築模式沒開時點一棟建築 ⇒ 左邊一塊面板 #tbiP：名稱、用途、主人、住幾人／容量、工人／崗位、每天產出／消耗、施工進度（貨物那幾行前面帶圖示 tuiIcon），
//   加一顆「▶ 演出建造過程」（63_townrise.js townRiseStart：從 0 演到完工、演完自己換回帳上的樣子）。選著的那一棟畫黃框（87_townbuild.js twbLines 照 tbiSelQ）。
//   Tim 2026-10-25：「城鎮中直接點選房子會跳出房屋資訊(額外的房屋資訊面板) 資訊包含住宅人口/容量 工人/崗位 產出/消耗等 然後有個額外按鈕可以演出該房屋建造過程」
// 協定（同 89_townui.js tuiAsk：Blocksail globe.html townUI）：{ cmd: 'bld', lot } ⇒ { ok, bld: { kind, typeName, owner, level, live: { n, cap }, jobs: { w, need },
//   made: { 貨: 桶／天 }, used: { 貨: 桶／天 }, full: { made, used }（理論：滿產、開工率 100%）, site: { p（‰）, crew, by, mat: { 貨: [剩下, 總共]（1／1000 桶）} }, note }, goods: { 貨: 名字 } }（Blocksail world/townstate.js townBld）。
// 物理意義：⛔ 這一支不算經濟 —— 數字全照那一頁的城鎮帳；這裡只問、只畫。
// 失敗處置：沒有 host（直接開 Blockside）⇒ 只有名稱、模型與演出鈕；那一頁沒回 ⇒ 照原樣說一聲。
var TBI = { open: false, hit: null, b: null, goods: {}, msg: '', seq: 0 };
function tbiSelQ() { return TBI.open && TBI.hit ? TBI.hit.q : null; }
function tbiClose() { TBI.open = false; TBI.hit = null; TBI.b = null; var st = $('stage'); if (st) st.classList.remove('tbi'); }
function tbiEscEaten() { if (!TBI.open) return false; tbiClose(); return true; }
/** 點一下（建築模式沒開、不在第一人稱）：點到建築 ⇒ 開面板（同一棟 ⇒ 關）；點到空地而面板開著 ⇒ 關。 */
function tbiTap(x, y, btn) {
  if (!modeRule('town') || TWB.on || FP.on || btn !== 0) return false;
  var h = townHitAt(x, y);
  if (!h || !h.lot) { if (TBI.open) { tbiClose(); return true; } return false; }
  if (TBI.open && TBI.hit && TBI.hit.q === h.q) { tbiClose(); return true; }
  TBI.open = true; TBI.hit = h; TBI.b = null; TBI.msg = ''; $('stage').classList.add('tbi');
  tbiLoad();
  return true;
}
/** 問那一頁這一棟的帳（每次開、演完、工地進度變了都重問）。 */
function tbiLoad() {
  var h = TBI.hit; tbiUI(); if (!h || !tuiOk()) return;
  var s = ++TBI.seq;
  tuiAsk('bld', { lot: h.lot.id }, function (r) {
    if (s !== TBI.seq || TBI.hit !== h) return;                          // 等的時候換了一棟
    if (r.ok) { TBI.b = r.bld || null; TBI.goods = r.goods || {}; TBI.msg = ''; } else TBI.msg = '問不到這一棟的帳：' + (r.why || []).join('；');
    tbiUI();
  });
}
function tbiGood(g) { return TBI.goods[g] || tuiGood(g); }
/** 一欄貨（產出或消耗）：o ＝ 實際；f ＝ 理論（滿產、開工率 100%；那一頁有給才有）⇒ 每一項寫成 實際／理論（停工時實際是 0），照理論排。 */
function tbiRows(o, f) {
  o = o || {};
  var by = f || o, ks = Object.keys(by).concat(Object.keys(o).filter(function (g) { return !(g in by); })).filter(function (g) { return o[g] > 0 || (f && f[g] > 0); });
  ks.sort(function (a, b) { return ((by[b] || 0) - (by[a] || 0)) || ((o[b] || 0) - (o[a] || 0)); });
  return ks.length ? ks.map(function (g) { return '<div class="tbiR"><span>' + tuiIcon('goods', g) + tuiEsc(tbiGood(g)) + '</span><b>' + tuiNum(o[g] || 0, 1) + (f ? '／' + tuiNum(f[g] || 0, 1) : '') + '</b></div>'; }).join('') : '<div class="tbiDim">—</div>';
}
function tbiUI() {
  var P = $('tbiP'); if (!P) return;
  if (!TBI.open || !TBI.hit) { P.innerHTML = ''; return; }
  var h = TBI.hit, b = TBI.b, site = RISE.S[townRiseKey(h.T, h.lot.id)], demo = RISE.demo && RISE.demo === site && site.play, html = [];
  html.push('<div class="tbiH"><b>' + tuiEsc(h.name) + '</b><button id="tbiX" title="關閉（Esc）">✕</button></div>');
  html.push('<div class="tbiDim">' + tuiEsc((b && b.typeName) || h.use || '') + (b && b.level > 1 ? '　第 ' + b.level + ' 級' : '') + (b && b.owner ? '　主人：' + tuiEsc(b.owner) : '') + '</div>');
  if (b && b.site) html.push('<div class="tbiS">🏗 施工中 <b>' + Math.floor(b.site.p / 10) + '%</b>' + (b.site.crew ? '　工地 ' + tuiNum(b.site.crew) + ' 人' : '') + (b.site.by ? '　' + tuiEsc(b.site.by) : '') + '<div class="tbiBar"><i style="width:' + (b.site.p / 10).toFixed(1) + '%"></i></div></div>');
  var mk = b && b.site && b.site.mat ? Object.keys(b.site.mat).sort() : [];
  if (mk.length) html.push('<div class="tbiT">路邊的建材（剩下／總共，桶）</div>' + mk.map(function (g) { var m = b.site.mat[g]; return '<div class="tbiR"><span>' + tuiIcon('goods', g) + tuiEsc(tbiGood(g)) + '</span><b>' + tuiNum(m[0] / 1000, 1) + '／' + tuiNum(m[1] / 1000, 1) + '</b></div>'; }).join(''));
  if (b && b.live) html.push('<div class="tbiR"><span>🏠 住的人／容量</span><b>' + tuiNum(b.live.n) + '／' + tuiNum(b.live.cap) + '</b></div>');
  if (b && b.jobs) html.push('<div class="tbiR"><span>👷 工人／崗位</span><b>' + tuiNum(b.jobs.w) + '／' + tuiNum(b.jobs.need) + '</b></div>');
  if (b && (b.made || b.used)) {
    html.push('<div class="tbiT">每天產出' + (b.full ? '（實際／理論）' : '') + '</div>' + tbiRows(b.made, b.full && b.full.made));
    html.push('<div class="tbiT">每天消耗' + (b.full ? '（實際／理論）' : '') + '</div>' + tbiRows(b.used, b.full && b.full.used));
  }
  if (b && b.note) html.push('<div class="tbiDim">' + tuiEsc(b.note) + '</div>');
  if (!tuiOk()) html.push('<div class="tbiDim">沒有城鎮帳（要從 Blocksail 地球儀停靠進城才看得到住戶、工人、產出）</div>');
  if (TBI.msg) html.push('<div class="tbiDim">' + tuiEsc(TBI.msg) + '</div>');
  var Mm = TOWNS.kit && TOWNS.kit.M[h.q.k], can = !!(Mm && Mm.rise);
  html.push('<div class="tbiB"><button id="tbiPlay"' + (can ? '' : ' disabled title="這個模型沒有施工順序"') + '>' + (demo ? '■ 停止演出' : '▶ 演出建造過程') + '</button></div>');
  P.innerHTML = html.join('');
  $('tbiX').onclick = tbiClose;
  $('tbiPlay').onclick = function () {
    if (RISE.demo && RISE.demo.T === h.T && RISE.demo.lot === h.lot.id && RISE.demo.play) { townRiseStop(); tbiUI(); return; }
    townRiseStart(h.T, h.lot.id, 0, RISE.dur, true).then(tbiUI, function (er) { TBI.msg = er.message; tbiUI(); });
  };
}
/** 每一格：演完了 ⇒ 按鈕換回來；帳上的工地進度變了 ⇒ 重問（RISE.poll.n 每問一次加一）。 */
function tbiFrame() {
  if (!TBI.open) return;
  if (!modeRule('town') || TWB.on) { tbiClose(); return; }
  var h = TBI.hit, s = RISE.S[townRiseKey(h.T, h.lot.id)], demo = !!(s && RISE.demo === s && s.play), n = RISE.poll.n;
  if (TBI.demo !== demo) { TBI.demo = demo; tbiUI(); }
  if (TBI.pn !== n) { var first = TBI.pn == null; TBI.pn = n; if (!first && TBI.b && TBI.b.site) tbiLoad(); }
}
ctrlAdd({ name: 'townbld', pri: 7, on: function () { return TBI.open; },
  tap: function (x, y, btn) { return tbiTap(x, y, btn); },
  frame: function () { tbiFrame(); }
});

// ───────────────────────── 選船彈窗（主選單的艦隊編成；Tim 2026-10-18「船數已經有多 下拉選單不好操作 是否可以改成變成一個按鈕 按下後彈窗選取…給船分類」） ─────────────────────────
// 編成那一列每艘一顆鈕（71_input.js fleetUI）⇒ 點了開這個彈窗：上面篩選（動力、噸位、火力、搜尋名字），下面卡片；點卡片 ＝ 換那一格的船（pickShip），彈窗關掉。
// 卡片資料 ＝ config/ship_cards.json（admin.py shipcheck 量的：js/75_shipcheck.js shipCard；建置時內嵌成 #ship-cards）⇒ 打開彈窗不用解碼任何一艘船，
//   選定了才照舊 loadHull（只載編成裡的那幾艘）。沒量過的船（新匯入還沒跑 shipcheck）⇒ 卡片只寫名字，只在「全部」裡。
// 分類（Tim：「預設All 然後可以切分類 根據動力 噸位 火力等大致分類」）：三排各自篩、可以疊；預設都是全部。
//   動力 ＝ 卡片的 drive（帆 sail／蒸汽 steam／槳 oar／魔法 magic；船隊裡沒有的那一種不列）；
//   噸位 ＝ 設計水線排水量：小 ＜ SPK_TONS[0]、大 ≥ SPK_TONS[1]；火力 ＝ 全部的砲各打一發的彈重（公斤）：輕 ＜ SPK_VOLLEY[0]、重 ≥ SPK_VOLLEY[1]。
//   門檻照 2026-10-18 那 17 艘的分布切成大約三等份（噸位 4／6／7 艘、火力 5／8／4 艘；ship_cards.json），之後船多了再調。
var SHIP_CARDS = (window.VoxelKit.embeddedJSON('ship-cards') || {}).ships || {};
var SPK_TONS = [1000, 3000], SPK_VOLLEY = [200, 600];
var SPK_DRIVE = [['sail', '⛵', '帆船'], ['steam', '♨️', '蒸汽'], ['oar', '🚣', '槳帆'], ['magic', '✨', '魔法']];
var SPK = { s: 0, j: 0, f: { drive: '', tons: '', fire: '', q: '' } };     // 篩選照上一次（同一次開遊戲裡記著）
function spkTier(v, cut) { return v === undefined ? '' : v < cut[0] ? 'lo' : v >= cut[1] ? 'hi' : 'mid'; }
function spkMatch(h) {
  var c = SHIP_CARDS[h.id], F = SPK.f, q = F.q.trim().toLowerCase();
  if (q && (h.name + ' ' + h.id + ' ' + (h.author || '')).toLowerCase().indexOf(q) < 0) return false;
  if (!F.drive && !F.tons && !F.fire) return true;
  if (!c) return false;
  return (!F.drive || c.drive === F.drive) && (!F.tons || spkTier(c.tons, SPK_TONS) === F.tons) && (!F.fire || spkTier(c.volley, SPK_VOLLEY) === F.fire);
}
function spkOpen(s, j) {
  SPK.s = s; SPK.j = j;
  $('spkT').textContent = '選船：' + (s === 0 ? (j ? '友艦 ' + j : '我艦') : '敵艦 ' + (j + 1));
  spkFilters(); spkShow();
  $('spk').classList.add('on');
  var sb = $('spk').querySelector('input[type=search]'); if (sb && matchMedia('(pointer:fine)').matches) sb.focus();   // 手機不自動跳鍵盤
}
function spkClose() { $('spk').classList.remove('on'); }
/** 篩選那三排＋搜尋（每次打開重畫：船隊裡有哪幾種動力照卡片算）。 */
function spkFilters() {
  var have = {}; HULL_LIST.forEach(function (h) { var c = SHIP_CARDS[h.id]; if (c) have[c.drive] = 1; });
  function row(k, name, opts) {
    return '<div class="spkR" data-k="' + k + '"><span>' + name + '</span>' + [['', '全部']].concat(opts).map(function (o) { return '<button data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  var t = function (a, b) { return a.toLocaleString() + (b ? '–' + b.toLocaleString() : ''); };
  $('spkF').innerHTML = row('drive', '動力', SPK_DRIVE.filter(function (d) { return have[d[0]]; }).map(function (d) { return [d[0], d[1] + ' ' + d[2]]; })) +
    row('tons', '噸位', [['lo', '小（&lt; ' + t(SPK_TONS[0]) + ' 噸）'], ['mid', '中'], ['hi', '大（≥ ' + t(SPK_TONS[1]) + ' 噸）']]) +
    row('fire', '火力', [['lo', '輕（齊射 &lt; ' + SPK_VOLLEY[0] + ' kg）'], ['mid', '中'], ['hi', '重（≥ ' + SPK_VOLLEY[1] + ' kg）']]) +
    '<div class="spkR"><span>搜尋</span><input type="search" placeholder="船名、建造者…" aria-label="搜尋船名或建造者"></div>';
  [].forEach.call($('spkF').querySelectorAll('.spkR[data-k]'), function (r) {
    [].forEach.call(r.querySelectorAll('button'), function (b) { b.onclick = function () { SPK.f[r.dataset.k] = b.dataset.v; spkShow(); }; });
  });
  var sb = $('spkF').querySelector('input'); sb.value = SPK.f.q; sb.oninput = function () { SPK.f.q = sb.value; spkShow(); };
}
/** 卡片（照篩選）＋篩選鈕的亮燈。 */
function spkShow() {
  [].forEach.call($('spkF').querySelectorAll('.spkR[data-k]'), function (r) { [].forEach.call(r.querySelectorAll('button'), function (b) { b.className = b.dataset.v === SPK.f[r.dataset.k] ? 'on' : ''; }); });
  var cur = FLEET_SET[SPK.s][SPK.j], L = HULL_LIST.filter(spkMatch), dn = {};
  SPK_DRIVE.forEach(function (d) { dn[d[0]] = d; });
  $('spkN').textContent = '顯示 ' + L.length + '／' + HULL_LIST.length + ' 艘' + (L.length ? '' : ' —— 沒有符合的船，換一個篩選');
  $('spkG').innerHTML = L.map(function (h) {
    var c = SHIP_CARDS[h.id], d = c && dn[c.drive];
    var m = c ? '<span class="m">' + c.tons.toLocaleString() + ' 噸・水線 ' + c.len + ' m</span><span class="m">砲 ' + c.guns + ' 門・齊射 ' + c.volley.toLocaleString() + ' kg' + (c.crew ? '・' + c.crew + ' 人' : '') + '</span>'
      : '<span class="m">（還沒量：admin.py shipcheck）</span>';
    return '<button class="spkC' + (h.id === cur ? ' on' : '') + '" data-id="' + h.id + '"' + (d ? ' title="' + d[2] + '"' : '') + '>' + (d ? '<span class="i">' + d[1] + '</span>' : '') + '<b>' + h.name + '</b>' + m +
      (h.author ? '<span class="m">建造者 ' + h.author + '</span>' : '') + '</button>';
  }).join('');
  [].forEach.call($('spkG').querySelectorAll('button.spkC'), function (b) { b.onclick = function () { spkClose(); if (b.dataset.id !== cur) { pickShip(SPK.s, SPK.j, b.dataset.id); fleetUI(); } }; });
}
$('spkX').onclick = spkClose;
$('spk').onclick = function (e) { if (e.target === $('spk')) spkClose(); };   // 點彈窗外面關
window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('spk').classList.contains('on')) { e.preventDefault(); e.stopImmediatePropagation(); spkClose(); } }, true);   // 捕獲階段：先於主選單的 Esc（關子頁）

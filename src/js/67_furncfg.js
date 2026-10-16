// ───────────────────────── 道具設定（主選單「道具設定…」；Tim 2026-10-16：「是否可以把這些道具的參數(抽水速度等) 加一個道具後台可以調整(一樣是開發後台調預設 玩家後台套同一個UI)」） ─────────────────────────
// 一種道具一份（config furniture：病床、手術台、藥箱、抽水機…）：所有船上同一種都照這一份。寫法照砲的設定（68_guncfg.js）：
//   這一頁改的直接寫進 FURN（抽水量、上限、治療加成是即時讀的；血量、容納人數擺上去那一刻讀 ⇒ 都說「下一場開始生效」）；
//   玩家：存檔只存跟預設不一樣的（69_prefs.js furn ＝ FURN_SET）、可以匯出匯入。
//   開發後台：設定後台開 ?admin=furn ⇒ 同一頁、多一列「存成出廠預設」⇒ postMessage 給後台 ⇒ admin.py act_furniture 寫進 config/game.json furniture（重建之後才吃得到）。
// 項目（FURN_ITEMS）：has(f) 決定這一種有沒有那一格；沒有任何一格可以調的（火藥桶：血量在細節設定）不列。
var FURN0 = JSON.parse(JSON.stringify(FURN));   // 設定檔的原樣（回到預設、比改過沒）
var FURN_SET = {};                               // { 道具: { 鍵: 值 } }：跟 FURN0 不一樣的（鍵可以是 'buff.heal'）
var ADMIN_FURN = Q.get('admin') === 'furn';
function furnIsPump(f) { return f.role === 'pump'; }
var FURN_ITEMS = [
  { k: 'tpm', name: '抽水量', lim: [0, 120], step: 0.5, unit: ' 噸／分', fix: 1, has: furnIsPump, note: '每台每分鐘抽幾噸（人力的要人手到齊才是這個數；加在船的基礎抽水量上）' },
  { k: 'crew', name: '要幾人搖', lim: [1, 12], step: 1, unit: ' 人', int: true, has: function (f) { return furnIsPump(f) && f.power !== 'steam'; }, note: '抽水量 × 到崗 ÷ 這個數；艙裡有水才從預備水手派' },
  { k: 'cap', name: '全船上限', lim: [0, 300], step: 1, unit: ' 噸／分', int: true, has: furnIsPump, note: '同一種抽水機全船加總最多抽多少（0 ＝ 不限）' },
  { k: 'hold', name: '容納', lim: [1, 4], step: 1, unit: ' 人', int: true, has: function (f) { return f.hold !== undefined; }, note: '一張床躺幾個傷員' },
  { k: 'buff.heal', name: '治療速度加成', lim: [0, 1], step: 0.05, pct: true, has: function (f) { return !!(f.buff && f.buff.heal !== undefined); }, note: '同一間加總，上限照房間類型（醫療艙 60%）' },
  { k: 'hp', name: '血量', lim: [10, 1000], step: 10, unit: '', int: true, has: function (f) { return f.hp !== undefined; }, note: '被打到扣血，歸零就壞（不再能用、不再給加成）' }
];
function furnItem(k) { return FURN_ITEMS.filter(function (it) { return it.k === k; })[0]; }
function fGet(f, k) { var p = k.split('.'); return p.length > 1 ? (f[p[0]] || {})[p[1]] : f[k]; }
function fPut(f, k, v) { var p = k.split('.'); if (p.length > 1) (f[p[0]] = f[p[0]] || {})[p[1]] = v; else f[k] = v; }
/** 有哪幾種道具可以調（至少一格）。 */
function furnIds() { return Object.keys(FURN).filter(function (id) { return FURN_ITEMS.some(function (it) { return it.has(FURN0[id] || FURN[id]); }); }); }
/** 改一項（夾進範圍、對齊刻度）；跟預設一樣 ⇒ 從 FURN_SET 拿掉。 */
function furnSet(id, k, v) {
  var it = furnItem(k), f = FURN[id]; if (!it || !f || !it.has(FURN0[id] || f) || typeof v !== 'number' || !isFinite(v)) return;
  v = clamp(v, it.lim[0], it.lim[1]); v = it.int ? Math.round(v) : +(Math.round(v / it.step) * it.step).toFixed(4);
  var d = fGet(FURN0[id], k), S = FURN_SET[id] = FURN_SET[id] || {};
  fPut(f, k, v);
  if (v === d) delete S[k]; else S[k] = v;
  if (!Object.keys(S).length) delete FURN_SET[id];
}
function furnReset(id) { FURN_ITEMS.forEach(function (it) { if (it.has(FURN0[id] || {})) furnSet(id, it.k, fGet(FURN0[id], it.k)); }); }
/** 存檔用：FURN_SET 的拷貝。 */
function furnSnap() { return JSON.parse(JSON.stringify(FURN_SET)); }
/** 存檔／匯入 ⇒ 變數：看得懂的道具、鍵才套（照 furnSet 夾範圍）。回傳套了幾種。 */
function furnApply(o) {
  if (!o || typeof o !== 'object') return 0;
  var n = 0;
  Object.keys(o).forEach(function (id) {
    if (!FURN[id] || !o[id] || typeof o[id] !== 'object') return; n++;
    Object.keys(o[id]).forEach(function (k) { furnSet(id, k, o[id][k]); });
  });
  return n;
}
function furnExport() {
  var g = {}; furnIds().forEach(function (id) { g[id] = {}; FURN_ITEMS.forEach(function (it) { if (it.has(FURN0[id])) g[id][it.k] = fGet(FURN[id], it.k); }); });
  return { game: 'ame_constitution_broadside', kind: 'furniture', v: 1, at: new Date().toISOString(), furn: g };
}
function furnImport(o) { return o && o.game === 'ame_constitution_broadside' && o.kind === 'furniture' ? furnApply(o.furn) : -1; }
// ── 頁面（71_input.js 接返回、換頁） ──
var FURN_ID = furnIds()[0];
function furnFmt(it, v) { return it.pct ? '+' + Math.round(v * 100) + '%' : (it.int ? String(v) : v.toFixed(it.fix || 2)) + (it.unit || ''); }
function furnUI(page) {
  var sel = $('furnSel'), ids = furnIds();
  sel.innerHTML = ids.map(function (id) { var t = ROOM_FN[FURN[id].type]; return '<option value="' + id + '">' + FURN[id].name + (t ? '（' + t.name + '）' : '') + '</option>'; }).join('');
  sel.value = FURN_ID; sel.onchange = function () { FURN_ID = sel.value; furnShow(); };
  $('furnItems').innerHTML = FURN_ITEMS.map(function (it) {
    return '<div class="fk" data-k="' + it.k + '"><div class="row slide"><label for="fk-' + it.k + '">' + it.name + '</label><input type="range" id="fk-' + it.k + '" min="' + it.lim[0] + '" max="' + it.lim[1] + '" step="' + it.step + '" aria-label="' + it.name + '"><span id="fk-' + it.k + 'V"></span></div>' +
      '<div class="row note gkn">' + it.note + '</div></div>';
  }).join('');
  FURN_ITEMS.forEach(function (it) { var r = $('fk-' + it.k); r.oninput = function () { furnSet(FURN_ID, it.k, +r.value); furnShow(); }; });
  var rArm = 0;
  $('furnR').onclick = function () {                     // 按兩下（同砲的設定：⛔ confirm() 在畫廊彈窗裡直接回 false）
    var b = $('furnR');
    if (performance.now() - rArm > 4000) { rArm = performance.now(); b.textContent = '再按一次：' + FURN[FURN_ID].name + '回到預設'; setTimeout(function () { if (performance.now() - rArm >= 3900) b.textContent = '這一種回到預設'; }, 4000); return; }
    rArm = 0; b.textContent = '這一種回到預設'; furnReset(FURN_ID); furnShow();
  };
  $('furnE').onclick = function () {
    var s = JSON.stringify(furnExport(), null, 1), a = document.createElement('a'), d = new Date();
    a.href = URL.createObjectURL(new Blob([s], { type: 'application/json' }));
    a.download = 'constitution_broadside_furniture_' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    $('furnSt').textContent = '已匯出 ' + a.download + '（每一種道具整份）。';
  };
  $('furnI').onclick = function () { $('furnF').value = ''; $('furnF').click(); };
  $('furnF').onchange = function () {
    var f = $('furnF').files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var n = -1; try { n = furnImport(JSON.parse(r.result)); } catch (e) { n = -1; }
      furnShow();
      $('furnSt').textContent = n < 0 ? '⚠ 匯入失敗：' + f.name + ' 不是這個遊戲匯出的道具設定。' : '已匯入 ' + f.name + '：' + n + ' 種道具' + (PREFS.write ? '（已存）。' : '（這一頁存不了，下次打開要再匯入）。');
    };
    r.readAsText(f);
  };
  if (ADMIN_FURN) furnAdmUI(page);
}
/** 變數 ⇒ 這一頁（這一種沒有的那一格藏起來；跟預設不一樣的標「改過」）。 */
function furnShow() {
  var id = FURN_ID, f = FURN[id], f0 = FURN0[id] || f;
  FURN_ITEMS.forEach(function (it) {
    var box = document.querySelector('#furnItems .fk[data-k="' + it.k + '"]'), on = it.has(f0); box.style.display = on ? '' : 'none'; if (!on) return;
    var v = fGet(f, it.k), d = fGet(f0, it.k);
    $('fk-' + it.k).value = v;
    $('fk-' + it.k + 'V').textContent = furnFmt(it, v) + (v === d ? '' : '（改過；預設 ' + furnFmt(it, d) + '）');
  });
  var t = ROOM_FN[f.type], where = f.role === 'pump' ? '甲板（' + (f.place === 'well' ? '主桅旁中線' : '中線') + (f.power === 'steam' ? '、只有蒸汽船' : '') + '）' : t ? t.name : '';
  $('furnInfo').innerHTML = '擺在：' + where + '（船隻配置頁的「擺設…」）' + (f.size && S > 0 ? '・大小 ' + f.size.map(function (v) { return (v * S).toFixed(1); }).join('×') + ' m' : '')   /* S（公尺／格）第一艘船載好才有 ⇒ 之前不寫大小 */;
  var n = Object.keys(FURN_SET).length, b = $('furnB'); b.textContent = n ? '道具設定（改過）…' : '道具設定…'; b.className = n ? 'on' : '';
}
/** 開發後台（?admin=furn）：同一頁多一列 —— 「存成出廠預設」⇒ FURN_SET 送給開這一頁的設定後台（postMessage；⛔ 成品裡不能有 fetch）⇒ admin.py act_furniture；「重建」；「回設定後台」。 */
function furnAdmUI(page) {
  $('furnp').classList.add('admin');
  var out = $('furnAdmL'), wait = null;
  window.addEventListener('message', function (ev) { if (ev.origin !== location.origin || !ev.data || ev.data.kind !== 'cb-admdef-r' || !wait) return; var w = wait; wait = null; out.textContent = (ev.data.log || []).join('\n'); w(ev.data); });
  function post(op, data) {
    var ad = window.opener; if (!ad || ad.closed) { out.textContent = '⚠ 找不到設定後台：要從設定後台的「用道具設定頁設出廠預設值…」開這一頁'; return Promise.resolve({ ok: false }); }
    out.textContent = '…（設定後台處理中；重建要十幾秒）'; ad.postMessage({ kind: 'cb-admdef', op: op, furn: data }, location.origin);
    return new Promise(function (res) { wait = res; });
  }
  $('furnAdmS').onclick = function () {
    var o = furnSnap(); if (!Object.keys(o).length) { out.textContent = '（都跟出廠預設一樣，沒有要存的）'; return; }
    post('furn', o).then(function (j) { if (!j.ok) return; Object.keys(o).forEach(function (id) { Object.keys(o[id]).forEach(function (k) { fPut(FURN0[id], k, o[id][k]); }); }); FURN_SET = {}; furnShow(); });
  };
  $('furnAdmB').onclick = function () { post('build'); };
  $('furnAdmX').onclick = $('furnX').onclick = $('pgX').onclick = function () { if (window.opener && !window.opener.closed) window.close(); else location.href = '/'; };
}

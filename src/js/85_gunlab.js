// ───────────────────────── 開炮音試聽頁（Tim 2026-10-28：「做一個炮音網頁讓我試聽一下(遊戲內用的合成音) 然後多一些參數Slider我調整到聽起來合適的給妳參數」） ─────────────────────────
// 入口：根目錄 gunlab.html ⇒ index.html?lab=gun。放的就是遊戲那一份（02_audio.js gunSndPar／gunVoice，走 sfxPlay 同一條路：同一個限制器、同一套同時發聲上限）。
// 滑桿改的是遊戲裡那幾張表（gunSndSet），只在這一頁有效、記在這台瀏覽器（localStorage）；「複製參數」⇒ 一段 JSON 貼回來，照它改 02_audio.js。
// 「原本（TASK-0978）」＝ 這次改之前那一組（原本的小砲錨點、沒有 naval 錨點、沒有重擊、沒有滾雷），⛔ 只拿來對照、不能調。
// 齊射：照 21_gunnery.js broadside 的節奏（每門 0.075 秒＋0～0.03 秒）一輪 N 門、連 M 輪 ⇒ 看被上限丟掉幾聲（SFX_DROP）。
var GLAB = { cur: null, mode: 'new', anchor: 'naval', gun: 'long', dist: 40, vol: 1, n: 15, m: 3, gap: 4, an: null, key: 'blockside.gunlab.v2' };   // v2：照 Naval Action 那支影片調過的預設（v1 是調之前存的，不讀）
var GLAB_ORIG = { A: { small: { shot: 3.7, fp: 104, bLp: 2480, bA: 0.455, bD: 0.0227, oA: 2.11, oD: 0.24, cA: 0.341, cD: 0.0218, cHz: 3520, tA: 0.12, tD: 1.09, tLp: 1, eA: 0.15 } }, line: ['small', 'big'], kick: { a: 0 }, roll: { a: 0 }, vol: 2.8 };
// 每個滑桿：[欄位, 名稱, 最小, 最大, 步進]
var GLAB_KICK = [['a', '重擊音量', 0, 2, 0.01], ['d0', '重擊長（小砲，秒）', 0.03, 1, 0.01], ['d1', '重擊長（大砲，秒）', 0.03, 2, 0.01], ['f0', '起始頻率（× 主頻）', 0.5, 6, 0.05],
  ['f1', '結束頻率（× 主頻）', 0.2, 3, 0.05], ['drive', '飽和（泛音多寡）', 0.5, 12, 0.1], ['out', '飽和後音量', 0, 1.5, 0.01]];
var GLAB_ROLL = [['a', '滾雷音量', 0, 4, 0.01], ['sz', '滾雷音量隨口徑（次方；0 ＝ 大小砲一樣）', 0, 4, 0.05], ['d0', '滾雷長（0.5 kg 砲，退到 −40 dB 秒）', 0.1, 30, 0.1], ['d1', '滾雷長（900 kg 砲，秒；實際上限 30）', 1, 2000, 1], ['lp', '滾雷亮度（低通 × 主頻）', 1, 12, 0.1], ['lfo', '翻滾（音量起伏）', 0, 1, 0.01]];
var GLAB_A = [['shot', '錨點彈重 kg', 0.2, 900, 0.1], ['fp', '主頻 Hz', 15, 400, 1], ['bA', '爆風音量', 0, 3, 0.01], ['bD', '爆風長', 0.005, 1, 0.005], ['bLp', '爆風亮度 Hz', 200, 8000, 10],
  ['oA', '身體音量', 0, 4, 0.01], ['oD', '身體長', 0.02, 3, 0.01], ['cA', '脆響音量', 0, 2, 0.005], ['cD', '脆響長', 0.002, 0.2, 0.001], ['cHz', '脆響頻率 Hz', 800, 8000, 10],
  ['tA', '尾聲音量', 0, 2, 0.01], ['tD', '尾聲長', 0.05, 20, 0.05], ['tLp', '尾聲亮度（× 主頻）', 0.5, 10, 0.05], ['eA', '回音音量', 0, 1, 0.005]];
function glabEl(id) { return document.getElementById(id); }
function glabSave() { try { localStorage.setItem(GLAB.key, JSON.stringify(GLAB.cur)); } catch (e) { } }
function glabApply() {                                                   // 照模式把參數寫進 02_audio.js 的表
  if (GLAB.mode === 'orig') { var o = JSON.parse(JSON.stringify(GLAB.cur)); o.A.small = Object.assign({}, GLAB_ORIG.A.small); o.line = GLAB_ORIG.line; o.kick.a = 0; o.roll.a = 0; o.vol = GLAB_ORIG.vol; gunSndSet(o); }
  else gunSndSet(GLAB.cur);
}
function gunLabInit() {
  GLAB.def = gunSndGet(); GLAB.cur = gunSndGet();
  try { var s = JSON.parse(localStorage.getItem(GLAB.key) || 'null'); if (s && s.A) GLAB.cur = s; } catch (e) { }
  var st = document.createElement('style');
  st.textContent = '#glab{position:fixed;inset:0;z-index:200;overflow:auto;background:#0e1a26;color:#e8eef5;font:13px/1.45 system-ui,"Microsoft JhengHei",sans-serif;padding:12px 16px}' +
    '#glab h1{font-size:18px;margin:0 0 6px}#glab h2{font-size:14px;margin:14px 0 4px;color:#9fd0ff}#glab .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0}' +
    '#glab button{background:#24476b;color:#fff;border:1px solid #3c6a96;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer}#glab button.on{background:#c77d1a;border-color:#f0a540}' +
    '#glab .sl{display:grid;grid-template-columns:minmax(150px,220px) 1fr 70px;gap:6px;align-items:center;max-width:720px}#glab .sl input[type=range]{width:100%}' +
    '#glab .sl output{font-variant-numeric:tabular-nums;text-align:right}#glab .sl .chg{color:#f0a540}#glab select,#glab input[type=number]{background:#13283c;color:#fff;border:1px solid #3c6a96;border-radius:4px;padding:3px}' +
    '#glab .note{color:#9db0c2;font-size:12px;max-width:760px}#glab textarea{width:100%;max-width:760px;height:90px;background:#13283c;color:#cfe;border:1px solid #3c6a96;font:12px monospace}' +
    '#glab .meter{font-variant-numeric:tabular-nums;color:#cfe}#glab .cols{display:flex;flex-wrap:wrap;gap:24px}#glab .cols > div{flex:1 1 420px}';
  document.head.appendChild(st);
  var d = document.createElement('div'); d.id = 'glab';
  var guns = Object.keys(GUNS).sort(function (a, b) { return (GUNS[a].shot || 0) - (GUNS[b].shot || 0); });
  d.innerHTML = '<h1>🔊 開炮音試聽</h1>' +
    '<div class="note">放的是遊戲裡那一份合成音（同一個限制器、同一套同時發聲上限）。滑桿只改這一頁、記在這台瀏覽器；調好按「複製參數」把那段文字貼給 summit。聲音大小照遊戲的音效音量設定。</div>' +
    '<div class="row"><button id="glGo">▶ 開始（瀏覽器要先點一下才能出聲）</button><span id="glSt" class="note"></span></div>' +
    '<div class="row">版本：<button id="glNew" class="on">調整中的</button><button id="glOrig">原本（TASK-0978）</button><span class="note">原本 ＝ 這次改之前：沒有 24 磅錨點、沒有重擊、沒有滾雷</span></div>' +
    '<div class="row">砲：<select id="glGun">' + guns.map(function (k) { return '<option value="' + k + '"' + (k === GLAB.gun ? ' selected' : '') + '>' + (GUNS[k].name || k) + '（' + (GUNS[k].shot || '?') + ' kg）</option>'; }).join('') + '</select>' +
    ' 距離 <input id="glDist" type="range" min="0" max="1000" step="5" value="' + GLAB.dist + '" style="width:180px"> <output id="glDistO">' + GLAB.dist + ' m</output>' +
    ' <label><input id="glMine" type="checkbox" checked> 自己的船（音量 1；別人的 0.8）</label></div>' +
    '<div class="row"><button id="glOne">💥 開一砲</button><button id="glVol">🔥 齊射</button> 每輪 <input id="glN" type="number" min="1" max="60" value="' + GLAB.n + '" style="width:50px"> 門、連 <input id="glM" type="number" min="1" max="10" value="' + GLAB.m + '" style="width:44px"> 輪、隔 <input id="glGap" type="number" min="0.5" max="20" step="0.5" value="' + GLAB.gap + '" style="width:50px"> 秒' +
    ' <button id="glAB">⇄ 原本／調整中 輪流各一砲</button></div>' +
    '<div class="row meter" id="glMeter">—</div><div class="row note" id="glInfo"></div>' +
    '<div class="cols"><div><h2>重擊（kick）</h2><div id="glKick"></div><h2>滾雷（全場共用一條；齊射時疊起來）</h2><div id="glRoll"></div><h2>整體</h2><div id="glAll"></div></div>' +
    '<div><h2>錨點 <select id="glAnc"></select></h2><div class="note" id="glAncN"></div><div id="glAncS"></div></div></div>' +
    '<h2>參數</h2><div class="row"><button id="glCopy">📋 複製參數</button><button id="glLoad">⬆ 貼上的參數套用</button><button id="glReset">↺ 回到遊戲預設</button><span id="glCopyO" class="note"></span></div><textarea id="glTxt" spellcheck="false"></textarea>';
  document.body.appendChild(d);
  glabBuild();
  glabEl('glGo').onclick = function () { glabStart(); };
  glabEl('glNew').onclick = function () { glabMode('new'); }; glabEl('glOrig').onclick = function () { glabMode('orig'); };
  glabEl('glGun').onchange = function () { GLAB.gun = this.value; glabInfo(); };
  glabEl('glDist').oninput = function () { GLAB.dist = +this.value; glabEl('glDistO').textContent = GLAB.dist + ' m'; };
  glabEl('glMine').onchange = function () { GLAB.vol = this.checked ? 1 : 0.8; };
  glabEl('glOne').onclick = function () { if (glabStart()) glabFire(0); };
  glabEl('glVol').onclick = function () { if (glabStart()) glabVolley(); };
  glabEl('glAB').onclick = function () { if (glabStart()) glabAB(); };
  glabEl('glCopy').onclick = function () { var t = glabEl('glTxt'); t.value = JSON.stringify(GLAB.cur); t.select(); try { navigator.clipboard.writeText(t.value); glabEl('glCopyO').textContent = '已複製到剪貼簿'; } catch (e) { glabEl('glCopyO').textContent = '已選取，按 Ctrl+C'; } };
  glabEl('glLoad').onclick = function () { try { var c = JSON.parse(glabEl('glTxt').value); if (!c.A) throw 0; GLAB.cur = c; glabSave(); glabApply(); glabBuild(); glabEl('glCopyO').textContent = '套用了'; } catch (e) { glabEl('glCopyO').textContent = '看不懂這段文字'; } };
  glabEl('glReset').onclick = function () { GLAB.cur = JSON.parse(JSON.stringify(GLAB.def)); glabSave(); glabApply(); glabBuild(); glabEl('glCopyO').textContent = '回到遊戲預設了'; };
  glabApply(); glabInfo(); setInterval(glabMeter, 100);
}
function glabStart() {
  if (!AC) { muted = false; initAudio(); }
  if (!AC) { glabEl('glSt').textContent = '這個瀏覽器開不了聲音'; return false; }
  if (AC.state === 'suspended') AC.resume();
  AC.bgmBus.gain.value = 0; AC.ambBus.gain.value = 0; muted = false;   // 只聽砲：背景音樂、環境音關掉
  if (!GLAB.an) { GLAB.an = AC.createAnalyser(); GLAB.an.fftSize = 2048; AC.lim.connect(GLAB.an); GLAB.pk = 0; }
  glabEl('glSt').textContent = '聲音開了（音效音量 ' + Math.round(SND.sfx * 100) + '%）'; return true;
}
function glabMode(m) { GLAB.mode = m; glabEl('glNew').className = m === 'new' ? 'on' : ''; glabEl('glOrig').className = m === 'orig' ? 'on' : ''; glabApply(); glabInfo(); }
// 開一砲：走 sfxPlay（同一套上限）；at ＝ 鏡頭前方 dist 公尺
function glabFire(dt) {
  var e = CAM.eye, at = [e[0] + GLAB.dist + 0.001, e[1], e[2]];
  if (dt > 0) setTimeout(function () { sfxPlay('boom', at, GLAB.vol, { gun: GLAB.gun }); }, dt * 1000); else sfxPlay('boom', at, GLAB.vol, { gun: GLAB.gun });
}
function glabVolley() {
  Object.keys(SFX_DROP).forEach(function (k) { delete SFX_DROP[k]; }); GLAB.shots = 0;
  var n = Math.max(1, +glabEl('glN').value | 0), m = Math.max(1, +glabEl('glM').value | 0), gap = Math.max(0.5, +glabEl('glGap').value || 4);
  for (var j = 0; j < m; j++) for (var i = 0; i < n; i++) { GLAB.shots++; glabFire(j * gap + i * 0.075 + Math.random() * 0.03); }
}
function glabAB() { var m0 = GLAB.mode; glabMode('orig'); glabFire(0); setTimeout(function () { glabMode('new'); glabFire(0); setTimeout(function () { glabMode(m0); }, 50); }, 2500); }
function glabMeter() {
  if (!GLAB.an) return;
  var b = new Float32Array(GLAB.an.fftSize); GLAB.an.getFloatTimeDomainData(b); var pk = 0, ss = 0;
  for (var i = 0; i < b.length; i++) { var a = Math.abs(b[i]); if (a > pk) pk = a; ss += b[i] * b[i]; }
  GLAB.pk = Math.max(pk, GLAB.pk * 0.9);
  var drop = SFX_DROP.boom || 0, live = SFX_GUN_END.filter(function (t) { return t > AC.currentTime; }).length;
  glabEl('glMeter').textContent = '峰值 ' + (GLAB.pk > 0 ? (20 * Math.log10(GLAB.pk)).toFixed(1) : '−∞') + ' dB　RMS ' + (ss > 0 ? (10 * Math.log10(ss / b.length)).toFixed(1) : '−∞') + ' dB　限制器壓了 ' + (-AC.lim.reduction).toFixed(1) + ' dB' +
    '　開砲聲部 ' + live + '／' + SFX_GUN_MAX + (GLAB.shots ? '　這次齊射 ' + GLAB.shots + ' 砲、被丟掉 ' + drop + ' 聲' : '');
}
// 這門砲走哪條線、夾在哪兩個錨點之間（gunSndPar 同一套判法）
function glabInfo() {
  var G = GUNS[GLAB.gun] || {}, shot = Math.max(0.1, G.shot || 10), F = GUNSND_FAM[GUNSND_OF[GLAB.gun] || 'bp'], L = GUNSND_LINE[F.line], a = L[0], b = L[0], u = 0;
  for (var i = 0; i + 1 < L.length; i++) if (shot >= GUNSND_A[L[i]].shot) { a = L[i]; b = L[i + 1]; u = Math.min(1, Math.log(shot / GUNSND_A[a].shot) / Math.log(GUNSND_A[b].shot / GUNSND_A[a].shot)); }
  var p = gunSndPar(GLAB.gun);
  glabEl('glInfo').textContent = (G.name || GLAB.gun) + '：' + (F.line === 'bp' ? '黑火藥' : '無煙') + '那條線，' + (a === b ? '照錨點 ' + a : '錨點 ' + a + ' → ' + b + ' 走了 ' + Math.round(u * 100) + '%') +
    '（調它的聲音就調這兩個錨點）；主頻 ' + Math.round(p.fp) + ' Hz、響度倍數 × ' + p.vol.toFixed(2) + (GLAB.mode === 'orig' ? '　〔現在放的是原本那一組〕' : '');
}
function glabSlider(host, obj, defs, dflt, onCh) {
  defs.forEach(function (s) {
    var k = s[0], v = obj[k] == null ? (dflt && dflt[k] != null ? dflt[k] : 0) : obj[k], row = document.createElement('div'); row.className = 'sl';
    var log = s[3] / Math.max(s[2], 1e-6) > 50 && s[2] > 0;               // 跨好幾個數量級（彈重、頻率）⇒ 對數滑桿
    var toR = function (x) { return log ? Math.log(x / s[2]) / Math.log(s[3] / s[2]) * 1000 : (x - s[2]) / (s[3] - s[2]) * 1000; };
    var frR = function (r) { var x = log ? s[2] * Math.pow(s[3] / s[2], r / 1000) : s[2] + (s[3] - s[2]) * r / 1000; return +(Math.round(x / s[4]) * s[4]).toFixed(4); };
    row.innerHTML = '<span>' + s[1] + '</span><input type="range" min="0" max="1000" step="1"><output></output>';
    var r = row.children[1], o = row.children[2], d0 = dflt ? dflt[k] : null;
    function show(x) { o.textContent = x; row.children[0].className = d0 != null && Math.abs(x - d0) > 1e-9 ? 'chg' : ''; row.title = d0 != null ? '遊戲預設 ' + d0 : ''; }
    r.value = toR(v); show(v);
    r.oninput = function () { var x = frR(+r.value); obj[k] = x; show(x); onCh(); };
    host.appendChild(row);
  });
}
function glabBuild() {
  var C = GLAB.cur, D = GLAB.def, ch = function () { glabSave(); glabApply(); glabInfo(); };
  ['glKick', 'glRoll', 'glAll', 'glAncS'].forEach(function (id) { glabEl(id).innerHTML = ''; });
  glabSlider(glabEl('glKick'), C.kick, GLAB_KICK, D.kick, ch);
  glabSlider(glabEl('glRoll'), C.roll, GLAB_ROLL, D.roll, ch);
  glabSlider(glabEl('glAll'), C, [['vol', '響度倍數（小砲；大砲照口徑少乘一點）', 0.5, 6, 0.05]], D, ch);
  var sel = glabEl('glAnc'), names = { small: '小砲（黑火藥，3 磅）', naval: '艦砲（黑火藥，24 磅）', big: '大口徑（兩條線共用）', qf: '速射砲（無煙）', mid: '中口徑（無煙）' };
  sel.innerHTML = Object.keys(C.A).map(function (k) { return '<option value="' + k + '"' + (k === GLAB.anchor ? ' selected' : '') + '>' + (names[k] || k) + '</option>'; }).join('');
  sel.onchange = function () { GLAB.anchor = this.value; glabBuild(); };
  glabEl('glAncN').textContent = '錨點之間照彈重的對數內插；黑火藥那條線：' + C.line.join(' → ') + '，無煙：qf → mid → big。調一個錨點會連帶改它兩邊的砲。';
  glabSlider(glabEl('glAncS'), C.A[GLAB.anchor], GLAB_A, D.A[GLAB.anchor], ch);
}

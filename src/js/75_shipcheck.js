// ───────────────────────── 船的匯入檢查（?shipcheck=<船型>；Tim 2026-10-15：缺 meta、砲位擠到站不滿 ⇒ 匯入時就報出來，方便修） ─────────────────────────
// 遊戲自己判斷「缺了什麼、缺了會退回什麼」⇒ 檢查也放在遊戲裡（⛔ 在 admin.py 另寫一份規則 ⇒ 兩份總有一份先過期）。
// 跑法：載入那一型，跟憲法號擺在最遠的距離（打不到）開一場，固定步長跑 SC_SECS 秒，量完寫進頁面上 id 是 shipcheck 的 pre（JSON；⛔ 註解裡別寫那個標籤的原文 —— 成品內嵌這支程式，admin.py 會先比到註解）；
//   admin.py check／import／reimport 用無頭 Chrome 讀它、寫成報告。只讀，不改任何設定（不讀不存存檔：PREFS 照 ?shipcheck 關掉）。
// 每一筆：{ lv: 'error'｜'warn', what: 哪一類, where: 哪個部件, msg: 現在怎麼了（遊戲退回什麼）, fix: 怎麼修 }。
//   error ＝ 遊戲裡壞掉（開場就掉、砲開不動、斷掉的梯子…）；warn ＝ 能動，但照退路／預設跑（名字認、憲法號的數字…）。
var SC_SECS = 2;
function shipCheck(id) {
  var R = { id: id, t: SC_SECS, issues: [], info: {} };
  function add(lv, what, where, msg, fix) { R.issues.push({ lv: lv, what: what, where: where, msg: msg, fix: fix }); }
  function done() { var pre = document.createElement('pre'); pre.id = 'shipcheck'; document.body.appendChild(pre); pre.textContent = JSON.stringify(R); $('cover').style.display = 'none'; window.__shipcheck = R; }
  Promise.all([loadHull(id), loadHull('constitution')]).then(function () {
    var info = hullInfo(id) || HULL_KNOWN.filter(function (h) { return h.id === id; })[0];
    if (!info) { add('error', '船型', id, '設定檔 ships 沒有這一型', 'admin.py import'); done(); return; }
    FLEET_DBG = [{ team: 'blue', hull: id }, { team: 'red', hull: 'constitution' }]; MODE = 'eve'; DIST = LIM_DIST[1];
    reset(); RUNNING = true;
    var sh = SHIPS[0], T = sh.T, NV = sh.nav;
    // ── 開場那一刻（還沒跑）──
    var float0 = ropesFloating(sh).map(function (f) { return f.name + '#' + f.end + '（' + f.why + '）'; });
    for (var i = 0, n = Math.round(SC_SECS / DT); i < n; i++) step();
    RUNNING = false;
    R.info = { name: T.name, guns: sh.guns.length, crew: sh.crew.length, models: sh.models.length, ropes: sh.ropes.length, sails: sh.sails.filter(function (s) { return !(s.meta && s.meta.team); }).length, teamFlags: sh.sails.filter(function (s) { return s.meta && s.meta.team; }).length,   // 作品的帆／遊戲加的陣營旗分開數（77_colours.js；⛔ 混在一起 ⇒ 夜燈號 vxk 12 面、報告寫 15，basecamp 2026-10-15 問）
    masts: sh.masts.length, mags: sh.mags.length,
      decks: NV ? NV.levels.map(function (L) { return L.key + ' ' + L.name; }) : [], ladders: NV ? NV.ladders.length : 0, rooms: (sh.rooms || []).length, zw: T.zw, hits: SHIPS[1].hits + sh.hits };
    if (sh.hits || SHIPS[1].hits) add('warn', '量測', '—', '量的這 ' + SC_SECS + ' 秒裡有砲彈打中（hits ' + (sh.hits + SHIPS[1].hits) + '）⇒ 下面「站不滿」「掉了」可能有被打的', '照舊看，或重跑');
    // ── 船型：水線、geo ──
    var p = (T.h.parts || []).filter(function (q) { return q.meta && q.meta.kind === 'ship'; })[0], wm = (p && p.meta) || T.h.meta || {};
    if (!(isFinite(+wm.waterline_z) && +wm.waterline_z > 0) && id !== 'constitution') add('warn', '水線', '船殼', info.zw0 ? '沒有 meta kind=ship waterline_z ⇒ 用設定檔的 zw0 ' + info.zw0 : '沒有 meta kind=ship waterline_z ⇒ 用憲法號的 ' + ZW0 + '（排水量跟著錯）', '船殼的關聯（或組裝件）meta kind=ship, waterline_z=<設計水線>（造船規格 §9）');
    var C = SHIPS[1].T, rl = (T.hx1 - T.hx0) / (C.hx1 - C.hx0), rh = T.sz / C.sz;   // 跟憲法號比大小：差不到一成（餘燼號從憲法號改的）⇒ 憲法號的 geo 本來就對
    if (!info.geo && id !== 'constitution' && (Math.abs(rl - 1) > 0.1 || Math.abs(rh - 1) > 0.1)) add('warn', 'geo', '設定檔', '沒填 geo ⇒ 陸戰隊站的範圍、瞄準高度、鏡頭中心都是憲法號的數字（這艘長 ×' + rl.toFixed(2) + '、高 ×' + rh.toFixed(2) + '）', '遊戲那側填 config/game.json ships[].geo（造船規格 §9.4）');
    // ── 模型 ──
    sh.models.forEach(function (m) {
      var mt = m.meta || {};
      if (mt.kind === 'gun' && !GUN_CODE[mt.gun]) add('error', '砲', m.path, 'meta gun=' + mt.gun + ' 不認得 ⇒ 默默當成長砲', 'gun 寫砲種表有的代碼（' + Object.keys(GUN_CODE).join('、') + '）');
      if (!mt.kind && GUNS[m.kind]) add('warn', '砲', m.path, '沒有 meta ⇒ 照名字認成 ' + m.kind, 'meta kind=gun, gun=<砲種>');
      if (!mt.kind && m.kind === 'wheel') add('warn', '舵輪', m.path, '沒有 meta ⇒ 照名字認', 'meta kind=wheel');
      if (m.kind === 'rudder' && !m.pts['stock-top']) add(isFinite(+mt.hinge_x) ? 'warn' : 'error', '舵', m.path, isFinite(+mt.hinge_x) ? '沒有固定點 stock-top ⇒ 沿鉸鏈軸找船尾（退路）' : '沒有 stock-top、也沒有 hinge meta ⇒ 往下找、開局就掉', '舵子作品登記固定點 stock-top（舵頭；造船規格 §9）');
      if (m.kind === 'yard' && !m.piv) add('error', '帆桁', m.path, '沒有固定點 pivot ⇒ 找不到掛在哪根桅', '帆桁子作品登記 pivot（造船規格 §5）');
      var sn = m.name.replace(/^.*yard-/, ''), hasSail = sh.sails.some(function (s) { return s.name === sn; });   // 沒掛帆的帆桁（crossjack、spritsail 常見）不用寫 sail
      if (m.kind === 'yard' && ((!mt.sail && hasSail) || (!mt.mast && !/bowsprit|艏斜桅/.test(m.path)))) add('warn', '帆桁', m.path, '帆桁 meta 少了 ' + [!mt.sail && hasSail && 'sail（有一面帆叫 ' + sn + '）', !mt.mast && 'mast'].filter(Boolean).join('、') + ' ⇒ 照名字配帆／桅', '帆桁 meta sail=<帆名>、mast=<桅>（造船規格 §9.1）');
      if (!m.alive && !GUNS[m.kind] && m.kind !== 'powder') add('error', '開場就掉', m.path, (mt.kind || m.kind) + ' 開場 ' + SC_SECS + ' 秒內就判成沒東西撐、掉了（腳 z ' + (m.foot >> 20) + '）', '把它接到實心上；掛著的（燈、舵）登記掛點固定點（bail、stock-top）');
    });
    // ── 錨（TASK-0601）：模型錨（meta kind=anchor）＋錨環 ring、船殼的錨鏈孔 hawse-P／S（造船規格 §9 anchor）──
    var AN = anchorsOf(sh);
    R.info.anchors = ['P', 'S'].map(function (k) { var a = AN[k]; return (k === 'P' ? '左' : '右') + (a.m ? '模型' + (a.m.pts.ring ? '＋ring' : '') : a.part ? '格子' : '無') + (a.hw ? '＋hawse' : ''); }).join('、');
    ['P', 'S'].forEach(function (k) {
      var a = AN[k];
      if (a.m && !a.m.pts.ring) add('warn', '錨', a.m.path, '模型錨沒有固定點 ring ⇒ 鐵鍊接在模型頂的中心', '錨子作品登記 ring（造船規格 §9 anchor；共用錨元件已經有）');
      else if (a.part) add('warn', '錨', a.part.path, '錨是關聯（格子）、不是模型 ⇒ 拋下去時船上那團格子不動、鍊尾另外畫一個簡單的錨', '換成共用錨元件（外部模型、meta kind=anchor）');
      else if (!a.m) add('warn', '錨', k === 'P' ? '左舷' : '右舷', '這一舷找不到錨（沒有 meta kind=anchor 的模型、也沒有名字有「錨」的關聯）⇒ 從船頭附近拋、鍊尾畫簡單的錨', '放共用錨元件（造船規格 §9 anchor）');
      if (!a.hw) add('warn', '錨鏈孔', '船殼', '沒有固定點 hawse-' + k + ' ⇒ 鐵鍊從錨那一點出來、船繞錨那一點被拴住', '船殼登記 hawse-P／S（造船規格 §9 anchor）');
    });
    // ── 材質（TASK-0616）：全船預設＋關聯 meta material；材質表沒有的 ID ⇒ 照全船預設 ──
    R.info.materials = matSummary(T).map(function (m) { return (m.def ? '全船預設 ' : '') + m.name + '（' + m.id + '）' + m.voxels.toLocaleString('en') + ' 格、' + m.t + ' 噸'; }).join('；');
    T.matBad.forEach(function (id) { add('warn', '材質', id, '材質表沒有這個 ID ⇒ 照全船預設 ' + T.mat0, '後台的材質表加這一種，或把關聯 meta material 改成材質表有的 ID（造船規格 §9.5）'); });
    sh.guns.forEach(function (g) { if (!g.alive) add('error', '開場就掉', g.name, '砲開場 ' + SC_SECS + ' 秒內就沒了', '砲腳下要有甲板'); });
    // ── 砲班站位（三叉戟號船頭：砲靠太近、站位互佔 ⇒ 站不滿；Tim 2026-10-15）──
    var shortN = 0, shortG = 0;
    sh.guns.forEach(function (g) {
      var got = (g.spots || []).length; if (got >= g.crewFull) return;
      shortG++; shortN += g.crewFull - got;
      var d = gunDeck(g), near = null, nd = 1e9;
      sh.guns.forEach(function (o) { if (o === g || gunDeck(o) !== d || o.side !== g.side) return; var dd = Math.abs(o.model.c[0] - g.model.c[0]); if (dd < nd) { nd = dd; near = o; } });
      add(got < g.crewMin ? 'error' : 'warn', '砲班站不滿', g.name, g.type + ' 站得到 ' + got + '／' + g.crewFull + ' 人' + (got < g.crewMin ? '（少於開得動的 ' + g.crewMin + ' 人）' : '') + '，' + d + ' ' + g.side + ' 舷' +
        (near ? '；同一層同一舷最近的砲 ' + near.name.split('/').pop() + ' 隔 ' + (nd * S).toFixed(2) + ' m' : ''), '砲旁邊（砲尾兩側與後方）留出站位：拉開砲距、或少放一門；旁邊的模型別佔站位');
    });
    R.info.gunShort = { guns: shortG, people: shortN };
    (sh.crewShort || []).forEach(function (r) { if (r[3] !== 'guns') add('warn', '站不下', r[0], r[0] + ' 站得到 ' + r[2] + '／' + r[1], r[3] === 'marines' ? '遊戲那側調 geo.marines（陸戰隊站的範圍）或船員配置' : '遊戲那側調船員配置，或甲板上留出站位'); });
    // ── 甲板、梯子、艙房 ──
    if (NV) {
      NV.levels.forEach(function (L, li) {
        if (!L.deck) add('warn', '甲板', L.key + ' ' + L.name, '沒有 meta kind=deck ⇒ 照高度量', '甲板的關聯 meta kind=deck（level、name、floor、thick；造船規格 §9.3）');
        if (NV.reach.indexOf(li) < 0) add('warn', '甲板', L.key + ' ' + L.name, '沒有梯子通到 ⇒ 預備水手、傷員到不了', '加梯子（kind=ladders 四個點），或梯子 meta <梯名>.decks 指定兩層');
      });
      NV.ladders.forEach(function (L) { if (L.broken) add('error', '梯子', L.name, '開場就是斷的（踏板或兩頭的走路點不能站）', '對 foot／lo／hi／head 四個點（踩的那一格空氣）'); });
      if (!NV.ladders.length && NV.levels.length > 1) add('warn', '梯子', '—', '有 ' + NV.levels.length + ' 層甲板、沒有梯子', 'kind=ladders');
    }
    (T.roomsBad || []).forEach(function (b) { add('error', '艙房', b, '艙房標得不對', 'rooms.py check（造船規格 §9.2）'); });
    (sh.medSkip || []).forEach(function (s) { add('warn', '醫療艙', s.name, s.why, '房間所在的甲板要有梯子通到'); });
    // ── 繩、帆 ──
    float0.forEach(function (f) { add('error', '繩', f, '開場那一刻就浮空', '繩端綁到實心或 model: 路徑（造船規格 §6）'); });
    var noMeta = sh.sails.filter(function (s) { return !s.meta || !s.meta.kind; }).map(function (s) { return s.name; });
    if (noMeta.length) add('warn', '帆', noMeta.join('、'), '沒有 meta ⇒ 照名字判斷（帆的種類、旗、收帆順序）', 'work sub=meta part=sail（造船規格 §9.1）');
    var ownSails = sh.sails.filter(function (s) { return !(s.meta && s.meta.team); }).length;   // 陣營旗不算
    if (!sh.masts.length && ownSails) add('warn', '桅', '—', '有帆、找不到桅（帆桁 meta mast）', '帆桁 meta mast=fore｜main｜mizzen');   // 沒有帆的蒸汽船（維吉尼亞號）本來就沒有桅
    if (!ownSails && !(+sh.cfg.base > 0)) add('warn', '動力', '—', '沒有帆、也沒有額外動力 ⇒ 船不會動', '設定檔 ships[].cfg.base（額外動力，節）');
    // ── 煙囪（meta kind=funnel、固定點 smoke；78_funnel.js）──
    R.info.funnels = funnelsOf(T).length;
    funnelsOf(T).forEach(function (f) { if (!f.pt) add('warn', '煙囪', f.name, '沒有固定點 smoke ⇒ 從外框頂面的中心冒煙', '煙囪子作品登記固定點 smoke（煙囪口的中心；造船規格 §9）'); });
    if (!sh.mags.length) add('warn', '彈藥庫', '—', '沒有 kind=magazine ⇒ 不會殉爆、送藥手照預設取用點', '彈藥庫的關聯 meta kind=magazine, powder_lb（造船規格 §8）');
    R.issues.sort(function (a, b) { return (a.lv === 'error' ? 0 : 1) - (b.lv === 'error' ? 0 : 1); });
    done();
  }).catch(function (e) { add('error', '載入', id, String(e && e.message || e), '—'); done(); });
}

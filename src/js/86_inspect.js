// ───────────────────────── 船隻觀察（TASK-0776；Tim 2026-10-21） ─────────────────────────
// Tim：「是否可以加一個船隻觀察頁面 可以切換剖視圖 & 甲板 作為一種模式(參考 建造 航海)」「然後觀察頁面要可以顯示船上各個部件名稱(額外UI) 勾選後會高量該部件(我想查看抽水機)」。
// 玩法 observe（04_modes.js：只有我艦、不判勝負、停在原地、開砲轉舵的鍵不作用；剖面、甲板、透視的鍵照樣作用，71_ctrl.js）
//   ⇒ 開局（70_flow.js startSteps）inspEnter 打開右邊的觀察面板（#inspP）：
//   · 剖面（74_cutaway.js CUTV.half）、透視（72_floodui.js FLX3）兩個開關；甲板：全部／拿掉到第 k 層／只剩船底（CUTV.deck，層名照 deckCut）
//     —— 跟 Z、X、L 同一份狀態（按鍵切了，面板的鈕照著亮：inspFrame 比對 inspSig）。
//   · 部件：我艦的模型（sh.models）照種類分組 —— 名字：道具 ＝ furniture 的名字（抽水機、病床…）、砲 ＝ 砲種表、其他 ＝ meta 規格表（config/meta_kinds.json）的 name，
//     沒有就寫 kind；每組寫件數，展開看每一件（名字 ＝ 路徑的最後一段）。勾一組或一件 ⇒ 那幾件高亮（inspHiDraw）；勾的不多（INSP_LBL 件以內）⇒ 每一件在畫面上掛名字（#inspL）。
// 高亮（60_render.js render，透明的都畫完之後）：同一份網格、單色、半透明，兩層 —— 先一層不做深度測試的淡色（隔著船殼、甲板看得到），
//   再一層做深度測試的（看得到的那幾面更亮）；亮度跟著時間慢慢呼吸（找得到在哪）。只動畫面：不改模擬、不抽 rnd()。
// 別的玩法 INSP.on false ⇒ inspHiDraw／inspFrame 第一行就回、面板藏起來。
var INSP = { on: false, hi: new Set(), min: false, sig: '', lbl: [] }, INSP_LBL = 24, INSP_C = [1, 0.8, 0.15];
/** 一件模型的種類名字（分組用）。 */
function inspName(m) {
  if (m.kind === 'furn' && FURN[m.item]) return FURN[m.item].name;
  if (GUNS[m.kind]) return GUNS[m.kind].name;
  var mk = (m.meta || {}).kind || m.kind, K = META_KINDS[mk] || META_KINDS[m.kind];
  return K && K.name ? K.name : mk ? String(mk) : '（沒有 meta）';
}
/** 我艦的部件照種類分組：[{ name, list: [模型…] }]，照名字排。 */
function inspGroups(sh) {
  var G = {}, L = [];
  sh.models.forEach(function (m) { var n = inspName(m); if (!G[n]) L.push(G[n] = { name: n, list: [] }); G[n].list.push(m); });
  return L.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hant'); });
}
/** 開局（70_flow.js startSteps，bldEnter 之後）：觀察玩法 ⇒ 面板打開、高亮清空；別的玩法 ⇒ 收起來。 */
function inspEnter() {
  INSP.on = !!modeRule('observe') && !!SHIPS[PLAYER_I]; INSP.hi.clear(); INSP.sig = '';
  if (INSP.on && INSP.min0 === undefined) INSP.min = INSP.min0 = !!(window.matchMedia && matchMedia('(max-width: 640px)').matches);   // 窄螢幕第一次進來先收起來（面板會蓋掉船）；之後照玩家按的
  $('inspP').style.display = INSP.on ? '' : 'none'; inspLabels(null);
  if (INSP.on) { inspUI(); note(SHIPS[PLAYER_I], '船隻觀察：右邊的面板切剖面、甲板、透視；勾部件 ⇒ 船上那幾件會亮（隔著船殼也看得到）'); }
}
/** 甲板那幾顆的字：0 全部、k 拿掉到第 k 層、n 只剩船底（74_cutaway.js deckLabel 同一套名字）。 */
function inspDeckName(D, k) { return !k ? '全部' : k >= D.n ? '只剩船底' : '拿掉到' + D.names[k - 1]; }
/** 面板整個重畫（開局、勾選、切換之後）。 */
function inspUI() {
  var sh = SHIPS[PLAYER_I], box = $('inspP'); if (!INSP.on || !sh) return;
  var D = deckCut(sh), h = '<div id="inspH"><b>🔍 ' + sh.T.name + '</b><button id="inspM">' + (INSP.min ? '展開' : '收起') + '</button></div><div id="inspB">';
  h += '<div class="row"><button data-v="cut">✂ 剖面（' + keyName('cut') + '）</button><button data-v="xray">🔍 透視（' + keyName('xray') + '）</button></div>';
  h += '<div class="lab">☰ 甲板（' + keyName('deck') + '）</div><div class="row">';
  for (var k = 0; k <= D.n; k++) h += '<button data-d="' + k + '">' + inspDeckName(D, k) + '</button>';
  h += '</div><div class="lab">部件（勾了就亮）<button id="inspC">全部取消</button></div>';
  inspGroups(sh).forEach(function (g, gi) {
    var on = g.list.filter(function (m) { return INSP.hi.has(m); }).length, dead = g.list.filter(function (m) { return !m.alive; }).length;
    h += '<details' + (on && on < g.list.length ? ' open' : '') + '><summary><label><input type="checkbox" data-g="' + gi + '"' + (on === g.list.length ? ' checked' : '') + '> ' + g.name + ' <i>× ' + g.list.length + (dead ? '（' + dead + ' 件沒了）' : '') + '</i></label></summary>';
    g.list.forEach(function (m, mi) { h += '<label class="it"><input type="checkbox" data-g="' + gi + '" data-m="' + mi + '"' + (INSP.hi.has(m) ? ' checked' : '') + (m.alive ? '' : ' disabled') + '> ' + String(m.name || m.path).split('/').pop() + '</label>'; });
    h += '</details>';
  });
  box.innerHTML = h + '</div>'; box.classList.toggle('min', INSP.min);
  var GL = inspGroups(sh);
  $('inspM').onclick = function () { INSP.min = !INSP.min; inspUI(); };
  $('inspC').onclick = function () { INSP.hi.clear(); inspUI(); };
  [].forEach.call(box.querySelectorAll('[data-v]'), function (b) { b.onclick = function () { if (b.dataset.v === 'cut') cutToggle(); else xrayToggle(); inspSync(); }; });
  [].forEach.call(box.querySelectorAll('[data-d]'), function (b) { b.onclick = function () { CUTV.deck = +b.dataset.d; obsNote(CUTV.deck ? '☰ ' + inspDeckName(D, CUTV.deck) : '☰ 甲板：全部回來'); frzShow(); inspSync(); }; });
  [].forEach.call(box.querySelectorAll('input[type=checkbox]'), function (c) {
    c.onclick = function (ev) { ev.stopPropagation(); };                // ⛔ 不擋 ⇒ 點組的勾選框也會開合 <details>
    c.onchange = function () {
      var g = GL[+c.dataset.g]; if (!g) return;
      var L = c.dataset.m !== undefined ? [g.list[+c.dataset.m]] : g.list.filter(function (m) { return m.alive; });
      L.forEach(function (m) { if (c.checked) INSP.hi.add(m); else INSP.hi.delete(m); });
      inspUI();
    };
  });
  INSP.sig = ''; inspSync();
}
/** 開關、甲板那幾顆的亮暗照現在的狀態（按 Z、X、L 也會變 ⇒ 每一格比一次，變了才改）。 */
function inspSig() { return (CUTV.half ? 1 : 0) + ',' + (FLX3 ? 1 : 0) + ',' + CUTV.deck; }
function inspSync() {
  var s = inspSig(), box = $('inspP'); if (s === INSP.sig) return; INSP.sig = s;
  [].forEach.call(box.querySelectorAll('[data-v]'), function (b) { b.classList.toggle('on', b.dataset.v === 'cut' ? CUTV.half : FLX3); });
  [].forEach.call(box.querySelectorAll('[data-d]'), function (b) { b.classList.toggle('on', +b.dataset.d === CUTV.deck); });
}
/** 每一格畫面（71_ctrl.js 的 inspect 控制器）：面板的開關跟著鍵、勾了的部件掛名字。 */
function inspFrame() {
  if (!INSP.on) return;
  inspSync();
  var sh = SHIPS[PLAYER_I], L = []; if (!sh) return;
  if (INSP.hi.size && INSP.hi.size <= INSP_LBL) INSP.hi.forEach(function (m) { if (m.alive) L.push(m); });
  inspLabels(L.length ? { sh: sh, list: L } : null);
}
/** 勾了的部件掛名字（#inspL，固定在畫面上的一層 div）：中心（格座標）× 船的矩陣 × 鏡頭 ⇒ 畫面座標；在鏡頭後面 ⇒ 不掛。o ＝ null ⇒ 全收。 */
function inspLabels(o) {
  var box = $('inspL'); if (!box) return;
  var n = o ? o.list.length : 0;
  while (INSP.lbl.length < n) { var d = document.createElement('div'); box.appendChild(d); INSP.lbl.push(d); }
  for (var i = n; i < INSP.lbl.length; i++) INSP.lbl[i].style.display = 'none';
  var r = cv.getBoundingClientRect(), q = CAM.vp;
  if (n && !q) { for (var j = 0; j < n; j++) INSP.lbl[j].style.display = 'none'; return; }   // 開局第一格：控制器的 frame 在 camUpdate 之前跑，鏡頭矩陣還沒有
  if (!n) return;
  o.list.forEach(function (m, i) {
    var el = INSP.lbl[i], c = m.c, w = M4.pt(o.sh.M, c[0], c[1], c[2] + (m.bb ? (m.bb[5] - m.bb[2]) / 2 : 0)), cw = q[3] * w[0] + q[7] * w[1] + q[11] * w[2] + q[15];
    if (cw <= 0.1) { el.style.display = 'none'; return; }
    var p = M4.pt(q, w[0], w[1], w[2]), x = r.left + (p[0] / cw + 1) / 2 * r.width, y = r.top + (1 - p[1] / cw) / 2 * r.height;
    if (x < r.left - 40 || x > r.right + 40 || y < r.top - 20 || y > r.bottom + 20) { el.style.display = 'none'; return; }
    var t = String(m.name || m.path).split('/').pop(); if (el.textContent !== t) el.textContent = t;
    el.style.display = ''; el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
  });
}
/** 高亮（60_render.js render：玻璃、城裡的燈之後；混色已開）：見檔頭。沒勾 ⇒ 一行就回。 */
function inspHiDraw() {
  if (!INSP.on || !INSP.hi.size) return;
  var sh = SHIPS[PLAYER_I]; if (!sh) return;
  var P2 = P.hi || (P.hi = VK.compile(gl, '#version 300 es\nlayout(location=0) in vec3 aP; uniform mat4 uModel,uVP; void main(){ gl_Position=uVP*(uModel*vec4(aP,1.0)); }\n',
    '#version 300 es\nprecision mediump float; uniform vec4 uC; out vec4 o; void main(){ o=uC; }\n'));
  var cull = gl.isEnabled(gl.CULL_FACE), k = 0.5 + 0.5 * Math.sin(performance.now() / 320);
  gl.useProgram(P2.prog); setCommon(P2); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE);
  [[false, 0.18 + 0.12 * k], [true, 0.3 + 0.2 * k]].forEach(function (pass) {
    if (pass[0]) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    gl.uniform4f(P2.u.uC, INSP_C[0], INSP_C[1], INSP_C[2], pass[1]);
    INSP.hi.forEach(function (m) {
      var me = sh.T.meshes[m.mesh]; if (!m.alive || !me) return; if (!me.vao) meshGpu(me);
      gl.uniformMatrix4fv(P2.u.uModel, false, modelWorld(sh, m, function () { var dv = m.ancD || m.vsl; return M4.mul(sh.M, dv ? M4.mul(trans(dv[0], dv[1], dv[2]), modelLocal(m)) : modelLocal(m)); }));   // 跟 drawModels 同一個擺法（同一格已經算過 ⇒ 直接拿）
      gl.bindVertexArray(me.vao); gl.drawArrays(gl.TRIANGLES, 0, me.n);
    });
  });
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); if (cull) gl.enable(gl.CULL_FACE);
}

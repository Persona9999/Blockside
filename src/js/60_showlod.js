// ───────────────────────── 表演船遠近分級（TASK-1104；總單 TASK-1100 第 4 期）─────────────────────────
// 表演船（58_traffic.js trafficShow：往來的船、還沒變成真的船）照離鏡頭的水平距離分級：近 原模、中 低模（0.4 m 一塊）、遠 八方向貼圖。
// 距離表（Tim 2026-10-29「交給你判斷 這部分之後可能要看情況調整(看畫面表現)」；erina 定，理由寫在 TASK-1104）：
//   近→中 SHOWLOD.L.n 公尺、不乘倍率；中→遠 SHOWLOD.L.f × 倍率 lk（同建築：格子長、寬、高最大的那一邊 ÷ 24 m，限 1～4）。常數只放這一處，?debug=1 下 __game.showlod({ n, f }) 即時調。
//   距離 ＝ 鏡頭到船格子中心的水平距離；每格照船現在的位置分一次（船會動 ⇒ 不走建築「鏡頭移動 8 m 才重新分組」那一條），陰影、反射、主畫面三趟照同一份（SHOWLOD.lv）。
// 中那一級（烘好的，ships/showlod.js；admin.py showlod 跑成品的 ?showlodbake=<船型> 烘）：
//   船殼格 ＋ 烘那一刻不會動的模型與裝飾（體素化：三角形每半格取一點、往法線反方向四分之一格那一格）⇒ 4×4×4 併成一塊：
//   64 格裡滿 SHOWLOD_FILL 格算有東西、顏色取最多的那一色（同 Blocksail tools/townmodels.py downsample；船只讓從外面看得到的格投票：六個軸向掃進來第一個碰到的格）；
//   ⚠ 船是空心的（船殼板一兩格厚）⇒ 從外面灌空氣（一塊 64 格全空才通），灌不到的空塊算船裡 ⇒ 實心；貼著船裡的塊不管滿幾格都留 ⇒ 斜的船殼板不破洞。
//   遊戲讀進來網格化一次（VoxelKit RegionSet，同船殼的格式）⇒ P.vox 原樣畫，uModel ＝ sh.M × 平移 off × 縮放 4（vL 變成 0.4 m 一格：每格明暗、格邊都照大塊；光照、霧、陰影同一套）。
//   帆、繩、旗、船員、會動的模型（帆桁、吊著的小艇、門、砲塔、錨、燈、迴旋砲、螺旋槳）、裝甲照舊畫；平滑面、玻璃、烘進去的模型與裝飾不畫（rbatShip、glsDraw 跳過）。
//   烘進去的模型這一格不是純平移（門開了、砲縮進去、錨拋下去）⇒ 照舊畫（低模裡那一份是烘的樣子；160 m 外看不出來）。
// 遠那一級（同一個檔、同一頁烘；照城鎮建築的貼圖 63_towns.js TOWN_BB：八個方向先拍好、取最接近視線的那一張、看板只繞垂直軸轉）：
//   船的帆只有遊戲生得出來 ⇒ 烘頁用遊戲自己的著色器拍（船殼、模型、旗、繩、帆；不拍船員）：正交、從船格子中心的垂直軸往外 φk ＝ k·45°（船的格座標 x、y 平面）往裡看，
//   兩套帆（SHOWLOD_IM.sets：全收、戰鬥帆）⇒ 一型一張 8 × 2 格的圖（每公尺 SHOWLOD_IM.ppm ÷ lk 像素，先拍 ss 倍再平均；透明的像素塗上旁邊的色 ⇒ 縮小時不帶黑邊）。
//   光：烘的那一刻固定（陰影、霧、點光源關掉，陽光 1）⇒ 遊戲裡同城鎮的貼圖 × (0.62 ＋ 0.38 × 陽光) × 夜晚的倍數（todBakeK）、再上霧。
//   遠那一級整艘只畫一張看板：船殼、模型、帆、繩、旗、船員、玻璃都不畫（rbatShip 整艘跳過、viewVis 清掉這艘的位 ⇒ 主畫面、反射都不畫）、不投影（csmOwners）、不給海面遮罩（gpuSlots）；
//   看板的底在船格子中心那條軸上貼圖最下面那一格的高度、照船的矩陣走（橫搖、縱搖不跟）；燈的光暈、船窗的光點、水花照舊。帆照船現在的帆段（0 全收、其他 ⇒ 戰鬥帆那一套）。
//   貼圖還沒解好、著色器還沒編好、鏡頭外剔除關著（RBAT.cull）⇒ 那一格照中那一級畫（讀數 farMid）。
// 近↔中交接帶（L.n ± L.nb，不乘倍率；同建築 TOWN_FADE 那一套：同一個抖動、兩級互補 ⇒ 同一個像素只有一級）：交接帶裡的船記成第 3 級，
//   畫法照近那一級（rbatShip 整份、陰影、玻璃都照近），主畫面與反射多兩樣：原模船殼與烘進低模的模型、裝飾、平滑面照 t 淡出，低模照 t 淡入（t ＝ smoothstep(n − nb, n + nb, 距離)）；
//   帆、繩、旗、船員、會動的模型兩級本來就一樣 ⇒ 照畫一次。淡出淡入是著色器的 uShowD（01_gl.js SHOWD_GLSL；P.vox、P.tri 有，陰影那幾支沒有 ⇒ 陰影照近那一級整份）。
//   模型那一段：rbatColour 不把交接帶的船放進跨船合批（同鏡頭外那樣留組），另外照表一件一件用 P.tri 畫（showlodBandModels）；rbatReplay 照同一條判淡出。
// 中↔遠交接帶（L.f × lk ± L.fb × lk，同建築）：記成第 4 級，照中那一級畫（陰影、遮罩以外的照中），主畫面與反射裡這艘畫的每一樣（低模、模型、帆、繩、旗）照 t 淡出、看板照 t 淡入；
//   不給海面遮罩（同遠那一級：看板水面下那一截要被海蓋住）；船員到看板全滿才不畫（硬換，800 m 外看不出來）。
//   帆：⛔ 不改 P.sail 本身（SAIL_FS 多一個分支，編譯器排出來的指令就不一樣：戰鬥模式 render_lab ports_high 106 像素差 1）⇒ 交接帶的船另外用淡出的分身畫（showlodBandSails：
//   P.sail 與循環布 11_rig_loop.js floopFxProg 各一支，原始碼照抄再插 SHOWD_GLSL；還沒編好 ⇒ 照原本那支畫、不淡出）。船殼、模型的 P.vox、P.tri 直接帶 uShowD（戰鬥模式逐位元相同）。
// 不分級（照原模畫，讀數記在 none）：不是表演船（我艦、敵對了的、被打過的 npc.real）、格子被打掉過（grid.ver ≠ 0）、那一型沒烘或指紋對不上。
// 指紋：config/vxk_lock.json 那一型的 c:（成品 blockside-src 的 files 記前 12 碼）＋ SHOWLOD_V（算法改了就加一）⇒ 對不上那一型不分級（照原模，不會畫錯）。
// 開關：?showlod=0（或 ?rb=0）⇒ 跟改前一樣；?debug=1 下 __game.showlod(false／true)。⛔ 只動畫面：不讀寫模擬的狀態、不抽 rnd()、不改 SHIPS 的順序。
var SHOWLOD_V = 3, SHOWLOD_K = 4, SHOWLOD_FILL = 12, SHOWLOD_LK = 24;
var SHOWLOD_IM = { ppm: 2, pmin: 0.5, ss: 2, dirs: 8, sets: [0, 2] };   // 遠那一級的貼圖：每公尺幾像素（÷ 倍率 lk、取到 0.25、最少 pmin：800 m × lk 的地方 1440 p 畫面一像素約 0.54 m × lk）、先拍幾倍再平均、幾個方向、哪兩套帆段（31_sailing.js SAILSETS：全收、戰鬥帆）
var SHOWLOD = {
  on: RBAT_ON && Q.get('showlod') !== '0',
  L: { n: 160, nb: 24, f: 800, fb: 60 },                               // 距離表（公尺）：n 近→中、f 中→遠（× lk）；nb、fb 交接帶的半寬（nb 不乘 lk、fb × lk；見檔頭）
  st: 0, err: null, raw: null,                                           // 檔：0 還沒要、1 在載、2 好了、3 載不到（err）；raw ＝ 檔裡每一型還沒解的那一份
  T: {},                                                                 // 船型 id ⇒ { rs, L（off、縮放 4 的局部矩陣）, lk, mk、dk（烘進去的模型、裝飾序號：1）, quads, im（遠那一級：貼圖與尺寸；沒烘 ⇒ null） } ／ null（沒有、對不上）／ 'busy'（在解）
  lv: new Uint8Array(16), Mm: new Float32Array(256), B: new Float32Array(192),   // 這一格第 o 艘畫哪一級（0 近、1 中、2 遠、3 近↔中交接帶、4 中↔遠交接帶）、中那一級的矩陣（Mm[o·16 …]；交接帶也有）、遠那一級的看板（B[o·12 …]：底的中心、高；右 × 寬；貼圖的 u0、v0、寬、高）
  fd: new Float32Array(16),                                              // 交接帶的 t（第 o 艘；0 ＝ 全是前一級 → 1 ＝ 全是後一級）
  prog: null, vao: null,                                                 // 遠那一級的著色器（glProgTry：編好之前照中那一級畫）、看板的四邊形
  stat: { f: -1, near: 0, band: 0, mid: 0, farBand: 0, far: 0, farMid: 0, none: 0, quads: 0, ms: 0 }
};
/** 一型的倍率：格子長、寬、高最大的那一邊（公尺）÷ 24，限 1～4（同建築 63_towns.js 的 lk）。 */
function showlodLk(G) { return clamp(Math.max(G.sx, G.sy, G.sz) * S / SHOWLOD_LK, 1, 4); }
/** 這一格的模型這一刻是不是純平移（rbatModelL 的最後那一條、沒有只給畫面的位移）。 */
function showlodPlain(m) { return !(m.swM || m.sw || (m.spinB && m.spinB.mt) || (m.rot && m.piv) || m.hd || m.ancD || m.vsl || m.vpre || m.gsl); }
/** 這一型的成品指紋（blockside-src 記的 'lock c:…'）＋ 算法版本；讀不到 ⇒ null。 */
function showlodFp(id) {
  var c = CFG.ships.filter(function (s) { return s.id === id; })[0];
  if (!c || !c.vxk) return null;
  if (SHOWLOD.src === undefined) { try { SHOWLOD.src = JSON.parse(document.getElementById('blockside-src').textContent).files; } catch (e) { SHOWLOD.src = null; } }
  var f = SHOWLOD.src && SHOWLOD.src['VoxelKit/_cache/' + c.vxk];
  return f ? SHOWLOD_V + ' ' + f : null;
}
/** 第一艘表演船出現 ⇒ 載 ships/showlod.js（同 flagloop.js：<script>，成品不准 fetch）。 */
function showlodNeed() {
  var D = SHOWLOD; if (D.st) return;
  D.st = 1;
  function fail(e) { D.st = 3; D.err = String(e && e.message || e); }
  try {
    var s = document.createElement('script'); s.src = ((window.BS_SHELL && window.BS_SHELL.ships) || '') + 'ships/showlod.js';
    s.onload = function () { var o = window.BS_SHOWLOD; window.BS_SHOWLOD = null; if (!o || !o.types) { fail('ships/showlod.js 裡沒有資料'); return; } D.raw = o.types; D.st = 2; };
    s.onerror = function () { fail('載不到 ' + s.src); };
    document.head.appendChild(s);
  } catch (e) { fail(e); }
}
/** 第一次用到這一型 ⇒ 解開（非同步）、建格子、網格化；這一格先不分級。 */
function showlodType(T) {
  var D = SHOWLOD, id = T.id, t = D.T[id];
  if (t !== undefined) return t && t !== 'busy' ? t : null;
  if (D.st !== 2) return null;
  var r = D.raw && D.raw[id];
  if (!r || r.fp !== showlodFp(id)) { D.T[id] = null; return null; }      // 沒烘、指紋對不上（作品重新匯入過、算法改過）⇒ 這一型不分級
  D.T[id] = 'busy';
  Promise.all([VK.inflateRaw(VK.b64ToBytes(r.b64)), r.im ? VK.inflateRaw(VK.b64ToBytes(r.im.b64)) : null]).then(function (A) {
    var u = A[0], n = r.n, G = new VK.Grid(n), x, y, z, i = 0;
    for (z = 0; z < n[2]; z++) for (y = 0; y < n[1]; y++) for (x = 0; x < n[0]; x++, i++) if (u[i]) G.set(x, y, z, u[i]);
    var rs = new VK.RegionSet(gl, G, QIDX); rs.buildAll();
    var L = new Float32Array([SHOWLOD_K, 0, 0, 0, 0, SHOWLOD_K, 0, 0, 0, 0, SHOWLOD_K, 0, r.off[0], r.off[1], r.off[2], 1]);
    var mk = new Uint8Array((r.mk.length ? Math.max.apply(null, r.mk) : 0) + 1), dk = new Uint8Array((r.dk.length ? Math.max.apply(null, r.dk) : 0) + 1);
    r.mk.forEach(function (k) { mk[k] = 1; }); r.dk.forEach(function (k) { dk[k] = 1; });
    D.T[id] = { rs: rs, L: L, lk: showlodLk(T.hullG || T.base), mk: mk, dk: dk, quads: rs.quads(), im: A[1] ? showlodTex(r.im, A[1]) : null };
  }).catch(function (e) { D.T[id] = null; D.err = id + '：' + String(e && e.message || e); });
  return null;
}
/** 這一格每艘畫哪一級（frameBegin：rbatPrep 之前；鏡頭、內插過的 sh.M 都定了）。 */
function showlodPrep() {
  var D = SHOWLOD, ns = DRAWN.length, st = D.stat, eye = CAM.eye, t0 = performance.now(), o;
  if (D.lv.length < ns) { D.lv = new Uint8Array(ns * 2); D.Mm = new Float32Array(ns * 32); D.B = new Float32Array(ns * 24); D.fd = new Float32Array(ns * 2); }
  st.f = RFR; st.near = st.band = st.mid = st.farBand = st.far = st.farMid = st.none = st.quads = 0;
  var fp = null;                                                         // 遠那一級的著色器：第一艘要用時才送出編譯（編好之前照中那一級）
  for (o = 0; o < ns; o++) {
    var sh = DRAWN[o]; D.lv[o] = 0;
    if (sh.sink > 40) continue;
    if (!D.on || !eye || !trafficShow(sh) || sh.grid.ver !== 0) { st.none++; continue; }
    if (!D.st) showlodNeed();
    var t = showlodType(sh.T); if (!t) { st.none++; continue; }
    var M = sh.M, d = showlodDist(sh);
    if (d < D.L.n - D.L.nb) { st.near++; continue; }
    if (d < D.L.n + D.L.nb) { D.lv[o] = 3; D.fd[o] = showlodSmooth(D.L.n - D.L.nb, D.L.n + D.L.nb, d); m4Into(D.Mm, o * 16, M, t.L); st.quads += t.quads; st.band++; continue; }   // 近↔中交接帶（見檔頭）
    var F0 = (D.L.f - D.L.fb) * t.lk, F1 = (D.L.f + D.L.fb) * t.lk, far = d >= F0, ok = far && t.im && RBAT.cull && (fp || (fp = showlodFarProg()));
    if (ok && d >= F1) { D.lv[o] = 2; showlodFarSet(o, sh, t.im, eye); st.far++; continue; }
    D.lv[o] = 1; m4Into(D.Mm, o * 16, M, t.L); st.quads += t.quads;
    if (ok) { D.lv[o] = 4; D.fd[o] = showlodSmooth(F0, F1, d); showlodFarSet(o, sh, t.im, eye); st.farBand++; }   // 中↔遠交接帶（見檔頭）：低模那一份也要
    else if (far) st.farMid++; else st.mid++;                            // farMid：該畫貼圖、這一格還不行（見檔頭）⇒ 照中那一級
  }
  st.ms = performance.now() - t0;
}
/** 中↔遠交接帶（第 4 級）：程式有 uShowD（主畫面、反射）⇒ 這艘接下來畫的照 t 淡出，回 true（畫完叫 showlodFadeEnd）；陰影那幾支沒有 ⇒ false、照中那一級整份。 */
function showlodFadeOut(prog, o) {
  if (SHOWLOD.lv[o] !== 4 || !prog.u.uShowD) return false;
  gl.uniform2f(prog.u.uShowD, SHOWLOD.fd[o], 1); return true;
}
function showlodFadeEnd(prog) { gl.uniform2f(prog.u.uShowD, 0, 0); }
/** 帆的著色器插上交接帶的淡出（SHOWD_GLSL＋main 開頭 showCut）；對不到 main ⇒ null（照原本那支畫）。 */
function showlodDithFS(fs) { return fs.indexOf('void main(){') < 0 ? null : fs.replace('void main(){', SHOWD_GLSL + 'void main(){ if(showCut()) discard;'); }
/** drawSails（主畫面、反射）：中↔遠交接帶那幾艘的帆用淡出的分身畫（見檔頭）；畫完 prog 綁回去。 */
function showlodBandSails(prog, L, pd) {
  var D = SHOWLOD, bt = null, cur = null;
  if (!D.sail && !D.sailBad) { var fs = showlodDithFS(SAIL_FS); if (!fs) D.sailBad = true; else { try { D.sail = glProgTry(SAIL_VS, fs); } catch (e) { D.sailBad = true; } } }
  L.forEach(function (o) {
    var ow = DRAWN[o], fx = ow.fx && ow.sb.fxOn, p = fx ? floopFxProg(P.sail, true) || floopFxProg(P.sail) || prog : D.sail || prog;
    if (p !== cur) {
      gl.useProgram(p.prog); setCommon(p); cur = p; bt = null;
      if (p.u.uSailT) gl.uniform1i(p.u.uSailT, SAIL_UNIT); if (p.u.uFireT) gl.uniform1f(p.u.uFireT, BURN.sailBurn); if (fx && p !== prog) floopBind(p);
    }
    cutSet(p, ow); gl.uniformMatrix4fv(p.u.uModel, false, ow.M); if (fx && p !== prog) floopFxSet(p, ow);
    if (p.u.uShowD) gl.uniform2f(p.u.uShowD, D.fd[o], 1);
    var st = ow.T && ow.T.sailTexGL;
    if (!st || st !== bt) { gl.activeTexture(gl.TEXTURE0 + SAIL_UNIT); gl.bindTexture(gl.TEXTURE_2D, bt = sailTex(ow.T)); gl.activeTexture(gl.TEXTURE0); }
    gl.bindVertexArray(ow.sb.vao); gl.drawElements(gl.TRIANGLES, ow.sb.n, gl.UNSIGNED_INT, 0);
    if (p.u.uShowD) gl.uniform2f(p.u.uShowD, 0, 0);
  });
  gl.useProgram(prog.prog);
}
/** 這一格這艘不給海面遮罩（60_render.js gpuSlots）：遠那一級、中↔遠交接帶（看板水面下那一截要被海蓋住）。 */
function showlodNoMask(o) { var v = SHOWLOD.lv[o]; return v === 2 || v === 4; }
/** GLSL 的 smoothstep（a ≤ x ≤ b ⇒ 0～1 的 S 形）。 */
function showlodSmooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
/** drawHulls 的交接帶（第 3 級）：程式有 uShowD（主畫面、反射的 P.vox）⇒ 原模照 t 淡出（回 true：呼叫的人接著照原樣畫原模，再叫 showlodBandLow）；沒有（陰影）⇒ 回 false、照近那一級。 */
function showlodBandOut(prog, o) {
  if (SHOWLOD.lv[o] !== 3 || !prog.u.uShowD) return false;
  gl.uniform2f(prog.u.uShowD, SHOWLOD.fd[o], 1); return true;
}
/** 交接帶：原模畫完 ⇒ 低模照 t 淡入、uShowD 放回 0（裝甲在這之後照常畫：兩級都有）。 */
function showlodBandLow(prog, o, sh) {
  gl.uniform2f(prog.u.uShowD, SHOWLOD.fd[o], -1); showlodHull(prog, o, SHOWLOD.T[sh.T.id]);
  gl.uniform2f(prog.u.uShowD, 0, 0); cutSet(prog, sh); vlampSet(prog, sh);
}
/** 表裡第 i 項是不是烘進低模的那一份（同 rbatShip 中那一級跳過的那條：模型 mk 且這一刻純平移、裝飾 dk 且沒在轉、平滑面全部；裝甲的平滑面不是）。 */
function showlodBaked(t, i) {
  var R = RBAT, c = R.cls[i], k = R.slot[i], x = R.ref[i];
  return c === 2 || (c === 0 && !!t.mk[k] && showlodPlain(x)) || (c === 1 && !!t.dk[k] && !x.L);
}
/** rbatColour（主畫面、反射）：交接帶的船（第 3、4 級）沒進跨船合批 ⇒ 這裡照表一件一件用 P.tri 畫：第 3 級烘進低模的那幾件、第 4 級全部照 t 淡出（算式同 rbatReplay）。 */
function showlodBandModels(pd) {
  var D = SHOWLOD, R = RBAT, u = P.tri.u, b = pd.b, cs = R.cs, g = NaN, o, i, e;
  if (!D.stat.band && !D.stat.farBand) return;
  gl.useProgram(P.tri.prog); setCommon(P.tri); gl.uniform1f(u.uLit, 1); gl.vertexAttrib2f(3, 0, 0.5);
  for (o = 0; o < R.ns; o++) {
    var sh = R.own[o], lv = D.lv[o]; if (lv < 3 || sh.sink > 40 || (b && !(cs[o] & b))) continue;
    var t = D.T[sh.T.id], f = D.fd[o], on = -1; cutSet(P.tri, sh);
    for (i = R.i0[o], e = R.i0[o + 1]; i < e; i++) {
      var bk = lv === 4 || showlodBaked(t, i) ? 1 : 0;   // 4：中↔遠交接帶 ⇒ 這艘的模型全部淡出 if (bk !== on) gl.uniform2f(u.uShowD, f, on = bk);
      if (R.cls[i] < 2) { gl.uniformMatrix4fv(u.uModel, false, R.M, i * 16, 16); if (R.glow[i] !== g) gl.uniform1f(u.uGlow, g = R.glow[i]); gl.bindVertexArray(R.vao[i]); gl.drawArrays(gl.TRIANGLES, 0, R.cnt[i]); }
      else { if (!R.slot[i]) { gl.uniformMatrix4fv(u.uModel, false, R.M, i * 16, 16); if (g !== 0) gl.uniform1f(u.uGlow, g = 0); } gl.bindVertexArray(R.vao[i]); gl.drawElements(gl.TRIANGLES, R.cnt[i], gl.UNSIGNED_INT, R.off[i]); }
    }
  }
  gl.uniform2f(u.uShowD, 0, 0); gl.uniform1f(u.uGlow, 0); cutSet(P.tri, null);
}
/** 遠那一級的看板（第 o 艘，寫進 B[o·12 …]）：取最接近視線的那個方向（船的格座標 x、y 平面上 φk 那一邊，照船現在的矩陣換到世界、只看水平）、照帆段取那一列。 */
function showlodFarSet(o, sh, im, eye) {
  var M = sh.M, G = sh.grid, cx = G.sx / 2, cy = G.sy / 2, z0 = im.z0, B = SHOWLOD.B, b = o * 12, N = SHOWLOD_IM.dirs, k, bk = 0, bd = -2, bx = 1, bz = 0;
  var X = M[0] * cx + M[4] * cy + M[8] * z0 + M[12], Y = M[1] * cx + M[5] * cy + M[9] * z0 + M[13], Z = M[2] * cx + M[6] * cy + M[10] * z0 + M[14];
  var ex = eye[0] - X, ez = eye[2] - Z, el = Math.hypot(ex, ez) || 1;
  for (k = 0; k < N; k++) {
    var c = Math.cos(k * 2 * Math.PI / N), s = Math.sin(k * 2 * Math.PI / N), wx = M[0] * c + M[4] * s, wz = M[2] * c + M[6] * s, wl = Math.hypot(wx, wz) || 1, dt = (wx * ex + wz * ez) / (wl * el);
    if (dt > bd) { bd = dt; bk = k; bx = wx / wl; bz = wz / wl; }
  }
  var row = hasSails(sh) && sh.sailSet ? 1 : 0;                          // 帆段：0 全收那一列、其他 ⇒ 戰鬥帆那一列
  B[b] = X; B[b + 1] = Y; B[b + 2] = Z; B[b + 3] = im.hm;
  B[b + 4] = bz * im.wm; B[b + 5] = 0; B[b + 6] = -bx * im.wm; B[b + 7] = 0;   // 右 ＝ 往鏡頭那一邊 × 上（同烘頁的 lookAt；烘頁驗過方向）
  B[b + 8] = bk / N; B[b + 9] = row / 2; B[b + 10] = 1 / N; B[b + 11] = 0.5;
}
// 遠那一級的著色器：四邊形 aQ ∈ [−½, ½] × [0, 1]；uA ＝ (底的中心, 高)、uB ＝ (右 × 寬, —)、uU ＝ (u0, v0, u 寬, v 高)。光照同城鎮的貼圖（63_towns.js TOWN_BB_FS）。
var SHOWLOD_VS = '#version 300 es\nlayout(location=0) in vec2 aQ; uniform mat4 uVP; uniform vec4 uA, uB, uU; out vec2 vT; out vec3 vW;\n' +
  'void main(){ vec3 w=uA.xyz+uB.xyz*aQ.x+vec3(0.0,aQ.y*uA.w,0.0); vW=w; vT=vec2(uU.x+(aQ.x+0.5)*uU.z, uU.y+(1.0-aQ.y)*uU.w); gl_Position=uVP*vec4(w,1.0); }\n';
var SHOWLOD_FS = '#version 300 es\nprecision highp float;\n' + SHOWD_GLSL + 'uniform sampler2D uTex; uniform vec3 uEye,uFog,uBkK; uniform float uFogD,uSunK,uClip; in vec2 vT; in vec3 vW; out vec4 o;\n' +
  'void main(){ if(vW.y<uClip) discard; if(showCut()) discard; vec4 t=texture(uTex,vT); if(t.a<0.5) discard; vec3 col=t.rgb*(0.62+0.38*uSunK)*uBkK;\n' +
  ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
/** 遠那一級的著色器與四邊形（glProgTry：還沒編好回 null）。 */
function showlodFarProg() {
  var D = SHOWLOD; if (D.prog) return D.prog;
  var p = glProgTry(SHOWLOD_VS, SHOWLOD_FS); if (!p) return null;
  D.vao = gl.createVertexArray(); gl.bindVertexArray(D.vao);
  var q = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, q); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0); gl.bindVertexArray(null);
  return (D.prog = p);
}
/** 一型的貼圖（解開的 RGBA，8 × 2 格、第一列在上）⇒ { tex, wm（寬，公尺）, hm（高）, z0（底在船的格座標多高） }。 */
function showlodTex(im, px) {
  var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, im.cw * SHOWLOD_IM.dirs, im.ch * 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
  return { tex: t, wm: im.cw / im.ppm, hm: im.ch / im.ppm, z0: im.z0 };
}
/** 遠那一級與中↔遠交接帶（主畫面 mainOpaque 帆之後、反射 reflPass 船殼之後）：每艘一張看板（一次一個 drawArrays；遠的船不多）。 */
function showlodFarDraw() {
  var D = SHOWLOD; if ((!D.stat.far && !D.stat.farBand) || !D.prog) return;
  var p = D.prog, u = p.u, cf = gl.isEnabled(gl.CULL_FACE), bt = null;
  gl.useProgram(p.prog); setCommon(p); gl.disable(gl.CULL_FACE);
  gl.activeTexture(gl.TEXTURE11); gl.uniform1i(u.uTex, 11); gl.bindVertexArray(D.vao);
  for (var o = 0, ns = DRAWN.length; o < ns; o++) {
    var lv = D.lv[o]; if (lv !== 2 && lv !== 4) continue;
    var tx = D.T[DRAWN[o].T.id].im.tex; if (tx !== bt) gl.bindTexture(gl.TEXTURE_2D, bt = tx);
    gl.uniform2f(u.uShowD, lv === 4 ? D.fd[o] : 0, lv === 4 ? -1 : 0);   // 中↔遠交接帶：看板照 t 淡入
    gl.uniform4fv(u.uA, D.B, o * 12, 4); gl.uniform4fv(u.uB, D.B, o * 12 + 4, 4); gl.uniform4fv(u.uU, D.B, o * 12 + 8, 4);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0); if (cf) gl.enable(gl.CULL_FACE);
}
/** 鏡頭到船格子中心的水平距離（換級照它；63_shipwin.js 船窗的近↔中也照它）。 */
function showlodDist(sh) {
  var G = sh.grid, M = sh.M, cx = G.sx / 2, cy = G.sy / 2, cz = G.sz / 2, e = CAM.eye;
  return Math.hypot(M[0] * cx + M[4] * cy + M[8] * cz + M[12] - e[0], M[2] * cx + M[6] * cy + M[10] * cz + M[14] - e[2]);
}
/** 第 o 艘這一格畫中那一級 ⇒ 那一型的資料；不是 ⇒ null（rbatShip、drawHulls、glsDraw 照它跳過或換畫）。 */
function showlodMid(o, sh) { var v = SHOWLOD.lv[o]; return v === 1 || v === 4 ? SHOWLOD.T[sh.T.id] : null; }   // 4：中↔遠交接帶也照中那一級
/** drawHulls 的中那一級：低模（同一支 P.vox／P.dvox；不剖面、不給船殼上的燈）。中↔遠交接帶照 t 淡出（裝甲畫完呼叫的人 showlodFadeEnd）。 */
function showlodHull(prog, o, t) {
  cutSet(prog, null); vlampSet(prog, null); showlodFadeOut(prog, o);
  gl.uniformMatrix4fv(prog.u.uModel, false, SHOWLOD.Mm, o * 16, 16);
  t.rs.draw();
}

// ── 烘（?showlodbake=<船型>：admin.py showlod 用無頭 Chrome 跑成品、讀頁面上 id 是 showlod 的 pre）──
// 開一場（同 75_shipcheck.js：那一型跟憲法號擺在最遠的距離、還沒跑），拿第 0 艘（剛開場、沒被打過）的格子與模型烘。結果：
//   { id, fp, n：塊數 [x, y, z], off：第 0 塊在船格座標的哪一格（4 的倍數）, b64：每塊一個色碼（0 空；x 最快、再 y、再 z；未壓縮，admin.py 壓）,
//     mk、dk：烘進去的模型、裝飾序號, stat：{ cells 船殼格, mcells 模型格, kept／dropped（原本的格落在留下／丟掉的塊）, inner 灌不到的空塊, blocks 留下的塊, quads, ms } }
function showlodBakePage(id) {
  var R = { id: id };
  function done() { var pre = document.createElement('pre'); pre.id = 'showlod'; document.body.appendChild(pre); pre.textContent = JSON.stringify(R); uiAway(); window.__showlod = R; }
  Promise.all([loadHull(id), loadHull('constitution')]).then(function () {
    if (!hullInfo(id)) { R.err = '設定檔 ships 沒有這一型'; done(); return; }
    FLEET_DBG = [{ team: 'blue', hull: id }, { team: 'red', hull: 'constitution' }]; flowMode('eve'); DIST = LIM_DIST[1];
    WIND_FIX = { rot: 0, s0: 1 };
    reset();
    var o = showlodBake(SHIPS[0]); for (var k in o) R[k] = o[k];
    R.im = showlodShots(SHIPS[0]);                                       // 遠那一級的貼圖（拍完帆段、矩陣放回去）
    R.fp = showlodFp(id);
    done();
  }).catch(function (e) { R.err = String(e && e.stack || e); done(); });
}
/** 一艘（剛開場）⇒ 中那一級的塊（見上）。 */
function showlodBake(sh) {
  var t0 = performance.now(), T = sh.T, G = sh.grid, K = SHOWLOD_K, anc = (sh.anc || []).map(function (a) { return a.m; }), lo = [0, 0, 0], hi = [G.sx, G.sy, G.sz], i, j, k;
  // ① 哪幾個模型、裝飾烘進去（這一刻是純平移、不是會動的那幾種）＋ 它們的三角形（格座標）
  var parts = [], mk = [], dk = [];
  function take(tri, W) {
    for (i = 0; i < tri.length; i += 9) for (j = 0; j < 3; j++) { var v = W[j] * tri[i] + W[4 + j] * tri[i + 1] + W[8 + j] * tri[i + 2] + W[12 + j]; if (v < lo[j]) lo[j] = v; if (v > hi[j]) hi[j] = v; }
    parts.push({ tri: tri, W: W });
  }
  sh.models.forEach(function (m, k) {
    if (!m.alive || m.vox || m.hang || m.spinB || m.rot || m.piv || m.hd || isLamp(m) || anc.indexOf(m) >= 0 || kindProp(m.kind, 'anim') || !showlodPlain(m)) return;
    var mi = m.rmesh !== undefined ? m.rmesh : m.mesh, rm = T.rig.meshes[mi]; if (!rm || !T.meshes[mi]) return;
    mk.push(k); take(meshTriFor(T, mi, rm), trans(m.origin[0], m.origin[1], m.origin[2]));
  });
  (sh.decos || []).forEach(function (d, k) {
    var rm = T.rig.meshes[d.mesh]; if (!rm || !T.meshes[d.mesh] || d.gone || d.L || d.gm || (d.foot >= 0 && !hullGp(G, d.foot))) return;
    dk.push(k); take(meshTriFor(T, d.mesh, rm), trans(d.origin[0], d.origin[1], d.origin[2]));
  });
  // ② 範圍：船格 ∪ 模型，往外對齊到 4 的倍數、兩邊各多留一塊空的（灌空氣從外圈起）
  var off = [0, 1, 2].map(function (a) { return Math.floor(lo[a] / K) * K - K; }), n = [0, 1, 2].map(function (a) { return Math.ceil(hi[a] / K) + 2 - off[a] / K; });
  var NB = n[0] * n[1] * n[2], cnt = new Uint8Array(NB), F = new VK.Grid([n[0] * K, n[1] * K, n[2] * K]), st = { cells: 0, mcells: 0 };
  // ③ 細格：船殼照抄、模型的三角形每半格取一點（往法線反方向 0.25 格那一格；那一格已經有船殼 ⇒ 不蓋）
  G.each(function (x, y, z, c) { F.set(x - off[0], y - off[1], z - off[2], c); st.cells++; });
  parts.forEach(function (p) {
    var t = p.tri, W = p.W;
    for (i = 0; i < t.length; i += 27) {
      var A = [], c = rgb332(t[i + 6], t[i + 7], t[i + 8]);
      for (j = 0; j < 3; j++) { var q = i + j * 9; A.push([W[0] * t[q] + W[4] * t[q + 1] + W[8] * t[q + 2] + W[12], W[1] * t[q] + W[5] * t[q + 1] + W[9] * t[q + 2] + W[13], W[2] * t[q] + W[6] * t[q + 1] + W[10] * t[q + 2] + W[14]]); }
      var nr = [W[0] * t[i + 3] + W[4] * t[i + 4] + W[8] * t[i + 5], W[1] * t[i + 3] + W[5] * t[i + 4] + W[9] * t[i + 5], W[2] * t[i + 3] + W[6] * t[i + 4] + W[10] * t[i + 5]];
      var e1 = sub(A[1], A[0]), e2 = sub(A[2], A[0]), ns = Math.max(1, Math.ceil(Math.max(len(e1), len(e2), len(sub(e1, e2))) / 0.5));
      for (var a = 0; a <= ns; a++) for (var b = 0; b <= ns - a; b++) {
        var u = a / ns, w = b / ns, x = Math.floor(A[0][0] + e1[0] * u + e2[0] * w - nr[0] * 0.25) - off[0], y = Math.floor(A[0][1] + e1[1] * u + e2[1] * w - nr[1] * 0.25) - off[1], z = Math.floor(A[0][2] + e1[2] * u + e2[2] * w - nr[2] * 0.25) - off[2];
        if (!F.get(x, y, z) && F.set(x, y, z, c) === 0) st.mcells++;
      }
    }
  });
  // ④ 從外面看得到的格（V）：沿六個軸向從外面一條一條掃進來，第一個碰到的格 ⇒ 顏色只讓它們投票（船殼板一格厚、後面的甲板、肋材不搶顏色）
  var FX = F.sx, FY = F.sy, FZ = F.sz, V = new VK.Grid([FX, FY, FZ]), a0, a1, s;
  function ray(x, y, z, dx, dy, dz) { while (x >= 0 && y >= 0 && z >= 0 && x < FX && y < FY && z < FZ) { if (F.get(x, y, z)) { V.set(x, y, z, 1); return; } x += dx; y += dy; z += dz; } }
  for (a0 = 0; a0 < FY; a0++) for (a1 = 0; a1 < FZ; a1++) { ray(0, a0, a1, 1, 0, 0); ray(FX - 1, a0, a1, -1, 0, 0); }
  for (a0 = 0; a0 < FX; a0++) for (a1 = 0; a1 < FZ; a1++) { ray(a0, 0, a1, 0, 1, 0); ray(a0, FY - 1, a1, 0, -1, 0); }
  for (a0 = 0; a0 < FX; a0++) for (a1 = 0; a1 < FY; a1++) { ray(a0, a1, 0, 0, 0, 1); ray(a0, a1, FZ - 1, 0, 0, -1); }
  // ⑤ 每塊滿幾格、最多的那一色（看得到的格投票；這一塊沒有看得到的格 ⇒ 全部的格投票）
  var col = new Uint8Array(NB), H = new Uint16Array(64 * 256), H2 = new Uint16Array(64 * 256), bx, by, bz;
  for (var cz = 0; cz < F.nz; cz++) for (var cy = 0; cy < F.ny; cy++) for (var cx = 0; cx < F.nx; cx++) {
    var ci = F.ci(cx, cy, cz), ch = F.tab[ci], vh = V.tab[ci]; if (ch === null) continue;
    H.fill(0); H2.fill(0);
    for (var li = 0; li < 4096; li++) { var v = ch[li]; if (!v) continue; s = (((li & 15) >> 2) | ((((li >> 4) & 15) >> 2) << 2) | (((li >> 8) >> 2) << 4)) * 256 + v; H[s]++; if (vh && vh[li]) H2[s]++; }
    for (k = 0; k < 64; k++) {
      var best = 0, bn = 0, tot = 0, b2 = 0, bn2 = 0; for (j = 1; j < 256; j++) { var h = H[k * 256 + j], h2 = H2[k * 256 + j]; tot += h; if (h > bn) { bn = h; best = j; } if (h2 > bn2) { bn2 = h2; b2 = j; } }   // 一樣多 ⇒ 色碼小的
      if (!tot) continue;
      if (bn2) best = b2;
      bx = cx * 4 + (k & 3); by = cy * 4 + ((k >> 2) & 3); bz = cz * 4 + (k >> 4);
      var bi = bx + n[0] * (by + n[1] * bz); cnt[bi] = tot; col[bi] = best;
    }
  }
  // ⑥ 從外面灌空氣：全空的塊才通；灌不到的全空塊 ＝ 船裡（實心）
  var out = new Uint8Array(NB), Qa = new Int32Array(NB), qh = 0, qt = 0;
  function push(x, y, z) { if (x < 0 || y < 0 || z < 0 || x >= n[0] || y >= n[1] || z >= n[2]) return; var q = x + n[0] * (y + n[1] * z); if (out[q] || cnt[q]) return; out[q] = 1; Qa[qt++] = q; }
  push(0, 0, 0);
  while (qh < qt) { var q = Qa[qh++], x = q % n[0], y = Math.floor(q / n[0]) % n[1], z = Math.floor(q / (n[0] * n[1])); push(x - 1, y, z); push(x + 1, y, z); push(x, y - 1, z); push(x, y + 1, z); push(x, y, z - 1); push(x, y, z + 1); }
  // ⑦ 留哪幾塊：滿 SHOWLOD_FILL 格、或貼著船裡；船裡的空塊實心（顏色照船殼最多的那一色：看不到，除非旁邊的塊被丟掉）
  var hist = new Uint32Array(256); for (k = 0; k < NB; k++) if (cnt[k]) hist[col[k]]++;
  var ic = 1, icn = 0; for (j = 1; j < 256; j++) if (hist[j] > icn) { icn = hist[j]; ic = j; }
  function inner(x, y, z) { if (x < 0 || y < 0 || z < 0 || x >= n[0] || y >= n[1] || z >= n[2]) return false; var q = x + n[0] * (y + n[1] * z); return !cnt[q] && !out[q]; }
  var res = new Uint8Array(NB); st.kept = st.dropped = st.inner = st.blocks = 0;
  for (bz = 0; bz < n[2]; bz++) for (by = 0; by < n[1]; by++) for (bx = 0; bx < n[0]; bx++) {
    k = bx + n[0] * (by + n[1] * bz);
    if (!cnt[k]) { if (!out[k]) { res[k] = ic; st.inner++; } continue; }
    if (cnt[k] >= SHOWLOD_FILL || inner(bx - 1, by, bz) || inner(bx + 1, by, bz) || inner(bx, by - 1, bz) || inner(bx, by + 1, bz) || inner(bx, by, bz - 1) || inner(bx, by, bz + 1)) { res[k] = col[k]; st.kept += cnt[k]; st.blocks++; }
    else st.dropped += cnt[k];
  }
  var s = ''; for (i = 0; i < NB; i += 32768) s += String.fromCharCode.apply(null, res.subarray(i, Math.min(NB, i + 32768)));
  st.ms = Math.round(performance.now() - t0);
  return { n: n, off: off, b64: btoa(s), mk: mk, dk: dk, stat: st };
}
/** 一艘（剛開場）⇒ 遠那一級的貼圖：{ ppm, cw、ch（一格幾像素）, z0（底在船的格座標多高）, b64（RGBA，寬 8·cw、高 2·ch、第一列在上；未壓縮，admin.py 壓）, stat }。
 *  船擺正（矩陣只留位置：不轉、不搖）、拍兩套帆段；每一張：正交、鏡頭在船格子中心那條垂直軸往外 φk 那一邊往裡看（同 showlodFarSet 的方向與右手邊）。
 *  先拍一個寬鬆的框（半寬 ＝ 格子水平對角線的 0.6 倍 ＋ 4 m、高 ＝ 格子高 ＋ 兩倍半寬：桅杆、帆桁、船首斜桅不在格子裡），再照十六張全部的不透明範圍裁（左右對軸對稱）；碰到框邊 ⇒ stat.edge。 */
function showlodShots(sh) {
  drawnSync();                                                           // 下面畫的那幾段（drawHulls、rbatPrep、drawSails）走 DRAWN（58_traffic.js ⑭）；烘頁 reset() 完沒跑模擬步、沒叫 render() ⇒ 還是空的、什麼都沒畫（TASK-1170）
  shadowMaps();                                                          // 陰影圖那一組先配好（setCommon 讀 SHM.mats；頁面還沒畫過一格 ⇒ null。⛔ 不叫 render()：鏡頭可能還沒算過、CAM.vp 是 null）
  var t0 = performance.now(), T = sh.T, G = sh.grid, IM = SHOWLOD_IM, N = IM.dirs, ppm = Math.max(IM.pmin, Math.round(4 * IM.ppm / showlodLk(T.hullG || T.base)) / 4), q = ppm * IM.ss, st = { edge: 0 };   // ppm：照倍率降（換到遠那一級的距離乘 lk ⇒ 一像素差不多一樣大）
  var cx = G.sx / 2, cy = G.sy / 2, rh = 0.6 * Math.hypot(G.sx, G.sy) * S + 4, zb = -0.15 * G.sz, zt = G.sz + 2 * rh / S;   // 半寬（公尺）、框的底與頂（格座標）
  var W = Math.ceil(rh * q / IM.ss) * 2 * IM.ss, H = Math.ceil((zt - zb) * S * q / 2 / IM.ss) * 2 * IM.ss, rx = W / 2 / q, ry = H / 2 / q;   // 先拍的大小（像素；ss 的偶數倍）⇒ 正交框的半寬、半高照像素算回來（一像素剛好 1 ÷ q 公尺）
  var keep = { M: sh.M, inv: sh.inv, set: sh.sailSet, fog: WX.fog, lamps: LAMPS.n, vl: sh.vlamps, sun: WX.sun, sunk: TOD_SUNK };
  var M0 = M4.mul(trans(sh.M[12], sh.M[13], sh.M[14]), shipBaseMatrix(T)); sh.M = M0; sh.inv = M4.inv(M0);   // 擺正：不轉、不搖（位置照舊）
  WX.fog = 0; LAMPS.n = 0; sh.vlamps = []; WX.sun = 1; TOD_SUNK = 1;   // 不上霧、沒有點光源、陽光 1（陰影：PASS.sh 0）
  var C = M4.pt(M0, cx, cy, zb + ry / S), fb = mkFB(mkTex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, W, H, false), mkRB(gl.DEPTH_COMPONENT24, W, H, 0)), pd = { b: 0 };
  var shots = [], px = new Uint8Array(W * H * 4), flip = 0, i, x, y, cl0 = (sh.cl || []).map(function (c) { return { p: c.p, hidden: c.hidden }; });
  st.sb = [];
  IM.sets.forEach(function (lvl) {
    if (hasSails(sh)) { sh.sailSet = lvl; applySailSet(sh); }
    (sh.cl || []).forEach(function (c, k) {                             // 布要物理那一步才張開（30_rig_physics.js physVis：hidden ⇒ clothInit＋clothBrace）；烘頁沒跑模擬 ⇒ 這裡照它張、收的藏回去
      var s = sh.sails[k]; if (s.dead || c.gone) return;
      if (s.furled) c.hidden = true; else if (c.hidden || !c.p) { clothInit(c); clothBrace(sh, c); c.hidden = false; }
    });
    sh.rigDirty = true; RFR++; prepRig(); rbatPrep(); st.sb.push(sh.sb ? sh.sb.n : 0);   // sb：這一套帆的三角形（索引數 ÷ 3 前）
    for (var k = 0; k < N; k++) {
      var c = Math.cos(k * 2 * Math.PI / N), s = Math.sin(k * 2 * Math.PI / N), wx = M0[0] * c + M0[4] * s, wz = M0[2] * c + M0[6] * s, wl = Math.hypot(wx, wz);
      wx /= wl; wz /= wl;
      var D = rx * 3, eye = [C[0] + wx * D, C[1], C[2] + wz * D], VP = M4.mul(ortho(rx, D - rx * 1.5, D + rx * 1.5, ry), M4.lookAt(eye, C, [0, 1, 0]));   // 深度只到船前後各 1.5 個半寬（另一艘船擺在最遠的距離 ⇒ 拍不到）
      if (!k) { var r = [wz, 0, -wx], ndc = VP[0] * (C[0] + r[0]) + VP[4] * C[1] + VP[8] * (C[2] + r[2]) + VP[12]; flip = ndc < 0 ? 1 : 0; }   // 看板的右手邊（showlodFarSet）在畫面的哪一邊
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fb); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      PASS.vp = VP; PASS.eye = eye; PASS.clip = -1e9; PASS.sh = 0;
      gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE); gl.frontFace(gl.CW); gl.useProgram(P.vox.prog); setCommon(P.vox); drawHulls(P.vox, pd); gl.frontFace(gl.CCW);   // 同 mainOpaque 那一段
      gl.disable(gl.CULL_FACE); gl.useProgram(P.tri.prog); setCommon(P.tri); gl.uniform1f(P.tri.u.uLit, 1); rbatReplay(P.tri, pd); drawColours(P.tri, pd);
      gl.uniform1f(P.tri.u.uLit, 0); gl.vertexAttrib3f(1, 0, 1, 0); cutSet(P.tri, sh); gl.uniformMatrix4fv(P.tri.u.uModel, false, sh.M);
      if (sh.lines && sh.lines.n) { gl.bindVertexArray(sh.lines.vao); gl.drawArrays(gl.LINES, 0, sh.lines.n); }
      if (sh.ropeT && sh.ropeT.n) { gl.bindVertexArray(sh.ropeT.vao); gl.drawArrays(gl.TRIANGLES, 0, sh.ropeT.n); }
      cutSet(P.tri, null);
      gl.frontFace(gl.CW); gl.useProgram(P.sail.prog); setCommon(P.sail); drawSails(P.sail, pd); gl.frontFace(gl.CCW);
      gl.bindVertexArray(null);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); shots.push(px.slice());
    }
  });
  PASS.vp = null; PASS.eye = null; PASS.clip = -1e9; PASS.sh = 1; gl.bindFramebuffer(gl.FRAMEBUFFER, null); freeFB(fb);
  sh.M = keep.M; sh.inv = keep.inv; WX.fog = keep.fog; LAMPS.n = keep.lamps; sh.vlamps = keep.vl; WX.sun = keep.sun; TOD_SUNK = keep.sunk;
  if (hasSails(sh)) { sh.sailSet = keep.set; applySailSet(sh); }
  (sh.cl || []).forEach(function (c, k) { c.p = cl0[k].p; c.hidden = cl0[k].hidden; }); sh.rigDirty = true;
  // 裁：十六張的不透明範圍（左右對中心那一欄對稱）；碰到框邊 ⇒ 記下來（框不夠大）
  var x0 = W, x1 = -1, y0 = H, y1 = -1;
  shots.forEach(function (a) { for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } });
  if (x1 < 0) return { err: '拍不到東西' };
  if (x0 === 0 || x1 === W - 1 || y0 === 0 || y1 === H - 1) st.edge = 1;
  var hw = Math.max(W / 2 - x0, x1 + 1 - W / 2), ss = IM.ss;
  hw = Math.ceil(hw / ss) * ss; var X0 = W / 2 - hw, Y0 = Math.floor(y0 / ss) * ss, Y1 = Math.ceil((y1 + 1) / ss) * ss;   // 先拍那一份的裁切框（對齊 ss）
  var cw = 2 * hw / ss, ch = (Y1 - Y0) / ss, AW = cw * N, AH = ch * 2, out = new Uint8Array(AW * AH * 4), cov = new Float32Array(AW * AH);
  // 縮：ss × ss 平均（照不透明度加權的顏色、不透明度 ＝ 蓋住幾成）；第 j 張（帆段 j ÷ N、方向 j % N）⇒ 第 (j ÷ N) 列、第 (j % N) 欄；第一列在上（readPixels 是下面先）
  shots.forEach(function (a, j) {
    var row = Math.floor(j / N), col = j % N;
    for (var oy = 0; oy < ch; oy++) for (var ox = 0; ox < cw; ox++) {
      var r = 0, g = 0, b = 0, al = 0;
      for (var sy = 0; sy < ss; sy++) for (var sx = 0; sx < ss; sx++) {
        var ix = X0 + (flip ? cw - 1 - ox : ox) * ss + (flip ? ss - 1 - sx : sx), iy = Y1 - 1 - oy * ss - sy, p = (iy * W + ix) * 4, w = a[p + 3] / 255;
        r += a[p] * w; g += a[p + 1] * w; b += a[p + 2] * w; al += w;
      }
      var Q = ((row * ch + oy) * AW + col * cw + ox) * 4;
      if (al > 0) { out[Q] = Math.round(r / al); out[Q + 1] = Math.round(g / al); out[Q + 2] = Math.round(b / al); }
      out[Q + 3] = Math.round(255 * al / (ss * ss)); cov[Q / 4] = al;
    }
  });
  // 透明的像素塗上旁邊有東西的平均色（同 Blocksail tools/townmodels.py bleed，四圈；縮小 mipmap 時邊緣不帶黑邊）；不透明度不變
  for (var it = 0; it < 4; it++) {
    var add = [];
    for (y = 0; y < AH; y++) for (x = 0; x < AW; x++) {
      if (cov[y * AW + x] > 0) continue;
      var n = 0, sr = 0, sg = 0, sb = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= AW || yy >= AH || !(cov[yy * AW + xx] > 0)) continue; var p2 = (yy * AW + xx) * 4; sr += out[p2]; sg += out[p2 + 1]; sb += out[p2 + 2]; n++; }
      if (n) add.push(y * AW + x, Math.round(sr / n), Math.round(sg / n), Math.round(sb / n));
    }
    for (i = 0; i < add.length; i += 4) { var p3 = add[i] * 4; out[p3] = add[i + 1]; out[p3 + 1] = add[i + 2]; out[p3 + 2] = add[i + 3]; cov[add[i]] = 1e-6; }
  }
  var s2 = ''; for (i = 0; i < out.length; i += 32768) s2 += String.fromCharCode.apply(null, out.subarray(i, Math.min(out.length, i + 32768)));
  st.flip = flip; st.big = [W, H]; st.ms = Math.round(performance.now() - t0);
  return { ppm: ppm, cw: cw, ch: ch, z0: +(zb + Y0 / q / S).toFixed(3), b64: btoa(s2), stat: st };
}
/** 模型的顏色（0～1）⇒ VoxelKit 的色碼（RGB 3-3-2；0 是空格 ⇒ 純黑記成 1）。 */
function rgb332(r, g, b) { var c = (Math.round(clamp(r, 0, 1) * 7) << 5) | (Math.round(clamp(g, 0, 1) * 7) << 2) | Math.round(clamp(b, 0, 1) * 3); return c || 1; }

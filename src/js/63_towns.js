// ───────────────────────── 城鎮（TASK-0740；只給人看） ─────────────────────────
// Blocksail 的城鎮規劃（格式 Blocksail docs/TOWN_BUILD.md §5、src/MAP_CHUNK.md §8）⇒ 整地、清樹、擺建築與城牆、路著色。第一版只給人看（Tim 2026-10-19 第 10 節第 5 題：
//   砲彈穿過去、船穿過去、不改戰局）⇒ ⛔ 不碰 C.h（模擬查的那一份）：整地只寫進給畫面的 C.hv（地形網格、樹照它），船、擱淺、砲彈打地面照舊讀 C.h
//   ⇒ 城鎮什麼時候到（檔案、外面那一頁生成要好幾秒）都跟戰局無關；無頭（?demo&headless）整段不做。?towns=0 ⇒ 不載城。
// 來源：area.towns（有城的 id 清單）⇒ 檔案 maps/<海域>/towns.js（BSMAP.town，一座一筆）或 ?map=@host 跟外面那一頁要（{ bsmap: 'need', what: 'towns' } ⇒ { bsmap: 'towns', towns }）。
//   規劃的座標以市中心為原點（往東 x、往南 y，公尺）；海域座標 ＝ (ox ＋ kx·x, oy ＋ y)（匯出時算好，Blocksail world/town_export.js）。
// 整地（townHv；每塊海圖塊第一次要畫的時候算、城到了再重算）：路（照 z，路寬一半 ＋ 一個取樣點內整平）先、地塊的 grade（照 h，外擴 TOWN_LOT_PAD）後，
//   外面照邊坡 1 : bank 接回原地形（|高差| ≤ 距離 ÷ bank，路最多接 TOWN_GRADE_REACH 公尺）；只改陸上的點（原本 ≤ 0 的不動 ⇒ 岸線不變）。
// 地基（Tim 2026-10-20：「是否可以協助處理 房屋地基可能跟地面重疊導致的閃爍問題」「可以參考其他城建遊戲的作法」—— Cities: Skylines、Anno 那一類：
//   腳下整平、地基是往下的裙邊、地面歸房子或地形其中一個，不留兩片同高的面）：
//   · 地塊「頂著」：整完地之後再一輪，地塊外擴一格地形網格的對角線（min(取樣間距, TOWN_LOT_CELL) × √2）以內的點一律不准高過那一塊的 h（只往下壓）、往下取整到分米
//     ⇒ 網格的三角形整片 ≤ h，斜面不會從房子、院子裡冒出來。整平只外擴 2 m、取樣 4 m ⇒ 跨地塊邊那一格一角在坡上。改完量（佔地裡每 1 m 一點、40 萬點）：高過房子底的 1.7%、最多 0.73 m（原版沒量）。
//     ⛔ 不能把「整平」的外擴放大：坡上相鄰兩塊 h 不同，整平範圍互相蓋到，後算的那一塊把鄰居的地抬起來（試過外擴 10 m ⇒ 高過房子底的 1/3、最多 3.2 m，房子被埋）。被壓低的地方（高的那一塊靠矮鄰居那一邊）由石基的裙邊擋住。
//   · 石基不畫頂面（頂面在 h − 0.01，以前跟整平的地面 h 只差 1 cm、地面又被四捨五入到 ±5 cm ⇒ 院子一片石、一片草地搶深度）：只畫四面當裙邊／擋土牆，地面歸房子的地板或地形。
// 清樹（townClr）：規劃的 clear（有建築的地塊、路、城牆、碼頭各外擴 2 m；空建地不清）每 TOWN_CLR_G 公尺一格的遮罩 ⇒ 63_trees.js 擺樹時跳過。
// 建築（模型在 Blocksail 的 world/townkit/：tools/townmodels.py 匯入時算好近、中、遠三份＋屋頂殼的資料；要用到的才跟外面要，見下面 townKit 那一段）：照用途挑（同用途的變化照 地塊 id 的雜湊挑 ⇒ 每次一樣；特殊建築的用途就是那一種 ⇒ 只有它的模型挑得到，例：galata-tower）。
//   模型 → 世界（BUILDING_SPEC §1）：a ＝ mx·mpv − 模型寬/2、b ＝ my·mpv − 模型深/2、θ ＝ lot.rot ⇒ 往東 ＝ cx ＋ a·sinθ − b·cosθ、往南 ＝ cy − a·cosθ − b·sinθ、高 ＝ h ＋ mz·mpv；
//   模型比地塊小（金斯敦的地塊照 Lilly 的棋盤）⇒ 臨路那一邊對齊、沿路置中：cx,cy ＝ at ＋ (d − 模型深)/2 ·(cosθ, sinθ)。底下墊一塊石基（townPlinth：到四角最低的地面再下 0.3 m）。
//   城牆（TOWN_BUILD §4）：照牆的 kit 挑一套模組（wall1～wall3 ＝ 一～三級、roman-land-inner／roman-land-outer／roman-sea ＝ 東羅馬城牆 1453；BUILDING_SPEC §6、§6.1）；
//   沒寫 kit ⇒ 一級（等級之後照規模 × 繁榮度換）、寫了但沒有那一套 ⇒ 一級（stat.skip 記 'wall:<kit>'）。
//   門、塔照位置（一套有好幾型塔 ⇒ 照順序輪流：東羅馬外牆方塔、新月塔交替）、兩頭收尾，中間照斷面沿曲線一節一節拉（節數 round(L / len)、每節沿 x 縮放補滿），−y（牆外）朝離城心遠的那一邊。
//   接縫（Tim 2026-10-20：「目前城市地圖的城牆 連接處會也接縫 是否可以參考其他遊戲的作法處理例如圖二的世紀帝國4城牆」）：斷面接成一條折線（每節是兩站之間的弦、相鄰兩節共用一站，路線的頂點一定是站）
//   ⇒ 站上照兩節的角平分面斜接（著色器照 aJ 把那一節沿 x 切成梯形）、接到門／塔／轉角／收尾的那一頭照部件的端面切齊；高度照兩站的地面線性接（坡上順著走，不再一節一階），
//   牆基（模型 z 0 那一層）往下延到腳下最低的地面；轉得急（≥ TOWN_WALL_CORNER）的頂點要有部件蓋著（同世紀帝國轉角的塔）：附近有塔 ⇒ 塔挪到轉角上（stat.snapped），
//   沒有 ⇒ 擺一件轉角（那一套的 joint；沒有 ⇒ 第一型塔；stat.corners）。會改到手擺的塔（君士坦丁堡新擺 6、加拉塔新擺 7〔22 → 29 座〕、挪 9 座）⇒ Tim 2026-10-20 選保留。
// 遠近四級（照樹那一套；距離 TOWN_LOD、TOWN_FAR）：近 原模型、中 低模（0.4 m）、遠 貼圖（八個方向先拍好，取最接近視線的那一張）、更遠 屋頂殼（每 TOWN_SHELL_G 公尺一格的屋頂高與顏色）；
//   每一級的交接帶兩邊都畫、用同一個抖動互補（同一個像素只有一個）。看得到的實例照視錐剔、鏡頭動了 TOWN_REBIN 公尺才重新分組（townBin）。
// 布旗（模型帶 flags 的，例：加拉塔塔頂的熱那亞旗）：一塊布、照風飄，只給人看 ⇒ 見下面「布旗」那一段。
// 路：共用 2 m 格的距離場把整個路網併成一張面（圓端、轉角與路口沒有重疊面）；各點照畫面地形順坡，抬高 12 cm、外緣補薄側面。規劃與模擬高度不變。
// 地標（Tim 2026-10-20：「大型建築應該要更遠可見(地標) 且顯示細節要比一般建築高(在更遠的距離上顯示更高細節) 例如聖索菲亞大教堂 加拉塔石塔等」）：
//   每棟一個倍率 lk ＝ 長、寬、高最大的那一邊 ÷ TOWN_LM[0]（限 1..TOWN_LM[1]；城牆一律 1）⇒ 四級的距離、交接帶都乘 lk（著色器用 距離 ÷ lk 對同一組門檻）；
//   lk > 1 的不進屋頂殼，最遠一級是它自己的貼圖（到 TOWN_FAR × lk）。一般房子 ≤ 24 m ⇒ lk 1，跟以前一位元不差。
var TOWN_LM = [24, 4];
var TOWN_LOD = [160, 800], TOWN_FAR = [2400, 3000], TOWN_BAND = [24, 60, 300], TOWN_REBIN = 8, TOWN_SHELL_G = 32, TOWN_GRADE_REACH = 12, TOWN_LOT_PAD = 2, TOWN_LOT_CELL = 8, TOWN_CLR_G = 2, TOWN_ROAD_LIFT = 0.12, TOWN_GROUND_VIEW = 1600;
var TOWN_MESH_MS = 8;                                                    // 模型網格化每段最多幾 ms 就讓出一次（townMesh；跟地球儀同一條主執行緒）
var TOWN_WALL_CORNER = 30, TOWN_WALL_KMAX = 1;                         // 城牆：轉角件從轉幾度起擺；斜接最多切多斜（tan，1 ＝ 轉 90° 的角平分）
var TOWNS = { on: Q.get('towns') !== '0', list: [], pend: [], ver: 0, want: 0, err: null, kit: null, kitP: null, idx: null, kitHas: null, kitRedo: false, mwait: null, prog: null, dirty: true, eye: null, sig: '', buf: [], grp: null,
  stat: { towns: 0, lots: 0, inst: 0, walls: 0, corners: 0, snapped: 0, skip: {}, d0: 0, d1: 0, d2: 0, d3: 0, plinth: 0, tris: 0, binMs: 0, kitMs: 0, gradeMs: 0, chunks: 0, drawMs: 0 } };
var TOWN_J0 = [0, 0, 0, 0];                                             // 建築的 aJ（不斜接、不順坡、牆基不延）
var TOWN_USE_ALT = { commandant: ['house'], governor: ['townhall'] };   // 那一套沒有那種模型 ⇒ 用哪一種代（BUILDING_SPEC §7：fr 沒有長官的屋子；carib 有）
var TOWN_STYLE_DEF = 'fr';                                              // 城的 style 那一套沒有那種用途 ⇒ 照 fr 那一套（第一套）；索引裡沒寫 style 的模型也算 fr（TASK-0757）
var TOWN_COL = { main: [0.56, 0.47, 0.34], street: [0.62, 0.58, 0.50], track: [0.50, 0.42, 0.30], plaza: [0.70, 0.66, 0.58], quay: [0.58, 0.56, 0.52], pier: [0.45, 0.33, 0.22], post: [0.30, 0.22, 0.15] };
evOn('bedChunk', function (cx, cy) {
  TOWNS.dirty = true;
  if (!BED || !BED.A) return;
  var x = cx * BED.A.chunk, z = cy * BED.A.chunk, S = BED.A.chunk;
  TOWNS.list.forEach(function (T) { if (T.box[0] < x + S && T.box[2] > x && T.box[1] < z + S && T.box[3] > z) T.groundDirty = true; });
}, 0, true);

/** 字串 ⇒ [0, 1)（FNV-1a）：同用途好幾種變化照它挑。 */
function townHash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

// ── 收城（08_seabed.js：BSMAP.town、外面那一頁的 'towns'） ──
/** 海域有城（area.towns）⇒ 去要：檔案讀 maps/<海域>/towns.js、@host 跟外面那一頁要（townGot 收）。 */
function townWant() {
  if (!TOWNS.on || HEADLESS || !BED || !BED.A || !(BED.A.towns || []).length) return;
  TOWNS.want = BED.A.towns.length;
  if (BED.host) { BED.host.postMessage({ bsmap: 'need', what: 'towns' }, '*'); return; }
  TOWNS.pend = [];
  var dir = 'maps/' + BED.A.id + '/';
  bedScript(dir + 'towns.js').then(function () {
    return bedScript(dir + 'townkit/index.js').catch(function () {});   // 模型的索引（沒有 ⇒ 城照樣整地、清樹、鋪路，只是沒有建築；townKit 記 err）
  }).then(function () { var L = TOWNS.pend; TOWNS.pend = []; townGot(L, null, window.BSTOWNKIT); }, function (e) { TOWNS.err = e.message; console.warn('城鎮：' + e.message); });
}
/** 一批城鎮規劃到了（idx ＝ 模型的索引 BSTOWNKIT，見 townKit 上面）⇒ 換成海域／世界座標、要重算整地與清樹的塊重發 'bedChunk'（地形網格、樹照新的重建）、遠景重抽。 */
function townGot(L, err, idx) {
  if (err) { TOWNS.err = err; console.warn('城鎮：' + err); }
  if (idx && idx.models && !TOWNS.idx) TOWNS.idx = idx;
  if (!BED || !BED.A || !L || !L.length) return;
  var t0 = performance.now();
  L.forEach(function (p) { if (p && p.format === 'blocksail-town' && !TOWNS.list.some(function (T) { return T.id === p.id; })) TOWNS.list.push(townPrep(p)); });
  var I = townIdx();                                                    // 新來的城要的模型解好的那一份沒有 ⇒ 丟掉重要（解到一半 ⇒ 解完再丟）
  if (I && TOWNS.kitHas && townNeed(I).some(function (nm) { return TOWNS.kitHas.indexOf(nm) < 0; })) { if (TOWNS.kit) townKitFree(); else TOWNS.kitRedo = true; }
  TOWNS.ver++; TOWNS.dirty = true; TOWNS.stat.towns = TOWNS.list.length;
  TOWNS.stat.prepMs = +(performance.now() - t0).toFixed(1);
  Object.keys(Object.assign({}, BED.ch, BED.cm)).forEach(function (k) { var C = bedShowC(k); if (C && townOver(C.cx, C.cy)) evEmit('bedChunk', C.cx, C.cy, C); });   // 畫著的那一份（原精度或外圈的中等塊）
  Object.keys(BEDFAR.g).forEach(function (k) {                          // 遠景塊：網格與樹冠殼是照舊的高度建的 ⇒ 丟掉、放回去重讀（63_bed_gl.js bedFarStep 照離旗艦遠近挑）
    if (bedShowC(k)) return;
    var c = k.split('_').map(Number); if (!townOver(c[0], c[1])) return;
    bedFarDrop(k);
    if (BEDFAR.todo) BEDFAR.todo.push([c[0], c[1], 1, 0]);
  });
}
/** 塊 (cx, cy) 跟哪一座城的外框疊到（海域座標）。 */
function townOver(cx, cy) {
  var S = BED.A.chunk, e0 = cx * S, s0 = cy * S;
  return TOWNS.list.some(function (T) { return T.box[0] < e0 + S && T.box[2] > e0 && T.box[1] < s0 + S && T.box[3] > s0; });
}
/** 規劃 ⇒ 一座城（海域座標的路、整地、清樹，世界座標的實例；模型的實例等要用到的模型解好（townKit）才建 ⇒ townInst）。 */
function townPrep(p) {
  var ox = +p.ox || 0, oy = +p.oy || 0, kx = +p.kx || 1, D2R = Math.PI / 180, bank = +p.bank || 1.5;
  function E(q) { return [ox + kx * q[0], oy + q[1]]; }
  var box = [1e9, 1e9, -1e9, -1e9];
  function grow(q, r) { box[0] = Math.min(box[0], q[0] - r); box[1] = Math.min(box[1], q[1] - r); box[2] = Math.max(box[2], q[0] + r); box[3] = Math.max(box[3], q[1] + r); }
  var roads = (p.roads || []).map(function (r) {
    var P = r.path.map(E); if (r.closed) P = P.concat([P[0]]);
    var z = (r.z || []).slice(); if (r.closed) z.push(z[0]);
    P.forEach(function (q) { grow(q, r.w / 2 + 4 + TOWN_GRADE_REACH); });
    return { id: r.id, kind: r.kind, w: r.w, P: P, z: z };
  });
  var grade = (p.grade || []).map(function (g) { var R = g.ring.map(E); R.forEach(function (q) { grow(q, TOWN_LOT_PAD + TOWN_LOT_CELL + 6); }); return { h: g.h, R: R }; });
  var clr = { rings: ((p.clear || {}).rings || []).map(function (r) { return r.map(E); }),
              paths: ((p.clear || {}).paths || []).map(function (c) { var P = c.path.map(E); return { w: c.w, P: c.closed ? P.concat([P[0]]) : P }; }) };
  clr.rings.forEach(function (R) { R.forEach(function (q) { grow(q, 4); }); });
  clr.paths.forEach(function (c) { c.P.forEach(function (q) { grow(q, c.w); }); });
  (p.lots || []).forEach(function (l) { grow(E(l.at), Math.hypot(l.w, l.d)); });
  (p.piers || []).forEach(function (q) { q.path.forEach(function (a) { grow(E(a), q.w); }); });
  var core = p.core && p.core.ring ? p.core.ring.map(E) : null, cen = [ox, oy];
  if (core) { var sx = 0, sy = 0; core.forEach(function (q) { sx += q[0]; sy += q[1]; }); cen = [sx / core.length, sy / core.length]; }
  return { id: p.id, name: p.name, tier: p.tier, style: p.style, seed: p.seed, p: p, ox: ox, oy: oy, kx: kx, bank: bank, E: E, box: box, roads: roads, grade: grade, clr: clr, cen: cen, D2R: D2R, inst: null, ground: null, shell: null };
}

// ── 整地與清樹（每塊照 TOWNS.ver 算一次；C.h 換過（大漩渦重烤）也重算） ──
/** 給畫面的高度（Int16 分米，同 C.h 的排法）：有城疊到 ⇒ 整過地的那一份（C.hv），沒有 ⇒ C.h 本身。順手算清樹的遮罩（C.tc）。 */
function townHv(C) {
  if (!TOWNS.list.length || !BED || !BED.A) return C.h;
  if (C.tv === TOWNS.ver && C.tvh === C.h) return C.hv || C.h;
  C.tv = TOWNS.ver; C.tvh = C.h; C.hv = null; C.tc = null;
  if (!townOver(C.cx, C.cy)) return C.h;
  var t0 = performance.now(), A = BED.A, S = A.chunk, st = C.step, n = C.n, e0 = C.cx * S, s0 = C.cy * S, h0 = C.h, N = n * n, g = new Float32Array(N), fl = new Uint8Array(N), i, j, o;
  var cap = Math.min(st, TOWN_LOT_CELL) * 1.415 + 0.05;                  // 地塊頂著的範圍：外擴一格地形網格的對角線（見檔頭「地基」）
  for (o = 0; o < N; o++) g[o] = h0[o] / 10;
  function range(a, b, pad, lo) { return [Math.max(0, Math.ceil((a - pad - lo) / st)), Math.min(n - 1, Math.floor((b + pad - lo) / st))]; }
  function clampTo(o2, h, dd, bank) { if (h0[o2] <= 0) return; var lim = dd / bank; if (g[o2] > h + lim) g[o2] = h + lim; else if (g[o2] < h - lim) g[o2] = h - lim; }
  TOWNS.list.forEach(function (T) {
    if (!(T.box[0] < e0 + S && T.box[2] > e0 && T.box[1] < s0 + S && T.box[3] > s0)) return;
    T.roads.forEach(function (r) {                                      // 路：整平到路面（z），路寬一半 ＋ 一個取樣點內
      var pad = r.w / 2 + st, R = pad + TOWN_GRADE_REACH;
      for (var q = 1; q < r.P.length; q++) {
        var a = r.P[q - 1], b = r.P[q], za = r.z[q - 1], zb = r.z[q]; if (za == null || zb == null) continue;
        var ri = range(Math.min(a[0], b[0]), Math.max(a[0], b[0]), R, e0), rj = range(Math.min(a[1], b[1]), Math.max(a[1], b[1]), R, s0);
        var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) {
          var px = e0 + i * st - a[0], py = s0 + j * st - a[1], u = Math.max(0, Math.min(1, (px * dx + py * dy) / L2)), d = Math.hypot(px - u * dx, py - u * dy);
          if (d > R) continue;
          clampTo(j * n + i, za + (zb - za) * u, Math.max(0, d - pad), T.bank);
        }
      }
    });
    T.grade.forEach(function (gr) {                                     // 地塊：整平到 h（外擴 TOWN_LOT_PAD），外面照邊坡接
      var R = gr.R, xs = R.map(function (q) { return q[0]; }), ys = R.map(function (q) { return q[1]; }), reach = TOWN_LOT_PAD + 4 * T.bank;
      var ri = range(Math.min.apply(null, xs), Math.max.apply(null, xs), reach, e0), rj = range(Math.min.apply(null, ys), Math.max.apply(null, ys), reach, s0);
      for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) {
        var x = e0 + i * st, y = s0 + j * st, d = townPip(x, y, R) ? 0 : townPolyDist(x, y, R);
        if (d > reach) continue;
        clampTo(j * n + i, gr.h, Math.max(0, d - TOWN_LOT_PAD), T.bank);
      }
    });
  });
  TOWNS.list.forEach(function (T) {                                     // 地塊頂著（見檔頭「地基」）：外擴 cap 以內的點不准高過那一塊的 h ⇒ 斜面不會從房子、院子裡冒出來；只往下壓、不往上抬
    if (!(T.box[0] < e0 + S && T.box[2] > e0 && T.box[1] < s0 + S && T.box[3] > s0)) return;
    T.grade.forEach(function (gr) {
      var R = gr.R, xs = R.map(function (q) { return q[0]; }), ys = R.map(function (q) { return q[1]; });
      var ri = range(Math.min.apply(null, xs), Math.max.apply(null, xs), cap, e0), rj = range(Math.min.apply(null, ys), Math.max.apply(null, ys), cap, s0);
      for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) {
        o = j * n + i; if (h0[o] <= 0) continue;
        var x = e0 + i * st, y = s0 + j * st;
        if (g[o] < gr.h - 0.1 || (!townPip(x, y, R) && townPolyDist(x, y, R) > cap)) continue;
        if (g[o] > gr.h) g[o] = gr.h; fl[o] = 1;
      }
    });
  });
  var hv = new Int16Array(N), ch = 0;
  for (o = 0; o < N; o++) { hv[o] = Math.max(-32768, Math.min(32767, fl[o] ? Math.floor(g[o] * 10 + 1e-4) : Math.round(g[o] * 10))); if (hv[o] !== h0[o]) ch++; }   // 平台往下取整（分米）⇒ 不會高過地塊的 h（房子的底）
  C.hv = ch ? hv : null;
  C.tc = townClrMask(C);
  TOWNS.stat.gradeMs += performance.now() - t0; TOWNS.stat.chunks++;
  return C.hv || C.h;
}
/** 清樹的遮罩：塊裡每 TOWN_CLR_G 公尺一格（格心）落在 clear 的圈或路帶裡 ⇒ 1；整塊都沒有 ⇒ null。 */
function townClrMask(C) {
  var A = BED.A, S = A.chunk, G = TOWN_CLR_G, M = Math.round(S / G), e0 = C.cx * S, s0 = C.cy * S, out = null, i, j;
  function rng(a, b, pad, lo) { return [Math.max(0, Math.floor((a - pad - lo) / G)), Math.min(M - 1, Math.ceil((b + pad - lo) / G))]; }
  function mark(i2, j2) { if (!out) out = new Uint8Array(M * M); out[j2 * M + i2] = 1; }
  TOWNS.list.forEach(function (T) {
    if (!(T.box[0] < e0 + S && T.box[2] > e0 && T.box[1] < s0 + S && T.box[3] > s0)) return;
    T.clr.rings.forEach(function (R) {
      var xs = R.map(function (q) { return q[0]; }), ys = R.map(function (q) { return q[1]; }), ri = rng(Math.min.apply(null, xs), Math.max.apply(null, xs), 0, e0), rj = rng(Math.min.apply(null, ys), Math.max.apply(null, ys), 0, s0);
      for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) if (townPip(e0 + (i + 0.5) * G, s0 + (j + 0.5) * G, R)) mark(i, j);
    });
    T.clr.paths.forEach(function (c) {
      var hw = c.w / 2;
      for (var q = 1; q < c.P.length; q++) {
        var a = c.P[q - 1], b = c.P[q], ri = rng(Math.min(a[0], b[0]), Math.max(a[0], b[0]), hw, e0), rj = rng(Math.min(a[1], b[1]), Math.max(a[1], b[1]), hw, s0);
        for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) if (townSegDist(e0 + (i + 0.5) * G, s0 + (j + 0.5) * G, a, b) <= hw) mark(i, j);
      }
    });
  });
  return out;
}
/** 63_trees.js 擺樹：塊裡 (x, z) 公尺（塊的原點起算）要不要清掉。 */
function townClr(C, x, z) {
  townHv(C); var M = C.tc; if (!M) return false;
  var G = TOWN_CLR_G, m = Math.round(BED.A.chunk / G), i = Math.min(m - 1, Math.max(0, Math.floor(x / G))), j = Math.min(m - 1, Math.max(0, Math.floor(z / G)));
  return M[j * m + i] === 1;
}
/** 63_bed_gl.js：這一塊有城 ⇒ 在用的那幾圈每 4 m 一點（地塊 8 × 12 m，8 m 一點會把整平的台子抹掉）。 */
function townFine(C) { return townHv(C) !== C.h || !!C.tc; }
function townPip(x, y, R) { var c = false; for (var i = 0, j = R.length - 1; i < R.length; j = i++) { var a = R[i], b = R[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function townSegDist(x, y, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, u = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0; return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy); }
function townPolyDist(x, y, R) { var m = Infinity; for (var i = 0, j = R.length - 1; i < R.length; j = i++) m = Math.min(m, townSegDist(x, y, R[j], R[i])); return m; }
/** 世界 (x, z) 的畫面高度（整過地的那一份；那一塊沒載 ⇒ NaN）—— 城牆、石基、棧橋的腳照它放。 */
function townGround(x, z) {
  var q = bedCell(x, z); if (!q) return NaN;
  var C = q.C, h = townHv(C), n = C.n, i = Math.min(n - 2, Math.floor(q.u)), j = Math.min(n - 2, Math.floor(q.v)), fu = q.u - i, fv = q.v - j, o = j * n + i;
  return ((h[o] * (1 - fu) + h[o + 1] * fu) * (1 - fv) + (h[o + n] * (1 - fu) + h[o + n + 1] * fu) * fv) / 10;
}

// ── 模型（Blocksail world/townkit/：tools/townmodels.py 匯入時算好）⇒ GPU ──
/** 解一份格子（townmodels.py pack_chunks：deflate-raw 的 區塊數 u32、(cx, cy, cz) u16 × n、4096 × n）⇒ 一份網格（全部區塊的四邊形接在一起）。 */
function townMesh(b64, size) {
  var bytes = null;
  // 分段做（05_hull.js yieldEach；全部模型排成一列）：金斯敦要的模型以前一次全部解、全部網格化 ⇒ 主執行緒卡 0.86 s
  return yieldEach([b64], function () { bytes = VK.b64ToBytes(b64); }, TOWN_MESH_MS).then(function () { return VK.inflateRaw(bytes); }).then(function (raw) {
    var dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), n = dv.getUint32(0, true), p = 4 + n * 6, ch = [null];   // null ＝ 先建格子
    for (var i = 0; i < n; i++) ch.push({ cx: dv.getUint16(4 + i * 6, true), cy: dv.getUint16(6 + i * 6, true), cz: dv.getUint16(8 + i * 6, true), data: raw.subarray(p + i * 4096, p + (i + 1) * 4096) });
    var g = null, parts = [], len = 0;
    return yieldEach(ch, function (c) {
      if (!c) { g = VK.Grid.fromModel({ header: { size: size, voxels: 0 }, chunks: ch.slice(1) }); return; }
      var m = VK.meshChunk(g, c.cx, c.cy, c.cz); if (m) { parts.push(m); len += m.length; }
    }, TOWN_MESH_MS).then(function () { return townUpload(parts, len); });
  });
}
/** 一份模型的網格（每個區塊的四邊形）接在一起 ⇒ GPU（實例化畫，QIDX 的索引）。 */
function townUpload(parts, len) {
  var all = new Uint16Array(len), o = 0; parts.forEach(function (m) { all.set(m, o); o += m.length; });
  var r = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), nq: len / 16 };
  QIDX.ensure(r.nq);                                                    // 先加長（ensure 會解開現在綁的 VAO）
  gl.bindVertexArray(r.vao); gl.bindBuffer(gl.ARRAY_BUFFER, r.vbo); gl.bufferData(gl.ARRAY_BUFFER, all, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribIPointer(0, 4, gl.UNSIGNED_SHORT, 8, 0);
  gl.enableVertexAttribArray(4); gl.vertexAttribDivisor(4, 1); gl.enableVertexAttribArray(5); gl.vertexAttribDivisor(5, 1); gl.enableVertexAttribArray(6); gl.vertexAttribDivisor(6, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, QIDX.buf); gl.bindVertexArray(null);
  return r;
}
// 模型不在這裡（Tim 2026-10-20：「城鎮資料…放在Blocksail 然後傳輸要用到的部份給Blockside就好」）：Blocksail 的 world/townkit/（tools/townmodels.py 產生）
//   ＝ 索引 BSTOWNKIT（每個模型的用途、尺寸、地塊、屋頂、固定點、貼圖大小；小）＋ 一個模型一個檔 BSTOWNKIT_DATA[名] ＝ { g: 網格, lo: 低模, png: 八張橫排的貼圖 }。
//   索引跟規劃一起到（外面那一頁回 'towns' 時附 kit；檔案模式 maps/<海域>/townkit/index.js）⇒ 照它挑每塊地用哪一個（townNeed）⇒ 只要那幾個（townModels）。
//   ⛔ 照用途分組（byUse）一律照「索引裡全部的模型」分：同用途的變化照雜湊在那一份清單裡挑 ⇒ 只照收到的分，清單變短、挑到的房子就變了。
/** 索引 ⇒ 全部名字（排序）、照用途分組。 */
function townIdx() {
  var I = TOWNS.idx; if (!I || !I.models) return null;
  if (!I.names) {
    I.names = Object.keys(I.models).sort(); I.byUse = {}; I.byStyle = {};
    I.names.forEach(function (nm) { var m = I.models[nm], k = m.use !== 'wall' ? m.use : (m.set || 'wall' + m.tier) + '-' + m.part; (I.byUse[k] = I.byUse[k] || []).push(nm); });   // 城牆：'<套>-<型>'（同型好幾種 ⇒ 名字排序）
    I.names.forEach(function (nm) { var m = I.models[nm]; if (m.use === 'wall') return; var k = (m.style || TOWN_STYLE_DEF) + ':' + m.use; (I.byStyle[k] = I.byStyle[k] || []).push(nm); });   // 建築：'<風格>:<用途>'
  }
  return I;
}
/** 地塊 l ⇒ 候選模型（townNeed、townInst 同一條路；TASK-0757）：城的 style 那一套 → fr 那一套 → 代用的用途（同樣先 style 再 fr）；
 *  特殊建築（l.src 'special'：用途就是那一種，例 galata-tower 的風格是 genoa）⇒ 不分風格。
 *  ⛔ 一般地塊不跨到別的風格：carib 的砲台不會跑進沒換風格的城（皇家港 3 塊 battery 照舊沒有模型）。沒換風格的城挑到的跟以前一樣。 */
function townPick(I, style, l) {
  var use = l.use;
  function by(u) { return I.byStyle[(style || TOWN_STYLE_DEF) + ':' + u] || I.byStyle[TOWN_STYLE_DEF + ':' + u]; }
  function any(u) { return I.byUse[u]; }
  var alt = TOWN_USE_ALT[use] || [];
  return by(use) || alt.map(by).filter(Boolean)[0] || (l.src === 'special' ? any(use) : null);
}
/** 收到的城會用到哪幾個模型：地塊照用途的整份候選（townInst 在裡面照雜湊挑）、城牆那一套的每一型（townWall：門、塔、斷面、收尾、轉角；沒有那一套 ⇒ 一級）。 */
function townNeed(I) {
  var S = {};
  function add(L) { (L || []).forEach(function (nm) { S[nm] = 1; }); }
  TOWNS.list.forEach(function (T) {
    (T.p.lots || []).forEach(function (l) {
      if (l.use === 'plot' || l.use === 'plaza') return;
      add(townPick(I, T.style, l));
    });
    (T.p.walls || []).forEach(function (w) {
      var kit = w.kit || 'wall1'; if (!I.byUse[kit + '-section']) kit = 'wall1';
      Object.keys(I.byUse).forEach(function (k) { if (k.indexOf(kit + '-') === 0) add(I.byUse[k]); });   // 那一套的每一型（門、塔、斷面、收尾、轉角…；以後多一型也不漏）
    });
  });
  return Object.keys(S).sort();
}
/** 那幾個模型的網格與貼圖 ⇒ Promise<{ 名: { g, lo, png } }>：@host 跟外面那一頁要（{ bsmap: 'need', what: 'townmodels', names } ⇒ { bsmap: 'townmodels', models }；
 *  08_seabed.js 轉給 townModelsGot）；檔案模式讀 maps/<海域>/townkit/<名>.js（BSTOWNKIT_DATA）。 */
function townModels(names) {
  if (BED.host) return new Promise(function (ok, bad) { TOWNS.mwait = { ok: ok, bad: bad }; BED.host.postMessage({ bsmap: 'need', what: 'townmodels', names: names }, '*'); });
  var dir = 'maps/' + BED.A.id + '/townkit/';
  return Promise.all(names.map(function (nm) { return (window.BSTOWNKIT_DATA || {})[nm] ? null : bedScript(dir + nm + '.js'); })).then(function () {
    var D = window.BSTOWNKIT_DATA || {}, out = {};
    names.forEach(function (nm) { if (!D[nm]) throw new Error('檔案裡沒有模型 ' + nm); out[nm] = D[nm]; });
    return out;
  });
}
/** 外面那一頁回的模型（08_seabed.js；出錯 ⇒ err）。 */
function townModelsGot(M, err) { var w = TOWNS.mwait; TOWNS.mwait = null; if (!w) return; if (err || !M) w.bad(new Error(err || '外面那一頁沒給模型')); else w.ok(M); }
/** 要用到的模型解好（近、中各一份網格；收到的貼圖一個模型一列往下排成一張）⇒ TOWNS.kit。第一次要畫才做（非同步；好了才建實例）。 */
function townKit() {
  if (TOWNS.kitP) return TOWNS.kitP;
  var I = townIdx();
  if (!I) { if (!TOWNS.err) TOWNS.err = '沒有城鎮模型的索引（外面那一頁沒給 kit、或檔案模式沒有 maps/' + BED.A.id + '/townkit/index.js）'; return null; }
  var t0 = performance.now(), names = I.names, need = townNeed(I), M = {};
  TOWNS.kitHas = need;
  TOWNS.kitP = townModels(need).then(function (D) {
    return Promise.all(need.map(function (nm) {
      var m0 = I.models[nm], d = D[nm];
      if (!d) throw new Error('外面那一頁沒給 ' + nm);
      return Promise.all([townMesh(d.g, m0.size), townMesh(d.lo, m0.lo.size)]).then(function (L) {
        M[nm] = { nm: nm, i: names.indexOf(nm), m: m0, lod: L, png: d.png, uc0: [m0.mpv, m0.size[0] * m0.mpv / 2, m0.size[1] * m0.mpv / 2], uc1: [m0.mpv * m0.lo.f, m0.size[0] * m0.mpv / 2, m0.size[1] * m0.mpv / 2], win: townWinMesh(m0) };   // win：亮窗的窗片（夜裡的燈）
      });
    }));
  }).then(function () {
    // 貼圖：收到的模型照名字一個一列往下排（寬 ＝ 最寬那一列、高 ＝ 加總，各取 2 的次方）；那一列的座標寫進那個模型的 im（畫貼圖照它取，townBin）
    var aw = 1, y = 0;
    need.forEach(function (nm) { var im = M[nm].m.im; aw = Math.max(aw, im.cw * I.views); M[nm].m = Object.assign({}, M[nm].m, { im: Object.assign({}, im, { x: 0, y: y }) }); y += im.ch; });
    aw = 1 << Math.ceil(Math.log2(aw)); var ah = 1 << Math.ceil(Math.log2(Math.max(1, y)));
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, aw, ah, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.bindTexture(gl.TEXTURE_2D, null);
    return Promise.all(need.map(function (nm) {                      // 一列一列貼（texSubImage2D 不預乘 alpha ⇒ 透明像素塗的顏色照留，mipmap 不帶黑邊）
      return new Promise(function (ok) {
        var im = new Image();
        im.onload = function () { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, M[nm].m.im.y, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.bindTexture(gl.TEXTURE_2D, null); ok(); };
        im.onerror = function () { ok(); };
        im.src = 'data:image/png;base64,' + M[nm].png;
      });
    })).then(function () {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.bindTexture(gl.TEXTURE_2D, null);
      return { tex: tex, aw: aw, ah: ah };
    });
  }).then(function (A) {
    need.forEach(function (nm) { delete M[nm].png; });
    TOWNS.kit = { M: M, names: names, byUse: I.byUse, byStyle: I.byStyle, tex: A.tex, aw: A.aw, ah: A.ah, views: I.views };
    TOWNS.stat.kitMs = +(performance.now() - t0).toFixed(1);
    TOWNS.stat.kitN = need.length + '/' + names.length;              // 要了幾個／索引裡有幾個
    TOWNS.stat.kitTris = need.reduce(function (o, nm) { o[nm] = [M[nm].lod[0].nq * 2, M[nm].lod[1].nq * 2]; return o; }, {});
    TOWNS.list.forEach(function (T) { T.inst = null; }); TOWNS.dirty = true;
    if (TOWNS.kitRedo) { TOWNS.kitRedo = false; townKitFree(); }   // 解的時候又來了新的城、要的模型變多 ⇒ 丟掉重要一次
  }, function (e) { TOWNS.err = '模型解不開：' + e.message; console.warn('城鎮：' + TOWNS.err); });
  return TOWNS.kitP;
}
/** 丟掉解好的模型（GPU 的網格、貼圖）⇒ 下一格照新的城重要。 */
function townKitFree() {
  var K = TOWNS.kit; TOWNS.kit = null; TOWNS.kitP = null; TOWNS.kitHas = null;
  if (!K) return;
  Object.keys(K.M).forEach(function (nm) { K.M[nm].lod.concat(K.M[nm].win ? [K.M[nm].win] : []).forEach(function (r) { gl.deleteVertexArray(r.vao); gl.deleteBuffer(r.vbo); }); });
  if (K.tex) gl.deleteTexture(K.tex);
  TOWNS.list.forEach(function (T) { T.inst = null; }); TOWNS.dirty = true;
}

// ── 實例（一座城建一次：建築、城牆、石基；屋頂殼、地面的帶子） ──
/** 城 T 的實例：[{ k: 模型名, x, y, z, th（模型 +x 在平面上 ＝ (sinθ, −cosθ)）, sx（沿 x 縮放）, sh（深淺）, r（外框半徑）, pl: 石基 [w, d] 或 null, foot: 屋頂殼用的佔地 m² }]；y 是 NaN ⇒ 等那一塊載進來（townGround）。 */
function townInst(T) {
  var K = TOWNS.kit, p = T.p, out = [], D2R = Math.PI / 180, skip = TOWNS.stat.skip;
  function W(q) { var e = T.E(q); return [e[0] - BED.ax, e[1] - BED.az]; }
  (p.lots || []).forEach(function (l) {
    if (l.use === 'plot' || l.use === 'plaza') return;
    var L = townPick(K, T.style, l);
    if (!L || !L.length) { skip[l.use] = (skip[l.use] || 0) + 1; return; }
    var nm = L[Math.floor(townHash(T.id + ':' + l.id) * L.length)], m = K.M[nm].m, th = l.rot * D2R, md = m.size[1] * m.mpv, mw = m.size[0] * m.mpv;
    var off = (l.d - md) / 2, c = W([l.at[0] + off * Math.cos(th), l.at[1] + off * Math.sin(th)]);
    var lk = Math.max(1, Math.min(TOWN_LM[1], Math.max(mw, md, m.top) / TOWN_LM[0]));
    out.push({ k: nm, x: c[0], y: l.h, z: c[1], th: th, sx: 1, sh: 0.92 + 0.16 * townHash(l.id + '#'), r: Math.hypot(mw, md) / 2 + 2, top: m.top, pl: [mw, md], foot: mw * md * m.cover, col: m.roof, lot: l.id, lk: lk });
  });
  (p.walls || []).forEach(function (w) { townWall(T, w, out, W); });
  TOWNS.stat.inst = TOWNS.list.reduce(function (s, T2) { return s + (T2 === T ? out.length : (T2.inst || []).length); }, 0);
  TOWNS.stat.lots = TOWNS.list.reduce(function (s, T2) { return s + (T2.p.lots || []).length; }, 0);
  return out;
}
/** 一條城牆 ⇒ 門、塔、轉角、收尾照位置，中間的斷面沿路線接成一條斜接的折線（照 w.kit 挑那一套；BUILDING_SPEC §6）。
 *  t ＝ 從起點沿路線量的長度（閉合的牆繞回來）；部件佔掉 [t0, t1]，兩頭的接口 p0、p1 ＝ 中心 ∓ 半長·軸（軸 ＝ 路線上兩個接口那兩點的弦 ⇒ 擺在頂點上就是角平分）。 */
function townWall(T, w, out, W) {
  var K = TOWNS.kit, P = [], closed = !!w.closed;
  w.path.map(W).forEach(function (q) { var l = P[P.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.01) P.push(q); });   // 重複的點拿掉（頂點轉幾度才量得準）
  if (closed && P.length > 2 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) <= 0.01) P.pop();
  if (P.length < 2) return; if (P.length < 3) closed = false; if (closed) P = P.concat([P[0]]);
  var cum = [0]; for (var i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  var Ltot = cum[cum.length - 1], nV = P.length - 1; if (Ltot < 1) return;   // 頂點 0…nV（閉合 ⇒ nV 跟 0 是同一點）
  var cen = [T.cen[0] - BED.ax, T.cen[1] - BED.az];
  function at(t) { t = closed ? ((t % Ltot) + Ltot) % Ltot : Math.max(0, Math.min(Ltot, t)); for (var q = 1; q < P.length; q++) if (t <= cum[q] || q === P.length - 1) { var L = cum[q] - cum[q - 1] || 1, u = (t - cum[q - 1]) / L; return { x: P[q - 1][0] + (P[q][0] - P[q - 1][0]) * u, z: P[q - 1][1] + (P[q][1] - P[q - 1][1]) * u, a: Math.atan2(P[q][1] - P[q - 1][1], P[q][0] - P[q - 1][0]) }; } return { x: P[0][0], z: P[0][1], a: 0 }; }
  function proj(q) { var best = 0, bd = Infinity; for (var s = 1; s < P.length; s++) { var a = P[s - 1], b = P[s], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)), d = Math.hypot(q[0] - a[0] - u * dx, q[1] - a[1] - u * dy); if (d < bd) { bd = d; best = cum[s - 1] + u * Math.sqrt(L2); } } return best; }
  function dir(s) { var dx = P[s][0] - P[s - 1][0], dz = P[s][1] - P[s - 1][1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }   // 第 s 段（P[s−1] → P[s]）的方向
  function turn(v) { var a = dir(v === 0 ? nV : v), b = dir(v + 1); return Math.atan2(Math.abs(a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1]); }   // 頂點 v（閉合 0…nV−1、開放 1…nV−1）轉了幾度（弧度）
  function put(nm, c, a, sx, outward, sh) {
    var m = K.M[nm].m, hw = m.size[0] * m.mpv * sx / 2, hd = m.size[1] * m.mpv / 2;
    if (outward && -Math.sin(a) * (c[0] - cen[0]) + Math.cos(a) * (c[1] - cen[1]) < 0) a += Math.PI;
    var q = { k: nm, x: c[0], y: NaN, z: c[1], th: a + Math.PI / 2, sx: sx, sh: sh || 0.95 + 0.1 * townHash(w.id + ':' + out.length), r: Math.hypot(hw, hd) + 2, top: m.top, pl: null, foot: 4 * hw * hd * m.cover, col: m.roof, wall: w.id, lk: 1,
              mj: [0, 0, 0, 0], ft: [hw, hd] };                          // mj ＝ 著色器的 aJ（−x、+x 那一頭的斜接、坡度、牆基往下延；後兩個 townWallY 填）、ft ＝ 半長、半厚
    out.push(q); TOWNS.stat.walls++; return q;
  }
  function half(nm) { var m = K.M[nm].m, pa = m.pts['wall-a'], pb = m.pts['wall-b']; return pa && pb ? (pb[0] - pa[0] + 1) * m.mpv / 2 : m.size[0] * m.mpv / 2; }
  var kit = w.kit || 'wall1';
  if (!K.byUse[kit + '-section']) { TOWNS.stat.skip['wall:' + kit] = (TOWNS.stat.skip['wall:' + kit] || 0) + 1; kit = 'wall1'; }
  var gate = (K.byUse[kit + '-gate'] || [])[0], towers = K.byUse[kit + '-tower'] || [], sect = (K.byUse[kit + '-section'] || [])[0], end = (K.byUse[kit + '-end'] || [])[0], joint = (K.byUse[kit + '-joint'] || [])[0];
  if (!sect) return;
  var mS = K.M[sect].m, len = mS.len || 2, mW = mS.size[0] * mS.mpv, shW = 0.95 + 0.1 * townHash(w.id), obs = [];   // 斷面一條牆同一個深淺（一節一個 ⇒ 每 len 公尺一條色差）
  var parts = [];                                                       // 門、塔、轉角：{ nm, t（中心）, h（半長）, tower }
  (w.gates || []).forEach(function (g) { if (gate) parts.push({ nm: gate, t: proj(W(g.at)), h: half(gate) }); });
  (w.towers || []).forEach(function (q, i) { if (towers.length) { var nm = towers[i % towers.length]; parts.push({ nm: nm, t: proj(W(q)), h: half(nm), tower: true }); } });
  var cor = joint || towers[0], gap = Math.max(2 * len, 6);
  function apart(a0, a1, b0, b1) { var d = Infinity; (closed ? [0, Ltot, -Ltot] : [0]).forEach(function (sh) { d = Math.min(d, Math.max(0, b0 + sh - a1, a0 - b1 - sh)); }); return d; }   // 沿牆隔多遠（閉合 ⇒ 繞回來那一邊也算）
  function free(p, t, h) { return parts.every(function (o) { return o === p || apart(t - h, t + h, o.t - o.h, o.t + o.h) >= 0.5; }); }
  if (cor) {                                                            // 轉角（轉得急的頂點）：已經有部件跨在上面 ⇒ 不動；gap 內有塔 ⇒ 塔挪到轉角上；都沒有 ⇒ 擺一件（同世紀帝國轉角的塔）
    var hc = half(cor);
    for (var v = closed ? 0 : 1; v < nV; v++) {
      var tv = cum[v]; if (turn(v) < TOWN_WALL_CORNER * Math.PI / 180) continue;
      if (parts.some(function (o) { return apart(tv, tv, o.t - o.h, o.t + o.h) === 0; })) continue;
      var near = parts.filter(function (o) { return o.tower && apart(tv, tv, o.t - o.h, o.t + o.h) < gap + hc; }).sort(function (a, b) { return apart(tv, tv, a.t, a.t) - apart(tv, tv, b.t, b.t); })[0];
      if (near && free(near, tv, near.h) && (closed || (tv - near.h > 0 && tv + near.h < Ltot))) { near.t = tv; TOWNS.stat.snapped++; continue; }
      if (!closed && (tv - hc < gap || tv + hc > Ltot - gap)) continue;   // 開放的牆兩頭有收尾
      if (!parts.every(function (o) { return apart(tv - hc, tv + hc, o.t - o.h, o.t + o.h) >= (near ? 0.5 : gap); })) continue;
      parts.push({ nm: cor, t: tv, h: hc }); TOWNS.stat.corners++;
    }
  }
  parts.forEach(function (o) {                                          // 擺：軸 ＝ 路線上兩個接口那兩點的弦
    var t = o.t, h = o.h, A = at(t - h), B = at(t + h), s = at(t), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ax = L > 0.01 ? [dx / L, dz / L] : [Math.cos(s.a), Math.sin(s.a)];
    put(o.nm, [s.x, s.z], Math.atan2(ax[1], ax[0]), 1, true);
    obs.push({ t0: t - h, t1: t + h, p0: [s.x - ax[0] * h, s.z - ax[1] * h], p1: [s.x + ax[0] * h, s.z + ax[1] * h], ax: ax });
  });
  if (!closed && end) {                                                 // 收尾：模型的 wall-a（−x 那一面）接牆身 ⇒ 起點那一頭朝外轉 180°
    var mE = K.M[end].m, lE = mE.size[0] * mE.mpv / 2, s0 = at(0), s1 = at(Ltot);
    put(end, [s0.x - Math.cos(s0.a) * lE, s0.z - Math.sin(s0.a) * lE], s0.a + Math.PI, 1, false);
    put(end, [s1.x + Math.cos(s1.a) * lE, s1.z + Math.sin(s1.a) * lE], s1.a, 1, false);
  }
  // 部件之間的空檔 ⇒ 一段一段（s0、s1 ＝ 兩頭的接口與端面的法線；閉合又沒有部件 ⇒ 整圈一段，起點那一站跟最後一節斜接）
  obs.sort(function (a, b) { return a.t0 - b.t0; });
  var runs = [], tip = closed ? null : { t: 0, p: P[0], n: dir(1) };
  if (closed && obs.length) { var oL = obs.reduce(function (m, o) { return o.t1 > m.t1 ? o : m; }); tip = { t: oL.t1 - Ltot, p: oL.p1, n: oL.ax }; }
  obs.forEach(function (o) { if (tip && o.t0 > tip.t) runs.push({ t0: tip.t, t1: o.t0, s0: tip, s1: { p: o.p0, n: o.ax } }); if (!tip || o.t1 > tip.t) tip = { t: o.t1, p: o.p1, n: o.ax }; });
  if (!closed && tip.t < Ltot) runs.push({ t0: tip.t, t1: Ltot, s0: tip, s1: { p: P[nV], n: dir(nV) } });
  if (closed && !obs.length) runs.push({ t0: 0, t1: Ltot, s0: null, s1: null });
  runs.forEach(function (f) {
    var L = f.t1 - f.t0; if (L < len * 0.4) return;
    var vs = [], br = [f.t0], S = [], X, D = [], N = [], j, k;
    for (var v2 = closed ? 0 : 1; v2 < nV; v2++) if (turn(v2) > 1e-3) (closed ? [0, Ltot, -Ltot] : [0]).forEach(function (sh) { var tv2 = cum[v2] + sh; if (tv2 > f.t0 && tv2 < f.t1) vs.push(tv2); });
    vs.sort(function (a, b) { return a - b; });
    vs.forEach(function (tv2) { if (tv2 - br[br.length - 1] >= len / 2 && f.t1 - tv2 >= len / 2) br.push(tv2); }); br.push(f.t1);   // 頂點一定是站（離上一站或尾巴不到半節的不算）
    for (j = 0; j + 1 < br.length; j++) { var n = Math.max(1, Math.round((br[j + 1] - br[j]) / len)); for (k = 0; k < n; k++) S.push(br[j] + k * (br[j + 1] - br[j]) / n); }
    S.push(f.t1);
    X = S.map(function (t, i2) { if (i2 === 0 && f.s0) return f.s0.p; if (i2 === S.length - 1 && f.s1) return f.s1.p; var s = at(t); return [s.x, s.z]; });
    for (k = 0; k + 1 < X.length; k++) { var dx = X[k + 1][0] - X[k][0], dz = X[k + 1][1] - X[k][1], l = Math.hypot(dx, dz) || 1; D.push([dx / l, dz / l]); }
    for (j = 0; j < X.length; j++) {                                  // 每一站的端面法線：兩節的角平分（接口照部件的軸）
      if (j === 0) N.push(f.s0 ? f.s0.n : [D[D.length - 1][0] + D[0][0], D[D.length - 1][1] + D[0][1]]);
      else if (j === X.length - 1) N.push(f.s1 ? f.s1.n : N[0]);
      else N.push([D[j - 1][0] + D[j][0], D[j - 1][1] + D[j][1]]);
    }
    for (k = 0; k + 1 < X.length; k++) {
      var A = X[k], B = X[k + 1], ch = Math.hypot(B[0] - A[0], B[1] - A[1]); if (ch < 0.05) continue;
      var q = put(sect, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], Math.atan2(B[1] - A[1], B[0] - A[0]), ch / mW, true, shW);
      var s = Math.sin(q.th), c = Math.cos(q.th), fl = s * (B[0] - A[0]) - c * (B[1] - A[1]) < 0;   // 翻了面（−y 朝外）⇒ 模型 +x 朝 A
      var kA = townMiter(fl ? N[k + 1] : N[k], s, c), kB = townMiter(fl ? N[k] : N[k + 1], s, c), d = kB - kA, lim = 0.7 * ch / q.ft[1];
      if (Math.abs(d) > lim) {                                          // 內外兩面最短留 3 成（轉太急又沒擺轉角 ⇒ 寧可留縫、不翻面）：先動接部件的那一頭（部件擋著），兩頭都接斷面 ⇒ 一起縮
        var oA = fl ? k + 1 === X.length - 1 && f.s1 : k === 0 && f.s0, oB = fl ? k === 0 && f.s0 : k + 1 === X.length - 1 && f.s1, ex = (Math.abs(d) - lim) * (d > 0 ? 1 : -1);
        if (oA && !oB) kA += ex; else if (oB && !oA) kB -= ex; else { kA *= lim / Math.abs(d); kB *= lim / Math.abs(d); }
      }
      q.mj[0] = kA; q.mj[1] = kB; q.ja = fl ? B : A; q.jb = fl ? A : B;
    }
  });
}
/** 斜接：模型（轉 θ：+x ＝ (sinθ, −cosθ)、+y ＝ (−cosθ, −sinθ)）那一頭的端面要落在法線 n 的鉛直面上 ⇒ 橫過 1 m 沿 x 挪多少（著色器 a ＋＝ b·k）。 */
function townMiter(n, s, c) {
  var nx = s * n[0] - c * n[1], ny = -c * n[0] - s * n[1];
  return Math.abs(nx) < 1e-3 ? 0 : Math.max(-TOWN_WALL_KMAX, Math.min(TOWN_WALL_KMAX, -ny / nx));
}
/** 城牆的實例那一塊載進來了 ⇒ 高度：斷面照兩頭的站（地面；水上照海面 0）線性接 ⇒ 坡度 g，別的部件照中心；牆基（模型 z 0 那一層）往下延到腳下最低的地面再 0.3 m。地面沒載 ⇒ false（下次分組再試）。 */
function townWallY(q) {
  var s = Math.sin(q.th), c = Math.cos(q.th), hw = q.ft[0], hd = q.ft[1], y, g = 0, lo = 0;
  function gnd(p) { return Math.max(0, townGround(p[0], p[1])); }
  if (q.ja) { var ya = gnd(q.ja), yb = gnd(q.jb); y = (ya + yb) / 2; g = (yb - ya) / (2 * hw); } else y = gnd([q.x, q.z]);
  if (!(y === y) || !(g === g)) return false;
  [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]].forEach(function (o) {
    var a = o[0] * hw, b = o[1] * hd, gy = townGround(q.x + a * s - b * c, q.z - a * c - b * s); if (gy === gy) lo = Math.max(lo, y + g * a - gy);
  });
  q.y = y; q.mj[2] = g; q.mj[3] = Math.min(30, lo + 0.3); q.r += Math.abs(g) * hw + q.mj[3];
  return true;
}
/** 路面讀畫面地形的三角形（跟 bedMesh 的對角線一樣），不用雙線性高度把路切進坡面。 */
function townRoadHeight(x, z) {
  var q = bedCell(x, z); if (!q) return NaN;
  var C = q.C, h = townHv(C), n = C.n, i = Math.min(n - 2, Math.floor(q.u)), j = Math.min(n - 2, Math.floor(q.v)), u = q.u - i, v = q.v - j, o = j * n + i;
  return (u + v <= 1 ? h[o] + u * (h[o + 1] - h[o]) + v * (h[o + n] - h[o]) : h[o + n + 1] + (1 - u) * (h[o + n] - h[o + n + 1]) + (1 - v) * (h[o + 1] - h[o + n + 1])) / 10;
}
/** 整個路網的聯集：共用 2 m 格、格子的兩個三角形各裁一次距離場，路口不會有重疊面或尖長斜接。
 *  格子沿海域座標（地形點距為整數公尺），對角線同 bedMesh；只掃路邊的格，不掃整個城市外框。
 *  z 只是塊還沒到時的顯示備援，不改規劃、不寫模擬高度。 */
async function townRoadSurface(roads) {
  var nodes = new Map(), cells = new Map(), out = { v: [], i: [], edges: [] }, verts = new Map();
  var deadline = performance.now() + TOWN_MESH_MS;
  for (var r of roads) {
    var hw = r.w / 2, col = TOWN_COL[r.kind] || TOWN_COL.street; if (!(hw > 0)) continue;
    for (var q = 1; q < r.P.length; q++) {
      var a = r.P[q - 1], b = r.P[q], za = r.z[q - 1], zb = r.z[q], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
      if (za == null || zb == null || L2 < 1e-8) continue;
      var parts = Math.max(1, Math.ceil(Math.sqrt(L2) / 16));
      for (var part = 0; part < parts; part++) {
        var x0 = a[0] + dx * part / parts, z0 = a[1] + dz * part / parts, x1 = a[0] + dx * (part + 1) / parts, z1 = a[1] + dz * (part + 1) / parts;
        var loX = 2 * Math.floor((Math.min(x0, x1) - hw - 2) / 2), hiX = 2 * Math.ceil((Math.max(x0, x1) + hw + 2) / 2), loZ = 2 * Math.floor((Math.min(z0, z1) - hw - 2) / 2), hiZ = 2 * Math.ceil((Math.max(z0, z1) + hw + 2) / 2);
        for (var z = loZ; z <= hiZ; z += 2) for (var x = loX; x <= hiX; x += 2) {
          var u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)), ex = x - a[0] - u * dx, ez = z - a[1] - u * dz, d = Math.sqrt(ex * ex + ez * ez) - hw, key = x + ':' + z, old = nodes.get(key);
          if (!old || d < old[2]) nodes.set(key, [x, z, d, za + (zb - za) * u, col]);
          if (x < hiX && z < hiZ) cells.set(key, [x, z]);
        }
        if (performance.now() > deadline) { await new Promise(function (ok) { setTimeout(ok, 0); }); deadline = performance.now() + TOWN_MESH_MS; }
      }
    }
  }
  function vertex(p) {
    var key = p[0].toFixed(6) + ':' + p[1].toFixed(6), k = verts.get(key);
    if (k != null) return k;
    k = out.v.length; out.v.push([p[0], p[1], p[3], p[4]]); verts.set(key, k); return k;
  }
  function clip(P) {
    var C = [];
    for (var j = 0; j < P.length; j++) {
      var a = P[j], b = P[(j + 1) % P.length], ia = a[2] <= 0, ib = b[2] <= 0;
      if (ia) C.push(a);
      if (ia !== ib) { var u = a[2] / (a[2] - b[2]); C.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 0, a[3] + (b[3] - a[3]) * u, ia ? a[4] : b[4]]); }
    }
    if (C.length < 3) return;
    var ids = C.map(vertex);
    for (j = 1; j + 1 < C.length; j++) {
      var a = C[0], b = C[j], c = C[j + 1], area = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
      if (area > 1e-9) out.i.push([ids[0], ids[j], ids[j + 1]]);
    }
  }
  for (var q of cells.values()) {
    var x = q[0], z = q[1], a = nodes.get(x + ':' + z), b = nodes.get((x + 2) + ':' + z), c = nodes.get(x + ':' + (z + 2)), d = nodes.get((x + 2) + ':' + (z + 2));
    if (a && b && c && d) { clip([a, c, b]); clip([b, c, d]); }
    if (performance.now() > deadline) { await new Promise(function (ok) { setTimeout(ok, 0); }); deadline = performance.now() + TOWN_MESH_MS; }
  }
  // 只為真正的外緣加側面；相鄰路、內部格線與路口都沒有內牆。
  var edges = new Map();
  for (var f of out.i) {
    for (var i = 0; i < 3; i++) { var a = f[i], b = f[(i + 1) % 3], key = Math.min(a, b) + ':' + Math.max(a, b), e = edges.get(key); if (e) e[2]++; else edges.set(key, [a, b, 1]); }
    if (performance.now() > deadline) { await new Promise(function (ok) { setTimeout(ok, 0); }); deadline = performance.now() + TOWN_MESH_MS; }
  }
  edges.forEach(function (e) { if (e[2] === 1) out.edges.push([e[0], e[1]]); });
  return out;
}

/** 城 T 的路面、廣場、碼頭、棧橋 ⇒ 一份網格（位置、法線、顏色）。 */
function townGroundMesh(T) {
  var V = [], I = [], p = T.p;
  function vtx(x, y, z, c, nx, ny, nz) { V.push(x, y, z, nx == null ? 0 : nx, ny == null ? 1 : ny, nz == null ? 0 : nz, c[0], c[1], c[2]); return V.length / 9 - 1; }
  function W(q) { var e = T.E(q); return [e[0] - BED.ax, e[1] - BED.az]; }
  // 拓樸只算一次；地形塊或整地到了，只重取高度，不再用中心線的 z 把路埋進地裡。
  var R = T.roadSurface || { v: [], i: [], edges: [] }, N = [], H = [];
  R.v.forEach(function (q) { var x = q[0] - BED.ax, z = q[1] - BED.az, y = townRoadHeight(x, z); H.push((y === y ? y : q[2]) + TOWN_ROAD_LIFT); N.push([0, 0, 0]); });
  R.i.forEach(function (f) {
    var a = R.v[f[0]], b = R.v[f[1]], c = R.v[f[2]], ux = b[0] - a[0], uy = H[f[1]] - H[f[0]], uz = b[1] - a[1], vx = c[0] - a[0], vy = H[f[2]] - H[f[0]], vz = c[1] - a[1];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    f.forEach(function (k) { N[k][0] += nx; N[k][1] += ny; N[k][2] += nz; });
  });
  R.v.forEach(function (q, k) { var n = N[k], L = Math.hypot(n[0], n[1], n[2]) || 1; vtx(q[0] - BED.ax, H[k], q[1] - BED.az, q[3], n[0] / L, n[1] / L, n[2] / L); });
  R.i.forEach(function (f) { I.push(f[0], f[1], f[2]); });
  R.edges.forEach(function (e) {
    var a = R.v[e[0]], b = R.v[e[1]], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, k = V.length / 9, col = a[3].map(function (c) { return c * 0.74; });
    vtx(a[0] - BED.ax, H[e[0]], a[1] - BED.az, col, -dz / L, 0, dx / L);
    vtx(b[0] - BED.ax, H[e[1]], b[1] - BED.az, col, -dz / L, 0, dx / L);
    vtx(b[0] - BED.ax, H[e[1]] - TOWN_ROAD_LIFT - 0.03, b[1] - BED.az, col, -dz / L, 0, dx / L);
    vtx(a[0] - BED.ax, H[e[0]] - TOWN_ROAD_LIFT - 0.03, a[1] - BED.az, col, -dz / L, 0, dx / L);
    I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  (p.lots || []).forEach(function (l) {                                 // 廣場：整平的那一塊鋪石
    if (l.use !== 'plaza') return;
    var th = l.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), y = l.h + 0.06, base = V.length / 9;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) { var dx = s[0] * l.d / 2, dy = s[1] * l.w / 2, c = W([l.at[0] + dx * cs - dy * sn, l.at[1] + dx * sn + dy * cs]); vtx(c[0], y, c[1], TOWN_COL.plaza); });
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  function slab(P0, w, top, bot, col) {                                 // 一條帶子拉成有厚度的板（碼頭、棧橋的面板）
    var P = P0.map(W);
    for (var q = 1; q < P.length; q++) {
      var a = P[q - 1], b = P[q], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L, hw = w / 2;
      var C4 = [[a[0] - tz * hw, a[1] + tx * hw], [b[0] - tz * hw, b[1] + tx * hw], [b[0] + tz * hw, b[1] - tx * hw], [a[0] + tz * hw, a[1] - tx * hw]], base = V.length / 9;
      C4.forEach(function (c) { vtx(c[0], top, c[1], col); }); I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      for (var e = 0; e < 4; e++) {                                     // 四個側面
        var c0 = C4[e], c1 = C4[(e + 1) % 4], nx = c1[1] - c0[1], nz = -(c1[0] - c0[0]), nl = Math.hypot(nx, nz) || 1, b2 = V.length / 9, dk = [col[0] * 0.78, col[1] * 0.78, col[2] * 0.78];
        vtx(c0[0], top, c0[1], dk, nx / nl, 0, nz / nl); vtx(c1[0], top, c1[1], dk, nx / nl, 0, nz / nl); vtx(c1[0], bot, c1[1], dk, nx / nl, 0, nz / nl); vtx(c0[0], bot, c0[1], dk, nx / nl, 0, nz / nl);
        I.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3);
      }
    }
  }
  (p.quay || []).forEach(function (q) { slab(q.path, q.w, 1.0, -2.5, TOWN_COL.quay); });
  (p.piers || []).forEach(function (q) {
    slab(q.path, q.w, 1.4, 1.0, TOWN_COL.pier);
    var P = q.path.map(W);                                              // 樁：每 4 m 一對
    for (var s = 1; s < P.length; s++) {
      var a = P[s - 1], b = P[s], L = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / (L || 1), tz = (b[1] - a[1]) / (L || 1);
      for (var t = 2; t < L; t += 4) [-1, 1].forEach(function (sd) {
        var cx = a[0] + tx * t - tz * sd * (q.w / 2 - 0.3), cz = a[1] + tz * t + tx * sd * (q.w / 2 - 0.3), r = 0.18, base = V.length / 9;
        [[-r, -r], [r, -r], [r, r], [-r, r]].forEach(function (o) { vtx(cx + o[0], 1.0, cz + o[1], TOWN_COL.post, o[0] / r, 0, o[1] / r); vtx(cx + o[0], -4, cz + o[1], TOWN_COL.post, o[0] / r, 0, o[1] / r); });
        for (var e = 0; e < 4; e++) { var i0 = base + e * 2, i1 = base + ((e + 1) % 4) * 2; I.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1); }
      });
    }
  });
  if (!I.length) return null;
  var bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (var k = 0; k < V.length; k += 9) { bb[0] = Math.min(bb[0], V[k]); bb[1] = Math.min(bb[1], V[k + 1]); bb[2] = Math.min(bb[2], V[k + 2]); bb[3] = Math.max(bb[3], V[k]); bb[4] = Math.max(bb[4], V[k + 1]); bb[5] = Math.max(bb[5], V[k + 2]); }
  return townGpu9(new Float32Array(V), new Uint32Array(I), bb);
}
/** 屋頂殼：每 TOWN_SHELL_G 公尺一格（照實例的中心）⇒ 屋頂高（佔地加權的平均頂）、顏色（屋頂色加權）、覆蓋（佔地 ÷ 格面積）；覆蓋 > 0.12 的格畫成一個平頂方塊（頂＋四面往下到地塊最低的 h − 3 m）。 */
function townShell(T) {
  var G = TOWN_SHELL_G, cells = {}, V = [], I = [];
  T.inst.forEach(function (q) {
    if (!(q.y === q.y) || q.lk > 1) return;                             // 地標不進殼：最遠一級是它自己的貼圖
    var i = Math.floor(q.x / G), j = Math.floor(q.z / G), k = i + ',' + j, c = cells[k] || (cells[k] = { i: i, j: j, a: 0, top: 0, r: 0, g: 0, b: 0, lo: 1e9 });
    var f = q.foot; c.a += f; c.top += f * (q.y + q.top * 0.82); c.r += f * q.col[0]; c.g += f * q.col[1]; c.b += f * q.col[2]; c.lo = Math.min(c.lo, q.y - 3);
  });
  Object.keys(cells).sort().forEach(function (k) {
    var c = cells[k], cov = Math.min(1, c.a / (G * G)); if (cov < 0.12) return;
    var top = c.top / c.a, col = [c.r / c.a, c.g / c.a, c.b / c.a], m = (1 - Math.sqrt(cov)) * G / 2, x0 = c.i * G + m, x1 = (c.i + 1) * G - m, z0 = c.j * G + m, z1 = (c.j + 1) * G - m, base = V.length / 9;
    [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(function (q) { V.push(q[0], top, q[1], 0, 1, 0, col[0], col[1], col[2]); });
    I.push(base, base + 3, base + 2, base, base + 2, base + 1);
    var Q = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], NN = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (var e = 0; e < 4; e++) { var a = Q[e], b = Q[(e + 1) % 4], b2 = V.length / 9, d = 0.72; [[a, top], [b, top], [b, c.lo], [a, c.lo]].forEach(function (s) { V.push(s[0][0], s[1], s[0][1], NN[e][0], 0, NN[e][1], col[0] * d, col[1] * d, col[2] * d); }); I.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3); }
  });
  if (!I.length) return null;
  var bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (var k2 = 0; k2 < V.length; k2 += 9) { bb[0] = Math.min(bb[0], V[k2]); bb[1] = Math.min(bb[1], V[k2 + 1]); bb[2] = Math.min(bb[2], V[k2 + 2]); bb[3] = Math.max(bb[3], V[k2]); bb[4] = Math.max(bb[4], V[k2 + 1]); bb[5] = Math.max(bb[5], V[k2 + 2]); }
  return townGpu9(new Float32Array(V), new Uint32Array(I), bb);
}
function townGpu9(V, I, bb) {
  var g = { vao: gl.createVertexArray(), vb: gl.createBuffer(), ib: gl.createBuffer(), n: I.length, bb: bb };
  gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.bufferData(gl.ARRAY_BUFFER, V, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, I, gl.STATIC_DRAW); gl.bindVertexArray(null);
  return g;
}

// ── 布旗（Tim 2026-10-20「旗幟可以改成布?(參考船隻)」；只給人看） ──
// 模型的 flags（src/townmodels.py flags_of：雕刻的帆裡 meta kind=flag 那幾面的四個角，模型格座標；BUILDING_SPEC §6.2）⇒ 每個實例每面一塊布：
//   TOWN_FLAG_N ＝ 沿飛 × 沿旗桿幾個質點；綁邊（第 0 欄）釘在旗桿上，其他照 Verlet：重力＋往風速拉的阻力（風向 ＝ WIND、風速 ＝ WIND_SAIL × 天氣，跟帆同一份）
//   ＋陣風、擺動（畫面時間的正弦、每面差一個相位 ⇒ 不抽亂數）＋ TOWN_FLAG_IT 次距離約束（橫、直、斜）。
//   ⛔ 不碰戰局：不讀寫模擬的狀態、不用模擬的亂數、砲彈打不到；鏡頭 TOWN_FLAG_SIM 公尺外不動（停在上一個樣子）、TOWN_LOD[1] 外不畫（貼圖那一級沒拍旗）。
//   畫：照圖案的分界再切格（十字的邊不會被內插糊掉）、一格一色；法線翻到朝鏡頭那一面（布兩面都看得到）；用地面帶子那一支著色器（P.gr）。
var TOWN_FLAG_N = [10, 6], TOWN_FLAG_IT = 6, TOWN_FLAG_SIM = 400, TOWN_FLAG_DT = 1 / 60, TOWN_FLAG_DRAG = 1.6, TOWN_FLAG_DAMP = 0.99;
var TOWN_FLAG_PAT = {                                                   // 圖案：u 沿飛（0 旗桿 → 1 尾）、v 沿旗桿（0 上 → 1 下）；cu、cv ＝ 色塊的分界
  genoa: { cu: [0.44, 0.56], cv: [0.4, 0.6], col: function (u, v) { return Math.abs(u - 0.5) < 0.06 || Math.abs(v - 0.5) < 0.1 ? COL_R : COL_W; } }   // 熱那亞：白底紅十字（聖喬治）
};
/** 城 T 的布旗（實例建好之後建一次）：[{ p, pp: 現在、上一步的質點（世界）, C: 約束 [a, b, 長] …, h: 綁邊的上下兩點, at: 中心, ph: 相位, pat }]。 */
function townFlags(T) {
  var K = TOWNS.kit, out = [], NU = TOWN_FLAG_N[0], NV = TOWN_FLAG_N[1];
  (T.inst || []).forEach(function (q) {
    var m = K.M[q.k].m; if (!m.flags || !(q.y === q.y)) return;
    var s = Math.sin(q.th), c = Math.cos(q.th), mpv = m.mpv, hw = m.size[0] * mpv / 2, hd = m.size[1] * mpv / 2;
    function W(v) { var a = (v[0] * mpv - hw) * q.sx, b = v[1] * mpv - hd; return [q.x + a * s - b * c, q.y + v[2] * mpv, q.z - a * c - b * s]; }   // 模型 → 世界（檔頭的公式）
    m.flags.forEach(function (f, fi) {
      var h0 = W(f.hoist[0]), h1 = W(f.hoist[1]), f0 = W(f.fly[0]), f1 = W(f.fly[1]), p = new Float32Array(NU * NV * 3), C = [];
      for (var i = 0; i < NU; i++) for (var j = 0; j < NV; j++) {
        var u = i / (NU - 1), v = j / (NV - 1), o = (i * NV + j) * 3;
        for (var k = 0; k < 3; k++) p[o + k] = (h0[k] * (1 - v) + h1[k] * v) * (1 - u) + (f0[k] * (1 - v) + f1[k] * v) * u;
      }
      function link(a, b) { C.push(a, b, Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2])); }
      for (var i2 = 0; i2 < NU; i2++) for (var j2 = 0; j2 < NV; j2++) {
        var a = i2 * NV + j2;
        if (i2 + 1 < NU) link(a, a + NV);
        if (j2 + 1 < NV) link(a, a + 1);
        if (i2 + 1 < NU && j2 + 1 < NV) { link(a, a + NV + 1); link(a + 1, a + NV); }
      }
      out.push({ p: p, pp: Float32Array.from(p), C: new Float32Array(C), h: [h0, h1], at: [(h0[0] + f1[0]) / 2, (h0[1] + f1[1]) / 2, (h0[2] + f1[2]) / 2],
                 ph: townHash((q.lot || q.k) + ':flag' + fi) * 6.2832, pat: TOWN_FLAG_PAT[f.pattern] || null, acc: 0, vao: null, vb: null, V: null, n: 0, lk: q.lk || 1 });
    });
  });
  return out;
}
function townFlagFree(T) { (T.flags || []).forEach(function (F) { if (F.vao) { gl.deleteVertexArray(F.vao); gl.deleteBuffer(F.vb); } }); T.flags = null; }
/** 一步（dt 秒、t ＝ 畫面時間）：Verlet ⇒ 釘綁邊 ⇒ 約束（綁邊那一欄不動）。 */
function townFlagStep(F, dt, t) {
  var p = F.p, pp = F.pp, NU = TOWN_FLAG_N[0], NV = TOWN_FLAG_N[1], wl = Math.hypot(WIND[0], WIND[2]) || 1, wx = WIND[0] / wl, wz = WIND[2] / wl;
  var ws = WIND_SAIL * WX.wind * WIND_SPD * (1 + 0.25 * Math.sin(t * 1.3 + F.ph) + 0.1 * Math.sin(t * 3.7 + F.ph * 2)), kd = TOWN_FLAG_DRAG, dt2 = dt * dt;
  for (var i = 1; i < NU; i++) {
    var u = i / (NU - 1), lat = ws * 0.35 * u * Math.sin(t * 7.1 + F.ph - u * 5), up = ws * 0.12 * u * Math.sin(t * 5.3 + F.ph * 1.7 + u * 4);   // 擺動：越往尾越大、沿布往後傳
    for (var j = 0; j < NV; j++) {
      var o = (i * NV + j) * 3;
      for (var k = 0; k < 3; k++) {
        var x = p[o + k], vel = (x - pp[o + k]) / dt, wv = k === 0 ? wx * ws - wz * lat : k === 2 ? wz * ws + wx * lat : up;
        p[o + k] = x + (x - pp[o + k]) * TOWN_FLAG_DAMP + (kd * (wv - vel) - (k === 1 ? 9.8 : 0)) * dt2; pp[o + k] = x;
      }
    }
  }
  for (var j2 = 0; j2 < NV; j2++) { var v = j2 / (NV - 1), o2 = j2 * 3; for (var k2 = 0; k2 < 3; k2++) p[o2 + k2] = pp[o2 + k2] = F.h[0][k2] * (1 - v) + F.h[1][k2] * v; }
  var C = F.C;
  for (var it = 0; it < TOWN_FLAG_IT; it++) for (var c = 0; c < C.length; c += 3) {
    var a = C[c], b = C[c + 1], wa = a < NV ? 0 : 1, wb = b < NV ? 0 : 1; if (!(wa + wb)) continue;
    var A = a * 3, B = b * 3, dx = p[B] - p[A], dy = p[B + 1] - p[A + 1], dz = p[B + 2] - p[A + 2], L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, e = (L - C[c + 2]) / L / (wa + wb);
    p[A] += dx * e * wa; p[A + 1] += dy * e * wa; p[A + 2] += dz * e * wa; p[B] -= dx * e * wb; p[B + 1] -= dy * e * wb; p[B + 2] -= dz * e * wb;
  }
}
/** 布 ⇒ 三角形（位置、法線、顏色，36 bytes；跟地面帶子同一個佈局）寫進它自己的緩衝區；回傳三角形數。 */
function townFlagMesh(F, eye) {
  var p = F.p, NU = TOWN_FLAG_N[0], NV = TOWN_FLAG_N[1], N = new Float32Array(p.length);
  function P(i, j, k) { return p[(i * NV + j) * 3 + k]; }
  for (var i = 0; i < NU; i++) for (var j = 0; j < NV; j++) {          // 每個質點的法線：沿飛 × 沿旗桿（中央差分）
    var i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, NU - 1), j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, NV - 1), du = [], dv = [];
    for (var k = 0; k < 3; k++) { du.push(P(i1, j, k) - P(i0, j, k)); dv.push(P(i, j1, k) - P(i, j0, k)); }
    var n = norm([du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]]), o = (i * NV + j) * 3;
    N[o] = n[0]; N[o + 1] = n[1]; N[o + 2] = n[2];
  }
  function at(u, v, out, A) {                                           // (u, v) 的位置或法線（四個質點雙線性）
    var fi = u * (NU - 1), fj = v * (NV - 1), i = Math.min(Math.floor(fi), NU - 2), j = Math.min(Math.floor(fj), NV - 2), a = fi - i, b = fj - j;
    for (var k = 0; k < 3; k++) out[k] = (A[(i * NV + j) * 3 + k] * (1 - b) + A[(i * NV + j + 1) * 3 + k] * b) * (1 - a) + (A[((i + 1) * NV + j) * 3 + k] * (1 - b) + A[((i + 1) * NV + j + 1) * 3 + k] * b) * a;
    return out;
  }
  function cuts(n, extra) { var L = []; for (var q = 0; q < n; q++) L.push(q / (n - 1)); return L.concat(extra || []).sort(function (x, y) { return x - y; }); }
  var pat = F.pat, Us = cuts(NU, pat && pat.cu), Vs = cuts(NV, pat && pat.cv), nv = (Us.length - 1) * (Vs.length - 1) * 6;
  if (!F.V || F.V.length < nv * 9) F.V = new Float32Array(nv * 9);
  var V = F.V, w = 0, ps = [0, 0, 0], ns = [0, 0, 0];
  for (var a2 = 0; a2 + 1 < Us.length; a2++) for (var b2 = 0; b2 + 1 < Vs.length; b2++) {
    var u0 = Us[a2], u1 = Us[a2 + 1], v0 = Vs[b2], v1 = Vs[b2 + 1], col = pat ? pat.col((u0 + u1) / 2, (v0 + v1) / 2) : COL_W;
    [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]].forEach(function (c) {
      at(c[0], c[1], ps, p); at(c[0], c[1], ns, N);
      var fl = (eye[0] - ps[0]) * ns[0] + (eye[1] - ps[1]) * ns[1] + (eye[2] - ps[2]) * ns[2] < 0 ? -1 : 1;   // 背面朝鏡頭 ⇒ 法線翻過來
      V[w++] = ps[0]; V[w++] = ps[1]; V[w++] = ps[2]; V[w++] = ns[0] * fl; V[w++] = ns[1] * fl; V[w++] = ns[2] * fl; V[w++] = col[0]; V[w++] = col[1]; V[w++] = col[2];
    });
  }
  if (!F.vao) {
    F.vao = gl.createVertexArray(); F.vb = gl.createBuffer(); gl.bindVertexArray(F.vao); gl.bindBuffer(gl.ARRAY_BUFFER, F.vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  } else { gl.bindVertexArray(F.vao); gl.bindBuffer(gl.ARRAY_BUFFER, F.vb); }
  gl.bufferData(gl.ARRAY_BUFFER, V.subarray(0, w), gl.DYNAMIC_DRAW); F.n = w / 9;
  return F.n / 3;
}

// ── 著色器 ──
// 體素（近、中）：格座標 ⇒ 模型公尺（uC ＝ 一格幾公尺、模型中心 x、y）⇒ 地塊的轉向 ⇒ 世界；實例 aI ＝ (x, y, z, θ)、aS ＝ (沿 x 縮放, 深淺, 地標倍率 lk ⇒ vD ＝ 距離 ÷ lk)、
//   aJ ＝ 城牆的 (−x 那一頭的斜接, +x 那一頭的斜接, 坡度, 牆基往下延)（建築都是 0）：沿 x 照 u 內插的 k ⇒ a ＋＝ b·k（切成梯形，相鄰兩節在角平分面上密合）、
//   高 ＋＝ 坡度·a（用斜接之前的 a ⇒ 端面上每一點的高度都是那一站的高度）、z 0 那一層的底往下延；法線照這個變形的餘因子矩陣轉。
var TOWN_VS = '#version 300 es\nlayout(location=0) in uvec4 aV; layout(location=4) in vec4 aI; layout(location=5) in vec3 aS; layout(location=6) in vec4 aJ; uniform mat4 uVP; uniform vec3 uC; uniform vec3 uEye;\n' +
  'out vec3 vL; out vec3 vW; out vec3 vN; flat out uint vC; flat out uint vF; out float vK; out float vD;\n' +
  'const vec3 NT[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));\n' +
  'void main(){ vec3 p=vec3(aV.xyz); vL=p; float s=sin(aI.w), c=cos(aI.w), a=(p.x*uC.x-uC.y)*aS.x, b=p.y*uC.x-uC.z;\n' +
  ' float u=p.x*uC.x/(2.0*uC.y), k=mix(aJ.x,aJ.y,u), A=1.0+b*(aJ.y-aJ.x)/(2.0*uC.y*aS.x), e=a+b*k;\n' +
  ' vec3 w=vec3(aI.x+e*s-b*c, aI.y+p.z*uC.x+aJ.z*a-(aV.z==0u?aJ.w:0.0), aI.z-e*c-b*s); uint f=aV.w&7u; vec3 m=NT[int(f)];\n' +
  ' m=vec3(m.x-aJ.z*m.z, A*m.y-k*m.x+k*aJ.z*m.z, A*m.z); vN=vec3(m.x*s-m.y*c, m.z, -m.x*c-m.y*s); vF=f; vC=(aV.w>>3u)&255u; vK=aS.y; vW=w; vD=length(aI.xz-uEye.xz)/aS.z; gl_Position=uVP*vec4(w,1.0); }\n';
// 交接：uIn ＝ 這一級從哪裡開始出現（抖動淡入）、uOut ＝ 到哪裡淡出 —— 同一個像素的門檻跟隔壁那一級共用 ⇒ 互補（照實例中心的距離 vD ⇒ 整棟一起換）
var TOWN_FADE = TREE_DITHER + 'uniform vec2 uIn, uOut; bool townCut(float d){ float di=treeDi(gl_FragCoord.xy); return smoothstep(uIn.x,uIn.y,d)<=di || smoothstep(uOut.x,uOut.y,d)>di; }\n';
var TOWN_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + TLAMP_GLSL + TOWN_FADE + 'in vec3 vL; in vec3 vW; in vec3 vN; flat in uint vC; flat in uint vF; in float vK; in float vD; uniform vec3 uSun,uEye,uFog,uSky,uGround; uniform float uFogD, uEdge; out vec4 o;\n' +
    'const vec3 NT[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));\n' +
    'float h3(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }\n' +
    'void main(){ if(vW.y<uClip) discard; if(townCut(vD)) discard; vec3 n=normalize(vN), nl=NT[int(vF)];\n' +
    ' vec3 base=vec3(float((vC>>5u)&7u)/7.0, float((vC>>2u)&7u)/7.0, float(vC&3u)/3.0); base*=0.92+0.16*h3(floor(vL-nl*0.5));\n' +
    ' vec3 f=fract(vL), e=min(f,1.0-f); float ed=min(e.x,e.y); if(vF<2u){ ed=min(e.y,e.z); } else if(vF<4u){ ed=min(e.x,e.z); }\n' +
    ' base*=mix(1.0-0.18*uEdge,1.0,smoothstep(0.0,0.09,ed));\n' +
    ' float sd=dot(n,uSun), d=max(sd,0.0); float sk=shadowK(vW,n*1.5); vec3 col=base*vK*(mix(uGround,uSky,n.y*0.5+0.5)*0.62+vec3(1.0,0.96,0.88)*d*sk*0.78+townLamp(vW,n));\n' +
    ' if(vC==245u) col=mix(col,vec3(1.0,0.74,0.4)*1.7,uTLK);\n' +       // 燈籠的玻璃（色碼 245 只有燈籠用）：夜裡自己發光（夜裡的燈）
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
// 貼圖（遠）：實例 aI ＝ (中心 x, 地塊 h, 中心 z, —)、aR ＝ (右手方向 x, z, 寬, 高)（照取的那一張的視線）、aU ＝ (u0, v0, u 寬, v 高)、aL ＝ 地標倍率；四邊形 aQ ∈ [−½, ½] × [0, 1]
var TOWN_BB_VS = '#version 300 es\nlayout(location=0) in vec2 aQ; layout(location=4) in vec4 aI; layout(location=5) in vec4 aR; layout(location=6) in vec4 aU; layout(location=7) in float aL; uniform mat4 uVP; uniform vec3 uEye; out vec2 vT; out vec3 vW; out float vK; out float vD;\n' +
  'void main(){ vec3 w=aI.xyz+vec3(aR.x,0.0,aR.y)*aQ.x*aR.z+vec3(0.0,aQ.y*aR.w,0.0); vW=w; vK=aI.w; vD=length(aI.xz-uEye.xz)/aL; vT=vec2(aU.x+(aQ.x+0.5)*aU.z, aU.y+(1.0-aQ.y)*aU.w); gl_Position=uVP*vec4(w,1.0); }\n';
var TOWN_BB_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + TOWN_FADE + 'uniform sampler2D uTex; uniform vec3 uEye,uFog; uniform float uFogD,uSunK,uClip; uniform vec3 uBkK; in vec2 vT; in vec3 vW; in float vK; in float vD; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; if(townCut(vD)) discard; vec4 t=texture(uTex,vT); if(t.a<0.5) discard; vec3 col=t.rgb*vK*(0.62+0.38*uSunK)*uBkK;\n' +   // uBkK：世界時間的夜晚只剩月光（08_weather.js todBakeK）
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
// 石基：單位方塊（aP ∈ [−½, ½]³）⇒ 實例 aI ＝ (x, 頂 y, z, θ)、aS ＝ (寬, 深, 高, 深淺)
var TOWN_PL_VS = '#version 300 es\nlayout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=4) in vec4 aI; layout(location=5) in vec4 aS; uniform mat4 uVP; out vec3 vN; out vec3 vW; out float vK;\n' +
  'void main(){ float s=sin(aI.w), c=cos(aI.w), a=aP.x*aS.x, b=aP.y*aS.y; vec3 w=vec3(aI.x+a*s-b*c, aI.y+(aP.z-0.5)*aS.z, aI.z-a*c-b*s);\n' +
  ' vN=vec3(aN.x*s-aN.y*c, aN.z, -aN.x*c-aN.y*s); vW=w; vK=aS.w; gl_Position=uVP*vec4(w,1.0); }\n';
var TOWN_PL_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + TLAMP_GLSL + 'in vec3 vN; in vec3 vW; in float vK; uniform vec3 uSun,uEye,uFog,uSky,uGround,uCol; uniform float uFogD; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; vec3 n=normalize(vN); float d=max(dot(n,uSun),0.0), sk=shadowK(vW,n*1.5); vec3 col=uCol*vK*(0.85+0.15*fract(sin(dot(floor(vW*vec3(2.5,3.3,2.5)),vec3(12.9898,78.233,37.719)))*43758.5453))*(mix(uGround,uSky,n.y*0.5+0.5)*0.62+vec3(1.0,0.96,0.88)*d*sk*0.78+townLamp(vW,n));\n' +
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
// 地面的帶子、屋頂殼：位置、法線、顏色（屋頂殼帶交接的抖動）
var TOWN_GR_VS = '#version 300 es\nlayout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC; uniform mat4 uVP; out vec3 vN; out vec3 vW; out vec3 vC; void main(){ vN=aN; vW=aP; vC=aC; gl_Position=uVP*vec4(aP,1.0); }\n';
var TOWN_GR_FS = function (fade) {
  return '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + TLAMP_GLSL + (fade ? TOWN_FADE : '') + 'in vec3 vN; in vec3 vW; in vec3 vC; uniform vec3 uSun,uEye,uFog,uSky,uGround; uniform float uFogD; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; ' + (fade ? 'if(townCut(length(vW.xz-uEye.xz))) discard; ' : '') + 'vec3 n=normalize(vN); float d=max(dot(n,uSun),0.0), sk=' + (fade ? '1.0' : 'shadowK(vW,n*1.5)') + ';\n' +
    ' vec3 col=vC*(0.9+0.2*fract(sin(dot(floor(vW.xz*1.3),vec2(12.9898,78.233)))*43758.5453))*(mix(uGround,uSky,n.y*0.5+0.5)*0.65+vec3(1.0,0.96,0.88)*d*sk*0.7+townLamp(vW,n));\n' +
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
function townProgs() {
  if (TOWNS.prog) return TOWNS.prog;
  var P = { vox: VK.compile(gl, TOWN_VS, TOWN_FS()), bb: VK.compile(gl, TOWN_BB_VS, TOWN_BB_FS()), pl: VK.compile(gl, TOWN_PL_VS, TOWN_PL_FS()), gr: VK.compile(gl, TOWN_GR_VS, TOWN_GR_FS(false)), sh: VK.compile(gl, TOWN_GR_VS, TOWN_GR_FS(true)) };
  P.ib = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];   // 近、中、貼圖、石基的實例（每次分組重寫）
  P.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1]), gl.STATIC_DRAW);
  P.bbVao = gl.createVertexArray(); gl.bindVertexArray(P.bbVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[2]); [4, 5, 6].forEach(function (a, q) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 52, q * 16); });
  gl.enableVertexAttribArray(7); gl.vertexAttribDivisor(7, 1); gl.vertexAttribPointer(7, 1, gl.FLOAT, false, 52, 48);   // 地標倍率
  // 石基的方塊：六面 × 兩個三角形（位置、法線）
  var V = [], F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1], [0, 0, 1]];   // 頂面排最後：石基只畫前 30 點（不畫頂面，見檔頭「地基」）；街燈的柱子畫 36 點
  F.forEach(function (n) {
    var u = n[0] ? [0, 1, 0] : [1, 0, 0], v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]].forEach(function (s) { for (var k = 0; k < 3; k++) V.push(n[k] * 0.5 + u[k] * s[0] * 0.5 + v[k] * s[1] * 0.5); V.push(n[0], n[1], n[2]); });
  });
  P.cube = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, P.cube); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  P.plVao = gl.createVertexArray(); gl.bindVertexArray(P.plVao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[3]); [4, 5].forEach(function (a, q) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 32, q * 16); });
  gl.bindVertexArray(null);
  TOWNS.prog = P; return P;
}

// ── 分組與畫 ──
/** 看得到的實例照離鏡頭（水平）多遠分到近、中、貼圖（交接帶兩邊都放）；石基跟著近、中。寫進四個實例緩衝區。 */
function townBin(PL, eye) {
  var t0 = performance.now(), K = TOWNS.kit, NM = K.names.length, cnt = [new Int32Array(NM), new Int32Array(NM)], L0 = TOWN_LOD[0], L1 = TOWN_LOD[1], B0 = TOWN_BAND[0], B1 = TOWN_BAND[1], B2 = TOWN_BAND[2], vis = [], nbb = 0, npl = 0, nlm = 0;
  TOWNS.list.forEach(function (T) {
    if (!T.inst) return;
    T.inst.forEach(function (q) {
      if (!(q.y === q.y)) { if (!townWallY(q)) return; T.shDirty = true; }   // 城牆：等那一塊載進來
      var dx = q.x - eye[0], dz = q.z - eye[2], d = Math.sqrt(dx * dx + dz * dz) / (q.lk || 1); if (d > TOWN_FAR[1] + 50) return;   // d ＝ 距離 ÷ 地標倍率（一般房子 1）
      var cy = q.y + q.top / 2, r = q.r + q.top / 2;
      for (var i = 0; i < 6; i++) { var p = PL[i]; if (p[0] * q.x + p[1] * cy + p[2] * q.z + p[3] < -r) return; }
      var mi = K.M[q.k].i, on0 = d < L0 + B0, on1 = d > L0 - B0 && d < L1 + B1, on2 = d > L1 - B1;
      if (q.lk > 1) nlm++;
      if (on0) cnt[0][mi]++; if (on1) cnt[1][mi]++; if (on2) nbb++;
      if ((on0 || on1) && q.pl) { if (!q.pb) q.pb = townPlinth(q); if (q.pb) npl++; }
      vis.push(q, d, on0, on1, on2);
    });
  });
  var off = [new Int32Array(NM), new Int32Array(NM)], tot = [0, 0];
  for (var l = 0; l < 2; l++) for (var m = 0; m < NM; m++) { off[l][m] = tot[l]; tot[l] += cnt[l][m]; }
  function buf(l, need) { if (!TOWNS.buf[l] || TOWNS.buf[l].length < need) TOWNS.buf[l] = new Float32Array(Math.max(need, 16) * 1.5 | 0); return TOWNS.buf[l]; }
  var D0 = buf(0, tot[0] * 11), D1 = buf(1, tot[1] * 11), D2 = buf(2, nbb * 13), D3 = buf(3, npl * 8), at = [off[0].slice(), off[1].slice()], kb = 0, kp = 0, V8 = K.views;
  for (var v = 0; v < vis.length; v += 5) {
    var q = vis[v], Mq = K.M[q.k], mi2 = Mq.i;
    [0, 1].forEach(function (l2) { if (!vis[v + 2 + l2]) return; var o = at[l2][mi2]++ * 11, D = l2 ? D1 : D0, J = q.mj || TOWN_J0; D[o] = q.x; D[o + 1] = q.y; D[o + 2] = q.z; D[o + 3] = q.th; D[o + 4] = q.sx; D[o + 5] = q.sh; D[o + 6] = q.lk || 1; D[o + 7] = J[0]; D[o + 8] = J[1]; D[o + 9] = J[2]; D[o + 10] = J[3]; });
    if (vis[v + 4]) {                                                   // 貼圖：取最接近視線的那一張（模型座標裡鏡頭的方向 φ ⇒ 第 round(φ ÷ 45°) 張）
      var m2 = Mq.m, s = Math.sin(q.th), c = Math.cos(q.th), ex = eye[0] - q.x, ez = eye[2] - q.z, vx = ex * s - ez * c, vy = -ex * c - ez * s;
      var k = ((Math.round(Math.atan2(vy, vx) / (2 * Math.PI / V8)) % V8) + V8) % V8, ph = k * 2 * Math.PI / V8, rmx = -Math.sin(ph), rmy = Math.cos(ph), o2 = kb++ * 13;
      var cx = q.x, cz = q.z;                                           // 模型中心（城牆的斷面沿 x 縮放 ⇒ 貼圖寬也跟著）
      D2[o2] = cx; D2[o2 + 1] = q.y; D2[o2 + 2] = cz; D2[o2 + 3] = q.sh;
      D2[o2 + 4] = rmx * s - rmy * c; D2[o2 + 5] = -rmx * c - rmy * s; D2[o2 + 6] = m2.im.w * q.sx; D2[o2 + 7] = m2.im.h;
      D2[o2 + 8] = (m2.im.x + k * m2.im.cw) / K.aw; D2[o2 + 9] = m2.im.y / K.ah; D2[o2 + 10] = m2.im.cw / K.aw; D2[o2 + 11] = m2.im.ch / K.ah; D2[o2 + 12] = q.lk || 1;
    }
    if ((vis[v + 2] || vis[v + 3]) && q.pb) { var o3 = kp++ * 8, P3 = q.pb; D3[o3] = q.x; D3[o3 + 1] = P3[0]; D3[o3 + 2] = q.z; D3[o3 + 3] = q.th; D3[o3 + 4] = q.pl[0] - 0.04; D3[o3 + 5] = q.pl[1] - 0.04; D3[o3 + 6] = P3[1]; D3[o3 + 7] = q.sh; }
  }
  var P = TOWNS.prog;
  [[D0, tot[0] * 11], [D1, tot[1] * 11], [D2, nbb * 13], [D3, npl * 8]].forEach(function (a, i2) { gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[i2]); gl.bufferData(gl.ARRAY_BUFFER, a[0].subarray(0, Math.max(16, a[1])), gl.DYNAMIC_DRAW); });
  TOWNS.grp = { cnt: cnt, off: off, nbb: nbb, npl: npl };
  var S = TOWNS.stat; S.d0 = tot[0]; S.d1 = tot[1]; S.d2 = nbb; S.plinth = npl; S.lm = nlm; S.binMs = +(performance.now() - t0).toFixed(2);
}
/** 石基：地塊頂（h，略低 1 cm 不跟一樓的底面打架）往下到四角與中心最低的地面再 0.3 m；地面沒載 ⇒ null（下次分組再試）。 */
function townPlinth(q) {
  var s = Math.sin(q.th), c = Math.cos(q.th), w = q.pl[0] / 2, d = q.pl[1] / 2, lo = Infinity;
  [[0, 0], [-w, -d], [w, -d], [w, d], [-w, d]].forEach(function (o) { var gy = townGround(q.x + o[0] * s - o[1] * c, q.z - o[0] * c - o[1] * s); lo = Math.min(lo, gy); });
  if (!(lo === lo) || lo === Infinity) return null;
  var top = q.y - 0.01, hgt = Math.max(0.3, top - lo + 0.3);
  return [top, hgt];
}
/** 畫（60_render.js：樹之後）。 */
function townDraw() {
  if (!TOWNS.on || !TOWNS.list.length || !BED || !BED.A || PASS.vp) return;
  if (!TOWNS.kit) { townKit(); return; }
  var t0 = performance.now(), K = TOWNS.kit, P = townProgs(), eye = CAM.eye, PL = bedPlanes(CAM.vp);
  TOWNS.list.forEach(function (T) {
    if (T.roadPending || T.roadSurface) return;
    T.roadPending = true;
    townRoadSurface(T.roads).then(function (R) { T.roadSurface = R; T.groundDirty = true; }, function (e) { TOWNS.err = '路面：' + e.message; console.warn(TOWNS.err); });
  });
  var nb = 0;                                                            // 實例、地面的帶子、屋頂殼：一格最多建一座城的一樣、照背景預算（08_seabed.js bedBusy；跟地球儀同一條主執行緒）
  TOWNS.list.forEach(function (T) {
    if (!T.inst && !nb && !bedBusy()) { var b0 = performance.now(); T.inst = townInst(T); T.ground = townGroundMesh(T); T.groundDirty = false; townFlagFree(T); T.shDirty = true; T.tlS = T.tlD = true; TOWNS.dirty = true; nb++; bedSpent(b0); }
  });
  TL.k = TL.on ? TOD_LIT : 0;                                                        // 夜裡的燈：這一格點燈了沒（08_weather.js；陸地在城之前畫 ⇒ 用上一格的分組表，差一格看不出來）
  TOWNS.list.forEach(function (T) {
    if (!T.inst || !T.groundDirty || nb || bedBusy()) return;
    var b0 = performance.now(), old = T.ground; T.ground = townGroundMesh(T); T.groundDirty = false; T.tlD = true; nb++;   // 地形塊到了 ⇒ 街燈的高度重取
    if (old) { gl.deleteVertexArray(old.vao); gl.deleteBuffer(old.vb); gl.deleteBuffer(old.ib); }
    bedSpent(b0);
  });
  var E = TOWNS.eye;
  if (TOWNS.dirty || !E || Math.abs(E[0] - eye[0]) + Math.abs(E[1] - eye[1]) + Math.abs(E[2] - eye[2]) > TOWN_REBIN) { townBin(PL, eye); TOWNS.eye = eye.slice(); TOWNS.dirty = false; }
  TOWNS.list.forEach(function (T) { if (T.shDirty && T.inst && !nb && !bedBusy()) { var b0 = performance.now(); if (T.shell) { gl.deleteVertexArray(T.shell.vao); gl.deleteBuffer(T.shell.vb); gl.deleteBuffer(T.shell.ib); } T.shell = townShell(T); T.shDirty = false; T.tlD = true; nb++; bedSpent(b0); } });   // 城牆的高度到了 ⇒ 城塔、城門的火把跟著
  TOWNS.list.forEach(function (T) { ['S', 'D'].forEach(function (pt) { if (T['tl' + pt] && T.inst && !nb && !bedBusy()) { var b0 = performance.now(); townLightBuild(T, pt); T['tl' + pt] = false; nb++; bedSpent(b0); } }); });   // 夜裡的燈：房子那份建一次、城牆＋街燈那份照高度重建
  townLampGrid(eye);
  var cf = gl.isEnabled(gl.CULL_FACE); gl.disable(gl.CULL_FACE);
  var fogD = WX.fog * BED_FOG * CAM.fogK, G = TOWNS.grp, L0 = TOWN_LOD[0], L1 = TOWN_LOD[1], B = TOWN_BAND, tris = 0;
  // 近、中：一種模型一次（照實例）
  var PV = P.vox; gl.useProgram(PV.prog); setCommon(PV); gl.uniform1f(PV.u.uFogD, fogD); gl.uniform3fv(PV.u.uEye, eye);
  for (var l = 0; l < 2; l++) {
    gl.uniform1f(PV.u.uEdge, l ? 0 : 1);
    if (l) { gl.uniform2f(PV.u.uIn, L0 - B[0], L0 + B[0]); gl.uniform2f(PV.u.uOut, L1 - B[1], L1 + B[1]); } else { gl.uniform2f(PV.u.uIn, -2, -1); gl.uniform2f(PV.u.uOut, L0 - B[0], L0 + B[0]); }
    K.names.forEach(function (nm, mi) {
      var n = G.cnt[l][mi]; if (!n) return; var Mm = K.M[nm], g = Mm.lod[l];
      gl.uniform3fv(PV.u.uC, l ? Mm.uc1 : Mm.uc0);
      gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[l]);
      townInstAttr(G, l, mi);
      gl.drawElementsInstanced(gl.TRIANGLES, g.nq * 6, gl.UNSIGNED_INT, 0, n); tris += g.nq * 2 * n;
    });
  }
  // 石基
  if (G.npl) {
    var PP = P.pl; gl.useProgram(PP.prog); setCommon(PP); gl.uniform1f(PP.u.uFogD, fogD); gl.uniform3f(PP.u.uCol, 0.62, 0.58, 0.50);
    gl.bindVertexArray(P.plVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 30, G.npl); tris += 10 * G.npl;   // 不畫頂面
  }
  tris += townPostDraw(P, eye, fogD);                                    // 街燈的柱子、燈箱（夜裡的燈；同石基那一支著色器）
  // 貼圖
  if (G.nbb && K.tex) {
    var PB = P.bb; gl.useProgram(PB.prog); setCommon(PB); gl.uniform1f(PB.u.uFogD, fogD); gl.uniform3fv(PB.u.uEye, eye);
    gl.uniform2f(PB.u.uIn, L1 - B[1], L1 + B[1]); gl.uniform2f(PB.u.uOut, TOWN_FAR[0], TOWN_FAR[1]);
    gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D, K.tex); gl.uniform1i(PB.u.uTex, 11); gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(P.bbVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, G.nbb); tris += 2 * G.nbb;
  }
  // 地面的帶子（貼地、往鏡頭推一點 ⇒ 不跟地形打架）
  var PG = P.gr; gl.useProgram(PG.prog); setCommon(PG); gl.uniform1f(PG.u.uFogD, fogD);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -4);
  TOWNS.list.forEach(function (T) { var g = T.ground; if (!g || !bedSeen(PL, g.bb) || townBoxDist(g.bb, eye) > TOWN_GROUND_VIEW) return; gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_INT, 0); tris += g.n / 3; });
  gl.disable(gl.POLYGON_OFFSET_FILL);
  // 布旗（同一支著色器；近、中那兩級的距離內才畫，鏡頭附近才動）
  var now = performance.now() / 1000, fdt = Math.min(0.1, Math.max(0, now - (TOWNS.flagT || now))), nfl = 0; TOWNS.flagT = now; TOWNS.flagClock = (TOWNS.flagClock || 0) + fdt;
  TOWNS.list.forEach(function (T) {
    if (!T.flags) T.flags = townFlags(T);
    T.flags.forEach(function (F) {
      var d = Math.hypot(F.at[0] - eye[0], F.at[2] - eye[2]); if (d > TOWN_LOD[1] * F.lk) return;   // 地標的旗跟著那一棟畫到中那一級的盡頭
      for (var i = 0; i < 6; i++) { var pl = PL[i]; if (pl[0] * F.at[0] + pl[1] * F.at[1] + pl[2] * F.at[2] + pl[3] < -6) return; }
      if (d < TOWN_FLAG_SIM) { F.acc += fdt; var ns2 = 0; while (F.acc >= TOWN_FLAG_DT && ns2 < 4) { townFlagStep(F, TOWN_FLAG_DT, TOWNS.flagClock); F.acc -= TOWN_FLAG_DT; ns2++; } if (ns2 === 4) F.acc = 0; }
      tris += townFlagMesh(F, eye); gl.drawArrays(gl.TRIANGLES, 0, F.n); nfl++;
    });
  });
  TOWNS.stat.flags = nfl;
  // 屋頂殼（最遠一級：跟貼圖用同一個抖動互補）
  var PS = P.sh; gl.useProgram(PS.prog); setCommon(PS); gl.uniform1f(PS.u.uFogD, fogD); gl.uniform2f(PS.u.uIn, TOWN_FAR[0], TOWN_FAR[1]); gl.uniform2f(PS.u.uOut, 1e8, 2e8);
  var ns = 0;
  TOWNS.list.forEach(function (T) { var g = T.shell; if (!g || !bedSeen(PL, g.bb) || townBoxFar(g.bb, eye) < TOWN_FAR[0]) return; ns++; gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_INT, 0); tris += g.n / 3; });
  gl.bindVertexArray(null); if (cf) gl.enable(gl.CULL_FACE);
  TOWNS.stat.d3 = ns; TOWNS.stat.tris = tris; TOWNS.stat.drawMs = +(performance.now() - t0).toFixed(2);
}
/** 近、中那兩級的實例欄位（townBin 寫的 11 欄：aI x y z θ、aS 沿 x 縮放 深淺 地標倍率、aJ 斜接 ×2 坡度 牆基）⇒ 第 mi 種模型那一段；主畫面與陰影那一趟共用（版面只寫在這裡）。 */
function townInstAttr(G, l, mi) { var o = G.off[l][mi] * 44; gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 44, o); gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 44, o + 16); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 44, o + 28); }
/** 陰影的靜態那一層（60_render.js csmStatic；PASS.vp 已經換成那一段）：照主畫面上一次分好的組（townBin：近、中那兩級，含城牆）＋石基只寫深度。
 *  貼圖、屋頂殼、旗不畫（800 m 以外，陰影那一層的範圍也差不多到這裡）。⇒ 畫了幾個實例。 */
function townDepth() {
  if (!TOWNS.on || !TOWNS.list.length || !TOWNS.kit || !TOWNS.prog || !TOWNS.grp) return 0;
  var K = TOWNS.kit, P = TOWNS.prog, G = TOWNS.grp, PD = P.dVox || (P.dVox = VK.compile(gl, TOWN_VS, DEPTH_ONLY_FS)), n = 0;
  gl.useProgram(PD.prog); setCommon(PD);
  for (var l = 0; l < 2; l++) K.names.forEach(function (nm, mi) {
    var k = G.cnt[l][mi]; if (!k) return; var Mm = K.M[nm], g = Mm.lod[l];
    gl.uniform3fv(PD.u.uC, l ? Mm.uc1 : Mm.uc0);
    gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[l]);
    townInstAttr(G, l, mi);
    gl.drawElementsInstanced(gl.TRIANGLES, g.nq * 6, gl.UNSIGNED_INT, 0, k); n += k;
  });
  if (G.npl && P.plVao) { var PP = P.dPl || (P.dPl = VK.compile(gl, TOWN_PL_VS, DEPTH_ONLY_FS)); gl.useProgram(PP.prog); setCommon(PP); gl.bindVertexArray(P.plVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, G.npl); }
  gl.bindVertexArray(null); return n;
}
function townBoxDist(b, e) { var dx = Math.max(b[0] - e[0], 0, e[0] - b[3]), dz = Math.max(b[2] - e[2], 0, e[2] - b[5]); return Math.sqrt(dx * dx + dz * dz); }
function townBoxFar(b, e) { var dx = Math.max(Math.abs(b[0] - e[0]), Math.abs(b[3] - e[0])), dz = Math.max(Math.abs(b[2] - e[2]), Math.abs(b[5] - e[2])); return Math.sqrt(dx * dx + dz * dz); }
/** 讀數（__game.town()）：幾座城、每座的雜湊與實例數、這一格畫了幾個（近、中、貼圖、殼）、三角形、毫秒；at ＝ [x, z] ⇒ 那一點的畫面高度、清不清樹。 */
function townStat(at) {
  var S = TOWNS.stat, o = { on: TOWNS.on, want: TOWNS.want, err: TOWNS.err, towns: TOWNS.list.map(function (T) {
    var u = {}; (T.inst || []).forEach(function (q) { u[q.k] = (u[q.k] || 0) + 1; });
    var tl = townLightStat(T);
    return { id: T.id, name: T.name, tier: T.tier, seed: T.seed, ox: T.ox, oy: T.oy, lots: (T.p.lots || []).length, roads: T.roads.length, walls: (T.p.walls || []).length, inst: (T.inst || []).length, byModel: u, lights: tl, center: [+(T.ox - BED.ax).toFixed(1), +(T.oy - BED.az).toFixed(1)] };
  }), kit: !!TOWNS.kit, kitN: S.kitN, kitMs: S.kitMs, kitTris: S.kitTris, skip: S.skip, drawn: { full: S.d0, low: S.d1, card: S.d2, shells: S.d3, plinth: S.plinth, flags: S.flags || 0, landmarks: S.lm || 0 }, tris: S.tris, ms: { draw: S.drawMs, bin: S.binMs, grade: +S.gradeMs.toFixed(1), prep: S.prepMs }, gradedChunks: S.chunks,
    night: { lit: +TL.k.toFixed(3), win: +TOD_WIN.toFixed(3), grid: TL.stat.inGrid, range: TL.stat.range || 0, full: TL.stat.full, over: TL.stat.over, gridMs: TL.stat.gridMs, cards: TL.stat.cards, glow: TL.stat.glow, glowMs: TL.stat.glowMs } };
  if (at) { var q = bedCell(at[0], at[1]); o.at = { ground: +townGround(at[0], at[1]).toFixed(2), sim: +bedHgt(at[0], at[1]).toFixed(2), clear: q ? townClr(q.C, q.u * q.C.step, q.v * q.C.step) : null }; }
  return o;
}

// ── 夜裡的燈（Tim 2026-10-20「加了夜晚後 是否可以嘗試給現有建築標記一些燈(無陰影點光源) 然後渲染時要考慮效能」「然後也可以沿著街道自動部設街燈」；只給人看） ──
// 燈從哪來：Blocksail tools/townmodels.py 匯入時寫進索引的 lights（模型格座標）——
//   lamp [x, y, z, 型]：0 ＝ 作品雕的燈籠（固定點 wick）、1 ＝ 門口（作品沒雕燈籠才自動補）、2 ＝ 城塔外牆的火把、3 ＝ 城門洞頂的火把；
//   win [{ a, s, d, r }]：窗洞的形狀（薄的那一軸、往外的正負、洞外那一面、[[z0, z1, u0, u1], …]）。
//   ＋這裡沿路擺的街燈（型 4，townPosts）。
// 什麼時候亮：08_weather.js TOD_LIT（世界時間；太陽 3° 開始點、−5° 全亮）—— 沒開世界時間（對戰、沙盒）⇒ 0，一盞都不點、整段跳過。
//   窗：幾成亮著照 TOD_WIN（入夜七成、半夜以後慢慢熄）；哪一扇亮照雜湊（實例的 x、z ＋ 第幾扇，GLSL twH）⇒ 同一扇整晚一致、越晚熄掉的越多；窗片與遠處的光點同一個雜湊。
// 畫（效能）：
//   · 點光源（不投影子）：鏡頭附近 N × N 格（N 照畫質「城裡點光源的距離」TL_GRIDS：64／128／192 ⇒ 512 m／1 km／1.5 km 見方，Tim 2026-10-20「點光源的顯示距離可以在遠一些(特別是中高畫質 可以根據畫質支援更遠距離)」；
//     每格 TL_CELL 公尺，鏡頭動 TL_REBIN × N ÷ 64 公尺才重排；最外 4 格淡掉）的分組表（RGBA16UI 一格兩個像素：最多 TL_SLOT ＝ 8 盞的編號；第一版 4 盞，加拉塔近看 482 格滿了 ⇒ 光圈在格線上被切）
//     ＋燈的資料（RGBA32F：位置、半徑；顏色 × 亮度、相位）⇒ 每個像素只讀自己那一格（TLAMP_GLSL townLamp）：燈再多，每個像素最多算 8 盞。
//     一格超過 8 盞 ⇒ 留離格心近的（stat.full）；範圍裡超過 TL_MAX 盞 ⇒ 多的不照（stat.over）。照：建築（近、中）、石基、街燈、路、屋頂殼、陸地（63_bed_gl.js）。
//     uTLK 0（白天）⇒ 一進函式就回 0，不讀貼圖。
//   · 亮窗：每個模型一份窗片網格（townWinMesh；貼在洞外那一面、往外 0.08 格），照近那一級的實例畫（同一組抖動交接），加法、不寫深度 ⇒ 窗框、窗櫺照樣擋在前面。
//   · 光點：每座城一個靜態的緩衝區（燈一點、每扇窗一點；townLightBuild），GPU 一次畫完（看板四邊形、最小 TL_PX 像素、照霧淡掉）；窗的光點在近那一級的交接帶淡入、背對鏡頭的不畫。
//   · 燈籠的玻璃（色碼 245，只有燈籠用）夜裡自己發光（TOWN_FS）。
//   · 窗片、光點在海、玻璃之後畫（60_render.js 叫 townGlowDraw）：加法、不寫深度的東西先畫，會被之後畫的不透明蓋掉。
// ?townlights=0 ⇒ 整段關掉（量效能的對照組；柱子照畫）。
// 街燈（townPosts）：路（TL_STREET 的那幾種）每隔那麼多公尺一支、左右交錯、離路邊 TL_POST_OFF；落在建築、城牆的佔地裡（外擴 0.6 m）⇒ 換另一邊、還不行就跳過；
//   離別支 < TL_POST_GAP 公尺（路口、兩條路疊著）、站在別條路的路面上 ⇒ 跳過。位置照規劃算（每次一樣）；高度照畫面地形（townGround），那一塊還沒載 ⇒ 等下一次重建（stat miss）。
//   柱子、燈箱用石基那一支著色器（方塊）。⛔ 不碰戰局：船、砲彈穿過去。
var TL_GRIDS = [64, 128, 192], TL_GRID = 192, TL_CELL = 8, TL_SLOT = 8, TL_MAX = 4096, TL_REBIN = 4, TL_PX = 2.5;   // 格數照畫質「城裡點光源的距離」（07_gfx.js tlamp）：512 m／1 km／1.5 km 見方；貼圖照最大的配
var TL_STREET = { main: 24, street: 30, quay: 22 }, TL_POST_OFF = 0.5, TL_POST_GAP = 10, TL_POST_H = 3.2;
var TL_TYPE = [                                                         // 型 ⇒ r 照多遠（公尺）、k 亮度、c 光色、h 光暈半徑（公尺）
  { r: 8, k: 2.0, c: [1, 0.62, 0.28], h: 0.9 },                         // 0 燈籠
  { r: 9, k: 2.0, c: [1, 0.62, 0.28], h: 1.0 },                         // 1 門口
  { r: 12, k: 2.6, c: [1, 0.48, 0.16], h: 1.5 },                        // 2 城塔的火把
  { r: 12, k: 2.6, c: [1, 0.48, 0.16], h: 1.5 },                        // 3 城門的火把
  { r: 11, k: 2.2, c: [1, 0.66, 0.32], h: 1.1 }];                       // 4 街燈
var TL = { gTex: null, dTex: null, g: new Uint16Array(TL_GRID * TL_GRID * TL_SLOT), gd: new Float32Array(TL_GRID * TL_GRID * TL_SLOT), d: new Float32Array(TL_MAX * 8), a: new Float32Array([0, 0, 1 / TL_CELL, TL_GRID]),
  on: Q.get('townlights') !== '0', k: 0, eye: null, ver: 0, gv: -1, stat: { inGrid: 0, full: 0, over: 0, gridMs: 0, cards: 0, glow: 0, glowMs: 0 } };
// 點光源：uTLA ＝ (分組表的西北角 x、z, 1 ÷ 格寬, 格數)、uTLK ＝ 點燈了沒、uTLT ＝ 模擬時間（火光晃）
var TLAMP_GLSL = 'uniform highp usampler2D uTLG; uniform highp sampler2D uTLD; uniform vec4 uTLA; uniform float uTLK, uTLT;\n' +
  'vec3 townLamp(vec3 w, vec3 n){ if(uTLK<=0.0) return vec3(0.0); vec2 c=(w.xz-uTLA.xy)*uTLA.z; if(c.x<0.0||c.y<0.0||c.x>=uTLA.w||c.y>=uTLA.w) return vec3(0.0);\n' +
  ' ivec2 q=ivec2(c); uvec4 i0=texelFetch(uTLG,ivec2(q.x*2,q.y),0), i1=texelFetch(uTLG,ivec2(q.x*2+1,q.y),0); vec3 s=vec3(0.0);\n' +
  ' float e=min(min(c.x,c.y),min(uTLA.w-c.x,uTLA.w-c.y));\n' +   // e：離分組表的邊幾格 ⇒ 最外 4 格淡掉（不在邊上一刀切）
  ' for(int k=0;k<8;k++){ uint i=k<4?i0[k]:i1[k-4]; if(i==0u) break; int j=int(i-1u)*2; vec4 P=texelFetch(uTLD,ivec2(j&63,j>>6),0), C=texelFetch(uTLD,ivec2((j+1)&63,(j+1)>>6),0);\n' +
  '  vec3 L=P.xyz-w; float d=length(L), a=clamp(1.0-d/P.w,0.0,1.0); if(a<=0.0) continue; float fl=0.9+0.1*sin(uTLT*6.3+C.w)*sin(uTLT*2.7+C.w*1.9);\n' +
  '  s+=C.rgb*a*a*fl*(0.3+0.7*max(dot(n,L/max(d,0.001)),0.0)); } return s*uTLK*clamp(e*0.25,0.0,1.0); }\n';
// 哪一扇窗亮：實例的 x、z ＋ 第幾扇 ⇒ [0, 1)（窗片、光點同一份；整數雜湊，不吃 sin 的精度）
var TL_HASH_GLSL = 'float twH(vec2 xz, float id){ uvec3 v=floatBitsToUint(vec3(xz,id)); uint h=v.x*0x8da6b343u^v.y*0xd8163841u^v.z*0xcb1ab31fu; h^=h>>16; h*=0x7feb352du; h^=h>>15; h*=0x846ca68bu; h^=h>>16; return float(h>>8)/16777216.0; }\n' +
  'vec3 twCol(float h){ float v=fract(h*53.7); return mix(vec3(1.0,0.6,0.28),vec3(1.0,0.78,0.5),v)*(0.75+0.4*fract(h*91.3)); }\n';
// 窗片：模型格座標 aP.xyz、第幾扇 aP.w；實例同近那一級（townInstAttr）
var TOWN_WIN_VS = '#version 300 es\nlayout(location=0) in vec4 aP; layout(location=4) in vec4 aI; layout(location=5) in vec3 aS; layout(location=6) in vec4 aJ; uniform mat4 uVP; uniform vec3 uC, uEye; uniform float uTWin, uTLT;\n' +
  'out vec3 vW; out float vD; flat out vec3 vCol;\n' + TL_HASH_GLSL +
  'void main(){ float h=twH(aI.xz,aP.w); vW=vec3(0.0); vD=0.0; vCol=vec3(0.0); if(h>=uTWin){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }\n' +
  ' vec3 p=aP.xyz; float s=sin(aI.w), c=cos(aI.w), a=(p.x*uC.x-uC.y)*aS.x, b=p.y*uC.x-uC.z; vec3 w=vec3(aI.x+a*s-b*c, aI.y+p.z*uC.x+aJ.z*a, aI.z-a*c-b*s);\n' +
  ' vCol=twCol(h)*(0.94+0.06*sin(uTLT*(1.3+fract(h*7.0))+h*40.0)); vW=w; vD=length(aI.xz-uEye.xz)/aS.z; gl_Position=uVP*vec4(w,1.0); }\n';
var TOWN_WIN_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + TOWN_FADE + 'in vec3 vW; in float vD; flat in vec3 vCol; uniform vec3 uEye; uniform float uFogD, uClip, uTLK; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; if(townCut(vD)) discard; float fd=length(vW-uEye); o=vec4(vCol*1.25*uTLK*exp(-fd*uFogD),1.0); }\n';
};
// 光點：四邊形 aQ ∈ [−½, ½] × [0, 1]（P.quad）；aA ＝ (位置, 半徑)、aB ＝ (顏色, 型：−1 窗)、aC ＝ 窗 (實例 x, z, 第幾扇, 地標倍率)／燈 (—, —, —, 相位)、aN ＝ 窗往外的方向
var TOWN_GLOW_VS = '#version 300 es\nlayout(location=0) in vec2 aQ; layout(location=4) in vec4 aA; layout(location=5) in vec4 aB; layout(location=6) in vec4 aC; layout(location=7) in vec2 aN;\n' +
  'uniform mat4 uVP; uniform vec3 uEye, uR, uU; uniform float uPx, uTLK, uTWin, uTLT, uFogD; uniform vec2 uWin; out vec2 vQ; flat out vec3 vCol;\n' + TL_HASH_GLSL +
  'void main(){ vec3 p=aA.xyz, e=uEye-p; float d=length(e), k=uTLK; vec3 col=aB.rgb;\n' +
  ' if(aB.w<0.0){ float h=twH(aC.xy,aC.z); if(h>=uTWin) k=0.0; col=twCol(h);\n' +
  '  k*=smoothstep(uWin.x,uWin.y,length(aC.xy-uEye.xz)/aC.w)*smoothstep(-0.05,0.3,dot(aN,normalize(e.xz+vec2(1e-4)))); }\n' +
  ' else k*=0.85+0.15*sin(uTLT*6.3+aC.w)*sin(uTLT*2.7+aC.w*1.9);\n' +
  ' float s=max(aA.w,uPx*d*' + TL_PX.toFixed(2) + '); k*=pow(aA.w/s,0.3)*exp(-d*uFogD*0.5);\n' +   // 撐到最小像素 ⇒ 亮度只扣一點（第一版開根號：1.5 km 外的城只剩暗點）；自己發光的透霧比反光的遠 ⇒ 霧減半
  ' vQ=vec2(aQ.x*2.0,aQ.y*2.0-1.0); vCol=col*k; if(k<=0.003){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }\n' +
  ' vec3 w=p+e/max(d,0.001)*min(s*0.7,d*0.5)+(uR*vQ.x+uU*vQ.y)*s; gl_Position=uVP*vec4(w,1.0); }\n';   // 往鏡頭拉一點：光暈不被自己那面牆切一半
var TOWN_GLOW_FS = '#version 300 es\nprecision highp float;\nin vec2 vQ; flat in vec3 vCol; out vec4 o;\n' +
  'void main(){ float r=dot(vQ,vQ); if(r>1.0) discard; o=vec4(vCol*(exp(-r*5.0)*0.55+exp(-r*16.0)*0.9),1.0); }\n';

/** setCommon（01_gl.js）：有 uTLK 的著色器 ⇒ 分組表、燈的資料（第 13、14 號，第一次建）、點燈了沒。 */
function townLampSet(u) {
  if (!TL.gTex) {
    TL.gTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, TL.gTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, TL_GRID * 2, TL_GRID, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, TL.g);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    TL.dTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE14); gl.bindTexture(gl.TEXTURE_2D, TL.dTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 64, TL_MAX * 2 / 64, 0, gl.RGBA, gl.FLOAT, TL.d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.activeTexture(gl.TEXTURE0);
  }
  gl.uniform1i(u.uTLG, 13); gl.uniform1i(u.uTLD, 14); gl.uniform4fv(u.uTLA, TL.a); gl.uniform1f(u.uTLK, TL.k); if (u.uTLT) gl.uniform1f(u.uTLT, SIMT);
}
/** 分組表（townDraw 每一格叫；點燈了、鏡頭動了 TL_REBIN 公尺、燈換過才重排）。 */
function townLampGrid(eye) {
  if (!TL.k || !TL.gTex) return;
  var N = TL_GRIDS[GFX.tlamp] || TL_GRIDS[0], E = TL.eye; if (E && TL.gv === TL.ver && TL.gn === N && Math.abs(E[0] - eye[0]) + Math.abs(E[2] - eye[2]) < TL_REBIN * N / 64) return;   // 範圍大 ⇒ 重排的距離跟著放大
  var t0 = performance.now(), C = TL_CELL, x0 = Math.floor(eye[0] / C) * C - N * C / 2, z0 = Math.floor(eye[2] / C) * C - N * C / 2, X1 = x0 + N * C, Z1 = z0 + N * C;
  var G = TL.g, GD = TL.gd, D = TL.d, n = 0, full = 0, over = 0;
  G.fill(0, 0, N * N * TL_SLOT);
  TOWNS.list.forEach(function (T) {
    var L = T.tl && T.tl.lamps; if (!L) return;
    for (var i = 0; i < L.length; i += 5) {
      var x = L[i], y = L[i + 1], z = L[i + 2], P = TL_TYPE[L[i + 3]], R = P.r;
      if (x + R < x0 || x - R > X1 || z + R < z0 || z - R > Z1) continue;
      if (n >= TL_MAX) { over++; continue; }
      var o = n * 8, id = ++n;
      D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = R; D[o + 4] = P.c[0] * P.k; D[o + 5] = P.c[1] * P.k; D[o + 6] = P.c[2] * P.k; D[o + 7] = L[i + 4];
      var i0 = Math.max(0, Math.floor((x - R - x0) / C)), i1 = Math.min(N - 1, Math.floor((x + R - x0) / C)), j0 = Math.max(0, Math.floor((z - R - z0) / C)), j1 = Math.min(N - 1, Math.floor((z + R - z0) / C));
      for (var j = j0; j <= j1; j++) for (var ii = i0; ii <= i1; ii++) {
        var ex = Math.max(x0 + ii * C - x, 0, x - (x0 + (ii + 1) * C)), ez = Math.max(z0 + j * C - z, 0, z - (z0 + (j + 1) * C));
        if (ex * ex + ez * ez > R * R) continue;                         // 圓碰不到這一格
        var c = (j * N + ii) * TL_SLOT, cx = x0 + (ii + 0.5) * C - x, cz = z0 + (j + 0.5) * C - z, d2 = cx * cx + cz * cz, s = -1, far = -1;
        for (var k = 0; k < TL_SLOT; k++) { if (!G[c + k]) { s = k; break; } if (far < 0 || GD[c + k] > GD[c + far]) far = k; }
        if (s < 0) { full++; if (GD[c + far] <= d2) continue; s = far; }   // 滿了 ⇒ 換掉離格心最遠的那一盞（新的比較近才換）
        G[c + s] = id; GD[c + s] = d2;
      }
    }
  });
  gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, TL.gTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N * 2, N, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, G.subarray(0, N * N * TL_SLOT));
  var rows = Math.ceil(n * 2 / 64);
  if (rows) { gl.activeTexture(gl.TEXTURE14); gl.bindTexture(gl.TEXTURE_2D, TL.dTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, rows, gl.RGBA, gl.FLOAT, D.subarray(0, rows * 256)); }
  gl.activeTexture(gl.TEXTURE0);
  TL.a[0] = x0; TL.a[1] = z0; TL.a[3] = N; TL.eye = eye.slice(); TL.gv = TL.ver; TL.gn = N;
  TL.stat.inGrid = n; TL.stat.range = N * C; TL.stat.full = full; TL.stat.over = over; TL.stat.gridMs = +(performance.now() - t0).toFixed(2);
}
/** 模型的窗片網格（索引 lights.win ⇒ 每扇窗的洞，一列一個四邊形；屬性 0 ＝ (模型格 x, y, z, 第幾扇)、4～6 ＝ 實例）；沒有窗 ⇒ null。 */
function townWinMesh(m) {
  var W = (m.lights || {}).win; if (!W || !W.length) return null;
  var V = [];
  W.forEach(function (w, wi) {
    var d = w.d + w.s * 0.08;                                            // 往外 0.08 格：不跟玻璃那一面打架
    w.r.forEach(function (r) {
      [[r[2], r[0]], [r[3], r[0]], [r[3], r[1]], [r[2], r[0]], [r[3], r[1]], [r[2], r[1]]].forEach(function (q) { if (w.a) V.push(q[0], d, q[1], wi); else V.push(d, q[0], q[1], wi); });
    });
  });
  var g = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), n: V.length / 4 };
  gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
  [4, 5, 6].forEach(function (a) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); });
  gl.bindVertexArray(null);
  return g;
}
/** 城 T 的街燈位置（海域座標轉世界，照規劃算一次；見檔頭那一段）：[[x, z], …]。 */
function townPosts(T) {
  if (T.posts) return T.posts;
  var out = [], ax = BED.ax, az = BED.az, IG = {}, RG = {}, PG = {}, GI = 16, GR = 32;
  function cells(x0, z0, x1, z1, g, f) { for (var j = Math.floor(z0 / g); j <= Math.floor(z1 / g); j++) for (var i = Math.floor(x0 / g); i <= Math.floor(x1 / g); i++) f(i + ',' + j); }
  (T.inst || []).forEach(function (q) {                                 // 佔地（建築：地塊上那一棟；城牆：半長、半厚）
    var h = q.pl ? [q.pl[0] / 2, q.pl[1] / 2] : q.ft; if (!h) return; var R = Math.hypot(h[0], h[1]) + 1;
    var b = { x: q.x, z: q.z, s: Math.sin(q.th), c: Math.cos(q.th), h: h };
    cells(q.x - R, q.z - R, q.x + R, q.z + R, GI, function (k) { (IG[k] = IG[k] || []).push(b); });
  });
  T.roads.forEach(function (r) {
    for (var q = 1; q < r.P.length; q++) { var a = r.P[q - 1], b = r.P[q], sg = { a: a, b: b, hw: r.w / 2, r: r }; cells(Math.min(a[0], b[0]) - r.w, Math.min(a[1], b[1]) - r.w, Math.max(a[0], b[0]) + r.w, Math.max(a[1], b[1]) + r.w, GR, function (k) { (RG[k] = RG[k] || []).push(sg); }); }
  });
  function inBldg(x, z) {                                               // 世界座標
    var L = IG[Math.floor(x / GI) + ',' + Math.floor(z / GI)] || [];
    return L.some(function (b) { var dx = x - b.x, dz = z - b.z, a = dx * b.s - dz * b.c, c = -dx * b.c - dz * b.s; return Math.abs(a) <= b.h[0] + 0.6 && Math.abs(c) <= b.h[1] + 0.6; });
  }
  function onRoad(x, z, own) {                                          // 海域座標：站在別條路的路面上
    var L = RG[Math.floor(x / GR) + ',' + Math.floor(z / GR)] || [];
    return L.some(function (sg) { return sg.r !== own && townSegDist(x, z, sg.a, sg.b) < sg.hw + 0.3; });
  }
  function crowded(x, z) {
    var i0 = Math.floor(x / TL_POST_GAP), j0 = Math.floor(z / TL_POST_GAP);
    for (var j = j0 - 1; j <= j0 + 1; j++) for (var i = i0 - 1; i <= i0 + 1; i++) if ((PG[i + ',' + j] || []).some(function (p) { return Math.hypot(p[0] - x, p[1] - z) < TL_POST_GAP; })) return true;
    return false;
  }
  T.roads.forEach(function (r) {
    var sp = TL_STREET[r.kind]; if (!sp) return;
    var acc = sp / 2, k = townHash(T.id + ':' + r.id) < 0.5 ? 0 : 1;
    for (var q = 1; q < r.P.length; q++) {
      var a = r.P[q - 1], b = r.P[q], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 1e-6) continue;
      var nx = -dz / L, nz = dx / L, off = r.w / 2 + TL_POST_OFF;
      for (var t = acc; t <= L; t += sp) {
        var px = a[0] + dx * t / L, pz = a[1] + dz * t / L, side = k++ % 2 ? 1 : -1, got = null;
        [side, -side].some(function (sd) {
          var x = px + nx * off * sd, z = pz + nz * off * sd;
          if (inBldg(x - ax, z - az) || onRoad(x, z, r) || crowded(x, z)) return false;
          got = [x, z]; return true;
        });
        if (got) { var kk = Math.floor(got[0] / TL_POST_GAP) + ',' + Math.floor(got[1] / TL_POST_GAP); (PG[kk] = PG[kk] || []).push(got); out.push([got[0] - ax, got[1] - az]); }
      }
      acc = t - L;
    }
  });
  T.posts = out;
  return out;
}
/** 城 T 的燈，分兩份（townDraw 照背景預算建；第一版整份一起建：君士坦丁堡一次 77 ms、每來一塊地形就重一次）：
 *  'S' ＝ 房子的燈與窗（高度照規劃，實例建好就定了 ⇒ 建一次）、'D' ＝ 城牆的火把＋街燈（照城牆、地形的高度 ⇒ 那一塊到了、城牆有高度了就重建；量少、建得快）。
 *  每份：點光源清單 lamps（x, y, z, 型, 相位）、光點緩衝區、（D）街燈的柱子。T.tl ＝ { S, D, lamps（兩份接起來，分組表讀）, 讀數 }。 */
function townLightBuild(T, part) {
  var t0 = performance.now(), K = TOWNS.kit, P = townProgs(), lamps = [], glow = [], posts = [], nWin = 0, miss = 0, dyn = part === 'D';
  function lamp(w, ty, ph) { var Y = TL_TYPE[ty]; lamps.push(w[0], w[1], w[2], ty, ph); glow.push(w[0], w[1], w[2], Y.h, Y.c[0] * Y.k, Y.c[1] * Y.k, Y.c[2] * Y.k, ty, 0, 0, 0, ph, 0, 0); }
  (T.inst || []).forEach(function (q) {
    if (!!q.wall !== dyn) return;
    var m = K.M[q.k].m, Lt = m.lights; if (!Lt) return;
    if (!(q.y === q.y)) { miss++; return; }                              // 城牆：那一塊還沒載
    var s = Math.sin(q.th), c = Math.cos(q.th), mpv = m.mpv, hw = m.size[0] * mpv / 2, hd = m.size[1] * mpv / 2, J = q.mj || TOWN_J0;
    function W(v) { var a = (v[0] * mpv - hw) * q.sx, b = v[1] * mpv - hd; return [q.x + a * s - b * c, q.y + v[2] * mpv + J[2] * a, q.z - a * c - b * s]; }   // 模型 → 世界（檔頭的公式＋城牆的坡度）
    (Lt.lamp || []).forEach(function (l, li) { lamp(W(l), l[3], townHash((q.lot || q.wall || q.k) + ':' + q.x.toFixed(1) + ':lamp' + li) * 6.2832); });
    (Lt.win || []).forEach(function (wd, wi) {                          // 窗的光點：洞的面積中心、往外 0.15 m；大小 ≈ 洞的長邊
      var A = 0, su = 0, sz = 0, zl = 1e9, zh = -1e9, ul = 1e9, uh = -1e9;
      wd.r.forEach(function (r) { var ar = (r[1] - r[0]) * (r[3] - r[2]); A += ar; su += ar * (r[2] + r[3]) / 2; sz += ar * (r[0] + r[1]) / 2; zl = Math.min(zl, r[0]); zh = Math.max(zh, r[1]); ul = Math.min(ul, r[2]); uh = Math.max(uh, r[3]); });
      if (!A) return;
      var u = su / A, z = sz / A, w = W(wd.a ? [u, wd.d, z] : [wd.d, u, z]), mx = wd.a ? 0 : wd.s, my = wd.a ? wd.s : 0, nx = mx * s - my * c, nz = -mx * c - my * s;
      glow.push(w[0] + nx * 0.15, w[1], w[2] + nz * 0.15, Math.max(zh - zl, uh - ul) * mpv * 0.75, 1, 1, 1, -1, q.x, q.z, wi, q.lk || 1, nx, nz); nWin++;
    });
  });
  if (dyn) townPosts(T).forEach(function (p, i) {                       // 街燈：柱子（地下多埋 0.3 m）＋燈箱，燈在燈箱中間
    var gy = townGround(p[0], p[1]); if (!(gy === gy)) { miss++; return; }
    var top = gy + TL_POST_H;
    posts.push(p[0], top, p[1], 0, 0.13, 0.13, TL_POST_H + 0.3, 1, p[0], top + 0.42, p[1], 0, 0.3, 0.3, 0.42, 0.9);
    lamp([p[0], top + 0.2, p[1]], 4, townHash(T.id + ':post' + i) * 6.2832);
  });
  var tl = T.tl || (T.tl = { S: null, D: null, lamps: null, ms: {} });
  townLightPartFree(tl[part]);
  var o = tl[part] = { lamps: new Float32Array(lamps), nWin: nWin, nPost: posts.length / 16, nGlow: glow.length / 14, miss: miss, glowVao: null, glowBuf: null, postVao: null, postBuf: null, bb: null };
  if (o.nGlow) {
    o.glowBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.glowBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(glow), gl.STATIC_DRAW);
    o.glowVao = gl.createVertexArray(); gl.bindVertexArray(o.glowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.glowBuf);
    [[4, 4, 0], [5, 4, 16], [6, 4, 32], [7, 2, 48]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribDivisor(a[0], 1); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, 56, a[2]); });
  }
  if (o.nPost) {
    var bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (var k = 0; k < posts.length; k += 8) { bb[0] = Math.min(bb[0], posts[k]); bb[1] = Math.min(bb[1], posts[k + 1] - 4); bb[2] = Math.min(bb[2], posts[k + 2]); bb[3] = Math.max(bb[3], posts[k]); bb[4] = Math.max(bb[4], posts[k + 1]); bb[5] = Math.max(bb[5], posts[k + 2]); }
    o.bb = bb;
    o.postBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.postBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(posts), gl.STATIC_DRAW);
    o.postVao = gl.createVertexArray(); gl.bindVertexArray(o.postVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, P.cube); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.postBuf); [4, 5].forEach(function (a, q) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 32, q * 16); });
  }
  gl.bindVertexArray(null);
  var a0 = tl.S ? tl.S.lamps : new Float32Array(0), a1 = tl.D ? tl.D.lamps : new Float32Array(0);
  tl.lamps = new Float32Array(a0.length + a1.length); tl.lamps.set(a0); tl.lamps.set(a1, a0.length);
  tl.ms[part] = +(performance.now() - t0).toFixed(1);
  TL.ver++;
}
function townLightPartFree(o) {
  if (!o) return;
  if (o.glowVao) { gl.deleteVertexArray(o.glowVao); gl.deleteBuffer(o.glowBuf); }
  if (o.postVao) { gl.deleteVertexArray(o.postVao); gl.deleteBuffer(o.postBuf); }
}
/** 讀數（townStat）：燈幾盞、窗幾扇、街燈幾支、還沒有高度的、建一份幾 ms。 */
function townLightStat(T) {
  var tl = T.tl; if (!tl) return null;
  var S = tl.S || {}, D = tl.D || {};
  return { lamps: tl.lamps.length / 5, wins: S.nWin || 0, posts: D.nPost || 0, miss: (S.miss || 0) + (D.miss || 0), ms: tl.ms };
}
/** 街燈的柱子、燈箱（townDraw 石基之後；白天也畫）⇒ 三角形數。 */
function townPostDraw(P, eye, fogD) {
  var PP = P.pl, tris = 0, on = false;
  TOWNS.list.forEach(function (T) {
    var tl = T.tl && T.tl.D; if (!tl || !tl.nPost || townBoxDist(tl.bb, eye) > TOWN_LOD[1]) return;
    if (!on) { gl.useProgram(PP.prog); setCommon(PP); gl.uniform1f(PP.u.uFogD, fogD); gl.uniform3f(PP.u.uCol, 0.2, 0.17, 0.14); on = true; }
    gl.bindVertexArray(tl.postVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, tl.nPost * 2); tris += 24 * tl.nPost;
  });
  return tris;
}
/** 亮窗、光點（60_render.js：海、玻璃之後；加法、不寫深度）。白天（TL.k 0）整段不畫。 */
function townGlowDraw() {
  TL.stat.cards = 0; TL.stat.glow = 0;
  if (!TL.k || !TOWNS.on || !TOWNS.kit || !TOWNS.prog || PASS.vp) return;
  var t0 = performance.now(), P = TOWNS.prog, K = TOWNS.kit, G = TOWNS.grp, eye = CAM.eye, fogD = WX.fog * BED_FOG * CAM.fogK, L0 = TOWN_LOD[0], B0 = TOWN_BAND[0];
  var cf = gl.isEnabled(gl.CULL_FACE); gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
  if (G) {                                                              // 窗片：近那一級的實例
    var PW = P.win || (P.win = VK.compile(gl, TOWN_WIN_VS, TOWN_WIN_FS())); gl.useProgram(PW.prog); setCommon(PW);
    gl.uniform1f(PW.u.uFogD, fogD); gl.uniform3fv(PW.u.uEye, eye); gl.uniform1f(PW.u.uTWin, TOD_WIN); gl.uniform1f(PW.u.uTLK, TL.k); gl.uniform1f(PW.u.uTLT, SIMT);
    gl.uniform2f(PW.u.uIn, -2, -1); gl.uniform2f(PW.u.uOut, L0 - B0, L0 + B0);
    K.names.forEach(function (nm, mi) {
      var n = G.cnt[0][mi], Mm = K.M[nm]; if (!n || !Mm.win) return;
      gl.uniform3fv(PW.u.uC, Mm.uc0); gl.bindVertexArray(Mm.win.vao); gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[0]); townInstAttr(G, 0, mi);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, Mm.win.n, n); TL.stat.cards += n;
    });
  }
  var PG = P.glow || (P.glow = VK.compile(gl, TOWN_GLOW_VS, TOWN_GLOW_FS)), on = false;   // 光點：每座城一次
  TOWNS.list.forEach(function (T) { [T.tl && T.tl.S, T.tl && T.tl.D].forEach(function (tl) {
    if (!tl || !tl.nGlow) return;
    if (!on) {
      var f = norm(sub(CAM.look, CAM.eye)), r = norm([-f[2], 0, f[0]]), u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];   // 鏡頭的右、上
      gl.useProgram(PG.prog); setCommon(PG); gl.uniform3fv(PG.u.uEye, eye); gl.uniform3fv(PG.u.uR, r); gl.uniform3fv(PG.u.uU, u);
      gl.uniform1f(PG.u.uPx, 2 * Math.tan(0.45) / CAM.h); gl.uniform1f(PG.u.uTLK, TL.k); gl.uniform1f(PG.u.uTWin, TOD_WIN); gl.uniform1f(PG.u.uTLT, SIMT); gl.uniform1f(PG.u.uFogD, fogD);
      gl.uniform2f(PG.u.uWin, L0 - B0, L0 + B0); on = true;
    }
    gl.bindVertexArray(tl.glowVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, tl.nGlow); TL.stat.glow += tl.nGlow;
  }); });
  gl.bindVertexArray(null); gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); if (cf) gl.enable(gl.CULL_FACE);
  TL.stat.glowMs = +(performance.now() - t0).toFixed(2);
}

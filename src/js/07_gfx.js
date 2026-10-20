// ───────────────────────── 畫質（TASK-0522） ─────────────────────────
// 主選單：低／中／高（GFX_PRESET）；畫質設定頁可以一項一項調，跟三檔都對不上 ⇒ 主選單顯示「自訂」。
// ⛔ 只改畫面：這裡的值一個都不能被 step() 讀到（反向對照：同一個種子，低與高跑同樣秒數，戰局讀數逐項相同）。
//   浪的大小（SEA_K）是物理，在細節設定；這裡的「海面細緻度」只是網格多密、漣漪幾道。
// 每一項怎麼畫在 60_render.js（管線：陰影圖 → 反射 → 場景 → 折射 → 海 → 粒子 → 縮放貼到畫布）。
// 網址：?gfx=low|mid|high（縮圖、對拍用），單項 ?g_shadow= ?g_refl= ?g_refr= ?g_sea= ?g_res= ?g_aa= ?g_rain= ?g_drops= ?g_dropspl= ?g_door= ?g_port= ?g_deco=（數字 ＝ 第幾檔，從 0 起）。
// 雨有兩種、各自一項：「雨」＝ 整個畫面一層的雨絲（01_gl.js P.rain）；「雨滴（3D）」＝ 3D 空間裡的雨絲粒子（14_rain.js）。高 ＝ 只開 3D（Tim 2026-10-13）；自訂可以兩種一起開。3D 雨滴打在海面與船上的水花另外一項（雨滴水花，Tim：要能開關）。
var GFX_ITEMS = [
  { k: 'shadow', name: '陰影', opt: ['關', '低（陰影圖 2048）', '高（陰影圖 4096、柔邊）'] },   // 船、地形、樹、城鎮都有，船數不影響；畫法、分段、陰影圖大小在下面的「陰影細項」（SHK；60_render.js shadowPass）
  { k: 'refl', name: '海面反射', opt: ['關（只反射天空）', '低（船身，1/4 解析度）', '高（船身＋砲與帆，1/2 解析度）'] },
  { k: 'refr', name: '海水折射', opt: ['關（不透明）', '低（半透明）', '高（折射＋水深）'] },
  { k: 'sea', name: '海面細緻度', opt: ['低', '中', '高'] },
  { k: 'res', name: '解析度', opt: ['50%', '75%', '100%'] },
  { k: 'aa', name: '反鋸齒', opt: ['關', '開（MSAA 4×）'] },
  { k: 'rain', name: '雨', opt: ['關', '低（稀）', '高（密）'] },     // 只在暴風雨下（08_weather.js）：整個畫面一層
  { k: 'drops', name: '雨滴（3D）', opt: ['關', '少（1500）', '中（3000）', '多（6000）'] },   // 只在暴風雨下：3D 空間裡的雨絲粒子（14_rain.js）
  { k: 'dropspl', name: '雨滴水花', opt: ['關', '開'] },                                    // 3D 雨滴打在海面與船上濺起的小水花
  { k: 'door', name: '門的開關演出', opt: ['關（一直關著）', '開（有人經過才開）'] },          // 門、艙蓋（TASK-0638，25_doors.js）：人照樣通過、門照樣擋水，這一項只管畫面
  { k: 'port', name: '砲門的開關演出', opt: ['關（蓋板開著、砲推出去不動）', '開（交戰掀蓋推砲、沒事收砲闔蓋、砲口下水就關）'] },   // 砲門（TASK-0719，62_ports.js）：有蓋板（裝飾）、畫質「裝飾」開著的船才有；戰局不讀。⛔ 併進 door：門三檔都開、砲門低畫質關；只靠「裝飾」：沒有 ?g_port= 做反向對照
  { k: 'fall', name: '艙內水幕', opt: ['關', '開（往下一層流的水畫成水幕）'] },   // 進水的粒子模式（TASK-0651，33_flood.js flFalls）：水照樣往下流，這一項只管畫面
  { k: 'pdep', name: '艙內水的深淺', opt: ['關（一片均勻的半透明）', '開（越深越不透明、貼邊淡出）'] },   // TASK-0654（33_flood.js FL_DEP_GLSL）：讀場景深度；海水折射不是「高」⇒ 有水的那幾格多複製一次深度
  { k: 'pside', name: '艙內水的側面與水瀑', opt: ['關', '開（水面邊上畫側面、兩池交界畫水瀑）'] },   // TASK-0654（33_flood.js flSides）
  { k: 'pedge', name: '艙內水的水邊', opt: ['關（直的）', '開（白沫一圈、淺的邊不規則）'] },   // TASK-0654（33_flood.js flEdgeM、FLE_GLSL）：只在水邊那一圈多算兩次雜訊
  { k: 'tlamp', name: '城裡點光源的距離', opt: ['近（512 m）', '中（1 km）', '遠（1.5 km）'] },   // 夜裡的燈（63_towns.js townLampGrid）：分組表照幾公尺見方；每個像素最多照 8 盞不變，遠了只是多一點像素有光、重排多一點
  { k: 'deco', name: '裝飾', opt: ['關（不畫）', '開'] },   // TASK-0682（05_hull.js decoSplit）：雕刻模型 meta deco=1 的裝飾件；不算重量、不被打、不抽亂數 ⇒ 開關不改戰局。一律載入、只管畫不畫（60_render.js drawModels）⇒ 切了立刻生效
  // 多船（TASK-0537；60_render.js gpuSlots）：視野裡離鏡頭最近的幾艘才有船艙遮罩（第幾檔 ＝ 幾艘）；陰影船數 2026-10-20 拿掉（陰影改成照鏡頭分段，不分船）
  { k: 'masks', name: '船艙遮罩', opt: gfxOpts(MASK_NEAR + 1, function (i) { return i ? String(i) : '0（艙裡看得到海）'; }) }];   // 說明在畫質設定頁（template #gfxNote）
function gfxOpts(n, f) { var r = []; for (var i = 0; i < n; i++) r.push(f(i)); return r; }
var GFX_PRESET = {
  low: { shadow: 0, refl: 0, refr: 0, sea: 0, res: 1, aa: 0, rain: 0, drops: 0, dropspl: 0, door: 1, port: 0, fall: 1, pdep: 0, pside: 1, pedge: 0, masks: 2, deco: 0, tlamp: 0 },   // 門的演出很便宜（每扇每格掃一次船員）⇒ 三檔都開；砲門跟裝飾一樣低畫質關（Tim 2026-10-19：「炮門屬於裝飾物 因此相關機制在低畫質不啟用」）
  mid: { shadow: 1, refl: 1, refr: 1, sea: 1, res: 2, aa: 1, rain: 1, drops: 0, dropspl: 0, door: 1, port: 1, fall: 1, pdep: 1, pside: 1, pedge: 1, masks: MASK_NEAR, deco: 1, tlamp: 1 },
  high: { shadow: 2, refl: 2, refr: 2, sea: 2, res: 2, aa: 1, rain: 0, drops: 3, dropspl: 1, door: 1, port: 1, fall: 1, pdep: 1, pside: 1, pedge: 1, masks: MASK_NEAR, deco: 1, tlamp: 2 } };   // 最高 ＝ 每艘都有（Tim 2026-10-13「最高畫質開到 N」）
var GFX_NAME = { low: '低', mid: '中', high: '高', custom: '自訂' }, GFX_DEFAULT = CFG.menu.gfx;   // 預設檔：config/game.json 的 menu.gfx
var GFX = {}, GFX_FPS = false;                     // GFX_FPS：畫面右上角顯示 FPS（畫質設定頁的勾選）
// 煙散得多快（Tim 2026-10-14）：畫質頁的一項，不跟低／中／高走（玩家自己選、不算進「自訂」）；煙的壽命 ÷ 這個倍數（12_effects.js smoke、40_crew.js 火槍）。
//   滑桿 SMOKE_LIM（Tim 2026-10-14：用滑桿調）；預設 1.2× ＝ 比原本（砲煙 2.5–5.5 秒）快 1.2 倍。只改畫面：粒子的亂數照樣抽、戰局不讀粒子。網址 ?smoke=（倍數）。
var SMOKE_LIM = [0.5, 3, 1.2], SMOKE_K = SMOKE_LIM[2];
(function () { var v = parseFloat(Q.get('smoke')); if (isFinite(v)) SMOKE_K = clamp(v, SMOKE_LIM[0], SMOKE_LIM[1]); })();
function smokeK() { return SMOKE_K; }
// 碎片上限（Tim 2026-10-14）：畫質頁的滑桿，不跟低／中／高走；超過 ⇒ 先清視野外、遠處、沉在水裡的（12_effects.js debCull）。網址 ?debcap=。
//   量過（16 艘、36,000 顆）：碎片的模擬每格 24 ms、畫碎片幾乎不花時間 ⇒ 上限主要省的是模擬。
var DEB_LIM = [2000, 45000, 20000], DEB_CAP = DEB_LIM[2];
(function () { var v = parseInt(Q.get('debcap'), 10); if (isFinite(v)) DEB_CAP = clamp(v, DEB_LIM[0], DEB_LIM[1]); })();
// 陰影細項（Tim 2026-10-21「把陰影的詳細cascade設定放到…目前blockside的畫質設定頁」「我調整一下參數測試看看合適的初始配置」）：畫質頁的「陰影細項」那一區，
//   不跟低／中／高走（不算進「自訂」），改了立刻生效、跟著存檔（69_prefs.js shk）。val ＝ 按鈕（值一個一個列）、lim ＝ 滑桿；低／高兩檔各自的陰影圖大小、柔邊取樣（n1 p1／n2 p2），其他兩檔共用。
//   用在 60_render.js（shadowMaps、shadowPass、csmSplits、shadowSimple）、01_gl.js（SHADOW_GLSL、setCommon）、63_trees.js（TREE_FS 樹收影子的距離）。
//   預設 ＝ 2026-10-20 Tim 確認不閃的那一份（單張）；分段的陸地快取預設關（快取跟主畫面差一格 ⇒ 2026-10-20 那個一閃）。網址：?csm=1 分段／?csm=0 單張，單項 ?sh_<k>=值（例 ?sh_dist=2000）。
var SHK_ITEMS = [   // 分段那幾項照 Unity 的 Shadows（Tim 2026-10-21 給的圖：Max Distance、Cascade Count、Split 1–3、Border 1–4、Show Cascades、Cascade splits 那一條）
  { k: 'mode', name: '畫法', val: [0, 1], opt: ['單張（一張跟著鏡頭）', '分段（cascade）'], def: 0, note: '單張：一張陰影圖罩住鏡頭看的地方，鏡頭拉越遠罩越大（格子越粗）；分段：照離鏡頭多深切幾段，近的段格子細、遠的段粗' },
  { k: 'show', name: '顯示分段', val: [0, 1], opt: ['關', '開（海平面上畫每一段的範圍與分界）'], def: 0, note: '跟 Debug 模式的陰影範圍線同一份：分段 ＝ 紅、黃、綠、青四段的框＋分界線；單張 ＝ 洋紅的框（內圈是開始淡出的地方）' },
  { k: 'n1', name: '低：陰影圖', val: [512, 1024, 2048, 4096], def: 2048, unit: '²', note: '每一段（單張 ＝ 那一張）的陰影圖幾格見方：大 ⇒ 影子的邊細、吃顯示記憶體與時間。總量有上限（兩張 4096²）：分段 3、4 段時一層最多 2048（主選單的「中」＝ 低這一檔、「高」＝ 高這一檔）' },
  { k: 'p1', name: '低：柔邊取樣', val: [4, 9], opt: ['4 點', '9 點'], def: 4 },
  { k: 'n2', name: '高：陰影圖', val: [512, 1024, 2048, 4096], def: 4096, unit: '²' },
  { k: 'p2', name: '高：柔邊取樣', val: [4, 9], opt: ['4 點', '9 點'], def: 9 },
  { k: 'dist', name: '最遠距離', lim: [100, 4000], step: 50, int: true, unit: ' m', def: 1500, cas: 1, note: '最後一段的遠端；再遠就沒有影子（最後一段的交界那一截淡掉）。分界、最遠距離都從「畫面裡最近的東西」量起：鏡頭比桅頂（80 m）低 ⇒ 從鏡頭；拉高往下看 ⇒ 從看得到的最近的海面、桅頂、山頂（60_render.js csmNear）' },
  { k: 'count', name: '段數', lim: [1, 4], step: 1, int: true, unit: ' 段', def: 4, cas: 1 },
  { k: 's1', name: '分界 1', lim: [5, 1000], step: 5, int: true, unit: ' m', def: 60, cas: 1, seg: 1, note: '第 1 段到第 2 段的分界離鏡頭多深；分界要一個比一個遠、比最遠距離近（不是的話照順序夾）' },
  { k: 's2', name: '分界 2', lim: [10, 2000], step: 5, int: true, unit: ' m', def: 145, cas: 1, seg: 2 },
  { k: 's3', name: '分界 3', lim: [20, 3000], step: 5, int: true, unit: ' m', def: 375, cas: 1, seg: 3 },
  { k: 'b1', name: '交界 1', lim: [0, 0.5], step: 0.01, fix: 2, def: 0.12, cas: 1, seg: 1, note: '第 1 段最後這麼多（那一段長度的比例）跟下一段混，下一段也從這裡開始畫 ⇒ 兩段之間沒有縫、看不到一條線；最後一段 ＝ 淡成沒有影子的那一截' },
  { k: 'b2', name: '交界 2', lim: [0, 0.5], step: 0.01, fix: 2, def: 0.12, cas: 1, seg: 2 },
  { k: 'b3', name: '交界 3', lim: [0, 0.5], step: 0.01, fix: 2, def: 0.12, cas: 1, seg: 3 },
  { k: 'b4', name: '交界 4', lim: [0, 0.5], step: 0.01, fix: 2, def: 0.12, cas: 1, seg: 4 },
  { k: 'pad', name: '分段：範圍放大', lim: [1, 1.6], step: 0.02, fix: 2, unit: ' 倍', def: 1.22, cas: 1, note: '每一段的陰影圖罩住那一段視錐的外接球 × 這個倍數（大 ⇒ 範圍外的船、山也投得到影子，格子粗一點）' },
  { k: 'cache', name: '分段：陸地快取', val: [0, 1], opt: ['關（每一格每一段整張重畫）', '開（陸地另存一層）'], def: 0, cas: 1, note: '開 ＝ 地形、樹、城鎮另存一層，那一段換範圍、地形換網格或滿一秒才重畫（省時間，但跟畫面可能差一格 ⇒ 2026-10-20 那個一閃）' },
  { k: 'sR', name: '單張：範圍', lim: [0.5, 2], step: 0.05, fix: 2, unit: ' 倍', def: 1, one: 1, note: '半寬那幾級（200～1,200 m）× 這個倍數：小 ⇒ 格子細、罩得小' },
  { k: 'ahead', name: '單張：往前推', lim: [0, 0.6], step: 0.05, fix: 2, def: 0.3, one: 1, note: '範圍的中心從鏡頭看的那一點往前推半寬的幾成（鏡頭背後、兩側也要罩到）' },
  { k: 'edge', name: '單張：邊緣淡出', lim: [0.5, 0.95], step: 0.01, fix: 2, def: 0.85, one: 1, note: '範圍的這一圈以外（到 98%）影子淡掉，範圍外不是一刀切掉' },
  { k: 'soft', name: '柔邊寬度', lim: [0.5, 3], step: 0.1, fix: 1, unit: ' 格', def: 1, note: '柔邊取樣每一點相隔幾格（大 ⇒ 邊更糊、格子比較看不出來）' },
  { k: 'nrm', name: '沿法線推', lim: [0, 4], step: 0.1, fix: 1, unit: ' 格', def: 1.5, note: '收影子的那一點往外推幾格再查（小 ⇒ 影子貼緊，太小 ⇒ 平面上自己遮自己的條紋）' },
  { k: 'bias', name: '深度偏差', lim: [0, 4], step: 0.1, fix: 1, unit: ' 格', def: 1.5, note: '比深度時讓幾格（太小 ⇒ 條紋；太大 ⇒ 影子跟物體脫開、浮起來）' },
  { k: 'tree', name: '樹收影子到', lim: [150, 650], step: 25, int: true, unit: ' m', def: 600, note: '樹葉、樹幹收影子到離鏡頭多遠（最後四成淡掉；再遠的樹只照太陽）；650 m 外的樹是貼圖、本來就不收' }];
var SHK = {}, SHK_DEF = {};
SHK_ITEMS.forEach(function (it) { SHK[it.k] = SHK_DEF[it.k] = it.def; });
/** 一個值照描述表收好（按鈕 ⇒ 只收列出來的值；滑桿 ⇒ 夾進範圍、對齊一步）；不收 ⇒ undefined。 */
function shkOk(it, v) { return it.val ? (it.val.indexOf(v) >= 0 ? v : undefined) : cfgSnap(it, v); }
/** 存檔（69_prefs.js shk）：跟預設不一樣的那幾項；讀的時候照描述表收（網址有的那一項照網址）。 */
function shkSnap() { var o = {}; SHK_ITEMS.forEach(function (it) { if (SHK[it.k] !== SHK_DEF[it.k] && !shkUrl(it.k)) o[it.k] = SHK[it.k]; }); return o; }   // 網址指定的那一項不存（不把那一場的網址變成玩家的設定）
function shkApply(o) { SHK_ITEMS.forEach(function (it) { if (shkUrl(it.k)) return; var v = shkOk(it, o[it.k]); if (v !== undefined) SHK[it.k] = v; }); }
function shkReset() { SHK_ITEMS.forEach(function (it) { SHK[it.k] = SHK_DEF[it.k]; }); }
function shkUrl(k) { return Q.has('sh_' + k) || (k === 'mode' && Q.has('csm')); }
/** 分段的遠端與交界（60_render.js shadowPass、畫質頁那一條）：far[i] ＝ 第 i 段的遠端（分界照順序夾：一個比一個遠、比最遠距離近，最後一段 ＝ 最遠距離），
 *  bs[i] ＝ 第 i 段開始跟下一段混的地方 ＝ 遠端 − 交界 ×（那一段的長度）；下一段從 bs[i] 開始畫 ⇒ 混的那一截兩段都有。 */
function shkSplits() {
  var k = SHK.count, D = SHK.dist, far = [], bs = [], prev = 0;
  for (var i = 0; i < k; i++) {
    var f = i === k - 1 ? D : clamp(SHK['s' + (i + 1)], prev + 1, D - (k - 1 - i));
    far.push(f); bs.push(f - SHK['b' + (i + 1)] * (f - prev)); prev = f;
  }
  return { far: far, bs: bs };
}
if (Q.has('csm')) SHK.mode = Q.get('csm') === '1' ? 1 : 0;
SHK_ITEMS.forEach(function (it) { if (!Q.has('sh_' + it.k)) return; var v = shkOk(it, parseFloat(Q.get('sh_' + it.k))); if (v !== undefined) SHK[it.k] = v; });
var GFX_RES = [0.5, 0.75, 1];                      // 解析度：乘在畫布的像素上（畫布 ＝ 螢幕像素，裝置像素比最多 1.5）
function gfxSet(level) { var p = GFX_PRESET[level]; for (var k in p) GFX[k] = p[k]; }
/** 現在的畫質是哪一檔（三檔都對不上 ⇒ custom）。 */
function gfxLevel() {
  for (var l in GFX_PRESET) { var p = GFX_PRESET[l], ok = true; for (var k in p) if (GFX[k] !== p[k]) ok = false; if (ok) return l; }
  return 'custom';
}
function gfxText() { return GFX_ITEMS.map(function (it) { return it.name + ' ' + it.opt[GFX[it.k]].replace(/（.*$/, ''); }).join('・'); }
gfxSet(GFX_PRESET[Q.get('gfx')] ? Q.get('gfx') : GFX_DEFAULT);
GFX_ITEMS.forEach(function (it) { var v = parseInt(Q.get('g_' + it.k), 10); if (isFinite(v)) GFX[it.k] = clamp(v, 0, it.opt.length - 1); });

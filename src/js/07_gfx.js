// ───────────────────────── 畫質（TASK-0522） ─────────────────────────
// 主選單：低／中／高（GFX_PRESET）；畫質設定頁可以一項一項調，跟三檔都對不上 ⇒ 主選單顯示「自訂」。
// ⛔ 只改畫面：這裡的值一個都不能被 step() 讀到（反向對照：同一個種子，低與高跑同樣秒數，戰局讀數逐項相同）。
//   浪的大小（SEA_K）是物理，在細節設定；這裡的「海面細緻度」只是網格多密、漣漪幾道。
// 每一項怎麼畫在 60_render.js（管線：陰影圖 → 反射 → 場景 → 折射 → 海 → 粒子 → 縮放貼到畫布）。
// 網址：?gfx=low|mid|high（縮圖、對拍用），單項 ?g_shadow= ?g_refl= ?g_refr= ?g_sea= ?g_res= ?g_aa= ?g_rain= ?g_drops= ?g_dropspl= ?g_door= ?g_port= ?g_deco=（數字 ＝ 第幾檔，從 0 起）。
// 雨有兩種、各自一項：「雨」＝ 整個畫面一層的雨絲（01_gl.js P.rain）；「雨滴（3D）」＝ 3D 空間裡的雨絲粒子（14_rain.js）。高 ＝ 只開 3D（Tim 2026-10-13）；自訂可以兩種一起開。3D 雨滴打在海面與船上的水花另外一項（雨滴水花，Tim：要能開關）。
var GFX_ITEMS = [
  { k: 'shadow', name: '陰影', opt: ['關', '低（1024）', '高（2048、柔邊）'] },
  { k: 'refl', name: '海面反射', opt: ['關（只反射天空）', '低（船身，1/4 解析度）', '高（船身＋砲與帆，1/2 解析度）'] },
  { k: 'refr', name: '海水折射', opt: ['關（不透明）', '低（半透明）', '高（折射＋水深）'] },
  { k: 'sea', name: '海面細緻度', opt: ['低', '中', '高'] },
  { k: 'res', name: '解析度', opt: ['50%', '75%', '100%'] },
  { k: 'aa', name: '反鋸齒', opt: ['關', '開（MSAA 4×）'] },
  { k: 'rain', name: '雨', opt: ['關', '低（稀）', '高（密）'] },     // 只在暴風雨下（08_weather.js）：整個畫面一層
  { k: 'drops', name: '雨滴（3D）', opt: ['關', '少（1500）', '中（3000）', '多（6000）'] },   // 只在暴風雨下：3D 空間裡的雨絲粒子（14_rain.js）
  { k: 'dropspl', name: '雨滴水花', opt: ['關', '開'] },                                    // 3D 雨滴打在海面與船上濺起的小水花
  { k: 'door', name: '門的開關演出', opt: ['關（一直關著）', '開（有人經過才開）'] },          // 門、艙蓋（TASK-0638，25_doors.js）：人照樣通過、門照樣擋水，這一項只管畫面
  { k: 'port', name: '砲門的開關演出', opt: ['關（蓋板開著、砲推出去不動）', '開（交戰掀蓋推砲、沒事收砲闔蓋、砲口下水就關）'] },   // 砲門（TASK-0719，62_ports.js）：只有蓋板（裝飾）載進來的船才有；戰局不讀。⛔ 併進 door：門三檔都開、砲門低畫質關；只靠「裝飾」：要回主選單才生效、沒有 ?g_port= 做反向對照
  { k: 'fall', name: '艙內水幕', opt: ['關', '開（往下一層流的水畫成水幕）'] },   // 進水的粒子模式（TASK-0651，33_flood.js flFalls）：水照樣往下流，這一項只管畫面
  { k: 'pdep', name: '艙內水的深淺', opt: ['關（一片均勻的半透明）', '開（越深越不透明、貼邊淡出）'] },   // TASK-0654（33_flood.js FL_DEP_GLSL）：讀場景深度；海水折射不是「高」⇒ 有水的那幾格多複製一次深度
  { k: 'pside', name: '艙內水的側面與水瀑', opt: ['關', '開（水面邊上畫側面、兩池交界畫水瀑）'] },   // TASK-0654（33_flood.js flSides）
  { k: 'pedge', name: '艙內水的水邊', opt: ['關（直的）', '開（白沫一圈、淺的邊不規則）'] },   // TASK-0654（33_flood.js flEdgeM、FLE_GLSL）：只在水邊那一圈多算兩次雜訊
  { k: 'deco', name: '裝飾', opt: ['關（載入船時就不載入）', '開'] },   // TASK-0682（05_hull.js decoSplit）：雕刻模型 meta deco=1 的裝飾件；不算重量、不被打、不抽亂數 ⇒ 開關不改戰局。換了要下一次載入船才生效
  // 多船（TASK-0537；60_render.js gpuSlots）：視野裡離鏡頭最近的幾艘才有自己的陰影圖／船艙遮罩（第幾檔 ＝ 幾艘）
  { k: 'shships', name: '陰影船數', opt: gfxOpts(MAX_SHIPS + 1, function (i) { return i ? String(i) : '0（只有全局）'; }) },   // 其他的船畫進一張全局陰影圖（解析度低）
  { k: 'masks', name: '船艙遮罩', opt: gfxOpts(MASK_NEAR + 1, function (i) { return i ? String(i) : '0（艙裡看得到海）'; }) }];   // 說明在畫質設定頁（template #gfxNote）
function gfxOpts(n, f) { var r = []; for (var i = 0; i < n; i++) r.push(f(i)); return r; }
var GFX_PRESET = {
  low: { shadow: 0, refl: 0, refr: 0, sea: 0, res: 1, aa: 0, rain: 0, drops: 0, dropspl: 0, door: 1, port: 0, fall: 1, pdep: 0, pside: 1, pedge: 0, shships: 2, masks: 2, deco: 0 },   // 門的演出很便宜（每扇每格掃一次船員）⇒ 三檔都開；砲門跟裝飾一樣低畫質關（Tim 2026-10-19：「炮門屬於裝飾物 因此相關機制在低畫質不啟用」）
  mid: { shadow: 1, refl: 1, refr: 1, sea: 1, res: 2, aa: 1, rain: 1, drops: 0, dropspl: 0, door: 1, port: 1, fall: 1, pdep: 1, pside: 1, pedge: 1, shships: 4, masks: MASK_NEAR, deco: 1 },
  high: { shadow: 2, refl: 2, refr: 2, sea: 2, res: 2, aa: 1, rain: 0, drops: 3, dropspl: 1, door: 1, port: 1, fall: 1, pdep: 1, pside: 1, pedge: 1, shships: MAX_SHIPS, masks: MASK_NEAR, deco: 1 } };   // 最高 ＝ 每艘都有（Tim 2026-10-13「最高畫質開到 N」）
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

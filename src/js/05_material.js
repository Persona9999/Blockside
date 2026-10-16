// ───────────────────────── 材質（TASK-0616；Tim 2026-10-15）─────────────────────────
// 材質表在設定檔（config/game.json materials；後台可以加、可以改）：{ default: ID, list: { ID: { name, kind, density, hard, flammable } } }，ID 英文小寫、跨船共用。
//   density ＝ 比重（一格 0.1 m ＝ 1 公升 ⇒ 每格幾 kg；橡木 0.7 ＝ 以前統一的 0.7 kg）；hard ＝ 硬度倍率（乘在船隻設定的船殼硬度上；橡木 1）；flammable ＝ 易燃性 0–1（燃燒還沒做，先記著）。
// 每一格的材質：
//   · 全船預設 ＝ 設定檔那艘船的 material（沒寫 ⇒ materials.default）；
//   · 雕刻作品的關聯 meta material 蓋過它（巢狀照最近的那一層）⇒ .vxk 檔頭 materials（senate 匯出；照線性索引 x＋sx·(y＋sy·z) 的連續段落，見造船規格 §9.5）。
// 用在哪：打到的那一格的硬度（21_gunnery.js：洞多大、砲彈穿過去慢多少；一格一格算消耗）、重量（32_hull.js：浮多高、排水量）、殉爆斷船（23_powder.js：照全船預設）。
// ⛔ 沒有材質層、全船預設的比重是 0.7 的船（現在七艘全是）⇒ 走以前那一條（每格 VOX_T、硬度 × 1）—— 戰局逐位元組相同。
var MATS = (CFG.materials && CFG.materials.list) || { oak: { name: '橡木', kind: 'wood', density: 0.7, hard: 1, flammable: 0.5 } };
var MAT_DEF = CFG.materials && MATS[CFG.materials.default] ? CFG.materials.default : Object.keys(MATS)[0];
var MAT_REF = 0.7;                                                       // VOX_T（32_hull.js）是比重 0.7 的一格
function matInfo(id) { return MATS[id] || MATS[MAT_DEF]; }
/** 一格幾噸（材質參數 m）。比重 0.7 ⇒ 就是 VOX_T（⛔ 不重算：0.7 ÷ 0.7 × VOX_T 不一定剛好等於 VOX_T）。 */
function matVoxT(m) { return m.density === MAT_REF ? VOX_T : VOX_T * m.density / MAT_REF; }
/** 船型 T 的材質（載入時算一次，05_hull.js buildHull）：
 *  T.mat0 ＝ 全船預設的 ID；T.matIds[i] ＝ 索引 i 的材質 ID（0 ＝ 全船預設）；T.matG ＝ 每格的索引（VoxelKit 的稀疏網格；沒有材質層 ⇒ null）；
 *  T.matK[i] ＝ 硬度倍率、T.matT[i] ＝ 一格幾噸；T.matN[i] ＝ 原本幾格；T.matXYZ[i]（i ≥ 1）＝ 那幾格的座標（打掉多少照它數）；T.voxT0 ＝ 格子的總重（噸）；
 *  T.matBad ＝ 檔頭寫了、材質表沒有的 ID（照全船預設；匯入檢查報）。 */
function hullMaterials(T, info) {
  var h = T.h.materials, base = T.base;
  T.mat0 = info.material && MATS[info.material] ? info.material : MAT_DEF;
  T.matIds = [T.mat0]; T.matG = null; T.matBad = [];
  if (info.material && !MATS[info.material]) T.matBad.push(info.material + '（全船預設）');
  var n = 1 + (h && h.ids ? h.ids.length : 0), XYZ = [];
  T.matK = new Float64Array(n); T.matT = new Float64Array(n); T.matN = new Float64Array(n); T.matM = new Float32Array(n); T.matR = new Float32Array(n);   // matM／matR：金屬度、粗糙度（TASK-0627；平滑渲染照它反光）
  if (h && h.ids) h.ids.forEach(function (id) { if (!MATS[id]) T.matBad.push(id); T.matIds.push(id); });
  T.matIds.forEach(function (id, i) { var m = matInfo(id); T.matK[i] = m.hard; T.matT[i] = matVoxT(m); T.matM[i] = +m.metal || 0; T.matR[i] = isFinite(+m.rough) && m.rough !== undefined ? +m.rough : 0.5; XYZ.push([]); });
  if (h && h.ids && h.runs && h.runs.length) {                            // 段落：[跟上一段結尾差幾、長度、索引]，一段 ＝ 線性索引相連的格（senate 匯出；⛔ 不跨空格 ⇒ 只走有格的地方）
    var G = new VK.Grid(T.h.size), sx = T.h.size[0], sy = T.h.size[1], at = 0, R = h.runs;
    for (var k = 0; k + 2 < R.length; k += 3) {
      var s = at + R[k], c = R[k + 1], m = R[k + 2], P = XYZ[m];
      var z = Math.floor(s / (sx * sy)), r = s - z * sx * sy, y = Math.floor(r / sx), x = r - y * sx;
      for (var j = 0; j < c; j++) {
        if (base.get(x, y, z)) { G.set(x, y, z, m); T.matN[m]++; P.push(x, y, z); }
        if (++x === sx) { x = 0; if (++y === sy) { y = 0; z++; } }
      }
      at = s + c;
    }
    T.matG = G;
  }
  T.matXYZ = XYZ.map(function (a) { return new Int16Array(a); });
  var rest = base.count; for (var i = 1; i < n; i++) rest -= T.matN[i];
  T.matN[0] = rest;
  T.matPlain = !T.matG && T.matT[0] === VOX_T;                            // 以前那一條（每格 VOX_T）
  T.voxT0 = T.matPlain ? base.count * VOX_T : 0;
  if (!T.matPlain) for (i = 0; i < n; i++) T.voxT0 += T.matN[i] * T.matT[i];
  if (T.matBad.length) console.warn('材質表沒有：' + T.matBad.join('、') + ' ⇒ 照全船預設 ' + T.mat0 + '（' + T.name + '）');
  // 平滑渲染（TASK-0616 第二段）：檔頭 render（關聯的 meta render，同一個段落格式）⇒ T.smG（smooth 那幾格 ＝ 1；VoxelKit 的方塊網格化跳過它們，15_smooth.js 另外畫成平滑面）
  var rh = T.h.render, si = rh && rh.ids ? rh.ids.indexOf('smooth') + 1 : 0;
  T.smG = null; T.smN = 0;
  if (si && rh.runs && rh.runs.length) {
    var SG = new VK.Grid(T.h.size), sx2 = T.h.size[0], sy2 = T.h.size[1], at2 = 0, R2 = rh.runs;
    for (var k2 = 0; k2 + 2 < R2.length; k2 += 3) {
      var s2 = at2 + R2[k2], c2 = R2[k2 + 1];
      if (R2[k2 + 2] === si) {
        var z2 = Math.floor(s2 / (sx2 * sy2)), q2 = s2 - z2 * sx2 * sy2, y2 = Math.floor(q2 / sx2), x2 = q2 - y2 * sx2;
        for (var j2 = 0; j2 < c2; j2++) { if (base.get(x2, y2, z2)) { SG.set(x2, y2, z2, 1); T.smN++; } if (++x2 === sx2) { x2 = 0; if (++y2 === sy2) { y2 = 0; z2++; } } }
      }
      at2 = s2 + c2;
    }
    if (T.smN) { T.smG = SG; base.sm = SG; }
  }
}
/** 那一格的硬度倍率（打掉之後照樣查得到：材質層不跟著改）。 */
function matK(sh, x, y, z) { var T = sh.T; return T.matG ? T.matK[T.matG.get(x, y, z)] : T.matK[0]; }
/** 那一格的材質參數（matInfo；砲帶的裝甲也照它：裝甲的格座標就是材質層的座標）。實心彈判擊穿用（21_gunnery.js impact：pen、kind）。 */
function matAt(sh, x, y, z) { var T = sh.T; return matInfo(T.matIds[T.matG ? T.matG.get(x, y, z) : 0]); }
/** 船殼硬度的基準（Tim 2026-10-16：船隻設定的硬度改成倍率、1 ＝ 只看材質；以前的預設 3 搬到這裡 ⇒ 倍率 1 的船跟以前預設硬度的船一樣）。 */
var HARD_BASE = 3;
/** 打到 L（格座標）的硬度 ＝ 基準 × 船隻設定的硬度倍率（預設 1）× 那一格的材質倍率。 */
function hardAt(sh, L) { return HARD_BASE * sh.cfg.hard * matK(sh, L[0] | 0, L[1] | 0, L[2] | 0); }
/** 全船預設材質的硬度（殉爆斷船這種整艘的判斷）。 */
function hard0(sh) { return HARD_BASE * sh.cfg.hard * sh.T.matK[0]; }
/** 格子少掉的重量（噸）：以前那一條 ＝ 少幾格 × VOX_T；有材質 ⇒ 每種材質還剩幾格（非預設的照座標數，格子只會少、不會多 ⇒ 只在格數變了才重數）。
 *  砲帶的裝甲（24_armor.js）也是船上的格：還剩幾格 ＝ 船殼＋裝甲（裝甲的格座標就是材質層的座標）；sh.orig 只算船殼 ⇒ 原本幾格 ＝ sh.orig ＋ sh.armN0。沒有裝甲 ⇒ 跟以前同一條算式。 */
function voxLostT(sh) {
  var T = sh.T, n = sh.arm ? sh.grid.count + armCount(sh) : sh.grid.count, n0 = sh.arm ? sh.orig + sh.armN0 : sh.orig;
  if (T.matPlain) return (n0 - n) * VOX_T;
  if (sh.matLostAt === n) return sh.matLost;
  var t = 0, alive = 0;
  for (var i = 1; i < T.matIds.length; i++) {
    var P = T.matXYZ[i], a = 0;
    for (var k = 0; k < P.length; k += 3) if (sh.grid.get(P[k], P[k + 1], P[k + 2]) || (sh.arm && armGet(sh, P[k], P[k + 1], P[k + 2]))) a++;
    t += (T.matN[i] - a) * T.matT[i]; alive += a;
  }
  t += (T.matN[0] + (n0 - T.base.count) - (n - alive)) * T.matT[0];   // 預設材質：原本幾格 − 還剩（全部還剩 − 非預設還剩）；n0 ≠ 船型的格數（不該發生）⇒ 差額算在預設材質
  sh.matLostAt = n; sh.matLost = t;
  return t;
}
/** 讀數（匯入檢查、主控台）：每種材質幾格、幾噸。 */
function matSummary(T) {
  return T.matIds.map(function (id, i) { var m = matInfo(id); return { id: id, name: m.name, voxels: T.matN[i], t: +(T.matN[i] * T.matT[i]).toFixed(1), hard: T.matK[i], density: m.density, flammable: m.flammable, def: i === 0 }; });
}

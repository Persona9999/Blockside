// ───────────────────────── 陣營旗（Tim 2026-10-15：辨認陣營的旗，參考史實；遊戲專用 ⇒ 位置寫在設定檔，跟雕刻無關） ─────────────────────────
// 史實（帆船時代）：船尾國旗（ensign）是主要的辨識，開火前一定要升真旗；主桅頂的長旗（commissioning pennant）＝ 現役軍艦；
//   開戰時在好幾根桅頂多掛幾面旗（battle ensigns），一面被打掉還有別面。英國海軍分紅、白、藍三色艦隊旗（底色＋左上角聯合旗）。
// Tim 拍板：長旗＋戰鬥旗、仿英國艦隊旗 ⇒ 藍方 ＝ 藍旗（Blue Ensign）、紅方 ＝ 紅旗（Red Ensign）；長旗靠旗桿那段白底紅十字（聖喬治十字）、尾巴是陣營色。作品自己的國旗照留。
// Tim 2026-10-15（第二輪）：「旗子不要綁在原本有旗幟的地方（且直接套用布料）」「跟帆一樣，被打會破」「每艘船要手動定義掛旗的位置，由妳來掛上」
//   「或是陣營旗是否可以直接往上再加一根旗桿」⇒
//   · 位置：旗桿從桅頂往上，旗掛在旗桿頂 ⇒ 比作品原本掛在桅頂的旗高、不搶位置；Tim：「如果加旗桿，是否可以自動掛旗」⇒
//     沒寫設定檔 ⇒ 自動：每根桅頂一根旗桿，主桅（沒有就最高那根）長旗、其他戰鬥旗；大小照桅頂離水面多高（60 m ＝ 1 倍，0.5–1.1）。
//     要覆寫某艘 ⇒ 設定檔 ships[].flags ＝ [{ kind: 'pennant'|'ensign', at: [x, y, z] 桅頂那一格（格座標）, pole: 旗桿幾公尺, scale: 大小倍率 }]。
//     替換作品原本的旗（Tim：「手動設定的話可以設定替換原有旗幟，例如憲法號原本就有美國國旗」）⇒ { kind, replace: '<旗的種類（meta flag）或名字>' }：
//       先找 meta kind=flag、flag ＝ 那個種類的第一面（Tim：作品的旗標 meta、照 meta 認是哪一種），沒有才照名字；
//       布料、位置、被打都照原本那面，只換貼圖（藍方藍旗、紅方紅旗；照原本那面的 uv —— 作品的旗沒有貼圖就換不了，主控台警告）。
//     桅頂 mastTrucks ＝ 那根桅最高的帆桁轉軸往上、沿中線找到的最高一格（桅會往後傾 ⇒ x 跟著格子走）。
//   · 旗面 ＝ 一面帆（合成的，teamFlagsSetup 在載入船型時接在 T.rig.sails 後面）⇒ 跟帆同一套：布料物理、被打扣血、撕破、布片、掉下去、降旗收起來。
//     綁邊（靠旗桿那一邊）明寫釘在桅頂那一格（clothTemplate 的 s.pins；⛔ 不照外緣直不直猜 —— 旗桿頂離格子太遠，猜不到）；
//     桅頂那一格沒了 ⇒ 旗掉（10_ship.js 的 sail.as ＝ 那一格）、旗桿不畫。
//   · 藍、紅兩份貼圖都進貼圖集；船型是兩隊共用的 ⇒ 畫的時候照船的陣營挑那一格（sailRect）。
// ⛔ 會改戰局：旗是帆 ⇒ 砲彈經過會打到、掉的時候抽亂數。?colours=0 ⇒ 不加旗（跟沒有陣營旗之前逐位元組相同）。
var COL_FIELD = { blue: [0.1, 0.14, 0.42], red: [0.72, 0.1, 0.09] }, COL_W = [0.93, 0.92, 0.88], COL_R = [0.78, 0.08, 0.1], COL_UB = [0.1, 0.14, 0.42];
var COL_SIZE = { ensign: [7, 3.6, 14, 7, 64, 32], pennant: [16, 0.7, 24, 2, 128, 8] };   // 長、寬（公尺）、布料沿飛的方向幾格、沿旗桿幾格、貼圖寬高（px）
var COL_ON = Q.get('colours') !== '0';                                   // ?colours=0 ⇒ 不加旗（對照用）
var COL_POLE_W = 0.16, COL_POLE_C = [0.36, 0.27, 0.17];                   // 旗桿粗細（公尺）、顏色
// ── 旗 ＝ 底色＋紋章（TASK-0950；Tim 2026-10-25「旗幟可以有底色+紋章兩部分(底色可換) 旗幟資訊就會是底色+紋章」
//    「開戰鈕的左右側可以讓玩家選取兩陣營旗幟 把目前都用英國旗幟的部分替換掉」「之後在Blocksail也會用到 替換國家旗或是玩家自己的旗幟」）──
//   一面旗 ＝ { field: '#rrggbb' 底色, emblem: 紋章的 key }；兩陣營各一份（teamFlag('blue'|'red')）。以前寫死的英國藍旗、紅旗 ＝ 聯合旗角＋藍底／紅底（預設 ⇒ 貼圖逐位元組相同）
//   紋章 FLAG_EMB：at(X, Y) ⇒ 那一點的顏色｜null（null ＝ 底色）—— X 沿飛 0（旗桿）～2（尾）、Y 沿旗桿 0（上）～1（下）（旗面 2:1，圓才是圓的）；
//     hoist(u, v, hl) ＝ 長旗靠旗桿那一段（沒寫 ⇒ 整段 ink）；ink ＝ 紋章的主色；res ＝ 戰鬥旗的貼圖放大幾倍（圖案細的要多幾點；聯合旗角 1 ＝ 以前的 64 × 32）
//   選哪一面：網址 ?flags=<我方>,<敵方>（預設旗的 key，或 <紋章或預設旗的 key>:<底色 6 位 hex>）＞ 設定存檔 ＞ 預設；主選單開戰鈕左右兩側的選單（外殼 71_menu.js flagUI）；__game.flags({ blue, red }) 改
//   ⇒ 已經載入的船型照新的重烘旗面（flagsRetex：只換貼圖集，布料、位置、被打都不動 ⇒ 不碰戰局）
var FLAG_EMB = {
  union: { name: '聯合旗角', ink: COL_R, res: 1,
    at: function (X, Y) {                                               // 左上角四分之一是聯合旗（1801 年後：聖喬治＋聖安德魯＋聖派翠克，這裡畫成藍底、白斜十字、白邊紅十字）
      var u = X / 2, v = Y; if (u > 0.5 || v > 0.5) return null;
      var cu = u / 0.5, cv = v / 0.5, d1 = Math.abs(cu - cv), d2 = Math.abs(cu + cv - 1);
      if (Math.abs(cu - 0.5) < 0.09 || Math.abs(cv - 0.5) < 0.12) return COL_R;
      if (Math.abs(cu - 0.5) < 0.17 || Math.abs(cv - 0.5) < 0.22) return COL_W;
      if (Math.min(d1, d2) < 0.11) return COL_W;
      return COL_UB;
    },
    hoist: function (u, v, hl) { return Math.abs(u - hl / 2) < hl * 0.16 || Math.abs(v - 0.5) < 0.17 ? COL_R : COL_W; } },   // 長旗靠旗桿那一段白底紅十字（聖喬治）
  burgundy: { name: '勃艮第十字', ink: COL_R, res: 2,                   // 西班牙（1506～1785 的海軍旗）：白底、紅色帶節的斜十字（兩根粗枝交叉）
    at: function (X, Y) {
      var a = (X - 2 * Y) / Math.sqrt(5), b = (X + 2 * Y - 2) / Math.sqrt(5), t1 = (2 * X + Y) / Math.sqrt(5), t2 = (2 * X - Y) / Math.sqrt(5);
      var w1 = 0.07 + (Math.sin(t1 * 26) > 0.55 ? 0.03 : 0), w2 = 0.07 + (Math.sin(t2 * 26) > 0.55 ? 0.03 : 0);   // 枝上的節（ragged staff）
      return Math.abs(a) < w1 || Math.abs(b) < w2 ? COL_R : null;
    } },
  crescent: { name: '新月與星', ink: COL_W, res: 2,                      // 鄂圖曼：紅底、白色新月＋五角星
    at: function (X, Y) {
      var dx = X - 0.82, dy = Y - 0.5, ex = X - 0.92;
      if (dx * dx + dy * dy < 0.27 * 0.27 && ex * ex + dy * dy > 0.225 * 0.225) return COL_W;
      return flagStar(X - 1.2, Y - 0.5, 0.12) ? COL_W : null;
    } },
  skull: { name: '骷髏與交叉骨', ink: COL_W, res: 2,                      // 海盜：黑底、白骷髏、下面兩根交叉的骨頭
    at: function (X, Y) {
      function c(x, y, r) { return (X - x) * (X - x) + (Y - y) * (Y - y) < r * r; }
      function seg(ax, ay, bx, by, r) { var vx = bx - ax, vy = by - ay, t = clamp(((X - ax) * vx + (Y - ay) * vy) / (vx * vx + vy * vy), 0, 1), px = ax + vx * t - X, py = ay + vy * t - Y; return px * px + py * py < r * r; }
      if (c(0.93, 0.35, 0.045) || c(1.07, 0.35, 0.045) || (Y > 0.43 && Y < 0.47 && Math.abs(X - 1) < 0.02)) return null;   // 眼窩、鼻樑 ⇒ 底色
      if (c(1, 0.33, 0.16) || (Math.abs(X - 1) < 0.1 && Y > 0.33 && Y < 0.55)) return COL_W;   // 頭骨＋下顎
      if (seg(0.7, 0.64, 1.3, 0.9, 0.035) || seg(0.7, 0.9, 1.3, 0.64, 0.035)) return COL_W;    // 交叉骨
      if (c(0.69, 0.61, 0.04) || c(0.67, 0.67, 0.04) || c(1.31, 0.61, 0.04) || c(1.33, 0.67, 0.04) || c(0.69, 0.93, 0.04) || c(0.67, 0.87, 0.04) || c(1.31, 0.93, 0.04) || c(1.33, 0.87, 0.04)) return COL_W;   // 骨頭兩端的關節
      return null;
    } },
  // 國旗（TASK-0974；Tim 2026-10-26「可以給不同國家的城鎮加上對應旗幟替換」）：Blocksail 往來的船照船隊主人那座城的勢力掛（sh.nation）
  cross: { name: '白十字', ink: COL_W, res: 1,                           // 法國 1660 年代的商船旗：藍底白十字（王家海軍是白旗）
    at: function (X, Y) { return Math.abs(X - 1) < 0.1 || Math.abs(Y - 0.5) < 0.1 ? COL_W : null; } },
  'cross-red': { name: '紅十字', ink: COL_R, res: 1,                     // 熱那亞：白底聖喬治紅十字
    at: function (X, Y) { return Math.abs(X - 1) < 0.1 || Math.abs(Y - 0.5) < 0.1 ? COL_R : null; } },
  nordic: { name: '北歐十字', ink: COL_W, res: 1,                        // 丹麥：紅底白色北歐十字（豎的那一根偏旗桿）
    at: function (X, Y) { return Math.abs(X - 0.72) < 0.11 || Math.abs(Y - 0.5) < 0.11 ? COL_W : null; } },
  stripes: { name: '三橫條', ink: COL_W, res: 1,                         // 荷蘭：紅白藍三橫條（1660 年代已多用紅取代橘）；上面那一條 ＝ 底色
    at: function (X, Y) { return Y < 1 / 3 ? null : Y < 2 / 3 ? COL_W : [0.13, 0.27, 0.55]; } },
  none: { name: '（沒有紋章）', ink: COL_W, res: 1, at: function () { return null; } }
};
//   預設旗（選單裡那幾面；Tim「旗幟可以做下拉選單 先加三四種就好」）：key ⇒ { name, field, emblem }。英國藍旗、紅旗的底色 ＝ 以前的 COL_FIELD 換成 0～255（round）⇒ 同一個位元組
var FLAG_PRESETS = [
  { k: 'gb-blue', name: '英國藍旗', field: '#1a246b', emblem: 'union' },
  { k: 'gb-red', name: '英國紅旗', field: '#b81a17', emblem: 'union' },
  { k: 'spain', name: '西班牙', field: '#ece9e0', emblem: 'burgundy' },
  { k: 'ottoman', name: '鄂圖曼', field: '#b81a17', emblem: 'crescent' },
  { k: 'pirate', name: '海盜', field: '#141414', emblem: 'skull' },
  { k: 'france', name: '法國', field: '#1f3e8a', emblem: 'cross' },
  { k: 'dutch', name: '荷蘭', field: '#ae1c28', emblem: 'stripes' },
  { k: 'denmark', name: '丹麥', field: '#c8102e', emblem: 'nordic' },
  { k: 'genoa', name: '熱那亞', field: '#ece9e0', emblem: 'cross-red' }
];
var FLAG_DEF = { blue: 'gb-blue', red: 'gb-red' };
// ⛔ 下面兩個不給初值：69_prefs.js 讀存檔時本檔還沒跑（同一個閉包，var 提升）⇒ 那時先把存檔那一格原樣放進 FLAG_PREF，teamFlag 第一次用到才解
var FLAG_PREF, TEAM_FLAGS;
/** 五角星（中心 (x, y) 已經減掉、外半徑 R）：點在不在星裡（照十個頂點的多邊形）。 */
function flagStar(x, y, R) {
  var n = 10, inside = false;
  for (var i = 0, j = n - 1; i < n; j = i++) {
    var ai = -Math.PI / 2 + i * Math.PI / 5, aj = -Math.PI / 2 + j * Math.PI / 5, ri = i % 2 ? R * 0.4 : R, rj = j % 2 ? R * 0.4 : R;
    var xi = Math.cos(ai) * ri, yi = Math.sin(ai) * ri, xj = Math.cos(aj) * rj, yj = Math.sin(aj) * rj;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** '#rrggbb' ⇒ [r, g, b]（0～1）；不合 ⇒ null。 */
function flagRgb(h) { var m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; var n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
/** 一面旗照規矩整理（{ field, emblem }；外部給的也走這裡）⇒ 新的一份｜null。 */
function flagOk(f) { if (!f || typeof f !== 'object' || !FLAG_EMB[f.emblem] || !flagRgb(f.field)) return null; return { field: '#' + flagRgb(f.field).map(function (c) { return ('0' + Math.round(c * 255).toString(16)).slice(-2); }).join(''), emblem: f.emblem }; }
function flagPreset(k) { var p = FLAG_PRESETS.filter(function (q) { return q.k === k; })[0]; return p ? { field: p.field, emblem: p.emblem } : null; }
/** 網址那一格：預設旗的 key，或 <紋章或預設旗的 key>:<底色 hex>（換底色）。 */
function flagParse(s) { if (!s) return null; var p = flagPreset(s); if (p) return p; var a = s.split(':'), q = flagPreset(a[0]); return flagOk({ emblem: q ? q.emblem : a[0], field: '#' + (a[1] || '').replace('#', '') }); }
/** 陣營 t（'blue' 我方｜'red' 敵方）掛哪一面旗。 */
function teamFlag(t) {
  if (!TEAM_FLAGS) {
    TEAM_FLAGS = { blue: flagPreset(FLAG_DEF.blue), red: flagPreset(FLAG_DEF.red) };
    var q = Q.has('flags') ? Q.get('flags').split(',') : null;
    ['blue', 'red'].forEach(function (s, i) { var f = q ? flagParse(q[i]) : flagOk(FLAG_PREF && FLAG_PREF[s]); if (f) TEAM_FLAGS[s] = f; });
  }
  return TEAM_FLAGS[t === 'red' ? 'red' : 'blue'];
}
/** 換旗（選單、__game.flags、之後 Blocksail）：o ＝ { blue?, red? }（每一個 ＝ 旗或預設旗的 key）⇒ 已載入的船型重烘旗面；回換了幾邊。 */
function flagSet(o) {
  teamFlag('blue'); var n = 0;
  ['blue', 'red'].forEach(function (s) { var f = o && (typeof o[s] === 'string' ? flagParse(o[s]) : flagOk(o[s])); if (f && JSON.stringify(f) !== JSON.stringify(TEAM_FLAGS[s])) { TEAM_FLAGS[s] = f; n++; } });
  if (n) { flagsRetex(); evEmit('flags:set'); }                       // 主選單的選旗照新的重畫（外殼 71_menu.js 訂閱；核心不叫外殼的名字）
  return n;
}
/** 旗面上 (u 沿飛的方向 0 旗桿 → 1 尾、v 沿旗桿 0 上 → 1 下) 的顏色；f ＝ { field, emblem }。 */
function colourAt(kind, f, u, v) {
  var F = flagRgb(f.field) || COL_FIELD.blue, E = FLAG_EMB[f.emblem] || FLAG_EMB.none;
  if (kind === 'pennant') {                                              // 長旗：靠旗桿那一段畫紋章的（聯合旗角 ⇒ 白底紅十字），之後是底色
    var hl = 0.07; if (u > hl) return F;
    return E.hoist ? E.hoist(u, v, hl) : E.ink;
  }
  return E.at(u * 2, v) || F;                                            // 戰鬥旗：紋章蓋在底色上
}
/** 這一型的桅頂（格座標）：{ fore: [x, y, z], … }。 */
function mastTrucks(T) {
  if (T.trucks) return T.trucks;
  var top = {}, key = { '前桅': 'fore', '主桅': 'main', '後桅': 'mizzen' }, g = T.base, cy = Math.round(T.cy);
  (T.rig.models || []).forEach(function (m) { var mt = m.meta || {}, pv = (m.points || {}).pivot; if (mt.kind === 'yard' && mt.mast && mt.mast !== 'bowsprit' && pv && (!top[mt.mast] || pv[2] > top[mt.mast][2])) top[mt.mast] = pv; });
  T.masts.forEach(function (m) { var k = key[m.name] || m.name; if (!top[k]) top[k] = [m.x, cy, m.z1]; });
  var out = {};
  Object.keys(top).forEach(function (k) {
    var x = Math.round(top[k][0]), z = Math.floor(top[k][2]), best = null, miss = 0;
    for (; z < T.sz && miss < 4; z++) {                                  // 往上一層一層找：中線附近有格 ⇒ 桅還在這一層（x 跟著格子的平均走）
      var sx = 0, n = 0;
      for (var xx = x - 12; xx <= x + 12; xx++) for (var y = cy - 2; y <= cy + 2; y++) if (g.get(xx, y, z)) { sx += xx; n++; }
      if (n) { x = Math.round(sx / n); best = [x, cy, z]; miss = 0; } else miss++;
    }
    if (best) out[k] = best;
  });
  return (T.trucks = out);
}
/** 沒寫設定檔的船：每根桅頂一根旗桿（主桅長旗、其他戰鬥旗），大小照桅頂多高。 */
function autoFlags(T) {
  var tr = mastTrucks(T), ks = Object.keys(tr); if (!ks.length) return [];
  var pm = tr.main ? 'main' : ks.slice().sort(function (a, b) { return tr[b][2] - tr[a][2]; })[0], hz = (tr[pm][2] - T.zw) * S, k = clamp(hz / 60, 0.5, 1.1);
  return ks.map(function (m) { return { kind: m === pm ? 'pennant' : 'ensign', at: tr[m], pole: 4.5 * k, scale: k, mast: m }; });
}
/** 一面旗的貼圖（跟 .vxk 帆的 texture 同一種格式：w×h 的 RGBA、base64）；f ＝ { field, emblem }。 */
function colourTex(kind, f, W, H) {
  var b = '';
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var c = colourAt(kind, f, (x + 0.5) / W, (y + 0.5) / H); b += String.fromCharCode(Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255), 255); }
  return btoa(b);
}
/** 陣營 team 那一面旗、kind 那一種的貼圖 ⇒ { w, h, rgba }（戰鬥旗照紋章的 res 放大；長旗照舊）。 */
function flagTex(kind, team) { return flagTexOf(kind, teamFlag(team)); }
/** 一面旗 f ＝ { field, emblem }、kind 那一種的貼圖（flagTex 是陣營的那一面；每艘船自己的旗 flagVariant 也用這支）。 */
function flagTexOf(kind, f) {
  var Z = COL_SIZE[kind] || COL_SIZE.ensign, r = kind === 'pennant' ? 1 : (FLAG_EMB[f.emblem] || FLAG_EMB.none).res || 1, W = Z[4] * r, H = Z[5] * r;
  return { w: W, h: H, rgba: colourTex(kind, f, W, H) };
}
/** 換旗之後：每一型已載入的船（HULLT）把陣營旗那幾份貼圖照新的旗重烘、重排貼圖集、GL 那張丟掉（下一次畫 11_rig_gpu.js 重傳）。
 *  T.flagSlots ＝ [{ o: 帶 texture 的那一份（合成的旗那面帆／teamExtra 那一格）, kind, team }]（teamFlagsSetup 記的）；uv、alpha_min 照舊。 */
function flagsRetex() {
  Object.keys(HULLT).forEach(function (id) {
    var T = HULLT[id]; if (!T || !T.flagSlots || !T.flagSlots.length) return;
    T.flagSlots.forEach(function (q) { q.o.texture = Object.assign({}, q.o.texture, flagTex(q.kind, q.team)); });
    if (T.sailAtlas) { T.sailAtlas = sailAtlas(T.rig.sails.concat(T.teamExtra || [])); if (T.sailTexGL) gl.deleteTexture(T.sailTexGL); T.sailTexGL = null; }
  });
}
// ── 每艘船自己的旗（TASK-0974）：sh.nation ＝ 預設旗的 key（Blocksail 往來的船照船隊主人那座城的勢力）⇒ 船上的陣營旗（合成的、替換掉的作品旗）都換成那一面；
//    沒有 ⇒ 照陣營（藍、紅）—— 戰局、我艦都不帶 ⇒ 跟以前逐位元組相同。
//    貼圖集：那一型第一次有船要某一面 ⇒ 每一面陣營旗多烘一份接在 teamExtra 後面（T.flagVar[旗] ＝ { 帆: 貼圖集的哪一格 }）、重排貼圖集；
//    排過 ⇒ 每一格的位置都可能變 ⇒ 同型的船都標 rigDirty（物理關著的船帆的緩衝只在 rigDirty 時重做 —— 不標 ⇒ 舊的 UV 對到新的貼圖集，旗面錯位）。
//    ⛔ 只換畫面：旗還是那一面帆（布料、被打、降旗照舊），不碰模擬。
function flagVariant(T, k) {
  var f = flagPreset(k); if (!T || !T.flagTi || !f) return null;
  var V = T.flagVar || (T.flagVar = {}); if (V[k]) return V[k];
  var m = {}, n = T.rig.sails.length;
  Object.keys(T.flagTi).forEach(function (ti) { var q = T.flagTi[ti]; m[ti] = n + T.teamExtra.length; T.teamExtra.push({ texture: Object.assign({ uv: q.uv, alpha_min: 0 }, flagTexOf(q.kind, f)) }); });
  V[k] = m;
  if (T.sailAtlas) {
    T.sailAtlas = sailAtlas(T.rig.sails.concat(T.teamExtra)); if (T.sailTexGL) gl.deleteTexture(T.sailTexGL); T.sailTexGL = null;
    SHIPS.forEach(function (s) { if (s.T === T) s.rigDirty = true; });
  }
  return m;
}
/** 給一艘船掛 k 那一面旗（預設旗的 key；null ⇒ 回到陣營旗）⇒ 掛上了 true；不認得的 key ⇒ false、照陣營。 */
function shipNation(sh, k) {
  var m = k ? flagVariant(sh.T, k) : null;
  sh.nation = m ? k : null; sh.flagMap = m; sh.rigDirty = true;
  return !!m;
}
/** 載入船型時（05_hull.js「桅與帆」那一步、clothSetup 之前）：照設定檔的 flags 生旗（合成的帆，接在 T.rig.sails 後面）。
 *  T.nSail0 ＝ 作品自己的帆有幾面（快取只存這幾面的布料，06_cache.js）；T.teamExtra ＝ 貼圖集排在帆後面的那幾份（陣營旗紅的那份、替換作品旗的藍紅兩份；clothSetup）、
 *  T.teamTex[帆] ＝ { blue, red } 貼圖集的哪一格（sailRect）；T.poles ＝ 旗桿。 */
function teamFlagsSetup(T, info) {
  T.nSail0 = T.rig.sails.length; T.teamTex = {}; T.teamExtra = []; T.poles = []; T.flagSlots = []; T.flagTi = {}; T.flagVar = {};
  if (!COL_ON) return;
  var defs = info && info.flags || autoFlags(T); if (!defs.length) return;
  T.teamDefs = defs;
  var add = [], red = [], repl = [];
  defs.forEach(function (f, fi) {
    if (f.replace) { repl.push(f); return; }
    var Z = COL_SIZE[f.kind], k = f.scale || 1, Lm = Z[0] * k / S, Hm = Z[1] * k / S, NU = Z[2], NV = Z[3], a = f.at, top = a[2] + (f.pole || 4.5) / S;
    var cell = anchorNear(T, a[0], a[1], a[2], 3), pen = f.kind === 'pennant', verts = [], uv = [], tris = [], pins = [], u, v;
    for (u = 0; u <= NU; u++) for (v = 0; v <= NV; v++) {               // 往船尾飄（−x）、稍微下垂、一點起伏（物理關著時就是這個樣子）
      var uu = u / NU, vv = v / NV, w = pen ? 1 - 0.85 * uu : 1;
      verts.push(a[0] - 1 - Lm * uu, a[1] + Math.sin(uu * 5) * Hm * 0.08 * uu, top - ((vv - 0.5) * w + 0.5) * Hm - Lm * uu * uu * 0.08);
      uv.push(uu, vv);
      if (u === 0) pins.push(v);
    }
    for (u = 0; u < NU; u++) for (v = 0; v < NV; v++) { var p = u * (NV + 1) + v, q = p + NV + 1; tris.push(p, q, q + 1, p, q + 1, p + 1); }
    var nm = 'team-' + f.kind + '-' + fi, col = COL_FIELD.blue, xr = { texture: Object.assign({ uv: uv, alpha_min: 0 }, flagTex(f.kind, 'red')) };
    var sl = { name: nm, verts: verts, tris: tris, color: col, meta: { kind: 'flag', flag: pen ? 'pennant' : 'battle', team: 1 }, pins: pins, pinK: cell >= 0 ? 1 : 3, pinV: cell, truckCell: cell,
      texture: Object.assign({ uv: uv, alpha_min: 0 }, flagTex(f.kind, 'blue')) };
    T.flagTi[T.nSail0 + add.length] = { kind: f.kind, uv: uv };          // 每艘船自己的旗（flagVariant）照這一份多烘
    red.push([T.nSail0 + add.length, xr]); add.push(sl);
    T.flagSlots.push({ o: sl, kind: f.kind, team: 'blue' }, { o: xr, kind: f.kind, team: 'red' });   // 換旗重烘（flagsRetex）
    T.poles.push({ at: a, top: top + 0.6, cell: cell });                 // 旗桿：桅頂 → 旗頭上面一點
    for (var q = 0; q < verts.length; q += 3) T.radFlags = Math.max(T.radFlags || 0, Math.hypot(verts[q] - T.cx, verts[q + 1] - T.cy, verts[q + 2] - T.geo.center) * S);   // 離船心最遠多少（32_hull.js：砲彈離船心超過這個就不看這艘）
  });
  T.rig = Object.assign({}, T.rig, { sails: T.rig.sails.concat(add) });   // ⛔ 不改 header 那一份（hullCheck 之類的還要讀作品原本的帆）
  var n = T.rig.sails.length;                                          // 貼圖集：帆（含合成的旗，藍的那份）之後接 teamExtra（clothSetup）
  red.forEach(function (r) { T.teamTex[r[0]] = { blue: r[0], red: n + T.teamExtra.length }; T.teamExtra.push(r[1]); });
  repl.forEach(function (f) {
    var k = -1; T.rig.sails.forEach(function (s, j) { if (j < T.nSail0 && k < 0 && s.meta && s.meta.kind === 'flag' && s.meta.flag === f.replace) k = j; });   // 先照 meta 的種類（造船規格 §9：kind=flag、flag=ensign｜pennant｜jack…）
    if (k < 0) T.rig.sails.forEach(function (s, j) { if (j < T.nSail0 && s.name === f.replace) k = j; });   // 沒有 meta 的舊匯出 ⇒ 照名字
    var s = T.rig.sails[k], tx = s && s.texture;
    if (!tx || !tx.uv) { console.warn('陣營旗：' + T.id + ' 換不了「' + f.replace + '」' + (s ? '（作品的旗沒有貼圖 uv）' : '（找不到這面旗）')); return; }
    var kd = COL_SIZE[f.kind] ? f.kind : 'ensign', uv = tx.uv, xb = { texture: Object.assign({ uv: uv, alpha_min: 0 }, flagTex(kd, 'blue')) }, xr = { texture: Object.assign({ uv: uv, alpha_min: 0 }, flagTex(kd, 'red')) };
    T.teamTex[k] = { blue: n + T.teamExtra.length, red: n + T.teamExtra.length + 1 }; T.flagTi[k] = { kind: kd, uv: uv };
    T.teamExtra.push(xb, xr);
    T.flagSlots.push({ o: xb, kind: kd, team: 'blue' }, { o: xr, kind: kd, team: 'red' });
  });
}
/** 貼圖集的那一格：陣營旗照船的陣營挑藍或紅那份（船型兩隊共用）；替換掉的作品旗也一樣。船自己掛了旗（sh.nation ⇒ flagMap）⇒ 照那一份。 */
function sailRect(ow, A, ti) {
  var T = ow.T, m = T && T.teamTex && T.teamTex[ti];
  if (m) {
    var fm = ow.flagMap || (ow.owner && ow.owner.flagMap);              // 斷開的那一團（PIECES）照原本那艘
    if (fm && fm[ti] != null && A.rect[fm[ti]]) return A.rect[fm[ti]];
    return A.rect[(ow.team || (ow.owner && ow.owner.team)) === 'red' ? m.red : m.blue];
  }
  return A.rect[ti];
}
/** 旗桿（每一格畫面；船身格座標）：桅頂那一格還在才畫。降旗旗桿照留（旗收了）。 */
function poleBuf(sh) {
  var P = sh.T.poles; if (!P || !P.length) return;
  var key = '', i;                                                       // 跟以前 map＋join 同一個字串（S11：每格不生陣列、閉包）
  for (i = 0; i < P.length; i++) key += P[i].cell < 0 || hullGp(sh.grid, P[i].cell) > 0 ? '1' : '0';
  if (sh.sink > 40) key += 'x';
  if (sh.poleKey === key) return;
  sh.poleKey = key;
  var out = [], hw = COL_POLE_W / S / 2, c = COL_POLE_C;
  P.forEach(function (p, i) {
    if (key[i] !== '1') return;
    var x = p.at[0], y = p.at[1], z0 = p.at[2], z1 = p.top;
    [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(function (d) {          // 四面（方的細桿）
      var nx = d[0], ny = d[1], ax = x + (nx ? nx * hw : -hw), ay = y + (ny ? ny * hw : hw), bx = x + (nx ? nx * hw : hw), by = y + (ny ? ny * hw : -hw);
      if (ny) { ax = x + hw * ny; bx = x - hw * ny; ay = by = y + ny * hw; }
      [[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z0], [bx, by, z1], [ax, ay, z1]].forEach(function (q) { out.push(q[0], q[1], q[2], nx, ny, 0, c[0], c[1], c[2]); });
    });
  });
  sh.poleB = upload(sh.poleB, new Float32Array(out), 9, [[0, 3, 0], [1, 3, 3], [2, 3, 6]]);
}
/** 畫旗桿（模型那一趟之後，同一支著色器、受光）：反射（畫質「高」）也畫。旗面是帆，照帆畫（11_rig_gpu.js sailBuf）。 */
function drawColours(prog, pd) {                                      // pd：哪一趟（60_rbatch.js RBAT.pd；鏡頭外的船不畫，viewVis）
  if (prog.u.uGlow) gl.uniform1f(prog.u.uGlow, 0);
  var vb = pd ? pd.b : 0;
  SHIPS.forEach(function (sh, i) {
    var b = sh.poleB; if (!b || !b.n || sh.sink > 40 || (vb && !(RBAT.cs[i] & vb))) return;
    cutSet(prog, sh); gl.uniformMatrix4fv(prog.u.uModel, false, sh.M);
    gl.bindVertexArray(b.vao); gl.drawArrays(gl.TRIANGLES, 0, b.n);
  });
}

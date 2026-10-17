// ───────────────────────── 艦長：開船（第一期） ─────────────────────────
// Tim 2026-10-17：「目前感覺敵人的行為非常固定 是否能增加一些戰術性 且自動駕駛情況下 應該套用艦長AI來操控(目前只會轉舵 實際上應該還要操帆&控制前進速度 拋錨等)」
//   「當兩舷火力差太大(一邊被打爛) 應該要嘗試轉到優勢火力測 同時嘗試迴避敵人」「目前的可以當做基礎款保留(只要加上控制船速就好)」
//   「然後還有迴避碰撞 避免遮擋友艦砲線等」「艦長指揮時可以直接改為設定期望速度 在由算法去判斷要如何調整帆&俥鐘」「有動力的船可以倒船」。
// 量到的（改之前，兩艘憲法號電腦對電腦 180 秒）：從第 30 秒起兩艘都把對方擺在右舷正橫、隔 151–153 m 一直繞圈（約 100 秒一圈），全程滿帆、沒換過舷。
//
// 分兩層：
//   ① 艦長（helmThink／helmSteer）：要哪一舷對敵、航向、期望航速 sh.wantV（m/s；Infinity ＝ 能多快就多快、'cruise' ＝ 戰鬥帆＋引擎全速、負的 ＝ 倒退）。
//   ② 航速調節（helmGovern）：照期望航速挑帆裝與俥鐘；只靠帆的船再用「放掉一點風」（sh.throttle）細調。
// 電腦的船、我艦的自動駕駛（SAIL 'auto'）共用；我艦在自動駕駛時按了 W／S（帆）或 E／T、點俥鐘（俥鐘）⇒ 那一樣交回手動（sh.sailHand／teleHand），
//   再切一次自動駕駛才收回來（71_input.js setSailMode）。
// 優先序（31_sailing.js sail）：讓友船、讓敵艦（不撞）＞ 讓開友艦的砲線 ＞ 戰列跟隨 ＞ 艦長。
// ⛔ 不抽 rnd()（艦長的判斷照局勢算）⇒ 其他亂數照舊；但船走的路不一樣了 ⇒ 同一個種子打出另一局（三組對拍的基準換新）。
// 下一期：性格與能力（難度）、搶上風、縱射、追擊、撤退；再下一期：頂風失速、拋錨戰術（拋單側錨甩尾給高級艦長）、指揮官的包夾。
var HELMS = {
  basic: { name: '基礎款', tip: '把敵艦擺在一舷正橫、守開局距離；一舷被打爛就換另一舷；火力差太多就拉開', range: 1, swap: 0.5, evade: 0.5, evadeOut: 0.65, think: 3 }
};
var HELM_BACK_V = 2, HELM_EVADE_OUT = 0.9, HELM_FAR = 1.6, HELM_EVADE_R = 1.4, HELM_VMIN = 0.8, HELM_BRG_K = 2, HELM_BACK_D = 0.45;   // 遠於 1.6 R ⇒ 全速接近；被壓制 ⇒ 距離 × 1.4；最慢 0.8 m/s（舵要有水流）；正橫差 90° ⇒ 期望航速 ± 2 m/s；近於 0.45 R 而且敵艦在船頭 ⇒ 有動力的倒退
var HELM_SAIL_T = 8, HELM_GOV_T = 1, HELM_LEAD_T = 15, HELM_TURN_E = 0.6, HELM_TURN_V = 2, HELM_TACK_E = 0.35, HELM_LEAD_MIN = 0.5;   // HELM_LEAD_T：戰列的排頭照幾秒後的距離轉（helmLead）；航向差 > HELM_TURN_E rad ⇒ 排頭全速、跟隨至少 HELM_TURN_V m/s（轉得過來）                                     // 帆裝往下收要「該收」連續 8 秒（往上加馬上）；航速調節每 1 秒想一次
/** 一門砲的火力：砲重 × 有人操作的比例 ÷ 裝填倍率（10_ship.js GUNS：mass 噸、reload）。 */
function helmGunW(g) { var G = GUNS[g.type] || {}; return (+G.mass || 1) * gunRate(g) / (+G.reload || 1); }
/** 一舷的火力（迴旋砲、砲塔 g.mt 兩舷都算）。 */
function helmPower(sh, side) { var p = 0; sh.guns.forEach(function (g) { if (g.alive && (g.mt || g.side === side)) p += helmGunW(g); }); return p; }
function helmOther(side) { return side === 'S' ? 'P' : 'S'; }
/** 大漩渦（TASK-0683；08_sea.js VX）：快沉了才逃離漩渦（Tim 2026-10-17：「可以讓電腦要沉沒時避開就好(因為我想模擬電影場景 在漩渦內戰鬥)」「應該說快沉沒時 觸發逃離漩渦邏輯」）——
 *  吃水（sh.sink：進水＋被眼拖下去的，32_hull.js；4.2 m 開始沉）到 VX_ESC（2.5 m）⇒ 航向順著水流往外斜 60°、帆照全速，開到 1.1 × rv（水流最快那一圈外）就交回艦長；
 *  吃水退回 VX_ESC_OK（1 m）才不再逃。其他時候 ⇒ null（照艦長的，在漩渦裡照常打，眼裡也照打）。
 *  ⛔ 以前照離中心多近就逃（0.65 × rv）：半徑 400 ⇒ 260 m 內一直往外，漏斗裡打不起來。優先序（31_sailing.js sail）：讓友船、讓敵艦（快撞上才出手）＞ 它 ＞ 讓開友艦的砲線。 */
var VX_ESC = 2.5, VX_ESC_OK = 1, VX_ESC_OUT = 1.1;
function vxAvoid(sh) {
  if (!VX || sh.sinkingFinal) return null;
  if (sh.sink >= VX_ESC && !sh.vxEsc) { sh.vxEsc = true; note(sh, '快撐不住了 —— 往漩渦外逃'); } else if (sh.vxEsc && sh.sink <= VX_ESC_OK) sh.vxEsc = false;
  var r = Math.hypot(sh.px, sh.pz); if (!sh.vxEsc || r >= VX_ESC_OUT * VX.rv || r < 1e-3) return null;
  var ux = sh.px / r, uz = sh.pz / r, b = 60 * Math.PI / 180;
  var dx = uz * Math.cos(b) + ux * Math.sin(b), dz = -ux * Math.cos(b) + uz * Math.sin(b);   // 切線 (z, −x)／r 往外（ux, uz）轉 b
  sh.wantV = Infinity;
  return Math.atan2(-dz, dx);                                            // fwd(yaw) ＝ (cos yaw, −sin yaw)
}
/** 艦長想一想（每 think 秒）：要哪一舷對敵、是不是被壓制。回傳 sh.hs ＝ { present, evade, t }。 */
function helmThink(sh, foe) {
  var H = HELMS[sh.helm] || HELMS.basic, st = sh.hs || (sh.hs = { present: null, evade: false, t: -1e9 });
  if (st.present && SIMT - st.t < H.think) return st;
  st.t = SIMT;
  // 哪一舷對敵：敵艦現在在哪一舷（sh.side，31_sailing.js chooseSide）就用那一舷；那一舷的火力不到另一舷的 swap ⇒ 轉另一舷過去
  //   （換過去之後敵艦就在強的那一舷 ⇒ 不會來回換；⛔ 以前要那一舷一門都開不了才換）。
  var cur = sh.side || 'S', oth = helmOther(cur), pc = helmPower(sh, cur), po = helmPower(sh, oth);
  var present = pc < H.swap * po ? oth : cur;
  if (present !== cur && st.present !== present) helmSay(sh, 'side', sideName(cur) + '火力只剩另一舷的 ' + Math.round(pc / Math.max(1e-6, po) * 100) + '% —— 轉' + sideName(present) + '對敵', true);
  st.present = present;
  // 被壓制：自己最強的那一舷 < evade × 敵艦最強的那一舷 ⇒ 拉開距離（強的那一舷照樣對著它）；回到 evadeOut 以上才回原本的距離
  var mine = Math.max(pc, po), theirs = Math.max(helmPower(foe, 'P'), helmPower(foe, 'S')), r = theirs > 0 ? mine / theirs : 9;
  var ev = st.evade ? r < H.evadeOut : r < H.evade;
  if (ev !== st.evade) helmSay(sh, 'evade', ev ? '火力只剩敵艦的 ' + Math.round(r * 100) + '%（我 ' + mine.toFixed(0) + ' 對 ' + theirs.toFixed(0) + '）—— 拉開到 ' + HELM_EVADE_R + ' 倍交戰距離' : '火力回到敵艦的 ' + Math.round(r * 100) + '% —— 回到交戰距離', true);
  st.evade = ev;
  return st;
}
/** 交戰操舵：回傳 { yaw, v }（v ＝ 期望航速 m/s）。航向照舊（敵艦在要的那一舷正橫 ＋ 距離修正，31_sailing.js 原本那一條）；
 *  期望航速（基礎款加上的）：遠了、正在換舷、被壓制又太近 ⇒ 能多快就多快；交戰中 ⇒ 跟敵艦一樣快，敵艦在正橫前面 ⇒ 快一點、落到後面 ⇒ 慢一點（守在正橫，⛔ 以前一直全速 ⇒ 兩艘繞圈）；
 *  太近（< 0.45 R）而且敵艦在船頭前方 60° 內 ⇒ 有動力的倒退（沒有動力的照最慢）。 */
function helmSteer(sh, foe) {
  var H = HELMS[sh.helm] || HELMS.basic, st = helmThink(sh, foe), sg = st.present === 'P' ? 1 : -1;   // sg：敵艦要在畫面左邊（左舷 P）⇒ +1
  var dx = foe.px - sh.px, dz = foe.pz - sh.pz, d = Math.hypot(dx, dz) || 1, R = aiRange() * H.range * (st.evade ? HELM_EVADE_R : 1);
  var yaw = (sg > 0 ? Math.atan2(-dx / d, -dz / d) : Math.atan2(dx / d, dz / d)) + sg * clamp((d - R) / R * 1.5, st.evade ? -HELM_EVADE_OUT : -0.4, 1.2);   // 遠了往敵艦切（最多 1.2 rad）、近了往外拉（最多 0.4；被壓制 ⇒ 0.9，⛔ 0.4 ⇒ 30 秒只拉開 18 m）
  var F = fwd(sh.yaw), b = Math.acos(clamp((F[0] * dx + F[2] * dz) / d, -1, 1)) * 57.2958;   // 敵艦離船頭幾度（90 ＝ 正橫）
  var cruise = sh.vCruise > 0 ? sh.vCruise : Infinity, same = Math.cos(foe.yaw - sh.yaw) > 0.5, v;   // cruise：戰鬥帆（有動力 ⇒ 再加引擎）全速（helmGovern 量的）；same：跟敵艦大致同向（60° 內）
  var m;                                                                 // m：現在的打法（決策紀錄用）
  if (d > HELM_FAR * R) { v = Infinity; m = 'approach'; }
  else if (st.present !== sh.side) { v = Infinity; m = 'swap'; }
  else if (st.evade && d < R) { v = Infinity; m = 'evade'; }
  else if (d < HELM_BACK_D * R && b < 60 && sh.cfg.base > 0 && sh.drive && sh.drive.cap > 0.05) { v = -HELM_BACK_V; m = 'back'; }   // 只有帆的船倒不了 ⇒ 照下面（⛔ 也給負的 ⇒ 收帆、放掉風、0 節停在敵艦船頭前：量過 3 對 3 的餘燼號）
  else if (same) { v = Math.max(HELM_VMIN, 0.6 * cruise, Math.max(0, foe.spd) + (90 - b) / 90 * HELM_BRG_K); m = 'abeam'; }   // 並排同向 ⇒ 守在正橫：跟敵艦一樣快、它在前面 ⇒ 快一點、落後 ⇒ 慢一點（最慢巡航的六成）
  else { v = 'cruise'; m = 'cruise'; }                                                     // 反向、繞圈 ⇒ 巡航：戰鬥帆＋引擎全速（⛔ 也照正橫調 ⇒ 兩艘都看到對方稍微落後、一起慢下來：量過 180 秒掉到 1.9 節、帆收到「收帆」；
                                                                         //   ⛔ 給巡航的航速數字 ⇒ 那是上一次照當時航向量的，轉了向就對不上 ⇒ 帆裝在戰鬥帆與滿帆之間來回換）
  if (m !== sh.hMode && SIMT - (sh.hModeT || -1e9) >= HELM_MODE_T) {   // 打法換了（至少隔 HELM_MODE_T 秒才記下一筆 ⇒ 邊界上抖不洗版）
    sh.hMode = m; sh.hModeT = SIMT;
    helmSay(sh, 'mode', HELM_MODE[m] + '：' + (m === 'approach' ? '距離 ' + d.toFixed(0) + ' m，遠於 ' + HELM_FAR + ' 倍交戰距離 ' + R.toFixed(0) + ' m —— 全速接近'
      : m === 'swap' ? '敵艦在' + sideName(sh.side) + '、要用' + sideName(st.present) + ' —— 全速轉過去'
      : m === 'evade' ? '被壓制、距離 ' + d.toFixed(0) + ' m 近於 ' + R.toFixed(0) + ' m —— 全速拉開'
      : m === 'back' ? '距離 ' + d.toFixed(0) + ' m、敵艦在船頭 ' + b.toFixed(0) + '° —— 倒退 ' + HELM_BACK_V + ' m/s'
      : m === 'abeam' ? '跟敵艦同向並行、敵艦離船頭 ' + b.toFixed(0) + '° —— 調航速守在正橫'
      : '跟敵艦反向或繞圈 —— 戰鬥帆巡航'), false);
  }
  return { yaw: yaw, v: v };
}
var HELM_MODE = { approach: '接近', swap: '換舷', evade: '拉開', back: '倒退', abeam: '守正橫', cruise: '巡航', lead: '戰列排頭', line: '戰列跟隨', gauge: '搶上風' }, HELM_MODE_T = 4;
/** 指揮官的命令改了打法（排頭、跟隨、搶上風）⇒ 記一筆（跟 helmSteer 的打法同一格 sh.hMode、同一個間隔）。 */
function helmMode(sh, m, text) { if (m !== sh.hMode && SIMT - (sh.hModeT || -1e9) >= HELM_MODE_T) { sh.hMode = m; sh.hModeT = SIMT; helmSay(sh, 'mode', HELM_MODE[m] + '：' + text, false); } }
/** 戰列的排頭（TASK-0679；指揮官 mode 'lead'，53_commander.js cmdLine）：照「整條戰列」開 ——
 *  敵方還在打的船的中心（近了 ⇒ 最近的那艘敵艦）擺在交戰那一舷（od.side）正橫、距離 ＝ 交戰距離（aiRange；照 HELM_LEAD_T 秒後的距離）；
 *  航向照 helmSteer 那一條（遠了往敵方切、近了往外拉），但不換舷、不拉開、不倒退；
 *  期望航速 ＝ 巡航（戰鬥帆＋引擎）× od.pace（隊形還沒排好 ⇒ 0.7 等後面的；⛔ 全速 ⇒ 後面的跟一樣快的船永遠追不上）。 */
function helmLead(sh, od) {
  var L = SHIPS.filter(function (o) { return isFoe(sh, o) && !isOut(o); }); if (!L.length) return null;
  var cx = 0, cz = 0, vx = 0, vz = 0; L.forEach(function (o) { cx += o.px; cz += o.pz; vx += o.vel[0]; vz += o.vel[2]; }); cx /= L.length; cz /= L.length; vx /= L.length; vz /= L.length;
  // 近了（離敵方中心 < 2 × 交戰距離）改照最近的那艘敵艦：⛔ 一直照中心 ⇒ 敵方中心在它排頭後面 135 m，兩個排頭各自把「對方中心」擺在 210 m、自己卻並排在對方排頭旁邊 59 m（量過）
  var nb = null, nd = 1e18; L.forEach(function (o) { var q = Math.hypot(o.px - sh.px, o.pz - sh.pz); if (q < nd) { nd = q; nb = o; } });
  if (Math.hypot(cx - sh.px, cz - sh.pz) < 2 * aiRange() && nb) { cx = nb.px; cz = nb.pz; vx = nb.vel[0]; vz = nb.vel[2]; }
  var n = SHIPS.filter(function (o) { return ORDERS[o.i] && ORDERS[o.i].mode === 'line' && o.team === sh.team && !isOut(o); }).length;
  var sg = od.side === 'P' ? 1 : -1, dx = cx - sh.px, dz = cz - sh.pz, d = Math.hypot(dx, dz) || 1, R = aiRange();
  var px = dx + (vx - sh.vel[0]) * HELM_LEAD_T, pz = dz + (vz - sh.vel[2]) * HELM_LEAD_T, dp = Math.min(d, Math.hypot(px, pz));   // HELM_LEAD_T 秒後會多近（兩條戰列對著開 ⇒ 早一點轉）
  // 遠了往敵方切（最多 1.0 rad）、近了往外拉（最多 0.9）。⛔ 照 helmSteer 的 −0.4／照現在的距離 ⇒ 兩條戰列對著開、一起轉到同向時已經只隔 20 m，兩條穿插在一起並排走（量過 180 秒：兩個排頭隔 20 m、同航向）
  var yaw = (sg > 0 ? Math.atan2(-dx / d, -dz / d) : Math.atan2(dx / d, dz / d)) + sg * clamp((dp - R) / R * 1.5, -0.9, 1.0);
  if (!sh.noGoTack && n) {                                               // 第一次要搶風：往離自己的隊伍遠的那一舷搶（⛔ 往隊伍那一側 ⇒ 開局橫隊時排頭橫切過旁邊幾艘的船頭，讓船讓到 4000 步、0.2 節：量過風從船頭來的開局）
    var mx = 0, mz = 0, W0 = norm(WIND); SHIPS.forEach(function (o) { var q = ORDERS[o.i]; if (q && q.mode === 'line' && q.head === sh.i && !isOut(o)) { mx += o.px - sh.px; mz += o.pz - sh.pz; } });
    sh.noGoPref = (mx * -W0[2] + mz * W0[0]) > 0 ? -1 : 1;                  // 隊伍在風軸的哪一側（＋ ＝ 風吹去的方向往左轉 90°）⇒ 往另一側
  }
  yaw = helmNoGo(sh, yaw);
  var cruise = sh.vCruise > 0 ? sh.vCruise : Infinity, v = cruise === Infinity ? Infinity : Math.max(HELM_VMIN, cruise * (od.pace || 1));
  // 等最慢的那艘：跟著自己的（排頭的航跡）裡最慢的滿帆航速 × 0.9；慢到不到自己一半的（帆被打爛）不等，讓它脫隊（⛔ 不等 ⇒ 帆被打掉兩成的隊尾 4.6 節、整條 7.7 節，越拉越遠到 150 m：量過）
  //   每艘的滿帆航速換成「在排頭這個航向」的（照帆速曲線的比例；⛔ 照它自己現在的航向 ⇒ 跟隨的正在頂風轉向、滿帆也只有 1 m/s，排頭跟著等到 0.2 節，整條停住：量過風從船頭來的開局）
  var my = helmPolarAt(sh, sh.yaw), slow = Infinity;
  SHIPS.forEach(function (o) {
    var q = ORDERS[o.i]; if (!(q && q.mode === 'line' && q.head === sh.i && !isOut(o) && o.vFull > 0)) return;
    var vo = o.vFull / Math.max(0.05, helmPolarAt(o, o.yaw)) * my;
    if (!(sh.vFull > 0 && vo < 0.5 * sh.vFull)) slow = Math.min(slow, vo);
  });
  if (slow < Infinity) v = Math.max(HELM_VMIN, Math.min(v, 0.9 * slow));
  if (sh.vFull > 0 && v !== Infinity) v = Math.max(v, HELM_LEAD_MIN * sh.vFull);   // 最慢 ＝ 自己滿帆的一半：⛔ 等到 0.2 節 ⇒ 航跡拉不出來、後面的擠在排頭旁邊互相讓（隊尾讓了 1 萬步），越等越排不起來（量過風從船頭來的開局）
  if (Math.abs(Math.atan2(Math.sin(yaw - sh.yaw), Math.cos(yaw - sh.yaw))) > HELM_TURN_E) v = Infinity;   // 要大轉向 ⇒ 全速（舵靠水流；⛔ 照巡航 × pace ⇒ 頂風時巡航只剩 1.3 m/s、再打七折 ⇒ 0.3 節轉不過來，整條戰列停在那裡：量過風從船頭來的開局）
  sh.leadDbg = { d: Math.round(d), dp: Math.round(dp), R: R, yaw: +yaw.toFixed(2) };   // 讀數（__game.ships()[i].leadDbg）
  helmMode(sh, 'lead', '帶 ' + n + ' 艘排成縱隊，敵方中心擺在' + sideName(od.side) + '、距離 ' + d.toFixed(0) + ' m（要 ' + R.toFixed(0) + ' m）；巡航的 ' + Math.round((od.pace || 1) * 100) + '%' + (od.pace < CMD_PACE ? '（隊形還沒排好，等後面的）' : ''));
  return { yaw: yaw, v: v };
}
/** 排頭要讓的友船（TASK-0679）：自己隊伍裡跟著的只在 40 m 內才讓（讓路是跟隨的事：它們照航跡、會讓排頭）。
 *  ⛔ 每艘都讓 ⇒ 開局橫隊、排頭在中間，往哪一舷搶風都橫切過旁邊那艘的船頭 ⇒ 排頭 30–80 秒一直在讓、48 秒起 0.1 節停住（量過風從船頭來的開局）。 */
function helmLeadAvoid(sh) { return friendsOf(sh).filter(function (o) { var q = ORDERS[o.i]; return !(q && q.mode === 'line' && q.head === sh.i) || Math.hypot(o.px - sh.px, o.pz - sh.pz) < 40; }); }
/** 戰列跟隨（TASK-0679；mode 'line'）：照排頭的航跡、第 od.slot 個間距（53_commander.js cmdHelmWake）；離站位多遠、沿航跡落後多少記在 sh.lineErr／lineLag（指揮官下一次想的時候讀：排好了沒、排頭要不要等）。 */
function helmFollow(sh, ld, od) {
  var hd = od && od.head !== undefined && SHIPS[od.head] && !SHIPS[od.head].sunk ? SHIPS[od.head] : ld, gap = hd === ld ? CMD_LINE_GAP : (od.slot || 1) * CMD_LINE_GAP;   // 照排頭的航跡、第 slot 個間距（排頭沉了 ⇒ 照前一艘）
  var r = cmdHelmWake({ x: sh.px, z: sh.pz, yaw: sh.yaw }, { x: hd.px, z: hd.pz, yaw: hd.yaw, spd: hd.spd }, hd.wake, gap);
  if (r.v !== Infinity && Math.abs(Math.atan2(Math.sin(r.yaw - sh.yaw), Math.cos(r.yaw - sh.yaw))) > HELM_TURN_E) r.v = Math.max(r.v, HELM_TURN_V);   // 要大轉向 ⇒ 至少 HELM_TURN_V（舵要有水流）
  sh.lineErr = r.err; sh.lineLag = r.lag; sh.lineOff = r.off; sh.lineArc = od && od.head !== undefined && hd === SHIPS[od.head] ? r.lag + gap : null;   // 沿排頭航跡離排頭多遠（指揮官照它重排前後；排頭沉了、改跟前一艘 ⇒ 沒有） sh.station = r.station;
  helmMode(sh, 'line', '跟著 ' + ld.name + '（排頭 ' + hd.name + ' 的航跡、第 ' + Math.round(gap / CMD_LINE_GAP) + ' 個間距 ' + gap + ' m）；' + (r.lag > 0 ? '落後站位 ' + r.lag.toFixed(0) + ' m' : '超前 ' + (-r.lag).toFixed(0) + ' m') + '、離航跡 ' + r.off.toFixed(0) + ' m');
  return r;
}
/** 搶風的角度（TASK-0679）：船頭跟「風吹去的方向」夾幾度時往上風走得最快（polar × 往上風的分量），照這艘的逆風性能（cfg.upwind）壓縮過的角度算；
 *  只找到風從船頭 60° 為止（夾角 ≤ 120°）：⛔ 電腦現在不吃頂風失速（31_sailing.js nogo 只算手動）⇒ 帆速曲線在正頂風還有 0.25，再找下去會挑正頂風直衝，那不像帆船。快取在 sh.beatDeg。 */
function helmBeat(sh) {
  var UP = sh.cfg.upwind || 1; if (sh.beatDeg && sh.beatUp === UP) return sh.beatDeg;
  var best = 90, bv = -1;
  for (var deg = 90; deg <= 180 - NOGO_DEG; deg += 0.5) { var dU = UP === 1 ? deg : 90 + (deg - 90) / UP, v = polar(dU) * -Math.cos(deg / 57.2958); if (v > bv) { bv = v; best = deg; } }
  sh.beatUp = UP; return (sh.beatDeg = best);
}
/** 這艘船朝 yaw 時帆速曲線的係數（照它的逆風性能壓縮過的角度；＝ 31_sailing.js sail 的 polarPlay(dU)：娛樂玩法有下限）。 */
function helmPolarAt(o, yaw) { var W = norm(WIND), F = fwd(yaw), UP = o.cfg.upwind || 1, deg = Math.acos(clamp(F[0] * W[0] + F[2] * W[2], -1, 1)) * 57.2958; return polarPlay(UP === 1 || deg <= 90 ? deg : 90 + (deg - 90) / UP); }
/** 航向落在風從船頭 NOGO_DEG（60°）以內 ⇒ 換成近的那一側的搶風航向（helmBeat）。戰列的排頭用（TASK-0679）：
 *  ⛔ 直接對著敵方開 ⇒ 敵方在上風時排頭正頂風（電腦不吃頂風失速、帆速曲線剩 0.25）2.3–2.7 節走 90 秒，後面整條跟著爬（量過風從船頭來的開局）。 */
function helmNoGo(sh, yaw) {
  var W = norm(WIND), F = fwd(yaw), deg = Math.acos(clamp(F[0] * W[0] + F[2] * W[2], -1, 1)) * 57.2958; if (deg <= 180 - NOGO_DEG) { sh.noGoTack = 0; return yaw; }
  var up = Math.atan2(W[2], -W[0]), a = Math.PI - helmBeat(sh) / 57.2958, e = Math.atan2(Math.sin(yaw - up), Math.cos(yaw - up));   // up：正頂風的航向（fwd ＝ −W）
  // 換舷搶風要越過正頂風 HELM_TACK_E 以上才換（⛔ 不留 ⇒ 要的航向在正頂風兩邊晃、排頭一直換舷，掉頭的那一段穿過後面跟上來的船，讓船讓到 3000–4500 步：量過）
  var t = sh.noGoTack || sh.noGoPref || (e >= 0 ? 1 : -1); if (t * e < -HELM_TACK_E - (sh.noGoTack ? 0 : 0.6)) t = -t; sh.noGoTack = t;   // 第一次照偏好的那一舷（要的航向在另一側 0.95 rad 以上才不照）
  return up + t * a;
}
/** 避開頂風（Tim 2026-10-17「可以讓船嘗試轉向避免頂風」「可以參考現實情況如何處置嗎」）：電腦每一艘要的航向（交戰、戰列、搶上風；讓船不算）最後過這一關 ——
 *  · 要的航向落在風從船頭 NOGO_DEG（60°）以內 ⇒ 改成近的那一側的邊（照船現在在正頂風的哪一側；要的在另一側超過 HELM_TACK_E 才換舷）。
 *  · 要轉過正頂風（換舷搶風，tack）但航速不到 HELM_TACK_V ⇒ 改往下風那一邊繞（順風換舷，wear）：現實裡帆船要帶著速度才轉得過頂風，
 *    速度不夠會卡在頂風（missing stays），老水手寧可順風繞一圈。繞過正後方之後要的航向就不再隔著頂風 ⇒ 照常。
 *  ⛔ 不管 ⇒ 戰列的排頭讓船讓進離頂風 46°、視風吃不到（31_drive.js sailWindK）⇒ 6 秒剎到 0.2 節，再加速回來要兩分鐘（量過風從船頭來的開局）。 */
var HELM_TACK_V = 1.5;                                                  // m/s（約 3 節）：低於這個航速不搶風換舷
function helmIrons(sh, yaw) {
  var W = norm(WIND), up = Math.atan2(W[2], -W[0]), a = NOGO_DEG / 57.2958;   // up：正頂風的航向（fwd ＝ −W）
  var e = Math.atan2(Math.sin(yaw - up), Math.cos(yaw - up)), c = Math.atan2(Math.sin(sh.yaw - up), Math.cos(sh.yaw - up));   // 要的、現在的：離正頂風幾 rad（正 ＝ yaw 大的那一側）
  if (Math.abs(e) < a) { var t = c >= 0 ? 1 : -1; if (t * e < -HELM_TACK_E) t = -t; e = t * a; yaw = up + e; }
  if (c * e < 0 && Math.abs(e - c) < Math.PI && Math.abs(sh.spd) < HELM_TACK_V) {   // 短的那條路穿過正頂風、速度不夠 ⇒ 往下風轉（離開正頂風那一邊）
    if (!sh.wearing) { sh.wearing = true; helmSay(sh, 'wear', '航速 ' + (sh.spd * 1.944).toFixed(1) + ' 節，轉不過頂風 ⇒ 順風繞過去', false); }
    return sh.yaw + (c >= 0 ? 1 : -1) * 1.0;
  }
  sh.wearing = false;
  return yaw;
}
/** 搶上風（mode 'gauge'）：迎風、往 od.tack 那一側偏 helmBeat 的角度；能多快就多快。 */
function helmGauge(sh, od) {
  var W = norm(WIND), a = Math.PI - helmBeat(sh) / 57.2958, ux = -W[0], uz = -W[2], nx = -W[2], nz = W[0], t = od.tack || 1;   // u：往上風；n：風吹去的方向往左轉 90°（＝ 53_commander.js cmdGauge 的 lat 那一側）
  var hx = ux * Math.cos(a) + nx * t * Math.sin(a), hz = uz * Math.cos(a) + nz * t * Math.sin(a);
  helmMode(sh, 'gauge', '迎風（風從船頭 ' + Math.round(180 - helmBeat(sh)) + '°）往' + (t > 0 ? '左' : '右') + '搶');
  return { yaw: Math.atan2(-hz, hx), v: Infinity };
}
/** 艦長的一個決定：記進戰鬥報表（79_report.js rptHelm：時間、種類、理由）；big ⇒ 也上方廣播（換舷、拉開）。 */
function helmSay(sh, kind, text, big) { if (big) note(sh, '艦長：' + text); rptHelm(sh, kind, text); }
/** 這一段帆（k）還能出多少（0..1，照面積 × 血量，跟 sailFrac 同一個分母）。 */
function helmSetFrac(sh, k) { var a = 0; sh.sails.forEach(function (s) { if (!s.flag && !s.dead && setHas(s, k)) a += s.area * s.hp / s.hpMax; }); return a / sh.sailArea0; }
/** 航速調節（31_sailing.js sail 每一步、算完 vS／vB 之後）：期望航速 sh.wantV ⇒ 帆裝、俥鐘、放掉一點風（sh.helmSpill，下一步乘進 sh.throttle）。
 *  vS：帆在這個航向全部張著、完好時的航速（已經扣掉進水、降旗；不含放慢）；vB：額外動力全速的航速（0 ＝ 沒有）。
 *  每一段帆只靠帆的航速 ≈ vS × 那一段還能出的比例（driveStep：帆推力 k·(vS·frac)²）；帆與引擎一起 ≈ √(帆² ＋ (vB × 俥鐘)²)。
 *  挑法：要的比全帆全速還快 ⇒ 滿帆、全速；有引擎 ⇒ 帆用到「不超過要的」那一段、差的由俥鐘補（倒退 ⇒ 帆全收、俥鐘往後）；只有帆 ⇒ 夠用的最小那一段、再放掉一點風。
 *  帆往上加馬上、往下收要該收連續 HELM_SAIL_T 秒（不來回換）。我艦手動接過去的那一樣不動。 */
function helmGovern(sh, vS, vB) {
  var want = sh.wantV; if (want === null || want === undefined) { sh.helmSpill = 1; return; }
  var me = sh.i === PLAYER_I, useS = hasSails(sh) && !(me && sh.sailHand), useE = vB > 0 && sh.cfg.base > 0 && !(me && sh.teleHand);
  if (SIMT - (sh.govT || -1e9) < HELM_GOV_T) return;
  sh.govT = SIMT;
  var vk = [0, 1, 2, 3].map(function (k) { return vS * helmSetFrac(sh, k); }), k = sh.sailSet, p = sh.power || 0, spill = 1;
  sh.vCruise = Math.hypot(hasSails(sh) ? vk[2] : 0, vB);
  sh.vFull = Math.hypot(hasSails(sh) ? vk[3] : 0, vB);                    // 這個航向能多快（滿帆＋引擎全速；戰列的排頭照最慢的那艘調，helmLead）                 // 巡航：戰鬥帆＋引擎全速（helmSteer 交戰時用；沒有帆 ⇒ 引擎全速）
  if (want === 'cruise') { if (useS) k = 2; p = 1; }                     // 巡航（helmSteer）：戰鬥帆＋引擎全速
  else if (want < 0) { if (useE) { k = useS ? 0 : k; p = want / vB; } else { k = useS ? 1 : k; spill = 0.3; } }
  else if (want >= Math.hypot(vk[3], useE ? vB : 0) * 0.98) { k = 3; p = 1; }
  else if (useE) {
    if (useS) { k = 0; for (var i = 3; i >= 0; i--) if (vk[i] <= want) { k = i; break; } }
    var vs = useS ? vk[k] : vk[sh.sailSet];
    p = vs >= want ? 0 : Math.sqrt(want * want - vs * vs) / vB;
  } else if (useS) {
    k = 3; for (i = 1; i <= 3; i++) if (vk[i] >= want) { k = i; break; }
    spill = vk[k] > 0 ? clamp(want / vk[k], 0.3, 1) : 1;
  }
  if (useS && k !== sh.sailSet) {
    if (k > sh.sailSet) sh.govLow = null;
    else if (sh.govLow === null || sh.govLow === undefined) { sh.govLow = SIMT; k = sh.sailSet; }
    else if (SIMT - sh.govLow < HELM_SAIL_T) k = sh.sailSet;
    if (k !== sh.sailSet) { helmSay(sh, 'sail', '帆裝 ' + SAILSETS[sh.sailSet] + ' → ' + SAILSETS[k] + '（' + helmWantText(want) + '）', false); sh.govLow = null; if (me) setSails(sh, k); else { sh.sailSet = k; applySailSet(sh); } }
  } else sh.govLow = null;
  if (useE) {
    var best = sh.tele, bd = 1e9; TELE.forEach(function (t, j) { var dd = Math.abs(t - clamp(p, -1, 1)); if (dd < bd - 1e-9) { bd = dd; best = j; } });   // 最接近的那一格
    if (best !== sh.tele) helmSay(sh, 'tele', '俥鐘 ' + TELE_NAME[sh.tele] + ' → ' + TELE_NAME[best] + '（' + helmWantText(want) + '）', false);
    if (best !== sh.tele) { if (me) { var hand = sh.teleHand; teleSet(sh, best); sh.teleHand = hand; } else { sh.tele = best; sh.power = TELE[best]; } }
  }
  sh.helmSpill = useS || !useE ? spill : 1;
}
function helmWantText(w) { return w === 'cruise' ? '巡航：戰鬥帆＋引擎全速' : w === Infinity ? '要全速' : w < 0 ? '要倒退 ' + (-w).toFixed(1) + ' m/s' : '要 ' + (w * 1.944).toFixed(1) + ' 節'; }
/** 讓敵艦（不撞）：跟讓友船同一套（52_fleet.js friendAvoid），對象換成還在的敵艦。 */
function foeAvoid(sh) { var L = SHIPS.filter(function (o) { return isFoe(sh, o) && !o.sunk && !o.sinkingFinal; }); return L.length ? friendAvoid(sh, L) : null; }

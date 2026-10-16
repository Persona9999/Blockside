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
var HELM_SAIL_T = 8, HELM_GOV_T = 1;                                     // 帆裝往下收要「該收」連續 8 秒（往上加馬上）；航速調節每 1 秒想一次
/** 一門砲的火力：砲重 × 有人操作的比例 ÷ 裝填倍率（10_ship.js GUNS：mass 噸、reload）。 */
function helmGunW(g) { var G = GUNS[g.type] || {}; return (+G.mass || 1) * gunRate(g) / (+G.reload || 1); }
/** 一舷的火力（迴旋砲、砲塔 g.mt 兩舷都算）。 */
function helmPower(sh, side) { var p = 0; sh.guns.forEach(function (g) { if (g.alive && (g.mt || g.side === side)) p += helmGunW(g); }); return p; }
function helmOther(side) { return side === 'S' ? 'P' : 'S'; }
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
var HELM_MODE = { approach: '接近', swap: '換舷', evade: '拉開', back: '倒退', abeam: '守正橫', cruise: '巡航' }, HELM_MODE_T = 4;
/** 艦長的一個決定：記進戰鬥報表（79_report.js rptHelm：時間、種類、理由）；big ⇒ 也上方廣播（換舷、拉開）。 */
function helmSay(sh, kind, text, big) { if (big) note(sh, '艦長：' + text); if (typeof rptHelm === 'function') rptHelm(sh, kind, text); }
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
  sh.vCruise = Math.hypot(hasSails(sh) ? vk[2] : 0, vB);                 // 巡航：戰鬥帆＋引擎全速（helmSteer 交戰時用；沒有帆 ⇒ 引擎全速）
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

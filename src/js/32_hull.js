// ───────────────────────── 進水、傾斜、沉沒、減重上浮 ─────────────────────────
// 減重上浮（Tim 2026-10-12：打爛的船變輕、浮起來 ⇒ 彈藥庫有機會露出水面被打到）：
//   船的重量 ＝ 格（每格照材質：橡木 0.7 kg，鐵甲 7.8 kg…；05_material.js）＋ 砲（砲種表：24 磅長砲 2.5 噸、32 磅長砲 2.9、carronade 0.9、追擊砲 2.1，乘船隻設定「砲的重量」）＋ 火藥桶（50 kg）
//   ＋ 壓艙物（細節設定；不會被打掉的重量：壓艙鐵與石、水、糧、彈丸…）。
//   浮在哪 ＝ 排水剛好等於重量的那一層（HYD：原本船殼每一層的體積，每個 x 照最外兩格之間的寬，從設計水線往下、往上積）：
//   設計水線（ZW）以下 ＝ 2,156 噸（史料約 2,200）⇒ 比它輕就浮高、重就吃水深。預設壓艙物 1,075 噸 ⇒ 開戰時剛好在設計水線；
//   壓艙物調輕 ⇒ 一開始就浮得高（0 噸 ⇒ 約 1.9 m，彈藥庫頂離水面不到半公尺）；砲調重 ⇒ 吃水深、砲被打飛浮得多。
//   打掉的格（含跟著斷開的一團走的）、不在船上的模型（飛掉、炸掉）⇒ 少掉那些重量 ⇒ 慢慢浮上去（每半秒量一次、3 秒浮到；開戰那一刻直接放好）。
//   打掉 10 萬格 ＝ 70 噸 ⇒ 浮 0.12 m。量過：預設浮 0.04–0.2 m、照樣會沉；壓艙物 0 ⇒ 浮 2.0–2.25 m、洞都離水、420 秒沒沉，彈藥庫也沒被打到（電腦瞄水線上 2.7 m）。
//   進水跟著浮起來的水線算（Tim）：洞浮出水面就不進水。開始沉的門檻照舊只看進水（sh.sink）。斷成兩截、開始沉之後不再往上浮。
//   ⛔ 先做過放大倍率（Tim：不用到 4 倍）：16 倍 ⇒ 打得最爛的船整艘浮到 6.3 m；4 倍 ⇒ 浮 0.5–0.9 m —— 兩種都讓水線附近的洞全部離水，三種子 420 秒沒有一艘沉（不浮 240–350 秒沉）。
//     又做過「總重固定、壓艙物只改每格多重」：拉桿幾乎沒感覺，而且壓艙物少了船卻沒浮高 —— 不像壓艙物。
var VOX_T = 0.0007, KEG_T = 0.05, RHO_W = 1.025, LIFT_TAU = 3;   // 砲的重量在砲種表（GUNS，10_ship.js）
/** 船型 T 的浮力表：T.hyd[z] ＝ 原本船殼 z 層到設計水線（T.zw）之間的體積（m³；水線上的層 ⇒ 負的），z ＝ 0 … zw＋hydTop（預設 60 ＝ 水線上 6 m；開始沉的線高過 4.2 m 的船照它加高，sinkLineT：粒子模式的進水要算到下沉 4.2 m 以上，33_flood.js）；T.disp ＝ 設計水線的排水量（噸）。載入時算一次。 */
function hydrostatics(T) {
  var BASE = T.base, ZW = T.zw, sx = BASE.sx, top = Math.min(BASE.sz, ZW + (T.hydTop || 60)), lo = new Int16Array(sx * top).fill(-1), hi = new Int16Array(sx * top), A = new Float64Array(top), z;
  BASE.each(function (x, y, z) { if (z >= top) return; var k = z * sx + x; if (lo[k] < 0 || y < lo[k]) lo[k] = y; if (y > hi[k]) hi[k] = y; });
  for (z = 0; z < top; z++) { var a = 0; for (var x = 0; x < sx; x++) { var k = z * sx + x; if (lo[k] >= 0) a += hi[k] - lo[k] + 1; } A[z] = a * S * S * S; }   // 那一層的體積
  var HYD = T.hyd = new Float32Array(top + 1);
  for (z = ZW - 1; z >= 0; z--) HYD[z] = HYD[z + 1] + A[z];
  for (z = ZW + 1; z <= top; z++) HYD[z] = HYD[z - 1] - A[z - 1];
  T.disp = HYD[0] * RHO_W;                                                        // 設計水線的排水量（噸）
}
function modelT(m, gunw) { return m.kind === 'powder' ? KEG_T : (GUNS[m.kind] ? GUNS[m.kind].mass : 0) * gunw; }   // 模型的重量（砲乘船隻設定的倍率）
/** 載重（Tim 2026-10-26「為了遊戲性 希望每艘船都有一個合適的載重(在載重範圍內都是替換壓艙物)」「戰艦可以參考史實 載重較低(因為裝了很多重砲)」「固定壓艙＋可換壓艙(ok」）：
 *  設計水線的壓艙物 ballast0 分兩份 —— 可換壓艙（壓艙石：裝貨就搬掉同樣重的，吃水不變）T.cargoT ＋ 固定壓艙（鐵塊，一直在）ballast0 − cargoT。
 *  要的載重 ＝ ships[].cargoT（明寫）｜設計水線排水量 × CFG.cargo[role]（role 沒寫 ⇒ war）；比 ballast0 多 ⇒ 只給到 ballast0、差多少記在 T.cargoShort（admin.py disp 列補法）。
 *  標準排水量 ＝ 設計水線 − cargoT（沒有貨、壓艙石也卸掉）；滿載排水量 ＝ 設計水線（載重裝滿）。開戰照舊浮在設計水線（壓艙物照 ballast0 ＝ 固定＋可換）。 */
function cargoOf(T, info) {
  var K = CFG.cargo || {}, role = info && info.role === 'merchant' ? 'merchant' : 'war', want = info && info.cargoT !== undefined ? +info.cargoT : T.disp * (+K[role] || 0);
  T.role = role; T.cargoWant = Math.max(0, Math.round(want)); T.cargoT = Math.min(T.ballast0, T.cargoWant); T.cargoShort = Math.max(0, T.cargoWant - T.ballast0);
  var L = T.light0 || 0;                                                // 空船（格＋模型；05_hull.js）比設計水線重 ⇒ 沒有壓艙物、標準／滿載都是空船那麼重
  T.dispStd = Math.round(Math.max(L, T.disp - T.cargoT)); T.dispFull = Math.round(Math.max(L, T.disp));
}
/** 開戰時的重量（噸）：格 ＋ 模型 ＋ 壓艙物。砲帶的裝甲（24_armor.js）也是格：sh.orig 只算船殼 ⇒ 加 sh.armN0（有材質層 ⇒ T.voxT0 本來就含）。 */
function shipT(sh) { var t = (sh.T.matPlain ? (sh.arm ? sh.orig + sh.armN0 : sh.orig) * VOX_T : sh.T.voxT0) + sh.cfg.ballast; sh.models.forEach(function (m) { t += modelT(m, sh.cfg.gunw); }); return t; }
/** 還沒開戰就算得出來的開戰時重量（船隻配置頁；Tim 2026-10-17「額外顯示實際遊戲開場的排水量(加上炮重&其他配件重)」）：跟 shipT 同一套，照船型 T 與設定 c ⇒
 *  { vox 格（砲帶的裝甲也算）, gun 砲（× 砲的重量）, keg 火藥桶（作品裡的＋甲板取用點每一處三桶，照配置頁擺的）, ballast 壓艙物, all 合計 }（噸）。 */
function hullT0(T, c) {
  var o = { vox: T.matPlain ? (T.hullG.count + (T.armor || []).reduce(function (s, A) { return s + A.n; }, 0)) * VOX_T : T.voxT0, gun: 0, keg: 0, ballast: +c.ballast || 0 };
  (T.rig.models || []).forEach(function (m) { var k = modelKind(m); if (k === 'powder') o.keg += KEG_T; else o.gun += modelT({ kind: k }, c.gunw); });
  var pw = Object.keys(FURN).filter(function (k) { return FURN[k].role === 'powder'; })[0];
  hullDeckKit(T).decks.forEach(function (D) { deckItems(T, D, deckPlan(T.id, D.id)).items.forEach(function (it) { if (it.it === pw) o.keg += 3 * KEG_T; }); });
  o.all = o.vox + o.gun + o.keg + o.ballast;
  return o;
}
/** 少掉的重量（噸）：格（被打掉、跟著斷開的一團走）＋ 不在船上的模型（飛掉、炸掉、跟著斷開的一團走）。帆桁不算。 */
function massLost(sh) {
  var t = voxLostT(sh);                                                   // 每格照材質（05_material.js；全是預設比重 0.7 ⇒ 少幾格 × VOX_T）
  sh.models.forEach(function (m) { if (!m.alive || m.moved) t += modelT(m, sh.cfg.gunw); });
  return t;
}
/** 船型 T 比設計水線的排水輕 t 噸（負 ＝ 重）⇒ 浮高幾公尺（負 ＝ 吃水深）；還沒有船型 ⇒ null。 */
function liftFor(T, t) {
  if (!T || !T.hyd) return null;
  var HYD = T.hyd, ZW = T.zw, dv = t / RHO_W, n = HYD.length - 1, z;
  if (dv >= HYD[0]) return ZW * S;
  for (z = 0; z < n; z++) if (HYD[z + 1] <= dv) return (ZW - z - (HYD[z] - dv) / (HYD[z] - HYD[z + 1])) * S;
  return (ZW - n) * S;
}
/** 浮高 L 公尺（負 ＝ 吃水深）時比設計水線的排水輕幾噸（liftFor 的反函數；TASK-0669 從 61_hud.js 搬來：31_drive.js 也用）。 */
function tonsAt(T, L) {
  var HYD = T.hyd, n = HYD.length - 1, z = T.zw - L / S;
  if (z <= 0) return HYD[0] * RHO_W; if (z >= n) return HYD[n] * RHO_W;
  var i = Math.floor(z); return (HYD[i] + (HYD[i + 1] - HYD[i]) * (z - i)) * RHO_W;
}
/** 這型船開始沉的線（下沉幾 m）：頂層甲板泡水（Tim 2026-10-23「目前很常遇到上層炮甲板還能開炮就判定下沉」「用頂層甲板算可以嗎」）——
 *  蓋過船中央（水線長的中點）的甲板裡最高那一層，在船中央的地板離設計水線多高（甲板 meta，35_decks.js；艏樓、艉樓沒蓋到船中央 ⇒ 不算）；
 *  不低於 SINK_FINAL（4.2 m，以前每艘都是它，量過剛好是憲法號的上甲板；⛔ 照甲板就好 ⇒ 鐵甲艦頂層甲板只高 0.5 m，會比以前早沉）。沒有甲板 meta ⇒ SINK_FINAL。
 *  量過（設計水線上、船中央）：tridente 8.0、松島號 7.6（船首樓）、ember 6.6、tidegrave 6.4、napoleon 5.9、nightlamp 5.8 m；其他 15 艘 ≤ 4.2 ⇒ 照舊。
 *  跟著它的：浮力表的高度（hydTop）、進水格子的高度（33_flood.js flSkin）、沉沒的線（sinkGoneAt）、進水 %（61_hud.js floodPct）。 */
function sinkLineT(T) {
  if (T.sinkLine !== undefined) return T.sinkLine;
  if (!isFinite(T.wl0) || !isFinite(T.wl1) || !T.h) return SINK_FINAL;     // 水線還沒量（waterline）⇒ 先照舊、不記
  var xm = (T.wl0 + T.wl1) / 2, top = null;
  hullDecks(T).forEach(function (d) { var f = deckFloor(d, xm); if (f !== null && (top === null || f > top)) top = f; });
  T.topDeck = top === null ? null : +((top - T.zw) * S).toFixed(2);
  return T.sinkLine = T.topDeck === null ? SINK_FINAL : Math.max(SINK_FINAL, T.topDeck);
}
function sinkFinalAt(sh) { return sinkLineT(sh.T); }
/** 沉沒的線：開始沉之後再沉 4.8 m（以前 4.2 ⇒ 9 m；高的船照樣多 4.8 m，⛔ 照舊 9 m ⇒ tridente 8 m 開始沉、1 m 後就算沉沒）。 */
function sinkGoneAt(sh) { return sinkFinalAt(sh) + (9 - SINK_FINAL); }
function stepShip(sh, dt) {
  if (sh.fixed) { sh.wl = sh.gy || 0; sh.bob = 0; } else stepFloat(sh, dt);   // 堡壘、砲台（TASK-0954）：站在地上（gy ＝ 地面高；實驗場 0 ＝ 海面）—— 不進水、不沉、不搖、不浮
  stepPose(sh, dt);
}
/** 浮在水上的那一段：進水、下沉、傾斜、浪、減重上浮。 */
function stepFloat(sh, dt) {
  // 進水：水線下每個破洞的流量 ∝ √(水深)（貼著水面的洞進得慢）；抽水機每秒抽掉一點 ⇒ 小洞撐得住
  var wz = Math.min(sh.T.sz - 1, Math.floor(sh.T.zw + (sh.sink - sh.lift - sh.bob) / S)), N = 0, Q = 0, Dsp = 0, Dbs = 0;
  for (var z = 0; z <= wz; z++) { var c = sh.flood[z * 3]; if (!c) continue; N += c; Q += c * Math.sqrt((wz - z) * S + 0.05); Dsp += sh.flood[z * 3 + 1]; Dbs += sh.flood[z * 3 + 2]; }
  sh.inflow = N;
  var fk = sh.broken ? Math.max(sh.cfg.flood, 0.6) : sh.cfg.flood;                       // 斷成兩截 ⇒ 一定沉（進水速度 0 也沉）
  var fl = sh.fl && !sh.broken ? sh.fl : null;                                   // 粒子模式（33_flood.js）：進水、下沉、傾斜照艙內的水；斷成兩截照舊用公式（一定沉）
  if (fl && !sh.sinkingFinal && !sh.sunk) floodStep(sh, fl, dt);                 // 開始沉之後不再算水（船要下去了；⛔ 照算 ⇒ 沉掉的船積到 8 萬噸、白耗 CPU）
  else if (sh.fl && PHX.sinkflood && (sh.broken || sh.sinkingFinal) && !sh.sunk) floodVis(sh, sh.fl, dt);   // 斷成兩截、開始沉 ⇒ 水照樣灌進去給人看（33_flood.js floodVis：只改畫面與讀數；沉完就停）
  if (VX && (!sh.sinkingFinal || sh.vxEaten) && !sh.sunk) vxDrag(sh, dt);       // 大漩渦的眼：被往下拖多深（sh.vxSink；出了眼浮回來；被眼拖沉的沉沒之前一直拖，08_sea.js）
  if (!sh.sunk) {
    if (fl) { if (!sh.sinkingFinal) {                                           // 照艙內的水該多吃水多少，慢慢跟過去
      if (VX) { if (sh.sinkF === undefined) sh.sinkF = sh.sink - (sh.vxOff || 0); sh.sinkF += (floodSinkT(sh, fl) - sh.sinkF) * Math.min(1, dt / FL_TAU); sh.sink = sh.sinkF + (sh.vxOff || 0); }   // 大漩渦：進水那一份照舊慢慢跟（sinkF），眼的那一份下面直接加（⛔ 一起慢慢跟 ⇒ 進眼第 1 秒只吃水 0.07 m，看起來沒在拖）
      else sh.sink += (floodSinkT(sh, fl) - sh.sink) * Math.min(1, dt / FL_TAU);
    } }
    else sh.sink = Math.max(0, sh.sink + Math.min(Q * 1.1e-5 - 0.004 * pumpK(sh), 0.25) * fk * dt);   // pumpK：基礎抽水量／PUMP_REF（TASK-0604；憲法號 1）   // 進水與抽水一起照滑桿縮放（⛔ 只縮進水 ⇒ 調慢之後抽水永遠贏、永遠不沉）；
                                                                              // 上限 0.25 m/s：彈藥庫殉爆打掉三十幾萬格 ⇒ 不設上限兩秒就沉完，看不到船斷開
    if (VX) { var vo = vxOffset(sh); sh.sink = Math.max(0, sh.sink + vo - (sh.vxOff || 0)); sh.vxOff = vo; }   // 大漩渦：眼那一份（拖下去的深度 ＋ 讓翹起那一頭留在水面的那一段，08_sea.js vxOffset）直接加在吃水上，兩種進水模式都一樣
    if (sh.sink > sinkFinalAt(sh) && !sh.sinkingFinal && (fk > 0 || sh.vxSink > 0)) { sh.sinkingFinal = true; if (sh.vxSink > 0) { sh.vxEaten = true; sh.fate = '捲進漩渦'; note(sh, '被漩渦拖下去，開始沉了', true); } else note(sh, '進水太多，開始沉了'); }   // 大漩渦：跟進水同一條線（4.2 m）—— 進水速度調成 0 也照樣會被拖沉
    var gulp = VX && VX.gulp > 0 && Math.hypot(sh.px, sh.pz) < VX.re;          // 大漩渦：開始沉的船在眼裡 ⇒ 被吸下去（天氣設定頁「眼吞沉船」m/s²；Tim：「沈船會在幾秒內被吸走(沉掉)」）
    if (sh.sinkingFinal && sh.vxEaten && VX.pull > 0) sh.sinkV = vxPullV(sh.vxSink);   // 被眼拖沉的：上面 vxDrag 照同一條式子接著拖（Tim 2026-10-22「船體逐漸往下」）—— ⛔ 不換成眼吞沉船的加速度（1.5 秒就沉沒）；sinkV 留給沉沒之後接著吸
    else if (sh.sinkingFinal) { sh.sinkV += (gulp ? VX.gulp : 0.06 * (sh.vxEaten ? Math.max(fk, 1) : fk)) * dt; sh.sink += sh.sinkV * dt; }
    if (sh.sink > (VX && sh.vxEaten ? vxSunkAt(sh) : sinkGoneAt(sh))) { sh.sunk = true; sh.sunkAt = SIMT; note(sh, '沉沒', true); }   // sunkAt：結算判自爆沉沒（61_hud.js shipFate）；被眼拖沉的 ⇒ 整艘進到水裡才算（08_sea.js vxSunkAt）
  } else { sh.sinkV = VX && VX.gulp > 0 && Math.hypot(sh.px, sh.pz) < VX.re ? sh.sinkV + VX.gulp * dt : Math.min(sh.sinkV + 0.05 * dt, 1.2); sh.sink += sh.sinkV * dt; }   // 眼裡：沉了也照樣吸（不夾 1.2 m/s）
  // 傾斜：破洞那一舷往下（格座標 +y ＝ 船體 +Z（右舷）；繞 +X 轉正角時 +Z 那邊下沉）；粒子模式照水的重心（33_flood.js floodTilt）
  var tl = fl ? floodTilt(sh, fl) : null;
  var rollT = tl ? tl[0] : clamp(Dsp / (N + 900), -1, 1) * (sh.sinkingFinal ? 0.55 : 0.21);
  var pitchT = tl ? tl[1] : -clamp(Dbs / (N + 1500), -1, 1) * 0.07;
  var vxP = VX && (sh.vxSink > 0 || sh.vxEaten);
  if (vxP) pitchT += vxTip(sh, sh.vxSink || 0);                                // 大漩渦的眼：先進眼那一頭往下拉（08_sea.js vxTip；Tim 2026-10-22「一端被拉下去」「讓先掉下去的一角(船頭或船尾) 先被往下拉」）
  sh.rollV += ((rollT - sh.rollA) * 0.9 - sh.rollV * 0.8) * dt;
  sh.rollA += sh.rollV * dt;
  sh.pitchA += (pitchT - sh.pitchA) * (vxP ? VX_TIP_RATE : 0.3) * dt;          // 大漩渦：那一頭跟著拖下去的深度走（每秒追 VX_TIP_RATE；⛔ 照平常的 0.3 ⇒ 落後 3 秒，拉下去的感覺出不來）
  stepWaves(sh, dt);                                                            // 浪：起伏、縱搖、橫搖（08_sea.js；以前是兩條固定的正弦）
  sh.lift += (sh.liftT - sh.lift) * Math.min(1, dt / LIFT_TAU);                    // 減重上浮：慢慢浮上去（目標每半秒在 survey 量一次）
}
/** 矩陣、砲班、裝填（浮的、固定的都走）。 */
function stepPose(sh, dt) {
  sh.Mp = sh.Mpre || sh.M || null; sh.Mpre = null; sh.yawP = sh.yawL === undefined ? sh.yaw : sh.yawL; sh.yawL = sh.yaw;   // 上一步的（畫面內插用，03_camera.js renderLerp）；Mpre：這一步的移動切了小步（50_sim.js shipPreMove）⇒ 上一步結束時那一個
  sh.M = M4.mul(shipMatrix(sh), M4.ident()); sh.inv = M4.inv(sh.M);
  sh.center = shipCenter(sh); sh.rad2 = Math.pow(Math.max(62, (sh.T.radFlags || 0) + 2), 2);   // 陣營旗在桅頂上方的旗桿上（77_colours.js）⇒ 62 m 搆不到（⛔ 以前一發都打不到）；沒有陣營旗 ⇒ 照舊 62
  manning(sh);
  if (sh.ahs) ahStep(sh, dt);                                       // 揚弾機把份數吊進砲旁藥箱（23_powder.js）—— 沒有 ⇒ 不做事
  for (var i = 0; i < sh.guns.length; i++) {
    var g = sh.guns[i]; if (!(g.reload > 0)) continue;
    if (g.needCart && !sh.mags.length && gunRate(g) > 0) g.needCart = false;   // 這艘一間彈藥庫都沒有（作品漏標；夜燈號 2026-10-15）⇒ 不等送藥手（⛔ 等 ⇒ 每門打完開局藥箱那 2 發就永遠在等，整舷一排 △）；彈藥庫被打掉的照舊要等
    if (g.needCart) { if (g.box > 0 && gunRate(g) > 0) { g.box--; g.needCart = false; } else continue; }   // 裝填要一份火藥與彈藥：藥箱空了 ⇒ 等送藥手（不倒數）
    g.reload -= dt * gunRate(g) * (sh.effOn ? g.eff : 1);           // 人少裝填慢、沒人不裝填；工作效率（TASK-0720，39_eff.js；g.eff ＝ 在崗砲班的平均，40_crew.js manning）乘在每一步的倒數上 ⇒ 中途吃到飯下一步就變快；⛔ 沒開 ⇒ × 字面上的 1
    if (sh.effOn) { var r0 = dt * gunRate(g); sh.effRk[0] += r0 * g.eff; sh.effRk[1] += r0; }   // 讀數 rk（45_galley.js galleyInfo）：裝填的加權平均倍數
  }
}
var SV_PROF = { n: 0, st: 0, cf: 0, tk: 0 };                         // ?debug=1：局勢檢查分段花多少 ms（st 結構那幾項、cf 船員腳下、tk 照時間的 tick；__game.prof；TASK-0801）
var SV_SKIP = Q.get('svskip') !== '0';                               // ?svskip=0：結構那幾項照舊每次都量（A/B 對拍用；TASK-0812）
/** 結構那幾項的輸入戳記：還在的模型、斷的繩、接回過幾條（47_sailmaker.js smRopeBack）。打掉的格不在這裡 —— 看 sh.rbin（removeVoxel 記、survey 清）。
 *  模型只會從在變成不在、斷的繩只有帆匠接得回來 ⇒ 兩個數加上接回的次數，沒變就是一樣都沒動。 */
function svStamp(sh) {
  var a = 0, b = 0, i;
  for (i = 0; i < sh.models.length; i++) if (sh.models[i].alive) a++;
  for (i = 0; i < sh.ropes.length; i++) if (sh.ropes[i].dead) b++;
  return a + ':' + b + ':' + (sh.ropeBack || 0);
}
function survey(sh) {               // 每半秒量一次：砲還在不在、桅還在不在、繩與帆的錨還在不在、少掉多少重量
  var sv0 = DEBUG ? performance.now() : 0, sv1 = 0;
  // 結構那幾項（TASK-0812；航行時一次約佔一半）：上一次量完什麼都沒變（量的時候自己也沒弄斷、弄掉東西），之後也沒有格被打掉、模型飛掉、繩斷或接回
  //   ⇒ 再量一次結果一樣 ⇒ 跳過。帆照舊每次量（收著的帆張開時要看錨還在不在，便宜）。
  var stS = SV_SKIP ? svStamp(sh) : null;
  if (stS === null || stS !== sh.svSt || (sh.rbin && sh.rbin.size)) { svStruct(sh); sh.svSt = stS !== null && svStamp(sh) === stS ? stS : null; }
  sh.sails.forEach(function (s) {
    if (!s.dead && !s.furled && (s.as.some(function (a) { return !hullGp(sh.grid, a); }) || s.par.some(function (j) { return sh.ropes[j].dead; }) ||
        (s.yards || []).some(function (y) { return !y.alive && !y.moved; }))) dropSail(sh, s);   // 掛它的帆桁被打斷或掉了 ⇒ 帆掉
  });
  if (DEBUG) { sv1 = performance.now(); SV_PROF.st += sv1 - sv0; sv0 = sv1; }
  svRest(sh, sv0);
}
/** 結構那幾項：模型腳下、門、砲口蓋板、砲、桅、繩的錨與母繩、浮空的繩。 */
function svStruct(sh) {
  var alive = 0;
  sh.models.forEach(function (m) {
    if (!m.alive) return;
    if (m.restOn && !m.restOn.alive) { blowModel(sh, m, [0, -1, 0], true); return; }   // 坐著的那個模型不在了（被斷開的那一團帶走、沒經過 blowModel）⇒ 掉下去（10_ship.js restOn）
    if (m.falls) { if (m.falls.every(function (j) { return sh.ropes[j].dead; })) blowModel(sh, m, [0, -1, 0], true); return; }   // 掛著的（小艇）：吊索全斷才掉（10_ship.js hangFalls）
    var f = m.foot, x = f & 2047, y = (f >> 11) & 1023, z = f >> 21;
    if (!countBox(sh.grid, x - 2, y - 2, z - 1, x + 2, y + 2, z)) blowModel(sh, m, [0, -1, 0], true);   // 腳下的甲板被打掉 ⇒ 掉下去
  });
  if (sh.doors) doorsSurvey(sh);
  if (sh.portW) portsSurvey(sh);                                     // 有蓋板的砲口：蓋板被打壞 ⇒ 變成進水口（25_doors.js，TASK-0822）                                      // 門沒了 ⇒ 開口變成進水口（25_doors.js）
  sh.guns.forEach(function (g) { if (g.alive) g.alive = g.model.alive; if (g.alive) alive++; });   // 砲都是模型：模型飛了（血量歸零、腳下甲板沒了）砲就沒了
  sh.gunsAlive = alive;
  var up = 0;
  sh.masts.forEach(function (m) { if (m.up) { m.up = countBox(sh.grid, m.x - 8, sh.T.cy - 8, m.z0, m.x + 8, sh.T.cy + 8, m.z1) > m.orig * 0.3; if (!m.up) note(sh, m.name + '倒了'); } if (m.up) up++; });
  sh.mastsUp = up;
  sh.ropes.forEach(function (r) { if (r.dead) return; if ((r.a >= 0 && !hullGp(sh.grid, r.a)) || (r.b >= 0 && !hullGp(sh.grid, r.b))) { r.dead = true; sh.rigDirty = true; } });
  sh.ropes.forEach(function (r) { if (!r.dead && r.par && r.par.some(function (j) { return sh.ropes[j].dead; })) { r.dead = true; sh.rigDirty = true; } });
  // 浮空的繩（Tim 2026-10-14：破壞後有浮空的纜線；判斷在 10_ship.js ropeFloat）：綁的帆桁／模型沒了或被帶走、端點附近的格全被打掉（錨是另一格、還在）⇒ 斷
  //   （物理開著 ⇒ 從還綁著的那一端垂下來）。繩掛在繩上 ⇒ 同一次一路斷到底（⛔ 只走一遍 ⇒ 一層等半秒，量到一串 36 條浮空 1–2 秒）。
  //   格那一端只量最近打掉的格附近（sh.rbin：8 格一塊，含旁邊一圈；20_shatter.js removeVoxel 記）。
  var near = null;
  if (sh.rbin && sh.rbin.size) { near = new Set(); sh.rbin.forEach(function (k) { for (var dz = -1; dz <= 1; dz++) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) near.add(k + dx + (dy << 8) + (dz << 16)); }); sh.rbin.clear(); }
  for (var again = true, pass = 0; again && pass < 8; pass++) {
    again = false;
    sh.ropes.forEach(function (r) { if (!r.dead && !r.moved && ropeFloat(sh, r, 0, near)) { r.dead = true; sh.rigDirty = true; again = true; } });
  }
}
/** 船員腳下、重量與浮力、照時間的 tick（每次都做）。sv0：?debug=1 分段計時的起點。 */
function svRest(sh, sv0) {
  var sv1 = 0;
  sh.crew.forEach(function (c) {   // 腳下 3×3 都沒了 ⇒ 掉下去（走路中的不算：途中跨過艙口邊）
    if (c.st >= 3 || c.walk || c.moving) return;
    if (c.gun && (c.gun.hd || (c.gun.mt && c.gun.mt.up)) && c.st === 0) return;   // 在砲塔上的砲旁（27_turret.js）⇒ 跟著砲轉、當成站在砲塔上（Tim 2026-10-17：「如果直接讓水手跟著砲轉呢」；⛔ 照腳下的格 ⇒ 莫尼特號的砲班轉到砲塔底下的艙口上就掉下去，開局 4 秒砲-b 剩 0 人）
    var x = Math.floor(c.pos[0]), y = Math.floor(c.pos[1]), fz = c.inBed ? c.medBed.origin[2] : c.pos[2];   // 躺在病床上：看床底下的地板（床是模型、不是格）
    if (!countBox(sh.grid, x - 1, y - 1, fz - 1, x + 1, y + 1, fz - 1) && turDeckAt(sh, [c.pos[0], c.pos[1], fz]) < 0) fallIn(sh, c);   // 下面船裡還有一層接得住 ⇒ 落在那一層；沒有才落水（40_crew.js）；踩在砲塔自己的格上（吊籃，27_turret.js）不算懸空
  });
  if (DEBUG) { sv1 = performance.now(); SV_PROF.cf += sv1 - sv0; sv0 = sv1; }
  if (sh.mass0 === undefined) sh.mass0 = shipT(sh);                               // 開戰時的重量（壓艙物、砲的重量照開戰時的設定）
  if (!sh.fixed && !sh.broken && !sh.sinkingFinal && !sh.sunk) sh.liftT = liftFor(sh.T, sh.T.disp - sh.mass0 + massLost(sh)) || 0;   // 斷了、開始沉 ⇒ 不再往上浮
  if (!sh.liftSet) { sh.lift = sh.liftT; sh.liftSet = true; }                    // 開戰那一刻直接放在浮的位置（不從設計水線慢慢浮過去）
  if (sh.fl) sh.flBase = sh.T.disp - sh.mass0 + massLost(sh);                     // 粒子模式：浮力表上水以外的部分（33_flood.js floodSinkT）
  if (!sh.fixed) driveSurvey(sh);                                     // 動力：實際質量（含進水）、引擎／魔力的完好度（31_drive.js）
  drownCheck(sh);                                                     // 船殼通海了 ⇒ 被水淹過頭的人浮上來（43_swim.js）
  chooseSide(sh); reassign(sh); manning(sh); gunIdle(sh); medTick(sh); pumpTick(sh); if (sh.burn) burnTick(sh); if (sh.galley) galleyTick(sh); effTick(sh); if (sh.duty) dutyTick(sh); callHands(sh); carpTick(sh); smTick(sh);   // burnTick：每個火場要幾個人救火（49_burn.js）；galleyTick：做飯、伙夫在路上的（45_galley.js）、effTick：每個人的工作效率（39_eff.js；TASK-0720）；pumpTick：抽水機要幾個人、現在抽多少（45_pumps.js）；medTick：醫療艙治療（44_medic.js）；callHands：預備水手補位（42_hands.js）
  sh.able = sh.crew.filter(crewAble).length;
  sh.gunsManned = sh.guns.filter(function (g) { return g.alive && gunRate(g) > 0; }).length;
  strikeCheck(sh);
  if (DEBUG) { SV_PROF.tk += performance.now() - sv0; SV_PROF.n++; }
}
/** 降旗：規則在選單設定（STRIKE），每半秒量一次。死傷 ＝ 1 − 還能動的／開戰時的人數（傷與亡都算）。
 *  全員倒下一定停（死傷門檻上限就是 100%）—— 那不是投降，是沒人能打了。 */
function strikeCheck(sh) {
  if (sh.struck || sh.sunk) return;
  var cas = 1 - sh.able / sh.crew0, pc = '死傷 ' + Math.round(cas * 100) + '%';
  if (sh.gunsManned > 0) sh.silentT = -1; else if (sh.silentT < 0) sh.silentT = SIMT;   // 砲全啞：毀了或沒人操作
  var why = null;
  if (sh.able === 0) why = '全員倒下';
  else if (cas >= STRIKE.cas) why = '降旗（' + pc + '）';
  else if ((STRIKE.guns || sh.fixed) && sh.silentT >= 0 && SIMT - sh.silentT >= 10) why = sh.fixed ? '失守（砲全啞 10 秒）' : '降旗（砲全啞 10 秒）';   // 堡壘（TASK-0954）沉不了 ⇒ 砲全啞就失守，不看選單的降旗規則（⛔ 照規則 ⇒ 預設「不降旗」時要打到最後一個人倒下，躲在營房裡的那一個永遠打不到）
  else if (STRIKE.masts && !sh.fixed && sh.mastsUp === 0 && cas >= 0.33) why = '降旗（桅全倒、' + pc + '）';
  else if (STRIKE.officers && cas >= 0.25 && !sh.crew.some(function (c) { return c.role === ROLE.OFFICER && crewAble(c); })) why = '降旗（軍官全倒、' + pc + '）';
  if (!why) return;
  if (sh.fixed) why = why.replace('降旗', '失守');                       // 堡壘不降旗、是失守
  sh.struck = true; sh.fate = why; note(sh, why, true); strikeColors(sh);
}
/** 選單與結算畫面用的一句話：現在的降旗規則。 */
function strikeText() {
  var r = [];
  if (STRIKE.cas < 1) r.push('死傷 ' + Math.round(STRIKE.cas * 100) + '%');
  if (STRIKE.guns) r.push('砲全啞 10 秒');
  if (STRIKE.masts) r.push('桅全倒且死傷 ≥ 33%');
  if (STRIKE.officers) r.push('軍官全倒且死傷 ≥ 25%');
  return r.length ? '任一條成立就降旗：' + r.join('／') : '不降旗：打到沉或全員倒下';
}
function hullGp(g, p) { return g.get(p & 2047, (p >> 11) & 1023, p >> 21); }   // 格座標壓法見 VK.pack（x 11 位元）


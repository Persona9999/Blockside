// ───────────────────────── 往來的船（Blocksail 精細層的商船、海盜船；Blocksail TASK-0911） ─────────────────────────
// 區塊職責：航海、城鎮模式裡，外面那一頁（Blocksail 地球儀）照它的精細層（world/fleetfine.js）說我艦附近有哪幾艘 ⇒ 這裡生真的船、照航點開、走遠了收掉。
//   Tim 2026-10-25：「航海模式用真的船（不開火、照航點開，加停用回收），之後 0940 直接接上」
//     「可以做半無縫載入(在靠近時 背景先載入好附近船隊的船 且有數量上限(參考海戰設定)」「避免卡住主執行緒」
// 物理意義：
//   ① 要：每 TRF_ASK_MS 跟外面那一頁要一次（'trafficNeed'：我艦的世界座標、現在幾點、最多幾艘）⇒ 'traffic'：
//      [{ id, kind 'merchant'｜'pirate', hull, name, at: [e, s], hdg, to: [e, s], v（m/s）, path: [[e, s]…], dock }]（海域座標 ⇒ 減 BED.ax／az 是世界座標）。
//      path（商船）：從它在精細層的位置往前的那一段航道 ⇒ 沿著航道、照自己的帆開（不照精細層的時刻表：那是平均推進速度，逆風一段只有 0.26 m/s ⇒ 停在頂風動不了；
//      2026-10-25 金斯敦實測）。3D 的船只給人看、不寫回城鎮帳 ⇒ 跑在精細層前面不影響帳；to、v 是沒有 path 的（海盜）照航點與航速開。
//      清單是「還留著的」範圍（外面那一頁照 TRF_KEEP 給）；離我艦 TRF_SPAWN_M 以內才生 ⇒ 生、收之間有一段緩衝，在邊上來回不會一下有一下沒有。
//   ② 生（半無縫）：近的先；船型先載（loadHull，自己分段讓出）⇒ makeShipSteps 那十幾段排進背景佇列，每格照海圖塊、擺樹同一份背景預算做（90_main.js frame ⇒ trafficPump；
//      08_seabed.js bedT1）—— ⛔ 不一口氣做（一艘約 0.3 s ⇒ 卡主執行緒）。做完才放進 SHIPS ⇒ 做到一半的船，模擬、畫面都碰不到。
//   ③ 上限：MAX_SHIPS（海戰設定的同時在場艘數）扣掉不是往來的船（航海、城鎮 ＝ 我艦）。
//   ④ 開：sh.npc ＝ { id, kind, to, v, path, dock }；31_sailing.js 艦長那一段先問 trafficHelm（有 path 沿航道、照自己的帆；沒有照 to 開、期望航速 v；helmIrons、讓船、淺水照舊接管）；停港的（dock）兩錨都下、帆全收。
//      ⛔ 不開火：跟我艦同一隊（藍）⇒ 不是任何一艘的敵人（52_fleet.js isFoe）；指揮官不給它命令（cmdView 的 cmd）；不能換操控（canTake）；
//      上方艦隊列不列（61_hud.js）、隊上的船數不算它（teamShips）；羅盤上商船米白、海盜船黑。
//   ⑤ 收（停用回收）：清單裡沒有了、或換到別的玩法 ⇒ 從 SHIPS 拿掉、後面的序號往前補、放掉網格（同 70_flow.js 清場那一行）。
//      只在航海、城鎮（場上除了我艦都是往來的船、沒有砲彈與命令掛在它們的序號上）⇒ 序號往前補不會動到戰局。
//   之後（TASK-0940）：遇上海盜、玩家開火 ⇒ 換隊（team）、交給海戰。
// 讀數：__game.traffic() ⇒ { ships, queue, built, dropped, stepMax, stepMs（每一段幾毫秒，最近 200 段）, place（放上場那一步）}
var TRF = { want: {}, build: null, q: [], askT: 0, built: 0, dropped: 0, stepMax: 0, stepMs: [], place: [], skip: 0 };
var TRF_ASK_MS = 2000, TRF_SPAWN_M = 6000, TRF_STARVE = 30;   // 幾毫秒要一次清單、離我艦幾公尺內才生、背景預算連續幾格用光就照樣做一段（不然一直排不到）
var TRF_LOOK_M = 300, TRF_V0 = 0.6;                              // 沿航道開：看航道上前面幾公尺那一點；生出來的航速（VMAX 的幾成）

/** 現在可不可以有往來的船：被 Blocksail 嵌著、在跑、航海或城鎮。 */
function trafficOk() { return !!(BED && BED.host && RUNNING && !OVER && (MODE === 'sail' || MODE === 'town')); }
function trafficShips() { return SHIPS.filter(function (s) { return s.npc; }); }
function trafficMax() { return Math.max(0, MAX_SHIPS - SHIPS.filter(function (s) { return !s.npc; }).length); }
function trafficYaw(hdg) { return Math.PI / 2 - hdg / 57.2958; }        // 方位角（北 0、東 90）⇒ yaw（同 52_fleet.js 開局、88_modeswitch.js 停靠處）

/** 外面那一頁回的清單 ⇒ 要的、收掉不要的、排要生的（近的先、照上限）。 */
function trafficGot(d) {
  if (!trafficOk()) return;
  var W = function (q) { return [q[0] - BED.ax, q[1] - BED.az]; }, want = {}, me = SHIPS[PLAYER_I], c = me ? shipCenter(me) : [0, 0, 0];
  (d.ships || []).forEach(function (o) { if (o && o.id && o.at) want[o.id] = { id: o.id, kind: o.kind || 'merchant', hull: o.hull, name: o.name || o.id, at: W(o.at), hdg: +o.hdg || 0, to: o.to ? W(o.to) : null, v: +o.v || 0, path: o.path && o.path.length > 1 ? o.path.map(W) : null, dock: !!o.dock }; });
  TRF.want = want;
  trafficShips().forEach(function (sh) {                              // 還在 ⇒ 換航點；沒了 ⇒ 收
    var w = want[sh.npc.id]; if (!w) { trafficDrop(sh); return; }
    sh.npc.to = w.to; sh.npc.v = w.v; sh.npc.path = w.path; trafficDock(sh, w.dock);
  });
  if (TRF.build && !want[TRF.build.id]) { trafficFree(TRF.build.M.sh); TRF.build = null; }   // 做到一半就不要了（第一段之後才有 M.sh）
  var have = {}; trafficShips().forEach(function (s) { have[s.npc.id] = 1; }); if (TRF.build) have[TRF.build.id] = 1;
  TRF.q = Object.keys(want).filter(function (id) { var w = want[id]; return !have[id] && Math.hypot(w.at[0] - c[0], w.at[1] - c[2]) < TRF_SPAWN_M && HULL_LIST.some(function (h) { return h.id === w.hull; }); })
    .sort(function (a, b) { var A = want[a], B = want[b]; return Math.hypot(A.at[0] - c[0], A.at[1] - c[2]) - Math.hypot(B.at[0] - c[0], B.at[1] - c[2]) || (a < b ? -1 : 1); });
}
/** 停港的兩錨都下、帆全收、船速歸零；出港就起錨、張戰鬥帆（helmGovern 再照期望航速調）（76_anchor.js；我艦的拋錨模式只管我艦 ⇒ 這裡自己下）。
 *  ⛔ 只下錨、帆照張 ⇒ 被風推著拖錨，離泊位 29 m 才停住（2026-10-25 金斯敦城鎮模式實測；收帆之後 35 秒漂 1.5 m，跟我艦差不多）。 */
function trafficDock(sh, on) {
  if (!!sh.npc.dock === on) return;
  sh.npc.dock = on; anchorToggle(sh, 'P', on); anchorToggle(sh, 'S', on);
  if (hasSails(sh)) { sh.sailSet = on ? 0 : 2; applySailSet(sh); }   // 直接設（⛔ setSails 會廣播「帆裝：…」）
  if (on) sh.spd = 0;
}
/** 艦長（31_sailing.js）：往來的船照航點開 ⇒ { yaw, v } ｜ null（停港：錨咬著）。fwd(yaw) ＝ [cos, 0, −sin] ⇒ 往 (dx, dz) ＝ atan2(−dz, dx)。
 *  有 path ⇒ 沿航道：期望航速 'cruise'（戰鬥帆）；目標往逆風那一側 ⇒ helmIrons 照舊搶風、方位換邊就換舷（之字形）。 */
function trafficHelm(sh) {
  var n = sh.npc; if (!n || n.dock) return null;
  var to = n.path ? trafficAhead(sh, n.path) : n.to; if (!to) return null;
  var dx = to[0] - sh.px, dz = to[1] - sh.pz;
  if (Math.hypot(dx, dz) < 30) return { yaw: sh.yaw, v: Math.min(n.path ? 0.5 : n.v, 0.5) };   // 到了航點（航道的盡頭）、下一份清單還沒來 ⇒ 慢慢往前
  return { yaw: Math.atan2(-dz, dx), v: n.path ? 'cruise' : n.v > 0 ? n.v : null };
}
/** 航道上「我在哪」之後 TRF_LOOK_M 公尺的那一點（把船投影到最近的那一段；清單是照精細層的位置給的 ⇒ 船跑在前面也找得到自己那一段）。 */
function trafficAhead(sh, P) {
  var best = Infinity, at = 0, run = 0, i, L = [0];
  for (i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  for (i = 1; i < P.length; i++) {
    var ax = P[i - 1][0], az = P[i - 1][1], bx = P[i][0] - ax, bz = P[i][1] - az, l2 = bx * bx + bz * bz;
    var u = l2 > 0 ? clamp(((sh.px - ax) * bx + (sh.pz - az) * bz) / l2, 0, 1) : 0, d = Math.hypot(ax + bx * u - sh.px, az + bz * u - sh.pz);
    if (d < best) { best = d; at = L[i - 1] + (L[i] - L[i - 1]) * u; }
  }
  run = at + TRF_LOOK_M; if (run >= L[L.length - 1]) return P[P.length - 1];
  for (i = 1; i < P.length && L[i] < run; i++);
  var k = (run - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
  return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k];
}
/** 放掉一艘的網格（同 70_flow.js 清場）。 */
function trafficFree(sh) { if (!sh) return; if (sh.rs) sh.rs.dispose(); armDispose(sh); glsFree(sh); }
/** 收一艘：從 SHIPS 拿掉、後面的序號往前補、命令與選敵重想。 */
function trafficDrop(sh) {
  var k = SHIPS.indexOf(sh); if (k < 0 || k === PLAYER_I) return;
  SHIPS.splice(k, 1); SHIPS.forEach(function (s, j) { s.i = j; });
  if (PLAYER_I > k) PLAYER_I--;
  var me = SHIPS[PLAYER_I]; if (me && me.aimOn === sh) setAim(me, null);
  if (typeof INFO_SH !== 'undefined' && INFO_SH === sh) INFO_SH = null;
  trafficFree(sh); TRF.dropped++;
  cmdTick(); pickFoes();
}
/** 換到別的玩法（海戰、建造…）⇒ 全收、佇列清掉。 */
function trafficClear() { trafficShips().forEach(trafficDrop); if (TRF.build) trafficFree(TRF.build.M.sh); TRF.build = null; TRF.q = []; TRF.want = {}; }

/** 畫面迴圈每格叫（90_main.js frame，海圖塊、擺樹之後）：t1 ＝ 背景預算做到幾點（08_seabed.js bedT1）。 */
function trafficPump(t1) {
  if (!trafficOk()) { if (trafficShips().length || TRF.build) trafficClear(); return; }
  var now = performance.now(), me = SHIPS[PLAYER_I];
  if (now - TRF.askT > TRF_ASK_MS && me) {                                // ① 要清單
    TRF.askT = now; var c = shipCenter(me);
    BED.host.postMessage({ bsmap: 'trafficNeed', x: c[0], z: c[2], tod: todNow(), max: trafficMax(), mode: MODE }, '*');
  }
  if (!TRF.build) {                                                      // ② 下一艘：船型載好了才開始做
    while (TRF.q.length && trafficShips().length < trafficMax()) {
      var id = TRF.q[0], w = TRF.want[id]; if (!w) { TRF.q.shift(); continue; }
      if (!HULLT[w.hull]) { loadHull(w.hull); break; }                    // 還在載（loadHull 自己分段讓出、同一型只載一次）⇒ 下一格再看
      TRF.q.shift();
      var M = makeShipSteps(SHIPS.length, 'blue', trafficYaw(w.hdg), w.at[1], HULLT[w.hull], w.at[0]);
      TRF.build = { id: id, M: M, steps: M.steps.slice(), t0: now };
      break;
    }
  }
  var B = TRF.build; if (!B) return;
  if (performance.now() >= t1 && ++TRF.skip < TRF_STARVE) return;        // 背景預算用光了 ⇒ 下一格（連續 TRF_STARVE 格都沒輪到 ⇒ 照樣做一段）
  TRF.skip = 0;
  do {                                                                   // ③ 照預算一段一段做（至少一段）
    var f = B.steps.shift(), a = performance.now(), r = f(), dt = performance.now() - a;
    if (r) B.steps = r.concat(B.steps);
    TRF.stepMax = Math.max(TRF.stepMax, dt); TRF.stepMs.push(+dt.toFixed(2)); if (TRF.stepMs.length > 200) TRF.stepMs.shift();
  } while (B.steps.length && performance.now() < t1);
  if (B.steps.length) return;
  var a2 = performance.now(); trafficPlace(B); TRF.place.push(+(performance.now() - a2).toFixed(2)); if (TRF.place.length > 50) TRF.place.shift();
  TRF.build = null;
}
/** 做好的那一艘放上場（位置照開始做那一刻的清單；這一兩秒船隊只走了幾公尺 ⇒ 不搬，艦長照新的航點開）。 */
function trafficPlace(B) {
  var w = TRF.want[B.id], sh = B.M.sh;
  if (!w || !trafficOk() || trafficShips().length >= trafficMax()) { trafficFree(sh); return; }
  sh.i = SHIPS.length; sh.name = w.name; sh.npc = { id: w.id, kind: w.kind, to: w.to, v: w.v, path: w.path, dock: false };
  SHIPS.push(sh);
  coreSpawned(sh, null); stepShip(sh, 0); survey(sh); pickCaptain(sh); cmdTick(); pickFoes();
  if (!w.dock && (w.path || w.v > 0)) sh.spd = w.path ? VMAX * TRF_V0 : Math.min(w.v, VMAX);   // 照船隊的航速開出來（⛔ 從 0 起步 ⇒ 生出來那幾十秒停在海上）；沿航道的照自己的帆
  trafficDock(sh, w.dock);
  TRF.built++;
}
/** 讀數（__game.traffic）。 */
function trafficInfo() {
  var me = SHIPS[PLAYER_I], c = me ? shipCenter(me) : [0, 0, 0];
  return { ok: trafficOk(), max: trafficMax(), want: Object.keys(TRF.want).length, queue: TRF.q.slice(), building: TRF.build ? TRF.build.id : null, built: TRF.built, dropped: TRF.dropped,
    stepMax: +TRF.stepMax.toFixed(2), stepMs: TRF.stepMs.slice(), place: TRF.place.slice(),
    ships: trafficShips().map(function (s) { return { i: s.i, id: s.npc.id, kind: s.npc.kind, hull: s.T.id, x: +s.px.toFixed(1), z: +s.pz.toFixed(1), d: Math.round(Math.hypot(s.px - c[0], s.pz - c[2])), spd: +s.spd.toFixed(2), dock: s.npc.dock, to: s.npc.to, path: s.npc.path ? s.npc.path.length : 0 }; }) };
}

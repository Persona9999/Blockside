// ───────────────────────── 往來的船（Blocksail 精細層的商船、海盜船；Blocksail TASK-0911） ─────────────────────────
// 區塊職責：航海、城鎮模式裡，外面那一頁（Blocksail 地球儀）照它的精細層（world/fleetfine.js）說我艦附近有哪幾艘 ⇒ 這裡生真的船、照航點開、走遠了收掉。
//   Tim 2026-10-25：「航海模式用真的船（不開火、照航點開，加停用回收），之後 0940 直接接上」
//     「可以做半無縫載入(在靠近時 背景先載入好附近船隊的船 且有數量上限(參考海戰設定)」「避免卡住主執行緒」
// 物理意義：
//   ① 要：每 TRF_ASK_MS 跟外面那一頁要一次（'trafficNeed'：我艦的世界座標、現在幾點、最多幾艘）⇒ 'traffic'：
//      [{ id, kind 'merchant'｜'pirate', hull, name, at: [e, s], hdg, to: [e, s], v（m/s）, path: [[e, s]…], dock, flag? }]（海域座標 ⇒ 減 BED.ax／az 是世界座標）。
//      flag（TASK-0974）：掛哪一面旗（77_colours.js 預設旗的 key，例 spain、gb-red、france、pirate）；沒給、不認得 ⇒ 照陣營旗（藍）。
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
//   ⑥ 照時刻表滑（Tim 2026-10-26：城鎮的時間面板加速時「不加速物理模擬(主要是想看船進出港&日夜變化)」，選了「照時刻表滑」）：
//      世界時間比物理快（城鎮模式 WCLK 倍率 > 1，08_weather.js）⇒ 照物理開跟不上時刻表（1 秒＝1 小時：船開出港要真實的幾分鐘，時刻表早就過了幾小時）
//      ⇒ 要清單時多帶 span（往後要幾小時）、外面那一頁每艘多回 trk ＝ [[世界時間（開戰以來幾小時）, e, s]…]；這裡每一步照世界時間在 trk 上內插、直接擺船（trafficGlide：
//      位置、船頭照走的方向轉過去，不靠帆、不靠艦長）。停港的照舊下錨；1 秒＝1 秒（倍率 1）⇒ 照舊靠物理開。要清單也照世界時間：滑的時候每 TRF_ASK_GLIDE_MS 一次。
//   ⑦ 世界時間報給外面那一頁（'wclock'：開戰以來世界時間走了幾小時 wh）：每 TRF_CLOCK_MS 一次 ⇒ 它的時鐘跟著走、過了換日照它自己的帳一天一天推。
//   ⑧ 進出港（Blocksail TASK-0980；Tim 2026-10-26「有船進出港時是否可以暫時改回1倍速 並處理好船的進出港演出」——以前照帆開出泊位，逆風、旁邊有船就卡在棧橋邊噴浪花）：
//      清單每艘多帶 berth ＝ { at, hdg }（停港的 ＝ 停的那一處；開往這座城的 ＝ 預約的泊位，Blocksail world/fleetfine.js fineBook）。
//      進出港那一段照拖船、絞纜（史料：進出港靠小艇拖、絞錨）⇒ 半過場（同 88_modeswitch.js 我艦的停靠 dockPull：不照帆、照畫好的路線走，浪照樣晃）：
//      · 出港（清單的 dock 從 true 變 false）：起錨、放開繫泊，帆收著沿航道往前拖 TRF_OUT_M 公尺（魚骨式、靠棧橋停的船頭本來就朝外）⇒ 張戰鬥帆、交還艦長。
//      · 進港（開往這座城、離預約的泊位 TRF_IN_M 公尺以內；或清單說到了 dock、船還沒到泊位）：沿航道拖到離泊位 max(30 m, 半個船長 ＋ TRF_SPIN_D) 那一點（魚骨式的格外、靠棧橋的船道上），
//        在那裡原地轉到停好的船頭（TRF_SPIN），船尾朝泊位直線倒進去（地中海式的船尾繫泊）⇒ 繫在泊位上（清單還沒說到 ⇒ 先繫著等）。
//      · 拖的時候不擱淺、棧橋不推（照畫好的路線，同照時刻表滑）。
//      · 城鎮的時間面板比 ×1 快的時候，有任何一艘在拖 ⇒ 世界時間暫時照 ×1（08_weather.js wclkRate 問 trafficPortBusy）、'wclock' 帶 hold（幾艘）⇒ 外面那一頁的面板標出來；拖完自己回到原本的倍率。
//        ⛔ 先關掉（TRF_PORT_X1 false；Tim 2026-10-26「船隻進出港把速度改成1 可以先取消」）⇒ 照玩家選的倍率走、hold 一律 0。
//      · 航行管制（Tim 2026-10-26「想辦法讓航線能避開碰撞」「可以類似機場一樣 有航行管制(統一分配航線)」；Blocksail world/fleetfine.js 塔台照每條入港航線排時段）：
//        清單帶 pilot ＝ 港內哪一段（'out' 開出入港航線、'wait' 入口外等、'in' 開進來）＋ 一定有 trk ⇒ 港內照時刻表帶著走（同照時刻表滑，×1 也一樣；帆收著）⇒ 3D 的位置 ＝ 塔台排的時段，兩艘不會在航線上碰頭；
//        出港不再拖 TRF_OUT_M（pilot 'out' 走完、出了入口才張帆）；進港帶到離泊位 max(30, 半個船長 ＋ TRF_SPIN_D) 才轉、倒進去。
//        entry ＝ 目的港的入口點：照帆開早到了（×1 時比時刻表快）⇒ 在入口 TRF_ENTRY_M 內停住等放行（⛔ 以前照帆一路開進港，什麼時候進來由物理決定、塔台管不到）。
//        沒有 pilot（沒有入港航線的城）⇒ 照舊：離泊位 TRF_IN_M 內拖進去、出港拖 TRF_OUT_M。
//      · 港內港外同步（Blocksail TASK-0980 第二輪；Tim 2026-10-26「讓船隻維持真實模擬速度 然後進出港段也是真實減速」「越靠近停靠越慢 做一個曲線減速 出港曲線加速」「這樣想辦法同步港內外」）：
//        精細層的時刻表自己在離泊位 4 km 內照曲線減速（Blocksail world/fleetfine.js harbRetime）⇒ 港內照時刻表帶著走的（pilot）一路滑到泊位、從泊位滑出去，⛔ 不再交給照真實秒數的拖（以前：
//        拖 2.2 m/s 照真實秒數、帶著走照世界時間 ⇒ ×3600 先慢慢拖 8 秒、接著一格走 124 m 衝出港；2026-10-26 托爾圖加航跡 log）。
//        離泊位 TRF_BLEND_M 內：位置慢慢加上 3D 泊位跟時刻表泊位差的那幾公尺（quayBerthAt 照船寬貼平台）、船頭從走的方向轉到停好的船頭（出港倒過來）⇒ 到了直接繫上、出港不跳。
//        不在時刻表裡的移動（沒有入港航線的城的拖、停著換格、港外錨地靠進空出來的那一格）：拖、轉照世界時間的倍率走（同步：×3600 一樣很快，跟其他船同一個時間；
//        ⛔ 先試過封頂 10 倍（Tim 一開始「最高10倍速演出進出港」）：×3600 時從錨地拖進泊位拖不完就到了出港時刻，原地出港、沒停進去過；2026-10-26 托爾圖加 log）。
//        帆照這一步誰在開：港內（pilot）、拖 ⇒ 收著；港外照時刻表滑 ⇒ 戰鬥帆（⛔ 以前只在 pilot 從 'out' 換掉的那一下張帆 ⇒ 清單跳過那一段就一直收著）。
//   ⑨ 表演船（Tim 2026-10-26：「船隻可以改為純演出 只有被玩家瞄準或是離玩家船夠近才變成真正的實體船(參考堡壘 開炮才會變敵對」
//      「甚至繩帆物理在表演船上都可以不用(可以錄製重播或單純固定」「被玩家開火 或是很靠近(可以撞船)」；以前兩艘往來的船進出港擠在一起就互推、撞斷帆桁）：
//      往來的船平常是表演船（trafficShow）⇒ 不跟別的船碰撞（31_sailing.js collide）、帆與繩不算布（30_rig_physics.js rigFixed；帆照收好那一捲／作品的形狀畫，11_rig_gpu.js sailWalk）。
//      變成真的船（n.real）：玩家的船對它開火（21_gunnery.js ⇒ trafficProvoke，之後不再變回）、或跟玩家的船隔不到 TRF_REAL_M 公尺（扣掉兩艘各半個船長；
//      隔到 TRF_SHOW_M 以外才變回表演船 ⇒ 在邊上來回不會一直切換）⇒ 照一般的船碰撞、算布。城鎮模式（停靠中）一律表演船（Tim「城鎮模式(停靠狀態) 可以都固定為表演船」）。
//   之後（TASK-0940）：遇上海盜、玩家開火 ⇒ 換隊（team）、交給海戰。
// 讀數：__game.traffic() ⇒ { ships, queue, built, dropped, stepMax, stepMs（每一段幾毫秒，最近 200 段）, place（放上場那一步）}
var TRF = { want: {}, build: null, q: [], askT: 0, clockT: 0, built: 0, dropped: 0, stepMax: 0, stepMs: [], place: [], skip: 0 };
var TRF_ASK_MS = 2000, TRF_SPAWN_M = 6000, TRF_STARVE = 30;   // 幾毫秒要一次清單、離我艦幾公尺內才生、背景預算連續幾格用光就照樣做一段（不然一直排不到）
var TRF_LOOK_M = 300, TRF_V0 = 0.6;                              // 沿航道開：看航道上前面幾公尺那一點；生出來的航速（VMAX 的幾成）
var TRF_ASK_GLIDE_MS = 500, TRF_CLOCK_MS = 250, TRF_GLIDE_TURN = 3;   // 滑的時候幾毫秒要一次清單；幾毫秒報一次世界時間；船頭每秒轉過去幾成（1／秒）
// 進出港（⑧）：離預約的泊位幾公尺內開始拖進去、出港拖幾公尺才張帆；拖的航速 m/s（航道上、到轉向那一點之前減到最慢、倒進去最快）；轉向那一點之前幾公尺開始減速；
//   原地轉、拖的時候船頭每秒最多轉幾 rad；離泊位幾公尺內算已經在泊位上（直接繫）〔設計；我艦停靠的過場 DOCK_AV 2～8 m/s，往來的船照港內慢慢拖〕
var TRF_PORT_X1 = false;                                                // 進出港時世界時間暫時 ×1（⑧）：先關掉（Tim 2026-10-26）
var TRF_REAL_M = 30, TRF_SHOW_M = 80;                                    // 表演船（⑨）：跟玩家的船隔幾公尺內變成真的船、幾公尺外變回表演船（扣掉兩艘各半個船長）〔設計〕
var TRF_BLEND_M = 120, TRF_CLEAR_M = 10, TRF_BLEND_K = 2.5;                                // 港內同步（⑧）：離泊位幾公尺內補上 3D 泊位的差；船頭照停好的方向直進直出多走幾公尺（船身離開棧橋）才轉
var TRF_HARB_VE = 7.4 / 3.6, TRF_HARB_R = 4000, TRF_HARB_V0 = 0.3 / 3.6;  // 拖的速度曲線：同 Blocksail world/fleetfine.js harbV（港內航速 7.4 km/h、4 km、下限 0.3 km/h）
var TRF_ENTRY_M = 150, TRF_IN_M = 450, TRF_OUT_M = 260, TRF_TOW_V = 2.2, TRF_TOW_VMIN = 0.6, TRF_BACK_V = 0.8, TRF_TURN_M = 60, TRF_SPIN = 0.1, TRF_YAW_RATE = 0.15, TRF_MOOR_M = 3;

/** 現在可不可以有往來的船：被 Blocksail 嵌著、在跑、航海或城鎮。 */
function trafficOk() { return !!(BED && BED.host && RUNNING && !OVER && (MODE === 'sail' || MODE === 'town')); }
function trafficShips() { return SHIPS.filter(function (s) { return s.npc; }); }
function trafficMax() { return Math.max(0, MAX_SHIPS - SHIPS.filter(function (s) { return !s.npc; }).length); }
function trafficYaw(hdg) { return Math.PI / 2 - hdg / 57.2958; }        // 方位角（北 0、東 90）⇒ yaw（同 52_fleet.js 開局、88_modeswitch.js 停靠處）
/** 停的、預約的泊位照這艘的寬貼平台（32_quay.js quayBerthAt，TASK-0962）⇒ 新的一份（清單那一份不動：同一格換一艘、船寬就不同）。 */
function trafficBerthFor(sh, b) {
  if (!b || !b.id) return b;
  var p = quayBerthAt(sh, b.id, [b.x, b.z]);
  return p[0] === b.x && p[1] === b.z ? b : { x: p[0], z: p[1], yaw: b.yaw, id: b.id };
}

/** 外面那一頁回的清單 ⇒ 要的、收掉不要的、排要生的（近的先、照上限）。 */
function trafficGot(d) {
  if (!trafficOk()) return;
  var W = function (q) { return [q[0] - BED.ax, q[1] - BED.az]; }, want = {}, me = SHIPS[PLAYER_I], c = me ? shipCenter(me) : [0, 0, 0];
  (d.ships || []).forEach(function (o) { if (o && o.id && o.at) want[o.id] = { id: o.id, kind: o.kind || 'merchant', hull: o.hull, name: o.name || o.id, at: W(o.at), hdg: +o.hdg || 0, to: o.to ? W(o.to) : null, v: +o.v || 0, path: o.path && o.path.length > 1 ? o.path.map(W) : null, dock: !!o.dock, flag: o.flag || null,
    trk: o.trk && o.trk.length > 1 ? o.trk.map(function (q) { var p = W([q[1], q[2]]); return [+q[0], p[0], p[1]]; }) : null,   // trk：照時刻表滑（⑥）
    berth: o.berth && o.berth.at ? (function (p) { return { x: p[0], z: p[1], yaw: trafficYaw(+o.berth.hdg || 0), id: o.bid || null }; })(W(o.berth.at)) : null,   // id：泊位 id（'@anchor' ＝ 港外錨地）   // berth：停的、預約的泊位（⑧）
    pilot: o.pilot || null, entry: o.entry ? W(o.entry) : null,          // pilot、entry：航行管制（⑧）
    lane: o.lane && o.lane.length > 1 ? o.lane.map(W) : null,          // lane：berth 那一格的入港航線（泊位 ⇒ 入口點；換格時沿著拖，⑧）
    bat: o.bat ? W(o.bat) : null }; });                                 // bat：時刻表停的那一點跟 berth 不同（港外錨地：時刻表停在外海泊位、船停在自己那一格）
  Object.keys(want).forEach(function (id) { var w = want[id]; if ((w.dock || w.pilot) && w.berth && trafficDistOff(w.berth.x, w.berth.z)) delete want[id]; });   // 別的城區的泊位（沒建）⇒ 不生、生了的收掉
  TRF.want = want;
  trafficShips().forEach(function (sh) {                              // 還在 ⇒ 換航點；沒了 ⇒ 收
    var w = want[sh.npc.id]; if (!w) { trafficDrop(sh); return; }
    var was = !!sh.npc.dock, P0 = sh.npc.path, L0 = sh.npc.lane || null; sh.npc.lane = w.lane;
    var b0 = w.berth && w.bat ? { x: w.bat[0], z: w.bat[1], yaw: w.berth.yaw, id: w.berth.id } : w.berth;   // 時刻表的那一點（⑧ 補差的起點）
    sh.npc.to = w.to; sh.npc.v = w.v; sh.npc.path = w.path; sh.npc.trk = w.trk; if (!was || w.dock) sh.npc.berth0 = b0; sh.npc.berth = trafficBerthFor(sh, w.berth); sh.npc.entry = w.entry;
    if (was && !w.dock) sh.npc.bOut = trafficBerthOut(sh);              // 出港：記下停的那一格（⑧ 出港那一段照它補差、轉船頭）
    if (!w.dock) sh.npc.berth0 = b0;
    trafficPilot(sh, w.pilot);
    if (w.dock && !was) trafficArrive(sh, P0, L0); else if (!w.dock && was) trafficLeave(sh);   // 到港、出港（⑧）
    else if (w.berth && trafficMoved(sh)) (function (st) { var R = st ? trafficLaneRoute(L0, w.lane) : null; trafficTowIn(sh, R || (st ? null : sh.npc.path), !!R); })(w.dock || sh.npc.held);   // 停著換格 ⇒ 沿舊、新兩條入港航線拖（⛔ 直線 ⇒ 穿過棧橋）   // 停的、要去的那一格換了（玩家停進來、別人預約了 ⇒ 地球儀換一格）⇒ 拖過去（⛔ 以前停著的不動 ⇒ 跟換進來的船疊在一起）
    if ((sh.nation || null) !== w.flag) shipNation(sh, w.flag);        // 旗（TASK-0974）：船隊主人那座城換了勢力（轉手）⇒ 跟著換
  });
  if (TRF.build && !want[TRF.build.id]) { trafficFree(TRF.build.M.sh); TRF.build = null; }   // 做到一半就不要了（第一段之後才有 M.sh）
  var have = {}; trafficShips().forEach(function (s) { have[s.npc.id] = 1; }); if (TRF.build) have[TRF.build.id] = 1;
  TRF.q = Object.keys(want).filter(function (id) { var w = want[id]; return !have[id] && Math.hypot(w.at[0] - c[0], w.at[1] - c[2]) < TRF_SPAWN_M && HULL_LIST.some(function (h) { return h.id === w.hull; }); })
    .sort(function (a, b) { var A = want[a], B = want[b]; return Math.hypot(A.at[0] - c[0], A.at[1] - c[2]) - Math.hypot(B.at[0] - c[0], B.at[1] - c[2]) || (a < b ? -1 : 1); });
}
/** 城區（Blocksail TASK-0817；63_towns.js townDistView）：城只建 TOWNS.onD 那幾區（航海照遠近、城鎮模式照焦點與鄰區）⇒ 別區的棧橋、碼頭沒建、也不擋船 ⇒
 *  泊位在那裡、停港或港內帶著走的往來船不生（⛔ 生了就浮在空的水面上，看起來像一直飄在港裡）。(x, z) ＝ 泊位的世界座標；沒有城區切法（cut）的城 ⇒ false。 */
function trafficDistOff(x, z) {
  if (!BED) return false;
  for (var i = 0; i < TOWNS.list.length; i++) {
    var p = TOWNS.full[TOWNS.list[i].id], D = p && p.districts; if (!D || !p.cut) continue;
    var q = townDistLocal(p, x, z);
    if (!D.some(function (d) { return townPip(q[0], q[1], d.poly) || townPolyDist(q[0], q[1], d.poly) < TRF_DIST_NEAR; })) continue;   // 不是這座城的泊位
    return !((TOWNS.onD[p.id] || 0) & (1 << D.indexOf(townDistAt(D, q[0], q[1]))));
  }
  return false;
}
var TRF_DIST_NEAR = 1500;                                               // 泊位離某一區多近算這座城的（金角灣水上的泊位在範圍外；Blocksail townDistrictNear 照最近那一區）
/** 停港的兩錨都下、帆全收、船速歸零；出港就起錨、張戰鬥帆（helmGovern 再照期望航速調）（76_anchor.js；我艦的拋錨模式只管我艦 ⇒ 這裡自己下）。
 *  ⛔ 只下錨、帆照張 ⇒ 被風推著拖錨，離泊位 29 m 才停住（2026-10-25 金斯敦城鎮模式實測；收帆之後 35 秒漂 1.5 m，跟我艦差不多）。 */
function trafficDock(sh, on, sails) {
  sh.npc.dock = on; sh.npc.held = false; anchorToggle(sh, 'P', on); anchorToggle(sh, 'S', on);
  trafficSails(sh, on ? 0 : sails == null ? 2 : sails);
  if (on) sh.spd = 0;
  var b = sh.npc.berth;                                                 // 繫在泊位上（⑧；32_quay.js moorPull）；沒給泊位 ⇒ 停下來的那一點（第一步照當下記）⇒ 風、水流推不走；出港放開
  sh.moor = on ? (b ? { x: b.x, z: b.z, yaw: b.yaw } : { x: null }) : null;
}
function trafficSails(sh, k) { if (hasSails(sh) && sh.sailSet !== k) { sh.sailSet = k; applySailSet(sh); } }   // 直接設（⛔ setSails 會廣播「帆裝：…」）
/** 清單說到港了（⑧）：已經在拖進去 ⇒ 拖完再下錨；離泊位 TRF_MOOR_M 內、或沒給泊位 ⇒ 直接停；不然從這裡沿剛才的航道拖進去。 */
function trafficArrive(sh, P0, L0) {
  var n = sh.npc, b = n.berth, c = shipCenter(sh);
  if (n.tow && n.tow.kind === 'in') { n.dock = true; return; }
  n.tow = null;
  if (!b || Math.hypot(b.x - c[0], b.z - c[2]) <= TRF_MOOR_M) { trafficDock(sh, true); return; }
  var R = n.held || (L0 && !trafficSameLane(L0, n.lane)) ? trafficLaneRoute(L0, n.lane) : null; trafficTowIn(sh, R || (n.held ? null : P0), !!R); n.dock = true;   // 先繫著等的（held）、到港那一刻換了格（港外錨地 ⇒ 空出來的格）⇒ 沿入港航線拖過去
}
/** 換格時拖的路線（⑧；Tim 2026-10-26「避免穿越棧橋航行」「棧橋視為障礙物」）：La ＝ 現在那一格的入港航線、Lb ＝ 新的那一格的（都是泊位 ⇒ 入口點，烘航線快取時已經避開棧橋）⇒
 *  順著 La 往外、在兩條靠到 TRF_LANE_JOIN 公尺以內、總長最短的那一對點換到 Lb、順著 Lb 往內到新泊位；沒有靠那麼近的 ⇒ 兩條都走到入口點再接。少一條 ⇒ null（照舊直線）。 */
var TRF_LANE_JOIN = 40;
function trafficLaneRoute(La, Lb) {
  if (!La || !Lb || La.length < 2 || Lb.length < 2) return null;
  function acc(P) { var r = [0]; for (var i = 1; i < P.length; i++) r.push(r[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return r; }
  var A = acc(La), B = acc(Lb), best = null;
  for (var i = 0; i < La.length; i++) for (var j = 0; j < Lb.length; j++) { var g = Math.hypot(La[i][0] - Lb[j][0], La[i][1] - Lb[j][1]); if (g <= TRF_LANE_JOIN && (!best || A[i] + B[j] + g < best[0])) best = [A[i] + B[j] + g, i, j]; }
  if (!best) best = [0, La.length - 1, Lb.length - 1];
  return La.slice(0, best[1] + 1).concat(Lb.slice(0, best[2] + 1).reverse());
}
function trafficSameLane(a, b) { return !!(a && b && a[0][0] === b[0][0] && a[0][1] === b[0][1]); }
/** 出港那一格（⑧ 同步）：3D 繫的那一點（sh.moor）、時刻表的那一點（berth0：清單給的、沒照船寬貼平台）、停好的船頭。 */
function trafficBerthOut(sh) {
  var n = sh.npc, m = sh.moor, b0 = n.berth0, c = shipCenter(sh);
  return { x: m && m.x != null ? m.x : c[0], z: m && m.x != null ? m.z : c[2], yaw: m && m.yaw != null ? m.yaw : sh.yaw, x0: b0 ? b0.x : c[0], z0: b0 ? b0.z : c[2] };
}
/** 拖、轉的加速倍數（⑧ 同步）：世界時間的倍率。 */
function trafficHk() { return Math.max(1, wclkRate()); }
/** 停的、拖去的那一格跟清單的泊位差 TRF_MOOR_M 以上（⑧）：停港繫著的 ⇒ 照繫的那一點比；拖進去中 ⇒ 照拖的終點比；先繫著等的 ⇒ 照繫的那一點。 */
function trafficMoved(sh) {
  var n = sh.npc, b = n.berth, T = n.tow, m = sh.moor, p = T && T.kind === 'in' ? T.A[T.A.length - 1] : (n.dock || n.held) && m && m.x != null ? [m.x, m.z] : null;
  return !!(p && b && Math.hypot(p[0] - b.x, p[1] - b.z) > TRF_MOOR_M);
}
/** 清單說出港了（⑧）：起錨、放開繫泊；有航道 ⇒ 帆收著沿航道拖出去（拖完才張帆），沒有（海盜）⇒ 照舊直接張帆。 */
function trafficLeave(sh) {
  var n = sh.npc; n.tow = null;
  if (n.pilot) { trafficDock(sh, false, 0); n.lag = null; return; }   // 航行管制：照時刻表帶出去（trafficGlide），出了入口才張帆（trafficPilot）；從泊位接著追（trafficLagOf：清單晚到的那一段，⛔ 設 0 ⇒ 第一格跳 36 m、斜切過指形棧橋）
  if (!n.path) { trafficDock(sh, false); return; }
  trafficDock(sh, false, 0);
  trafficTowStart(sh, 'out', n.path, null);
}
/** 進港：從船現在的位置接上航道剩下的那一段（投影到最近的那一段之後），最後一點補成泊位。
 *  head ⇒ 從第一點走起、不投影（換格的入港航線路線先往外再往內：新、舊泊位靠得近 ⇒ 投影會挑到最後那一段，直線穿過棧橋）。 */
function trafficTowIn(sh, P, head) {
  var b = sh.npc.berth, c = shipCenter(sh), A = [], best = Infinity, at = head ? 1 : 0, i;
  P = P || [];
  for (i = 1; i < P.length && !head; i++) {
    var ax = P[i - 1][0], az = P[i - 1][1], bx = P[i][0] - ax, bz = P[i][1] - az, l2 = bx * bx + bz * bz, u = l2 > 0 ? clamp(((c[0] - ax) * bx + (c[2] - az) * bz) / l2, 0, 1) : 0, d = Math.hypot(ax + bx * u - c[0], az + bz * u - c[2]);
    if (d < best) { best = d; at = i; }
  }
  for (i = at; i < P.length; i++) A.push(P[i]);
  if (!A.length || Math.hypot(A[A.length - 1][0] - b.x, A[A.length - 1][1] - b.z) > 5) A.push([b.x, b.z]); else A[A.length - 1] = [b.x, b.z];
  trafficTowStart(sh, 'in', A, b.yaw);
}
/** 開始拖（⑧）：A ＝ 要走的點（前面補上船現在的中心）；y1 ＝ 停好的船頭（進港）。
 *  進港：沿路線往回、第一個直線離泊位 max(30, 半個船長 ＋ TRF_SPIN_D) 公尺的那一點（sa）⇒ 先原地轉到停好的船頭（照 TRF_SPIN_TIP 限速）、再從那裡直線倒進去 ——
 *  ⛔ 不取路線的倒數第二點、不照路線倒退：入港航線 32 m 一格，泊位前那幾點是鋸齒（托爾圖加小船格：側移 4.4 m、往外 16 m）⇒ 那一點在格子裡，在指形棧橋中間轉、倒退時側滑。
 *  出港：起點附近 TRF_OUT_SKIP 公尺內的點略過（同一個鋸齒）。 */
var TRF_SPIN_D = 20, TRF_OUT_SKIP = 8, TRF_SPIN_TIP = 0.9;   // 轉的時候船頭、船尾掃水最快幾 m/s（13_water.js 推水 > 0.2 m/s 就留白沫 ⇒ 長的船轉慢一點，不在泊位外噴一大片）
function trafficTowStart(sh, kind, P, y1) {
  var c = shipCenter(sh), A = [[c[0], c[2]]], cum = [0];
  P.forEach(function (q) { var p = A[A.length - 1], d0 = Math.hypot(q[0] - c[0], q[1] - c[2]); if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 1 && !(kind === 'out' && A.length === 1 && d0 < TRF_OUT_SKIP)) A.push([q[0], q[1]]); });
  if (A.length < 2) A.push(A[0].slice());                                 // 路線只剩船現在那一點（已經在泊位上、航道的點都在 1 m 內略過）⇒ 長度 0 的一段：進港照樣原地轉好、靠上（⛔ 以前找轉向點讀 A[-1] 崩掉）
  for (var i = 1; i < A.length; i++) cum.push(cum[i - 1] + Math.hypot(A[i][0] - A[i - 1][0], A[i][1] - A[i - 1][1]));
  var L = cum[cum.length - 1], half = (sh.T.hx1 - sh.T.hx0) * S / 2, sa = -1;
  if (kind === 'in' && y1 != null) {                                     // 轉向那一點：從泊位沿路線往回走，第一個直線離泊位 ≥ D 的地方（路線是鋸齒 ⇒ 照直線量，不照沿路線的長度）
    var D = Math.max(30, half + TRF_SPIN_D), E = A[A.length - 1], k = A.length - 1; sa = 0;
    for (var t = L; t >= 0; t -= 1) { while (k > 1 && cum[k - 1] > t) k--; var g = cum[k] - cum[k - 1], w = g > 1e-6 ? (t - cum[k - 1]) / g : 0; if (Math.hypot(A[k - 1][0] + (A[k][0] - A[k - 1][0]) * w - E[0], A[k - 1][1] + (A[k][1] - A[k - 1][1]) * w - E[1]) >= D) { sa = t; break; } }
  }
  sh.npc.tow = { kind: kind, A: A, cum: cum, L: L, s: 0, v: Math.max(0, sh.spd), y1: y1, sa: sa, spin: false, spun: false, t0: SIMT, wr: Math.min(TRF_SPIN, TRF_SPIN_TIP / Math.max(1, half)) };
  sh.npc.held = false; sh.moor = null;
  if (sh.anc) { anchorToggle(sh, 'P', false); anchorToggle(sh, 'S', false); }
  trafficSails(sh, 0);
}
/** 表演船（⑨）：往來的船、還沒變成真的船 ⇒ 不跟別的船碰撞、帆與繩不算布。 */
function trafficShow(sh) { return !!(sh && sh.npc && !sh.npc.real); }
/** 玩家的船對它開火（21_gunnery.js，同堡壘 fortProvoke 那一行）⇒ 變成真的船、不再變回（之後換隊交給海戰：TASK-0940）。 */
function trafficProvoke(sh, by) { if (!sh || !sh.npc || !by || by.npc || by.team !== SHIPS[PLAYER_I].team) return; sh.npc.real = true; sh.npc.shot = true; }
/** 每一格（trafficPump）：照跟玩家的船隔多遠換表演船、真的船（⑨）。 */
function trafficRealTick() {
  var me = SHIPS[PLAYER_I]; if (!me || me.npc) return;
  if (MODE === 'town') { trafficShips().forEach(function (sh) { sh.npc.real = !!sh.npc.shot; }); return; }   // 城鎮模式（停靠中）：一律表演船（Tim 2026-10-26）
  var c = shipCenter(me), hm = (me.T.hx1 - me.T.hx0) * S / 2;
  trafficShips().forEach(function (sh) {
    var n = sh.npc; if (n.shot) return;
    var q = shipCenter(sh), gap = Math.hypot(q[0] - c[0], q[2] - c[2]) - hm - (sh.T.hx1 - sh.T.hx0) * S / 2;
    if (!n.real && gap < TRF_REAL_M) n.real = true; else if (n.real && gap > TRF_SHOW_M) n.real = false;
  });
}
/** 有沒有往來的船正在進出港（⑧）⇒ 城鎮的世界時間暫時照 ×1（08_weather.js wclkRate）。 */
function trafficPortMv(n) { return !!(n && (n.tow || n.pilot === 'out' || n.pilot === 'in')); }   // 港內在動（拖、照時刻表帶著開進開出；入口外等的不算 ⇒ 不會一等幾小時都 ×1）
function trafficPortBusy() { if (!TRF_PORT_X1) return false; for (var i = 0; i < SHIPS.length; i++) if (trafficPortMv(SHIPS[i].npc)) return true; return false; }
function trafficPortN() { if (!TRF_PORT_X1) return 0; var n = 0; for (var i = 0; i < SHIPS.length; i++) if (trafficPortMv(SHIPS[i].npc)) n++; return n; }
/** 清單的 pilot 換了（⑧ 航行管制）：開始帶 ⇒ 收帆、起錨、照船現在的位置接上時刻表（n.lag 重算）；帶出入口了（'out' ⇒ 沒有）⇒ 張戰鬥帆、交還艦長。 */
function trafficPilot(sh, p) {
  var n = sh.npc, o = n.pilot || null; p = p || null; if (o === p) return;
  n.pilot = p;
  if (p && p !== 'dock' && !n.dock && !n.tow && !n.held) { n.lag = null; trafficSails(sh, 0); if (sh.anc) { anchorToggle(sh, 'P', false); anchorToggle(sh, 'S', false); } }
  if (!p && o === 'out' && !n.dock) { trafficSails(sh, 2); sh.spd = Math.max(sh.spd, VMAX * TRF_V0); }
}
/** 照畫好的路線走（照時刻表滑、拖）⇒ 不擱淺、棧橋不推、海圖塊不等它（08_seabed.js、50_sim.js）。 */
function trafficKin(sh) { return trafficGliding(sh) || !!(sh.npc && sh.npc.tow); }
/** 31_sailing.js sailShip 開頭先問（滑之前）：拖（⑧）⇒ true（這一步照拖的路線擺，不照帆走）；開往這座城、離預約的泊位 TRF_IN_M 內 ⇒ 開始拖進去。 */
function trafficTow(sh, dt) {
  var n = sh.npc; if (!n) return false;
  if (!n.tow) {
    var b = n.berth; if (n.dock || n.held || !b) return false;
    var c0 = shipCenter(sh), db = Math.hypot(b.x - c0[0], b.z - c0[2]);
    if (n.pilot || db > TRF_IN_M) return false;                         // 航行管制（pilot）：港內港外同步、一路照時刻表滑到泊位（⑧，不拖）；沒有 ⇒ 舊的 TRF_IN_M 內拖進去
    trafficTowIn(sh, n.pilot ? null : n.path);
  }
  var T = n.tow, A = T.A, v, ty, hk = trafficHk(); dt *= hk;           // 照世界時間拖（同步）⇒ 下面的距離、轉角都照 dt × 倍率
  if (T.spin) {                                                          // 離泊位 sa 那一點：原地轉到停好的船頭
    var e = Math.atan2(Math.sin(T.y1 - sh.yaw), Math.cos(T.y1 - sh.yaw)), st = T.wr * dt;
    sh.yaw += Math.abs(e) <= st ? e : (e > 0 ? st : -st); if (Math.abs(e) <= st) { T.spin = false; T.spun = true; }
    v = 0;
  } else {
    var left = T.L - T.s, toA = T.sa >= 0 && !T.spun ? T.sa - T.s : Infinity;
    var vc = TRF_HARB_VE * Math.sqrt(clamp(Math.min(T.s, left) / TRF_HARB_R, 0, 1));   // 同時刻表的進出港曲線（Blocksail world/fleetfine.js harbV：v ∝ √離那一頭的距離）⇒ 拖的跟照時刻表帶著走的同一種快慢
    if (T.kind === 'out') v = Math.min(TRF_TOW_V, T.v + 0.15 * dt);   // 出港：從停著慢慢拖起來
    else if (T.spun) v = clamp(left / 20, 0.3, TRF_BACK_V);             // 倒進去：最後 20 m 減速
    else v = toA < TRF_TURN_M ? Math.max(TRF_TOW_VMIN, TRF_TOW_V * toA / TRF_TURN_M) : T.sa < 0 && left < TRF_TURN_M ? Math.max(0.3, TRF_TOW_V * left / TRF_TURN_M) : TRF_TOW_V;
    v = Math.max(TRF_HARB_V0, Math.min(v, vc)); T.v = v; T.s = Math.min(T.L, T.s + v * dt);
    if (T.sa >= 0 && !T.spun && T.s >= T.sa) {                         // 到了轉向那一點 ⇒ 原地轉、之後從這裡直線倒進泊位（⛔ 不照航道剩下的那一截：入港航線 32 m 一格，泊位前那幾公尺是鋸齒 ⇒ 在格子裡側滑）
      var k0 = 1; while (k0 < A.length - 1 && T.cum[k0] < T.sa) k0++;
      var g0 = A[k0 - 1], g1 = A[k0], sg = T.cum[k0] - T.cum[k0 - 1], ug = sg > 1e-6 ? (T.sa - T.cum[k0 - 1]) / sg : 1, P = [g0[0] + (g1[0] - g0[0]) * ug, g0[1] + (g1[1] - g0[1]) * ug], E = A[A.length - 1], dE = Math.hypot(E[0] - P[0], E[1] - P[1]);
      T.A = A = [P, [E[0], E[1]]]; T.cum = [0, dE]; T.L = dE; T.s = 0; T.sa = -1; T.spin = true;
    }
  }
  var k = 1; while (k < A.length - 1 && T.cum[k] < T.s) k++;
  var a = A[k - 1], q = A[k], seg = T.cum[k] - T.cum[k - 1], u = seg > 1e-6 ? (T.s - T.cum[k - 1]) / seg : 1, x = a[0] + (q[0] - a[0]) * u, z = a[1] + (q[1] - a[1]) * u, dir = seg > 1e-6 ? Math.atan2(-(q[1] - a[1]), q[0] - a[0]) : sh.yaw;
  if (!T.spin) {
    if (T.kind === 'in' && (T.spun || T.sa < 0 && T.L - T.s < TRF_TURN_M)) ty = T.spun ? T.y1 : sh.yaw + Math.atan2(Math.sin(T.y1 - sh.yaw), Math.cos(T.y1 - sh.yaw)) * (1 - (T.L - T.s) / TRF_TURN_M);   // 倒進去 ⇒ 停好的船頭；沒有泊位前那一點 ⇒ 最後一段轉過去
    else ty = dir;
    var dy = Math.atan2(Math.sin(ty - sh.yaw), Math.cos(ty - sh.yaw)), mx = TRF_YAW_RATE * dt; sh.yaw += Math.abs(dy) <= mx ? dy : (dy > 0 ? mx : -mx);
  }
  var c = shipCenter(sh); sh.px += x - c[0]; sh.pz += z - c[2]; sh.yawRate = 0;   // 照船的中心擺（泊位的 at 是船的中心）
  var F = fwd(sh.yaw), mvx = Math.cos(dir) * v * hk, mvz = -Math.sin(dir) * v * hk;
  sh.spd = mvx * F[0] + mvz * F[2]; sh.vel = [mvx, 0, mvz];             // 航跡、水花照走的方向（倒進去 ⇒ 航速是負的）；照加速後真的走的速度
  if (T.kind === 'out' && T.s >= Math.min(T.L, TRF_OUT_M)) { n.tow = null; n.lag = null; trafficSails(sh, 2); sh.spd = Math.max(sh.spd, VMAX * TRF_V0); return true; }   // 拖出去了 ⇒ 張戰鬥帆、交還艦長；之後滑的時候照落後多少接上（trafficGlide）
  if (T.kind === 'in' && !T.spin && T.s >= T.L) { n.tow = null; if (n.dock) trafficDock(sh, true); else { n.held = true; sh.spd = 0; sh.vel = [0, 0, 0]; sh.moor = { x: n.berth.x, z: n.berth.z, yaw: n.berth.yaw }; } }   // 到了：清單已經說到港 ⇒ 下錨；還沒 ⇒ 先繫著等
  return true;
}
/** 艦長（31_sailing.js）：往來的船照航點開 ⇒ { yaw, v } ｜ null（停港：錨咬著）。fwd(yaw) ＝ [cos, 0, −sin] ⇒ 往 (dx, dz) ＝ atan2(−dz, dx)。
 *  有 path ⇒ 沿航道：期望航速 'cruise'（戰鬥帆）；目標往逆風那一側 ⇒ helmIrons 照舊搶風、方位換邊就換舷（之字形）。 */
function trafficHelm(sh) {
  var n = sh.npc; if (!n || n.dock || n.held) return null;            // held：拖到泊位了、清單還沒說到港（⑧）⇒ 繫著等
  if (n.entry && !n.pilot) { var ce = shipCenter(sh); if (Math.hypot(n.entry[0] - ce[0], n.entry[1] - ce[2]) < TRF_ENTRY_M) { trafficSails(sh, 0); return { yaw: sh.yaw, v: 0 }; } }   // 早到了：在入口停住等塔台放行（⑧）
  var to = n.path ? trafficAhead(sh, n.path) : n.to; if (!to) return null;
  var dx = to[0] - sh.px, dz = to[1] - sh.pz;
  if (Math.hypot(dx, dz) < 30) return { yaw: sh.yaw, v: Math.min(n.path ? 0.5 : n.v, 0.5) };   // 到了航點（航道的盡頭）、下一份清單還沒來 ⇒ 慢慢往前
  return { yaw: Math.atan2(-dz, dx), v: n.path ? 'cruise' : n.v > 0 ? n.v : null };
}
/** 照時刻表滑（⑥；31_sailing.js sailShip 開頭先問）：世界時間比物理快、這艘有 trk、沒在停港 ⇒ 照世界時間在 trk 上內插、直接擺 ⇒ true（sailShip 那一步不再照帆走）；不然 false。
 *  船頭照走的方向轉過去（每秒 TRF_GLIDE_TURN 成；沒在動 ⇒ 不轉）；vel、spd 照這一步走了多遠（航跡、水花照它），spd 夾在 VMAX（快轉時一步走幾百公尺，水花不跟著爆）。 */
/** 這艘正在照時刻表滑（⑥）：海圖塊不等它（08_seabed.js bedNear；快轉一步走幾百公尺 ⇒ 每一步都在等新的塊，量到世界時間慢了 25 倍）、不擱淺、棧橋不推（50_sim.js）。 */
function trafficGliding(sh) { var n = sh.npc; return !!(n && n.trk && !n.dock && !n.held && !n.tow && (n.pilot && n.pilot !== 'dock' || wclkRate() > 1)); }   // 港內（pilot）×1 也照時刻表
function trafficGlide(sh, dt) {
  var n = sh.npc, T = n && n.trk; if (!trafficGliding(sh)) return false;
  if (n.lag == null) n.lag = n.lag0 = trafficLagOf(sh);                // 拖出港之後第一次滑（⑧）：照船現在在時刻表上的哪個時刻接上，落後的那一段 TRF_LAG_T 秒內追平（⛔ 直接照時刻表擺 ⇒ 跳過去幾公里）
  var h = worldSec() / 3600 - n.lag, i = 1;
  if (n.lag > 0) n.lag = Math.max(0, n.lag - n.lag0 * dt / TRF_LAG_T);
  while (i < T.length - 1 && T[i][0] < h) i++;
  var a = T[i - 1], b = T[i], k = clamp((h - a[0]) / Math.max(1e-9, b[0] - a[0]), 0, 1);
  var x = a[1] + (b[1] - a[1]) * k, z = a[2] + (b[2] - a[2]) * k, dx = b[1] - a[1], dz = b[2] - a[2];
  trafficSails(sh, n.pilot && n.pilot !== 'dock' ? 0 : 2);              // 港內收著、港外戰鬥帆（⑧）
  var B = trafficNear(sh, x, z), px0 = sh.px, pz0 = sh.pz; sh.px = x + B.ox; sh.pz = z + B.oz;   // 泊位附近：補上 3D 泊位的差（⑧ 同步）
  if (B.w > 0) {                                                         // 離泊位越近越接近停好的船頭（照位置直接擺：快轉時一樣順）
    var dr = Math.hypot(dx, dz) > 1 ? Math.atan2(-dz, dx) : sh.yaw, e = Math.atan2(Math.sin(B.yaw - dr), Math.cos(B.yaw - dr));
    if (!n.turnSg) n.turnSg = e >= 0 ? 1 : -1;                           // 轉的方向開始時定好（船尾繫泊差 180° ⇒ e 在 ±π 附近換號，⛔ 每一步重挑 ⇒ 船來回甩）
    if (n.turnSg > 0 && e < 0) e += 2 * Math.PI; else if (n.turnSg < 0 && e > 0) e -= 2 * Math.PI;
    sh.yaw = dr + e * B.w;
  } else { n.turnSg = 0; if (Math.hypot(dx, dz) > 1) { var dy = Math.atan2(-dz, dx) - sh.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); sh.yaw += dy * Math.min(1, TRF_GLIDE_TURN * dt); } }
  var v = dt > 0 ? Math.hypot(sh.px - px0, sh.pz - pz0) / dt : 0;     // 同一步切成幾小步（shipPreMove）⇒ 後面幾小步世界時間沒動、走 0 ⇒ 航速留著前一小步的
  if (v > 0 || Math.hypot(dx, dz) <= 1) sh.spd = Math.min(v, VMAX);
  sh.vel = mul(fwd(sh.yaw), sh.spd); sh.yawRate = 0;
  return true;
}
/** 港內港外同步（⑧）：時刻表那一點 (x, z) 離泊位（進港 ＝ 預約的 berth0；出港 ＝ 出發那一格 bOut）多近 ⇒
 *  { ox, oz 要加的差（3D 泊位 − 時刻表泊位，照權重）, yaw 停好的船頭, w 船頭的權重 }。
 *  船頭：離泊位 D0（半個船長 ＋ TRF_CLEAR_M）內照停好的船頭直進直出（船身還貼著棧橋）、D0～D0 ＋ D 之間轉（D ＝ 半個船長 ＋ TRF_SPIN_D，至少 30 m）、再外面照走的方向
 *  ⛔ 一離泊位就開始轉（1 − smoothstep(d ／ 2D)）：49 m 的船還在棧橋邊就繞中心轉，船尾掃進棧橋頭 3.6 m（君士坦丁堡 large-1，Blocksail TASK-0980 log）。 */
function trafficNear(sh, x, z) {
  var n = sh.npc, o = { ox: 0, oz: 0, yaw: 0, w: 0 }, P = null;
  if (n.pilot === 'out' && n.bOut) P = { x: n.bOut.x, z: n.bOut.z, x0: n.bOut.x0, z0: n.bOut.z0, yaw: n.bOut.yaw };
  else if (n.pilot === 'in' && n.berth && n.berth0) P = { x: n.berth.x, z: n.berth.z, x0: n.berth0.x, z0: n.berth0.z, yaw: n.berth.yaw };
  if (!P) return o;
  var half = (sh.T.hx1 - sh.T.hx0) * S / 2, d = Math.hypot(x - P.x0, z - P.z0), sm = function (u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }, D = Math.max(30, half + TRF_SPIN_D), D0 = half + TRF_CLEAR_M;
  var off = Math.hypot(P.x - P.x0, P.z - P.z0), wb = 1 - sm(d / Math.max(TRF_BLEND_M, D0 + D, TRF_BLEND_K * off)); o.ox = (P.x - P.x0) * wb; o.oz = (P.z - P.z0) * wb;   // 差得越遠（港外錨地那一格離外海泊位幾百公尺）補的範圍越長 ⇒ 不一格跳過去
  o.w = 1 - sm((d - D0) / D); o.yaw = P.yaw;
  return o;
}
/** 船現在離時刻表落後幾小時（⑧）：投影到 trk 最近的那一段、那一點的世界時間 ⇒ 現在 − 它（超前 ⇒ 0）；沒有 trk ⇒ 0。
 *  出港那一刻：清單每 TRF_ASK_GLIDE_MS 才來一次，1 秒＝1 小時時看到「出港了」已經晚了半小時（精細層的時刻表走了幾公里）；拖出去的那幾分鐘照 ×1 ⇒ 落後的就是那一段。 */
var TRF_LAG_T = 30;
function trafficLagOf(sh) {
  var T = sh.npc.trk, c = shipCenter(sh), best = Infinity, ht = null;
  if (!T) return 0;
  for (var i = 1; i < T.length; i++) {
    var ax = T[i - 1][1], az = T[i - 1][2], bx = T[i][1] - ax, bz = T[i][2] - az, l2 = bx * bx + bz * bz, u = l2 > 0 ? clamp(((c[0] - ax) * bx + (c[2] - az) * bz) / l2, 0, 1) : 0, d = Math.hypot(ax + bx * u - c[0], az + bz * u - c[2]);
    if (d <= best + 0.5) { var hh = T[i - 1][0] + (T[i][0] - T[i - 1][0]) * u; if (d < best - 0.5 || ht == null || hh > ht) ht = hh; best = Math.min(best, d); }   // 一樣近（停在泊位、入口外等：同一點好幾個時刻）⇒ 取晚的（⛔ 取最早 ⇒ 多算落後 0.28 小時，卡在清單窗口的第一點，一停一跳；TASK-0980 log）
  }
  return ht == null ? 0 : Math.max(0, worldSec() / 3600 - ht);
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
/** 收一艘（往來的船、換回城裡的堡壘 63_towns.js townFortTick）：從 SHIPS 拿掉、後面的序號往前補、瞄著它的放掉、命令與選敵重想。回收了沒有。
 *  記序號的都跟著補：砲彈 b.owner、黏在船上的碎木 D.ship（它身上的直接收掉）、排好的分段齊射 EVENTS e.sh（它的直接拿掉）、旗號 SIGNAL 的集火與排頭。
 *  ⛔ 不補 ⇒ 後面那幾艘的砲彈記到前一艘頭上；黏在它身上的碎木照序號讀到不存在的船 ⇒ 畫面那一格丟例外（60_render.js mainOpaque，堡壘被打過再換回量到的）。
 *  ⚠ 它自己打出去、還在飛的砲彈 b.owner 會指到補上來的那一艘 ⇒ 要緊的（堡壘）先等落地再收。 */
function shipDrop(sh) {
  var k = SHIPS.indexOf(sh); if (k < 0 || k === PLAYER_I) return false;
  SHIPS.splice(k, 1); SHIPS.forEach(function (s, j) { s.i = j; });
  BALLS.forEach(function (b) { if (b.owner > k) b.owner--; });
  for (var i = 0; i < D.n; i++) if (D.st[i] === 2) { if (D.ship[i] === k) { fxKill(i); i--; } else if (D.ship[i] > k) D.ship[i]--; }
  for (i = EVENTS.length - 1; i >= 0; i--) { if (EVENTS[i].sh === k) EVENTS.splice(i, 1); else if (EVENTS[i].sh > k) EVENTS[i].sh--; }
  if (SIGNAL) ['focus', 'lead'].forEach(function (f) { if (SIGNAL[f] === k) SIGNAL[f] = null; else if (SIGNAL[f] > k) SIGNAL[f]--; });
  if (PLAYER_I > k) PLAYER_I--;
  SHIPS.forEach(function (s) { if (s.aimOn === sh) setAim(s, null); });
  if (typeof INFO_SH !== 'undefined' && INFO_SH === sh) INFO_SH = null;
  trafficFree(sh);
  cmdTick(); pickFoes();
  return true;
}
function trafficDrop(sh) { if (shipDrop(sh)) TRF.dropped++; }
/** 換到別的玩法（海戰、建造…）⇒ 全收、佇列清掉。 */
function trafficClear() { trafficShips().forEach(trafficDrop); if (TRF.build) trafficFree(TRF.build.M.sh); TRF.build = null; TRF.q = []; TRF.want = {}; }

/** 畫面迴圈每格叫（90_main.js frame，海圖塊、擺樹之後）：t1 ＝ 背景預算做到幾點（08_seabed.js bedT1）。 */
function trafficPump(t1) {
  if (!trafficOk()) { if (trafficShips().length || TRF.build) trafficClear(); return; }
  trafficRealTick();                                                     // 表演船、真的船（⑨）
  var now = performance.now(), me = SHIPS[PLAYER_I], rate = wclkRate(), ask = rate > 1 ? TRF_ASK_GLIDE_MS : TRF_ASK_MS;
  if (now - TRF.askT > ask && me) {                                      // ① 要清單（wh：開戰以來世界時間走了幾小時；span：照時刻表滑時往後要幾小時的 trk ＝ 兩次要清單之間的兩倍）
    TRF.askT = now; var c = shipCenter(me);
    BED.host.postMessage({ bsmap: 'trafficNeed', x: c[0], z: c[2], tod: todNow(), wh: worldSec() / 3600, span: rate > 1 ? rate * 2 * ask / 1000 / 3600 : 0, max: trafficMax(), mode: MODE }, '*');
  }
  if (now - TRF.clockT > TRF_CLOCK_MS) { TRF.clockT = now; BED.host.postMessage({ bsmap: 'wclock', wh: worldSec() / 3600, hold: trafficPortN() }, '*'); }   // ⑦ 世界時間報給外面那一頁；hold：幾艘在進出港（⑧，> 0 ⇒ 暫時 ×1）
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
  sh.i = SHIPS.length; sh.name = w.name; sh.npc = { id: w.id, kind: w.kind, to: w.to, v: w.v, path: w.path, trk: w.trk, berth: w.berth, entry: w.entry, pilot: w.pilot, dock: false, held: false, tow: null };
  SHIPS.push(sh);
  if (w.flag) shipNation(sh, w.flag);                                    // 掛船隊主人那一國的旗（77_colours.js；外面那一頁給預設旗的 key，不認得 ⇒ 照陣營旗）
  coreSpawned(sh, null); stepShip(sh, 0); survey(sh); pickCaptain(sh); cmdTick(); pickFoes();
  sh.npc.berth = trafficBerthFor(sh, w.berth);                          // 船放上場、有了 M（船寬）才貼平台
  if (!w.dock && (w.path || w.v > 0)) sh.spd = w.path ? VMAX * TRF_V0 : Math.min(w.v, VMAX);   // 照船隊的航速開出來（⛔ 從 0 起步 ⇒ 生出來那幾十秒停在海上）；沿航道的照自己的帆
  if (w.dock) trafficDock(sh, true);                                     // 停港的：生在泊位上（at ＝ 泊位）⇒ 下錨、繫上
  else if (w.pilot) trafficSails(sh, 0);                                 // 生在港內、照時刻表帶著走的（⑧）⇒ 帆收著
  else if (w.berth && Math.hypot(w.berth.x - w.at[0], w.berth.z - w.at[1]) <= TRF_IN_M) sh.spd = Math.min(sh.spd, TRF_TOW_V);   // 生在港裡、正要進港 ⇒ 下一步就拖（trafficTow）
  TRF.built++;
}
/** 讀數（__game.traffic）。 */
function trafficInfo() {
  var me = SHIPS[PLAYER_I], c = me ? shipCenter(me) : [0, 0, 0];
  return { ok: trafficOk(), rate: wclkRate(), wh: +(worldSec() / 3600).toFixed(4), max: trafficMax(), want: Object.keys(TRF.want).length, queue: TRF.q.slice(), building: TRF.build ? TRF.build.id : null, built: TRF.built, dropped: TRF.dropped,
    stepMax: +TRF.stepMax.toFixed(2), stepMs: TRF.stepMs.slice(), place: TRF.place.slice(),
    hold: trafficPortN(),
    ships: trafficShips().map(function (s) { var n = s.npc, T = n.tow, b = n.berth, sc = shipCenter(s); return { i: s.i, id: n.id, kind: n.kind, hull: s.T.id, x: +s.px.toFixed(1), z: +s.pz.toFixed(1), d: Math.round(Math.hypot(s.px - c[0], s.pz - c[2])), spd: +s.spd.toFixed(2), yaw: +s.yaw.toFixed(3), dock: n.dock, held: !!n.held, to: n.to, path: n.path ? n.path.length : 0, trk: n.trk ? n.trk.length : 0, pilot: n.pilot || null, glide: trafficGliding(s), real: !!n.real,
      berth: b ? { x: +b.x.toFixed(1), z: +b.z.toFixed(1), yaw: +b.yaw.toFixed(3), d: +Math.hypot(b.x - sc[0], b.z - sc[2]).toFixed(1) } : null, tow: T ? { kind: T.kind, s: +T.s.toFixed(1), L: +T.L.toFixed(1), spin: T.spin, spun: T.spun, v: +T.v.toFixed(2), t: +(SIMT - T.t0).toFixed(1) } : null }; }) };
}

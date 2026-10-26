// ───────────────────────── 遊戲裡換玩法（TASK-0867；Blocksail：航海 ⇄ 城鎮，之後海戰） ─────────────────────────
// 區塊職責：一場裡換玩法（MODE，04_state.js）不用重載頁面、不回地球儀 —— 海圖塊、城鎮、我艦（位置、船頭、速度、損傷、船員）照舊，只換玩法規則。
//   Tim 2026-10-23「目前是否可以在城鎮模式&航行模式之間切換(多一個按鈕) 當航行模式靠近城市時 可以按下停靠 船會自動停靠並且切換到城鎮模式
//   反過來城鎮模式按下後會切回航海模式」「應該說先做可以換玩法的架構(之後可能還可以切海戰)」。
// 物理意義：
//   ① 入口只有一個 modeSwitch(到哪, o)：准換表（MODE_SW）准不准 ⇒ 開局才讀的規則有沒有不一樣 ⇒ 舊玩法的 leave ⇒ 換 MODE ⇒ 新玩法的 enter ⇒ 介面配置 ⇒ 跟外面那一頁說 'mode'。
//      每一格讀的規則（04_modes.js 的 ui、battleKeys、stopOwn、othersAct、judge、chart、fpLock、town）換掉 MODE 就跟著變；
//      開局才讀的（MODE_START：fleet、origin、autoFire、hint、myReload、build、observe）兩邊不一樣 ⇒ 要那個玩法的 enter 在 handles 裡說它接得住，不然不准（要重開一場）；
//      載入時才做的（87_townbuild.js 的 🔨 綁定、TWB.town）搬進城鎮的 enter（twbBind、TWB.town ＝ 停的那座城）。
//      加一種可以換進來的玩法 ＝ MODE_HOOK 寫 enter／leave ＋ MODE_SW 加一格條件，入口不用改。
//   ② 停靠處（Blocksail 範圍層的 dock，TOWN_BUILD §3.3）：城鎮到了就跟外面那一頁要（'docksNeed' ⇒ 'docks'；海域座標 ⇒ 減 BED.ax／az 是世界座標）。
//      ⛔ 不寫死「一座城一個停靠處」（Tim 2026-10-23「之後有考慮支援擴充 城鎮可以有多個城區(例如君堡) 每個城區可以有自己的棧橋」）：一座城一份清單、每一處各自算。
//   ③ 停靠鈕（航海）：我艦在那座城的範圍裡（或在那一處的進港航道上 —— 大城的範圍貼著海岸畫，港內水面不在範圍裡）、那一處附近 DOCK_NEAR 公尺內的地面區（棧橋、碼頭的帶子）都建好、城的實例是完整那一份
//      （Tim「進城鎮範圍 且已經載入完城鎮資訊」「包含城牆 建築 棧橋等」「分區載入的大城只要停靠處附近那幾區…擺完」）⇒ 才出現；沒載完 ⇒ 不出現。
//   ④ 自動停靠（Tim「照進港航道自動開進去（看得到船開過去）」；2026-10-24「應該按下停靠後就切過去 讓船自己停靠」⇒ 按下就換成城鎮模式（🔨 馬上能用），
//      船在城鎮模式裡自己開進去 —— 以前要轉到停好的船頭才換，風、水流推著轉不到就一直停在航海）：先開到航道上接得進去的那一點（離船＋沿航道到停靠處最短）、再沿航道開到停靠處；
//      船照常受風、浪、碰撞，靠舵轉向；航速照期望航速調帆（54_helm.js helmGovern），另外有小艇拖帶（DOCK_TOW：慢到 DOCK_VMIN 以下推一把、太快拉住 —— 史料：進出港靠小艇拖、絞錨），
//      到了停靠處 DOCK_ARRIVE 公尺內 ⇒ 兩錨都下、繞錨轉到停好的船頭（最多 DOCK_TURN_T 秒）⇒ 停好。中途按 ✋ ⇒ 取消、停在原地、換回航海。
//   ⑤ 出航（城鎮）：起錨、換回航海、沿同一條航道開到外端才交還操舵（中途打舵 ⇒ 馬上交還）。
//   ⑥ 回地球儀：'left' 帶 mode、town、berth（03_camera.js camTrans）⇒ 地球儀知道停在哪座城的哪一處。
// 失敗處置：不准換 ⇒ modeSwitch 回原因（字串），畫面上說一聲；外面那一頁沒給停靠處（舊的地球儀、沒有 dock 的城）⇒ 沒有停靠鈕。
// 接海戰（本單不做，留接口）：MODE_SW.sail.pve 的條件（附近有敵艦）＋ MODE_HOOK.pve 的 enter（生敵艦：52_fleet.js spawnFleet 的敵方那一半、判勝負重設 61_hud.js、
//   自動開砲的預設 70_flow.js）、leave（敵艦退場或沉了才准換回）；handles 要接住 fleet、hint、autoFire（開局才讀的那三條）。
var MODE_START = ['fleet', 'origin', 'autoFire', 'hint', 'myReload', 'build', 'observe'];   // 開局才讀的規則（04_modes.js；以前只在 70_flow.js 開一場時讀）
var DOCK_NEAR = 400, DOCK_ARRIVE = 14, DOCK_PASS = 30, DOCK_HDG_OK = 3, DOCK_TURN_T = 45;   // 公尺：停靠處附近幾公尺的地面區要建好（佔位，Tim「動工時照 TASK-0817 的分區算」）、
                                                                                           //   到了（開始下錨）、航道上的點幾公尺內算過了；轉到停好的船頭差幾度算好、最多轉幾秒（風、水流推著轉不到 ⇒ 照現在的船頭停著）
var DOCK_VMAX = 3.2, DOCK_VMIN = 0.7, DOCK_SLOW = 200, DOCK_TOW = 0.18, DOCK_STALL = 60;   // 剩 DOCK_SLOW 公尺以內的期望航速 m/s（從 VMAX 降到 VMIN；更遠 ⇒ 全速）、小艇拖帶最多加減速 m/s²、卡住幾秒放棄
var DOCK_LANE = 60, DOCK_SIMX = 4, DOCK_RANGE_K = 2, DOCK_BACK = 60;
var DOCK_AV = [2, 8], DOCK_AEND = 120, DOCK_ATURN = 80, DOCK_PULL = 3, DOCK_AX = 4;                       // 停靠的過場：航速（m/s，夾在這兩個之間）、最後幾公尺減速到 DOCK_VMIN、最後幾公尺轉到停好的船頭、拉回航線、過場快幾倍
// DOCK_AX（Tim 2026-10-25「讓城鎮模式下 時間跟航海模式一樣 按照1:1時間流速(1秒等於1秒)」）：以前停靠那一段把模擬調成 ×DOCK_SIMX ⇒ 按停靠就是城鎮模式，那幾分鐘城裡的時間（太陽、鎮民）也 ×4；
//   ⇒ 停靠過場不動模擬速度，改成過場自己沿航線走 DOCK_AX 倍快（航速與拉回航線的彈簧一起乘，看起來跟以前一樣快）。出航（航海模式）照舊 ×DOCK_SIMX。的強度（每秒）                                                         // 船已經在航道上（離某一段 ≤ DOCK_LANE 公尺）⇒ 從那一段接、不先退回外面那一點；
                                                                                           //   範圍照重心放大 DOCK_RANGE_K 倍（Tim 2026-10-24「城鎮判定範圍更大一點(可以放大兩倍範圍試試)」；同時在兩座城裡 ⇒ 照離停靠處的距離挑）；
                                                                                           //   最後一段停靠處在船後面 DOCK_BACK 公尺內 ⇒ 倒車退回去（Tim「自動停靠需要能控制船的前進後退」）
                                                                                           //   自動開那一段模擬 ×DOCK_SIMX（73_slowmo.js 的模擬速度；玩家自己調過 ⇒ 不動）—— 航道 1～2.5 km，×1 要三、四分鐘
var MODE_SW = {
  // 從 ⇒ 到：條件 (o) ⇒ null（准）或原因
  sail: { town: function (o) { if (!o || !o.dock) return '先按 🏘 停靠（自動開進停靠處）'; var r = dockReady(); return r.dock === o.dock ? null : r.why || '不是這一處'; } },   // 按停靠就換（Tim 2026-10-24「應該按下停靠後就切過去 讓船自己停靠」）
  town: { sail: function () { return null; } }
};
var MODE_HOOK = {
  town: {
    handles: [],
    enter: function (o, from) {
      var d = o && o.dock;
      if (d) { TWB.town = d.town; DOCK.here = d; }
      if (d && o.go) dockGo('in', d);                                      // 船在城鎮模式裡自己滑進停靠處（過場 dockPull；31_sailing.js：自動開中不照 stopOwn 停）
      if (from) {                                                        // 換進來 ⇒ 鏡頭對著停靠處（87_townbuild.js twbFrameDock）、不跟船（⛔ 跟著 ⇒ 船開進來那一段把鏡頭帶到海上；城鎮模式 03_camera.js 本來就不跟）；出航時還原跟船的設定
        DOCK.cam = { mode: CAM.mode, dist: CAM.dist, yaw: CAM.yaw, pitch: CAM.pitch, track: CAM.track, aoff: CAM.aoff }; TWB.framed = false;
        camSet({ track: false, trYaw: null, trMe: null });
      }
      twbBind();
      if (o && o.go && !TWB.on) twbToggle(true);                          // 按停靠 ⇒ 直接進建築模式（Tim 2026-10-24「按下停靠後 就直接進到建造模式」）
    },
    leave: function () {
      if (DOCK.run && DOCK.run.kind === 'in') dockStop(null);              // 還在開進去 ⇒ 停在原地
      if (TWB.on) twbToggle(false); TWB.start = null; TWB.tr = null;
      var el = $('twbTown'); if (el) { el.textContent = ''; el.classList.remove('on'); }   // 城名那一行（87_townbuild.js twbTitle 只在城鎮模式寫）⇒ 出航時收掉
    }
  },
  sail: {
    handles: [],
    enter: function (o, from) {
      if (from === 'town') {
        var c = DOCK.cam || { mode: 4, dist: 78, yaw: CAM.yaw, pitch: 0.24, track: true, aoff: 0.35 };   // 直接從城鎮模式開的（沒有換進來前的鏡頭）⇒ 跟船（同 camCycle 的 4）
        camSet({ mode: c.mode, dist: c.dist, yaw: c.yaw, pitch: c.pitch, track: c.track, aoff: c.aoff, follow: null, pan: [0, 0], see: null }); DOCK.cam = null;
      }
      if (o && o.out && DOCK.here) dockGo('out', DOCK.here);
    },
    leave: function () { dockStop(null); }
  }
};
var DOCK = { towns: {}, asked: {}, okd: {}, here: null, run: null, cam: null, why: '', btn: '' };   // okd：哪幾處附近擺完過   // towns：{ 城: { ring, docks } }（世界座標）；here：停在哪一處；run：自動開的那一段

/** 現在能不能換到 to ⇒ null（准）或原因。 */
function modeWhy(to, o) {
  if (to === MODE) return '已經是' + (MODE_RULES[to] || {}).name;
  var f = MODE_SW[MODE] && MODE_SW[MODE][to];
  if (!f || !MODE_RULES[to]) return (MODE_RULES[MODE] || {}).name + ' ⇒ ' + ((MODE_RULES[to] || {}).name || to) + ' 還沒接（要重開一場）';
  if (!RUNNING) return '還沒開始';
  var A = MODE_RULES[MODE], B = MODE_RULES[to], H = MODE_HOOK[to] || {};
  var bad = MODE_START.filter(function (k) { return A[k] !== B[k] && (H.handles || []).indexOf(k) < 0; });
  if (bad.length) return '開局才讀的規則不一樣（' + bad.join('、') + '），' + B.name + ' 的 enter 還沒接住 ⇒ 要重開一場';
  return f(o) || null;
}
/** 換玩法的唯一入口 ⇒ null（換了）或原因（沒換）。o：給新舊玩法的 enter／leave（城鎮：{ dock }；航海：{ out }）。 */
function modeSwitch(to, o) {
  var why = modeWhy(to, o); if (why) return why;
  var from = MODE, A = MODE_HOOK[from] || {}, B = MODE_HOOK[to] || {};
  if (A.leave) A.leave(o, to);
  flowMode(to);
  if (B.enter) B.enter(o, from);
  uiLayout();
  var me = SHIPS[PLAYER_I]; if (me) note(me, '換成' + MODE_RULES[to].name + (to === 'town' && DOCK.here ? '：' + dockTownName(DOCK.here.town) : ''));
  bedHostSay('mode', modeReport());
  return null;
}
/** 給外面那一頁（'mode'、'left'）：現在是什麼玩法、停在哪座城的哪一處。 */
function modeReport() { var h = MODE === 'town' ? DOCK.here : null; return { mode: MODE, town: MODE === 'town' ? TWB.town : null, berth: h ? h.id : null }; }
function dockTownName(id) { var T = null; (TOWNS.list || []).forEach(function (t) { if (t.id === id) T = t; }); return T && T.name || id; }

// ── 停靠處：城鎮到了就要（'docksNeed' ⇒ 08_seabed.js 轉 'docks' 給 dockGot） ──
function dockAsk() {
  if (!BED || !BED.host || !TOWNS.list) return;
  var ids = TOWNS.list.map(function (T) { return T.id; }).filter(function (id) { return !DOCK.asked[id]; });
  if (!ids.length) return;
  ids.forEach(function (id) { DOCK.asked[id] = 1; });
  BED.host.postMessage({ bsmap: 'docksNeed', towns: ids }, '*');
}
/** 外面那一頁回的：[{ town, ring: [[e, s]…], docks: [{ id, kind, at: [e, s], hdg, depth, path: [[e, s]…]（第一點 ＝ at、最後一點在外海）, area? }] }]（海域座標）。 */
function dockGot(L) {
  (L || []).forEach(function (t) {
    function W(q) { return [q[0] - BED.ax, q[1] - BED.az]; }
    DOCK.towns[t.town] = { ring: dockGrow((t.ring || []).map(W), DOCK_RANGE_K), docks: (t.docks || []).map(function (d) {
      return { id: d.id, town: t.town, area: d.area || null, kind: d.kind, depth: d.depth, hdg: d.hdg, yaw: Math.PI / 2 - d.hdg / 57.2958, at: W(d.at), path: (d.path || []).map(W) };
    }) };
  });
  var T = MODE === 'town' && !DOCK.here && DOCK.towns[TWB.town], me = SHIPS[PLAYER_I];   // 直接從城鎮模式開的（?mode=town&town=）：停在那座城離我艦最近的那一處（出航要它的航道）
  if (T && me) {
    var c = shipCenter(me), bd = Infinity; T.docks.forEach(function (d) { var dd = Math.hypot(d.at[0] - c[0], d.at[1] - c[2]); if (dd < bd) { bd = dd; DOCK.here = d; } });
    if (DOCK.here && bd < MOOR_SNAP && !DOCK.run) moorAt(me, DOCK.here);   // 開場就停在泊位上（地球儀「進入城鎮」）⇒ 繫在那一處（32_quay.js）
  }
}
/** 範圍照重心（多邊形的面積重心；退化 ⇒ 頂點平均）放大 k 倍。 */
function dockGrow(R, k) {
  if (R.length < 3 || k === 1) return R;
  var A = 0, cx = 0, cz = 0;
  for (var i = 0, j = R.length - 1; i < R.length; j = i++) { var f = R[j][0] * R[i][1] - R[i][0] * R[j][1]; A += f; cx += (R[j][0] + R[i][0]) * f; cz += (R[j][1] + R[i][1]) * f; }
  if (Math.abs(A) < 1e-6) { cx = 0; cz = 0; R.forEach(function (q) { cx += q[0] / R.length; cz += q[1] / R.length; }); } else { cx /= 3 * A; cz /= 3 * A; }
  return R.map(function (q) { return [cx + (q[0] - cx) * k, cz + (q[1] - cz) * k]; });
}
function dockInRing(R, x, z) {
  var c = false; for (var i = 0, j = R.length - 1; i < R.length; j = i++) { var a = R[i], b = R[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
/** 那一處附近的城鎮資訊擺完了沒 ⇒ null 或還在等什麼（城的實例是完整那一份、DOCK_NEAR 內的地面區都建好）。 */
function dockLoadedWhy(d) {
  var T = null; (TOWNS.list || []).forEach(function (t) { if (t.id === d.town) T = t; });
  if (!T) return '城鎮還沒到';
  if (!T.inst || !TOWNS.kit || TOWNS.kit.part) return '建築還在擺';
  if (!T.gt) return '地面還沒分區';
  var S = TOWN_GT_SZ, x = d.at[0] + BED.ax, z = d.at[1] + BED.az, n = 0;
  for (var k in T.gt) {
    var p = k.split('_'), ex = Math.max(+p[0] * S - x, 0, x - (+p[0] + 1) * S), ez = Math.max(+p[1] * S - z, 0, z - (+p[1] + 1) * S);
    if (Math.hypot(ex, ez) > DOCK_NEAR) continue;
    if (!T.gt[k].g || T.gt[k].dirty) return '停靠處附近的地面還在建'; n++;
  }
  return null;
}
/** 航海裡現在能不能按停靠 ⇒ { dock } 或 { why }：我艦在哪座城的範圍裡、哪一處（最近的）、那一處附近擺完了沒。 */
function dockReady() {
  var me = SHIPS[PLAYER_I]; if (!me || me.sunk) return { why: '沒有我艦' };
  if (!BED || !BED.host) return { why: '要從 Blocksail 地球儀開' };
  var c = shipCenter(me), best = null, bd = Infinity, why = '不在城鎮範圍裡';
  for (var id in DOCK.towns) {
    var T = DOCK.towns[id], inR = dockInRing(T.ring, c[0], c[2]);
    T.docks.forEach(function (d) {                                       // 範圍裡、或在那一處的進港航道上（大城的範圍貼著海岸畫：君士坦丁堡停靠處外 150 m 的金角灣就不在範圍裡）
      if (!inR && dockLaneAt(d, c) < 0) return;
      var dd = Math.hypot(d.at[0] - c[0], d.at[1] - c[2]); if (dd < bd) { bd = dd; best = d; }
    });
    if (inR && !T.docks.length && !best) why = '這座城沒有停靠處';
  }
  if (!best) return { why: why };
  var key = best.town + '/' + best.id;                                   // 那一處擺完過一次就算數（大城的地面區照收塊一直重建 ⇒ 條件時有時無，鈕會閃、按下去那一刻又不准）
  if (!DOCK.okd[key]) { var lw = dockLoadedWhy(best); if (lw) return { why: lw, dock: null, wait: best }; DOCK.okd[key] = 1; }
  return { dock: best };
}

// ── 自動開：'in' 停靠（沿航道開進去 ⇒ 下錨 ⇒ 繞錨轉 ⇒ 城鎮模式）、'out' 出航（沿航道開出去 ⇒ 交還操舵） ──
/** 船在那一處的航道上 ⇒ 第幾段（離那一段 ≤ DOCK_LANE 公尺；停靠處那一端先看）；不在 ⇒ −1。 */
function dockLaneAt(d, c) {
  var P = d.path;
  for (var j = 0; j + 1 < P.length; j++) {
    var ax = P[j + 1][0] - P[j][0], az = P[j + 1][1] - P[j][1], L2 = ax * ax + az * az || 1, u = ((c[0] - P[j][0]) * ax + (c[2] - P[j][1]) * az) / L2;
    if (u >= 0 && u <= 1 && Math.hypot(P[j][0] + ax * u - c[0], P[j][1] + az * u - c[2]) <= DOCK_LANE) return j;
  }
  return Math.hypot(d.at[0] - c[0], d.at[1] - c[2]) <= DOCK_LANE ? 0 : -1;
}
/** 航道上從哪一點接進去：離船的距離 ＋ 沿航道到停靠處最短（同 Blocksail globe.html dockCut；第一點 ＝ 停靠處本身不算，除非航道只有一點）。 */
function dockEntry(d, c) {
  var P = d.path, along = [0], best = P.length - 1, bc = Infinity;
  var ln = dockLaneAt(d, c); if (ln >= 0) return ln;                    // 已經在航道上 ⇒ 從那一段往停靠處開（⛔ 照下面那一套：泊位前 90 m 也會先退回航道第二點）
  for (var k = 1; k < P.length; k++) along.push(along[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  for (var i = P.length > 1 ? 1 : 0; i < P.length; i++) { var v = along[i] + Math.hypot(P[i][0] - c[0], P[i][1] - c[2]); if (v < bc - 1e-9) { bc = v; best = i; } }
  return best;
}
function dockGo(kind, d) {
  var me = SHIPS[PLAYER_I]; if (!me || !d || !d.path.length) return '沒有航道';
  var pts;
  if (kind === 'in') {                                                   // 停靠 ＝ 過場（Tim 2026-10-24「船停靠直接靠半過場動畫(就是直接無視船的物理模擬 畫好路線直接停好)」「只考慮航速就好」）
    var c0 = shipCenter(me), e = dockEntry(d, c0), A = [[c0[0], c0[2]]].concat(d.path.slice(0, e + 1).reverse()), cum = [0];
    A[A.length - 1] = quayBerthAt(me, d.id, d.at);   // 最後一點（＝ at）：大船以上的泊位照船寬貼平台（32_quay.js，TASK-0962）；航道其他點照舊走船道中線
    for (var i = 1; i < A.length; i++) cum.push(cum[i - 1] + Math.hypot(A[i][0] - A[i - 1][0], A[i][1] - A[i - 1][1]));
    if (anchorsOf(me) && me.anc) { anchorToggle(me, 'P', false); anchorToggle(me, 'S', false); } me.ancMode = false; if (SAIL === 'off') setSailMode('manual');
    DOCK.run = { kind: 'in', anim: true, d: d, A: A, cum: cum, L: cum[cum.length - 1], s: 0, v0: clamp(Math.max(Math.abs(me.spd), me.vCruise || 0), DOCK_AV[0], DOCK_AV[1]), y0: me.yaw, phase: 'go', k: 0, pts: A, left: cum[cum.length - 1], sail: SAIL, simx: false };   // simx：城鎮模式不調模擬速度（DOCK_AX）
    note(me, '🏘 停靠 ' + dockTownName(d.town) + '：沿進港航道開進停靠處（按 ✋ 取消）');
    return null;
  }
  pts = d.path.slice(1);
  if (!pts.length) pts = [d.at];
  DOCK.run = { kind: kind, d: d, pts: pts, k: 0, phase: 'go', t0: SIMT, best: Infinity, bestT: SIMT, sail: SAIL, simx: SIM_SPEED === 1 && DOCK_SIMX > 1 };
  if (DOCK.run.simx) simSpeedSet(DOCK_SIMX);
  me.sailHand = me.teleHand = false;                                     // 帆、俥鐘都交給自動開（玩家自己撥過俥鐘、倒車中 ⇒ 以前艦長不碰引擎，船照樣往後退）
  if (kind === 'in') { if (SAIL === 'off') setSailMode('manual'); note(me, '🏘 停靠 ' + dockTownName(d.town) + '：沿進港航道開進去（再按一次、打舵或動帆 ⇒ 取消）'); }
  else note(me, '⛵ 出航：起錨、沿航道開出去（打舵 ⇒ 馬上交還操舵）');
  return null;
}
/** 停靠的過場（31_sailing.js sailShip：物理照跑、位置算完之後叫）：航線上「現在該在的那一點」照航速往前走（最後 DOCK_AEND 公尺減速），
 *  船頭順著路線、最後 DOCK_ATURN 公尺轉到停好的船頭；船的位置、船頭每一步用強彈簧（DOCK_PULL，每秒）拉過去 ⇒ 浪照樣晃、航跡照樣有，
 *  風、碰撞、水深推不開它（Tim 2026-10-24「可以讓物理維持(讓船仍然會晃) 但是有強大的力讓船直接按照畫好的航線停靠」）。走完、拉到了 ⇒ 停住（城鎮模式的 stopOwn 下一步兩錨都下）。 */
function dockPull(sh, dt) {
  var R = DOCK.run; if (!R || !R.anim || sh.i !== PLAYER_I) return;
  var left = R.L - R.s, v = (left < DOCK_AEND ? DOCK_VMIN + (R.v0 - DOCK_VMIN) * left / DOCK_AEND : R.v0) * DOCK_AX;   // × DOCK_AX：過場自己快（模擬照 ×1）
  R.s = Math.min(R.L, R.s + v * dt); R.left = R.L - R.s;
  var A = R.A, k = 1; while (k < A.length - 1 && R.cum[k] < R.s) k++;
  var a = A[k - 1], b = A[k], seg = R.cum[k] - R.cum[k - 1], u = seg > 1e-6 ? (R.s - R.cum[k - 1]) / seg : 1, x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
  var ty = seg > 1e-6 ? Math.atan2(-(b[1] - a[1]), b[0] - a[0]) : sh.yaw;   // 順著路線（fwd(yaw) ＝ [cos, −sin]）
  if (R.left < DOCK_ATURN) { var w = 1 - R.left / DOCK_ATURN, dy = Math.atan2(Math.sin(R.d.yaw - ty), Math.cos(R.d.yaw - ty)); ty += dy * w * w * (3 - 2 * w); }
  var g = Math.min(1, DOCK_PULL * DOCK_AX * dt), c = shipCenter(sh), ex = x - c[0], ez = z - c[2];
  sh.px += ex * g; sh.pz += ez * g;                                     // 照船的中心拉（停靠處的 at 是船的中心）
  var dyw = Math.atan2(Math.sin(ty - sh.yaw), Math.cos(ty - sh.yaw)); sh.yaw += dyw * g; sh.yawRate = 0;
  sh.spd = R.left > 0 ? v : 0; sh.vel = mul(fwd(sh.yaw), sh.spd); R.k = k;
  if (R.left <= 0 && Math.hypot(ex, ez) < 1 && Math.abs(dyw) < 0.02) { dockStop('停好了'); moorAt(sh, R.d); }   // 停好了 ⇒ 繫在停靠處（32_quay.js；以前只剩兩錨，繞錨漂到棧橋外）
}
/** 停掉自動開（why ⇒ 說一聲）。 */
function dockStop(why) {
  var R = DOCK.run; DOCK.run = null;
  if (R) DOCK.last = { kind: R.kind, why: why || '', phase: R.phase, k: R.k, left: R.left == null ? null : Math.round(R.left), t: +SIMT.toFixed(1) };   // 讀數（__game.mode().last）：上一段自動開怎麼結束的
  if (R && R.simx && SIM_SPEED === DOCK_SIMX) simSpeedSet(1);         // 自動開時調快的模擬速度還原（玩家中途自己調過 ⇒ 照他的）
  if (R && why) { var me = SHIPS[PLAYER_I]; if (me) note(me, why); }
}
/** sailShip 問：這艘是不是自動開中的我艦（31_sailing.js：走艦長那一段、照期望航速調帆、不讓艦長的接管航行改航向）。 */
function dockOn(sh) { return !!DOCK.run && sh.i === PLAYER_I; }
/** 31_sailing.js：自動停靠到了、要停住（兩錨都下）。 */
function dockHold(sh) { return dockOn(sh) && DOCK.run.phase === 'turn'; }
/** 31_sailing.js 繞錨原地轉：轉到停好的船頭（左右 ＝ yaw 變大／變小） ⇒ −1、0、1。 */
function dockPivot(sh) {
  if (!dockHold(sh)) return 0;
  var e = Math.atan2(Math.sin(DOCK.run.d.yaw - sh.yaw), Math.cos(DOCK.run.d.yaw - sh.yaw));
  return Math.abs(e) * 57.2958 <= DOCK_HDG_OK ? 0 : e > 0 ? 1 : -1;
}
/** 艦長那一段（31_sailing.js）：航向、期望航速 ⇒ { yaw, v }。 */
function dockHelm(sh) {
  var R = DOCK.run, c = shipCenter(sh), P = R.pts;
  while (R.k < P.length - 1 && Math.hypot(P[R.k][0] - c[0], P[R.k][1] - c[2]) < DOCK_PASS) R.k++;   // 到了這一點附近 ⇒ 下一點
  var q = P[R.k], dx = q[0] - c[0], dz = q[1] - c[2], left = Math.hypot(dx, dz);
  for (var i = R.k + 1; i < P.length; i++) left += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  R.left = left;
  var v = R.kind === 'in' && left < DOCK_SLOW ? clamp(DOCK_VMIN + (DOCK_VMAX - DOCK_VMIN) * left / DOCK_SLOW, DOCK_VMIN, DOCK_VMAX) : Infinity;   // 遠 ⇒ 全速（54_helm.js helmGovern）
  var to = Math.atan2(-dz, dx), off = Math.atan2(Math.sin(to - sh.yaw), Math.cos(to - sh.yaw));
  if (R.kind === 'in' && R.k === P.length - 1 && left < DOCK_BACK && Math.abs(off) > 1.75) return { yaw: to + Math.PI, v: -DOCK_VMIN };   // 停靠處在船後面（開過頭）⇒ 船尾對著它倒車（有引擎照俥鐘倒車、沒有 ⇒ 小艇拖）
  return { yaw: to, v: v };
}
/** 小艇拖帶（31_sailing.js，航速換成速度之前）：慢到期望航速 DOCK_VMIN 以下、或比期望快 ⇒ 每秒最多 DOCK_TOW m/s 往期望航速拉（逆風也開得進去、停得住）。 */
function dockTow(sh, dt) {
  var R = DOCK.run; if (!R || R.anim || R.phase !== 'go' || sh.wantV == null || anchorHeld(sh)) return;
  var want = sh.wantV;
  if (want < 0) { if (sh.spd > want) sh.spd = Math.max(want, sh.spd - DOCK_TOW * dt); return; }   // 倒車：往後拖到期望（不夠快的引擎、只有帆的船）
  var lo = Math.min(want, DOCK_VMIN);
  if (sh.spd < lo) sh.spd = Math.min(lo, sh.spd + DOCK_TOW * dt);       // 慢、或還在往後退 ⇒ 往前推
  else if (sh.spd > want + 0.3) sh.spd = Math.max(want, sh.spd - DOCK_TOW * dt);
}
/** 每一格（畫面時間）：打舵、動帆 ⇒ 取消；到了 ⇒ 下錨、轉船頭、換城鎮模式；出航開到外端 ⇒ 交還；卡住 ⇒ 放棄。 */
function dockTick() {
  var R = DOCK.run, me = SHIPS[PLAYER_I]; if (!R || !me) return;
  if (me.sunk) { dockStop('船沉了'); return; }
  if (R.anim) return;                                                    // 過場：只有 ✋ 取消（dockAct）
  if (KEYS.l || KEYS.r || KEYS.sw) { dockStop(R.kind === 'in' ? '取消停靠（打舵、動帆）' : '交還操舵'); return; }
  if (R.phase === 'go') {
    var left = R.left == null ? Infinity : R.left;
    if (left < R.best - 5 || anchorHeld(me)) { R.best = Math.min(R.best, left); R.bestT = SIMT; }   // 錨還咬著（起錨中）不算卡住
    if (SIMT - R.bestT > DOCK_STALL) { dockStop((R.kind === 'in' ? '停靠' : '出航') + '卡住了（' + DOCK_STALL + ' 秒沒前進）—— 停在這裡、交還操舵'); return; }
    if (R.kind === 'in' && R.k === R.pts.length - 1 && left <= DOCK_ARRIVE) { R.phase = 'turn'; R.tTurn = SIMT; note(me, '到了：兩錨都下、轉到停好的船頭'); }
    else if (R.kind === 'out' && R.k === R.pts.length - 1 && left <= DOCK_PASS) dockStop('出了航道：交還操舵');
    return;
  }
  if (R.phase === 'turn' && anchorHeld(me) && Math.abs(me.spd) < 0.6 && (!dockPivot(me) || SIMT - R.tTurn > DOCK_TURN_T)) { dockStop('停好了'); me.moor = { x: null }; }   // 已經是城鎮模式（按停靠就換了）⇒ 錨照 stopOwn 留著；繫在停好的那一點（32_quay.js moorPull 第一步照當下記）
}
/** 下排的 🏘／⛵ 那一顆、快捷鍵（66_keys.js dock）：航海 ⇒ 停靠（自動開中 ⇒ 取消）；城鎮 ⇒ 出航。 */
function dockAct() {
  var me = SHIPS[PLAYER_I]; if (!me) return;
  if (MODE === 'town' && DOCK.run && DOCK.run.kind === 'in') { var c = modeSwitch('sail'); if (!c) note(me, '取消停靠：停在原地、換回航海'); return; }   // 開進去途中 ⇒ 取消
  if (MODE === 'town') { var w = modeSwitch('sail', { out: true }); if (w) note(me, '出航不了：' + w); return; }
  if (DOCK.run) { dockStop('交還操舵'); return; }
  var r = dockReady();
  if (!r.dock) { note(me, '停靠不了：' + r.why); return; }
  var g = modeSwitch('town', { dock: r.dock, go: true }); if (g) note(me, '停靠不了：' + g);
}
/** 那一顆看不看得見、寫什麼（每格；配置准不准看得見照 61_layout.js 的 kDock）。航海：停靠鈕只有準備好了才出現（Tim「沒載完 ⇒ 不出現」）、自動開中照樣在（按了取消）。 */
function dockBtn() {
  var b = $('dockK'); if (!b) return;
  var s, show;
  if (MODE === 'town') { show = !!(BED && BED.host); s = DOCK.run && DOCK.run.kind === 'in' ? 'stop' : 'out'; }
  else if (MODE === 'sail') { var r = DOCK.run ? null : dockReady(); DOCK.why = r ? r.why || '' : ''; show = !!DOCK.run || !!(r && r.dock); s = DOCK.run ? 'stop' : 'in'; }
  else show = false;
  if (!show) s = '';
  if (s === DOCK.btn) return;
  DOCK.btn = s; b.classList.toggle('dkOff', !show);
  if (!show) return;
  var I = { in: ['🏘', '停靠：沿進港航道自動開進停靠處、換成城鎮模式'], stop: ['✋', '取消停靠（停在原地、換回航海）'], out: ['⛵', '出航：起錨、換回航海、沿航道開出去'] }[s];
  b.querySelector('.em').textContent = I[0]; b.dataset.tip = I[1];
}
ctrlAdd({ name: 'modesw', pri: 1, on: function () { return false; },
  frame: function () { if (!RUNNING) return; dockAsk(); dockTick(); dockBtn(); }
});

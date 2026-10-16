// ───────────────────────── 第一人稱（TASK-0649） ─────────────────────────
// Tim 2026-10-16：「切換第一人稱模式功能(多一個Toggle按鈕 切換後就可以操控船長在船上自由移動)」「放在設定內」
//   「第一人稱下 下方操作面板隱藏 改為第一人稱用的操作面板(要能移動 旋轉視角等)」「只保留設定紐 暫停紐」；之後的建造模式（TASK-0648）由這一套衍生。
// 操控的是我艦的船長（每艘船第一個軍官，40_crew.js ART_CAPTAIN）：位置照舊是船的格座標（c.pos：腳底那一格），跟著船搖。
//   走：每一步照現在的格子（sh.grid，打掉的地板就站不住）用 standZ 找腳下 ⇒ 往上 FP_UP、往下 FP_DOWN 格內站得住、頭上 FP_HEAD 格空才走得過去；
//   中心那一柱要站得住（⇒ 不從艙口掉下去）、身體半徑 FP_R 格的四個角只擋牆 ⇒ 不穿牆、走不出舷牆。⚠ 不擋模型（砲、桶）：模型不是格子。
//   平滑（Tim 2026-10-16「需要更平滑的移動 以及可以跨越一定高低差(且不要抖動)」）：速度有加減速（FP_ACC／FP_DEC 秒）；
//   腳底 c.pos[2] 照舊是整格（survey 判腳下要用），鏡頭的眼高 FP.ez 另外平滑地追（FP_EZ 秒）⇒ 跨台階、頭頂變低不會一格一格跳。
//   梯子：照雕刻的固定點（42_hands.js shipLadders：foot／lo／hi／head），走到梯腳或梯頭旁邊 ⇒ E（或面板的 🪜）沿那條線爬。
//   看：鏡頭在眼睛（腳底往上 FP_EYE 格，頭頂低就壓低），yaw／pitch 是相對船的（船轉，視線跟著轉）；地平線照世界的上方（不跟著船橫搖）。
// 只在畫面這一層跑（frame，90_main.js）：⛔ 不抽 rnd()、不碰模擬的狀態（除了船長自己的位置）⇒ 不開第一人稱時戰局逐位元組相同。
//   停格、設定打開（PAUSED）時只能轉頭、不能走。
// 自動退出：船長倒下、落水、死了、我艦沉了、換了一艘我艦（playerHandoff）、重新開始、回主選單。
var FP = { on: false, sh: null, c: null, yaw: 0, pitch: 0, mv: { f: 0, b: 0, l: 0, r: 0, tl: 0, tr: 0, lu: 0, ld: 0 }, run: false, climb: null, near: null, lads: null, v: [0, 0], ez: null, jz: 0, jv: 0, joy: [0, 0], fol: null, folP: null, lookT: 0 };
// 跟隨船員（Tim 2026-10-16「加一個 跟隨船員(把第一人稱鏡頭綁到附近船員上)」）：FP.fol ＝ 被跟的人 —— 鏡頭在他的眼睛、他照常做自己的工作（⛔ 不設 c.fp）、
//   玩家只能轉頭；自己的身體停在原地（c.fp 照舊）。F 跟隨／回來、G 換下一個（照離自己由近到遠輪）；被跟的人落水、倒下 ⇒ 回到自己。
// FP_R：身體半徑（格）—— Tim 2026-10-16「只要判定不會穿牆就好 身體碰撞窄一點(目前會下不了憲法號樓梯)」⇒ 1.5 → 0.6（6 cm：只擋牆，踏板之間擠得進去）
var FP_EYE = 16, FP_SP = 14, FP_RUN = 2, FP_TURN = 1.8, FP_R = 0.6, FP_CLIMB = 8, FP_REACH = 9, FP_FOV = 1.15;
var FP_UP = 6, FP_DOWN = 8, FP_ACC = 0.12, FP_DEC = 0.08, FP_EZ = 0.09;   // 跨得上 0.6 m、踩得下 0.8 m（更深 ⇒ 擋住，不會從艙口掉下去）；加速／減速／眼高的時間常數（秒）
var FP_G = 98, FP_JUMP = 5;                                           // 重力 9.8 m/s²（格／秒²）、跳 0.5 m
// FP_HEAD：站得住要頭上幾格空 —— Tim 2026-10-16「碰撞高度也可以低一些(目前下樓梯會撞頭卡住)」⇒ 船員的 NAV_HEAD 1.2 m → 0.7 m（彎腰過得去；眼高照 fpEye 壓低）
var FP_HEAD = 7;
function fpCaptain(sh) { return sh ? sh.crew.filter(function (c) { return c.art === ART_CAPTAIN && c.st === 0; })[0] || null : null; }
/** 操控誰：船長 ＞ 其他軍官 ＞ 任何一個站著的船員（Tim 2026-10-16「第一人稱不用綁定船長 船長不在就找任意船員位置開始」）。
 *  ⛔ 不挑：躺在病床上、正在爬梯子的預備水手（位置在別人手上）；被扛著的是傷員（st 1），本來就不算站著。 */
function fpPick(sh) {
  if (!sh) return null;
  var ok = function (c) { return c.st === 0 && !c.inBed && !(c.hand && c.hand.climb); };
  return fpCaptain(sh) || sh.crew.filter(function (c) { return ok(c) && c.role === ROLE.OFFICER; })[0] || sh.crew.filter(ok)[0] || null;
}
/** 開／關。開：鏡頭現在朝哪裡看（水平方向）⇒ 船長就面向那裡（不會一開就轉一大圈）。 */
function fpSet(on) {
  if (on) {
    var sh = RUNNING ? SHIPS[PLAYER_I] : null, c = sh && !sh.sunk ? fpPick(sh) : null;
    if (!c) { if (sh) note(sh, '第一人稱：船上沒有站著的人'); fpUI(); return false; }
    if (c.art !== ART_CAPTAIN) note(sh, '第一人稱：船長不在 ⇒ 從' + (c.role === ROLE.OFFICER ? '軍官' : ROLE_NAME[c.role] || '船員') + '的位置開始');
    c.fp = true;                                                       // 40_crew.js stepCrew 跳過這個人（⛔ 不跳 ⇒ 砲手、預備水手會被拉回自己的工作）
    var d = CAM.look && CAM.eye ? M4.dir(sh.inv, CAM.look[0] - CAM.eye[0], CAM.look[1] - CAM.eye[1], CAM.look[2] - CAM.eye[2]) : [1, 0, 0];
    FP.on = true; FP.sh = sh; FP.c = c; FP.yaw = Math.atan2(d[1], d[0]) || 0; FP.pitch = 0; FP.climb = null; FP.lads = fpLadders(sh); FP.v = [0, 0]; FP.ez = null; FP.jz = FP.jv = 0;
    note(sh, '第一人稱：左下搖桿或 WASD 走、Shift 跑、空白鍵跳、拖曳或方向鍵轉頭、E 爬梯子 —— 設定裡再按一次回到原本的鏡頭');
  } else if (FP.on) {
    if (FP.c) { FP.c.home = FP.c.pos.slice(); FP.c.moving = false; delete FP.c.fp; }   // 站在哪就留在哪（⛔ 不走回原位）；跳到一半關掉 ⇒ 腳底本來就是站得住的那一格；交回給模擬
    FP.on = false; FP.sh = FP.c = FP.climb = FP.near = FP.fol = null; CAM.snap = true;
  }
  fpStop(); fpUI(); return FP.on;
}
function fpStop() { var m = FP.mv; Object.keys(m).forEach(function (k) { m[k] = 0; }); FP.run = false; FP.joy = [0, 0]; FP.jz = FP.jv = 0; FP.v = [0, 0]; joyDraw(0, 0); }
function fpUI() {
  $('stage').classList.toggle('fp', FP.on);
  $('fpT').classList.toggle('on', FP.on);
  $('fpUI').classList.toggle('fol', !!FP.fol);                         // 跟隨中：藏搖桿、跳、跑、爬梯子（template.html #fpUI.fol）
  $('fpClimb').style.display = FP.on && FP.near && !FP.fol ? '' : 'none';
  var t = FP.fol ? '↩ 回來' : '👁 跟隨'; if ($('fpFol').textContent !== t) $('fpFol').textContent = t;
}
/** 鏡頭跟著誰：跟隨中 ⇒ 被跟的人，否則 ⇒ 自己。 */
function fpWho() { return FP.fol || FP.c; }
/** 跟隨（F／👁）：沒在跟 ⇒ 跟離自己最近的那一個；在跟 ⇒ 回到自己。下一個（G／⏭）：照離自己由近到遠，換成現在這個的下一個。 */
function fpFollow(next) {
  if (!FP.on) return;
  if (FP.fol && !next) { FP.fol = null; FP.ez = null; fpUI(); return; }
  var me = FP.c, L = FP.sh.crew.filter(function (o) { return o !== me && o.st === 0 && !o.inBed; })
    .sort(function (a, b) { return len(sub(a.pos, me.pos)) - len(sub(b.pos, me.pos)); });
  if (!L.length) { note(FP.sh, '第一人稱：附近沒有可以跟的人'); return; }
  var i = FP.fol ? L.indexOf(FP.fol) : -1;
  FP.fol = L[(i + 1) % L.length]; FP.folP = null; FP.ez = null; FP.climb = null; FP.v = [0, 0]; FP.jz = FP.jv = 0; fpUI();
}
/** 梯子：foot → lo → hi → head（格座標，z ＝ 腳踩的那一格）；lo、hi 抬 CLIMB_LIFT 格（同預備水手，42_hands.js：兩點連線會切過踏板前緣）。 */
function fpLadders(sh) {
  return shipLadders(sh.T).map(function (l) {
    var P = l.pts, mid = P.slice(1, -1).map(function (q) { return [q[0], q[1], q[2] + CLIMB_LIFT]; });
    return { name: l.name, up: [P[0]].concat(mid, [P[P.length - 1]]) };
  });
}
/** 腳下：(x, y) 那一柱在 z 往下 FP_DOWN、往上 up（沒給 ＝ FP_UP）格內站得住的高度（離 z 最近的）；站不住 ⇒ −1。 */
function fpStand(g, x, y, z, up) {
  var best = -1;
  for (var dz = -FP_DOWN; dz <= (up || FP_UP); dz++) {
    var zz = z + dz; if (zz < 1) continue;
    var s = standZ(g, x, y, zz, zz, FP_HEAD);
    if (s >= 0 && (best < 0 || Math.abs(s - z) < Math.abs(best - z))) best = s;
  }
  return best;
}
/** 走到 (nx, ny)：中心那一柱要站得住（⇒ 不會從艙口掉下去）；身體四個角只擋牆（身高範圍裡有實心、又不是跨得上去的台階）——
 *  角懸在洞上可以（⛔ 四個角都要站得住 ⇒ 站在艙口邊的人連往後退都不行：量過，梯頭那一格旁邊就是地板和踏板之間的縫）。
 *  腳下 ＝ 中心那一柱的高度（⛔ 以前取四個角裡最高的 ⇒ 貼著邊走時角一下踩上一下踩空，腳底一格高一格低地跳 ＝ 抖）；不行 ⇒ null。 */
function fpTry(g, z, nx, ny, thin, up) {
  up = up || FP_UP;
  var hi = fpStand(g, Math.floor(nx), Math.floor(ny), z, up);
  if (hi < 0) hi = fpFoot(g, z, nx, ny, up);                          // 中心那一柱是縫 ⇒ 看腳掌踩不踩得到旁邊（樓梯口圍欄與第一階之間那一格縫，量過）
  if (hi < 0) return null;
  if (thin) return hi;                                                 // 卡住了（現在的位置四個角就撞牆）⇒ 只看中心那一柱，先走出來
  for (var i = 0; i < 4; i++) {
    var x = Math.floor(nx + (i & 1 ? FP_R : -FP_R)), y = Math.floor(ny + (i & 2 ? FP_R : -FP_R));
    if (fpStand(g, x, y, z, up) >= 0) continue;
    for (var h = 0; h < FP_HEAD; h++) if (g.get(x, y, hi + h)) return null;   // 牆：新地板上方、身高範圍裡有實心（那個角本身站得住 ⇒ 是台階，上面已經跳過）
  }
  return hi;
}
/** 腳掌：中心那一柱站不住時，中心 ±FP_FOOT 格的八個點裡站得住、離現在腳底最近的高度（一兩格寬的縫跨得過去；艙口那種大洞照樣擋）；都不行 ⇒ −1。 */
var FP_FOOT = 1.2;
function fpFoot(g, z, nx, ny, up) {
  var best = -1;
  for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
    if (!i && !j) continue;
    var s = fpStand(g, Math.floor(nx + i * FP_FOOT), Math.floor(ny + j * FP_FOOT), z, up);
    if (s >= 0 && (best < 0 || Math.abs(s - z) < Math.abs(best - z))) best = s;
  }
  return best;
}
/** 眼睛離腳底幾格：頭頂（那一柱往上第一個實心）低於 FP_EYE ＋ 1 ⇒ 壓到頭頂下一格。 */
function fpEye(g, p) {
  var x = Math.floor(p[0]), y = Math.floor(p[1]), z = Math.floor(p[2]);
  for (var h = 1; h <= FP_EYE + 1; h++) if (g.get(x, y, z + h)) return Math.max(3, h - 1.2);
  return FP_EYE;
}
/** 每一格畫面（90_main.js frame，camUpdate 之前）：退出判斷、走、爬、看哪一座梯子在旁邊。 */
function fpFrame(dt) {
  if (!FP.on) return;
  var sh = FP.sh, c = FP.c;
  if (!RUNNING || SHIPS[PLAYER_I] !== sh || sh.sunk || sh.crew.indexOf(c) < 0 || c.st !== 0) {
    var who = c.art === ART_CAPTAIN ? '船長' : '操控的人', why = !RUNNING || SHIPS[PLAYER_I] !== sh ? '' : sh.sunk ? '我艦沉了' : c.st === 4 || c.st === 5 ? who + '落水' : who + '倒下';
    var o = sh; fpSet(false); if (why && o) note(o, '第一人稱結束：' + why);
    return;
  }
  var m = FP.mv, g = sh.grid;
  FP.yaw += (m.tr - m.tl) * FP_TURN * dt; FP.pitch = clamp(FP.pitch + (m.lu - m.ld) * FP_TURN * 0.7 * dt, -1.35, 1.35);
  if (FP.fol && (sh.crew.indexOf(FP.fol) < 0 || FP.fol.st !== 0)) { FP.fol = null; FP.ez = null; note(sh, '第一人稱：跟的人倒下或落水了 —— 回到自己'); fpUI(); }
  if (PAUSED) { fpEyeZ(0); return; }                                   // 停格、設定打開：只能轉頭
  if (FP.fol) {                                                        // 跟隨中：自己不動（c.fp 照舊擋著模擬），只轉頭
    var q = FP.fol.pos, lp = FP.folP || q, mx = q[0] - lp[0], my = q[1] - lp[1]; FP.folP = q.slice();
    if (Math.hypot(mx, my) > 1e-3 && performance.now() - (FP.lookT || 0) > 2000) {   // 他在走、玩家 2 秒沒拖 ⇒ 視線慢慢轉向他走的方向（⛔ 固定朝向 ⇒ 他一轉彎鏡頭就對著艙壁，量過）
      var dyaw = Math.atan2(Math.sin(Math.atan2(my, mx) - FP.yaw), Math.cos(Math.atan2(my, mx) - FP.yaw));
      FP.yaw += dyaw * (1 - Math.exp(-dt / 0.5));
    }
    FP.near = null; fpEyeZ(dt); fpUI(); return;
  }
  if (FP.climb) {                                                      // 爬：一段一段沿梯子的線走（三維）
    var P = FP.climb.pts, to = P[FP.climb.k], d = sub(to, c.pos), l = len(d), s = FP_CLIMB * dt;
    c.moving = true; FP.jz = FP.jv = 0; FP.v[0] = FP.v[1] = 0;          // ⛔ 沒有 moving ⇒ survey（32_hull.js）看腳下 3×3 沒地板 ⇒ 判成掉下去（爬的時候人懸在梯子上）
    if (l <= s) { c.pos = to.slice(); if (++FP.climb.k >= P.length) { FP.climb = null; c.home = c.pos.slice(); c.moving = false; } }
    else c.pos = add(c.pos, mul(d, s / l));
    FP.near = null; fpEyeZ(dt); fpUI();
    return;
  }
  // 輸入：鍵盤（0／1）＋虛擬搖桿（類比）；合起來長度夾到 1 ⇒ 搖桿推一半就慢慢走
  var f = m.f - m.b + FP.joy[0], r = m.r - m.l + FP.joy[1], n = Math.hypot(f, r);
  if (n > 1) { f /= n; r /= n; }
  var top = FP_SP * (FP.run ? FP_RUN : 1), cy = Math.cos(FP.yaw), sy = Math.sin(FP.yaw);   // 右手邊 ＝ yaw + 90°（格的 +y ＝ 右舷）
  var tvx = (cy * f - sy * r) * top, tvy = (sy * f + cy * r) * top, kk = 1 - Math.exp(-dt / (n > 0.05 ? FP_ACC : FP_DEC));
  FP.v[0] += (tvx - FP.v[0]) * kk; FP.v[1] += (tvy - FP.v[1]) * kk;   // 加速、減速（⛔ 一按就全速、一放就急停 ⇒ 鏡頭一頓一頓）
  if (n <= 0.05 && Math.hypot(FP.v[0], FP.v[1]) < 0.2) FP.v[0] = FP.v[1] = 0;
  var dx = FP.v[0] * dt, dy = FP.v[1] * dt, z = Math.floor(c.pos[2]), feet = c.pos[2] + FP.jz, nz = null;
  if (dx || dy) {
    var up = FP_UP + Math.floor(FP.jz), thin = fpTry(g, z, c.pos[0], c.pos[1], false, up) === null;   // 跳起來的時候跨得更高（跳上箱子、舷梯）
    if ((nz = fpTry(g, z, c.pos[0] + dx, c.pos[1] + dy, thin, up)) !== null) { c.pos[0] += dx; c.pos[1] += dy; }
    else if (dx && (nz = fpTry(g, z, c.pos[0] + dx, c.pos[1], thin, up)) !== null) { c.pos[0] += dx; FP.v[1] = 0; }   // 貼著牆滑（撞牆的那個方向速度歸零）
    else if (dy && (nz = fpTry(g, z, c.pos[0], c.pos[1] + dy, thin, up)) !== null) { c.pos[1] += dy; FP.v[0] = 0; }
    else FP.v[0] = FP.v[1] = 0;
    if (nz !== null && nz !== z) { c.pos[2] = nz; FP.jz = Math.max(0, feet - nz); }   // 換了一層地板：腳的高度不跳 —— 往下 ⇒ 照重力落下去；往上 ⇒ 站上去（眼高平滑地追）
    c.face = Math.cos(FP.yaw) >= 0 ? 1 : -1;
  }
  if (FP.jz > 0 || FP.jv > 0) {                                        // 垂直：跳、從台階邊落下去
    FP.jv -= FP_G * dt; FP.jz += FP.jv * dt;
    if (FP.jv > 0 && g.get(Math.floor(c.pos[0]), Math.floor(c.pos[1]), Math.floor(c.pos[2] + FP.jz + FP_HEAD))) FP.jv = 0;   // 頭頂撞到（跟站得住同一個身高）
    if (FP.jz <= 0) { FP.jz = 0; FP.jv = 0; }
  }
  var x0 = Math.floor(c.pos[0]), y0 = Math.floor(c.pos[1]), z0 = c.pos[2] - 1;
  c.moving = !!(dx || dy) || FP.jz > 0 || !countBox(g, x0 - 1, y0 - 1, z0, x0 + 1, y0 + 1, z0);   // ⛔ 沒有 ⇒ survey 在跳到半空、或站在縫上（腳掌踩在 1 格外，fpFoot）時判成掉下去
  FP.near = FP.jz > 0 ? null : fpNear(c.pos);
  fpEyeZ(dt); fpUI();
}
/** 跳（空白鍵、面板的 ⤴）：站在地上才跳得起來；爬梯子、停格不行。 */
function fpJump() { if (!FP.on || PAUSED || FP.fol || FP.climb || FP.jz > 0 || FP.jv > 0) return; FP.jv = Math.sqrt(2 * FP_G * FP_JUMP); }
/** 鏡頭的眼高（格，船的 z）：腳底絕對高度（c.pos[2] ＋ 跳起來的 FP.jz）＋ 眼高，平滑地追（FP_EZ 秒）⇒ 跨台階、頭頂變低不會一格一格跳。 */
function fpEyeZ(dt) {
  var c = fpWho(), jz = FP.fol ? 0 : FP.jz, want = c.pos[2] + jz + fpEye(FP.sh.grid, [c.pos[0], c.pos[1], c.pos[2] + jz]);
  if (FP.ez === null || FP.climb || !(dt > 0)) FP.ez = want;           // 剛開、換人、爬梯子（本來就連續）⇒ 直接跟
  else FP.ez += (want - FP.ez) * (1 - Math.exp(-dt / FP_EZ));
}
/** 旁邊有沒有梯腳（往上爬）或梯頭（往下爬）：水平 FP_REACH 格內、高度差 4 格內，取最近的那一個。 */
function fpNear(p) {
  var best = null, bd = 1e9;
  (FP.lads || []).forEach(function (L) {
    [[L.up[0], L.up], [L.up[L.up.length - 1], L.up.slice().reverse()]].forEach(function (e) {
      var q = e[0], dh = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (dh < FP_REACH && Math.abs(q[2] - p[2]) <= 4 && dh < bd) { bd = dh; best = { pts: e[1], up: e[1] === L.up, name: L.name }; }
    });
  });
  return best;
}
/** 畫船員（41_crew_art.js drawCrew）：自己不畫；同一艘船上、水平 FP_NEAR 格內、差不多同一層的人也不畫（看板圖 2.1 m 高，貼在臉前會蓋掉半個畫面）。 */
var FP_NEAR = 12;                                                     // 1.2 m（⛔ 0.8 m ⇒ 底艙擠的時候 1 m 外的人整張蓋住畫面，跟隨預備水手時量到）
function fpHide(sh, c) {
  if (c === fpWho()) return true;
  if (sh !== FP.sh || c.st === 4 || c.st === 5) return false;
  var p = fpWho().pos;                                                 // 跟隨中：看的是被跟的人身邊（自己的身體在遠處 ⇒ 照畫） return Math.abs(c.pos[0] - p[0]) < FP_NEAR && Math.abs(c.pos[1] - p[1]) < FP_NEAR && Math.abs(c.pos[2] - p[2]) < 12;
}
function fpClimbGo() { if (!FP.on || FP.fol || FP.climb || !FP.near || PAUSED) return; FP.climb = { pts: FP.near.pts, k: 0 }; }
/** 鏡頭（03_camera.js camUpdate 開頭）：眼睛在船長頭上、照船的矩陣（內插過的）換到世界。 */
function fpCam() {
  if (!FP.on) return false;
  var sh = FP.sh, c = fpWho();
  if (FP.ez === null) fpEyeZ(0);
  var eye = M4.pt(sh.M, c.pos[0], c.pos[1], FP.ez);                    // 眼高平滑過（fpEyeZ）
  var cp = Math.cos(FP.pitch), dir = norm(M4.dir(sh.M, Math.cos(FP.yaw) * cp, Math.sin(FP.yaw) * cp, Math.sin(FP.pitch)));
  CAM.eye = eye; CAM.look = add(eye, dir);
  var proj = M4.persp(FP_FOV, CAM.w / CAM.h, 0.05, 5000);            // 近裁切面 5 cm（⛔ 0.5 m ⇒ 艙裡身邊的牆被切掉）
  CAM.vp = M4.mul(proj, M4.lookAt(CAM.eye, CAM.look, [0, 1, 0])); CAM.inv = M4.inv(CAM.vp);
  return true;
}
/** 鍵盤（71_input.js keydown／keyup 先問這裡）：第一人稱的鍵吃掉 ⇒ true；其他照舊（P 停格、O／Esc 設定）。 */
var FP_KEYS = { w: 'f', arrowup: 'lu', s: 'b', arrowdown: 'ld', a: 'l', d: 'r', arrowleft: 'tl', arrowright: 'tr', q: 'tl', e: null, ' ': null, shift: null, f: null, g: null };
function fpKey(k, down) {
  if (!(k in FP_KEYS)) return false;
  if (k === 'shift') { FP.run = down && FP.on; return FP.on; }
  if (!FP.on) { if (!down && FP_KEYS[k]) FP.mv[FP_KEYS[k]] = 0; return false; }
  if (k === 'e') { if (down) fpClimbGo(); return true; }               // E 爬梯子
  if (k === ' ') { if (down) fpJump(); return true; }                  // 空白鍵跳（Tim 2026-10-16）
  if (k === 'f' || k === 'g') { if (down) fpFollow(k === 'g'); return true; }   // F 跟隨／回來、G 換下一個（第一人稱時 F 不開砲）
  FP.mv[FP_KEYS[k]] = down ? 1 : 0;
  return true;
}
/** 拖曳轉頭（71_input.js pointermove）：往右拖 ⇒ 往右看。 */
function fpLook(dx, dy) { FP.yaw += dx * 0.005; FP.pitch = clamp(FP.pitch - dy * 0.005, -1.35, 1.35); FP.lookT = performance.now(); }   // lookT：跟隨中 2 秒內不自動轉
// 設定面板的開關、第一人稱的操作面板（按住才動：放開、移出、取消都停）
$('fpT').onclick = function () { fpSet(!FP.on); gsetClose(); };
[].forEach.call(document.querySelectorAll('#fpUI [data-fp]'), function (b) {
  var k = b.dataset.fp;
  function on(e) { e.preventDefault(); FP.mv[k] = 1; b.classList.add('down'); }
  function off() { FP.mv[k] = 0; b.classList.remove('down'); }
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
$('fpRun').onclick = function () { FP.run = !FP.run; $('fpRun').classList.toggle('on', FP.run); };
$('fpClimb').onclick = function () { fpClimbGo(); };
$('fpJump').addEventListener('pointerdown', function (e) { e.preventDefault(); fpJump(); });
$('fpFol').onclick = function () { fpFollow(false); };
$('fpNext').onclick = function () { fpFollow(true); };
window.addEventListener('blur', fpStop);
// 虛擬搖桿（Tim 2026-10-16「移動要改為虛擬搖桿(同時支援WASD 但不用顯示按鍵)」）：左下一個圓，按住拖 ⇒ 往那個方向走；
//   推到邊 ＝ 全速、推一半 ＝ 半速（FP.joy ＝ [往前, 往右]，跟鍵盤的合起來夾到 1）。放開、取消 ⇒ 回中間。
var JOY = { id: null, cx: 0, cy: 0, R: 1 };
function joyDraw(x, y) { var k = $('fpKnob'); if (k) k.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; }
function joyMove(e) {
  var dx = e.clientX - JOY.cx, dy = e.clientY - JOY.cy, l = Math.hypot(dx, dy), s = l > JOY.R ? JOY.R / l : 1;
  dx *= s; dy *= s; joyDraw(dx, dy);
  var a = Math.hypot(dx, dy) / JOY.R, dead = 0.12, k = a < dead ? 0 : (a - dead) / (1 - dead) / (a || 1);   // 中間一小圈不動（手指放上去不會溜）
  FP.joy = [-dy / JOY.R * k, dx / JOY.R * k];
}
$('fpJoy').addEventListener('pointerdown', function (e) {
  e.preventDefault(); var b = $('fpJoy').getBoundingClientRect();
  JOY.id = e.pointerId; JOY.cx = b.left + b.width / 2; JOY.cy = b.top + b.height / 2; JOY.R = b.width / 2 - 14;
  $('fpJoy').setPointerCapture(e.pointerId); joyMove(e);
});
$('fpJoy').addEventListener('pointermove', function (e) { if (e.pointerId === JOY.id) joyMove(e); });
function joyEnd(e) { if (e.pointerId !== JOY.id) return; JOY.id = null; FP.joy = [0, 0]; joyDraw(0, 0); }
$('fpJoy').addEventListener('pointerup', joyEnd); $('fpJoy').addEventListener('pointercancel', joyEnd);

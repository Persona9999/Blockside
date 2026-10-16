// ───────────────────────── 第一人稱（TASK-0649） ─────────────────────────
// Tim 2026-10-16：「切換第一人稱模式功能(多一個Toggle按鈕 切換後就可以操控船長在船上自由移動)」「放在設定內」
//   「第一人稱下 下方操作面板隱藏 改為第一人稱用的操作面板(要能移動 旋轉視角等)」「只保留設定紐 暫停紐」；之後的建造模式（TASK-0648）由這一套衍生。
// 操控的是我艦的船長（每艘船第一個軍官，40_crew.js ART_CAPTAIN）：位置照舊是船的格座標（c.pos：腳底那一格），跟著船搖。
//   走：每一步照現在的格子（sh.grid，打掉的地板就站不住）用 standZ 找腳下 ⇒ 上下 NAV_DZ 格內站得住、頭上 NAV_HEAD 格空才走得過去；
//   身體半徑 FP_R 格（四個角都要站得住）⇒ 不穿牆、走不出舷牆、不會從艙口掉下去。⚠ 不擋模型（砲、桶）：模型不是格子。
//   梯子：照雕刻的固定點（42_hands.js shipLadders：foot／lo／hi／head），走到梯腳或梯頭旁邊 ⇒ E（或面板的 🪜）沿那條線爬。
//   看：鏡頭在眼睛（腳底往上 FP_EYE 格，頭頂低就壓低），yaw／pitch 是相對船的（船轉，視線跟著轉）；地平線照世界的上方（不跟著船橫搖）。
// 只在畫面這一層跑（frame，90_main.js）：⛔ 不抽 rnd()、不碰模擬的狀態（除了船長自己的位置）⇒ 不開第一人稱時戰局逐位元組相同。
//   停格、設定打開（PAUSED）時只能轉頭、不能走。
// 自動退出：船長倒下、落水、死了、我艦沉了、換了一艘我艦（playerHandoff）、重新開始、回主選單。
var FP = { on: false, sh: null, c: null, yaw: 0, pitch: 0, mv: { f: 0, b: 0, l: 0, r: 0, tl: 0, tr: 0, lu: 0, ld: 0 }, run: false, climb: null, near: null, lads: null };
var FP_EYE = 16, FP_SP = 14, FP_RUN = 2, FP_TURN = 1.8, FP_R = 1.5, FP_CLIMB = 8, FP_REACH = 9, FP_FOV = 1.15;
function fpCaptain(sh) { return sh ? sh.crew.filter(function (c) { return c.art === ART_CAPTAIN && c.st === 0; })[0] || null : null; }
/** 開／關。開：鏡頭現在朝哪裡看（水平方向）⇒ 船長就面向那裡（不會一開就轉一大圈）。 */
function fpSet(on) {
  if (on) {
    var sh = RUNNING ? SHIPS[PLAYER_I] : null, c = sh && !sh.sunk ? fpCaptain(sh) : null;
    if (!c) { if (sh) note(sh, '第一人稱：船長不在崗位上（倒下、落水或陣亡）'); fpUI(); return false; }
    var d = CAM.look && CAM.eye ? M4.dir(sh.inv, CAM.look[0] - CAM.eye[0], CAM.look[1] - CAM.eye[1], CAM.look[2] - CAM.eye[2]) : [1, 0, 0];
    FP.on = true; FP.sh = sh; FP.c = c; FP.yaw = Math.atan2(d[1], d[0]) || 0; FP.pitch = 0; FP.climb = null; FP.lads = fpLadders(sh);
    note(sh, '第一人稱：WASD 走、Shift 跑、拖曳或方向鍵轉頭、E 爬梯子 —— 設定裡再按一次回到原本的鏡頭');
  } else if (FP.on) {
    if (FP.c) FP.c.home = FP.c.pos.slice();                            // 站在哪就留在哪（⛔ 不走回原位）
    FP.on = false; FP.sh = FP.c = FP.climb = FP.near = null; CAM.snap = true;
  }
  fpStop(); fpUI(); return FP.on;
}
function fpStop() { var m = FP.mv; Object.keys(m).forEach(function (k) { m[k] = 0; }); FP.run = false; }
function fpUI() {
  $('stage').classList.toggle('fp', FP.on);
  $('fpT').classList.toggle('on', FP.on);
  $('fpClimb').style.display = FP.on && FP.near ? '' : 'none';
}
/** 梯子：foot → lo → hi → head（格座標，z ＝ 腳踩的那一格）；lo、hi 抬 CLIMB_LIFT 格（同預備水手，42_hands.js：兩點連線會切過踏板前緣）。 */
function fpLadders(sh) {
  return shipLadders(sh.T).map(function (l) {
    var P = l.pts, mid = P.slice(1, -1).map(function (q) { return [q[0], q[1], q[2] + CLIMB_LIFT]; });
    return { name: l.name, up: [P[0]].concat(mid, [P[P.length - 1]]) };
  });
}
/** 腳下：(x, y) 那一柱在 z 上下 NAV_DZ 格內站得住的高度（離 z 最近的）；站不住 ⇒ −1。 */
function fpStand(g, x, y, z) {
  var best = -1;
  for (var dz = -NAV_DZ; dz <= NAV_DZ; dz++) {
    var zz = z + dz; if (zz < 1) continue;
    var s = standZ(g, x, y, zz, zz, NAV_HEAD);
    if (s >= 0 && (best < 0 || Math.abs(s - z) < Math.abs(best - z))) best = s;
  }
  return best;
}
/** 走到 (nx, ny)：中心那一柱要站得住（⇒ 不會從艙口掉下去）；身體四個角只擋牆（身高範圍裡有實心、又不是跨得上去的台階）——
 *  角懸在洞上可以（⛔ 四個角都要站得住 ⇒ 站在艙口邊的人連往後退都不行：量過，梯頭那一格旁邊就是地板和踏板之間的縫）。
 *  腳下 ＝ 中心與四個角裡站得住的最高那一個（跨過門檻）；不行 ⇒ null。 */
function fpTry(g, z, nx, ny, thin) {
  var hi = fpStand(g, Math.floor(nx), Math.floor(ny), z);
  if (hi < 0) return null;
  if (thin) return hi;                                                 // 卡住了（現在的位置四個角就撞牆）⇒ 只看中心那一柱，先走出來
  for (var i = 0; i < 4; i++) {
    var x = Math.floor(nx + (i & 1 ? FP_R : -FP_R)), y = Math.floor(ny + (i & 2 ? FP_R : -FP_R)), s = fpStand(g, x, y, z);
    if (s >= 0) { if (s > hi) hi = s; continue; }
    for (var h = NAV_DZ + 1; h < NAV_HEAD; h++) if (g.get(x, y, z + h)) return null;   // 牆（台階以上、頭以下有實心）
  }
  return hi;
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
    var why = !RUNNING || SHIPS[PLAYER_I] !== sh ? '' : sh.sunk ? '我艦沉了' : c.st === 4 || c.st === 5 ? '船長落水' : '船長倒下';
    var o = sh; fpSet(false); if (why && o) note(o, '第一人稱結束：' + why);
    return;
  }
  var m = FP.mv, g = sh.grid;
  FP.yaw += (m.tr - m.tl) * FP_TURN * dt; FP.pitch = clamp(FP.pitch + (m.lu - m.ld) * FP_TURN * 0.7 * dt, -1.35, 1.35);
  if (PAUSED) return;                                                  // 停格、設定打開：只能轉頭
  if (FP.climb) {                                                      // 爬：一段一段沿梯子的線走（三維）
    var P = FP.climb.pts, to = P[FP.climb.k], d = sub(to, c.pos), l = len(d), s = FP_CLIMB * dt;
    c.moving = true;                                                   // ⛔ 沒有 ⇒ survey（32_hull.js）看腳下 3×3 沒地板 ⇒ 判成掉下去（爬的時候人懸在梯子上）
    if (l <= s) { c.pos = to.slice(); if (++FP.climb.k >= P.length) { FP.climb = null; c.home = c.pos.slice(); c.moving = false; } }
    else c.pos = add(c.pos, mul(d, s / l));
    FP.near = null; fpUI();
    return;
  }
  var f = m.f - m.b, r = m.r - m.l;
  if (f || r) {
    var n = Math.hypot(f, r), sp = FP_SP * (FP.run ? FP_RUN : 1) * dt / n, cy = Math.cos(FP.yaw), sy = Math.sin(FP.yaw);
    var dx = (cy * f - sy * r) * sp, dy = (sy * f + cy * r) * sp, z = Math.floor(c.pos[2]), nz;   // 右手邊 ＝ yaw + 90°（格的 +y ＝ 右舷）
    var thin = fpTry(g, z, c.pos[0], c.pos[1]) === null;
    if ((nz = fpTry(g, z, c.pos[0] + dx, c.pos[1] + dy, thin)) !== null) { c.pos[0] += dx; c.pos[1] += dy; c.pos[2] = nz; }
    else if (dx && (nz = fpTry(g, z, c.pos[0] + dx, c.pos[1], thin)) !== null) { c.pos[0] += dx; c.pos[2] = nz; }   // 貼著牆滑
    else if (dy && (nz = fpTry(g, z, c.pos[0], c.pos[1] + dy, thin)) !== null) { c.pos[1] += dy; c.pos[2] = nz; }
    c.moving = true; c.face = Math.cos(FP.yaw) >= 0 ? 1 : -1;
  } else c.moving = false;
  FP.near = fpNear(c.pos);
  fpUI();
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
var FP_NEAR = 8;
function fpHide(sh, c) {
  if (c === FP.c) return true;
  if (sh !== FP.sh || c.st === 4 || c.st === 5) return false;
  var p = FP.c.pos; return Math.abs(c.pos[0] - p[0]) < FP_NEAR && Math.abs(c.pos[1] - p[1]) < FP_NEAR && Math.abs(c.pos[2] - p[2]) < 12;
}
function fpClimbGo() { if (!FP.on || FP.climb || !FP.near || PAUSED) return; FP.climb = { pts: FP.near.pts, k: 0 }; }
/** 鏡頭（03_camera.js camUpdate 開頭）：眼睛在船長頭上、照船的矩陣（內插過的）換到世界。 */
function fpCam() {
  if (!FP.on) return false;
  var sh = FP.sh, c = FP.c, e = fpEye(sh.grid, c.pos);
  var eye = M4.pt(sh.M, c.pos[0], c.pos[1], c.pos[2] + e);
  var cp = Math.cos(FP.pitch), dir = norm(M4.dir(sh.M, Math.cos(FP.yaw) * cp, Math.sin(FP.yaw) * cp, Math.sin(FP.pitch)));
  CAM.eye = eye; CAM.look = add(eye, dir);
  var proj = M4.persp(FP_FOV, CAM.w / CAM.h, 0.05, 5000);            // 近裁切面 5 cm（⛔ 0.5 m ⇒ 艙裡身邊的牆被切掉）
  CAM.vp = M4.mul(proj, M4.lookAt(CAM.eye, CAM.look, [0, 1, 0])); CAM.inv = M4.inv(CAM.vp);
  return true;
}
/** 鍵盤（71_input.js keydown／keyup 先問這裡）：第一人稱的鍵吃掉 ⇒ true；其他照舊（P 停格、O／Esc 設定）。 */
var FP_KEYS = { w: 'f', arrowup: 'lu', s: 'b', arrowdown: 'ld', a: 'l', d: 'r', arrowleft: 'tl', arrowright: 'tr', q: 'tl', e: null, ' ': null, shift: null };
function fpKey(k, down) {
  if (!(k in FP_KEYS)) return false;
  if (k === 'shift') { FP.run = down && FP.on; return FP.on; }
  if (!FP.on) { if (!down && FP_KEYS[k]) FP.mv[FP_KEYS[k]] = 0; return false; }
  if (k === 'e' || k === ' ') { if (down) fpClimbGo(); return true; }
  FP.mv[FP_KEYS[k]] = down ? 1 : 0;
  return true;
}
/** 拖曳轉頭（71_input.js pointermove）：往右拖 ⇒ 往右看。 */
function fpLook(dx, dy) { FP.yaw += dx * 0.005; FP.pitch = clamp(FP.pitch - dy * 0.005, -1.35, 1.35); }
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
window.addEventListener('blur', fpStop);

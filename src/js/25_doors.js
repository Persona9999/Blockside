// ───────────────────────── 門、艙蓋（TASK-0638；Tim 2026-10-16：「艙門機制 有人經過才打開 且打開只是演出效果(畫質設定可以關閉門的開關演出)」「門要另外建子模型 且可被破壞 …… 可以讓人員進出(直接視為通道) 但是會阻擋水流入」）─────────────────────────
// 標法（雕刻作品的模型 meta，造船規格 §9 kind 表 door 那一列）：kind=door；固定點 hinge-a、hinge-b（鉸鏈軸上兩點，門子作品裡登記）；可選 open=up｜side（說明：上下開／左右開）、open_deg（預設 100）。
//   開的方向：從 hinge-a 看向 hinge-b，右手定則正轉。第一個用的是莫尼特號主甲板的兩個艙蓋（meadow-monitor-01m-hatch，掛在前艙口、機艙艙口上）。
// 三件事，各自分開：
//   · 通道：門不擋人（40_crew.js CREW_BLOCK 不收 kind=door ⇒ 站位、走路格把它當沒有）—— 人照梯子、走路格走過去，門關著也照走。
//   · 演出（只改畫面）：有人經過（走路、爬梯子；第一人稱的玩家也算，81_fps.js shPassers）離門 1.5 m 內 ⇒ 開，人走了 1 秒 ⇒ 關（繞鉸鏈轉 m.sw，modelLocal 跟螺旋槳同一條路）。
//     在畫面那一格算（90_main.js frame，doorsAnim），⛔ 不在 step() 裡：戰局一個值都不讀它；畫質「門的開關演出」關掉 ⇒ 一直關著。
//     被打飛那一刻擺回關著（21_gunnery.js blowModel）⇒ 飛出去的落水時間跟演出開關無關（落水的水花會抽戰局的亂數）。
//   · 擋水：門底下那一片開口（門的外框正下方、甲板那一層原本就是空的格）平常不進水 —— 跟沒有門的開口一樣（遊戲只從砲彈打出的洞進水）。
//     門被打掉、掉了（m.alive 變 false，survey 那一拍）⇒ 那一片變成進水口：公式模式照水線下的洞算（sh.flood 那一層加上開口的格數）；
//     粒子模式（33_flood.js flTick）外面的水面（seaH，照浪）高過開口 ⇒ 照 Torricelli 灌進開口底下那一格（doorInflow）。
//     ⛔ 沒有門的開口照舊不進水（甲板上浪打過來沒做）⇒ 沒有門的船一位元不動。
// 血量：砲的一半（GUN_HP × 0.5；10_ship.js）—— 打得壞，壞了整片飛走（blowModel），開口露出來。
var DOOR_R = 15, DOOR_RZ = 25, DOOR_SP = 2.5, DOOR_HOLD = 1, DOOR_DEG = 100;   // 1.5 m 內有人經過（上下 2.5 m）；開／關各 0.4 秒；人走了留 1 秒
/** 開一艘船（10_ship.js makeShip，模型建好之後）：每扇門的鉸鏈、開口的格。沒有門 ⇒ sh.doors 不設（一行都不多算）。 */
function doorsShip(sh) {
  var D = [];
  sh.models.forEach(function (m) {
    if (m.kind !== 'door') return;
    var a = m.pts['hinge-a'], b = m.pts['hinge-b'];
    var d = { m: m, t: 0, hold: 0, gone: false, a: null, ax: null, deg: (isFinite(+m.meta.open_deg) ? +m.meta.open_deg : DOOR_DEG) * Math.PI / 180, cells: [], zt: Math.floor(m.bb[2]) - 1 };
    if (a && b && len(sub(b, a)) > 0.5) { d.a = [a[0] + 0.5, a[1] + 0.5, a[2] + 0.5]; d.ax = norm(sub(b, a)); }   // 固定點取格心（跟梯子一樣）；鉸鏈缺 ⇒ 不演出（匯入檢查報 ✗）
    var B = sh.T.hullG, b0 = m.bb;
    for (var x = Math.ceil(b0[0]); x < Math.floor(b0[3]); x++) for (var y = Math.ceil(b0[1]); y < Math.floor(b0[4]); y++) if (!B.get(x, y, d.zt)) d.cells.push(x, y);   // 開口：門正下方、甲板那一層原本就空的格
    D.push(d);
  });
  if (D.length) sh.doors = D;
}
/** 每半秒（32_hull.js survey）：門沒了（打飛、腳下的甲板沒了）⇒ 開口變成進水口（只登記一次）。 */
function doorsSurvey(sh) {
  sh.doors.forEach(function (d) {
    if (d.gone || d.m.alive || !d.cells.length) return;
    d.gone = true;
    var n = d.cells.length / 2, z = d.zt, sy = 0, sx = 0, cx = 0, cy = 0;
    for (var i = 0; i < d.cells.length; i += 2) { sy += d.cells[i + 1] > sh.T.cy ? 1 : -1; sx += d.cells[i] > sh.T.cx ? 1 : -1; cx += d.cells[i]; cy += d.cells[i + 1]; }
    if (z < sh.T.sz) { sh.flood[z * 3] += n; sh.flood[z * 3 + 1] += sy; sh.flood[z * 3 + 2] += sx; }   // 公式模式：跟水線下的洞一樣算（水線淹到甲板才進）
    if (sh.fl) (sh.fl.tops = sh.fl.tops || []).push({ x: cx / n + 0.5, y: cy / n + 0.5, z: z + 1, ar: n * S * S });   // 粒子模式：開口的中心、面積（flTick 讀，doorInflow）
  });
}
/** 粒子模式（33_flood.js flTick 的破口那一段之後）：門沒了的開口，外面的水面（seaH）高過開口 ⇒ 灌進開口底下那一格（水格自己往下流）。回 [進來的 m³, 面積, 幾個開口]。 */
function doorInflow(sh, fl, dtc, head) {
  var F = fl.F, M = sh.M, fk = sh.cfg.flood / LIM.flood[2], q = 0, ar = 0, n = 0;
  fl.tops.forEach(function (o) {
    var P = M4.pt(M, o.x, o.y, o.z), hOut = seaH(P[0], P[2], SIMT), ci = flCell(F, o.x, o.y, o.z - 2);
    ar += o.ar; n++;
    if (ci < 0 || hOut <= P[1]) return;
    var hIn = fl.A[ci] > 1e-6 ? head(ci) : -1e9, dh = hOut - Math.max(hIn, P[1]); if (dh <= 0.001) return;
    var dv = FL_C * o.ar * Math.sqrt(2 * G * dh) * fk * dtc; flDeposit(sh, fl, ci, dv); q += dv;
  });
  return [q, ar, n];
}
/** 匯入檢查（75_shipcheck.js）：每扇門的讀數一行。 */
function doorsSummary(sh) {
  if (!sh.doors) return '';
  return sh.doors.length + ' 扇：' + sh.doors.map(function (d) {
    var ax = d.ax ? (Math.abs(d.ax[2]) > 0.7 ? '左右開' : '上下開') : '鉸鏈缺';
    return d.m.path + '（' + ax + '、開口 ' + d.cells.length / 2 + ' 格）';
  }).join('；');
}

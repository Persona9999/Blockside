// ───────────────────────── 模擬物件給人看的那一半（TASK-0669 第二段） ─────────────────────────
// 區塊職責：裝甲（含會轉的體素件）、碎塊、模型、門 —— 模擬檔管它們打掉幾格、在哪、轉多少；這裡管網格、上 GPU、畫、重建、丟。
// 物理意義：以前這些寫在 21_gunnery、24_armor、25_doors 裡，模擬檔因此直接叫 15_smooth、60_render、74_cutaway、81_fps、11_rig_gpu 的函式。
//   現在模擬檔只發事件（00_events.js）：armorShip（開船：每塊掛網格與平滑面）、armCell／cell（打掉一格：附近的區重建）、pieceNew／pieceGone（碎塊）、phys（物理開關）；
//   這裡訂閱（view：無頭時不收 ⇒ 不建網格、不上 GPU）。函式本身照舊（搬家不改內容），誰叫它們寫在每一段的說明裡。
// ⛔ 模擬物件身上還掛著畫的狀態（sh.rs、a.rs、pc.rs、a.smR…）：模擬檔不讀它們；無頭時它們不存在 ⇒ 會碰到的地方（70_flow.js reset、armDispose）先看有沒有。

// ── 裝甲（24_armor.js）──
/** 船型 T 的裝甲上 GPU（05_hull.js「船體網格」那一步，smoothSetup 之後）：每塊一份合併網格與平滑面（開戰時每艘共用，被打到的區才各自重建）。
 *  平滑面的格角碰到船殼（T.hullG）⇒ 釘在格角上（跟拆出來之前一樣：圓筒底那一圈貼著甲板、不往上縮）。 */
function armorMesh(T) {
  (T.armor || []).forEach(function (A) {
    A.rs0 = new VK.RegionSet(gl, A.grid, QIDX); A.rs0.buildAll();
    A.smP = null; if (!T.smRK) return;
    var nx = Math.ceil(T.h.size[0] / SM_R), ny = Math.ceil(T.h.size[1] / SM_R), b = A.bb;
    A.smP = new Map();
    T.smRK.forEach(function (rk) {
      var rx = rk % nx, ry = Math.floor(rk / nx) % ny, rz = Math.floor(rk / (nx * ny));   // 區碰不到這塊的外框（±2 格：surface nets 看鄰格）⇒ 跳過
      if ((rx + 1) * SM_R < b[0] - 2 || rx * SM_R > b[3] + 2 || (ry + 1) * SM_R < b[1] - 2 || ry * SM_R > b[4] + 2 || (rz + 1) * SM_R < b[2] - 2 || rz * SM_R > b[5] + 2) return;
      var m = smBuild(T, A.grid, rk, null, T.hullG); if (m) A.smP.set(rk, m);
    });
  });
  (T.props || []).forEach(function (P) {                                // 會轉的體素件（螺旋槳；檔尾）：材質標 smooth（鐵甲）⇒ 整份平滑＋金屬反光（Tim 2026-10-17），方塊網格化跳過它們
    var mt = matInfo(P.mat); P.smP = P.smRK = P.smO = null;
    if (mt.smooth === true) { P.grid.sm = P.grid; P.smO = { SG: P.grid, mm: +mt.metal || 0, mr: isFinite(+mt.rough) && mt.rough !== undefined ? +mt.rough : 0.5 }; P.smRK = smRegions(T, P.grid); P.smP = new Map();
      P.smRK.forEach(function (rk) { var m = smBuild(T, P.grid, rk, null, null, P.smO); if (m) P.smP.set(rk, m); }); }
    P.rs0 = new VK.RegionSet(gl, P.grid, QIDX); P.rs0.buildAll();
  });
}
evOn('armorShip', function (sh) {                                     // 開船（24_armor.js armorShip）：每塊共用船型那一份網格與平滑面，被打到的區才各自重建
  sh.arm.forEach(function (a) { if (a.rs) return; a.rs = new VK.RegionSet(gl, a.grid, QIDX); a.rs.shareFrom(a.A.rs0); smShare(a, a.A.smP); });
}, 0, true);
evOn('armCell', function (a, x, y, z) { a.rs.touch(x, y, z); if (a.smD) smTouch(a, x, y, z); }, 0, true);   // 打掉裝甲的一格（24_armor.js armRemove）
/** 畫船殼那一趟（60_render.js drawHulls，cutSet 之後）：每塊照自己的矩陣畫；剖面 uCutL ＝ 裝甲 → 船的格座標（01_gl.js voxFS），畫完放回單位矩陣。 */
function armDraw(prog, sh) {
  sh.arm.forEach(function (a) {
    if (a.prop && propGone(a)) return;                                  // 螺旋槳的模型掉了（掛的那一格被打斷）⇒ 不畫（飛出去的是模型的網格，21_gunnery.js blowModel）
    var L = armLocal(a);
    gl.uniformMatrix4fv(prog.u.uModel, false, L ? M4.mul(sh.M, L) : sh.M);
    if (prog.u.uCutL) gl.uniformMatrix4fv(prog.u.uCutL, false, L || CUT_ID);
    a.rs.draw();
  });
  if (prog.u.uCutL) gl.uniformMatrix4fv(prog.u.uCutL, false, CUT_ID);
}
/** 平滑面（drawModels，smDraw 之後）：P.tri 的剖面照世界座標換回船的格座標（uCutInv ＝ sh.inv）⇒ 轉過也切得對。 */
function armSmDraw(prog, sh) { sh.arm.forEach(function (a) { if (a.smR && a.smR.size && !(a.prop && propGone(a))) smDraw(prog, a, armM(a)); }); }   // 螺旋槳掉了 ⇒ 不畫
/** 重網格化（60_render.js remesh）：方塊照預算、平滑面照 sl 區；回 [剩的預算, 剩的區]。 */
function armRemesh(sh, left, sl) {
  sh.arm.forEach(function (a) {
    if (left > 0 && a.rs.dirty.size) left -= rsFlushSome(a.rs, left);
    if (sl > 0 && a.smD && a.smD.size) sl -= smFlush(a, sl);
  });
  return [left, sl];
}
/** 重開一場（70_flow.js reset）：這艘自己的緩衝丟掉（共用船型的那幾份不動）。 */
function armDispose(sh) {
  if (!sh.arm) return;
  sh.arm.forEach(function (a) { if (a.rs) a.rs.dispose(); if (a.smR) a.smR.forEach(function (m) { if (m.own) smFree(m); }); });
}

// ── 船殼與碎塊（20_shatter.js、22_pieces.js）──
evOn('cell', function (sh, x, y, z) { sh.rs.touch(x, y, z); if (sh.smD) smTouch(sh, x, y, z); }, 0, true);   // 打掉船殼的一格（20_shatter.js removeVoxel）：附近的區重建
evOn('pieceNew', function (pc) { pc.rs = new VK.RegionSet(gl, pc.grid, QIDX); rsAllDirty(pc.rs); }, 0, true);   // 網格分批建（60_render.js remesh；⛔ buildAll ⇒ 十萬格的半截船那一格卡上百 ms）
evOn('pieceGone', function (pc) { if (pc.rs) pc.rs.dispose(); }, 0, true);   // 沉下去、漂走（50_sim.js step）

// ── 模型網格（05_hull.js「模型網格」那一步；家具 36_rooms.js furnMesh 只算三角形與佔格，第一次畫到才上傳）──
function buildMeshes(H, C) {      // 船型 H 的每份模型網格一個 VAO：三角形展開、平面法線、材質色（P.tri 畫）；C ＝ 快取的 [{ tri, occ }]（06_cache.js）
  H.meshes = []; var keep = [];
  (H.rig.meshes || []).forEach(function (m, k) {
    var d = C ? C[k] : { tri: meshTris(m), occ: meshOcc(m) };
    var up = upload(null, d.tri, 9, [[0, 3, 0], [1, 3, 3], [2, 3, 6]]);
    up.occ = d.occ; H.meshes.push(up); keep.push(d);
  });
  if (H.keep) H.keep.models = keep;
}
var MESH_ATTR = [[0, 3, 0], [1, 3, 3], [2, 3, 6]];
/** 還沒上 GPU 的網格（36_rooms.js furnMesh 只留 tri、occ）⇒ 上傳（60_render.js 畫模型前叫）。 */
function meshGpu(me) { var u = upload(null, me.tri, 9, MESH_ATTR); me.vao = u.vao; me.vbo = u.vbo; me.n = u.n; me.tri = null; }

// ── 門（25_doors.js）──
/** 畫面那一格（90_main.js frame）：有人經過 ⇒ 開、沒人 ⇒ 關。只寫 m.sw／spv／sax（畫，modelLocal）。 */
function doorsAnim(dt) {
  SHIPS.forEach(function (sh) {
    if (!sh.doors) return;
    sh.doors.forEach(function (d) {
      var m = d.m; if (!m.alive || !d.a) return;
      var near = GFX.door && shPassers(sh, function (p) {                 // 經過 ＝ 正在走、正在爬（站著不動的不算）；第一人稱的玩家也算（81_fps.js shPassers）
        return Math.hypot(p[0] - m.c[0], p[1] - m.c[1]) < DOOR_R && Math.abs(p[2] - d.zt) < DOOR_RZ;
      });
      if (near) d.hold = DOOR_HOLD; else d.hold -= dt;
      d.t = GFX.door ? clamp(d.t + (d.hold > 0 ? 1 : -1) * DOOR_SP * dt, 0, 1) : 0;
      var e = d.t * d.t * (3 - 2 * d.t);                                  // 起步、停下都慢一點
      m.sw = e * d.deg; m.spv = d.a; m.sax = d.ax;
    });
  });
}

// ── 物理開關（30_rig_physics.js setPhys）──
evOn('phys', function () { $('physT').classList.toggle('on', PHYS); if ($('phxB')) phxShow(); }, 0, true);

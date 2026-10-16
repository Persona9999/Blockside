// ───────────────────────── 砲帶的裝甲（TASK-0631；Tim 2026-10-16：砲可以帶額外的裝甲（格子的子模組）—— 跟著砲轉、一格一格打掉、材質照材質表的鐵；第一個用的是莫尼特號的砲塔圓筒與頂）─────────────────────────
// 標法（雕刻作品的關聯 meta）：kind=armor、mount=<砲模型的路徑>（那門砲要有 meta mount=pivot｜turret，21_gunnery.js gunMountInit）；material、render 照舊（05_material.js、15_smooth.js）。
//   哪幾格：.vxk 檔頭 parts[].box（那個關聯在船上的外框，senate 匯出；⛔ 兩端都含 [x0, y0, z0, x1, y1, z1]：莫尼特號的圓筒 269–333 ＝ 65 格）裡的格全部算 ——
//   外框裡不能有別的關聯的格（匯入檢查照材質對不對得上抓一部分）。同一門砲的幾個關聯（莫尼特號：圓筒＋頂）合成一塊。
// 載入（armorSetup，05_hull.js buildHull：verify 與材質之後 ⇒ checksum 照整艘比、材質層與總重含裝甲）：
//   T.armor[k] ＝ { mount 那門砲的路徑, parts, grid（只有裝甲的格；座標 ＝ 船的格座標、轉 0 的樣子）, bb, n, t }；
//   T.hullG ＝ 船殼（T.base 拿掉裝甲；沒有裝甲 ⇒ 就是 T.base 那一份）：每艘的 sh.grid、合併網格、平滑面、進水的水格與破口、繩與模型的錨、桅照它。
//   T.base 照舊是整艘（含裝甲）：浮力表、甲板切高、艙房、羅盤的小船照它、浮力跟以前一樣（打掉不重算 —— 船殼也是）；
//   站位、走路格、第一人稱照 navBase／navG ＝ 再加上裝甲掃過的那一圈（TASK-0655，見 armRing；Tim：進砲塔只走住艙甲板的梯子艙口，TASK-0632）。
//   ⛔ 沒有 mount、找不到那門砲、那門砲不會轉 ⇒ 不拆：照舊是船殼的一部分、不轉（T.armBad，匯入檢查報）。
// 每艘（armorShip，10_ship.js makeShip，砲的迴旋設好之後）：sh.arm[k] ＝ { grid（共用、打掉才複製那一塊）, rs, 平滑面, g 那門砲 }；
//   轉 ＝ g.mt.yaw 繞 g.mt.c（跟砲的模型 modelLocal 同一個 rotM ⇒ 砲口永遠在砲門裡）；砲被打飛 ⇒ 停在最後的角度（mountStep 不再轉它）。
// 打中（21_gunnery.js stepBall）：船殼那一格是空的才看裝甲 —— 彈點反轉 yaw 換到裝甲的座標查格；打到 ⇒ 同一套 impact／shatter／slab（多帶一個 a）：
//   硬度、洞的大小照材質層（裝甲的格座標就是它原本的位置 ⇒ T.matG 直接查）、碎屑照裝甲的矩陣噴；傷人、模型扣血照船的座標。砲自己的血照舊（hitModel 先看）。
//   殉爆（23_powder.js）：彈坑碰得到 ⇒ 裝甲那幾格同一步打掉（armBlast；一塊才一萬多格，不分步）。
// 重量：T.voxT0 已含裝甲；打掉的照材質算減重（05_material.js voxLostT）。船體 %（sh.grid.count ／ sh.orig）只看船殼 ⇒ 開戰時 100%。
// 畫：drawHulls／drawModels 畫完船殼接著畫（armDraw／armSmDraw）；剖面照船的格座標切（方塊：uCutL ＝ 裝甲 → 船的格座標，01_gl.js voxFS；平滑面照 uCutInv 本來就是）。
// ⛔ 沒做：裝甲不會斷開漂走（打穿成兩半也照樣跟著砲轉）、碎屑落地／雨滴／船隻擦撞／除錯的 shot・hole 不看裝甲。
/** 船型 T：找 kind=armor 的關聯、拆出來（見檔頭）。 */
function armorSetup(T) {
  T.armor = []; T.armBad = []; T.hullG = T.base;
  var by = {}, models = T.rig.models || [], keys = [];
  (T.h.parts || []).forEach(function (p) {
    var mt = p.meta || {}; if (mt.kind !== 'armor') return;
    function bad(lv, msg, fix) { T.armBad.push({ lv: lv, where: p.path, msg: msg, fix: fix }); }
    if (!mt.mount) { bad('warn', 'kind=armor 沒有 mount ⇒ 照舊是船殼（不轉）', '關聯 meta mount=<砲模型的路徑>（那門砲的 meta 要有 mount=turret｜pivot）'); return; }
    var m = models.filter(function (q) { return q.name === mt.mount; })[0], gm = (m && m.meta) || {};
    if (!m) { bad('error', 'mount=' + mt.mount + ' 找不到這個模型 ⇒ 照舊是船殼（不轉）', 'mount 寫砲模型的完整路徑（例：甲板-main/砲塔）'); return; }
    if (gm.kind !== 'gun' || (gm.mount !== 'pivot' && gm.mount !== 'turret')) { bad('error', 'mount=' + mt.mount + ' 不是會轉的砲（要 meta kind=gun、mount=turret｜pivot）⇒ 照舊是船殼（不轉）', '那門砲的模型標 mount=turret（或 pivot），或拿掉這個關聯的 mount'); return; }
    if (!p.box || p.box.length !== 6) { bad('error', '檔頭沒有這個關聯的外框（box）⇒ 拆不出來、照舊是船殼', '重新匯出（senate 匯出會寫 parts[].box）'); return; }
    if (!by[mt.mount]) { by[mt.mount] = []; keys.push(mt.mount); }
    by[mt.mount].push(p);
  });
  keys.forEach(function (mount) {
    var G = new VK.Grid(T.h.size), parts = [], bb = [1e9, 1e9, 1e9, -1, -1, -1], n = 0, t = 0, B = T.base, MG = T.matG;
    by[mount].forEach(function (p) {
      var b = p.box, want = p.meta.material || null, P = { path: p.path, material: want, render: p.meta.render || '', n: 0, sm: 0, badMat: 0 };
      var x0 = Math.max(0, Math.floor(b[0])), y0 = Math.max(0, Math.floor(b[1])), z0 = Math.max(0, Math.floor(b[2])), x1 = Math.min(B.sx - 1, Math.floor(b[3])), y1 = Math.min(B.sy - 1, Math.floor(b[4])), z1 = Math.min(B.sz - 1, Math.floor(b[5]));   // 兩端都含
      for (var z = z0; z <= z1; z++) for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var c = B.get(x, y, z); if (!c || G.get(x, y, z)) continue;     // 兩個關聯的外框疊在一起 ⇒ 先列的那個拿
        if (T.hullG === B) T.hullG = B.share();                          // 共用 T.base 的資料，拆的那幾塊才複製
        G.set(x, y, z, c); T.hullG.set(x, y, z, 0); P.n++;
        var mi = MG ? MG.get(x, y, z) : 0; t += T.matT[mi];
        if (T.smG && T.smG.get(x, y, z)) P.sm++;
        if (want && T.matIds[mi] !== want) P.badMat++;
        if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (z < bb[2]) bb[2] = z; if (x > bb[3]) bb[3] = x; if (y > bb[4]) bb[4] = y; if (z > bb[5]) bb[5] = z;
      }
      if (!P.n) T.armBad.push({ lv: 'warn', where: p.path, msg: '外框裡沒有格（空的裝甲）', fix: '確認關聯的外框（parts[].box）框到裝甲的格，或拿掉 kind=armor' });
      if (P.badMat) T.armBad.push({ lv: 'warn', where: p.path, msg: '外框裡有 ' + P.badMat.toLocaleString('en') + ' 格的材質不是 ' + want + '（混了別的關聯的格？）⇒ 照它們自己的材質、一起跟著砲轉', fix: '外框裡只放這個關聯的格（別的關聯移出外框），或把材質標成一樣（造船規格 §9.5）' });
      parts.push(P); n += P.n;
    });
    if (!n) return;
    G.sm = B.sm;                                                         // 平滑渲染的旗標（不會變 ⇒ 共用船型那一份；VoxelKit 的方塊網格化跳過它們）
    T.armor.push({ k: T.armor.length, mount: mount, parts: parts, grid: G, bb: bb, n: n, t: t });
  });
}
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
}
/** 開一艘船（10_ship.js makeShip，gunMountInit 之後）：每塊裝甲一份（共用船型那一份格子與網格）。沒有裝甲 ⇒ sh.arm 不設（一行都不多算）。 */
function armorShip(sh) {
  var T = sh.T; if (!T.armor || !T.armor.length) return;
  sh.arm = T.armor.map(function (A) {
    var g = (sh.mounts || []).filter(function (q) { return q.model.path === A.mount; })[0] || null, grid = A.grid.share(), rs = new VK.RegionSet(gl, grid, QIDX);
    rs.shareFrom(A.rs0);
    var a = { A: A, T: T, sh: sh, g: g, grid: grid, rs: rs, pin: T.hullG, lost: 0 };
    if (g) armRing(A, g.mt.c);                                         // 掃過的那一圈（走路看的牆；TASK-0655）：船型第一艘算一次
    smShare(a, A.smP);
    return a;
  });
  sh.armN0 = T.armor.reduce(function (s, A) { return s + A.n; }, 0);   // 開戰時裝甲幾格（重量：32_hull.js shipT、05_material.js voxLostT）
}
/** 裝甲現在轉了多少（那門砲的 g.mt.yaw；沒找到砲 ⇒ 0）。 */
function armYaw(a) { var M = a.g && a.g.mt; return M ? M.yaw : 0; }
/** 裝甲的格座標 → 船的格座標（跟 modelLocal 同一個矩陣：平移到轉軸、繞 z 轉、平移回來）；沒轉 ⇒ null。 */
function armLocal(a) { var y = armYaw(a); if (!y) return null; var c = a.g.mt.c; return M4.mul(M4.mul(trans(c[0], c[1], c[2]), rotM([0, 0, 1], y)), trans(-c[0], -c[1], -c[2])); }
/** 世界矩陣（sh.M 照當下的：模擬那一步、或畫面內插過的）。 */
function armM(a) { var L = armLocal(a); return L ? M4.mul(a.sh.M, L) : a.sh.M; }
/** 船的格座標 p → 裝甲的格座標（反轉 yaw）；dir ⇒ 方向（不平移）。 */
function armIn(a, p, dir) { var y = armYaw(a); if (!y) return p; return rotZ(p, dir ? [0, 0, 0] : a.g.mt.c, -y); }
/** 裝甲的格座標 → 船的格座標。 */
function armOut(a, p) { var y = armYaw(a); return y ? rotZ(p, a.g.mt.c, y) : p; }
/** 船的格座標 L 落在哪一塊裝甲的格裡（沒有 ⇒ null）。 */
function armAt(sh, L) {
  for (var i = 0; i < sh.arm.length; i++) { var a = sh.arm[i], Q = armIn(a, L); if (a.grid.get(Math.floor(Q[0]), Math.floor(Q[1]), Math.floor(Q[2]))) return a; }
  return null;
}
/** 人員傷害擋不擋得住（TASK-0637；Tim 2026-10-16：「炮塔裝甲對內部炮組的防護力好像不太夠」）：船的格座標 a → b 這一段有沒有穿過裝甲（現在的角度、打掉的不算）。
 *  40_crew.js hurt（爆風、碎片、砲彈掠過、殉爆）、musket（火槍）用：穿過 ⇒ 那個人不受傷。每 0.5 格量一點；a 落在的那一格不算（爆點常在裝甲表面那一格裡：
 *  莫尼特號的牆只有 2 格厚，再多讓 ⇒ 牆外炸開的照樣穿進來）。牆被打穿、從砲門、頂的格柵縫看得到 ⇒ 照樣打得到。沒有裝甲的船不呼叫。 */
function armBetween(sh, a, b) {
  var d = sub(b, a), l = len(d); if (l < 1) return false;
  for (var i = 0; i < sh.arm.length; i++) {
    var ar = sh.arm[i], bb = ar.A.bb, Qa = armIn(ar, a), Qb = armIn(ar, b);
    if (Math.max(Qa[0], Qb[0]) < bb[0] - 1 || Math.min(Qa[0], Qb[0]) > bb[3] + 1 || Math.max(Qa[1], Qb[1]) < bb[1] - 1 || Math.min(Qa[1], Qb[1]) > bb[4] + 1 || Math.max(Qa[2], Qb[2]) < bb[2] - 1 || Math.min(Qa[2], Qb[2]) > bb[5] + 1) continue;   // 這一段碰不到這塊的外框
    var ax = Math.floor(Qa[0]), ay = Math.floor(Qa[1]), az = Math.floor(Qa[2]);
    for (var t = 0.5; t < l; t += 0.5) {
      var k = t / l, x = Math.floor(Qa[0] + (Qb[0] - Qa[0]) * k), y = Math.floor(Qa[1] + (Qb[1] - Qa[1]) * k), z = Math.floor(Qa[2] + (Qb[2] - Qa[2]) * k);
      if ((x !== ax || y !== ay || z !== az) && ar.grid.get(x, y, z)) return true;
    }
  }
  return false;
}
// 砲口（TASK-0644；Tim 2026-10-16：「炮塔有開射擊口 很容易被打到炮」「判斷砲彈路徑 只打中炮口的可以減少對炮組傷害」）：
//   砲彈先碰到帶裝甲的那門砲（21_gunnery.js stepBall：hitModel 比裝甲先看）⇒ 碰到的那一點在不在裝甲的內面外側（＝ 砲門裡、或伸出去的那一段）。
//   內面 ＝ 從轉軸（g.mt.c）水平往外，每一層（z）每個方位（64 份）第一格裝甲的距離（armPolar：照開局的形狀，打掉不改；每個船型算一次）。
//   砲門那個方位那一層是空的 ⇒ 看左右 4 份、再上下 3 層（砲門兩旁、上下的牆）；都沒有（那個方向本來就沒裝甲）⇒ 不算砲口。
//   砲口 ⇒ damageModel／blowModel 傷人改從碰到的那一點算（隔著裝甲的照 hurt 的 armBetween 擋掉）、不引爆砲旁的藥箱、砲班另外吃的那一份 × pen.muzzle。
var ARM_BINS = 64;
function armPolar(a) {
  var A = a.A; if (A.pol) return A.pol;
  var c = a.g.mt.c, bb = A.bb, G = A.grid, pol = {};
  for (var z = bb[2]; z <= bb[5]; z++) {
    var row = null;
    for (var y = bb[1]; y <= bb[4]; y++) for (var x = bb[0]; x <= bb[3]; x++) {
      if (!G.get(x, y, z)) continue;
      var dx = x + 0.5 - c[0], dy = y + 0.5 - c[1], d = Math.hypot(dx, dy), k = Math.floor((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * ARM_BINS) % ARM_BINS;
      row = row || (pol[z] = new Float32Array(ARM_BINS).fill(Infinity));
      if (d < row[k]) row[k] = d;
    }
  }
  return (A.pol = pol);
}
/** 船的格座標 L 在 m 那門砲的裝甲內面外側？（沒有裝甲、那門砲沒帶裝甲 ⇒ false） */
function armMuzzle(sh, m, L) {
  for (var i = 0; i < sh.arm.length; i++) {
    var a = sh.arm[i]; if (!a.g || a.g.model !== m) continue;
    var pol = armPolar(a), c = a.g.mt.c, Q = armIn(a, L), dx = Q[0] - c[0], dy = Q[1] - c[1], d = Math.hypot(dx, dy);
    var k = Math.floor((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * ARM_BINS) % ARM_BINS, z0 = Math.floor(Q[2]), rin = Infinity;
    for (var dz = 0; dz <= 3 && rin === Infinity; dz++) for (var s = dz ? -1 : 1; s <= 1 && rin === Infinity; s += 2) {
      var row = pol[z0 + s * dz]; if (!row) continue;
      for (var j = 0; j <= 4; j++) { rin = Math.min(rin, row[(k + j) % ARM_BINS], row[(k - j + ARM_BINS) % ARM_BINS]); if (rin < Infinity) break; }
    }
    return rin < Infinity && d >= rin - 0.5;
  }
  return false;
}
/** 裝甲原本的位置 (x, y, z)（裝甲的格座標）還有沒有格（重量照材質層的座標數）。 */
function armGet(sh, x, y, z) { for (var i = 0; i < sh.arm.length; i++) if (sh.arm[i].grid.get(x, y, z)) return 1; return 0; }
function armCount(sh) { var n = 0; for (var i = 0; i < sh.arm.length; i++) n += sh.arm[i].grid.count; return n; }
// 掃過的那一圈（TASK-0655；Tim 2026-10-16：「砲塔做成無法通行(這個應該要是通用規格)」「雖然會旋轉 但實際上有一圈物理阻隔通行」）：
//   會轉的裝甲每一格繞轉軸掃出一圈 ⇒ 每一層（z）記下掃到的半徑（1／ARM_RK 格一份；一格掃到格心距離 ± 0.71 格）；走路看的格子（navBase／navG）在那些半徑上一律算實心。
//   莫尼特號：圓筒那幾層 ＝ 內緣到外緣一整環（砲門跟著轉、不留縫），頂 ＝ 整個圓。照開局的形狀算、每個船型一次（A.ring）；被打掉的格第一版不打開那一圈（砲塔還在就照樣擋）。
//   出入只走圈裡的艙口梯（莫尼特號：梯子/turret，住艙甲板 → 砲塔底下的艙口）；圈裡沒有梯子 ⇒ 匯入檢查警告（75_shipcheck.js）。
//   用的：第一人稱（81_fps.js）、船員的走路格與站位（42_hands.js navBuild／navRefresh、40_crew.js makeCrew／goToGun）。⛔ 沒用：火藥桶、取用點（23_powder.js 照舊看 T.base）。
var ARM_RK = 2;
/** 船型的一塊裝甲 A 繞 c（那門砲的轉軸，船的格座標）掃過的那一圈（armorShip 第一艘算、存在 A.ring）。 */
function armRing(A, c) {
  if (A.ring) return A.ring;
  var bb = A.bb, G = A.grid, rows = {}, rmax = 0, x, y, z;
  var far = Math.max(Math.hypot(bb[0] - c[0], bb[1] - c[1]), Math.hypot(bb[3] + 1 - c[0], bb[1] - c[1]), Math.hypot(bb[0] - c[0], bb[4] + 1 - c[1]), Math.hypot(bb[3] + 1 - c[0], bb[4] + 1 - c[1])), N = Math.ceil((far + 1) * ARM_RK) + 1;
  for (z = bb[2]; z <= bb[5]; z++) for (y = bb[1]; y <= bb[4]; y++) for (x = bb[0]; x <= bb[3]; x++) {
    if (!G.get(x, y, z)) continue;
    var d = Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1]), row = rows[z] || (rows[z] = new Uint8Array(N));
    for (var k = Math.max(0, Math.floor((d - 0.71) * ARM_RK)), k1 = Math.min(N - 1, Math.floor((d + 0.71) * ARM_RK)); k <= k1; k++) row[k] = 1;
    if (d + 0.71 > rmax) rmax = d + 0.71;
  }
  return (A.ring = { c: [c[0], c[1]], z0: bb[2], z1: bb[5], rows: rows, r: rmax });
}
/** (x, y, z)（船的格座標）在不在哪一塊裝甲掃過的那一圈裡（沒有圈的那塊 ⇒ 照它原本的格）。 */
function armWall(T, x, y, z) {
  for (var i = 0; i < T.armor.length; i++) {
    var A = T.armor[i], R = A.ring;
    if (!R) { if (A.grid.get(x, y, z)) return 1; continue; }
    if (z < R.z0 || z > R.z1) continue;
    var row = R.rows[z]; if (!row) continue;
    var d = Math.hypot(x + 0.5 - R.c[0], y + 0.5 - R.c[1]);
    if (d <= R.r && row[Math.floor(d * ARM_RK)]) return 1;
  }
  return 0;
}
/** 那一圈在 z0 往上 h 層裡的內緣半徑（格；圈裡站人的地方 ＝ 比它近）：匯入檢查、讀數用。沒有 ⇒ 0。 */
function armRingIn(R, z0, h) {
  var best = Infinity;
  for (var z = z0; z < z0 + h; z++) { var row = R.rows[z]; if (!row) continue; for (var k = 0; k < row.length; k++) if (row[k]) { best = Math.min(best, k / ARM_RK); break; } }
  return best === Infinity ? 0 : best;
}
/** 開戰時的走路格、站位看的格子（42_hands.js navBuild、40_crew.js makeCrew）：T.base ＋ 會轉的裝甲掃過的那一圈；沒有裝甲 ⇒ 就是 T.base。 */
function navBase(T) {
  if (!T.armor || !T.armor.length) return T.base;
  var B = T.base;
  return T.navB || (T.navB = { sx: B.sx, sy: B.sy, sz: B.sz, get: function (x, y, z) { return B.get(x, y, z) || armWall(T, x, y, z); } });
}
/** 走路格、站位看的格子（42_hands.js navRefresh、40_crew.js goToGun、81_fps.js 第一人稱）：船殼（打掉的照現在）＋裝甲掃過的那一圈（不轉、打掉也照樣擋：見上面）。 */
function navG(sh) {
  if (!sh.arm) return sh.grid;
  var g = sh.grid, T = sh.T;
  return sh.navG || (sh.navG = { sx: g.sx, sy: g.sy, sz: g.sz, get: function (x, y, z) { return sh.grid.get(x, y, z) ? 1 : armWall(T, x, y, z); } });
}
/** 打掉裝甲的一格（20_shatter.js removeVoxel 的裝甲版：不進水、不改走路格、不推連通的種子）。回：原本的色（0 ＝ 本來就沒有）。 */
function armRemove(sh, a, x, y, z) {
  var c = a.grid.set(x, y, z, 0);
  if (c <= 0) return 0;
  a.rs.touch(x, y, z); a.lost++; sh.lost++;
  if (a.smD) smTouch(a, x, y, z);                                       // 平滑面：附近的區重建（15_smooth.js）
  return c;
}
/** 殉爆的彈坑（23_powder.js；c ＝ 爆心的船的格座標、R 格、w 世界座標）碰得到的裝甲：跟 blastStep 同一個參差的球，這一步就打掉；碎屑只抽碎木的亂數（戰局的 rnd() 不動）。 */
function armBlast(sh, c, R, w) {
  if (!sh.arm) return 0;
  var n = 0, R2 = R * 1.15;
  sh.arm.forEach(function (a) {
    var Q = armIn(a, c), b = a.A.bb, removed = [];
    var x0 = Math.max(b[0], Math.floor(Q[0] - R2)), x1 = Math.min(b[3], Math.ceil(Q[0] + R2)), y0 = Math.max(b[1], Math.floor(Q[1] - R2)), y1 = Math.min(b[4], Math.ceil(Q[1] + R2)), z0 = Math.max(b[2], Math.floor(Q[2] - R2)), z1 = Math.min(b[5], Math.ceil(Q[2] + R2));
    for (var z = z0; z <= z1; z++) for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      if (!a.grid.get(x, y, z)) continue;
      var dx = x - Q[0], dy = y - Q[1], dz = z - Q[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) > R * (0.85 + 0.3 * hash3(x, y, z))) continue;
      var col = armRemove(sh, a, x, y, z); if (col) { n++; removed.push(x, y, z, col); }
    }
    if (!removed.length) return;
    var Mw = armM(a), k = Math.max(1, Math.round(removed.length / 4 / 60));
    for (var j = 0; j < removed.length; j += 4 * k) {
      var p = M4.pt(Mw, removed[j] + 0.5, removed[j + 1] + 0.5, removed[j + 2] + 0.5), dir = norm(sub(p, w));
      spawnDebris(p, add(add(mul(dir, rD(8, 40)), [0, rD(4, 22), 0]), sh.vel), removed[j + 3], rD(0.06, 0.16), rD(8, 16));
    }
    spawnPlates(sh, removed, [0, 1, 0], 30, 3, 20, Mw);
  });
  return n;
}
/** 畫船殼那一趟（60_render.js drawHulls，cutSet 之後）：每塊照自己的矩陣畫；剖面 uCutL ＝ 裝甲 → 船的格座標（01_gl.js voxFS），畫完放回單位矩陣。 */
function armDraw(prog, sh) {
  sh.arm.forEach(function (a) {
    var L = armLocal(a);
    gl.uniformMatrix4fv(prog.u.uModel, false, L ? M4.mul(sh.M, L) : sh.M);
    if (prog.u.uCutL) gl.uniformMatrix4fv(prog.u.uCutL, false, L || CUT_ID);
    a.rs.draw();
  });
  if (prog.u.uCutL) gl.uniformMatrix4fv(prog.u.uCutL, false, CUT_ID);
}
/** 平滑面（drawModels，smDraw 之後）：P.tri 的剖面照世界座標換回船的格座標（uCutInv ＝ sh.inv）⇒ 轉過也切得對。 */
function armSmDraw(prog, sh) { sh.arm.forEach(function (a) { if (a.smR && a.smR.size) smDraw(prog, a, armM(a)); }); }
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
  sh.arm.forEach(function (a) { a.rs.dispose(); if (a.smR) a.smR.forEach(function (m) { if (m.own) smFree(m); }); });
}
/** 點選瞄準（71_input.js pick）：射線也打裝甲（換到它的座標打、碰到的那一格換回船的格座標；回傳的 x、y、z 跟 VK.raycast 一樣 ＋0.5 ＝ 格心）。 */
function armRay(o, oL, dL, tMax) {
  var best = null;
  o.arm.forEach(function (a) {
    var h = VK.raycast(a.grid, armIn(a, oL), armIn(a, dL, true), tMax); if (!h || (best && h.t >= best.t)) return;
    var P = armOut(a, [h.x + 0.5, h.y + 0.5, h.z + 0.5]); best = { x: P[0] - 0.5, y: P[1] - 0.5, z: P[2] - 0.5, t: h.t, c: h.c };
  });
  return best;
}
/** 砲口在不在砲門裡：每個砲口（g.muzs，沒有 ⇒ g.muz）沿砲軸從砲口往後 2 格、往外走到裝甲外框外面，每 0.25 格量一點，換到裝甲的座標碰到幾格（0 ＝ 穿過砲門）。
 *  匯入檢查、?debug=1 的 __game.armor 量（Tim 的驗收：轉到哪個角度兩個砲口都在砲門裡）。 */
function armBlock(a) {
  var g = a.g; if (!g) return null;
  var ax = g.ax, b = a.A.bb, far = Math.hypot(b[3] - b[0], b[4] - b[1]) + 4;
  return (g.muzs || [g.muz]).map(function (m) {
    var hit = 0;
    for (var t = -2; t <= far; t += 0.25) { var Q = armIn(a, [m[0] + ax[0] * t, m[1] + ax[1] * t, m[2]]); if (a.grid.get(Math.floor(Q[0]), Math.floor(Q[1]), Math.floor(Q[2]))) hit++; }
    return hit;
  });
}
/** 讀數（匯入檢查 info.armor）：每塊 ＝ 那門砲：每個關聯幾格（材質、平滑幾格）、合計幾格幾噸。 */
function armSummary(T) {
  if (!T.armor || !T.armor.length) return '';
  return T.armor.map(function (A) {
    return A.mount + '：' + A.parts.map(function (P) { return P.path + ' ' + P.n.toLocaleString('en') + ' 格（' + (P.material ? matInfo(P.material).name : '材質照預設') + (P.sm ? '、平滑 ' + P.sm.toLocaleString('en') : '') + '）'; }).join('＋') +
      ' ＝ ' + A.n.toLocaleString('en') + ' 格、' + A.t.toFixed(1) + ' 噸，跟著砲轉';
  }).join('；') + '（船殼 ' + T.hullG.count.toLocaleString('en') + ' 格）';
}

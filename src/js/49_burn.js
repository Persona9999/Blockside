// ───────────────────────── 著火：點燃、延燒、滅火、帆燒起來（TASK-0717） ─────────────────────────
// Tim 2026-10-18：「可以趁現在空檔 加一下著火效果(希臘火可以讓木材起火) 火會延燒 然後船員會去滅火」「著火效果直接做在Blockside專案」
//   「帆也可以燒起來(可以嘗試真的燒掉帆的演出 出現邊緣焦黑以及逐漸燒掉)」
// 這支只有模擬（點燃、延燒、燒穿、滅火、燒帆、廣播的事件）；火焰、黑煙、火光、潑水在 59_burnfx.js，帆的焦痕與破洞在著色器（01_gl.js BURN_GLSL）。
// 參數全在設定檔 burn 那一節（config/game.json；admin.py BURN_NUMS 驗）＋細節設定「火勢」BURN_PCT（%，lim.burn；0 ＝ 希臘火不點火）。
// 點燃：希臘火潑開（28_fire.js gfSplash ⇒ burnSplash）⇒ 半徑 ign 格裡、有一面露在乾空氣裡的格，照那一格材質的 flammable（05_material.js matAt）× ignP 著（一著就是滿火勢）；
//   潑到帆、飛過帆（21_gunnery.js cutRig）⇒ 那面帆從最近的那一點燒起來（burnSailAt）。鐵色的格（HARD 36／146）、金屬材質（flammable 0）不燒。
// 一格的火：熱度 h（0–1；每秒 + grow × flammable）、燒了多久 t（× h 累加）；t 到 life × (1.5 − flammable)（橡木約 30 秒）⇒ 燒穿 ＝ removeVoxel
//   （照打掉格那一條：進水、尋路、繩、斷開都跟著）；燒過一半換成焦黑色；熄了（h ≤ 0：有人潑水、下雨、泡進水裡）⇒ 留焦痕，焦過的格再著的機率 × reK。
//   ⛔ 公式進水（物理效果「進水」不是粒子）：水線下的格只燒焦、不燒穿 —— 公式照「水線下少了幾格」算進水，燒掉艙裡的地板也會被當成破口（32_hull.js）。
// 延燒：每一拍每格照熱度往 18 個鄰格試（往上 up 倍、往下 down 倍），鄰格照自己的 flammable 著；火苗竄到正上方 jumpZ 格內的下一層（天花板、上一層甲板）。
//   每一拍 ＝ tick 秒；每艘、每格分在不同的步（相位 ＝ 著火的順序，船照 sh.i × SURVEY_PH 錯開）⇒ ⛔ 不擠在同一步。上限：每艘同時 max 格、每拍燒穿 outMax 格、換色 tintMax 格。
// 火場（spot）：3.2 × 3.2 × 1.6 m 一區 ⇒ 預備水手照火場大小派去潑水（跟抽水機同一套：32_hull.js survey burnTick → 42_hands.js callHands burnNeeds，pri 0.5 ＝ 交戰那一舷的砲班之後）；
//   站到了 ⇒ 那一區每格每秒的熱度一起降 douse × 人數 ÷ 格數；火場旁的人燒傷（hurt）、火藥桶被烤（照舊 powderHit ⇒ 「彈藥庫起火！」）。降旗的船沒人點名 ⇒ 沒人救火。
// 帆：每面帆的每個頂點記火「什麼時候燒到」a、「什麼時候撲滅」x（起火那一刻沿布的邊算一次最短時間 burnDij：往上快、往下慢、每條邊照雜湊抖一點，⛔ 不抽亂數）⇒
//   著色器照 (min(現在, x) − a) ÷ sailBurn 畫焦黃、焦黑的邊、燒紅的燒口、燒穿的洞（discard）⇒ 模擬一拍一次，畫面上照樣連續往外燒、撲滅就停在那一刻。
//   洞的面積 ⇒ 帆的血量（推力照舊跟著血量掉，31_sailing.js）；燒掉 sailDrop 成、或一半的綁定點燒掉 ⇒ 帆掉下來（dropSail）；
//   燒到綁在格上的點 ⇒ 帆桁、桅那一格著火；燒口偶爾跳到旁邊的帆（sailJump）；船殼的大火往上燒到帆（flameK × √格數 格高）。
//   帆的火：預備水手站在帆底下（帆匠那一點 smSpot）cutT 秒 ⇒ 低的帆（帆腳離露天甲板 sailReach 格內）潑熄，高的割下來；下雨也會熄。
//   著火中的帆帆匠不補（47_sailmaker.js smScan）；補好 ＝ 換新帆布（s.burn 清掉）；帆布不夠全補 ⇒ 不補一半（⛔ 補了血量、洞還在）。
// 決定性：狀態全是第一次著火才建（sh.burn、s.burn、T.burnT、T.burnSB）；亂數只走 rngMake('fire') ⇒ 沒有希臘火的對局一位元不動（不建、不抽、不進分支）。
//   ?burn=0 ⇒ 希臘火照舊（只燒人、撕帆、燒細繩，28_fire.js 以前那樣），對拍 4bd1003 的成品一位元不差。
// 讀數：__game.burn(i)（DEBUG）、?dump 的 burn（著過火的船才有）、詳細資訊的「🔥 火災」圖（61_hud.js gmapFire）。
var BURN = CFG.burn, BURN_NEVER = 1e6, BURN_EMBER = 164, BURN_CHAR1 = 68, BURN_CHAR2 = 32;   // 色碼（rgb332）：燒著 182,36,0／焦 73,36,0／焦黑 36,0,0（⛔ 不用 36、146：那是鐵的硬度 HARD）
var RNG_FI = rngMake('fire', 0x5BE0CD19), rndFire = RNG_FI.f;      // 延燒、點燃、帆的抖動種子（⛔ 不用 rnd()：那是戰局那一條）
var BURN_N6 = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1], BURN_DIR = [], BURN_CW = [];   // 六面（有沒有露在空氣裡）；18 鄰格（面＋邊）與累加權重（往上 up、往下 down）
(function () {
  var s = 0;
  for (var dz = -1; dz <= 1; dz++) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
    var m = Math.abs(dx) + Math.abs(dy) + Math.abs(dz); if (!m || m === 3) continue;
    BURN_DIR.push(dx, dy, dz); s += dz > 0 ? BURN.up : dz < 0 ? BURN.down : 1; BURN_CW.push(s);
  }
})();
/** 這艘的火（第一次著火才建）：燒著的格（平行陣列、刪的時候拿最後一個補）、等著加進去的、每格的狀態、火場、燒著的帆、讀數。 */
function burnOf(sh) {
  if (sh.burn) return sh.burn;
  var g = sh.grid, wd = sh.weatherDeck && sh.deckZ[sh.weatherDeck];
  return (sh.burn = {
    p: [], h: [], t: [], d: [], f: [], ph: [], n: 0, seq: 0,          // 燒著的格：壓好的座標、熱度、燒了多久、燒穿要多久、易燃性、第幾步算它（相位）
    q: [],                                                             // 這一步新著的 [壓好的座標, 熱度, 易燃性]（迴圈跑完才加，⛔ 邊跑邊加 ⇒ 同一拍又燒一次）
    g: new VK.Grid([g.sx, g.sy, g.sz]),                                // 每格：0 沒事、1 燒著、2 熄了（焦）、3 燒穿
    spots: new Map(), spotSeq: 0,                                      // 火場（船殼的照分區、帆 'S'＋第幾面）；Map 照加進去的順序走 ⇒ 每次一樣
    sl: [],                                                            // 燒著的帆
    chP: [], chK: [],                                                  // 焦的（2）／燒穿的（3）格（只給詳細資訊的圖看）
    zSky: wd ? wd[0] - 2 : sh.T.zw + 30,                               // 這個高度以上淋得到雨（露天甲板的地板）
    kegs: null, lit: false, ct: SIMT, sv: 0, tint: 0, out: 0,          // sv：帆的火變了（48_damage.js dmgRigStamp ⇒ 帆匠重掃）
    ignN: 0, outN: 0, goneN: 0, thruN: 0, maxN: 0, sailN: 0, sailGoneN: 0, sailOutN: 0 });
}
/** 火場的分區（32 × 32 × 16 格 ＝ 3.2 × 3.2 × 1.6 m）。 */
function burnKey(x, y, z) { return (x >> 5) + 64 * ((y >> 5) + 32 * (z >> 4)); }

// ── 點燃 ──
/** 希臘火潑開（28_fire.js gfSplash）：船 sh 的格座標 L 附近半徑 ign 格的格照材質著火；旁邊 sailR 格內的帆也著。
 *  r、sr（選填）：點火、燒帆的半徑換成別的（火箭 28_fire.js fireArrowHit 用小的；沒給 ⇒ 照設定檔，希臘火一位元不動）。 */
function burnSplash(sh, L, b, r, sr) {
  if (!(BURN_PCT > 0)) return;
  var B = burnOf(sh), R = r > 0 ? r : BURN.ign, cx = Math.floor(L[0]), cy = Math.floor(L[1]), cz = Math.floor(L[2]), n = 0;
  for (var dz = -R; dz <= R && n < BURN.ignMax; dz++) for (var dy = -R; dy <= R && n < BURN.ignMax; dy++) for (var dx = -R; dx <= R && n < BURN.ignMax; dx++)
    if (dx * dx + dy * dy + dz * dz <= R * R && burnCatch(sh, B, cx + dx, cy + dy, cz + dz, 1, BURN.ignP)) n++;   // 希臘火一著就是滿火勢
  burnFlush(sh, B, true);
  burnSailNear(sh, L, sr > 0 ? sr : BURN.sailR);
}
/** 試著點 (x, y, z)：照材質的 flammable × k 著（焦過的 × reK）。⛔ 先做不用亂數的判斷、最後才抽一次 ⇒ 著不了的格不抽。 */
function burnCatch(sh, B, x, y, z, h0, k) {
  var c = sh.grid.get(x, y, z); if (!c || c === 36 || c === 146) return false;   // 空的、鐵色（砲、錨、鐵件）不燒
  var st = B.g.get(x, y, z); if (st === 1 || B.n + B.q.length / 3 >= BURN.max) return false;
  var f = +matAt(sh, x, y, z).flammable || 0; if (st === 2) f *= BURN.reK; if (!(f > 0)) return false;
  if (!burnAir(sh, x, y, z) || rndFire() >= f * k) return false;
  B.g.set(x, y, z, 1); B.q.push(VK.pack(x, y, z), h0, f); return true;
}
/** 這一格有一面露在乾的空氣裡嗎：六個面有一面是空的、又不在海面下（船殼外形裡 ⇒ 看艙內的水滿了一半沒，粒子模式才有）。 */
function burnAir(sh, x, y, z) {
  var g = sh.grid, T = sh.T, hb = T.hullHB;
  for (var k = 0; k < 18; k += 3) {
    var nx = x + BURN_N6[k], ny = y + BURN_N6[k + 1], nz = z + BURN_N6[k + 2]; if (g.get(nx, ny, nz)) continue;
    var P = [nx + 0.5, ny + 0.5, nz + 0.5], inside = hb && nx >= 0 && nx < T.hullTW && nz >= 0 && nz < T.hullTH && Math.abs(ny + 0.5 - T.cy) < hb[nz * T.hullTW + nx];
    if (inside ? !wetAt(sh, P, { sea: false, inner: 0.5 }) : !wetAt(sh, P)) return true;
  }
  return false;
}
/** 這一步新著的格加進燒著的那一串（相位照著火的順序輪；燒穿要多久照材質、每格照雜湊差一點）。force ⇒ 換色不算每拍的上限（希臘火潑開：一次最多 ignMax 格）。 */
function burnFlush(sh, B, force) {
  if (!B.q.length) return;
  var NB = everySteps(BURN.tick);
  for (var i = 0; i < B.q.length; i += 3) {
    var p = B.q[i], f = B.q[i + 2], x = p & 2047, y = (p >> 11) & 1023, z = p >> 21;
    B.p.push(p); B.h.push(B.q[i + 1]); B.t.push(0); B.f.push(f); B.ph.push(B.seq++ % NB);
    B.d.push(BURN.life * (1.5 - f) * (0.8 + 0.4 * hash3(x, y, z))); B.ignN++;
    burnTint(sh, B, x, y, z, BURN_EMBER, force);
  }
  B.q.length = 0; B.n = B.p.length; if (B.n > B.maxN) B.maxN = B.n;
}

// ── 每一步（50_sim.js：砲彈之後、integrity 之前 ⇒ 燒穿斷開的那一團同一步掉）──
/** 這艘的火：這一步輪到的那幾格走一拍（tick 秒）；一拍的第一步再算帆、火場、有沒有在燒。沉了 ⇒ 全熄。 */
function burnStep(sh) {
  var B = sh.burn, NB = everySteps(BURN.tick), ph = (Math.round(SIMT / DT) + sh.i * SURVEY_PH) % NB, dt = NB * DT;
  if (sh.sunk) { if (B.n || B.sl.length || B.q.length) burnClear(sh, B); return; }
  B.tint = 0; B.out = 0;                                               // 每拍的上限分到每一步（÷ NB）：⛔ 不分 ⇒ 前面幾個相位先吃光、後面的永遠輪不到
  if (B.n) burnCells(sh, B, ph, dt, NB);
  burnFlush(sh, B, false);
  if (ph === 0) { burnSails(sh, B, dt); burnSpots(sh, B, dt); burnLit(sh, B); }
}
function burnCells(sh, B, ph, dt, NB) {
  var g = sh.grid, K = BURN_PCT / 100, rain = WX.rain > 0 ? BURN.rain * WX.rain * dt : 0, wz = Math.floor(sh.T.zw + (sh.sink - sh.lift - sh.bob) / S);   // wz：現在平靜時的水線（32_hull.js 同一條）
  var outCap = Math.ceil(BURN.outMax / NB);
  for (var i = 0; i < B.n; i++) {
    if (B.ph[i] !== ph) continue;
    var p = B.p[i], x = p & 2047, y = (p >> 11) & 1023, z = p >> 21;
    if (!g.get(x, y, z)) { B.g.set(x, y, z, 3); burnDrop(B, i--); continue; }        // 被打掉了、被斷開的那一團帶走了（22_pieces.js）⇒ 這裡不燒了
    var sp = B.spots.get(burnKey(x, y, z)), h = B.h[i] + dt * BURN.grow * B.f[i];
    if (sp && sp.have) h -= dt * BURN.douse * sp.have / Math.max(1, sp.n);              // 潑水：這一區站到的人數 × douse，分給那一區的每一格
    if (rain && z >= B.zSky) h -= rain;                                                // 淋得到雨
    if (z <= wz + 2 && !burnAir(sh, x, y, z)) h = 0;                                   // 泡進水裡（海面下、艙裡淹了一半）
    if (h <= 0) { burnQuench(sh, B, i--, x, y, z); continue; }
    B.h[i] = h = Math.min(1, h); B.t[i] += dt * h;
    if (B.t[i] >= B.d[i]) { if (B.out < outCap) { burnThrough(sh, B, i--, x, y, z, wz); continue; } }   // 燒穿（超過這一步的上限 ⇒ 下一拍再說，照樣延燒）
    else if (B.t[i] > B.d[i] * (0.55 + 0.3 * hash3(x, z, y))) burnTint(sh, B, x, y, z, BURN_CHAR2, false);   // 燒過一半多 ⇒ 焦黑（每格照雜湊早晚不同 ⇒ 不是一整片同時變）
    for (var k = BURN.spread * K * h * dt; k > 0; k -= 1) { if (k < 1 && rndFire() >= k) break; burnTry(sh, B, x, y, z); }
    if (BURN.jump > 0 && rndFire() < BURN.jump * K * h * dt) burnJump(sh, B, x, y, z);
  }
}
/** 往一個鄰格試（照權重挑方向：往上多、往下少）。 */
function burnTry(sh, B, x, y, z) {
  var r = rndFire() * BURN_CW[BURN_CW.length - 1], d = 0; while (BURN_CW[d] < r) d++;
  burnCatch(sh, B, x + BURN_DIR[d * 3], y + BURN_DIR[d * 3 + 1], z + BURN_DIR[d * 3 + 2], BURN.h0, 1);
}
/** 火苗往上竄：正上方是空的 ⇒ jumpZ 格內碰到的下一格（上一層甲板的底面、橫樑）。 */
function burnJump(sh, B, x, y, z) {
  var g = sh.grid; if (g.get(x, y, z + 1)) return;
  for (var k = 2; k <= BURN.jumpZ; k++) if (g.get(x, y, z + k)) { burnCatch(sh, B, x, y, z + k, BURN.h0, 1); return; }
}
/** 燒穿：照打掉格那一條（removeVoxel：進水、尋路、繩、斷開）。公式進水、水線下 ⇒ 只燒焦（見檔頭）。 */
function burnThrough(sh, B, i, x, y, z, wz) {
  B.out++;
  if (!sh.fl && z <= wz) { burnQuench(sh, B, i, x, y, z); return; }
  B.g.set(x, y, z, 3); burnDrop(B, i);
  if (!removeVoxel(sh, x, y, z, true)) return;
  B.goneN++; B.chP.push(VK.pack(x, y, z)); B.chK.push(3); evEmit('burnAsh', sh, x, y, z);   // 灰燼、火星（59_burnfx.js）
  if (z <= wz && burnSkin(sh, x, y, z)) { B.thruN++; var sp = B.spots.get(burnKey(x, y, z)); if (sp && !sp.thru) { sp.thru = true; burnNews(sh, 'thru', sp); } }
}
/** 這一格是不是外船殼（離原本外形的半寬 4 格內；⛔ 水線下的艙內地板燒穿不算「燒穿船殼」—— 進水照粒子模式自己判破口，33_flood.js flHoleRedo）。 */
function burnSkin(sh, x, y, z) {
  var T = sh.T, hb = T.hullHB; if (!hb || x < 0 || x >= T.hullTW || z < 0 || z >= T.hullTH) return false;
  var h = hb[z * T.hullTW + x]; return h > 0 && Math.abs(y + 0.5 - T.cy) >= h - 4;
}
/** 熄了：留焦痕（燒得久 ⇒ 焦黑、剛著 ⇒ 焦）。 */
function burnQuench(sh, B, i, x, y, z) {
  B.g.set(x, y, z, 2); burnTint(sh, B, x, y, z, B.t[i] > 0.35 * B.d[i] ? BURN_CHAR2 : BURN_CHAR1, true);
  B.chP.push(VK.pack(x, y, z)); B.chK.push(2); B.outN++; burnDrop(B, i);
}
/** 換色（格數不變 ⇒ 重量、進水照舊；只是重建那一區的網格，62_simview.js）。每一步最多 tintMax ÷ NB 格；force ⇒ 不算上限。 */
function burnTint(sh, B, x, y, z, col, force) {
  if (!force && B.tint >= Math.ceil(BURN.tintMax / everySteps(BURN.tick))) return;
  var o = sh.grid.get(x, y, z); if (!o || o === col) return;
  B.tint++; sh.grid.set(x, y, z, col); evEmit('cell', sh, x, y, z);
}
/** 拿掉第 i 格（最後一格補到它的位置）。 */
function burnDrop(B, i) {
  var j = --B.n;
  B.p[i] = B.p[j]; B.h[i] = B.h[j]; B.t[i] = B.t[j]; B.d[i] = B.d[j]; B.f[i] = B.f[j]; B.ph[i] = B.ph[j];
  B.p.length = B.h.length = B.t.length = B.d.length = B.f.length = B.ph.length = j;
}
/** 木匠補回一格（46_carpenter.js restoreVoxel）：新木頭 ⇒ 沒燒過。 */
function burnForget(sh, x, y, z) { if (sh.burn.g.get(x, y, z)) sh.burn.g.set(x, y, z, 0); }
/** 沉了：全熄（不廣播）。 */
function burnClear(sh, B) {
  B.p.length = B.h.length = B.t.length = B.d.length = B.f.length = B.ph.length = 0; B.n = 0; B.q.length = 0;
  B.sl.slice().forEach(function (s) { burnSailOff(sh, s); });
  B.spots.forEach(function (sp) { sp.out = true; }); B.spots.clear(); B.lit = false;
}

// ── 火場、有沒有在燒、廣播 ──
/** 一拍一次：燒著的格照分區數一遍 ⇒ 每區幾格、中心、平均熱度；新的火場 ⇒ 「起火」、沒了 ⇒ 「撲滅」（有人在潑才算）。大火往上燒到帆。 */
function burnSpots(sh, B, dt) {
  var S0 = B.spots, i;
  S0.forEach(function (sp) { if (!sp.sail) { sp.m = 0; sp.sx = sp.sy = sp.sz = sp.hs = 0; } });
  for (i = 0; i < B.n; i++) {
    var p = B.p[i], x = p & 2047, y = (p >> 11) & 1023, z = p >> 21, k = burnKey(x, y, z), sp = S0.get(k);
    if (!sp) { S0.set(k, sp = { key: k, ord: B.spotSeq++, m: 0, n: 0, sx: 0, sy: 0, sz: 0, hs: 0, c: null, heat: 0, lv: -1, cell: -2, navAt: -1, need: 0, have: 0, out: false, thru: false, t0: SIMT }); burnNews(sh, 'ign', sp); }
    sp.m++; sp.sx += x; sp.sy += y; sp.sz += z; sp.hs += B.h[i];
  }
  S0.forEach(function (sp, k) {
    if (sp.sail) return;
    if (!sp.m) { sp.out = true; S0.delete(k); if (sp.have) burnNews(sh, 'out', sp); return; }
    sp.n = sp.m; sp.c = [sp.sx / sp.m, sp.sy / sp.m, sp.sz / sp.m]; sp.heat = sp.hs / sp.m;
    if (sp.n >= 8 && sp.heat > 0.5) burnFlames(sh, sp, dt);
  });
}
/** 整艘從沒在燒變成在燒 ⇒ 「起火！」；全熄了 ⇒ 「火撲滅了」。 */
function burnLit(sh, B) {
  var lit = B.n > 0 || B.sl.length > 0;
  if (lit && !B.lit) burnNews(sh, 'first', burnBiggest(B)); else if (!lit && B.lit) burnNews(sh, 'all', null);
  B.lit = lit;
}
/** 最大的火場（船殼的；沒有 ⇒ null）。 */
function burnBiggest(B) { var best = null; B.spots.forEach(function (sp) { if (!sp.sail && sp.c && (!best || sp.n > best.n)) best = sp; }); return best; }

// ── 救火（跟抽水機同一套：45_pumps.js pumpTick／pumpNeeds／pumpJoin）──
/** 每次點名（32_hull.js survey，callHands 之前）：每個火場要幾個人、誰到了；多出來的放回去（還沒到的先放）；火場旁燒傷、烤火藥桶。 */
function burnTick(sh) {
  var B = sh.burn, dt = SIMT - B.ct, NV = sh.nav, mine = {}, left = BURN.crewShip, L = [];
  B.ct = SIMT;
  sh.crew.forEach(function (c) { var J = c.role === ROLE.HAND && crewAble(c) && c.hand.job; if (J && J.kind === 'fire') (mine[J.key] || (mine[J.key] = [])).push(c); });
  B.spots.forEach(function (sp) { L.push(sp); });
  L.sort(function (a, b) { return (b.sail ? 1e9 : b.n) - (a.sail ? 1e9 : a.n) || a.ord - b.ord; });   // 燒著的帆先（燒得快、掉了就少推力），再來大的火場
  L.forEach(function (sp) {
    if (NV && (sp.cell === -2 || sp.navAt !== (NV.refreshN || 0))) burnSpotNav(sh, sp);   // 尋路刷新過 ⇒ 重找站的地方
    sp.want = NV && sp.cell >= 0 && !sh.struck ? Math.min(BURN.crewSpot, sp.sail ? BURN.sailCrew : Math.ceil(sp.n / BURN.crewPer)) : 0;
    sp.need = Math.min(sp.want, (mine[sp.key] || []).length, left); left -= sp.need;   // 先留住已經派去的（⛔ 每次照大小重排 ⇒ 火場一長、名額換手，走到一半的人被放回去，誰都到不了）
  });
  L.forEach(function (sp) { var a = Math.min(sp.want - sp.need, left); if (a > 0) { sp.need += a; left -= a; } });   // 剩下的名額照順序（帆、大的火場先）補
  L.forEach(function (sp) {
    var M = mine[sp.key] || []; delete mine[sp.key];
    if (M.length > sp.need) M.sort(function (a, b) { return (a.hand.job.at ? 1 : 0) - (b.hand.job.at ? 1 : 0); }).slice(0, M.length - sp.need).forEach(burnFree);
    sp.have = M.filter(function (c) { return c.hand.job && c.hand.job.at; }).length;
  });
  for (var k in mine) mine[k].forEach(burnFree);                       // 火場沒了（熄了、燒完了）
  burnHurt(sh, B, dt);
}
function burnFree(c) { c.hand.job = null; c.hand.legs = []; c.hand.wait = 1; }
/** 火場站哪：帆 ⇒ 帆匠那一點（帆底下、露天甲板）；船殼 ⇒ 火的那一層（不行 ⇒ 上一層：火在天花板、船殼側面）走得到、高度差 reach 格內的走路點。都沒有 ⇒ -1（沒人去）。 */
function burnSpotNav(sh, sp) {
  var NV = sh.nav; sp.navAt = NV.refreshN || 0; sp.cell = -1;
  if (sp.sail) { var q = smSpot(sh, sp.sail); if (q) { sp.lv = q.lv; sp.cell = q.ci; } return; }
  var P = [sp.c[0] + 0.5, sp.c[1] + 0.5, sp.c[2] + 1], lv = lvAt(sh, P);
  for (var t = 0; t < 2 && lv >= 0 && lv < NV.levels.length; t++, lv++) {
    if (NV.reach.indexOf(lv) < 0) continue;
    var N = NV.levels[lv].N, ci = navSnap(N, P, 8);
    if (ci >= 0 && Math.abs(N.Z[ci] - P[2]) <= BURN.reach) { sp.lv = lv; sp.cell = ci; return; }
  }
}
/** 點名時（42_hands.js callHands）：還缺人的火場 ⇒ 加進 need（cell ＝ 站的那一點）。 */
function burnNeeds(sh, need) {
  var go = {};
  sh.crew.forEach(function (c) { var J = c.role === ROLE.HAND && crewAble(c) && c.hand.job; if (J && J.kind === 'fire') go[J.key] = (go[J.key] || 0) + 1; });
  sh.burn.spots.forEach(function (sp) {
    var n = sp.need - (go[sp.key] || 0);
    if (n > 0 && sp.cell >= 0) need.push({ kind: 'fire', key: sp.key, lv: sp.lv, n: n, x: sp.sail ? smAlongX(sp.sail) : sp.c[0], cell: sp.cell, fire: sp, pri: 0.5 });
  });
}
/** 到了（42_hands.js handJoin）：船殼的火 ⇒ 站著潑（熱度在 burnCells 照到的人數降）、火場沒了才走；帆 ⇒ 站 cutT 秒，低的潑熄、高的割下來。不在那一層（路斷了）⇒ 作廢。 */
function burnJoin(sh, c) {
  var H = c.hand, J = H.job, sp = J.fire;
  if (!J.at) { if (H.lv !== J.lv || sp.out) { H.job = null; H.wait = 1; return; } J.at = SIMT; c.home = c.pos.slice(); return; }
  if (sp.out) { H.job = null; H.wait = 0.5; return; }
  if (sp.sail && SIMT - J.at >= BURN.cutT) {
    var s = sp.sail, top = sh.weatherDeck && sh.deckZ[sh.weatherDeck] ? sh.deckZ[sh.weatherDeck][1] : sh.T.zw;
    if (!s.dead && s.burn && s.burn.lit) {
      if (s.bb[2] - top <= BURN.sailReach) burnSailOut(sh, s, 'sailOut');
      else { burnSailOff(sh, s); dropSail(sh, s, false); burnNews(sh, 'sailCut', s); }
    }
    H.job = null; H.wait = 0.5;
  }
}
/** 火場旁的人燒傷、火藥桶被烤（照舊 powderHit：歸零 ⇒ 起火、殉爆）。每次點名（dt ＝ 上一次到現在）。
 *  烤多少 ＝ 最近、最旺的那一個火場（熱度 ×（1 − 距離／半徑），半徑 hurtR／kegR ＋ √格數）—— ⛔ 不是每個火場加起來：分區只有 3.2 m，站在四區交界會被算四次；
 *  站到火邊在潑的減半（一身濕）。 */
function burnHurt(sh, B, dt) {
  if (!(dt > 0)) return;
  var K = B.kegs || (B.kegs = sh.models.filter(function (m) { return m.kind === 'powder'; })), H = [];
  B.spots.forEach(function (sp) { if (!sp.sail && sp.c && sp.n >= 4) H.push(sp); });
  if (!H.length) return;
  sh.crew.forEach(function (c) {
    if (c.st > 1) return;
    var e = 0;
    H.forEach(function (sp) {
      var r = BURN.hurtR + Math.sqrt(sp.n), dx = c.pos[0] - sp.c[0], dy = c.pos[1] - sp.c[1], dz = c.pos[2] - sp.c[2], d2 = dx * dx + dy * dy;
      if (d2 >= r * r || dz < -6 || dz > 24) return;
      var v = sp.heat * (1 - Math.sqrt(d2) / r); if (v > e) e = v;
    });
    if (!(e > 0)) return;
    var J = c.hand && c.hand.job;
    damageCrew(sh, c, BURN.hurt * e * dt * (J && J.kind === 'fire' && J.at ? 0.5 : 1), '燒傷');
  });
  K.forEach(function (m) {
    if (!m.alive || m.lit) return;
    var e = 0;
    H.forEach(function (sp) {
      var r = BURN.kegR + Math.sqrt(sp.n), dx = m.c[0] - sp.c[0], dy = m.c[1] - sp.c[1], dz = m.c[2] - sp.c[2], d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) return;
      var v = sp.heat * (1 - Math.sqrt(d2) / r); if (v > e) e = v;
    });
    if (e > 0) powderHit(sh, m, BURN.keg * e * dt);
  });
}

// ── 帆 ──
/** 那一型第 k 面帆的布（T.cloth[k]，只有正面那一層）⇒ 燒的時候要的：每點的鄰點（CSR）、邊長（m）、往上多少、每點分到的面積（m²）、綁定點。第一次用才算（⛔ 不進快取、不改布模板）。 */
function burnTpl(T, k) {
  var BT = T.burnT || (T.burnT = []); if (BT[k]) return BT[k];
  var C = T.cloth[k], n = C.n, p0 = C.p0, tr = C.tris, E = new Map(), ea = [], eb = [], deg = new Int32Array(n + 1), ar = new Float32Array(n), area = 0, i, j;
  for (j = 0; j < tr.length; j += 3) {
    var a = tr[j], b = tr[j + 1], c = tr[j + 2];
    var ux = p0[b * 3] - p0[a * 3], uy = p0[b * 3 + 1] - p0[a * 3 + 1], uz = p0[b * 3 + 2] - p0[a * 3 + 2], vx = p0[c * 3] - p0[a * 3], vy = p0[c * 3 + 1] - p0[a * 3 + 1], vz = p0[c * 3 + 2] - p0[a * 3 + 2];
    var A = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) * S * S;
    ar[a] += A / 3; ar[b] += A / 3; ar[c] += A / 3; area += A;
    [[a, b], [b, c], [c, a]].forEach(function (e) { var kk = e[0] < e[1] ? e[0] * 65536 + e[1] : e[1] * 65536 + e[0]; if (E.has(kk)) return; E.set(kk, 1); ea.push(e[0]); eb.push(e[1]); deg[e[0] + 1]++; deg[e[1] + 1]++; });
  }
  for (i = 0; i < n; i++) deg[i + 1] += deg[i];
  var m = deg[n], nb = new Int32Array(m), ln = new Float32Array(m), dz = new Float32Array(m), at = Int32Array.from(deg);
  function put(u, v) {
    var o = at[u]++, dx = p0[v * 3] - p0[u * 3], dy = p0[v * 3 + 1] - p0[u * 3 + 1], dzz = p0[v * 3 + 2] - p0[u * 3 + 2], l = Math.hypot(dx, dy, dzz) || 1e-3;
    nb[o] = v; ln[o] = l * S; dz[o] = dzz / l;
  }
  for (j = 0; j < ea.length; j++) { put(ea[j], eb[j]); put(eb[j], ea[j]); }
  var pin = new Uint8Array(n), pinN = 0; for (i = 0; i < n; i++) if (C.hk && C.hk[i]) { pin[i] = 1; pinN++; }
  return (BT[k] = { n: n, s: deg, nb: nb, len: ln, dz: dz, ar: ar, area: area || 1, pin: pin, pinN: pinN, hk: C.hk, hv: C.hv, p0: p0 });
}
/** 那一型所有帆的頂點照 16 格一格分區（找附近的帆：大火往上燒、帆跟帆之間跳）。 */
function burnSB(T) {
  if (T.burnSB) return T.burnSB;
  var M = new Map();
  T.cloth.forEach(function (C, k) {
    if (!C) return;
    for (var q = 0; q < C.n; q++) { var key = burnBin(C.p0[q * 3], C.p0[q * 3 + 1], C.p0[q * 3 + 2]), L = M.get(key); if (!L) M.set(key, L = []); L.push(k, q); }
  });
  return (T.burnSB = { M: M });
}
function burnBin(x, y, z) { return (Math.floor(x / 16) + 64) + 512 * ((Math.floor(y / 16) + 64) + 512 * (Math.floor(z / 16) + 64)); }
/** (X, Y, Z) 附近 r 格內最近的帆頂點（照作品的形狀；帆桁轉過的照不到 —— 近似）：還掛著、張著、不是旗、不是第 skipK 面、不低於 zMin ⇒ [第幾面, 第幾點]；沒有 ⇒ null。 */
function burnSailNearPt(sh, X, Y, Z, r, skipK, zMin) {
  var M = burnSB(sh.T).M, best = null, bd = r * r;
  var x0 = Math.floor((X - r) / 16), x1 = Math.floor((X + r) / 16), y0 = Math.floor((Y - r) / 16), y1 = Math.floor((Y + r) / 16), z0 = Math.floor((Z - r) / 16), z1 = Math.floor((Z + r) / 16);
  for (var bz = z0; bz <= z1; bz++) for (var by = y0; by <= y1; by++) for (var bx = x0; bx <= x1; bx++) {
    var L = M.get((bx + 64) + 512 * ((by + 64) + 512 * (bz + 64))); if (!L) continue;
    for (var i = 0; i < L.length; i += 2) {
      var k = L[i], q = L[i + 1], s = sh.sails[k]; if (!s || k === skipK || s.dead || s.furled || s.flag) continue;
      var p0 = sh.T.cloth[k].p0, z = p0[q * 3 + 2]; if (z < zMin) continue;
      var dx = p0[q * 3] - X, dy = p0[q * 3 + 1] - Y, dd = dx * dx + dy * dy + (z - Z) * (z - Z);
      if (dd < bd) { bd = dd; best = [k, q]; }
    }
  }
  return best;
}
/** 希臘火潑開：r 格內的每面帆從最近的那一點燒起來（跟 cutRig 一樣先把點轉回作品的角度）。 */
function burnSailNear(sh, L, r) {
  sh.sails.forEach(function (s) {
    if (s.dead || s.furled || s.flag) return;
    var v = s.verts, sb = s.bb, y0 = s.yards && s.yards[0], aH = y0 ? y0.rot : 0, aF = s.footYard ? s.footYard.rot : 0, a = aF + (aH - aF) * clamp((L[2] - sb[2]) / Math.max(1, sb[5] - sb[2]), 0, 1);
    var Ls = y0 && a ? rotZ(L, y0.piv, -a) : L;
    if (Ls[0] < sb[0] - r || Ls[0] > sb[3] + r || Ls[1] < sb[1] - r || Ls[1] > sb[4] + r || Ls[2] < sb[2] - r || Ls[2] > sb[5] + r) return;
    var bj = -1, bd = r * r;
    for (var j = 0; j < v.length; j += 3) { var dx = v[j] - Ls[0], dy = v[j + 1] - Ls[1], dz = v[j + 2] - Ls[2], dd = dx * dx + dy * dy + dz * dz; if (dd < bd) { bd = dd; bj = j; } }
    if (bj >= 0) burnSailAt(sh, s, bj / 3);
  });
}
/** 帆 s 從第 q 點（s.verts 的第幾個頂點；正反兩層都可以）燒起來：沿布算每一點什麼時候燒到（已經燒到、更早燒到的不動；焦過的從停下來的地方接著燒）。 */
function burnSailAt(sh, s, q) {
  if (!(BURN_PCT > 0) || s.dead || s.flag || s.furled || !sh.T.cloth[s.k]) return false;
  var P = burnTpl(sh.T, s.k), B = burnOf(sh), F = s.burn, t = SIMT, T = BURN.sailBurn, n = P.n, i;
  q = q % n;
  if (!F) F = s.burn = { a: new Float32Array(n).fill(BURN_NEVER), x: new Float32Array(n).fill(BURN_NEVER), hf: 0, lit: false, t1: t };
  if (Math.min(t, F.x[q]) - F.a[q] >= T || (F.x[q] >= BURN_NEVER && F.a[q] <= t + 0.5)) return false;   // 那裡已經是洞、火已經快燒到了
  var D = burnDij(P, F, q, t, (rndFire() * 1073741824) | 0);
  for (i = 0; i < n; i++) {
    if (!(D[i] < Infinity)) continue;
    var pr = Math.min(1, Math.max(0, (Math.min(t, F.x[i]) - F.a[i]) / T)); if (pr >= 1) continue;
    if (F.x[i] < BURN_NEVER) { F.a[i] = t + D[i] - pr * T; F.x[i] = BURN_NEVER; }   // 焦過（撲滅過）⇒ 從停下來的地方接著燒
    else if (t + D[i] < F.a[i]) F.a[i] = t + D[i];
  }
  if (!F.lit) {
    F.lit = true; F.t1 = t - DT; B.sl.push(s); B.sailN++; B.sv++;     // t1 往前一步：起火那一點（a ＝ t）下一拍算「剛燒到」
    B.spots.set('S' + s.k, { key: 'S' + s.k, ord: B.spotSeq++, sail: s, lv: -1, cell: -2, navAt: -1, need: 0, have: 0, out: false });
    burnNews(sh, 'sail', s);
  }
  sh.rigDirty = true; return true;                                     // 物理關著：帆的緩衝只在 rigDirty 時重做（60_render.js prepRig）⇒ 新的燒到時間要上傳
}
/** 從 q0 沿布的邊燒過去要幾秒（Dijkstra）：洞不傳火；往上快（sailUp）、往下慢；每條邊照雜湊（salt ＝ 這一次的種子）快慢不同 ⇒ 燒口不是一個圓。 */
function burnDij(P, F, q0, t, salt) {
  var n = P.n, D = new Float64Array(n).fill(Infinity), done = new Uint8Array(n), HK = [], HV = [], T = BURN.sailBurn, V = BURN.sailV * BURN_PCT / 100;
  function push(k, v) {
    HK.push(k); HV.push(v);
    for (var i = HK.length - 1; i > 0;) { var j = (i - 1) >> 1; if (HK[j] <= HK[i]) break; var a = HK[i]; HK[i] = HK[j]; HK[j] = a; a = HV[i]; HV[i] = HV[j]; HV[j] = a; i = j; }
  }
  function pop() {
    var v = HV[0], lk = HK.pop(), lv = HV.pop(), m = HK.length;
    if (m) {
      HK[0] = lk; HV[0] = lv;
      for (var i = 0; ;) {
        var l = 2 * i + 1, r = l + 1, b = i;
        if (l < m && HK[l] < HK[b]) b = l; if (r < m && HK[r] < HK[b]) b = r; if (b === i) break;
        var a = HK[i]; HK[i] = HK[b]; HK[b] = a; a = HV[i]; HV[i] = HV[b]; HV[b] = a; i = b;
      }
    }
    return v;
  }
  D[q0] = 0; push(0, q0);
  while (HK.length) {
    var u = pop(); if (done[u]) continue; done[u] = 1;
    for (var e = P.s[u]; e < P.s[u + 1]; e++) {
      var v = P.nb[e]; if (done[v] || Math.min(t, F.x[v]) - F.a[v] >= T) continue;
      var dz = P.dz[e], up = dz > 0 ? 1 + BURN.sailUp * dz : Math.max(0.35, 1 + 0.6 * dz), w = P.len[e] / (V * up * (0.75 + 0.5 * hash3(u, v, salt)));
      if (D[u] + w < D[v]) { D[v] = D[u] + w; push(D[v], v); }
    }
  }
  return D;
}
/** 一拍一次：每面燒著的帆。 */
function burnSails(sh, B, dt) { B.sl.slice().forEach(function (s) { if (s.dead || !s.burn) burnSailOff(sh, s); else burnSail(sh, B, s, dt); }); }
/** 一面帆：洞的面積 ⇒ 血量；剛燒到的點（綁在格上 ⇒ 那一格著、偶爾跳到旁邊的帆）；燒得夠多、綁定點燒掉一半 ⇒ 掉；下雨可能熄。 */
function burnSail(sh, B, s, dt) {
  var F = s.burn, P = burnTpl(sh.T, s.k), T = BURN.sailBurn, t = SIMT, t0 = F.t1, hole = 0, pinB = 0, live = 0;
  F.t1 = t;
  for (var q = 0; q < P.n; q++) {
    var a = F.a[q], x = F.x[q];
    if (Math.min(t, x) - a >= T) { hole += P.ar[q]; if (P.pin[q]) pinB++; continue; }
    if (x < BURN_NEVER || a >= BURN_NEVER) continue;
    live++; if (a <= t && a > t0) burnSailNew(sh, B, s, P, q);
  }
  var hf = hole / P.area; if (hf > F.hf) { s.hp -= s.hpMax * BURN.sailHp * (hf - F.hf); F.hf = hf; }   // 推力跟著血量（31_sailing.js sailFrac）
  if (!live) { burnSailOff(sh, s); return; }
  if (s.hp <= 0 || hf >= BURN.sailDrop || (P.pinN && pinB * 2 >= P.pinN)) { burnSailOff(sh, s); B.sailGoneN++; dropSail(sh, s, false); burnNews(sh, 'sailGone', s); return; }
  if (WX.rain > 0 && rndFire() < 1 - Math.exp(-dt * BURN.rainSail * WX.rain)) burnSailOut(sh, s, 'sailOut');
}
/** 火剛燒到第 q 點：綁在格上 ⇒ 那一格（帆桁、桅、支索的固定點）著火；每四點一點試著跳到旁邊（sailJumpR 格內、不比這裡低太多）的帆。 */
function burnSailNew(sh, B, s, P, q) {
  if (P.hk && P.hk[q] === 1) { var v = P.hv[q]; burnCatch(sh, B, v & 2047, (v >> 11) & 1023, v >> 21, BURN.h0, 1); }
  if (!(q & 3)) {
    var o = q * 3, hit = burnSailNearPt(sh, P.p0[o], P.p0[o + 1], P.p0[o + 2], BURN.sailJumpR, s.k, P.p0[o + 2] - 5);
    if (hit && rndFire() < BURN.sailJump) burnSailAt(sh, sh.sails[hit[0]], hit[1]);
  }
}
/** 船殼的大火（8 格以上、平均熱度過半）往上燒：火焰高 flameK × √格數 格內碰到帆 ⇒ 照熱度的機率點著。 */
function burnFlames(sh, sp, dt) {
  var H = BURN.flameK * Math.sqrt(sp.n), c = sp.c, hit = null;
  for (var dz = 4; dz <= H && !hit; dz += 10) hit = burnSailNearPt(sh, c[0], c[1], c[2] + dz, 10, -1, c[2]);
  if (hit && rndFire() < 1 - Math.exp(-dt * BURN.sailCatch * sp.heat)) burnSailAt(sh, sh.sails[hit[0]], hit[1]);
}
/** 帆的火熄了（潑熄、下雨）：還在燒的點停在這一刻（焦痕留著，著色器照 x 停住）。 */
function burnSailOut(sh, s, why) {
  var F = s.burn; for (var q = 0; q < F.x.length; q++) if (F.x[q] >= BURN_NEVER) F.x[q] = SIMT;
  burnSailOff(sh, s); sh.burn.sailOutN++; sh.rigDirty = true; burnNews(sh, why, s);
}
/** 這面帆不再算在燒的裡面（熄了、燒完了、掉了、補好了）；它的火場收掉 ⇒ 救火的人放回去。掉下去的帆不改 x ⇒ 畫面上照樣燒完。 */
function burnSailOff(sh, s) {
  var B = sh.burn, i = B.sl.indexOf(s); if (i >= 0) B.sl.splice(i, 1);
  if (s.burn) s.burn.lit = false;
  var sp = B.spots.get('S' + s.k); if (sp) { sp.out = true; B.spots.delete('S' + s.k); }
  B.sv++;
}

// ── 讀數與面板的字 ──
/** 火場在哪（廣播用）：甲板 meta 的名字；沒有 ⇒ 船頭／船腰／船尾。 */
function burnPlace(sh, sp) {
  if (!sp || !sp.c) return '';
  var T = sh.T, d = hullDecks(T).length ? deckAt(T, sp.c[0], sp.c[2]) : null;
  if (d && d.name) return d.name;
  var f = (sp.c[0] - T.hx0) / Math.max(1, T.hx1 - T.hx0);
  return f > 0.67 ? '船頭' : f < 0.33 ? '船尾' : '船腰';
}
/** 詳細資訊一段：🔥 幾處（滅火 到了／要）。沒在燒 ⇒ 空。 */
function burnText(sh) {
  var B = sh.burn; if (!B || (!B.n && !B.sl.length)) return '';
  var n = 0, need = 0, have = 0; B.spots.forEach(function (sp) { n++; need += sp.need; have += sp.have; });
  return '　🔥 ' + n + ' 處' + (need ? '（滅火 ' + have + '/' + need + '）' : '（沒人救火）');
}
/** 火災圖的一行（61_hud.js gmapLegend）。 */
function burnSumText(sh) {
  var B = sh.burn; if (!B) return '沒有著火';
  var hn = 0, sn = 0, need = 0, have = 0; B.spots.forEach(function (sp) { if (sp.sail) sn++; else hn++; need += sp.need; have += sp.have; });
  return '燒著 ' + hn + ' 處 ' + B.n.toLocaleString() + ' 格・滅火 ' + have + '/' + need + ' 人・燒穿 ' + B.goneN.toLocaleString() + ' 格（水線下的船殼 ' + B.thruN + '）・撲滅 ' + B.outN.toLocaleString() + ' 格' +
    (B.sailN ? '・帆 燒著 ' + sn + '／燒掉 ' + B.sailGoneN + '／撲滅 ' + B.sailOutN : '');
}
/** __game.burn(i)：燒著幾格、最多幾格、起火／撲滅／燒穿幾格、每個火場、救火的人、每面著過火的帆。沒著過火 ⇒ null。 */
function burnInfo(sh) {
  var B = sh && sh.burn; if (!B) return null;
  var spots = [], crew = 0, at = 0;
  B.spots.forEach(function (sp) {
    spots.push(sp.sail ? { key: sp.key, sail: sp.sail.name, lv: sp.lv, cell: sp.cell, need: sp.need, have: sp.have }
      : { key: sp.key, n: sp.n, heat: +sp.heat.toFixed(2), c: sp.c ? sp.c.map(Math.round) : null, place: burnPlace(sh, sp), lv: sp.lv, cell: sp.cell, need: sp.need, have: sp.have, thru: sp.thru });
  });
  sh.crew.forEach(function (c) { var J = c.role === ROLE.HAND && crewAble(c) && c.hand.job; if (J && J.kind === 'fire') { crew++; if (J.at) at++; } });
  return { n: B.n, peak: B.maxN, ign: B.ignN, out: B.outN, gone: B.goneN, thru: B.thruN, lit: B.lit, crew: crew, at: at, spots: spots,
    sails: sh.sails.filter(function (s) { return s.burn; }).map(function (s) { return { k: s.k, name: s.name, lit: s.burn.lit, hole: +s.burn.hf.toFixed(3), hp: Math.round(s.hp), dead: !!s.dead }; }),
    sailN: B.sailN, sailGone: B.sailGoneN, sailOut: B.sailOutN };
}

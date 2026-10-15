// ───────────────────────── 陣營旗（Tim 2026-10-15：辨認陣營的旗，參考史實；遊戲專用 ⇒ 位置寫在設定檔，跟雕刻無關） ─────────────────────────
// 史實（帆船時代）：船尾國旗（ensign）是主要的辨識，開火前一定要升真旗；主桅頂的長旗（commissioning pennant）＝ 現役軍艦；
//   開戰時在好幾根桅頂多掛幾面旗（battle ensigns），一面被打掉還有別面。英國海軍分紅、白、藍三色艦隊旗（底色＋左上角聯合旗）。
// Tim 拍板：長旗＋戰鬥旗、仿英國艦隊旗 ⇒ 藍方 ＝ 藍旗（Blue Ensign）、紅方 ＝ 紅旗（Red Ensign）；長旗靠旗桿那段白底紅十字（聖喬治十字）、尾巴是陣營色。作品自己的國旗照留。
// 位置：設定檔 ships[].flags（[{ kind: 'pennant'|'ensign', mast: 'fore'|'main'|'mizzen' } 或 { kind, at: [x, y, z] 格座標 }]）；
//   沒寫 ⇒ 主桅（沒有就最高那根）頂掛長旗、其他桅頂各掛一面戰鬥旗。桅頂 ＝ 那根桅最高的帆桁轉軸往上、沿中線找到的最高一格（桅會往後傾 ⇒ 跟著格子走）。
// 畫面而已（⛔ 不碰模擬、不抽 rnd()）：每一格畫面照相對風（真風 − 船速，換到船身座標）往下風飄、一道一道的波（照時間，不用物理）；
//   桅頂那一段格子被打掉（剩不到三成）⇒ 那面旗不畫；降旗 ⇒ 全收（史實的 strike colours）；沉了不畫。
var COL_FIELD = { blue: [0.1, 0.14, 0.42], red: [0.72, 0.1, 0.09] }, COL_W = [0.93, 0.92, 0.88], COL_R = [0.78, 0.08, 0.1], COL_UB = [0.1, 0.14, 0.42];
var COL_SIZE = { ensign: [7, 3.6, 22, 11], pennant: [16, 0.7, 30, 4] };   // 長、寬（公尺）、沿飛的方向幾格、沿旗桿幾格
var COL_ON = Q.get('colours') !== '0';                                   // ?colours=0 ⇒ 不畫（對照、量效能用）
var COL_FAR = 350;                                                        // 離鏡頭幾公尺以外 ⇒ 旗 4 格畫面才重算一次（每艘每格約 0.4 ms）
var COL_TRUE_WIND = 9;                                                     // 真風（m/s；旗飄的方向用 WIND 的方向、大小照這個 × 天氣，⛔ WIND 本身是煙飄的速度）
/** 這一型的桅頂（格座標；載入後第一次要用才算）：{ fore: [x, y, z], … }。 */
function mastTrucks(T) {
  if (T.trucks) return T.trucks;
  var top = {}, key = { '前桅': 'fore', '主桅': 'main', '後桅': 'mizzen' }, g = T.base, cy = Math.round(T.cy);
  (T.rig.models || []).forEach(function (m) { var mt = m.meta || {}, pv = (m.points || {}).pivot; if (mt.kind === 'yard' && mt.mast && mt.mast !== 'bowsprit' && pv && (!top[mt.mast] || pv[2] > top[mt.mast][2])) top[mt.mast] = pv; });
  T.masts.forEach(function (m) { var k = key[m.name] || m.name; if (!top[k]) top[k] = [m.x, cy, m.z1]; });
  var out = {};
  Object.keys(top).forEach(function (k) {
    var x = Math.round(top[k][0]), z = Math.floor(top[k][2]), best = null, miss = 0;
    for (; z < T.sz && miss < 4; z++) {                                  // 往上一層一層找：中線附近有格 ⇒ 桅還在這一層（x 跟著格子的平均走）
      var sx = 0, n = 0;
      for (var xx = x - 12; xx <= x + 12; xx++) for (var y = cy - 2; y <= cy + 2; y++) if (g.get(xx, y, z)) { sx += xx; n++; }
      if (n) { x = Math.round(sx / n); best = [x, cy, z]; miss = 0; } else miss++;
    }
    if (best) out[k] = best;
  });
  return (T.trucks = out);
}
/** 這艘的陣營旗（第一次要畫才建）：設定檔 flags 或預設（主桅長旗、其他桅頂戰鬥旗）。 */
function colourSet(sh) {
  if (sh.colours) return sh.colours;
  var T = sh.T, tr = mastTrucks(T), info = HULL_KNOWN.filter(function (h) { return h.id === T.id; })[0] || {}, L = info.flags;
  if (!L) {
    var ks = Object.keys(tr), pm = tr.main ? 'main' : ks.sort(function (a, b) { return tr[b][2] - tr[a][2]; })[0];
    L = ks.map(function (k) { return { kind: k === pm ? 'pennant' : 'ensign', mast: k }; });
  }
  sh.colours = L.map(function (f) {
    var at = f.at || tr[f.mast]; if (!at) return null;
    var o = { kind: f.kind, at: at, up: true };
    o.orig = countBox(T.base, at[0] - 3, at[1] - 3, at[2] - 25, at[0] + 3, at[1] + 3, at[2]);   // 桅頂那一段（2.5 m）原本幾格；0 ⇒ 掛在空中（設定檔給的點）⇒ 一直在
    return o;
  }).filter(Boolean);
  sh.colT = -1;
  return sh.colours;
}
/** 旗面上 (u 沿飛的方向 0 旗桿 → 1 尾、v 沿旗桿 0 上 → 1 下) 的顏色。 */
function colourAt(kind, team, u, v) {
  var F = COL_FIELD[team] || COL_FIELD.blue;
  if (kind === 'pennant') {                                              // 長旗：靠旗桿那一段白底紅十字（聖喬治），之後是陣營色
    var hl = 0.07; if (u > hl) return F;
    return Math.abs(u - hl / 2) < hl * 0.16 || Math.abs(v - 0.5) < 0.17 ? COL_R : COL_W;
  }
  if (u > 0.5 || v > 0.5) return F;                                      // 戰鬥旗：左上角四分之一是聯合旗（1801 年後：聖喬治＋聖安德魯＋聖派翠克，這裡畫成藍底、白斜十字、白邊紅十字）
  var cu = u / 0.5, cv = v / 0.5, d1 = Math.abs(cu - cv), d2 = Math.abs(cu + cv - 1);
  if (Math.abs(cu - 0.5) < 0.09 || Math.abs(cv - 0.5) < 0.12) return COL_R;
  if (Math.abs(cu - 0.5) < 0.17 || Math.abs(cv - 0.5) < 0.22) return COL_W;
  if (Math.min(d1, d2) < 0.11) return COL_W;
  return COL_UB;
}
/** 每一格畫面（60_render.js prepRig）：這艘的陣營旗三角形，船身格座標（跟帆、模型同一套 uModel）。 */
function colourBuf(sh) {
  var C = colourSet(sh), i, f;                                           // ⛔ 第一版每一格建上萬個小陣列（每個點、每個角各一個）；改成配好的 Float32Array、顏色只算一次
  if (SIMT - sh.colT > 0.5 || sh.colT < 0) {                             // 半秒看一次桅頂還在不在（只是畫面）
    sh.colT = SIMT;
    C.forEach(function (f) { if (f.up && f.orig) f.up = countBox(sh.grid, f.at[0] - 3, f.at[1] - 3, f.at[2] - 25, f.at[0] + 3, f.at[1] + 3, f.at[2]) > f.orig * 0.3; });
  }
  var on = COL_ON && !sh.struck && !sh.sunk && sh.sink < 40, tot = 0;
  if (on && sh.colBuf && sh.colBuf.n && Math.hypot(CAM.eye[0] - sh.px, CAM.eye[2] - sh.pz) > COL_FAR && (sh.colF = (sh.colF || 0) + 1) % 4) return;   // 遠的船 ⇒ 4 格畫面才重算一次（船身座標 ⇒ 舊的那份照樣跟著船走）
  if (on) for (i = 0; i < C.length; i++) if (C[i].up) tot += COL_SIZE[C[i].kind][2] * COL_SIZE[C[i].kind][3] * 6;
  var O = sh.colArr && sh.colArr.length === tot * 9 ? sh.colArr : (sh.colArr = new Float32Array(tot * 9)), k = 0;
  if (on && tot) {
    var Wn = norm(WIND), ws = COL_TRUE_WIND * WIND_SPD * WX.wind;
    var wl = M4.dir(sh.inv, Wn[0] * ws - sh.vel[0], 0, Wn[2] * ws - sh.vel[2]), wh = Math.hypot(wl[0], wl[1]);   // 相對風（船身格座標：x 船頭、y 右舷、z 上）
    var dx = wh > 1e-6 ? wl[0] / wh : -1, dy = wh > 1e-6 ? wl[1] / wh : 0, sp = wh * S, lift = clamp(sp / 6, 0.15, 1), om = SIMT * (4 + sp * 0.5);   // sp：相對風速（m/s）⇒ 風小旗垂下來
    for (var fi = 0; fi < C.length; fi++) {
      f = C[fi]; if (!f.up) continue;
      var Z = COL_SIZE[f.kind], Lm = Z[0] / S, Hm = Z[1] / S, NU = Z[2], NV = Z[3], a = f.at, ph = fi * 1.7 + sh.i * 0.9, pen = f.kind === 'pennant', u, v;
      var P = f.P || (f.P = new Float32Array((NU + 1) * (NV + 1) * 3)), Q = f.cq;
      if (!Q || f.cqTeam !== sh.team) { Q = f.cq = new Float32Array(NU * NV * 3); f.cqTeam = sh.team; for (u = 0; u < NU; u++) for (v = 0; v < NV; v++) { var cc = colourAt(f.kind, sh.team, (u + 0.5) / NU, (v + 0.5) / NV), ci = (u * NV + v) * 3; Q[ci] = cc[0]; Q[ci + 1] = cc[1]; Q[ci + 2] = cc[2]; } }
      for (u = 0, i = 0; u <= NU; u++) {
        var uu = u / NU, w = pen ? 1 - 0.85 * uu : 1, fl = Lm * uu;       // 長旗越往尾巴越窄
        var wave = Math.sin(uu * 7.5 - om + ph) * Hm * 0.35 * uu * (pen ? 2.2 : 1), drop = (1 - lift) * fl * 0.9 + (pen ? fl * 0.12 : 0);   // 風小 ⇒ 往下垂；長旗本來就有點垂
        var bx = a[0] + dx * fl - dy * wave, by = a[1] + dy * fl + dx * wave, bz = a[2] + 4 - drop;   // 旗頭在桅頂上 0.4 m
        for (v = 0; v <= NV; v++, i += 3) { P[i] = bx; P[i + 1] = by; P[i + 2] = bz - ((v / NV - 0.5) * w + 0.5) * Hm; }
      }
      for (u = 0; u < NU; u++) for (v = 0; v < NV; v++) {
        var i00 = (u * (NV + 1) + v) * 3, i10 = i00 + (NV + 1) * 3, i01 = i00 + 3, i11 = i10 + 3;
        var ax = P[i10] - P[i00], ay = P[i10 + 1] - P[i00 + 1], az = P[i10 + 2] - P[i00 + 2], cx = P[i01] - P[i00], cy = P[i01 + 1] - P[i00 + 1], cz = P[i01 + 2] - P[i00 + 2];
        var nx = ay * cz - az * cy, ny = az * cx - ax * cz, nz = ax * cy - ay * cx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1, q = (u * NV + v) * 3;
        nx /= nl; ny /= nl; nz /= nl;
        var cr = Q[q], cg = Q[q + 1], cb = Q[q + 2], cs = [i00, i10, i11, i00, i11, i01];
        for (var j = 0; j < 6; j++) { var pi = cs[j]; O[k++] = P[pi]; O[k++] = P[pi + 1]; O[k++] = P[pi + 2]; O[k++] = nx; O[k++] = ny; O[k++] = nz; O[k++] = cr; O[k++] = cg; O[k++] = cb; }
      }
    }
  }
  sh.colBuf = upload(sh.colBuf, O, 9, [[0, 3, 0], [1, 3, 3], [2, 3, 6]]);
}
/** 畫（模型那一趟之後，同一支著色器、受光）：反射（畫質「高」）也畫。 */
function drawColours(prog) {
  if (prog.u.uGlow) gl.uniform1f(prog.u.uGlow, 0);
  SHIPS.forEach(function (sh) {
    var b = sh.colBuf; if (!b || !b.n || sh.sink > 40) return;
    cutSet(prog, sh); gl.uniformMatrix4fv(prog.u.uModel, false, sh.M);
    gl.bindVertexArray(b.vao); gl.drawArrays(gl.TRIANGLES, 0, b.n);
  });
}

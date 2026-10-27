// ───────────────────────── 超載極限：船吃水多深、多載幾噸開始漏水（Tim 2026-10-27） ─────────────────────────
// Tim：「遊戲內可以提供工具 檢查船吃水到多深會開始漏水嗎（檢察縫隙）」「漏水判定是否可以套用真實海戰的判定(人工加壓艙物檢測)」
//   「因為有很多是遊戲設計上不漏水(炮門只要還在就不漏水」「主要就是看如果超載(吃水超果水線) 極限可以撐多少」（選了「工具換算成噸數＋傾斜」：只量給人看，戰鬥不變）。
//   起因：康塞普西翁號船尾轉角的窗，斜的牆上玻璃只在斜角相碰、空氣鑽得過去。
// 進水（33_flood.js）只算打出來的破口與被打掉的門 ⇒ 這裡另外量「船本來的樣子，水面升到哪裡會流進艙裡」：
//   水面從船底一路往上升，船外的水照 6 連通灌。擋水的：船的格（T.base，玻璃也算）、門（關著的外框，25_doors.js）、
//   砲門與槳門（遊戲的規矩：砲門在就不漏水 ⇒ 沿砲管從砲口往裡 6 格到往外 14 格（LK_PORT）、左右 LK_PORT_W、上下 LK_PORT_Z 格的空格塞住，
//   再加砲口 LK_GUN 格以內船殼外框的缺口（見下）；槳照槳座 pivot ±LK_OAR 格）。
//   每一格記「水面要升到多高才灌得到」＝ 從船外走過來的路上最高的那一格（最小化路上的最高點；照高度一層一層的水桶佇列）；
//   水面高過那一格的底（T.zw 是水面的格高度，32_hull.js tonsAt）就灌得進 ⇒ 吃水再深 (那一格 − T.zw) × S 公尺 ⇒ 照浮力表（tonsAt）換成要多載幾噸。
//   傾斜 heel 度（正 ＝ 右舷朝下）：水面在船的座標裡是斜的 ⇒ 每一格的高度換成 z − tanθ ×（y − 中線）再比（浮力表是正的那一份 ⇒ 噸數是近似）。
//   船殼外框 ＝ 進水自己的艙內（33_flood.js flSkin：水線長前後 4 格以內、每一列 (x, z) 兩舷最外那一格之間），每一列取前後 LK_GAP 格內最外的（砲門洞、窗洞補平）。
//   艙裡（要灌到的那些格）＝ 外框裡 ＋ 同一列 (x, z) 兩舷、(y, z) 兩頭都真的有船 ＋ 頭上 LK_COVER 格以內有東西蓋著（露天甲板不算艙）
//     ＋ 腳下那一柱有實心（船底外面不算）＋ 這樣的格 6 連通連成一塊至少 LK_VOL 格（支索板底下、錨架後面這種小口袋不算）。
//     🩸 少了「兩舷兩頭都真的有船」⇒ 螺旋槳開口、船尾懸出部底下（整列空、上有懸出部、下有龍骨）也算艙，光榮號報「水線下 6.9 m 就漏」。
//     🩸 第一版照全部格子的外框（再前後補平）認艙裡 ⇒ 船首喙平台底下、龍骨兩旁、船底板下面都算艙，康塞普西翁號報「水線下 5.3 m 就漏」「吃水再深 1.6 m 從船頭漏」。
//     🩸 flSkin 的列在砲門那幾列找不到那一舷的牆（刻穿了）或找到中線附近的東西 ⇒ 每一列兩舷取前後 LK_GAP 格內最外的那一格。
//   漏點：水第一次跨進船殼外框那一步的前一格（框外最後一格 ⇒ 落在開口上）；跨進之後流到哪都跟著它（🩸 不跟 ⇒ 水經過頭上沒蓋的艙口往下，艙口又被記成一個漏點）。
//   同一個漏點灌到的艙裡空格併成一筆，照多高才灌得到排。
//   漏點是什麼：旁邊有玻璃 ＝ 窗、在門的外框旁 ＝ 門、旁邊有砲 ＝ 砲門旁（塞住了還漏）、旁邊有螺旋槳或軸 ＝ 螺旋槳軸孔、水線以上那一列沒有船而底下有 ＝ 舷牆頂（露天甲板）、水線以上頭上空著 ＝ 露天甲板（艙口、桅孔）、其他 ＝ 船殼的縫。
//   ⚠ 漏點是水跨進外框的地方，不一定是最窄的那一關（定遠號：從船尾底下進框、要升到水線下 1.2 m 才灌進艙）—— 吃水幾 m 才是那一關的高度。
// 只看到沉沒線（32_hull.js sinkLineT）上面 LK_OVER 格為止：再高船已經判沉了。不算浪。
// 用的地方：觀察玩法的面板（86_inspect.js「💧 超載極限」：正的量一次、傾斜 5／10／15° 兩舷各量一次、掛漏點標籤）、
//   匯入檢查（75_shipcheck.js R.info.leak；設計水線就漏，或沉沒線以下從窗、縫、軸孔漏 ⇒ ⚠）、__game.leak(heel, i, hole)（?debug=1）。
// ⛔ 只在按了才量（一艘約 1–4 秒）；一般遊戲一行都不多算。
var LK_COVER = 30, LK_GAP = 16, LK_OVER = 6, LK_NEAR = 3, LK_GUN = 12, LK_BIN = 6, LK_LIST = 12, LK_VOL = 1500, LK_PORT = [-6, 14], LK_PORT_W = 6, LK_PORT_Z = [-7, 6], LK_OAR = 3;
/** 量一次。heel：傾斜幾度（正 ＝ 右舷朝下；不給 ＝ 正的）。回 { heel, zw, sink, sinkT（到沉沒線要多載幾噸）, n（艙裡幾格）, first, list: [{ lvl（吃水再深幾 m）, tons, kind, deck, side, x（離船尾 m）, gate, at, cells, below }], more, ms }。 */
function leakCheck(sh, heel) {
  var t0 = performance.now(), T = sh.T, B = T.base, sx = B.sx, sy = B.sy, sink = sinkLineT(T), K = flSkin(T);
  var zMax = Math.max(1, Math.min(B.sz, Math.ceil(T.zw + sink / S) + LK_OVER + 1)), zC = Math.min(B.sz, zMax + LK_COVER), SXY = sx * sy, N = SXY * zMax, x, y, z, i, k;
  var blk = new Uint8Array(N);                                         // 1 船的格、2 門、3 塞住的砲門／槳門
  var topA = new Int16Array(SXY).fill(32767);                         // 每一柱 zMax 以上最低的那一格實心（頭上有沒有蓋著用）
  B.each(function (x, y, z) { if (z < zMax) blk[z * SXY + y * sx + x] = 1; else if (z < zC && z < topA[y * sx + x]) topA[y * sx + x] = z; });   // ⛔ 每一格 B.get ⇒ 拿破崙號一次 17 秒
  function fill(x, y, z, v) { if (x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < zMax) { var j = z * SXY + y * sx + x; if (!blk[j]) blk[j] = v; } }
  var doorB = [];
  (sh.doors || []).forEach(function (d) {
    var b = d.m.bb; doorB.push(b);
    for (var zz = Math.floor(b[2]); zz < Math.ceil(b[5]); zz++) for (var yy = Math.floor(b[1]); yy < Math.ceil(b[4]); yy++) for (var xx = Math.floor(b[0]); xx < Math.ceil(b[3]); xx++) fill(xx, yy, zz, 2);
  });
  (sh.guns || []).forEach(function (g) {                               // 砲門：從砲口沿砲管（水平那一段）往外塞
    var m = g.muz, a = g.ax; if (!m || !a) return;
    var hl = Math.hypot(a[0], a[1]); if (hl < 0.2) return;
    var ux = a[0] / hl, uy = a[1] / hl;
    for (var t = LK_PORT[0]; t <= LK_PORT[1]; t += 0.5) for (var w = -LK_PORT_W; w <= LK_PORT_W; w += 0.5) for (var dz = LK_PORT_Z[0]; dz <= LK_PORT_Z[1]; dz++)   // 🩸 從砲口往外、上下 ±5 ⇒ 砲口已經伸出船殼、門檻在砲口下 6 格，康塞普西翁號照樣從第一層砲門下緣漏
      fill(Math.floor(m[0] + ux * t - uy * w), Math.floor(m[1] + uy * t + ux * w), Math.floor(m[2] + dz), 3);
  });
  sh.models.forEach(function (m) {                                     // 槳門：槳座四周
    var p = m.kind === 'oar' && m.pts && m.pts.pivot; if (!p) return;
    for (var dz = -LK_OAR; dz <= LK_OAR; dz++) for (var dy = -LK_OAR; dy <= LK_OAR; dy++) for (var dx = -LK_OAR; dx <= LK_OAR; dx++) fill(Math.floor(p[0]) + dx, Math.floor(p[1]) + dy, Math.floor(p[2]) + dz, 3);
  });
  var yPf = new Int16Array(K.yP.length).fill(-1), yMf = new Int16Array(K.yM.length).fill(-1);
  for (z = 0; z < Math.min(zMax, K.zTop); z++) for (x = 0; x < K.nxv; x++) {
    var a0 = z * K.nxv + x, pM = -1, mM = 1e9;
    for (var dd = Math.max(0, x - LK_GAP); dd <= Math.min(K.nxv - 1, x + LK_GAP); dd++) { var aa = z * K.nxv + dd; if (K.yP[aa] < 0) continue; if (K.yP[aa] > pM) pM = K.yP[aa]; if (K.yM[aa] < mM) mM = K.yM[aa]; }
    if (pM >= 0) { yPf[a0] = pM; yMf[a0] = mM; }
  }
  // 砲門的缺口：補平的外框跟原本那一列的外框（K.yP／yM；砲門那幾列刻掉了 ⇒ 縮進去或沒有）中間那一段，砲口 LK_GUN 格以內的整段塞住
  //   🩸 只照砲管方向塞一個框 ⇒ 斜指的砲、比框寬的砲門照樣漏（康塞普西翁號塞完還報「吃水再深 2.1 m 從砲門旁漏」）；斜角上的縫不改變那一列的外框 ⇒ 照樣量得到
  (sh.guns || []).forEach(function (g) {
    var m = g.muz; if (!m) return;
    for (var zz = Math.max(0, Math.floor(m[2]) - LK_GUN); zz <= Math.min(Math.min(zMax, K.zTop) - 1, Math.floor(m[2]) + LK_GUN); zz++)
      for (var xx = Math.max(K.x0, Math.floor(m[0]) - LK_GUN); xx <= Math.min(K.x1, Math.floor(m[0]) + LK_GUN); xx++) {
        var a2 = zz * K.nxv + xx - K.x0, rp = K.yP[a2], rm = K.yM[a2]; if (yPf[a2] < 0) continue;
        for (var yy = Math.max(0, Math.floor(m[1]) - LK_GUN); yy <= Math.min(sy - 1, Math.floor(m[1]) + LK_GUN); yy++)
          if (yy > yMf[a2] && yy < yPf[a2] && (rp < 0 || yy >= rp || yy <= rm)) fill(xx, yy, zz, 3);
      }
  });
  // 艙裡的候選格（見檔頭）：1 候選，之後 3 ＝ 夠大那一塊（艙裡）、4 ＝ 太小的口袋
  var cand = new Uint8Array(N), rowAny = new Uint8Array(sx * zMax), colAny = new Uint8Array(sx);
  var rLo = new Int16Array(sx * zMax).fill(32767), rHi = new Int16Array(sx * zMax).fill(-1), cLo = new Int16Array(sy * zMax).fill(32767), cHi = new Int16Array(sy * zMax).fill(-1);   // 每一列 (x, z) 的 y、每一列 (y, z) 的 x：真的有船的格的最小、最大
  for (z = 0; z < zMax; z++) for (y = 0; y < sy; y++) for (x = 0, i = z * SXY + y * sx; x < sx; x++, i++) if (blk[i] === 1) {
    var ra = z * sx + x, ca = z * sy + y; rowAny[ra] = 1; colAny[x] = 1;
    if (y < rLo[ra]) rLo[ra] = y; if (y > rHi[ra]) rHi[ra] = y; if (x < cLo[ca]) cLo[ca] = x; if (x > cHi[ca]) cHi[ca] = x;
  }
  function inSkin(x, y, z) { if (x < K.x0 || x > K.x1 || z >= K.zTop) return false; var a = z * K.nxv + x - K.x0; return yPf[a] >= 0 && y > yMf[a] && y < yPf[a]; }
  for (y = 0; y < sy; y++) for (x = K.x0; x <= K.x1; x++) {
    var last = topA[y * sx + x] < zC ? topA[y * sx + x] : -1, zb = 0;
    while (zb < zMax && !blk[zb * SXY + y * sx + x]) zb++;
    for (z = zMax - 1; z > zb; z--) {
      i = z * SXY + y * sx + x;
      if (blk[i]) { last = z; continue; }
      if (z >= K.zTop || last < 0 || last - z > LK_COVER) continue;
      if (!inSkin(x, y, z) || y <= rLo[z * sx + x] || y >= rHi[z * sx + x] || x <= cLo[z * sy + y] || x >= cHi[z * sy + y]) continue;   // 同一列兩舷、兩頭都真的有船（螺旋槳開口、船尾懸出部底下那種整列空的不算）
      cand[i] = 1;
    }
  }
  var lab = new Int32Array(N), st = new Int32Array(N), sizes = [0], nIn = 0;
  for (i = 0; i < N; i++) {
    if (cand[i] !== 1 || lab[i]) continue;
    var id = sizes.length, top = 0, n0 = 0; st[top++] = i; lab[i] = id;
    while (top) {
      var c0 = st[--top]; n0++;
      var r0 = c0 % SXY, x0 = r0 % sx, y0 = (r0 / sx) | 0, z0 = (c0 / SXY) | 0;
      if (x0 > 0 && cand[c0 - 1] === 1 && !lab[c0 - 1]) { lab[c0 - 1] = id; st[top++] = c0 - 1; }
      if (x0 < sx - 1 && cand[c0 + 1] === 1 && !lab[c0 + 1]) { lab[c0 + 1] = id; st[top++] = c0 + 1; }
      if (y0 > 0 && cand[c0 - sx] === 1 && !lab[c0 - sx]) { lab[c0 - sx] = id; st[top++] = c0 - sx; }
      if (y0 < sy - 1 && cand[c0 + sx] === 1 && !lab[c0 + sx]) { lab[c0 + sx] = id; st[top++] = c0 + sx; }
      if (z0 > 0 && cand[c0 - SXY] === 1 && !lab[c0 - SXY]) { lab[c0 - SXY] = id; st[top++] = c0 - SXY; }
      if (z0 < zMax - 1 && cand[c0 + SXY] === 1 && !lab[c0 + SXY]) { lab[c0 + SXY] = id; st[top++] = c0 + SXY; }
    }
    sizes.push(n0);
  }
  for (i = 0; i < N; i++) if (cand[i] === 1) { cand[i] = sizes[lab[i]] >= LK_VOL ? 3 : 4; if (cand[i] === 3) nIn++; }
  lab = st = null;
  // 灌水：水桶佇列（桶 ＝ 水面要多高，傾斜時是斜的水面在那一格的高度 + off；每格只在拿到更低的高度時再進一次）；gate ＝ 這一路的水是從哪一格跨進船殼外框的（補平的 flSkin；還沒跨進 ⇒ −1）
  var tt = heel ? Math.tan(heel * Math.PI / 180) : 0, off = Math.ceil(Math.abs(tt) * sy) + 1, NH = zMax + 2 * off;
  function hq(y, z) { return Math.max(0, Math.round(z - tt * (y + 0.5 - T.cy)) + off); }
  var LV = new Uint16Array(N).fill(65535), gate = new Int32Array(N).fill(-1), Q = [];
  for (k = 0; k < NH; k++) Q.push([]);
  function seed(x, y, z) { var j = z * SXY + y * sx + x, l = hq(y, z); if (blk[j] || LV[j] <= l) return; LV[j] = l; Q[l].push(j); }
  for (z = 0; z < zMax; z++) { for (x = 0; x < sx; x++) { seed(x, 0, z); seed(x, sy - 1, z); } for (y = 0; y < sy; y++) { seed(0, y, z); seed(sx - 1, y, z); } }
  for (y = 0; y < sy; y++) for (x = 0; x < sx; x++) seed(x, y, 0);    // ⛔ 頂面不當入水口：傾斜時高的那一舷甲板上面會被當成直接碰到海
  for (var h = 0; h < NH; h++) {
    var q = Q[h];
    for (k = 0; k < q.length; k++) {
      var c = q[k]; if (LV[c] !== h) continue;
      var cr = c % SXY, cx = cr % sx, cy = (cr / sx) | 0, cz = (c / SXY) | 0;
      for (var d6 = 0; d6 < 6; d6++) {
        var nx = cx, ny = cy, nz = cz;
        if (d6 === 0) nx++; else if (d6 === 1) nx--; else if (d6 === 2) ny++; else if (d6 === 3) ny--; else if (d6 === 4) nz++; else nz--;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= zMax) continue;
        var n2 = nz * SXY + ny * sx + nx; if (blk[n2]) continue;
        var nh = hq(ny, nz), nl = nh > h ? nh : h; if (nl >= LV[n2]) continue;
        LV[n2] = nl; gate[n2] = gate[c] >= 0 ? gate[c] : inSkin(nx, ny, nz) ? c : -1; Q[nl].push(n2);
      }
    }
    Q[h] = null;
  }
  // 艙裡的空格照漏點分組（LK_BIN 格一格子；⛔ 字串當 Map 的鍵 ⇒ 每一格艙裡的格組一次字串，幾百萬格就是幾秒）
  var nbx = Math.ceil(sx / LK_BIN), nby = Math.ceil(sy / LK_BIN), NB = nbx * nby * Math.ceil(zMax / LK_BIN);
  var bLv = new Int32Array(NB).fill(65536), bN = new Int32Array(NB), bAt = new Int32Array(NB), bGate = new Int32Array(NB), G = [];
  for (i = 0; i < N; i++) {
    if (cand[i] !== 3 || LV[i] === 65535 || gate[i] < 0) continue;
    var gi = gate[i], gr = gi % SXY, bi = ((gr % sx) / LK_BIN | 0) + nbx * (((gr / sx) | 0) / LK_BIN | 0) + nbx * nby * (((gi / SXY) | 0) / LK_BIN | 0);
    if (!bN[bi]++) G.push(bi);
    if (LV[i] < bLv[bi]) { bLv[bi] = LV[i]; bAt[bi] = i; bGate[bi] = gi; }
  }
  G = G.map(function (bi) {
    var gi = bGate[bi], gr = gi % SXY, ai = bAt[bi], ar = ai % SXY;
    return { lv: bLv[bi] - off, cells: bN[bi], gate: [gr % sx, (gr / sx) | 0, (gi / SXY) | 0], at: [ar % sx, (ar / sx) | 0, (ai / SXY) | 0] };
  });
  function near(p, f) { for (var dz = -LK_NEAR; dz <= LK_NEAR; dz++) for (var dy = -LK_NEAR; dy <= LK_NEAR; dy++) for (var dx = -LK_NEAR; dx <= LK_NEAR; dx++) if (f(p[0] + dx, p[1] + dy, p[2] + dz)) return true; return false; }
  function glassAt(a, b, c) { return a >= 0 && b >= 0 && c >= 0 && a < sx && b < sy && c < B.sz && !!T.glsG.get(a, b, c); }
  function kindOf(e) {
    var p = e.gate, inB = function (b) { return p[0] >= b[0] - LK_NEAR && p[0] <= b[3] + LK_NEAR && p[1] >= b[1] - LK_NEAR && p[1] <= b[4] + LK_NEAR && p[2] >= b[2] - LK_NEAR && p[2] <= b[5] + LK_NEAR; };
    if (T.glsG && (near(p, glassAt) || near(e.at, glassAt))) return '窗（玻璃旁的縫）';
    if (doorB.some(inB)) return '門';
    if ((sh.guns || []).some(function (gn) { var o = gn.muz; return o && Math.abs(o[0] - p[0]) <= LK_GUN && Math.abs(o[1] - p[1]) <= LK_GUN && Math.abs(o[2] - p[2]) <= LK_GUN / 2; })) return '砲門旁（塞住了還漏）';
    if (sh.models.some(function (m) { var o = m.c; return (m.kind === 'propeller' || m.kind === 'shaft' || (m.meta || {}).kind === 'shaft') && o && Math.abs(o[0] - p[0]) <= LK_GUN && Math.abs(o[1] - p[1]) <= LK_GUN && Math.abs(o[2] - p[2]) <= LK_GUN; })) return '螺旋槳軸孔';
    if (p[2] >= T.zw && !rowAny[p[2] * sx + p[0]] && colAny[p[0]]) return '舷牆頂（露天甲板）';
    if (p[2] >= T.zw) { for (var zu = p[2] + 1; zu < Math.min(B.sz, p[2] + LK_COVER); zu++) if (B.get(p[0], p[1], zu)) break; if (zu >= Math.min(B.sz, p[2] + LK_COVER)) return '露天甲板（艙口、桅孔）'; }   // 頭上空著 ⇒ 天上掉下來的那一種（🩸 康塞普西翁號第三層甲板的艙口被寫成船殼的縫）   // 水線以下那一列空著 ⇒ 船底外面（🩸 定遠號船尾底下被寫成舷牆頂）
    return '船殼的縫';
  }
  function deckOf(p) {
    var best = null; hullDecks(T).forEach(function (d) { var f = deckFloor(d, p[0]); if (f !== null && f <= p[2] + 1 && (!best || f > best.f)) best = { f: f, n: d.name }; });
    return best ? best.n : '最下層甲板以下';
  }
  var list = [];
  G.forEach(function (e) {
    var lvl = (e.lv - T.zw) * S;
    list.push({ lvl: +lvl.toFixed(2), tons: leakTons(T, lvl), kind: kindOf(e), deck: deckOf(e.gate), side: Math.abs(e.gate[1] + 0.5 - T.cy) < 2 ? '中線' : e.gate[1] + 0.5 > T.cy ? '右舷' : '左舷',
      x: +(e.gate[0] * S).toFixed(1), gate: e.gate, at: e.at, cells: e.cells, below: lvl < sink });
  });
  list.sort(function (a, b) { return a.lvl - b.lvl || b.cells - a.cells; });
  return { heel: heel || 0, zw: T.zw, sink: +sink.toFixed(2), sinkT: leakTons(T, sink), n: nIn, first: list[0] || null, list: list.slice(0, LK_LIST), more: Math.max(0, list.length - LK_LIST), ms: Math.round(performance.now() - t0) };
}
/** 吃水再深 d 公尺 ⇒ 要多載幾噸（浮力表 32_hull.js tonsAt；d ≤ 0 ⇒ 0 或負的 ＝ 要減重）。 */
function leakTons(T, d) { return T.hyd ? Math.round(tonsAt(T, 0) - tonsAt(T, -d)) : null; }
/** 一句話：最先漏的那一個。 */
function leakLine(R) {
  var f = R.first, h = R.heel ? '傾斜 ' + Math.abs(R.heel) + '°（' + (R.heel > 0 ? '右' : '左') + '舷朝下）：' : '';
  if (!f) return h + '到沉沒線（吃水再深 ' + R.sink + ' m、多載 ' + R.sinkT + ' 噸）都不漏';
  if (f.lvl <= 0) return h + '設計水線就漏 ⇒ ' + f.kind + '（' + f.deck + '，' + f.side + '，離船尾 ' + f.x + ' m；水線下 ' + (-f.lvl).toFixed(2) + ' m）';
  return h + '再多載 ' + f.tons + ' 噸（吃水再深 ' + f.lvl.toFixed(2) + ' m）⇒ ' + f.kind + '（' + f.deck + '，' + f.side + '，離船尾 ' + f.x + ' m）' + (f.below ? '' : '；比沉沒線（' + R.sink + ' m、' + R.sinkT + ' 噸）還高');
}
/** 匯入檢查（75_shipcheck.js）與觀察面板用：正的量一次。 */
function leakSummary(sh) { var A = leakCheck(sh, 0); return { up: A, text: '超載極限：' + leakLine(A) }; }
/** 觀察面板的傾斜：兩舷各量一次，回先漏的那一舷。 */
function leakHeel(sh, deg) {
  var a = leakCheck(sh, deg), b = leakCheck(sh, -deg), fa = a.first ? a.first.lvl : 1e9, fb = b.first ? b.first.lvl : 1e9;
  return fa <= fb ? a : b;
}

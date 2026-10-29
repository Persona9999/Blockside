// ───────────────────────── 循環布（TASK-1102；總單 TASK-1100 演出規格統一的第 2 期） ─────────────────────────
// Tim 2026-10-29：「改為計算出一個Loop動畫演出(風吹的效果 但是嘗試讓變動可以循環 之後直接循環撥放省掉計算)」「不用完全模擬真實物理(只要視覺上看起來合理)」。
// 建築的布旗（63_towns.js）與繩帆固定的船（30_rig_physics.js rigFixed：城鎮模式每一艘、表演船）的旗，改播一段預先烘好、首尾無縫的循環；那些船張著的帆繞帆桁轉、輕輕呼吸。
// 真的船照舊即時算布（不經過這裡）。⛔ 只是畫面：不讀寫模擬的狀態、不抽亂數。?flagloop=0 ⇒ 照以前（建築旗每格算、船旗照作品的形狀）。
//
// 烘（建置時預烘：src/flagloop_bake.cjs 在 Node 原樣執行下面「烘」那一段 ⇒ ships/flagloop.bin（int16、每格存跟上一格的差、gzip，約 0.9 MB）；遊戲第一次要用時才抓、解壓就上傳；
//   抓不到、沒有 DecompressionStream ⇒ 交給 Worker 照同一段烘（再不行 ⇒ 主執行緒每格最多 FLOOP_SLICE 毫秒）；烘好之前照以前畫）：
//   解算器 ＝ 建築旗那一支（63_towns.js townFlagStep：Verlet、對角也連、約束 6 次、往風速拉的阻力、重力），風改成週期的 ——
//   陣風、橫擺、上下擺四個頻率換成同一個週期 FLOOP_N 步（14.95 秒）的 3／9／17／13 次諧波（原本 1.3／3.7／7.1／5.3 rad/s，最多差 3.1%）⇒ 有阻尼的布會收斂到同一條循環。
//   每一種旗形 × 每一檔風速：暖機到「一圈首尾差 < FLOOP_TOL」（至少兩圈、最多 FLOOP_LAPS 圈）再錄一圈；收斂不了 ⇒ 阻尼照 FLOOP_DAMP 加大重來
//   （實測：收尖的長旗 30 m/s 要 0.93 才收斂 —— 0.96 每圈首尾還差 1–11 cm；其他多半照 0.99）。每 FLOOP_STEP 步存一格（20 fps，FLOOP_NF 格）。
//   旗形照參考尺寸烘一份（FLOOP_SHAPES），播的時候照這一面的大小縮放、照大小放慢（√(參考長／這一面長)：大旗擺得慢）。
// 存：一張 RGB32F（FLOOP_W 欄 × 4 檔 × FLOOP_NF 格）。旗形照欄排開（c），一點一欄；座標 ＝ 參考尺寸、綁邊上端為原點（x 往下風、y 側、z 上），公尺。
// 播：同一段 GLSL（FLOOP_GLSL）—— 時間（格與格）、風速（檔與檔）都線性內插；船旗在帆緩衝的變體裡（P.sail／P.dsail 換頂點那一段，floopFxProg）、
//   建築旗一次 instanced 畫完（floopTownDraw）。每一面一個相位（雜湊）⇒ 整排不同步。
var FLOOP_ON = Q.get('flagloop') !== '0', FLOOP_UNIT = 20, FLOOP_PAT_UNIT = 2, FLOOP_SLICE = 6, FLOOP_FMAX = 6, FLOOP_YMAX = 16, FLOOP_SW_T = 7, FLOOP_SW_A = 0.018, FLOOP_VER = 1;
// ── 烘：src/flagloop_bake.cjs 預烘時原樣執行從這一行到「烘：到這裡」（Worker 備援拼的也是這幾支）；改了這一段 ⇒ 建置（admin.py build）照指紋重烘 ships/flagloop.bin ──
var FLOOP_N = 897, FLOOP_STEP = 3, FLOOP_NF = 299, FLOOP_DT = 1 / 60, FLOOP_SEC = 897 / 60, FLOOP_W = 256, FLOOP_ROWS = 4 * 299;
var FLOOP_K = [3, 9, 17, 13], FLOOP_K0 = [1.3, 3.7, 7.1, 5.3], FLOOP_BANDS = [4, 10, 18, 30], FLOOP_DAMP = [0.99, 0.98, 0.96, 0.93, 0.9], FLOOP_TOL = 1e-5, FLOOP_LAPS = 12;
var FLOOP_SHAPES = [                                                   // 參考尺寸 ＝ 77_colours.js COL_SIZE × 0.8（autoFlags 的 0.5–1.1 中間）；建築旗 ＝ townkit 最常見的 3.2 × 1.8 m
  { k: 'ensign', NU: 15, NV: 8, L: 5.6, H: 2.88, taper: 0, c: 0 },
  { k: 'pennant', NU: 25, NV: 3, L: 12.8, H: 0.56, taper: 0.85, c: 120 },   // 長旗往尾收（teamFlagsSetup 同一條：寬 × (1 − 0.85u)）
  { k: 'town', NU: 10, NV: 6, L: 3.2, H: 1.8, taper: 0, c: 195 }];
function floopShape(k) { for (var i = 0; i < FLOOP_SHAPES.length; i++) if (FLOOP_SHAPES[i].k === k) return FLOOP_SHAPES[i]; return null; }
function floopMake(S0) {
  var NU = S0.NU, NV = S0.NV, p = new Float64Array(NU * NV * 3), C = [], i, j;
  for (i = 0; i < NU; i++) for (j = 0; j < NV; j++) { var u = i / (NU - 1), v = j / (NV - 1), w = 1 - S0.taper * u, o = (i * NV + j) * 3; p[o] = u * S0.L; p[o + 1] = 0; p[o + 2] = -((v - 0.5) * w + 0.5) * S0.H; }
  function link(a, b) { C.push(a, b, Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2])); }
  for (i = 0; i < NU; i++) for (j = 0; j < NV; j++) { var a = i * NV + j; if (i + 1 < NU) link(a, a + NV); if (j + 1 < NV) link(a, a + 1); if (i + 1 < NU && j + 1 < NV) { link(a, a + NV + 1); link(a + 1, a + NV); } }
  return { NU: NU, NV: NV, p: p, pp: Float64Array.from(p), p0: Float64Array.from(p), C: new Float64Array(C), t: 0, q: new Float64Array(p.length) };
}
/** 一步（63_towns.js townFlagStep 的式子；風往 +x、z 朝上）：W ＝ 四個角頻率（週期的、或 FLOOP_K0 原本那組）。 */
function floopStep(F, ws0, damp, W) {
  var NU = F.NU, NV = F.NV, p = F.p, pp = F.pp, t = F.t, dt = FLOOP_DT, dt2 = dt * dt, ph = 1.234, i, j, k, o;
  var ws = ws0 * (1 + 0.25 * Math.sin(t * W[0] + ph) + 0.1 * Math.sin(t * W[1] + ph * 2));
  for (i = 1; i < NU; i++) {
    var u = i / (NU - 1), lat = ws * 0.35 * u * Math.sin(t * W[2] + ph - u * 5), up = ws * 0.12 * u * Math.sin(t * W[3] + ph * 1.7 + u * 4);
    for (j = 0; j < NV; j++) { o = (i * NV + j) * 3;
      for (k = 0; k < 3; k++) { var x = p[o + k], vel = (x - pp[o + k]) / dt, wv = k === 0 ? ws : k === 1 ? lat : up; p[o + k] = x + (x - pp[o + k]) * damp + (TOWN_FLAG_DRAG * (wv - vel) - (k === 2 ? 9.8 : 0)) * dt2; pp[o + k] = x; } }
  }
  for (j = 0; j < NV; j++) for (k = 0; k < 3; k++) p[j * 3 + k] = pp[j * 3 + k] = F.p0[j * 3 + k];   // 綁邊釘住
  var C = F.C;
  for (var it = 0; it < TOWN_FLAG_IT; it++) for (var c = 0; c < C.length; c += 3) {
    var a = C[c], b = C[c + 1], wa = a < NV ? 0 : 1, wb = b < NV ? 0 : 1; if (!(wa + wb)) continue;
    var A = a * 3, B = b * 3, dx = p[B] - p[A], dy = p[B + 1] - p[A + 1], dz = p[B + 2] - p[A + 2], L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, e = (L - C[c + 2]) / L / (wa + wb);
    p[A] += dx * e * wa; p[A + 1] += dy * e * wa; p[A + 2] += dz * e * wa; p[B] -= dx * e * wb; p[B + 1] -= dy * e * wb; p[B + 2] -= dz * e * wb;
  }
  F.t += dt;
}
function floopDiff(a, b) { var d = 0; for (var i = 0; i < a.length; i += 3) d = Math.max(d, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2])); return d; }
var FLOOP_WR = FLOOP_K.map(function (k) { return k * 2 * Math.PI / (897 / 60); });
function floopJob(si, bi, di) { var F = floopMake(FLOOP_SHAPES[si]); return { si: si, bi: bi, di: di, F: F, lap: 0, s: 0, rec: false, snap: Float64Array.from(F.p), mx: 0, fail: false, seamW: 0 }; }
/** 烘一小段（最多 32 步）；全部烘完 ⇒ false。 */
function floopWork() {
  var J = FLOOP.job || (FLOOP.job = floopJob(0, 0, 0)), S0 = FLOOP_SHAPES[J.si], F = J.F, D = FLOOP.data, n, i;
  for (n = 0; n < 32; n++) {
    if (J.rec && J.s % FLOOP_STEP === 0) { var row = J.bi * FLOOP_NF + J.s / FLOOP_STEP; for (i = 0; i < F.p.length; i++) D[(row * FLOOP_W + S0.c) * 3 + i] = F.p[i]; }
    if (J.rec) F.q.set(F.p);
    floopStep(F, FLOOP_BANDS[J.bi], FLOOP_DAMP[J.di], FLOOP_WR);
    if (J.rec) J.mx = Math.max(J.mx, floopDiff(F.p, F.q));
    if (++J.s < FLOOP_N) continue;
    J.s = 0;
    var seam = floopDiff(F.p, J.snap); J.snap.set(F.p);
    if (!J.rec) {                                                       // 暖機的一圈走完：收斂了 ⇒ 下一圈錄；收斂不了 ⇒ 阻尼加大重來
      J.lap++;
      if (J.lap >= 2 && seam < FLOOP_TOL) { J.rec = true; J.seamW = seam; }
      else if (J.lap >= FLOOP_LAPS) { if (J.di + 1 < FLOOP_DAMP.length) { FLOOP.job = floopJob(J.si, J.bi, J.di + 1); return true; } J.rec = true; J.fail = true; J.seamW = seam; }
      continue;
    }
    FLOOP.stat.push(floopStatOf(J, seam));                              // 錄好一圈
    var nb = J.bi + 1, ns = J.si;
    if (nb >= FLOOP_BANDS.length) { nb = 0; ns++; }
    if (ns >= FLOOP_SHAPES.length) { FLOOP.job = null; floopUpload(); return false; }
    FLOOP.job = floopJob(ns, nb, 0); return true;
  }
  return true;
}
/** 錄好的那一圈：接縫那一步（最後一格 → 第一格）、圈內格與格最大的一步、平均的飄向（尾巴那一欄 − 綁邊中點的水平方向，跟風差幾度）。 */
function floopStatOf(J, seam) {
  var S0 = FLOOP_SHAPES[J.si], np = S0.NU * S0.NV, inMax = 0, wrap = 0, fx = 0, fy = 0, ptBad = 0, pt;
  for (pt = 0; pt < np; pt++) {                                         // 逐點：接縫那一步（最後一格 → 第一格）不大於這一點圈內最大的一步
    var mp = 0, wp = 0;
    for (var g = 0; g < FLOOP_NF; g++) { var a = floopPt(J.si, J.bi, g, pt), b = floopPt(J.si, J.bi, (g + 1) % FLOOP_NF, pt), dd = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (g === FLOOP_NF - 1) wp = dd; else mp = Math.max(mp, dd); }
    if (wp > mp + 1e-6) ptBad++;
  }
  for (var f = 0; f < FLOOP_NF; f++) {
    var d = floopFrameStep(J.si, J.bi, f, (f + 1) % FLOOP_NF);
    if (f === FLOOP_NF - 1) wrap = d; else inMax = Math.max(inMax, d);
    for (var j = 0; j < S0.NV; j++) { var x = floopPt(J.si, J.bi, f, (S0.NU - 1) * S0.NV + j); fx += x[0]; fy += x[1]; }
  }
  return { k: S0.k, ws: FLOOP_BANDS[J.bi], damp: FLOOP_DAMP[J.di], laps: J.lap, fail: J.fail, seam: +(seam * 100).toFixed(3), stepMax: +(J.mx * 100).toFixed(2), frameMax: +(inMax * 100).toFixed(2), wrap: +(wrap * 100).toFixed(2), flowDeg: +(Math.atan2(fy, fx) * 180 / Math.PI).toFixed(1), np: np, ptBad: ptBad };
}
function floopPt(si, bi, f, pt) { var o = ((bi * FLOOP_NF + f) * FLOOP_W + FLOOP_SHAPES[si].c + pt) * 3, D = FLOOP.data; return [D[o], D[o + 1], D[o + 2]]; }
function floopFrameStep(si, bi, f0, f1) { var S0 = FLOOP_SHAPES[si], d = 0; for (var pt = 0; pt < S0.NU * S0.NV; pt++) { var a = floopPt(si, bi, f0, pt), b = floopPt(si, bi, f1, pt); d = Math.max(d, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); } return d; }
// ── 烘：到這裡 ──
var FLOOP = { st: 0, job: null, si: 0, bi: 0, data: null, tex: null, stat: [], ms: 0, t0: 0, t1: 0, fx: null, fxBad: null, town: null };   // st：0 還沒要、1 在烘、2 好了、−1 關掉
/** 有東西要播 ⇒ 拿循環的資料（只拿一次）：先載預烘好的 ships/flagloop.js（src/flagloop_bake.cjs 寫的；跟船檔同一個載法、同一個前綴：Blocksail 裡是 external/Blockside/）
 *  ⇒ window.BS_FLOOP 的 base64 → VoxelKit 解 deflate-raw → floopParse；載不到、版面對不上、沒有 DecompressionStream ⇒ 交給 Worker 照同一段烘（floopBake）。 */
function floopNeed() {
  if (!FLOOP_ON || FLOOP.st !== 0) return;
  FLOOP.st = 1; FLOOP.t0 = performance.now(); FLOOP.how = 'file';
  function fail(e) { if (FLOOP.how !== 'file') return; FLOOP.fileErr = String(e && e.message || e); floopBake(); }
  function got() {
    var o = window.BS_FLOOP; window.BS_FLOOP = null; if (!o || !o.b64) { fail('ships/flagloop.js 裡沒有資料'); return; }
    var t1 = performance.now(), u = VK.b64ToBytes(o.b64); FLOOP.fileBytes = o.b64.length; FLOOP.mainMs = performance.now() - t1;   // mainMs：主執行緒上同步的那幾段（base64、解析、上傳）
    VK.inflateRaw(u).then(function (raw) {
      var t2 = performance.now(), r = floopParse(raw.buffer); if (!r) throw new Error('版面跟這一版的程式對不上');
      FLOOP.data = r.data; FLOOP.stat = r.stat; floopUpload(); FLOOP.mainMs += performance.now() - t2; FLOOP.fms = performance.now() - FLOOP.t0;
    }).catch(fail);
  }
  try { var s = document.createElement('script'); s.src = ((window.BS_SHELL && window.BS_SHELL.ships) || '') + 'ships/flagloop.js'; s.onload = got; s.onerror = function () { fail('載不到 ' + s.src); }; document.head.appendChild(s); }
  catch (e) { fail(e); }
}
/** ships/flagloop.js 的資料解開之後（src/flagloop_bake.cjs 寫的）：檔頭的版面要跟這一版的常數一樣；int16 × 1/k、每一檔第 0 格之後每格加回上一格。 */
function floopParse(buf) {
  var u8 = new Uint8Array(buf); if (u8.length < 8 || String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'FLP1') return null;
  var n = new DataView(buf).getUint32(4, true), H = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + n))), N = FLOOP_W * FLOOP_ROWS * 3;
  if (H.W !== FLOOP_W || H.ROWS !== FLOOP_ROWS || H.NF !== FLOOP_NF || JSON.stringify(H.bands) !== JSON.stringify(FLOOP_BANDS) || JSON.stringify(H.shapes) !== JSON.stringify(FLOOP_SHAPES) || buf.byteLength < 8 + n + N * 2) return null;
  var q = new Int16Array(buf, 8 + n, N), D = new Float32Array(N), RW = FLOOP_W * 3, acc = new Int32Array(RW), inv = 1 / H.k;
  for (var r = 0; r < FLOOP_ROWS; r++) for (var i = 0; i < RW; i++) { var o = r * RW + i; acc[i] = r % FLOOP_NF === 0 ? q[o] : acc[i] + q[o]; D[o] = acc[i] * inv; }
  return { data: D, stat: H.stat };
}
/** 備援：交給 Worker 烘（主執行緒不花時間）；Worker 起不來 ⇒ 主執行緒每格烘一小段（floopTick）。 */
function floopBake() {
  FLOOP.how = 'main';
  try {
    var fns = [floopShape, floopMake, floopStep, floopDiff, floopJob, floopWork, floopStatOf, floopPt, floopFrameStep].map(function (f) { return f.toString(); }).join('\n');
    var src = 'var FLOOP_N=' + FLOOP_N + ', FLOOP_STEP=' + FLOOP_STEP + ', FLOOP_NF=' + FLOOP_NF + ', FLOOP_DT=' + FLOOP_DT + ', FLOOP_TOL=' + FLOOP_TOL + ', FLOOP_LAPS=' + FLOOP_LAPS + ', FLOOP_W=' + FLOOP_W + ', FLOOP_ROWS=' + FLOOP_ROWS + ';\n' +
      'var FLOOP_BANDS=' + JSON.stringify(FLOOP_BANDS) + ', FLOOP_DAMP=' + JSON.stringify(FLOOP_DAMP) + ', FLOOP_WR=' + JSON.stringify(FLOOP_WR) + ', FLOOP_SHAPES=' + JSON.stringify(FLOOP_SHAPES) + ';\n' +
      'var TOWN_FLAG_DRAG=' + TOWN_FLAG_DRAG + ', TOWN_FLAG_IT=' + TOWN_FLAG_IT + ';\nvar FLOOP={ job: null, stat: [], data: new Float32Array(FLOOP_W * FLOOP_ROWS * 3) };\n' + fns +
      '\nfunction floopUpload() {}\nonmessage = function () { var t0 = performance.now(); while (floopWork()) {} postMessage({ data: FLOOP.data, stat: FLOOP.stat, ms: performance.now() - t0 }, [FLOOP.data.buffer]); };\n';
    var w = FLOOP.wk = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = function (e) { FLOOP.wk = null; try { w.terminate(); } catch (x) { /* 已經停了 */ } FLOOP.data = e.data.data; FLOOP.stat = e.data.stat; FLOOP.wms = e.data.ms; floopUpload(); };
    w.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); try { w.terminate(); } catch (x) { /* 已經停了 */ } FLOOP.wk = null; FLOOP.how = 'main'; FLOOP.job = null; FLOOP.stat = []; FLOOP.data = new Float32Array(FLOOP_W * FLOOP_ROWS * 3); };   // 掛了 ⇒ 主執行緒烘
    w.postMessage(1); FLOOP.how = 'worker';
  } catch (e) { FLOOP.wk = null; FLOOP.how = 'main'; }
  if (FLOOP.how === 'main') FLOOP.data = new Float32Array(FLOOP_W * FLOOP_ROWS * 3);
}
function floopReady() { return FLOOP.st === 2 && !!FLOOP.tex; }
/** 風速（m/s）⇒ 檔位（0..3，檔與檔之間是小數）；比最低那一檔弱 ⇒ 照最低那一檔，比最高強 ⇒ 照最高（夾住）。 */
function floopBand(ws) {
  var B = FLOOP_BANDS; if (!(ws > B[0])) return 0;
  for (var i = 0; i < B.length - 1; i++) if (ws < B[i + 1]) return i + (ws - B[i]) / (B[i + 1] - B[i]);
  return B.length - 1;
}
function floopUpload() {
  var t = FLOOP.tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, FLOOP_W, FLOOP_ROWS, 0, gl.RGB, gl.FLOAT, FLOOP.data);
  [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST); });   // 浮點貼圖一定 NEAREST（texelFetch）
  [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE); });
  gl.bindTexture(gl.TEXTURE_2D, null);
  FLOOP.st = 2; FLOOP.t1 = performance.now();
  if (!DEBUG) FLOOP.data = null;                                        // CPU 那一份只給讀數用（__game.floop）
}
/** 每一格（60_render.js prepRig）：在烘就烘 FLOOP_SLICE 毫秒。 */
function floopTick() {
  if (FLOOP.st !== 1 || FLOOP.how !== 'main' || !FLOOP.data) return;  // Worker 在烘 ⇒ 等它回信
  var t0 = performance.now();
  while (performance.now() - t0 < FLOOP_SLICE) if (!floopWork()) break;
  FLOOP.ms += performance.now() - t0;
}
// ── 播：GLSL ──
//   lpP(欄, 第幾格（0..NF，小數內插）, 風速檔位（0..3，小數內插）) ⇒ 參考尺寸下的位置（公尺；x 下風、y 側、z 上）。uLT 綁在 FLOOP_UNIT。
var FLOOP_GLSL = 'uniform highp sampler2D uLT;\nconst int LNF=' + FLOOP_NF + '; const float LNFf=' + FLOOP_NF + '.0, LSEC=' + FLOOP_SEC.toFixed(6) + ';\n' +
  'vec3 lpF(int c,int r){ return texelFetch(uLT,ivec2(c,r),0).xyz; }\n' +
  'vec3 lpB(int c,int b,float fr){ int a=min(int(floor(fr)),LNF-1); int a1=a+1; if(a1>=LNF) a1=0; float t=fr-float(a); return mix(lpF(c,b*LNF+a),lpF(c,b*LNF+a1),t); }\n' +
  'vec3 lpP(int c,float fr,float bw){ int b0=min(int(floor(bw)),3); int b1=min(b0+1,3); return mix(lpB(c,b0,fr),lpB(c,b1,fr),bw-float(b0)); }\n' +
  'float lpFr(float t,float rate,float ph){ return mod(t*rate*(LNFf/LSEC)+ph*LNFf,LNFf); }\n';
/** 繩帆固定的船的帆緩衝變體：頂點那一段先過 sailFx（aX：0 照緩衝；1 旗（沿飛第幾點 i、沿旗桿第幾點 j、第幾面）；2 帆（第幾根帆桁、擺幅（格，帶正負）、相位））。
 *  uFA：綁邊上端（格）、相位；uFB：旗形的起始欄、沿旗桿幾點、沿飛幾點、播放倍率；uFC：沿飛縮放、沿旗桿縮放、風速檔位；uYd：帆桁轉軸 x、y、轉角；uFW：下風方向 x、y（格座標）、時間（秒）、這一艘的擺動相位。 */
function floopFxGlsl() {
  var g = (1 / S).toFixed(6);
  return FLOOP_GLSL + 'layout(location=6) in vec4 aX; uniform vec4 uFA[' + FLOOP_FMAX + '], uFB[' + FLOOP_FMAX + '], uFC[' + FLOOP_FMAX + '], uYd[' + FLOOP_YMAX + '], uFW;\n' +
    'vec3 fxMap(vec3 q,vec2 f,float sL,float sH){ return vec3((f.x*q.x-f.y*q.y)*sL,(f.y*q.x+f.x*q.y)*sL,q.z*sH)*' + g + '; }\n' +
    'void sailFx(inout vec3 P,inout vec3 N){\n' +
    ' if(aX.x>0.5 && aX.x<1.5){ int k=int(aX.w+0.5); vec4 A=uFA[k], B=uFB[k], C=uFC[k]; int c0=int(B.x+0.5), nv=int(B.y+0.5), nu=int(B.z+0.5), i=int(aX.y+0.5), j=int(aX.z+0.5);\n' +
    '  float fr=lpFr(uFW.z,B.w,A.w); int ia=max(i-1,0), ib=min(i+1,nu-1), ja=max(j-1,0), jb=min(j+1,nv-1);\n' +
    '  vec3 q=lpP(c0+i*nv+j,fr,C.z), du=lpP(c0+ib*nv+j,fr,C.z)-lpP(c0+ia*nv+j,fr,C.z), dv=lpP(c0+i*nv+jb,fr,C.z)-lpP(c0+i*nv+ja,fr,C.z);\n' +
    '  P=A.xyz+fxMap(q,uFW.xy,C.x,C.y); N=cross(fxMap(du,uFW.xy,C.x,C.y),fxMap(dv,uFW.xy,C.x,C.y)); }\n' +
    ' else if(aX.x>1.5){ int y=int(floor(aX.y+0.5));\n' +
    '  if(y>=0){ vec4 Y=uYd[y]; float c=cos(Y.z), s=sin(Y.z); vec2 d=P.xy-Y.xy; P.xy=Y.xy+vec2(d.x*c-d.y*s,d.x*s+d.y*c); N.xy=vec2(N.x*c-N.y*s,N.x*s+N.y*c); }\n' +
    '  if(dot(N,N)>1e-12) P+=normalize(N)*aX.z*sin(6.2831853*(uFW.z/' + FLOOP_SW_T.toFixed(1) + '+aX.w+uFW.w)); } }\n';
}
var FLOOP_FX_MAIN = 'void main(){ vec4 w=uModel*vec4(aP,1.0); vW=w.xyz; vN=mat3(uModel)*aN;', FLOOP_DFX_MAIN = 'void main(){ vT=aT; vF=aF; vH=aH; gl_Position=uVP*(uModel*vec4(aP,1.0)); }';
/** P.sail／P.dsail 的變體（第一次要用時送出編譯，好了才用；編不過 ⇒ 一律照以前，FLOOP.fxBad 記原因）。 */
function floopFxProg(base) {
  if (!FLOOP_ON || !floopReady() || FLOOP.fxBad) return null;
  var key = base === P.sail ? 'sail' : base === P.dsail ? 'dsail' : null; if (!key) return null;
  var F = FLOOP.fx || (FLOOP.fx = {}); if (F[key]) return F[key];
  var vs = key === 'sail' ? SAIL_VS : DSAIL_VS, m = key === 'sail' ? FLOOP_FX_MAIN : FLOOP_DFX_MAIN;
  if (vs.indexOf(m) < 0) { FLOOP.fxBad = 'P.' + key + ' 的頂點著色器換了，對不到要改的那一段'; return null; }
  vs = vs.replace(m, key === 'sail' ? floopFxGlsl() + 'void main(){ vec3 P=aP, N=aN; sailFx(P,N); vec4 w=uModel*vec4(P,1.0); vW=w.xyz; vN=mat3(uModel)*N;'
    : 'layout(location=1) in vec3 aN;\n' + floopFxGlsl() + 'void main(){ vec3 P=aP, N=aN; sailFx(P,N); vT=aT; vF=aF; vH=aH; gl_Position=uVP*(uModel*vec4(P,1.0)); }');
  try { var p = glProgTry(vs, key === 'sail' ? SAIL_FS : DSAIL_FS); if (p) F[key] = p; return p; }
  catch (e) { FLOOP.fxBad = String(e && e.message || e).slice(0, 400); console.warn('循環布的帆著色器編不過，照以前畫：' + FLOOP.fxBad); return null; }
}
// ── 船：每頂點的循環參數（帆緩衝重做時一起做；11_rig_gpu.js sailBuf） ──
/** 這一艘要不要走循環（繩帆固定的船；?flagloop=0 ⇒ 不要）。 */
function floopFxWant(ow) { return FLOOP_ON && PHYS && !!ow.crew && rigFixed(ow); }   // 物理關著 ⇒ 帆與旗一律照作品的形狀（setPhys：回到靜態）
var FLOOP_TPL = new WeakMap();
/** 張著的帆（模板 T）：每一點跟哪根帆桁轉（照 30_rig_physics.js clothBrace：綁在帆桁上的照自己那根、綁在格、繩上的不轉、沒綁的照這面帆綁最多點的那根）、擺幅（離綁住的點越遠越大、朝這面帆平均法線那一側）、相位。 */
function floopSailTpl(T) {
  var o = FLOOP_TPL.get(T); if (o) return o;
  var n = T.n, p = T.p0, sim = T.sim, yk = sim && sim.n === n ? sim.yk : null, hk = T.hk || [], Y = new Int32Array(n).fill(-1), A = new Float32Array(n), i, j;
  if (yk) { var cnt = {}, top = -1; for (i = 0; i < n; i++) if (yk[i] >= 0 && (cnt[yk[i]] = (cnt[yk[i]] || 0) + 1) > (cnt[top] || 0)) top = yk[i]; if (top >= 0) for (i = 0; i < n; i++) Y[i] = yk[i] >= 0 ? yk[i] : hk[i] ? -1 : top; }
  var H = []; for (i = 0; i < n; i++) if (hk[i]) H.push(i);
  var Nm = new Float32Array(n * 3), M = [0, 0, 0], tr = T.tris, b0 = [1e9, 1e9, 1e9], b1 = [-1e9, -1e9, -1e9];
  for (j = 0; j < tr.length; j += 3) { var a = tr[j] * 3, b = tr[j + 1] * 3, d = tr[j + 2] * 3, ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; [a, b, d].forEach(function (q) { Nm[q] += nx; Nm[q + 1] += ny; Nm[q + 2] += nz; }); M[0] += nx; M[1] += ny; M[2] += nz; }
  for (i = 0; i < n; i++) for (j = 0; j < 3; j++) { b0[j] = Math.min(b0[j], p[i * 3 + j]); b1[j] = Math.max(b1[j], p[i * 3 + j]); }
  var D = new Float32Array(n), dmax = 0, amp = FLOOP_SW_A * Math.hypot(b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]);
  for (i = 0; i < n; i++) { var m = H.length ? 1e9 : 0; for (j = 0; j < H.length; j++) { var h = H[j] * 3; m = Math.min(m, Math.hypot(p[i * 3] - p[h], p[i * 3 + 1] - p[h + 1], p[i * 3 + 2] - p[h + 2])); } D[i] = m; dmax = Math.max(dmax, m); }
  for (i = 0; i < n; i++) { var w = dmax > 0 ? D[i] / dmax : 0; w = w * w * (3 - 2 * w); A[i] = (Nm[i * 3] * M[0] + Nm[i * 3 + 1] * M[1] + Nm[i * 3 + 2] * M[2] >= 0 ? 1 : -1) * w * amp; }
  o = { Y: Y, A: A, ph: townHash(String(T.name || '') + ':sw') };
  FLOOP_TPL.set(T, o); return o;
}
/** 帆緩衝重做完（sailBuf）：L ＝ 這一次每一面 [布, 模板, 第幾點起, 幾點]…（null ⇒ 這一艘不走循環：把第 6 號屬性關掉）。 */
function floopFxBuild(ow, L, nv) {
  var B = ow.sb;
  if (!L) { if (B.fxOn) { gl.bindVertexArray(B.vao); gl.disableVertexAttribArray(6); gl.bindVertexArray(null); B.fxOn = false; } ow.fx = null; return; }
  floopNeed();
  var X = new Float32Array(Math.max(1, nv) * 4), FL = [], KI = new Map(), ys = new Map(), q, i;
  (ow.cl || []).forEach(function (c, k) { KI.set(c, k); });
  (ow.yards || []).forEach(function (m, k) { if (k < FLOOP_YMAX) ys.set(m, k); });
  var id = String(ow.npc && ow.npc.id || ow.name || ow.i);
  for (q = 0; q < L.length; q += 4) {
    var c = L[q], T = L[q + 1], base = L[q + 2], n = L[q + 3], k = KI.get(c), s = k === undefined ? null : ow.sails[k];
    if (!s || furlKeep(s)) continue;                                   // 布片、收好的那一捲（CPU 已經照帆桁轉好）⇒ 照緩衝
    var Z = s.flag && s.meta && s.meta.team ? floopShape(s.meta.flag === 'pennant' ? 'pennant' : 'ensign') : null;
    if (Z && T.n === Z.NU * Z.NV && FL.length < FLOOP_FMAX) {           // 合成的戰鬥旗、長旗（77_colours.js teamFlagsSetup：沿飛 u 為主序、每欄 NV 點、第 0 欄釘在旗桿上）
      var P0 = T.p0, Lg = Math.abs(P0[0] - P0[(Z.NU - 1) * Z.NV * 3]), Hg = Math.abs(P0[2] - P0[(Z.NV - 1) * 3 + 2]), sL = Lg * S / Z.L, sH = Hg * S / Z.H;
      FL.push({ k: k, Z: Z, top: [P0[0], P0[1], P0[2]], sL: sL, sH: sH, rate: 1 / Math.sqrt(Math.max(0.05, sL)), ph: townHash(id + ':flag' + k) });
      for (i = 0; i < n; i++) { var w = (base + i) * 4; X[w] = 1; X[w + 1] = Math.floor(i / Z.NV); X[w + 2] = i % Z.NV; X[w + 3] = FL.length - 1; }
      continue;
    }
    var D = floopSailTpl(T);                                            // 張著的帆、作品自帶的旗：繞帆桁轉＋呼吸
    for (i = 0; i < n; i++) { var w2 = (base + i) * 4, y = D.Y[i] >= 0 ? ys.get(ow.models[D.Y[i]]) : undefined; X[w2] = 2; X[w2 + 1] = y === undefined ? -1 : y; X[w2 + 2] = D.A[i]; X[w2 + 3] = D.ph; }
  }
  if (!B.fxb) B.fxb = gl.createBuffer();
  gl.bindVertexArray(B.vao); gl.bindBuffer(gl.ARRAY_BUFFER, B.fxb); gl.bufferData(gl.ARRAY_BUFFER, X, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 16, 0); gl.bindVertexArray(null); B.fxOn = true;
  var U = ow.fx && ow.fx.U || { A: new Float32Array(FLOOP_FMAX * 4), B: new Float32Array(FLOOP_FMAX * 4), C: new Float32Array(FLOOP_FMAX * 4), Y: new Float32Array(FLOOP_YMAX * 4), W: new Float32Array(4) };
  U.A.fill(0); U.B.fill(0); U.C.fill(0);
  FL.forEach(function (f, j) { U.A.set([f.top[0], f.top[1], f.top[2], f.ph], j * 4); U.B.set([f.Z.c, f.Z.NV, f.Z.NU, f.rate], j * 4); U.C.set([f.sL, f.sH, 0, 0], j * 4); });
  ow.fx = { flags: FL, U: U, ph: townHash(id + ':sway'), ws: 0 };
}
/** 每一格（prepRig）：這一艘的下風方向（船的格座標，照 30_rig_physics.js physWind：停港 ＝ 真風、在動 ＝ 視風）、風速檔位、帆桁現在的轉角。 */
function floopFxFrame(ow) {
  var F = ow.fx, U = F.U, w = physWind(ow)[0], h = Math.hypot(w[0], w[1]), bw = floopBand(h * S), i;
  F.ws = h * S; U.W[0] = h > 1e-6 ? w[0] / h : 1; U.W[1] = h > 1e-6 ? w[1] / h : 0; U.W[2] = townClock(); U.W[3] = F.ph;
  for (i = 0; i < F.flags.length; i++) U.C[i * 4 + 2] = bw;
  var Y = ow.yards || [];
  for (i = 0; i < Y.length && i < FLOOP_YMAX; i++) { var m = Y[i]; U.Y[i * 4] = m.piv[0]; U.Y[i * 4 + 1] = m.piv[1]; U.Y[i * 4 + 2] = m.rot || 0; }
}
/** 畫這一艘之前（drawSails 的循環那一段）。 */
function floopFxSet(p, ow) {
  var U = ow.fx.U, u = p.u;
  if (u.uFA) gl.uniform4fv(u.uFA, U.A); if (u.uFB) gl.uniform4fv(u.uFB, U.B); if (u.uFC) gl.uniform4fv(u.uFC, U.C);
  if (u.uYd) gl.uniform4fv(u.uYd, U.Y); if (u.uFW) gl.uniform4fv(u.uFW, U.W);
}
function floopBind(p) { gl.activeTexture(gl.TEXTURE0 + FLOOP_UNIT); gl.bindTexture(gl.TEXTURE_2D, FLOOP.tex); gl.activeTexture(gl.TEXTURE0); if (p.u.uLT) gl.uniform1i(p.u.uLT, FLOOP_UNIT); }
// ── 建築的旗（63_towns.js townDraw 呼叫）：一次 instanced 畫完；網格是沿飛 19 × 沿旗桿 11 點（粗格的兩倍），位置照粗格雙線性內插；色照圖案貼圖（64 × 32，一格一個像素：國旗 32 × 16 一格剛好 2 × 2） ──
var FLOOP_TOWN_GU = 19, FLOOP_TOWN_GV = 11, FLOOP_PAT = [64, 32];
function floopTownVs() {
  var Z = floopShape('town');
  return '#version 300 es\nlayout(location=0) in vec2 aQ; layout(location=1) in vec4 aI0; layout(location=2) in vec4 aI1; layout(location=3) in vec4 aI2; layout(location=4) in float aI3;\n' +
    'uniform mat4 uVP; uniform vec3 uEye; uniform float uLTt; out vec3 vN; out vec3 vW; out vec2 vU; flat out float vR;\n' + FLOOP_GLSL +
    'const int NU=' + Z.NU + ', NV=' + Z.NV + ', C0=' + Z.c + ';\n' +
    'vec3 tp(int i,int j,float fr,float bw){ return lpP(C0+i*NV+j,fr,bw); }\n' +
    'void main(){ float fr=lpFr(uLTt,aI1.w,aI0.w), bw=aI2.w, cu=aQ.x*float(NU-1), cv=aQ.y*float(NV-1); int i=min(int(cu),NU-2), j=min(int(cv),NV-2); float a=cu-float(i), b=cv-float(j);\n' +
    ' vec3 p00=tp(i,j,fr,bw), p10=tp(i+1,j,fr,bw), p01=tp(i,j+1,fr,bw), p11=tp(i+1,j+1,fr,bw);\n' +
    ' vec3 q=mix(mix(p00,p10,a),mix(p01,p11,a),b), du=mix(p10-p00,p11-p01,b), dv=mix(p01-p00,p11-p10,a);\n' +
    ' vec3 hu=aI0.xyz-aI1.xyz; float sH=length(hu)/' + Z.H.toFixed(4) + ', sL=aI2.z; vec3 up=hu/max(length(hu),1e-4); vec3 f=vec3(aI2.x,0.0,aI2.y); f=normalize(f-up*dot(f,up)+vec3(1e-5,0.0,0.0)); vec3 l=cross(up,f);\n' +
    ' vec3 W=aI0.xyz+f*(q.x*sL)+l*(q.y*sL)+up*(q.z*sH); vec3 n=normalize(cross(f*(du.x*sL)+l*(du.y*sL)+up*(du.z*sH),f*(dv.x*sL)+l*(dv.y*sL)+up*(dv.z*sH)));\n' +
    ' if(dot(uEye-W,n)<0.0) n=-n; vN=n; vW=W; vU=aQ; vR=aI3; gl_Position=uVP*vec4(W,1.0); }\n';
}
/** 建築旗的片段：地面帶子那一支（TOWN_GR_FS，光照、影子、夜裡的燈一樣），只把頂點色換成圖案貼圖照 uv 取（一格一色）。 */
function floopTownFs() {
  var fs = TOWN_GR_FS(false), a = 'in vec3 vC;', b = 'void main(){ ';
  if (fs.indexOf(a) < 0 || fs.indexOf(b) < 0) return null;
  return fs.replace(a, 'in vec2 vU; flat in float vR; uniform sampler2D uPat; uniform float uPatN;').replace(b, b + 'vec3 vC=texture(uPat,vec2(min(vU.x,0.999),(vR+min(vU.y,0.999))/uPatN)).rgb; ');
}
function floopTownGl() {
  var T = FLOOP.town; if (T && T.p) return T;
  if (!T) T = FLOOP.town = { p: null, bad: null, pat: [], patK: new Map(), patTex: null, patN: 0, inst: [], ib: null };
  if (T.bad) return null;
  try {
    var fs = floopTownFs(); if (!fs) { T.bad = '地面帶子的片段著色器換了，對不到'; return null; }
    var p = glProgTry(floopTownVs(), fs); if (!p) return null;
    var Q2 = [], I = [], i, j, NU = FLOOP_TOWN_GU, NV = FLOOP_TOWN_GV;
    for (i = 0; i < NU; i++) for (j = 0; j < NV; j++) Q2.push(i / (NU - 1), j / (NV - 1));
    for (i = 0; i < NU - 1; i++) for (j = 0; j < NV - 1; j++) { var a = i * NV + j, b = a + NV; I.push(a, b, b + 1, a, b + 1, a + 1); }
    T.vao = gl.createVertexArray(); gl.bindVertexArray(T.vao);
    var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(Q2), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    T.ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, T.ib);
    [1, 2, 3].forEach(function (a2, q) { gl.enableVertexAttribArray(a2); gl.vertexAttribDivisor(a2, 1); gl.vertexAttribPointer(a2, 4, gl.FLOAT, false, 52, q * 16); });
    gl.enableVertexAttribArray(4); gl.vertexAttribDivisor(4, 1); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 52, 48);
    var eb = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW); T.ni = I.length;
    gl.bindVertexArray(null); T.p = p; return T;
  } catch (e) { T.bad = String(e && e.message || e).slice(0, 400); console.warn('循環布的建築旗著色器編不過，照以前畫：' + T.bad); return null; }
}
/** 圖案（63_towns.js 的 pat：{ col(u, v) }；null ⇒ 白布）⇒ 圖案貼圖的第幾列（新的圖案 ⇒ 整張重傳，城換勢力時才有）。 */
function floopPatRow(T, pat) {
  var key = pat || 'white', r = T.patK.get(key); if (r !== undefined) return r;
  r = T.pat.length; T.patK.set(key, r); T.pat.push(pat);
  var W = FLOOP_PAT[0], H = FLOOP_PAT[1], N = T.pat.length, px = new Uint8Array(W * H * N * 4);
  T.pat.forEach(function (pt, k) { for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var c = pt ? pt.col((x + 0.5) / W, (y + 0.5) / H) : COL_W, o = ((k * H + y) * W + x) * 4; px[o] = Math.round(c[0] * 255); px[o + 1] = Math.round(c[1] * 255); px[o + 2] = Math.round(c[2] * 255); px[o + 3] = 255; } });
  if (!T.patTex) T.patTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.patTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H * N, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST); });
  [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE); });
  gl.bindTexture(gl.TEXTURE_2D, null); T.patN = N;
  return r;
}
/** 這一格建築旗要不要走循環（烘好了、著色器好了）。 */
function floopTownOn() { return FLOOP_ON && floopReady() && !!floopTownGl(); }
/** 一面建築旗（63_towns.js townFlags 的 F）排進這一格。 */
function floopTownAdd(F) {
  var T = FLOOP.town, Z = floopShape('town'), wl = Math.hypot(WIND[0], WIND[2]) || 1, sL = Math.max(0.05, F.L / Z.L);
  T.inst.push(F.h[0][0], F.h[0][1], F.h[0][2], F.ph / 6.2832, F.h[1][0], F.h[1][1], F.h[1][2], 1 / Math.sqrt(sL), WIND[0] / wl, WIND[2] / wl, sL, floopBand(WIND_SAIL * WX.wind * WIND_SPD), floopPatRow(T, F.pat));
}
/** 這一格排進來的建築旗一次畫完（地面帶子那一段的狀態：剔除關著、多邊形偏移關著）。回三角形數。 */
function floopTownDraw(fogD) {
  var T = FLOOP.town, n = T.inst.length / 13; if (!n) return 0;
  var p = T.p; gl.useProgram(p.prog); setCommon(p); if (p.u.uFogD) gl.uniform1f(p.u.uFogD, fogD); if (p.u.uLTt) gl.uniform1f(p.u.uLTt, townClock());
  floopBind(p); gl.activeTexture(gl.TEXTURE0 + FLOOP_PAT_UNIT); gl.bindTexture(gl.TEXTURE_2D, T.patTex); gl.activeTexture(gl.TEXTURE0);
  if (p.u.uPat) gl.uniform1i(p.u.uPat, FLOOP_PAT_UNIT); if (p.u.uPatN) gl.uniform1f(p.u.uPatN, T.patN);
  gl.bindBuffer(gl.ARRAY_BUFFER, T.ib); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(T.inst), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(T.vao); gl.drawElementsInstanced(gl.TRIANGLES, T.ni, gl.UNSIGNED_SHORT, 0, n); gl.bindVertexArray(null);
  T.inst.length = 0;
  return n * T.ni / 3;
}
// ── 讀數（__game.floop） ──
/** CPU 照播放同一套內插算一點（讀數用；DEBUG 才留 CPU 那一份）：shape、點、時間（秒）、播放倍率、相位、風速檔位 ⇒ 參考尺寸下的位置（公尺）。 */
function floopEval(si, pt, t, rate, ph, bw) {
  if (!FLOOP.data) return null;
  var fr = ((t * rate * (FLOOP_NF / FLOOP_SEC) + ph * FLOOP_NF) % FLOOP_NF + FLOOP_NF) % FLOOP_NF, a = Math.min(Math.floor(fr), FLOOP_NF - 1), a1 = (a + 1) % FLOOP_NF, ft = fr - a;
  var b0 = Math.min(Math.floor(bw), 3), b1 = Math.min(b0 + 1, 3), fb = bw - b0;
  function at(b) { var x = floopPt(si, b, a, pt), y = floopPt(si, b, a1, pt); return [x[0] + (y[0] - x[0]) * ft, x[1] + (y[1] - x[1]) * ft, x[2] + (y[2] - x[2]) * ft]; }
  var A = at(b0), B = at(b1); return [A[0] + (B[0] - A[0]) * fb, A[1] + (B[1] - A[1]) * fb, A[2] + (B[2] - A[2]) * fb];
}
/** 現在畫著的每面旗（繩帆固定的船的旗、建築旗）：照播放同一份資料、同一套內插，接下來 sec 秒（每 1/20 秒一點）尾巴中間那一點離起點最遠多少（公尺，照這一面的大小）。 */
function floopTails(sec) {
  var out = [], t0 = townClock(), n = Math.round(sec * 20), Zt = floopShape('town');
  function tail(si, Z, rate, ph, bw, sL, sH) {
    var pt = (Z.NU - 1) * Z.NV + (Z.NV >> 1), a = null, mx = 0;
    for (var s = 0; s <= n; s++) { var q = floopEval(si, pt, t0 + s / 20, rate, ph, bw); if (!q) return null; q = [q[0] * sL, q[1] * sL, q[2] * sH]; if (!a) a = q; mx = Math.max(mx, Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2])); }
    return +mx.toFixed(3);
  }
  SHIPS.forEach(function (sh) { if (sh.fx) sh.fx.flags.forEach(function (f, j) { var bw = sh.fx.U.C[j * 4 + 2]; out.push({ ship: sh.i, name: sh.name, sail: f.k, kind: f.Z.k, ws: +sh.fx.ws.toFixed(1), band: +bw.toFixed(2), tail: tail(FLOOP_SHAPES.indexOf(f.Z), f.Z, f.rate, f.ph, bw, f.sL, f.sH) }); }); });
  TOWNS.list.forEach(function (T) { (T.flags || []).forEach(function (F, j) { var sL = Math.max(0.05, F.L / Zt.L), sH = Math.hypot(F.h[0][0] - F.h[1][0], F.h[0][1] - F.h[1][1], F.h[0][2] - F.h[1][2]) / Zt.H, bw = floopBand(WIND_SAIL * WX.wind * WIND_SPD);
    out.push({ town: T.id, flag: j, kind: 'town', at: F.at.map(function (v) { return Math.round(v); }), L: +F.L.toFixed(2), band: +bw.toFixed(2), tail: tail(FLOOP_SHAPES.indexOf(Zt), Zt, 1 / Math.sqrt(sL), F.ph / 6.2832, bw, sL, sH) }); }); });
  return out;
}
/** 風速從最弱慢慢加到最強（sec 秒內檔位 0 → 3，時間照走）：每 1/60 秒每一點最大的一步，對照最強那一檔照放的最大一步（公分；參考尺寸、倍率 1）。 */
function floopRamp(si, sec) {
  var S0 = FLOOP_SHAPES[si], np = S0.NU * S0.NV, n = Math.round(sec * 60), mr = 0, m3 = 0, a = null, b = null, k, pt;
  for (k = 0; k <= n; k++) {
    var t = k / 60, cur = [], top = [];
    for (pt = 0; pt < np; pt++) { cur.push(floopEval(si, pt, t, 1, 0, 3 * k / n)); top.push(floopEval(si, pt, t, 1, 0, 3)); }
    if (a) for (pt = 0; pt < np; pt++) { mr = Math.max(mr, Math.hypot(cur[pt][0] - a[pt][0], cur[pt][1] - a[pt][1], cur[pt][2] - a[pt][2])); m3 = Math.max(m3, Math.hypot(top[pt][0] - b[pt][0], top[pt][1] - b[pt][1], top[pt][2] - b[pt][2])); }
    a = cur; b = top;
  }
  return { k: S0.k, sec: sec, rampMax: +(mr * 100).toFixed(2), topMax: +(m3 * 100).toFixed(2) };
}
/** 同一種的旗兩兩比（船上照第幾面排）：同一時刻每一點最大差多少（公尺，參考尺寸）⇒ 相位不同就不會整排同步。 */
function floopPairs() {
  var G = {}, t = townClock(), out = [];
  SHIPS.forEach(function (sh) { if (sh.fx) sh.fx.flags.forEach(function (f, j) { (G[f.Z.k] || (G[f.Z.k] = [])).push({ sh: sh.i, f: f, bw: sh.fx.U.C[j * 4 + 2] }); }); });
  Object.keys(G).forEach(function (k) {
    var L = G[k], si = FLOOP_SHAPES.indexOf(L[0].f.Z), np = L[0].f.Z.NU * L[0].f.Z.NV, mn = Infinity;
    for (var i = 0; i + 1 < L.length; i++) { var a = L[i], b = L[i + 1], d = 0; for (var pt = 0; pt < np; pt++) { var x = floopEval(si, pt, t, a.f.rate, a.f.ph, a.bw), y = floopEval(si, pt, t, b.f.rate, b.f.ph, b.bw); d = Math.max(d, Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])); } mn = Math.min(mn, d); }
    out.push({ kind: k, n: L.length, minPairMax: L.length > 1 ? +mn.toFixed(3) : null });
  });
  return out;
}
/** 第 i 艘張著的帆：綁在帆桁上的點，照著色器那一套（繞轉軸轉 m.rot）放的位置，跟帆桁的模型照 modelLocal 畫的位置差多少（公尺）。 */
function floopYardCheck(i) {
  var sh = SHIPS[i], mx = 0, n = 0; if (!sh || !sh.fx) return null;
  (sh.cl || []).forEach(function (c, k) {
    var s = sh.sails[k], T = c.T; if (!s || s.flag || furlKeep(s) || s.dead) return;
    var D = floopSailTpl(T), hk = T.hk || [];
    for (var v = 0; v < T.n; v++) {
      if (!hk[v] || D.Y[v] < 0) continue;
      var m = sh.models[D.Y[v]]; if (!m || !m.piv) continue;
      var g = [T.p0[v * 3], T.p0[v * 3 + 1], T.p0[v * 3 + 2]], A = rotZ(g, m.piv, m.rot || 0), B = M4.pt(modelLocal(m), g[0] - m.origin[0], g[1] - m.origin[1], g[2] - m.origin[2]);
      mx = Math.max(mx, Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) * S); n++;
    }
  });
  return { ship: i, points: n, maxM: +mx.toFixed(5) };
}
/** 反向對照：原本那四個頻率（不成整數比）、同樣暖機、同樣錄 FLOOP_N 步硬接 ⇒ 接縫那一步、圈內最大一步（公分）。 */
function floopControl(si, bi) {
  var S0 = FLOOP_SHAPES[si], F = floopMake(S0), W = FLOOP_K0, n = S0.NU * S0.NV * 3, fr = [], s, f;
  for (s = 0; s < FLOOP_N * 3; s++) floopStep(F, FLOOP_BANDS[bi], FLOOP_DAMP[0], W);
  for (s = 0; s < FLOOP_N; s++) { if (s % FLOOP_STEP === 0) fr.push(Float64Array.from(F.p)); floopStep(F, FLOOP_BANDS[bi], FLOOP_DAMP[0], W); }
  var inMax = 0; for (f = 0; f < fr.length - 1; f++) inMax = Math.max(inMax, floopDiff(fr[f + 1], fr[f]));
  return { k: S0.k, ws: FLOOP_BANDS[bi], wrap: +(floopDiff(fr[0], fr[fr.length - 1]) * 100).toFixed(2), frameMax: +(inMax * 100).toFixed(2), n: n / 3 };
}

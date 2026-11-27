// ───────────────────────── 帆布的解算在 WebAssembly 裡（TASK-1377） ─────────────────────────
// Tim 2026-11-25：「然後過程中可以看有哪些部分可以遷移到c++優化效能」；量到的第一名是帆布的解算（地球儀開航 20 秒裡 2.7 秒、佔 11%）。
// 原始碼 src/native/rig_cloth.cpp（C++，src/native/build.sh 編成 rig_cloth.wasm，內嵌在成品裡：<script type="application/x-asset" id="rig-wasm">）。
// 只有這一份：遊戲（帆、布片 34_shreds.js）、載入時吹鼓帆的配方（29_sailrecipe.js）都叫它；JS 版那一段拿掉了（Tim 2026-11-18：「希望遊戲運行時也走同一套」）。
// 怎麼叫（TASK-1318 第 3 步的教訓：一點一點跨進去叫不會變快）：
//   · 遊戲：一格只叫一次（rwFlush ⇒ rc_run）。clothStep 只排隊（rwQueue）；這一格全部的船走完（有畫面 ＝ 30_rig_physics.js physFrame 的最後；沒畫面 ＝ 50_sim.js 模擬一步的最後）
//     rwFlush 把排好的每一面寫成一個表頭（256 位元組、接成一排），叫一次 rc_run，wasm 照排隊的順序一面一面走 ⇒ 跟以前一面一面叫的結果逐位元組相同。
//     要讀「走完那一步的布」的那幾項（帆落海、布片落水）用 rwAfter 排在 rwFlush 之後（同一格之內、帆的碰撞 clothContactsRun 之前）。
//   · 布的狀態常駐在 wasm 的記憶體（rwAdopt）：每一面一塊（p、q、到綁點的距離 lraD／lraA、釘住 pin、斷邊 brk／bbrk），c.p 等換成這一塊上的視圖 ⇒ 畫、撕、碰撞照舊直接讀寫 c.p，
//     wasm 也直接讀寫同一塊 ⇒ 不抄進抄出。JS 換掉了哪一個陣列（clothInit 重來、破洞留著那幾行）⇒ 下一次 rwFlush 看到不是視圖 ⇒ 抄進那一塊、換回視圖。
//     ⚠ wasm 的記憶體長大 ⇒ 舊的視圖全部失效（長度變 0）⇒ rwViews 把每一面還指著舊視圖的欄位換成新的（RW_LIVE：常駐的布）；
//       只在配置時長大，配置只在 rwFlush 開頭（寫表頭之前）與載入時 ⇒ 遊戲的其他程式拿著 c.p 的時候不會失效。
//   · 布的模板（邊、靜止長度、三角形）第一次用到時抄進 wasm 的記憶體、之後一直放著（RW_TPL）；模板、布被回收 ⇒ FinalizationRegistry 放掉那一塊。
//   · 載入時吹鼓帆的配方（rwCloth）：一面、抄進抄出，只在載入時跑。
// 逐位元組相同：rig_cloth.cpp 照 JS 的運算順序寫、float 照 Float32Array 的捨法；只有帆的波紋 sin 不再是這個引擎的 Math.sin，
//   而是 fdlibm 的確定版（量過：Chrome 157 的 Math.sin 跟 fdlibm 差 3.5% 的點的最後一位、node 20 一點都不差）⇒ 桌機、手機、node 算出來一樣。
// 開機：rwReady()（05_hull.js loadHull 等它；船型載好之前一定載好）。
var RW = null, RW_P = null, RW_BUF = null, RW_I32 = null, RW_U16 = null, RW_U8 = null, RW_F32 = null, RW_F64 = null;
var RW_H = 0, RW_SCR = 0, RW_SCRN = 0, RW_GRIDS = [], RW_TPL = new WeakMap(), RW_STAT = { calls: 0, runs: 0, jobs: 0, adopt: 0, copyIn: 0, grow: 0, far: 0 };
var RW_JOBS = [], RW_POST = [], RW_JOB = 0, RW_JOBN = 0, RW_LIVE = [], RW_LIVE_MAX = 256;
var RW_GC = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry(function (p) { if (RW) RW.rc_free(p); }) : null;
var RW_WEAK = typeof WeakRef === 'function';                          // 沒有 WeakRef 的引擎 ⇒ RW_LIVE 存布本身（布不會被回收；照樣算對）
var RW_FLAG = { torn: 1, loose: 2, limit: 4, flutter: 8 };          // 同 rig_cloth.cpp 的 F_*
// 常駐那一塊的欄位：[名字, 型別]（4 位元組的在前：對齊）；長度見 rwAdopt
var RW_FIELDS = [['p', Float32Array], ['q', Float32Array], ['lraD', Float32Array], ['lraA', Int32Array], ['pin', Uint8Array], ['brk', Uint8Array], ['bbrk', Uint8Array]];
/** 載入 wasm（只載一次）⇒ Promise。內嵌的位元組在 #rig-wasm（vxk_inline.py 填的 base64）。 */
function rwReady() {
  return RW_P || (RW_P = VK.embeddedBytes('rig-wasm').then(function (b) {
    return WebAssembly.instantiate(b, { env: {
      grid: function (g, x, y, z) { return RW_GRIDS[g].get(x, y, z) ? 1 : 0; },   // 落下來的布碰甲板（rig_cloth.cpp 的 hitGrid）：g ＝ 這一面所在那艘的格子是這一批的第幾個
      sinFar: function (x) { RW_STAT.far++; return Math.sin(x); } } });      // 波紋的角度大到 fdlibm_sin.h 沒寫的範圍（SIMT 約 83 小時以後）
  }).then(function (r) { RW = r.instance.exports; rwViews(); RW_H = RW.rc_alloc(256); rwViews(); if (!RW_H) throw new Error('帆布解算（wasm）配置不到記憶體'); }));
}
/** wasm 的記憶體長大了（buffer 換了）⇒ 重做視圖；常駐的每一面還指著舊視圖的欄位換成新的。 */
function rwViews() {
  var b = RW.memory.buffer; if (b === RW_BUF) return;
  var first = !RW_BUF;
  RW_BUF = b; RW_I32 = new Int32Array(b); RW_U16 = new Uint16Array(b); RW_U8 = new Uint8Array(b); RW_F32 = new Float32Array(b); RW_F64 = new Float64Array(b);
  if (first) return;
  RW_STAT.grow++;
  rwLiveEach(function (c) {
    var k = c.rw, nv = rwMkViews(k);
    RW_FIELDS.forEach(function (f) { if (c[f[0]] === k.v[f[0]]) c[f[0]] = nv[f[0]]; });
    k.v = nv;
  });
}
/** 常駐的每一面布（順便清掉已經回收、放掉的）。 */
function rwLiveEach(fn) {
  var out = [];
  for (var i = 0; i < RW_LIVE.length; i++) { var c = RW_WEAK ? RW_LIVE[i].deref() : RW_LIVE[i]; if (c && c.rw) { if (fn) fn(c); out.push(RW_LIVE[i]); } }
  RW_LIVE = out; RW_LIVE_MAX = Math.max(256, out.length * 2);
}
function rwAlloc(n) { var p = RW.rc_alloc(n); rwViews(); if (!p) throw new Error('帆布解算（wasm）配置不到記憶體（' + n + ' 位元組）'); return p; }
/** 布的模板（meshCons 的 { ea, eb, rest, ba, bb, brest, tris, te }）⇒ 抄進 wasm 的那一塊（同一個模板只抄一次）。 */
function rwTpl(S) {
  var t = RW_TPL.get(S); if (t) return t;
  var nE = S.ea.length, nB = S.ba.length, nT = S.tris.length, o = 0;
  t = { nE: nE, nB: nB, nT: nT };
  t.rest = o; o += nE * 4; t.brest = o; o += nB * 4;                      // float 先（4 對齊），uint16 在後
  t.ea = o; o += nE * 2; t.eb = o; o += nE * 2; t.ba = o; o += nB * 2; t.bb = o; o += nB * 2; t.tris = o; o += nT * 2; t.te = o; o += nT * 2;
  var base = rwAlloc(o + 8);
  ['rest', 'brest', 'ea', 'eb', 'ba', 'bb', 'tris', 'te'].forEach(function (k) { t[k] += base; });
  RW_F32.set(S.rest, t.rest >> 2); RW_F32.set(S.brest, t.brest >> 2);
  RW_U16.set(S.ea, t.ea >> 1); RW_U16.set(S.eb, t.eb >> 1); RW_U16.set(S.ba, t.ba >> 1); RW_U16.set(S.bb, t.bb >> 1); RW_U16.set(S.tris, t.tris >> 1);
  if (S.te) RW_U16.set(S.te, t.te >> 1); else RW_U16.fill(0, t.te >> 1, (t.te >> 1) + nT);   // 沒有 te（吹鼓帆的配方：不會撕）⇒ 全 0
  t.base = base; RW_TPL.set(S, t); if (RW_GC) RW_GC.register(S, base, t);
  return t;
}
/** 吹鼓的暫時模板用完就放掉（不等回收）。 */
function rwTplFree(S) { var t = RW_TPL.get(S); if (!t) return; RW_TPL.delete(S); if (RW_GC) RW_GC.unregister(t); RW.rc_free(t.base); }
function rwMkViews(k) { var v = {}; RW_FIELDS.forEach(function (f) { v[f[0]] = new f[1](RW_BUF, k.off[f[0]], k.len[f[0]]); }); return v; }
/** 這一面布常駐在 wasm（第一次 ⇒ 配一塊；JS 換掉的陣列 ⇒ 抄進那一塊、換回視圖）。t ＝ rwTpl 的模板。⚠ 會配置 ⇒ 只在 rwFlush 開頭叫。 */
function rwAdopt(c, t) {
  var n = c.p.length / 3, k = c.rw, i;
  if (k && (k.n !== n || k.nE !== t.nE || k.nB !== t.nB)) { rwDrop(c); k = null; }   // 點數、邊數變了（換了模板）⇒ 放掉重配
  if (!k) {
    var len = { p: n * 3, q: n * 3, lraD: n, lraA: n, pin: n, brk: t.nE, bbrk: t.nB }, off = {}, o = 0;
    RW_FIELDS.forEach(function (f) { off[f[0]] = o; o += len[f[0]] * f[1].BYTES_PER_ELEMENT; });
    var base = rwAlloc(o + 8);                                           // 可能長大 ⇒ rwViews 已經把別面換好了（這一面還沒常駐、不受影響）
    RW_FIELDS.forEach(function (f) { off[f[0]] += base; });
    k = c.rw = { base: base, n: n, nE: t.nE, nB: t.nB, off: off, len: len, v: null }; k.v = rwMkViews(k);
    if (RW_GC) RW_GC.register(c, base, k);
    if (RW_LIVE.length >= RW_LIVE_MAX) rwLiveEach(null);
    RW_LIVE.push(RW_WEAK ? new WeakRef(c) : c); RW_STAT.adopt++;
  }
  for (i = 0; i < RW_FIELDS.length; i++) {
    var nm = RW_FIELDS[i][0], a = c[nm], v = k.v[nm];
    if (!a || a === v) continue;                                         // 沒有（布片沒有 brk）或已經是視圖
    if (a.length !== v.length) throw new Error('帆布解算（wasm）：' + nm + ' 長度 ' + a.length + '，這一面要 ' + v.length);
    v.set(a); c[nm] = v; RW_STAT.copyIn++;
  }
}
/** 放掉這一面常駐的那一塊（還指著視圖的欄位先抄回 JS 的陣列）。 */
function rwDrop(c) {
  var k = c.rw; if (!k) return;
  RW_FIELDS.forEach(function (f) { if (c[f[0]] === k.v[f[0]]) c[f[0]] = k.v[f[0]].slice(); });
  if (RW_GC) RW_GC.unregister(k);
  RW.rc_free(k.base); c.rw = null;
}
/** 寫一個表頭（rig_cloth.cpp struct Hdr；h ＝ 位址）。a ＝ 這一面各欄的位址 { p, q, pin, brk, bbrk, lraD, lraA }、tp ＝ teth 的位址、nt ＝ 幾筆、g ＝ 格子是這一批的第幾個。 */
function rwHdr(h, t, n, a, tp, nt, o, g) {
  var I = h >> 2, F = (h + 128) >> 3;
  RW_I32[I] = n; RW_I32[I + 1] = t.nE; RW_I32[I + 2] = t.nB; RW_I32[I + 3] = t.nT;
  RW_I32[I + 4] = t.ea; RW_I32[I + 5] = t.eb; RW_I32[I + 6] = t.rest; RW_I32[I + 7] = t.ba; RW_I32[I + 8] = t.bb; RW_I32[I + 9] = t.brest; RW_I32[I + 10] = t.tris; RW_I32[I + 11] = t.te;
  RW_I32[I + 12] = a.p; RW_I32[I + 13] = a.q; RW_I32[I + 14] = a.pin; RW_I32[I + 15] = a.brk; RW_I32[I + 16] = a.bbrk; RW_I32[I + 17] = a.lraD; RW_I32[I + 18] = a.lraA; RW_I32[I + 19] = tp;
  RW_I32[I + 20] = nt; RW_I32[I + 21] = o.flags; RW_I32[I + 22] = o.itn; RW_I32[I + 23] = o.sub; RW_I32[I + 24] = o.limIt || 0; RW_I32[I + 25] = o.steps || 1; RW_I32[I + 26] = g;
  RW_F64[F] = o.inv; RW_F64[F + 1] = o.dms; RW_F64[F + 2] = o.d2s; RW_F64[F + 3] = o.kw; RW_F64[F + 4] = o.flutter || 0; RW_F64[F + 5] = o.st || 0; RW_F64[F + 6] = o.k1 || 0;
  RW_F64[F + 7] = o.wl[0]; RW_F64[F + 8] = o.wl[1]; RW_F64[F + 9] = o.wl[2]; RW_F64[F + 10] = o.gv[0]; RW_F64[F + 11] = o.gv[1]; RW_F64[F + 12] = o.gv[2];
}
/** 排一面布（遊戲：30_rig_physics.js clothStep）—— 這一格的 rwFlush 才真的走。c ＝ { T, p, q, pin, brk, bbrk, lraD, lraA }（照 o.flags 用到哪些）；
 *  teth ＝ [點, x, y, z, 長度, …]（tethPre）；o ＝ { flags, itn, sub, limIt, steps, inv, dms, d2s, kw, flutter, st, k1, wl, gv }；grid ＝ 這一面所在那艘的格子（loose 才用）。 */
function rwQueue(c, teth, o, grid) { RW_JOBS.push({ c: c, teth: teth, o: o, g: grid || null }); }
/** 排在這一格的 rwFlush 之後（要讀走完那一步的布的那幾項）。 */
function rwAfter(fn) { RW_POST.push(fn); }
/** 這一格排好的全部走完：一次 rc_run；然後跑 rwAfter 排的。 */
function rwFlush() {
  var J = RW_JOBS, i, j;
  if (J.length) {
    RW_JOBS = [];
    var maxN = 0, nt = 0, grids = [], gi;
    for (i = 0; i < J.length; i++) {                                     // ① 配置都在這裡（模板、常駐的那一塊、風壓的暫存、表頭那一排）：之後到 rc_run 結束都不會長大
      j = J[i]; j.t = rwTpl(j.c.T.sim); rwAdopt(j.c, j.t);
      if (j.c.rw.n > maxN) maxN = j.c.rw.n;
      if (j.teth) nt += j.teth.length;
      gi = 0; if (j.g) { gi = grids.indexOf(j.g); if (gi < 0) { gi = grids.length; grids.push(j.g); } } j.gi = gi;
    }
    if (RW.rc_reserve(maxN)) { rwViews(); throw new Error('帆布解算（wasm）配置不到風壓的暫存'); }
    rwViews();
    var need = J.length * 256 + nt * 8 + 8;
    if (need > RW_JOBN) { if (RW_JOB) RW.rc_free(RW_JOB); RW_JOB = 0; RW_JOBN = Math.max(need, RW_JOBN * 2, 16384); RW_JOB = rwAlloc(RW_JOBN); }
    var tp = RW_JOB + J.length * 256;                                    // teth（double）接在表頭那一排後面（256 的倍數 ⇒ 8 對齊）
    for (i = 0; i < J.length; i++) {                                     // ② 表頭
      j = J[i]; var m = j.teth ? j.teth.length / 5 : 0;
      if (m) RW_F64.set(j.teth, tp >> 3);
      rwHdr(RW_JOB + i * 256, j.t, j.c.rw.n, j.c.rw.off, m ? tp : 0, m, j.o, j.gi);
      tp += m * 40;
    }
    RW_GRIDS = grids;
    var e = RW.rc_run(RW_JOB, J.length); RW_GRIDS = []; RW_STAT.runs++; RW_STAT.jobs += J.length;   // ③ 一次
    rwViews();
    if (e) throw new Error('帆布解算（wasm）配置不到風壓的暫存（第 ' + e + ' 面）');
  }
  if (RW_POST.length) { var P = RW_POST; RW_POST = []; for (i = 0; i < P.length; i++) P[i](); }
}
/** 一面布馬上走 o.steps 步、抄進抄出（載入時吹鼓帆的配方 29_sailrecipe.js；遊戲走 rwQueue）。S ＝ 模板；c ＝ { p, q, pin, … }：p、q 原地改。 */
function rwCloth(S, c, teth, o, grid) {
  var t = rwTpl(S), n = c.p.length / 3, nt = teth ? teth.length / 5 : 0, torn = o.flags & RW_FLAG.torn, lim = o.flags & RW_FLAG.limit;
  var need = nt * 40 + n * 33 + (torn ? t.nE + t.nB : 0) + 16;           // teth（double）、p q lraD lraA（4 位元組 × 3n、3n、n、n）、pin、brk、bbrk
  if (need > RW_SCRN) { if (RW_SCR) RW.rc_free(RW_SCR); RW_SCR = 0; RW_SCRN = Math.max(need, RW_SCRN * 2, 65536); RW_SCR = rwAlloc(RW_SCRN); }
  if (RW.rc_reserve(n)) { rwViews(); throw new Error('帆布解算（wasm）配置不到風壓的暫存'); }
  rwViews();
  var tp = RW_SCR, a = tp + nt * 40;
  var A = { p: a, q: a + n * 12, lraD: a + n * 24, lraA: a + n * 28, pin: a + n * 32, brk: a + n * 33, bbrk: a + n * 33 + (torn ? t.nE : 0) };
  if (nt) RW_F64.set(teth, tp >> 3);
  RW_F32.set(c.p, A.p >> 2); RW_F32.set(c.q, A.q >> 2); RW_U8.set(c.pin, A.pin);
  if (lim) { RW_F32.set(c.lraD, A.lraD >> 2); RW_I32.set(c.lraA, A.lraA >> 2); }
  if (torn) { RW_U8.set(c.brk, A.brk); RW_U8.set(c.bbrk, A.bbrk); }
  rwHdr(RW_H, t, n, A, tp, nt, o, 0);
  RW_GRIDS = [grid || null];
  var e = RW.rc_step(RW_H); RW_GRIDS = []; RW_STAT.calls++;
  rwViews();
  if (e) throw new Error('帆布解算（wasm）配置不到風壓的暫存');
  c.p.set(RW_F32.subarray(A.p >> 2, (A.p >> 2) + n * 3)); c.q.set(RW_F32.subarray(A.q >> 2, (A.q >> 2) + n * 3));
}

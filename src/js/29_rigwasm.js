// ───────────────────────── 帆布的解算在 WebAssembly 裡（TASK-1377） ─────────────────────────
// Tim 2026-11-25：「然後過程中可以看有哪些部分可以遷移到c++優化效能」；量到的第一名是帆布的解算（地球儀開航 20 秒裡 2.7 秒、佔 11%）。
// 原始碼 src/native/rig_cloth.cpp（C++，src/native/build.sh 編成 rig_cloth.wasm，內嵌在成品裡：<script type="application/x-asset" id="rig-wasm">）。
// 只有這一份：遊戲（帆、布片 34_shreds.js）、載入時吹鼓帆的配方（29_sailrecipe.js）都叫它；JS 版那一段拿掉了（Tim 2026-11-18：「希望遊戲運行時也走同一套」）。
// 怎麼叫（TASK-1318 第 3 步的教訓：一點一點跨進去叫不會變快）：一面布一步叫一次 rc_step，整段迴圈（風壓、Verlet、約束、sheet、拉伸上限）都在裡面跑。
//   · 布的模板（邊、靜止長度、三角形）第一次用到時抄進 wasm 的記憶體、之後一直放著（RW_TPL；模板被回收 ⇒ FinalizationRegistry 放掉那一塊）。
//   · 這一面的狀態（位置 p、上一步 q、釘住、斷邊、到綁點的距離、sheet）每次抄進去、跑完抄 p、q 回來 —— c.p 照舊是 JS 的 Float32Array（畫、撕、碰撞都直接讀寫它）。
//   · wasm 的記憶體長大 ⇒ 舊的視圖失效 ⇒ 每次配置之後 rwViews() 看 buffer 換了沒。
// 逐位元組相同：rig_cloth.cpp 照 JS 的運算順序寫、float 照 Float32Array 的捨法；只有帆的波紋 sin 不再是這個引擎的 Math.sin，
//   而是 fdlibm 的確定版（量過：Chrome 157 的 Math.sin 跟 fdlibm 差 3.5% 的點的最後一位、node 20 一點都不差）⇒ 桌機、手機、node 算出來一樣。
// 開機：rwReady()（05_hull.js loadHull 等它；船型載好之前一定載好）。
var RW = null, RW_P = null, RW_BUF = null, RW_I32 = null, RW_U16 = null, RW_U8 = null, RW_F32 = null, RW_F64 = null;
var RW_H = 0, RW_SCR = 0, RW_SCRN = 0, RW_GRID = null, RW_TPL = new WeakMap(), RW_STAT = { calls: 0, far: 0 };
var RW_GC = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry(function (p) { if (RW) RW.rc_free(p); }) : null;
var RW_FLAG = { torn: 1, loose: 2, limit: 4, flutter: 8 };          // 同 rig_cloth.cpp 的 F_*
/** 載入 wasm（只載一次）⇒ Promise。內嵌的位元組在 #rig-wasm（vxk_inline.py 填的 base64）。 */
function rwReady() {
  return RW_P || (RW_P = VK.embeddedBytes('rig-wasm').then(function (b) {
    return WebAssembly.instantiate(b, { env: {
      grid: function (x, y, z) { return RW_GRID.get(x, y, z) ? 1 : 0; },   // 落下來的布碰甲板（rig_cloth.cpp 的 hitGrid）：這一面所在那艘的格子
      sinFar: function (x) { RW_STAT.far++; return Math.sin(x); } } });      // 波紋的角度大到 fdlibm_sin.h 沒寫的範圍（SIMT 約 83 小時以後）
  }).then(function (r) { RW = r.instance.exports; rwViews(); RW_H = RW.rc_alloc(256); rwViews(); if (!RW_H) throw new Error('帆布解算（wasm）配置不到記憶體'); }));
}
function rwViews() {
  var b = RW.memory.buffer; if (b === RW_BUF) return;
  RW_BUF = b; RW_I32 = new Int32Array(b); RW_U16 = new Uint16Array(b); RW_U8 = new Uint8Array(b); RW_F32 = new Float32Array(b); RW_F64 = new Float64Array(b);
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
/** 一面布走 o.steps 步（rig_cloth.cpp rc_step）。S ＝ 模板；c ＝ { p, q, pin, brk, bbrk, lraD, lraA }（照 o.flags 用到哪些）；teth ＝ [點, x, y, z, 長度, …]（sheet 拉住的帆腳，tethPre）；
 *  o ＝ { flags, itn, sub, limIt, steps, inv, dms, d2s, kw, flutter, st, k1, wl, gv }；grid ＝ 這一面所在那艘的格子（loose 才用）。p、q 原地改。 */
function rwCloth(S, c, teth, o, grid) {
  var t = rwTpl(S), n = c.p.length / 3, nt = teth ? teth.length / 5 : 0, torn = o.flags & RW_FLAG.torn, lim = o.flags & RW_FLAG.limit;
  var need = nt * 40 + n * 32 + n + (torn ? t.nE + t.nB : 0) + 16;       // teth（double）、p q lraD lraA（4 位元組 × 3n、3n、n、n）、pin、brk、bbrk
  if (need > RW_SCRN) { if (RW_SCR) RW.rc_free(RW_SCR); RW_SCRN = Math.max(need, RW_SCRN * 2, 65536); RW_SCR = rwAlloc(RW_SCRN); }
  var a = RW_SCR, tp = a; a += nt * 40;
  var pp = a; a += n * 12; var qp = a; a += n * 12; var dp = a; a += n * 4; var ap = a; a += n * 4;
  var pn = a; a += n; var bk = a; a += torn ? t.nE : 0; var bb = a;
  if (nt) RW_F64.set(teth, tp >> 3);
  RW_F32.set(c.p, pp >> 2); RW_F32.set(c.q, qp >> 2); RW_U8.set(c.pin, pn);
  if (lim) { RW_F32.set(c.lraD, dp >> 2); RW_I32.set(c.lraA, ap >> 2); }
  if (torn) { RW_U8.set(c.brk, bk); RW_U8.set(c.bbrk, bb); }
  var I = RW_H >> 2, F = (RW_H + 128) >> 3;
  RW_I32[I] = n; RW_I32[I + 1] = t.nE; RW_I32[I + 2] = t.nB; RW_I32[I + 3] = t.nT;
  RW_I32[I + 4] = t.ea; RW_I32[I + 5] = t.eb; RW_I32[I + 6] = t.rest; RW_I32[I + 7] = t.ba; RW_I32[I + 8] = t.bb; RW_I32[I + 9] = t.brest; RW_I32[I + 10] = t.tris; RW_I32[I + 11] = t.te;
  RW_I32[I + 12] = pp; RW_I32[I + 13] = qp; RW_I32[I + 14] = pn; RW_I32[I + 15] = bk; RW_I32[I + 16] = bb; RW_I32[I + 17] = dp; RW_I32[I + 18] = ap; RW_I32[I + 19] = tp;
  RW_I32[I + 20] = nt; RW_I32[I + 21] = o.flags; RW_I32[I + 22] = o.itn; RW_I32[I + 23] = o.sub; RW_I32[I + 24] = o.limIt || 0; RW_I32[I + 25] = o.steps || 1;
  RW_F64[F] = o.inv; RW_F64[F + 1] = o.dms; RW_F64[F + 2] = o.d2s; RW_F64[F + 3] = o.kw; RW_F64[F + 4] = o.flutter || 0; RW_F64[F + 5] = o.st || 0; RW_F64[F + 6] = o.k1 || 0;
  RW_F64[F + 7] = o.wl[0]; RW_F64[F + 8] = o.wl[1]; RW_F64[F + 9] = o.wl[2]; RW_F64[F + 10] = o.gv[0]; RW_F64[F + 11] = o.gv[1]; RW_F64[F + 12] = o.gv[2];
  RW_GRID = grid || null;
  var e = RW.rc_step(RW_H); RW_GRID = null; RW_STAT.calls++;
  rwViews();                                                              // 裡面配了風壓的暫存 ⇒ 記憶體可能長大了
  if (e) throw new Error('帆布解算（wasm）配置不到風壓的暫存');
  c.p.set(RW_F32.subarray(pp >> 2, (pp >> 2) + n * 3)); c.q.set(RW_F32.subarray(qp >> 2, (qp >> 2) + n * 3));
}

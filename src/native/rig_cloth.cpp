// 帆布的解算（TASK-1377）：js/30_rig_physics.js 的 clothStep 那一整段迴圈 —— 風壓、Verlet、距離約束（solve）、sheet 拉住帆腳（tethSolve）、
//   拉伸上限（clothLimit）—— 搬進 C++ 編成 WebAssembly。JS 那邊一面布一步只叫一次 rc_step（⛔ 不是一點一點跨進來叫：TASK-1318 第 3 步的教訓）。
//   也給 js/29_sailrecipe.js 吹鼓用（同一個入口：steps 步、沒有波紋）。
//
// 一致性（照 TASK-1318 的規則，Blocksail docs/NATIVE.md §5）：
//   · 布的點在 JS 是 Float32Array：讀進來換成 double 算、寫回去才捨成 float（跟 JS 讀寫 Float32Array 一樣）；風壓的累加器（JS 的 CACC）也是 float。
//   · 運算順序照 JS 一個一個寫（a + b * c ＝ a + (b * c)、左結合）；build.sh 加 -ffp-contract=off（不合併乘加）。
//   · 只用加減乘除、sqrt、fabs、floor（IEEE 規定正確捨入）；sin 用 fdlibm_sin.h（確定版，不是哪個引擎的 Math.sin）。
//   · 獨立的 wasm（不連 libc）：沒有 malloc ⇒ 下面自己寫一個按 2 的次方分級的配置器。
//   · 匯入兩個 JS 函式：grid（落下來的布碰甲板：這艘的格子在 JS，VoxelKit Grid.get）、sinFar（波紋的角度大到 fdlibm_sin.h 沒寫的範圍）。
#include <stdint.h>
#include "fdlibm_sin.h"

#define EXPORT(n) extern "C" __attribute__((export_name(n)))
extern "C" __attribute__((import_module("env"), import_name("grid"))) int js_grid(double x, double y, double z);
extern "C" __attribute__((import_module("env"), import_name("sinFar"))) double js_sin_far(double x);

// ── 配置器：區塊前面 8 位元組記級別；級別 k ＝ 2^k 位元組（含表頭）；放掉的串在各級的串列上 ──
extern "C" unsigned char __heap_base;
static uint32_t heapTop = 0;
static uint32_t freeList[32];
static uint32_t grow(uint32_t bytes) {
  if (!heapTop) heapTop = ((uint32_t)(uintptr_t)&__heap_base + 15u) & ~15u;
  uint32_t at = heapTop, end = at + bytes, have = (uint32_t)__builtin_wasm_memory_size(0) * 65536u;
  if (end > have) { uint32_t pages = (end - have + 65535u) / 65536u; if (__builtin_wasm_memory_grow(0, pages) == (__SIZE_TYPE__)-1) return 0; }
  heapTop = end; return at;
}
EXPORT("rc_alloc") uint32_t rc_alloc(uint32_t bytes) {
  uint32_t need = bytes + 8u, k = 4; while ((1u << k) < need) k++;
  uint32_t b = freeList[k];
  if (b) freeList[k] = *(uint32_t*)(uintptr_t)(b + 8u);
  else { b = grow(1u << k); if (!b) return 0; }
  *(uint32_t*)(uintptr_t)b = k;
  return b + 8u;
}
EXPORT("rc_free") void rc_free(uint32_t p) {
  if (!p) return;
  uint32_t b = p - 8u, k = *(uint32_t*)(uintptr_t)b;
  *(uint32_t*)(uintptr_t)(b + 8u) = freeList[k]; freeList[k] = b;
}

// ── 一次呼叫的表頭（JS 寫、這裡讀）：前面 32 個 int32、後面 16 個 double（位移照 js/29_rigwasm.js 的 RW_H）──
struct Hdr {
  int32_t n, nE, nB, nT;                          // 點數、結構邊、跨點邊、tris 的長度（三角形數 × 3）
  int32_t ea, eb, rest, ba, bb, brest, tris, te;  // 布的模板（位址）：邊 uint16、靜止長度 float、三角形 uint16、三角形的三條邊 uint16
  int32_t p, q, pin, brk, bbrk, lraD, lraA, teth; // 這一面：位置、上一步位置（float × 3n）、釘住 uint8、斷掉的邊 uint8、到綁點的距離 float、哪個綁點 int32、sheet 拉住的帆腳（double × 5 一筆）
  int32_t nTeth, flags, itn, sub, limIt, steps, pad0, pad1, pad5, pad6, pad7, pad8;
  double inv, dms, d2s, kw, flutter, st, k1, wl0, wl1, wl2, gv0, gv1, gv2, pad2, pad3, pad4;
};
static_assert(sizeof(Hdr) == 256, "表頭 256 位元組（JS 那邊照這個排）");
enum { F_TORN = 1, F_LOOSE = 2, F_LIMIT = 4, F_FLUTTER = 8 };

template <class T> static inline T* at(int32_t a) { return (T*)(uintptr_t)(uint32_t)a; }

static float* ACC = nullptr; static uint8_t* CNT = nullptr; static int32_t accN = 0;
static uint32_t sinFarN = 0;
static double sinFar(double x) { sinFarN++; return js_sin_far(x); }

// 距離約束（JS 的 solve）：Gauss–Seidel，照邊的順序
static void solve(const uint16_t* ea, const uint16_t* eb, const float* rest, const uint8_t* brk, int32_t nE, float* p, const uint8_t* pin, double k) {
  for (int32_t e = 0; e < nE; e++) {
    if (brk && brk[e]) continue;
    int32_t a = ea[e], b = eb[e], wa = pin[a] ? 0 : 1, wb = pin[b] ? 0 : 1; if (!(wa + wb)) continue;
    int32_t ia = a * 3, ib = b * 3;
    double dx = (double)p[ib] - (double)p[ia], dy = (double)p[ib + 1] - (double)p[ia + 1], dz = (double)p[ib + 2] - (double)p[ia + 2], l = __builtin_sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-9) continue;
    double f = ((double)l - (double)rest[e]) / l * (wa + wb == 2 ? k * 0.5 : k);   // JS：(l − rest) / l × k / (wa ＋ wb) —— k、wa＋wb 都是 2 的次方 ⇒ 乘 k × ½ 跟先乘再除逐位元相同（少一次除法，微型量測 −9%）
    if (wa) { p[ia] = (float)((double)p[ia] + dx * f); p[ia + 1] = (float)((double)p[ia + 1] + dy * f); p[ia + 2] = (float)((double)p[ia + 2] + dz * f); }
    if (wb) { p[ib] = (float)((double)p[ib] - dx * f); p[ib + 1] = (float)((double)p[ib + 1] - dy * f); p[ib + 2] = (float)((double)p[ib + 2] - dz * f); }
  }
}
// 帆腳被 sheet 拉住（JS 的 tethSolve）：一筆 ＝ { 點, sheet 另一端 x, y, z, 長度 }（JS 那邊照這一步的帆桁角度先算好 L）
static void tethSolve(const double* T, int32_t nT, float* p) {
  for (int32_t k = 0; k < nT; k++, T += 5) {
    int32_t o = (int32_t)T[0] * 3; double qx = T[1], qy = T[2], qz = T[3], L = T[4];
    double dx = (double)p[o] - qx, dy = (double)p[o + 1] - qy, dz = (double)p[o + 2] - qz, l = __builtin_sqrt(dx * dx + dy * dy + dz * dz);
    if (l > L && l > 1e-9) { double s = L / l; p[o] = (float)(qx + dx * s); p[o + 1] = (float)(qy + dy * s); p[o + 2] = (float)(qz + dz * s); }
  }
}
// 拉伸上限（JS 的 clothLimit；綁點與沿著布的距離 lraD／lraA 由 JS 算好給：只在綁點、斷邊、sheet 變了才重算）
static void clothLimit(const Hdr& H, float* p, const uint8_t* pin, const uint8_t* brk) {
  const uint16_t *ea = at<uint16_t>(H.ea), *eb = at<uint16_t>(H.eb); const float* rest = at<float>(H.rest); double k1 = H.k1;
  int32_t pass, bad;
  for (pass = 0, bad = 1; pass < H.limIt && bad; pass++) {   // 相鄰的邊互相拉 ⇒ 一遍夾不完：最多 limIt 遍、沒有超過的就停
    bad = 0;
    for (int32_t e = 0; e < H.nE; e++) {
      if (brk && brk[e]) continue;
      int32_t a = ea[e], b = eb[e], wa = pin[a] ? 0 : 1, wb = pin[b] ? 0 : 1; if (!(wa + wb)) continue;
      int32_t ia = a * 3, ib = b * 3;
      double dx = (double)p[ib] - (double)p[ia], dy = (double)p[ib + 1] - (double)p[ia + 1], dz = (double)p[ib + 2] - (double)p[ia + 2], l2 = dx * dx + dy * dy + dz * dz, lm = (double)rest[e] * k1;
      if (l2 <= lm * lm) continue;
      double l = __builtin_sqrt(l2), f = (l - lm) / l * (wa + wb == 2 ? 0.5 : 1.0); bad++;   // 除以 1 或 2 ＝ 乘 1 或 ½（同上）
      if (wa) { p[ia] = (float)((double)p[ia] + dx * f); p[ia + 1] = (float)((double)p[ia + 1] + dy * f); p[ia + 2] = (float)((double)p[ia + 2] + dz * f); }
      if (wb) { p[ib] = (float)((double)p[ib] - dx * f); p[ib + 1] = (float)((double)p[ib + 1] - dy * f); p[ib + 2] = (float)((double)p[ib + 2] - dz * f); }
    }
  }
  const float* D = at<float>(H.lraD); const int32_t* A = at<int32_t>(H.lraA);
  for (int32_t i = 0; i < H.n; i++) {
    int32_t an = A[i]; if (an < 0 || an == i || pin[i]) continue;
    int32_t o = i * 3, q = an * 3;
    double x = (double)p[o] - (double)p[q], y = (double)p[o + 1] - (double)p[q + 1], z = (double)p[o + 2] - (double)p[q + 2], d2 = x * x + y * y + z * z, lim = (double)D[i] * k1;
    if (d2 <= lim * lim) continue;
    double s = lim / __builtin_sqrt(d2);
    p[o] = (float)((double)p[q] + x * s); p[o + 1] = (float)((double)p[q + 1] + y * s); p[o + 2] = (float)((double)p[q + 2] + z * s);
  }
}

// 一面布走 H.steps 步（每一步 ＝ JS clothStep 一次）。回 0 ＝ 走完；1 ＝ 配置不到風壓的暫存（JS 那邊報錯）
EXPORT("rc_step") int32_t rc_step(uint32_t hp) {
  const Hdr& H = *at<Hdr>((int32_t)hp);
  int32_t n = H.n;
  if (n > accN) { rc_free((uint32_t)(uintptr_t)ACC); rc_free((uint32_t)(uintptr_t)CNT); ACC = at<float>((int32_t)rc_alloc((uint32_t)n * 12u)); CNT = at<uint8_t>((int32_t)rc_alloc((uint32_t)n)); if (!ACC || !CNT) { accN = 0; return 1; } accN = n; }
  float *p = at<float>(H.p), *q = at<float>(H.q), *A = ACC; uint8_t* N = CNT;
  const uint8_t* pin = at<uint8_t>(H.pin);
  const uint16_t *tr = at<uint16_t>(H.tris), *te = at<uint16_t>(H.te);
  const bool torn = H.flags & F_TORN, loose = H.flags & F_LOOSE, lim = H.flags & F_LIMIT, flut = H.flags & F_FLUTTER;
  const uint8_t *brk = torn ? at<uint8_t>(H.brk) : nullptr, *bbrk = torn ? at<uint8_t>(H.bbrk) : nullptr;
  const double inv = H.inv, kw = H.kw, wl[3] = { H.wl0, H.wl1, H.wl2 }, gv[3] = { H.gv0, H.gv1, H.gv2 };
  for (int32_t step = 0; step < H.steps; step++) {
    for (int32_t i = 0; i < n * 3; i++) A[i] = 0;
    for (int32_t i = 0; i < n; i++) N[i] = 0;
    for (int32_t j = 0; j < H.nT; j += 3) {        // 風壓：每個三角形沿法線推，大小 ∝（相對風在法線上的分量）²，相對風扣掉布自己的速度
      if (torn && (brk[te[j]] || brk[te[j + 1]] || brk[te[j + 2]])) continue;
      int32_t a = tr[j] * 3, b = tr[j + 1] * 3, d = tr[j + 2] * 3;
      double pa0 = p[a], pa1 = p[a + 1], pa2 = p[a + 2], pb0 = p[b], pb1 = p[b + 1], pb2 = p[b + 2], pd0 = p[d], pd1 = p[d + 1], pd2 = p[d + 2];
      double ux = pb0 - pa0, uy = pb1 - pa1, uz = pb2 - pa2, vx = pd0 - pa0, vy = pd1 - pa1, vz = pd2 - pa2;
      double nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = __builtin_sqrt(nx * nx + ny * ny + nz * nz);
      if (l < 1e-9) continue;
      nx = nx / l; ny = ny / l; nz = nz / l;
      double rx = wl[0] - (pa0 - (double)q[a] + pb0 - (double)q[b] + pd0 - (double)q[d]) * inv;
      double ry = wl[1] - (pa1 - (double)q[a + 1] + pb1 - (double)q[b + 1] + pd1 - (double)q[d + 1]) * inv;
      double rz = wl[2] - (pa2 - (double)q[a + 2] + pb2 - (double)q[b + 2] + pd2 - (double)q[d + 2]) * inv;
      double dn = rx * nx + ry * ny + rz * nz, f = kw * dn * __builtin_fabs(dn);
      if (flut) f = f * (1 + H.flutter * fdl::sin((pa0 * 0.9 + pa2) * 0.06 - H.st, sinFar));   // 一道一道走過布面的風（不抽亂數）
      double fx = f * nx, fy = f * ny, fz = f * nz;
      A[a] = (float)((double)A[a] + fx); A[a + 1] = (float)((double)A[a + 1] + fy); A[a + 2] = (float)((double)A[a + 2] + fz);
      A[b] = (float)((double)A[b] + fx); A[b + 1] = (float)((double)A[b + 1] + fy); A[b + 2] = (float)((double)A[b + 2] + fz);
      A[d] = (float)((double)A[d] + fx); A[d + 1] = (float)((double)A[d + 1] + fy); A[d + 2] = (float)((double)A[d + 2] + fz);
      N[a / 3]++; N[b / 3]++; N[d / 3]++;
    }
    for (int32_t it = 0; it < H.itn; it++) {
      if (it < H.sub) for (int32_t i = 0; i < n; i++) {
        if (pin[i]) continue;
        int32_t o = i * 3; double kk = N[i] ? 1.0 / (double)N[i] : 0.0;
        for (int32_t x = 0; x < 3; x++) { double cur = p[o + x], vel = (cur - (double)q[o + x]) * H.dms; q[o + x] = (float)cur; p[o + x] = (float)(cur + vel + ((double)A[o + x] * kk + gv[x]) * H.d2s); }
        if (loose && js_grid(__builtin_floor((double)p[o]), __builtin_floor((double)p[o + 1]), __builtin_floor((double)p[o + 2])) && !js_grid(__builtin_floor((double)q[o]), __builtin_floor((double)q[o + 1]), __builtin_floor((double)q[o + 2]))) { p[o] = q[o]; p[o + 1] = q[o + 1]; p[o + 2] = q[o + 2]; }   // 落在格子裡（甲板、船殼）⇒ 退回上一步（JS 的 hitGrid）
      }
      solve(at<uint16_t>(H.ea), at<uint16_t>(H.eb), at<float>(H.rest), brk, H.nE, p, pin, 1);
      if (it & 1) solve(at<uint16_t>(H.ba), at<uint16_t>(H.bb), at<float>(H.brest), bbrk, H.nB, p, pin, 0.5);
      if (H.nTeth) tethSolve(at<double>(H.teth), H.nTeth, p);
      if (H.sub > 1 && lim) clothLimit(H, p, pin, brk);
    }
    if (H.sub == 1 && lim) clothLimit(H, p, pin, brk);
  }
  return 0;
}
// 量用：波紋的角度大到退回 JS 的次數（rc_sin_far_n）；fdlibm sin 本身（對拍：tools 跟 Math.sin 比）
EXPORT("rc_sin_far_n") uint32_t rc_sin_far_n() { return sinFarN; }
EXPORT("rc_sin") double rc_sin(double x) { return fdl::sin(x, sinFar); }

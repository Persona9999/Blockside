// Math.sin 的確定版（TASK-1377）：照 fdlibm 的 s_sin.c ＋ k_sin.c、k_cos.c、e_rem_pio2.c（中等範圍）一行一行寫
//   為什麼不用 Math.sin：JS 引擎之間本來就不一樣（V8 早年是 fdlibm，後來換成 glibc 的實作；別的引擎、手機的編譯器又可能合併乘加）
//   ⇒ wasm 裡用這一份，桌機、手機、node、exe 算出來逐位元相同。
//   只寫 |x| ≤ 2^20 × π/2 這一段；更大的（要 __kernel_rem_pio2 的長除法）⇒ 交給呼叫端給的退路（rig_cloth.cpp：叫 JS 的 Math.sin、計數）
//     帆的波紋 sin((x·0.9 + z)·0.06 − SIMT·5.5)：SIMT 要超過約 83 小時才到得了
//   e_rem_pio2.c 的捷徑表（npio2_hw）照不寫：一律走核消去那條路 —— 捷徑只是省事，表上沒有的 x 消去不會超過 16 位 ⇒ 兩條路同一個數
//
// fdlibm 原檔的授權聲明（照原樣保留）：
//   Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
//   Developed at SunSoft, a Sun Microsystems, Inc. business.
//   Permission to use, copy, modify, and distribute this software is freely granted, provided that this notice is preserved.
#pragma once
#include <stdint.h>

namespace fdl {

static inline int32_t HI(double x) { uint64_t b = __builtin_bit_cast(uint64_t, x); return (int32_t)(uint32_t)(b >> 32); }
static inline double HL(int32_t hi, uint32_t lo) { uint64_t b = ((uint64_t)(uint32_t)hi << 32) | lo; return __builtin_bit_cast(double, b); }

static inline double kcos(double x, double y) {
  const double C1 = HL(0x3FA55555, 0x5555554Cu), C2 = HL((int32_t)0xBF56C16C, 0x16C15177u), C3 = HL(0x3EFA01A0, 0x19CB1590u),
               C4 = HL((int32_t)0xBE927E4F, 0x809C52ADu), C5 = HL(0x3E21EE9E, 0xBDB4B1C4u), C6 = HL((int32_t)0xBDA8FAE9, 0xBE8838D4u);
  int32_t ix = HI(x) & 0x7fffffff;
  if (ix < 0x3e400000) { if ((int)x == 0) return 1.0; }
  double z = x * x, r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3FD33333) return 1.0 - (0.5 * z - (z * r - x * y));
  double qx = ix > 0x3fe90000 ? 0.28125 : HL(ix - 0x00200000, 0);
  double hz = 0.5 * z - qx, a = 1.0 - qx;
  return a - (hz - (z * r - x * y));
}
static inline double ksin(double x, double y, int iy) {
  const double S1 = HL((int32_t)0xBFC55555, 0x55555549u), S2 = HL(0x3F811111, 0x1110F8A6u), S3 = HL((int32_t)0xBF2A01A0, 0x19C161D5u),
               S4 = HL(0x3EC71DE3, 0x57B1FE7Du), S5 = HL((int32_t)0xBE5AE5E6, 0x8A2B9CEBu), S6 = HL(0x3DE5D93A, 0x5ACFD57Cu);
  int32_t ix = HI(x) & 0x7fffffff;
  if (ix < 0x3e400000) { if ((int)x == 0) return x; }
  double z = x * x, v = z * x, r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy == 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
// e_rem_pio2.c 到中等範圍為止；回 n（y[0] ＋ y[1] ＝ x − n·π/2）；太大 ⇒ 回 INT32_MIN
static inline int32_t remPio2(double x, double* y) {
  const double pio2_1 = HL(0x3FF921FB, 0x54400000u), pio2_1t = HL(0x3DD0B461, 0x1A626331u), pio2_2 = HL(0x3DD0B461, 0x1A600000u),
               pio2_2t = HL(0x3BA3198A, 0x2E037073u), pio2_3 = HL(0x3BA3198A, 0x2E000000u), pio2_3t = HL(0x397B839A, 0x252049C1u),
               invpio2 = HL(0x3FE45F30, 0x6DC9C883u);
  int32_t hx = HI(x), ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) { y[0] = x; y[1] = 0; return 0; }
  if (ix < 0x4002d97c) {
    if (hx > 0) {
      double z = x - pio2_1;
      if (ix != 0x3ff921fb) { y[0] = z - pio2_1t; y[1] = (z - y[0]) - pio2_1t; }
      else { z -= pio2_2; y[0] = z - pio2_2t; y[1] = (z - y[0]) - pio2_2t; }
      return 1;
    } else {
      double z = x + pio2_1;
      if (ix != 0x3ff921fb) { y[0] = z + pio2_1t; y[1] = (z - y[0]) + pio2_1t; }
      else { z += pio2_2; y[0] = z + pio2_2t; y[1] = (z - y[0]) + pio2_2t; }
      return -1;
    }
  }
  if (ix <= 0x413921fb) {
    double t = __builtin_fabs(x); int32_t n = (int32_t)(t * invpio2 + 0.5); double fn = (double)n, r = t - fn * pio2_1, w = fn * pio2_1t;
    int32_t j = ix >> 20; y[0] = r - w; int32_t i = j - ((HI(y[0]) >> 20) & 0x7ff);
    if (i > 16) {
      t = r; w = fn * pio2_2; r = t - w; w = fn * pio2_2t - ((t - r) - w); y[0] = r - w; i = j - ((HI(y[0]) >> 20) & 0x7ff);
      if (i > 49) { t = r; w = fn * pio2_3; r = t - w; w = fn * pio2_3t - ((t - r) - w); y[0] = r - w; }
    }
    y[1] = (r - y[0]) - w;
    if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
    return n;
  }
  return INT32_MIN;
}
// s_sin.c；far ＝ 太大時的退路（回傳值照用、呼叫端自己計數）
static inline double sin(double x, double (*far)(double)) {
  int32_t ix = HI(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return ksin(x, 0.0, 0);
  if (ix >= 0x7ff00000) return x - x;
  double y[2]; int32_t n = remPio2(x, y);
  if (n == INT32_MIN) return far(x);
  switch (n & 3) { case 0: return ksin(y[0], y[1], 1); case 1: return kcos(y[0], y[1]); case 2: return -ksin(y[0], y[1], 1); default: return -kcos(y[0], y[1]); }
}

}  // namespace fdl

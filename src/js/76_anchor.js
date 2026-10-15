// ───────────────────────── 拋錨（TASK-0601；Tim 2026-10-15：停船改叫拋錨、要有戰局效果 —— 船停住、可以繞錨轉向；
//   左右錨分開拋（錨被打壞就不能按）；只拋單邊做急轉（《黑帆》裡只拋一側錨，船繞錨甩過去）） ─────────────────────────
// 每艘兩個錨（P 左舷、S 右舷），錨鏈孔 ＝ 錨掛著的地方（錨的模型或關聯的中心；這一型找不到錨 ⇒ 船頭兩側，打不壞）。
//   狀態：up 收著 → drop 往下沉（ANC_FALL 秒）→ down 落底咬住 → weigh 起錨（ANC_WEIGH 秒，鍊子收短、把船拉向錨）→ up。
//   落底的點 ＝ 放開那一刻錨鏈孔正下方（海面上的 x、z，海底在水線下 ANC_DEPTH）；鍊長 ANC_CHAIN ⇒ 錨鏈孔離錨的水平距離最多 ANC_REACH。
// 約束（down／weigh）：錨鏈孔超過 ANC_REACH ⇒ 拉回圓周上；船身當剛體繞錨鏈孔轉（船心照動量走、船頭被拴住 ⇒ 往前的動量變成轉向）：
//   帶著速度只拋一側 ⇒ 鍊子一拉緊，船頭被拴在那一側、船尾甩出去 ＝ 急轉；兩側都拋 ⇒ 停住，A／D 原地慢慢轉（ANC_PIVOT）、電腦照舊轉舷側對敵。
//   拉緊的時候每秒掉 1／ANC_DRAG 的速度（鍊子拖著）；鍊子要船轉得比 ANC_YAWMAX 快 ⇒ 錨在海底被拖著走（船只轉到上限、每秒掉 1／ANC_DRAGX）。錨被打壞（模型沒了、關聯的格少了一半）⇒ 那一側斷鍊、船放開，不能再拋。
// ⛔ 不抽 rnd()；沒拋錨的船一位元都不動（sh.anc 只有拋過才建）。
var ANC_DEPTH = 20, ANC_CHAIN = 36, ANC_REACH = Math.sqrt(ANC_CHAIN * ANC_CHAIN - ANC_DEPTH * ANC_DEPTH), ANC_FALL = 4, ANC_WEIGH = 8, ANC_DRAG = 8, ANC_DRAGX = 2.5, ANC_PIVOT = 0.06, ANC_YAWMAX = 0.5;   // 公尺、秒、rad/s
/** 這艘的兩個錨（第一次要用才建）：錨鏈孔的格座標、是哪個部件（模型／關聯／沒有）。 */
function anchorsOf(sh) {
  if (sh.anc) return sh.anc;
  var T = sh.T, out = {};
  ['P', 'S'].forEach(function (k) {
    var sg = k === 'S' ? 1 : -1, a = { side: k, st: 'up', A: null, t: 0, m: null, part: null, hx: T.wl1 - 12, hy: T.cy + sg * Math.max(4, T.bowHalf - 2), hz: T.zw + 25, broken: false };   // hz：鐵鍊從哪個高度出來（畫用）
    var m = sh.models.filter(function (q) { return q.meta && q.meta.kind === 'anchor' && (q.c[1] - T.cy) * sg > 0; })[0];
    var p = !m && (T.h.parts || []).filter(function (q) { return /錨/.test(q.path || '') && q.box && ((q.box[1] + q.box[4]) / 2 - T.cy) * sg > 0; })[0];
    if (m) { a.m = m; a.hx = m.c[0]; a.hy = m.c[1]; a.hz = m.bb[5]; }
    else if (p) {                                                        // 關聯（格子）：開局記下它的格（每 4 格取 1），之後少了一半 ⇒ 打壞
      var b = p.box, cells = [];
      for (var x = b[0]; x <= b[3]; x += 2) for (var y = b[1]; y <= b[4]; y += 2) for (var z = b[2]; z <= b[5]; z += 1) if (T.base.get(x, y, z)) cells.push(x, y, z);
      a.part = { path: p.path, cells: cells }; a.hx = (b[0] + b[3]) / 2; a.hy = (b[1] + b[4]) / 2; a.hz = b[5];
    }
    out[k] = a;
  });
  return (sh.anc = out);
}
function anchorAlive(sh, a) {
  if (a.broken) return false;
  if (a.m) return a.m.alive;
  if (a.part) { var C = a.part.cells, n = 0; for (var i = 0; i < C.length; i += 3) if (sh.grid.get(C[i], C[i + 1], C[i + 2])) n++; return n * 2 >= C.length / 3; }
  return true;
}
/** 錨鏈孔在世界的水平位置（x、z）—— 照 (px, pz, yaw) 算（shipMatrix 的水平部分）。 */
function hawseXZ(sh, a, px, pz, yaw) {
  var lx = S * (a.hx - sh.T.cx), lz = S * (a.hy - sh.T.cy), c = Math.cos(yaw), s = Math.sin(yaw);
  return [px + lx * c + lz * s, pz - lx * s + lz * c];
}
/** 拋（up ⇒ drop）或起（drop／down ⇒ weigh）。回傳發生了什麼（給廣播）。 */
function anchorToggle(sh, k, want) {
  var A = anchorsOf(sh), a = A[k], nm = k === 'P' ? '左錨' : '右錨';
  if (want === undefined) want = a.st === 'up';
  if (want) {
    if (a.st !== 'up') return '';
    if (!anchorAlive(sh, a)) { a.broken = true; return nm + '打壞了，拋不了'; }
    var h = hawseXZ(sh, a, sh.px, sh.pz, sh.yaw);
    a.A = h; a.st = 'drop'; a.t = SIMT + ANC_FALL;
    if (typeof splash === 'function') splash([h[0], seaH(h[0], h[1], SIMT), h[1]], false);
    return '拋' + nm;
  }
  if (a.st === 'drop' || a.st === 'down') { a.st = 'weigh'; a.t0 = SIMT; a.t = SIMT + ANC_WEIGH; return '起' + nm; }
  return '';
}
/** 起錨：還在水裡的（drop／down）都開始收；回傳收了哪幾個（給廣播）。 */
function anchorWeighAll(sh) {
  var A = sh.anc; if (!A) return '';
  return ['P', 'S'].filter(function (k) { return anchorToggle(sh, k, false); }).map(function (k) { return k === 'P' ? '左錨' : '右錨'; }).join('、');
}
function anchorAny(sh, st) { var A = sh.anc; return !!A && (A.P.st === st || A.S.st === st); }
/** 6（拋錨／起錨同一顆）按下去是起錨嗎：拋錨模式、或有錨在水裡（下沉中、咬著）。 */
function anchorWet(sh) { return (SAIL === 'off' && sh.i === PLAYER_I) || anchorAny(sh, 'drop') || anchorAny(sh, 'down'); }
/** 有錨咬著（down／weigh）⇒ 船不再靠帆走（target 0）。 */
function anchorHeld(sh) { return anchorAny(sh, 'down') || anchorAny(sh, 'weigh'); }
/** 每一步（sail() 走完位置之後）：沉到底、起完、打壞斷鍊；咬著的錨把錨鏈孔拉回鍊長以內、船身繞錨鏈孔轉。回傳有沒有拉緊。 */
function anchorStep(sh, dt, px0, pz0) {
  var A = sh.anc; if (!A) return false;
  var taut = false, drag = false, tot = sh.yawRate * dt, lim = Math.max(ANC_YAWMAX * dt, Math.abs(tot));   // tot：這一步航向總共變多少（sail() 照轉動慣性已經轉了 yawRate·dt）—— 上限算總的，⛔ 只限約束那一段 ⇒ 慣性再加一次，15 m/s 轉到 44°/s
  ['P', 'S'].forEach(function (k) {
    var a = A[k], nm = k === 'P' ? '左錨' : '右錨';
    if (a.st === 'up') return;
    if (!anchorAlive(sh, a)) { a.broken = true; a.st = 'up'; a.A = null; if (sh.i === PLAYER_I) note(sh, nm + '被打壞了，鍊子斷了'); return; }
    if (a.st === 'drop' && SIMT >= a.t) { a.st = 'down'; if (sh.i === PLAYER_I) note(sh, nm + '落底咬住了'); }
    if (a.st === 'weigh' && SIMT >= a.t) { a.st = 'up'; a.A = null; if (sh.i === PLAYER_I) note(sh, nm + '起好了'); return; }
    if (a.st !== 'down' && a.st !== 'weigh') return;
    var r = a.st === 'weigh' ? ANC_REACH * clamp((a.t - SIMT) / ANC_WEIGH, 0, 1) : ANC_REACH;   // 起錨：鍊子一路收短 ⇒ 船被拉向錨
    var H = hawseXZ(sh, a, sh.px, sh.pz, sh.yaw), dx = H[0] - a.A[0], dz = H[1] - a.A[1], d = Math.hypot(dx, dz);
    if (d <= r || d < 1e-6) return;
    taut = true;
    var Hn = [a.A[0] + dx / d * r, a.A[1] + dz / d * r];                // 錨鏈孔拉回圓周上
    var lx = S * (a.hx - sh.T.cx), lz = S * (a.hy - sh.T.cy), L = Math.hypot(lx, lz);
    var thW = Math.atan2(H[1] - sh.pz, H[0] - sh.px);                   // 船心 → 錨鏈孔 的方向：現在；turn(P) ＝ 錨鏈孔拉到 P 的話這個方向轉多少
    function turn(P) { var t = Math.atan2(P[1] - sh.pz, P[0] - sh.px) - thW; return Math.atan2(Math.sin(t), Math.cos(t)); }
    var dA = turn(Hn);
    if (Math.abs(tot - dA) > lim) {                                     // 拉得太猛（高速、或下沉那幾秒已經跑出鍊長）⇒ 錨在海底被拖著走：船只轉到上限，剩下那一段由錨過來補
      var lo = 0, hi = 1;                                               //   ⛔ 以前整段一步拉回 ⇒ 9 m/s 拋單錨，落底那一步航向跳 271°（Tim 2026-10-15「高船速時會發生很誇張的旋轉」）
      for (var it = 0; it < 12; it++) { var mid = (lo + hi) / 2; if (Math.abs(tot - turn([H[0] + (Hn[0] - H[0]) * mid, H[1] + (Hn[1] - H[1]) * mid])) <= lim) lo = mid; else hi = mid; }
      Hn = [H[0] + (Hn[0] - H[0]) * lo, H[1] + (Hn[1] - H[1]) * lo]; dA = turn(Hn);
      var ex = Hn[0] - a.A[0], ez = Hn[1] - a.A[1], el = Math.hypot(ex, ez);
      a.A = [Hn[0] - ex / el * r, Hn[1] - ez / el * r]; a.slip = (a.slip || 0) + el - r; drag = true;   // 錨沿著鍊子的方向被拖過來，錨鏈孔剛好在鍊長上
    }
    var thN = thW + dA;
    sh.yaw -= dA;                                                      // 世界的角度 ＝ 船身座標的角度 − yaw ⇒ 方向轉了 dA ＝ yaw 少 dA
    sh.px = Hn[0] - L * Math.cos(thN); sh.pz = Hn[1] - L * Math.sin(thN);   // 船心沿著那條線、離錨鏈孔還是原本的距離（剛體）
    tot -= dA;
  });
  if (taut) {                                                           // 動量留著、只被鍊子拖慢（⛔ 用船心被拉回後的位移重算速度 ⇒ 錨在正後方時速度一步歸零，船停死、一度都不轉）
    sh.yawRate = clamp(tot / dt, -ANC_YAWMAX, ANC_YAWMAX);              //   轉動慣性 ＝ 這一步實際轉的（夾在上限內）
    sh.spd *= Math.max(0, 1 - dt / (drag ? ANC_DRAGX : ANC_DRAG));     //   ⇒ 下一步照舊往前走，約束再把那一段位移轉成旋轉：偏得越多轉得越快 ＝ 船尾甩出去；錨被拖著 ⇒ 掉得快
    sh.vel = mul(fwd(sh.yaw), sh.spd);
  }
  return taut;
}
/** 下方 6／7／8 的大圓鈕：咬著或下沉中 ⇒ 亮（on）、打壞 ⇒ 灰掉（dis，按了只會說拋不了）。每次 HUD 更新看一次（收著時被打掉也要灰）。
 *  6 ＝ 拋錨／起錨同一顆：有錨在水裡 ⇒ 亮、寫「起錨」；正在收 ⇒「起錨中」。 */
function anchorChips(me) {
  if (!me) return;
  var A = anchorsOf(me), w = anchorWet(me), b6 = $('ancAll');
  if (b6) { b6.classList.toggle('on', w); var l6 = w ? '起錨' : anchorAny(me, 'weigh') ? '起錨中' : '拋錨', s6 = b6.querySelector('i'); if (s6 && s6.textContent !== l6) s6.textContent = l6; }
  ['P', 'S'].forEach(function (k) {
    var a = A[k], el = $('anc' + k); if (!el) return;
    if (!a.broken && a.st === 'up' && !anchorAlive(me, a)) a.broken = true;
    el.classList.toggle('on', a.st === 'drop' || a.st === 'down'); el.classList.toggle('dis', a.broken);
    var lb = a.broken ? '錨壞了' : a.st === 'drop' || a.st === 'down' ? '起' + (k === 'P' ? '左錨' : '右錨') : a.st === 'weigh' ? '起錨中' : (k === 'P' ? '左錨' : '右錨');   // 在水裡 ⇒ 按了是起錨
    var sp = el.querySelector('i'); if (sp && sp.textContent !== lb) sp.textContent = lb;
  });
}
/** 鐵鍊（畫用，每一格畫面重做；物理與碰撞在 TASK-0601 下一段）：錨鏈孔 → 錨（海底，水線下 ANC_DEPTH）的一條二次曲線，船身格座標（跟繩同一套 uModel）。
 *  鬆 ⇒ 從錨鏈孔幾乎直直垂到海底、再沿海底拉到錨；拉緊（水平距離接近 ANC_REACH）⇒ 繃成直線。下沉中 ⇒ 錨往下的深度照時間；起錨中 ⇒ 鍊子跟著收短。
 *  一節深一節淺交錯 ⇒ 看起來是一節一節的鏈環。 */
var CHAIN_N = 48, CHAIN_C = [[0.2, 0.2, 0.22], [0.38, 0.37, 0.36]];
function chainBuf(sh) {
  var A = sh.anc, L = [];
  if (A) ['P', 'S'].forEach(function (k) {
    var a = A[k]; if (!a.A || a.st === 'up') return;
    var dep = a.st === 'drop' ? ANC_DEPTH * clamp(1 - (a.t - SIMT) / ANC_FALL, 0.05, 1) : ANC_DEPTH, ax = a.A[0], az = a.A[1];
    if (a.st === 'weigh') { var f = clamp((a.t - SIMT) / ANC_WEIGH, 0, 1), H = hawseXZ(sh, a, sh.px, sh.pz, sh.yaw); ax = H[0] + (ax - H[0]) * f; az = H[1] + (az - H[1]) * f; dep *= Math.max(f, 0.05); }   // 起錨：錨被拉近、拉上來
    var e = toLocal(sh, [ax, seaH(ax, az, SIMT) - dep, az]), h = [a.hx, a.hy, a.hz];
    var dx = e[0] - h[0], dy = e[1] - h[1], tt = clamp(Math.hypot(dx, dy) * S / ANC_REACH, 0, 1), w = tt * tt;
    var c = [h[0] + dx * (0.08 + 0.42 * w), h[1] + dy * (0.08 + 0.42 * w), e[2] + (h[2] - e[2]) * 0.5 * w];   // 控制點：鬆 ⇒ 錨鏈孔正下方的海底附近；拉緊 ⇒ 中點
    var p0 = h;
    for (var i = 1; i <= CHAIN_N; i++) {
      var t = i / CHAIN_N, u = 1 - t, p = [u * u * h[0] + 2 * u * t * c[0] + t * t * e[0], u * u * h[1] + 2 * u * t * c[1] + t * t * e[1], u * u * h[2] + 2 * u * t * c[2] + t * t * e[2]], col = CHAIN_C[i & 1];
      L.push(p0[0], p0[1], p0[2], col[0], col[1], col[2], p[0], p[1], p[2], col[0], col[1], col[2]); p0 = p;
    }
  });
  sh.chain = upload(sh.chain, new Float32Array(L), 6, [[0, 3, 0], [2, 3, 3]]);
}
/** HUD 一段：兩個錨的狀態。 */
function anchorText(sh) {
  var A = sh.anc; if (!A) return '';
  var w = { up: '', drop: '下沉中', down: '咬住', weigh: '起錨中' };
  return ['P', 'S'].map(function (k) { var a = A[k]; return a.broken ? (k === 'P' ? '左錨×' : '右錨×') : w[a.st] ? (k === 'P' ? '左錨' : '右錨') + w[a.st] : ''; }).filter(Boolean).join('　');
}

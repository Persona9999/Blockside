// ───────────────────────── 輸入 ─────────────────────────
var drag = null, PTRS = new Map(), PINCH = null;          // PTRS：按著的指頭（觸控）；兩指（PINCH）⇒ 張合 ＝ 縮放、一起拖 ＝ 平移（同右鍵拖曳；Tim 2026-10-13），不轉鏡頭也不瞄準
function pinchD() { var a = Array.from(PTRS.values()); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1; }
function pinchM() { var a = Array.from(PTRS.values()); return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }
/** 平移（右鍵拖曳、兩指拖曳）：鏡頭照原本的（Tim 2026-10-14：⛔ 以前一拖就換成自由鏡頭）。dx／dy ＝ 螢幕像素。
 *  自由鏡頭 ⇒ 移注視點；跟船的鏡頭 ⇒ 移 CAM.pan（相對那艘船的方向，03_camera.js camPan）。追砲彈正在追 ⇒ 不動。 */
function panBy(dx, dy) {
  var fw = norm([CAM.look[0] - CAM.eye[0], 0, CAM.look[2] - CAM.eye[2]]), rt = [-fw[2], 0, fw[0]], k = CAM.dist * 0.0018, d = add(mul(rt, -dx * k), mul(fw, dy * k));
  if (CAM.mode === 0) { CAM.tgt = add(CAM.tgt, d); return; }
  if (CAM.mode === 1 && CAM.follow) return;
  var sh = camShip(); if (!sh) return;
  var F = fwd(sh.yaw); CAM.pan[0] += d[0] * F[0] + d[2] * F[2]; CAM.pan[1] += -d[0] * F[2] + d[2] * F[0];
}
cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
document.addEventListener('contextmenu', function (e) { if (!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) e.preventDefault(); });   // 面板、按鈕、說明上長按也不跳選單（輸入框照常）
cv.addEventListener('pointerdown', function (e) {
  cv.setPointerCapture(e.pointerId); PTRS.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (PTRS.size === 2) { var m0 = pinchM(); PINCH = { d: pinchD(), dist: CAM.dist, x0: m0.x, y0: m0.y, mx: m0.x, my: m0.y, moved: false }; drag = null; return; }
  if (PTRS.size > 2) return;
  drag = { x: e.clientX, y: e.clientY, b: e.button, moved: false };
});
cv.addEventListener('pointermove', function (e) {
  if (PTRS.has(e.pointerId)) PTRS.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (PINCH && PTRS.size === 2) {
    if (FP.on) return;                                                 // 第一人稱：兩指不縮放、不平移
    CAM.dist = clamp(PINCH.dist * PINCH.d / pinchD(), 12, 900);
    var m = pinchM();                                                  // 兩指中點移了 8 px 以上才開始平移（⛔ 不設門檻 ⇒ 只是張合時手指晃一下畫面也跟著跑）
    if (!PINCH.moved && Math.hypot(m.x - PINCH.x0, m.y - PINCH.y0) < 8) return;
    PINCH.moved = true; panBy(m.x - PINCH.mx, m.y - PINCH.my); PINCH.mx = m.x; PINCH.my = m.y;
    return;
  }
  if (!drag) return;
  var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;
  drag.moved = true; drag.x = e.clientX; drag.y = e.clientY;
  if (FP.on) { fpLook(dx, dy); return; }                             // 第一人稱：拖曳 ＝ 轉頭（81_fps.js）
  if (drag.b === 2) panBy(dx, dy);
  else { if (CAM.mode === 1) CAM.mode = 0; if (CAM.mode === 4) CAM.aoff += dx * 0.006; else CAM.yaw += dx * 0.006; CAM.pitch = clamp(CAM.pitch + dy * 0.005, 0.02, 1.45); }
});
function ptrEnd(e) { PTRS.delete(e.pointerId); if (PTRS.size < 2) PINCH = null; }
cv.addEventListener('pointerup', function (e) {
  if (drag && !drag.moved && drag.b === 0 && RUNNING && !PINCH && !FP.on) pick(e.clientX, e.clientY);   // 第一人稱：點一下不瞄準
  drag = null; ptrEnd(e);
});
cv.addEventListener('pointercancel', function (e) { drag = null; ptrEnd(e); });
cv.addEventListener('wheel', function (e) { e.preventDefault(); if (FP.on) return; CAM.dist = clamp(CAM.dist * Math.pow(1.0015, e.deltaY), 12, 900); }, { passive: false });
function pick(cx, cy) {
  var r = cv.getBoundingClientRect(), nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2;
  var a = M4.pt(CAM.inv, nx, ny, -1), bq = CAM.inv, w0 = bq[3] * nx + bq[7] * ny + bq[11] * -1 + bq[15], w1 = bq[3] * nx + bq[7] * ny + bq[11] + bq[15];
  var p0 = mul(M4.pt(CAM.inv, nx, ny, -1), 1 / w0), p1 = mul(M4.pt(CAM.inv, nx, ny, 1), 1 / w1), d = norm(sub(p1, p0));
  var me = SHIPS[PLAYER_I], hit = null, on = null;                   // 除了自己，每艘還浮著的船都射一次（友艦也瞄得到），取最近的那一個（t：沿射線多遠；每艘的公尺／格一樣）
  SHIPS.forEach(function (o) {
    if (o === me || o.sunk) return;
    var oL = toLocal(o, p0), dL = M4.dir(o.inv, d[0], d[1], d[2]), h = VK.raycast(o.grid, oL, dL, 3000);
    if (o.arm) { var ha = armRay(o, oL, dL, 3000); if (ha && (!h || ha.t < h.t)) h = ha; }   // 砲帶的裝甲（24_armor.js）也點得到（換回船的格座標）
    var hs = sailRay(o, oL, dL, h ? h.t : 3000); if (hs) h = hs;         // 帆布也點得到（比船身近才算）
    if (h && (!hit || h.t < hit.t)) { hit = h; on = o; }
  });
  // Tim 2026-10-14：「點海會取消瞄準；點在船身上（也可以瞄友軍，可以變色）就變成那一邊的砲手控」
  //   點到船 ⇒ 瞄準點設在那艘（敵艦 ⇒ 也是我的目標，52_fleet.js pickFoes；友艦 ⇒ 圈變藍、打下去照樣是誤擊）；瞄準模式回到自由。
  //   自動開砲開著 ⇒ 對得到它的那一舷交給玩家（me.hand；空白鍵齊射），另一舷照樣自動（50_sim.js aiSecond）。
  //   點到海 ⇒ 取消瞄準（手動 ⇒ 回到預設的瞄法；自動開砲 ⇒ 回到全自動）。
  if (hit) {
    setAim(me, [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5], on); me.pMode = AIM_P = 'free'; sfx('crack', null, 0.08);
    if (!isFoe(me, on)) note(me, '瞄準友艦 ' + on.name + teamTag(on) + ' —— 打下去一樣會傷到它');
    else if (hit.sail) note(me, '瞄準 ' + on.name + ' 的帆');
    if (AUTOFIRE && !me.hand) { me.hand = true; note(me, '手動瞄準：這一舷你來打（' + keyWord('volley') + '齊射），另一舷照樣自動 —— 點海面回到全自動'); }
  } else if (me.aim) {
    setAim(me, null);
    if (AUTOFIRE && me.hand) { me.hand = false; note(me, '取消瞄準 —— 回到全自動開砲'); } else note(me, '取消瞄準');
  }
}
/** 帆布也點得到（Tim 2026-10-17：「手動瞄準也能瞄準帆布」）：照畫出來的那一面（11_rig_gpu.js sailBuf 同一個判斷）每個三角形量一次射線（兩面都算），取 tMax 以內最近的。
 *  回傳跟 VK.raycast 一樣：x,y,z ＝ 落點 −0.5（pick 會加回去 ⇒ 瞄準點就在布上那一點）、t 以 dL 的長度為單位。
 *  收起來的帆（s.furled，留著的那一捲也是）、掉了的不算 —— 砲彈也打不到它們。只在點的那一下算，不碰戰局。 */
var SAIL_PICK = null;
function sailRay(o, oL, dL, tMax) {
  var bt = tMax, best = null;
  (o.cl || []).forEach(function (c, k) {
    var s = o.sails[k], P; if (!s || s.dead || s.furled) return;
    if (PHYS) {
      if (!c.p || c.hidden || c.gone) return;
      if (!SAIL_PICK || SAIL_PICK.length < c.T.n * 3) SAIL_PICK = new Float32Array(c.T.n * 3);
      P = clothFine(c, SAIL_PICK); if (c.furlF !== null && c.furlF !== undefined) P = furlDraw(c, P, c.furlF, o);   // 張帆收帆演到一半：照畫出來的位置
    } else P = c.T.p0;
    var tr = c.T.tris, tv = c.torn ? c.tv : null;                        // tv：撕開的洞（不畫的細格點）
    for (var j = 0; j < tr.length; j += 3) {
      if (tv && (tv[tr[j]] || tv[tr[j + 1]] || tv[tr[j + 2]])) continue;
      var a = tr[j] * 3, b = tr[j + 1] * 3, e = tr[j + 2] * 3;           // Möller–Trumbore
      var ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[e] - P[a], vy = P[e + 1] - P[a + 1], vz = P[e + 2] - P[a + 2];
      var px = dL[1] * vz - dL[2] * vy, py = dL[2] * vx - dL[0] * vz, pz = dL[0] * vy - dL[1] * vx, det = ux * px + uy * py + uz * pz;
      if (Math.abs(det) < 1e-12) continue;
      var f = 1 / det, sx = oL[0] - P[a], sy = oL[1] - P[a + 1], sz = oL[2] - P[a + 2], u = (sx * px + sy * py + sz * pz) * f;
      if (u < 0 || u > 1) continue;
      var qx = sy * uz - sz * uy, qy = sz * ux - sx * uz, qz = sx * uy - sy * ux, v = (dL[0] * qx + dL[1] * qy + dL[2] * qz) * f;
      if (v < 0 || u + v > 1) continue;
      var t = (vx * qx + vy * qy + vz * qz) * f;
      if (t > 0 && t < bt) { bt = t; best = s; }
    }
  });
  return best ? { x: oL[0] + dL[0] * bt - 0.5, y: oL[1] + dL[1] * bt - 0.5, z: oL[2] + dL[2] * bt - 0.5, t: bt, sail: best } : null;
}
window.addEventListener('keydown', function (e) {
  if (!RUNNING) return;
  var k = e.key.toLowerCase(); if (e.code === 'Space') k = ' ';
  if (k === 'escape') { e.preventDefault(); if (FP.on && fpEscEaten()) return; if (HELP.open) helpClose(); else if (FLX) floodClose(); else if (FLX3) xrayToggle(); else gsetToggle(); return; }   // 遊戲內的設定面板
  if (FP.on && fpKey(k, true)) { e.preventDefault(); return; }       // 第一人稱：走、轉頭、爬梯子的鍵（81_fps.js）；P 停格、O 設定照舊
  if (bldKey(k, true)) { e.preventDefault(); return; }               // 建造（82_build.js）：快捷欄、轉、拆、放、目錄、碰撞（鍵照 66_keys.js）
  var ba = keyAct('battle', k);                                       // 海戰的動作（66_keys.js 鍵位）
  if (!modeRule('battleKeys') && ba !== 'pause' && ba !== 'settings' && ba !== 'cam') return;   // 玩法規則 battleKeys（04_modes.js；建造）：開砲、轉舵那些鍵不作用
  if (ba) e.preventDefault();
  kbLit(k, true);
  doKey(k, e.repeat);
});
/** 鍵盤按著的時候，畫面上對應的按鈕也亮成按下的顏色（Tim 2026-10-14；跟手指按住同一個 .down）；方向鍵照 A／D／W／S 的按鈕。 */
function kbLit(k, on) { var a = keyAct('battle', k); if (!a) return; [].forEach.call(document.querySelectorAll('.kb[data-act]'), function (b) { if (b.dataset.act === a) b.classList.toggle('down', on); }); }   // 方向鍵照它對應的動作（66_keys.js KEY_FIX）
/** 一個鍵（鍵盤）⇒ 海戰的動作（66_keys.js keyAct：照現在的鍵位；方向鍵固定 ＝ 打舵、帆）。 */
function doKey(k, repeat) { var a = keyAct('battle', k); if (a) doAct(a, repeat); }
/** 一個動作（鍵盤與畫面上的圓鈕共用 ⇒ 手機也能玩；動作表在 66_keys.js KEY_ACTS）。打舵、帆是「按住」：這裡只按下，放開走 actUp。 */
function doAct(a, repeat) {
  if (!RUNNING) return;
  var me = SHIPS[PLAYER_I];
  if (a === 'volley') { if (!PAUSED && !me.sunk) broadside(me, AMMO_I); }   // 降旗了 ⇒ broadside／fireOne 自己擋
  else if (a === 'fire1') { if (!PAUSED) fireOne(me, AMMO_I); }
  else if (a === 'ammo') ammoNext();                                     // 彈種：一個鍵輪流（61_hud.js ammoNext）
  else if (a === 'aim') { me.pMode = AIM_P = AIM_CYCLE[(AIM_CYCLE.indexOf(me.pMode || 'free') + 1) % AIM_CYCLE.length]; note(me, '瞄準：' + AIM_NAME[me.pMode] + (me.pMode === 'free' ? '（點敵艦設瞄準點）' : '')); }   // 瞄準模式（51_captain.js）
  else if (a === 'cam') { CAM.mode = CAM_ORDER[(CAM_ORDER.indexOf(CAM.mode) + 1) % CAM_ORDER.length]; CAM.follow = null; CAM.pan = [0, 0]; CAM.see = null; if (CAM.mode === 2 || CAM.mode === 3) { CAM.dist = 75; } else if (CAM.mode === 0) CAM.dist = DIST + 40; else if (CAM.mode === 4) { CAM.dist = 78; CAM.aoff = 0.35; } }
  else if (a === 'pause') { PAUSED = !PAUSED; frzShow(); pauseLabel(); }                               // 停格（72_floodui.js：停格時上方一條、進水細節頁）
  else if (a === 'flood') { if (PAUSED) floodToggle(); }                 // 停格時：進水圖表／透視（72_floodui.js）
  else if (a === 'xray') xrayToggle();                                   // 觀察模式：透視（72_floodui.js）、剖面、隱藏甲板（74_cutaway.js）—— 不停格也能切換（Tim 2026-10-16）
  else if (a === 'cut') cutToggle();
  else if (a === 'deck') deckCycle();
  else if (a === 'mute') { muted = !muted; sndApply(); gsetShow(); }
  else if (a === 'help') helpToggle();
  else if (a === 'menu') { gsetClose(); helpClose(); RUNNING = false; END_AT = 0; END_WAIT = null; $('cover').style.display = ''; $('end').className = ''; }
  else if (a === 'sailMode') sailToggle();   // 一顆切換 自動 ⇄ 手動（Tim 2026-10-15：「改成單鍵」；手動也可以直接打舵）；錨在水裡 ⇒ 先起錨（左右錨拋的也一起）
  else if ((a === 'ancAll' || a === 'ancP' || a === 'ancS') && me && !me.sunk && anchorsOf(me).noAnchor) setSailMode(SAIL === 'off' ? 'manual' : 'off');   // 整艘沒有錨（TASK-0635）：三個錨鍵都是停船 ⇄ 手動
  else if (a === 'ancAll' && me && !me.sunk) {                              // 拋錨／起錨同一顆（Tim 2026-10-15；76_anchor.js anchor6）：兩邊都沒拋 ⇒ 雙錨（拋錨模式、只有我艦）；一邊在水裡 ⇒ 拋另一邊；兩邊都在水裡 ⇒ 起錨
    var a6 = anchor6(me);
    if (a6.act === 'both') setSailMode('off');
    else if (a6.act === 'other') { var am = anchorToggle(me, a6.k, true); if (am) note(me, am + '（兩邊都拋了，再按一次起錨）'); }
    else { if (SAIL === 'off') setSailMode('manual'); var nw = anchorWeighAll(me); note(me, nw ? '起錨（' + nw + '）—— 8 秒收好' : '錨都收著'); }   // 拋錨模式 ⇒ 換手動、我艦的雙錨跟著收
  }
  else if ((a === 'ancP' || a === 'ancS') && RUNNING && me && !me.sunk && !anchorsOf(me).single) { var am = anchorToggle(me, a === 'ancP' ? 'P' : 'S'); if (am) note(me, am + (/^拋/.test(am) ? '（帶著速度只拋一側 ⇒ 繞錨急轉；再按一次起錨）' : '')); }   // 左右錨（76_anchor.js）   // 航行（TASK-0567，Tim 2026-10-14：不用 Tab 循環，三個鍵直接切）
  else if (a === 'settings') gsetToggle();                                    // 設定（Esc 也可以）
  else if (a === 'ruddL' || a === 'ruddR') {   // 打舵：自動中一碰就換手動
    if (SAIL === 'auto') setSailMode('manual'); KEYS[a === 'ruddL' ? 'l' : 'r'] = true;   // 拋錨中 ⇒ 不換模式、繞錨原地轉
  }
  else if ((a === 'teleFwd' || a === 'teleBack') && RUNNING && me && !me.sunk) teleStep(me, a === 'teleFwd' ? -1 : 1);   // 俥鐘（31_drive.js；Tim：「也要支援快捷鍵操作」）：往前撥、往後撥；沒有額外動力的船不動
  else if (a === 'camTrack') setCamTrack(!CAM.track);
  else if (a === 'autoFire') setAutoFire(!AUTOFIRE);
  else if (a === 'phys') setPhys(!PHYS);
  else if (a === 'restart') { gsetClose(); helpClose(); start(); }                                        // 重新開始：同樣的模式、距離、滑桿，不用打完
  else if (a === 'sailUp' || a === 'sailDn') {     // 帆裝
    if (!repeat) { var sd = a === 'sailUp' ? 1 : -1; sailStep(me, sd); KEYS.sw = { d: sd, n: SIMT + SAIL_HOLD }; }   // 按住 ⇒ 1 秒後逐級再切（31_sailing.js sailHold）   // 有額外動力的船：滿帆再加 ⇒ 全速前進、全收再收 ⇒ 倒車（31_sailing.js）
  }
}
function keyUp(k) { var a = keyAct('battle', k); if (a) actUp(a); }
function actUp(a) { if (a === 'ruddL') KEYS.l = false; if (a === 'ruddR') KEYS.r = false; if (KEYS.sw && (a === 'sailUp' ? 1 : a === 'sailDn' ? -1 : 0) === KEYS.sw.d) KEYS.sw = null; }
window.addEventListener('keyup', function (e) { var k = e.key.toLowerCase(); if (e.code === 'Space') k = ' '; if (fpKey(k, false)) { e.preventDefault(); return; } if (bldKey(k, false)) return; kbLit(k, false); keyUp(k); });   // fpKey：第一人稱的鍵放開（沒開 ⇒ 只清掉自己按著的、照舊往下走）
window.addEventListener('blur', function () { KEYS.l = KEYS.r = false; KEYS.sw = null; [].forEach.call(document.querySelectorAll('.kb.down'), function (b) { b.classList.remove('down'); }); });   // 切走視窗 ⇒ 收不到 keyup，按下的顏色一起清掉
// iPhone 連點兩下放大（Tim 2026-10-15：「連點角落兩下還是會放大，按控帆按鈕太快就觸發」—— 根上的 touch-action:manipulation iOS 不一定照做）：
// 兩次手指放開相隔 < 350 ms ⇒ 取消第二次的預設動作（＝雙擊縮放）。取消之後瀏覽器不會補 click ⇒ 一般按鈕自己補一個；
// 按住型（data-hold：舵、帆）走 pointer 事件不受影響；輸入框照舊（要能點兩下選字）；遊戲畫面本來就是 touch-action:none（自己處理手勢、不補 click）。
var TAP_T = -1e9;
document.addEventListener('touchend', function (e) {
  var now = e.timeStamp, dbl = now - TAP_T < 350, t = e.target; TAP_T = now;
  if (!dbl || e.touches.length || !t || !t.closest || t === cv || t.closest('input, select, textarea')) return;
  e.preventDefault();
  if (!t.closest('[data-hold]')) { var c = e.changedTouches[0]; t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: c ? c.clientX : 0, clientY: c ? c.clientY : 0 })); }
}, { passive: false });
// 畫面上的圓鈕（下方控制列 .kb、說明裡的 kbd[data-act]）：點 ＝ 做那個海戰動作（鍵照 66_keys.js keyPaint 寫上去）；data-hold 的（打舵、帆）按住才算
[].forEach.call(document.querySelectorAll('[data-act]'), function (b) {
  var k = b.dataset.act;
  if (b.dataset.hold) {
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); b.classList.add('down'); doAct(k, false); try { b.setPointerCapture(e.pointerId); } catch (x) { } });   // 手指滑出按鈕也算按著，放開才鬆舵
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { b.addEventListener(ev, function () { b.classList.remove('down'); actUp(k); }); });
  } else b.addEventListener('click', function (e) { e.preventDefault(); doAct(k, false); });
});
/** 航行模式（選單與遊戲中同一個）：auto 兩艘自動、manual 我艦手動、off 我艦拋雙錨（只管我艦；31_sailing.js sail）（76_anchor.js；Tim 2026-10-15：停船改叫拋錨）。 */
var SAIL_NAMES = { auto: '自動航行', manual: '手動操舵（{AD} 打舵）', off: '拋錨（雙錨；{AD} 繞錨轉）' };   // {AD}：左右舵的鍵（66_keys.js）
function setSailMode(m) {
  SAIL = m; KEYS.l = KEYS.r = false;
  if (m === 'auto' && SHIPS[PLAYER_I]) SHIPS[PLAYER_I].sailHand = SHIPS[PLAYER_I].teleHand = false;   // 切回自動駕駛 ⇒ 帆、俥鐘也交回艦長（54_helm.js）
  [].forEach.call(document.querySelectorAll('[data-s]'), function (x) { x.classList.toggle('on', x.dataset.s === SAIL); }); sailLabel();
  var noA = RUNNING && SHIPS.length && anchorsOf(SHIPS[PLAYER_I]).noAnchor;
  if (RUNNING && SHIPS.length) note(SHIPS[PLAYER_I], ((m === 'off' && noA ? '停船（這艘沒有錨：帆與引擎不出力、船慢慢停下）' : m === 'off' && anchorsOf(SHIPS[PLAYER_I]).single ? '拋錨（單錨；{AD} 繞錨轉）' : SAIL_NAMES[m]) + (noA ? '（' + keyName('sailMode') + ' 自動／手動切換、' + keyName('ancAll') + ' 停船、再按一次開船）' : '（' + keyName('sailMode') + ' 自動／手動切換、' + keyName('ancAll') + ' 拋錨、再按一次起錨）')).replace(/\{AD\}/g, keyName('ruddL') + '／' + keyName('ruddR')));   // 單錨的船（TASK-0635）
}
/** 自由鏡頭跟不跟著兩艘的中點走（預設跟；鏡頭「看敵艦／看我艦」本來就跟著那一艘）。 */
function setCamTrack(on) {
  CAM.track = on; CAM.trMe = CAM.trYaw = null;
  $('camT').classList.toggle('on', on);
  if (RUNNING && SHIPS.length) note(SHIPS[PLAYER_I], on ? '鏡頭跟著船' : '鏡頭固定（' + keyName('camTrack') + ' 切換）');
}
/** 自動開砲（我艦）：觀戰預設開、其他模式預設關（reset 時照模式設）。 */
function setAutoFire(on) {
  AUTOFIRE = on; $('autoF').classList.toggle('on', on); if (SHIPS[PLAYER_I]) SHIPS[PLAYER_I].hand = false;   // 切換 ⇒ 手動瞄準那一舷也收掉
  if (RUNNING && SHIPS.length) note(SHIPS[PLAYER_I], on ? '自動開砲' : '自己開砲（點敵艦瞄準、' + keyWord('volley') + '齊射）');
}
function sailToggle() { if (RUNNING && SHIPS[PLAYER_I] && SHIPS[PLAYER_I].anc) anchorWeighAll(SHIPS[PLAYER_I]); setSailMode(SAIL === 'auto' ? 'manual' : 'auto'); }   // ☸ 一顆切換（Tim 2026-10-15）：自動 ⇄ 手動；拋錨中 ⇒ 起錨、換自動
$('sailT').onclick = sailToggle;   // 鍵盤（66_keys.js sailMode）同一顆。自動開砲、拋錨是下方的大圓鈕（data-act）
/** 🤖☸ 自動操舵那一顆（Tim 2026-10-15：「開啟時常亮（參考自動開砲），不換 Icon」）：圖示固定，自動 ⇒ 亮（on）；手動、拋錨模式 ⇒ 暗。 */
function sailLabel() { var b = $('sailT'); if (b) b.classList.toggle('on', SAIL === 'auto'); }
$('camT').onclick = function () { setCamTrack(!CAM.track); };
$('physT').onclick = function () { setPhys(!PHYS); };
$('restartB').onclick = function () { if (RUNNING) { gsetClose(); helpClose(); start(); } };
$('boomB').onclick = function () { if (selfDestruct()) { gsetClose(); helpClose(); PAUSED = false; } };   // 自爆：關掉設定、解除停格，看煙花（23_powder.js）
// 遊戲內的設定面板（⚙ 設定、Esc）：打開 ⇒ 暫停（關掉回到打開之前的暫停狀態）；畫質、物理效果的檔位跟主選單是同一份（07_gfx.js／09_phx.js）
var GSET = { open: false, paused: false };
function gsetOpen() { if (!RUNNING || GSET.open) return; helpClose(); GSET.open = true; GSET.paused = PAUSED; PAUSED = true; $('gset').classList.add('on'); $('gsetBg').classList.add('on'); gsetShow(); }
function gsetClose() { if (!GSET.open) return; GSET.open = false; PAUSED = GSET.paused; $('gset').classList.remove('on'); $('gsetBg').classList.remove('on'); }
function gsetToggle() { if (GSET.open) gsetClose(); else gsetOpen(); }
// 不給全螢幕時那一行（Tim 2026-10-17：iPhone 照臺北狂飆那樣「加入主畫面」就是全螢幕 ——「iphone支援的操作 不用另外做功能」「純文字也可以」）：
//   iPhone ⇒ 寫怎麼加入主畫面（iOS 自己會用網頁 App 開：沒有網址列與工具列）；別的（沒開全螢幕權限的 iframe…）照舊只說不給。
//   已經從主畫面開（iOS 的 navigator.standalone、manifest 的 display-mode）⇒ 本來就沒有網址列：按鈕亮著、不寫原因。
var FS_APP = navigator.standalone === true || !!(window.matchMedia && window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
var FS_WHY = FS_APP ? '' : /iPhone|iPod/.test(navigator.userAgent) ? '（iPhone 的 Safari 不給網頁全螢幕 ⇒ 點「分享」→「加入主畫面」，從主畫面的圖示開就沒有網址列；橫放手機）' : '（這裡不給全螢幕）';
function gsetShow() {
  var gl = gfxLevel(), xl = phxLevel();
  [].forEach.call(document.querySelectorAll('#gset [data-gg]'), function (b) { b.classList.toggle('on', b.dataset.gg === gl); });
  [].forEach.call(document.querySelectorAll('#gset [data-gx]'), function (b) { b.classList.toggle('on', b.dataset.gx === xl); });
  $('gsGfx').textContent = gl === 'custom' ? '（自訂）' : ''; $('gsPhx').textContent = xl === 'custom' ? '（自訂）' : '';
  $('muteT').classList.toggle('on', muted); $('fpsT').classList.toggle('on', GFX_FPS);
  $('slowT').classList.toggle('on', SLOW.on); $('slowCamT').classList.toggle('on', SLOW.cam); $('pslowT').classList.toggle('on', PSLOW.on); $('testT').classList.toggle('on', !!(TLOG && TLOG.off === undefined) || (!TLOG && tlgWanted())); $('testN').textContent = tlgNote();   // 測試模式（83_testlog.js） $('boomB').classList.toggle('dis', !canSelfDestruct());
  sndShow();                                                          // 音量滑桿（02_music.js）
  $('fullT').classList.toggle('on', fsOn() || FS_APP); $('fullT').classList.toggle('dis', !fsCan() && !FS_APP); $('gsFull').textContent = fsCan() ? '' : FS_WHY;
}
$('setB').onclick = gsetToggle;
// 說明（設定裡的「H 說明」、H、?）：打開 ⇒ 暫停（關掉回到打開之前的暫停狀態，跟設定一樣）；外面蓋一層 #helpBg，點外面、✕、H、Esc 都關（Tim 2026-10-13：手機上不好關說明）
var HELP = { open: false, paused: false };
function helpOpen() { if (!RUNNING || HELP.open) return; gsetClose(); HELP.open = true; HELP.paused = PAUSED; PAUSED = true; $('help').classList.add('on'); $('helpBg').classList.add('on'); }
function helpClose() { if (!HELP.open) return; HELP.open = false; PAUSED = HELP.paused; $('help').classList.remove('on'); $('helpBg').classList.remove('on'); }
function helpToggle() { if (HELP.open) helpClose(); else helpOpen(); }
$('helpBg').onclick = helpClose; $('helpX').onclick = helpClose; $('helpB').onclick = helpOpen;
$('gsetBg').onclick = gsetClose;                                    // 面板外點一下 ⇒ 關（不會順便瞄準、開砲：底下的東西被這一層蓋住）
$('gsGo').onclick = gsetClose;
$('menuB').onclick = function () { doAct('menu'); };
// Discord（主選單；Tim 2026-10-17）：新分頁開（從主畫面開的 ⇒ iOS 交給 Safari）。畫廊彈窗的 iframe 沒開 allow-popups ⇒ 開不了，照樣不擋遊戲。
var DISCORD_URL = 'https://discord.gg/XuHkBFN9r';
$('discordB').onclick = function () { window.open(DISCORD_URL, '_blank', 'noopener'); };
$('muteT').onclick = function () { muted = !muted; sndApply(); gsetShow(); };
$('fpsT').onclick = function () { GFX_FPS = !GFX_FPS; gfxShow(); };
// 全螢幕（設定面板的「F11 全螢幕」；Tim 2026-10-13：主要給手機用）：整頁（documentElement）進出全螢幕；畫布大小每一格照量（60_render.js resize）⇒ 不用另外處理。
//   畫廊彈窗的 iframe（sandbox＋allow="fullscreen"，ArtGallery/index.html）進得去（量過：fullscreenEnabled、點了 fs ＝ true、按鈕亮）。
//   不給全螢幕的地方（iPhone 的 Safari 只給影片、沒開 fullscreen 權限的 iframe）⇒ 按鈕變灰、寫原因。Esc 是瀏覽器自己退出全螢幕的鍵（頁面收不到那一下）。
//   「F11」只是提示電腦上按 F11 也能全螢幕（Tim：只是提示）—— 那是瀏覽器自己的全螢幕，頁面不攔（⛔ 攔了要猜瀏覽器的全螢幕開了沒：拿視窗跟螢幕比大小，縮放與無頭 Chrome 都會猜錯）。
//   不存檔：進全螢幕一定要使用者點一下才行，開局自動進不去。
function fsOn() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function fsCan() { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); }
function fsToggle() {
  if (!fsCan()) return;
  var d = document, e = d.documentElement;
  try {
    var r = fsOn() ? (d.exitFullscreen || d.webkitExitFullscreen).call(d) : (e.requestFullscreen || e.webkitRequestFullscreen).call(e, { navigationUI: 'hide' });
    if (r && r.catch) r.catch(function () { gsetShow(); });                          // 被拒（沒有點擊、權限）⇒ 按鈕照實際狀態
  } catch (err) { gsetShow(); }
}
$('fullT').onclick = fsToggle;
['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) { document.addEventListener(ev, gsetShow); });   // 進出（含 Esc 退出）⇒ 按鈕跟著亮滅
[].forEach.call(document.querySelectorAll('#gset [data-gg]'), function (b) { b.onclick = function () { gfxSet(b.dataset.gg); gfxShow(); }; });
[].forEach.call(document.querySelectorAll('#gset [data-gx]'), function (b) { b.onclick = function () { phxSet(b.dataset.gx); phxSync(); }; });
$('endA').onclick = start;
// 彈種一顆（#ammoB）：帶 data-k="1" ⇒ 點一下 ＝ 按 1（上面那段 [data-k] 的 click）⇒ ammoNext；⛔ 別再另外掛 onclick（會一次換兩種）
/** 主選單的玩法鈕：照玩法規則表（04_modes.js MODE_RULES）裡 menu 的那幾份生、照表的順序（TASK-0668：加一種玩法不用改這裡）。 */
function modeButtons() {
  $('modes').innerHTML = Object.keys(MODE_RULES).filter(function (m) { return MODE_RULES[m].menu; }).map(function (m) { return '<button data-m="' + m + '">' + MODE_RULES[m].name + '</button>'; }).join('');
  [].forEach.call(document.querySelectorAll('#modes button'), function (b) { b.onclick = function () { MODE = b.dataset.m; [].forEach.call(document.querySelectorAll('#modes button'), function (x) { x.className = x === b ? 'on' : ''; }); }; });
}
modeButtons();
/** 選單：滑桿的上下限從 LIM 來；數值只在使用者動了那一條時才從滑桿讀回（⛔ 一開頭就讀回 ⇒ 網址給的 0.33 被 step 吃成 0.35）。
 *  船殼、砲、帆、火藥桶、航行、降旗的滑桿在「細節設定」那一頁（從主選單進）；主選單只留一行摘要（#detV）。 */
/** 模型（砲、火藥桶）的總重（噸）：照匯出的模型清單＋取用點的 12 桶（細節設定的例子用；開戰時每艘照自己的模型算）。 */
function modelMassT(T, gunw) { if (!T) return 0; var t = 12 * KEG_T; (T.rig.models || []).forEach(function (m) { t += modelT({ kind: modelKind(m) }, gunw); }); return t; }
var CFG_ID = myHull();                             // 細節設定的「船隻設定」正在編輯哪一型
var SLIDERS_SHOW = null;                               // 載入完（HYD 算好）再顯示一次 ⇒ 減重上浮的例子有數字
function sliders() {
  var lf = $('ballast'), f = $('flood'), h = $('hard'), c = $('cas'), sp = $('speed'), ag = $('agile'), uw = $('upwind'), gh = $('gunhp'), gw = $('gunw'), sl = $('sailhp'), ph = $('powderhp'), bl = $('blast'), bv = $('blastv'), ch = $('crewhp'), cd = $('crewdeath');
  var bx = $('box'), cy = $('carry'), wk = $('wind'), wc = $('windcap'), dr = $('drown');
  var st = $('stall'), fs = $('funspeed'), fa = $('funagile'), fl = $('funstall'), fp = $('funpowder'), fh = $('funhard'), se = $('sea');   // 頂風失速、娛樂加成、浪
  [[se, 'sea'], [st, 'stall'], [fs, 'funspeed'], [fa, 'funagile'], [fl, 'funstall'], [fp, 'funpowder'], [fh, 'funhard']].forEach(function (e) { e[0].min = LIM[e[1]][0]; e[0].max = LIM[e[1]][1]; });
  dr.min = LIM.drown[0]; dr.max = LIM.drown[1];
  bx.min = LIM.box[0]; bx.max = LIM.box[1]; cy.min = LIM.carry[0]; cy.max = LIM.carry[1]; wk.min = LIM.wind[0]; wk.max = LIM.wind[1]; wc.min = LIM.windcap[0]; wc.max = LIM.windcap[1]; ['inertia', 'turninert', 'sailtq'].forEach(function (k) { $(k).min = LIM[k][0]; $(k).max = LIM[k][1]; });   // 動力的手感（31_drive.js）
  // 硬度跨 40 倍 ⇒ 對數刻度：滑桿 0..1 ↔ 硬度 LIM 下限 × (上限／下限)^v
  var hk = Math.log(LIM.hard[1] / LIM.hard[0]);
  lf.min = LIM.ballast[0]; lf.max = LIM.ballast[1]; gw.min = LIM.gunw[0]; gw.max = LIM.gunw[1];
  f.min = LIM.flood[0]; f.max = LIM.flood[1]; h.min = 0; h.max = 1; h.step = 0.005; c.min = LIM.cas[0] * 100; c.max = LIM.cas[1] * 100;
  sp.min = LIM.speed[0]; sp.max = LIM.speed[1]; ag.min = LIM.agile[0]; ag.max = LIM.agile[1]; uw.min = LIM.upwind[0]; uw.max = LIM.upwind[1]; var bs = $('base'); bs.min = LIM.base[0]; bs.max = LIM.base[1]; $('pump').min = LIM.pump[0]; $('pump').max = LIM.pump[1];
  gh.min = LIM.gunhp[0]; gh.max = LIM.gunhp[1]; sl.min = LIM.sailhp[0]; sl.max = LIM.sailhp[1]; ph.min = LIM.powderhp[0]; ph.max = LIM.powderhp[1];
  bl.min = LIM.blast[0]; bl.max = LIM.blast[1]; bv.min = LIM.blastv[0] * 100; bv.max = LIM.blastv[1] * 100; ch.min = LIM.crewhp[0]; ch.max = LIM.crewhp[1]; cd.min = LIM.crewdeath[0]; cd.max = LIM.crewdeath[1];
  function am(r, k) { return $('am-' + r + '-' + k); }
  function C() { return shipCfg(CFG_ID); }             // 正在編輯的那一型（船隻配置頁）
  // 船員（船隻配置頁；TASK-0570）：每一項一條滑桿；砲班照砲種各一條（這一型沒有的砲種藏起來）。改了寫進 SHIP_CREW（05_hull.js），存檔跟著存（69_prefs.js）
  var CR = {}, crBox = $('crewItems');
  CREW_ITEMS.concat([{ k: 'gh' }], Object.keys(GUNS).map(function (t) { return { k: 'g-' + t, gun: t, name: GUNS[t].name, lim: [GUNS[t].min, GUN_CREW_MAX] }; })).forEach(function (it) {
    var row = document.createElement('div');
    if (it.k === 'gh') { row.className = 'row note'; row.textContent = '砲班（每門砲幾個人）'; crBox.appendChild(row); return; }
    row.className = 'row slide';
    row.innerHTML = '<label for="cr-' + it.k + '">' + it.name + '</label><input type="range" id="cr-' + it.k + '" step="1" min="' + it.lim[0] + '" max="' + it.lim[1] + '"><span id="cr-' + it.k + 'V"></span>';
    crBox.appendChild(row);
    var el = row.querySelector('input');
    el.oninput = function () { var p = SHIP_CREW[CFG_ID] = SHIP_CREW[CFG_ID] || {}, v = Math.round(+el.value); if (it.gun) (p.guns = p.guns || {})[it.gun] = v; else p[it.k] = v; show(); };
    CR[it.k] = { it: it, el: el, row: row };
  });
  /** 這一型的砲（照砲種）、幾根桅、有沒有舵輪：船型載好才知道（沒載 ⇒ null）。 */
  function hullCounts(id) {
    var T = HULLT[id]; if (!T) return null;
    var g = {}, n = 0, wheel = false;
    (T.rig.models || []).forEach(function (m) { var k = modelKind(m); if (GUNS[k]) { g[k] = (g[k] || 0) + 1; n++; } if (k === 'wheel') wheel = true; });
    return { guns: g, n: n, masts: T.masts.length, wheel: wheel };
  }
  /** 全船人數（跟船員那一節的合計同一條算法）。 */
  function crewTotal(cw, hc) { var g = 0; Object.keys(GUNS).forEach(function (t) { g += gunCrew(cw, t) * (hc.guns[t] || 0); }); return g + Math.ceil(hc.n / 2) * cw.monkeys + cw.officers + (hc.wheel ? cw.helm : 0) + cw.marines + cw.top * hc.masts + cw.hands; }
  /** 船隻配置頁最上面（Tim 2026-10-14）：大圓鈕（61_hud.js badgeDraw）＋排水量、航速（順風／側順風／逆風，照這一型的航速與逆風性能、玩法的加成；標準風、滿帆）、砲、船員、靈活與硬度。 */
  function shipCardShow() {
    var T = HULLT[CFG_ID], h = hullInfo(CFG_ID), el = $('shipCardT'); badgeDraw($('shipCardC'), T);   // 不寫艦名：右邊那一欄第一行就是（Tim 2026-10-17）
    if (!T) { el.innerHTML = '<div class="h">' + (h ? h.name : CFG_ID) + '</div><div class="n">船型載入中…</div>'; return; }
    var c = shipCfg(CFG_ID), hc = hullCounts(CFG_ID), kn = VMAX * c.speed * playK('speed') * 1.9438, UP = c.upwind || 1, dz = 180 - NOGO_DEG, stall = 180 - (UP === 1 ? dz : 90 + (dz - 90) * UP);
    var gl = Object.keys(GUNS).filter(function (t) { return hc.guns[t]; }).map(function (t) { return (GUNS[t].short || GUNS[t].name).trim() + ' ' + hc.guns[t]; }).join('、');
    el.innerHTML = '<div class="h">' + h.name + '</div>' +
      (h.author ? '建造者 <b>' + h.author + '</b><br>' : '') +   // Tim 2026-10-15：船的作者（ships[].author ← 匯入時 .vxk 檔頭的 owner）
      '排水量 <b>' + Math.round(T.disp).toLocaleString() + '</b> 噸<span class="n">（設計水線）</span><br>' +
      '航速 順風 <b>' + Math.hypot(kn * polar(0), +c.base || 0).toFixed(1) + '</b>・側順風 <b>' + Math.hypot(kn, +c.base || 0).toFixed(1) + '</b>（最快）・逆風 <b>' + Math.hypot(kn * polar(dz), +c.base || 0).toFixed(1) + '</b> 節<br>' +
      (c.base ? '額外動力 <b>' + (+c.base).toFixed(1) + '</b> 節<span class="n">（推力跟帆相加 ⇒ 上面三格 ＝ √(帆² ＋ 額外動力²)：不看風向與帆，頂風、收帆也走得動；帆段滿帆再加 ＝ 全速前進（開）、全收再收 ＝ 倒車）</span><br>' : '') +
      '<span class="n">標準風、滿帆；逆風 ＝ 離風 ' + Math.round(stall) + '° 時（再頂就開始失速）' + (PLAY === 'fun' ? '；含娛樂玩法的加成' : '') + '</span><br>' +
      '砲 <b>' + hc.n + '</b> 門<span class="n">（' + gl + '）</span><br>' +
      '船員 約 <b>' + crewTotal(shipCrew(CFG_ID), hc) + '</b> 人<span class="n">（含預備水手 ' + shipCrew(CFG_ID).hands + '）</span><br>' +
      '靈活 <b>×' + (+c.agile).toFixed(2) + '</b>・船殼硬度 <b>×' + (+c.hard).toFixed(2) + '</b>・桅 <b>' + hc.masts + '</b> 根<br>' +
      '材質 ' + matSummary(T).map(function (m) { return '<b>' + m.name + '</b>' + (T.matIds.length > 1 ? ' ' + Math.round(m.voxels / T.base.count * 100) + '%' : '') + (m.hard !== 1 ? '（硬度 ×' + m.hard + '）' : ''); }).join('・') +
      '<span class="n">（格子 ' + Math.round(T.voxT0).toLocaleString() + ' 噸）</span>';   // TASK-0616：全船預設＋關聯 meta material（05_material.js）
  }
  function rankList(n) { var r = OFFICER_RANKS.slice(0, n); if (n > OFFICER_RANKS.length) r.push('見習軍官 ' + (n - OFFICER_RANKS.length)); return r.join('、'); }
  // 艙房（船隻配置頁；TASK-0568）：這一型標好的空艙房一間一列 —— 房間類型（放不下必要件的那個選項不能選、寫出原因）、擺了什麼、buff；
  //   「擺設…」打開那一間的俯視格子編輯器（#roomEd；0.5 m 一格）：挑物品、點格子擺（物品的中心在點的那一格）、轉 90°、拿掉、自動擺滿、清空。
  //   改了寫進 SHIP_ROOMS（36_rooms.js），存檔跟著存（69_prefs.js）。自動擺滿的那一間第一次被改 ⇒ 先把自動擺的那一份抄下來再改。
  //   甲板也是一間（Tim 2026-10-14）：每一層砲甲板一列，只擺火藥桶（取用點）；沒擺過 ＝ 自動（照舊的那幾處）。RE.d ＝ 編輯的是甲板。
  var RE = { i: -1, d: false, it: '', r: 0, del: false, hover: null, msg: '' }, ITEM_COL = { bed: '#d8cba4', table: '#9a7552', medkit: '#c04a40', keg: '#7a5230', pump: '#6f9fc4', spump: '#8a8f99' };
  function roomName(r) { return (r.deck ? r.deck.name + ' ' : '') + r.name.split('/').slice(-2).join(' ').replace('艙房-鏡像', '左').replace('艙房', '右'); }
  var ADM_SENT = {};                                                 // 後台模式：每一型上一次送回後台的預設（一樣就不送）
  function roomSet(name, v) { (SHIP_ROOMS[CFG_ID] = SHIP_ROOMS[CFG_ID] || {})[name] = v; if (ADMIN_ROOMS) ADM_SENT[CFG_ID] = ADM_SENT[CFG_ID] || ''; }
  /** 後台模式：使用者改過的那一型 ⇒ 把預設送回後台（後台照收、標成還沒存）。 */
  function roomsAdminPost() {
    if (!ADMIN_ROOMS || ADM_SENT[CFG_ID] === undefined || !HULLT[CFG_ID]) return;
    var o = roomsDefaultSnap(CFG_ID), s = JSON.stringify(o);
    if (s === ADM_SENT[CFG_ID]) return;
    var w = admWin(); if (!w) return;                             // 不是從設定後台開的 ⇒ 不送（ADM_SENT 不記，連上之前改的照樣算沒送過）
    ADM_SENT[CFG_ID] = s; try { w.postMessage({ kind: 'cb-rooms', id: CFG_ID, rooms: o }, location.origin); } catch (e) { /* 後台關了 */ }
  }
  function itemsText(items) { var n = {}; items.forEach(function (q) { n[q.it] = (n[q.it] || 0) + 1; }); return Object.keys(n).map(function (it) { return FURN[it].name + ' ' + n[it]; }).join('、'); }
  function furnNote(it) { var f = FURN[it], b = f.buff || {}; return f.role === 'powder' ? '一處三桶' : f.role === 'pump' ? '抽水 ' + f.tpm + ' 噸／分' + (f.power === 'steam' ? '、靠鍋爐' : '、' + (f.crew || 1) + ' 人搖') + (f.place === 'well' ? '、主桅旁中線' : '、中線') : f.hold ? '躺 ' + f.hold + ' 人' : Object.keys(b).map(function (k) { return (BUFF_NAMES[k] || k) + ' +' + Math.round(b[k] * 100) + '%'; }).join('、'); }
  function roomsPut() {
    var box = $('roomItems'), T = HULLT[CFG_ID], R = T ? hullRooms(T) : [], html = '';
    R.forEach(function (r, i) {
      var opts = '<option value="">空著</option>' + Object.keys(ROOM_FN).filter(function (k) { return !ROOM_FN[k].deck; }).map(function (k) {
        var a = roomAuto(T, r, k);
        return '<option value="' + k + '"' + (a.items ? '' : ' disabled') + '>' + ROOM_FN[k].name + (a.items ? '' : '（' + a.why + '）') + '</option>';
      }).join('');
      html += '<div class="rm"><label for="rm-' + i + '">' + roomName(r) + '</label><select id="rm-' + i + '" data-i="' + i + '">' + opts + '</select><button data-e="' + i + '">擺設…</button><span class="rs" id="rm-' + i + 'V"></span></div>';
    });
    box.innerHTML = html;
    var kit = T ? hullDeckKit(T) : { decks: [] };
    $('deckItems').innerHTML = kit.decks.map(function (D, i) { return '<div class="rm"><label>' + D.name + '</label><button data-d="' + i + '">擺設…</button><span class="rs" id="dk-' + i + 'V"></span></div>'; }).join('');
    [].forEach.call($('deckItems').querySelectorAll('button[data-d]'), function (b) { b.onclick = function () { var i = +b.dataset.d, same = RE.d && RE.i === i; RE.d = true; RE.i = same ? -1 : i; RE.it = ''; RE.del = false; RE.msg = ''; RE.hover = null; show(); if (RE.i >= 0) $('roomEd').scrollIntoView({ block: 'nearest' }); }; });
    [].forEach.call(box.querySelectorAll('select'), function (s) {
      var r = R[+s.dataset.i], pl = roomPlan(CFG_ID, r.name);
      s.value = pl ? pl.type : '';
      if (s.selectedOptions[0] && s.selectedOptions[0].disabled) s.value = '';
      s.onchange = function () { roomSet(r.name, s.value ? { type: s.value } : null); RE.it = ''; RE.msg = ''; show(); };
    });
    [].forEach.call(box.querySelectorAll('button[data-e]'), function (b) { b.onclick = function () { var i = +b.dataset.e, same = !RE.d && RE.i === i; RE.d = false; RE.i = same ? -1 : i; RE.it = ''; RE.del = false; RE.msg = ''; RE.hover = null; show(); if (RE.i >= 0) $('roomEd').scrollIntoView({ block: 'nearest' }); }; });
    if (RE.i >= (RE.d ? kit.decks.length : R.length)) RE.i = -1;
  }
  function roomsShow() {
    var T = HULLT[CFG_ID], R = T ? hullRooms(T) : [], n = {}, reach = T ? deckReach(T) : null;
    R.forEach(function (r, i) {
      var I = roomItems(T, r, roomPlan(CFG_ID, r.name)), el = $('rm-' + i + 'V'), b = document.querySelector('#roomItems button[data-e="' + i + '"]');
      var sz = ((r.max[0] - r.min[0] + 1) * S).toFixed(1) + '×' + ((r.max[1] - r.min[1] + 1) * S).toFixed(1) + ' m';
      var far = reach && r.deck && !reach[r.deck.i] ? '　⚠ 走不到（沒有梯子通' + r.deck.name + '）' : '';   // TASK-0572：艙房綁在甲板上（走不到 ⇒ 傷員送不過去）
      if (b) { b.style.display = I.type ? '' : 'none'; b.className = !RE.d && RE.i === i ? 'on' : ''; }
      if (!el) return;
      if (!I.type) { el.textContent = sz + far; return; }
      var its = I.items.map(function (q) { return q.it; }), B = roomBuff(I.type, its), lack = roomLack(I.type, its);
      if (!lack) n[I.type] = (n[I.type] || 0) + 1;
      el.textContent = sz + '・' + (I.auto ? '自動擺滿：' : '自訂：') + (itemsText(I.items) || '沒有物品') + (Object.keys(B).length ? '・' + buffText(B) : '') + (lack ? '　⚠ 缺必要件（' + lack + '）⇒ 不能用' : '') + (I.bad.length ? '　⚠ 存的擺法有 ' + I.bad.length + ' 件擺不下（沒擺）' : '') + far;
    });
    (T ? hullDeckKit(T).decks : []).forEach(function (D, i) {
      var I = deckItems(T, D, deckPlan(CFG_ID, D.id)), el = $('dk-' + i + 'V'), b = document.querySelector('#deckItems button[data-d="' + i + '"]');
      if (b) b.className = RE.d && RE.i === i ? 'on' : '';
      var nk = I.items.filter(function (q) { return FURN[q.it].role === 'powder'; }).length, np = I.items.length - nk;   // 抽水機（45_pumps.js）另外數
      if (el) el.textContent = (I.auto ? '自動：' : '自訂：') + '取用點 ' + nk + ' 處（每處三桶）' + (np ? '・抽水機 ' + np + ' 台' : '') + (nk ? '' : '　⚠ 這一層的送藥手沒地方拿火藥') + (I.bad.length ? '　⚠ 存的擺法有 ' + I.bad.length + ' 處擺不下（沒擺）' : '');
    });
    $('roomSum').textContent = !T ? '船型載入後列得出艙房。' : !R.length ? '這一型還沒標空艙房（造船規格 §9.2：艙房子作品的固定點 <房名>.min／.max、關聯 meta kind=rooms）。'
      : R.length + ' 間空艙房' + (Object.keys(n).length ? '：' + Object.keys(n).map(function (f) { return ROOM_FN[f].name + ' ' + n[f] + ' 間'; }).join('、') : '，都空著') + '。選了類型就自動擺滿（先擺必要件、再擺加強件、剩下的空間多擺）；「擺設…」自己擺。門口留一格走道。' + (ROOMFN_Q ? '　⚠ 網址 ?roomfn= 蓋過' : '');
    roomEdShow(); roomsAdminPost();
  }
  /** 編輯器裡那一間：{ T, name（擺法的鍵）, label, G, pl（擺法）, I（實際擺上的）}；沒有打開 ⇒ null。 */
  function roomEdCur() {
    var T = HULLT[CFG_ID]; if (!T || RE.i < 0) return null;
    if (RE.d) { var D = hullDeckKit(T).decks[RE.i]; if (!D) return null; var dp = deckPlan(CFG_ID, D.id); return { T: T, name: D.id, label: D.name, G: deckGrid(T, D), pl: dp, I: deckItems(T, D, dp) }; }
    var r = hullRooms(T)[RE.i], pl = r && roomPlan(CFG_ID, r.name);
    return pl ? { T: T, name: r.name, label: roomName(r), G: roomGrid(T, r), pl: pl, I: roomItems(T, r, pl) } : null;
  }
  function roomEdShow() {
    var ed = $('roomEd'), E = roomEdCur();
    if (!E) { ed.style.display = 'none'; RE.i = -1; document.body.classList.remove('roomEdOn'); return; }
    ed.style.display = ''; document.body.classList.add('roomEdOn');            // 打開 ⇒ 接近全螢幕的浮層（Tim：拉寬、儘量不要捲軸）
    var F = ROOM_FN[E.pl.type], its = E.I.items.map(function (q) { return q.it; }), B = roomBuff(E.pl.type, its), lack = roomLack(E.pl.type, its), cap = 0;
    if (!RE.it || F.items.indexOf(RE.it) < 0) RE.it = F.items[0];
    E.I.items.forEach(function (q) { cap += FURN[q.it].hold || 0; });
    $('roomEdT').textContent = E.label + '・' + F.name + '（' + E.G.nx + '×' + E.G.ny + ' 格，一格 0.5 m）' + (E.I.auto ? (RE.d ? '・自動（照舊的取用點）' : '・自動擺滿') : '・自訂');
    $('roomEdA').textContent = RE.d ? '回到自動' : '自動擺滿';
    $('roomEdP').innerHTML = F.items.map(function (it) { return '<button data-it="' + it + '"' + (RE.it === it && !RE.del ? ' class="on"' : '') + '>' + FURN[it].name + '（' + furnNote(it) + '）</button>'; }).join('') +
      '<button data-rot="1">轉 90°（' + (RE.r ? '橫過船身' : '順著船身') + '）</button><button data-del="1"' + (RE.del ? ' class="on"' : '') + '>拿掉</button>';
    [].forEach.call($('roomEdP').querySelectorAll('button'), function (b) {
      b.onclick = function () { if (b.dataset.it) { RE.it = b.dataset.it; RE.del = false; } else if (b.dataset.rot) RE.r = 1 - RE.r; else RE.del = !RE.del; RE.msg = ''; roomEdShow(); };
    });
    var npE = E.I.items.filter(function (q) { return FURN[q.it].role === 'pump'; }).length;
    $('roomEdV').innerHTML = (RE.d && npE ? '抽水機 ' + npE + ' 台：加在基礎抽水量上；人力的艙裡有水才派預備水手去搖，蒸汽的靠鍋爐；被打壞、泡水就停。選到抽水機時，調暗的格不能擺（泵井在主桅腳、泵管走中線）。<br>' : '') + (RE.d ? '取用點 ' + E.I.items.filter(function (q) { return FURN[q.it].role === 'powder'; }).length + ' 處：送藥手到最近的一處拿火藥與彈藥（彈藥庫 ＝ 離它最近的那間）；被打到會殉爆。深紅 ＝ 砲班的位置（不能擺）。' : '') + (cap ? '容納 ' + cap + ' 人' : '') + (Object.keys(B).length ? (cap ? '・' : '') + buffText(B) : '') + (lack ? '　<b style="color:#ff9a7a">缺必要件（' + lack + '）⇒ 這一間不能用</b>' : '') +
      (E.I.bad.length ? '<br>⚠ 存的擺法這幾件擺不下（沒擺）：' + E.I.bad.join('；') : '') + (E.I.why ? '<br>⚠ ' + E.I.why : '') + (RE.msg ? '<br>' + RE.msg : '') + (ROOMFN_Q ? '<br>⚠ 網址 ?roomfn= 蓋過：這裡改的開戰時不會用' : '');
    var L = roomEdLay(E.G);
    $('roomEdL').textContent = (L.rot ? '↑ 船頭；左 ＝ 左舷、右 ＝ 右舷' : '← 船尾　船頭 →；上 ＝ 左舷、下 ＝ 右舷') + '。綠 ＝ 可以擺、' + (RE.d ? '深紅 ＝ 砲班的位置' : '黃 ＝ 門口走道') + '（不能擺）、深色 ＝ 站不住。物品的中心擺在點的那一格' + (RE.d ? '。' : '；每一件都要有一邊從門口走得到。');
    roomEdDraw(E);
  }
  /** 格子怎麼畫：一格幾 px、要不要轉（窄的螢幕上，長的甲板改成船頭朝上 ⇒ 往下捲、不用左右捲）。 */
  function roomEdLay(G) {
    var W = Math.max(200, ($('roomEd').clientWidth || innerWidth) - 24), a = Math.floor(W / G.nx), b = Math.floor(W / G.ny);
    if (a < 9 && G.nx > G.ny && b > a) return { rot: true, cs: Math.min(40, b) };
    return { rot: false, cs: Math.max(6, Math.min(40, a)) };
  }
  /** 物品的中心落在 (i, j) 那一格 ⇒ 最小角。 */
  function roomEdAt(it, r, i, j) { var t = itemTiles(it, r); return { it: it, x: i - Math.floor((t[0] - 1) / 2), y: j - Math.floor((t[1] - 1) / 2), r: r }; }
  function roomEdHit(items, i, j) { return items.filter(function (q) { var t = itemTiles(q.it, q.r); return i >= q.x && i < q.x + t[0] && j >= q.y && j < q.y + t[1]; })[0] || null; }
  function roomEdDraw(E) {
    var cv = $('roomEdC'), G = E.G, L = roomEdLay(G), cs = L.cs, dpr = window.devicePixelRatio || 1, W = (L.rot ? G.ny : G.nx) * cs, H = (L.rot ? G.nx : G.ny) * cs;
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.lay = L;
    var x = cv.getContext('2d'), i, j; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    /** 格子（i, j）起、寬 wi 格、高 hj 格的那一塊 ⇒ 畫面上的 [x, y, w, h]（轉了 ⇒ 船頭朝上：畫面的列 ＝ nx − 1 − i、欄 ＝ j）。 */
    function R(i0, j0, wi, hj) { return L.rot ? [j0 * cs, (G.nx - i0 - wi) * cs, hj * cs, wi * cs] : [i0 * cs, j0 * cs, wi * cs, hj * cs]; }
    for (j = 0; j < G.ny; j++) for (i = 0; i < G.nx; i++) { var s = G.s[i + j * G.nx], r = R(i, j, 1, 1); x.fillStyle = s === 0 ? '#20252c' : s === 2 ? '#5d5530' : s === 3 ? '#4e2a26' : '#3b4a3a'; x.fillRect(r[0], r[1], r[2], r[3]); }
    var PF = !RE.del && FURN[RE.it] && FURN[RE.it].place;             // 抽水機（45_pumps.js）：選到它 ⇒ 位置規則外的格調暗（主桅旁中線、蒸汽的只有蒸汽船）
    if (PF) { x.fillStyle = 'rgba(0,0,0,.55)'; for (j = 0; j < G.ny; j++) for (i = 0; i < G.nx; i++) if (G.s[i + j * G.nx] === 1 && pumpPlaceWhy(G, roomEdAt(RE.it, RE.r, i, j))) { var r3 = R(i, j, 1, 1); x.fillRect(r3[0], r3[1], r3[2], r3[3]); } }
    if (cs >= 6) {
      x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1; x.beginPath();
      for (i = 0; i <= W / cs; i++) { x.moveTo(i * cs + 0.5, 0); x.lineTo(i * cs + 0.5, H); }
      for (j = 0; j <= H / cs; j++) { x.moveTo(0, j * cs + 0.5); x.lineTo(W, j * cs + 0.5); }
      x.stroke();
    }
    var hit = RE.hover && RE.del ? roomEdHit(E.I.items, RE.hover[0], RE.hover[1]) : null;
    x.font = Math.max(9, Math.min(13, cs * 0.45)) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    E.I.items.forEach(function (q) {
      var t = itemTiles(q.it, q.r), r = R(q.x, q.y, t[0], t[1]);
      x.fillStyle = ITEM_COL[q.it] || '#aaa'; x.fillRect(r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4);
      x.strokeStyle = q === hit ? '#ff5040' : 'rgba(0,0,0,.6)'; x.lineWidth = q === hit ? 3 : 1; x.strokeRect(r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4);
      x.fillStyle = q.it === 'keg' ? '#f2dcb8' : '#111'; if (Math.min(r[2], r[3]) > 14 && Math.max(r[2], r[3]) > 22) x.fillText(q.it === 'keg' ? '桶' : FURN[q.it].name, r[0] + r[2] / 2, r[1] + r[3] / 2);
    });
    if (RE.hover && !RE.del) {
      var q = roomEdAt(RE.it, RE.r, RE.hover[0], RE.hover[1]), t = itemTiles(q.it, q.r), ok = !placeOk(G, E.pl.type, E.I.items, q), r2 = R(q.x, q.y, t[0], t[1]);
      x.fillStyle = ok ? 'rgba(120,255,140,.35)' : 'rgba(255,90,70,.35)'; x.fillRect(r2[0], r2[1], r2[2], r2[3]);
      x.strokeStyle = ok ? '#7f8' : '#f65'; x.lineWidth = 2; x.strokeRect(r2[0] + 1, r2[1] + 1, r2[2] - 2, r2[3] - 2);
    }
  }
  function roomEdTile(ev) {
    var cv = $('roomEdC'), b = cv.getBoundingClientRect(), L = cv.lay || { cs: 20 }, c = Math.floor((ev.clientX - b.left) / L.cs), rw = Math.floor((ev.clientY - b.top) / L.cs), E = roomEdCur();
    return L.rot && E ? [E.G.nx - 1 - rw, c] : [c, rw];
  }
  $('roomEdC').onpointermove = function (ev) { var E = roomEdCur(); if (!E) return; var h = roomEdTile(ev); if (!RE.hover || h[0] !== RE.hover[0] || h[1] !== RE.hover[1]) { RE.hover = h; roomEdDraw(E); } };
  $('roomEdC').onpointerleave = function () { var E = roomEdCur(); RE.hover = null; if (E) roomEdDraw(E); };
  $('roomEdC').onclick = function (ev) {
    var E = roomEdCur(); if (!E) return;
    var h = roomEdTile(ev), cur = E.I.items.map(function (q) { return { it: q.it, x: q.x, y: q.y, r: q.r }; }), hit = roomEdHit(cur, h[0], h[1]);
    RE.hover = h;
    if (RE.del) { if (!hit) { RE.msg = '這格沒有物品'; roomEdShow(); return; } cur.splice(cur.indexOf(hit), 1); RE.msg = '拿掉了' + FURN[hit.it].name; }
    else if (hit) { RE.msg = '這格已經有' + FURN[hit.it].name + '（要拿掉：按「拿掉」再點它）'; roomEdShow(); return; }
    else {
      var q = roomEdAt(RE.it, RE.r, h[0], h[1]), why = placeOk(E.G, E.pl.type, cur, q);
      if (why) { RE.msg = '<b style="color:#ff9a7a">放不下：' + why + '</b>'; roomEdShow(); return; }
      cur.push(q); RE.msg = '擺上' + FURN[q.it].name;
    }
    roomSet(E.name, { type: E.pl.type, items: cur }); show();
  };
  $('roomEdA').onclick = function () {
    var E = roomEdCur(); if (!E) return;
    if (RE.d) { roomSet(E.name, { type: 'deck' }); RE.msg = '回到自動（照舊的取用點）'; }   // 甲板的自動 ＝ 沒有 items（⇒ 開戰時照舊找、戰局跟沒改過一樣；蓋過設定檔的自訂預設）
    else { roomSet(E.name, { type: E.pl.type }); RE.msg = '自動擺滿了'; }
    show();
  };
  $('roomEdZ').onclick = function () { var E = roomEdCur(); if (!E) return; roomSet(E.name, { type: E.pl.type, items: [] }); RE.msg = '清空了'; show(); };
  $('roomEdX').onclick = $('roomEdX2').onclick = function () { RE.i = -1; show(); };
  window.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && RE.i >= 0) { RE.i = -1; show(); } });
  window.addEventListener('resize', function () { if (RE.i >= 0) roomEdShow(); });
  // 後台模式（?admin=rooms）：只開船隻配置頁的甲板與艙房；後台送來設定檔的預設（{ kind:'cb-defaults', rooms: { 船型: ships[].rooms } }）⇒ 換掉預設、清掉這裡改的
  if (ADMIN_ROOMS) {
    $('shipp').classList.add('admin');
    window.addEventListener('message', function (ev) {
      if (ev.origin !== location.origin || !ev.data || ev.data.kind !== 'cb-defaults') return;
      HULL_KNOWN.forEach(function (h) { h.rooms = ev.data.rooms[h.id] || undefined; });
      Object.keys(SHIP_ROOMS).forEach(function (k) { delete SHIP_ROOMS[k]; }); ADM_SENT = {};
      put(); show();
    });
  }
  function crewPut() {
    var cw = shipCrew(CFG_ID), hc = hullCounts(CFG_ID);
    Object.keys(CR).forEach(function (key) { var e = CR[key]; e.el.value = e.it.gun ? gunCrew(cw, e.it.gun) : cw[e.it.k]; if (e.it.gun) e.row.style.display = !hc || hc.guns[e.it.gun] ? '' : 'none'; });
  }
  function crewShow() {
    var cw = shipCrew(CFG_ID), d = crewDefault(CFG_ID), hc = hullCounts(CFG_ID);
    function v(key, txt, x, x0) { $('cr-' + key + 'V').textContent = txt + (x === x0 ? '' : '　（預設 ' + x0 + '）'); }
    var n = cw.officers; v('officers', n + ' 人' + (n ? '（' + rankList(n) + '）' : '（沒有軍官：沒人指揮，瞄準變散）'), n, d.officers);
    n = cw.helm; v('helm', n + ' 人' + (hc && !hc.wheel ? '（這型沒有舵輪 ⇒ 不站人）' : '（站在舵輪後面；倒下時預備水手會補）'), n, d.helm);
    n = cw.marines; v('marines', n + ' 人（沿右舷舷牆站，用火槍打敵艦露天的人）', n, d.marines);
    n = cw.top; v('top', n + ' 人 × ' + (hc ? hc.masts + ' 根桅 ＝ ' + n * hc.masts : '每根桅'), n, d.top);
    n = cw.monkeys; v('monkeys', n ? n + ' 人 × 每一對砲' + (hc ? '（約 ' + Math.ceil(hc.n / 2) + ' 對）' : '') + '：從取用點搬火藥與彈藥' : '0（沒有：砲旁的藥箱用完就停）', n, d.monkeys);
    n = cw.hands; v('hands', n + ' 人（在住艙甲板待命，缺人手時補位）' + (Q.has('hands') ? '　⚠ 網址 ?hands= 蓋過' : ''), n, d.hands);
    n = cw.shelter ? 1 : 0; v('shelter', n ? '開：預備水手不上露天甲板閒晃（只上去補位）、船長以外的軍官待在甲板下' : '關：預備水手偶爾上露天甲板走動、軍官站在露天甲板', n, d.shelter ? 1 : 0);
    var gsum = 0;
    Object.keys(GUNS).forEach(function (t) {
      var x = gunCrew(cw, t), std = GUNS[t].crew, c = hc ? hc.guns[t] || 0 : 0; gsum += x * c;
      v('g-' + t, x + ' 人' + (hc ? ' × ' + c + ' 門 ＝ ' + x * c : '') + '（' + (x < std ? '標準 ' + std + '：人少裝填慢' : x > std ? '標準 ' + std + '：多的 ' + (x - std) + ' 人是替補' : '標準') + '；最少 ' + GUNS[t].min + ' 人才開得動）', x, gunCrew(d, t));
    });
    if (hc) {
      var pm = Math.ceil(hc.n / 2) * cw.monkeys, hl = hc.wheel ? cw.helm : 0, tp = cw.top * hc.masts, tot = gsum + pm + cw.officers + hl + cw.marines + tp + cw.hands;
      var seen = CREW_SEEN[CFG_ID], ss = !seen ? '這一型還沒上過船：站不站得下，開戰時才知道（站不下的那一項會在上方廣播）。'
        : seen.sig !== crewSig(cw) ? '改過之後還沒開過戰：站不站得下，下一場開戰時才知道（站不下的那一項會在上方廣播）。'
        : '上一場實際上船 ' + seen.n + ' 人' + (seen.short.length ? '；站位不夠、站不下的：' + seen.short.map(function (r) { return r[0] + ' ' + r[2] + '／' + r[1]; }).join('、') + '。' : '，全部站得下。');
      $('crewSum').textContent = '全船約 ' + tot + ' 人：砲班 ' + gsum + '、送藥手約 ' + pm + '、軍官 ' + cw.officers + '、舵手 ' + hl + '、陸戰隊 ' + cw.marines + '、桅頂 ' + tp + '、預備水手 ' + cw.hands + '。' + ss;
    } else $('crewSum').textContent = '船型載入後算得出全船人數。';
    shipCardShow();
    $('shipSt').textContent = PREFS.write ? '改了就自動存在這個瀏覽器（重新整理、下次打開都還在）；換瀏覽器或裝置：用下面的匯出、匯入。'
      : '⚠ 這一頁現在存不了' + (PREFS.state ? '（' + PREFS.state + '）' : '（網址帶了設定參數、或是在畫廊的彈窗裡）') + ' —— 要留住請用下面的「匯出」。';
  }
  function put() {                                     // 變數 ⇒ 滑桿位置（開頭、重設預設值、換編輯的船時）
    var k = C(); $('cfgShip').value = CFG_ID;
    lf.value = k.ballast !== undefined ? k.ballast : LIM.ballast[2]; f.value = k.flood; h.value = Math.log(k.hard / LIM.hard[0]) / hk; c.value = STRIKE.cas * 100; sp.value = k.speed; ag.value = k.agile; uw.value = k.upwind; $('base').value = k.base || 0; $('pump').value = k.pump;
    gh.value = GUN_HP; gw.value = k.gunw; sl.value = SAIL_HP; ph.value = POWDER_HP; bl.value = BLAST_K; bv.value = Math.round(BLAST_V * 100); ch.value = CREW_HP;
    bx.value = BOX_N; cy.value = CARRY_N; wk.value = WIND_K; wc.value = WIND_CAP; $('inertia').value = DRV_INERTIA; $('turninert').value = DRV_TURN; $('sailtq').value = DRV_TQ; dr.value = DROWN_T; $('navre').value = NAV_RE; $('heal').value = HEAL_T; $('gcrew').checked = GUN_CREW_HURT; $('dbg').checked = DBG_SET;
    se.value = SEA_K; st.value = STALL_K; fs.value = FUN.speed; fa.value = FUN.agile; fl.value = FUN.stall; fp.value = FUN.powder; fh.value = FUN.hard;
    for (var r = 0; r < 3; r++) for (var k = 0; k < 3; k++) am(r, k).value = AMMO_K[r][k];
    ['guns', 'masts', 'officers'].forEach(function (k) { $('st-' + k).checked = STRIKE[k]; });
    [0, 1].forEach(function (i) { $('cap' + i).value = CAP_SET[i]; });
    crewPut(); roomsPut();
  }
  function show() {
    var K = C(), SPEEDK = K.speed, AGILK = K.agile, FLOOD = K.flood, HARDK = K.hard, GUNW_K = K.gunw, BALLAST_T = K.ballast !== undefined ? K.ballast : LIM.ballast[2];   // 正在編輯的那一型
    var fun = PLAY === 'fun' ? '（娛樂：' : '（', SPE = SPEEDK * playK('speed'), AGE = AGILK * playK('agile');   // 娛樂 ⇒ 括號裡寫乘過加成的實際值
    $('speedV').textContent = SPEEDK.toFixed(2) + '×' + fun + '最快約 ' + (VMAX * SPE * 1.944).toFixed(0) + ' 節）';
    $('agileV').textContent = AGILK.toFixed(2) + '×' + fun + '滿帆側風約 ' + ((0.012 + 0.016 * VMAX * 0.92) * AGE * 57.3).toFixed(1) + '°/秒）';
    var BKV = K.base || 0; $('baseV').textContent = BKV ? BKV.toFixed(1) + ' 節（推力跟帆相加：實際 ＝ √(帆² ＋ 額外動力²)；不看風向、風速、帆，頂風、收帆也走得動；帆段滿帆再加 ＝ 全速前進才開、全收再收 ＝ 倒車）' : '0（沒有：照帆與風走）';
    var UPK = K.upwind; $('upwindV').textContent = UPK.toFixed(2) + '×（' + (UPK === 1 ? '照舊：' : '') + '風從船頭 ' + (90 - (90 - NOGO_DEG) * UPK).toFixed(0) + '° 開始失速、' + (90 - (90 - NOGO_FULL) * UPK).toFixed(0) + '° 全失速（手動操舵）；近迎風轉向最多 ×' + UPK.toFixed(2) + '）';
    var SK = STALL_K * playK('stall'), WA = WAVES.reduce(function (a, w) { return a + w.a; }, 0) * SEA_K;   // WA：幾道浪疊在一起最高的那一下（振幅）
    $('seaV').textContent = SEA_K <= 0 ? '0（平靜）' : SEA_K.toFixed(2) + '×（浪高最多約 ' + (WA * 2).toFixed(1) + ' m，主浪週期 ' + (2 * Math.PI / WAVES[0].w).toFixed(1) + ' 秒）';
    $('stallV').textContent = Math.round(STALL_K * 100) + '%' + (PLAY === 'fun' ? '（娛樂：實際 ' + Math.round(SK * 100) + '%）' : '') + (SK <= 0 ? '（不會失速）' : SK >= 0.95 ? '（寫實）' : '');
    $('funspeedV').textContent = FUN.speed.toFixed(2) + '×'; $('funagileV').textContent = FUN.agile.toFixed(2) + '×'; $('funstallV').textContent = FUN.stall.toFixed(2) + '×';
    $('funhardV').textContent = FUN.hard.toFixed(2) + '×（鐵甲的擊穿門檻：寫實 ' + Math.round(MATS.iron ? MATS.iron.pen || 0 : 0) + ' ⇒ 娛樂 ' + Math.round((MATS.iron ? MATS.iron.pen || 0 : 0) * FUN.hard) + ' kJ／格；木頭不變）';
    $('funpowderV').textContent = FUN.powder.toFixed(2) + '×' + (powderNever() ? '（火藥拉滿：不會爆）' : '（火藥血量 ' + POWDER_HP + ' ⇒ ' + Math.round(POWDER_HP * FUN.powder) + '）');
    var PU = K.pump; $('pumpV').textContent = PU.toFixed(1) + ' 噸／分' + (PU === cfgBase('pump', CFG_ID) ? '（預設：照排水量）' : '') + (PU <= 0 ? '（不抽水）' : '');
    $('floodV').textContent = FLOOD === 0 ? '0×（不會沉）' : FLOOD.toFixed(2) + '×' + (FLOOD < 0.5 ? '（慢）' : FLOOD < 1.2 ? '' : '（快）');
    var HT = HULLT[CFG_ID], m0 = (HT ? HT.voxT0 : 0) + modelMassT(HT, GUNW_K) + BALLAST_T, l0 = liftFor(HT, HT ? HT.disp - m0 : 0), lx = liftFor(HT, HT ? HT.disp - m0 + 70 : 0);   // 照我艦的船型   // 開戰時浮在哪；例子：再打掉 10 萬格（70 噸）
    var gm = 0, kinds = {}; if (HT) (HT.rig.models || []).forEach(function (m) { var k = modelKind(m); if (GUNS[k]) { gm += GUNS[k].mass * GUNW_K; kinds[k] = 1; } });
    $('gunwV').textContent = GUNW_K.toFixed(2) + '×（' + Object.keys(GUNS).filter(function (k) { return !HT || kinds[k]; }).map(function (k) { return GUNS[k].name + ' ' + (GUNS[k].mass * GUNW_K).toFixed(1) + ' 噸'; }).join('、') + (gm ? '；全部 ' + Math.round(gm) + ' 噸' : '') + '）';
    $('ballastV').textContent = BALLAST_T + ' 噸' + (l0 === null ? '' : '（' + HT.name + ' ' + Math.round(m0).toLocaleString() + ' 噸 ⇒ ' + (Math.abs(l0) < 0.05 ? '剛好在設計水線' : l0 > 0 ? '浮高 ' + l0.toFixed(1) + ' m' : '吃水深 ' + (-l0).toFixed(1) + ' m') + '；打掉 10 萬格再浮 ' + (lx - l0).toFixed(2) + ' m）');
    $('hardV').textContent = HARDK.toFixed(2) + '×' + (HARDK === 1 ? '（只看材質）' : HARDK < 0.5 ? '（容易打穿）' : HARDK > 3 ? '（幾乎打不穿）' : HARDK > 1 ? '（比材質硬）' : '（比材質軟）');
    function shots(hp, dmg) { return dmg > 0 ? Math.ceil(hp / dmg - 1e-9) : '∞'; }
    $('gunhpV').textContent = GUN_HP + '（24 磅實心 ' + shots(GUN_HP, DMG.long * ammoK(0, VS_GUN)) + ' 發、舵輪 ' + Math.round(GUN_HP * 0.6) + '）';
    $('sailhpV').textContent = SAIL_HP + '（24 磅鏈彈 ' + shots(SAIL_HP, DMG.long * ammoK(2, VS_SAIL)) + ' 發）';
    $('crewhpV').textContent = CREW_HP + (CREW_HP === LIM.crewhp[2] ? '' : CREW_HP > LIM.crewhp[2] ? '（耐打）' : '（脆）');
    $('crewdeathV').textContent = CREW_DEATH + '%（HP 歸零：' + (CREW_DEATH >= 100 ? '一律陣亡' : CREW_DEATH <= 0 ? '一律變成傷員' : CREW_DEATH + '% 陣亡、' + (100 - CREW_DEATH) + '% 變成傷員') + '）';
    $('powderhpV').textContent = powderNever() ? '拉滿（不會爆）' : POWDER_HP + (PLAY === 'fun' ? '（娛樂：實際 ' + powderHP() + '）' : '') + (powderHP() >= 600 ? '（很難殉爆，' : powderHP() >= 250 ? '（偶爾殉爆，' : '（很容易殉爆，') + '藥包 ' + Math.round(powderHP() * CART_K) + '）';   // 照實際的（娛樂乘過加成）；300 量過六艘一艘殉爆 ⇒ 偶爾
    $('blastV').textContent = BLAST_K.toFixed(2) + '×（前彈藥庫半徑約 ' + (MAG_R * Math.pow(BLAST_K, 1 / 3) * (S || 0.1)).toFixed(1) + ' m）';
    var r0 = MAG_R * Math.pow(BLAST_K * (1 - BLAST_V), 1 / 3) * (S || 0.1), r1 = MAG_R * Math.pow(BLAST_K * (1 + BLAST_V), 1 / 3) * (S || 0.1);
    $('blastvV').textContent = BLAST_V <= 0 ? '0（每次一樣）' : '±' + Math.round(BLAST_V * 100) + '%（前彈藥庫半徑 ' + r0.toFixed(1) + '～' + r1.toFixed(1) + ' m）';
    $('boxV').textContent = BOX_N + ' 份（開戰時裝滿）';
    $('healV').textContent = HEAL_T ? '約 ' + HEAL_T + ' 秒（預備水手把傷員搬到醫療艙的病床；手術台、藥箱加快，人手不足變慢；治好的回來當預備水手）' : '0（關：傷員照舊 12 秒抬下去，不搬、不治）';
    $('navreV').textContent = NAV_RE > 0 ? '每 ' + NAV_RE + ' 秒（這段時間裡有甲板、梯子被打壞才重算那幾層：打成兩塊不通 ⇒ 分開找路、梯子斷了 ⇒ 改走別座）' : '關（走路格照開戰時的船：甲板打穿了照樣走過去）';
    $('drownV').textContent = DROWN_T ? '約 ' + DROWN_T + ' 秒（浮上水面、往自己的船游，爬回來當預備水手；受傷的減半）' : '0（關：落水當場算陣亡、淹到的跟著船沉）';
    $('windcapV').textContent = WIND_CAP + ' m/s（暴風雨陣風最大約 ' + Math.round(WIND_SAIL * WIND_K * (1 + GUST[0] + GUST[1] + GUST[2]) * 2.2 * 1.5) + ' m/s ⇒ ' + (WIND_SAIL * WIND_K * (1 + GUST[0] + GUST[1] + GUST[2]) * 2.2 * 1.5 > WIND_CAP ? '會被夾住' : '不會碰到') + '）';
    $('inertiaV').textContent = DRV_INERTIA.toFixed(2) + '×（質量的倍率：加減速' + (DRV_INERTIA > 1.01 ? '慢 ' + DRV_INERTIA.toFixed(2) + ' 倍' : DRV_INERTIA < 0.99 ? '快 ' + (1 / DRV_INERTIA).toFixed(2) + ' 倍' : '照校準') + '）'; $('turninertV').textContent = DRV_TURN.toFixed(2) + '×（轉向追舵 ' + (2 * DRV_TURN).toFixed(1) + ' 秒）'; $('sailtqV').textContent = DRV_TQ.toFixed(2) + '×' + (DRV_TQ === 0 ? '（受損不偏）' : '');
    $('windV').textContent = WIND_K.toFixed(2) + '×（帆上的風約 ' + (WIND_SAIL * WIND_K).toFixed(0) + ' m/s，陣風 ±' + Math.round(GUST[0] * 100) + '%）';
    $('carryV').textContent = CARRY_N + ' 份' + (CARRY_N > BOX_N ? '（比藥箱多 ⇒ 一趟送好幾門）' : '');
    $('casV').textContent = STRIKE.cas >= 1 ? '100%（全員倒下才停）' : Math.round(STRIKE.cas * 100) + '%';
    $('strikeV').textContent = strikeText();
    var amDef = AMMO_K.every(function (r, i) { return r.every(function (v, j) { return v === AMMO_K0[i][j]; }); });
    $('detV').textContent = '玩法 ' + (PLAY === 'fun' ? '娛樂（航速 ×' + FUN.speed.toFixed(2) + '、靈活 ×' + FUN.agile.toFixed(2) + '、頂風失速 ' + Math.round(SK * 100) + '%）' : '寫實（頂風失速 ' + Math.round(SK * 100) + '%）') + '・天氣 ' + WX.name + '・浪 ' + (SEA_K > 0 ? SEA_K.toFixed(2) + '×' : '平靜') + '・' + fleetHulls().map(function (id) { var c = shipCfg(id), hi = hullInfo(id); return (hi ? hi.name : id) + '：硬度 ' + c.hard.toFixed(1) + '×・進水 ' + c.flood.toFixed(2) + '×・抽水 ' + c.pump.toFixed(1) + ' 噸／分・壓艙物 ' + (c.ballast !== undefined ? c.ballast + ' 噸' : '（載入後）') + '・砲重 ' + c.gunw.toFixed(2) + '×・航速 ' + c.speed.toFixed(2) + '×・靈活 ' + c.agile.toFixed(2) + '×・逆風 ' + c.upwind.toFixed(2) + '×・預備水手 ' + shipCrew(id).hands; }).join('；') + '・血量 砲 ' + GUN_HP + '／帆 ' + SAIL_HP + '／船員 ' + CREW_HP +
      '・傷害 ' + DMG.long + '／' + DMG.long32 + '／' + DMG.carr + '／' + DMG.chase + '／' + DMG.long4 + '／' + DMG.long12 + '／' + DMG.long18 + '／' + DMG.long6 + '／' + DMG.chase3 + (amDef ? '' : '・彈種倍率已改') + '・藥箱 ' + BOX_N + '、一次搬 ' + CARRY_N + '・溺水 ' + (DROWN_T ? DROWN_T + ' 秒' : '關') +
      '・火藥桶 ' + (powderNever() ? '不會爆' : '血量 ' + powderHP() + '、殉爆 ' + BLAST_K.toFixed(2) + '×' + (BLAST_V > 0 ? ' ±' + Math.round(BLAST_V * 100) + '%' : '')) + '・砲長 ' + CAP_SET.map(function (k) { return CAPTAINS[k] ? CAPTAINS[k].name : '隨機'; }).join('／') + '・' + strikeText();
    crewShow(); roomsShow();
  }
  lf.oninput = function () { C().ballast = Math.round(+lf.value); show(); };
  f.oninput = function () { C().flood = +f.value; show(); };
  sp.oninput = function () { C().speed = +sp.value; show(); };
  ag.oninput = function () { C().agile = +ag.value; show(); };
  uw.oninput = function () { C().upwind = +uw.value; show(); };
  $('base').oninput = function () { C().base = +$('base').value; show(); };
  $('pump').oninput = function () { C().pump = +$('pump').value; show(); };   // 基礎抽水量（噸／分；33_flood.js pumpK）   // 額外動力（31_sailing.js；設定鍵照舊叫 base）
  h.oninput = function () { C().hard = Math.round(LIM.hard[0] * Math.exp(h.value * hk) * 20) / 20; show(); };   // 倍率：0.05 一格（1 ＝ 只看材質）
  c.oninput = function () { STRIKE.cas = c.value / 100; show(); };
  gh.oninput = function () { GUN_HP = Math.round(+gh.value); show(); };
  gw.oninput = function () { C().gunw = +gw.value; show(); };
  sl.oninput = function () { SAIL_HP = Math.round(+sl.value); show(); };
  ph.oninput = function () { POWDER_HP = Math.round(+ph.value); show(); };
  bl.oninput = function () { BLAST_K = +bl.value; show(); };
  bv.oninput = function () { BLAST_V = Math.round(+bv.value) / 100; show(); };
  ch.oninput = function () { CREW_HP = Math.round(+ch.value); show(); };
  cd.oninput = function () { CREW_DEATH = Math.round(+cd.value); show(); };
  bx.oninput = function () { BOX_N = Math.round(+bx.value); show(); };
  cy.oninput = function () { CARRY_N = Math.round(+cy.value); show(); };
  dr.oninput = function () { DROWN_T = Math.round(+dr.value); show(); };
  var nr = $('navre'); nr.min = LIM.navre[0]; nr.max = LIM.navre[1];       // 尋路動態更新（TASK-0572）
  nr.oninput = function () { NAV_RE = +nr.value; show(); };
  var hl = $('heal'); hl.min = LIM.heal[0]; hl.max = LIM.heal[1];          // 醫療艙的治療時間（TASK-0568）
  hl.oninput = function () { HEAL_T = Math.round(+hl.value); show(); };
  $('gcrew').onchange = function () { GUN_CREW_HURT = $('gcrew').checked; show(); };
  $('dbg').onchange = function () { DBG_SET = $('dbg').checked; show(); };   // Debug 模式（04_state.js dbgOn）：遊戲中也生效   // 砲被打飛 ⇒ 砲班跟著受傷（TASK-0568）
  st.oninput = function () { STALL_K = +st.value; show(); };
  se.oninput = function () { SEA_K = +se.value; show(); };
  fs.oninput = function () { FUN.speed = +fs.value; show(); }; fa.oninput = function () { FUN.agile = +fa.value; show(); }; fl.oninput = function () { FUN.stall = +fl.value; show(); }; fp.oninput = function () { FUN.powder = +fp.value; show(); }; fh.oninput = function () { FUN.hard = +fh.value; show(); };
  wk.oninput = function () { WIND_K = +wk.value; show(); };
  wc.oninput = function () { WIND_CAP = +wc.value; show(); };
  $('inertia').oninput = function () { DRV_INERTIA = +$('inertia').value; show(); }; $('turninert').oninput = function () { DRV_TURN = +$('turninert').value; show(); }; $('sailtq').oninput = function () { DRV_TQ = +$('sailtq').value; show(); };   // 每一步讀 ⇒ 遊戲中也能調          // 物理是每一步讀 ⇒ 遊戲中也能調（只管畫面）
  for (var r = 0; r < 3; r++) for (var k = 0; k < 3; k++) (function (r, k) {
    var el = am(r, k);
    el.oninput = function () { var v = parseFloat(el.value); if (isFinite(v)) { AMMO_K[r][k] = clamp(Math.round(v), AMMO_LIM[0], AMMO_LIM[1]); show(); } };
    el.onchange = function () { el.value = AMMO_K[r][k]; };          // 打了界外或空白 ⇒ 回到夾過的值
  })(r, k);
  ['guns', 'masts', 'officers'].forEach(function (k) { var b = $('st-' + k); b.onchange = function () { STRIKE[k] = b.checked; show(); }; });
  [0, 1].forEach(function (i) { var s = $('cap' + i); capOptions(s, CAP_SET[i]); s.onchange = function () { CAP_SET[i] = s.value; show(); }; });   // 砲長
  var cs = $('cfgShip'); hullOptions(cs, CFG_ID);                // 船隻設定：編輯哪一型（選到還沒載的船 ⇒ 先載，壓艙物的預設要船型才算得出來）
  cs.onchange = function () { CFG_ID = cs.value; loadHull(CFG_ID).then(function () { put(); show(); }); put(); show(); };
  fleetUI();                                                     // 主選單：艦隊編成
  // 細節設定那一頁：主選單 ⇄ 細節設定（同一個 #cover 裡兩張卡片，一次顯示一張）
  function page(w) { $('detail').style.display = w === 'det' ? '' : 'none'; $('gfxp').style.display = w === 'gfx' ? '' : 'none'; $('phxp').style.display = w === 'phx' ? '' : 'none'; $('shipp').style.display = w === 'ship' ? '' : 'none'; $('gunp').style.display = w === 'gun' ? '' : 'none'; $('furnp').style.display = w === 'furn' ? '' : 'none'; $('keysp').style.display = w === 'keys' ? '' : 'none'; $('sndp').style.display = w === 'snd' ? '' : 'none'; if (w !== 'keys') KEY_WAIT = null; document.querySelector('#cover .card:not(#detail):not(#gfxp):not(#phxp):not(#shipp):not(#gunp):not(#furnp):not(#keysp):not(#sndp)').style.display = w ? 'none' : ''; $('cover').scrollTop = 0; $('pgX').classList.toggle('on', !!w && !ADMIN_ROOMS); }   // w：'' 主選單、'det' 細節設定、'gfx' 畫質設定、'phx' 物理設定、'ship' 船隻配置、'gun' 砲的設定、'furn' 道具設定（67_furncfg.js）
  [].forEach.call(document.querySelectorAll('#plays button'), function (b) { b.onclick = function () { setPlay(b.dataset.p); show(); }; });   // 主選單：玩法
  $('detB').onclick = function () { page('det'); };
  $('detX').onclick = function () { page(''); };
  $('gfxB').onclick = function () { page('gfx'); };
  $('gfxX').onclick = function () { page(''); };
  $('phxB').onclick = function () { page('phx'); };
  $('phxX').onclick = function () { page(''); };
  $('shipB').onclick = function () { page('ship'); loadHull(CFG_ID).then(function () { put(); show(); }); };   // 船隻配置：先載那一型（砲數、桅數、壓艙物的預設要船型）
  if (ADMIN_DEF) admDefUI(page);                                 // 出廠預設值（?admin=defaults）：直接開細節設定頁
  if (ADMIN_ROOMS) {                                              // 甲板與艙房編輯器：後台開的分頁（TASK-0647；舊的 iframe 也認）
    $('shipB').onclick();
    var aw = admWin();
    if (aw) { try { aw.postMessage({ kind: 'cb-ready' }, location.origin); } catch (e) { /* 後台關了 */ } }
    else { var wn = document.createElement('p'); wn.className = 'admWarn'; wn.style.cssText = 'color:#f9a;margin:6px 0'; wn.textContent = '⚠ 找不到設定後台：要從設定後台最上面的「甲板與艙房編輯器…」開這一頁；直接開的改了也不會送回去'; $('shipp').insertBefore(wn, $('shipp').firstChild); }
  }
  $('shipX').onclick = function () { page(''); };
  $('gunB').onclick = function () { page('gun'); gunShow(); };   // 砲的設定（68_guncfg.js）
  $('gunX').onclick = function () { page(''); };
  $('furnB').onclick = function () { page('furn'); furnShow(); };   // 道具設定（67_furncfg.js）
  $('furnX').onclick = function () { page(''); };
  $('keysB').onclick = function () { page('keys'); keysShow(); };   // 鍵位設定（66_keys.js）
  $('keysX').onclick = function () { page(''); };
  sndUI();                                                       // 聲音設定的滑桿與按鈕（主選單那一頁＋遊戲內設定面板，02_music.js）
  $('sndB').onclick = function () { page('snd'); sndShow(); };   // 聲音設定（02_music.js，TASK-0677）
  $('sndX').onclick = function () { page(''); };
  $('pgX').onclick = function () { RE.i = -1; show(); page(''); };   // 右上角的返回（每一頁同一顆）
  function shipReset(id) {                             // 一型回到預設：船員、艙房的擺法、壓艙物、性能
    delete SHIP_CREW[id]; delete SHIP_ROOMS[id]; delete PREF_BALLAST[id];
    var c = shipCfg(id); SHIP_KEYS.forEach(function (k) { c[k] = k === 'ballast' ? (HULLT[id] ? HULLT[id].ballast0 : undefined) : cfgBase(k, id); });
  }
  cfgKit('ship', {                                     // 那一排按鈕（64_cfgkit.js）；這一型回到預設按兩下（Tim：編起來很花時間 ⇒ 不要一按就沒了）
    one: { idle: '這一型回到預設', arm: function () { var hi = hullInfo(CFG_ID); return '再按一次：' + (hi ? hi.name : CFG_ID) + '的船員、艙房與性能都回到預設'; }, run: function () { shipReset(CFG_ID); } },
    all: { title: '船隻配置全部回到預設', body: '每一型船（不只正在看的這一型）的船員、艙房擺設、壓艙物與性能都回到預設。改過的會不見；要留的話先按「匯出…」。',
      run: function () {                               // 每一型（設定檔裡的船＋存檔裡有、這份成品沒有的）
        var ids = {}; CFG.ships.forEach(function (s) { ids[s.id] = 1; }); [SHIP_CFG, SHIP_CREW, SHIP_ROOMS, PREF_BALLAST].forEach(function (m) { Object.keys(m).forEach(function (id) { ids[id] = 1; }); });
        Object.keys(ids).forEach(shipReset); return '已全部回到預設（' + CFG.ships.length + ' 型船）。';
      } },
    kind: 'ships', file: 'constitution_broadside_ships', expSay: '每一型的船員與性能', exp: function () { var o = shipsExport(); return { cfg: o.cfg, crew: o.crew, rooms: o.rooms }; },   // 69_prefs.js shipsExport
    imp: shipsImport, what: '船隻配置', unit: '型船', show: function () { put(); show(); }
  });
  $('allR').onclick = function () {                    // 主選單的全部回到預設：刪掉這台瀏覽器的存檔、重新載入 ⇒ 每一項都照程式與設定檔的預設（網址帶的參數照舊優先）
    askOk('全部回到預設', '主選單的選擇（模式、玩法、艦隊、航行、距離、天氣、畫質、物理效果）、細節設定、船隻配置、砲的設定、道具設定、鍵位，全部回到預設：這台瀏覽器裡的存檔會刪掉，頁面重新載入。要留的話先到各設定頁按「匯出…」。', '全部回到預設', function () {
      PREFS.write = false;                               // ⛔ 關頁時的自動存檔會把現在的設定又寫回去（69_prefs.js）
      try { window.localStorage.removeItem(PREFS_KEY); } catch (e) { /* 這一頁不能用 localStorage（畫廊彈窗）⇒ 本來就沒有存檔 */ }
      location.reload();
    });
  };
  askUI();                                             // 確認彈窗（65_ask.js）：⛔ 要比 keysUI 先掛（鍵盤的捕獲階段照掛的先後）
  gfxUI(); phxUI(); gunUI(); gunShow(); furnUI(page); furnShow(); keysUI(page); keysShow();
  if (ADMIN_FURN) { page('furn'); furnShow(); }
  if (ADMIN_KEYS) { page('keys'); keysShow(); }                   // 鍵位的出廠預設值（?admin=keys）：直接開鍵位設定頁（66_keys.js keysAdmUI）                   // 道具的出廠預設值（?admin=furn）：直接開道具設定頁（67_furncfg.js furnAdmUI 接存檔、重建）
  $('detR').onclick = function () {                    // 重設預設值：LIM 的第三格、降旗全不勾
    // 船隻配置頁（每一型的船員與性能）不跟著重設：那一頁有自己的「這一型回到預設」（TASK-0570：編起來很花時間）
    GUN_HP = LIM.gunhp[2]; SAIL_HP = LIM.sailhp[2]; POWDER_HP = LIM.powderhp[2]; BLAST_K = LIM.blast[2]; BLAST_V = LIM.blastv[2]; CREW_HP = LIM.crewhp[2]; CREW_DEATH = LIM.crewdeath[2];
    BOX_N = LIM.box[2]; CARRY_N = LIM.carry[2]; WIND_K = LIM.wind[2]; WIND_CAP = LIM.windcap[2]; DRV_INERTIA = LIM.inertia[2]; DRV_TURN = LIM.turninert[2]; DRV_TQ = LIM.sailtq[2]; HANDS = LIM.hands[2]; DROWN_T = LIM.drown[2]; NAV_RE = LIM.navre[2]; HEAL_T = LIM.heal[2]; GUN_CREW_HURT = true; DBG_SET = false;
    AMMO_K = AMMO_K0.map(function (r) { return r.slice(); });
    SEA_K = LIM.sea[2]; STALL_K = LIM.stall[2]; FUN.speed = LIM.funspeed[2]; FUN.agile = LIM.funagile[2]; FUN.stall = LIM.funstall[2]; FUN.powder = LIM.funpowder[2];
    STRIKE.cas = LIM.cas[2]; STRIKE.guns = STRIKE.masts = STRIKE.officers = false; CAP_SET = ['random', 'random'];
    put(); show(); prefsReset();                         // 存檔跟著清（69_prefs.js：只剩主選單的選擇）
  };
  window.addEventListener('keydown', function (e) { if (!RUNNING && e.key === 'Escape' && ($('detail').style.display !== 'none' || $('gfxp').style.display !== 'none' || $('phxp').style.display !== 'none' || $('shipp').style.display !== 'none' || $('gunp').style.display !== 'none' || $('furnp').style.display !== 'none' || ($('keysp').style.display !== 'none' && !KEY_WAIT))) page(''); });   // 鍵位設定頁正在等新鍵 ⇒ Esc 是取消（66_keys.js），不關頁
  put(); show(); SLIDERS_SHOW = function () { put(); show(); };
}
/** 畫質（07_gfx.js）：主選單的低／中／高、畫質設定頁每一項的按鈕、顯示 FPS。改了立刻生效（render 每一格讀 GFX）。 */
function gfxUI() {
  var box = $('gfxItems');
  box.innerHTML = GFX_ITEMS.map(function (it) {
    return '<div class="row"><label>' + it.name + '</label>' + it.opt.map(function (o, v) { return '<button data-k="' + it.k + '" data-v="' + v + '">' + o + '</button>'; }).join('') + '</div>';
  }).join('') + '<div class="row slide"><label for="smokeR">煙消散</label><input type="range" id="smokeR" min="' + SMOKE_LIM[0] + '" max="' + SMOKE_LIM[1] + '" step="0.1" aria-label="煙散得多快（倍數；1 ＝ 原本）"><span id="smokeV"></span></div>'
    + '<div class="row slide"><label for="debR">碎片上限</label><input type="range" id="debR" min="' + DEB_LIM[0] + '" max="' + DEB_LIM[1] + '" step="1000" aria-label="畫面上最多幾顆碎片"><span id="debV"></span></div>';   // 煙：不跟三檔走（07_gfx.js SMOKE_LIM）
  [].forEach.call(box.querySelectorAll('button[data-k]'), function (b) { b.onclick = function () { GFX[b.dataset.k] = +b.dataset.v; gfxShow(); }; });
  var sr = $('smokeR'); sr.oninput = function () { SMOKE_K = Math.round(+sr.value * 10) / 10; gfxShow(); };
  var dr2 = $('debR'); dr2.oninput = function () { DEB_CAP = Math.round(+dr2.value); gfxShow(); };
  [].forEach.call(document.querySelectorAll('#gfxs button[data-g], #gfxPre button'), function (b) { b.onclick = function () { gfxSet(b.dataset.g); gfxShow(); }; });
  var f = $('gfxFps'); f.checked = GFX_FPS; f.onchange = function () { GFX_FPS = f.checked; gfxShow(); };
  gfxShow();
}
function gfxShow() {
  var lv = gfxLevel();
  [].forEach.call(document.querySelectorAll('#gfxs button[data-g], #gfxPre button'), function (b) { b.className = b.dataset.g === lv ? 'on' : ''; });
  var gb = $('gfxB'); gb.textContent = lv === 'custom' ? '自訂（畫質設定…）' : '畫質設定…'; gb.className = lv === 'custom' ? 'on' : '';
  [].forEach.call(document.querySelectorAll('#gfxItems button[data-k]'), function (b) { b.className = GFX[b.dataset.k] === +b.dataset.v ? 'on' : ''; });
  $('debR').value = DEB_CAP; $('debV').textContent = DEB_CAP.toLocaleString() + ' 顆' + (DEB_CAP === DEB_LIM[2] ? '（預設）' : '') + '：超過時先清視野外、遠處、沉在水裡的';
  $('smokeR').value = SMOKE_K; $('smokeV').textContent = SMOKE_K.toFixed(1) + '×' + (SMOKE_K === 1 ? '（原本）' : SMOKE_K === SMOKE_LIM[2] ? '（預設）' : SMOKE_K > 1 ? '（散得快）' : '（留得久）') + '　砲煙約 ' + (2.5 / SMOKE_K).toFixed(1) + '–' + (5.5 / SMOKE_K).toFixed(1) + ' 秒';
  $('gfxLv').textContent = '現在：' + GFX_NAME[lv]; $('gfxFps').checked = GFX_FPS; $('fps').className = GFX_FPS ? 'hud on' : 'hud';
  if (typeof gsetShow === 'function') gsetShow();
}
/** 物理效果（09_phx.js）：主選單的全開／高／中／低、物理設定頁每一項的按鈕。帆與繩換到「關」或從「關」換出來 ⇒ setPhys（跟 B 鍵同一支）。 */
function phxUI() {
  var box = $('phxItems');
  box.innerHTML = PHX_ITEMS.map(function (it) {
    return '<div class="row"><label>' + it.name + '</label>' + it.opt.map(function (o, v) { return '<button data-k="' + it.k + '" data-v="' + v + '">' + o + '</button>'; }).join('') + '</div>' + (it.k === 'shipdmg' ? ramRows() : '');   // 碰撞傷害底下：它的數值（ramRows）
  }).join('') + '<div class="row"><label>物理減速</label><button data-pslow="0">關</button><button data-pslow="1">開（計算量大時放慢模擬）</button></div>'   // 不跟四檔走（73_slowmo.js PSLOW）
    + '<div class="row slide"><label for="pslowR">減速門檻</label><input type="range" id="pslowR" min="' + LIM.pslowb[0] + '" max="' + LIM.pslowb[1] + '" step="0.05" aria-label="模擬最多佔真實時間幾成，超過就放慢"><span id="pslowV"></span></div>';
  [].forEach.call(box.querySelectorAll('button[data-k]'), function (b) { b.onclick = function () { PHX[b.dataset.k] = +b.dataset.v; phxSync(); }; });
  [].forEach.call(box.querySelectorAll('button[data-pslow]'), function (b) { b.onclick = function () { if ((b.dataset.pslow === '1') !== PSLOW.on) pslowToggle(); }; });
  var pr = $('pslowR'); pr.oninput = function () { PSLOW.budget = Math.round(+pr.value * 100) / 100; phxShow(); };
  RAM_UI.forEach(function (u) { var el = $('ram_' + u.k); el.oninput = function () { RAM[u.k] = ramFrom(u, +el.value); phxShow(); }; });
  [].forEach.call(document.querySelectorAll('#phxs button[data-x], #phxPre button'), function (b) { b.onclick = function () { phxSet(b.dataset.x); phxSync(); }; });
  phxShow();
}
/** 碰撞傷害的數值（TASK-0652；Tim 2026-10-16：「數值可以開成設定頁面Slider嗎(開啟碰撞傷害後才顯示)」）：接在「碰撞傷害」那一列底下，開關關著 ⇒ 整塊藏起來（phxShow）。
 *  k ＝ RAM 的欄位、q ＝ 設定檔 lim 與網址的鍵、st ＝ 步長；txt ＝ 數值後面那一段說明；log ⇒ 滑桿照對數走（傷害倍率 0.2–100：Tim 2026-10-16「傷害倍率上限可以調整到100x嗎」—— 線性的話 1 附近幾乎調不動），數值照大小取整（< 2 每 0.05、< 10 每 0.1、< 30 每 0.5、其他每 1）。 */
var RAM_UI = [
  { k: 'v0', q: 'ramv', name: '撞擊門檻', st: 0.1, txt: function (x) { return x.toFixed(1) + ' m/s（約 ' + (x * 1.944).toFixed(1) + ' 節）：沿接觸方向接近得比這快才算撞擊'; } },
  { k: 'k', q: 'ramk', name: '撞擊傷害倍率', st: 0.01, log: true, txt: function (x) { return '× ' + (x < 10 ? x.toFixed(2) : x.toFixed(x < 30 ? 1 : 0)) + '：撞掉多少格（速度照物理，不跟著變）'; } },
  { k: 'e', q: 'rame', name: '彈力係數', st: 0.05, txt: function (x) { return x.toFixed(2) + (x ? '：撞完反彈（恢復係數；沿接觸方向彈回 ' + Math.round(x * 100) + '% 的接近速度、拿去撞壞的能量剩 ' + Math.round((1 - x * x) * 100) + '%）' : '：不反彈（完全非彈性，撞完一起走）'); } },   // Tim 2026-10-16：「是否可以有加彈力系數(撞擊後反彈)」
  { k: 'side', q: 'ramside', name: '側撞有效質量', st: 0.5, txt: function (x) { return '× ' + x.toFixed(1) + '：被側面撞的船沿接觸方向多難推動（水擋著橫向）；越大 ⇒ 撞人的那艘停得越乾脆'; } }];
/** 滑桿的位置 ⇄ 數值（log 那一條照 log10）。 */
function ramPos(u, x) { return u.log ? Math.log10(x) : x; }
function ramFrom(u, v) {
  var L = LIM[u.q]; if (!u.log) return clamp(Math.round(v / u.st) * u.st, L[0], L[1]);
  var x = Math.pow(10, v), s = x < 2 ? 0.05 : x < 10 ? 0.1 : x < 30 ? 0.5 : 1; return clamp(Math.round(x / s) * s, L[0], L[1]);
}
function ramRows() {
  return '<div id="ramBox">' + RAM_UI.map(function (u) { var L = LIM[u.q]; return '<div class="row slide"><label for="ram_' + u.k + '">' + u.name + '</label><input type="range" id="ram_' + u.k + '" min="' + ramPos(u, L[0]) + '" max="' + ramPos(u, L[1]) + '" step="' + (u.log ? 'any' : u.st) + '" aria-label="' + u.name + '"><span id="ram_' + u.k + 'V"></span></div>'; }).join('') + '</div>';
}
function phxSync() { if ((PHX.rig > 0) !== PHYS) setPhys(PHX.rig > 0); phxShow(); }
function phxShow() {
  var lv = phxLevel();
  [].forEach.call(document.querySelectorAll('#phxs button[data-x], #phxPre button'), function (b) { b.className = b.dataset.x === lv ? 'on' : ''; });
  var pb = $('phxB'); pb.textContent = lv === 'custom' ? '自訂（物理設定…）' : '物理設定…'; pb.className = lv === 'custom' ? 'on' : '';
  [].forEach.call(document.querySelectorAll('#phxItems button[data-k]'), function (b) { b.className = PHX[b.dataset.k] === +b.dataset.v ? 'on' : ''; });
  [].forEach.call(document.querySelectorAll('#phxItems button[data-pslow]'), function (b) { b.className = (b.dataset.pslow === '1') === PSLOW.on ? 'on' : ''; });
  $('pslowR').value = PSLOW.budget; $('pslowV').textContent = '模擬最多佔 ' + Math.round(PSLOW.budget * 100) + '% 的時間' + (PSLOW.budget === LIM.pslowb[2] ? '（預設）' : '') + '：越低越早放慢、畫面越順' + (PSLOW.on ? '' : '（物理減速關著）');
  $('phxLv').textContent = '現在：' + PHX_NAME[lv];
  if ($('ramBox')) { $('ramBox').style.display = PHX.shipdmg ? '' : 'none'; RAM_UI.forEach(function (u) { var x = RAM[u.k]; $('ram_' + u.k).value = ramPos(u, x); $('ram_' + u.k + 'V').textContent = u.txt(x) + (Math.abs(x - LIM[u.q][2]) < 1e-9 ? '（預設）' : ''); }); }
  if (typeof gsetShow === 'function') gsetShow();
}
/** 玩法：娛樂／寫實（04_state.js 的 PLAY）＋主選單按鈕的亮燈。航行每一步都讀（playK）；按鈕在主選單，沒開戰時才按得到。 */
function setPlay(p) { PLAY = p === 'real' ? 'real' : 'fun'; [].forEach.call(document.querySelectorAll('#plays button'), function (x) { x.className = x.dataset.p === PLAY ? 'on' : ''; }); }
/** 選單列船：HULL_LIST 的每一艘。 */
function hullOptions(sel, v) { sel.innerHTML = HULL_LIST.map(function (h) { return '<option value="' + h.id + '">' + h.name + '</option>'; }).join(''); sel.value = v; }
/** 主選單的艦隊編成（TASK-0537）：我方、敵方各一列，每艘一個選單；第二艘起有 ×（拿掉）；＋ 加一艘（照那一邊最後一艘的船型），合計到 MAX_SHIPS 就停用。
 *  我方第一艘 ＝ 我艦。改了就重建這兩列。 */
function fleetUI() {
  var full = FLEET_SET[0].length + FLEET_SET[1].length >= FLEET_MAX;
  [0, 1].forEach(function (s) {
    var box = $('fleet' + s), L = FLEET_SET[s];
    box.innerHTML = L.map(function (id, j) {
      var lab = s === 0 ? (j ? '友艦 ' + j : '我艦') : '敵艦 ' + (j + 1);
      return '<span class="fs"><select data-s="' + s + '" data-j="' + j + '" aria-label="' + lab + '的船" title="' + lab + '"></select>' + (j ? '<button class="fx" data-s="' + s + '" data-j="' + j + '" aria-label="拿掉' + lab + '">×</button>' : '') + '</span>';
    }).join('') + '<button class="fa" data-s="' + s + '" aria-label="' + (s ? '加一艘敵艦' : '加一艘友艦') + '"' + (full ? ' disabled' : '') + '>＋</button>';
    [].forEach.call(box.querySelectorAll('select'), function (el) { hullOptions(el, L[+el.dataset.j]); el.onchange = function () { pickShip(s, +el.dataset.j, el.value); }; });
    [].forEach.call(box.querySelectorAll('button.fx'), function (b) { b.onclick = function () { L.splice(+b.dataset.j, 1); fleetUI(); pickShip(); }; });
    box.querySelector('button.fa').onclick = function () { if (FLEET_SET[0].length + FLEET_SET[1].length < FLEET_MAX) { L.push(L[L.length - 1]); fleetUI(); pickShip(); } };
  });
  var sp = fieldSplit(fleetSpec()), fb = sp.field.filter(function (f) { return f.team === 'blue'; }).length, fr = sp.field.length - fb;   // 開局誰上場（52_fleet.js）
  $('fleetN').textContent = FLEET_SET[0].length + ' 對 ' + FLEET_SET[1].length + (full ? '（編成上限 ' + FLEET_MAX + ' 艘）' : '') +
    (sp.reserve.blue.length || sp.reserve.red.length ? '　⇒ 開局 ' + fb + ' 對 ' + fr + ' 上場，候補 ' + sp.reserve.blue.length + '／' + sp.reserve.red.length + ' 艘（' + REINF_NAMES[REINF_MODE] + '）' : '');
}
/** 主選單換船（s 那一邊第 j 艘換成 id；不給 ⇒ 只是艘數變了）：還沒載的先載（開戰鈕暫時停用），載好就把背景的船換掉；細節設定跟著編輯我艦那一型。 */
function pickShip(s, j, id) {
  if (id) { FLEET_SET[s][j] = id; if (s === 0 && j === 0) CFG_ID = id; }
  var need = fleetHulls().filter(function (h) { return !HULLT[h]; });
  var go = $('go'); go.disabled = true; go.textContent = need.length ? '載入' + hullInfo(need[0]).name + '…' : '編隊中…';
  Promise.all(fleetHulls().map(loadHull)).then(function () {
    if (fleetHulls().some(function (h) { return !HULLT[h]; })) return;     // 又換了一艘、還在載
    go.disabled = false; go.textContent = '開戰';
    if (!RUNNING) reset();                                                  // 選單後面的兩艘換成選到的船
    if (SLIDERS_SHOW) SLIDERS_SHOW();
  }).catch(function (e) { go.textContent = '載不了：' + (e && e.message || e); console.error(e); });
}
sliders(); setPlay(PLAY); setWeather(WX_ID);
[].forEach.call(document.querySelectorAll('#wxs button'), function (b) { b.onclick = function () { setWeather(b.dataset.w); if (SLIDERS_SHOW) SLIDERS_SHOW(); }; });   // 主選單：天氣（08_weather.js）
/** 主選單：同時在場（滑桿 2～MAX_SHIPS，52_fleet.js FIELD_N）；編成超過它的照候補規則進場。 */
function fieldShow() { var f = $('field'); f.value = FIELD_N; $('fieldV').textContent = FIELD_N + ' 艘'; if ($('fleetN')) fleetUI(); }
(function () { var f = $('field'); f.min = 2; f.max = MAX_SHIPS; f.oninput = function () { FIELD_N = Math.round(+f.value); fieldShow(); }; fieldShow(); })();
/** 細節設定：艦隊指揮官（52_fleet.js CMD_SIDE；策略在 53_commander.js）。 */
function cmdShow() { [].forEach.call(document.querySelectorAll('.cmds'), function (row) { [].forEach.call(row.querySelectorAll('button'), function (b) { b.className = b.dataset.c === CMD_SIDE[row.dataset.side] ? 'on' : ''; }); }); }
[].forEach.call(document.querySelectorAll('.cmds'), function (row) { [].forEach.call(row.querySelectorAll('button'), function (b) { b.onclick = function () { CMD_SIDE[row.dataset.side] = b.dataset.c; cmdShow(); }; }); });
cmdShow();
/** 細節設定：候補補位（52_fleet.js REINF_MODE）。 */
function reinfShow() { [].forEach.call(document.querySelectorAll('#reinfs button'), function (b) { b.className = b.dataset.r === REINF_MODE ? 'on' : ''; }); if ($('fleetN')) fleetUI(); }
[].forEach.call(document.querySelectorAll('#reinfs button'), function (b) { b.onclick = function () { REINF_MODE = b.dataset.r; reinfShow(); }; });
reinfShow();
/** 主選單：開局距離（滑桿，04_state.js LIM_DIST）。開局才用 ⇒ 改了下一場生效。 */
function distShow() { var d = $('dist'); d.value = DIST; $('distV').textContent = DIST + ' m（船頭到船頭）'; }
(function () { var d = $('dist'); d.min = LIM_DIST[0]; d.max = LIM_DIST[1]; d.oninput = function () { DIST = Math.round(+d.value); distShow(); }; distShow(); })();
[].forEach.call(document.querySelectorAll('#sails button'), function (b) { b.onclick = function () { setSailMode(b.dataset.s); }; });
[].forEach.call(document.querySelectorAll('#modes button'), function (b) { b.className = b.dataset.m === MODE ? 'on' : ''; });   // 模式的預設照設定檔（menu.mode）
setSailMode(SAIL); setCamTrack(true); $('physT').classList.toggle('on', PHYS);
$('go').onclick = start;
$('endC').onclick = function () { $('end').className = ''; };
$('endR').onclick = function () { RUNNING = false; $('end').className = ''; $('cover').style.display = ''; };


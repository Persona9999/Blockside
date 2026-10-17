// ───────────────────────── 開局 ─────────────────────────
function reset() {
  END_AT = 0; END_WAIT = null;
  rngReset(); SH_STAT.cut = SH_STAT.tris = 0; FLOOD_LV = PHX.flood; WP_STAT.spray = WP_STAT.foam = 0; WP_STAT.src = {}; DEB_ACC = PT_ACC = 0; SIMT = 0; windInit(); stepWind(0); vxInit();   // 開局的風：這一場的風向、風速（08_weather.js windInit）              // 碎木、水花、進水粒子的亂數，少生的節拍跟著重設（12_effects.js、13_water.js、33_flood.js）；進水模式在這裡定（戰鬥中改了下一場生效）
  SHIPS.forEach(function (sh) { sh.rs.dispose(); armDispose(sh); });   // armDispose：砲帶的裝甲（24_armor.js）
  PIECES.forEach(function (pc) { if (pc.rs) pc.rs.dispose(); });   // 無頭：碎塊沒掛網格（62_simview.js）
  SHIPS = []; PIECES = []; BALLS = []; EVENTS = []; FLY = []; BOOMS = []; SELFB = []; BLASTS = []; D.n = 0; PT.n = 0; WS.n = WF.n = 0; SIMT = 0; OVER = false; PAUSED = false;   // 彈種（AMMO_I）重開時保留（Tim 2026-10-12）
  clearMsgs(); fleetReset();                                          // 上方艦隊：每一場開局全折疊（61_hud.js）
  rptReset(); tlgReset(); if ($('rpt')) $('rpt').style.display = 'none';   // tlgReset：測試模式的船員記錄（83_testlog.js）          // 戰鬥報表（79_report.js）：每一場從頭記
  PSLOW.ts = 1; PSLOW.ms = 0;                                         // 物理減速（73_slowmo.js）：重開從 1× 起、重新量
  SLOW.active = false; SLOW.ts = 1; SLOW.t = 0; SLOW.camSave = null; SLOW.kicks = 0;   // 殉爆的慢動作與特寫（73_slowmo.js）：⛔ 不清 ⇒ 殉爆、自爆後馬上重開，新的一局接著慢、幾秒後鏡頭被拉回上一局的爆心
  PLAYER_I = 0;
  spawnFleet(fleetSpec());                                           // 編隊（52_fleet.js）：一對一 ＝ 以前那兩艘、同一個位置；船型要先載好（loadHull）
  cmdReset(); cmdTick();                                             // 指揮官（52_fleet.js、53_commander.js）：開局先想一次
  pickFoes();
  KEYS.l = KEYS.r = false;
  if (MODE !== LAST_MODE) { setAutoFire(modeRule('autoFire')); LAST_MODE = MODE; }   // 自動開砲：換了模式才套預設（玩法規則 autoFire，04_modes.js：觀戰開、其他關），同一個模式重開保留（Tim 2026-10-12）
  SHIPS.forEach(function (sh) { stepShip(sh, 0); survey(sh); });
  RAM_EV = []; hitWarm();                                                            // 船隻碰撞的取樣先建好（31_sailing.js；⛔ 第一次碰到才建 ⇒ 撞上那一刻卡約 0.1 秒）
  pickCaptains();                                                    // 砲長（51_captain.js）
  obsReset();                                                        // 觀察模式（透視、剖面、隱藏甲板；72_floodui.js）：繼續後會留著 ⇒ 新開一局才收
  camStart();                                                        // 開局的鏡頭（03_camera.js：鏡頭只由那一支檔寫）
}

// ── 遊戲狀態（在跑 RUNNING、停格 PAUSED、玩法 MODE）只由這一支檔寫（TASK-0669 ③）：其他檔要改 ⇒ 叫這三個（admin.py 建置擋別的檔直接寫）。
function flowRun(on) { RUNNING = on; }
function flowPause(on) { PAUSED = on; }
function flowMode(m) { MODE = m; }

function start() {
  initAudio(); if (AC && AC.state === 'suspended') AC.resume();
  $('cover').style.display = 'none'; $('end').className = '';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // 不然空白鍵會再按一次「開戰」
  reset(); RUNNING = true;
  var seenT = {}; SHIPS.forEach(function (sh) { if (!seenT[sh.T.id]) { seenT[sh.T.id] = 1; crewShortNote(sh); } });   // 船員站不下：每一型報一次
  if (modeRule('hint')) note(SHIPS[PLAYER_I], AUTOFIRE ? '自動開砲中（' + keyName('autoFire') + ' 關掉就自己打）' : '點敵艦設瞄準點，' + keyWord('volley') + '齊射（' + keyName('autoFire') + ' 自動開砲）');
  bldEnter();                                                        // 建造（82_build.js）：進第一人稱、顯示建造介面；別的玩法 ⇒ 收起來
  fpKeep();                                                          // 第一人稱（81_fps.js）：玩家開著 ⇒ 重新開始、下一場都維持
  if (WX.aim) note(SHIPS[PLAYER_I], '暴風雨：浪大、風強 —— 船晃得越兇砲越散，舵也難使');
}


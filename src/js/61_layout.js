// ───────────────────────── 介面配置：每種玩法、第一人稱各一份（TASK-0742） ─────────────────────────
// 區塊職責：遊戲中的 HUD 哪些區塊看得見，照「現在是哪一份配置」一次決定（Tim 2026-10-22「讓UI可以根據模式重新配置 海戰模式 航行模式 建築模式 還有第一人稱都有各自的配置」）。
// 物理意義：以前每種狀態各自往 #stage 掛 class（fp、townMode…）、CSS 一條一條藏（#stage.fp .hud:not(#botC)…、#stage.fp #keys > :not(#pauseK)…、#twbK{display:none}）
//   ⇒ 現在一張表：配置 ＝ 看得見的區塊清單（白名單）；不在清單裡的區塊加 .uiOff（display:none !important，壓過 hud() 寫的行內 display）。
//   選哪一份：第一人稱（FP.on）⇒ fp／shipbuild；不然照玩法規則 ui（04_modes.js）。城鎮的 🔨 常駐、當開關（2026-10-23 起；以前只在建築選單收起來時出現）。
//   這張表只管「准不准看得見」：面板自己什麼時候出現（#stage.fp 的 #fpUI、#stage.bld 的快捷欄、#stage.twb 的建築選單、hud() 的砲位圖）照舊由各自的狀態決定。
// 失敗處置：配置名不在表裡 ⇒ 照 battle；區塊的元素不在頁面上 ⇒ 跳過。每格都問（90_main.js frame），配置沒變就什麼都不做。
var UI_GROUPS = {
  fleet: ['fleetL', 'fleetR'],      // 上方兩角的艦隊圓鈕
  top: ['topC'],                    // 上方中間：FPS、詳細資訊、廣播、砲位圖
  tele: ['teleBox'],                // 俥鐘（有額外動力的船才有）
  tip: ['tip'],                     // 按鈕的說明框
  badge: ['slowB', 'obsB'],         // 物理放慢、觀察中的小牌子
  frz: ['frz', 'floodp'],           // 停格條、進水圖表
  nav: ['navBox'],                  // 羅盤與兩舷的砲位
  helm: ['helmL', 'helmR'],         // 下排左右：舵、帆、錨、開砲
  guns: ['guns', 'ammo'],           // 下排中間的砲、彈種
  kTown: ['twbK'],                  // 🔨 城鎮的建築選單
  kCam: ['camK'],                   // 🎥 換鏡頭
  kPause: ['pauseK'],               // ⏸ 停格
  kSet: ['setB'],                   // ⚙ 設定
  kAnc: ['ancAll'],                 // ⚓⚓ 雙錨
  kGlobe: ['hostBack']              // 🌍 回到地球儀（另外要 body.bsHost：只有地球儀開的才有）
};
var UI_SHIP = ['fleet', 'top', 'tele', 'tip', 'badge', 'frz', 'nav', 'helm', 'guns', 'kCam', 'kPause', 'kSet', 'kAnc', 'kGlobe'];
var UI_LAYOUT = {
  battle: UI_SHIP,                  // 對戰電腦、觀戰、沙盒
  sail: UI_SHIP,                    // 航海：先跟海戰一樣（要藏什麼改這一行）
  observe: UI_SHIP,                 // 船隻觀察：跟海戰一樣，另有觀察面板（86_inspect.js）
  fp: ['kPause', 'kSet'],           // 第一人稱：只留 ⏸、⚙（#fpUI 照 #stage.fp 出現；Tim 2026-10-16「只保留設定紐 暫停紐」）
  shipbuild: ['kPause', 'kSet'],    // 造船（第一人稱鎖定）：同第一人稱，快捷欄照 #stage.bld 出現
  // 城鎮（Tim 2026-10-22「建築模式預設就開啟建築選單 隱藏船隻相關操作(只保留設定按鈕 回到地球儀按鈕)」）：停格條留著（P 照樣能停格，要看得出停了）
  town: ['kSet', 'kGlobe', 'tip', 'frz']
};
var UI = { sig: '', el: null, name: '' };
/** 現在該用哪一份配置。 */
function uiLayoutName() {
  if (typeof FP !== 'undefined' && FP.on) return typeof BLD !== 'undefined' && BLD.on ? 'shipbuild' : 'fp';
  var n = modeRule('ui'); return UI_LAYOUT[n] ? n : 'battle';
}
/** 照配置加減 .uiOff（每格叫；配置沒變 ⇒ 什麼都不做）。 */
function uiLayout() {
  var name = uiLayoutName(), menu = name === 'town' && typeof TWB !== 'undefined' && TWB.on, sig = name + (menu ? '+menu' : '');
  if (sig === UI.sig) return;
  if (!UI.el) { UI.el = {}; Object.keys(UI_GROUPS).forEach(function (g) { UI.el[g] = UI_GROUPS[g].map(function (id) { return document.getElementById(id); }).filter(Boolean); }); }
  var show = UI_LAYOUT[name].slice(); if (name === 'town') show.push('kTown');   // 🔨 常駐（開關鈕；開著 ⇒ #stage.twb 亮底）—— Tim 2026-10-23「建築模式按鈕希望改成常駐的Toggle按鈕」
  Object.keys(UI_GROUPS).forEach(function (g) { var off = show.indexOf(g) < 0; UI.el[g].forEach(function (el) { el.classList.toggle('uiOff', off); }); });
  var st = document.getElementById('stage'); if (st) st.dataset.ui = name;
  UI.sig = sig; UI.name = name;
}

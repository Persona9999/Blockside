// ───────────────────────── 遊戲中面板統一控制器（互斥、模式生命週期、Esc 序、通知外層） ─────────────────────────
// 區塊職責：遊戲裡浮動／覆蓋面板（設定、說明、畫質設定、旗號、停格進水圖表、城鎮資訊、城區、建築選單、點建築）全部註冊在這裡：
//   ① 開任一互斥面板前叫 uiPanelWillOpen(id) ⇒ 同群組其他開著的自動收掉；
//   ② 換玩法／每格叫 uiPanelSync('mode') ⇒ 照 rule / allow 把不該留著的面板收掉（例：離開城鎮模式自動關閉城區、建造與城鎮面板）；
//   ③ 按 Esc 叫 uiPanelEsc() ⇒ 照 escPri 由大到小問開著的面板；
//   ④ 回主選單／重開叫 uiPanelCloseAll('reset') ⇒ 全收；
//   ⑤ 外層地球儀是否收起時間列問 uiPanelPageOpen()（取代散在各處的手寫聯集）。
var UI_PANELS = [];
var UI_PANELS_BY_ID = {};
var UI_PANELS_CLOSING = false;

/** 註冊一個遊戲中面板；同名 id 覆蓋舊項，依 escPri 由大到小排列。 */
function uiPanelAdd(spec) {
  var entry = {
    id: spec.id,
    group: spec.group || 'main',
    escPri: spec.escPri || 0,
    rule: spec.rule || null,
    allow: spec.allow || null,
    hideHostTime: !!spec.hideHostTime,
    isOpen: spec.isOpen,
    close: spec.close,
    esc: spec.esc || null
  };
  UI_PANELS = UI_PANELS.filter(function (p) { return p.id !== entry.id; });
  UI_PANELS_BY_ID[entry.id] = entry;
  UI_PANELS.push(entry);
  UI_PANELS.sort(function (a, b) { return b.escPri - a.escPri; });
  return entry;
}

/** 此面板在目前玩法與環境下是否允許保持開啟。 */
function uiPanelAllowed(panel) {
  if (panel.rule && !modeRule(panel.rule)) return false;
  if (panel.allow && !panel.allow()) return false;
  return true;
}

/** 開啟指定面板前呼叫：關閉同群組其他已開啟的面板（重入保護避免連鎖關閉反彈）。 */
function uiPanelWillOpen(id) {
  var target = UI_PANELS_BY_ID[id], grp = target ? target.group : 'main';
  if (!grp || UI_PANELS_CLOSING) return;
  UI_PANELS_CLOSING = true;
  try {
    for (var i = 0; i < UI_PANELS.length; i++) {
      var p = UI_PANELS[i];
      if (p.id !== id && p.group === grp && p.isOpen()) p.close('other');
    }
  } finally {
    UI_PANELS_CLOSING = false;
  }
}

/** 依 id 關閉單一面板。 */
function uiPanelClose(id, reason) {
  var p = UI_PANELS_BY_ID[id];
  if (p && p.isOpen()) p.close(reason || 'manual');
}

/** 關閉所有已開啟的面板（回主選單、重新開始時呼叫）。 */
function uiPanelCloseAll(reason) {
  if (UI_PANELS_CLOSING) return;
  UI_PANELS_CLOSING = true;
  try {
    for (var i = 0; i < UI_PANELS.length; i++) {
      var p = UI_PANELS[i];
      if (p.isOpen()) p.close(reason || 'reset');
    }
  } finally {
    UI_PANELS_CLOSING = false;
  }
}

/** 檢查並關閉不再符合目前玩法規則的已開啟面板（modeSwitch 與每格 frame 呼叫）。 */
function uiPanelSync(reason) {
  for (var i = 0; i < UI_PANELS.length; i++) {
    var p = UI_PANELS[i];
    if (p.isOpen() && !uiPanelAllowed(p)) p.close(reason || 'mode');
  }
}

/** 按下 Esc 時依 escPri 由高到低交由第一個接住的已開啟面板處理。 */
function uiPanelEsc() {
  for (var i = 0; i < UI_PANELS.length; i++) {
    var p = UI_PANELS[i];
    if (!p.isOpen()) continue;
    if (p.esc) {
      if (p.esc()) return true;
    } else if (p.escPri > 0) {
      p.close('esc');
      return true;
    }
  }
  return false;
}

/** 是否有需要讓宿主暫時收起時間列的面板正在開啟。 */
function uiPanelPageOpen() {
  for (var i = 0; i < UI_PANELS.length; i++) {
    if (UI_PANELS[i].hideHostTime && UI_PANELS[i].isOpen()) return true;
  }
  return false;
}

/** 讀數用：目前開啟中與已註冊的面板 id（__game.panels）。 */
function uiPanelState() {
  return {
    open: UI_PANELS.filter(function (p) { return p.isOpen(); }).map(function (p) { return p.id; }),
    all: UI_PANELS.map(function (p) { return p.id; })
  };
}

// 遊戲中面板統一控制器（js/61_panels.js）與城區／建造互斥及出航自動關閉回歸測試
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const source = name => fs.readFileSync(path.join(__dirname, '../js/', name), 'utf8');

function makeClassList() {
  const s = new Set();
  return {
    add: (...c) => c.forEach(x => s.add(x)),
    remove: (...c) => c.forEach(x => s.delete(x)),
    toggle: (c, force) => (force === undefined ? !s.has(c) : !!force) ? (s.add(c), true) : (s.delete(c), false),
    contains: c => s.has(c),
  };
}

const els = new Map();
function el(id) {
  if (!els.has(id)) {
    els.set(id, {
      id,
      style: {},
      innerHTML: '',
      textContent: '',
      dataset: {},
      className: '',
      classList: makeClassList(),
      children: [],
      onclick: null,
      checked: false,
      scrollTop: 0,
      addEventListener() {},
      remove() {},
      appendChild() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
    });
  }
  return els.get(id);
}

const listeners = { window: {}, document: {} };
const notes = [];
const hostMsgs = [];
const layouts = [];
let ctx;

ctx = {
  Math, JSON, Object, Array, Set, Map, URLSearchParams, performance: { now: () => 1000 },
  setTimeout: () => 0,
  Q: new URLSearchParams('mode=town&town=seville'),
  DEMO: -1,
  RUNNING: true,
  PAUSED: false,
  MODE: 'town',
  RELOAD: 1,
  RELOAD_SANDBOX: 1,
  PLAYER_I: 0,
  SHIPS: [{ i: 0, px: 0, pz: 0, yaw: 0, sunk: false, team: 'blue', T: { id: 'sloop' }, cfg: { base: 0 } }, { i: 1, px: 50, pz: 0, yaw: 0, sunk: false, team: 'blue', T: { id: 'sloop' }, cfg: { base: 0 } }],
  SAIL: 'manual',
  CTRLS: [],
  FP: { on: false },
  FLX3: false,
  HELP: { open: false, paused: false },
  CUTV: { half: false, deck: 0 },
  PREF_GFX: {},
  prefsSaveOnly: () => {},
  gfxShow: () => {},
  gsetShow: () => {},
  sndApply: () => {},
  sigShow: () => {},
  sigSet: () => {},
  isOut: o => !!o.sunk,
  SIG_LIST: [],
  SIGNAL: null,
  sigText: () => '各自進攻',
  xrayToggle: () => { ctx.FLX3 = !ctx.FLX3; },
  frzPlace: () => {},
  floodPanel: () => {},
  deckLabel: () => '甲板',
  battleIconText: x => x,
  prefsApply: () => {},
  start: () => {},
  selfDestruct: () => false,
  flowPause: on => { ctx.PAUSED = !!on; },
  flowMode: m => { ctx.MODE = m; },
  flowRun: on => { ctx.RUNNING = !!on; },
  evOn: () => {},
  evEmit: () => {},
  note: (sh, txt) => notes.push(txt),
  ctrlAdd: c => ctx.CTRLS.push(c),
  bedHostMenuGo: () => false,
  shellCall: () => false,
  fightLeft: () => '交戰中',
  fightFoes: () => [],
  BED: { host: { postMessage: m => hostMsgs.push(m) }, ax: 0, az: 0 },
  CAM: { mode: 0, dist: 120, yaw: 0, pitch: 0.5, track: false, aoff: 0.35, tr: null },
  camSet: () => {},
  uiLayout: () => layouts.push(ctx.MODE),
  bedHostSay: (k, v) => hostMsgs.push({ kind: k, data: v }),
  dockReady: () => ({ why: 'ok' }),
  dockGo: () => {},
  dockStop: () => {},
  dockTownName: id => id,
  applySailSet: () => {},
  townHitAt: () => ctx._hit || null,
  townDistGo: (tw, id) => { ctx.TOWNS.dist[tw] = id; return true; },
  townDistFrame: () => {},
  TOWNS: {
    full: { seville: { districts: [{ id: 'd1', name: '中心城區' }, { id: 'd2', name: '港口區', port: true }] } },
    dist: { seville: 'd1' },
    onD: { seville: 1 },
    stat: { dist: { seville: { on: ['d1'], lots: 12, roads: 8 } } },
    list: [],
  },
  TWB: { on: false, town: 'seville', open: 2, unit: 'seville', start: null, dstart: null, tr: null, moved: true, sel: null },
  twbOk: () => ctx.modeRule('town'),
  twbTown: () => null,
  twbUnit: () => 'seville',
  twbBind: () => {},
  twbUI: () => {},
  twbAsk: () => {},
  twbMsg: () => {},
  twbRoadReset: r => { ctx.TWB.start = null; ctx.TWB.dstart = null; },
  twbMenuSet: () => {},
  $: id => el(id),
  window: {
    addEventListener(ev, fn) { (listeners.window[ev] = listeners.window[ev] || []).push(fn); },
  },
  document: {
    body: { classList: makeClassList() },
    documentElement: { classList: makeClassList() },
    getElementById: id => el(id),
    querySelectorAll: () => [],
    addEventListener(ev, fn) { (listeners.document[ev] = listeners.document[ev] || []).push(fn); },
  },
};
vm.createContext(ctx);

// 1. 玩法規則表 + 面板管理器本體
const modesSrc = source('04_modes.js');
vm.runInContext(modesSrc.slice(modesSrc.indexOf('var MODE_BASE'), modesSrc.indexOf('// ?mode=<玩法>')), ctx);
vm.runInContext(modesSrc.slice(modesSrc.indexOf('function modeRule('), modesSrc.indexOf('\n', modesSrc.indexOf('function modeRule(')) + 1), ctx);
vm.runInContext(source('61_panels.js'), ctx);

// 2. 89_townui.js（城鎮資訊 + 城區）
const tuiSrc = source('89_townui.js');
vm.runInContext(tuiSrc.slice(tuiSrc.indexOf('var TUI ='), tuiSrc.indexOf('function tuiLevelHTML(')), ctx);
vm.runInContext(`
  function tuiLoad() {}
  function tuiUI() { el('tuiP').innerHTML = TUI.open ? '<div>tui</div>' : ''; }
  function fpEscEaten() { return false; }
`, ctx);
vm.runInContext(tuiSrc.slice(tuiSrc.indexOf('var TUID ='), tuiSrc.indexOf('/** 滑鼠按住面板的內容上下拖')), ctx);
vm.runInContext(tuiSrc.slice(tuiSrc.indexOf('ctrlAdd({ name: \'townui\'')), ctx);

// 3. 87_townbuild.js（城鎮建築選單 twbToggle + twbEscEaten + 註冊）
const twbSrc = source('87_townbuild.js');
vm.runInContext(twbSrc.slice(twbSrc.indexOf('function twbToggle('), twbSrc.indexOf('function twbPick(')), ctx);
vm.runInContext(twbSrc.slice(twbSrc.indexOf('function twbEscEaten('), twbSrc.indexOf('/** 鍵：B 開關選單')), ctx);
vm.runInContext(twbSrc.slice(twbSrc.indexOf("uiPanelAdd({ id: 'townBuild'")), ctx);

// 4. 89_townbld.js（點建築面板 TBI + tbiClose + tbiTap + 註冊）
const tbiSrc = source('89_townbld.js');
vm.runInContext('var TBI = { open: false, hit: null, b: null, seq: 0, msg: "", goods: {}, rcp: null, busy: false, pn: null, demo: false, sdemo: false, fsel: -1, fmsg: "" };', ctx);
vm.runInContext(tbiSrc.slice(tbiSrc.indexOf('function tbiSelQ('), tbiSrc.indexOf('/** 問那一頁這一棟的帳')), ctx);
vm.runInContext('function tbiLoad() {}', ctx);
vm.runInContext(tbiSrc.slice(tbiSrc.indexOf("uiPanelAdd({ id: 'townBld'")), ctx);

// 5. 71_input.js（Esc + menuGo + GSET / GFXOV / HELP / sig + 註冊）
const inpSrc = source('71_input.js');
vm.runInContext(inpSrc.slice(inpSrc.indexOf("window.addEventListener('keydown'"), inpSrc.indexOf('/** 鍵盤按著')), ctx);
vm.runInContext(inpSrc.slice(inpSrc.indexOf('function menuGo('), inpSrc.indexOf('function doAct(')), ctx);
vm.runInContext(inpSrc.slice(inpSrc.indexOf('var GSET ='), inpSrc.indexOf('function gfxUI(')), ctx);
vm.runInContext(inpSrc.slice(inpSrc.indexOf('var HELP ='), inpSrc.indexOf('$(\'helpBg\').onclick')), ctx);
vm.runInContext(inpSrc.slice(inpSrc.indexOf('function sigCan('), inpSrc.indexOf('if ($(\'sigX\'))')), ctx);
vm.runInContext(inpSrc.slice(inpSrc.indexOf("uiPanelAdd({ id: 'gfxov'")), ctx);

// 6. 72_floodui.js（floodOpen / floodClose / floodToggle / frzShow + 註冊）
const flSrc = source('72_floodui.js');
vm.runInContext(flSrc.slice(flSrc.indexOf('var FLX ='), flSrc.indexOf('function frzPlace(')), ctx);
vm.runInContext(flSrc.slice(flSrc.indexOf('function xrayToggle('), flSrc.indexOf('$(\'frzFlood\').onclick')), ctx);
vm.runInContext(flSrc.slice(flSrc.indexOf("uiPanelAdd({ id: 'flood'")), ctx);

// 7. 88_modeswitch.js（modeWhy / modeSwitch）
const msSrc = source('88_modeswitch.js');
vm.runInContext(msSrc.slice(msSrc.indexOf('var MODE_START ='), msSrc.indexOf('function dockAsk(')), ctx);

const esc = () => listeners.window.keydown.forEach(fn => fn({ key: 'Escape', code: 'Escape', target: { tagName: 'BODY' }, preventDefault() {} }));

// ─── 測試 1：城區面板切換到航海模式自動關閉，且即使強行打開也能關得掉 ───
ctx.tuiDistToggle(true);
assert.equal(ctx.TUID.open, true);
assert.ok(el('stage').classList.contains('tuiD'));
assert.ok(el('tuiDP').innerHTML.includes('中心城區'));

// 從城鎮切換到航海 ⇒ uiPanelSync('mode') 自動關閉城區，且不吐錯誤訊息
notes.length = 0;
const swErr = ctx.modeSwitch('sail', { out: true });
assert.equal(swErr, null);
assert.equal(ctx.MODE, 'sail');
assert.equal(ctx.TUID.open, false, 'switching town -> sail must auto-close district panel');
assert.equal(el('stage').classList.contains('tuiD'), false);
assert.equal(el('tuiDP').innerHTML, '');

// 假設航海中因故仍為開著（過去殘留狀態）：✕、tuiDistClose()、tuiDistToggle(false)、Esc 全部關得掉且不報「要從地球儀停靠進城」
ctx.TUID.open = true; el('stage').classList.add('tuiD'); el('tuiDP').innerHTML = 'stale';
notes.length = 0;
ctx.tuiDistToggle(false);
assert.equal(ctx.TUID.open, false, 'tuiDistToggle(false) must close even when !tuiOk()');
assert.equal(notes.length, 0, 'closing must not warn !tuiOk()');

ctx.TUID.open = true; el('stage').classList.add('tuiD'); el('tuiDP').innerHTML = 'stale';
esc();
assert.equal(ctx.TUID.open, false, 'Esc must close district panel even in sail mode');

// 進回城鎮測試點 #tuiDX 的 handler 在模式切換後依然直接叫 tuiDistClose
ctx.flowMode('town');
ctx.tuiDistToggle(true);
const dxBtn = el('tuiDX');
ctx.flowMode('sail');
assert.equal(typeof dxBtn.onclick, 'function');
dxBtn.onclick();
assert.equal(ctx.TUID.open, false, '#tuiDX click must close even if mode changed before frame sync');

// ─── 測試 2：開啟其他面板時，城區與建造面板皆自動關閉（全互斥檢查） ───
ctx.flowMode('town');
const openers = [
  ['gset', () => ctx.gsetOpen(), () => ctx.gsetClose()],
  ['help', () => ctx.helpOpen(), () => ctx.helpClose()],
  ['gfxov', () => ctx.gfxOvOpen(), () => ctx.uiPanelClose('gfxov', 'reset')],
  ['townUI', () => ctx.tuiToggle('sum'), () => ctx.tuiClose()],
  ['townBuild', () => ctx.twbToggle(true), () => ctx.twbToggle(false)],
  ['townBld', () => { ctx._hit = { q: 'q1', lot: { id: 'lot1' } }; ctx.tbiTap(10, 10, 0); }, () => ctx.tbiClose()],
  ['flood', () => { ctx.PAUSED = true; ctx.floodOpen(); }, () => { ctx.floodClose(); ctx.PAUSED = false; }],
  ['sig', () => ctx.sigToggle(true), () => ctx.sigToggle(false)],
];

for (const [name, openOther, closeOther] of openers) {
  ctx.uiPanelCloseAll('reset');
  if (name !== 'townBuild') {
    // 先開城區 ⇒ 再開 other ⇒ 城區必須自動關掉
    ctx.tuiDistToggle(true);
    assert.equal(ctx.TUID.open, true);
    openOther();
    assert.equal(ctx.TUID.open, false, `opening ${name} must close townDist`);
    assert.deepEqual(ctx.uiPanelState().open, [name], `only ${name} should remain open`);
    closeOther();
  }
  if (name !== 'townBuild' && name !== 'townBld') {
    // 先開建造 ⇒ 再開 other ⇒ 建造必須自動關掉
    ctx.twbToggle(true);
    assert.equal(ctx.TWB.on, true);
    openOther();
    assert.equal(ctx.TWB.on, false, `opening ${name} must close townBuild`);
    assert.deepEqual(ctx.uiPanelState().open, [name], `only ${name} should remain open over townBuild`);
    closeOther();
  }
}

// 開建造時會關閉點建築；反之若建造關閉後點建築會關閉其他開著的面板
ctx.tuiToggle('trade');
assert.equal(ctx.TUI.open, true);
ctx._hit = { q: 'q2', lot: { id: 'lot2' } };
ctx.tbiTap(10, 10, 0);
assert.equal(ctx.TUI.open, false, 'tbiTap must close townUI');
assert.equal(ctx.TBI.open, true);

// ─── 測試 3：gfxov 關閉原因區分（Esc/返回重開設定、因開他頁/重開則不回跳設定） ───
ctx.uiPanelCloseAll('reset');
ctx.gsetOpen();
assert.equal(ctx.GSET.open, true);
ctx.gfxOvOpen();
assert.equal(ctx.GSET.open, false);
assert.equal(ctx.GFXOV.open, true);
esc(); // Esc 關畫質 ⇒ 回到設定
assert.equal(ctx.GFXOV.open, false);
assert.equal(ctx.GSET.open, true, 'Esc on gfxov reopens gset');

ctx.gfxOvOpen();
ctx.tuiToggle('sum'); // 開城鎮面板（允許條件為 town）⇒ 畫質關掉且不彈回設定
assert.equal(ctx.GFXOV.open, false);
assert.equal(ctx.GSET.open, false, 'opening another panel from gfxov must NOT reopen gset');
assert.equal(ctx.TUI.open, true);

// ─── 測試 4：Esc 優先序與建造模式先放掉選取再進設定 ───
ctx.uiPanelCloseAll('reset');
ctx.twbToggle(true);
ctx.TWB.sel = { q: { k: 'house' } };
esc(); // 第一下 Esc：放掉選取，建造選單還留著
assert.equal(ctx.TWB.sel, null);
assert.equal(ctx.TWB.on, true);
esc(); // 第二下 Esc：不吃 ⇒ 開設定，並自動收掉建造選單
assert.equal(ctx.GSET.open, true);
assert.equal(ctx.TWB.on, false, 'opening gset via Esc must auto-close townBuild');

// ─── 測試 5：uiPanelPageOpen（宿主時間條收合判定） ───
ctx.uiPanelCloseAll('reset');
assert.equal(ctx.uiPanelPageOpen(), false);
ctx.tuiDistToggle(true);
assert.equal(ctx.uiPanelPageOpen(), false, 'floating district panel does not hide host time bar');
ctx.tuiToggle('sum');
assert.equal(ctx.uiPanelPageOpen(), true, 'townUI hides host time bar');
ctx.tuiClose();
assert.equal(ctx.uiPanelPageOpen(), false);
ctx.gsetOpen();
assert.equal(ctx.uiPanelPageOpen(), true, 'gset hides host time bar');
ctx.menuGo();
assert.deepEqual(ctx.uiPanelState().open, [], 'menuGo must close all panels');

console.log(JSON.stringify({
  ok: true,
  panels: ctx.uiPanelState().all,
  openersTested: openers.length,
  modeSwitchAutoClose: true,
  sailForceCloseNoWarn: true,
  escPriorityAndGfxovVerified: true,
}));

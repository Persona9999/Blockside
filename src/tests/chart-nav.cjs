// 海圖模式的導航（TASK-1272；js/63_chart.js 檔尾）：跑真的 chartGo／chartLegGot／chartHelm／chartNavFrame、71_input.js 的 doAct 與 setSailMode、58_traffic.js 的 trafficAhead。
//   走過 Tim 2026-11-11 那三步：導航中打舵 ⇒ 手動（標記留著、不照路線開）；再開自動航行 ⇒ 從現在的位置重要一條路、繼續開往標記；到了 ⇒ 拋錨、標記收掉。
//   另外：外面那一頁回的路線開不到標記 ⇒ 說原因（陸地）；舊的回覆（seq 對不上）不收；不是 battle.html 的頁（沒有 BS_SHELL.chartNav）⇒ 海圖模式開不起來。
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const source = name => fs.readFileSync(path.join(__dirname, '../js/', name), 'utf8');
const sent = [], notes = [], cams = [];
const ship = { i: 0, px: 0, pz: 0, yaw: 0, sunk: false, anc: null };
const ctx = {
  Math, performance: { now: () => 1000 }, RUNNING: true, SIMT: 0, KEYS: {}, PLAYER_I: 0, SHIPS: [ship], SAIL: 'manual',
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)), note: (sh, t) => notes.push(t), keyName: () => 'X', keyWord: () => 'X',
  document: { querySelectorAll: () => [] }, $: () => null, window: {},
  BED: { host: { postMessage: m => sent.push(m) }, A: { chunk: 512, y: [0, 19] }, nx: 20, ax: 1000, az: 2000, win: null },
  CAM: { chart: null }, FP: { on: false }, HUDN: 0, CHART: { zoom: 2, need: 6.5 }, CHART_R: [500, 1000, 1500, 2500, 4000, 7000, 0],
  cv: { clientWidth: 1600, clientHeight: 900 }, TRF_LOOK_M: 300, DOCK_SLOW: 200, DOCK_VMIN: 0.7, DOCK_VMAX: 3.2,
  modeRule: k => k === 'chart', anchorsOf: () => ({ noAnchor: false, single: false }), anchorWeighAll: () => '', ctrlAdd() {},
  camChartSet: o => cams.push(o), bedCell: () => ({}), bedHgt: (x, z) => (x > 500 ? 12 : -30), bedWinR: () => 4, BED_WIN_SHIFT: 0.3
};
ctx.window.BS_SHELL = {};
vm.createContext(ctx);
const chart = source('63_chart.js'); vm.runInContext(chart.slice(chart.indexOf('var CNAV ='), chart.indexOf('/** 畫面上的路線與標記')), ctx);
const traffic = source('58_traffic.js'); vm.runInContext(traffic.slice(traffic.indexOf('function trafficAhead('), traffic.indexOf('/** 放掉一艘的網格')), ctx);
const input = source('71_input.js');
vm.runInContext(input.slice(input.indexOf('function shellCall('), input.indexOf('\n', input.indexOf('function shellCall('))), ctx);
vm.runInContext(input.slice(input.indexOf('var SAIL_NAMES'), input.indexOf('/** 自由鏡頭跟不跟著')), ctx);
vm.runInContext(input.slice(input.indexOf('function doAct('), input.indexOf("window.addEventListener('keyup'")), ctx);
vm.runInContext('function sailLabel() {}', ctx);
const line = (src, at) => src.slice(src.indexOf(at), src.indexOf('\n', src.indexOf(at)));
vm.runInContext(line(input, 'function sailToggle('), ctx);   // ☸ 自動 ⇄ 手動那一顆
const S = () => vm.runInContext('CNAV', ctx), sail = () => vm.runInContext('SAIL', ctx);

// 不是 battle.html（外殼沒掛 chartNav）⇒ 開不起來；掛了 ⇒ 開得起來（鏡頭高度照小地圖那一級：1.5 km ÷ tan 0.45）
assert.equal(ctx.chartMode(true), false); assert.equal(cams.length, 0);
ctx.window.BS_SHELL.chartNav = () => true;
assert.equal(ctx.chartMode(true), true); assert.ok(Math.abs(cams[0].H - 1500 / Math.tan(0.45)) < 1, 'opening height covers the minimap range');

// ① 設目的地 ⇒ 換自動航行、跟外面那一頁要路線（海域的往東、往南公尺：我艦 0,0 ＝ 1000,2000）
ctx.chartGo([1000, 400]);
assert.equal(sail(), 'auto'); assert.equal(sent.length, 1);
assert.deepEqual(sent[0], { bsmap: 'need', what: 'leg', seq: 1, from: [1000, 2000], to: [1000, 400] });
ctx.chartLegGot({ seq: 1, ok: true, pts: [[1000, 2000], [1000, 1200], [1000, 400]], need: 10.5 });
assert.equal(S().pts.length, 3); assert.deepEqual(S().pts[2], [0, -1600]);
let h = ctx.chartHelm(ship); assert.ok(Math.abs(h.yaw - Math.PI / 2) < 1e-9, 'heads north (−z)'); assert.equal(h.v, Infinity);

// ② 導航中打舵 ⇒ 手動（真的 doAct）⇒ 不照路線開、標記留著
ctx.doAct('ruddL', false);
assert.equal(sail(), 'manual'); assert.equal(ctx.chartHelm(ship), null);
ctx.chartNavFrame(); assert.deepEqual(S().to, [1000, 400], 'marker kept while manual'); assert.equal(sent.length, 1);

// ③ 船被開到旁邊，再開自動航行（☸ 那一顆 sailToggle）⇒ 從現在的位置重要一條路、繼續開往標記
ship.px = -300; ship.pz = -500;
ctx.sailToggle(); assert.equal(sail(), 'auto');
ctx.chartNavFrame(); assert.equal(sent.length, 2); assert.deepEqual(sent[1].from, [700, 1500]); assert.equal(sent[1].seq, 2);
ctx.chartLegGot({ seq: 1, ok: true, pts: [[0, 0], [1, 1]] }); assert.equal(S().pts, null, 'stale reply ignored');
ctx.chartLegGot({ seq: 2, ok: true, pts: [[700, 1500], [1000, 1000], [1000, 400]], need: 10.5 });
h = ctx.chartHelm(ship); assert.ok(h && h.yaw > 0 && h.yaw < Math.PI / 2, 'heads north-east back toward the route');

// ④ 到了（離終點 < 40 m）⇒ 拋錨、標記收掉
ship.px = 0; ship.pz = -1590;
assert.equal(ctx.chartHelm(ship), null); assert.equal(S().arr, true);
ctx.chartNavFrame(); assert.equal(sail(), 'off'); assert.equal(S().to, null); assert.ok(notes.some(t => /到了/.test(t)));

// ⑤ 點到陸地 ⇒ 開到最近開得到的地方、說原因
ctx.chartGo([1700, 2000]); assert.equal(sail(), 'auto');
ctx.chartLegGot({ seq: 3, ok: true, pts: [[1000, 2000], [1450, 2000]], snapped: true, need: 10.5 });
assert.equal(S().info.off, 250); assert.ok(/陸地/.test(S().why) && /250 m/.test(S().why), S().why);
// 外面那一頁算不出來 ⇒ 說、標記收掉
ctx.chartGo([900, 2000]); ctx.chartLegGot({ seq: 4, ok: false, why: '找不到航線' });
assert.equal(S().to, null); assert.ok(/找不到航線/.test(S().why));

console.log(JSON.stringify({ shellGate: 1, ask: sent.length, rudderToManual: 1, markerKept: 1, resumeReplans: 1, staleIgnored: 1, arriveAnchors: 1, snapWhy: S().why ? 1 : 0 }));

// 建築模式改城（townReplace 沿用舊的地面分區）⇒ 附屬的田照新規劃分回各區（63_towns.js townFieldTiles）
// Run: node src/tests/town_field_tiles.cjs
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../js/63_towns.js'), 'utf8');
const c = {}; vm.createContext(c);
vm.runInContext('var TOWN_GT_SZ = ' + /var TOWN_GT_MAX = \d+, TOWN_GT_SZ = (\d+)/.exec(src)[1] + ';', c);
const i0 = src.indexOf('function townFieldTiles('), i1 = src.indexOf('\nfunction ', i0 + 10);
vm.runInContext(src.slice(i0, i1), c);
const S = c.TOWN_GT_SZ;
function F(lot, cx, cz, crop) { return { lot, crop: crop || 'maize', a0: 0, a1: 4, b0: 0, b1: 8, R: [[cx - 2, cz - 4], [cx + 2, cz - 4], [cx + 2, cz + 4], [cx - 2, cz + 4]] }; }
function tile(k, field) { return { k, field: field || [], dirty: false, edit: false }; }
const old = F('L1', 10, 10), out = {};

// ① 沒變（打開建築模式時回的那一份）⇒ 沒有一區要重鋪（反向對照）
let T = { gt: { '0_0': tile('0_0', [old]), '1_0': tile('1_0') }, fields: [F('L1', 10, 10)] };
assert.deepEqual(c.townFieldTiles(T), []); assert(!T.gt['0_0'].dirty && !T.gt['1_0'].dirty);

// ② 蓋了一塊新的農莊（同一區）⇒ 那一區重鋪、田兩塊；別區不動
T = { gt: { '0_0': tile('0_0', [old]), '1_0': tile('1_0') }, fields: [F('L1', 10, 10), F('b5', 40, 30)] };
assert.deepEqual(c.townFieldTiles(T), ['0_0']); assert(T.gt['0_0'].dirty && T.gt['0_0'].edit); assert.equal(T.gt['0_0'].field.length, 2); assert(!T.gt['1_0'].dirty);
out.added = T.gt['0_0'].field.map(f => f.lot);

// ③ 田落在還沒有的區 ⇒ 開一區（dirty）
T = { gt: { '0_0': tile('0_0', [old]) }, fields: [F('L1', 10, 10), F('b6', S * 2 + 5, 5)] };
assert.deepEqual(c.townFieldTiles(T), ['2_0']); assert(T.gt['2_0'] && T.gt['2_0'].dirty && T.gt['2_0'].field.length === 1);

// ④ 拆掉、換作物 ⇒ 那一區重鋪
T = { gt: { '0_0': tile('0_0', [old]) }, fields: [] };
assert.deepEqual(c.townFieldTiles(T), ['0_0']); assert.equal(T.gt['0_0'].field.length, 0);
T = { gt: { '0_0': tile('0_0', [old]) }, fields: [F('L1', 10, 10, 'wheat')] };
assert.deepEqual(c.townFieldTiles(T), ['0_0']);

// ⑤ 還沒有分區（第一次）⇒ 不碰（townGroundPrep 自己分）
assert.deepEqual(c.townFieldTiles({ gt: null, fields: [old] }), []);
console.log(JSON.stringify(Object.assign(out, { unchanged: 0, newTile: '2_0', removed: true, recrop: true })));

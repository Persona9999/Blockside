// 建築裡的工人（TASK-0904；63_townfolk.js townWorkPrep／townWorkAt）：人數、誰、點、輪流去空的點、只照時間算。
// Run: node src/tests/townwork.cjs
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.resolve(__dirname, '../..');
const c = { Q: new URLSearchParams(''), performance, BED: { ax: 0, az: 0 }, TOWNS: { kit: null } }; c.window = c; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(root, 'src/js/63_towns.js'), 'utf8').split('\n').find(s => s.startsWith('function townHash(')), c);
vm.runInContext(fs.readFileSync(path.join(root, 'src/js/63_townfolk.js'), 'utf8'), c);

// 一個 10 × 10 m 的模型（0.1 m／格）：a 組三點、b 組一點（b 只有它自己 ⇒ 守著不動）
const pts = { 'lot-0': [0.5, 0.5, 0.5], door: [50.5, 0.5, 0.5], 'work-a1': [20.5, 50.5, 1.5], 'work-a2': [40.5, 50.5, 1.5], 'work-a3': [60.5, 50.5, 1.5], 'work-a1-to': [20.5, 60.5, 9.5], 'work-b1': [80.5, 80.5, 1.5] };
const m = { size: [100, 100, 60], mpv: 0.1, use: 'smithy', pts };
c.TOWNS.kit = { M: { 'common-smithy': { m }, 'house-a': { m: { size: [80, 120, 60], mpv: 0.1, use: 'house', pts: { door: [1, 1, 1] } } } } };
const people = [
  { id: 'smith_f_01', age: 'adult', work: ['smithy'] }, { id: 'smith_m_01', age: 'adult', work: ['smithy'] },
  { id: 'kid', age: 'child', work: ['smithy'] }, { id: 'soldier_m_01', age: 'adult', work: ['garrison'] }, { id: 'baker', age: 'adult', work: ['bakery'] }];
const F = { ch: 192, hpx: 164, people: people.map((p, i) => Object.assign({ height: 1.7, cloth: [1, 2], hair: [3] }, p)) };
function town(live, uses) {
  const lots = uses.map((u, i) => ({ id: 'L' + i, use: u, at: [0, 0], rot: 0, w: 10, d: 10 }));
  const inst = uses.map((u, i) => ({ k: u === 'house' ? 'house-a' : 'common-smithy', x: 100 + 30 * i, y: 5, z: 200, th: Math.PI / 2, sx: 1, lot: 'L' + i }));
  return { id: 't', p: { lots, live }, inst };
}
const out = {};

// ① 沒有城鎮帳 ⇒ 點數的一半（4 點 ⇒ 2 人）；住宅沒有 work-* ⇒ 不算；小孩不上工
let T = town(null, ['smithy', 'house']), W = c.townWorkPrep(T, F);
assert.equal(W.blds.length, 1); assert.equal(W.blds[0].n, 2); assert.equal(W.blds[0].src, 'half');
assert(W.list.every(a => F.people[a.art].age !== 'child' && F.people[a.art].work.includes('smithy')));
assert.notEqual(W.list[0].art, W.list[1].art, '同一棟不重複（立繪夠的時候）');
out.half = W.blds[0];

// ② 城鎮帳：L0 上了 3 人、L1 0 人（有帳就照帳，0 ＝ 沒人）；超過點數 ⇒ 到點數為止
T = town({ work: { L0: 3, L1: 0 } }, ['smithy', 'smithy']); W = c.townWorkPrep(T, F);
assert.deepEqual(W.blds.map(b => b.n), [3, 0]); assert.equal(W.blds[0].src, 'ledger');
T = town({ work: { L0: 99 } }, ['smithy']); W = c.townWorkPrep(T, F); assert.equal(W.blds[0].n, 4, '最多到點數');
out.ledger = [3, 0];

// ③ 點換到世界：th = 90°、模型中心在 (100, 200) ⇒ work-a1 (2.05, 5.05 m) ⇒ x = 100 + (2.05 − 5) × 1 − (5.05 − 5) × 0、z = 200 − 0 − (5.05 − 5) × 1；腳 ＝ y + (1.5 − 0.5) × 0.1
T = town({ work: { L0: 1 } }, ['smithy']); W = c.townWorkPrep(T, F);
const a = W.list[0], p = a.P[0];
assert(Math.abs(p.x - 97.05) < 1e-9 && Math.abs(p.z - 199.95) < 1e-9 && Math.abs(p.y - 5.1) < 1e-9, JSON.stringify(p));
assert(Math.abs(p.lx - 0) < 1e-9 && Math.abs(p.lz + 1) < 1e-9, '-to ⇒ 面向那一點');
out.point = { x: p.x, y: p.y, z: p.z };

// ④ 一人、a 組還有兩個空點 ⇒ 會走過去；只照時間（同一個 clock 同一個位置）；b 組守著
T = town({ work: { L0: 2 } }, ['smithy']); W = c.townWorkPrep(T, F);
const [w1, w2] = W.list;
assert.equal(w1.legs.length, 5); assert.equal(w2.legs.length, 5, 'a 組兩人、空點 a3 ⇒ 兩人共用、錯開');
let visit = [0, 0], both = 0, moved = 0;
for (let t = 0; t < 2000; t += 0.25) {
  c.townWorkAt(w1, t); c.townWorkAt(w2, t);
  const at1 = w1.at && w1.at.k, at2 = w2.at && w2.at.k;
  if (at1 === 'work-a3') visit[0]++; if (at2 === 'work-a3') visit[1]++;
  if (at1 && at1 === at2) both++;
  if (!w1.at) moved++;
  const d = Math.hypot(w1.x - w2.x, w1.z - w2.z); assert(d > 0.3 || !w1.at || !w2.at, '兩人站在同一點：' + t);
}
assert(visit[0] > 0 && visit[1] > 0, '兩人都輪到空點'); assert.equal(both, 0, '同一點同時兩人');
c.townWorkAt(w1, 123.4); const s1 = [w1.x, w1.z]; c.townWorkAt(w1, 999); c.townWorkAt(w1, 123.4); assert.deepEqual([w1.x, w1.z], s1, '只照時間');
out.share = { visits: visit, together: both, walkingSamples: moved };

// ⑤ 軍事建築：沒有人寫 fort ⇒ 找 garrison；?townwork=0 的對照組在 draw 裡（這裡不測畫）
T = town(null, ['fort']); T.inst[0].k = 'common-smithy'; W = c.townWorkPrep(T, F);
assert(W.list.length && W.list.every(a => F.people[a.art].id === 'soldier_m_01'));
// ⑥ 反向對照：模型沒有 work-* ⇒ 沒有人；沒有人會做那種工 ⇒ 不放（不拿別人頂）
T = town(null, ['house']); assert.equal(c.townWorkPrep(T, F).list.length, 0);
T = town(null, ['mine']); W = c.townWorkPrep(T, F); assert.equal(W.list.length, 0); assert.equal(W.blds[0].n, 0);
console.log(JSON.stringify(out));

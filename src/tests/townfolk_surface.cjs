// Run: node src/tests/townfolk_surface.cjs
// 鎮民的腳踩在畫出來的那一面（Tim 2026-10-27：廣場上的鎮民只露出頭）：路基抬高的路面、廣場的鋪面高過地形 ⇒ townFolkFootY 要跟 townGroundTile 畫出來的頂面一樣高。
// 不用瀏覽器：照 town_roads.cjs 抓地面分區上傳的網格，沿路網每一條邊（含車道偏移）取點，比鎮民的腳跟那一點最高的頂面。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const js = n => fs.readFileSync(path.join(__dirname, '../js', n), 'utf8');
const c = { Q: new URLSearchParams(), TREE_DITHER: '', TREE_FIELD_CARD: false, evOn: () => {}, performance, setTimeout, console };
vm.createContext(c); vm.runInContext(js('63_towns.js'), c); vm.runInContext(js('63_townfolk.js'), c);
c.BED = { ax: 0, az: 0, A: { chunk: 64 } }; c.TOWN_GT_SZ = 16;
c.townGpu9 = (V, I, bb) => ({ V, I, bb }); c.townGpuFree = () => {}; c.bedShowC = () => null;
const ground = (x, z) => 2 + 0.1 * x;                                    // 往東上坡：x ＝ 20 起地形比主路的規劃高
c.townRoadHeight = ground;
// 主路 x 0 → 40、規劃高 3 → 5（前半段路基高過地形）；支路往北進廣場（規劃高 4 → 6）；窄路往南上坡（路基比地形高）；廣場 10 × 10、h 6.5（高過四周的地形、也高過支路）
const roads = [
  { id: 1, kind: 'main', w: 6, P: [[0, 0], [40, 0]], z: [3, 5] },
  { id: 2, kind: 'street', w: 4, P: [[20, 0], [20, 24]], z: [4, 6] },
  { id: 3, kind: 'track', w: 2.5, P: [[33, 0], [36, -16]], z: [5, 7.5] },   // 窄路（< 3.5 m）⇒ 路面網格細分成 1 m
];
const plaza = { id: 'pz', use: 'plaza', at: [20, 18], w: 10, d: 10, rot: 0, h: 6.5 };
async function main() {
  const town = { id: 't', p: { lots: [plaza], quay: [], piers: [], stairs: [] }, roads, E: q => q, box: [-10, -10, 50, 40] };
  town.roadSurface = await c.townRoadSurface(roads);
  c.townGroundPrep(town);
  const meshes = Object.keys(town.gt).map(k => c.townGroundTile(town, town.gt[k])).filter(Boolean);
  const tops = [];                                                       // 頂面的三角形（法線朝上）
  for (const m of meshes) for (let f = 0; f < m.I.length; f += 3) {
    const P = [0, 1, 2].map(i => { const o = m.I[f + i] * 9; return [m.V[o], m.V[o + 1], m.V[o + 2], m.V[o + 4]]; });
    if (P.every(p => p[3] > 0.5)) tops.push(P);
  }
  function meshY(x, z) {                                                  // 那一點最高的頂面（沒有 ⇒ NaN）
    let y = NaN;
    for (const [a, b, d] of tops) {
      const det = (b[2] - d[2]) * (a[0] - d[0]) + (d[0] - b[0]) * (a[2] - d[2]); if (Math.abs(det) < 1e-12) continue;
      const l1 = ((b[2] - d[2]) * (x - d[0]) + (d[0] - b[0]) * (z - d[2])) / det, l2 = ((d[2] - a[2]) * (x - d[0]) + (a[0] - d[0]) * (z - d[2])) / det, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const v = l1 * a[1] + l2 * b[1] + l3 * d[1]; if (!(v <= y)) y = v;
    }
    return y;
  }
  const G = c.townFolkGraph(town);
  assert(G.edges.length >= 3, 'graph has the main road split at the junction and the branch');
  assert(G.edges.every(e => e.rk && e.rk.length), 'every edge knows the road segments under it');
  assert(G.edges.some(e => e.pk && e.pk.length), 'the branch knows the plaza');
  let narrow = 0, pts = 0, sunkOld = 0, worstOld = 0, worst = 0, onPlaza = 0, onRaised = 0;
  for (const e of G.edges) for (let t = 0.25; t < e.L; t += 0.5) for (const off of [-1.4, -0.6, 0, 0.6, 1.4]) {
    if (Math.abs(off) > (e.w - 1.2) / 2 + 1e-9) continue;                // 鎮民的車道偏移最多 (w − 1.2)／2（townFolkDraw）
    const x = e.ax + e.dx * t + e.nx * off, z = e.az + e.dz * t + e.nz * off, my = meshY(x, z);
    if (!(my === my)) continue;                                          // 路邊裁掉的那一點（網格外）
    const y = c.townFolkFootY(e, x, z), old = ground(x, z) + c.TOWN_ROAD_LIFT;
    if (e.w < 3.5) narrow++;
    pts++; worst = Math.max(worst, Math.abs(y - my)); worstOld = Math.max(worstOld, my - old); if (my - old > 0.3) sunkOld++;
    if (c.townFolkInRect(e.pk ? e.pk[0] : { ox: 1e9, oz: 1e9, ux: 1, uz: 0, uL2: 1, vx: 0, vz: 1, vL2: 1 }, x, z)) onPlaza++; else if (my - old > 0.3) onRaised++;
    assert(Math.abs(y - my) < 0.03, `foot ${y.toFixed(3)} vs drawn surface ${my.toFixed(3)} at ${x.toFixed(2)},${z.toFixed(2)}`);
  }
  assert(pts > 300, 'enough samples');
  assert(onPlaza > 20 && onRaised > 50 && narrow > 20, 'samples cover the plaza, the raised roadbed and the narrow road');
  assert(sunkOld > 50 && worstOld > 1, 'the old ground-only height really was buried here (otherwise this test proves nothing)');
  // 地形還沒到（NaN）⇒ 照規劃的路高（同路面的備援）；水面上、沒有路也沒有廣場 ⇒ NaN（不畫）
  c.townRoadHeight = () => NaN;
  const e0 = G.edges.find(e => !e.pk), x0 = e0.ax + e0.dx * 2, z0 = e0.az + e0.dz * 2;
  assert(Math.abs(c.townFolkFootY(e0, x0, z0) - (3 + 2 * x0 / 40 + c.TOWN_ROAD_LIFT)) < 0.05, 'missing terrain falls back to the plan height');
  c.townRoadHeight = () => 0; assert.ok(c.townFolkFootY({ ax: 0, az: 0 }, 0, 0) !== c.townFolkFootY({ ax: 0, az: 0 }, 0, 0), 'water without surfaces is not drawn');
  c.townRoadHeight = ground;
  console.log(JSON.stringify({ edges: G.edges.length, tops: tops.length, pts, onPlaza, narrow, onRaised, worstMismatch: +worst.toFixed(3), oldSunkPts: sunkOld, oldWorstSink: +worstOld.toFixed(2), checks: 'passed' }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });

// Geometry regression: junction union, bends, closed/duplicate paths, sloping terrain and late chunks.
// No browser/GPU needed: captures the actual renderer's uploaded mesh.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/63_towns.js'), 'utf8');
const events = {};
const c = { Q: new URLSearchParams(), TREE_DITHER:'', evOn: (n, f) => { events[n] = f; }, performance, setTimeout, console };
vm.createContext(c); vm.runInContext(source, c);
c.BED = { ax: 0, az: 0, A: { chunk: 64 } }; c.TOWN_GT_SZ = 8;   // 地面分區照 8 m（路口跨好幾區）
c.townGpu9 = (V, I, bb) => ({ V, I, bb }); c.townGpuFree = () => {};
c.bedShowC = () => null;   // 08_seabed.js 的「畫著的那一塊」：沒有 ⇒ townCell 照 bedCell（aeb8aec 起 townCell 先問它；這裡沒載海床 ⇒ 下面的 bedCell 假的那一份）
function road(P, w = 4) { return { P, z: P.map(() => 2), w, kind: 'street' }; }
function surface(roads) { return c.townRoadSurface(roads); }
// townRoadGen 的輸出是攤平的：v 每點 6 個（往東、往南、備援高度、rgb）、i 每三個一個三角形（TASK-0817）
const pt = (R, k) => [R.v[k*6], R.v[k*6+1], R.v[k*6+2]];
const tris = R => Array.from({ length: R.i.length/3 }, (_, f) => [R.i[f*3], R.i[f*3+1], R.i[f*3+2]]);
function area(R) { return tris(R).reduce((s, f) => { const [a, b, d] = f.map(k => pt(R, k)); return s + ((b[1]-a[1])*(d[0]-a[0])-(b[0]-a[0])*(d[1]-a[1]))/2; }, 0); }
function contains(R, x, z) {
  return tris(R).filter(f => {
    const P = f.map(k => pt(R, k));
    return P.every((a, i) => { const b = P[(i+1)%3]; return (b[1]-a[1])*(x-a[0])-(b[0]-a[0])*(z-a[1]) > 1e-8; });
  }).length;
}
async function main() {
const T = [road([[-12,0],[12,0]],6), road([[0,0],[0,12]],4)];
const R = await surface(T), doubled = await surface(T.concat(T));
assert.equal(area(R), area(doubled), 'overlapping roads must not create duplicate top faces');
for (let x=-2.7031; x<2.8; x+=.3137) for(let z=-2.713; z<3.8; z+=.29317) {
  if(z>2.7 && Math.abs(x)>1.7) continue;
  const n = contains(R,x,z); assert.equal(n,1,`junction gap/overlap at ${x},${z}`);
}
// 窄路（寬 < 3.5 m）經過的格細分成 1 m（Tim 2026-10-23：和平港的路「出現破損」—— 2 m 格上斜 30° 寬 2 m 的路只鋪到六成、碎成 20 段）：
//   路面裡每一點剛好一個三角形（沒有斷、沒有疊）；接寬路的 T 字路口（細分的格接沒細分的格）同樣沒有縫、沒有疊
//   ⚠ 取樣點的起點、步長要錯開格線（contains 是嚴格在裡面：落在三角形的邊上兩邊都不算 ⇒ 假的 0；第一版步長 .31 從 −13.1 起 ⇒ 踩到 x ＝ −10、x ＋ z ＝ −12，舊程式一樣報）
const th = Math.PI/6, ux = Math.cos(th), uz = Math.sin(th), nar = road([[.3,.7],[.3+40*ux,.7+40*uz]], 2), NR = await surface([nar]);
assert(area(NR) > .98*(40*2+Math.PI), 'narrow road area ' + area(NR).toFixed(1));
for (let s=.5137; s<39.5; s+=.3719) for (const o of [-.6131,.0173,.5927]) { const x=.3+s*ux-o*uz, z=.7+s*uz+o*ux; assert.equal(contains(NR,x,z),1,`narrow road gap/overlap at ${x.toFixed(3)},${z.toFixed(3)}`); }
const TN = [road([[-14.3,.4],[14.1,.4]],6), road([[.6,.4],[.6+20*Math.cos(1.2),.4+20*Math.sin(1.2)]],2)], RN = await surface(TN);
for (let x=-13.1037; x<13; x+=.3137) for (let z=-2.4113; z<3.2; z+=.29317) assert.equal(contains(RN,x,z),1,`wide road next to narrow gap/overlap at ${x.toFixed(3)},${z.toFixed(3)}`);
for (let s=3.6137; s<19; s+=.3719) for (const o of [-.6131,.0173,.5927]) { const x=.6+s*Math.cos(1.2)-o*Math.sin(1.2), z=.4+s*Math.sin(1.2)+o*Math.cos(1.2); assert.equal(contains(RN,x,z),1,`narrow branch gap/overlap at ${x.toFixed(3)},${z.toFixed(3)}`); }
const cases = [road([[0,0],[10,0],[10,10]]), road([[0,0],[10,0],[.5,1]]), road([[0,0],[0,0],[10,0]]), road([[0,0],[10,0],[10,10],[0,10],[0,0]])];
for (const r of cases) { const s=await surface([r]); assert(s.i.length>0); assert([...s.v].every(Number.isFinite)); tris(s).forEach(f=>assert.equal(new Set(f).size,3)); }
// A broad cell has a saddle: bilinear interpolation is below its rendered upper triangle.
const C = { n:2, h:new Int16Array([20,100,100,20]) };
c.bedCell = (x,z) => ({ C, u:x/4, v:z/4 }); c.townHv = C=>C.h;
assert.equal(c.townRoadHeight(2,2),10); assert.equal(c.townGround(2,2),6);
// Sample a piecewise planar hill with transverse slope. The plan's old z=2 is buried.
c.townRoadHeight = (x,z) => 7 + .18*x + .12*z;
// 地面照海圖塊分區（townGroundPrep／townGroundTile）：每區一份網格，合起來 ＝ 整座城。
const town={ p:{}, roads:T, roadSurface:R, E:q=>q, box:[-20,-20,20,20] };
function build() { c.townGroundPrep(town); return Object.keys(town.gt).map(k => { const Q=town.gt[k], g=c.townGroundTile(town, Q); Q.g=g; Q.dirty=false; return g; }).filter(Boolean); }
const tiles = build(), topN=R.v.length/6;
assert(tiles.length>1,'the junction straddles tile lines (8 m) ⇒ more than one tile');
let top=0, side=0, topTris=0;
for (const mesh of tiles) for(let o=0;o<mesh.V.length;o+=9) {
  const x=mesh.V[o], y=mesh.V[o+1], z=mesh.V[o+2];
  if (mesh.V[o+4]>.5) { top++; assert(Math.abs(y-c.townRoadHeight(x,z)-c.TOWN_ROAD_LIFT)<1e-5,'surface clearance'); assert(mesh.V[o+4]>.9 && Math.abs(mesh.V[o+3])>.1,'slope normals'); }
  else side++;
}
assert(top>=topN,'every road vertex is in some tile (shared ones in each tile that uses them)');
assert(side>0,'raised surface must have side faces');
assert.equal(Object.values(town.gt).reduce((s,Q)=>s+Q.tri.length,0), R.i.length/3,'tiles together hold every top triangle once');
// Missing terrain uses finite plan heights, then refreshes after intersecting chunk arrives.
c.townRoadHeight=()=>NaN; build().forEach(m=>assert([...m.V].every(Number.isFinite)));
c.TOWNS.list=[town]; events.bedChunk(0,0); assert(Object.values(town.gt).some(Q=>Q.dirty),'a tile that read chunk 0_0 rebuilds');
Object.values(town.gt).forEach(Q=>assert.equal(Q.dirty,!!Q.deps['0_0'],'only the tiles that read it'));
Object.values(town.gt).forEach(Q=>Q.dirty=false); events.bedChunk(5,5); assert(Object.values(town.gt).every(Q=>!Q.dirty),'a far chunk rebuilds nothing');
const long=Array.from({length:20},(_,i)=>road([[0,i*12],[1000,i*12]],5));
let ticks=0; const timer=setInterval(()=>ticks++,1);
const start=performance.now(), big=await surface(long), ms=performance.now()-start; clearInterval(timer);
assert(ticks>5,'long networks must yield to the event loop');
console.log(JSON.stringify({junctionArea:area(R),junctionTriangles:R.i.length/3,topVertices:topN,tiles:tiles.length,withSides:tiles.reduce((s,m)=>s+m.I.length/3,0),twentyKm:{ms:+ms.toFixed(1),vertices:big.v.length/6,triangles:big.i.length/3},checks:'passed'}));
if(process.argv[2]) {
  const plan=JSON.parse(fs.readFileSync(process.argv[2],'utf8')), before=JSON.stringify(plan);
  const roads=plan.roads.map(r=>({P:r.closed?r.path.concat([r.path[0]]):r.path,z:r.closed?r.z.concat([r.z[0]]):r.z,w:r.w,kind:r.kind}));
  const t=performance.now(), net=await surface(roads); assert.equal(JSON.stringify(plan),before);
  console.log(JSON.stringify({town:plan.id,roads:roads.length,ms:+(performance.now()-t).toFixed(1),vertices:net.v.length/6,triangles:net.i.length/3,planUnchanged:true}));
}

}
main().catch(e=>{ console.error(e); process.exitCode=1; });

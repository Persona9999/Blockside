// Run: node src/tests/townfolk_worksites.cjs [Blocksail root] [evidence.json]
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'../..');
const c={Q:new URLSearchParams(''),performance,BED:{ax:10000,az:20000}};c.window=c;vm.createContext(c);
const towns=fs.readFileSync(path.join(root,'src/js/63_towns.js'),'utf8');
vm.runInContext(towns.split('\n').find(s=>s.startsWith('function townHash(')),c);
vm.runInContext(fs.readFileSync(path.join(root,'src/js/63_townfolk.js'),'utf8'),c);
const peopleRoot=process.argv[2],cfg={window:{BSTOWNKIT_DATA:{}}};vm.createContext(cfg);
vm.runInContext(fs.readFileSync(path.join(peopleRoot,'world/townkit/_people.js'),'utf8'),cfg);
const workers=cfg.window.BSTOWNKIT_DATA._people.people.filter(p=>p.sheet==='workers');
const nodes=[{adj:[{e:0,dir:1}]},{adj:[{e:0,dir:-1},{e:1,dir:1}]},{adj:[{e:1,dir:-1}]}];
const edges=[{ax:0,az:0,dx:1,dz:0,L:100,w:4,a:0,b:1},{ax:100,az:0,dx:1,dz:0,L:100,w:4,a:1,b:2}];
const G={nodes,edges,y:[0,20],line:null};
const T={E:q=>[q[0]+10000,q[1]+20000],p:{lots:[]}};
workers.forEach((p,i)=>T.p.lots.push({id:'lot'+i,use:p.work[0]==='garrison'?'fort':p.work[0],at:[12+i*14,12]}));
const rows=[];
workers.forEach((p,i)=>{
  const site=c.townFolkWorkSite(T,G,p,p.id);assert(site,'site missing: '+p.id);
  assert.equal(site.lot,'lot'+i);assert.equal(site.distance,12);
  const a={id:i,e:site.e,work:site,spd:1.4};c.townFolkRoute(G,a,p.id,1);
  const first=JSON.stringify(a.legs);let max=0;
  for(let clock=0;clock<600;clock+=0.7){c.townFolkAt(G,a,clock);assert.equal(a.e,site.e);max=Math.max(max,Math.abs(a.t-site.t));}
  assert(max<=4.000001);c.townFolkRoute(G,a,p.id,1);assert.equal(JSON.stringify(a.legs),first);
  rows.push({id:p.id,lot:site.lot,use:site.use,buildingDistance:site.distance,maxAlongStreetOffset:+max.toFixed(4)});
});
assert.equal(c.townFolkWorkSite(T,G,{work:['missing']},'none'),null);
assert.equal(c.townFolkWorkSite(T,G,{work:[]},'child'),null);
const far={E:T.E,p:{lots:[{id:'far',use:'mine',at:[30,200]}]}};
assert.equal(c.townFolkWorkSite(far,{nodes,edges,y:[0,20]},{work:['mine']},'far'),null);
const hidden={E:T.E,p:{lots:[{id:'hidden',use:'mine',at:[30,12],hide:true}]}};
assert.equal(c.townFolkWorkSite(hidden,{nodes,edges,y:[0,20]},{work:['mine']},'hidden'),null);
const guardTown={E:T.E,p:{lots:[{id:'tower',use:'watchtower',at:[30,6]}]}};
const guardGraph={nodes,edges,y:[0,20]}, guard={work:['garrison']};
const guardSites=[];for(let i=0;i<4;i++){let s=c.townFolkWorkSite(guardTown,guardGraph,guard,'guard'+i);assert(s);guardSites.push(s);}
assert.equal(new Set(guardSites.map(s=>s.t)).size,4,'each nearby actor has its own patrol slot');
for(let i=1;i<4;i++)assert(guardSites[i].t-guardSites[i].patrol>guardSites[i-1].t+guardSites[i-1].patrol,'patrol intervals do not overlap');
assert.equal(c.townFolkWorkSite(guardTown,guardGraph,guard,'guard4'),null,'fifth actor falls back to free route');
const free={id:0,e:0,spd:1.4};c.townFolkRoute(G,free,'free',1);assert(free.legs.length>4,'general route still follows multiple edges');
// Population-driven art picks may repeat; the debug lineup must still show every requested worker exactly once.
T.folk=G;T.ox=10000;T.oy=20000;G.agents=workers.map((p,i)=>({id:i,art:0}));c.townRoadHeight=()=>3;
const F={rows:workers.length,people:workers.map(p=>({id:p.id,sheet:0})),sheets:[{name:'workers'}]};
assert(c.townFolkStreet(T,F,false,'workers'));
assert.deepEqual(Array.from(G.line.arts),workers.map((p,i)=>i));
assert.equal(new Set(G.line.arts).size,12);c.townFolkStreet(T,F,true);assert.equal(G.line,null);
const report={workers:rows,unmatchedFallback:true,farFallback:true,hiddenIgnored:true,deterministic:true,generalRouteUnchanged:true,uniqueWorkerLineup:12,workplaceCapacity:4,overflowFallsBack:true};
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({workers:rows.length,maxAlongStreetOffset:Math.max(...rows.map(x=>x.maxAlongStreetOffset)),negativeControls:5,deterministic:true,nonoverlappingWorkSlots:true}));

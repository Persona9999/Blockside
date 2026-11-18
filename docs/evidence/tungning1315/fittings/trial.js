/* Verification hook inserted into served built HTML, never into product source. */
window.tungningTrial = async function () {
  const startup={mode:__game.mode(),ships:__game.ships().map(s=>s.T.id),time:__game.stats().t};
  await loadHull('tungning_trader');
  flowRun(false); flowMode('pve');
  FLEET_DBG=[{team:'blue',hull:'tungning_trader'}];
  WIND_FIX={rot:90,s0:.5}; SEA_K=0;
  reset(); uiAway(); flowRun(true); flowPause(true);
  AUTOFIRE=false; SAIL='manual';
  const sh=SHIPS[0], n=v=>Number.isFinite(v)?+v.toFixed(4):null;
  const advance=secs=>{for(let i=0;i<Math.round(secs/DT);i++) simStep();};
  const state=()=>({t:n(SIMT),xy:[n(sh.px),n(sh.pz)],yaw:n(sh.yaw),speed:n(sh.spd),
    draft:n(sh.T.zw*S+sh.sink-sh.lift),waterT:n((sh.fl?.vol||0)*RHO_W),sunk:sh.sunk,
    modelsLost:sh.models.filter(m=>!m.alive).map(m=>m.path),
    ropesBroken:sh.ropes.filter(r=>r.dead).length,sailsBroken:sh.sails.filter(s=>s.dead).length});
  const R={title:document.title,startup,ship:sh.T.id,checksum:sh.T.h.checksum,dt:DT,initial:state(),
    mass:{light:n(sh.T.light0),standard:sh.T.dispStd,full:sh.T.dispFull,cargo:sh.T.cargoT,
      cargoShort:sh.T.cargoShort,ballast:n(sh.cfg.ballast),actual:n(shipT(sh))},
    crew:sh.crew.length,authoredFlags:sh.T.rig.sails.slice(0,sh.T.nSail0).filter(s=>s.meta?.kind==='flag').length,
    magazines:sh.mags.map(m=>m.kegs.length),stations:sh.stations.length,
    rooms:__game.rooms()[0].rooms,ladders:__game.ladders()};
  for(let k=0;k<=3;k++) {
    setSails(sh,k); advance(1);
    (R.sailSets ||= []).push({k,open:sh.sails.filter(s=>!s.flag&&!s.furled).map(s=>s.name),
      flags:sh.sails.filter(s=>s.flag&&!s.furled).length});
  }
  setSails(sh,3); sh.rudder=0;
  const p0=[sh.px,sh.pz]; advance(30);
  R.straight={...state(),travel:n(Math.hypot(sh.px-p0[0],sh.pz-p0[1]))};
  const yaw0=sh.yaw; KEYS.l=true; advance(20); KEYS.l=false;
  R.turn={...state(),degrees:n((sh.yaw-yaw0)*180/Math.PI),
    rudder:sh.models.filter(m=>m.kind==='rudder'||m.kind==='tiller').map(m=>({path:m.path,alive:m.alive,spin:m.spinA}))};
  setSails(sh,0); SAIL='off'; advance(60);
  const anchors=anchorsOf(sh), held0=[sh.px,sh.pz]; advance(20);
  R.anchor={...state(),drift:n(Math.hypot(sh.px-held0[0],sh.pz-held0[1])),held:anchorHeld(sh),
    states:['P','S'].map(k=>({side:k,state:anchors[k].st,broken:anchors[k].broken,hawse:anchors[k].hw}))};
  SAIL='manual'; anchorWeighAll(sh); advance(10);
  R.weigh={...state(),states:['P','S'].map(k=>anchors[k].st)};
  const rows=sh.guns.map(g=>({id:g.model.meta.id,type:g.type,muzzle:g.muz,initial:g.box,crew:g.spots.length,want:g.crewFull,
    shots:0,replenished:0,escaped:0}));
  const balls=[];
  const shoot=()=>{
    const before=sh.guns.map(g=>g.firedAt);
    if(!fireOne(sh,0))return false;
    const i=sh.guns.findIndex((g,j)=>g.firedAt!==before[j]);
    if(i<0)throw Error('No gun event');
    rows[i].shots++;
    const b=BALLS[BALLS.length-1];
    if(!b)throw Error('No projectile');
    balls.push({i,b,origin:b.p.slice(),t:SIMT});
    return true;
  };
  const t0=SIMT;
  for(let tick=0;tick<Math.round(180/DT);tick++) {
    const old=sh.guns.map(g=>g.box); simStep();
    sh.guns.forEach((g,i)=>{if(g.box>old[i])rows[i].replenished+=g.box-old[i];});
    for(let j=balls.length-1;j>=0;j--){
      const b=balls[j],alive=BALLS.includes(b.b);
      if(alive&&Math.hypot(...b.b.p.map((v,k)=>v-b.origin[k]))>=10){rows[b.i].escaped++;balls.splice(j,1);}
      else if(!alive||SIMT-b.t>2)balls.splice(j,1);
    }
    if(tick%Math.round(.2/DT)===0){
      while(shoot()){}
      if(!balls.length&&rows.every(r=>r.shots>r.initial&&r.replenished>0))break;
    }
  }
  R.guns={seconds:n(SIMT-t0),rows,total:sh.fired,selfHits:sh.hits,end:state()};
  // Use the normal first-person climb button, with collision mode 0.
  flowPause(false); __game.fp(1);
  const ladders=FP.lads.slice(); R.climbs=[];
  for(const L of ladders) for(const down of [false,true]) {
    const pts=down?L.up.slice().reverse():L.up,foot=pts[0],head=pts[pts.length-1];
    const v=pts.find(q=>Math.hypot(q[0]-foot[0],q[1]-foot[1])>1)||head;
    const yaw=Math.atan2(v[1]-foot[1],v[0]-foot[0]);
    __game.fp(null,foot,yaw); __game.fpRun(.1);
    const before=__game.fp();
    if(before.near?.name===L.name) document.getElementById('fpClimb').click();
    const began=!!FP.climb;
    for(let i=0;i<12000&&FP.climb;i++) fpFrame(1/60);
    const after=__game.fp(),error=Math.hypot(...head.map((v,k)=>v-after.pos[k]));
    R.climbs.push({name:L.name,rope:!!L.rope,down,began,mode:after.mode,from:before.pos,to:after.pos,error:n(error)});
  }
  __game.fp(0); flowPause(true);
  setSails(sh,3); SAIL='manual'; KEYS.l=false; KEYS.r=false;
  advance(8);
  __game.cam({mode:0,track:true,yaw:-sh.yaw+Math.PI/2+.25,pitch:.18,dist:53,tgt:M4.pt(sh.M,180.5,80.5,130)});
  hudFrame(1);
  R.ok=R.startup.mode.mode==='sail' && R.startup.ships[0]==='tungning_trader' &&
    R.checksum===2221512735 && R.mass.cargo===260 && R.mass.cargoShort===0 &&
    R.authoredFlags===1 && R.sailSets.every(s=>s.open.length===s.k&&s.flags===4) && R.straight.travel>10 &&
    R.climbs.length===20 && R.climbs.every(c=>c.began&&c.mode===0&&c.error<1) &&
    Math.abs(R.turn.degrees)>10 && R.anchor.held && R.anchor.drift<2 &&
    R.anchor.states.every(a=>!a.broken&&a.hawse&&a.state==='down') && R.weigh.states.every(s=>s==='up') &&
    rows.length===16&&rows.every(r=>r.shots>r.initial&&r.replenished>0&&r.escaped===r.shots&&r.crew===r.want) &&
    sh.hits===0 && !sh.sunk && R.guns.end.modelsLost.length===0 &&
    R.guns.end.ropesBroken===0 && R.guns.end.sailsBroken===0;
  return R;
};
window.tungningBattenTrial=async function(){
  await loadHull('tungning_trader');flowRun(false);flowMode('pve');
  FLEET_DBG=[{team:'blue',hull:'tungning_trader'}];reset();uiAway();flowRun(true);flowPause(true);
  PHYS=true;AUTOFIRE=false;SAIL='manual';
  const sh=SHIPS[0],n=x=>+x.toFixed(5),advance=sec=>{for(let i=0;i<Math.round(sec/DT);i++)simStep();render();};
  function snapshot(label){
    const sails=[];
    sailWalk(sh,(c,T,P)=>{
      if(!T.battens)return;
      let max=0,bound=0;
      for(let i=0;i<T.n;i++)if(T.hk[i]===4){
        const m=sh.models[T.hv[i]];if(m.yk!=='batten')continue;
        const moved=p=>{const q=rotZ(p,m.piv,m.rot||0);q[2]-=m.fdz||0;return q;};
        const a=moved(m.pts['arm-P']),b=moved(m.pts['arm-S']);
        max=Math.max(max,Math.sqrt(segDist2([P[i*3],P[i*3+1],P[i*3+2]],...a,...b)));bound++;
      }
      const rods=sh.yards.filter(m=>m.sail===T.name&&m.yk==='batten');
      sails.push({name:T.name,count:T.battens,bound,maxGap:n(max),furled:sh.sails[sh.cl.indexOf(c)].furled,
        rods:rods.map(m=>({name:m.path,rot:n(m.rot),drop:n(m.fdz||0),z:n(m.piv[2]-(m.fdz||0))}))});
    });
    return{label,crew:sh.crew.length,sails};
  }
  setSails(sh,3);advance(7);const open=snapshot('open');
  KEYS.l=true;advance(5);KEYS.l=false;const turn=snapshot('turn');
  setSails(sh,0);advance(5);const closed=snapshot('closed');
  setSails(sh,3);advance(7);const reopened=snapshot('reopened');
  __game.cam({mode:0,track:true,yaw:-sh.yaw+Math.PI/2+.25,pitch:.18,dist:53,tgt:M4.pt(sh.M,180.5,80.5,130)});
  const states=[open,turn,closed,reopened];
  return{title:document.title,checksum:sh.T.h.checksum,states,
    ok:states.every(s=>s.sails.length===3&&s.sails.every(p=>p.maxGap<1.5&&p.rods.length===p.count))};
};

const FIT_BOW=[[305,59,62,216],[305,59,63,216],[305,60,61,216],[305,60,62,104],[305,61,61,104],[305,99,61,104],[305,100,61,216],[305,100,62,104],[305,101,62,216],[305,101,63,216],[306,60,60,216],[306,60,61,216],[306,60,62,216],[306,60,63,216],[306,60,64,216],[306,61,51,255],[306,61,60,104],[306,61,61,104],[306,61,62,104],[306,61,63,104],[306,99,51,255],[306,99,60,104],[306,99,61,104],[306,99,62,104],[306,99,63,104],[306,100,60,216],[306,100,61,216],[306,100,62,216],[306,100,63,216],[306,100,64,216],[307,59,63,36],[307,60,59,216],[307,60,60,216],[307,60,61,216],[307,60,62,216],[307,60,63,216],[307,60,64,216],[307,60,65,216],[307,61,59,104],[307,61,60,104],[307,61,61,104],[307,61,62,104],[307,61,63,104],[307,62,52,255],[307,98,52,255],[307,99,59,104],[307,99,60,104],[307,99,61,104],[307,99,62,104],[307,99,63,104],[307,100,59,216],[307,100,60,216],[307,100,61,216],[307,100,62,216],[307,100,63,216],[307,100,64,216],[307,100,65,216],[307,101,63,36],[308,61,59,216],[308,61,60,216],[308,61,61,216],[308,61,62,216],[308,61,63,216],[308,61,64,216],[308,61,65,216],[308,62,52,255],[308,62,59,104],[308,62,60,104],[308,62,61,104],[308,62,62,104],[308,62,63,104],[308,98,52,255],[308,98,59,104],[308,98,60,104],[308,98,61,104],[308,98,62,104],[308,98,63,104],[308,99,59,216],[308,99,60,216],[308,99,61,216],[308,99,62,216],[308,99,63,216],[308,99,64,216],[308,99,65,216],[309,60,61,36],[309,61,59,216],[309,61,60,216],[309,61,61,216],[309,61,62,216],[309,61,63,216],[309,61,64,216],[309,61,65,216],[309,62,59,104],[309,62,60,104],[309,62,61,104],[309,62,62,104],[309,62,63,160],[309,63,52,255],[309,97,52,255],[309,98,59,104],[309,98,60,104],[309,98,61,104],[309,98,62,104],[309,98,63,160],[309,99,59,216],[309,99,60,216],[309,99,61,216],[309,99,62,216],[309,99,63,216],[309,99,64,216],[309,99,65,216],[309,100,61,36],[310,62,59,216],[310,62,60,216],[310,62,61,216],[310,62,62,216],[310,62,63,216],[310,62,64,216],[310,62,65,216],[310,63,52,255],[310,63,59,104],[310,63,60,104],[310,63,61,104],[310,63,62,104],[310,63,63,160],[310,97,52,255],[310,97,59,104],[310,97,60,104],[310,97,61,104],[310,97,62,104],[310,97,63,160],[310,98,59,216],[310,98,60,216],[310,98,61,216],[310,98,62,216],[310,98,63,216],[310,98,64,216],[310,98,65,216],[311,61,63,36],[311,62,59,216],[311,62,60,216],[311,62,61,216],[311,62,62,216],[311,62,63,216],[311,62,64,216],[311,62,65,216],[311,63,59,104],[311,63,60,104],[311,63,61,104],[311,63,62,104],[311,63,63,160],[311,64,51,255],[311,96,51,255],[311,97,59,104],[311,97,60,104],[311,97,61,104],[311,97,62,104],[311,97,63,160],[311,98,59,216],[311,98,60,216],[311,98,61,216],[311,98,62,216],[311,98,63,216],[311,98,64,216],[311,98,65,216],[311,99,63,36],[312,63,60,216],[312,63,61,216],[312,63,62,216],[312,63,63,216],[312,63,64,216],[312,64,50,255],[312,64,60,104],[312,64,61,104],[312,64,62,104],[312,64,63,160],[312,96,50,255],[312,96,60,104],[312,96,61,104],[312,96,62,104],[312,96,63,160],[312,97,60,216],[312,97,61,216],[312,97,62,216],[312,97,63,216],[312,97,64,216],[313,63,61,216],[313,63,62,216],[313,63,63,216],[313,64,61,104],[313,64,62,104],[313,64,63,160],[313,65,50,255],[313,95,50,255],[313,96,61,104],[313,96,62,104],[313,96,63,160],[313,97,61,216],[313,97,62,216],[313,97,63,216],[314,65,50,255],[314,65,57,255],[314,65,63,160],[314,95,50,255],[314,95,57,255],[314,95,63,160],[315,65,56,255],[315,65,57,255],[315,65,58,255],[315,65,63,160],[315,66,50,255],[315,94,50,255],[315,95,56,255],[315,95,57,255],[315,95,58,255],[315,95,63,160],[316,65,63,160],[316,66,51,255],[316,66,55,255],[316,66,56,255],[316,66,57,255],[316,66,58,255],[316,66,59,255],[316,94,51,255],[316,94,55,255],[316,94,56,255],[316,94,57,255],[316,94,58,255],[316,94,59,255],[316,95,63,160],[317,66,55,255],[317,66,56,255],[317,66,57,255],[317,66,58,255],[317,66,59,255],[317,66,63,160],[317,67,51,255],[317,93,51,255],[317,94,55,255],[317,94,56,255],[317,94,57,255],[317,94,58,255],[317,94,59,255],[317,94,63,160],[318,66,63,160],[318,67,52,255],[318,67,55,255],[318,67,56,36],[318,67,57,36],[318,67,58,36],[318,67,59,255],[318,93,52,255],[318,93,55,255],[318,93,56,36],[318,93,57,36],[318,93,58,36],[318,93,59,255],[318,94,63,160],[319,67,52,255],[319,67,55,255],[319,67,56,36],[319,67,57,36],[319,67,58,36],[319,67,59,255],[319,93,52,255],[319,93,55,255],[319,93,56,36],[319,93,57,36],[319,93,58,36],[319,93,59,255],[320,67,60,255],[320,68,52,255],[320,68,54,255],[320,68,55,255],[320,68,56,36],[320,68,57,36],[320,68,58,36],[320,68,59,255],[320,92,52,255],[320,92,54,255],[320,92,55,255],[320,92,56,36],[320,92,57,36],[320,92,58,36],[320,92,59,255],[320,93,60,255],[321,68,52,255],[321,68,55,255],[321,68,56,36],[321,68,57,36],[321,68,58,36],[321,68,59,255],[321,92,52,255],[321,92,55,255],[321,92,56,36],[321,92,57,36],[321,92,58,36],[321,92,59,255],[322,68,58,36],[322,68,59,255],[322,69,51,255],[322,69,55,255],[322,69,56,36],[322,69,57,36],[322,91,51,255],[322,91,55,255],[322,91,56,36],[322,91,57,36],[322,92,58,36],[322,92,59,255],[323,69,50,255],[323,69,55,255],[323,69,56,255],[323,69,57,255],[323,69,58,255],[323,69,59,255],[323,91,50,255],[323,91,55,255],[323,91,56,255],[323,91,57,255],[323,91,58,255],[323,91,59,255],[324,69,57,255],[324,69,58,255],[324,69,59,255],[324,70,50,255],[324,70,55,255],[324,70,56,255],[324,90,50,255],[324,90,55,255],[324,90,56,255],[324,91,57,255],[324,91,58,255],[324,91,59,255],[325,70,50,255],[325,70,56,255],[325,70,57,255],[325,70,58,255],[325,90,50,255],[325,90,56,255],[325,90,57,255],[325,90,58,255],[326,70,57,255],[326,71,50,255],[326,89,50,255],[326,90,57,255],[327,72,51,255],[327,88,51,255],[328,72,52,255],[328,88,52,255],[329,73,52,255],[329,87,52,255],[330,73,52,255],[330,87,52,255],[331,74,52,255],[331,86,52,255],[332,75,51,255],[332,85,51,255]];

async function fittingSetup(deco) {
  await loadHull('tungning_trader'); flowRun(false); flowMode('pve');
  FLEET_DBG=[{team:'blue',hull:'tungning_trader'},{team:'red',hull:'tungning_trader'}];
  WIND_FIX={rot:90,s0:.5}; SEA_K=0; GFX.deco=deco;
  reset(); uiAway(); flowRun(true); flowPause(true); AUTOFIRE=false; SAIL='off';
  const sh=SHIPS[0]; setSails(sh,0); return sh;
}
function fittingCamera(sh,side) {
  const p=side==='stern'?[27,80.5,73.5]:[320,93,57.5];
  const d=M4.dir(sh.M,...(side==='stern'?[-1,0,0]:[.65,1,0]));
  __game.cam({mode:0,track:false,yaw:Math.atan2(d[2],d[0]),pitch:.06,dist:side==='stern'?7:6,
    tgt:M4.pt(sh.M,...p)}); CAM.snap=true; hudFrame(1);
}
window.tungningSternTrial=async function(){
  const sh=await fittingSetup(true), board=sh.T.decos.find(m=>m.name==='nameboard');
  fittingCamera(sh,'stern');
  const box=board?.bbox;
  return {ok:sh.T.h.checksum===2221512735&&!!board&&box[3]===27.5,
    checksum:sh.T.h.checksum,board:box,meta:board?.meta,
    bowModels:sh.T.decos.filter(m=>/^bow-[PS]$/.test(m.name)).length};
};
window.tungningBowIntactTrial=async function(){
  const sh=await fittingSetup(false); fittingCamera(sh,'bow');
  const present=FIT_BOW.filter(p=>sh.grid.get(...p.slice(0,3))===p[3]).length;
  return {ok:present===358,checksum:sh.T.h.checksum,deco:GFX.deco,present,
    bowModels:sh.T.decos.filter(m=>/^bow-[PS]$/.test(m.name)).length};
};
window.tungningBowDamageTrial=async function(){
  const results=[];
  for(const deco of [false,true]) {
    const sh=await fittingSetup(deco);
    const before=FIT_BOW.filter(p=>sh.grid.get(...p.slice(0,3))).length;
    const shot=__game.shot(0,320,57,0,'long6',0,0);
    const after=FIT_BOW.filter(p=>sh.grid.get(...p.slice(0,3))).length;
    results.push({deco,before,after,removedBow:before-after,shot,
      bowModels:sh.T.decos.filter(m=>/^bow-[PS]$/.test(m.name)).length});
  }
  fittingCamera(SHIPS[0],'bow');
  return {ok:results.every(r=>r.before===358&&r.after>0&&r.after<r.before&&r.shot.removed>0&&r.bowModels===0)&&
    results[0].after===results[1].after,checksum:SHIPS[0].T.h.checksum,results};
};

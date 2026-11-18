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
    R.checksum===2262896839 && R.mass.cargo===260 && R.mass.cargoShort===0 &&
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

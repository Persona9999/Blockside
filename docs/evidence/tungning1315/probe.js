window.__openHullTrial = async function (o) {
  const T = await loadHull(o.hull);
  if (o.rimOverride) T.floodRim = o.rim;
  if (o.geometry) {
    const sections = [];
    for (const frac of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
      const x = Math.round(T.wl0 + (T.wl1 - T.wl0) * frac);
      const tops = Array.from({length:T.hullG.sy}, (_, y) => {
        for (let z = Math.min(T.zw + 35, T.sz - 1); z >= 0; z--) if (T.hullG.get(x, y, z)) return z + 1;
        return 0;
      });
      const lo = tops.findIndex(z => z > 0), hi = tops.findLastIndex(z => z > 0);
      const rows = [];
      for (let z=Math.max(0,T.zw-4); z<Math.min(T.sz,T.zw+33); z++) rows.push([z, Array.from({length:hi-lo+1},(_,j)=>T.hullG.get(x,lo+j,z)?'#':'.').join('')]);
      sections.push({frac, x, lo, hi, tops: tops.slice(lo, hi + 1), rows});
    }
    return {label:o.label, name:T.name, hx:[T.hx0,T.hx1], wl:[T.wl0,T.wl1], center:[T.cx,T.cy], draft:T.zw*S, top:T.topDeck, oldLine:sinkLineT(T), maxDown:(T.hyd.length-1-T.zw)*S, checksum:T.h.checksum, sections};
  }
  flowRun(false);
  flowMode('sandbox');
  SEA_K = o.sea || 0;
  setWeather(o.weather || 'clear');
  PHX.flood = o.mode ?? 3;
  PHX.sinkflood = 0;
  FLEET_DBG = [{team:'blue',hull:o.hull}];
  reset();
  AUTOFIRE = false;
  const sh = SHIPS[0];
  sh.sailSet = 0; sh.power = 0; sh.manual = true; sh.rudder = 0;
  if (o.baseOnly) { sh.pumps = null; sh.pumpAll = 1; }
  if (o.pump === 0) { sh.cfg.pump = 0; sh.pumps = null; }
  const round = v => Number.isFinite(v) ? +v.toFixed(4) : null;
  const tons = v => round(v * RHO_W);
  const stats = t => ({t:round(t), sink:round(sh.sink), netDown:round(sh.sink-sh.lift),
    line:round(sinkFinalAt(sh)), pct:round(floodPct(sh)), roll:round(sh.rollA), pitch:round(sh.pitchA),
    wet:sh.inflow, waterT:round(sh.fl ? sh.fl.vol*RHO_W : null), inQ:round(sh.fl?.inQ), outQ:round(sh.fl?.outQ),
    area:round(sh.fl?.area), pumpQ:round(sh.fl?.pumpQ), netQ:round(sh.fl?.netQ),
    wetArea:round(sh.fl?.underA), inT:tons(sh.fl?.inTot), outT:tons(sh.fl?.outTot),
    pumpedT:tons(sh.fl?.pumped), returnedT:tons(sh.fl?.back || 0), unplacedT:tons(sh.fl?.lost || 0),
    pumpRated:round(60*RHO_W*FL_PUMP*pumpK(sh)*FL_PUMPK),
    final:sh.sinkingFinal, sunk:sh.sunk, lost:sh.orig-sh.grid.count});
  for(let i=0; i<Math.round(8/DT); i++) simStep();
  const initial = stats(0);
  const deep = Math.max(1, Math.round(T.zw * 0.43)), radius = Math.min(7, Math.max(2, deep));
  const selected = o.auto === 'large'
    ? [[.27,deep,0,radius],[.38,deep,1,radius],[.49,deep,0,radius],[.60,deep,1,radius],[.71,deep,0,radius]]
    : o.auto === 'small' ? [[.51,Math.max(1,Math.floor(T.zw*.13)),0,1]] : o.holes || [];
  const holes = selected.map(([x0,dz,side,r]) => {
    const x = Math.round(T.wl0 + (T.wl1-T.wl0)*x0);
    let z = Math.max(0,labSkin(sh,x,side).z-dz), cut = null;
    for (let to = z + 3; z <= to && !cut?.removed; z++) cut = labHole(sh,x,z,side,r);
    z--;
    if (!cut?.removed) throw new Error('Dry or invalid hole at '+JSON.stringify({x,z,side,r}));
    return {x,z,side,r,removed:cut.removed};
  });
  for (const [x0,x1,y0,y1,z0,z1] of o.cuts || []) {
    let removed = 0;
    for (let x=x0;x<=x1;x++) for(let y=y0;y<=y1;y++) for(let z=z0;z<=z1;z++) {
      removed += removeVoxel(sh,x,y,z,false) ? 1 : 0;
    }
    if(!removed) throw new Error('Empty breach');
    holes.push({box:[x0,x1,y0,y1,z0,z1],removed});
  }
  const start = SIMT, points = [];
  const gunwale = (o.rim || CFG.ships.find(s=>s.id===o.hull).floodRim || []).map(p => {
    const x=Math.floor(p[0]), y=Math.floor(p[1]), inboard=y < T.cy ? 1 : -1;
    const height = (a,b) => {
      for (let z=p[2]-1;z>=0;z--) for(let xx=x-1;xx<=x+1;xx++) for(let j=a;j<=b;j++) {
        if(sh.grid.get(xx,y+inboard*j,z)) return z+1;
      }
      return 0;
    };
    return {p,column:height(0,0),wide:height(-1,2)};
  });
  let finalAt=null, sunkAt=null, maxWater=0, maxDown=-Infinity, maxRimWet=-Infinity, maxArea=0;
  for(let i=1; i<=Math.round(o.dur/DT); i++) {
    simStep();
    const t = SIMT-start;
    maxDown = Math.max(maxDown, sh.sink-sh.lift);
    if (sh.fl) { maxWater = Math.max(maxWater, sh.fl.vol*RHO_W); maxArea = Math.max(maxArea, sh.fl.area); }
    if(o.rim) for(const p of o.rim) {
      const q=M4.pt(sh.M,p[0],p[1],p[2]);
      maxRimWet=Math.max(maxRimWet,seaH(q[0],q[2],SIMT)-q[1]);
    }
    if(sh.sinkingFinal && !finalAt) finalAt=stats(t);
    if(sh.sunk && !sunkAt) sunkAt=stats(t);
    if(i%Math.round(5/DT)===0) points.push(stats(t));
    if (o.stopAtSink && sh.sunk) break;
  }
  return {label:o.label, hull:T.id, checksum:T.h.checksum, mode:FLOOD_LV, sea:SEA_K, weather:WX_ID,
    pump:sh.cfg.pump, effectivePump:round(60*RHO_W*FL_PUMP*pumpK(sh)*FL_PUMPK), flood:sh.cfg.flood, floodScale:FL_INK, pumpScale:FL_PUMPK,
    initial, holes, gunwale, maxWater:round(maxWater), maxDown:round(maxDown), maxRimWet:round(maxRimWet),
    maxArea:round(maxArea), finalAt, sunkAt, wGrid:sh.rimZ, end:stats(SIMT-start), points};
};

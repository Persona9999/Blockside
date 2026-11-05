// Exercise the actual action dispatcher, hold timer, propulsion orders and HUD mode switch.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=name=>fs.readFileSync(path.join(__dirname,'../js/',name),'utf8');
const buttons=['sailUp','sailDn'].map(act=>({dataset:{act},style:{},em:{},querySelector(){return this.em},parentElement:{}}));
const ctx={Math,performance:{now:()=>1000},RUNNING:true,SIMT:0,KEYS:{},PLAYER_I:0,SHIPS:[],
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),note(){},
  TELE:[1,.6,.35,.15,0,-.15,-.35,-.6,-1],TELE_NAME:['full','half','slow','dead','stop','deadR','slowR','halfR','fullR'],
  document:{querySelectorAll:()=>buttons},battleIcon:key=>'['+key+']',
  keyPaint(){for(const b of buttons)b.title=b.dataset.tip+' (custom key)';}};
vm.createContext(ctx);
vm.runInContext(source('31_sailing.js'),ctx);
const drive=source('31_drive.js');vm.runInContext(drive.slice(drive.indexOf('function teleStep('),drive.indexOf('/** 每一步')),ctx);
const input=source('71_input.js');vm.runInContext(input.slice(input.indexOf('function doAct('),input.indexOf("window.addEventListener('keyup'")),ctx);
const hud=source('61_hud.js');vm.runInContext(hud.slice(hud.indexOf('var HUD_SAILS'),hud.indexOf('var INFO_SH')),ctx);
const ship=(sails,base)=>({sailArea0:sails?100:1,cfg:{base},sails:[],sailSet:2,tele:4,power:0});
const engine=ship(false,10);ctx.SHIPS=[engine];
ctx.doAct('sailUp',false);assert.equal(engine.tele,3);assert.equal(engine.power,.15);assert.equal(engine.teleHand,true);
ctx.doAct('sailUp',true);assert.equal(engine.tele,3,'OS repeat must not double-step');
ctx.SIMT=.99;ctx.sailHold(engine);assert.equal(engine.tele,3);
ctx.SIMT=1;ctx.sailHold(engine);assert.equal(engine.tele,2);
ctx.SIMT=1.49;ctx.sailHold(engine);assert.equal(engine.tele,2);
ctx.SIMT=1.5;ctx.sailHold(engine);assert.equal(engine.tele,1);
ctx.actUp('sailUp');ctx.SIMT=3;ctx.sailHold(engine);assert.equal(engine.tele,1);
ctx.doAct('sailDn',false);assert.equal(engine.tele,2);ctx.actUp('sailDn');
for(let i=0;i<12;i++)ctx.doAct('sailDn',false);assert.equal(engine.tele,8);assert.equal(engine.power,-1);
for(let i=0;i<12;i++)ctx.doAct('sailUp',false);assert.equal(engine.tele,0);assert.equal(engine.power,1);
ctx.hudSailControls(engine);for(const b of buttons){assert.equal(b.style.display,'');assert.ok(b.em.innerHTML.includes('[settings]'));assert.ok(b.title.includes('俥鐘'));}
ctx.doAct('sailDn',false);const sail=ship(true,0);ctx.SHIPS=[sail];ctx.SIMT=20;ctx.sailHold(sail);assert.equal(ctx.KEYS.sw,null,'switching ships cancels held control');assert.equal(sail.sailSet,2);
ctx.doAct('sailUp',false);assert.equal(sail.sailSet,3);assert.equal(sail.tele,4);ctx.actUp('sailUp');
ctx.doAct('sailDn',false);assert.equal(sail.sailSet,2);ctx.actUp('sailDn');
const mixed=ship(true,12);ctx.SHIPS=[mixed];ctx.doAct('sailUp',false);assert.equal(mixed.sailSet,3);assert.equal(mixed.tele,4,'mixed propulsion keeps separate sail controls');
ctx.hudSailControls(mixed);for(const b of buttons){assert.ok(b.em.innerHTML.includes('[sail]'));assert.ok(!b.title.includes('俥鐘'));}
const inert=ship(false,0);ctx.SHIPS=[inert];ctx.doAct('sailUp',false);assert.equal(inert.tele,4);ctx.hudSailControls(inert);assert.ok(buttons.every(b=>b.style.display==='none'));
engine.sunk=true;ctx.SHIPS=[engine];ctx.doAct('sailDn',false);assert.equal(engine.tele,1,'sunk ship cannot receive order');
console.log(JSON.stringify({tap:1,holdDelay:1,repeatInterval:.5,releaseStops:true,shipSwitchCancels:true,clampsBothEnds:true,sailAndMixedPreserved:true,hudModes:3}));

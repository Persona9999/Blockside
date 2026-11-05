// Geometry and pointer transaction contract. Real rendering is checked in the browser.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const nodes=new Map();
function node(){return{style:{},dataset:{},children:[],classList:{contains:()=>false},handlers:{},setAttribute(){},focus(){},appendChild(b){this.children.push(b)},addEventListener(k,f){this.handlers[k]=f},setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:300,height:300})};}
const sh={tele:4,cfg:{base:1}},writes=[],ctx={Math,Infinity,TELE:[1,.6,.35,.15,0,-.15,-.35,-.6,-1],TELE_NAME:['full','half','slow','dead','stop','deadR','slowR','halfR','fullR'],performance:{now:()=>1000},RUNNING:true,SHIPS:[sh],PLAYER_I:0,GSET:{open:false},HELP:{open:false},modeRule:()=>true,$:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},document:{createElement:()=>node(),addEventListener(){}},keyAct:(_,k)=>k==='t'?'teleFwd':k==='g'?'teleBack':null,teleSet:(s,i)=>{writes.push(i);s.tele=i;}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/62_telegraph.js'),'utf8'),ctx);ctx.teleDraw=()=>{};
const degrees=[45,11.25,-22.5,-56.25,-90,-123.75,-157.5,-191.25,-225];
for(let i=0;i<9;i++){let a=degrees[i]*Math.PI/180;assert.equal(ctx.telePickIndex(150+112*Math.cos(a),150+112*Math.sin(a)),i);}
for(const [x,y] of [[150,150],[150,275],[150,-5],[310,150]])assert.equal(ctx.telePickIndex(x,y),-1);
const save=ctx.TELE;ctx.TELE=[1,.5,.2,0,-.2,-.5,-1];for(let i=0;i<7;i++){const a=(45-i*45)*Math.PI/180;assert.equal(ctx.telePickIndex(150+112*Math.cos(a),150+112*Math.sin(a)),i);}ctx.TELE=save;
const wheel=nodes.get('teleWheel'),point=i=>{let a=degrees[i]*Math.PI/180;return{button:0,pointerId:1,clientX:150+112*Math.cos(a),clientY:150+112*Math.sin(a),target:{closest:()=>null},preventDefault(){},stopPropagation(){}}};
wheel.handlers.pointerdown(point(0));wheel.handlers.pointermove(point(8));assert.equal(writes.length,0,'preview must not order');wheel.handlers.pointercancel();assert.equal(writes.length,0,'cancel must not order');
wheel.handlers.pointerdown(point(0));wheel.handlers.pointerdown({...point(2),pointerId:2,isPrimary:false});assert.equal(ctx.TELE_UI.drag.id,1,'second finger must not steal drag');wheel.handlers.pointerup(point(8));assert.deepEqual(writes,[8],'release sends one order');
wheel.handlers.pointerdown(point(0));wheel.handlers.pointerup({...point(0),clientX:150,clientY:150});assert.equal(writes.length,1,'invalid release must not order');
wheel.handlers.pointerdown(point(0));ctx.SHIPS[0]={...sh};wheel.handlers.pointerup(point(0));assert.equal(writes.length,1,'ship switch cancels drag');ctx.SHIPS[0]=sh;
ctx.TELE_UI.open=true;wheel.handlers.click({detail:0,isTrusted:false,target:{closest:()=>({dataset:{teleI:'0'}})}});assert.equal(writes.length,1,'synthetic touch click after cancelled drag must not order');
ctx.GSET.open=true;wheel.handlers.pointerdown(point(0));assert.equal(ctx.TELE_UI.drag,null);ctx.GSET.open=false;
sh.tele=4;let stopped=0;nodes.get('teleBox').handlers.keydown({key:'ArrowUp',stopPropagation(){stopped++},preventDefault(){}});assert.equal(writes.at(-1),3);assert.equal(stopped,1,'focused controls must not forward combat keys');
assert.equal(nodes.get('teleBox').handlers.keyup,undefined,'key releases must reach existing helm/sail cleanup');
const count=writes.length;ctx.TELE=[1,.5,-.5];nodes.get('teleQuickStop').onclick({stopPropagation(){}});assert.equal(writes.length,count,'missing zero order must never become nonzero stop');
ctx.SHIPS[0]={tele:0,cfg:{base:0}};assert.equal(ctx.teleCanOrder(),null);ctx.SHIPS[0]={...sh,sunk:true};assert.equal(ctx.teleCanOrder(),null);ctx.SHIPS[0]=sh;ctx.modeRule=()=>false;assert.equal(ctx.teleCanOrder(),null);
console.log(JSON.stringify({detents:9,customDetents:7,deadZones:4,previewWrites:0,cancelWrites:0,releaseWrites:1,shipSwitchCancelled:true,keyboardIsolated:true,keyReleasesPreserved:true}));

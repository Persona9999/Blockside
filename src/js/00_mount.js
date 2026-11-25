// ───────────────────────── 掛載點（TASK-1271 函式庫化②） ─────────────────────────
// 核心查元素、往頁面掛東西一律經過這幾個，⛔ 不直接碰 document.getElementById／querySelector(All)／body／head／documentElement
//   （admin.py layers --page 量、建置前擋變多的那一類）。現在 ＝ 這一頁本身；之後掛進別人的頁面（shadow root 裡的一個容器）只換這裡。
// 排在所有檔之前：00_config 讀不到設定檔就要往 BS_BODY 寫原因。
var BS_ROOT = document;                  // 查元素：$(id)、bsOne(選擇器)、bsAll(選擇器)
var BS_HEAD = document.head;             // <style>、<script> 往這裡放
var BS_BODY = document.body;             // 覆蓋層、量測頁的 <pre>、下載連結；body 上的 class（gfxov、bsHost、roomEdOn、flab、flab3d）
var BS_HTML = document.documentElement;  // html 上的 class（pickonly、tuionly）、CSS 變數、版面寬度
function $(id) { return BS_ROOT.getElementById(id); }
function bsOne(sel) { return BS_ROOT.querySelector(sel); }
function bsAll(sel) { return BS_ROOT.querySelectorAll(sel); }

// 輸入總管（TASK-1271 函式庫化③）：window／document 上的監聽一律 bsListen(哪裡, 事件, 函式, 選項) 掛、bsUnlisten 拿掉，⛔ 不直接 window／document.addEventListener。
//   哪裡：'win' ＝ window（鍵盤、blur、resize、message、error、pagehide…）；'doc' ＝ document（contextmenu、mousemove、touchend、pointerdown、全螢幕、pointer lock、visibilitychange）。
//   鍵盤、滑鼠、觸控、滾輪、右鍵（BS_GATED）先問 BS_INPUT.on：跟別的頁面同一頁時，外面那一頁切換它（核心不在前面 ⇒ 收不到鍵）；獨立版一直是 true。
//   BS_INPUT.list ＝ 現在掛著的每一個（卸載 bsUnlistenAll() 之後是 0 —— 讀數看這個長度）。
var BS_WIN = window, BS_DOC = document;
var BS_INPUT = { on: true, list: [] };
var BS_GATED = /^(key|pointer|mouse|touch|wheel|contextmenu)/;
function bsListen(where, type, fn, opt) {
  var t = where === 'doc' ? BS_DOC : BS_WIN;
  var w = BS_GATED.test(type) ? function (e) { if (BS_INPUT.on) return fn.call(this, e); } : fn;
  BS_INPUT.list.push({ t: t, type: type, fn: fn, w: w, cap: !!(opt === true || (opt && opt.capture)) });
  t.addEventListener(type, w, opt);
}
function bsUnlisten(where, type, fn, opt) {
  var t = where === 'doc' ? BS_DOC : BS_WIN, cap = !!(opt === true || (opt && opt.capture)), L = BS_INPUT.list;
  for (var i = 0; i < L.length; i++) if (L[i].t === t && L[i].type === type && L[i].fn === fn && L[i].cap === cap) { t.removeEventListener(type, L[i].w, cap); L.splice(i, 1); return; }
}
function bsUnlistenAll() { BS_INPUT.list.splice(0).forEach(function (x) { x.t.removeEventListener(x.type, x.w, x.cap); }); }
// 掛在 window／document 上的監聽要看「點到哪」⇒ bsTarget(e)：shadow root 裡的事件傳出來時 e.target 會換成宿主元素，composedPath()[0] 才是真正點到的那一個（這一頁本身時兩者相同）
function bsTarget(e) { var p = e.composedPath && e.composedPath(); return p && p.length ? p[0] : e.target; }
// 開機選項（TASK-1271 函式庫化④）：核心讀的網址參數、#pre=…、@host 的對象都從 BS_OPT 拿，⛔ 不直接讀 location.search／hash、window.parent／opener。
//   這一頁本身（獨立版、battle.html 開在 iframe 裡）⇒ 照網址；之後掛進別人的頁面 ⇒ 掛載的人給。
//   own：網址是核心自己的（換場時網址列跟著換）；framed：開在 iframe 裡（待命開機只在這種時候等外面那一頁）；host：@host 要講話的那一頁。
var BS_OPT = { query: location.search, hash: location.hash, own: true, framed: window.parent !== window, host: window.parent !== window ? window.parent : window.opener };
/** 換場（90_main.js sceneApply）：這一場的參數（不含 ?）與 #pre=…（沒有 ⇒ 空）。 */
function bsOptScene(q, h) { BS_OPT.query = '?' + q; BS_OPT.hash = h; }
// 版面大小：HUD、小地圖照「核心那一塊有多大」排 —— 這一頁本身 ＝ 視窗；之後掛進別人的頁面 ＝ 容器
function bsViewW() { return innerWidth; }
function bsViewH() { return innerHeight; }

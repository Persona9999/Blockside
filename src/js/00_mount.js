// ───────────────────────── 掛載點（TASK-1271 函式庫化②） ─────────────────────────
// 核心查元素、往頁面掛東西一律經過這幾個，⛔ 不直接碰 document.getElementById／querySelector(All)／body／head／documentElement
//   （admin.py layers --page 量、建置前擋變多的那一類）。現在 ＝ 這一頁本身；之後掛進別人的頁面（shadow root 裡的一個容器）只換這裡。
// 排在所有檔之前：00_config 讀不到設定檔就要往 BS_BODY 寫原因。
// 掛進別人的頁面（TASK-1271 函式庫化⑤）：blockside.js 的 BS.mount(容器, 選項) 建好 shadow root 之後，在叫這個閉包之前放一份 window.BS_MOUNT_NOW
//   { el 容器, root shadow root, head（＝ root）, body .bs-body, html .bs-html, opt 選項 }；沒有 ⇒ 這一頁本身（index.html 獨立版）。
var BS_M = window.BS_MOUNT_NOW || null;
var BS_ROOT = BS_M ? BS_M.root : document;                  // 查元素：$(id)、bsOne(選擇器)、bsAll(選擇器)
var BS_HEAD = BS_M ? BS_M.head : document.head;             // <style>、<script> 往這裡放
var BS_BODY = BS_M ? BS_M.body : document.body;             // 覆蓋層、量測頁的 <pre>、下載連結；body 上的 class（gfxov、bsHost、roomEdOn、flab、flab3d）
var BS_HTML = BS_M ? BS_M.html : document.documentElement;  // html 上的 class（pickonly、tuionly）、CSS 變數、版面寬度
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
var BS_OPT = BS_M ? BS_M.opt : { query: location.search, hash: location.hash, own: true, framed: window.parent !== window, host: window.parent !== window ? window.parent : window.opener };
/** 換場（90_main.js sceneApply）：這一場的參數（不含 ?）與 #pre=…（沒有 ⇒ 空）。 */
function bsOptScene(q, h) { BS_OPT.query = '?' + q; BS_OPT.hash = h; }
// 版面大小：HUD、小地圖照「核心那一塊有多大」排 —— 這一頁本身 ＝ 視窗；掛進別人的頁面 ＝ 容器
function bsViewW() { return BS_M ? BS_M.el.clientWidth : innerWidth; }
function bsViewH() { return BS_M ? BS_M.el.clientHeight : innerHeight; }

// 卸載（TASK-1271 函式庫化⑥；Tim 2026-11-26「先做重新掛載」）：同一頁裡掛上、拿下、再掛（地球儀不再每一場開一頁 iframe）⇒ 核心拿的頁面資源要收得回來。
//   計時器、畫面迴圈、Worker 在這裡用同名的函式蓋掉（整個閉包是同一個作用域 ⇒ 每支檔寫 setTimeout(…) 叫到的都是這幾個，呼叫的地方一行都不用改）：
//   記下還活著的那幾個 ⇒ bsDispose() 一次收掉；收過之後再叫 ⇒ 不排（拿下之後還在跑的 Promise 接下去也起不了新的迴圈）。
//   其他要收的（聲音、WebGL、資料庫、MessageChannel）各自 bsOnDispose(函式) 登記；監聽照 bsUnlistenAll。
//   BS_LIVE ＝ 讀數：還排著的 timeout／interval／畫面迴圈個數、Worker 個數（卸載之後要全是 0）。
var BS_DEAD = false, BS_LIVE = { t: new Set(), i: new Set(), r: new Set(), w: [] }, BS_DISPOSE = [];
function setTimeout(f, ms) {
  if (BS_DEAD) return 0;
  var a = Array.prototype.slice.call(arguments, 2), id = BS_WIN.setTimeout(function () { BS_LIVE.t.delete(id); f.apply(null, a); }, ms);
  BS_LIVE.t.add(id); return id;
}
function clearTimeout(id) { BS_LIVE.t.delete(id); BS_WIN.clearTimeout(id); }
function setInterval(f, ms) {
  if (BS_DEAD) return 0;
  var a = Array.prototype.slice.call(arguments, 2), id = BS_WIN.setInterval(function () { f.apply(null, a); }, ms);
  BS_LIVE.i.add(id); return id;
}
function clearInterval(id) { BS_LIVE.i.delete(id); BS_WIN.clearInterval(id); }
function requestAnimationFrame(f) {
  if (BS_DEAD) return 0;
  var id = BS_WIN.requestAnimationFrame(function (t) { BS_LIVE.r.delete(id); f(t); });
  BS_LIVE.r.add(id); return id;
}
function cancelAnimationFrame(id) { BS_LIVE.r.delete(id); BS_WIN.cancelAnimationFrame(id); }
function Worker(u, o) {                                   // new Worker(…) ⇒ 建構式回傳的物件就是結果（真的 Worker）
  if (BS_DEAD) throw new Error('Blockside 已經拿下來了：不再開 Worker');
  var w = new BS_WIN.Worker(u, o); BS_LIVE.w.push(w); return w;
}
function bsOnDispose(fn) { BS_DISPOSE.push(fn); }
function bsLiveN() { return { timeout: BS_LIVE.t.size, interval: BS_LIVE.i.size, frame: BS_LIVE.r.size, worker: BS_LIVE.w.length, listen: BS_INPUT.list.length }; }
/** 收掉這一份核心拿的頁面資源（BS.unmount 叫；回收之前的讀數）。登記的收尾照後登記的先收。 */
function bsDispose() {
  var n = bsLiveN(); if (BS_DEAD) return n;
  BS_DEAD = true; BS_INPUT.on = false;
  BS_DISPOSE.splice(0).reverse().forEach(function (f) { try { f(); } catch (e) { } });
  BS_LIVE.t.forEach(function (id) { BS_WIN.clearTimeout(id); }); BS_LIVE.t.clear();
  BS_LIVE.i.forEach(function (id) { BS_WIN.clearInterval(id); }); BS_LIVE.i.clear();
  BS_LIVE.r.forEach(function (id) { BS_WIN.cancelAnimationFrame(id); }); BS_LIVE.r.clear();
  BS_LIVE.w.splice(0).forEach(function (w) { try { w.terminate(); } catch (e) { } });
  bsUnlistenAll();
  return n;
}
if (BS_M) { BS_M.dispose = bsDispose; BS_M.live = bsLiveN; }

// 區塊職責：game 包直接綁在「這一頁」上的地方（TASK-1271 函式庫化①）—— 核心要能掛進別人的頁面（BS.mount），這些地方都得改成經過掛載點。
// 物理意義：Blockside 現在假設整頁都是它的：直接查 document、往 body／head 掛東西、在 window／document 上掛監聽、讀網址、拿視窗大小、
//   跟 parent 講話、往 window 寫名字。照作用域判（參數、var／let／const、函式名、catch 都算那一層；整個包的頂層名字也算）⇒ 區域同名的不算。
// 用法：node --expose-internals js_page.cjs <檔1> <檔2> …（照包裡的順序）⇒ 印一行 JSON [[檔, 行, 類, 字], …]
//   類：query（document 查元素）、mount（document.body／head／documentElement）、listen（window／document 的監聽、on* 指派）、
//       url（location、history、document.URL／referrer）、view（innerWidth／innerHeight）、focus（activeElement、全螢幕、pointer lock、hidden、title）、
//       host（parent／top／opener）、global（window.<名字> 讀寫：跟宿主頁共用同一個命名空間）
'use strict';
const fs = require('fs');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
function names(p, out) {
  if (!p) return;
  if (p.type === 'Identifier') out.push(p);
  else if (p.type === 'ObjectPattern') p.properties.forEach(function (q) { names(q.type === 'RestElement' ? q.argument : q.value, out); });
  else if (p.type === 'ArrayPattern') p.elements.forEach(function (q) { names(q, out); });
  else if (p.type === 'RestElement') names(p.argument, out);
  else if (p.type === 'AssignmentPattern') names(p.left, out);
}
function kids(n, fn) {
  for (const k of Object.keys(n)) {
    if (k === 'loc') continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach(function (x) { if (x && typeof x.type === 'string') fn(x, k); });
    else if (v && typeof v.type === 'string') fn(v, k);
  }
}
function isFn(n) { return n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression'; }
function declared(body, set) {
  (function walk(n) {
    if (n.type === 'VariableDeclaration') n.declarations.forEach(function (d) { const L = []; names(d.id, L); L.forEach(function (id) { set.add(id.name); }); });
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) set.add(n.id.name);
    if (n.type === 'CatchClause' && n.param) { const L = []; names(n.param, L); L.forEach(function (id) { set.add(id.name); }); }
    if (isFn(n) || n.type === 'ClassExpression') return;
    kids(n, walk);
  })(body);
  return set;
}
const DOC_Q = new Set(['getElementById', 'querySelector', 'querySelectorAll', 'getElementsByClassName', 'getElementsByTagName', 'getElementsByName', 'elementFromPoint', 'elementsFromPoint']);
const DOC_M = new Set(['body', 'head', 'documentElement']);
const DOC_U = new Set(['URL', 'referrer', 'location', 'baseURI']);
const DOC_F = new Set(['activeElement', 'fullscreenElement', 'exitFullscreen', 'pointerLockElement', 'exitPointerLock', 'hidden', 'visibilityState', 'title', 'hasFocus']);
const LISTEN = new Set(['addEventListener', 'removeEventListener']);
const VIEW = new Set(['innerWidth', 'innerHeight']);
const HOST = new Set(['parent', 'top', 'opener', 'frameElement']);
const URLS = new Set(['location', 'history']);
// window.<名字> 裡這些是瀏覽器本身的 API（不是寫進共用命名空間的名字）⇒ 不算 global
const WIN_API = new Set(['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'devicePixelRatio',
  'getComputedStyle', 'matchMedia', 'AudioContext', 'webkitAudioContext', 'OffscreenCanvas', 'Worker', 'URL', 'Blob', 'fetch', 'navigator', 'screen', 'crypto',
  'indexedDB', 'localStorage', 'sessionStorage', 'open', 'close', 'print', 'alert', 'confirm', 'prompt', 'scrollTo', 'getSelection', 'isSecureContext', 'caches',
  'requestIdleCallback', 'cancelIdleCallback', 'structuredClone', 'queueMicrotask', 'gc', 'onerror', 'onunhandledrejection', 'event', 'name', 'origin',
  'visualViewport', 'outerWidth', 'outerHeight', 'scrollX', 'scrollY', 'createImageBitmap', 'TextDecoder', 'TextEncoder', 'CompressionStream', 'DecompressionStream',
  'DOMParser', 'FileReader', 'Image', 'Path2D', 'ResizeObserver', 'MutationObserver', 'IntersectionObserver', 'WebGL2RenderingContext', 'WebGLRenderingContext',
  'SharedArrayBuffer', 'Atomics', 'WebAssembly', 'BroadcastChannel', 'MessageChannel', 'Notification', 'speechSynthesis', 'chrome', 'external', 'Promise', 'Symbol',
  'Math', 'JSON', 'Object', 'Array', 'Number', 'String', 'Date', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Intl', 'globalThis', 'self', 'window', 'document']);
const files = process.argv.slice(2), trees = {}, topNames = new Set();
for (const f of files) {
  trees[f] = acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true });
  trees[f].body.forEach(function (x) { declared(x, topNames); });
}
const out = [];
for (const f of files) {
  const glob = function (nm, chain) { return !topNames.has(nm) && !chain.some(function (s) { return s.has(nm); }); };
  const put = function (n, cls, word) { out.push([f, n.loc.start.line, cls, word]); };
  (function visit(n, chain, parent, key) {
    if (isFn(n)) {
      const own = new Set();
      if (n.id && n.type === 'FunctionExpression') own.add(n.id.name);
      n.params.forEach(function (p) { const L = []; names(p, L); L.forEach(function (id) { own.add(id.name); }); });
      if (n.type !== 'ArrowFunctionExpression') own.add('arguments');
      declared(n.body, own);
      n.params.forEach(function (p) { if (p.type === 'AssignmentPattern') visit(p.right, chain.concat([own]), p, 'right'); });
      visit(n.body, chain.concat([own]), n, 'body');
      return;
    }
    if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && glob(n.object.name, chain)) {
      const o = n.object.name, p = n.property.name;
      let cls = null;
      if (o === 'document') cls = DOC_Q.has(p) ? 'query' : DOC_M.has(p) ? 'mount' : DOC_U.has(p) ? 'url' : DOC_F.has(p) ? 'focus' : LISTEN.has(p) || /^on/.test(p) ? 'listen' : null;
      else if (o === 'window' || o === 'self' || o === 'globalThis') cls = LISTEN.has(p) || (/^on[a-z]+$/.test(p) && p !== 'onerror' && p !== 'onunhandledrejection') ? 'listen' :
        URLS.has(p) ? 'url' : VIEW.has(p) ? 'view' : HOST.has(p) ? 'host' : !WIN_API.has(p) ? 'global' : null;
      else if (o === 'history') cls = 'url';
      if (cls) { put(n, cls, o + '.' + p); return; }
    }
    if (n.type === 'Identifier' && glob(n.name, chain) &&
        !(parent && ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
          ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && key === 'key' && !parent.computed)))) {
      const nm = n.name;
      const cls = LISTEN.has(nm) ? 'listen' : URLS.has(nm) ? 'url' : VIEW.has(nm) ? 'view' : HOST.has(nm) ? 'host' : null;
      if (cls) put(n, cls, nm);
      return;
    }
    kids(n, function (c, k) { visit(c, chain, n, k); });
  })(trees[f], [], null, null);
}
console.log(JSON.stringify(out));

// ───────────────────────── 方舷放置：共用的小工具 ─────────────────────────
// 外殼的每支檔各自包一層、只透過 window.BSI 互相講話（核心是另一個閉包，只透過 window.BS_SHELL.core 講話，見 src/js/91_shellapi.js）。
(function (I) {
  'use strict';
  I.core = window.BS_SHELL && window.BS_SHELL.core || null;
  I.$ = function (id) { return document.getElementById(id); };
  /** 建一個元素：h('div', 'bsi-x', '<b>…</b>') */
  I.h = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  I.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  I.now = function () { return Date.now(); };
  I.pick = function (L) { return L[(Math.random() * L.length) | 0]; };
  I.esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/[<]/g, '&lt;').replace(/>/g, '&gt;'); };   // ⛔ 不寫成 /</g：admin.py shell 把內容裡的「</」換成「<\/」（免得提早關掉 script）⇒ 正規表示式就壞了

  // 大數字：照中文的萬進位（萬、億、兆、京…），再大就寫科學記號
  var UNITS = [['萬', 1e4], ['億', 1e8], ['兆', 1e12], ['京', 1e16], ['垓', 1e20], ['秭', 1e24], ['穰', 1e28], ['溝', 1e32], ['澗', 1e36], ['正', 1e40], ['載', 1e44], ['極', 1e48]];
  I.fmt = function (n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '−' + I.fmt(-n);
    if (n < 1e4) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toLocaleString('en-US');
    if (n >= 1e52) return n.toExponential(2).replace('e+', 'e');
    for (var i = UNITS.length - 1; i >= 0; i--) if (n >= UNITS[i][1]) {
      var v = n / UNITS[i][1];
      return (v >= 1000 ? Math.floor(v).toLocaleString('en-US') : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + UNITS[i][0];
    }
    return String(n);
  };
  I.pct = function (x) { return (x >= 10 ? Math.round(x * 100).toLocaleString('en-US') : x >= 1 ? (x * 100).toFixed(0) : (x * 100).toFixed(1)) + '%'; };
  I.mulTxt = function (x) { return '×' + (x >= 1e4 ? I.fmt(x) : x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)); };
  I.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return h ? h + ' 時 ' + m + ' 分' : m ? m + ' 分 ' + s + ' 秒' : s + ' 秒';
  };

  // 存檔（localStorage 可能不能用：私密視窗、被擋）⇒ 讀不到就照新的開始、寫不了就算了
  I.store = {
    get: function (k) { try { var s = window.localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* 照舊 */ } }
  };

  // 外殼自己的小事件（UI 跟戰鬥之間）
  var SUB = {};
  I.on = function (t, f) { (SUB[t] = SUB[t] || []).push(f); };
  I.emit = function (t, a, b, c) { (SUB[t] || []).forEach(function (f) { try { f(a, b, c); } catch (e) { console.error(e); } }); };
})(window.BSI = window.BSI || {});

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

// Frozen semantic sources; copies are checked byte-for-byte against Blocksail.
// Required assets are embedded so the standalone battle works offline as well.
// 成品只嵌一張圖集（src/admin.py atlas：每格 48 px；Tim 2026-11-06「打包成圖集」「可以直接縮成低解析度」）＋ 向量的 SVG；
// 圖示是 <span> 的背景（下面寫一份 CSS）⇒ HUD 每次改寫 innerHTML 只帶一小段標籤，不再新建 <img>、不再帶整段 base64 重新解碼（手機玩久閃退，同日）。
var BATTLE_ICON_SPEC = VK.embeddedJSON('battle-icons'), BATTLE_ATLAS = VK.embeddedJSON('battle-atlas'), BATTLE_ICONS = {}, BATTLE_ICON_IMAGES = {};
if (!BATTLE_ICON_SPEC) throw new Error('Missing battle icon manifest');
if (!BATTLE_ATLAS) throw new Error('Missing battle icon atlas (python -I src/admin.py atlas)');
var BATTLE_ATLAS_SRC = (function () {
  var el = document.getElementById('art-battle-atlas');
  if (!el || !el.textContent.trim()) throw new Error('Missing embedded battle icon atlas');
  return 'data:' + el.dataset.mime + ';base64,' + el.textContent.trim();
})();
(function () {
  // 外框照原本的大小排版（按鈕裡會是 37×29 這種長方形）；圖畫在 ::before：邊長 ＝ 外框寬高取小、置中（同以前 <img> 的 object-fit:contain）⇒ 圖集那一格不會被拉扁
  var A = BATTLE_ATLAS, css = ['.battle-icon{position:relative;container-type:size;}',
    '.battle-icon::before{content:"";position:absolute;left:50%;top:50%;width:min(100cqw,100cqh);height:min(100cqw,100cqh);transform:translate(-50%,-50%);background:no-repeat center/contain;}'];
  css.push('.battle-icon.bi-atlas::before{background-image:url("' + BATTLE_ATLAS_SRC + '");background-size:' + A.cols * 100 + '% ' + A.rows * 100 + '%;}');
  Object.keys(BATTLE_ICON_SPEC.icons).forEach(function (key) {
    var spec = BATTLE_ICON_SPEC.icons[key], at = A.icons[key], sel = '.battle-icon[data-battle-icon="' + key + '"]::before', src = null;
    if (at) css.push(sel + '{background-position:' + (A.cols > 1 ? at[0] / (A.cols - 1) * 100 : 0) + '% ' + (A.rows > 1 ? at[1] / (A.rows - 1) * 100 : 0) + '%;}');
    else {
      var el = document.getElementById('art-battle-' + key);
      if (!el || !el.textContent.trim()) throw new Error('Missing embedded battle icon: ' + key);
      src = 'data:' + el.dataset.mime + ';base64,' + el.textContent.trim();
      css.push(sel + '{background-image:url("' + src + '");}');
    }
    BATTLE_ICONS[key] = Object.freeze({ label: spec.label, at: at || null, src: src, cls: at ? 'battle-icon bi-atlas' : 'battle-icon' });
  });
  var st = document.createElement('style'); st.id = 'battle-icon-css'; st.textContent = css.join('\n'); document.head.appendChild(st);
})();
Object.freeze(BATTLE_ICONS);
var BATTLE_ICON_PATTERN = new RegExp('(' + Object.keys(BATTLE_ICON_SPEC.glyphs).sort(function(a,b){return b.length-a.length;}).join('|') + ')\\uFE0F?', 'gu');
function battleIconTag(key, extra, label) {
  var I = BATTLE_ICONS[key];
  return '<span class="' + I.cls + (extra ? ' ' + extra : '') + '" data-battle-icon="' + key + '" role="img" aria-label="' + (label || I.label) + '"></span>';
}
var BATTLE_ICON_HTML = {};
function battleIcon(key) {
  if (!Object.prototype.hasOwnProperty.call(BATTLE_ICONS, key)) throw new Error('Unknown battle icon: ' + key);
  return BATTLE_ICON_HTML[key] || (BATTLE_ICON_HTML[key] = battleIconTag(key));
}
// 左右舷方向共用同一張三角圖；左舷鏡射，避免通用「向左」箭頭與「繼續」三角混搭。
function battleAnchorIcon(port) {
  var direction = battleIconTag('play', port ? 'battle-anchor-port' : '', port ? '左舷' : '右舷');
  return port ? direction + battleIcon('anchor') : battleIcon('anchor') + direction;
}
function battleIconText(text) {
  return text.replace(/◀\uFE0F?⚓\uFE0F?|⚓\uFE0F?▶\uFE0F?/gu, function (pair) { return battleAnchorIcon(pair[0] === '◀'); }).replace(BATTLE_ICON_PATTERN, function (glyph) { return battleIcon(BATTLE_ICON_SPEC.glyphs[glyph.replace(/\uFE0F/g, '')][0]); });
}
function battleAutoIcon(html) { return '<span class="battle-auto">' + html + '<span class="battle-badge">' + battleIcon('repeat') + '</span></span>'; }
function battleDrawIcon(ctx, key, x, y, size) {
  var I = BATTLE_ICONS[key], u = I.at ? BATTLE_ATLAS_SRC : I.src, im = BATTLE_ICON_IMAGES[u];
  if (!im) { im = BATTLE_ICON_IMAGES[u] = new Image(); im.src = u; }
  if (!im.complete || !im.naturalWidth) return false;
  ctx.save();
  if (I.at) { var c = BATTLE_ATLAS.cell; ctx.drawImage(im, I.at[0] * c, I.at[1] * c, c, c, x, y, size, size); } else ctx.drawImage(im, x, y, size, size);
  ctx.restore(); return true;
}
// Static DOM once at boot; refreshed HUD strings convert before comparison.
[].forEach.call(document.querySelectorAll('span[data-battle-icon]:not(.battle-icon)'), function (el) { el.outerHTML = battleIcon(el.dataset.battleIcon); });
var BATTLE_ICON_WALK = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), BATTLE_ICON_TEXTS = [], BATTLE_ICON_NODE;
while ((BATTLE_ICON_NODE = BATTLE_ICON_WALK.nextNode())) BATTLE_ICON_TEXTS.push(BATTLE_ICON_NODE);
BATTLE_ICON_TEXTS.forEach(function (node) {
  if (!node.parentElement || node.parentElement.closest('script,style,textarea,select,svg,canvas,[contenteditable]')) return;
  if (battleIconText(node.data) === node.data) return;
  var box = document.createElement('span'); box.textContent = node.data;
  box.innerHTML = battleIconText(box.innerHTML);
  node.replaceWith.apply(node, Array.from(box.childNodes));
});

// Frozen semantic sources; copies are checked byte-for-byte against Blocksail.
// Required assets are embedded so the standalone battle works offline as well.
var BATTLE_ICON_SPEC = VK.embeddedJSON('battle-icons'), BATTLE_ICONS = {}, BATTLE_ICON_IMAGES = {};
if (!BATTLE_ICON_SPEC) throw new Error('Missing battle icon manifest');
Object.keys(BATTLE_ICON_SPEC.icons).forEach(function (key) {
  var spec = BATTLE_ICON_SPEC.icons[key], el = document.getElementById('art-battle-' + key);
  if (!el || !el.textContent.trim()) throw new Error('Missing embedded battle icon: ' + key);
  var src = 'data:' + el.dataset.mime + ';base64,' + el.textContent.trim();
  var html = '<img class="battle-icon" data-battle-icon="' + key + '" src="' + src + '" alt="' + spec.label + '" draggable="false">';
  BATTLE_ICONS[key] = Object.freeze({ label: spec.label, src: src, html: html });
});
Object.freeze(BATTLE_ICONS);
var BATTLE_ICON_PATTERN = new RegExp('(' + Object.keys(BATTLE_ICON_SPEC.glyphs).sort(function(a,b){return b.length-a.length;}).join('|') + ')\\uFE0F?', 'gu');
function battleIcon(key) {
  if (!Object.prototype.hasOwnProperty.call(BATTLE_ICONS, key)) throw new Error('Unknown battle icon: ' + key);
  return BATTLE_ICONS[key].html;
}
function battleIconText(text) {
  return text.replace(BATTLE_ICON_PATTERN, function (glyph) { return battleIcon(BATTLE_ICON_SPEC.glyphs[glyph.replace(/\uFE0F/g, '')][0]); });
}
function battleAutoIcon(html) { return '<span class="battle-auto">' + html + '<span class="battle-badge">' + battleIcon('repeat') + '</span></span>'; }
function battleDrawIcon(ctx, key, x, y, size) {
  var im = BATTLE_ICON_IMAGES[key];
  if (!im) { im = BATTLE_ICON_IMAGES[key] = new Image(); im.src = BATTLE_ICONS[key].src; }
  if (!im.complete || !im.naturalWidth) return false;
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(im, x, y, size, size); ctx.restore(); return true;
}
// Static DOM once at boot; refreshed HUD strings convert before comparison.
[].forEach.call(document.querySelectorAll('span[data-battle-icon]'), function (el) { el.outerHTML = battleIcon(el.dataset.battleIcon); });
var BATTLE_ICON_WALK = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), BATTLE_ICON_TEXTS = [], BATTLE_ICON_NODE;
while ((BATTLE_ICON_NODE = BATTLE_ICON_WALK.nextNode())) BATTLE_ICON_TEXTS.push(BATTLE_ICON_NODE);
BATTLE_ICON_TEXTS.forEach(function (node) {
  if (!node.parentElement || node.parentElement.closest('script,style,textarea,select,svg,canvas,[contenteditable]')) return;
  if (battleIconText(node.data) === node.data) return;
  var box = document.createElement('span'); box.textContent = node.data;
  box.innerHTML = battleIconText(box.innerHTML);
  node.replaceWith.apply(node, Array.from(box.childNodes));
});

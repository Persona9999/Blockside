// Battle HUD semantics are separate from town population and recruitment portraits.
// Required embedded PNG assets also work in the standalone, offline build.
var BATTLE_ICONS = {};
['sailor', 'cannon', 'shell', 'chain'].forEach(function (key) {
  var el = document.getElementById('art-battle-' + key);
  BATTLE_ICONS[key] = Object.freeze({ label: { sailor: '船員', cannon: '火砲', shell: '爆裂彈', chain: '鏈彈' }[key], src: el.textContent.trim() ? 'data:image/png;base64,' + el.textContent.trim() : el.getAttribute('src') });
});
Object.freeze(BATTLE_ICONS);
function battleIcon(key) {
  if (!Object.prototype.hasOwnProperty.call(BATTLE_ICONS, key)) throw new Error('Unknown battle icon: ' + key);
  var it = BATTLE_ICONS[key];
  return '<img class="battle-icon" data-battle-icon="' + key + '" src="' + it.src + '" alt="' + it.label + '" draggable="false">';
}
// Only icon strings from the key/help UI go through this adapter, never saved data.
function battleIconText(text) {
  return text.replace(/💥|💣|⛓️?/gu, function (glyph) { return battleIcon(glyph === '💥' ? 'cannon' : glyph === '💣' ? 'shell' : 'chain'); });
}
[].forEach.call(document.querySelectorAll('span[data-battle-icon]'), function (el) { el.outerHTML = battleIcon(el.dataset.battleIcon); });

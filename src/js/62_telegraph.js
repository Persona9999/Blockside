// Circular order instrument. Geometry uses the configured orders, not a hard-coded nine.
function teleStopIndex() { var i = TELE.indexOf(0); return i >= 0 ? i : Math.floor(TELE.length / 2); }
function teleAngle(i) { var s = teleStopIndex(), span = Math.PI * 0.75; return -Math.PI / 2 + (i <= s ? (s - i) / Math.max(1, s) : -(i - s) / Math.max(1, TELE.length - 1 - s)) * span; }
function telePickIndex(x, y) {
  var r = Math.hypot(x - 150, y - 150); if (r < 52 || r > 148) return -1;
  var a = Math.atan2(y - 150, x - 150), best = -1, bd = Infinity;
  for (var i = 0; i < TELE.length; i++) { var d = Math.abs(Math.atan2(Math.sin(a - teleAngle(i)), Math.cos(a - teleAngle(i)))); if (d < bd) { bd = d; best = i; } }
  var step = Math.PI * 0.75 / Math.max(1, best <= teleStopIndex() ? teleStopIndex() : TELE.length - 1 - teleStopIndex());
  return bd <= step * 0.55 ? best : -1; // Center and lower gap never mean full reverse.
}
var TELE_UI = { open: false, preview: -1, drag: null, ship: null, key: '', suppressClickUntil: 0 };
function teleCanOrder() { var sh = SHIPS[PLAYER_I]; return RUNNING && sh && !sh.sunk && sh.cfg.base > 0 && modeRule('battleKeys') && !GSET.open && !HELP.open && !$('teleBox').classList.contains('uiOff') ? sh : null; }
function teleClose(focus) {
  TELE_UI.open = false; TELE_UI.preview = -1; TELE_UI.drag = null;
  $('telePanel').hidden = true; $('teleOpen').setAttribute('aria-expanded', 'false');
  if (focus) $('teleOpen').focus({ preventScroll: true });
}
function teleOrder(i, close) {
  var sh = teleCanOrder(); if (!sh) return;
  teleSet(sh, i); if (close) teleClose(true); teleDraw(sh);
}
function teleFit(box) {
  var s = stageBox(), narrow = s.width <= 760, h = $(narrow ? 'helmL' : 'ctlRow'), r = h && h.getBoundingClientRect();
  var left = 12, bottom = 30;
  if (r && r.width && (narrow || r.left - s.left < 12 + box.offsetWidth + 8)) {
    if (narrow) left = Math.max(8, Math.min(s.width - box.offsetWidth - 8, r.left - s.left + (r.width - box.offsetWidth) / 2));
    bottom = Math.min(s.height - box.offsetHeight - 8, s.bottom - r.top + 8);
  }
  box.style.left = Math.round(left) + 'px'; box.style.bottom = Math.max(8, Math.round(bottom)) + 'px';
  if (TELE_UI.open) {
    var p = $('telePanel');
    p.style.left = Math.round(Math.max(8, Math.min(left, s.width - p.offsetWidth - 8))) + 'px';
    p.style.top = Math.round(Math.max(8, (s.height - p.offsetHeight) / 2)) + 'px';
  }
}
function telePaint(c, sh, expanded) {
  var w = c.clientWidth, dpr = Math.min(window.devicePixelRatio || 1, 2); if (!w) return;
  var size = Math.round(w * dpr); if (c.width !== size || c.height !== size) c.width = c.height = size;
  var g = c.getContext('2d'); g.setTransform(size / 300, 0, 0, size / 300, 0, 0); g.clearRect(0, 0, 300, 300);
  function disc(r, fill, stroke, width) { g.beginPath(); g.arc(150, 150, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); } }
  var brass = g.createLinearGradient(0, 0, 280, 300); brass.addColorStop(0, '#ffe3a0'); brass.addColorStop(.45, '#b8883c'); brass.addColorStop(.7, '#ead09a'); brass.addColorStop(1, '#6e4821');
  disc(146, '#201b16', '#151a20', 4); disc(140, brass); disc(128, '#183039', '#5c4025', 4); disc(122, '#e8dec0', '#0e202b', 3);
  var stop = teleStopIndex();
  for (var i = 0; i < TELE.length; i++) {
    var a = teleAngle(i), step = Math.PI * .75 / Math.max(1, i <= stop ? stop : TELE.length - 1 - stop), half = Math.min(step * .46, .24);
    g.beginPath(); g.arc(150, 150, 120, a - half, a + half); g.arc(150, 150, 82, a + half, a - half, true); g.closePath();
    g.fillStyle = i === stop ? '#e6c46e' : TELE[i] > 0 ? '#d4e1ca' : '#683b35'; g.fill();
    g.beginPath(); g.moveTo(150 + Math.cos(a) * 77, 150 + Math.sin(a) * 77); g.lineTo(150 + Math.cos(a) * 87, 150 + Math.sin(a) * 87); g.strokeStyle = '#483b2b'; g.lineWidth = 3; g.stroke();
    if (!expanded) { g.fillStyle = i === stop ? '#302411' : TELE[i] < 0 ? '#fff0cb' : '#21352d'; g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(TELE.length === 9 ? ['全','半','慢','微','停','微','慢','半','全'][i] : Math.round(Math.abs(TELE[i]) * 100), 150 + Math.cos(a) * 103, 150 + Math.sin(a) * 103); }
  }
  g.textAlign = 'center'; g.fillStyle = '#354a3d'; g.font = 'bold 18px sans-serif'; g.fillText('前進', 214, 184); g.fillStyle = '#783c35'; g.fillText('後退', 86, 184);
  var cap = sh.drive ? Math.sqrt(Math.max(0, sh.drive.cap)) : 1;
  for (i = 0; i < TELE.length; i++) if (Math.abs(TELE[i]) > cap + .005) { var ca = teleAngle(i); g.fillStyle = '#a44330'; g.fillRect(148 + Math.cos(ca) * 132, 148 + Math.sin(ca) * 132, 5, 5); }
  function needle(index, ghost) {
    var a = teleAngle(index); g.save(); g.translate(150, 150); g.rotate(a);
    g.beginPath(); g.moveTo(-27, -8); g.lineTo(89, -4); g.lineTo(99, 0); g.lineTo(89, 4); g.lineTo(-27, 8); g.closePath();
    g.fillStyle = ghost ? 'rgba(61,142,151,.45)' : '#d59a38'; g.strokeStyle = ghost ? '#1b7a8b' : '#493019'; g.lineWidth = ghost ? 3 : 4; g.fill(); g.stroke(); g.restore();
  }
  needle(sh.tele, false); if (expanded && TELE_UI.preview >= 0 && TELE_UI.preview !== sh.tele) needle(TELE_UI.preview, true);
  disc(20, brass, '#594022', 3); disc(7, '#f0d38a', '#8b632c', 2);
}
function teleDraw(sh) {
  var box = $('teleBox'), show = !!(sh && sh.cfg && sh.cfg.base > 0 && RUNNING);
  box.style.display = show ? '' : 'none';
  if (!show || !teleCanOrder() || (TELE_UI.open && TELE_UI.ship !== sh)) teleClose(false);
  var ob = $('obsB'); if (ob) ob.style.left = show ? Math.round(box.getBoundingClientRect().right + 8) + 'px' : '';
  if (!show) return;
  $('teleOpen').disabled = !teleCanOrder();
  [].forEach.call(box.querySelectorAll('.teleQuick button'),function(b){b.disabled=!teleCanOrder();});
  $('teleQuickStop').disabled = $('teleStop').disabled = !teleCanOrder() || TELE.indexOf(0) < 0;
  $('teleOpen').setAttribute('aria-label', '俥鐘：' + TELE_NAME[sh.tele] + '，點擊調整');
  if ($('teleOrder').textContent !== TELE_NAME[sh.tele]) $('teleOrder').textContent = TELE_NAME[sh.tele];
  var p = TELE_UI.preview, text = (p >= 0 ? '預選 ' + TELE_NAME[p] + '，放開下令。' : '指令：' + TELE_NAME[sh.tele] + '。') + (sh.drive && sh.drive.cap < .98 ? ' 動力可用 ' + Math.round(sh.drive.cap * 100) + '%' : '');
  if ($('teleStatus').textContent !== text) $('teleStatus').textContent = text;
  var speed = '航速 ' + (sh.spd * 1.944).toFixed(1) + ' 節'; if ($('teleSpeed').textContent !== speed) $('teleSpeed').textContent = speed;
  var key = sh.i + '/' + sh.tele + '/' + Math.round((sh.drive ? sh.drive.cap : 1) * 100) + '/' + TELE_UI.preview + '/' + TELE_UI.open + '/' + $('telc').clientWidth + '/' + $('teleDial').clientWidth + '/' + window.devicePixelRatio;
  if (key !== TELE_UI.key) {
    TELE_UI.key = key; telePaint($('telc'), sh, false); if (TELE_UI.open) telePaint($('teleDial'), sh, true);
    [].forEach.call($('teleDetents').children, function(b){ b.setAttribute('aria-pressed', +b.dataset.teleI === sh.tele ? 'true' : 'false'); b.classList.toggle('preview', +b.dataset.teleI === TELE_UI.preview); });
  }
  teleFit(box);
}
// Pointer previews never touch simulation. A release commits one order to the same ship.
(function () {
  var wheel = $('teleWheel');
  TELE.forEach(function(_, i) {
    var b = document.createElement('button'), a = teleAngle(i); b.type = 'button'; b.dataset.teleI = i; b.setAttribute('aria-label', TELE_NAME[i]);
    if (/^(前進|後退)/.test(TELE_NAME[i])) { var direction = document.createElement('span'), rank = document.createElement('strong'); direction.textContent = TELE_NAME[i].slice(0, 2); rank.textContent = TELE_NAME[i].slice(2); b.appendChild(direction); b.appendChild(rank); } else b.textContent = TELE_NAME[i];
    b.style.left = (50 + Math.cos(a) * 112 / 3) + '%'; b.style.top = (50 + Math.sin(a) * 112 / 3) + '%'; $('teleDetents').appendChild(b);
  });
  $('teleOpen').onclick = function () {
    var sh = teleCanOrder(); if (!sh) return;
    TELE_UI.open = true; TELE_UI.ship = sh; TELE_UI.key = ''; $('telePanel').hidden = false; $('teleOpen').setAttribute('aria-expanded', 'true'); teleDraw(sh);
    $('teleDetents').children[sh.tele].focus({ preventScroll: true });
  };
  $('teleClose').onclick = function () { teleClose(true); };
  [$('teleStop'), $('teleQuickStop')].forEach(function(b){ b.onclick = function(e){e.stopPropagation();if(TELE.indexOf(0)>=0)teleOrder(TELE.indexOf(0), b.id === 'teleStop');}; });
  function pick(e) { var r = wheel.getBoundingClientRect(); return telePickIndex((e.clientX - r.left) / r.width * 300, (e.clientY - r.top) / r.height * 300); }
  wheel.addEventListener('pointerdown', function(e){
    if (e.button !== 0 || e.isPrimary === false || TELE_UI.drag || e.target.closest('[data-tele-stop]') || !teleCanOrder()) return;
    var i = pick(e); if (i < 0) return; e.preventDefault(); e.stopPropagation();
    TELE_UI.drag = { id:e.pointerId, ship:SHIPS[PLAYER_I] }; TELE_UI.preview = i; wheel.setPointerCapture(e.pointerId); teleDraw(SHIPS[PLAYER_I]);
  });
  wheel.addEventListener('pointermove', function(e){if (!TELE_UI.drag || TELE_UI.drag.id !== e.pointerId) return; TELE_UI.preview = pick(e); teleDraw(SHIPS[PLAYER_I]);});
  wheel.addEventListener('pointerup', function(e){
    var d = TELE_UI.drag; if (!d || d.id !== e.pointerId) return; var i = pick(e); TELE_UI.drag = null; TELE_UI.preview = -1; TELE_UI.suppressClickUntil = performance.now() + 500;
    if (i >= 0 && d.ship === teleCanOrder()) teleOrder(i, true); else teleDraw(SHIPS[PLAYER_I]);
  });
  ['pointercancel','lostpointercapture'].forEach(function(name){wheel.addEventListener(name,function(){TELE_UI.drag = null; TELE_UI.preview = -1; TELE_UI.suppressClickUntil = performance.now() + 500; if(SHIPS[PLAYER_I]) teleDraw(SHIPS[PLAYER_I]);});});
  wheel.addEventListener('click', function(e){var b=e.target.closest('[data-tele-i]');if(TELE_UI.open && e.detail===0 && b && !(e.isTrusted===false && performance.now()<TELE_UI.suppressClickUntil)) teleOrder(+b.dataset.teleI,true);});
  function keys(e) {
    e.stopPropagation(); var k=e.key, act=keyAct('battle',k.toLowerCase());
    if(k==='Escape'){e.preventDefault();teleClose(true);return;}
    var sh=teleCanOrder();if(!sh)return;
    if(k==='ArrowUp'||k==='ArrowRight'||act==='teleFwd'){e.preventDefault();teleOrder(sh.tele-1,false);}
    else if(k==='ArrowDown'||k==='ArrowLeft'||act==='teleBack'){e.preventDefault();teleOrder(sh.tele+1,false);}
    else if(k==='Home'){e.preventDefault();teleOrder(0,false);}
    else if(k==='End'){e.preventDefault();teleOrder(TELE.length-1,false);}
  }
  // Key releases must still reach the controller so a previously held helm/sail cannot stick.
  [$('teleBox'),$('telePanel')].forEach(function(b){b.addEventListener('keydown',keys);});
  document.addEventListener('pointerdown',function(e){if(TELE_UI.open && !e.target.closest('#telePanel,#teleOpen'))teleClose(false);},true);
})();

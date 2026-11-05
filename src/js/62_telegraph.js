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
var TELE_UI = { preview: -1, drag: null, key: '', suppressClickUntil: 0 };
function teleCanOrder() { var sh = SHIPS[PLAYER_I]; return RUNNING && sh && !sh.sunk && sh.cfg.base > 0 && modeRule('battleKeys') && !GSET.open && !HELP.open && !$('teleBox').classList.contains('uiOff') ? sh : null; }
function teleCancel() {
  if (TELE_UI.drag) TELE_UI.suppressClickUntil = performance.now() + 500;
  TELE_UI.preview = -1; TELE_UI.drag = null;
}
function teleOrder(i) { var sh = teleCanOrder(); if (!sh) return; teleSet(sh, i); teleDraw(sh); }
function teleFit(box) {
  var s = stageBox(), narrow = s.width <= 760, h = $(narrow ? 'helmL' : 'ctlRow'), r = h && h.getBoundingClientRect();
  var left = 12, bottom = 30;
  if (r && r.width && (narrow || r.left - s.left < 12 + box.offsetWidth + 8)) {
    if (narrow) left = Math.max(8, Math.min(s.width - box.offsetWidth - 8, r.left - s.left + (r.width - box.offsetWidth) / 2));
    bottom = Math.min(s.height - box.offsetHeight - 8, s.bottom - r.top + 8);
  }
  box.style.left = Math.round(left) + 'px'; box.style.bottom = Math.max(8, Math.round(bottom)) + 'px';
}
function telePaint(c, sh) {
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
    if (i === sh.tele || i === TELE_UI.preview) { g.strokeStyle = i === TELE_UI.preview ? '#55bcc8' : '#c28c2b'; g.lineWidth = 5; g.stroke(); }
    g.beginPath(); g.moveTo(150 + Math.cos(a) * 77, 150 + Math.sin(a) * 77); g.lineTo(150 + Math.cos(a) * 87, 150 + Math.sin(a) * 87); g.strokeStyle = '#483b2b'; g.lineWidth = 3; g.stroke();
    { g.fillStyle = i === stop ? '#302411' : TELE[i] < 0 ? '#fff0cb' : '#21352d'; g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(TELE.length === 9 ? ['全','半','慢','微','停','微','慢','半','全'][i] : Math.round(Math.abs(TELE[i]) * 100), 150 + Math.cos(a) * 103, 150 + Math.sin(a) * 103); }
  }
  g.textAlign = 'center'; g.fillStyle = '#354a3d'; g.font = 'bold 18px sans-serif'; g.fillText('前進', 214, 184); g.fillStyle = '#783c35'; g.fillText('後退', 86, 184);
  var cap = sh.drive ? Math.sqrt(Math.max(0, sh.drive.cap)) : 1;
  for (i = 0; i < TELE.length; i++) if (Math.abs(TELE[i]) > cap + .005) { var ca = teleAngle(i); g.fillStyle = '#a44330'; g.fillRect(148 + Math.cos(ca) * 132, 148 + Math.sin(ca) * 132, 5, 5); }
  function needle(index, ghost) {
    var a = teleAngle(index); g.save(); g.translate(150, 150); g.rotate(a);
    g.beginPath(); g.moveTo(-27, -8); g.lineTo(89, -4); g.lineTo(99, 0); g.lineTo(89, 4); g.lineTo(-27, 8); g.closePath();
    g.fillStyle = ghost ? 'rgba(61,142,151,.45)' : '#d59a38'; g.strokeStyle = ghost ? '#1b7a8b' : '#493019'; g.lineWidth = ghost ? 3 : 4; g.fill(); g.stroke(); g.restore();
  }
  needle(sh.tele, false); if (TELE_UI.preview >= 0 && TELE_UI.preview !== sh.tele) needle(TELE_UI.preview, true);
  disc(20, brass, '#594022', 3); disc(7, '#f0d38a', '#8b632c', 2);
}
function teleDraw(sh) {
  var box = $('teleBox'), show = !!(sh && sh.cfg && sh.cfg.base > 0 && RUNNING), can = teleCanOrder();
  box.style.display = show ? '' : 'none';
  if (!show || !can || (TELE_UI.drag && TELE_UI.drag.ship !== sh)) teleCancel();
  var ob = $('obsB'); if (ob) ob.style.left = show ? Math.round(box.getBoundingClientRect().right + 8) + 'px' : '';
  if (!show) return;
  [].forEach.call(box.querySelectorAll('button'), function(b){ b.disabled = !can; });
  $('teleQuickStop').disabled = $('teleStop').disabled = !can || TELE.indexOf(0) < 0;
  $('teleWheel').classList.toggle('dragging', !!TELE_UI.drag);
  $('teleWheel').setAttribute('aria-label', '俥鐘：' + TELE_NAME[sh.tele] + '，直接拖曳或點選檔位');
  var p = TELE_UI.preview, label = p >= 0 ? '預選：' + TELE_NAME[p] : TELE_NAME[sh.tele];
  if ($('teleOrder').textContent !== label) $('teleOrder').textContent = label;
  var text = (p >= 0 ? '預選 ' + TELE_NAME[p] + '，放開下令。' : '指令：' + TELE_NAME[sh.tele] + '。') + (sh.drive && sh.drive.cap < .98 ? ' 動力可用 ' + Math.round(sh.drive.cap * 100) + '%' : '');
  if ($('teleStatus').textContent !== text) $('teleStatus').textContent = text;
  var speed = '航速 ' + (sh.spd * 1.944).toFixed(1) + ' 節'; if ($('teleSpeed').textContent !== speed) $('teleSpeed').textContent = speed;
  var key = sh.i + '/' + sh.tele + '/' + Math.round((sh.drive ? sh.drive.cap : 1) * 100) + '/' + TELE_UI.preview + '/' + $('telc').clientWidth + '/' + window.devicePixelRatio;
  if (key !== TELE_UI.key) {
    TELE_UI.key = key; telePaint($('telc'), sh);
    [].forEach.call($('teleDetents').children, function(b){ b.setAttribute('aria-pressed', +b.dataset.teleI === sh.tele ? 'true' : 'false'); });
  }
  teleFit(box);
}
// One inline instrument: preview while held, commit once on release, cancel outside.
(function () {
  var wheel = $('teleWheel');
  TELE.forEach(function(_, i) {
    var b = document.createElement('button'), a = teleAngle(i); b.type = 'button'; b.dataset.teleI = i; b.setAttribute('aria-label', TELE_NAME[i]); b.title = TELE_NAME[i];
    b.style.left = (50 + Math.cos(a) * 103 / 3) + '%'; b.style.top = (50 + Math.sin(a) * 103 / 3) + '%'; $('teleDetents').appendChild(b);
  });
  $('teleQuickStop').onclick = function(e){e.stopPropagation();if(TELE.indexOf(0)>=0)teleOrder(TELE.indexOf(0));};
  function pick(e) { var r = wheel.getBoundingClientRect(); return telePickIndex((e.clientX - r.left) / r.width * 300, (e.clientY - r.top) / r.height * 300); }
  function moved(d,e) { return Math.hypot(e.clientX-d.x,e.clientY-d.y)>=6; }
  wheel.addEventListener('pointerdown', function(e){
    if (e.button !== 0 || e.isPrimary === false || TELE_UI.drag || !teleCanOrder()) return;
    var stop = !!e.target.closest('[data-tele-stop]'), i = pick(e); if (i < 0 && !stop) return;
    if (stop && TELE.indexOf(0)<0) return;
    e.preventDefault(); e.stopPropagation();
    TELE_UI.drag = { id:e.pointerId, ship:SHIPS[PLAYER_I], x:e.clientX, y:e.clientY, stop:stop, moved:false };
    TELE_UI.preview = i; wheel.setPointerCapture(e.pointerId); teleDraw(SHIPS[PLAYER_I]);
  });
  wheel.addEventListener('pointermove', function(e){
    var d=TELE_UI.drag;if(!d || d.id!==e.pointerId)return;
    d.moved=d.moved||moved(d,e);TELE_UI.preview=d.stop&&!d.moved?-1:pick(e);teleDraw(SHIPS[PLAYER_I]);
  });
  wheel.addEventListener('pointerup', function(e){
    var d=TELE_UI.drag;if(!d || d.id!==e.pointerId)return;
    var i=d.stop&&!d.moved&&!moved(d,e)?TELE.indexOf(0):pick(e);
    teleCancel();
    if(i>=0 && d.ship===teleCanOrder())teleOrder(i);else if(SHIPS[PLAYER_I])teleDraw(SHIPS[PLAYER_I]);
  });
  function cancel(){teleCancel();if(SHIPS[PLAYER_I])teleDraw(SHIPS[PLAYER_I]);}
  ['pointercancel','lostpointercapture'].forEach(function(name){wheel.addEventListener(name,cancel);});
  window.addEventListener('blur',cancel);
  wheel.addEventListener('click', function(e){
    if(e.detail!==0 || (e.isTrusted===false && performance.now()<TELE_UI.suppressClickUntil))return;
    var b=e.target.closest('[data-tele-i]');
    if(b)teleOrder(+b.dataset.teleI);else if(e.target.closest('[data-tele-stop]') && TELE.indexOf(0)>=0)teleOrder(TELE.indexOf(0));
  });
  $('teleBox').addEventListener('keydown', function(e){
    e.stopPropagation();var k=e.key,act=keyAct('battle',k.toLowerCase());
    if(k==='Escape'){e.preventDefault();cancel();return;}
    var sh=teleCanOrder();if(!sh)return;
    if(!hasSails(sh) && (act==='sailUp'||act==='sailDn')){e.preventDefault();doAct(act,e.repeat);return;}
    if(k==='ArrowUp'||k==='ArrowRight'||act==='teleFwd'){e.preventDefault();teleOrder(sh.tele-1);}
    else if(k==='ArrowDown'||k==='ArrowLeft'||act==='teleBack'){e.preventDefault();teleOrder(sh.tele+1);}
    else if(k==='Home'){e.preventDefault();teleOrder(0);}
    else if(k==='End'){e.preventDefault();teleOrder(TELE.length-1);}
  }); // Keyup still reaches the controller's helm/sail cleanup.
})();

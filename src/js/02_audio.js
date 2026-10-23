// ───────────────────────── 音效（按下開始後才建；沒有聲音也完整） ─────────────────────────
var AC = null, master = null, noiseBuf = null, muted = false;
// 爆音（Tim 2026-10-15：「目前爆炸太頻繁會爆音」）：以前每個聲音各自接 master、沒有上限 ⇒ 一次齊射幾十門＋殉爆＋碎裂疊起來加總 > 1 ⇒ 削波。兩層：
//   ① master 後面一個限制器（DynamicsCompressor：門檻 −14 dB、比 20、起 2 ms、放 250 ms）⇒ 疊再多也壓在 0 dBFS 以下；
//   ② 同時發聲：同一種在 SFX_WIN 秒內最多 SFX_SAME 個（人耳分不出來、只是更大聲）、全部最多 SFX_MAX 個還在響 ⇒ 多的不放（只是聲音；不碰模擬的亂數）。
var SFX_MAX = 24, SFX_SAME = 3, SFX_WIN = 0.06, SFX_END = [], SFX_RECENT = {};
function initAudio() {
  if (AC || DEMO >= 0) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.8;
    var lim = AC.createDynamicsCompressor(); lim.threshold.value = -14; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.25;
    master.connect(lim); lim.connect(AC.destination); AC.lim = lim;
    ['sfxBus', 'ambBus', 'bgmBus'].forEach(function (k) { var b = AC.createGain(); b.gain.value = 0; b.connect(master); AC[k] = b; });   // 三條音量線（TASK-0677，聲音設定頁）：音效／環境音（02_ambient.js）／背景音樂（02_music.js）；值照 SND（sndApply）
    sndApply();
    noiseBuf = noiseMake(AC);
  } catch (e) { AC = null; }
}
/** 兩秒白雜音（固定種子；ac 可以是 OfflineAudioContext —— hitLab 離線錄的時候遊戲的 AC 可能還沒建）。 */
function noiseMake(ac) {
  var n = ac.sampleRate * 2, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0), s = 22222;
  for (var i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; }
  return b;
}
var HIT_LOG = [];                                                        // 最近 32 聲碰撞（__game.hitLog；只記、不管有沒有聲音）
function sfxPlay(kind, at, vol, opt) {
  if (kind === 'hit') { HIT_LOG.push({ t: +SIMT.toFixed(2), I: +(vol || 0).toFixed(3), mat: (opt || {}).mat, bed: (opt || {}).bed || null, slide: (opt || {}).slide || 0, rub: !!(opt || {}).rub }); if (HIT_LOG.length > 32) HIT_LOG.shift(); }
  if (!AC || muted) return;
  if (kind === 'boom' || kind === 'blast') SND_FIGHT = AC.currentTime;     // 開砲、爆炸 ⇒ 交戰中（02_music.js：BGM「交戰時小聲一點」那一檔 × BGM_DUCK）
  var dist = at ? len(sub(at, CAM.eye)) : 0, v = (kind === 'hit' ? hitLoud(vol || 0) : vol || 1) / (1 + dist / 70);   // hit 的 vol 是力道（0–1），音量照它換（hitLoud）
  if (v < 0.01) return;
  var now = AC.currentTime, rec = SFX_RECENT[kind] || (SFX_RECENT[kind] = []);
  while (SFX_END.length && SFX_END[0] < now) SFX_END.shift();
  while (rec.length && rec[0] < now - SFX_WIN) rec.shift();
  if (rec.length >= SFX_SAME || SFX_END.length >= SFX_MAX) return;     // 同一種剛放過好幾個、或已經太多聲音在響 ⇒ 這一個不放
  rec.push(now);
  var t = AC.currentTime + Math.min(0.25, dist / 340) * 0.5;
  if (kind === 'hit') { sfxEnd(t + hitVoice(AC, AC.sfxBus, t, vol || 0, v, opt || {}, Math.random) + 0.05); return; }
  var g = AC.createGain(); g.connect(AC.sfxBus);
  var src = AC.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.6 + Math.random() * 0.5;
  var f = AC.createBiquadFilter(); src.connect(f); f.connect(g);
  function env(a, d) { sfxEnd(t + d + 0.05); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); src.start(t, Math.random()); src.stop(t + d + 0.05); }
  if (kind === 'boom') {
    f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(90, t + 0.9); env(1.1, 1.3);
    var o = AC.createOscillator(), og = AC.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.6);
    og.gain.setValueAtTime(0.9 * v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); o.connect(og); og.connect(AC.sfxBus); o.start(t); o.stop(t + 0.75);
  } else if (kind === 'crack') { f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 900; f.Q.value = 0.8; env(1.4, 0.35); }
  else if (kind === 'splash') { f.type = 'highpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2500, t + 0.5); env(0.6, 0.8); }
  else if (kind === 'blast') { f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(60, t + 1.8); env(1.6, 2.2); }
  else if (kind === 'thunder') { f.type = 'lowpass'; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(40, t + 3.2); env(1.5, 3.6); }   // 暴風雨的雷（08_weather.js）
  else if (kind === 'knock') { f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 500; f.Q.value = 3; env(1.2, 0.07); }   // 木匠的槌子敲下去（41_crew_art.js carpHitFx；TASK-0676）：短、硬的一聲木頭
  else if (kind === 'creak') { f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(80, t + 2.5); env(1.2, 2.8); }
}
function sfxEnd(e) { var k = SFX_END.length; while (k > 0 && SFX_END[k - 1] > e) k--; SFX_END.splice(k, 0, e); }   // 這一個聲音什麼時候停（照時間排好；同時發聲的上限照它數）

// ───── 碰撞與觸礁（TASK-0868；Tim 2026-10-23：「希望可以更沉悶一些 另外木頭跟金屬材質可以用兩種音效(都用合成音)」「不直接用音檔 且根據撞擊力道變化音效」「觸礁也是」）─────
// 以前擦撞、撞擊事件、觸礁都放 crack（雜音過 900–1800 Hz 帶通、0.35 秒 ＝ 砲彈打中木頭那一聲）⇒ 脆；音量固定 1／1.2／1.6，跟力道、材質無關。
// 現在 sfx('hit', 撞點, 力道 I（0–1）, { mat, bed, slide, rub })，全部現場合成，整串最後過一個低通（悶；HIT_LP）：
//   · 共同：一聲往下掉的低頻（木 75 Hz、金屬 62 Hz 起，力道越大越低）＋ 一段低通的衝擊雜音（力道越大越亮一點、越長）。
//     ⚠ 只有低頻 ⇒ 筆電喇叭放不出來（第一版量過：頻譜重心 83–173 Hz）⇒ 聽得到的那一層是下面 150–600 Hz 的共鳴，低頻只當底。
//   · 木頭 'wood'：四個木板的共鳴（150–190 Hz × 1、1.62、2.35、3.1 的正弦，0.1–0.4 秒就沒了：木頭吸振）＋ 一段帶通的粗糙聲 ＋ 重撞時散在半秒裡的幾粒悶的碎裂聲（⌊I² × 7⌋ 粒）＋ I > 0.6 船身受力的低沉嘎吱。
//   · 金屬 'metal'：鐵板那種不成倍數的分音（150–180 Hz × 1、1.59、2.14、2.83、3.71；每個兩支差 0.4% 的正弦 ⇒ 會拍），餘響 0.7–2.7 秒；力道越大分音越多。
//   · 觸礁 bed 'rock'（礁石、珊瑚、岩壁）：再加一段刮擦（帶通雜音一段接一段、中心頻率每段亂跳），長 slide 秒；'sand'（沙、泥、岸）：只加一段很低、很長的沙沙聲。
//   力道 → 音量：hitLoud；力道怎麼算在發聲的那一邊（31_sailing.js hitSfx：撞擊動能；32_ground.js groundSfx：底的硬度 × 速度²）。
//   R ＝ 亂數（遊戲用 Math.random；hitLab 用固定種子 ⇒ 每次錄的一樣）。⛔ 只是聲音：不抽模擬的 rnd()。
var HIT_LP = { wood: [520, 700], metal: [800, 1000] };                  // 整串最後的低通：基準 ＋ 力道 × 增量（Hz）
function hitLoud(I) { return 0.5 + 1.1 * clamp(I, 0, 1); }
/** 合成一聲碰撞（ac 可以是 OfflineAudioContext）：t 開始、I 力道、v 音量、o ＝ { mat, bed, slide }。回傳從 t 起響幾秒。 */
function hitVoice(ac, out, t, I, v, o, R) {
  I = clamp(I, 0, 1);
  var metal = o.mat === 'metal', nb = noiseBuf || noiseMake(ac), dur = 0, Lp = HIT_LP[metal ? 'metal' : 'wood'], lp = ac.createBiquadFilter(), bus = ac.createGain();
  lp.type = 'lowpass'; lp.frequency.value = Lp[0] + Lp[1] * I; lp.Q.value = 0.4; bus.gain.value = v; lp.connect(bus); bus.connect(out);
  function env(p, a, at, d, t0) { p.setValueAtTime(0.0001, t0); p.exponentialRampToValueAtTime(a, t0 + at); p.exponentialRampToValueAtTime(0.0001, t0 + at + d); }
  function tone(type, f0, f1, a, d, dt) {
    var t0 = t + (dt || 0), s = ac.createOscillator(), g = ac.createGain();
    s.type = type; s.frequency.setValueAtTime(f0, t0); s.frequency.exponentialRampToValueAtTime(f1, t0 + d); env(g.gain, a, 0.004, d, t0);
    s.connect(g); g.connect(lp); s.start(t0); s.stop(t0 + d + 0.05); dur = Math.max(dur, (dt || 0) + d + 0.05);
  }
  function hiss(type, f0, f1, Q, a, at, d, dt, rate) {
    var t0 = t + (dt || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; s.playbackRate.value = rate || 1; f.type = type; f.Q.value = Q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + at + d);
    env(g.gain, a, at, d, t0); s.connect(f); f.connect(g); g.connect(lp); s.start(t0, R() * 1.5); s.stop(t0 + at + d + 0.05); dur = Math.max(dur, (dt || 0) + at + d + 0.05);
  }
  if (!o.rub) {                                                          // rub：觸礁之後還在動，只刮、不再撞一聲（32_ground.js groundSfx）
    var f0 = (metal ? 62 : 75) * (1 - 0.3 * I) * (0.94 + 0.12 * R());
    tone('sine', f0 * 1.7, f0, metal ? 0.38 : 0.3, 0.2 + 0.45 * I);                // 悶的那一聲（低到筆電喇叭放不太出來 ⇒ 只當底，聽得到的在下面的共鳴）
    hiss('lowpass', 350 + 800 * I, 160, 0.7, 1.2, 0.003, 0.08 + 0.25 * I);         // 衝擊雜音
    if (metal) {
      var fb = (150 + 30 * R()) * (1 - 0.2 * I), dm = 0.7 + 2 * I;
      [1, 1.59, 2.14, 2.83, 3.71].slice(0, 2 + Math.round(3 * I)).forEach(function (r, k) {   // 鐵板的分音（不成倍數；兩支差 0.4% ⇒ 會拍）
        var a = 0.3 / (1 + 0.5 * k), d = dm / (1 + 0.35 * k);
        tone('sine', fb * r, fb * r * 0.995, a, d); tone('sine', fb * r * 1.004, fb * r * 0.999, a * 0.7, d * 0.9);
      });
      hiss('bandpass', 500 + 300 * R(), 350, 3, 0.5 + 0.4 * I, 0.002, 0.08 + 0.1 * I);   // 鐵板撞上的那一下（短、不亮）
    } else {
      var fw = (150 + 40 * R()) * (1 - 0.15 * I);
      [1, 1.62, 2.35, 3.1].forEach(function (r, k) { tone('sine', fw * r * 1.03, fw * r, 0.6 / (1 + 0.5 * k), (0.15 + 0.25 * I) / (1 + 0.3 * k)); });   // 木板的共鳴（短：木頭吸振）
      hiss('bandpass', fw * 2, fw * 1.6, 4, 1.2, 0.002, 0.1 + 0.2 * I);            // 木頭的粗糙
      for (var c = Math.floor(I * I * 7); c > 0; c--) hiss('bandpass', 300 + 500 * R(), 220, 1.5, 0.8 + 0.6 * I, 0.002, 0.04 + 0.08 * R(), 0.03 + 0.5 * I * R());   // 碎裂（悶的）
      if (I > 0.6) tone('sawtooth', 52 + 10 * R(), 40, 0.12 * (I - 0.6) / 0.4, 0.6 + 0.8 * I, 0.08);   // 船身受力的嘎吱
    }
  }
  var sl = Math.min(3, o.slide || 0);
  if (o.bed === 'rock' && sl > 0) for (var k = 0, n = Math.ceil(sl / 0.12); k < n; k++) hiss('bandpass', 220 + 380 * R(), 180 + 250 * R(), 2.5, (1 + 0.8 * I) * (1 - 0.5 * k / n), 0.03, 0.12 + 0.1 * R(), 0.05 + k * 0.12, 0.7);   // 刮過礁石
  if (o.bed === 'sand' && sl > 0) hiss('lowpass', 300, 140, 0.5, 1 + 0.6 * I, 0.08, sl, 0.03, 0.5);   // 擦過沙底
  return dur;
}
/** 試聽集（__game.hitLab；src/tests/ambient_lab.py --lab hit）：每段 sec 秒、跟遊戲同一個限制器；含舊的 crack 當對照。?cases=名字:I:mat:bed:slide:rub;… 換掉（I < 0 ＝ 舊的 crack、音量 −I）。
 *  回 Promise<[{ name, peak, rmsDb, wav, cent（頻譜重心 Hz）, hi（1 kHz 以上的能量佔幾 %）, lo（150 Hz 以下佔幾 %） }]>。 */
var HIT_CASES = [['舊 crack 擦撞 ×1', -1], ['舊 crack 觸礁 ×1.2', -1.2], ['舊 crack 撞擊 ×1.6', -1.6],
  ['木 輕碰 I0', 0, 'wood'], ['木 I0.3', 0.3, 'wood'], ['木 I0.6', 0.6, 'wood'], ['木 重撞 I1', 1, 'wood'],
  ['鐵 輕碰 I0', 0, 'metal'], ['鐵 I0.3', 0.3, 'metal'], ['鐵 I0.6', 0.6, 'metal'], ['鐵 重撞 I1', 1, 'metal'],
  ['木撞鐵 I0.6（兩聲）', 0.6, 'wood+metal'], ['木船觸礁 2 m/s', 0.61, 'wood', 'rock', 1.2], ['木船觸礁 5 m/s', 0.99, 'wood', 'rock', 3],   // 觸礁的力道照 32_ground.js groundSfx 算（礁石硬度 1.5、沙底 0.25；滑 ＝ 速度 × 0.6 秒）
  ['鐵船觸礁 3 m/s', 0.78, 'metal', 'rock', 1.8], ['木船擱淺沙底 2 m/s', 0.25, 'wood', 'sand', 1.2], ['木船壓著礁石往前 2 m/s（每秒一段）', 0.61, 'wood', 'rock', 1.15, 1]];
function hitLab(q) {
  var sec = +(q.get('sec') || 3.5), cs = q.has('cases') ? q.get('cases').split(';').filter(function (s) { return s; }).map(function (s) { var a = s.split(':'); return [a[0], +a[1], a[2], a[3], +a[4] || 0, +a[5] || 0]; }) : HIT_CASES, out = [];
  return cs.reduce(function (pr, c) { return pr.then(function () { return hitRender(sec, c).then(function (r) { r.name = c[0]; out.push(r); }); }); }, Promise.resolve()).then(function () { return out; });
}
function hitRender(sec, c) {
  var sr = 44100, oc = new OfflineAudioContext(2, Math.round(sr * sec), sr), lim = oc.createDynamicsCompressor(), s = 98765;
  lim.threshold.value = -14; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.25;   // 跟遊戲的 master 同一個限制器（initAudio）
  var mg = oc.createGain(); mg.gain.value = 0.8; mg.connect(lim); lim.connect(oc.destination);
  function R() { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x80000000; }
  if (c[1] < 0) {                                                        // 舊的 crack（sfxPlay 那一行照抄；vol ＝ −c[1]）
    var src = oc.createBufferSource(), f = oc.createBiquadFilter(), g = oc.createGain(), a = 1.4 * -c[1], t = 0.05;
    src.buffer = noiseBuf || noiseMake(oc); src.playbackRate.value = 0.6 + R() * 0.5; f.type = 'bandpass'; f.frequency.value = 900 + R() * 900; f.Q.value = 0.8;
    src.connect(f); f.connect(g); g.connect(mg); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); src.start(t, R()); src.stop(t + 0.4);
  } else (c[2] || 'wood').split('+').forEach(function (m) { hitVoice(oc, mg, 0.05, c[1], hitLoud(c[1]), { mat: m, bed: c[3], slide: c[4], rub: !!c[5] }, R); });
  return oc.startRendering().then(function (buf) { var r = audioWav(buf), sp = audioSpec(buf.getChannelData(0), sr); r.cent = sp.cent; r.hi = sp.hi; r.lo = sp.lo; r.o = { I: c[1], mat: c[2] || '', bed: c[3] || '', slide: c[4] || 0, rub: c[5] ? 1 : 0 }; return r; });
}
/** 頻譜重心（Hz）與 1 kHz 以上的能量佔比（%）：2048 點、漢寧窗、半重疊，整段的功率加起來（hitLab 讀數）。 */
function audioSpec(x, sr) {   // 另回 lo ＝ 150 Hz 以下佔幾 %（筆電喇叭差不多放不出來的那一段）
  var N = 2048, P = new Float64Array(N / 2), re = new Float64Array(N), im = new Float64Array(N), i, j, k;
  for (var o = 0; o + N <= x.length; o += N / 2) {
    for (i = 0; i < N; i++) { re[i] = x[o + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))); im[i] = 0; }
    for (i = 1, j = 0; i < N; i++) { var b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { var tr = re[i]; re[i] = re[j]; re[j] = tr; } }
    for (var L = 2; L <= N; L <<= 1) for (i = 0; i < N; i += L) for (k = 0; k < L / 2; k++) {
      var an = -2 * Math.PI * k / L, wr = Math.cos(an), wi = Math.sin(an), p = i + k, q = p + L / 2, xr = re[q] * wr - im[q] * wi, xi = re[q] * wi + im[q] * wr;
      re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi;
    }
    for (k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
  }
  var tot = 0, m = 0, hi = 0, lo = 0;
  for (k = 1; k < N / 2; k++) { var fq = k * sr / N; tot += P[k]; m += P[k] * fq; if (fq >= 1000) hi += P[k]; if (fq < 150) lo += P[k]; }
  return { cent: tot ? Math.round(m / tot) : 0, hi: tot ? +(100 * hi / tot).toFixed(1) : 0, lo: tot ? +(100 * lo / tot).toFixed(1) : 0 };
}

/** 離線錄好的 AudioBuffer ⇒ { peak, rmsDb, wav（data URL，16 位元雙聲道） }（02_ambient.js ambRender、02_music.js bgmRender 共用）。 */
function audioWav(buf) {
  var n = buf.length, sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, pk = 0, ss = 0, i;
  var out = new DataView(new ArrayBuffer(44 + n * 4));
  function str(p, s) { for (var k = 0; k < s.length; k++) out.setUint8(p + k, s.charCodeAt(k)); }
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
  for (i = 0; i < n; i++) {
    var l = clamp(L[i], -1, 1), r = clamp(R[i], -1, 1); pk = Math.max(pk, Math.abs(l), Math.abs(r)); ss += l * l + r * r;
    out.setInt16(44 + i * 4, l * 32767, true); out.setInt16(46 + i * 4, r * 32767, true);
  }
  var u8 = new Uint8Array(out.buffer), bin = '', CH = 0x8000;
  for (i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return { peak: +pk.toFixed(3), rmsDb: +(10 * Math.log10(ss / (2 * n) + 1e-12)).toFixed(1), wav: 'data:audio/wav;base64,' + btoa(bin) };
}
// 訂閱（TASK-0669：模擬層只發事件，00_events.js）
evOn('sfx', sfxPlay, 0, true);

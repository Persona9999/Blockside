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
  if (kind === 'hit') { HIT_LOG.push({ t: +SIMT.toFixed(2), I: +(vol || 0).toFixed(3), mat: (opt || {}).mat, mass: Math.round((opt || {}).mass || 0), bed: (opt || {}).bed || null, slide: (opt || {}).slide || 0, rub: !!(opt || {}).rub }); if (HIT_LOG.length > 32) HIT_LOG.shift(); }
  if (!AC || muted) return;
  if (kind === 'boom' || kind === 'blast') SND_FIGHT = AC.currentTime;     // 開砲、爆炸 ⇒ 交戰中（02_music.js：BGM「交戰時小聲一點」那一檔 × BGM_DUCK）
  var dist = at ? len(sub(at, CAM.eye)) : 0, v = (kind === 'hit' ? hitLoud(vol || 0) * ((opt || {}).k || 1) : vol || 1) / (1 + dist / 70);   // hit 的 vol 是力道（0–1），音量照它換（hitLoud）
  if (v < 0.01) return;
  var now = AC.currentTime, rec = SFX_RECENT[kind] || (SFX_RECENT[kind] = []);
  while (SFX_END.length && SFX_END[0] < now) SFX_END.shift();
  while (rec.length && rec[0] < now - SFX_WIN) rec.shift();
  if (rec.length >= SFX_SAME || SFX_END.length >= SFX_MAX) return;     // 同一種剛放過好幾個、或已經太多聲音在響 ⇒ 這一個不放
  rec.push(now);
  var t = AC.currentTime + Math.min(0.25, dist / 340) * 0.5;
  if (kind === 'hit') { sfxEnd(t + hitVoice(AC, AC.sfxBus, t, vol || 0, v, opt || {}, Math.random) + 0.05); return; }
  if (kind === 'boom' && opt && opt.gun) { sfxEnd(t + gunVoice(AC, AC.sfxBus, t, v, gunSndPar(opt.gun), dist, Math.random) + 0.05); return; }   // 開炮：照砲種、口徑（TASK-0978）
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

// ───── 開炮（TASK-0978；Tim 2026-10-26：「海戰開炮聲音優化 一樣用合成音 不過希望根據砲的種類 口徑有音色變化」「參考頻譜用合成音模擬」）─────
// 以前所有砲同一聲（低通雜音 1,400 → 90 Hz＋70 → 32 Hz 的正弦）：主頻 63 Hz、1 kHz 以上掉 15～48 dB，跟真的黑火藥砲差 12.3 dB。
// 照 CC0 參考錄音的聲紋調（錄音只拿來量、⛔ 不進遊戲）：三分之一八度頻帶形狀（對最大那一帶）、衰減到 −20／−40 dB 的秒數，分四組 ——
//   小砲（黑火藥）：freesound 553240 中世紀節慶的開炮 12 發 ⇒ 主頻 125 Hz、很寬（2.5 kHz 才 −10 dB）、−20 dB 0.05 秒、−40 dB 0.56 秒；
//   中口徑：252281（100 mm）、702245（野戰砲）、187767 ⇒ −20 dB 1.1 秒、−40 dB 2.0 秒、1 kHz −12 dB、4 kHz −23 dB；
//   大口徑：162365（戰艦主砲 3 發）、239137 ⇒ 主頻 63 Hz、160 Hz～1 kHz 平平的 −9 dB、−20 dB 1.4 秒、−40 dB 4.2 秒；
//   速射砲：854186（25 mm 機砲 3 發）⇒ 100 Hz 以下很弱、−20 dB 0.07 秒。
// 合成：四層雜音（⛔ 沒有正弦 ⇒ 沒有音高）—— 爆風（寬頻、低通往下掉）、身體（主頻附近的帶通）、脆響（高通、幾十毫秒）、尾聲（延遲出來的低沉轟鳴）。
// 四個錨點各自用座標搜尋調參數（頻帶差 ＋ 衰減秒數的對數差）；讀數（頻帶差 dB，63 Hz–6.3 kHz 的平均；參考彼此之間差 2～4）：
//   小砲 2.4、中口徑 1.1、大口徑 2.8、速射砲 4.2（參考在 125 Hz 有一根車體的共振，寬頻雜音學不來）。
// 口徑 ＝ 彈重（game.json guns.shot）：錨點之間照 ln(彈重) 內插 ⇒ 越大越低、越長；主頻跟藥量的立方根成反比 ——
//   中口徑、速射砲的主頻釘在這條線上（小砲錨點 104 Hz × (彈重 ÷ 3.7)^(−1/3)）：中口徑的參考錄音（野外、帶回響）量到 200 Hz，照它的話 120 mm 會比 4 磅砲還尖；大口徑自己搜到 25.6 Hz、這條線算 21 Hz。
// 兩條線：黑火藥（滑膛前膛、carronade、早期鍛鐵、線膛）小砲 → 大口徑；無煙／後膛（速射、轉膛、大口徑後膛）速射砲 → 中口徑 → 大口徑。比第一個錨點小 ⇒ 用第一個、主頻照立方根往上推。
// 距離：音量照舊 ÷ (1 ＋ 距離 ÷ 70)；再一道低通 18 kHz ÷ (1 ＋ 距離 ÷ 120) ⇒ 1 km 外剩 1.9 kHz 以下（遠處的炮聲只剩轟鳴）。
// 回音：參考的小砲大多在 0.22～0.25 秒有一聲 −11～−22 dB 的回音；搜出來的尾聲在 0.15 秒湧回 −5 dB（像連著兩聲）⇒ 小砲的尾聲 × 0.4（0.3 → 0.12）、
//   另加一聲爆風的複本（eA，延遲 0.15～0.3 秒）⇒ 湧回 −13 dB、回音 −13 dB；頻帶差 2.6、−40 dB 0.47 秒（參考 0.56）。中、大口徑的尾聲本來就長、蓋過回音 ⇒ 0。
// p：fp 主頻、bLp 爆風起始低通、bA／bD 爆風音量、長、oA／oD 身體、cA／cD／cHz 脆響、tA／tD 尾聲、tLp 尾聲低通（× fp）、eA 回音、grit 爆裂顆粒幾粒
var GUNSND_A = {
  qf:    { shot: 0.5, fp: 199, bLp: 909, bA: 0.75, bD: 0.0859, oA: 1.46, oD: 0.264, cA: 0.219, cD: 0.0075, cHz: 5200, tA: 0.05, tD: 0.2, tLp: 2.5 },
  small: { shot: 3.7, fp: 104, bLp: 2480, bA: 0.455, bD: 0.0227, oA: 2.11, oD: 0.24, cA: 0.341, cD: 0.0218, cHz: 3520, tA: 0.12, tD: 1.09, tLp: 1, eA: 0.15 },
  mid:   { shot: 20, fp: 59, bLp: 1200, bA: 0.626, bD: 0.173, oA: 1.29, oD: 0.757, cA: 0.08, cD: 0.0125, cHz: 2210, tA: 0.4, tD: 4.4, tLp: 5.82 },
  big:   { shot: 450, fp: 25.6, bLp: 2500, bA: 0.625, bD: 0.3, oA: 1.2, oD: 2.32, cA: 0.234, cD: 0.0825, cHz: 4220, tA: 0.6, tD: 9.6, tLp: 3.84 }
};
var GUNSND_LINE = { bp: ['small', 'big'], smokeless: ['qf', 'mid', 'big'] };
// 響度倍數 × (1 − 0.5 × 口徑大小)：小砲 × 2.8、24 磅 × 2.1、450 kg × 1.4 ⇒ 過限制器的峰值都在 0.6～0.7（以前那一聲 0.65）。
//   大口徑 × 3.3 時頻帶差 2.8 ⇒ 5.5（限制器把身體壓扁）、× 1.5 時 3.1 ⇒ 口徑越大乘越少
var GUNSND_VOL = 2.8;
// 砲種 ⇒ 哪一族；沒寫 ⇒ 黑火藥滑膛前膛。line 走哪一條、mod 乘在參數上（〔佔位〕：照史實的方向，不是量的）
var GUNSND_FAM = {
  bp:    { line: 'bp', mod: {} },                                                  // 長砲、追擊砲、Dahlgren、三叉戟
  carr:  { line: 'bp', mod: { bA: 1.4, cA: 0.6, tD: 0.8 } },                       // carronade：短砲身、初速低 ⇒ 爆風多、脆響少
  old:   { line: 'bp', mod: { cA: 1.4, bLp: 1.3, tD: 0.7, grit: 10 } },           // 早期鍛鐵後膛（迴旋砲、bombardella）：藥室漏氣 ⇒ 粗糙、劈啪
  rifle: { line: 'bp', mod: { cA: 1.3, cHz: 1.1 } },                              // 黑火藥線膛（Brooke）：彈帶咬進膛線 ⇒ 脆一點
  bl:    { line: 'smokeless', mod: { tA: 1.15 } },                                // 大口徑後膛（克虜伯、Canet）
  qf:    { line: 'smokeless', mod: {} },                                          // 速射砲
  rev:   { line: 'smokeless', mod: { tD: 0.6, tA: 0.7 } }                         // 轉膛砲：一發一發很短
};
var GUNSND_OF = { carr: 'carr', pierrier: 'old', bombardella: 'old', brooke64: 'rifle', brooke7: 'rifle', krupp305: 'bl', krupp150: 'bl', canet320: 'bl', armstrong120: 'qf', hotch57: 'qf', hotch47: 'qf', hotch37: 'rev' };
/** 砲種（game.json guns 的鍵）⇒ 合成參數：照那一族那一條線、照彈重內插。 */
function gunSndPar(type) {
  var G = GUNS[type] || {}, shot = Math.max(0.1, G.shot || 10), F = GUNSND_FAM[GUNSND_OF[type] || 'bp'], L = GUNSND_LINE[F.line].map(function (k) { return GUNSND_A[k]; });
  var a = L[0], b = L[0], u = 0, p = {}, x = Math.log(shot);
  for (var i = 0; i + 1 < L.length; i++) if (shot >= L[i].shot) { a = L[i]; b = L[i + 1]; u = Math.min(1, (x - Math.log(a.shot)) / (Math.log(b.shot) - Math.log(a.shot))); }
  ['fp', 'bLp', 'bA', 'bD', 'oA', 'oD', 'cA', 'cD', 'cHz', 'tA', 'tD', 'tLp'].forEach(function (k) { p[k] = Math.exp(Math.log(a[k]) * (1 - u) + Math.log(b[k]) * u); });
  p.eA = (a.eA || 0) * (1 - u) + (b.eA || 0) * u;                        // 回音：有 0 的錨點 ⇒ 線性內插
  if (shot < L[0].shot) p.fp = L[0].fp * Math.pow(shot / L[0].shot, -1 / 3);   // 比最小的錨點還小：主頻照立方根往上推
  if (shot > L[L.length - 1].shot) p.fp = L[L.length - 1].fp * Math.pow(shot / L[L.length - 1].shot, -1 / 3);
  p.grit = 0; Object.keys(F.mod).forEach(function (k) { if (k === 'grit') p.grit = F.mod[k]; else p[k] *= F.mod[k]; });
  p.vol = GUNSND_VOL * (1 - 0.5 * clamp(Math.log(shot / 0.5) / Math.log(900), 0, 1));   // 響度：錨點只對了頻帶的形狀 ⇒ 乘回來；小砲是一下的衝擊、乘多一點，大砲的身體長、本來就響（乘太多會被限制器壓扁）
  return p;
}
/** 合成一聲開炮（ac 可以是 OfflineAudioContext）：t 開始、v 音量、p ＝ gunSndPar、dist 離鏡頭幾公尺（遠的低通）、R 亂數。回傳從 t 起響幾秒。 */
function gunVoice(ac, out, t, v, p, dist, R) {
  var nb = noiseBuf || noiseMake(ac), dur = 0, lp = ac.createBiquadFilter(); v *= p.vol || 1;
  lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 18000 / (1 + (dist || 0) / 120); lp.connect(out);
  var fp = p.fp * (0.95 + 0.1 * R());                                    // 同一門砲每一發差一點
  function env(g, a, at, d, t0) { g.setValueAtTime(0.0001, t0); g.exponentialRampToValueAtTime(Math.max(a, 0.0002), t0 + at); g.exponentialRampToValueAtTime(0.0001, t0 + at + d); }
  function hiss(type, f0, f1, Q, a, at, d, dt, rate) {
    var t0 = t + (dt || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; s.playbackRate.value = rate || 1; f.type = type; f.Q.value = Q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + at + d);
    env(g.gain, a * v, at, d, t0); s.connect(f); f.connect(g); g.connect(lp); s.start(t0, R() * 1.5); s.stop(t0 + at + d + 0.05); dur = Math.max(dur, (dt || 0) + at + d + 0.05);
  }
  hiss('lowpass', p.bLp, Math.max(fp * 2, 60), 0.5, p.bA, 0.002, p.bD, 0, 1);              // 爆風
  hiss('bandpass', fp * 1.3, fp * 0.8, 0.8, p.oA, 0.003, p.oD, 0, 0.6);                    // 身體
  hiss('highpass', p.cHz, p.cHz * 0.6, 0.5, p.cA, 0.001, p.cD, 0, 1);                      // 脆響
  hiss('lowpass', fp * p.tLp, fp * 0.5, 0.6, p.tA, 0.08, p.tD, 0.04, 0.4);                // 尾聲
  if (p.eA > 0.005) hiss('lowpass', p.bLp * 0.6, Math.max(fp * 2, 60), 0.5, p.eA, 0.004, 0.03 + p.bD * 2, 0.15 + 0.15 * R(), 1);   // 回音（水面、船身）
  for (var c = 0; c < p.grit; c++) hiss('bandpass', 800 + 3000 * R(), 600, 1.5, 0.25 * (0.4 + 0.6 * R()), 0.001, 0.005 + 0.015 * R(), 0.01 + 0.35 * R() * R(), 1);   // 爆裂顆粒（早期鍛鐵砲）
  return dur;
}
/** 開炮的試聽集（__game.gunLab；src/tests/ambient_lab.py --lab gun）：每段 sec 秒、同一個限制器、固定種子。?cases=名字:砲種:距離;… 換掉（砲種 old ＝ 以前那一聲）。
 *  回 Promise<[{ name, peak, rmsDb, wav, cent, hi, mid, lo, atk, o: { gun, dist, fp } }]>。 */
var GUN_CASES = [['以前那一聲', 'old', 0], ['3 磅追擊砲', 'chase3', 0], ['6 磅砲', 'long6', 0], ['12 磅長砲', 'long12', 0], ['24 磅長砲', 'long', 0], ['32 磅長砲', 'long32', 0],
  ['32 磅 carronade', 'carr', 0], ['迴旋砲（pierrier）', 'pierrier', 0], ['bombardella', 'bombardella', 0], ['XI 吋 Dahlgren', 'dahl11', 0], ['7 吋 Brooke 線膛', 'brooke7', 0],
  ['37 mm 轉膛砲', 'hotch37', 0], ['57 mm 速射砲', 'hotch57', 0], ['12 cm 速射砲', 'armstrong120', 0], ['15 cm 克虜伯', 'krupp150', 0], ['30.5 cm 克虜伯', 'krupp305', 0], ['32 cm Canet', 'canet320', 0],
  ['24 磅長砲 300 m 外', 'long', 300], ['24 磅長砲 1 km 外', 'long', 1000], ['30.5 cm 克虜伯 1 km 外', 'krupp305', 1000]];
function gunLab(q) {
  var sec = +(q.get('sec') || 6), cs = q.has('cases') ? q.get('cases').split(';').filter(function (s) { return s; }).map(function (s) { var a = s.split(':'); return [a[0], a[1], +a[2] || 0]; }) : GUN_CASES, out = [];
  return cs.reduce(function (pr, c) { return pr.then(function () { return gunRender(sec, c).then(function (r) { r.name = c[0]; out.push(r); }); }); }, Promise.resolve()).then(function () { return out; });
}
function gunRender(sec, c) {
  var sr = 44100, oc = new OfflineAudioContext(2, Math.round(sr * sec), sr), lim = oc.createDynamicsCompressor(), s = 98765, p = null;
  lim.threshold.value = -14; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.25;   // 跟遊戲的 master 同一個限制器（initAudio）
  var mg = oc.createGain(); mg.gain.value = 0.8; mg.connect(lim); lim.connect(oc.destination);
  function R() { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x80000000; }
  var v = 1 / (1 + c[2] / 70), t = 0.05;                                 // 音量照 sfxPlay（玩家那一艘 vol 1）
  if (c[1] === 'old') {                                                  // 以前那一聲（sfxPlay 'boom' 那幾行照抄）
    var g = oc.createGain(), src = oc.createBufferSource(), f = oc.createBiquadFilter(), o = oc.createOscillator(), og = oc.createGain(); g.connect(mg);
    src.buffer = noiseBuf || noiseMake(oc); src.playbackRate.value = 0.6 + R() * 0.5; src.connect(f); f.connect(g);
    f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(90, t + 0.9);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.1 * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3); src.start(t, R()); src.stop(t + 1.35);
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.6); og.gain.setValueAtTime(0.9 * v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); o.connect(og); og.connect(mg); o.start(t); o.stop(t + 0.75);
  } else { p = gunSndPar(c[1]); gunVoice(oc, mg, t, v, p, c[2], R); }
  return oc.startRendering().then(function (buf) { var r = audioWav(buf), sp = audioSpec(buf.getChannelData(0), sr); r.cent = sp.cent; r.hi = sp.hi; r.mid = sp.mid; r.lo = sp.lo; r.atk = sp.atk; r.o = { gun: c[1], dist: c[2], fp: p ? Math.round(p.fp) : null, fam: c[1] === 'old' ? '' : GUNSND_OF[c[1]] || 'bp' }; return r; });
}

// ───── 碰撞與觸礁（TASK-0868；Tim 2026-10-23：「希望可以更沉悶一些 另外木頭跟金屬材質可以用兩種音效(都用合成音)」「不直接用音檔 且根據撞擊力道變化音效」「觸礁也是」）─────
// 以前擦撞、撞擊事件、觸礁都放 crack（雜音過 900–1800 Hz 帶通、0.35 秒 ＝ 砲彈打中木頭那一聲）⇒ 脆；音量固定 1／1.2／1.6，跟力道、材質無關。
// 現在 sfx('hit', 撞點, 力道 I（0–1）, { mat, mass, k, bed, slide, rub })，全部現場合成。
// 第三版（Tim 2026-10-23「感覺還差一些 可以直接用聲紋比對方式(程式) 然後找看看撞船音效對比參考看看」「這版變得有點太沉」「撞木船 可以有碎木的聲音」）：
//   拿真實（或做給遊戲的）撞船錄音比聲紋 —— CC0 的 Thimras《Battle at sea》ship_ram_ship（木帆船對撞）、freesound Kodack 257752 木船撞碎、
//   magzlurban 506688 小船輕碰碼頭、WelvynZPorterSamples 621332 衝上岸。量法：三分之一八度頻帶的形狀（對最大那一帶歸一）、衰減 20／40 dB 的秒數、高頻碎裂顆粒每秒幾個。
//   ⇒ 重撞是寬頻的（40 Hz 到 8 kHz 每八度只降約 1 dB、1 kHz 以上比最強那一帶低 10–15 dB）、−40 dB 要 2–2.5 秒、每秒 1–3 個碎裂；輕碰才是悶的（100–125 Hz 最強、1 kHz 掉到 −21 dB、0.7 秒）。
//   第一版（有音高的短正弦）清脆、第二版（全部壓到 640 Hz 以下）太沉又沒有碎木聲 —— 兩版都只有一條低通的路。
//   ⇒ 兩條路：LO（悶的那一團，低通 260–520 Hz）照舊；HI（低通 1.5–9 kHz）放撞擊雜音與碎片，音量照 I²：輕碰幾乎沒有、重撞才出來。
//   讀數（頻帶形狀跟 ship_ram_ship 平均差幾 dB；同一段的長短兩個剪輯彼此差 4.4）：木 I0.9 3.3（第一版 7.9、第二版 16.7）；木 I0.1 跟輕碰碼頭 6.3。
//   · LO：底 ＝ 往下掉的低頻正弦（木 68 Hz、金屬 58 Hz 起）；身體 ＝ 放慢一半的低通雜音；船殼的「咚」＝ 寬頻帶通（190–240 Hz、Q 0.7：沒有音高）；
//     金屬再加鐵殼的低嗡（78–92 Hz × 1、1.59、2.14，兩支差 0.6% ⇒ 會拍）；I > 0.2 加一段低沉尾聲（低通 160 Hz 雜音，0.6 ＋ 2.4 I 秒）。
//   · HI：撞擊雜音（低通雜音，900–3900 Hz 起）；木頭再加碎木顆粒（900–4400 Hz 帶通、4–16 ms，散在 1.2 秒裡、越後面越稀）、
//     大塊斷裂（400–1500 Hz、20–50 ms）、後面零星掉下來的碎片；金屬是鉚釘崩掉的短高頻顆粒＋鐵板的呻吟（400–700 Hz 帶通）。
//   · 長度：× (0.9 ＋ 1.1 I)（Tim「持續時間可以長一點(根據撞擊力道)」）；船的質量 mass（噸）：大小 z ＝ ln(噸 ÷ 10) ÷ ln 500（10 噸 ⇒ 0、5,000 噸 ⇒ 1）——
//     LO 那條的頻率 × (1.5 − 0.5 z)、長度 × (0.45 ＋ 0.55 z)、低通 × (1.3 − 0.3 z)；音量 × (0.7 ＋ 0.3 z)。HI 的碎片顆粒不跟著伸縮。
//   · 觸礁 bed 'rock'：再加一段刮擦（160–360 Hz 帶通一段接一段）＋刮出來的碎屑；'sand'：很低、很長的沙沙＋一點細沙的高頻。長 slide 秒。
//   力道 → 音量：hitLoud × k（撞船時兩艘各一聲 ⇒ k 0.75）；力道怎麼算在發聲的那一邊（31_sailing.js hitSfx：撞擊動能；32_ground.js groundSfx：底的硬度 × 速度²）。
//   R ＝ 亂數（遊戲用 Math.random；hitLab 用固定種子 ⇒ 每次錄的一樣）。⛔ 只是聲音：不抽模擬的 rnd()。
var HIT_P = {
  lowA: 0.3, bodyA: 1.3, dongA: 1.2, tlA: 1,                             // LO：底、身體、咚、尾聲
  crA: 1,                                                                // HI：撞擊雜音
  spA: 0.9, spN: 20, spT: 1.2,                                           // 碎木顆粒：音量、每秒幾粒（I ＝ 1）、散多久（秒）
  snA: 0.8, snN: 4, dbA: 0.35, dbN: 6,                                   // 大塊斷裂、掉下來的碎片
  lpLo: [260, 260], lpHi: [1500, 9000]                                   // 兩條路的低通：I ＝ 0 → 1（Hz）
};
function hitLoud(I) { return 0.6 + 1.2 * clamp(I, 0, 1); }
function hitSize(mass) { return clamp(Math.log(Math.max(10, mass || 2000) / 10) / Math.log(500), 0, 1); }
/** 合成一聲碰撞（ac 可以是 OfflineAudioContext）：t 開始、I 力道、v 音量、o ＝ { mat, mass, bed, slide, rub }。回傳從 t 起響幾秒。 */
function hitVoice(ac, out, t, I, v, o, R) {
  I = clamp(I, 0, 1);
  var P = HIT_P, z = hitSize(o.mass), fk = 1.5 - 0.5 * z, dk = (0.45 + 0.55 * z) * (0.9 + 1.1 * I), metal = o.mat === 'metal', nb = noiseBuf || noiseMake(ac), dur = 0;
  function bus(f) { var a = ac.createBiquadFilter(), b = ac.createBiquadFilter(), g = ac.createGain(); a.type = b.type = 'lowpass'; a.frequency.value = b.frequency.value = f; a.Q.value = b.Q.value = 0.5; g.gain.value = v * (0.7 + 0.3 * z); a.connect(b); b.connect(g); g.connect(out); return a; }
  var LO = bus((P.lpLo[0] + P.lpLo[1] * I) * (1.3 - 0.3 * z)), HI = bus(P.lpHi[0] + (P.lpHi[1] - P.lpHi[0]) * I), dst = LO;
  function env(p, a, at, d, t0) { p.setValueAtTime(0.0001, t0); p.exponentialRampToValueAtTime(Math.max(a, 0.0002), t0 + at); p.exponentialRampToValueAtTime(0.0001, t0 + at + d); }
  function tone(type, f0, f1, a, at, d, dt) {
    var t0 = t + (dt || 0), s = ac.createOscillator(), g = ac.createGain();
    f0 *= fk; f1 *= fk; d *= dk;
    s.type = type; s.frequency.setValueAtTime(f0, t0); s.frequency.exponentialRampToValueAtTime(f1, t0 + at + d); env(g.gain, a, at, d, t0);
    s.connect(g); g.connect(dst); s.start(t0); s.stop(t0 + at + d + 0.05); dur = Math.max(dur, (dt || 0) + at + d + 0.05);
  }
  function hiss(type, f0, f1, Q, a, at, d, dt, rate, raw) {             // raw：不跟著船的大小伸縮（碎片的顆粒）
    var t0 = t + (dt || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    if (!raw) { f0 *= fk; f1 *= fk; d *= dk; }
    s.buffer = nb; s.playbackRate.value = rate || 1; f.type = type; f.Q.value = Q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + at + d);
    env(g.gain, a, at, d, t0); s.connect(f); f.connect(g); g.connect(dst); s.start(t0, R() * 1.5); s.stop(t0 + at + d + 0.05); dur = Math.max(dur, (dt || 0) + at + d + 0.05);
  }
  if (!o.rub) {                                                          // rub：觸礁之後還在動，只刮、不再撞一聲（32_ground.js groundSfx）
    var f0 = (metal ? 58 : 68) * (1 - 0.25 * I) * (0.94 + 0.12 * R()), c;
    tone('sine', f0 * 1.4, f0, P.lowA, 0.012, 0.25 + 0.5 * I);                                   // 底
    hiss('lowpass', 220 + 200 * I, 90, 1.1, P.bodyA * (1 + 0.6 * I), 0.015, 0.18 + 0.4 * I, 0, 0.5);   // 身體
    hiss('bandpass', 190 + 50 * R(), 130, 0.7, P.dongA, 0.02, 0.15 + 0.35 * I, 0, 0.5);           // 船殼的「咚」
    if (metal) {
      var fb = (78 + 14 * R()) * (1 - 0.15 * I), dm = 0.9 + 2 * I;
      [1, 1.59, 2.14].slice(0, 2 + Math.round(I)).forEach(function (r, k) {   // 鐵殼的低嗡
        var a = 0.22 / (1 + 0.6 * k), d = dm / (1 + 0.4 * k);
        tone('sine', fb * r, fb * r * 0.995, a, 0.025, d); tone('sine', fb * r * 1.006, fb * r * 0.999, a * 0.7, 0.03, d * 0.9);
      });
    }
    if (I > 0.2) hiss('lowpass', 160, 70, 0.7, P.tlA * (0.15 + 0.85 * (I - 0.2) / 0.8), 0.08, 0.6 + 2.4 * I, 0.05, 0.4);   // 尾聲：船身與海水的低沉餘震
    dst = HI;
    var w = I * I;                                                       // 輕碰幾乎沒有、重撞才出來
    hiss('lowpass', 900 + 3000 * I, 300, 0.5, P.crA * (0.15 + 0.85 * w), 0.006, 0.12 + 0.5 * I, 0, 1, true);   // 撞擊雜音
    if (!metal) {
      for (c = Math.round(P.spN * w * P.spT); c > 0; c--) { var u = R(); hiss('bandpass', 900 + 3500 * R(), 700 + 2000 * R(), 1.2, P.spA * (0.4 + 0.6 * R()) * (1 - 0.7 * u), 0.001, 0.004 + 0.012 * R(), 0.01 + P.spT * u * u, 1, true); }   // 碎木（越後面越稀）
      for (c = Math.round(P.snN * w); c > 0; c--) hiss('bandpass', 400 + 1100 * R(), 300 + 600 * R(), 1.5, P.snA * (0.5 + 0.5 * R()), 0.002, 0.02 + 0.03 * R(), 0.02 + 0.6 * I * R(), 1, true);   // 大塊斷裂
      for (c = Math.round(P.dbN * w); c > 0; c--) hiss('bandpass', 500 + 1500 * R(), 400, 3, P.dbA * (0.5 + 0.5 * R()), 0.002, 0.02 + 0.04 * R(), 0.3 + 1.5 * R() * dk, 1, true);   // 掉下來的碎片
    } else {
      for (c = Math.round(10 * w); c > 0; c--) hiss('bandpass', 1500 + 3000 * R(), 1200, 4, 0.4 * (0.4 + 0.6 * R()), 0.001, 0.01 + 0.03 * R(), 0.02 + 0.8 * R() * R(), 1, true);   // 鉚釘崩掉
      hiss('bandpass', 400 + 300 * R(), 250, 2, 0.5 * w, 0.03, 0.6 + 1.2 * I, 0.05, 0.7);   // 鐵板的呻吟
    }
    dst = LO;
  }
  var sl = Math.min(3, o.slide || 0);
  if (o.bed === 'rock' && sl > 0) {
    for (var k = 0, n = Math.ceil(sl / 0.12); k < n; k++) hiss('bandpass', 160 + 200 * R(), 130 + 150 * R(), 1.5, (0.8 + 0.6 * I) * (1 - 0.5 * k / n), 0.04, 0.12 + 0.1 * R(), 0.05 + k * 0.12, 0.5);   // 刮過礁石
    dst = HI; for (k = 0, n = Math.round(sl * 5 * (0.3 + I)); k < n; k++) hiss('bandpass', 800 + 3000 * R(), 600, 1.5, 0.3 * (0.4 + 0.6 * R()), 0.002, 0.01 + 0.03 * R(), 0.05 + sl * R(), 1, true); dst = LO;   // 刮出來的碎屑
  }
  if (o.bed === 'sand' && sl > 0) { hiss('lowpass', 220, 110, 0.5, 1.2 + 0.6 * I, 0.1, sl / dk, 0.03, 0.5); dst = HI; hiss('bandpass', 1800, 1200, 0.7, 0.25 * (0.3 + I), 0.1, sl, 0.03, 1, true); dst = LO; }   // 擦過沙底（長度 ＝ slide 秒）
  return dur;
}
/** 試聽集（__game.hitLab；src/tests/ambient_lab.py --lab hit）：每段 sec 秒、跟遊戲同一個限制器；含舊的 crack 當對照。?cases=名字:I:mat:bed:slide:rub:噸;… 換掉（I < 0 ＝ 舊的 crack、音量 −I）。
 *  回 Promise<[{ name, peak, rmsDb, wav, cent（頻譜重心 Hz）, hi（1 kHz 以上的能量佔幾 %）, mid（500 Hz 以上）, lo（150 Hz 以下）, atk（起音：5 ms 的 RMS 從峰值的 10% 爬到峰值幾 ms） }]>。 */
var HIT_CASES = [['舊 crack 擦撞 ×1', -1], ['舊 crack 觸礁 ×1.2', -1.2], ['舊 crack 撞擊 ×1.6', -1.6],   // 第 7 欄 ＝ 船的質量（噸；沒寫 ＝ 2,155：憲法號）
  ['木 輕碰 I0', 0, 'wood'], ['木 I0.3', 0.3, 'wood'], ['木 I0.6', 0.6, 'wood'], ['木 重撞 I1', 1, 'wood'],
  ['鐵 輕碰 I0', 0, 'metal'], ['鐵 I0.3', 0.3, 'metal'], ['鐵 I0.6', 0.6, 'metal'], ['鐵 重撞 I1', 1, 'metal'],
  ['小艇 30 噸 木 I0.6', 0.6, 'wood', '', 0, 0, 30], ['小船 300 噸 木 I0.6', 0.6, 'wood', '', 0, 0, 300], ['鐵甲艦 7,000 噸 鐵 I0.6', 0.6, 'metal', '', 0, 0, 7000],
  ['木撞鐵 I0.6（兩聲、各 ×0.75）', 0.6, 'wood+metal'], ['木船觸礁 2 m/s', 0.61, 'wood', 'rock', 1.2], ['木船觸礁 5 m/s', 0.99, 'wood', 'rock', 3],   // 觸礁的力道照 32_ground.js groundSfx 算（礁石硬度 1.5、沙底 0.25；滑 ＝ 速度 × 0.6 秒）
  ['鐵船觸礁 3 m/s', 0.78, 'metal', 'rock', 1.8], ['木船擱淺沙底 2 m/s', 0.25, 'wood', 'sand', 1.2], ['木船壓著礁石往前 2 m/s（每秒一段）', 0.61, 'wood', 'rock', 1.15, 1]];
function hitLab(q) {
  var sec = +(q.get('sec') || 5), cs = q.has('cases') ? q.get('cases').split(';').filter(function (s) { return s; }).map(function (s) { var a = s.split(':'); return [a[0], +a[1], a[2], a[3], +a[4] || 0, +a[5] || 0, +a[6] || 0]; }) : HIT_CASES, out = [];
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
  } else (c[2] || 'wood').split('+').forEach(function (m) { hitVoice(oc, mg, 0.05, c[1], hitLoud(c[1]) * (/\+/.test(c[2]) ? 0.75 : 1), { mat: m, mass: c[6] || 2155, bed: c[3], slide: c[4], rub: !!c[5] }, R); });
  return oc.startRendering().then(function (buf) { var r = audioWav(buf), sp = audioSpec(buf.getChannelData(0), sr); r.cent = sp.cent; r.hi = sp.hi; r.mid = sp.mid; r.lo = sp.lo; r.atk = sp.atk; r.o = { I: c[1], mat: c[2] || '', mass: c[6] || 2155, bed: c[3] || '', slide: c[4] || 0, rub: c[5] ? 1 : 0 }; return r; });
}
/** 頻譜重心（Hz）與 1 kHz 以上的能量佔比（%）：2048 點、漢寧窗、半重疊，整段的功率加起來（hitLab 讀數）。 */
function audioSpec(x, sr) {   // 另回 lo ＝ 150 Hz 以下佔幾 %（筆電喇叭差不多放不出來的那一段）、mid ＝ 500 Hz 以上、atk ＝ 起音幾 ms（清脆＝起音硬）
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
  var tot = 0, m = 0, hi = 0, lo = 0, md = 0;
  for (k = 1; k < N / 2; k++) { var fq = k * sr / N; tot += P[k]; m += P[k] * fq; if (fq >= 1000) hi += P[k]; if (fq >= 500) md += P[k]; if (fq < 150) lo += P[k]; }
  var W = Math.round(sr * 0.005), E = [], pk = 0, ip = 0;
  for (o = 0; o + W <= x.length; o += W) { var ss = 0; for (i = 0; i < W; i++) ss += x[o + i] * x[o + i]; E.push(Math.sqrt(ss / W)); if (E[E.length - 1] > pk) { pk = E[E.length - 1]; ip = E.length - 1; } }
  var i0 = 0; while (i0 < ip && E[i0] < 0.1 * pk) i0++;
  return { cent: tot ? Math.round(m / tot) : 0, hi: tot ? +(100 * hi / tot).toFixed(1) : 0, mid: tot ? +(100 * md / tot).toFixed(1) : 0, lo: tot ? +(100 * lo / tot).toFixed(1) : 0, atk: (ip - i0) * 5 };
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

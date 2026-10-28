// ───────────────────────── 音效（按下開始後才建；沒有聲音也完整） ─────────────────────────
var AC = null, master = null, noiseBuf = null, muted = false;
// 爆音（Tim 2026-10-15：「目前爆炸太頻繁會爆音」）：以前每個聲音各自接 master、沒有上限 ⇒ 一次齊射幾十門＋殉爆＋碎裂疊起來加總 > 1 ⇒ 削波。兩層：
//   ① master 後面一個限制器（DynamicsCompressor：門檻 −14 dB、比 20、起 2 ms、放 250 ms）⇒ 疊再多也壓在 0 dBFS 以下；
//   ② 同時發聲：同一種在 SFX_WIN 秒內最多 SFX_SAME 個（人耳分不出來、只是更大聲）、全部最多 SFX_MAX 個還在響 ⇒ 多的不放（只是聲音；不碰模擬的亂數）。
var SFX_MAX = 24, SFX_SAME = 3, SFX_WIN = 0.06, SFX_END = [], SFX_RECENT = {}, SFX_DROP = {}, SFX_GUN_NEXT = 0, SFX_GUN_MAX = 32, SFX_GUN_END = [];   // 開砲自己一個池子（SFX_GUN_MAX 聲；只算頭）⇒ 交戰時命中、碎裂的聲音佔滿 SFX_MAX 也輪得到開砲   // SFX_DROP：每一種被上限丟掉幾聲（__game.sfxDrop；試聽頁 85_gunlab.js 也讀）
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
  while (SFX_GUN_END.length && SFX_GUN_END[0] < now) SFX_GUN_END.shift();
  while (rec.length && rec[0] < now - SFX_WIN) rec.shift();
  var gun = kind === 'boom' && opt && opt.gun, t = AC.currentTime + Math.min(0.25, dist / 340) * 0.5;
  // 開砲不照「同一種 SFX_WIN 秒內最多 SFX_SAME 個」丟，改成往後錯開 SFX_WIN ÷ SFX_SAME 秒排隊（排到 0.8 秒以後才丟；同一刻 30 門：0.6 秒時距離延遲之後只排得下 28 門）：模擬倍速、掉幀時一格畫面補跑好幾步，
  //   同一輪齊射的好幾門在同一刻開火 ⇒ 以前第 4 門起直接沒聲音（Tim 2026-10-28「連續開砲會導致有的炮沒聲音」）
  if (gun) { t = Math.max(t, SFX_GUN_NEXT); if (t - now > 0.8 || SFX_GUN_END.length >= SFX_GUN_MAX) { SFX_DROP[kind] = (SFX_DROP[kind] || 0) + 1; return; } SFX_GUN_NEXT = t + SFX_WIN / SFX_SAME; }
  else if (rec.length >= SFX_SAME || SFX_END.length >= SFX_MAX) { SFX_DROP[kind] = (SFX_DROP[kind] || 0) + 1; return; }   // 同一種剛放過好幾個、或已經太多聲音在響 ⇒ 這一個不放
  rec.push(now);
  if (kind === 'hit') { sfxEnd(t + hitVoice(AC, AC.sfxBus, t, vol || 0, v, opt || {}, Math.random) + 0.05); return; }
  if (gun) { sfxEnd(t + gunVoice(AC, AC.sfxBus, t, v, gunSndPar(opt.gun), dist, Math.random) + 0.05, SFX_GUN_END); return; }   // 開炮：照砲種、口徑（TASK-0978）；只算「頭」佔聲部（gunVoice 的回傳），尾聲不擋別門砲
  if (kind === 'imp') { var ip = impPar(opt || {}); if (ip) { sfxEnd(t + impVoice(AC, AC.sfxBus, t, v, ip, dist, Math.random) + 0.05); return; } kind = 'crack'; }   // 命中：照材質、彈種（TASK-0979）；對不上 ⇒ 照舊那一聲 crack
  if (FIRE_SND[kind]) { sfxEnd(t + fireVoice(AC, AC.sfxBus, t, v, FIRE_SND[kind], dist, Math.random) + 0.05); return; }   // 希臘火：噴口的火舌、打中的轟燃（TASK-0979）
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
function sfxEnd(e, L) { L = L || SFX_END; var k = L.length; while (k > 0 && L[k - 1] > e) k--; L.splice(k, 0, e); }   // 這一個聲音什麼時候停（照時間排好；同時發聲的上限照它數；L 省略 ＝ 共用的 SFX_END，開砲是 SFX_GUN_END）

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
  small: { shot: 3.9, fp: 44, bLp: 6010, bA: 0.782, bD: 0.0908, oA: 1.16, oD: 0.24, cA: 0.171, cD: 0.0254, cHz: 8000, tA: 0.726, tD: 4.8, tLp: 2.33, eA: 0.15 },
  naval: { shot: 17.6, fp: 72, bLp: 3170, bA: 0.6, bD: 0.192, oA: 4, oD: 1.06, cA: 0.275, cD: 0.0352, cHz: 3000, tA: 3, tD: 19.2, tLp: 1.5, eA: 0.08 },
  mid:   { shot: 20, fp: 59, bLp: 1200, bA: 0.626, bD: 0.173, oA: 1.29, oD: 0.757, cA: 0.08, cD: 0.0125, cHz: 2210, tA: 0.4, tD: 4.4, tLp: 5.82 },
  big:   { shot: 450, fp: 25.6, bLp: 2500, bA: 0.625, bD: 0.3, oA: 1.2, oD: 2.32, cA: 0.234, cD: 0.0825, cHz: 4220, tA: 0.6, tD: 9.6, tLp: 3.84 }
};
var GUNSND_LINE = { bp: ['small', 'naval', 'big'], smokeless: ['qf', 'mid', 'big'] };
// 艦砲（Tim 2026-10-28：「嘗試優化一下目前的開炮聲 希望更有震撼力一點(目前有點無力)」「炮聲可以參考這個影片去模仿聲紋」—— bilibili BV1sz4y117oC《Naval Action》全船展示）：
//   以前黑火藥那條線只有小砲 → 大口徑兩個錨點，小砲的參考是節慶的小砲（−20 dB 0.05 秒）⇒ 24 磅照 ln 內插只往大口徑走 22%，一聲「啪」就沒了。
//   現在兩個錨點照那支影片量（只拿來量、⛔ 不進 repo；畫面確認是鏡頭那艘自己開、看得到砲口煙的單發，被打中、齊射的剔掉）：
//     small（8 磅，3.9 kg）← P1 7～4 等船 10 發（6～18 磅為主）：主頻 63 Hz、掉 10 dB 0.4～3.9 秒（中位 1.43）；
//     naval（36 磅，17.6 kg）← P3 3～1 等船 4 發（32～42 磅）：80～200 Hz 只低 1.4～2.4 dB、掉 10 dB 5.4～5.9 秒（6～7 秒才回到背景）。
//   頻帶剖面 ＝ 開砲後 1 秒 − 前 1 秒的背景；630–800 Hz、1.26–2.5 kHz 背景比砲聲大 ⇒ 不算。座標搜尋（頻帶差 ＋ 8 × |ln 掉 10 dB 秒數比|）：
//     8 磅 頻帶差 2.5、掉 10 dB 1.34 秒；36 磅 2.1、5.55 秒；24 磅 3.8 秒、6 磅 0.84 秒。⚠ 兩組參考彼此的頻帶差只有 1.6 ⇒ 形狀只對到 2～3 dB，大小砲主要差在長度。
// 震撼力的兩層（重擊、滾雷也一起照上面那支影片搜；Tim 在試聽頁 85_gunlab.js 聽過：「這版可以」2026-10-28）：
//   重擊 kick：一記往下掃的低頻（主頻 × 2 → × 1.1）連同身體過一道 tanh 飽和 ⇒ 生出泛音，筆電喇叭放不出主頻也聽得到「咚」；
//     ⚠ 不往 40 Hz 以下掃：限制器（門檻 −14 dB）會被次低頻佔滿、把脆響一起壓掉（第一版：500 Hz 以上 18% ⇒ 2%，300 m 外的砲跟眼前的只差 2.5 dB）；
//   滾雷 roll：開完砲之後一路翻滾回來的低沉轟鳴（參考裡掉 10 dB 要 5 秒以上的就是它）—— 尾聲的包絡是指數掉到 −80 dB，要它 5 秒才掉 10 dB 得拉到 45 秒，形狀不對。
//     全場共用一條（gunRumble）：每一聲砲把它推高一點（能量相加、上限 1）再照時間常數退 ⇒ 一整排齊射疊成一片滾雷，⛔ 不是每門砲各開一條（連續開砲時聲部會被尾聲佔滿、後面的砲沒聲音；Tim 2026-10-28）。
//   口徑大小 s（0.5 kg → 0、900 kg → 1）：kick 越大越長；roll 越大越響（× (s ÷ 0.5)^sz）、越久（d0 → d1 指數內插、上限 30 秒）—— 8 磅、36 磅的 s 只差 0.3 → 0.52，長度卻差 4 倍，線性內插拉不開。
var GUNSND_KICK = { a: 0.55, d0: 0.15, d1: 0.364, f0: 2.06, f1: 1.09, drive: 5.5, out: 0.64 }, GUNSND_ROLL = { a: 1.69, d0: 1.04, d1: 605, sz: 1.6, lp: 5.77, lfo: 0.35 }, GUNSND_SHAPE = null;
function gunShape(ac) {
  var k = GUNSND_KICK.drive;
  if (!GUNSND_SHAPE || GUNSND_SHAPE.k !== k) { var n = 1024; GUNSND_SHAPE = new Float32Array(n); GUNSND_SHAPE.k = k; for (var i = 0; i < n; i++) GUNSND_SHAPE[i] = Math.tanh(k * (i / (n - 1) * 2 - 1)) / Math.tanh(k); }
  var w = ac.createWaveShaper(); w.curve = GUNSND_SHAPE; w.oversample = '2x'; return w;
}
/** 共用的滾雷（每個 ac 一條，開第一聲砲時建）：一直在跑的雜音 ⇒ 低通 ⇒ 兩個慢 LFO 晃音量（翻滾）⇒ 音量線（gunRoll 推高、自己退）。 */
function gunRumble(ac, out) {
  if (ac.gunRum && ac.gunRum.out === out) return ac.gunRum;
  var s = ac.createBufferSource(), f = ac.createBiquadFilter(), m = ac.createGain(), g = ac.createGain();
  s.buffer = noiseBuf || noiseMake(ac); s.loop = true; s.playbackRate.value = 0.35; f.type = 'lowpass'; f.Q.value = 0.7; f.frequency.value = 200; g.gain.value = 0; m.gain.value = 1;
  var L = [0.7, 1.9].map(function (hz) { var o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = hz; og.gain.value = GUNSND_ROLL.lfo / 2; o.connect(og); og.connect(m.gain); o.start(); return og; });
  s.connect(f); f.connect(m); m.connect(g); g.connect(out); s.start();
  return (ac.gunRum = { out: out, f: f, g: g, L: L, lv: 0, t: 0, tau: 1 });
}
/** 推高滾雷：t 那一刻多一份 a（能量相加，上限 1），fLp 低通，d 退到 −40 dB 大約幾秒。 */
function gunRoll(ac, out, t, a, fLp, d) {
  var R = gunRumble(ac, out), now = R.lv * Math.exp(-Math.max(0, t - R.t) / R.tau), lv = Math.min(1, Math.sqrt(now * now + a * a));
  R.tau = Math.max(R.tau * Math.exp(-Math.max(0, t - R.t) / 3), d / 4.6); R.lv = lv; R.t = t + 0.15;
  R.g.gain.cancelScheduledValues(t); R.g.gain.setValueAtTime(now, t); R.g.gain.linearRampToValueAtTime(lv, t + 0.15); R.g.gain.setTargetAtTime(0, t + 0.15, R.tau);
  R.f.frequency.setTargetAtTime(fLp, t, 0.05); R.L.forEach(function (og) { og.gain.value = GUNSND_ROLL.lfo / 2; });
}
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
/** 開炮音的可調參數（試聽頁 85_gunlab.js 讀、寫、複製給人）：錨點、黑火藥那條線、重擊、滾雷、響度倍數。gunSndSet 只蓋給了的欄位。 */
function gunSndGet() { return JSON.parse(JSON.stringify({ A: GUNSND_A, line: GUNSND_LINE.bp, kick: GUNSND_KICK, roll: GUNSND_ROLL, vol: GUNSND_VOL })); }
function gunSndSet(c) {
  if (c.A) Object.keys(c.A).forEach(function (k) { GUNSND_A[k] = Object.assign(GUNSND_A[k] || {}, c.A[k]); });
  if (c.line) GUNSND_LINE.bp = c.line.slice();
  if (c.kick) Object.assign(GUNSND_KICK, c.kick);
  if (c.roll) Object.assign(GUNSND_ROLL, c.roll);
  if (c.vol != null) GUNSND_VOL = +c.vol;
}
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
  p.s = clamp(Math.log(shot / 0.5) / Math.log(900), 0, 1);             // 口徑大小（kick、roll 用）
  p.vol = GUNSND_VOL * (1 - 0.5 * p.s);   // 響度：錨點只對了頻帶的形狀 ⇒ 乘回來；小砲是一下的衝擊、乘多一點，大砲的身體長、本來就響（乘太多會被限制器壓扁）
  return p;
}
/** 合成一聲開炮（ac 可以是 OfflineAudioContext）：t 開始、v 音量、p ＝ gunSndPar、dist 離鏡頭幾公尺（遠的低通）、R 亂數。
 *  回傳從 t 起「頭」響幾秒（重擊、爆風、身體、脆響、回音）—— sfxPlay 照它算聲部；尾聲照樣放完、滾雷在共用的那一條，都不算。 */
function gunVoice(ac, out, t, v, p, dist, R) {
  var nb = noiseBuf || noiseMake(ac), dur = 0, lp = ac.createBiquadFilter(), v0 = v; v *= p.vol || 1;
  lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 18000 / (1 + (dist || 0) / 120); lp.connect(out);
  var fp = p.fp * (0.95 + 0.1 * R());                                    // 同一門砲每一發差一點
  function env(g, a, at, d, t0) { g.setValueAtTime(0.0001, t0); g.exponentialRampToValueAtTime(Math.max(a, 0.0002), t0 + at); g.exponentialRampToValueAtTime(0.0001, t0 + at + d); }
  function hiss(type, f0, f1, Q, a, at, d, dt, rate, to) {
    var t0 = t + (dt || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; s.playbackRate.value = rate || 1; f.type = type; f.Q.value = Q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + at + d);
    env(g.gain, a * v, at, d, t0); s.connect(f); f.connect(g); g.connect(to || lp); s.start(t0, R() * 1.5); s.stop(t0 + at + d + 0.05); dur = Math.max(dur, (dt || 0) + at + d + 0.05);
  }
  var K = GUNSND_KICK, sh = gunShape(ac), sg = ac.createGain(); sg.gain.value = K.out; sh.connect(sg); sg.connect(lp);   // 飽和：身體＋kick 過 tanh（輸入 × v 已經是 0～1 上下）
  var kD = K.d0 + (K.d1 - K.d0) * (p.s || 0), o = ac.createOscillator(), og = ac.createGain();
  o.frequency.setValueAtTime(fp * K.f0, t); o.frequency.exponentialRampToValueAtTime(fp * K.f1, t + kD * 0.6);
  env(og.gain, K.a * v, 0.003, kD, t); o.connect(og); og.connect(sh); o.start(t); o.stop(t + kD + 0.05); dur = Math.max(dur, kD + 0.05);   // 重擊
  hiss('lowpass', p.bLp, Math.max(fp * 2, 60), 0.5, p.bA, 0.002, p.bD, 0, 1);              // 爆風
  hiss('bandpass', fp * 1.3, fp * 0.8, 0.8, p.oA, 0.003, p.oD, 0, 0.6, sh);                // 身體（過飽和）
  hiss('highpass', p.cHz, p.cHz * 0.6, 0.5, p.cA, 0.001, p.cD, 0, 1);                      // 脆響
  var head = dur;
  hiss('lowpass', fp * p.tLp, fp * 0.5, 0.6, p.tA, 0.08, p.tD, 0.04, 0.4);                // 尾聲（不算進頭）
  dur = head;
  if (p.eA > 0.005) hiss('lowpass', p.bLp * 0.6, Math.max(fp * 2, 60), 0.5, p.eA, 0.004, 0.03 + p.bD * 2, 0.15 + 0.15 * R(), 1);   // 回音（水面、船身）
  var RL = GUNSND_ROLL;
  if (RL.a > 0) gunRoll(ac, out, t + 0.1, RL.a * v0 * Math.pow((p.s || 0) / 0.5, RL.sz), Math.max(fp * RL.lp, 120) / (1 + (dist || 0) / 300), Math.min(30, RL.d0 * Math.pow(RL.d1 / RL.d0, p.s || 0)));   // 滾雷（共用那一條；音量照沒乘響度倍數的 v ⇒ 遠的砲推得少；口徑 s ＝ 0.5 是 1 倍、照 sz 次方；退到 −40 dB 的秒數 0.5 kg d0 → 900 kg d1 指數內插）
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
/** 一聲開炮的原始波形（調參用：__game.gunSnd.raw；跟 gunRender 同一個限制器、同一個種子）⇒ Promise<{ x: Float32Array, sr }>。 */
function gunRaw(type, dist, sec) {
  var sr = 44100, oc = new OfflineAudioContext(1, Math.round(sr * (sec || 8)), sr), lim = oc.createDynamicsCompressor(), s = 98765;
  lim.threshold.value = -14; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.25;
  var mg = oc.createGain(); mg.gain.value = 0.8; mg.connect(lim); lim.connect(oc.destination);
  function R() { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x80000000; }
  gunVoice(oc, mg, 0.05, 1 / (1 + (dist || 0) / 70), gunSndPar(type), dist || 0, R);
  return oc.startRendering().then(function (buf) { return { x: buf.getChannelData(0), sr: sr }; });
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

// ───── 命中與燃燒（TASK-0979；Tim 2026-10-26：「是否可以優化命中音效 可以根據材質 砲彈類型設定(可以用一個現在的音效當fallback)」「希臘火可以專門做一種音效(燃燒)」「不用走純寫實」）─────
// 以前砲彈打中什麼都放 crack（雜音過 900–1800 Hz 帶通、0.35 秒），只差音量；希臘火噴口放 splash、打中放 crack；船上延燒沒有聲音。
// 現在 sfx('imp', 打點, 音量, { mat, ev, m, n })，全部現場合成；ev 不認得 ⇒ 照舊放 crack（impPar 回 null）。
//   mat（impMat）：wood 木頭、銅皮／metal 鐵甲、黃銅、鍋爐（硬度 ≥ 1.5 的金屬）／stone 石材、磚（堡壘）／glass 玻璃
//   ev：solid 實心彈咬進去／pen 擊穿鐵甲／dent 凹痕／rico 彈開／chain 鏈彈／stone 石彈（投石機）／bolt 弩箭、火箭／shell 爆裂彈炸開的碎片（爆炸本身照舊 blast）／model 打中砲、舵輪這些模型
//   m：彈重（kg；21_gunnery.js shotM）⇒ 越重越低、越長；n：這一下打掉幾格 ⇒ 碎片多少（沒給 ＝ 照錨點）
// 照 CC0 參考的聲紋調（參考只拿來量、⛔ 不進遊戲；偏遊戲感）—— OpenGameArt Thimras《Battle at sea》（做給帆船海戰遊戲的）：
//   cannon_hit_ship_short（木船）、cannon_hit_wall_no_splash（石牆）、cannon_hit_cannon（砲打到砲、會響）；freesound 148840 跳彈（第一聲）、614062 鐵件重擊（鳴響的頻率比 1：1.67：4.0）。
//   量法同開炮（TASK-0978）：三分之一八度頻帶形狀（對最大那一帶）、衰減到 −20／−40 dB 的秒數；四個錨點各用座標搜尋。
//   讀數（頻帶差 dB，63 Hz–6.3 kHz 的平均；括號 ＝ 舊的 crack 對同一份）：木 1.8（15.4）、石 3.2（13.4）、鐵 2.1（14.0）、跳彈 2.9（4.1）。
//   木頭以 40–125 Hz 的一記低沉為主、1 kHz 以上 −13～−19 dB（遊戲的命中音是「咚」不是「啪」）；石牆整段平、碎石顆粒每秒 10 個；鐵甲 299 Hz 鳴響（比周圍高 13 dB）。
//   鐵甲的鳴響：只對頻帶形狀的話搜尋會把它壓到聽不出來（頻帶量不到音高）⇒ 照參考的窄峰定 rgA 0.1（299 Hz 高出 13 dB；參考 13）。
// 層（impVoice）：咚（往下掃的低頻正弦）、身體（低通雜音）、撞擊（寬頻雜音）、碎木／碎石／碎玻璃顆粒、鐵板鳴響（正弦一對、差 0.7% ⇒ 會拍）、低沉尾聲、跳彈呼嘯、鏈彈撕扯。
// 錨點 ＝ 24 磅實心彈（10.9 kg，PEN.ref）。彈重 m：頻率 × (m ÷ 10.9)^(−1/6)（0.6–1.6）、長度 × (m ÷ 10.9)^0.15（0.55–1.7）、音量 × (m ÷ 10.9)^0.12（0.6–1.4）；顆粒照 n ÷ 80（0.25–1.5）。
// 距離：音量照舊 ÷ (1 ＋ 距離 ÷ 70)；再一道低通 18 kHz ÷ (1 ＋ 距離 ÷ 120)（同開炮）。
// p：th 咚（A 音量、F Hz、D 秒）／bo 身體（Lp 低通）／cr 撞擊／kr 玻璃裂開的「喀」（F 高通）／sh 玻璃碎開（F 高通）／sp 碎木（N 幾粒、T 散多久）／rb 碎石／gs 碎玻璃（N 幾片、E 幾成擠在開頭、F～F2 頻率、Q）／rg 鳴響（F、R 頻率比、W 各支音量）／tl 尾聲／wh 呼嘯／te 撕扯
var IMP_A = {
  wood:  { thA: 0.43, thF: 88, thD: 0.23, boA: 0.83, boLp: 825, boD: 0.38, crA: 1.09, crLp: 4400, crD: 0.14, spA: 1, spN: 11, spT: 0.9, tlA: 0.66, tlLp: 144, tlD: 6.2 },
  stone: { thA: 0.41, thF: 50, thD: 0.34, boA: 0.41, boLp: 1090, boD: 0.73, crA: 0.78, crLp: 7500, crD: 0.28, rbA: 1.03, rbN: 18, rbT: 0.95, tlA: 0.44, tlLp: 700, tlD: 3.9 },
  metal: { thA: 0.55, thF: 50, thD: 1, boA: 1.41, boLp: 1550, boD: 1.41, crA: 3.52, crLp: 10900, crD: 0.35, rgA: 0.1, rgF: 299, rgR: [1, 1.67, 4, 11.8], rgW: [1, 0.6, 0.45, 0.15], rgD: 2.9, tlA: 0.88, tlLp: 440, tlD: 3.5 },
  rico:  { thA: 0.16, thF: 120, thD: 0.073, crA: 4.4, crLp: 9000, crD: 0.145, rgA: 0.14, rgF: 500, rgR: [1, 1.67, 2.75], rgW: [1, 0.6, 0.4], rgD: 0.42, whA: 0.14, whF: 3900 },
  bolt:  { thA: 0.8, thF: 170, thD: 0.07, boA: 0.45, boLp: 600, boD: 0.08, crA: 0.6, crLp: 3000, crD: 0.03, spA: 0.6, spN: 2, spT: 0.1 },  // 〔佔位〕弩箭釘進木頭的一記短「篤」（沒有參考：照木頭那一組縮短、拿掉尾聲；峰值 0.4 ＝ 以前 crack 打木頭的小一號）
  glass: { thA: 0.47, thF: 82, thD: 0.08, krA: 1.0, krF: 3000, krD: 0.008, shA: 0.25, shF: 2000, shD: 1.2, rbA: 1.13, rbN: 10, rbT: 1.84, gsA: 2.06, gsN: 80, gsE: 0.25, gsT: 1.8, gsF: 2500, gsF2: 9000, gsQ: 15 }
};
// 玻璃（Tim 2026-10-26「玻璃可以微調一下(參考碎玻璃聲)」⇒「玻璃音效很遊戲(有點像8 bit風格) 少了清脆碎裂感」）：
//   參考（CC0，只拿來量）：freesound 336425 玻璃碎裂並掉落（221Beimesche）、448004 打破窗戶（Kneeling）彼此差 5.1 dB；221528（unfa）很細小很亮、只拿來看亮度。
//   第二版（896f7cd）的叮噹是短正弦 ⇒ 一聲一聲純音的「嗶」＝ 8 bit 感；而且尺只量到 6.3 kHz，沒看到最上面 ⇒ 4–8 kHz 比 1–4 kHz 低 5 dB（窗戶 +0.5、unfa +10）。
//   第三版：碎片 ＝ 雜音打進兩個不成倍數的高 Q 共振（f、2.32 f，f 2.5–9 kHz、Q 15，8–58 ms）——不是正弦；開頭一記很短的高頻「喀」（8 ms、起音 < 1 ms）；
//     兩成五的碎片擠在開頭 0.12 秒（碎開的那一下），其他照 u² 散在 1.8 秒裡（掉落）；再加碎開的那一片嘩、碎片落在甲板上（碎石那一層）、一記打到窗框的咚。
//   尺放寬到 10 kHz、加三格：4–8 kHz／8–16 kHz 對 1–4 kHz 的 dB（亮度）、每 23 ms 最尖那根比周圍高幾 dB（尖峰）、1 ms 解析的起音；在比對頁座標搜尋（頻帶差＋衰減＋亮度＋尖峰）。
//   讀數（遊戲錄出來的 24 磅；括號 ＝ 第二版）：頻帶差 3.6／4.0（碎裂掉落／窗戶，到 10 kHz；兩份彼此 5.1；第二版 3.2／3.5）、−20／−40 dB 0.44／1.03 秒（0.22／0.45）、
//     4–8 kHz +1.8 dB（−3.6）、8–16 kHz +3.5 dB（−1.8）、尖峰 9.4 dB（11.3；參考 9.5～15）、起音 4 ms、峰值 0.70。
//   「喀」krA 2.4（搜出來的）⇒ 0.5 ms 的尖端穿過限制器（起音 2 ms 抓不住）、峰值 0.97 ⇒ 1.0。
//   碎片 3 個共振 × 200 片也試過（分數 9.9 對 9.7、一聲 600 組節點）⇒ 2 個 × 80 片（160 組）。玻璃一格就是一片 ⇒ 碎片數不照打掉幾格縮放。
// 彈種 ⇒ 乘在錨點上（只乘錨點有的那一格）；add ＝ 另外加一層（錨點沒有那一層才加，整組帶齊：A 音量＋N 幾粒…）。〔佔位〕：照聽起來該往哪邊的方向，不是量的
//   ⛔ 以前「錨點沒有的那一格 ⇒ 直接用乘數」：鏈彈打玻璃、石牆 ⇒ 碎木有粒數（1.6）沒有音量 ⇒ NaN，sfxPlay 丟例外；石彈打石牆 ⇒ 碎石 18 × 8 粒。
var IMP_EV = {
  solid: {},
  pen:   { add: { teA: 0.5, teN: 5 } },                                 // 擊穿：鐵板被撕開
  dent:  { rgA: 3, crA: 0.4, boA: 0.7, tlD: 0.5 },                      // 凹痕：沒穿、整塊板響 ⇒ 對 614062 鐵件重擊 4.7 dB（299 Hz 高出周圍 27.6 dB；參考 29.5）
  chain: { thA: 0.6, spN: 1.6, add: { teA: 0.6, teN: 10 } },            // 鏈彈：橫著撕過去
  stone: { thA: 1.5, spN: 0.6, add: { rbA: 0.6, rbN: 8, rbT: 0.6 } },   // 石彈：更悶的一記、石頭自己也碎
  shell: { thA: 0, crA: 0.6, boA: 0.4, tlA: 0 },                        // 爆裂彈：爆炸照舊 blast，這裡只放打掉的碎片
  model: {}                                                             // 打中砲（鐵）：錨點本來就是 cannon_hit_cannon（砲打到砲）；木頭的模型照實心彈
};
var IMP_REF = 10.9, IMP_MATS = ['wood', 'metal', 'stone', 'glass'];
/** 那一格的材質參數（matAt）⇒ 命中音的材質。 */
function impMat(m) {
  if (!m) return 'wood';
  if (m.kind === 'metal') return m.hard >= 1.5 ? 'metal' : 'wood';      // 銅皮（1.1）包在木殼外面 ⇒ 照木頭
  if (m.kind === 'wood') return 'wood';
  return m.clear > 0 ? 'glass' : 'stone';                               // other：玻璃、磚、石材
}
/** o ＝ { mat, ev, m, n } ⇒ 合成參數；ev 不認得 ⇒ null（照舊放 crack）。 */
function impPar(o) {
  var ev = o.ev || 'solid', mat = IMP_MATS.indexOf(o.mat) >= 0 ? o.mat : 'wood', base;
  if (ev === 'rico') base = IMP_A.rico;
  else if (ev === 'bolt') base = IMP_A.bolt;
  else if (ev === 'pen' || ev === 'dent' || (ev === 'model' && mat === 'metal')) base = IMP_A.metal;
  else if (IMP_EV[ev]) base = IMP_A[mat];
  else return null;
  var p = Object.assign({}, base), M = ev === 'model' && mat !== 'metal' ? IMP_EV.solid : IMP_EV[ev] || {};
  Object.keys(M).forEach(function (k) { if (k !== 'add' && base[k] != null) p[k] = base[k] * M[k]; });
  if (M.add) Object.keys(M.add).forEach(function (k) { if (base[k.slice(0, 2) + 'A'] == null) p[k] = M.add[k]; });
  var s = (o.m > 0 ? o.m : IMP_REF) / IMP_REF, fk = clamp(Math.pow(s, -1 / 6), 0.6, 1.6), dk = clamp(Math.pow(s, 0.15), 0.55, 1.7), nk = o.n >= 0 && base !== IMP_A.glass ? clamp(o.n / 80, 0.25, 1.5) : 1;
  ['thF', 'boLp', 'tlLp'].forEach(function (k) { if (p[k]) p[k] *= fk; });
  ['thD', 'boD', 'tlD', 'rgD'].forEach(function (k) { if (p[k]) p[k] *= dk; });
  ['spN', 'rbN', 'gsN'].forEach(function (k) { if (p[k]) p[k] *= nk; });
  p.vol = IMP_VOL * clamp(Math.pow(s, 0.12), 0.6, 1.4);
  return p;
}
var IMP_VOL = 1;
/** 合成一聲命中（ac 可以是 OfflineAudioContext）：t 開始、v 音量、p ＝ impPar、dist 離鏡頭幾公尺、R 亂數。回傳從 t 起響幾秒。 */
function impVoice(ac, out, t, v, p, dist, R) {
  var nb = noiseBuf || noiseMake(ac), dur = 0, lp = ac.createBiquadFilter(), c, u; v *= p.vol || 1;
  lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 18000 / (1 + (dist || 0) / 120); lp.connect(out);
  function env(g, a, at, d, t0) { g.setValueAtTime(0.0001, t0); g.exponentialRampToValueAtTime(Math.max(a, 0.0002), t0 + at); g.exponentialRampToValueAtTime(0.0001, t0 + at + d); }
  function tone(f0, f1, a, at, d, dt) {
    var t0 = t + (dt || 0), s = ac.createOscillator(), g = ac.createGain();
    s.frequency.setValueAtTime(f0, t0); s.frequency.exponentialRampToValueAtTime(f1, t0 + at + d); env(g.gain, a * v, at, d, t0);
    s.connect(g); g.connect(lp); s.start(t0); s.stop(t0 + at + d + 0.05); dur = Math.max(dur, (dt || 0) + at + d + 0.05);
  }
  function hiss(type, f0, f1, Q, a, at, d, dt, rate) {
    var t0 = t + (dt || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; s.playbackRate.value = rate || 1; f.type = type; f.Q.value = Q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + at + d);
    env(g.gain, a * v, at, d, t0); s.connect(f); f.connect(g); g.connect(lp); s.start(t0, R() * 1.5); s.stop(t0 + at + d + 0.05); dur = Math.max(dur, (dt || 0) + at + d + 0.05);
  }
  if (p.thA) tone(p.thF * 1.6, p.thF, p.thA, 0.004, p.thD);                                              // 咚
  if (p.boA) hiss('lowpass', p.boLp, p.boLp * 0.35, 0.7, p.boA, 0.004, p.boD, 0, 0.5);                  // 身體
  if (p.crA) hiss('lowpass', p.crLp, 500, 0.5, p.crA, 0.002, p.crD, 0, 1);                                // 撞擊
  for (c = Math.round(p.spN || 0); c > 0; c--) { u = R(); hiss('bandpass', 900 + 3500 * R(), 700 + 2000 * R(), 1.2, p.spA * (0.4 + 0.6 * R()) * (1 - 0.7 * u), 0.001, 0.004 + 0.014 * R(), 0.005 + p.spT * u * u, 1); }   // 碎木（越後面越稀）
  for (c = Math.round(p.rbN || 0); c > 0; c--) { u = R(); hiss('bandpass', 250 + 2500 * R() * R(), 200 + 600 * R(), 1, p.rbA * (0.4 + 0.6 * R()) * (1 - 0.6 * u), 0.002, 0.008 + 0.03 * R(), 0.01 + p.rbT * u, 1); }   // 碎石、磚塊滾落
  if (p.krA) hiss('highpass', p.krF, p.krF * 1.3, 0.7, p.krA, 0.0005, p.krD, 0, 1);                       // 玻璃裂開的「喀」
  if (p.shA) hiss('highpass', p.shF, p.shF * 1.5, 0.7, p.shA, 0.002, p.shD, 0, 1);                        // 玻璃碎開的那一片嘩
  for (c = Math.round(p.gsN || 0); c > 0; c--) {                       // 碎玻璃：雜音打進兩個不成倍數的高 Q 共振（不是正弦 ⇒ 不像 8 bit）；gsE 成擠在開頭 0.12 秒、其他照 u² 散在 gsT 秒
    var early = R() < p.gsE, uu = R(), dg = early ? 0.12 * uu * uu : 0.04 + p.gsT * uu * uu, fs = p.gsF * Math.pow(p.gsF2 / p.gsF, R()), kk = R(), ag = p.gsA * (0.15 + 0.85 * kk * kk) * (early ? 1 : 0.6 * (1 - 0.6 * uu)), ds = 0.008 + 0.05 * R() * R();
    hiss('bandpass', fs, fs * (0.995 + 0.01 * R()), p.gsQ, ag, 0.0003, ds, dg, 1); hiss('bandpass', fs * 2.32, fs * 2.32 * (0.995 + 0.01 * R()), p.gsQ, ag / 2, 0.0003, ds / 1.5, dg, 1);
  }
  if (p.rgA) p.rgR.forEach(function (r, k) { var a = p.rgA * p.rgW[k], d = p.rgD / (1 + 0.35 * k), f = p.rgF * r; tone(f, f * 0.997, a, 0.002, d); tone(f * 1.007, f * 1.003, a * 0.6, 0.003, d * 0.9); });   // 鐵板鳴響
  if (p.tlA) hiss('lowpass', p.tlLp, 60, 0.6, p.tlA, 0.05, p.tlD, 0.03, 0.4);                            // 尾聲
  if (p.whA) { tone(p.whF, p.whF * 0.55, p.whA, 0.01, 0.35, 0.01); hiss('bandpass', p.whF * 1.1, p.whF * 0.6, 6, p.whA * 0.6, 0.01, 0.3, 0.01, 1); }   // 跳彈呼嘯
  for (c = Math.round(p.teN || 0); c > 0; c--) hiss('bandpass', 300 + 2200 * R(), 250 + 800 * R(), 0.9, p.teA * (0.5 + 0.5 * R()), 0.004, 0.015 + 0.03 * R(), 0.01 + 0.3 * R(), 0.7);   // 撕扯
  return dur;
}
// 希臘火（同一套量法）：freesound 395038 火焰噴射器（AslakHostaker，遊戲用的武器音）、260554 火「呼」地燒起來、563766 劈啪的火（florianreichelt）。
//   讀數（頻帶差 dB；舊的 splash／crack 對同一份）：噴口 1.1（15.6）、轟燃 5.9（23.9；參考 200 Hz 以上陡降 16～30 dB，兩階低通追不上）、劈啪 2.2（8.8）。
//   轟燃後面再接劈啪（參考沒有：火燒起來之後的那幾秒）⇒ 整段對參考 9.8；劈啪照延燒那一份的音量會到 14.7（「呼」被蓋掉）⇒ 尾聲的劈啪 × 0.3。
//   噴口：200 Hz 一帶的呼嘯（125–630 Hz 都在 −4 dB 內）＋ 2.3 kHz 的嘶聲，音量照 9 Hz 上下抖（火焰的亂流）；轟燃：低通 74 → 640 Hz 往上掃 ＋ 2 秒的劈啪尾聲；
//   劈啪：0.6–3.6 kHz 的短顆粒（每秒 25 粒，音量照 k³：多半很小、偶爾一聲大的）＋ 1.1 kHz 以下很輕的火聲。
// p：at 起、hold 撐住、rel 收（秒）／ro 呼嘯（Lp 低通、Q）／hi 嘶聲（F 帶通）／fl 亂流（Hz、深度）／ws 轟燃（F0 → F1、At 起、D 長）／ck 劈啪（N 每秒、T 散多久、A、F）
var FIRE_SND = {
  gfJet:   { at: 0.08, hold: 0.5, rel: 0.4, roA: 0.8, roLp: 352, roQ: 0.44, hiA: 0.13, hiF: 2270, flHz: 9, flD: 0.35 },
  gfBurst: { at: 0.1, hold: 0, rel: 0.96, roA: 0.66, roLp: 200, roQ: 0.7, flHz: 7, flD: 0.4, wsA: 1.9, wsF0: 74, wsF1: 640, wsAt: 0.136, wsD: 2.56, ckN: 25, ckT: 2, ckA: 0.9, ckF: 1200 }   // 搜出來的形狀整組 × 1.75（只對形狀 ⇒ 峰值 0.26，比命中小一截）
};
var FIRE_VOL = 1;
/** 合成一聲火（ac 可以是 OfflineAudioContext）：參數同 impVoice。回傳從 t 起響幾秒。 */
function fireVoice(ac, out, t, v, p, dist, R) {
  var nb = noiseBuf || noiseMake(ac), dur = 0, T = (p.at || 0.05) + (p.hold || 0) + (p.rel || 0.3), lp = ac.createBiquadFilter(); v *= FIRE_VOL;
  lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 18000 / (1 + (dist || 0) / 120); lp.connect(out);
  function bed(type, f, Q, a, rate) {
    var s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(), am = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain(), at = p.at || 0.05;
    s.buffer = nb; s.loop = true; s.playbackRate.value = rate || 1; fl.type = type; fl.frequency.value = f; fl.Q.value = Q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(a * v, 0.0002), t + at); g.gain.setValueAtTime(Math.max(a * v, 0.0002), t + at + (p.hold || 0)); g.gain.exponentialRampToValueAtTime(0.0001, t + T);
    am.gain.value = 1; lfo.frequency.value = (p.flHz || 9) * (0.8 + 0.4 * R()); lg.gain.value = p.flD || 0.35; lfo.connect(lg); lg.connect(am.gain);   // 亂流
    s.connect(fl); fl.connect(am); am.connect(g); g.connect(lp); s.start(t, R() * 1.5); s.stop(t + T + 0.05); lfo.start(t); lfo.stop(t + T + 0.05); dur = Math.max(dur, T + 0.05);
  }
  function hiss(type, f0, f1, Q, a, at, d, dt, rate) {
    var t0 = t + (dt || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; s.playbackRate.value = rate || 1; f.type = type; f.Q.value = Q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + at + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(a * v, 0.0002), t0 + at); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d);
    s.connect(f); f.connect(g); g.connect(lp); s.start(t0, R() * 1.5); s.stop(t0 + at + d + 0.05); dur = Math.max(dur, (dt || 0) + at + d + 0.05);
  }
  if (p.roA) bed('lowpass', p.roLp, p.roQ || 0.7, p.roA, 0.6);                                          // 呼嘯
  if (p.hiA) bed('bandpass', p.hiF, 0.7, p.hiA, 1);                                                    // 嘶聲
  if (p.wsA) hiss('lowpass', p.wsF0, p.wsF1, 0.9, p.wsA, p.wsAt || 0.12, p.wsD, 0, 0.5);              // 轟燃
  for (var c = Math.round((p.ckN || 0) * (p.ckT || T)); c > 0; c--) { var u = R(), k = R(); hiss('bandpass', p.ckF * (0.5 + 1.5 * R()), p.ckF * 0.5, 1.5, p.ckA * k * k * k * (1 - 0.5 * u), 0.0008, 0.002 + 0.01 * R(), 0.02 + (p.ckT || T) * u, 1); }   // 劈啪
  return dur;
}
// 船上延燒（49_burn.js）：一直響的火聲，照火勢與離鏡頭遠近 —— 每艘 √(燒著的格 ＋ 40 × 燒著的帆) ÷ (1 ＋ 距離 ÷ 70) 加起來 ÷ BURN_SND_REF ＝ 火勢 lv（0–1.5）。
//   呼嘯＋嘶聲兩條一直開著（音量 × lv^0.7，0.3 秒追上）；劈啪照 lv 排（卜瓦松，每秒 25 × lv 粒，每一格往前排 0.25 秒；同 02_ambient.js 的雨滴）；
//   低通照最近那一團火的距離。全滅（lv 0）兩秒後拆掉。⛔ 只讀 sh.burn（不碰模擬、不抽 rnd()）。
//   音量 × BURN_SND_VOL 0.6：火勢 1 一直響的 RMS −22 dB ⇒ −26.5 dB（一直響的東西比一聲一聲的命中小聲）。
var BURN_SND = { roA: 0.156, roLp: 1120, roQ: 0.5, hiA: 0.128, hiF: 909, flHz: 3, flD: 0.5, ckN: 25, ckA: 1.56, ckF: 1200 }, BURN_SND_REF = 15, BURN_SND_VOL = 0.6, BSND = null;
function burnSndLevel() {
  var E = CAM.eye, L = 0, dm = 1e9;
  SHIPS.forEach(function (sh) {
    var B = sh.burn; if (!B || sh.sink > 40 || !(B.n || B.sl.length)) return;
    var d = E && sh.center ? Math.hypot(sh.center[0] - E[0], sh.center[1] - E[1], sh.center[2] - E[2]) : 0;
    L += Math.sqrt(B.n + 40 * B.sl.length) / (1 + d / 70); dm = Math.min(dm, d);
  });
  return { lv: clamp(L / BURN_SND_REF, 0, 1.5), d: dm < 1e9 ? dm : 0 };
}
function burnSndBuild(ac, dest) {
  var p = BURN_SND, A = { ac: ac, lp: ac.createBiquadFilter(), src: [], ck: ac.createGain(), t: ac.currentTime, off: 0 };
  A.lp.type = 'lowpass'; A.lp.Q.value = 0.5; A.lp.connect(dest); A.ck.gain.value = 1; A.ck.connect(A.lp);
  function bed(type, f, Q, rate) {
    var s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(), am = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    s.buffer = noiseBuf || noiseMake(ac); s.loop = true; s.playbackRate.value = rate; fl.type = type; fl.frequency.value = f; fl.Q.value = Q; g.gain.value = 0;
    am.gain.value = 1; lfo.frequency.value = p.flHz * (0.8 + 0.4 * Math.random()); lg.gain.value = p.flD; lfo.connect(lg); lg.connect(am.gain);
    s.connect(fl); fl.connect(am); am.connect(g); g.connect(A.lp); s.start(); lfo.start(); A.src.push(s, lfo); return g;
  }
  A.ro = bed('lowpass', p.roLp, p.roQ, 0.6); A.hi = bed('bandpass', p.hiF, 0.7, 1);
  return A;
}
/** 劈啪：排 [t0, t1) 之間的顆粒（lv ＝ 火勢；R 亂數）。 */
function burnSndCrackle(A, t0, t1, lv, R) {
  var ac = A.ac, p = BURN_SND, t = Math.max(A.t, t0);
  if (lv > 0.01) while (true) {
    t += -Math.log(1 - R() * 0.999) / (p.ckN * lv);
    if (t >= t1) break;
    var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), k = R(), a = p.ckA * k * k * k * Math.pow(lv, 0.7) * FIRE_VOL * BURN_SND_VOL, d = 0.002 + 0.01 * R();
    s.buffer = noiseBuf || noiseMake(ac); f.type = 'bandpass'; f.frequency.setValueAtTime(p.ckF * (0.5 + 1.5 * R()), t); f.frequency.exponentialRampToValueAtTime(p.ckF * 0.5, t + d); f.Q.value = 1.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(a, 0.0002), t + 0.0008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.0008 + d);
    s.connect(f); f.connect(g); g.connect(A.ck); s.start(t, R() * 1.5); s.stop(t + d + 0.01);
  }
  A.t = t1;
}
function burnSndSet(A, lv, d, t, tc) {
  var k = Math.pow(lv, 0.7) * FIRE_VOL * BURN_SND_VOL;
  A.ro.gain.setTargetAtTime(BURN_SND.roA * k, t, tc); A.hi.gain.setTargetAtTime(BURN_SND.hiA * k, t, tc);
  A.lp.frequency.setTargetAtTime(18000 / (1 + d / 120), t, tc);
}
/** 每一格畫面（90_main.js frame）：還沒有聲音、或沒有船在燒 ⇒ 什麼都不做。 */
function burnSndFrame() {
  if (!AC) return;
  var r = burnSndLevel(), lv = muted ? 0 : r.lv, now = AC.currentTime;
  if (!BSND) { if (lv <= 0) return; BSND = burnSndBuild(AC, AC.sfxBus); }
  burnSndSet(BSND, lv, r.d, now, 0.3); burnSndCrackle(BSND, now, now + 0.25, lv, Math.random);
  if (lv > 0) BSND.off = 0; else if (!BSND.off) BSND.off = now; else if (now - BSND.off > 2) { try { BSND.lp.disconnect(); BSND.src.forEach(function (n) { n.stop(); }); } catch (e) { } BSND = null; }   // 火全滅兩秒 ⇒ 拆掉
}
/** 命中與希臘火的試聽集（__game.impLab；src/tests/ambient_lab.py --lab imp）：每段 sec 秒、同一個限制器、固定種子；舊的 crack 當對照。
 *  ?cases=名字:種類:材質:彈種:彈重 kg:格數:距離;… 換掉 —— 種類 imp（命中）／old（舊的 crack，音量 ＝ 彈重那一欄）／gfJet、gfBurst（希臘火）／burn（延燒，火勢 ＝ 彈重那一欄、響滿 sec 秒）。 */
var IMP_CASES = [['舊 crack（實心彈打木頭）', 'old', '', '', 1.2], ['舊 crack（打不穿、凹痕）', 'old', '', '', 0.5],
  ['木 24 磅實心彈', 'imp', 'wood', 'solid', 10.9, 80], ['木 6 磅實心彈', 'imp', 'wood', 'solid', 2.7, 30], ['木 68 磅實心彈', 'imp', 'wood', 'solid', 30.8, 160],
  ['木 鏈彈', 'imp', 'wood', 'chain', 10.9, 60], ['木 石彈（投石機）', 'imp', 'wood', 'stone', 40, 60], ['木 弩箭', 'imp', 'wood', 'bolt', 0.3], ['木 爆裂彈的碎片（＋爆炸）', 'imp', 'wood', 'shell', 10.9, 120],
  ['鐵甲 擊穿 12 吋', 'imp', 'metal', 'pen', 318, 200], ['鐵甲 凹痕 24 磅', 'imp', 'metal', 'dent', 10.9], ['鐵甲 彈開', 'imp', 'metal', 'rico', 10.9],
  ['石牆（堡壘）24 磅', 'imp', 'stone', 'solid', 10.9, 80], ['玻璃', 'imp', 'glass', 'solid', 10.9, 20], ['打中砲（鐵）', 'imp', 'metal', 'model', 10.9], ['打中舵輪（木）', 'imp', 'wood', 'model', 10.9],
  ['木 24 磅實心彈 300 m 外', 'imp', 'wood', 'solid', 10.9, 80, 300],
  ['希臘火 噴口', 'gfJet'], ['希臘火 打中', 'gfBurst'], ['延燒 小火（火勢 0.3）', 'burn', '', '', 0.3], ['延燒 大火（火勢 1）', 'burn', '', '', 1]];
function impLab(q) {
  var sec = +(q.get('sec') || 4), cs = q.has('cases') ? q.get('cases').split(';').filter(function (s) { return s; }).map(function (s) { var a = s.split(':'); return [a[0], a[1], a[2], a[3], +a[4] || 0, a[5] === undefined || a[5] === '' ? -1 : +a[5], +a[6] || 0]; }) : IMP_CASES, out = [];
  return cs.reduce(function (pr, c) { return pr.then(function () { return impRender(sec, c).then(function (r) { r.name = c[0]; out.push(r); }); }); }, Promise.resolve()).then(function () { return out; });
}
function impRender(sec, c) {
  var sr = 44100, oc = new OfflineAudioContext(2, Math.round(sr * sec), sr), lim = oc.createDynamicsCompressor(), s = 98765, p = null, k = c[1], dist = c[6] || 0, t = 0.05;
  lim.threshold.value = -14; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.25;   // 跟遊戲的 master 同一個限制器（initAudio）
  var mg = oc.createGain(); mg.gain.value = 0.8; mg.connect(lim); lim.connect(oc.destination);
  function R() { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x80000000; }
  var v = 1 / (1 + dist / 70);                                           // 音量照 sfxPlay（vol 1）
  if (k === 'old') {                                                     // 舊的 crack（sfxPlay 那一行照抄；音量 ＝ c[4]）
    var src = oc.createBufferSource(), f = oc.createBiquadFilter(), g = oc.createGain(), a = 1.4 * (c[4] || 1);
    src.buffer = noiseBuf || noiseMake(oc); src.playbackRate.value = 0.6 + R() * 0.5; f.type = 'bandpass'; f.frequency.value = 900 + R() * 900; f.Q.value = 0.8;
    src.connect(f); f.connect(g); g.connect(mg); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); src.start(t, R()); src.stop(t + 0.4);
  } else if (k === 'imp') { p = impPar({ mat: c[2], ev: c[3], m: c[4], n: c[5] }); impVoice(oc, mg, t, v, p, dist, R); if (c[3] === 'shell') impBlast(oc, mg, t, v * 1.4, R); }
  else if (FIRE_SND[k]) fireVoice(oc, mg, t, v, FIRE_SND[k], dist, R);
  else if (k === 'burn') { var A = burnSndBuild(oc, mg); burnSndSet(A, c[4], dist, 0, 0.01); burnSndCrackle(A, 0, sec, c[4], R); }
  return oc.startRendering().then(function (buf) { var r = audioWav(buf), sp = audioSpec(buf.getChannelData(0), sr); r.cent = sp.cent; r.hi = sp.hi; r.mid = sp.mid; r.lo = sp.lo; r.atk = sp.atk; r.o = { kind: k, mat: c[2] || '', ev: c[3] || '', m: c[4] || 0, n: c[5], dist: dist }; return r; });
}
/** 爆炸那一聲（sfxPlay 'blast' 照抄；試聽集的爆裂彈那一段疊上去聽）。 */
function impBlast(ac, out, t, v, R) {
  var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf || noiseMake(ac); src.playbackRate.value = 0.6 + R() * 0.5; f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(60, t + 1.8);
  src.connect(f); f.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.6 * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2); src.start(t, R()); src.stop(t + 2.25);
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

// ───────────────────────── 背景音樂：合成音讀譜播放船歌（TASK-0677） ─────────────────────────
// Tim 2026-10-17：「是否可以用點子合成音來播放樂譜 樂譜可以找看看真實船歌 同時設計一套樂譜系統(讀譜播放 節省空間)」「然後這個做為BGM 要另外增加一個音效 BGM音量設定頁面」。
// 樂譜：ABC 記譜法的子集（一首一個物件，見 TUNES；格式寫在 src/README「背景音樂的樂譜」）—— 一首旋律＋低音約 0.2–0.3 KB（音檔一首要 1–3 MB）。
//   音名 C D E F G A B（C ＝ 中央 C）、小寫高八度，後面 ' 再高、, 再低；^ 升 _ 降 = 還原（照 K 調號；同一小節同一個音名同八度沿用，| 換小節失效）；
//   時值 ＝ 單位長度 L（八分音符）的倍數：無 ＝ 1、2 ＝ 2、/2 ＝ 一半、3/2 ＝ 一個半；z 休止；- 連到下一個同音高（跨小節）；[M:3/4] 中途換拍號（只給人讀，時間照時值算）。
// 曲子只從公有領域的樂譜取（⛔ 不用近代編曲、網路上別人的 ABC 轉譜）：R. R. Terry《The Shanty Book》Part I（Curwen 1921）——
//   旋律照書上的人聲那一行、低音取鋼琴左手最低音；從 Project Gutenberg #20774 附的 MIDI 量化到十六分，再逐小節對過書頁的譜面（讀數在 TASK-0677）。
// 播放：WebAudio（02_audio.js 的 AC）；旋律 ＝ 鋸齒波＋低通＋晚到的顫音（像提琴），低音 ＝ 兩道微走音的方波＋低通（像手風琴）。往前排 BGM_LOOK 秒，不吃主迴圈。
//   每首反覆到約 BGM_TUNE_S 秒（bgmPasses）、停 BGM_GAP 秒換下一首（輪播照自己的 LCG 洗牌）。
// 純聲音：⛔ 不抽 rnd()、不用 Math.random ⇒ 戰局的亂數一位元都不動；靜音（M）⇒ 三條音量線一起 0、排程照跑。
var SND = { sfx: 1, amb: 1, bgm: 0.5, mode: 'sail', tune: 'shuffle' };   // 音量 0–1；mode：'sail' 只在航行（開砲就淡出）／'on' 一直播／'off'；tune：'shuffle' 輪播或曲 id
var SND_DEF = JSON.parse(JSON.stringify(SND));
var SND_FIGHT = -1e9, BGM_FIGHT_S = 20, BGM_FADE = 2.5;                // 開砲、爆炸（02_audio.js sfx boom／blast）之後 BGM_FIGHT_S 秒內算交戰 ⇒ 'sail' 模式淡出（時間常數 BGM_FADE 秒）
var BGM_LOOK = 0.8, BGM_TUNE_S = 60, BGM_GAP = 4, BGM_VOL = 0.5;          // 每首反覆到約 BGM_TUNE_S 秒（2–6 遍：一遍 11 秒的跟一遍 38 秒的都差不多一分鐘）        // BGM_VOL：音樂整條的基準（量過才定，見 TASK-0677）
var BGM = null, BGM_SEED = 7654321, BGM_ORDER = [];                    // BGM：{ tn 正在放的那首, t0 這一遍從幾秒開始, k 下一個沒排的事件, pass 第幾遍, forced 試聽鈕點的（不淡出、播完回輪播） }
var TUNES = [
  { id: 'drunken', name: '酒醉的水手', en: 'What Shall We Do with the Drunken Sailor?', src: 'Terry, The Shanty Book I (1921) No.14, pp.30–31', M: '2/4', K: 'C', Q: 108,
    mel: 'A A/2 A/2 A A/2 A/2|A D F A|G G/2 G/2 G G/2 G/2|G C E G|A A/2 A/2 A A/2 A/2|A B c d|c A G E|D2 D2|A2 A3/2 A/2|A D F A|G2 G3/2 G/2|G C E G|A2 A3/2 A/2|A B c d|c A G E|D2 D2',
    bass: 'D,4|D,4|C,,4|C,4|D,,4-|D,,2 F, D,|A,, C, E, C,|D,2 D,2|D,,4|D,,4|C,,4|C,,4|D,,4-|D,,2 F, D,|A,, C, E, C,|D,2 D,,2' },
  { id: 'shenandoah', name: '雪蘭多亞', en: 'Shenandoah', src: 'Terry, The Shanty Book I (1921) No.9, pp.20–21', M: '4/4', K: 'Eb', Q: 50,
    mel: 'B,2|E E E3 F G A|[M:3/4] c B3 e d|c3 B c B|G B3 B2|[M:4/4] c c c3 G B G|[M:3/4] F E3 F2|G3 E G3/2 c/2|B6|E3/2 F/2 G3 F|F2 E2',
    bass: 'B,,2|E,,2 E,6|[M:3/4] E,,2 E,4|E,6|E,6|[M:4/4] A,,4 B,,4|[M:3/4] C,6|B,,,6|B,,,6|C,4 A,,2|B,,2 E,,2' },
  { id: 'blowtheman', name: '把那傢伙吹倒', en: 'Blow the Man Down', src: 'Terry, The Shanty Book I (1921) No.16, pp.34–35', M: '6/8', K: 'Eb', Q: 132,
    mel: 'E G|B3/2 c/2 B G E G|B c B G E G|B3 c3|A3/2 G/2 A F2 G|A3/2 G/2 A F D F|A G F c2 e|B/2 B3/2 B B2 A|G3/2 F/2 G E',
    bass: 'z3/2 E,,/2|E,5/2 E,,/2 B,,5/2 E,,/2|E,5/2 E,,/2 B,,5/2 G,,/2-|G,,5/2 C,3 F,,/2|F,5/2 B,,3 F,/2-|F,5/2 B,,3 F,/2-|F,3 E,3|D,3 E,2 C,|B,,3 E,' },
  { id: 'rio', name: '開往里約格蘭德', en: 'Bound for the Rio Grande', src: 'Terry, The Shanty Book I (1921) No.2, pp.4–5', M: '6/8', K: 'Eb', Q: 90,
    mel: 'B,|E E E G G G|F E F E3|B5 G|c B4 B|c e c B A G|A B A G E F|G3/2 A/2 G F E F|E3 E2 F|G3 F E F|E6|B5 G|c B4 B|c e c B A G|A B A G E F|G3/2 A/2 G F E F|E5',
    bass: 'z|E,,3 E,,3|E,,3 E,,3|E,6|E, F,5|A,,3 G,,3|F,,2 B,,, C,,3|B,,,6|E,,3 C,,3|B,,,2 B,,4|E,6|E,6|E,6|A,,3 G,,3|F,2 B,, C,3|B,,,3 B,,,3|E,,3 E,,2' }
];
var ABC_KEYS = { C: 0, G: 1, D: 2, A: 3, E: 4, F: -1, Bb: -2, Eb: -3, Ab: -4 };   // 調 ⇒ 升降記號數（正 ＝ 升）
/** 一行 ABC 子集 ⇒ [[起點拍, 長度拍, MIDI 音高]]（拍 ＝ 四分音符；L ＝ 八分 ⇒ 時值 × 0.5）、總長。認不得的字 ⇒ 丟錯（寫錯的譜不要靜靜地少一個音）。 */
function abcParse(s, K) {
  var sf = ABC_KEYS[K], key = {}, carry = {}, out = [], t = 0, i = 0, tie = null, BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  if (sf === undefined) throw new Error('abcParse：不認得的調 ' + K);
  'FCGDAEB'.split('').forEach(function (c, k) { if (sf > k) key[c] = 1; if (-sf > 6 - k) key[c] = -1; });
  function dur() {                                                     // 時值：n、/、/d、n/d
    var m = /^(\d*)(\/(\d*))?/.exec(s.slice(i)); i += m[0].length;
    var n = m[1] ? +m[1] : 1, d = m[2] ? (m[3] ? +m[3] : 2) : 1; return n / d * 0.5;
  }
  while (i < s.length) {
    var c = s[i];
    if (c === ' ') { i++; continue; }
    if (c === '|') { carry = {}; i++; continue; }
    if (c === '[') { var e = s.indexOf(']', i); if (e < 0) throw new Error('abcParse：[ 沒有收尾'); i = e + 1; continue; }   // [M:3/4] 之類的欄位：只給人讀
    if (c === 'z') { i++; t += dur(); tie = null; continue; }
    var acc = null;
    if (c === '^' || c === '_' || c === '=') { acc = c === '^' ? 1 : c === '_' ? -1 : 0; i++; c = s[i]; }
    var up = c.toUpperCase(); if (!(up in BASE)) throw new Error('abcParse：第 ' + i + ' 個字「' + c + '」不認得');
    var o = c === up ? 0 : 1; i++;
    while (s[i] === "'" || s[i] === ',') { o += s[i] === "'" ? 1 : -1; i++; }
    var k = up + o; if (acc !== null) carry[k] = acc;
    var a = k in carry ? carry[k] : (key[up] || 0), p = 60 + 12 * o + BASE[up] + a, d = dur();
    if (tie && tie[2] === p && Math.abs(tie[0] + tie[1] - t) < 1e-9) tie[1] += d; else out.push(tie = [t, d, p]);
    t += d;
    if (s[i] === '-') i++; else tie = null;
  }
  return { notes: out, len: t };
}
/** 一首 ⇒ 排好的事件（兩聲部合在一起照時間排）：[[拍, 長度拍, 音高, 聲部 0 旋律／1 低音]]、一遍幾拍。快取在 tune.ev。 */
function tuneEvents(tn) {
  if (tn.ev) return tn.ev;
  var m = abcParse(tn.mel, tn.K), b = abcParse(tn.bass, tn.K), ev = [];
  if (Math.abs(m.len - b.len) > 1e-9) throw new Error('樂譜 ' + tn.id + '：旋律 ' + m.len + ' 拍、低音 ' + b.len + ' 拍，長度不一樣');
  m.notes.forEach(function (n) { ev.push([n[0], n[1], n[2], 0]); }); b.notes.forEach(function (n) { ev.push([n[0], n[1], n[2], 1]); });
  ev.sort(function (x, y) { return x[0] - y[0] || x[3] - y[3]; });
  return (tn.ev = { ev: ev, len: m.len });
}
/** 這一首奏幾遍：一遍的秒數 ⇒ 湊到約 BGM_TUNE_S 秒，夾在 2–6。 */
function bgmPasses(tn) { var E = tuneEvents(tn); return clamp(Math.round(BGM_TUNE_S / (E.len * 60 / tn.Q)), 2, 6); }
function bgmRand() { BGM_SEED = (Math.imul(BGM_SEED, 1103515245) + 12345) & 0x7fffffff; return BGM_SEED / 0x7fffffff; }
/** 下一首：設定裡指定的那首 ／ 輪播（洗一輪、新的一輪第一首不跟上一首重複）。 */
function bgmNext(prev) {
  if (SND.tune !== 'shuffle') { for (var k = 0; k < TUNES.length; k++) if (TUNES[k].id === SND.tune) return TUNES[k]; }
  if (!BGM_ORDER.length) {
    BGM_ORDER = TUNES.slice();
    for (var i = BGM_ORDER.length - 1; i > 0; i--) { var j = Math.floor(bgmRand() * (i + 1)), x = BGM_ORDER[i]; BGM_ORDER[i] = BGM_ORDER[j]; BGM_ORDER[j] = x; }
    if (prev && BGM_ORDER[BGM_ORDER.length - 1] === prev && BGM_ORDER.length > 1) BGM_ORDER.unshift(BGM_ORDER.pop());   // 新的一輪第一首不要剛好是上一首
  }
  return BGM_ORDER.pop();
}
/** 一個音：f（Hz）、t（開始，秒）、d（長，秒）、v 聲部。旋律：鋸齒＋低通、0.18 秒後才出來的 5.5 Hz 顫音；低音：兩道 ±4 cent 的方波＋低通。 */
function bgmNote(ac, dest, v, f, t, d) {
  var g = ac.createGain(), lp = ac.createBiquadFilter(), end = t + d, rel = v ? 0.06 : 0.09, peak = v ? 0.11 : 0.16, os = [];
  lp.type = 'lowpass'; lp.Q.value = 0.7; lp.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + (v ? 0.015 : 0.04));
  if (v) { g.gain.linearRampToValueAtTime(peak * 0.7, t + 0.15); g.gain.setValueAtTime(peak * 0.7, Math.max(t + 0.15, end - rel)); }
  else g.gain.setValueAtTime(peak, Math.max(t + 0.04, end - rel));
  g.gain.linearRampToValueAtTime(0.0001, end);
  if (v) {
    lp.frequency.value = Math.min(1800, f * 5);
    [-4, 4].forEach(function (c) { var o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f; o.detune.value = c; o.connect(lp); os.push(o); });
  } else {
    lp.frequency.value = Math.min(4200, f * 7);
    var o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); os.push(o);
    if (d > 0.3) { var lf = ac.createOscillator(), lg = ac.createGain(); lf.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + 0.18); lg.gain.linearRampToValueAtTime(7, t + 0.4); lf.connect(lg); lg.connect(o.detune); lf.start(t); lf.stop(end + 0.02); }
  }
  os.forEach(function (o) { o.start(t); o.stop(end + 0.02); });
}
/** 從 t0（秒）起把一首的 [a, b) 拍排進去；回下一個沒排的事件序號。 */
function bgmSched(ac, dest, tn, t0, k, until) {
  var E = tuneEvents(tn), spb = 60 / tn.Q;
  while (k < E.ev.length && t0 + E.ev[k][0] * spb < until) {
    var e = E.ev[k]; bgmNote(ac, dest, e[3], 440 * Math.pow(2, (e[2] - 69) / 12), t0 + e[0] * spb, Math.max(0.05, e[1] * spb - 0.02)); k++;
  }
  return k;
}
/** 每一格（90_main.js，主選單也跑）：音量線、淡入淡出、往前排程。還沒有聲音 ⇒ 什麼都不做。 */
function bgmFrame() {
  if (!AC || !AC.bgmBus) return;
  var now = AC.currentTime, fight = now - SND_FIGHT < BGM_FIGHT_S;
  var forced = !!(BGM && BGM.forced), want = muted || (SND.mode === 'off' && !forced) || (SND.mode === 'sail' && fight && !forced) ? 0 : SND.bgm * BGM_VOL;
  AC.bgmBus.gain.setTargetAtTime(want, now, muted ? 0.05 : want < AC.bgmBus.gain.value ? BGM_FADE / 3 : 0.4);   // 靜音（M）馬上關；淡出照 BGM_FADE、回來 0.4 秒
  if (SND.mode === 'off' && !forced) { BGM = null; return; }
  if (!BGM) BGM = { tn: bgmNext(null), t0: now + 0.3, k: 0, pass: 0 };
  var E = tuneEvents(BGM.tn), spb = 60 / BGM.tn.Q;
  BGM.k = bgmSched(AC, AC.bgmBus, BGM.tn, BGM.t0, BGM.k, now + BGM_LOOK);
  if (BGM.k >= E.ev.length && now + BGM_LOOK >= BGM.t0 + E.len * spb) {          // 這一遍排完 ⇒ 接下一遍（同一首照拍子接上）或停一下換下一首
    BGM.pass++;
    if (BGM.pass < bgmPasses(BGM.tn)) { BGM.t0 += E.len * spb; BGM.k = 0; }
    else BGM = { tn: bgmNext(BGM.tn), t0: BGM.t0 + E.len * spb + BGM_GAP, k: 0, pass: 0 };
  }
}
/** 試聽（聲音設定頁的 ▶）：從頭放指定的那一首（還沒有聲音就先建，這一下是使用者的點擊）。 */
function bgmPreview(id) {
  initAudio(); if (!AC) return; if (AC.state === 'suspended') AC.resume();
  for (var k = 0; k < TUNES.length; k++) if (TUNES[k].id === id) BGM = { tn: TUNES[k], t0: AC.currentTime + 0.15, k: 0, pass: 0, forced: true };   // ⚠ 前一首已經排進去的那幾個音（最多 BGM_LOOK 秒）照樣會響完
}
/** 音效、環境音兩條線照 SND 設（靜音 ⇒ 0）；BGM 那條在 bgmFrame 淡。 */
function sndApply() {
  if (!AC || !AC.sfxBus) return;
  var now = AC.currentTime; AC.sfxBus.gain.setTargetAtTime(muted ? 0 : SND.sfx, now, 0.05); AC.ambBus.gain.setTargetAtTime(muted ? 0 : SND.amb, now, 0.05);
}
/** 離線錄（__game.bgmRender；src/tests/music_lab.py 量音高、音頭）：o ＝ { id, sec, solo（0 只旋律、1 只低音、省略 ＝ 兩聲部）}；回 Promise<{ id, notes（[秒, 長, 音高, 聲部]）, peak, rmsDb, wav }>。 */
function bgmRender(o) {
  var tn = null; for (var k = 0; k < TUNES.length; k++) if (TUNES[k].id === o.id) tn = TUNES[k];
  if (!tn) return Promise.reject(new Error('沒有這首：' + o.id));
  var E = tuneEvents(tn), spb = 60 / tn.Q, sec = o.sec || E.len * spb + 0.5, sr = 44100, oc = new OfflineAudioContext(2, Math.round(sr * sec), sr), mg = oc.createGain(); mg.gain.value = 1; mg.connect(oc.destination);
  var notes = [];
  E.ev.forEach(function (e) {
    if (o.solo !== undefined && e[3] !== o.solo) return;
    var t = 0.1 + e[0] * spb; if (t >= sec) return;
    bgmNote(oc, mg, e[3], 440 * Math.pow(2, (e[2] - 69) / 12), t, Math.max(0.05, e[1] * spb - 0.02)); notes.push([+t.toFixed(4), +(e[1] * spb).toFixed(4), e[2], e[3]]);
  });
  return oc.startRendering().then(function (buf) { var r = audioWav(buf); r.id = tn.id; r.notes = notes; r.spb = spb; return r; });
}
/** 聲音設定頁＋遊戲內設定面板的「音量」（[data-snd] 滑桿兩處同一組值）：畫出現在的值。 */
function sndShow() {
  [].forEach.call(document.querySelectorAll('[data-snd]'), function (r) { r.value = Math.round(SND[r.dataset.snd] * 100); });
  [].forEach.call(document.querySelectorAll('[data-sndv]'), function (e) { var v = SND[e.dataset.sndv]; e.textContent = v > 0 ? Math.round(v * 100) + '%' : '關'; });
  [].forEach.call(document.querySelectorAll('#bgmModes [data-bm]'), function (b) { b.classList.toggle('on', b.dataset.bm === SND.mode); });
  [].forEach.call(document.querySelectorAll('#bgmTunes [data-bt]'), function (b) { b.classList.toggle('on', b.dataset.bt === SND.tune); });
  var nw = $('bgmNow'); if (nw) { var tn = BGM && BGM.tn; nw.textContent = tn ? '正在放：' + tn.name + '（' + tn.en + '）—— 譜：' + tn.src : '還沒放（按 ▶ 試聽，或開局後照上面的設定放）'; }
}
/** 綁一次（71_input.js 主選單初始化時叫）：滑桿、什麼時候放、選曲、試聽、這一頁回到預設。 */
function sndUI() {
  var tb = $('bgmTunes');
  if (tb && !tb.firstChild) {
    var h = '曲目 <button data-bt="shuffle">輪播</button>';
    TUNES.forEach(function (t) { h += '<button data-bt="' + t.id + '" title="' + t.en + '（' + t.src + '）">' + t.name + '</button><button data-bp="' + t.id + '" title="試聽 ' + t.name + '">▶</button>'; });
    tb.innerHTML = h;
  }
  [].forEach.call(document.querySelectorAll('[data-snd]'), function (r) { r.oninput = function () { SND[r.dataset.snd] = clamp(+r.value / 100, 0, 1); sndApply(); sndShow(); }; });
  [].forEach.call(document.querySelectorAll('#bgmModes [data-bm]'), function (b) { b.onclick = function () { SND.mode = b.dataset.bm; sndShow(); }; });
  [].forEach.call(document.querySelectorAll('#bgmTunes [data-bt]'), function (b) { b.onclick = function () { SND.tune = b.dataset.bt; if (BGM && !BGM.forced && SND.tune !== 'shuffle' && BGM.tn.id !== SND.tune) BGM = null; sndShow(); }; });   // 指定了別首 ⇒ 下一格從那首開始
  [].forEach.call(document.querySelectorAll('#bgmTunes [data-bp]'), function (b) { b.onclick = function () { bgmPreview(b.dataset.bp); sndShow(); }; });
  var rb = $('sndR'); if (rb) rb.onclick = function () { for (var k in SND_DEF) SND[k] = SND_DEF[k]; sndApply(); sndShow(); };
}

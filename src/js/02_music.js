// ───────────────────────── 背景音樂：合成音讀譜播放船歌（TASK-0677） ─────────────────────────
// Tim 2026-10-17：「是否可以用點子合成音來播放樂譜 樂譜可以找看看真實船歌 同時設計一套樂譜系統(讀譜播放 節省空間)」「然後這個做為BGM 要另外增加一個音效 BGM音量設定頁面」。
// 樂譜：ABC 記譜法的子集（一首一個物件，見 TUNES；格式寫在 src/README「背景音樂的樂譜」）—— 一首旋律＋低音約 0.2–0.3 KB（音檔一首要 1–3 MB）。
//   音名 C D E F G A B（C ＝ 中央 C）、小寫高八度，後面 ' 再高、, 再低；^ 升 _ 降 = 還原（照 K 調號；同一小節同一個音名同八度沿用，| 換小節失效）；
//   時值 ＝ 單位長度 L（八分音符）的倍數：無 ＝ 1、2 ＝ 2、/2 ＝ 一半、3/2 ＝ 一個半；z 休止；- 連到下一個同音高（跨小節）；[M:3/4] 中途換拍號（只給人讀，時間照時值算）。
// 曲子只從公有領域的樂譜取（⛔ 不用近代編曲、網路上別人的 ABC 轉譜）：R. R. Terry《The Shanty Book》Part I（Curwen 1921）——
//   旋律照書上的人聲那一行、低音取鋼琴左手最低音；從 Project Gutenberg #20774 附的 MIDI 量化到十六分，再逐小節對過書頁的譜面（讀數在 TASK-0677）。
// 播放：WebAudio（02_audio.js 的 AC）；旋律 ＝ 鋸齒波＋低通＋晚到的顫音（像提琴），低音 ＝ 兩道微走音的方波＋低通（像手風琴）。往前排 BGM_LOOK 秒，不吃主迴圈。
//   每首反覆到約 BGM_TUNE_S 秒（bgmPasses）、停 BGM_GAP 秒換下一首（輪播照自己的 LCG 洗牌）。
// 船的主題曲（TASK-0681）：操控的船（SHIPS[PLAYER_I]）有 theme ⇒ 放 THEMES 那首、重複放；改操控換到沒有的 ⇒ 回輪播／指定曲。樂器表 INSTR（提琴、手風琴、音樂盒、管風琴），
//   整份 ABC（和弦、L:1/4、小調、!p! !rit!、[I:樂器]）見 abcTune；音樂盒、管風琴送一點殘響（bgmOut）。
// 純聲音：⛔ 不抽 rnd()、不用 Math.random ⇒ 戰局的亂數一位元都不動；靜音（M）⇒ 三條音量線一起 0、排程照跑。
var SND = { sfx: 1, amb: 1, bgm: 0.5, mode: 'duck', tune: 'shuffle', theme: 1 };   // 音量 0–1；mode：'duck' 交戰時稍微小聲（× BGM_DUCK）／'on' 一直放、不變／'off'；tune：'shuffle' 輪播或曲 id；theme：1 操控的船有主題曲時改放它（TASK-0681）／0 不放
var SND_DEF = JSON.parse(JSON.stringify(SND));
var SND_FIGHT = -1e9, BGM_FIGHT_S = 20, BGM_FADE = 2.5, BGM_DUCK = 0.7;   // BGM_DUCK：交戰時剩幾成（Tim 2026-10-17「其實不用開炮淡出」「或不要完全淡出」「可以稍微變小一點點」⇒ 0.7 ≈ −3 dB，⛔ 不歸零）
//   開砲、爆炸（02_audio.js sfx boom／blast）之後 BGM_FIGHT_S 秒內算交戰 ⇒ 'duck' 模式小聲一點（時間常數 BGM_FADE 秒）
var BGM_LOOK = 0.8, BGM_TUNE_S = 60, BGM_GAP = 4, BGM_VOL = 0.5, BGM_SWAP = 0.4;          // 每首反覆到約 BGM_TUNE_S 秒（2–6 遍：一遍 11 秒的跟一遍 38 秒的都差不多一分鐘）        // BGM_VOL：音樂整條的基準（量過才定，見 TASK-0677）
var BGM = null, BGM_SEED = 7654321, BGM_ORDER = [];                    // BGM：{ tn 正在放的那首, t0 這一遍從幾秒開始, k 下一個沒排的事件, pass 第幾遍, forced 試聽鈕點的（交戰時不變小、播完回輪播） }
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
// 船的主題曲（TASK-0681；Tim 2026-10-17「船隻的主題曲 當操作船隻有主題曲時背景音樂改播放主題曲」）：game.json ships[].theme ＝ 這裡的 id（admin.py 匯入時對過）。
//   abc ＝ 整份 ABC（一行一個字串：檔頭 M／L／Q／K／V、% 註解、[V:1] 開頭的聲部行）—— 寫法見 src/README「背景音樂的樂譜」；樂器用 [I:樂器] 在聲部裡換（INSTR）。
var THEMES = [
  { id: 'stormkaap', name: '風暴角號主題曲', en: 'Stormkaap', src: 'Tim 提供（2026-10-17，TASK-0681；前段音樂盒、後段管風琴）',
    abc: ['M:3/4', 'L:1/4', 'Q:1/4=84', 'K:Dm', 'V:1 clef=treble', 'V:2 clef=bass',
      '% --- Part 1: Music Box ---',
      '[V:1] [I:musicbox] d2 A | F G A | d2 A | F E F | d2 A | F G A | B A G | F E2 | D3 |',
      '[V:2] [I:musicbox] D,,3 | z3    | D,,3 | A,,3  | D,,3 | G,,3  | B,,3  | A,,3  | D,,3 |',
      '% --- Part 2: Waltz（管風琴；最後一小節漸慢、弱奏：Tim 先給的那份寫的）---',
      "[V:1] [I:organ] A d e | f2 e/2d/2 | ^c3 | A ^c d | e2 d | d3 | f g a | d'2 c'/2b/2 | b a g | f3 | e f g | ^c3 | !p! !rit! d3 |]",
      '[V:2] [I:organ] D, [F,A,] [F,A,] | D, [F,A,] [F,A,] | A,, [E,G,] [E,G,] | A,, [E,G,] [E,G,] | A,, [E,G,] [E,G,] | D, [F,A,] [F,A,] | F, [A,C] [A,C] | B,, [D,F,] [D,F,] | G,, [D,G,] [D,G,] | D, [F,A,] [F,A,] | G,, [D,G,] [D,G,] | A,, [E,A,] [E,A,] | !p! !rit! [D,F,A,D]3 |]'] }
];
var ABC_KEYS = { C: 0, G: 1, D: 2, A: 3, E: 4, F: -1, Bb: -2, Eb: -3, Ab: -4,   // 調 ⇒ 升降記號數（正 ＝ 升）；小調照關係大調
  Am: 0, Em: 1, Bm: 2, 'F#m': 3, Dm: -1, Gm: -2, Cm: -3, Fm: -4 };
var ABC_DYN = { pp: 0.4, p: 0.6, mp: 0.8, mf: 1, f: 1.2 };            // !p! 之類的力度記號：從那個音起、那個聲部的音量倍數
var BGM_RIT = 0.6;                                                     // !rit!：從那個音到那一小節結束，速度線性慢到原本的幾成
/** 一行 ABC 子集 ⇒ { notes: [[起點拍, 長度拍, MIDI 音高, 樂器（null ＝ 照聲部）, 力度]], len 總長, rits [[起, 迄]] }（拍 ＝ 四分音符）。認不得的字 ⇒ 丟錯（寫錯的譜不要靜靜地少一個音）。
 *  U ＝ 單位長度幾拍（L:1/8 ⇒ 0.5，四首船歌；L:1/4 ⇒ 1）；bar ＝ 一小節幾拍（給了 ⇒ 每一小節都要剛好，對不上 ⇒ 丟錯、說第幾小節）。 */
function abcParse(s, K, U, bar) {
  var sf = ABC_KEYS[K], key = {}, carry = {}, out = [], t = 0, i = 0, ties = [], inst = null, vel = 1, rits = [], rit = null, b0 = 0, nb = 0, BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  if (sf === undefined) throw new Error('abcParse：不認得的調 ' + K);
  U = U || 0.5;
  'FCGDAEB'.split('').forEach(function (c, k) { if (sf > k) key[c] = 1; if (-sf > 6 - k) key[c] = -1; });
  function dur() {                                                     // 時值：n、/、/d、n/d（幾個單位）
    var m = /^(\d*)(\/(\d*))?/.exec(s.slice(i)); i += m[0].length;
    var n = m[1] ? +m[1] : 1, d = m[2] ? (m[3] ? +m[3] : 2) : 1; return n / d;
  }
  function pitch() {                                                   // ^_= 音名 ',
    var c = s[i], acc = null;
    if (c === '^' || c === '_' || c === '=') { acc = c === '^' ? 1 : c === '_' ? -1 : 0; i++; c = s[i]; }
    var up = (c || '').toUpperCase(); if (!(up in BASE)) throw new Error('abcParse：第 ' + i + ' 個字「' + c + '」不認得');
    var o = c === up ? 0 : 1; i++;
    while (s[i] === "'" || s[i] === ',') { o += s[i] === "'" ? 1 : -1; i++; }
    var k = up + o; if (acc !== null) carry[k] = acc;
    return 60 + 12 * o + BASE[up] + (k in carry ? carry[k] : (key[up] || 0));
  }
  function put(p, d) {                                                 // 一個音（連音線接上前一個同音高、剛好在這裡結束的那個）
    for (var q = 0; q < ties.length; q++) if (ties[q][2] === p && Math.abs(ties[q][0] + ties[q][1] - t) < 1e-9) { ties[q][1] += d; return ties[q]; }
    var n = [t, d, p, inst, vel]; out.push(n); return n;
  }
  function barEnd() {
    carry = {}; nb++;
    if (rit) { rit[1] = t; rits.push(rit); rit = null; }
    if (bar && Math.abs(t - b0 - bar) > 1e-9) throw new Error('abcParse：第 ' + nb + ' 小節 ' + (t - b0) + ' 拍（拍號是 ' + bar + ' 拍）');
    b0 = t;
  }
  while (i < s.length) {
    var c = s[i];
    if (c === ' ') { i++; continue; }
    if (c === '|') { barEnd(); i++; if (s[i] === ']' || s[i] === '|') i++; continue; }   // | 、|| 、|]
    if (c === '!') {                                                   // !p! !rit! 之類的記號
      var e = s.indexOf('!', i + 1); if (e < 0) throw new Error('abcParse：! 沒有收尾');
      var dn = s.slice(i + 1, e); i = e + 1;
      if (dn === 'rit') rit = [t, null]; else if (dn in ABC_DYN) vel = ABC_DYN[dn]; else throw new Error('abcParse：不認得的記號 !' + dn + '!');
      continue;
    }
    if (c === '[' && /^\[[A-Za-z]:/.test(s.slice(i, i + 3))) {         // 欄位：[M:3/4] 只給人讀、[I:樂器] 換樂器
      var e2 = s.indexOf(']', i); if (e2 < 0) throw new Error('abcParse：[ 沒有收尾');
      var fd = s.slice(i + 1, e2); i = e2 + 1;
      if (fd[0] === 'I') { inst = fd.slice(2).trim(); if (!INSTR[inst]) throw new Error('abcParse：沒有這種樂器 ' + inst + '（' + Object.keys(INSTR).join('、') + '）'); }
      else if (fd[0] !== 'M') throw new Error('abcParse：不認得的欄位 [' + fd + ']');
      continue;
    }
    if (c === 'z') { i++; t += dur() * U; ties = []; continue; }
    var made = [], adv;
    if (c === '[') {                                                   // 和弦 [A,CE]2：裡面每個音一起起，長度 ＝ 自己的 × 外面的；前進照第一個音
      i++; var ch = [];
      while (s[i] !== ']') { if (i >= s.length) throw new Error('abcParse：和弦沒有收尾'); if (s[i] === ' ') { i++; continue; } var pp = pitch(); ch.push([pp, dur()]); }
      i++; var mul = dur();
      if (!ch.length) throw new Error('abcParse：空的和弦');
      ch.forEach(function (q) { made.push(put(q[0], q[1] * mul * U)); }); adv = ch[0][1] * mul * U;
    } else { var p1 = pitch(), d1 = dur() * U; made.push(put(p1, d1)); adv = d1; }
    t += adv;
    if (s[i] === '-') { i++; ties = made; } else ties = [];
  }
  if (rit) { rit[1] = t; rits.push(rit); }
  return { notes: out, len: t, rits: rits };
}
/** 整份 ABC（THEMES 的 abc：一行一個字串）⇒ 每個聲部一份 abcParse 的結果（照 V: 出現的順序；第一個 ＝ 旋律）；Q 照檔頭寫回 tn.Q（每分鐘幾個四分音符）。 */
function abcTune(tn) {
  var H = { L: '1/8', K: 'C', M: '', Q: '' }, V = {}, order = [], cur = null;
  function voice(id) { if (!(id in V)) { V[id] = ''; order.push(id); } cur = id; }
  tn.abc.forEach(function (ln) {
    ln = ln.replace(/%.*$/, '').trim(); if (!ln) return;
    var h = /^([A-Za-z]):\s*(.*)$/.exec(ln), m = /^\[V:\s*([^\]\s]+)\]\s*(.*)$/.exec(ln);
    if (h) { if (h[1] === 'V') voice(h[2].split(/\s+/)[0]); else H[h[1]] = h[2].trim(); return; }
    if (m) { voice(m[1]); ln = m[2]; } else if (cur === null) voice('1');
    V[cur] += ' ' + ln;
  });
  function frac(x, what) { var m = /^(\d+)\/(\d+)$/.exec(x); if (!m) throw new Error('樂譜 ' + tn.id + '：' + what + ' 要寫成 a/b（' + x + '）'); return 4 * m[1] / m[2]; }
  var U = frac(H.L, 'L:'), bar = H.M ? frac(H.M, 'M:') : 0, q = /^(?:(\d+\/\d+)=)?(\d+(?:\.\d+)?)$/.exec(H.Q);
  if (!q) throw new Error('樂譜 ' + tn.id + '：Q: 要寫成 1/4=84（' + H.Q + '）');
  tn.Q = +q[2] * (q[1] ? frac(q[1], 'Q:') : 1);
  if (!order.length) throw new Error('樂譜 ' + tn.id + '：沒有音符');
  return order.map(function (id) { return abcParse(V[id], H.K, U, bar); });
}
/** 拍 ⇒ 拉長後的拍（!rit! 那幾段：速度從 1 線性慢到 BGM_RIT ⇒ ∫ 1／速度）。 */
function bgmWarp(rits, x) {
  var y = x, k = 1 - BGM_RIT;
  rits.forEach(function (r) { var L = r[1] - r[0], u = Math.min(x, r[1]) - r[0]; if (u > 0 && L > 0) y += -L / k * Math.log(1 - k * u / L) - u; });
  return y;
}
var BGM_INST = ['fiddle', 'accordion'];                                // 沒寫 [I:] 的聲部：第一個（旋律）提琴、其他手風琴（四首船歌就是這樣）
/** 一首 ⇒ 排好的事件（各聲部合在一起照時間排）：[[拍, 長度拍, 音高, 聲部 0 旋律／1… 伴奏, 樂器, 力度]]、一遍幾拍。快取在 tune.ev。 */
function tuneEvents(tn) {
  if (tn.ev) return tn.ev;
  var P = tn.abc ? abcTune(tn) : [abcParse(tn.mel, tn.K), abcParse(tn.bass, tn.K)], ev = [], rits = [], seen = {};
  P.forEach(function (v, k) { if (Math.abs(v.len - P[0].len) > 1e-9) throw new Error('樂譜 ' + tn.id + '：第 1 聲部 ' + P[0].len + ' 拍、第 ' + (k + 1) + ' 聲部 ' + v.len + ' 拍，長度不一樣'); });
  P.forEach(function (v, k) { v.notes.forEach(function (n) { ev.push([n[0], n[1], n[2], k, n[3] || BGM_INST[Math.min(k, 1)], n[4]]); }); });
  ev.sort(function (x, y) { return x[0] - y[0] || x[3] - y[3]; });
  P.forEach(function (v) { v.rits.forEach(function (r) { if (!seen[r]) { seen[r] = 1; rits.push(r); } }); });   // 兩個聲部同一段 !rit! 只算一次
  rits.sort(function (a, b) { return a[0] - b[0]; });
  rits.forEach(function (r, k) { if (k && r[0] < rits[k - 1][1]) throw new Error('樂譜 ' + tn.id + '：兩段 !rit! 疊在一起（' + rits[k - 1] + '／' + r + '）'); });
  var len = P[0].len;
  if (rits.length) { ev.forEach(function (e) { var a = bgmWarp(rits, e[0]); e[1] = bgmWarp(rits, e[0] + e[1]) - a; e[0] = a; }); len = bgmWarp(rits, len); }
  return (tn.ev = { ev: ev, len: len });
}
/** 這一首奏幾遍：一遍的秒數 ⇒ 湊到約 BGM_TUNE_S 秒，夾在 2–6。 */
function bgmPasses(tn) { var E = tuneEvents(tn); return clamp(Math.round(BGM_TUNE_S / (E.len * 60 / tn.Q)), 2, 6); }
function bgmRand() { BGM_SEED = (Math.imul(BGM_SEED, 1103515245) + 12345) & 0x7fffffff; return BGM_SEED / 0x7fffffff; }
/** 一首（TUNES 或 THEMES）照 id 找；沒有 ⇒ null。 */
function tuneById(id) { var L = TUNES.concat(THEMES); for (var k = 0; k < L.length; k++) if (L[k].id === id) return L[k]; return null; }
/** 現在該放的主題曲：設定開著、在戰局裡（RUNNING）、我操控的那艘（SHIPS[PLAYER_I]）的船型有 theme（game.json ships[].theme）⇒ 那首；否則 null。 */
function bgmTheme() {
  var sh = SND.theme && RUNNING ? SHIPS[PLAYER_I] : null, h = sh && sh.T ? hullInfo(sh.T.id) : null;
  return h && h.theme ? tuneById(h.theme) : null;
}
/** 下一首：操控的船的主題曲 ／ 設定裡指定的那首 ／ 輪播（洗一輪、新的一輪第一首不跟上一首重複）。 */
function bgmNext(prev) {
  var th = bgmTheme(); if (th) return th;
  if (SND.tune !== 'shuffle') { for (var k = 0; k < TUNES.length; k++) if (TUNES[k].id === SND.tune) return TUNES[k]; }
  if (!BGM_ORDER.length) {
    BGM_ORDER = TUNES.slice();
    for (var i = BGM_ORDER.length - 1; i > 0; i--) { var j = Math.floor(bgmRand() * (i + 1)), x = BGM_ORDER[i]; BGM_ORDER[i] = BGM_ORDER[j]; BGM_ORDER[j] = x; }
    if (prev && BGM_ORDER[BGM_ORDER.length - 1] === prev && BGM_ORDER.length > 1) BGM_ORDER.unshift(BGM_ORDER.pop());   // 新的一輪第一首不要剛好是上一首
  }
  return BGM_ORDER.pop();
}
/** 樂器（TASK-0681；Tim 2026-10-17「可能要擴充音樂合成系統 可以支援不同樂器」）：note(ac, dest, f 頻率, t 開始秒, d 長秒, vel 力度)；rev ＝ 送進殘響的份量（0 ⇒ 不接殘響）。
 *  fiddle、accordion ＝ TASK-0677 那兩個聲部原封不動搬過來（四首船歌重構前後離線錄音逐樣本相同，讀數在 TASK-0681）。 */
var INSTR = {
  fiddle: { name: '提琴', rev: 0, note: function (ac, dest, f, t, d, vel) {      // 鋸齒波＋低通、0.18 秒後才出來的 5.5 Hz 顫音
    var g = ac.createGain(), lp = ac.createBiquadFilter(), end = t + d, rel = 0.09, peak = 0.16 * vel;
    lp.type = 'lowpass'; lp.Q.value = 0.7; lp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.04);
    g.gain.setValueAtTime(peak, Math.max(t + 0.04, end - rel));
    g.gain.linearRampToValueAtTime(0.0001, end);
    lp.frequency.value = Math.min(4200, f * 7);
    var o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp);
    if (d > 0.3) { var lf = ac.createOscillator(), lg = ac.createGain(); lf.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + 0.18); lg.gain.linearRampToValueAtTime(7, t + 0.4); lf.connect(lg); lg.connect(o.detune); lf.start(t); lf.stop(end + 0.02); }
    o.start(t); o.stop(end + 0.02);
  } },
  accordion: { name: '手風琴', rev: 0, note: function (ac, dest, f, t, d, vel) {   // 兩道 ±4 cent 的方波＋低通
    var g = ac.createGain(), lp = ac.createBiquadFilter(), end = t + d, rel = 0.06, peak = 0.11 * vel;
    lp.type = 'lowpass'; lp.Q.value = 0.7; lp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.015);
    g.gain.linearRampToValueAtTime(peak * 0.7, t + 0.15); g.gain.setValueAtTime(peak * 0.7, Math.max(t + 0.15, end - rel));
    g.gain.linearRampToValueAtTime(0.0001, end);
    lp.frequency.value = Math.min(1800, f * 5);
    [-4, 4].forEach(function (c) { var o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f; o.detune.value = c; o.connect(lp); o.start(t); o.stop(end + 0.02); });
  } },
  musicbox: { name: '音樂盒', rev: 0.35, note: function (ac, dest, f, t, d, vel) {   // 簧片被撥一下：敲下去就開始衰減、不持續（譜上的長度只決定下一個什麼時候敲）；低的音響得久
    var ring = clamp(2.6 - 0.8 * Math.log2(f / 262), 0.7, 3.2), peak = 0.25 * vel;
    [[1, 1, ring], [2, 0.12, ring * 0.35], [6.27, 0.22, 0.05]].forEach(function (q) {   // 基音、八度、懸臂簧片的第二模態（≈ 6.27 倍，敲下去那一下的「叮」，很快就暗）
      if (f * q[0] > 16000) return;
      var o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f * q[0]; o.connect(g); g.connect(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak * q[1], t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.004, q[2] / 6.9 * 2);   // 時間常數：ring 秒衰到約 −30 dB
      o.start(t); o.stop(t + 0.004 + q[2] * 2 + 0.05);
    });
  } },
  organ: { name: '管風琴', rev: 0.45, note: function (ac, dest, f, t, d, vel) {     // 音栓疊起來的正弦：8'、8' 走音 +6 cent（celeste，慢慢的拍頻）、4'、2 2/3'（十二度，空空的鬼味）、2'；起音 50 ms、放開 150 ms；4.8 Hz 的顫音器
    var g = ac.createGain(), tg = ac.createGain(), end = t + d, peak = 0.06 * vel, a = 0.05, rel = 0.15;
    tg.connect(g); g.connect(dest); tg.gain.value = 1;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, Math.max(t + a, end)); g.gain.linearRampToValueAtTime(0.0001, Math.max(t + a, end) + rel);
    var lf = ac.createOscillator(), lg = ac.createGain(); lf.frequency.value = 4.8; lg.gain.value = 0.07; lf.connect(lg); lg.connect(tg.gain); lf.start(t); lf.stop(Math.max(t + a, end) + rel + 0.02);
    [[1, 1, 0], [1, 0.6, 6], [2, 0.5, 0], [3, 0.28, 0], [4, 0.2, 0]].forEach(function (q) {
      if (f * q[0] > 16000) return;
      var o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = f * q[0]; o.detune.value = q[2]; og.gain.value = q[1]; o.connect(og); og.connect(tg);
      o.start(t); o.stop(Math.max(t + a, end) + rel + 0.02);
    });
  } }
};
var BGM_REV_S = 2.6;                                                   // 殘響的長度（秒；衰到 −60 dB）
/** 樂器的出口：rev ＝ 0 ⇒ 直接 dest；否則一個節點 ⇒ dest（乾）＋ 送 rev 份到殘響（每個 dest 一份卷積，衝激響應用自己的 LCG 生 ⇒ ⛔ 不用 Math.random）。快取在 dest 上。 */
function bgmOut(ac, dest, inst) {
  var I = INSTR[inst]; if (!I.rev) return dest;
  var R = dest.__rev || (dest.__rev = { cv: null, ins: {} });
  if (!R.cv) {
    var sr = ac.sampleRate, n = Math.round(sr * BGM_REV_S), b = ac.createBuffer(2, n, sr), s = 13579, tau = BGM_REV_S / 6.9;
    for (var c = 0; c < 2; c++) { var x = b.getChannelData(c); for (var i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; x[i] = (s / 0x40000000 - 1) * Math.exp(-i / sr / tau); } }
    R.cv = ac.createConvolver(); R.cv.normalize = true; R.cv.buffer = b; R.cv.connect(dest);
  }
  if (!R.ins[inst]) { var n0 = ac.createGain(), sg = ac.createGain(); sg.gain.value = I.rev; n0.connect(dest); n0.connect(sg); sg.connect(R.cv); R.ins[inst] = n0; }
  return R.ins[inst];
}
/** 一個音：inst 樂器（INSTR）、f（Hz）、t（開始，秒）、d（長，秒）、vel 力度。 */
function bgmNote(ac, dest, inst, f, t, d, vel) { INSTR[inst].note(ac, bgmOut(ac, dest, inst), f, t, d, vel); }
/** 從 t0（秒）起把一首的 [a, b) 拍排進去；回下一個沒排的事件序號。 */
function bgmSched(ac, dest, tn, t0, k, until) {
  var E = tuneEvents(tn), spb = 60 / tn.Q;
  while (k < E.ev.length && t0 + E.ev[k][0] * spb < until) {
    var e = E.ev[k]; bgmNote(ac, dest, e[4], 440 * Math.pow(2, (e[2] - 69) / 12), t0 + e[0] * spb, Math.max(0.05, e[1] * spb - 0.02), e[5]); k++;
  }
  return k;
}
/** 每一格（90_main.js，主選單也跑）：音量線、淡入淡出、往前排程。還沒有聲音 ⇒ 什麼都不做。 */
function bgmFrame() {
  if (!AC || !AC.bgmBus) return;
  var now = AC.currentTime, fight = now - SND_FIGHT < BGM_FIGHT_S;
  var forced = !!(BGM && BGM.forced), want = muted || (SND.mode === 'off' && !forced) ? 0 : SND.bgm * BGM_VOL * (SND.mode === 'duck' && fight && !forced ? BGM_DUCK : 1);
  AC.bgmBus.gain.setTargetAtTime(want, now, muted ? 0.05 : want < AC.bgmBus.gain.value ? BGM_FADE / 3 : 0.8);   // 靜音（M）馬上關；交戰變小照 BGM_FADE、回來 0.8 秒
  if (SND.mode === 'off' && !forced) { BGM = null; return; }
  if (!BGM) BGM = { tn: bgmNext(null), t0: now + 0.3, k: 0, pass: 0 };
  else if (!BGM.forced) {                                                         // 換曲（TASK-0681）：開局、改操控、回主選單 ⇒ 該放的主題曲變了 ⇒ 排完已經排進去的那一段（BGM_LOOK）就換
    var th = bgmTheme();
    if (th ? BGM.tn !== th : !!BGM.tn.abc) BGM = { tn: th || bgmNext(BGM.tn), t0: Math.max(now + BGM_LOOK, BGM.t0) + BGM_SWAP, k: 0, pass: 0 };
  }
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
  var tn = tuneById(id); if (tn) BGM = { tn: tn, t0: AC.currentTime + 0.15, k: 0, pass: 0, forced: true };   // ⚠ 前一首已經排進去的那幾個音（最多 BGM_LOOK 秒）照樣會響完
}
/** 音效、環境音兩條線照 SND 設（靜音 ⇒ 0）；BGM 那條在 bgmFrame 淡。 */
function sndApply() {
  if (!AC || !AC.sfxBus) return;
  var now = AC.currentTime; AC.sfxBus.gain.setTargetAtTime(muted ? 0 : SND.sfx, now, 0.05); AC.ambBus.gain.setTargetAtTime(muted ? 0 : SND.amb, now, 0.05);
}
/** 離線錄（__game.bgmRender；src/tests/music_lab.py 量音高、音頭）：o ＝ { id（TUNES 或 THEMES）或 abc（臨時一份）, sec, solo（0 只旋律、1 只低音、省略 ＝ 全部聲部）, from（從第幾秒錄起，省略 ＝ 0）}；回 Promise<{ id, notes（[秒, 長, 音高, 聲部, 樂器]）, peak, rmsDb, wav }>。 */
function bgmRender(o) {
  var tn = o.abc ? { id: 'adhoc', abc: o.abc } : tuneById(o.id);   // o.abc：臨時的一份整份 ABC（量樂器用，不進 THEMES）
  if (!tn) return Promise.reject(new Error('沒有這首：' + o.id));
  var E = tuneEvents(tn), spb = 60 / tn.Q, sec = o.sec || E.len * spb + (tn.abc ? 3 : 0.5), sr = 44100, oc = new OfflineAudioContext(2, Math.round(sr * sec), sr), mg = oc.createGain(); mg.gain.value = 1; mg.connect(oc.destination);
  var notes = [];
  E.ev.forEach(function (e) {
    if (o.solo !== undefined && e[3] !== o.solo) return;
    var t = 0.1 + e[0] * spb - (o.from || 0); if (t >= sec || t < 0.1) return;
    bgmNote(oc, mg, e[4], 440 * Math.pow(2, (e[2] - 69) / 12), t, Math.max(0.05, e[1] * spb - 0.02), e[5]); notes.push([+t.toFixed(4), +(e[1] * spb).toFixed(4), e[2], e[3], e[4]]);
  });
  return oc.startRendering().then(function (buf) { var r = audioWav(buf); r.id = tn.id; r.notes = notes; r.spb = spb; return r; });
}
/** 聲音設定頁＋遊戲內設定面板的「音量」（[data-snd] 滑桿兩處同一組值）：畫出現在的值。 */
function sndShow() {
  [].forEach.call(document.querySelectorAll('[data-snd]'), function (r) { r.value = Math.round(SND[r.dataset.snd] * 100); });
  [].forEach.call(document.querySelectorAll('[data-sndv]'), function (e) { var v = SND[e.dataset.sndv]; e.textContent = v > 0 ? Math.round(v * 100) + '%' : '關'; });
  [].forEach.call(document.querySelectorAll('#bgmModes [data-bm]'), function (b) { b.classList.toggle('on', b.dataset.bm === SND.mode); });
  [].forEach.call(document.querySelectorAll('#bgmTunes [data-bt]'), function (b) { b.classList.toggle('on', b.dataset.bt === SND.tune); });
  [].forEach.call(document.querySelectorAll('#bgmThemes [data-bth]'), function (b) { b.classList.toggle('on', +b.dataset.bth === SND.theme); });
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
  var tt = $('bgmThemes');
  if (tt && !tt.firstChild) {                                          // 船的主題曲（TASK-0681）：放不放＋每首的試聽
    var h2 = '船的主題曲 <button data-bth="1">操控的船有主題曲時改放它</button><button data-bth="0">不放（照上面的曲目）</button>';
    THEMES.forEach(function (t) { h2 += '<button data-bp="' + t.id + '" title="試聽 ' + t.name + '（' + t.src + '）">▶ ' + t.name + '</button>'; });
    tt.innerHTML = h2;
  }
  [].forEach.call(document.querySelectorAll('[data-snd]'), function (r) { r.oninput = function () { SND[r.dataset.snd] = clamp(+r.value / 100, 0, 1); sndApply(); sndShow(); }; });
  [].forEach.call(document.querySelectorAll('#bgmModes [data-bm]'), function (b) { b.onclick = function () { SND.mode = b.dataset.bm; sndShow(); }; });
  [].forEach.call(document.querySelectorAll('#bgmTunes [data-bt]'), function (b) { b.onclick = function () { SND.tune = b.dataset.bt; if (BGM && !BGM.forced && SND.tune !== 'shuffle' && BGM.tn.id !== SND.tune) BGM = null; sndShow(); }; });   // 指定了別首 ⇒ 下一格從那首開始
  [].forEach.call(document.querySelectorAll('#bgmTunes [data-bp], #bgmThemes [data-bp]'), function (b) { b.onclick = function () { bgmPreview(b.dataset.bp); sndShow(); }; });
  [].forEach.call(document.querySelectorAll('#bgmThemes [data-bth]'), function (b) { b.onclick = function () { SND.theme = +b.dataset.bth; sndShow(); }; });
  var rb = $('sndR'); if (rb) rb.onclick = function () { for (var k in SND_DEF) SND[k] = SND_DEF[k]; sndApply(); sndShow(); };
}

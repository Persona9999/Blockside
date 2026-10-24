// ───────────────────────── 城鎮居民（TASK-0846、0849；只給人看） ─────────────────────────
// Tim 2026-10-23：「參考這個畫風 以及Blockside的水手顯示架構(頭髮 衣服部分區域 可換色) 讓目前Blocksail的城鎮可以顯示居民在路上走動吧 … 然後居民素材只放在Blocksail(參考城鎮建築)」
//   「把鎮民相關機制獨立成一份.js 然後整理一下相關邏輯(鎮民單純是顯示用 不用完整模擬)」
// 只給人看：不碰模擬亂數 rnd()、模擬地形 C.h；位置只照畫面時間算（townFolkAt），不逐格推進 ⇒ 同一個時間點畫面相同，掉幀、暫停、離開又回來都不會走偏。
// 效能（Tim 2026-10-23「鎮民只在攝影機附近出現 且畫面外的不模擬」）：只畫鏡頭 TOWN_FOLK_OUT 以內（跟城鎮近景那一級對齊）；
//   每位的整條路線先算好外框（a.bb）⇒ 外框離鏡頭太遠、或整個在視錐外 ⇒ 連位置都不算；城整座太遠 ⇒ 連路網都不建。
// 素材：Blocksail world/townkit/_folk.js（tools/townfolk.py 產生：一列一位 96×192 PNG-8，繪製時預留鮮青色頭髮＋鮮洋紅主衣標記，轉成水手同款 (L, 0, L) 與 (0, L, L)）
//   ＋ 鎮民設定檔 _people.js（誰、幾歲、做什麼、多高、換什麼色；見下面「素材與鎮民設定檔」）—— 跟著城鎮用到的模型一起向 Blocksail 索取（63_towns.js townKit ⇐ townFolkNeed），
//   立繪載入時走 41_crew_art.js 的 crewArt(im) 展開成「左半底圖｜右半遮罩」貼圖。
// 路網：每座城把 T.roads（扣掉門口短接線 link-door 與水面下的段）在交叉口切開、端點 2 m 內併成節點 ⇒ 路網圖；照總路長每 TOWN_FOLK_STEP 公尺一位（上限 TOWN_FOLK_MAX）。
// 路線：每位居民第一次算路網時就照 townHash 走好一條固定的路線（起點那條邊 ＋ 最多 TOWN_FOLK_HOPS 段、路口不折返、偶爾在路口停步），
//   之後沿路線走過去、停一下、原路走回來，一直來回 ⇒ 一圈的時間表（legs）排好，畫的時候照時間二分查到那一段。角色列、衣服色、髮色、步速、車道偏移也照 townHash。
// 接進 63_towns.js 的地方：townKit／townKitMake（townFolkNeed、townFolkTex）、townKitGpuFree（townFolkFree）、townProgs（著色器 folk、townFolkGl）、
//   townDraw 布旗之後（townFolkDraw）、townReplace（路沒改 ⇒ 沿用 T.folk）、townStat（townFolkStat、townFolkSum、'street'、'work'）。
// 建築裡的工人（TASK-0904）：同一支著色器、同一份實例陣列，站在模型的 work-* 固定點上（見下面「建築裡的工人」）。
var TOWN_FOLK = Q.get('townfolk') !== '0';                               // ?townfolk=0：不載、不畫城鎮居民（對照組）
var TOWN_FOLK_OUT = [160, 200], TOWN_FOLK_STEP = 14, TOWN_FOLK_MAX = 2000, TOWN_FOLK_HOPS = 8, TOWN_FOLK_SCALE = 1.36;   // SCALE：設定檔的身高（真實的公尺）× 這個 ⇒ 畫面上的身高（Tim 2026-10-23「鎮民尺寸可以放大到1.5倍」：0846 的大人畫成約 1.5 m ⇒ ×1.5 ≈ 2.25 m ≈ 1.65 m × 1.36）；MAX：0846 是 260（金斯敦 34.5 km 的路 ⇒ 133 m 才一位）；畫面外的不算位置 ⇒ 照路長配、上限只防極端

// 看板：四邊形 aQ ∈ [−½, ½] × [0, 1]（P.quad），實例 aI ＝ (x, y, z, 高)、aS ＝ (寬比, 高比, 前傾, 彈跳)、aU ＝ (u0, v0, u1, v1)、aC ＝ (衣色, 髮色, 深淺, 0)
//   衣色、髮色打包成 0xRRGGBB 的整數（float32 到 2^24 都是整數，不失真）—— TASK-0849 每個角色可以覆寫自己的換色 ⇒ 不再用 8 格的色表。
//   底圖與換色遮罩同 41_crew_art.js crewArt（左半底圖、右半遮罩：R ＝ 衣服、G ＝ 頭髮；底圖標記區的灰階 R/G/B ＝ L ∈ [4, 252]，L ＝ 100 還原代表色 ⇒ 乘 2.55）；吃城鎮陰影、夜裡的街燈與霧。
var TOWN_FOLK_VS = '#version 300 es\nlayout(location=0) in vec2 aQ; layout(location=4) in vec4 aI; layout(location=5) in vec4 aS; layout(location=6) in vec4 aU; layout(location=7) in vec4 aC; uniform mat4 uVP; uniform vec3 uEye, uRight; out vec2 vUV; out vec3 vW; out float vD; flat out ivec2 vC; flat out float vK;\n' +
  'void main(){ float h=aI.w*aS.y, w=aI.w*0.5*aS.x, x=aQ.x*w+aQ.y*aS.z*aI.w; vec3 p=aI.xyz+uRight*x+vec3(0.0,aQ.y*h+aS.w,0.0);\n' +
  ' vUV=vec2(mix(aU.x,aU.z,aQ.x+0.5),mix(aU.w,aU.y,aQ.y)); vW=p; vD=length(aI.xz-uEye.xz); vC=ivec2(aC.xy+0.5); vK=aC.z; gl_Position=uVP*vec4(p,1.0); }\n';
var TOWN_FOLK_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + TLAMP_GLSL + TOWN_FADE + 'uniform sampler2D uTex; uniform vec3 uEye, uFog, uBkK; uniform float uFogD; in vec2 vUV; in vec3 vW; in float vD; flat in ivec2 vC; flat in float vK; out vec4 o;\n' +
    'vec3 rgbOf(int v){ return vec3(float((v>>16)&255),float((v>>8)&255),float(v&255))/255.0; }\n' +
    'void main(){ if(vW.y<uClip) discard; if(townCut(vD)) discard; vec4 t=texture(uTex,vUV); if(t.a<0.5) discard; vec4 m=texture(uTex,vUV+vec2(0.5,0.0)); vec3 c=t.rgb;\n' +
    ' c=mix(c,clamp(rgbOf(vC.x)*(t.r*2.55),0.0,1.0),m.r); c=mix(c,clamp(rgbOf(vC.y)*(t.r*2.55),0.0,1.0),m.g);\n' +
    ' float sk=shadowK(vW,vec3(0.0,1.2,0.0)); vec3 lit=(0.58+0.42*(0.45*uSunK+0.55*sk))*uBkK+townLamp(vW,vec3(0.0,1.0,0.0))*0.85;\n' +
    ' vec3 col=c*vK*lit; float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};

// ── 素材與鎮民設定檔 ──
// Blocksail 傳（跟城鎮用到的模型一起要）：_folk_<組>（一組一張立繪＋組裡的列順序 ids，tools/townfolk.py 產生；Tim 2026-10-23「拆多張貼圖 OK」：
//   一張一欄最多 21 位 ⇒ 貼圖高 ≤ 4096，各自的調色盤）、_people（鎮民設定檔，手改：id ＝ <職業>_<f|m>_<兩位數>、name、gender、age（child／adult／elder）、years、job、
//   work（TOWN_CORE.cat 的建築 key）、height（公尺）、sheet（哪一組）、weight（出現的權重）、cloth／cloth_k／hair／hair_k；最上層 child_share ＝ 街上孩子佔幾成；格式見那一份的檔頭）。
//   照 id 接起來 ⇒ F.people[人物號]（人物號 ＝ 索引 folks.sheets 各組接起來的順序；每位帶 sheet ＝ 第幾組、row ＝ 那一張的第幾列）；
//   設定檔裡沒有的、或 Blocksail 還沒有設定檔 ⇒ 預設（大人、1.65 m、預設色表）。舊的索引（folk ＋ 一張 _folk）當成只有一組。
/** 索引 ⇒ 要哪幾組：[{ name, file, ids }]。 */
function townFolkSheets(I) {
  if (I.folks) return I.folks.sheets.map(function (s) { return { name: s.name, file: '_folk_' + s.name, ids: s.ids }; });
  return I.folk ? [{ name: '', file: '_folk', ids: I.folk.names || [] }] : [];
}
/** townKit 跟外面那一頁多要的那幾份（索引有才要；有設定檔才要 _people —— 舊的 Blocksail 沒有，要了會整組失敗）。 */
function townFolkNeed(I) {
  var S = TOWN_FOLK ? townFolkSheets(I) : [];
  return S.length ? S.map(function (s) { return s.file; }).concat((I.folks || I.folk).people ? ['_people'] : []) : [];
}
/** D ＝ townModels 收到的那一組 ⇒ Promise<{ sheets: [{ name, tex, rows }], rows, ch, hpx, people } | null>；reuse ＝ 換一組模型時沿用的那一組（貼圖不重做）。
 *  一張解不開 ⇒ 那一組的 tex 是 null（那幾位不畫，其他組照畫）。 */
function townFolkTex(I, D, reuse) {
  if (reuse && reuse.folk) return Promise.resolve(reuse.folk);
  var S = TOWN_FOLK ? townFolkSheets(I).filter(function (s) { return D && D[s.file] && D[s.file].png; }) : [];
  if (!S.length) return Promise.resolve(null);
  return Promise.all(S.map(function (s) {
    var d = D[s.file];
    return new Promise(function (ok) {
      var im = new Image();
      im.onload = function () { ok({ name: s.name, tex: texFrom(crewArt(im).cv, true), rows: d.rows, ids: d.ids || s.ids, ch: d.ch, hpx: d.hpx }); };
      im.onerror = function () { ok({ name: s.name, tex: null, rows: d.rows, ids: d.ids || s.ids, ch: d.ch, hpx: d.hpx }); };
      im.src = 'data:image/png;base64,' + d.png;
    });
  })).then(function (sheets) {
    var ids = [], at = [];
    sheets.forEach(function (sh, si) { for (var r = 0; r < sh.rows; r++) { ids.push(sh.ids[r] || sh.name + ':' + r); at.push([si, r]); } });
    var people = townFolkPeople(ids, D._people, D[S[0].file], ids.length);
    people.forEach(function (p, i) { p.sheet = at[i][0]; p.row = at[i][1]; });
    var cs = D._people && D._people.child_share;
    return { sheets: sheets, rows: ids.length, ch: sheets[0].ch || 192, hpx: sheets[0].hpx || 164, people: people, childShare: cs >= 0 && cs <= 1 ? cs : null };
  });
}
/** 第幾位路人照哪個人物畫（Tim 2026-10-23「加入出現權重，另外控制兒童比例」）：h、hc ∈ [0, 1) 兩個雜湊 ⇒ 人物號。
 *  設定檔有 child_share ⇒ 先照它決定是孩子（age child）還是其他人（hc），再在那一群裡照 weight 挑（h）；沒有 ⇒ 全部照 weight。某一群是空的 ⇒ 照全部挑。 */
function townFolkPick(F, h, hc) {
  var W = F.pickT;
  if (!W) {
    var tab = function (ok) { var t = { r: [], cum: [], tot: 0 }; F.people.forEach(function (p, r) { if (!ok(p)) return; t.tot += p.weight; t.r.push(r); t.cum.push(t.tot); }); return t; };
    W = F.pickT = { all: tab(function () { return true; }), kid: tab(function (p) { return p.age === 'child'; }), big: tab(function (p) { return p.age !== 'child'; }) };
  }
  var T = F.childShare === null || F.childShare === undefined ? W.all : hc < F.childShare ? W.kid : W.big;
  if (!T.r.length) T = W.all;
  return townFolkCum(T, h);
}
/** 累積權重表 T ＝ { r: [人物號], cum: [累積], tot } ⇒ h ∈ [0, 1) 落在哪一位（二分）。 */
function townFolkCum(T, h) {
  var x = h * T.tot, lo = 0, hi = T.r.length - 1;
  while (lo < hi) { var m = (lo + hi) >> 1; if (T.cum[m] <= x) lo = m + 1; else hi = m; }
  return T.r[lo];
}
/** 這座城照人口挑人（TASK-0870；Tim 2026-10-23「會跟鎮民演出有關(出現比例)」「之後就可以根據人口年齡分布 & 職業隨機生成鎮民了」）：
 *  外面那一頁（Blocksail 地球儀的城鎮帳）在規劃上附 live.folk ＝ { 人物 id: 權重 }（年齡層、男女、職業算好的；加起來 ＝ 那座城的人口）⇒ 照它挑，
 *  不再「前 rows 位每人一位」、不看設定檔的 child_share（小孩多少就是那座城的人口裡有多少）。沒附、全是 0、?folkpop=0 ⇒ null（照舊 townFolkPick）。 */
function townFolkTown(T, F) {
  var w = T.p && T.p.live && T.p.live.folk; if (!w || Q.get('folkpop') === '0') return null;
  var t = { r: [], cum: [], tot: 0 };
  F.people.forEach(function (p, r) { var v = +w[p.id] || 0; if (v <= 0) return; t.tot += v; t.r.push(r); t.cum.push(t.tot); });
  return t.tot > 0 ? t : null;
}
/** 立繪的每一列 ⇒ 那一位的設定（設定檔照 id 找）＋ 能挑的衣色、髮色（打包好的 0xRRGGBB）。
 *  色表：那一位的 cloth／hair ⇒ 設定檔的預設 cloth／hair ⇒ 遊戲設定檔的 hairColors；cloth_k／hair_k ⇒ 亮度倍率（JS 先乘、夾 255）。
 *  old ＝ 沒有設定檔時的 _folk（TASK-0849 早一版的 cloth、over[列]）。 */
function townFolkPeople(ids, cfg, old, rows) {
  var by = {}; ((cfg && cfg.people) || []).forEach(function (p) { by[p.id] = p; });
  var C0 = (cfg && cfg.cloth) || old.cloth || [[120, 120, 120]], H0 = (cfg && cfg.hair) || HAIR_KEYS.map(function (k) { return HAIR_COLORS[k]; });
  function pack(L, k) { return L.map(function (c) { return [0, 1, 2].reduce(function (v, j) { return v * 256 + Math.max(0, Math.min(255, Math.round(c[j] * k))); }, 0); }); }
  var out = [];
  for (var r = 0; r < rows; r++) {
    var id = ids[r] || String(r), p = by[id] || (old.over && old.over[r]) || {};
    out.push({ id: id, name: p.name || id, gender: p.gender || '', age: p.age || 'adult', years: p.years || null, job: p.job || '', work: p.work || [], height: p.height || 1.65, weight: p.weight > 0 ? p.weight : 1, cfg: !!by[id],
      cloth: pack(p.cloth || C0, p.cloth_k || 1), hair: pack(p.hair || H0, p.hair_k || 1), over: ['cloth', 'cloth_k', 'hair', 'hair_k'].some(function (k) { return k in p; }) });
  }
  return out;
}
/** 給之後工作建築的演出（Tim 2026-10-23「之後可以用在工作建築(例如魚場 旅店 農場)上的演出」；現在還沒有人叫）：
 *  q ＝ { work: 建築 key, age?, gender?, job? } ⇒ 符合的立繪列號清單（照設定檔的順序）。例：townFolkWho(K.folk, { work: 'fishery' })。 */
function townFolkWho(F, q) {
  var out = [];
  (F && F.people || []).forEach(function (p, r) {
    if (q.work && p.work.indexOf(q.work) < 0) return;
    if ((q.age && p.age !== q.age) || (q.gender && p.gender !== q.gender) || (q.job && p.job !== q.job)) return;
    out.push(r);
  });
  return out;
}
/** 丟掉模型組 K 時一起丟貼圖（keep 還在用同一份 ⇒ 留著）。 */
function townFolkFree(K, keep) {
  if (!K.folk || (keep && keep.folk === K.folk)) return;
  K.folk.sheets.forEach(function (sh) { if (sh.tex) gl.deleteTexture(sh.tex); });
}
/** 看板的實例緩衝（townProgs 建好 P.quad 之後）：一位 16 個 float ＝ aI、aS、aU、aC。 */
function townFolkGl(P) {
  P.folkBuf = gl.createBuffer(); P.folkVao = gl.createVertexArray(); gl.bindVertexArray(P.folkVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.folkBuf); [4, 5, 6, 7].forEach(function (a, q) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 64, q * 16); });
}

/** 城 T 的路網與居民（第一次要畫這座城時算一次；建築模式改了路 ⇒ townReplace 不沿用 T.folk，下次重算）。 */
function townFolkPrep(T, F) {
  var t0 = performance.now(), G = townFolkGraph(T), edges = G.edges, N = G.roadM < 8 ? 0 : Math.max(6, Math.min(TOWN_FOLK_MAX, Math.round(G.roadM / TOWN_FOLK_STEP)));
  var TP = townFolkTown(T, F);                                           // 照那座城的人口挑（有附 live.folk）；沒有 ⇒ 照舊
  G.agents = []; G.pick = TP ? 'pop' : 'cfg';
  for (var i = 0; i < N; i++) {
    var k = T.id + ':folk:' + i, target = townHash(k + ':e') * G.roadM, ei = 0;
    while (ei + 1 < edges.length && edges[ei].cum < target) ei++;
    var a = { id: i, spd: 1.15 + 0.45 * townHash(k + ':s'), lane: (townHash(k + ':l') - 0.5) * 0.65, art: TP ? townFolkCum(TP, townHash(k + ':a')) : i < F.rows ? i : townFolkPick(F, townHash(k + ':a'), townHash(k + ':y')),   // 前 rows 位每個人物一位（每座城都看得到每一種、排隊用），之後照權重與兒童比例
      cloth: 0, hair: 0, hgt: 0,                                         // 照這一位的設定挑（下面）
      sh: 0.94 + 0.12 * townHash(k + ':k'), ph: townHash(k + ':p') * 6.2832,
      e: ei, t: 0, dir: 1, stop: false, face: 1 };                       // e／t／dir／stop：這一格的位置（townFolkAt 照時間寫，不是狀態）；face：朝左朝右的遲滯（只是畫面）
    var p = F.people[a.art]; a.cloth = Math.floor(townHash(k + ':c') * p.cloth.length) % p.cloth.length; a.hair = Math.floor(townHash(k + ':h') * p.hair.length) % p.hair.length;
    a.hgt = p.height * TOWN_FOLK_SCALE * F.ch / F.hpx * (0.96 + 0.08 * townHash(k + ':g'));   // 看板高 ＝ 一整格：立繪佔 hpx／ch ⇒ 人的身高 ＝ 設定檔的 height × SCALE（± 4%）
    a.work = townFolkWorkSite(T, G, p, k);
    if (a.work) a.e = a.work.e;
    townFolkRoute(G, a, k, townHash(k + ':d') < 0.5 ? 1 : -1);
    G.agents.push(a);
  }
  G.prepMs = +(performance.now() - t0).toFixed(1);
  T.folk = G;
  return G;
}
/** 路網圖：路段在交叉口切開（別條路的頂點落在這一段中間 ≤ 2.2 m ⇒ T 字路口也連得上）、端點 2 m 內併成節點。
 *  找鄰居照 TOWN_FOLK_CELL 公尺的格子（TASK-0866：以前每一段掃全部端點、每個端點比全部節點 ⇒ 君士坦丁堡第一次畫那一格 2.1 s）；
 *  切點照數值排序、併節點取編號最小的那一個 ⇒ 跟逐個掃的結果逐項相同。 */
var TOWN_FOLK_CELL = 8;
function townFolkGraph(T) {
  var ax = BED.ax, az = BED.az, R = T.roads.filter(function (r) { return r.P && r.P.length >= 2 && r.w >= 2 && r.kind !== 'link-door'; });
  if (!R.length) R = T.roads.filter(function (r) { return r.P && r.P.length >= 2; });
  var raw = [], pts = [];
  R.forEach(function (r) {
    for (var q = 1; q < r.P.length; q++) {
      var za = r.z && r.z[q - 1], zb = r.z && r.z[q]; if ((za != null && za <= 0.05) || (zb != null && zb <= 0.05)) continue;   // 水面下的段（棧橋下、淹掉的路）
      var a = [r.P[q - 1][0] - ax, r.P[q - 1][1] - az], b = [r.P[q][0] - ax, r.P[q][1] - az], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1.5) continue;
      raw.push({ a: a, b: b, w: r.w || 3, L: L }); pts.push(a, b);
    }
  });
  var C = TOWN_FOLK_CELL, pg = new Map(), segs = [];
  function cell(x) { return Math.floor(x / C); }
  pts.forEach(function (p) { var k = cell(p[0]) + ',' + cell(p[1]), L = pg.get(k); if (L) L.push(p); else pg.set(k, [p]); });
  raw.forEach(function (s) {
    var dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L2 = s.L * s.L, cuts = [0, 1];
    var x0 = cell(Math.min(s.a[0], s.b[0]) - 2.2), x1 = cell(Math.max(s.a[0], s.b[0]) + 2.2), z0 = cell(Math.min(s.a[1], s.b[1]) - 2.2), z1 = cell(Math.max(s.a[1], s.b[1]) + 2.2);   // 離這一段 ≤ 2.2 m 的點一定在外框外擴 2.2 m 裡
    for (var gx = x0; gx <= x1; gx++) for (var gz = z0; gz <= z1; gz++) (pg.get(gx + ',' + gz) || []).forEach(function (p) {
      var u = ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dz) / L2; if (u <= 0.08 || u >= 0.92 || u * s.L < 1.5 || (1 - u) * s.L < 1.5) return;
      if (Math.hypot(p[0] - (s.a[0] + dx * u), p[1] - (s.a[1] + dz * u)) <= 2.2) cuts.push(u);
    });
    cuts.sort(function (x, y) { return x - y; });
    for (var i = 1; i < cuts.length; i++) {
      var u0 = cuts[i - 1], u1 = cuts[i]; if ((u1 - u0) * s.L < 1.2 && i < cuts.length - 1) continue;
      segs.push({ a: [s.a[0] + dx * u0, s.a[1] + dz * u0], b: [s.a[0] + dx * u1, s.a[1] + dz * u1], w: s.w });
    }
  });
  var nodes = [], edges = [], Ltot = 0, ng = new Map();
  function nodeOf(p) {                                                   // 2 m 內編號最小的節點（C ≥ 2 ⇒ 前後左右一格就夠）
    var cx = cell(p[0]), cz = cell(p[1]), best = -1;
    for (var gx = cx - 1; gx <= cx + 1; gx++) for (var gz = cz - 1; gz <= cz + 1; gz++) (ng.get(gx + ',' + gz) || []).forEach(function (i) {
      if ((best < 0 || i < best) && Math.hypot(nodes[i].x - p[0], nodes[i].z - p[1]) <= 2.0) best = i;
    });
    if (best >= 0) return best;
    var k = cx + ',' + cz, L = ng.get(k); nodes.push({ x: p[0], z: p[1], adj: [] });
    if (L) L.push(nodes.length - 1); else ng.set(k, [nodes.length - 1]);
    return nodes.length - 1;
  }
  segs.forEach(function (s) {
    var u = nodeOf(s.a), v = nodeOf(s.b); if (u === v) return;
    var A = nodes[u], B = nodes[v], dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz); if (L < 1.2) return;
    var ei = edges.length, ux = dx / L, uz = dz / L;
    Ltot += L;
    edges.push({ a: u, b: v, ax: A.x, az: A.z, dx: ux, dz: uz, nx: -uz, nz: ux, L: L, w: s.w, cum: Ltot });   // cum：照路長挑起點那條邊
    A.adj.push({ e: ei, dir: 1 }); B.adj.push({ e: ei, dir: -1 });
  });
  var ylo = 1e9, yhi = -1e9;                                             // 這座城的高度範圍（地塊的 h、路的 z）⇒ 路線外框的上下（看天空時不算人）
  (T.p && T.p.lots || []).forEach(function (l) { if (l.h === l.h) { ylo = Math.min(ylo, l.h); yhi = Math.max(yhi, l.h); } });
  R.forEach(function (r) { (r.z || []).forEach(function (z) { if (z != null) { ylo = Math.min(ylo, z); yhi = Math.max(yhi, z); } }); });
  if (!(ylo <= yhi)) { ylo = 0; yhi = 100; }
  return { nodes: nodes, edges: edges, roadM: Ltot, y: [ylo - 20, yhi + 25], line: null };
}
/** 居民 a 的固定路線與一圈的時間表：從起點那條邊照 townHash 往前走最多 TOWN_FOLK_HOPS 段（路口不折返、死巷就停），去程、終點停一下、原路回程、起點停一下。
 *  a.legs[i] ＝ { e, dir, t0, t1（邊上從第幾公尺走到第幾公尺；停步 t0 ＝ t1）, c1（這一段結束是一圈的第幾秒） }；a.per ＝ 一圈幾秒；a.off ＝ 起始時間差（大家不同步）。 */
// 工作建築旁的街段（只給人看）：圖上沒有那種建築／離路太遠 ⇒ 沿用一般散步。
function townFolkWorkSite(T, G, p, k) {
  if (!p.work || !p.work.length || !G.edges.length) return null;
  var cache = G.workSites || (G.workSites = {}), key = p.work.join('|'), sites = cache[key];
  if (!sites) {
    sites = cache[key] = [];
    var byLot = G.workLots || (G.workLots = {});
    (T.p && T.p.lots || []).forEach(function (l) {
      var match = p.work.indexOf(l.use) >= 0 || (p.work.indexOf('garrison') >= 0 && ['fort', 'barracks', 'watchtower', 'bastion'].indexOf(l.use) >= 0);
      if (!match || l.hide) return;
      var id = String(l.id), best = byLot[id];
      if (best === undefined) {
        var q = T.E(l.at), x = q[0] - BED.ax, z = q[1] - BED.az, d0 = Infinity;
        best = null;
        G.edges.forEach(function (e, i) {
          var t = Math.max(0, Math.min(e.L, (x - e.ax) * e.dx + (z - e.az) * e.dz));
          var d = Math.hypot(e.ax + e.dx * t - x, e.az + e.dz * t - z);
          if (d < d0 && d < 80) { d0 = d; best = { lot: l.id, use: l.use, e: i, t: t, distance: d }; }
        });
        byLot[id] = best;
      }
      if (best) sites.push(best);
    });
  }
  // 一個地塊最多四位作近距離演出；更多人仍散步，避免把人口權重全部擠到同一個門口。
  var usage = G.workUsage || (G.workUsage = {});
  function room(s) { var e = G.edges[s.e]; return Math.max(1, Math.min(4, Math.floor((Math.min(e.L, s.t + 4) - Math.max(0, s.t - 4)) / 2))); }
  var available = sites.filter(function (s) { return (usage[s.lot] || 0) < room(s); });
  if (!available.length) return null;
  var chosen = available[Math.floor(townHash(k + ':work') * available.length) % available.length];
  var slot = usage[chosen.lot] || 0; usage[chosen.lot] = slot + 1;
  var edge = G.edges[chosen.e], lo = Math.max(0, chosen.t - 4), hi = Math.min(edge.L, chosen.t + 4), step = (hi - lo) / room(chosen);
  return Object.assign({}, chosen, { t: lo + step * (slot + 0.5), patrol: Math.min(0.6, step * 0.25) });
}
function townFolkRoute(G, a, k, dir) {
  if (a.work) {                                                       // 在工作建築門前的短街段往返，不穿越房屋；仍只依畫面時間。
    var e = G.edges[a.work.e], radius = a.work.patrol == null ? 4 : a.work.patrol;
    var lo = Math.max(0, a.work.t - radius), hi = Math.min(e.L, a.work.t + radius), span = (hi - lo) / a.spd;
    var pause = 2 + 2 * townHash(k + ':rest'), first = dir > 0 ? lo : hi, last = dir > 0 ? hi : lo;
    a.legs = [{ e: a.work.e, dir: dir, t0: first, t1: last, c1: span },
      { e: a.work.e, dir: dir, t0: last, t1: last, c1: span + pause },
      { e: a.work.e, dir: -dir, t0: last, t1: first, c1: span * 2 + pause },
      { e: a.work.e, dir: -dir, t0: first, t1: first, c1: span * 2 + pause * 2 }];
    a.per = span * 2 + pause * 2; a.off = townHash(k + ':t') * a.per;
    var x0 = e.ax + e.dx * lo, x1 = e.ax + e.dx * hi, z0 = e.az + e.dz * lo, z1 = e.az + e.dz * hi;
    a.bb = [Math.min(x0, x1) - 3, G.y[0], Math.min(z0, z1) - 3, Math.max(x0, x1) + 3, G.y[1], Math.max(z0, z1) + 3];
    return;
  }
  var edges = G.edges, nodes = G.nodes, hops = [{ e: a.e, dir: dir }], rest = [];
  for (var h = 1; h < TOWN_FOLK_HOPS; h++) {
    var p = hops[h - 1], e = edges[p.e], nd = nodes[p.dir > 0 ? e.b : e.a], cand = nd.adj.filter(function (c) { return c.e !== p.e; });
    if (!cand.length) break;
    var r = townHash(k + ':r' + h);
    hops.push(cand[Math.floor(r * cand.length) % cand.length]);
    rest.push(townHash(k + ':w' + h) < 0.16 ? 1.0 + 1.8 * r : 0);           // 走到這個路口停一下的機率與秒數（跟 0846 一樣）
  }
  var legs = [], c = 0;
  function walk(p, d) { var L = edges[p.e].L; c += L / a.spd; legs.push({ e: p.e, dir: d, t0: d > 0 ? 0 : L, t1: d > 0 ? L : 0, c1: c }); }
  function stop(s) { if (!(s > 0)) return; var g = legs[legs.length - 1]; c += s; legs.push({ e: g.e, dir: g.dir, t0: g.t1, t1: g.t1, c1: c }); }
  for (var i = 0; i < hops.length; i++) { walk(hops[i], hops[i].dir); stop(i < rest.length ? rest[i] : 1.5 + 2 * townHash(k + ':end')); }   // 去程，最後一段停在終點
  for (var j = hops.length - 1; j >= 0; j--) { walk(hops[j], -hops[j].dir); stop(j > 0 ? rest[j - 1] : 1.5 + 2 * townHash(k + ':home')); }   // 原路回程，回到起點也停一下
  var bb = [1e9, G.y[0], 1e9, -1e9, G.y[1], -1e9];                       // 整條路線的外框（同 bedSeen、townBoxDist 的格式；水平含車道偏移 3 m，高度照整座城 —— 建路網時地面不一定到了）
  hops.forEach(function (p) { var e = edges[p.e], x1 = e.ax + e.dx * e.L, z1 = e.az + e.dz * e.L; bb[0] = Math.min(bb[0], e.ax - 3, x1 - 3); bb[2] = Math.min(bb[2], e.az - 3, z1 - 3); bb[3] = Math.max(bb[3], e.ax + 3, x1 + 3); bb[5] = Math.max(bb[5], e.az + 3, z1 + 3); });
  a.legs = legs; a.per = c; a.off = townHash(k + ':t') * c; a.bb = bb;
}
/** 時間 clock（秒）時居民 a 在哪：寫進 a.e、a.t（邊上第幾公尺）、a.dir、a.stop。測試用的排隊（G.line）⇒ 前幾位站在同一條街上。 */
function townFolkAt(G, a, clock) {
  if (G.line && a.id < G.line.n) {                                       // 兩排、一排 10 位；每 20 位一段沿著街往後排（townFolkLineOff 是左右哪一排）
    var E = G.edges[G.line.e]; a.e = G.line.e; a.t = Math.min(E.L - 1.5, 4.0 + (a.id % 10) * 2.2 + (Math.floor(a.id / 10) % 2) * 1.1 + Math.floor(a.id / 20) * 24); a.dir = a.id % 2 ? 1 : -1; a.stop = true; return;
  }
  var L = a.legs, u = (clock + a.off) % a.per, lo = 0, hi = L.length - 1;
  while (lo < hi) { var m = (lo + hi) >> 1; if (L[m].c1 <= u) lo = m + 1; else hi = m; }
  var g = L[lo], c0 = lo ? L[lo - 1].c1 : 0, f = g.c1 > c0 ? Math.min(1, (u - c0) / (g.c1 - c0)) : 0;
  a.e = g.e; a.dir = g.dir; a.t = g.t0 + (g.t1 - g.t0) * f; a.stop = g.t0 === g.t1;
}
/** 測試用（__game.town('street')）：挑城 T 市中心附近最長的一段街道，前 F.rows 位排在那條街上（每個角色一位）⇒ 回傳機位（給 __game.cam 對焦拍街景）。
 *  walk（__game.town('walk')）⇒ 同一個機位、不排隊（排過的放回去照路線走）。 */
function townFolkStreet(T, F, walk, group) {
  var G = T.folk || townFolkPrep(T, F); if (!G.edges.length) return null;
  var arts = []; F.people.forEach(function (p, i) { if (!group || F.sheets[p.sheet].name === group) arts.push(i); });
  var cx = T.ox - BED.ax, cz = T.oy - BED.az, n = Math.min(arts.length, G.agents.length), need = 28 + 24 * (Math.ceil(n / 20) - 1), best = -1, bestSc = -1e9;
  [need, 28].forEach(function (minL) {                                   // 先找排得下全部的（每 20 位一段 24 m）；沒有就退回 28 m（後面幾位擠在街尾）
    if (best >= 0) return;
    G.edges.forEach(function (e, i) {
      var sc = e.L * 0.6 - Math.hypot(e.ax + e.dx * e.L / 2 - cx, e.az + e.dz * e.L / 2 - cz) * 0.35;
      if (sc > bestSc && e.L >= minL && e.w >= 3) { bestSc = sc; best = i; }
    });
  });
  best = Math.max(0, best);
  G.line = walk ? null : { e: best, n: n, arts: arts.slice(0, n) };
  Object.keys(T.gt || {}).forEach(function (gk) { if (T.gt[gk].dirty) T.gt[gk].edit = true; });   // 還沒建的地面區不等背景預算（同建築模式改到的區）⇒ 截圖時地面在
  var E = G.edges[best], tx = E.ax + E.dx * 11.5, tz = E.az + E.dz * 11.5, ty = (townRoadHeight(tx, tz) || 2) + 1.3;
  return { tgt: [+tx.toFixed(2), +ty.toFixed(2), +tz.toFixed(2)], yaw: +(Math.atan2(-E.dz, -E.dx) + 0.14).toFixed(4), pitch: 0.12, dist: 11.5, mode: 0, track: false, tr: null };
}

// ── 建築裡的工人（TASK-0904；只給人看） ──
// Tim 2026-10-24：「嘗試讓建築物內有工人工作吧(可以參考街上居民方式 以及船員工作演出 在建築上標記中做點位(也可以有多個點 讓工人偶爾走動)」
// 點：模型的固定點 work-<組><號>（Blocksail BUILDING_SPEC §5；雕刻作品成品那一件標、townmodels.py 照舊寫進索引的 pts）＝ 站的那一格（格心；腳 ＝ 格底）；
//   同一組（字母；沒寫 ＝ 同一組）的點彼此直線走得到 ⇒ 工人只在同一組裡換點；work-<組><號>-to（選填）＝ 站在那裡時面向哪一點。
// 人數：規劃的 live.work ＝ { 地塊 id: 今天上了幾人 }（Blocksail 城鎮帳；那座城有帳就每個生產地塊都有一筆，0 ＝ 沒人上工）⇒ 每棟最多到點數；
//   地塊不在 live.work 裡（不在經濟模擬裡的：過磅所、魚市、船廠；或沒有城鎮帳的 town.html）⇒ 點數的一半（無條件進位）。
// 誰：設定檔 work 有那個用途的大人（townFolkWho）；軍事建築 ⇒ work 有 garrison 的；一個都沒有 ⇒ 那一棟不放人。同一棟照順序輪、不重複（人比立繪多才重複）。
// 動作：站在自己的點上做工（船員那一套程式動作：照節奏前傾、上下；41_crew_art.js），偶爾停下來喘口氣；同一組有空的點 ⇒ 每一圈走過去做一陣再走回來
//   （共用同一個空點的幾位錯開時間，不會同時站上去）。位置只照畫面時間算（同 townFolkAt）。?townwork=0 ⇒ 不畫（對照組）。
var TOWN_WORK = Q.get('townwork') !== '0', TOWN_WORK_RE = /^work-([a-z]?)(\d+)$/, TOWN_WORK_SCALE = 1.1, TOWN_WORK_SPD = 1.1;   // SCALE：建築裡比街上（TOWN_FOLK_SCALE 1.36）小，大人約 1.9 m ⇒ 對齊 Blocksail tools/workspots.py 找點要的 2.0 m 淨空（1.2 倍在伐木場柴棚下頂到棚簷）
var TOWN_WORK_GUARD = ['fort', 'barracks', 'watchtower', 'bastion', 'battery'];   // 這幾種用途找 work 有 garrison 的（同 townFolkWorkSite）
function townWorkCmp(a, b) { var A = TOWN_WORK_RE.exec(a), B = TOWN_WORK_RE.exec(b); return A[1] < B[1] ? -1 : A[1] > B[1] ? 1 : +A[2] - +B[2]; }
/** 城 T 的建築裡的工人 ⇒ T.work ＝ { inst（照哪一份實例算的；換了就重算）, list: [工人], blds: [每棟的讀數], bb }。 */
function townWorkPrep(T, F) {
  var t0 = performance.now(), K = TOWNS.kit, lw = T.p && T.p.live && T.p.live.work, lots = {}, list = [], blds = [];
  (T.p.lots || []).forEach(function (l) { lots[l.id] = l; });
  (T.inst || []).forEach(function (q) {
    var M = K && K.M[q.k], m = M && M.m; if (!m || !m.pts || q.wall || !(q.y === q.y)) return;
    var names = Object.keys(m.pts).filter(function (k) { return TOWN_WORK_RE.test(k); }).sort(townWorkCmp); if (!names.length) return;
    var l = lots[q.lot] || {}, use = l.use || m.use, s = Math.sin(q.th), c = Math.cos(q.th), mpv = m.mpv, hw = m.size[0] * mpv / 2, hd = m.size[1] * mpv / 2;
    function W(v) { var a = (v[0] * mpv - hw) * q.sx, b = v[1] * mpv - hd; return [q.x + a * s - b * c, q.y + (v[2] - 0.5) * mpv, q.z - a * c - b * s]; }   // 模型（格心）→ 世界（腳）：同 townLightBuild 的 W
    var P = names.map(function (k) { var w = W(m.pts[k]), to = m.pts[k + '-to'], t = to ? W(to) : [q.x, 0, q.z]; return { k: k, g: TOWN_WORK_RE.exec(k)[1], x: w[0], y: w[1], z: w[2], lx: t[0] - w[0], lz: t[2] - w[2] }; });   // lx／lz：面向（沒有 -to ⇒ 朝建築中心）
    var who = townFolkWho(F, { work: use }).filter(function (r) { return F.people[r].age !== 'child'; });
    if (!who.length && TOWN_WORK_GUARD.indexOf(use) >= 0) who = townFolkWho(F, { work: 'garrison' });
    var want = lw && Object.prototype.hasOwnProperty.call(lw, q.lot) ? Math.max(0, +lw[q.lot] || 0) : Math.ceil(P.length / 2), n = who.length ? Math.min(P.length, want) : 0;
    blds.push({ lot: q.lot, use: use, k: q.k, pts: P.length, want: want, n: n, src: lw && q.lot in lw ? 'ledger' : 'half', x: +q.x.toFixed(1), y: +P[0].y.toFixed(2), z: +q.z.toFixed(1),
      yaw: +Math.atan2(s, c).toFixed(4) });                              // yaw：鏡頭站在臨路那一邊往裡看（模型 y 0 ＝ 臨路 ⇒ 世界 (cos th, sin th)；03_camera.js 眼 ＝ 目標 ＋ (cos yaw, sin yaw) × dist）
    if (!n) return;
    var key = T.id + ':work:' + q.lot, off = Math.floor(townHash(key + ':a') * who.length), W0 = [];
    for (var j = 0; j < n; j++) {
      var k = key + ':' + j, art = who[(off + j) % who.length], pc = F.people[art];
      W0.push({ id: list.length + j, art: art, home: j, cloth: Math.floor(townHash(k + ':c') * pc.cloth.length) % pc.cloth.length, hair: Math.floor(townHash(k + ':h') * pc.hair.length) % pc.hair.length,
        hgt: pc.height * TOWN_WORK_SCALE * F.ch / F.hpx * (0.96 + 0.08 * townHash(k + ':g')), sh: 0.94 + 0.12 * townHash(k + ':k'), ph: townHash(k + ':p') * 6.2832,
        hz: 0.8 + 0.6 * townHash(k + ':z'), face: townHash(k + ':f') < 0.5 ? 1 : -1, P: P, k: k });
    }
    var spare = {};                                                       // 同一組裡沒人當家的點 ⇒ 那一組的人輪流過去
    P.forEach(function (p, i) { if (i >= n) (spare[p.g] || (spare[p.g] = [])).push(i); });
    var byG = {}; W0.forEach(function (a) { var g = P[a.home].g; (byG[g] || (byG[g] = [])).push(a); });
    Object.keys(byG).forEach(function (g) {
      var A = byG[g], S = spare[g] || [];
      if (!S.length) { A.forEach(function (a) { a.legs = [{ c1: 30, p: a.home, q: a.home }]; a.per = 30; a.off = 0; }); return; }   // 沒有空的點 ⇒ 守著自己那一點
      S.forEach(function (sp, si) {                                       // 共用同一個空點的幾位：同一個圈長、一人一個時段（時段 ＝ 最長那一位來回＋做一陣＋3 秒空檔）⇒ 不會同時站上去
        var same = A.filter(function (b, rb) { return rb % S.length === si; }); if (!same.length) return;
        same.forEach(function (a) { var h = P[a.home], o = P[sp]; a.wt = Math.hypot(o.x - h.x, o.z - h.z) / TOWN_WORK_SPD; a.d2 = 8 + 10 * townHash(a.k + ':d2'); });
        var slot = Math.max.apply(null, same.map(function (a) { return 2 * a.wt + a.d2; })) + 3, gk = key + ':' + g + ':' + sp;
        var per = Math.max(same.length * slot, slot + 18 + 24 * townHash(gk + ':per')), off = townHash(gk + ':t') * per;   // 一圈至少在自己那一點做 18～42 秒
        same.forEach(function (a, idx) {
          var s0 = idx * slot;
          a.legs = [{ c1: s0, p: a.home, q: a.home }, { c1: s0 + a.wt, p: a.home, q: sp }, { c1: s0 + a.wt + a.d2, p: sp, q: sp }, { c1: s0 + 2 * a.wt + a.d2, p: sp, q: a.home }, { c1: per, p: a.home, q: a.home }];
          a.per = per; a.off = off;
        });
      });
    });
    W0.forEach(function (a) { list.push(a); });
  });
  var bb = [1e9, -1e9, 1e9, 1e9, -1e9, -1e9];                            // 全部工人的外框（同 bedSeen 的格式）⇒ 整座城的工人都在畫面外就不算
  list.forEach(function (a) { a.P.forEach(function (p) { bb[0] = Math.min(bb[0], p.x - 2); bb[1] = Math.min(bb[1], p.y); bb[2] = Math.min(bb[2], p.z - 2); bb[3] = Math.max(bb[3], p.x + 2); bb[4] = Math.max(bb[4], p.y + 3); bb[5] = Math.max(bb[5], p.z + 2); }); });
  T.work = { inst: T.inst, list: list, blds: blds, bb: bb, prepMs: +(performance.now() - t0).toFixed(2) };
  return T.work;
}
/** 時間 clock 時工人 a 在哪 ⇒ a.x／y／z、a.mx／mz（這一格往哪走；停著 ＝ 0）。 */
function townWorkAt(a, clock) {
  var L = a.legs, u = ((clock + a.off) % a.per + a.per) % a.per, i = 0;
  while (i < L.length - 1 && L[i].c1 <= u) i++;
  var g = L[i], c0 = i ? L[i - 1].c1 : 0, f = g.c1 > c0 ? Math.min(1, (u - c0) / (g.c1 - c0)) : 0, p = a.P[g.p], q = a.P[g.q];
  a.x = p.x + (q.x - p.x) * f; a.y = p.y + (q.y - p.y) * f; a.z = p.z + (q.z - p.z) * f;
  a.at = g.p === g.q ? p : null; a.mx = a.at ? 0 : q.x - p.x; a.mz = a.at ? 0 : q.z - p.z;
}
/** 做工的程式動作（同 41_crew_art.js 拉繩那一種：照節奏前傾、縮一點、往下沉）；每 12 秒一格，四成的格停下來喘口氣（同街上停著的呼吸）。 */
function townWorkPose(a, clock) {
  var slot = Math.floor((clock + a.off) / 12);
  if (townHash(a.k + ':rest' + slot) < 0.4) { var br = Math.sin(clock * 2.2 + a.ph); return { sx: 1 - 0.008 * br, sy: 1 + 0.012 * br, lean: 0.015 * br, bob: 0 }; }
  var w = 0.5 + 0.5 * Math.sin((clock * a.hz + a.ph) * 6.2832);
  return { sx: 1 + 0.05 * w, sy: 1 - 0.08 * w, lean: 0.1 + 0.22 * w, bob: -0.03 * w * TOWN_WORK_SCALE };
}
/** 測試用（__game.town('work') ／ 'work:<用途>'）：挑城 T 裡有工人的那一棟（給了用途就挑那一種；人最多的先）⇒ 機位（從建築外斜上方看進去）。 */
function townWorkCam(T, F, use) {
  var W = T.work && T.work.inst === T.inst ? T.work : townWorkPrep(T, F), best = null;
  W.blds.forEach(function (b) { if (b.n && (!use || b.use === use) && (!best || b.n > best.n)) best = b; });
  if (!best) return null;
  return { lot: best.lot, use: best.use, n: best.n, cam: { tgt: [best.x, +(best.y + 1.2).toFixed(2), best.z], yaw: best.yaw, pitch: 0.42, dist: 16, mode: 0, track: false, tr: null } };
}

/** 畫出所有城鎮看得到的居民（townDraw 布旗之後；clock ＝ 城鎮的畫面時間）⇒ 三角形數。 */
function townFolkDraw(P, K, eye, PL, fogD, clock) {
  TOWNS.stat.folk = TOWNS.stat.folkPos = 0; TOWNS.stat.folkMs = 0;
  var F = K && K.folk; if (!TOWN_FOLK || !F || !P.folk) return 0;
  var t0 = performance.now();
  var fwd = sub(CAM.look, eye), rl = Math.hypot(fwd[2], fwd[0]) || 1, rx = -fwd[2] / rl, rz = fwd[0] / rl;
  var maxD = TOWN_FOLK_OUT[1], SH = F.sheets, n = 0, npos = 0, NS = SH.map(function () { return 0; });   // 一組一個實例陣列（TOWNS.folkArr[組]）、一組一次 draw call
  var BA = TOWNS.folkArr && TOWNS.folkArr.length === SH.length ? TOWNS.folkArr : (TOWNS.folkArr = SH.map(function () { return new Float32Array(256 * 16); }));
  var nwk = 0, nwkd = 0;                                                 // 建築裡的工人：算了位置的、畫了的
  function put(pc, x, y, z, hgt, sx, sy, lean, bob, face, cloth, hair, shade) {   // 一位 ⇒ 那一組的實例陣列（16 個 float，見檔頭「看板」）
    var sh = SH[pc.sheet]; if (!sh.tex) return;                          // 那一張解不開 ⇒ 這幾位不畫
    var s = pc.sheet, B = BA[s], m = NS[s];
    if (B.length < (m + 1) * 16) { var B2 = new Float32Array(B.length * 2); B2.set(B); B = BA[s] = B2; }
    var o = m * 16, v0 = pc.row / sh.rows, v1 = (pc.row + 1) / sh.rows; NS[s] = m + 1; n++;
    B[o] = x; B[o + 1] = y; B[o + 2] = z; B[o + 3] = hgt;
    B[o + 4] = sx; B[o + 5] = sy; B[o + 6] = lean; B[o + 7] = bob;
    B[o + 8] = face > 0 ? 0 : 0.5; B[o + 9] = v0; B[o + 10] = face > 0 ? 0.5 : 0; B[o + 11] = v1;
    B[o + 12] = cloth; B[o + 13] = hair; B[o + 14] = shade; B[o + 15] = face;
  }
  TOWNS.list.forEach(function (T) {
    var b = T.box, bx = Math.max(b[0] - BED.ax - eye[0], 0, eye[0] - (b[2] - BED.ax)), bz = Math.max(b[1] - BED.az - eye[2], 0, eye[2] - (b[3] - BED.az));
    if (Math.hypot(bx, bz) > maxD) return;                              // 整座城都在範圍外 ⇒ 連路網都不建（位置只看時間，回來時照樣接得上）
    // 路網照背景預算（08_seabed.js bedBusy）：君士坦丁堡一次 0.13 s（2,000 位的路線）⇒ 不跟建實例、解模型擠在同一格（TASK-0866：進城那一格 0.47 s）；預算用完 ⇒ 這一格先不畫這座城的人
    var G = T.folk; if (!G) { if (bedBusy()) return; var b0 = performance.now(); G = townFolkPrep(T, F); bedSpent(b0); }
    var cb = TOWNS.folkCb || (TOWNS.folkCb = [0, 0, 0, 0, 0, 0]);
    G.agents.forEach(function (a) {
      var ln = G.line && a.id < G.line.n, bb = a.bb;
      if (!ln) {                                                         // 路線外框先裁到鏡頭周圍 maxD 的方框（路線可以長到好幾百公尺，遠端那一截掉進視錐不算數）⇒ 裁完是空的、太遠、整個在畫面外 ⇒ 不算
        cb[0] = Math.max(bb[0], eye[0] - maxD); cb[2] = Math.max(bb[2], eye[2] - maxD); cb[3] = Math.min(bb[3], eye[0] + maxD); cb[5] = Math.min(bb[5], eye[2] + maxD); cb[1] = bb[1]; cb[4] = bb[4];
        if (cb[0] > cb[3] || cb[2] > cb[5] || townBoxDist(cb, eye) > maxD || !bedSeen(PL, cb)) return;
      }
      townFolkAt(G, a, clock); npos++;
      var pc = F.people[ln && G.line.arts ? G.line.arts[a.id] : a.art], sh = SH[pc.sheet]; if (!sh.tex) return;  // 排隊按設定檔逐位展示，不受人口抽選重複影響。
      var e = G.edges[a.e], off = (ln ? (Math.floor(a.id / 10) % 2 ? 0.32 : -0.32) : 0.18 * a.dir + a.lane) * Math.max(0.3, Math.min(2.8, e.w - 1.2));   // 靠右走（照前進方向）＋ 車道偏移
      var x = e.ax + e.dx * a.t + e.nx * off, z = e.az + e.dz * a.t + e.nz * off;
      if (Math.hypot(x - eye[0], z - eye[2]) > maxD) return;
      var y = townRoadHeight(x, z); if (!(y === y) || y <= 0.05) return;
      y += TOWN_ROAD_LIFT;
      for (var i = 0; i < 6; i++) { var pl = PL[i]; if (pl[0] * x + pl[1] * (y + 0.9 * TOWN_FOLK_SCALE) + pl[2] * z + pl[3] < -2.2 * TOWN_FOLK_SCALE) return; }
      var mv = (e.dx * rx + e.dz * rz) * a.dir;
      if (mv > 0.08) a.face = 1; else if (mv < -0.08) a.face = -1;
      var sx = 1, sy = 1, lean = 0, bob = 0;
      if (a.stop) { var br = Math.sin(clock * 2.2 + a.ph); sy = 1 + 0.012 * br; sx = 1 - 0.008 * br; lean = a.face * 0.015 * br; }   // 停著：呼吸
      else { var w = clock * a.spd * 1.45 + a.ph, r = Math.abs(Math.sin(w * 6.2832)); bob = 0.065 * TOWN_FOLK_SCALE * r; lean = a.face * (0.055 + 0.035 * Math.sin(w * 6.2832)); sy = 0.96 + 0.04 * r; sx = 1.03 - 0.03 * r; }   // 走路：彈跳、前傾（同水手）
      put(pc, x, y, z, ln ? pc.height * TOWN_FOLK_SCALE * F.ch / F.hpx : a.hgt, sx, sy, lean, bob, a.face,
        pc.cloth[ln ? (a.id * 3) % pc.cloth.length : a.cloth], pc.hair[ln ? a.id % pc.hair.length : a.hair], a.sh);   // 排隊（測試用）⇒ 每位錯開衣色，截圖看得到整張色表
    });
    if (!TOWN_WORK || !T.inst) return;                                   // 建築裡的工人（townWorkPrep）：實例換了（建築模式、換模型組）⇒ 重算
    var WK = T.work && T.work.inst === T.inst ? T.work : townWorkPrep(T, F); if (!WK.list.length) return;
    if (townBoxDist(WK.bb, eye) > maxD || !bedSeen(PL, WK.bb)) return;
    WK.list.forEach(function (a) {
      var p0 = a.P[a.home]; if (Math.hypot(p0.x - eye[0], p0.z - eye[2]) > maxD + 20) return;
      townWorkAt(a, clock); npos++; nwk++;
      if (Math.hypot(a.x - eye[0], a.z - eye[2]) > maxD) return;
      for (var i = 0; i < 6; i++) { var pl = PL[i]; if (pl[0] * a.x + pl[1] * (a.y + 0.9 * TOWN_WORK_SCALE) + pl[2] * a.z + pl[3] < -2.2 * TOWN_WORK_SCALE) return; }
      var pc = F.people[a.art], ps, mv = a.at ? a.at.lx * rx + a.at.lz * rz : a.mx * rx + a.mz * rz;
      if (mv > 0.08) a.face = 1; else if (mv < -0.08) a.face = -1;
      if (a.at) ps = townWorkPose(a, clock);
      else { var w = clock * TOWN_WORK_SPD * 1.45 + a.ph, r = Math.abs(Math.sin(w * 6.2832)); ps = { bob: 0.065 * TOWN_WORK_SCALE * r, lean: 0.055 + 0.035 * Math.sin(w * 6.2832), sy: 0.96 + 0.04 * r, sx: 1.03 - 0.03 * r }; }   // 走路：同街上
      put(pc, a.x, a.y, a.z, a.hgt, ps.sx, ps.sy, a.face * ps.lean, ps.bob, a.face, pc.cloth[a.cloth], pc.hair[a.hair], a.sh); nwkd++;
    });
  });
  TOWNS.stat.work = nwk; TOWNS.stat.workDrawn = nwkd;                  // 建築裡的工人：算了位置的、畫了的（也算在 folk、folkPos 裡）
  TOWNS.stat.folk = n; TOWNS.stat.folkPos = npos; TOWNS.stat.folkBySheet = NS.slice();   // folkPos：這一格算了幾位的位置（外框過了、還沒照實際位置剔）；folkBySheet：每組畫了幾位
  if (!n) { TOWNS.stat.folkMs = +(performance.now() - t0).toFixed(3); return 0; }
  var PF = P.folk; gl.useProgram(PF.prog); setCommon(PF);
  gl.uniform1f(PF.u.uFogD, fogD); gl.uniform3fv(PF.u.uEye, eye); gl.uniform3f(PF.u.uRight, rx, 0, rz);
  gl.uniform2f(PF.u.uIn, -2, -1); gl.uniform2f(PF.u.uOut, TOWN_FOLK_OUT[0], TOWN_FOLK_OUT[1]); gl.uniform1i(PF.u.uTex, 11);
  gl.bindVertexArray(P.folkVao); gl.bindBuffer(gl.ARRAY_BUFFER, P.folkBuf);
  SH.forEach(function (sh, s) {
    if (!NS[s]) return;
    gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D, sh.tex); gl.activeTexture(gl.TEXTURE0);
    gl.bufferData(gl.ARRAY_BUFFER, BA[s].subarray(0, NS[s] * 16), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, NS[s]);
  });
  TOWNS.stat.folkMs = +(performance.now() - t0).toFixed(3);             // CPU 這一段（算位置＋送緩衝；建路網那一格也算在裡面）
  return 2 * n;
}

/** 讀數：城 T 的那一份（townStat 每座城的 folk）。 */
function townFolkStat(T) {
  var G = T.folk; if (!G) return null;
  var F = TOWNS.kit && TOWNS.kit.folk, kids = 0; if (F) G.agents.forEach(function (a) { if (F.people[a.art].age === 'child') kids++; });
  return { agents: G.agents.length, edges: G.edges.length, nodes: G.nodes.length, roadM: Math.round(G.roadM), y: G.y, prepMs: G.prepMs, line: G.line, pick: G.pick, kids: G.agents.length ? +(kids / G.agents.length).toFixed(3) : null,
    work: T.work ? { inst: T.work.inst === T.inst, workers: T.work.list.length, prepMs: T.work.prepMs, blds: T.work.blds } : null,   // 建築裡的工人（townWorkPrep；inst false ＝ 實例換了、下次畫時重算）
    workSites: G.agents.filter(function (a) { return a.work && F && F.sheets[F.people[a.art].sheet].name === 'workers'; }).slice(0, 24).map(function (a) { var e = G.edges[a.e]; return { id: F.people[a.art].id, lot: a.work.lot, use: a.work.use, distance: +a.work.distance.toFixed(2), x: +(e.ax + e.dx * a.t).toFixed(2), z: +(e.az + e.dz * a.t).toFixed(2) }; }),
    sample: G.agents.slice(0, 8).map(function (a) { var e = G.edges[a.e]; return { id: a.id, art: a.art, cloth: a.cloth, hair: a.hair, legs: a.legs.length, per: +a.per.toFixed(1), t: +a.t.toFixed(2), x: +(e.ax + e.dx * a.t).toFixed(1), z: +(e.az + e.dz * a.t).toFixed(1) }; }) };
}
/** 讀數：全部城加起來（townStat 頂層的 folk）。 */
function townFolkSum() {
  var F = TOWNS.kit && TOWNS.kit.folk; if (!F) return null;
  var kids = 0, tot = 0; TOWNS.list.forEach(function (T) { (T.folk ? T.folk.agents : []).forEach(function (a) { tot++; if (F.people[a.art].age === 'child') kids++; }); });
  return { rows: F.rows, childShare: F.childShare, kidsNow: tot ? +(kids / tot).toFixed(3) : null, sheets: F.sheets.map(function (sh, s) { return { name: sh.name, rows: sh.rows, ok: !!sh.tex, drawn: (TOWNS.stat.folkBySheet || [])[s] || 0 }; }),
    people: F.people.map(function (p) { return { id: p.id, sheet: F.sheets[p.sheet].name, row: p.row, age: p.age, height: p.height, weight: p.weight, work: p.work, cloth: p.cloth.length, hair: p.hair.length, over: p.over, cfg: p.cfg }; }), total: TOWNS.list.reduce(function (s, T) { return s + (T.folk ? T.folk.agents.length : 0); }, 0), pos: TOWNS.stat.folkPos || 0, drawn: TOWNS.stat.folk || 0, ms: TOWNS.stat.folkMs || 0, clock: +(TOWNS.flagClock || 0).toFixed(3) };   // clock：位置照的那個畫面時間
}

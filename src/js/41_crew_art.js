// ───────────────────────── 船員貼圖：替代品（程式畫）／美術（#art-crew） ─────────────────────────
// 格子：每格 CELL_W × CELL_H（寬:高 ＝ 1:2）；列 ＝ 角色（c.art；隊伍不分列）；人一律朝右畫，腳底在格子底邊中間。
// 欄：**單圖**（1 欄，每個角色一張；預設）⇒ 動作全由程式做（crewPose：晃、上下、縮放、傾斜、躺倒）；
//     或 8 欄（每欄一個動作 FR，以後有逐格美術時用）⇒ 照欄選格，程式動作只疊輕的一層。
// 換色（Tim 2026-10-17：匯入時用特殊顏色標記換色區塊、只記錄一份圖、遊戲內由程式上色；頭髮也標、遊戲裡隨機髮色）：
//   art/crew.png 只有一份、裡面是標記色（make_crew.py）：布 (L,0,L)、頭髮 (0,L,L)，L ＝ 亮度（100 ＝ 中位）。換好的顏色不進圖。
//   載入時展開成「底圖｜遮罩」左右兩半（crewArt）：底圖的標記點換成灰階 L、遮罩 R ＝ 布、G ＝ 頭髮；
//   畫的時候著色器照每個人的隊（設定檔 teamCloth）與髮色（hairColors）上色：顏色 × L／100 ⇒ 圖不因隊數、髮色數變大，加一隊／一色只加設定檔一行。
//   髮色：每個人第一次畫的時候照（船, 第幾個人）的雜湊挑一個、記在 c.hair（⛔ 只管畫、不碰 rnd()）。
// 像素風（Tim 2026-10-17：維持像素顆粒感、不要 linear）：放大用最近點（NEAREST），縮小照舊用 mipmap（遠處不閃）。
var CELL_W = 64, CELL_H = 128, CREW_TEX = null, CREW_ART = false, CREW_COLS = 1, CREW_ROWS = NART, BBVAO = null, BBBUF = null, BBMAX = 1400, BBS = 20, BB = new Float32Array(BBMAX * BBS);
var FX_TEX = null, HUD_ART = null;
var TEAM_MAX = 8, HAIR_MAX = 16;                                                     // 著色器裡隊色、髮色表的上限
var TEAM_CLOTH = CFG.teamCloth || { blue: [34, 43, 65], red: [82, 24, 21] }, TEAM_KEYS = Object.keys(TEAM_CLOTH).slice(0, TEAM_MAX);
var HAIR_COLORS = CFG.hairColors || { black: [38, 30, 26] }, HAIR_KEYS = Object.keys(HAIR_COLORS).slice(0, HAIR_MAX);
var TEAM_U = colorTable(TEAM_CLOTH, TEAM_KEYS, TEAM_MAX), HAIR_U = colorTable(HAIR_COLORS, HAIR_KEYS, HAIR_MAX);
function colorTable(T, keys, n) { var u = new Float32Array(n * 3); keys.forEach(function (k, i) { for (var j = 0; j < 3; j++) u[i * 3 + j] = T[k][j] / 255; }); return u; }
/** 這艘船的人穿哪一隊的布：照 sh.team 在設定檔 teamCloth 裡的順序（沒有那一隊 ⇒ 第一隊）。 */
function crewTeam(sh) { var k = TEAM_KEYS.indexOf(sh.team); return k < 0 ? 0 : k; }
/** 這個人的髮色（hairColors 的第幾個）：第一次畫的時候照（船, 第幾個人）的雜湊挑、記在 c.hair ⇒ 換船（游到友船）也不變。 */
function crewHair(sh, c, k) { if (c.hair === undefined) c.hair = Math.floor(hairMix(Math.imul(sh.i + 1, 0x9e3779b1) + k) * HAIR_KEYS.length); return c.hair; }
function hairMix(a) { a |= 0; a ^= a >>> 16; a = Math.imul(a, 0x7feb352d); a ^= a >>> 15; a = Math.imul(a, 0x846ca68b); a ^= a >>> 16; return (a >>> 0) / 4294967296; }   // 相鄰的人不同色（hash3 相鄰的 k 會連著同一色）
/** 程式畫的替代品：mk ＝ false 畫底圖（換色的布畫成灰階 L）、true 畫遮罩（布紅、其他黑）。 */
function drawFigure(g, ox, oy, role, f, mk) {
  function T(L) { return mk ? '#f00' : 'rgb(' + L + ',' + L + ',' + L + ')'; }    // 換隊色的布（L：亮度，100 ＝ 中位）
  function K(c) { return mk ? '#000' : c; }                                         // 不換色
  var skin = K('#d9a77c'), pants = K('#e6dfcc'), shoe = K('#1b1b1b');
  var jacket = role === ROLE.MARINE ? T(130) : role === ROLE.OFFICER ? T(97) : role === ROLE.TOP ? K('#d8d2c0') : T(177);
  var hat = role === ROLE.OFFICER ? K('#111') : role === ROLE.MARINE ? T(68) : T(92);
  var sc = role === ROLE.POWDER ? 0.74 : 1;
  g.save(); g.translate(ox + CELL_W / 2, oy + CELL_H - 2);
  if (f === FR.DEAD) { g.translate(-26, -3); g.rotate(-Math.PI / 2); g.scale(0.58, 0.58); }
  else if (f === FR.WOUNDED) { g.translate(0, 0); }
  g.scale(sc, sc);
  function rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function line(x0, y0, x1, y1, w, c) { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  var sitting = f === FR.WOUNDED, hip = sitting ? -22 : -52, top = hip - 38;
  // 腿
  if (sitting) { line(-4, hip, 20, -6, 6, pants); line(2, hip, 26, -4, 6, pants); rect(20, -9, 9, 5, shoe); }
  else {
    var a = f === FR.RUN_A ? 0.45 : f === FR.RUN_B ? -0.45 : f === FR.WORK_A ? 0.25 : 0.06;
    line(-3, hip, -3 - Math.sin(a) * 50, hip + Math.cos(a) * 50, 6, pants); line(3, hip, 3 + Math.sin(a) * 50, hip + Math.cos(a) * 50, 6, pants);
    rect(-3 - Math.sin(a) * 50 - 4, hip + Math.cos(a) * 50 - 3, 10, 5, shoe); rect(3 + Math.sin(a) * 50 - 2, hip + Math.cos(a) * 50 - 3, 10, 5, shoe);
  }
  // 身體（彎腰：推彈、搬東西）
  var lean = f === FR.WORK_A ? 0.35 : sitting ? 0.25 : 0;
  g.save(); g.translate(0, hip); g.rotate(lean);
  rect(-10, -38, 20, 40, jacket);
  if (role === ROLE.MARINE) { line(-9, -36, 9, -2, 3, K('#f2efe6')); line(9, -36, -9, -2, 3, K('#f2efe6')); }
  if (role === ROLE.OFFICER) { rect(-12, -38, 6, 4, K('#e2b84a')); rect(6, -38, 6, 4, K('#e2b84a')); }
  if (role === ROLE.TOP) { for (var k = -32; k < 0; k += 8) rect(-10, k, 20, 3, T(177)); }
  if (sitting) rect(-6, -26, 10, 9, K('#9c1c1c'));                         // 傷
  // 手臂
  var sh0 = [8, -34];
  if (f === FR.WORK_A) { line(sh0[0], sh0[1], 30, -16, 5, jacket); line(-6, -34, 26, -12, 5, jacket); line(18, -18, 40, -12, 3, K('#6b4a2a')); }      // 推彈桿
  else if (f === FR.WORK_B) { line(sh0[0], sh0[1], 18, -64, 5, jacket); line(-6, -34, 8, -66, 5, jacket); }                                        // 拉砲索
  else if (f === FR.FIRE && (role === ROLE.MARINE || role === ROLE.TOP)) { line(sh0[0], sh0[1], 26, -32, 5, jacket); line(-6, -34, 22, -30, 5, jacket); line(4, -30, 46, -34, 3, K('#4b3621')); }  // 舉槍
  else if (f === FR.FIRE && role === ROLE.OFFICER) { line(sh0[0], sh0[1], 26, -54, 5, jacket); line(24, -52, 40, -78, 2, K('#cfd6dc')); }               // 舉劍
  else if (f === FR.FIRE) { line(sh0[0], sh0[1], 28, -50, 5, jacket); }                                                                             // 砲長：手一揮
  else if (sitting) { line(sh0[0], sh0[1], 2, -22, 5, jacket); }
  else { line(sh0[0], sh0[1], 11, -2, 5, jacket); line(-8, -34, -11, -2, 5, jacket); if (role === ROLE.MARINE) line(14, 2, 14, -60, 3, K('#4b3621')); }
  // 頭、帽子
  g.fillStyle = skin; g.beginPath(); g.arc(1, -47, 8, 0, 6.2832); g.fill();
  if (role === ROLE.OFFICER) { g.fillStyle = hat; g.beginPath(); g.ellipse(1, -55, 15, 5, 0, 0, 6.2832); g.fill(); rect(-3, -62, 8, 6, hat); }
  else if (role === ROLE.MARINE) rect(-7, -68, 16, 14, hat);
  else if (role !== ROLE.POWDER) { rect(-9, -57, 20, 4, hat); rect(-6, -63, 14, 7, hat); }
  g.restore();
  g.restore();
}
/** 替代品：每列一張待命的站姿（單圖 ⇒ 1 欄），直接畫成「底圖｜遮罩」左右兩半（跟 crewArt 展開後同一個排法）；
 *  船長那一列畫成軍官，Sirius 六位那幾列（新職位還沒接上）畫成砲手。 */
function crewPlaceholder() {
  var c = document.createElement('canvas'); c.width = CELL_W * 2; c.height = NART * CELL_H;
  var g = c.getContext('2d');
  for (var r = 0; r < NART; r++) for (var mk = 0; mk < 2; mk++) drawFigure(g, mk * CELL_W, r * CELL_H, r < NROLE ? r : r === ART_CAPTAIN ? ROLE.OFFICER : ROLE.GUN, FR.IDLE, !!mk);
  return c;
}
/** crew.png（標記色，只有一份）⇒ 「底圖｜遮罩」左右兩半：布 (L,0,L)、頭髮 (0,L,L) 在底圖換成灰階 L，遮罩 R ＝ 布、G ＝ 頭髮。
 *  上色在著色器（bbSetup：隊色／髮色 × L／100）⇒ 不管幾隊、幾種髮色，貼圖都是這一張。 */
function crewArt(im) {
  var w = im.width, h = im.height, c = document.createElement('canvas'); c.width = w * 2; c.height = h;
  var g = c.getContext('2d'); g.drawImage(im, 0, 0);
  var d = g.getImageData(0, 0, w * 2, h), px = d.data, nc = 0, nh = 0;
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var i = (y * w * 2 + x) * 4, j = i + w * 4, m = 0;
    if (!px[i + 3]) continue;
    if (px[i + 1] === 0 && px[i] === px[i + 2]) { m = 1; px[i + 1] = px[i]; nc++; }
    else if (px[i] === 0 && px[i + 1] === px[i + 2]) { m = 2; px[i] = px[i + 1]; nh++; }
    px[j] = m === 1 ? 255 : 0; px[j + 1] = m === 2 ? 255 : 0; px[j + 2] = 0; px[j + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return { cv: c, cloth: nc, hair: nh };
}
/** pix：像素風（放大用最近點，不糊；縮小照舊用 mipmap ⇒ 遠處不閃）。 */
function texFrom(src, pix) {
  var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, pix ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
/** 美術交件了就換上：寬:高 1:2 的格子，1 欄（單圖）或 8 欄（逐格動作）；列 ＝ 角色（至少職位那幾列；少了船長、Sirius 六位 ⇒ 照職位那一列）；
 *  只有一份、裡面是標記色（make_crew.py）。沒交、或尺寸不對 ⇒ 留著替代品，並在讀數裡說為什麼。 */
function loadArt() {
  CREW_TEX = texFrom(crewPlaceholder(), true); CREW_COLS = 1; CREW_ROWS = NART;
  var why = [];
  var p1 = VK.embeddedImage('art-crew').then(function (im) {
    if (!im) { why.push('船員：替代品（art/crew.png 沒交）'); return; }
    var cols = [1, NFR].filter(function (n) { var cw = im.width / n, rows = im.height / (cw * 2); return im.width % n === 0 && rows === Math.floor(rows) && rows >= NROLE; })[0];
    if (!cols) { why.push('船員：替代品（art/crew.png 是 ' + im.width + '×' + im.height + '；要每格寬:高 ＝ 1:2、1 欄（單圖）或 ' + NFR + ' 欄、至少 ' + NROLE + ' 列）'); console.warn('art/crew.png 尺寸不對，改用替代品'); return; }
    var rows = im.height / (im.width / cols * 2), A = crewArt(im);
    CREW_TEX = texFrom(A.cv, true); CREW_ART = true; CREW_COLS = cols; CREW_ROWS = rows;
    why.push('船員：美術 ' + im.width + '×' + im.height + (cols === 1 ? '（單圖，動作由程式做）' : '（' + cols + ' 欄逐格）') +
      '（' + rows + ' 列；標記色：布 ' + A.cloth + ' 點、頭髮 ' + A.hair + ' 點 ⇒ ' + TEAM_KEYS.length + ' 隊、' + HAIR_KEYS.length + ' 種髮色）' + (rows < NART ? '（少了 ' + (NART - rows) + ' 列：照職位那一列）' : ''));
  });
  var p2 = VK.embeddedImage('art-fx').then(function (im) {
    if (!im) { why.push('特效：替代品'); return; }
    if (im.width !== im.height) { why.push('特效：替代品（art/fx.png 要是正方形 4×4 格）'); return; }
    FX_TEX = texFrom(im); why.push('特效：美術 ' + im.width + '×' + im.height);
  });
  var p3 = VK.embeddedImage('art-hud').then(function (im) {
    if (!im) { why.push('HUD：文字符號'); return; }
    HUD_ART = { src: im.src, cw: im.width / 8, ch: im.height / 2 }; why.push('HUD：美術 ' + im.width + '×' + im.height);
  });
  return Promise.all([p1, p2, p3]).then(function () { return why.join('、'); });
}
/** billboard：一個人 ＝ 一張直立、面向鏡頭的貼圖。每個實例：iP（腳底、高）、iU（貼圖格）、iS（寬、明暗、傾斜、上下）、iA（閃紅）、iC（隊、髮色：uTeamC／uHairC 的第幾個）。
 *  上色：底圖右邊半張是遮罩（crewArt）⇒ uMask 1 時照遮罩把灰階 L 換成 隊色／髮色 × L／100；手持物 uMask 0。
 *  傾斜繞腳底轉（在貼圖平面上）⇒ 前傾、後仰都是同一個旋轉；上下是整個人抬高或壓低。
 *  倒下的人（iA.yzw ＝ 倒向，世界座標）：身體從直立轉向那個固定的方向（iS.z ＝ 倒下了幾度），貼圖繞身體那條軸轉向鏡頭
 *  ⇒ 躺的方向不跟著鏡頭轉，但還是面向鏡頭（Tim 2026-10-12；⛔ 以前躺倒也是在貼圖平面上轉 ⇒ 鏡頭一轉，屍體跟著在甲板上轉）。
 *  iS.y 的正負號 ＝ 在不在海裡（墜落、在游 ⇒ 負）：只有在海裡、而且在那一點的浪面以下才染水色（Tim 2026-10-16：船沒進水，水線下那幾層的人卻一層水色；⛔ 以前照世界 y < 0 一律染）。 */
function bbSetup() {
  P.bb = VK.compile(gl,
    '#version 300 es\nlayout(location=0) in vec2 aQ; layout(location=1) in vec4 iP; layout(location=2) in vec4 iU; layout(location=3) in vec4 iS; layout(location=4) in vec4 iA; layout(location=5) in vec4 iC;\n' +
    'uniform mat4 uVP; uniform vec3 uRight,uEye; out vec2 vUV; out vec3 vW; out float vS; out float vF; flat out vec2 vC;\n' +
    'void main(){ vec2 q=vec2(aQ.x*iS.x,aQ.y*iP.w); vec3 w;\n' +
    ' if(dot(iA.yzw,iA.yzw)>0.0){ vec3 d=normalize(iA.yzw), a=normalize(vec3(0.0,cos(iS.z),0.0)+d*sin(iS.z)), sx=cross(a,normalize(uEye-iP.xyz)); float l=length(sx); sx=l>1e-4?sx/l:uRight;\n' +
    '   w=iP.xyz+sx*q.x+a*q.y+vec3(0.0,iS.w,0.0); }\n' +
    ' else { float c=cos(iS.z), s=sin(iS.z); q=vec2(c*q.x-s*q.y,s*q.x+c*q.y); w=iP.xyz+uRight*q.x+vec3(0.0,q.y+iS.w,0.0); }\n' +
    ' vW=w; vUV=vec2(mix(iU.x,iU.z,aQ.x+0.5),mix(iU.w,iU.y,aQ.y)); vS=iS.y; vF=iA.x; vC=iC.xy; gl_Position=uVP*vec4(w,1.0); }\n',
    '#version 300 es\nprecision highp float;\n' + SEA_GLSL + 'in vec2 vUV; in vec3 vW; in float vS; in float vF; flat in vec2 vC; uniform sampler2D uTex; uniform vec3 uEye,uFog,uTeamC[' + TEAM_MAX + '],uHairC[' + HAIR_MAX + ']; uniform float uFogD,uLum,uMask; out vec4 o;\n' +
    'void main(){ vec4 t=texture(uTex,vUV); vec2 m=texture(uTex,vUV+vec2(0.5,0.0)).rg; if(t.a<0.5) discard; vec3 b=t.rgb;\n' +
    ' if(uMask>0.5){ float k=t.r*2.55; b=mix(b,min(uTeamC[int(vC.x+0.5)]*k,1.0),m.r); b=mix(b,min(uHairC[int(vC.y+0.5)]*k,1.0),m.g); }\n' +
    ' vec3 c=mix(b*abs(vS)*uLum,vec3(1.0,0.12,0.08),vF*0.8); if(vS<0.0 && vW.y<seaH(vW.xz)) c=mix(c,vec3(0.04,0.18,0.22),0.6);\n' +
    ' float fd=length(vW-uEye); o=vec4(mix(c,uFog,1.0-exp(-fd*uFogD)),1.0); }\n');
  BBVAO = gl.createVertexArray(); gl.bindVertexArray(BBVAO);
  var q = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, q); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  BBBUF = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, BBBUF); gl.bufferData(gl.ARRAY_BUFFER, BB.byteLength, gl.DYNAMIC_DRAW);
  [[1, 0], [2, 16], [3, 32], [4, 48], [5, 64]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], 4, gl.FLOAT, false, BBS * 4, a[1]); gl.vertexAttribDivisor(a[0], 1); });
  gl.bindVertexArray(null);
  ITVAO = gl.createVertexArray(); gl.bindVertexArray(ITVAO);                        // 手持物：同一個 billboard 程式、另一份實例
  gl.bindBuffer(gl.ARRAY_BUFFER, q); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  ITBUF = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ITBUF); gl.bufferData(gl.ARRAY_BUFFER, ITB.byteLength, gl.DYNAMIC_DRAW);
  [[1, 0], [2, 16], [3, 32], [4, 48], [5, 64]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], 4, gl.FLOAT, false, BBS * 4, a[1]); gl.vertexAttribDivisor(a[0], 1); });
  gl.bindVertexArray(null);
  ITEM_TEX = itemAtlas();
}
// ───── 手持物（Tim 2026-10-12）─────
// 送藥手搬的時候抱著藥筒、上面一顆彈丸；陸戰隊與桅頂水手瞄準、開槍時舉平火槍；軍官與船長齊射時舉劍；裝填中的砲班每門一個人拿推彈桿往前推。
// 立繪照舊（Tim：立繪不用改）⇒ 陸戰隊身上那把直立的槍、軍官腰上的劍還在，手持物是另外疊的一層、只在那個動作時出現。
// 點陣圖在程式裡畫（方塊清單 ⇒ 小畫布 ⇒ 最近點取樣），1 格 ＝ 1/46 m（約水手立繪的兩個像素）；每件都朝右畫，握的地方在 pv（格）。
// 畫的時候跟著人：手的位置（身高的比例）照人的縮放與傾斜轉，再加道具自己的角度（朝前 0、往上為正）；跟人同一個面 ⇒ 往鏡頭挪 6 cm。⛔ 只管畫、不碰 rnd()。
var ITEM_PPM = 46, ITEM_TEX = null, ITEM_UV = {}, ITMAX = 600, ITB = new Float32Array(ITMAX * BBS), ITVAO = null, ITBUF = null, FIG_K = 164 / 192;   // FIG_K：站著的人佔格高的比例（make_crew.py 的 H_PX）
var ITEM_DEF = {
  musket: { w: 64, h: 7, pv: [2, 4], r: [[0, 2, 5, 4, '#5a3a1e'], [0, 2, 1, 4, '#c9a44a'], [5, 2, 8, 3, '#6b4423'], [5, 5, 2, 1, '#5a3a1e'], [13, 3, 38, 2, '#6b4423'],   // 火槍 1.4 m：槍托、槍身、槍管、槍機、扳機護弓、銅箍、通條
    [11, 2, 53, 1, '#3b3d42'], [22, 1, 42, 1, '#5d6168'], [10, 1, 4, 2, '#9aa0a8'], [12, 5, 4, 1, '#c9a44a'], [48, 3, 2, 2, '#c9a44a'], [16, 5, 30, 1, '#3a2414']] },
  sword: { w: 40, h: 5, pv: [4, 2], r: [[0, 1, 2, 3, '#c9a44a'], [2, 1, 4, 3, '#2b1d12'], [6, 0, 2, 5, '#c9a44a'], [8, 1, 29, 2, '#c3cad1'], [8, 1, 29, 1, '#eef2f5'], [37, 2, 2, 1, '#c3cad1']] },   // 劍 0.87 m
  carry: { w: 14, h: 22, pv: [7, 15], r: [[1, 9, 12, 13, '#7a5230'], [3, 9, 2, 13, '#946a40'], [1, 12, 12, 1, '#4a2e17'], [1, 19, 12, 1, '#4a2e17'], [0, 8, 14, 2, '#5a3a1e'],   // 藥筒（裝一份火藥的木筒）＋上面一顆彈丸
    [5, 0, 4, 1, '#232428'], [4, 1, 6, 1, '#232428'], [3, 2, 8, 4, '#232428'], [4, 6, 6, 1, '#232428'], [5, 7, 4, 1, '#232428'], [5, 2, 2, 1, '#6a6d73']] },
  rammer: { w: 100, h: 4, pv: [40, 2], r: [[5, 1, 89, 2, '#9a7a4c'], [94, 0, 6, 4, '#4a3a2a'], [0, 0, 5, 4, '#d8cfb8']] },   // 推彈桿 2.2 m（一頭推彈、一頭海綿）
  plank: { w: 30, h: 10, pv: [12, 9], r: [[0, 7, 30, 3, '#a0743f'], [0, 7, 30, 1, '#c08f55'], [2, 4, 27, 3, '#8a6033'], [2, 4, 27, 1, '#a87a45'], [1, 1, 28, 3, '#b3824a'], [1, 1, 28, 1, '#cf9f62'],   // 木匠抱的木材：三塊疊起來的木板 0.65 m（Tim 2026-10-17：「手上要拿木材(跟拿砲彈一樣) 用點陣圖」）
    [0, 7, 1, 3, '#6e4a24'], [29, 7, 1, 3, '#6e4a24'], [2, 4, 1, 3, '#5e3f1f'], [28, 4, 1, 3, '#5e3f1f'], [1, 1, 1, 3, '#7a5228'], [28, 1, 1, 3, '#7a5228'], [8, 8, 3, 1, '#7d5530'], [19, 2, 4, 1, '#8f6538'], [14, 5, 2, 1, '#6a4626']] }
};
function itemAtlas() {
  var W = 0, H = 0, k, x = 0;
  for (k in ITEM_DEF) { W += ITEM_DEF[k].w + 2; H = Math.max(H, ITEM_DEF[k].h); }
  var c = document.createElement('canvas'); c.width = W; c.height = H; var g = c.getContext('2d');
  for (k in ITEM_DEF) {
    var d = ITEM_DEF[k], x0 = x;
    d.r.forEach(function (r) { g.fillStyle = r[4]; g.fillRect(x0 + r[0], r[1], r[2], r[3]); });
    ITEM_UV[k] = [x0 / W, 0, (x0 + d.w) / W, d.h / H];                               // 跟人的格子同一個排法：[左 u, 上 v, 右 u, 下 v]
    x += d.w + 2;
  }
  var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);   // 點陣：最近點，不糊（不做 mipmap：細的槍在遠處不會被平均掉）
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
/** 這個人手上拿什麼：{ id, hx, hy（手：往前、往上，身高的比例）, a（道具的角度：朝前 0、往上為正）}；沒有 ⇒ null。 */
function heldItem(sh, c, f) {
  if (c.st !== 0) return null;                                                      // 受傷、陣亡、墜落 ⇒ 手上的東西掉了
  if (c.role === ROLE.POWDER) return c.cart > 0 ? { id: 'carry', hx: 0.17, hy: 0.52, a: 0 } : null;
  if (c.role === ROLE.CARPENTER) return c.wood > 0 ? { id: 'plank', hx: 0.14, hy: 0.5, a: 0 } : null;   // 木匠：身上還有木材就抱著（46_carpenter.js）
  if (c.role === ROLE.MARINE || c.role === ROLE.TOP) {                              // 開槍前一秒舉槍瞄準、開完 0.4 秒放下（沙盒的敵艦、降旗、沉了不開槍）
    var aim = (c.fireT > 0 || c.shotT < 1) && !sh.struck && !sh.sunk && (modeRule('othersAct') || sh.i === PLAYER_I);
    return aim ? { id: 'musket', hx: 0.04, hy: 0.78, a: 0.04 } : null;
  }
  if (c.role === ROLE.OFFICER) return sh.salvoT && SIMT - sh.salvoT < 1.2 ? { id: 'sword', hx: 0.12, hy: 0.86, a: 1.05 } : null;   // 齊射：舉劍
  if (c.role === ROLE.GUN && c.rammer && (f === FR.WORK_A || f === FR.WORK_B)) {      // 裝填：推彈桿一推一收（跟裝填姿勢同一個節奏）
    var w = 0.5 + 0.5 * Math.sin(c.t * 6.2832 * 1.1); return { id: 'rammer', hx: 0.06 + 0.16 * w, hy: 0.5, a: -0.06 };
  }
  return null;
}
/** 這個人現在在做什麼（FR）：單圖時決定程式動作，8 欄時也是選哪一格。 */
function crewFrame(sh, c) {
  if (c.st === 5) return c.swim && c.swim.dead ? FR.DEAD : Math.floor(c.t * 1.6) & 1 ? FR.RUN_A : FR.RUN_B;   // 在水裡：划水（43_swim.js）
  if (c.st === 2 || c.st === 4) return c.st === 4 ? FR.RUN_A : FR.DEAD;
  if (c.st === 1) return FR.WOUNDED;
  var ph = Math.floor(c.t * 2.5) & 1;
  if (c.walk || c.moving) return ph ? FR.RUN_A : FR.RUN_B;
  if (c.role === ROLE.POWDER && c.pm && c.pm.st === 'fill') return ph ? FR.WORK_A : FR.WORK_B;   // 在取用點拿火藥與彈藥
  if (c.role === ROLE.GUN && c.gun) {
    if (SIMT - (c.gun.firedAt || -9) < 0.7) return FR.FIRE;
    if (c.gun.reload > 0 && c.gun.manned >= c.gun.crewMin) return ph ? FR.WORK_A : FR.WORK_B;
    return FR.IDLE;
  }
  if (c.role === ROLE.MARINE || c.role === ROLE.TOP) return c.fireT > 0 && !sh.struck && !sh.sunk ? FR.FIRE : c.role === ROLE.TOP ? (Math.floor(c.t * 0.7) & 1 ? FR.WORK_B : FR.IDLE) : FR.IDLE;
  if (c.role === ROLE.OFFICER) return sh.salvoT && SIMT - sh.salvoT < 1.2 ? FR.FIRE : FR.IDLE;
  if (c.role === ROLE.HELM) return FR.WORK_B;
  return FR.IDLE;
}
/** 傷員的動（Tim 2026-10-18：「讓受傷倒地的水手 稍微搖晃一下(不然跟死亡很像) 參考rimworld的演出」）：只給畫面、不碰 rnd() ⇒ { lean, bob, sy } 疊在姿勢上。
 *  · 喘：身體一直慢慢起伏（sy ±0.03，約 2.6 秒一次）。
 *  · 掙扎：每 WOUND_P 秒一下 —— 前 WOUND_B 秒快速左右扭（±0.16 弧度、越來越小）＋往上撐一點；其他時間只是喘。
 *  節奏從倒下那一刻（c.t 歸零）算 ⇒ 每個人自然錯開；躺在病床上、等人來搬的都一樣（被扛著的 crewFrame 照走路的姿勢、不走這裡）。 */
var WOUND_P = 2.4, WOUND_B = 0.5;
function woundWiggle(c) {
  var t = c.t || 0, tt = t % WOUND_P, b = tt < WOUND_B ? 1 - tt / WOUND_B : 0;
  return { lean: 0.03 * Math.sin(t * 2.4) + b * 0.16 * Math.sin(tt * 30), bob: b * 0.06 * Math.abs(Math.sin(tt * 15)), sy: 0.03 * Math.sin(t * 2.4) };
}
/** 程式動作：lean（往面向的那邊傾，弧度；負 ＝ 往後仰）、bob（整個人上下，公尺）、sx／sy（寬、高的倍率）。
 *  c.t：活著的人是自己的時鐘（開局給了亂數相位，大家不會同步晃）；受傷、陣亡、墜落那一刻歸零 ⇒ 也拿來算閃紅。
 *  ⛔ 只管畫：不碰 rnd()、不回寫模擬。 */
function crewPose(sh, c, f) {
  var t = c.t, P2 = 6.2832, k = { lean: 0, bob: 0, sx: 1, sy: 1 };
  if (c.st === 4) { k.lean = t * 7; return k; }                                       // 墜落：翻滾
  if (c.st === 5) { k.lean = c.swim && c.swim.dead ? -0.9 : 0.22 + 0.06 * Math.sin(t * 5); return k; }   // 在水裡：往前趴著划；溺水往後仰
  if (f === FR.DEAD) {                                                                // 往後倒、躺平（抬一點 ⇒ 身體不陷進甲板）
    var d = Math.min(1, t / 0.35), d2 = d * d;
    if (c.fromW) { k.lean = -0.18 + (-1.5708 + 0.18) * d2; k.sy = 0.7 + 0.3 * d; k.sx = 1.06 - 0.06 * d; k.bob = 0.18 * d; return k; }   // 受傷跪著的人：從跪姿倒下
    k.lean = -1.5708 * d2; k.bob = 0.18 * d; return k;
  }
  if (f === FR.WOUNDED) { var wg = woundWiggle(c); k.sy = 0.7 + wg.sy; k.sx = 1.06; k.lean = -0.18 + wg.lean; k.bob = wg.bob; return k; }   // 跪下、喘、隔一陣掙扎一下（woundWiggle；倒下時從這個姿勢接，見上面 fromW）
  if (f === FR.RUN_A || f === FR.RUN_B) {                                             // 跑：彈跳、前傾、落地壓扁
    var r = Math.abs(Math.sin(t * P2 * 2.2)); k.bob = 0.09 * r; k.lean = 0.16 + 0.05 * Math.sin(t * P2 * 2.2); k.sy = 0.94 + 0.06 * r; k.sx = 1.04 - 0.04 * r; return k;
  }
  if (f === FR.FIRE) {                                                                 // 開砲／開槍／揮劍：一下後座往後仰、壓扁，慢慢回來
    var since = c.role === ROLE.GUN && c.gun ? SIMT - (c.gun.firedAt || -9) : c.role === ROLE.OFFICER ? SIMT - (sh.salvoT || -9) : 0.4 - c.fireT;
    var e = Math.exp(-Math.max(0, since) * 6);
    if (c.role === ROLE.OFFICER) { k.lean = -0.1 * e; k.sy = 1 + 0.08 * e; return k; }    // 軍官：挺直、往上拉
    k.lean = -0.28 * e; k.sy = 1 - 0.12 * e; k.sx = 1 + 0.08 * e; return k;
  }
  if (f === FR.WORK_A || f === FR.WORK_B) {                                            // 裝填：有節奏地前傾下壓（推彈、拉砲索）
    var w = 0.5 + 0.5 * Math.sin(t * P2 * 1.1); k.lean = 0.12 + 0.28 * w; k.sy = 1 - 0.1 * w; k.sx = 1 + 0.05 * w; k.bob = -0.04 * w;
    if (c.role === ROLE.HELM) { k.lean = 0.06 * Math.sin(t * 0.8); k.sy = 1; k.sx = 1; k.bob = 0; }          // 舵手：跟著舵輪輕晃
    if (c.role === ROLE.TOP) { k.lean = 0.1 * Math.sin(t * 1.3); k.sy = 1; k.sx = 1; k.bob = 0; }            // 桅頂：跟著桅晃
    return k;
  }
  k.sy = 1 + 0.022 * Math.sin(t * P2 * 0.32); k.lean = 0.035 * Math.sin(t * 0.9);   // 待命：呼吸、輕晃
  if (c.role === ROLE.TOP) k.lean = 0.09 * Math.sin(t * 1.3);
  return k;
}
var CREW_H = 2.1;                                  // 人物高（公尺）：1.75 → 2.1（Tim 2026-10-12：放大 1.2 倍，遠一點也看得清）
function drawCrew() {
  var n = 0, ni = 0, fw = norm([CAM.look[0] - CAM.eye[0], 0, CAM.look[2] - CAM.eye[2]]), right = [-fw[2], 0, fw[0]], frames = CREW_COLS > 1;
  SHIPS.forEach(function (sh) {
    var gone = sh.sink > 40;                           // 沉了：船上的不畫，在水裡的照畫（43_swim.js）
    if (gone && !sh.swims) return;
    var team = crewTeam(sh), faceW = M4.dir(sh.M, 0, 1, 0);
    sh.crew.forEach(function (c, ci) {
      if (c.st === 3 || n >= BBMAX || (gone && c.st !== 5) || cutHides(sh, c)) return;             // cutHides：剖面、隱藏甲板拿掉的那一邊（74_cutaway.js）
      if (FP.on && fpHide(sh, c)) return;                                                          // 第一人稱：自己、貼在臉前的人不畫（81_fps.js；⛔ 畫了 ⇒ 鏡頭在看板圖裡面）
      var art = c.art !== undefined && c.art < CREW_ROWS ? c.art : c.role;   // 船長那一列沒有 ⇒ 用職位那一列
      var w = c.st === 4 || c.st === 5 ? c.fw : M4.pt(sh.M, c.pos[0], c.pos[1], c.pos[2]), f = crewFrame(sh, c);
      var wt = c.walk ? (c.walk.w ? c.walk.w[c.walk.k] : c.walk.to) : c.mway && c.moving ? c.mway.w[c.mway.k] : c.hand && c.moving ? c.hand.to : null;   // 要去的那一點（預備水手：照路走、爬梯子，42_hands.js）
      var fd = c.st === 5 && (c.fv[0] || c.fv[2]) ? [c.fv[0], 0, c.fv[2]] : wt ? M4.dir(sh.M, wt[0] - c.pos[0], wt[1] - c.pos[1], 0) : mul(faceW, c.face), flip = dot(fd, right) < 0;   // 在水裡：面向游的方向（世界座標）
      var col = frames ? f : 0, u0 = col / CREW_COLS / 2, u1 = (col + 1) / CREW_COLS / 2, v0 = art / CREW_ROWS, v1 = (art + 1) / CREW_ROWS, k = n * BBS, h = CREW_H;   // 左半張是底圖（右半張遮罩）
      var ps = crewPose(sh, c, f), amp = frames ? 0.35 : 1;                            // 8 欄逐格：姿勢在圖裡，程式只疊輕的一層（不再躺、不再跪）
      if (frames && (f === FR.DEAD || f === FR.WOUNDED) && c.st !== 4) { var wg = f === FR.WOUNDED ? woundWiggle(c) : null; ps = wg ? { lean: wg.lean / amp, bob: wg.bob / amp, sx: 1, sy: 1 + wg.sy / amp } : { lean: 0, bob: 0, sx: 1, sy: 1 }; }   // 8 欄逐格：跪姿在圖裡，傷員照樣喘、掙扎（÷ amp ⇒ 跟單圖一樣大）
      var lean = ps.lean * (c.st === 4 ? 1 : amp), sy = 1 + (ps.sy - 1) * amp, sx = 1 + (ps.sx - 1) * amp;
      var flash = Math.max(c.st === 1 || c.st === 2 || c.st === 4 ? Math.max(0, 1 - c.t / 0.4) : 0, c.hitT > 0 ? c.hitT / 0.4 : 0);   // 被打中那一下閃紅（倒下：c.t 在那一刻歸零；沒倒下：hitT）
      BB[k] = w[0]; BB[k + 1] = w[1]; BB[k + 2] = w[2]; BB[k + 3] = h * sy;
      BB[k + 4] = flip ? u1 : u0; BB[k + 5] = v0; BB[k + 6] = flip ? u0 : u1; BB[k + 7] = v1;
      BB[k + 8] = h * CELL_W / CELL_H * sx; BB[k + 9] = (c.st === 1 ? 0.85 : 1) * (c.st === 4 || c.st === 5 ? -1 : 1); BB[k + 10] = flip ? lean : -lean; BB[k + 11] = ps.bob * amp;   // 往面向的那邊傾：面右 ⇒ 順時針
      BB[k + 12] = flash; BB[k + 13] = 0; BB[k + 14] = 0; BB[k + 15] = 0;
      BB[k + 16] = team; BB[k + 17] = crewHair(sh, c, ci); BB[k + 18] = 0; BB[k + 19] = 0;
      if (c.st === 2 && f === FR.DEAD && !frames) {                                // 倒下：躺向固定的方向（不跟著鏡頭轉），見 bbSetup
        if (!c.fallD) { var fa = hash3(c.home[0] * 4 | 0, c.home[1] * 4 | 0, c.home[2] | 0) * 6.2832; c.fallD = [Math.cos(fa), Math.sin(fa)]; }   // 只給畫用：照站位的雜湊挑一個方向（不碰 rnd()）
        var dw = norm(M4.dir(sh.M, c.fallD[0], c.fallD[1], 0));
        BB[k + 4] = u0; BB[k + 6] = u1; BB[k + 10] = -lean; BB[k + 13] = dw[0]; BB[k + 14] = dw[1]; BB[k + 15] = dw[2];   // 倒下了幾度 ＝ −lean（往後倒是負的）
      }
      n++;
      var it = c.st === 0 && ni < ITMAX ? heldItem(sh, c, f) : null;
      if (it) {                                                                       // 手持物：在「朝右」的座標裡算（往前 x、往上 y、逆時針為正），朝左再鏡射
        var d = ITEM_DEF[it.id], uv = ITEM_UV[it.id], fh = h * FIG_K * (art === ROLE.POWDER ? 0.75 : 1), iw = d.w / ITEM_PPM, ih = d.h / ITEM_PPM;
        var pqx = (d.pv[0] + 0.5) / ITEM_PPM - iw / 2, pqy = ih - (d.pv[1] + 0.5) / ITEM_PPM;   // 握的地方在貼圖裡的位置（貼圖的轉軸是底邊中間）
        var be = -lean, cb = Math.cos(be), sb = Math.sin(be), hx = it.hx * fh * sx, hy = it.hy * fh * sy;   // 人往前傾 lean ⇒ 朝右時順時針
        var Hx = cb * hx - sb * hy, Hy = sb * hx + cb * hy + ps.bob * amp, al = it.a + be, ca = Math.cos(al), sa = Math.sin(al);
        var Bx = Hx - (ca * pqx - sa * pqy), By = Hy - (sa * pqx + ca * pqy), bx = flip ? -Bx : Bx, q = ni * BBS;
        ITB[q] = w[0] + right[0] * bx - fw[0] * 0.06; ITB[q + 1] = w[1] + By; ITB[q + 2] = w[2] + right[2] * bx - fw[2] * 0.06; ITB[q + 3] = ih;
        ITB[q + 4] = flip ? uv[2] : uv[0]; ITB[q + 5] = uv[1]; ITB[q + 6] = flip ? uv[0] : uv[2]; ITB[q + 7] = uv[3];
        ITB[q + 8] = iw; ITB[q + 9] = 1; ITB[q + 10] = flip ? -al : al; ITB[q + 11] = 0;
        ITB[q + 12] = flash; ITB[q + 13] = 0; ITB[q + 14] = 0; ITB[q + 15] = 0; ITB[q + 16] = 0; ITB[q + 17] = 0; ITB[q + 18] = 0; ITB[q + 19] = 0; ni++;
      }
    });
  });
  if (!n) return;
  gl.useProgram(P.bb.prog); setCommon(P.bb); gl.uniform3fv(P.bb.u.uRight, right);
  gl.uniform1f(P.bb.u.uMask, 1); gl.uniform3fv(P.bb.u.uTeamC, TEAM_U); gl.uniform3fv(P.bb.u.uHairC, HAIR_U);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, CREW_TEX); gl.uniform1i(P.bb.u.uTex, 0);
  gl.bindVertexArray(BBVAO); gl.bindBuffer(gl.ARRAY_BUFFER, BBBUF); gl.bufferSubData(gl.ARRAY_BUFFER, 0, BB, 0, n * BBS);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n); gl.bindVertexArray(null);
  if (ni && ITEM_TEX) {
    gl.uniform1f(P.bb.u.uMask, 0); gl.bindTexture(gl.TEXTURE_2D, ITEM_TEX); gl.bindVertexArray(ITVAO); gl.bindBuffer(gl.ARRAY_BUFFER, ITBUF); gl.bufferSubData(gl.ARRAY_BUFFER, 0, ITB, 0, ni * BBS);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, ni); gl.bindVertexArray(null);
  }
  ITEMS_N = ni;
}
var ITEMS_N = 0;                                   // 讀數：上一格畫了幾件手持物

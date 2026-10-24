// ───────────────────────── 城鎮（TASK-0740；只給人看） ─────────────────────────
// Blocksail 的城鎮規劃（格式 Blocksail docs/TOWN_BUILD.md §5、src/MAP_CHUNK.md §8）⇒ 整地、清樹、擺建築與城牆、路著色。第一版只給人看（Tim 2026-10-19 第 10 節第 5 題：
//   砲彈穿過去、船穿過去、不改戰局）⇒ ⛔ 不碰 C.h（模擬查的那一份）：整地只寫進給畫面的 C.hv（地形網格、樹照它），船、擱淺、砲彈打地面照舊讀 C.h
//   ⇒ 城鎮什麼時候到（檔案、外面那一頁生成要好幾秒）都跟戰局無關；無頭（?demo&headless）整段不做。?towns=0 ⇒ 不載城。
// 來源：area.towns（有城的 id 清單）⇒ 檔案 maps/<海域>/towns.js（BSMAP.town，一座一筆）或 ?map=@host 跟外面那一頁要（{ bsmap: 'need', what: 'towns' } ⇒ { bsmap: 'towns', towns }）。
//   規劃的座標以市中心為原點（往東 x、往南 y，公尺）；海域座標 ＝ (ox ＋ kx·x, oy ＋ y)（匯出時算好，Blocksail world/town_export.js）。
// 整地（townHv；每塊海圖塊第一次要畫的時候算、城到了再重算）：路（照 z，路寬一半 ＋ 一個取樣點內整平）先、地塊的 grade（照 h，外擴 TOWN_LOT_PAD）後，
//   外面照邊坡 1 : bank 接回原地形（|高差| ≤ 距離 ÷ bank，路最多接 TOWN_GRADE_REACH 公尺）；只改陸上的點（原本 ≤ 0 的不動 ⇒ 岸線不變）。
// 樹（townTreesSet）：模型標了樹（Blocksail townmodels.py 的 m.trees：雕刻的子作品 meta kind=tree）⇒ 實例建好時照實例的位置換到世界、記在 T.trees ⇒ 63_trees.js 照它種遊戲自己生成的樹（風格跟島上的樹一樣）。
//   模型雕好的田（m.fields：子作品 meta kind=field；地標兼任農莊，TASK-0862）⇒ 同一支換到世界、記在 T.lmf ⇒ 63_trees.js treeFieldPut 照地塊帶的作物種。
//   下沉的地塊（grade 帶 pit；Blocksail 特殊建築表的 sink，例：露天蓄水池，TASK-0748）：只把地塊裡面、離邊 ≥ pit 公尺的點整到 h（地面下），外面不接邊坡、「地塊頂著」那一輪跳過
//   ⇒ 挖下去的那一圈斜面落在離邊 pit ＋ 一個取樣點之內 ＝ 模型的池牆裡（牆厚要 ≥ pit ＋ 4 m）。
// 地基（Tim 2026-10-20：「是否可以協助處理 房屋地基可能跟地面重疊導致的閃爍問題」「可以參考其他城建遊戲的作法」—— Cities: Skylines、Anno 那一類：
//   腳下整平、地基是往下的裙邊、地面歸房子或地形其中一個，不留兩片同高的面）—— 地塊上歸石基（頂面 ＝ 石地坪，h − 0.01），地形一律壓到它底下：
//   · 地塊「頂著」：整完地之後再一輪，地塊外擴一格地形網格的對角線（那一塊的取樣間距 × √2：細 4 m、外圈的中等塊 16 m；第一版上限 8 m ⇒ 2 km 外中等塊的房子還有 0.9% 的點離石面不到 10 cm）以內的點一律不准高過那一塊的 h − TOWN_LOT_SINK（只往下壓）、往下取整到分米
//     ⇒ 網格的三角形整片在石地坪下面 ≥ 19 cm（以前地面在 h、石面在 h − 0.01，只差 1 cm，地面又被四捨五入到 ±5 cm ⇒ 院子一片石、一片草搶深度＝Tim 的截圖）；
//     斜面不會從房子、院子裡冒出來（整平只外擴 2 m、取樣 4 m ⇒ 跨地塊邊那一格一角在坡上）。
//     ⛔ 不能把「整平」的外擴放大：坡上相鄰兩塊 h 不同，整平範圍互相蓋到，後算的那一塊把鄰居的地抬起來（試過外擴 10 m ⇒ 高過房子底的 1/3、最多 3.2 m，房子被埋）。被壓低的地方（高的那一塊靠矮鄰居那一邊）由石基的裙邊擋住。
//   · ⛔ 石基的頂面要畫：28ab013 拿掉過頂面（想讓院子歸地形），地勢比 h 低的地塊就變成「一圈石牆圍著一個草坑」（Tim 2026-10-20「等等 石面好像消失了」）⇒ 畫回來，改成地形讓位。
// 清樹（townClr）：規劃的 clear（有建築的地塊、路、城牆、碼頭各外擴 2 m；空建地不清）每 TOWN_CLR_G 公尺一格的遮罩 ⇒ 63_trees.js 擺樹時跳過。
// 建築（模型在 Blocksail 的 world/townkit/：tools/townmodels.py 匯入時算好近、中、遠三份＋屋頂殼的資料；要用到的才跟外面要，見下面 townKit 那一段）：照用途挑（同用途的變化照 地塊 id 的雜湊挑 ⇒ 每次一樣；特殊建築的用途就是那一種 ⇒ 只有它的模型挑得到，例：galata-tower）。
//   模型 → 世界（BUILDING_SPEC §1）：a ＝ mx·mpv − 模型寬/2、b ＝ my·mpv − 模型深/2、θ ＝ lot.rot ⇒ 往東 ＝ cx ＋ a·sinθ − b·cosθ、往南 ＝ cy − a·cosθ − b·sinθ、高 ＝ h ＋ mz·mpv；
//   模型比地塊小（金斯敦的地塊照 Lilly 的棋盤）⇒ 臨路那一邊對齊、沿路置中：cx,cy ＝ at ＋ (d − 模型深)/2 ·(cosθ, sinθ)。底下墊一塊石基（townPlinth：到四角最低的地面再下 0.3 m）。
//   城牆（TOWN_BUILD §4）：照牆的 kit 挑一套模組（wall1～wall3 ＝ 一～三級、roman-land-inner／roman-land-outer／roman-sea ＝ 東羅馬城牆 1453；BUILDING_SPEC §6、§6.1）；
//   沒寫 kit（生成的牆）⇒ 照規模 × 繁榮度算等級（townWallLv，TOWN_BUILD §4：0 沒有牆、1 木柵 wall1、2 土堤＋木柵 wall2、3 石牆 wall3、4 稜堡）；
//   繁榮度 0～1 一座城一個（TOWNS.prosp[城 id]，沒有 ⇒ 網址 ?prosp=、再 TOWN_PROSP_DEF；__game.townProsp(v, id) 改了整套換）—— 存檔裡那一份（歷來最高）之後由外面那一頁給；
//   那一級沒有模型 ⇒ 往下找有的那一級（stat.skip 記 'wall:<套>'）；寫了 kit 但沒有那一套 ⇒ 一級（stat.skip 記 'wall:<kit>'）。換等級只換模組 ⇒ 路線、門、塔的位置不動。
//   門、塔照位置（一套有好幾型塔 ⇒ 照順序輪流：東羅馬外牆方塔、新月塔交替）、兩頭收尾，中間照斷面沿曲線一節一節拉（節數 round(L / len)、每節沿 x 縮放補滿），−y（牆外）朝規劃寫的 out 那一側（Blocksail 算好：手寫 ＞ 照中心城區 ＞ 朝最近的城區邊界；舊的規劃沒有 ⇒ 朝離城心遠的那一邊）；水門（gate.kind water，棧橋穿牆）照城門擺。
//   接縫（Tim 2026-10-20：「目前城市地圖的城牆 連接處會也接縫 是否可以參考其他遊戲的作法處理例如圖二的世紀帝國4城牆」）：斷面接成一條折線（每節是兩站之間的弦、相鄰兩節共用一站，路線的頂點一定是站）
//   ⇒ 站上照兩節的角平分面斜接（著色器照 aJ 把那一節沿 x 切成梯形）、接到門／塔／轉角／收尾的那一頭照部件的端面切齊；高度照兩站的地面線性接（坡上順著走，不再一節一階），
//   牆基（模型 z 0 那一層）往下延到腳下最低的地面；轉得急（≥ TOWN_WALL_CORNER）的頂點要有部件蓋著（同世紀帝國轉角的塔）：附近有塔 ⇒ 塔挪到轉角上（stat.snapped），
//   沒有 ⇒ 擺一件轉角（那一套的 joint；沒有 ⇒ 第一型塔；stat.corners）。會改到手擺的塔（君士坦丁堡新擺 6、加拉塔新擺 7〔22 → 29 座〕、挪 9 座）⇒ Tim 2026-10-20 選保留。
//   城門那一筆帶 model ⇒ 那一門改用 '<套>-gate-<model>'（kaguya 2026-10-23：君士坦丁堡的金門 'golden'，連兩座大理石塔 70 m 寬）；這種自帶塔的門蓋到的塔不擺（stat.towerInGate）。
// 遠近四級（照樹那一套；距離 TOWN_LOD、TOWN_FAR）：近 原模型、中 低模（0.4 m）、遠 貼圖（八個方向先拍好，取最接近視線的那一張）、更遠 屋頂殼（每 TOWN_SHELL_G 公尺一格的屋頂高與顏色）；
//   每一級的交接帶兩邊都畫、用同一個抖動互補（同一個像素只有一個）。看得到的實例照視錐剔、鏡頭動了 TOWN_REBIN 公尺才重新分組（townBin）。
// 布旗（模型帶 flags 的，例：加拉塔塔頂的熱那亞旗）：一塊布、照風飄，只給人看 ⇒ 見下面「布旗」那一段。
// 路：共用 2 m 格的距離場把整個路網併成一張面（圓端、轉角與路口沒有重疊面）；各點照畫面地形順坡，抬高 12 cm、外緣補薄側面。規劃與模擬高度不變。
// 地標（Tim 2026-10-20：「大型建築應該要更遠可見(地標) 且顯示細節要比一般建築高(在更遠的距離上顯示更高細節) 例如聖索菲亞大教堂 加拉塔石塔等」）：
//   每棟一個倍率 lk ＝ 長、寬、高最大的那一邊 ÷ TOWN_LM[0]（限 1..TOWN_LM[1]；城牆一律 1）⇒ 四級的距離、交接帶都乘 lk（著色器用 距離 ÷ lk 對同一組門檻）；
//   lk > 1 的不進屋頂殼，最遠一級是它自己的貼圖（到 TOWN_FAR × lk）。一般房子 ≤ 24 m ⇒ lk 1，跟以前一位元不差。
var TOWN_LM = [24, 4];
// 附屬的田（TASK-0862；Blocksail world/annex.js）：一格幾公尺（＝ Blocksail BSW.TOWN_CELL，街道建築格）、土的兩個顏色（壟、溝）、溝寬幾成（沿行距）
var TOWN_ANNEX_CELL = 4, TOWN_SOIL = [[0.44, 0.34, 0.23], [0.33, 0.25, 0.17]], TOWN_FURROW = 0.4;
var TOWN_LOD = [160, 800], TOWN_FAR = [2400, 3000], TOWN_BAND = [24, 60, 300], TOWN_REBIN = 8, TOWN_SHELL_G = 32, TOWN_GRADE_REACH = 12, TOWN_LOT_PAD = 2, TOWN_LOT_CELL = 32, TOWN_LOT_SINK = 0.2, TOWN_CLR_G = 2, TOWN_ROAD_LIFT = 0.12, TOWN_GROUND_VIEW = 1600;
var TOWN_MESH_MS = 8;                                                    // 模型網格化每段最多幾 ms 就讓出一次（townMesh；跟地球儀同一條主執行緒）
var TOWN_WALL_CORNER = 30, TOWN_WALL_KMAX = 1;                         // 城牆：轉角件從轉幾度起擺；斜接最多切多斜（tan，1 ＝ 轉 90° 的角平分）
var TOWN_WALL_JX_TOL = 1, TOWN_WALL_JX_SINK = 0.7;                     // 牆接牆（townWallJx）：牆的一頭離別道牆幾公尺內算接上；接進來的牆停在接點那件部件裡多深（部件半長的幾成）
var TOWN_WALL_JOIN_IN = 0.5;                                          // 牆接建築：牆兩側的邊都進了建築的外框之後再多伸幾公尺（townWall joinIn）
var TOWN_SLAB_KMAX = 2;                                                 // 碼頭、棧橋的板：轉角斜接最多拉長幾倍（2 ＝ 轉 120°；再急就在轉角那一點變窄）
var TOWNS = { on: Q.get('towns') !== '0', prosp: {}, list: [],pend: [], ver: 0, want: 0, err: null, kit: null, kitP: null, idx: null, kitHas: null, kitRedo: false, kitBusy: false, mwait: null, prog: null, progJ: null, dirty: true, eye: null, sig: '', buf: [], grp: null,
  stat: { towns: 0, lots: 0, inst: 0, walls: 0, corners: 0, snapped: 0, skip: {}, d0: 0, d1: 0, d2: 0, d3: 0, plinth: 0, tris: 0, binMs: 0, kitMs: 0, meshBaked: 0, meshLive: 0, meshCheck: null, gradeMs: 0, chunks: 0, regraded: 0, drawMs: 0 } };
var TOWN_J0 = [0, 0, 0, 0];                                             // 建築的 aJ（不斜接、不順坡、牆基不延）
var TOWN_USE_ALT = { commandant: ['house'], governor: ['townhall'],   // 那一套沒有那種模型 ⇒ 用哪一種代（BUILDING_SPEC §7：fr 沒有長官的屋子；carib 有）
  farm: ['house'], plantation: ['commandant', 'house'] };              // 農莊、種植園（Blocksail：開場的 TASK-0862、建築模式蓋的 TASK-0742；主建築還沒雕）⇒ 農舍借住宅、種植園主的大宅借長官宅（commandant 10 × 12）〔佔位〕
//   ⛔ 種植園不借倉庫：倉庫 12 × 16 放不進 16 × 12 的地塊（進深多 4 m、伸出地塊後緣壓到田）—— kaguya 2026-10-24 seq 28673 同意照這一份
var TOWN_PROSP_DEF = 0.5, TOWN_PROSP_CUT = [1 / 3, 2 / 3];               // 繁榮度沒給 ⇒ 中間；低於第一格算低、到第二格算高（TOWN_BUILD §4 的門檻〔佔位〕）
var TOWN_STYLE_DEF = 'fr';                                            // 索引裡沒寫 style 的模型算 fr（第一套，TASK-0757）；規劃沒帶退路 styles（舊的匯出）⇒ 城的 style、再 fr
var TOWN_COL = { main: [0.56, 0.47, 0.34], street: [0.62, 0.58, 0.50], track: [0.50, 0.42, 0.30], plaza: [0.70, 0.66, 0.58], quay: [0.58, 0.56, 0.52], mole: [0.52, 0.51, 0.47], pier: [0.45, 0.33, 0.22], post: [0.30, 0.22, 0.15] };
evOn('bedChunk', function (cx, cy) {
  TOWNS.dirty = true;
  if (!BED || !BED.A) return;
  if (TOWNS.rgq) delete TOWNS.rgq[bedKey(cx, cy)];                       // 排著等重新整地的那一塊已經重發了（新的一份、或 townRegrade 自己）⇒ 不再做一次
  var x = cx * BED.A.chunk, z = cy * BED.A.chunk, S = BED.A.chunk;
  TOWNS.list.forEach(function (T) { if (T.box[0] < x + S && T.box[2] > x && T.box[1] < z + S && T.box[3] > z) townGroundDirty(T, cx, cy); });   // 只重建讀過這一塊的那幾區（TASK-0817）
}, 0, true);

/** 字串 ⇒ [0, 1)（FNV-1a）：同用途好幾種變化照它挑。 */
function townHash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

// ── 收城（08_seabed.js：BSMAP.town、外面那一頁的 'towns'） ──
/** 海域有城（area.towns）⇒ 去要：檔案讀 maps/<海域>/towns.js、@host 跟外面那一頁要（townGot 收）。 */
function townWant() {
  if (!TOWNS.on || HEADLESS || !BED || !BED.A || !(BED.A.towns || []).length) return;
  TOWNS.want = BED.A.towns.length;
  if (BED.host) { BED.host.postMessage({ bsmap: 'need', what: 'towns' }, '*'); return; }
  TOWNS.pend = [];
  var dir = 'maps/' + BED.A.id + '/';
  bedScript(dir + 'towns.js').then(function () {
    return bedScript(dir + 'townkit/index.js').catch(function () {});   // 模型的索引（沒有 ⇒ 城照樣整地、清樹、鋪路，只是沒有建築；townKit 記 err）
  }).then(function () { var L = TOWNS.pend; TOWNS.pend = []; townGot(L, null, window.BSTOWNKIT); }, function (e) { TOWNS.err = e.message; console.warn('城鎮：' + e.message); });
}
/** 一批城鎮規劃到了（idx ＝ 模型的索引 BSTOWNKIT，見 townKit 上面）⇒ 換成海域／世界座標、要重算整地與清樹的塊重發 'bedChunk'（地形網格、樹照新的重建）、遠景重抽。 */
function townGot(L, err, idx) {
  if (err) { TOWNS.err = err; console.warn('城鎮：' + err); }
  if (idx && idx.models && !TOWNS.idx) TOWNS.idx = idx;
  if (!BED || !BED.A || !L || !L.length) return;
  var t0 = performance.now(), n0 = TOWNS.list.length;
  L.forEach(function (p) { if (p && p.format === 'blocksail-town' && !TOWNS.list.some(function (T) { return T.id === p.id; })) TOWNS.list.push(townPrep(p)); });
  if (TOWNS.list.length === n0) return;
  var NEW = TOWNS.list.slice(n0);                                       // 新來的城：只有跟它們疊到的塊要重新整地（townHv 照 T.v 判斷舊的整地還能不能用；TASK-0826）                                 // 都是已經有的（外面那一頁做好一座先送一座、最後再給整份）⇒ 不重建整地、網格、遠景
  var I = townIdx();                                                    // 新來的城要的模型解好的那一份沒有 ⇒ 丟掉重要（解到一半 ⇒ 解完再丟）
  if (I && TOWNS.kitHas && townNeed(I).some(function (nm) { return TOWNS.kitHas.indexOf(nm) < 0; })) townKitStale();
  TOWNS.ver++; TOWNS.dirty = true; TOWNS.stat.towns = TOWNS.list.length;
  NEW.forEach(function (T) { T.v = TOWNS.ver; });
  TOWNS.stat.prepMs = +(performance.now() - t0).toFixed(1);
  townRegradeFor(NEW);
}
/** 跟 L 裡的城疊到的塊重新整地、清樹（townGot 新來的城、townReplace 改過的城）。 */
function townRegradeFor(NEW) {
  Object.keys(Object.assign({}, BED.ch, BED.cm)).forEach(function (k) {   // 畫著的那一份（原精度或外圈的中等塊）：有畫面迴圈 ⇒ 排隊（townRegrade），不然照舊當場重發
    var C = bedShowC(k); if (!(C && townOver(C.cx, C.cy, NEW))) return;
    if (BED_SLICE) (TOWNS.rgq || (TOWNS.rgq = {}))[k] = 1; else evEmit('bedChunk', C.cx, C.cy, C);
  });
  Object.keys(BEDDRY.src).forEach(function (k) {                         // 遮罩記著、現在沒在畫的那幾塊（63_bed_gl.js bedDryRegrade）：同一個隊伍
    var C = BEDDRY.src[k]; if (bedShowC(k) || !(C && townOver(C.cx, C.cy, NEW))) return;
    if (BED_SLICE) (TOWNS.rgq || (TOWNS.rgq = {}))[k] = 1; else bedDryRegrade(k);
  });
  Object.keys(BEDFAR.g).forEach(function (k) {                          // 遠景塊：網格與樹冠殼是照舊的高度建的 ⇒ 丟掉、放回去重讀（63_bed_gl.js bedFarStep 照離旗艦遠近挑）
    if (bedShowC(k)) return;
    var c = k.split('_').map(Number); if (!townOver(c[0], c[1], NEW)) return;
    bedFarDrop(k);
    if (BEDFAR.todo) BEDFAR.todo.push([c[0], c[1], 1, 0]);
  });
}
// 建築模式改了一座城（87_townbuild.js：外面那一頁回的新規劃；TASK-0742）⇒ 換掉同一個 id 的那一座，只重建改到的範圍。
//   以前整座重來：舊的地面分區、實例、屋頂殼、旗子當場放掉 ⇒ 整座城閃掉一格；新舊兩份外框疊到的每一塊都重新整地；路面整座重算；
//   地面分區從零建（棧橋以外的區要等背景預算）⇒ 負載一高，路就整條不見好幾秒（Tim 2026-10-22「道路目前建造會是透明的」「看起來是道路有機會跑到地下(被地形吃掉)」；
//   量到：套用那一格 實例 0、地面分區 null、19 塊排隊重整，之後 13 區只有 2 區棧橋建好）。
//   ⇒ 現在（Tim「是否能避免重建全部網格(拆分成多份網格?)」）：
//   ① 舊規劃 vs 新規劃逐項比（townDiff：路照 id、地塊照 id、整地與清樹照內容）⇒ 改到的外框 D（含整地伸出去的範圍，同 townPrep 的外框）；
//      路、地塊、整地、清樹以外的東西變了 ⇒ 照舊整座重來。
//   ② 只排跟 D 疊到的塊重新整地；整地快取改成照「這一塊有沒有被改到」判斷（townNewer 看 T.edits），城框裡沒改到的塊照舊能用。
//   ③ 路變了 ⇒ 只把碰得到改到的那幾區的路送去算路面（townRoadSurface 同一支 Worker），那幾區換成新的那一份（Q.R）；其他區不動。
//      一區裡的三角形只跟離它 半寬 ＋ 4 m 以內的路有關 ⇒ 取「外框碰得到那幾區（外擴 半寬 ＋ 6 m）」的路，算出來跟整座重算逐點相同（?townfull=1 是對照組）。
//   ④ 舊的網格（實例、地面分區、屋頂殼、旗子、燈）留著畫，新的建好才換；改到的區每格至少建一區、不等背景預算（同棧橋）。
//   路面在 Worker 算的時候先不整地：整地與換區一起做 ⇒ 不會先看到挖好的路基、路還沒鋪上去。
var TOWN_FULL = Q.get('townfull') === '1';                              // ?townfull=1：照舊整座重來（增量重建的對照組）
var TOWN_DIFF_KEYS = ['walls', 'core', 'piers', 'quay', 'style', 'styles', 'ox', 'oy', 'kx', 'bank', 'tier', 'seed'];   // 這些變了 ⇒ 整座重來（建築模式不會改它們）
function townBoxAdd(b, c) { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[2]); b[3] = Math.max(b[3], c[3]); return b; }
function townBoxHit(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
/** 舊城 T0 ⇒ 新城 T1 改到哪裡：{ box（整地與實例，海域座標）, roads（路變了的外框；沒變 ⇒ null）}；TOWN_DIFF_KEYS 變了 ⇒ null。 */
function townDiff(T0, T1) {
  var a = T0.p, b = T1.p, E = T1.E, box = [1e9, 1e9, -1e9, -1e9], rb = null;
  if (TOWN_DIFF_KEYS.some(function (k) { return JSON.stringify(a[k]) !== JSON.stringify(b[k]); })) return null;
  function grow(B, q, r) { return townBoxAdd(B, [q[0] - r, q[1] - r, q[0] + r, q[1] + r]); }
  function byId(L) { var m = {}; (L || []).forEach(function (o) { m[o.id] = JSON.stringify(o); }); return m; }
  function changed(L0, L1, f) {                                          // 照 id：多的、少的、內容變了的 ⇒ f(那一份)
    var m0 = byId(L0), m1 = byId(L1);
    (L0 || []).forEach(function (o) { if (m1[o.id] !== m0[o.id]) f(o); });
    (L1 || []).forEach(function (o) { if (m0[o.id] !== m1[o.id]) f(o); });
  }
  function bag(L0, L1, f) {                                              // 沒有 id：照內容，只在一邊的 ⇒ f(那一份)
    var c = {}; (L0 || []).forEach(function (o) { var s = JSON.stringify(o); c[s] = (c[s] || 0) + 1; });
    (L1 || []).forEach(function (o) { var s = JSON.stringify(o); if (c[s]) c[s]--; else f(o); });
    (L0 || []).forEach(function (o) { var s = JSON.stringify(o); if (c[s] > 0) { c[s]--; f(o); } });
  }
  changed(a.roads, b.roads, function (r) {                               // 路：外框同 townPrep（半寬 ＋ 4 ＋ 整平伸出去的）
    rb = rb || [1e9, 1e9, -1e9, -1e9];
    r.path.forEach(function (q) { var e = E(q); grow(box, e, r.w / 2 + 4 + TOWN_GRADE_REACH); grow(rb, e, r.w / 2 + 6); });
  });
  changed(a.lots, b.lots, function (l) { grow(box, E(l.at), Math.hypot(l.w, l.d)); if (l.use === 'plaza') { rb = rb || [1e9, 1e9, -1e9, -1e9]; grow(rb, E(l.at), Math.hypot(l.w, l.d)); } });
  bag(a.grade, b.grade, function (g) { g.ring.forEach(function (q) { grow(box, E(q), TOWN_LOT_PAD + TOWN_LOT_CELL * 1.5 + 6); }); });
  var c0 = a.clear || {}, c1 = b.clear || {};
  bag(c0.rings, c1.rings, function (R) { R.forEach(function (q) { grow(box, E(q), 4); }); });
  bag(c0.paths, c1.paths, function (c) { c.path.forEach(function (q) { grow(box, E(q), c.w); }); });
  return { box: box, roads: rb };
}
/** 外框 B 碰到的地面分區（townGroundPrep 的 TOWN_GT_SZ 一區）：['x_z', …]。 */
function townTilesIn(B) {
  var S = TOWN_GT_SZ, out = [];
  if (!(B[0] <= B[2])) return out;
  for (var z = Math.floor(B[1] / S); z <= Math.floor(B[3] / S); z++) for (var x = Math.floor(B[0] / S); x <= Math.floor(B[2] / S); x++) out.push(x + '_' + z);
  return out;
}
function townReplace(p) {
  if (!BED || !BED.A || !p || p.format !== 'blocksail-town') return false;
  var i = -1; TOWNS.list.forEach(function (T, k) { if (T.id === p.id) i = k; });
  if (i < 0) { townGot([p]); return true; }
  var old = TOWNS.list[i], T = townPrep(p), D = TOWN_FULL || !old.gt || !old.roadSurface ? null : townDiff(old, T);
  if (D && old.pend) { townBoxAdd(D.box, old.pend.box); if (old.pend.roads) D.roads = townBoxAdd(D.roads || old.pend.roads.slice(), old.pend.roads); }   // 上一次改的路面還在算 ⇒ 一起算
  var I = townIdx();
  if (I && TOWNS.kitHas && townNeed(I).some(function (nm) { return TOWNS.kitHas.indexOf(nm) < 0; })) townKitStale();
  TOWNS.ver++; TOWNS.dirty = true; TOWNS.stat.replaced = (TOWNS.stat.replaced || 0) + 1;
  TOWNS.list[i] = T;
  if (!D) {                                                             // 整座重來（對照組、改了 TOWN_DIFF_KEYS、舊的那一份還沒建好）
    if (old.gt) Object.keys(old.gt).forEach(function (k) { var g = old.gt[k].g, gf = old.gt[k].gf; if (g) townGpuFree(g); if (gf) townGpuFree(gf); });
    if (old.lmg) townGpuFree(old.lmg);
    townFlagFree(old);
    if (old.shell) { gl.deleteVertexArray(old.shell.vao); gl.deleteBuffer(old.shell.vb); gl.deleteBuffer(old.shell.ib); }
    if (old.tl) { townLightPartFree(old.tl.S); townLightPartFree(old.tl.D); }
    T.v = TOWNS.ver; TOWNS.stat.edit = { full: true };
    townRegradeFor([old, T]);
    return true;
  }
  ['inst', 'gt', 'shell', 'flags', 'tl', 'trees', 'lmg', 'lmgSig', 'posts', 'roadSurface', 'v'].forEach(function (k) { T[k] = old[k]; });   // 舊的照畫
  if (!D.roads) T.folk = old.folk;
  if (!(D.box[0] <= D.box[2]) && !D.roads) { T.edits = old.edits; T.pend = old.pend; return true; }   // 沒有差（打開建築模式時 open 回的那一份）⇒ 只換規劃
  T.edits = (old.edits || []).concat([{ b: D.box, v: TOWNS.ver }]);
  var st = TOWNS.stat.edit = { full: false, box: D.box.map(function (v) { return Math.round(v); }), chunks: 0, tiles: 0, roads: 0, surfMs: null };
  function regrade() {
    var n0 = Object.keys(TOWNS.rgq || {}).length; townRegradeFor([{ box: D.box }]); st.chunks = Object.keys(TOWNS.rgq || {}).length - n0;
    townTilesIn(D.box).forEach(function (k) { if (T.gt[k]) T.gt[k].edit = true; });   // 改到的區：重建時不等背景預算（townDraw）
    T.instRedo = true;                                                  // 實例照新的規劃重建（建好之前舊的照畫）
  }
  if (!D.roads) { regrade(); return true; }
  var K = townTilesIn(D.roads), S = TOWN_GT_SZ, KB = K.map(function (k) { var c = k.split('_'); return [+c[0] * S, +c[1] * S, (+c[0] + 1) * S, (+c[1] + 1) * S]; });
  var sub = T.roads.filter(function (r) {                                // 碰得到那幾區的路（半寬 ＋ 4 m：節點最遠受多遠的路影響，見 townRoadGen；再多 2 m 一格）
    var m = r.w / 2 + 6, b = [1e9, 1e9, -1e9, -1e9]; r.P.forEach(function (q) { townBoxAdd(b, [q[0] - m, q[1] - m, q[0] + m, q[1] + m]); });
    return KB.some(function (kb) { return townBoxHit(b, kb); });
  });
  var pend = T.pend = { box: D.box, roads: D.roads }, t0 = performance.now();
  st.tiles = K.length; st.roads = sub.length;
  townRoadSurface(sub).then(function (R) {
    if (T.pend !== pend || TOWNS.list.indexOf(T) < 0) return;           // 又改了一次（新的那一份接手、外框併進去了）
    T.pend = null; st.surfMs = Math.round(performance.now() - t0);
    var tiles = {}; R.tiles.forEach(function (t) { tiles[t.x + '_' + t.z] = t; });
    K.forEach(function (k) {
      var c = k.split('_'), Q = T.gt[k] || (T.gt[k] = { k: k, cx: (+c[0] + 0.5) * S, cz: (+c[1] + 0.5) * S, tri: [], edge: [], plaza: [], stair: [], quay: [], pier: [], g: null, dirty: true, deps: {} });
      var t = tiles[k]; Q.R = R; Q.tri = t ? t.tri : []; Q.edge = t ? t.edge : [];
      Q.plaza = (T.p.lots || []).filter(function (l) { if (l.use !== 'plaza') return false; var e = T.E(l.at); return Math.floor(e[0] / S) + '_' + Math.floor(e[1] / S) === k; });
      Q.stair = (T.p.stairs || []).filter(function (q) { var e = T.E(q.path[0]); return Math.floor(e[0] / S) + '_' + Math.floor(e[1] / S) === k; });
      Q.dirty = true; Q.edit = true;
    });
    regrade();
  }, function (e) { TOWNS.err = '路面：' + e.message; console.warn(TOWNS.err); });
  return true;
}
// 規劃比地形晚到時的重新整地排隊（TASK-0819；Tim 2026-10-22「進入航海時 城市還沒載入 然後載入時會整個卡住很久」）：
//   townGot 以前在收到規劃的那一則訊息裡，把城範圍內畫著的每一塊都重發 'bedChunk' ⇒ 每一塊當場整地（townHv 20～60 ms，第一個接手的是 63_bed_gl.js bedDryPut）
//   ⇒ 君士坦丁堡規劃晚到（生成器改了、烘好的過期 ⇒ 現場算 26～37 s）時約 50 塊在同一則訊息裡做完：1.4 s、最長一格 2.1 s。
//   ⇒ 有畫面迴圈（BED_SLICE）⇒ 排進 TOWNS.rgq，每格照背景預算重發（至少一塊、離鏡頭近的先；排在擺樹前面 —— 城看得到的地面先對）；
//     快轉、無頭照舊當場重發（逐位元組照舊）。排著的那一塊先被正常的收塊重發了 ⇒ 上面的 bedChunk 監聽拿掉它。只影響畫面（整地是畫面的高度），模擬照舊。
function townRegrade() {
  var Q = TOWNS.rgq; if (!Q || !BED || !BED.A) return;
  var K = Object.keys(Q); if (!K.length) { TOWNS.rgq = null; return; }
  var S = BED.A.chunk, e = CAM.eye, n = 0;
  function d2(k) { var c = k.split('_'), x = (+c[0] + 0.5) * S - BED.ax - e[0], z = (+c[1] + 0.5) * S - BED.az - e[2]; return x * x + z * z; }
  K.map(function (k) { return [d2(k), k]; }).sort(function (a, b) { return a[0] - b[0]; }).some(function (q) {
    if (n && bedBusy()) return true;
    var k = q[1]; delete Q[k];
    var C = bedShowC(k), t0 = performance.now();
    if (C) evEmit('bedChunk', C.cx, C.cy, C);                           // 畫著的 ⇒ 重發（網格、樹、遮罩都照新的整地；⛔ 不再看 townOver：建築模式拿掉的路可能在城框外，那一塊也要放回去）
    else if (BEDDRY.src[k]) bedDryRegrade(k);                            // 沒在畫、遮罩還記著 ⇒ 只替遮罩重整
    else return false;                                                   // 窗換了、都不要了
    bedSpent(t0); n++; TOWNS.stat.regraded++;
    return false;
  });
}
/** 城 T 的範圍裡還有排著要重新整地的塊（townRegrade）⇒ 先別建實例（見 townDraw）。 */
function townRgWait(T) {
  var Q = TOWNS.rgq; if (!Q) return false;
  var S = BED.A.chunk;
  return Object.keys(Q).some(function (k) { var c = k.split('_'), x = +c[0] * S, z = +c[1] * S; return T.box[0] < x + S && T.box[2] > x && T.box[1] < z + S && T.box[3] > z; });
}
/** 塊 (cx, cy) 跟哪一座城的外框疊到（海域座標）。 */
function townOver(cx, cy, L) {
  var S = BED.A.chunk, e0 = cx * S, s0 = cy * S;
  return (L || TOWNS.list).some(function (T) { return T.box[0] < e0 + S && T.box[2] > e0 && T.box[1] < s0 + S && T.box[3] > s0; });
}
/** 塊 C 整地（C.tv）之後有沒有新來的城疊上來、或建築模式改到這一塊（T.edits，townReplace；townHv 的快取還能不能用）。
 *  改到的範圍不看 T.box：拿掉一條路（復原）⇒ 那一段可能已經在新的城框外面，整過的地要放回去。 */
function townNewer(C) {
  var S = BED.A.chunk, cb = [C.cx * S, C.cy * S, (C.cx + 1) * S, (C.cy + 1) * S];
  return TOWNS.list.some(function (T) { return (T.v > C.tv && townBoxHit(T.box, cb)) || (T.edits || []).some(function (e) { return e.v > C.tv && townBoxHit(e.b, cb); }); });
}
/** 規劃 ⇒ 一座城（海域座標的路、整地、清樹，世界座標的實例；模型的實例等要用到的模型解好（townKit）才建 ⇒ townInst）。 */
function townPrep(p) {
  var ox = +p.ox || 0, oy = +p.oy || 0, kx = +p.kx || 1, D2R = Math.PI / 180, bank = +p.bank || 1.5;
  function E(q) { return [ox + kx * q[0], oy + q[1]]; }
  var box = [1e9, 1e9, -1e9, -1e9];
  function grow(q, r) { box[0] = Math.min(box[0], q[0] - r); box[1] = Math.min(box[1], q[1] - r); box[2] = Math.max(box[2], q[0] + r); box[3] = Math.max(box[3], q[1] + r); }
  var roads = (p.roads || []).map(function (r) {
    var P = r.path.map(E); if (r.closed) P = P.concat([P[0]]);
    var z = (r.z || []).slice(); if (r.closed) z.push(z[0]);
    P.forEach(function (q) { grow(q, r.w / 2 + 4 + TOWN_GRADE_REACH); });
    return { id: r.id, kind: r.kind, w: r.w, P: P, z: z };
  });
  var grade = (p.grade || []).map(function (g) { var R = g.ring.map(E); R.forEach(function (q) { grow(q, TOWN_LOT_PAD + TOWN_LOT_CELL * 1.5 + 6); }); return { h: g.h, R: R, pit: g.pit }; });
  var clr = { rings: ((p.clear || {}).rings || []).map(function (r) { return r.map(E); }),
              paths: ((p.clear || {}).paths || []).map(function (c) { var P = c.path.map(E); return { w: c.w, P: c.closed ? P.concat([P[0]]) : P }; }) };
  // 附屬的田（規劃的地塊帶 annex：{ cells: [[排, 從第幾欄, 到第幾欄] …], crop }；格子對齊那一塊地塊，第 0 排臨路 —— Blocksail world/annex.js）：
  //   一列一段 ⇒ 一條長方形（地塊座標 a 沿進深、b 沿寬）；清樹（clr.rings）、鋪土（townGroundTile）、種作物（63_trees.js treeFieldPut）都照它
  var fields = [];
  (p.lots || []).forEach(function (l) {
    var A = l.annex; if (!A || !A.cells || !A.cells.length) return;
    var th = l.rot * D2R, fx = Math.cos(th), fy = Math.sin(th), Cc = TOWN_ANNEX_CELL;
    A.cells.forEach(function (r) {
      var a1 = l.d / 2 - Cc * r[0], a0 = a1 - Cc, b0 = -l.w / 2 + Cc * r[1], b1 = -l.w / 2 + Cc * (r[2] + 1);
      var F = { lot: l.id, crop: A.crop, at: l.at, fx: fx, fy: fy, a0: a0, a1: a1, b0: b0, b1: b1 };
      F.R = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(function (q) { return E([l.at[0] + fx * q[0] - fy * q[1], l.at[1] + fy * q[0] + fx * q[1]]); });
      fields.push(F); clr.rings.push(F.R);
    });
  });
  clr.rings.forEach(function (R) { R.forEach(function (q) { grow(q, 4); }); });
  clr.paths.forEach(function (c) { c.P.forEach(function (q) { grow(q, c.w); }); });
  (p.lots || []).forEach(function (l) { grow(E(l.at), Math.hypot(l.w, l.d)); });
  (p.piers || []).forEach(function (q) { q.path.forEach(function (a) { grow(E(a), q.w); }); });
  var core = p.core && p.core.ring ? p.core.ring.map(E) : null, cen = [ox, oy];
  if (core) { var sx = 0, sy = 0; core.forEach(function (q) { sx += q[0]; sy += q[1]; }); cen = [sx / core.length, sy / core.length]; }
  return { id: p.id, name: p.name, tier: p.tier, style: p.style, styles: p.styles || [p.style || TOWN_STYLE_DEF, TOWN_STYLE_DEF], seed: p.seed, p: p, ox: ox, oy: oy, kx: kx, bank: bank, E: E, box: box, roads: roads, grade: grade, clr: clr, fields: fields, cen: cen, D2R: D2R, inst: null, ground: null, shell: null };
}

// ── 整地與清樹（每塊算一次；之後有新的城疊上來（T.v 比這塊整地時的 C.tv 新）、C.h 換過（大漩渦重烤）才重算） ──
//   以前照 TOWNS.ver：來了一座城，每一塊（連跟它不相干的）的整地都失效 ⇒ 加拉塔晚到時君士坦丁堡重建實例那一格把底下約 100 塊重整一遍（TASK-0826）。
/** 給畫面的高度（Int16 分米，同 C.h 的排法）：有城疊到 ⇒ 整過地的那一份（C.hv），沒有 ⇒ C.h 本身。順手算清樹的遮罩（C.tc）。 */
function townHv(C) {
  if (!TOWNS.list.length || !BED || !BED.A) return C.h;
  if (C.tv != null && C.tvh === C.h && !townNewer(C)) return C.hv || C.h;
  C.tv = TOWNS.ver; C.tvh = C.h; C.hv = null; C.tc = null;
  if (!townOver(C.cx, C.cy)) return C.h;
  var t0 = performance.now(), A = BED.A, S = A.chunk, st = C.step, n = C.n, e0 = C.cx * S, s0 = C.cy * S, h0 = C.h, N = n * n, g = new Float32Array(N), fl = new Uint8Array(N), i, j, o;
  var cap = Math.min(st, TOWN_LOT_CELL) * 1.415 + 0.05;                  // 地塊頂著的範圍：外擴一格地形網格的對角線（見檔頭「地基」）
  for (o = 0; o < N; o++) g[o] = h0[o] / 10;
  function range(a, b, pad, lo) { return [Math.max(0, Math.ceil((a - pad - lo) / st)), Math.min(n - 1, Math.floor((b + pad - lo) / st))]; }
  function clampTo(o2, h, dd, bank) { if (h0[o2] <= 0) return; var lim = dd / bank; if (g[o2] > h + lim) g[o2] = h + lim; else if (g[o2] < h - lim) g[o2] = h - lim; }
  TOWNS.list.forEach(function (T) {
    if (!(T.box[0] < e0 + S && T.box[2] > e0 && T.box[1] < s0 + S && T.box[3] > s0)) return;
    T.roads.forEach(function (r) {                                      // 路：整平到路面（z），路寬一半 ＋ 一個取樣點內
      var pad = r.w / 2 + st, R = pad + TOWN_GRADE_REACH;
      for (var q = 1; q < r.P.length; q++) {
        var a = r.P[q - 1], b = r.P[q], za = r.z[q - 1], zb = r.z[q]; if (za == null || zb == null) continue;
        var ri = range(Math.min(a[0], b[0]), Math.max(a[0], b[0]), R, e0), rj = range(Math.min(a[1], b[1]), Math.max(a[1], b[1]), R, s0);
        var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) {
          var px = e0 + i * st - a[0], py = s0 + j * st - a[1], u = Math.max(0, Math.min(1, (px * dx + py * dy) / L2)), d = Math.hypot(px - u * dx, py - u * dy);
          if (d > R) continue;
          clampTo(j * n + i, za + (zb - za) * u, Math.max(0, d - pad), T.bank);
        }
      }
    });
    T.grade.forEach(function (gr) {                                     // 地塊：整平到 h（外擴 TOWN_LOT_PAD），外面照邊坡接
      var R = gr.R, xs = R.map(function (q) { return q[0]; }), ys = R.map(function (q) { return q[1]; }), reach = TOWN_LOT_PAD + 4 * T.bank;
      var ri = range(Math.min.apply(null, xs), Math.max.apply(null, xs), reach, e0), rj = range(Math.min.apply(null, ys), Math.max.apply(null, ys), reach, s0);
      for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) {
        var x = e0 + i * st, y = s0 + j * st, d = townPip(x, y, R) ? 0 : townPolyDist(x, y, R);
        if (gr.pit != null) {                                           // 下沉的地塊（蓄水池；pit ＝ 離邊幾公尺起才挖）：只挖地塊裡面、整片到 h，外面不接邊坡 ⇒ 挖的那一圈藏在模型的牆裡
          o = j * n + i; if (d > 0 || h0[o] <= 0 || townPolyDist(x, y, R) < gr.pit) continue;
          g[o] = gr.h; fl[o] = 1; continue;
        }
        if (d > reach) continue;
        clampTo(j * n + i, gr.h, Math.max(0, d - TOWN_LOT_PAD), T.bank);
      }
    });
  });
  TOWNS.list.forEach(function (T) {                                     // 地塊頂著（見檔頭「地基」）：外擴 cap 以內的點不准高過那一塊的 h − TOWN_LOT_SINK ⇒ 地形一律在石地坪底下；只往下壓、不往上抬
    if (!(T.box[0] < e0 + S && T.box[2] > e0 && T.box[1] < s0 + S && T.box[3] > s0)) return;
    T.grade.forEach(function (gr) {
      if (gr.pit != null) return;                                       // 下沉的地塊：上面那一輪已經挖好；外擴那一圈不能壓（會在牆外挖出一圈溝）
      var R = gr.R, xs = R.map(function (q) { return q[0]; }), ys = R.map(function (q) { return q[1]; });
      var ri = range(Math.min.apply(null, xs), Math.max.apply(null, xs), cap, e0), rj = range(Math.min.apply(null, ys), Math.max.apply(null, ys), cap, s0);
      for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) {
        o = j * n + i; if (h0[o] <= 0) continue;
        var x = e0 + i * st, y = s0 + j * st;
        var hc = gr.h - TOWN_LOT_SINK; if (g[o] < hc - 0.1 || (!townPip(x, y, R) && townPolyDist(x, y, R) > cap)) continue;
        if (g[o] > hc) g[o] = hc; fl[o] = 1;
      }
    });
  });
  var hv = new Int16Array(N), ch = 0;
  for (o = 0; o < N; o++) { hv[o] = Math.max(-32768, Math.min(32767, fl[o] ? Math.floor(g[o] * 10 + 1e-4) : Math.round(g[o] * 10))); if (hv[o] !== h0[o]) ch++; }   // 平台往下取整（分米）⇒ 不會高過地塊的 h（房子的底）
  C.hv = ch ? hv : null;
  C.tc = townClrMask(C);
  TOWNS.stat.gradeMs += performance.now() - t0; TOWNS.stat.chunks++;
  return C.hv || C.h;
}
/** 清樹的遮罩：塊裡每 TOWN_CLR_G 公尺一格（格心）落在 clear 的圈或路帶裡 ⇒ 1；整塊都沒有 ⇒ null。 */
function townClrMask(C) {
  var A = BED.A, S = A.chunk, G = TOWN_CLR_G, M = Math.round(S / G), e0 = C.cx * S, s0 = C.cy * S, out = null, i, j;
  function rng(a, b, pad, lo) { return [Math.max(0, Math.floor((a - pad - lo) / G)), Math.min(M - 1, Math.ceil((b + pad - lo) / G))]; }
  function mark(i2, j2) { if (!out) out = new Uint8Array(M * M); out[j2 * M + i2] = 1; }
  TOWNS.list.forEach(function (T) {
    if (!(T.box[0] < e0 + S && T.box[2] > e0 && T.box[1] < s0 + S && T.box[3] > s0)) return;
    T.clr.rings.forEach(function (R) {
      var xs = R.map(function (q) { return q[0]; }), ys = R.map(function (q) { return q[1]; }), ri = rng(Math.min.apply(null, xs), Math.max.apply(null, xs), 0, e0), rj = rng(Math.min.apply(null, ys), Math.max.apply(null, ys), 0, s0);
      for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) if (townPip(e0 + (i + 0.5) * G, s0 + (j + 0.5) * G, R)) mark(i, j);
    });
    T.clr.paths.forEach(function (c) {
      var hw = c.w / 2;
      for (var q = 1; q < c.P.length; q++) {
        var a = c.P[q - 1], b = c.P[q], ri = rng(Math.min(a[0], b[0]), Math.max(a[0], b[0]), hw, e0), rj = rng(Math.min(a[1], b[1]), Math.max(a[1], b[1]), hw, s0);
        for (j = rj[0]; j <= rj[1]; j++) for (i = ri[0]; i <= ri[1]; i++) if (townSegDist(e0 + (i + 0.5) * G, s0 + (j + 0.5) * G, a, b) <= hw) mark(i, j);
      }
    });
  });
  return out;
}
/** 63_trees.js 擺樹：塊裡 (x, z) 公尺（塊的原點起算）要不要清掉。 */
function townClr(C, x, z) {
  townHv(C); var M = C.tc; if (!M) return false;
  var G = TOWN_CLR_G, m = Math.round(BED.A.chunk / G), i = Math.min(m - 1, Math.max(0, Math.floor(x / G))), j = Math.min(m - 1, Math.max(0, Math.floor(z / G)));
  return M[j * m + i] === 1;
}
/** 63_bed_gl.js：這一塊有城 ⇒ 在用的那幾圈每 4 m 一點（地塊 8 × 12 m，8 m 一點會把整平的台子抹掉）。 */
function townFine(C) { return townHv(C) !== C.h || !!C.tc; }
function townPip(x, y, R) { var c = false; for (var i = 0, j = R.length - 1; i < R.length; j = i++) { var a = R[i], b = R[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function townSegDist(x, y, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, u = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0; return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy); }
function townPolyDist(x, y, R) { var m = Infinity; for (var i = 0, j = R.length - 1; i < R.length; j = i++) m = Math.min(m, townSegDist(x, y, R[j], R[i])); return m; }
/** 世界 (x, z) 的畫面高度（整過地的那一份；那一塊沒載 ⇒ NaN）—— 城牆、石基、棧橋的腳照它放。 */
/** 世界 (x, z) 落在畫著的那一塊（08_seabed.js bedShowC：原精度載著就是原精度）的哪一格 ⇒ { C, u, v }（同 bedCell 的回傳）；那一塊沒在畫 ⇒ 照 bedCell。
 *  ⛔ 不能直接用 bedCell：它照 bedLevels 的等級挑（離焦點 BED_NEED_FULL 外 ⇒ 中等塊、16 m 一格），而原精度塊載著就照畫（4 m 一格）
 *  ⇒ 路面、街燈、預覽讀到的比畫出來的地形低（2026-10-23 托爾圖加量到沿新路 33 點低 0.19～1.14 m：路面被地形吃掉，Tim「看起來是道路有機會跑到地下(被地形吃掉)」）。
 *  只給畫面用（整地後的高度 townHv 是每一塊自己的）；模擬照舊讀 bedHgt。 */
function townCell(x, z) {
  var S = BED.A.chunk, cx = Math.floor((x + BED.ax) / S), cy = Math.floor((z + BED.az) / S), C = bedShowC(cx + '_' + cy);
  if (!C) return bedCell(x, z);
  return { C: C, u: (x + BED.ax - cx * S) / C.step, v: (z + BED.az - cy * S) / C.step };
}
function townGround(x, z) {
  var q = townCell(x, z); if (!q) return NaN;
  var C = q.C, h = townHv(C), n = C.n, i = Math.min(n - 2, Math.floor(q.u)), j = Math.min(n - 2, Math.floor(q.v)), fu = q.u - i, fv = q.v - j, o = j * n + i;
  return ((h[o] * (1 - fu) + h[o + 1] * fu) * (1 - fv) + (h[o + n] * (1 - fu) + h[o + n + 1] * fu) * fv) / 10;
}

// ── 模型（Blocksail world/townkit/：tools/townmodels.py 匯入時算好）⇒ GPU ──
/** 解一份格子（townmodels.py pack_chunks：deflate-raw 的 區塊數 u32、(cx, cy, cz) u16 × n、4096 × n）⇒ 一份網格（全部區塊的四邊形照檔裡的順序接在一起；Uint16、一個四邊形 16 個）。
 *  ⛔ 接法改了 ⇒ TOWN_MESH_FMT 加一（Blocksail tools/town_mesh_bake.cjs 照同一個接法烘，同名常數一起改）。 */
function townMeshData(b64, size) {
  var bytes = null;
  // 分段做（05_hull.js yieldEach；全部模型排成一列）：金斯敦要的模型以前一次全部解、全部網格化 ⇒ 主執行緒卡 0.86 s
  return yieldEach([b64], function () { bytes = VK.b64ToBytes(b64); }, TOWN_MESH_MS).then(function () { return VK.inflateRaw(bytes); }).then(function (raw) {
    var dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), n = dv.getUint32(0, true), p = 4 + n * 6, ch = [null];   // null ＝ 先建格子
    for (var i = 0; i < n; i++) ch.push({ cx: dv.getUint16(4 + i * 6, true), cy: dv.getUint16(6 + i * 6, true), cz: dv.getUint16(8 + i * 6, true), data: raw.subarray(p + i * 4096, p + (i + 1) * 4096) });
    var g = null, parts = [], len = 0;
    return yieldEach(ch, function (c) {
      if (!c) { g = VK.Grid.fromModel({ header: { size: size, voxels: 0 }, chunks: ch.slice(1) }); return; }
      var m = VK.meshChunk(g, c.cx, c.cy, c.cz); if (m) { parts.push(m); len += m.length; }
    }, TOWN_MESH_MS).then(function () { var all = new Uint16Array(len), o = 0; parts.forEach(function (m) { all.set(m, o); o += m.length; }); return all; });
  });
}
// 烘好的網格（TASK-0823；Tim 2026-10-22「模型解成網格那段…是否一樣可以預處理緩存在本地(之後打包時要包處理過的版本)」）：
//   君士坦丁堡 27 個模型網格化 CPU 約 0.8 s，進航海那幾秒跟飛行鏡頭、收海圖塊搶主執行緒 ⇒ 牆鐘 3～10 s 城才出來。
//   ⇒ Blocksail 照同一支網格化（VoxelKit meshChunk）、同一個接法（townMeshData）先烘好，外面那一頁回模型時附 mesh：{ fmt, vk, nq: [近, 中], z: deflate-raw（近 ‖ 中） }。
//   fmt ＝ TOWN_MESH_FMT、vk ＝ 這份成品記的 voxelkit.js 指紋（blockside-src；admin.py src_manifest）都對得上 ⇒ 解壓直接上傳；任何一關不過、解不開 ⇒ 照舊網格化（畫面逐位元組相同，只是慢）。
//   網址 ?townmesh=0 ⇒ 一律現場網格化；?townmesh=check ⇒ 兩條都走、逐位元組比（TOWNS.stat.meshCheck：相同幾份／不同的名字／比過的名字），畫的是現場算的那一份。
var TOWN_MESH_FMT = 1, TOWN_MESH_Q = Q.get('townmesh');
/** 這份成品的 voxelkit.js 指紋（成品的來源清單；直接開 src/template.html 沒有清單 ⇒ null ⇒ 一律現場網格化）。 */
function townVkFp() {
  if (TOWNS.vkFp === undefined) { try { TOWNS.vkFp = JSON.parse(document.getElementById('blockside-src').textContent).files['VoxelKit/voxelkit.js'] || null; } catch (e) { TOWNS.vkFp = null; } }
  return TOWNS.vkFp;
}
/** 烘好的網格能不能用（格式、網格化的版本都對得上）。 */
function townMeshOk(M) { return !!(M && M.z && M.nq && M.fmt === TOWN_MESH_FMT && M.vk && M.vk === townVkFp() && TOWN_MESH_Q !== '0'); }
/** 烘好的網格 ⇒ Promise<[近, 中]>（Uint16Array）；四邊形數跟檔頭對不上 ⇒ reject（呼叫端照舊網格化）。 */
function townMeshBaked(M) {
  return VK.inflateRaw(new Uint8Array(M.z)).then(function (u) {
    var n0 = M.nq[0] * 16, n1 = M.nq[1] * 16;
    if (u.byteLength !== (n0 + n1) * 2 || u.byteOffset % 2) throw new Error('烘好的網格長度不對');
    return [new Uint16Array(u.buffer, u.byteOffset, n0), new Uint16Array(u.buffer, u.byteOffset + n0 * 2, n1)];
  });
}
/** 一個模型的近、中兩份網格 ⇒ Promise<[近, 中]>（GPU）：烘好的能用就用，不然（或解不開）現場網格化；?townmesh=check 兩條都走、比。 */
function townModelMesh(nm, d, m0) {
  var S = TOWNS.stat;
  function live() { return Promise.all([townMeshData(d.g, m0.size), townMeshData(d.lo, m0.lo.size)]); }
  function up(L) { return [townUpload(L[0]), townUpload(L[1])]; }
  if (!townMeshOk(d.mesh)) { S.meshLive++; return live().then(up); }
  if (TOWN_MESH_Q === 'check') return Promise.all([live(), townMeshBaked(d.mesh).catch(function () { return null; })]).then(function (R) {
    var same = R[1] && [0, 1].every(function (i) { var a = R[0][i], b = R[1][i]; if (a.length !== b.length) return false; for (var j = 0; j < a.length; j++) if (a[j] !== b[j]) return false; return true; });
    var C = S.meshCheck || (S.meshCheck = { same: 0, diff: [], names: [] }); C.names.push(nm); if (same) C.same++; else C.diff.push(nm);
    S.meshLive++; return up(R[0]);
  });
  return townMeshBaked(d.mesh).then(function (L) { S.meshBaked++; return up(L); }, function (e) { console.warn('城鎮：' + nm + ' 烘好的網格解不開（' + e.message + '）⇒ 現場網格化'); S.meshLive++; return live().then(up); });
}
/** 一份模型的網格（每個區塊的四邊形接好的 Uint16Array）⇒ GPU（實例化畫，QIDX 的索引）。 */
function townUpload(all) {
  var r = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), nq: all.length / 16 };
  QIDX.ensure(r.nq);                                                    // 先加長（ensure 會解開現在綁的 VAO）
  gl.bindVertexArray(r.vao); gl.bindBuffer(gl.ARRAY_BUFFER, r.vbo); gl.bufferData(gl.ARRAY_BUFFER, all, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribIPointer(0, 4, gl.UNSIGNED_SHORT, 8, 0);
  gl.enableVertexAttribArray(4); gl.vertexAttribDivisor(4, 1); gl.enableVertexAttribArray(5); gl.vertexAttribDivisor(5, 1); gl.enableVertexAttribArray(6); gl.vertexAttribDivisor(6, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, QIDX.buf); gl.bindVertexArray(null);
  return r;
}
// 模型不在這裡（Tim 2026-10-20：「城鎮資料…放在Blocksail 然後傳輸要用到的部份給Blockside就好」）：Blocksail 的 world/townkit/（tools/townmodels.py 產生）
//   ＝ 索引 BSTOWNKIT（每個模型的用途、尺寸、地塊、屋頂、固定點、貼圖大小；小）＋ 一個模型一個檔 BSTOWNKIT_DATA[名] ＝ { g: 網格, lo: 低模, png: 八張橫排的貼圖 }。
//   索引跟規劃一起到（外面那一頁回 'towns' 時附 kit；檔案模式 maps/<海域>/townkit/index.js）⇒ 照它挑每塊地用哪一個（townNeed）⇒ 只要那幾個（townModels）。
//   ⛔ 照用途分組（byUse）一律照「索引裡全部的模型」分：同用途的變化照雜湊在那一份清單裡挑 ⇒ 只照收到的分，清單變短、挑到的房子就變了。
/** 索引 ⇒ 全部名字（排序）、照用途分組。 */
function townIdx() {
  var I = TOWNS.idx; if (!I || !I.models) return null;
  if (!I.names) {
    I.names = Object.keys(I.models).sort(); I.byUse = {}; I.byStyle = {};
    I.names.forEach(function (nm) { var m = I.models[nm], k = m.use !== 'wall' ? m.use : (m.set || 'wall' + m.tier) + '-' + m.part; (I.byUse[k] = I.byUse[k] || []).push(nm); });   // 城牆：'<套>-<型>'（同型好幾種 ⇒ 名字排序）
    I.names.forEach(function (nm) { var m = I.models[nm]; if (m.use === 'wall') return; var k = (m.style || TOWN_STYLE_DEF) + ':' + m.use; (I.byStyle[k] = I.byStyle[k] || []).push(nm); });   // 建築：'<風格>:<用途>'
  }
  return I;
}
/** 地塊 l ⇒ 候選模型（townNeed、townInst 同一條路；TASK-0757、0772）：照規劃的退路 styles 一個一個找（Blocksail BSW.townStyles：城的 style → 地區文化 culture → 共用的 common → fr）
 *  → 代用的用途（同樣照退路）；特殊建築（l.src 'special'：用途就是那一種，例 galata-tower 的風格是 genoa）⇒ 不分風格。
 *  ⛔ 一般地塊只找退路裡的風格：carib 的砲台不會跑進退路裡沒有 carib 的城。 */
function townPick(I, styles, l) {
  var use = l.use, lv = use === 'house' ? l.lvl || 1 : 0;
  function by(u) { for (var i = 0; i < styles.length; i++) { var L = I.byStyle[styles[i] + ':' + u]; if (L && u === 'house') L = townLvl(I, L, lv || 1, l); if (L) return L; } return null; }
  function any(u) { return I.byUse[u]; }
  var alt = TOWN_USE_ALT[use] || [];
  var L0 = by(use) || alt.map(by).filter(Boolean)[0] || (l.src === 'special' ? any(use) : null);
  if (!L0 && lv > 1) { lv = 1; L0 = by(use); }                        // 那一級哪一套風格都沒有 ⇒ 低密度那一份
  return townFit(I, l, L0);
}
/** 住宅照密度級篩（Blocksail TASK-0895：規劃的地塊 lvl 2 中、3 高，沒寫 ＝ 1 低；索引的 lvl 同）⇒ 同一級的那幾個；一個都沒有 ⇒ null（換下一套風格找）。
 *  中、高密度再留裝得下的裡面最寬的那幾個（3 × 3 的地塊 12 m 寬：M-A 12 m、M-B 8 m 都裝得下、進深都是 12 m ⇒ townFit 分不出來）；低密度照舊不篩寬（現有的房子挑到的不變）。
 *  ⛔ 不篩級的話 townFit 的「裝得下、進深最大」會把金斯敦 14～17 × 27～52 m 的手擺地塊換成 4 × 4 的高密度。地球儀的俯視圖（Blocksail world/town_top.js pick）同一條。 */
function townLvl(I, L, lv, l) {
  var o = L.filter(function (nm) { return (I.models[nm].lvl || 1) === lv; }); if (!o.length) return null;
  if (lv > 1 && l && l.w) {
    var lw = function (nm) { var lt = I.models[nm].lot; return lt ? lt[0] : 0; }, fit = o.filter(function (nm) { return lw(nm) <= l.w + 0.05; });
    if (fit.length) { var wm = Math.max.apply(null, fit.map(lw)); o = fit.filter(function (nm) { return lw(nm) === wm; }); }
  }
  return o;
}
/** 候選照地塊大小收窄（Blocksail TASK-0742：轉角放淺一點的房子 ⇒ 住宅多一級 8 × 10 的淺版）：模型的地塊（索引的 lot ＝ [寬, 進深] 公尺）裝得進 l（寬容 5 cm：
 *  綁路的地塊寬是整數 − 2 cm）的那幾個裡、進深最大的那一級；一個都裝不下 ⇒ 照舊整份（手擺的小地塊）。
 *  ⇒ 12 m 的地塊候選跟以前同一份（雜湊挑到同一棟）；10～11 m 的地塊挑淺版（以前挑 12 m 的、屋後的院子凸出地塊）。
 *  同一級進深裡再留最寬的那幾個（kaguya 2026-10-24，Tim「接著修和平港、皇家港疊在一起的房子」：和平港 1686 的小木屋寬 4～12 m ⇒ 9 m 寬的地塊挑 8 m 的，不是抽到 4 m 的）；
 *    現有的那幾套同一級進深都一樣寬（住宅 8 m）⇒ 挑到的不變（六座城逐塊對過：Blocksail tools/town_foot.cjs）。 */
function townFit(I, l, L) {
  if (!L || L.length < 2 || !I.models) return L;
  var ok = L.filter(function (nm) { var lt = I.models[nm] && I.models[nm].lot; return !lt || (lt[0] <= l.w + 0.05 && lt[1] <= l.d + 0.05); });
  if (!ok.length) return L;
  function lt(nm, i) { var q = I.models[nm].lot; return q ? q[i] : 0; }
  var dmax = Math.max.apply(null, ok.map(function (nm) { return lt(nm, 1); }));
  ok = ok.filter(function (nm) { return lt(nm, 1) === dmax; });
  var wmax = Math.max.apply(null, ok.map(function (nm) { return lt(nm, 0); }));
  return ok.filter(function (nm) { return lt(nm, 0) === wmax; });
}
/** 城 T 的繁榮度 0～1：__game.townProsp 給的 ⇒ 網址 ?prosp= ⇒ TOWN_PROSP_DEF。 */
function townProsp(T) {
  var v = TOWNS.prosp[T.id]; if (v == null && Q.has('prosp')) v = parseFloat(Q.get('prosp'));
  return isFinite(v) ? Math.max(0, Math.min(1, v)) : TOWN_PROSP_DEF;
}
/** 城牆等級（TOWN_BUILD §4）：村 0；鎮 1（繁榮度高 2）；城 2（低 1、高 3）；首府 3（高 4）。規劃沒寫規模 ⇒ 村。 */
function townWallLv(tier, pr) {
  var lo = pr < TOWN_PROSP_CUT[0], hi = pr >= TOWN_PROSP_CUT[1];
  return tier >= 4 ? (hi ? 4 : 3) : tier === 3 ? (lo ? 1 : hi ? 3 : 2) : tier === 2 ? (hi ? 2 : 1) : 0;
}
/** 城 T 的牆 w 用哪一套模組（'wall1'…、'roman-sea'…）；null ＝ 不畫（0 級）。note ⇒ 那一級／那一套沒有、換掉的記進 stat.skip（只在 townWall 記，townNeed 不記）。 */
function townWallKit(I, T, w, note) {
  var skip = TOWNS.stat.skip;
  function miss(k) { if (note) skip['wall:' + k] = (skip['wall:' + k] || 0) + 1; }
  if (w.kit) { if (I.byUse[w.kit + '-section']) return w.kit; miss(w.kit); return 'wall1'; }
  for (var lv = townWallLv(T.tier || 1, townProsp(T)); lv >= 1; lv--) { if (I.byUse['wall' + lv + '-section']) return 'wall' + lv; miss('wall' + lv); }
  return null;
}
/** 改繁榮度（__game.townProsp；id 沒給 ⇒ 每一座；v 是 null ⇒ 拿掉、回到網址／預設）⇒ 要的模型變多就丟掉重要、不然只重建實例。回每座城的等級與牆用哪一套。 */
function townProspSet(v, id) {
  var ids = id != null ? [id] : TOWNS.list.map(function (T) { return T.id; });
  ids.forEach(function (k) { if (v == null) delete TOWNS.prosp[k]; else TOWNS.prosp[k] = +v; });
  var I = townIdx();
  if (I && TOWNS.kitHas && townNeed(I).some(function (nm) { return TOWNS.kitHas.indexOf(nm) < 0; })) townKitStale();
  TOWNS.list.forEach(function (T) { T.inst = null; }); TOWNS.dirty = true;
  return TOWNS.list.map(function (T) {
    var pr = townProsp(T);
    return { id: T.id, tier: T.tier || 1, prosp: pr, lv: townWallLv(T.tier || 1, pr), kits: I ? (T.p.walls || []).map(function (w) { return townWallKit(I, T, w, false); }) : null };
  });
}
/** 收到的城會用到哪幾個模型（wallsOnly ⇒ 只要城牆那幾套；townKit 骨架那一段）：地塊照用途的整份候選（townInst 在裡面照雜湊挑）、城牆那一套的每一型（townWall：門、塔、斷面、收尾、轉角；套照 townWallKit）。 */
function townNeed(I, wallsOnly) {
  var S = {};
  function add(L) { (L || []).forEach(function (nm) { S[nm] = 1; }); }
  TOWNS.list.forEach(function (T) {
    if (!wallsOnly) (T.p.lots || []).forEach(function (l) {
      if (l.use === 'plot' || l.use === 'plaza') return;
      add(townPick(I, T.styles, l));
    });
    if (!wallsOnly) (TOWNS.wantUse || []).forEach(function (u) { add(townPick(I, T.styles, { use: u })); });   // 建築模式選單裡的那幾種（還沒蓋也先要：預覽要畫得出來；TASK-0869，townWantSet）
    (T.p.walls || []).forEach(function (w) {
      var kit = townWallKit(I, T, w, false); if (!kit) return;
      Object.keys(I.byUse).forEach(function (k) { if (k.indexOf(kit + '-') === 0) add(I.byUse[k]); });   // 那一套的每一型（門、塔、斷面、收尾、轉角…；以後多一型也不漏）
    });
    (T.p.aqueducts || []).forEach(function (a) {                       // 引水渠：跟城牆一起在骨架那一段（遠遠就看得到）；kit 照規劃寫的、不照規模挑
      if (a.kit) Object.keys(I.byUse).forEach(function (k) { if (k.indexOf(a.kit + '-') === 0) add(I.byUse[k]); });
    });
  });
  return Object.keys(S).sort();
}
/** 那幾個模型的網格與貼圖 ⇒ Promise<{ 名: { g, lo, png } }>：@host 跟外面那一頁要（{ bsmap: 'need', what: 'townmodels', names } ⇒ { bsmap: 'townmodels', models }；
 *  08_seabed.js 轉給 townModelsGot）；檔案模式讀 maps/<海域>/townkit/<名>.js（BSTOWNKIT_DATA）。 */
function townModels(names) {
  if (BED.host) return new Promise(function (ok, bad) { TOWNS.mwait = { ok: ok, bad: bad }; BED.host.postMessage({ bsmap: 'need', what: 'townmodels', names: names }, '*'); });
  var dir = 'maps/' + BED.A.id + '/townkit/';
  return Promise.all(names.map(function (nm) { return (window.BSTOWNKIT_DATA || {})[nm] ? null : bedScript(dir + nm + '.js'); })).then(function () {
    var D = window.BSTOWNKIT_DATA || {}, out = {};
    names.forEach(function (nm) { if (!D[nm]) throw new Error('檔案裡沒有模型 ' + nm); out[nm] = D[nm]; });
    return out;
  });
}
/** 外面那一頁回的模型（08_seabed.js；出錯 ⇒ err）。 */
function townModelsGot(M, err) { var w = TOWNS.mwait; TOWNS.mwait = null; if (!w) return; if (err || !M) w.bad(new Error(err || '外面那一頁沒給模型')); else w.ok(M); }
// 骨架先出（TASK-0826；Tim 2026-10-22「是否可以讓棧橋 城牆分開載入與顯示(且優先)」）：以前一次解整組（君士坦丁堡 28 個）⇒ 一次建全部實例 ⇒ 城牆排在全部模型後面。
//   ⇒ 分兩段：① 只解城牆那幾套（townNeed wallsOnly）⇒ K.part ⇒ 實例只有城牆（townInst）② 解整組 ⇒ 換成完整的實例（townKitSet 當場重建、再放掉 ①，城牆不會空一格）。
//   棧橋、碼頭在地面的帶子裡（townGroundTile）：不等完整的實例、有棧橋碼頭的區先建（townDraw、townGroundNext）。
//   城牆那幾套就是全部（小城沒有牆、或只有牆）⇒ 只解一次。網址 ?townskel=0 ⇒ 照以前一次解整組、地面等實例。
var TOWN_SKEL = Q.get('townskel') !== '0';
/** 要用到的模型解好（近、中各一份網格；收到的貼圖一個模型一列往下排成一張）⇒ TOWNS.kit。第一次要畫才做（非同步；好了才建實例）；骨架先出見上。 */
function townKit() {
  if (TOWNS.kitP) return TOWNS.kitP;
  var I = townIdx();
  if (!I) { if (!TOWNS.err) TOWNS.err = '沒有城鎮模型的索引（外面那一頁沒給 kit、或檔案模式沒有 maps/' + BED.A.id + '/townkit/index.js）'; return null; }
  var t0 = performance.now(), need = townNeed(I), wneed = TOWN_SKEL && !TOWNS.kit ? townNeed(I, true) : [], S = TOWNS.stat, P;
  var req = need.concat(townFolkNeed(I));                                // 城鎮居民的素材一起要（63_townfolk.js）
  TOWNS.kitHas = need; TOWNS.kitBusy = true; S.meshBaked = S.meshLive = 0; S.meshCheck = null; S.skelMs = null;   // mesh*：這一份模型組幾個用烘好的網格、幾個現場網格化（townModelMesh；兩段加起來）
  function mine(K) { if (TOWNS.kitP === P) return true; townKitGpuFree(K, TOWNS.kit); return false; }   // 中途被丟掉重來（townKitFree）⇒ 這一份不要了（跟畫著的那一組共用的網格留著）
  var D = null, part = null;                                             // 一次跟外面那一頁要整組（D）；骨架先用城牆那幾個組（part），整組沿用它們的網格（不再解一次）
  var first = townModels(req).then(function (d) {
    D = d; if (!(wneed.length && wneed.length < need.length)) return;
    return townKitMake(I, wneed, D, null).then(function (K) {
      if (!mine(K)) return; K.part = true; part = K; townKitSet(K); S.skelMs = +(performance.now() - t0).toFixed(1); S.skelN = wneed.length;
    });
  });
  P = TOWNS.kitP = first.then(function () { return TOWNS.kitP === P ? townKitMake(I, need, D, part) : null; }).then(function (K) {
    if (!K || !mine(K)) return;
    TOWNS.kitBusy = false; townKitSet(K);
    S.kitMs = +(performance.now() - t0).toFixed(1);
    S.kitN = need.length + '/' + I.names.length;                       // 要了幾個／索引裡有幾個
    S.kitTris = need.reduce(function (o, nm) { o[nm] = [K.M[nm].lod[0].nq * 2, K.M[nm].lod[1].nq * 2]; return o; }, {});
    if (TOWNS.kitRedo) { TOWNS.kitRedo = false; townKitRestart(); }   // 解的時候又來了新的城、要的模型變多 ⇒ 再解一次（這一份照畫，見 townKitStale）
  }, function (e) { if (TOWNS.kitP === P) TOWNS.kitBusy = false; TOWNS.err = '模型解不開：' + e.message; console.warn('城鎮：' + TOWNS.err); });
  return TOWNS.kitP;
}
/** 那幾個模型（D ＝ 外面那一頁給的資料，townModels）⇒ Promise<模型組>：網格（烘好的或現場算；reuse ＝ 骨架那一組，有的直接沿用它的網格與窗片）、貼圖照名字一個一列往下排成一張。 */
function townKitMake(I, need, D, reuse) {
  var names = I.names, M = {};
  return Promise.all(need.map(function (nm) {
    var m0 = I.models[nm], d = D[nm], R = reuse && reuse.M[nm];
    if (!d) throw new Error('外面那一頁沒給 ' + nm);
    function put(L, win, gls) { M[nm] = { nm: nm, i: names.indexOf(nm), m: m0, lod: L, png: d.png, uc0: [m0.mpv, m0.size[0] * m0.mpv / 2, m0.size[1] * m0.mpv / 2], uc1: [m0.mpv * m0.lo.f, m0.size[0] * m0.mpv / 2, m0.size[1] * m0.mpv / 2], win: win, gls: gls }; }   // win：亮窗的窗片（夜裡的燈）；gls：玻璃（townGlsMesh）
    if (R) { put(R.lod, R.win, R.gls); return null; }
    return Promise.all([townModelMesh(nm, d, m0), townGlsMesh(m0, d.gls)]).then(function (A) { put(A[0], townWinMesh(m0), A[1]); });
  })).then(function () {
    // 貼圖：收到的模型照名字一個一列往下排（寬 ＝ 最寬那一列、高 ＝ 加總，各取 2 的次方）；那一列的座標寫進那個模型的 im（畫貼圖照它取，townBin）
    var aw = 1, y = 0;
    need.forEach(function (nm) { var im = M[nm].m.im; aw = Math.max(aw, im.cw * I.views); M[nm].m = Object.assign({}, M[nm].m, { im: Object.assign({}, im, { x: 0, y: y }) }); y += im.ch; });
    aw = 1 << Math.ceil(Math.log2(aw)); var ah = 1 << Math.ceil(Math.log2(Math.max(1, y)));
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, aw, ah, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.bindTexture(gl.TEXTURE_2D, null);
    return Promise.all(need.map(function (nm) {                      // 一列一列貼（texSubImage2D 不預乘 alpha ⇒ 透明像素塗的顏色照留，mipmap 不帶黑邊）
      return new Promise(function (ok) {
        var im = new Image();
        im.onload = function () { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, M[nm].m.im.y, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.bindTexture(gl.TEXTURE_2D, null); ok(); };
        im.onerror = function () { ok(); };
        im.src = 'data:image/png;base64,' + M[nm].png;
      });
    }).concat([townFolkTex(I, D, reuse)])).then(function (R) {
      var folk = R[R.length - 1] || null;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.bindTexture(gl.TEXTURE_2D, null);
      need.forEach(function (nm) { delete M[nm].png; });
      return { M: M, names: names, byUse: I.byUse, byStyle: I.byStyle, models: I.models, tex: tex, aw: aw, ah: ah, views: I.views, folk: folk, part: false };   // models：townPick 照地塊大小收窄要看每個候選的 lot（跟 townNeed 用同一份索引）
    });
  });
}
/** 換上一份模型組：有畫著的實例 ⇒ 當場照新的重建（骨架 ⇒ 完整，中間不空一格）、再放掉舊的 GPU 資源；沒有 ⇒ 下一格 townDraw 建。 */
function townKitSet(K) {
  var old = TOWNS.kit; TOWNS.kit = K;
  TOWNS.grp = null;                                                     // 分組表是照上一份的模型數的 ⇒ 丟掉（影子那一關在 townDraw 重新分組之前跑；要的模型變少時 —— 城牆降級 —— 舊表會指到沒解的模型）
  TOWNS.list.forEach(function (T) {
    if (T.inst && old) { T.inst = townInst(T); townTreesSet(T); townFlagFree(T); T.shDirty = true; T.tlS = T.tlD = true; } else T.inst = null;
  });
  TOWNS.dirty = true;
  if (old) townKitGpuFree(old, K);
}
/** 一份模型組的 GPU 資源（網格、窗片、貼圖）；keep ＝ 換上的那一組（骨架 ⇒ 整組沿用的網格不放掉）。 */
function townKitGpuFree(K, keep) {
  Object.keys(K.M).forEach(function (nm) { if (keep && keep.M[nm] && keep.M[nm].lod === K.M[nm].lod) return; K.M[nm].lod.concat(K.M[nm].win ? [K.M[nm].win] : [], K.M[nm].gls ? [K.M[nm].gls] : []).forEach(function (r) { gl.deleteVertexArray(r.vao); gl.deleteBuffer(r.vbo); }); });
  if (K.tex) gl.deleteTexture(K.tex);
  townFolkFree(K, keep);
}
/** 要的模型變多（來了新的城、改了繁榮度）：還在解 ⇒ 解完再丟掉重要（兩段同時跟外面那一頁要，回應會對錯人）；不然 ⇒ 現在就丟。 */
//   以前直接丟掉（townKitFree）⇒ 實例全部不見，等新的一組解好才回來（加拉塔晚到時君士坦丁堡的房子消失 1.7 s；TASK-0826）。
//   ⇒ 舊的那一組與實例照畫，新的整組在背景解（不做骨架那一段）、好了 townKitSet 當場換；新來的城的實例等新的一組（townDraw：舊的一組挑不到它要的模型）。
function townKitStale() { if (TOWNS.kitBusy) TOWNS.kitRedo = true; else if (TOWNS.kit) townKitRestart(); }
/** 下一格 townDraw 照現在的城重解一組（舊的照畫到新的好）。 */
function townKitRestart() { TOWNS.kitP = null; TOWNS.kitHas = null; TOWNS.kitBusy = false; }
/** 丟掉解好的模型（GPU 的網格、貼圖）⇒ 下一格照新的城重要。 */
function townKitFree() {
  var K = TOWNS.kit; TOWNS.kit = null; TOWNS.kitP = null; TOWNS.kitHas = null; TOWNS.kitBusy = false; TOWNS.grp = null;
  if (!K) return;
  townKitGpuFree(K);
  TOWNS.list.forEach(function (T) { T.inst = null; }); TOWNS.dirty = true;
}

// ── 實例（一座城建一次：建築、城牆、石基；屋頂殼、地面的帶子） ──
/** 城 T 的實例：[{ k: 模型名, x, y, z, th（模型 +x 在平面上 ＝ (sinθ, −cosθ)）, sx（沿 x 縮放）, sh（深淺）, r（外框半徑）, pl: 石基 [w, d] 或 null, foot: 屋頂殼用的佔地 m² }]；y 是 NaN ⇒ 等那一塊載進來（townGround）。 */
function townInst(T) {
  var K = TOWNS.kit, p = T.p, out = [], skip = TOWNS.stat.skip;
  function W(q) { var e = T.E(q); return [e[0] - BED.ax, e[1] - BED.az]; }
  (K.part ? [] : p.lots || []).forEach(function (l) {                  // 骨架（K.part：只解了城牆那幾套）⇒ 只有城牆
    if (l.use === 'plot' || l.use === 'plaza') return;
    var q = townLotInst(T, K, l);
    if (!q) { skip[l.use] = (skip[l.use] || 0) + 1; return; }
    out.push(q);
  });
  TOWNS.stat.joins = TOWNS.stat.joins || {}; delete TOWNS.stat.joins[T.id];   // 牆接建築（townWall）：每道牆的每一段兩頭各伸進建築幾公尺
  var JX = townWallJx(T, p.walls || [], W, K);                          // 牆接牆的分岔（先整座城算好，每道牆照它處理兩頭與中段的接點）
  (p.walls || []).forEach(function (w) { townWall(T, w, out, W, false, JX[w.id]); });
  TOWNS.stat.under = TOWNS.stat.under || {}; TOWNS.stat.under[T.id] = { n: 0, tight: [] };   // 引水渠跨過的路（townLineUnderParts）：這一次擺了幾段、哪幾段拱跨不過去
  (p.aqueducts || []).forEach(function (a) { townWall(T, a, out, W, true); });   // 引水渠：畫法同城牆（見 townWall 的 line）
  TOWNS.stat.inst = TOWNS.list.reduce(function (s, T2) { return s + (T2 === T ? out.length : (T2.inst || []).length); }, 0);
  TOWNS.stat.lots = TOWNS.list.reduce(function (s, T2) { return s + (T2.p.lots || []).length; }, 0);
  // 地形挖洞（63_bed_gl.js BEDHOLE）：模型 meta ground=hide 的建築（擺得出來的那幾棟）、規劃寫 hide 的廣場 ⇒ 那個地塊框裡的地形不畫
  var lotK = {}; out.forEach(function (q) { if (q.lot) lotK[q.lot] = q.k; });
  T.holes = (p.lots || []).filter(function (l) { return l.use === 'plaza' ? !!l.hide : !!(lotK[l.id] && K.M[lotK[l.id]].m.ground === 'hide'); }).map(function (l) { return townHoleOf(T, l); });
  bedHoleSet([].concat.apply([], TOWNS.list.map(function (T2) { return T2 === T ? T.holes : T2.holes || []; })));
  return out;
}
/** 地塊框 ⇒ 地形挖洞的那一格（海域座標 − BED.ax／az；E 的 x 乘 kx ⇒ 軸、半寬照它換）。 */
function townHoleOf(T, l) {
  var th = l.rot * Math.PI / 180, c = T.E(l.at), ux = T.kx * Math.cos(th), uz = Math.sin(th), ul = Math.hypot(ux, uz), vl = Math.hypot(T.kx * Math.sin(th), Math.cos(th));
  return { x: c[0] - BED.ax, z: c[1] - BED.az, ux: ux / ul, uz: uz / ul, hd: l.d / 2 * ul, hw: l.w / 2 * vl, lot: l.id };
}
/** 一塊地 ⇒ 一棟的實例（townInst；建築模式的預覽 townGhost 也走這一支 ⇒ 同一個地塊 id 預覽跟蓋出來的是同一棟）；那一種沒有模型 ⇒ null。 */
function townLotInst(T, K, l) {
  var L = townPick(K, T.styles, l); if (!L || !L.length) return null;
  var nm = L[Math.floor(townHash(T.id + ':' + l.id) * L.length)]; if (!K.M[nm]) return null;   // 剛蓋的那一種模型還在路上（townReplace 叫了 townKitStale）⇒ 這一格先不擺
  var m = K.M[nm].m, th = l.rot * Math.PI / 180, md = m.size[1] * m.mpv, mw = m.size[0] * m.mpv;
  var off = (l.d - md) / 2, e = T.E([l.at[0] + off * Math.cos(th), l.at[1] + off * Math.sin(th)]);
  var lk = Math.max(1, Math.min(TOWN_LM[1], Math.max(mw, md, m.top) / TOWN_LM[0]));
  return { k: nm, x: e[0] - BED.ax, y: l.h, z: e[1] - BED.az, th: th, sx: 1, sh: 0.92 + 0.16 * townHash(l.id + '#'), r: Math.hypot(mw, md) / 2 + 2, top: m.top, pl: [mw, md], foot: mw * md * m.cover, col: m.roof, lot: l.id, lk: lk };
}
/** 一條城牆 ⇒ 門、塔、轉角、收尾照位置，中間的斷面沿路線接成一條斜接的折線（照 w.kit 挑那一套；BUILDING_SPEC §6）。
 *  t ＝ 從起點沿路線量的長度（閉合的牆繞回來）；部件佔掉 [t0, t1]，兩頭的接口 p0、p1 ＝ 中心 ∓ 半長·軸（軸 ＝ 路線上兩個接口那兩點的弦 ⇒ 擺在頂點上就是角平分）。 */
// line（引水渠；Blocksail 規劃的 aqueducts，Tim 2026-10-23「或直接作為一種特殊城牆」「不完全套用城牆 只是渲染走同一套邏輯」）：同一套擺法 ——
//   斷面一節一節接、轉角斜接、兩頭收尾、牆基往下延 —— 但 ① 模組照 w.kit（不照規模、繁榮度挑；沒有那一套 ⇒ 不畫、stat.skip 記 'line:<kit>'）
//   ② 高度照 w.level（起點、終點渠頂的絕對海拔，沿線線性）− 模組的 deck（索引；渠頂在模型裡的高），不跟地面（townWallY）；比地面低的那一截埋進地裡
//   ③ 沒有門、塔、轉角件（規劃裡就沒有）；實例帶 line、不算進 stat.walls（算 stat.lines）。
/** 牆接牆的分岔（Tim 2026-10-24「城牆是否可以像道路一樣 支援分岔（目前分岔處無法正常連接）」「需要額外的連結處算法」）：
 *  以前每道牆各畫各的 ⇒ 開放的牆兩頭一律收尾 ⇒ 接到別道牆的那一頭，收尾件戳進對方、對方的斷面照樣穿過去（只有剛好落在塔、門上才看不出來）。
 *  ⇒ 一座城的牆先整批找接點（照真的城防：牆在塔處交會）：
 *    ① 每道開放的牆兩頭 ⇒ 端點 TOWN_WALL_JX_TOL 內的併成同一個接點；接點落在別道牆的中段（離它 ≤ TOL、不在它兩頭 TOL 內）⇒ T 形，那一道是 host
 *    ② 接點上要有一件部件：擺在 host 的那一點；沒有 host（端點對端點：L 形、接成一直線、三道以上）⇒ 擺在照 id 第一道的那一頭。
 *       哪件 ＝ 那道牆那一套的轉角件（-joint，沒有 ⇒ 第一種塔）；那一點已經有門、塔蓋著 ⇒ 用它；附近有塔 ⇒ 挪過來（同轉角，townWall）
 *    ③ 接進來的牆：那一頭不收尾、斷面停在部件裡（部件半長 × TOWN_WALL_JX_SINK）⇒ 端面藏在塔身裡
 *    ④ 那一套沒有塔：T 形 ⇒ 接進來的牆伸到 host 的中線、不收尾（端面在 host 牆身裡）；兩道端點對接 ⇒ 兩頭照轉角斜接（端面 ＝ 兩道方向的角平分）
 *  回 { <牆 id>: { ends: [起點的接點, 終點的接點]（沒接 ⇒ null）, at: [{ t, node }]（這一道要在沿線 t 擺接點的部件） } }；讀數 TOWNS.stat.wallJx[城 id]。 */
function townWallJx(T, walls, W, K) {
  var out = {}, L = [], nodes = [], tol = TOWN_WALL_JX_TOL;
  walls.forEach(function (w) {
    var P = []; w.path.map(W).forEach(function (q) { var l = P[P.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.01) P.push(q); });
    if (P.length < 2) return;
    var closed = !!w.closed && P.length > 2;
    if (closed && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) <= 0.01) P.pop();
    if (closed) P = P.concat([P[0]]);
    var cum = [0]; for (var i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    L.push({ w: w, P: P, cum: cum, Lt: cum[cum.length - 1], closed: closed });
    out[w.id] = { ends: [null, null], at: [] };
  });
  function projOn(o, q) { var bd = Infinity, bt = 0; for (var s = 1; s < o.P.length; s++) { var a = o.P[s - 1], b = o.P[s], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)), d = Math.hypot(q[0] - a[0] - u * dx, q[1] - a[1] - u * dy); if (d < bd) { bd = d; bt = o.cum[s - 1] + u * Math.sqrt(L2); } } return { d: bd, t: bt }; }
  function into(o, e) { var a = e ? o.P[o.P.length - 1] : o.P[0], b = e ? o.P[o.P.length - 2] : o.P[1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }   // 從接點往牆身裡的方向
  L.forEach(function (o) {
    if (o.closed) return;
    [0, 1].forEach(function (e) {
      var p = e ? o.P[o.P.length - 1] : o.P[0], nd = null;
      nodes.forEach(function (n) { if (!nd && Math.hypot(n.p[0] - p[0], n.p[1] - p[1]) <= tol) nd = n; });
      if (!nd) nodes.push(nd = { p: p, ends: [], host: null });
      nd.ends.push({ o: o, e: e });
    });
  });
  nodes.forEach(function (nd) {
    L.forEach(function (o) {
      if (nd.host || nd.ends.some(function (x) { return x.o === o; })) return;
      var r = projOn(o, nd.p);
      if (r.d <= tol && (o.closed || (r.t > tol && r.t < o.Lt - tol))) nd.host = { o: o, t: r.t };
    });
  });
  nodes = nodes.filter(function (nd) { return nd.ends.length + (nd.host ? 1 : 0) >= 2; });
  var st = (TOWNS.stat.wallJx = TOWNS.stat.wallJx || {})[T.id] = [];
  nodes.forEach(function (nd) {
    var first = nd.ends.slice().sort(function (a, b) { return a.o.w.id < b.o.w.id ? -1 : a.o.w.id > b.o.w.id ? 1 : a.e - b.e; })[0];
    var ow = nd.host ? nd.host : { o: first.o, t: first.e ? first.o.Lt : 0 };
    var kit = townWallKit(K, T, ow.o.w, false), nm = kit && ((K.byUse[kit + '-joint'] || [])[0] || (K.byUse[kit + '-tower'] || [])[0]);
    nd.own = nm && K.M[nm] ? { id: ow.o.w.id, t: ow.t, nm: nm, h: townWallHalf(K, nm) } : null;
    //   接點上已經有門、塔（任一道接上的牆上的）⇒ 那一道負責、用它的半長（不然會在另一道上再擺一座、跟門疊在一起：陸牆內牆接金角灣海牆那一點就是門）
    nd.ends.map(function (x) { return x.o; }).concat(nd.host ? [nd.host.o] : []).forEach(function (o) {
      if (nd.ownHas) return;
      var k2 = townWallKit(K, T, o.w, false); if (!k2) return;
      var gate = (K.byUse[k2 + '-gate'] || [])[0], tw = K.byUse[k2 + '-tower'] || [];
      (o.w.gates || []).map(function (g) { return { q: W(g.at), nm: g.model && K.M[k2 + '-gate-' + g.model] ? k2 + '-gate-' + g.model : gate }; })
        .concat((o.w.towers || []).map(function (q, i) { return { q: W(q), nm: tw.length ? tw[i % tw.length] : null }; }))
        .forEach(function (c) {
          if (nd.ownHas || !c.nm || !K.M[c.nm]) return;
          var hc = townWallHalf(K, c.nm);
          if (Math.hypot(c.q[0] - nd.p[0], c.q[1] - nd.p[1]) <= hc) { nd.own = { id: o.w.id, t: projOn(o, c.q).t, nm: c.nm, h: hc }; nd.ownHas = true; }
        });
    });
    if (!nd.own && !nd.host && nd.ends.length === 2) { var ua = into(nd.ends[0].o, nd.ends[0].e), ub = into(nd.ends[1].o, nd.ends[1].e); nd.n = [ub[0] - ua[0], ub[1] - ua[1]]; }   // 斜接：一道進來的方向（−ua）＋另一道出去的方向（ub）
    nd.ends.forEach(function (x) { out[x.o.w.id].ends[x.e] = nd; });
    if (nd.own) out[nd.own.id].at.push({ t: nd.own.t, node: nd });
    nd.stat = { at: [+nd.p[0].toFixed(1), +nd.p[1].toFixed(1)], kind: nd.host ? 'T' : nd.ends.length > 2 ? '多道' : '端點', walls: nd.ends.map(function (x) { return x.o.w.id + (x.e ? '尾' : '頭'); }).concat(nd.host ? [nd.host.o.w.id + '中段'] : []),
                own: nd.own ? nd.own.id : null, nm: nd.own ? nd.own.nm : null, used: nd.own ? '?' : nd.n ? '斜接' : '伸到中線' };
    st.push(nd.stat);
  });
  return out;
}
/** 城牆部件的半長（接口 wall-a 到 wall-b；沒有 ⇒ 模型寬的一半）—— 同 townWall 裡的 half。 */
function townWallHalf(K, nm) { var m = K.M[nm].m, pa = m.pts['wall-a'], pb = m.pts['wall-b']; return pa && pb ? (pb[0] - pa[0] + 1) * m.mpv / 2 : m.size[0] * m.mpv / 2; }
function townWall(T, w, out, W, line, jx) {
  var K = TOWNS.kit, P = [], closed = !!w.closed;
  w.path.map(W).forEach(function (q) { var l = P[P.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.01) P.push(q); });   // 重複的點拿掉（頂點轉幾度才量得準）
  if (closed && P.length > 2 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) <= 0.01) P.pop();
  if (P.length < 2) return; if (P.length < 3) closed = false; if (closed) P = P.concat([P[0]]);
  var cum = [0]; for (var i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  var Ltot = cum[cum.length - 1], nV = P.length - 1; if (Ltot < 1) return;   // 頂點 0…nV（閉合 ⇒ nV 跟 0 是同一點）
  var cen = [T.cen[0] - BED.ax, T.cen[1] - BED.az];
  function at(t) { t = closed ? ((t % Ltot) + Ltot) % Ltot : Math.max(0, Math.min(Ltot, t)); for (var q = 1; q < P.length; q++) if (t <= cum[q] || q === P.length - 1) { var L = cum[q] - cum[q - 1] || 1, u = (t - cum[q - 1]) / L; return { x: P[q - 1][0] + (P[q][0] - P[q - 1][0]) * u, z: P[q - 1][1] + (P[q][1] - P[q - 1][1]) * u, a: Math.atan2(P[q][1] - P[q - 1][1], P[q][0] - P[q - 1][0]) }; } return { x: P[0][0], z: P[0][1], a: 0 }; }
  function proj(q) { var best = 0, bd = Infinity; for (var s = 1; s < P.length; s++) { var a = P[s - 1], b = P[s], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)), d = Math.hypot(q[0] - a[0] - u * dx, q[1] - a[1] - u * dy); if (d < bd) { bd = d; best = cum[s - 1] + u * Math.sqrt(L2); } } return best; }
  function dir(s) { var dx = P[s][0] - P[s - 1][0], dz = P[s][1] - P[s - 1][1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }   // 第 s 段（P[s−1] → P[s]）的方向
  function turn(v) { var a = dir(v === 0 ? nV : v), b = dir(v + 1); return Math.atan2(Math.abs(a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1]); }   // 頂點 v（閉合 0…nV−1、開放 1…nV−1）轉了幾度（弧度）
  function put(nm, c, a, sx, outward, sh) {
    var m = K.M[nm].m, hw = m.size[0] * m.mpv * sx / 2, hd = m.size[1] * m.mpv / 2;
    // 牆外朝哪一側：規劃寫了 out（Blocksail TOWN_BUILD §4：沿路線前進、北朝上看牆外在 left／right；a 一律是前進方向 ⇒ 模型 −y 朝外 ＝ (−sin a, cos a) 是右手邊）⇒ left 就翻面；
    //   舊的規劃沒有 ⇒ 照舊猜「離城心遠的那一側」（君士坦丁堡這樣猜反 13 段，2026-10-22）
    if (outward && (w.out ? w.out === 'left' : -Math.sin(a) * (c[0] - cen[0]) + Math.cos(a) * (c[1] - cen[1]) < 0)) a += Math.PI;
    var q = { k: nm, x: c[0], y: NaN, z: c[1], th: a + Math.PI / 2, sx: sx, sh: sh || 0.95 + 0.1 * townHash(w.id + ':' + out.length), r: Math.hypot(hw, hd) + 2, top: m.top, pl: null, foot: 4 * hw * hd * m.cover, col: m.roof, wall: w.id, lk: 1,
              mj: [0, 0, 0, 0], ft: [hw, hd] };                          // mj ＝ 著色器的 aJ（−x、+x 那一頭的斜接、坡度、牆基往下延；後兩個 townWallY 填）、ft ＝ 半長、半厚
    if (line) { q.line = true; q.deck = m.deck || 0; TOWNS.stat.lines = (TOWNS.stat.lines || 0) + 1; } else TOWNS.stat.walls++;
    out.push(q); return q;
  }
  function half(nm) { var m = K.M[nm].m, pa = m.pts['wall-a'], pb = m.pts['wall-b']; return pa && pb ? (pb[0] - pa[0] + 1) * m.mpv / 2 : m.size[0] * m.mpv / 2; }
  var kit = line ? (K.byUse[w.kit + '-section'] ? w.kit : null) : townWallKit(K, T, w, true);
  if (!kit) { if (line) TOWNS.stat.skip['line:' + w.kit] = (TOWNS.stat.skip['line:' + w.kit] || 0) + 1; return; }
  function lev(t) { return w.level[0] + (w.level[1] - w.level[0]) * Math.max(0, Math.min(1, t / Ltot)); }   // 引水渠：沿線那一點的渠頂（絕對海拔）
  function setLev(q, ta, tb) { if (line && w.level) q.lev = [lev(ta), lev(tb)]; }
  var gate = (K.byUse[kit + '-gate'] || [])[0], towers = K.byUse[kit + '-tower'] || [], sect = (K.byUse[kit + '-section'] || [])[0], end = (K.byUse[kit + '-end'] || [])[0], joint = (K.byUse[kit + '-joint'] || [])[0];
  if (!sect) return;
  var mS = K.M[sect].m, len = mS.len || 2, mW = mS.size[0] * mS.mpv, shW = 0.95 + 0.1 * townHash(w.id), obs = [];   // 斷面一條牆同一個深淺（一節一個 ⇒ 每 len 公尺一條色差）
  var parts = [];                                                       // 門、塔、轉角：{ nm, t（中心）, h（半長）, tower }
  (w.gates || []).forEach(function (g) {                                 // 城門那一筆帶 model（例：君士坦丁堡的金門 'golden'）⇒ 用那一套的 '<套>-gate-<model>'；沒載到就照舊用一般的門
    var nm = g.model && K.M[kit + '-gate-' + g.model] ? kit + '-gate-' + g.model : gate;
    if (nm) parts.push({ nm: nm, t: proj(W(g.at)), h: half(nm), own: nm !== gate });
  });
  (w.towers || []).forEach(function (q, i) {                              // 塔跟自帶塔的城門（own）重疊 ⇒ 不擺（金門的兩座大理石塔就是內牆第 9、10 座）
    if (!towers.length) return;
    var nm = towers[i % towers.length], t = proj(W(q)), h = half(nm);
    if (parts.some(function (o) { return o.own && apart(t - h, t + h, o.t - o.h, o.t + o.h) < 0.5; })) { TOWNS.stat.towerInGate = (TOWNS.stat.towerInGate || 0) + 1; return; }
    parts.push({ nm: nm, t: t, h: h, tower: true });
  });
  if (line) townLineUnderParts(T, w, parts, K, sect, gate, mS, mW, Ltot);   // 引水渠跨過的路：拱心對到路上（見 townLineUnderParts）
  // 牆接建築（Blocksail town.js wallJoins，TASK-0861）：w.joins 的那幾段由建築代替 ⇒ 不畫斷面、不擺塔與門、不收尾；兩頭的斷面在建築外框上垂直切齊（當成擋著的部件）
  var J = (w.joins || []).map(function (j) { var a = proj(W(j.at[0])), b = proj(W(j.at[1])), r = a <= b ? [a, b] : [b, a]; r.lot = j.lot; return r; }).filter(function (j) { return j[1] - j[0] > 0.01; });
  function inJ(t0, t1) { return J.some(function (j) { return apart(t0, t1, j[0], j[1]) === 0; }); }
  // 疊進建築（Tim 2026-10-24「目前城牆可以連接建築 但目前會出現接縫 希望能優化(參考城牆之間連接方式) 可以稍微疊進建築一點」）：
  //   牆接牆 ⇒ 斷面接在塔、門的 wall-a／wall-b，那一點在部件的外框裡（wall3 的塔 1.2 m）⇒ 牆兩側的邊都落在塔身裡，看不到端面；
  //   牆接建築以前在外框上垂直切齊 ⇒ 斜著撞上牆面（加拉塔堡 9.8°）、圓塔的弧面，牆的一側或兩側的邊露在外面 ⇒ 一道楔形的縫
  //   ⇒ 那一頭往建築裡伸：伸到牆兩側的邊（± 斷面半厚）都進了外框（地塊框；那一點不在框上 ⇒ 接在圓塔身上，半徑 ＝ 它離地塊中心多遠 —— Blocksail 特殊建築的 join.r），再多伸 TOWN_WALL_JOIN_IN；
  //   開放的牆從建築裡起頭、閉合的牆在起點切開的那一頭 ⇒ 外面沒有牆、不伸；最多伸到那一段的一半；一直進不去（擦過框角）⇒ 只伸 TOWN_WALL_JOIN_IN
  var hS = mS.size[1] * mS.mpv / 2, lotOf = {}; (T.p.lots || []).forEach(function (l) { lotOf[l.id] = l; });
  function joinIn(j) {                                                  // ⇒ [進的那一頭往裡伸幾公尺, 出的那一頭]
    var l = lotOf[j.lot]; if (!l) return [0, 0];
    var H = townHoleOf(T, l), lim = (j[1] - j[0]) / 2;
    function rect(p) { var dx = p[0] - H.x, dz = p[1] - H.z; return Math.max(Math.abs(dx * H.ux + dz * H.uz) - H.hd, Math.abs(-dx * H.uz + dz * H.ux) - H.hw); }   // ≤ 0 ⇒ 在框裡
    return [[j[0], 1], [j[1], -1]].map(function (e) {
      if (e[0] <= 0.01 || e[0] >= Ltot - 0.01) return 0;
      var s0 = at(e[0]), R = Math.abs(rect([s0.x, s0.z])) > 0.05 ? Math.hypot(s0.x - H.x, s0.z - H.z) : 0;
      function inside(x, z) { return R ? Math.hypot(x - H.x, z - H.z) <= R : rect([x, z]) <= 0.001; }
      for (var s = 0; s <= lim; s += 0.05) {
        var q = at(e[0] + e[1] * s), nx = -Math.sin(q.a), nz = Math.cos(q.a);
        if (inside(q.x + nx * hS, q.z + nz * hS) && inside(q.x - nx * hS, q.z - nz * hS)) return Math.min(lim, s + TOWN_WALL_JOIN_IN);
      }
      return Math.min(lim, TOWN_WALL_JOIN_IN);
    });
  }
  var cor = joint || towers[0], gap = Math.max(2 * len, 6);
  function apart(a0, a1, b0, b1) { var d = Infinity; (closed ? [0, Ltot, -Ltot] : [0]).forEach(function (sh) { d = Math.min(d, Math.max(0, b0 + sh - a1, a0 - b1 - sh)); }); return d; }   // 沿牆隔多遠（閉合 ⇒ 繞回來那一邊也算）
  function free(p, t, h) { return parts.every(function (o) { return o === p || apart(t - h, t + h, o.t - o.h, o.t + o.h) >= 0.5; }); }
  (jx ? jx.at : []).forEach(function (a) {                              // 牆接牆（townWallJx）：接點要有部件 —— 已經有門、塔蓋著 ⇒ 用它；gap 內有塔 ⇒ 挪過來；都沒有 ⇒ 擺接點那一件
    var t = a.t, nd = a.node, h = nd.own.h;
    if (parts.some(function (o) { return apart(t, t, o.t - o.h, o.t + o.h) === 0; })) { nd.stat.used = '已有'; return; }
    var near = parts.filter(function (o) { return o.tower && apart(t, t, o.t - o.h, o.t + o.h) < gap + h; }).sort(function (x, y) { return apart(t, t, x.t, x.t) - apart(t, t, y.t, y.t); })[0];
    if (near && free(near, t, near.h)) { near.t = t; nd.stat.used = '挪塔'; return; }
    parts.filter(function (o) { return o.tower && apart(t - h, t + h, o.t - o.h, o.t + o.h) < 0.5; }).forEach(function (o) { parts.splice(parts.indexOf(o), 1); });   // 擠在旁邊又挪不過來的塔讓位
    parts.push({ nm: nd.own.nm, t: t, h: h, tower: true }); nd.stat.used = '新擺';
  });
  if (cor) {                                                            // 轉角（轉得急的頂點）：已經有部件跨在上面 ⇒ 不動；gap 內有塔 ⇒ 塔挪到轉角上；都沒有 ⇒ 擺一件（同世紀帝國轉角的塔）
    var hc = half(cor);
    for (var v = closed ? 0 : 1; v < nV; v++) {
      var tv = cum[v]; if (turn(v) < TOWN_WALL_CORNER * Math.PI / 180) continue;
      if (parts.some(function (o) { return apart(tv, tv, o.t - o.h, o.t + o.h) === 0; })) continue;
      var near = parts.filter(function (o) { return o.tower && apart(tv, tv, o.t - o.h, o.t + o.h) < gap + hc; }).sort(function (a, b) { return apart(tv, tv, a.t, a.t) - apart(tv, tv, b.t, b.t); })[0];
      if (near && free(near, tv, near.h) && (closed || (tv - near.h > 0 && tv + near.h < Ltot))) { near.t = tv; TOWNS.stat.snapped++; continue; }
      if (!closed && (tv - hc < gap || tv + hc > Ltot - gap)) continue;   // 開放的牆兩頭有收尾
      if (!parts.every(function (o) { return apart(tv - hc, tv + hc, o.t - o.h, o.t + o.h) >= (near ? 0.5 : gap); })) continue;
      parts.push({ nm: cor, t: tv, h: hc }); TOWNS.stat.corners++;
    }
  }
  if (J.length) { var nP = parts.length; parts = parts.filter(function (o) { return !inJ(o.t - o.h, o.t + o.h); }); TOWNS.stat.joined = (TOWNS.stat.joined || 0) + (nP - parts.length); }   // 落在建築裡的塔、門、轉角
  parts.forEach(function (o) {                                          // 擺：軸 ＝ 路線上兩個接口那兩點的弦
    var t = o.t, h = o.h, A = at(t - h), B = at(t + h), s = at(t), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ax = L > 0.01 ? [dx / L, dz / L] : [Math.cos(s.a), Math.sin(s.a)];
    setLev(put(o.nm, [s.x, s.z], Math.atan2(ax[1], ax[0]), o.sx || 1, true), t, t);
    obs.push({ t0: t - h, t1: t + h, p0: [s.x - ax[0] * h, s.z - ax[1] * h], p1: [s.x + ax[0] * h, s.z + ax[1] * h], ax: ax });
  });
  var jSt = J.length && !line ? (TOWNS.stat.joins[T.id] = TOWNS.stat.joins[T.id] || {})[w.id] = [] : null;   // 讀數：每一段兩頭各伸進去幾公尺
  J.forEach(function (j) {                                              // ax1：出口那一頭的方向（建築裡轉了角）
    var k = joinIn(j), t0 = j[0] + k[0], t1 = j[1] - k[1], A = at(t0), B = at(t1);
    obs.push({ t0: t0, t1: t1, p0: [A.x, A.z], p1: [B.x, B.z], ax: [Math.cos(A.a), Math.sin(A.a)], ax1: [Math.cos(B.a), Math.sin(B.a)] });
    if (jSt) jSt.push({ lot: j.lot, in: [+k[0].toFixed(2), +k[1].toFixed(2)] });
  });
  var jE = jx && !closed ? jx.ends : [null, null], jN = [null, null];  // 牆接牆的兩頭（townWallJx）：不收尾；部件在別道牆上 ⇒ 停在部件裡（當成擋著的一段）；沒有部件、兩道對接 ⇒ 斜接的法線
  jE.forEach(function (nd, e) {
    if (!nd) return;
    var tE = e ? Ltot : 0;
    if (nd.own && nd.own.id === w.id && Math.abs(nd.own.t - tE) < 0.01) return;   // 部件就擺在這一頭（上面 jx.at）⇒ 部件自己擋著
    if (nd.own) {
      var sk = Math.min(Ltot / 2, nd.own.h * TOWN_WALL_JX_SINK), tA = e ? Ltot - sk : sk, A2 = at(tA), ax2 = [Math.cos(A2.a), Math.sin(A2.a)];
      obs.push(e ? { t0: tA, t1: Ltot + 1, p0: [A2.x, A2.z], p1: [A2.x, A2.z], ax: ax2 } : { t0: -1, t1: tA, p0: [A2.x, A2.z], p1: [A2.x, A2.z], ax: ax2 });
    } else if (nd.n) jN[e] = nd.n;
  });
  if (!closed && end) {                                                 // 收尾：模型的 wall-a（−x 那一面）接牆身 ⇒ 起點那一頭朝外轉 180°；那一頭接著建築、接著別道牆 ⇒ 不收
    var mE = K.M[end].m, lE = mE.size[0] * mE.mpv / 2, s0 = at(0), s1 = at(Ltot);
    if (!jE[0] && !J.some(function (j) { return j[0] <= 0.01; })) setLev(put(end, [s0.x - Math.cos(s0.a) * lE, s0.z - Math.sin(s0.a) * lE], s0.a + Math.PI, 1, false), 0, 0);
    if (!jE[1] && !J.some(function (j) { return j[1] >= Ltot - 0.01; })) setLev(put(end, [s1.x + Math.cos(s1.a) * lE, s1.z + Math.sin(s1.a) * lE], s1.a, 1, false), Ltot, Ltot);
  }
  // 部件之間的空檔 ⇒ 一段一段（s0、s1 ＝ 兩頭的接口與端面的法線；閉合又沒有部件 ⇒ 整圈一段，起點那一站跟最後一節斜接）
  obs.sort(function (a, b) { return a.t0 - b.t0; });
  var runs = [], tip = closed ? null : { t: 0, p: P[0], n: jN[0] || dir(1) };
  if (closed && obs.length) { var oL = obs.reduce(function (m, o) { return o.t1 > m.t1 ? o : m; }); tip = { t: oL.t1 - Ltot, p: oL.p1, n: oL.ax1 || oL.ax }; }
  obs.forEach(function (o) { if (tip && o.t0 > tip.t) runs.push({ t0: tip.t, t1: o.t0, s0: tip, s1: { p: o.p0, n: o.ax } }); if (!tip || o.t1 > tip.t) tip = { t: o.t1, p: o.p1, n: o.ax1 || o.ax }; });
  if (!closed && tip.t < Ltot) runs.push({ t0: tip.t, t1: Ltot, s0: tip, s1: { p: P[nV], n: jN[1] || dir(nV) } });
  if (closed && !obs.length) runs.push({ t0: 0, t1: Ltot, s0: null, s1: null });
  runs.forEach(function (f) {
    var L = f.t1 - f.t0; if (L < len * 0.4) return;
    var vs = [], br = [f.t0], S = [], X, D = [], N = [], j, k;
    for (var v2 = closed ? 0 : 1; v2 < nV; v2++) if (turn(v2) > 1e-3) (closed ? [0, Ltot, -Ltot] : [0]).forEach(function (sh) { var tv2 = cum[v2] + sh; if (tv2 > f.t0 && tv2 < f.t1) vs.push(tv2); });
    vs.sort(function (a, b) { return a - b; });
    vs.forEach(function (tv2) { if (tv2 - br[br.length - 1] >= len / 2 && f.t1 - tv2 >= len / 2) br.push(tv2); }); br.push(f.t1);   // 頂點一定是站（離上一站或尾巴不到半節的不算）
    for (j = 0; j + 1 < br.length; j++) { var n = Math.max(1, Math.round((br[j + 1] - br[j]) / len)); for (k = 0; k < n; k++) S.push(br[j] + k * (br[j + 1] - br[j]) / n); }
    S.push(f.t1);
    X = S.map(function (t, i2) { if (i2 === 0 && f.s0) return f.s0.p; if (i2 === S.length - 1 && f.s1) return f.s1.p; var s = at(t); return [s.x, s.z]; });
    for (k = 0; k + 1 < X.length; k++) { var dx = X[k + 1][0] - X[k][0], dz = X[k + 1][1] - X[k][1], l = Math.hypot(dx, dz) || 1; D.push([dx / l, dz / l]); }
    for (j = 0; j < X.length; j++) {                                  // 每一站的端面法線：兩節的角平分（接口照部件的軸）
      if (j === 0) N.push(f.s0 ? f.s0.n : [D[D.length - 1][0] + D[0][0], D[D.length - 1][1] + D[0][1]]);
      else if (j === X.length - 1) N.push(f.s1 ? f.s1.n : N[0]);
      else N.push([D[j - 1][0] + D[j][0], D[j - 1][1] + D[j][1]]);
    }
    for (k = 0; k + 1 < X.length; k++) {
      var A = X[k], B = X[k + 1], ch = Math.hypot(B[0] - A[0], B[1] - A[1]); if (ch < 0.05) continue;
      var q = put(sect, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], Math.atan2(B[1] - A[1], B[0] - A[0]), ch / mW, true, shW);
      var s = Math.sin(q.th), c = Math.cos(q.th), fl = s * (B[0] - A[0]) - c * (B[1] - A[1]) < 0;   // 翻了面（−y 朝外）⇒ 模型 +x 朝 A
      var kA = townMiter(fl ? N[k + 1] : N[k], s, c), kB = townMiter(fl ? N[k] : N[k + 1], s, c), d = kB - kA, lim = 0.7 * ch / q.ft[1];
      if (Math.abs(d) > lim) {                                          // 內外兩面最短留 3 成（轉太急又沒擺轉角 ⇒ 寧可留縫、不翻面）：先動接部件的那一頭（部件擋著），兩頭都接斷面 ⇒ 一起縮
        var oA = fl ? k + 1 === X.length - 1 && f.s1 : k === 0 && f.s0, oB = fl ? k === 0 && f.s0 : k + 1 === X.length - 1 && f.s1, ex = (Math.abs(d) - lim) * (d > 0 ? 1 : -1);
        if (oA && !oB) kA += ex; else if (oB && !oA) kB -= ex; else { kA *= lim / Math.abs(d); kB *= lim / Math.abs(d); }
      }
      q.mj[0] = kA; q.mj[1] = kB; q.ja = fl ? B : A; q.jb = fl ? A : B; setLev(q, fl ? S[k + 1] : S[k], fl ? S[k] : S[k + 1]);
    }
  });
}
/** 引水渠跨過的路（TASK-0837；Tim 2026-10-23「讓城鎮支援特殊類城牆建築(引水渠) 會占用建造空間 可以跨過道路」）：規劃的 w.under ＝ 路從哪幾段底下過（[t0, t1]，沿渠線的公尺；Blocksail townLineUnder）
 *  ⇒ 每一段擺一節斷面當部件、拱心對準那一段的中心（模型的 arch ＝ 最底那一層的開口，Blocksail tools/townmodels.py 量的；拱要左右對稱）；
 *  路面比開口寬 ⇒ 那一節拉長（sx ＝ 跨距 ÷ 開口，最多 TOWN_ARCH_SX；前後的斷面照空檔填法自己伸縮）；kit 有 -gate 而且它的開口放得下 ⇒ 優先用它、不拉長。
 *  兩段之間不到一節 ⇒ 併成一段；超過上限、擠到頭尾 ⇒ 照擺、記 TOWNS.stat.under[城].tight（墩會站在路上）。沒有 arch ⇒ 不動（照舊均分）。 */
var TOWN_ARCH_SX = 1.6;                                                  // 拱最多拉長幾倍〔佔位；Blocksail tools/town_report.cjs ARCH_SX 同一個數〕
function townLineUnderParts(T, w, parts, K, sect, gate, mS, mW, Ltot) {
  var U = (w.under || []).map(function (u) { return [u.t[0], u.t[1]]; }).sort(function (a, b) { return a[0] - b[0]; }), st = (TOWNS.stat.under || {})[T.id] || { n: 0, tight: [] };
  if (!U.length || !mS.arch) return;
  var M = [];
  U.forEach(function (u) { var l = M[M.length - 1]; if (l && u[0] - l[1] < mW) l[1] = Math.max(l[1], u[1]); else M.push(u.slice()); });
  var op = mS.arch[1] - mS.arch[0], mG = gate && K.M[gate].m, opG = mG && mG.arch ? mG.arch[1] - mG.arch[0] : 0;
  M.forEach(function (u) {
    var need = u[1] - u[0], c = (u[0] + u[1]) / 2, o;
    if (opG && need <= opG) o = { nm: gate, h: mG.size[0] * mG.mpv / 2 };
    else { var sx = Math.max(1, need / op), cap = Math.min(sx, TOWN_ARCH_SX); o = { nm: sect, h: mW * cap / 2, sx: cap }; if (sx > TOWN_ARCH_SX) st.tight.push({ t: [+u[0].toFixed(1), +u[1].toFixed(1)], need: +need.toFixed(2), got: +(op * cap).toFixed(2) }); }
    o.t = Math.max(o.h, Math.min(Ltot - o.h, c));
    if (Ltot < 2 * o.h) return;
    if (Math.abs(o.t - c) > 0.01) st.tight.push({ t: [+u[0].toFixed(1), +u[1].toFixed(1)], end: true });   // 擠到頭尾：拱心對不到路
    if (parts.some(function (p) { return Math.max(p.t - p.h, o.t - o.h) < Math.min(p.t + p.h, o.t + o.h); })) return;   // 跟別的部件疊到（引水渠沒有門塔；保險）
    parts.push(o); st.n++;
  });
}
/** 斜接：模型（轉 θ：+x ＝ (sinθ, −cosθ)、+y ＝ (−cosθ, −sinθ)）那一頭的端面要落在法線 n 的鉛直面上 ⇒ 橫過 1 m 沿 x 挪多少（著色器 a ＋＝ b·k）。 */
function townMiter(n, s, c) {
  var nx = s * n[0] - c * n[1], ny = -c * n[0] - s * n[1];
  return Math.abs(nx) < 1e-3 ? 0 : Math.max(-TOWN_WALL_KMAX, Math.min(TOWN_WALL_KMAX, -ny / nx));
}
/** 城牆的實例那一塊載進來了 ⇒ 高度：斷面照兩頭的站（地面；水上照海面 0）線性接 ⇒ 坡度 g，別的部件照中心；牆基（模型 z 0 那一層）往下延到腳下最低的地面再 0.3 m。地面沒載 ⇒ false（下次分組再試）。 */
function townWallY(q) {
  var s = Math.sin(q.th), c = Math.cos(q.th), hw = q.ft[0], hd = q.ft[1], y, g = 0, lo = 0;
  function gnd(p) { return Math.max(0, townGround(p[0], p[1])); }
  if (q.lev) { var la = q.lev[0] - q.deck, lb = q.lev[1] - q.deck; if (!(gnd([q.x, q.z]) === gnd([q.x, q.z]))) return false; y = (la + lb) / 2; g = (lb - la) / (2 * hw); }   // 引水渠：照渠頂（見 townWall 的 line）
  else if (q.ja) { var ya = gnd(q.ja), yb = gnd(q.jb); y = (ya + yb) / 2; g = (yb - ya) / (2 * hw); } else y = gnd([q.x, q.z]);
  if (!(y === y) || !(g === g)) return false;
  [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]].forEach(function (o) {
    var a = o[0] * hw, b = o[1] * hd, gy = townGround(q.x + a * s - b * c, q.z - a * c - b * s); if (gy === gy) lo = Math.max(lo, y + g * a - gy);
  });
  q.y = y; q.mj[2] = g; q.mj[3] = Math.min(30, lo + 0.3); q.r += Math.abs(g) * hw + q.mj[3];
  return true;
}
/** 路面讀畫面地形的三角形（跟 bedMesh 的對角線一樣），不用雙線性高度把路切進坡面。 */
function townRoadHeight(x, z) {
  var q = townCell(x, z); if (!q) return NaN;
  var C = q.C, h = townHv(C), n = C.n, i = Math.min(n - 2, Math.floor(q.u)), j = Math.min(n - 2, Math.floor(q.v)), u = q.u - i, v = q.v - j, o = j * n + i;
  return (u + v <= 1 ? h[o] + u * (h[o + 1] - h[o]) + v * (h[o + n] - h[o]) : h[o + n + 1] + (1 - u) * (h[o + n] - h[o + n + 1]) + (1 - v) * (h[o + 1] - h[o + n + 1])) / 10;
}
/** 整個路網的聯集：共用 2 m 格、格子的兩個三角形各裁一次距離場，路口不會有重疊面或尖長斜接。
 *  格子沿海域座標（地形點距為整數公尺），對角線同 bedMesh；只掃路邊的格，不掃整個城市外框。
 *  z 只是塊還沒到時的顯示備援，不改規劃、不寫模擬高度。
 *  產生器、⛔ 不碰外面的變數（TASK-0817）：原始碼整段送進 Worker 一口氣跑完（townRoadSurface）；開不了 Worker ⇒ 這一頁照 TOWN_MESH_MS 一段一段跑。
 *  roads ＝ [{ w, col, P, z }]（海域座標）、G ＝ 分區多寬（公尺）⇒ { v：每點 6 個（往東、往南、備援高度、顏色 rgb）, i：三角形, e：外緣（只為真正的外緣加側面）,
 *    ao／al：每一點旁邊的三角形（CSR：al[ao[k]..ao[k+1]) ＝ 那幾個三角形在 i 的位置）, tiles：[{ x, z, tri, edge }]（地面分區：三角形照重心、外緣照中點；townGroundPrep） }。
 *  君士坦丁堡（1,232 條路）以前在這一頁一段一段跑，合計 5.2 s 的主執行緒（2026-10-22 量）。
 *  窄路（寬 < 3.5 m）經過的格細分成 1 m（Tim 2026-10-23：和平港的路「出現破損」）：2 m 的格上，距離場在三角形裡是線性內插，
 *    窄路從格點之間穿過去就只剩格點旁邊幾小塊 —— 100 m 的直路量過：寬 2 m 只鋪到 59～62%、碎成 12～36 塊，2.5 m 84～89%、1～7 塊，3 m 起 96% 以上、一塊。
 *    細分的格：窄路的中心線 hw ＋ 3 m 內（格中心算）⇒ 那幾格的 9 個點照所有的路取最小（寬路照樣算進去）；旁邊沒細分的格在相鄰那一邊插中點、照中心扇形切，
 *    兩邊的邊一點一點對上（沒有 T 字接縫、沒有多出來的外緣）。寬 1 m 的格上，寬 1.5 m 的路 ≈ 2 m 格上的 3 m ⇒ 最窄照這個算（各城的路最窄 2 m）。 */
function* townRoadGen(roads, G) {
  var nodes = new Map(), cells = new Map(), fine = new Set(), ov = [], oi = [], verts = new Map(), n = 0, FINE_W = 3.5, FINE_PAD = 3;
  function GK(x, z) { return (x + 1048576) * 4194304 + z + 1048576; }   // 格點的鍵（整數公尺；±1,048 km 內不撞）⇒ 數字比字串快
  function partsOf(r) {                                                     // 一條路每一段切成 ≤ 16 m 的小段 ⇒ [{ a, b, za, zb, L2, x0, z0, x1, z1, loX, hiX, loZ, hiZ（2 m 格的外框） }…]
    var hw = r.w / 2, out = [];
    for (var q = 1; q < r.P.length; q++) {
      var a = r.P[q - 1], b = r.P[q], za = r.z[q - 1], zb = r.z[q], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
      if (za == null || zb == null || L2 < 1e-8) continue;
      var np = Math.max(1, Math.ceil(Math.sqrt(L2) / 16));
      for (var part = 0; part < np; part++) {
        var x0 = a[0] + dx * part / np, z0 = a[1] + dz * part / np, x1 = a[0] + dx * (part + 1) / np, z1 = a[1] + dz * (part + 1) / np;
        out.push({ a: a, b: b, za: za, zb: zb, L2: L2, x0: x0, z0: z0, x1: x1, z1: z1, loX: 2 * Math.floor((Math.min(x0, x1) - hw - 2) / 2), hiX: 2 * Math.ceil((Math.max(x0, x1) + hw + 2) / 2), loZ: 2 * Math.floor((Math.min(z0, z1) - hw - 2) / 2), hiZ: 2 * Math.ceil((Math.max(z0, z1) + hw + 2) / 2) });
      }
    }
    return out;
  }
  // ① 窄路經過的 2 m 格（那一小段的外框裡、格中心離小段 ≤ hw ＋ FINE_PAD）標成細分 ⇒ 格的 9 個點都在那條窄路的外框裡（下面一定量得到）
  for (var r of roads) {
    if (!(r.w > 0) || r.w >= FINE_W) continue;
    for (var s of partsOf(r)) {
      var sx = s.x1 - s.x0, sz = s.z1 - s.z0, S2 = sx * sx + sz * sz || 1e-12;
      for (var z = s.loZ; z < s.hiZ; z += 2) for (var x = s.loX; x < s.hiX; x += 2) {
        var u = Math.max(0, Math.min(1, ((x + 1 - s.x0) * sx + (z + 1 - s.z0) * sz) / S2));
        if (Math.hypot(x + 1 - s.x0 - u * sx, z + 1 - s.z0 - u * sz) <= r.w / 2 + FINE_PAD) fine.add(GK(x, z));
      }
      yield;
    }
  }
  // ② 距離場：2 m 的格點（全部的路）＋細分格裡的 1 m 格點（全部的路：寬路照樣要算進去，不然窄路接寬路的路口會缺一塊）
  var PA, PB, ZA, ZB, L2, DX, DZ, HW, COL;
  function node(x, z) {
    var u = Math.max(0, Math.min(1, ((x - PA[0]) * DX + (z - PA[1]) * DZ) / L2)), ex = x - PA[0] - u * DX, ez = z - PA[1] - u * DZ, d = Math.sqrt(ex * ex + ez * ez) - HW, key = GK(x, z), old = nodes.get(key);
    if (!old || d < old[2]) nodes.set(key, [x, z, d, ZA + (ZB - ZA) * u, COL]);
  }
  for (var r of roads) {
    HW = r.w / 2; COL = r.col; if (!(HW > 0)) continue;
    for (var s of partsOf(r)) {
      PA = s.a; PB = s.b; ZA = s.za; ZB = s.zb; L2 = s.L2; DX = PB[0] - PA[0]; DZ = PB[1] - PA[1];
      for (var z = s.loZ; z <= s.hiZ; z += 2) for (var x = s.loX; x <= s.hiX; x += 2) {
        node(x, z);
        if (x < s.hiX && z < s.hiZ) { var key = GK(x, z); cells.set(key, [x, z]); if (fine.size && fine.has(key)) { node(x + 1, z); node(x, z + 1); node(x + 1, z + 1); node(x + 2, z + 1); node(x + 1, z + 2); } }
      }
      yield;
    }
  }
  function vertex(p) {
    var key = p[0].toFixed(6) + ':' + p[1].toFixed(6), k = verts.get(key);
    if (k != null) return k;
    k = ov.length / 6; ov.push(p[0], p[1], p[3], p[4][0], p[4][1], p[4][2]); verts.set(key, k); return k;
  }
  function clip(P) {                                                      // P 多於 3 點（邊上插了中點）⇒ 照中心扇形切：從 C[0] 扇形切會在共線的中點那裡切出面積 0 的三角形、中點就沒接上
    var C = [];
    for (var j = 0; j < P.length; j++) {
      var a = P[j], b = P[(j + 1) % P.length], ia = a[2] <= 0, ib = b[2] <= 0;
      if (ia) C.push(a);
      if (ia !== ib) { var u = a[2] / (a[2] - b[2]); C.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 0, a[3] + (b[3] - a[3]) * u, ia ? a[4] : b[4]]); }
    }
    if (C.length < 3) return;
    var ids = C.map(vertex);
    if (P.length > 3) {
      var m = [0, 0, 0, 0, C[0][4]]; C.forEach(function (p) { m[0] += p[0] / C.length; m[1] += p[1] / C.length; m[3] += p[3] / C.length; });
      var im = vertex(m);
      for (j = 0; j < C.length; j++) {
        var b2 = C[j], c2 = C[(j + 1) % C.length], ar = (b2[1] - m[1]) * (c2[0] - m[0]) - (b2[0] - m[0]) * (c2[1] - m[1]);
        if (ar > 1e-9) oi.push(im, ids[j], ids[(j + 1) % C.length]);
      }
      return;
    }
    for (j = 1; j + 1 < C.length; j++) {
      var a = C[0], b = C[j], c = C[j + 1], area = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
      if (area > 1e-9) oi.push(ids[0], ids[j], ids[j + 1]);
    }
  }
  function nd(x, z) { return nodes.get(GK(x, z)); }
  for (var q of cells.values()) {
    var x = q[0], z = q[1], a = nd(x, z), b = nd(x + 2, z), c = nd(x, z + 2), d = nd(x + 2, z + 2);
    if (fine.has(GK(x, z))) {                                          // 細分的格：4 個 1 m 的小格，對角線同 2 m 的格（同 bedMesh）
      for (var j2 = 0; j2 < 2; j2++) for (var i2 = 0; i2 < 2; i2++) {
        var fa = nd(x + i2, z + j2), fb = nd(x + i2 + 1, z + j2), fc = nd(x + i2, z + j2 + 1), fd = nd(x + i2 + 1, z + j2 + 1);
        if (fa && fb && fc && fd) { clip([fa, fc, fb]); clip([fb, fc, fd]); }
      }
    } else if (a && b && c && d) {                                        // 旁邊是細分的格 ⇒ 相鄰那一邊插中點（T1 ＝ a c b：左邊 a→c、下邊 b→a；T2 ＝ b c d：上邊 c→d、右邊 d→b）
      var mL = fine.has(GK(x - 2, z)) ? nd(x, z + 1) : null, mB = fine.has(GK(x, z - 2)) ? nd(x + 1, z) : null;
      var mT = fine.has(GK(x, z + 2)) ? nd(x + 1, z + 2) : null, mR = fine.has(GK(x + 2, z)) ? nd(x + 2, z + 1) : null;
      var T1 = [a]; if (mL) T1.push(mL); T1.push(c, b); if (mB) T1.push(mB);
      var T2 = [b, c]; if (mT) T2.push(mT); T2.push(d); if (mR) T2.push(mR);
      clip(T1); clip(T2);
    }
    if (++n % 256 === 0) yield;
  }
  // 只為真正的外緣加側面；相鄰路、內部格線與路口都沒有內牆。
  var edges = new Map(), oe = [];
  for (var f = 0; f < oi.length; f += 3) {
    for (var i = 0; i < 3; i++) { var a = oi[f + i], b = oi[f + (i + 1) % 3], key = Math.min(a, b) * 2097152 + Math.max(a, b), e = edges.get(key); if (e) e[2]++; else edges.set(key, [a, b, 1]); }
    if (++n % 256 === 0) yield;
  }
  edges.forEach(function (e) { if (e[2] === 1) oe.push(e[0], e[1]); });
  var nv = ov.length / 6, ao = new Uint32Array(nv + 1), al = new Uint32Array(oi.length), fill, T = new Map();
  for (f = 0; f < oi.length; f++) ao[oi[f] + 1]++;
  for (i = 0; i < nv; i++) ao[i + 1] += ao[i];
  fill = ao.slice(0, nv);
  for (f = 0; f < oi.length; f += 3) for (i = 0; i < 3; i++) al[fill[oi[f + i]]++] = f;
  function tile(e, s) { var x = Math.floor(e / G), z = Math.floor(s / G), k = x + '_' + z, t = T.get(k); if (!t) T.set(k, t = { x: x, z: z, tri: [], edge: [] }); return t; }
  for (f = 0; f < oi.length; f += 3) {
    var A = oi[f] * 6, B = oi[f + 1] * 6, C = oi[f + 2] * 6; tile((ov[A] + ov[B] + ov[C]) / 3, (ov[A + 1] + ov[B + 1] + ov[C + 1]) / 3).tri.push(f);
    if (++n % 4096 === 0) yield;
  }
  for (f = 0; f < oe.length; f += 2) { var A2 = oe[f] * 6, B2 = oe[f + 1] * 6; tile((ov[A2] + ov[B2]) / 2, (ov[A2 + 1] + ov[B2 + 1]) / 2).edge.push(f); }
  var tiles = []; T.forEach(function (t) { tiles.push({ x: t.x, z: t.z, tri: new Uint32Array(t.tri), edge: new Uint32Array(t.edge) }); });
  return { v: new Float64Array(ov), i: new Uint32Array(oi), e: new Uint32Array(oe), ao: ao, al: al, tiles: tiles };
}
/** 城的路面（townRoadGen）：Worker 算（Blob；一個 Worker 給所有城排隊）⇒ Promise。開不了 ⇒ 這一頁一段一段跑（每段 TOWN_MESH_MS，跟以前一樣讓出去）。 */
var TOWNRD = { w: null, ok: null, id: 0, wait: {} };
function townRoadSurface(roads) {
  var L = roads.map(function (r) { return { w: r.w, col: TOWN_COL[r.kind] || TOWN_COL.street, P: r.P, z: r.z }; }), W = TOWNRD;
  if (W.ok === null) {
    try {
      var src = townRoadGen.toString() + '\nonmessage = function (e) { var m = e.data, g = townRoadGen(m.roads, m.G), r; do { r = g.next(); } while (!r.done); var o = r.value, tr = [o.v.buffer, o.i.buffer, o.e.buffer, o.ao.buffer, o.al.buffer]; o.tiles.forEach(function (t) { tr.push(t.tri.buffer, t.edge.buffer); }); o.id = m.id; postMessage(o, tr); };\n';
      W.w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      W.w.onmessage = function (e) { var f = W.wait[e.data.id]; delete W.wait[e.data.id]; if (f) f[0](e.data); };
      W.w.onerror = function (e) {                                       // Worker 掛了 ⇒ 收掉、排著的改在這一頁算
        if (e && e.preventDefault) e.preventDefault();
        try { W.w.terminate(); } catch (x) { /* 已經停了 */ }
        W.w = null; W.ok = false; var Q = W.wait; W.wait = {};
        Object.keys(Q).forEach(function (id) { townRoadPage(Q[id][2]).then(Q[id][0], Q[id][1]); });
      };
      W.ok = true;
    } catch (e) { W.ok = false; W.w = null; }
  }
  if (!W.ok) return townRoadPage(L);
  return new Promise(function (ok, bad) { var id = ++W.id; W.wait[id] = [ok, bad, L]; W.w.postMessage({ id: id, roads: L, G: TOWN_GT_SZ }); });
}
function townRoadPage(L) {
  var g = townRoadGen(L, TOWN_GT_SZ);
  return new Promise(function (ok, bad) {
    (function run() {
      try { var t1 = performance.now() + TOWN_MESH_MS, r; do { r = g.next(); } while (!r.done && performance.now() < t1); if (r.done) ok(r.value); else setTimeout(run, 0); }
      catch (e) { bad(e); }
    })();
  });
}

// ── 地面的帶子分區（TASK-0817；Tim 2026-10-22「一些大城可以分區載入(君士坦丁堡) 只有城牆跟道路一次載入」） ──
// 以前一座城一份網格（路面、廣場、碼頭、棧橋），地形每到一塊就整座重建：君士坦丁堡一次 130～450 ms（同一格）。
// ⇒ 照海圖塊（BED.A.chunk，1 km）切成區：三角形照重心、外緣的側面照中點、廣場照中心、碼頭／棧橋照第一點分到區；
//   每區記著它讀過哪幾塊的高度（deps）⇒ 那一塊到了只重建那幾區；一格最多 TOWN_GT_MAX 區、照背景預算，離鏡頭近的先。
//   區照 TOWN_GT_SZ（250 m）切：一區要壓在背景預算（08_seabed.js BED_PUMP_MS 8 ms）上下 —— 君士坦丁堡照 1 km 切一區 25～40 ms、500 m 最久 32 ms（路網密）。
//   路面的分區、每一點旁邊有哪幾個三角形，跟路面一起在 Worker 算好（townRoadGen 的 tiles、ao／al）⇒ 這一頁只把廣場、碼頭、棧橋分進去。
//   法線照「這一點旁邊所有的三角形」（跨區也算）⇒ 接縫跟整座一份時一樣。
var TOWN_GT_MAX = 2, TOWN_GT_SZ = 250;
/** 分區（路面到了、城建好時各一次）：每區 { tri, edge, plaza, quay, pier, g, dirty, deps }。 */
function townGroundPrep(T) {
  var S = TOWN_GT_SZ, R = T.roadSurface, p = T.p, G = {};
  function at(x, z) { var k = x + '_' + z; return G[k] || (G[k] = { k: k, cx: (x + 0.5) * S, cz: (z + 0.5) * S, tri: [], edge: [], plaza: [], stair: [], quay: [], pier: [], field: [], g: null, dirty: true, deps: {} }); }
  function tile(e, s) { return at(Math.floor(e / S), Math.floor(s / S)); }
  if (R) R.tiles.forEach(function (t) { var q = at(t.x, t.z); q.R = R; q.tri = t.tri; q.edge = t.edge; });   // q.R：這一區照哪一份路面（建築模式只換改到的那幾區，townReplace）
  (p.lots || []).forEach(function (l) { if (l.use === 'plaza') { var c2 = T.E(l.at); tile(c2[0], c2[1]).plaza.push(l); } });
  (p.quay || []).forEach(function (q) { var c2 = T.E(q.path[0]); tile(c2[0], c2[1]).quay.push(q); });
  (p.stairs || []).forEach(function (q) { var c2 = T.E(q.path[0]); tile(c2[0], c2[1]).stair.push(q); });   // 路接地塊的樓梯（Blocksail town.js roadStairs）：照路那一頭分區
  (T.fields || []).forEach(function (F) { var c2 = [(F.R[0][0] + F.R[2][0]) / 2, (F.R[0][1] + F.R[2][1]) / 2]; tile(c2[0], c2[1]).field.push(F); });
  (p.piers || []).forEach(function (q) { var c2 = T.E(q.path[0]); tile(c2[0], c2[1]).pier.push(q); });
  if (T.gt) Object.keys(T.gt).forEach(function (k) { var g = T.gt[k].g, gf = T.gt[k].gf; if (g) townGpuFree(g); if (gf) townGpuFree(gf); });
  T.gt = G;
}
function townGpuFree(g) { gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.vb); gl.deleteBuffer(g.ib); }
/** 塊 (cx, cy) 到了（或整地換了）⇒ 讀過它的那幾區要重建。 */
function townGroundDirty(T, cx, cy) {
  var k = cx + '_' + cy; if (!T.gt) return;
  Object.keys(T.gt).forEach(function (t) { var q = T.gt[t]; if (q.deps[k]) q.dirty = true; });
}
/** 下一個要建的區：骨架先出（TOWN_SKEL）⇒ 有棧橋、碼頭的區先；同一級離鏡頭（世界座標）近的先。 */
function townGroundNext(T, eye) {
  var best = null, bd = Infinity;
  Object.keys(T.gt || {}).forEach(function (k) { var q = T.gt[k]; if (!q.dirty) return; var dx = q.cx - BED.ax - eye[0], dz = q.cz - BED.az - eye[2], d = dx * dx + dz * dz + (TOWN_SKEL && !townGroundPier(q) && !q.edit ? 1e15 : 0); if (d < bd) { bd = d; best = q; } });
  return best;
}
/** 這一區有棧橋或碼頭。 */
function townGroundPier(q) { return q.pier.length > 0 || q.quay.length > 0; }
/** 城 T 的一區 ⇒ 一份網格（位置、法線、顏色）；那一區沒東西 ⇒ null。 */
var TOWN_STAIR_RISE = 0.17;                                              // 樓梯一階最高（公尺；同 Blocksail town.js STAIR_RISE）
function townGroundTile(T, Q) {
  var V = [], I = [], S = BED.A.chunk, deps = {};
  function vtx(x, y, z, c, nx, ny, nz) { V.push(x, y, z, nx == null ? 0 : nx, ny == null ? 1 : ny, nz == null ? 0 : nz, c[0], c[1], c[2]); return V.length / 9 - 1; }
  function W(q) { var e = T.E(q); return [e[0] - BED.ax, e[1] - BED.az]; }
  function hgt(x, z) { deps[Math.floor((x + BED.ax) / S) + '_' + Math.floor((z + BED.az) / S)] = 1; return townRoadHeight(x, z); }   // 讀過哪一塊（世界 ⇒ 海域）
  // 拓樸只算一次；地形塊或整地到了，只重取高度，不再用中心線的 z 把路埋進地裡。
  var R = Q.R || T.roadSurface, v = R ? R.v : null, Ri = R ? R.i : null, H = new Map(), N = new Map(), map = new Map();
  function h(k) { var y = H.get(k); if (y === undefined) { y = hgt(v[k * 6] - BED.ax, v[k * 6 + 1] - BED.az); y = (y === y ? y : v[k * 6 + 2]) + TOWN_ROAD_LIFT; H.set(k, y); } return y; }
  function nrm(k) {                                                       // 這一點旁邊所有三角形的面法線加起來（跨區也算）
    var n = N.get(k); if (n) return n; n = [0, 0, 0];
    for (var j = R.ao[k]; j < R.ao[k + 1]; j++) {
      var f = R.al[j], a = Ri[f], b = Ri[f + 1], c = Ri[f + 2], ux = v[b * 6] - v[a * 6], uy = h(b) - h(a), uz = v[b * 6 + 1] - v[a * 6 + 1], vx = v[c * 6] - v[a * 6], vy = h(c) - h(a), vz = v[c * 6 + 1] - v[a * 6 + 1];
      n[0] += uy * vz - uz * vy; n[1] += uz * vx - ux * vz; n[2] += ux * vy - uy * vx;
    }
    var L = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / L, n[1] / L, n[2] / L]; N.set(k, n); return n;
  }
  function road(k) { var o = map.get(k); if (o != null) return o; var n = nrm(k); o = vtx(v[k * 6] - BED.ax, h(k), v[k * 6 + 1] - BED.az, [v[k * 6 + 3], v[k * 6 + 4], v[k * 6 + 5]], n[0], n[1], n[2]); map.set(k, o); return o; }
  Q.tri.forEach(function (f) { I.push(road(Ri[f]), road(Ri[f + 1]), road(Ri[f + 2])); });
  Q.edge.forEach(function (f) {
    var ea = R.e[f], eb = R.e[f + 1], ax = v[ea * 6], az = v[ea * 6 + 1], bx = v[eb * 6], bz = v[eb * 6 + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, k = V.length / 9;
    var col = [v[ea * 6 + 3] * 0.74, v[ea * 6 + 4] * 0.74, v[ea * 6 + 5] * 0.74], ha = h(ea), hb = h(eb);
    vtx(ax - BED.ax, ha, az - BED.az, col, -dz / L, 0, dx / L);
    vtx(bx - BED.ax, hb, bz - BED.az, col, -dz / L, 0, dx / L);
    vtx(bx - BED.ax, hb - TOWN_ROAD_LIFT - 0.03, bz - BED.az, col, -dz / L, 0, dx / L);
    vtx(ax - BED.ax, ha - TOWN_ROAD_LIFT - 0.03, az - BED.az, col, -dz / L, 0, dx / L);
    I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  //   特殊建築底下的廣場（地基；Blocksail world/town.js ②'，Tim 2026-10-23「用廣場當地基」）：l.hole ＝ [w, d] 建築那一塊 ⇒ 只鋪外圈（不壓在建築底下、下沉的池子不蓋住）；
  //   四邊補石基的側面：那一邊的地面比鋪面低 ⇒ 到那一邊最低的地面再下 0.3 m（同 townPlinth）
  //   以前只有規劃標了 l.base（坡上）才補 ⇒ 平地上的廣場旁邊的路、地塊整得比它低（托爾圖加的廣場：靠海那一邊的路整到 23.4 m、廣場 25.9 m），
  //   最後一格地形網格從框裡就往下斜 ⇒ 鋪面浮在半空、底下看得到草（Tim 2026-10-24「托爾圖加廣場目前會離地漂浮(沒有地基)」）⇒ 不看 base，四邊都量；每 2 m 取一點（邊中間的低點也量得到）
  Q.plaza.forEach(function (l) {                                         // 廣場：整平的那一塊鋪石
    var th = l.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), y = l.h + 0.06, base = V.length / 9, S4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    function at(s, w, d) { return W([l.at[0] + s[0] * d / 2 * cs - s[1] * w / 2 * sn, l.at[1] + s[0] * d / 2 * sn + s[1] * w / 2 * cs]); }
    var O = S4.map(function (s) { return at(s, l.w, l.d); }), e, k;
    if (!l.hole) { O.forEach(function (c) { vtx(c[0], y, c[1], TOWN_COL.plaza); }); I.push(base, base + 1, base + 2, base, base + 2, base + 3); }
    else if (l.hole[0] < l.w - 0.01 || l.hole[1] < l.d - 0.01) {        // 外擴 0 ⇒ 沒有外圈（建築自己就是鋪面）
      var In = S4.map(function (s) { return at(s, l.hole[0], l.hole[1]); });
      O.forEach(function (c) { vtx(c[0], y, c[1], TOWN_COL.plaza); }); In.forEach(function (c) { vtx(c[0], y, c[1], TOWN_COL.plaza); });
      for (e = 0; e < 4; e++) { k = (e + 1) % 4; I.push(base + e, base + k, base + 4 + k, base + e, base + 4 + k, base + 4 + e); }
    }
    var dk = [TOWN_COL.plaza[0] * 0.78, TOWN_COL.plaza[1] * 0.78, TOWN_COL.plaza[2] * 0.78], cx = (O[0][0] + O[2][0]) / 2, cz = (O[0][1] + O[2][1]) / 2;
    for (e = 0; e < 4; e++) {
      var a = O[e], b = O[(e + 1) % 4], lo = Infinity, ns = Math.max(4, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (var t = 0; t <= ns; t++) { var gy = hgt(a[0] + (b[0] - a[0]) * t / ns, a[1] + (b[1] - a[1]) * t / ns); if (gy === gy) lo = Math.min(lo, gy); }
      if (lo === Infinity || lo > y - 0.05) continue;
      var bot = lo - 0.3, mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz, nl = Math.hypot(mx, mz) || 1, b2 = V.length / 9;
      [[a, y], [b, y], [b, bot], [a, bot]].forEach(function (p) { vtx(p[0][0], p[1], p[0][1], dk, mx / nl, 0, mz / nl); });
      I.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3);
    }
  });
  // 路接地塊的樓梯（Blocksail world/town.js roadStairs，TASK-0861）：path ＝ [路那一頭, 地塊那一頭]、z ＝ 兩頭的高、n 階、寬 w ⇒ 一階一個實心的方塊（頂面、四個側面），
  //   往上走：第 k 階頂 ＝ z0 ＋ (k＋1)·(z1 − z0)／n（最後一階 ＝ 地塊的 h）；往下走：第 k 階頂 ＝ z0 ＋ k·(z1 − z0)／n（第一階跟路面齊、最後一級落到地塊上）
  //   ⇒ 兩種都是那一段的直線斜坡在踏面底下（往下走的規劃把那一段路面拉成這條斜線，地形照它整）；底往下到那一階四角最低的地面再 0.3 m（同石基）
  //   路那一頭的高照整過地的路面重量（地形 ＋ TOWN_ROAD_LIFT）、階數跟著重算（一階 ≤ TOWN_STAIR_RISE）：地塊的邊坡最後套、會把它旁邊幾公尺的路面拉向地塊的高
  //   （君士坦丁堡 gul-plaza-link-3：規劃 8.0 m、整完地 6.9 m）⇒ 照規劃的 z0 畫，樓梯頂跟路面會差一截；地形還沒到 ⇒ 照規劃
  (Q.stair || []).forEach(function (st) {
    var A = W(st.path[0]), B = W(st.path[1]), dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), n = Math.max(1, st.n | 0); if (L < 0.05) return;
    var ux = dx / L, uz = dz / L, hw = st.w / 2, z1 = st.z[1], g0 = hgt(A[0], A[1]), z0 = g0 === g0 ? g0 + TOWN_ROAD_LIFT : st.z[0], col = TOWN_COL.plaza, dk = [col[0] * 0.78, col[1] * 0.78, col[2] * 0.78];
    if (g0 === g0) { if (Math.abs(z1 - z0) < 0.05) return; n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / TOWN_STAIR_RISE - 1e-9)); }
    function P(a, b) { return [A[0] + ux * a - uz * b, A[1] + uz * a + ux * b]; }
    for (var k = 0; k < n; k++) {
      var a0 = L * k / n, a1 = L * (k + 1) / n, top = z0 + (z1 - z0) * (k + (z1 > z0 ? 1 : 0)) / n + 0.02, C = [P(a0, -hw), P(a1, -hw), P(a1, hw), P(a0, hw)], lo = Infinity;
      C.forEach(function (c) { var g = hgt(c[0], c[1]); if (g === g) lo = Math.min(lo, g); });
      var bot = Math.min(lo === Infinity ? Math.min(z0, z1) : lo, top) - 0.3, b0 = V.length / 9;
      C.forEach(function (c) { vtx(c[0], top, c[1], col); }); I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
      [[0, 1, 0, -1], [1, 2, 1, 0], [2, 3, 0, 1], [3, 0, -1, 0]].forEach(function (f) {   // 四個側面：右、前（往地塊）、左、後（往路）—— 法線照沿路 (a, b) 的方向
        var p = C[f[0]], q = C[f[1]], nx = ux * f[2] - uz * f[3], nz = uz * f[2] + ux * f[3], b1 = V.length / 9;
        [[p, top], [q, top], [q, bot], [p, bot]].forEach(function (v2) { vtx(v2[0][0], v2[1], v2[0][1], dk, nx, 0, nz); });
        I.push(b1, b1 + 1, b1 + 2, b1, b1 + 2, b1 + 3);
      });
    }
  });
  // 附屬的田（TASK-0862）：翻過的土（作物的 place.soil ＝ [壟, 溝] 換土色：麥田 ⇒ 金黃的麥茬，遠看才是一片金黃），一條壟一條溝沿進深方向（同作物的行，行距照作物的 place.field[0]）；貼著地面（每 2 m 取一次高度），高出 TOWN_ROAD_LIFT
  //   遠處的田（TASK-0879；63_trees.js 檔頭「遠處的田」）：同一塊田、同一套點再一份網格 ⇒ Q.gf（位置、貼圖座標 u 照第幾行 ÷ 一張的行數、v 照沿行的公尺 ÷ 一張多長、第幾層、那一種的 view）
  var VF = [], IF = [], FC = TREE_FIELD_CARD && TREES.on ? treeFieldCrops() : null;
  if (Q.gf) { townGpuFree(Q.gf); Q.gf = null; }
  (Q.field || []).forEach(function (F) {
    var sp = TREE_SPECIES[F.crop], row = sp && sp.place.field ? sp.place.field[0] * TREE_FIELD_SP : 1, soil = sp && sp.place.soil || TOWN_SOIL, nb = Math.max(1, Math.round((F.b1 - F.b0) / row)), na = Math.max(1, Math.ceil((F.a1 - F.a0) / 2));
    function P(a, b) { var x = F.at[0] + F.fx * a - F.fy * b, y = F.at[1] + F.fy * a + F.fx * b, w = W([x, y]), g = hgt(w[0], w[1]); return [w[0], (g === g ? g : 0) + TOWN_ROAD_LIFT, w[1]]; }
    for (var kb = 0; kb < nb; kb++) {
      var bA = F.b0 + (F.b1 - F.b0) * kb / nb, bB = F.b0 + (F.b1 - F.b0) * (kb + 1) / nb, bM = bA + (bB - bA) * TOWN_FURROW;   // 一行 ＝ 溝（TOWN_FURROW 成）＋ 壟
      [[bA, bM, 1], [bM, bB, 0]].forEach(function (st) {
        var base = V.length / 9;
        for (var ka = 0; ka <= na; ka++) { var a = F.a0 + (F.a1 - F.a0) * ka / na, p0 = P(a, st[0]), p1 = P(a, st[1]); vtx(p0[0], p0[1], p0[2], soil[st[2]]); vtx(p1[0], p1[1], p1[2], soil[st[2]]); }
        for (ka = 0; ka < na; ka++) { var q = base + ka * 2; I.push(q, q + 1, q + 3, q, q + 3, q + 2); }
      });
    }
    var A = FC && FC.at[F.crop]; if (!A) return;
    var fb = VF.length / 7;
    for (kb = 0; kb <= nb; kb++) for (var kc = 0; kc <= na; kc++) { var ac = F.a0 + (F.a1 - F.a0) * kc / na, pc = P(ac, F.b0 + (F.b1 - F.b0) * kb / nb); VF.push(pc[0], pc[1], pc[2], kb / A.nr, (ac - F.a0) / A.th, A.l, A.view); }
    for (kb = 0; kb < nb; kb++) for (kc = 0; kc < na; kc++) { var q2 = fb + kb * (na + 1) + kc; IF.push(q2, q2 + 1, q2 + na + 2, q2, q2 + na + 2, q2 + na + 1); }
  });
  Q.gf = IF.length ? townGpuField(VF, IF) : null;
  // 一條帶子拉成有厚度的板（碼頭、棧橋的面板）：整條一起畫，轉角照兩段的角平分線斜接（同城牆 —— 以前一段一個長方體，轉角外側缺一角、內側疊在一起；
  //   Tim 2026-10-22「是否可以參考城牆 平滑的轉彎」）；斜接最多拉長 TOWN_SLAB_KMAX 倍（轉超過 120° ⇒ 轉角那一點變窄，不拉出尖刺）
  function slab(P0, w, top, bot, col) {
    var P = [], hw = w / 2, Lf = [], Rt = [], dk = [col[0] * 0.78, col[1] * 0.78, col[2] * 0.78];
    P0.map(W).forEach(function (c) { var l = P[P.length - 1]; if (!l || Math.hypot(c[0] - l[0], c[1] - l[1]) > 1e-3) P.push(c); });   // 重複的點拿掉（長度 0 的段沒有方向）
    if (P.length < 2) return;
    var Nm = [];                                                        // 每一段的左法線（沿 path 往前看的左手邊 ＝ (−tz, tx)）
    for (var q = 1; q < P.length; q++) { var L = Math.hypot(P[q][0] - P[q - 1][0], P[q][1] - P[q - 1][1]); Nm.push([-(P[q][1] - P[q - 1][1]) / L, (P[q][0] - P[q - 1][0]) / L]); }
    P.forEach(function (c, i) {
      var n0 = Nm[Math.max(0, i - 1)], n1 = Nm[Math.min(Nm.length - 1, i)], mx = n0[0] + n1[0], mz = n0[1] + n1[1], ml = Math.hypot(mx, mz);
      var m = ml > 1e-6 ? [mx / ml, mz / ml] : n0, k = hw / Math.max(m[0] * n0[0] + m[1] * n0[1], 1 / TOWN_SLAB_KMAX);
      Lf.push([c[0] + m[0] * k, c[1] + m[1] * k]); Rt.push([c[0] - m[0] * k, c[1] - m[1] * k]);
    });
    function side(c0, c1) {                                             // 一面鉛直的側面（c0 → c1，法線朝外 ＝ 往前看的右手邊）
      var nx = c1[1] - c0[1], nz = -(c1[0] - c0[0]), nl = Math.hypot(nx, nz) || 1, b2 = V.length / 9;
      vtx(c0[0], top, c0[1], dk, nx / nl, 0, nz / nl); vtx(c1[0], top, c1[1], dk, nx / nl, 0, nz / nl); vtx(c1[0], bot, c1[1], dk, nx / nl, 0, nz / nl); vtx(c0[0], bot, c0[1], dk, nx / nl, 0, nz / nl);
      I.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3);
    }
    for (var s = 1; s < P.length; s++) {
      var base = V.length / 9;
      [Lf[s - 1], Lf[s], Rt[s], Rt[s - 1]].forEach(function (c) { vtx(c[0], top, c[1], col); }); I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      side(Lf[s - 1], Lf[s]); side(Rt[s], Rt[s - 1]);
    }
    side(Rt[0], Lf[0]); side(Lf[P.length - 1], Rt[P.length - 1]);      // 兩頭的端面
  }
  Q.quay.forEach(function (q) { slab(q.path, q.w, 1.0, -2.5, TOWN_COL.quay); });
  // 棧橋（Blocksail TOWN_BUILD §3.3.8 的 kind）：長碼頭 wharf、石堤 mole ＝ 實心石砌，一直到那一座沿線最深的水再深 1 m（埋進海床；不畫樁）；
  //   其他（棧橋、T 字頭、支棧橋、skala 短棧）＝ 木板＋樁，樁一根一根伸到它底下的海床（Tim 2026-10-22「棧橋的腳可以長一點」—— 以前一律到 −4 m，深水的棧橋腳懸在水裡）；
  //   那一塊地形還沒到（townRoadHeight 是 NaN）⇒ 伸到沿線最深的水再深 1 m（一樣埋進海床）
  Q.pier.forEach(function (q) {
    var deep = -((q.depth > 0 ? q.depth : 4) + 1);
    if (q.kind === 'wharf' || q.kind === 'mole') { slab(q.path, q.w, q.kind === 'mole' ? 2.0 : 1.0, deep, q.kind === 'mole' ? TOWN_COL.mole : TOWN_COL.quay); return; }
    slab(q.path, q.w, 1.4, 1.0, TOWN_COL.pier);
    var P = q.path.map(W);                                              // 樁：每 4 m 一對
    for (var s = 1; s < P.length; s++) {
      var a = P[s - 1], b = P[s], L = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / (L || 1), tz = (b[1] - a[1]) / (L || 1);
      for (var t = 2; t < L; t += 4) [-1, 1].forEach(function (sd) {
        var cx = a[0] + tx * t - tz * sd * (q.w / 2 - 0.3), cz = a[1] + tz * t + tx * sd * (q.w / 2 - 0.3), r = 0.18, base = V.length / 9, gy = hgt(cx, cz), bot = gy === gy ? Math.min(gy - 0.5, 0.5) : deep;
        [[-r, -r], [r, -r], [r, r], [-r, r]].forEach(function (o) { vtx(cx + o[0], 1.0, cz + o[1], TOWN_COL.post, o[0] / r, 0, o[1] / r); vtx(cx + o[0], bot, cz + o[1], TOWN_COL.post, o[0] / r, 0, o[1] / r); });
        for (var e = 0; e < 4; e++) { var i0 = base + e * 2, i1 = base + ((e + 1) % 4) * 2; I.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1); }
      });
    }
  });
  Q.deps = deps;
  if (!I.length) return null;
  var bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (var k = 0; k < V.length; k += 9) { bb[0] = Math.min(bb[0], V[k]); bb[1] = Math.min(bb[1], V[k + 1]); bb[2] = Math.min(bb[2], V[k + 2]); bb[3] = Math.max(bb[3], V[k]); bb[4] = Math.max(bb[4], V[k + 1]); bb[5] = Math.max(bb[5], V[k + 2]); }
  return townGpu9(new Float32Array(V), new Uint32Array(I), bb);
}
/** 屋頂殼：每 TOWN_SHELL_G 公尺一格（照實例的中心）⇒ 屋頂高（佔地加權的平均頂）、顏色（屋頂色加權）、覆蓋（佔地 ÷ 格面積）；覆蓋 > 0.12 的格畫成一個平頂方塊（頂＋四面往下到地塊最低的 h − 3 m）。 */
function townShell(T) {
  var G = TOWN_SHELL_G, cells = {}, V = [], I = [];
  T.inst.forEach(function (q) {
    if (!(q.y === q.y) || q.lk > 1) return;                             // 地標不進殼：最遠一級是它自己的貼圖
    var i = Math.floor(q.x / G), j = Math.floor(q.z / G), k = i + ',' + j, c = cells[k] || (cells[k] = { i: i, j: j, a: 0, top: 0, r: 0, g: 0, b: 0, lo: 1e9 });
    var f = q.foot; c.a += f; c.top += f * (q.y + q.top * 0.82); c.r += f * q.col[0]; c.g += f * q.col[1]; c.b += f * q.col[2]; c.lo = Math.min(c.lo, q.y - 3);
  });
  Object.keys(cells).sort().forEach(function (k) {
    var c = cells[k], cov = Math.min(1, c.a / (G * G)); if (cov < 0.12) return;
    var top = c.top / c.a, col = [c.r / c.a, c.g / c.a, c.b / c.a], m = (1 - Math.sqrt(cov)) * G / 2, x0 = c.i * G + m, x1 = (c.i + 1) * G - m, z0 = c.j * G + m, z1 = (c.j + 1) * G - m, base = V.length / 9;
    [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(function (q) { V.push(q[0], top, q[1], 0, 1, 0, col[0], col[1], col[2]); });
    I.push(base, base + 3, base + 2, base, base + 2, base + 1);
    var Q = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], NN = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (var e = 0; e < 4; e++) { var a = Q[e], b = Q[(e + 1) % 4], b2 = V.length / 9, d = 0.72; [[a, top], [b, top], [b, c.lo], [a, c.lo]].forEach(function (s) { V.push(s[0][0], s[1], s[0][1], NN[e][0], 0, NN[e][1], col[0] * d, col[1] * d, col[2] * d); }); I.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3); }
  });
  if (!I.length) return null;
  var bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (var k2 = 0; k2 < V.length; k2 += 9) { bb[0] = Math.min(bb[0], V[k2]); bb[1] = Math.min(bb[1], V[k2 + 1]); bb[2] = Math.min(bb[2], V[k2 + 2]); bb[3] = Math.max(bb[3], V[k2]); bb[4] = Math.max(bb[4], V[k2 + 1]); bb[5] = Math.max(bb[5], V[k2 + 2]); }
  return townGpu9(new Float32Array(V), new Uint32Array(I), bb);
}
/** 地標雕好的田（townTreesSet 的 T.lmf）遠處那一層（TASK-0879）：一塊長方形一個平的四邊形、高 ＝ 模型的土面；行數同 treeFieldPut（比半個行距、株距還窄的不畫，同那邊不種）⇒ townGpuField 或 null。 */
function townLmCard(lmf) {
  var FC = TREE_FIELD_CARD && TREES.on ? treeFieldCrops() : null, V = [], I = []; if (!FC) return null;
  lmf.forEach(function (F) {
    var A = FC.at[F.crop], Fd = A && TREE_SPECIES[F.crop].place.field; if (!A || F.lb < Fd[0] * TREE_FIELD_SP / 2 || F.la < Fd[1] * TREE_FIELD_SP / 2) return;
    var nb = Math.max(1, Math.round(F.lb / (Fd[0] * TREE_FIELD_SP))), b0 = V.length / 7;
    [[0, 0], [F.la, 0], [F.la, F.lb], [0, F.lb]].forEach(function (p) { V.push(F.o[0] + F.ua[0] * p[0] + F.ub[0] * p[1], F.y, F.o[1] + F.ua[1] * p[0] + F.ub[1] * p[1], p[1] / F.lb * nb / A.nr, p[0] / A.th, A.l, A.view); });
    I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  });
  return I.length ? townGpuField(V, I) : null;
}
/** 遠處的田那一層（TASK-0879）：7 個 float 一點（位置、貼圖 u v 層、view）⇒ { vao, vb, ib, n, bb, v0（裡面最小的 view × TREE_FIELD_FADE[0]：整份都比它近 ⇒ 不用畫） }。 */
function townGpuField(V, I) {
  var bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9], v0 = Infinity;
  for (var k = 0; k < V.length; k += 7) { for (var j = 0; j < 3; j++) { bb[j] = Math.min(bb[j], V[k + j]); bb[j + 3] = Math.max(bb[j + 3], V[k + j]); } v0 = Math.min(v0, V[k + 6]); }
  var g = { vao: gl.createVertexArray(), vb: gl.createBuffer(), ib: gl.createBuffer(), n: I.length, bb: bb, v0: v0 * TREE_FIELD_FADE[0] };
  gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(I), gl.STATIC_DRAW); gl.bindVertexArray(null);
  return g;
}
function townGpu9(V, I, bb) {
  var g = { vao: gl.createVertexArray(), vb: gl.createBuffer(), ib: gl.createBuffer(), n: I.length, bb: bb };
  gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.bufferData(gl.ARRAY_BUFFER, V, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, I, gl.STATIC_DRAW); gl.bindVertexArray(null);
  return g;
}

// ── 布旗（Tim 2026-10-20「旗幟可以改成布?(參考船隻)」；只給人看） ──
// 模型的 flags（Blocksail tools/townmodels.py flags_of：雕刻的帆裡 meta kind=flag 那幾面的四個角，模型格座標；BUILDING_SPEC §6.2）⇒ 每個實例每面一塊布：
//   TOWN_FLAG_N ＝ 沿飛 × 沿旗桿幾個質點；綁邊（第 0 欄）釘在旗桿上，其他照 Verlet：重力＋往風速拉的阻力（風向 ＝ WIND、風速 ＝ WIND_SAIL × 天氣，跟帆同一份）
//   ＋陣風、擺動（畫面時間的正弦、每面差一個相位 ⇒ 不抽亂數）＋ TOWN_FLAG_IT 次距離約束（橫、直、斜）。
//   ⛔ 不碰戰局：不讀寫模擬的狀態、不用模擬的亂數、砲彈打不到；鏡頭 TOWN_FLAG_SIM 公尺外不動（停在上一個樣子）、TOWN_LOD[1] 外不畫（貼圖那一級沒拍旗）。
//   畫：照圖案的分界再切格（十字的邊不會被內插糊掉）、一格一色；法線翻到朝鏡頭那一面（布兩面都看得到）；用地面帶子那一支著色器（P.gr）。
var TOWN_FLAG_N = [10, 6], TOWN_FLAG_IT = 6, TOWN_FLAG_SIM = 400, TOWN_FLAG_DT = 1 / 60, TOWN_FLAG_DRAG = 1.6, TOWN_FLAG_DAMP = 0.99;
var TOWN_FLAG_PAT = {                                                   // 圖案：u 沿飛（0 旗桿 → 1 尾）、v 沿旗桿（0 上 → 1 下）；cu、cv ＝ 色塊的分界
  genoa: { cu: [0.44, 0.56], cv: [0.4, 0.6], col: function (u, v) { return Math.abs(u - 0.5) < 0.06 || Math.abs(v - 0.5) < 0.1 ? COL_R : COL_W; } }   // 熱那亞：白底紅十字（聖喬治）
};
/** 城 T 的布旗（實例建好之後建一次）：[{ p, pp: 現在、上一步的質點（世界）, C: 約束 [a, b, 長] …, h: 綁邊的上下兩點, at: 中心, ph: 相位, pat }]。 */
function townFlags(T) {
  var K = TOWNS.kit, out = [], NU = TOWN_FLAG_N[0], NV = TOWN_FLAG_N[1];
  (T.inst || []).forEach(function (q) {
    var m = K.M[q.k].m; if (!m.flags || !(q.y === q.y)) return;
    var s = Math.sin(q.th), c = Math.cos(q.th), mpv = m.mpv, hw = m.size[0] * mpv / 2, hd = m.size[1] * mpv / 2;
    function W(v) { var a = (v[0] * mpv - hw) * q.sx, b = v[1] * mpv - hd; return [q.x + a * s - b * c, q.y + v[2] * mpv, q.z - a * c - b * s]; }   // 模型 → 世界（檔頭的公式）
    m.flags.forEach(function (f, fi) {
      var h0 = W(f.hoist[0]), h1 = W(f.hoist[1]), f0 = W(f.fly[0]), f1 = W(f.fly[1]), p = new Float32Array(NU * NV * 3), C = [];
      for (var i = 0; i < NU; i++) for (var j = 0; j < NV; j++) {
        var u = i / (NU - 1), v = j / (NV - 1), o = (i * NV + j) * 3;
        for (var k = 0; k < 3; k++) p[o + k] = (h0[k] * (1 - v) + h1[k] * v) * (1 - u) + (f0[k] * (1 - v) + f1[k] * v) * u;
      }
      function link(a, b) { C.push(a, b, Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2])); }
      for (var i2 = 0; i2 < NU; i2++) for (var j2 = 0; j2 < NV; j2++) {
        var a = i2 * NV + j2;
        if (i2 + 1 < NU) link(a, a + NV);
        if (j2 + 1 < NV) link(a, a + 1);
        if (i2 + 1 < NU && j2 + 1 < NV) { link(a, a + NV + 1); link(a + 1, a + NV); }
      }
      out.push({ p: p, pp: Float32Array.from(p), C: new Float32Array(C), h: [h0, h1], at: [(h0[0] + f1[0]) / 2, (h0[1] + f1[1]) / 2, (h0[2] + f1[2]) / 2],
                 ph: townHash((q.lot || q.k) + ':flag' + fi) * 6.2832, pat: TOWN_FLAG_PAT[f.pattern] || null, acc: 0, vao: null, vb: null, V: null, n: 0, lk: q.lk || 1 });
    });
  });
  return out;
}
/** 城 T 的樹（雕刻作品的子作品標 meta kind=tree、tree=<樹種> ⇒ Blocksail tools/townmodels.py 匯入時把那一件的格子拿掉、一團一棵記成 m.trees ＝ [[格 x, 格 y, 格 z, 高 m, 寬 m, 樹種] …]）
 *  ⇒ T.trees ＝ { a: Float32Array（6 個一組：世界 x, y（樹根）, z, 高, 寬, 樹種的號碼（TREE_SPECIES 的順序））, n, bb }；跟上一份不同 ⇒ 載進來、碰得到的塊重擺樹（63_trees.js treeTownPut）。
 *  樹種沒有 ⇒ 闊葉樹。⛔ 不碰戰局（樹只給人看）。
 *  地標兼任的田（TASK-0862；Blocksail 特殊建築表的 prod ⇒ 規劃那一塊地塊帶 annex：{ crop, fixed }、沒有 cells；模型雕好的菜畦標 meta kind=field ⇒ townmodels.py 把壟拿掉、
 *    記成 m.fields ＝ [[格 x0, 格 y0, 格 x1, 格 y1, 格 z（土面）, 行沿哪一軸（0 ＝ 模型 x、1 ＝ y）] …]）⇒ 一塊一條長方形換到世界記在 T.lmf（63_trees.js treeFieldPut 跟附屬的田一起種）；
 *    地塊沒帶作物（沒登記兼任）⇒ 不種（土照模型留著）。 */
function townTreesSet(T) {
  var K = TOWNS.kit, SP = Object.keys(TREE_SPECIES), a = [], bb = [1e9, 1e9, -1e9, -1e9], sig = 0, lmf = [], crop = {};
  (T.p.lots || []).forEach(function (l) { if (l.annex && l.annex.fixed && l.annex.crop) crop[l.id] = l.annex.crop; });
  (T.inst || []).forEach(function (q) {
    var M = K && K.M[q.k], m = M && M.m; if (!m || !(m.trees || m.fields) || !(q.y === q.y)) return;
    var s = Math.sin(q.th), c = Math.cos(q.th), mpv = m.mpv, hw = m.size[0] * mpv / 2, hd = m.size[1] * mpv / 2;
    (m.trees || []).forEach(function (t) {
      var A = (t[0] * mpv - hw) * q.sx, B = t[1] * mpv - hd, x = q.x + A * s - B * c, z = q.z - A * c - B * s, si = SP.indexOf(t[5]); if (si < 0) si = SP.indexOf('broadleaf');
      a.push(x, q.y + t[2] * mpv, z, t[3], t[4], si); sig += x * 0.37 + z * 0.61 + si;
      bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], z); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], z);
    });
    var cr = q.lot && crop[q.lot]; if (!cr || !m.fields) return;
    var ux = [s * q.sx, -c * q.sx], uy = [-c, -s];                    // 模型 +x、+y 各走 1 m ⇒ 世界 (x, z) 走多少（同上面樹的公式）
    m.fields.forEach(function (r) {
      var A = (r[0] * mpv - hw) * q.sx, B = r[1] * mpv - hd, o = [q.x + A * s - B * c, q.z - A * c - B * s], lx = (r[2] - r[0]) * mpv, ly = (r[3] - r[1]) * mpv;
      var F = r[5] ? { ua: uy, la: ly, ub: ux, lb: lx } : { ua: ux, la: lx, ub: uy, lb: ly };   // a ＝ 沿行（株距）、b ＝ 跨行（行距）
      F.lm = true; F.lot = q.lot; F.crop = cr; F.o = o; F.y = q.y + r[4] * mpv;
      F.R = [[0, 0], [F.la, 0], [F.la, F.lb], [0, F.lb]].map(function (p) { return [o[0] + F.ua[0] * p[0] + F.ub[0] * p[1] + BED.ax, o[1] + F.ua[1] * p[0] + F.ub[1] * p[1] + BED.az]; });   // 同附屬的田：海域座標
      lmf.push(F); sig += o[0] * 0.13 + o[1] * 0.29;
    });
  });
  T.lmf = lmf;
  (T.fields || []).concat(lmf).forEach(function (F) { F.R.forEach(function (q) { var x = q[0] - BED.ax, z = q[1] - BED.az; bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], z); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], z); }); });   // 附屬的田、地標的田（treeFieldPut）也照這個框重排
  sig = a.length + ':' + sig.toFixed(3) + ':f' + (T.fields || []).length + ':l' + lmf.length;
  if (T.lmgSig !== sig) { if (T.lmg) townGpuFree(T.lmg); T.lmg = townLmCard(lmf); T.lmgSig = sig; }   // 地標的田遠處那一層（TASK-0879）
  var had = T.trees && (T.trees.n || T.trees.nf); if (T.trees && T.trees.sig === sig) return;
  T.trees = { a: new Float32Array(a), n: a.length / 6, nf: (T.fields || []).length + lmf.length, bb: bb, sig: sig };
  if ((!a.length && !T.trees.nf && !had) || typeof TREES === 'undefined' || !TREES.on || !BED || !BED.A) return;
  var size = BED.A.chunk, ob = had ? null : bb;
  Object.keys(BED.ch).forEach(function (k) {
    var C = BED.ch[k], x0 = C.cx * size - BED.ax, z0 = C.cy * size - BED.az;
    if (ob && (x0 > ob[2] || x0 + size < ob[0] || z0 > ob[3] || z0 + size < ob[1])) return;   // 以前沒有樹 ⇒ 只排碰到的塊；以前有（可能挪了）⇒ 載進來的塊都排
    treeQueue(k, C);
  });
}
function townFlagFree(T) { (T.flags || []).forEach(function (F) { if (F.vao) { gl.deleteVertexArray(F.vao); gl.deleteBuffer(F.vb); } }); T.flags = null; }
/** 一步（dt 秒、t ＝ 畫面時間）：Verlet ⇒ 釘綁邊 ⇒ 約束（綁邊那一欄不動）。 */
function townFlagStep(F, dt, t) {
  var p = F.p, pp = F.pp, NU = TOWN_FLAG_N[0], NV = TOWN_FLAG_N[1], wl = Math.hypot(WIND[0], WIND[2]) || 1, wx = WIND[0] / wl, wz = WIND[2] / wl;
  var ws = WIND_SAIL * WX.wind * WIND_SPD * (1 + 0.25 * Math.sin(t * 1.3 + F.ph) + 0.1 * Math.sin(t * 3.7 + F.ph * 2)), kd = TOWN_FLAG_DRAG, dt2 = dt * dt;
  for (var i = 1; i < NU; i++) {
    var u = i / (NU - 1), lat = ws * 0.35 * u * Math.sin(t * 7.1 + F.ph - u * 5), up = ws * 0.12 * u * Math.sin(t * 5.3 + F.ph * 1.7 + u * 4);   // 擺動：越往尾越大、沿布往後傳
    for (var j = 0; j < NV; j++) {
      var o = (i * NV + j) * 3;
      for (var k = 0; k < 3; k++) {
        var x = p[o + k], vel = (x - pp[o + k]) / dt, wv = k === 0 ? wx * ws - wz * lat : k === 2 ? wz * ws + wx * lat : up;
        p[o + k] = x + (x - pp[o + k]) * TOWN_FLAG_DAMP + (kd * (wv - vel) - (k === 1 ? 9.8 : 0)) * dt2; pp[o + k] = x;
      }
    }
  }
  for (var j2 = 0; j2 < NV; j2++) { var v = j2 / (NV - 1), o2 = j2 * 3; for (var k2 = 0; k2 < 3; k2++) p[o2 + k2] = pp[o2 + k2] = F.h[0][k2] * (1 - v) + F.h[1][k2] * v; }
  var C = F.C;
  for (var it = 0; it < TOWN_FLAG_IT; it++) for (var c = 0; c < C.length; c += 3) {
    var a = C[c], b = C[c + 1], wa = a < NV ? 0 : 1, wb = b < NV ? 0 : 1; if (!(wa + wb)) continue;
    var A = a * 3, B = b * 3, dx = p[B] - p[A], dy = p[B + 1] - p[A + 1], dz = p[B + 2] - p[A + 2], L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, e = (L - C[c + 2]) / L / (wa + wb);
    p[A] += dx * e * wa; p[A + 1] += dy * e * wa; p[A + 2] += dz * e * wa; p[B] -= dx * e * wb; p[B + 1] -= dy * e * wb; p[B + 2] -= dz * e * wb;
  }
}
/** 布 ⇒ 三角形（位置、法線、顏色，36 bytes；跟地面帶子同一個佈局）寫進它自己的緩衝區；回傳三角形數。 */
function townFlagMesh(F, eye) {
  var p = F.p, NU = TOWN_FLAG_N[0], NV = TOWN_FLAG_N[1], N = new Float32Array(p.length);
  function P(i, j, k) { return p[(i * NV + j) * 3 + k]; }
  for (var i = 0; i < NU; i++) for (var j = 0; j < NV; j++) {          // 每個質點的法線：沿飛 × 沿旗桿（中央差分）
    var i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, NU - 1), j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, NV - 1), du = [], dv = [];
    for (var k = 0; k < 3; k++) { du.push(P(i1, j, k) - P(i0, j, k)); dv.push(P(i, j1, k) - P(i, j0, k)); }
    var n = norm([du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]]), o = (i * NV + j) * 3;
    N[o] = n[0]; N[o + 1] = n[1]; N[o + 2] = n[2];
  }
  function at(u, v, out, A) {                                           // (u, v) 的位置或法線（四個質點雙線性）
    var fi = u * (NU - 1), fj = v * (NV - 1), i = Math.min(Math.floor(fi), NU - 2), j = Math.min(Math.floor(fj), NV - 2), a = fi - i, b = fj - j;
    for (var k = 0; k < 3; k++) out[k] = (A[(i * NV + j) * 3 + k] * (1 - b) + A[(i * NV + j + 1) * 3 + k] * b) * (1 - a) + (A[((i + 1) * NV + j) * 3 + k] * (1 - b) + A[((i + 1) * NV + j + 1) * 3 + k] * b) * a;
    return out;
  }
  function cuts(n, extra) { var L = []; for (var q = 0; q < n; q++) L.push(q / (n - 1)); return L.concat(extra || []).sort(function (x, y) { return x - y; }); }
  var pat = F.pat, Us = cuts(NU, pat && pat.cu), Vs = cuts(NV, pat && pat.cv), nv = (Us.length - 1) * (Vs.length - 1) * 6;
  if (!F.V || F.V.length < nv * 9) F.V = new Float32Array(nv * 9);
  var V = F.V, w = 0, ps = [0, 0, 0], ns = [0, 0, 0];
  for (var a2 = 0; a2 + 1 < Us.length; a2++) for (var b2 = 0; b2 + 1 < Vs.length; b2++) {
    var u0 = Us[a2], u1 = Us[a2 + 1], v0 = Vs[b2], v1 = Vs[b2 + 1], col = pat ? pat.col((u0 + u1) / 2, (v0 + v1) / 2) : COL_W;
    [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]].forEach(function (c) {
      at(c[0], c[1], ps, p); at(c[0], c[1], ns, N);
      var fl = (eye[0] - ps[0]) * ns[0] + (eye[1] - ps[1]) * ns[1] + (eye[2] - ps[2]) * ns[2] < 0 ? -1 : 1;   // 背面朝鏡頭 ⇒ 法線翻過來
      V[w++] = ps[0]; V[w++] = ps[1]; V[w++] = ps[2]; V[w++] = ns[0] * fl; V[w++] = ns[1] * fl; V[w++] = ns[2] * fl; V[w++] = col[0]; V[w++] = col[1]; V[w++] = col[2];
    });
  }
  if (!F.vao) {
    F.vao = gl.createVertexArray(); F.vb = gl.createBuffer(); gl.bindVertexArray(F.vao); gl.bindBuffer(gl.ARRAY_BUFFER, F.vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  } else { gl.bindVertexArray(F.vao); gl.bindBuffer(gl.ARRAY_BUFFER, F.vb); }
  gl.bufferData(gl.ARRAY_BUFFER, V.subarray(0, w), gl.DYNAMIC_DRAW); F.n = w / 9;
  return F.n / 3;
}

// ── 著色器 ──
// 體素（近、中）：格座標 ⇒ 模型公尺（uC ＝ 一格幾公尺、模型中心 x、y）⇒ 地塊的轉向 ⇒ 世界；實例 aI ＝ (x, y, z, θ)、aS ＝ (沿 x 縮放, 深淺, 地標倍率 lk ⇒ vD ＝ 距離 ÷ lk)、
//   aJ ＝ 城牆的 (−x 那一頭的斜接, +x 那一頭的斜接, 坡度, 牆基往下延)（建築都是 0）：沿 x 照 u 內插的 k ⇒ a ＋＝ b·k（切成梯形，相鄰兩節在角平分面上密合）、
//   高 ＋＝ 坡度·a（用斜接之前的 a ⇒ 端面上每一點的高度都是那一站的高度）、z 0 那一層的底往下延；法線照這個變形的餘因子矩陣轉。
var TOWN_VS = '#version 300 es\nlayout(location=0) in uvec4 aV; layout(location=4) in vec4 aI; layout(location=5) in vec3 aS; layout(location=6) in vec4 aJ; uniform mat4 uVP; uniform vec3 uC; uniform vec3 uEye;\n' +
  'out vec3 vL; out vec3 vW; out vec3 vN; flat out uint vC; flat out uint vF; out float vK; out float vD;\n' +
  'const vec3 NT[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));\n' +
  'void main(){ vec3 p=vec3(aV.xyz); vL=p; float s=sin(aI.w), c=cos(aI.w), a=(p.x*uC.x-uC.y)*aS.x, b=p.y*uC.x-uC.z;\n' +
  ' float u=p.x*uC.x/(2.0*uC.y), k=mix(aJ.x,aJ.y,u), A=1.0+b*(aJ.y-aJ.x)/(2.0*uC.y*aS.x), e=a+b*k;\n' +
  ' vec3 w=vec3(aI.x+e*s-b*c, aI.y+p.z*uC.x+aJ.z*a-(aV.z==0u?aJ.w:0.0), aI.z-e*c-b*s); uint f=aV.w&7u; vec3 m=NT[int(f)];\n' +
  ' m=vec3(m.x-aJ.z*m.z, A*m.y-k*m.x+k*aJ.z*m.z, A*m.z); vN=vec3(m.x*s-m.y*c, m.z, -m.x*c-m.y*s); vF=f; vC=(aV.w>>3u)&255u; vK=aS.y; vW=w; vD=length(aI.xz-uEye.xz)/aS.z; gl_Position=uVP*vec4(w,1.0); }\n';
// 交接：uIn ＝ 這一級從哪裡開始出現（抖動淡入）、uOut ＝ 到哪裡淡出 —— 同一個像素的門檻跟隔壁那一級共用 ⇒ 互補（照實例中心的距離 vD ⇒ 整棟一起換）
var TOWN_FADE = TREE_DITHER + 'uniform vec2 uIn, uOut; bool townCut(float d){ float di=treeDi(gl_FragCoord.xy); return smoothstep(uIn.x,uIn.y,d)<=di || smoothstep(uOut.x,uOut.y,d)>di; }\n';
var TOWN_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + TLAMP_GLSL + TOWN_FADE + 'in vec3 vL; in vec3 vW; in vec3 vN; flat in uint vC; flat in uint vF; in float vK; in float vD; uniform vec3 uSun,uEye,uFog,uSky,uGround; uniform float uFogD, uEdge; out vec4 o;\n' +
    'const vec3 NT[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));\n' +
    'float h3(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }\n' +
    'void main(){ if(vW.y<uClip) discard; if(townCut(vD)) discard; vec3 n=normalize(vN), nl=NT[int(vF)];\n' +
    ' vec3 base=vec3(float((vC>>5u)&7u)/7.0, float((vC>>2u)&7u)/7.0, float(vC&3u)/3.0); base*=0.92+0.16*h3(floor(vL-nl*0.5));\n' +
    ' vec3 f=fract(vL), e=min(f,1.0-f); float ed=min(e.x,e.y); if(vF<2u){ ed=min(e.y,e.z); } else if(vF<4u){ ed=min(e.x,e.z); }\n' +
    ' base*=mix(1.0-0.18*uEdge,1.0,smoothstep(0.0,0.09,ed));\n' +
    ' float sd=dot(n,uSun), d=max(sd,0.0); float sk=shadowK(vW,n*1.5); vec3 col=base*vK*(mix(uGround,uSky,n.y*0.5+0.5)*0.62+vec3(1.0,0.96,0.88)*d*sk*0.78+townLamp(vW,n));\n' +
    ' if(vC==245u) col=mix(col,vec3(1.0,0.74,0.4)*1.7,uTLK);\n' +       // 燈籠的玻璃（色碼 245 只有燈籠用）：夜裡自己發光（夜裡的燈）
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
// 貼圖（遠）：實例 aI ＝ (中心 x, 地塊 h, 中心 z, —)、aR ＝ (右手方向 x, z, 寬, 高)（照取的那一張的視線）、aU ＝ (u0, v0, u 寬, v 高)、aL ＝ 地標倍率；四邊形 aQ ∈ [−½, ½] × [0, 1]
var TOWN_BB_VS = '#version 300 es\nlayout(location=0) in vec2 aQ; layout(location=4) in vec4 aI; layout(location=5) in vec4 aR; layout(location=6) in vec4 aU; layout(location=7) in float aL; uniform mat4 uVP; uniform vec3 uEye; out vec2 vT; out vec3 vW; out float vK; out float vD;\n' +
  'void main(){ vec3 w=aI.xyz+vec3(aR.x,0.0,aR.y)*aQ.x*aR.z+vec3(0.0,aQ.y*aR.w,0.0); vW=w; vK=aI.w; vD=length(aI.xz-uEye.xz)/aL; vT=vec2(aU.x+(aQ.x+0.5)*aU.z, aU.y+(1.0-aQ.y)*aU.w); gl_Position=uVP*vec4(w,1.0); }\n';
var TOWN_BB_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + TOWN_FADE + 'uniform sampler2D uTex; uniform vec3 uEye,uFog; uniform float uFogD,uSunK,uClip; uniform vec3 uBkK; in vec2 vT; in vec3 vW; in float vK; in float vD; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; if(townCut(vD)) discard; vec4 t=texture(uTex,vT); if(t.a<0.5) discard; vec3 col=t.rgb*vK*(0.62+0.38*uSunK)*uBkK;\n' +   // uBkK：世界時間的夜晚只剩月光（08_weather.js todBakeK）
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
// 石基：單位方塊（aP ∈ [−½, ½]³）⇒ 實例 aI ＝ (x, 頂 y, z, θ)、aS ＝ (寬, 深, 高, 深淺)
var TOWN_PL_VS = '#version 300 es\nlayout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=4) in vec4 aI; layout(location=5) in vec4 aS; uniform mat4 uVP; out vec3 vN; out vec3 vW; out float vK;\n' +
  'void main(){ float s=sin(aI.w), c=cos(aI.w), a=aP.x*aS.x, b=aP.y*aS.y; vec3 w=vec3(aI.x+a*s-b*c, aI.y+(aP.z-0.5)*aS.z, aI.z-a*c-b*s);\n' +
  ' vN=vec3(aN.x*s-aN.y*c, aN.z, -aN.x*c-aN.y*s); vW=w; vK=aS.w; gl_Position=uVP*vec4(w,1.0); }\n';
var TOWN_PL_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + TLAMP_GLSL + 'in vec3 vN; in vec3 vW; in float vK; uniform vec3 uSun,uEye,uFog,uSky,uGround,uCol; uniform float uFogD; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; vec3 n=normalize(vN); float d=max(dot(n,uSun),0.0), sk=shadowK(vW,n*1.5); vec3 col=uCol*vK*(0.85+0.15*fract(sin(dot(floor(vW*vec3(2.5,3.3,2.5)),vec3(12.9898,78.233,37.719)))*43758.5453))*(mix(uGround,uSky,n.y*0.5+0.5)*0.62+vec3(1.0,0.96,0.88)*d*sk*0.78+townLamp(vW,n));\n' +
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
// 地面的帶子、屋頂殼：位置、法線、顏色（屋頂殼帶交接的抖動）
var TOWN_GR_VS = '#version 300 es\nlayout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC; uniform mat4 uVP; out vec3 vN; out vec3 vW; out vec3 vC; void main(){ vN=aN; vW=aP; vC=aC; gl_Position=uVP*vec4(aP,1.0); }\n';
var TOWN_GR_FS = function (fade) {
  return '#version 300 es\nprecision highp float;\n' + SHADOW_GLSL + TLAMP_GLSL + (fade ? TOWN_FADE : '') + 'in vec3 vN; in vec3 vW; in vec3 vC; uniform vec3 uSun,uEye,uFog,uSky,uGround; uniform float uFogD; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; ' + (fade ? 'if(townCut(length(vW.xz-uEye.xz))) discard; ' : '') + 'vec3 n=normalize(vN); float d=max(dot(n,uSun),0.0), sk=' + (fade ? '1.0' : 'shadowK(vW,n*1.5)') + ';\n' +
    ' vec3 col=vC*(0.9+0.2*fract(sin(dot(floor(vW.xz*1.3),vec2(12.9898,78.233)))*43758.5453))*(mix(uGround,uSky,n.y*0.5+0.5)*0.65+vec3(1.0,0.96,0.88)*d*sk*0.7+townLamp(vW,n));\n' +
    ' float fd=length(vW-uEye); o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
// 遠處的田（TASK-0879；63_trees.js 檔頭「遠處的田」）：貼圖陣列（第 TREE_FIELD_UNIT 號）照 (u, v, 層) 取色；照那一種的 view 的 TREE_FIELD_FADE 抖動淡入（uFK）；
//   光照、雜訊、影子、夜裡的燈同上面地面的帶子（法線朝上）⇒ 交接時跟鋪的土同一個亮度
var TOWN_FC_VS = '#version 300 es\nlayout(location=0) in vec3 aP; layout(location=1) in vec3 aT; layout(location=2) in float aV; uniform mat4 uVP; out vec3 vW; out vec3 vT; out float vV; void main(){ vW=aP; vT=aT; vV=aV; gl_Position=uVP*vec4(aP,1.0); }\n';
var TOWN_FC_FS = function () {
  return '#version 300 es\nprecision highp float; precision highp sampler2DArray;\n' + SHADOW_GLSL + TLAMP_GLSL + TREE_DITHER + 'in vec3 vW; in vec3 vT; in float vV; uniform sampler2DArray uFT; uniform vec2 uFK; uniform vec3 uSun,uEye,uFog,uSky,uGround; uniform float uFogD; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; float fd=length(vW-uEye); if(smoothstep(vV*uFK.x,vV*uFK.y,fd)<=treeDi(gl_FragCoord.xy)) discard; vec3 n=vec3(0.0,1.0,0.0); float d=max(uSun.y,0.0), sk=shadowK(vW,n*1.5);\n' +
    ' vec3 col=texture(uFT,vT).rgb*(0.9+0.2*fract(sin(dot(floor(vW.xz*1.3),vec2(12.9898,78.233)))*43758.5453))*(uSky*0.65+vec3(1.0,0.96,0.88)*d*sk*0.7+townLamp(vW,n));\n' +
    ' o=vec4(mix(col,uFog,1.0-exp(-fd*uFogD)),1.0); }\n';
};
/** 城鎮的著色器：第一次要畫時送出編譯（01_gl.js glProgStart；TASK-0816），編好之前回 null（城鎮這幾格不畫、實例也先不建）。陰影、夜裡的燈那幾支一起編（以前第一次用到才編）。 */
function townProgs() {
  if (TOWNS.prog) return TOWNS.prog;
  var J = TOWNS.progJ || (TOWNS.progJ = { vox: glProgStart(TOWN_VS, TOWN_FS()), bb: glProgStart(TOWN_BB_VS, TOWN_BB_FS()), pl: glProgStart(TOWN_PL_VS, TOWN_PL_FS()), gr: glProgStart(TOWN_GR_VS, TOWN_GR_FS(false)), sh: glProgStart(TOWN_GR_VS, TOWN_GR_FS(true)), dVox: glProgStart(TOWN_VS, DEPTH_ONLY_FS), dPl: glProgStart(TOWN_PL_VS, DEPTH_ONLY_FS),
    win: glProgStart(TOWN_WIN_VS, TOWN_WIN_FS()), glow: glProgStart(TOWN_GLOW_VS, TOWN_GLOW_FS), folk: glProgStart(TOWN_FOLK_VS, TOWN_FOLK_FS()), fc: glProgStart(TOWN_FC_VS, TOWN_FC_FS()) });   // folk：城鎮居民的看板（63_townfolk.js）；fc：遠處的田（TASK-0879）
  if (!Object.keys(J).every(function (k) { return glProgReady(J[k]); })) return null;
  var P = {}; Object.keys(J).forEach(function (k) { P[k] = glProgEnd(J[k]); }); TOWNS.progJ = null;
  P.ib = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];   // 近、中、貼圖、石基的實例（每次分組重寫）
  P.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1]), gl.STATIC_DRAW);
  P.bbVao = gl.createVertexArray(); gl.bindVertexArray(P.bbVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[2]); [4, 5, 6].forEach(function (a, q) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 52, q * 16); });
  gl.enableVertexAttribArray(7); gl.vertexAttribDivisor(7, 1); gl.vertexAttribPointer(7, 1, gl.FLOAT, false, 52, 48);   // 地標倍率
  townFolkGl(P);
  // 石基的方塊：六面 × 兩個三角形（位置、法線）
  var V = [], F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  F.forEach(function (n) {
    var u = n[0] ? [0, 1, 0] : [1, 0, 0], v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]].forEach(function (s) { for (var k = 0; k < 3; k++) V.push(n[k] * 0.5 + u[k] * s[0] * 0.5 + v[k] * s[1] * 0.5); V.push(n[0], n[1], n[2]); });
  });
  P.cube = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, P.cube); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  P.plVao = gl.createVertexArray(); gl.bindVertexArray(P.plVao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[3]); [4, 5].forEach(function (a, q) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 32, q * 16); });
  gl.bindVertexArray(null);
  TOWNS.prog = P; return P;
}

// ── 分組與畫 ──
/** 看得到的實例照離鏡頭（水平）多遠分到近、中、貼圖（交接帶兩邊都放）；石基跟著近、中。寫進四個實例緩衝區。 */
// 剛好在畫面外、影子卻落進畫面的房子（Tim 2026-10-20「陰影不能只處理攝影機範圍(要稍微大一些)」）：分組時視錐往外放寬這麼多公尺（60_render.js 陰影照這一組畫）
var TOWN_SH_PAD = 60;
function townBin(PL, eye) {
  var t0 = performance.now(), K = TOWNS.kit, NM = K.names.length, cnt = [new Int32Array(NM), new Int32Array(NM)], L0 = TOWN_LOD[0], L1 = TOWN_LOD[1], B0 = TOWN_BAND[0], B1 = TOWN_BAND[1], B2 = TOWN_BAND[2], vis = [], nbb = 0, npl = 0, nlm = 0;
  TOWNS.list.forEach(function (T) {
    if (!T.inst) return;
    T.inst.forEach(function (q) {
      if (!(q.y === q.y)) { if (!townWallY(q)) return; T.shDirty = true; }   // 城牆：等那一塊載進來
      var dx = q.x - eye[0], dz = q.z - eye[2], d = Math.sqrt(dx * dx + dz * dz) / (q.lk || 1); if (d > TOWN_FAR[1] + 50) return;   // d ＝ 距離 ÷ 地標倍率（一般房子 1）
      var cy = q.y + q.top / 2, r = q.r + q.top / 2;
      for (var i = 0; i < 6; i++) { var p = PL[i]; if (p[0] * q.x + p[1] * cy + p[2] * q.z + p[3] < -r - TOWN_SH_PAD) return; }   // 視錐外 TOWN_SH_PAD 公尺內的也放進來：影子落進畫面的那幾棟（陰影照主畫面這一組畫）
      var mi = K.M[q.k].i, on0 = d < L0 + B0, on1 = d > L0 - B0 && d < L1 + B1, on2 = d > L1 - B1;
      if (q.lk > 1) nlm++;
      if (on0) cnt[0][mi]++; if (on1) cnt[1][mi]++; if (on2) nbb++;
      if ((on0 || on1) && q.pl) { if (!q.pb) q.pb = townPlinth(q); if (q.pb) npl++; }
      vis.push(q, d, on0, on1, on2);
    });
  });
  var off = [new Int32Array(NM), new Int32Array(NM)], tot = [0, 0];
  for (var l = 0; l < 2; l++) for (var m = 0; m < NM; m++) { off[l][m] = tot[l]; tot[l] += cnt[l][m]; }
  function buf(l, need) { if (!TOWNS.buf[l] || TOWNS.buf[l].length < need) TOWNS.buf[l] = new Float32Array(Math.max(need, 16) * 1.5 | 0); return TOWNS.buf[l]; }
  var D0 = buf(0, tot[0] * 11), D1 = buf(1, tot[1] * 11), D2 = buf(2, nbb * 13), D3 = buf(3, npl * 8), at = [off[0].slice(), off[1].slice()], kb = 0, kp = 0, V8 = K.views;
  for (var v = 0; v < vis.length; v += 5) {
    var q = vis[v], Mq = K.M[q.k], mi2 = Mq.i;
    [0, 1].forEach(function (l2) { if (!vis[v + 2 + l2]) return; var o = at[l2][mi2]++ * 11, D = l2 ? D1 : D0, J = q.mj || TOWN_J0; D[o] = q.x; D[o + 1] = q.y; D[o + 2] = q.z; D[o + 3] = q.th; D[o + 4] = q.sx; D[o + 5] = q.sh; D[o + 6] = q.lk || 1; D[o + 7] = J[0]; D[o + 8] = J[1]; D[o + 9] = J[2]; D[o + 10] = J[3]; });
    if (vis[v + 4]) {                                                   // 貼圖：取最接近視線的那一張（模型座標裡鏡頭的方向 φ ⇒ 第 round(φ ÷ 45°) 張）
      var m2 = Mq.m, s = Math.sin(q.th), c = Math.cos(q.th), ex = eye[0] - q.x, ez = eye[2] - q.z, vx = ex * s - ez * c, vy = -ex * c - ez * s;
      var k = ((Math.round(Math.atan2(vy, vx) / (2 * Math.PI / V8)) % V8) + V8) % V8, ph = k * 2 * Math.PI / V8, rmx = -Math.sin(ph), rmy = Math.cos(ph), o2 = kb++ * 13;
      var cx = q.x, cz = q.z;                                           // 模型中心（城牆的斷面沿 x 縮放 ⇒ 貼圖寬也跟著）
      D2[o2] = cx; D2[o2 + 1] = q.y; D2[o2 + 2] = cz; D2[o2 + 3] = q.sh;
      D2[o2 + 4] = rmx * s - rmy * c; D2[o2 + 5] = -rmx * c - rmy * s; D2[o2 + 6] = m2.im.w * q.sx; D2[o2 + 7] = m2.im.h;
      D2[o2 + 8] = (m2.im.x + k * m2.im.cw) / K.aw; D2[o2 + 9] = m2.im.y / K.ah; D2[o2 + 10] = m2.im.cw / K.aw; D2[o2 + 11] = m2.im.ch / K.ah; D2[o2 + 12] = q.lk || 1;
    }
    if ((vis[v + 2] || vis[v + 3]) && q.pb) { var o3 = kp++ * 8, P3 = q.pb; D3[o3] = q.x; D3[o3 + 1] = P3[0]; D3[o3 + 2] = q.z; D3[o3 + 3] = q.th; D3[o3 + 4] = q.pl[0] - 0.04; D3[o3 + 5] = q.pl[1] - 0.04; D3[o3 + 6] = P3[1]; D3[o3 + 7] = q.sh; }
  }
  var P = TOWNS.prog;
  [[D0, tot[0] * 11], [D1, tot[1] * 11], [D2, nbb * 13], [D3, npl * 8]].forEach(function (a, i2) { gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[i2]); gl.bufferData(gl.ARRAY_BUFFER, a[0].subarray(0, Math.max(16, a[1])), gl.DYNAMIC_DRAW); });
  TOWNS.grp = { cnt: cnt, off: off, nbb: nbb, npl: npl };
  var S = TOWNS.stat; S.d0 = tot[0]; S.d1 = tot[1]; S.d2 = nbb; S.plinth = npl; S.lm = nlm; S.binMs = +(performance.now() - t0).toFixed(2);
}
/** 石基：地塊頂（h，略低 1 cm 不跟一樓的底面打架）往下到四角與中心最低的地面再 0.3 m；地面沒載 ⇒ null（下次分組再試）。 */
function townPlinth(q) {
  var s = Math.sin(q.th), c = Math.cos(q.th), w = q.pl[0] / 2, d = q.pl[1] / 2, lo = Infinity;
  [[0, 0], [-w, -d], [w, -d], [w, d], [-w, d]].forEach(function (o) { var gy = townGround(q.x + o[0] * s - o[1] * c, q.z - o[0] * c - o[1] * s); lo = Math.min(lo, gy); });
  if (!(lo === lo) || lo === Infinity) return null;
  var top = q.y - 0.01, hgt = Math.max(0.3, top - lo + 0.3);
  return [top, hgt];
}
/** 畫（60_render.js：樹之後）。 */
function townDraw() {
  if (!TOWNS.on || !TOWNS.list.length || !BED || !BED.A || PASS.vp) return;
  if (!TOWNS.kit) { townKit(); townProgs(); return; }                 // 著色器跟模型一起開始（編譯在背景，townProgs）
  if (!TOWNS.kitP) townKit();                                           // 要的模型變多（townKitStale）⇒ 背景重解，這一組照畫
  var t0 = performance.now(), K = TOWNS.kit, P = townProgs(), eye = CAM.eye, PL = bedPlanes(CAM.vp);
  if (!P) return;
  TOWNS.list.forEach(function (T) {
    if (T.roadPending || T.roadSurface) return;
    T.roadPending = true;
    townRoadSurface(T.roads).then(function (R) { T.roadSurface = R; if (T.gt) townGroundPrep(T); }, function (e) { TOWNS.err = '路面：' + e.message; console.warn(TOWNS.err); });
  });
  var nb = 0;                                                            // 實例、地面的帶子、屋頂殼：一格最多建一座城的一樣、照背景預算（08_seabed.js bedBusy；跟地球儀同一條主執行緒）
  // 實例不等背景預算（TASK-0819；Tim 2026-10-22「照建議改」）：預算每格先被收塊、擺樹、地形網格吃光 ⇒ 模型解好了城還要等那一批做完（君士坦丁堡第二次去 1.3～2.4 s）。
  //   建實例本來就是一格做完、不分段 ⇒ 等預算只是晚做、不是不卡；拿掉之後模型一好城就出來（0～0.1 s），最長一格沒變長（A/B 各 3 輪）。照舊一格最多一座、照舊扣預算。
  //   但規劃晚到、城範圍裡還有排著要重新整地的塊（townRegrade）⇒ 先等它們：城牆的腳讀地面（townWallY → townGround → townHv）會把還沒整的塊在這一格當場整掉
  //   （君士坦丁堡那一格 730～880 ms）；隊伍每格至少一塊、近的先，跟模型解碼同時走。
  TOWNS.list.forEach(function (T) {
    if ((!T.inst || T.instRedo) && !nb && !townRgWait(T) && (K.part || !TOWNS.kitBusy)) { var b0 = performance.now(); T.instRedo = false; T.inst = townInst(T); if (TOWNS.stat.edit && T.edits) TOWNS.stat.edit.instMs = +(performance.now() - b0).toFixed(1); townTreesSet(T); if (!T.gt) townGroundPrep(T); townFlagFree(T); T.shDirty = true; T.tlS = T.tlD = true; TOWNS.dirty = true; nb++; bedSpent(b0); }
  });
  TL.k = TL.on ? TOD_LIT : 0;                                                        // 夜裡的燈：這一格點燈了沒（08_weather.js；陸地在城之前畫 ⇒ 用上一格的分組表，差一格看不出來）
  TOWNS.list.forEach(function (T) {                                    // 地面的帶子：一區一區（townGroundTile），離鏡頭近的先；一格最多 TOWN_GT_MAX 區、照背景預算
    // 骨架先出（TASK-0826，見 townKit 上面）：地面不等實例，城範圍的地整完（townRgWait）就分區開始建；有棧橋、碼頭的區排最前（townGroundNext），而且每格至少一區、不看預算
    //   （預算每格常被收塊、擺樹吃光 ⇒ 以前棧橋要等那一批做完）。?townskel=0 ⇒ 照舊等實例、照預算。
    if (TOWN_SKEL && !T.gt && !townRgWait(T)) townGroundPrep(T);
    if (!(T.inst || TOWN_SKEL) || !T.gt || (TOWN_SKEL && townRgWait(T))) return;
    for (var m = 0, Q; m < TOWN_GT_MAX && (Q = townGroundNext(T, eye)); m++) {
      if (bedBusy() && !(TOWN_SKEL && m === 0 && (townGroundPier(Q) || Q.edit))) break;   // 建築模式改到的區（Q.edit）同棧橋：每格至少一區
      var b0 = performance.now(); if (Q.g) townGpuFree(Q.g); Q.g = townGroundTile(T, Q); Q.dirty = false; Q.edit = false; T.gBuilt = true; bedSpent(b0);
    }
    if (T.gBuilt && !townGroundNext(T, eye)) { T.gBuilt = false; T.tlD = true; }   // 這一批都建好了 ⇒ 街燈的高度重取（以前地面每重建一次就重取）
  });
  var E = TOWNS.eye;
  if (TOWNS.dirty || !E || Math.abs(E[0] - eye[0]) + Math.abs(E[1] - eye[1]) + Math.abs(E[2] - eye[2]) > TOWN_REBIN) { townBin(PL, eye); TOWNS.eye = eye.slice(); TOWNS.dirty = false; }
  TOWNS.list.forEach(function (T) { if (T.shDirty && T.inst && !nb && !bedBusy()) { var b0 = performance.now(); if (T.shell) { gl.deleteVertexArray(T.shell.vao); gl.deleteBuffer(T.shell.vb); gl.deleteBuffer(T.shell.ib); } T.shell = townShell(T); T.shDirty = false; T.tlD = true; nb++; bedSpent(b0); } });   // 城牆的高度到了 ⇒ 城塔、城門的火把跟著
  TOWNS.list.forEach(function (T) { ['S', 'D'].forEach(function (pt) { if (T['tl' + pt] && T.inst && !nb && !bedBusy()) { var b0 = performance.now(); townLightBuild(T, pt); T['tl' + pt] = false; nb++; bedSpent(b0); } }); });   // 夜裡的燈：房子那份建一次、城牆＋街燈那份照高度重建
  townLampGrid(eye);
  var cf = gl.isEnabled(gl.CULL_FACE); gl.disable(gl.CULL_FACE);
  var fogD = WX.fog * BED_FOG * CAM.fogK, G = TOWNS.grp, L0 = TOWN_LOD[0], L1 = TOWN_LOD[1], B = TOWN_BAND, tris = 0;
  // 近、中：一種模型一次（照實例）
  var PV = P.vox; gl.useProgram(PV.prog); setCommon(PV); gl.uniform1f(PV.u.uFogD, fogD); gl.uniform3fv(PV.u.uEye, eye);
  for (var l = 0; l < 2; l++) {
    gl.uniform1f(PV.u.uEdge, l ? 0 : 1);
    if (l) { gl.uniform2f(PV.u.uIn, L0 - B[0], L0 + B[0]); gl.uniform2f(PV.u.uOut, L1 - B[1], L1 + B[1]); } else { gl.uniform2f(PV.u.uIn, -2, -1); gl.uniform2f(PV.u.uOut, L0 - B[0], L0 + B[0]); }
    K.names.forEach(function (nm, mi) {
      var n = G.cnt[l][mi]; if (!n) return; var Mm = K.M[nm], g = Mm.lod[l];
      gl.uniform3fv(PV.u.uC, l ? Mm.uc1 : Mm.uc0);
      gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[l]);
      townInstAttr(G, l, mi);
      gl.drawElementsInstanced(gl.TRIANGLES, g.nq * 6, gl.UNSIGNED_INT, 0, n); tris += g.nq * 2 * n;
    });
  }
  // 石基
  if (G.npl) {
    var PP = P.pl; gl.useProgram(PP.prog); setCommon(PP); gl.uniform1f(PP.u.uFogD, fogD); gl.uniform3f(PP.u.uCol, 0.62, 0.58, 0.50);
    gl.bindVertexArray(P.plVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, G.npl); tris += 12 * G.npl;
  }
  tris += townPostDraw(P, eye, fogD);                                    // 街燈的柱子、燈箱（夜裡的燈；同石基那一支著色器）
  // 貼圖
  if (G.nbb && K.tex) {
    var PB = P.bb; gl.useProgram(PB.prog); setCommon(PB); gl.uniform1f(PB.u.uFogD, fogD); gl.uniform3fv(PB.u.uEye, eye);
    gl.uniform2f(PB.u.uIn, L1 - B[1], L1 + B[1]); gl.uniform2f(PB.u.uOut, TOWN_FAR[0], TOWN_FAR[1]);
    gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D, K.tex); gl.uniform1i(PB.u.uTex, 11); gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(P.bbVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, G.nbb); tris += 2 * G.nbb;
  }
  // 地面的帶子（貼地、往鏡頭推一點 ⇒ 不跟地形打架）
  var PG = P.gr; gl.useProgram(PG.prog); setCommon(PG); gl.uniform1f(PG.u.uFogD, fogD);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -4);
  TOWNS.list.forEach(function (T) { Object.keys(T.gt || {}).forEach(function (k) { var g = T.gt[k].g; if (!g || !bedSeen(PL, g.bb) || townBoxDist(g.bb, eye) > TOWN_GROUND_VIEW) return; gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_INT, 0); tris += g.n / 3; }); });
  tris += townFieldDraw(P, PL, eye, fogD);                               // 遠處的田（貼在土上：再往鏡頭推一點）
  gl.disable(gl.POLYGON_OFFSET_FILL);
  // 布旗（同一支著色器；近、中那兩級的距離內才畫，鏡頭附近才動）
  var now = performance.now() / 1000, fdt = Math.min(0.1, Math.max(0, now - (TOWNS.flagT || now))), nfl = 0; TOWNS.flagT = now; TOWNS.flagClock = (TOWNS.flagClock || 0) + fdt;
  TOWNS.list.forEach(function (T) {
    if (!T.flags) T.flags = townFlags(T);
    T.flags.forEach(function (F) {
      var d = Math.hypot(F.at[0] - eye[0], F.at[2] - eye[2]); if (d > TOWN_LOD[1] * F.lk) return;   // 地標的旗跟著那一棟畫到中那一級的盡頭
      for (var i = 0; i < 6; i++) { var pl = PL[i]; if (pl[0] * F.at[0] + pl[1] * F.at[1] + pl[2] * F.at[2] + pl[3] < -6) return; }
      if (d < TOWN_FLAG_SIM) { F.acc += fdt; var ns2 = 0; while (F.acc >= TOWN_FLAG_DT && ns2 < 4) { townFlagStep(F, TOWN_FLAG_DT, TOWNS.flagClock); F.acc -= TOWN_FLAG_DT; ns2++; } if (ns2 === 4) F.acc = 0; }
      tris += townFlagMesh(F, eye); gl.drawArrays(gl.TRIANGLES, 0, F.n); nfl++;
    });
  });
  TOWNS.stat.flags = nfl;
  // 城鎮居民（沿路走動、看板換色立繪；63_townfolk.js，位置只照畫面時間算）
  tris += townFolkDraw(P, K, eye, PL, fogD, TOWNS.flagClock);
  // 屋頂殼（最遠一級：跟貼圖用同一個抖動互補）
  var PS = P.sh; gl.useProgram(PS.prog); setCommon(PS); gl.uniform1f(PS.u.uFogD, fogD); gl.uniform2f(PS.u.uIn, TOWN_FAR[0], TOWN_FAR[1]); gl.uniform2f(PS.u.uOut, 1e8, 2e8);
  var ns = 0;
  TOWNS.list.forEach(function (T) { var g = T.shell; if (!g || !bedSeen(PL, g.bb) || townBoxFar(g.bb, eye) < TOWN_FAR[0]) return; ns++; gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_INT, 0); tris += g.n / 3; });
  gl.bindVertexArray(null); if (cf) gl.enable(gl.CULL_FACE);
  TOWNS.stat.d3 = ns; TOWNS.stat.tris = tris; TOWNS.stat.drawMs = +(performance.now() - t0).toFixed(2);
}
/** 遠處的田（TASK-0879）：地面那幾區的 Q.gf、地標的田 T.lmg 裡看得到、而且有一部分遠過淡入起點（g.v0；照鏡頭的高度算進去）的那幾份 ⇒ 第一次有要畫的才拍貼圖（treeFieldBake）、一份一次 draw。
 *  呼叫時 polygonOffset 已經開著（地面的帶子那一段）⇒ 這裡推得比帶子再前面一點、畫完換回去。⇒ 畫了幾個三角形。 */
function townFieldDraw(P, PL, eye, fogD) {
  var S = TOWNS.stat; S.fields = 0; S.fieldMs = 0; if (!TREE_FIELD_CARD || !P.fc) return 0;
  var t0 = performance.now(), gs = [];
  function want(g) { return g && bedSeen(PL, g.bb) && townBoxDist(g.bb, eye) <= TOWN_GROUND_VIEW && townBoxFar(g.bb, eye) + Math.abs(eye[1] - g.bb[1]) >= g.v0; }
  TOWNS.list.forEach(function (T) { Object.keys(T.gt || {}).forEach(function (k) { var g = T.gt[k].gf; if (want(g)) gs.push(g); }); if (want(T.lmg)) gs.push(T.lmg); });
  if (!gs.length || !treeFieldBake()) return 0;
  var PF = P.fc, tris = 0; gl.useProgram(PF.prog); setCommon(PF); gl.uniform1f(PF.u.uFogD, fogD); gl.uniform2f(PF.u.uFK, TREE_FIELD_FADE[0], TREE_FIELD_FADE[1]); gl.uniform1i(PF.u.uFT, TREE_FIELD_UNIT);
  gl.activeTexture(gl.TEXTURE0 + TREE_FIELD_UNIT); gl.bindTexture(gl.TEXTURE_2D_ARRAY, TREES.ftex); gl.activeTexture(gl.TEXTURE0);
  gl.polygonOffset(-2, -8);
  gs.forEach(function (g) { gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_INT, 0); tris += g.n / 3; });
  gl.polygonOffset(-1, -4); gl.useProgram(P.gr.prog);                  // 後面的布旗接著用地面帶子那一支（uniform 還在）
  S.fields = gs.length; S.fieldMs = +(performance.now() - t0).toFixed(2);
  return tris;
}
/** 近、中那兩級的實例欄位（townBin 寫的 11 欄：aI x y z θ、aS 沿 x 縮放 深淺 地標倍率、aJ 斜接 ×2 坡度 牆基）⇒ 第 mi 種模型那一段；主畫面與陰影那一趟共用（版面只寫在這裡）。 */
function townInstAttr(G, l, mi) { var o = G.off[l][mi] * 44; gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 44, o); gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 44, o + 16); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 44, o + 28); }
/** 陰影的靜態那一層（60_render.js csmStatic；PASS.vp 已經換成那一段）：照主畫面上一次分好的組（townBin：近、中那兩級，含城牆）＋石基只寫深度。
 *  貼圖、屋頂殼、旗不畫（800 m 以外，陰影那一層的範圍也差不多到這裡）。⇒ 畫了幾個實例。 */
function townDepth() {
  if (!TOWNS.on || !TOWNS.list.length || !TOWNS.kit || !TOWNS.prog || !TOWNS.grp) return 0;
  var K = TOWNS.kit, P = TOWNS.prog, G = TOWNS.grp, PD = P.dVox, n = 0;
  gl.useProgram(PD.prog); setCommon(PD);
  for (var l = 0; l < 2; l++) K.names.forEach(function (nm, mi) {
    var k = G.cnt[l][mi]; if (!k) return; var Mm = K.M[nm], g = Mm.lod[l];
    gl.uniform3fv(PD.u.uC, l ? Mm.uc1 : Mm.uc0);
    gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[l]);
    townInstAttr(G, l, mi);
    gl.drawElementsInstanced(gl.TRIANGLES, g.nq * 6, gl.UNSIGNED_INT, 0, k); n += k;
  });
  if (G.npl && P.plVao) { var PP = P.dPl; gl.useProgram(PP.prog); setCommon(PP); gl.bindVertexArray(P.plVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, G.npl); }
  gl.bindVertexArray(null); return n;
}
function townBoxDist(b, e) { var dx = Math.max(b[0] - e[0], 0, e[0] - b[3]), dz = Math.max(b[2] - e[2], 0, e[2] - b[5]); return Math.sqrt(dx * dx + dz * dz); }
function townBoxFar(b, e) { var dx = Math.max(Math.abs(b[0] - e[0]), Math.abs(b[3] - e[0])), dz = Math.max(Math.abs(b[2] - e[2]), Math.abs(b[5] - e[2])); return Math.sqrt(dx * dx + dz * dz); }
/** 讀數（__game.town()）：幾座城、每座的雜湊與實例數、這一格畫了幾個（近、中、貼圖、殼）、三角形、毫秒；at ＝ [x, z] ⇒ 那一點的畫面高度、清不清樹。 */
function townStat(at) {
  var S = TOWNS.stat, o = { on: TOWNS.on, want: TOWNS.want, err: TOWNS.err, towns: TOWNS.list.map(function (T) {
    var u = {}; (T.inst || []).forEach(function (q) { u[q.k] = (u[q.k] || 0) + 1; });
    var tl = townLightStat(T);
    return { id: T.id, name: T.name, tier: T.tier, seed: T.seed, ox: T.ox, oy: T.oy, lots: (T.p.lots || []).length, roads: T.roads.length, walls: (T.p.walls || []).length, inst: (T.inst || []).length, ground: T.gt ? (function () { var K = Object.keys(T.gt); return { tiles: K.length, built: K.filter(function (k) { return T.gt[k].g; }).length, dirty: K.filter(function (k) { return T.gt[k].dirty; }).length, piers: K.filter(function (k) { return townGroundPier(T.gt[k]); }).length, piersBuilt: K.filter(function (k) { return townGroundPier(T.gt[k]) && T.gt[k].g; }).length }; })() : null,   // piers：有棧橋或碼頭的區（TASK-0826 先建）
      part: T.inst ? (TOWNS.kit && TOWNS.kit.part ? 'walls' : 'all') : null, walls: (T.inst || []).filter(function (q) { return q.wall; }).length,   // 地面的帶子分區（TASK-0817）
      folk: townFolkStat(T),
      byModel: u, lights: tl, center: [+(T.ox - BED.ax).toFixed(1), +(T.oy - BED.az).toFixed(1)] };
  }), kit: !!TOWNS.kit, kitPart: !!(TOWNS.kit && TOWNS.kit.part), kitN: S.kitN, kitMs: S.kitMs, skelN: S.skelN, skelMs: S.skelMs, kitMesh: { baked: S.meshBaked, live: S.meshLive, check: S.meshCheck, vk: townVkFp() }, kitTris: S.kitTris, skip: S.skip, gls: S.gls || 0, lines: S.lines || 0, under: S.under || {}, joins: S.joins || {}, wallJx: S.wallJx || {}, drawn: { full: S.d0, low: S.d1, card: S.d2, shells: S.d3, plinth: S.plinth, flags: S.flags || 0, folk: S.folk || 0, landmarks: S.lm || 0, fields: S.fields || 0 }, folk: townFolkSum(), tris: S.tris, ms: { draw: S.drawMs, fields: S.fieldMs || 0, bin: S.binMs, grade: +S.gradeMs.toFixed(1), prep: S.prepMs }, gradedChunks: S.chunks, regrade: { left: TOWNS.rgq ? Object.keys(TOWNS.rgq).length : 0, done: S.regraded }, edit: S.edit || null,
    night: { lit: +TL.k.toFixed(3), win: +TOD_WIN.toFixed(3), grid: TL.stat.inGrid, range: TL.stat.range || 0, full: TL.stat.full, over: TL.stat.over, gridMs: TL.stat.gridMs, cards: TL.stat.cards, glow: TL.stat.glow, glowMs: TL.stat.glowMs } };
  var group = typeof at === 'string' && at.indexOf('street:') === 0 ? at.slice(7) : null;
  if ((at === 'street' || at === 'walk' || group) && TOWNS.list[0] && TOWNS.kit && TOWNS.kit.folk) { o.street = townFolkStreet(TOWNS.list[0], TOWNS.kit.folk, at === 'walk', group); }   // street:workers：只排一組，不把39位擠在同一段。
  else if (Array.isArray(at)) { var q = bedCell(at[0], at[1]); o.at = { ground: +townGround(at[0], at[1]).toFixed(2), sim: +bedHgt(at[0], at[1]).toFixed(2), clear: q ? townClr(q.C, q.u * q.C.step, q.v * q.C.step) : null }; }
  return o;
}

// ── 建築模式的預覽（87_townbuild.js；TASK-0742，Tim 2026-10-22「城鎮建造是否可以加上預覽(道路&建築 在Hover狀態下顯示半透明預覽)」） ──
//   房子：試放的那一塊照 townLotInst 挑模型（同一個地塊 id ⇒ 跟蓋出來的同一棟），用城鎮那一支著色器畫一個實例：
//   先只寫深度、再照固定透明度混色（blendColor ＋ CONSTANT_ALPHA ⇒ 著色器不用改）⇒ 只看得到最前面那一層，不會透出屋子背面與屋裡的面。
//   蓋不了 ⇒ 暗一點、淡一點（紅框照舊由 87_townbuild.js twbLines 畫）。⛔ 只給人看：不進 T.inst、不碰整地。
var TOWN_GHOST_A = [0.55, 0.3];                                         // 透明度：蓋得了／蓋不了
/** 地塊 l（規劃座標，同 townBuild 會寫進去的那一份）⇒ 預覽的實例；模型還沒解好 ⇒ null。 */
function townGhost(T, l, ok) {
  var K = TOWNS.kit; if (!K || K.part || !T || !BED) return null;
  var q = townLotInst(T, K, l); if (!q) return null;
  q.sh = ok ? 1.05 : 0.55; q.a = TOWN_GHOST_A[ok ? 0 : 1]; return q;
}
/** 畫預覽的實例（60_render.js 經 87_townbuild.js twbDraw；地形、樹、城之後）。 */
function townGhostDraw(q) {
  var K = TOWNS.kit, P = TOWNS.prog, Mm = q && K && K.M[q.k]; if (!Mm || !P) return;
  var g = Mm.lod[0], PV = P.vox, B = TOWNS.ghost || (TOWNS.ghost = gl.createBuffer());
  gl.bindBuffer(gl.ARRAY_BUFFER, B); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([q.x, q.y, q.z, q.th, q.sx, q.sh, 1e6, 0, 0, 0, 0]), gl.DYNAMIC_DRAW);   // aS.z 1e6 ⇒ vD ≈ 0：近那一級、不淡出
  gl.useProgram(PV.prog); setCommon(PV); gl.uniform1f(PV.u.uFogD, WX.fog * BED_FOG * CAM.fogK); gl.uniform3fv(PV.u.uEye, CAM.eye);
  gl.uniform1f(PV.u.uEdge, 1); gl.uniform2f(PV.u.uIn, -2, -1); gl.uniform2f(PV.u.uOut, 1e7, 2e7); gl.uniform3fv(PV.u.uC, Mm.uc0);
  gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, B);
  gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 44, 0); gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 44, 16); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 44, 28);
  var cf = gl.isEnabled(gl.CULL_FACE), bs = [gl.BLEND_SRC_RGB, gl.BLEND_DST_RGB, gl.BLEND_SRC_ALPHA, gl.BLEND_DST_ALPHA].map(function (k) { return gl.getParameter(k); });
  gl.disable(gl.CULL_FACE);
  gl.colorMask(false, false, false, false); gl.drawElementsInstanced(gl.TRIANGLES, g.nq * 6, gl.UNSIGNED_INT, 0, 1);   // 只寫深度
  gl.colorMask(true, true, true, true); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendColor(0, 0, 0, q.a); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
  gl.drawElementsInstanced(gl.TRIANGLES, g.nq * 6, gl.UNSIGNED_INT, 0, 1);   // 深度相等（LEQUAL）的那一層混色
  gl.disable(gl.BLEND); gl.blendFuncSeparate(bs[0], bs[1], bs[2], bs[3]); gl.depthMask(true); if (cf) gl.enable(gl.CULL_FACE); gl.bindVertexArray(null);
}
// ── 點到哪一棟（通用接口；TASK-0869，Tim 2026-10-23「建築模式希望可以在點擊建築後可以顯示該建築名稱(點擊跟建築互動會是之後遊戲內功能 可以把點擊建築判定接口通用化)」）──
//   townHitAt(cx, cy, tMax) ⇒ { T, q（實例）, lot（規劃的那一塊）, m（模型的索引那一筆）, name, use, t（離眼睛幾公尺）, pt（碰到的世界點）}｜null
//     射線（townRayOf：螢幕那一點 ⇒ 眼睛出發的方向）對每一棟擺出來的建築的外框（那棟模型的長方體：寬 × 進深 × 模型頂，照實例的位置、轉向、高度倍率）取最先碰到的；
//     tMax ＝ 射線先碰到地面的距離（87_townbuild.js twbGround）⇒ 山、地形擋在前面就不算點到後面那一棟。⛔ 不讀 GPU、不看格子：點到屋簷底下的空處也算那一棟。
//     城牆、引水渠的實例沒有地塊 ⇒ 不算（要點城牆再加一種外框）。之後的互動（進屋、買賣、看產量…）都從這一支拿「點到誰」，名字照 townLotName。
//   townLotName(T, l, m) ⇒ 給人看的名字：手擺的地塊有 name（史料的名字）⇒「那個（模型的名字）」；不然模型的名字（Blocksail townmodels.py：作品標題括號前那一段）；都沒有 ⇒ 用途 key。
function townRayOf(cx, cy) {
  var r = cv.getBoundingClientRect(), nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2, bq = CAM.inv;
  var w0 = bq[3] * nx + bq[7] * ny - bq[11] + bq[15], w1 = bq[3] * nx + bq[7] * ny + bq[11] + bq[15];
  var p0 = mul(M4.pt(CAM.inv, nx, ny, -1), 1 / w0), p1 = mul(M4.pt(CAM.inv, nx, ny, 1), 1 / w1);
  return [p0, norm(sub(p1, p0))];
}
function townHitAt(cx, cy, tMax) {
  var K = TOWNS.kit; if (!K || !CAM.inv || !BED) return null;
  var R = townRayOf(cx, cy), o = R[0], d = R[1], lim = tMax == null ? 3000 : tMax, best = null;
  TOWNS.list.forEach(function (T) {
    (T.inst || []).forEach(function (q) {
      if (!q.lot || !q.pl) return;
      var c = Math.cos(q.th), s = Math.sin(q.th), ox = o[0] - q.x, oz = o[2] - q.z;   // 模型自己的軸：進深沿 th（地塊 rot：臨路那一邊，townLotInst）、寬垂直它
      var O = [ox * c + oz * s, -ox * s + oz * c, o[1]], V = [d[0] * c + d[2] * s, -d[0] * s + d[2] * c, d[1]];
      var lo = [-q.pl[1] / 2, -q.pl[0] / 2, q.y], hi = [q.pl[1] / 2, q.pl[0] / 2, q.y + q.top * q.sh], t0 = 0, t1 = Math.min(lim, best ? best.t : lim);
      for (var i = 0; i < 3; i++) {
        if (Math.abs(V[i]) < 1e-9) { if (O[i] < lo[i] || O[i] > hi[i]) return; continue; }
        var a = (lo[i] - O[i]) / V[i], b = (hi[i] - O[i]) / V[i]; if (a > b) { var w = a; a = b; b = w; }
        if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return;
      }
      best = { T: T, q: q, t: t0 };
    });
  });
  if (!best) return null;
  var l = (best.T.p.lots || []).filter(function (x) { return x.id === best.q.lot; })[0] || null, m = K.M[best.q.k] ? K.M[best.q.k].m : null;
  return { T: best.T, q: best.q, lot: l, m: m, name: townLotName(best.T, l, m), use: l ? l.use : m && m.use, t: +best.t.toFixed(2), pt: [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t] };
}
function townLotName(T, l, m) {
  var mn = m && m.name ? m.name : null, ln = l && l.name ? String(l.name).replace('(', '（').split('（')[0].trim() : null;
  return ln ? ln + (mn && mn !== ln ? '（' + mn + '）' : '') : mn || (l ? l.use : '?');
}
/** 建築模式選單裡的用途（87_townbuild.js twbMenuSet）：要的模型變多 ⇒ 重解一次模型組（同 townReplace）。 */
function townWantSet(uses) {
  TOWNS.wantUse = (uses || []).slice();
  var I = townIdx();
  if (I && TOWNS.kitHas && townNeed(I).some(function (nm) { return TOWNS.kitHas.indexOf(nm) < 0; })) townKitStale();
}
/** 測試用（__game.townLines）：城 id 的引水渠實例（海域座標：中心、轉角、x 的倍率、半長、半厚、模型的 arch）＋ 每條路照同一套換到海域座標的中心線與寬
 *  ⇒ 拿實例的墩（arch 兩側）去量跟路面疊多少 —— 跟規劃的 under 走不同的路（under 是 Blocksail 沿渠線取樣算的；這裡讀的是實際擺出來的實例） */
function townLines(id) {
  var T = TOWNS.list.filter(function (t) { return !id || t.id === id; })[0], K = TOWNS.kit; if (!T || !K) return null;
  function W(q) { var e = T.E(q); return [e[0] - BED.ax, e[1] - BED.az]; }
  return { id: T.id, lines: (T.inst || []).filter(function (q) { return q.line; }).map(function (q) { var m = K.M[q.k].m; return { k: q.k, x: q.x, z: q.z, th: q.th, sx: q.sx, hw: q.ft[0], hd: q.ft[1], arch: m.arch || null, len: m.size[0] * m.mpv }; }),
    roads: T.p.roads.map(function (r) { return { id: r.id, seq: r.seq, w: r.w, path: (r.closed ? r.path.concat([r.path[0]]) : r.path).map(W) }; }) };
}
/** 測試用（__game.townDump）：城 id（沒給 ⇒ 第一座）每一區地面網格（讀 GPU：頂點、索引）與城框裡每一塊畫面高度（townHv）的雜湊
 *  ⇒ 建築模式的增量重建 vs 重新進城整座建（或 ?townfull=1）逐位元組比（townReplace）。 */
function townDump(id) {
  var T = TOWNS.list.filter(function (t) { return !id || t.id === id; })[0]; if (!T || !BED || !BED.A) return null;
  function h32(a) { var u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), h = 2166136261; for (var i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
  function buf(t, b, A) { gl.bindBuffer(t, b); var a = new A(gl.getBufferParameter(t, gl.BUFFER_SIZE) / A.BYTES_PER_ELEMENT); gl.getBufferSubData(t, 0, a); return a; }
  var tiles = {}, chunks = {}, S = BED.A.chunk;
  gl.bindVertexArray(null);
  Object.keys(T.gt || {}).sort().forEach(function (k) { var Q = T.gt[k]; tiles[k] = Q.g ? h32(buf(gl.ARRAY_BUFFER, Q.g.vb, Float32Array)) + ':' + h32(buf(gl.ELEMENT_ARRAY_BUFFER, Q.g.ib, Uint32Array)) + (Q.dirty ? '*' : '') : Q.dirty ? 'dirty' : 'none'; });
  Object.keys(Object.assign({}, BED.ch, BED.cm)).sort().forEach(function (k) { var C = bedShowC(k); if (C && townBoxHit(T.box, [C.cx * S, C.cy * S, (C.cx + 1) * S, (C.cy + 1) * S])) chunks[k] = h32(townHv(C)) + '@' + C.step; });
  return { id: T.id, roads: T.roads.length, lots: (T.p.lots || []).length, inst: (T.inst || []).length, tiles: tiles, chunks: chunks };
}

// ── 夜裡的燈（Tim 2026-10-20「加了夜晚後 是否可以嘗試給現有建築標記一些燈(無陰影點光源) 然後渲染時要考慮效能」「然後也可以沿著街道自動部設街燈」；只給人看） ──
// 燈從哪來：Blocksail tools/townmodels.py 匯入時寫進索引的 lights（模型格座標）——
//   lamp [x, y, z, 型]：0 ＝ 作品雕的燈籠（固定點 wick）、1 ＝ 門口（作品沒雕燈籠才自動補）、2 ＝ 城塔外牆的火把、3 ＝ 城門洞頂的火把；
//   win [{ a, s, d, r }]：窗洞的形狀（薄的那一軸、往外的正負、洞外那一面、[[z0, z1, u0, u1], …]）。
//   ＋這裡沿路擺的街燈（型 4，townPosts）。
// 什麼時候亮：08_weather.js TOD_LIT（世界時間；太陽 3° 開始點、−5° 全亮）—— 沒開世界時間（對戰、沙盒）⇒ 0，一盞都不點、整段跳過。
//   窗：幾成亮著照 TOD_WIN（入夜七成、半夜以後慢慢熄）；哪一扇亮照雜湊（實例的 x、z ＋ 第幾扇，GLSL twH）⇒ 同一扇整晚一致、越晚熄掉的越多；窗片與遠處的光點同一個雜湊。
// 畫（效能）：
//   · 點光源（不投影子）：鏡頭附近 N × N 格（N 照畫質「城裡點光源的距離」TL_GRIDS：64／128／192 ⇒ 512 m／1 km／1.5 km 見方，Tim 2026-10-20「點光源的顯示距離可以在遠一些(特別是中高畫質 可以根據畫質支援更遠距離)」；
//     每格 TL_CELL 公尺，鏡頭動 TL_REBIN × N ÷ 64 公尺才重排；最外 4 格淡掉）的分組表（RGBA16UI 一格兩個像素：最多 TL_SLOT ＝ 8 盞的編號；第一版 4 盞，加拉塔近看 482 格滿了 ⇒ 光圈在格線上被切）
//     ＋燈的資料（RGBA32F：位置、半徑；顏色 × 亮度、相位）⇒ 每個像素只讀自己那一格（TLAMP_GLSL townLamp）：燈再多，每個像素最多算 8 盞。
//     一格超過 8 盞 ⇒ 留離格心近的（stat.full）；範圍裡超過 TL_MAX 盞 ⇒ 多的不照（stat.over）。照：建築（近、中）、石基、街燈、路、屋頂殼、陸地（63_bed_gl.js）。
//     uTLK 0（白天）⇒ 一進函式就回 0，不讀貼圖。
//   · 亮窗：每個模型一份窗片網格（townWinMesh；貼在洞外那一面、往外 0.08 格），照近那一級的實例畫（同一組抖動交接），加法、不寫深度 ⇒ 窗框、窗櫺照樣擋在前面。
//   · 光點：每座城一個靜態的緩衝區（燈一點、每扇窗一點；townLightBuild），GPU 一次畫完（看板四邊形、最小 TL_PX 像素、照霧淡掉）；窗的光點在近那一級的交接帶淡入、背對鏡頭的不畫。
//   · 燈籠的玻璃（色碼 245，只有燈籠用）夜裡自己發光（TOWN_FS）。
//   · 窗片、光點在海、玻璃之後畫（60_render.js 叫 townGlowDraw）：加法、不寫深度的東西先畫，會被之後畫的不透明蓋掉。
// ?townlights=0 ⇒ 整段關掉（量效能的對照組；柱子照畫）。
// 街燈（townPosts）：路（TL_STREET 的那幾種）每隔那麼多公尺一支、左右交錯、離路邊 TL_POST_OFF；落在建築、城牆的佔地裡（外擴 0.6 m）⇒ 換另一邊、還不行就跳過；
//   離別支 < TL_POST_GAP 公尺（路口、兩條路疊著）、站在別條路的路面上 ⇒ 跳過。位置照規劃算（每次一樣）；高度照畫面地形（townGround），那一塊還沒載 ⇒ 等下一次重建（stat miss）。
//   柱子、燈箱用石基那一支著色器（方塊）。⛔ 不碰戰局：船、砲彈穿過去。
var TL_GRIDS = [64, 128, 192], TL_GRID = 192, TL_CELL = 8, TL_SLOT = 8, TL_MAX = 4096, TL_REBIN = 4, TL_PX = 2.5;   // 格數照畫質「城裡點光源的距離」（07_gfx.js tlamp）：512 m／1 km／1.5 km 見方；貼圖照最大的配
var TL_STREET = { main: 24, street: 30, quay: 22 }, TL_POST_OFF = 0.5, TL_POST_GAP = 10, TL_POST_H = 3.2, TL_POST_MINW = 3;   // TL_POST_MINW：路寬不到 3 m（門口的小徑 link-door 2 m）不立街燈（kaguya 2026-10-21：和平港一座就有八十多條，每條插滿燈）
var TL_TYPE = [                                                         // 型 ⇒ r 照多遠（公尺）、k 亮度、c 光色、h 光暈半徑（公尺）
  { r: 8, k: 2.0, c: [1, 0.62, 0.28], h: 0.9 },                         // 0 燈籠
  { r: 9, k: 2.0, c: [1, 0.62, 0.28], h: 1.0 },                         // 1 門口
  { r: 12, k: 2.6, c: [1, 0.48, 0.16], h: 1.5 },                        // 2 城塔的火把
  { r: 12, k: 2.6, c: [1, 0.48, 0.16], h: 1.5 },                        // 3 城門的火把
  { r: 11, k: 2.2, c: [1, 0.66, 0.32], h: 1.1 }];                       // 4 街燈
var TL = { gTex: null, dTex: null, g: new Uint16Array(TL_GRID * TL_GRID * TL_SLOT), gd: new Float32Array(TL_GRID * TL_GRID * TL_SLOT), d: new Float32Array(TL_MAX * 8), a: new Float32Array([0, 0, 1 / TL_CELL, TL_GRID]),
  on: Q.get('townlights') !== '0', k: 0, eye: null, ver: 0, gv: -1, stat: { inGrid: 0, full: 0, over: 0, gridMs: 0, cards: 0, glow: 0, glowMs: 0 } };
// 點光源：uTLA ＝ (分組表的西北角 x、z, 1 ÷ 格寬, 格數)、uTLK ＝ 點燈了沒、uTLT ＝ 模擬時間（火光晃）
var TLAMP_GLSL = 'uniform highp usampler2D uTLG; uniform highp sampler2D uTLD; uniform vec4 uTLA; uniform float uTLK, uTLT;\n' +
  'vec3 townLamp(vec3 w, vec3 n){ if(uTLK<=0.0) return vec3(0.0); vec2 c=(w.xz-uTLA.xy)*uTLA.z; if(c.x<0.0||c.y<0.0||c.x>=uTLA.w||c.y>=uTLA.w) return vec3(0.0);\n' +
  ' ivec2 q=ivec2(c); uvec4 i0=texelFetch(uTLG,ivec2(q.x*2,q.y),0), i1=texelFetch(uTLG,ivec2(q.x*2+1,q.y),0); vec3 s=vec3(0.0);\n' +
  ' float e=min(min(c.x,c.y),min(uTLA.w-c.x,uTLA.w-c.y));\n' +   // e：離分組表的邊幾格 ⇒ 最外 4 格淡掉（不在邊上一刀切）
  ' for(int k=0;k<8;k++){ uint i=k<4?i0[k]:i1[k-4]; if(i==0u) break; int j=int(i-1u)*2; vec4 P=texelFetch(uTLD,ivec2(j&63,j>>6),0), C=texelFetch(uTLD,ivec2((j+1)&63,(j+1)>>6),0);\n' +
  '  vec3 L=P.xyz-w; float d=length(L), a=clamp(1.0-d/P.w,0.0,1.0); if(a<=0.0) continue; float fl=0.9+0.1*sin(uTLT*6.3+C.w)*sin(uTLT*2.7+C.w*1.9);\n' +
  '  s+=C.rgb*a*a*fl*(0.3+0.7*max(dot(n,L/max(d,0.001)),0.0)); } return s*uTLK*clamp(e*0.25,0.0,1.0); }\n';
// 哪一扇窗亮：實例的 x、z ＋ 第幾扇 ⇒ [0, 1)（窗片、光點同一份；整數雜湊，不吃 sin 的精度）
var TL_HASH_GLSL = 'float twH(vec2 xz, float id){ uvec3 v=floatBitsToUint(vec3(xz,id)); uint h=v.x*0x8da6b343u^v.y*0xd8163841u^v.z*0xcb1ab31fu; h^=h>>16; h*=0x7feb352du; h^=h>>15; h*=0x846ca68bu; h^=h>>16; return float(h>>8)/16777216.0; }\n' +
  'vec3 twCol(float h){ float v=fract(h*53.7); return mix(vec3(1.0,0.6,0.28),vec3(1.0,0.78,0.5),v)*(0.75+0.4*fract(h*91.3)); }\n';
// 窗片：模型格座標 aP.xyz、第幾扇 aP.w；實例同近那一級（townInstAttr）
var TOWN_WIN_VS = '#version 300 es\nlayout(location=0) in vec4 aP; layout(location=4) in vec4 aI; layout(location=5) in vec3 aS; layout(location=6) in vec4 aJ; uniform mat4 uVP; uniform vec3 uC, uEye; uniform float uTWin, uTLT;\n' +
  'out vec3 vW; out float vD; flat out vec3 vCol;\n' + TL_HASH_GLSL +
  'void main(){ float h=twH(aI.xz,aP.w); vW=vec3(0.0); vD=0.0; vCol=vec3(0.0); if(h>=uTWin){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }\n' +
  ' vec3 p=aP.xyz; float s=sin(aI.w), c=cos(aI.w), a=(p.x*uC.x-uC.y)*aS.x, b=p.y*uC.x-uC.z; vec3 w=vec3(aI.x+a*s-b*c, aI.y+p.z*uC.x+aJ.z*a, aI.z-a*c-b*s);\n' +
  ' vCol=twCol(h)*(0.94+0.06*sin(uTLT*(1.3+fract(h*7.0))+h*40.0)); vW=w; vD=length(aI.xz-uEye.xz)/aS.z; gl_Position=uVP*vec4(w,1.0); }\n';
var TOWN_WIN_FS = function () {
  return '#version 300 es\nprecision highp float;\n' + TOWN_FADE + 'in vec3 vW; in float vD; flat in vec3 vCol; uniform vec3 uEye; uniform float uFogD, uClip, uTLK; out vec4 o;\n' +
    'void main(){ if(vW.y<uClip) discard; if(townCut(vD)) discard; float fd=length(vW-uEye); o=vec4(vCol*1.25*uTLK*exp(-fd*uFogD),1.0); }\n';
};
// 光點：四邊形 aQ ∈ [−½, ½] × [0, 1]（P.quad）；aA ＝ (位置, 半徑)、aB ＝ (顏色, 型：−1 窗)、aC ＝ 窗 (實例 x, z, 第幾扇, 地標倍率)／燈 (—, —, —, 相位)、aN ＝ 窗往外的方向
var TOWN_GLOW_VS = '#version 300 es\nlayout(location=0) in vec2 aQ; layout(location=4) in vec4 aA; layout(location=5) in vec4 aB; layout(location=6) in vec4 aC; layout(location=7) in vec2 aN;\n' +
  'uniform mat4 uVP; uniform vec3 uEye, uR, uU; uniform float uPx, uTLK, uTWin, uTLT, uFogD; uniform vec2 uWin; out vec2 vQ; flat out vec3 vCol;\n' + TL_HASH_GLSL +
  'void main(){ vec3 p=aA.xyz, e=uEye-p; float d=length(e), k=uTLK; vec3 col=aB.rgb;\n' +
  ' if(aB.w<0.0){ float h=twH(aC.xy,aC.z); if(h>=uTWin) k=0.0; col=twCol(h);\n' +
  '  k*=smoothstep(uWin.x,uWin.y,length(aC.xy-uEye.xz)/aC.w)*smoothstep(-0.05,0.3,dot(aN,normalize(e.xz+vec2(1e-4)))); }\n' +
  ' else k*=0.85+0.15*sin(uTLT*6.3+aC.w)*sin(uTLT*2.7+aC.w*1.9);\n' +
  ' float s=max(aA.w,uPx*d*' + TL_PX.toFixed(2) + '); k*=pow(aA.w/s,0.3)*exp(-d*uFogD*0.5);\n' +   // 撐到最小像素 ⇒ 亮度只扣一點（第一版開根號：1.5 km 外的城只剩暗點）；自己發光的透霧比反光的遠 ⇒ 霧減半
  ' vQ=vec2(aQ.x*2.0,aQ.y*2.0-1.0); vCol=col*k; if(k<=0.003){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }\n' +
  ' vec3 w=p+e/max(d,0.001)*min(s*0.7,d*0.5)+(uR*vQ.x+uU*vQ.y)*s; gl_Position=uVP*vec4(w,1.0); }\n';   // 往鏡頭拉一點：光暈不被自己那面牆切一半
var TOWN_GLOW_FS = '#version 300 es\nprecision highp float;\nin vec2 vQ; flat in vec3 vCol; out vec4 o;\n' +
  'void main(){ float r=dot(vQ,vQ); if(r>1.0) discard; o=vec4(vCol*(exp(-r*5.0)*0.55+exp(-r*16.0)*0.9),1.0); }\n';

/** setCommon（01_gl.js）：有 uTLK 的著色器 ⇒ 分組表、燈的資料（第 13、14 號，第一次建）、點燈了沒。 */
function townLampSet(u) {
  if (!TL.gTex) {
    TL.gTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, TL.gTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, TL_GRID * 2, TL_GRID, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, TL.g);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    TL.dTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE14); gl.bindTexture(gl.TEXTURE_2D, TL.dTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 64, TL_MAX * 2 / 64, 0, gl.RGBA, gl.FLOAT, TL.d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.activeTexture(gl.TEXTURE0);
  }
  gl.uniform1i(u.uTLG, 13); gl.uniform1i(u.uTLD, 14); gl.uniform4fv(u.uTLA, TL.a); gl.uniform1f(u.uTLK, TL.k); if (u.uTLT) gl.uniform1f(u.uTLT, SIMT);
}
/** 分組表（townDraw 每一格叫；點燈了、鏡頭動了 TL_REBIN 公尺、燈換過才重排）。 */
function townLampGrid(eye) {
  if (!TL.k || !TL.gTex) return;
  var N = TL_GRIDS[GFX.tlamp] || TL_GRIDS[0], E = TL.eye; if (E && TL.gv === TL.ver && TL.gn === N && Math.abs(E[0] - eye[0]) + Math.abs(E[2] - eye[2]) < TL_REBIN * N / 64) return;   // 範圍大 ⇒ 重排的距離跟著放大
  var t0 = performance.now(), C = TL_CELL, x0 = Math.floor(eye[0] / C) * C - N * C / 2, z0 = Math.floor(eye[2] / C) * C - N * C / 2, X1 = x0 + N * C, Z1 = z0 + N * C;
  var G = TL.g, GD = TL.gd, D = TL.d, n = 0, full = 0, over = 0;
  G.fill(0, 0, N * N * TL_SLOT);
  TOWNS.list.forEach(function (T) {
    var L = T.tl && T.tl.lamps; if (!L) return;
    for (var i = 0; i < L.length; i += 5) {
      var x = L[i], y = L[i + 1], z = L[i + 2], P = TL_TYPE[L[i + 3]], R = P.r;
      if (x + R < x0 || x - R > X1 || z + R < z0 || z - R > Z1) continue;
      if (n >= TL_MAX) { over++; continue; }
      var o = n * 8, id = ++n;
      D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = R; D[o + 4] = P.c[0] * P.k; D[o + 5] = P.c[1] * P.k; D[o + 6] = P.c[2] * P.k; D[o + 7] = L[i + 4];
      var i0 = Math.max(0, Math.floor((x - R - x0) / C)), i1 = Math.min(N - 1, Math.floor((x + R - x0) / C)), j0 = Math.max(0, Math.floor((z - R - z0) / C)), j1 = Math.min(N - 1, Math.floor((z + R - z0) / C));
      for (var j = j0; j <= j1; j++) for (var ii = i0; ii <= i1; ii++) {
        var ex = Math.max(x0 + ii * C - x, 0, x - (x0 + (ii + 1) * C)), ez = Math.max(z0 + j * C - z, 0, z - (z0 + (j + 1) * C));
        if (ex * ex + ez * ez > R * R) continue;                         // 圓碰不到這一格
        var c = (j * N + ii) * TL_SLOT, cx = x0 + (ii + 0.5) * C - x, cz = z0 + (j + 0.5) * C - z, d2 = cx * cx + cz * cz, s = -1, far = -1;
        for (var k = 0; k < TL_SLOT; k++) { if (!G[c + k]) { s = k; break; } if (far < 0 || GD[c + k] > GD[c + far]) far = k; }
        if (s < 0) { full++; if (GD[c + far] <= d2) continue; s = far; }   // 滿了 ⇒ 換掉離格心最遠的那一盞（新的比較近才換）
        G[c + s] = id; GD[c + s] = d2;
      }
    }
  });
  gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, TL.gTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N * 2, N, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, G.subarray(0, N * N * TL_SLOT));
  var rows = Math.ceil(n * 2 / 64);
  if (rows) { gl.activeTexture(gl.TEXTURE14); gl.bindTexture(gl.TEXTURE_2D, TL.dTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, rows, gl.RGBA, gl.FLOAT, D.subarray(0, rows * 256)); }
  gl.activeTexture(gl.TEXTURE0);
  TL.a[0] = x0; TL.a[1] = z0; TL.a[3] = N; TL.eye = eye.slice(); TL.gv = TL.ver; TL.gn = N;
  TL.stat.inGrid = n; TL.stat.range = N * C; TL.stat.full = full; TL.stat.over = over; TL.stat.gridMs = +(performance.now() - t0).toFixed(2);
}
/** 模型的窗片網格（索引 lights.win ⇒ 每扇窗的洞，一列一個四邊形；屬性 0 ＝ (模型格 x, y, z, 第幾扇)、4～6 ＝ 實例）；沒有窗 ⇒ null。 */
function townWinMesh(m) {
  var W = (m.lights || {}).win; if (!W || !W.length) return null;
  var V = [];
  W.forEach(function (w, wi) {
    var d = w.d + w.s * 0.08;                                            // 往外 0.08 格：不跟玻璃那一面打架
    w.r.forEach(function (r) {
      [[r[2], r[0]], [r[3], r[0]], [r[3], r[1]], [r[2], r[0]], [r[3], r[1]], [r[2], r[1]]].forEach(function (q) { if (w.a) V.push(q[0], d, q[1], wi); else V.push(d, q[0], q[1], wi); });
    });
  });
  var g = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), n: V.length / 4 };
  gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
  [4, 5, 6].forEach(function (a) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); });
  gl.bindVertexArray(null);
  return g;
}
/** 城 T 的街燈位置（海域座標轉世界，照規劃算一次；見檔頭那一段）：[[x, z], …]。 */
function townPosts(T) {
  if (T.posts) return T.posts;
  var out = [], ax = BED.ax, az = BED.az, IG = {}, RG = {}, PG = {}, GI = 16, GR = 32;
  function cells(x0, z0, x1, z1, g, f) { for (var j = Math.floor(z0 / g); j <= Math.floor(z1 / g); j++) for (var i = Math.floor(x0 / g); i <= Math.floor(x1 / g); i++) f(i + ',' + j); }
  (T.inst || []).forEach(function (q) {                                 // 佔地（建築：地塊上那一棟；城牆：半長、半厚）
    var h = q.pl ? [q.pl[0] / 2, q.pl[1] / 2] : q.ft; if (!h) return; var R = Math.hypot(h[0], h[1]) + 1;
    var b = { x: q.x, z: q.z, s: Math.sin(q.th), c: Math.cos(q.th), h: h };
    cells(q.x - R, q.z - R, q.x + R, q.z + R, GI, function (k) { (IG[k] = IG[k] || []).push(b); });
  });
  T.roads.forEach(function (r) {
    for (var q = 1; q < r.P.length; q++) { var a = r.P[q - 1], b = r.P[q], sg = { a: a, b: b, hw: r.w / 2, r: r }; cells(Math.min(a[0], b[0]) - r.w, Math.min(a[1], b[1]) - r.w, Math.max(a[0], b[0]) + r.w, Math.max(a[1], b[1]) + r.w, GR, function (k) { (RG[k] = RG[k] || []).push(sg); }); }
  });
  function inBldg(x, z) {                                               // 世界座標
    var L = IG[Math.floor(x / GI) + ',' + Math.floor(z / GI)] || [];
    return L.some(function (b) { var dx = x - b.x, dz = z - b.z, a = dx * b.s - dz * b.c, c = -dx * b.c - dz * b.s; return Math.abs(a) <= b.h[0] + 0.6 && Math.abs(c) <= b.h[1] + 0.6; });
  }
  function onRoad(x, z, own) {                                          // 海域座標：站在別條路的路面上
    var L = RG[Math.floor(x / GR) + ',' + Math.floor(z / GR)] || [];
    return L.some(function (sg) { return sg.r !== own && townSegDist(x, z, sg.a, sg.b) < sg.hw + 0.3; });
  }
  function crowded(x, z) {
    var i0 = Math.floor(x / TL_POST_GAP), j0 = Math.floor(z / TL_POST_GAP);
    for (var j = j0 - 1; j <= j0 + 1; j++) for (var i = i0 - 1; i <= i0 + 1; i++) if ((PG[i + ',' + j] || []).some(function (p) { return Math.hypot(p[0] - x, p[1] - z) < TL_POST_GAP; })) return true;
    return false;
  }
  T.roads.forEach(function (r) {
    var sp = TL_STREET[r.kind]; if (!sp || r.w < TL_POST_MINW) return;
    var acc = sp / 2, k = townHash(T.id + ':' + r.id) < 0.5 ? 0 : 1;
    for (var q = 1; q < r.P.length; q++) {
      var a = r.P[q - 1], b = r.P[q], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 1e-6) continue;
      var nx = -dz / L, nz = dx / L, off = r.w / 2 + TL_POST_OFF;
      for (var t = acc; t <= L; t += sp) {
        var px = a[0] + dx * t / L, pz = a[1] + dz * t / L, side = k++ % 2 ? 1 : -1, got = null;
        [side, -side].some(function (sd) {
          var x = px + nx * off * sd, z = pz + nz * off * sd;
          if (inBldg(x - ax, z - az) || onRoad(x, z, r) || crowded(x, z)) return false;
          got = [x, z]; return true;
        });
        if (got) { var kk = Math.floor(got[0] / TL_POST_GAP) + ',' + Math.floor(got[1] / TL_POST_GAP); (PG[kk] = PG[kk] || []).push(got); out.push([got[0] - ax, got[1] - az]); }
      }
      acc = t - L;
    }
  });
  T.posts = out;
  return out;
}
/** 城 T 的燈，分兩份（townDraw 照背景預算建；第一版整份一起建：君士坦丁堡一次 77 ms、每來一塊地形就重一次）：
 *  'S' ＝ 房子的燈與窗（高度照規劃，實例建好就定了 ⇒ 建一次）、'D' ＝ 城牆的火把＋街燈（照城牆、地形的高度 ⇒ 那一塊到了、城牆有高度了就重建；量少、建得快）。
 *  每份：點光源清單 lamps（x, y, z, 型, 相位）、光點緩衝區、（D）街燈的柱子。T.tl ＝ { S, D, lamps（兩份接起來，分組表讀）, 讀數 }。 */
function townLightBuild(T, part) {
  var t0 = performance.now(), K = TOWNS.kit, P = townProgs(), lamps = [], glow = [], posts = [], nWin = 0, miss = 0, dyn = part === 'D';
  function lamp(w, ty, ph) { var Y = TL_TYPE[ty]; lamps.push(w[0], w[1], w[2], ty, ph); glow.push(w[0], w[1], w[2], Y.h, Y.c[0] * Y.k, Y.c[1] * Y.k, Y.c[2] * Y.k, ty, 0, 0, 0, ph, 0, 0); }
  (T.inst || []).forEach(function (q) {
    if (!!q.wall !== dyn) return;
    var m = K.M[q.k].m, Lt = m.lights; if (!Lt) return;
    if (!(q.y === q.y)) { miss++; return; }                              // 城牆：那一塊還沒載
    var s = Math.sin(q.th), c = Math.cos(q.th), mpv = m.mpv, hw = m.size[0] * mpv / 2, hd = m.size[1] * mpv / 2, J = q.mj || TOWN_J0;
    function W(v) { var a = (v[0] * mpv - hw) * q.sx, b = v[1] * mpv - hd; return [q.x + a * s - b * c, q.y + v[2] * mpv + J[2] * a, q.z - a * c - b * s]; }   // 模型 → 世界（檔頭的公式＋城牆的坡度）
    (Lt.lamp || []).forEach(function (l, li) { lamp(W(l), l[3], townHash((q.lot || q.wall || q.k) + ':' + q.x.toFixed(1) + ':lamp' + li) * 6.2832); });
    (Lt.win || []).forEach(function (wd, wi) {                          // 窗的光點：洞的面積中心、往外 0.15 m；大小 ≈ 洞的長邊
      var A = 0, su = 0, sz = 0, zl = 1e9, zh = -1e9, ul = 1e9, uh = -1e9;
      wd.r.forEach(function (r) { var ar = (r[1] - r[0]) * (r[3] - r[2]); A += ar; su += ar * (r[2] + r[3]) / 2; sz += ar * (r[0] + r[1]) / 2; zl = Math.min(zl, r[0]); zh = Math.max(zh, r[1]); ul = Math.min(ul, r[2]); uh = Math.max(uh, r[3]); });
      if (!A) return;
      var u = su / A, z = sz / A, w = W(wd.a ? [u, wd.d, z] : [wd.d, u, z]), mx = wd.a ? 0 : wd.s, my = wd.a ? wd.s : 0, nx = mx * s - my * c, nz = -mx * c - my * s;
      glow.push(w[0] + nx * 0.15, w[1], w[2] + nz * 0.15, Math.max(zh - zl, uh - ul) * mpv * 0.75, 1, 1, 1, -1, q.x, q.z, wi, q.lk || 1, nx, nz); nWin++;
    });
  });
  if (dyn) townPosts(T).forEach(function (p, i) {                       // 街燈：柱子（地下多埋 0.3 m）＋燈箱，燈在燈箱中間
    var gy = townGround(p[0], p[1]); if (!(gy === gy)) { miss++; return; }
    var top = gy + TL_POST_H;
    posts.push(p[0], top, p[1], 0, 0.13, 0.13, TL_POST_H + 0.3, 1, p[0], top + 0.42, p[1], 0, 0.3, 0.3, 0.42, 0.9);
    lamp([p[0], top + 0.2, p[1]], 4, townHash(T.id + ':post' + i) * 6.2832);
  });
  var tl = T.tl || (T.tl = { S: null, D: null, lamps: null, ms: {} });
  townLightPartFree(tl[part]);
  var o = tl[part] = { lamps: new Float32Array(lamps), nWin: nWin, nPost: posts.length / 16, nGlow: glow.length / 14, miss: miss, glowVao: null, glowBuf: null, postVao: null, postBuf: null, bb: null };
  if (o.nGlow) {
    o.glowBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.glowBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(glow), gl.STATIC_DRAW);
    o.glowVao = gl.createVertexArray(); gl.bindVertexArray(o.glowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, P.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.glowBuf);
    [[4, 4, 0], [5, 4, 16], [6, 4, 32], [7, 2, 48]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribDivisor(a[0], 1); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, 56, a[2]); });
  }
  if (o.nPost) {
    var bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (var k = 0; k < posts.length; k += 8) { bb[0] = Math.min(bb[0], posts[k]); bb[1] = Math.min(bb[1], posts[k + 1] - 4); bb[2] = Math.min(bb[2], posts[k + 2]); bb[3] = Math.max(bb[3], posts[k]); bb[4] = Math.max(bb[4], posts[k + 1]); bb[5] = Math.max(bb[5], posts[k + 2]); }
    o.bb = bb;
    o.postBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.postBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(posts), gl.STATIC_DRAW);
    o.postVao = gl.createVertexArray(); gl.bindVertexArray(o.postVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, P.cube); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.postBuf); [4, 5].forEach(function (a, q) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 1); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 32, q * 16); });
  }
  gl.bindVertexArray(null);
  var a0 = tl.S ? tl.S.lamps : new Float32Array(0), a1 = tl.D ? tl.D.lamps : new Float32Array(0);
  tl.lamps = new Float32Array(a0.length + a1.length); tl.lamps.set(a0); tl.lamps.set(a1, a0.length);
  tl.ms[part] = +(performance.now() - t0).toFixed(1);
  TL.ver++;
}
function townLightPartFree(o) {
  if (!o) return;
  if (o.glowVao) { gl.deleteVertexArray(o.glowVao); gl.deleteBuffer(o.glowBuf); }
  if (o.postVao) { gl.deleteVertexArray(o.postVao); gl.deleteBuffer(o.postBuf); }
}
/** 讀數（townStat）：燈幾盞、窗幾扇、街燈幾支、還沒有高度的、建一份幾 ms。 */
function townLightStat(T) {
  var tl = T.tl; if (!tl) return null;
  var S = tl.S || {}, D = tl.D || {};
  return { lamps: tl.lamps.length / 5, wins: S.nWin || 0, posts: D.nPost || 0, miss: (S.miss || 0) + (D.miss || 0), ms: tl.ms };
}
/** 街燈的柱子、燈箱（townDraw 石基之後；白天也畫）⇒ 三角形數。 */
function townPostDraw(P, eye, fogD) {
  var PP = P.pl, tris = 0, on = false;
  TOWNS.list.forEach(function (T) {
    var tl = T.tl && T.tl.D; if (!tl || !tl.nPost || townBoxDist(tl.bb, eye) > TOWN_LOD[1]) return;
    if (!on) { gl.useProgram(PP.prog); setCommon(PP); gl.uniform1f(PP.u.uFogD, fogD); gl.uniform3f(PP.u.uCol, 0.2, 0.17, 0.14); on = true; }
    gl.bindVertexArray(tl.postVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, tl.nPost * 2); tris += 24 * tl.nPost;
  });
  return tris;
}
// 玻璃（Tim 2026-10-23「建築是否支援玻璃(跟船一樣的)」）：模型檔的 gls（Blocksail tools/townmodels.py glass_faces：子作品 meta material=glass 那幾格貼著空氣的面，
//   每面 4 個 u16 ＝ 格 x、y、z、面 | 色號 << 3；面照 TOWN_GLS_FACE）；近那一級的網格不放那幾格，低模、貼圖、屋頂照舊有它（遠看是深色的窗）。
//   ⇒ 一個模型一份平面網格（模型本地公尺：a ＝ x·mpv − 寬/2、b ＝ y·mpv − 深/2、高 ＝ z·mpv；頂點同船的玻璃 15_smooth.js glsBuild：位置、法線、色、[金屬度, 粗糙度, 透明度]，照材質表的 glass）
//   ⇒ townGlsDraw 照近那一級的實例一棟一次畫（P.tri ＋ uGls：同船的玻璃那一段 —— 混色、不寫深度、由遠到近；60_render.js 在船的玻璃之後、亮窗之前）。只給人看。
var TOWN_GLS_FACE = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
/** 模型檔的 gls ⇒ Promise<{ vao, vbo, n } | null>（見上）。 */
function townGlsMesh(m0, b64) {
  if (!b64) return Promise.resolve(null);
  return VK.inflateRaw(VK.b64ToBytes(b64)).then(function (raw) {
    var A = new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)), mpv = m0.mpv, hx = m0.size[0] * mpv / 2, hy = m0.size[1] * mpv / 2;
    var mt = matInfo('glass'), mm = +mt.metal || 0, mr = isFinite(+mt.rough) && mt.rough !== undefined ? +mt.rough : 0.06, mc = clamp(+mt.clear || 0.6, 0, 0.95);
    var V = new Float32Array(A.length / 4 * 72), o = 0, T6 = [0, 1, 2, 0, 2, 3];
    for (var k = 0; k + 3 < A.length; k += 4) {
      var f = A[k + 3] & 7, col = A[k + 3] >> 3, n = TOWN_GLS_FACE[f], ax = f >> 1, ua = SM_UAX[ax], va = SM_VAX[ax], L = [A[k], A[k + 1], A[k + 2]], q = [];
      if (n[ax] > 0) L[ax]++;
      for (var e = 0; e < 4; e++) { var c = SM_C4[n[ax] > 0 ? e : 3 - e], Q = L.slice(); Q[ua] += c[0]; Q[va] += c[1]; q.push(Q); }
      var r = ((col >> 5) & 7) / 7, gg = ((col >> 2) & 7) / 7, b = (col & 3) / 3;
      for (var t = 0; t < 6; t++) { var P2 = q[T6[t]]; V[o++] = P2[0] * mpv - hx; V[o++] = P2[1] * mpv - hy; V[o++] = P2[2] * mpv; V[o++] = n[0]; V[o++] = n[1]; V[o++] = n[2]; V[o++] = r; V[o++] = gg; V[o++] = b; V[o++] = mm; V[o++] = mr; V[o++] = mc; }
    }
    var g = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), n: o / 12 };
    gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo); gl.bufferData(gl.ARRAY_BUFFER, V, gl.STATIC_DRAW);
    [[0, 0], [1, 3], [2, 6], [3, 9]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], 3, gl.FLOAT, false, 48, a[1] * 4); });
    gl.bindVertexArray(null);
    return g;
  });
}
/** 玻璃那一趟（見上）：近那一級、有玻璃的實例，由遠到近一棟一次；讀數 TOWNS.stat.gls ＝ 這一格畫了幾棟。 */
var TOWN_GLS_M = new Float32Array(16);
function townGlsDraw() {
  TOWNS.stat.gls = 0;
  var K = TOWNS.kit, G = TOWNS.grp, D0 = TOWNS.buf[0];
  if (!TOWNS.on || !K || !G || !D0 || PASS.vp) return;
  var E = CAM.eye, L = [];
  K.names.forEach(function (nm, mi) {
    var Mm = K.M[nm], n = G.cnt[0][mi]; if (!n || !Mm.gls || !Mm.gls.n) return;
    for (var j = 0; j < n; j++) { var o = (G.off[0][mi] + j) * 11; L.push({ g: Mm.gls, o: o, d: Math.hypot(D0[o] - E[0], D0[o + 2] - E[2]) }); }
  });
  if (!L.length) return;
  L.sort(function (a, b) { return b.d - a.d; });
  var cf = gl.isEnabled(gl.CULL_FACE), M = TOWN_GLS_M;
  gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
  gl.useProgram(P.tri.prog); setCommon(P.tri); gl.uniform1f(P.tri.u.uLit, 1); gl.uniform1f(P.tri.u.uGls, 1); if (P.tri.u.uGlow) gl.uniform1f(P.tri.u.uGlow, 0); cutSet(P.tri, null);
  L.forEach(function (it) {
    var o = it.o, s = Math.sin(D0[o + 3]), c = Math.cos(D0[o + 3]), sx = D0[o + 4];   // 實例的欄位見 townInstAttr：aI x y z θ、aS 沿 x 縮放…、aJ 斜接 ×2 坡度 牆基
    M[0] = s * sx; M[1] = D0[o + 9] * sx; M[2] = -c * sx; M[3] = 0; M[4] = -c; M[5] = 0; M[6] = -s; M[7] = 0; M[8] = 0; M[9] = 1; M[10] = 0; M[11] = 0; M[12] = D0[o]; M[13] = D0[o + 1]; M[14] = D0[o + 2]; M[15] = 1;
    gl.uniformMatrix4fv(P.tri.u.uModel, false, M); gl.bindVertexArray(it.g.vao); gl.drawArrays(gl.TRIANGLES, 0, it.g.n);
  });
  gl.bindVertexArray(null); gl.uniform1f(P.tri.u.uGls, 0); gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); if (cf) gl.enable(gl.CULL_FACE);
  TOWNS.stat.gls = L.length;
}
/** 亮窗、光點（60_render.js：海、玻璃之後；加法、不寫深度）。白天（TL.k 0）整段不畫。 */
function townGlowDraw() {
  TL.stat.cards = 0; TL.stat.glow = 0;
  if (!TL.k || !TOWNS.on || !TOWNS.kit || !TOWNS.prog || PASS.vp) return;
  var t0 = performance.now(), P = TOWNS.prog, K = TOWNS.kit, G = TOWNS.grp, eye = CAM.eye, fogD = WX.fog * BED_FOG * CAM.fogK, L0 = TOWN_LOD[0], B0 = TOWN_BAND[0];
  var cf = gl.isEnabled(gl.CULL_FACE); gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
  if (G) {                                                              // 窗片：近那一級的實例
    var PW = P.win; gl.useProgram(PW.prog); setCommon(PW);
    gl.uniform1f(PW.u.uFogD, fogD); gl.uniform3fv(PW.u.uEye, eye); gl.uniform1f(PW.u.uTWin, TOD_WIN); gl.uniform1f(PW.u.uTLK, TL.k); gl.uniform1f(PW.u.uTLT, SIMT);
    gl.uniform2f(PW.u.uIn, -2, -1); gl.uniform2f(PW.u.uOut, L0 - B0, L0 + B0);
    K.names.forEach(function (nm, mi) {
      var n = G.cnt[0][mi], Mm = K.M[nm]; if (!n || !Mm.win) return;
      gl.uniform3fv(PW.u.uC, Mm.uc0); gl.bindVertexArray(Mm.win.vao); gl.bindBuffer(gl.ARRAY_BUFFER, P.ib[0]); townInstAttr(G, 0, mi);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, Mm.win.n, n); TL.stat.cards += n;
    });
  }
  var PG = P.glow, on = false;   // 光點：每座城一次
  TOWNS.list.forEach(function (T) { [T.tl && T.tl.S, T.tl && T.tl.D].forEach(function (tl) {
    if (!tl || !tl.nGlow) return;
    if (!on) {
      var f = norm(sub(CAM.look, CAM.eye)), r = norm([-f[2], 0, f[0]]), u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];   // 鏡頭的右、上
      gl.useProgram(PG.prog); setCommon(PG); gl.uniform3fv(PG.u.uEye, eye); gl.uniform3fv(PG.u.uR, r); gl.uniform3fv(PG.u.uU, u);
      gl.uniform1f(PG.u.uPx, 2 * Math.tan(0.45) / CAM.h); gl.uniform1f(PG.u.uTLK, TL.k); gl.uniform1f(PG.u.uTWin, TOD_WIN); gl.uniform1f(PG.u.uTLT, SIMT); gl.uniform1f(PG.u.uFogD, fogD);
      gl.uniform2f(PG.u.uWin, L0 - B0, L0 + B0); on = true;
    }
    gl.bindVertexArray(tl.glowVao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, tl.nGlow); TL.stat.glow += tl.nGlow;
  }); });
  gl.bindVertexArray(null); gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); if (cf) gl.enable(gl.CULL_FACE);
  TL.stat.glowMs = +(performance.now() - t0).toFixed(2);
}

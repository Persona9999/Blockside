// ───────────────────────── 可換零件：掛點＋換裝表（TASK-0713／0714；Tim 2026-10-18） ─────────────────────────
// Tim：「原本的砲變成類似砲位的標記」「零件替換後維持原本的序號（等於多一個 Slot 表示這門砲目前實際用什麼型號）」「其他物件也用類似的概念去設計」。
// 掛點 ＝ 作品裡原本雕的那一件（路徑、序號、id 都不變）；換裝表 ＝ { 掛點的 id: 換成哪一種 }（第一段只有砲：值 ＝ 砲種表 config guns 的鍵）。
//   沒換 ⇒ 一位元都不動（fitApply 不做事）⇒ 戰局跟以前逐位元相同。
//   換了 ⇒ 載入船型的時候（05_hull.js buildHull，拆裝飾之前）把那個掛點的模型換成零件：網格、固定點、外框、meta 的砲種照零件，擺在掛點的座標系上；
//     之後讀 rig.models 的（砲、砲班站位、家具擋格、重量 ⇒ 壓艙物、命中、繩）全部照新的走，不用知道有換裝這回事。
// 零件從哪來（零件表 config parts.guns ＝ { 砲種: { 砲架類別: '<船 id>#<模型 id>' } }，admin.py parts 照 _cache 產生）：
//   這艘船自己就有那一種、同一類的砲 ⇒ 用自己的（長得一樣）；沒有 ⇒ 照零件表載那一艘的船檔、拿那一門（同一艘只載一次）。
//   ⛔ 不把每一種砲的網格另存一份進成品：22 種壓起來 ~120 KB（成品 +6%）；船檔裡本來就有，照引用拿 ⇒ 成品只多零件表那幾行。
// 掛點的座標系（砲）：砲軸 ＝ 固定點 breech → muzzle（水平）；水平的對齊點 ＝ 砲口 muzzle（舷側砲：砲口對著砲門）、迴旋砲／旋轉砲座 ＝ pivot（兩邊都有才用）；
//   高度 ＝ 外框底（砲架放在甲板上）。左右舷的砲是鏡像（eye-aft 在砲軸的哪一邊）⇒ 零件跟掛點不同邊 ⇒ 照砲軸鏡射（三角形繞序跟著翻），不是轉 180°（⛔ 轉 ⇒ 船尾那條滑車繩接到船頭那一邊）。
// 類別：砲架 ＝ meta mount（沒寫 ＝ 舷側砲架 carriage；pivot ＝ 迴旋砲、turret ＝ 旋轉砲座）；只裝得下同一類。弩砲、投石機、弓、希臘火（砲種表 weapon）這一段不換（弦、弓這些繩是那艘船自己的）。
// 放不放得下：零件在砲的座標系裡的長、寬、高 ≤ 掛點的 ×(1 ＋ FIT_TOL) ＋ FIT_PAD 格；掛點 meta fits=<砲種,…> ⇒ 只收那幾種（不看大小）。
//   放不下、類別不合、零件表沒有 ⇒ 不換、照原本雕的那一門，原因記在 T.fit.bad（開戰時廣播、匯入檢查列出來）。
// 繩：兩端寫明 model:<掛點路徑>/<固定點> 的那一端，照同名固定點的位移挪過去（整條照離那一端的長度遞減：那一端移滿、另一端不動）；零件沒有那個固定點 ⇒ 那條繩拿掉（carronade 沒有 train ⇒ 沒有後拉滑車）。
// 換裝表從哪來（fitOf）：出廠 ships[].fit ⊕ 玩家的 SHIP_FIT[船型]（存檔、匯出入跟船員配置一起；69_prefs.js）；
//   艦隊裡寫 `<船型>@<掛點>=<砲種>;<掛點>=<砲種>`（網址 ?blue=constitution@gun-2=carr）⇒ 出廠 ⊕ 這一份（不看玩家存檔）⇒ 同一型兩艘可以換得不一樣：船型照「型＋換裝表」各建一份（HULLT 的鍵 ＝ 那一串）。
var FIT_PARTS = (CFG.parts && CFG.parts.guns) || {};
var FIT_TOL = 0.15, FIT_PAD = 2;                                         // 放得下：長寬高 ≤ 掛點的 ×1.15 ＋ 2 格
var SHIP_FIT = {};                                                       // 玩家的換裝表：船型 ⇒ { 掛點 id: 砲種 }（跟出廠的不一樣的那幾格；值 ＝ 原本雕的那一種 ⇒ 換回原樣）
var FIT_SRC = {};                                                        // 零件來源：'<船 id>#<模型 id>' ⇒ Promise<零件|null>（同一門只載一次）
/** 艦隊裡的一項（船型、或 船型@換裝表）⇒ 船型 id。 */
function hullBase(key) { key = String(key); var i = key.indexOf('@'); return i < 0 ? key : key.slice(0, i); }
/** 'gun-2=carr;gun-3=long32' ⇒ { 'gun-2': 'carr', … }（寫法不對的那一格不收）。
 *  砲種認不認得、能不能換 ⇒ 留給 fitApply 判、照實報（⛔ 在這裡就丟掉 ⇒ 寫錯一個字什麼都看不到）。 */
function fitParse(s) {
  var F = {};
  String(s || '').split(';').forEach(function (w) { var i = w.indexOf('='), k = w.slice(0, i), t = w.slice(i + 1); if (i > 0 && ID_RX.test(k) && /^[a-z][a-z0-9_]*$/.test(t)) F[k] = t; });
  return F;
}
/** 換裝表 ⇒ 一串（照掛點排；空的 ⇒ ''）。 */
function fitSpec(F) { return Object.keys(F || {}).sort().map(function (k) { return k + '=' + F[k]; }).join(';'); }
/** 這一項（船型或 船型@換裝表）實際用的換裝表：出廠 ⊕（玩家存檔｜寫在項目裡的那一份）。 */
function fitOf(key) {
  key = String(key); var id = hullBase(key), at = key.indexOf('@'), H = HULL_KNOWN.filter(function (h) { return h.id === id; })[0];
  return Object.assign({}, (H && H.fit) || {}, at < 0 ? SHIP_FIT[id] || {} : fitParse(key.slice(at + 1)));
}
/** 砲架類別。 */
function fitClass(m) { var v = m.meta && m.meta.mount; return v ? String(v) : 'carriage'; }
/** 一門砲的座標系：對齊點 a（水平）、底 z、砲軸角 th、哪一邊（eye-aft 等在砲軸的左／右：+1／−1，看不出來 ＝ 0）。 */
function fitFrame(m, piv) {
  var P = m.points || {}, mz = P.muzzle, br = P.breech;
  if (!mz || !br) return null;
  var th = Math.atan2(mz[1] - br[1], mz[0] - br[0]), a = piv && P.pivot ? P.pivot : mz, sd = 0;
  ['eye-aft', 'eye-fwd', 'train', 'cascabel'].some(function (k) {
    var q = P[k]; if (!q) return false;
    var c = Math.cos(th) * (q[1] - br[1]) - Math.sin(th) * (q[0] - br[0]);
    if (Math.abs(c) < 0.25) return false;
    sd = (k === 'eye-fwd' ? -1 : 1) * (c > 0 ? 1 : -1); return true;
  });
  return { a: a, z: m.bbox[2], th: th, sd: sd };
}
/** 砲的座標系裡的外框（長 ＝ 沿砲軸、寬、高）。 */
function fitDims(m, mesh, f) {
  var V = mesh.verts, o = m.origin, c = Math.cos(f.th), s = Math.sin(f.th), x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (var i = 0; i < V.length; i += 3) {
    var dx = o[0] + V[i] - f.a[0], dy = o[1] + V[i + 1] - f.a[1], u = dx * c + dy * s, v = -dx * s + dy * c, z = o[2] + V[i + 2];
    if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return [x1 - x0, y1 - y0, z1 - z0];
}
/** 零件（一門砲）⇒ 掛點的座標系：回一支 p ⇒ 新座標。 */
function fitXf(fp, fs, mir) {
  var cp = Math.cos(fp.th), sp = Math.sin(fp.th), cs = Math.cos(fs.th), ss = Math.sin(fs.th);
  return function (p) {
    var dx = p[0] - fp.a[0], dy = p[1] - fp.a[1], u = dx * cp + dy * sp, v = -dx * sp + dy * cp;
    if (mir) v = -v;
    return [fs.a[0] + u * cs - v * ss, fs.a[1] + u * ss + v * cs, fs.z + p[2] - fp.z];
  };
}
/** 這艘自己的那一種、同一類的砲（有 breech、muzzle 的第一門）⇒ 零件；沒有 ⇒ null。 */
function fitOwnPart(h, type, cls) {
  var M = h.rig.meshes, m = (h.rig.models || []).filter(function (q) { return q.meta && q.meta.kind === 'gun' && modelKind(q) === type && fitClass(q) === cls && q.points && q.points.muzzle && q.points.breech; })[0];
  return m ? { m: m, mesh: M[m.mesh], from: '這艘' } : null;
}
/** 零件表那一門（'<船 id>#<模型 id>'）⇒ Promise<零件|null>：載那艘的船檔、拿那一門（網格複製一份；換色的擺放照它的 mats）。 */
function fitLoadPart(ref) {
  if (FIT_SRC[ref]) return FIT_SRC[ref];
  var i = ref.indexOf('#'), sid = ref.slice(0, i), mid = ref.slice(i + 1), H = HULL_KNOWN.filter(function (h) { return h.id === sid; })[0];
  if (!H || !VK.hasEmbedded(H.el)) return (FIT_SRC[ref] = Promise.resolve(null));
  return (FIT_SRC[ref] = VK.loadEmbedded(H.el).then(meshPool).then(function (model) {
    var h = model.header, m = ((h.rig && h.rig.models) || []).filter(function (q) { return q.meta && String(q.meta.id) === mid; })[0];
    if (!m) return null;
    var me = h.rig.meshes[m.mesh];
    return { m: { name: m.name, origin: m.origin, bbox: m.bbox, points: m.points, meta: m.meta }, mesh: { verts: me.verts, tris: me.tris, tmat: me.tmat, mats: m.mats || me.mats }, from: H.name };
  }).catch(function () { return null; }));
}
/** 換裝表裡要從別艘拿的零件先載好（loadHull 在 buildHull 之前呼叫）⇒ Promise<{ '<砲種>|<類別>': 零件 }>。 */
function fitLoad(h, F) {
  var need = {}, models = (h.rig && h.rig.models) || [];
  Object.keys(F).forEach(function (sid) {
    var m = models.filter(function (q) { return q.meta && String(q.meta.id) === sid; })[0], t = F[sid];
    if (!m || modelKind(m) === t) return;
    var cls = fitClass(m), k = t + '|' + cls;
    if (need[k] !== undefined || fitOwnPart(h, t, cls)) return;
    need[k] = (FIT_PARTS[t] || {})[cls] || '';
  });
  var keys = Object.keys(need), out = {};
  return Promise.all(keys.map(function (k) { return need[k] ? fitLoadPart(need[k]) : Promise.resolve(null); })).then(function (L) { keys.forEach(function (k, i) { if (L[i]) out[k] = L[i]; }); return out; });
}
/** 換裝（buildHull 一開頭，modelMats 之後、拆裝飾之前）：h 是這一份船型自己解出來的檔頭（改了不會影響別份）。
 *  回 { spec, done: [{ slot, path, from, to, src }], bad: [{ slot, path, to, why }] }；F 是空的 ⇒ 不做事（一位元都不動）。 */
function fitApply(h, F, ext) {
  var R = { spec: fitSpec(F), done: [], bad: [] };
  var keys = Object.keys(F || {}).sort(); if (!keys.length) return R;
  var rig = h.rig, models = rig.models || [], drop = {};
  keys.forEach(function (sid) {
    var t = F[sid], m = models.filter(function (q) { return q.meta && String(q.meta.id) === sid; })[0];
    function bad(why) { R.bad.push({ slot: sid, path: m ? m.name : '', to: t, why: why }); }
    if (!m) return bad('船上沒有這個掛點');
    if (!(m.meta && m.meta.kind === 'gun')) return bad('不是砲（這一段只換砲）');
    var t0 = modelKind(m); if (t0 === t) return;
    if (!GUNS[t] || GUNS[t].weapon) return bad(GUNS[t] ? '這一段只換火砲（' + GUNS[t].name + '不換）' : '砲種表沒有 ' + t);
    if (GUNS[t0] && GUNS[t0].weapon) return bad('掛點上是' + GUNS[t0].name + '（這一段只換火砲）');
    var cls = fitClass(m), P = fitOwnPart(h, t, cls) || (ext || {})[t + '|' + cls];
    if (!P) return bad('零件表沒有' + fitClsName(cls) + '的' + GUNS[t].name);
    var piv = cls !== 'carriage', fs = fitFrame(m, piv), fp = fitFrame(P.m, piv);
    if (!fs || !fp) return bad((fs ? '零件' : '掛點') + '沒有固定點 breech、muzzle（看不出砲軸）');
    var fits = m.meta.fits ? String(m.meta.fits).split(',').map(function (w) { return w.trim(); }) : null;
    if (fits) { if (fits.indexOf(t) < 0) return bad('掛點 fits=' + m.meta.fits + ' 不收' + GUNS[t].name); }
    else {
      var ds = fitDims(m, rig.meshes[m.mesh], fs), dp = fitDims(P.m, P.mesh, fp), nm = ['長', '寬', '高'];
      for (var j = 0; j < 3; j++) if (dp[j] > ds[j] * (1 + FIT_TOL) + FIT_PAD) return bad('放不下：' + nm[j] + ' ' + dp[j].toFixed(1) + ' 格 > 掛點的 ' + ds[j].toFixed(1) + ' 格（容許 ×' + (1 + FIT_TOL) + ' ＋' + FIT_PAD + '）');
    }
    var mir = fs.sd !== 0 && fp.sd !== 0 && fs.sd !== fp.sd, X = fitXf(fp, fs, mir);
    var V = P.mesh.verts, o = P.m.origin, W = new Array(V.length), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], i, k;
    for (i = 0; i < V.length; i += 3) { var q = X([o[0] + V[i], o[1] + V[i + 1], o[2] + V[i + 2]]); for (k = 0; k < 3; k++) { W[i + k] = q[k]; if (q[k] < lo[k]) lo[k] = q[k]; if (q[k] > hi[k]) hi[k] = q[k]; } }
    var og = [Math.floor(lo[0]), Math.floor(lo[1]), Math.floor(lo[2])];
    for (i = 0; i < W.length; i += 3) for (k = 0; k < 3; k++) W[i + k] -= og[k];
    var Tr = P.mesh.tris; if (mir) { Tr = Tr.slice(); for (i = 0; i < Tr.length; i += 3) { var a = Tr[i + 1]; Tr[i + 1] = Tr[i + 2]; Tr[i + 2] = a; } }   // 鏡射 ⇒ 繞序翻過來
    var pts = {}, old = m.points || {};
    Object.keys(P.m.points || {}).forEach(function (n) { pts[n] = X(P.m.points[n]); });
    // 繩：寫明綁在這個掛點某個固定點的那一端 ⇒ 照同名固定點的位移挪（零件沒有那一點 ⇒ 那條繩不要）
    var pre = 'model:' + m.name + '/';
    (rig.ropes || []).forEach(function (r, ri) {
      (r.ends || []).forEach(function (e, ei) {
        if (typeof e !== 'string' || e.indexOf(pre) !== 0) return;
        var pn = e.slice(pre.length), a0 = old[pn], a1 = pts[pn];
        if (!a0 || !a1) { drop[ri] = 1; return; }
        fitRopeMove(r, ei, [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]]);
        (r.fitEnd = r.fitEnd || [false, false])[ei] = true;                   // 這一端跟著砲：開船時不找格當錨（10_ship.js），照作品寫的綁在砲上（⛔ 找格 ⇒ carronade 的砲尾貼著舷牆，兩端都被當成綁在船殼上）
      });
    });
    (R.was = R.was || {})[m.name] = { kind: t0, bb: m.bbox.slice() };     // 原本雕的那一門（種類、外框）：甲板在哪、站人的高度是船的事，照原本的算（fitKind0／fitBB0）
    var mt = Object.assign({}, m.meta); delete mt.gun; delete mt.weapon; delete mt.ammo;
    ['gun', 'weapon', 'ammo'].forEach(function (k2) { if (P.m.meta && P.m.meta[k2] !== undefined) mt[k2] = P.m.meta[k2]; });
    m.mesh = rig.meshes.length; rig.meshes.push({ verts: W, tris: Tr, tmat: P.mesh.tmat, mats: P.mesh.mats });
    m.origin = og; m.bbox = [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]]; m.points = pts; m.meta = mt; delete m.mats;
    R.done.push({ slot: sid, path: m.name, from: t0, to: t, src: P.from, mirror: mir });
  });
  if (Object.keys(drop).length) { rig.ropes = rig.ropes.filter(function (r, i) { return !drop[i]; }); R.ropesDropped = Object.keys(drop).length; }
  return R;
}
function fitClsName(c) { return c === 'carriage' ? '舷側砲架' : c === 'pivot' ? '迴旋砲架' : c === 'turret' ? '旋轉砲座' : c; }
/** 照砲的種類、外框猜甲板的地方（10_ship.js gunDecks 切層、站人的高度；40_crew.js 砲班站的高度、spar deck 的高度）：換了裝的掛點照原本雕的那一門
 *  （⛔ 照新的 ⇒ 砲甲板上換成一門 carronade，陸戰隊就照它的高度去找 spar deck、站到砲甲板上；高度底是對齊的，差在「carronade 那層甲板離砲架底多遠」這種照種類的猜法）。
 *  m ＝ sh.models 的一件（makeShip 照 T.fit.was 掛 m.was）；沒換 ＝ 自己。 */
function fitKind0(m) { return m.was ? m.was.kind : m.kind; }
function fitBB0(m) { return m.was ? m.was.bb : m.bb; }
/** 繩的一端（ei：0 ＝ 起點、1 ＝ 終點）挪 d：整條照離那一端的長度遞減（那一端移滿、另一端不動）。 */
function fitRopeMove(r, ei, d) {
  var p = r.pts, n = p.length / 3; if (n < 2) return;
  var acc = [0], L = 0, i;
  for (i = 1; i < n; i++) { L += Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2], p[i * 3 + 2] - p[i * 3 - 1]); acc.push(L); }
  var q = p.slice();
  for (i = 0; i < n; i++) { var w = L > 0 ? (ei === 0 ? 1 - acc[i] / L : acc[i] / L) : 1; q[i * 3] += d[0] * w; q[i * 3 + 1] += d[1] * w; q[i * 3 + 2] += d[2] * w; }
  r.pts = q;
}
/** 換裝的廣播（開戰時每一份船型一次；61_hud.js hudCrewShort 旁邊）：沒換成的那幾門。 */
function fitText(T) {
  var B = T.fit && T.fit.bad; if (!B || !B.length) return '';
  return '換裝沒換成（' + T.name + '）：' + B.map(function (b) { return b.slot + '→' + (GUNS[b.to] ? GUNS[b.to].name : b.to) + '（' + b.why + '）'; }).join('、');
}
/** 存檔／匯出：玩家的換裝表（每一型跟出廠不一樣的那幾格）。 */
function fitSnap() { var o = {}; Object.keys(SHIP_FIT).forEach(function (id) { var d = SHIP_FIT[id]; if (d && Object.keys(d).length) o[id] = Object.assign({}, d); }); return o; }
/** 存檔／匯入 ⇒ SHIP_FIT（看得懂的那幾格才收；網址艦隊寫了換裝的那幾艘不看它）。換了 ⇒ fitDirty。 */
function fitApplyPrefs(p) {
  if (!p || typeof p !== 'object') return;
  Object.keys(p).forEach(function (id) {
    var d = p[id]; if (!HULL_KNOWN.some(function (h) { return h.id === id; }) || !d || typeof d !== 'object') return;
    var F = fitParse(Object.keys(d).map(function (k) { return k + '=' + d[k]; }).join(';')), was = fitSpec(fitOf(id));
    if (Object.keys(F).length) SHIP_FIT[id] = F; else delete SHIP_FIT[id];
    if (fitSpec(fitOf(id)) !== was) fitDirty(id);
  });
}
/** 那一型的換裝表換了（匯入、之後的配置頁）：已經載好的那一份船型丟掉、照新的重載（⛔ 不丟 ⇒ 開戰還是舊的砲）；
 *  壓艙物還是那一份的預設（沒自己調過）⇒ 一起清掉，新的船型載好再照它的預設（04_state.js shipCfg）。開頁時讀存檔那一次還沒載任何船 ⇒ 不做事。 */
function fitDirty(id) {
  if (!HULLS[id]) return;
  var T0 = HULLT[id], c = SHIP_CFG[id];
  delete HULLS[id]; delete HULLT[id];
  if (c && T0 && c.ballast === T0.ballast0) delete c.ballast;
  loadHull(id).then(function () { evEmit('hullReload', id); });          // 重載好了 ⇒ 船隻配置頁重畫（71_input.js：卡片的排水量、砲數、船員）
}

// ───────────────────────── 往來船的航跡記錄（除錯 log；Blocksail TASK-0980） ─────────────────────────
// Tim 2026-10-26：「可以加工具紀錄船隻航線(城鎮模式下真實的位移紀錄) 可以用點的方式記錄(觀察點間隔距離)」「點加上線段也可以(線段標記船頭方向)」
//   「可以不用3D繪製 而是輸出debug log後 用俯視圖重組出資訊(因為速度真的很快 3D瞬間就跑出畫面了)」「也可以直接用程式判讀Log 以及直接讀」
// 開關（Tim 2026-10-26「確保Log只有在開啟相關debug參數時才輸出(避免影響效能)」）：預設關 ⇒ trrTick 第一行就回去；設定頁 Debug 模式下面「記錄往來船航跡」勾了（存檔）、或網址 ?trklog=1 才記。
// 物理意義：開著時航海、城鎮模式一直記（只記在記憶體，不畫）：每 TRR_DT 秒（模擬時間 ＝ 真實的秒，跟世界時間的倍率無關）每艘往來船一點 ⇒
//   點的間隔 ＝ 那 TRR_DT 秒走了多遠（等速 ⇒ 等距）；每一格量一次走了多遠，超過 TRR_JUMP 公尺 ⇒ 一筆 jump（瞬移）；誰在開（st）、帆換了 ⇒ 一筆 ev。
//   st：'glide' 照時刻表滑（⑥）／'pilot' 港內照時刻表帶著走（⑧ 航行管制）／'tow' 拖／'spin' 原地轉／'sail' 照帆開（艦長）／'dock' 停港／'held' 繫著等。
// 輸出（設定頁「匯出航跡 log」、__game.trkRec('save')；__game.trkRec('log') 回同一份字串）：
//   traffic_log_YYYYMMDD.ndjson，一行一筆 JSON（人直接讀、程式一行一行 parse；Blocksail tools/traffic_log.cjs 判讀、tools/traffic_log.html 俯視圖重組）：
//   · {k:'head', v, at, mode, dt, jump}
//   · {k:'obs', town, segs: [[ax, az, bx, bz, r, kind]…], polys: [[[x, z]×4, kind]…]}  擋船的棧橋、碼頭（32_quay.js quayObs，存的那一刻）
//   · {k:'ship', t, id, hull, name, out: [[往前 m, 半寬 m]…]}                          船身外框（32_quay.js quayHull：船中心為原點，往船頭為正）
//   · {k:'pt', t, wh, rate, id, x, z, yaw, v, st, pilot, sail}                           t ＝ 模擬秒（SIMT）、wh ＝ 世界時間（開戰以來幾小時）、rate ＝ 世界時間倍率、v ＝ 航速 m/s
//   · {k:'ev', t, wh, id, ev: 'spawn'｜'drop'｜'st'｜'sail'｜'berth', from, to}               berth：'泊位 id@x,z'（'@anchor' ＝ 港外錨地）
//   · {k:'jump', t, wh, id, d, a: [x, z], b: [x, z], st}                                   一格走了 d 公尺（> TRR_JUMP）
//   · {k:'trk', t, id, pilot, trk: [[wh, x, z]…], berth: [x, z, yaw]}                     清單給的時刻表與泊位（生出來、pilot／泊位換了的那一刻）
//   座標都是 3D 世界座標（x 往東、z 往南，公尺）；yaw 同 31_sailing.js（船頭 ＝ [cos yaw, −sin yaw]）。
// ⛔ 只讀：不改船的任何狀態、不抽 rnd()（開關不改戰局）。
var TRR = { on: Q.get('trklog') === '1', t: -1, L: [], meta: {}, last: {}, n: 0 };
var TRR_DT = 0.1, TRR_JUMP = 20, TRR_MAX = 250000;                       // 每幾秒記一點；一格走幾公尺以上算瞬移；記憶體裡最多幾行（滿了丟最舊的一成）
function trrState(sh) {
  var n = sh.npc; if (n.held) return 'held'; if (n.tow) return n.tow.spin ? 'spin' : 'tow'; if (n.dock) return 'dock';
  if (trafficGliding(sh)) return n.pilot && n.pilot !== 'dock' ? 'pilot' : 'glide';
  return 'sail';
}
function trrPush(o) { TRR.L.push(JSON.stringify(o)); if (TRR.L.length > TRR_MAX) TRR.L.splice(0, TRR_MAX / 10 | 0); }
function trrRound(v, k) { var m = Math.pow(10, k); return Math.round(v * m) / m; }
/** 船身外框（往前、半寬，公尺）：碰撞取樣點那一套（32_quay.js quayHull），船中心為原點。 */
function trrOutline(sh) {
  var M = sh.M, T = sh.T, o = M4.pt(M, 0, 0, 0), ex = M4.pt(M, 1, 0, 0), vs = Math.hypot(ex[0] - o[0], ex[1] - o[1], ex[2] - o[2]);
  return quayHull(T, vs).map(function (h) { return [trrRound((h[0] + 0.5 - T.cx) * vs, 2), trrRound(h[1] * vs, 2)]; });
}
function trrTrk(sh) {
  var n = sh.npc, b = n.berth;
  trrPush({ k: 'trk', t: trrRound(SIMT, 2), id: n.id, pilot: n.pilot || null, trk: (n.trk || []).map(function (q) { return [trrRound(q[0], 4), trrRound(q[1], 1), trrRound(q[2], 1)]; }), berth: b ? [trrRound(b.x, 1), trrRound(b.z, 1), trrRound(b.yaw, 3)] : null });
}
/** 每一格（trafficPump 之後；90_main.js）：每一格量走了多遠（瞬移）、狀態有沒有換；到了 TRR_DT 記一點。 */
function trrTick() {
  if (!TRR.on || !trafficOk()) return;
  if (SIMT < TRR.t) { TRR.last = {}; TRR.t = -1; }                       // 換局（模擬時間倒回）
  var due = SIMT - TRR.t >= TRR_DT; if (due) TRR.t = SIMT;
  var wh = trrRound(worldSec() / 3600, 5), t = trrRound(SIMT, 2), rate = wclkRate(), seen = {};
  trafficShips().forEach(function (sh) {
    var n = sh.npc, id = n.id, c = shipCenter(sh), st = trrState(sh), sail = sh.sailSet == null ? null : sh.sailSet, b = n.berth, bk = b ? (b.id ? b.id + '@' : '') + trrRound(b.x, 1) + ',' + trrRound(b.z, 1) : '', P = TRR.last[id];
    seen[id] = 1;
    if (!TRR.meta[id] || TRR.meta[id].sh !== sh) { TRR.meta[id] = { sh: sh }; trrPush({ k: 'ship', t: t, id: id, hull: sh.T.id, name: sh.name || id, out: trrOutline(sh) }); }
    if (!P) { trrPush({ k: 'ev', t: t, wh: wh, id: id, ev: 'spawn', to: st }); trrTrk(sh); P = TRR.last[id] = { x: c[0], z: c[2], st: st, sail: sail, bk: bk, pilot: n.pilot || null }; due = true; }
    var d = Math.hypot(c[0] - P.x, c[2] - P.z);
    if (d > TRR_JUMP) trrPush({ k: 'jump', t: t, wh: wh, id: id, d: Math.round(d), a: [trrRound(P.x, 1), trrRound(P.z, 1)], b: [trrRound(c[0], 1), trrRound(c[2], 1)], st: st });
    if (st !== P.st) trrPush({ k: 'ev', t: t, wh: wh, id: id, ev: 'st', from: P.st, to: st });
    if (sail !== P.sail) trrPush({ k: 'ev', t: t, wh: wh, id: id, ev: 'sail', from: P.sail, to: sail });
    if (bk !== P.bk) trrPush({ k: 'ev', t: t, wh: wh, id: id, ev: 'berth', from: P.bk || null, to: bk || null });
    if (bk !== P.bk || (n.pilot || null) !== P.pilot) trrTrk(sh);
    P.x = c[0]; P.z = c[2]; P.st = st; P.sail = sail; P.bk = bk; P.pilot = n.pilot || null;
    if (due) trrPush({ k: 'pt', t: t, wh: wh, rate: trrRound(rate, 2), id: id, x: trrRound(c[0], 2), z: trrRound(c[2], 2), yaw: trrRound(sh.yaw, 4), v: trrRound(sh.spd, 2), st: st, pilot: n.pilot || null, sail: sail });
  });
  Object.keys(TRR.last).forEach(function (id) { if (!seen[id]) { trrPush({ k: 'ev', t: t, wh: wh, id: id, ev: 'drop', from: TRR.last[id].st }); delete TRR.last[id]; delete TRR.meta[id]; } });
}
/** 整份 log（字串）：head、每座城擋船的東西（存的那一刻）、記下來的每一行。 */
function trrLog() {
  var H = [JSON.stringify({ k: 'head', v: 1, at: new Date().toISOString(), mode: MODE, dt: TRR_DT, jump: TRR_JUMP, lines: TRR.L.length })];
  if (BED && typeof quayObs === 'function') TOWNS.list.forEach(function (Tw) {
    if (!Tw.p || !Tw.E) return; var O = quayObs(Tw);
    H.push(JSON.stringify({ k: 'obs', town: Tw.id, segs: O.segs.map(function (s) { return [trrRound(s.a[0], 1), trrRound(s.a[1], 1), trrRound(s.b[0], 1), trrRound(s.b[1], 1), trrRound(s.r, 2), s.kind]; }),
      polys: O.polys.map(function (p) { return [p.P.map(function (q) { return [trrRound(q[0], 1), trrRound(q[1], 1)]; }), p.kind]; }) }));
  });
  return H.concat(TRR.L).join('\n') + '\n';
}
/** 存成 traffic_log_YYYYMMDD_HHMM.ndjson（瀏覽器下載）；回檔名。 */
function trrSave() {
  var d = new Date(), p2 = function (v) { return ('0' + v).slice(-2); }, a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([trrLog()], { type: 'application/x-ndjson' }));
  a.download = 'traffic_log_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes()) + '.ndjson';
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return a.download;
}
/** 讀數（__game.trkRec）：沒給 ⇒ { on, lines, ships }；'log' ⇒ 整份字串；'save' ⇒ 下載、回檔名；'clear' 清掉；'on'／'off' 記不記。 */
function trrInfo(op) {
  if (op === 'log') return trrLog(); if (op === 'save') return trrSave();
  if (op === 'clear') { TRR.L = []; TRR.last = {}; TRR.meta = {}; } else if (op === 'on' || op === 'off') TRR.on = op === 'on';
  return { on: TRR.on, lines: TRR.L.length, ships: Object.keys(TRR.last) };
}

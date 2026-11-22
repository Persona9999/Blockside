// ───────────────────────── 船廠造船建造演出（TASK-1350；只給人看）─────────────────────────
// 參考建築建造演出（63_townrise.js），依自動算法把任意船型的建造切成：
//   hull 段（0..cutP）：① 龍骨與首尾柱 → ② 橫向肋骨骨架 → ③ 下部船殼包板 → ④ 上部舷牆／甲板
//   rig 段 （cutP..1）：⑤ 逐節立桅與斜桅 → ⑥ 船體非武器配件＋帆桁（嚴格排除所有火砲／彈藥）→ ⑦ 靜索與動索 → ⑧ 掛帆與旗幟
// 城鎮模式：由 Blocksail 地球儀 'sites' 的 yards（{ yard-N: { ty, hull, hullId, p, cutP, phase, day } }）驅動，
//   隱藏原船廠內烘焙的靜態船殼骨架，在原滑台坡度上擺上真船（龍骨坐於墩木、船頭朝陸側）；閒置／完工／state=build 不顯示。
// 獨立預覽：?shiprise=1（切開 #cover 的動作放在 90_main.js boot，本檔不觸及外殼 DOM，保 admin.py layers --shell）。
var SHIPRISE_UI = Q.get('shiprise') === '1';
var SR_PAD = 10, SR_ZPAD = 6, SR_TOP = 8, SR_BLOCK_VOX = 3;             // 留白（容納墩木、鷹架、料堆）
var SR_HOLD = 1.8, SR_DUR = 20;                                        // 演完停頓幾秒；預設總時長（秒）
var SR_DEF_CUT = 0.72;                                                 // 預設 hull／rig 切分點（帳上沒給 cutP 時用）

// 4 座船廠模型的滑台放置規格（mirrored X 座標；陸上與水上皆以 y=0 為陸側、y→sy 為水域／出口，靜態裝飾船殼已拆為 kind=yard-hull 子模型由匯入時分離）
var SR_YARDS = {
  'common-shipyard-small':       { cx: 120, yMid: 205, ky0: 124, ky1: 284, zKeel0: 14, zKeel1: 4 },
  'common-shipyard-large':       { cx: 500, yMid: 340, ky0: 190, ky1: 490, zKeel0: 20, zKeel1: 3 },
  'common-shipyard-small-water': { cx: 200, yMid: 120, ky0: 40,  ky1: 200, zKeel0: 47, zKeel1: 20 },
  'common-shipyard-large-water': { cx: 400, yMid: 220, ky0: 90,  ky1: 350, zKeel0: 44, zKeel1: 17 }
};

var SHIP_RISE = {
  S: {}, cradle: null,
  demo: null, panel: null, err: null,
  _sailDummy: null
};

function shipRiseKey(T, lot) { return (T ? T.id : '_') + '/' + lot; }
function shipRiseAny() { for (var k in SHIP_RISE.S) return true; return false; }

// ───────────────────────── 自動船體／桅帆建構分析 ─────────────────────────
function shipRiseIsWeaponModel(m) {
  var mt = m.meta || {}, kd = mt.kind || '', nm = (m.name || '').toLowerCase();
  if (typeof GUNS !== 'undefined' && (GUNS[kd] || (typeof modelKind === 'function' && GUNS[modelKind(m)]))) return true;
  if (kd === 'gun' || kd === 'powder' || kd === 'gunmount' || kd === 'turret' || kd === 'armor' || kd === 'hoist') return true;
  if (kd !== 'yard' && /(^|\/)(gun|cannon|carronade|mortar|swivel|chase|turret|powder|ammo|hoist|砲|炮|彈藥|砲塔)/.test(nm)) return true;
  return false;
}

function shipRiseModelBox(T, m) {
  if (m.bbox && m.bbox.length >= 6) return m.bbox;
  var me = T.meshes && T.meshes[m.mesh];
  if (me && me.bb) {
    var dt = me.dt || [0, 0, 0];
    return [me.bb[0] + dt[0], me.bb[1] + dt[1], me.bb[2] + dt[2], me.bb[3] + dt[0], me.bb[4] + dt[1], me.bb[5] + dt[2]];
  }
  var o = m.origin || [T.cx, T.cy, T.zw];
  return [o[0] - 1, o[1] - 1, o[2] - 1, o[0] + 1, o[1] + 1, o[2] + 1];
}

function shipRiseMastSet(T, X, Y, Z, total, bounds) {
  var mastSet = new Set(), parts = (T.h && T.h.parts) || [], mastPaths = [];
  for (var i = 0; i < parts.length; i++) {
    var pt = parts[i], mt = pt.meta || {};
    if (mt.kind === 'mast' || mt.kind === 'bowsprit' || /bowsprit|jibboom|spanker|斜桅/i.test(pt.path || '')) mastPaths.push(pt.path);
  }
  if (mastPaths.length) {
    for (i = 0; i < parts.length; i++) {
      pt = parts[i];
      var pmt = pt.meta || {};
      if (pmt.kind === 'yard' || pmt.kind === 'sail') continue;
      if (!pt.cellRuns || !pt.cellRuns.length) continue;
      var match = false;
      for (var p = 0; p < mastPaths.length; p++) {
        if (pt.path === mastPaths[p] || pt.path.indexOf(mastPaths[p] + '/') === 0) { match = true; break; }
      }
      if (!match) continue;
      var cells = drvCells(T, pt.cellRuns);
      for (var c = 0; c + 2 < cells.length; c += 3) mastSet.add(VK.pack(cells[c], cells[c + 1], cells[c + 2]));
    }
  }
  // 幾何補強：從「非已標記桅」的體素分層直方圖找出主船體頂部（bodyTopZ）與主船體前後端（bodyX0..X1），
  // 把高出甲板、不在主船殼寬度內的細長首斜桅／尾斜桁／中線桅桿端（不含黃銅色／非結構例外）一併歸入桅索階段（不拉長船殼／鷹架框）。
  var szZ = bounds.maxZ + 1, sxX = bounds.maxX + 1;
  var cntZ = new Int32Array(szZ), loYX = new Int32Array(sxX).fill(1e9), hiYX = new Int32Array(sxX).fill(-1);
  var peakZ = 0, q;
  for (q = 0; q < total; q++) {
    if (mastSet.has(VK.pack(X[q], Y[q], Z[q]))) continue;
    cntZ[Z[q]]++;
    if (cntZ[Z[q]] > peakZ) peakZ = cntZ[Z[q]];
  }
  var bodyTopZ = bounds.maxZ, minLayerN = Math.max(8, Math.round(peakZ * 0.08));
  for (var z = bounds.maxZ; z >= bounds.minZ; z--) {
    if (cntZ[z] >= minLayerN) { bodyTopZ = z; break; }
  }
  for (q = 0; q < total; q++) {
    if (mastSet.has(VK.pack(X[q], Y[q], Z[q])) || Z[q] > bodyTopZ) continue;
    if (Y[q] < loYX[X[q]]) loYX[X[q]] = Y[q];
    if (Y[q] > hiYX[X[q]]) hiYX[X[q]] = Y[q];
  }
  var maxBeam = 1;
  for (var x = bounds.minX; x <= bounds.maxX; x++) {
    if (hiYX[x] >= loYX[x]) { var b = hiYX[x] - loYX[x] + 1; if (b > maxBeam) maxBeam = b; }
  }
  var beamCut = Math.max(6, Math.round(maxBeam * 0.16));
  var bodyX0 = bounds.minX, bodyX1 = bounds.maxX;
  while (bodyX0 < bounds.maxX && (hiYX[bodyX0] - loYX[bodyX0] + 1) < beamCut) bodyX0++;
  while (bodyX1 > bodyX0 && (hiYX[bodyX1] - loYX[bodyX1] + 1) < beamCut) bodyX1--;
  var beamTol = Math.max(3, Math.round(maxBeam * 0.10));
  var sparZFloor = Math.max(T.zw || bounds.minZ, bounds.minZ + Math.round((bodyTopZ - bounds.minZ) * 0.60));
  for (q = 0; q < total; q++) {
    var kq = VK.pack(X[q], Y[q], Z[q]);
    if (mastSet.has(kq)) continue;
    var narrowMid = Math.abs(Y[q] - T.cy) <= beamTol;
    if (Z[q] > bodyTopZ + 1 && narrowMid) mastSet.add(kq);
    else if (Z[q] >= sparZFloor && narrowMid && (X[q] > bodyX1 + 2 || X[q] < bodyX0 - 2)) mastSet.add(kq);
  }
  return { set: mastSet, bodyX0: bodyX0, bodyX1: bodyX1, bodyTopZ: bodyTopZ };
}

/** 建置稀疏區塊索引表（與 G.tab 結構一致；只在有體素的 16³ 區塊配置 Int32Array(4096)）。 */
function shipRiseBuildLookup(G, X, Y, Z, subIdx) {
  var nx = G.nx, nxy = nx * G.ny, tab = new Array(G.tab.length);
  for (var i = 0; i < subIdx.length; i++) {
    var q = subIdx[i], vx = X[q], vy = Y[q], vz = Z[q];
    var ci = (vx >> 4) + (vy >> 4) * nx + (vz >> 4) * nxy;
    var blk = tab[ci];
    if (!blk) { blk = new Int32Array(4096).fill(-1); tab[ci] = blk; }
    blk[(vx & 15) | ((vy & 15) << 4) | ((vz & 15) << 8)] = i;
  }
  return tab;
}

/** 26 連通 Minimax 連通傳播（FIFO Dial 桶掃描 + 孤島半徑 2..6 橋接），確保任意建造前綴均不浮空。 */
function shipRiseConnect(G, X, Y, Z, subIdx, b0, seeds, fallbackMode) {
  var N = subIdx.length;
  if (!N) return { ord: new Int32Array(0), thr: new Float32Array(0), tab: new Array(G.tab.length) };
  var tab = shipRiseBuildLookup(G, X, Y, Z, subIdx);
  var nx = G.nx, nxy = nx * G.ny, sx = G.sx, sy = G.sy, sz = G.sz;
  var dist = new Uint8Array(N).fill(255);
  var head = new Int32Array(256).fill(-1), tail = new Int32Array(256).fill(-1), nxt = new Int32Array(N).fill(-1);
  var popSeq = [], popPos = new Int32Array(N);

  function enqueue(u, b) {
    dist[u] = b; nxt[u] = -1;
    if (tail[b] >= 0) nxt[tail[b]] = u; else head[b] = u;
    tail[b] = u;
  }
  function dialSweep(startB) {
    for (var b = startB; b <= 254; b++) {
      var cur;
      while ((cur = head[b]) >= 0) {
        head[b] = nxt[cur];
        if (head[b] < 0) tail[b] = -1;
        popPos[cur] = popSeq.length;
        popSeq.push(cur);
        var q = subIdx[cur], cx = X[q], cy = Y[q], cz = Z[q];
        var x0 = cx > 0 ? cx - 1 : 0, x1 = cx + 1 < sx ? cx + 1 : sx - 1;
        var y0 = cy > 0 ? cy - 1 : 0, y1 = cy + 1 < sy ? cy + 1 : sy - 1;
        var z0 = cz > 0 ? cz - 1 : 0, z1 = cz + 1 < sz ? cz + 1 : sz - 1;
        for (var zz = z0; zz <= z1; zz++) {
          var kz = (zz >> 4) * nxy, lz = (zz & 15) << 8;
          for (var yy = y0; yy <= y1; yy++) {
            var cyz = (yy >> 4) * nx + kz, lyz = ((yy & 15) << 4) | lz;
            for (var xx = x0; xx <= x1; xx++) {
              var blk = tab[(xx >> 4) + cyz]; if (!blk) continue;
              var v = blk[lyz | (xx & 15)];
              if (v < 0 || dist[v] !== 255) continue;
              enqueue(v, b0[v] > b ? b0[v] : b);
            }
          }
        }
      }
    }
  }

  var minSeedB = 254;
  for (var si = 0; si < seeds.length; si++) {
    var su = seeds[si];
    if (dist[su] !== 255) continue;
    var sb = clamp(b0[su], 1, 250);
    if (sb < minSeedB) minSeedB = sb;
    enqueue(su, sb);
  }
  if (seeds.length) dialSweep(minSeedB);

  // 真實 .vxk 模型裡的非 26 連通孤島（如舵葉間隙）：優先在切比雪夫半徑 r=2..6 橋接緊鄰已定型體素；更遠者以最低 z 格收尾
  if (popSeq.length < N) {
    var unvis = [];
    for (var u = 0; u < N; u++) if (dist[u] === 255) unvis.push(u);
    while (unvis.length) {
      var bridged = false;
      for (var r = 2; r <= 6 && !bridged; r++) {
        var cands = [];
        for (var ui = 0; ui < unvis.length; ui++) {
          u = unvis[ui];
          var qu = subIdx[u], ux = X[qu], uy = Y[qu], uz = Z[qu];
          var bx0 = Math.max(0, ux - r), bx1 = Math.min(sx - 1, ux + r);
          var by0 = Math.max(0, uy - r), by1 = Math.min(sy - 1, uy + r);
          var bz0 = Math.max(0, uz - r), bz1 = Math.min(sz - 1, uz + r);
          var bestD = 255;
          for (var zz = bz0; zz <= bz1; zz++) {
            var kz = (zz >> 4) * nxy, lz = (zz & 15) << 8, az = Math.abs(zz - uz);
            for (var yy = by0; yy <= by1; yy++) {
              var cyz = (yy >> 4) * nx + kz, lyz = ((yy & 15) << 4) | lz, ay = Math.abs(yy - uy);
              for (var xx = bx0; xx <= bx1; xx++) {
                if (az < r && ay < r && Math.abs(xx - ux) < r) continue;
                var blk = tab[(xx >> 4) + cyz]; if (!blk) continue;
                var w = blk[lyz | (xx & 15)];
                if (w >= 0 && dist[w] < bestD) bestD = dist[w];
              }
            }
          }
          if (bestD < 255) cands.push([u, bestD]);
        }
        if (cands.length) {
          var minB = 254;
          for (var ci = 0; ci < cands.length; ci++) {
            var cu = cands[ci][0], cb = clamp(Math.max(cands[ci][1] + 1, b0[cu]), 1, 254);
            if (dist[cu] === 255) { enqueue(cu, cb); if (cb < minB) minB = cb; }
          }
          dialSweep(minB);
          bridged = true;
        }
      }
      if (!bridged) {
        var bestU = unvis[0], bestZ = Z[subIdx[bestU]];
        for (ui = 1; ui < unvis.length; ui++) {
          var uz2 = Z[subIdx[unvis[ui]]];
          if (uz2 < bestZ) { bestZ = uz2; bestU = unvis[ui]; }
        }
        var fbB = fallbackMode === 'mast' ? clamp(Math.max(b0[bestU], 120), 1, 254) : 248;
        enqueue(bestU, fbB);
        dialSweep(fbB);
      }
      var nextUnvis = [];
      for (ui = 0; ui < unvis.length; ui++) if (dist[unvis[ui]] === 255) nextUnvis.push(unvis[ui]);
      unvis = nextUnvis;
    }
  }

  // 依 (dist, popPos) 重排，確保桶號與建造成分父子順序同步單調遞增
  var bCnt = new Int32Array(256), bSeen = new Int32Array(256);
  for (var k = 0; k < N; k++) bCnt[dist[k]]++;
  var order = new Int32Array(N);
  for (k = 0; k < N; k++) order[k] = k;
  order.sort(function (a, b) { return dist[a] !== dist[b] ? dist[a] - dist[b] : popPos[a] - popPos[b]; });
  var ord = new Int32Array(N), thr = new Float32Array(N);
  for (k = 0; k < N; k++) {
    u = order[k];
    var b = dist[u], rank = bSeen[b]++;
    ord[k] = subIdx[u];
    thr[k] = clamp((b + rank / Math.max(1, bCnt[b])) / 254, 0.001, 1.0);
  }
  return { ord: ord, thr: thr, tab: tab };
}

/** 依任意船型 T 自動計算建造順序與索具階段資料（結果快取在 T._shipRiseD；預留 T.h.meta.build_order 覆寫 hook）。 */
function shipRiseAnalyze(T) {
  if (!T || !T.hullG) return null;
  if (T._shipRiseD) return T._shipRiseD;
  var G = T.hullG, total = G.count;
  var X = new Uint16Array(total), Y = new Uint16Array(total), Z = new Uint16Array(total), C = new Uint8Array(total);
  var j = 0, NXY = G.nx * G.ny;
  var minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, minZ = 1e9, maxZ = -1;
  for (var ci = 0; ci < G.tab.length; ci++) {
    var blk = G.tab[ci]; if (!blk) continue;
    var kz = (ci / NXY) | 0, ky = ((ci - kz * NXY) / G.nx) | 0, kx = ci - kz * NXY - ky * G.nx;
    var bx = kx * 16, by = ky * 16, bz = kz * 16;
    for (var li = 0; li < 4096; li++) {
      var v = blk[li]; if (!v) continue;
      var vx = bx + (li & 15), vy = by + ((li >> 4) & 15), vz = bz + (li >> 8);
      X[j] = vx; Y[j] = vy; Z[j] = vz; C[j] = v; j++;
      if (vx < minX) minX = vx; if (vx > maxX) maxX = vx;
      if (vy < minY) minY = vy; if (vy > maxY) maxY = vy;
      if (vz < minZ) minZ = vz; if (vz > maxZ) maxZ = vz;
    }
  }
  total = j;
  var bounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY, minZ: minZ, maxZ: maxZ };
  var msInfo = shipRiseMastSet(T, X, Y, Z, total, bounds);
  var mastSet = msInfo.set;
  var ov = T.h && T.h.meta && T.h.meta.build_order;

  var hIdx = [], mIdx = [];
  var hMinX = 1e9, hMaxX = -1, hMinY = 1e9, hMaxY = -1, hMinZ = 1e9, hMaxZ = -1;
  for (var q = 0; q < total; q++) {
    if (mastSet.has(VK.pack(X[q], Y[q], Z[q]))) {
      mIdx.push(q);
    } else {
      hIdx.push(q);
      if (X[q] < hMinX) hMinX = X[q]; if (X[q] > hMaxX) hMaxX = X[q];
      if (Y[q] < hMinY) hMinY = Y[q]; if (Y[q] > hMaxY) hMaxY = Y[q];
      if (Z[q] < hMinZ) hMinZ = Z[q]; if (Z[q] > hMaxZ) hMaxZ = Z[q];
    }
  }
  if (!hIdx.length) { hMinX = minX; hMaxX = maxX; hMinY = minY; hMaxY = maxY; hMinZ = minZ; hMaxZ = maxZ; }

  var hullLen = Math.max(1, hMaxX - hMinX + 1), hullBeam = Math.max(1, hMaxY - hMinY + 1), hullH = Math.max(1, hMaxZ - hMinZ + 1);
  var cxMid = (hMinX + hMaxX) / 2, cyMid = T.cy;
  var keelTopZ = hMinZ + Math.min(3, Math.max(1, Math.round(hullH * 0.08)));
  var ribPeriod = clamp(Math.round(hullLen / 11), 8, 22), ribThick = 2;

  // 分組目標分數：① 龍骨與沿曲線骨幹(0..0.12) ② 橫向U型肋骨骨架(0.14..0.38) ③ 下→上船殼包板與甲板舷牆(0.42..1.00)
  // 接著經由 26 連通 Minimax 傳播保證：沒有支撐的前懸艏柱、艉部與肋骨頂部絕不早於下伏結構浮空出現
  var colBot = new Int32Array(hullLen).fill(1e9);
  for (var hi = 0; hi < hIdx.length; hi++) {
    q = hIdx[hi];
    var bx = X[q] - hMinX;
    if (Z[q] < colBot[bx]) colBot[bx] = Z[q];
  }
  var hScore = new Float32Array(hIdx.length), plankList = [];
  var rootHi = 0, rootBestZ = 1e9, rootBestDy = 1e9, rootBestDx = 1e9;
  for (hi = 0; hi < hIdx.length; hi++) {
    q = hIdx[hi];
    var vx = X[q], vy = Y[q], vz = Z[q];
    var dyM = Math.abs(vy - cyMid), dxM = Math.abs(vx - cxMid);
    if (vz < rootBestZ || (vz === rootBestZ && (dyM < rootBestDy || (dyM === rootBestDy && dxM < rootBestDx)))) {
      rootHi = hi; rootBestZ = vz; rootBestDy = dyM; rootBestDx = dxM;
    }
    if (ov && typeof ov.scoreHull === 'function') { hScore[hi] = clamp(ov.scoreHull(vx, vy, vz, bounds), 0, 1); continue; }
    var dCenterX = dxM / (hullLen * 0.5 + 1);
    var zFrac = (vz - hMinZ) / hullH;
    var isKeel = dyM <= 2 && vz <= Math.max(keelTopZ, colBot[vx - hMinX] + 2);
    var isSpine = dyM <= 1 && vz <= hMaxZ - Math.max(2, Math.round(hullH * 0.10)) && (vx <= hMinX + 3 || vx >= hMaxX - 3);
    var isRib = ((vx - hMinX) % ribPeriod) < ribThick && !(vx >= hMaxX - 4 && zFrac > 0.65);
    if (isKeel || isSpine) {
      hScore[hi] = isKeel ? 0.01 + 0.08 * dCenterX + 0.02 * clamp((vz - hMinZ) / hullH, 0, 1)
        : 0.14 + 0.16 * clamp(zFrac, 0, 1);
    } else if (isRib) {
      hScore[hi] = 0.14 + 0.24 * clamp(zFrac, 0, 1) + 0.01 * dCenterX;
    } else {
      plankList.push({ hi: hi, key: (vz - hMinZ) + 0.05 * (1 - dCenterX) + 0.01 * (dyM / (hullBeam * 0.5 + 1)) });
    }
  }
  if (plankList.length) {
    plankList.sort(function (a, b) { return a.key - b.key; });
    var pn = Math.max(1, plankList.length - 1);
    for (var pi = 0; pi < plankList.length; pi++) hScore[plankList[pi].hi] = 0.42 + 0.57 * (pi / pn);
  }
  var hB0 = new Uint8Array(hIdx.length);
  for (hi = 0; hi < hIdx.length; hi++) hB0[hi] = clamp(Math.round(hScore[hi] * 250), 1, 250);
  var hConn = shipRiseConnect(G, X, Y, Z, hIdx, hB0, hIdx.length ? [rootHi] : [], 'hull');
  var hOrd = hConn.ord, hThr = hConn.thr, hullTab = hConn.tab;

  // 桅與斜桅：僅以與船體緊鄰處（26 鄰居、退路半徑 2）為種子，經 26 連通由下往上／由內往外生長（0.01..0.34）
  var mMinZ = 1e9, mMaxZ = -1;
  for (var mi = 0; mi < mIdx.length; mi++) { q = mIdx[mi]; if (Z[q] < mMinZ) mMinZ = Z[q]; if (Z[q] > mMaxZ) mMaxZ = Z[q]; }
  var mSpanZ = Math.max(1, mMaxZ - mMinZ);
  var mB0 = new Uint8Array(mIdx.length), mSeeds = [], mNear2 = [];
  var gnx = G.nx, gnxy = gnx * G.ny, gsx = G.sx, gsy = G.sy, gsz = G.sz;
  function nearHull(cx, cy, cz, rad) {
    var x0 = Math.max(0, cx - rad), x1 = Math.min(gsx - 1, cx + rad);
    var y0 = Math.max(0, cy - rad), y1 = Math.min(gsy - 1, cy + rad);
    var z0 = Math.max(0, cz - rad), z1 = Math.min(gsz - 1, cz + rad);
    for (var zz = z0; zz <= z1; zz++) {
      var kz = (zz >> 4) * gnxy, lz = (zz & 15) << 8;
      for (var yy = y0; yy <= y1; yy++) {
        var cyz = (yy >> 4) * gnx + kz, lyz = ((yy & 15) << 4) | lz;
        for (var xx = x0; xx <= x1; xx++) {
          var blk = hullTab[(xx >> 4) + cyz];
          if (blk && blk[lyz | (xx & 15)] >= 0) return true;
        }
      }
    }
    return false;
  }
  for (mi = 0; mi < mIdx.length; mi++) {
    q = mIdx[mi];
    var tipExt = X[q] > hMaxX ? (X[q] - hMaxX) / Math.max(1, maxX - hMaxX + 1) : 0;
    var zN = (Z[q] - mMinZ) / mSpanZ;
    var ms = clamp(0.02 + 0.96 * (tipExt > 0 ? Math.max(0.25, zN * 0.5 + tipExt * 0.5) : zN), 0.01, 1.0);
    mB0[mi] = clamp(Math.round(ms * 250), 1, 250);
    if (nearHull(X[q], Y[q], Z[q], 1)) mSeeds.push(mi);
    else if (nearHull(X[q], Y[q], Z[q], 2)) mNear2.push(mi);
  }
  var mConn = shipRiseConnect(G, X, Y, Z, mIdx, mB0, mSeeds.length && mNear2.length ? mSeeds.concat(mNear2) : (mSeeds.length ? mSeeds : mNear2), 'mast');
  var mOrd = mConn.ord, mThr = new Float32Array(mIdx.length);
  for (mi = 0; mi < mIdx.length; mi++) mThr[mi] = clamp(0.01 + 0.33 * mConn.thr[mi], 0.01, 0.34);

  // 非武器模型／裝飾：船體舾裝於船殼完後登場（0.04..0.24）；帆桁嚴格於所有桅桿完成（0.34）之後再掛（0.35..0.58）
  var rigModels = [], fixtures = [], yards = [];
  ((T.rig && T.rig.models) || []).forEach(function (m) {
    if (shipRiseIsWeaponModel(m)) return;
    var mt = m.meta || {}, b = shipRiseModelBox(T, m), zc = (b[2] + b[5]) * 0.5;
    var meshIdx = m.rmesh !== undefined ? m.rmesh : m.mesh;
    var mm = typeof modelMat === 'function' ? modelMat(mt) : null;
    if (mt.kind === 'yard') yards.push({ mesh: meshIdx, mm: mm, z: zc, mt: mt });
    else fixtures.push({ mesh: meshIdx, mm: mm, z: zc, mt: mt });
  });
  (T.decos || []).forEach(function (d) {
    if (shipRiseIsWeaponModel(d)) return;
    var mt = d.meta || {}, b = shipRiseModelBox(T, d), zc = (b[2] + b[5]) * 0.5;
    var mm = typeof modelMat === 'function' ? modelMat(mt) : null;
    fixtures.push({ mesh: d.mesh, mm: mm, z: zc, mt: mt });
  });
  fixtures.sort(function (a, b) { return a.z - b.z; });
  yards.sort(function (a, b) { return a.z - b.z; });
  fixtures.forEach(function (it, k) {
    it.thr = fixtures.length > 1 ? 0.04 + 0.20 * k / (fixtures.length - 1) : 0.12;
    rigModels.push(it);
  });
  yards.forEach(function (it, k) {
    it.thr = yards.length > 1 ? 0.35 + 0.23 * k / (yards.length - 1) : 0.40;
    rigModels.push(it);
  });
  rigModels.sort(function (a, b) { return a.thr - b.thr; });

  // 繩索（靜索 0.48..0.66，動索 0.62..0.78）：排除 anchor_cable，預編進靜態 VBO（LINES prefix ＋ 繩梯 tube TRIANGLES）
  var lineSegs = [], tubeEntries = [];
  var CR = typeof climbRopes === 'function' ? climbRopes(T) : null;
  var standingRe = /stay|shroud|backstay|forestay|ratline|bobstay|支索|圍桅/i;
  ((T.rig && T.rig.ropes) || []).forEach(function (r, idx) {
    var mt = r.meta || {}, pts = r.pts || r.verts; if (!pts || pts.length < 6) return;
    if (mt.kind === 'anchor_cable' || mt.kind === 'chain') return;
    var col = r.col || r.color || [0.50, 0.41, 0.29], avgZ = 0, np = pts.length / 3;
    for (var k = 0; k < np; k++) avgZ += pts[k * 3 + 2];
    avgZ /= np;
    var isStand = standingRe.test(r.name || '') || mt.kind === 'shroud' || mt.kind === 'stay';
    var zN = clamp((avgZ - hMinZ) / Math.max(1, maxZ - hMinZ), 0, 1);
    var thr = isStand ? 0.48 + 0.18 * zN : 0.62 + 0.16 * zN;
    if (CR && CR[idx]) tubeEntries.push({ pts: pts, col: col, w: Math.max(ROPE_TUBE_MIN || 0.06, r.radius || 0), thr: thr });
    else lineSegs.push({ pts: pts, col: col, thr: thr });
  });
  lineSegs.sort(function (a, b) { return a.thr - b.thr; });
  tubeEntries.sort(function (a, b) { return a.thr - b.thr; });

  // 帆與旗幟（依高度由下往上 0.68..0.94，旗幟收尾 0.92..1.00）
  var sails = [];
  (T.cloth || []).forEach(function (C, si) {
    if (!C || !C.n || !C.tris || !C.tris.length) return;
    var p0 = C.p0, sumZ = 0;
    for (var k = 0; k < C.n; k++) sumZ += p0[k * 3 + 2];
    var avgZ = sumZ / C.n;
    var srcMeta = (T.rig && T.rig.sails && T.rig.sails[si] && T.rig.sails[si].meta) || {};
    var isFlag = srcMeta.kind === 'flag' || /flag|ensign|pennant|jack/i.test(C.name || '');
    sails.push({ C: C, avgZ: avgZ, isFlag: isFlag });
  });
  sails.sort(function (a, b) { return (a.isFlag !== b.isFlag) ? (a.isFlag ? 1 : -1) : (a.avgZ - b.avgZ); });
  var nSailCloth = 0, nFlagCloth = 0;
  sails.forEach(function (s) { if (s.isFlag) nFlagCloth++; else nSailCloth++; });
  var siC = 0, fiC = 0;
  sails.forEach(function (s) {
    if (s.isFlag) { s.thr = nFlagCloth > 1 ? 0.92 + 0.07 * (fiC++) / (nFlagCloth - 1) : 0.95; }
    else { s.thr = nSailCloth > 1 ? 0.68 + 0.26 * (siC++) / (nSailCloth - 1) : 0.72; }
  });

  // 建置靜態繩與帆的 GPU 緩衝（同型船共用）
  var ropeLineGpu = shipRiseBuildLineGpu(lineSegs);
  var ropeTubeGpu = shipRiseBuildTubeGpu(tubeEntries);
  var sailGpu = shipRiseBuildSailGpu(T, sails);

  return (T._shipRiseD = {
    X: X, Y: Y, Z: Z, C: C, total: total,
    minX: hMinX, maxX: hMaxX, minY: hMinY, maxY: hMaxY, minZ: hMinZ, maxZ: hMaxZ,
    hullMidX: cxMid, hullLen: hullLen, hullBeam: hullBeam,
    allMinZ: minZ, allMaxZ: maxZ,
    hOrd: hOrd, hThr: hThr, mOrd: mOrd, mThr: mThr,
    rigModels: rigModels, lineGpu: ropeLineGpu, tubeGpu: ropeTubeGpu, sailGpu: sailGpu,
    sailsCount: sails.length, ropesCount: lineSegs.length + tubeEntries.length
  });
}

function shipRiseBuildLineGpu(lineSegs) {
  if (!lineSegs.length) return null;
  var verts = [], steps = [];
  for (var i = 0; i < lineSegs.length; i++) {
    var r = lineSegs[i], p = r.pts, c = r.col;
    for (var j = 0; j + 5 < p.length; j += 3) {
      verts.push(p[j], p[j + 1], p[j + 2], c[0], c[1], c[2], p[j + 3], p[j + 4], p[j + 5], c[0], c[1], c[2]);
    }
    steps.push({ thr: r.thr, count: verts.length / 6 });
  }
  if (!verts.length) return null;
  var data = new Float32Array(verts);
  var vao = gl.createVertexArray(), vbo = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 24, 12);
  gl.bindVertexArray(null);
  return { vao: vao, vbo: vbo, steps: steps, total: data.length / 6 };
}

function shipRiseBuildTubeGpu(tubeEntries) {
  if (!tubeEntries.length || typeof ropeTube !== 'function') return null;
  var TB = [], steps = [];
  for (var i = 0; i < tubeEntries.length; i++) {
    var r = tubeEntries[i];
    ropeTube(TB, r.pts, r.col, r.w);
    steps.push({ thr: r.thr, count: TB.length / 9 });
  }
  if (!TB.length) return null;
  var data = new Float32Array(TB);
  var up = upload(null, data, 9, MESH_ATTR);
  return { vao: up.vao, vbo: up.vbo, steps: steps, total: up.n };
}

function shipRiseBuildSailGpu(T, sails) {
  if (!sails.length) return null;
  var totV = 0, totI = 0, i;
  for (i = 0; i < sails.length; i++) { totV += sails[i].C.n; totI += sails[i].C.tris.length; }
  if (!totV || !totI) return null;
  var vd = new Float32Array(totV * SB_DW), vs = new Float32Array(totV * SB_SW), iv = new Uint32Array(totI);
  var A = T.sailAtlas, dummyOw = { T: T, team: 'blue' };
  var vb = 0, ib = 0, steps = [];
  for (i = 0; i < sails.length; i++) {
    var C = sails[i].C, n = C.n, p0 = C.p0, tr = C.tris, vc = C.vcol, uv = C.uv, cl = C.col || [0.95, 0.92, 0.85];
    var rect = A && C.ti !== undefined && typeof sailRect === 'function' ? sailRect(dummyOw, A, C.ti) : null;
    // 計算法線（同 11_rig_gpu.js）
    var N = new Float32Array(n * 3);
    for (var t = 0; t < tr.length; t += 3) {
      var a = tr[t] * 3, b = tr[t + 1] * 3, c = tr[t + 2] * 3;
      var ux = p0[b] - p0[a], uy = p0[b + 1] - p0[a + 1], uz = p0[b + 2] - p0[a + 2];
      var vx = p0[c] - p0[a], vy = p0[c + 1] - p0[a + 1], vz = p0[c + 2] - p0[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
      N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
      N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (var v = 0; v < n; v++) {
      var k3 = v * 3, nl = Math.hypot(N[k3], N[k3 + 1], N[k3 + 2]) || 1;
      var o6 = (vb + v) * SB_DW, o12 = (vb + v) * SB_SW;
      vd[o6] = p0[k3]; vd[o6 + 1] = p0[k3 + 1]; vd[o6 + 2] = p0[k3 + 2];
      vd[o6 + 3] = N[k3] / nl; vd[o6 + 4] = N[k3 + 1] / nl; vd[o6 + 5] = N[k3 + 2] / nl;
      vs[o12] = vc ? vc[k3] : cl[0]; vs[o12 + 1] = vc ? vc[k3 + 1] : cl[1]; vs[o12 + 2] = vc ? vc[k3 + 2] : cl[2];
      if (rect && uv) {
        vs[o12 + 3] = (rect[0] + uv[v * 2] * rect[2]) / A.w;
        vs[o12 + 4] = (rect[1] + uv[v * 2 + 1] * rect[3]) / A.h;
      } else { vs[o12 + 3] = -1; vs[o12 + 4] = -1; }
      vs[o12 + 5] = 999999; vs[o12 + 6] = 0; vs[o12 + 7] = 0; vs[o12 + 8] = 0; // aF.x >= 5e5（無燃燒棄捨）
      vs[o12 + 9] = 2.0; vs[o12 + 10] = 0; vs[o12 + 11] = 0;                  // aH.x >= 1.9（無破洞棄捨）
    }
    for (t = 0; t < tr.length; t++) iv[ib + t] = vb + tr[t];
    vb += n; ib += tr.length;
    steps.push({ thr: sails[i].thr, count: ib });
  }
  var vao = gl.createVertexArray(), vbo = gl.createBuffer(), sbo = gl.createBuffer(), ebo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, vd, gl.STATIC_DRAW);
  [[0, 0, 3], [1, 3, 3]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[2], gl.FLOAT, false, SB_DW * 4, a[1] * 4); });
  gl.bindBuffer(gl.ARRAY_BUFFER, sbo); gl.bufferData(gl.ARRAY_BUFFER, vs, gl.STATIC_DRAW);
  [[2, 0, 3], [3, 3, 2], [4, 5, 4], [5, 9, 3]].forEach(function (a) { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[2], gl.FLOAT, false, SB_SW * 4, a[1] * 4); });
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, iv, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao: vao, vbo: vbo, sbo: sbo, ebo: ebo, steps: steps, total: totI };
}

function shipRiseUpperBound(arr, thr) {
  var lo = 0, hi = arr.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (arr[mid] <= thr) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function shipRiseStepCount(steps, v) {
  if (!steps || !steps.length) return 0;
  var n = 0;
  for (var i = 0; i < steps.length; i++) {
    if (steps[i].thr <= v) n = steps[i].count; else break;
  }
  return n;
}

// ───────────────────────── 施工裝飾與實例更新 ─────────────────────────
function shipRiseDeco(sr, p, hz) {
  if (p >= 1) return [];
  var D = sr.d, G = sr.G, out = [], SX = G.sx, SY = G.sy, SZ = G.sz;
  var PX = SR_PAD, PZ = SR_ZPAD;
  var zBase = Math.max(0, D.minZ + PZ - SR_BLOCK_VOX);
  var zKeelBot = D.minZ + PZ - 1;
  var cy = Math.round(sr.T.cy) + PX;
  var x0 = D.minX + PX, x1 = D.maxX + PX, y0 = D.minY + PX, y1 = D.maxY + PX;
  var woodDark = (typeof RISE_C !== 'undefined' && RISE_C.bark) || 100;
  var woodPole = (typeof RISE_C !== 'undefined' && RISE_C.pole) || 136;
  var woodPlank = (typeof RISE_C !== 'undefined' && RISE_C.plank) || 177;
  var clothCol = 213;
  function put(x, y, z, col) {
    if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return;
    out.push(x + SX * (y + SY * z), col);
  }
  var poleStep = clamp(Math.round(D.hullLen / 10), 11, 22);
  var lvStep = clamp(Math.round((D.maxZ - D.minZ) / 3), 9, 14);
  // ① 龍骨墩木（p < 0.98）
  if (p < 0.98) {
    var kStep = clamp(Math.round(D.hullLen / 16), 7, 13);
    for (var kx = x0 + 2; kx <= x1 - 2; kx += kStep) {
      for (var dx = 0; dx < 2; dx++) for (var dy = -2; dy <= 2; dy++) {
        for (var kz = zBase; kz <= zKeelBot; kz++) put(kx + dx, cy + dy, kz, woodDark);
      }
    }
  }
  // ② 兩舷斜撐（0.18..0.94，待肋骨立起後登場）
  if (p >= 0.18 && p < 0.94) {
    var topShoreZ = Math.min(D.maxZ + PZ - 2, Math.max(zKeelBot + 4, hz));
    for (var sx = x0 + 6; sx <= x1 - 6; sx += poleStep) {
      for (var side = -1; side <= 1; side += 2) {
        var footY = side < 0 ? Math.max(1, y0 - 4) : Math.min(SY - 2, y1 + 4);
        var tipY = side < 0 ? y0 + 2 : y1 - 2;
        var spanZ = Math.max(4, Math.min(18, Math.round((topShoreZ - zBase) * 0.55)));
        for (var st = 0; st <= spanZ; st++) {
          var t = st / Math.max(1, spanZ);
          var py = Math.round(footY + (tipY - footY) * t), pz = Math.round(zBase + (topShoreZ - zBase) * 0.45 * t);
          put(sx, py, pz, woodPole);
        }
      }
    }
  }
  // ③ 兩側建造鷹架（0.14..0.95，最後 0.86..0.95 由上往下拆除）
  if (p >= 0.14 && p < 0.95) {
    var scafCap = Math.min(SZ - 2 - zBase, (D.maxZ + PZ + 5) - zBase);
    var scafFull = Math.min(scafCap, Math.max(10, (hz - zBase) + 4));
    var scafH = p > 0.86 ? Math.round(scafFull * clamp((0.95 - p) / 0.09, 0, 1)) : scafFull;
    if (scafH > 2) {
      var sYLo = Math.max(1, y0 - 3), sYHi = Math.min(SY - 2, y1 + 3);
      var sX0 = Math.max(1, x0 - 2), sX1 = Math.min(SX - 2, x1 + 2);
      for (var px = sX0; px <= sX1; px += poleStep) {
        for (var dz = 0; dz < scafH; dz++) {
          put(px, sYLo, zBase + dz, woodDark);
          put(px, sYHi, zBase + dz, woodDark);
        }
      }
      for (var lv = lvStep; lv < scafH - 1; lv += lvStep) {
        for (px = sX0; px <= sX1; px++) {
          put(px, sYLo, zBase + lv, woodPlank); put(px, sYLo + 1, zBase + lv, woodPlank);
          put(px, sYHi, zBase + lv, woodPlank); put(px, sYHi - 1, zBase + lv, woodPlank);
        }
      }
    }
  }
  // ④ 滑台旁物料堆（原木／木板／帆布繩捲，依進度消耗減少）
  if (p < 0.90) {
    var pileY = Math.max(1, y0 - 7);
    var remWood = Math.max(0, 1 - p / Math.max(0.2, sr.cutP));
    var logsN = Math.ceil(6 * remWood);
    for (var l = 0; l < logsN; l++) {
      var row = (l / 3) | 0, colIdx = l % 3;
      for (var lx = x0 + 4; lx < Math.min(SX - 2, x0 + 18); lx++) {
        put(lx, pileY + colIdx * 2, zBase + row, woodDark);
        put(lx, pileY + colIdx * 2 + 1, zBase + row, woodPole);
      }
    }
    var remRig = clamp(1 - Math.max(0, p - 0.35) / 0.55, 0, 1);
    var bxN = Math.ceil(4 * remRig);
    for (var b = 0; b < bxN; b++) {
      for (var dx2 = 0; dx2 < 3; dx2++) for (var dy2 = 0; dy2 < 3; dy2++) {
        put(x0 + 24 + b * 4 + dx2, pileY + dy2, zBase + (dx2 === 1 ? 1 : 0), clothCol);
      }
    }
  }
  return out;
}

/** 設定船台實例進度（p ∈ [0, 1]，sync=true 時同步完整更新 GPU 網格）。 */
function shipRiseSet(sr, p, sync) {
  var D = sr && sr.d; if (!D) return;
  p = clamp(+p || 0, 0, 1);
  if (p === sr.p && !sync && sr.dirty === false) return;
  sr.p = p;
  var cut = sr.cutP > 0 && sr.cutP < 1 ? sr.cutP : SR_DEF_CUT;
  var u = p >= 1 ? 1 : clamp(p / cut, 0, 1);
  var v = p >= 1 ? 1 : clamp((p - cut) / Math.max(1e-4, 1 - cut), 0, 1);

  var nH1 = p >= 1 ? D.hOrd.length : (u <= 0 ? 0 : shipRiseUpperBound(D.hThr, u));
  var nM1 = p >= 1 ? D.mOrd.length : (v <= 0 ? 0 : shipRiseUpperBound(D.mThr, v));

  var G = sr.G, occ = sr.occ, rs = sr.rs, SX = G.sx, SY = G.sy;
  var X = D.X, Y = D.Y, Z = D.Z, C = D.C, i, q, gx, gy, gz;

  function setHullCell(idx, val) {
    gx = X[idx] + SR_PAD; gy = Y[idx] + SR_PAD; gz = Z[idx] + SR_ZPAD;
    G.set(gx, gy, gz, val);
    occ[gx + SX * (gy + SY * gz)] = val ? 1 : 0;
    rs.touch(gx, gy, gz);
  }
  for (i = sr.nH; i < nH1; i++) setHullCell(D.hOrd[i], C[D.hOrd[i]]);
  for (i = sr.nH - 1; i >= nH1; i--) setHullCell(D.hOrd[i], 0);
  sr.nH = nH1;

  for (i = sr.nM; i < nM1; i++) setHullCell(D.mOrd[i], C[D.mOrd[i]]);
  for (i = sr.nM - 1; i >= nM1; i--) setHullCell(D.mOrd[i], 0);
  sr.nM = nM1;

  // 量出目前船體最高實心格（padded Z），決定鷹架高
  var hz = D.minZ + SR_ZPAD + 4;
  for (i = Math.max(0, nH1 - 64); i < nH1; i++) {
    var zc = Z[D.hOrd[i]] + SR_ZPAD; if (zc > hz) hz = zc;
  }
  sr.hz = hz;

  // 施工裝飾差量替換（不覆蓋已完工的船體實心格；p >= 1 時 nu === []）
  var old = sr.deco, nu = shipRiseDeco(sr, p, hz), seen = new Set(), k;
  for (i = 0; i < nu.length; i += 2) seen.add(nu[i]);
  for (i = 0; i < old.length; i += 2) {
    k = old[i];
    if (!seen.has(k) && !occ[k]) {
      gx = k % SX; gy = ((k / SX) | 0) % SY; gz = (k / (SX * SY)) | 0;
      G.set(gx, gy, gz, 0); rs.touch(gx, gy, gz);
    }
  }
  for (i = 0; i < nu.length; i += 2) {
    k = nu[i];
    if (!occ[k]) {
      gx = k % SX; gy = ((k / SX) | 0) % SY; gz = (k / (SX * SY)) | 0;
      G.set(gx, gy, gz, nu[i + 1]); rs.touch(gx, gy, gz);
    }
  }
  sr.deco = nu;
  sr.visV = v;
  sr.lineN = D.lineGpu ? (p >= 1 ? D.lineGpu.total : shipRiseStepCount(D.lineGpu.steps, v)) : 0;
  sr.tubeN = D.tubeGpu ? (p >= 1 ? D.tubeGpu.total : shipRiseStepCount(D.tubeGpu.steps, v)) : 0;
  sr.sailN = D.sailGpu ? (p >= 1 ? D.sailGpu.total : shipRiseStepCount(D.sailGpu.steps, v)) : 0;
  sr.dirty = true;
  if (sync) { rs.flush(); sr.dirty = false; }
}

function shipRiseStandaloneHeight(D) {
  return D ? Math.max(1.8, D.hullLen * S * 0.035 + 1.0) : 1.8;
}

/** 世界變換矩陣（精確對齊 TOWN_VS 滑台座標系與獨立模式展示台）。 */
function shipRiseMatrix(sr) {
  var T = sr.T, D = sr.d; if (!T || !D) return;
  var blockH = SR_BLOCK_VOX * S;
  var pm = [0, shipRiseStandaloneHeight(D), 0], yaw = 0, pitch = 0.055;
  if (!sr.standalone && sr.T_town && sr.lot) {
    var q = townRiseInst(sr.T_town, sr.lot);
    if (q) {
      var sp = SR_YARDS[q.k], K = TOWNS.kit, Mm = K && K.M && K.M[q.k];
      if (sp && Mm) {
        var m0 = Mm.m, mpv = m0.mpv, hx = m0.size[0] * mpv * 0.5, hy = m0.size[1] * mpv * 0.5;
        var st = Math.sin(q.th), ct = Math.cos(q.th);
        function yardW(px, py, pz) {
          var a = (px * mpv - hx) * q.sx, b = py * mpv - hy;
          return [q.x + a * st - b * ct, q.y + pz * mpv, q.z - a * ct - b * st];
        }
        var pHi = yardW(sp.cx, sp.ky0, sp.zKeel0), pLo = yardW(sp.cx, sp.ky1, sp.zKeel1);
        var zMid = sp.zKeel0 + (sp.zKeel1 - sp.zKeel0) * ((sp.yMid - sp.ky0) / Math.max(1, sp.ky1 - sp.ky0));
        pm = yardW(sp.cx, sp.yMid, zMid);
        var uLand = norm([pHi[0] - pLo[0], 0, pHi[2] - pLo[2]]);
        yaw = Math.atan2(-uLand[2], uLand[0]);
        pitch = Math.atan2(pHi[1] - pLo[1], Math.hypot(pHi[0] - pLo[0], pHi[2] - pLo[2]));
      }
    }
  }
  var W = M4.mul(trans(pm[0], pm[1], pm[2]), M4.mul(rotM([0, 1, 0], yaw), rotM([0, 0, 1], pitch)));
  var B_rig = new Float32Array([
    S, 0, 0, 0,
    0, 0, S, 0,
    0, S, 0, 0,
    -S * D.hullMidX, -S * D.minZ + blockH, -S * T.cy, 1
  ]);
  var B_hull = new Float32Array([
    S, 0, 0, 0,
    0, 0, S, 0,
    0, S, 0, 0,
    -S * (D.hullMidX + SR_PAD), -S * (D.minZ + SR_ZPAD) + blockH, -S * (T.cy + SR_PAD), 1
  ]);
  sr.M_rig = M4.mul(W, B_rig);
  sr.M_hull = M4.mul(W, B_hull);
}

// ───────────────────────── 生命週期（開啟／同步／關閉）─────────────────────────
function shipRiseOpen(T_town, lot, hullId, opts) {
  opts = opts || {};
  var key = shipRiseKey(T_town, lot), prev = SHIP_RISE.S[key];
  if (prev && prev.hullId === hullId) {
    if (opts.cutP > 0) prev.cutP = opts.cutP;
    if (opts.p != null && SHIP_RISE.demo !== prev) shipRiseSet(prev, opts.p);
    return Promise.resolve(prev);
  }
  if (prev) shipRiseClose(prev);
  var tasks = [loadHull(hullId)];
  var tok = key + ':' + hullId + ':' + performance.now();
  SHIP_RISE._pending = SHIP_RISE._pending || {};
  SHIP_RISE._pending[key] = tok;

  return Promise.all(tasks).then(function (res) {
    if (SHIP_RISE._pending[key] !== tok) return SHIP_RISE.S[key] || null;
    if (T_town && typeof townRiseHides === 'function' && townRiseHides(T_town, { lot: lot })) return null;
    var T = res[0];
    if (!T) throw new Error('載入船型失敗：' + hullId);
    var D = shipRiseAnalyze(T);
    var hg = T.hullG, sx = hg.sx + SR_PAD * 2, sy = hg.sy + SR_PAD * 2, sz = hg.sz + SR_ZPAD + SR_TOP;
    var G = new VK.Grid([sx, sy, sz]);
    var sr = {
      key: key, T_town: T_town, lot: lot, T: T, hullId: hullId, d: D,
      standalone: !!opts.standalone, ty: opts.ty || hullId,
      G: G, occ: new Uint8Array(sx * sy * sz), rs: new VK.RegionSet(gl, G, QIDX),
      nH: 0, nM: 0, deco: [], hz: 0, dirty: true, ready: true,
      p: -1, cutP: opts.cutP > 0 && opts.cutP < 1 ? opts.cutP : SR_DEF_CUT, simP: opts.sim ? opts.p : null,
      visV: 0, lineN: 0, tubeN: 0, sailN: 0, play: 0, p0: 0, t0: 0, auto: false,
      M_hull: M4.ident(), M_rig: M4.ident()
    };
    SHIP_RISE.S[key] = sr;
    shipRiseMatrix(sr);
    shipRiseSet(sr, opts.p != null ? opts.p : 0, true);
    TOWNS.dirty = true;
    return sr;
  }).catch(function (err) {
    SHIP_RISE.err = String(err && (err.stack || err.message) || err);
    return null;
  });
}

function shipRiseClose(sr) {
  if (!sr) return;
  if (SHIP_RISE._pending) delete SHIP_RISE._pending[sr.key];
  if (SHIP_RISE.S[sr.key] === sr) delete SHIP_RISE.S[sr.key];
  if (SHIP_RISE.demo === sr) SHIP_RISE.demo = null;
  if (sr.rs) sr.rs.dispose();
  TOWNS.dirty = true;
}

/** 同步城鎮帳上正在造船中的船廠（r.yards）。 */
function shipRiseSync(T, yards, fromPoll) {
  if (!T || (fromPoll && SHIP_RISE.hold)) return;
  yards = yards || {};
  for (var k in SHIP_RISE.S) {
    var sr = SHIP_RISE.S[k];
    if (sr.standalone || !sr.T_town || sr.T_town.id !== T.id) continue;
    sr.T_town = T;
    if (!yards[sr.lot] || (typeof townRiseHides === 'function' && townRiseHides(T, { lot: sr.lot }))) {
      sr.simP = null;
      if (SHIP_RISE.demo !== sr) shipRiseClose(sr);
    }
  }
  Object.keys(yards).forEach(function (lot) {
    var info = yards[lot]; if (!info || info.p == null) return;
    if (typeof townRiseHides === 'function' && townRiseHides(T, { lot: lot })) return;
    var hullId = info.hull || info.hullId || info.ty;
    if (!hullId || !HULL_KNOWN.some(function (h) { return h.id === hullId; })) return;
    var p = clamp(+info.p || 0, 0, 1);
    var cutP = info.cutP > 0 && info.cutP < 1 ? +info.cutP : SR_DEF_CUT;
    var key = shipRiseKey(T, lot), cur = SHIP_RISE.S[key];
    if (cur && cur.hullId === hullId) {
      cur.simP = p; cur.cutP = cutP; cur.ty = info.ty || cur.ty;
      if (SHIP_RISE.demo !== cur) shipRiseSet(cur, p);
    } else {
      shipRiseOpen(T, lot, hullId, { p: p, cutP: cutP, sim: true, ty: info.ty });
    }
  });
}

function shipRiseStartDemo(T_town, lot, hullId, p, play, auto) {
  if (SHIP_RISE.demo && SHIP_RISE.demo.key !== shipRiseKey(T_town, lot)) shipRiseStop();
  return shipRiseOpen(T_town, lot, hullId, { p: p == null ? 0 : p, standalone: !T_town }).then(function (sr) {
    if (!sr) return null;
    SHIP_RISE.demo = sr; sr.auto = !!auto;
    shipRiseSet(sr, p == null ? 0 : p, true);
    sr.play = play > 0 ? play : 0; sr.p0 = sr.p; sr.t0 = performance.now();
    shipRisePanelSync();
    return shipRiseStat();
  });
}

function shipRiseStop() {
  var sr = SHIP_RISE.demo; SHIP_RISE.demo = null;
  if (sr) {
    sr.play = 0; sr.auto = false;
    if (sr.simP != null) shipRiseSet(sr, sr.simP, true);
    else if (!sr.standalone) shipRiseClose(sr);
  }
  shipRisePanelSync();
}

function shipRiseTick() {
  var d = SHIP_RISE.demo;
  if (d && d.play) {
    var f = Math.min(1, (performance.now() - d.t0) / 1000 / d.play);
    shipRiseSet(d, d.p0 + (1 - d.p0) * f);
    shipRisePanelSync();
    if (f >= 1 && !d.auto) d.play = 0;
    if (d.auto && performance.now() - d.t0 > (d.play + SR_HOLD) * 1000) shipRiseStop();
  }
  for (var k in SHIP_RISE.S) {
    var sr = SHIP_RISE.S[k];
    if (!sr.ready) continue;
    shipRiseMatrix(sr);
    if (sr.dirty && sr.rs) { sr.rs.flush(); sr.dirty = false; }
  }
}

// ───────────────────────── 算繪掛鉤（60_render.js）─────────────────────────
function shipRiseDrawHulls(prog, pd) {
  if (!shipRiseAny()) return;
  cutSet(prog, null);
  if (prog.u.uVGN) gl.uniform1i(prog.u.uVGN, 0);
  if (prog.u.uShowD) gl.uniform2f(prog.u.uShowD, 0, 0);
  if (SHIP_RISE.cradle && prog === P.vox) {
    gl.uniformMatrix4fv(prog.u.uModel, false, SHIP_RISE.cradle.M);
    SHIP_RISE.cradle.rs.draw();
  } else if (SHIP_RISE.cradle && prog === P.dvox) {
    gl.uniformMatrix4fv(prog.u.uModel, false, SHIP_RISE.cradle.M);
    SHIP_RISE.cradle.rs.draw();
  }
  for (var k in SHIP_RISE.S) {
    var sr = SHIP_RISE.S[k];
    if (!sr.ready || !sr.rs || !sr.rs.quads()) continue;
    gl.uniformMatrix4fv(prog.u.uModel, false, sr.M_hull);
    sr.rs.draw();
  }
}

function shipRiseDrawRig(prog, pd) {
  if (!shipRiseAny()) return;
  cutSet(prog, null);
  var isSh = (prog === P.dtri);
  if (!isSh && prog.u.uGlow) gl.uniform1f(prog.u.uGlow, 0);
  for (var k in SHIP_RISE.S) {
    var sr = SHIP_RISE.S[k], D = sr.d;
    if (!sr.ready || !D) continue;
    var v = sr.visV, M = sr.M_rig;
    // ① 非武器模型＋帆桁＋繩梯（uLit = 1）
    if (!isSh) {
      if (prog.u.uLit) gl.uniform1f(prog.u.uLit, 1);
      gl.vertexAttrib3f(3, 0, 0.5, 0);
    }
    for (var i = 0; i < D.rigModels.length; i++) {
      var rm = D.rigModels[i];
      if (rm.thr > v) break;
      var me = meshFor(sr.T, rm.mesh, rm.mm);
      if (!me) continue;
      if (!me.vao) meshGpu(me);
      gl.uniformMatrix4fv(prog.u.uModel, false, meshDtL(me, M));
      gl.bindVertexArray(me.vao);
      gl.drawArrays(gl.TRIANGLES, 0, me.n);
    }
    if (D.tubeGpu && sr.tubeN > 0) {
      gl.uniformMatrix4fv(prog.u.uModel, false, M);
      gl.bindVertexArray(D.tubeGpu.vao);
      gl.drawArrays(gl.TRIANGLES, 0, sr.tubeN);
    }
    // ② 靜索與動索（uLit = 0，主畫面與反射繪製，陰影略）
    if (!isSh && D.lineGpu && sr.lineN > 0) {
      if (prog.u.uLit) gl.uniform1f(prog.u.uLit, 0);
      gl.vertexAttrib3f(1, 0, 1, 0);
      gl.uniformMatrix4fv(prog.u.uModel, false, M);
      gl.bindVertexArray(D.lineGpu.vao);
      gl.drawArrays(gl.LINES, 0, sr.lineN);
    }
  }
  gl.bindVertexArray(null);
}

function shipRiseDrawSails(prog, pd) {
  if (!shipRiseAny()) return;
  if (prog.u.uSailT) gl.uniform1i(prog.u.uSailT, SAIL_UNIT);
  if (prog.u.uFireT) gl.uniform1f(prog.u.uFireT, BURN.sailBurn);
  var bt = null;
  cutSet(prog, null);
  for (var k in SHIP_RISE.S) {
    var sr = SHIP_RISE.S[k], D = sr.d;
    if (!sr.ready || !D || !D.sailGpu || sr.sailN <= 0) continue;
    var st = sr.T.sailTexGL;
    if (!st || st !== bt) {
      gl.activeTexture(gl.TEXTURE0 + SAIL_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, bt = sailTex(sr.T));
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.uniformMatrix4fv(prog.u.uModel, false, sr.M_rig);
    gl.bindVertexArray(D.sailGpu.vao);
    gl.drawElements(gl.TRIANGLES, sr.sailN, gl.UNSIGNED_INT, 0);
  }
  gl.bindVertexArray(null);
}

// ───────────────────────── 獨立測試舞台（?shiprise=1）─────────────────────────
function shipRiseMakeCradle(D) {
  if (SHIP_RISE.cradle) {
    if (D && SHIP_RISE.cradle.len === D.hullLen) return;
    if (SHIP_RISE.cradle.rs) SHIP_RISE.cradle.rs.dispose();
    SHIP_RISE.cradle = null;
  }
  var GX = D ? Math.max(120, Math.round(D.hullLen + 28)) : 180;
  var GY = D ? Math.max(44, Math.round(D.hullBeam + 22)) : 64;
  var pmY = shipRiseStandaloneHeight(D);
  var slopeDz = Math.ceil(GX * 0.055) + 8;
  var GZ = Math.max(18, slopeDz + 10);
  var midTop = Math.round(GZ * 0.5);
  var grid = new VK.Grid([GX, GY, GZ]);
  var stone = 146, wood = 100, beam = 136;
  for (var x = 4; x < GX - 4; x++) {
    var topZ = Math.max(1, Math.min(GZ - 2, Math.round(midTop + (x - GX / 2) * 0.055)));
    for (var y = 6; y < GY - 6; y++) {
      for (var z = 0; z <= topZ; z++) grid.set(x, y, z, z === topZ && (y === Math.round(GY * 0.35) || y === Math.round(GY * 0.65) || (x % 8 < 2)) ? wood : stone);
    }
    if (x % 16 === 0) {
      for (z = topZ + 1; z <= topZ + 2; z++) { grid.set(x, 7, z, beam); grid.set(x, GY - 8, z, beam); }
    }
  }
  var rs = new VK.RegionSet(gl, grid, QIDX); rs.buildAll();
  var M = M4.mul(trans(0, pmY, 0), new Float32Array([S, 0, 0, 0, 0, 0, S, 0, 0, S, 0, 0, -S * (GX / 2), -S * (midTop + 1), -S * (GY / 2), 1]));
  SHIP_RISE.cradle = { grid: grid, rs: rs, M: M, len: D ? D.hullLen : 0 };
}

function shipRisePanel() {
  if (SHIP_RISE.panel || !SHIPRISE_UI) return SHIP_RISE.panel;
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50;background:rgba(16,22,30,0.88);color:#eee8dc;font:13px/1.5 sans-serif;padding:10px 12px;border-radius:8px;min-width:290px;box-shadow:0 4px 16px rgba(0,0,0,0.45)';
  var opts = HULL_SHIPS.map(function (h) { return '<option value="' + h.id + '">' + h.name + ' (' + h.id + ')</option>'; }).join('');
  el.innerHTML =
    '<div style="font-weight:bold;margin-bottom:4px">造船台建造演出（TASK-1350）</div>' +
    '<div style="margin-bottom:4px">船型：<select data-k="hull" style="max-width:210px">' + opts + '</select></div>' +
    '<input data-k="p" type="range" min="0" max="1000" value="350" style="width:100%">' +
    '<div style="display:flex;gap:6px;align-items:center;margin:4px 0">' +
      '<button data-k="play">▶ 播放</button><button data-k="stop">■ 停</button>' +
      '<span data-k="pct" style="min-width:42px;text-align:right">35%</span>' +
      '<span data-k="stage" style="opacity:0.85"></span>' +
    '</div>' +
    '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
      [0.10, 0.25, 0.50, 0.75, 0.88, 1.00].map(function (v) {
        return '<button data-pv="' + v + '">' + Math.round(v * 100) + '%</button>';
      }).join('') +
    '</div>' +
    '<div data-k="info" style="font-size:11px;opacity:0.8;margin-top:4px"></div>';
  document.body.appendChild(el);
  function $(k) { return el.querySelector('[data-k="' + k + '"]'); }
  $('hull').onchange = function () {
    shipRiseStandaloneLoad(this.value, 0.35);
  };
  $('p').oninput = function () {
    var sr = SHIP_RISE.demo; if (!sr) return;
    sr.play = 0; shipRiseSet(sr, +this.value / 1000, true); shipRisePanelSync();
  };
  $('play').onclick = function () {
    var sr = SHIP_RISE.demo; if (!sr) return;
    if (sr.p >= 1) shipRiseSet(sr, 0, true);
    sr.p0 = sr.p; sr.t0 = performance.now(); sr.play = SR_DUR * (1 - sr.p0) || SR_DUR;
  };
  $('stop').onclick = function () { if (SHIP_RISE.demo) SHIP_RISE.demo.play = 0; shipRisePanelSync(); };
  el.querySelectorAll('[data-pv]').forEach(function (b) {
    b.onclick = function () {
      var sr = SHIP_RISE.demo; if (!sr) return;
      sr.play = 0; shipRiseSet(sr, +b.dataset.pv, true); shipRisePanelSync();
    };
  });
  SHIP_RISE.panel = el;
  return el;
}

function shipRiseStageName(sr) {
  if (!sr) return '';
  if (sr.p >= 1) return '完工';
  var cut = sr.cutP || SR_DEF_CUT;
  if (sr.p < cut) {
    var u = sr.p / cut;
    return u < 0.16 ? '龍骨首尾柱' : u < 0.38 ? '肋骨骨架' : u < 0.70 ? '下部船殼' : '上層甲板舷牆';
  }
  var v = (sr.p - cut) / Math.max(1e-4, 1 - cut);
  return v < 0.35 ? '立桅' : v < 0.62 ? '舾裝與帆桁' : v < 0.78 ? '靜索動索' : '掛帆與旗';
}

function shipRisePanelSync() {
  var el = SHIP_RISE.panel; if (!el) return;
  var sr = SHIP_RISE.demo;
  el.querySelector('[data-k="p"]').value = Math.round((sr ? sr.p : 0) * 1000);
  el.querySelector('[data-k="pct"]').textContent = sr ? Math.round(sr.p * 100) + '%' : '—';
  el.querySelector('[data-k="stage"]').textContent = shipRiseStageName(sr);
  if (sr && sr.d) {
    el.querySelector('[data-k="info"]').textContent =
      '格 ' + (sr.nH + sr.nM) + '/' + sr.d.total + ' · 臨時飾 ' + (sr.deco.length / 2) +
      ' · 帆索引 ' + sr.sailN + ' · 繩點 ' + (sr.lineN + sr.tubeN);
  }
}

function shipRiseStandaloneLoad(hullId, p0) {
  hullId = hullId || Q.get('ship') || HULL_DEF || 'swallow';
  var p = p0 != null ? p0 : (Q.has('p') ? clamp(parseFloat(Q.get('p')) || 0, 0, 1) : 0.35);
  return shipRiseStartDemo(null, 'standalone', hullId, p, 0, false).then(function (st) {
    var sr = SHIP_RISE.S[shipRiseKey(null, 'standalone')];
    if (sr && sr.d) {
      shipRiseMakeCradle(sr.d);
      var span = Math.max(22, sr.d.hullLen * S * 1.45, (sr.d.allMaxZ - sr.d.minZ) * S * 1.4);
      camSet({ mode: 0, tgt: [0, (sr.d.allMaxZ - sr.d.minZ) * S * 0.35 + shipRiseStandaloneHeight(sr.d), 0], dist: span, yaw: 0.62, pitch: 0.24, follow: null, see: null, track: false });
    }
    var sel = SHIP_RISE.panel && SHIP_RISE.panel.querySelector('[data-k="hull"]');
    if (sel) sel.value = hullId;
    shipRisePanelSync();
    return st;
  });
}

function shipRiseStandaloneInit() {
  SHIPS.length = 0; PIECES.length = 0; BALLS.length = 0; FLY.length = 0;
  shipRiseMakeCradle();
  shipRisePanel();
  return shipRiseStandaloneLoad(Q.get('ship') || HULL_DEF || 'swallow', Q.has('p') ? parseFloat(Q.get('p')) : 0.35);
}

// ───────────────────────── 除錯／測試介面（__game.shipRise）─────────────────────────
function shipRiseExactCheck(sr) {
  if (!sr || !sr.T || !sr.T.hullG || !sr.G) return false;
  var A = sr.T.hullG, B = sr.G;
  var nMatch = 0, nDiff = 0;
  for (var x = 0; x < A.sx; x++) for (var y = 0; y < A.sy; y++) for (var z = 0; z < A.sz; z++) {
    var va = A.get(x, y, z), vb = B.get(x + SR_PAD, y + SR_PAD, z + SR_ZPAD);
    if (va !== vb) nDiff++;
    else if (va) nMatch++;
  }
  return nDiff === 0 && nMatch === A.count && sr.deco.length === 0;
}

function shipRiseOne(sr) {
  var D = sr.d;
  var rigVis = 0;
  for (var i = 0; i < D.rigModels.length; i++) if (D.rigModels[i].thr <= sr.visV) rigVis++;
  return {
    town: sr.T_town ? sr.T_town.id : null, lot: sr.lot, hullId: sr.hullId, ty: sr.ty,
    pos: sr.M_rig && D ? M4.pt(sr.M_rig, D.hullMidX, sr.T.cy, D.minZ) : null,
    p: sr.p, cutP: sr.cutP, stage: shipRiseStageName(sr), ready: !!sr.ready,
    shown: sr.nH + sr.nM, hullShown: sr.nH, mastShown: sr.nM, total: D.total,
    deco: sr.deco.length / 2, rigModels: rigVis, rigTotal: D.rigModels.length,
    lineVerts: sr.lineN, tubeVerts: sr.tubeN, sailIdx: sr.sailN,
    exact100: sr.p >= 1 ? shipRiseExactCheck(sr) : undefined
  };
}

function shipRiseFloatCheck(sr) {
  if (!sr) {
    sr = SHIP_RISE.demo || SHIP_RISE.S[Object.keys(SHIP_RISE.S)[0]];
  }
  if (!sr || !sr.G || !sr.occ) return null;
  var occ = sr.occ, G = sr.G, SX = G.sx, SY = G.sy, SZ = G.sz, N = occ.length;
  var vis = new Uint8Array(N), q = new Int32Array(N);
  var compSizes = [], total = 0, maxComp = 0;
  for (var i = 0; i < N; i++) {
    if (!occ[i]) continue;
    total++;
    if (vis[i]) continue;
    var qh = 0, qt = 0;
    vis[i] = 1; q[qt++] = i;
    while (qh < qt) {
      var u = q[qh++], ux = u % SX, uy = ((u / SX) | 0) % SY, uz = (u / (SX * SY)) | 0;
      var x0 = ux > 0 ? ux - 1 : 0, x1 = ux + 1 < SX ? ux + 1 : SX - 1;
      var y0 = uy > 0 ? uy - 1 : 0, y1 = uy + 1 < SY ? uy + 1 : SY - 1;
      var z0 = uz > 0 ? uz - 1 : 0, z1 = uz + 1 < SZ ? uz + 1 : SZ - 1;
      for (var zz = z0; zz <= z1; zz++) for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) {
        var v = xx + SX * (yy + SY * zz);
        if (occ[v] && !vis[v]) { vis[v] = 1; q[qt++] = v; }
      }
    }
    compSizes.push(qt);
    if (qt > maxComp) maxComp = qt;
  }
  compSizes.sort(function (a, b) { return b - a; });
  return { p: sr.p, total: total, comps: compSizes.length, maxComp: maxComp, floating: total - maxComp, compSizes: compSizes.slice(0, 10) };
}

function shipRiseStat() {
  var demo = SHIP_RISE.demo ? shipRiseOne(SHIP_RISE.demo) : null;
  var list = Object.keys(SHIP_RISE.S).map(function (k) { return shipRiseOne(SHIP_RISE.S[k]); });
  return { demo: demo, yards: list, err: SHIP_RISE.err };
}

function shipRiseCmd(cmd, a, b, c) {
  if (cmd === 'stat' || cmd == null) return shipRiseStat();
  if (cmd === 'floatCheck') return shipRiseFloatCheck();
  if (cmd === 'set') {
    var p = clamp(+a || 0, 0, 1);
    if (SHIP_RISE.demo) { SHIP_RISE.demo.play = 0; shipRiseSet(SHIP_RISE.demo, p, true); shipRisePanelSync(); }
    else Object.keys(SHIP_RISE.S).forEach(function (k) { shipRiseSet(SHIP_RISE.S[k], p, true); });
    return shipRiseStat();
  }
  if (cmd === 'hull') return shipRiseStandaloneLoad(a, b != null ? +b : 0.35);
  if (cmd === 'sync') {
    var T = b ? (TOWNS && TOWNS.list || []).filter(function (t) { return t.id === b; })[0] : (twbTown() || (TOWNS && TOWNS.list && TOWNS.list[0]));
    if (T) shipRiseSync(T, a || {}, false);
    return shipRiseStat();
  }
  if (cmd === 'hold') { SHIP_RISE.hold = !!a; return shipRiseStat(); }
  if (cmd === 'lots') {
    var out = [];
    (TOWNS && TOWNS.list || []).forEach(function (T) {
      (T.inst || []).forEach(function (q) {
        if (q.lot != null && SR_YARDS[q.k]) out.push({ town: T.id, lot: q.lot, k: q.k, x: q.x, y: q.y, z: q.z, th: q.th });
      });
    });
    return out;
  }
  if (cmd === 'play') return shipRiseStartDemo(twbTown() || null, a || 'standalone', b || 'swallow', c || 0, SR_DUR, false);
  if (cmd === 'stop') { shipRiseStop(); return shipRiseStat(); }
  return shipRiseStat();
}

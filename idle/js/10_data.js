// ───────────────────────── 方舷放置：數值與內容表 ─────────────────────────
// 調手感只改這一支：BAL 是所有公式的常數；海域、船、升級、深海科技、技能、成就都是表。
(function (I) {
  'use strict';
  I.SAVE_KEY = 'bsidle.v1';

  I.BAL = {
    // 曲線（2026-10-30 量的：第 2 海域一場約 50 秒、打下 3,500 格）：要跟上海域，砲術每個海域要 ln1.16/ln1.10 ≈ 1.56 級 ⇒ 價錢每個海域 ×1.25^1.56 ≈ 1.42；
    //   收入每個海域 ×1.17（再加鑑價師，大約 ×1.28）⇒ 差 1.1 倍／海域慢慢累積，第一輪大約在第 60 海域撞牆 ⇒ 轉生
    // 一艘敵艦的身價 ＝ 一格的價值 × poolK × 噸位^poolExp（第 1 海域的燕子號 85 噸 ≈ 3,600）：
    //   打下來的格照飽和曲線領 hitShare ×（1 − e^(−打掉的格 ÷ 那艘的 5%)）、出局領 outShare（降旗 × captureK）、殉爆再加 boomShare
    //   ⇒ 一艘船的錢有上限：火力強只會打得快，不會讓一艘船更值錢（⛔ 2026-10-30 第一版照格算：火力 ⇒ 洞大 ⇒ 格多 ⇒ 錢多 ⇒ 火力，第 21 海域一場 7 秒 3,000 萬格）
    vGrow: 1.17,              // 一格的價值：每過一個海域 ×
    poolK: 130, poolExp: 0.75,
    hitShare: 0.6, outShare: 0.4, boomShare: 0.3, hitRef: 0.05,
    captureK: 1.5,            // 降旗（俘獲）的出局賞金倍率
    bossK: 5,                 // 海域守將的身價倍率
    lvGrow: 1.16,             // 敵艦的強度：每過一個海域 ×
    early0: 0.45,             // 新手海：第 1 海域的強度再 ×0.45，到第 11 海域升回 ×1（第一版第 1 海域一場 116 秒，太慢）
    bossLv: 2.0,              // 守將海域的強度再 ×
    atkExp: 0.55,             // 火力比 ⇒ 敵艦船殼硬度（−）與我方砲彈傷害（＋）的次方
    defExp: 0.55,             // 船堅比 ⇒ 我方船殼硬度（＋）與敵方砲彈傷害（−）的次方
    hardMin: 0.25, hardMax: 4, dmgMin: 0.3, dmgMax: 4,
    myHole: 1.4, holeExp: 0.3, holeMin: 0.6, holeMax: 1.8,    // 砲彈打到船殼的洞（半徑倍率）：我方的底 × 火力比^holeExp；敵方 ＝ 船堅比^−holeExp（上限顧效能：洞的體積 ∝ 半徑³）
    eHard: 0.15,              // 放置模式的底：敵艦硬度、進水、抽水（不然兩艘小船對轟五分鐘還分不出勝負）
    eFlood: 6, ePump: 0.4,
    eReload0: 7, eReloadMin: 3.6, eReloadPer: 0.012,
    myReload0: 5.5, myFlood: 0.7, myPump: 1.3,
    strike0: 0.6, strikeMin: 0.25,   // 敵艦死傷到這個比例就降旗（骷髏旗升級往下壓）
    dist: 70,                 // 開局兩邊船頭相距（m）
    timeout0: 150, timeoutPer: 45,   // 一場打多久還沒分出勝負就撤退（模擬秒）：底＋每艘敵艦
    hold: 4.5,                // 分出勝負之後再看幾秒（沉船）才換下一場
    retryAfter: 3,            // 打輸退一個海域，贏幾場再回去挑戰
    offlineBase: 0.25, offlineCap: 12 * 3600,
    shardZone: 25,            // 第一次能潛回亞特蘭提斯（轉生）的海域
    slotPrice: [0, 15000, 6e5, 4e7, 5e9],    // 艦隊第 n 個位置的價錢
    shipK: 3000, shipTonExp: 0.7, shipGrow: 1.3, // 造船：shipK × (噸位/50)^shipTonExp × shipGrow^(第一次出現的海域−1)
    fieldFoes: 3              // 同時在場的敵艦最多幾艘（其他的照順序補上 ＝ 一波一波）
  };

  /** 海域（一區 10 個，第 10 個是守將）。pool：照順序越後面越常出現；wx：天氣；map／site：海圖（Blockside maps/<map>，Blocksail tools/export_chunks.cjs 匯出）與開戰點 ——
   *  海圖是核心開機時讀的（?map=），換到別張 ⇒ 存檔、重新載入這一頁。沒寫 ⇒ 開闊的海。 */
  I.REGIONS = [
    { name: '加勒比淺灘', ico: '🏝️', wx: 'clear', map: 'tortuga', site: 0, pool: ['swallow', 'flyingfish', 'labelle'], boss: 'sanroman', say: '托爾圖加海峽，暖暖的淺灘，小船先熱身。' },
    { name: '古代航道', ico: '🏛️', wx: 'clear', map: 'salamis', site: 0, pool: ['punt', 'fusta', 'dromon'], boss: 'reale', say: '薩拉米斯海峽：槳帆船與希臘火，穿越時空的對手。' },
    { name: '西班牙大陸', ico: '🏰', wx: 'clear', pool: ['falcon', 'sanroman', 'tradewind', 'zeehaen'], boss: 'cosecha', say: '運寶船隊的航線，大帆船坐鎮。' },
    { name: '北海風暴', ico: '⛈️', wx: 'storm', pool: ['zeehaen', 'oxford', 'phoenix'], boss: 'stormkaap', say: '浪大、風強，砲口晃得厲害。' },
    { name: '幽靈海域', ico: '👻', wx: 'storm', pool: ['phoenix', 'tidegrave', 'cosecha'], boss: 'nightlamp', say: '黑帆與提燈，聽說有船從海底浮上來。' },
    { name: '風帆巨艦', ico: '⚓', wx: 'clear', pool: ['tidegrave', 'constitution', 'concepcion'], boss: 'ember', say: '兩層、三層砲甲板的大傢伙。' },
    { name: '鐵甲時代', ico: '⚙️', wx: 'clear', map: 'hampton', site: 0, pool: ['monitor', 'sentinel', 'virginia', 'susquehanna'], boss: 'gloire', say: '漢普頓錨地：莫尼特號與維吉尼亞號在這裡打成平手。木殼的砲彈會彈開。' },
    { name: '遠東艦隊', ico: '🐉', wx: 'clear', pool: ['susquehanna', 'matsushima', 'napoleon'], boss: 'dingyuan', say: '巨砲時代的鋼鐵巨獸。' },
    { name: '大漩渦', ico: '🌀', wx: 'maelstrom', map: 'lofoten', site: 0, pool: ['concepcion', 'ember', 'napoleon'], boss: 'tridente', say: '羅弗敦的漩渦海峽，海在旋轉。傳說三叉戟號守在漩渦中心。' }
  ];
  I.ABYSS = { name: '深淵', ico: '🕳️', say: '再往下就沒有海圖了。' };

  /** 我方能造的船：先擊敗過那一型（拿到藍圖）才能造；pinas（藍鯊號）是亞特蘭提斯的禮物（打過第 15 海域）。 */
  I.GIFTS = { flyingfish: 0, pinas: 15 };

  /** 升級（花格）。tab：atk 攻擊／def 防禦／eco 經濟；eff：每一級的倍率；max 0 ＝ 沒上限。 */
  I.UPG = [
    { id: 'gun', tab: 'atk', ico: '🎯', name: '砲術訓練', c0: 250, g: 1.25, max: 0, eff: 1.1, desc: '火力 ×1.1：砲彈更兇、洞更大、敵艦的船殼更脆' },
    { id: 'reload', tab: 'atk', ico: '⏱️', name: '裝填演練', c0: 600, g: 1.45, max: 24, eff: 0.95, desc: '裝填時間 ×0.95' },
    { id: 'powder', tab: 'atk', ico: '💥', name: '火藥專家', c0: 5000, g: 1.6, max: 15, eff: 0.88, desc: '敵艦的火藥桶更不耐打（更容易殉爆）、殉爆賞金 +20%' },
    { id: 'hull', tab: 'def', ico: '🛡️', name: '船殼加固', c0: 250, g: 1.25, max: 0, eff: 1.1, desc: '船堅 ×1.1：敵彈打不穿、洞更小、砲手少受傷' },
    { id: 'pump', tab: 'def', ico: '🪣', name: '抽水機', c0: 800, g: 1.45, max: 20, eff: 1.15, desc: '抽水 ×1.15、進水 ×0.96' },
    { id: 'sail', tab: 'def', ico: '⛵', name: '帆裝調校', c0: 2000, g: 1.65, max: 10, eff: 1.05, desc: '航速、靈活 ×1.05' },
    { id: 'value', tab: 'eco', ico: '🪙', name: '鑑價師', c0: 300, g: 1.3, max: 0, eff: 1.1, desc: '每一格的價值 ×1.1' },
    { id: 'bounty', tab: 'eco', ico: '🏴‍☠️', name: '賞金獵人', c0: 1000, g: 1.32, max: 0, eff: 1.2, desc: '擊沉、俘獲、殉爆的賞金 ×1.2' },
    { id: 'fear', tab: 'eco', ico: '☠️', name: '骷髏旗', c0: 3000, g: 1.55, max: 20, eff: 0.94, desc: '敵艦死傷到更低的比例就降旗（俘獲賞金 ×1.5）' },
    { id: 'teeth', tab: 'eco', ico: '🦷', name: '鯊魚利齒', c0: 200, g: 1.45, max: 15, eff: 1.25, desc: '點敵艦咬一口：咬得更大、咬下來的格 ×1.25' }
  ];
  I.UPG_TABS = [{ id: 'atk', name: '攻擊' }, { id: 'def', name: '防禦' }, { id: 'eco', name: '經濟' }];

  /** 深海科技（花三叉戟碎片；轉生也留著）。 */
  I.TECH = [
    { id: 'trident', ico: '🔱', name: '三叉戟之力', c0: 1, g: 2, max: 0, desc: '火力 ×1.5' },
    { id: 'coral', ico: '🪸', name: '珊瑚裝甲', c0: 1, g: 2, max: 0, desc: '船堅 ×1.5' },
    { id: 'current', ico: '🌊', name: '洋流起點', c0: 3, g: 2.2, max: 8, desc: '每一級：轉生後從海域 +5 出發（不超過最遠到過的一半）' },
    { id: 'dream', ico: '💤', name: '夢中航行', c0: 2, g: 1.8, max: 5, desc: '離線收益 +15%（基礎 25%）' },
    { id: 'chest', ico: '💰', name: '沉船寶藏', c0: 2, g: 2.5, max: 10, desc: '轉生後帶著 1,000 × 10^級 格出發' },
    { id: 'yard', ico: '⚓', name: '老船塢', c0: 5, g: 1, max: 1, desc: '轉生不會忘記已經會造的船與艦隊位置' },
    { id: 'tide', ico: '⏩', name: '洋流加速', c0: 4, g: 3, max: 2, desc: '解鎖 ×3（再一級 ×4）模擬速度' },
    { id: 'instinct', ico: '🦈', name: '鯊魚直覺', c0: 3, g: 2, max: 5, desc: '技能冷卻 ×0.85' },
    { id: 'mate', ico: '🧭', name: '自動航海士', c0: 6, g: 1, max: 1, desc: '自動買升級（可在設定裡關掉）' }
  ];

  /** 技能（主動）。zone：到過這個海域才解鎖。 */
  I.ABIL = [
    { id: 'volley', key: '1', ico: '🔥', name: '全艦齊射', cd: 40, zone: 3, desc: '全艦的砲立刻裝填完畢' },
    { id: 'frenzy', key: '2', ico: '🌊', name: '鯊魚狂潮', cd: 120, dur: 20, zone: 7, desc: '20 秒內所有收入 ×3' },
    { id: 'mega', key: '3', ico: '🦈', name: '巨齒鯊', cd: 90, zone: 14, desc: '每艘敵艦都被狠狠咬一大口' },
    { id: 'repair', key: '4', ico: '🔧', name: '緊急搶修', cd: 120, dur: 25, zone: 24, desc: '25 秒內全艦抽水 ×4、不再進水' }
  ];

  /** 艦隊方針（＝ 核心的砲長，51_captain.js CAPTAINS）：我方每艘照它挑瞄準。 */
  I.DOCTRINE = [
    { id: 'sink', zone: 1, ico: '🌊', name: '擊沉派', tip: '專打水線：沉得快、打下來的格多' },
    { id: 'steady', zone: 1, ico: '⚖️', name: '穩健派', tip: '照局勢平均分配' },
    { id: 'mast', zone: 5, ico: '🪓', name: '拆桅派', tip: '先拆桅，讓對方跑不動' },
    { id: 'kill', zone: 8, ico: '⚔️', name: '殺傷派', tip: '打砲甲板與人：配骷髏旗多俘獲' },
    { id: 'gamble', zone: 12, ico: '🎲', name: '賭徒', tip: '彈藥庫一靠近水面就全押上去：配火藥專家多殉爆' }
  ];

  I.SPEEDS = [1, 2, 3, 4];

  /** 成就：每一個收入 ×1.03（乘起來）。 */
  I.ACH = [
    { id: 'sink1', ico: '⚓', name: '第一滴血', desc: '擊沉第一艘', t: function (S) { return S.st.sunk >= 1; } },
    { id: 'sink25', ico: '⚓', name: '沉船專家', desc: '擊沉 25 艘', t: function (S) { return S.st.sunk >= 25; } },
    { id: 'sink250', ico: '⚓', name: '海底墓園', desc: '擊沉 250 艘', t: function (S) { return S.st.sunk >= 250; } },
    { id: 'sink2500', ico: '⚓', name: '七海的惡夢', desc: '擊沉 2,500 艘', t: function (S) { return S.st.sunk >= 2500; } },
    { id: 'cap1', ico: '🏳️', name: '請降', desc: '第一次俘獲（敵艦降旗）', t: function (S) { return S.st.cap >= 1; } },
    { id: 'cap50', ico: '🏳️', name: '戰利品之王', desc: '俘獲 50 艘', t: function (S) { return S.st.cap >= 50; } },
    { id: 'boom1', ico: '💥', name: '轟！', desc: '第一次讓敵艦殉爆', t: function (S) { return S.st.boom >= 1; } },
    { id: 'boom25', ico: '💥', name: '煙火大會', desc: '殉爆 25 次', t: function (S) { return S.st.boom >= 25; } },
    { id: 'bite100', ico: '🦷', name: '磨牙', desc: '咬 100 口', t: function (S) { return S.st.bites >= 100; } },
    { id: 'bite2000', ico: '🦷', name: '大白鯊', desc: '咬 2,000 口', t: function (S) { return S.st.bites >= 2000; } },
    { id: 'blk1e6', ico: '🧱', name: '百萬格', desc: '累計打下 100萬 格', t: function (S) { return S.blocksAll >= 1e6; } },
    { id: 'blk1e9', ico: '🧱', name: '十億格', desc: '累計打下 10億 格', t: function (S) { return S.blocksAll >= 1e9; } },
    { id: 'blk1e12', ico: '🧱', name: '一兆格', desc: '累計打下 1兆 格', t: function (S) { return S.blocksAll >= 1e12; } },
    { id: 'blk1e18', ico: '🧱', name: '百京格', desc: '累計打下 100京 格', t: function (S) { return S.blocksAll >= 1e18; } },
    { id: 'z10', ico: '🗺️', name: '淺灘畢業', desc: '打過第 10 海域', t: function (S) { return S.bestZone > 10; } },
    { id: 'z25', ico: '🗺️', name: '遠洋', desc: '到達第 25 海域', t: function (S) { return S.bestZone >= 25; } },
    { id: 'z50', ico: '🗺️', name: '半張海圖', desc: '到達第 50 海域', t: function (S) { return S.bestZone >= 50; } },
    { id: 'z90', ico: '🌀', name: '漩渦中心', desc: '到達第 90 海域', t: function (S) { return S.bestZone >= 90; } },
    { id: 'z120', ico: '🕳️', name: '深淵', desc: '到達第 120 海域', t: function (S) { return S.bestZone >= 120; } },
    { id: 'fleet3', ico: '🚢', name: '小艦隊', desc: '艦隊有 3 個位置', t: function (S) { return S.slots >= 3; } },
    { id: 'fleet5', ico: '🚢', name: '大艦隊', desc: '艦隊有 5 個位置', t: function (S) { return S.slots >= 5; } },
    { id: 'pinas', ico: '🦈', name: '藍鯊歸隊', desc: '造出藍鯊號', t: function (S) { return !!S.own.pinas; } },
    { id: 'trident', ico: '🔱', name: '三叉戟', desc: '造出三叉戟號', t: function (S) { return !!S.own.tridente; } },
    { id: 'pres1', ico: '🐚', name: '回家', desc: '第一次潛回亞特蘭提斯', t: function (S) { return S.st.pres >= 1; } },
    { id: 'pres5', ico: '🐚', name: '輪迴的鯊魚', desc: '潛回亞特蘭提斯 5 次', t: function (S) { return S.st.pres >= 5; } },
    { id: 'clean', ico: '✨', name: '毫髮無傷', desc: '打贏一場、我方被打掉不到 50 格', t: function (S) { return !!S.st.clean; } },
    { id: 'blitz', ico: '⚡', name: '閃電戰', desc: '開戰 30 秒內打贏', t: function (S) { return !!S.st.blitz; } },
    { id: 'underdog', ico: '🐟', name: '以小博大', desc: '火力比不到 0.6 還打贏', t: function (S) { return !!S.st.under; } }
  ];

  /** 載入時的一句話（本鯊魚說的）。 */
  I.TIPS = [
    'a~ 鯊魚艦隊集結中…',
    '每打掉一格，就是一格 🧱 —— 所以打得越碎越好。',
    '降旗的船賞金 ×1.5，骷髏旗掛高一點準沒錯。',
    '殉爆有額外賞金……才、才不是鼓勵妳去炸人家的彈藥庫呢。',
    '點敵艦可以咬一口。水線下咬，會進水喔。',
    '打不過就退一個海域練一下，本鯊魚會自己回去挑戰的。',
    '轉生（潛回亞特蘭提斯）會重來，可是碎片的加成永遠留著。',
    '藍鯊號是本鯊魚的船，打過第 15 海域就送妳。'
  ];
})(window.BSI = window.BSI || {});

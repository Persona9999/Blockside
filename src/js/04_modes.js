// ───────────────────────── 玩法規則表（TASK-0668） ─────────────────────────
// 區塊職責：每種玩法（MODE，04_state.js）一份規則：其他船動不動手、船隊怎麼組、判不判勝負、自動開砲的預設、開局提示、我艦停不停、海戰的鍵、我艦的裝填……
// 物理意義：以前每個檔各自寫 MODE === 'sandbox'（「沙盒的敵艦不還手」在 4 支檔各寫一次）⇒ 現在都問 modeRule(鍵)；
//   加一種玩法 ＝ 這張表加一份（只寫跟 MODE_BASE 不一樣的格）＋要的話加控制器；主選單的玩法鈕照這張表生（71_input.js modeButtons），存檔照它認（69_prefs.js）。
// ⛔ 操作與鏡頭（第三人稱／第一人稱／建造游標）是另一條軸，不放這張表（0668 第二段：控制器）；建造的介面本身在 82_build.js。
// 失敗處置：MODE 不在表裡（舊存檔、打錯字）⇒ 照 pve。
var MODE_BASE = {
  menu: true,          // 主選單有沒有這顆鈕（也是存檔認不認）
  othersAct: true,     // 我艦以外的船動不動手：電腦轉舵開砲（50_sim.js ai）、陸戰隊與桅頂開槍（40_crew.js）、舉槍的姿勢（41_crew_art.js）
  fleet: 'menu',       // 船隊：'menu' ＝ 照主選單的兩邊艦隊；'first' ＝ 只生我方第一艘（52_fleet.js fleetSpec）
  judge: true,         // 判勝負、結算（61_hud.js checkEnd）
  autoFire: false,     // 自動開砲的預設（換了玩法才套；70_flow.js reset）
  hint: true,          // 開局提示「點敵艦設瞄準點…」（70_flow.js start）
  stopOwn: false,      // 我艦停在原地（跟拋錨同一條；31_sailing.js）
  battleKeys: true,    // 開砲、轉舵那些海戰的鍵作用（false ⇒ 只剩停格、設定、鏡頭；71_input.js）
  myReload: RELOAD,    // 我艦的裝填秒數基準（10_ship.js、52_fleet.js 換船時跟著換）
  fpLock: false,       // 固定第一人稱：🎥、Y 不能離開（81_fps.js fpBuildLock）
  build: false         // 建造介面（82_build.js bldEnter）
};
var MODE_RULES = {
  pve: { name: '對戰電腦' },
  eve: { name: '觀戰（自動開砲）', autoFire: true },
  sandbox: { name: '沙盒（敵艦不還手）', othersAct: false, judge: false, myReload: RELOAD_SANDBOX },
  build: { name: '🔨 建造', fleet: 'first', judge: false, hint: false, stopOwn: true, battleKeys: false, fpLock: true, build: true }
};
Object.keys(MODE_RULES).forEach(function (m) { for (var k in MODE_BASE) if (!(k in MODE_RULES[m])) MODE_RULES[m][k] = MODE_BASE[k]; });
/** 現在這個玩法的規則 k。 */
function modeRule(k) { return (MODE_RULES[MODE] || MODE_RULES.pve)[k]; }

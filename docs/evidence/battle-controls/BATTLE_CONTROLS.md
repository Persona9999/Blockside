# 海戰控制與全域圖示

16張新128×128透明像素PNG：舵輪、鏡頭、自動駕駛、自動開砲、希臘火、實心彈、弩箭、火箭、石彈、火災、積水、破口、透視、剖面、甲板、羅盤。內建image_gen逐張生成；完整實際提示詞、參考與原稿／成品SHA-256在generation.json。9個簡單方向與播放控制延續原生common SVG，不以emoji字型呈現。船帆、船錨等沿用已有素材。

src/art/battle/icons.json與Blocksail world/ui_icons.js對帳69個固定key、97組舊符號；海戰嵌入的所有素材與globalSrc所指檔案逐位元組一致。工具tools/ui_icons_check.cjs可指定Blockside根目錄。負向對照：把Blocksail cannon.png暫時換成女水手，檢查確實失敗並指明cannon core pixels differ；復原後通過。記錄在Blocksail docs/evidence/battle-controls/identity.json。

自動駕駛使用舵輪＋航線，自動開砲使用火砲＋循環箭頭。保持既有on亮底及操作鍵。自動選彈疊加同一repeat徽記。希臘火明確使用greekfire key，一般火災使用fire；七格AMMO_ICON與既有彈種順序對齊，未修改換彈、瞄準、模擬、傷害、職位或存檔規則。

靜態DOM只在啟動掃描一次，忽略script/style、select、輸入與canvas；動態HUD、艦船資訊、起錨、旗號、停格甲板、鍵位提示與離港按鈕在組畫面字串時轉換，再作innerHTML比較。沒有加全頁輪詢或每格MutationObserver。原生select及戰術圖中的圓圈、三角、毀損叉號仍是可讀的幾何狀態符號。第一人稱與建造模式未作完整操作驗收。

驗證：

- build --code：142支JS、5119頂層名字；重複、未宣告寫入、新短名、舊改名引用均0；共用狀態擁有者檢查通過、核心→外殼0；去註解前後835109 AST節點相同。44份船檔保持不變，srccheck對帳262來源及44船檔。
- SVG加進素材內嵌MIME清單，與PNG經同一路徑納入指紋。實際瀏覽器圖示沒有載入失敗。
- IAB實跑持火號dromon對飛魚號、seed3：彈藥title顯示「主武器（希臘火）只打 希臘火：不能換彈」，點換彈仍不變；自動開砲開啟後圖示為autofire、彈藥圖為greekfire＋repeat。
- 自動駕駛點擊off→on，圖示始終autopilot；左錨放下後顯示方向、錨與向上；鏡頭可正常循環；說明頁65個本批／共用圖示載入，包含七種彈藥。
- 最終桌面1280×720與手機390×844實跑。主要操作列、停格、狀態／廣播檢查無Extended_Pictographic文字。手機scrollWidth=innerWidth=390。複合圖示限制42px，防止起錨的三個圖示超出48px按鈕。
- node --check修改的JS、git diff --check、UI固定素材對帳、原32張globe圖示雜湊檢查通過。共用工作區原有未提交ship_cards.json未包入本批成品。

desktop.png與mobile.png為獨立Blockside實跑；Blocksail外殼整合證據放在Blocksail docs/evidence/battle-controls/。

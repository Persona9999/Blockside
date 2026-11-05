# 實際驗收

最終核心來源指紋390de5c74a23d582。獨立Blockside沙盒、維吉尼亞號對飛魚號、seed3，IAB實際UI操作（不寫真實存檔）。

- 滑鼠點小盤下停俥：前進全速→停俥；點小圓盤展開aria-expanded=true；點後退全速→後退全速且收起。
- 圓盤檔位按鈕取得焦點，ArrowUp：後退全速→後退半速；Home→前進全速；Esc收起、焦點回teleOpen。聚焦小盤按g→前進半速，再點G後→前進慢速。
- 實際拖曳（CUA原生drag）：由前進全速檔位拖到後退全速、放開→後退全速且收起。重新展開，再由前進全速拖至盤外(400,610)放開→仍後退全速、面板保持展開。中央停俥→停俥。
- 所有操作在停格中可規劃下令；狀態顯示指令停俥、航速仍8.5節，兩者清楚分開。物理未改。
- 桌面1280×720：desktop.png。手機390×844：mobile.png，panel x8/y212/right320/bottom633，9個檔位按鈕均46×44，document.scrollWidth=390。橫向844×390：landscape.png，panel x12/y45/right492/bottom345，圓盤240×240，scrollWidth=844。
- 小盤按鈕computed pointer-events=auto；原本HUD容器pointer-events=none，新增按鈕明確覆寫，避免只有鍵盤能操作。

node src/tests/telegraph.cjs：9檔、自訂7檔、4死區、預覽及取消0寫入、放開1次寫入、換船取消、第二指不搶輸入、合成click防重入、缺少0檔不誤下停俥、無動力／沉船／禁用模式不下令；keydown隔離、keyup仍清理操舵與控帆。讀數存input-contract.json。實際測過瀏覽器點選、鍵盤與拖曳，未宣稱在真iPhone／Android硬體上實測。

build --code通過：143支JS、5122頂層名字，重複／未宣告／短名／舊改名引用0，狀態擁有者通過、核心→外殼0；836729個AST節點一致。srccheck對帳263來源與44份船檔，船檔未變。node --check修改JS與git diff --check通過。共用工作區既有ship_cards.json改動未混入。
## 無帆船 W／S 連動（2026-11-05）

無帆且 cfg.base > 0 的船，原 sailUp／sailDn 動作改走既有 teleStep：W 往前、S 往後，一次一格，經過停俥。有帆與帆汽混合船仍只調帆；判斷用原始帆面積，戰損不會突然換操作。按住一秒後每半秒一格，OS repeat 不重複計算；放開與換船取消長按。原動作 ID 與玩家改鍵保存不變，方向鍵亦走同一動作。圓盤有焦點時 W／S 也連到相同入口。

HUD 改用 data-act 選取按鈕，修正舊 data-k 選不到的狀況。無帆動力船用全域齒輪與上下箭頭圖示，提示寫俥鐘往前／後；換回帆船恢復帆圖示，兩者皆無則隱藏。鍵位設定與遊戲說明同步。

node src/tests/sail-telegraph.cjs 執行真正 doAct、sailHold、teleStep／teleSet 與 HUD 函式，驗單點、1 秒延遲、0.5 秒連續、放開、換船、上下限、無動力、沉船及帆汽分離。telegraph.cjs 另驗圓盤聚焦後 W／S 走共同入口。

IAB 維吉尼亞號沙盒、手動航行：聚焦小圓盤按 S，前進全速→前進半速；W→前進全速。點畫面 S 鈕→前進半速，W 鈕→前進全速。點畫面後用一般 S 快捷鍵亦→前進半速。停格中測定指令，動力物理未改。sail-controls.png 顯示俥鐘半速與新的齒輪方向按鈕。

本次 build --code：143 JS、5124 頂層名、836903 AST 節點一致，263 來源／44 船對帳通過，來源指紋 c2bab285983555f7。稍後整合 dev 的預烘船表時另行重建。

整合 dev ac56d3f（Abigail 的 TASK-1229 預烘船體錨點表）後重新建置：143 JS、5130 頂層名，838001 AST 節點一致；來源指紋 bd14faefe8300712，263 來源與 44 船對帳通過，既有 ships/anchor.js 保留。兩組輸入測試仍通過。

## 放大操作按鈕圖示（2026-11-05）

納入 Tim 調整的 camera.png（64×64）與 autopilot.png（84×71），檔案內容不另重繪、不重新縮放；同步 Blocksail 全域來源為相同位元組。圓鈕圖示改用內部寬度 80%、高度 62% 的區域，保留 contain 與 pixelated；單圖填滿，多圖等分寬度，角落警告徽章仍維持原尺寸。快捷鍵獨立放在頂部，窄桌面／橫向縮排時另用 9px 與 top:3%，避免文字壓到圖示。

桌面 1280×720：66px 圓鈕，圖示區高 39.68px，快捷鍵距頂端 4.84px，15 顆按鈕文字與圖示沒有相交。直向 390×844：圖示區高 28.52px、無重疊、scrollWidth=390。large-icons-desktop.png 與 large-icons-mobile.png 為實際畫面。橫向 844×390 的修正後讀數與最終整合圖另列於結尾。

同時合入 dev 15f3e74 的收帆戰損修正，依合併後來源重新建置，沒有回退他人的程式。

最終橫向 844×390：快捷鍵 9px，15 顆按鈕文字與圖示相交數 0，scrollWidth=844；large-icons-landscape.png。最終來源指紋 d8b3b47c4f59836d，143 JS／5130 名稱／838133 AST 節點一致、263 來源／44 船對帳通過，兩組俥鐘／控帆輸入測試通過。

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

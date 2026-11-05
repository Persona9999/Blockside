# 海戰像素圖示第一批

四張128×128 RGBA PNG：女水手、火砲、爆裂彈、鏈彈。原稿使用內建image_gen逐張生成、要求原生透明，未提供參考圖片；實際完整提示詞、原稿路徑與SHA-256見generation.json。遊戲版裁切透明留白、最近點縮放置中，不重畫、不以程式去背。原稿alpha含半透明像素，完整保留。

src/js/61_icons.js為本批唯一海戰語義對照，必需素材在建置時內嵌。因此獨立版、離線成品、Blocksail外殼使用相同圖片，不需要額外網路請求。船員圖不取代城鎮人口圖或招募入口，也不改場景水手的角色素材。

已接上：雙方艦隊可動船員／可用砲數、單發／齊射／自動開砲的火砲、船隻詳細資訊、砲位頁籤、爆裂彈／鏈彈切換、說明頁、鍵位設定與快捷鍵提示。火砲的狀態圓圈、實心彈原有圓球、無射界時的空打提示，以及其他尚未繪製的emoji仍沿用原樣。本批不宣稱已替換所有海戰圖示。

驗證：

- python -I src/admin.py build --code：142支JS、5111頂層名字，重複／未宣告寫入／新短名／舊改名引用均0；共用狀態擁有者通過；核心→外殼0。去註解前後834758個AST節點相同；44份船檔不變。
- python -I src/admin.py srccheck：196來源檔、44船檔一致，指紋dd24871f77b86fa0。
- 四支修改／新增JS的node --check，以及git diff --check通過。
- IAB實際開戰（飛魚號對維吉尼亞號、seed3）：雙方船員與火砲PNG均載入，艦隊圖18px，操作鍵22px；暫停時點彈種，實心→爆裂彈→鏈彈，title及data-battle-icon同步；船隻詳細資訊與砲位頁籤顯示相同來源。
- 說明頁9個本批圖示全部載入，包括動態快捷鍵提示。
- 桌面1280×720與手機390×844實際畫面；手機document.scrollWidth=innerWidth=390。desktop.png顯示展開資訊，mobile.png顯示收合資訊。截圖為獨立Blockside實跑，不是遊戲狀態模擬圖。
- 未修改任何戰鬥、傷亡、砲擊、彈藥或存檔規則。共用工作區既有未提交ship_cards.json未納入建置與提交。

原稿及策展卡：ArtGallery/RawImages/meadow_battle_*_v1.png、CanvasInterpretations/meadow_battle_icons.md。

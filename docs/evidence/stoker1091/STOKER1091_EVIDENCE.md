# TASK-1091：司爐待命立繪

## 交付

一位女司爐，朝右四分之三站姿，短髮、汗衫、煤灰、煤鏟。與既有 Sirius 水手畫風一致。使用內建 image_gen，完整提示詞與來源／參考／遊戲原稿／圖集SHA-256見 generation.json。青色頭髮與洋紅衣料是材質標記，非自然髮色。

- 白底原稿：ArtGallery/RawImages/meadow_stoker_keyed_v1.png；館藏 f559cb8，Portraits/meadow_stoker_steamship.md，build／--check通過1117展品。
- 遊戲原稿：src/art/src/stoker.png，先以 Blocksail tools/bg_pockets.py／BiRefNet 清理5塊被圍住白底（8047px）。pockets.png紅色為移除區，親看鏟柄D形孔、手臂、腿間，皮膚／衣料無誤刪。
- 遊戲圖集：src/art/crew.png，96×2688，1欄×14列，每格96×192；新列0-based13。人物高164px、腳底y189、腳掌中心48.578px，煤鏟不拖動落腳中心。
- 以 make_crew.py --append-stoker 追加／更新新列，舊13列RGBA逐像素保持一致，可重跑且檔案SHA不變。圖集採RGBA以保留舊調色盤解碼像素，不另存各隊版本。
- 布2749px為(L,0,L)，髮412px為(0,L,L)，L每4一階。其他像素不撞標記色。
- NART=14、ART_STOKER=13。TASK-1092尚未合入前，沒有新增司爐職位或修改模擬。

## 驗證

`python docs/evidence/stoker1091/verify.py`：圖集尺寸、透明0/255、96×192新格、腳底／留邊、舊13列不變、四組髮衣換色、非遮罩像素不變、追加冪等。checks.txt為讀數，masks.png和recolour.png為親看遮罩與換色圖。

`python -I src/admin.py build --code`：頂層135檔4783名字無撞名，未宣告寫入0；核心／外殼邊界通過；36艘船的資料與雜湊不變；成品約3.01MB；177支來源指紋550f49ade5db1593。`srccheck`通過。

preview.html 嵌入這份真正 index.html，透過測試頁按鈕把現有甲板軍官暫套art13，再以正常遊戲攝影機近5m／遠18m觀看。row-near.png／row-far.png證明真正遊戲的crewArt解碼、著色器換色、圖列UV與縮小取樣可用；GPU error0，console error空。預覽頁和截圖明示「只驗圖列」；**這不是鍋爐旁正式司爐職位的驗收**。

## 未完成部分與接入

TASK-1092由calli處理，當前分支calli/stoker的ART_STOKER仍是ROLE.GUN暫代。玩法合入時須保留本批ART_STOKER=13、NART=14，並取新圖集；玩法程式既有c.art=ART_STOKER即會用新列。正式職位近／遠各截一張後，才可簽1091第三格和結單。本批不接手司爐站位、蒸汽出力或補員規則。

素材源於5276702；共用dev已到050d1cc，而且有別人未提交的src/config/ship_cards.json。未在共用工作區重建／打包該變動；完整已建置素材分支交接calli，合併時照最終來源重建。Blocksail父層指標未bump、未push。

Gallery瀏覽曾受安全限制，因此本批只用Gallery建置／索引檢查與本機原圖檢視，沒有繞過限制去驗Gallery網頁。

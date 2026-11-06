# TASK-1240 — 貿易頁「桶」單位圖示

apex-two，2026-11-07。`tuiUnitHTML()` 的兩個消費端改用 `battleIcon('barrel-unit')`。圖示 16×16 px，aria-label 與 title 均保留「桶」。乘客數量與空貨艙維持原行為。

封閉木蓋、兩道寬灰鐵箍的經典木桶，與開口貨物木桶不同。內建 image_gen 的完整提示詞、透明原稿、128px 圖及 12／16px 對照在 Blocksail docs/evidence/barrel-unit1240/。

驗證：

- `python -I src/admin.py atlas`：58 張 PNG、每格 48px、384×384 圖集；`atlas --check` 通過。
- `python -I src/admin.py build --code`：建置通過；原 HEAD 來源重做與現有成品逐位元組相同、語法樹 841358 節點相同、44 艘船與船檔指紋不變；來源指紋 4f60f6f58f3871df。
- Blocksail `tools/ui_icons_check.cjs`：70 個語意、70 個核心圖示，兩端逐位元組相同；缺圖反向對照確實失敗、還原後通過。
- `python docs/evidence/barrel-unit1240/verify_ui.py <Blocksail root>`：Chrome 載入編譯後 index.html 的真實貿易頁與圖集，桌機 1280×900／手機寬度 375×812 各截圖一張。這裡用代表性 host 市場回覆，不跑城鎮模擬，也不是實體手機測試。
- 實際點一次買賣 1000 按鈕，重畫後圖示仍在；三個單位圖示皆有「桶」標籤且為 16×16。乘客與空貨艙皆沒有桶圖示。
- 與同一頁換回文字「桶」的讀數比較，表格寬度不變：桌機 614px、375px 畫面 341px。面板範圍均在視窗內。

完整讀數見 verification.json；實際畫面見 trade-1280x900.png、trade-375x812.png。

# TASK-1245 選船卡縮圖與分類圖示

apex-two，2026-11-07。依 Tim 指定參考 Sharkside `2f13f81d4e99a5d05d2b29cbc67eac8d830c8cd9`（img/ship/punt.png），復用 zenith 在 Blockside `17b958d` 的 thumbImg 畫法；抽成 js/05_thumb.js，未修改投影、光源與合成算法。新分類圖示 steam／oar 的生成原稿、完整實際提示詞及 dromon 參考雜湊在 Blocksail docs/evidence/shipthumb1245/。槳帆依 Tim 補充改為持火號的地中海雙三角帆、長船身、密集槳列。

## 結果

- 44 型全部拍攝，256×160 RGBA、alpha 僅 0／255；src/art/ships/atlas.png 為 6×8 格、945905 bytes，thumbs.json 記船檔與畫法 SHA-256、每型格位及圖集 SHA-256。
- 35 張可選船卡全部顯示對應縮圖；不載模型，單張內嵌圖集共用 CSS URL，卡片 HTML 不重複 base64。
- 縮圖絕對定位右下角 160×100，文字六向深色陰影描邊。手機卡片 333×98；桌機寬198，列高144／127（依文字），與隱藏縮圖、恢復原 Grid／overflow 規則的對照完全相同。裁切底圖使用 overflow:hidden，因此明確 grid-auto-rows:min-content，防止窄版 implicit rows 被縮至14px。
- Chrome 1280×900、375×812 截圖均親看；面板在視窗內、沒有橫向頁面捲動。不是實體手機測試。
- 蒸汽8型、槳帆5型的篩選與卡片分類圖示相符；搜尋 punt 只剩一張。
- 反向對照：在實際成品的縮圖 manifest 拿掉 constitution，船卡仍可點且收到 picked=constitution，沒有破圖或版型變化。
- 素材反向對照：改 punt 船檔一個位元組，thumbs --check 指名 punt 失敗；還原回綠。拿掉縮圖 manifest，build --code 擋下、index.html 雜湊不變；還原回綠。
- ui_icons_check：72個語意、72個核心圖逐位元組相同；battle atlas 60張 PNG、atlas --check 通過。
- build --code 通過：44艘船檔不變，語法樹843841節點相同，成品5.02MB、來源3596c69f7fca77ad。

## 重跑

```
python -I src/admin.py thumbs --check
python -I src/admin.py thumbs --force
python -I src/admin.py atlas --check
python docs/evidence/shipthumb1245/verify_assets.py <Blocksail root>
python docs/evidence/shipthumb1245/verify_ui.py
```

完整讀數見 assets.json、verification.json；畫面見 picker-1280x900.png、picker-375x812.png。拍攝工具使用臨時 HTML，以當前核心來源和船檔拍攝，不改正式 index.html、不開戰、不讀寫存檔。程式建置會擋過期縮圖；整份模型建置可能更新船檔，完成後會提醒重拍再建。

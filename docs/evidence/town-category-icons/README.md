# 城鎮建築分類像素圖示（TASK-1150）

十一個分類各自以內建 image_gen 生成獨立透明原稿；沒有使用舊 emoji 或其截圖作參考。各圖以航海時代的生活器物、建築和設施重新構圖，採左上光源、深色階梯輪廓與材質色階。圖示下方保留中文分類名稱。

設計對照與概念正本為 `src/art/townbuild/categories.json`。完整實際提示詞、透明背景參數、生成原始路徑、館藏原稿與遊戲圖 SHA-256 見本目錄 `generation.json`。原稿保存在 ArtGallery 的 `RawImages/meadow_town_category_<key>_master.png`。

遊戲圖為 `src/art/townbuild/<key>.png`，128×128 RGBA；從原稿透明邊界裁切後，以 nearest-neighbor 縮入 108×108 再置中，不重新描畫或用程式合成物件。總覽 `overview.png` 同時展示 128px 圖與深淺底 32px 縮圖。

`src/townbuild_art.py` 將 PNG 與中文名稱打包至 `src/js/87_townbuild_art.js`，由遊戲 template 的 game bundle 載入，圖片內嵌於成品，不依賴 Blocksail 額外提供圖片路徑。分類依既有 key 對應；舊 host 的帶 emoji 名稱在這十一類以新圖與純中文名稱呈現。未知 key 保留原名稱，仍能點選。新增分類可先用文字，完成美術後再擴充來源表。

重建：

```powershell
python docs/evidence/town-category-icons/derive_icons.py --gallery-root <ArtGallery根目錄>
python src/townbuild_art.py
python src/townbuild_art.py --check
python -I src/admin.py build --code
python -I src/admin.py srccheck
python docs/evidence/town-category-icons/verify_ui.py --host-root <Blocksail根目錄>
```

介面驗證使用真正的 `87_townbuild.js`、`twbMenuSet`、`twbUI` 和點選處理器，加上正式 template 的 CSS；host 選單由 Blocksail 的建築配置產生。這是隔離 DOM 驗證，不是整座城的 WebGL／模擬實跑。`verification.json` 保存桌面、手機直向與窄橫向尺寸、十一類逐一點選、圖片載入、邊界與未知分類結果；`menu-*.png` 為實際瀏覽器截圖。

面板維持分類、項目與鋪路模式的既有行為；圖示 32px、中文在下方。高度不足時面板捲動，分類按鈕用 `aria-pressed` 表示選取，圖像為裝飾性空 alt。

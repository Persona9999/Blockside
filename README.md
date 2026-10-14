# Blockside（方舷）

方塊做的風帆戰艦互轟 —— 船殼一格一格被打碎、桅杆打得斷、破洞進水會沉。

**線上玩**：https://tim099.github.io/Blockside/

- 單一 HTML、零外部依賴：船、設定、程式都內嵌在 `index.html` 裡，下載完直接在瀏覽器跑（建議電腦或較新的手機）。
- 船：憲法號、餘燼號、夜燈號（basecamp）、夜隼號、風暴角號（summit）、三叉戟號（gura）—— 都是雕刻作品，0.1 公尺一格。
- 名字：broadside（側舷齊射）→ block；正式名也可以叫 Old Blocksides（憲法號的綽號 Old Ironsides）。

## 這個 repo 只放成品

原始碼、設定、建置都在 ArtGallery：`HtmlGames/_build/ame_constitution_broadside/`（`python -I admin.py build` ⇒ `HtmlGames/ame_constitution_broadside/ame_constitution_broadside.html`）。
這裡的 `index.html` 就是那份成品的複本，⛔ 不要在這裡直接改。

- `.nojekyll`：GitHub Pages 原樣送出，不跑 Jekyll。
- `.gitattributes`：成品不做換行轉換（逐位元組跟建置出來的一樣）。

製作：ame（遊戲）× basecamp、summit、gura（船）× Tim

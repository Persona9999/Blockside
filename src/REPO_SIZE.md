# repo 變肥的原因與方案（成品 index.html 每一版都進版控）

Tim 2026-10-20：「另外分析一下 目前index.html每次變動都記錄版本的話之後git會很肥大 有什麼好的方案處理呢」「沒錯 船隻資訊變動」
「如果清除歷史紀錄呢(只保留幾個關鍵節點的版本)」「另外是否只能把船隻資料打包進index.html 有別的方案嗎」「那幫我把方案寫成文件 commit並推上去(建新分支」

> 這是方案分析，還沒動手。數字都是 2026-10-20 在這個 repo 量的（dev 9769c46 前後），量法在 §7。

## 1. 量到的

| 項目 | 數字 |
|---|---|
| repo（10-15 才開始，5 天） | 594 筆提交，pack 154 MiB；用 git 最緊的方式重新打包（`repack -adf --window=100 --depth=250`）後 111 MiB |
| 其中 `index.html` | 528 筆提交動到它；重新打包後佔 **105.6 MB**，其他所有檔案 4.5 MB、提交與目錄樹 0.8 MB |
| `index.html` 一份（6.58 MB） | 船的資料 2.69 MB ＋ 共用網格池（`#vxk-meshes`）1.18 MB ＋ 程式 2.45 MB ＋ 其他（設定、圖）0.26 MB |
| 只改程式的那一版 | 中位數只多 **4 KB**（程式是純文字，git 只存差異） |
| 動到船的那一版 | 那艘（常常連整個網格池）整份重存；例：餘燼號重新匯入（ad0e816）每一版 **229 KB** |
| 同一次改動、船的資料不壓縮存 | **2 KB**（git 自己壓縮、也找得到差異） |
| 增長速度 | 約每天 20 MB ⇒ 一個半到兩個月到 1 GB |

## 2. 為什麼船的資料特別貴

成品裡每艘船是「deflate 壓縮後再 base64」（`admin.py pack_html`），網格池也是。壓縮過的資料改一點點，後面整串位元組全部不同 ⇒ git 找不到相同的片段，只能整份再存一次。
程式那 2.45 MB 是去註解的純文字，改幾行就只存那幾行 ⇒ 不是問題。所以問題不在「成品進版控」本身，而是**壓縮過的船進版控**、而且每一版成品都帶著全部的船。

## 3. 方案

### 3.1 停止提交 `index.html`，改成 CI 建置（建議先做）

- **船的資料以未壓縮的形式提交**：例如 `ships/<代號>`（壓縮前的檔頭 JSON ＋ 格子；網格池一個網格一行）。只有船變的時候才變，而且 git 存得到差異（上面那個 229 KB → 2 KB）。
- **`admin.py assemble`**：用原始碼加 `ships/` 組出 `index.html`，不需要 `VoxelKit/_cache`、不需要 senate。
  10-20 已經用同一套做法重建過三次（b00da9b、48d9a74、4fc7b09：船的標籤照抄上一版成品、程式照常內嵌、去註解、記來源），
  而且同一套重建 8833ec0、ad0e816 跟當時提交的成品**逐位元組相同** ⇒ 這條路可行。
- **CI**：`.github/workflows/pages.yml` 從「上傳提交好的成品」改成「`assemble` 再上傳」（ubuntu 有 python3、node，去註解的驗算照跑）；
  測試站（`dev` 照分支部署）改成同一種 Actions 部署。`index.html` 進 `.gitignore`，`srccheck` 改成檢查 CI 建出來的那一份。
- **效果**：只改程式的提交只長幾 KB；不會再有 `index.html` 的合併衝突（現在每次合併都要重建）；任何一台機器都建得起來（不會再「這台沒有 `_cache`」）。
- **代價**：本機想直接開 `index.html` 要先跑一次 `assemble`；玩家每次更新還是重新下載整個 6.6 MB。

### 3.2 每艘船拆成獨立檔案、要用才載入（對玩家最好）

- `index.html` 只留程式（約 2.5 MB）；每艘船一個檔（100–300 KB），只載入編進艦隊的那幾艘。
- 更新之後玩家只重新下載有變的檔（改程式不用重抓船、改一艘船不用重抓別艘）⇒ 手機用行動網路時差很多。
- **用 `<script>` 標籤載入、不用 `fetch`**：本機雙擊 `index.html`（`file://`）時 `fetch` 讀不到旁邊的檔，`<script>` 讀得到 ⇒ 離線一樣能玩（同 `maps/` 的海圖塊 `BSMAP.chunk(...)` 那一種寫法）。
- 跟現有程式對得上：`loadHull` 本來就是非同步（`Promise.all(fleetHulls().map(loadHull))`）；選船彈窗的卡片照 `ship_cards.json`，不用解碼任何一艘船。
- **網格池要拆**：現在全部船共用一份 1.18 MB 的池子，加一艘船就整份重寫 ⇒ 改成每艘一份、或一個網格一個檔（照內容雜湊命名，同一個網格只存一次）。
- 要單一檔案的時候（畫廊、封存）同一份原始碼照樣建得出來（`assemble --single`）。
- ⛔ 這會改掉「單一檔案、零外部依賴」（ArtGallery 展品時代的規則，`VoxelKit/vxk_inline.py` 的檢查）⇒ 要 Tim 決定 GitHub Pages 這一份還要不要守。

### 3.3 不推薦

- **Git LFS**：GitHub Pages 照分支部署時給的是 LFS 的指標檔、不是內容（測試站現在就是照分支部署）；免費額度 1 GB 很快用完。
- **把 `index.html` 裡的船改成容易存差異的格式（不壓縮）**：玩家要下載、解析的頁面大好幾倍（餘燼號不壓縮 8.7 MB，壓縮後 241 KB）。

## 4. 清除歷史、只保留幾個關鍵版本

- **省多少**：111 MiB → 約 5 MB（舊的 `index.html` 全部拿掉）；保留約 5 個關鍵版本 ⇒ 約 20–25 MB。
- **代價**：
  - 10-15 以來每一筆提交都會換雜湊 ⇒ `dev`、`main` 和所有分支都要 force push（README 寫明不 force push ⇒ 要 Tim 明確決定）。
  - 每一份 clone、worktree、其他人進行中的分支都要重新 clone 或 rebase。
  - 上層 repo 記著 Blockside 的提交雜湊：Blocksail（`external/Blockside`，12 筆）、Valhalla（`Blockside`，1 筆）⇒ 改寫之後 origin 上沒有那些雜湊，舊的上層提交 checkout 不到 Blockside。
  - 現在沒有任何 tag ⇒ 「關鍵版本」得現在手動挑（之後發版建議打 tag）。
  - GitHub 會留著舊物件（例如 PR 的參照），顯示的大小要等它自己清理才會降。
- **比較乾淨、效果一樣的做法**：從現在的狀態開一份新的歷史，舊 repo 留著唯讀封存（同 10-15 從 ArtGallery 搬過來：舊歷史留在那邊）。
- ⛔ **先止住增長再做**：照現在的速度不到一週就長回這麼大。

## 5. 建議順序

1. §3.1：船的資料未壓縮提交、`admin.py assemble`、CI 建置與部署，停止提交 `index.html`。
2. 視需要做 §3.2：每艘船（與網格池）拆成獨立檔案、要用才載入。
3. 最後再決定還要不要 §4 的一次性清除歷史。

## 6. 在那之前（不改寫歷史就能做的）

- 新的 clone、worktree 用 `git clone --filter=blob:none`：舊版的 `index.html` 要用到才下載。
- 本機的 repo 偶爾 `git gc`（pack 154 → 111 MiB 那一段是打包方式造成的，不是資料）。

## 7. 怎麼量

```bash
# repo 大小
git count-objects -vH
# 每個路徑在 pack 裡佔多少（磁碟、原始、幾個版本）
git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectsize) %(objectsize:disk) %(rest)' \
  | awk '$1=="blob"{n[$5]++; s[$5]+=$3; d[$5]+=$4} END{for(p in d) printf "%.1f MB disk %.1f MB raw %d %s\n", d[p]/1048576, s[p]/1048576, n[p], p}' | sort -rn | head
# 打包方式造成的那一段：在複本上重新打包再量（⛔ 不要在共用工作區做）
git clone --mirror <repo> /tmp/m.git && git -C /tmp/m.git repack -adf --window=100 --depth=250 && git -C /tmp/m.git count-objects -vH
```

某一艘船改動的成本（壓縮 vs 不壓縮）：從前後兩版成品取出那艘的 `<script type="application/x-vxk" id="…">`，base64 解開、`zlib.decompress(b, -15)` 解壓，
兩種各在一個暫時的 git repo 裡提交兩版、`repack -adf`，比 `%(objectsize:disk)`。

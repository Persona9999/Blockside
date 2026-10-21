# Render 管線大修（2026-10-21 起；進行中）

Tim：「是否可以用batch繪製炮門(drawcall問題) 以及其他相同物件」「另外可以嘗試整理繪製管線(重構) & 優化」「帆繩可以用骨骼動畫概念 只有被破壞時重算網格嗎」「兩層都做」「整張帆被破壞除外(就不用算了)」「帆破洞邊緣可以一起做嗎(參考火燒 做出撕裂感) 然後確保物理模擬維持原本的(只是顯示優化)」「是否可以部分提交(完成到一個進度) 然後把後續規劃(未完成部分) 文件化紀錄」「確保之後可以接上後續進度 且遊戲可以正常遊玩即可」。

這份：做到哪、量到什麼、剩下什麼、怎麼接著做。每一步的設計原文（英文，含行號、陷阱清單）在 [`RENDER_PLAN_DETAIL.md`](RENDER_PLAN_DETAIL.md)；量測工具在 [`tests/render_lab/`](tests/render_lab/RENDER_LAB.md)。

## 規矩（每一步都照這個驗）

- **只改畫面**：模擬一個值都不讀 render 的東西 ⇒ 戰局雜湊、帆繩的物理雜湊（每艘每面帆的粒子、布片、繩、垂繩、鍊子、斷開那一團帶的帆繩）在每個檢查點都要跟改之前一樣。
- **重構與優化一律逐位元組相同**：量測工具的無 MSAA 截圖（`shot_noaa.png`）20 組設定全部 max diff 0；MSAA 的那張本來就不能重現（同一個狀態重畫也會差），只比自己的雜訊範圍。
- **刻意改畫面的步驟各自獨立一步**（S14 蓋板、R3 撕裂邊），附改前／改後／差異圖給 Tim。
- 量測只用無頭 Chrome（`tests/render_lab/harness.py`），不用 Claude 的共用瀏覽器窗格（會打到別的工作階段開的分頁）。

## 已完成（合進 dev：S1–S4、R0–R2）

| 步 | 做了什麼 | 主要檔 | 畫面 | 量到 |
|---|---|---|---|---|
| S1 | `render()` 拆成一段一段（`frameBegin` → 陰影 → 反射 → `mainOpaque` → `mainWater` → `mainOverlay` → `frameEnd`）；陰影一段畫船 ＝ `shadowCasters`（單張與分段共用）；`csmIn` 每段每個只判一次（`cs` 位元）；拿掉 `SHIPS.concat(PIECES)` | `60_render.js` | 逐位元組相同 | CPU 小（< 0.3 ms） |
| S2 | 模型那一段一格整理一張表 `RBAT`（新檔 `60_rbatch.js`：`rbatPrep` 在 `frameBegin` 做一次 —— 每件的世界矩陣、glow、VAO、類別）；陰影、反射、主畫面 `rbatReplay` 照表重播；拿掉 `modelWorld`／`MWM` | `60_rbatch.js`、`60_render.js` | GL 呼叫逐一相同 | 每格少建上千個快取物件 |
| S3 | 已經是那個值就不再傳：`uGlow` 換了才傳、剖面「關」照程式記著、帆的貼圖同型不再綁、船艙遮罩一格填一次、`MAX_SAMPLES` 問一次 | `60_rbatch.js`、`74_cutaway.js`、`62_simview.js`、`60_render.js` | 逐位元組相同 | gc_high uniform 呼叫 ~3000 → ~2000 |
| S4 | 一次畫多個的程式 `P.triI`／`P.dtriI` 先編好（`P.tri`／`P.dtri` 的著色器一個字沒改，只把 `uModel` 換成 `uMs[gl_InstanceID]`）＋ transform feedback 逐位元對拍 `__rbatProbe`（20 組設定 mismatch 0）＋ 網址開關。**還沒拿來畫**（S5 起） | `01_gl.js`、`60_rbatch.js` | 逐位元組相同 | — |
| R0 | 沒走模擬的那一格（暫停、慢動作、高更新率的空格、`__game.cam`）不重做帆與垂繩的緩衝（`rigSame` 比輸入）；垂繩填預先配好的暫存區；沒有鍊子不再傳空的 | `11_rig_gpu.js`、`60_render.js`、`76_anchor.js` | 逐位元組相同 | 只畫不走模擬的那一格：gc_high 6.0 → 4.4 ms、8 艘 19.5 → 12.3 ms |
| R1 | 帆的緩衝動、靜分兩份：重做時只算、只傳位置與法線；色、貼圖 uv、著火、索引只在撕開、著火、帆換了那一刻傳那一段；整面帆沒了不算不傳不畫 | `11_rig_gpu.js` | 逐位元組相同 | 帆＋垂繩每格上傳 gc_high 1.45 MB → 465 KB、8 艘 5.5 → 1.7 MB |
| R2 | 帆的位置與法線改由 GPU 算（「骨骼」＝ 物理的粒子；現在的布料範本細格就是粒子）：每一步只傳粒子位置一張貼圖（RGB32F），`P.sailK` 用 transform feedback 照三角形表＋鄰接表算法線；撕開只改那幾個三角形（索引三點疊成一點、狀態表那一格），不重排 | `11_rig_gpu.js`（`SAILK`）、`01_gl.js` | 只有帆：14 組逐位元組相同，6 組 1–6 個像素差 1 個色階（PSNR > 100）；GPU 法線跟 CPU 最多差 0.0011° | 帆的緩衝 CPU gc_high 1.13 → 0.24 ms、8 艘 3.88 → 0.60 ms；上傳再減半 |

合併時多修一件：dev 新加的船隻觀察模式（`86_inspect.js inspHiDraw`）用到 S2 拿掉的 `modelWorld` ⇒ 改成照 `rbatShip` 同一條算式現算（只有勾的那幾件）。

**draw call 還沒少**（S5 起才真的一次畫多個）：gc_high 每格 2803、8 艘 12055，跟改之前一樣。

### 網址開關（出問題時先拿這些排除）

| 開關 | 作用 |
|---|---|
| `?rb=0` | 不用 RBAT 那張表（照以前一件一件算、畫） |
| `?inst=0`（或 `?rbinst=0`） | 不用一次畫多個（S5 起才有作用） |
| `?sailk=0` | 帆退回 R1（CPU 算位置與法線） |
| `?rbchk=1`（要 `?debug=1`） | 每格把表跟一件一件算的對拍，不一樣記在 `__rbat.stat.matMiss`／`itemMiss` |
| `?rigchk=1`（要 `?debug=1`） | 帆的動／靜／GPU 那一份跟 CPU 重算的對拍，`__rbat.stat.rigMiss`、`nrmMax` |
| `__rbatProbe()`（`?debug=1` 的主控台） | S4 的著色器逐位元對拍 |

### 已知風險（實測時特別看）

- **R2 在別的顯示卡／瀏覽器**：只在 Chrome＋ANGLE D3D11（RTX 2060）驗過。transform feedback 在別的後端（Mac Metal、Linux GL、手機）跑了卻寫不出東西 ⇒ 帆會不見或全黑；沒有執行期的自我檢查。看到帆怪 ⇒ 先試 `?sailk=0`。
- 貼圖單元 15–17 保留給帆（`SAILK`）。
- 每艘有帆的船多 3 張貼圖（光榮號約 0.75 MB GPU＋0.6 MB CPU 備份），跟 R1 的緩衝一樣不回收。
- 撕破的帆：死掉的三角形還在索引裡（三點疊一點）⇒ draw 的頂點數略多，畫面沒差。

## 剩下的（照這個順序；細節在 RENDER_PLAN_DETAIL.md 同名那一節）

| 步 | 做什麼 | 預期 | 畫面 |
|---|---|---|---|
| S5 | 陰影：模型、裝飾（含砲門蓋板）、斷開那一團的模型、飛出去的、平滑面、裝甲平滑面照網格分桶，`P.dtriI` 一次畫多個（只寫深度、`LESS` ⇒ 順序無關） | gc_high 陰影 928 → ~556 draw | 逐位元組 |
| S6 | 反射／主畫面：同型、離得開的船照槽位一次畫（`tau` 證明深度不會打平手）；擠在一起的照舊 | 8 艘 refl/main 模型 2672 → ~318／趟 | 逐位元組 |
| S7 | 反射／主畫面：同一艘裡證明不會打平手的才合（`geo`）⇒ 砲門蓋板、同型的砲一次畫 | gc_high 模型 528 → ~220–300／趟 | 逐位元組 |
| S8 | 船殼區塊合併緩衝（arena）：同型、沒受傷的區塊 GPU 端 `copyBufferSubData` 拼成一份，連續的一段一次畫（照用 VoxelKit 的著色器，不改 VoxelKit） | 船殼 274 → 2／趟；8 艘 1320 → 8 | 逐位元組 |
| S10 | 平滑面一樣做 arena | 再 −366（gc_high） | 逐位元組 |
| S11–S13 | 剩下每格的配置（碎片、粒子、旗）；矩陣不配置（`m4Into`）；反射跳過整個在水面下的實例 | CPU 0.3–1 ms；反射少 ~60% 模型三角形 | 逐位元組 |
| S14 | **刻意改畫面**：砲門蓋板每艘、每個畫質都畫（不看「裝飾」）；`GFX.port` 只管演不演（0 關、1 每艘、2 只有我艦）—— Tim 發現低畫質別艘沒有蓋板 | 加批次後幾乎 +0 draw | 只有低畫質別艘的蓋板多出來 |
| R3 | **刻意改畫面**：帆的破洞邊緣做出撕裂感（參考火燒的 discard＋雜訊；撕開那一刻算每個頂點離破洞多近，存靜態資料）；陰影的洞一起；布片的邊也套 | — | 只有破洞邊 |

做完 S5–S10，預估每格 draw：gc_high 2804 → ~700、陰影四段 4660 → ~1000、8 艘 12056 → ~400。蓋板在批次之後幾乎不花錢（一片 40 個三角形；成本在 draw call，批次就沒了）。

### 延後、要 Tim 決定的（會改畫面或有平台要求）

- 火藥桶太重：一個 1948 個三角形、光榮號 104 個 ≈ 模型三角形的七成，大多藏在艙底 ⇒ 減面／遠距 LOD？
- 艙內的東西（火藥桶、家具）不畫進陰影與反射？
- 平滑面 LOD（一艘光榮號 61 萬個三角形，是船殼的兩倍）。
- 鏡頭外的船不畫（主畫面、反射的視錐剔除）：原理上逐位元組，但固定鏡頭證明不了邊界，先延後。
- 碎塊（PIECES，打久了 ~250 團）合批、繩子增量重建（`buildRig`：gc_high 每步 ~466 KB，現在比帆還多）、`WEBGL_multi_draw`（Safari 沒有）、setCommon 改 UBO。
- 在 Tim 的機器（實際解析度、MSAA、最好有內顯）量 GPU 端的成本，再決定要不要做減三角形的那幾項。

## 怎麼接著做

1. 從 Blocksail 的 `external/Blockside`（共用工作區，`dev`）開自己的 worktree：`git -C external/Blockside worktree add <路徑> -b <分支> heads/dev`。⚠ submodule 的 `core.worktree` 會漏進 linked worktree ⇒ 每個 git 與 `admin.py build --code`／`srccheck` 前都要 `export GIT_WORK_TREE=<worktree>`。
2. 在 worktree 先錄**起點的基準**（`reports/` 不進版控，舊的基準不在 repo 裡）：
   `python -I -X utf8 src/tests/render_lab/harness.py snapshot --src <worktree> --name base_<sha>`，再 `measure --html reports/render_lab/builds/base_<sha>/index.html --out reports/render_lab/runs/base_<sha> --repeat 2`（全部 20 組約 15 分）；帆不比的那一份加 `--skip-programs P.sail,P.dsail --no-timing --out .../base_<sha>_nosail`。
3. 照 RENDER_PLAN_DETAIL.md 做一步 → `python -I src/admin.py build --code`（說成品不是照 HEAD 建的 ⇒ 先 `git checkout -- index.html`）→ snapshot → `quick --a <基準 run> --b <這一步的 index.html>`（要 `RESULT: EXACT 20/20`）→ `smoke --html <這一步> --base <基準>` → `playtest.py <這一步>`（從主選單開戰、開砲、換船、剖面、觀察模式、`?inst=0&sailk=0`）。
4. 刻意改畫面的步驟：帆不比（`--skip-programs`）那一份要全部逐位元組；有差的地方輸出圖給 Tim。
5. 合回 `dev`：先把 `origin/dev` 合進分支（別的工作階段常常推），重建、重跑 quick／smoke／playtest，再 `git merge --no-ff` 進共用工作區的 `dev`、`srccheck`、`git push origin heads/dev:dev`。
6. 量測的雜訊：好幾個量測同時跑（共用 GPU）時，海面偶爾有 ~700 個像素差 1 ⇒ 單獨重跑那一組；時間的量測每次 ±10–25%，用 `ab --repeat 3` 交錯量。

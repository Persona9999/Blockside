# TASK-1315 交船修整：艉牌與實體艏飾

2026-11-18，meadow。修正使用者近照的艉牌交疊，將兩舷艏眼、浪花及獅面改成可逐格打掉的船格。

| 項目 | 結果 |
|---|---|
| 艉牌 | atX 28→26.5，後移15cm；厚度26.5..27.5，與艉雕最小X28留5cm間隙 |
| 艏飾 | 移除bow-P/S兩個deco模型；新增普通bow-voxel關聯358格，含66格木底 |
| 原有占格 | 吊錨架10格104→160精準換色，沒有疊放兩份格子 |
| 全船 | 176209格、checksum2221512735；相對舊版新增358格、換色10、刪除0 |
| 獨立結果帳 | 缺0、多0、色差0；1連通、空腔0、重疊0，前迴旋砲與砲座相交0 |
| 實心彈破壞 | 原生__game.shot從3m外打一發long6，走stepBall及impact；總27格受損，其中艏飾11格，餘347格仍在 |
| 裝飾反向對照 | GFX.deco關／開各自重設後，同一發砲的艏飾受損結果完全相同，兩種設定都不存在bow-P/S模型 |
| 原功能 | 100人、16砲實射99發且全部補給、無自傷；20次攀梯、帆裝0–3、轉向與雙錨通過 |
| 滿載 | 260t貨無缺口，實測吃水3.8m，總重409.3975t |
| 匯入 | shipcheck錯誤0，4條原有超載開口警告保留；ladcheck錯誤0、警告0 |
| 來源與其他船 | 指紋827c4da10e9edf99、221來源、54船；其他船檔逐位元組未變 |

正式打包成品與原檔逐格、網格對帳由建置自動完成。沒有修改核心JS；原船殼本件仍77102格，物理艏飾為實體link，自動納入船格、質量與碰撞。新checksum取代原交船版2262896839，舊證據留作歷史。

圖：stern.png為艉牌近照；bow-intact.png在關閉裝飾時拍攝；bow-damage.png為單發試射後。trial.py只在本機HTTP回應加入觀察入口，產品無測試hook。重跑：python trial.py <index.html或battle.html> <輸出.json> tungningSternTrial／tungningBowIntactTrial／tungningBowDamageTrial，預設仍為完整海試。

Sculpture重建順序見design/REPRODUCE.md：gear.py之後執行fittings_voxels.py --apply，再匯入與ids。獨立覆核未匯入作者的幾何檢查函式，詳fittings_final.md/json。

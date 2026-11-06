# TASK-1248 匯入自動縮圖與動力名稱

apex-two，2026-11-07。

正常拆檔建置在船檔寫好後檢查縮圖來源，自動補拍新增／變動的船型，再由同一份來源重新嵌回入口；import／reimport／稍後補建置共用這條路。未變的圖集格沿用原像素，不重拍全艦隊。拍攝失敗會讓建置明確失敗。

`src/tests/auto_thumbs_test.py` 在臨時副本以 punt 真實體素模型作匯入樣本，保留真實登記、驗設定、打包、Chrome模型拍攝與入口內嵌流程；只替換雕刻匯出（複製同一份模型）及不相關的繩端／錨／船員／低模檢查。結果見 import.json：新增1型只拍1型、沿用1型且舊圖逐像素相同；未變再同步零寫入；--no-build 新增第3型先不拍，下次正常建置只拍1型、沿用2型；拍攝失敗向外拋出。

既有44型來源紀錄曾以 CRLF 計算畫法雜湊，而 git 儲存為 LF。現在文字來源雜湊先正規化 LF，舊格式只在內容確實相同時沿用；本次遷移 capture 0、reuse 44，945905 bytes 的 PNG 圖集完全未變，沒有不必要的重拍。

`verify_labels.py` 在 Chrome 載入實際成品與 HEAD 舊頁對照35張船卡：只5艘單一動力蒸汽船的「額外動力」改為「蒸氣」，數值與其餘文字完全相同。另以無帆樣本確認 monitor／punt／stormkaap 分別顯示「蒸氣／槳／魔法」；帆船三向航速維持原樣。labels-desktop.png 已親看。

建置：build --code 通過，44艘船檔不變、語法樹843866節點相同、來源01d312e9bad9d192。thumbs --check、atlas --check 皆通過。

重跑：

```
python -X utf8 src/tests/auto_thumbs_test.py --cache-root <Blockside>/VoxelKit/_cache --out docs/evidence/auto-thumbs1248/import.json
python docs/evidence/auto-thumbs1248/verify_labels.py
python -I src/admin.py thumbs --check
```

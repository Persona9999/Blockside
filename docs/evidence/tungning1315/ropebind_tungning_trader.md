# 繩端綁定：東寧三桅洋船（tungning_trader）

> `python -I admin.py ropebind --id tungning_trader` 產生（匯入、重新匯入、metasync、ids 會自己跑）；規則在 `js/10_ship.js` ropeDecide：
> 砲塔的殼 → 作品寫明的（ends：`model:` 那個模型、`rope:` 只找繩、`sail:` 與固定點不猜模型）→ 帆桁 → 母繩（≤ 3 格）→ 最後才照外框猜模型。結果寫進 `.vxk` 的 `rig.ropes[].bind`，遊戲照它綁、不猜。

| 綁在 | 端數 |
|---|---|
| 母繩 | 342 |
| 格子（旁邊 5 格內有實心格） | 48 |
| 帆桁 | 2 |

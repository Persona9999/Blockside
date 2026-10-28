#!/bin/sh
# 區塊職責：子模組一動就把外層專案拿這份成品套的外殼頁重套（例：Blocksail 的 battle.html）—— 規則寫在 src/admin.py 的 act_shellsync（2026-10-28）。
# 由 post-merge／post-checkout／post-rewrite／post-commit 呼叫（第一個參數 ＝ 掛鉤名）；不是別的遊戲的 submodule ⇒ 什麼都不做、不印。
# post-* 掛鉤擋不了 git ⇒ 重套失敗只印出來（照它印的指令手動補），照常結束。
sup=$(git rev-parse --show-superproject-working-tree 2>/dev/null)
[ -n "$sup" ] || exit 0
if ! command -v python >/dev/null 2>&1; then
  echo "外殼頁重套（掛鉤 $1）：找不到 python，沒重套 ⇒ 手動 python -I src/admin.py shellsync"
  exit 0
fi
python -I src/admin.py shellsync --hook "$1"
exit 0

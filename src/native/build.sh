#!/usr/bin/env bash
# 帆布的解算（TASK-1377）：C++ ⇒ WebAssembly ⇒ src/native/rig_cloth.wasm（進版控：沒裝 Emscripten 的人照樣建得了成品）＋ rig_cloth.json（來源指紋）
#   ./src/native/build.sh
#   要 Emscripten 帶的 clang（emsdk）：找 EMSDK 環境變數，沒有 ⇒ D:/emsdk（安裝：git clone emsdk ⇒ emsdk install latest ⇒ emsdk activate latest）
#   獨立的 wasm（不連 libc、不要 Emscripten 的 JS 膠水）：js/29_rigwasm.js 自己載（內嵌在成品裡、admin.py build 照 rig_cloth.json 擋「改了 C++ 沒重編」）
#   -ffp-contract=off：不合併乘加（跟 JS 一步一步算的結果逐位元組相同）；-O3
set -euo pipefail
cd "$(dirname "$0")"
EM="${EMSDK:-D:/emsdk}"
CC="$EM/upstream/bin/clang++"; [ -x "$CC.exe" ] && CC="$CC.exe"
FLAGS=(--target=wasm32 -O3 -ffp-contract=off -std=c++17 -nostdlib -fno-exceptions -fno-rtti -fno-builtin-sin
  -Wl,--no-entry -Wl,--strip-all -Wl,--initial-memory=1048576 -Wl,-z,stack-size=65536)
"$CC" "${FLAGS[@]}" rig_cloth.cpp -o rig_cloth.wasm
# 來源指紋：.cpp、.h、這支 build.sh 的 sha1（換行統一成 LF）⇒ admin.py build 重算一次、對不上就擋（改了沒重編）
CCV="$CC" python -I - <<'EOF'
import hashlib, json, os, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8")
src = sorted(f for f in os.listdir('.') if f.endswith(('.cpp', '.h')) or f == 'build.sh')
h = hashlib.sha1()
for f in src:
    h.update(f.encode() + b'\0' + open(f, 'rb').read().replace(b'\r\n', b'\n') + b'\0')
w = open('rig_cloth.wasm', 'rb').read()
ver = subprocess.run([os.environ.get('CCV', ''), '--version'], capture_output=True, text=True).stdout.split('\n')[0].split(' (')[0] if os.environ.get('CCV') else ''   # 只留版本號（後面是編譯器原始碼的網址）
json.dump({'src': h.hexdigest(), 'files': src, 'wasm': hashlib.sha1(w).hexdigest(), 'bytes': len(w), 'clang': ver}, open('rig_cloth.json', 'w', newline='\n'), ensure_ascii=False, indent=1)
open('rig_cloth.json', 'a', newline='\n').write('\n')
print('✓ rig_cloth.wasm（%d bytes）、rig_cloth.json（來源 %s）' % (len(w), h.hexdigest()[:12]))
EOF

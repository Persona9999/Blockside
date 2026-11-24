"""Tests for B1 (ships/ships_cfg.js split), C1 (per-ship 3-way merge driver), and C2 (admin.py merge).

python -I src/tests/ship_cfg_split_test.py
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(cmd, cwd, check=True):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and p.returncode != 0:
        raise AssertionError('command failed (%d): %s\nSTDOUT:\n%s\nSTDERR:\n%s' % (
            p.returncode, ' '.join(map(str, cmd)), p.stdout, p.stderr))
    return p


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def edit_ship_rig(wt, sid, val):
    p = wt / 'src' / 'config' / 'ships' / ('%s.json' % sid)
    obj = json.loads(p.read_text(encoding='utf-8'))
    obj['ship']['geo']['rigAim'][0] = val
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    run([sys.executable, '-I', 'src/admin.py', 'fmt'], wt)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    with tempfile.TemporaryDirectory(prefix='blockside-shipcfg-test-') as td:
        wt = Path(td) / 'wt'
        run(['git', '-C', str(ROOT), 'worktree', 'add', '--detach', str(wt), 'HEAD'], ROOT)
        try:
            # 清理暫存 worktree 上下文並確保 hooks 與 merge driver 在共用 git config 已啟用
            run([sys.executable, '-I', 'src/admin.py', 'hooks'], wt)
            base_rev = run(['git', 'rev-parse', 'HEAD'], wt).stdout.strip()
            base_html = (wt / 'index.html').read_bytes()
            base_html_sha = sha256_bytes(base_html)

            # T7: 驗證執行期 index.html + ships/ships_cfg.js 載入結果與 config 完全一致
            node_code = r'''
const fs = require('fs'), vm = require('vm'), path = require('path');
const wt = process.argv[1];
const html = fs.readFileSync(path.join(wt, 'index.html'), 'utf8');
const cfgSc = fs.readFileSync(path.join(wt, 'ships', 'ships_cfg.js'), 'utf8');
const mCfg = html.match(/<script type="application\/x-asset" id="game-config"[^>]*>([^<]*)<\/script>/);
const mCards = html.match(/<script type="application\/x-asset" id="ship-cards"[^>]*>([^<]*)<\/script>/);
if (!mCfg || !mCards) throw new Error('missing embedded tags');
if (!html.includes('<script id="bs-ships-cfg" src="ships/ships_cfg.js"></script>')) throw new Error('missing bs-ships-cfg tag');
const gameCfg = JSON.parse(Buffer.from(mCfg[1], 'base64').toString('utf8'));
if ('ships' in gameCfg) throw new Error('game-config still embeds ships array');
if (mCards[1].trim() !== '') throw new Error('ship-cards still embedded in split mode');
const sandbox = { window: {} };
sandbox.window = sandbox;
vm.runInNewContext(cfgSc, sandbox);
const sc = sandbox.BS_SHIPS_CFG;
if (!sc || sc.v !== 1 || !sc.records) throw new Error('BS_SHIPS_CFG invalid');
const ships = Object.keys(sc.records).sort((a, b) => {
  const oa = sc.records[a].order, ob = sc.records[b].order;
  return oa !== ob ? oa - ob : a < b ? -1 : a > b ? 1 : 0;
}).map(k => sc.records[k].ship);
const cards = {};
Object.keys(sc.records).forEach(k => { if (sc.records[k].card) cards[k] = sc.records[k].card; });
console.log(JSON.stringify({ count: ships.length, cards: Object.keys(cards).length, first: ships[0].id, aqrabRig: sc.records.aqrab.ship.geo.rigAim }));
'''
            p7 = run(['node', '-e', node_code, str(wt)], wt)
            info7 = json.loads(p7.stdout.strip())
            n_ships = len(list((wt / 'src' / 'config' / 'ships').glob('*.json')))
            assert info7['count'] == n_ships, info7
            assert info7['cards'] == n_ships, info7
            assert info7['aqrabRig'] == [40, 175], info7
            print('T7 ok:', info7)

            # T6: shell 外殼前綴替換
            shell_dir = Path(td) / 'shell'
            shell_dir.mkdir()
            scfg = shell_dir / 'shell.json'
            scfg.write_text(json.dumps({
                'out': 'out.html',
                'core': os.path.relpath(wt / 'index.html', shell_dir).replace('\\', '/'),
                'title': 'TestShell',
                'ships': 'external/Blockside/'
            }), encoding='utf-8')
            run([sys.executable, '-I', 'src/admin.py', 'shell', str(scfg)], wt)
            out_html = (shell_dir / 'out.html').read_text(encoding='utf-8')
            assert '<script id="bs-ships-cfg" src="external/Blockside/ships/ships_cfg.js"></script>' in out_html
            assert out_html.count('\n') == base_html.decode('utf-8').count('\n')
            run([sys.executable, '-I', 'src/admin.py', 'shell', str(scfg), '--check'], wt)
            print('T6 ok')

            # T1 + T2: 單改 aqrab.json 時不重寫 index.html，未重建則 srccheck 失敗
            edit_ship_rig(wt, 'aqrab', 41)
            p2 = run([sys.executable, '-I', 'src/admin.py', 'srccheck'], wt, check=False)
            assert p2.returncode != 0 and 'ships/ships_cfg.js' in p2.stdout, (p2.returncode, p2.stdout)
            print('T2 ok')

            run([sys.executable, '-I', 'src/admin.py', 'build', '--code'], wt)
            run([sys.executable, '-I', 'src/admin.py', 'srccheck'], wt)
            assert sha256_bytes((wt / 'index.html').read_bytes()) == base_html_sha, 'index.html changed on ship json edit!'
            print('T1 ok: index.html sha256 unchanged on aqrab.json edit')

            # 準備 T3 雙分支：L 改 aqrab、R 改 oxford
            run(['git', 'add', '--', 'src/config/ships/aqrab.json', 'ships/ships_cfg.js'], wt)
            run(['git', 'commit', '--no-verify', '-q', '-m', 'T3 left aqrab'], wt)
            rev_L = run(['git', 'rev-parse', 'HEAD'], wt).stdout.strip()

            # 依序在 L 上再改 oxford 當黃金對照組
            edit_ship_rig(wt, 'oxford', 45)
            run([sys.executable, '-I', 'src/admin.py', 'build', '--code'], wt)
            want_cfg = (wt / 'ships' / 'ships_cfg.js').read_bytes()

            # 建立 R 分支（從 base_rev 改 oxford）
            run(['git', 'checkout', '-q', '-f', '--detach', base_rev], wt)
            edit_ship_rig(wt, 'oxford', 45)
            run([sys.executable, '-I', 'src/admin.py', 'build', '--code'], wt)
            run(['git', 'add', '--', 'src/config/ships/oxford.json', 'ships/ships_cfg.js'], wt)
            run(['git', 'commit', '--no-verify', '-q', '-m', 'T3 right oxford'], wt)
            rev_R = run(['git', 'rev-parse', 'HEAD'], wt).stdout.strip()

            # T3: 在 L 上直接 git merge --no-commit R ⇒ C1 merge driver 0 衝突
            run(['git', 'checkout', '-q', '-f', '--detach', rev_L], wt)
            pm = run(['git', 'merge', '--no-commit', rev_R], wt, check=False)
            assert pm.returncode == 0, (pm.returncode, pm.stdout, pm.stderr)
            assert not run(['git', 'diff', '--name-only', '--diff-filter=U'], wt).stdout.strip()
            assert sha256_bytes((wt / 'index.html').read_bytes()) == base_html_sha
            assert (wt / 'ships' / 'ships_cfg.js').read_bytes() == want_cfg
            run([sys.executable, '-I', 'src/admin.py', 'srccheck', '--staged'], wt)
            run(['git', 'merge', '--abort'], wt)
            print('T3 ok: C1 merge-driver 3-way per-ship merge matched sequential build byte-for-byte')

            # T4: 兩邊改同一艘 aqrab ⇒ C1 merge driver 必須回退為衝突
            run(['git', 'checkout', '-q', '-f', '--detach', base_rev], wt)
            edit_ship_rig(wt, 'aqrab', 43)
            run([sys.executable, '-I', 'src/admin.py', 'build', '--code'], wt)
            run(['git', 'add', '--', 'src/config/ships/aqrab.json', 'ships/ships_cfg.js'], wt)
            run(['git', 'commit', '--no-verify', '-q', '-m', 'T4 right aqrab conflict'], wt)
            rev_R2 = run(['git', 'rev-parse', 'HEAD'], wt).stdout.strip()

            run(['git', 'checkout', '-q', '-f', '--detach', rev_L], wt)
            pm2 = run(['git', 'merge', '--no-commit', rev_R2], wt, check=False)
            assert pm2.returncode != 0
            u4 = set(run(['git', 'diff', '--name-only', '--diff-filter=U'], wt).stdout.split())
            assert 'src/config/ships/aqrab.json' in u4 and 'ships/ships_cfg.js' in u4, u4
            run(['git', 'merge', '--abort'], wt)
            print('T4 ok: C1 correctly conflicted on same-ship edit')

            # T5: C2 admin.py merge 自動解 index.html 衝突（不碰來源衝突）
            run(['git', 'checkout', '-q', '-f', '--detach', base_rev], wt)
            p_gfx = wt / 'src' / 'js' / '07_gfx.js'
            t_gfx = p_gfx.read_text(encoding='utf-8')
            assert "low: '低'" in t_gfx
            p_gfx.write_text(t_gfx.replace("low: '低'", "low: '低 '"), encoding='utf-8', newline='\n')
            run([sys.executable, '-I', 'src/admin.py', 'build', '--code'], wt)
            run(['git', 'add', '--', 'src/js/07_gfx.js', 'index.html'], wt)
            run(['git', 'commit', '--no-verify', '-q', '-m', 'T5 left gfx'], wt)
            rev_JL = run(['git', 'rev-parse', 'HEAD'], wt).stdout.strip()

            run(['git', 'checkout', '-q', '-f', '--detach', base_rev], wt)
            p_sea = wt / 'src' / 'js' / '08_sea.js'
            t_sea = p_sea.read_text(encoding='utf-8')
            p_sea.write_text(t_sea + '\n// test-t5-sea\n', encoding='utf-8', newline='\n')
            run([sys.executable, '-I', 'src/admin.py', 'build', '--code'], wt)
            run(['git', 'add', '--', 'src/js/08_sea.js', 'index.html'], wt)
            run(['git', 'commit', '--no-verify', '-q', '-m', 'T5 right sea'], wt)
            rev_JR = run(['git', 'rev-parse', 'HEAD'], wt).stdout.strip()

            # 同檔同位置衝突分支
            run(['git', 'checkout', '-q', '-f', '--detach', base_rev], wt)
            p_gfx.write_text(t_gfx.replace("low: '低'", "low: '低  '"), encoding='utf-8', newline='\n')
            run([sys.executable, '-I', 'src/admin.py', 'build', '--code'], wt)
            run(['git', 'add', '--', 'src/js/07_gfx.js', 'index.html'], wt)
            run(['git', 'commit', '--no-verify', '-q', '-m', 'T5b conflict gfx'], wt)
            rev_JC = run(['git', 'rev-parse', 'HEAD'], wt).stdout.strip()

            run(['git', 'checkout', '-q', '-f', '--detach', rev_JL], wt)
            run([sys.executable, '-I', 'src/admin.py', 'merge', rev_JR], wt)
            assert not run(['git', 'diff', '--name-only', '--diff-filter=U'], wt).stdout.strip()
            run([sys.executable, '-I', 'src/admin.py', 'srccheck', '--staged'], wt)
            run(['git', 'merge', '--abort'], wt)
            print('T5a ok: C2 admin.py merge auto-resolved index.html and staged')

            pm5b = run([sys.executable, '-I', 'src/admin.py', 'merge', rev_JC], wt, check=False)
            assert pm5b.returncode != 0 and 'src/js/07_gfx.js' in pm5b.stdout, (pm5b.returncode, pm5b.stdout)
            run(['git', 'merge', '--abort'], wt)
            print('T5b ok: C2 stopped on real JS conflict')

            print('ALL SHIP_CFG_SPLIT TESTS PASSED')
        finally:
            run(['git', '-C', str(ROOT), 'worktree', 'remove', '--force', str(wt)], ROOT, check=False)


if __name__ == '__main__':
    main()

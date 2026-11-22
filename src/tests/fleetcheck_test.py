"""fleetcheck's per-ship comparison (FAR-87): admin.fleet_diff on hand-made shipcheck results. No Chrome, no build.
python -I src/tests/fleetcheck_test.py
  1 the same result twice: nothing more, less or changed.
  2 a new error and a fixed warning: one more, one less; the report lines for them.
  3 the same issue with a new message or fix: changed, not more.
  4 the same key twice (two falls grouped by role): pairs in order, the extra one is more.
  5 the ship-select card: only the fields that differ.
"""
import importlib.util, sys
from pathlib import Path
SRC = Path(__file__).resolve().parents[1]


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def issue(lv, what, where, msg='m', fix='f'):
    return {'lv': lv, 'what': what, 'where': where, 'msg': msg, 'fix': fix}


def main():
    admin = module(SRC / 'admin.py', 'admin')
    diff = admin.fleet_diff
    card = {'tons': 10, 'len': 12.6, 'guns': 4, 'gunTypes': {'pierrier': 4}, 'volley': 4, 'drive': 'sail', 'sails': 2, 'crew': 67}
    A = {'issues': [issue('warn', 'geo', '設定檔'), issue('error', '取用點', '甲板')], 'card': card}

    D = diff(A, A)
    assert D == {'more': [], 'less': [], 'changed': [], 'card': []}, D

    B = {'issues': [issue('error', '開場就掉', 'nav/抽水機-1'), issue('error', '取用點', '甲板')], 'card': card}
    D = diff(A, B)
    assert [i['what'] for i in D['more']] == ['開場就掉'] and [i['what'] for i in D['less']] == ['geo'] and not D['changed'], D
    L = admin.fleet_lines(D)                                            # the report lines: one ➕ with its fix, one ➖
    assert L[0].startswith('- ➕ ✗ 開場就掉') and '修法：f' in L[0] and L[1].startswith('- ➖ ⚠ geo'), L

    C = {'issues': [issue('warn', 'geo', '設定檔', msg='m2'), issue('error', '取用點', '甲板', fix='f2')], 'card': card}
    D = diff(A, C)
    assert not D['more'] and not D['less'] and len(D['changed']) == 2, D

    E = {'issues': [issue('error', '開場就摔', '砲手', msg='2 人')], 'card': card}
    F = {'issues': [issue('error', '開場就摔', '砲手', msg='3 人'), issue('error', '開場就摔', '砲手', msg='1 人')], 'card': card}
    D = diff(E, F)
    assert len(D['changed']) == 1 and D['changed'][0][1]['msg'] == '3 人' and [i['msg'] for i in D['more']] == ['1 人'] and not D['less'], D
    D = diff(F, E)
    assert [i['msg'] for i in D['less']] == ['1 人'] and not D['more'], D

    G = {'issues': A['issues'], 'card': dict(card, crew=68, gunTypes={'pierrier': 3, '4l': 1})}
    D = diff(A, G)
    assert D['card'] == [('gunTypes', {'pierrier': 4}, {'pierrier': 3, '4l': 1}), ('crew', 67, 68)] and not D['more'], D
    assert diff({'issues': []}, {'issues': []})['card'] == []           # an older product without a card
    print('fleetcheck_test: 5 cases ok')


if __name__ == '__main__':
    main()

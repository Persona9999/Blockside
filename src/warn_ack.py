"""自檢的「確認不修」（Blocksail TASK-1351；Tim 2026-11-21「如果是不需要修復的 希望有工具可以關閉警告(避免下次還要再判斷一次) 可以通用這個規則到目前的自檢流程(包含船的匯入 城鎮等)」）
  看到 ⚠ 只有兩條路：修掉，或寫理由確認掉（python -I src/admin.py warnack --add <key> --by <誰> --note <為什麼不用修>）—— ⛔ 不放著不管
  確認表 src/config/warn_ack.json（進 repo）：{ fmt: 1, acks: { key: { note, by, at, msgs: { sig: 當時的訊息 } } } }
  ・key ＝ 檢查：對象：訊息把數字換成 # 之後的指紋（6 碼）⇒ 數字變了 key 不變；sig ＝ 訊息全文的指紋（數字四捨五入到 2 位有效數字）⇒ 內容變了確認就失效、照樣報並附上當時的內容（198 ⇒ 197 不算變）
  ・這一次有檢查到的對象裡，確認了卻沒再出現的 ⇒「過期的確認」（warnack --clear <key>）
  ・這一次的 ⚠ 寫進 reports/warn_last.json（不入版控；--add 照它取內容，不用手抄）
  算法跟 Blocksail 的 world/warn_ack.js 同一套（FNV-1a 32 位元、UTF-8）；兩個 repo 各一份確認表
"""
import datetime, json, math, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.join(HERE, 'config', 'warn_ack.json')
LAST = os.path.normpath(os.path.join(HERE, '..', 'reports', 'warn_last.json'))


def fnv(s):
    h = 0x811c9dc5
    for b in str(s).encode('utf-8'):
        h = ((h ^ b) * 0x01000193) & 0xffffffff
    return '%08x' % h


def norm(msg): return re.sub(r'\d+(?:\.\d+)?', '#', str(msg))
def key(check, subject, msg): return '%s:%s:%s' % (check, subject, fnv(norm(msg))[:6])


def sig2(msg):
    """sig 用的數字：四捨五入到 2 位有效數字（同 Blocksail world/warn_ack.js sig2；不用 round()：Python 的 round 是銀行家捨入）"""
    def f(mo):
        v = float(mo.group(0))
        if not v > 0:
            return '0'
        e = math.floor(math.log10(v)); m = math.floor(v / 10 ** (e - 1) + 0.5)
        if m >= 100:
            m = math.floor(m / 10 + 0.5); e += 1
        return '%de%d' % (m, e - 1)
    return re.sub(r'\d+(?:\.\d+)?', f, str(msg))


def _read(p, dflt):
    try:
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return dflt


def table():
    t = _read(TABLE, {'fmt': 1, 'acks': {}})
    if t.get('fmt') != 1 or not isinstance(t.get('acks'), dict):
        raise ValueError(TABLE + ' 格式不對（要 { fmt: 1, acks: {…} }）')
    return t


def write_table(t):
    with open(TABLE, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps({'fmt': 1, 'acks': {k: t['acks'][k] for k in sorted(t['acks'])}}, ensure_ascii=False, indent=1) + '\n')


class Run:
    """一支檢查跑一次：cover(對象)、see(對象, 訊息) ⇒ dict(key, sig, state 'new'｜'acked'｜'changed', ack, line)、mark(對象, 一行字)、finish() ⇒ 收尾要印的幾行"""
    def __init__(s, check, t=None):
        s.check, s.acks = check, (t or table())['acks']
        s.covered, s.all, s.used, s.seen = set(), False, set(), {}
        s.acked = s.changed = s.fresh = 0

    def cover(s, subject): s.covered.add(subject)
    def cover_all(s): s.all = True
    def is_covered(s, subject): return s.all or subject in s.covered

    def see(s, subject, msg):
        s.covered.add(subject)
        k, sig, a = key(s.check, subject, msg), fnv(sig2(msg)), None
        a = s.acks.get(k)
        s.seen.setdefault(k, {'check': s.check, 'subject': subject, 'msgs': {}})['msgs'][sig] = str(msg)
        if a and sig in a.get('msgs', {}):
            st = 'acked'; s.used.add((k, sig)); s.acked += 1
        elif a:
            st = 'changed'; s.changed += 1
        else:
            st = 'new'; s.fresh += 1
        line = None
        if st != 'acked':
            line = '⚠ [%s] %s' % (k, msg)
            if st == 'changed':
                line += '（確認過、但內容變了：當時「%s」——%s）' % ('」「'.join(a['msgs'].values()), a.get('note', ''))
        return {'key': k, 'sig': sig, 'state': st, 'ack': a, 'line': line}

    def mark(s, subject, text):
        """一行讀數裡夾著 ⚠：新的、變了的 ⇒ ⚠ 後面加 [key]；確認過的 ⇒ ⚠ 換成「（已確認不修）」"""
        text = str(text)
        if '⚠' not in text:
            return text
        q = s.see(subject, re.sub(r'^[\s\-*>|·]+', '', text))
        if q['state'] == 'acked':
            return re.sub(r'⚠\s*', '（已確認不修）', text)
        return text.replace('⚠', '⚠ [%s]' % q['key'], 1) + ('（確認過、但內容變了：當時「%s」）' % '」「'.join(q['ack']['msgs'].values()) if q['state'] == 'changed' else '')

    def stale(s):
        out = []
        for k, a in s.acks.items():
            p = k.split(':')
            if p[0] != s.check or not s.is_covered(':'.join(p[1:-1])):
                continue
            if k in s.seen and not any(x in a.get('msgs', {}) for x in s.seen[k]['msgs']):
                continue                                                 # 這一次有出現、只是內容變了 ⇒ 已經照「內容變了」報過，不再算過期
            for sig, m in a.get('msgs', {}).items():
                if (k, sig) not in s.used and sig not in s.seen.get(k, {}).get('msgs', {}):
                    out.append((k, sig, m))
        return out

    def finish(s):
        L = _read(LAST, {})
        for k in list(L):
            p = k.split(':')
            if p[0] == s.check and s.is_covered(':'.join(p[1:-1])):
                del L[k]
        L.update(s.seen)
        try:
            os.makedirs(os.path.dirname(LAST), exist_ok=True)
            with open(LAST, 'w', encoding='utf-8', newline='\n') as f:
                f.write(json.dumps({k: L[k] for k in sorted(L)}, ensure_ascii=False, indent=1) + '\n')
        except OSError:
            pass                                                         # 寫不了只是 --add 少了內容可取，不擋自檢
        out, st = [], s.stale()
        if s.acked:
            out.append('· 已確認不修 %d 條（src/config/warn_ack.json；python -I src/admin.py warnack --list --check %s 看理由）' % (s.acked, s.check))
        if st:
            out.append('⚠ 過期的確認 %d 條（確認了、這一次沒再出現 ⇒ 清掉：python -I src/admin.py warnack --clear <key>）：' % len(st) + '；'.join('%s「%s」' % (k, m) for k, _, m in st))
        return out


def cli(o):
    """admin.py warnack：--last／--list [--check]、--add <key> --by --note [--sig]、--clear <key> [--sig]"""
    t, last, log = table(), _read(LAST, {}), []
    inc = lambda k: not o.check or k.split(':')[0] == o.check
    if o.add:
        if not o.by or not o.note:
            raise ValueError('要 --by <誰> --note <為什麼不用修>')
        e = last.get(o.add)
        if not e:
            raise ValueError('上一次沒跑出 [%s]（先跑那一支自檢；warnack --last 看有哪些）' % o.add)
        sigs = [o.sig] if o.sig else list(e['msgs'])
        if any(x not in e['msgs'] for x in sigs):
            raise ValueError('[%s] 上一次沒有 sig %s' % (o.add, o.sig))
        A = t['acks'].setdefault(o.add, {'note': '', 'by': '', 'at': '', 'msgs': {}})
        A.update(note=o.note, by=o.by, at=datetime.date.today().isoformat())
        for x in sigs:
            A['msgs'][x] = e['msgs'][x]
        A['msgs'] = {x: A['msgs'][x] for x in sorted(A['msgs'])}
        write_table(t)
        return ['✓ 確認不修 [%s]：%s —— %s（%s）' % (o.add, ''.join('「%s」' % e['msgs'][x] for x in sigs), o.note, o.by)]
    if o.clear:
        A = t['acks'].get(o.clear)
        if not A:
            raise ValueError('確認表沒有 [%s]' % o.clear)
        if o.sig:
            if o.sig not in A['msgs']:
                raise ValueError('[%s] 沒有 sig %s' % (o.clear, o.sig))
            del A['msgs'][o.sig]
            if not A['msgs']:
                del t['acks'][o.clear]
        else:
            del t['acks'][o.clear]
        write_table(t)
        return ['✓ 拿掉 [%s]%s' % (o.clear, ' sig ' + o.sig if o.sig else '')]
    if o.last:
        for k in sorted(x for x in last if inc(x)):
            for x, m in last[k]['msgs'].items():
                log.append('%s[%s] %s　sig %s' % ('· 已確認 ' if x in t['acks'].get(k, {}).get('msgs', {}) else '⚠ ', k, m, x))
        return log or ['（上一次沒有 ⚠）']
    for k in sorted(x for x in t['acks'] if inc(x)):
        A = t['acks'][k]
        log.append('[%s] %s（%s，%s）' % (k, A['note'], A['by'], A['at']))
        log += ['    「%s」 sig %s' % (m, x) for x, m in A['msgs'].items()]
    return log or ['（確認表是空的）']

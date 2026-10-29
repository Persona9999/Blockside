// 循環布的預烘（TASK-1102；Tim 2026-10-29「那就預烘焙吧」）：把 js/11_rig_loop.js 裡「烘」那一段（兩行標記中間）原樣拿到 Node 跑 ⇒ ships/flagloop.js。
//   跟遊戲裡備援的 Worker 烘的是同一份程式碼 ⇒ 結果一樣。解算器的常數照 js/63_towns.js（TOWN_FLAG_DRAG、TOWN_FLAG_IT）。
//   檔：跟船檔同一個載法（<script>；成品不准 fetch）⇒ window.BS_FLOOP ＝ { fp, b64 }，b64 ＝ deflate-raw（ 'FLP1'、檔頭長度 u32、檔頭 JSON（補到偶數長）、int16 × FLOOP_W × FLOOP_ROWS × 3 ）。int16 ＝ 位置 × k 四捨五入（k ＝ 32767 ÷ 最大的絕對值），
//   每一檔的第 0 格照存、之後每格存跟上一格的差（壓得比較小）。檔頭：版面（W、ROWS、NF、風速各檔、旗形）、k、指紋 fp、每一種旗形每一檔的讀數 stat。
//   指紋 ＝ 「烘」那一段＋兩個常數的 sha1 前 16 碼：跟檔裡的一樣 ⇒ 不重烘（zlib 換版會換位元組，指紋不會）。
//   用法：node src/flagloop_bake.cjs [輸出檔（預設 <Blockside>/ships/flagloop.js）] [--force]；admin.py build、build --code 最後會叫（flagloop_ensure）。
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto'), vm = require('vm');
const HERE = __dirname, A = '// ── 烘：src/flagloop_bake.cjs', B = '// ── 烘：到這裡 ──';
const src = fs.readFileSync(path.join(HERE, 'js', '11_rig_loop.js'), 'utf8'), towns = fs.readFileSync(path.join(HERE, 'js', '63_towns.js'), 'utf8');
const a = src.indexOf(A), b = src.indexOf(B);
if (a < 0 || b < a) { console.error('js/11_rig_loop.js 找不到「烘」那一段的標記'); process.exit(2); }
const sec = src.slice(a, b);
const num = (name) => { const m = towns.match(new RegExp('\\b' + name + '\\s*=\\s*([0-9.]+)')); if (!m) { console.error('js/63_towns.js 找不到 ' + name); process.exit(2); } return +m[1]; };
const DRAG = num('TOWN_FLAG_DRAG'), IT = num('TOWN_FLAG_IT');
const fp = crypto.createHash('sha1').update(sec + '\n' + DRAG + '\n' + IT).digest('hex').slice(0, 16);
const args = process.argv.slice(2), out = args.find((x) => !x.startsWith('--')) || path.join(HERE, '..', 'ships', 'flagloop.js'), force = args.includes('--force');
function header(f) {
  try { const m = fs.readFileSync(f, 'utf8').match(/fp: '([0-9a-f]+)'/); return m ? { fp: m[1] } : null; } catch (e) { return null; }
}
const old = fs.existsSync(out) ? header(out) : null;
if (!force && old && old.fp === fp) { console.log('✓ 循環布的預烘 ' + path.basename(out) + ' 是最新的（指紋 ' + fp + '）'); process.exit(0); }
const ctx = vm.createContext({ TOWN_FLAG_DRAG: DRAG, TOWN_FLAG_IT: IT });
vm.runInContext(sec + '\nvar FLOOP = { job: null, stat: [], data: new Float32Array(FLOOP_W * FLOOP_ROWS * 3) };\nfunction floopUpload() {}\n', ctx);
const t0 = Date.now();
vm.runInContext('while (floopWork()) {}', ctx);
const ms = Date.now() - t0, C = vm.runInContext('({ W: FLOOP_W, ROWS: FLOOP_ROWS, NF: FLOOP_NF, bands: FLOOP_BANDS, shapes: FLOOP_SHAPES, data: FLOOP.data, stat: FLOOP.stat })', ctx);
const D = C.data, RW = C.W * 3;
let mx = 0; for (let i = 0; i < D.length; i++) mx = Math.max(mx, Math.abs(D[i]));
const k = 32767 / mx, q = new Int16Array(D.length), Q = new Int32Array(D.length);
for (let i = 0; i < D.length; i++) Q[i] = Math.round(D[i] * k);
for (let r = 0; r < C.ROWS; r++) for (let i = 0; i < RW; i++) {
  const o = r * RW + i, d = r % C.NF === 0 ? Q[o] : Q[o] - Q[o - RW];
  if (d < -32768 || d > 32767) { console.error('第 ' + r + ' 列跟上一格差太多，int16 裝不下'); process.exit(3); }
  q[o] = d;
}
let hj = JSON.stringify({ fp: fp, W: C.W, ROWS: C.ROWS, NF: C.NF, bands: C.bands, shapes: C.shapes, k: k, stat: C.stat, ms: ms });
if (Buffer.byteLength(hj) % 2) hj += ' ';
const hb = Buffer.from(hj, 'utf8'), head = Buffer.alloc(8); head.write('FLP1', 0, 'latin1'); head.writeUInt32LE(hb.length, 4);
const raw = Buffer.concat([head, hb, Buffer.from(q.buffer)]), gz = zlib.deflateRawSync(raw, { level: 9 }), b64 = gz.toString('base64');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ['// 循環布（TASK-1102）預烘：src/flagloop_bake.cjs 寫的，別手改（js/11_rig_loop.js floopNeed 載）', 'window.BS_FLOOP = ' + JSON.stringify({ fp: fp, b64: b64 }).replace('{"fp":"', "{ fp: '").replace('","b64":"', "', b64: '").replace('"}', "' }") + ';', ''].join('\n'));
const ok = C.stat.filter((s) => !s.fail && !s.ptBad).length;
console.log('✓ 循環布重烘 ' + path.basename(out) + '：' + (b64.length / 1048576).toFixed(2) + ' MB（deflate ' + (gz.length / 1048576).toFixed(2) + ' MB、未壓 ' + (raw.length / 1048576).toFixed(2) + ' MB）、' + ms + ' ms、' + ok + '／' + C.stat.length + ' 組收斂且接縫逐點不超過、量化誤差 ≤ ' + (0.5 / k * 1000).toFixed(2) + ' mm（指紋 ' + fp + '）');
if (ok < C.stat.length) C.stat.filter((s) => s.fail || s.ptBad).forEach((s) => console.log('  ⚠ ' + s.k + ' ' + s.ws + ' m/s：' + (s.fail ? '收斂不了 ' : '') + (s.ptBad ? '接縫逐點超過 ' + s.ptBad + ' 點' : '')));

/* 网表验证：10 位经典编制 + 四则编译 + 32 位加法 */
import {
  buildNetlist, tryBuildNetlist, runNetlist, readResult,
  parseProgram, DEFAULT_EXPR,
} from './netlist-bundle.mjs';
import { evalExpr, zeroDivisorReason, MAX_OPS } from './netlist-bundle.mjs';

function assert(cond, msg) {
  if (!cond) { console.error('断言失败:', msg); process.exit(1); }
}

function checkProgram(expr, bits, cases, expectTotal) {
  const built = tryBuildNetlist(expr, bits);
  assert(built.ok, built.ok ? '' : `${expr} ${bits}位: ${built.error}`);
  const nl = built.netlist;
  const parsed = parseProgram(expr);
  assert(parsed.ok, parsed.ok ? '' : parsed.error);
  if (expectTotal != null) assert(nl.stats.total === expectTotal, `${expr} 门数 ${nl.stats.total} ≠ ${expectTotal}`);
  let fail = 0;
  for (const [A, B, C] of cases) {
    if (zeroDivisorReason(parsed.ast, BigInt(A), BigInt(B), BigInt(C), bits)) continue;
    const got = readResult(nl, runNetlist(nl, A, B, C));
    const want = evalExpr(parsed.ast, BigInt(A), BigInt(B), BigInt(C), bits);
    if (got !== want) {
      fail++;
      console.error(`FAIL ${expr} ${bits}bit (${A},${B},${C}): got ${got}, want ${want}`);
    }
  }
  assert(fail === 0, `${expr} @${bits} 功能失败 ${fail}`);
  console.log(`  ${expr} ${bits}位: ${nl.gates.length} 门 / ${nl.maxLayer} 拍 / ${nl.outBits.length} 位输出  ✓ ${cases.length} 组`);
  return nl;
}

console.log('=== 经典 10 位 (A+B)*C ===');
const nl = buildNetlist();
console.log('总门数:', nl.stats.total, '(预期 932)');
console.log('分区:', JSON.stringify(nl.stats));
console.log('最大层数:', nl.maxLayer);

const ids = nl.gates.map(g => g.id).sort((a, b) => a - b);
assert(new Set(ids).size === ids.length, '门牌号重复');
const seg = (lo, hi) => ids.filter(i => i >= lo && i <= hi).length;
const accCount = seg(401, 900) + seg(922, 1141);
console.log('号段: 输入', seg(1, 30), '| 加法', seg(101, 150), '| 部分积', seg(201, 310), '| 累加', accCount, '| 输出', seg(901, 921), '| DONE', seg(0, 0));
assert(accCount === 720, '累加陣人数不对');

let topoOk = true;
for (const g of nl.gates) {
  for (const up of [g.inA, g.inB]) {
    if (up !== null && !(nl.byId.get(up).layer < g.layer)) { topoOk = false; console.error('拓扑违例', g, up); }
  }
}
assert(topoOk, '拓扑');

const inRect = (g, x0, x1, z0, z1) => g.pos[0] >= x0 - 0.6 && g.pos[0] <= x1 + 0.6 && g.pos[1] >= z0 - 0.6 && g.pos[1] <= z1 + 0.6;
let posOk = true;
for (const g of nl.gates) {
  const ok =
    g.zone === 'A' ? inRect(g, -20, -11, 17, 17) :
    g.zone === 'B' ? inRect(g, -20, -11, 19, 19) :
    g.zone === 'C' ? inRect(g, -24, -24, 6, 15) :
    g.zone === 'ADDER' ? inRect(g, -16, -4, 2, 14) :
    g.zone === 'PP' ? inRect(g, -2, 24, 6, 13) :
    g.zone === 'ACC' ? inRect(g, -2, 24, -14, 4) :
    g.zone === 'OUT' ? inRect(g, 2, 22, -17, -17) : true;
  if (!ok) { posOk = false; console.error('越界:', g.zone, g.id, g.pos); }
}
assert(posOk, '阵型坐标');
assert(nl.stats.total === 932, '932 门');

const cases = [[1013, 1012, 1001], [0, 0, 0], [1023, 1023, 1023], [1, 0, 0], [0, 0, 1], [1023, 0, 1023], [7, 5, 3]];
let rnd = 12345;
const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) % 1024;
for (let i = 0; i < 200; i++) cases.push([rand(), rand(), rand()]);
checkProgram(DEFAULT_EXPR, 10, cases, 932);
const demo = readResult(nl, runNetlist(nl, 1013, 1012, 1001));
assert(demo === 2027025n, `示例应为 2027025，得到 ${demo}`);
console.log('示例: (1013+1012)×1001 =', demo.toString());

console.log('=== 10 位四则 ===');
checkProgram('A+B', 10, [[0, 0, 0], [1, 2, 0], [1023, 1, 0], [500, 500, 9]], null);
checkProgram('A-B', 10, [[5, 3, 0], [5, 7, 0], [0, 1, 0], [1023, 1, 0]], null);
checkProgram('A*B', 10, [[0, 9, 0], [3, 5, 0], [1023, 2, 0], [7, 8, 1]], null);
checkProgram('A/B', 10, [[10, 3, 0], [1, 1, 0], [1023, 2, 0], [8, 0, 1]], null);

console.log('=== 解析约束 ===');
assert(!parseProgram('A+B+C+A+B').ok, '应拒绝 4 个运算');
assert(parseProgram('A+B+C+A').ok, '3 个运算四操作数应通过');
assert(!parseProgram('').ok, '应拒绝空式');
assert(!tryBuildNetlist('A*B*C', 32).ok, '应拒绝超宽输出');
assert(!tryBuildNetlist('A*B*C*A', 32).ok, '应拒绝超宽输出或过多运算');
assert(parseProgram('A+B+C').ok && parseProgram('A+B+C').ops <= MAX_OPS, '3 运算应通过');
const z = zeroDivisorReason(parseProgram('A/B').ast, 10n, 0n, 1n, 10);
assert(z, 'B=0 应被除零检查抓住');
assert(!tryBuildNetlist('A++B', 10).ok, '应拒绝非法式子');

console.log('=== 32 位加法 / 乘法抽检 ===');
checkProgram('A+B', 32, [[0, 0, 0], [1, 2, 0], [0xFFFFFFFF, 1, 0], [1013, 1012, 1001]], null);
checkProgram('A*B', 32, [[3, 5, 0], [1000, 1000, 0], [7, 8, 1]], null);
checkProgram('A/B', 32, [[10, 3, 0], [100, 7, 0]], null);
checkProgram('(A+B)*C', 32, [[3, 5, 2], [10, 20, 3]], null);

console.log('全部通过 ✓');

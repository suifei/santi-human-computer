/* 网表正确性验证：runNetlist 结果必须等于 (A+B)*C */
import { buildNetlist, runNetlist, readResult, evalGate } from './netlist-bundle.mjs';

const nl = buildNetlist();
console.log('=== 网表统计 ===');
console.log('总门数:', nl.stats.total, '(预期 932)');
console.log('分区:', JSON.stringify(nl.stats));
console.log('最大层数(总拍数 M):', nl.maxLayer);

// 门牌号段检查
const ids = nl.gates.map(g => g.id).sort((a, b) => a - b);
const uniq = new Set(ids);
console.assert(uniq.size === ids.length, '门牌号重复!');
const seg = (lo, hi) => ids.filter(i => i >= lo && i <= hi).length;
const accCount = seg(401, 900) + seg(922, 1141); // ACC 跳过 901–921（避让输出手号段）
console.log('号段: 输入', seg(1, 30), '| 加法', seg(101, 150), '| 部分积', seg(201, 310), '| 累加', accCount, '| 输出', seg(901, 921), '| DONE', seg(0, 0));
console.assert(accCount === 720, '累加陣人数不对');

// 拓扑合法性：门层号必须严格大于其上游层号
let topoOk = true;
for (const g of nl.gates) {
  for (const up of [g.inA, g.inB]) {
    if (up !== null && !(nl.byId.get(up).layer < g.layer)) { topoOk = false; console.error('拓扑违例', g, up); }
  }
}
console.log('拓扑排序合法:', topoOk);

// 坐标范围检查（阵型分区矩形）
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
console.log('阵型坐标合法:', posOk);

// 功能验证：默认示例 + 边界 + 随机
const cases = [[1013, 1012, 1001], [0, 0, 0], [1023, 1023, 1023], [1, 0, 0], [0, 0, 1], [1023, 0, 1023], [7, 5, 3]];
let rnd = 12345;
const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) % 1024;
for (let i = 0; i < 200; i++) cases.push([rand(), rand(), rand()]);

let fail = 0;
for (const [A, B, C] of cases) {
  const v = runNetlist(nl, A, B, C);
  const got = readResult(nl, v);
  const want = (A + B) * C;
  if (got !== want) { fail++; console.error(`FAIL (${A}+${B})*${C}: got ${got}, want ${want}`); }
}
console.log(`功能验证: ${cases.length - fail}/${cases.length} 通过`);
console.log(`示例: (1013+1012)×1001 = ${readResult(nl, runNetlist(nl, 1013, 1012, 1001))} (预期 2027025)`);
if (fail || !topoOk || !posOk || nl.stats.total !== 932) { console.error('验证失败'); process.exit(1); }
console.log('全部通过 ✓');

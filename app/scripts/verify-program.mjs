/* 程序模式：固定 CPU 人海 + 门级微操作金标 */
import { parseLang, runProgramHeadless, buildCpuNetlist, cpuUntilLayer } from './program-bundle.mjs';
import { tryBuildNetlist, runNetlist, readResult } from './program-bundle.mjs';

function assert(cond, msg) {
  if (!cond) { console.error('断言失败:', msg); process.exit(1); }
}

console.log('=== 解析 ===');
assert(parseLang('R0 = (A+B)*C').ok, '经典程序应通过');
assert(!parseLang('').ok, '空程序应拒绝');
assert(!parseLang('X = 1').ok, '非寄存器赋值应拒绝');
assert(parseLang('R0 = 0\nR1 = B\nwhile R1 {\n  R0 = R0 + A\n  R1 = R1 - 1\n}').ok, '累加乘法应通过');
const badNest = parseLang('while A { while B { if C { if A { R0 = 0 } } } }');
assert(!badNest.ok, '过深嵌套应拒绝');

console.log('=== 固定数据通路（该在的都在）===');
const cpu = buildCpuNetlist(10);
assert(cpu.cpu, '应有 CPU 布局');
assert(cpu.gates.length > 1500, `10 位全员应远大于加法阵，得到 ${cpu.gates.length}`);
assert(cpu.stats.adder > 0 && cpu.stats.pp > 0 && cpu.stats.div > 0, '加减乘除都应列阵');
assert(buildCpuNetlist(10) === cpu, '应缓存同一张人海');
assert(cpuUntilLayer(cpu, 'add') < cpuUntilLayer(cpu, 'div'), '加法拍数应短于除法');
assert(cpuUntilLayer(cpu, 'add') < cpu.maxLayer, '加法不应等整张除法深度');
console.log('  10 位 CPU', cpu.gates.length, '门 · 加', cpuUntilLayer(cpu, 'add'), '拍 · 乘', cpuUntilLayer(cpu, 'mul'), '拍 · 除', cpuUntilLayer(cpu, 'div'), '拍');
assert(cpu.bounds.maxX - cpu.bounds.minX < 45, `10 位军团应横向贴紧，跨度 ${cpu.bounds.maxX - cpu.bounds.minX}`);

console.log('=== 经典 R0=(A+B)*C 必须等于网表 ===');
const classic = runProgramHeadless('R0 = (A+B)*C\n', 10, { A: 1013, B: 1012, C: 1001 });
assert(classic.ok, classic.ok ? '' : classic.error);
assert(classic.regs[0] === 2027025n, `R0 应为 2027025，得到 ${classic.ok ? classic.regs[0] : '?'}`);
assert(classic.rounds === 2, `乘加应为加然后乘两轮，得到 ${classic.ok ? classic.rounds : '?'}`);
assert(classic.gates === cpu.gates.length, '程序应使用全员 CPU 人海');
const nl = tryBuildNetlist('(A+B)*C', 10);
assert(nl.ok, '经典网表');
const direct = readResult(nl.netlist, runNetlist(nl.netlist, 1013, 1012, 1001));
assert(classic.regs[0] === direct, '程序结果必须等于同一张网表');
console.log('  R0 =', classic.regs[0].toString(), '·', classic.rounds, '轮 ·', classic.gates, '门');

console.log('=== 累加乘法（人列加法阵循环，人海不换）===');
const mul = runProgramHeadless(
  'R0 = 0\nR1 = B\nwhile R1 {\n  R0 = R0 + A\n  R1 = R1 - 1\n}\n',
  10,
  { A: 7, B: 5, C: 0 },
);
assert(mul.ok, mul.ok ? '' : mul.error);
assert(mul.regs[0] === 35n, `7×5 累加应为 35，得到 ${mul.ok ? mul.regs[0] : '?'}`);
assert(mul.regs[1] === 0n, 'R1 应倒数到 0');
assert(mul.rounds > 5, '应有多轮人列战役');
assert(mul.gates === cpu.gates.length, '循环也不换阵');
console.log('  7×5 =', mul.regs[0].toString(), '·', mul.rounds, '轮 ·', mul.gates, '门');

console.log('=== if / 比较阵 ===');
const iff = runProgramHeadless(
  'if A {\n  R0 = B\n} else {\n  R0 = C\n}\n',
  10,
  { A: 3, B: 8, C: 9 },
);
assert(iff.ok && iff.regs[0] === 8n, `A≠0 应取 B=8，得到 ${iff.ok ? iff.regs[0] : iff.error}`);
const iff0 = runProgramHeadless(
  'if A {\n  R0 = B\n} else {\n  R0 = C\n}\n',
  10,
  { A: 0, B: 8, C: 9 },
);
assert(iff0.ok && iff0.regs[0] === 9n, `A=0 应取 C=9，得到 ${iff0.ok ? iff0.regs[0] : iff0.error}`);
const lt = runProgramHeadless(
  'if A < B {\n  R0 = 1\n} else {\n  R0 = 0\n}\n',
  10,
  { A: 3, B: 5, C: 0 },
);
assert(lt.ok && lt.regs[0] === 1n, `3<5 应为 1，得到 ${lt.ok ? lt.regs[0] : lt.error}`);

console.log('=== 停机 / 除零 ===');
const loop = runProgramHeadless('R0 = 1\nwhile R0 {\n  R0 = 1\n}\n', 10, { A: 1, B: 1, C: 1 });
assert(!loop.ok, '死循环应停机');
const div0 = runProgramHeadless('R0 = A / B\n', 10, { A: 8, B: 0, C: 1 });
assert(!div0.ok, '除零应拒绝');

console.log('全部通过 ✓');

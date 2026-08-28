/**
 * 程序解释器：固定一张 CPU 人海，赋值/判断降成二输入微操作。
 * JS 只选部件、注入总线；真值仍由士兵翻旗算出。
 */
import {
  buildCpuNetlist, cpuUntilLayer, injectCpu, readCpuResult, runCpuOp,
  type BitWidth, type CpuOp, type Netlist,
} from './netlist';
import {
  MAX_CAMPAIGNS, REG_COUNT, SCRATCH_COUNT, inputMaxBig, operandKey,
  type BinOp, type Operand, type ValExpr,
} from './program';
import { parseLang, type Cond, type Stmt } from './lang';

export { parseLang } from './lang';
export { tryBuildNetlist, runNetlist, readResult, buildCpuNetlist, cpuUntilLayer } from './netlist';

export type Dest = { k: 'reg'; i: number } | { k: 'scratch'; i: number };

export type Campaign = {
  line: number;
  label: string;
  netlist: Netlist;
  inject: { A: bigint; B: bigint; C: bigint; aluA: bigint; aluB: bigint; inv: boolean };
  op: CpuOp;
  after: 'assign' | 'test';
  dest?: Dest;
  untilLayer: number;
};

type Micro = {
  op: CpuOp;
  left: Operand;
  right: Operand;
  dest: Dest;
  inv: boolean;
  line: number;
  label: string;
  after: 'assign' | 'test';
};

type Frame =
  | { t: 'seq'; list: Stmt[]; i: number }
  | { t: 'while'; node: Extract<Stmt, { k: 'while' }>; phase: 'test' | 'body'; trips: number };

type AfterTest =
  | { k: 'if'; then: Stmt[]; else: Stmt[] }
  | { k: 'while'; frame: Extract<Frame, { t: 'while' }> };

export type Vm = {
  bits: BitWidth;
  inputs: { A: bigint; B: bigint; C: bigint };
  regs: bigint[];
  scratch: bigint[];
  frames: Frame[];
  flag: boolean;
  rounds: number;
  srcLine: number;
  halted: boolean;
  error: string | null;
  afterTest: AfterTest | null;
  queue: Micro[];
  cpu: Netlist;
};

const OP_CN: Record<CpuOp, string> = {
  pass: '傳值', add: '加法陣', sub: '減法陣', mul: '乘法陣', div: '除法陣',
  nz: '非零', eq: '相等', lt: '比較',
};

function destLabel(d: Dest): string {
  return d.k === 'reg' ? `R${d.i}` : `暫存T${d.i}`;
}

function readOp(vm: Vm, o: Operand): bigint {
  if (o.k === 'in') return vm.inputs[o.name];
  if (o.k === 'reg') return vm.regs[o.i] ?? 0n;
  if (o.k === 'scratch') return vm.scratch[o.i] ?? 0n;
  return o.v;
}

function binToCpu(op: BinOp): CpuOp {
  if (op === '+') return 'add';
  if (op === '-') return 'sub';
  if (op === '*') return 'mul';
  return 'div';
}

function leafOf(e: ValExpr): Operand {
  if (e.k === 'bin') throw new Error('内部错误：期望叶子');
  return e;
}

function flattenVal(e: ValExpr, dest: Dest, line: number): Micro[] {
  if (e.k !== 'bin') {
    return [{
      op: 'pass', left: e, right: { k: 'const', v: 0n }, dest, inv: false, line, after: 'assign',
      label: `${destLabel(dest)} ← ${operandKey(e)}`,
    }];
  }
  const out: Micro[] = [];
  let L: Operand;
  let R: Operand;
  if (e.left.k === 'bin' && e.right.k === 'bin') {
    out.push(...flattenVal(e.left, { k: 'scratch', i: 0 }, line));
    out.push(...flattenVal(e.right, { k: 'scratch', i: 1 }, line));
    L = { k: 'scratch', i: 0 };
    R = { k: 'scratch', i: 1 };
  } else if (e.left.k === 'bin') {
    out.push(...flattenVal(e.left, { k: 'scratch', i: 0 }, line));
    L = { k: 'scratch', i: 0 };
    R = leafOf(e.right);
  } else if (e.right.k === 'bin') {
    out.push(...flattenVal(e.right, { k: 'scratch', i: 0 }, line));
    L = leafOf(e.left);
    R = { k: 'scratch', i: 0 };
  } else {
    L = leafOf(e.left);
    R = leafOf(e.right);
  }
  const op = binToCpu(e.op);
  out.push({
    op, left: L, right: R, dest, inv: false, line, after: 'assign',
    label: `${destLabel(dest)} ← ${OP_CN[op]}`,
  });
  return out;
}

type TestKind = 'nz' | 'eqz' | 'eq' | 'ne' | 'lt' | 'ge';

function testKind(cond: Cond, swap: { swap: boolean }): TestKind {
  if (cond.k === 'nz') return 'nz';
  if (cond.op === '==') return 'eq';
  if (cond.op === '!=') return 'ne';
  if (cond.op === '<') return 'lt';
  if (cond.op === '>=') return 'ge';
  if (cond.op === '>') { swap.swap = true; return 'lt'; }
  swap.swap = true;
  return 'ge';
}

function microForTest(cond: Cond, line: number): Micro {
  const swap = { swap: false };
  const kind = testKind(cond, swap);
  let op: CpuOp = 'nz';
  let inv = false;
  if (kind === 'nz' || kind === 'eqz') { op = 'nz'; inv = kind === 'eqz'; }
  else if (kind === 'eq' || kind === 'ne') { op = 'eq'; inv = kind === 'ne'; }
  else { op = 'lt'; inv = kind === 'ge'; }

  let left: Operand = { k: 'const', v: 0n };
  let right: Operand = { k: 'const', v: 0n };
  if (cond.k === 'nz') {
    left = cond.src;
  } else {
    left = swap.swap ? cond.right : cond.left;
    right = swap.swap ? cond.left : cond.right;
  }
  const label =
    cond.k === 'nz' ? `nz ${operandKey(cond.src)}` :
    `${operandKey(cond.left)} ${cond.op} ${operandKey(cond.right)}`;
  return { op, left, right, dest: { k: 'scratch', i: 0 }, inv, line, label, after: 'test' };
}

function instantiate(vm: Vm, m: Micro): Campaign | { error: string } {
  const aluA = readOp(vm, m.left);
  const aluB = readOp(vm, m.right);
  if (m.op === 'div' && aluB === 0n) return { error: '除數為 0，無法注入' };
  if (m.left.k === 'const' && m.left.v > inputMaxBig(vm.bits)) {
    return { error: `立即数 ${m.left.v} 超过 ${vm.bits} 位上限` };
  }
  if (m.right.k === 'const' && m.right.v > inputMaxBig(vm.bits)) {
    return { error: `立即数 ${m.right.v} 超过 ${vm.bits} 位上限` };
  }
  return {
    line: m.line,
    label: m.label,
    netlist: vm.cpu,
    inject: {
      A: vm.inputs.A, B: vm.inputs.B, C: vm.inputs.C,
      aluA, aluB, inv: m.inv,
    },
    op: m.op,
    after: m.after,
    dest: m.after === 'assign' ? m.dest : undefined,
    untilLayer: cpuUntilLayer(vm.cpu, m.op),
  };
}

export function createVm(stmts: Stmt[], bits: BitWidth, inputs: { A: number; B: number; C: number }): Vm {
  return {
    bits,
    inputs: { A: BigInt(inputs.A), B: BigInt(inputs.B), C: BigInt(inputs.C) },
    regs: Array.from({ length: REG_COUNT }, () => 0n),
    scratch: Array.from({ length: SCRATCH_COUNT }, () => 0n),
    frames: [{ t: 'seq', list: stmts, i: 0 }],
    flag: false,
    rounds: 0,
    srcLine: stmts[0]?.line ?? 1,
    halted: false,
    error: null,
    afterTest: null,
    queue: [],
    cpu: buildCpuNetlist(bits),
  };
}

export function nextCampaign(vm: Vm): Campaign | { halt: true } | { error: string } {
  if (vm.halted) return { halt: true };
  if (vm.rounds >= MAX_CAMPAIGNS) {
    vm.halted = true;
    vm.error = `超过 ${MAX_CAMPAIGNS} 轮人列战役，已停机`;
    return { error: vm.error };
  }
  for (let guard = 0; guard < 64; guard++) {
    if (vm.queue.length) {
      const m = vm.queue.shift()!;
      vm.srcLine = m.line;
      const c = instantiate(vm, m);
      if ('error' in c) { vm.halted = true; vm.error = c.error; return c; }
      return c;
    }
    if (!vm.frames.length) {
      vm.halted = true;
      return { halt: true };
    }
    const top = vm.frames[vm.frames.length - 1]!;
    if (top.t === 'seq') {
      if (top.i >= top.list.length) {
        vm.frames.pop();
        continue;
      }
      const s = top.list[top.i]!;
      vm.srcLine = s.line;
      top.i += 1;
      if (s.k === 'assign') {
        vm.queue.push(...flattenVal(s.rhs, { k: 'reg', i: s.dest }, s.line));
        continue;
      }
      if (s.k === 'if') {
        vm.afterTest = { k: 'if', then: s.then, else: s.else };
        vm.queue.push(microForTest(s.cond, s.line));
        continue;
      }
      vm.frames.push({ t: 'while', node: s, phase: 'test', trips: 0 });
      continue;
    }
    if (top.phase === 'test') {
      if (top.trips >= MAX_CAMPAIGNS) {
        vm.halted = true;
        vm.error = `while 超过 ${MAX_CAMPAIGNS} 次，已停机`;
        return { error: vm.error };
      }
      vm.srcLine = top.node.line;
      vm.afterTest = { k: 'while', frame: top };
      vm.queue.push(microForTest(top.node.cond, top.node.line));
      continue;
    }
    top.phase = 'test';
  }
  vm.halted = true;
  vm.error = '程序控制器空转';
  return { error: vm.error };
}

export function applyResult(vm: Vm, camp: Campaign, result: bigint): void {
  vm.rounds += 1;
  if (camp.after === 'assign' && camp.dest) {
    if (camp.dest.k === 'reg') vm.regs[camp.dest.i] = result;
    else vm.scratch[camp.dest.i] = result;
    return;
  }
  vm.flag = result !== 0n;
  const after = vm.afterTest;
  vm.afterTest = null;
  if (!after) return;
  if (after.k === 'if') {
    const branch = vm.flag ? after.then : after.else;
    if (branch.length) vm.frames.push({ t: 'seq', list: branch, i: 0 });
    return;
  }
  if (vm.flag) {
    after.frame.trips += 1;
    after.frame.phase = 'body';
    if (after.frame.node.body.length) {
      vm.frames.push({ t: 'seq', list: after.frame.node.body, i: 0 });
    } else {
      after.frame.phase = 'test';
    }
  } else {
    const idx = vm.frames.lastIndexOf(after.frame);
    if (idx >= 0) vm.frames.splice(idx, 1);
  }
}

/** Node 金标：同步把整段程序用同一张 CPU 网表跑完 */
export function runProgramHeadless(
  src: string,
  bits: BitWidth,
  inputs: { A: number; B: number; C: number },
): { ok: true; regs: bigint[]; rounds: number; gates: number } | { ok: false; error: string; line?: number } {
  const parsed = parseLang(src);
  if (!parsed.ok) return { ok: false, error: parsed.error, line: parsed.line };
  const vm = createVm(parsed.stmts, bits, inputs);
  const values = new Uint8Array(vm.cpu.gates.length);
  for (;;) {
    const n = nextCampaign(vm);
    if ('error' in n) return { ok: false, error: n.error };
    if ('halt' in n) return { ok: true, regs: vm.regs.slice(), rounds: vm.rounds, gates: vm.cpu.gates.length };
    injectCpu(n.netlist, values, {
      A: n.inject.A, B: n.inject.B, C: n.inject.C,
      aluA: n.inject.aluA, aluB: n.inject.aluB, inv: n.inject.inv,
      regs: vm.regs, scratch: vm.scratch,
    });
    runCpuOp(n.netlist, values, n.op);
    applyResult(vm, n, readCpuResult(n.netlist, values, n.op));
    if (vm.error) return { ok: false, error: vm.error };
  }
}

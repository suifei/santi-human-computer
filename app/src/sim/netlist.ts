/**
 * 网表生成器：门级 AND/OR/XOR/NOT + 行波加减乘除。
 * 默认 10 位 (A+B)×C 走经典编制（932 门），其它军令由积木编译。
 */
import {
  parseProgram, widthOf, DEFAULT_EXPR, DEFAULT_BITS, MAX_OUT_BITS,
  type BitWidth, type Expr, type VarName,
} from './program';

export type { BitWidth } from './program';
export { DEFAULT_EXPR, DEFAULT_BITS, inputMax, displayExpr, parseProgram, PRESET_EXPRS, BIT_WIDTHS, MAX_OPS, MAX_OUT_BITS, evalExpr, zeroDivisorReason } from './program';

export type GateType = 'INPUT' | 'AND' | 'OR' | 'XOR' | 'NOT' | 'OUTPUT' | 'DONE';
export type Zone = 'A' | 'B' | 'C' | 'ADDER' | 'PP' | 'ACC' | 'SUB' | 'DIV' | 'OUT' | 'DONE' | 'REG' | 'OP' | 'CMP';

export interface Gate {
  id: number;
  index: number;
  type: GateType;
  inA: number | null;
  inB: number | null;
  layer: number;
  zone: Zone;
  label: string;
  pos: [number, number];
}

export interface FieldBounds { minX: number; maxX: number; minZ: number; maxZ: number }

export type CpuOp = 'pass' | 'add' | 'sub' | 'mul' | 'div' | 'nz' | 'eq' | 'lt';

export interface CpuLayout {
  aluA: number[];
  aluB: number[];
  inputRegs: number[][];
  inputScratch: number[][];
  inputInv: number;
  outs: Record<CpuOp, number[]>;
}

export interface Netlist {
  gates: Gate[];
  byId: Map<number, Gate>;
  byLayer: Gate[][];
  maxLayer: number;
  bits: number;
  expr: string;
  inputA: number[];
  inputB: number[];
  inputC: number[];
  sumBits: number[];
  outBits: number[];
  doneId: number;
  bounds: FieldBounds;
  cpu?: CpuLayout;
  stats: {
    total: number; inputs: number; adder: number; sub: number; pp: number;
    acc: number; div: number; out: number; maxLayer: number;
  };
}

/** 本轮求值只翻这些区的旗；其余部队保持上次真值（门控）。 */
export const CPU_OP_ZONES: Record<CpuOp, Zone[]> = {
  pass: ['OUT'],
  add: ['ADDER'],
  sub: ['SUB'],
  mul: ['PP', 'ACC'],
  div: ['DIV'],
  nz: ['CMP'],
  eq: ['CMP'],
  lt: ['CMP'],
};

export const INPUT_MAX = 1023;

const TYPE_CN: Record<GateType, string> = {
  INPUT: '輸入手', AND: '與門', OR: '或門', XOR: '異或門', NOT: '非門', OUTPUT: '輸出手', DONE: 'DONE 旗手',
};

type PlaceMeta = {
  bit?: number; part?: number; band?: number; row?: number; col?: number; z0?: number; op?: number;
};

function boundsOf(gates: Gate[]): FieldBounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const g of gates) {
    minX = Math.min(minX, g.pos[0]); maxX = Math.max(maxX, g.pos[0]);
    minZ = Math.min(minZ, g.pos[1]); maxZ = Math.max(maxZ, g.pos[1]);
  }
  return { minX, maxX, minZ, maxZ };
}

function finishNetlist(
  gates: Gate[],
  byId: Map<number, Gate>,
  extra: Omit<Netlist, 'gates' | 'byId' | 'byLayer' | 'maxLayer' | 'bounds' | 'stats'> & { stats?: Partial<Netlist['stats']> },
): Netlist {
  const maxLayer = Math.max(...gates.map((g) => g.layer), 1);
  const byLayer: Gate[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const g of gates) byLayer[g.layer].push(g);
  const counts = { adder: 0, sub: 0, pp: 0, acc: 0, div: 0, inputs: 0, out: 0 };
  for (const g of gates) {
    if (g.zone === 'ADDER') counts.adder++;
    else if (g.zone === 'SUB') counts.sub++;
    else if (g.zone === 'PP') counts.pp++;
    else if (g.zone === 'ACC') counts.acc++;
    else if (g.zone === 'DIV') counts.div++;
    else if (g.zone === 'A' || g.zone === 'B' || g.zone === 'C' || g.zone === 'REG' || g.zone === 'OP') counts.inputs++;
    else if (g.zone === 'OUT') counts.out++;
  }
  return {
    gates, byId, byLayer, maxLayer, bounds: boundsOf(gates),
    bits: extra.bits, expr: extra.expr,
    inputA: extra.inputA, inputB: extra.inputB, inputC: extra.inputC,
    sumBits: extra.sumBits, outBits: extra.outBits, doneId: extra.doneId,
    cpu: extra.cpu,
    stats: {
      total: gates.length, maxLayer,
      inputs: counts.inputs, adder: counts.adder, sub: counts.sub,
      pp: counts.pp, acc: counts.acc, div: counts.div, out: counts.out,
      ...extra.stats,
    },
  };
}

/* ================= 经典 10 位 (A+B)×C：编制与坐标保持原样 ================= */

function placeClassic(zone: Zone, seq: Record<Zone, number>, meta?: PlaceMeta): [number, number] {
  const i = seq[zone]++;
  switch (zone) {
    case 'A': return [-20 + i * 1.0, 17];
    case 'B': return [-20 + i * 1.0, 19];
    case 'C': return [-24, 6 + i * 1.0];
    case 'ADDER': {
      const bit = meta?.bit ?? Math.floor(i / 5);
      const part = meta?.part ?? i % 5;
      const x = -16 + bit * 1.2 + (part === 1 || part === 3 ? 0.3 : part === 4 ? 0 : -0.3);
      const z = part <= 1 ? 13 : part <= 3 ? 9.5 : 6;
      return [x, z];
    }
    case 'PP': {
      const j = meta?.row ?? Math.floor(i / 11);
      const c = meta?.col ?? i % 11;
      return [-2 + c * 1.2, 13 - j * 0.78];
    }
    case 'ACC': {
      const band = meta?.band ?? 1;
      const bit = meta?.bit ?? 0;
      const part = meta?.part ?? 0;
      const zb = 4 - (band - 1) * 2.0;
      const x = -2 + bit * 1.2 + (part === 1 || part === 3 ? 0.3 : part === 4 ? 0 : -0.3);
      const z = zb + (part <= 1 ? 0.5 : part <= 3 ? 0 : -0.5);
      return [x, z];
    }
    case 'OUT': return [2 + i * 1.0, -17];
    case 'DONE': return [23.5, -15.5];
    default: return [0, 0];
  }
}

function buildClassic10(): Netlist {
  const gates: Gate[] = [];
  const byId = new Map<number, Gate>();
  const seq: Record<Zone, number> = {
    A: 0, B: 0, C: 0, ADDER: 0, PP: 0, ACC: 0, SUB: 0, DIV: 0, OUT: 0, DONE: 0, REG: 0, OP: 0, CMP: 0,
  };
  const layerOf = (id: number | null) => (id === null ? -1 : byId.get(id)!.layer);

  function add(id: number, type: GateType, inA: number | null, inB: number | null, zone: Zone, label: string, pos: [number, number], fixedLayer?: number): Gate {
    const layer = fixedLayer ?? (type === 'INPUT' ? 0 : 1 + Math.max(layerOf(inA), layerOf(inB)));
    const g: Gate = { id, index: gates.length, type, inA, inB, layer, zone, label, pos };
    gates.push(g);
    byId.set(id, g);
    return g;
  }

  const inputA: number[] = [], inputB: number[] = [], inputC: number[] = [];
  for (let i = 0; i < 10; i++) {
    add(i + 1, 'INPUT', null, null, 'A', `輸入手·甲A·第${i}位`, placeClassic('A', seq));
    inputA.push(i + 1);
  }
  for (let i = 0; i < 10; i++) {
    add(11 + i, 'INPUT', null, null, 'B', `輸入手·乙B·第${i}位`, placeClassic('B', seq));
    inputB.push(11 + i);
  }
  for (let i = 0; i < 10; i++) {
    add(21 + i, 'INPUT', null, null, 'C', `輸入手·丙C·第${i}位`, placeClassic('C', seq));
    inputC.push(21 + i);
  }

  let adderCounter = 0;
  let accCounter = 0;
  const accId = () => {
    let id = 401 + accCounter++;
    if (id >= 901) id += 21;
    return id;
  };
  function fa(a: number | null, b: number | null, cin: number | null, zone: Zone, labelBase: string, placeMeta: PlaceMeta): { sum: number; cout: number } {
    const mk = (t: GateType, x: number | null, y: number | null, part: number, name: string) => {
      const id = zone === 'ADDER' ? 101 + adderCounter++ : accId();
      return add(id, t, x, y, zone, `${labelBase}·${name}`, placeClassic(zone, seq, { ...placeMeta, part })).id;
    };
    const xor1 = mk('XOR', a, b, 0, 'XOR1');
    const and1 = mk('AND', a, b, 1, 'AND1');
    const sum = mk('XOR', xor1, cin, 2, 'XOR2');
    const and2 = mk('AND', xor1, cin, 3, 'AND2');
    const cout = mk('OR', and1, and2, 4, 'OR1');
    return { sum, cout };
  }

  let carry: number | null = null;
  const sumBits: number[] = [];
  for (let i = 0; i < 10; i++) {
    const { sum, cout } = fa(inputA[i], inputB[i], carry, 'ADDER', `加法陣·第${i}位`, { bit: i });
    sumBits.push(sum);
    carry = cout;
  }
  sumBits.push(carry!);

  const pp: number[][] = [];
  for (let j = 0; j < 10; j++) {
    const row: number[] = [];
    for (let i = 0; i < 11; i++) {
      const id = 201 + j * 11 + i;
      add(id, 'AND', sumBits[i], inputC[j], 'PP', `部分積陣·第${j}行·第${i}列`, placeClassic('PP', seq, { row: j, col: i }));
      row.push(id);
    }
    pp.push(row);
  }

  let acc: (number | null)[] = [...pp[0]];
  for (let j = 1; j < 10; j++) {
    const w = 11 + j;
    const next: (number | null)[] = [];
    let cin: number | null = null;
    for (let k = 0; k < w; k++) {
      const a = k < acc.length ? acc[k] : null;
      const b = k >= j && k - j <= 10 ? pp[j][k - j] : null;
      const { sum, cout } = fa(a, b, cin, 'ACC', `累加陣·第${j}帶·第${k}位`, { band: j, bit: k });
      next.push(sum);
      cin = cout;
    }
    next.push(cin);
    acc = next;
  }
  const maxAccLayer = Math.max(...acc.map((id) => layerOf(id)));

  const outBits: number[] = [];
  for (let i = 0; i < 21; i++) {
    const id = 901 + i;
    add(id, 'OUTPUT', acc[i]!, null, 'OUT', `輸出區·第${i}位`, placeClassic('OUT', seq), maxAccLayer + 1);
    outBits.push(id);
  }
  const doneId = 0;
  add(doneId, 'DONE', null, null, 'DONE', '鼓令直屬·DONE旗手', placeClassic('DONE', seq), maxAccLayer + 2);

  return finishNetlist(gates, byId, {
    bits: 10, expr: '(A+B)*C', inputA, inputB, inputC, sumBits, outBits, doneId,
    stats: { inputs: 30, adder: 50, pp: 110, acc: accCounter, out: 21, sub: 0, div: 0 },
  });
}

/* ================= 通用编译：参数位宽积木 ================= */

class Compiler {
  gates: Gate[] = [];
  byId = new Map<number, Gate>();
  nextId = 1;
  bits: number;
  pitch: number;
  cursorZ: number;
  x0: number;
  op = 0;

  constructor(bits: number) {
    this.bits = bits;
    this.pitch = bits > 16 ? 0.72 : bits > 10 ? 0.9 : 1.0;
    this.cursorZ = 20;
    this.x0 = -bits * this.pitch * 0.45;
  }

  layerOf(id: number | null) { return id === null ? -1 : this.byId.get(id)!.layer; }

  add(type: GateType, inA: number | null, inB: number | null, zone: Zone, label: string, pos: [number, number], fixedLayer?: number): number {
    const id = this.nextId++;
    let layer = fixedLayer;
    if (layer === undefined) {
      layer = type === 'INPUT' ? 0 : Math.max(1, 1 + Math.max(this.layerOf(inA), this.layerOf(inB)));
    }
    const g: Gate = { id, index: this.gates.length, type, inA, inB, layer, zone, label, pos };
    this.gates.push(g);
    this.byId.set(id, g);
    return id;
  }

  fa(a: number | null, b: number | null, cin: number | null, zone: Zone, label: string, posFn: (part: number) => [number, number]): { sum: number; cout: number } {
    const xor1 = this.add('XOR', a, b, zone, `${label}·XOR1`, posFn(0));
    const and1 = this.add('AND', a, b, zone, `${label}·AND1`, posFn(1));
    const sum = this.add('XOR', xor1, cin, zone, `${label}·XOR2`, posFn(2));
    const and2 = this.add('AND', xor1, cin, zone, `${label}·AND2`, posFn(3));
    const cout = this.add('OR', and1, and2, zone, `${label}·OR1`, posFn(4));
    return { sum, cout };
  }

  faPos(zone: Zone, z0: number, bit: number, band: number) {
    const p = this.pitch;
    return (part: number): [number, number] => {
      const x = this.x0 + bit * p + (part === 1 || part === 3 ? 0.22 : part === 4 ? 0 : -0.22);
      let z = z0;
      if (zone === 'ADDER' || zone === 'SUB' || zone === 'DIV' || zone === 'CMP') {
        z = z0 + (part <= 1 ? 1.6 : part <= 3 ? 0 : -1.6);
      } else {
        z = z0 - band * 1.45 + (part <= 1 ? 0.4 : part <= 3 ? 0 : -0.4);
      }
      return [x, z];
    };
  }

  rippleAdd(a: (number | null)[], b: (number | null)[], cin: number | null, zone: Zone, label: string, z0: number, keepCout: boolean): number[] {
    const n = Math.max(a.length, b.length);
    const sum: number[] = [];
    let carry = cin;
    for (let i = 0; i < n; i++) {
      const { sum: s, cout } = this.fa(a[i] ?? null, b[i] ?? null, carry, zone, `${label}·第${i}位`, this.faPos(zone, z0, i, 0));
      sum.push(s);
      carry = cout;
    }
    if (keepCout && carry != null) sum.push(carry);
    return sum;
  }

  addOp(a: number[], b: number[]): number[] {
    const z0 = this.cursorZ;
    const out = this.rippleAdd(a, b, null, 'ADDER', '加法', z0, true);
    this.cursorZ -= 6;
    this.op++;
    return out;
  }

  subOp(a: number[], b: number[]): number[] {
    const z0 = this.cursorZ;
    const w = Math.max(a.length, b.length);
    const notB: number[] = [];
    for (let i = 0; i < w; i++) {
      const src = i < b.length ? b[i] : null;
      const x = this.x0 + i * this.pitch;
      notB.push(this.add('NOT', src, null, 'SUB', `減法·非B·第${i}位`, [x, z0 + 3]));
    }
    const cin1 = this.add('NOT', null, null, 'SUB', '減法·補碼進位', [this.x0 - 1.2, z0]);
    const sum = this.rippleAdd(
      Array.from({ length: w }, (_, i) => a[i] ?? null),
      notB,
      cin1,
      'SUB',
      '減法',
      z0,
      false,
    );
    this.cursorZ -= 7;
    this.op++;
    return sum;
  }

  mulOp(x: number[], y: number[]): number[] {
    const n = x.length, m = y.length;
    const zPp = this.cursorZ;
    const pp: number[][] = [];
    for (let j = 0; j < m; j++) {
      const row: number[] = [];
      for (let i = 0; i < n; i++) {
        const pos: [number, number] = [this.x0 + i * this.pitch, zPp - j * 0.7];
        row.push(this.add('AND', x[i], y[j], 'PP', `部分積·r${j}c${i}`, pos));
      }
      pp.push(row);
    }
    const zAcc = zPp - m * 0.7 - 2;
    let acc: (number | null)[] = [...pp[0]];
    for (let j = 1; j < m; j++) {
      const w = n + j;
      const next: (number | null)[] = [];
      let cin: number | null = null;
      for (let k = 0; k < w; k++) {
        const aa = k < acc.length ? acc[k] : null;
        const bb = k >= j && k - j < n ? pp[j][k - j] : null;
        const { sum, cout } = this.fa(aa, bb, cin, 'ACC', `累加·帶${j}·位${k}`, this.faPos('ACC', zAcc, k, j));
        next.push(sum);
        cin = cout;
      }
      next.push(cin);
      acc = next;
    }
    this.cursorZ = zAcc - m * 1.5 - 2;
    this.op++;
    return acc.filter((id): id is number => id != null);
  }

  /** 无符号恢复除法：商宽 = 被除数宽 */
  divOp(dividend: number[], divisor: number[]): number[] {
    const n = dividend.length;
    const z0 = this.cursorZ;
    let R: (number | null)[] = Array.from({ length: n + 1 }, () => null);
    const quot: number[] = Array.from({ length: n }, () => 0);
    for (let si = 0; si < n; si++) {
      const i = n - 1 - si;
      const zS = z0 - si * 1.65;
      const SH: (number | null)[] = [dividend[i], ...R.slice(0, n)];
      const notV: number[] = [];
      for (let k = 0; k < n + 1; k++) {
        const src = k < divisor.length ? divisor[k] : null;
        notV.push(this.add('NOT', src, null, 'DIV', `除法·第${si}級·非V${k}`, [this.x0 + k * this.pitch, zS + 1.2]));
      }
      const cin1 = this.add('NOT', null, null, 'DIV', `除法·第${si}級·Cin1`, [this.x0 - 1.1, zS]);
      const diff = this.rippleAdd(SH, notV, cin1, 'DIV', `除法·第${si}級·減`, zS, true);
      const cout = diff.length > n + 1 ? diff[n + 1] : diff[diff.length - 1];
      const q = cout;
      quot[i] = q;
      const notQ = this.add('NOT', q, null, 'DIV', `除法·第${si}級·非商`, [this.x0 + (n + 1.5) * this.pitch, zS]);
      const nextR: (number | null)[] = [];
      for (let k = 0; k < n + 1; k++) {
        const dBit = k < n + 1 ? (diff[k] ?? null) : null;
        const sBit = SH[k] ?? null;
        const a1 = this.add('AND', q, dBit, 'DIV', `除法·第${si}級·選差${k}`, [this.x0 + k * this.pitch - 0.15, zS - 1.5]);
        const a0 = this.add('AND', notQ, sBit, 'DIV', `除法·第${si}級·選還${k}`, [this.x0 + k * this.pitch + 0.15, zS - 1.5]);
        nextR.push(this.add('OR', a1, a0, 'DIV', `除法·第${si}級·餘${k}`, [this.x0 + k * this.pitch, zS - 2.0]));
      }
      R = nextR;
    }
    this.cursorZ = z0 - n * 1.65 - 3;
    this.op++;
    return quot;
  }

  emit(e: Expr, vars: Record<VarName, number[]>): number[] {
    if (e.k === 'var') return vars[e.name];
    const L = this.emit(e.left, vars);
    const R = this.emit(e.right, vars);
    switch (e.op) {
      case '+': return this.addOp(L, R);
      case '-': return this.subOp(L, R);
      case '*': return this.mulOp(L, R);
      case '/': return this.divOp(L, R);
    }
  }
}

function compileNetlist(ast: Expr, bits: BitWidth, canonical: string): Netlist {
  const w = widthOf(ast, bits);
  if (w > MAX_OUT_BITS) {
    throw new Error(`输出 ${w} 位超过上限 ${MAX_OUT_BITS}，请减少乘法或降低位宽`);
  }
  const c = new Compiler(bits);
  const inputA: number[] = [], inputB: number[] = [], inputC: number[] = [];
  for (let i = 0; i < bits; i++) {
    inputA.push(c.add('INPUT', null, null, 'A', `輸入手·甲A·第${i}位`, [c.x0 + i * c.pitch, 24]));
    inputB.push(c.add('INPUT', null, null, 'B', `輸入手·乙B·第${i}位`, [c.x0 + i * c.pitch, 26]));
    inputC.push(c.add('INPUT', null, null, 'C', `輸入手·丙C·第${i}位`, [c.x0 - 3.2, 22 - i * c.pitch]));
  }
  const vars: Record<VarName, number[]> = { A: inputA, B: inputB, C: inputC };
  const resultBits = c.emit(ast, vars);
  const maxLogic = Math.max(...c.gates.map((g) => g.layer));
  const outBits: number[] = [];
  for (let i = 0; i < resultBits.length; i++) {
    outBits.push(c.add('OUTPUT', resultBits[i], null, 'OUT', `輸出區·第${i}位`, [c.x0 + i * c.pitch, c.cursorZ], maxLogic + 1));
  }
  const doneId = c.add('DONE', null, null, 'DONE', '鼓令直屬·DONE旗手', [c.x0 + resultBits.length * c.pitch + 2, c.cursorZ - 1], maxLogic + 2);
  // DONE 占用了 nextId，但其 id 不是 0。保持 unique 即可。
  return finishNetlist(c.gates, c.byId, {
    bits, expr: canonical, inputA, inputB, inputC, sumBits: [], outBits, doneId,
  });
}

function orReduce(c: Compiler, bits: number[], zone: Zone, label: string, z0: number): number {
  let cur = [...bits];
  let level = 0;
  while (cur.length > 1) {
    const next: number[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      if (i + 1 >= cur.length) { next.push(cur[i]); continue; }
      const x = c.x0 + (i / 2) * c.pitch;
      next.push(c.add('OR', cur[i], cur[i + 1], zone, `${label}·或${level}.${i}`, [x, z0 - level * 1.1]));
    }
    cur = next;
    level++;
  }
  c.cursorZ = z0 - level * 1.1 - 1;
  return cur[0]!;
}

function closeSimple(
  c: Compiler,
  bits: number,
  expr: string,
  inputA: number[],
  inputB: number[],
  inputC: number[],
  resultBits: number[],
): Netlist {
  const maxLogic = Math.max(...c.gates.map((g) => g.layer), 1);
  const outBits: number[] = [];
  for (let i = 0; i < resultBits.length; i++) {
    outBits.push(c.add('OUTPUT', resultBits[i], null, 'OUT', `輸出區·第${i}位`, [c.x0 + i * c.pitch, c.cursorZ], maxLogic + 1));
  }
  const doneId = c.add('DONE', null, null, 'DONE', '鼓令直屬·DONE旗手', [c.x0 + resultBits.length * c.pitch + 2, c.cursorZ - 1], maxLogic + 2);
  return finishNetlist(c.gates, c.byId, {
    bits, expr, inputA, inputB, inputC, sumBits: [], outBits, doneId,
  });
}

function rowInputs(c: Compiler, n: number, zone: Zone, z: number, label: string): number[] {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    ids.push(c.add('INPUT', null, null, zone, `${label}·第${i}位`, [c.x0 + i * c.pitch, z]));
  }
  return ids;
}

/** 复制甲列：赋值 R = 某值 时，值仍由士兵从输入手传到输出手 */
export function buildPassNetlist(bits: BitWidth): Netlist {
  const c = new Compiler(bits);
  const inputA = rowInputs(c, bits, 'A', 24, '輸入手·甲A');
  c.cursorZ = 18;
  return closeSimple(c, bits, 'A', inputA, [], [], inputA);
}

export type TestKind = 'nz' | 'eqz' | 'eq' | 'ne' | 'lt' | 'ge';

function buildLtBits(c: Compiler, a: number[], b: number[]): number {
  const w = Math.max(a.length, b.length);
  const z0 = c.cursorZ;
  const notB: number[] = [];
  for (let i = 0; i < w; i++) {
    notB.push(c.add('NOT', b[i] ?? null, null, 'CMP', `比較·非B·第${i}位`, [c.x0 + i * c.pitch, z0 + 3]));
  }
  const cin1 = c.add('NOT', null, null, 'CMP', '比較·補碼進位', [c.x0 - 1.2, z0]);
  const sum = c.rippleAdd(
    Array.from({ length: w }, (_, i) => a[i] ?? null),
    notB,
    cin1,
    'CMP',
    '比較減',
    z0,
    true,
  );
  const cout = sum[w] ?? sum[sum.length - 1]!;
  c.cursorZ = z0 - 7;
  return c.add('NOT', cout, null, 'CMP', '比較·小於', [c.x0 + w * c.pitch, z0 - 5]);
}

/** if/while 条件：比较与非零都铺成门级方阵，结果 1 位 */
export function buildTestNetlist(kind: TestKind, bits: BitWidth): Netlist {
  const c = new Compiler(bits);
  const needB = kind === 'eq' || kind === 'ne' || kind === 'lt' || kind === 'ge';
  const inputA = rowInputs(c, bits, 'A', 24, '輸入手·甲A');
  const inputB = needB ? rowInputs(c, bits, 'B', 26, '輸入手·乙B') : [];
  let bit: number;
  if (kind === 'nz' || kind === 'eqz') {
    bit = orReduce(c, inputA, 'ADDER', '非零', 18);
    if (kind === 'eqz') bit = c.add('NOT', bit, null, 'ADDER', '为零', [c.x0, c.cursorZ]);
  } else if (kind === 'eq' || kind === 'ne') {
    const xors: number[] = [];
    for (let i = 0; i < bits; i++) {
      xors.push(c.add('XOR', inputA[i], inputB[i], 'ADDER', `相等·异或${i}`, [c.x0 + i * c.pitch, 18]));
    }
    bit = orReduce(c, xors, 'ADDER', '相异', 16);
    if (kind === 'eq') bit = c.add('NOT', bit, null, 'ADDER', '相等', [c.x0, c.cursorZ]);
  } else {
    bit = buildLtBits(c, inputA, inputB);
    if (kind === 'ge') bit = c.add('NOT', bit, null, 'SUB', '大於等於', [c.x0, c.cursorZ]);
  }
  const expr =
    kind === 'nz' ? 'nz(A)' :
    kind === 'eqz' ? 'A==0' :
    kind === 'eq' ? 'A==B' :
    kind === 'ne' ? 'A!=B' :
    kind === 'lt' ? 'A<B' : 'A>=B';
  return closeSimple(c, bits, expr, inputA, inputB, [], [bit]);
}

function emitUnitOuts(c: Compiler, raw: number[], zone: Zone, label: string, x0: number, z: number): number[] {
  return raw.map((id, i) =>
    c.add('OUTPUT', id, null, zone, `${label}·第${i}位`, [x0 + i * c.pitch, z]),
  );
}

const cpuCache = new Map<string, Netlist>();
const CPU_LAYOUT_REV = 'r5';

/**
 * 程序模式的固定数据通路：寄存器、加减乘除、比较一次列齐。
 * 北：寄存器+总线；中：比较/加/减三列贴紧；南：乘、除并排。不按列拉开。
 */
export function buildCpuNetlist(bits: BitWidth): Netlist {
  const key = `${CPU_LAYOUT_REV}-${bits}`;
  const hit = cpuCache.get(key);
  if (hit) return hit;

  const c = new Compiler(bits);
  const p = c.pitch;
  const wA = bits + 1;
  const wB = bits;
  const band = bits * p + 1.1;
  const gutter = 1.4;
  const accW = (bits + wA) * p;
  const divW = (bits + 2) * p;
  const southW = accW + divW + gutter;

  const xAdd = -band * 0.5;
  const xCmp = xAdd - band - gutter;
  const xSub = xAdd + band + gutter;
  const xMul = -southW / 2;
  const xDiv = xMul + accW + gutter;

  const zLogic = 5.8;
  const zBus = 8.4;
  const zA = 10.15;
  const zB = 10.8;
  const zC = 11.45;
  const zReg = 12.15;
  const regPitch = 0.52;

  c.x0 = xAdd;
  const inputRegs: number[][] = [];
  for (let r = 0; r < 8; r++) {
    inputRegs.push(rowInputs(c, bits, 'REG', zReg + r * regPitch, `寄存器R${r}`));
  }
  const inputScratch = [
    rowInputs(c, wA, 'REG', zReg + 8 * regPitch, '暫存T0'),
    rowInputs(c, wA, 'REG', zReg + 9 * regPitch, '暫存T1'),
  ];

  const inputA = rowInputs(c, bits, 'A', zA, '輸入手·甲A');
  const inputB = rowInputs(c, bits, 'B', zB, '輸入手·乙B');
  const inputC = rowInputs(c, bits, 'C', zC, '輸入手·丙C');

  const aluA = rowInputs(c, wA, 'OP', zBus, 'ALU·甲');
  const aluB = rowInputs(c, wB, 'OP', zBus + 0.65, 'ALU·乙');
  const inputInv = c.add('INPUT', null, null, 'OP', '令旗·反相', [xAdd - 1.6, zBus]);
  const aluAlo = aluA.slice(0, bits);

  c.x0 = xAdd;
  const passOut = aluA.map((id, i) =>
    c.add('OUTPUT', id, null, 'OUT', `複製·第${i}位`, [xAdd + i * p, zBus - 0.85], 1),
  );

  c.x0 = xAdd;
  c.cursorZ = zLogic;
  const addRaw = c.addOp(aluAlo, aluB);
  const addOut = emitUnitOuts(c, addRaw, 'ADDER', '加輸出', xAdd, c.cursorZ);

  c.x0 = xSub;
  c.cursorZ = zLogic;
  const subRaw = c.subOp(aluAlo, aluB);
  const subOut = emitUnitOuts(c, subRaw, 'SUB', '減輸出', xSub, c.cursorZ);

  c.x0 = xCmp;
  c.cursorZ = zLogic;
  const nzRaw = orReduce(c, aluAlo, 'CMP', '非零', zLogic + 2.2);
  const xors: number[] = [];
  for (let i = 0; i < bits; i++) {
    xors.push(c.add('XOR', aluAlo[i]!, aluB[i]!, 'CMP', `相等·异或${i}`, [xCmp + i * p, zLogic - 2.1]));
  }
  const neRaw = orReduce(c, xors, 'CMP', '相异', zLogic - 3.2);
  const eqRaw = c.add('NOT', neRaw, null, 'CMP', '相等', [xCmp, c.cursorZ]);
  c.cursorZ = zLogic - 2.4;
  const ltRaw = buildLtBits(c, aluAlo, aluB);
  const nzBit = c.add('XOR', nzRaw, inputInv, 'CMP', 'nz⊕反相', [xCmp, zLogic + 0.4]);
  const eqBit = c.add('XOR', eqRaw, inputInv, 'CMP', 'eq⊕反相', [xCmp, zLogic - 5.4]);
  const ltBit = c.add('XOR', ltRaw, inputInv, 'CMP', 'lt⊕反相', [xCmp, c.cursorZ - 0.6]);
  const nzOut = [c.add('OUTPUT', nzBit, null, 'CMP', 'nz輸出', [xCmp + 1.6, zLogic - 0.3])];
  const eqOut = [c.add('OUTPUT', eqBit, null, 'CMP', 'eq輸出', [xCmp + 1.6, zLogic - 6.1])];
  const ltOut = [c.add('OUTPUT', ltBit, null, 'CMP', 'lt輸出', [xCmp + 1.6, c.cursorZ - 1.4])];

  const northMinZ = Math.min(...c.gates.map((g) => g.pos[1]));
  const zSouth = northMinZ - 2.4;

  c.x0 = xMul;
  c.cursorZ = zSouth;
  const mulRaw = c.mulOp(aluA, aluB);
  const mulOut = emitUnitOuts(c, mulRaw, 'ACC', '乘輸出', xMul, c.cursorZ);

  c.x0 = xDiv;
  c.cursorZ = zSouth;
  const divRaw = c.divOp(aluAlo, aluB);
  const divOut = emitUnitOuts(c, divRaw, 'DIV', '除輸出', xDiv, c.cursorZ);

  const doneId = c.add('DONE', null, null, 'DONE', '鼓令直屬·DONE旗手', [xSub + band + 1.2, zLogic], 1);

  const nl = finishNetlist(c.gates, c.byId, {
    bits,
    expr: 'CPU',
    inputA,
    inputB,
    inputC,
    sumBits: addOut,
    outBits: addOut,
    doneId,
    cpu: {
      aluA,
      aluB,
      inputRegs,
      inputScratch,
      inputInv,
      outs: {
        pass: passOut,
        add: addOut,
        sub: subOut,
        mul: mulOut,
        div: divOut,
        nz: nzOut,
        eq: eqOut,
        lt: ltOut,
      },
    },
  });
  cpuCache.set(key, nl);
  return nl;
}

export function cpuUntilLayer(nl: Netlist, op: CpuOp): number {
  const z = new Set(CPU_OP_ZONES[op]);
  let m = 1;
  for (const g of nl.gates) {
    if (z.has(g.zone)) m = Math.max(m, g.layer);
  }
  return m;
}

export type CpuInject = {
  A: bigint;
  B: bigint;
  C: bigint;
  aluA: bigint;
  aluB: bigint;
  inv: boolean;
  regs: bigint[];
  scratch: bigint[];
};

export function injectCpu(nl: Netlist, values: Uint8Array, p: CpuInject) {
  injectInputs(nl, values, p.A, p.B, p.C);
  const cpu = nl.cpu;
  if (!cpu) return;
  for (let i = 0; i < cpu.aluA.length; i++) values[nl.byId.get(cpu.aluA[i])!.index] = bitOf(p.aluA, i);
  for (let i = 0; i < cpu.aluB.length; i++) values[nl.byId.get(cpu.aluB[i])!.index] = bitOf(p.aluB, i);
  values[nl.byId.get(cpu.inputInv)!.index] = p.inv ? 1 : 0;
  for (let r = 0; r < cpu.inputRegs.length; r++) {
    const row = cpu.inputRegs[r]!;
    const v = p.regs[r] ?? 0n;
    for (let i = 0; i < row.length; i++) values[nl.byId.get(row[i])!.index] = bitOf(v, i);
  }
  for (let s = 0; s < cpu.inputScratch.length; s++) {
    const row = cpu.inputScratch[s]!;
    const v = p.scratch[s] ?? 0n;
    for (let i = 0; i < row.length; i++) values[nl.byId.get(row[i])!.index] = bitOf(v, i);
  }
}

export function evalCpuLayer(nl: Netlist, values: Uint8Array, t: number, op: CpuOp, untilLayer: number): number[] {
  const active = new Set(CPU_OP_ZONES[op]);
  const snap = values.slice();
  const changed: number[] = [];
  const write = (g: Gate, v: 0 | 1) => {
    if (values[g.index] !== v) {
      values[g.index] = v;
      changed.push(g.index);
    }
  };
  for (const g of nl.byLayer[t] ?? []) {
    if (g.type === 'DONE' || !active.has(g.zone)) continue;
    write(g, evalGate(g, snap, nl.byId));
  }
  if (t === untilLayer) {
    const done = nl.byId.get(nl.doneId);
    if (done) write(done, evalGate(done, snap, nl.byId));
  }
  return changed;
}

export function runCpuOp(nl: Netlist, values: Uint8Array, op: CpuOp): bigint {
  const until = cpuUntilLayer(nl, op);
  for (let t = 1; t <= until; t++) evalCpuLayer(nl, values, t, op, until);
  return readCpuResult(nl, values, op);
}

export function readCpuResult(nl: Netlist, values: Uint8Array, op: CpuOp): bigint {
  const ids = nl.cpu?.outs[op] ?? nl.outBits;
  let r = 0n;
  for (let i = 0; i < ids.length; i++) {
    if (values[nl.byId.get(ids[i])!.index]) r |= 1n << BigInt(i);
  }
  return r;
}

export type BuildOk = { ok: true; netlist: Netlist };
export type BuildErr = { ok: false; error: string };

export function tryBuildNetlist(expr: string = DEFAULT_EXPR, bits: BitWidth = DEFAULT_BITS): BuildOk | BuildErr {
  const parsed = parseProgram(expr);
  if (!parsed.ok) return parsed;
  const w = widthOf(parsed.ast, bits);
  if (w > MAX_OUT_BITS) return { ok: false, error: `输出 ${w} 位超过上限 ${MAX_OUT_BITS}，请减少乘法或降低位宽` };
  try {
    const netlist = bits === 10 && parsed.canonical === '(A+B)*C'
      ? buildClassic10()
      : compileNetlist(parsed.ast, bits, parsed.canonical);
    return { ok: true, netlist };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '布阵失败' };
  }
}

export function buildNetlist(expr: string = DEFAULT_EXPR, bits: BitWidth = DEFAULT_BITS): Netlist {
  const r = tryBuildNetlist(expr, bits);
  if (!r.ok) throw new Error(r.error);
  return r.netlist;
}

export function evalGate(g: Gate, values: Uint8Array, byId: Map<number, Gate>): 0 | 1 {
  const va = g.inA === null ? 0 : values[byId.get(g.inA)!.index];
  const vb = g.inB === null ? 0 : values[byId.get(g.inB)!.index];
  switch (g.type) {
    case 'AND': return (va & vb) as 0 | 1;
    case 'OR': return (va | vb) as 0 | 1;
    case 'XOR': return (va ^ vb) as 0 | 1;
    case 'NOT': return (va ^ 1) as 0 | 1;
    case 'OUTPUT': return va as 0 | 1;
    case 'DONE': return 1;
    default: return values[g.index] as 0 | 1;
  }
}

export function bitOf(v: number | bigint, i: number): 0 | 1 {
  const x = typeof v === 'bigint' ? v : BigInt(v >>> 0);
  return Number((x >> BigInt(i)) & 1n) as 0 | 1;
}

export function injectInputs(nl: Netlist, values: Uint8Array, A: number | bigint, B: number | bigint, C: number | bigint) {
  for (let i = 0; i < nl.inputA.length; i++) values[nl.byId.get(nl.inputA[i])!.index] = bitOf(A, i);
  for (let i = 0; i < nl.inputB.length; i++) values[nl.byId.get(nl.inputB[i])!.index] = bitOf(B, i);
  for (let i = 0; i < nl.inputC.length; i++) values[nl.byId.get(nl.inputC[i])!.index] = bitOf(C, i);
}

export function runNetlist(nl: Netlist, A: number | bigint, B: number | bigint, C: number | bigint): Uint8Array {
  const values = new Uint8Array(nl.gates.length);
  injectInputs(nl, values, A, B, C);
  for (let t = 1; t <= nl.maxLayer; t++) {
    const snap = values.slice();
    for (const g of nl.byLayer[t]) values[g.index] = evalGate(g, snap, nl.byId);
  }
  return values;
}

export function readResult(nl: Netlist, values: Uint8Array): bigint {
  let r = 0n;
  for (let i = 0; i < nl.outBits.length; i++) {
    if (values[nl.byId.get(nl.outBits[i])!.index]) r |= 1n << BigInt(i);
  }
  return r;
}

export function zoneCN(zone: Zone): string {
  return {
    A: '輸入區·甲行', B: '輸入區·乙行', C: '輸入區·丙列',
    ADDER: '加法陣', PP: '部分積陣', ACC: '累加陣',
    SUB: '減法陣', DIV: '除法陣', OUT: '輸出區', DONE: '監軍台',
    REG: '寄存器列', OP: '運算數總線', CMP: '比較陣',
  }[zone];
}
export function gateTypeCN(t: GateType): string { return TYPE_CN[t]; }

/**
 * 网表生成器：十进制 A/B/C → 门级网表（AND/OR/XOR，全加器，行波加法器，移位累加乘法器）
 * 契约见 design/home.md §5。纯函数，无 DOM/Three 依赖，可在 Node 中直接验证。
 *
 * 阵型坐标系：+X 向东，+Z 向南，信号总体流向 南 → 北（z 递减 = 层深递增）。
 */

export type GateType = 'INPUT' | 'AND' | 'OR' | 'XOR' | 'NOT' | 'OUTPUT' | 'DONE';
export type Zone = 'A' | 'B' | 'C' | 'ADDER' | 'PP' | 'ACC' | 'OUT' | 'DONE';

export interface Gate {
  id: number;            // 门牌号
  index: number;         // 在 gates 数组中的下标（values 数组按下标存取）
  type: GateType;
  inA: number | null;    // 上游甲门牌号（null = 常量 0）
  inB: number | null;    // 上游乙门牌号
  layer: number;         // 拓扑层：0=输入手
  zone: Zone;
  label: string;         // 人类可读
  pos: [number, number]; // 地面 x,z
}

export interface Netlist {
  gates: Gate[];
  byId: Map<number, Gate>;
  byLayer: Gate[][];
  maxLayer: number;
  /** 关键节点 */
  inputA: number[];      // A bit0..9 门牌号
  inputB: number[];
  inputC: number[];
  sumBits: number[];     // S bit0..10
  outBits: number[];     // 输出手 bit0..20
  doneId: number;
  stats: { total: number; inputs: number; adder: number; pp: number; acc: number; out: number; maxLayer: number };
}

export const INPUT_MAX = 1023;

const TYPE_CN: Record<GateType, string> = {
  INPUT: '輸入手', AND: '與門', OR: '或門', XOR: '異或門', NOT: '非門', OUTPUT: '輸出手', DONE: 'DONE 旗手',
};

/** 布阵器：按 zone + 区内序号分配地面坐标（规格见 home.md §4） */
function place(zone: Zone, seq: Record<Zone, number>, meta?: { bit?: number; part?: number; band?: number; row?: number; col?: number }): [number, number] {
  const i = seq[zone]++;
  switch (zone) {
    case 'A': return [-20 + i * 1.0, 17];
    case 'B': return [-20 + i * 1.0, 19];
    case 'C': return [-24, 6 + i * 1.0];
    case 'ADDER': {
      // 每位列 5 门：列 x=-16+bit*1.2；列内 XOR1/AND1 在南(z=13)，Sum/AND2 居中(z=9.5)，Cout 在北(z=6)
      const bit = meta?.bit ?? Math.floor(i / 5);
      const part = meta?.part ?? i % 5; // 0 xor1,1 and1,2 sum,3 and2,4 cout
      const x = -16 + bit * 1.2 + (part === 1 || part === 3 ? 0.3 : part === 4 ? 0 : -0.3);
      const z = part <= 1 ? 13 : part <= 3 ? 9.5 : 6;
      return [x, z];
    }
    case 'PP': {
      // 10 行(C bit j) × 11 列(S bit i)，行 z 13→6，列 x -2→10
      const j = meta?.row ?? Math.floor(i / 11);
      const c = meta?.col ?? i % 11;
      return [-2 + c * 1.2, 13 - j * 0.78];
    }
    case 'ACC': {
      // 9 条累加带，带 j(1..9) 基准 z = 4-(j-1)*2；带内 bit k 列 x=-2+k*1.2，5 门微错层
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
  }
}

export function buildNetlist(): Netlist {
  const gates: Gate[] = [];
  const byId = new Map<number, Gate>();
  const seq: Record<Zone, number> = { A: 0, B: 0, C: 0, ADDER: 0, PP: 0, ACC: 0, OUT: 0, DONE: 0 };
  const layerOf = (id: number | null) => (id === null ? -1 : byId.get(id)!.layer);

  function add(id: number, type: GateType, inA: number | null, inB: number | null, zone: Zone, label: string, pos: [number, number], fixedLayer?: number): Gate {
    const layer = fixedLayer ?? (type === 'INPUT' ? 0 : 1 + Math.max(layerOf(inA), layerOf(inB)));
    const g: Gate = { id, index: gates.length, type, inA, inB, layer, zone, label, pos };
    gates.push(g);
    byId.set(id, g);
    return g;
  }

  /* ---------- 输入手 001–030 ---------- */
  const inputA: number[] = [], inputB: number[] = [], inputC: number[] = [];
  for (let i = 0; i < 10; i++) {
    const id = i + 1;
    add(id, 'INPUT', null, null, 'A', `輸入手·甲A·第${i}位`, place('A', seq));
    inputA.push(id);
  }
  for (let i = 0; i < 10; i++) {
    const id = 11 + i;
    add(id, 'INPUT', null, null, 'B', `輸入手·乙B·第${i}位`, place('B', seq));
    inputB.push(id);
  }
  for (let i = 0; i < 10; i++) {
    const id = 21 + i;
    add(id, 'INPUT', null, null, 'C', `輸入手·丙C·第${i}位`, place('C', seq));
    inputC.push(id);
  }

  /* ---------- 加法陣 101–150：10 位行波全加器 ---------- */
  let adderCounter = 0;
  let accCounter = 0;
  // 累加陣门牌号自 401 起，跳过输出手号段 901–921（设计文档两段号段重叠，实现上避让）
  const accId = () => {
    let id = 401 + accCounter++;
    if (id >= 901) id += 21;
    return id;
  };
  function fa(a: number | null, b: number | null, cin: number | null, zone: Zone, labelBase: string, placeMeta: { bit?: number; band?: number }): { sum: number; cout: number } {
    const mk = (t: GateType, x: number | null, y: number | null, part: number, name: string) => {
      let id: number;
      if (zone === 'ADDER') id = 101 + adderCounter++;
      else id = accId();
      return add(id, t, x, y, zone, `${labelBase}·${name}`, place(zone, seq, { ...placeMeta, part })).id;
    };
    const xor1 = mk('XOR', a, b, 0, 'XOR1');
    const and1 = mk('AND', a, b, 1, 'AND1');
    const sum = mk('XOR', xor1, cin, 2, 'XOR2');
    const and2 = mk('AND', xor1, cin, 3, 'AND2');
    const cout = mk('OR', and1, and2, 4, 'OR1');
    return { sum, cout };
  }

  let carry: number | null = null; // Cin_0 = 常量 0
  const sumBits: number[] = [];
  for (let i = 0; i < 10; i++) {
    const { sum, cout } = fa(inputA[i], inputB[i], carry, 'ADDER', `加法陣·第${i}位`, { bit: i });
    sumBits.push(sum);
    carry = cout;
  }
  sumBits.push(carry!); // S[10]

  /* ---------- 部分積陣 201–310：PP[j][i] = S[i] AND C[j] ---------- */
  const pp: number[][] = [];
  for (let j = 0; j < 10; j++) {
    const row: number[] = [];
    for (let i = 0; i < 11; i++) {
      const id = 201 + j * 11 + i;
      add(id, 'AND', sumBits[i], inputC[j], 'PP', `部分積陣·第${j}行·第${i}列`, place('PP', seq, { row: j, col: i }));
      row.push(id);
    }
    pp.push(row);
  }

  /* ---------- 累加陣 401–1120：9 条移位累加带 ---------- */
  let acc: (number | null)[] = [...pp[0]]; // 11 bits
  for (let j = 1; j < 10; j++) {
    const w = 11 + j; // 本带位宽 12→20
    const next: (number | null)[] = [];
    let cin: number | null = null;
    for (let k = 0; k < w; k++) {
      const a = k < acc.length ? acc[k] : null;
      const b = k >= j && k - j <= 10 ? pp[j][k - j] : null;
      const { sum, cout } = fa(a, b, cin, 'ACC', `累加陣·第${j}帶·第${k}位`, { band: j, bit: k });
      next.push(sum);
      cin = cout;
    }
    next.push(cin); // 进位成为新最高位
    acc = next;
  }
  // acc 现有 21 位（bit0..20）
  const maxAccLayer = Math.max(...acc.map((id) => layerOf(id)));

  /* ---------- 输出手 901–921（同层，便于集体亮相） ---------- */
  const outBits: number[] = [];
  for (let i = 0; i < 21; i++) {
    const id = 901 + i;
    add(id, 'OUTPUT', acc[i]!, null, 'OUT', `輸出區·第${i}位`, place('OUT', seq), maxAccLayer + 1);
    outBits.push(id);
  }

  /* ---------- DONE 旗手 000 ---------- */
  const doneId = 0;
  add(doneId, 'DONE', null, null, 'DONE', '鼓令直屬·DONE旗手', place('DONE', seq), maxAccLayer + 2);

  /* ---------- 分层索引 ---------- */
  const maxLayer = maxAccLayer + 2;
  const byLayer: Gate[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const g of gates) byLayer[g.layer].push(g);

  return {
    gates, byId, byLayer, maxLayer,
    inputA, inputB, inputC, sumBits, outBits, doneId,
    stats: {
      total: gates.length,
      inputs: 30, adder: 50, pp: 110, acc: accCounter, out: 21,
      maxLayer,
    },
  };
}

/** 门求值（inA/inB 为 null 视为常量 0） */
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
    default: return values[g.index] as 0 | 1; // INPUT 保持
  }
}

/** 注入输入：A/B/C 十进制 → 输入手各位 */
export function injectInputs(nl: Netlist, values: Uint8Array, A: number, B: number, C: number) {
  for (let i = 0; i < 10; i++) {
    values[nl.byId.get(nl.inputA[i])!.index] = (A >> i) & 1;
    values[nl.byId.get(nl.inputB[i])!.index] = (B >> i) & 1;
    values[nl.byId.get(nl.inputC[i])!.index] = (C >> i) & 1;
  }
}

/** 一次性完整求值（验证用 / 瞬算用），返回各门最终值 */
export function runNetlist(nl: Netlist, A: number, B: number, C: number): Uint8Array {
  const values = new Uint8Array(nl.gates.length);
  injectInputs(nl, values, A, B, C);
  for (let t = 1; t <= nl.maxLayer; t++) {
    const snap = values.slice();
    for (const g of nl.byLayer[t]) values[g.index] = evalGate(g, snap, nl.byId);
  }
  return values;
}

/** 从输出手读出十进制结果 */
export function readResult(nl: Netlist, values: Uint8Array): number {
  let r = 0;
  for (let i = 0; i < 21; i++) r += values[nl.byId.get(nl.outBits[i])!.index] * 2 ** i;
  return r;
}

export function zoneCN(zone: Zone): string {
  return { A: '輸入區·甲行', B: '輸入區·乙行', C: '輸入區·丙列', ADDER: '加法陣', PP: '部分積陣', ACC: '累加陣', OUT: '輸出區', DONE: '監軍台' }[zone];
}
export function gateTypeCN(t: GateType): string { return TYPE_CN[t]; }

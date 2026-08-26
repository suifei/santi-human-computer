/**
 * 军令表达式：A/B/C 与 + - * / 括号，最多 3 个二元运算，输出位宽上限见 MAX_OUT_BITS。
 */
export type VarName = 'A' | 'B' | 'C';
export type BinOp = '+' | '-' | '*' | '/';
export type BitWidth = 10 | 16 | 32;

export type Expr =
  | { k: 'var'; name: VarName }
  | { k: 'bin'; op: BinOp; left: Expr; right: Expr };

export const BIT_WIDTHS: BitWidth[] = [10, 16, 32];
export const DEFAULT_EXPR = '(A+B)*C';
export const DEFAULT_BITS: BitWidth = 10;
export const MAX_OPS = 3;
/** (A+B)*C 在 32 位时积为 65 位，因此上限取 65 而非 64 */
export const MAX_OUT_BITS = 65;

export const PRESET_EXPRS: { expr: string; label: string }[] = [
  { expr: '(A+B)*C', label: '(A+B)×C' },
  { expr: 'A+B', label: 'A+B' },
  { expr: 'A-B', label: 'A−B' },
  { expr: 'A*B', label: 'A×B' },
  { expr: 'A/B', label: 'A÷B' },
];

export function inputMax(bits: number): number {
  if (bits >= 32) return 0xFFFFFFFF;
  return (1 << bits) - 1;
}

export function displayExpr(canonical: string): string {
  return canonical.replace(/\*/g, '×').replace(/\//g, '÷');
}

export type ParseResult =
  | { ok: true; ast: Expr; canonical: string; ops: number; used: Record<VarName, boolean> }
  | { ok: false; error: string };

export const REG_COUNT = 8;
export const SCRATCH_COUNT = 2;
export const MAX_SRC_LINES = 40;
export const MAX_NEST = 2;
export const MAX_CAMPAIGNS = 256;

export type Operand =
  | { k: 'in'; name: VarName }
  | { k: 'reg'; i: number }
  | { k: 'const'; v: bigint }
  | { k: 'scratch'; i: number };

export type ValExpr =
  | Operand
  | { k: 'bin'; op: BinOp; left: ValExpr; right: ValExpr };

export type CmpOp = '==' | '!=' | '<' | '>' | '<=' | '>=';

export function inputMaxBig(bits: number): bigint {
  if (bits >= 32) return 0xFFFFFFFFn;
  return (1n << BigInt(bits)) - 1n;
}

export function operandKey(o: Operand): string {
  if (o.k === 'in') return o.name;
  if (o.k === 'reg') return `R${o.i}`;
  if (o.k === 'scratch') return `T${o.i}`;
  return `#${o.v.toString()}`;
}

export function parseOperand(raw: string): { ok: true; op: Operand } | { ok: false; error: string } {
  const s = raw.trim().toUpperCase();
  if (/^[ABC]$/.test(s)) return { ok: true, op: { k: 'in', name: s as VarName } };
  const rm = /^R([0-7])$/.exec(s);
  if (rm) return { ok: true, op: { k: 'reg', i: Number(rm[1]) } };
  if (/^\d+$/.test(s)) return { ok: true, op: { k: 'const', v: BigInt(s) } };
  return { ok: false, error: `无法识别「${raw.trim() || '空'}」，请写 A/B/C、R0–R7 或十进制整数` };
}

export type ValParse =
  | { ok: true; ast: ValExpr; ops: number }
  | { ok: false; error: string };

/** 程序赋值右边：A/B/C、R0–R7、十进制常量与四则（可 0 个运算，即复制） */
export function parseValueExpr(raw: string): ValParse {
  const src = raw
    .trim()
    .replace(/[×＊·]/g, '*')
    .replace(/[÷／]/g, '/')
    .replace(/[−－]/g, '-')
    .replace(/\s+/g, '')
    .toUpperCase();
  if (!src) return { ok: false, error: '式子不能为空' };

  let i = 0;
  const peek = () => src[i] ?? '';
  const eat = () => src[i++] ?? '';
  const fail = (msg: string): never => { throw new Error(msg); };

  function parseExpr(): ValExpr {
    let left = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = eat() as BinOp;
      left = { k: 'bin', op, left, right: parseTerm() };
    }
    return left;
  }
  function parseTerm(): ValExpr {
    let left = parseAtom();
    while (peek() === '*' || peek() === '/') {
      const op = eat() as BinOp;
      left = { k: 'bin', op, left, right: parseAtom() };
    }
    return left;
  }
  function parseAtom(): ValExpr {
    if (peek() === '(') {
      eat();
      const inner = parseExpr();
      if (eat() !== ')') fail('括号未闭合');
      return inner;
    }
    if (peek() === 'R') {
      eat();
      const d = eat();
      if (d < '0' || d > '7') fail('寄存器只能是 R0–R7');
      return { k: 'reg', i: Number(d) };
    }
    if (peek() >= '0' && peek() <= '9') {
      let n = '';
      while (peek() >= '0' && peek() <= '9') n += eat();
      return { k: 'const', v: BigInt(n) };
    }
    const c = eat();
    if (c === 'A' || c === 'B' || c === 'C') return { k: 'in', name: c };
    return fail(`无法识别「${c || '文末'}」`);
  }

  try {
    const ast = parseExpr();
    if (i !== src.length) return { ok: false, error: `式子末尾有多余字符「${src.slice(i)}」` };
    const ops = countValOps(ast);
    if (ops > MAX_OPS) return { ok: false, error: `最多 ${MAX_OPS} 个运算，当前 ${ops} 个` };
    return { ok: true, ast, ops };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '式子无法解析' };
  }
}

function countValOps(e: ValExpr): number {
  return e.k === 'bin' ? 1 + countValOps(e.left) + countValOps(e.right) : 0;
}

export function collectOperands(e: ValExpr, into: Operand[] = []): Operand[] {
  if (e.k === 'bin') {
    collectOperands(e.left, into);
    collectOperands(e.right, into);
    return into;
  }
  into.push(e);
  return into;
}

export function parseProgram(raw: string): ParseResult {
  const src = raw
    .trim()
    .replace(/[×＊·]/g, '*')
    .replace(/[÷／]/g, '/')
    .replace(/[−－]/g, '-')
    .replace(/\s+/g, '')
    .toUpperCase();
  if (!src) return { ok: false, error: '军令不能为空' };

  let i = 0;
  const peek = () => src[i] ?? '';
  const eat = () => src[i++] ?? '';
  const fail = (msg: string): never => { throw new Error(msg); };

  function parseExpr(): Expr {
    let left = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = eat() as BinOp;
      left = { k: 'bin', op, left, right: parseTerm() };
    }
    return left;
  }
  function parseTerm(): Expr {
    let left = parseAtom();
    while (peek() === '*' || peek() === '/') {
      const op = eat() as BinOp;
      left = { k: 'bin', op, left, right: parseAtom() };
    }
    return left;
  }
  function parseAtom(): Expr {
    if (peek() === '(') {
      eat();
      const inner = parseExpr();
      if (eat() !== ')') fail('括号未闭合');
      return inner;
    }
    const c = eat();
    if (c === 'A' || c === 'B' || c === 'C') return { k: 'var', name: c };
    return fail(`无法识别「${c || '文末'}」，只能写 A / B / C 与 + - * /`);
  }

  try {
    const ast = parseExpr();
    if (i !== src.length) return { ok: false, error: `式子末尾有多余字符「${src.slice(i)}」` };
    const ops = countOps(ast);
    if (ops > MAX_OPS) return { ok: false, error: `最多 ${MAX_OPS} 个运算，当前 ${ops} 个` };
    if (ops < 1) return { ok: false, error: '请至少写一个运算，例如 A+B' };
    return { ok: true, ast, canonical: canonicalOf(ast), ops, used: usedVars(ast) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '军令无法解析' };
  }
}

function countOps(e: Expr): number {
  return e.k === 'var' ? 0 : 1 + countOps(e.left) + countOps(e.right);
}

function usedVars(e: Expr): Record<VarName, boolean> {
  const u: Record<VarName, boolean> = { A: false, B: false, C: false };
  const walk = (x: Expr) => {
    if (x.k === 'var') u[x.name] = true;
    else { walk(x.left); walk(x.right); }
  };
  walk(e);
  return u;
}

function canonicalOf(e: Expr): string {
  if (e.k === 'var') return e.name;
  const l = e.left.k === 'bin' && prec(e.left.op) < prec(e.op) ? `(${canonicalOf(e.left)})` : canonicalOf(e.left);
  const r = e.right.k === 'bin' && prec(e.right.op) <= prec(e.op) ? `(${canonicalOf(e.right)})` : canonicalOf(e.right);
  return `${l}${e.op}${r}`;
}

function prec(op: BinOp): number {
  return op === '+' || op === '-' ? 1 : 2;
}

export function widthOf(e: Expr, bits: number): number {
  if (e.k === 'var') return bits;
  const lw = widthOf(e.left, bits);
  const rw = widthOf(e.right, bits);
  switch (e.op) {
    case '+': return Math.max(lw, rw) + 1;
    case '-': return Math.max(lw, rw);
    case '*': return lw + rw;
    case '/': return lw;
  }
}

export function evalExpr(e: Expr, A: bigint, B: bigint, C: bigint, bits: number): bigint {
  const val = (x: Expr): { v: bigint; w: number } => {
    if (x.k === 'var') {
      const v = x.name === 'A' ? A : x.name === 'B' ? B : C;
      return { v, w: bits };
    }
    const L = val(x.left);
    const R = val(x.right);
    switch (x.op) {
      case '+': return { v: L.v + R.v, w: Math.max(L.w, R.w) + 1 };
      case '-': {
        const w = Math.max(L.w, R.w);
        const mask = (1n << BigInt(w)) - 1n;
        return { v: (L.v - R.v) & mask, w };
      }
      case '*': return { v: L.v * R.v, w: L.w + R.w };
      case '/': {
        if (R.v === 0n) throw new Error('div0');
        return { v: L.v / R.v, w: L.w };
      }
    }
  };
  return val(e).v;
}

/** 任一除法右值在当前输入下为 0 则返回说明，否则 null */
export function zeroDivisorReason(e: Expr, A: bigint, B: bigint, C: bigint, bits: number): string | null {
  const walk = (x: Expr): { v: bigint; w: number } | { err: string } => {
    if (x.k === 'var') {
      const v = x.name === 'A' ? A : x.name === 'B' ? B : C;
      return { v, w: bits };
    }
    const L = walk(x.left);
    const R = walk(x.right);
    if ('err' in L) return L;
    if ('err' in R) return R;
    if (x.op === '/') {
      if (R.v === 0n) return { err: '除数为 0，无法注入' };
      return { v: L.v / R.v, w: L.w };
    }
    if (x.op === '+') return { v: L.v + R.v, w: Math.max(L.w, R.w) + 1 };
    if (x.op === '*') return { v: L.v * R.v, w: L.w + R.w };
    const w = Math.max(L.w, R.w);
    const mask = (1n << BigInt(w)) - 1n;
    return { v: (L.v - R.v) & mask, w };
  };
  const r = walk(e);
  return 'err' in r ? r.err : null;
}

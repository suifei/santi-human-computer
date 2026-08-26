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

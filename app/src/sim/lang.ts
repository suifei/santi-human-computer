/**
 * 程序语言：赋值 + if/while。值全部由人列网表算出；本文件只负责切句。
 */
import {
  MAX_NEST, MAX_SRC_LINES, parseOperand, parseValueExpr,
  type CmpOp, type Operand, type ValExpr,
} from './program';

export type Cond =
  | { k: 'nz'; src: Operand }
  | { k: 'cmp'; op: CmpOp; left: Operand; right: Operand };

export type Stmt =
  | { k: 'assign'; dest: number; rhs: ValExpr; line: number }
  | { k: 'if'; cond: Cond; then: Stmt[]; else: Stmt[]; line: number }
  | { k: 'while'; cond: Cond; body: Stmt[]; line: number };

export type LangOk = { ok: true; stmts: Stmt[] };
export type LangErr = { ok: false; error: string; line: number };
export type LangResult = LangOk | LangErr;

export const DEFAULT_PROGRAM = 'R0 = (A+B)*C\n';

export const PRESET_PROGRAMS: { label: string; src: string; hint?: string }[] = [
  { label: '经典乘加', src: 'R0 = (A+B)*C\n' },
  {
    label: '累加乘法',
    src: 'R0 = 0\nR1 = B\nwhile R1 {\n  R0 = R0 + A\n  R1 = R1 - 1\n}\n',
    hint: '全员列阵；每一轮只翻加法旗。乙 B 请用较小的数（如 5）',
  },
  {
    label: '倒计数',
    src: 'R0 = A\nwhile R0 {\n  R0 = R0 - 1\n}\n',
    hint: '甲 A 即倒数次数；减法阵翻旗，人海仍全在',
  },
];

const CMPS: CmpOp[] = ['==', '!=', '<=', '>=', '<', '>'];

export function parseLang(raw: string): LangResult {
  const logical: { text: string; line: number }[] = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > MAX_SRC_LINES) {
    return { ok: false, error: `源码最多 ${MAX_SRC_LINES} 行`, line: MAX_SRC_LINES };
  }
  for (let li = 0; li < lines.length; li++) {
    const cut = lines[li].replace(/#.*$/, '').trim();
    if (cut) logical.push({ text: cut, line: li + 1 });
  }
  const src = logical.map((l) => l.text).join('\n');
  const lineAt = (idx: number) => {
    let n = 0;
    for (const l of logical) {
      if (idx <= n + l.text.length) return l.line;
      n += l.text.length + 1;
    }
    return logical[logical.length - 1]?.line ?? 1;
  };

  let i = 0;
  const peek = () => src[i] ?? '';
  const skipWs = () => { while (/\s/.test(peek())) i++; };
  const fail = (msg: string): never => { throw Object.assign(new Error(msg), { line: lineAt(i) }); };

  function matchKw(kw: string): boolean {
    skipWs();
    const slice = src.slice(i, i + kw.length);
    if (slice.toLowerCase() !== kw) return false;
    const next = src[i + kw.length] ?? '';
    if (/[A-Za-z0-9_]/.test(next)) return false;
    i += kw.length;
    return true;
  }

  function parseCond(): Cond {
    skipWs();
    const start = i;
    while (peek() && peek() !== '{') i++;
    const rawCond = src.slice(start, i).trim();
    if (!rawCond) return fail('缺少条件');
    for (const op of CMPS) {
      const at = rawCond.indexOf(op);
      if (at < 0) continue;
      const L = parseOperand(rawCond.slice(0, at));
      const R = parseOperand(rawCond.slice(at + op.length));
      if (L.ok && R.ok) return { k: 'cmp', op, left: L.op, right: R.op };
      if (L.ok === false) return fail(L.error);
      if (R.ok === false) return fail(R.error);
    }
    const one = parseOperand(rawCond);
    if (one.ok) return { k: 'nz', src: one.op };
    return fail(one.error);
  }

  function parseBlock(depth: number): Stmt[] {
    if (depth > MAX_NEST) fail(`if/while 最多嵌套 ${MAX_NEST} 层`);
    const out: Stmt[] = [];
    skipWs();
    while (peek() && peek() !== '}') {
      out.push(parseStmt(depth));
      skipWs();
    }
    return out;
  }

  function eatBraceBlock(depth: number): Stmt[] {
    skipWs();
    if (peek() !== '{') fail('缺少 {');
    i++;
    const body = parseBlock(depth);
    skipWs();
    if (peek() !== '}') fail('缺少 }');
    i++;
    return body;
  }

  function parseStmt(depth: number): Stmt {
    skipWs();
    const line = lineAt(i);
    if (matchKw('if')) {
      const cond = parseCond();
      const then = eatBraceBlock(depth + 1);
      let els: Stmt[] = [];
      if (matchKw('else')) els = eatBraceBlock(depth + 1);
      return { k: 'if', cond, then, else: els, line };
    }
    if (matchKw('while')) {
      const cond = parseCond();
      const body = eatBraceBlock(depth + 1);
      return { k: 'while', cond, body, line };
    }
    const start = i;
    while (peek() && peek() !== '\n' && peek() !== '}') i++;
    const lineText = src.slice(start, i).trim();
    const eq = lineText.indexOf('=');
    if (eq < 0) return fail('请写赋值（R0 = …）或 if / while');
    const lhs = parseOperand(lineText.slice(0, eq));
    if (lhs.ok === false) return fail(lhs.error);
    if (lhs.op.k !== 'reg') return fail('只能赋值给 R0–R7');
    const rhs = parseValueExpr(lineText.slice(eq + 1));
    if (rhs.ok === false) return fail(rhs.error);
    return { k: 'assign', dest: lhs.op.i, rhs: rhs.ast, line };
  }

  try {
    skipWs();
    if (!peek()) return { ok: false, error: '程序不能为空', line: 1 };
    const stmts = parseBlock(0);
    skipWs();
    if (peek()) fail('源码末尾有多余字符');
    return { ok: true, stmts };
  } catch (e) {
    const line = e && typeof e === 'object' && 'line' in e ? Number((e as { line: number }).line) : 1;
    return { ok: false, error: e instanceof Error ? e.message : '程序无法解析', line };
  }
}

/**
 * 军令台词表：短句、可 TTS 读完。甲乙丙 = A/B/C；红旗=1 蓝旗=0。
 * 只在入阵 / 注入 / 开鼓 / 完成 / 报错开口，不每拍念。
 */

const DIGITS = '零一二三四五六七八九';
const SMALL_U = ['', '十', '百', '千'];
const BIG_U = ['', '万', '亿', '兆', '京', '垓', '秭'];
const VAR_CN: Record<'A' | 'B' | 'C', string> = { A: '甲', B: '乙', C: '丙' };

/** 中文数字朗读：2027025 → 二百零二万七千零二十五（不逐位念） */
export function formatZhNumber(n: number | bigint): string {
  let v = typeof n === 'bigint' ? n : BigInt(Number.isFinite(n) ? Math.trunc(n) : 0);
  if (v < 0n) return '負' + formatZhNumber(-v);
  if (v === 0n) return '零';

  const groups: number[] = [];
  while (v > 0n) {
    groups.push(Number(v % 10000n));
    v /= 10000n;
  }

  let out = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    if (out && g < 1000) out += '零';
    out += formatGroup(g, i === groups.length - 1) + (BIG_U[i] ?? '');
  }
  return out || '零';
}

function formatGroup(n: number, leadingTen: boolean): string {
  const qian = Math.floor(n / 1000);
  const bai = Math.floor((n % 1000) / 100);
  const shi = Math.floor((n % 100) / 10);
  const ge = n % 10;
  let s = '';
  if (qian) s += DIGITS[qian] + SMALL_U[3];
  if (bai) s += DIGITS[bai] + SMALL_U[2];
  else if (s && (shi || ge)) s += '零';
  if (shi) {
    if (shi === 1 && !s && leadingTen) s += SMALL_U[1];
    else s += DIGITS[shi] + SMALL_U[1];
  } else if (ge && s && !s.endsWith('零')) {
    s += '零';
  }
  if (ge) s += DIGITS[ge];
  return s;
}

/** (A+B)*C → （甲加乙）乘丙 */
export function formatOrderExpr(canonical: string): string {
  return canonical
    .replace(/A/g, VAR_CN.A)
    .replace(/B/g, VAR_CN.B)
    .replace(/C/g, VAR_CN.C)
    .replace(/\+/g, '加')
    .replace(/-/g, '減')
    .replace(/[×*]/g, '乘')
    .replace(/[÷/]/g, '除')
    .replace(/\(/g, '（')
    .replace(/\)/g, '）');
}

function rosterOf(used?: Record<'A' | 'B' | 'C', boolean>): string {
  const names = (['A', 'B', 'C'] as const).filter((k) => !used || used[k]).map((k) => VAR_CN[k]);
  return `${names.join('')}入列`;
}

function campLabel(label: string): string {
  return label.replace(/←/g, '取').replace(/\bnz\b/gi, '非零');
}

/** 固定台词（场景 → 原文） */
export const ORDERS = {
  enter: '擊鼓入陣。全軍列隊，靜候將令。',
  injectDone: '入列已畢，請擊鼓演算。',
  run: '擊鼓。全軍開算。',
  pause: '停鼓。',
  resume: '再鼓。繼續演算。',
  fast: '全軍瞬算。',
  needInject: '請先注入方陣。',
} as const;

export function lineInjectStart(opts: {
  bits: number;
  expr?: string;
  used?: Record<'A' | 'B' | 'C', boolean>;
  program?: boolean;
  label?: string;
}): string {
  const bitsZh = `${formatZhNumber(opts.bits)}位`;
  if (opts.program) {
    const tail = opts.label ? campLabel(opts.label) : '依軍令布陣';
    return `${bitsZh}，程序入列，${tail}。`;
  }
  const exprZh = formatOrderExpr(opts.expr ?? '');
  return `${bitsZh}，${rosterOf(opts.used)}，算${exprZh}。`;
}

export function lineDone(result: bigint): string {
  return `算成，${formatZhNumber(result)}。`;
}

export function lineProgramDone(result: bigint): string {
  return `程序算成，R0 為${formatZhNumber(result)}。`;
}

export function lineProgramNext(label: string): string {
  return `下一令，${campLabel(label)}。`;
}

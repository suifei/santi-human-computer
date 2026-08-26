import { motion } from 'framer-motion';
import FlagChip from '@/components/FlagChip';

/** 字段标注序号徽标 */
function Badge({ n, dark = false }: { n: number; dark?: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-mono-num text-[11px] font-bold select-none"
      style={{
        width: 20,
        height: 20,
        background: dark ? 'var(--seal)' : 'var(--gold)',
        color: dark ? 'var(--paper)' : 'var(--ink)',
      }}
      aria-hidden
    >
      {n}
    </span>
  );
}

type Bit = 0 | 1;

/** 迷你真值表卡（四门之一） */
function TruthCard({
  char,
  name,
  en,
  rows,
  delay,
}: {
  char: string;
  name: string;
  en: string;
  rows: [Bit, Bit | null, Bit][];
  delay: number;
}) {
  return (
    <motion.div
      className="paper-card p-4"
      style={{ transformStyle: 'preserve-3d' }}
      initial={{ rotateY: 90, opacity: 0 }}
      whileInView={{ rotateY: 0, opacity: 1 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex items-center justify-center rounded-sm font-brush text-white select-none"
          style={{ width: 30, height: 30, background: 'var(--seal)', fontSize: 16 }}
          aria-hidden
        >
          {char}
        </span>
        <div>
          <div className="font-song font-semibold text-[14px] leading-tight" style={{ color: 'var(--ink)' }}>
            {name}
          </div>
          <div className="font-mono-num text-[11px]" style={{ color: 'rgba(23,16,11,0.55)' }}>
            {en}
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {rows.map(([a, b, out], i) => (
          <div key={i} className="flex items-center gap-1.5">
            <FlagChip value={a} />
            {b !== null && <FlagChip value={b} />}
            <span className="font-mono-num text-[11px]" style={{ color: 'rgba(23,16,11,0.55)' }}>→</span>
            <FlagChip value={out} />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

const FIELDS = [
  { n: 1, name: '門牌號', desc: '全军唯一番号，按号段分区（见编制花名册）。' },
  { n: 2, name: '職能', desc: '与 / 或 / 異或 / 非，四门之一，决定听令后的举旗规则。' },
  { n: 3, name: '上游甲 / 上游乙', desc: '鼓响瞬间须紧盯的两名士兵番号（非门只看甲）。' },
  { n: 4, name: '真值表', desc: '四种旗色组合对应的举旗结果，蓝为 0、红为 1。' },
  { n: 5, name: '層序', desc: '第几拍举旗——层序即深度，保证上游永远先于自己举旗。' },
];

/** 指令卡示例中「異或門」真值表（当前命中：甲紅乙藍 → 舉紅旗） */
const XOR_ROWS: [Bit, Bit, Bit][] = [
  [0, 0, 0],
  [0, 1, 1],
  [1, 0, 1],
  [1, 1, 0],
];

/**
 * S4 指令卡规范：左 = 放大版指令卡实物（复刻主页 §8.6，門牌 613 示例，序号引线标注），
 * 右 = 字段规范说明；下方 = 四门真值表卡组。
 */
export default function InstructionCardAnatomy() {
  return (
    <div>
      <div className="grid gap-10 lg:grid-cols-2">
        {/* 左：指令卡实物（420px 宣纸卡） */}
        <div className="flex justify-center lg:justify-start">
          <motion.div
            className="paper-card relative w-full max-w-[420px] p-6"
            initial={{ rotate: -2, y: 40, opacity: 0 }}
            whileInView={{ rotate: 0, y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* 右上朱红印章 */}
            <span
              className="absolute right-5 top-5 flex items-center justify-center rounded-sm font-brush text-white select-none"
              style={{
                width: 40,
                height: 40,
                background: 'var(--seal)',
                fontSize: 22,
                boxShadow: '0 2px 8px rgba(23,16,11,0.3), inset 0 0 6px rgba(255,255,255,0.12)',
              }}
              aria-hidden
            >
              異
            </span>

            <div className="space-y-3 text-[14px]" style={{ color: 'var(--ink)' }}>
              <div className="flex items-center gap-2.5">
                <Badge n={1} />
                <span className="w-16 shrink-0 text-[12px] tracking-[0.12em]" style={{ color: 'rgba(23,16,11,0.55)' }}>門牌號</span>
                <span className="font-mono-num font-bold">第 613 號</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Badge n={2} />
                <span className="w-16 shrink-0 text-[12px] tracking-[0.12em]" style={{ color: 'rgba(23,16,11,0.55)' }}>職能</span>
                <span className="font-song font-semibold">異或門 <span className="font-mono-num text-[12px] font-normal">XOR</span></span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-5 shrink-0" aria-hidden />
                <span className="w-16 shrink-0 text-[12px] tracking-[0.12em]" style={{ color: 'rgba(23,16,11,0.55)' }}>所屬</span>
                <span>累加陣 · 第 3 帶 · 第 5 位</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Badge n={5} />
                <span className="w-16 shrink-0 text-[12px] tracking-[0.12em]" style={{ color: 'rgba(23,16,11,0.55)' }}>層序</span>
                <span className="font-mono-num text-[13px]">第 37 層（第 37 拍舉旗）</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Badge n={3} />
                <span className="w-16 shrink-0 text-[12px] tracking-[0.12em]" style={{ color: 'rgba(23,16,11,0.55)' }}>上游甲</span>
                <span className="font-mono-num text-[13px] underline decoration-dotted underline-offset-4">第 529 號</span>
                <span className="text-[12px]" style={{ color: 'rgba(23,16,11,0.55)' }}>（累加陣）</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-5 shrink-0" aria-hidden />
                <span className="w-16 shrink-0 text-[12px] tracking-[0.12em]" style={{ color: 'rgba(23,16,11,0.55)' }}>上游乙</span>
                <span className="font-mono-num text-[13px] underline decoration-dotted underline-offset-4">第 607 號</span>
                <span className="text-[12px]" style={{ color: 'rgba(23,16,11,0.55)' }}>（部分積陣）</span>
              </div>

              <div className="h-px" style={{ background: 'rgba(23,16,11,0.18)' }} />

              <div className="flex items-start gap-2.5">
                <Badge n={4} />
                <span className="mt-0.5 w-16 shrink-0 text-[12px] tracking-[0.12em]" style={{ color: 'rgba(23,16,11,0.55)' }}>真值表</span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {XOR_ROWS.map(([a, b, out], i) => {
                    const hit = a === 1 && b === 0;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-1 rounded-sm px-1 py-0.5"
                        style={hit ? { background: 'rgba(163,46,34,0.18)', outline: '1px solid rgba(163,46,34,0.45)' } : undefined}
                      >
                        <FlagChip value={a} />
                        <FlagChip value={b} />
                        <span className="font-mono-num text-[11px]" style={{ color: 'rgba(23,16,11,0.55)' }}>→</span>
                        <FlagChip value={out} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="h-px" style={{ background: 'rgba(23,16,11,0.18)' }} />

              <div className="flex items-center gap-2.5">
                <span className="w-5 shrink-0" aria-hidden />
                <span className="w-16 shrink-0 text-[12px] tracking-[0.12em]" style={{ color: 'rgba(23,16,11,0.55)' }}>當前</span>
                <span className="flex items-center gap-1.5 text-[13px]">
                  甲<FlagChip value={1} /> · 乙<FlagChip value={0} /> → 舉紅旗
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* 右：字段规范说明 */}
        <div>
          <p className="text-[14px] leading-relaxed text-sand">
            演算场中点选任意士兵，即弹出此「指令卡」——每名士兵的军令文书。
            全军九百三十二张卡，字段规范如一：
          </p>
          <ul className="mt-6 space-y-5">
            {FIELDS.map((f, i) => (
              <motion.li
                key={f.n}
                className="flex items-start gap-3"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.4, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                <Badge n={f.n} />
                <div>
                  <div className="font-song text-[14px] font-semibold" style={{ color: 'var(--gold)' }}>
                    {f.name}
                  </div>
                  <div className="mt-0.5 text-[14px] leading-relaxed text-sand">{f.desc}</div>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>

      {/* 四门真值表组 */}
      <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
        <TruthCard char="與" name="與門" en="AND" delay={0} rows={[[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]]} />
        <TruthCard char="或" name="或門" en="OR" delay={0.12} rows={[[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]]} />
        <TruthCard char="異" name="異或門" en="XOR" delay={0.24} rows={[[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]]} />
        <TruthCard char="非" name="非門" en="NOT" delay={0.36} rows={[[0, null, 1], [1, null, 0]]} />
      </div>
    </div>
  );
}

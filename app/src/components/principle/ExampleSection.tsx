import { motion } from 'framer-motion';
import FlagChip from '@/components/FlagChip';
import SectionTitle from '@/components/SectionTitle';

function BitRow({ bits, delayBase = 0 }: { bits: string; delayBase?: number }) {
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {bits.split('').map((b, i) => (
        <motion.span
          key={i}
          initial={{ rotateY: 90, opacity: 0 }}
          whileInView={{ rotateY: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.3, delay: delayBase + i * 0.04 }}
          className="inline-flex"
        >
          <FlagChip value={b === '1' ? 1 : 0} />
        </motion.span>
      ))}
    </span>
  );
}

const STEPS = [
  {
    no: '①',
    title: '注入',
    body: (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-24 font-mono-num text-[13px]" style={{ color: 'var(--earth-500)' }}>1013 =</span>
          <BitRow bits="1111110101" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-24 font-mono-num text-[13px]" style={{ color: 'var(--earth-500)' }}>1012 =</span>
          <BitRow bits="1111110100" delayBase={0.2} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-24 font-mono-num text-[13px]" style={{ color: 'var(--earth-500)' }}>1001 =</span>
          <BitRow bits="1111101001" delayBase={0.4} />
        </div>
      </div>
    ),
  },
  {
    no: '②',
    title: '相加',
    body: (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 font-mono-num text-[14px]" style={{ color: 'var(--ink)' }}>
          <code>1111110101 + 1111110100 = 11111101001</code>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BitRow bits="11111101001" />
          <span className="font-hei text-[13px]" style={{ color: 'var(--earth-500)' }}>
            （即 2025，11 位）
          </span>
        </div>
      </div>
    ),
  },
  {
    no: '③',
    title: '相乘',
    body: (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 font-mono-num text-[14px]" style={{ color: 'var(--ink)' }}>
          <code>11111101001 × 1111101001 =</code>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BitRow bits="111101110111000010001" />
          <span className="font-hei text-[13px]" style={{ color: 'var(--earth-500)' }}>
            （21 位）
          </span>
        </div>
        <motion.div
          className="pt-2 font-mono-num font-bold"
          style={{ color: 'var(--seal)', fontSize: 'clamp(1.75rem, 4vw, 2.75rem)', textShadow: '0 0 24px rgba(212,169,82,0.45)' }}
          initial={{ scale: 0.9, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5, delay: 0.9, ease: [0.34, 1.4, 0.64, 1] }}
        >
          = 2,027,025
        </motion.div>
      </div>
    ),
  },
];

/** S7 算例：(1013+1012)×1001 = 2027025 */
export default function ExampleSection() {
  return (
    <section className="relative py-24 md:py-32" aria-label="算例">
      <div className="mx-auto max-w-4xl px-6">
        <SectionTitle seal="例" title="算例：(1013+1012)×1001" />
        <div className="paper-card relative mt-12 overflow-hidden p-6 md:p-10">
          <div className="absolute left-0 right-0 top-0 h-[3px]" style={{ background: 'var(--seal)' }} />
          <div className="space-y-10">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.no}
                className="flex gap-5"
                initial={{ y: 40, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: i * 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] font-mono-num text-[22px] font-bold text-white select-none"
                  style={{ background: 'var(--seal)' }}
                  aria-hidden
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-song text-[20px] font-semibold" style={{ color: 'var(--ink)' }}>
                    {step.title}
                  </h3>
                  <div className="mt-3">{step.body}</div>
                </div>
              </motion.div>
            ))}
          </div>
          <p className="mt-12 border-t pt-6 text-center font-song text-[18px]" style={{ borderColor: 'rgba(74,55,38,0.3)', color: 'var(--seal)' }}>
            这一切，只用了与、或、异或、非四种动作，和一面红蓝旗。
          </p>
        </div>
      </div>
    </section>
  );
}

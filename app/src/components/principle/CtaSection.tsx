import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { playDrum } from './sound';

/** S8 CTA 进入演算场（60vh）：书法字 + 巨大 DrumButton */
export default function CtaSection() {
  return (
    <section
      className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
      aria-label="进入演算场"
    >
      {/* 极低透明度的方阵点阵背景 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--bronze) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          opacity: 0.06,
        }}
        aria-hidden
      />

      <h2
        className="relative font-brush leading-[1.15] tracking-[0.08em] text-paper"
        style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}
      >
        {'萬軍已列陣'.split('').map((ch, i) => (
          <motion.span
            key={i}
            className="inline-block"
            initial={{ clipPath: 'inset(0 100% 0 0)', y: 20, opacity: 0 }}
            whileInView={{ clipPath: 'inset(0 -5% 0 0)', y: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            {ch}
          </motion.span>
        ))}
      </h2>

      <motion.p
        className="relative mt-5 text-[15px] text-sand"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.6, delay: 0.9 }}
      >
        亲手击鼓，看红旗与蓝旗算出 2027025。
      </motion.p>

      <motion.div
        className="relative mt-10"
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5, delay: 1.1 }}
      >
        {/* 呼吸脉冲 */}
        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.12 }}>
            <Link
              to="/"
              onClick={() => playDrum(0.3)}
              className="inline-flex items-center gap-3 rounded-full px-12 py-5 font-song text-[20px] font-bold tracking-[0.12em] text-paper transition-shadow"
              style={{
                background: 'var(--seal)',
                border: '2px solid var(--bronze)',
                boxShadow: '0 0 24px rgba(255,140,66,0.35)',
              }}
            >
              進入演算場
            </Link>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}

import { useRef } from 'react';
import { Link } from 'react-router';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Drum } from 'lucide-react';
import SectionTitle from '@/components/SectionTitle';
import FormationMap from '@/components/formation/FormationMap';
import RosterTable from '@/components/formation/RosterTable';
import InstructionCardAnatomy from '@/components/formation/InstructionCardAnatomy';
import BeatTimeline from '@/components/formation/BeatTimeline';

/** S1 页头（40vh）：印章「陣」64×64 + H1 + 副文 + 点阵视差背景 */
function PageHeader() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const dotY = useTransform(scrollYProgress, [0, 1], [0, 40]);

  return (
    <section ref={ref} className="relative flex min-h-[40vh] items-end overflow-hidden">
      {/* 士兵点阵背景（opacity 0.05，随滚动视差下移 40px） */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          y: dotY,
          backgroundImage: 'radial-gradient(circle, var(--sand) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          opacity: 0.05,
        }}
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-14 pt-24">
        <motion.span
          className="flex items-center justify-center rounded-sm font-brush text-white select-none"
          style={{
            width: 64,
            height: 64,
            background: 'var(--seal)',
            fontSize: 34,
            boxShadow: '0 4px 16px rgba(23,16,11,0.45), inset 0 0 8px rgba(255,255,255,0.12)',
          }}
          initial={{ scale: 1.6, rotate: 8, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.34, 1.8, 0.64, 1] }}
          aria-hidden
        >
          陣
        </motion.span>
        <motion.h1
          className="mt-6 font-song font-bold text-paper tracking-[0.02em]"
          style={{ fontSize: 'clamp(2.25rem, 5vw, 3.5rem)', lineHeight: 1.2 }}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          方阵总图与编制
        </motion.h1>
        <motion.p
          className="mt-4 text-[15px] tracking-[0.02em] text-sand"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          九百三十二名士兵的番号、站位与军令。
        </motion.p>
      </div>
    </section>
  );
}

/** S6 CTA：「看图千遍，不如击鼓一回。」+ 进入演算场 */
function CtaBanner() {
  return (
    <motion.div
      className="panel relative overflow-hidden px-6 py-14 text-center"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 120%, rgba(255,140,66,0.14), transparent 60%)' }}
        aria-hidden
      />
      <p className="relative font-brush text-paper" style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)', letterSpacing: '0.04em' }}>
        看图千遍，不如击鼓一回。
      </p>
      <motion.div className="relative mt-8 inline-block" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.2 }}>
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 rounded-md px-8 py-3.5 font-hei text-[15px] font-medium tracking-[0.06em] transition-shadow hover:shadow-ember"
          style={{ background: 'var(--seal)', color: 'var(--paper)', border: '2px solid var(--bronze)' }}
        >
          <Drum size={18} aria-hidden />
          進入演算場
        </Link>
      </motion.div>
    </motion.div>
  );
}

/**
 * 阵图页 /formation（design/formation.md）：
 * S1 页头 / S2 阵型总图（交互 SVG）/ S3 编制花名册 / S4 指令卡规范 / S5 拍节时间线 / S6 CTA。
 * 数字以网表实测为准：932 门、62 拍、21 位输出。
 */
export default function Formation() {
  return (
    <div className="pb-24">
      <PageHeader />

      {/* S2 阵型总图 */}
      <section className="mx-auto max-w-6xl px-6 pt-16">
        <SectionTitle seal="圖" title="阵型俯瞰总图" />
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-sand">
          顶视图按演算场 3D 坐标等比绘制：北在上，信号自南向北逐级推进。
          悬停任一色块查看该分区编制，点击可锁定详情。
        </p>
        <div className="mt-8">
          <FormationMap />
        </div>
      </section>

      {/* S3 编制表（花名册） */}
      <section className="mx-auto max-w-6xl px-6 pt-24">
        <SectionTitle seal="籍" title="编制花名册" />
        <div className="mt-8">
          <RosterTable />
        </div>
      </section>

      {/* S4 指令卡规范 */}
      <section className="mx-auto max-w-6xl px-6 pt-24">
        <SectionTitle seal="令" title="指令卡规范" />
        <div className="mt-8">
          <InstructionCardAnatomy />
        </div>
      </section>

      {/* S5 拍节时间线 */}
      <section className="mx-auto max-w-4xl px-6 pt-24">
        <SectionTitle seal="拍" title="从注入到报捷" />
        <div className="mt-10">
          <BeatTimeline />
        </div>
      </section>

      {/* S6 CTA */}
      <section className="mx-auto max-w-6xl px-6 pt-24">
        <CtaBanner />
      </section>
    </div>
  );
}

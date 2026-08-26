import { useRef } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';

interface Beat {
  beat: string;
  title: string;
  desc: string;
  /** 波前金光扫过（仅累加陣节点） */
  sweep?: boolean;
}

/** 拍节数据：网表实测（src/sim/netlist.ts，maxLayer = 62） */
const BEATS: Beat[] = [
  { beat: '第 0 拍', title: '注入', desc: '三十名输入手按甲乙丙翻旗，红旗为 1、蓝旗为 0，全场屏息。' },
  { beat: '第 1–21 拍', title: '加法陣', desc: '十位全加器行波进位，进位向东，S = A + B 逐位成形。' },
  { beat: '第 3–22 拍', title: '部分積陣', desc: '随和数逐位成形，一百一十名与门依次举旗，十份部分积就位。' },
  { beat: '第 4–60 拍', title: '累加陣', desc: '九条加法带自南向北层层推进，鼓点波前扫过全场七百二十人。', sweep: true },
  { beat: '第 61–62 拍', title: '报捷', desc: '第 61 拍输出手二十一人集体亮相；第 62 拍 DONE 旗举红，鼓声连奏。' },
];

function BeatNode({ b, i }: { b: Beat; i: number }) {
  return (
    <li className="relative pl-10">
      {/* 节点圆点 */}
      <motion.span
        className="absolute left-0 top-1.5 block rounded-full"
        style={{
          width: 12,
          height: 12,
          marginLeft: -5,
          background: 'var(--gold)',
          boxShadow: '0 0 12px rgba(212,169,82,0.55)',
        }}
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.35, delay: i * 0.05, ease: [0.34, 1.8, 0.64, 1] }}
        aria-hidden
      />
      <motion.div
        className="panel relative overflow-hidden p-5"
        initial={{ x: -20, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.4, delay: 0.08 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="font-mono-num text-[14px] font-bold" style={{ color: 'var(--gold)' }}>
          {b.beat}
        </div>
        <h3 className="mt-1 font-song text-[18px] font-semibold text-paper">{b.title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-sand">{b.desc}</p>
        {/* 累加陣节点：波前金光扫过 */}
        {b.sweep && (
          <motion.span
            className="pointer-events-none absolute inset-y-0 w-1/3"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(212,169,82,0.22), transparent)',
            }}
            initial={{ x: '-120%' }}
            whileInView={{ x: '420%' }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: 0.4, ease: 'easeInOut' }}
            aria-hidden
          />
        )}
      </motion.div>
    </li>
  );
}

/**
 * S5 拍节时间线：竖向时间线（左侧 2px 青铜竖线 scaleY scrub + 节点圆点）。
 * 拍数为网表实测 62 拍，非约数。
 */
export default function BeatTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.75', 'end 0.55'] });
  const scaleY = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  const lineScale = useTransform(scaleY, (v) => Math.min(1, Math.max(0, v)));

  return (
    <div ref={ref} className="relative">
      {/* 轨道底 + 青铜竖线（滚动驱动自顶向下生长） */}
      <span className="absolute left-0 top-0 bottom-0 w-px" style={{ background: 'rgba(176,138,79,0.18)' }} aria-hidden />
      <motion.span
        className="absolute left-0 top-0 bottom-0 w-[2px] -translate-x-px origin-top"
        style={{ background: 'var(--bronze)', scaleY: lineScale }}
        aria-hidden
      />
      <ol className="space-y-8">
        {BEATS.map((b, i) => (
          <BeatNode key={b.beat} b={b} i={i} />
        ))}
      </ol>
      <p className="mt-6 pl-10 text-[11px]" style={{ color: 'var(--earth-500)' }}>
        拍数为网表实测：拓扑分层共 63 层（第 0–62 层），自注入至报捷凡 62 击鼓。
        加法陣尾段与部分積陣、累加陣首带交叠推进，故拍段并非首尾相接。
      </p>
    </div>
  );
}

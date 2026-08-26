import { memo } from 'react';
import { motion } from 'framer-motion';
import { Flag, Timer, ScrollText } from 'lucide-react';
import SectionTitle from '@/components/SectionTitle';

/* ---------- 卡内循环微动画（隔离 + memo，错相 0.6s） ---------- */

/** 旗语卡：一红一蓝两面小旗，交替翻转 */
const MiniFlags = memo(function MiniFlags() {
  return (
    <div className="flex items-end gap-3" aria-hidden>
      {[0, 1].map((i) => (
        <motion.svg
          key={i}
          width="26"
          height="36"
          viewBox="0 0 26 36"
          animate={{ rotate: [0, i === 0 ? 6 : -6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.6 }}
          style={{ originX: '8px', originY: '34px' }}
        >
          <line x1="8" y1="4" x2="8" y2="34" stroke="var(--bronze)" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M8 5 L22 5 L22 17 L8 17 Z"
            fill={i === 0 ? 'var(--flag-red)' : 'var(--flag-blue)'}
          />
        </motion.svg>
      ))}
    </div>
  );
});

/** 节拍卡：三道同心声波环扩散 */
const MiniWaves = memo(function MiniWaves() {
  return (
    <div className="relative flex h-10 w-16 items-center justify-start" aria-hidden>
      <div className="h-3 w-3 rounded-full" style={{ background: 'var(--ember)' }} />
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute left-[5px] rounded-full border"
          style={{ borderColor: 'rgba(255,140,66,0.7)' }}
          animate={{ width: [12, 52], height: [12, 52], x: ['-50%', '-50%'], y: ['-50%', '-50%'], opacity: [0.9, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: i * 0.6 }}
        />
      ))}
    </div>
  );
});

/** 指令卡：迷你指令卡图样滑入循环 */
const MiniCard = memo(function MiniCard() {
  return (
    <div className="relative h-11 w-16 overflow-hidden" aria-hidden>
      <motion.div
        className="absolute left-1 top-1 w-14 rounded-sm p-1.5"
        style={{ background: 'var(--paper)', boxShadow: '0 2px 6px rgba(23,16,11,0.4)' }}
        animate={{ x: [0, 3, 0], rotate: [0, -2, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="mb-1 h-1 w-8 rounded-full" style={{ background: 'var(--seal)' }} />
        <div className="mb-1 h-[3px] w-11 rounded-full" style={{ background: 'var(--earth-500)' }} />
        <div className="mb-1 h-[3px] w-9 rounded-full" style={{ background: 'var(--earth-500)' }} />
        <div className="flex gap-1">
          <span className="h-[5px] w-2 rounded-[1px]" style={{ background: 'var(--flag-red)' }} />
          <span className="h-[5px] w-2 rounded-[1px]" style={{ background: 'var(--flag-blue)' }} />
        </div>
      </motion.div>
    </div>
  );
});

/* ---------- 卡片数据 ---------- */

const RULES = [
  {
    icon: Flag,
    title: '旗语',
    body: '红旗为一，蓝旗为零。信息只有两种颜色，正如电路只有高低电平。',
    art: <MiniFlags />,
  },
  {
    icon: Timer,
    title: '节拍',
    body: '战鼓一响，全军同一瞬间读旗举旗，并保持到下一拍。鼓点就是时钟脉冲。',
    art: <MiniWaves />,
  },
  {
    icon: ScrollText,
    title: '指令卡',
    body: '每人怀中一纸军令：门牌号、职能、上游甲、上游乙、真值表。除此五事，一无所知，也一无所知所需。',
    art: <MiniCard />,
  },
];

/** S3 三条军规（三卡片，深色面板，hover 描边转金 + 上浮 + ember 光晕） */
export default function RulesSection() {
  return (
    <section className="relative py-24 md:py-32" aria-label="三条军规">
      <div className="mx-auto max-w-6xl px-6">
        <SectionTitle seal="令" title="三条军规" />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {RULES.map((rule, i) => {
            const Icon = rule.icon;
            return (
              <motion.div
                key={rule.title}
                className="group rounded-lg p-6 transition-[border-color,box-shadow] [transition-duration:250ms]"
                style={{
                  background: 'var(--earth-900)',
                  border: '1px solid rgba(176,138,79,0.35)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                }}
                initial={{ y: 60, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.5, delay: i * 0.18, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{
                  y: -4,
                  borderColor: 'rgba(212,169,82,0.7)',
                  boxShadow: '0 0 24px rgba(255,140,66,0.35), 0 8px 32px rgba(0,0,0,0.5)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-md"
                    style={{ border: '1px solid rgba(176,138,79,0.35)', color: 'var(--gold)' }}
                  >
                    <Icon size={22} strokeWidth={1.75} />
                  </div>
                  {rule.art}
                </div>
                <h3 className="mt-5 font-song text-[20px] font-semibold text-paper">{rule.title}</h3>
                <p className="mt-3 text-[14px] leading-[1.8] text-sand">{rule.body}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

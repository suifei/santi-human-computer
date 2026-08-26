import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * 印章标题 SectionTitle（design.md §9.3）：
 * 朱红方章（白色篆体单字）+ H2 + 右侧延伸青铜细线。
 * 入场：印章盖章式落下（scale 1.6→1 + rotate 8°→0°，back.out），标题自左滑入。
 * 视口 30% 触发，只播一次。
 */
export default function SectionTitle({
  seal,
  title,
  className,
}: {
  seal: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <motion.div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] font-song text-[20px] font-bold leading-none text-white select-none"
        style={{ background: 'var(--seal)', boxShadow: '0 2px 8px rgba(23,16,11,0.4)' }}
        initial={{ scale: 1.6, rotate: 8, opacity: 0 }}
        whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.3, ease: [0.175, 0.885, 0.32, 1.65] }}
        aria-hidden
      >
        {seal}
      </motion.div>
      <motion.h2
        className="font-song font-semibold text-paper tracking-[0.02em] leading-[1.3] whitespace-nowrap"
        style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' }}
        initial={{ x: -24, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      >
        {title}
      </motion.h2>
      <motion.div
        className="h-px flex-1 origin-left"
        style={{ background: 'linear-gradient(90deg, rgba(176,138,79,0.6), rgba(176,138,79,0.05))' }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden
      />
    </div>
  );
}

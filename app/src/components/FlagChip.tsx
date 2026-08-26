import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * 位芯片 FlagChip（design.md §9.4）：18×22px，表示一个二进制位。
 * 1=朱红底白字，0=钢蓝底白字，未激活=夯土深底。值变化时 rotateY 翻转 300ms。
 */
export default function FlagChip({
  value,
  active = true,
  className,
}: {
  value: 0 | 1 | null;
  active?: boolean;
  className?: string;
}) {
  const shown = active && value !== null;
  const bg = !shown ? 'var(--earth-700)' : value === 1 ? 'var(--flag-red)' : 'var(--flag-blue)';
  const fg = !shown ? 'var(--earth-300)' : '#FFFFFF';
  return (
    <motion.span
      key={`${shown}-${value}`}
      className={cn('inline-flex items-center justify-center rounded-sm font-mono text-[12px] leading-none select-none', className)}
      style={{
        width: 18,
        height: 22,
        background: bg,
        color: fg,
        transformStyle: 'preserve-3d',
      }}
      initial={{ rotateY: 90, opacity: 0.5 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      aria-label={shown ? (value === 1 ? '1（红旗）' : '0（蓝旗）') : '未激活'}
    >
      {shown ? value : '·'}
    </motion.span>
  );
}

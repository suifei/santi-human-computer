/** 悬浮面板通用件：Panel（深色木案）、DrumButton（战鼓主 CTA）、StatusBadge */
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Status } from '@/sim/store';

export function Panel({ title, className, children, style }: { title?: string; className?: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={cn('panel p-4', className)} style={style}>
      {title && <div className="panel-title mb-3">{title}</div>}
      {children}
    </div>
  );
}

/** 战鼓按钮（design.md §9.5） */
export function DrumButton({
  children, onClick, disabled, className, pulse,
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; pulse?: boolean;
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-md border-2 font-medium tracking-[0.06em] text-paper disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      style={{
        background: 'var(--seal)',
        borderColor: 'var(--bronze)',
        boxShadow: '0 4px 16px rgba(23,16,11,0.35)',
      }}
      whileHover={disabled ? undefined : { scale: 1.04, boxShadow: '0 0 24px rgba(255,140,66,0.35)' }}
      whileTap={disabled ? undefined : { scale: 0.96, transition: { duration: 0.12 } }}
      animate={pulse && !disabled ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={pulse && !disabled ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
    >
      {children}
    </motion.button>
  );
}

const STATUS_META: Record<Status, { label: string; color: string; bg: string; pulse?: boolean }> = {
  LOADING: { label: '加载中', color: 'var(--earth-300)', bg: 'rgba(74,55,38,0.4)' },
  IDLE: { label: '待机', color: 'var(--sand)', bg: 'rgba(74,55,38,0.5)' },
  INJECTING: { label: '注入中', color: 'var(--gold)', bg: 'rgba(212,169,82,0.15)' },
  READY: { label: '就绪', color: 'var(--gold)', bg: 'rgba(212,169,82,0.18)' },
  RUNNING: { label: '演算中', color: 'var(--ember)', bg: 'rgba(255,140,66,0.14)', pulse: true },
  PAUSED: { label: '暂停', color: 'var(--ember)', bg: 'rgba(255,140,66,0.10)' },
  DONE: { label: '完成', color: 'var(--gold)', bg: 'rgba(163,46,34,0.5)' },
  RESETTING: { label: '复位中', color: 'var(--sand)', bg: 'rgba(74,55,38,0.5)', pulse: true },
};

export function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <motion.span
      className="inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[12px] font-medium"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}` }}
      animate={m.pulse ? { opacity: [1, 0.55, 1] } : { opacity: 1 }}
      transition={m.pulse ? { duration: 1.2, repeat: Infinity } : { duration: 0.3 }}
    >
      {m.label}
    </motion.span>
  );
}

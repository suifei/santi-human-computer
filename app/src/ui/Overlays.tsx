/** 图例 + Toast + 机位按钮组（home.md §8.7 / §8.8 / §3.3） */
import { motion, AnimatePresence } from 'framer-motion';
import { useSim, type Preset } from '@/sim/store';
import { cn } from '@/lib/utils';

/* ---------- 图例（左下） ---------- */
export function Legend() {
  return (
    <div className="panel pointer-events-auto flex items-center gap-4 px-3 py-2 text-[12px]" style={{ color: 'var(--sand)' }}>
      <span className="flex items-center gap-1.5">
        <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'var(--flag-red)' }} /> 红旗 = 1
      </span>
      <span className="flex items-center gap-1.5">
        <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'var(--flag-blue)' }} /> 蓝旗 = 0
      </span>
      <span className="flex items-center gap-1.5">
        <span style={{ color: 'var(--gold)' }}>♪</span> 鼓响 = 同时举旗
      </span>
    </div>
  );
}

/* ---------- Toast ---------- */
export function Toasts() {
  const toasts = useSim((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-4 top-20 z-40 flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="rounded-sm border px-3 py-2 text-[13px]"
            style={{ background: 'rgba(23,16,11,0.88)', borderColor: 'rgba(212,169,82,0.55)', color: 'var(--sand)' }}
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------- 机位按钮组（右下） ---------- */
const PRESET_BTNS: { key: Preset; label: string; hotkey: string }[] = [
  { key: 'overview', label: '全景', hotkey: '1' },
  { key: 'top', label: '俯瞰布阵', hotkey: '2' },
  { key: 'input', label: '注入列', hotkey: '3' },
  { key: 'drum', label: '鼓台', hotkey: '4' },
  { key: 'output', label: '输出端', hotkey: '5' },
  { key: 'follow', label: '跟随信号', hotkey: 'F' },
];

export function CameraPresets() {
  const preset = useSim((s) => s.preset);
  const setPreset = useSim((s) => s.setPreset);
  return (
    <div className="panel pointer-events-auto flex flex-col gap-1 p-2" role="group" aria-label="机位">
      <div className="panel-title mb-1 px-1">機位</div>
      {PRESET_BTNS.map((b) => (
        <button
          key={b.key}
          type="button"
          onClick={() => setPreset(b.key)}
          className={cn('flex items-center justify-between gap-3 rounded-sm px-2 py-1 text-[12px] transition-colors')}
          style={{
            color: preset === b.key ? 'var(--ink)' : 'var(--sand)',
            background: preset === b.key ? 'var(--gold)' : 'transparent',
          }}
        >
          {b.label}
          <span className="font-mono text-[10px] opacity-60">{b.hotkey}</span>
        </button>
      ))}
    </div>
  );
}

/** 鼓令台（home.md §8.4）：播放/暂停、单拍、复位、瞬算、速度、拍数、状态 */
import { motion } from 'framer-motion';
import { Pause, RotateCcw, FastForward, ChevronRight } from 'lucide-react';
import { useSim, type Speed } from '@/sim/store';
import { StatusBadge } from './common';
import { cn } from '@/lib/utils';

const SPEEDS: Speed[] = [0.5, 1, 2, 4, 8];

export default function DrumConsole() {
  const status = useSim((s) => s.status);
  const tick = useSim((s) => s.tick);
  const maxLayer = useSim((s) => s.netlist.maxLayer);
  const gateN = useSim((s) => s.netlist.stats.total);
  const speed = useSim((s) => s.speed);
  const mode = useSim((s) => s.mode);
  const programRound = useSim((s) => s.programRound);
  const programLabel = useSim((s) => s.programLabel);
  const programUntil = useSim((s) => s.programUntil);
  const drumPulse = useSim((s) => s.drumPulse);
  const toggleRun = useSim((s) => s.toggleRun);
  const stepOnce = useSim((s) => s.stepOnce);
  const resetAll = useSim((s) => s.resetAll);
  const fastForward = useSim((s) => s.fastForward);
  const setSpeed = useSim((s) => s.setSpeed);

  const canRun = status === 'READY' || status === 'PAUSED' || status === 'RUNNING';
  const running = status === 'RUNNING';
  const beats = mode === 'program' && programUntil > 0 ? programUntil : maxLayer;

  return (
    <div className="panel flex items-center gap-3 px-4 py-3" role="group" aria-label="鼓令台">
      {/* 大鼓按钮 */}
      <motion.button
        type="button"
        onClick={toggleRun}
        disabled={!canRun}
        aria-label={running ? '暫停演算' : '擊鼓演算'}
        className="flex h-14 w-14 items-center justify-center rounded-full border-2 text-paper disabled:opacity-40"
        style={{ background: 'var(--seal)', borderColor: 'var(--bronze)' }}
        animate={{ scale: 1 }}
        whileTap={{ scale: 0.94 }}
        key={`drum-${drumPulse}`}
        initial={{ scale: 0.92 }}
        transition={{ duration: 0.18 }}
        whileHover={canRun ? { boxShadow: '0 0 24px rgba(255,140,66,0.35)' } : undefined}
      >
        {running ? <Pause size={22} /> : <span className="font-brush text-[24px] leading-none">鼓</span>}
      </motion.button>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <ConsoleBtn onClick={stepOnce} disabled={!canRun || running} icon={<ChevronRight size={14} />} label="單拍" />
          <ConsoleBtn onClick={resetAll} disabled={status === 'LOADING' || status === 'RESETTING'} icon={<RotateCcw size={14} />} label="復位" />
          <ConsoleBtn onClick={fastForward} disabled={!canRun} icon={<FastForward size={14} />} label="瞬算" />
        </div>
        {/* 速度五档 */}
        <div className="flex gap-1" role="radiogroup" aria-label="速度">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSpeed(sp)}
              className={cn('rounded-sm px-1.5 py-0.5 font-mono text-[11px] transition-colors')}
              style={{
                color: speed === sp ? 'var(--ink)' : 'var(--bronze)',
                background: speed === sp ? 'var(--gold)' : 'transparent',
                border: '1px solid rgba(176,138,79,0.35)',
              }}
            >
              {sp}×
            </button>
          ))}
        </div>
      </div>

      {/* 拍数 + 进度 */}
      <div className="min-w-[132px]">
        <div className="font-mono text-[16px]" style={{ color: 'var(--gold)' }}>
          第 {tick} / {beats} 拍
        </div>
        <div className="text-[11px]" style={{ color: 'var(--earth-300)' }}>
          {gateN} 門{mode === 'program' && programLabel ? ` · ${programLabel}` : ''}
          {mode === 'program' ? ` · 第 ${programRound} 輪` : ''}
        </div>
        <div className="mt-1.5 h-[3px] w-full rounded-sm" style={{ background: 'var(--earth-700)' }}>
          <div
            className="h-full rounded-sm transition-[width] duration-200"
            style={{ width: `${(tick / Math.max(1, beats)) * 100}%`, background: 'var(--gold)' }}
          />
        </div>
      </div>

      <StatusBadge status={status} />
    </div>
  );
}

function ConsoleBtn({ onClick, disabled, icon, label }: { onClick: () => void; disabled?: boolean; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-sm border px-2 py-1 text-[13px] transition-colors hover:border-gold hover:text-gold disabled:opacity-40"
      style={{ borderColor: 'rgba(176,138,79,0.35)', color: 'var(--sand)' }}
    >
      {icon}
      {label}
    </button>
  );
}

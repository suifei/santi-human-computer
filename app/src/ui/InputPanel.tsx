/** 输入令面板（home.md §8.3）：A/B/C 十进制输入 + 10 位二进制预览 + 注入 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { useSim } from '@/sim/store';
import FlagChip from '@/components/FlagChip';
import { Panel, DrumButton } from './common';

function BitRow({ value }: { value: number }) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: 10 }, (_, i) => {
        const bit = (value >> (9 - i)) & 1;
        return <FlagChip key={`${i}-${bit}`} value={bit as 0 | 1} />;
      })}
    </div>
  );
}

function InputRow({ label, k }: { label: string; k: 'A' | 'B' | 'C' }) {
  const value = useSim((s) => s.inputs[k]);
  const setInput = useSim((s) => s.setInput);
  const status = useSim((s) => s.status);
  const [err, setErr] = useState(false);
  const locked = status === 'RUNNING' || status === 'INJECTING' || status === 'RESETTING';

  const commit = (raw: string) => {
    const v = Number(raw);
    if (raw !== '' && (!Number.isInteger(v) || v < 0 || v > 1023)) {
      setErr(true);
      setTimeout(() => setErr(false), 300);
      return;
    }
    setInput(k, raw === '' ? 0 : v);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-10 text-[13px] font-medium" style={{ color: 'var(--sand)' }}>{label}</span>
        <motion.input
          type="number"
          min={0}
          max={1023}
          value={value}
          disabled={locked}
          onChange={(e) => commit(e.target.value)}
          aria-label={`输入 ${label}`}
          className="w-24 rounded-sm border px-2 py-1 font-mono text-[18px] text-paper outline-none disabled:opacity-50"
          style={{
            background: 'rgba(23,16,11,0.6)',
            borderColor: err ? 'var(--flag-red)' : 'rgba(176,138,79,0.35)',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.45)',
          }}
          animate={err ? { x: [0, -5, 5, -3, 0] } : { x: 0 }}
          transition={{ duration: 0.3 }}
        />
        <div className="flex gap-1">
          {[-1, 1].map((d) => (
            <button
              key={d}
              type="button"
              disabled={locked}
              aria-label={d > 0 ? '加一' : '减一'}
              className="rounded-sm border p-1 transition-colors hover:border-gold disabled:opacity-40"
              style={{ borderColor: 'rgba(176,138,79,0.35)', color: 'var(--bronze)' }}
              onClick={() => setInput(k, value + d)}
            >
              {d > 0 ? <Plus size={14} /> : <Minus size={14} />}
            </button>
          ))}
        </div>
        {err && <span className="text-[11px]" style={{ color: 'var(--flag-red-bright)' }}>请输入 0–1023 的整数</span>}
      </div>
      <BitRow value={value} />
    </div>
  );
}

export default function InputPanel() {
  const setExample = useSim((s) => s.setExample);
  const inject = useSim((s) => s.inject);
  const status = useSim((s) => s.status);
  const busy = status === 'RUNNING' || status === 'INJECTING' || status === 'RESETTING';

  return (
    <Panel title="輸入令" className="w-[300px]">
      <div className="space-y-3">
        <InputRow label="甲 A" k="A" />
        <InputRow label="乙 B" k="B" />
        <InputRow label="丙 C" k="C" />
        <button
          type="button"
          onClick={setExample}
          disabled={busy}
          className="w-full rounded-sm border px-2 py-1 text-[13px] transition-colors hover:border-gold hover:text-gold disabled:opacity-40"
          style={{ borderColor: 'rgba(176,138,79,0.35)', color: 'var(--bronze)' }}
        >
          示例：(1013+1012)×1001
        </button>
        <DrumButton className="w-full py-2.5 text-[15px]" onClick={inject} disabled={busy}>
          注入方阵
        </DrumButton>
        <p className="text-[11px]" style={{ color: 'var(--earth-500)' }}>
          十进制 → 二进制，沿 X/Y 轴注入方阵
        </p>
      </div>
    </Panel>
  );
}

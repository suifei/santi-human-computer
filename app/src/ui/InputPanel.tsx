/** 输入令：位宽、军令表达式或程序、A/B/C 十进制 + 注入 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { useSim } from '@/sim/store';
import { BIT_WIDTHS, PRESET_EXPRS, displayExpr, inputMax, type BitWidth } from '@/sim/netlist';
import { PRESET_PROGRAMS } from '@/sim/lang';
import FlagChip from '@/components/FlagChip';
import { Panel, DrumButton } from './common';

function BitRow({ value, bits }: { value: number; bits: number }) {
  const rows = bits > 16 ? 2 : 1;
  const cols = bits / rows;
  return (
    <div className="space-y-0.5">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex flex-wrap gap-[2px]">
          {Array.from({ length: cols }, (_, c) => {
            const hi = bits - 1 - (r * cols + c);
            const bit = Number((BigInt(value >>> 0) >> BigInt(hi)) & 1n) as 0 | 1;
            return <FlagChip key={hi} value={bit} />;
          })}
        </div>
      ))}
    </div>
  );
}

function InputRow({ label, k }: { label: string; k: 'A' | 'B' | 'C' }) {
  const value = useSim((s) => s.inputs[k]);
  const setInput = useSim((s) => s.setInput);
  const bits = useSim((s) => s.bits);
  const status = useSim((s) => s.status);
  const [err, setErr] = useState(false);
  const locked = status === 'RUNNING' || status === 'INJECTING' || status === 'RESETTING';
  const max = inputMax(bits);

  const commit = (raw: string) => {
    const v = Number(raw);
    if (raw !== '' && (!Number.isInteger(v) || v < 0 || v > max)) {
      setErr(true);
      setTimeout(() => setErr(false), 300);
      return;
    }
    setInput(k, raw === '' ? 0 : v);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-[13px] font-medium" style={{ color: 'var(--sand)' }}>{label}</span>
        <motion.input
          type="number"
          min={0}
          max={max}
          value={value}
          disabled={locked}
          onChange={(e) => commit(e.target.value)}
          aria-label={`输入 ${label}`}
          className="w-36 rounded-sm border px-2 py-1 font-mono text-[16px] text-paper outline-none disabled:opacity-50"
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
      </div>
      {err && (
        <span className="text-[11px]" style={{ color: 'var(--flag-red-bright)' }}>
          请输入 0–{max.toLocaleString('en-US')} 的整数
        </span>
      )}
      <BitRow value={value} bits={bits} />
    </div>
  );
}

export default function InputPanel() {
  const setExample = useSim((s) => s.setExample);
  const inject = useSim((s) => s.inject);
  const status = useSim((s) => s.status);
  const bits = useSim((s) => s.bits);
  const expr = useSim((s) => s.expr);
  const mode = useSim((s) => s.mode);
  const programText = useSim((s) => s.programText);
  const setBits = useSim((s) => s.setBits);
  const setExpr = useSim((s) => s.setExpr);
  const setMode = useSim((s) => s.setMode);
  const setProgramText = useSim((s) => s.setProgramText);
  const gates = useSim((s) => s.netlist.stats.total);
  const maxLayer = useSim((s) => s.netlist.maxLayer);
  const busy = status === 'RUNNING' || status === 'INJECTING' || status === 'RESETTING';
  const [draft, setDraft] = useState(expr);
  const [progDraft, setProgDraft] = useState(programText);
  const [exprErr, setExprErr] = useState('');
  useEffect(() => { setDraft(expr); }, [expr]);
  useEffect(() => { setProgDraft(programText); }, [programText]);

  const commitExpr = () => {
    const ok = setExpr(draft);
    setExprErr(ok ? '' : '军令未采纳');
    if (ok) setDraft(useSim.getState().expr);
  };

  return (
    <Panel title="輸入令" className="flex max-h-full min-h-0 w-[320px] flex-col overflow-hidden [&_.panel-title]:shrink-0">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
        <div className="flex gap-1">
          {([['expr', '军令'], ['program', '程序']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              disabled={busy}
              onClick={() => setMode(k)}
              className="rounded-sm px-2 py-0.5 text-[12px]"
              style={{
                color: mode === k ? 'var(--ink)' : 'var(--sand)',
                background: mode === k ? 'var(--gold)' : 'transparent',
                border: '1px solid rgba(176,138,79,0.35)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: 'var(--earth-300)' }}>位宽</span>
          {BIT_WIDTHS.map((b) => (
            <button
              key={b}
              type="button"
              disabled={busy}
              onClick={() => { setBits(b as BitWidth); }}
              className="rounded-sm px-2 py-0.5 font-mono text-[11px]"
              style={{
                color: bits === b ? 'var(--ink)' : 'var(--sand)',
                background: bits === b ? 'var(--gold)' : 'transparent',
                border: '1px solid rgba(176,138,79,0.35)',
              }}
            >
              {b}位
            </button>
          ))}
        </div>
        {mode === 'expr' ? (
          <div>
            <div className="mb-1 flex flex-wrap gap-1">
              {PRESET_EXPRS.map((p) => (
                <button
                  key={p.expr}
                  type="button"
                  disabled={busy}
                  onClick={() => { setExpr(p.expr); setDraft(p.expr); setExprErr(''); }}
                  className="rounded-sm px-1.5 py-0.5 text-[11px]"
                  style={{
                    color: expr === p.expr ? 'var(--ink)' : 'var(--bronze)',
                    background: expr === p.expr ? 'var(--gold)' : 'transparent',
                    border: '1px solid rgba(176,138,79,0.35)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitExpr}
              onKeyDown={(e) => { if (e.key === 'Enter') commitExpr(); }}
              aria-label="军令表达式"
              className="w-full rounded-sm border px-2 py-1 font-mono text-[13px] text-paper outline-none disabled:opacity-50"
              style={{
                background: 'rgba(23,16,11,0.6)',
                borderColor: exprErr ? 'var(--flag-red)' : 'rgba(176,138,79,0.35)',
              }}
            />
          </div>
        ) : (
          <div>
            <div className="mb-1 flex flex-wrap gap-1">
              {PRESET_PROGRAMS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={busy}
                  onClick={() => { setProgramText(p.src); setProgDraft(p.src); if (p.label === '累加乘法') setExample(); }}
                  className="rounded-sm px-1.5 py-0.5 text-[11px]"
                  style={{
                    color: programText === p.src ? 'var(--ink)' : 'var(--bronze)',
                    background: programText === p.src ? 'var(--gold)' : 'transparent',
                    border: '1px solid rgba(176,138,79,0.35)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <textarea
              value={progDraft}
              disabled={busy}
              onChange={(e) => setProgDraft(e.target.value)}
              onBlur={() => setProgramText(progDraft)}
              aria-label="程序源码"
              rows={8}
              spellCheck={false}
              className="w-full resize-none rounded-sm border px-2 py-1 font-mono text-[12px] leading-relaxed text-paper outline-none disabled:opacity-50"
              style={{
                background: 'rgba(23,16,11,0.6)',
                borderColor: 'rgba(176,138,79,0.35)',
              }}
            />
            <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--earth-500)' }}>
              数据通路一次列齐：寄存器、加减乘除、比较都在。循环请用较小的乙 B。
            </p>
          </div>
        )}
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
          {mode === 'program'
            ? '示例输入：A=7 B=5'
            : bits === 10 ? '示例：(1013+1012)×1001' : '示例：A=1013 B=1012 C=1001'}
        </button>
      </div>
      <div
        className="mt-3 shrink-0 space-y-2 border-t pt-3"
        style={{ borderColor: 'rgba(176,138,79,0.28)' }}
      >
        <DrumButton className="w-full py-2.5 text-[15px]" onClick={inject} disabled={busy}>
          {mode === 'program' ? '加载程序' : '注入方阵'}
        </DrumButton>
        <p className="text-[11px]" style={{ color: 'var(--earth-500)' }}>
          {mode === 'program'
            ? `数据通路全员列阵 · ${bits} 位 · ${gates} 门`
            : `${displayExpr(expr)} · ${bits} 位无符号 · ${gates} 门 / ${maxLayer} 拍${expr.includes('-') ? ' · 减法按无符号环绕' : ''}`}
        </p>
      </div>
    </Panel>
  );
}

/** 战果面板：二进制结果 + 十进制（BigInt）+ 校验行 */
import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useSim } from '@/sim/store';
import { readResult, readCpuResult, displayExpr } from '@/sim/netlist';
import { evalExpr, parseProgram } from '@/sim/program';
import FlagChip from '@/components/FlagChip';
import { Panel } from './common';

export default function OutputPanel() {
  const status = useSim((s) => s.status);
  const tick = useSim((s) => s.tick);
  const inputs = useSim((s) => s.inputs);
  const result = useSim((s) => s.result);
  const expr = useSim((s) => s.expr);
  const bits = useSim((s) => s.bits);
  const mode = useSim((s) => s.mode);
  const regs = useSim((s) => s.regs);
  const programLine = useSim((s) => s.programLine);
  const programRound = useSim((s) => s.programRound);
  const programLabel = useSim((s) => s.programLabel);
  const programOp = useSim((s) => s.programOp);
  const commitNonce = useSim((s) => s.commitNonce);
  const startedAt = useSim((s) => s.startedAt);
  const finishedAt = useSim((s) => s.finishedAt);

  const st = useSim.getState();
  const outIds = mode === 'program' && programOp && st.netlist.cpu
    ? st.netlist.cpu.outs[programOp]
    : st.netlist.outBits;
  const nOut = outIds.length;
  const liveBits: (0 | 1)[] = [];
  for (let i = nOut - 1; i >= 0; i--) {
    liveBits.push(st.values[st.netlist.byId.get(outIds[i])!.index] as 0 | 1);
  }
  void commitNonce;

  const shown = status === 'DONE'
    ? result ?? 0n
    : mode === 'program' && programOp
      ? readCpuResult(st.netlist, st.values, programOp)
      : readResult(st.netlist, st.values);
  const shownNum = shown <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(shown) : null;

  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString('en-US'));
  useEffect(() => {
    if (status === 'DONE' && result !== null && shownNum !== null) {
      mv.set(0);
      const c = animate(mv, shownNum, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
      return c.stop;
    }
  }, [status, result, shownNum, mv]);

  const elapsed = startedAt !== null && finishedAt !== null ? ((finishedAt - startedAt) / 1000).toFixed(1) : null;
  const parsed = mode === 'expr' ? parseProgram(expr) : { ok: false as const };
  let expect: bigint | null = null;
  if (parsed.ok) {
    try { expect = evalExpr(parsed.ast, BigInt(inputs.A), BigInt(inputs.B), BigInt(inputs.C), bits); }
    catch { expect = null; }
  }
  const match = result !== null && expect !== null && result === expect;

  return (
    <Panel title="戰果" className="flex w-[320px] max-h-full flex-col overflow-hidden">
      {status === 'IDLE' || status === 'LOADING' ? (
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--earth-500)' }}>
          等待注入 —— 大軍列陣，靜候將令
        </p>
      ) : (
        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain">
          <div className="flex max-h-28 flex-wrap gap-[2px] overflow-y-auto" aria-label="二進位結果">
            {liveBits.map((b, i) => (
              <span key={i} style={{ marginLeft: i > 0 && (nOut - i) % 4 === 0 ? 6 : 0 }}>
                <FlagChip value={b} active={status !== 'INJECTING' && status !== 'RESETTING' && (status === 'DONE' || tick > 0)} />
              </span>
            ))}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--earth-500)' }}>{nOut} 位輸出</p>
          {mode === 'program' && (
            <div className="space-y-1">
              <p className="font-mono text-[11px]" style={{ color: 'var(--gold)' }}>
                {programLabel || '程序'}{programLine ? ` · 第 ${programLine} 行` : ''} · 第 {programRound} 輪
              </p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[11px]" style={{ color: 'var(--sand)' }}>
                {regs.map((v, i) => (
                  <span key={i}>R{i} {v.toLocaleString()}</span>
                ))}
              </div>
            </div>
          )}

          {status === 'DONE' ? (
            <motion.div
              animate={{ boxShadow: ['0 0 0px rgba(212,169,82,0)', '0 0 18px rgba(212,169,82,0.5)', '0 0 0px rgba(212,169,82,0)'] }}
              transition={{ duration: 0.9, repeat: 2 }}
              className="rounded-sm px-1 py-1"
            >
              {shownNum !== null ? (
                <motion.span className="font-mono text-[28px] font-bold leading-none" style={{ color: 'var(--gold)' }}>
                  {text}
                </motion.span>
              ) : (
                <span className="font-mono text-[22px] font-bold leading-none" style={{ color: 'var(--gold)' }}>
                  {shown.toLocaleString()}
                </span>
              )}
            </motion.div>
          ) : (
            <div className="font-mono text-[20px]" style={{ color: 'var(--sand)' }}>
              {status === 'RUNNING' || status === 'PAUSED' ? `演算中 · 第 ${tick} 拍` : '就緒 · 靜候鼓令'}
            </div>
          )}

          {status === 'DONE' && (
            <>
              <p className="font-mono text-[12px] leading-relaxed" style={{ color: 'var(--sand)' }}>
                {mode === 'program'
                  ? `R0 = ${result?.toLocaleString() ?? '?'}`
                  : <>{displayExpr(expr)} = {expect?.toLocaleString() ?? '?'}{' '}
                    <span style={{ color: match ? 'var(--gold)' : 'var(--flag-red-bright)' }}>{match ? '✓' : '≠ 網表'}</span></>}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--earth-300)' }}>
                DONE 旗已舉 · 共 {tick} 拍{elapsed ? ` · 用時 ${elapsed} 秒` : ''}
              </p>
            </>
          )}
          {status !== 'DONE' && shown > 0n && (
            <p className="font-mono text-[12px]" style={{ color: 'var(--earth-500)' }}>當前讀數 {shown.toLocaleString()}</p>
          )}
        </div>
      )}
    </Panel>
  );
}

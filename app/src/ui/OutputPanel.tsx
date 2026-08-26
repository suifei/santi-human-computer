/** 战果面板（home.md §8.5）：二进制结果 + 十进制大数字（odometer）+ 校验行 */
import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useSim } from '@/sim/store';
import { readResult } from '@/sim/netlist';
import FlagChip from '@/components/FlagChip';
import { Panel } from './common';

export default function OutputPanel() {
  const status = useSim((s) => s.status);
  const tick = useSim((s) => s.tick);
  const inputs = useSim((s) => s.inputs);
  const result = useSim((s) => s.result);
  const commitNonce = useSim((s) => s.commitNonce);
  const startedAt = useSim((s) => s.startedAt);
  const finishedAt = useSim((s) => s.finishedAt);

  // 实时从输出手读数（演算中随翻旗点亮）
  const liveBits: (0 | 1)[] = [];
  const st = useSim.getState();
  for (let i = 20; i >= 0; i--) {
    liveBits.push(st.values[st.netlist.byId.get(st.netlist.outBits[i])!.index] as 0 | 1);
  }
  void commitNonce;

  const shown = status === 'DONE' ? result ?? 0 : readResult(st.netlist, st.values);

  // odometer：完成时数字滚动定格
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString('en-US'));
  useEffect(() => {
    if (status === 'DONE' && result !== null) {
      mv.set(0);
      const c = animate(mv, result, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
      return c.stop;
    }
  }, [status, result, mv]);

  const elapsed = startedAt !== null && finishedAt !== null ? ((finishedAt - startedAt) / 1000).toFixed(1) : null;
  const sum = inputs.A + inputs.B;

  return (
    <Panel title="戰果" className="w-[300px]">
      {status === 'IDLE' || status === 'LOADING' ? (
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--earth-500)' }}>
          等待注入 —— 大军列阵，静候将令
        </p>
      ) : (
        <div className="space-y-3">
          {/* 21 位二进制（高位在左，4-4-4-4-4-1 分组） */}
          <div className="flex flex-wrap gap-[3px]" aria-label="二进制结果">
            {liveBits.map((b, i) => (
              <span key={i} style={{ marginLeft: i > 0 && (21 - i) % 4 === 0 ? 8 : 0 }}>
                <FlagChip value={b} active={status !== 'INJECTING' && status !== 'RESETTING' && (status === 'DONE' || tick > 0)} />
              </span>
            ))}
          </div>

          {status === 'DONE' ? (
            <motion.div
              animate={{ boxShadow: ['0 0 0px rgba(212,169,82,0)', '0 0 18px rgba(212,169,82,0.5)', '0 0 0px rgba(212,169,82,0)'] }}
              transition={{ duration: 0.9, repeat: 2 }}
              className="rounded-sm px-1 py-1"
            >
              <motion.span className="font-mono text-[34px] font-bold leading-none" style={{ color: 'var(--gold)' }}>
                {text}
              </motion.span>
            </motion.div>
          ) : (
            <div className="font-mono text-[20px]" style={{ color: 'var(--sand)' }}>
              {status === 'RUNNING' || status === 'PAUSED' ? `演算中 · 第 ${tick} 拍` : '就绪 · 静候鼓令'}
            </div>
          )}

          {status === 'DONE' && (
            <>
              <p className="font-mono text-[13px]" style={{ color: 'var(--sand)' }}>
                ({inputs.A} + {inputs.B}) × {inputs.C} = {sum} × {inputs.C} = {(sum * inputs.C).toLocaleString('en-US')}{' '}
                <span style={{ color: 'var(--gold)' }}>✓</span>
              </p>
              <p className="text-[11px]" style={{ color: 'var(--earth-300)' }}>
                DONE 旗已举 · 共 {tick} 拍{elapsed ? ` · 用时 ${elapsed} 秒` : ''}
              </p>
            </>
          )}
          {status !== 'DONE' && shown > 0 && (
            <p className="font-mono text-[12px]" style={{ color: 'var(--earth-500)' }}>当前读数 {shown.toLocaleString('en-US')}</p>
          )}
        </div>
      )}
    </Panel>
  );
}

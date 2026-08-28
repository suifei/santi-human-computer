/** 指令卡弹窗（home.md §8.6）：宣纸卡片，点选士兵时自右滑入 */
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useSim } from '@/sim/store';
import { gateTypeCN, zoneCN, type Gate, type GateType } from '@/sim/netlist';

const SEAL_CHAR: Record<GateType, string> = {
  INPUT: '入', AND: '與', OR: '或', XOR: '異', NOT: '非', OUTPUT: '出', DONE: '畢',
};
const TYPE_EN: Partial<Record<GateType, string>> = { AND: 'AND', OR: 'OR', XOR: 'XOR', NOT: 'NOT' };

/** 真值表（NOT/INPUT/OUTPUT 单列） */
function truthRows(type: GateType): { a: 0 | 1; b: 0 | 1 | null; out: 0 | 1 }[] {
  switch (type) {
    case 'AND': return [{ a: 0, b: 0, out: 0 }, { a: 0, b: 1, out: 0 }, { a: 1, b: 0, out: 0 }, { a: 1, b: 1, out: 1 }];
    case 'OR': return [{ a: 0, b: 0, out: 0 }, { a: 0, b: 1, out: 1 }, { a: 1, b: 0, out: 1 }, { a: 1, b: 1, out: 1 }];
    case 'XOR': return [{ a: 0, b: 0, out: 0 }, { a: 0, b: 1, out: 1 }, { a: 1, b: 0, out: 1 }, { a: 1, b: 1, out: 0 }];
    case 'NOT': return [{ a: 0, b: null, out: 1 }, { a: 1, b: null, out: 0 }];
    case 'OUTPUT': return [{ a: 0, b: null, out: 0 }, { a: 1, b: null, out: 1 }];
    default: return [];
  }
}

const FLAG_TXT = (v: 0 | 1 | null) => (v === null ? '—' : v === 1 ? '紅' : '藍');

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-[13px] leading-relaxed">
      <span className="w-14 shrink-0 font-song font-semibold" style={{ color: 'var(--earth-700)' }}>{k}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

export default function InspectorCard() {
  const selectedId = useSim((s) => s.selectedId);
  const select = useSim((s) => s.select);
  useSim((s) => s.commitNonce); // 值变化时重渲染「當前」行
  const netlist = useSim((s) => s.netlist);

  const gate: Gate | null = selectedId !== null ? netlist.byId.get(selectedId) ?? null : null;
  const st = useSim.getState();
  const va = gate?.inA != null ? (st.values[netlist.byId.get(gate.inA)!.index] as 0 | 1) : null;
  const vb = gate?.inB != null ? (st.values[netlist.byId.get(gate.inB)!.index] as 0 | 1) : null;
  const out = gate ? (st.values[gate.index] as 0 | 1) : null;

  return (
    <AnimatePresence>
      {gate && (
        <motion.aside
          className="pointer-events-auto fixed right-4 top-1/2 z-40 w-[300px] -translate-y-1/2"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          role="dialog"
          aria-label={`士兵指令卡 ${gate.id}`}
        >
          <div className="paper-card relative p-5">
            {/* 右上朱红印章 */}
            <div
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-sm font-brush text-[22px]"
              style={{ background: 'var(--seal)', color: '#F6EFDD' }}
            >
              {SEAL_CHAR[gate.type]}
            </div>
            <button
              type="button"
              aria-label="關閉指令卡"
              onClick={() => select(null)}
              className="absolute left-3 top-3 opacity-50 transition-opacity hover:opacity-100"
              style={{ color: 'var(--ink)' }}
            >
              <X size={16} />
            </button>

            <h3 className="mb-3 mt-1 font-song text-[17px] font-bold" style={{ color: 'var(--ink)' }}>
              士兵指令卡
            </h3>
            <div className="space-y-1.5" style={{ color: 'var(--ink)' }}>
              <Row k="門牌號"><span className="font-mono font-bold">第 {String(gate.id).padStart(3, '0')} 號</span></Row>
              <Row k="職能">{gateTypeCN(gate.type)}{TYPE_EN[gate.type] ? ` ${TYPE_EN[gate.type]}` : ''}</Row>
              <Row k="所屬">{zoneCN(gate.zone)}<span className="ml-1 text-[12px] opacity-70">{gate.label}</span></Row>
              <Row k="層序">第 {gate.layer} 層<span className="ml-1 text-[12px] opacity-70">（第 {gate.layer} 拍舉旗）</span></Row>
              {gate.inA !== null && (
                <Row k="上游甲">
                  <UpstreamLink id={gate.inA} onJump={select} />
                </Row>
              )}
              {gate.inB !== null && (
                <Row k="上游乙">
                  <UpstreamLink id={gate.inB} onJump={select} />
                </Row>
              )}
            </div>

            {truthRows(gate.type).length > 0 && (
              <>
                <hr className="my-3" style={{ borderColor: 'rgba(74,55,38,0.35)' }} />
                <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
                  <span className="font-song font-semibold" style={{ color: 'var(--earth-700)' }}>真值表</span>
                  <div className="mt-1.5 grid grid-cols-2 gap-1 font-mono text-[12px]">
                    {truthRows(gate.type).map((r, i) => {
                      const hit = r.a === va && (r.b === null || r.b === vb);
                      return (
                        <div
                          key={i}
                          className="rounded-sm px-1.5 py-0.5"
                          style={hit ? { background: 'var(--seal)', color: '#F6EFDD' } : { color: 'var(--earth-700)' }}
                        >
                          {FLAG_TXT(r.a)}{r.b === null ? '' : FLAG_TXT(r.b)}→{FLAG_TXT(r.out)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <hr className="my-3" style={{ borderColor: 'rgba(74,55,38,0.35)' }} />
            <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--ink)' }}>
              <span className="font-song font-semibold" style={{ color: 'var(--earth-700)' }}>當前</span>
              {gate.type === 'INPUT' ? (
                <span>舉{FLAG_TXT(out)}旗</span>
              ) : (
                <span className="font-mono text-[12.5px]">
                  甲{FLAG_TXT(va)}{gate.inB !== null ? ` · 乙${FLAG_TXT(vb)}` : ''} → 舉{FLAG_TXT(out)}旗
                </span>
              )}
              <motion.span
                key={`${out}`}
                initial={{ rotateY: 90 }}
                animate={{ rotateY: 0 }}
                transition={{ duration: 0.3 }}
                className="ml-auto inline-block h-3.5 w-3.5 rounded-full"
                style={{ background: out === 1 ? 'var(--flag-red)' : 'var(--flag-blue)' }}
              />
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function UpstreamLink({ id, onJump }: { id: number; onJump: (id: number) => void }) {
  const netlist = useSim((s) => s.netlist);
  const g = netlist.byId.get(id);
  return (
    <button
      type="button"
      onClick={() => onJump(id)}
      className="font-mono underline decoration-dotted underline-offset-2 transition-colors hover:text-seal"
      style={{ color: 'var(--earth-700)' }}
    >
      第 {String(id).padStart(3, '0')} 號（{g ? zoneCN(g.zone) : '—'}）
    </button>
  );
}

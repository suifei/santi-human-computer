import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import SectionTitle from '@/components/SectionTitle';
import { playDrum } from './sound';

type Bit = 0 | 1;
type GateKind = 'AND' | 'OR' | 'XOR' | 'NOT';

const GATE_FN: Record<GateKind, (a: Bit, b: Bit) => Bit> = {
  AND: (a, b) => (a & b) as Bit,
  OR: (a, b) => (a | b) as Bit,
  XOR: (a, b) => (a ^ b) as Bit,
  NOT: (a) => (1 - a) as Bit,
};

interface GateDef {
  kind: GateKind;
  seal: string;
  name: string;
  latin: string;
  motto: string;
  single: boolean;
}

const GATES: GateDef[] = [
  { kind: 'AND', seal: '与', name: '与门', latin: 'AND', motto: '两红方举红', single: false },
  { kind: 'OR', seal: '或', name: '或门', latin: 'OR', motto: '见红即举红', single: false },
  { kind: 'XOR', seal: '異', name: '异或门', latin: 'XOR', motto: '同色举蓝，异色举红', single: false },
  { kind: 'NOT', seal: '非', name: '非门', latin: 'NOT', motto: '反其道而行', single: true },
];

/** 旗帜拨杆：48×64 圆角小旗造型，点击翻转红/蓝 */
function FlagLever({
  value,
  onToggle,
  label,
}: {
  value: Bit;
  onToggle: () => void;
  label: string;
}) {
  const red = value === 1;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group flex flex-col items-center gap-2 outline-none"
      aria-label={`${label}：当前为${red ? '红旗 1' : '蓝旗 0'}，点击翻转`}
    >
      <motion.div
        className="relative flex h-16 w-12 items-center justify-center"
        animate={{ rotateY: red ? 0 : 180 }}
        transition={{ duration: 0.32, ease: [0.34, 1.4, 0.64, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* 旗杆 */}
        <div className="absolute bottom-0 top-0 left-[7px] w-[3px] rounded-full" style={{ background: 'var(--bronze)' }} />
        {/* 旗面 */}
        <div
          className="absolute left-[10px] top-1 flex h-10 w-9 items-center justify-center rounded-[3px] font-mono-num text-[18px] font-bold text-white transition-shadow group-hover:shadow-[0_0_16px_rgba(212,169,82,0.4)]"
          style={{
            background: red
              ? 'linear-gradient(135deg, var(--flag-red-bright), var(--flag-red))'
              : 'linear-gradient(135deg, var(--flag-blue-bright), var(--flag-blue))',
            clipPath: 'polygon(0 0, 100% 0, 82% 50%, 100% 100%, 0 100%)',
            width: 38,
            backfaceVisibility: 'visible',
          }}
        >
          <span style={{ transform: red ? 'none' : 'rotateY(180deg)' }}>{value}</span>
        </div>
      </motion.div>
      <span className="font-hei text-[12px] tracking-[0.06em]" style={{ color: 'var(--earth-700)' }}>
        {label}
      </span>
    </button>
  );
}

/** 输出旗（只读）：按真值表实时翻转 */
function OutputFlag({ value }: { value: Bit }) {
  const red = value === 1;
  return (
    <div className="flex flex-col items-center gap-2" aria-live="polite" aria-label={`输出：${red ? '红旗 1' : '蓝旗 0'}`}>
      <motion.div
        className="relative flex h-16 w-12 items-center justify-center"
        animate={{ rotateY: red ? 0 : 180 }}
        transition={{ duration: 0.32, ease: [0.34, 1.4, 0.64, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className="absolute bottom-0 top-0 left-[7px] w-[3px] rounded-full" style={{ background: 'var(--bronze)' }} />
        <div
          className="absolute left-[10px] top-1 flex items-center justify-center rounded-[3px] font-mono-num text-[18px] font-bold text-white"
          style={{
            background: red
              ? 'linear-gradient(135deg, var(--flag-red-bright), var(--flag-red))'
              : 'linear-gradient(135deg, var(--flag-blue-bright), var(--flag-blue))',
            clipPath: 'polygon(0 0, 100% 0, 82% 50%, 100% 100%, 0 100%)',
            width: 38,
            height: 40,
            boxShadow: red ? '0 0 18px rgba(194,59,46,0.5)' : '0 0 12px rgba(62,95,117,0.45)',
          }}
        >
          <span style={{ transform: red ? 'none' : 'rotateY(180deg)' }}>{value}</span>
        </div>
      </motion.div>
      <span className="font-hei text-[12px] font-medium tracking-[0.06em]" style={{ color: 'var(--seal)' }}>
        举旗
      </span>
    </div>
  );
}

function truthRows(gate: GateDef): { a: Bit; b: Bit | null; out: Bit }[] {
  if (gate.single) {
    return ([0, 1] as Bit[]).map((a) => ({ a, b: null, out: GATE_FN[gate.kind](a, 0) }));
  }
  const rows: { a: Bit; b: Bit; out: Bit }[] = [];
  for (const a of [0, 1] as Bit[]) {
    for (const b of [0, 1] as Bit[]) {
      rows.push({ a, b, out: GATE_FN[gate.kind](a, b) });
    }
  }
  return rows;
}

function GateCard({ gate, index }: { gate: GateDef; index: number }) {
  const [a, setA] = useState<Bit>(1);
  const [b, setB] = useState<Bit>(0);
  const out = GATE_FN[gate.kind](a, b);
  const prevOut = useRef<Bit>(out);

  // 输出翻转时伴随极轻鼓声（音量 0.15）
  useEffect(() => {
    if (prevOut.current !== out) {
      prevOut.current = out;
      playDrum(0.15);
    }
  }, [out]);

  const rows = truthRows(gate);

  return (
    <motion.div
      className="paper-card relative overflow-hidden p-6"
      initial={{ y: 40, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.45, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* 顶部 3px 朱砂色条 */}
      <div className="absolute left-0 right-0 top-0 h-[3px]" style={{ background: 'var(--seal)' }} />

      {/* 头部：印章 + 名称 + 口诀 */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[4px] font-song text-[20px] font-bold text-white select-none"
          style={{ background: 'var(--seal)' }}
        >
          {gate.seal}
        </div>
        <div>
          <h3 className="font-song text-[18px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
            {gate.name} <span className="font-mono-num text-[14px] font-medium">{gate.latin}</span>
          </h3>
          <p className="text-[13px]" style={{ color: 'var(--earth-500)' }}>
            口诀：{gate.motto}
          </p>
        </div>
      </div>

      {/* 交互区 */}
      <div className="mt-6 flex items-start justify-center gap-6">
        <FlagLever value={a} onToggle={() => setA((v) => (1 - v) as Bit)} label={gate.single ? '上游' : '上游甲'} />
        {!gate.single && (
          <FlagLever value={b} onToggle={() => setB((v) => (1 - v) as Bit)} label="上游乙" />
        )}
        <div className="mx-1 mt-8 h-px w-5 self-start" style={{ background: 'var(--earth-500)' }} aria-hidden />
        <OutputFlag value={out} />
      </div>

      {/* 真值表 */}
      <table className="mt-6 w-full border-collapse font-mono-num text-[13px]" aria-label={`${gate.name}真值表`}>
        <thead>
          <tr className="text-[12px]" style={{ color: 'var(--earth-500)' }}>
            <th className="border-b py-1.5 font-medium" style={{ borderColor: 'rgba(74,55,38,0.4)' }}>{gate.single ? '上游' : '上游甲'}</th>
            {!gate.single && (
              <th className="border-b py-1.5 font-medium" style={{ borderColor: 'rgba(74,55,38,0.4)' }}>上游乙</th>
            )}
            <th className="border-b py-1.5 font-medium" style={{ borderColor: 'rgba(74,55,38,0.4)' }}>举旗</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const active = row.a === a && (row.b === null || row.b === b);
            return (
              <tr
                key={i}
                className="text-center transition-colors duration-300"
                style={{
                  background: active ? 'rgba(163,46,34,0.16)' : 'transparent',
                  color: active ? 'var(--seal)' : 'var(--ink)',
                  fontWeight: active ? 700 : 500,
                }}
              >
                <td className="py-1.5">{row.a === 1 ? '红 1' : '蓝 0'}</td>
                {!gate.single && <td className="py-1.5">{row.b === 1 ? '红 1' : '蓝 0'}</td>}
                <td className="py-1.5">{row.out === 1 ? '红 1' : '蓝 0'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </motion.div>
  );
}

/** S4 四门图鉴（交互区）：拨动上游旗色，看士兵如何举旗 */
export default function GateGallery() {
  return (
    <section className="relative py-24 md:py-32" aria-label="四门图鉴">
      <div className="mx-auto max-w-6xl px-6">
        <SectionTitle seal="門" title="四门图鉴 · 上手一试" />
        <p className="mt-4 text-[14px]" style={{ color: 'var(--earth-300)' }}>
          拨动上游旗色，看这位士兵如何举旗。
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {GATES.map((gate, i) => (
            <GateCard key={gate.kind} gate={gate} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

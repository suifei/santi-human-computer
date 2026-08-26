import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { Lock } from 'lucide-react';
import { ZONES, ZONE_MAP, TOUR_ORDER } from './zones';
import type { ZoneId, ZoneInfo } from './zones';

/** 输出手 21 个小方点（世界 x 2..22, z=-17 → svg） */
const OUT_DOTS = Array.from({ length: 21 }, (_, i) => 330 + i * 10);
/** 累加陣 9 条加法带示意线（世界 z = 4,2,…,-12 → svg y） */
const ACC_BANDS = Array.from({ length: 9 }, (_, j) => 270 - j * 20);
/** 信号流向箭头 x 位置 */
const FLOW_X = [340, 404, 468];

function ZoneShape({
  zone,
  active,
  onHover,
  onLeave,
  onPick,
}: {
  zone: ZoneInfo;
  active: boolean;
  onHover: (id: ZoneId) => void;
  onLeave: () => void;
  onPick: (id: ZoneId) => void;
}) {
  const { rect } = zone;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${zone.name}，${zone.count} 人，号段 ${zone.range}`}
      style={{ cursor: 'pointer', outline: 'none' }}
      onMouseEnter={() => onHover(zone.id)}
      onMouseLeave={onLeave}
      onFocus={() => onHover(zone.id)}
      onBlur={onLeave}
      onClick={(e) => {
        e.stopPropagation();
        onPick(zone.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onPick(zone.id);
        }
      }}
    >
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={3}
        fill={zone.fill}
        fillOpacity={active ? Math.min(1, zone.fillOpacity + 0.15) : zone.fillOpacity}
        stroke={active ? 'var(--gold)' : 'rgba(176,138,79,0.55)'}
        strokeWidth={active ? 1.6 : 1}
        style={{ transition: 'fill-opacity 200ms, stroke 200ms' }}
      />
      {/* 输出区 21 个小方点 */}
      {zone.id === 'OUT' &&
        OUT_DOTS.map((cx) => (
          <circle key={cx} cx={cx} cy={rect.y + rect.h / 2} r={2.6} fill="var(--paper)" opacity={0.85} pointerEvents="none" />
        ))}
      {/* 累加陣内部 9 条加法带示意线 */}
      {zone.id === 'ACC' &&
        ACC_BANDS.map((y) => (
          <line
            key={y}
            x1={rect.x + 8}
            x2={rect.x + rect.w - 8}
            y1={y}
            y2={y}
            stroke="var(--ink)"
            strokeWidth={1}
            opacity={0.35}
            pointerEvents="none"
          />
        ))}
      <text
        x={zone.label.x}
        y={zone.label.y}
        textAnchor="middle"
        fontSize={12}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth={3}
        paintOrder="stroke"
        pointerEvents="none"
        style={{ fontFamily: "'Noto Sans SC', sans-serif" }}
      >
        {zone.short}
        {zone.id !== 'DONE' && zone.id !== 'OUT' && zone.id !== 'A' && zone.id !== 'B' && zone.id !== 'C'
          ? ` ${zone.count}`
          : ''}
      </text>
    </g>
  );
}

function DetailCard({ zone, locked }: { zone: ZoneInfo; locked: boolean }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={zone.id}
        className="panel p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="panel-title">分区详情</div>
          {locked && (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--gold)' }}>
              <Lock size={11} aria-hidden /> 已锁定 · 点击空白解锁
            </span>
          )}
        </div>
        <h3 className="mt-3 font-song text-[22px] font-semibold text-paper">{zone.name}</h3>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <div>
            <div className="text-[11px] tracking-[0.12em]" style={{ color: 'var(--bronze)' }}>人数</div>
            <div className="mt-0.5 font-mono-num text-[20px] font-bold" style={{ color: 'var(--gold)' }}>
              {zone.count}
            </div>
          </div>
          <div>
            <div className="text-[11px] tracking-[0.12em]" style={{ color: 'var(--bronze)' }}>号段</div>
            <div className="mt-1 font-mono-num text-[14px] text-paper">{zone.range}</div>
          </div>
          <div>
            <div className="text-[11px] tracking-[0.12em]" style={{ color: 'var(--bronze)' }}>兵种</div>
            <div className="mt-1 text-sand">{zone.branch}</div>
          </div>
          <div>
            <div className="text-[11px] tracking-[0.12em]" style={{ color: 'var(--bronze)' }}>拍序（网表实测）</div>
            <div className="mt-1 font-mono-num text-[13px] text-sand">{zone.beats}</div>
          </div>
        </div>
        <div className="my-4 h-px" style={{ background: 'rgba(176,138,79,0.25)' }} />
        <div className="space-y-3 text-[13px] leading-relaxed">
          <div>
            <span className="text-[11px] tracking-[0.12em]" style={{ color: 'var(--bronze)' }}>职责　</span>
            <span className="text-sand">{zone.duty}</span>
          </div>
          <div>
            <span className="text-[11px] tracking-[0.12em]" style={{ color: 'var(--bronze)' }}>流向　</span>
            <span className="font-mono-num text-[13px]" style={{ color: 'var(--gold)' }}>{zone.flow}</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * S2 阵型总图：交互式 SVG 俯瞰图（按 netlist.ts 布阵坐标等比绘制，北在上）
 * + 右侧 sticky 详情卡。hover 跟随 / 点击锁定 / 首次进入按序点亮教学。
 */
export default function FormationMap() {
  const [hovered, setHovered] = useState<ZoneId | null>(null);
  const [locked, setLocked] = useState<ZoneId | null>(null);
  const [tour, setTour] = useState<ZoneId | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef, { once: true, amount: 0.35 });

  // 首次进入：按 输入→加法→部分积→累加→输出 顺序依次点亮一遍（每区 250ms）
  useEffect(() => {
    if (!inView) return;
    let i = 0;
    setTour(TOUR_ORDER[0]);
    const timer = window.setInterval(() => {
      i += 1;
      if (i >= TOUR_ORDER.length) {
        window.clearInterval(timer);
        setTour(null);
        return;
      }
      setTour(TOUR_ORDER[i]);
    }, 250);
    return () => window.clearInterval(timer);
  }, [inView]);

  const shown: ZoneInfo = ZONE_MAP[locked ?? hovered ?? tour ?? 'ACC'];

  return (
    <div ref={wrapRef} className="grid gap-8 lg:grid-cols-5">
      {/* 左：SVG 俯瞰图（60%） */}
      <motion.div
        className="lg:col-span-3"
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <svg
          viewBox="0 0 640 480"
          className="w-full h-auto select-none"
          role="img"
          aria-label="人列计算机阵型俯瞰图：南缘输入手、中部加法陣与部分積陣、北部累加陣与输出区"
          onClick={() => setLocked(null)}
        >
          <style>{`
            @keyframes dashflow { to { stroke-dashoffset: -24; } }
            .flow-arrow { animation: dashflow 2s linear infinite; }
            @media (prefers-reduced-motion: reduce) { .flow-arrow { animation: none; } }
          `}</style>
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--gold)" />
            </marker>
          </defs>

          {/* 夯土底 + 青铜外框 */}
          <rect x={40} y={30} width={560} height={420} rx={10} fill="var(--earth-700)" fillOpacity={0.45} stroke="rgba(176,138,79,0.55)" strokeWidth={1} />
          {/* 地格点阵 */}
          {Array.from({ length: 13 }, (_, r) =>
            Array.from({ length: 17 }, (_, c) => (
              <circle key={`${r}-${c}`} cx={72 + c * 31} cy={58 + r * 29} r={1} fill="var(--earth-300)" opacity={0.18} />
            )),
          )}

          {/* 指北针 */}
          <g aria-hidden>
            <path d="M66,58 L61,72 L66,68 L71,72 Z" fill="var(--gold)" />
            <text x={66} y={52} textAnchor="middle" fontSize={11} fill="var(--gold)" style={{ fontFamily: "'Noto Serif SC', serif" }}>北</text>
          </g>

          {/* 信号流向：自南向北 3 条金色虚线箭头 */}
          {FLOW_X.map((x) => (
            <line
              key={x}
              className="flow-arrow"
              x1={x}
              y1={348}
              x2={x}
              y2={98}
              stroke="var(--gold)"
              strokeWidth={1.4}
              strokeDasharray="6 6"
              opacity={0.65}
              markerEnd="url(#arrowhead)"
              pointerEvents="none"
            />
          ))}

          {/* 鼓台（SE）与监军台（NE） */}
          <g aria-label="鼓台">
            <rect x={534} y={352} width={60} height={60} rx={4} fill="var(--earth-900)" stroke="rgba(176,138,79,0.6)" />
            <circle cx={564} cy={378} r={12} fill="var(--seal)" stroke="var(--bronze)" strokeWidth={2} />
            <text x={564} y={430} textAnchor="middle" fontSize={11} fill="var(--sand)" style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>鼓台</text>
          </g>
          <g aria-label="监军台">
            <rect x={546} y={34} width={48} height={48} rx={4} fill="var(--earth-900)" stroke="rgba(176,138,79,0.6)" />
            <path d="M552,48 L570,40 L588,48" fill="none" stroke="var(--bronze)" strokeWidth={2} />
            <rect x={558} y={52} width={24} height={18} fill="none" stroke="var(--bronze)" strokeWidth={1.4} />
            <text x={570} y={98} textAnchor="middle" fontSize={11} fill="var(--sand)" style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>監軍台</text>
          </g>

          {/* 可交互分区（输出/DONE 后置以压在上层） */}
          {[...ZONES].sort((a, b) => (a.id === 'DONE' ? 1 : b.id === 'DONE' ? -1 : 0)).map((z) => (
            <ZoneShape
              key={z.id}
              zone={z}
              active={shown.id === z.id}
              onHover={setHovered}
              onLeave={() => setHovered(null)}
              onPick={(id) => setLocked((cur) => (cur === id ? null : id))}
            />
          ))}

          {/* 方位标注 */}
          <text x={320} y={470} textAnchor="middle" fontSize={11} fill="var(--earth-300)" style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>
            南 · 注入缘
          </text>
          <text x={320} y={24} textAnchor="middle" fontSize={11} fill="var(--earth-300)" style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>
            北 · 报捷缘
          </text>
        </svg>
        <p className="mt-3 text-center text-[12px]" style={{ color: 'var(--earth-500)' }}>
          俯瞰总图 · 坐标与号段对应真实网表（src/sim/netlist.ts）· 悬停查看分区，点击锁定
        </p>
      </motion.div>

      {/* 右：详情卡（40%，sticky） */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-24">
          <DetailCard zone={shown} locked={locked !== null} />
        </div>
      </div>
    </div>
  );
}

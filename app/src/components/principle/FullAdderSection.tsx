import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import SectionTitle from '@/components/SectionTitle';
import { playDrum } from './sound';
import { cn } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* 全加器信号图数据：默认演示输入 A=1, B=1, Cin=0 → Sum=0, Cout=1 */
type Bit = 0 | 1;

interface Node {
  id: string;
  name: string;
  gate: string;
  x: number;
  y: number;
  layer: number; // 1–4
  value: Bit;
}

const NODES: Node[] = [
  { id: 'A', name: 'A', gate: '输入', x: 70, y: 80, layer: 1, value: 1 },
  { id: 'B', name: 'B', gate: '输入', x: 70, y: 180, layer: 1, value: 1 },
  { id: 'Cin', name: 'Cin', gate: '进位输入', x: 70, y: 300, layer: 1, value: 0 },
  { id: 'XOR1', name: 'XOR1', gate: '异或', x: 215, y: 110, layer: 2, value: 0 },
  { id: 'AND1', name: 'AND1', gate: '与', x: 215, y: 230, layer: 2, value: 1 },
  { id: 'Sum', name: 'Sum', gate: '异或', x: 360, y: 130, layer: 3, value: 0 },
  { id: 'AND2', name: 'AND2', gate: '与', x: 360, y: 250, layer: 3, value: 0 },
  { id: 'Cout', name: 'Cout', gate: '或', x: 490, y: 190, layer: 4, value: 1 },
];

interface Edge {
  from: string;
  to: string;
  layer: number; // 目标节点所在层
}

const EDGES: Edge[] = [
  { from: 'A', to: 'XOR1', layer: 2 },
  { from: 'B', to: 'XOR1', layer: 2 },
  { from: 'A', to: 'AND1', layer: 2 },
  { from: 'B', to: 'AND1', layer: 2 },
  { from: 'XOR1', to: 'Sum', layer: 3 },
  { from: 'Cin', to: 'Sum', layer: 3 },
  { from: 'XOR1', to: 'AND2', layer: 3 },
  { from: 'Cin', to: 'AND2', layer: 3 },
  { from: 'AND1', to: 'Cout', layer: 4 },
  { from: 'AND2', to: 'Cout', layer: 4 },
];

const nodeById = (id: string) => NODES.find((n) => n.id === id)!;

const LAYERS = [
  { n: 1, title: 'L1 输入', desc: 'A、B、Cin 三名士兵首先举旗' },
  { n: 2, title: 'L2 异或与相与', desc: 'XOR1 = A⊕B；AND1 = A·B' },
  { n: 3, title: 'L3 求和与再与', desc: 'Sum = XOR1⊕Cin；AND2 = XOR1·Cin' },
  { n: 4, title: 'L4 进位输出', desc: 'Cout = AND1 + AND2' },
];

/** S5 全加器解剖（钉住式逐拍演示，pin + scrub / 步进按钮双模式） */
export default function FullAdderSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [layer, setLayer] = useState(0);

  // pin 200vh，scrub 驱动层推进（pin 区间均分 4 段）
  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top 64px',
        end: '+=1600',
        pin: true,
        onUpdate: (self) => {
          setLayer(Math.min(4, Math.floor(self.progress * 4.999)));
        },
      });
    },
    { scope: sectionRef }
  );

  // 层激活时该层节点 scale 0.8→1 盖章式落位（stagger 80ms）
  useEffect(() => {
    if (layer === 0 || !svgRef.current) return;
    const targets = svgRef.current.querySelectorAll(`[data-node-layer="${layer}"]`);
    gsap.fromTo(
      targets,
      { scale: 0.8 },
      { scale: 1, duration: 0.3, stagger: 0.08, ease: 'back.out(2)' }
    );
  }, [layer]);

  const beat = () => {
    playDrum(0.3);
    setLayer((l) => Math.min(4, l + 1));
  };
  const reset = () => setLayer(0);

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-16 md:py-20" aria-label="全加器解剖">
      {/* 信号流光动画（scoped 类名） */}
      <style>{`
        .fa-flow { stroke-dasharray: 6 8; animation: fa-dash 0.8s linear infinite; }
        @keyframes fa-dash { to { stroke-dashoffset: -14; } }
        .fa-node { transform-box: fill-box; transform-origin: center; }
      `}</style>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[45%_1fr] lg:items-center">
        {/* 左：文字说明 */}
        <div>
          <SectionTitle seal="算" title="五门一兵组：全加器" />
          <p className="mt-6 text-[15px] leading-[1.9] text-sand">
            五个逻辑门、四层队列，就能算出 1+1+1。Sum 是本位的和，Cout 是传给高位的进位。
          </p>

          <ol className="mt-8 space-y-3">
            {LAYERS.map((l) => {
              const active = layer >= l.n;
              return (
                <li
                  key={l.n}
                  className="flex items-start gap-3 rounded-md px-4 py-3 transition-colors duration-300"
                  style={{
                    background: active ? 'rgba(176,138,79,0.12)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(212,169,82,0.5)' : 'rgba(176,138,79,0.2)'}`,
                  }}
                >
                  <span
                    className="mt-0.5 flex h-6 w-10 shrink-0 items-center justify-center rounded-sm font-mono-num text-[12px] font-bold"
                    style={{
                      background: active ? 'var(--gold)' : 'var(--earth-700)',
                      color: active ? 'var(--ink)' : 'var(--earth-300)',
                    }}
                  >
                    L{l.n}
                  </span>
                  <div>
                    <div className={cn('font-song text-[15px] font-semibold', active ? 'text-paper' : 'text-earth-300')}>
                      {l.title}
                    </div>
                    <div className="mt-0.5 font-mono-num text-[12px]" style={{ color: 'var(--earth-500)' }}>
                      {l.desc}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* 步进按钮 */}
          <div className="mt-8 flex items-center gap-4">
            <button
              type="button"
              onClick={beat}
              disabled={layer >= 4}
              className="rounded-md px-6 py-3 font-hei text-[14px] font-medium tracking-[0.08em] text-paper transition-all duration-200 hover:scale-[1.04] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: 'var(--seal)',
                border: '2px solid var(--bronze)',
                boxShadow: layer >= 4 ? 'none' : '0 0 24px rgba(255,140,66,0.35)',
              }}
            >
              擊鼓一拍
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md px-5 py-3 font-hei text-[14px] tracking-[0.08em] transition-colors hover:text-gold"
              style={{ border: '1px solid rgba(176,138,79,0.35)', color: 'var(--sand)' }}
            >
              復位
            </button>
            <span className="font-mono-num text-[13px]" style={{ color: 'var(--earth-300)' }}>
              拍 {layer} / 4
            </span>
          </div>
        </div>

        {/* 右：SVG 全加器信号图 */}
        <div
          className="rounded-lg p-4 md:p-6"
          style={{ background: 'var(--earth-900)', border: '1px solid rgba(176,138,79,0.35)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        >
          <svg ref={svgRef} viewBox="0 0 560 400" className="h-auto w-full" role="img" aria-label="全加器信号图：A、B、Cin 经四个逻辑门算出 Sum 与 Cout">
            {/* 连线 */}
            {EDGES.map((e) => {
              const f = nodeById(e.from);
              const t = nodeById(e.to);
              const active = layer >= e.layer;
              return (
                <line
                  key={`${e.from}-${e.to}`}
                  x1={f.x}
                  y1={f.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={active ? 'var(--gold)' : 'rgba(201,177,138,0.25)'}
                  strokeWidth={active ? 2 : 1.5}
                  className={active ? 'fa-flow' : undefined}
                  style={{ transition: 'stroke 400ms' }}
                />
              );
            })}
            {/* 节点：士兵小圆徽 */}
            {NODES.map((n) => {
              const active = layer >= n.layer;
              const fill = !active ? 'var(--earth-700)' : n.value === 1 ? 'var(--flag-red)' : 'var(--flag-blue)';
              return (
                <g key={n.id} data-node-layer={n.layer} className="fa-node">
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={26}
                    fill={fill}
                    stroke={active ? 'rgba(212,169,82,0.8)' : 'rgba(176,138,79,0.35)'}
                    strokeWidth={active ? 2 : 1}
                    style={{ transition: 'fill 300ms, stroke 300ms' }}
                  />
                  <text
                    x={n.x}
                    y={n.y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={active ? '#FFFFFF' : 'var(--earth-300)'}
                    fontSize={active ? 18 : 11}
                    fontWeight={700}
                    fontFamily={active ? "'JetBrains Mono', monospace" : 'Qiji, serif'}
                  >
                    {active ? n.value : n.gate}
                  </text>
                  <text
                    x={n.x}
                    y={n.y + 42}
                    textAnchor="middle"
                    fill="var(--sand)"
                    fontSize={12}
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {n.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="mt-2 flex items-center justify-between px-2 font-mono-num text-[12px]" style={{ color: 'var(--earth-500)' }}>
            <span>演示輸入：A=1 · B=1 · Cin=0</span>
            <span>
              Sum=<span style={{ color: layer >= 3 ? 'var(--gold)' : 'inherit' }}>{layer >= 3 ? '0' : '?'}</span>
              {'  '}Cout=<span style={{ color: layer >= 4 ? 'var(--gold)' : 'inherit' }}>{layer >= 4 ? '1' : '?'}</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

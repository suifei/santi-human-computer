import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const SUM_BITS = '11111101001'; // (A+B) = 2025，11 位
// C 的低 3 位部分积：C = 1111101001，低 3 位为 001 → 第 0 位加，第 1、2 位不加
const PARTIALS: { cin: string; shift: number; add: boolean }[] = [
  { cin: 'C₀=1', shift: 0, add: true },
  { cin: 'C₁=0', shift: 1, add: false },
  { cin: 'C₂=0', shift: 2, add: false },
];

const STATS = [
  { value: 932, suffix: '', label: '演算士兵（门+输入+输出）' },
  { value: 280, suffix: '', prefix: '~', label: '拍完成一次 (A+B)×C' },
  { value: 21, suffix: '', label: '位输出' },
];

/** S6 从加法到乘法（行波进位 + 移位相加 + 编制统计） */
export default function MathSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const rippleRef = useRef<HTMLDivElement>(null);
  const partialsRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // S6a：进位"波浪"——金光自低位（右）向高位（左）依次穿过 10 个全加器方块，scrub 驱动
      const blocks = rippleRef.current?.querySelectorAll('[data-fa]');
      if (blocks && blocks.length) {
        const list = Array.from(blocks).reverse(); // DOM 左高右低，波浪从右向左
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: rippleRef.current,
            start: 'top 85%',
            end: 'bottom 35%',
            scrub: 0.5,
          },
        });
        tl.to(list, {
          borderColor: 'rgba(212,169,82,0.9)',
          boxShadow: '0 0 18px rgba(255,140,66,0.4)',
          duration: 0.15,
          stagger: 0.15,
          ease: 'power1.inOut',
        }).to(
          list.map((el) => el.querySelector('[data-carry]')),
          { opacity: 1, duration: 0.15, stagger: 0.15, ease: 'none' },
          0
        );
      }

      // S6b：部分积条纹 stagger 自左滑入并缩进对齐
      const rows = partialsRef.current?.querySelectorAll('[data-partial]');
      if (rows && rows.length) {
        gsap.fromTo(
          rows,
          { x: -50, opacity: 0 },
          {
            x: 0,
            opacity: 1,
            duration: 0.5,
            stagger: 0.2,
            ease: 'power2.out',
            scrollTrigger: { trigger: partialsRef.current, start: 'top 80%', once: true },
          }
        );
      }

      // S6c：大数字 countUp（1.2s）
      const nums = statsRef.current?.querySelectorAll('[data-count]');
      if (nums && nums.length) {
        nums.forEach((el) => {
          const target = Number(el.getAttribute('data-count'));
          const obj = { v: 0 };
          gsap.to(obj, {
            v: target,
            duration: 1.2,
            ease: 'power2.out',
            snap: { v: 1 },
            scrollTrigger: { trigger: el, start: 'top 85%', once: true },
            onUpdate: () => {
              el.textContent = String(Math.round(obj.v));
            },
          });
        });
      }

      // 各小节整体入场
      const subs = sectionRef.current?.querySelectorAll('[data-sub]');
      if (subs && subs.length) {
        gsap.utils.toArray<HTMLElement>(subs).forEach((sub) => {
          gsap.fromTo(
            sub,
            { y: 50, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.6,
              ease: 'power2.out',
              scrollTrigger: { trigger: sub, start: 'top 80%', once: true },
            }
          );
        });
      }
    },
    { scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32" aria-label="从加法到乘法">
      <div className="mx-auto max-w-6xl space-y-24 px-6">
        {/* S6a 行波进位 */}
        <div data-sub>
          <h3 className="font-song text-[22px] font-semibold text-paper">行波进位 · 十人成一列</h3>
          <p className="mt-3 max-w-2xl text-[14px] leading-[1.8]" style={{ color: 'var(--earth-300)' }}>
            十名士兵排成一列，进位从个位一路传到高位——这就是行波加法器。
          </p>
          <div ref={rippleRef} className="mt-8 overflow-x-auto pb-3">
            <div className="flex min-w-[760px] items-center gap-2">
              {Array.from({ length: 10 }, (_, i) => {
                const bit = 9 - i; // 左侧为高位
                return (
                  <div key={i} className="flex flex-1 items-center gap-2">
                    <div
                      data-fa
                      className="flex h-20 flex-1 flex-col items-center justify-center rounded-md"
                      style={{
                        background: 'var(--earth-900)',
                        border: '1px solid rgba(176,138,79,0.35)',
                      }}
                    >
                      <span className="font-mono-num text-[13px] font-bold text-paper">FA{bit}</span>
                      <span className="mt-1 font-mono-num text-[10px]" style={{ color: 'var(--earth-500)' }}>
                        bit {bit}
                      </span>
                      <span
                        data-carry
                        className="mt-1 h-1 w-8 rounded-full opacity-0"
                        style={{ background: 'var(--gold)' }}
                      />
                    </div>
                    {i < 9 && (
                      <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden className="shrink-0">
                        <path d="M14 6 L2 6 M6 1 L1 6 L6 11" stroke="rgba(176,138,79,0.6)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between font-mono-num text-[11px]" style={{ color: 'var(--earth-500)' }}>
              <span>高位</span>
              <span style={{ color: 'var(--gold)' }}>← 进位波浪自低位传来</span>
              <span>低位（个位）</span>
            </div>
          </div>
        </div>

        {/* S6b 移位相加 */}
        <div data-sub>
          <h3 className="font-song text-[22px] font-semibold text-paper">移位相加 · 乘法即重复的加法</h3>
          <p className="mt-3 max-w-2xl text-[14px] leading-[1.8]" style={{ color: 'var(--earth-300)' }}>
            乘法即重复的加法：部分积 + 移位 + 再累加。九条加法带依次推进，方阵自南向北一层层举旗。
          </p>
          <div
            ref={partialsRef}
            className="mt-8 overflow-x-auto rounded-lg p-6"
            style={{ background: 'var(--earth-900)', border: '1px solid rgba(176,138,79,0.35)' }}
          >
            <div className="min-w-[560px] font-mono-num">
              {/* (A+B) 被乘数 */}
              <div className="flex items-center gap-1">
                <span className="mr-3 w-28 text-[12px]" style={{ color: 'var(--earth-300)' }}>(A+B) =</span>
                {SUM_BITS.split('').map((b, i) => (
                  <span
                    key={i}
                    className="flex h-[22px] w-[18px] items-center justify-center rounded-sm text-[12px] font-bold text-white"
                    style={{ background: b === '1' ? 'var(--flag-red)' : 'var(--flag-blue)' }}
                  >
                    {b}
                  </span>
                ))}
              </div>
              {/* 部分积 */}
              {PARTIALS.map((p, i) => (
                <div
                  key={i}
                  data-partial
                  className="mt-3 flex items-center gap-1"
                  style={{ paddingLeft: `${p.shift * 20}px` }}
                >
                  <span className="mr-3 w-28 text-[12px]" style={{ color: p.add ? 'var(--gold)' : 'var(--earth-500)' }}>
                    {p.cin} {p.add ? `加 左移${p.shift}` : '跳过'}
                  </span>
                  {SUM_BITS.split('').map((b, j) => (
                    <span
                      key={j}
                      className="flex h-[22px] w-[18px] items-center justify-center rounded-sm text-[12px] font-bold"
                      style={{
                        background: !p.add
                          ? 'var(--earth-700)'
                          : b === '1'
                            ? 'var(--flag-red)'
                            : 'var(--flag-blue)',
                        color: !p.add ? 'var(--earth-300)' : '#FFFFFF',
                        opacity: p.add ? 1 : 0.5,
                      }}
                    >
                      {p.add ? b : '·'}
                    </span>
                  ))}
                  <span className="ml-2 text-[11px]" style={{ color: 'var(--earth-500)' }}>
                    ← 左移 {p.shift} 位
                  </span>
                </div>
              ))}
              <p className="mt-5 text-[12px] leading-relaxed" style={{ color: 'var(--earth-300)' }}>
                乘数的每一位决定加不加一份左移的 (A+B)；C 的高位为 1 的位同理，共九条加法带。
              </p>
            </div>
          </div>
        </div>

        {/* S6c 编制统计 */}
        <div data-sub ref={statsRef} className="grid gap-6 sm:grid-cols-3">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-lg p-6 text-center"
              style={{ background: 'var(--earth-900)', border: '1px solid rgba(176,138,79,0.35)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            >
              <div className="font-mono-num text-[48px] font-bold leading-none" style={{ color: 'var(--gold)' }}>
                {s.prefix}
                <span data-count={s.value}>0</span>
                {s.suffix}
              </div>
              <div className="mt-3 text-[13px]" style={{ color: 'var(--sand)' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

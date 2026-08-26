import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import SectionTitle from '@/components/SectionTitle';
import { asset } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const PARAGRAPHS = [
  '在《三体》的 VR 游戏中，冯·诺依曼向秦始皇进言：三千万大军，可以组成一台计算机。',
  '每个士兵是一个逻辑门。他们不需要懂得算术——只需看清指令卡上指定的两名上游士兵举的是红旗还是蓝旗，然后按真值表举起自己的旗。',
  '战鼓是时钟。鼓声一响，全军同时读旗、同时举旗。信号如波浪一般，一层一层传过方阵——加法、乘法，就这样在血肉之躯上运行。',
];

/** S2 故事 · 三体游戏与秦始皇（两栏图文，GSAP 揭幕 + 视差） */
export default function StorySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useGSAP(
    () => {
      // 左栏文字逐段入场
      const blocks = textRef.current?.querySelectorAll('[data-block]');
      if (blocks && blocks.length) {
        gsap.fromTo(
          blocks,
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.6,
            stagger: 0.15,
            ease: 'power2.out',
            scrollTrigger: { trigger: textRef.current, start: 'top 80%', once: true },
          }
        );
      }
      // 右栏插画揭幕式展开
      gsap.fromTo(
        imgWrapRef.current,
        { clipPath: 'inset(0 0 100% 0)' },
        {
          clipPath: 'inset(0 0 0% 0)',
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: { trigger: imgWrapRef.current, start: 'top 80%', once: true },
        }
      );
      // 插画滚动期间轻微视差
      gsap.fromTo(
        imgRef.current,
        { y: -30 },
        {
          y: 30,
          ease: 'none',
          scrollTrigger: {
            trigger: imgWrapRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        }
      );
    },
    { scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32" aria-label="故事">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-[55%_1fr]">
        {/* 左栏文字 */}
        <div ref={textRef}>
          <SectionTitle seal="史" title="来自三体世界的阅兵式" />
          <div className="mt-8 space-y-5">
            {PARAGRAPHS.map((p, i) => (
              <p key={i} data-block className="text-[15px] leading-[1.9] text-sand">
                {p}
              </p>
            ))}
          </div>
          <blockquote
            data-block
            className="mt-8 border-l-[3px] pl-5 font-song text-[18px] italic leading-relaxed text-paper"
            style={{ borderColor: 'var(--seal)' }}
          >
            「红为一，蓝为零；鼓响为令，万军同旗。」
          </blockquote>
        </div>

        {/* 右栏插画 */}
        <div
          ref={imgWrapRef}
          className="overflow-hidden rounded-lg"
          style={{ border: '1px solid rgba(176,138,79,0.35)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        >
          <img
            ref={imgRef}
            src={asset('story-illustration.png')}
            alt="监军台视角：将军剪影俯瞰举旗方阵，战鼓与火把映红暮色"
            className="h-auto w-full scale-[1.15] object-cover will-change-transform"
          />
        </div>
      </div>
    </section>
  );
}

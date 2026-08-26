import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { asset } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** S1 Hero 火星微粒画布：40 粒缓慢上浮的火星（#FF8C42，2–4px，循环 8–14s） */
function EmberCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    interface Particle {
      x: number;
      y: number;
      r: number;
      speed: number;
      drift: number;
      phase: number;
      alpha: number;
      cycle: number; // 8–14s 上浮循环
    }
    let particles: Particle[] = [];

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawn = (initial: boolean): Particle => {
      const cycle = 8 + Math.random() * 6;
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : h + 8,
        r: 2 + Math.random() * 2,
        speed: h / (cycle * 60),
        drift: (Math.random() - 0.5) * 0.4,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.25 + Math.random() * 0.55,
        cycle,
      };
    };

    resize();
    particles = Array.from({ length: 40 }, () => spawn(true));

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y -= p.speed * dt;
        p.phase += 0.01 * dt;
        p.x += p.drift * dt + Math.sin(p.phase) * 0.3;
        if (p.y < -10) particles[i] = spawn(false);
        const flicker = 0.75 + 0.25 * Math.sin(p.phase * 3);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5);
        grad.addColorStop(0, `rgba(255,140,66,${p.alpha * flicker})`);
        grad.addColorStop(1, 'rgba(255,140,66,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      aria-hidden
    />
  );
}

/**
 * S1 Hero（principle.md S1）：全屏 principle-hero.png + 渐变遮罩 + 火星粒子；
 * 印章盖章落下、书法标题逐字展开、滚动视差 scrub。
 */
export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const sealRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // 印章盖章式落下
      gsap.fromTo(
        sealRef.current,
        { scale: 1.7, rotate: 10, opacity: 0 },
        { scale: 1, rotate: 0, opacity: 1, duration: 0.4, ease: 'back.out(2)', delay: 0.15 }
      );
      // 主标题逐字 clip-path 自右向左展开
      const chars = titleRef.current?.querySelectorAll('[data-char]');
      if (chars && chars.length) {
        gsap.fromTo(
          chars,
          { clipPath: 'inset(0 100% 0 0)', y: 24, opacity: 0 },
          {
            clipPath: 'inset(0 -5% 0 0)',
            y: 0,
            opacity: 1,
            duration: 0.5,
            stagger: 0.12,
            delay: 0.3,
            ease: 'power2.out',
          }
        );
      }
      // 副标题 / 引言
      gsap.fromTo(
        subRef.current,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.6, delay: 1.2, ease: 'power2.out' }
      );
      // 向下箭头 2s 上下浮动循环
      gsap.to(arrowRef.current, { y: 8, duration: 1, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      // 滚动：背景 scale 1→1.12 + 视差 y 0→-80
      gsap.to(bgRef.current, {
        scale: 1.12,
        y: -80,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });
    },
    { scope: sectionRef }
  );

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-[100dvh] flex-col items-center justify-end overflow-hidden"
      style={{ marginTop: '-4rem' /* 全幅 Hero 顶到视口顶，Navbar 为半透明覆盖 */ }}
      aria-label="原理页 Hero"
    >
      {/* 背景插画 + 视差 */}
      <div ref={bgRef} className="absolute inset-0 will-change-transform">
        <img
          src={asset('principle-hero.png')}
          alt="黄昏下秦军士兵方阵组成的人列计算机，士兵举着红蓝旗帜"
          className="h-full w-full object-cover"
        />
      </div>
      {/* 自上而下的渐变遮罩：顶部 20% → 底部 85% */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(23,16,11,0.2) 0%, rgba(23,16,11,0.45) 55%, rgba(23,16,11,0.85) 88%, var(--ink) 100%)',
        }}
        aria-hidden
      />
      <EmberCanvas />

      {/* 内容：垂直居中偏下 */}
      <div className="relative z-10 flex flex-col items-center px-6 pb-24 pt-40 text-center">
        <div
          ref={sealRef}
          className="mb-7 flex h-14 w-14 items-center justify-center rounded-[5px] font-song text-[30px] font-bold text-white select-none"
          style={{ background: 'var(--seal)', boxShadow: '0 4px 20px rgba(23,16,11,0.6), inset 0 0 0 2px rgba(232,220,195,0.15)' }}
        >
          理
        </div>
        <h1
          ref={titleRef}
          className="font-brush leading-[1.1] tracking-[0.04em] text-paper"
          style={{ fontSize: 'clamp(3.5rem, 9vw, 7.5rem)', textShadow: '0 4px 32px rgba(23,16,11,0.8)' }}
        >
          {'人列計算機'.split('').map((ch, i) => (
            <span key={i} data-char className="inline-block will-change-transform">
              {ch}
            </span>
          ))}
        </h1>
        <div ref={subRef} className="mt-6 flex flex-col items-center gap-3">
          <p
            className="font-song font-semibold text-sand"
            style={{ fontSize: 'clamp(1rem, 2vw, 1.375rem)' }}
          >
            三千万大军的逻辑 —— 《三体》中的人列计算机原理
          </p>
          <p className="text-[14px]" style={{ color: 'var(--earth-300)' }}>
            每名士兵只做一件事：看清两面旗，举起一面旗。
          </p>
        </div>
      </div>

      {/* 底部滚动提示 */}
      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
        <div ref={arrowRef} className="flex flex-col items-center gap-1.5">
          <span className="text-[12px] tracking-[0.2em]" style={{ color: 'var(--bronze)' }}>
            滚动了解
          </span>
          <svg width="16" height="20" viewBox="0 0 16 20" fill="none" aria-hidden>
            <path d="M8 1v16m0 0l-5.5-5.5M8 17l5.5-5.5" stroke="var(--bronze)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </section>
  );
}

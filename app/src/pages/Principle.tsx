import { useEffect } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import HeroSection from '@/components/principle/HeroSection';
import StorySection from '@/components/principle/StorySection';
import RulesSection from '@/components/principle/RulesSection';
import GateGallery from '@/components/principle/GateGallery';
import FullAdderSection from '@/components/principle/FullAdderSection';
import MathSection from '@/components/principle/MathSection';
import ExampleSection from '@/components/principle/ExampleSection';
import CtaSection from '@/components/principle/CtaSection';

/**
 * 原理页 /principle（design/principle.md）：
 * S1 Hero / S2 故事 / S3 三条军规 / S4 四门图鉴 / S5 全加器解剖（pin）
 * / S6 从加法到乘法 / S7 算例 / S8 CTA。Lenis 平滑滚动由 Layout 提供。
 */
export default function Principle() {
  // 挂载后刷新 ScrollTrigger（图片/字体加载后高度变化，确保 pin 区间准确）
  useEffect(() => {
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 300);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div style={{ background: 'var(--ink)' }}>
      <HeroSection />
      <StorySection />
      <RulesSection />
      <GateGallery />
      <FullAdderSection />
      <MathSection />
      <ExampleSection />
      <CtaSection />
    </div>
  );
}

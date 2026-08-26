/** 入阵加载屏（home.md §8.1） */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { drumHit } from '@/sim/audio';
import { DrumButton } from './common';
import { asset } from '@/lib/utils';

const TITLE = '人列計算機';

export default function LoadingScreen({ onEnter }: { onEnter: () => void }) {
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // 资产均为程序化生成/极小贴图，进度条以短计时呈现
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / 1400);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const enter = () => {
    drumHit(1, 0.8);
    setLeaving(true);
    onEnter();
    setTimeout(() => setGone(true), 650);
  };

  return (
    <AnimatePresence>
      {!gone && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'var(--ink)' }}
          animate={leaving ? { opacity: 0, scale: 1.06 } : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* 印章：盖章式落下 */}
          <motion.img
            src={asset('logo-seal.svg')}
            alt="人列印章"
            width={120}
            height={120}
            className="rounded-md"
            initial={{ scale: 1.8, rotate: 8, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15, mass: 0.9 }}
          />
          {/* 书法标题：逐字自右向左展开 */}
          <h1 className="mt-8 flex font-brush text-paper" style={{ fontSize: 'clamp(3.5rem, 9vw, 7rem)', letterSpacing: '0.04em', lineHeight: 1.1 }}>
            {[...TITLE].map((c, i) => (
              <motion.span
                key={i}
                className="inline-block"
                initial={{ clipPath: 'inset(0 0 0 100%)', y: 16, opacity: 0 }}
                animate={{ clipPath: 'inset(0 0 0 0%)', y: 0, opacity: 1 }}
                transition={{ delay: 0.35 + (TITLE.length - 1 - i) * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {c}
              </motion.span>
            ))}
          </h1>
          <motion.p
            className="mt-3 font-song text-[16px] tracking-[0.4em]"
            style={{ color: 'var(--earth-300)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            三體 · 秦軍方陣演算
          </motion.p>

          <div className="mt-10 flex flex-col items-center gap-3">
            {progress < 1 ? (
              <>
                <div className="h-px w-60" style={{ background: 'rgba(176,138,79,0.3)' }}>
                  <div className="h-px transition-none" style={{ width: `${progress * 100}%`, background: 'var(--gold)' }} />
                </div>
                <span className="font-mono text-[12px]" style={{ color: 'var(--bronze)' }}>{Math.round(progress * 100)}%</span>
              </>
            ) : (
              <DrumButton className="px-10 py-3 text-[18px]" onClick={enter} pulse>
                擊鼓入陣
              </DrumButton>
            )}
          </div>

          <p className="absolute bottom-8 text-[12px]" style={{ color: 'var(--earth-500)' }}>
            红 = 1 · 蓝 = 0 · 鼓响为令
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

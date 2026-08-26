/** 演算场主页（/）：全屏 Three.js + 悬浮 UI（home.md §0 骨架） */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Pause } from 'lucide-react';
import Scene from '@/three/Scene';
import LoadingScreen from '@/ui/LoadingScreen';
import TopBar from '@/ui/TopBar';
import InputPanel from '@/ui/InputPanel';
import DrumConsole from '@/ui/DrumConsole';
import OutputPanel from '@/ui/OutputPanel';
import InspectorCard from '@/ui/InspectorCard';
import { Legend, Toasts, CameraPresets } from '@/ui/Overlays';
import { useSim } from '@/sim/store';

/** 青铜环光标（design.md §8）：悬停士兵时放大变金 */
function CursorRing() {
  const ref = useRef<HTMLDivElement>(null);
  const hoveredId = useSim((s) => s.hoveredId);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (ref.current) ref.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%,-50%)`;
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-40 rounded-full transition-[width,height,border-color] duration-150"
      style={{
        width: hoveredId !== null ? 20 : 12,
        height: hoveredId !== null ? 20 : 12,
        border: `2px solid ${hoveredId !== null ? 'var(--gold)' : 'var(--bronze)'}`,
        mixBlendMode: 'screen',
      }}
    />
  );
}

/** 移动端底部抽屉（<768px）：输入 / 鼓令 / 战果 三个 Tab */
function MobileDock() {
  const [tab, setTab] = useState<'none' | 'input' | 'drum' | 'output'>('none');
  const toggleRun = useSim((s) => s.toggleRun);
  const status = useSim((s) => s.status);
  const tick = useSim((s) => s.tick);
  const maxLayer = useSim((s) => s.netlist.maxLayer);
  const drumPulse = useSim((s) => s.drumPulse);
  const toast = useSim((s) => s.toast);
  const toasted = useRef(false);

  useEffect(() => {
    if (!toasted.current) { toasted.current = true; toast('横屏体验更佳'); }
  }, [toast]);

  return (
    <>
      {/* 精简鼓令条 */}
      <div className="panel pointer-events-auto fixed bottom-3 left-3 right-3 z-30 flex items-center justify-between px-3 py-2">
        <motion.button
          type="button"
          onClick={toggleRun}
          aria-label="击鼓/暂停"
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 text-paper"
          style={{ background: 'var(--seal)', borderColor: 'var(--bronze)' }}
          key={drumPulse}
          initial={{ scale: 0.92 }}
          animate={{ scale: 1 }}
        >
          {status === 'RUNNING' ? <Pause size={18} /> : <span className="font-brush text-[18px]">鼓</span>}
        </motion.button>
        <span className="font-mono text-[14px]" style={{ color: 'var(--gold)' }}>第 {tick}/{maxLayer} 拍</span>
        <div className="flex gap-1 text-[12px]">
          {([['input', '输入'], ['drum', '鼓令'], ['output', '战果']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(tab === k ? 'none' : k)}
              className="rounded-sm border px-2 py-1.5"
              style={{
                borderColor: 'rgba(176,138,79,0.35)',
                color: tab === k ? 'var(--ink)' : 'var(--sand)',
                background: tab === k ? 'var(--gold)' : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* 抽屉 */}
      <motion.div
        className="pointer-events-auto fixed bottom-[68px] left-3 right-3 z-30 flex justify-center"
        initial={false}
        animate={tab !== 'none' ? { y: 0, opacity: 1 } : { y: 24, opacity: 0, pointerEvents: 'none' }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {tab === 'input' && <InputPanel />}
        {tab === 'drum' && <DrumConsole />}
        {tab === 'output' && <OutputPanel />}
      </motion.div>
    </>
  );
}

export default function Home() {
  const introDone = useSim((s) => s.introDone);
  const setIntroDone = useSim((s) => s.setIntroDone);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const panelIn = (delay: number) => ({
    initial: { opacity: 0 },
    animate: introDone ? { opacity: 1 } : {},
    transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  });

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: 'var(--ink)', cursor: 'crosshair' }}>
      <Scene />
      <CursorRing />

      {/* UI 覆盖层：整体不挡画布，面板自身可点 */}
      <div className="pointer-events-none fixed inset-0 z-20">
        <TopBar />
        {!isMobile && (
          <>
            <motion.div
              className="pointer-events-auto absolute bottom-28 left-4 top-20 flex min-h-0"
              initial={{ x: -24, opacity: 0 }}
              animate={introDone ? { x: 0, opacity: 1 } : {}}
              transition={{ duration: 0.45, delay: 3.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <InputPanel />
            </motion.div>
            <motion.div
              className="pointer-events-auto absolute right-4 top-20 flex max-h-[calc(100%-7.5rem)]"
              initial={{ x: 24, opacity: 0 }}
              animate={introDone ? { x: 0, opacity: 1 } : {}}
              transition={{ duration: 0.45, delay: 3.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <OutputPanel />
            </motion.div>
            <motion.div
              className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2"
              initial={{ y: 24, opacity: 0 }}
              animate={introDone ? { y: 0, opacity: 1 } : {}}
              transition={{ duration: 0.45, delay: 3.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <DrumConsole />
            </motion.div>
            <motion.div className="pointer-events-auto absolute bottom-5 left-4" {...panelIn(3.6)}>
              <Legend />
            </motion.div>
            <motion.div className="pointer-events-auto absolute bottom-5 right-4" {...panelIn(3.6)}>
              <CameraPresets />
            </motion.div>
          </>
        )}
        {isMobile && introDone && <MobileDock />}
        <InspectorCard />
        <Toasts />
      </div>

      <LoadingScreen onEnter={setIntroDone} />
    </div>
  );
}

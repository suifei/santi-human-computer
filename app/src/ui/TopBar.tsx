/** 主页极简悬浮顶栏（home.md §8.2）+ 帮助浮层（§8.9） */
import { useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, CircleHelp } from 'lucide-react';
import { useSim } from '@/sim/store';
import { asset } from '@/lib/utils';

export default function TopBar() {
  const muted = useSim((s) => s.muted);
  const toggleMute = useSim((s) => s.toggleMute);
  const introDone = useSim((s) => s.introDone);
  const [help, setHelp] = useState(false);

  return (
    <motion.header
      className="pointer-events-auto fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-5 py-3"
      initial={{ y: -16, opacity: 0 }}
      animate={introDone ? { y: 0, opacity: 1 } : {}}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: 'rgba(23,16,11,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(176,138,79,0.35)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <img src={asset('logo-seal.svg')} alt="印章" width={28} height={28} className="rounded-sm" />
        <div className="leading-tight">
          <div className="font-brush text-[24px] tracking-[0.08em] text-paper">人列計算機</div>
          <div className="text-[11px]" style={{ color: 'var(--earth-300)' }}>三體人列計算機模擬</div>
        </div>
      </div>
      <nav className="flex items-center gap-5 text-[13px]">
        <span className="font-medium" style={{ color: 'var(--gold)' }}>演算場</span>
        <Link to="/asset" className="transition-colors hover:text-gold" style={{ color: 'var(--sand)' }}>點驗</Link>
        <Link to="/principle" className="transition-colors hover:text-gold" style={{ color: 'var(--sand)' }}>原理</Link>
        <Link to="/formation" className="transition-colors hover:text-gold" style={{ color: 'var(--sand)' }}>陣圖</Link>
        <button
          type="button"
          aria-label={muted ? '開啟音效' : '關閉音效'}
          onClick={toggleMute}
          className="transition-colors hover:text-gold"
          style={{ color: 'var(--bronze)' }}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button
          type="button"
          aria-label="說明"
          onClick={() => setHelp((v) => !v)}
          className="transition-colors hover:text-gold"
          style={{ color: 'var(--bronze)' }}
        >
          <CircleHelp size={18} />
        </button>
      </nav>

      <AnimatePresence>
        {help && (
          <motion.div
            className="panel absolute right-4 top-14 w-72 p-4 text-[12.5px] leading-relaxed"
            style={{ color: 'var(--sand)' }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <div className="panel-title mb-2">操作說明</div>
            <ul className="space-y-1">
              <li>· 左鍵拖曳旋轉 / 右鍵平移 / 滾輪縮放</li>
              <li>· 點擊士兵查看指令卡，Esc 關閉</li>
              <li>· 快捷鍵 <span className="font-mono text-gold">1–6</span> 切換機位，<span className="font-mono text-gold">F</span> 跟隨信號</li>
              <li>· <span className="font-mono text-gold">空格</span> = 擊鼓 / 暫停</li>
              <li>· 每位士兵是一個邏輯門：紅旗=1，藍旗=0</li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

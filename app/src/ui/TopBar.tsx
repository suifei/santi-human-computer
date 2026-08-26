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
      style={{ background: 'linear-gradient(to bottom, rgba(23,16,11,0.72), rgba(23,16,11,0))' }}
    >
      <div className="flex items-center gap-2.5">
        <img src={asset('logo-seal.svg')} alt="印章" width={28} height={28} className="rounded-sm" />
        <div className="leading-tight">
          <div className="font-brush text-[24px] text-paper">人列計算機</div>
          <div className="text-[11px]" style={{ color: 'var(--earth-300)' }}>三體人列計算機模擬</div>
        </div>
      </div>
      <nav className="flex items-center gap-5 text-[13px]">
        <span className="font-medium" style={{ color: 'var(--gold)' }}>演算场</span>
        <Link to="/principle" className="transition-colors hover:text-gold" style={{ color: 'var(--sand)' }}>原理</Link>
        <Link to="/formation" className="transition-colors hover:text-gold" style={{ color: 'var(--sand)' }}>阵图</Link>
        <button
          type="button"
          aria-label={muted ? '开启音效' : '关闭音效'}
          onClick={toggleMute}
          className="transition-colors hover:text-gold"
          style={{ color: 'var(--bronze)' }}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button
          type="button"
          aria-label="帮助"
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
              <li>· 左键拖拽旋转 / 右键平移 / 滚轮缩放</li>
              <li>· 点击士兵查看指令卡，Esc 关闭</li>
              <li>· 快捷键 <span className="font-mono text-gold">1–5</span> 切换机位，<span className="font-mono text-gold">F</span> 跟随信号</li>
              <li>· <span className="font-mono text-gold">空格</span> = 击鼓 / 暂停</li>
              <li>· 每位士兵是一个逻辑门：红旗=1，蓝旗=0</li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

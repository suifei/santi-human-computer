import { useEffect } from 'react';
import { Outlet } from 'react-router';
import Lenis from 'lenis';
import Navbar from './Navbar';
import Footer from './Footer';

/**
 * 内容页布局（嵌套路由 pattern B）：Navbar fixed top-0 高 64px，
 * 由 Layout 的 content slot 提供 pt-16 顶距，页面自身无需处理导航遮挡。
 * 内容页启用 Lenis 平滑滚动（design.md §7，lerp 0.1）；主页全屏 3D 不使用本布局。
 */
export default function Layout() {
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.1 });
    let raf = 0;
    const loop = (time: number) => { lenis.raf(time); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: 'var(--ink)' }}>
      <Navbar />
      <main className="flex-1 pt-16">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

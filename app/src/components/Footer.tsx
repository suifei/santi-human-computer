import { Link } from 'react-router';
import { asset } from '@/lib/utils';

/** Footer（design.md §9.2）：深底 + 青铜渐变分隔线 + 三列 */
export default function Footer() {
  return (
    <footer className="relative" style={{ background: 'var(--ink)' }}>
      <div
        className="h-px w-full"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(176,138,79,0.6), transparent)' }}
      />
      <div className="mx-auto max-w-6xl px-6 py-12 grid gap-10 md:grid-cols-3">
        <div className="flex items-start gap-3">
          <img src={asset('logo-seal.svg')} alt="印章" width={36} height={36} className="rounded-sm mt-0.5" />
          <div>
            <div className="font-song font-semibold text-paper">人列计算机 · 三体模拟</div>
            <div className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--earth-500)' }}>
              红 = 1 · 蓝 = 0 · 鼓响为令
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-2 text-[14px]" aria-label="页脚导航">
          <Link className="hover:text-gold transition-colors" style={{ color: 'var(--sand)' }} to="/">演算场</Link>
          <Link className="hover:text-gold transition-colors" style={{ color: 'var(--sand)' }} to="/principle">原理</Link>
          <Link className="hover:text-gold transition-colors" style={{ color: 'var(--sand)' }} to="/formation">阵图</Link>
        </nav>
        <p className="text-[13px] leading-relaxed md:text-right" style={{ color: 'var(--earth-500)' }}>
          灵感源自刘慈欣《三体》· 本站为粉丝向技术演示
        </p>
      </div>
      <div className="pb-6 text-center text-[12px]" style={{ color: 'var(--earth-500)' }}>
        红 = 1 · 蓝 = 0 · 鼓响为令
      </div>
    </footer>
  );
}

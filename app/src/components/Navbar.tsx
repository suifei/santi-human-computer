import { Link, NavLink, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import { asset } from '@/lib/utils';

const NAV = [
  { to: '/', label: '演算场' },
  { to: '/principle', label: '原理' },
  { to: '/formation', label: '阵图' },
];

/** TopNav（design.md §9.1）：64px，fixed top-0，内容页专用（主页用自有悬浮顶栏） */
export default function Navbar() {
  const { pathname } = useLocation();
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6"
      style={{
        background: 'rgba(23,16,11,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(176,138,79,0.35)',
      }}
    >
      <Link to="/" className="flex items-center gap-3 group">
        <img src={asset('logo-seal.svg')} alt="人列计算机印章" width={32} height={32} className="rounded-sm" />
        <span className="font-song font-semibold text-[18px] text-paper tracking-[0.02em] group-hover:text-gold transition-colors">
          人列计算机
        </span>
      </Link>
      <nav className="flex items-center gap-7">
        {NAV.map((item) => {
          const active = pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className="relative py-2 text-[14px] font-medium tracking-[0.06em] transition-colors"
              style={{ color: active ? 'var(--gold)' : 'var(--sand)' }}
            >
              {item.label}
              {active && (
                <motion.span
                  layoutId="nav-underline"
                  className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[2px] w-6 rounded-sm"
                  style={{ background: 'var(--gold)' }}
                />
              )}
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}

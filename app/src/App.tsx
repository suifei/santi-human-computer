import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import Principle from './pages/Principle';
import Formation from './pages/Formation';
import Layout from './components/Layout';

// 主页为重型 WebGL 应用，代码分包懒加载
const Home = lazy(() => import('./pages/Home'));

export default function App() {
  return (
    <Routes>
      {/* 演算场主页：全屏 3D，不使用 TopNav/Layout */}
      <Route
        path="/"
        element={
          <Suspense fallback={<div className="fixed inset-0" style={{ background: 'var(--ink)' }} />}>
            <Home />
          </Suspense>
        }
      />
      {/* 内容页：Layout（Navbar fixed + Outlet + Footer）嵌套路由 */}
      <Route element={<Layout />}>
        <Route path="/principle" element={<Principle />} />
        <Route path="/formation" element={<Formation />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

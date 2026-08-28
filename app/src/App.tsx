import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import Principle from './pages/Principle';
import Formation from './pages/Formation';
import Layout from './components/Layout';

const Home = lazy(() => import('./pages/Home'));
const AssetStudio = lazy(() => import('./pages/AssetStudio'));

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Suspense fallback={<div className="fixed inset-0" style={{ background: 'var(--ink)' }} />}>
            <Home />
          </Suspense>
        }
      />
      <Route
        path="/asset"
        element={
          <Suspense fallback={<div className="fixed inset-0" style={{ background: 'var(--ink)' }} />}>
            <AssetStudio />
          </Suspense>
        }
      />
      <Route element={<Layout />}>
        <Route path="/principle" element={<Principle />} />
        <Route path="/formation" element={<Formation />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

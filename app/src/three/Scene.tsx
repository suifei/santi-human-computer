/** 3D 画布组合：渲染器规格见 home.md §1 */
import '@/three/absorbInspect';
import * as THREE from 'three';
import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import Soldiers from './Soldiers';
import Environment from './Environment';
import Effects from './Effects';
import CameraRig from './CameraRig';
import { useSim } from '@/sim/store';

/** 单次 applyProps 异常不能把整张 WebGL 画布卸掉；最多重建三次。 */
class CanvasBoundary extends Component<{ children: ReactNode }, { gen: number; crashed: boolean; giveUp: boolean }> {
  private retries = 0;
  state = { gen: 0, crashed: false, giveUp: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(err: Error, _info: ErrorInfo) {
    console.warn('[演算场] 画布异常，正在重建', err.message);
    if (this.retries >= 3) {
      this.setState({ giveUp: true });
      return;
    }
    this.retries += 1;
    requestAnimationFrame(() => this.setState((s) => ({ gen: s.gen + 1, crashed: false })));
  }
  render() {
    if (this.state.giveUp) {
      return (
        <div className="fixed inset-0 grid place-items-center font-song text-[15px]" style={{ background: 'var(--ink)', color: 'var(--sand)' }}>
          演算場畫布中斷，請重新整理頁面
        </div>
      );
    }
    if (this.state.crashed) {
      return <div className="fixed inset-0" style={{ background: 'var(--ink)' }} />;
    }
    return (
      <div key={this.state.gen} className="contents">
        {this.props.children}
      </div>
    );
  }
}

export default function Scene() {
  const select = useSim((s) => s.select);
  return (
    <CanvasBoundary>
      <Canvas
        aria-label="人列計算機 3D 演算場"
        dpr={[1, 2]}
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ fov: 45, near: 0.1, far: 4000, position: [85, 62, 95] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
        onCreated={({ scene }) => {
          // 白昼：薄晨霭，浅色远雾
          scene.fog = new THREE.FogExp2('#E4E2D4', 0.008);
        }}
        onPointerMissed={() => select(null)}
        style={{ position: 'fixed', inset: 0 }}
      >
        <Suspense fallback={null}>
          <Environment />
          <Soldiers />
          <Effects />
          <CameraRig />
        </Suspense>
      </Canvas>
    </CanvasBoundary>
  );
}

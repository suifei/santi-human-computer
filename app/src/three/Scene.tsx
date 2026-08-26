/** 3D 画布组合：渲染器规格见 home.md §1 */
import * as THREE from 'three';
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import Soldiers from './Soldiers';
import Environment from './Environment';
import Effects from './Effects';
import CameraRig from './CameraRig';
import { useSim } from '@/sim/store';

export default function Scene() {
  const select = useSim((s) => s.select);
  return (
    <Canvas
      aria-label="人列计算机 3D 演算场"
      dpr={[1, 2]}
      shadows={{ type: THREE.PCFSoftShadowMap }}
      camera={{ fov: 45, near: 0.1, far: 900, position: [85, 62, 95] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
      onCreated={({ scene }) => {
        // 白昼：薄晨霭，浅色远雾
        scene.fog = new THREE.FogExp2('#E4E2D4', 0.02);
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
  );
}

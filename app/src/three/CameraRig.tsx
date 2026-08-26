/** 相机与运镜：OrbitControls + 入场运镜 + 预设机位（1–5/F 快捷键）+ 跟随信号 + 鼓点微震 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import gsap from 'gsap';
import { useSim, activeLayerCentroid, type Preset } from '@/sim/store';
import { distantDrum } from '@/sim/audio';

const now = () => performance.now() / 1000;

const PRESETS: Record<Exclude<Preset, 'follow'>, { pos: [number, number, number]; tgt: [number, number, number] }> = {
  overview: { pos: [38, 30, 42], tgt: [0, 0.8, 0] },
  top: { pos: [0.1, 58, 0.1], tgt: [0, 0, 0] },
  input: { pos: [-22, 2.4, 26], tgt: [-14, 1, 14] },
  drum: { pos: [20, 4.5, 13], tgt: [-8, 1.2, -4] },
  output: { pos: [16, 5, -26], tgt: [10, 1.2, -16] },
};

const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null!);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const preset = useSim((s) => s.preset);
  const introDone = useSim((s) => s.introDone);
  const selectedId = useSim((s) => s.selectedId);
  const shake = useRef({ t0: -10, off: new THREE.Vector3() });
  const drumPulse = useSim((s) => s.drumPulse);

  const tweenTo = (pos: [number, number, number], tgt: [number, number, number], dur: number, ease: string) => {
    const c = controlsRef.current;
    c.enabled = false;
    const tl = gsap.timeline({ onComplete: () => { c.enabled = true; } });
    tl.to(camera.position, { x: pos[0], y: pos[1], z: pos[2], duration: dur, ease }, 0);
    tl.to(c.target, { x: tgt[0], y: tgt[1], z: tgt[2], duration: dur, ease, onUpdate: () => c.update() }, 0);
    return tl;
  };

  /* 入场运镜：高空鸟瞰 → 全景机位，雾密度 0.02→0.010，远鼓一声 */
  useEffect(() => {
    if (!introDone) return;
    distantDrum();
    const p = PRESETS.overview;
    tweenTo(p.pos, p.tgt, 4, 'power3.inOut');
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) gsap.to(fog, { density: 0.006, duration: 4, ease: 'power2.inOut' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introDone]);

  /* 预设机位切换 */
  useEffect(() => {
    if (!introDone || preset === 'follow') return;
    const p = PRESETS[preset];
    tweenTo(p.pos, p.tgt, 1.2, 'power2.inOut');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  /* 点选士兵：向其 dolly */
  useEffect(() => {
    if (selectedId === null || !introDone) return;
    const g = useSim.getState().netlist.byId.get(selectedId);
    if (!g) return;
    tweenTo(
      [g.pos[0] + 3.5, 2.5, g.pos[1] + 3.5],
      [g.pos[0], 1.2, g.pos[1]],
      1.0, 'power2.inOut',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /* 鼓点微震：±0.12m，120ms 衰减 */
  useEffect(() => {
    if (drumPulse === 0 || reducedMotion) return;
    shake.current.t0 = now();
    shake.current.off.set((Math.random() - 0.5), (Math.random() - 0.5) * 0.6, (Math.random() - 0.5)).normalize().multiplyScalar(0.12);
  }, [drumPulse]);

  const prevOff = useRef(new THREE.Vector3());

  useFrame(() => {
    const st = useSim.getState();
    // 跟随信号：target 每拍 lerp 至激活层质心，保持相对偏移
    if (st.preset === 'follow' && st.introDone) {
      const [cx, cz] = activeLayerCentroid(st.netlist, Math.max(1, st.tick));
      const c = controlsRef.current;
      c.target.lerp(new THREE.Vector3(cx, 0.8, cz), 0.06);
      camera.position.lerp(new THREE.Vector3(cx + 18, 12, cz + 22), 0.06);
      c.update();
    }
    // 微震合成（先撤上一帧偏移再加新偏移，避免累积）
    camera.position.sub(prevOff.current);
    const p = (now() - shake.current.t0) / 0.12;
    if (p < 1) prevOff.current.copy(shake.current.off).multiplyScalar(1 - p);
    else prevOff.current.set(0, 0, 0);
    camera.position.add(prevOff.current);
  });

  /* 快捷键 1–5 / F / 空格 / Esc */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const st = useSim.getState();
      const map: Record<string, Preset> = { '1': 'overview', '2': 'top', '3': 'input', '4': 'drum', '5': 'output' };
      if (map[e.key]) st.setPreset(map[e.key]);
      else if (e.key === 'f' || e.key === 'F') st.setPreset(st.preset === 'follow' ? 'overview' : 'follow');
      else if (e.key === ' ') { e.preventDefault(); st.toggleRun(); }
      else if (e.key === 'Escape') st.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={120}
      maxPolarAngle={1.45}
      target={[0, 0.8, 0]}
    />
  );
}

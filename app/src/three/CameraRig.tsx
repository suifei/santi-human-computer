/** 相机与运镜：OrbitControls + 入场运镜 + 预设机位（1–6/F 快捷键）+ 跟随信号 + 鼓点微震 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import gsap from 'gsap';
import { useSim, activeLayerCentroid, type Preset } from '@/sim/store';
import type { FieldBounds } from '@/sim/netlist';
import { distantDrum } from '@/sim/audio';

const now = () => performance.now() / 1000;

function presetsFromBounds(b: FieldBounds) {
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 40);
  const h = Math.max(30, span * 0.42);
  return {
    overview: { pos: [cx + span * 0.55, h, cz + span * 0.55] as [number, number, number], tgt: [cx, 0.8, cz] as [number, number, number] },
    top: { pos: [cx + 0.1, Math.max(58, span * 0.75), cz + 0.1] as [number, number, number], tgt: [cx, 0, cz] as [number, number, number] },
    input: { pos: [cx, 2.8, b.maxZ + 8] as [number, number, number], tgt: [cx, 1.15, b.maxZ - 1] as [number, number, number] },
    drum: { pos: [cx + span * 0.25, 4.5, cz + span * 0.15] as [number, number, number], tgt: [cx, 1.2, cz] as [number, number, number] },
    output: { pos: [b.maxX + 4, 5, b.minZ - 6] as [number, number, number], tgt: [cx, 1.2, b.minZ + 4] as [number, number, number] },
    command: { pos: [19.2, 5.55, -14.2] as [number, number, number], tgt: [24.4, 4.85, -17] as [number, number, number] },
  };
}

const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null!);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const preset = useSim((s) => s.preset);
  const introDone = useSim((s) => s.introDone);
  const selectedId = useSim((s) => s.selectedId);
  const drumPulse = useSim((s) => s.drumPulse);
  const shake = useRef({ t0: -10, off: new THREE.Vector3() });
  const bounds = useSim((s) => s.netlist.bounds);
  const PRESETS = presetsFromBounds(bounds);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 40);

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
    camera.far = Math.max(900, span * 8);
    camera.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  useEffect(() => {
    if (!introDone) return;
    camera.far = Math.max(900, span * 8);
    camera.updateProjectionMatrix();
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) fog.density = span > 80 ? 0.0035 : 0.006;
    if (preset !== 'follow') {
      const p = PRESETS[preset];
      tweenTo(p.pos, p.tgt, 1.4, 'power2.inOut');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [span]);

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
      const [cx, cz] = activeLayerCentroid(st.netlist, Math.max(1, st.tick), st.programOp);
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

  /* 快捷键 1–6 / F / 空格 / Esc */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      const st = useSim.getState();
      const map: Record<string, Preset> = { '1': 'overview', '2': 'top', '3': 'input', '4': 'drum', '5': 'output', '6': 'command' };
      if (map[e.key]) st.setPreset(map[e.key]);
      else if (e.key === 'f' || e.key === 'F') st.setPreset(st.preset === 'follow' ? 'overview' : 'follow');
      else if (e.key === ' ') { e.preventDefault(); st.toggleRun(); }
      else if (e.key === 'Escape') st.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const w = window as Window & {
      __santiLook?: (opts: {
        x: number; y: number; z: number;
        tx: number; ty: number; tz: number;
      }) => void;
    };
    w.__santiLook = ({ x, y, z, tx, ty, tz }) => {
      const c = controlsRef.current;
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(c.target);
      c.enabled = false;
      c.enableDamping = false;
      c.minDistance = 0.2;
      c.maxDistance = 80;
      c.maxPolarAngle = Math.PI;
      camera.position.set(x, y, z);
      c.target.set(tx, ty, tz);
      c.update();
      (w as Window & { __santiCamPos?: { x: number; y: number; z: number } }).__santiCamPos = {
        x: camera.position.x, y: camera.position.y, z: camera.position.z,
      };
    };
    return () => { delete w.__santiLook; };
  }, [camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={Math.max(120, span * 2.4)}
      maxPolarAngle={1.45}
      target={[0, 0.8, 0]}
    />
  );
}

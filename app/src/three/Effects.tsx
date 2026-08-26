/** 场景特效：门牌号地贴、波前光带、鼓面冲击环、选中光环与上游连线、悬停 tooltip */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useSim } from '@/sim/store';
import { gateTypeCN } from '@/sim/netlist';
import { makePlateAtlas } from './textures';

const now = () => performance.now() / 1000;

/* ================= 门牌号地贴（单张图集 + InstancedMesh） ================= */
function DoorPlates() {
  const netlist = useSim((s) => s.netlist);
  const plated = useMemo(() => {
    if (netlist.gates.length <= 1024) return netlist.gates;
    return netlist.gates.filter((g) => g.type === 'INPUT' || g.type === 'OUTPUT' || g.type === 'DONE');
  }, [netlist]);
  const n = plated.length;
  const ref = useRef<THREE.InstancedMesh>(null!);
  const { tex, cells } = useMemo(() => makePlateAtlas(plated), [plated]);

  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.6, 0.3);
    g.rotateX(-Math.PI / 2);
    const cells_ = new Float32Array(n);
    for (let i = 0; i < n; i++) cells_[i] = i;
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells_, 1));
    return g;
  }, [n]);

  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      tAtlas: { value: tex },
      uCells: { value: cells },
      uHover: { value: -1 },
      uSelect: { value: -1 },
    },
    vertexShader: `
      attribute float aCell;
      varying vec2 vUv; varying float vCell;
      void main(){
        vUv = uv; vCell = aCell;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform sampler2D tAtlas; uniform float uCells; uniform float uHover; uniform float uSelect;
      varying vec2 vUv; varying float vCell;
      void main(){
        vec2 cell = vec2(mod(vCell, uCells), floor(vCell/uCells));
        vec4 c = texture2D(tAtlas, (cell + vUv)/uCells);
        float glow = (abs(vCell-uHover)<0.5 || abs(vCell-uSelect)<0.5) ? 1.0 : 0.0;
        c.rgb = mix(c.rgb, vec3(0.83,0.66,0.32), glow*0.75);
        gl_FragColor = vec4(c.rgb, 0.75 + glow*0.25);
      }`,
  }), [tex, cells]);

  useFrame(() => {
    const st = useSim.getState();
    const hoverSlot = st.hoveredId !== null ? plated.findIndex((g) => g.id === st.hoveredId) : -1;
    const selSlot = st.selectedId !== null ? plated.findIndex((g) => g.id === st.selectedId) : -1;
    // eslint-disable-next-line react-hooks/immutability -- three.js uniform 需就地更新
    mat.uniforms.uHover.value = hoverSlot;
    mat.uniforms.uSelect.value = selSlot;
  });

  useEffect(() => {
    const m = new THREE.Matrix4();
    plated.forEach((gate, i) => {
      m.makeTranslation(gate.pos[0], 0.012, gate.pos[1] - 0.5);
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [plated]);

  return <instancedMesh key={`${netlist.expr}-${netlist.bits}-${n}`} ref={ref} args={[geom, mat, n]} />;
}

/* ================= 波前光带 ================= */
function WaveBand() {
  const ref = useRef<THREE.Mesh>(null!);
  const drumPulse = useSim((s) => s.drumPulse);
  const anim = useRef({ t0: -10, dur: 0.26, x0: 0, x1: 0 });

  useEffect(() => {
    if (drumPulse === 0) return;
    const st = useSim.getState();
    const gates = st.netlist.byLayer[Math.min(st.tick, st.netlist.maxLayer)];
    if (!gates?.length) return;
    let x0 = Infinity, x1 = -Infinity, z = 0;
    for (const g of gates) { x0 = Math.min(x0, g.pos[0]); x1 = Math.max(x1, g.pos[0]); z += g.pos[1]; }
    z /= gates.length;
    ref.current.position.set(0, 0.06, z);
    anim.current = {
      t0: now(),
      dur: st.flipFast ? 0.05 : 0.4 * (0.65 / st.speed),
      x0: x0 - 2, x1: x1 + 2,
    };
  }, [drumPulse]);

  useFrame(() => {
    const { t0, dur, x0, x1 } = anim.current;
    const p = (now() - t0) / dur;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    if (p >= 0 && p <= 1) {
      ref.current.visible = true;
      const w = 3;
      ref.current.position.x = x0 + (x1 - x0) * p;
      m.opacity = 0.16 * (1 - p);
      ref.current.scale.set(w, 1, 1);
    } else {
      ref.current.visible = false;
    }
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <planeGeometry args={[1, 1.5]} />
      <meshBasicMaterial color="#D4A952" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/* ================= 鼓面冲击环 ================= */
function ShockRing() {
  const ref = useRef<THREE.Mesh>(null!);
  const drumPulse = useSim((s) => s.drumPulse);
  const t0 = useRef(-10);
  useEffect(() => { if (drumPulse > 0) t0.current = now(); }, [drumPulse]);
  useFrame(() => {
    const p = (now() - t0.current) / 0.4;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    if (p >= 0 && p <= 1) {
      ref.current.visible = true;
      const r = 0.8 + (3 - 0.8) * p;
      ref.current.scale.set(r / 0.8, r / 0.8, 1);
      m.opacity = 0.5 * (1 - p);
    } else ref.current.visible = false;
  });
  return (
    <mesh ref={ref} position={[25, 4.0, 15.4]} rotation={[0, Math.PI, 0]} visible={false}>
      <ringGeometry args={[0.72, 0.8, 32]} />
      <meshBasicMaterial color="#D4A952" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/* ================= 悬停/选中光环 + 上游连线 ================= */
function Selection() {
  const hoveredId = useSim((s) => s.hoveredId);
  const selectedId = useSim((s) => s.selectedId);
  const netlist = useSim((s) => s.netlist);
  const ringRef = useRef<THREE.Mesh>(null!);

  const selected = selectedId !== null ? netlist.byId.get(selectedId) ?? null : null;
  const hovered = hoveredId !== null ? netlist.byId.get(hoveredId) ?? null : null;
  const shown = selected ?? hovered;

  const upLines = useMemo(() => {
    if (!selected) return null;
    const pts: THREE.Vector3[] = [];
    for (const up of [selected.inA, selected.inB]) {
      if (up === null) continue;
      const g = netlist.byId.get(up);
      if (!g) continue;
      pts.push(new THREE.Vector3(selected.pos[0], 1.2, selected.pos[1]));
      pts.push(new THREE.Vector3(g.pos[0], 1.2, g.pos[1]));
    }
    if (!pts.length) return null;
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    // LineSegments 虚线需要 lineDistance 属性
    const dist = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 2) {
      dist[i] = 0;
      dist[i + 1] = pts[i].distanceTo(pts[i + 1]);
    }
    geo.setAttribute('lineDistance', new THREE.BufferAttribute(dist, 1));
    return geo;
  }, [selected, netlist]);

  const lineRef = useRef<THREE.LineSegments>(null!);
  useFrame(() => {
    if (ringRef.current && shown) {
      ringRef.current.position.set(shown.pos[0], 0.03, shown.pos[1]);
      const s = 1 + Math.sin(now() * 4) * 0.08;
      ringRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group>
      {shown && (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.52, 32]} />
          <meshBasicMaterial color={selected ? '#D4A952' : '#B08A4F'} transparent opacity={selected ? 0.85 : 0.7} depthWrite={false} />
        </mesh>
      )}
      {upLines && (
        <lineSegments ref={lineRef} geometry={upLines}>
          <lineDashedMaterial color="#D4A952" transparent opacity={0.5} dashSize={0.25} gapSize={0.15} />
        </lineSegments>
      )}
      {hovered && !selected && (
        <Html position={[hovered.pos[0], 2.9, hovered.pos[1]]} center distanceFactor={26} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-sm px-2 py-1 font-mono text-[11px]" style={{ background: 'rgba(23,16,11,0.85)', color: 'var(--gold)', border: '1px solid rgba(176,138,79,0.5)' }}>
            門牌 {String(hovered.id).padStart(3, '0')} · {gateTypeCN(hovered.type)}
          </div>
        </Html>
      )}
    </group>
  );
}

export default function Effects() {
  return (
    <group>
      <DoorPlates />
      <WaveBand />
      <ShockRing />
      <Selection />
    </group>
  );
}

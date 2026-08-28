/** 秦卒点验：单独看一具静模的塑形与光照，再决定是否列阵。 */
import '@/three/absorbInspect';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, useProgress } from '@react-three/drei';
import { Link, useSearchParams } from 'react-router';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SkyDome } from '@/three/Environment';
import QinSoldier from '@/three/QinSoldier';
import VonNeumann from '@/three/VonNeumann';
import Emperor from '@/three/Emperor';
import { QIN_SOLDIER, formatBytes } from '@/three/qinAsset';
import { VON_NEUMANN } from '@/three/vonNeumannAsset';
import { EMPEROR } from '@/three/emperorAsset';
import { asset, cn } from '@/lib/utils';

type Subject = 'qin' | 'vn' | 'emperor';

type Plate = 'front' | 'threeQuarter' | 'side' | 'back' | 'head' | 'full' | 'rightFace';

const PLATES: { id: Plate; label: string; hotkey: string; pos: [number, number, number]; target: [number, number, number] }[] = [
  { id: 'front', label: '正面', hotkey: '1', pos: [0, 1.32, 3.05], target: [0, 0.88, 0] },
  { id: 'threeQuarter', label: '側影', hotkey: '2', pos: [1.85, 1.38, 2.35], target: [0, 0.9, 0] },
  { id: 'side', label: '側面', hotkey: '3', pos: [2.85, 1.22, 0.12], target: [0, 0.88, 0] },
  { id: 'back', label: '背面', hotkey: '4', pos: [0, 1.32, -3.05], target: [0, 0.88, 0] },
  { id: 'head', label: '頭顱', hotkey: '5', pos: [0, 1.54, 1.28], target: [0.017, 1.54, 0] },
  { id: 'full', label: '通視', hotkey: '6', pos: [2.55, 1.95, 3.85], target: [0, 0.78, 0] },
  { id: 'rightFace', label: '右臉', hotkey: '7', pos: [-1.15, 1.56, 1.35], target: [-0.02, 1.54, 0] },
];

function InspectionGround() {
  const shared = useLoader(THREE.TextureLoader, asset('models/ground-proto-tile.jpg?v=inspect'));
  const tex = useMemo(() => {
    const t = shared.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 6);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [shared]);
  useLayoutEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[18, 18]} />
      <meshStandardMaterial map={tex} roughness={0.95} metalness={0} color="#ffffff" />
    </mesh>
  );
}

function HeightStaff({ height }: { height: number }) {
  const marks = [0, 0.5, 1.0, 1.5, height];
  return (
    <group position={[-0.78, 0, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.01, 0.01, height, 8]} />
        <meshStandardMaterial color="#B08A4F" metalness={0.42} roughness={0.38} />
      </mesh>
      {marks.map((y) => (
        <group key={y} position={[0, y, 0]}>
          <mesh position={[0.05, 0, 0]}>
            <boxGeometry args={[0.1, 0.01, 0.01]} />
            <meshStandardMaterial color="#D4A952" metalness={0.35} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function YardLights() {
  const lightRef = useRef<THREE.DirectionalLight>(null!);
  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.target.position.set(0, 0.6, 0);
    light.target.updateMatrixWorld();
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.bias = -0.0002;
    const cam = light.shadow.camera;
    cam.left = -4;
    cam.right = 4;
    cam.top = 4;
    cam.bottom = -4;
    cam.far = 30;
    cam.updateProjectionMatrix();
  }, []);
  return (
    <>
      <directionalLight
        ref={lightRef}
        position={[5.2, 8.6, 6.4]}
        color="#FFF2DC"
        intensity={2.7}
        castShadow
      />
      <directionalLight position={[-5.5, 6.2, -3.4]} color="#C9D6EA" intensity={0.45} />
      <hemisphereLight color="#C5D8EA" groundColor="#C9B189" intensity={1.05} />
      <ambientLight intensity={0.22} />
    </>
  );
}

function LampLights() {
  return (
    <>
      <directionalLight position={[3.2, 5.4, 4.2]} color="#FFF6E8" intensity={1.7} castShadow />
      <directionalLight position={[-4.5, 3.2, -2]} color="#C9D6EA" intensity={0.55} />
      <hemisphereLight color="#E8DCC3" groundColor="#7A5C3E" intensity={0.45} />
    </>
  );
}

function PresetRig({ plate }: { plate: Plate }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useLayoutEffect(() => {
    const spec = PLATES.find((p) => p.id === plate);
    if (!spec) return;
    camera.position.set(...spec.pos);
    if (controls) {
      controls.target.set(...spec.target);
      controls.update();
    }
  }, [plate, camera, controls]);
  return null;
}

function LoadGate() {
  const { progress, active } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center" style={{ background: 'rgba(23,16,11,0.55)' }}>
      <div className="font-song text-[14px]" style={{ color: 'var(--sand)' }}>
        點驗裝載 {progress.toFixed(0)}%
      </div>
    </div>
  );
}

export default function AssetStudio() {
  const [params, setParams] = useSearchParams();
  const who = params.get('who');
  const subject: Subject = who === 'vn' ? 'vn' : who === 'emperor' ? 'emperor' : 'qin';
  const spec = subject === 'vn' ? VON_NEUMANN : subject === 'emperor' ? EMPEROR : QIN_SOLDIER;
  const [plate, setPlate] = useState<Plate>('threeQuarter');
  const [wire, setWire] = useState(false);
  const [spin, setSpin] = useState(false);
  const [human, setHuman] = useState(true);
  const [lamp, setLamp] = useState(false);

  const setSubject = (who: Subject) => {
    const next = new URLSearchParams(params);
    if (who === 'qin') next.delete('who');
    else next.set('who', who);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const hit = PLATES.find((p) => p.hotkey === e.key);
      if (hit) { setPlate(hit.id); return; }
      if (e.key === 'w' || e.key === 'W') setWire((v) => !v);
      if (e.key === 'r' || e.key === 'R') setSpin((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: 'var(--ink)' }}>
      <Canvas
        aria-label={subject === 'vn' ? '馮諾依曼點驗' : subject === 'emperor' ? '始皇點驗' : '秦卒點驗'}
        dpr={[1, 2]}
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ fov: 35, near: 0.08, far: 900, position: [1.85, 1.38, 2.35] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.28 }}
        onCreated={({ scene }) => {
          scene.fog = new THREE.FogExp2('#E4E2D4', 0.004);
        }}
        style={{ position: 'fixed', inset: 0 }}
      >
        <Suspense fallback={null}>
          <SkyDome />
          {lamp ? <LampLights /> : <YardLights />}
          <InspectionGround />
          {subject === 'vn'
            ? <VonNeumann wireframe={wire} />
            : subject === 'emperor'
              ? <Emperor wireframe={wire} />
              : <QinSoldier wireframe={wire} human={human} />}
          <HeightStaff height={spec.heightM} />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            autoRotate={spin}
            autoRotateSpeed={0.55}
            minDistance={0.32}
            maxDistance={10}
            maxPolarAngle={Math.PI * 0.495}
            target={[0, 0.92, 0]}
          />
          <PresetRig plate={plate} />
        </Suspense>
      </Canvas>

      <LoadGate />

      <div className="pointer-events-none fixed inset-0 z-20">
        <header
          className="pointer-events-auto fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-5 py-3"
          style={{
            background: 'rgba(23,16,11,0.82)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(176,138,79,0.35)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <img src={asset('logo-seal.svg')} alt="" width={28} height={28} className="rounded-sm" />
            <div className="leading-tight">
              <div className="font-brush text-[24px] tracking-[0.12em] text-paper">{subject === 'vn' ? '點驗馮諾依曼' : subject === 'emperor' ? '點驗始皇' : '點驗秦卒'}</div>
              <div className="text-[13px] tracking-[0.08em]" style={{ color: 'var(--earth-300)' }}>{subject === 'vn' ? '監軍台靜模' : subject === 'emperor' ? '監軍台靜模 · 玄衣持圭' : '靜模一兵 · 未列人海'}</div>
            </div>
          </div>
          <nav className="flex items-center gap-5 text-[15px]">
            <Link to="/" className="transition-colors hover:text-gold" style={{ color: 'var(--sand)' }}>演算場</Link>
            <span className="font-medium" style={{ color: 'var(--gold)' }}>點驗</span>
            <Link to="/principle" className="transition-colors hover:text-gold" style={{ color: 'var(--sand)' }}>原理</Link>
            <Link to="/formation" className="transition-colors hover:text-gold" style={{ color: 'var(--sand)' }}>陣圖</Link>
          </nav>
        </header>

        <aside className="pointer-events-auto panel absolute left-4 top-20 hidden w-[17.5rem] p-4 md:block" style={{ color: 'var(--sand)' }}>
          <div className="panel-title mb-3">點驗牘</div>
          <div className="mb-3 flex gap-1">
            {([['qin', '秦卒'], ['vn', '馮諾依曼'], ['emperor', '始皇']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSubject(id)}
                className="rounded-sm px-2 py-1 text-[13px]"
                style={{
                  color: subject === id ? 'var(--ink)' : 'var(--sand)',
                  background: subject === id ? 'var(--gold)' : 'transparent',
                  border: '1px solid rgba(176,138,79,0.35)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="font-song text-[15px] leading-[1.85]" style={{ color: 'var(--paper)' }}>
            {subject === 'vn' ? (
              <>
                用戶製作的 <span className="font-mono">vonneumann-proto.glb</span>，扶成身高 {VON_NEUMANN.heightM.toFixed(2)}m、腳底貼地、面朝 +Z。有貼圖則用自帶材質，否則灰陶。
              </>
            ) : subject === 'emperor' ? (
              <>
                用戶製作的 <span className="font-mono">emperor-proto.glb</span>，扶成身高 {EMPEROR.heightM.toFixed(2)}m、腳底貼地、面朝 +Z，貼圖用模型自帶反照率。
              </>
            ) : (
              <>
                擬人靜模：用戶製作的 <span className="font-mono">qin-proto.glb</span>，扶成身高 1.76m、腳底貼地、面朝 +Z，貼圖用模型自帶反照率。
              </>
            )}
          </p>
          <dl className="mt-4 grid grid-cols-[4.5rem_1fr] gap-y-2 text-[14px]">
            <dt style={{ color: 'var(--bronze)' }}>身高</dt>
            <dd className="font-mono-num">{spec.heightM.toFixed(2)} m</dd>
            <dt style={{ color: 'var(--bronze)' }}>面數</dt>
            <dd className="font-mono-num">{(subject === 'vn' ? VON_NEUMANN.tris : subject === 'emperor' ? EMPEROR.tris : QIN_SOLDIER.showcaseTris).toLocaleString()} 三角</dd>
            <dt style={{ color: 'var(--bronze)' }}>體積</dt>
            <dd className="font-mono-num">{formatBytes(subject === 'vn' ? VON_NEUMANN.bytes : subject === 'emperor' ? EMPEROR.bytes : QIN_SOLDIER.showcaseBytes)}</dd>
            <dt style={{ color: 'var(--bronze)' }}>許可</dt>
            <dd>
              <a href={spec.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-gold">
                {spec.license} · {spec.credit}
              </a>
            </dd>
          </dl>
          {subject === 'qin' ? (
            <p className="mt-3 text-[13px] leading-[1.8]" style={{ color: 'var(--earth-300)' }}>
              列陣另用 {QIN_SOLDIER.armyTris.toLocaleString()} 面減模。旗仍是獨立翻面，不進這具身體。
            </p>
          ) : (
            <p className="mt-3 text-[13px] leading-[1.8]" style={{ color: 'var(--earth-300)' }}>
              {subject === 'emperor' ? '演算場監軍台上同一具靜模，與馮諾依曼同台面朝操場。' : '演算場監軍台上同一具靜模，與始皇同台面朝操場。'}
            </p>
          )}
        </aside>

        <div className="pointer-events-auto panel absolute right-4 top-20 hidden w-[11.5rem] p-2 md:block">
          <div className="panel-title mb-2 px-1">檢視</div>
          {(
            [
              { id: 'wire', label: '線框', hotkey: 'W', on: wire, fn: () => setWire((v) => !v) },
              { id: 'spin', label: '巡閱', hotkey: 'R', on: spin, fn: () => setSpin((v) => !v) },
              ...(subject === 'qin'
                ? [{ id: 'human', label: human ? '擬人' : '陶俑', hotkey: '', on: human, fn: () => setHuman((v) => !v) }]
                : []),
              { id: 'lamp', label: lamp ? '燈房' : '校場', hotkey: '', on: lamp, fn: () => setLamp((v) => !v) },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.fn}
              className="mb-1 flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-[14px]"
              style={{
                color: item.on ? 'var(--ink)' : 'var(--sand)',
                background: item.on ? 'var(--gold)' : 'transparent',
              }}
            >
              {item.label}
              {item.hotkey ? <span className="font-mono opacity-60">{item.hotkey}</span> : null}
            </button>
          ))}
        </div>

        <div className="pointer-events-auto panel absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-1 p-1.5">
          {PLATES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlate(p.id)}
              className={cn('rounded-sm px-2.5 py-1.5 text-[14px]')}
              style={{
                color: plate === p.id ? 'var(--ink)' : 'var(--sand)',
                background: plate === p.id ? 'var(--gold)' : 'transparent',
              }}
            >
              {p.label}
              <span className="ml-1 font-mono text-[10px] opacity-60">{p.hotkey}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

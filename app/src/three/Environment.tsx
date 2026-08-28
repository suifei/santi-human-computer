/** 环境：天空穹顶、夯土地面与地格、区域木牌、远景营帐、鼓台、监军台、火把、飞鸟（白昼场景） */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useSim } from '@/sim/store';
import { makeFlagTexture, makeSignTexture } from './textures';
import { asset } from '@/lib/utils';
import { waitAppFonts } from '@/lib/fonts';
import VonNeumann from './VonNeumann';
import Emperor from './Emperor';
import QinSoldier from './QinSoldier';
import { PROTO, protoUrl } from './protoAssets';
import { bakeFit, firstMesh, findDeckY, placeOnGround, prepareProtoMaterials } from './fitModel';

const now = () => performance.now() / 1000;
const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TENT_SPOTS: [number, number, number][] = [[-42, -28, 1], [46, -24, 1.2], [-46, 12, 0.9], [48, 26, 1.1], [-38, -34, 1.4]];
const FLAT_LANDMARKS: [number, number, number][] = [
  [25, 16, 8], [25, -17, 8],
  [-24, 22, 4], [24, 22, 4], [-24, -22, 4], [24, -22, 4],
];

type FieldLayout = {
  spanX: number; spanZ: number; span: number;
  coverW: number; coverD: number;
  cx: number; cz: number; flatR: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
};

function hash2(x: number, z: number) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
function noise2(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm2(x: number, z: number) {
  return noise2(x, z) * 0.52 + noise2(x * 2.07, z * 2.07) * 0.31 + noise2(x * 4.13, z * 4.13) * 0.17;
}
function smoother(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / Math.max(1e-6, e1 - e0)));
  return t * t * (3 - 2 * t);
}
/** 操场内为 0，向外缓成约 2m 丘。士兵仍站 y=0。 */
function terrainHeight(x: number, z: number, layout: FieldLayout) {
  const d = Math.hypot(x - layout.cx, z - layout.cz);
  const t = smoother(layout.flatR, layout.flatR + 42, d);
  if (t <= 0) return 0;
  return t * (0.35 + fbm2(x * 0.022, z * 0.022) * 4.4);
}
function fieldLayout(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): FieldLayout {
  const spanX = Math.max(40, bounds.maxX - bounds.minX);
  const spanZ = Math.max(40, bounds.maxZ - bounds.minZ);
  const span = Math.max(spanX, spanZ);
  const pad = Math.max(80, span * 0.5);
  const coverW = Math.max((spanX + pad * 2) * 2.4, 320);
  const coverD = Math.max((spanZ + pad * 2) * 2.4, 320);
  const cx = Number.isFinite(bounds.minX) ? (bounds.minX + bounds.maxX) / 2 : 0;
  const cz = Number.isFinite(bounds.minZ) ? (bounds.minZ + bounds.maxZ) / 2 : 0;
  const hx = Number.isFinite(bounds.minX) ? Math.max(Math.abs(bounds.minX - cx), Math.abs(bounds.maxX - cx)) : 20;
  const hz = Number.isFinite(bounds.minZ) ? Math.max(Math.abs(bounds.minZ - cz), Math.abs(bounds.maxZ - cz)) : 20;
  let flatR = Math.hypot(hx, hz) + 6;
  for (const [x, z, keep] of FLAT_LANDMARKS) {
    flatR = Math.max(flatR, Math.hypot(x - cx, z - cz) + keep);
  }
  return {
    spanX, spanZ, span, coverW, coverD, cx, cz, flatR,
    minX: Number.isFinite(bounds.minX) ? bounds.minX : -20,
    maxX: Number.isFinite(bounds.maxX) ? bounds.maxX : 20,
    minZ: Number.isFinite(bounds.minZ) ? bounds.minZ : -20,
    maxZ: Number.isFinite(bounds.maxZ) ? bounds.maxZ : 20,
  };
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= 天空穹顶：晨霭全景，地平线在贴图底部 ================= */
export function SkyDome() {
  const tex = useLoader(THREE.TextureLoader, asset('models/sky-proto-panorama.jpg?v=env1'));
  const uniforms = useMemo(() => ({ tSky: { value: tex } }), [tex]);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
  }, [tex]);
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[400, 32, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vDir;
          void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`}
        fragmentShader={`
          uniform sampler2D tSky;
          varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir);
            float elev = asin(clamp(d.y, -1.0, 1.0));
            float u = fract(atan(d.z, -d.x) / 6.2831853 + 0.58);
            float v01 = pow(clamp(elev / 1.5707963, 0.0, 1.0), 0.65);
            float vSky = mix(0.40, 1.0, v01);
            vec3 photo = texture2D(tSky, vec2(u, vSky)).rgb;
            float e = clamp(d.y * 1.35 + 0.08, 0.0, 1.0);
            vec3 hor = vec3(0.86, 0.88, 0.86), mid = vec3(0.48, 0.68, 0.86), top = vec3(0.18, 0.46, 0.78);
            vec3 grad = mix(hor, mid, smoothstep(0.0, 0.45, e));
            grad = mix(grad, top, smoothstep(0.32, 1.0, e));
            vec3 sky = mix(grad, photo, mix(0.62, 0.93, v01));
            vec3 fogCol = vec3(0.894, 0.886, 0.831);
            float below = smoothstep(0.06, -0.10, elev);
            gl_FragColor = vec4(mix(sky, fogCol, below), 1.0);
          }`}
      />
    </mesh>
  );
}

/* ================= 地面 + 地格 + 区块金线 ================= */
function Ground() {
  const shared = useLoader(THREE.TextureLoader, asset('models/ground-proto-tile.jpg?v=env1'));
  const bounds = useSim((s) => s.netlist.bounds);
  const classic = useSim((s) => s.bits === 10 && s.expr === '(A+B)*C');
  const layout = useMemo(() => fieldLayout(bounds), [bounds]);
  const { coverW, coverD, cx, cz, flatR, span } = layout;
  const tex = useMemo(() => {
    const t = shared.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(12, coverW / 7), Math.max(10, coverD / 7));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, [shared, coverW, coverD]);
  useEffect(() => () => tex.dispose(), [tex]);

  const terrain = useMemo(() => {
    const g = new THREE.PlaneGeometry(coverW, coverD, 96, 96);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(cx + pos.getX(i), cz + pos.getZ(i), layout));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [coverW, coverD, cx, cz, layout]);
  useEffect(() => () => terrain.dispose(), [terrain]);

  const grid = useMemo(() => {
    const step = span > 90 ? 2 : 1;
    const half = Math.min(flatR * 0.72, Math.max(spanXPad(layout), 28));
    const x0 = Math.floor((cx - half) / step) * step;
    const x1 = Math.ceil((cx + half) / step) * step;
    const z0 = Math.floor((cz - half) / step) * step;
    const z1 = Math.ceil((cz + half) / step) * step;
    const pts: number[] = [];
    const lim = flatR * 0.92;
    for (let x = x0; x <= x1; x += step) {
      if (Math.hypot(x - cx, 0) > lim) continue;
      pts.push(x, 0.015, Math.max(z0, cz - Math.sqrt(Math.max(0, lim * lim - (x - cx) ** 2))));
      pts.push(x, 0.015, Math.min(z1, cz + Math.sqrt(Math.max(0, lim * lim - (x - cx) ** 2))));
    }
    for (let z = z0; z <= z1; z += step) {
      if (Math.hypot(0, z - cz) > lim) continue;
      pts.push(Math.max(x0, cx - Math.sqrt(Math.max(0, lim * lim - (z - cz) ** 2))), 0.015, z);
      pts.push(Math.min(x1, cx + Math.sqrt(Math.max(0, lim * lim - (z - cz) ** 2))), 0.015, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [cx, cz, flatR, span, layout]);
  useEffect(() => () => grid.dispose(), [grid]);

  const zoneLines = useMemo(() => {
    const rects: [number, number, number, number][] = [
      [-21, -10.5, 15.5, 20],
      [-25, -23, 5, 16],
      [-17, -3.5, 1.5, 14.5],
      [-3, 11, 5, 14],
      [-3, 22, -13.5, 5],
      [1, 23, -18, -16],
    ];
    const pts: number[] = [];
    for (const [x0, x1, z0, z1] of rects) {
      pts.push(x0, 0.02, z0, x1, 0.02, z0, x1, 0.02, z0, x1, 0.02, z1, x1, 0.02, z1, x0, 0.02, z1, x0, 0.02, z1, x0, 0.02, z0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);

  return (
    <group>
      <mesh geometry={terrain} position={[cx, 0, cz]} receiveShadow>
        <meshStandardMaterial map={tex} roughness={1} metalness={0} color="#ffffff" />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#6E5C3E" transparent opacity={0.28} />
      </lineSegments>
      {classic && (
        <lineSegments geometry={zoneLines}>
          <lineBasicMaterial color="#C09A3E" transparent opacity={0.55} />
        </lineSegments>
      )}
    </group>
  );
}

function spanXPad(layout: FieldLayout) {
  return Math.max(layout.spanX, layout.spanZ) * 0.55 + 8;
}

/* ================= 区域木牌 ================= */
const SIGNS: { text: string; pos: [number, number]; rotY: number }[] = [
  { text: '輸入區', pos: [-22.6, 18], rotY: Math.PI / 2 },
  { text: '加法陣', pos: [-17.6, 8], rotY: Math.PI / 2 },
  { text: '乘法陣', pos: [-3.2, 9.5], rotY: Math.PI / 2 },
  { text: '輸出區', pos: [0.4, -17], rotY: Math.PI / 2 },
];

function ZoneSigns() {
  const classic = useSim((s) => s.bits === 10 && s.expr === '(A+B)*C');
  const cpu = useSim((s) => s.netlist.cpu);
  const gates = useSim((s) => s.netlist.gates);
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => { waitAppFonts().then(() => setFontsReady(true)); }, []);

  const cpuSigns = useMemo(() => {
    if (!cpu) return [];
    const items: { text: string; pos: [number, number] }[] = [];
    const pick = (text: string, zone: string) => {
      const gs = gates.filter((g) => g.zone === zone);
      if (!gs.length) return;
      let x = 0, z = 0;
      for (const g of gs) { x += g.pos[0]; z += g.pos[1]; }
      items.push({ text, pos: [x / gs.length - 2.2, z / gs.length] });
    };
    pick('寄存器', 'REG');
    pick('比較陣', 'CMP');
    pick('加法陣', 'ADDER');
    pick('減法陣', 'SUB');
    pick('乘法陣', 'PP');
    pick('除法陣', 'DIV');
    return items;
  }, [cpu, gates]);

  const texturesClassic = useMemo(() => SIGNS.map((s) => makeSignTexture(s.text)), [fontsReady]);
  const texturesCpu = useMemo(() => cpuSigns.map((s) => makeSignTexture(s.text)), [fontsReady, cpuSigns]);

  if (cpu) {
    return (
      <group>
        {cpuSigns.map((s, i) => (
          <group key={s.text} position={[s.pos[0], 0, s.pos[1]]} rotation={[0, Math.PI / 2, 0]}>
            <mesh position={[0, 0.8, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.06, 1.6, 6]} />
              <meshStandardMaterial color="#5A4630" roughness={0.9} />
            </mesh>
            <mesh position={[0, 1.6, 0.06]} castShadow>
              <planeGeometry args={[0.8, 1.6]} />
              <meshStandardMaterial map={texturesCpu[i]} roughness={0.85} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  if (!classic) return null;
  return (
    <group>
      {SIGNS.map((s, i) => (
        <group key={i} position={[s.pos[0], 0, s.pos[1]]} rotation={[0, s.rotY, 0]}>
          <mesh position={[0, 0.8, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.06, 1.6, 6]} />
            <meshStandardMaterial color="#5A4630" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.6, 0.06]} castShadow>
            <planeGeometry args={[0.8, 1.6]} />
            <meshStandardMaterial map={texturesClassic[i]} roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

type Plant = { x: number; y: number; z: number; w: number; h: number; phase: number };

function blocked(x: number, z: number, layout: FieldLayout, innerR: number) {
  if (Math.hypot(x - layout.cx, z - layout.cz) < innerR) return true;
  if (x > layout.minX - 8 && x < layout.maxX + 8 && z > layout.minZ - 8 && z < layout.maxZ + 8) return true;
  for (const [tx, tz] of TENT_SPOTS) {
    if (Math.hypot(x - tx, z - tz) < 6.5) return true;
  }
  for (const [lx, lz, keep] of FLAT_LANDMARKS) {
    if (Math.hypot(x - lx, z - lz) < keep + 2) return true;
  }
  return false;
}

function scatterPlants(
  layout: FieldLayout,
  count: number,
  r0: number,
  r1: number,
  height: number,
  aspect: number,
  scaleA: number,
  scaleB: number,
  seed: number,
): Plant[] {
  const rng = mulberry32(seed);
  const out: Plant[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 30) {
    guard += 1;
    const ang = rng() * Math.PI * 2;
    const r = r0 + rng() * Math.max(0, r1 - r0);
    const x = layout.cx + Math.cos(ang) * r;
    const z = layout.cz + Math.sin(ang) * r;
    if (blocked(x, z, layout, r0 - 1)) continue;
    const s = scaleA + rng() * (scaleB - scaleA);
    const h = height * s;
    out.push({ x, y: terrainHeight(x, z, layout), z, w: h * aspect, h, phase: rng() * Math.PI * 2 });
  }
  return out;
}

function makeBillboardMaterial(map: THREE.Texture, wind: number, freq: number) {
  const mat = new THREE.MeshBasicMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.22,
    depthWrite: true,
    fog: true,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: reducedMotion ? 0 : wind };
    shader.uniforms.uFreq = { value: freq };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPhase;
        uniform float uTime;
        uniform float uWind;
        uniform float uFreq;`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition;
        #ifdef USE_INSTANCING
          float sx = length(instanceMatrix[0].xyz);
          float sy = length(instanceMatrix[1].xyz);
          vec3 origin = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
          vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 camUp = vec3(0.0, 1.0, 0.0);
          float gust = sin(uTime * uFreq + aPhase) * uWind * position.y * position.y;
          vec3 worldPos = origin + camRight * (position.x * sx + gust) + camUp * (position.y * sy);
          mvPosition = viewMatrix * vec4(worldPos, 1.0);
        #else
          mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        #endif
        gl_Position = projectionMatrix * mvPosition;
      `);
    mat.userData.shader = shader;
  };
  return mat;
}

function BillboardPatch({
  url, plants, wind, freq, segs,
}: {
  url: string; plants: Plant[]; wind: number; freq: number; segs: number;
}) {
  const map = useLoader(THREE.TextureLoader, url);
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.anisotropy = 4;
    map.needsUpdate = true;
  }, [map]);
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, 1, segs);
    g.translate(0, 0.5, 0);
    const phases = new Float32Array(Math.max(plants.length, 1));
    for (let i = 0; i < plants.length; i++) phases[i] = plants[i].phase;
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    return g;
  }, [plants, segs]);
  const mat = useMemo(() => makeBillboardMaterial(map, wind, freq), [map, wind, freq]);
  useEffect(() => () => { geom.dispose(); mat.dispose(); }, [geom, mat]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < plants.length; i++) {
      const p = plants[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.w, p.h, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = plants.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [plants]);

  useFrame(({ clock }) => {
    const shader = mat.userData.shader as THREE.WebGLProgramParametersWithUniforms | undefined;
    if (shader?.uniforms.uTime) shader.uniforms.uTime.value = clock.elapsedTime;
  });

  if (plants.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geom, mat, plants.length]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}

function Vegetation() {
  const bounds = useSim((s) => s.netlist.bounds);
  const layout = useMemo(() => fieldLayout(bounds), [bounds]);
  const trees = useMemo(() => {
    const r0 = layout.flatR + 5;
    const r1 = layout.flatR + 34;
    const all = scatterPlants(layout, 36, r0, r1, 6, 535 / 1493, 0.78, 1.42, 0x51CE);
    const young = scatterPlants(layout, 16, r0 + 6, r1 - 4, 3.4, 535 / 1493, 0.72, 1.15, 0x7E21);
    const mid = Math.ceil(all.length / 2);
    return { front: all.slice(0, mid), side: all.slice(mid).concat(young) };
  }, [layout]);
  const grasses = useMemo(() => {
    const r0 = layout.flatR + 1;
    const r1 = layout.flatR + 24;
    const all = scatterPlants(layout, 160, r0, r1, 0.72, 663 / 1004, 0.7, 1.55, 0x6A55);
    const tufts = scatterPlants(layout, 48, r0 + 2, r1 - 2, 0.48, 663 / 1004, 0.85, 1.35, 0xA31C);
    const mid = Math.ceil(all.length / 2);
    return { front: all.slice(0, mid).concat(tufts.slice(0, 24)), side: all.slice(mid).concat(tufts.slice(24)) };
  }, [layout]);
  return (
    <group>
      <BillboardPatch url={asset('models/tree-billboard-front.png?v=env1')} plants={trees.front} wind={0.22} freq={0.85} segs={6} />
      <BillboardPatch url={asset('models/tree-billboard-side.png?v=env1')} plants={trees.side} wind={0.22} freq={0.85} segs={6} />
      <BillboardPatch url={asset('models/grass-billboard-front.png?v=env1')} plants={grasses.front} wind={0.55} freq={1.65} segs={6} />
      <BillboardPatch url={asset('models/grass-billboard-side.png?v=env1')} plants={grasses.side} wind={0.55} freq={1.65} segs={6} />
    </group>
  );
}

/* ================= 远景营帐 ================= */
function Tents() {
  const gltf = useGLTF(protoUrl('tent'));
  const bounds = useSim((s) => s.netlist.bounds);
  const layout = useMemo(() => fieldLayout(bounds), [bounds]);
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const { geom, mat } = useMemo(() => {
    const mesh = firstMesh(gltf.scene);
    const geom = mesh.geometry.clone();
    geom.applyMatrix4(mesh.matrixWorld);
    bakeFit(geom, 'height', PROTO.tent.heightM);
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    if (mat.map) {
      mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.map.flipY = false;
    }
    if (mat.metalness >= 0.99 && !mat.metalnessMap) mat.metalness = 0.05;
    if (mat.roughness >= 0.99 && !mat.roughnessMap) mat.roughness = 0.88;
    return { geom, mat };
  }, [gltf.scene]);
  useLayoutEffect(() => {
    const inst = meshRef.current;
    if (!inst) return;
    const dummy = new THREE.Object3D();
    TENT_SPOTS.forEach(([x, z, s], i) => {
      dummy.position.set(x, terrainHeight(x, z, layout), z);
      dummy.rotation.set(0, Math.atan2(layout.cx - x, layout.cz - z), 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.count = TENT_SPOTS.length;
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
  }, [layout]);
  return (
    <instancedMesh ref={meshRef} args={[geom, mat, TENT_SPOTS.length]} castShadow={false} receiveShadow />
  );
}

/* ================= 火把 ×12 ================= */
const TORCH_POS: [number, number][] = [
  [-24, 22], [-8, 22], [8, 22], [24, 22],
  [-24, -22], [-8, -22], [8, -22], [24, -22],
  [30, -10], [30, 10], [-30, -10], [-30, 10],
];

/* 白昼：火把那些仅保留灯杆与熄灭铜盆（合并为单次绘制），不再有点光源/火焰 */
function Torches() {
  const geom = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const [x, z] of TORCH_POS) {
      parts.push(new THREE.CylinderGeometry(0.04, 0.055, 2.2, 6).translate(x, 1.1, z));
      parts.push(new THREE.CylinderGeometry(0.10, 0.05, 0.16, 6).translate(x, 2.26, z)); // 铜火盆
    }
    return mergeGeometries(parts)!;
  }, []);
  return (
    <mesh geometry={geom} castShadow>
      <meshStandardMaterial color="#4A3826" roughness={0.9} metalness={0.15} />
    </mesh>
  );
}

/* ================= 鼓台（SE）+ 战鼓 + 鼓手 ================= */
function DrumTower() {
  const towerGltf = useGLTF(protoUrl('drumTower'));
  const drumGltf = useGLTF(protoUrl('drum'));
  const armRef = useRef<THREE.Group>(null!);
  const drumRef = useRef<THREE.Group>(null!);
  const pulseAt = useRef(-10);
  const drumPulse = useSim((s) => s.drumPulse);
  useEffect(() => { if (drumPulse > 0) pulseAt.current = now(); }, [drumPulse]);

  const tower = useMemo(() => {
    const cloned = towerGltf.scene.clone(true);
    prepareProtoMaterials(cloned);
    placeOnGround(cloned, PROTO.drumTower.heightM);
    return cloned;
  }, [towerGltf.scene]);
  const deckY = useMemo(
    () => findDeckY(tower, PROTO.drumTower.deckFrac),
    [tower],
  );

  const drum = useMemo(() => {
    const cloned = drumGltf.scene.clone(true);
    prepareProtoMaterials(cloned);
    placeOnGround(cloned, PROTO.drum.heightM);
    return cloned;
  }, [drumGltf.scene]);

  useFrame(() => {
    const dt = now() - pulseAt.current;
    if (armRef.current) {
      const p = Math.min(dt / 0.18, 1);
      armRef.current.rotation.x = -1.0 + Math.sin(p * Math.PI) * 1.25;
    }
    if (drumRef.current) {
      const p = Math.min(dt / 0.22, 1);
      const s = 1 + Math.sin(p * Math.PI) * 0.06;
      drumRef.current.scale.set(s, s, s);
    }
  });

  const standY = deckY + 0.02;
  return (
    <group position={[25, 0, 16]}>
      <primitive object={tower} />
      <group ref={drumRef} position={[0, standY, 0]}>
        {/* 源档鼓膜法线沿 Z；鼓手在 +X 面朝 −X，绕 Y 转 90° 让鼓膜对人。 */}
        <group rotation={[0, Math.PI / 2, 0]}>
          <primitive object={drum} />
        </group>
      </group>
      {/* 鼓手站甲板 +X 侧，面朝战鼓（local +Z → 世界 -X），避开台阶与鼓身。 */}
      <group position={[1.55, standY, 0.28]} rotation={[0, -Math.PI / 2, 0]}>
        <QinSoldier />
        <group ref={armRef} position={[0.18, 1.05, 0.22]}>
          <mesh position={[0, 0.28, 0.12]} rotation={[0.5, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.6, 5]} />
            <meshStandardMaterial color="#33302B" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.52, 0.3]} rotation={[0.5, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.5, 4]} />
            <meshStandardMaterial color="#4A3726" roughness={0.9} />
          </mesh>
        </group>
      </group>
      <DrumSideFlag standY={standY} />
    </group>
  );
}

/** 鼓手侧独立旗杆（木杆+旗面），不插进鼓身，旗 DoubleSide 可翻面。 */
function DrumSideFlag({ standY }: { standY: number }) {
  const tex = useMemo(() => makeFlagTexture(true), []);
  useLayoutEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={[2.15, standY, 1.2]}>
      <mesh position={[0, 1.31, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.016, 2.62, 6]} />
        <meshStandardMaterial color="#4A3726" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.62, 0]} castShadow>
        <sphereGeometry args={[0.03, 6, 5]} />
        <meshStandardMaterial color="#8A6B3A" metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0.275, 2.26, 0]} castShadow>
        <planeGeometry args={[0.55, 0.38, 6, 2]} />
        <meshStandardMaterial map={tex} side={THREE.DoubleSide} roughness={0.82} metalness={0} />
      </mesh>
    </group>
  );
}

/* ================= 监军台（NE） ================= */
function CommandTower() {
  const gltf = useGLTF(protoUrl('cmd'));
  const tower = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    prepareProtoMaterials(cloned);
    placeOnGround(cloned, PROTO.cmd.heightM);
    return cloned;
  }, [gltf.scene]);
  const deckY = useMemo(
    () => findDeckY(tower, PROTO.cmd.deckFrac),
    [tower],
  );

  const standY = deckY + 0.02;
  const lamp = useMemo(() => new THREE.Object3D(), []);
  return (
    <group position={[25, 0, -17]} rotation={[0, -Math.PI / 2, 0]}>
      <primitive object={tower} />
      <primitive object={lamp} position={[0, standY + 0.95, 0.45]} />
      <spotLight
        position={[0, standY + 2.2, 0.7]}
        target={lamp}
        angle={0.72}
        penumbra={0.48}
        intensity={3.2}
        color="#FFE6C4"
        distance={7.5}
        decay={1.7}
        castShadow={false}
      />
      <pointLight
        position={[0, standY + 1.9, 0.35]}
        color="#FFD9A8"
        intensity={1.35}
        distance={5.8}
        decay={2}
      />
      <group position={[0.92, standY, 0.32]}>
        <Emperor />
      </group>
      <group position={[-0.92, standY, 0.32]}>
        <VonNeumann />
      </group>
    </group>
  );
}

/* ================= 飞鸟盘旋 ================= */
const BIRD_COUNT = 7;

function birdPose(t: number, i: number, cx: number, cz: number) {
  const slow = reducedMotion ? 0.06 : 1;
  const layer = i % 3;
  const y0 = 16.5 + layer * 4.2;
  if (i % 3 === 2) {
    const r = 26 + (i % 2) * 10;
    const a = t * 0.22 * slow + i * 1.1;
    const x = cx + Math.sin(a) * r;
    const z = cz + Math.sin(a) * Math.cos(a) * r * 0.62;
    const vx = Math.cos(a) * 0.22 * slow * r;
    const vz = (Math.cos(2 * a)) * 0.22 * slow * r * 0.62;
    return { x, y: y0 + Math.sin(a * 2 + i) * 0.7, z, yaw: Math.atan2(vx, vz) };
  }
  const r = 24 + layer * 9 + (i % 2) * 3;
  const dir = i % 2 === 0 ? 1 : -1;
  const a = dir * t * (0.18 + layer * 0.03) * slow + i * 0.85;
  const x = cx + Math.cos(a) * r;
  const z = cz + Math.sin(a) * r;
  const vx = -Math.sin(a) * dir * r;
  const vz = Math.cos(a) * dir * r;
  return { x, y: y0 + Math.sin(a * 3 + i) * 0.55, z, yaw: Math.atan2(vx, vz) };
}

function Birds() {
  const gltf = useGLTF(protoUrl('bird'));
  const bounds = useSim((s) => s.netlist.bounds);
  const cx = Number.isFinite(bounds.minX) ? (bounds.minX + bounds.maxX) / 2 : 0;
  const cz = Number.isFinite(bounds.minZ) ? (bounds.minZ + bounds.maxZ) / 2 : 0;
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { geom, mat } = useMemo(() => {
    const mesh = firstMesh(gltf.scene);
    const geom = mesh.geometry.clone();
    geom.applyMatrix4(mesh.matrixWorld);
    bakeFit(geom, 'spanX', PROTO.bird.wingspanM);
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    if (mat.map) {
      mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.map.flipY = false;
    }
    if (mat.metalness >= 0.99 && !mat.metalnessMap) mat.metalness = 0.04;
    if (mat.roughness >= 0.99 && !mat.roughnessMap) mat.roughness = 0.72;
    mat.side = THREE.DoubleSide;
    return { geom, mat };
  }, [gltf.scene]);

  useFrame(({ clock }) => {
    const inst = meshRef.current;
    if (!inst) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < BIRD_COUNT; i++) {
      const p = birdPose(t, i, cx, cz);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geom, mat, BIRD_COUNT]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}

/* ================= 灯光 ================= */
function Lights() {
  const bounds = useSim((s) => s.netlist.bounds);
  const lightRef = useRef<THREE.DirectionalLight>(null!);
  const cx = Number.isFinite(bounds.minX) ? (bounds.minX + bounds.maxX) / 2 : 0;
  const cz = Number.isFinite(bounds.minZ) ? (bounds.minZ + bounds.maxZ) / 2 : 0;
  const hx = Math.max(48, (bounds.maxX - bounds.minX) / 2 + 18);
  const hz = Math.max(48, (bounds.maxZ - bounds.minZ) / 2 + 18);
  const far = Math.max(200, Math.hypot(hx, hz) * 2.2 + 60);
  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.target.position.set(cx, 0, cz);
    light.target.updateMatrixWorld();
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.bias = -0.0004;
    const cam = light.shadow.camera;
    cam.left = -hx;
    cam.right = hx;
    cam.top = hz;
    cam.bottom = -hz;
    cam.far = far;
    cam.updateProjectionMatrix();
  }, [cx, cz, hx, hz, far]);
  return (
    <group>
      <directionalLight
        ref={lightRef}
        position={[cx - 58, 52, cz - 24]}
        color="#FFF2DC"
        intensity={2.6}
        castShadow
      />
      <hemisphereLight color="#BFD6EA" groundColor="#C9B189" intensity={0.85} />
    </group>
  );
}

export default function Environment() {
  return (
    <group>
      <SkyDome />
      <Lights />
      <Ground />
      <Vegetation />
      <ZoneSigns />
      <Tents />
      <Torches />
      <DrumTower />
      <CommandTower />
      <Birds />
    </group>
  );
}

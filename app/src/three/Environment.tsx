/** 环境：天空穹顶、夯土地面与地格、区域木牌、远景营帐、鼓台、监军台、火把（白昼场景） */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useSim } from '@/sim/store';
import { makeSignTexture } from './textures';

const now = () => performance.now() / 1000;

/* ================= 天空穹顶：贴图 + 三段渐变 fallback ================= */
function SkyDome() {
  const matRef = useRef<THREE.ShaderMaterial>(null!);
  const tex = useLoader(THREE.TextureLoader, '/sky-day.jpg');
  const uniforms = useMemo(() => ({
    tSky: { value: tex },
  }), [tex]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- three.js 纹理属性需就地设置
    tex.colorSpace = THREE.SRGBColorSpace;
  }, [tex]);
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[400, 32, 16]} />
      <shaderMaterial
        ref={matRef}
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vDir;
          void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`}
        fragmentShader={`
          uniform sampler2D tSky;
          varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir);
            float u = fract(atan(d.z, -d.x)/6.2831853 + 0.5);
            float v = 0.5 + asin(clamp(d.y,-1.0,1.0))/3.14159265;
            vec3 tex = texture2D(tSky, vec2(u, v)).rgb;
            // 白昼三段渐变 fallback（暖白地平线 → 淡蓝白 → 柔和天蓝）
            float e = clamp(d.y*1.6+0.5, 0.0, 1.0);
            vec3 hor = vec3(0.941,0.914,0.839), mid = vec3(0.780,0.839,0.894), top = vec3(0.604,0.706,0.831);
            vec3 grad = mix(hor, mid, smoothstep(0.0,0.55,e));
            grad = mix(grad, top, smoothstep(0.45,1.0,e));
            // 晨光暖晕：与方向光同方位（-58,42,-24 归一化）
            float sunAmt = exp(-pow(length(d - normalize(vec3(-0.768,0.556,-0.318)))*3.2, 2.0));
            grad += vec3(1.0,0.91,0.75)*sunAmt*0.35;
            gl_FragColor = vec4(mix(grad, tex, 0.85), 1.0);
          }`}
      />
    </mesh>
  );
}

/* ================= 地面 + 地格 + 区块金线 ================= */
function Ground() {
  const tex = useLoader(THREE.TextureLoader, '/ground-rammed-earth.jpg');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- three.js 纹理属性需就地设置
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 6);
    tex.colorSpace = THREE.SRGBColorSpace;
  }, [tex]);

  const grid = useMemo(() => {
    const pts: number[] = [];
    for (let x = -26; x <= 27; x++) pts.push(x, 0.015, -19, x, 0.015, 21);
    for (let z = -19; z <= 21; z++) pts.push(-26, 0.015, z, 27, 0.015, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);

  const zoneLines = useMemo(() => {
    const rects: [number, number, number, number][] = [
      [-21, -10.5, 15.5, 20],   // 输入 A/B
      [-25, -23, 5, 16],        // 输入 C
      [-17, -3.5, 1.5, 14.5],   // 加法陣
      [-3, 11, 5, 14],          // 部分積陣
      [-3, 22, -13.5, 5],       // 累加陣
      [1, 23, -18, -16],        // 輸出區
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[64, 48]} />
        <meshStandardMaterial map={tex} roughness={1} metalness={0} color="#EFE6D2" />
      </mesh>
      {/* 操场外圈沙地延伸至晨霭中 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color="#B3A183" roughness={1} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#6E5C3E" transparent opacity={0.28} />
      </lineSegments>
      <lineSegments geometry={zoneLines}>
        <lineBasicMaterial color="#C09A3E" transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}

/* ================= 区域木牌 ================= */
const SIGNS: { text: string; pos: [number, number]; rotY: number }[] = [
  { text: '輸入區', pos: [-22.6, 18], rotY: Math.PI / 2 },
  { text: '加法陣', pos: [-17.6, 8], rotY: Math.PI / 2 },
  { text: '乘法陣', pos: [-3.2, 9.5], rotY: Math.PI / 2 },
  { text: '輸出區', pos: [0.4, -17], rotY: Math.PI / 2 },
];

function ZoneSigns() {
  const textures = useMemo(() => SIGNS.map((s) => makeSignTexture(s.text)), []);
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
            <meshStandardMaterial map={textures[i]} roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ================= 远景营帐剪影 ================= */
function Tents() {
  const geom = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const spots: [number, number, number][] = [[-42, -28, 1], [46, -24, 1.2], [-46, 12, 0.9], [48, 26, 1.1], [-38, -34, 1.4]];
    for (const [x, z, s] of spots) {
      parts.push(new THREE.ConeGeometry(2.2 * s, 2.8 * s, 7).translate(x, 1.4 * s, z));
      parts.push(new THREE.CylinderGeometry(0.03, 0.03, 2.2 * s, 4).translate(x, 2.8 * s + 1.1 * s, z));
    }
    return mergeGeometries(parts)!;
  }, []);
  return (
    <mesh geometry={geom}>
      {/* 白昼远景：暖灰帐影，随雾淡出 */}
      <meshBasicMaterial color="#6E6252" />
    </mesh>
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

/* ================= 鼓台（SE）+ 鼓手 ================= */
function DrumTower() {
  const armRef = useRef<THREE.Group>(null!);
  const drumRef = useRef<THREE.Mesh>(null!);
  const pulseAt = useRef(-10);
  const drumPulse = useSim((s) => s.drumPulse);
  useEffect(() => { if (drumPulse > 0) pulseAt.current = now(); }, [drumPulse]);

  useFrame(() => {
    const dt = now() - pulseAt.current;
    // 鼓手：击鼓帧 180ms 后回举槌
    if (armRef.current) {
      const p = Math.min(dt / 0.18, 1);
      armRef.current.rotation.x = -1.0 + Math.sin(p * Math.PI) * 1.25;
    }
    // 鼓身 scale 1→1.06→1，220ms
    if (drumRef.current) {
      const p = Math.min(dt / 0.22, 1);
      const s = 1 + Math.sin(p * Math.PI) * 0.06;
      drumRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group position={[25, 0, 16]}>
      {/* 夯土台 3m + 朝南台阶 */}
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 3, 6]} />
        <meshStandardMaterial color="#8A6C48" roughness={1} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.25 + i * 0.5, 3.6 - i * 0.55]} castShadow>
          <boxGeometry args={[2.2, 0.5, 1.1]} />
          <meshStandardMaterial color="#9C7C52" roughness={1} />
        </mesh>
      ))}
      {/* 四角立柱 + 灯笼 */}
      {[[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]].map(([x, z], i) => (
        <group key={i} position={[x, 3, z]}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.07, 1.8, 6]} />
            <meshStandardMaterial color="#54402A" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.85, 0]}>
            <sphereGeometry args={[0.16, 8, 6]} />
            {/* 白昼灯笼不发光，仅朱红漆面 */}
            <meshStandardMaterial color="#B0382A" emissive="#FF8C42" emissiveIntensity={0.12} />
          </mesh>
        </group>
      ))}
      {/* 大战鼓：朱红鼓身 + 黄铜钉 */}
      <group position={[0, 3.95, -0.6]}>
        <mesh ref={drumRef} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.8, 0.8, 0.7, 20]} />
          <meshStandardMaterial color="#A32E22" roughness={0.6} metalness={0.1} />
        </mesh>
        {[-0.36, 0.36].map((x, i) => (
          <mesh key={i} position={[x, 0, 0]} rotation={[0, (i * Math.PI) / 2 + Math.PI / 2, 0]}>
            <circleGeometry args={[0.72, 20]} />
            <meshStandardMaterial color="#E8DCC3" roughness={0.85} />
          </mesh>
        ))}
        <mesh position={[0, -0.55, 0]}>
          <boxGeometry args={[0.9, 0.35, 0.9]} />
          <meshStandardMaterial color="#54402A" roughness={0.9} />
        </mesh>
      </group>
      {/* 鼓手 */}
      <group position={[1.5, 3, -0.6]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.26, 1.1, 7]} />
          <meshStandardMaterial color="#33302B" roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.3, 0]} castShadow>
          <sphereGeometry args={[0.15, 8, 6]} />
          <meshStandardMaterial color="#B98A62" roughness={0.8} />
        </mesh>
        <group ref={armRef} position={[0, 1.05, 0.1]}>
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
    </group>
  );
}

/* ================= 监军台（NE） ================= */
function CommandTower() {
  return (
    <group position={[25, 0, -17]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 4, 6]} />
        <meshStandardMaterial color="#7A5E3E" roughness={1} />
      </mesh>
      {/* 华盖四柱 + 攒尖顶 */}
      {[[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]].map(([x, z], i) => (
        <mesh key={i} position={[x, 5.1, z]} castShadow>
          <cylinderGeometry args={[0.08, 0.09, 2.2, 6]} />
          <meshStandardMaterial color="#4A3826" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 6.8, 0]} castShadow>
        <coneGeometry args={[4.2, 1.6, 4]} />
        <meshStandardMaterial color="#54402A" roughness={0.9} />
      </mesh>
      {/* 凭几 */}
      <mesh position={[0, 4.35, 1.2]}>
        <boxGeometry args={[1.6, 0.5, 0.5]} />
        <meshStandardMaterial color="#54402A" roughness={0.9} />
      </mesh>
      {/* 主将 */}
      <group position={[0, 4, 0.4]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.34, 1.2, 7]} />
          <meshStandardMaterial color="#33302B" roughness={1} />
        </mesh>
        <mesh position={[0, 1.42, 0]} castShadow>
          <sphereGeometry args={[0.16, 8, 6]} />
          <meshStandardMaterial color="#B98A62" roughness={0.85} />
        </mesh>
      </group>
    </group>
  );
}

/* ================= 灯光 ================= */
function Lights() {
  return (
    <group>
      {/* 白昼：暖阳主光（暖白晨光）+ 强天光/地面反弹补光 */}
      <directionalLight
        position={[-58, 42, -24]}
        color="#FFF2DC"
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-far={180}
        shadow-bias={-0.0004}
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
      <ZoneSigns />
      <Tents />
      <Torches />
      <DrumTower />
      <CommandTower />
    </group>
  );
}

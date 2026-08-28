/**
 * 士兵方阵：实例下标 = gates[i]，人与旗同坐标。
 * 小阵全模；大阵全体素（含输入/输出），不再拆两套人导致旗和人对不齐。
 * 全员都实例化，不减人数；视锥体不按原点包围盒裁掉远处人海。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useSim } from '@/sim/store';
import { makeFlagTexture } from './textures';
import { waitAppFonts } from '@/lib/fonts';
import type { Gate } from '@/sim/netlist';
import { QIN_SOLDIER, extractFirstMeshGeometry, qinSoldierUrl } from './qinAsset';
import { configureQinAlbedo, firstMeshMap } from './qinHuman';

const now = () => performance.now() / 1000;

function placeGate(gate: Gate, i: number, columnC: boolean) {
  const [x, z] = gate.pos;
  let rotY = Math.PI;
  if (columnC && gate.zone === 'C') rotY = Math.PI / 2;
  if (gate.zone === 'DONE') rotY = -Math.PI / 2;
  rotY += (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.06;
  const s = 0.97 + ((Math.sin(i * 78.233) * 12543.7 % 1 + 1) % 1) * 0.06;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
  return m;
}

function makeInstAttrs(count: number) {
  return {
    aVal: new THREE.InstancedBufferAttribute(new Float32Array(count), 1),
    aPrev: new THREE.InstancedBufferAttribute(new Float32Array(count), 1),
    aFlip: new THREE.InstancedBufferAttribute(new Float32Array(count).fill(-100), 1),
    aLift: new THREE.InstancedBufferAttribute(new Float32Array(count).fill(-100), 1),
    aLiftPole: new THREE.InstancedBufferAttribute(new Float32Array(count).fill(-100), 1),
  };
}

/** 预分配实例，换军令只改 count，避免拆网格时把共享几何/材质一起丢掉。 */
const MAX_SOLDIERS = 22000;
const FLAG_HINGE_X = 0.42;

function writeGroup(meshes: (THREE.InstancedMesh | null)[], gates: Gate[], columnC: boolean) {
  const live = meshes.filter((m): m is THREE.InstancedMesh => m != null);
  if (!live.length || !gates.length) return false;
  gates.forEach((gate, i) => {
    const m = placeGate(gate, gate.index, columnC);
    for (const mesh of live) mesh.setMatrixAt(i, m);
  });
  for (const mesh of live) {
    mesh.count = gates.length;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  return true;
}

function colored(geom: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geom.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geom;
}

type FlagTexRef = { current: THREE.Texture | null };

/** 通用着色器注入：待机摆动（全员）+ 翻旗/举杆（旗帜、旗杆） */
function injectSoldierShader(
  mat: THREE.MeshStandardMaterial,
  opts: { isFlag?: boolean; isPole?: boolean; map2?: FlagTexRef },
) {
  mat.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uFlipDur = { value: 0.32 };
    if (opts.isFlag) shader.uniforms.map2 = { value: opts.map2?.current ?? null };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aFlip; attribute float aVal; attribute float aPrev; attribute float aLift;
        uniform float uTime; uniform float uFlipDur;
        varying float vFlagMix;
        float backOut(float t){ float cc=1.4; float u=t-1.0; return 1.0+(cc+1.0)*u*u*u+cc*u*u; }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${opts.isFlag ? `{
          float progN = clamp((uTime - aFlip)/uFlipDur, 0.0, 1.0);
          float angN = backOut(progN)*3.14159265;
          float cn = cos(angN), sn = sin(angN);
          objectNormal = vec3(objectNormal.x*cn + objectNormal.z*sn, objectNormal.y, -objectNormal.x*sn + objectNormal.z*cn);
        }` : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float phase = 0.0;
        #ifdef USE_INSTANCING
          phase = instanceMatrix[3][0]*1.7 + instanceMatrix[3][2]*2.3;
        #endif
        ${opts.isFlag ? `{
          float prog = clamp((uTime - aFlip)/uFlipDur, 0.0, 1.0);
          float ang = backOut(prog)*3.14159265;
          float lx = transformed.x - ${FLAG_HINGE_X.toFixed(2)};
          transformed.x = ${FLAG_HINGE_X.toFixed(2)} + lx*cos(ang);
          transformed.z = lx*sin(ang);
          float liftF = 0.08*sin(3.14159*clamp((uTime-aLift)/0.2, 0.0, 1.0));
          transformed.y += liftF;
          transformed.z += sin(uTime*1.6 + phase + lx*6.0)*0.03*smoothstep(0.02, 0.25, lx);
          vFlagMix = mix(aPrev, aVal, step(0.5, prog));
        }` : `{
          float sw = 0.026*sin(uTime*0.8 + phase);
          float cs = cos(sw), ss = sin(sw);
          transformed.xz = mat2(cs, -ss, ss, cs)*transformed.xz;
          ${opts.isPole ? 'transformed.y += 0.08*sin(3.14159*clamp((uTime-aLift)/0.2, 0.0, 1.0));' : ''}
        }`}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vFlagMix;
        ${opts.isFlag ? 'uniform sampler2D map2;' : ''}`)
      .replace('#include <map_fragment>', opts.isFlag ? `
        #ifdef USE_MAP
          vec4 tR = texture2D(map, vMapUv);
          vec4 tB = texture2D(map2, vMapUv);
          vec4 sampledDiffuseColor = mix(tB, tR, vFlagMix);
          diffuseColor *= sampledDiffuseColor;
        #endif` : '#include <map_fragment>');
    mat.userData.shader = shader;
  };
}

export default function Soldiers() {
  const netlist = useSim((s) => s.netlist);
  const commitNonce = useSim((s) => s.commitNonce);
  const resetNonce = useSim((s) => s.resetNonce);
  const n = netlist.gates.length;
  const voxel = n > 4000;
  const army = netlist.gates;
  const columnC = netlist.expr !== 'CPU';

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const flagRef = useRef<THREE.InstancedMesh>(null);

  const armyGltf = useGLTF(qinSoldierUrl('army'));
  const albedo = useMemo(() => firstMeshMap(armyGltf.scene), [armyGltf.scene]);
  useLayoutEffect(() => {
    if (albedo) configureQinAlbedo(albedo);
  }, [albedo]);
  const armyGeom = useMemo(
    () => extractFirstMeshGeometry(armyGltf.scene, QIN_SOLDIER.faceY),
    [armyGltf],
  );

  /* ---------- 几何：秦卒身体来自用户原型减模；旗杆/旗面仍是独立实例 ----------
   * 体素卒给大阵俯视用。旗面本地空间与原先全模一致，保证翻面着色器不改。 */
  const geoms = useMemo(() => {
    const SKIN = '#C89B72', ARMOR = '#33302B', BRONZE = '#8A6B3A';
    const HAIR = '#1B1512', BOOT = '#29241F';

    const pole = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.016, 0.016, 1.9, 6).translate(0.42, 1.65, 0), '#4A3726'),
      colored(new THREE.SphereGeometry(0.03, 6, 5).translate(0.42, 2.62, 0), BRONZE),
    ])!;
    const flag = new THREE.PlaneGeometry(0.55, 0.38, 6, 2).translate(0.42 + 0.275, 2.26, 0);
    /* 大阵体素卒：俯视要成块，不能靠一根细杆。全员同一套实例，人旗同位。 */
    const bodyLod = mergeGeometries([
      colored(new THREE.BoxGeometry(0.58, 0.04, 0.50).translate(0, 0.02, 0.02), '#5A4630'),
      colored(new THREE.BoxGeometry(0.20, 0.18, 0.26).translate(-0.12, 0.12, 0.05), BOOT),
      colored(new THREE.BoxGeometry(0.20, 0.18, 0.26).translate(0.12, 0.12, 0.05), BOOT),
      colored(new THREE.BoxGeometry(0.38, 0.52, 0.26).translate(0, 0.48, 0), ARMOR),
      colored(new THREE.BoxGeometry(0.46, 0.58, 0.30).translate(0, 0.98, 0), ARMOR),
      colored(new THREE.BoxGeometry(0.32, 0.10, 0.32).translate(0, 1.28, 0), BRONZE),
      colored(new THREE.BoxGeometry(0.24, 0.24, 0.24).translate(0, 1.42, 0.04), SKIN),
      colored(new THREE.BoxGeometry(0.26, 0.12, 0.26).translate(0, 1.56, 0), HAIR),
    ])!;
    bodyLod.clearGroups();
    const poleLod = colored(new THREE.BoxGeometry(0.06, 1.85, 0.06).translate(0.42, 1.58, 0), '#4A3726');
    const flagLod = new THREE.BoxGeometry(0.50, 0.38, 0.10).translate(0.42 + 0.25, 2.18, 0);
    return { pole, flag, flagLod, bodyLod, poleLod };
  }, []);

  const attrs = useMemo(() => makeInstAttrs(MAX_SOLDIERS), []);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const flagG = voxel ? geoms.flagLod : geoms.flag;
    const poleG = voxel ? geoms.poleLod : geoms.pole;
    flagG.setAttribute('aVal', attrs.aVal);
    flagG.setAttribute('aPrev', attrs.aPrev);
    flagG.setAttribute('aFlip', attrs.aFlip);
    flagG.setAttribute('aLift', attrs.aLift);
    poleG.setAttribute('aLift', attrs.aLiftPole);
  }, [geoms, attrs, voxel]);

  const placeAll = () => {
    const meshes = [bodyRef.current, poleRef.current, flagRef.current];
    placed.current = writeGroup(meshes, army, columnC);
  };

  useLayoutEffect(() => {
    placed.current = false;
    placeAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netlist, voxel, columnC]);

  /* ---------- 材质（只建一次；字体就绪后就地换旗面，避免拆 InstancedMesh） ---------- */
  const flagTexBlueRef = useRef<THREE.Texture | null>(null);
  const mats = useMemo(() => {
    const red = makeFlagTexture(true);
    const blue = makeFlagTexture(false);
    flagTexBlueRef.current = blue;
    const body = new THREE.MeshStandardMaterial({
      map: albedo ?? undefined,
      color: '#ffffff',
      roughness: 0.62,
      metalness: 0.08,
      vertexColors: false,
    });
    injectSoldierShader(body, {});
    const std = (extra?: { isPole?: boolean }) => {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1 });
      injectSoldierShader(mat, { isPole: extra?.isPole });
      return mat;
    };
    const flagMat = new THREE.MeshStandardMaterial({
      map: red, side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
      emissive: new THREE.Color('#201408'), emissiveIntensity: 0.35,
    });
    injectSoldierShader(flagMat, { isFlag: true, map2: flagTexBlueRef });
    const voxelMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.88, metalness: 0.04,
      emissive: new THREE.Color('#2a2218'), emissiveIntensity: 0.22,
    });
    return { body, pole: std({ isPole: true }), flag: flagMat, voxel: voxelMat };
  }, [albedo]);

  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => { waitAppFonts().then(() => setFontsReady(true)); }, []);
  useEffect(() => {
    if (!fontsReady) return;
    const red = makeFlagTexture(true);
    const blue = makeFlagTexture(false);
    const prevMap = mats.flag.map;
    const prevBlue = flagTexBlueRef.current;
    flagTexBlueRef.current = blue;
    mats.flag.map = red;
    mats.flag.needsUpdate = true;
    const shader = mats.flag.userData.shader as THREE.WebGLProgramParametersWithUniforms | undefined;
    if (shader?.uniforms.map2) shader.uniforms.map2.value = blue;
    if (prevMap && prevMap !== red) prevMap.dispose();
    if (prevBlue && prevBlue !== blue) prevBlue.dispose();
  }, [fontsReady, mats]);

  /* ---------- 着色器时钟 ---------- */
  useFrame(() => {
    if (!placed.current) placeAll();
    const t = now();
    const flipFast = useSim.getState().flipFast;
    for (const mat of [mats.body, mats.pole, mats.flag]) {
      const s = mat.userData.shader as THREE.WebGLProgramParametersWithUniforms | undefined;
      if (!s) continue;
      s.uniforms.uTime.value = t;
      s.uniforms.uFlipDur.value = flipFast ? 0.12 : 0.32;
    }
  });

  /* ---------- 值提交 → 触发翻旗 ---------- */
  useEffect(() => {
    const st = useSim.getState();
    if (!st.changed.length) return;
    const t = now();
    const fast = st.flipFast;
    let outSeq = 0;
    for (const idx of st.changed) {
      const gate = st.netlist.gates[idx];
      const v = st.values[idx];
      if (attrs.aVal.array[idx] === v) continue;
      const delay = gate.type === 'OUTPUT' ? outSeq++ * 0.06 : (fast ? 0 : Math.random() * 0.06);
      attrs.aPrev.array[idx] = attrs.aVal.array[idx];
      attrs.aVal.array[idx] = v;
      attrs.aFlip.array[idx] = t + delay;
      attrs.aLift.array[idx] = t + delay;
      attrs.aLiftPole.array[idx] = t + delay;
    }
    for (const x of [attrs.aVal, attrs.aPrev, attrs.aFlip, attrs.aLift, attrs.aLiftPole]) x.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitNonce]);

  useEffect(() => {
    if (resetNonce === 0) return;
    const t = now();
    army.forEach((gate, i) => {
      if (attrs.aVal.array[i] === 0) { attrs.aPrev.array[i] = 0; return; }
      const [x, z] = gate.pos;
      const dist = Math.hypot(x + 32, z + 24);
      attrs.aPrev.array[i] = attrs.aVal.array[i];
      attrs.aVal.array[i] = 0;
      attrs.aFlip.array[i] = t + dist * 0.008;
      attrs.aLift.array[i] = t + dist * 0.008;
      attrs.aLiftPole.array[i] = t + dist * 0.008;
    });
    for (const a of [attrs.aVal, attrs.aPrev, attrs.aFlip, attrs.aLift, attrs.aLiftPole]) a.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce]);

  const hover = useSim((s) => s.hover);
  const select = useSim((s) => s.select);

  return (
    <group>
      {voxel ? (
        <>
          <instancedMesh
            ref={bodyRef} args={[geoms.bodyLod, mats.voxel, MAX_SOLDIERS]}
            frustumCulled={false}
            dispose={null}
            onPointerMove={(e) => { e.stopPropagation(); hover(army[e.instanceId!].id); }}
            onPointerDown={(e) => { e.stopPropagation(); select(army[e.instanceId!].id); }}
            onPointerOut={() => hover(null)}
          />
          <instancedMesh ref={poleRef} args={[geoms.poleLod, mats.pole, MAX_SOLDIERS]} frustumCulled={false} dispose={null} />
          <instancedMesh ref={flagRef} args={[geoms.flagLod, mats.flag, MAX_SOLDIERS]} frustumCulled={false} dispose={null} />
        </>
      ) : (
        <>
          <instancedMesh
            ref={bodyRef} args={[armyGeom, mats.body, MAX_SOLDIERS]} castShadow receiveShadow
            frustumCulled={false}
            dispose={null}
            onPointerMove={(e) => { e.stopPropagation(); hover(army[e.instanceId!].id); }}
            onPointerDown={(e) => { e.stopPropagation(); select(army[e.instanceId!].id); }}
            onPointerOut={() => hover(null)}
          />
          <instancedMesh ref={poleRef} args={[geoms.pole, mats.pole, MAX_SOLDIERS]} frustumCulled={false} dispose={null} />
          <instancedMesh ref={flagRef} args={[geoms.flag, mats.flag, MAX_SOLDIERS]} frustumCulled={false} dispose={null} />
        </>
      )}
    </group>
  );
}

useGLTF.preload(qinSoldierUrl('army'));

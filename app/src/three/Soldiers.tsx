/**
 * 士兵方阵：4 个 InstancedMesh（躯干 / 头 / 臂+旗杆 / 旗帜），
 * 翻旗动画（320ms back.out）与待机摆动全部在着色器内完成，CPU 仅写实例属性。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useSim } from '@/sim/store';
import { makeFlagTexture } from './textures';
import { waitAppFonts } from '@/lib/fonts';

const now = () => performance.now() / 1000;

function colored(geom: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geom.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geom;
}

function limb(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.CylinderGeometry {
  const d = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, d, 5);
  g.translate(0, d / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
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
          float lx = transformed.x - 0.22;
          transformed.x = 0.22 + lx*cos(ang);
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

  const bodyRef = useRef<THREE.InstancedMesh>(null!);
  const headRef = useRef<THREE.InstancedMesh>(null!);
  const poleRef = useRef<THREE.InstancedMesh>(null!);
  const flagRef = useRef<THREE.InstancedMesh>(null!);

  /* ---------- 几何：拟人秦卒 ----------
   * 比例：总高 ~1.76m，头高 ~0.24m（约 1/7.5）。
   * 本地空间面朝 +Z；右臂（pole 组）持杆举旗，左臂垂放身侧。
   * body = 腿/靴/甲裳/躯干甲/腰带/披膊/左臂；head = 颈/面/发/抹额/发髻/簪；pole = 旗杆+右臂。 */
  const geoms = useMemo(() => {
    const SKIN = '#C89B72', ARMOR = '#33302B', ARMOR2 = '#3E3830', BRONZE = '#8A6B3A';
    const HAIR = '#1B1512', BAND = '#7A2E26', BOOT = '#29241F', CLOTH = '#2E2A25';

    const body = mergeGeometries([
      // 双腿（立正微开）
      colored(limb(new THREE.Vector3(0.10, 0.95, 0), new THREE.Vector3(0.11, 0.14, 0.01), 0.068), CLOTH),
      colored(limb(new THREE.Vector3(-0.10, 0.95, 0), new THREE.Vector3(-0.11, 0.14, 0.01), 0.068), CLOTH),
      // 短靴 + 鞋头（朝 +Z）
      colored(new THREE.CylinderGeometry(0.075, 0.09, 0.14, 7).translate(0.11, 0.07, 0.01), BOOT),
      colored(new THREE.CylinderGeometry(0.075, 0.09, 0.14, 7).translate(-0.11, 0.07, 0.01), BOOT),
      colored(new THREE.BoxGeometry(0.13, 0.08, 0.23).translate(0.11, 0.04, 0.06), BOOT),
      colored(new THREE.BoxGeometry(0.13, 0.08, 0.23).translate(-0.11, 0.04, 0.06), BOOT),
      // 甲裳（下裙，椭圆截面）+ 青铜缘边
      colored(new THREE.CylinderGeometry(0.19, 0.26, 0.36, 9).scale(1, 1, 0.85).translate(0, 0.80, 0), ARMOR),
      colored(new THREE.CylinderGeometry(0.265, 0.275, 0.06, 9).scale(1, 1, 0.85).translate(0, 0.65, 0), BRONZE),
      // 躯干甲（胸宽背厚，椭圆截面）
      colored(new THREE.CylinderGeometry(0.20, 0.16, 0.55, 9).scale(1, 1, 0.72).translate(0, 1.155, 0), ARMOR),
      // 胸前甲片 + 腰带
      colored(new THREE.BoxGeometry(0.30, 0.36, 0.05).translate(0, 1.20, 0.115), ARMOR2),
      colored(new THREE.CylinderGeometry(0.185, 0.19, 0.07, 9).scale(1, 1, 0.78).translate(0, 0.90, 0), BRONZE),
      // 披膊（双肩甲）
      colored(new THREE.SphereGeometry(0.105, 8, 6).scale(1, 0.62, 1).translate(0.215, 1.42, 0), ARMOR2),
      colored(new THREE.SphereGeometry(0.105, 8, 6).scale(1, 0.62, 1).translate(-0.215, 1.42, 0), ARMOR2),
      // 左臂垂放身侧（上臂/前臂/手）
      colored(limb(new THREE.Vector3(-0.20, 1.40, 0), new THREE.Vector3(-0.25, 1.13, 0.02), 0.052), ARMOR),
      colored(limb(new THREE.Vector3(-0.25, 1.13, 0.02), new THREE.Vector3(-0.26, 0.90, 0.05), 0.045), ARMOR),
      colored(new THREE.SphereGeometry(0.05, 6, 5).translate(-0.26, 0.88, 0.05), SKIN),
    ])!;
    const head = mergeGeometries([
      // 颈
      colored(new THREE.CylinderGeometry(0.048, 0.055, 0.10, 7).translate(0, 1.455, 0), SKIN),
      // 面部（略长椭圆）
      colored(new THREE.SphereGeometry(0.115, 10, 8).scale(0.94, 1.06, 0.98).translate(0, 1.575, 0), SKIN),
      // 头发（罩住头顶与后脑）
      colored(new THREE.SphereGeometry(0.118, 10, 6, 0, Math.PI * 2, 0, 1.85).scale(0.96, 1.04, 1).translate(0, 1.578, -0.014), HAIR),
      // 朱红抹额
      colored(new THREE.CylinderGeometry(0.118, 0.118, 0.032, 10, 1, true).translate(0, 1.585, 0), BAND),
      // 发髻 + 铜簪
      colored(new THREE.SphereGeometry(0.042, 7, 6).translate(0, 1.715, -0.025), HAIR),
      colored(new THREE.CylinderGeometry(0.007, 0.007, 0.13, 5).rotateZ(Math.PI / 2).translate(0, 1.715, -0.025), BRONZE),
    ])!;
    const pole = mergeGeometries([
      colored(new THREE.CylinderGeometry(0.016, 0.016, 1.9, 6).translate(0.22, 1.65, 0), '#4A3726'),
      colored(new THREE.SphereGeometry(0.03, 6, 5).translate(0.22, 2.62, 0), BRONZE), // 杆首铜饰
      // 右臂：肩→肘→握杆手
      colored(limb(new THREE.Vector3(0.20, 1.40, 0), new THREE.Vector3(0.27, 1.16, 0.04), 0.052), ARMOR),
      colored(limb(new THREE.Vector3(0.27, 1.16, 0.04), new THREE.Vector3(0.225, 1.34, 0.01), 0.044), ARMOR),
      colored(new THREE.SphereGeometry(0.05, 6, 5).translate(0.224, 1.36, 0.01), SKIN),
    ])!;
    const flag = new THREE.PlaneGeometry(0.55, 0.38, 6, 2).translate(0.22 + 0.275, 2.26, 0);
    return { body, head, pole, flag };
  }, []);

  /* ---------- 实例属性（旗帜/旗杆翻转动画状态） ---------- */
  const attrs = useMemo(() => ({
    aVal: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
    aPrev: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
    aFlip: new THREE.InstancedBufferAttribute(new Float32Array(n).fill(-100), 1),
    aLift: new THREE.InstancedBufferAttribute(new Float32Array(n).fill(-100), 1),
    aLiftPole: new THREE.InstancedBufferAttribute(new Float32Array(n).fill(-100), 1),
  }), [n]);

  useLayoutEffect(() => {
    geoms.flag.setAttribute('aVal', attrs.aVal);
    geoms.flag.setAttribute('aPrev', attrs.aPrev);
    geoms.flag.setAttribute('aFlip', attrs.aFlip);
    geoms.flag.setAttribute('aLift', attrs.aLift);
    geoms.pole.setAttribute('aLift', attrs.aLiftPole);
  }, [geoms, attrs]);

  /* ---------- 实例矩阵：站位 + 朝向 ---------- */
  useLayoutEffect(() => {
    const meshes = [bodyRef.current, headRef.current, poleRef.current, flagRef.current].filter(
      (mesh): mesh is THREE.InstancedMesh => mesh != null,
    );
    if (meshes.length < 4) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const sc = new THREE.Vector3();
    netlist.gates.forEach((gate, i) => {
      const [x, z] = gate.pos;
      // 朝向：全员面北（-Z）；C 列与 DONE 面场内
      let rotY = Math.PI;
      if (gate.zone === 'C') rotY = Math.PI / 2;
      if (gate.zone === 'DONE') rotY = -Math.PI / 2;
      rotY += (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.06;
      q.setFromAxisAngle(up, rotY);
      const s = 0.97 + ((Math.sin(i * 78.233) * 12543.7 % 1 + 1) % 1) * 0.06;
      sc.set(s, s, s);
      m.compose(new THREE.Vector3(x, 0, z), q, sc);
      for (const mesh of meshes) mesh.setMatrixAt(i, m);
    });
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  }, [netlist]);

  /* ---------- 材质（只建一次；字体就绪后就地换旗面，避免拆 InstancedMesh） ---------- */
  const flagTexBlueRef = useRef<THREE.Texture | null>(null);
  const mats = useMemo(() => {
    const red = makeFlagTexture(true);
    const blue = makeFlagTexture(false);
    flagTexBlueRef.current = blue;
    const std = (extra?: { isPole?: boolean }) => {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1 });
      injectSoldierShader(mat, { isPole: extra?.isPole });
      return mat;
    };
    const flagMat = new THREE.MeshStandardMaterial({
      map: red, side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
      emissive: new THREE.Color('#201408'), emissiveIntensity: 0.2,
    });
    injectSoldierShader(flagMat, { isFlag: true, map2: flagTexBlueRef });
    return { body: std(), head: std(), pole: std({ isPole: true }), flag: flagMat };
  }, []);

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
    const t = now();
    const flipFast = useSim.getState().flipFast;
    for (const mat of [mats.body, mats.head, mats.pole, mats.flag]) {
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
      attrs.aPrev.array[idx] = attrs.aVal.array[idx];
      attrs.aVal.array[idx] = v;
      // 输出手集体亮相：自西向东 60ms stagger；同层其余 0–60ms 随机错拍
      const delay = gate.type === 'OUTPUT' ? outSeq++ * 0.06 : Math.random() * 0.06;
      attrs.aFlip.array[idx] = t + (fast ? 0 : delay);
      attrs.aLift.array[idx] = t + (fast ? 0 : delay);
      attrs.aLiftPole.array[idx] = t + (fast ? 0 : delay);
    }
    for (const a of [attrs.aVal, attrs.aPrev, attrs.aFlip, attrs.aLift, attrs.aLiftPole]) a.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitNonce]);

  /* ---------- 复位：自西北角向东南 8ms/m stagger 翻蓝 ---------- */
  useEffect(() => {
    if (resetNonce === 0) return;
    const st = useSim.getState();
    const t = now();
    st.netlist.gates.forEach((gate, i) => {
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

  /* ---------- 拾取 ---------- */
  const hover = useSim((s) => s.hover);
  const select = useSim((s) => s.select);

  return (
    <group>
      <instancedMesh
        ref={bodyRef} args={[geoms.body, mats.body, n]} castShadow receiveShadow
        onPointerMove={(e) => { e.stopPropagation(); hover(netlist.gates[e.instanceId!].id); }}
        onPointerDown={(e) => { e.stopPropagation(); select(netlist.gates[e.instanceId!].id); }}
        onPointerOut={() => hover(null)}
      />
      <instancedMesh ref={headRef} args={[geoms.head, mats.head, n]} castShadow />
      <instancedMesh ref={poleRef} args={[geoms.pole, mats.pole, n]} />
      <instancedMesh ref={flagRef} args={[geoms.flag, mats.flag, n]} castShadow />
    </group>
  );
}

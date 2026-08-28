import { asset } from '@/lib/utils';
import * as THREE from 'three';

/** 监军台上的冯·诺依曼静模。几何运行时扶成身高 1.78m、脚底贴地、面朝 +Z。有贴图则用自带材质，否则灰陶。 */
export const VON_NEUMANN = {
  url: 'models/vonneumann-proto.glb?v=vn5',
  heightM: 1.78,
  tris: 10_000,
  bytes: 601_640,
  license: '自建',
  credit: 'vonneumann-proto.glb',
  sourceUrl: '/models/vonneumann-proto.glb',
  color: '#A89F94',
} as const;

export function vonNeumannUrl(): string {
  return asset(VON_NEUMANN.url);
}

/** 把任意静模根节点扶成约定身高，脚在 y=0，XZ 居中。 */
export function fitHeroToHeight(root: THREE.Object3D, heightM: number): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.computeVertexNormals();
  });
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (size.y < 1e-4) throw new Error('网格高度为 0');
  const s = heightM / size.y;
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root);
  root.position.x += -(fitted.min.x + fitted.max.x) * 0.5;
  root.position.y += -fitted.min.y;
  root.position.z += -(fitted.min.z + fitted.max.z) * 0.5;
  root.updateMatrixWorld(true);
}

/**
 * 只修冯诺依曼。源档 Y 是身高轴，但头在 −Y、脚在 +Y。
 * rotateZ(π) 把头翻到 +Y；再 rotateY(π) 让脸朝 +Z。不改秦卒/始皇。
 */
export function prepareVonNeumann(root: THREE.Object3D): boolean {
  let mapped = false;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const copies = src.map((m) => {
      const std = (m as THREE.MeshStandardMaterial).clone();
      if (std.map) {
        mapped = true;
        const tex = std.map.clone();
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.needsUpdate = true;
        std.map = tex;
      }
      std.metalness = 0.06;
      std.roughness = 0.76;
      std.side = THREE.DoubleSide;
      return std;
    });
    mesh.material = copies.length === 1 ? copies[0] : copies;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return mapped;
}

/** 先倒立正立，再缩到 1.78m、脚 y=0、XZ 居中。 */
export function fitVonNeumann(root: THREE.Object3D): void {
  root.rotation.z += Math.PI;
  root.rotation.y += Math.PI;
  root.updateMatrixWorld(true);
  fitHeroToHeight(root, VON_NEUMANN.heightM);
}

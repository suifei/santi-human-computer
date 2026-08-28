import { asset } from '@/lib/utils';
import * as THREE from 'three';

/** 监军台上的冯·诺依曼静模。几何运行时扶成身高 1.78m、脚底贴地、面朝 +Z。源文件无 UV/贴图。 */
export const VON_NEUMANN = {
  url: 'models/vonneumann-proto.glb?v=user1',
  heightM: 1.78,
  tris: 10_000,
  bytes: 180_920,
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

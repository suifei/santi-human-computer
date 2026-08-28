import { asset } from '@/lib/utils';
import * as THREE from 'three';

/** 点验 / 人海共用的秦卒静模参数。几何已烘成身高 1.76m、脚底贴地、面朝 +Z。 */
export const QIN_SOLDIER = {
  showcaseUrl: 'models/qin-soldier.glb?v=user1',
  armyUrl: 'models/qin-soldier-army.glb?v=user1',
  heightM: 1.76,
  clay: '#C17A4A',
  plaster: '#C9C2B6',
  showcaseTris: 40000,
  armyTris: 6800,
  showcaseBytes: 4_713_272,
  armyBytes: 3_925_284,
  faceY: 0,
  license: '自建',
  credit: 'qin-proto.glb',
  sourceName: 'qin-proto.glb',
  sourceUrl: '/models/qin-proto.glb',
} as const;

export function qinSoldierUrl(kind: 'showcase' | 'army'): string {
  return asset(kind === 'army' ? QIN_SOLDIER.armyUrl : QIN_SOLDIER.showcaseUrl);
}

export function extractFirstMeshGeometry(root: THREE.Object3D, faceY = 0): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  let geom: THREE.BufferGeometry | null = null;
  root.traverse((obj) => {
    if (geom) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    geom = mesh.geometry.clone();
    geom.applyMatrix4(mesh.matrixWorld);
    if (faceY) geom.rotateY(faceY);
  });
  if (!geom) throw new Error('秦卒网格缺失');
  return geom;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

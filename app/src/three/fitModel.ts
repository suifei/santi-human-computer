import * as THREE from 'three';
import { configureQinAlbedo } from './qinHuman';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

/** 克隆材质、接 glTF 反照率；无金属度贴图时去掉 Meshy 默认金属 1。 */
export function prepareProtoMaterials(root: THREE.Object3D, opts?: { castShadow?: boolean }): void {
  const cast = opts?.castShadow !== false;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const copies = src.map((m) => {
      const std = (m as THREE.MeshStandardMaterial).clone();
      if (std.map) configureQinAlbedo(std.map);
      if (std.metalness >= 0.99 && !std.metalnessMap) std.metalness = 0.05;
      if (std.roughness >= 0.99 && !std.roughnessMap) std.roughness = 0.82;
      std.side = THREE.FrontSide;
      return std;
    });
    mesh.material = copies.length === 1 ? copies[0] : copies;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
  });
}

/** 均匀缩到目标身高，脚 y=0，XZ 居中。不克隆几何。 */
export function placeOnGround(root: THREE.Object3D, heightM: number): THREE.Box3 {
  return fitRoot(root, { height: heightM });
}

export function fitRoot(
  root: THREE.Object3D,
  spec: { height?: number; width?: number; depth?: number; maxXZ?: number },
): THREE.Box3 {
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  if (_size.y < 1e-4) throw new Error('网格高度为 0');
  let dim = _size.y;
  let target = spec.height;
  if (spec.width != null) { dim = _size.x; target = spec.width; }
  else if (spec.depth != null) { dim = _size.z; target = spec.depth; }
  else if (spec.maxXZ != null) { dim = Math.max(_size.x, _size.z); target = spec.maxXZ; }
  if (target == null || dim < 1e-4) throw new Error('无法缩放网格');
  root.scale.multiplyScalar(target / dim);
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  root.position.x += -(_box.min.x + _box.max.x) * 0.5;
  root.position.y += -_box.min.y;
  root.position.z += -(_box.min.z + _box.max.z) * 0.5;
  root.updateMatrixWorld(true);
  return _box.setFromObject(root);
}

/** 把已 bake 到物体空间的几何缩到目标尺寸，底面 y=0、XZ 居中。 */
export function bakeFit(
  geom: THREE.BufferGeometry,
  kind: 'height' | 'width' | 'depth' | 'maxXZ' | 'spanX',
  meters: number,
): void {
  geom.computeBoundingBox();
  const b = geom.boundingBox!;
  const sx = b.max.x - b.min.x;
  const sy = b.max.y - b.min.y;
  const sz = b.max.z - b.min.z;
  const dim = kind === 'height' ? sy : kind === 'width' || kind === 'spanX' ? sx : kind === 'depth' ? sz : Math.max(sx, sz);
  if (dim < 1e-4) throw new Error('网格尺寸为 0');
  const s = meters / dim;
  geom.translate(-(b.min.x + b.max.x) * 0.5, -b.min.y, -(b.min.z + b.max.z) * 0.5);
  geom.scale(s, s, s);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
}

export function firstMesh(root: THREE.Object3D): THREE.Mesh {
  root.updateMatrixWorld(true);
  let found: THREE.Mesh | null = null;
  root.traverse((obj) => {
    if (found) return;
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) found = mesh;
  });
  if (!found) throw new Error('网格缺失');
  return found;
}

/**
 * 甲板顶面：朝上法线最密的一层，排除屋顶/灯笼（上 34%）和地面。
 * 监军台屋顶约在 70%，甲板约在 30%；鼓台甲板约在 63%。
 */
export function findDeckY(root: THREE.Object3D, fallbackFrac = 0.3): number {
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  const h = _box.max.y - _box.min.y;
  if (h < 1e-4) return _box.min.y;
  const bins = new Map<number, number>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    const nor = mesh.geometry.attributes.normal;
    if (!pos) return;
    for (let i = 0; i < pos.count; i += 4) {
      if (nor) {
        _n.fromBufferAttribute(nor, i).transformDirection(mesh.matrixWorld);
        if (_n.y < 0.72) continue;
      }
      _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const frac = (_v.y - _box.min.y) / h;
      if (frac < 0.15 || frac > 0.66) continue;
      const key = Math.round(_v.y * 20) / 20;
      bins.set(key, (bins.get(key) || 0) + 1);
    }
  });
  let bestY = _box.min.y + h * fallbackFrac;
  let bestC = 0;
  for (const [y, c] of bins) {
    if (c > bestC) {
      bestC = c;
      bestY = y;
    }
  }
  return bestY;
}

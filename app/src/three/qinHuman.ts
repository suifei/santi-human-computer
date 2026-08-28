import * as THREE from 'three';

/** glTF 贴图约定：V 轴不翻转。 */
export function configureQinAlbedo(tex: THREE.Texture) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
}

export function firstMeshMap(root: THREE.Object3D): THREE.Texture | null {
  let tex: THREE.Texture | null = null;
  root.traverse((obj) => {
    if (tex) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map) {
        tex = map;
        return;
      }
    }
  });
  return tex;
}

import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { QIN_SOLDIER, qinSoldierUrl } from './qinAsset';
import { configureQinAlbedo } from './qinHuman';

type QinSoldierProps = {
  wireframe?: boolean;
  /** false 时退回陶土/素灰，用来对照扫描原貌。 */
  human?: boolean;
  clay?: boolean;
};

function eachMaterial(mesh: THREE.Mesh, fn: (mat: THREE.MeshStandardMaterial) => void) {
  const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of src) fn(m as THREE.MeshStandardMaterial);
}

/** 点验用：展示级静模，单份，不实例化。贴图用 GLB 自带材质。 */
export default function QinSoldier({
  wireframe = false,
  human = true,
  clay = false,
}: QinSoldierProps) {
  const gltf = useGLTF(qinSoldierUrl('showcase'));

  const root = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const copies = src.map((m) => {
        const std = (m as THREE.MeshStandardMaterial).clone();
        std.vertexColors = false;
        std.side = THREE.FrontSide;
        if (std.map) configureQinAlbedo(std.map);
        std.userData.origMap = std.map;
        std.userData.origColor = std.color.clone();
        std.userData.origRough = std.roughness;
        std.userData.origMetal = std.metalness;
        std.needsUpdate = true;
        return std;
      });
      mesh.material = copies.length === 1 ? copies[0] : copies;
    });
    return cloned;
  }, [gltf.scene]);

  useLayoutEffect(() => {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      eachMaterial(mesh, (std) => {
        std.wireframe = wireframe;
        if (!human) {
          std.map = null;
          std.color.set(clay ? QIN_SOLDIER.clay : QIN_SOLDIER.plaster);
          std.roughness = clay ? 0.78 : 0.88;
          std.metalness = clay ? 0.06 : 0.02;
        } else {
          std.map = (std.userData.origMap as THREE.Texture | null) ?? std.map;
          if (std.userData.origColor) std.color.copy(std.userData.origColor);
          else std.color.set('#ffffff');
          if (typeof std.userData.origRough === 'number') std.roughness = std.userData.origRough;
          if (typeof std.userData.origMetal === 'number') std.metalness = std.userData.origMetal;
        }
        std.needsUpdate = true;
      });
    });
  }, [root, wireframe, human, clay]);

  return <primitive object={root} rotation={[0, QIN_SOLDIER.faceY, 0]} />;
}

useGLTF.preload(qinSoldierUrl('showcase'));

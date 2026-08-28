import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { EMPEROR, emperorUrl } from './emperorAsset';
import { placeOnGround, prepareProtoMaterials } from './fitModel';

type EmperorProps = {
  wireframe?: boolean;
};

/** 点验 / 监军台共用：用户 emperor-proto.glb，自带贴图。 */
export default function Emperor({ wireframe = false }: EmperorProps) {
  const gltf = useGLTF(emperorUrl());

  const root = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    prepareProtoMaterials(cloned);
    placeOnGround(cloned, EMPEROR.heightM);
    return cloned;
  }, [gltf.scene]);

  useLayoutEffect(() => {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) (m as THREE.MeshStandardMaterial).wireframe = wireframe;
    });
  }, [root, wireframe]);

  return <primitive object={root} />;
}

useGLTF.preload(emperorUrl());

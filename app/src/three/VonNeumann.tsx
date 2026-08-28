import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { VON_NEUMANN, fitHeroToHeight, vonNeumannUrl } from './vonNeumannAsset';

type VonNeumannProps = {
  wireframe?: boolean;
};

/** 点验 / 监军台共用：用户 vonneumann-proto.glb，无贴图，灰陶着色。 */
export default function VonNeumann({ wireframe = false }: VonNeumannProps) {
  const gltf = useGLTF(vonNeumannUrl());

  const root = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    fitHeroToHeight(cloned, VON_NEUMANN.heightM);
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = new THREE.MeshStandardMaterial({
        color: VON_NEUMANN.color,
        roughness: 0.78,
        metalness: 0.04,
        side: THREE.DoubleSide,
      });
      mesh.material = mat;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return cloned;
  }, [gltf.scene]);

  useLayoutEffect(() => {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.wireframe = wireframe;
    });
  }, [root, wireframe]);

  return <primitive object={root} />;
}

useGLTF.preload(vonNeumannUrl());

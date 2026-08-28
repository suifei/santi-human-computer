import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { VON_NEUMANN, fitVonNeumann, prepareVonNeumann, vonNeumannUrl } from './vonNeumannAsset';

type VonNeumannProps = {
  wireframe?: boolean;
};

/** 点验 / 监军台共用。扶正只发生在这一具上，不改秦卒/始皇。 */
export default function VonNeumann({ wireframe = false }: VonNeumannProps) {
  const gltf = useGLTF(vonNeumannUrl());

  const root = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    const mapped = prepareVonNeumann(cloned);
    fitVonNeumann(cloned);
    if (!mapped) {
      cloned.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = new THREE.MeshStandardMaterial({
          color: VON_NEUMANN.color,
          roughness: 0.78,
          metalness: 0.04,
          side: THREE.DoubleSide,
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
    }
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

useGLTF.preload(vonNeumannUrl());

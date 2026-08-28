import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blob } from 'node:buffer';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.self = globalThis;
if (!globalThis.URL.createObjectURL) {
  const blobs = new Map();
  let n = 0;
  globalThis.URL.createObjectURL = (blob) => {
    const id = `blob:node-${++n}`;
    blobs.set(id, blob);
    return id;
  };
  globalThis.URL.revokeObjectURL = (id) => blobs.delete(id);
}
if (!globalThis.Blob) globalThis.Blob = Blob;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'public/models/qin-proto.glb');
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const gltf = await new Promise((res, rej) => {
  new GLTFLoader().parse(ab, '', res, rej);
});

const scene = gltf.scene;
scene.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(scene);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
console.log('file', path, buf.length);
console.log('bbox min', box.min.toArray().map((n) => +n.toFixed(4)));
console.log('bbox max', box.max.toArray().map((n) => +n.toFixed(4)));
console.log('size', size.toArray().map((n) => +n.toFixed(4)));
console.log('center', center.toArray().map((n) => +n.toFixed(4)));
console.log('animations', gltf.animations?.map((a) => a.name) ?? []);

let i = 0;
scene.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry;
  const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  const mb = new THREE.Box3().setFromObject(o);
  const ms = mb.getSize(new THREE.Vector3());
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  const matInfo = mats.map((m) => ({
    type: m.type,
    name: m.name,
    color: m.color?.getHexString?.(),
    map: m.map
      ? {
          name: m.map.name,
          w: m.map.image?.width,
          h: m.map.image?.height,
          flipY: m.map.flipY,
        }
      : null,
    roughness: m.roughness,
    metalness: m.metalness,
  }));
  console.log({
    i: i++,
    name: o.name,
    parent: o.parent?.name,
    tris: tris | 0,
    size: ms.toArray().map((n) => +n.toFixed(4)),
    pos: o.position.toArray(),
    rot: o.rotation.toArray().slice(0, 3).map((n) => +n.toFixed(4)),
    scale: o.scale.toArray(),
    attrs: Object.keys(g.attributes),
    indexed: !!g.index,
    morph: g.morphAttributes ? Object.keys(g.morphAttributes) : [],
    mats: matInfo,
  });
});

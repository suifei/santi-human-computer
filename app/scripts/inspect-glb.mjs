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
const path = resolve(root, process.argv[2] ?? 'public/models/vonneumann-proto.glb');
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

let i = 0;
scene.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry;
  const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  const pos = g.attributes.position;
  let minY = Infinity, maxY = -Infinity;
  let armMinX = Infinity, armMaxX = -Infinity;
  const yCut = box.min.y + size.y * 0.55;
  const zCut = center.z;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    if (y > minY) {}
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (y > yCut) {
      if (x < armMinX) armMinX = x;
      if (x > armMaxX) armMaxX = x;
    }
  }
  console.log({
    i: i++,
    name: o.name,
    tris: tris | 0,
    attrs: Object.keys(g.attributes),
    indexed: !!g.index,
    mat: o.material?.type,
    yRange: [minY, maxY].map((n) => +n.toFixed(4)),
    upperX: [armMinX, armMaxX].map((n) => +n.toFixed(4)),
    zCut: +zCut.toFixed(4),
  });
});

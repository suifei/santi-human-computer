/**
 * 从当前已立正的展示模减面 + UV unwrap。不改朝向。
 * 展示级目标约 8k，列阵约 3k；贴图由 bake-qin-albedo.py 另做。
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blob } from 'node:buffer';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { countTris } from './qin-orient.mjs';

class NodeFileReader {
  result = null;
  onload = null;
  onloadend = null;
  onerror = null;
  readAsArrayBuffer(blob) {
    Promise.resolve(blob.arrayBuffer()).then((ab) => {
      this.result = ab;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }).catch((err) => this.onerror?.(err));
  }
}
globalThis.FileReader = NodeFileReader;
globalThis.Blob = Blob;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const tmpDir = resolve(root, 'public/models/_tmp');
const showcaseSrc = resolve(root, 'public/models/qin-soldier.glb');
const showcaseOut = resolve(root, 'public/models/qin-soldier.glb');
const armyOut = resolve(root, 'public/models/qin-soldier-army.glb');
const dumpJson = resolve(tmpDir, 'paint-mesh.json');
const dumpPos = resolve(tmpDir, 'paint-pos.bin');
const dumpNrm = resolve(tmpDir, 'paint-nrm.bin');
const dumpUv = resolve(tmpDir, 'paint-uv.bin');
const dumpIdx = resolve(tmpDir, 'paint-idx.bin');

function runCli(args) {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const r = spawnSync(
    npxCmd,
    ['--yes', '--package=@gltf-transform/cli', 'gltf-transform', ...args],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (r.status !== 0) throw new Error(`gltf-transform ${args[0]} failed`);
}

function parseGlb(path) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  return new Promise((resolveP, reject) => {
    loader.parse(ab, '', resolveP, reject);
  });
}

function firstMesh(scene) {
  scene.updateMatrixWorld(true);
  let mesh = null;
  scene.traverse((o) => {
    if (mesh || !o.isMesh) return;
    mesh = o;
  });
  if (!mesh) throw new Error('no mesh');
  return mesh;
}

function dumpForBake(glbPath) {
  return parseGlb(glbPath).then((gltf) => {
    const mesh = firstMesh(gltf.scene);
    const geom = mesh.geometry.index ? mesh.geometry : mesh.geometry.toNonIndexed();
    geom.computeVertexNormals();
    const pos = geom.attributes.position;
    const nrm = geom.attributes.normal;
    const uv = geom.attributes.uv;
    if (!uv) throw new Error('unwrap produced no UVs');
    const n = pos.count;
    const posArr = new Float32Array(n * 3);
    const nrmArr = new Float32Array(n * 3);
    const uvArr = new Float32Array(n * 2);
    const p = new THREE.Vector3();
    const nr = new THREE.Vector3();
    mesh.updateWorldMatrix(true, false);
    const mw = mesh.matrixWorld;
    const nmat = new THREE.Matrix3().getNormalMatrix(mw);
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mw);
      nr.fromBufferAttribute(nrm, i).applyMatrix3(nmat).normalize();
      posArr[i * 3] = p.x;
      posArr[i * 3 + 1] = p.y;
      posArr[i * 3 + 2] = p.z;
      nrmArr[i * 3] = nr.x;
      nrmArr[i * 3 + 1] = nr.y;
      nrmArr[i * 3 + 2] = nr.z;
      uvArr[i * 2] = uv.getX(i);
      uvArr[i * 2 + 1] = uv.getY(i);
    }
    let idxArr;
    if (geom.index) {
      idxArr = Uint32Array.from(geom.index.array);
    } else {
      idxArr = new Uint32Array(n);
      for (let i = 0; i < n; i++) idxArr[i] = i;
    }
    const box = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(posArr, 3));
    const size = box.getSize(new THREE.Vector3());
    writeFileSync(dumpPos, Buffer.from(posArr.buffer));
    writeFileSync(dumpNrm, Buffer.from(nrmArr.buffer));
    writeFileSync(dumpUv, Buffer.from(uvArr.buffer));
    writeFileSync(dumpIdx, Buffer.from(idxArr.buffer));
    const meta = {
      verts: n,
      indices: idxArr.length,
      tris: idxArr.length / 3,
      bbox: { min: box.min.toArray(), max: box.max.toArray(), size: size.toArray() },
      pos: 'paint-pos.bin',
      nrm: 'paint-nrm.bin',
      uv: 'paint-uv.bin',
      idx: 'paint-idx.bin',
    };
    writeFileSync(dumpJson, JSON.stringify(meta, null, 2));
    console.log('dumped', meta);
    return meta;
  });
}

mkdirSync(tmpDir, { recursive: true });
const posedHi = resolve(tmpDir, 'posed-hi.glb');
const welded = resolve(tmpDir, 'posed-weld.glb');
const showLod = resolve(tmpDir, 'show-lod.glb');
const showUv = resolve(tmpDir, 'show-uv.glb');

copyFileSync(showcaseSrc, posedHi);
console.log('weld (keep pose)');
runCli(['weld', posedHi, welded]);
console.log('simplify showcase ~10% verts, error 2% radius');
runCli(['simplify', welded, showLod, '--ratio', '0.10', '--error', '0.02']);
console.log('unwrap xatlas');
runCli(['unwrap', showLod, showUv]);
copyFileSync(showUv, showcaseOut);

console.log('simplify army from unwrapped');
runCli(['simplify', showUv, armyOut, '--ratio', '0.38', '--error', '0.035']);

const show = await parseGlb(showcaseOut);
const army = await parseGlb(armyOut);
let showTris = 0;
let armyTris = 0;
show.scene.traverse((o) => { if (o.isMesh) showTris += countTris(o.geometry); });
army.scene.traverse((o) => { if (o.isMesh) armyTris += countTris(o.geometry); });
console.log(`showcase tris=${showTris | 0} army tris=${armyTris | 0}`);

await dumpForBake(showcaseOut);
console.log('lod-unwrap done');

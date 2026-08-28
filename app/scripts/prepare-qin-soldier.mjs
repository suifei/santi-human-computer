/**
 * 从扫描 GLB 做出可上线的秦卒：立正、缩到 1.76m、陶土材质、减面。
 * 依赖：本仓库 three；减面走 npx @gltf-transform/cli。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blob } from 'node:buffer';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TARGET_HEIGHT, countTris, orientQin } from './qin-orient.mjs';

/** GLTFExporter 在 Node 里会用 FileReader 把 Blob 转成 ArrayBuffer。 */
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
const srcPath = resolve(root, 'public/models/_source-qin.glb');
const tmpDir = resolve(root, 'public/models/_tmp');
const showcasePath = resolve(root, 'public/models/qin-soldier.glb');
const armyPath = resolve(root, 'public/models/qin-soldier-army.glb');
const metaPath = resolve(root, 'public/models/qin-soldier.json');

const CLAY = '#C17A4A';

function parseGlb(path) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  return new Promise((resolveP, reject) => {
    loader.parse(ab, '', resolveP, reject);
  });
}

function meshStats(mesh) {
  const geom = mesh.geometry;
  const tris = geom.index ? geom.index.count / 3 : geom.attributes.position.count / 3;
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return { name: mesh.name || mesh.parent?.name || '(unnamed)', tris, size, center, box };
}

function collectMeshes(scene) {
  const meshes = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  for (const mesh of meshes) {
    const s = meshStats(mesh);
    console.log(
      `  mesh ${s.name} tris=${s.tris | 0} size=${s.size.x.toFixed(1)},${s.size.y.toFixed(1)},${s.size.z.toFixed(1)}`,
    );
  }
  return meshes;
}

function mergeWorld(meshes) {
  const geoms = [];
  for (const mesh of meshes) {
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    geoms.push(g);
  }
  const merged = mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();
  return merged;
}

function standAndFit(geometry) {
  return orientQin(geometry, { fromSource: true, clipY: 0.045 });
}

function exportMesh(geometry, outPath) {
  const mat = new THREE.MeshStandardMaterial({
    color: CLAY,
    roughness: 0.78,
    metalness: 0.06,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = 'QinSoldier';
  const scene = new THREE.Scene();
  scene.add(mesh);
  const exporter = new GLTFExporter();
  return new Promise((resolveP, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error('expected binary glb'));
          return;
        }
        writeFileSync(outPath, Buffer.from(result));
        console.log(`  wrote ${outPath} (${(result.byteLength / 1024).toFixed(0)} KB)`);
        resolveP(result.byteLength);
      },
      reject,
      { binary: true },
    );
  });
}

function runCli(args) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(
    npmCmd,
    ['exec', '--yes', '--package=@gltf-transform/cli', '--', 'gltf-transform', ...args],
    { cwd: root, stdio: 'inherit' },
  );
  if (r.status !== 0) throw new Error(`gltf-transform ${args[0]} failed`);
}

const gltf = await parseGlb(srcPath);
console.log('source parsed');
const meshes = collectMeshes(gltf.scene);
let geometry = mergeWorld(meshes);
console.log(`merged tris=${countTris(geometry) | 0}`);
geometry = standAndFit(geometry);

mkdirSync(tmpDir, { recursive: true });
const fittedPath = resolve(tmpDir, 'fitted.glb');
await exportMesh(geometry, fittedPath);

console.log('weld + simplify showcase (~80k) and army (~8k)');
const weldedPath = resolve(tmpDir, 'welded.glb');
runCli(['weld', fittedPath, weldedPath]);
runCli(['simplify', weldedPath, showcasePath, '--ratio', '0.07', '--error', '0.02']);
runCli(['simplify', weldedPath, armyPath, '--ratio', '0.008', '--error', '0.05']);
runCli(['center', showcasePath, showcasePath, '--pivot', 'below']);
runCli(['center', armyPath, armyPath, '--pivot', 'below']);

const show = await parseGlb(showcasePath);
const army = await parseGlb(armyPath);
let showTris = 0;
let armyTris = 0;
show.scene.traverse((o) => { if (o.isMesh) showTris += countTris(o.geometry); });
army.scene.traverse((o) => { if (o.isMesh) armyTris += countTris(o.geometry); });

const meta = {
  slug: 'qin-soldier',
  title: '秦卒静模',
  heightM: TARGET_HEIGHT,
  clay: CLAY,
  showcase: {
    path: 'models/qin-soldier.glb',
    triangles: Math.round(showTris),
    bytes: readFileSync(showcasePath).byteLength,
  },
  army: {
    path: 'models/qin-soldier-army.glb',
    triangles: Math.round(armyTris),
    bytes: readFileSync(armyPath).byteLength,
  },
  license: 'CC BY 4.0',
  credit: 'Lily.Qin1',
  source: 'https://doi.org/10.5281/zenodo.10292768',
  note: 'Scan simplified and reoriented for the human-array computer. No albedo texture; clay PBR assigned here.',
};
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(meta);

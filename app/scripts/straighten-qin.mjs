/**
 * 把已上线的秦卒 GLB 扶正（头-脚 → +Y，腹前 → +Z），再导出展示级 + 列阵减模。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blob } from 'node:buffer';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  TARGET_HEIGHT,
  countTris,
  orientQin,
  paintHumanWeights,
} from './qin-orient.mjs';

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
const srcPath = resolve(root, 'public/models/_tmp/show-welded.glb');
const showcasePath = resolve(root, 'public/models/qin-soldier.glb');
const armyPath = resolve(root, 'public/models/qin-soldier-army.glb');
const metaPath = resolve(root, 'public/models/qin-soldier.json');
const tmpDir = resolve(root, 'public/models/_tmp');

function parseGlb(path) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  return new Promise((resolveP, reject) => {
    loader.parse(ab, '', resolveP, reject);
  });
}

function firstGeometry(scene) {
  scene.updateMatrixWorld(true);
  let geom = null;
  scene.traverse((o) => {
    if (geom || !o.isMesh) return;
    geom = o.geometry.clone();
    geom.applyMatrix4(o.matrixWorld);
  });
  if (!geom) throw new Error('no mesh in glb');
  return geom;
}

function exportMesh(geometry, outPath) {
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.08,
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
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const r = spawnSync(
    npxCmd,
    ['--yes', '--package=@gltf-transform/cli', 'gltf-transform', ...args],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (r.status !== 0) throw new Error(`gltf-transform ${args[0]} failed`);
}

console.log('load', srcPath);
const gltf = await parseGlb(srcPath);
let geometry = firstGeometry(gltf.scene);
console.log(`input tris=${countTris(geometry) | 0}`);
geometry = orientQin(geometry, { fromSource: false, clipY: 0.07 });

mkdirSync(tmpDir, { recursive: true });
await exportMesh(geometry, showcasePath);

const weldedPath = resolve(tmpDir, 'show-straight-welded.glb');
console.log('weld + simplify army');
runCli(['weld', showcasePath, weldedPath]);
runCli(['simplify', weldedPath, armyPath, '--ratio', '0.16', '--error', '1']);

const armyGltf = await parseGlb(armyPath);
let armyGeom = firstGeometry(armyGltf.scene);
paintHumanWeights(armyGeom);
await exportMesh(armyGeom, armyPath);

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
  note: 'Head-to-feet upright, plinth clipped, face baked to +Z. Human albedo is applied in-app (scan has no UVs).',
};
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(meta);

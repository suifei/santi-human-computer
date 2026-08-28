/**
 * 秦卒网格扶正：头-脚对齐世界 +Y，腹前朝 +Z，脚底贴地。
 * 给 prepare-qin-soldier / straighten-qin 共用。
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const TARGET_HEIGHT = 1.76;

export function countTris(geometry) {
  return geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
}

export function logHistogram(geometry, label) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const pos = geometry.attributes.position;
  const h = box.max.y - box.min.y;
  const bins = 18;
  const stats = Array.from({ length: bins }, () => ({
    n: 0, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity,
  }));
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    let b = Math.floor(((p.y - box.min.y) / Math.max(h, 1e-6)) * bins);
    if (b >= bins) b = bins - 1;
    if (b < 0) b = 0;
    const s = stats[b];
    s.n++;
    s.minX = Math.min(s.minX, p.x);
    s.maxX = Math.max(s.maxX, p.x);
    s.minZ = Math.min(s.minZ, p.z);
    s.maxZ = Math.max(s.maxZ, p.z);
  }
  const size = box.getSize(new THREE.Vector3());
  console.log(
    `  [${label}] bbox ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)}  y ${box.min.y.toFixed(3)}..${box.max.y.toFixed(3)}  tris=${countTris(geometry) | 0}`,
  );
  for (let i = 0; i < bins; i++) {
    const s = stats[i];
    if (!s.n) continue;
    const y0 = box.min.y + (i / bins) * h;
    const y1 = box.min.y + ((i + 1) / bins) * h;
    console.log(
      `    y ${y0.toFixed(2)}–${y1.toFixed(2)} n=${s.n} xz=${(s.maxX - s.minX).toFixed(2)}×${(s.maxZ - s.minZ).toFixed(2)}`,
    );
  }
}

function bandCentroid(pos, pred) {
  const c = new THREE.Vector3();
  let n = 0;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (!pred(p)) continue;
    c.add(p);
    n++;
  }
  if (n) c.divideScalar(n);
  return { c, n };
}

/** 头（顶 12%）到脚（底 8%）的轴对准 +Y；绕竖直轴的朝向保持不变。 */
export function alignHeadToFeet(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox.clone();
  const y0 = box.min.y;
  const y1 = box.max.y;
  const h = y1 - y0;
  const pos = geometry.attributes.position;
  const head = bandCentroid(pos, (p) => p.y >= y1 - 0.12 * h);
  const feet = bandCentroid(pos, (p) => p.y <= y0 + 0.08 * h);
  const axis = head.c.clone().sub(feet.c);
  const up = new THREE.Vector3(0, 1, 0);
  if (axis.lengthSq() < 1e-10 || head.n < 10 || feet.n < 10) {
    console.log('  head-feet: skip (empty band)');
    return 0;
  }
  if (axis.dot(up) < 0) axis.negate();
  const angleDeg = THREE.MathUtils.radToDeg(axis.angleTo(up));
  console.log(`  head-feet ${angleDeg.toFixed(2)}°  headN=${head.n} feetN=${feet.n}`);
  if (angleDeg < 0.12) return angleDeg;

  const from = axis.clone().normalize();
  const yaw = Math.atan2(from.x, from.z);
  geometry.rotateY(-yaw);

  geometry.computeBoundingBox();
  const box2 = geometry.boundingBox;
  const y0b = box2.min.y;
  const y1b = box2.max.y;
  const hb = y1b - y0b;
  const pos2 = geometry.attributes.position;
  const head2 = bandCentroid(pos2, (p) => p.y >= y1b - 0.12 * hb);
  const feet2 = bandCentroid(pos2, (p) => p.y <= y0b + 0.08 * hb);
  const a2 = head2.c.clone().sub(feet2.c);
  if (a2.dot(up) < 0) a2.negate();
  const roll = Math.atan2(a2.x, a2.y);
  geometry.rotateZ(roll);
  geometry.computeBoundingBox();
  const box3 = geometry.boundingBox;
  const y0c = box3.min.y;
  const y1c = box3.max.y;
  const hc = y1c - y0c;
  const pos3 = geometry.attributes.position;
  const head3 = bandCentroid(pos3, (p) => p.y >= y1c - 0.12 * hc);
  const feet3 = bandCentroid(pos3, (p) => p.y <= y0c + 0.08 * hc);
  const a3 = head3.c.clone().sub(feet3.c);
  if (a3.dot(up) < 0) a3.negate();
  const pitch = Math.atan2(a3.z, a3.y);
  geometry.rotateX(-pitch);
  geometry.rotateY(yaw);
  console.log(
    `    yaw-lock ${THREE.MathUtils.radToDeg(yaw).toFixed(1)}°  roll ${THREE.MathUtils.radToDeg(roll).toFixed(2)}°  pitch ${THREE.MathUtils.radToDeg(pitch).toFixed(2)}°`,
  );
  return angleDeg;
}

/** 腹前最凸处（合手）转到本地 +Z。 */
export function faceTowardPlusZ(geometry) {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const y0 = box.min.y;
  const y1 = box.max.y;
  const h = y1 - y0;
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const acc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  let count = 0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (p.y < y1 - 0.26 * h || p.y > y1 - 0.05 * h) continue;
    n.fromBufferAttribute(nrm, i);
    n.y = 0;
    if (n.lengthSq() < 0.12) continue;
    n.normalize();
    acc.add(n);
    count++;
  }
  if (count < 40) {
    console.log('  face: too few head normals');
    return 0;
  }
  acc.normalize();
  const angle = Math.atan2(acc.x, acc.z);
  console.log(`  face from ${count} head normals, yaw ${THREE.MathUtils.radToDeg(angle).toFixed(1)}° (→ +Z)`);
  geometry.rotateY(-angle);
  return angle;
}

/** 底部点云最薄方向 = 俑座法线，贴到世界 +Y。 */
export function alignPlinthToGround(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const yCut = box.min.y + 0.16 * (box.max.y - box.min.y);
  const pos = geometry.attributes.position;
  const p = new THREE.Vector3();
  const c = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (p.y > yCut) continue;
    c.add(p);
    n++;
  }
  if (n < 40) {
    console.log('  plinth: too few points');
    return 0;
  }
  c.divideScalar(n);
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (p.y > yCut) continue;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const dz = p.z - c.z;
    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  }
  const cov = new THREE.Matrix3().set(xx, xy, xz, xy, yy, yz, xz, yz, zz);
  const eps = 1e-6 * (xx + yy + zz) / 3;
  const e = cov.elements;
  e[0] += eps;
  e[4] += eps;
  e[8] += eps;
  if (Math.abs(cov.determinant()) < 1e-18) {
    console.log('  plinth: covariance degenerate');
    return 0;
  }
  const inv = cov.clone().invert();
  const v = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 32; k++) {
    v.applyMatrix3(inv);
    if (v.lengthSq() < 1e-16) break;
    v.normalize();
  }
  const up = new THREE.Vector3(0, 1, 0);
  if (v.dot(up) < 0) v.negate();
  const ang = THREE.MathUtils.radToDeg(v.angleTo(up));
  console.log(`  plinth normal ${ang.toFixed(2)}° from +Y  n=${n}`);
  if (ang < 0.25) return ang;
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v, up));
  return ang;
}

/** COLOR_0：皮肤(1,0,0) 甲(0,1,0) 衣(0,0,1) 靴(1,1,0) 发(0,0,0) */
export function paintHumanWeights(geometry) {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const counts = { hair: 0, skin: 0, armor: 0, cloth: 0, boot: 0 };
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    const y = p.y;
    const nz = n.z;
    const bun = y > 1.63;
    const backHead = y > 1.52 && nz < -0.32;
    const isHair = bun || backHead;
    const isFace = y > 1.42 && y < 1.64 && nz > 0.08;
    const isHands = y > 0.72 && y < 1.18 && p.z > 0.07 && Math.hypot(p.x, p.z) < 0.28;
    const isSkin = !isHair && (isFace || isHands);
    const isBoot = y < 0.22;
    const isCloth = !isHair && !isSkin && !isBoot && y < 0.86;
    let r = 0;
    let g = 0;
    let b = 0;
    if (isHair) counts.hair++;
    else if (isSkin) { r = 1; counts.skin++; }
    else if (isBoot) { r = 1; g = 1; counts.boot++; }
    else if (isCloth) { b = 1; counts.cloth++; }
    else { g = 1; counts.armor++; }
    col[i * 3] = r;
    col[i * 3 + 1] = g;
    col[i * 3 + 2] = b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  console.log('  paint', counts);
}

export function orientQin(geometry, { fromSource = false, clipY = 0.05 } = {}) {
  if (fromSource) coarseYUp(geometry);
  logHistogram(geometry, 'before');
  alignPlinthToGround(geometry);
  alignPlinthToGround(geometry);
  alignPlinthToGround(geometry);
  fitStanding(geometry);
  let g = geometry;
  if (clipY > 0) {
    g = clipPlinth(geometry, clipY);
    fitStanding(g);
  }
  logHistogram(g, 'after-plinth');
  const leftover = alignHeadToFeet(g);
  if (leftover > 0.4) fitStanding(g);
  faceTowardPlusZ(g);
  fitStanding(g);
  paintHumanWeights(g);
  return g;
}

export function clipPlinth(geometry, yCut = 0.045) {
  const src = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const pos = src.attributes.position;
  if (!src.attributes.normal) src.computeVertexNormals();
  const nrm = src.attributes.normal;
  const keepPos = [];
  const keepNrm = [];
  let kept = 0;
  let dropped = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const y0 = pos.getY(i);
    const y1 = pos.getY(i + 1);
    const y2 = pos.getY(i + 2);
    const yMid = (y0 + y1 + y2) / 3;
    const nY = (Math.abs(nrm.getY(i)) + Math.abs(nrm.getY(i + 1)) + Math.abs(nrm.getY(i + 2))) / 3;
    const isSlab = yMid < yCut || (yMid < 0.10 && nY > 0.82);
    if (isSlab) {
      dropped++;
      continue;
    }
    for (let k = 0; k < 3; k++) {
      keepPos.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      keepNrm.push(nrm.getX(i + k), nrm.getY(i + k), nrm.getZ(i + k));
    }
    kept++;
  }
  console.log(`  clip plinth: kept ${kept} tris, dropped ${dropped}`);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keepPos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(keepNrm, 3));
  const merged = mergeVertices(out, 1e-4);
  out.dispose();
  src.dispose();
  merged.computeVertexNormals();
  return merged;
}

export function fitStanding(geometry, target = TARGET_HEIGHT) {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const scale = target / Math.max(size.y, 1e-6);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  const b = geometry.boundingBox;
  geometry.translate(
    -(b.min.x + b.max.x) / 2,
    -b.min.y,
    -(b.min.z + b.max.z) / 2,
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const final = geometry.boundingBox.getSize(new THREE.Vector3());
  console.log(`  fitted ${final.x.toFixed(3)} × ${final.y.toFixed(3)} × ${final.z.toFixed(3)} m`);
}

export function coarseYUp(geometry) {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const axes = [
    { axis: 'x', len: size.x },
    { axis: 'y', len: size.y },
    { axis: 'z', len: size.z },
  ].sort((a, b) => b.len - a.len);
  const up = axes[0].axis;
  if (up === 'x') {
    geometry.rotateZ(Math.PI / 2);
    console.log('  coarse Y-up: rotate Z+90');
  } else if (up === 'z') {
    geometry.rotateX(-Math.PI / 2);
    console.log('  coarse Y-up: rotate X-90');
  } else {
    console.log('  coarse Y-up: already Y');
  }
}

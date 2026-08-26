/** 程序化 Canvas 纹理：旗帜（红壹/蓝零）、门牌号图集、区域木牌 */
import * as THREE from 'three';
import type { Gate } from '@/sim/netlist';

/** 旗帜贴图 512×352（home.md §6.2）：朱红壹 / 钢蓝零，暗金回纹边框 */
export function makeFlagTexture(isRed: boolean): THREE.CanvasTexture {
  const w = 512, h = 352;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = isRed ? '#C23B2E' : '#3E5F75';
  g.fillRect(0, 0, w, h);

  // 上下缘 6% 明暗渐变（布料受光）
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,235,200,0.10)');
  grad.addColorStop(0.12, 'rgba(0,0,0,0)');
  grad.addColorStop(0.88, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.14)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // 暗金回纹边框（简化：双重矩形 + 角饰）
  g.strokeStyle = 'rgba(212,169,82,0.55)';
  g.lineWidth = 6;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.lineWidth = 2.5;
  g.strokeRect(30, 30, w - 60, h - 60);
  g.fillStyle = 'rgba(212,169,82,0.55)';
  for (const [cx, cy] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) {
    g.fillRect(cx - 7, cy - 7, 14, 14);
  }

  // 中央白色篆意大字
  g.fillStyle = '#F6EFDD';
  g.font = '190px ShuowenSeal, Qiji, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(isRed ? '壹' : '零', w / 2, h / 2 + 8);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * 门牌号图集：2048²，32×32 格，每格 64²，按门下标存放门牌号。
 * 深木底 #3A2C1D + --sand 编号。
 */
export function makePlateAtlas(gates: Gate[]): { tex: THREE.CanvasTexture; cells: number } {
  const S = 2048, COLS = 32, CELL = S / COLS;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#3A2C1D';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < gates.length; i++) {
    const gate = gates[i];
    const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
    g.strokeStyle = 'rgba(176,138,79,0.4)';
    g.lineWidth = 2;
    g.strokeRect(cx + 4, cy + 4, CELL - 8, CELL - 8);
    g.fillStyle = '#C9B18A';
    const label = gate.id < 1000 ? String(gate.id).padStart(3, '0') : String(gate.id);
    g.font = `500 ${label.length > 3 ? 22 : gate.id < 100 ? 34 : 28}px "JetBrains Mono", monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, cx + CELL / 2, cy + CELL / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.flipY = false;
  return { tex, cells: COLS };
}

/** 区域木牌（直书金字）：輸入區 / 加法陣 / 乘法陣 / 輸出區 */
export function makeSignTexture(text: string): THREE.CanvasTexture {
  const w = 256, h = 512;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#1A120B';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(176,138,79,0.7)';
  g.lineWidth = 8;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#D4A952';
  g.font = '118px ShuowenSeal, Qiji, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...text];
  const step = (h - 80) / chars.length;
  chars.forEach((c, i) => g.fillText(c, w / 2, 40 + step * (i + 0.5)));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 火把火焰贴图（暖橙渐变三角焰） */
export function makeFlameTexture(): THREE.CanvasTexture {
  const w = 64, h = 128;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  const grad = g.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, 'rgba(255,140,66,0.95)');
  grad.addColorStop(0.5, 'rgba(255,180,90,0.75)');
  grad.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(w / 2, 2);
  g.quadraticCurveTo(w * 0.95, h * 0.55, w * 0.72, h * 0.92);
  g.quadraticCurveTo(w * 0.5, h, w * 0.28, h * 0.92);
  g.quadraticCurveTo(w * 0.05, h * 0.55, w / 2, 2);
  g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * WebAudio 战鼓合成（home.md §6.4：osc.sine 160→55Hz 指数扫频 + 低通噪声）
 * 无外部音频资产时的合成实现。
 */

let ctx: AudioContext | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function getNoise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** 单击战鼓。pitch 音高倍率（复位三连拍逐次略升），vol 音量 */
export function drumHit(pitch = 1, vol = 0.7) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;

  // 鼓身：正弦指数扫频 160→55Hz / 0.18s，增益包络 0.9→0.001 / 0.5s
  const osc = c.createOscillator();
  const og = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160 * pitch, t);
  osc.frequency.exponentialRampToValueAtTime(55 * pitch, t + 0.18);
  og.gain.setValueAtTime(0.9 * vol, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(og).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.55);

  // 起音噪声：低通 30ms
  const ns = c.createBufferSource();
  ns.buffer = getNoise(c);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.5 * vol, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  ns.connect(lp).connect(ng).connect(c.destination);
  ns.start(t);
  ns.stop(t + 0.06);
}

/** 复位三连快拍：200ms 内 3 鼓，音高逐次略升 */
export function resetTriple() {
  drumHit(1.0, 0.55);
  setTimeout(() => drumHit(1.12, 0.6), 66);
  setTimeout(() => drumHit(1.25, 0.7), 132);
}

/** 完成鼓奏：6 连击滚奏（替代 drum-roll.mp3） */
export function drumRoll() {
  const gaps = [0, 220, 400, 540, 660, 760];
  gaps.forEach((g, i) => setTimeout(() => drumHit(1 + i * 0.05, 0.5 + i * 0.07), g));
}

/** 远鼓闷响（入场） */
export function distantDrum() {
  drumHit(0.7, 0.4);
}

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

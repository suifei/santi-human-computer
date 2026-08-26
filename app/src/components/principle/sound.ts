/**
 * WebAudio 合成战鼓单击音（drum-hit.mp3 缺失时的合成替代，design.md §11）：
 * 低沉大鼓——起音猛烈的低频正弦扫频 + 短噪声拍击，尾音浑厚约 0.5s。
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function playDrum(volume = 0.3): void {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;

  // 低频鼓身
  const osc = ac.createOscillator();
  const oscGain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.28);
  oscGain.gain.setValueAtTime(volume, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  osc.connect(oscGain);
  oscGain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.6);

  // 拍击噪声（起音）
  const len = Math.floor(ac.sampleRate * 0.08);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 900;
  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.5, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ac.destination);
  noise.start(t);
}

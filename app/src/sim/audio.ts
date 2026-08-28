/**
 * WebAudio 战鼓合成（home.md §6.4：osc.sine 160→55Hz 指数扫频 + 低通噪声）
 * 军令 TTS：浏览器 speechSynthesis，中文 voice；无中文则静默。
 */

let ctx: AudioContext | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;
let speechTimer: ReturnType<typeof setTimeout> | null = null;
let speakGen = 0;
let speechUnlocked = false;
let lastOrder = '';
let voicesWait: Promise<void> | null = null;

const SPEECH_LAG_MS = 120;

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
  if (m) cancelOrder();
}
export function isMuted() {
  return muted;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis;
}

function waitVoices(s: SpeechSynthesis): Promise<void> {
  if (s.getVoices().length) return Promise.resolve();
  if (!voicesWait) {
    voicesWait = new Promise((resolve) => {
      const done = () => {
        s.removeEventListener('voiceschanged', done);
        resolve();
      };
      s.addEventListener('voiceschanged', done);
      setTimeout(done, 1200);
    });
  }
  return voicesWait;
}

/** 选 zh-TW / zh-CN；没有中文返回 null（调用方静默） */
function pickZhVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = s.getVoices();
  const rank = (v: SpeechSynthesisVoice) => {
    const lang = (v.lang || '').replace(/_/g, '-').toLowerCase();
    const name = v.name || '';
    if (lang === 'zh-tw' || lang.startsWith('zh-tw') || lang === 'cmn-hant') return 6;
    if (lang === 'zh-cn' || lang.startsWith('zh-cn') || lang === 'cmn-hans') return 5;
    if (/普通话|國語|Mandarin|Huihui|Yaoyao|Kangkang|Yating|Yunxi|Hanhan/i.test(name)) return 4;
    if ((lang.startsWith('zh') || lang.startsWith('cmn')) && !lang.startsWith('zh-hk') && !lang.startsWith('zh-yue')) return 3;
    if (lang.startsWith('zh-hk') || /Cantonese|粤|粵/.test(name)) return 1;
    if (lang.startsWith('zh') || lang.startsWith('cmn')) return 2;
    if (/中文|汉语|漢語|Chinese/i.test(name)) return 2;
    return 0;
  };
  let best: SpeechSynthesisVoice | null = null;
  let bestRank = 0;
  for (const v of voices) {
    const r = rank(v);
    if (r > bestRank) {
      best = v;
      bestRank = r;
    }
  }
  return best;
}

/** 在用户手势里解锁 TTS（延迟说话时仍算同一次点击） */
export function unlockSpeech() {
  if (muted || speechUnlocked) return;
  const s = synth();
  if (!s) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    s.speak(u);
    speechUnlocked = true;
  } catch {
    speechUnlocked = true;
  }
}

export function cancelOrder() {
  speakGen += 1;
  if (speechTimer) {
    clearTimeout(speechTimer);
    speechTimer = null;
  }
  lastOrder = '';
  try {
    synth()?.cancel();
  } catch { /* 无中文 / 不支持时不抛 */ }
}

export function lastSpokenOrder() {
  return lastOrder;
}

/**
 * 读一条军令。新令 / 静音 / 复位会打断旧句。
 * 默认落后鼓点 120ms；无中文 voice 则静默。
 * interrupt:false 时排队接在当前句后（注入完成不打断注入开始）。
 */
export function speakOrder(text: string, opts?: { lagMs?: number; skipIfReduced?: boolean; interrupt?: boolean }) {
  if (!text || muted) return;
  if (opts?.skipIfReduced && reducedMotion()) return;
  const s = synth();
  if (!s) return;

  if (opts?.interrupt !== false) cancelOrder();
  const gen = speakGen;
  unlockSpeech();
  lastOrder = text;

  const fire = () => {
    if (opts?.interrupt !== false) speechTimer = null;
    if (gen !== speakGen || muted) return;
    void waitVoices(s).then(() => {
      if (gen !== speakGen || muted) return;
      const voice = pickZhVoice(s);
      if (!voice) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang || 'zh-CN';
        u.rate = 0.94;
        u.pitch = 0.9;
        u.onerror = () => { /* 静默 */ };
        s.speak(u);
      } catch { /* 静默 */ }
    });
  };

  const lag = opts?.lagMs ?? SPEECH_LAG_MS;
  if (lag <= 0) fire();
  else if (opts?.interrupt === false) setTimeout(fire, lag);
  else speechTimer = setTimeout(fire, lag);
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.getVoices();
  } catch { /* ignore */ }
  (window as unknown as {
    __santiOrder: { last: () => string; muted: () => boolean };
  }).__santiOrder = {
    last: () => lastOrder,
    muted: () => muted,
  };
}

/**
 * 仿真状态机（home.md §10 契约）：
 * LOADING → IDLE → INJECTING → READY → RUNNING ⇄ PAUSED → DONE；任意 → RESETTING → IDLE
 */
import { create } from 'zustand';
import {
  buildNetlist, evalGate, readResult, runNetlist,
  type Netlist,
} from './netlist';
import { drumHit, drumRoll, resetTriple, setMuted as setAudioMuted } from './audio';

/** 网表自检（开发模式）：快速求值必须等于 (A+B)*C */
function selfCheck(nl: Netlist) {
  const cases: [number, number, number][] = [[1013, 1012, 1001], [0, 0, 0], [1023, 1023, 1023]];
  let rnd = 42;
  for (let i = 0; i < 40; i++) {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    const a = rnd % 1024; rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    const b = rnd % 1024; rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    cases.push([a, b, rnd % 1024]);
  }
  for (const [A, B, C] of cases) {
    const got = readResult(nl, runNetlist(nl, A, B, C));
    const want = (A + B) * C;
    if (got !== want) {
      console.error(`[人列] 网表自检失败: (${A}+${B})×${C} = ${got}，应为 ${want}`);
      return;
    }
  }
  console.info(`[人列] 网表自检通过：${nl.gates.length} 门 / ${nl.maxLayer} 层 / ${cases.length} 组用例 ✓`);
}

export type Status = 'LOADING' | 'IDLE' | 'INJECTING' | 'READY' | 'RUNNING' | 'PAUSED' | 'DONE' | 'RESETTING';
export type Preset = 'overview' | 'top' | 'input' | 'drum' | 'output' | 'follow';
export type Speed = 0.5 | 1 | 2 | 4 | 8;

export interface Toast { id: number; msg: string }

interface SimStore {
  netlist: Netlist;
  values: Uint8Array;
  status: Status;
  inputs: { A: number; B: number; C: number };
  tick: number;
  speed: Speed;
  selectedId: number | null;
  hoveredId: number | null;
  preset: Preset;
  muted: boolean;
  /** 最近一次提交中值发生变化的门下标（Soldiers 据此触发翻旗） */
  changed: number[];
  /** 每次值提交 +1（驱动渲染订阅） */
  commitNonce: number;
  /** 全场复位 +1（Soldiers 据此做西北→东南 stagger 翻蓝） */
  resetNonce: number;
  /** 每次击鼓 +1（鼓手/鼓面/火把/相机震动/波前光带锚定） */
  drumPulse: number;
  /** 瞬算模式：翻旗动画压缩为 120ms */
  flipFast: boolean;
  result: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  introDone: boolean;
  toasts: Toast[];

  setIntroDone: () => void;
  setInput: (k: 'A' | 'B' | 'C', v: number) => void;
  setExample: () => void;
  inject: () => void;
  toggleRun: () => void;
  stepOnce: () => void;
  resetAll: () => void;
  fastForward: () => void;
  select: (id: number | null) => void;
  hover: (id: number | null) => void;
  setPreset: (p: Preset) => void;
  setSpeed: (s: Speed) => void;
  toggleMute: () => void;
  toast: (msg: string) => void;
  dismissToast: (id: number) => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 0;

export const useSim = create<SimStore>((set, get) => {
  const netlist = buildNetlist();
  const values = new Uint8Array(netlist.gates.length);
  if (import.meta.env.DEV) selfCheck(netlist);

  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };

  /** 评估一拍：layer === tick+1 的所有门同拍并行求值，拍末统一提交 */
  const doTick = () => {
    const s = get();
    if (s.status !== 'RUNNING') return;
    const t = s.tick + 1;
    const nl = s.netlist;
    const snap = s.values.slice();
    const changed: number[] = [];
    for (const g of nl.byLayer[t]) {
      const v = evalGate(g, snap, nl.byId);
      if (v !== s.values[g.index]) { s.values[g.index] = v; changed.push(g.index); }
    }
    drumHit();
    set({ tick: t, changed, commitNonce: s.commitNonce + 1, drumPulse: s.drumPulse + 1 });
    if (t >= nl.maxLayer) finish();
    else schedule();
  };

  const schedule = () => {
    clearTimer();
    const s = get();
    timer = setTimeout(doTick, 650 / s.speed);
  };

  const finish = () => {
    clearTimer();
    const s = get();
    const result = readResult(s.netlist, s.values);
    set({ status: 'DONE', result, finishedAt: performance.now(), flipFast: false });
    drumRoll();
    s.toast(`演算完成：(${s.inputs.A} + ${s.inputs.B}) × ${s.inputs.C} = ${result.toLocaleString()}`);
  };

  /** 复位内核：全场翻蓝、拍数归零 */
  const resetCore = (withStagger: boolean) => {
    clearTimer();
    const s = get();
    s.values.fill(0);
    set({
      values: s.values, tick: 0, result: null, startedAt: null, finishedAt: null,
      changed: [], commitNonce: s.commitNonce + 1,
      resetNonce: withStagger ? s.resetNonce + 1 : s.resetNonce,
      flipFast: false,
    });
  };

  return {
    netlist,
    values,
    status: 'LOADING',
    inputs: { A: 1013, B: 1012, C: 1001 },
    tick: 0,
    speed: 1,
    selectedId: null,
    hoveredId: null,
    preset: 'overview',
    muted: false,
    changed: [],
    commitNonce: 0,
    resetNonce: 0,
    drumPulse: 0,
    flipFast: false,
    result: null,
    startedAt: null,
    finishedAt: null,
    introDone: false,
    toasts: [],

    setIntroDone: () => set({ status: 'IDLE', introDone: true }),

    setInput: (k, v) => {
      const n = Math.max(0, Math.min(1023, Math.floor(v) || 0));
      set((s) => ({ inputs: { ...s.inputs, [k]: n } }));
    },

    setExample: () => set({ inputs: { A: 1013, B: 1012, C: 1001 } }),

    inject: () => {
      const s = get();
      if (s.status === 'INJECTING' || s.status === 'RUNNING') return;
      // ① 三连快拍复位 → ② 输入手波浪注入 → ③ 就绪
      set({ status: 'RESETTING' });
      resetTriple();
      resetCore(true);
      setTimeout(() => {
        set({ status: 'INJECTING' });
        const { A, B, C } = get().inputs;
        const nl = get().netlist;
        // A/B 自西向东（bit0→bit9），C 列自南向北（bit9→bit0），每位 50ms stagger
        for (let i = 0; i < 10; i++) {
          setTimeout(() => {
            const st = get();
            const changed: number[] = [];
            const setBit = (id: number, bit: number) => {
              const g = nl.byId.get(id)!;
              if (st.values[g.index] !== bit) { st.values[g.index] = bit as 0 | 1; changed.push(g.index); }
            };
            setBit(nl.inputA[i], (A >> i) & 1);
            setBit(nl.inputB[i], (B >> i) & 1);
            set({ changed, commitNonce: st.commitNonce + 1 });
          }, i * 50);
        }
        for (let j = 0; j < 10; j++) {
          setTimeout(() => {
            const st = get();
            const bit = (C >> (9 - j)) & 1; // 自南向北
            const g = nl.byId.get(nl.inputC[9 - j])!;
            const changed: number[] = [];
            if (st.values[g.index] !== bit) { st.values[g.index] = bit as 0 | 1; changed.push(g.index); }
            set({ changed, commitNonce: st.commitNonce + 1 });
          }, j * 50);
        }
        setTimeout(() => {
          set({ status: 'READY' });
          get().toast('注入完成，请击鼓演算');
        }, 550);
      }, 500);
    },

    toggleRun: () => {
      const s = get();
      if (s.status === 'READY' || s.status === 'PAUSED') {
        set({ status: 'RUNNING', startedAt: s.startedAt ?? performance.now() });
        schedule();
      } else if (s.status === 'RUNNING') {
        clearTimer();
        set({ status: 'PAUSED' });
      } else if (s.status === 'IDLE') {
        s.toast('请先注入方阵');
      }
    },

    stepOnce: () => {
      const s = get();
      if (s.status === 'READY' || s.status === 'PAUSED') {
        set({ status: 'PAUSED', startedAt: s.startedAt ?? performance.now() });
        // 手动单拍（复用 doTick，但临时切 RUNNING 语义）
        const t = s.tick + 1;
        const nl = s.netlist;
        const snap = s.values.slice();
        const changed: number[] = [];
        for (const g of nl.byLayer[t]) {
          const v = evalGate(g, snap, nl.byId);
          if (v !== s.values[g.index]) { s.values[g.index] = v; changed.push(g.index); }
        }
        drumHit();
        set({ tick: t, changed, commitNonce: get().commitNonce + 1, drumPulse: get().drumPulse + 1 });
        if (t >= nl.maxLayer) finish();
      } else if (s.status === 'IDLE') {
        s.toast('请先注入方阵');
      }
    },

    resetAll: () => {
      const s = get();
      if (s.status === 'RESETTING' || s.status === 'LOADING') return;
      set({ status: 'RESETTING' });
      resetTriple();
      resetCore(true);
      setTimeout(() => {
        set({ status: 'IDLE' });
        get().toast('复位完毕 —— 大军列阵，静候将令');
      }, 900);
    },

    fastForward: () => {
      const s = get();
      if (s.status !== 'READY' && s.status !== 'RUNNING' && s.status !== 'PAUSED') {
        if (s.status === 'IDLE') s.toast('请先注入方阵');
        return;
      }
      clearTimer();
      set({ status: 'RUNNING', flipFast: true, startedAt: s.startedAt ?? performance.now() });
      const fastTick = () => {
        const st = get();
        if (st.status !== 'RUNNING') return;
        const t = st.tick + 1;
        const nl = st.netlist;
        const snap = st.values.slice();
        const changed: number[] = [];
        for (const g of nl.byLayer[t]) {
          const v = evalGate(g, snap, nl.byId);
          if (v !== st.values[g.index]) { st.values[g.index] = v; changed.push(g.index); }
        }
        set({ tick: t, changed, commitNonce: st.commitNonce + 1, drumPulse: st.drumPulse + 1 });
        if (t % 4 === 0) drumHit(1, 0.35);
        if (t >= nl.maxLayer) finish();
        else timer = setTimeout(fastTick, 50);
      };
      fastTick();
    },

    select: (id) => set({ selectedId: id }),
    hover: (id) => { if (get().hoveredId !== id) set({ hoveredId: id }); },
    setPreset: (p) => set({ preset: p }),
    setSpeed: (sp) => {
      set({ speed: sp });
      if (get().status === 'RUNNING' && !get().flipFast) schedule();
    },
    toggleMute: () => {
      const m = !get().muted;
      setAudioMuted(m);
      set({ muted: m });
    },

    toast: (msg) => {
      const id = ++toastSeq;
      set((s) => ({ toasts: [...s.toasts.slice(-2), { id, msg }] }));
      setTimeout(() => get().dismissToast(id), 2400);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});

/** 当前激活层的质心（跟随信号机位用） */
export function activeLayerCentroid(nl: Netlist, tick: number): [number, number] {
  const t = Math.max(1, Math.min(tick, nl.maxLayer));
  const gates = nl.byLayer[t];
  if (!gates.length) return [0, 0];
  let x = 0, z = 0;
  for (const g of gates) { x += g.pos[0]; z += g.pos[1]; }
  return [x / gates.length, z / gates.length];
}

/**
 * 仿真状态机（home.md §10 契约）：
 * LOADING → IDLE → INJECTING → READY → RUNNING ⇄ PAUSED → DONE；任意 → RESETTING → IDLE
 */
import { create } from 'zustand';
import {
  buildNetlist, tryBuildNetlist, evalGate, readResult, runNetlist, bitOf, inputMax,
  displayExpr, buildCpuNetlist, evalCpuLayer, injectCpu, readCpuResult, CPU_OP_ZONES,
  type Netlist, type BitWidth, type CpuOp,
} from './netlist';
import { evalExpr, parseProgram, zeroDivisorReason, DEFAULT_BITS, DEFAULT_EXPR, REG_COUNT } from './program';
import { parseLang, DEFAULT_PROGRAM } from './lang';
import { applyResult, createVm, nextCampaign, type Campaign, type Vm } from './vm';
import { drumHit, drumRoll, resetTriple, setMuted as setAudioMuted } from './audio';

function selfCheck(nl: Netlist) {
  const parsed = parseProgram(nl.expr);
  if (!parsed.ok) { console.error('[人列] 自检：默认军令无法解析'); return; }
  const max = inputMax(nl.bits);
  const cases: [number, number, number][] = nl.bits === 10
    ? [[1013, 1012, 1001], [0, 0, 0], [Math.min(1023, max), Math.min(1023, max), Math.min(1023, max)]]
    : [[0, 0, 1], [1, 0, 1], [7, 5, 3]];
  let rnd = 42;
  const mod = Math.min(max + 1, 1024);
  for (let i = 0; i < 24; i++) {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    const a = rnd % mod; rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    const b = rnd % mod; rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    cases.push([a, b, (rnd % mod) || 1]);
  }
  const limit = nl.gates.length > 1500 ? 4 : cases.length;
  for (const [A, B, C] of cases.slice(0, limit)) {
    if (zeroDivisorReason(parsed.ast, BigInt(A), BigInt(B), BigInt(C), nl.bits)) continue;
    const got = readResult(nl, runNetlist(nl, A, B, C));
    const want = evalExpr(parsed.ast, BigInt(A), BigInt(B), BigInt(C), nl.bits);
    if (got !== want) {
      console.error(`[人列] 网表自检失败: ${nl.expr} @${nl.bits}bit (${A},${B},${C}) = ${got}，应为 ${want}`);
      return;
    }
  }
  console.info(`[人列] 网表自检通过：${nl.expr} ${nl.bits}位 ${nl.gates.length} 门 / ${nl.maxLayer} 层 ✓`);
}

export type Status = 'LOADING' | 'IDLE' | 'INJECTING' | 'READY' | 'RUNNING' | 'PAUSED' | 'DONE' | 'RESETTING';
export type Preset = 'overview' | 'top' | 'input' | 'drum' | 'output' | 'command' | 'follow';
export type Speed = 0.5 | 1 | 2 | 4 | 8;
export type SimMode = 'expr' | 'program';

export interface Toast { id: number; msg: string }

interface SimStore {
  netlist: Netlist;
  values: Uint8Array;
  status: Status;
  bits: BitWidth;
  expr: string;
  inputs: { A: number; B: number; C: number };
  tick: number;
  speed: Speed;
  selectedId: number | null;
  hoveredId: number | null;
  preset: Preset;
  muted: boolean;
  changed: number[];
  commitNonce: number;
  resetNonce: number;
  drumPulse: number;
  flipFast: boolean;
  result: bigint | null;
  startedAt: number | null;
  finishedAt: number | null;
  introDone: boolean;
  toasts: Toast[];
  mode: SimMode;
  programText: string;
  programLine: number;
  programRound: number;
  programLabel: string;
  programOp: CpuOp | null;
  programUntil: number;
  regs: bigint[];

  setIntroDone: () => void;
  setInput: (k: 'A' | 'B' | 'C', v: number) => void;
  setExample: () => void;
  setExpr: (expr: string) => boolean;
  setBits: (bits: BitWidth) => boolean;
  setMode: (mode: SimMode) => void;
  setProgramText: (src: string) => void;
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
let programVm: Vm | null = null;
let programCamp: Campaign | null = null;

function clampInputs(bits: BitWidth, inputs: { A: number; B: number; C: number }) {
  const max = inputMax(bits);
  const clamp = (v: number) => Math.max(0, Math.min(max, Math.floor(v) || 0));
  return { A: clamp(inputs.A), B: clamp(inputs.B), C: clamp(inputs.C) };
}

export const useSim = create<SimStore>((set, get) => {
  const netlist = buildNetlist();
  const values = new Uint8Array(netlist.gates.length);
  if (import.meta.env.DEV) selfCheck(netlist);

  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };

  const campaignUntil = () => {
    const s = get();
    if (s.mode === 'program' && programCamp) return programCamp.untilLayer;
    return s.netlist.maxLayer;
  };

  const doTick = () => {
    const s = get();
    if (s.status !== 'RUNNING') return;
    const t = s.tick + 1;
    const changed = evalLayer(t);
    drumHit();
    set({ tick: t, changed, commitNonce: s.commitNonce + 1, drumPulse: s.drumPulse + 1 });
    if (t >= campaignUntil()) finish();
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
    const result = s.mode === 'program' && programCamp
      ? readCpuResult(s.netlist, s.values, programCamp.op)
      : readResult(s.netlist, s.values);
    if (s.mode === 'program' && programVm && programCamp) {
      applyResult(programVm, programCamp, result);
      set({ regs: programVm.regs.slice(), programRound: programVm.rounds, programLine: programVm.srcLine });
      const keepFast = s.flipFast;
      const next = nextCampaign(programVm);
      if ('error' in next) {
        programCamp = null;
        set({
          status: 'DONE', result: programVm.regs[0] ?? result, finishedAt: performance.now(), flipFast: false,
          programLabel: '', programOp: null, programUntil: 0,
        });
        s.toast(next.error);
        return;
      }
      if ('halt' in next) {
        programCamp = null;
        const out = programVm.regs[0] ?? result;
        set({
          status: 'DONE', result: out, finishedAt: performance.now(), flipFast: false,
          programLabel: '完成', programOp: null, programUntil: 0,
        });
        drumRoll();
        s.toast(`程序完成：R0 = ${out.toLocaleString()} · ${programVm.rounds} 輪人列`);
        return;
      }
      drumHit(1, 0.45);
      timer = setTimeout(() => beginCampaign(next, { stagger: false, autoRun: true, flipFast: keepFast }), 0);
      return;
    }
    set({ status: 'DONE', result, finishedAt: performance.now(), flipFast: false });
    drumRoll();
    s.toast(`演算完成：${displayExpr(s.expr)} = ${result.toLocaleString()}`);
  };

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

  const rebuild = (expr: string, bits: BitWidth): boolean => {
    const s = get();
    if (s.status === 'RUNNING' || s.status === 'INJECTING' || s.status === 'RESETTING') {
      s.toast('演算中不能換軍令');
      return false;
    }
    const r = tryBuildNetlist(expr, bits);
    if (!r.ok) { s.toast(r.error); return false; }
    clearTimer();
    const inputs = clampInputs(bits, s.inputs);
    const values = new Uint8Array(r.netlist.gates.length);
    set({
      netlist: r.netlist, values, bits, expr: r.netlist.expr, inputs,
      status: 'IDLE', tick: 0, result: null, selectedId: null,
      changed: [], commitNonce: s.commitNonce + 1, resetNonce: s.resetNonce + 1,
      startedAt: null, finishedAt: null, flipFast: false,
    });
    if (import.meta.env.DEV) selfCheck(r.netlist);
    s.toast(`${bits} 位 · ${displayExpr(r.netlist.expr)} · ${r.netlist.gates.length} 門 / ${r.netlist.maxLayer} 拍`);
    return true;
  };

  const evalLayer = (t: number) => {
    const s = get();
    if (s.mode === 'program' && programCamp) {
      return evalCpuLayer(s.netlist, s.values, t, programCamp.op, programCamp.untilLayer);
    }
    const nl = s.netlist;
    const snap = s.values.slice();
    const changed: number[] = [];
    for (const g of nl.byLayer[t] ?? []) {
      const v = evalGate(g, snap, nl.byId);
      if (v !== s.values[g.index]) { s.values[g.index] = v; changed.push(g.index); }
    }
    return changed;
  };

  const adoptNetlist = (nl: Netlist, clear: boolean) => {
    const s = get();
    const same = s.netlist === nl;
    const values = same ? s.values : new Uint8Array(nl.gates.length);
    if (clear || !same) values.fill(0);
    set({
      netlist: nl, values, expr: nl.expr,
      tick: 0, result: null, changed: [],
      commitNonce: s.commitNonce + 1,
      resetNonce: same ? s.resetNonce : s.resetNonce + 1,
    });
  };

  const paintCpu = (nl: Netlist, camp: Campaign) => {
    const st = get();
    const before = st.values.slice();
    injectCpu(nl, st.values, {
      A: camp.inject.A, B: camp.inject.B, C: camp.inject.C,
      aluA: camp.inject.aluA, aluB: camp.inject.aluB, inv: camp.inject.inv,
      regs: programVm?.regs ?? st.regs,
      scratch: programVm?.scratch ?? [],
    });
    const changed: number[] = [];
    for (let i = 0; i < st.values.length; i++) {
      if (st.values[i] !== before[i]) changed.push(i);
    }
    set({ changed, commitNonce: st.commitNonce + 1 });
  };

  function beginCampaign(camp: Campaign, opts: { stagger: boolean; autoRun: boolean; flipFast: boolean }) {
    programCamp = camp;
    const s = get();
    adoptNetlist(camp.netlist, false);
    set({
      programLine: camp.line,
      programLabel: camp.label,
      programRound: programVm?.rounds ?? 0,
      programOp: camp.op,
      programUntil: camp.untilLayer,
      regs: programVm?.regs.slice() ?? s.regs,
      startedAt: s.startedAt ?? performance.now(),
      flipFast: opts.flipFast,
    });
    paintCpu(camp.netlist, camp);
    const { A, B, C } = camp.inject;
    if (!opts.stagger) {
      set({ status: opts.autoRun ? 'RUNNING' : 'READY' });
      if (opts.autoRun) {
        if (opts.flipFast) get().fastForward();
        else schedule();
      }
      return;
    }
    set({ status: 'INJECTING' });
    const nl = camp.netlist;
    const nA = Math.max(nl.inputA.length, nl.inputC.length, 1);
    const step = nA > 16 ? 20 : 50;
    for (let i = 0; i < nl.inputA.length; i++) {
      setTimeout(() => {
        const st = get();
        const g = nl.byId.get(nl.inputA[i])!;
        const bit = bitOf(A, i);
        const changed: number[] = [];
        if (st.values[g.index] !== bit) { st.values[g.index] = bit; changed.push(g.index); }
        if (i < nl.inputB.length) {
          const gb = nl.byId.get(nl.inputB[i])!;
          const bb = bitOf(B, i);
          if (st.values[gb.index] !== bb) { st.values[gb.index] = bb; changed.push(gb.index); }
        }
        set({ changed, commitNonce: st.commitNonce + 1 });
      }, i * step);
    }
    for (let j = 0; j < nl.inputC.length; j++) {
      setTimeout(() => {
        const st = get();
        const bitIdx = nl.inputC.length - 1 - j;
        const bit = bitOf(C, bitIdx);
        const g = nl.byId.get(nl.inputC[bitIdx])!;
        const changed: number[] = [];
        if (st.values[g.index] !== bit) { st.values[g.index] = bit as 0 | 1; changed.push(g.index); }
        set({ changed, commitNonce: st.commitNonce + 1 });
      }, j * step);
    }
    setTimeout(() => {
      set({ status: 'READY' });
      get().toast('全員已列陣，請擊鼓演算');
    }, nA * step + 50);
  }

  return {
    netlist,
    values,
    status: 'LOADING',
    bits: DEFAULT_BITS,
    expr: DEFAULT_EXPR,
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
    mode: 'expr',
    programText: DEFAULT_PROGRAM,
    programLine: 0,
    programRound: 0,
    programLabel: '',
    programOp: null,
    programUntil: 0,
    regs: Array.from({ length: REG_COUNT }, () => 0n),

    setIntroDone: () => set({ status: 'IDLE', introDone: true }),

    setInput: (k, v) => {
      const max = inputMax(get().bits);
      const n = Math.max(0, Math.min(max, Math.floor(Number(v)) || 0));
      set((s) => ({ inputs: { ...s.inputs, [k]: n } }));
    },

    setExample: () => {
      const bits = get().bits;
      if (get().mode === 'program') {
        set({ inputs: clampInputs(bits, { A: 7, B: 5, C: 1 }) });
        return;
      }
      if (bits === 10) set({ inputs: { A: 1013, B: 1012, C: 1001 } });
      else set({ inputs: clampInputs(bits, { A: 1013, B: 1012, C: 1001 }) });
    },

    setExpr: (expr) => rebuild(expr, get().bits),
    setBits: (bits) => {
      if (get().mode === 'program') {
        const s = get();
        if (s.status === 'RUNNING' || s.status === 'INJECTING' || s.status === 'RESETTING') {
          s.toast('演算中不能換位寬');
          return false;
        }
        const nl = buildCpuNetlist(bits);
        const values = new Uint8Array(nl.gates.length);
        set({
          bits, inputs: clampInputs(bits, s.inputs),
          netlist: nl, values, expr: 'CPU',
          status: 'IDLE', tick: 0, result: null, selectedId: null,
          programOp: null, programUntil: 0,
          changed: [], commitNonce: s.commitNonce + 1, resetNonce: s.resetNonce + 1,
        });
        if (bits === 32) s.toast('32 位全員含乘除約兩萬門；加法仍按加法拍數，循環請用 10 位');
        else s.toast(`${bits} 位資料通路 · ${nl.gates.length} 門全員列陣`);
        return true;
      }
      return rebuild(get().expr, bits);
    },
    setMode: (mode) => {
      const s = get();
      if (s.status === 'RUNNING' || s.status === 'INJECTING' || s.status === 'RESETTING') {
        s.toast('演算中不能切換');
        return;
      }
      if (s.mode === mode) return;
      programVm = null;
      programCamp = null;
      if (mode === 'expr') {
        const keep = s.expr !== 'CPU' && (s.expr === DEFAULT_EXPR || parseProgram(s.expr).ok);
        set({ mode, programLabel: '', programRound: 0, programLine: 0, programOp: null, programUntil: 0 });
        rebuild(keep ? s.expr : DEFAULT_EXPR, s.bits);
        return;
      }
      const nl = buildCpuNetlist(s.bits);
      const values = new Uint8Array(nl.gates.length);
      set({
        mode, netlist: nl, values, expr: 'CPU',
        status: 'IDLE', programLabel: '', programRound: 0, programLine: 0,
        programOp: null, programUntil: 0,
        regs: Array.from({ length: REG_COUNT }, () => 0n), result: null,
        tick: 0, selectedId: null,
        changed: [], commitNonce: s.commitNonce + 1, resetNonce: s.resetNonce + 1,
      });
      s.toast(`程序模式：全員列陣 ${nl.gates.length} 門，加減乘除比較都在`);
    },
    setProgramText: (src) => set({ programText: src }),

    inject: () => {
      const s = get();
      if (s.status === 'INJECTING' || s.status === 'RUNNING') return;
      if (s.mode === 'program') {
        const parsed = parseLang(s.programText);
        if (!parsed.ok) { s.toast(`第 ${parsed.line} 行：${parsed.error}`); return; }
        programVm = createVm(parsed.stmts, s.bits, s.inputs);
        const camp = nextCampaign(programVm);
        if ('error' in camp) { s.toast(camp.error); programVm = null; return; }
        if ('halt' in camp) { s.toast('程序沒有可執行的人列戰役'); programVm = null; return; }
        set({ status: 'RESETTING', regs: programVm.regs.slice(), result: null, startedAt: null, finishedAt: null });
        resetTriple();
        resetCore(true);
        setTimeout(() => beginCampaign(camp, { stagger: true, autoRun: false, flipFast: false }), 500);
        return;
      }
      const parsed = parseProgram(s.expr);
      if (parsed.ok) {
        const z = zeroDivisorReason(parsed.ast, BigInt(s.inputs.A), BigInt(s.inputs.B), BigInt(s.inputs.C), s.bits);
        if (z) { s.toast(z); return; }
      }
      set({ status: 'RESETTING' });
      resetTriple();
      resetCore(true);
      setTimeout(() => {
        set({ status: 'INJECTING' });
        const { A, B, C } = get().inputs;
        const nl = get().netlist;
        const nA = nl.inputA.length, nC = nl.inputC.length;
        const step = nA > 16 ? 20 : 50;
        for (let i = 0; i < nA; i++) {
          setTimeout(() => {
            const st = get();
            const changed: number[] = [];
            const setBit = (id: number, bit: number) => {
              const g = nl.byId.get(id)!;
              if (st.values[g.index] !== bit) { st.values[g.index] = bit as 0 | 1; changed.push(g.index); }
            };
            setBit(nl.inputA[i], bitOf(A, i));
            setBit(nl.inputB[i], bitOf(B, i));
            set({ changed, commitNonce: st.commitNonce + 1 });
          }, i * step);
        }
        for (let j = 0; j < nC; j++) {
          setTimeout(() => {
            const st = get();
            const bitIdx = nC - 1 - j;
            const bit = bitOf(C, bitIdx);
            const g = nl.byId.get(nl.inputC[bitIdx])!;
            const changed: number[] = [];
            if (st.values[g.index] !== bit) { st.values[g.index] = bit as 0 | 1; changed.push(g.index); }
            set({ changed, commitNonce: st.commitNonce + 1 });
          }, j * step);
        }
        setTimeout(() => {
          set({ status: 'READY' });
          get().toast('注入完成，請擊鼓演算');
        }, nA * step + 50);
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
        s.toast('請先注入方陣');
      }
    },

    stepOnce: () => {
      const s = get();
      if (s.status === 'READY' || s.status === 'PAUSED') {
        set({ status: 'PAUSED', startedAt: s.startedAt ?? performance.now() });
        const t = s.tick + 1;
        const changed = evalLayer(t);
        drumHit();
        set({ tick: t, changed, commitNonce: get().commitNonce + 1, drumPulse: get().drumPulse + 1 });
        if (t >= campaignUntil()) finish();
      } else if (s.status === 'IDLE') {
        s.toast('請先注入方陣');
      }
    },

    resetAll: () => {
      const s = get();
      if (s.status === 'RESETTING' || s.status === 'LOADING') return;
      programVm = null;
      programCamp = null;
      set({ status: 'RESETTING', programOp: null, programUntil: 0, programLabel: '', programRound: 0, programLine: 0 });
      resetTriple();
      resetCore(true);
      setTimeout(() => {
        set({ status: 'IDLE' });
        get().toast('復位完畢 —— 大軍列陣，靜候將令');
      }, 900);
    },

    fastForward: () => {
      const s = get();
      if (s.status !== 'READY' && s.status !== 'RUNNING' && s.status !== 'PAUSED') {
        if (s.status === 'IDLE') s.toast('請先注入方陣');
        return;
      }
      clearTimer();
      set({ status: 'RUNNING', flipFast: true, startedAt: s.startedAt ?? performance.now() });
      // 与 10 位相同：一层一拍、50ms 鼓点。大阵只是拍数更多，不一次吞掉整场。
      const BEAT_MS = 50;
      const fastTick = () => {
        const st = get();
        if (st.status !== 'RUNNING') return;
        const t = st.tick + 1;
        const changed = evalLayer(t);
        set({ tick: t, changed, commitNonce: st.commitNonce + 1, drumPulse: st.drumPulse + 1 });
        if (t % 4 === 0) drumHit(1, 0.35);
        if (t >= campaignUntil()) finish();
        else timer = setTimeout(fastTick, BEAT_MS);
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
      setTimeout(() => get().dismissToast(id), 2800);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});

if (typeof window !== 'undefined') {
  (window as unknown as { __santiSim: typeof useSim }).__santiSim = useSim;
}

export function activeLayerCentroid(nl: Netlist, tick: number, op?: CpuOp | null): [number, number] {
  const t = Math.max(1, Math.min(tick, nl.maxLayer));
  let gates = nl.byLayer[t] ?? [];
  if (op) {
    const z = new Set(CPU_OP_ZONES[op]);
    gates = gates.filter((g) => z.has(g.zone));
  }
  if (!gates.length && op && nl.cpu) {
    const ids = nl.cpu.outs[op];
    const g = ids[0] ? nl.byId.get(ids[0]) : undefined;
    if (g) return [g.pos[0], g.pos[1]];
  }
  if (!gates.length) return [0, 0];
  let x = 0, z = 0;
  for (const g of gates) { x += g.pos[0]; z += g.pos[1]; }
  return [x / gates.length, z / gates.length];
}

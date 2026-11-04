// @ts-expect-error -- Node-only hook harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Props = Record<string, any>;
function compile(path: string, seams: Props): Props {
  const exports: Props = {};
  new Function('require', 'exports', ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)((id: string) => {
    if (id in seams) return seams[id];
    if (id === '@/constants/motion') return compile('src/constants/motion.ts', {});
    if (id === '@/lib/mascot-motion') return compile('src/lib/mascot-motion.ts', {});
    throw Error(id);
  }, exports);
  return exports;
}
function harness() {
  let reduced = false, state: any, current: any, effect!: () => () => void;
  const values: any[] = [];
  const cancelAnimation = vi.fn();
  const withRepeat = vi.fn((...args: any[]) => args);
  const chain: any = new Proxy(function () {}, { get: () => () => chain, construct: () => chain });
  const module = compile('src/components/motion.tsx', {
    react: { useState: (initial: any) => [state ??= initial, (next: any) => { state = next; }], useEffect: (fn: any) => { effect = fn; } },
    '@/hooks/use-reduced-motion': { useReducedMotion: () => reduced },
    'react-native-reanimated': {
      default: { View: 'View' }, Easing: { bezier: () => 'curve' }, Keyframe: chain, LinearTransition: chain,
      ReduceMotion: { Never: 'never' }, cancelAnimation, withRepeat,
      withTiming: (to: number, config: Props) => ({ to, config }), withSequence: (...steps: any[]) => steps,
      useAnimatedStyle: (fn: any) => fn(), useSharedValue: (initial: number) => {
        const shared = { value: initial, get() { return this.value; }, set(next: any) { this.value = next; } };
        values.push(shared); return shared;
      },
    },
  });
  return { start: (expression = 'hello', active = true) => { current = module.useDuckMotion(expression, active); return effect(); },
    state: () => state, current: () => current, reduce: () => { reduced = true; }, values, cancelAnimation, withRepeat };
}
afterEach(() => vi.useRealTimers());
describe('Itik lifecycle', () => {
  it('changes the actual wave and blink frames, plays a bounded idle after, then leaves no scheduled callbacks', () => {
    vi.useFakeTimers(); const h = harness(); const stop = h.start('hello');
    vi.advanceTimersByTime(140); expect(h.state().pose).toBe(2); // wave
    vi.advanceTimersByTime(1480); expect(h.state().pose).toBe(0); // back to idle at 1.62 s
    // The first blink is on the calm face, after the wave.
    let blinked = false;
    for (let t = 0; t < 12_000 && !blinked; t += 10) { vi.advanceTimersByTime(10); blinked = h.state().pose === 1; }
    expect(blinked).toBe(true);
    vi.advanceTimersByTime(130); expect(h.state().pose).toBe(0);
    vi.runAllTimers(); expect(vi.getTimerCount()).toBe(0);
    // Every repeat is finite (never -1 / Infinity).
    for (const call of h.withRepeat.mock.calls) { expect(call[1]).toBeGreaterThanOrEqual(1); expect(Number.isFinite(call[1])).toBe(true); }
    stop(); expect(h.values.slice(0, 5).map(v => v.value)).toEqual([1, 1, 0, 0, 0]);
  });
  it('cancels outstanding callbacks on unmount and never writes a stale pose', () => {
    vi.useFakeTimers(); const h = harness(); const stop = h.start();
    expect(vi.getTimerCount()).toBeGreaterThan(0); stop();
    expect(vi.getTimerCount()).toBe(0); const before = h.state();
    vi.runAllTimers(); expect(h.state()).toBe(before);
    expect(h.cancelAnimation).toHaveBeenCalled();
  });
  it('stays still in background and respects a live reduced-motion change', () => {
    vi.useFakeTimers(); const h = harness(); let stop = h.start(); stop();
    stop = h.start('hello', false); expect(vi.getTimerCount()).toBe(0); stop();
    h.reduce(); stop = h.start('concern');
    expect(vi.getTimerCount()).toBe(0); expect(h.current().pose).toBe(5); // the worried oops pose, still
    expect(h.values.slice(-5).map(v => v.value)).toEqual([1, 1, 0, 0, 0]); stop();
  });
});

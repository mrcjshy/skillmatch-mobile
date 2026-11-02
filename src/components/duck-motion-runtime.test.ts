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
describe('duck lifecycle', () => {
  it('changes the actual wing and blink frames, then leaves no scheduled callbacks', () => {
    vi.useFakeTimers(); const h = harness(); const stop = h.start();
    vi.advanceTimersByTime(320); expect(h.state().pose).toBe(2);
    vi.advanceTimersByTime(260); expect(h.state().pose).toBe(3);
    vi.advanceTimersByTime(2020); expect(h.state().pose).toBe(1);
    vi.advanceTimersByTime(140); expect(h.state().pose).toBe(0);
    vi.runAllTimers(); expect(vi.getTimerCount()).toBe(0);
    expect(h.withRepeat.mock.calls[0][1]).toBe(6);
    stop(); expect(h.values.slice(0, 3).map(v => v.value)).toEqual([1, 0, 0]);
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
    expect(vi.getTimerCount()).toBe(0); expect(h.current().pose).toBe(6);
    expect(h.values.slice(-3).map(v => v.value)).toEqual([1, 0, 0]); stop();
  });
});

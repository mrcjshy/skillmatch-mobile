// @ts-expect-error -- Node-only component harness; native motion is checked on emulators (UI-V2 NATIVE-QA.md).
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SkillMatchTheme } from '@/constants/theme';

vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (value: any) => value.android ?? value.default } }));

// UI-V2: the open-job carousel (GalleryStackCarousel depth model, re-implemented).
type Props = Record<string, any>;
type Node = { type: any; props: Props };
const nodes = (tree: any): Node[] => !tree || typeof tree !== 'object' ? []
  : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const SOURCE = readFileSync('src/components/finding-worker-carousel.tsx', 'utf8');
let reduced = false;
let platform = 'android';
let compose: Props | 'throws' = 'throws';
let effects: (() => any)[] = [];
let stateSlots: any[] = [];
let stateCursor = 0;
const appStateListeners = new Set<(state: string) => void>();
let shared: { value: number; assigned: any[]; get: () => number; set: (next: any) => void };

const interpolate = (value: number, input: number[], output: number[]) => {
  if (value <= input[0]) return output[0];
  for (let i = 1; i < input.length; i++) {
    if (value <= input[i]) return output[i - 1] + (output[i] - output[i - 1]) * (value - input[i - 1]) / (input[i] - input[i - 1]);
  }
  return output[output.length - 1];
};
const reanimated: Props = {
  __esModule: true,
  default: { View: 'Animated.View' },
  Easing: { inOut: () => 'inOut', quad: 'quad' },
  Extrapolation: { CLAMP: 'clamp' },
  ReduceMotion: { Never: 'never' },
  cancelAnimation: () => {},
  interpolate,
  interpolateColor: (value: number, input: number[], output: string[]) => output[Math.round(Math.min(Math.max(value, 0), input.length - 1))],
  useAnimatedStyle: (fn: () => Props) => fn(),
  useSharedValue: () => shared,
  withRepeat: (inner: any, times: number) => ({ repeat: times, inner }),
  withSpring: (toValue: number, config: Props) => ({ spring: toValue, config }),
  withTiming: (toValue: number, config: Props) => ({ toValue, ...config }),
};

function load() {
  const exports: Props = {};
  const source = ts.transpileModule(SOURCE, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const modules: Props = {
    react: {
      useEffect: (fn: () => any) => { effects.push(fn); },
      useState: (initial: any) => {
        const i = stateCursor++;
        if (!(i in stateSlots)) stateSlots[i] = initial;
        return [stateSlots[i], (next: any) => { stateSlots[i] = next; }];
      },
    },
    'react/jsx-runtime': { jsx: (type: any, props: Props) => ({ type, props }), jsxs: (type: any, props: Props) => ({ type, props }) },
    'react-native': {
      Platform: { get OS() { return platform; } }, View: 'View', StyleSheet: { create: (s: Props) => s, absoluteFill: {} },
      AppState: { currentState: 'active', addEventListener: (_: string, fn: (state: string) => void) => { appStateListeners.add(fn); return { remove: () => appStateListeners.delete(fn) }; } },
    },
    'react-native-reanimated': reanimated,
    '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
    '@/constants/theme': { SkillMatchTheme },
    '@/hooks/use-reduced-motion': { useReducedMotion: () => reduced },
  };
  const require = (name: string) => {
    if (name.startsWith('@expo/ui/jetpack-compose')) {
      if (compose === 'throws') throw new Error('ExpoUI view not in this APK');
      return compose;
    }
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
    return modules[name];
  };
  new Function('require', 'exports', source)(require, exports);
  return exports;
}

/** Expands function components so the cards' animated styles are visible. */
function expand(tree: any): any {
  if (!tree || typeof tree !== 'object') return tree;
  if (Array.isArray(tree)) return tree.map(expand);
  if (typeof tree.type === 'function') return expand(tree.type(tree.props));
  return { ...tree, props: { ...tree.props, children: expand(tree.props?.children) } };
}

/** One render pass: hooks run in order, then the effects queued by that pass. */
function render(exports: Props) {
  effects = []; stateCursor = 0;
  const tree = expand(exports.FindingWorkerCarousel());
  const cleanups = effects.map(effect => effect());
  return { tree, cleanups };
}
const cards = (exports: Props, tree: any) => nodes(tree).filter(node => node.type === 'Animated.View' && node.props.style?.[0]?.width === exports.CARD_W);
const springs = () => shared.assigned.filter(value => value?.spring !== undefined);

beforeEach(() => {
  reduced = false; platform = 'android'; compose = 'throws'; stateSlots = []; appStateListeners.clear();
  shared = { value: 0, assigned: [], get: () => shared.value, set: (next: any) => { shared.assigned.push(next); if (typeof next === 'number') shared.value = next; } };
});
afterEach(() => { vi.useRealTimers(); });

describe('FindingWorkerCarousel (UI-V2)', () => {
  it('keeps worklets self-contained: no default parameters and no animated zIndex (native crash and per-frame layout found on device)', () => {
    const worklets = [...SOURCE.matchAll(/function (\w+)\(([^)]*)\) \{\s*'worklet';/g)];
    expect(worklets.map(match => match[1]).sort()).toEqual(['wrappedDiff', 'wrappedIndex']);
    for (const [, , params] of worklets) expect(params).not.toContain('=');
    expect(SOURCE).not.toMatch(/zIndex/);
  });

  it('wraps every card into one signed distance band; exactly one card is centred at each step', () => {
    const { wrappedDiff, wrappedIndex, CARDS } = load();
    for (let active = 0; active < 12; active += 0.25) {
      const diffs = Array.from({ length: CARDS }, (_, index) => wrappedDiff(index, active, CARDS));
      for (const diff of diffs) { expect(diff).toBeGreaterThanOrEqual(-CARDS / 2); expect(diff).toBeLessThan(CARDS / 2); }
      if (Number.isInteger(active)) expect(diffs.filter(diff => Math.abs(diff) < 0.01)).toHaveLength(1);
      expect(wrappedIndex(active, CARDS)).toBeGreaterThanOrEqual(0); expect(wrappedIndex(active, CARDS)).toBeLessThan(CARDS);
    }
    expect(wrappedDiff(0, 1, CARDS)).toBe(-1); // advancing moves cards left, as in the reference
  });

  it('centre card full size; neighbours step down to 0.82 and recede; cards two steps out are invisible at rest', () => {
    const exports = load();
    const [centre, right, , , left] = cards(exports, render(exports).tree).map(card => card.props.style[1]);
    expect(centre.transform[2].scale).toBeCloseTo(1); expect(right.transform[2].scale).toBeCloseTo(0.82); expect(left.transform[2].scale).toBeCloseTo(0.82);
    expect(centre.opacity).toBe(1); expect(right.opacity).toBe(1);
    const far = cards(exports, render(exports).tree).map(card => card.props.style[1]).filter(style => Math.abs(style.transform[0].translateX) > 200);
    expect(far).toHaveLength(2); for (const style of far) expect(style.opacity).toBe(0);
  });

  it('keeps stepping beyond twenty seconds and stops only when the waiting presentation unmounts', () => {
    vi.useFakeTimers();
    const exports = load();
    const first = render(exports);
    vi.advanceTimersByTime(exports.HOLD_MS * 3);
    expect(springs().map(value => value.spring)).toEqual([1, 1, 1]);
    expect(springs()[0].config).toMatchObject({ damping: exports.STEP_SPRING.damping, stiffness: exports.STEP_SPRING.stiffness });
    vi.advanceTimersByTime(60_000);
    expect(springs()).toHaveLength(43);
    first.cleanups.forEach(cleanup => cleanup?.());
    const count = springs().length;
    vi.advanceTimersByTime(exports.HOLD_MS * 5);
    expect(springs()).toHaveLength(count);
    expect(appStateListeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses in the background and continues on return without starting a deadline', () => {
    vi.useFakeTimers();
    const exports = load();
    const first = render(exports);
    vi.advanceTimersByTime(exports.HOLD_MS);
    for (const listener of appStateListeners) listener('background');
    first.cleanups.forEach(cleanup => cleanup?.());
    const background = render(exports), count = springs().length;
    vi.advanceTimersByTime(60_000);
    expect(springs()).toHaveLength(count);
    for (const listener of appStateListeners) listener('active');
    expect(stateSlots[0]).toBe(true);
    background.cleanups.forEach(cleanup => cleanup?.());
    const resumed = render(exports);
    vi.advanceTimersByTime(exports.HOLD_MS);
    expect(springs()).toHaveLength(count + 1);
    resumed.cleanups.forEach(cleanup => cleanup?.());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('holds still under Reduce Motion', () => {
    vi.useFakeTimers();
    reduced = true;
    const exports = load();
    render(exports);
    vi.advanceTimersByTime(exports.HOLD_MS * 3);
    expect(shared.assigned.some(value => value?.spring !== undefined || value?.repeat !== undefined)).toBe(false);
  });

  it('is decorative to assistive tech; the screen states the D-003 status in text', () => {
    const { tree } = render(load());
    expect(tree.props.accessibilityElementsHidden).toBe(true);
    expect(tree.props.importantForAccessibility).toBe('no-hide-descendants');
  });

});

// @ts-expect-error -- Node-only component harness; native motion is checked on emulators.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SkillMatchTheme } from '@/constants/theme';

vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (value: any) => value.android ?? value.default } }));

// 2026-10-20 demo UI: the Worker's floating share-location control and its reference pulse.
type Props = Record<string, any>;
type Node = { type: string; props: Props };
const nodes = (tree: any): Node[] => !tree || typeof tree !== 'object' ? []
  : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const flat = (style: any): Props => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style ?? {};
let reduced = false;
let effects: (() => void)[] = [];
const assigned: any[] = [];

// Reanimated stand-in: animation builders return plain descriptions so the pulse program can be read back.
const reanimated: Props = {
  __esModule: true,
  default: { View: 'Animated.View' },
  Easing: { out: (curve: string) => `out(${curve})`, cubic: 'cubic' },
  Extrapolation: { CLAMP: 'clamp' },
  ReduceMotion: { Never: 'never' },
  cancelAnimation: () => {},
  interpolate: (value: number, input: number[], output: number[]) => ({ value, input, output }),
  useAnimatedStyle: (fn: () => Props) => fn(),
  useSharedValue: (initial: number) => ({ get: () => initial, set: (next: any) => assigned.push(next) }),
  withDelay: (ms: number, inner: any) => ({ delay: ms, inner }),
  withRepeat: (inner: any, times: number) => ({ repeat: times, inner }),
  withSequence: (...steps: any[]) => ({ sequence: steps }),
  withTiming: (toValue: number, config: Props) => ({ toValue, ...config }),
};
const exports: Props = {};
const source = ts.transpileModule(readFileSync('src/components/share-location-fab.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const modules: Props = {
  react: { useEffect: (fn: () => void) => { effects.push(fn); } },
  'react/jsx-runtime': { jsx: (type: string, props: Props) => ({ type, props }), jsxs: (type: string, props: Props) => ({ type, props }) },
  'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: (s: Props) => s } },
  'react-native-reanimated': reanimated,
  '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
  '@/components/motion': { MotionView: 'MotionView', usePressScale: () => ({ style: { press: true }, onPressIn: () => {}, onPressOut: () => {} }) },
  '@/components/refinement-theme': { useUiTheme: () => SkillMatchTheme.ui },
  '@/hooks/use-reduced-motion': { useReducedMotion: () => reduced },
};
new Function('require', 'exports', source)((name: string) => {
  if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
  return modules[name];
}, exports);

function render(mode: string) {
  effects = []; assigned.length = 0;
  const onPress = vi.fn();
  const tree = exports.ShareLocationFab({ mode, onPress, bottom: 120 });
  effects.forEach(effect => effect());
  const button = nodes(tree).find(node => node.type === 'Pressable')!;
  const program = assigned.find(value => typeof value === 'object' && value?.repeat !== undefined);
  return { tree, onPress, button, program };
}

beforeEach(() => { reduced = false; });

describe('ShareLocationFab', () => {
  it('names each state and runs the one handler it is given', () => {
    const ready = render('ready');
    expect(ready.button.props.accessibilityLabel).toBe('Share my location');
    expect(ready.button.props.disabled).toBe(false);
    ready.button.props.onPress();
    expect(ready.onPress).toHaveBeenCalledOnce();
    const live = render('live');
    expect(live.button.props.accessibilityLabel).toBe('Stop sharing location on this device');
    live.button.props.onPress();
    expect(live.onPress).toHaveBeenCalledOnce();
    expect(render('busy').button.props.accessibilityLabel).toBe('Cancel starting location sharing');
    expect(render('busy').button.props.accessibilityState).toMatchObject({ busy: true });
    const blocked = render('blocked');
    expect(blocked.button.props.disabled).toBe(true);
    expect(blocked.button.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('sits above the collapsed panel as a 56dp theme-accent target with press feedback', () => {
    const { tree, button } = render('ready');
    expect(flat(tree.props.style)).toMatchObject({ position: 'absolute', bottom: 120, right: SkillMatchTheme.ui.spacing.gutter });
    expect(flat(button.props.style)).toMatchObject({ width: 56, height: 56, backgroundColor: SkillMatchTheme.ui.colors.accent });
    expect(nodes(tree).find(node => node.type === 'MotionView')!.props.style).toEqual({ press: true });
  });

  it('pulses at the reference cadence: one ease-out ring, then ~5 s rest when ready and ~2 s while live', () => {
    const ready = render('ready').program;
    expect(ready.repeat).toBe(-1);
    const [grow, reset, rest] = ready.inner.sequence;
    expect(grow).toMatchObject({ delay: exports.SHARE_PULSE.leadMs, inner: { toValue: 1, duration: exports.SHARE_PULSE.ringMs, easing: 'out(cubic)' } });
    expect(reset).toMatchObject({ toValue: 0, duration: 0 });
    expect(rest).toMatchObject({ toValue: 0, duration: exports.SHARE_PULSE.readyRestMs });
    expect(render('live').program.inner.sequence[2].duration).toBe(exports.SHARE_PULSE.liveRestMs);
    const period = exports.SHARE_PULSE.leadMs + exports.SHARE_PULSE.ringMs + exports.SHARE_PULSE.readyRestMs;
    expect(period).toBeGreaterThanOrEqual(4800); expect(period).toBeLessThanOrEqual(5400);
  });

  it('expands the ring to ~1.7x and fades it out; the button itself never moves', () => {
    const { tree } = render('ready');
    const [halo, ring] = nodes(tree).filter(node => node.type === 'Animated.View').map(node => flat(node.props.style));
    expect(ring.transform[0].scale.output).toEqual([1, exports.SHARE_PULSE.ringScale]);
    expect(ring.opacity.output.at(-1)).toBe(0);
    expect(halo.opacity.output.at(-1)).toBe(0);
  });

  it('does not animate under Reduce Motion, while starting, or when blocked', () => {
    reduced = true;
    expect(render('ready').program).toBeUndefined();
    expect(render('live').program).toBeUndefined();
    reduced = false;
    expect(render('busy').program).toBeUndefined();
    expect(render('blocked').program).toBeUndefined();
  });
});

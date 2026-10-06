// @ts-expect-error -- Node-only static composition harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

/**
 * Motion system (M1/M2). Real source runs with inert framework seams: this proves tokens, the
 * reduced-motion contract, preset selection, reveal rules and call-site wiring. It does not prove
 * frame timing or native rendering; TesterArmy and on-device captures cover runtime.
 */
type Props = Record<string, any>;
type Element = { type: unknown; props: Props };
const source = (path: string): string => readFileSync(path, 'utf8');
const node = (type: unknown, props: Props): Element => ({ type, props });
function compile(path: string, seams: Record<string, Props>): Props {
  const exports: Props = {};
  const requireSeam = (id: string): Props => {
    if (id in seams) return seams[id];
    if (id === 'react/jsx-runtime') return { jsx: node, jsxs: node, Fragment: 'Fragment' };
    if (id === '@/constants/motion') return compile('src/constants/motion.ts', {});
    if (id === '@/constants/theme') return compile('src/constants/theme.ts', { 'react-native': { Platform: { OS: 'android', select: (x: Props) => x.android ?? x.default } } });
    if (id === '@/global.css') return {};
    throw new Error('Unapproved import: ' + id);
  };
  new Function('require', 'exports', ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(requireSeam, exports);
  return exports;
}
function all(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(all);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  return [value as Element, ...all((value as Element).props.children)];
}

const { MotionTokens, staggerDelay } = compile('src/constants/motion.ts', {});

describe('M1 motion tokens', () => {
  it('keep every duration inside the approved ranges and exits faster than entrances', () => {
    const d = MotionTokens.duration;
    expect(d.micro).toBeGreaterThanOrEqual(100); expect(d.micro).toBeLessThanOrEqual(160);
    for (const standard of [d.standard, d.large]) { expect(standard).toBeGreaterThanOrEqual(180); expect(standard).toBeLessThanOrEqual(240); }
    expect(d.emphasized).toBeGreaterThanOrEqual(260); expect(d.emphasized).toBeLessThanOrEqual(360);
    expect(d.exit).toBeLessThan(d.standard);
    expect(Math.max(...Object.values(d) as number[])).toBeLessThanOrEqual(360);
  });

  it('use three shared curves and small scale/distance changes', () => {
    expect(Object.keys(MotionTokens.easing)).toEqual(['standard', 'decelerate', 'accelerate']);
    for (const curve of Object.values(MotionTokens.easing) as number[][]) expect(curve).toHaveLength(4);
    expect(MotionTokens.scale.pressAction).toBeGreaterThanOrEqual(0.9);
    expect(MotionTokens.scale.reveal).toBeGreaterThanOrEqual(0.85);
    expect(MotionTokens.distance.enter).toBeLessThanOrEqual(12);
    expect(MotionTokens.distance.banner).toBeLessThanOrEqual(16);
  });

  it('cap the arrival cascade so the last staggered row starts within 150 ms', () => {
    expect([0, 1, 2, 5, 6, 40].map(staggerDelay)).toEqual([0, 30, 60, 150, 150, 150]);
    expect(staggerDelay(-3)).toBe(0);
    expect(staggerDelay(99) + MotionTokens.duration.standard).toBeLessThanOrEqual(360);
  });
});

describe('reduced-motion preference (central, live)', () => {
  function storeHarness() {
    let handler: (enabled: boolean) => void = () => undefined;
    let resolveQuery!: (enabled: boolean) => void;
    const source = {
      isReduceMotionEnabled: vi.fn(() => new Promise<boolean>((resolve) => { resolveQuery = resolve; })),
      addEventListener: vi.fn((_event: string, fn: (enabled: boolean) => void) => { handler = fn; return { remove: vi.fn() }; }),
    };
    const module = compile('src/hooks/use-reduced-motion.ts', {
      react: { useSyncExternalStore: vi.fn() },
      'react-native': { AccessibilityInfo: source },
      'react-native-reanimated': { useReducedMotion: () => false },
    });
    const store = module.createReducedMotionStore(source);
    return { store, source, emit: (v: boolean) => handler(v), answer: (v: boolean) => resolveQuery(v) };
  }
  const tick = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

  it('is unknown until Android answers, then follows the system query and notifies subscribers', async () => {
    const h = storeHarness();
    expect(h.store.get()).toBeNull();
    const listener = vi.fn();
    const unsubscribe = h.store.subscribe(listener);
    expect(h.source.addEventListener).toHaveBeenCalledWith('reduceMotionChanged', expect.any(Function));
    h.answer(true); await tick();
    expect(h.store.get()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    h.emit(false);
    expect(h.store.get()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('applies a live change while the app is open, and a late initial answer cannot undo it', async () => {
    const h = storeHarness();
    h.store.subscribe(() => undefined);
    h.store.subscribe(() => undefined);
    expect(h.source.addEventListener).toHaveBeenCalledTimes(1); // one app-lifetime listener
    h.emit(true);
    h.answer(false); await tick();
    expect(h.store.get()).toBe(true);
  });

  it('falls back to Reanimated\'s startup reading until the live answer arrives', () => {
    const source = { isReduceMotionEnabled: () => new Promise<boolean>(() => undefined), addEventListener: () => ({ remove: () => undefined }) };
    const module = compile('src/hooks/use-reduced-motion.ts', {
      react: { useSyncExternalStore: (_s: unknown, get: () => unknown) => get() },
      'react-native': { AccessibilityInfo: source },
      'react-native-reanimated': { useReducedMotion: () => true },
    });
    expect(module.useReducedMotion()).toBe(true);
  });
});

/** motion.tsx against a recording Reanimated seam. */
function motionModule(reduced: boolean) {
  const states: unknown[] = []; let cursor = 0; const effects: (() => unknown)[] = [];
  class Keyframe {
    durationMs = 0; delayMs = 0; reduce: unknown = 'System';
    constructor(public frames: Props) {}
    duration(ms: number) { this.durationMs = ms; return this; }
    delay(ms: number) { this.delayMs = ms; return this; }
    reduceMotion(mode: unknown) { this.reduce = mode; return this; }
  }
  const shared = { value: 1, set: vi.fn((v: unknown) => { shared.value = v as number; }), get: () => shared.value };
  const reanimated = {
    default: { View: 'Animated.View', FlatList: 'Animated.FlatList' },
    Easing: { bezier: (...points: number[]) => ({ bezier: points }) },
    Keyframe,
    LinearTransition: { duration: (ms: number) => ({ easing: (curve: unknown) => ({ reduceMotion: (reduce: unknown) => ({ transition: 'linear', ms, curve, reduce }) }) }) },
    ReduceMotion: { System: 'System', Always: 'Always', Never: 'Never' },
    useSharedValue: () => shared,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (to: number, config: Props) => ({ timing: to, config }),
  };
  const react = {
    useState: (initial: any) => { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (v: any) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; },
    useEffect: (fn: () => unknown) => { effects.push(fn); },
  };
  const module = compile('src/components/motion.tsx', {
    react, 'react-native-reanimated': reanimated,
    '@/hooks/use-reduced-motion': { useReducedMotion: () => reduced },
  });
  return { module, shared, states, effects, render: <T>(fn: () => T): T => { cursor = 0; effects.length = 0; return fn(); } };
}

describe('M2 motion primitives', () => {
  it('give every preset from tokens, and none at all under reduced motion', () => {
    const on = motionModule(false).module.useMotion();
    expect(on.reduced).toBe(false);
    expect(on.rowLayout).toEqual({ transition: 'linear', ms: 200, curve: { bezier: [0.2, 0, 0, 1] }, reduce: 'Never' });
    // The live preference is the only authority: presets never consult Reanimated's startup flag.
    for (const preset of [on.bannerEnter, on.bannerExit, on.fadeIn, on.successEnter]) expect(preset.reduce).toBe('Never');
    expect(on.bannerEnter.durationMs).toBe(200);
    expect(on.bannerEnter.frames[0]).toEqual({ opacity: 0, transform: [{ translateY: -12 }] });
    expect(on.bannerExit.durationMs).toBe(160);
    expect(on.fadeIn.frames[0]).toEqual({ opacity: 0 });
    expect(on.successEnter.durationMs).toBe(320);
    expect(on.successEnter.frames[0]).toEqual({ opacity: 0, transform: [{ scale: 0.88 }] });
    expect(on.successEnter.frames[100]).toMatchObject({ opacity: 1, transform: [{ scale: 1 }] });
    // Transform and opacity only: no layout properties are animated.
    for (const preset of [on.bannerEnter, on.bannerExit, on.fadeIn, on.successEnter]) {
      for (const frame of Object.values(preset.frames) as Props[]) for (const key of Object.keys(frame)) expect(['opacity', 'transform', 'easing']).toContain(key);
    }
    const off = motionModule(true).module.useMotion();
    expect(off).toEqual({ reduced: true, rowLayout: undefined, bannerEnter: undefined, bannerExit: undefined, fadeIn: undefined, successEnter: undefined });
  });

  it('press scale eases to 0.92 in 120 ms and back; reduced motion keeps the control at rest', () => {
    const on = motionModule(false);
    const press = on.module.usePressScale();
    expect(press.style).toEqual({ transform: [{ scale: 1 }] });
    press.onPressIn();
    expect(on.shared.set).toHaveBeenLastCalledWith({ timing: 0.92, config: { duration: 120, easing: { bezier: [0.2, 0, 0, 1] }, reduceMotion: 'Never' } });
    press.onPressOut();
    expect(on.shared.set).toHaveBeenLastCalledWith({ timing: 1, config: { duration: 120, easing: { bezier: [0.2, 0, 0, 1] }, reduceMotion: 'Never' } });
    const off = motionModule(true);
    const still = off.module.usePressScale();
    still.onPressIn(); still.onPressOut();
    expect(off.shared.set.mock.calls).toEqual([[1], [1]]);
  });

  it('marks only newly listed rows as arriving; a reorder or a scroll remount is not an arrival', () => {
    const { nextReveal } = motionModule(false).module;
    const empty = { key: '', seen: new Set<string>(), fresh: new Map() };
    const first = nextReveal(empty, ['a', 'b', 'c']);
    expect([...first.fresh]).toEqual([['a', 0], ['b', 1], ['c', 2]]);
    expect(nextReveal(first, ['c', 'a', 'b'])).toBe(first); // same set in a new order
    const live = nextReveal(first, ['a', 'z', 'b', 'c']);
    expect([...live.fresh]).toEqual([['z', 0]]); // a job arriving later starts at once
    const removed = nextReveal(live, ['a', 'c']);
    expect(removed.fresh.size).toBe(0);
  });

  it('reveals arriving rows once with a capped cascade, then stops; nothing under reduced motion', () => {
    const h = motionModule(false);
    const ids0: string[] = [];
    let enter = h.render(() => h.module.useListReveal(ids0));
    expect(enter('a')).toBeUndefined();
    enter = h.render(() => h.module.useListReveal(['a', 'b'])); // state adjusts during render
    enter = h.render(() => h.module.useListReveal(['a', 'b']));
    expect(enter('a').delayMs).toBe(0);
    expect(enter('b').delayMs).toBe(30);
    expect(enter('b').durationMs).toBe(200);
    expect(enter('b').frames[0]).toEqual({ opacity: 0, transform: [{ translateY: 8 }] });
    expect(enter('b').reduce).toBe('Never');
    // After the reveal window the same rows (e.g. remounted by scrolling) no longer animate.
    vi.useFakeTimers();
    for (const effect of h.effects) effect();
    vi.advanceTimersByTime(MotionTokens.revealWindow);
    vi.useRealTimers();
    enter = h.render(() => h.module.useListReveal(['a', 'b']));
    expect(enter('a')).toBeUndefined();
    expect(enter('b')).toBeUndefined();
    const off = motionModule(true);
    off.render(() => off.module.useListReveal([]));
    off.render(() => off.module.useListReveal(['a']));
    expect(off.render(() => off.module.useListReveal(['a']))('a')).toBeUndefined();
  });
});

describe('M2 call sites', () => {
  it('Client centre +: the press scale wraps the unchanged Post a job button and never runs at rest', () => {
    const theme = compile('src/constants/theme.ts', { 'react-native': { Platform: { OS: 'android', select: (x: Props) => x.android ?? x.default } } }).SkillMatchTheme.ui;
    const press = { style: { transform: [{ scale: 1 }] }, onPressIn: vi.fn(), onPressOut: vi.fn() };
    const { ClientTabBar } = compile('src/components/client-tab-bar.tsx', {
      'react-native': { Animated: { View: 'Animated.View' }, Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: (x: Props) => x } },
      'expo-router/react-navigation': { CommonActions: { navigate: vi.fn() } },
      '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
      '@/components/app-tab-bar': { TAB_ACTIVE_COLOR: theme.colors.accent, TAB_INACTIVE_COLOR: theme.colors.textMuted },
      '@/components/motion': { MotionView: 'MotionView', usePressScale: () => press },
    });
    const routes = ['a', 'b', 'c', 'd'].map((name) => ({ key: name, name }));
    const descriptors = Object.fromEntries(routes.map((r) => [r.key, { options: { title: r.name } }]));
    const tree = ClientTabBar({ state: { key: 's', index: 0, routes }, descriptors, navigation: { emit: () => ({}), dispatch: vi.fn() }, insets: { bottom: 0, left: 0, right: 0 }, onPostJob: vi.fn(), postDisabled: false, posting: false });
    const wrapper = all(tree).find((n) => n.type === 'MotionView')!;
    expect(wrapper.props.style).toBe(press.style);
    const action = all(wrapper).find((n) => n.props.accessibilityLabel === 'Post a job')!;
    expect(action.type).toBe('Pressable');
    expect(action.props.onPressIn).toBe(press.onPressIn);
    expect(action.props.onPressOut).toBe(press.onPressOut);
    expect(action.props.accessibilityRole).toBe('button');
    expect(source('src/components/client-tab-bar.tsx')).not.toMatch(/withRepeat|setInterval|loop/);
  });

  it('AppButton: an Android ripple bounded to the control, derived from the variant\'s own colours', () => {
    const theme = compile('src/constants/theme.ts', { 'react-native': { Platform: { OS: 'android', select: (x: Props) => x.android ?? x.default } } }).SkillMatchTheme.ui;
    const { AppButton, rippleColor } = compile('src/components/app-button.tsx', {
      'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', StyleSheet: { create: (x: Props) => x }, Text: 'Text' },
      '@/components/refinement-theme': { useUiTheme: () => theme },
      'expo-symbols': {},
      '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
    });
    for (const variant of ['primary', 'secondary', 'ghost', 'destructive', 'compact', 'inverse']) {
      const button = AppButton({ label: 'Go', variant, onPress: vi.fn() });
      expect(button.props.android_ripple).toEqual({ color: rippleColor(theme, variant), borderless: false, foreground: true });
      expect(button.props.accessibilityState).toEqual({ disabled: false, busy: false });
    }
    expect(rippleColor(theme, 'primary')).toBe('#FFFFFF33');
    expect(rippleColor(theme, 'destructive')).toBe(`${theme.colors.error}24`);
    expect(rippleColor(theme, 'secondary')).toBe(`${theme.colors.accent}24`);
  });

  it('message banner: enters and exits through the shared presets without changing its controls', () => {
    const host = source('src/components/incoming-message-banner-host.tsx');
    expect(host).toContain('<MotionView entering={motion.bannerEnter} exiting={motion.bannerExit}');
    expect(host).toContain('accessibilityLabel="Dismiss new message"');
    expect(host).toContain('accessibilityLiveRegion="polite"');
  });

  it('job accepted: one decorative check reveal before the unchanged status words and action', () => {
    const details = source('src/components/job-opportunity-details.tsx');
    const accepted = details.slice(details.indexOf('if (accepted) {'), details.indexOf('if (isLoading) {'));
    expect(accepted).toContain('entering={motion.successEnter}');
    expect(accepted).toMatch(/accessible=\{false\} importantForAccessibility="no-hide-descendants"/);
    expect(accepted.indexOf('MotionView')).toBeLessThan(accepted.indexOf('<InlineStatus'));
    expect(accepted).toContain('label="View bookings"');
  });

  it('keeps authored motion out of payment, errors, suspension, moderation, security and verification surfaces', () => {
    const excluded = [
      'src/components/booking-payment.tsx', 'src/components/form-message.tsx', 'src/components/state-screen.tsx',
      'src/components/report-form.tsx', 'src/components/my-report-details.tsx', 'src/components/identity-review-queue.tsx',
      'src/components/booking-lifecycle.tsx', 'src/components/app-dialog.tsx', 'src/components/auth-screen.tsx',
      'src/app/blocked.tsx', 'src/app/bootstrap-error.tsx', 'src/app/(auth)/verify-identity.tsx',
      'src/app/(admin)/admin/report-details.tsx', 'src/app/(admin)/admin/verification-details.tsx',
    ];
    for (const file of excluded) expect(source(file), file).not.toMatch(/@\/components\/motion|react-native-reanimated/);
    // M6: the mascot is never placed on these surfaces either (mascot.test.ts holds the allowlist).
    for (const file of excluded) expect(source(file), file).not.toMatch(/@\/components\/skillmatch-mascot/);
    // Only the motion module talks to Reanimated directly.
    expect(source('src/components/motion.tsx')).toContain("from 'react-native-reanimated'");
  });
});

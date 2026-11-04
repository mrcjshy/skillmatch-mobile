import { act, createElement, Fragment, useId, useLayoutEffect } from 'react';
// @ts-expect-error -- Node-only static composition harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LaunchOverlay } from './launch-overlay';
import { LAUNCH_BACKGROUND, LAUNCH_MASCOT_OFFSET_Y, LAUNCH_MASCOT_SIZE } from '@/lib/launch-splash';

/**
 * The launch overlay: lifecycle with the real component and React (native views, motion and Itik
 * are recording seams), its Reanimated motion against a recording seam, and the root layout wiring.
 * Frame timing, the native splash hand-off and image decoding are device checks, not proven here.
 */
type Props = Record<string, any>;
const h = vi.hoisted(() => ({ nodes: new Map<string, Props>(), reduced: false, motion: [] as boolean[] }));

vi.mock('react-native', () => {
  function Host({ kind, children, ...props }: Props) {
    const id = useId();
    useLayoutEffect(() => { h.nodes.set(id, { kind, children, ...props }); return () => { h.nodes.delete(id); }; });
    // Text keeps its string as a recorded prop: no DOM text node is created.
    return kind === 'Text' ? null : createElement(Fragment, null, children);
  }
  const host = (kind: string) => function NativeHost(props: Props) { return createElement(Host, { ...props, kind }); };
  return {
    View: host('View'), Text: host('Text'),
    StyleSheet: { create: (styles: Props) => styles, absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } },
    Platform: { OS: 'android', select: (choices: Props) => choices.android ?? choices.default },
  };
});
vi.mock('@/components/motion', async () => {
  const { createElement: create } = await import('react');
  const { View } = await import('react-native');
  return {
    MotionView: (props: Props) => create(View as any, { ...props, motion: true }),
    useLaunchMotion: (leaving: boolean) => {
      h.motion.push(leaving);
      return { reduced: h.reduced, cover: { animated: 'cover' }, wordmark: { animated: 'wordmark' } };
    },
  };
});
vi.mock('@/components/skillmatch-mascot', async () => {
  const { createElement: create } = await import('react');
  const { View } = await import('react-native');
  return { SkillMatchMascot: (props: Props) => create(View as any, { ...props, duck: true }) };
});

const flat = (style: unknown): Props => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : (style as Props) ?? {};
const nodes = () => [...h.nodes.values()];
const cover = () => nodes().find((node) => node.motion && node.accessible === false);
const duck = () => nodes().find((node) => node.duck);

let root: { render(node: unknown): void; unmount(): void } | null = null;
async function mount(booting: boolean) {
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const moduleName: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ moduleName);
  root = renderer.createRoot(container);
  await act(async () => root!.render(createElement(LaunchOverlay, { booting })));
  return {
    boot: (next: boolean) => act(() => root!.render(createElement(LaunchOverlay, { booting: next }))),
    advance: (ms: number) => act(() => { vi.advanceTimersByTime(ms); }),
  };
}
const leaving = () => cover()?.pointerEvents === 'none';

beforeEach(() => { h.nodes.clear(); h.reduced = false; h.motion = []; vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('LaunchOverlay: the first frame is the native splash', () => {
  it('covers the window on the app canvas with Itik hello at the splash size and place', async () => {
    await mount(true);
    expect(flat(cover()!.style)).toMatchObject({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: LAUNCH_BACKGROUND, animated: 'cover' });
    expect(cover()!.pointerEvents).toBe('auto');
    expect(duck()).toMatchObject({ expression: 'hello', size: LAUNCH_MASCOT_SIZE });
    // Itik plays with its own defaults: the overlay never pauses or hides him (no opacity gate).
    expect(duck()!.active).toBeUndefined();
    const stage = nodes().find((node) => node.kind === 'View' && !node.motion && !node.duck)!;
    expect(flat(stage.style)).toMatchObject({
      position: 'absolute', top: '50%', left: '50%', width: LAUNCH_MASCOT_SIZE, height: LAUNCH_MASCOT_SIZE,
      marginTop: LAUNCH_MASCOT_OFFSET_Y - LAUNCH_MASCOT_SIZE / 2, marginLeft: -LAUNCH_MASCOT_SIZE / 2,
    });
    expect(flat(stage.style).opacity).toBeUndefined();
  });

  it('brings the cobalt SkillMatch wordmark in under Itik through the shared motion', async () => {
    await mount(true);
    const text = nodes().find((node) => node.kind === 'Text')!;
    expect(text.children).toBe('SkillMatch');
    expect(flat(text.style)).toMatchObject({ fontSize: 28, fontWeight: '500', color: '#1C3AA6' });
    expect(text.allowFontScaling).toBeUndefined();
    expect(text.maxFontSizeMultiplier).toBeUndefined();
    const word = nodes().find((node) => node.motion && node.accessible === undefined)!;
    expect(flat(word.style)).toMatchObject({ position: 'absolute', top: '50%', animated: 'wordmark' });
    expect(flat(word.style).marginTop).toBeGreaterThan(LAUNCH_MASCOT_SIZE / 2 + LAUNCH_MASCOT_OFFSET_Y);
  });

  it('is hidden from screen readers so the loading state beneath stays announced', async () => {
    await mount(true);
    expect(cover()).toMatchObject({ accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
    expect(nodes().some((node) => node.accessibilityLabel || node.accessibilityRole)).toBe(false);
  });
});

describe('LaunchOverlay lifecycle', () => {
  it('minimum: a fast boot still shows the hello for 1.3 s, then fades 250 ms and unmounts', async () => {
    const app = await mount(true);
    await app.advance(200);
    await app.boot(false);
    await app.advance(1099);
    expect(leaving()).toBe(false);
    expect(h.motion.at(-1)).toBe(false);
    await app.advance(1);
    expect(leaving()).toBe(true);
    expect(h.motion.at(-1)).toBe(true);
    await app.advance(249);
    expect(cover()).toBeDefined();
    await app.advance(1);
    expect(nodes()).toEqual([]);
  });

  it('ready: after the minimum it leaves the moment the boot state is ready', async () => {
    const app = await mount(true);
    await app.advance(2500);
    expect(leaving()).toBe(false);
    await app.boot(false);
    expect(leaving()).toBe(true);
    await app.advance(250);
    expect(nodes()).toEqual([]);
  });

  it('cap: leaves at 4 s even while the boot state is still loading', async () => {
    const app = await mount(true);
    await app.advance(3999);
    expect(leaving()).toBe(false);
    await app.advance(1);
    expect(leaving()).toBe(true);
    await app.advance(250);
    expect(nodes()).toEqual([]);
  });

  it('never takes touches or comes back once leaving, even if loading returns', async () => {
    const app = await mount(false);
    await app.advance(1300);
    expect(leaving()).toBe(true);
    await app.boot(true);
    expect(cover()!.pointerEvents).toBe('none');
    await app.advance(250);
    expect(nodes()).toEqual([]);
    await app.advance(5000);
    expect(nodes()).toEqual([]);
  });

  it('reduced motion: no minimum, and a quick fade once ready', async () => {
    h.reduced = true;
    const app = await mount(true);
    await app.advance(400);
    expect(leaving()).toBe(false);
    await app.boot(false);
    expect(leaving()).toBe(true);
    await app.advance(119);
    expect(cover()).toBeDefined();
    await app.advance(1);
    expect(nodes()).toEqual([]);
  });

  it('reduced motion with a ready app fades from the first frame', async () => {
    h.reduced = true;
    const app = await mount(false);
    expect(leaving()).toBe(true);
    await app.advance(120);
    expect(nodes()).toEqual([]);
  });
});

/** Real TSX with explicit seams: any new import throws. */
function compile(path: string, seams: Props): Props {
  const exports: Props = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)((id: string) => {
    if (id in seams) return seams[id];
    throw new Error('Unexpected import: ' + id);
  }, exports);
  return exports;
}
const element = (type: unknown, props: Props) => ({ type, props });

describe('useLaunchMotion', () => {
  function harness(reduced: boolean) {
    const values: { value: number; set: (next: unknown) => void; get: () => number; history: unknown[] }[] = [];
    let effects: (() => unknown)[] = [];
    // Module-level presets in motion.tsx build Keyframes and a layout transition on load.
    const chain: any = new Proxy(function () {}, { get: () => () => chain, construct: () => chain });
    const reanimated = {
      default: { View: 'Animated.View', FlatList: 'Animated.FlatList' },
      Keyframe: chain, LinearTransition: chain,
      Easing: { bezier: (...points: number[]) => ({ bezier: points }) },
      ReduceMotion: { System: 'System', Always: 'Always', Never: 'Never' },
      cancelAnimation: vi.fn(),
      useSharedValue: (initial: number) => {
        const shared = { value: initial, history: [] as unknown[], get: () => shared.value, set: (next: unknown) => { shared.history.push(next); if (typeof next === 'number') shared.value = next; } };
        values.push(shared);
        return shared;
      },
      useAnimatedStyle: (worklet: () => Props) => worklet,
      withTiming: (to: number, config: Props) => ({ timing: to, config }),
      withDelay: (ms: number, animation: unknown, reduce: unknown) => ({ delay: ms, animation, reduce }),
    };
    const motion = compile('src/components/motion.tsx', {
      react: { useEffect: (effect: () => unknown) => { effects.push(effect); }, useState: (initial: unknown) => [initial, () => {}] },
      'react-native-reanimated': reanimated,
      '@/constants/motion': compile('src/constants/motion.ts', {}),
      '@/lib/mascot-motion': compile('src/lib/mascot-motion.ts', {}),
      '@/hooks/use-reduced-motion': { useReducedMotion: () => reduced },
    });
    const render = (leaving: boolean) => {
      values.length = 0; effects = [];
      const result = motion.useLaunchMotion(leaving);
      effects.forEach((effect) => effect());
      const [word, leave] = values;
      return { ...result, word, leave };
    };
    return { render };
  }

  it('raises the wordmark once after a short delay, then fades and grows the cover on leaving', () => {
    const { render } = harness(false);
    const showing = render(false);
    expect(showing.reduced).toBe(false);
    expect(showing.word.history).toEqual([{ delay: 300, reduce: 'Never', animation: { timing: 1, config: expect.objectContaining({ duration: 320, reduceMotion: 'Never' }) } }]);
    expect(showing.leave.history).toEqual([]);
    showing.word.value = 0;
    expect(showing.wordmark()).toEqual({ opacity: 0, transform: [{ translateY: 8 }] });
    expect(showing.cover()).toEqual({ opacity: 1, transform: [{ scale: 1 }] });
    const gone = render(true);
    expect(gone.leave.history).toEqual([{ timing: 1, config: expect.objectContaining({ duration: 250, easing: { bezier: [0.3, 0, 0.8, 0.15] } }) }]);
    gone.leave.value = 1;
    expect(gone.cover()).toEqual({ opacity: 0, transform: [{ scale: 1.04 }] });
  });

  it('under reduced motion shows the wordmark at rest and only fades the cover, quickly', () => {
    const { render } = harness(true);
    const showing = render(false);
    expect(showing.reduced).toBe(true);
    expect(showing.word.history).toEqual([1]);
    expect(showing.wordmark()).toEqual({ opacity: 1, transform: [{ translateY: 0 }] });
    const gone = render(true);
    expect(gone.leave.history).toEqual([{ timing: 1, config: expect.objectContaining({ duration: 120 }) }]);
    gone.leave.value = 1;
    expect(gone.cover()).toEqual({ opacity: 0, transform: [{ scale: 1 }] });
  });

  it('is finite: no repeat, no worklet with default parameters', () => {
    const source = readFileSync('src/components/motion.tsx', 'utf8');
    const hook = source.slice(source.indexOf('export function useLaunchMotion'), source.indexOf('/** The strength of one dot'));
    expect(hook).not.toMatch(/withRepeat|Infinity/);
    expect(hook).not.toMatch(/\(\s*\w+\s*=\s*[^)]*\)\s*=>/);
    expect(readFileSync('src/components/launch-overlay.tsx', 'utf8')).not.toMatch(/withRepeat|'worklet'|ActivityIndicator|elevation|allowFontScaling|maxFontSizeMultiplier/);
  });
});

describe('root layout wiring', () => {
  const session = { session: { user: { id: 'worker-user' } }, isSessionLoading: false, sessionError: null, recoveryStatus: 'idle' };
  const account = { account: { id: 'worker-user', role: 'worker', is_active: true }, status: 'resolved', accountError: null, hasCurrentConsent: true, workerOnboardingState: 'verified' };
  function layout(sessionValue: Props, accountValue: Props, profileGate?: string) {
    const Stack = Object.assign('Stack', { Screen: 'Stack.Screen', Protected: 'Stack.Protected' });
    return compile('src/app/_layout.tsx', {
      react: { useLayoutEffect: () => {}, useMemo: (fn: () => unknown) => fn() },
      'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
      'expo-router': { Stack, useGlobalSearchParams: () => ({}), usePathname: () => '/', useRootNavigationState: () => undefined },
      tamagui: { TamaguiProvider: 'TamaguiProvider' },
      '../../tamagui.config': { tamaguiConfig: {} },
      '@/components/push-notification-inbox-intent': { PushNotificationInboxIntent: 'PushNotificationInboxIntent' },
      '@/components/incoming-message-banner-host': { IncomingMessageBannerHost: 'IncomingMessageBannerHost' },
      '@/components/incoming-call-host': { IncomingCallHost: 'IncomingCallHost' },
      '@/components/launch-overlay': { LaunchOverlay: 'LaunchOverlay' },
      '@/components/location-stop-host': { LocationStopHost: 'LocationStopHost' },
      '@/components/session-reconnecting-screen': { SessionReconnectingScreen: 'SessionReconnectingScreen' },
      '@/components/state-screen': { StateScreen: 'StateScreen' },
      '@/lib/auth-recovery': { isRecoverySurfaceActive: (status: string) => status === 'active' },
      '@/lib/phone-verification': { isPhoneOtpEnabled: () => false },
      '@/lib/session-route-continuation': { sessionRouteContinuation: { observe: () => {}, clear: () => {} }, stackFromNavigationState: () => [] },
      '@/lib/worker-onboarding': { canEnterWorkerApp: (state: string) => state === 'verified' },
      '@/providers/account-provider': { AccountProvider: 'AccountProvider', useAccount: () => accountValue },
      '@/providers/profile-gate-provider': { ProfileGateProvider: 'ProfileGateProvider', useProfileGate: () => ({ profileGate, refreshProfileGate: async () => undefined }) },
      '@/providers/session-provider': { SessionProvider: 'SessionProvider', useSession: () => sessionValue },
    });
  }
  const all = (node: any): any[] => Array.isArray(node) ? node.flatMap(all) : node?.props ? [node, ...all(node.props.children)] : [];
  function overlayFor(sessionValue: Props, accountValue: Props, profileGate?: string) {
    const root = layout(sessionValue, accountValue, profileGate);
    const tamagui = all(root.default()).find((node) => node.type === 'TamaguiProvider');
    const children = [tamagui.props.children].flat();
    return { root, children, rendered: children.at(-1).type({}) };
  }

  it('renders one overlay, after the navigator and every host, so it draws above everything', () => {
    const { children, rendered } = overlayFor({ ...session, isSessionLoading: true }, account);
    expect(children.map((child) => typeof child.type === 'function' ? child.type.name : child.type)).toEqual([
      'PushNotificationInboxIntent', 'RootNavigator', 'IncomingMessageBannerHost', 'IncomingCallHost', 'LocationStopHost', 'RootLaunchOverlay',
    ]);
    expect(rendered).toEqual({ type: 'LaunchOverlay', props: { booting: true } });
    const source = readFileSync('src/app/_layout.tsx', 'utf8');
    expect(source.match(/<RootLaunchOverlay \/>/g)).toHaveLength(1);
    expect(source.match(/<LaunchOverlay /g)).toHaveLength(1);
  });

  it.each([
    ['session restoring', { ...session, isSessionLoading: true }, account, undefined, true],
    ['account pending', session, { ...account, status: 'pending' }, undefined, true],
    ['profile step still loading', session, account, 'loading', true],
    ['signed out', { ...session, session: null }, account, undefined, false],
    ['auth unreachable (reconnecting)', { ...session, session: null, isSessionReconnecting: true }, account, undefined, false],
    ['session error', { ...session, session: null, sessionError: 'unavailable' }, account, undefined, false],
    ['worker ready', session, account, 'complete', false],
    ['blocked', session, { ...account, account: { ...account.account, is_active: false } }, undefined, false],
  ])('%s: booting is %s', (_label, sessionValue, accountValue, profileGate, booting) => {
    expect(overlayFor(sessionValue, accountValue, profileGate).rendered.props.booting).toBe(booting);
  });

  it('waits through exactly the two loading states the inline StateScreen covers', () => {
    const { root } = overlayFor(session, account);
    const states = ['session-restoring', 'session-reconnecting', 'session-error', 'signed-out', 'password-recovery', 'account-pending', 'needs-phone-verification', 'blocked', 'needs-consent', 'needs-profile', 'worker-identity', 'worker', 'client', 'administrator', 'account-failure'];
    expect(states.filter(root.isLaunchBooting)).toEqual(['session-restoring', 'account-pending']);
  });
});

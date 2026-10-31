import { act, createElement, Fragment } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SwipeConfirmation, type SwipeConfirmationProps } from './swipe-confirmation';

const native = vi.hoisted(() => ({ nodes: [] as any[], gestures: [] as any[], alerts: [] as any[], queued: [] as (() => void)[] }));
vi.mock('@/components/app-symbol', () => ({ AppSymbol: () => null }));
vi.mock('react-native', () => ({
  View: (props: any) => { native.nodes.push(props); return createElement(Fragment, null, props.children); },
  Text: () => null, StyleSheet: { create: (style: any) => style },
  Alert: { alert: (...args: any[]) => native.alerts.push(args) },
}));
vi.mock('@/components/refinement-theme', () => ({ useUiTheme: () => ({ colors: {}, type: {} }) }));
vi.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => native.queued.push(fn) }));
vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react');
  const rn = await import('react-native');
  return { default: { View: rn.View }, useSharedValue: (initial: any) => {
    const value = useRef(initial);
    return useRef({ get: () => value.current, set: (next: any) => { value.current = next; } }).current;
  }, useAnimatedStyle: (fn: () => any) => fn(), cancelAnimation() {}, ReduceMotion: { System: 'system', Never: 'never' }, Extrapolation: { CLAMP: 'clamp' }, Easing: { bezier: () => 'curve' }, interpolate: () => 1, withTiming: (value: number) => value, withDelay: (_ms: number, value: any) => value, withSequence: (...steps: any[]) => steps.at(-1), withRepeat: (value: any) => value, withSpring: (value: number) => value };
});
vi.mock('react-native-gesture-handler', async () => {
  const rn = await import('react-native');
  return { GestureHandlerRootView: rn.View, GestureDetector: ({ children }: any) => children, Gesture: { Pan: () => {
    const handlers: any = {}; native.gestures.push(handlers);
    const builder = new Proxy({}, { get: (_target, name) => (value: any) => { handlers[name] = value; return builder; } });
    return builder;
  } } };
});

let root: { render(node: unknown): void; unmount(): void } | null = null;
beforeEach(() => { native.nodes = []; native.gestures = []; native.alerts = []; native.queued = []; });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = null; vi.unstubAllGlobals(); });
async function mount() {
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const moduleName: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ moduleName);
  root = renderer.createRoot(container);
  const onConfirm = vi.fn();
  const props: SwipeConfirmationProps = { label: 'Swipe to Confirm Arrival', confirmationTitle: 'Confirm arrival?', confirmationMessage: 'Only at the job site.', disabled: false, resetKey: 'arrival', onConfirm };
  const render = async (changes: Partial<SwipeConfirmationProps> = {}) => {
    Object.assign(props, changes);
    await act(async () => root?.render(createElement(SwipeConfirmation, { ...props })));
    native.nodes.findLast(n => n.onLayout).onLayout({ nativeEvent: { layout: { width: 344, height: 72 } } });
  };
  await render();
  return { onConfirm, render };
}
function openConfirmation() {
  native.nodes.findLast(n => n.onAccessibilityAction).onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
  return native.alerts.at(-1)[2][1].onPress;
}
function release(gesture = native.gestures.at(-1)) {
  gesture.onStart(); gesture.onUpdate({ translationX: 272 }); gesture.onEnd({ velocityX: 0 }, true); gesture.onFinalize();
}
async function drain() { const queued = native.queued.splice(0); await act(async () => { queued.forEach(fn => fn()); }); }

it('an open screen-reader confirmation cannot submit after the action becomes disabled', async () => {
  const h = await mount(); const oldConfirm = openConfirmation();
  await h.render({ disabled: true });
  await act(async () => oldConfirm());
  expect(h.onConfirm).not.toHaveBeenCalled();
});
it('re-enabling does not revive an earlier screen-reader confirmation', async () => {
  const h = await mount(); const oldConfirm = openConfirmation();
  await h.render({ disabled: true }); await h.render({ disabled: false });
  await act(async () => oldConfirm());
  expect(h.onConfirm).not.toHaveBeenCalled();
  await act(async () => openConfirmation()());
  expect(h.onConfirm).toHaveBeenCalledTimes(1);
});
it('replacing the action callback retires an already open confirmation', async () => {
  const h = await mount(); const oldConfirm = openConfirmation(); const replacement = vi.fn();
  await h.render({ onConfirm: replacement });
  await act(async () => oldConfirm());
  expect(h.onConfirm).not.toHaveBeenCalled(); expect(replacement).not.toHaveBeenCalled();
  await act(async () => openConfirmation()());
  expect(replacement).toHaveBeenCalledTimes(1);
});
it('changing the action key retires a queued release and leaves the new action usable', async () => {
  const h = await mount(); release(); expect(native.queued).toHaveLength(1);
  await h.render({ resetKey: 'service-completion' }); await drain();
  expect(h.onConfirm).not.toHaveBeenCalled();
  release(); await drain(); expect(h.onConfirm).toHaveBeenCalledTimes(1);
});
it('a release queued before disable/re-enable cannot commit when it finally reaches JS', async () => {
  const h = await mount(); release();
  await h.render({ disabled: true }); await h.render({ disabled: false }); await drain();
  expect(h.onConfirm).not.toHaveBeenCalled();
  release(); await drain(); expect(h.onConfirm).toHaveBeenCalledTimes(1);
});
it('a native handler retained before disabling cannot submit or strand the re-enabled action', async () => {
  const h = await mount(); const oldGesture = native.gestures.at(-1);
  await h.render({ disabled: true }); release(oldGesture); await drain();
  expect(h.onConfirm).not.toHaveBeenCalled();
  await h.render({ disabled: false }); release(); await drain();
  expect(h.onConfirm).toHaveBeenCalledTimes(1);
});
it('unmount retires both a queued release and an open explicit confirmation', async () => {
  const h = await mount(); const oldConfirm = openConfirmation(); release();
  await act(async () => root?.unmount()); root = null;
  await drain(); await act(async () => oldConfirm());
  expect(h.onConfirm).not.toHaveBeenCalled();
});

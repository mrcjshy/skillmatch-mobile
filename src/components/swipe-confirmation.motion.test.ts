import { act, createElement, Fragment } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SwipeConfirmation } from './swipe-confirmation';

const native = vi.hoisted(() => ({
  nodes: [] as any[], gestures: [] as any[], styles: [] as (() => any)[], repeats: [] as any[], icons: [] as any[], cancelled: 0, reduced: false,
}));

vi.mock('react-native', () => {
  const host = (name: string) => function Host(props: any) { native.nodes.push({ name, ...props }); return typeof props.children === 'string' ? null : createElement(Fragment, null, props.children); };
  return { View: host('View'), Text: host('Text'), StyleSheet: { create: (s: any) => s, absoluteFill: {} }, Alert: { alert: () => {} } };
});
vi.mock('@/components/refinement-theme', () => ({ useUiTheme: () => ({ colors: { accent: '#accent', accentSubtle: '#subtle', onAccent: '#on', surfaceSunken: '#sunken', textPrimary: '#ink', controlBorder: '#border' }, type: { button: {} } }) }));
vi.mock('@/components/app-symbol', () => ({ AppSymbol: (props: any) => { native.icons.push(props); return null; } }));
vi.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => native.reduced }));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));
vi.mock('react-native-reanimated', async () => {
  const rn = await import('react-native');
  return {
    default: { View: rn.View }, ReduceMotion: { System: 'system', Never: 'never' }, Extrapolation: { CLAMP: 'clamp' }, Easing: { bezier: () => 'curve' },
    useSharedValue: (initial: any) => { let value = initial; return { get: () => value, set: (next: any) => { value = next; } }; },
    useAnimatedStyle: (fn: () => any) => { native.styles.push(fn); return fn(); }, cancelAnimation: () => { native.cancelled++; },
    interpolate: (value: number, [fromA, fromB]: number[], [toA, toB]: number[]) => {
      if (fromB === fromA) return toB;
      const t = Math.min(1, Math.max(0, (value - fromA) / (fromB - fromA)));
      return toA + (toB - toA) * t;
    },
    withSpring: (value: number) => value, withTiming: (value: number) => value, withDelay: (_ms: number, value: any) => value,
    withSequence: (...steps: any[]) => steps.at(-1), withRepeat: (value: any, reps: number) => { native.repeats.push(reps); return value; },
  };
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
async function mount(disabled = false) {
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const moduleName: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ moduleName);
  root = renderer.createRoot(container);
  const element = createElement(SwipeConfirmation, { label: 'Swipe to Confirm Arrival', confirmationTitle: 'Confirm?', confirmationMessage: 'Sure?', disabled, resetKey: 'one', onConfirm() {} });
  await act(async () => root!.render(element));
  await act(async () => native.nodes.find(node => node.onLayout).onLayout({ nativeEvent: { layout: { width: 372, height: 72 } } }));
  return native.gestures.at(-1);
}
const latest = () => native.styles.slice(-5).map(style => style());
const flat = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style ?? {};

beforeEach(() => { native.nodes = []; native.gestures = []; native.styles = []; native.repeats = []; native.icons = []; native.cancelled = 0; native.reduced = false; });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; vi.unstubAllGlobals(); });

it('invites the drag with a bounded lean of the thumb, then rests', async () => {
  await mount();
  expect(native.repeats).toEqual([2]);
});

it('holds still under reduced motion and while the control is disabled', async () => {
  native.reduced = true; await mount();
  expect(native.repeats).toEqual([]);
  await act(async () => root!.unmount()); root = null; native.reduced = false; native.repeats = [];
  await mount(true);
  expect(native.repeats).toEqual([]);
});

it('stops inviting the moment a finger lands', async () => {
  const gesture = await mount();
  const before = native.cancelled;
  gesture.onStart();
  expect(native.cancelled).toBeGreaterThan(before);
});

it('draws the arrow as an icon, not a text glyph, and shows no check until it commits', async () => {
  await mount();
  expect(native.nodes.some(node => node.name === 'Text' && node.children === '→')).toBe(false);
  expect(native.icons.map(icon => icon.name.android).sort()).toEqual(['arrow_forward', 'check']);
});

it('the track fills behind the thumb and the words fade as the thumb covers them', async () => {
  const gesture = await mount();
  const atRest = latest();
  gesture.onStart(); gesture.onUpdate({ translationX: 150 });
  const halfway = latest();
  gesture.onUpdate({ translationX: 300 });
  const atEnd = latest();
  const fillOffset = (styles: any[]) => styles.flatMap(style => style.transform ?? []).map((step: any) => step.translateX).filter((value: any) => value !== undefined && value <= 0);
  expect(Math.min(...fillOffset(atRest))).toBe(-300);
  expect(Math.min(...fillOffset(halfway))).toBe(-150);
  expect(Math.max(...fillOffset(atEnd))).toBe(0);
  const label = (styles: any[]) => styles.map(style => style.opacity).find((value: any) => value !== undefined);
  expect(label(atRest)).toBe(1);
  expect(label(atEnd)).toBe(0);
});

it('keeps the progress words readable after committing, while the check replaces the arrow', async () => {
  const gesture = await mount();
  gesture.onStart(); gesture.onUpdate({ translationX: 300 }); gesture.onEnd({ velocityX: 0 }, true); gesture.onFinalize();
  const styles = latest();
  const opacities = styles.map(style => style.opacity).filter((value: any) => value !== undefined);
  expect(opacities).toContain(1);
  expect(flat(native.nodes.filter(node => node.onLayout).at(-1)?.style).overflow).toBe('hidden');
});

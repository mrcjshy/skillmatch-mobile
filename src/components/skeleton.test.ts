import { act, createElement, Fragment } from 'react';
// @ts-expect-error -- Node-only source guard.
import { readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-expect-error -- Node-only source guard.
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InlineStatus } from './inline-status';
import { PulseDots, Skeleton } from './skeleton';

const native = vi.hoisted(() => ({ nodes: [] as any[], repeats: [] as any[], reduced: false, cancelled: 0 }));

vi.mock('react-native', () => {
  const host = (name: string) => function Host(props: any) { native.nodes.push({ name, ...props }); return createElement(Fragment, null, props.children); };
  return { View: host('View'), Text: host('Text'), StyleSheet: { create: (s: any) => s, hairlineWidth: 1 } };
});
vi.mock('@/components/refinement-theme', () => ({ useUiTheme: () => ({
  colors: new Proxy({}, { get: (_t, name) => `#${String(name)}` }), type: { helper: {}, screenTitle: {} },
  spacing: { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, gutter: 20, xl: 24 }, radius: { sm: 8, control: 12, card: 16, pill: 999 }, size: {},
}) }));
vi.mock('@/components/app-symbol', () => ({ AppSymbol: () => null }));
vi.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => native.reduced }));
vi.mock('react-native-reanimated', () => {
  const chain: any = new Proxy(function () {}, { get: () => () => chain, construct: () => chain });
  return {
    default: { View: (props: any) => { native.nodes.push({ name: 'MotionView', ...props }); return createElement(Fragment, null, props.children); }, FlatList: () => null },
    Easing: { bezier: () => 'curve', linear: 'linear' }, Keyframe: chain, LinearTransition: chain, ReduceMotion: { Never: 'never' },
    cancelAnimation: () => { native.cancelled++; }, useAnimatedStyle: (fn: () => any) => fn(),
    useSharedValue: (initial: any) => { let value = initial; return { get: () => value, set: (next: any) => { value = next; } }; },
    withTiming: (to: number) => to,
    withRepeat: (animation: any, reps: number, reverse: boolean) => { native.repeats.push({ reps, reverse }); return animation; },
  };
});

let root: { render(node: unknown): void; unmount(): void } | null = null;
async function mount(element: unknown) {
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const moduleName: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ moduleName);
  root = renderer.createRoot(container);
  await act(async () => root!.render(element));
}
beforeEach(() => { native.nodes = []; native.repeats = []; native.reduced = false; native.cancelled = 0; });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; vi.unstubAllGlobals(); });

const shapes = ['lines', 'line', 'rows', 'jobs', 'bookings', 'detail', 'chat', 'fill'] as const;

it.each(shapes)('%s placeholder is one announced busy region whose bones screen readers skip', async (shape) => {
  await mount(createElement(Skeleton, { shape, label: 'Loading your jobs…' }));
  const region = native.nodes.find(node => node.accessibilityRole === 'progressbar');
  expect(region).toMatchObject({ accessible: true, accessibilityLabel: 'Loading your jobs…', accessibilityState: { busy: true }, accessibilityLiveRegion: 'polite' });
  expect(native.nodes.some(node => node.importantForAccessibility === 'no-hide-descendants')).toBe(true);
  expect(native.nodes.filter(node => node.name === 'Text')).toHaveLength(0);
});

it('breathes a bounded number of times and comes back to rest, so automation and the battery can idle', async () => {
  await mount(createElement(Skeleton, { label: 'Loading' }));
  expect(native.repeats).toHaveLength(1);
  const { reps, reverse } = native.repeats[0];
  expect(Number.isFinite(reps) && reps > 0).toBe(true);
  expect(reverse).toBe(true); expect(reps % 2).toBe(0); // An even count of reversed legs ends fully visible.
});

it('shows a still placeholder under reduced motion', async () => {
  native.reduced = true;
  await mount(createElement(Skeleton, { label: 'Loading' }));
  expect(native.repeats).toHaveLength(0);
  expect(native.nodes.some(node => node.accessibilityRole === 'progressbar')).toBe(true);
});

it('stops the pulse when the content arrives', async () => {
  await mount(createElement(Skeleton, { label: 'Loading' }));
  await act(async () => root!.unmount()); root = null;
  expect(native.cancelled).toBeGreaterThan(0);
});

it('InlineStatus loading renders the requested skeleton and keeps its message for screen readers only', async () => {
  await mount(createElement(InlineStatus, { variant: 'loading', message: 'Loading booking…', skeleton: 'detail' }));
  expect(native.nodes.find(node => node.accessibilityRole === 'progressbar').accessibilityLabel).toBe('Loading booking…');
  expect(native.nodes.filter(node => node.name === 'Text')).toHaveLength(0);
});

it('button-sized waits use three bounded dots', async () => {
  await mount(createElement(PulseDots, { color: '#fff' }));
  expect(native.nodes.filter(node => node.name === 'MotionView')).toHaveLength(3);
  expect(native.repeats).toHaveLength(1);
  expect(Number.isFinite(native.repeats[0].reps)).toBe(true);
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sources(file);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

it('no production screen draws a spinner: pull-to-refresh is the only circle left, and it is the system gesture', () => {
  const offenders = sources('src').filter(file => readFileSync(file, 'utf8').includes('ActivityIndicator'));
  expect(offenders).toEqual([]);
});

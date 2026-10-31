import { act, createElement, Fragment } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JobSchedulePicker } from './job-schedule-picker';

const native = vi.hoisted(() => ({ nodes: [] as any[], sheet: null as any }));

vi.mock('react-native', () => {
  const host = (name: string) => function Host(props: any) {
    native.nodes.push({ name, ...props });
    const children = typeof props.children === 'function' ? props.children({ pressed: false }) : props.children;
    return typeof children === 'string' || typeof children === 'number' ? null : createElement(Fragment, null, children);
  };
  return { View: host('View'), Text: host('Text'), Pressable: host('Pressable'), ScrollView: host('ScrollView'), StyleSheet: { create: (s: any) => s, hairlineWidth: 1 }, Platform: { OS: 'android', select: (value: any) => value.android ?? value.default } };
});
vi.mock('@/components/app-symbol', () => ({ AppSymbol: () => null }));
vi.mock('@/components/app-icon-button', () => ({ AppIconButton: (props: any) => { native.nodes.push({ name: 'IconButton', ...props }); return null; } }));
vi.mock('@/components/app-segment', () => ({ AppSegment: (props: any) => { native.nodes.push({ name: 'Segment', ...props }); return null; } }));
vi.mock('@/components/app-sheet', () => ({ AppSheet: (props: any) => { native.sheet = props; return props.visible ? createElement(Fragment, null, props.children) : null; } }));
vi.mock('@/components/motion', () => ({ MotionView: (props: any) => createElement(Fragment, null, props.children), useMotion: () => ({ fadeIn: undefined }) }));

const NOW = new Date(2026, 9, 30, 19, 10);
let root: { render(node: unknown): void; unmount(): void } | null = null;
let render: (extra?: Record<string, unknown>) => Promise<void>;
const changes = { date: [] as (Date | null)[], time: [] as (Date | null)[] };

async function mount(props: Record<string, unknown> = {}) {
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const moduleName: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ moduleName);
  root = renderer.createRoot(container);
  render = async (extra = {}) => {
    native.nodes = [];
    await act(async () => root!.render(createElement(JobSchedulePicker, {
      date: null, time: null, onChangeDate: (date: Date) => changes.date.push(date), onChangeTime: (time: Date | null) => changes.time.push(time), ...props, ...extra,
    })));
  };
  await render();
}
const named = (label: string | RegExp) => native.nodes.filter(node => node.name === 'Pressable' && (typeof label === 'string' ? node.accessibilityLabel === label : label.test(node.accessibilityLabel ?? '')));
const press = async (label: string | RegExp) => { const [node] = named(label); expect(node, String(label)).toBeTruthy(); await act(async () => node.onPress()); };

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); native.nodes = []; native.sheet = null; changes.date = []; changes.time = []; });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = null; vi.useRealTimers(); vi.unstubAllGlobals(); });

it('opens on a date strip led by Today and Tomorrow, one radio per day', async () => {
  await mount();
  expect(named(/^Today, /)).toHaveLength(1);
  expect(named(/^Tomorrow, /)).toHaveLength(1);
  expect(named(/^Today, /)[0]).toMatchObject({ accessibilityRole: 'radio', accessibilityState: { selected: false, disabled: false } });
  expect(native.nodes.some(node => node.accessibilityRole === 'radiogroup' && node.accessibilityLabel === 'Date')).toBe(true);
  expect(native.nodes.find(node => node.name === 'ScrollView')?.horizontal).toBe(true);
});

it('a Client can book today: choosing it offers the times still ahead', async () => {
  await mount();
  await press(/^Today, /);
  expect(changes.date).toHaveLength(1);
  expect(changes.date[0]?.getDate()).toBe(30);
  await render({ date: new Date(2026, 9, 30) });
  const times = named(/^\d{1,2}:\d{2}/).map(node => node.accessibilityLabel);
  expect(times[0]).toMatch(/^8:00/);
  expect(times.some(label => /^7:30/.test(label))).toBe(false);
});

it('shows no times until a date is chosen', async () => {
  await mount();
  expect(named(/^\d{1,2}:\d{2}/)).toHaveLength(0);
  expect(native.nodes.some(node => node.name === 'Segment')).toBe(false);
});

it('opens a chosen day on the first period with times, and switches periods', async () => {
  await mount({ date: new Date(2026, 9, 31) });
  const segment = () => native.nodes.filter(node => node.name === 'Segment').at(-1);
  expect(segment().value).toBe('morning');
  const choose = segment().onChange; native.nodes = [];
  await act(async () => choose('afternoon'));
  expect(segment().value).toBe('afternoon');
  expect(named(/^\d{1,2}:\d{2}/)[0].accessibilityLabel).toMatch(/^12:00/);
});

it('reports the chosen slot on the chosen day and marks it selected', async () => {
  await mount({ date: new Date(2026, 9, 31) });
  await press(/^9:30/);
  expect(changes.time[0]?.getHours()).toBe(9); expect(changes.time[0]?.getMinutes()).toBe(30);
  await render({ date: new Date(2026, 9, 31), time: new Date(2026, 9, 31, 9, 30) });
  expect(named(/^9:30/)[0].accessibilityState.selected).toBe(true);
  expect(native.nodes.find(node => node.name === 'Segment').value).toBe('morning');
});

it('keeps a chosen time that still fits, and clears one the new day cannot offer', async () => {
  await mount({ date: new Date(2026, 9, 31), time: new Date(2026, 9, 31, 21, 0) });
  await press(/^Today, /);
  expect(changes.time).toEqual([]);
  await render({ date: new Date(2026, 9, 31), time: new Date(2026, 9, 31, 8, 0) });
  await press(/^Today, /);
  expect(changes.time).toEqual([null]);
});

it('closes today once nothing is left, and says so instead of offering a past time', async () => {
  vi.setSystemTime(new Date(2026, 9, 30, 23, 15));
  await mount();
  expect(named(/^Today, /)[0].accessibilityState.disabled).toBe(true);
});

it('finds a later date in the month calendar, which never offers a past day', async () => {
  await mount();
  await press('More dates');
  expect(native.sheet.visible).toBe(true);
  expect(named(/^October 29/)[0].accessibilityState.disabled).toBe(true);
  expect(named(/^October 31/)[0].accessibilityState.disabled).toBe(false);
  await press(/^October 31/);
  expect(changes.date[0]?.getDate()).toBe(31);
  expect(native.sheet.visible).toBe(false);
});

it('moves through months but not before the current one', async () => {
  await mount();
  await press('More dates');
  const previous = () => native.nodes.filter(node => node.name === 'IconButton' && node.accessibilityLabel === 'Previous month').at(-1);
  const next = () => native.nodes.filter(node => node.name === 'IconButton' && node.accessibilityLabel === 'Next month').at(-1);
  expect(previous().disabled).toBe(true);
  await act(async () => next().onPress());
  expect(named(/^November 15/)).toHaveLength(1);
  expect(previous().disabled).toBe(false);
});

it('shows a far date on the last pill so the choice stays visible', async () => {
  await mount({ date: new Date(2026, 11, 20) });
  expect(named('More dates')).toHaveLength(0);
  const far = named(/^Change date, /)[0];
  expect(far.accessibilityState.selected).toBe(true);
});

it('locks every choice while posting', async () => {
  await mount({ date: new Date(2026, 9, 31), disabled: true });
  for (const node of native.nodes.filter(item => item.name === 'Pressable')) expect(node.disabled).toBe(true);
  expect(native.nodes.find(node => node.name === 'Segment').disabled).toBe(true);
});

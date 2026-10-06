// @ts-expect-error -- Node-only inert TSX harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createClientPostJobDraftOwner } from '@/providers/client-post-job-draft-provider';
import { createClientHomeBookingFocus } from './client-home-booking-focus';
import { formatCardDateTime } from './date-time';
import type { BroadcastChannelLike, BroadcastClientLike } from './realtime';
vi.mock('./supabase', () => ({ supabase: {} }));
type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
const node = (type: unknown, props: Props): Element => ({ type, props });
const noop = () => {};
const read = (path: string): string => readFileSync(path, 'utf8');
function load(path: string, seams: Record<string, Props>): Props {
  const raw = read(path); const exports = {};
  const requireSeam = (id: string): Props => {
    if (seams[id]) return seams[id];
    if (id === '@/global.css') return {};
    if (id === 'react/jsx-runtime') return { jsx: node, jsxs: node, Fragment: 'Fragment' };
    if (id === '@/constants/theme') return load('src/constants/theme.ts', seams);
    if (id.startsWith('@/components/')) {
      const names = [...raw.matchAll(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g)].filter(m => m[2] === id).flatMap(m => m[1].split(',').map(n => n.trim()).filter(n => !n.startsWith('type ')));
      return Object.fromEntries(names.map(n => [n, n]));
    }
    throw new Error('Missing inert seam: ' + id);
  };
  new Function('require', 'exports', ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(requireSeam, exports);
  return exports;
}
function descendants(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(descendants);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const element = value as Element; return [element, ...descendants(element.props.children)];
}
type FocusRow = { job_id: string; booking_id: string; booking_status: 'confirmed' };
function setup(options: { owner?: ReturnType<typeof createClientPostJobDraftOwner>; jobs?: Props[]; bookings?: Props[]; loading?: boolean; error?: string; readBookings?: () => Promise<FocusRow[]> } = {}) {
  const owner = options.owner ?? createClientPostJobDraftOwner('client-a');
  const push = vi.fn(), loadBookings = options.readBookings ?? vi.fn(async () => []);
  const cleanupListeners: (() => void)[] = []; let emit = noop;
  const channel: BroadcastChannelLike = { on(_type, _filter, fn) { emit = fn; return channel; }, subscribe() { return channel; } };
  const client: BroadcastClientLike = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => 'ok') };
  let focused!: () => (() => void) | undefined;
  const state = options.bookings ?? [];
  const seams: Record<string, Props> = {
    react: { useState: (initial: unknown) => [Array.isArray(initial) ? state : typeof initial === 'function' ? initial() : initial, noop], useRef: (initial: unknown) => ({ current: initial }), useCallback: (fn: unknown) => fn },
    'react-native': { ...Object.fromEntries(['Text','View','ScrollView','KeyboardAvoidingView','Modal','Pressable','TextInput'].map(n => [n,n])), StyleSheet: { create: (value: unknown) => value }, Platform: { OS: 'android', select: (choices: Props) => choices.default } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-router': { useRouter: () => ({ push }), useFocusEffect: (fn: typeof focused) => { focused = fn; } },
    '@/providers/account-provider': { useAccount: () => ({ account: { id: 'client-a', full_name: 'Alex Example' } }) },
    '@/providers/client-jobs-provider': { useClientJobs: () => ({ jobs: options.jobs ?? [], skills: [], isLoading: options.loading ?? false, loadError: options.error ?? null, refresh: noop }) },
    '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => owner },
    '@/lib/booking-records': { loadClientBookings: loadBookings },
    '@/lib/client-home-booking-focus': { createClientHomeBookingFocus: (args: Parameters<typeof createClientHomeBookingFocus>[0]) => createClientHomeBookingFocus({ ...args, client }) },
    '@/lib/home-greeting': { homeGreeting: () => 'Good morning' }, '@/lib/initials': { firstNameFromFullName: () => 'Alex' },
    '@/lib/date-time': { formatCardDateTime },
    '@/lib/job-location': { COPY: {}, initialJobPin: null }, '@/lib/job-photos': {}, '@/lib/job-payment': {},
    '@/lib/job-posting-schedule': {}, '@/lib/post-job-wizard': {}, '@/lib/recent-locations': {},
  };
  const screen = load('src/app/(client)/(tabs)/client/index.tsx', seams).default as () => Element;
  return { owner, push, client, loadBookings, render: () => screen(), focus: () => { const cleanup = focused(); if (cleanup) cleanupListeners.push(cleanup); return cleanup; }, blur: () => cleanupListeners.pop()?.(), emit: () => emit() };
}
const buttons = (tree: Element) => descendants(tree).filter(e => e.type === 'AppButton');
describe('Client Home extracted posting entry', () => {
  it('opens dedicated Post Job using a push and has no embedded posting form', () => {
    const s = setup(); const tree = s.render();
    const post = buttons(tree).find(e => e.props.label === 'Post Job');
    expect(post).toBeDefined();
    (post!.props.onPress as () => void)();
    expect(s.push).toHaveBeenCalledExactlyOnceWith('/client/post-job');
    expect(descendants(tree).some(e => e.type === 'JobPhotoPicker' || e.type === 'AppField')).toBe(false);
  });
  it.each([false, true])('keeps Post Job available with active booking=%s and preserves booking actions', active => {
    const s = setup({ bookings: active ? [{ booking_status: 'confirmed', booking_id: 'booking-a' }] : [] });
    const tree = s.render(); const post = buttons(tree).find(e => e.props.label === 'Post Job')!;
    expect(post.props.variant).toBe(active ? 'secondary' : 'primary'); expect(post.props.disabled).toBe(false);
    const card = descendants(tree).find(e => e.type === 'ActiveBookingHomeCard')!;
    (card.props.onPressPrimary as (row: Props) => void)({ booking_id: 'booking-a' });
    expect(s.push).toHaveBeenLastCalledWith({ pathname: '/client/booking-details', params: { bookingId: 'booking-a' } });
    (card.props.onPressViewAll as () => void)(); expect(s.push).toHaveBeenLastCalledWith('/client/bookings');
  });
  it.each(['loading', 'error', 'busy'] as const)('preserves %s posting eligibility without adding an active-booking prohibition', status => {
    const owner = createClientPostJobDraftOwner('client-a');
    if (status === 'busy') { owner.updateDraft({ wizardStep: 4 }); owner.beginPost(); }
    const s = setup({ owner, loading: status === 'loading', error: status === 'error' ? 'Read failed' : undefined });
    const tree = s.render(); const post = buttons(tree).find(e => e.props.label === 'Post Job')!;
    expect(post.props.disabled).toBe(true); (post.props.onPress as () => void)(); expect(s.push).not.toHaveBeenCalled();
    if (status !== 'busy') expect(descendants(tree).some(e => e.type === 'InlineStatus' && e.props.variant === status)).toBe(true);
  });
  it('shows the first three provider jobs in their existing order, the open count, dates and amounts without new reads', () => {
    const jobs = ['First long job title that wraps', 'Second', 'Third', 'Fourth hidden'].map((title, index) => ({ id: String(index), title, status: index === 1 ? 'completed' : 'open', scheduled_at: index ? null : '2030-02-04T03:30:00Z', budget: index ? null : 1500 }));
    const s = setup({ jobs }); const tree = s.render();
    const values = descendants(tree).filter(e => e.type === 'Text').map(e => e.props.children);
    expect(values).toContain(jobs[0].title); expect(values).toContain('Second'); expect(values).toContain('Third'); expect(values).not.toContain('Fourth hidden');
    expect(values).toContainEqual([3, ' open jobs']);
    expect(values).toContain(formatCardDateTime('2030-02-04T03:30:00Z'));
    expect(values).toContainEqual(['Budget: ', '\u20b1' + (1500).toLocaleString()]);
    expect(s.loadBookings).not.toHaveBeenCalled();
    for (const [label, path] of [['My Jobs', '/client/jobs'], ['Help', '/client/help']]) {
      (buttons(tree).find(e => e.props.label === label)!.props.onPress as () => void)(); expect(s.push).toHaveBeenLastCalledWith(path);
    }
  });
});

function settleCreated(owner: ReturnType<typeof createClientPostJobDraftOwner>, id: string) {
  owner.updateDraft({ wizardStep: 4 }); const operation = owner.beginPost()!;
  owner.recordCreatedJob(operation, id); owner.settlePost(operation, { success: 'Job posted.', error: null }); owner.finishPost(operation);
}
async function settleMicrotasks() { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); }
describe('real Home focus and memory-only draft handoff', () => {
  it('preserves handoff during suspension and consumes it once only on freshly authorized Home focus', async () => {
    let authorized = true;
    const owner = createClientPostJobDraftOwner('client-a', undefined, () => authorized, () => true);
    settleCreated(owner, 'job-a'); authorized = false;
    const readBookings = vi.fn(async (): Promise<FocusRow[]> => [{ job_id: 'job-a', booking_id: 'booking-a', booking_status: 'confirmed' }]);
    const s = setup({ owner, readBookings }); s.render(); s.focus();
    expect(readBookings).not.toHaveBeenCalled(); expect(s.client.channel).not.toHaveBeenCalled(); expect(owner.takePendingCreatedJob()).toBeNull();
    authorized = true; s.render(); s.focus(); await settleMicrotasks();
    expect(s.push).toHaveBeenCalledTimes(1); expect(readBookings).toHaveBeenCalledTimes(1); expect(owner.takePendingCreatedJob()).toBeNull();
    s.blur(); s.focus(); await settleMicrotasks(); expect(s.push).toHaveBeenCalledTimes(1); expect(s.client.channel).toHaveBeenCalledTimes(1);
  });
  it('consumes only the latest pending created job and pushes accepted Booking Details once on the next focus', async () => {
    const owner = createClientPostJobDraftOwner('client-a');
    settleCreated(owner, 'older-job'); settleCreated(owner, 'job-a');
    const s = setup({ owner, readBookings: vi.fn(async (): Promise<FocusRow[]> => [{ job_id: 'job-a', booking_id: 'booking-a', booking_status: 'confirmed' }]) });
    s.render(); expect(s.client.channel).not.toHaveBeenCalled(); s.focus();
    expect(owner.takePendingCreatedJob()).toBeNull();
    await settleMicrotasks();
    expect(s.client.channel).toHaveBeenCalledExactlyOnceWith('user:client-a:notifications', { config: { private: true } });
    expect(s.push).toHaveBeenCalledExactlyOnceWith({ pathname: '/client/booking-details', params: { bookingId: 'booking-a' } });
    s.emit(); await settleMicrotasks(); expect(s.push).toHaveBeenCalledTimes(1);
    s.blur(); s.focus(); await settleMicrotasks(); expect(s.client.channel).toHaveBeenCalledTimes(1);
  });
  it('blur cancels an in-flight consumed wait and later focus never rearms it', async () => {
    let resolve!: (value: FocusRow[]) => void;
    const pending = new Promise<FocusRow[]>(done => { resolve = done; });
    const owner = createClientPostJobDraftOwner('client-a'); settleCreated(owner, 'job-a');
    const readBookings = vi.fn(() => pending);
    const s = setup({ owner, readBookings }); s.render(); s.focus(); s.blur();
    resolve([{ job_id: 'job-a', booking_id: 'booking-a', booking_status: 'confirmed' }]); await settleMicrotasks();
    expect(s.push).not.toHaveBeenCalled(); expect(s.client.removeChannel).toHaveBeenCalledTimes(1);
    s.focus(); await settleMicrotasks(); expect(s.client.channel).toHaveBeenCalledTimes(1); expect(s.push).not.toHaveBeenCalled();
  });
  it('unauthorized Home never consumes a pending job or starts a read/channel', () => {
    let authorized = true; const owner = createClientPostJobDraftOwner('client-a', undefined, () => authorized);
    settleCreated(owner, 'job-a'); authorized = false;
    const s = setup({ owner }); s.render(); s.focus();
    expect(s.client.channel).not.toHaveBeenCalled(); expect(s.loadBookings).not.toHaveBeenCalled(); expect(s.push).not.toHaveBeenCalled();
  });
});

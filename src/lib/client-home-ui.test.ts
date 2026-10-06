// @ts-expect-error -- Node-only inert TSX harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createClientPostJobDraftOwner } from '@/providers/client-post-job-draft-provider';
import { createClientHomeBookingFocus } from './client-home-booking-focus';
import type { BroadcastChannelLike, BroadcastClientLike } from './realtime';
vi.mock('./supabase', () => ({ supabase: {} }));
type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
const node = (type: unknown, props: Props): Element => typeof type === 'function' ? type(props) : ({ type, props });
const noop = () => {};
const read = (path: string): string => readFileSync(path, 'utf8');
function load(path: string, seams: Record<string, Props>): Props {
  const raw = read(path); const exports = {};
  const requireSeam = (id: string): Props => {
    if (id === '@/components/refinement-theme') return { useUiTheme: () => (load('src/constants/theme.ts', seams).SkillMatchTheme as { ui: unknown }).ui, RefinementThemeProvider: ({ children }: Props) => children };
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
    'expo-symbols': { SymbolView: 'SymbolView' },
    '@/components/app-symbol': { AppSymbol: 'SymbolView' },
    '@/providers/account-provider': { useAccount: () => ({ account: { id: 'client-a', full_name: 'Alex Example' } }) },
    '@/providers/client-jobs-provider': { useClientJobs: () => ({ jobs: options.jobs ?? [], skills: [], isLoading: options.loading ?? false, loadError: options.error ?? null, refresh: noop }) },
    '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => owner },
    '@/lib/booking-records': { loadClientBookings: loadBookings },
    '@/lib/client-home-booking-focus': { createClientHomeBookingFocus: (args: Parameters<typeof createClientHomeBookingFocus>[0]) => createClientHomeBookingFocus({ ...args, client }) },
    '@/lib/home-greeting': { homeGreeting: () => 'Good morning' }, '@/lib/initials': { firstNameFromFullName: () => 'Alex' },
    '@/lib/date-time': { formatCardDateTime: (value: string | null) => value ? 'Jan 2, 12:15 PM' : null },
    '@/lib/job-location': { COPY: {}, initialJobPin: null }, '@/lib/job-photos': {}, '@/lib/job-payment': {},
    '@/lib/job-posting-schedule': {}, '@/lib/post-job-wizard': {}, '@/lib/recent-locations': {},
  };
  const screen = load('src/app/(client)/(tabs)/client/index.tsx', seams).default as () => Element;
  return { owner, push, client, loadBookings, render: () => screen(), focus: () => { const cleanup = focused(); if (cleanup) cleanupListeners.push(cleanup); return cleanup; }, blur: () => cleanupListeners.pop()?.(), emit: () => emit() };
}
const buttons = (tree: Element) => descendants(tree).filter(e => e.type === 'AppButton');
/**
 * Wave 7: Post a job is the Client bottom bar's central action. These drive the real tab layout and
 * its `tabBar` callback with the same jobs owner and draft memory the former Home button used.
 */
function postAction(options: { owner?: ReturnType<typeof createClientPostJobDraftOwner>; loading?: boolean; error?: string } = {}) {
  const owner = options.owner ?? createClientPostJobDraftOwner('client-a');
  const push = vi.fn();
  const seams: Record<string, Props> = {
    'expo-router': { useRouter: () => ({ push }), Tabs: Object.assign('Tabs', { Screen: 'Tabs.Screen' }) },
    'react-native': { StyleSheet: { create: (value: unknown) => value }, Platform: { OS: 'android', select: (choices: Props) => choices.default } },
    '@/components/app-tab-bar': { TabIcon: 'TabIcon', TabLabel: 'TabLabel', useAppTabScreenOptions: () => ({}) },
    '@/providers/client-jobs-provider': { useClientJobs: () => ({ isLoading: options.loading ?? false, loadError: options.error ?? null }) },
    '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => owner },
  };
  const layout = (load('src/app/(client)/(tabs)/_layout.tsx', seams).default as () => Element)();
  const bar = (layout.props.tabBar as (props: Props) => Element)({ state: {}, descriptors: {}, navigation: {}, insets: {} });
  return { push, bar };
}
describe('Client Post a job entry (Wave 7: central bar action)', () => {
  it('the bar action opens the dedicated Post Job flow with a push; Home has no posting button or form', () => {
    const { push, bar } = postAction();
    expect(bar.type).toBe('ClientTabBar');
    expect(bar.props).toMatchObject({ postDisabled: false, posting: false });
    (bar.props.onPostJob as () => void)();
    expect(push).toHaveBeenCalledExactlyOnceWith('/client/post-job');
    const tree = setup().render();
    expect(buttons(tree)).toHaveLength(0);
    expect(descendants(tree).some(e => e.type === 'JobPhotoPicker' || e.type === 'AppField')).toBe(false);
  });
  it.each([false, true])('keeps Post Job available with active booking=%s and preserves booking actions', active => {
    expect(postAction().bar.props.postDisabled).toBe(false);
    const s = setup({ bookings: active ? [{ booking_status: 'confirmed', booking_id: 'booking-a' }] : [] });
    const tree = s.render();
    const card = descendants(tree).find(e => e.type === 'ActiveBookingHomeCard')!;
    (card.props.onPressPrimary as (row: Props) => void)({ booking_id: 'booking-a' });
    expect(s.push).toHaveBeenLastCalledWith({ pathname: '/client/booking-details', params: { bookingId: 'booking-a' } });
    expect(card.props.compact).toBe(true);
    (card.props.onPressViewAll as () => void)();
    expect(s.push).toHaveBeenLastCalledWith({ pathname: '/client/bookings', params: { segment: 'active' } });
  });
  it.each(['loading', 'error', 'busy'] as const)('preserves %s posting eligibility without adding an active-booking prohibition', status => {
    const owner = createClientPostJobDraftOwner('client-a');
    if (status === 'busy') { owner.updateDraft({ wizardStep: 4 }); owner.beginPost(); }
    const { push, bar } = postAction({ owner, loading: status === 'loading', error: status === 'error' ? 'Read failed' : undefined });
    expect(bar.props.postDisabled).toBe(true);
    expect(bar.props.posting).toBe(status === 'busy');
    (bar.props.onPostJob as () => void)(); expect(push).not.toHaveBeenCalled();
    const tree = setup({ owner, loading: status === 'loading', error: status === 'error' ? 'Read failed' : undefined }).render();
    if (status !== 'busy') expect(descendants(tree).some(e => e.type === 'InlineStatus' && e.props.variant === status)).toBe(true);
  });
  it('lists every job awaiting a worker as its own row on Home, keeps history in My Jobs and needs no modal', () => {
    const jobs = ['First', 'Completed history', 'Third', 'Fourth'].map((title,index) => ({id:String(index),title,status:index === 1 ? 'completed' : 'open',scheduled_at:'2099-01-02T04:15:00Z',budget:index === 0 ? 1500 : null,skills:index === 0 ? ['First','Second skill'] : [title]}));
    const s=setup({jobs}), tree=s.render();
    const values=descendants(tree).filter(e=>e.type === 'Text').map(e=>e.props.children);
    for(const job of jobs) expect(values.includes(job.title)).toBe(job.status === 'open');
    expect(descendants(tree).filter(e=>e.type === 'AppListRow')).toHaveLength(0);
    expect(descendants(tree).some(e=>e.type === 'Modal' || e.type === 'AppSheet' || e.type === 'AppDialog')).toBe(false);
    const rows=descendants(tree).filter(e=>e.type === 'Pressable');
    expect(rows.map(e=>String(e.props.accessibilityLabel).split(',')[0])).toEqual(['First','Third','Fourth']);
    expect(descendants(tree).filter(e=>e.type === 'AppChip').map(e=>e.props.label)).toEqual(['Waiting for worker','Waiting for worker','Waiting for worker']);
    // A row shows the extra required skills and the budget only when the job has them.
    expect(values).toContain('First, Second skill'); expect(values).toContain('\u20b11,500'); expect(values).not.toContain('Third, Third');
    const header=descendants(tree).find(e=>e.type === 'SectionHeader')!;
    expect(header.props.title).toBe('Awaiting workers');
    expect(s.loadBookings).not.toHaveBeenCalled();
    (rows[1].props.onPress as () => void)(); expect(s.push).toHaveBeenLastCalledWith({ pathname: '/client/job-details', params: { jobId: '2' } });
  });
  it('shows a plain empty state instead of a count row when nothing is waiting', () => {
    const s=setup({jobs:[{id:'done',title:'Completed history',status:'completed',scheduled_at:null,budget:null,skills:[]}]}), tree=s.render();
    expect(descendants(tree).filter(e=>e.type === 'Pressable')).toHaveLength(0);
    expect(descendants(tree).find(e=>e.type === 'InlineStatus')!.props).toMatchObject({ variant: 'empty', message: 'No jobs are waiting for a worker.' });
  });
  it('keeps the name and the only notification bell in the sticky header above the scroll area, with no Post a job button', () => {
    const s=setup(), tree=s.render();
    const header=descendants(tree).find(e=>e.type === 'HomeStickyHeader')!;
    expect(header.props).toMatchObject({ name: 'Alex', role: 'client' });
    expect(descendants(header).filter(e=>e.type === 'AppButton')).toHaveLength(0);
    const scroll=descendants(tree).find(e=>e.type === 'ScrollView')!;
    expect(descendants(scroll).some(e=>e.type === 'HomeStickyHeader' || e.props.label === 'Post a job')).toBe(false);
    expect(descendants(tree).some(e=>e.type === 'NotificationBell')).toBe(false);
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

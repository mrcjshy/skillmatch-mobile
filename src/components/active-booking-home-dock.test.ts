// @ts-expect-error -- Node-only prop/lifetime harness, not native layout evidence.
// UI-V3 (owner, 2026-10-20): the dock no longer expands an intermediate "Active booking" sheet; a tap or a swipe up
// opens the booking's map-first Booking details directly.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { SkillMatchTheme } from '@/constants/theme';
import * as bookingText from '@/lib/bookings';
import * as dates from '@/lib/date-time';
import { createHomeBookingSheet } from '@/lib/home-booking-sheet';
vi.mock('react-native', () => ({ Platform: { OS: 'web', select: (v: any) => v.default } }));

type Props = Record<string, any>;
const nodes = (tree: any): any[] => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = (tree: any): string => tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join(' ') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);
const booking = { booking_id: 'b', job_id: 'j', booking_status: 'confirmed', payment_status: 'pending', booked_at: '2026-10-08T10:00:00Z', completed_at: null,
  job_title: 'Plumbing service', job_description: '', job_scheduled_at: '2026-10-09T10:00:00Z', job_address: 'BROAD ROW ADDRESS MUST NOT BE USED', job_barangay: null, job_city: null, job_budget: 500,
  client_user_id: 'client', client_full_name: 'Client Person', client_phone: 'private phone', worker_user_id: 'worker', worker_full_name: 'Worker Person' };
const location = { jobId: 'j', pin: { latitude: 14.5444514123456, longitude: 121.0720506789123 }, address: 'Authorized address', barangay: 'Santa Ana', city: 'Pateros' };
function harness(role = 'worker', initial = [booking]) {
  let rows = initial, account: Props = { status: 'resolved', hasCurrentConsent: true, account: { id: 'owner', role, is_active: true } }, alive = true;
  const lifecycle = new Set<() => void>(), appListeners = new Set<(state: string) => void>();
  const subscriptions = new Set<Props>();
  const session: Props = { session: { user: { id: 'owner' } }, isSessionLoading: false, sessionError: null, recoveryStatus: 'idle', sessionRevision: 1,
    sessionLifetime: { ownerId: 'owner', isCurrent: () => alive }, isSessionRevisionCurrent: (v: number) => alive && v === session.sessionRevision,
    subscribeSessionLifecycle: (fn: () => void) => { lifecycle.add(fn); return () => lifecycle.delete(fn); } };
  const reads = vi.fn(async () => rows), readLocation = vi.fn(async () => location), details = vi.fn(), viewAll = vi.fn();
  const components = new Map<string, { slots: any[]; seen: boolean }>(); let active: any, cursor = 0;
  const queued: (() => void)[] = [], focused = new Map<string, { start: () => any; stop?: () => void }>();
  const hook = (initial: any) => { const i = cursor++; if (!(i in active.slots)) active.slots[i] = typeof initial === 'function' ? initial() : initial; return i; };
  const effect = (fn: () => any, deps?: any[]) => {
    const entry = active, i = cursor++, old = entry.slots[i];
    if (!old || !deps || deps.some((x, n) => !Object.is(x, old.deps[n]))) queued.push(() => { old?.cleanup?.(); entry.slots[i] = { deps, cleanup: fn() }; });
  };
  const call = (fn: any, props: Props, key = ''): any => {
    const id = fn.name + key, oldActive = active, oldCursor = cursor;
    if (!components.has(id)) components.set(id, { slots: [], seen: false }); active = components.get(id); active.seen = true; cursor = 0;
    const tree = fn(props); active = oldActive; cursor = oldCursor; return tree;
  };
  const jsx = (type: any, props: Props, key?: string): any => typeof type === 'function' ? call(type, props, key) : ({ type, props });
  const app: Props = { currentState: 'active', addEventListener: (_: string, fn: any) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } };
  const modules: Props = {
    react: { useState: (initial: any) => { const owner = active, i = hook(initial); return [owner.slots[i], (v: any) => { owner.slots[i] = typeof v === 'function' ? v(owner.slots[i]) : v; }]; },
      useRef: (v: any) => active.slots[hook({ current: v })], useCallback: (fn: any) => fn, useMemo: (fn: any) => active.slots[hook(fn)],
      useEffect: effect, useLayoutEffect: effect, useSyncExternalStore: (_: any, get: any) => get() },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'Spinner', AppState: app, StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
      PanResponder: { create: (handlers: any) => ({ panHandlers: { gesture: handlers } }) } },
    'expo-router': { useFocusEffect: (fn: any) => { const id = 'focus' + components.size; if (!focused.has(id)) { const item = { start: fn, stop: undefined as any }; focused.set(id, item); queued.push(() => { item.stop = fn(); }); } } },
    '@/components/refinement-theme': { useUiTheme: () => SkillMatchTheme.ui },
    '@/components/app-button': { AppButton: 'Button' }, '@/components/app-chip': { AppChip: 'Chip' }, '@/components/app-symbol': { AppSymbol: 'Symbol' },
    '@/components/app-sheet': { AppSheet: 'Sheet' }, '@/components/booking-compact-card': { BookingCompactCard: 'LegacyCard' }, '@/components/section-header': { SectionHeader: 'Header' },
    '@/components/fact-row': { FactRow: ({ label, value }: Props) => jsx('Fact', { label, value, accessibilityLabel: `${label}: ${value}`, children: `${label}: ${value}` }) },
    '@/components/job-location-map': { StaticJobMap: 'Map' },
    '@/components/initials-avatar': { InitialsAvatar: 'Avatar' },
    '@/lib/booking-records': { loadWorkerBookings: reads, loadClientBookings: reads },
    '@/lib/bookings': bookingText, '@/lib/date-time': dates,
    '@/lib/job-location': { getAuthorizedJobLocation: readLocation },
    '@/lib/home-booking-sheet': { createHomeBookingSheet },
    '@/lib/realtime': { BOOKING_STATUS_CHANGED: 'booking_status_changed', bookingMessagesTopic: (id: string) => `booking:${id}:messages`,
      subscribeInvalidation: (options: Props) => { subscriptions.add(options); return () => subscriptions.delete(options); } },
    '@/providers/account-provider': { useAccount: () => account }, '@/providers/session-provider': { useSession: () => session },
  };
  const compile = (path: string) => { const exports: Props = {}; new Function('require', 'exports', ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)((name: string) => { if (!(name in modules)) throw Error(name); return modules[name]; }, exports); return exports; };
  modules['@/components/active-booking-home-card'] = compile('src/components/active-booking-home-card.tsx');
  const component = compile('src/components/active-booking-home-dock.tsx').ActiveBookingHomeDock;
  const render = () => {
    components.forEach(c => { c.seen = false; });
    const tree = call(component, { role, bookings: rows, onBookings: (next: any) => { rows = next; }, onPressPrimary: details, onPressViewAll: viewAll });
    components.forEach((c, key) => { if (!c.seen) { c.slots.forEach(s => s?.cleanup?.()); components.delete(key); } });
    queued.splice(0).forEach(fn => fn()); return tree;
  };
  const expand = () => nodes(render()).find(n => n.type === 'Pressable' && n.props.accessibilityState?.expanded !== undefined)!.props.onPress();
  return { render, expand, reads, readLocation, details, viewAll, setRows: (next: any) => { rows = next; },
    changeAccount: (next: any) => { account = { ...account, ...next }; }, session,
    blur: () => focused.forEach(f => f.stop?.()), lifecycle: () => { alive = false; lifecycle.forEach(fn => fn()); },
    background: () => { app.currentState = 'background'; appListeners.forEach(fn => fn('background')); }, subscriptions,
    invalidate: () => subscriptions.forEach(s => { s.onBroadcastEvent?.(); s.onInvalidate(); }),
    unavailable: () => subscriptions.forEach(s => s.onUnavailable?.()) };
}
it.each(['pending', 'completed', 'cancelled', 'no_show'])('reclaims all dock space for %s and absent bookings', status => {
  expect(harness('worker', []).render()).toBeNull(); expect(harness('worker', [{ ...booking, booking_status: status }]).render()).toBeNull();
});
const card = (tree: any) => nodes(tree).find(n => n.type === 'Pressable' && n.props.accessibilityLabel?.startsWith('Active booking'))!;
const gesture = (tree: any) => nodes(tree).find(n => n.props?.gesture)!.props.gesture;
it('renders the compact summary and a tap opens the map-first Booking details directly (no intermediate sheet)', () => {
  const h = harness(); const tree = h.render();
  for (const value of ['Active booking', 'Plumbing service', 'Confirmed']) expect(text(tree)).toContain(value);
  expect(card(tree).props.accessibilityHint).toMatch(/map/i);
  card(tree).props.onPress();
  expect(h.details).toHaveBeenCalledTimes(1); expect(h.details.mock.calls[0][0].booking_id).toBe('b');
  expect(nodes(h.render()).some(n => n.type === 'Sheet' || n.type === 'Map')).toBe(false);
  // The dock reads nothing itself: Booking details owns the protected booking and location lifetimes.
  expect(h.reads).not.toHaveBeenCalled(); expect(h.readLocation).not.toHaveBeenCalled(); expect(h.subscriptions.size).toBe(0);
});
it('a clear upward swipe on the dock opens Booking details; short or sideways drags do not', () => {
  const h = harness(); const g = gesture(h.render());
  expect(g.onMoveShouldSetPanResponderCapture({}, { dx: 2, dy: -20 })).toBe(true);
  expect(g.onMoveShouldSetPanResponderCapture({}, { dx: 40, dy: -20 })).toBe(false);
  g.onPanResponderRelease({}, { dx: 4, dy: -30 }); g.onPanResponderRelease({}, { dx: 90, dy: -60 });
  expect(h.details).not.toHaveBeenCalled();
  g.onPanResponderRelease({}, { dx: 4, dy: -80 });
  expect(h.details).toHaveBeenCalledTimes(1);
});
it('opens the same deterministic primary booking the dock shows', () => {
  const h = harness('worker', [{ ...booking, booking_id: 'later', job_scheduled_at: null as any }, booking]);
  const tree = h.render(); expect(text(tree)).toContain('Plumbing service');
  card(tree).props.onPress();
  // Soonest schedule first, nulls last: the scheduled booking 'b' is primary, not the unscheduled 'later'.
  expect(h.details.mock.calls[0][0].booking_id).toBe('b');
});
it('shows no private booking content on Home (no address, phone, counterpart or map)', () => {
  for (const role of ['worker', 'client']) {
    const copy = text(harness(role).render());
    for (const secret of ['BROAD ROW ADDRESS', 'private phone', 'Client Person', 'Worker Person', 'Authorized address']) expect(copy).not.toContain(secret);
  }
});
it.each([
  ['blur', (h: any) => h.blur()],
  ['background', (h: any) => h.background()],
  ['lifecycle loss', (h: any) => h.lifecycle()],
])('does not navigate after %s', (_name, lose) => {
  const h = harness(); const tree = h.render(); lose(h);
  card(tree).props.onPress(); gesture(tree).onPanResponderRelease({}, { dx: 0, dy: -90 });
  expect(h.details).not.toHaveBeenCalled();
});
it.each([
  ['consent', { hasCurrentConsent: false }], ['role', { account: { id: 'owner', role: 'client', is_active: true } }],
  ['inactive', { account: { id: 'owner', role: 'worker', is_active: false } }], ['owner', { account: { id: 'other', role: 'worker', is_active: true } }],
])('removes the dock and refuses navigation after %s loss', (_name, change) => {
  const h = harness(); const tree = h.render(); h.changeAccount(change);
  expect(h.render()).toBeNull();                       // React re-renders on the authority change: the dock unmounts
  card(tree).props.onPress(); gesture(tree).onPanResponderRelease({}, { dx: 0, dy: -90 });
  expect(h.details).not.toHaveBeenCalled();           // a late tap on the unmounted dock does nothing
});

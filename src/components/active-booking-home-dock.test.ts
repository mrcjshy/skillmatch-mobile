// @ts-expect-error -- Node-only prop/lifetime harness, not native layout evidence.
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
const settle = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };
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
it('renders the real compact summary and expands instead of navigating', async () => {
  const h = harness(); const tree = h.render(); expect(text(tree)).toContain('Active booking'); expect(text(tree)).toContain('Plumbing service');
  expect(text(tree)).toContain('Confirmed'); expect(h.readLocation).not.toHaveBeenCalled(); h.expand(); h.expand(); await settle();
  expect(nodes(h.render()).find(n => n.type === 'Sheet')?.props.visible).toBe(true); expect(h.details).not.toHaveBeenCalled(); expect(h.reads).toHaveBeenCalledTimes(1);
});
it('uses existing deterministic primary selection for dock and expanded sheet', async () => {
  const h = harness('worker', [{ ...booking, booking_id: 'later', job_scheduled_at: null as any }, booking]);
  expect(text(h.render())).toContain('Plumbing service'); h.expand(); await settle();
  nodes(h.render()).find(n => n.type === 'Button' && n.props.label === 'View booking details')!.props.onPress(); expect(h.details).toHaveBeenCalledWith(booking);
});
it('compacts sheet spacing without hiding the client, payment, authorized location or controls', async () => {
  const h = harness(); h.expand(); await settle();
  const sheet = nodes(h.render()).find(n => n.type === 'Sheet')!;
  const details = sheet.props.children;
  expect(details.props.style.gap).toBe(12);
  expect(details.props.children[0].props.style).toMatchObject({ padding: 12, gap: 8 });
  expect(text(sheet)).toContain('Client Person'); expect(text(sheet)).toContain('pending');
  expect(text(sheet)).toContain('Authorized address'); expect(text(sheet)).not.toContain('BROAD ROW');
  expect(nodes(sheet).find(n => n.type === 'Button' && n.props.label === 'View booking details')).toBeDefined();
  expect(h.details).not.toHaveBeenCalled(); expect(h.viewAll).not.toHaveBeenCalled();
});

it('introduces the job and schedule before the destination in the expanded reading order', async () => {
  const h = harness(); h.expand(); await settle();
  const sheet = nodes(h.render()).find(n => n.type === 'Sheet')!;
  const content = nodes(sheet.props.children);
  const title = content.findIndex(n => n.props.accessibilityRole === 'header' && text(n) === booking.job_title);
  const schedule = content.findIndex(n => n.props.accessibilityLabel === `Schedule: ${dates.formatCardDateTime(booking.job_scheduled_at)}`);
  const map = content.findIndex(n => n.type === 'Map');
  expect(title).toBeGreaterThanOrEqual(0); expect(schedule).toBeGreaterThan(title); expect(map).toBeGreaterThan(schedule);
});
it('announces an accessible loading state without showing private summary content', () => {
  const h = harness(); h.expand();
  const sheet = nodes(h.render()).find(n => n.type === 'Sheet')!;
  expect(nodes(sheet).find(n => n.props.accessibilityRole === 'progressbar')?.props).toMatchObject({
    accessibilityLabel: 'Loading active booking', accessibilityState: { busy: true },
  });
  expect(text(sheet)).not.toContain('Client Person'); expect(text(sheet)).not.toContain('Authorized address');
  expect(nodes(sheet).find(n => n.type === 'Map')).toBeUndefined();
});
it('keeps the full authorized address without repeating an area already included in it', async () => {
  const h = harness(); h.readLocation.mockResolvedValue({ ...location, address: '24 Market Street, Santa Ana, Pateros' });
  h.expand(); await settle(); const sheet = nodes(h.render()).find(n => n.type === 'Sheet')!;
  expect(text(sheet)).toContain('24 Market Street, Santa Ana, Pateros');
  expect(text(sheet).split('Santa Ana, Pateros')).toHaveLength(2);
});
it.each(['worker', 'client'])('shows only the %s counterpart and authorized location before Details', async role => {
  const h = harness(role); h.expand(); await settle(); const tree = h.render();
  expect(text(tree)).toContain(role === 'worker' ? 'Client Person' : 'Worker Person');
  expect(text(tree)).not.toContain(role === 'worker' ? 'Worker Person' : 'Client Person');
  expect(text(tree)).toContain('Authorized address'); expect(text(tree)).not.toContain('BROAD ROW'); expect(text(tree)).not.toContain('private phone');
  expect(nodes(tree).find(n => n.type === 'Map')?.props.pin).toEqual(location.pin);
  expect(nodes(tree).find(n => n.type === 'Avatar')?.props.name).toBe(role === 'worker' ? 'Client Person' : 'Worker Person');
  expect(text(tree)).toContain(role === 'worker' ? 'Your client' : 'Your worker');
  expect(text(tree)).toContain('pending'); expect(text(tree)).toContain('500');
});
it('keeps missing schedule, budget, payment, counterpart and location honest', async () => {
  const h = harness('worker', [{ ...booking, job_scheduled_at: null as any, job_budget: null as any, payment_status: null as any, client_full_name: null as any }]);
  h.readLocation.mockRejectedValue(new Error('offline')); h.expand(); await settle(); const tree = h.render();
  expect(nodes(tree).filter(n => n.type === 'Map')).toHaveLength(0); expect(text(tree)).toContain('Location unavailable');
  expect(text(tree)).not.toContain('BROAD ROW'); expect(text(tree)).not.toContain('paid'); expect(text(tree)).not.toContain('500');
  expect(nodes(tree).find(n => n.type === 'Button' && n.props.label === 'View booking details')).toBeDefined();
});
it('offers accessible expansion and collapse with a separate View all action for multiple bookings', async () => {
  const h = harness('client', [booking, { ...booking, booking_id: 'z', job_scheduled_at: null as any }]);
  const tree = h.render(), dock = nodes(tree).find(n => n.type === 'Pressable')!;
  expect(dock.props.accessibilityRole).toBe('button'); expect(dock.props.accessibilityHint).toContain('Expand');
  const gesture = nodes(tree).find(n => n.props.gesture)?.props.gesture;
  // Pressable replaces responder handlers internally; the enclosing native View must own the swipe.
  expect(dock.props.gesture).toBeUndefined();
  expect(gesture.onMoveShouldSetPanResponderCapture({}, { dx: 1, dy: -45 })).toBe(true); gesture.onPanResponderRelease({}, { dx: 1, dy: -70 });
  await settle(); const sheet = nodes(h.render()).find(n => n.type === 'Sheet')!;
  expect(sheet.props.swipeToClose).toBe(true); sheet.props.onClose(); expect(nodes(h.render()).find(n => n.type === 'Map')).toBeUndefined();
  h.expand(); await settle(); const viewAll = nodes(h.render()).find(n => n.type === 'Button' && n.props.label === 'View all bookings')!;
  viewAll.props.onPress(); viewAll.props.onPress(); expect(h.viewAll).toHaveBeenCalledTimes(1);
});
it.each(['consent', 'inactive', 'role', 'owner', 'session', 'lifecycle', 'blur', 'background'])('conceals private sheet data after %s loss', async kind => {
  const h = harness(); h.expand(); await settle(); expect(nodes(h.render()).find(n => n.type === 'Map')).toBeDefined();
  if (kind === 'consent') h.changeAccount({ hasCurrentConsent: false });
  if (kind === 'inactive') h.changeAccount({ account: { id: 'owner', role: 'worker', is_active: false } });
  if (kind === 'role') h.changeAccount({ account: { id: 'owner', role: 'client', is_active: true } });
  if (kind === 'owner') h.changeAccount({ account: { id: 'other', role: 'worker', is_active: true } });
  if (kind === 'session') h.session.session = null;
  if (kind === 'lifecycle') h.lifecycle(); if (kind === 'blur') h.blur(); if (kind === 'background') h.background();
  expect(nodes(h.render()).find(n => n.type === 'Map')).toBeUndefined();
});
it('drops a terminal primary after authoritative refresh and features the next confirmed booking', async () => {
  const h = harness(); h.expand(); await settle();
  h.setRows([{ ...booking, booking_status: 'completed' }, { ...booking, booking_id: 'next', job_id: 'next-job', job_title: 'Next job' }]);
  expect(nodes(h.render()).find(n => n.type === 'Map')).toBeUndefined(); expect(text(h.render())).toContain('Next job');
  h.setRows([]); expect(h.render()).toBeNull();
});
it('keeps operational booking actions and location mutation APIs off the sheet', () => {
  const source = readFileSync('src/components/active-booking-home-dock.tsx', 'utf8');
  expect(source).not.toMatch(/expo-location|snap(?:Pin|To|Point)|geocod|acceptBooking|cancelBooking|completeBooking|markPaid|supabase\./i);
});
it('conceals precise data on the existing status event before authoritative terminal revalidation', async () => {
  const h = harness(); expect(h.subscriptions.size).toBe(0); h.expand(); await settle();
  expect(nodes(h.render()).find(n => n.type === 'Map')).toBeDefined();
  let finish!: (rows: any) => void; h.reads.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  h.invalidate();
  const pending = h.render(); expect(nodes(pending).find(n => n.type === 'Map')).toBeUndefined();
  expect(text(pending)).not.toContain('Authorized address'); expect(text(pending)).not.toContain('Client Person');
  finish([{ ...booking, booking_status: 'completed' }]); await settle(); expect(h.render()).toBeNull(); expect(h.subscriptions.size).toBe(0);
});
it('clears an expanded map on transport loss and removes its receive-only subscription', async () => {
  const h = harness(); h.expand(); await settle(); h.render();
  expect([...h.subscriptions][0]).toMatchObject({ topic: 'booking:b:messages', events: ['booking_status_changed'] });
  h.unavailable(); const tree = h.render(); expect(nodes(tree).find(n => n.type === 'Map')).toBeUndefined(); expect(h.subscriptions.size).toBe(0);
});

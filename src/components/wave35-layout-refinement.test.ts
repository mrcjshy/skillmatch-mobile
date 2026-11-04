// @ts-expect-error -- Node-only inert TSX harness, not native runtime evidence.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkillMatchTheme } from '@/constants/theme';
import { greetingName, homeGreeting, homeShortDate } from '@/lib/home-greeting';
import { createCoalescedInvalidation } from '@/lib/realtime';
import { loadHasUnreadNotifications } from '@/lib/notification-unread';
import { supabase } from '@/lib/supabase';
import { APP_HEADER_OPTIONS } from '@/components/app-header-options';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (v: Record<string, unknown>) => v.android ?? v.default } }));
type Props = Record<string, any>;
type Element = { type: any; props: Props };
const noop = () => {};
const jsx = (type: any, props: Props): Element => ({ type, props });
const native = { Text: 'Text', View: 'View', Pressable: 'Pressable', StyleSheet: { create: (v: Props) => v, hairlineWidth: 1 } };
const nodes = (tree: any): Element[] => Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : [];
const text = (tree: any): string => Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
function compile(path: string, seams: Props): Props {
  const exports: Props = {};
  new Function('require', 'exports', ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText)((id: string) => {
    if (id in seams) return seams[id];
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (id === 'react-native') return native;
    if (id === '@/components/refinement-theme') return { useUiTheme: () => SkillMatchTheme.ui };
    throw new Error(`Missing inert seam: ${id}`);
  }, exports);
  return exports;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('shared Home greeting, date and balanced title', () => {
  function headerHarness(role: string) {
    let now: Date | undefined, arrivals: number | undefined, focus!: () => () => void, onState!: () => void;
    const waves: number[] = [];
    const appState = { currentState: 'active', addEventListener: (_event: string, callback: () => void) => { onState = callback; return { remove: noop }; } };
    const { HomeStickyHeader } = compile('src/components/home-header.tsx', {
      react: {
        useState: (initial: unknown) => {
          if (typeof initial === 'function') { now ??= (initial as () => Date)(); return [now, (value: Date) => { now = value; }]; }
          arrivals ??= initial as number;
          return [arrivals, (value: number | ((n: number) => number)) => { arrivals = typeof value === 'function' ? value(arrivals!) : value; }];
        },
        useCallback: (fn: unknown) => fn,
      },
      '@/components/motion': { MotionView: 'MotionView', useGreetingWave: (play: number) => { waves.push(play); return { wave: play }; } },
      'react-native': { ...native, Image: 'Image', AppState: appState },
      'expo-router': { useFocusEffect: (fn: typeof focus) => { focus = fn; } },
      '@/assets/images/greeting/sun.png': 'sky-sun', '@/assets/images/greeting/sun-cloud.png': 'sky-sun-cloud', '@/assets/images/greeting/moon.png': 'sky-moon',
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24 }) },
      '@/components/notification-bell': { NotificationBell: 'NotificationBell' },
      '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
      '@/lib/home-greeting': { greetingName, homeGreeting, homeShortDate },
    });
    return { render: (name = 'Alex') => HomeStickyHeader({ name, role }), focus: () => focus(), resume: () => onState(), waves };
  }
  it.each(['worker', 'client'])('%s shows the actual local greeting, name and calendar date', role => {
    vi.useFakeTimers(); const now = new Date(2026, 9, 3, 9, 15); vi.setSystemTime(now);
    const h = headerHarness(role), tree = h.render();
    expect(text(tree)).toContain('Good morning,'); expect(text(tree)).toContain(homeShortDate(now));
    expect(nodes(tree).find(n => n.type === 'Text' && n.props.accessibilityRole === 'header' && n.props.children === 'Alex')).toBeDefined();
    expect(nodes(tree).find(n => n.type === 'NotificationBell')!.props.role).toBe(role);
    expect(nodes(tree).filter(n => n.type === 'Text').every(n => n.props.numberOfLines === undefined)).toBe(true);
  });
  it('stays compact: a 3D sky icon for the time of day, greeting and short date on one line, then the name with a waving hand', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 3, 20, 0));
    const h = headerHarness('worker');
    const tree = h.render('jomerson');
    const flat = (style: any) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
    // No tinted panel: the header sits on the canvas with its hairline, as before.
    expect(flat(tree.props.style)).toMatchObject({ backgroundColor: SkillMatchTheme.ui.colors.canvas, borderBottomWidth: 1 });
    expect(flat(tree.props.style).borderBottomLeftRadius).toBeUndefined();
    // The evening moon, decorative and hidden from screen readers.
    const art = nodes(tree).find(n => n.type === 'Image')!;
    expect(art.props.source).toBe('sky-moon');
    expect(nodes(tree).find(n => n.props.importantForAccessibility === 'no-hide-descendants' && nodes(n).includes(art))).toBeDefined();
    // Greeting and date share one line; the capitalised name is the single, strongest header.
    const texts = nodes(tree).filter(n => n.type === 'Text');
    const salutation = texts.find(n => text(n).startsWith('Good evening') && text(n).includes('·'))!;
    expect(text(salutation)).toBe(`Good evening,  ·  ${homeShortDate(new Date(2026, 9, 3))}`);
    const name = texts.find(n => n.props.children === 'Jomerson')!;
    expect(name.props.accessibilityRole).toBe('header');
    expect(texts.filter(n => n.props.accessibilityRole === 'header')).toHaveLength(1);
    expect(flat(name.props.style)).toMatchObject({ fontSize: 24, fontWeight: '800', color: SkillMatchTheme.ui.colors.textPrimary });
    // Two text lines beside the icon: greeting line, then name.
    const column = nodes(tree).find(n => n.type === 'View' && n.props.style?.flex === 1 && n.props.style?.minWidth === 0)!;
    expect(column.props.children.filter(Boolean)).toHaveLength(2);
    // The hand is decorative and waves again each time Home is focused.
    const hand = nodes(tree).find(n => n.type === 'MotionView')!;
    expect(hand.props).toMatchObject({ accessible: false, importantForAccessibility: 'no-hide-descendants' });
    expect(text(hand)).toBe('👋');
    h.focus(); h.render('jomerson'); expect(h.waves.at(-1)).toBe(1);
    // No name: no comma and no hand.
    const empty = headerHarness('client').render('');
    expect(text(empty)).toContain('Good evening  ·  ');
    expect(text(empty)).not.toContain('Good evening,');
    expect(nodes(empty).some(n => n.type === 'MotionView')).toBe(false);
    // Morning shows the sun, afternoon the sun behind a cloud.
    vi.setSystemTime(new Date(2026, 9, 3, 8, 0));
    expect(nodes(headerHarness('client').render()).find(n => n.type === 'Image')!.props.source).toBe('sky-sun');
    vi.setSystemTime(new Date(2026, 9, 3, 14, 0));
    expect(nodes(headerHarness('client').render()).find(n => n.type === 'Image')!.props.source).toBe('sky-sun-cloud');
  });
  it('updates on focus, time changes and foreground resume without leaving a timer after blur', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 3, 23, 59));
    const h = headerHarness('worker'); h.render(); const cleanup = h.focus();
    vi.advanceTimersByTime(60_000); expect(text(h.render())).toContain(homeShortDate(new Date(2026, 9, 4)));
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0)); h.resume(); expect(text(h.render())).toContain('Good afternoon,');
    cleanup(); expect(vi.getTimerCount()).toBe(0);
  });
  it('has no Home heading (Wave 7): the bell keeps a 48dp slot beside the greeting; navigator centering is shared', () => {
    const tree = headerHarness('client').render();
    expect(text(tree)).not.toContain('Home');
    const row = nodes(tree).find(n => n.type === 'View' && n.props.style?.flexDirection === 'row' && nodes(n).some(c => c.type === 'NotificationBell'))!;
    const [sky, greeting, slot] = row.props.children;
    expect(sky.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(greeting.props.style).toMatchObject({ flex: 1, minWidth: 0 });
    expect(slot.props.style).toMatchObject({ width: 48, minHeight: 48 });
    expect(nodes(slot).map(n => n.type)).toContain('NotificationBell');
    expect(APP_HEADER_OPTIONS).toMatchObject({ headerTitleAlign: 'center' });
    for (const role of ['worker', 'client', 'admin']) {
      const source = readFileSync(`src/app/(${role})/_layout.tsx`, 'utf8');
      // Wave 5: every role Stack uses the one shared options object (which spreads APP_HEADER_OPTIONS).
      expect(source).toContain('screenOptions={APP_STACK_SCREEN_OPTIONS}');
      expect(source).not.toMatch(/headerLeft\s*:/);
    }
    expect(readFileSync('src/components/app-tab-bar.tsx', 'utf8')).toContain('...APP_HEADER_OPTIONS');
  });
});

describe('compact sticky Active booking (Worker and Client)', () => {
  const rows = [
    { booking_id: 'later', booking_status: 'confirmed', job_title: 'Later service', job_scheduled_at: '2099-01-03T00:00:00Z', booked_at: null, worker_full_name: 'Later worker' },
    { booking_id: 'soon', booking_status: 'confirmed', job_title: 'Repair kitchen taps', job_scheduled_at: '2099-01-02T00:00:00Z', booked_at: null, worker_full_name: 'Assigned worker' },
    { booking_id: 'history', booking_status: 'completed', job_title: 'Completed history', job_scheduled_at: '2098-01-01T00:00:00Z', booked_at: null },
  ];
  function render(bookings: Props[], role = 'client', withViewAll = true) {
    const onPress = vi.fn(), onViewAll = vi.fn();
    const { ActiveBookingHomeCard } = compile('src/components/active-booking-home-card.tsx', {
      '@/components/app-button': { AppButton: 'AppButton' }, '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
      '@/components/booking-compact-card': { BookingCompactCard: 'BookingCompactCard' }, '@/components/section-header': { SectionHeader: 'SectionHeader' },
      '@/lib/bookings': { formatBookingStatus: () => 'Confirmed' },
      '@/lib/date-time': { formatCardDateTime: (value: string | null) => value ? `When ${value.slice(0, 10)}` : null },
    });
    const tree = ActiveBookingHomeCard({ role, compact: true, bookings, onPressPrimary: onPress, onPressViewAll: withViewAll ? onViewAll : undefined });
    const pressables = nodes(tree).filter(n => n.type === 'Pressable');
    return { tree, onPress, onViewAll, row: pressables.find(n => String(n.props.accessibilityLabel).startsWith('Active booking:')), viewAll: pressables.find(n => n.props.accessibilityLabel === 'View all active bookings') };
  }
  it.each([[], rows.filter(row => row.booking_status === 'completed'), [{ ...rows[0], booking_status: 'pending' }]].map(bookings => ({ bookings })))('collapses without a confirmed booking, View all included, leaving no space: %j', ({ bookings }) => {
    for (const role of ['client', 'worker']) expect(render(bookings, role).tree).toBeNull();
  });
  it('is one divided section, not a card: label row with View all, then one row for the soonest confirmed booking', () => {
    const { tree, row, viewAll, onPress, onViewAll } = render(rows);
    expect(tree.type).toBe('View');
    expect(tree.props.style).toMatchObject({ borderTopWidth: 1 });
    expect(tree.props.style.borderRadius).toBeUndefined(); expect(tree.props.style.backgroundColor).toBeUndefined();
    expect(text(tree)).toContain('Active bookings · 2');
    expect(text(row)).toContain('Repair kitchen taps'); expect(text(row)).toContain('Confirmed · When 2099-01-02 · Worker: Assigned worker');
    expect(text(tree)).not.toMatch(/Completed history|Later service/);
    row!.props.onPress(); expect(onPress).toHaveBeenCalledExactlyOnceWith(rows[1]);
    expect(row!.props.style({ pressed: false })[0].minHeight).toBeGreaterThanOrEqual(48);
    expect(row!.props.style({ pressed: false })[0].height).toBeUndefined();
    viewAll!.props.onPress(); expect(onViewAll).toHaveBeenCalledOnce();
    expect(viewAll!.props.accessibilityRole).toBe('button');
    // 32dp visible plus 8dp slop on each side keeps the 48dp touch target.
    expect(viewAll!.props.style({ pressed: false })[0].minHeight + viewAll!.props.hitSlop.top + viewAll!.props.hitSlop.bottom).toBeGreaterThanOrEqual(48);
    expect(nodes(tree).some(n => ['BookingCompactCard', 'AppButton'].includes(n.type))).toBe(false);
  });
  it('names the Client to a Worker and the Worker to a Client, and offers View all for a single booking', () => {
    const worker = render([{ ...rows[1], worker_full_name: undefined, client_full_name: 'Ana Client' }], 'worker');
    expect(text(worker.tree)).toContain('Active booking'); expect(text(worker.tree)).not.toContain('Active bookings');
    expect(text(worker.row)).toContain('Client: Ana Client'); expect(text(worker.row)).not.toContain('Worker:');
    expect(worker.viewAll).toBeDefined();
    expect(render([rows[1]], 'client', false).viewAll).toBeUndefined();
  });
  it('bounds the preview lines; the full values stay in the spoken label and on Booking Details', () => {
    const { row } = render([{ ...rows[1], job_title: 'A very long service title '.repeat(4) }]);
    const [title, meta] = nodes(row).filter(n => n.type === 'Text');
    expect(title.props.numberOfLines).toBe(1); expect(meta.props.numberOfLines).toBe(2);
    expect(row!.props.accessibilityLabel).toContain('A very long service title A very long service title');
  });
  it('has no empty counterpart or schedule when the participant projection omits them', () => {
    const { row } = render([{ ...rows[1], worker_full_name: null, job_scheduled_at: null }]);
    expect(text(row)).not.toContain('Worker:'); expect(text(row)).not.toContain(' · '); expect(text(row)).toContain('Repair kitchen taps');
  });
});

describe('authoritative unread existence query', () => {
  it.each([[], [{ is_read: false }], [{ is_read: null }], [{ is_read: true }]].map(data => ({ data })))('reuses nullable unread semantics for %j', async ({ data }) => {
    const query = { select: vi.fn(), or: vi.fn(), limit: vi.fn(async () => ({ data, error: null })) };
    query.select.mockReturnValue(query); query.or.mockReturnValue(query);
    vi.mocked(supabase.from).mockReturnValue(query as never);
    expect(await loadHasUnreadNotifications()).toBe(data.some(row => row.is_read !== true));
    expect(supabase.from).toHaveBeenLastCalledWith('notifications');
    expect(query.select).toHaveBeenCalledWith('is_read');
    expect(query.or).toHaveBeenCalledWith('is_read.eq.false,is_read.is.null');
    expect(query.limit).toHaveBeenCalledWith(1);
  });
  it('does not claim zero unread on a forbidden or failed read', async () => {
    const query = { select: vi.fn(), or: vi.fn(), limit: vi.fn(async () => ({ data: null, error: { code: '42501' } })) };
    query.select.mockReturnValue(query); query.or.mockReturnValue(query);
    vi.mocked(supabase.from).mockReturnValue(query as never);
    await expect(loadHasUnreadNotifications()).rejects.toMatchObject({ code: '42501' });
  });
});

describe('Home unread ownership and freshness', () => {
  async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
  function harness() {
    let value: any = null, focus!: () => (() => void) | undefined, onState!: (state: string) => void;
    let liveRevision = 1;
    let account: Props = { id: 'worker-a', role: 'worker', is_active: true };
    const read = vi.fn(async () => true), unsubscribe = vi.fn(), remove = vi.fn();
    let invalidate!: () => void;
    const appState = { currentState: 'active', addEventListener: (_event: string, callback: typeof onState) => { onState = callback; return { remove }; } };
    const subscribe = vi.fn((options: Props) => { invalidate = options.onInvalidate; return unsubscribe; });
    const { useUnreadNotifications: renderUnread } = compile('src/hooks/use-unread-notifications.ts', {
      react: { useState: () => [value, (next: any) => { value = next; }], useCallback: (fn: unknown) => fn },
      'expo-router': { useFocusEffect: (fn: typeof focus) => { focus = fn; } }, 'react-native': { AppState: appState },
      '@/providers/account-provider': { useAccount: () => ({ account }) },
      '@/providers/session-provider': { useSession: () => ({ session: { user: { id: account.id } }, sessionRevision: liveRevision, isSessionRevisionCurrent: (revision: number) => revision === liveRevision }) },
      '@/lib/notification-unread': { loadHasUnreadNotifications: read },
      '@/lib/realtime': { createCoalescedInvalidation, NOTIFICATION_INSERTED: 'notification_inserted', userNotificationsTopic: (id: string) => `user:${id}:notifications`, subscribeInvalidation: subscribe },
    });
    return { render: () => renderUnread('worker'), focus: () => focus(), read, subscribe, unsubscribe, remove,
      event: () => invalidate(), background: () => { appState.currentState = 'background'; onState('background'); },
      resume: () => { appState.currentState = 'active'; onState('active'); },
      revoke: () => { liveRevision++; }, switchAccount: () => { account = { ...account, id: 'worker-b' }; },
      deactivate: () => { account.is_active = false; } };
  }
  it('reads on Home entry, refreshes events/resume, and rereads zero after returning from the inbox', async () => {
    const h = harness(); expect(h.render()).toBe(false); let cleanup = h.focus()!; await settle(); expect(h.render()).toBe(true);
    expect(h.subscribe.mock.calls[0][0]).toMatchObject({ topic: 'user:worker-a:notifications', events: ['notification_inserted'] });
    h.read.mockResolvedValueOnce(false); h.event(); await settle(); expect(h.render()).toBe(false);
    h.background(); expect(h.render()).toBe(false); h.resume(); await settle(); expect(h.render()).toBe(true);
    cleanup(); expect(h.unsubscribe).toHaveBeenCalledOnce(); expect(h.remove).toHaveBeenCalledOnce(); expect(h.render()).toBe(false);
    h.read.mockResolvedValueOnce(false); cleanup = h.focus()!; await settle(); expect(h.render()).toBe(false); cleanup();
  });
  it.each(['blur', 'revision', 'account', 'background'])('rejects a late prior read after %s', async reason => {
    const h = harness(); let resolve!: (unread: boolean) => void;
    h.read.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done; }));
    h.render(); const cleanup = h.focus()!;
    if (reason === 'blur') cleanup(); if (reason === 'revision') h.revoke();
    if (reason === 'account') { h.revoke(); h.switchAccount(); } if (reason === 'background') h.background();
    resolve(true); await settle(); expect(h.render()).toBe(false); cleanup();
  });
  it('does not read for an inactive account, and removes an unread claim after a failed revalidation', async () => {
    const h = harness(); h.deactivate(); h.render(); expect(h.focus()).toBeUndefined(); expect(h.read).not.toHaveBeenCalled();
    const active = harness(); active.render(); const cleanup = active.focus()!; await settle(); expect(active.render()).toBe(true);
    active.read.mockRejectedValueOnce(new Error('Read failed')); active.event(); await settle(); expect(active.render()).toBe(false); cleanup();
  });
});

import { act, createElement, forwardRef, Fragment, useEffect, useImperativeHandle, useLayoutEffect, useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BookingChat from './booking-chat';
import BookingDetails from './booking-details';
import { useSessionContinuationRestore, type ContinuationReadOutcome } from '@/hooks/use-session-continuation-restore';
import { sessionRouteContinuation, stackFromNavigationState } from '@/lib/session-route-continuation';

// Option B rework (2026-10-21): the actual Booking Details and Booking Chat screens, the actual restore hook and
// continuation singleton, on a navigation store whose RESET runs through expo-router 57's own StackRouter. Every
// mounted route has its own route identity; focus and the global URL derive from the store, as in a native Stack.
// Reads, native primitives and child presentation are scripted. No device, network or database.
const b = vi.hoisted(() => ({
  me: '55555555-5555-4555-8555-555555555555', lifetime: { ownerId: '55555555-5555-4555-8555-555555555555', isCurrent: () => true },
  nav: { state: null as any, listeners: new Set<() => void>(), resets: [] as any[], rejected: [] as any[],
    // Follow-up: what the navigator REPORTS after an accepted reset (null = exactly what the router produced).
    tamper: null as null | ((state: any) => any) },
  routeNames: ['(tabs)', 'client/booking-details', 'client/chat', 'client/job-details'],
  RouteContext: null as any,
  detailRead: null as null | (() => Promise<unknown[]>), detailRows: [] as unknown[], detailReads: 0,
  chatRead: null as null | (() => Promise<any>), chatRows: [] as unknown[],
  messages: [] as { id: string; sender_id: string; content: string; created_at: string }[],
  statuses: [] as string[], invalidations: new Set<any>(), mounts: new Map<string, number>(),
  scroll: null as any, rows: [] as ((e: any) => void)[], scrollTo: vi.fn(), scrollToEnd: vi.fn(),
  captureScroll(props: any) { b.scroll = props; b.rows = []; },
}));
const EMPTY = Object.freeze({});
vi.mock('@/components/skeleton', () => ({ Skeleton: () => null, PulseDots: () => null, KeyboardSpacer: () => null }));
vi.mock('expo-router', async () => {
  const React = await import('react');
  const { StackRouter, CommonActions } = await import('expo-router/build/react-navigation/routers') as any;
  b.RouteContext = React.createContext(null);
  const router = StackRouter({});
  const options = { routeNames: b.routeNames, routeParamList: {}, routeGetIdList: {} };
  const subscribe = (fn: () => void) => { b.nav.listeners.add(fn); return () => { b.nav.listeners.delete(fn); }; };
  const useNavState = () => React.useSyncExternalStore(subscribe, () => b.nav.state);
  const useRoute = () => React.useContext(b.RouteContext) as any;
  const focusedKey = () => b.nav.state.routes[b.nav.state.index].key;
  const useIsFocused = () => { const state = useNavState(), route = useRoute(); return state.routes[state.index].key === route.key; };
  return {
    Stack: { Screen: () => null },
    useRoute, useIsFocused,
    useNavigation: () => {
      const route = useRoute();
      return {
        getState: () => b.nav.state,
        isFocused: () => focusedKey() === route.key,
        reset: (payload: any) => {
          b.nav.resets.push(payload);
          const next = router.getStateForAction(b.nav.state, CommonActions.reset(payload), options);
          if (next === null) { b.nav.rejected.push(payload); return; }
          b.nav.state = router.getRehydratedState(next, options);
          if (b.nav.tamper) b.nav.state = b.nav.tamper(b.nav.state);
          for (const listener of [...b.nav.listeners]) listener();
        },
      };
    },
    useFocusEffect: (effect: () => void | (() => void)) => {
      const focused = useIsFocused();
      React.useEffect(() => (focused ? effect() : undefined), [effect, focused]);
    },
    usePathname: () => { const state = useNavState(); return '/' + state.routes[state.index].name; },
    useGlobalSearchParams: () => { const state = useNavState(); return state.routes[state.index].params ?? EMPTY; },
    useLocalSearchParams: () => useRoute().params ?? EMPTY,
    useRouter: () => ({ push() {}, replace() {}, back() {}, canGoBack: () => true }),
  };
});
vi.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'synthetic-uuid' }));
vi.mock('react-native', () => {
  const pass = ({ children }: any) => children ?? null;
  const ScrollView = forwardRef(function ScrollView(props: any, ref: any) {
    if (props.onScrollBeginDrag) b.captureScroll(props);
    useImperativeHandle(ref, () => ({ scrollTo: b.scrollTo, scrollToEnd: b.scrollToEnd }));
    return props.children ?? null;
  });
  return { KeyboardAvoidingView: pass, Pressable: () => null, RefreshControl: () => null, View: pass, Text: () => null, ScrollView,
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, absoluteFill: {}, absoluteFillObject: {} },
    Platform: { OS: 'android', select: (v: any) => v.android ?? v.default },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) }, Linking: { openURL: async () => {} } };
});
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
vi.mock('tamagui', () => ({
  XStack: ({ children, onLayout }: any) => { if (onLayout) b.rows.push(onLayout); return children ?? null; },
  YStack: ({ children }: any) => children ?? null,
}));
vi.mock('@/components/refinement-theme', async () => {
  const { SkillMatchTheme } = await import('@/constants/theme');
  return { useUiTheme: () => SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: any) => children };
});
const none = vi.hoisted(() => () => null);
vi.mock('@/components/app-button', () => ({ AppButton: none }));
vi.mock('@/components/app-chip', () => ({ AppChip: none }));
vi.mock('@/components/app-field', () => ({ AppField: none }));
vi.mock('@/components/app-notice', () => ({ AppNotice: none }));
vi.mock('@/components/app-symbol', () => ({ AppSymbol: none }));
vi.mock('@/components/app-icon-button', () => ({ AppIconButton: none }));
vi.mock('@/components/initials-avatar', () => ({ InitialsAvatar: none }));
vi.mock('@/components/inline-status', () => ({ InlineStatus: ({ message }: any) => { b.statuses.push(message); return null; } }));
vi.mock('@/components/booking-card-parts', () => ({ CardDivider: none, FactLine: none, IdentifierBlock: none, PaymentRow: none, SupportEntry: none }));
vi.mock('@/components/booking-location-map', () => ({ BookingLocationMap: none }));
vi.mock('@/components/booking-sheet', () => ({ BookingSheet: none }));
vi.mock('@/components/booking-lifecycle', () => ({ default: none }));
vi.mock('@/components/booking-payment', () => ({ default: none }));
vi.mock('@/components/worker-booking-progress', () => ({ default: none }));
vi.mock('@/components/job-photo-gallery', () => ({ JobPhotoGallery: none }));
vi.mock('@/components/job-location-map', () => ({ WorkerAssignedJobLocation: none, nativeJobMapsLoaded: () => false, openWorkerMapsUrl: async () => {} }));
vi.mock('@/components/rate-worker', () => ({ default: none }));
vi.mock('@/components/section-header', () => ({ SectionHeader: none }));
vi.mock('@/components/surface-group', () => ({ SurfaceGroup: none }));
vi.mock('@/components/star-rating-display', () => ({ StarRatingDisplay: none }));
vi.mock('@/components/service-mark', () => ({ ServiceMark: none }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: () => (b.chatRead ?? (() => Promise.resolve({ data: b.chatRows, error: null })))() } }));
vi.mock('@/lib/booking-records', async importOriginal => {
  const read = () => { b.detailReads++; return (b.detailRead ?? (() => Promise.resolve(b.detailRows)))(); };
  return { ...await importOriginal<any>(), loadClientBookings: read, loadWorkerBookings: read };
});
vi.mock('@/lib/payments', async importOriginal => ({ ...await importOriginal<any>(),
  fetchBookingPayments: async (ids: string[]) => new Map(ids.map(id => [id, { id: 'payment', payment_method: 'cod', payment_status: 'pending' }])) }));
vi.mock('@/lib/job-payment', async importOriginal => ({ ...await importOriginal<any>(), fetchJobPaymentMethod: async () => 'cash' }));
vi.mock('@/lib/job-photos', async importOriginal => ({ ...await importOriginal<any>(), listJobPhotos: async () => [] }));
vi.mock('@/lib/ratings', async importOriginal => ({ ...await importOriginal<any>(), fetchMyRatedBookingIds: async () => new Set() }));
vi.mock('@/lib/reports', async importOriginal => ({ ...await importOriginal<any>(), loadMyReportedBookingIds: async () => new Set() }));
vi.mock('@/lib/job-location', async importOriginal => ({ ...await importOriginal<any>(),
  getAuthorizedJobLocation: async () => { throw new Error('synthetic: location is not under test'); } }));
vi.mock('@/lib/realtime', async importOriginal => ({ ...await importOriginal<any>(),
  subscribeInvalidation: (options: any) => { b.invalidations.add(options); return () => { b.invalidations.delete(options); }; } }));
vi.mock('@/lib/messages', async importOriginal => ({ ...await importOriginal<any>(),
  fetchBookingMessages: async () => b.messages, sendBookingMessage: async () => { throw new Error('No sends under test'); } }));
vi.mock('@/providers/account-provider', () => ({ useAccount: () => ({ account: { id: b.me, role: 'client', is_active: true }, status: 'resolved' }) }));
vi.mock('@/providers/session-provider', () => ({ useSession: () => ({ session: { user: { id: b.me } }, sessionLifetime: b.lifetime }) }));

const B = '11111111-1111-4111-8111-111111111111';
const ids = Array.from({ length: 6 }, (_, i) => `3333333${i}-3333-4333-8333-333333333333`);
const detailRow = { booking_id: B, job_id: '22222222-2222-4222-8222-222222222222', booking_status: 'confirmed', payment_status: 'unpaid',
  booked_at: '2030-12-30T07:00:00Z', completed_at: null, job_title: 'Synthetic repair', job_description: 'Synthetic description',
  job_scheduled_at: '2030-12-31T07:00:00Z', job_address: 'SYNTHETIC ADDRESS', job_barangay: 'Santa Ana', job_city: 'Pateros', job_budget: 1500,
  worker_user_id: '66666666-6666-4666-8666-666666666666', worker_full_name: 'Synthetic Worker', worker_phone: '09170000000',
  worker_barangay: 'Santa Ana', worker_skills: ['Plumbing'], worker_is_verified: true, worker_rating_avg: 4.9, worker_rating_count: 3 };
const chatRow = { booking_id: B, booking_status: 'confirmed', job_title: 'Synthetic repair', client_full_name: 'C', worker_full_name: 'W' };
type Route = { key: string; name: string; params?: Record<string, string> };
const tabs = (screen = 'client/bookings'): Route => ({ key: 'tabs', name: '(tabs)', params: { screen } });
const details = (key = 'details'): Route => ({ key, name: 'client/booking-details', params: { bookingId: B } });
const chat = (key = 'chat'): Route => ({ key, name: 'client/chat', params: { bookingId: B } });
const stackState = (routes: Route[], index = routes.length - 1) =>
  ({ stale: false, type: 'stack', key: 'client-stack', index, routeNames: b.routeNames, routes, preloadedRoutes: [] });
function deferred<T = any>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const subscribe = (fn: () => void) => { b.nav.listeners.add(fn); return () => { b.nav.listeners.delete(fn); }; };
const useNavState = () => useSyncExternalStore(subscribe, () => b.nav.state);

/** The RootLayout's continuation observation of the focused role stack (it runs after its screens' layout effects). */
function RootObserver() {
  const state = useNavState();
  useLayoutEffect(() => {
    const stack = stackFromNavigationState({ index: 0, routes: [{ name: '(client)', state }] });
    const top = stack?.[stack.length - 1] ?? { pathname: '/client', params: {} };
    sessionRouteContinuation.observe({ access: 'client', ownerId: b.me, lifetime: b.lifetime, pathname: top.pathname, params: top.params, stack });
  }, [state]);
  return null;
}
/** A hook probe for a route: the shared restore hook with a scripted read outcome (guard isolation). */
const probeOutcomes = new Map<string, ContinuationReadOutcome>();
function ProbeScreen({ routeKey }: { routeKey: string }) {
  useNavState(); // re-render on every store change so a newly scripted outcome is read
  useSessionContinuationRestore('client', probeOutcomes.get(routeKey) ?? 'pending');
  return null;
}
let probes = false;
function Screen({ route }: { route: Route }) {
  useEffect(() => { b.mounts.set(route.key, (b.mounts.get(route.key) ?? 0) + 1); }, [route.key]);
  if (probes) return createElement(ProbeScreen, { routeKey: route.key });
  if (route.name === 'client/booking-details') return createElement(BookingDetails, { role: 'client', bookingId: route.params?.bookingId ?? null });
  if (route.name === 'client/chat') return createElement(BookingChat, { role: 'client', bookingId: route.params?.bookingId ?? null });
  return null;
}
function Navigator({ observe }: { observe: boolean }) {
  const state = useNavState();
  return createElement(Fragment, null,
    ...state.routes.map((route: Route) => createElement(b.RouteContext.Provider, { key: route.key, value: route }, createElement(Screen, { route }))),
    observe ? createElement(RootObserver, { key: 'root-observer' }) : null);
}
type Root = { render(node: unknown): void; unmount(): void };
const roots: Root[] = [];
async function settle(rounds = 25) { for (let i = 0; i < rounds; i++) await act(async () => { await Promise.resolve(); }); }
async function mount(initial: ReturnType<typeof stackState>, observe = true) {
  b.nav.state = initial;
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const rendererModule: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ rendererModule);
  const root = renderer.createRoot(container) as Root; roots.push(root);
  await act(async () => root.render(createElement(Navigator, { observe })));
  await settle();
}
const setNav = (next: ReturnType<typeof stackState>) => act(async () => {
  b.nav.state = next; for (const listener of [...b.nav.listeners]) listener();
});
/** A same-lifetime refresh: the user's real stack, root pending teardown, fresh access, then re-entry. */
function refreshReentry(before: { pathname: string; params: Record<string, string> }[], anchor?: string) {
  const top = before[before.length - 1];
  const observation = { access: 'client', ownerId: b.me, lifetime: b.lifetime, pathname: top.pathname, params: top.params, stack: before };
  sessionRouteContinuation.observe(observation);
  if (anchor) sessionRouteContinuation.rememberChatAnchor(observation, { bookingId: B, messageId: anchor, offset: 37.5 });
  sessionRouteContinuation.observe({ ...observation, access: 'account-pending', pathname: '/', params: {}, stack: undefined });
  expect(sessionRouteContinuation.destination('client', b.me, b.lifetime)).toEqual({ pathname: top.pathname, params: top.params });
}
type Entry = { pathname: string; params: Record<string, string> };
const DETAILS_STACK: Entry[] = [{ pathname: '/client/bookings', params: {} }, { pathname: '/client/booking-details', params: { bookingId: B } }];
const CHAT_STACK: Entry[] = [...DETAILS_STACK, { pathname: '/client/chat', params: { bookingId: B } }];
const home = { index: 0, routes: [{ name: '(tabs)', params: { screen: 'client/index' } }] };
const invalidate = () => act(async () => { for (const options of [...b.invalidations]) options.onInvalidate?.(); });
const layoutRows = () => act(async () => { b.rows.slice().forEach((onLayout, i) => onLayout({ nativeEvent: { layout: { y: 100 * i, height: 100 } } })); });
const measure = () => act(async () => { b.scroll.onLayout({ nativeEvent: { layout: { height: 500 } } }); b.scroll.onContentSizeChange(1080, 600); });

beforeEach(() => {
  sessionRouteContinuation.clear(); probes = false; probeOutcomes.clear();
  Object.assign(b.nav, { state: null, resets: [], rejected: [], tamper: null }); b.nav.listeners.clear();
  b.detailRead = null; b.detailRows = [detailRow]; b.detailReads = 0; b.chatRead = null; b.chatRows = [chatRow];
  b.messages = ids.map((id, i) => ({ id, sender_id: i % 2 ? b.me : 'other', content: `synthetic ${i}`, created_at: `2026-10-21T00:0${i}:00Z` }));
  b.statuses = []; b.invalidations.clear(); b.mounts.clear(); b.rows = []; b.scroll = null;
  b.scrollTo.mockReset(); b.scrollToEnd.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  // Every reset the screens dispatched was a real StackRouter-valid reset of the role Stack.
  expect(b.nav.rejected).toEqual([]);
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('Option B rework: Booking Details destination (actual component, hook and StackRouter)', () => {
  it('restores after its own read, keeps the mounted route, and a later unavailability stays inline (no Home reset)', async () => {
    refreshReentry(DETAILS_STACK);
    await mount(stackState([details()]));
    expect(b.nav.resets).toEqual([{ index: 1, routes: [{ name: '(tabs)', params: { screen: 'client/bookings' } }, expect.objectContaining({ key: 'details' })] }]);
    expect(b.nav.state.routes.map((r: Route) => r.key)).toEqual([expect.stringMatching(/^\(tabs\)-/), 'details']);
    expect(b.mounts.get('details')).toBe(1);
    // N-1 closeout: dispatched, not confirmed, even though this synchronous store already reports the exact chain.
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('unconfirmed');
    // An ordinary later render/observation of the rebuilt stack, then the booking leaves the participant list.
    await setNav(stackState([...b.nav.state.routes]));
    b.detailRows = [];
    await invalidate(); await settle();
    expect(b.statuses).toContain('This booking is unavailable.');
    expect(b.nav.resets).toHaveLength(1);
    expect(b.nav.state.routes.at(-1).key).toBe('details');
  });

  it('a preserved user-built stack leaves no stale restore: no reset now and none after a later unavailability', async () => {
    refreshReentry(DETAILS_STACK);
    await mount(stackState([tabs(), details()]));
    expect(b.nav.resets).toEqual([]);
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('preserved');
    b.detailRows = [];
    await invalidate(); await settle();
    expect(b.statuses).toContain('This booking is unavailable.');
    expect(b.nav.resets).toEqual([]);
  });

  it('a destination unavailable while the restore is genuinely pending still takes the own-role Home fallback', async () => {
    refreshReentry(DETAILS_STACK); b.detailRows = [];
    await mount(stackState([details()]));
    expect(b.nav.resets).toEqual([home]);
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('fallback');
  });
});

// N-1 closeout (2026-10-21): the hook records a dispatched rebuild as `unconfirmed` whatever the Stack reports
// afterwards; it never claims `restored`. Stack correctness is asserted separately (here on the store, and on the
// real builder in session-continuation-restore.real-builder.test.ts); neither is native Back acceptance.
describe('Option B N-1 closeout: a dispatched rebuild is recorded as unconfirmed, never restored', () => {
  const OTHER = '99999999-9999-4999-8999-999999999999';
  it.each([
    ['exactly the requested chain', null],
    ['a different parent booking ID', (s: any) => ({ ...s, routes: s.routes.map((r: Route) => r.name === 'client/booking-details' ? { ...r, params: { bookingId: OTHER } } : r) })],
    ['a different tab', (s: any) => ({ ...s, routes: s.routes.map((r: Route) => r.name === '(tabs)' ? { ...r, params: { screen: 'client/index' } } : r) })],
    ['an extra parent', (s: any) => ({ ...s, index: s.index + 1, routes: [s.routes[0], details('extra'), ...s.routes.slice(1)] })],
  ] as const)('a rebuilt stack reporting %s is unconfirmed', async (_label, tamper) => {
    refreshReentry(CHAT_STACK, ids[3]); b.nav.tamper = tamper;
    await mount(stackState([chat()]));
    expect(b.nav.resets).toEqual([{ index: 2, routes: [{ name: '(tabs)', params: { screen: 'client/bookings' } },
      { name: 'client/booking-details', params: { bookingId: B } }, expect.objectContaining({ key: 'chat' })] }]);
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('unconfirmed');
  });
  it('the untampered store holds the exact requested chain beneath the kept top route', async () => {
    refreshReentry(CHAT_STACK, ids[3]);
    await mount(stackState([chat()]));
    expect(b.nav.state.routes.map((r: Route) => [r.name, r.params])).toEqual([
      ['(tabs)', { screen: 'client/bookings' }], ['client/booking-details', { bookingId: B }], ['client/chat', { bookingId: B }]]);
    expect(b.nav.state.routes.at(-1).key).toBe('chat'); expect(b.mounts.get('chat')).toBe(1);
  });
});

describe('Option B rework: hidden parents never act for the focused destination', () => {
  it('Chat B in front of a rebuilt, unfocused Booking Details B: the parent neither reads nor acts; Chat completes its own restoration', async () => {
    refreshReentry(CHAT_STACK, ids[3]);
    const chatRead = deferred(); b.chatRead = () => chatRead.promise;
    await mount(stackState([tabs(), details('parent'), chat()]));
    // The hidden parent is focus-gated: no read, no reset, nothing consumed.
    expect(b.detailReads).toBe(0); expect(b.nav.resets).toEqual([]);
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('none');
    await act(async () => { chatRead.resolve({ data: [chatRow], error: null }); }); await settle();
    await measure(); await layoutRows();
    // The existing stack is kept and Chat's own anchor is applied: the restoration completes for Chat alone.
    expect(b.nav.resets).toEqual([]);
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('preserved');
    expect(b.scrollTo).toHaveBeenCalledWith({ y: 337.5, animated: false });
    expect(b.mounts.get('parent')).toBe(1); expect(b.mounts.get('chat')).toBe(1);
  });

  it.each([['unavailable', [] as unknown[]], ['authorized', [chatRow]]] as const)(
    'Booking Details B in front of a hidden Chat B parent whose own read is %s first: no abandonment and nothing consumed', async (_label, rows) => {
      refreshReentry([{ pathname: '/client/bookings', params: {} }, { pathname: '/client/chat', params: { bookingId: B } },
        { pathname: '/client/booking-details', params: { bookingId: B } }]);
      const detailRead = deferred<unknown[]>(); b.detailRead = () => detailRead.promise;
      b.chatRows = [...rows];
      await mount(stackState([tabs(), chat('parent'), details()]));
      // The hidden Chat read settled while the global route is Booking Details B.
      expect(b.nav.resets).toEqual([]);
      expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('none');
      await act(async () => { detailRead.resolve([detailRow]); }); await settle();
      expect(b.nav.resets).toEqual([]);
      expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('preserved');
    });
});

describe('Option B rework: the shared hook acts only for the focused calling route (guard isolation)', () => {
  // Scripted outcomes on probe routes; the root observation is omitted so ONLY the hook guard stands between a
  // hidden or no-longer-focused route and the saved restoration.
  it.each(['unavailable', 'ready'] as const)('a hidden parent probe for the same booking reporting %s first does not abandon or consume', async outcome => {
    probes = true;
    refreshReentry(CHAT_STACK, ids[3]);
    await mount(stackState([details('parent'), chat()]), false);
    sessionRouteContinuation.observe({ access: 'client', ownerId: b.me, lifetime: b.lifetime, pathname: '/client/chat', params: { bookingId: B }, stack: [CHAT_STACK[2]] });
    probeOutcomes.set('parent', outcome); await setNav(stackState([...b.nav.state.routes]));
    expect(b.nav.resets).toEqual([]);
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('none');
    // The focused Chat route still owns its restoration and its reading anchor.
    probeOutcomes.set('chat', 'ready'); await setNav(stackState([...b.nav.state.routes]));
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('preserved');
    expect(sessionRouteContinuation.takeChatAnchor({ access: 'client', ownerId: b.me, lifetime: b.lifetime, pathname: '/client/chat', params: { bookingId: B } }, B))
      .toEqual({ bookingId: B, messageId: ids[3], offset: 37.5 });
  });

  it.each(['unavailable', 'ready'] as const)('a destination read that resolves %s after its route lost focus does nothing', async outcome => {
    probes = true;
    refreshReentry(DETAILS_STACK);
    await mount(stackState([details()]), false);
    await setNav(stackState([details(), chat('pushed')]));
    probeOutcomes.set('details', outcome); await setNav(stackState([...b.nav.state.routes]));
    expect(b.nav.resets).toEqual([]);
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('none');
  });
});

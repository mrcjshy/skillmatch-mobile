import { act, createElement, forwardRef, useEffect, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BookingChat from './booking-chat';
import { sessionRouteContinuation } from '@/lib/session-route-continuation';

// Option B (2026-10-21): the actual BookingChat with the actual continuation singleton. Only native primitives,
// the participant/message reads and navigation are scripted. No device, network or database.
const b = vi.hoisted(() => ({
  role: 'client' as 'client' | 'worker', me: '', bookingRows: [] as unknown[], messages: [] as { id: string; sender_id: string; content: string; created_at: string }[],
  fetchFails: false, rpcs: [] as string[], scroll: null as any, rows: [] as ((e: any) => void)[],
  scrollTo: vi.fn(), scrollToEnd: vi.fn(), reset: vi.fn(), send: vi.fn(), navState: null as any,
  lifetime: { ownerId: '', isCurrent: () => true },
  // Follow-up: whether the role stack (and its ancestors) report this Chat route focused; ScrollView mounts.
  focused: true, scrollMounts: 0,
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock('@/components/skeleton', () => ({ Skeleton: () => null, PulseDots: () => null, KeyboardSpacer: () => null }));
vi.mock('react-native', () => {
  const pass = ({ children }: any) => children ?? null;
  const ScrollView = forwardRef(function ScrollView(props: any, ref: any) {
    b.scroll = props; b.rows = [];
    useEffect(() => { b.scrollMounts++; }, []);
    useImperativeHandle(ref, () => ({ scrollTo: b.scrollTo, scrollToEnd: b.scrollToEnd }));
    return props.children ?? null;
  });
  return { KeyboardAvoidingView: pass, Pressable: () => null, RefreshControl: () => null, View: pass, Text: () => null, ScrollView,
    StyleSheet: { create: (styles: unknown) => styles }, Platform: { OS: 'android', select: (v: any) => v.android ?? v.default } };
});
vi.mock('tamagui', () => ({
  XStack: ({ children, onLayout }: any) => { if (onLayout) b.rows.push(onLayout); return children ?? null; },
  YStack: ({ children }: any) => children ?? null,
}));
vi.mock('@/components/app-button', () => ({ AppButton: () => null }));
vi.mock('@/components/app-chip', () => ({ AppChip: () => null }));
vi.mock('@/components/app-field', () => ({ AppField: () => null }));
vi.mock('@/components/app-notice', () => ({ AppNotice: () => null }));
vi.mock('@/components/app-symbol', () => ({ AppSymbol: () => null }));
vi.mock('@/components/initials-avatar', () => ({ InitialsAvatar: () => null }));
vi.mock('@/components/inline-status', () => ({ InlineStatus: () => null }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (name: string) => { b.rpcs.push(name); return Promise.resolve({ data: b.bookingRows, error: null }); } } }));
vi.mock('@/lib/messages', async importOriginal => ({ ...await importOriginal<any>(),
  fetchBookingMessages: async () => { if (b.fetchFails) throw new Error('synthetic read failure'); return b.messages; },
  sendBookingMessage: b.send }));
vi.mock('@/lib/realtime', async importOriginal => ({ ...await importOriginal<any>(), subscribeInvalidation: () => () => {} }));
vi.mock('expo-router', () => ({
  usePathname: () => `/${b.role}/chat`, useGlobalSearchParams: () => ({ bookingId }),
  // Rework: the reset is applied to the scripted stack (keys kept, as the router does) so completion is observable,
  // and the screen identifies itself by its own route key while focused.
  useNavigation: () => ({ getState: () => b.navState, isFocused: () => b.focused, reset: (next: any) => {
    b.reset(next);
    b.navState = { ...next, routes: next.routes.map((route: any, i: number) => route.key ? route : { ...route, key: `restored-${i}` }) };
  } }),
  useRoute: () => ({ key: 'chat-route-key', name: `${b.role}/chat`, params: { bookingId } }), useIsFocused: () => b.focused,
}));
vi.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));
vi.mock('@/providers/account-provider', () => ({ useAccount: () => ({ account: { id: b.me, role: b.role, is_active: true }, status: 'resolved' }) }));
vi.mock('@/providers/session-provider', () => ({ useSession: () => ({ session: { user: { id: b.me } }, sessionLifetime: b.lifetime }) }));

const bookingId = '11111111-1111-4111-8111-111111111111', jobId = '22222222-2222-4222-8222-222222222222';
const ids = Array.from({ length: 6 }, (_, i) => `3333333${i}-3333-4333-8333-333333333333`);
const missingId = '44444444-4444-4444-8444-444444444444';
type Root = { render(node: unknown): void; unmount(): void };
const roots: Root[] = [];
async function render() {
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const rendererModule: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ rendererModule);
  const root = renderer.createRoot(container) as Root; roots.push(root);
  await act(async () => root.render(createElement(BookingChat, { role: b.role, bookingId })));
  for (let i = 0; i < 20; i++) await act(async () => { await Promise.resolve(); });
}
/** Re-renders the same mounted Chat (same element, same route key): a focus change, never a remount. */
async function rerender() {
  const root = roots[roots.length - 1];
  await act(async () => root.render(createElement(BookingChat, { role: b.role, bookingId })));
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}
const stackFor = (role: 'client' | 'worker') => role === 'client'
  ? [{ pathname: '/client', params: {} }, { pathname: '/client/job-details', params: { jobId } }, { pathname: '/client/chat', params: { bookingId } }]
  : [{ pathname: '/worker', params: {} }, { pathname: '/worker/booking-details', params: { bookingId } }, { pathname: '/worker/chat', params: { bookingId } }];
const observation = (role: 'client' | 'worker', stack = stackFor(role)) =>
  ({ access: role, ownerId: b.me, lifetime: b.lifetime, pathname: `/${role}/chat`, params: { bookingId }, stack });
/** A same-lifetime refresh: the saved reader position, root pending teardown, fresh access, re-entry alone. */
function refreshReentry(role: 'client' | 'worker', anchor: string | null) {
  const before = observation(role);
  sessionRouteContinuation.observe(before);
  if (anchor) sessionRouteContinuation.rememberChatAnchor(before, { bookingId, messageId: anchor, offset: 37.5 });
  sessionRouteContinuation.observe({ ...before, access: 'account-pending', pathname: '/', params: {}, stack: undefined });
  expect(sessionRouteContinuation.destination(role, b.me, b.lifetime)).not.toBeNull();
  sessionRouteContinuation.observe(observation(role, [stackFor(role)[2]]));
}
const layoutRows = () => act(async () => { b.rows.slice().forEach((onLayout, i) => onLayout({ nativeEvent: { layout: { y: 100 * i, height: 100 } } })); });
const measure = () => act(async () => {
  b.scroll.onLayout({ nativeEvent: { layout: { height: 500 } } });
  b.scroll.onContentSizeChange(1080, 600);
});

describe.each(['client', 'worker'] as const)('Option B %s Chat continuation (actual BookingChat)', role => {
  beforeEach(() => {
    b.role = role; b.me = role === 'client' ? '55555555-5555-4555-8555-555555555555' : '66666666-6666-4666-8666-666666666666';
    b.lifetime = { ownerId: b.me, isCurrent: () => true };
    b.bookingRows = [{ booking_id: bookingId, booking_status: 'confirmed', job_title: 'Plumbing', client_full_name: 'C', worker_full_name: 'W' }];
    b.messages = ids.map((id, i) => ({ id, sender_id: i % 2 ? b.me : 'other', content: `synthetic ${i}`, created_at: `2026-10-21T00:0${i}:00Z` }));
    b.fetchFails = false; b.rpcs = []; b.rows = []; b.focused = true; b.scrollMounts = 0;
    b.navState = { index: 0, routes: [{ key: 'chat-route-key', name: `${role}/chat`, params: { bookingId } }] };
    for (const spy of [b.scrollTo, b.scrollToEnd, b.reset, b.send]) spy.mockReset();
    sessionRouteContinuation.clear();
  });
  afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); vi.unstubAllGlobals(); });

  it('after the fresh participant read, rebuilds the actual parent chain beneath the kept chat route', async () => {
    refreshReentry(role, ids[3]);
    const chatRoute = b.navState.routes[0];
    await render();
    const parents = role === 'client'
      ? [{ name: '(tabs)', params: { screen: 'client/index' } }, { name: 'client/job-details', params: { jobId } }]
      : [{ name: '(tabs)', params: { screen: 'worker/index' } }, { name: 'worker/booking-details', params: { bookingId } }];
    expect(b.reset).toHaveBeenCalledTimes(1);
    expect(b.reset).toHaveBeenCalledWith({ index: 2, routes: [...parents, chatRoute] });
    expect(b.navState.routes[2]).toBe(chatRoute);
    // N-1 closeout: the reset is recorded as dispatched, not as a confirmed rebuild.
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('unconfirmed');
  });

  it('restores the reading anchor once its message is laid out, instead of jumping to the latest', async () => {
    refreshReentry(role, ids[3]);
    await render(); await measure(); await layoutRows();
    expect(b.scrollTo).toHaveBeenCalledTimes(1);
    expect(b.scrollTo).toHaveBeenCalledWith({ y: 337.5, animated: false });
    await measure();
    expect(b.scrollToEnd).not.toHaveBeenCalled();
  });

  it('a missing anchor message falls back to the normal latest-message reveal from the fresh read', async () => {
    refreshReentry(role, missingId);
    await render(); await layoutRows(); await measure();
    expect(b.scrollTo).not.toHaveBeenCalled();
    expect(b.scrollToEnd).toHaveBeenCalled();
  });

  it("the reader's own drag cancels a restore that has not happened yet; it is never applied later", async () => {
    refreshReentry(role, ids[3]);
    await render();
    await act(async () => { b.scroll.onScrollBeginDrag(); });
    await measure(); await layoutRows(); await measure();
    expect(b.scrollTo).not.toHaveBeenCalled();
    expect(b.scrollToEnd).not.toHaveBeenCalled();
  });

  it('no anchor is applied when the fresh history read fails', async () => {
    refreshReentry(role, ids[3]); b.fetchFails = true;
    await render(); await layoutRows(); await measure();
    expect(b.scrollTo).not.toHaveBeenCalled(); expect(b.reset).not.toHaveBeenCalled();
  });

  it("a Booking the fresh read does not return takes the own-role Home fallback, with no anchor", async () => {
    refreshReentry(role, ids[3]); b.bookingRows = [];
    await render(); await layoutRows();
    expect(b.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(tabs)', params: { screen: `${role}/index` } }] });
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('fallback');
    expect(b.scrollTo).not.toHaveBeenCalled();
  });

  it('captures only a message id and offset while the reader is away, and clears it at the latest message', async () => {
    sessionRouteContinuation.observe(observation(role));
    await render(); await measure(); await layoutRows();
    const scroll = (y: number) => act(async () => { b.scroll.onScroll({ nativeEvent: { contentOffset: { y }, contentSize: { height: 600 }, layoutMeasurement: { height: 300 } } }); });
    // The first-open reveal pins to the latest; the reader's drag hands the position back to them.
    await act(async () => { b.scroll.onScrollBeginDrag(); });
    await scroll(250); // 50 dp from the bottom: following the latest, so nothing is kept
    const peek = () => {
      sessionRouteContinuation.observe({ ...observation(role), access: 'account-pending', pathname: '/', params: {}, stack: undefined });
      sessionRouteContinuation.destination(role, b.me, b.lifetime);
      const landed = observation(role, [stackFor(role)[2]]);
      sessionRouteContinuation.observe(landed);
      const anchor = sessionRouteContinuation.takeChatAnchor(landed, bookingId);
      sessionRouteContinuation.observe(observation(role)); // back to the ordinary chat stack
      return anchor;
    };
    expect(peek()).toBeNull();
    await act(async () => { b.scroll.onScrollBeginDrag(); });
    await scroll(150); // backreading: row 1 spans 100–200
    expect(peek()).toEqual({ bookingId, messageId: ids[1], offset: 50 });
  });

  // Follow-up (independent review, 2026-10-21): the anchor is consumed only once this Chat route owns focus.
  const scrollTo = (y: number) => act(async () => { b.scroll.onScroll({ nativeEvent: { contentOffset: { y }, contentSize: { height: 600 }, layoutMeasurement: { height: 300 } } }); });
  const peekAnchor = () => {
    sessionRouteContinuation.observe({ ...observation(role), access: 'account-pending', pathname: '/', params: {}, stack: undefined });
    sessionRouteContinuation.destination(role, b.me, b.lifetime);
    const landed = observation(role, [stackFor(role)[2]]);
    sessionRouteContinuation.observe(landed);
    return sessionRouteContinuation.takeChatAnchor(landed, bookingId);
  };
  it('follow-up: rows resolved while the stack is unfocused keep the anchor attempt; focus applies it exactly once, without remount', async () => {
    refreshReentry(role, ids[3]); b.focused = false;
    await render();
    expect(b.reset).not.toHaveBeenCalled(); expect(b.scrollTo).not.toHaveBeenCalled();
    b.focused = true; await rerender();
    await measure(); await layoutRows(); await measure(); await layoutRows();
    expect(b.scrollTo).toHaveBeenCalledTimes(1);
    expect(b.scrollTo).toHaveBeenCalledWith({ y: 337.5, animated: false });
    expect(b.scrollToEnd).not.toHaveBeenCalled();
    expect(b.scrollMounts).toBe(1); expect(b.navState.routes.at(-1).key).toBe('chat-route-key');
    expect(b.reset).toHaveBeenCalledTimes(1);
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('unconfirmed');
    // Reading-position capture works afterwards (row 1 spans 100–200).
    await act(async () => { b.scroll.onScrollBeginDrag(); });
    await scrollTo(150);
    expect(peekAnchor()).toEqual({ bookingId, messageId: ids[1], offset: 50 });
  });

  it('follow-up: a Chat that never gains focus stays inert and leaves the anchor for its owner', async () => {
    refreshReentry(role, ids[3]); b.focused = false;
    await render(); await layoutRows(); await measure();
    expect(b.scrollTo).not.toHaveBeenCalled(); expect(b.reset).not.toHaveBeenCalled();
    expect(sessionRouteContinuation.takeChatAnchor(observation(role, [stackFor(role)[2]]), bookingId))
      .toEqual({ bookingId, messageId: ids[3], offset: 37.5 });
  });

  it('follow-up: a reader cancellation stays permanent across a later focus change', async () => {
    refreshReentry(role, ids[3]);
    await render();
    await act(async () => { b.scroll.onScrollBeginDrag(); });
    b.focused = false; await rerender(); b.focused = true; await rerender();
    await measure(); await layoutRows(); await measure();
    expect(b.scrollTo).not.toHaveBeenCalled();
  });

  it('never replays a business action: no send and only the participant list read', async () => {
    refreshReentry(role, ids[3]);
    await render(); await measure(); await layoutRows();
    expect(b.send).not.toHaveBeenCalled();
    expect(new Set(b.rpcs)).toEqual(new Set([role === 'worker' ? 'list_my_worker_bookings' : 'list_my_client_bookings']));
  });
});

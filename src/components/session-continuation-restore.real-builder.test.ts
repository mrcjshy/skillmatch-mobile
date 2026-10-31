import { act, createElement, Fragment, useLayoutEffect, useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Option B N-1 closeout (2026-10-21), from the final-verification Agent C probe: the actual restore hook inside
// expo-router 57's vendored React Navigation core (BaseNavigationContainer, useNavigationBuilder with StackRouter, a
// root Stack and a nested role-group Stack). Only the native-stack VIEW is replaced (every route stays mounted, as in a
// native stack); router, builder, store and navigation objects are the real ones. The hook's navigation is wrapped
// only to count the resets it dispatches and what getState() reports synchronously after each.
// Two separate claims are tested: (A) the diagnostic records a dispatched reset as `unconfirmed`, never as a confirmed
// rebuild; (B) the container, inspected independently after the builder commits, holds the requested stack. Neither
// is native Back acceptance: no native stack, nested Tabs navigator or device is involved.
const h = vi.hoisted(() => ({
  me: '55555555-5555-4555-8555-555555555555',
  lifetime: { ownerId: '55555555-5555-4555-8555-555555555555', isCurrent: () => true },
  outcome: 'ready' as 'pending' | 'ready' | 'unavailable', tick: 0, listeners: new Set<() => void>(),
  mounts: new Map<string, number>(), unmounts: new Map<string, number>(),
  resets: [] as any[], afterReset: [] as any[], wrappers: new WeakMap<object, unknown>(),
}));
vi.mock('expo-router', async () => {
  const core = await import('expo-router/build/react-navigation/core') as any;
  const useNavigation = () => {
    const navigation = core.useNavigation();
    if (!h.wrappers.has(navigation)) h.wrappers.set(navigation, { ...navigation,
      reset: (payload: any) => { h.resets.push(payload); navigation.reset(payload); h.afterReset.push(navigation.getState()); } });
    return h.wrappers.get(navigation);
  };
  return { useNavigation, useRoute: core.useRoute, useIsFocused: core.useIsFocused };
});
vi.mock('@/providers/account-provider', () => ({ useAccount: () => ({ account: { id: h.me, role: 'client', is_active: true }, status: 'resolved' }) }));
vi.mock('@/providers/session-provider', () => ({ useSession: () => ({ session: { user: { id: h.me } }, sessionLifetime: h.lifetime }) }));

const B = '11111111-1111-4111-8111-111111111111';
const ANCHOR = '33333333-3333-4333-8333-333333333333';
type Root = { render(node: unknown): void; unmount(): void };
const roots: Root[] = [];
async function settle(rounds = 25) { for (let i = 0; i < rounds; i++) await act(async () => { await Promise.resolve(); }); }
const subscribe = (fn: () => void) => { h.listeners.add(fn); return () => { h.listeners.delete(fn); }; };
/** Re-renders every destination screen so a newly scripted read outcome reaches the hook. */
const rerender = (outcome: typeof h.outcome) => act(async () => { h.outcome = outcome; h.tick++; for (const fn of [...h.listeners]) fn(); });

async function mount(groupRoutes: object[]) {
  const core = await import('expo-router/build/react-navigation/core') as any;
  const { StackRouter } = await import('expo-router/build/react-navigation/routers') as any;
  const { useSessionContinuationRestore } = await import('@/hooks/use-session-continuation-restore');
  function StackView(props: any) {
    const { state, descriptors, NavigationContent } = core.useNavigationBuilder(StackRouter, props);
    return createElement(NavigationContent, null, ...state.routes.map((route: any) => createElement(Fragment, { key: route.key }, descriptors[route.key].render())));
  }
  const createStack = core.createNavigatorFactory(StackView);
  const RootStack = createStack(); const Group = createStack();
  function Destination() {
    const route = core.useRoute();
    useSyncExternalStore(subscribe, () => h.tick);
    useLayoutEffect(() => {
      h.mounts.set(route.key, (h.mounts.get(route.key) ?? 0) + 1);
      return () => { h.unmounts.set(route.key, (h.unmounts.get(route.key) ?? 0) + 1); };
    }, [route.key]);
    useSessionContinuationRestore('client', h.outcome);
    return null;
  }
  const Empty = () => null;
  function ClientGroup() {
    return createElement(Group.Navigator, null,
      createElement(Group.Screen, { name: '(tabs)', component: Empty }),
      createElement(Group.Screen, { name: 'client/booking-details', component: Destination }),
      createElement(Group.Screen, { name: 'client/chat', component: Destination }));
  }
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const rendererModule: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ rendererModule);
  const root = renderer.createRoot(container) as Root; roots.push(root);
  const ref = core.createNavigationContainerRef();
  const initialState = { routes: [{ name: '(client)', state: { routes: groupRoutes } }] };
  await act(async () => root.render(createElement(core.BaseNavigationContainer, { ref, initialState },
    createElement(RootStack.Navigator, null, createElement(RootStack.Screen, { name: '(client)', component: ClientGroup })))));
  await settle();
  return ref;
}

type Entry = { pathname: string; params: Record<string, string> };
const DETAILS_STACK: Entry[] = [{ pathname: '/client/bookings', params: {} }, { pathname: '/client/booking-details', params: { bookingId: B } }];
const CHAT_STACK: Entry[] = [...DETAILS_STACK, { pathname: '/client/chat', params: { bookingId: B } }];
const detailsRoute = { key: 'details', name: 'client/booking-details', params: { bookingId: B } };
const chatRoute = { key: 'chat', name: 'client/chat', params: { bookingId: B } };
const observationOf = (top: Entry) => ({ access: 'client', ownerId: h.me, lifetime: h.lifetime as any, pathname: top.pathname, params: top.params });
/** A same-lifetime refresh: the user's real stack, root pending teardown, then the root observing the re-entered destination alone. */
async function refreshReentry(before: Entry[], anchor?: string) {
  const { sessionRouteContinuation } = await import('@/lib/session-route-continuation');
  const top = before[before.length - 1], observation = { ...observationOf(top), stack: before };
  sessionRouteContinuation.observe(observation);
  if (anchor) sessionRouteContinuation.rememberChatAnchor(observation, { bookingId: B, messageId: anchor, offset: 12 });
  sessionRouteContinuation.observe({ ...observation, access: 'account-pending', pathname: '/', params: {}, stack: undefined });
  expect(sessionRouteContinuation.destination('client', h.me, h.lifetime as any)).toEqual(top);
  sessionRouteContinuation.observe({ ...observation, stack: [top] });
  return sessionRouteContinuation;
}
const groupState = (ref: any) => ref.getRootState().routes[0].state;
const shape = (state: any) => state.routes.map((r: any) => [r.name, r.params]);

beforeEach(async () => {
  const { sessionRouteContinuation } = await import('@/lib/session-route-continuation');
  sessionRouteContinuation.clear(); h.outcome = 'ready'; h.tick = 0; h.listeners.clear();
  h.mounts.clear(); h.unmounts.clear(); h.resets = []; h.afterReset = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Option B N-1 closeout: restore hook on the real vendored React Navigation builder', () => {
  it('A. diagnostic: the dispatched reset is recorded as unconfirmed, never as a confirmed rebuild', async () => {
    const continuation = await refreshReentry(DETAILS_STACK);
    await mount([detailsRoute]);
    expect(h.resets).toEqual([{ index: 1, routes: [{ name: '(tabs)', params: { screen: 'client/bookings' } }, expect.objectContaining({ key: 'details' })] }]);
    // Why no confirmation is read there: straight after reset() the real builder still reports the pre-reset stack.
    expect(h.afterReset.map(shape)).toEqual([[['client/booking-details', { bookingId: B }]]]);
    expect(continuation.lastRestoreOutcome()).toBe('unconfirmed');
    // The restoration is retired, not left pending: nothing more to hand out and no later fallback.
    expect(continuation.takeParentChain(observationOf(DETAILS_STACK[1]))).toBeNull();
    expect(continuation.abandonRestore(observationOf(DETAILS_STACK[1]))).toBe(false);
  });

  it('B. functional: after the builder commits, the container holds the requested parents beneath the kept, once-mounted route', async () => {
    await refreshReentry(DETAILS_STACK);
    const ref = await mount([detailsRoute]);
    const state = groupState(ref);
    expect(ref.getRootState().routes.map((r: any) => r.name)).toEqual(['(client)']);
    expect(state.index).toBe(1);
    expect(shape(state)).toEqual([['(tabs)', { screen: 'client/bookings' }], ['client/booking-details', { bookingId: B }]]);
    expect(state.routes[1].key).toBe('details');
    expect(h.mounts.get('details')).toBe(1); expect(h.unmounts.get('details') ?? 0).toBe(0);
    expect(h.resets).toHaveLength(1);
  });

  it('B. Chat: both parents are rebuilt beneath the kept Chat route; the anchor step stays for Chat and is consumed once', async () => {
    const continuation = await refreshReentry(CHAT_STACK, ANCHOR);
    const ref = await mount([chatRoute]);
    const state = groupState(ref);
    expect(state.index).toBe(2);
    expect(shape(state)).toEqual([['(tabs)', { screen: 'client/bookings' }], ['client/booking-details', { bookingId: B }], ['client/chat', { bookingId: B }]]);
    expect(state.routes[2].key).toBe('chat');
    expect(h.mounts.get('chat')).toBe(1); expect(h.unmounts.get('chat') ?? 0).toBe(0);
    expect(continuation.lastRestoreOutcome()).toBe('unconfirmed');
    // The parent step is done; Chat's separately required anchor step remains until Chat consumes it.
    expect(continuation.takeParentChain(observationOf(CHAT_STACK[2]))).toBeNull();
    expect(continuation.takeChatAnchor(observationOf(CHAT_STACK[2]), B)).toEqual({ bookingId: B, messageId: ANCHOR, offset: 12 });
    expect(continuation.takeChatAnchor(observationOf(CHAT_STACK[2]), B)).toBeNull();
    expect(h.resets).toHaveLength(1);
  });

  it('a later unavailability of the restored destination stays the screen\'s own state: no further reset', async () => {
    const continuation = await refreshReentry(DETAILS_STACK);
    const ref = await mount([detailsRoute]);
    await rerender('unavailable'); await settle();
    expect(h.resets).toHaveLength(1);
    expect(shape(groupState(ref))).toEqual([['(tabs)', { screen: 'client/bookings' }], ['client/booking-details', { bookingId: B }]]);
    expect(continuation.lastRestoreOutcome()).toBe('unconfirmed');
  });

  it('an existing user-built stack is preserved: no reset', async () => {
    const continuation = await refreshReentry(DETAILS_STACK);
    const ref = await mount([{ key: 'tabs', name: '(tabs)', params: { screen: 'client/bookings' } }, detailsRoute]);
    expect(h.resets).toEqual([]);
    expect(continuation.lastRestoreOutcome()).toBe('preserved');
    expect(groupState(ref).routes.map((r: any) => r.key)).toEqual(['tabs', 'details']);
  });

  it('initial unavailability while the restore is armed resets the role Stack to own-role Home', async () => {
    const continuation = await refreshReentry(DETAILS_STACK); h.outcome = 'unavailable';
    const ref = await mount([detailsRoute]);
    expect(h.resets).toEqual([{ index: 0, routes: [{ name: '(tabs)', params: { screen: 'client/index' } }] }]);
    expect(continuation.lastRestoreOutcome()).toBe('fallback');
    expect(shape(groupState(ref))).toEqual([['(tabs)', { screen: 'client/index' }]]);
  });
});

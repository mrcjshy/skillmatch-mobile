import { describe, expect, it } from 'vitest';
import { createSessionRouteContinuation, stackFromNavigationState } from './session-route-continuation';

// Option B (2026-10-21): the same in-memory, owner+lifetime-scoped intent also carries the actual allowlisted
// parent chain and one Chat anchor. Nothing here authorizes anything; the root still derives fresh access first.
const bookingId = '11111111-1111-4111-8111-111111111111', jobId = '22222222-2222-4222-8222-222222222222';
const messageId = '33333333-3333-4333-8333-333333333333', otherBooking = '44444444-4444-4444-8444-444444444444';
const lifetime = () => ({ ownerId: 'owner', isCurrent: () => true });
type Stack = { pathname: string; params: Record<string, string> }[];
const clientChat = { pathname: '/client/chat', params: { bookingId } };
const clientStack: Stack = [{ pathname: '/client', params: {} }, { pathname: '/client/job-details', params: { jobId } }, clientChat];
const workerStack: Stack = [{ pathname: '/worker', params: {} }, { pathname: '/worker/booking-details', params: { bookingId } },
  { pathname: '/worker/chat', params: { bookingId } }];

function armed(access: 'client' | 'worker', stack: Stack) {
  const memory = createSessionRouteContinuation(), handle = lifetime();
  const top = stack[stack.length - 1];
  const current = { access, pathname: top.pathname, params: top.params, ownerId: 'owner', lifetime: handle, stack };
  memory.observe(current);
  memory.rememberChatAnchor(current, { bookingId, messageId, offset: 37.5 });
  memory.observe({ ...current, access: 'account-pending', pathname: '/', params: {}, stack: undefined });
  expect(memory.destination(access, 'owner', handle)).toEqual({ pathname: top.pathname, params: top.params });
  // Re-entry lands on the destination alone: the rebuilt navigator has no parents yet.
  const landed = { ...current, stack: [top] };
  memory.observe(landed);
  return { memory, handle, landed, current };
}

describe('Option B parent chain and Chat anchor', () => {
  it.each([['client', clientStack], ['worker', workerStack]] as const)(
    'restores the actual %s parent chain once, only to the fresh destination screen', (access, stack) => {
      const { memory, landed } = armed(access, stack);
      expect(memory.takeParentChain(landed)).toEqual(stack.slice(0, -1));
      expect(memory.takeParentChain(landed)).toBeNull();
      // Rework: handing out the chain is not a restoration; only the confirmed navigation result is.
      expect(memory.lastRestoreOutcome()).toBe('none');
      expect(memory.completeParentChain(landed, 'restored')).toBe(true);
      expect(memory.lastRestoreOutcome()).toBe('restored');
    });

  it.each([['client', clientStack], ['worker', workerStack]] as const)(
    'hands the %s Chat anchor out once, after re-entry, for the same conversation only', (access, stack) => {
      const { memory, landed } = armed(access, stack);
      expect(memory.takeChatAnchor(landed, otherBooking)).toBeNull();
      expect(memory.takeChatAnchor(landed, bookingId)).toEqual({ bookingId, messageId, offset: 37.5 });
      expect(memory.takeChatAnchor(landed, bookingId)).toBeNull();
    });

  it('is never offered outside a refresh re-entry (ordinary navigation keeps its own mounted state)', () => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    const current = { access: 'client', ...clientChat, ownerId: 'owner', lifetime: handle, stack: clientStack };
    memory.observe(current); memory.rememberChatAnchor(current, { bookingId, messageId, offset: 10 });
    expect(memory.takeParentChain(current)).toBeNull();
    expect(memory.takeChatAnchor(current, bookingId)).toBeNull();
  });

  it('pending teardown, missing params and late callbacks cannot overwrite the awaiting snapshot', () => {
    const { memory, landed, current } = armed('client', clientStack);
    memory.rememberChatAnchor(current, { bookingId, messageId: '55555555-5555-4555-8555-555555555555', offset: 900 });
    memory.rememberChatAnchor(current, null);
    memory.observe({ ...landed, params: {}, stack: [{ pathname: '/client/chat', params: {} }] });
    memory.observe(landed);
    expect(memory.takeChatAnchor(landed, bookingId)).toEqual({ bookingId, messageId, offset: 37.5 });
    expect(memory.takeParentChain(landed)).toEqual(clientStack.slice(0, -1));
  });

  it('accepts only allowlisted own-role routes with exact validated IDs, bounded in length', () => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    const reject = (stack: { pathname: string; params: Record<string, unknown> }[]) => {
      const top = stack[stack.length - 1];
      const current = { access: 'client', pathname: top.pathname, params: top.params, ownerId: 'owner', lifetime: handle, stack };
      memory.observe(current);
      memory.observe({ ...current, access: 'account-pending', pathname: '/', params: {}, stack: undefined });
      memory.destination('client', 'owner', handle);
      memory.observe({ ...current, stack: [top] });
      return memory.takeParentChain({ ...current, stack: [top] });
    };
    // Rework: a rejected chain restores nothing ([] = nothing to rebuild, completed as preserved by the hook).
    // Another role's route, a payment/post/report/video screen, a non-UUID or an extra parameter never restore.
    expect(reject([{ pathname: '/worker', params: {} }, clientChat])).toEqual([]);
    expect(reject([{ pathname: '/client', params: {} }, { pathname: '/client/post-job', params: {} }, clientChat])).toEqual([]);
    expect(reject([{ pathname: '/client', params: {} }, { pathname: '/client/video', params: { bookingId } }, clientChat])).toEqual([]);
    expect(reject([{ pathname: '/client', params: {} }, { pathname: '/client/job-details', params: { jobId: 'not-a-uuid' } }, clientChat])).toEqual([]);
    expect(reject([{ pathname: '/client', params: {} }, { pathname: '/client/job-details', params: { jobId, postingWarning: 'x' } }, clientChat]))
      .toEqual([{ pathname: '/client', params: {} }, { pathname: '/client/job-details', params: { jobId } }]);
    // The chain must start at the role's own tab root and stay bounded.
    expect(reject([{ pathname: '/client/job-details', params: { jobId } }, clientChat])).toEqual([]);
    expect(reject([{ pathname: '/client', params: {} }, ...Array(4).fill({ pathname: '/client/job-details', params: { jobId } }), clientChat])).toEqual([]);
  });

  it('clamps and validates the anchor; only a finite offset on a UUID message of this conversation is kept', () => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    const current = { access: 'client', ...clientChat, ownerId: 'owner', lifetime: handle, stack: clientStack };
    const roundTrip = (anchor: any) => {
      memory.observe(current); memory.rememberChatAnchor(current, anchor);
      memory.observe({ ...current, access: 'account-pending', pathname: '/', params: {}, stack: undefined });
      memory.destination('client', 'owner', handle); memory.observe({ ...current, stack: [clientChat] });
      return memory.takeChatAnchor({ ...current, stack: [clientChat] }, bookingId);
    };
    expect(roundTrip({ bookingId, messageId, offset: Number.NaN })).toBeNull();
    expect(roundTrip({ bookingId, messageId: 'x', offset: 1 })).toBeNull();
    expect(roundTrip({ bookingId: otherBooking, messageId, offset: 1 })).toBeNull();
    expect(roundTrip({ bookingId, messageId, offset: -20 })).toEqual({ bookingId, messageId, offset: 0 });
    expect(roundTrip({ bookingId, messageId, offset: 1e9 })).toEqual({ bookingId, messageId, offset: 4000 });
    // Content never enters the record, even if a caller passes it.
    expect(roundTrip({ bookingId, messageId, offset: 5, content: 'private body' })).toEqual({ bookingId, messageId, offset: 5 });
  });

  it.each([
    ['a new owner', (m: any, h: any) => m.destination('client', 'other-owner', h)],
    ['a new lifetime', (m: any) => m.destination('client', 'owner', lifetime())],
    ['another role', (m: any, h: any) => m.destination('worker', 'owner', h)],
    ['a recovery/terminated lifetime', (m: any) => m.destination('client', 'owner', { ownerId: 'owner', isCurrent: () => false })],
  ])('never restores the chain or anchor for %s', (_label, consume) => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    const current = { access: 'client', ...clientChat, ownerId: 'owner', lifetime: handle, stack: clientStack };
    memory.observe(current); memory.rememberChatAnchor(current, { bookingId, messageId, offset: 3 });
    memory.observe({ ...current, access: 'account-pending', pathname: '/', params: {}, stack: undefined });
    expect(consume(memory, handle)).toBeNull();
  });

  it.each(['account-failure', 'blocked', 'needs-consent', 'worker-identity', 'signed-out', 'password-recovery'])(
    'a changed requirement (%s) clears the intent before any restore', access => {
      const memory = createSessionRouteContinuation(), handle = lifetime();
      const current = { access: 'client', ...clientChat, ownerId: 'owner', lifetime: handle, stack: clientStack };
      memory.observe(current); memory.rememberChatAnchor(current, { bookingId, messageId, offset: 3 });
      memory.observe({ ...current, access: 'account-pending', pathname: '/', params: {}, stack: undefined });
      memory.observe({ ...current, access, pathname: '/bootstrap-error', params: {}, stack: undefined });
      expect(memory.destination('client', 'owner', handle)).toBeNull();
      memory.observe({ ...current, stack: [clientChat] });
      expect(memory.takeParentChain({ ...current, stack: [clientChat] })).toBeNull();
      expect(memory.takeChatAnchor({ ...current, stack: [clientChat] }, bookingId)).toBeNull();
    });

  it('an unavailable destination abandons the restore once and reports the fallback', () => {
    const { memory, landed } = armed('worker', workerStack);
    expect(memory.abandonRestore(landed)).toBe(true);
    expect(memory.lastRestoreOutcome()).toBe('fallback');
    expect(memory.takeParentChain(landed)).toBeNull();
    expect(memory.takeChatAnchor(landed, bookingId)).toBeNull();
    expect(memory.abandonRestore(landed)).toBe(false);
  });

  it('navigating elsewhere before the fresh read lands disarms the restore', () => {
    const { memory, landed } = armed('client', clientStack);
    memory.observe({ ...landed, pathname: '/client', params: {}, stack: [{ pathname: '/client', params: {} }] });
    expect(memory.takeParentChain(landed)).toBeNull();
    expect(memory.takeChatAnchor(landed, bookingId)).toBeNull();
  });
});

// Rework F1 (2026-10-21): a non-Chat restoration retires once its parents are confirmed (or a valid stack was
// kept), so a LATER ordinary unavailability keeps the screen's inline state instead of a continuation reset.
describe('Option B rework: restoration completion', () => {
  const clientBooking = { pathname: '/client/booking-details', params: { bookingId } };
  const bookingStack: Stack = [{ pathname: '/client/bookings', params: {} }, clientBooking];
  const jobStack: Stack = [{ pathname: '/client/jobs', params: {} }, { pathname: '/client/job-details', params: { jobId } }];
  const later = (memory: ReturnType<typeof createSessionRouteContinuation>, landed: any, stack: Stack) => {
    // The root's ordinary observation of the rebuilt stack, then a later read of the same screen.
    memory.observe({ ...landed, stack });
    return memory.abandonRestore({ ...landed, stack });
  };

  it.each([['Booking Details', bookingStack], ['Job Details', jobStack]] as const)(
    '%s: after a confirmed restoration, a later unavailability does not abandon (no Home reset)', (_label, stack) => {
      const { memory, landed } = armed('client', stack);
      expect(memory.takeParentChain(landed)).toEqual(stack.slice(0, -1));
      expect(memory.completeParentChain(landed, 'restored')).toBe(true);
      expect(later(memory, landed, stack)).toBe(false);
      expect(memory.lastRestoreOutcome()).toBe('restored');
      expect(memory.takeParentChain(landed)).toBeNull();
    });

  it('handing out the chain alone does not complete it, but the destination read already passed: no abandonment', () => {
    const { memory, landed } = armed('client', bookingStack);
    expect(memory.takeParentChain(landed)).toEqual(bookingStack.slice(0, -1));
    expect(memory.lastRestoreOutcome()).toBe('none');
    expect(memory.abandonRestore(landed)).toBe(false);
    // "restored" cannot be claimed twice, and not without a dispatched chain.
    expect(memory.completeParentChain(landed, 'unconfirmed')).toBe(true);
    expect(memory.completeParentChain(landed, 'restored')).toBe(false);
    expect(memory.lastRestoreOutcome()).toBe('unconfirmed');
    expect(later(memory, landed, [clientBooking])).toBe(false);
  });

  it('a destination unavailable while the restore is genuinely pending still takes the safe fallback', () => {
    const { memory, landed } = armed('client', bookingStack);
    expect(memory.abandonRestore(landed)).toBe(true);
    expect(memory.lastRestoreOutcome()).toBe('fallback');
    expect(memory.takeParentChain(landed)).toBeNull();
  });

  it('a preserved existing user stack retires the restoration without leaving stale state', () => {
    const { memory, landed } = armed('client', bookingStack);
    expect(memory.completeParentChain(landed, 'restored')).toBe(false);
    expect(memory.completeParentChain(landed, 'preserved')).toBe(true);
    expect(memory.lastRestoreOutcome()).toBe('preserved');
    expect(memory.takeParentChain(landed)).toBeNull();
    expect(later(memory, landed, bookingStack)).toBe(false);
  });

  it('nothing to rebuild beneath the destination is a preserved restoration', () => {
    const memory = createSessionRouteContinuation(), handle = lifetime();
    const current = { access: 'client', ...clientBooking, ownerId: 'owner', lifetime: handle, stack: [{ pathname: '/client/bookings', params: {} }] };
    memory.observe({ ...current, stack: undefined });
    memory.observe({ ...current, access: 'account-pending', pathname: '/', params: {}, stack: undefined });
    memory.destination('client', 'owner', handle);
    memory.observe({ ...current, stack: undefined });
    expect(memory.takeParentChain(current)).toEqual([]);
    expect(memory.completeParentChain(current, 'preserved')).toBe(true);
    expect(memory.abandonRestore(current)).toBe(false);
  });

  it('Chat keeps its anchor through parent completion and retires only once both parts are done', () => {
    const { memory, landed } = armed('client', clientStack);
    expect(memory.takeParentChain(landed)).toEqual(clientStack.slice(0, -1));
    expect(memory.completeParentChain(landed, 'restored')).toBe(true);
    expect(memory.takeChatAnchor(landed, bookingId)).toEqual({ bookingId, messageId, offset: 37.5 });
    expect(later(memory, landed, clientStack)).toBe(false);
  });

  it('completion and abandonment belong to the saved destination only', () => {
    const { memory, landed } = armed('client', bookingStack);
    const other = { ...landed, pathname: '/client/chat', params: { bookingId } };
    expect(memory.completeParentChain(other, 'preserved')).toBe(false);
    expect(memory.abandonRestore(other)).toBe(false);
    expect(memory.takeParentChain(landed)).toEqual(bookingStack.slice(0, -1));
  });
});

describe('stackFromNavigationState (expo-router 57 root navigation state)', () => {
  it('reads the focused role group stack, mapping the tab shell to its focused tab route', () => {
    const state = { index: 1, routes: [{ name: 'index' }, { name: '(client)', state: { index: 2, routes: [
      { name: '(tabs)', state: { index: 2, routes: [{ name: 'client/index' }, { name: 'client/jobs' }, { name: 'client/bookings', params: { segment: 'active' } }] } },
      { name: 'client/job-details', params: { jobId, postingWarning: 'x' } },
      { name: 'client/chat', params: { bookingId } },
    ] } }] };
    expect(stackFromNavigationState(state)).toEqual([
      { pathname: '/client/bookings', params: { segment: 'active' } },
      { pathname: '/client/job-details', params: { jobId, postingWarning: 'x' } },
      { pathname: '/client/chat', params: { bookingId } },
    ]);
  });
  it('maps an index tab to the role root and returns undefined for unknown or partial state', () => {
    expect(stackFromNavigationState({ index: 0, routes: [{ name: '(worker)', state: { index: 0, routes: [
      { name: '(tabs)', state: { index: 0, routes: [{ name: 'worker/index' }] } }] } }] })).toEqual([{ pathname: '/worker', params: {} }]);
    expect(stackFromNavigationState(undefined)).toBeUndefined();
    expect(stackFromNavigationState({ index: 0, routes: [{ name: 'index' }] })).toBeUndefined();
    expect(stackFromNavigationState({ index: 0, routes: [{ name: '(client)' }] })).toBeUndefined();
  });
});

// Root capture fix (2026-10-23): useRootNavigationState returns the state of the navigator ExpoRoot wraps around the
// app's root _layout (id and single route `__root`). That one wrapper is stepped through; nothing else changes.
describe('stackFromNavigationState under the expo-router 57 `__root` wrapper', () => {
  const wrap = (root: unknown) => ({ index: 0, routes: [{ name: '__root', ...(root === undefined ? {} : { state: root }) }] });
  const roleRoot = (role: 'client' | 'worker', tabs: string[], groupRoutes: object[]) => ({ index: 0, routes: [{ name: `(${role})`, state: {
    index: groupRoutes.length, routes: [{ name: '(tabs)', state: { index: tabs.indexOf(`${role}/bookings`), routes: tabs.map(name => ({ name })) } }, ...groupRoutes] } }] });
  const clientRoot = roleRoot('client', ['client/index', 'client/jobs', 'client/bookings', 'client/profile'],
    [{ name: 'client/booking-details', params: { bookingId } }, { name: 'client/chat', params: { bookingId } }]);
  const workerRoot = roleRoot('worker', ['worker/index', 'worker/bookings', 'worker/profile'],
    [{ name: 'worker/booking-details', params: { bookingId } }, { name: 'worker/chat', params: { bookingId } }]);
  const chain = (role: 'client' | 'worker') => [{ pathname: `/${role}/bookings`, params: {} },
    { pathname: `/${role}/booking-details`, params: { bookingId } }, { pathname: `/${role}/chat`, params: { bookingId } }];

  it.each([['client', clientRoot], ['worker', workerRoot]] as const)('reads the wrapped %s chain Bookings > Booking details > Chat', (role, root) => {
    expect(stackFromNavigationState(wrap(root))).toEqual(chain(role));
    // The unwrapped root state still reads the same chain.
    expect(stackFromNavigationState(root)).toEqual(chain(role));
  });

  it('a wrapper without nested root state yields undefined', () => {
    expect(stackFromNavigationState(wrap(undefined))).toBeUndefined();
    expect(stackFromNavigationState(wrap({ index: 0, routes: [] }))).toBeUndefined();
    expect(stackFromNavigationState({ routes: [{ name: '__root', state: { routes: [{ name: '(client)' }] } }] })).toBeUndefined();
  });

  it('never searches unfocused routes for a role group', () => {
    // The wrapped root Stack is focused on `index` while a role group is still in its history.
    const indexFocused = { index: 0, routes: [{ name: 'index' }, clientRoot.routes[0]] };
    expect(stackFromNavigationState(wrap(indexFocused))).toBeUndefined();
    // The outer navigator is focused on a generated route, not on `__root`.
    expect(stackFromNavigationState({ index: 1, routes: [{ name: '__root', state: clientRoot }, { name: '+not-found' }] })).toBeUndefined();
    expect(stackFromNavigationState({ index: 1, routes: [{ name: '__root', state: clientRoot }, { name: '_sitemap' }] })).toBeUndefined();
  });

  it('steps through the outer wrapper only, once', () => {
    expect(stackFromNavigationState(wrap(wrap(clientRoot)))).toBeUndefined();
    expect(stackFromNavigationState({ index: 0, routes: [{ name: 'root', state: clientRoot }] })).toBeUndefined();
  });

  it('a wrapped chain still passes the unchanged allowlist, length bound and ID checks', () => {
    const parentsOf = (root: object) => {
      const memory = createSessionRouteContinuation(), handle = lifetime();
      const stack = stackFromNavigationState(wrap(root));
      expect(stack).toBeDefined();
      const top = stack![stack!.length - 1];
      const current = { access: 'client', pathname: top.pathname, params: top.params, ownerId: 'owner', lifetime: handle, stack };
      memory.observe(current);
      memory.observe({ ...current, access: 'account-pending', pathname: '/', params: {}, stack: undefined });
      memory.destination('client', 'owner', handle);
      memory.observe({ ...current, stack: [top] });
      return memory.takeParentChain({ ...current, stack: [top] });
    };
    const clientGroup = (routes: object[]) => ({ index: 0, routes: [{ name: '(client)', state: { index: routes.length - 1, routes } }] });
    const tabs = { name: '(tabs)', state: { index: 0, routes: [{ name: 'client/index' }] } };
    const details = { name: 'client/job-details', params: { jobId } }, chat = { name: 'client/chat', params: { bookingId } };
    expect(parentsOf(clientRoot)).toEqual(chain('client').slice(0, -1));
    // MAX_CHAIN is still 4: Home > Job details > Job details > Chat is kept, one more entry restores nothing.
    expect(parentsOf(clientGroup([tabs, details, details, chat]))).toEqual([{ pathname: '/client', params: {} },
      { pathname: '/client/job-details', params: { jobId } }, { pathname: '/client/job-details', params: { jobId } }]);
    expect(parentsOf(clientGroup([tabs, details, details, details, chat]))).toEqual([]);
    expect(parentsOf(clientGroup([tabs, { name: 'client/job-details', params: { jobId: 'not-a-uuid' } }, chat]))).toEqual([]);
    expect(parentsOf(clientGroup([tabs, { name: 'client/video', params: { bookingId } }, chat]))).toEqual([]);
    expect(parentsOf(clientGroup([{ name: '(tabs)', state: { index: 0, routes: [{ name: 'worker/index' }] } }, chat]))).toEqual([]);
  });
});

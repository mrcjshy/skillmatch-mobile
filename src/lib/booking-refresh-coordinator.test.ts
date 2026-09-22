import { describe, expect, it, vi } from 'vitest';

import { createBookingRefreshCoordinator } from './booking-refresh-coordinator';
import {
  NOTIFICATION_INSERTED,
  subscribeInvalidation,
  type BroadcastChannelLike,
  type BroadcastClientLike,
} from './realtime';

vi.mock('./supabase', () => ({ supabase: { channel: vi.fn(), removeChannel: vi.fn() } }));

function transport() {
  let event: (payload?: unknown) => void = () => {};
  let status: (value: string) => void = () => {};
  const channel: BroadcastChannelLike = {
    on(_type, filter, callback) {
      if (filter.event === NOTIFICATION_INSERTED) event = callback;
      return channel;
    },
    subscribe(callback) { status = callback; return channel; },
  };
  const client: BroadcastClientLike = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
  return { client, emit: (payload?: unknown) => event(payload), subscribed: () => status('SUBSCRIBED') };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

function setup() {
  const reads: ReturnType<typeof deferred<string[]>>[] = [];
  const loadBookings = vi.fn(() => {
    const read = deferred<string[]>();
    reads.push(read);
    return read.promise;
  });
  const onBookings = vi.fn();
  const onError = vi.fn();
  const onActivity = vi.fn();
  const coordinator = createBookingRefreshCoordinator<string>();
  const scope = coordinator.activate({ loadBookings, onBookings, onError, onActivity });
  const wire = transport();
  const unsubscribe = subscribeInvalidation({
    topic: 'user:account-a:notifications', events: [NOTIFICATION_INSERTED],
    onInvalidate: () => scope.refresh('invalidation'), client: wire.client,
  });
  return { coordinator, scope, reads, loadBookings, onBookings, onError, onActivity, wire, unsubscribe };
}

describe('Booking refresh coordinator', () => {
  it('refreshes rows without owning or resetting the caller-selected segment', async () => {
    const read = deferred<string[]>();
    const loadBookings = vi.fn(() => read.promise);
    // The caller owns selection independently of the coordinator's row callback.
    const screen: { segment: 'active' | 'history'; rows: string[] } = { segment: 'active', rows: [] };
    const scope = createBookingRefreshCoordinator<string>().activate({
      loadBookings,
      onBookings: (rows) => { screen.rows = rows; },
      onError: vi.fn(), onActivity: vi.fn(),
    });
    scope.refresh('focus');
    screen.segment = 'history';
    read.resolve(['updated-history']);
    await settle();
    expect(loadBookings).toHaveBeenCalledTimes(1);
    expect(screen).toEqual({ segment: 'history', rows: ['updated-history'] });
  });

  it('cannot let an older result overwrite an already-ready newer response', async () => {
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    const loadBookings = vi.fn<() => Promise<string[]>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const onBookings = vi.fn();
    const scope = createBookingRefreshCoordinator<string>().activate({
      loadBookings, onBookings, onError: vi.fn(), onActivity: vi.fn(),
    });
    scope.refresh('focus');
    scope.refresh('manual');
    second.resolve(['newest']);
    await settle();
    expect(loadBookings).toHaveBeenCalledTimes(1);
    expect(onBookings).not.toHaveBeenCalled();
    first.resolve(['older']);
    await settle();
    expect(loadBookings).toHaveBeenCalledTimes(2);
    expect(onBookings.mock.calls).toEqual([[['older']], [['newest']]]);
  });

  it('makes repeated cleanup and retained event/focus/manual callbacks inert', async () => {
    const s = setup();
    s.scope.refresh('focus');
    s.scope.cancel();
    s.scope.cancel();
    s.unsubscribe();
    s.unsubscribe();
    s.onActivity.mockClear();
    s.wire.emit();
    s.wire.subscribed();
    s.scope.refresh('focus');
    s.scope.refresh('manual');
    s.scope.refresh('retry');
    s.reads[0].reject(new Error('obsolete failure'));
    await settle();
    expect(s.loadBookings).toHaveBeenCalledTimes(1);
    expect(s.wire.client.removeChannel).toHaveBeenCalledTimes(1);
    expect(s.onBookings).not.toHaveBeenCalled();
    expect(s.onError).not.toHaveBeenCalled();
    expect(s.onActivity).not.toHaveBeenCalled();
  });

  it('retries a failed initial load through the same loading queue', async () => {
    const s = setup();
    s.scope.refresh('focus');
    s.reads[0].reject(new Error('offline'));
    await settle();
    expect(s.loadBookings).toHaveBeenCalledTimes(1);
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: false, isRefreshing: false });
    s.scope.refresh('retry');
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: true, isRefreshing: false });
    s.wire.emit();
    expect(s.loadBookings).toHaveBeenCalledTimes(2);
    s.reads[1].resolve(['retry']);
    await settle();
    expect(s.loadBookings).toHaveBeenCalledTimes(3);
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: true, isRefreshing: false });
    s.reads[2].resolve(['latest']);
    await settle();
    expect(s.onBookings).toHaveBeenLastCalledWith(['latest']);
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: false, isRefreshing: false });
  });

  it('reports an error but drains a queued follow-up before releasing the manual spinner', async () => {
    const s = setup();
    const offline = new Error('offline');
    s.scope.refresh('manual');
    s.wire.subscribed();
    s.reads[0].reject(offline);
    await settle();
    expect(s.onError).toHaveBeenCalledExactlyOnceWith(offline);
    expect(s.onBookings).not.toHaveBeenCalled();
    expect(s.loadBookings).toHaveBeenCalledTimes(2);
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: true, isRefreshing: true });
    s.reads[1].resolve(['recovered']);
    await settle();
    expect(s.onBookings).toHaveBeenCalledExactlyOnceWith(['recovered']);
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: false, isRefreshing: false });
    expect(s.loadBookings).toHaveBeenCalledTimes(2);
  });

  it.each(['resolve', 'reject'] as const)('supersedes an account/role scope without old %s writes', async (outcome) => {
    const s = setup();
    s.scope.refresh('manual');
    s.wire.emit();
    const nextRead = deferred<string[]>();
    const next = {
      loadBookings: vi.fn(() => nextRead.promise),
      onBookings: vi.fn(), onError: vi.fn(), onActivity: vi.fn(),
    };
    const current = s.coordinator.activate(next);
    current.refresh('focus');
    // A late cleanup from the previous identity cannot cancel its successor.
    s.scope.cancel();
    s.onActivity.mockClear();
    expect(next.loadBookings).not.toHaveBeenCalled();
    if (outcome === 'resolve') s.reads[0].resolve(['old-account']);
    else s.reads[0].reject(new Error('old-account failure'));
    await settle();
    expect(s.onBookings).not.toHaveBeenCalled();
    expect(s.onError).not.toHaveBeenCalled();
    expect(s.onActivity).not.toHaveBeenCalled();
    expect(next.loadBookings).toHaveBeenCalledTimes(1);
    expect(next.onActivity).toHaveBeenLastCalledWith({ isLoading: true, isRefreshing: false });
    nextRead.resolve(['current-account']);
    await settle();
    expect(next.onBookings).toHaveBeenCalledExactlyOnceWith(['current-account']);
    expect(next.onActivity).toHaveBeenLastCalledWith({ isLoading: false, isRefreshing: false });
    expect(s.loadBookings).toHaveBeenCalledTimes(1);
  });

  it('suppresses rows, errors, and loading completion after unmount and discards queued work', async () => {
    const s = setup();
    s.scope.refresh('manual');
    s.wire.emit();
    s.scope.cancel();
    s.unsubscribe();
    s.onActivity.mockClear();
    s.reads[0].resolve(['obsolete']);
    await settle();
    expect(s.onBookings).not.toHaveBeenCalled();
    expect(s.onError).not.toHaveBeenCalled();
    expect(s.onActivity).not.toHaveBeenCalled();
    expect(s.loadBookings).toHaveBeenCalledTimes(1);
  });

  it('coalesces Broadcast bursts and SUBSCRIBED into one follow-up without using payloads', async () => {
    const s = setup();
    s.scope.refresh('focus');
    for (let i = 0; i < 20; i++) s.wire.emit({ booking_id: 'forged' });
    s.wire.subscribed();
    expect(s.loadBookings).toHaveBeenCalledExactlyOnceWith();
    s.reads[0].resolve(['older']);
    await settle();
    expect(s.loadBookings).toHaveBeenCalledTimes(2);
    s.reads[1].resolve(['authoritative']);
    await settle();
    expect(s.loadBookings).toHaveBeenCalledTimes(2);
    expect(s.loadBookings.mock.calls).toEqual([[], []]);
    expect(s.onBookings.mock.calls).toEqual([[['older']], [['authoritative']]]);
  });

  it('joins focus behind an already-running manual refresh without dropping its spinner', async () => {
    const s = setup();
    s.scope.refresh('focus');
    s.reads[0].resolve(['initial']);
    await settle();
    s.onActivity.mockClear();
    s.scope.refresh('manual');
    s.scope.refresh('focus');
    expect(s.loadBookings).toHaveBeenCalledTimes(2);
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: false, isRefreshing: true });
    s.reads[1].resolve(['manual']);
    await settle();
    expect(s.loadBookings).toHaveBeenCalledTimes(3);
    expect(s.onActivity.mock.calls.every(([state]) => state.isRefreshing)).toBe(true);
    s.reads[2].resolve(['focused']);
    await settle();
    expect(s.onBookings).toHaveBeenLastCalledWith(['focused']);
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: false, isRefreshing: false });
  });

  it('keeps manual refresh spinning through a follow-up queued behind realtime', async () => {
    const s = setup();
    s.scope.refresh('invalidation');
    s.scope.refresh('manual');
    expect(s.loadBookings).toHaveBeenCalledTimes(1);
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: true, isRefreshing: true });
    s.reads[0].resolve(['older']);
    await settle();
    expect(s.loadBookings).toHaveBeenCalledTimes(2);
    expect(s.onActivity.mock.calls.every(([state]) => state.isRefreshing || state.isLoading)).toBe(true);
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: true, isRefreshing: true });
    s.reads[1].resolve(['newer']);
    await settle();
    expect(s.onBookings).toHaveBeenLastCalledWith(['newer']);
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: false, isRefreshing: false });
  });

  it('serializes initial focus and realtime into one read and one follow-up', async () => {
    const s = setup();
    s.scope.refresh('focus');
    s.scope.refresh('invalidation');
    expect(s.loadBookings).toHaveBeenCalledTimes(1);
    s.reads[0].resolve(['before']);
    await settle();
    expect(s.loadBookings).toHaveBeenCalledTimes(2);
    s.reads[1].resolve(['after']);
    await settle();
    expect(s.onBookings.mock.calls).toEqual([[['before']], [['after']]]);
    expect(s.onActivity).toHaveBeenLastCalledWith({ isLoading: false, isRefreshing: false });
  });
});

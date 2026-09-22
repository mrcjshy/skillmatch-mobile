import { describe, expect, it, vi } from 'vitest';

import { createClientHomeBookingFocus } from './client-home-booking-focus';
import type { BookingStatus } from './bookings';
import { NOTIFICATION_INSERTED, type BroadcastChannelLike, type BroadcastClientLike } from './realtime';

vi.mock('./supabase', () => ({ supabase: { channel: vi.fn(), removeChannel: vi.fn() } }));

type Row = { job_id: string; booking_id: string; booking_status: BookingStatus };
const confirmed = (job = 'job-a', booking = 'booking-a'): Row => ({
  job_id: job, booking_id: booking, booking_status: 'confirmed',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function transport() {
  const channels: { emit: (payload?: unknown) => void; subscribed: () => void }[] = [];
  const removed = vi.fn();
  const client: BroadcastClientLike = {
    channel: vi.fn(() => {
      let receive: (payload?: unknown) => void = () => {};
      let status: (status: string) => void = () => {};
      const channel: BroadcastChannelLike = {
        on(_type, filter, callback) {
          if (filter.event === NOTIFICATION_INSERTED) receive = callback;
          return channel;
        },
        subscribe(callback) { status = callback; return channel; },
      };
      // Retain callbacks even after removal to model already-queued delivery.
      channels.push({ emit: (payload) => receive(payload), subscribed: () => status('SUBSCRIBED') });
      return channel;
    }),
    removeChannel: removed,
  };
  return { client, channels, removed };
}

function setup(loadBookings = vi.fn<() => Promise<Row[]>>().mockResolvedValue([])) {
  const wire = transport();
  const onBookings = vi.fn();
  const onNavigate = vi.fn();
  const focus = createClientHomeBookingFocus({
    clientId: 'client-a', loadBookings, onBookings, onNavigate, client: wire.client,
  });
  return { focus, loadBookings, onBookings, onNavigate, ...wire };
}

async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe('Client Home focused booking handoff', () => {
  it('subscribes only for a waiting Job and removes the own-user private channel on blur', async () => {
    const s = setup();
    s.focus.refresh();
    await settle();
    expect(s.client.channel).not.toHaveBeenCalled();
    s.focus.waitForJob('job-a');
    await settle();
    expect(s.client.channel).toHaveBeenCalledExactlyOnceWith(
      'user:client-a:notifications', { config: { private: true } }
    );
    s.focus.cancel();
    s.focus.cancel();
    const readsBeforeLateEvents = s.loadBookings.mock.calls.length;
    s.channels[0].emit();
    s.channels[0].subscribed();
    await settle();
    expect(s.loadBookings).toHaveBeenCalledTimes(readsBeforeLateEvents);
    expect(s.removed).toHaveBeenCalledTimes(1);
    expect(s.onNavigate).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'another Job', rows: [confirmed('job-b', 'booking-b')] },
    { label: 'empty list', rows: [] },
    ...(['pending', 'completed', 'cancelled', 'no_show'] as const).map((status) => ({
      label: status, rows: [{ ...confirmed(), booking_status: status }],
    })),
  ])('keeps waiting when the authoritative response is $label', async ({ rows }) => {
    const s = setup(vi.fn<() => Promise<Row[]>>().mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([confirmed()]));
    s.focus.waitForJob('job-a');
    await settle();
    expect(s.onNavigate).not.toHaveBeenCalled();
    expect(s.removed).not.toHaveBeenCalled();
    s.channels[0].subscribed();
    await settle();
    expect(s.onNavigate).toHaveBeenCalledExactlyOnceWith('booking-a');
  });

  it('uses Broadcast only to reread, never as Booking/navigation authority', async () => {
    const s = setup();
    s.focus.waitForJob('job-a');
    await settle();
    const forged = { ...confirmed('job-a', 'forged-booking'), notification_id: 'forged' };
    s.channels[0].emit(forged);
    await settle();
    expect(s.loadBookings).toHaveBeenCalledTimes(2);
    expect(s.loadBookings.mock.calls.every((args) => args.length === 0)).toBe(true);
    expect(s.onNavigate).not.toHaveBeenCalled();
    s.loadBookings.mockResolvedValueOnce([confirmed('job-a', 'server-booking')]);
    s.channels[0].emit(forged);
    await settle();
    expect(s.onNavigate).toHaveBeenCalledExactlyOnceWith('server-booking');
    expect(s.onBookings.mock.calls).toEqual([
      [[]], [[]], [[confirmed('job-a', 'server-booking')]],
    ]);
  });

  it('refocus refreshes the card without inheriting a previous waiting Job', async () => {
    const read = deferred<Row[]>();
    const old = setup(vi.fn(() => read.promise));
    old.focus.waitForJob('job-a');
    old.focus.cancel();
    const current = setup(vi.fn<() => Promise<Row[]>>().mockResolvedValue([confirmed()]));
    current.focus.refresh();
    read.resolve([confirmed()]);
    await settle();
    expect(old.onBookings).not.toHaveBeenCalled();
    expect(old.onNavigate).not.toHaveBeenCalled();
    expect(current.onBookings).toHaveBeenCalledWith([confirmed()]);
    expect(current.onNavigate).not.toHaveBeenCalled();
    expect(current.client.channel).not.toHaveBeenCalled();
  });

  it('ignores a rejected read after cleanup without clearing state or navigating', async () => {
    const read = deferred<Row[]>();
    const s = setup(vi.fn(() => read.promise));
    s.focus.refresh();
    s.focus.cancel();
    read.reject(new Error('offline'));
    await settle();
    expect(s.onBookings).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
  });

  it('preserves card-only focus error behavior and allows a later refresh', async () => {
    const s = setup(vi.fn<() => Promise<Row[]>>().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([confirmed()]));
    s.focus.refresh();
    await settle();
    expect(s.onBookings).toHaveBeenCalledExactlyOnceWith([]);
    s.focus.refresh();
    await settle();
    expect(s.onBookings).toHaveBeenLastCalledWith([confirmed()]);
    expect(s.onNavigate).not.toHaveBeenCalled();
    expect(s.client.channel).not.toHaveBeenCalled();
  });

  it('preserves waiting on a failed read and retries only upon a fresh signal', async () => {
    const s = setup(vi.fn<() => Promise<Row[]>>().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([confirmed()]));
    s.focus.waitForJob('job-a');
    await settle();
    expect(s.onBookings).not.toHaveBeenCalled();
    expect(s.loadBookings).toHaveBeenCalledTimes(1);
    expect(s.onNavigate).not.toHaveBeenCalled();
    s.channels[0].emit();
    await settle();
    expect(s.onNavigate).toHaveBeenCalledExactlyOnceWith('booking-a');
  });

  it('discards a card-only read when a newly posted waiting Job supersedes it', async () => {
    const oldRead = deferred<Row[]>();
    const newRead = deferred<Row[]>();
    const s = setup(vi.fn<() => Promise<Row[]>>().mockImplementationOnce(() => oldRead.promise)
      .mockImplementationOnce(() => newRead.promise));
    s.focus.refresh();
    s.focus.waitForJob('job-a');
    oldRead.resolve([confirmed()]);
    await settle();
    expect(s.onBookings).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
    newRead.resolve([confirmed()]);
    await settle();
    expect(s.onNavigate).toHaveBeenCalledExactlyOnceWith('booking-a');
  });

  it('consumes before navigation and ignores duplicate, reconnect, and reentrant signals', async () => {
    const read = deferred<Row[]>();
    const s = setup(vi.fn(() => read.promise));
    s.focus.waitForJob('job-a');
    let removalsAtNavigation = 0;
    s.onNavigate.mockImplementation(() => {
      removalsAtNavigation = s.removed.mock.calls.length;
      s.channels[0].emit();
      s.focus.refresh();
    });
    for (let i = 0; i < 10; i++) s.channels[0].emit();
    s.channels[0].subscribed();
    read.resolve([confirmed()]);
    await settle();
    s.channels[0].emit();
    s.channels[0].subscribed();
    await settle();
    expect(s.onNavigate).toHaveBeenCalledExactlyOnceWith('booking-a');
    expect(removalsAtNavigation).toBe(1);
    expect(s.loadBookings).toHaveBeenCalledTimes(1);
    s.focus.cancel();
    expect(s.removed).toHaveBeenCalledTimes(1);
  });

  it.each(['job-b', 'job-a'])('rejects a superseded wait even if its response contains %s', async (nextJob) => {
    const first = deferred<Row[]>();
    const second = deferred<Row[]>();
    const load = vi.fn<() => Promise<Row[]>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const s = setup(load);
    s.focus.waitForJob('job-a');
    s.focus.waitForJob(nextJob);
    first.resolve([confirmed(), confirmed('job-b', 'booking-b')]);
    await settle();
    expect(s.onBookings).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(2);
    second.resolve([confirmed(nextJob, 'booking-current')]);
    await settle();
    expect(s.onNavigate).toHaveBeenCalledExactlyOnceWith('booking-current');
  });

  it('cannot rearm a cancelled focus with a delayed Post result', async () => {
    const old = setup();
    old.focus.cancel();
    const current = setup();
    current.focus.refresh();
    old.focus.waitForJob('job-a');
    old.focus.refresh();
    await settle();
    expect(old.client.channel).not.toHaveBeenCalled();
    expect(old.loadBookings).not.toHaveBeenCalled();
    expect(old.onBookings).not.toHaveBeenCalled();
    expect(old.onNavigate).not.toHaveBeenCalled();
    expect(current.onNavigate).not.toHaveBeenCalled();
  });

  it('ignores an authoritative read resolving after blur, including state writes', async () => {
    const read = deferred<Row[]>();
    const s = setup(vi.fn(() => read.promise));
    s.focus.waitForJob('job-a');
    s.channels[0].emit();
    s.focus.cancel();
    read.resolve([confirmed()]);
    await settle();
    expect(s.onBookings).not.toHaveBeenCalled();
    expect(s.onNavigate).not.toHaveBeenCalled();
    expect(s.loadBookings).toHaveBeenCalledTimes(1);
  });

  it('opens the authoritative confirmed Booking for its focused waiting Job', async () => {
    const read = deferred<Row[]>();
    const s = setup(vi.fn(() => read.promise));
    s.focus.waitForJob('job-a');
    read.resolve([confirmed()]);
    await settle();
    expect(s.onBookings).toHaveBeenCalledWith([confirmed()]);
    expect(s.onNavigate).toHaveBeenCalledExactlyOnceWith('booking-a');
  });
});

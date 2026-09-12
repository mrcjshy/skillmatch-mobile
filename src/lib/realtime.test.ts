import { describe, expect, it, vi } from 'vitest';

import {
  BOOKING_STATUS_CHANGED,
  bookingMessagesTopic,
  type BroadcastChannelLike,
  type BroadcastClientLike,
  MESSAGE_INSERTED,
  NOTIFICATION_INSERTED,
  subscribeInvalidation,
  userNotificationsTopic,
} from './realtime';

// Same convention as the other lib suites: the real client pulls in
// react-native, which this runner cannot parse. Every test below supplies its
// own client, so the default is never exercised here.
vi.mock('./supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

/**
 * A stand-in for the Supabase client that records what was asked of it.
 *
 * Nothing here talks to a socket: the seam under test is what this module
 * subscribes to and what it does when an event arrives, which is exactly the
 * part a two-emulator runtime gate cannot pin down cheaply.
 */
function fakeClient() {
  const handlers = new Map<string, () => void>();
  let subscribeCallback: ((status: string) => void) | null = null;
  const removed: BroadcastChannelLike[] = [];
  const opened: { name: string; opts: { config: { private: true } } }[] = [];

  const channel: BroadcastChannelLike = {
    on(_type, filter, callback) {
      handlers.set(filter.event, callback);
      return channel;
    },
    subscribe(callback) {
      subscribeCallback = callback;
      return channel;
    },
  };

  const client: BroadcastClientLike = {
    channel(name, opts) {
      opened.push({ name, opts });
      return channel;
    },
    removeChannel(ch) {
      removed.push(ch);
      return 'ok';
    },
  };

  return {
    client,
    opened,
    removed,
    emit: (event: string) => handlers.get(event)?.(),
    hasHandlerFor: (event: string) => handlers.has(event),
    reportStatus: (status: string) => subscribeCallback?.(status),
  };
}

describe('topic construction', () => {
  it('builds the Booking message topic the RLS policy authorizes', () => {
    expect(bookingMessagesTopic('0b6f1a2c-1111-4a2b-8c3d-000000000001')).toBe(
      'booking:0b6f1a2c-1111-4a2b-8c3d-000000000001:messages'
    );
  });

  it('builds the own-user notification topic the RLS policy authorizes', () => {
    expect(userNotificationsTopic('7c2e9d44-2222-4f5a-9b6c-000000000002')).toBe(
      'user:7c2e9d44-2222-4f5a-9b6c-000000000002:notifications'
    );
  });

  it('names one Booking per topic, so a second Booking is a different topic', () => {
    expect(bookingMessagesTopic('a')).not.toBe(bookingMessagesTopic('b'));
  });
});

describe('subscribeInvalidation', () => {
  it('opens the topic as a private channel', () => {
    const f = fakeClient();
    subscribeInvalidation({
      topic: 'booking:abc:messages',
      events: [MESSAGE_INSERTED],
      onInvalidate: () => {},
      client: f.client,
    });

    expect(f.opened).toEqual([
      { name: 'booking:abc:messages', opts: { config: { private: true } } },
    ]);
  });

  it('re-reads when a message is inserted', () => {
    const f = fakeClient();
    const onInvalidate = vi.fn();
    subscribeInvalidation({
      topic: 'booking:abc:messages',
      events: [MESSAGE_INSERTED, BOOKING_STATUS_CHANGED],
      onInvalidate,
      client: f.client,
    });

    f.emit(MESSAGE_INSERTED);

    expect(onInvalidate).toHaveBeenCalledTimes(1);
  });

  it('re-reads when the Booking leaves confirmed', () => {
    const f = fakeClient();
    const onInvalidate = vi.fn();
    subscribeInvalidation({
      topic: 'booking:abc:messages',
      events: [MESSAGE_INSERTED, BOOKING_STATUS_CHANGED],
      onInvalidate,
      client: f.client,
    });

    f.emit(BOOKING_STATUS_CHANGED);

    expect(onInvalidate).toHaveBeenCalledTimes(1);
  });

  it('re-reads when a notification is inserted', () => {
    const f = fakeClient();
    const onInvalidate = vi.fn();
    subscribeInvalidation({
      topic: 'user:u1:notifications',
      events: [NOTIFICATION_INSERTED],
      onInvalidate,
      client: f.client,
    });

    f.emit(NOTIFICATION_INSERTED);

    expect(onInvalidate).toHaveBeenCalledTimes(1);
  });

  it('hands the subscriber no payload, so an event cannot become a row', () => {
    const f = fakeClient();
    const onInvalidate = vi.fn();
    subscribeInvalidation({
      topic: 'booking:abc:messages',
      events: [MESSAGE_INSERTED],
      onInvalidate,
      client: f.client,
    });

    f.emit(MESSAGE_INSERTED);

    expect(onInvalidate).toHaveBeenCalledWith();
  });

  it('ignores events it did not subscribe to', () => {
    const f = fakeClient();
    subscribeInvalidation({
      topic: 'user:u1:notifications',
      events: [NOTIFICATION_INSERTED],
      onInvalidate: () => {},
      client: f.client,
    });

    expect(f.hasHandlerFor(MESSAGE_INSERTED)).toBe(false);
    expect(f.hasHandlerFor(BOOKING_STATUS_CHANGED)).toBe(false);
  });

  it('re-reads on SUBSCRIBED, because events during a gap are not replayed', () => {
    const f = fakeClient();
    const onInvalidate = vi.fn();
    subscribeInvalidation({
      topic: 'booking:abc:messages',
      events: [MESSAGE_INSERTED],
      onInvalidate,
      client: f.client,
    });

    f.reportStatus('SUBSCRIBED');

    expect(onInvalidate).toHaveBeenCalledTimes(1);
  });

  it('re-reads again on every resubscribe, so a reconnect self-heals', () => {
    const f = fakeClient();
    const onInvalidate = vi.fn();
    subscribeInvalidation({
      topic: 'booking:abc:messages',
      events: [MESSAGE_INSERTED],
      onInvalidate,
      client: f.client,
    });

    f.reportStatus('SUBSCRIBED');
    f.reportStatus('SUBSCRIBED');

    expect(onInvalidate).toHaveBeenCalledTimes(2);
  });

  it('does not re-read for a non-subscribed status', () => {
    const f = fakeClient();
    const onInvalidate = vi.fn();
    subscribeInvalidation({
      topic: 'booking:abc:messages',
      events: [MESSAGE_INSERTED],
      onInvalidate,
      client: f.client,
    });

    f.reportStatus('CHANNEL_ERROR');
    f.reportStatus('CLOSED');
    f.reportStatus('TIMED_OUT');

    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it('removes the channel on cleanup', () => {
    const f = fakeClient();
    const cleanup = subscribeInvalidation({
      topic: 'booking:abc:messages',
      events: [MESSAGE_INSERTED],
      onInvalidate: () => {},
      client: f.client,
    });

    cleanup();

    expect(f.removed).toHaveLength(1);
  });

  it('removes the channel once even if cleanup runs twice', () => {
    const f = fakeClient();
    const cleanup = subscribeInvalidation({
      topic: 'booking:abc:messages',
      events: [MESSAGE_INSERTED],
      onInvalidate: () => {},
      client: f.client,
    });

    cleanup();
    cleanup();

    expect(f.removed).toHaveLength(1);
  });

  it('leaves each subscription its own channel, so switching Bookings cannot share one', () => {
    const f = fakeClient();
    const first = subscribeInvalidation({
      topic: bookingMessagesTopic('booking-1'),
      events: [MESSAGE_INSERTED],
      onInvalidate: () => {},
      client: f.client,
    });
    first();
    subscribeInvalidation({
      topic: bookingMessagesTopic('booking-2'),
      events: [MESSAGE_INSERTED],
      onInvalidate: () => {},
      client: f.client,
    });

    expect(f.opened.map((o) => o.name)).toEqual([
      'booking:booking-1:messages',
      'booking:booking-2:messages',
    ]);
    expect(f.removed).toHaveLength(1);
  });
});

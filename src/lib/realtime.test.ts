import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BOOKING_STATUS_CHANGED,
  bookingMessagesTopic,
  createCoalescedInvalidation,
  JOB_OPPORTUNITIES_CHANGED,
  type BroadcastChannelLike,
  type BroadcastClientLike,
  MESSAGE_INSERTED,
  NOTIFICATION_INSERTED,
  subscribeInvalidation,
  userNotificationsTopic,
  workerOpportunitiesTopic,
} from './realtime';
import { supabase } from './supabase';

// Same convention as the other lib suites: the real client pulls in
// react-native, which this runner cannot parse. Every test below supplies its
// own client, so the default is never exercised here.
vi.mock('./supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

function thrownBy(action: () => unknown): unknown {
  try { action(); } catch (error) { return error; }
}

function fakeChannel(name: string, initialStatus?: string) {
  const handlers = new Map<string, (() => void)[]>();
  let status: ((value: string) => void) | undefined;
  const subscribe = vi.fn((callback: (value: string) => void) => {
    // Like the installed SDK, another subscribe does not replace the first callback.
    status ??= callback;
    if (initialStatus) callback(initialStatus);
  });
  const channel: BroadcastChannelLike = {
    on(_type, filter, callback) {
      handlers.set(filter.event, [...(handlers.get(filter.event) ?? []), callback]);
      return channel;
    },
    subscribe,
  };
  return {
    name, channel, handlers, subscribe,
    emit: (event: string, payload?: unknown) => {
      for (const handler of [...(handlers.get(event) ?? [])]) {
        (handler as (payload?: unknown) => void)(payload);
      }
    },
    reportStatus: (value: string) => status?.(value),
  };
}

/**
 * A stand-in for the Supabase client that records what was asked of it.
 *
 * Nothing here talks to a socket: the seam under test is what this module
 * subscribes to and what it does when an event arrives, which is exactly the
 * part a two-emulator runtime gate cannot pin down cheaply.
 */
function fakeClient(initialStatus?: string) {
  const cache = new Map<string, ReturnType<typeof fakeChannel>>();
  const channels: ReturnType<typeof fakeChannel>[] = [];
  const removed: BroadcastChannelLike[] = [];
  const opened: { name: string; opts: { config: { private: true } } }[] = [];
  const removeResult = vi.fn<(channel: BroadcastChannelLike) => unknown>().mockReturnValue('ok');

  const client: BroadcastClientLike = {
    channel(name, opts) {
      opened.push({ name, opts });
      let record = cache.get(name);
      if (!record) {
        record = fakeChannel(name, initialStatus);
        cache.set(name, record);
        channels.push(record);
      }
      return record.channel;
    },
    removeChannel(ch) {
      removed.push(ch);
      const result = removeResult(ch);
      const finish = (value: unknown) => {
        if (value === 'ok') {
          const record = channels.find((item) => item.channel === ch)!;
          record.reportStatus('CLOSED');
          // SDK removal is by topic, so reopening before this finishes is unsafe.
          cache.delete(record.name);
        }
        return value;
      };
      return result instanceof Promise ? result.then(finish) : finish(result);
    },
  };

  return {
    client,
    opened,
    removed,
    channels,
    removeResult,
    emit: (event: string, payload?: unknown) => channels[0].emit(event, payload),
    hasHandlerFor: (event: string) => channels[0].handlers.has(event),
    reportStatus: (status: string) => channels[0].reportStatus(status),
  };
}

type SetupFailure = 'channel' | 'on' | 'on-attached' | 'subscribe';

function failNextSetup(f: ReturnType<typeof fakeClient>, stage: SetupFailure, error: Error) {
  const acquire = f.client.channel.bind(f.client);
  vi.spyOn(f.client, 'channel').mockImplementationOnce((name, opts) => {
    if (stage === 'channel') throw error;
    const channel = acquire(name, opts);
    if (stage === 'subscribe') {
      const subscribe = channel.subscribe.bind(channel);
      vi.spyOn(channel, 'subscribe').mockImplementationOnce((callback) => {
        subscribe(callback);
        throw error;
      });
    } else {
      const on = channel.on.bind(channel);
      vi.spyOn(channel, 'on').mockImplementationOnce((type, filter, callback) => {
        if (stage === 'on-attached') on(type, filter, callback);
        throw error;
      });
    }
    return channel;
  });
}

describe('topic construction', () => {
  it('uses the exact generic Worker opportunity topic and event', () => {
    expect(workerOpportunitiesTopic()).toBe('worker:opportunities');
    expect(JOB_OPPORTUNITIES_CHANGED).toBe('job_opportunities_changed');
  });

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
    const onBroadcastEvent = vi.fn();
    subscribeInvalidation({
      topic: 'booking:abc:messages',
      events: [MESSAGE_INSERTED, BOOKING_STATUS_CHANGED],
      onInvalidate,
      onBroadcastEvent,
      client: f.client,
    });

    f.emit(BOOKING_STATUS_CHANGED);

    expect(onBroadcastEvent).toHaveBeenCalledTimes(1);
    expect(onInvalidate).toHaveBeenCalledTimes(1);
  });

  it('does not treat SUBSCRIBED as a Broadcast event', () => {
    const f = fakeClient();
    const onInvalidate = vi.fn();
    const onBroadcastEvent = vi.fn();
    subscribeInvalidation({
      topic: 'booking:abc:messages',
      events: [BOOKING_STATUS_CHANGED],
      onInvalidate,
      onBroadcastEvent,
      client: f.client,
    });

    f.reportStatus('SUBSCRIBED');

    expect(onBroadcastEvent).not.toHaveBeenCalled();
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

  it('keeps different Booking topics on separate channels', () => {
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

describe('shared invalidation registry', () => {
  const topic = 'user:shared-user:notifications';
  const events = [NOTIFICATION_INSERTED];

  it('shares implicit and explicit references to the same default client', async () => {
    const f = fakeClient();
    const defaultClient: BroadcastClientLike = supabase;
    vi.spyOn(defaultClient, 'channel').mockImplementation(f.client.channel);
    vi.spyOn(defaultClient, 'removeChannel').mockImplementation(f.client.removeChannel);
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = subscribeInvalidation({ topic, events, onInvalidate: first });
    const stopSecond = subscribeInvalidation({ client: defaultClient, topic, events, onInvalidate: second });
    f.emit(NOTIFICATION_INSERTED);
    expect(first).toHaveBeenCalledExactlyOnceWith();
    expect(second).toHaveBeenCalledExactlyOnceWith();
    expect(f.opened).toHaveLength(1);
    stopFirst(); stopSecond();
    await settle();
    expect(f.removed).toHaveLength(1);
  });

  it('registers its first owner before a synchronous SUBSCRIBED callback', () => {
    const f = fakeClient('SUBSCRIBED');
    const invalidate = vi.fn();
    const broadcast = vi.fn();
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: invalidate, onBroadcastEvent: broadcast });
    expect(invalidate).toHaveBeenCalledExactlyOnceWith();
    expect(broadcast).not.toHaveBeenCalled();
    expect(f.channels[0].subscribe).toHaveBeenCalledTimes(1);
  });

  it('does not deliver an in-progress Broadcast to a reentrantly added listener', () => {
    const f = fakeClient();
    const added = vi.fn();
    let joined = false;
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: () => {
      if (joined) return;
      joined = true;
      subscribeInvalidation({ client: f.client, topic, events, onInvalidate: added });
    } });
    f.emit(NOTIFICATION_INSERTED);
    expect(added).not.toHaveBeenCalled();
    f.emit(NOTIFICATION_INSERTED);
    expect(added).toHaveBeenCalledExactlyOnceWith();
    expect(f.opened).toHaveLength(1);
    expect(f.channels[0].handlers.get(NOTIFICATION_INSERTED)).toHaveLength(1);
  });

  it('does not reopen when all waiting owners cancel, but permits a later fresh acquisition', async () => {
    const f = fakeClient();
    const removal = deferred<string>();
    f.removeResult.mockReturnValueOnce(removal.promise);
    const first = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: vi.fn() });
    first();
    const waiting = vi.fn();
    const cleanup = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: waiting });
    cleanup(); cleanup();
    removal.resolve('ok');
    await settle();
    expect(f.opened).toHaveLength(1);
    expect(f.removed).toHaveLength(1);
    expect(waiting).not.toHaveBeenCalled();
    const next = vi.fn();
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: next });
    expect(f.opened).toHaveLength(2);
    expect(f.channels).toHaveLength(2);
    f.channels[1].reportStatus('SUBSCRIBED');
    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(waiting).not.toHaveBeenCalled();
  });

  it('ignores every old-generation callback after a replacement has subscribed', async () => {
    const f = fakeClient();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const removal = deferred<string>();
    f.removeResult.mockReturnValueOnce(removal.promise);
    const old = vi.fn();
    const cleanup = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: old });
    f.reportStatus('SUBSCRIBED');
    const abandonedCatchUp = vi.fn();
    const stopLate = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: abandonedCatchUp });
    stopLate(); cleanup();
    const next = vi.fn();
    const broadcast = vi.fn();
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: next, onBroadcastEvent: broadcast });
    removal.resolve('ok');
    await settle();
    f.channels[1].reportStatus('SUBSCRIBED');
    for (const status of ['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) f.channels[0].reportStatus(status);
    f.channels[0].emit(NOTIFICATION_INSERTED);
    cleanup(); stopLate();
    await settle();
    expect(old).toHaveBeenCalledTimes(1);
    expect(abandonedCatchUp).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(broadcast).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(f.removed).toHaveLength(1);
    f.channels[1].emit(NOTIFICATION_INSERTED);
    expect(next).toHaveBeenCalledTimes(2);
    expect(broadcast).toHaveBeenCalledExactlyOnceWith();
  });

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const)(
    'clears readiness on %s and waits for recovery, with only physical failure warnings', async (status) => {
      const f = fakeClient();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const first = vi.fn();
      const late = vi.fn();
      subscribeInvalidation({ client: f.client, topic, events, onInvalidate: first });
      f.reportStatus('SUBSCRIBED');
      f.reportStatus(status);
      subscribeInvalidation({ client: f.client, topic, events, onInvalidate: late });
      await settle();
      expect(first).toHaveBeenCalledTimes(1);
      expect(late).not.toHaveBeenCalled();
      if (status === 'CLOSED') expect(warn).not.toHaveBeenCalled();
      else expect(warn).toHaveBeenCalledExactlyOnceWith('[R5-UI] broadcast channel not delivering:', topic, status);
      f.reportStatus('SUBSCRIBED');
      expect(first).toHaveBeenCalledTimes(2);
      expect(late).toHaveBeenCalledExactlyOnceWith();
      expect(f.opened).toHaveLength(1);
      expect(f.removed).toHaveLength(0);
    }
  );

  it.each(['cancel', 'reconnect'] as const)('guards deferred late-owner catch-up against %s', async (race) => {
    const f = fakeClient();
    const first = vi.fn();
    const late = vi.fn();
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: first });
    f.reportStatus('SUBSCRIBED');
    const cleanup = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: late });
    if (race === 'cancel') cleanup();
    else f.reportStatus('SUBSCRIBED');
    await settle();
    expect(late).toHaveBeenCalledTimes(race === 'cancel' ? 0 : 1);
    expect(first).toHaveBeenCalledTimes(race === 'cancel' ? 1 : 2);
    expect(f.removed).toHaveLength(0);
    expect(f.channels[0].subscribe).toHaveBeenCalledTimes(1);
  });

  it('notifies every pre-SUBSCRIBED owner and repeats on reconnect without Broadcast hooks', () => {
    const f = fakeClient();
    const first = vi.fn();
    const second = vi.fn();
    const broadcast = vi.fn();
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: first, onBroadcastEvent: broadcast });
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: second, onBroadcastEvent: broadcast });
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    f.reportStatus('SUBSCRIBED');
    expect(first.mock.calls).toEqual([[]]);
    expect(second.mock.calls).toEqual([[]]);
    f.reportStatus('SUBSCRIBED');
    expect(first.mock.calls).toEqual([[], []]);
    expect(second.mock.calls).toEqual([[], []]);
    expect(broadcast).not.toHaveBeenCalled();
    expect(f.channels[0].subscribe).toHaveBeenCalledTimes(1);
  });

  it('partitions Details/Chat events and late-binds once without exposing payloads', async () => {
    const f = fakeClient();
    const bookingTopic = bookingMessagesTopic('shared-booking');
    const order: string[] = [];
    const hide = vi.fn(() => { order.push('hide'); });
    const details = vi.fn(() => { order.push('details'); });
    const chat = vi.fn(() => { order.push('chat'); });
    subscribeInvalidation({ client: f.client, topic: bookingTopic, events: [BOOKING_STATUS_CHANGED],
      onBroadcastEvent: hide, onInvalidate: details });
    f.reportStatus('SUBSCRIBED');
    const chatEvents = [MESSAGE_INSERTED, BOOKING_STATUS_CHANGED, MESSAGE_INSERTED];
    const stopChat = subscribeInvalidation({ client: f.client, topic: bookingTopic, events: chatEvents, onInvalidate: chat });
    chatEvents.push(NOTIFICATION_INSERTED);
    await settle();
    hide.mockClear(); details.mockClear(); chat.mockClear(); order.length = 0;
    const forged = { booking_status: 'completed', phone: 'not-authority' };
    f.emit(MESSAGE_INSERTED, forged);
    expect(chat.mock.calls).toEqual([[]]);
    expect(details).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
    f.emit(BOOKING_STATUS_CHANGED, forged);
    expect(order).toEqual(['chat', 'hide', 'details', 'chat']);
    expect(hide.mock.calls).toEqual([[]]);
    expect(details.mock.calls).toEqual([[]]);
    expect(chat.mock.calls).toEqual([[], []]);
    f.emit(NOTIFICATION_INSERTED, forged);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(f.channels[0].handlers.get(MESSAGE_INSERTED)).toHaveLength(1);
    expect(f.channels[0].handlers.get(BOOKING_STATUS_CHANGED)).toHaveLength(1);
    expect(f.opened).toHaveLength(1);
    expect(f.channels[0].subscribe).toHaveBeenCalledTimes(1);
    stopChat();
    f.emit(MESSAGE_INSERTED, forged);
    expect(chat).toHaveBeenCalledTimes(2);
    f.emit(BOOKING_STATUS_CHANGED, forged);
    expect(details).toHaveBeenCalledTimes(2);
    expect(f.removed).toHaveLength(0);
  });

  it('removes only the final owner, even when registrations share a callback', async () => {
    const f = fakeClient();
    const invalidate = vi.fn();
    const first = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: invalidate });
    const second = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: invalidate });
    f.emit(NOTIFICATION_INSERTED);
    expect(invalidate).toHaveBeenCalledTimes(2);
    first();
    first();
    expect(f.removed).toHaveLength(0);
    f.emit(NOTIFICATION_INSERTED);
    expect(invalidate).toHaveBeenCalledTimes(3);
    second();
    second();
    await settle();
    f.emit(NOTIFICATION_INSERTED);
    f.reportStatus('SUBSCRIBED');
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(f.removed).toEqual([f.channels[0].channel]);
  });

  it('isolates concurrent topics on the same client', () => {
    const f = fakeClient();
    const first = vi.fn();
    const other = vi.fn();
    const stop = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: first });
    subscribeInvalidation({ client: f.client, topic: 'user:other-user:notifications', events, onInvalidate: other });
    expect(f.channels).toHaveLength(2);
    f.channels[0].emit(NOTIFICATION_INSERTED);
    expect(first).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    stop();
    f.channels[1].reportStatus('SUBSCRIBED');
    expect(other).toHaveBeenCalledTimes(1);
    expect(f.removed).toEqual([f.channels[0].channel]);
  });

  it('isolates the same topic across distinct client object identities', () => {
    const a = fakeClient();
    const b = fakeClient();
    const onA = vi.fn();
    const onB = vi.fn();
    const stopA = subscribeInvalidation({ client: a.client, topic, events, onInvalidate: onA });
    subscribeInvalidation({ client: b.client, topic, events, onInvalidate: onB });
    a.emit(NOTIFICATION_INSERTED);
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
    stopA();
    b.emit(NOTIFICATION_INSERTED);
    expect(onB).toHaveBeenCalledTimes(1);
    expect(a.opened).toHaveLength(1);
    expect(b.opened).toHaveLength(1);
    expect(a.removed).toHaveLength(1);
    expect(b.removed).toHaveLength(0);
  });

  it.each(['broadcast', 'subscribed'] as const)('rechecks membership when a %s callback removes another listener', (source) => {
    const f = fakeClient();
    let removePeer = () => {};
    const first = vi.fn(() => removePeer());
    const peer = vi.fn();
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: first });
    removePeer = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: peer });
    if (source === 'broadcast') f.emit(NOTIFICATION_INSERTED);
    else f.reportStatus('SUBSCRIBED');
    expect(first).toHaveBeenCalledExactlyOnceWith();
    expect(peer).not.toHaveBeenCalled();
    expect(f.removed).toHaveLength(0);
  });

  it.each(['broadcast', 'invalidate', 'subscribed', 'late'] as const)(
    'isolates a throwing %s callback without silencing other consumers', async (source) => {
      const f = fakeClient();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const throwing = vi.fn(() => { throw new Error('consumer failed'); });
      const first = vi.fn();
      const peer = vi.fn();
      if (source === 'late') {
        subscribeInvalidation({ client: f.client, topic, events, onInvalidate: peer });
        f.reportStatus('SUBSCRIBED');
        subscribeInvalidation({ client: f.client, topic, events, onInvalidate: throwing });
        await settle();
      } else {
        subscribeInvalidation({ client: f.client, topic, events,
          onInvalidate: source === 'broadcast' ? first : throwing,
          onBroadcastEvent: source === 'broadcast' ? throwing : undefined });
        subscribeInvalidation({ client: f.client, topic, events, onInvalidate: peer });
        expect(() => {
          if (source === 'subscribed') f.reportStatus('SUBSCRIBED');
          else f.emit(NOTIFICATION_INSERTED);
        }).not.toThrow();
      }
      expect(throwing).toHaveBeenCalledExactlyOnceWith();
      expect(peer).toHaveBeenCalledExactlyOnceWith();
      if (source === 'broadcast') expect(first).toHaveBeenCalledExactlyOnceWith();
      expect(warn).toHaveBeenCalledExactlyOnceWith('[R5-UI] invalidation callback failed:', topic);
    }
  );

  it('honors cleanup during onBroadcastEvent before invoking that owner again', () => {
    const f = fakeClient();
    let cleanup = () => {};
    const own = vi.fn();
    const peer = vi.fn();
    const broadcast = vi.fn(() => cleanup());
    cleanup = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: own, onBroadcastEvent: broadcast });
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: peer });
    f.emit(NOTIFICATION_INSERTED);
    expect(broadcast).toHaveBeenCalledExactlyOnceWith();
    expect(own).not.toHaveBeenCalled();
    expect(peer).toHaveBeenCalledExactlyOnceWith();
    expect(f.removed).toHaveLength(0);
  });

  it.each(['throw', 'reject', 'error', 'timed out'] as const)(
    'retains an inert entry and warns once when removal reports %s', async (failure) => {
      const f = fakeClient();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      f.removeResult.mockImplementationOnce(() => {
        if (failure === 'throw') throw new Error('transport failed');
        if (failure === 'reject') return Promise.reject(new Error('transport failed'));
        return Promise.resolve(failure);
      });
      const old = vi.fn();
      const cleanup = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: old });
      expect(cleanup).not.toThrow();
      const next = vi.fn();
      const cleanupNext = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: next });
      await settle();
      f.emit(NOTIFICATION_INSERTED);
      f.reportStatus('SUBSCRIBED');
      f.reportStatus('CHANNEL_ERROR');
      cleanup();
      cleanupNext();
      subscribeInvalidation({ client: f.client, topic, events, onInvalidate: next });
      await settle();
      expect(f.opened).toHaveLength(1);
      expect(f.removed).toHaveLength(1);
      expect(warn).toHaveBeenCalledExactlyOnceWith('[R5-UI] broadcast channel removal failed:', topic);
      expect(old).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    }
  );

  it('waits for async removal before acquiring one replacement for waiting listeners', async () => {
    const f = fakeClient();
    const removal = deferred<string>();
    f.removeResult.mockReturnValueOnce(removal.promise);
    const old = vi.fn();
    const first = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: old });
    first();
    const next = vi.fn();
    const peer = vi.fn();
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: next });
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: peer });
    expect(f.opened).toHaveLength(1);
    expect(f.removed).toHaveLength(1);
    f.emit(NOTIFICATION_INSERTED);
    f.reportStatus('SUBSCRIBED');
    expect(next).not.toHaveBeenCalled();
    expect(peer).not.toHaveBeenCalled();
    removal.resolve('ok');
    await settle();
    expect(f.opened).toHaveLength(2);
    expect(f.channels).toHaveLength(2);
    expect(f.channels[1].subscribe).toHaveBeenCalledTimes(1);
    f.channels[1].reportStatus('SUBSCRIBED');
    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(peer).toHaveBeenCalledExactlyOnceWith();
    expect(old).not.toHaveBeenCalled();
    first();
    expect(f.removed).toHaveLength(1);
  });

  it('self-heals only the late subscriber after an already-SUBSCRIBED channel', async () => {
    const f = fakeClient();
    const first = vi.fn();
    const late = vi.fn();
    const broadcast = vi.fn();
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: first });
    f.reportStatus('SUBSCRIBED');
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: late, onBroadcastEvent: broadcast });
    expect(late).not.toHaveBeenCalled();
    await settle();
    expect(first).toHaveBeenCalledExactlyOnceWith();
    expect(late).toHaveBeenCalledExactlyOnceWith();
    expect(broadcast).not.toHaveBeenCalled();
    expect(f.channels[0].subscribe).toHaveBeenCalledTimes(1);
  });

  it('shares one physical subscription and event handler for the same client/topic', () => {
    const f = fakeClient();
    const first = vi.fn();
    const second = vi.fn();
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: first });
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: second });
    expect(f.opened).toEqual([{ name: topic, opts: { config: { private: true } } }]);
    expect(f.channels[0].subscribe).toHaveBeenCalledTimes(1);
    expect(f.channels[0].handlers.get(NOTIFICATION_INSERTED)).toHaveLength(1);
    f.emit(NOTIFICATION_INSERTED);
    expect(first).toHaveBeenCalledExactlyOnceWith();
    expect(second).toHaveBeenCalledExactlyOnceWith();
  });
});

describe('subscription setup rollback', () => {
  const topic = userNotificationsTopic('setup-owner');
  const events = [NOTIFICATION_INSERTED];

  it.each(['closing', 'idle'] as const)('keeps waiting cleanup handles effective in %s after failed replacement', async (phase) => {
    const f = fakeClient('SUBSCRIBED');
    const removal = deferred<string>();
    const failedRemoval = deferred<string>();
    f.removeResult.mockReturnValueOnce(removal.promise).mockReturnValueOnce(failedRemoval.promise);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    subscribeInvalidation({ client: f.client, topic, events, onInvalidate: vi.fn() })();
    const waiting = vi.fn();
    const stop = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: waiting });
    failNextSetup(f, 'on-attached', new Error('replacement failed'));
    removal.resolve('ok');
    await settle();
    expect(f.removed).toHaveLength(2);
    if (phase === 'idle') {
      failedRemoval.resolve('ok');
      await settle();
    }
    stop(); stop();
    failedRemoval.resolve('ok');
    await settle();
    expect(f.channels).toHaveLength(2);
    const fresh = vi.fn();
    const stopFresh = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: fresh });
    expect(f.channels).toHaveLength(3);
    f.channels[1].emit(NOTIFICATION_INSERTED);
    f.channels[1].reportStatus('SUBSCRIBED');
    expect(waiting).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledExactlyOnceWith();
    stopFresh(); stopFresh(); stop();
    await settle();
    expect(f.removed).toEqual(f.channels.map((record) => record.channel));
  });

  it.each(['throw', 'reject', 'error', 'timed out'] as const)(
    'quarantines partial setup when rollback removal reports %s without losing the original error', async (failure) => {
      const f = fakeClient('SUBSCRIBED');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = new Error('original setup failure');
      const failed = vi.fn();
      f.removeResult.mockImplementationOnce(() => {
        if (failure === 'throw') throw new Error('remove threw');
        if (failure === 'reject') return Promise.reject(new Error('remove rejected'));
        return Promise.resolve(failure);
      });
      failNextSetup(f, 'subscribe', error);
      expect(thrownBy(() => subscribeInvalidation({ client: f.client, topic, events, onInvalidate: failed }))).toBe(error);
      await settle();
      const later = vi.fn();
      const stop = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: later });
      stop(); stop();
      const stopAgain = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: later });
      f.emit(NOTIFICATION_INSERTED);
      for (const status of ['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) f.reportStatus(status);
      stopAgain();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(failed).not.toHaveBeenCalled();
      expect(later).not.toHaveBeenCalled();
      expect(f.channels).toHaveLength(1);
      expect(f.removed).toEqual([f.channels[0].channel]);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith('[R5-UI] broadcast channel setup failed:', topic);
      expect(warn).toHaveBeenCalledWith('[R5-UI] broadcast channel removal failed:', topic);
    }
  );

  it.each(['channel', 'on', 'on-attached', 'subscribe'] as const)(
    'handles replacement %s failure terminally and recovers waiting owners only on a later subscription', async (stage) => {
      const f = fakeClient('SUBSCRIBED');
      const removal = deferred<string>();
      const failedRemoval = deferred<string>();
      f.removeResult.mockReturnValueOnce(removal.promise).mockReturnValueOnce(failedRemoval.promise);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        const old = vi.fn();
        const first = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: old });
        first();
        const waiting = vi.fn();
        const peer = vi.fn();
        const stopWaiting = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: waiting });
        const stopPeer = subscribeInvalidation({ client: f.client, topic, events: ['peer'], onInvalidate: peer });
        failNextSetup(f, stage, new Error('replacement setup failed'));
        removal.resolve('ok');
        await settle();
        expect(waiting).not.toHaveBeenCalled();
        expect(peer).not.toHaveBeenCalled();
        expect(f.removed).toHaveLength(stage === 'channel' ? 1 : 2);
        for (const record of f.channels) {
          record.emit(NOTIFICATION_INSERTED);
          record.reportStatus('SUBSCRIBED');
          record.reportStatus('CHANNEL_ERROR');
        }
        failedRemoval.resolve('ok');
        await settle();
        const failedChannelCount = stage === 'channel' ? 1 : 2;
        expect(f.channels).toHaveLength(failedChannelCount);
        expect(waiting).not.toHaveBeenCalled();
        expect(peer).not.toHaveBeenCalled();
        const newcomer = vi.fn();
        const stopNew = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: newcomer });
        expect(f.channels).toHaveLength(failedChannelCount + 1);
        expect(waiting).toHaveBeenCalledExactlyOnceWith();
        expect(peer).toHaveBeenCalledExactlyOnceWith();
        expect(newcomer).toHaveBeenCalledExactlyOnceWith();
        const current = f.channels[failedChannelCount];
        current.emit('peer');
        expect(peer).toHaveBeenCalledTimes(2);
        expect(waiting).toHaveBeenCalledTimes(1);
        for (const stale of f.channels.slice(0, -1)) {
          stale.emit(NOTIFICATION_INSERTED);
          stale.reportStatus('SUBSCRIBED');
        }
        expect(old).toHaveBeenCalledTimes(1);
        expect(waiting).toHaveBeenCalledTimes(1);
        stopWaiting(); stopWaiting(); stopPeer(); stopNew(); stopNew(); first();
        await settle();
        expect(f.removed).toEqual(f.channels.map((record) => record.channel));
        // Cross a turn so a leaked promise rejection is observable, not merely pending.
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(unhandled).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledExactlyOnceWith('[R5-UI] broadcast channel setup failed:', topic);
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    }
  );

  it.each([false, true])('preserves existing owners after partial [X,Y] late binding (attached before throw: %s)', async (attached) => {
    const f = fakeClient();
    const error = new Error('late Y binding failed');
    const existing = vi.fn();
    const failed = vi.fn();
    const retry = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stopExisting = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: existing });
    f.reportStatus('SUBSCRIBED');
    const channel = f.channels[0].channel;
    const on = channel.on.bind(channel);
    vi.spyOn(channel, 'on').mockImplementationOnce(on).mockImplementationOnce((type, filter, callback) => {
      if (attached) on(type, filter, callback);
      throw error;
    });
    expect(thrownBy(() => subscribeInvalidation({ client: f.client, topic, events: ['X', 'Y'], onInvalidate: failed }))).toBe(error);
    const failedBinding = f.channels[0].handlers.get('Y')?.[0];
    await settle();
    f.emit('X'); f.emit('Y'); f.emit(NOTIFICATION_INSERTED);
    expect(failed).not.toHaveBeenCalled();
    expect(existing).toHaveBeenCalledTimes(2);
    expect(f.removed).toHaveLength(0);
    const stopRetry = subscribeInvalidation({ client: f.client, topic, events: ['X', 'Y'], onInvalidate: retry });
    await settle();
    expect(retry).toHaveBeenCalledExactlyOnceWith();
    failedBinding?.();
    expect(retry).toHaveBeenCalledTimes(1);
    f.emit('X'); f.emit('Y');
    expect(retry).toHaveBeenCalledTimes(3);
    expect(failed).not.toHaveBeenCalled();
    expect(existing).toHaveBeenCalledTimes(2);
    expect(f.opened).toHaveLength(1);
    stopRetry(); stopExisting();
    await settle();
    expect(f.removed).toEqual([channel]);
    expect(warn).toHaveBeenCalledExactlyOnceWith('[R5-UI] broadcast channel setup failed:', topic);
  });

  it.each(['on', 'on-attached', 'subscribe'] as const)(
    'rolls back initial %s failure, silences callbacks, and waits for cleanup before recovery', async (stage) => {
      const f = fakeClient('SUBSCRIBED');
      const removal = deferred<string>();
      f.removeResult.mockReturnValueOnce(removal.promise);
      const error = new Error('partial setup failed');
      const failed = vi.fn();
      const recovered = vi.fn();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      failNextSetup(f, stage, error);
      expect(thrownBy(() => subscribeInvalidation({ client: f.client, topic, events, onInvalidate: failed }))).toBe(error);
      expect(failed).not.toHaveBeenCalled();
      expect(f.removed).toEqual([f.channels[0].channel]);
      const waiting = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: recovered });
      expect(f.opened).toHaveLength(1);
      for (const status of ['SUBSCRIBED', 'CHANNEL_ERROR', 'CLOSED']) f.reportStatus(status);
      f.emit(NOTIFICATION_INSERTED);
      expect(failed).not.toHaveBeenCalled();
      expect(recovered).not.toHaveBeenCalled();
      removal.resolve('ok');
      await settle();
      // Failed setup cleanup never automatically retries, even with waiting owners.
      expect(f.opened).toHaveLength(1);
      const late = vi.fn();
      const stopLate = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: late });
      expect(f.opened).toHaveLength(2);
      expect(recovered).toHaveBeenCalledExactlyOnceWith();
      expect(late).toHaveBeenCalledExactlyOnceWith();
      f.channels[0].reportStatus('SUBSCRIBED');
      f.channels[0].emit(NOTIFICATION_INSERTED);
      expect(failed).not.toHaveBeenCalled();
      expect(recovered).toHaveBeenCalledTimes(1);
      waiting(); waiting(); stopLate(); stopLate();
      await settle();
      expect(f.removed).toEqual(f.channels.map((record) => record.channel));
      expect(warn).toHaveBeenCalledExactlyOnceWith('[R5-UI] broadcast channel setup failed:', topic);
    }
  );

  it('throws the original channel error and leaves no owner behind on later recovery', async () => {
    const f = fakeClient();
    const error = new Error('channel setup failed');
    const failed = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(f.client, 'channel').mockImplementationOnce(() => { throw error; });
    expect(thrownBy(() => subscribeInvalidation({ client: f.client, topic, events, onInvalidate: failed }))).toBe(error);
    const recovered = vi.fn();
    const stop = subscribeInvalidation({ client: f.client, topic, events, onInvalidate: recovered });
    f.reportStatus('SUBSCRIBED');
    expect(failed).not.toHaveBeenCalled();
    expect(recovered).toHaveBeenCalledExactlyOnceWith();
    stop(); stop();
    await settle();
    expect(f.removed).toEqual([f.channels[0].channel]);
    expect(warn).toHaveBeenCalledExactlyOnceWith('[R5-UI] broadcast channel setup failed:', topic);
  });
});

describe('createCoalescedInvalidation', () => {
  it('contains a queued follow-up rejection without retrying until a new invalidation', async () => {
    const initial = deferred<void>();
    const followUp = deferred<void>();
    const load = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(followUp.promise);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const rereader = createCoalescedInvalidation(load);
    try {
      rereader.invalidate();
      for (let i = 0; i < 10; i++) rereader.invalidate();
      expect(load).toHaveBeenCalledTimes(1);
      initial.resolve();
      await settle();
      expect(load).toHaveBeenCalledTimes(2);
      followUp.reject(new Error('queued read failed'));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledTimes(2);
      rereader.invalidate();
      await settle();
      expect(load).toHaveBeenCalledTimes(3);
      expect(warn).toHaveBeenCalledExactlyOnceWith('[R5-UI] coalesced invalidation load failed');
    } finally {
      rereader.cancel();
      process.off('unhandledRejection', unhandled);
    }
  });

  it('contains rejection after cancellation without starting the queued follow-up', async () => {
    const initial = deferred<void>();
    const load = vi.fn(() => initial.promise);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const rereader = createCoalescedInvalidation(load);
    try {
      rereader.invalidate();
      rereader.invalidate();
      rereader.cancel();
      initial.reject(new Error('cancelled read failed'));
      await new Promise<void>((resolve) => setImmediate(resolve));
      rereader.invalidate();
      await settle();
      expect(unhandled).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledExactlyOnceWith('[R5-UI] coalesced invalidation load failed');
    } finally {
      rereader.cancel();
      process.off('unhandledRejection', unhandled);
    }
  });

  it('contains an initial load rejection and still runs exactly one queued follow-up', async () => {
    const initial = deferred<void>();
    const followUp = deferred<void>();
    const load = vi.fn<() => Promise<void>>()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(followUp.promise);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const rereader = createCoalescedInvalidation(load);
    try {
      rereader.invalidate();
      for (let i = 0; i < 10; i++) rereader.invalidate();
      expect(load).toHaveBeenCalledTimes(1);
      initial.reject(new Error('initial read failed'));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledTimes(2);
      followUp.resolve();
      await settle();
      expect(load).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledExactlyOnceWith('[R5-UI] coalesced invalidation load failed');
    } finally {
      rereader.cancel();
      process.off('unhandledRejection', unhandled);
    }
  });

  it('serializes Worker focus, SUBSCRIBED, and burst events without trusting their payload', async () => {
    const f = fakeClient();
    const completions: (() => void)[] = [];
    const authoritativeRead = vi.fn(() => new Promise<void>((resolve) => completions.push(resolve)));
    const rereader = createCoalescedInvalidation(authoritativeRead);
    const onInvalidate = vi.fn(rereader.invalidate);
    const cleanup = subscribeInvalidation({
      topic: workerOpportunitiesTopic(),
      events: [JOB_OPPORTUNITIES_CHANGED],
      onInvalidate,
      client: f.client,
    });

    // Focus self-heal and mounted realtime feed the same queue.
    rereader.invalidate();
    f.reportStatus('SUBSCRIBED');
    for (let i = 0; i < 10; i++) {
      f.emit(JOB_OPPORTUNITIES_CHANGED, { job_id: 'not-authority', total_points: 999 });
    }
    expect(f.opened).toEqual([
      { name: 'worker:opportunities', opts: { config: { private: true } } },
    ]);
    expect(onInvalidate.mock.calls.every((args) => args.length === 0)).toBe(true);
    expect(authoritativeRead).toHaveBeenCalledExactlyOnceWith();

    completions.shift()!();
    await Promise.resolve();
    expect(authoritativeRead).toHaveBeenCalledTimes(2);
    completions.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(authoritativeRead).toHaveBeenCalledTimes(2);

    // Reconnect itself must reread, even with no new Broadcast event.
    f.reportStatus('SUBSCRIBED');
    expect(authoritativeRead).toHaveBeenCalledTimes(3);
    f.emit(JOB_OPPORTUNITIES_CHANGED);
    rereader.cancel();
    cleanup();
    cleanup();
    completions.shift()!();
    await Promise.resolve();
    f.emit(JOB_OPPORTUNITIES_CHANGED);
    f.reportStatus('SUBSCRIBED');
    expect(authoritativeRead).toHaveBeenCalledTimes(3);
    expect(f.removed).toHaveLength(1);
  });

  it('does not retry a handled load failure until another invalidation', async () => {
    const authoritativeRead = vi.fn().mockRejectedValue(new Error('offline'));
    const showExistingError = vi.fn();
    const rereader = createCoalescedInvalidation(async () => {
      try {
        await authoritativeRead();
      } catch (error) {
        showExistingError(error);
      }
    });
    rereader.invalidate();
    await Promise.resolve();
    await Promise.resolve();
    expect(authoritativeRead).toHaveBeenCalledTimes(1);
    expect(showExistingError).toHaveBeenCalledTimes(1);
    rereader.invalidate();
    await Promise.resolve();
    await Promise.resolve();
    expect(authoritativeRead).toHaveBeenCalledTimes(2);
    rereader.cancel();
  });

  it('coalesces bursts into one follow-up authoritative reread', async () => {
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const load = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSecond = resolve; }));
    const rereader = createCoalescedInvalidation(load);

    rereader.invalidate();
    rereader.invalidate();
    rereader.invalidate();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);

    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);

    resolveSecond();
    await Promise.resolve();
  });

  it('does not start a pending reread after unmount cancellation', async () => {
    let resolveFirst!: () => void;
    const load = vi.fn(() => new Promise<void>((resolve) => { resolveFirst = resolve; }));
    const rereader = createCoalescedInvalidation(load);

    rereader.invalidate();
    rereader.invalidate();
    rereader.cancel();
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
  });
});

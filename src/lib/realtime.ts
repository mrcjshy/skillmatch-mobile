/**
 * R5 private Broadcast — freshness/invalidation transport.
 *
 * WHAT AN EVENT MEANS
 * -------------------
 * "Something you are looking at changed. Ask the server again." Nothing more.
 * The authoritative record still lives in `public.messages`,
 * `public.notifications` and `public.bookings` behind their existing RLS and
 * RPCs, and every screen keeps rendering what its own authoritative read
 * returned. A Broadcast event never adds, edits or removes a row locally.
 *
 * THE PAYLOAD IS STRUCTURALLY UNREACHABLE, ON PURPOSE
 * ---------------------------------------------------
 * `onInvalidate` takes NO arguments. The database emits identifiers only
 * (`booking_id`, `message_id`, `notification_id`), but even those are not
 * handed to callers here, so no screen can drift into treating a payload as
 * the record. The only thing a subscriber learns is THAT it should re-read.
 * That also makes a duplicated or replayed event harmless: it collapses into
 * one more authoritative read.
 *
 * RECEIVE-ONLY
 * ------------
 * There is deliberately no authenticated INSERT policy on `realtime.messages`,
 * so this module only ever listens. Messages are still created by the existing
 * `public.messages` INSERT, and notifications still only by the trusted
 * server-side writers. Nothing here is a second write path.
 *
 * WHY SUBSCRIBING ALSO TRIGGERS A RE-READ
 * ---------------------------------------
 * Events that fired while the socket was down are simply gone — Broadcast has
 * no backlog. Reaching SUBSCRIBED therefore proves the channel is live from
 * now on, never that what is already on screen is current, so the subscribe
 * callback re-reads too. This is what makes a reconnect self-healing instead
 * of silently stale.
 *
 * Transport is best effort. If it fails, the existing manual refresh remains
 * the fallback; no queue, no retry table, no polling timer.
 */

import { supabase } from './supabase';

/** Emitted AFTER INSERT on `public.messages`, on the Booking topic. */
export const MESSAGE_INSERTED = 'message_inserted';

/**
 * Emitted AFTER UPDATE OF status on `public.bookings` when the Booking LEAVES
 * `confirmed`. It shares the Booking message topic rather than opening a third
 * topic family. Chat uses it to close the composer; a mounted Booking Details
 * screen uses it to drop confirmed-only contact, address, map, and actions
 * and re-read the participant RPC. The payload is still never a row.
 */
export const BOOKING_STATUS_CHANGED = 'booking_status_changed';

/** Emitted AFTER INSERT on `public.notifications`, on the own-user topic. */
export const NOTIFICATION_INSERTED = 'notification_inserted';

/** Generic invalidation after Job or required-skill changes; no Job data. */
export const JOB_OPPORTUNITIES_CHANGED = 'job_opportunities_changed';

/** Receive-only private topic authorized by the active-Worker predicate. */
export function workerOpportunitiesTopic(): string {
  return 'worker:opportunities';
}

/**
 * The Booking chat topic, matching the `realtime.messages` SELECT policy
 * exactly: `'booking:' || b.id::text || ':messages'`. The policy authorizes
 * this topic only for a participant of a Booking that is still `confirmed`, so
 * subscribing to another Booking's topic simply receives nothing.
 */
export function bookingMessagesTopic(bookingId: string): string {
  return `booking:${bookingId}:messages`;
}

/**
 * The caller's own notification topic, matching
 * `'user:' || auth.uid()::text || ':notifications'`. The user id must come
 * from the authenticated session; the policy compares it to `auth.uid()`, so a
 * topic naming anyone else is not authorized.
 */
export function userNotificationsTopic(userId: string): string {
  return `user:${userId}:notifications`;
}

/* ------------------------------------------------------------------ *
 * Subscription
 * ------------------------------------------------------------------ */

/**
 * The slice of the Supabase client this module uses. Narrowed to what is
 * actually called so a test can supply a stand-in without a live socket.
 */
export type BroadcastChannelLike = {
  on(type: 'broadcast', filter: { event: string }, callback: () => void): BroadcastChannelLike;
  subscribe(callback: (status: string) => void): unknown;
};

export type BroadcastClientLike = {
  channel(name: string, opts: { config: { private: true } }): BroadcastChannelLike;
  removeChannel(channel: BroadcastChannelLike): unknown;
};

export type SubscribeInvalidationOptions = {
  topic: string;
  /** Broadcast event names that should trigger an authoritative re-read. */
  events: readonly string[];
  /** Called with nothing — see "the payload is structurally unreachable". */
  onInvalidate: () => void;
  /**
   * Listed Broadcast events only — never SUBSCRIBED. Booking Details uses
   * this to hide confirmed-only fields before the re-read. Chat omits it
   * so a reconnect cannot blank a conversation.
   */
  onBroadcastEvent?: () => void;
  client?: BroadcastClientLike;
};

export type CoalescedInvalidation = {
  invalidate: () => void;
  cancel: () => void;
};

/**
 * Serializes authoritative rereads while preserving one follow-up reread for
 * invalidations that arrive during an in-flight request. No event payload is
 * accepted, retained, or used for a decision.
 */
export function createCoalescedInvalidation(load: () => Promise<void>): CoalescedInvalidation {
  let cancelled = false;
  let inFlight = false;
  let pending = false;

  const run = async (): Promise<void> => {
    if (cancelled) return;
    if (inFlight) {
      pending = true;
      return;
    }

    inFlight = true;
    try {
      await load();
    } catch {
      // Both the initial run and queued follow-up are fire-and-forget. Keep a
      // rejected loader contained without inventing another retry or exposing data.
      console.warn('[R5-UI] coalesced invalidation load failed');
    } finally {
      inFlight = false;
      if (pending && !cancelled) {
        pending = false;
        void run();
      }
    }
  };

  return {
    invalidate: () => {
      void run();
    },
    cancel: () => {
      cancelled = true;
      pending = false;
    },
  };
}

/** Status reported once the channel is live and receiving. */
const SUBSCRIBED = 'SUBSCRIBED';

/**
 * Statuses that mean the channel FAILED to deliver. They are logged for
 * developers and otherwise ignored: the transport is best effort, the screen
 * keeps whatever its last authoritative read returned, and pull-to-refresh
 * remains the user-facing recovery. Nothing is retried here, because a retry
 * loop against a socket that is already reconnecting is how a freshness
 * mechanism turns into a render loop.
 *
 * `CLOSED` is deliberately absent: it is also what an ordinary unmount or
 * Booking switch reports, and logging normal teardown as a fault would bury
 * the real failures.
 */
const FAILED_STATUSES = ['CHANNEL_ERROR', 'TIMED_OUT'];

type InvalidationSubscriber = {
  events: Set<string>;
  onInvalidate: () => void;
  onBroadcastEvent?: () => void;
  lastSubscribed: number;
};

type TopicEntry = {
  client: BroadcastClientLike;
  topic: string;
  channel: BroadcastChannelLike | null;
  phase: 'idle' | 'opening' | 'active' | 'closing' | 'failed';
  generation: number;
  subscribers: Set<InvalidationSubscriber>;
  boundEvents: Set<string>;
  subscribed: boolean;
  subscribedVersion: number;
};

const subscriptions = new WeakMap<BroadcastClientLike, Map<string, TopicEntry>>();

function isCurrent(entry: TopicEntry, generation: number): boolean {
  return subscriptions.get(entry.client)?.get(entry.topic) === entry &&
    entry.phase === 'active' && entry.generation === generation;
}

function deliver(entry: TopicEntry, callback: () => void): void {
  try {
    callback();
  } catch {
    // Consumers are independent owners; one failure cannot silence the others.
    console.warn('[R5-UI] invalidation callback failed:', entry.topic);
  }
}

function bindEvents(entry: TopicEntry, events: Set<string>): void {
  const generation = entry.generation;
  for (const event of events) {
    if (entry.boundEvents.has(event)) continue;
    // Some adapters attach before throwing. A handler is usable only after its
    // own .on call succeeds; a failed binding stays inert even after a retry.
    let bound = false;
    // Broadcast late binding is supported by the installed SDK. Payloads are
    // discarded at this boundary; the event name comes only from this binding.
    entry.channel!.on('broadcast', { event }, () => {
      if (!bound || !isCurrent(entry, generation)) return;
      for (const listener of [...entry.subscribers]) {
        if (!isCurrent(entry, generation) || !entry.subscribers.has(listener) ||
            !listener.events.has(event)) continue;
        if (listener.onBroadcastEvent) deliver(entry, listener.onBroadcastEvent);
        if (isCurrent(entry, generation) && entry.subscribers.has(listener)) deliver(entry, listener.onInvalidate);
      }
    });
    bound = true;
    entry.boundEvents.add(event);
  }
}

function openChannel(entry: TopicEntry): void {
  entry.phase = 'opening';
  entry.generation += 1;
  entry.subscribed = false;
  entry.boundEvents.clear();
  entry.channel = entry.client.channel(entry.topic, { config: { private: true } });
  for (const listener of entry.subscribers) bindEvents(entry, listener.events);
  const generation = entry.generation;
  const openingStatuses: string[] = [];
  const reportStatus = (status: string) => {
    if (!isCurrent(entry, generation)) return;
    if (status === SUBSCRIBED) {
      entry.subscribed = true;
      entry.subscribedVersion += 1;
      for (const listener of [...entry.subscribers]) {
        if (!isCurrent(entry, generation) || !entry.subscribers.has(listener)) continue;
        listener.lastSubscribed = entry.subscribedVersion;
        deliver(entry, listener.onInvalidate);
      }
      return;
    }
    entry.subscribed = false;
    if (FAILED_STATUSES.includes(status)) {
      console.warn('[R5-UI] broadcast channel not delivering:', entry.topic, status);
    }
  };
  entry.channel.subscribe((status: string) => {
    if (entry.generation !== generation) return;
    // A synchronous SUBSCRIBED does not prove setup succeeded until subscribe
    // returns. Failed attempts must never reach consumer callbacks.
    if (entry.phase === 'opening') openingStatuses.push(status);
    else reportStatus(status);
  });
  entry.phase = 'active';
  for (const status of openingStatuses) reportStatus(status);
}

function closeChannel(entry: TopicEntry, reopen = true): void {
  entry.phase = 'closing';
  entry.subscribed = false;
  const generation = ++entry.generation;
  const topics = subscriptions.get(entry.client)!;
  const isClosing = () => topics.get(entry.topic) === entry &&
    entry.generation === generation && entry.phase === 'closing';
  const fail = () => {
    if (!isClosing()) return;
    // Removal is unconfirmed: reopening could reuse this very channel. Keep an
    // inert entry, without retries; callers' authoritative/manual reads still work.
    entry.phase = 'failed';
    console.warn('[R5-UI] broadcast channel removal failed:', entry.topic);
  };
  // The SDK caches by topic and its old close removes by topic. Retain this
  // entry until removal completes, so new listeners cannot reuse a retiring channel.
  try {
    void Promise.resolve(entry.client.removeChannel(entry.channel!)).then((result) => {
      if (!isClosing()) return;
      if (result !== 'ok') {
        fail();
        return;
      }
      entry.channel = null;
      entry.phase = 'idle';
      if (entry.subscribers.size === 0) topics.delete(entry.topic);
      else if (reopen) {
        try {
          openChannel(entry);
        } catch {
          // Waiting callers already hold cleanup handles. Keep their ownership,
          // but never retry a failed replacement from this promise chain.
          recoverSetupFailure(entry);
        }
      }
    }).catch(fail);
  } catch {
    fail();
  }
}

function recoverSetupFailure(entry: TopicEntry): void {
  if (entry.phase === 'opening' && entry.channel) closeChannel(entry, false);
  else if (!entry.channel) {
    entry.phase = 'idle';
    entry.generation += 1;
    if (entry.subscribers.size === 0) subscriptions.get(entry.client)!.delete(entry.topic);
  }
  console.warn('[R5-UI] broadcast channel setup failed:', entry.topic);
}

/**
 * Share one private channel per client/topic. Each caller owns an independent
 * event set and cleanup; only the final owner removes the physical channel.
 */
export function subscribeInvalidation(options: SubscribeInvalidationOptions): () => void {
  const { topic, events, onInvalidate, onBroadcastEvent } = options;
  // Annotated, not cast: this is what checks that the real client still
  // satisfies the narrow contract above.
  const client: BroadcastClientLike = options.client ?? supabase;

  let topics = subscriptions.get(client);
  if (!topics) {
    topics = new Map();
    subscriptions.set(client, topics);
  }
  let entry = topics.get(topic);
  if (!entry) {
    entry = {
      client, topic, channel: null, phase: 'idle', generation: 0,
      subscribers: new Set(), boundEvents: new Set(),
      subscribed: false, subscribedVersion: 0,
    };
    topics.set(topic, entry);
  }
  const shared = entry;
  const subscriber = { events: new Set(events), onInvalidate, onBroadcastEvent, lastSubscribed: 0 };
  shared.subscribers.add(subscriber);

  try {
    if (shared.phase === 'idle') openChannel(shared);
    else if (shared.phase === 'active') {
      bindEvents(shared, subscriber.events);
      if (shared.subscribed) {
        const version = shared.subscribedVersion;
        const generation = shared.generation;
        // Let the caller receive its cleanup handle before this catch-up can run.
        queueMicrotask(() => {
          if (!isCurrent(shared, generation) || !shared.subscribers.has(subscriber) ||
              !shared.subscribed || shared.subscribedVersion !== version ||
              subscriber.lastSubscribed >= version) return;
          subscriber.lastSubscribed = version;
          deliver(shared, subscriber.onInvalidate);
        });
      }
    }
  } catch (error) {
    shared.subscribers.delete(subscriber);
    recoverSetupFailure(shared);
    throw error;
  }

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    shared.subscribers.delete(subscriber);
    if (shared.subscribers.size === 0 && shared.phase === 'active') closeChannel(shared);
    else if (shared.subscribers.size === 0 && shared.phase === 'idle' && topics.get(topic) === shared) topics.delete(topic);
  };
}

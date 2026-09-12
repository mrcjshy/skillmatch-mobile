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
 * topic family, because its only consumer is an open chat that must discover
 * the counterpart ended the Booking without sending another message.
 */
export const BOOKING_STATUS_CHANGED = 'booking_status_changed';

/** Emitted AFTER INSERT on `public.notifications`, on the own-user topic. */
export const NOTIFICATION_INSERTED = 'notification_inserted';

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
  client?: BroadcastClientLike;
};

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

/**
 * Open one private channel and re-read on every listed event.
 *
 * Returns the cleanup function. Callers must invoke it when the subscription
 * stops being appropriate — unmount, a change of Booking or account, or the
 * loss of eligibility to listen at all — which is what keeps a superseded
 * channel from lingering beside its replacement. It is idempotent, so a double
 * cleanup (React's development remount, or an unmount racing a dependency
 * change) removes the channel once.
 */
export function subscribeInvalidation(options: SubscribeInvalidationOptions): () => void {
  const { topic, events, onInvalidate } = options;
  // Annotated, not cast: this is what checks that the real client still
  // satisfies the narrow contract above.
  const client: BroadcastClientLike = options.client ?? supabase;

  // `private: true` is required: these topics are authorized by RLS on
  // `realtime.messages`, and a public channel would not present the caller's
  // JWT for that check.
  const channel = client.channel(topic, { config: { private: true } });

  for (const event of events) {
    // The payload argument is accepted by the transport and discarded here.
    channel.on('broadcast', { event }, () => {
      onInvalidate();
    });
  }

  channel.subscribe((status: string) => {
    if (status === SUBSCRIBED) {
      onInvalidate();
      return;
    }
    if (FAILED_STATUSES.includes(status)) {
      console.warn('[R5-UI] broadcast channel not delivering:', topic, status);
    }
  });

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    client.removeChannel(channel);
  };
}

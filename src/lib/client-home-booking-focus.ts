import { findConfirmedBookingForJob, type BookingStatus } from './bookings';
import {
  createCoalescedInvalidation,
  NOTIFICATION_INSERTED,
  subscribeInvalidation,
  userNotificationsTopic,
  type BroadcastClientLike,
} from './realtime';

type Booking = { job_id: string; booking_id: string; booking_status: BookingStatus };

export type ClientHomeBookingFocus = {
  waitForJob: (jobId: string) => void;
  /** Schedule a coalesced read, not an awaitable fetch. */
  refresh: () => void;
  cancel: () => void;
};

/** One Client Home focus lifetime; all rows come from the participant loader. */
export function createClientHomeBookingFocus<T extends Booking>(options: {
  clientId: string;
  loadBookings: () => Promise<T[]>;
  onBookings: (rows: T[]) => void;
  onNavigate: (bookingId: string) => void;
  client?: BroadcastClientLike;
}): ClientHomeBookingFocus {
  let active = true;
  let waiting: { jobId: string } | null = null;
  let unsubscribe: (() => void) | undefined;

  const rereader = createCoalescedInvalidation(async () => {
    if (!active) return;
    const expectedWait = waiting;
    try {
      const rows = await options.loadBookings();
      if (!active || waiting !== expectedWait) return;
      options.onBookings(rows);
      if (waiting === null) return;
      const booking = findConfirmedBookingForJob(rows, waiting.jobId);
      if (booking === null) return;
      // Revoke the wait and queued reads synchronously, before navigation.
      active = false;
      waiting = null;
      rereader.cancel();
      unsubscribe?.();
      unsubscribe = undefined;
      options.onNavigate(booking.booking_id);
    } catch {
      // Keep waiting on a failed invalidation; ordinary focus refresh may recover.
      if (active && waiting === expectedWait && waiting === null) options.onBookings([]);
    }
  });

  return {
    refresh: rereader.invalidate,
    waitForJob(jobId) {
      if (!active || !jobId.trim()) return;
      unsubscribe?.();
      waiting = { jobId };
      unsubscribe = subscribeInvalidation({
        topic: userNotificationsTopic(options.clientId),
        events: [NOTIFICATION_INSERTED],
        onInvalidate: rereader.invalidate,
        client: options.client,
      });
      rereader.invalidate();
    },
    cancel() {
      active = false;
      waiting = null;
      rereader.cancel();
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
}

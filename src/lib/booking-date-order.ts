import type { BaseBooking, BookingSegment } from './booking-records';

type Dated = Pick<BaseBooking, 'job_scheduled_at' | 'completed_at' | 'cancelled_at' | 'booked_at'>;

const time = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Display order for the Bookings list. Active: soonest scheduled first. History:
 * most recently ended first. Undated rows go last; ties keep the RPC's order.
 * Returns a new array and never changes which Bookings are shown.
 */
export function sortBookingsByDate<T extends Dated>(bookings: readonly T[], segment: BookingSegment): T[] {
  const key = (b: T) => segment === 'active'
    ? time(b.job_scheduled_at)
    : time(b.completed_at) ?? time(b.cancelled_at) ?? time(b.job_scheduled_at) ?? time(b.booked_at);
  return bookings
    .map((booking, index) => ({ booking, index, at: key(booking) }))
    .sort((a, b) => {
      if (a.at === null || b.at === null) return a.at === b.at ? a.index - b.index : a.at === null ? 1 : -1;
      return (segment === 'active' ? a.at - b.at : b.at - a.at) || a.index - b.index;
    })
    .map(entry => entry.booking);
}

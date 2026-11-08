import { formatCardDateTime } from './date-time';

/**
 * SCH-01 (owner, 2026-11-06): a Worker cannot accept a Job scheduled within 3 hours, before or after,
 * of one of their confirmed bookings. A Job only has a start time, so 3 hours either side is the
 * occupied window; exactly 3 hours apart is allowed, and completed, cancelled or no-show bookings
 * never block. The server decides (accept_job_opportunity answers SM422); this module only names the
 * booking in the way, so the Worker understands why.
 */
export const SCHEDULE_CONFLICT_HOURS = 3;
const WINDOW_MS = SCHEDULE_CONFLICT_HOURS * 60 * 60 * 1000;

type BookingTime = { job_id: string; booking_status: string; job_scheduled_at: string | null };

/** The closest confirmed booking (other than this Job) less than 3 hours from the Job, or null. */
export function findScheduleConflict<T extends BookingTime>(
  job: { job_id: string; scheduled_at: string | null },
  bookings: readonly T[],
): T | null {
  const target = job.scheduled_at === null ? Number.NaN : Date.parse(job.scheduled_at);
  if (Number.isNaN(target)) return null;
  let closest: T | null = null;
  let closestGap = Number.POSITIVE_INFINITY;
  for (const booking of bookings) {
    if (booking.booking_status !== 'confirmed' || booking.job_id === job.job_id || booking.job_scheduled_at === null) continue;
    const time = Date.parse(booking.job_scheduled_at);
    if (Number.isNaN(time)) continue;
    const gap = Math.abs(time - target);
    if (gap < WINDOW_MS && gap < closestGap) {
      closest = booking;
      closestGap = gap;
    }
  }
  return closest;
}

export const SCHEDULE_CONFLICT_COPY = {
  title: 'You already have a booking at this time',
  general: `You have another booking within ${SCHEDULE_CONFLICT_HOURS} hours of this job, so you can't accept it.`,
  ok: 'OK',
  viewBookings: 'View my bookings',
} as const;

/** The dialog message: names the booking in the way when it is known. */
export function scheduleConflictMessage(booking: { job_title: string; job_scheduled_at: string | null } | null): string {
  const when = booking ? formatCardDateTime(booking.job_scheduled_at) : null;
  if (booking === null || when === null) return SCHEDULE_CONFLICT_COPY.general;
  return `You're booked for "${booking.job_title}" on ${when}. You can't accept another job within ${SCHEDULE_CONFLICT_HOURS} hours of a booking.`;
}

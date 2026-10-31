import { describe, expect, it } from 'vitest';
import type { BaseBooking } from './booking-records';
import { sortBookingsByDate } from './booking-date-order';

const row = (booking_id: string, dates: Partial<BaseBooking>): BaseBooking => ({
  booking_id, job_id: booking_id, booking_status: 'confirmed', job_title: booking_id,
  booked_at: null, completed_at: null, job_scheduled_at: null, cancelled_at: null, ...dates,
} as BaseBooking);

describe('sortBookingsByDate', () => {
  it('lists active bookings soonest scheduled first, undated last, keeping server order for ties', () => {
    const later = row('later', { job_scheduled_at: '2026-11-03T02:00:00Z' });
    const soon = row('soon', { job_scheduled_at: '2026-11-01T02:00:00Z' });
    const undatedA = row('undatedA', {}), undatedB = row('undatedB', {});
    const input = [undatedA, later, undatedB, soon], copy = [...input];
    expect(sortBookingsByDate(input, 'active').map(b => b.booking_id)).toEqual(['soon', 'later', 'undatedA', 'undatedB']);
    expect(input).toEqual(copy);
  });

  it('lists history newest first by when it ended', () => {
    const old = row('old', { booking_status: 'completed', completed_at: '2026-10-01T00:00:00Z' } as Partial<BaseBooking>);
    const recent = row('recent', { booking_status: 'cancelled', cancelled_at: '2026-10-20T00:00:00Z' } as Partial<BaseBooking>);
    const scheduledOnly = row('scheduledOnly', { booking_status: 'completed', job_scheduled_at: '2026-10-10T00:00:00Z' } as Partial<BaseBooking>);
    expect(sortBookingsByDate([old, scheduledOnly, recent], 'history').map(b => b.booking_id)).toEqual(['recent', 'scheduledOnly', 'old']);
  });
});

import { describe, expect, it } from 'vitest';

import { formatCardDateTime } from './date-time';
import { SCHEDULE_CONFLICT_COPY, SCHEDULE_CONFLICT_HOURS, findScheduleConflict, scheduleConflictMessage } from './schedule-conflict';

const booking = (job_id: string, job_scheduled_at: string | null, booking_status = 'confirmed') =>
  ({ job_id, job_scheduled_at, booking_status, job_title: 'Aircon cleaning ' + job_id });
// 2:00 PM in Manila.
const job = { job_id: 'job-new', scheduled_at: '2026-11-07T06:00:00.000Z' };

describe('SCH-01 schedule conflict (owner, 2026-11-06)', () => {
  it('uses the same 3-hour window as accept_job_opportunity', () => {
    expect(SCHEDULE_CONFLICT_HOURS).toBe(3);
  });

  it('finds a confirmed booking less than 3 hours before or after, or at the same time', () => {
    expect(findScheduleConflict(job, [booking('a', '2026-11-07T08:59:00.000Z')])?.job_id).toBe('a');
    expect(findScheduleConflict(job, [booking('b', '2026-11-07T03:01:00.000Z')])?.job_id).toBe('b');
    expect(findScheduleConflict(job, [booking('c', '2026-11-07T06:00:00.000Z')])?.job_id).toBe('c');
  });

  it('allows exactly 3 hours apart', () => {
    expect(findScheduleConflict(job, [booking('a', '2026-11-07T09:00:00.000Z'), booking('b', '2026-11-07T03:00:00.000Z')])).toBeNull();
  });

  it('ignores other statuses, the same Job, and missing or unreadable times', () => {
    expect(findScheduleConflict(job, [
      booking('a', '2026-11-07T06:30:00.000Z', 'completed'),
      booking('b', '2026-11-07T06:30:00.000Z', 'cancelled'),
      booking('c', '2026-11-07T06:30:00.000Z', 'no_show'),
      booking('job-new', '2026-11-07T06:30:00.000Z'),
      booking('d', null),
      booking('e', 'not a date'),
    ])).toBeNull();
    expect(findScheduleConflict({ ...job, scheduled_at: null }, [booking('a', '2026-11-07T06:30:00.000Z')])).toBeNull();
  });

  it('names the closest booking in the way', () => {
    expect(findScheduleConflict(job, [booking('far', '2026-11-07T08:30:00.000Z'), booking('near', '2026-11-07T06:20:00.000Z')])?.job_id).toBe('near');
  });

  it('explains the clash with the booking when it is known, and in general words otherwise', () => {
    const clash = booking('a', '2026-11-07T07:00:00.000Z');
    expect(scheduleConflictMessage(clash)).toBe(
      `You're booked for "Aircon cleaning a" on ${formatCardDateTime(clash.job_scheduled_at)}. You can't accept another job within 3 hours of a booking.`);
    expect(scheduleConflictMessage(null)).toBe(SCHEDULE_CONFLICT_COPY.general);
    expect(scheduleConflictMessage(booking('b', null))).toBe(SCHEDULE_CONFLICT_COPY.general);
    expect(SCHEDULE_CONFLICT_COPY.title).toBe('You already have a booking at this time');
  });
});

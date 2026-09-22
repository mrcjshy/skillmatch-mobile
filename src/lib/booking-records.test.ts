import { describe, expect, it } from 'vitest';

import { findBookingForJob, findConfirmedBookingForJob } from './bookings';
import type { ClientBooking, WorkerBooking } from './booking-records';

const base = {
  payment_status: null,
  booked_at: null,
  completed_at: null,
  job_title: 'Carpentry',
  job_description: null,
  job_scheduled_at: null,
  job_address: null,
  job_barangay: 'Santa Ana',
  job_city: 'Pateros',
  job_budget: 500,
} as const;

function workerBooking(jobId: string, bookingId: string): WorkerBooking {
  return {
    ...base,
    booking_id: bookingId,
    job_id: jobId,
    booking_status: 'confirmed',
    client_user_id: 'client-1',
    client_full_name: null,
    client_phone: null,
  };
}

function clientBooking(jobId: string, bookingId: string, status: ClientBooking['booking_status']): ClientBooking {
  return {
    ...base,
    booking_id: bookingId,
    job_id: jobId,
    booking_status: status,
    worker_user_id: 'worker-1',
    worker_full_name: null,
    worker_phone: null,
    worker_barangay: null,
    worker_skills: null,
    worker_is_verified: null,
    worker_rating_avg: null,
    worker_rating_count: null,
  };
}

describe('Booking handoff lookup', () => {
  it('finds the Worker Booking for the accepted Job', () => {
    const booking = workerBooking('job-accepted', 'booking-1');

    expect(findBookingForJob([booking], 'job-accepted')).toBe(booking);
  });

  it('does not select a Booking for a different Job', () => {
    expect(findBookingForJob([workerBooking('other-job', 'booking-1')], 'job-accepted')).toBeNull();
  });

  it('routes only to a confirmed Client Booking for the waiting Job', () => {
    const pending = clientBooking('waiting-job', 'booking-pending', 'pending');
    const confirmed = clientBooking('waiting-job', 'booking-confirmed', 'confirmed');

    expect(findConfirmedBookingForJob([pending], 'waiting-job')).toBeNull();
    expect(findConfirmedBookingForJob([confirmed], 'waiting-job')).toBe(confirmed);
    expect(findConfirmedBookingForJob([clientBooking('other-job', 'booking-other', 'confirmed')], 'waiting-job')).toBeNull();
  });
});

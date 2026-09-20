import { describe, expect, it, vi } from 'vitest';

import {
  createLoadGenerationTracker,
  isBookingStatusChangedListenStatus,
  isMatchingBookingBroadcastTopic,
  isProtectedProjectionReleased,
  shouldSuppressProtectedBeforeRefresh,
  stripProtectedBookingFields,
} from './booking-details-freshness';
import { bookingMessagesTopic } from './realtime';

vi.mock('./supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

describe('isBookingStatusChangedListenStatus', () => {
  it('listens only while the authoritative status is confirmed', () => {
    expect(isBookingStatusChangedListenStatus('confirmed')).toBe(true);
  });

  it.each(['completed', 'cancelled', 'pending', 'no_show', null, undefined] as const)(
    'does not listen for %s',
    (status) => {
      expect(isBookingStatusChangedListenStatus(status)).toBe(false);
    }
  );
});

describe('shouldSuppressProtectedBeforeRefresh', () => {
  it('treats focus onto a confirmed snapshot as a re-read that hides protected fields first', () => {
    expect(
      shouldSuppressProtectedBeforeRefresh({ reason: 'focus', displayedStatus: 'confirmed' })
    ).toBe(true);
  });

  it('does not hide an already-terminal snapshot on focus', () => {
    expect(
      shouldSuppressProtectedBeforeRefresh({ reason: 'focus', displayedStatus: 'completed' })
    ).toBe(false);
  });

  it('does not hide before the first load, when nothing protected is on screen', () => {
    expect(shouldSuppressProtectedBeforeRefresh({ reason: 'focus', displayedStatus: null })).toBe(
      false
    );
  });

  it('hides protected fields as soon as booking_status_changed invalidates', () => {
    expect(
      shouldSuppressProtectedBeforeRefresh({
        reason: 'status-changed',
        displayedStatus: 'confirmed',
      })
    ).toBe(true);
  });

  it('does not hide a confirmed projection on manual refresh or SUBSCRIBED reconnect', () => {
    expect(
      shouldSuppressProtectedBeforeRefresh({ reason: 'manual', displayedStatus: 'confirmed' })
    ).toBe(false);
    expect(
      shouldSuppressProtectedBeforeRefresh({ reason: 'subscribed', displayedStatus: 'confirmed' })
    ).toBe(false);
  });
});

describe('isProtectedProjectionReleased', () => {
  it('keeps confirmed contact, address, map, and actions visible until invalidated', () => {
    expect(isProtectedProjectionReleased('confirmed', false)).toBe(true);
  });

  it('suppresses the previous protected projection while a re-read is pending', () => {
    expect(isProtectedProjectionReleased('confirmed', true)).toBe(false);
  });

  it('keeps completed history without counterpart or exact-location fields', () => {
    expect(isProtectedProjectionReleased('completed', false)).toBe(false);
    expect(isProtectedProjectionReleased('completed', true)).toBe(false);
  });
});

describe('isMatchingBookingBroadcastTopic', () => {
  const bookingId = 'ad3778e5-1722-4134-b497-845531644132';

  it('accepts only this Booking’s authorized topic', () => {
    expect(isMatchingBookingBroadcastTopic(bookingId, bookingMessagesTopic(bookingId))).toBe(true);
  });

  it('ignores an event for a different Booking', () => {
    expect(
      isMatchingBookingBroadcastTopic(bookingId, bookingMessagesTopic('11111111-1111-4111-8111-111111111111'))
    ).toBe(false);
  });
});

describe('stripProtectedBookingFields', () => {
  it('clears Worker-facing Client contact and exact address without inventing a new status', () => {
    const stripped = stripProtectedBookingFields({
      booking_status: 'confirmed',
      job_address: 'hidden-street',
      job_barangay: 'Santa Ana',
      job_city: 'Pateros',
      client_full_name: 'clientb',
      client_phone: '09170000000',
    });

    expect(stripped.booking_status).toBe('confirmed');
    expect(stripped.job_address).toBeNull();
    expect(stripped.job_barangay).toBe('Santa Ana');
    expect(stripped.job_city).toBe('Pateros');
    expect(stripped.client_full_name).toBeNull();
    expect(stripped.client_phone).toBeNull();
  });

  it('clears Client-facing Worker profile fields and exact address', () => {
    const stripped = stripProtectedBookingFields({
      booking_status: 'confirmed',
      job_address: 'hidden-street',
      worker_full_name: 'Jomerson',
      worker_phone: '09170000000',
      worker_barangay: 'Santa Ana',
      worker_skills: ['Carpentry'],
      worker_is_verified: true,
      worker_rating_avg: 4,
      worker_rating_count: 2,
    });

    expect(stripped.booking_status).toBe('confirmed');
    expect(stripped.job_address).toBeNull();
    expect(stripped.worker_full_name).toBeNull();
    expect(stripped.worker_phone).toBeNull();
    expect(stripped.worker_skills).toBeNull();
    expect(stripped.worker_is_verified).toBeNull();
  });
});

describe('createLoadGenerationTracker', () => {
  it('rejects a late older response after a newer read starts', () => {
    const gate = createLoadGenerationTracker();
    const older = gate.start();
    const newer = gate.start();

    expect(gate.isCurrent(older)).toBe(false);
    expect(gate.isCurrent(newer)).toBe(true);
  });

  it('rejects every in-flight token after unmount or booking change', () => {
    const gate = createLoadGenerationTracker();
    const token = gate.start();
    gate.cancel();

    expect(gate.isCurrent(token)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { bookingDialUrl } from './booking-call';

describe('booking dial handoff', () => {
  it('uses only a released authoritative PH mobile number', () => {
    expect(bookingDialUrl(true, '09171234567')).toBe('tel:+639171234567');
    expect(bookingDialUrl(false, '09171234567')).toBeNull();
    expect(bookingDialUrl(true, '+14155552671')).toBeNull();
    expect(bookingDialUrl(true, null)).toBeNull();
  });
});

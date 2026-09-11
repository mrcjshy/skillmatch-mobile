import { describe, expect, it } from 'vitest';

import { formatLocation, isBookingChatAvailable, isCounterpartyReleased } from './bookings';

describe('isCounterpartyReleased', () => {
  it('releases counterpart contact while confirmed', () => {
    expect(isCounterpartyReleased('confirmed')).toBe(true);
  });

  it('suppresses counterpart contact after completion', () => {
    expect(isCounterpartyReleased('completed')).toBe(false);
  });

  it('suppresses counterpart contact after cancellation', () => {
    expect(isCounterpartyReleased('cancelled')).toBe(false);
  });

  it('suppresses counterpart contact while pending', () => {
    expect(isCounterpartyReleased('pending')).toBe(false);
  });

  it('suppresses counterpart contact for no_show', () => {
    expect(isCounterpartyReleased('no_show')).toBe(false);
  });

  it('suppresses counterpart contact for an unknown status', () => {
    expect(isCounterpartyReleased('unknown')).toBe(false);
  });
});

describe('isBookingChatAvailable', () => {
  it('allows ordinary chat while confirmed', () => {
    expect(isBookingChatAvailable('confirmed')).toBe(true);
  });

  it('closes ordinary chat after completion', () => {
    expect(isBookingChatAvailable('completed')).toBe(false);
  });

  it('closes ordinary chat after cancellation', () => {
    expect(isBookingChatAvailable('cancelled')).toBe(false);
  });

  it('closes ordinary chat while pending', () => {
    expect(isBookingChatAvailable('pending')).toBe(false);
  });

  it('closes ordinary chat for no_show', () => {
    expect(isBookingChatAvailable('no_show')).toBe(false);
  });

  it('closes ordinary chat for an unknown status', () => {
    expect(isBookingChatAvailable('unknown')).toBe(false);
  });
});

describe('formatLocation', () => {
  it('retains barangay and city when the exact address is absent', () => {
    expect(formatLocation(null, 'Mabolo', 'Cebu City')).toBe('Mabolo, Cebu City');
  });
});

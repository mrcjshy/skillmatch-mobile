import { describe, expect, it, vi } from 'vitest';
import { clientPaymentEntry, type BookingPayment } from './payments';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

function payment(method: BookingPayment['payment_method'], status: BookingPayment['payment_status']): BookingPayment {
  return { id: 'booking-1', payment_method: method, payment_status: status };
}

describe('clientPaymentEntry', () => {
  it('offers the legacy dual choice when both Job and Booking methods are unset', () => {
    expect(clientPaymentEntry(payment(null, 'pending'), null)).toBe('legacy-choice');
  });

  it('offers Cash only for an unclaimed completed Booking on a Cash Job', () => {
    expect(clientPaymentEntry(payment(null, 'pending'), 'cod')).toBe('cash');
  });

  it('offers QR Ph only for an unclaimed completed Booking on a QR Ph Job', () => {
    expect(clientPaymentEntry(payment(null, 'pending'), 'qrph')).toBe('qrph');
  });

  it('uses the existing COD processing branch once the Booking method is claimed', () => {
    expect(clientPaymentEntry(payment('cod', 'pending'), 'cod')).toBe('processing');
    expect(clientPaymentEntry(payment('cod', 'pending'), null)).toBe('processing');
  });

  it('uses the existing QR Ph processing branch once the Booking method is claimed', () => {
    expect(clientPaymentEntry(payment('qrph', 'pending'), 'qrph')).toBe('processing');
    expect(clientPaymentEntry(payment('qrph', 'pending'), null)).toBe('processing');
  });

  it('does not offer method-selection controls on paid Bookings', () => {
    expect(clientPaymentEntry(payment('cod', 'paid'), 'cod')).toBe('processing');
    expect(clientPaymentEntry(payment('qrph', 'paid'), 'qrph')).toBe('processing');
    expect(clientPaymentEntry(payment('cod', 'paid'), null)).toBe('processing');
    expect(clientPaymentEntry(payment(null, 'paid'), null)).toBe('none');
  });
});

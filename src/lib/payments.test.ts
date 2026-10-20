import { describe, expect, it, vi } from 'vitest';
import {
  bookingActionPresentation,
  canSelectCod,
  clientPaymentEntry,
  COPY,
  fetchBookingPayments,
  formatPaymentMethod,
  isPaid,
  isPaidCod,
  isPayableStatus,
  type BookingPayment,
} from './payments';
import { supabase } from './supabase';

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

describe('FT-05 payment-before-completion presentation', () => {
  it('loads payment for confirmed and legacy completed Bookings only', () => {
    expect(isPayableStatus('confirmed')).toBe(true);
    expect(isPayableStatus('completed')).toBe(true);
    expect(isPayableStatus('cancelled')).toBe(false);
    expect(isPayableStatus('no_show')).toBe(false);
  });

  it('shows Client completion only for an authoritative confirmed paid read', () => {
    expect(bookingActionPresentation('client', 'confirmed', payment('cod', 'paid'), true))
      .toEqual({ showPayment: true, showCompletion: true, showCancellation: false });
    expect(bookingActionPresentation('client', 'confirmed', payment('cod', 'pending'), true))
      .toEqual({ showPayment: true, showCompletion: false, showCancellation: true });
    expect(bookingActionPresentation('client', 'confirmed', payment('cod', 'paid'), false))
      .toEqual({ showPayment: false, showCompletion: false, showCancellation: false });
  });

  it('never offers Worker completion', () => {
    expect(bookingActionPresentation('worker', 'confirmed', payment('cod', 'paid'), true))
      .toEqual({ showPayment: true, showCompletion: false, showCancellation: false });
  });

  it('keeps pending fresh and COD cancellation but blocks bound QR and paid', () => {
    expect(bookingActionPresentation('client', 'confirmed', payment(null, 'pending'), true).showCancellation).toBe(true);
    expect(bookingActionPresentation('worker', 'confirmed', payment('cod', 'pending'), true).showCancellation).toBe(true);
    expect(bookingActionPresentation('client', 'confirmed', payment('qrph', 'pending'), true).showCancellation).toBe(false);
    expect(bookingActionPresentation('client', 'confirmed', payment('qrph', 'paid'), true).showCancellation).toBe(false);
  });

  it('retains legacy completed pending payment without terminal actions', () => {
    expect(bookingActionPresentation('client', 'completed', payment('cod', 'pending'), true))
      .toEqual({ showPayment: true, showCompletion: false, showCancellation: false });
    expect(bookingActionPresentation('worker', 'completed', payment('qrph', 'pending'), true))
      .toEqual({ showPayment: true, showCompletion: false, showCancellation: false });
  });
});

describe('Cash and QR Ph TEST MODE labels', () => {
  it('labels the two offered methods and marks GCash/Maya as legacy, not offered', () => {
    expect(formatPaymentMethod('cod')).toBe('Cash');
    expect(formatPaymentMethod('qrph')).toBe('QR Ph — TEST MODE');
    expect(formatPaymentMethod('gcash')).toMatch(/legacy/i);
    expect(formatPaymentMethod('maya')).toMatch(/legacy/i);
    expect(formatPaymentMethod(null)).toBeNull();
  });

  it('keeps the QR Ph selection and paid copy in TEST MODE wording', () => {
    expect(COPY.selectQrph).toBe('QR Ph — TEST MODE');
    expect(COPY.paidQrph).toMatch(/TEST MODE/);
    expect(COPY.paidQrph).not.toMatch(/cash/i);
  });
});

describe('historical or unknown payment values fail closed', () => {
  const from = vi.mocked(supabase.from);
  function rows(data: unknown[]) {
    const inFn = vi.fn(async () => ({ data, error: null }));
    from.mockReturnValue({ select: vi.fn(() => ({ in: inFn })) } as never);
  }

  it('drops a row whose method is unrecognised instead of reading it as "not chosen" or Cash', async () => {
    rows([
      { id: 'a', payment_method: 'pay_after_work', payment_status: 'pending' },
      { id: 'b', payment_method: 'cod', payment_status: 'pending' },
    ]);
    const map = await fetchBookingPayments(['a', 'b']);
    expect(map.has('a')).toBe(false);
    expect(map.get('b')).toEqual({ id: 'b', payment_method: 'cod', payment_status: 'pending' });
  });

  it('drops a row whose status is unrecognised so it can never be treated as paid', async () => {
    rows([{ id: 'a', payment_method: 'cod', payment_status: 'settled' }]);
    const map = await fetchBookingPayments(['a']);
    expect(map.has('a')).toBe(false);
  });

  it('keeps a legacy null method/status row but never labels it Cash or paid', async () => {
    rows([{ id: 'a', payment_method: null, payment_status: null }]);
    const p = (await fetchBookingPayments(['a'])).get('a');
    expect(p).toEqual({ id: 'a', payment_method: null, payment_status: null });
    expect(formatPaymentMethod(p!.payment_method)).toBeNull();
    expect(isPaid(p)).toBe(false);
    expect(isPaidCod(p)).toBe(false);
    expect(canSelectCod(p)).toBe(false);
    expect(clientPaymentEntry(p, null)).toBe('none');
  });

  it('an unpaid legacy Booking is never paid regardless of Job intent', () => {
    expect(isPaid(payment(null, 'pending'))).toBe(false);
    expect(clientPaymentEntry(payment(null, 'pending'), null)).toBe('legacy-choice');
  });
});

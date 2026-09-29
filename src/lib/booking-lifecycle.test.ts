import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import {
  CANCELLATION_DETAIL_MAX,
  LifecycleError,
  cancelBooking,
  completeErrorCopy,
  remainingCancellationDetailCharacters,
  validateCancellationInput,
} from './booking-lifecycle';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

const rpc = vi.mocked(supabase.rpc);

beforeEach(() => rpc.mockReset());

describe('published reason-aware cancellation compatibility', () => {
  it('normalizes only the five already-published reason codes', () => {
    expect(validateCancellationInput('schedule_conflict', '  Family changed  ')).toEqual({
      ok: true,
      reasonCode: 'schedule_conflict',
      detail: 'Family changed',
    });
    expect(validateCancellationInput('unable_to_continue', '')).toMatchObject({ ok: true });
    expect(validateCancellationInput('location_issue', '')).toMatchObject({ ok: true });
    expect(validateCancellationInput('payment_issue', '')).toMatchObject({ ok: true });
    expect(validateCancellationInput('other', 'Another reason')).toMatchObject({ ok: true });
  });

  it('requires Other detail and enforces the existing 300-character limit', () => {
    expect(validateCancellationInput('other', '   ')).toEqual({ ok: false, reason: 'detail_required' });
    expect(validateCancellationInput('payment_issue', 'x'.repeat(CANCELLATION_DETAIL_MAX + 1)))
      .toEqual({ ok: false, reason: 'detail_too_long' });
    expect(remainingCancellationDetailCharacters('x'.repeat(300))).toBe(0);
  });

  it('calls the published three-argument RPC without fabricating a reason', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null } as never);
    await cancelBooking('booking-1', 'location_issue', '  Road inaccessible  ');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('cancel_my_booking', {
      p_booking_id: 'booking-1',
      p_reason_code: 'location_issue',
      p_reason_detail: 'Road inaccessible',
    });
  });

  it('rejects invalid cancellation input before the RPC', async () => {
    await expect(cancelBooking('booking-1', 'other', '   ')).rejects.toBeInstanceOf(LifecycleError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

it('maps unpaid final completion to safe payment-required copy', () => {
  expect(completeErrorCopy(new LifecycleError('private', 'SM403'))).toBe(
    'Payment must be settled before final completion.'
  );
});

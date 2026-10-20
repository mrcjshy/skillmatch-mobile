import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadClientBookings, loadWorkerBookings } from './booking-records';
import { CANCELLATION_REASON_CODES, CANCELLATION_REASON_LABELS, cancellationDetails } from './bookings';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

const WORKER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AT = '2026-10-01T03:15:00+00:00';

function input(overrides: Partial<Parameters<typeof cancellationDetails>[0]> = {}) {
  return {
    bookingStatus: 'cancelled',
    role: 'worker' as const,
    viewerUserId: WORKER,
    counterpartyUserId: CLIENT,
    reasonCode: 'schedule_conflict',
    reasonDetail: null,
    cancelledBy: WORKER,
    cancelledAt: AT,
    ...overrides,
  };
}

describe('cancellationDetails attribution', () => {
  it('shows the Worker their own cancellation as You', () => {
    expect(cancellationDetails(input())).toEqual({
      cancelledBy: 'You', reason: 'Schedule conflict', detail: null, cancelledAt: AT,
    });
  });

  it('shows the Worker a Client cancellation as Your client', () => {
    expect(cancellationDetails(input({ cancelledBy: CLIENT }))?.cancelledBy).toBe('Your client');
  });

  it('shows the Client their own cancellation as You', () => {
    const client = { role: 'client' as const, viewerUserId: CLIENT, counterpartyUserId: WORKER };
    expect(cancellationDetails(input({ ...client, cancelledBy: CLIENT }))?.cancelledBy).toBe('You');
  });

  it('shows the Client a Worker cancellation as Your worker', () => {
    const client = { role: 'client' as const, viewerUserId: CLIENT, counterpartyUserId: WORKER };
    expect(cancellationDetails(input({ ...client, cancelledBy: WORKER }))?.cancelledBy).toBe('Your worker');
  });

  it('still attributes the counterparty while the viewer account is loading', () => {
    expect(cancellationDetails(input({ viewerUserId: null, cancelledBy: CLIENT }))?.cancelledBy).toBe('Your client');
    expect(cancellationDetails(input({ viewerUserId: undefined, cancelledBy: WORKER }))).toBeNull();
  });

  it('never attributes an actor who is neither participant', () => {
    expect(cancellationDetails(input({ cancelledBy: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }))).toBeNull();
  });
});

describe('cancellationDetails content', () => {
  it('labels every V4 #19 reason code', () => {
    for (const code of CANCELLATION_REASON_CODES) {
      const detail = code === 'other' ? 'Family emergency' : null;
      expect(cancellationDetails(input({ reasonCode: code, reasonDetail: detail }))?.reason)
        .toBe(CANCELLATION_REASON_LABELS[code]);
    }
  });

  it('keeps an optional bounded detail exactly as stored', () => {
    expect(cancellationDetails(input({ reasonDetail: 'Rain delay' }))?.detail).toBe('Rain delay');
    expect(cancellationDetails(input({ reasonDetail: 'ñ'.repeat(300) }))?.detail).toHaveLength(300);
  });

  it('shows nothing for a status other than cancelled', () => {
    for (const status of ['pending', 'confirmed', 'completed', 'no_show']) {
      expect(cancellationDetails(input({ bookingStatus: status }))).toBeNull();
    }
  });

  it('treats a legacy all-null bundle as a plain cancellation', () => {
    expect(cancellationDetails(input({ reasonCode: null, reasonDetail: null, cancelledBy: null, cancelledAt: null }))).toBeNull();
  });

  it('rejects incomplete or inconsistent metadata instead of guessing', () => {
    expect(cancellationDetails(input({ reasonCode: 'weather' }))).toBeNull();
    expect(cancellationDetails(input({ cancelledBy: '' }))).toBeNull();
    expect(cancellationDetails(input({ cancelledAt: null }))).toBeNull();
    expect(cancellationDetails(input({ cancelledAt: 'not a date' }))).toBeNull();
    expect(cancellationDetails(input({ reasonCode: 'other', reasonDetail: null }))).toBeNull();
    expect(cancellationDetails(input({ reasonDetail: ' padded ' }))).toBeNull();
    expect(cancellationDetails(input({ reasonDetail: 'x'.repeat(301) }))).toBeNull();
    expect(cancellationDetails(input({ reasonDetail: 42 }))).toBeNull();
  });
});

describe('Booking loaders carry the V4 #19 metadata bundle', () => {
  const rpc = vi.mocked(supabase.rpc);
  const base = { booking_id: 'b-1', job_id: 'j-1', booking_status: 'cancelled', job_title: 'Repair' };
  const bundle = {
    cancellation_reason_code: 'location_issue',
    cancellation_reason_detail: 'Gate locked',
    cancelled_by: CLIENT,
    cancelled_at: AT,
  };

  beforeEach(() => rpc.mockReset());

  it('maps the bundle for the Worker list', async () => {
    rpc.mockResolvedValue({ data: [{ ...base, ...bundle, client_user_id: CLIENT }], error: null } as never);
    const [row] = await loadWorkerBookings();
    expect(rpc).toHaveBeenCalledWith('list_my_worker_bookings');
    expect(row).toMatchObject(bundle);
  });

  it('maps the bundle for the Client list', async () => {
    rpc.mockResolvedValue({ data: [{ ...base, ...bundle, worker_user_id: WORKER }], error: null } as never);
    const [row] = await loadClientBookings();
    expect(rpc).toHaveBeenCalledWith('list_my_client_bookings');
    expect(row).toMatchObject(bundle);
  });

  it('keeps legacy rows without the bundle as nulls', async () => {
    rpc.mockResolvedValue({ data: [{ ...base, client_user_id: CLIENT }], error: null } as never);
    const [row] = await loadWorkerBookings();
    expect(row).toMatchObject({
      cancellation_reason_code: null, cancellation_reason_detail: null, cancelled_by: null, cancelled_at: null,
    });
  });
});

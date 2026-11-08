import { beforeEach, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import { loadBookingServiceProgress } from './worker-booking-progress';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }));

const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const arrived = '2026-10-30T01:00:00+00:00', done = '2026-10-30T02:00:00+00:00';
const from = vi.mocked(supabase.from);

function reply(value: { data: unknown; error: unknown }) {
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue(value) })) }));
  from.mockReturnValue({ select } as never);
  return select;
}

beforeEach(() => vi.clearAllMocks());

it("PAY-02: the Client reads the Worker's progress from their own booking row", async () => {
  const select = reply({ data: { id, worker_arrived_at: arrived, worker_service_completed_at: done }, error: null });
  await expect(loadBookingServiceProgress(id)).resolves.toEqual({ bookingId: id, arrivedAt: arrived, serviceCompletedAt: done });
  expect(from).toHaveBeenCalledWith('bookings');
  expect(select).toHaveBeenCalledWith('id, worker_arrived_at, worker_service_completed_at');
});

it('PAY-02: a Worker who has not finished yet reads as not completed', async () => {
  reply({ data: { id, worker_arrived_at: arrived, worker_service_completed_at: null }, error: null });
  await expect(loadBookingServiceProgress(id)).resolves.toMatchObject({ arrivedAt: arrived, serviceCompletedAt: null });
});

it('PAY-02: fails closed on a read error, a missing row, another booking or an invalid id', async () => {
  reply({ data: null, error: { code: '503' } });
  await expect(loadBookingServiceProgress(id)).rejects.toThrow();
  reply({ data: null, error: null });
  await expect(loadBookingServiceProgress(id)).rejects.toThrow();
  reply({ data: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', worker_arrived_at: null, worker_service_completed_at: null }, error: null });
  await expect(loadBookingServiceProgress(id)).rejects.toThrow();
  await expect(loadBookingServiceProgress('not-a-uuid')).rejects.toThrow();
});

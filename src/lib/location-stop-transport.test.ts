import { afterEach, expect, it, vi } from 'vitest';
import { sendLocationStop } from './location-stop-transport';
import type { PendingLocationStop } from './location-stop-queue';
const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: boundary.rpc } }));
const stop: PendingLocationStop = { accountId: 'a', bookingId: 'booking', shareId: 'old-share', attempts: 1, retryAt: 0, deadline: 600000, status: 'retrying' };
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
function result(data: unknown, error: unknown = null) {
  const header = vi.fn(), signal = vi.fn();
  const builder = Object.assign(Promise.resolve({ data, error }), { setHeader: header, abortSignal: signal });
  header.mockReturnValue(builder); signal.mockReturnValue(builder); boundary.rpc.mockReturnValue(builder);
  return { header, signal };
}
it('pins authorization to the dispatching account and sends only the stopped share identifiers', async () => {
  const h = result('not_current');
  expect(await sendLocationStop(stop, 'synthetic-owner-token')).toBe(true);
  expect(boundary.rpc).toHaveBeenCalledWith('stop_my_booking_location_share', { p_booking_id: 'booking', p_share_id: 'old-share' });
  expect(h.header).toHaveBeenCalledWith('Authorization', 'Bearer synthetic-owner-token');
});
it('denial and malformed Stop-all replies remain unconfirmed', async () => {
  result(null, { code: '42501' }); expect(await sendLocationStop(stop, 'token')).toBe(false);
  result(null); expect(await sendLocationStop({ ...stop, shareId: null }, 'token')).toBe(false);
  result(0); expect(await sendLocationStop({ ...stop, shareId: null }, 'token')).toBe(true);
});
it('times out and aborts an unresponsive request without claiming confirmation', async () => {
  vi.useFakeTimers(); let signal!: AbortSignal;
  const builder = { setHeader: () => builder, abortSignal: (next: AbortSignal) => { signal = next; return new Promise(() => {}); } };
  boundary.rpc.mockReturnValue(builder);
  const pending = sendLocationStop(stop, 'token');
  await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toBe(false); expect(signal.aborted).toBe(true);
});

import { expect, it, vi } from 'vitest';
import { confirmWorkerProgress, loadWorkerProgress, parseWorkerProgress, workerProgressPresentation } from './worker-booking-progress';
vi.mock('./supabase', () => ({ supabase: {} }));
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const arrival = '2026-10-30T01:00:00+00:00', done = '2026-10-30T02:00:00+00:00';
const row = { booking_id: id, arrived_at: null, service_completed_at: null };
const accepted = { bookingId: id, arrivedAt: null, serviceCompletedAt: null };

it('offers arrival only after authoritative acceptance', () => {
  expect(workerProgressPresentation('confirmed', accepted, 'pending')).toMatchObject({ action: 'arrive', label: 'Accepted', actionLabel: 'Swipe to Confirm Arrival' });
  for (const status of ['pending', 'completed', 'cancelled', 'no_show']) {
    expect(workerProgressPresentation(status, accepted, 'pending').action).toBeNull();
  }
});
it('offers service completion only after persisted arrival', () => {
  expect(workerProgressPresentation('confirmed', { ...accepted, arrivedAt: arrival }, 'pending')).toMatchObject({ action: 'complete', label: 'Arrived at Job Site', actionLabel: 'Swipe to Mark as Completed' });
});
it.each([
  ['pending', 'Ready to Receive Payment'], ['paid', 'Awaiting Client Final Completion'],
  ['refunded', 'Payment Needs Review'], [null, 'Checking Payment Status'],
])('never invents settlement after service completion (%s)', (payment, message) => {
  expect(workerProgressPresentation('confirmed', { ...accepted, arrivedAt: arrival, serviceCompletedAt: done }, payment)).toMatchObject({ action: null, label: 'Job Completed', message });
});
it('fails closed when progress is missing', () => {
  expect(workerProgressPresentation('confirmed', null, 'pending')).toMatchObject({ action: null, label: 'Progress Unavailable' });
});
it('parses an exact persisted booking projection', () => {
  expect(parseWorkerProgress([row], id)).toEqual(accepted);
  expect(parseWorkerProgress([{ ...row, arrived_at: arrival, service_completed_at: done }], id)).toEqual({ bookingId: id, arrivedAt: arrival, serviceCompletedAt: done });
});
it.each([
  [], [row, row], [{ ...row, booking_id: 'other' }], [{ booking_id: id }],
  [{ ...row, arrived_at: 'not-a-date' }], [{ ...row, service_completed_at: done }],
  [{ ...row, arrived_at: done, service_completed_at: arrival }],
].map(data => ({ data })))('rejects incomplete, foreign or out-of-order server evidence %#', ({ data }) => {
  expect(() => parseWorkerProgress(data, id)).toThrow();
});
it('reads through the narrow Worker RPC without an actor input', async () => {
  const calls: unknown[] = [];
  await expect(loadWorkerProgress(id, async (name, args) => { calls.push([name, args]); return { data: [row], error: null }; })).resolves.toEqual(accepted);
  expect(calls).toEqual([['get_my_worker_booking_progress', { p_booking_id: id }]]);
});
it.each(['arrive', 'complete'] as const)('dispatches one %s with only booking and step, no local timestamp or payment', async step => {
  const calls: unknown[] = [];
  await confirmWorkerProgress(id, step, async (name, args) => {
    calls.push([name, args]); return { data: [{ ...row, arrived_at: arrival, service_completed_at: step === 'complete' ? done : null }], error: null };
  });
  expect(calls).toEqual([['confirm_my_worker_booking_progress', { p_booking_id: id, p_step: step }]]);
});
it('does not claim confirmation from an unchanged/malformed response', async () => {
  await expect(confirmWorkerProgress(id, 'arrive', async () => ({ data: [row], error: null }))).rejects.toThrow();
});
it('sanitizes an authorization failure with no retry', async () => {
  let calls = 0;
  await expect(confirmWorkerProgress(id, 'arrive', async () => { calls++; return { data: null, error: { code: '42501', message: 'private detail' } }; })).rejects.toThrow('Refresh');
  expect(calls).toBe(1);
});

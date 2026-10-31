import { afterEach, expect, it, vi } from 'vitest';
import { createVideoSession, type CallReply, type VideoCall } from './video-call';
vi.mock('./supabase', () => ({ supabase: {} }));
afterEach(() => { vi.useRealTimers(); });
const bookingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ringing: VideoCall = { call_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', booking_id: bookingId,
  role: 'caller', state: 'ringing', server_now: '2026-10-30T00:00:00Z', ring_expires_at: '2026-10-30T00:00:45Z', counterpart_away: false };
it('reconciles an active invitation at its server deadline when no broadcast arrives', async () => {
  vi.useFakeTimers();
  const request = vi.fn(async (action: string): Promise<CallReply> => ({ call: action === 'start' ? ringing : { ...ringing, state: 'missed' } }));
  const owner = createVideoSession({ bookingId, request, media: vi.fn(), onChange: () => {} });
  owner.setActive(true); await owner.act('start');
  await vi.advanceTimersByTimeAsync(45_100);
  expect(request).toHaveBeenCalledWith('status', bookingId);
  expect(owner.view.call?.state).toBe('missed');
  owner.end();
});
it('never fabricates Missed Call locally when the deadline read cannot be confirmed', async () => {
  vi.useFakeTimers();
  const request = vi.fn(async (action: string): Promise<CallReply> => {
    if (action === 'start') return { call: ringing };
    if (action === 'cancel') return { call: { ...ringing, state: 'cancelled' } };
    throw Error('offline');
  });
  const owner = createVideoSession({ bookingId, request, media: vi.fn(), onChange: () => {} });
  owner.setActive(true); await owner.act('start'); await vi.advanceTimersByTimeAsync(45_100);
  expect(owner.view.call?.state).toBe('ringing');
  expect(owner.view.message).toContain('offline');
  owner.end();
});
it('cancels deadline reconciliation when backgrounded or closed', async () => {
  vi.useFakeTimers();
  const request = vi.fn(async (): Promise<CallReply> => ({ call: ringing }));
  const owner = createVideoSession({ bookingId, request, media: vi.fn(), onChange: () => {} });
  owner.setActive(true); await owner.act('start'); owner.setActive(false);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(request).toHaveBeenCalledTimes(1);
  owner.end();
});
it('re-reads the server status itself when an action is no longer available', async () => {
  const missed: VideoCall = { ...ringing, role: 'callee', state: 'missed' };
  let reads = 0;
  const request = vi.fn(async (action: string): Promise<CallReply> => action === 'status'
    ? { call: reads++ === 0 ? { ...ringing, role: 'callee' } : missed } : { ok: false, call: { ...ringing, role: 'callee' } });
  const owner = createVideoSession({ bookingId, request, media: vi.fn(), onChange: () => {} });
  owner.setActive(true); await owner.refresh(); await owner.act('accept');
  await vi.waitFor(() => expect(request.mock.calls.filter(([a]) => a === 'status').length).toBe(2));
  expect(owner.view.message).not.toMatch(/refresh/i);
  owner.end();
});
it('shows Call ended, with no rejoin prompt, when the other person hung up', async () => {
  let disconnect!: () => void;
  const accepted = { ...ringing, state: 'accepted' as const };
  let hungUp = false;
  const request = vi.fn(async (): Promise<CallReply> => ({ call: hungUp ? { ...accepted, state: 'ended' } : accepted, ok: true, token: 't', url: 'wss://x' }));
  const owner = createVideoSession({ bookingId, request, onChange: () => {},
    media: onDisconnected => { disconnect = onDisconnected; return { connect: async () => {}, stop: () => {} }; } });
  owner.setActive(true);
  await owner.refresh();
  await owner.act('rejoin');
  hungUp = true;
  disconnect();
  await vi.waitFor(() => expect(owner.view.call?.state).toBe('ended'));
  expect(owner.view.message).toBeNull();
  owner.end();
});
it('keeps the rejoin prompt when the call is still live after a dropped connection', async () => {
  let disconnect!: () => void;
  const accepted = { ...ringing, state: 'accepted' as const };
  const request = vi.fn(async (): Promise<CallReply> => ({ call: accepted, ok: true, token: 't', url: 'wss://x' }));
  const owner = createVideoSession({ bookingId, request, onChange: () => {},
    media: onDisconnected => { disconnect = onDisconnected; return { connect: async () => {}, stop: () => {} }; } });
  owner.setActive(true);
  await owner.refresh();
  await owner.act('rejoin');
  disconnect();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('status', bookingId));
  expect(owner.view.call?.state).toBe('accepted');
  expect(owner.view.message).toContain('Tap Join to reconnect');
  owner.end();
});

import { afterEach, expect, it, vi } from 'vitest';

import { bannerChatRoute, bannerPresentation, bannerRole, createIncomingMessageBanner, type BannerContext, type IncomingBannerDependencies } from './incoming-message-banner';
import type { ClientBooking, WorkerBooking } from './booking-records';
import { subscribeInvalidation, type BroadcastChannelLike, type SubscribeInvalidationOptions } from './realtime';
import ts from 'typescript';

vi.mock('./supabase', () => ({ supabase: {} }));

const bookingId = '00000000-0000-4000-8000-000000000001';
const me = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const message = (n: number, sender = other) => ({
  id: `00000000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`,
  created_at: '2026-09-27T01:00:00+00:00', sender_id: sender,
});
const booking: WorkerBooking = {
  booking_id: bookingId, booking_status: 'confirmed', job_id: bookingId,
  job_title: 'Repair', client_user_id: other, client_full_name: 'Jane Client', client_phone: null,
  payment_status: null, booked_at: null, completed_at: null,
  job_description: null, job_scheduled_at: null, job_address: null, job_barangay: null,
  job_city: null, job_budget: null,
};
const context: BannerContext = {
  accountId: me, role: 'worker', active: true, pathname: '/worker', bookingId: null, routeKey: '/worker',
};

async function settle() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function harness() {
  const listeners = new Set<SubscribeInvalidationOptions>();
  const loadBookings = vi.fn<IncomingBannerDependencies['loadBookings']>(async () => [booking]);
  const seed = vi.fn<IncomingBannerDependencies['seed']>(async () => message(1));
  const read = vi.fn<IncomingBannerDependencies['read']>(async () => ({ cursor: message(2), messages: [message(2)] }));
  const navigate = vi.fn();
  const banner = createIncomingMessageBanner({
    loadBookings, seed, read, navigate,
    subscribe: options => { listeners.add(options); return () => { listeners.delete(options); }; },
  });
  const emit = (event: string, id = bookingId) => {
    for (const listener of [...listeners]) {
      if (!listener.topic.includes(id) || !listener.events.includes(event)) continue;
      listener.onBroadcastEvent?.(); listener.onInvalidate();
    }
  };
  return { banner, listeners, loadBookings, seed, read, navigate, emit };
}

afterEach(() => { vi.useRealTimers(); });

it('recovers the D3 arrival after the initial baseline when SUBSCRIBED arrives without a message callback', async () => {
  const h = harness();
  h.banner.updateContext(context); await settle();
  expect(h.banner.getSnapshot()).toBeNull();
  h.seed.mockResolvedValue(message(2)); // A replacement seed would swallow this arrival.
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle();
  expect(h.read).toHaveBeenCalledWith(bookingId, message(1), expect.any(Function));
  expect(h.seed).toHaveBeenCalledTimes(1);
  expect(h.banner.getSnapshot()?.messageId).toBe(message(2).id);
  h.banner.stop();
});

it('preserves the established baseline through startup Booking reconciliation', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.seed.mockResolvedValue(message(2));
  h.emit('notification_inserted', me); await settle();
  expect(h.seed).toHaveBeenCalledTimes(1);
  expect(h.read).toHaveBeenCalledWith(bookingId, message(1), expect.any(Function));
  expect(h.banner.getSnapshot()?.messageId).toBe(message(2).id);
  h.banner.stop();
});

it('retains readiness received during the first seed and catches up after that baseline', async () => {
  const h = harness(); let resolve!: (value: ReturnType<typeof message>) => void;
  h.seed.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  h.banner.updateContext(context); await settle();
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle();
  expect(h.seed).toHaveBeenCalledTimes(1);
  resolve(message(1)); await settle();
  expect(h.read).toHaveBeenCalledWith(bookingId, message(1), expect.any(Function));
  expect(h.banner.getSnapshot()?.messageId).toBe(message(2).id);
  h.banner.stop();
});

it('does not consume an arrival when final authority fails and recovers it on reconnect', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.loadBookings.mockResolvedValueOnce([booking]).mockRejectedValueOnce(new Error('offline'));
  h.emit('message_inserted'); await settle();
  expect(h.banner.getSnapshot()).toBeNull();
  h.loadBookings.mockResolvedValue([booking]);
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle();
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(1), expect.any(Function));
  expect(h.seed).toHaveBeenCalledTimes(1);
  expect(h.banner.getSnapshot()?.messageId).toBe(message(2).id);
  h.banner.stop();
});

it('preserves the observation across eligible navigation and treats Booking Details as non-chat', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.seed.mockResolvedValue(message(2));
  h.banner.updateContext({ ...context, pathname: '/worker/booking-details', bookingId, routeKey: 'details' });
  await settle();
  expect(h.seed).toHaveBeenCalledTimes(1);
  expect(h.read).toHaveBeenCalledWith(bookingId, message(1), expect.any(Function));
  expect(h.banner.getSnapshot()).toMatchObject({ messageId: message(2).id, routeKey: 'details' });
  h.banner.stop();
});

it('preserves the established baseline after a failed Booking reconciliation', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.loadBookings.mockRejectedValueOnce(new Error('offline'));
  h.emit('notification_inserted', me); await settle();
  expect(h.banner.getSnapshot()).toBeNull();
  h.seed.mockResolvedValue(message(2));
  h.emit('notification_inserted', me); await settle();
  expect(h.seed).toHaveBeenCalledTimes(1);
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(1), expect.any(Function));
  expect(h.banner.getSnapshot()?.messageId).toBe(message(2).id);
  h.banner.stop();
});

it('establishes a successful empty baseline once and recovers the first startup arrival', async () => {
  const h = harness(); h.seed.mockResolvedValue(null);
  h.banner.updateContext(context); await settle();
  h.seed.mockResolvedValue(message(2));
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle();
  expect(h.seed).toHaveBeenCalledTimes(1);
  expect(h.read).toHaveBeenCalledWith(bookingId, null, expect.any(Function));
  expect(h.banner.getSnapshot()?.messageId).toBe(message(2).id);
  h.banner.stop();
});

it('never replays pre-baseline rows on readiness or repeated reconciliation', async () => {
  const h = harness();
  h.read.mockResolvedValue({ cursor: message(1), messages: [message(1)] });
  h.banner.updateContext(context); await settle();
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle(); h.emit('notification_inserted', me); await settle();
  expect(h.banner.getSnapshot()).toBeNull();
  expect(h.seed).toHaveBeenCalledTimes(1); h.banner.stop();
});

it('evaluates a normal arrival after readiness has caught up with no new rows', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.read.mockResolvedValueOnce({ cursor: message(1), messages: [] });
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle(); expect(h.banner.getSnapshot()).toBeNull();
  h.emit('message_inserted'); await settle();
  expect(h.banner.getSnapshot()?.messageId).toBe(message(2).id); h.banner.stop();
});

it('retains Broadcast and readiness invalidations during catch-up and presents the newest arrival once', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  const presented: string[] = [];
  h.banner.subscribe(() => { const value = h.banner.getSnapshot(); if (value) presented.push(value.messageId); });
  let resolve!: (value: Awaited<ReturnType<typeof h.read>>) => void;
  h.read.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }))
    .mockResolvedValue({ cursor: message(3), messages: [message(2), message(3)] });
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle();
  h.emit('message_inserted');
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle(); expect(h.read).toHaveBeenCalledTimes(1);
  resolve({ cursor: message(2), messages: [message(2)] }); await settle();
  expect(h.read).toHaveBeenCalledTimes(2);
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(2), expect.any(Function));
  expect(presented).toEqual([message(3).id]);
  h.banner.dismiss(); h.emit('message_inserted'); await settle();
  expect(presented).toEqual([message(3).id]); h.banner.stop();
});

it('consumes multiple same-timestamp startup arrivals through the final tuple without replay', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.read.mockResolvedValueOnce({ cursor: message(4), messages: [message(2), message(3, me), message(4)] })
    .mockResolvedValue({ cursor: message(4), messages: [] });
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle(); expect(h.banner.getSnapshot()?.messageId).toBe(message(4).id);
  h.banner.dismiss(); h.emit('notification_inserted', me); await settle();
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(4), expect.any(Function));
  expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('handles a self startup arrival once and still presents the next counterpart arrival', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.read.mockResolvedValue({ cursor: message(2), messages: [message(2, me)] });
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle(); expect(h.banner.getSnapshot()).toBeNull();
  h.read.mockResolvedValue({ cursor: message(3), messages: [message(2, me), message(3)] });
  h.emit('message_inserted'); await settle();
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(2), expect.any(Function));
  expect(h.banner.getSnapshot()?.messageId).toBe(message(3).id); h.banner.stop();
});

it('handles an exact-chat startup arrival without replay when navigating to Booking Details', async () => {
  const h = harness();
  h.banner.updateContext({ ...context, pathname: '/worker/chat', bookingId, routeKey: 'chat' }); await settle();
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle(); expect(h.banner.getSnapshot()).toBeNull();
  h.banner.updateContext({ ...context, pathname: '/worker/booking-details', bookingId, routeKey: 'details' });
  await settle();
  expect(h.seed).toHaveBeenCalledTimes(1);
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(2), expect.any(Function));
  expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('suppresses an in-flight startup arrival if exact chat gains focus before final authority', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  let resolve!: (value: Awaited<ReturnType<typeof h.read>>) => void;
  h.read.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle();
  h.banner.updateContext({ ...context, pathname: '/worker/chat', bookingId, routeKey: 'chat' });
  resolve({ cursor: message(2), messages: [message(2)] }); await settle();
  expect(h.banner.getSnapshot()).toBeNull();
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(1), expect.any(Function));
  h.banner.updateContext(context); await settle();
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(2), expect.any(Function));
  expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('does not replay background messages on resume readiness and evaluates only later arrivals', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  const oldListener = [...h.listeners].find(l => l.events.includes('message_inserted'))!;
  h.banner.updateContext({ ...context, active: false });
  expect(h.banner.getSnapshot()).toBeNull(); expect(h.listeners.size).toBe(0);
  h.seed.mockResolvedValue(message(3));
  oldListener.onBroadcastEvent?.(); oldListener.onInvalidate(); await settle();
  expect(h.read).not.toHaveBeenCalled();
  h.banner.updateContext(context); await settle();
  h.read.mockResolvedValueOnce({ cursor: message(3), messages: [] });
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle(); expect(h.banner.getSnapshot()).toBeNull();
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(3), expect.any(Function));
  h.read.mockResolvedValue({ cursor: message(4), messages: [message(4)] });
  h.emit('message_inserted'); await settle();
  expect(h.banner.getSnapshot()?.messageId).toBe(message(4).id);
  expect(h.seed).toHaveBeenCalledTimes(2); h.banner.stop();
});

it('rejects a regressing processed cursor and recovers from the last completed tuple', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.emit('message_inserted'); await settle(); h.banner.dismiss();
  h.read.mockResolvedValueOnce({ cursor: message(1), messages: [] });
  h.emit('message_inserted'); await settle(); expect(h.banner.getSnapshot()).toBeNull();
  h.read.mockResolvedValue({ cursor: message(3), messages: [message(3)] });
  h.emit('message_inserted'); await settle();
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(2), expect.any(Function));
  expect(h.banner.getSnapshot()?.messageId).toBe(message(3).id); h.banner.stop();
});

it('does not present the same handled arrival again when a subscriber invalidates during commit', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  const presented: string[] = [];
  h.banner.subscribe(() => {
    const value = h.banner.getSnapshot();
    if (!value) return;
    presented.push(value.messageId);
    if (presented.length === 1) h.emit('message_inserted');
  });
  h.emit('message_inserted'); await settle();
  expect(h.read).toHaveBeenCalledTimes(2);
  expect(presented).toEqual([message(2).id]); h.banner.stop();
});

it('retains a later invalidation when discovery failure cancels an in-flight first seed', async () => {
  const h = harness(); let resolve!: (value: ReturnType<typeof message>) => void;
  h.seed.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  h.banner.updateContext(context); await settle();
  h.loadBookings.mockRejectedValueOnce(new Error('offline'));
  h.emit('notification_inserted', me); await settle();
  h.emit('message_inserted'); await settle();
  resolve(message(1)); await settle();
  expect(h.seed).toHaveBeenCalledTimes(2);
  expect(h.read).toHaveBeenCalledWith(bookingId, message(1), expect.any(Function));
  expect(h.banner.getSnapshot()?.messageId).toBe(message(2).id); h.banner.stop();
});

it('does not treat a status hint as a new baseline when authoritative membership remains confirmed', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.seed.mockResolvedValue(message(2));
  h.emit('booking_status_changed'); await settle();
  expect(h.seed).toHaveBeenCalledTimes(1);
  expect(h.read).toHaveBeenCalledWith(bookingId, message(1), expect.any(Function));
  expect(h.banner.getSnapshot()?.messageId).toBe(message(2).id); h.banner.stop();
});

it.each(['pending', 'completed', 'cancelled', 'no_show'] as const)('fails closed before startup catch-up for authoritative %s', async status => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.loadBookings.mockResolvedValue([{ ...booking, booking_status: status }]);
  for (const listener of [...h.listeners]) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle();
  expect(h.read).not.toHaveBeenCalled(); expect(h.banner.getSnapshot()).toBeNull();
  expect([...h.listeners].some(l => l.topic.startsWith('booking:'))).toBe(false); h.banner.stop();
});

it('does not disclose a startup catch-up whose final authority is terminal', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.loadBookings.mockResolvedValueOnce([booking]).mockResolvedValue([{ ...booking, booking_status: 'completed' }]);
  for (const listener of [...h.listeners]) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle();
  expect(h.read).toHaveBeenCalledTimes(1); expect(h.banner.getSnapshot()).toBeNull();
  expect([...h.listeners].some(l => l.topic.startsWith('booking:'))).toBe(false); h.banner.stop();
});

it('discards a first seed completed after backgrounding and uses a fresh baseline on resume', async () => {
  const h = harness(); let resolve!: (value: ReturnType<typeof message>) => void;
  h.seed.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  h.banner.updateContext(context); await settle();
  h.banner.updateContext({ ...context, active: false });
  h.seed.mockResolvedValue(message(3));
  h.banner.updateContext(context); await settle();
  resolve(message(1)); await settle();
  h.read.mockResolvedValue({ cursor: message(3), messages: [] });
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle();
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(3), expect.any(Function));
  expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('keeps P unchanged while startup arrival handling awaits final authority', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  let resolve!: (value: WorkerBooking[]) => void;
  h.loadBookings.mockResolvedValueOnce([booking]).mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  for (const listener of h.listeners) if (listener.events.includes('message_inserted')) listener.onInvalidate();
  await settle(); expect(h.banner.getSnapshot()).toBeNull();
  h.banner.updateContext({ ...context, pathname: '/worker/bookings', routeKey: 'bookings' });
  resolve([booking]); await settle();
  expect(h.read).toHaveBeenCalledTimes(2);
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(1), expect.any(Function));
  expect(h.banner.getSnapshot()?.routeKey).toBe('bookings'); h.banner.stop();
});

it('seeds silently then presents an authorized counterpart message from a real event', async () => {
  vi.useFakeTimers();
  const h = harness();
  h.banner.updateContext(context);
  await settle();
  expect(h.banner.getSnapshot()).toBeNull();
  h.emit('message_inserted'); await settle();
  expect(h.banner.getSnapshot()).toMatchObject({ bookingId, name: 'Jane Client', initials: 'JC', messageId: message(2).id });
  expect(h.banner.getSnapshot()).not.toHaveProperty('content');
  h.banner.stop();
});

it.each(['administrator', 'unknown'])('excludes %s accounts', role => {
  expect(bannerRole({ sessionId: me, status: 'resolved', account: { id: me, role, is_active: true } })).toBeNull();
});
it.each([
  { sessionId: null, status: 'resolved', account: { id: me, role: 'worker', is_active: true } },
  { sessionId: other, status: 'resolved', account: { id: me, role: 'client', is_active: true } },
  { sessionId: me, status: 'pending', account: { id: me, role: 'worker', is_active: true } },
  { sessionId: me, status: 'resolved', account: { id: me, role: 'worker', is_active: false } },
  { sessionId: me, status: 'resolved', account: null },
])('fails closed for invalid account/session resolution %j', input => { expect(bannerRole(input)).toBeNull(); });

it.each(['worker', 'client'] as const)('uses only bookingId for the existing %s chat route', role => {
  expect(bannerChatRoute(role, bookingId)).toEqual({ pathname: `/${role}/chat`, params: { bookingId } });
  expect(bannerRole({ sessionId: me, status: 'resolved', account: { id: me, role, is_active: true } })).toBe(role);
});

it.each(['pending', 'completed', 'cancelled', 'no_show'] as const)('never derives identity or subscribes for %s', async status => {
  const h = harness();
  const terminal = { ...booking, booking_status: status };
  expect(bannerPresentation('worker', terminal)).toBeNull();
  h.loadBookings.mockResolvedValue([terminal]);
  h.banner.updateContext(context); await settle();
  expect([...h.listeners].filter(l => l.topic.startsWith('booking:'))).toHaveLength(0);
  expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('observes own and duplicate message IDs without displaying them again', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.read.mockResolvedValue({ cursor: message(2), messages: [message(2, me)] });
  h.emit('message_inserted'); await settle(); expect(h.banner.getSnapshot()).toBeNull();
  h.read.mockResolvedValue({ cursor: message(3), messages: [message(2), message(3)] });
  h.emit('message_inserted'); await settle(); expect(h.banner.getSnapshot()?.messageId).toBe(message(3).id);
  h.banner.dismiss(); h.emit('message_inserted'); await settle();
  expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it.each([bookingId, '00000000-0000-4000-8000-000000000009'])('suppresses only the exact focused chat: %s', async focused => {
  const h = harness(); h.banner.updateContext({ ...context, pathname: '/worker/chat', bookingId: focused }); await settle();
  h.emit('message_inserted'); await settle();
  expect(h.banner.getSnapshot() !== null).toBe(focused !== bookingId); h.banner.stop();
});

it('does not read messages when the first event authorization check reports terminal', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.loadBookings.mockResolvedValue([{ ...booking, booking_status: 'completed' }]);
  h.emit('message_inserted'); await settle();
  expect(h.read).not.toHaveBeenCalled(); expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('discards an in-flight batch when status invalidates during pagination', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  let resolve!: (value: Awaited<ReturnType<typeof h.read>>) => void;
  h.read.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  h.emit('message_inserted'); await settle();
  h.loadBookings.mockResolvedValue([{ ...booking, booking_status: 'completed' }]);
  h.emit('booking_status_changed');
  resolve({ cursor: message(2), messages: [message(2)] }); await settle();
  expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('requires final confirmed authority after message reads even without a status event', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.loadBookings.mockResolvedValueOnce([booking]).mockResolvedValue([{ ...booking, booking_status: 'cancelled' }]);
  h.emit('message_inserted'); await settle();
  expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('fails closed on message read or final authorization failure', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.read.mockRejectedValue(new Error('offline')); h.emit('message_inserted'); await settle();
  expect(h.banner.getSnapshot()).toBeNull();
  h.read.mockResolvedValue({ cursor: message(2), messages: [message(2)] });
  h.emit('message_inserted'); await settle();
  expect(h.read).toHaveBeenLastCalledWith(bookingId, message(1), expect.any(Function));
  expect(h.banner.getSnapshot()?.messageId).toBe(message(2).id); h.banner.stop();
});

it('reconnect catches up but foreground return seeds without replaying messages', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  for (const l of h.listeners) if (l.events.includes('message_inserted')) l.onInvalidate();
  await settle(); expect(h.banner.getSnapshot()?.messageId).toBe(message(2).id);
  expect(h.seed).toHaveBeenCalledTimes(1);
  h.banner.updateContext({ ...context, active: false }); expect(h.listeners.size).toBe(0);
  h.seed.mockResolvedValue(message(3)); h.read.mockClear();
  h.banner.updateContext(context); await settle();
  expect(h.banner.getSnapshot()).toBeNull(); expect(h.read).not.toHaveBeenCalled();
  expect(h.seed).toHaveBeenCalledTimes(2); h.banner.stop();
});

it('suppresses a row included in the initial seed even when its event arrived during seeding', async () => {
  const h = harness(); let resolve!: (value: ReturnType<typeof message>) => void;
  h.seed.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  h.banner.updateContext(context); await settle();
  h.emit('message_inserted'); resolve(message(2)); await settle();
  expect(h.banner.getSnapshot()).toBeNull();
  expect(h.read).toHaveBeenCalledWith(bookingId, message(2), expect.any(Function)); h.banner.stop();
});

it('reconciles notification invalidation against fresh confirmed membership', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.loadBookings.mockResolvedValue([{ ...booking, booking_id: other }]);
  h.emit('notification_inserted', me); await settle();
  expect([...h.listeners].some(l => l.topic === `booking:${bookingId}:messages`)).toBe(false);
  expect([...h.listeners].some(l => l.topic === `booking:${other}:messages`)).toBe(true);
  expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it.each(['background', 'dismiss', 'route', 'exact-chat', 'account', 'sign-out', 'terminal'] as const)('clears on %s', async reason => {
  vi.useFakeTimers(); const h = harness(); h.banner.updateContext(context); await settle();
  h.emit('message_inserted'); await settle(); expect(h.banner.getSnapshot()).not.toBeNull();
  if (reason === 'dismiss') h.banner.dismiss();
  if (reason === 'background') h.banner.updateContext({ ...context, active: false });
  if (reason === 'route') h.banner.updateContext({ ...context, pathname: '/worker/bookings', routeKey: 'bookings' });
  if (reason === 'exact-chat') h.banner.updateContext({ ...context, pathname: '/worker/chat', bookingId, routeKey: 'chat' });
  if (reason === 'account') h.banner.updateContext({ ...context, accountId: other });
  if (reason === 'sign-out') h.banner.updateContext({ ...context, accountId: null, role: null });
  if (reason === 'terminal') h.emit('booking_status_changed');
  expect(h.banner.getSnapshot()).toBeNull(); await settle(); h.banner.stop();
});

it('newer same-booking messages replace the slot and restart its five-second timer', async () => {
  vi.useFakeTimers(); const h = harness(); h.banner.updateContext(context); await settle();
  h.emit('message_inserted'); await settle(); vi.advanceTimersByTime(4000);
  h.read.mockResolvedValue({ cursor: message(5), messages: [message(3), message(4, me), message(5)] });
  h.emit('message_inserted'); await settle();
  expect(h.banner.getSnapshot()?.messageId).toBe(message(5).id);
  vi.advanceTimersByTime(4999); expect(h.banner.getSnapshot()).not.toBeNull();
  vi.advanceTimersByTime(1); expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('tap clears and pushes only the existing authorized route', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.emit('message_inserted'); await settle();
  const tap = h.banner.tap(); expect(h.banner.getSnapshot()).toBeNull(); await tap;
  expect(h.navigate).toHaveBeenCalledWith({ pathname: '/worker/chat', params: { bookingId } }); h.banner.stop();
});

it('terminal before tap cannot use the banner as cached authorization', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.emit('message_inserted'); await settle();
  h.loadBookings.mockResolvedValue([{ ...booking, booking_status: 'completed' }]);
  await h.banner.tap(); expect(h.navigate).not.toHaveBeenCalled(); expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('terminal invalidation cancels a pending tap authority response', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.emit('message_inserted'); await settle();
  let resolve!: (value: WorkerBooking[]) => void;
  h.loadBookings.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  const tapped = h.banner.tap(); h.emit('booking_status_changed'); resolve([booking]); await tapped;
  expect(h.navigate).not.toHaveBeenCalled(); await settle(); h.banner.stop();
});

it('Client banners use the authorized Worker name and existing Client route', async () => {
  const h = harness();
  const clientBooking: ClientBooking = { ...booking, worker_user_id: other, worker_full_name: 'Will Worker',
    worker_phone: null, worker_barangay: null, worker_skills: null, worker_is_verified: null,
    worker_rating_avg: null, worker_rating_count: null };
  // Use an actual Client row shape, with no Worker-facing fields.
  const { client_user_id: _id, client_full_name: _name, client_phone: _phone, ...base } = booking;
  h.loadBookings.mockResolvedValue([{ ...base, worker_user_id: clientBooking.worker_user_id,
    worker_full_name: clientBooking.worker_full_name, worker_phone: null, worker_barangay: null,
    worker_skills: null, worker_is_verified: null, worker_rating_avg: null, worker_rating_count: null }]);
  h.banner.updateContext({ ...context, role: 'client', pathname: '/client' }); await settle();
  h.emit('message_inserted'); await settle();
  expect(h.banner.getSnapshot()?.name).toBe('Will Worker');
  await h.banner.tap(); expect(h.navigate).toHaveBeenCalledWith({ pathname: '/client/chat', params: { bookingId } });
  h.banner.stop();
});

it('cross-booking last eligible arrival wins even if an older read finishes later', async () => {
  const h = harness(); h.loadBookings.mockResolvedValue([booking, { ...booking, booking_id: other }]);
  h.banner.updateContext(context); await settle();
  let resolve!: (value: Awaited<ReturnType<typeof h.read>>) => void;
  h.read.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }))
    .mockResolvedValue({ cursor: message(3), messages: [message(3)] });
  h.emit('message_inserted'); await settle(); h.emit('message_inserted', other); await settle();
  expect(h.banner.getSnapshot()?.bookingId).toBe(other);
  resolve({ cursor: message(2), messages: [message(2)] }); await settle();
  expect(h.banner.getSnapshot()?.messageId).toBe(message(3).id); h.banner.stop();
});

it('coalesces a same-booking burst and consumes the follow-up without concurrent reads', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  let resolve!: (value: Awaited<ReturnType<typeof h.read>>) => void;
  h.read.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }))
    .mockResolvedValue({ cursor: message(3), messages: [message(3)] });
  h.emit('message_inserted'); await settle();
  h.emit('message_inserted'); h.emit('message_inserted'); await settle();
  expect(h.read).toHaveBeenCalledTimes(1);
  resolve({ cursor: message(2), messages: [message(2)] }); await settle();
  expect(h.read).toHaveBeenCalledTimes(2); expect(h.banner.getSnapshot()?.messageId).toBe(message(3).id); h.banner.stop();
});

it('attributes a coalesced burst to its latest arrival even when the follow-up read is empty', async () => {
  const h = harness(); h.loadBookings.mockResolvedValue([booking, { ...booking, booking_id: other }]);
  h.banner.updateContext(context); await settle();
  let resolve!: (value: Awaited<ReturnType<typeof h.read>>) => void;
  h.read.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }))
    .mockResolvedValueOnce({ cursor: message(3), messages: [message(3)] })
    .mockResolvedValue({ cursor: message(4), messages: [] });
  h.emit('message_inserted'); await settle();
  h.emit('message_inserted', other); await settle();
  h.emit('message_inserted');
  resolve({ cursor: message(4), messages: [message(2), message(4)] }); await settle();
  expect(h.banner.getSnapshot()?.messageId).toBe(message(4).id); h.banner.stop();
});

it.each(['background', 'route', 'sign-out'] as const)('discards late message results after %s', async reason => {
  const h = harness(); h.banner.updateContext(context); await settle();
  let resolve!: (value: Awaited<ReturnType<typeof h.read>>) => void;
  h.read.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  h.emit('message_inserted'); await settle();
  h.banner.updateContext(reason === 'background' ? { ...context, active: false } : reason === 'route' ?
    { ...context, pathname: '/worker/bookings', routeKey: 'bookings' } : { ...context, accountId: null, role: null });
  expect(h.read.mock.calls[0][2]()).toBe(false);
  resolve({ cursor: message(2), messages: [message(2)] }); await settle();
  if (reason === 'route') {
    // A fresh evaluation on the new eligible route may recover the arrival;
    // the stale evaluation cannot consume it or disclose on the old route.
    expect(h.read).toHaveBeenCalledTimes(2);
    expect(h.read).toHaveBeenLastCalledWith(bookingId, message(1), expect.any(Function));
    expect(h.banner.getSnapshot()?.routeKey).toBe('bookings');
  } else expect(h.banner.getSnapshot()).toBeNull();
  h.banner.stop();
});

it('does not display cached identity when final authority fails', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.loadBookings.mockResolvedValueOnce([booking]).mockRejectedValueOnce(new Error('offline'));
  h.emit('message_inserted'); await settle(); expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('unknown sender IDs do not impersonate the authorized counterpart', async () => {
  const h = harness(); h.banner.updateContext(context); await settle();
  h.read.mockResolvedValue({ cursor: message(2), messages: [message(2, bookingId)] });
  h.emit('message_inserted'); await settle(); expect(h.banner.getSnapshot()).toBeNull(); h.banner.stop();
});

it('shares the existing physical booking channel with a chat consumer and cleans up only its own registrations', async () => {
  const channels = new Map<string, BroadcastChannelLike>();
  const client = {
    channel: vi.fn((topic: string) => {
      const channel: BroadcastChannelLike = { on: () => channel, subscribe: () => undefined };
      channels.set(topic, channel); return channel;
    }),
    removeChannel: vi.fn(async () => 'ok'),
  };
  const cleanupChat = subscribeInvalidation({ topic: `booking:${bookingId}:messages`,
    events: ['message_inserted', 'booking_status_changed'], onInvalidate: () => {}, client });
  const banner = createIncomingMessageBanner({ loadBookings: async () => [booking], seed: async () => null,
    read: async () => ({ cursor: null, messages: [] }), navigate: () => {},
    subscribe: options => subscribeInvalidation({ ...options, client }) });
  banner.updateContext(context); await settle();
  expect(client.channel.mock.calls.filter(([name]) => name === `booking:${bookingId}:messages`)).toHaveLength(1);
  banner.stop(); await settle();
  expect(client.removeChannel).not.toHaveBeenCalledWith(channels.get(`booking:${bookingId}:messages`));
  cleanupChat(); await settle();
  expect(client.removeChannel).toHaveBeenCalledWith(channels.get(`booking:${bookingId}:messages`));
});

it('mounts one foreground host alongside the unchanged push-intent host and wires existing readers', () => {
  const root = ts.sys.readFile('src/app/_layout.tsx')!;
  const host = ts.sys.readFile('src/components/incoming-message-banner-host.tsx')!;
  expect(root.match(/<IncomingMessageBannerHost\s*\/>/g)).toHaveLength(1);
  expect(root).toMatch(/<AccountProvider>[\s\S]*<TamaguiProvider[\s\S]*<PushNotificationInboxIntent\s*\/>[\s\S]*<RootNavigator\s*\/>[\s\S]*<IncomingMessageBannerHost\s*\/>/);
  expect(host).toContain('subscribe: subscribeInvalidation');
  expect(host).toContain('seed: seedBookingMessageCursor'); expect(host).toContain('read: readNewBookingMessages');
  expect(host).toContain('loadWorkerBookings() : loadClientBookings()');
  expect(host).toContain('useGlobalSearchParams()'); expect(host).toContain('usePathname()');
  expect(host).toContain("AppState.addEventListener('change'");
  // Navigation effects may clean up their AppState listener, but only the
  // controller lifetime effect may terminate the foreground observation.
  const routeEffect = host.slice(host.indexOf('const update ='), host.indexOf('// Render gating'));
  expect(routeEffect).not.toContain('controller.stop()');
  expect(host).toMatch(/useLayoutEffect\(\(\) => \(\) => controller\.stop\(\), \[controller\]\)/);
  expect(host).toContain('accessibilityLabel="Dismiss new message"');
  expect(host).not.toMatch(/report_submitted|notifications\.is_read|messages\.is_read|\.content/);
});

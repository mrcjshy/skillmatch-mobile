import { expect, it, vi } from 'vitest';
import { createLocationStopQueue } from './location-stop-queue';
import { createSharingController, type SharingDeps } from './location-sharing';

vi.mock('./supabase', () => ({ supabase: {} }));

it('retains an unconfirmed Stop after the map unsubscribes and retries the exact session on recovery', async () => {
  let now = 0;
  const send = vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(true);
  const queue = createLocationStopQueue(() => now);
  queue.setContext({ accountId: 'a', isCurrent: () => true, send });
  const listener = vi.fn(); const unsubscribe = queue.subscribe(listener);
  queue.enqueue('a', 'booking', 'old-share');
  await queue.tick(); unsubscribe();
  expect(queue.getSnapshot()[0]).toMatchObject({ status: 'unconfirmed', attempts: 1 });
  now = 1000; await queue.tick();
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ accountId: 'a', bookingId: 'booking', shareId: 'old-share' }));
  expect(queue.getSnapshot()).toEqual([]);
});
it('caps attempts, survives remount, and reports expiry as unconfirmed without retrying forever', async () => {
  let now = 0;
  const send = vi.fn().mockResolvedValue(false);
  const queue = createLocationStopQueue(() => now);
  queue.setContext({ accountId: 'a', isCurrent: () => true, send });
  queue.enqueue('a', 'booking', 'share'); await queue.tick();
  for (const time of [1000, 6000, 21000, 30000, 60000]) { now = time; await queue.tick(); }
  queue.retry('a'); await queue.tick();
  expect(send).toHaveBeenCalledTimes(4);
  expect(queue.getSnapshot()[0].status).toBe('unconfirmed');
  now = 600001; await queue.tick();
  expect(queue.getSnapshot()[0].status).toBe('expired-unconfirmed');
  expect(queue.canRetry('a')).toBe(false); expect(send).toHaveBeenCalledTimes(4);
});
it('pauses on background/logout and never dispatches old-account Stop-all as the replacement account', async () => {
  let active = true, current = true, now = 0;
  const queue = createLocationStopQueue(() => now);
  const sendA = vi.fn().mockResolvedValue(false), sendB = vi.fn().mockResolvedValue(true);
  queue.setContext({ accountId: 'a', isCurrent: () => active && current, send: sendA });
  queue.enqueue('a', 'booking', null); await queue.tick();
  active = false; now = 2000; await queue.tick(); expect(sendA).toHaveBeenCalledTimes(1);
  current = false; queue.setContext(null); await queue.tick();
  queue.setContext({ accountId: 'b', isCurrent: () => true, send: sendB }); await queue.tick();
  expect(sendB).not.toHaveBeenCalled(); expect(queue.getSnapshot()).toHaveLength(1);
  active = true; current = true; sendA.mockResolvedValue(true);
  queue.setContext({ accountId: 'a', isCurrent: () => active && current, send: sendA }); await queue.tick();
  expect(queue.getSnapshot()).toEqual([]);
});
it('invalidated session before dispatch consumes no retry and a same-account new session can finish cleanup', async () => {
  const queue = createLocationStopQueue(); const oldSend = vi.fn(), send = vi.fn().mockResolvedValue(true);
  let current = true;
  queue.setContext({ accountId: 'a', isCurrent: () => current, send: oldSend });
  queue.enqueue('a', 'booking', 'share'); current = false; await queue.tick();
  expect(oldSend).not.toHaveBeenCalled(); expect(queue.getSnapshot()[0].attempts).toBe(0);
  queue.setContext({ accountId: 'a', isCurrent: () => true, send }); await queue.tick();
  expect(queue.getSnapshot()).toEqual([]);
});
it('navigation removes GPS immediately but failed Stop belongs to the app queue, including a late Start', async () => {
  const queue = createLocationStopQueue(); const send = vi.fn().mockResolvedValue(false);
  queue.setContext({ accountId: 'a', isCurrent: () => true, send });
  const remove = vi.fn(), watch = vi.fn(async () => ({ remove }));
  const deps: SharingDeps = { bookingId: 'booking', accountId: 'a', stopQueue: queue, now: Date.now,
    permission: async () => 'granted', servicesEnabled: async () => true, watch, onChange: vi.fn(),
    api: { start: async () => 'old-share', publish: vi.fn(), stop: vi.fn(), stopAll: vi.fn() } };
  const first = createSharingController(deps); first.setActive(true); await first.start();
  first.dispose({ stopServerShare: true }); await queue.tick();
  expect(remove).toHaveBeenCalledOnce();
  const next = createSharingController(deps); next.setActive(true); await next.start();
  expect(next.state.cleanupPending).toBe(true); expect(watch).toHaveBeenCalledTimes(1);
  send.mockResolvedValue(true); queue.retry('a'); await queue.tick();
  expect(next.state.cleanupPending).toBe(false); expect(watch).toHaveBeenCalledTimes(1);
  next.dispose();
  let resolve!: (id: string) => void;
  const late = createSharingController({ ...deps, api: { ...deps.api, start: () => new Promise(r => { resolve = r; }) } });
  late.setActive(true); const starting = late.start();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  late.dispose({ stopServerShare: true }); resolve('late-share'); await starting; await queue.tick();
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ shareId: 'late-share' }));
  expect(watch).toHaveBeenCalledTimes(1);
});
it('a session-specific retry never upgrades itself to Stop-all or targets a newer share', async () => {
  let now = 0, currentShare = 'new-share';
  const queue = createLocationStopQueue(() => now);
  const send = vi.fn(async (entry: { shareId: string | null }) => {
    if (now === 0) throw Error('offline');
    if (entry.shareId === currentShare) currentShare = '';
    return true; // not_current is a successful cleanup result for the old share
  });
  queue.setContext({ accountId: 'a', isCurrent: () => true, send });
  queue.enqueue('a', 'booking', 'old-share'); await queue.tick(); now = 1000; await queue.tick();
  expect(currentShare).toBe('new-share'); expect(send.mock.calls.every(([entry]) => entry.shareId === 'old-share')).toBe(true);
});
it('unconfirmed Stop-all still blocks a replacement local share after expiry until explicitly reissued and confirmed', async () => {
  let now = 0; const send = vi.fn().mockResolvedValue(false);
  const queue = createLocationStopQueue(() => now);
  queue.setContext({ accountId: 'a', isCurrent: () => true, send });
  queue.enqueue('a', 'booking', null); await queue.tick(); now = 600001; await queue.tick();
  expect(queue.blocksStart('a', 'booking')).toBe(true);
  expect(queue.canRetry('a')).toBe(false);
  send.mockResolvedValue(true); queue.enqueue('a', 'booking', null); await queue.tick();
  expect(queue.blocksStart('a', 'booking')).toBe(false);
});

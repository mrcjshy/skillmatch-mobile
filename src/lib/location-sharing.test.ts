import { describe, expect, it, vi } from 'vitest';

import {
  createPinsReader,
  createSharingController,
  type PinsReaderDeps,
  type SharingDeps,
  type SharingState,
} from './location-sharing';
import type { PinsRead } from './location-pins';

vi.mock('./supabase', () => ({ supabase: { rpc: () => { throw new Error('Unrequested RPC'); } } }));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((done) => setTimeout(done, 0));

function sharingHarness(over: Partial<SharingDeps> = {}) {
  const calls: string[] = [];
  const states: SharingState[] = [];
  let emit: ((r: { latitude: number; longitude: number; accuracy: number; timestampMs: number }) => void) | null = null;
  let removed = 0;
  let now = 100_000;
  const deps: SharingDeps = {
    bookingId: 'booking-1',
    permission: async () => 'granted',
    servicesEnabled: async () => true,
    watch: async (onReading) => {
      calls.push('watch');
      emit = onReading;
      return { remove: () => { removed++; emit = null; calls.push('unwatch'); } };
    },
    api: {
      start: async () => { calls.push('start'); return 'share-1'; },
      publish: async (a) => { calls.push(`publish:${a.shareId}:${a.seq}`); return 'ok'; },
      stop: async (_b, id) => { calls.push(`stop:${id}`); return 'stopped'; },
      stopAll: async () => { calls.push('stopAll'); return 1; },
    },
    now: () => now,
    onChange: (s) => states.push(s),
    ...over,
  };
  const controller = createSharingController(deps);
  return {
    controller, calls, states,
    last: () => states[states.length - 1],
    reading: (dLat = 0, ageMs = 0, accuracy = 10) => emit?.({ latitude: 14.6 + dLat, longitude: 121.03, accuracy, timestampMs: now - ageMs }),
    hasWatcher: () => emit !== null,
    removed: () => removed,
    advance: (ms: number) => { now += ms; },
  };
}

describe('sharing starts only from an explicit action on the open map', () => {
  it('never collects before Share is tapped, even when active', async () => {
    const h = sharingHarness();
    h.controller.setActive(true);
    await flush();
    expect(h.calls).toEqual([]);
    expect(h.last()?.status ?? 'off').toBe('off');
  });

  it('starts, watches only while active, and publishes', async () => {
    const h = sharingHarness();
    h.controller.setActive(true);
    await h.controller.start();
    expect(h.calls).toEqual(['start', 'watch']);
    h.reading();
    await flush();
    expect(h.calls).toContain('publish:share-1:1');
    expect(h.last().status).toBe('sharing');
  });

  it('Android permission round-trip (inactive during the request) ends with one share and one watcher', async () => {
    for (const activeBeforeStartReturns of [true, false]) {
      const permission = deferred<'granted'>();
      const started = deferred<string>();
      const serverCalls: string[] = [];
      const h = sharingHarness({ permission: () => permission.promise, api: {
        start: () => { serverCalls.push('start'); return started.promise; },
        publish: async () => 'ok',
        stop: async (_b, id) => { serverCalls.push(`stop:${id}`); return 'stopped'; },
        stopAll: async () => { serverCalls.push('stopAll'); return 1; },
      } });
      h.controller.setActive(true);
      const run = h.controller.start();
      h.controller.setActive(false); // GrantPermissionsActivity pauses the app
      permission.resolve('granted');
      await flush();
      if (activeBeforeStartReturns) h.controller.setActive(true);
      started.resolve('share-1');
      await run;
      if (!activeBeforeStartReturns) { expect(h.last().status).toBe('paused'); h.controller.setActive(true); }
      await flush();
      expect(serverCalls).toEqual(['start']);
      expect(h.calls.filter(c => c === 'watch')).toHaveLength(1);
      expect(h.last().status).toBe('sharing');
    }
  });

  it('started while the map is not active stays paused with no watcher', async () => {
    const h = sharingHarness();
    await h.controller.start();
    expect(h.hasWatcher()).toBe(false);
    expect(h.last().status).toBe('paused');
  });
});

describe('pause and resume', () => {
  it('a watcher resolving after background/foreground cannot replace the new watcher', async () => {
    const pending = deferred<{ remove: () => void }>();
    const oldRemove = vi.fn();
    const currentRemove = vi.fn();
    let count = 0;
    const h = sharingHarness({ watch: async () => ++count === 1 ? pending.promise : { remove: currentRemove } });
    h.controller.setActive(true);
    const start = h.controller.start();
    await flush();
    h.controller.setActive(false);
    h.controller.setActive(true);
    await flush();
    pending.resolve({ remove: oldRemove });
    await start;
    expect(oldRemove).toHaveBeenCalledOnce();
    h.controller.stop();
    expect(currentRemove).toHaveBeenCalledOnce();
  });
  it('blur/background removes the watcher, drops late readings and resumes the SAME share without start', async () => {
    const h = sharingHarness();
    h.controller.setActive(true);
    await h.controller.start();
    h.controller.setActive(false);
    expect(h.removed()).toBe(1);
    expect(h.last().status).toBe('paused');
    h.controller.setActive(true);
    await flush();
    expect(h.calls.filter((c) => c === 'start')).toHaveLength(1);
    expect(h.calls.filter((c) => c === 'watch')).toHaveLength(2);
  });

  // expo-location re-checks Android's location settings on every watch start, so resuming
  // after "No thanks" would re-open the Location Accuracy prompt on every return.
  it('a refused location-settings prompt ends the session and stops the share instead of re-prompting on resume', async () => {
    for (const refusal of [Object.assign(new Error('Location request failed due to unsatisfied device settings'), { code: 'ERR_LOCATION_SETTINGS_UNSATISFIED' }), new Error('native failure')]) {
      const prompt = deferred<{ remove: () => void }>();
      let watches = 0;
      const h = sharingHarness({ watch: () => { watches++; return watches === 1 ? prompt.promise : Promise.reject(Error('unexpected')); } });
      h.controller.setActive(true);
      const start = h.controller.start();
      await flush();
      h.controller.setActive(false); // the prompt pauses the app
      prompt.reject(refusal);
      await start;
      h.controller.setActive(true);
      await flush();
      expect(watches).toBe(1);
      expect(h.controller.currentShareId).toBeNull();
      expect(h.calls.filter(c => c === 'stop:share-1')).toHaveLength(1);
      expect(h.last().status).toBe(refusal.message.includes('settings') ? 'services_off' : 'error');
      await h.controller.start();
      expect(h.calls.filter(c => c === 'start')).toHaveLength(2);
    }
  });

  it('a failed watch start without a pause also releases the share; Share stays an explicit retry', async () => {
    const h = sharingHarness({ watch: () => Promise.reject(Object.assign(Error('x'), { code: 'ERR_LOCATION_SETTINGS_UNSATISFIED' })) });
    h.controller.setActive(true);
    await h.controller.start();
    await flush();
    expect(h.last().status).toBe('services_off');
    expect(h.calls).toEqual(['start', 'stop:share-1']);
    h.controller.setActive(false); h.controller.setActive(true);
    await flush();
    expect(h.calls).toEqual(['start', 'stop:share-1']);
  });
});

describe('Stop is never undone', () => {
  it('reports a failed server stop and retries the same session without resuming collection', async () => {
    let fail = true;
    const stop = vi.fn(async () => { if (fail) throw Error('offline'); return 'stopped'; });
    const h = sharingHarness({ api: { start: async () => 'share-1', publish: async () => 'ok', stop, stopAll: async () => 0 } });
    h.controller.setActive(true); await h.controller.start(); h.controller.stop(); await flush();
    expect(h.hasWatcher()).toBe(false);
    expect(h.controller.state.cleanupPending).toBe(true);
    fail = false; h.controller.retryStop(); await flush();
    expect(h.controller.state.cleanupPending).toBe(false);
    expect(stop).toHaveBeenLastCalledWith('booking-1', 'share-1');
  });
  it('a late Start result after Stop is stopped server-side and never watched', async () => {
    const pending = deferred<string>();
    const h = sharingHarness({ api: {
      start: () => pending.promise,
      publish: async () => 'ok',
      stop: async (_b, id) => { h.calls.push(`stop:${id}`); return 'stopped'; },
      stopAll: async () => 1,
    } });
    h.controller.setActive(true);
    const started = h.controller.start();
    await flush(); // permission + services resolved; api.start is now in flight
    h.controller.stop();
    pending.resolve('late-share');
    await started;
    await flush();
    expect(h.hasWatcher()).toBe(false);
    expect(h.calls).toContain('stop:late-share');
    expect(h.last().status).toBe('off');
  });

  it('a late permission grant after Stop starts nothing', async () => {
    const perm = deferred<'granted'>();
    const h = sharingHarness({ permission: () => perm.promise });
    h.controller.setActive(true);
    const started = h.controller.start();
    h.controller.stop();
    perm.resolve('granted');
    await started;
    expect(h.calls).toEqual([]);
  });

  it('a late watcher registration after Stop is removed immediately', async () => {
    const watcher = deferred<{ remove: () => void }>();
    let removedLate = 0;
    const h = sharingHarness({ watch: () => watcher.promise });
    h.controller.setActive(true);
    const started = h.controller.start();
    await flush();
    h.controller.stop();
    watcher.resolve({ remove: () => { removedLate++; } });
    await started;
    await flush();
    expect(removedLate).toBe(1);
  });

  it('activation after Stop never auto-resumes', async () => {
    const h = sharingHarness();
    h.controller.setActive(true);
    await h.controller.start();
    h.controller.stop();
    h.controller.setActive(false);
    h.controller.setActive(true);
    await flush();
    expect(h.calls.filter((c) => c === 'watch')).toHaveLength(1);
    expect(h.last().status).toBe('off');
  });

  it('a publish result arriving after Stop does not change state', async () => {
    const pub = deferred<'ok'>();
    const h = sharingHarness({ api: {
      start: async () => 'share-1', publish: () => pub.promise,
      stop: async () => 'stopped', stopAll: async () => 1,
    } });
    h.controller.setActive(true);
    await h.controller.start();
    h.reading();
    h.controller.stop();
    pub.resolve('ok');
    await flush();
    expect(h.last().status).toBe('off');
  });
});

describe('server answers end sharing honestly', () => {
  it('not_current means another device took over', async () => {
    const h = sharingHarness({ api: { start: async () => 's', publish: async () => 'not_current', stop: async () => 'not_current', stopAll: async () => 0 } });
    h.controller.setActive(true);
    await h.controller.start();
    h.reading();
    await flush();
    expect(h.last().status).toBe('moved');
    expect(h.hasWatcher()).toBe(false);
  });

  it('expired ends the session; a new share needs another tap', async () => {
    const h = sharingHarness({ api: { start: async () => 's', publish: async () => 'expired', stop: async () => 'not_current', stopAll: async () => 0 } });
    h.controller.setActive(true);
    await h.controller.start();
    h.reading();
    await flush();
    expect(h.last().status).toBe('expired');
    h.controller.setActive(false);
    h.controller.setActive(true);
    await flush();
    expect(h.calls.filter((c) => c === 'watch')).toHaveLength(1);
  });

  it('denial (booking ended / account inactive) stops collection', async () => {
    const h = sharingHarness({ api: {
      start: async () => 's',
      publish: async () => { throw Object.assign(new Error('x'), { code: '42501' }); },
      stop: async () => 'not_current', stopAll: async () => 0,
    } });
    h.controller.setActive(true);
    await h.controller.start();
    h.reading();
    await flush();
    expect(h.last().status).toBe('ended');
    expect(h.hasWatcher()).toBe(false);
  });

  it('permission denied and services off never invent a position', async () => {
    const denied = sharingHarness({ permission: async () => 'settings' });
    denied.controller.setActive(true);
    await denied.controller.start();
    expect(denied.last().status).toBe('denied_settings');
    expect(denied.calls).toEqual([]);
    const off = sharingHarness({ servicesEnabled: async () => false });
    off.controller.setActive(true);
    await off.controller.start();
    expect(off.last().status).toBe('services_off');
    expect(off.calls).toEqual([]);
  });

  it('flags approximate readings without blocking them', async () => {
    const h = sharingHarness();
    h.controller.setActive(true);
    await h.controller.start();
    h.reading(0, 0, 500);
    await flush();
    expect(h.calls).toContain('publish:share-1:1');
    expect(h.last()).toMatchObject({ status: 'sharing', approximate: true });
  });

  it('drops readings older than 30 s', async () => {
    const h = sharingHarness();
    h.controller.setActive(true);
    await h.controller.start();
    h.reading(0, 31_000);
    await flush();
    expect(h.calls.some((c) => c.startsWith('publish'))).toBe(false);
  });
});

describe('dispose (unmount or account change)', () => {
  it('removes the watcher and ignores every late result', async () => {
    const pub = deferred<'ok'>();
    const h = sharingHarness({ api: { start: async () => 's', publish: () => pub.promise, stop: async () => 'stopped', stopAll: async () => 1 } });
    h.controller.setActive(true);
    await h.controller.start();
    h.reading();
    const count = h.states.length;
    h.controller.dispose();
    pub.resolve('ok');
    await flush();
    expect(h.hasWatcher()).toBe(false);
    expect(h.states.length).toBe(count);
  });

  it('account change also stops the server share', async () => {
    const h = sharingHarness();
    h.controller.setActive(true);
    await h.controller.start();
    h.controller.dispose({ stopServerShare: true });
    await flush();
    expect(h.calls).toContain('stop:share-1');
  });
});

// ---------------------------------------------------------------------------

const read = (over: Partial<PinsRead> = {}): PinsRead => ({
  serverNow: '2026-10-15T10:00:00.000Z',
  leaseExpiresAt: '2026-10-15T10:01:00.000Z',
  myShare: 'none',
  counterpart: { role: 'worker', latitude: 14.6, longitude: 121.03, accuracyM: 10, receivedAt: '2026-10-15T10:00:00.000Z' },
  ...over,
});

function readerHarness(results: (PinsRead | 'denied' | 'error' | ReturnType<typeof deferred<PinsRead | 'denied' | 'error'>>)[]) {
  let now = 0;
  const seen: unknown[] = [];
  let invalidate: (() => void) | null = null;
  let timer: (() => void) | null = null;
  const deps: PinsReaderDeps = {
    bookingId: 'booking-1',
    read: () => {
      const next = results.shift();
      if (!next) return Promise.resolve('error');
      return typeof next === 'object' && 'promise' in next ? next.promise : Promise.resolve(next);
    },
    subscribe: (cb) => { invalidate = cb; return () => { invalidate = null; }; },
    setInterval: (cb) => { timer = cb; return 1; },
    clearInterval: () => { timer = null; },
    now: () => now,
    onChange: (v) => seen.push(v),
  };
  const reader = createPinsReader(deps);
  return {
    reader, seen,
    last: () => seen[seen.length - 1] as { status: string; counterpart: unknown },
    advance: (ms: number) => { now += ms; },
    fireTimer: () => timer?.(),
    fireInvalidate: () => invalidate?.(),
    hasTimer: () => timer !== null,
  };
}

describe('pins reader: bounded authorization recheck', () => {
  it('even an older request denial clears a newer successful read in the same activation', async () => {
    const denied = deferred<PinsRead | 'denied' | 'error'>();
    const h = readerHarness([denied, read()]);
    h.reader.setActive(true, null); h.fireInvalidate(); await flush();
    expect(h.last().status).toBe('ready');
    denied.resolve('denied'); await flush();
    expect(h.last()).toMatchObject({ status: 'denied', counterpart: null });
  });
  it('denial invalidates newer outstanding reads and stays latched until reactivation', async () => {
    const denied = deferred<PinsRead | 'denied' | 'error'>();
    const delayed = deferred<PinsRead | 'denied' | 'error'>();
    const h = readerHarness([denied, delayed, read()]);
    h.reader.setActive(true, null); h.fireInvalidate();
    denied.resolve('denied'); await flush();
    delayed.resolve(read()); await flush();
    await h.reader.refresh();
    expect(h.last()).toMatchObject({ status: 'denied', counterpart: null });
    h.reader.setActive(false, null); h.reader.setActive(true, null); await flush();
    expect(h.last().status).toBe('ready');
  });
  it('a slow response does not extend the server authorization lease', async () => {
    const pending = deferred<PinsRead | 'denied' | 'error'>();
    const h = readerHarness([pending]);
    h.reader.setActive(true, null);
    h.advance(61_000);
    pending.resolve(read());
    await flush();
    h.reader.tick();
    expect(h.last().counterpart).toBeNull();
  });
  it('background clears pins and invalidates an outstanding read', async () => {
    const pending = deferred<PinsRead | 'denied' | 'error'>();
    const h = readerHarness([read(), pending]);
    h.reader.setActive(true, null);
    await flush();
    h.fireInvalidate();
    h.reader.setActive(false, null);
    expect(h.last().counterpart).toBeNull();
    pending.resolve(read());
    await flush();
    expect(h.last().counterpart).toBeNull();
  });
  it('reads on activation and renews every 30 s only while active', async () => {
    const h = readerHarness([read(), read()]);
    h.reader.setActive(true, null);
    await flush();
    expect(h.last().status).toBe('ready');
    expect(h.hasTimer()).toBe(true);
    h.reader.setActive(false, null);
    expect(h.hasTimer()).toBe(false);
  });

  it('clears protected coordinates when the lease expires without renewal', async () => {
    const h = readerHarness([read()]);
    h.reader.setActive(true, null);
    await flush();
    h.advance(60_001);
    h.reader.tick();
    expect(h.last().counterpart).toBeNull();
  });

  it('clears coordinates and stops renewing on denial', async () => {
    const h = readerHarness([read(), 'denied']);
    h.reader.setActive(true, null);
    await flush();
    h.fireInvalidate();
    await flush();
    expect(h.last()).toMatchObject({ status: 'denied', counterpart: null });
    expect(h.hasTimer()).toBe(false);
  });

  it('an older read finishing after a newer denial cannot restore coordinates', async () => {
    const slow = deferred<PinsRead | 'denied' | 'error'>();
    const h = readerHarness([slow, 'denied']);
    h.reader.setActive(true, null);
    h.fireInvalidate();
    await flush();
    slow.resolve(read());
    await flush();
    expect(h.last()).toMatchObject({ status: 'denied', counterpart: null });
  });

  it('results after dispose are ignored', async () => {
    const slow = deferred<PinsRead | 'denied' | 'error'>();
    const h = readerHarness([slow]);
    h.reader.setActive(true, null);
    const count = h.seen.length;
    h.reader.dispose();
    slow.resolve(read());
    await flush();
    expect(h.seen.length).toBe(count + 1); // the dispose clear only
    expect(h.last().counterpart).toBeNull();
  });
});

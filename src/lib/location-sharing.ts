/**
 * RF-L sharing and reading lifecycles, free of React so every late result
 * can be tested. The hooks are thin adapters.
 *
 * Sharing controller
 * - Starts only from an explicit start() (the Share button on the open map).
 * - Collects only while setActive(true): the full map is open and focused and
 *   the app is in the foreground. Inactive removes the watcher immediately.
 * - Resume reuses the held share id and NEVER calls start again.
 * - stop()/stopAll()/dispose() bump a generation; any permission, start,
 *   watcher or publish result from an older generation is discarded, and a
 *   share created by a late start is stopped server-side.
 * - A watch that cannot start (e.g. Android's Location Accuracy prompt was
 *   refused) ends the session and stops its share; only another Share retries.
 *
 * Pins reader
 * - Reads on activation, on invalidation and every 30 s while active.
 * - Applies only results newer than the last applied one.
 * - Clears the counterpart's coordinates on denial or lease expiry (tick()).
 */

import {
  LEASE_RENEW_MS,
  isApproximate,
  leaseValid,
  shouldPublish,
  type MyShare,
  type Pin,
  type PinsRead,
  type PublishResult,
} from './location-pins';
import { createLocationStopQueue, type LocationStopQueue } from './location-stop-queue';

export type SharingStatus =
  | 'off' | 'requesting' | 'sharing' | 'paused' | 'moved' | 'expired' | 'ended'
  | 'denied_request' | 'denied_settings' | 'services_off' | 'error';
export type SharingState = { status: SharingStatus; approximate: boolean; position?: Reading | null; shareId?: string | null; cleanupPending?: boolean; cleanupCanRetry?: boolean; cleanupExpired?: boolean; cleanupBlocksStart?: boolean };
type Reading = { latitude: number; longitude: number; accuracy: number; timestampMs: number };

export type SharingDeps = {
  bookingId: string;
  accountId?: string;
  stopQueue?: LocationStopQueue;
  /** Explicit request: may prompt. */
  permission: () => Promise<'granted' | 'request' | 'settings'>;
  servicesEnabled: () => Promise<boolean>;
  watch: (onReading: (r: Reading) => void) => Promise<{ remove: () => void }>;
  api: {
    start: (bookingId: string) => Promise<string>;
    publish: (a: { bookingId: string; shareId: string; seq: number; latitude: number; longitude: number; accuracyM: number; capturedAtMs: number }) => Promise<PublishResult>;
    stop: (bookingId: string, shareId: string) => Promise<string>;
    stopAll: (bookingId: string) => Promise<number>;
  };
  now: () => number;
  onChange: (state: SharingState) => void;
};

export function createSharingController(deps: SharingDeps) {
  let gen = 0;
  let disposed = false;
  let active = false;
  let shareId: string | null = null;
  let seq = 0;
  let watcher: { remove: () => void } | null = null;
  let watching = false;
  let watchGeneration = 0;
  let lastSent: { latitude: number; longitude: number; sentAtMs: number } | null = null;
  let state: SharingState = { status: 'off', approximate: false };
  const accountId = deps.accountId ?? 'controller';
  const stops = deps.stopQueue ?? createLocationStopQueue(deps.now);
  if (!deps.stopQueue) stops.setContext({ accountId, isCurrent: () => true, send: async entry => {
    if (entry.shareId === null) return Number.isFinite(await deps.api.stopAll(entry.bookingId));
    const result = await deps.api.stop(entry.bookingId, entry.shareId);
    return result === 'stopped' || result === 'not_current';
  } });

  const set = (status: SharingStatus, approximate = state.approximate) => {
    if (disposed) return;
    state = { ...state, status, approximate, shareId };
    deps.onChange(state);
  };
  const syncStops = () => {
    const pending = stops.getSnapshot().filter(entry => entry.accountId === accountId && entry.bookingId === deps.bookingId);
    state = { ...state, cleanupPending: pending.length > 0, cleanupCanRetry: stops.canRetry(accountId, deps.bookingId),
      cleanupExpired: pending.some(entry => entry.status === 'expired-unconfirmed'), cleanupBlocksStart: stops.blocksStart(accountId, deps.bookingId) };
    set(state.status);
  };
  const unsubscribeStops = stops.subscribe(syncStops);
  syncStops();
  const removeWatcher = () => {
    watchGeneration++;
    state = { ...state, position: null };
    watching = false;
    const w = watcher;
    watcher = null;
    w?.remove();
  };
  const endSession = (status: SharingStatus) => {
    gen++;
    shareId = null;
    removeWatcher();
    set(status, false);
  };

  async function beginWatch(myGen: number) {
    if (watching || !shareId || !active) return;
    watching = true;
    const watchGen = ++watchGeneration;
    let failure: unknown = null;
    const w = await deps.watch((r) => {
      if (watchGen === watchGeneration && active) void onReading(r, myGen);
    }).catch((error: unknown) => { failure = error; return null; });
    if (!w) {
      // The watch could not start, e.g. Android's Location Accuracy prompt was refused.
      // End the session rather than retrying on resume, which would re-open the prompt.
      if (myGen !== gen || disposed) return;
      const id = shareId;
      endSession(isSettingsUnsatisfied(failure) ? 'services_off' : 'error');
      if (id) stops.enqueue(accountId, deps.bookingId, id);
      return;
    }
    if (watchGen !== watchGeneration) { w.remove(); return; }
    if (myGen !== gen || disposed || !active || !shareId) {
      w.remove();
      if (myGen === gen) watching = false;
      return;
    }
    watcher = w;
    set('sharing');
  }

  async function onReading(r: Reading, myGen: number) {
    if (!watching || myGen !== gen || !shareId) return;
    const now = deps.now();
    if (!shouldPublish(lastSent, { latitude: r.latitude, longitude: r.longitude, capturedAtMs: r.timestampMs }, now)) return;
    state = { ...state, position: r };
    const id = shareId;
    seq += 1;
    lastSent = { latitude: r.latitude, longitude: r.longitude, sentAtMs: now };
    let result: PublishResult;
    try {
      result = await deps.api.publish({ bookingId: deps.bookingId, shareId: id, seq, latitude: r.latitude,
        longitude: r.longitude, accuracyM: r.accuracy, capturedAtMs: r.timestampMs });
    } catch (e) {
      if (myGen !== gen) return;
      if ((e as { code?: string }).code === '42501' || (e as { kind?: string }).kind === 'denied') endSession('ended');
      return; // network: keep sharing; the next reading retries
    }
    if (myGen !== gen || shareId !== id) return;
    if (result === 'ok') set(active ? 'sharing' : 'paused', isApproximate(r.accuracy));
    else if (result === 'not_current') endSession('moved');
    else if (result === 'expired') endSession('expired');
  }

  return {
    get state() { return state; },
    get currentShareId() { return shareId; },

    async start() {
      if (disposed || shareId || stops.blocksStart(accountId, deps.bookingId)) return;
      const myGen = ++gen;
      set('requesting');
      const permission = await deps.permission().catch(() => 'request' as const);
      if (myGen !== gen || disposed) return;
      if (permission !== 'granted') { set(permission === 'settings' ? 'denied_settings' : 'denied_request'); return; }
      const services = await deps.servicesEnabled().catch(() => false);
      if (myGen !== gen || disposed) return;
      if (!services) { set('services_off'); return; }
      let id: string;
      try {
        id = await deps.api.start(deps.bookingId);
      } catch (e) {
        if (myGen === gen) set((e as { kind?: string }).kind === 'denied' ? 'ended' : 'error');
        return;
      }
      if (myGen !== gen || disposed) {
        // Stopped (or unmounted) while start was in flight: never leave it on.
        stops.enqueue(accountId, deps.bookingId, id);
        return;
      }
      shareId = id;
      seq = 0;
      lastSent = null;
      if (active) await beginWatch(myGen);
      else set('paused');
    },

    stop() {
      const id = shareId;
      endSession('off');
      if (id) stops.enqueue(accountId, deps.bookingId, id);
    },

    stopAll() {
      endSession('off');
      stops.enqueue(accountId, deps.bookingId, null);
    },

    retryStop() { stops.retry(accountId, deps.bookingId); },

    setActive(next: boolean) {
      if (disposed || next === active) return;
      active = next;
      if (!active) {
        if (watching || watcher) {
          removeWatcher();
          if (shareId) set('paused');
        }
        return;
      }
      if (shareId) void beginWatch(gen);
    },

    dispose(options: { stopServerShare?: boolean } = {}) {
      const id = shareId;
      gen++;
      shareId = null;
      removeWatcher();
      disposed = true;
      unsubscribeStops();
      if (options.stopServerShare && id) stops.enqueue(accountId, deps.bookingId, id);
    },
  };
}

export type SharingController = ReturnType<typeof createSharingController>;

/** expo-location's refusal when Android's location settings (e.g. Location Accuracy) were not turned on. */
export function isSettingsUnsatisfied(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (typeof code === 'string' && code.includes('SETTINGS_UNSATISFIED')) ||
    (typeof message === 'string' && message.includes('unsatisfied device settings'));
}

// ---------------------------------------------------------------------------

export type PinsView = {
  status: 'idle' | 'loading' | 'ready' | 'denied' | 'error';
  counterpart: Pin | null;
  myShare: MyShare;
  serverNow: string | null;
  readAtMs: number;
  leaseExpiresAt: string | null;
};

export type PinsReaderDeps = {
  bookingId: string;
  read: (bookingId: string, shareId: string | null) => Promise<PinsRead | 'denied' | 'error'>;
  subscribe: (onInvalidate: () => void) => () => void;
  setInterval: (cb: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  now: () => number;
  onChange: (view: PinsView) => void;
};

const EMPTY: PinsView = { status: 'idle', counterpart: null, myShare: 'none', serverNow: null, readAtMs: 0, leaseExpiresAt: null };

export function createPinsReader(deps: PinsReaderDeps) {
  let view: PinsView = EMPTY;
  let requested = 0;
  let epoch = 0;
  let applied = 0;
  let disposed = false;
  let active = false;
  let shareId: string | null = null;
  let timer: unknown = null;
  let unsubscribe: (() => void) | null = null;

  const set = (next: PinsView) => {
    view = next;
    deps.onChange(view);
  };
  const stopRenewal = () => {
    if (timer !== null) deps.clearInterval(timer);
    timer = null;
    unsubscribe?.();
    unsubscribe = null;
  };

  async function refresh() {
    if (disposed || !active || view.status === 'denied') return;
    const mine = ++requested;
    const currentEpoch = epoch;
    const requestAt = deps.now();
    if (view.status === 'idle') set({ ...view, status: 'loading' });
    const result = await deps.read(deps.bookingId, shareId).catch(() => 'error' as const);
    if (disposed || !active || currentEpoch !== epoch) return;
    if (result === 'denied') {
      epoch++;
      applied = ++requested;
      stopRenewal();
      set({ ...EMPTY, status: 'denied' });
      return;
    }
    if (mine <= applied) return;
    applied = mine;
    if (result === 'error') {
      // Keep only what the current lease still covers; tick() expires it.
      set({ ...view, status: 'error' });
      return;
    }
    set({ status: 'ready', counterpart: leaseValid(result.leaseExpiresAt, result.serverNow, requestAt, deps.now()) ? result.counterpart : null, myShare: result.myShare,
      serverNow: result.serverNow, readAtMs: requestAt, leaseExpiresAt: result.leaseExpiresAt });
  }

  return {
    get view() { return view; },
    refresh,

    setActive(next: boolean, currentShareId: string | null) {
      shareId = currentShareId;
      if (disposed) return;
      if (next === active) return;
      active = next;
      if (!active) { epoch++; applied = ++requested; stopRenewal(); set({ ...EMPTY }); return; }
      if (view.status === 'denied') set(EMPTY);
      unsubscribe = deps.subscribe(() => void refresh());
      timer = deps.setInterval(() => void refresh(), LEASE_RENEW_MS);
      void refresh();
    },

    setShareId(next: string | null) { shareId = next; },

    /** Called every second by the screen. Drops coordinates the lease no longer covers. */
    tick() {
      if (disposed || view.counterpart === null) return;
      if (!view.leaseExpiresAt || !view.serverNow ||
          !leaseValid(view.leaseExpiresAt, view.serverNow, view.readAtMs, deps.now())) {
        set({ ...view, counterpart: null });
      }
    },

    dispose() {
      disposed = true;
      stopRenewal();
      view = { ...EMPTY };
      deps.onChange(view);
    },
  };
}

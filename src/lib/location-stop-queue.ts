/** Process-memory cleanup only: no coordinates, tokens, storage, or location watcher. */
export type PendingLocationStop = Readonly<{
  accountId: string; bookingId: string; shareId: string | null;
  attempts: number; retryAt: number; deadline: number;
  status: 'unconfirmed' | 'retrying' | 'expired-unconfirmed';
}>;
type Context = { accountId: string; isCurrent: () => boolean; send: (stop: PendingLocationStop) => Promise<boolean> };
const MAX_ATTEMPTS = 4;
const RETRY_DELAYS = [1000, 5000, 15000];
const WINDOW_MS = 10 * 60 * 1000;
const key = (s: Pick<PendingLocationStop, 'accountId' | 'bookingId' | 'shareId'>) => JSON.stringify([s.accountId, s.bookingId, s.shareId]);

export function createLocationStopQueue(now: () => number = Date.now) {
  let entries: readonly PendingLocationStop[] = [];
  let context: Context | null = null;
  const listeners = new Set<() => void>();
  const running = new Map<string, Promise<void>>();
  const emit = () => { for (const listener of listeners) listener(); };
  const replace = (id: string, next: PendingLocationStop | null) => {
    entries = entries.flatMap(entry => key(entry) === id ? next ? [next] : [] : [entry]); emit();
  };
  async function tick() {
    for (const entry of entries) {
      const id = key(entry);
      if (entry.deadline <= now() && entry.status !== 'expired-unconfirmed' && !running.has(id)) {
        replace(id, { ...entry, status: 'expired-unconfirmed' });
      }
    }
    const owner = context;
    if (!owner || !owner.isCurrent()) { await Promise.all(running.values()); return; }
    const work: Promise<void>[] = [];
    for (const entry of entries) {
      const id = key(entry);
      if (running.has(id)) { work.push(running.get(id)!); continue; }
      if (entry.accountId !== owner.accountId || entry.deadline <= now() || entry.attempts >= MAX_ATTEMPTS || entry.retryAt > now()) continue;
      if (!owner.isCurrent()) break;
      const pending: PendingLocationStop = { ...entry, attempts: entry.attempts + 1, status: 'retrying' };
      replace(id, pending);
      const task = Promise.resolve().then(() => {
        // A sign-out/account switch can happen between enqueue and actual dispatch.
        if (context !== owner || !owner.isCurrent()) return null;
        return owner.send(pending);
      }).catch(() => false).then(confirmed => {
        replace(id, confirmed === null ? entry : confirmed ? null : { ...pending, status: now() >= pending.deadline ? 'expired-unconfirmed' : 'unconfirmed',
          retryAt: now() + (RETRY_DELAYS[pending.attempts - 1] ?? WINDOW_MS) });
      }).finally(() => { running.delete(id); emit(); });
      running.set(id, task); work.push(task);
    }
    await Promise.all(work);
  }
  return {
    getSnapshot: () => entries,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setContext(next: Context | null) { context = next; },
    enqueue(accountId: string, bookingId: string, shareId: string | null) {
      const entry: PendingLocationStop = { accountId, bookingId, shareId, attempts: 0, retryAt: now(), deadline: now() + WINDOW_MS, status: 'unconfirmed' };
      const existing = entries.find(candidate => key(candidate) === key(entry));
      if (existing && (existing.deadline > now() || running.has(key(existing)))) return;
      if (existing) entries = entries.filter(candidate => candidate !== existing);
      entries = [...entries, entry]; emit(); void tick();
    },
    tick,
    retry(accountId: string, bookingId?: string) {
      entries = entries.map(entry => entry.accountId === accountId && (!bookingId || entry.bookingId === bookingId) ? { ...entry, retryAt: now() } : entry);
      emit(); void tick();
    },
    canRetry(accountId: string, bookingId?: string) {
      return entries.some(entry => entry.accountId === accountId && (!bookingId || entry.bookingId === bookingId) &&
        entry.attempts < MAX_ATTEMPTS && entry.deadline > now() && entry.status !== 'retrying');
    },
    blocksStart(accountId: string, bookingId: string) {
      return entries.some(entry => entry.accountId === accountId && entry.bookingId === bookingId &&
        (entry.shareId === null || entry.deadline > now() || running.has(key(entry))));
    },
  };
}
export type LocationStopQueue = ReturnType<typeof createLocationStopQueue>;
export const locationStopQueue = createLocationStopQueue();

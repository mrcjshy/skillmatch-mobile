/**
 * PERF-03 (owner 2026-11-08, "pero mawawala yung often loadings?"): the last Booking details this account saw,
 * kept in memory only, so reopening a booking shows it at once while the fresh read runs.
 *
 * Callers store a snapshot with the protected fields already removed (R6-8D: contact, exact address, map
 * location and Job photos). A snapshot is never authority: Booking Details still re-reads on every open, and a
 * confirmed Booking keeps its protected projection hidden until that fresh read answers.
 */

/** How many bookings are kept; the least recently used goes first. */
export const BOOKING_SNAPSHOT_LIMIT = 24;

const snapshots = new Map<string, unknown>();

function keyFor(accountId: string, role: string, bookingId: string): string {
  return `${accountId}\u0000${role}\u0000${bookingId}`;
}

export function rememberBookingSnapshot<T>(accountId: string, role: string, bookingId: string, snapshot: T): void {
  const key = keyFor(accountId, role, bookingId);
  snapshots.delete(key);
  snapshots.set(key, snapshot);
  while (snapshots.size > BOOKING_SNAPSHOT_LIMIT) {
    const oldest = snapshots.keys().next().value;
    if (oldest === undefined) break;
    snapshots.delete(oldest);
  }
}

export function recallBookingSnapshot<T>(accountId: string | null, role: string, bookingId: string | null): T | null {
  if (!accountId || !bookingId) return null;
  const key = keyFor(accountId, role, bookingId);
  if (!snapshots.has(key)) return null;
  const snapshot = snapshots.get(key) as T;
  // Recently used again: move it to the newest end.
  snapshots.delete(key);
  snapshots.set(key, snapshot);
  return snapshot;
}

/** Forget one account's snapshots, or every snapshot when no account is named. */
export function forgetBookingSnapshots(accountId?: string): void {
  if (accountId === undefined) { snapshots.clear(); return; }
  const prefix = `${accountId}\u0000`;
  for (const key of [...snapshots.keys()]) if (key.startsWith(prefix)) snapshots.delete(key);
}

import { beforeEach, expect, it } from 'vitest';

import { BOOKING_SNAPSHOT_LIMIT, forgetBookingSnapshots, recallBookingSnapshot, rememberBookingSnapshot } from './booking-detail-snapshots';

// PERF-03 (owner 2026-11-08, "pero mawawala yung often loadings?"): reopening a booking shows what this account
// last saw at once, while the fresh read runs. The snapshot lives in memory only.
beforeEach(() => forgetBookingSnapshots());

it('recalls the last snapshot for the same account, role and booking only', () => {
  rememberBookingSnapshot('acct-a', 'client', 'b-1', { title: 'Pet Care' });
  expect(recallBookingSnapshot('acct-a', 'client', 'b-1')).toEqual({ title: 'Pet Care' });
  // Another account, another role, another booking: nothing.
  expect(recallBookingSnapshot('acct-b', 'client', 'b-1')).toBeNull();
  expect(recallBookingSnapshot('acct-a', 'worker', 'b-1')).toBeNull();
  expect(recallBookingSnapshot('acct-a', 'client', 'b-2')).toBeNull();
  expect(recallBookingSnapshot(null, 'client', 'b-1')).toBeNull();
  expect(recallBookingSnapshot('acct-a', 'client', null)).toBeNull();
});

it('a newer snapshot replaces the older one', () => {
  rememberBookingSnapshot('acct-a', 'client', 'b-1', { status: 'confirmed' });
  rememberBookingSnapshot('acct-a', 'client', 'b-1', { status: 'completed' });
  expect(recallBookingSnapshot('acct-a', 'client', 'b-1')).toEqual({ status: 'completed' });
});

it('keeps a bounded number of bookings, dropping the least recently used', () => {
  for (let i = 0; i < BOOKING_SNAPSHOT_LIMIT; i++) rememberBookingSnapshot('acct-a', 'client', `b-${i}`, i);
  // Touching b-0 makes it recent again, so b-1 is the one to go.
  expect(recallBookingSnapshot('acct-a', 'client', 'b-0')).toBe(0);
  rememberBookingSnapshot('acct-a', 'client', 'b-new', 'new');
  expect(recallBookingSnapshot('acct-a', 'client', 'b-0')).toBe(0);
  expect(recallBookingSnapshot('acct-a', 'client', 'b-1')).toBeNull();
  expect(recallBookingSnapshot('acct-a', 'client', 'b-new')).toBe('new');
});

it('forgets one account or everything', () => {
  rememberBookingSnapshot('acct-a', 'client', 'b-1', 1);
  rememberBookingSnapshot('acct-b', 'worker', 'b-2', 2);
  forgetBookingSnapshots('acct-a');
  expect(recallBookingSnapshot('acct-a', 'client', 'b-1')).toBeNull();
  expect(recallBookingSnapshot('acct-b', 'worker', 'b-2')).toBe(2);
  forgetBookingSnapshots();
  expect(recallBookingSnapshot('acct-b', 'worker', 'b-2')).toBeNull();
});

import { describe, expect, it, vi } from 'vitest';

import {
  LIVE_MS,
  VISIBLE_MS,
  classifyPinsError,
  distanceM,
  isApproximate,
  leaseValid,
  mergeOverlap,
  parsePinsRead,
  pinFreshness,
  shouldPublish,
} from './location-pins';

vi.mock('./supabase', () => ({ supabase: { rpc: () => { throw new Error('Unrequested RPC'); } } }));

const SERVER_NOW = '2026-10-15T10:00:00.000Z';
const at = (iso: string) => Date.parse(iso);

describe('pin freshness uses server time, never the phone clock', () => {
  const readAt = 1_000_000; // local monotonic-ish ms when the read returned
  const received = (secondsBeforeServerNow: number) =>
    new Date(at(SERVER_NOW) - secondsBeforeServerNow * 1000).toISOString();

  it('is live up to 45 s, stale until 10 min, then expired', () => {
    expect(pinFreshness(received(44), SERVER_NOW, readAt, readAt)).toBe('live');
    expect(pinFreshness(received(46), SERVER_NOW, readAt, readAt)).toBe('stale');
    expect(pinFreshness(received(599), SERVER_NOW, readAt, readAt)).toBe('stale');
    expect(pinFreshness(received(601), SERVER_NOW, readAt, readAt)).toBe('expired');
  });

  it('ages a pin by local elapsed time since the read', () => {
    expect(pinFreshness(received(30), SERVER_NOW, readAt, readAt + 16_000)).toBe('stale');
  });

  it('is unaffected by a phone clock five minutes wrong', () => {
    // Only the difference between two local readings matters; the absolute
    // local clock never enters the comparison.
    const skewedReadAt = readAt + 5 * 60_000;
    expect(pinFreshness(received(10), SERVER_NOW, skewedReadAt, skewedReadAt)).toBe('live');
  });

  it('treats an unparseable timestamp as expired, never live', () => {
    expect(pinFreshness('garbage', SERVER_NOW, readAt, readAt)).toBe('expired');
    expect(LIVE_MS).toBe(45_000);
    expect(VISIBLE_MS).toBe(600_000);
  });
});

describe('read lease', () => {
  const lease = new Date(at(SERVER_NOW) + 60_000).toISOString();
  it('is valid until 60 s after the read, measured locally', () => {
    expect(leaseValid(lease, SERVER_NOW, 0, 59_999)).toBe(true);
    expect(leaseValid(lease, SERVER_NOW, 0, 60_000)).toBe(false);
  });
  it('fails closed on malformed values', () => {
    expect(leaseValid('nope', SERVER_NOW, 0, 0)).toBe(false);
  });
});

describe('publish thresholds', () => {
  const base = { latitude: 14.5995, longitude: 121.0365 };
  it('publishes the first fresh reading', () => {
    expect(shouldPublish(null, { ...base, capturedAtMs: 1000 }, 1000)).toBe(true);
  });
  it('waits for 15 m of movement or a 30 s heartbeat', () => {
    const last = { ...base, sentAtMs: 0 };
    expect(shouldPublish(last, { latitude: 14.59955, longitude: 121.0365, capturedAtMs: 10_000 }, 10_000)).toBe(false);
    expect(shouldPublish(last, { latitude: 14.6, longitude: 121.0365, capturedAtMs: 10_000 }, 10_000)).toBe(true);
    expect(shouldPublish(last, { ...base, capturedAtMs: 30_000 }, 30_000)).toBe(true);
  });
  it('discards readings older than 30 s', () => {
    expect(shouldPublish(null, { ...base, capturedAtMs: 0 }, 30_001)).toBe(false);
  });
  it('measures distance in metres', () => {
    expect(Math.round(distanceM(base, { latitude: 14.6005, longitude: 121.0365 }))).toBe(111);
  });
});

describe('approximate positions', () => {
  it('labels accuracy above 100 m approximate', () => {
    expect(isApproximate(100)).toBe(false);
    expect(isApproximate(101)).toBe(true);
  });
});

describe('overlap keeps every participant selectable', () => {
  it('merges markers closer than 48 px and keeps both labels', () => {
    const groups = mergeOverlap([
      { id: 'you', x: 100, y: 100 },
      { id: 'client', x: 120, y: 110 },
      { id: 'job', x: 300, y: 300 },
    ], 48);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.ids.includes('you'))?.ids.sort()).toEqual(['client', 'you']);
  });
});

describe('read parsing', () => {
  const valid = {
    server_now: SERVER_NOW,
    lease_expires_at: '2026-10-15T10:01:00.000Z',
    my_share: 'yours_active',
    counterpart: { role: 'worker', latitude: 14.6, longitude: 121.03, accuracy_m: 12, received_at: SERVER_NOW },
  };
  it('accepts the server shape', () => {
    expect(parsePinsRead(valid)?.counterpart?.role).toBe('worker');
  });
  it('rejects invalid coordinates and unknown roles', () => {
    expect(parsePinsRead({ ...valid, counterpart: { ...valid.counterpart, latitude: 91 } })).toBeNull();
    expect(parsePinsRead({ ...valid, counterpart: { ...valid.counterpart, role: 'admin' } })).toBeNull();
    expect(parsePinsRead({ ...valid, my_share: 'share-id-leak' })).toBeNull();
  });
  it('accepts no counterpart', () => {
    expect(parsePinsRead({ ...valid, counterpart: null })?.counterpart).toBeNull();
  });
});

describe('error mapping', () => {
  it('maps 42501 to denied and 22023 to invalid', () => {
    expect(classifyPinsError({ code: '42501' })).toBe('denied');
    expect(classifyPinsError({ code: '22023' })).toBe('invalid');
    expect(classifyPinsError({ code: 'PGRST301' })).toBe('network');
    expect(classifyPinsError(null)).toBe('network');
  });
});

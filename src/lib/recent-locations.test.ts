import { describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadRecentLocations, saveRecentLocation, clearRecentLocations, mergeRecentLocation, type RecentLocation } from './recent-locations';
import { SANTA_ANA_PATEROS_INTERIOR_TEST_PIN as pin } from './santa-ana-service-area';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn().mockResolvedValue(undefined), removeItem: vi.fn().mockResolvedValue(undefined) } }));
const userId = '11111111-1111-4111-8111-111111111111';
const scope = { userId, isCurrent: () => true };
const TTL = 30 * 24 * 60 * 60 * 1000;

it('deletes only the exact legacy key when first used', async () => {
  await loadRecentLocations(scope);
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('skillmatch:recent-job-locations:v1');
  expect(AsyncStorage.getItem).not.toHaveBeenCalledWith('skillmatch:recent-job-locations:v1');
});

it('suppresses an obsolete lifetime before any scoped I/O and after a delayed read', async () => {
  const stale = { userId, isCurrent: () => false };
  expect(await loadRecentLocations(stale)).toEqual([]);
  await saveRecentLocation(stale, { pin, address: 'Do not store' });
  await clearRecentLocations(stale);
  expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  let current = true;
  let finish!: (value: string | null) => void;
  vi.mocked(AsyncStorage.getItem).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = loadRecentLocations({ userId, isCurrent: () => current });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  current = false;
  finish(JSON.stringify([{ pin, address: 'Old lifetime', timestamp: Date.now() }]));
  expect(await pending).toEqual([]);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

it('prunes expired, future, blank, invalid and outside rows, ordering valid confirmed pairs newest first', async () => {
  const now = Date.now();
  const row = { pin, address: 'Confirmed area', timestamp: now - 1000 };
  vi.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify([
    { ...row, timestamp: now - TTL }, { ...row, timestamp: now + 10000 },
    { ...row, address: ' ' }, { ...row, pin: { latitude: 91, longitude: 121 } },
    { ...row, pin: { latitude: 14.55801, longitude: 121.06942 } },
    row, { ...row, pin: { ...pin, longitude: pin.longitude + 0.0003 }, address: 'Newer', timestamp: now - 500 },
  ]));
  const rows = await loadRecentLocations(scope);
  expect(rows.map(item => item.address)).toEqual(['Newer', 'Confirmed area']);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(`skillmatch:recent-job-locations:v2:${userId}`, JSON.stringify(rows));
});

it('reads only the authenticated scoped namespace and never imports the legacy cache', async () => {
  vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  await loadRecentLocations(scope);
  expect(AsyncStorage.getItem).toHaveBeenCalledWith(`skillmatch:recent-job-locations:v2:${userId}`);
  expect(AsyncStorage.getItem).not.toHaveBeenCalledWith('skillmatch:recent-job-locations:v1');
});

const place = (index: number): RecentLocation => ({
  pin: { latitude: 14.54 + index / 1000, longitude: 121.07 + index / 1000 },
  address: `Place ${index}`,
  timestamp: index,
});

it('serializes same-owner saves and a following Clear so no earlier save resurrects history', async () => {
  const disk = new Map<string, string>();
  vi.mocked(AsyncStorage.getItem).mockImplementation(async key => disk.get(key) ?? null);
  vi.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { disk.set(key, value); });
  vi.mocked(AsyncStorage.removeItem).mockImplementation(async key => { disk.delete(key); });
  await Promise.all([
    saveRecentLocation(scope, { pin, address: 'First' }),
    saveRecentLocation(scope, { pin: { ...pin, longitude: pin.longitude + 0.0003 }, address: 'Second' }),
  ]);
  expect((await loadRecentLocations(scope)).map(item => item.address)).toEqual(['Second', 'First']);
  const queuedSave = saveRecentLocation(scope, { pin, address: 'Queued' });
  const queuedClear = clearRecentLocations(scope);
  await Promise.all([queuedSave, queuedClear]);
  expect(disk.has(`skillmatch:recent-job-locations:v2:${userId}`)).toBe(false);
});

describe('recent confirmed locations', () => {
  it('does not persist a future confirmation timestamp if the device clock moves backward during I/O', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(2_000_000_000_000);
    vi.mocked(AsyncStorage.getItem).mockImplementationOnce(async () => { clock.mockReturnValue(1_999_999_999_000); return null; });
    try {
      expect(await saveRecentLocation(scope, { pin, address: 'Confirmed' })).toEqual([]);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
  it('retains separate account records for later login and Clear affects only its current owner', async () => {
    const disk = new Map<string, string>();
    vi.mocked(AsyncStorage.getItem).mockImplementation(async key => disk.get(key) ?? null);
    vi.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { disk.set(key, value); });
    vi.mocked(AsyncStorage.removeItem).mockImplementation(async key => { disk.delete(key); });
    let aCurrent = true;
    const a = { userId, isCurrent: () => aCurrent };
    const b = { userId: '22222222-2222-4222-8222-222222222222', isCurrent: () => true };
    await saveRecentLocation(a, { pin, address: 'Account A' });
    aCurrent = false;
    expect(await loadRecentLocations(a)).toEqual([]);
    expect(await loadRecentLocations(b)).toEqual([]);
    await saveRecentLocation(b, { pin, address: 'Account B' });
    await clearRecentLocations(b);
    expect((await loadRecentLocations(scope)).map(item => item.address)).toEqual(['Account A']);
    expect(await loadRecentLocations(b)).toEqual([]);
  });

  it('caps scoped saves at five newest pairs and deduplicates near-identical confirmed pins', async () => {
    const disk = new Map<string, string>();
    vi.mocked(AsyncStorage.getItem).mockImplementation(async key => disk.get(key) ?? null);
    vi.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { disk.set(key, value); });
    for (let index = 0; index < 6; index++) await saveRecentLocation(scope, { pin: { ...pin, longitude: pin.longitude + index * 0.00021 }, address: `Confirmed ${index}` });
    expect((await loadRecentLocations(scope)).map(item => item.address)).toEqual(['Confirmed 5', 'Confirmed 4', 'Confirmed 3', 'Confirmed 2', 'Confirmed 1']);
    await saveRecentLocation(scope, { pin: { ...pin, longitude: pin.longitude + 5 * 0.00021 + 0.00001 }, address: 'Selected Job location — Santa Ana, Pateros' });
    expect((await loadRecentLocations(scope)).map(item => item.address)).toEqual(['Selected Job location — Santa Ana, Pateros', 'Confirmed 4', 'Confirmed 3', 'Confirmed 2', 'Confirmed 1']);
  });

  it('does no I/O for malformed owner IDs or throwing guards and rejects invalid confirmation pairs', async () => {
    await saveRecentLocation({ userId: 'not-an-authenticated-uuid', isCurrent: () => true }, { pin, address: 'Invalid owner' });
    await loadRecentLocations({ userId, isCurrent: () => { throw new Error('Obsolete'); } });
    await saveRecentLocation(scope, { pin, address: '  ' });
    await saveRecentLocation(scope, { pin: { latitude: NaN, longitude: Infinity }, address: 'Invalid' });
    await saveRecentLocation(scope, { pin: { latitude: 14.55801, longitude: 121.06942 }, address: 'Outside' });
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('keeps already-started writes at their captured key and suppresses stale queued operations', async () => {
    let current = true;
    const oldScope = { userId, isCurrent: () => current };
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    let complete!: () => void;
    vi.mocked(AsyncStorage.setItem).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const first = saveRecentLocation(oldScope, { pin, address: 'Started write' });
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
    const next = saveRecentLocation(oldScope, { pin, address: 'Queued stale write' });
    const clear = clearRecentLocations(oldScope);
    current = false;
    oldScope.userId = '22222222-2222-4222-8222-222222222222';
    complete();
    expect(await first).toEqual([]);
    expect(await next).toEqual([]);
    await clear;
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(vi.mocked(AsyncStorage.setItem).mock.calls[0][0]).toBe(`skillmatch:recent-job-locations:v2:${userId}`);
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('treats read/save failures as nonblocking but reports failed Clear to its caller', async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('Disk unavailable'));
    expect(await loadRecentLocations(scope)).toEqual([]);
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Disk unavailable'));
    expect(await saveRecentLocation(scope, { pin, address: 'Confirmed' })).toEqual([]);
    vi.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('Deletion failed'));
    await expect(clearRecentLocations(scope)).rejects.toThrow('Deletion failed');
  });
  it('keeps most recent first, caps five, and deduplicates nearby pins', () => {
    let rows: RecentLocation[] = [];
    for (let index = 0; index < 6; index += 1) rows = mergeRecentLocation(rows, place(index));
    expect(rows.map((row) => row.address)).toEqual(['Place 5', 'Place 4', 'Place 3', 'Place 2', 'Place 1']);
    rows = mergeRecentLocation(rows, { ...place(5), address: 'Updated', timestamp: 10 });
    expect(rows[0].address).toBe('Updated');
    expect(rows).toHaveLength(5);
  });
});

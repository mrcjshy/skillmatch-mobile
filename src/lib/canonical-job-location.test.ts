import { describe, expect, it, vi } from 'vitest';
import { createCanonicalLocationSelection } from './canonical-job-location';
import { resolveCurrentLocationPin } from './job-location';
import { SANTA_ANA_PATEROS_INTERIOR_TEST_PIN as pin } from './santa-ana-service-area';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

describe('Client canonical location confirmation', () => {
  it('confirms the selected coordinate together with its derived address', async () => {
    const geocode = vi.fn().mockResolvedValue([{ formattedAddress: 'Selected street, Santa Ana' }]);
    const selection = createCanonicalLocationSelection();
    selection.select(pin);
    await selection.resolve({ reverseGeocodeAsync: geocode });
    expect(geocode).toHaveBeenCalledWith(pin);
    expect(selection.confirm()).toEqual({ pin, address: 'Selected street, Santa Ana' });
  });
});

it('uses a foreground current-position pin as the geocoder input', async () => {
  const current = await resolveCurrentLocationPin({
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    requestForegroundPermissionsAsync: vi.fn(),
    getCurrentPositionAsync: async () => ({ coords: pin }),
  });
  expect(current.kind).toBe('pin');
  if (current.kind !== 'pin') throw new Error('Expected pin');
  const selection = createCanonicalLocationSelection();
  const geocoder = { reverseGeocodeAsync: vi.fn().mockResolvedValue([{ formattedAddress: 'Current pin street' }]) };
  selection.select(current.pin);
  await selection.resolve(geocoder);
  expect(selection.confirm()).toEqual({ pin, address: 'Current pin street' });
  expect(geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(pin);
});

it('invalidates a previous canonical address immediately on drag/tap and derives the new pin', async () => {
  const selection = createCanonicalLocationSelection();
  selection.select(pin);
  await selection.resolve({ reverseGeocodeAsync: async () => [{ formattedAddress: 'Old street' }] });
  const nextPin = { latitude: 14.54446, longitude: 121.07206 };
  selection.select(nextPin);
  expect(selection.snapshot().address).toBeNull();
  expect(selection.confirm()).toBeNull();
  const geocode = vi.fn().mockResolvedValue([{ formattedAddress: 'New street' }]);
  await selection.resolve({ reverseGeocodeAsync: geocode });
  expect(geocode).toHaveBeenCalledWith(nextPin);
  expect(selection.confirm()).toEqual({ pin: nextPin, address: 'New street' });
});

it('rejects an outside pin without geocoding or confirmation', async () => {
  const selection = createCanonicalLocationSelection();
  const geocode = vi.fn();
  selection.select({ latitude: 14.55801, longitude: 121.06942 });
  await selection.resolve({ reverseGeocodeAsync: geocode });
  expect(selection.snapshot().error).toBe('outside');
  expect(selection.confirm()).toBeNull();
  expect(geocode).not.toHaveBeenCalled();
});

it.each(['reject', 'empty', 'blank'])('confirms the valid pin with display fallback on %s geocoding', async (failure) => {
  const selection = createCanonicalLocationSelection();
  selection.select(pin);
  await selection.resolve({ reverseGeocodeAsync: async () => {
    if (failure === 'reject') throw new Error('offline');
    if (failure === 'blank') return [{ formattedAddress: '  ', street: '', city: null }];
    return [];
  } });
  expect(selection.snapshot()).toMatchObject({ pin, status: 'ready', error: 'geocode' });
  expect(selection.confirm()).toEqual({ pin, address: 'Selected Job location — Santa Ana, Pateros' });
  await selection.resolve({ reverseGeocodeAsync: async () => [{ formattedAddress: 'Retry street' }] });
  expect(selection.confirm()).toEqual({ pin, address: 'Retry street' });
});

it('discards an old geocoder response after pin replacement or unmount', async () => {
  const selection = createCanonicalLocationSelection();
  let reply!: (rows: { formattedAddress: string }[]) => void;
  selection.select(pin);
  const request = selection.resolve({ reverseGeocodeAsync: () => new Promise((resolve) => { reply = resolve; }) });
  await vi.waitFor(() => expect(reply).toBeTypeOf('function'));
  selection.select({ latitude: 14.54446, longitude: 121.07206 });
  reply([{ formattedAddress: 'Obsolete street' }]);
  await request;
  expect(selection.snapshot().address).toBeNull();
  expect(selection.confirm()).toBeNull();
  selection.cancel();
  expect(selection.snapshot().pin).toBeNull();
});

it.each(['success', 'failure'])('ignores a stale %s after a newer pin is ready', async (outcome) => {
  const selection = createCanonicalLocationSelection();
  let finish!: () => void;
  selection.select(pin);
  const pending = selection.resolve({ reverseGeocodeAsync: () => new Promise((resolve, reject) => {
    finish = () => outcome === 'success' ? resolve([{ formattedAddress: 'Old street' }]) : reject(new Error('old failure'));
  }) });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  const nextPin = { latitude: 14.54446, longitude: 121.07206 };
  selection.select(nextPin);
  await selection.resolve({ reverseGeocodeAsync: async () => [{ formattedAddress: 'New street' }] });
  finish();
  await pending;
  expect(selection.confirm()).toEqual({ pin: nextPin, address: 'New street' });
  expect(selection.snapshot().error).toBeNull();
});

it.each(['denied', 'unavailable'])('keeps manual confirmation available when Current Location is %s', async (kind) => {
  const selection = createCanonicalLocationSelection();
  selection.select(pin);
  await selection.resolve({ reverseGeocodeAsync: async () => { throw new Error('No native geocoder'); } });
  const requestPermission = vi.fn();
  const result = await resolveCurrentLocationPin({
    getForegroundPermissionsAsync: async () => ({ status: kind === 'denied' ? 'denied' : 'granted' }),
    requestForegroundPermissionsAsync: requestPermission,
    getCurrentPositionAsync: async () => { throw new Error('No position'); },
  });
  expect(result.kind).toBe(kind);
  expect(requestPermission).not.toHaveBeenCalled();
  expect(selection.confirm()).toEqual({ pin, address: 'Selected Job location — Santa Ana, Pateros' });
});

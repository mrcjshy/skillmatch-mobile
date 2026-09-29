import { describe, expect, it, vi } from 'vitest';
import { pinFromMapCenter, pinFromMapEvent, pinToLngLat } from './map-coordinates';
import { createCanonicalLocationSelection } from './canonical-job-location';
import { SANTA_ANA_PATEROS_INTERIOR_TEST_PIN, SANTA_ANA_PATEROS_OUTSIDE_LEGACY_PIN } from './santa-ana-service-area';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

describe('MapLibre coordinates into the canonical Job contract', () => {
  it('preserves exact named coordinates through tap/drag and marker ordering', () => {
    const pin = SANTA_ANA_PATEROS_INTERIOR_TEST_PIN;
    const event = { nativeEvent: { lngLat: [pin.longitude, pin.latitude] } };
    expect(pinFromMapEvent(event)).toEqual(pin);
    expect(pinFromMapCenter(event.nativeEvent.lngLat)).toEqual(pin);
    expect(pinToLngLat(pin)).toEqual(event.nativeEvent.lngLat);
  });

  it.each([null, [], [121], [121, 14, 0], ['121', 14], [NaN, 14], [121, Infinity], [181, 14], [121, 91]])(
    'rejects malformed native coordinates %j', (lngLat) => {
      expect(pinFromMapEvent({ nativeEvent: { lngLat } })).toBeNull();
      expect(pinFromMapCenter(lngLat)).toBeNull();
    },
  );

  it('geocodes the exact selected coordinate; new outside-area input removes confirmation without geocoding it', async () => {
    const selection = createCanonicalLocationSelection();
    const geocoder = { reverseGeocodeAsync: vi.fn().mockResolvedValue([{ formattedAddress: 'Selected pin address' }]) };
    const pin = pinFromMapEvent({ nativeEvent: { lngLat: pinToLngLat(SANTA_ANA_PATEROS_INTERIOR_TEST_PIN) } })!;
    selection.select(pin);
    await selection.resolve(geocoder);
    expect(geocoder.reverseGeocodeAsync).toHaveBeenCalledWith(pin);
    expect(selection.confirm()).toEqual({ pin, address: 'Selected pin address' });
    selection.select(pinFromMapEvent({ nativeEvent: { lngLat: pinToLngLat(SANTA_ANA_PATEROS_OUTSIDE_LEGACY_PIN) } }));
    expect(selection.confirm()).toBeNull();
    expect(selection.snapshot().address).toBeNull();
    await selection.resolve(geocoder);
    expect(selection.snapshot().error).toBe('outside');
    expect(geocoder.reverseGeocodeAsync).toHaveBeenCalledTimes(1);
  });
});

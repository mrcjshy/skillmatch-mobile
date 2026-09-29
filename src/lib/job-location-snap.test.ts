import { describe, expect, it, vi } from 'vitest';
import { SANTA_ANA_PATEROS_INTERIOR_TEST_PIN } from './santa-ana-service-area';
import { findNearbyMappedFeatures, findNearbySnap, SNAP_MIN_ZOOM, SNAP_RADIUS_PX, type SnapMap } from './job-location-snap';

const raw = SANTA_ANA_PATEROS_INTERIOR_TEST_PIN;
const at = (dx: number, dy = 0) => [raw.longitude + dx / 100000, raw.latitude + dy / 100000] as [number, number];
const point = (dx: number, properties: Record<string, unknown> = {}) => ({
  geometry: { type: 'Point', coordinates: at(dx) }, properties,
});
const building = (dx: number) => ({
  geometry: { type: 'Polygon', coordinates: [[at(dx - 1, -1), at(dx + 1, -1), at(dx + 1, 1), at(dx - 1, 1), at(dx - 1, -1)]] },
  properties: {},
});

type FixtureFeature = { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> };
function map(buildings: FixtureFeature[] = [], pois: FixtureFeature[] = []) {
  const project = vi.fn(async ([longitude, latitude]: [number, number]) =>
    [200 + (longitude - raw.longitude) * 100000, 200 + (latitude - raw.latitude) * 100000] as [number, number]);
  const queryRenderedFeatures = vi.fn(async (_bounds: [[number, number], [number, number]], options: { layers: string[] }) =>
    options.layers.includes('building-3d') ? buildings : pois);
  return { project, queryRenderedFeatures } satisfies SnapMap;
}

describe('conservative rendered-feature snapping', () => {
  it('does not query below the precision zoom', async () => {
    const m = map([building(2)]);
    expect(await findNearbySnap(m, raw, SNAP_MIN_ZOOM - 0.01)).toBeNull();
    expect(m.queryRenderedFeatures).not.toHaveBeenCalled();
  });

  it('queries only a small screen-centered rectangle and returns a building centroid', async () => {
    const m = map([building(3)]);
    const result = await findNearbySnap(m, raw, SNAP_MIN_ZOOM);
    expect(result?.kind).toBe('building');
    expect(result?.pin.longitude).toBeCloseTo(at(3)[0], 5);
    expect(m.queryRenderedFeatures).toHaveBeenCalledWith(
      [[200 - SNAP_RADIUS_PX, 200 - SNAP_RADIUS_PX], [200 + SNAP_RADIUS_PX, 200 + SNAP_RADIUS_PX]],
      { layers: ['building-3d'] },
    );
    expect(m.queryRenderedFeatures).toHaveBeenCalledTimes(2);
  });

  it('ranks house number above entrance, building, and POI', async () => {
    const m = map([building(2)], [point(8), point(7, { class: 'entrance' }), point(10, { housenumber: '52' })]);
    expect((await findNearbySnap(m, raw, SNAP_MIN_ZOOM))?.kind).toBe('housenumber');
  });

  it('picks the closer candidate of the same class', async () => {
    const m = map([], [point(9), point(2)]);
    expect((await findNearbySnap(m, raw, SNAP_MIN_ZOOM))?.distancePx).toBeCloseTo(2);
  });

  it('rejects a weak or distant candidate and preserves unmapped manual selection', async () => {
    expect(await findNearbySnap(map([], [point(13)]), raw, SNAP_MIN_ZOOM)).toBeNull();
    expect(await findNearbySnap(map(), raw, SNAP_MIN_ZOOM)).toBeNull();
  });

  it('rejects malformed polygon geometry rather than inventing a coordinate', async () => {
    const m = map([{ geometry: { type: 'Polygon', coordinates: [[at(2), at(3), at(2)]] }, properties: {} }]);
    expect(await findNearbySnap(m, raw, SNAP_MIN_ZOOM)).toBeNull();
  });

  it('rejects an outside-area candidate even when its screen projection is close', async () => {
    const outside = { geometry: { type: 'Point', coordinates: [121.06942, 14.55801] }, properties: { name: 'Outside' } };
    const m = map([], [outside]);
    m.project.mockResolvedValueOnce([200, 200]).mockResolvedValueOnce([203, 200]);
    expect(await findNearbySnap(m, raw, SNAP_MIN_ZOOM)).toBeNull();
  });

  it('does not query features when the raw center is outside Santa Ana', async () => {
    const m = map([building(1)]);
    expect(await findNearbySnap(m, { latitude: 14.55801, longitude: 121.06942 }, SNAP_MIN_ZOOM)).toBeNull();
    expect(m.queryRenderedFeatures).not.toHaveBeenCalled();
  });

  it('does not use a feature label as a coordinate or accept a failed map query', async () => {
    const m = map([], [{ geometry: { type: 'Point', coordinates: null }, properties: { name: 'Home', housenumber: '1' } }]);
    expect(await findNearbySnap(m, raw, SNAP_MIN_ZOOM)).toBeNull();
    m.queryRenderedFeatures.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce([]);
    expect(await findNearbySnap(m, raw, SNAP_MIN_ZOOM)).toBeNull();
  });
});

describe('nearby rendered-feature context', () => {
  it('hides the section when useful named features are unavailable', async () => {
    expect(await findNearbyMappedFeatures(map([building(2)], [point(3)]), raw, SNAP_MIN_ZOOM)).toEqual([]);
    const m = map([], [point(2, { name: 'Hidden' })]);
    expect(await findNearbyMappedFeatures(m, raw, SNAP_MIN_ZOOM - 1)).toEqual([]);
    expect(m.queryRenderedFeatures).not.toHaveBeenCalled();
  });

  it('deduplicates labels, excludes distant and outside features, and bounds the list', async () => {
    const outside = { geometry: { type: 'Point', coordinates: [121.06942, 14.55801] }, properties: { name: 'Outside' } };
    const m = map([], [
      point(2, { name: 'Corner Store' }), point(3, { name: 'corner store' }),
      point(80, { name: 'Distant' }), outside,
      point(4, { name: 'Clinic' }), point(5, { name: 'Hall' }), point(6, { name: 'Bakery' }),
    ]);
    const rows = await findNearbyMappedFeatures(m, raw, SNAP_MIN_ZOOM);
    expect(rows).toHaveLength(3);
    expect(rows.map((item) => item.label)).toEqual(['Corner Store', 'Clinic', 'Hall']);
    expect(rows.every((item) => item.distancePx <= 72)).toBe(true);
  });
});

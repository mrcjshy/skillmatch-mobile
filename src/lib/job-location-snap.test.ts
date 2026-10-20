import { describe, expect, it, vi } from 'vitest';
import { SANTA_ANA_PATEROS_INTERIOR_TEST_PIN } from './santa-ana-service-area';
import { findNearbyMappedFeatures, findNearbySnap, findPickerMapContext, SNAP_MIN_ZOOM, SNAP_RADIUS_PX, type SnapMap } from './job-location-snap';

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
function map(buildings: FixtureFeature[] = [], pois: FixtureFeature[] = [], roads: FixtureFeature[] = []) {
  const project = vi.fn(async ([longitude, latitude]: [number, number]) =>
    [200 + (longitude - raw.longitude) * 100000, 200 + (latitude - raw.latitude) * 100000] as [number, number]);
  const queryRenderedFeatures = vi.fn(async (_bounds: [[number, number], [number, number]], options: { layers: string[] }) =>
    options.layers.includes('building-3d') ? buildings : options.layers.includes('poi_r1') ? pois : roads);
  return { project, queryRenderedFeatures } satisfies SnapMap;
}

describe('automatic magnetic selection', () => {
  it.each([
    ['poi', 5, 61], ['poi', 40, 20], ['street', 5, 41], ['street', 25, 20],
  ] as const)('requires both capture limits for %s (geographic offset %s, screen offset %s)', async (kind, dx, screenOffset) => {
    const m = kind === 'poi' ? map([], [point(dx, { name: 'Public place' })]) : map([], [], [
      { geometry: { type: 'LineString', coordinates: [at(dx, -30), at(dx, 30)] }, properties: { class: 'minor', name: 'Public lane' } },
    ]);
    m.project.mockResolvedValueOnce([200, 200]).mockResolvedValue([200 + screenOffset, 200]);
    expect((await findPickerMapContext(m, raw, 16.6)).snap).toBeNull();
  });
  it('does not count an unchanged coordinate with a matching label as automatic movement', async () => {
    expect((await findPickerMapContext(map([], [point(0, { name: 'Already here' })]), raw, 16.6)).snap).toBeNull();
  });
  it('keeps an already aligned nearest target instead of jumping to a farther candidate', async () => {
    const road = { geometry: { type: 'LineString', coordinates: [at(10, -30), at(10, 30)] }, properties: { class: 'minor' } };
    expect((await findPickerMapContext(map([], [point(0, { name: 'Already here' })], [road]), raw, 16.6)).snap).toBeNull();
  });
  it('chooses a much nearer street ahead of a named POI and handles disjoint line parts', async () => {
    const road = { geometry: { type: 'MultiLineString', coordinates: [[at(100, -10), at(100, 10)], [at(5, -40), at(5, 40)]] }, properties: { class: 'minor' } };
    const result = await findPickerMapContext(map([], [point(30, { name: 'Attractive distant label' })], [road]), raw, 16.6);
    expect(result.snap?.kind).toBe('street');
    expect(result.snap?.pin.longitude).toBeCloseTo(at(5)[0], 9);
    expect(result.snap?.pin.latitude).toBeCloseTo(raw.latitude, 9);
  });
  it('keeps the winning feature stable when same-name branches arrive in another order', async () => {
    const branches = [{ ...point(10, { name: 'Public service' }), id: 31 }, { ...point(-10, { name: 'Public service' }), id: 32 }];
    const first = await findPickerMapContext(map([], branches), raw, 16.6);
    const reordered = await findPickerMapContext(map([], [...branches].reverse()), raw, 16.6);
    expect(first.snap?.id).toBe(reordered.snap?.id);
    expect(first.nearby).toHaveLength(2);
    expect(first.nearby[0].id).not.toBe(first.nearby[1].id);
  });
  it('accepts an actual named entrance only when linked to a loaded named place', async () => {
    const place = { ...point(20, { name: 'Public hall' }), id: 88 };
    const entrance = { ...point(5, { name: 'Public hall entrance', class: 'entrance', poi_id: 88 }), id: 89 };
    const result = await findPickerMapContext(map([], [place, entrance]), raw, 16.6);
    expect(result.snap).toMatchObject({ kind: 'entrance', pin: { latitude: raw.latitude, longitude: at(5)[0] }, label: 'Public hall entrance' });
  });
  it('does not attract a point across an actual mapped water barrier', async () => {
    const river = { geometry: { type: 'LineString', coordinates: [at(10, -40), at(10, 40)] }, properties: { class: 'river' } };
    expect((await findPickerMapContext(map([], [point(20, { name: 'Public hall' })], [river]), raw, 16.6)).snap).toBeNull();
  });
  it.each([{ class: 'rail' }, { class: 'waterway' }, { class: 'motorway' }, { access: 'private' }, { access: 'no' }, { brunnel: 'bridge' }, { tunnel: 'yes' }, { layer: 1 }])('rejects unsuitable road metadata %j', async metadata => {
    const road = { geometry: { type: 'LineString', coordinates: [at(5, -40), at(5, 40)] },
      properties: { name: 'Restricted way', class: 'minor', ...metadata } };
    expect((await findPickerMapContext(map([], [], [road]), raw, 16.6)).snap).toBeNull();
  });
  it('selects the nearest interior point on a genuine street segment, not its vertices or label', async () => {
    const road = { geometry: { type: 'LineString', coordinates: [at(10, -50), at(10, 80)] },
      properties: { name: 'Public Street', class: 'minor' }, sourceLayer: 'transportation' };
    const result = await findPickerMapContext(map([], [], [road]), raw, 16.6);
    expect(result.snap?.kind).toBe('street');
    expect(result.snap?.pin.longitude).toBeCloseTo(at(10)[0], 10);
    expect(result.snap?.pin.latitude).toBeCloseTo(raw.latitude, 10);
    expect(result.snap?.pin).not.toEqual(raw);
    expect(result.snap).toMatchObject({ label: 'Public Street', coordinateKind: 'nearest-line' });
  });
  it('automatically chooses the actual named POI coordinate after a deliberate settle', async () => {
    const result = await findPickerMapContext(map([], [point(20, { name: 'Public hall' })]), raw, 16.6);
    expect(result.snap?.pin).toEqual({ latitude: raw.latitude, longitude: at(20)[0] });
    expect(result.snap?.pin).not.toEqual(raw);
    expect(result.snap).toMatchObject({ label: 'Public hall', kind: 'poi' });
  });
});

describe('conservative rendered-feature snapping', () => {
  it('does not query below the precision zoom', async () => {
    const m = map([building(2)]);
    expect(await findNearbySnap(m, raw, SNAP_MIN_ZOOM - 0.01)).toBeNull();
    expect(m.queryRenderedFeatures).not.toHaveBeenCalled();
  });

  it('does not attract to an anonymous building centroid or query building footprints', async () => {
    const m = map([building(3)]);
    const result = await findNearbySnap(m, raw, SNAP_MIN_ZOOM);
    expect(result).toBeNull();
    expect(m.queryRenderedFeatures.mock.calls.every(([, options]) => !options.layers.includes('building-3d'))).toBe(true);
    expect(m.queryRenderedFeatures).toHaveBeenCalledTimes(2);
  });

  it('prefers the nearest named point over a farther numbered place and ignores unlinked entrances', async () => {
    const m = map([building(2)], [point(8, { name: 'Public hall' }), point(7, { name: 'Unlinked entrance', class: 'entrance' }), point(10, { name: 'Numbered place', housenumber: '52' })]);
    expect((await findNearbySnap(m, raw, SNAP_MIN_ZOOM))?.label).toBe('Public hall');
  });

  it('picks the closer candidate of the same class', async () => {
    const m = map([], [point(9, { name: 'Far hall' }), point(2, { name: 'Near hall' })]);
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
  it('deduplicates repeated mapped identities while retaining distinct same-name branches', async () => {
    const first = { ...point(20, { name: 'Corner Store' }), id: 41, source: 'openmaptiles', sourceLayer: 'poi' };
    const second = { ...point(40, { name: 'Corner Store' }), id: 42, source: 'openmaptiles', sourceLayer: 'poi' };
    const rows = await findNearbyMappedFeatures(map([], [first, { ...first }, second]), raw, 16.6);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows.map(row => row.pin.longitude)).toEqual([at(20)[0], at(40)[0]]);
    expect(rows.every(row => row.source === 'openmaptiles' && row.sourceLayer === 'poi' && row.distanceMeters > 0)).toBe(true);
  });
  it('hides the section when useful named features are unavailable', async () => {
    expect(await findNearbyMappedFeatures(map([building(2)], [point(3)]), raw, SNAP_MIN_ZOOM)).toEqual([]);
    const m = map([], [point(2, { name: 'Hidden' })]);
    expect(await findNearbyMappedFeatures(m, raw, 14.99)).toEqual([]);
    expect(m.queryRenderedFeatures).not.toHaveBeenCalled();
  });

  it('deduplicates identical named coordinates, excludes distant and outside features, and bounds the list', async () => {
    const outside = { geometry: { type: 'Point', coordinates: [121.06942, 14.55801] }, properties: { name: 'Outside' } };
    const m = map([], [
      point(2, { name: 'Corner Store' }), point(2, { name: 'corner store' }),
      point(160, { name: 'Distant' }), outside,
      point(4, { name: 'Clinic' }), point(5, { name: 'Hall' }), point(6, { name: 'Bakery' }),
    ]);
    const rows = await findNearbyMappedFeatures(m, raw, SNAP_MIN_ZOOM);
    expect(rows).toHaveLength(3);
    expect(rows.map((item) => item.label)).toEqual(['Corner Store', 'Clinic', 'Hall']);
    expect(rows.every((item) => item.distancePx <= 150)).toBe(true);
  });
});


describe('street-level landmark context', () => {
  it('queries only approved POI layers once inside a 150 pixel radius', async () => {
    const m = map([], [point(120, { name: 'Public school' })]);
    const rows = await findNearbyMappedFeatures(m, raw, 17);
    expect(m.queryRenderedFeatures).toHaveBeenCalledExactlyOnceWith([[50, 50], [350, 350]], { layers: ['poi_r1', 'poi_r7', 'poi_r20'] });
    expect(rows.map(row => row.label)).toEqual(['Public school']);
  });
  it('orders landmarks by proximity rather than category', async () => {
    const rows = await findNearbyMappedFeatures(map([], [point(40, { name: 'Far numbered place', housenumber: '1' }), point(10, { name: 'Near shop' })]), raw, 17);
    expect(rows.map(row => row.label)).toEqual(['Near shop', 'Far numbered place']);
  });
  it('never turns a named building polygon into a landmark destination', async () => {
    const b = { ...building(2), properties: { name: 'Named footprint' } };
    expect(await findNearbyMappedFeatures(map([b], []), raw, 17)).toEqual([]);
  });
  it('skips malformed names and geometry and keeps the nearest three unique POIs', async () => {
    const rows = await findNearbyMappedFeatures(map([], [point(9, { name: 'shop' }), point(9, { name: 'Shop' }), point(5, { name: 'School' }), point(8, { name: 'Clinic' }), point(6), point(7, { name: 42 }), { geometry: { type: 'Point', coordinates: null }, properties: { name: 'Invalid' } }, point(160, { name: 'Too far' })]), raw, 17);
    expect(rows.map(row => row.label)).toEqual(['School', 'Clinic', 'shop']);
    expect(rows).toHaveLength(3);
  });
  it('returns no optional landmarks on feature query failure', async () => {
    const m = map(); m.queryRenderedFeatures.mockRejectedValue(new Error('Native query unavailable'));
    expect(await findNearbyMappedFeatures(m, raw, 17)).toEqual([]);
  });
});


describe('bounded idle native queries', () => {
  it('keeps completed POI alternatives when the native road/barrier query never returns', async () => {
    vi.useFakeTimers();
    try {
      const m = map();
      m.queryRenderedFeatures.mockImplementation((_bounds, options) => options.layers.includes('road_minor')
        ? new Promise(() => {}) : Promise.resolve([point(30, { name: 'Public hall' })]));
      const result = findPickerMapContext(m, raw, 17.6);
      await vi.advanceTimersByTimeAsync(750);
      expect(await result).toMatchObject({ snap: null, nearby: [{ label: 'Public hall' }] });
    } finally { vi.useRealTimers(); }
  });
  it('discovers resting-zoom POIs without building geometry in exact-manual mode', async () => {
    vi.useFakeTimers();
    try {
      const m = map();
      m.queryRenderedFeatures.mockImplementation((_bounds, options) => options.layers.includes('building-3d')
        ? new Promise(() => {}) : Promise.resolve([point(30, { name: 'Public hall' })]));
      const result = findPickerMapContext(m, raw, 16.6, false);
      await vi.advanceTimersByTimeAsync(750);
      expect(await result).toMatchObject({ snap: null, nearby: [{ label: 'Public hall' }] });
    } finally { vi.useRealTimers(); }
  });
  it('retains completed nearby alternatives when optional snap geometry exhausts the deadline', async () => {
    vi.useFakeTimers();
    try {
      const m = map();
      m.queryRenderedFeatures.mockImplementation((_bounds, options) => Promise.resolve(options.layers.includes('poi_r1') ? [point(30, { name: 'Public hall' })] :
        [{ geometry: { type: 'LineString', coordinates: [at(3, -10), at(3, 10)] }, properties: { class: 'minor' } }]));
      const original = m.project.getMockImplementation()!;
      m.project.mockImplementation(coords => Math.abs(coords[0] - at(3)[0]) < .000001 ? new Promise(() => {}) : original(coords));
      const result = findPickerMapContext(m, raw, 17);
      await vi.advanceTimersByTimeAsync(750);
      expect(await result).toMatchObject({ snap: null, nearby: [{ label: 'Public hall' }] });
    } finally { vi.useRealTimers(); }
  });
  it('keeps nearby context inside the deadline when native bridge round trips are slow', async () => {
    vi.useFakeTimers();
    try {
      const m = map();
      m.project.mockImplementation(([longitude, latitude]) => new Promise(resolve => {
        setTimeout(() => resolve([200 + (longitude - raw.longitude) * 100000, 200 + (latitude - raw.latitude) * 100000]), 200);
      }));
      m.queryRenderedFeatures.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve([point(25, { name: 'Public school' }), point(60, { name: 'Public hall' })]), 100);
      }));
      const result = findPickerMapContext(m, raw, 16.6);
      await vi.advanceTimersByTimeAsync(750);
      expect((await result).nearby.map(row => row.label)).toEqual(['Public school', 'Public hall']);
    } finally { vi.useRealTimers(); }
  });
  it('discovers named context at the actual 16.6 resting zoom without adjusting in exact-manual mode', async () => {
    const m = map();
    m.queryRenderedFeatures.mockResolvedValue([building(3), point(25, { name: 'Public school' })]);
    const context = await findPickerMapContext(m, raw, 16.6, false);
    expect(context.nearby.map(row => row.label)).toEqual(['Public school']);
    expect(context.snap).toBeNull();
  });
  it('queries POI context first and bounds transportation/barrier inspection to the capture area', async () => {
    const m = map();
    m.queryRenderedFeatures.mockResolvedValue([building(3), point(25, { name: 'Public school' })]);
    const context = await findPickerMapContext(m, raw, 17);
    expect(m.queryRenderedFeatures).toHaveBeenCalledTimes(2);
    expect(m.queryRenderedFeatures).toHaveBeenNthCalledWith(1, [[50, 50], [350, 350]], { layers: ['poi_r1', 'poi_r7', 'poi_r20'] });
    expect(m.queryRenderedFeatures).toHaveBeenNthCalledWith(2, [[200 - SNAP_RADIUS_PX, 200 - SNAP_RADIUS_PX], [200 + SNAP_RADIUS_PX, 200 + SNAP_RADIUS_PX]], { layers: expect.arrayContaining(['road_minor', 'water']) });
    expect(context.snap?.kind).toBe('poi');
    expect(context.nearby.map(row => row.label)).toEqual(['Public school']);
  });
});


it('retains rendered landmarks at picker minimum zoom in exact-manual mode', async () => {
  const m = map();
  m.queryRenderedFeatures.mockResolvedValue([point(3, { name: 'Public school' })]);
  const context = await findPickerMapContext(m, raw, 15, false);
  expect(context.nearby.map(row => row.label)).toEqual(['Public school']);
  expect(context.snap).toBeNull();
  expect(m.queryRenderedFeatures).toHaveBeenCalledTimes(1);
});

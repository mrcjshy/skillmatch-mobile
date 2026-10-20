import { nearestPointOnLine } from '@turf/nearest-point-on-line';
import type { JobPin } from './job-location';
import { isPinInSantaAnaServiceArea } from './santa-ana-service-area';

// MapLibre 11.4 project/query coordinates are logical points on Android and iOS.
// Geographic limits never expand with zoom. These are SkillMatch tuning values.
export const SNAP_MIN_ZOOM = 15;
export const SNAP_RADIUS_PX = 60;
export const SNAP_RADIUS_METERS = 40;
export const STREET_SNAP_RADIUS_PX = 40;
export const STREET_SNAP_RADIUS_METERS = 20;

type Point = [number, number];
type Bounds = [Point, Point];
type Feature = {
  id?: string | number;
  source?: string;
  sourceLayer?: string;
  layer?: { id?: string };
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};
export type SnapKind = 'housenumber' | 'entrance' | 'building' | 'local' | 'poi' | 'street';
export type NearbyMappedFeature = {
  id: string; pin: JobPin; label: string; kind: SnapKind; category: string;
  distancePx: number; distanceMeters: number; offsetPx: Point; source: string; sourceLayer: string;
  coordinateKind: 'mapped-point' | 'nearest-line';
};
export type SnapCandidate = NearbyMappedFeature;
export type SnapMap = {
  project(coordinate: Point): Promise<Point>;
  queryRenderedFeatures(bounds: Bounds, options: { layers: string[] }): Promise<Feature[]>;
};

const POI_LAYERS = ['poi_r1', 'poi_r7', 'poi_r20'];
// Real transportation geometry in the bundled Liberty style, not label anchors.
const ROAD_LAYERS = ['road_path_pedestrian', 'road_service_track', 'road_minor', 'road_secondary_tertiary', 'road_trunk_primary'];
const SURFACE_LAYERS = [...ROAD_LAYERS, 'water', 'waterway_river', 'waterway_other', 'road_major_rail', 'road_transit_rail'];
const NEARBY_RADIUS_PX = 150;
const MAX_NEARBY = 3;
export const NEAR_LANDMARK_METERS = 80;
const MAX_CONTEXT_METERS = 180;

export function distanceMeters(a: JobPin, b: JobPin): number {
  const radians = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * radians, lon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function pinFromPoint(value: unknown): JobPin | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [longitude, latitude] = value;
  if (typeof longitude !== 'number' || typeof latitude !== 'number' ||
      !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
      Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;
  return { latitude, longitude };
}
function inside(pin: JobPin): boolean {
  return isPinInSantaAnaServiceArea(pin.latitude, pin.longitude);
}
function bounds(center: Point, radius: number): Bounds {
  return [[center[0] - radius, center[1] - radius], [center[0] + radius, center[1] + radius]];
}
function pointKind(properties: Feature['properties']): SnapKind {
  const category = String(properties?.class ?? properties?.subclass ?? '').toLowerCase();
  if (category === 'entrance' || category === 'building_entrance') return 'entrance';
  if (['residential', 'neighbourhood', 'neighborhood', 'locality'].includes(category)) return 'local';
  return 'poi';
}
function named(feature: Feature): string {
  return typeof feature.properties?.name === 'string' ? feature.properties.name.trim() : '';
}
function accessibleGroundFeature(feature: Feature): boolean {
  const p = feature.properties ?? {};
  if (['private', 'no', 'restricted', 'military', 'permit', 'customers'].includes(String(p.access ?? '').toLowerCase())) return false;
  if (['bridge', 'tunnel'].includes(String(p.brunnel ?? '').toLowerCase())) return false;
  if ([p.bridge, p.tunnel].some(value => value !== undefined && !['', 'no', '0', 'false'].includes(String(value).toLowerCase()))) return false;
  return [p.layer, p.level].every(value => value === undefined || value === null || value === '' || Number(value) === 0);
}

async function mappedRow(map: SnapMap, feature: Feature, pin: JobPin, raw: JobPin, center: Point, kind: SnapKind, label: string): Promise<NearbyMappedFeature | null> {
  if (!inside(pin)) return null;
  const meters = distanceMeters(raw, pin);
  if (meters > MAX_CONTEXT_METERS) return null;
  try {
    const pixel = await map.project([pin.longitude, pin.latitude]);
    const distancePx = Math.hypot(pixel[0] - center[0], pixel[1] - center[1]);
    if (!Number.isFinite(distancePx) || distancePx > NEARBY_RADIUS_PX) return null;
    const source = feature.source ?? 'openmaptiles';
    const sourceLayer = feature.sourceLayer ?? (kind === 'street' ? 'transportation' : 'poi');
    const category = String(feature.properties?.class ?? feature.properties?.subclass ?? 'place');
    const fallbackId = kind === 'street' ? JSON.stringify(feature.geometry) : `${label.toLocaleLowerCase()}:${category}:${pin.longitude}:${pin.latitude}`;
    const id = `${source}:${sourceLayer}:${feature.id ?? fallbackId}`;
    return { id, pin, label, kind, category, distancePx, distanceMeters: meters,
      offsetPx: [pixel[0] - center[0], pixel[1] - center[1]], source, sourceLayer,
      coordinateKind: kind === 'street' ? 'nearest-line' : 'mapped-point' };
  } catch { return null; }
}

async function pointRows(map: SnapMap, features: Feature[], raw: JobPin, center: Point): Promise<NearbyMappedFeature[]> {
  const rows = await Promise.all(features.slice(0, 100).map(async feature => {
    const label = named(feature);
    if (!label || feature.geometry?.type !== 'Point' || !accessibleGroundFeature(feature)) return null;
    // The current schema does not guarantee place/entrance linkage. Only accept
    // an entrance when the loaded data explicitly links it to a named place.
    if (pointKind(feature.properties) === 'entrance' && !features.some(place => place !== feature && named(place) &&
      place.id !== undefined && String(place.id) === String(feature.properties?.poi_id))) return null;
    const pin = pinFromPoint(feature.geometry.coordinates);
    return pin ? mappedRow(map, feature, pin, raw, center, pointKind(feature.properties), label) : null;
  }));
  const unique = new Map<string, NearbyMappedFeature>();
  for (const row of rows) if (row && !unique.has(row.id)) unique.set(row.id, row);
  return [...unique.values()].sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
}

function lineGeometry(feature: Feature): { type: 'MultiLineString'; coordinates: Point[][] } | null {
  const geometry = feature.geometry;
  const parts = geometry?.type === 'LineString' ? [geometry.coordinates] : geometry?.type === 'MultiLineString' ? geometry.coordinates : null;
  if (!Array.isArray(parts) || !parts.length || parts.length > 100) return null;
  const lines: Point[][] = [];
  let count = 0;
  for (const part of parts) {
    if (!Array.isArray(part) || part.length < 2 || (count += part.length) > 2000) return null;
    const pins = part.map(pinFromPoint);
    if (pins.some(pin => !pin)) return null;
    lines.push(pins.map(pin => [pin!.longitude, pin!.latitude]));
  }
  return { type: 'MultiLineString', coordinates: lines };
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
      Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false;
  return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
}
function pointInRing(point: Point, ring: Point[]): boolean {
  let contained = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) contained = !contained;
  }
  return contained;
}
function crossesKnownBarrier(raw: JobPin, target: JobPin, features: Feature[]): boolean {
  const a: Point = [raw.longitude, raw.latitude], b: Point = [target.longitude, target.latitude];
  return features.some(feature => {
    const p = feature.properties ?? {};
    const category = String(p.class ?? '');
    if (!['water', 'waterway'].includes(feature.sourceLayer ?? '') && !p.barrier &&
      !['river', 'stream', 'canal', 'ditch', 'water', 'lake', 'pond', 'ocean', 'rail', 'transit'].includes(category)) return false;
    const geometry = feature.geometry;
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
    const lines = lineGeometry(feature)?.coordinates ?? [];
    if (Array.isArray(polygons)) for (const polygon of polygons.slice(0, 100)) {
      if (!Array.isArray(polygon)) continue;
      const rings = polygon.map(ring => lineGeometry({ geometry: { type: 'LineString', coordinates: ring } })?.coordinates[0]);
      const outer = rings[0];
      if (!outer) continue;
      const contained = (point: Point) => pointInRing(point, outer) && !rings.slice(1).some(ring => ring && pointInRing(point, ring));
      if (contained(a) || contained(b)) return true;
      for (const ring of rings) if (ring) lines.push(ring);
    }
    return lines.some(line => line.slice(1).some((point, index) => segmentsIntersect(a, b, line[index], point)));
  });
}

async function streetRows(map: SnapMap, features: Feature[], raw: JobPin, center: Point): Promise<NearbyMappedFeature[]> {
  const rows = await Promise.all(features.slice(0, 100).map(async feature => {
    const category = String(feature.properties?.class ?? feature.properties?.highway ?? '');
    if (!['minor', 'street', 'residential', 'living_street', 'unclassified', 'path', 'pedestrian', 'footway', 'cycleway', 'service', 'track', 'primary', 'secondary', 'tertiary'].includes(category) || !accessibleGroundFeature(feature)) return null;
    const geometry = lineGeometry(feature);
    if (!geometry) return null;
    const coordinate = nearestPointOnLine(geometry, [raw.longitude, raw.latitude], { units: 'meters' }).geometry.coordinates;
    const pin = pinFromPoint(coordinate);
    return pin ? mappedRow(map, feature, pin, raw, center, 'street', named(feature) || 'Mapped street') : null;
  }));
  return rows.filter((row): row is NearbyMappedFeature => row !== null);
}

/** Named context may remain even when no automatic coordinate qualifies. */
export async function findNearbyMappedFeatures(map: SnapMap, raw: JobPin, zoom: number): Promise<NearbyMappedFeature[]> {
  if (!Number.isFinite(zoom) || zoom < SNAP_MIN_ZOOM || !inside(raw)) return [];
  try {
    const center = await map.project([raw.longitude, raw.latitude]);
    if (!center.every(Number.isFinite)) return [];
    const pois = await map.queryRenderedFeatures(bounds(center, NEARBY_RADIUS_PX), { layers: POI_LAYERS });
    return (await pointRows(map, pois, raw, center)).slice(0, MAX_NEARBY);
  } catch { return []; }
}

/** Same single decision path as the picker, including its native-query deadline. */
export async function findNearbySnap(map: SnapMap, raw: JobPin, zoom: number): Promise<SnapCandidate | null> {
  return (await findPickerMapContext(map, raw, zoom)).snap;
}

/** Nearby context is independent of optional snap geometry, within one deadline. */
export async function findPickerMapContext(map: SnapMap, raw: JobPin, zoom: number, allowSnap = true, budgetMs = 750): Promise<{ snap: SnapCandidate | null; nearby: NearbyMappedFeature[] }> {
  const started = Date.now();
  const budget = Math.max(0, Math.min(750, budgetMs));
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let completedNearby: NearbyMappedFeature[] = [];
  const projections = new Map<string, Promise<Point>>();
  const current = () => active && Date.now() - started < budget;
  const guarded: SnapMap = {
    project: async coordinate => {
      if (!current()) throw new Error('Map context expired');
      const key = coordinate.join(':');
      let pending = projections.get(key);
      if (!pending) { pending = map.project(coordinate); projections.set(key, pending); }
      const result = await pending;
      if (!current()) throw new Error('Map context expired');
      return result;
    },
    queryRenderedFeatures: async (area, options) => {
      if (!current()) throw new Error('Map context expired');
      const result = await map.queryRenderedFeatures(area, options);
      if (!current()) throw new Error('Map context expired');
      return result;
    },
  };
  try {
    const result = await Promise.race([
      readPickerMapContext(guarded, raw, zoom, allowSnap, rows => { if (current()) completedNearby = rows; }),
      new Promise<{ snap: SnapCandidate | null; nearby: NearbyMappedFeature[] }>(resolve => {
        timer = setTimeout(() => resolve({ snap: null, nearby: completedNearby }), budget);
      }),
    ]);
    return current() ? result : { snap: null, nearby: completedNearby };
  } finally { active = false; clearTimeout(timer); }
}

async function readPickerMapContext(map: SnapMap, raw: JobPin, zoom: number, allowSnap: boolean, onNearby: (rows: NearbyMappedFeature[]) => void): Promise<{ snap: SnapCandidate | null; nearby: NearbyMappedFeature[] }> {
  let nearby: NearbyMappedFeature[] = [];
  if (!Number.isFinite(zoom) || zoom < SNAP_MIN_ZOOM || !inside(raw)) return { snap: null, nearby };
  try {
    const center = await map.project([raw.longitude, raw.latitude]);
    if (!center.every(Number.isFinite)) return { snap: null, nearby };
    // POIs first; never wait for large building footprints to surface useful context.
    const pois = await map.queryRenderedFeatures(bounds(center, NEARBY_RADIUS_PX), { layers: POI_LAYERS });
    const points = await pointRows(map, pois, raw, center);
    nearby = points.slice(0, MAX_NEARBY);
    onNearby(nearby);
    if (!allowSnap) return { snap: null, nearby };
    const roads = await map.queryRenderedFeatures(bounds(center, SNAP_RADIUS_PX), { layers: SURFACE_LAYERS });
    const streets = await streetRows(map, roads, raw, center);
    const eligible = [...points, ...streets].filter(row => row.kind !== 'local' &&
      row.distancePx <= (row.kind === 'street' ? STREET_SNAP_RADIUS_PX : SNAP_RADIUS_PX) &&
      row.distanceMeters <= (row.kind === 'street' ? STREET_SNAP_RADIUS_METERS : SNAP_RADIUS_METERS) && !crossesKnownBarrier(raw, row.pin, roads));
    eligible.sort((a, b) => a.distanceMeters - b.distanceMeters || Number(a.kind === 'street') - Number(b.kind === 'street') || a.id.localeCompare(b.id));
    // An already aligned nearest target must not expose a farther attraction.
    const closest = eligible[0];
    return { snap: closest && closest.distancePx >= 0.5 ? closest : null, nearby };
  } catch { return { snap: null, nearby }; }
}

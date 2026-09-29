import type { JobPin } from './job-location';
import { isPinInSantaAnaServiceArea } from './santa-ana-service-area';

// Liberty renders buildings from zoom 13 and increasingly local POIs from 15–17.
// At 17 a small screen radius is precise enough to avoid a cross-street jump.
export const SNAP_MIN_ZOOM = 17;
export const SNAP_RADIUS_PX = 12;

type Point = [number, number];
type Bounds = [Point, Point];
type Feature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};
export type SnapKind = 'housenumber' | 'entrance' | 'building' | 'local' | 'poi';
export type SnapCandidate = { pin: JobPin; kind: SnapKind; distancePx: number };
export type NearbyMappedFeature = { pin: JobPin; label: string; kind: SnapKind; distancePx: number };
export type SnapMap = {
  project(coordinate: Point): Promise<Point>;
  queryRenderedFeatures(bounds: Bounds, options: { layers: string[] }): Promise<Feature[]>;
};

const PRIORITY: Record<SnapKind, number> = {
  housenumber: 0, entrance: 1, building: 2, local: 3, poi: 4,
};
const BUILDING_LAYERS = ['building-3d'];
const POI_LAYERS = ['poi_r1', 'poi_r7', 'poi_r20'];
const NEARBY_RADIUS_PX = 72;
const MAX_NEARBY = 3;

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

function pointInRing(point: Point, ring: Point[]): boolean {
  let contained = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) {
      contained = !contained;
    }
  }
  return contained;
}

/** Only a valid interior centroid is accepted; awkward or hollow footprints are skipped. */
function polygonCentroid(value: unknown): JobPin | null {
  if (!Array.isArray(value) || !Array.isArray(value[0])) return null;
  const rings = value.map((raw) => Array.isArray(raw) ? raw.map(pinFromPoint) : []);
  if (rings.some((ring) => ring.some((point) => !point))) return null;
  const outer = rings[0] as JobPin[];
  if (outer.length < 4 || outer.length > 500) return null;
  const origin = outer[0];
  let area2 = 0, x = 0, y = 0;
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length];
    const ax = a.longitude - origin.longitude, ay = a.latitude - origin.latitude;
    const bx = b.longitude - origin.longitude, by = b.latitude - origin.latitude;
    const cross = ax * by - bx * ay;
    area2 += cross;
    x += (ax + bx) * cross;
    y += (ay + by) * cross;
  }
  if (Math.abs(area2) < 1e-14) return null;
  const pin = pinFromPoint([origin.longitude + x / (3 * area2), origin.latitude + y / (3 * area2)]);
  if (!pin) return null;
  const point: Point = [pin.longitude, pin.latitude];
  const asPoints = (ring: JobPin[]): Point[] => ring.map((p) => [p.longitude, p.latitude]);
  if (!pointInRing(point, asPoints(outer))) return null;
  if (rings.slice(1).some((ring) => pointInRing(point, asPoints(ring as JobPin[])))) return null;
  return pin;
}

function representativePoints(feature: Feature, building: boolean): JobPin[] {
  const geometry = feature.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Point') {
    const pin = pinFromPoint(geometry.coordinates);
    return pin ? [pin] : [];
  }
  if (!building) return [];
  if (geometry.type === 'Polygon') {
    const pin = polygonCentroid(geometry.coordinates);
    return pin ? [pin] : [];
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.map(polygonCentroid).filter((pin): pin is JobPin => pin !== null);
  }
  return [];
}

function pointKind(properties: Feature['properties']): SnapKind {
  const number = properties?.housenumber ?? properties?.['addr:housenumber'];
  if (typeof number === 'string' && number.trim()) return 'housenumber';
  const category = String(properties?.class ?? properties?.subclass ?? '').toLowerCase();
  if (category === 'entrance' || category === 'building_entrance') return 'entrance';
  if (['residential', 'neighbourhood', 'neighborhood', 'locality'].includes(category) &&
      typeof properties?.name === 'string' && properties.name.trim()) return 'local';
  return 'poi';
}

/** The style-layer query itself identifies buildings versus POIs; labels never supply coordinates. */
export async function findNearbySnap(map: SnapMap, rawCenter: JobPin, zoom: number): Promise<SnapCandidate | null> {
  if (!Number.isFinite(zoom) || zoom < SNAP_MIN_ZOOM || !inside(rawCenter)) return null;
  const center = await map.project([rawCenter.longitude, rawCenter.latitude]);
  if (!center.every(Number.isFinite)) return null;
  const bounds: Bounds = [
    [center[0] - SNAP_RADIUS_PX, center[1] - SNAP_RADIUS_PX],
    [center[0] + SNAP_RADIUS_PX, center[1] + SNAP_RADIUS_PX],
  ];
  const [buildings, pois] = await Promise.allSettled([
    map.queryRenderedFeatures(bounds, { layers: BUILDING_LAYERS }),
    map.queryRenderedFeatures(bounds, { layers: POI_LAYERS }),
  ]);
  const grouped: { feature: Feature; kind: SnapKind }[] = [
    ...(buildings.status === 'fulfilled' ? buildings.value : []).map((feature) => ({ feature, kind: 'building' as const })),
    ...(pois.status === 'fulfilled' ? pois.value : []).map((feature) => ({ feature, kind: pointKind(feature.properties) })),
  ];
  let best: SnapCandidate | null = null;
  for (const { feature, kind } of grouped.slice(0, 80)) {
    for (const pin of representativePoints(feature, kind === 'building')) {
      if (!inside(pin)) continue;
      try {
        const pixel = await map.project([pin.longitude, pin.latitude]);
        if (!pixel.every(Number.isFinite)) continue;
        const distancePx = Math.hypot(pixel[0] - center[0], pixel[1] - center[1]);
        if (distancePx < 0.5 || distancePx > SNAP_RADIUS_PX) continue;
        if (!best || PRIORITY[kind] < PRIORITY[best.kind] ||
            (PRIORITY[kind] === PRIORITY[best.kind] && distancePx < best.distancePx)) {
          best = { pin, kind, distancePx };
        }
      } catch { /* A failed projection leaves the raw center authoritative. */ }
    }
  }
  return best;
}

/** Context only. A row must still move the camera through the ordinary selection pipeline. */
export async function findNearbyMappedFeatures(map: SnapMap, rawCenter: JobPin, zoom: number): Promise<NearbyMappedFeature[]> {
  if (!Number.isFinite(zoom) || zoom < SNAP_MIN_ZOOM || !inside(rawCenter)) return [];
  const center = await map.project([rawCenter.longitude, rawCenter.latitude]);
  if (!center.every(Number.isFinite)) return [];
  const bounds: Bounds = [
    [center[0] - NEARBY_RADIUS_PX, center[1] - NEARBY_RADIUS_PX],
    [center[0] + NEARBY_RADIUS_PX, center[1] + NEARBY_RADIUS_PX],
  ];
  const [buildings, pois] = await Promise.allSettled([
    map.queryRenderedFeatures(bounds, { layers: BUILDING_LAYERS }),
    map.queryRenderedFeatures(bounds, { layers: POI_LAYERS }),
  ]);
  const grouped: { feature: Feature; kind: SnapKind }[] = [
    ...(pois.status === 'fulfilled' ? pois.value : []).map((feature) => ({ feature, kind: pointKind(feature.properties) })),
    ...(buildings.status === 'fulfilled' ? buildings.value : []).map((feature) => ({ feature, kind: 'building' as const })),
  ];
  const found: NearbyMappedFeature[] = [];
  const labels = new Set<string>();
  for (const { feature, kind } of grouped.slice(0, 100)) {
    const label = typeof feature.properties?.name === 'string' ? feature.properties.name.trim() : '';
    const key = label.toLocaleLowerCase();
    if (!label || labels.has(key)) continue;
    for (const pin of representativePoints(feature, kind === 'building')) {
      if (!inside(pin)) continue;
      try {
        const pixel = await map.project([pin.longitude, pin.latitude]);
        const distancePx = Math.hypot(pixel[0] - center[0], pixel[1] - center[1]);
        if (!Number.isFinite(distancePx) || distancePx > NEARBY_RADIUS_PX) continue;
        labels.add(key);
        found.push({ pin, label, kind, distancePx });
        break;
      } catch { /* Ignore one unprojectable feature. */ }
    }
  }
  return found.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.distancePx - b.distancePx).slice(0, MAX_NEARBY);
}

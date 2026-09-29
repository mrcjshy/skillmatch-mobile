import type { JobPin } from './job-location';

/** MapLibre's presentation order; persisted Job pins retain named latitude/longitude. */
export function pinToLngLat(pin: JobPin): [number, number] {
  return [pin.longitude, pin.latitude];
}

export function pinFromMapCenter(coordinate: unknown): JobPin | null {
  if (!Array.isArray(coordinate) || coordinate.length !== 2) return null;
  const [longitude, latitude] = coordinate;
  if (typeof longitude !== 'number' || typeof latitude !== 'number' ||
      !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
      Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;
  return { latitude, longitude };
}

export function pinFromMapEvent(event: { nativeEvent: { lngLat: unknown } }): JobPin | null {
  return pinFromMapCenter(event.nativeEvent.lngLat);
}

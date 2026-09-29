import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CanonicalJobLocation } from './canonical-job-location';

const KEY = 'skillmatch:recent-job-locations:v1';
const MAX_RECENT = 5;
const NEARBY_DEGREES = 0.0002;

export type RecentLocation = CanonicalJobLocation & { timestamp: number };

export function mergeRecentLocation(current: readonly RecentLocation[], location: RecentLocation): RecentLocation[] {
  return [location, ...current.filter((item) =>
    Math.abs(item.pin.latitude - location.pin.latitude) > NEARBY_DEGREES ||
    Math.abs(item.pin.longitude - location.pin.longitude) > NEARBY_DEGREES
  )].slice(0, MAX_RECENT);
}

function parseRecent(value: string | null): RecentLocation[] {
  if (!value) return [];
  try {
    const rows = JSON.parse(value) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is RecentLocation => {
      if (typeof row !== 'object' || row === null) return false;
      const item = row as RecentLocation;
      return typeof item.address === 'string' && typeof item.timestamp === 'number' &&
        typeof item.pin?.latitude === 'number' && typeof item.pin?.longitude === 'number';
    }).slice(0, MAX_RECENT);
  } catch { return []; }
}

export async function loadRecentLocations(): Promise<RecentLocation[]> {
  return parseRecent(await AsyncStorage.getItem(KEY));
}

export async function saveRecentLocation(location: CanonicalJobLocation): Promise<RecentLocation[]> {
  const next = mergeRecentLocation(await loadRecentLocations(), { ...location, timestamp: Date.now() });
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function clearRecentLocations(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

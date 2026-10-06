import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CanonicalJobLocation } from './canonical-job-location';
import { isPinInSantaAnaServiceArea } from './santa-ana-service-area';

const LEGACY_KEY = 'skillmatch:recent-job-locations:v1';
export type RecentLocationScope = Readonly<{ userId: string; isCurrent: () => boolean }>;
let legacyCleanup: Promise<void> | undefined;
function cleanupLegacy(): Promise<void> {
  return legacyCleanup ??= AsyncStorage.removeItem(LEGACY_KEY).catch(() => undefined);
}
function isCurrent(scope: RecentLocationScope): boolean {
  try { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope.userId) && scope.isCurrent(); }
  catch { return false; }
}
function keyFor(scope: RecentLocationScope): string {
  return `skillmatch:recent-job-locations:v2:${scope.userId}`;
}
const MAX_RECENT = 5;
const NEARBY_DEGREES = 0.0002;
const TTL = 30 * 24 * 60 * 60 * 1000;
const pendingByKey = new Map<string, Promise<unknown>>();

function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const pending = (pendingByKey.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
  pendingByKey.set(key, pending);
  void pending.finally(() => { if (pendingByKey.get(key) === pending) pendingByKey.delete(key); }).catch(() => undefined);
  return pending;
}

function capture(scope: RecentLocationScope): RecentLocationScope {
  return { userId: scope?.userId, isCurrent: scope?.isCurrent };
}

export type RecentLocation = CanonicalJobLocation & { timestamp: number };

export function mergeRecentLocation(current: readonly RecentLocation[], location: RecentLocation): RecentLocation[] {
  return [location, ...current.filter((item) =>
    Math.abs(item.pin.latitude - location.pin.latitude) > NEARBY_DEGREES ||
    Math.abs(item.pin.longitude - location.pin.longitude) > NEARBY_DEGREES
  )].slice(0, MAX_RECENT);
}

function parseRecent(value: string | null, now = Date.now()): RecentLocation[] {
  if (!value) return [];
  try {
    const rows = JSON.parse(value) as unknown;
    if (!Array.isArray(rows)) return [];
    const valid = rows.filter((row): row is RecentLocation => {
      if (typeof row !== 'object' || row === null) return false;
      const item = row as RecentLocation;
      return typeof item.address === 'string' && item.address.trim() !== '' &&
        Number.isFinite(item.timestamp) && item.timestamp <= now && now - item.timestamp < TTL &&
        typeof item.pin?.latitude === 'number' && typeof item.pin?.longitude === 'number' &&
        Number.isFinite(item.pin.latitude) && Number.isFinite(item.pin.longitude) &&
        isPinInSantaAnaServiceArea(item.pin.latitude, item.pin.longitude);
    }).map(item => ({ pin: { latitude: item.pin.latitude, longitude: item.pin.longitude }, address: item.address, timestamp: item.timestamp }))
      .sort((a, b) => b.timestamp - a.timestamp);
    return valid.reduceRight<RecentLocation[]>((current, item) => mergeRecentLocation(current, item), []);
  } catch { return []; }
}

export async function loadRecentLocations(scope: RecentLocationScope): Promise<RecentLocation[]> {
  scope = capture(scope);
  if (!isCurrent(scope)) return [];
  const key = keyFor(scope);
  return serialized(key, async () => {
    if (!isCurrent(scope)) return [];
    await cleanupLegacy();
    if (!isCurrent(scope)) return [];
    const value = await AsyncStorage.getItem(key);
    if (!isCurrent(scope)) return [];
    const rows = parseRecent(value);
    if (value !== null && value !== JSON.stringify(rows)) await AsyncStorage.setItem(key, JSON.stringify(rows));
    return isCurrent(scope) ? rows : [];
  }).catch(() => []);
}

export async function saveRecentLocation(scope: RecentLocationScope, location: CanonicalJobLocation): Promise<RecentLocation[]> {
  scope = capture(scope);
  if (!isCurrent(scope)) return [];
  const key = keyFor(scope);
  const confirmed = { pin: { ...location.pin }, address: location.address, timestamp: Date.now() };
  if (parseRecent(JSON.stringify([confirmed]), confirmed.timestamp).length !== 1) return [];
  return serialized(key, async () => {
    if (!isCurrent(scope)) return [];
    await cleanupLegacy();
    if (!isCurrent(scope)) return [];
    const value = await AsyncStorage.getItem(key);
    if (!isCurrent(scope)) return [];
    const now = Date.now();
    if (!Number.isFinite(now) || confirmed.timestamp > now || now - confirmed.timestamp >= TTL) return [];
    const next = mergeRecentLocation(parseRecent(value, now), confirmed);
    await AsyncStorage.setItem(key, JSON.stringify(next));
    return isCurrent(scope) ? next : [];
  }).catch(() => []);
}

export async function clearRecentLocations(scope: RecentLocationScope): Promise<void> {
  scope = capture(scope);
  if (!isCurrent(scope)) return;
  const key = keyFor(scope);
  await serialized(key, async () => {
    if (!isCurrent(scope)) return;
    await cleanupLegacy();
    if (isCurrent(scope)) await AsyncStorage.removeItem(key);
  });
}

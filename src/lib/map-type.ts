import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useSyncExternalStore } from 'react';

/**
 * Map / Satellite for every SkillMatch map (owner choice 2026-11-04). Satellite is a hybrid:
 * Esri World Imagery under OpenFreeMap's road lines and labels (white with a dark halo), bundled as
 * a local style like the picker's. One choice for the whole app, remembered on the device.
 */
export type MapType = 'map' | 'satellite';

// Metro bundles this local JSON; keep the object stable so the map does not reload needlessly.
export const HYBRID_MAP_STYLE = require('../assets/maps/hybrid-satellite.json') as StyleSpecification;

const KEY = 'skillmatch:map-type:v1';
let current: MapType = 'map';
const listeners = new Set<() => void>();
let loaded = false;

function emit() { listeners.forEach((listener) => listener()); }

function loadOnce() {
  if (loaded) return;
  loaded = true;
  void AsyncStorage.getItem(KEY).then((value) => {
    if (value === 'satellite' && current !== 'satellite') { current = 'satellite'; emit(); }
  }).catch(() => undefined);
}

export function getMapType(): MapType {
  return current;
}

export function setMapType(next: MapType): void {
  if (next === current) return;
  current = next;
  emit();
  void AsyncStorage.setItem(KEY, next).catch(() => undefined);
}

export function toggleMapType(): void {
  setMapType(current === 'map' ? 'satellite' : 'map');
}

function subscribe(listener: () => void) {
  loadOnce();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useMapType(): MapType {
  return useSyncExternalStore(subscribe, getMapType, getMapType);
}

/** The style for a map: its own street style, or the shared hybrid when Satellite is on. */
export function useMapStyle<T>(streetStyle: T): T | StyleSpecification {
  return useMapType() === 'satellite' ? HYBRID_MAP_STYLE : streetStyle;
}

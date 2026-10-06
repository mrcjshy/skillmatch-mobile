import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion as useStartupReducedMotion } from 'react-native-reanimated';

type ReducedMotionSource = {
  isReduceMotionEnabled(): Promise<boolean>;
  addEventListener(event: 'reduceMotionChanged', handler: (enabled: boolean) => void): { remove(): void };
};

/**
 * The one live reduced-motion preference for the app.
 *
 * Android reports "Remove animations" (transition animation scale 0) through React Native's
 * AccessibilityInfo, which also emits a change while the app is open. Reanimated's own flag is
 * read once at startup, so it is only the fallback until the first live answer arrives.
 * A change event always wins over a slower initial query.
 */
export function createReducedMotionStore(source: ReducedMotionSource) {
  let value: boolean | null = null;
  let started = false;
  let changed = false;
  const listeners = new Set<() => void>();
  const set = (next: boolean) => {
    if (next === value) return;
    value = next;
    listeners.forEach((listener) => listener());
  };
  const start = () => {
    if (started) return;
    started = true;
    // App-lifetime listener: one subscription serves every motion consumer.
    source.addEventListener('reduceMotionChanged', (enabled) => { changed = true; set(enabled); });
    source.isReduceMotionEnabled().then((enabled) => { if (!changed) set(enabled); }, () => undefined);
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      start();
      return () => { listeners.delete(listener); };
    },
    get: (): boolean | null => value,
  };
}

const store = createReducedMotionStore(AccessibilityInfo);

/** True when the system asks for reduced motion. Re-renders consumers when the setting changes. */
export function useReducedMotion(): boolean {
  const startup = useStartupReducedMotion();
  const live = useSyncExternalStore(store.subscribe, store.get, store.get);
  return live ?? startup;
}

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { createPinsApi } from '@/lib/location-pins';
import { locationStopQueue } from '@/lib/location-stop-queue';
import { requestWithSystemPrompt } from '@/lib/system-prompt';
import { createSharingController, type SharingController, type SharingState } from '@/lib/location-sharing';

/** Worker-only: mounted by the Worker's inline booking map, keyed to the account and booking. Clients never collect GPS for this feature. */
export function useLocationSharing(bookingId: string, accountId: string, enabled: boolean) {
  const controller = useRef<SharingController | null>(null);
  const focused = useRef(false);
  const [state, setState] = useState<SharingState>({ status: 'off', approximate: false });
  useLayoutEffect(() => {
    const owner = createSharingController({
      bookingId, accountId, stopQueue: locationStopQueue, api: createPinsApi(), now: Date.now, onChange: setState,
      permission: async () => {
        const permission = await requestWithSystemPrompt(Location.requestForegroundPermissionsAsync);
        return permission.granted ? 'granted' : permission.canAskAgain ? 'request' : 'settings';
      },
      servicesEnabled: Location.hasServicesEnabledAsync,
      // May open Google Play services' location-settings resolution before resolving.
      // High (GPS-capable) only while the opted-in map is focused and foreground; Balanced
      // never received a fix on emulators, which have no Wi-Fi/cell location source.
      watch: callback => requestWithSystemPrompt(() => Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 0 },
        reading => {
          if (reading.coords.accuracy === null) return;
          callback({ latitude: reading.coords.latitude, longitude: reading.coords.longitude,
            accuracy: reading.coords.accuracy, timestampMs: reading.timestamp });
        })),
    });
    controller.current = owner;
    // Synchronize the new external controller when map availability changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(owner.state);
    const update = (next: string) => owner.setActive(enabled && focused.current && next === 'active');
    update(AppState.currentState);
    const subscription = AppState.addEventListener('change', update);
    return () => { subscription.remove(); owner.dispose({ stopServerShare: true }); controller.current = null; };
  }, [bookingId, accountId, enabled]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    controller.current?.setActive(enabled && AppState.currentState === 'active');
    return () => { focused.current = false; controller.current?.setActive(false); };
  }, [enabled]));
  return { state, shareId: state.shareId ?? null,
    start: () => { if (enabled && focused.current && AppState.currentState === 'active') void controller.current?.start(); },
    stop: () => controller.current?.stop(), stopAll: () => controller.current?.stopAll(), retryStop: () => controller.current?.retryStop() };
}

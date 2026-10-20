import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { createPinsApi, workerPinForViewer, type PinRole } from '@/lib/location-pins';
import { createPinsReader, type PinsView } from '@/lib/location-sharing';
import { bookingMessagesTopic, subscribeInvalidation } from '@/lib/realtime';

const empty: PinsView = { status: 'idle', counterpart: null, myShare: 'none', serverNow: null, readAtMs: 0, leaseExpiresAt: null };
/** Reads the booking's authorized pins; only a Client viewer ever keeps a (Worker) position. */
export function useBookingPins(bookingId: string, accountId: string, viewerRole: PinRole, shareId: string | null, enabled: boolean) {
  const reader = useRef<ReturnType<typeof createPinsReader> | null>(null);
  const focused = useRef(false);
  const currentShareId = useRef(shareId);
  useLayoutEffect(() => { currentShareId.current = shareId; }, [shareId]);
  const [view, setView] = useState(empty);
  const [now, setNow] = useState(() => Date.now());
  useLayoutEffect(() => {
    const api = createPinsApi();
    const owner = createPinsReader({ bookingId, now: Date.now, onChange: setView,
      read: async (id, share) => {
        const result = await api.read(id, share);
        return typeof result === 'string' ? result : workerPinForViewer(viewerRole, result);
      },
      subscribe: onInvalidate => subscribeInvalidation({ topic: bookingMessagesTopic(bookingId),
        events: ['location_pins_changed', 'booking_status_changed'], onInvalidate }),
      setInterval: (callback, ms) => setInterval(callback, ms),
      clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
    });
    reader.current = owner;
    const update = (next: string) => owner.setActive(enabled && focused.current && next === 'active', currentShareId.current);
    update(AppState.currentState);
    const subscription = AppState.addEventListener('change', update);
    // Local expiry only; this timer never performs a network read.
    const tick = setInterval(() => { owner.tick(); setNow(Date.now()); }, 1000);
    return () => { subscription.remove(); clearInterval(tick); owner.dispose(); reader.current = null; };
  }, [bookingId, accountId, viewerRole, enabled]);
  useLayoutEffect(() => { reader.current?.setShareId(shareId); }, [shareId, enabled]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    reader.current?.setActive(enabled && AppState.currentState === 'active', shareId);
    return () => { focused.current = false; reader.current?.setActive(false, shareId); };
  }, [enabled, shareId]));
  return { view, now, refresh: () => void reader.current?.refresh() };
}

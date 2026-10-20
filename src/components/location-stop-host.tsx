import { useLayoutEffect, useSyncExternalStore } from 'react';
import { AppState, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '@/components/app-button';
import { useSession } from '@/providers/session-provider';
import { locationStopQueue } from '@/lib/location-stop-queue';
import { sendLocationStop } from '@/lib/location-stop-transport';

/** Root lifetime, independent of maps/navigation. Only cleanup RPCs; never GPS. */
export function LocationStopHost() {
  const { session, sessionLifetime, isSessionLoading } = useSession();
  const insets = useSafeAreaInsets();
  const entries = useSyncExternalStore(locationStopQueue.subscribe, locationStopQueue.getSnapshot, locationStopQueue.getSnapshot);
  useLayoutEffect(() => {
    let mounted = true;
    const update = () => {
      const allowed = !isSessionLoading && session && sessionLifetime?.ownerId === session.user.id && sessionLifetime.isCurrent();
      locationStopQueue.setContext(allowed ? { accountId: session.user.id,
        isCurrent: () => mounted && AppState.currentState === 'active' && sessionLifetime.isCurrent(),
        send: stop => sendLocationStop(stop, session.access_token) } : null);
      void locationStopQueue.tick();
    };
    update();
    const subscription = AppState.addEventListener('change', update);
    const timer = setInterval(() => { void locationStopQueue.tick(); }, 1000);
    return () => { mounted = false; subscription.remove(); clearInterval(timer); locationStopQueue.setContext(null); };
  }, [session, sessionLifetime, isSessionLoading]);
  const pending = entries.filter(entry => entry.accountId === session?.user.id);
  if (isSessionLoading || !sessionLifetime?.isCurrent() || !pending.length) return null;
  const expired = pending.some(entry => entry.status === 'expired-unconfirmed');
  return <View style={{ position: 'absolute', bottom: insets.bottom + 8, left: 16, right: 16, padding: 12, gap: 8, backgroundColor: '#FFF4DB', borderRadius: 12 }}>
    <Text accessibilityLiveRegion="polite">Location collection is off for a stopped session. Server Stop is still unconfirmed.</Text>
    <Text>{expired ? 'The retry window expired. This is not confirmation of server Stop. No sharing session is restored.' : 'Stop retries continue briefly while this app is open. Your last pin may remain visible until its server expiry.'}</Text>
    {session && locationStopQueue.canRetry(session.user.id) ? <AppButton label="Retry location Stop" onPress={() => locationStopQueue.retry(session.user.id)} />
      : <Text>Automatic retries have ended or a request is pending. Stop remains unconfirmed.</Text>}
  </View>;
}

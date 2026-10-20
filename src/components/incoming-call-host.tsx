import { useLayoutEffect, useState } from 'react';
import { usePathname, useRouter, type Href } from 'expo-router';
import { AppState, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deriveAccessState } from '@/app/_layout';
import { AppButton } from '@/components/app-button';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';
import { createVideoCallApi, type VideoCall } from '@/lib/video-call';
import { subscribeInvalidation, userNotificationsTopic } from '@/lib/realtime';

export function IncomingCallHost() {
  const account = useAccount();
  const session = useSession();
  const access = deriveAccessState(session, account);
  const accountId = account.account?.id;
  const path = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [incoming, setIncoming] = useState<{ accountId: string; call: VideoCall } | null>(null);
  useLayoutEffect(() => {
    if (!accountId || (access !== 'worker' && access !== 'client')) return;
    let disposed = false, generation = 0;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const mine = ++generation;
      clearTimeout(expiry);
      setIncoming(null);
      if (AppState.currentState !== 'active' || path.endsWith('/video')) return;
      try {
        const reply = await createVideoCallApi().request('status');
        if (disposed || mine !== generation || AppState.currentState !== 'active') return;
        const call = reply.incoming?.find(c => c.role === 'callee' && c.state === 'ringing' && Date.parse(c.ring_expires_at) > Date.parse(c.server_now));
        if (call) {
          setIncoming({ accountId, call });
          expiry = setTimeout(() => setIncoming(null), Math.min(45_000, Date.parse(call.ring_expires_at) - Date.parse(call.server_now)));
        }
      } catch { /* No invitation is displayed without an authoritative successful read. */ }
    };
    const subscription = AppState.addEventListener('change', () => void refresh());
    const unsubscribe = subscribeInvalidation({ topic: userNotificationsTopic(accountId), events: ['call_state_changed'], onInvalidate: () => void refresh() });
    void refresh();
    return () => { disposed = true; generation++; clearTimeout(expiry); subscription.remove(); unsubscribe(); };
  }, [accountId, access, path]);
  if (!incoming || incoming.accountId !== accountId || (access !== 'worker' && access !== 'client') || AppState.currentState !== 'active' || path.endsWith('/video')) return null;
  return <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, backgroundColor: 'white', padding: 16, gap: 8, borderRadius: 12 }}>
    <Text accessibilityLiveRegion="assertive">Incoming booking video call</Text>
    <AppButton label="Review incoming call" onPress={() => {
      const bookingId = incoming.call.booking_id; setIncoming(null);
      router.push({ pathname: access === 'worker' ? '/worker/video' : '/client/video', params: { bookingId } } as Href);
    }} />
    <AppButton label="Dismiss invitation" variant="secondary" onPress={() => setIncoming(null)} />
  </View>;
}

import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  captureNotificationResponse,
  consumeReadyInboxNavigation,
  hasPendingNotificationsInboxIntent,
} from '@/lib/push-notifications';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

/**
 * Early R5B tap capture. Mounted at the root so a cold-process response is
 * recorded before role layouts exist. Navigation waits for authoritative
 * session + users row + active Worker/Client role.
 */
export function PushNotificationInboxIntent() {
  const router = useRouter();
  const { session, isSessionLoading } = useSession();
  const { account, status } = useAccount();
  const [, setCaptureGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const remember = (response: unknown) => {
      if (!captureNotificationResponse(response)) return;
      if (!cancelled) setCaptureGeneration((value) => value + 1);
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (cancelled) return;
      remember(response);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(remember);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const href = consumeReadyInboxNavigation({
      hasPendingInboxIntent: hasPendingNotificationsInboxIntent(),
      isSessionLoading,
      hasSession: Boolean(session),
      accountStatus: status,
      role: account?.role,
      isActive: account?.is_active,
    });
    if (!href) return;
    router.replace(href as Href);
    void Notifications.clearLastNotificationResponseAsync();
  }, [account, isSessionLoading, session, status, router]);

  return null;
}

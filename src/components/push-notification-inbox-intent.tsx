import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { deriveAccessState } from '@/app/_layout';
import {
  captureNotificationResponse,
  consumeReadyInboxNavigation,
  getPendingNotificationId,
  hasPendingNotificationsInboxIntent,
} from '@/lib/push-notifications';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

/**
 * Early R5B tap capture. Mounted at the root so a cold-process response is
 * recorded before role layouts exist. Navigation waits for authoritative
 * session + users row + an active supported role. Admin report routing reads
 * the recipient-owned notification row after bootstrap because the push
 * payload deliberately contains no trusted notification type.
 */
export function PushNotificationInboxIntent() {
  const router = useRouter();
  const sessionValue = useSession();
  const accountValue = useAccount();
  const { session, isSessionLoading } = sessionValue;
  const { account, status } = accountValue;
  const access = deriveAccessState(sessionValue, accountValue);
  const [captureGeneration, setCaptureGeneration] = useState(0);

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
    if (access !== 'worker' && access !== 'client' && access !== 'administrator') return;
    if (!hasPendingNotificationsInboxIntent()) return;

    let cancelled = false;
    const navigate = (notificationType?: string | null, isResolved?: boolean) => {
      if (cancelled) return;
      const href = consumeReadyInboxNavigation({
        hasPendingInboxIntent: hasPendingNotificationsInboxIntent(),
        isSessionLoading,
        hasSession: Boolean(session),
        accountStatus: status,
        role: account?.role,
        isActive: account?.is_active,
        notificationType,
        isNotificationTypeResolved: isResolved,
      });
      if (!href) return;
      router.replace(href as Href);
      void Notifications.clearLastNotificationResponseAsync();
    };

    if (access !== 'administrator') {
      navigate();
      return () => {
        cancelled = true;
      };
    }

    const notificationId = getPendingNotificationId();
    if (!notificationId) {
      navigate(null, true);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      let notificationType: string | null = null;
      try {
        const result = await supabase
          .from('notifications')
          .select('type')
          .eq('id', notificationId)
          .maybeSingle();
        notificationType =
          !result.error && typeof result.data?.type === 'string' ? result.data.type : null;
      } catch {
        // Push is only a delivery hint. A failed trusted lookup falls back to
        // the protected Admin inbox rather than trusting response content.
      }
      if (cancelled || getPendingNotificationId() !== notificationId) return;
      navigate(notificationType, true);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    access,
    account,
    captureGeneration,
    isSessionLoading,
    session,
    status,
    router,
  ]);

  return null;
}

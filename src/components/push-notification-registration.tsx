import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import {
  isPushRegistrationRole,
  PERMISSION_SETTLE_MS,
  registerCurrentPushDevice,
  type PushRole,
} from '@/lib/push-notifications';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

/**
 * Authenticated Worker/Client/Administrator device registration only.
 *
 * Tap routing lives in PushNotificationInboxIntent so a single response
 * pipeline can capture cold-start responses before role layouts mount.
 * Permission is requested only after a short idle so login/registration
 * /bootstrap are never blocked.
 */
export function PushNotificationRegistration({ role }: { role: PushRole }) {
  const { session } = useSession();
  const { account, status } = useAccount();

  useEffect(() => {
    if (!session || status !== 'resolved' || !account?.is_active) return;
    if (!isPushRegistrationRole(account.role) || account.role !== role) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      void registerCurrentPushDevice({
        platform: Platform.OS,
        isExpoGo: Constants.appOwnership === 'expo',
        notifications: Notifications,
        constants: Constants,
        rpc: async (fn, args) => await supabase.rpc(fn, args),
      }).catch(() => {
        // Registration is a delivery hint. Failure must not break the app.
      });
    }, PERMISSION_SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [account, role, session, status]);

  return null;
}

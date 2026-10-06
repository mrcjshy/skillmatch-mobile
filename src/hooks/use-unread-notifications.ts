import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';

import { loadHasUnreadNotifications } from '@/lib/notification-unread';
import { createCoalescedInvalidation, NOTIFICATION_INSERTED, subscribeInvalidation, userNotificationsTopic } from '@/lib/realtime';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

/** Home-only lifetime; never marks read and never reuses a previous account/session's result. */
export function useUnreadNotifications(role: 'worker' | 'client' | 'admin'): boolean {
  const { account } = useAccount();
  const { session, sessionRevision = 0, isSessionRevisionCurrent } = useSession();
  const userId = account?.is_active && account.role === (role === 'admin' ? 'administrator' : role) &&
    account.id === session?.user.id ? account.id : null;
  const owner = `${userId}:${sessionRevision}`;
  const [snapshot, setSnapshot] = useState<{ owner: string; unread: boolean } | null>(null);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let cancelled = false;
    let epoch = 0;
    const current = (readEpoch: number) => !cancelled && readEpoch === epoch &&
      AppState.currentState === 'active' && (isSessionRevisionCurrent?.(sessionRevision) ?? true);
    const reader = createCoalescedInvalidation(async () => {
      const readEpoch = epoch;
      if (!current(readEpoch)) return;
      try {
        const unread = await loadHasUnreadNotifications();
        if (current(readEpoch)) setSnapshot({ owner, unread });
      } catch {
        // A failed read cannot establish unread state; focus/resume/reconnect reads again.
        if (current(readEpoch)) setSnapshot(null);
      }
    });
    setSnapshot(null);
    reader.invalidate();
    const unsubscribe = subscribeInvalidation({
      topic: userNotificationsTopic(userId), events: [NOTIFICATION_INSERTED], onInvalidate: reader.invalidate,
    });
    const listener = AppState.addEventListener('change', state => {
      epoch++;
      setSnapshot(null);
      if (state === 'active') reader.invalidate();
    });
    return () => { cancelled = true; epoch++; reader.cancel(); unsubscribe(); listener.remove(); setSnapshot(null); };
  }, [userId, owner, sessionRevision, isSessionRevisionCurrent]));

  return userId !== null && snapshot?.owner === owner && snapshot.unread && (isSessionRevisionCurrent?.(sessionRevision) ?? true);
}

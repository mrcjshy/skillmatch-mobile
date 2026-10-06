import { Stack } from 'expo-router';
import { useLayoutEffect, useMemo } from 'react';

import { PushNotificationRegistration } from '@/components/push-notification-registration';
import { SkillMatchTheme } from '@/constants/theme';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';
import { ClientJobsProvider } from '@/providers/client-jobs-provider';

const { colors } = SkillMatchTheme.ui;

// The tab shell is one headerless Stack child. Help, Notifications and Booking
// Chat remain pushed Stack screens with their existing header/back behavior.
export default function ClientLayout() {
  const { account, status, hasCurrentConsent } = useAccount();
  const { session, isSessionLoading, sessionError, recoveryStatus, sessionRevision = 0, isSessionRevisionCurrent } = useSession();
  const ownerId = !isSessionLoading && !sessionError && recoveryStatus === 'idle' && session &&
    status === 'resolved' && account?.id === session.user.id && account.role === 'client' &&
    account.is_active === true && hasCurrentConsent === true ? account.id : null;
  const lifetime = useMemo(() => {
    if (ownerId === null) return null;
    let active = true;
    return {
      ownerId,
      isOwnerCurrent: () => active && (isSessionRevisionCurrent?.(sessionRevision) ?? true),
      activate: () => { active = true; },
      dispose: () => { active = false; },
    };
  }, [ownerId, sessionRevision, isSessionRevisionCurrent]);
  // Commit-time cleanup revokes the previous lifetime before asynchronous
  // continuations can publish; same-account reentry receives a new closure.
  useLayoutEffect(() => {
    if (!lifetime) return;
    lifetime.activate();
    return lifetime.dispose;
  }, [lifetime]);
  if (!lifetime) return null;
  return (
    <ClientJobsProvider key={lifetime.ownerId} ownerId={lifetime.ownerId} isOwnerCurrent={lifetime.isOwnerCurrent}>
      <PushNotificationRegistration role="client" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </ClientJobsProvider>
  );
}

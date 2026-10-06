import { Stack, type Href } from 'expo-router';
import { TamaguiProvider } from 'tamagui';

import { tamaguiConfig } from '../../tamagui.config';

import { PushNotificationInboxIntent } from '@/components/push-notification-inbox-intent';
import { IncomingMessageBannerHost } from '@/components/incoming-message-banner-host';
import { StateScreen } from '@/components/state-screen';
import { isRecoverySurfaceActive } from '@/lib/auth-recovery';
import { isPhoneOtpEnabled } from '@/lib/phone-verification';
import { canEnterWorkerApp } from '@/lib/worker-onboarding';
import {
  AccountProvider,
  useAccount,
  type AccountContextValue,
} from '@/providers/account-provider';
import {
  SessionProvider,
  useSession,
  type SessionContextValue,
} from '@/providers/session-provider';

/**
 * Root access-control authority.
 *
 * Exactly one access state is derived from SessionProvider + AccountProvider.
 * The root Stack exposes only the route group for that state (Stack.Protected
 * removes every other group from the navigator and purges it from history),
 * and the root `index` dispatcher forwards to that state's route with a single
 * <Redirect> (replace semantics). Group layouts contain no routing logic.
 *
 * Inline states (session restoring, session restoration error, account
 * pending) render no route tree at all. Password recovery is a routed
 * state and is not reused as blocked or bootstrap-error.
 */
export type AccessState =
  | 'session-restoring'
  | 'session-error'
  | 'signed-out'
  | 'password-recovery'
  | 'account-pending'
  | 'needs-phone-verification'
  | 'blocked'
  | 'needs-consent'
  | 'worker-identity'
  | 'worker'
  | 'client'
  | 'administrator'
  | 'account-failure';

/**
 * Single derivation used by BOTH the root guards and the index dispatcher.
 * Legitimate terminal states are defined positively; any other authenticated
 * non-pending state fails closed to `account-failure`. Never defaults to a
 * role.
 */
export function deriveAccessState(
  sessionValue: Pick<
    SessionContextValue,
    'session' | 'isSessionLoading' | 'sessionError' | 'recoveryStatus'
  >,
  accountValue: Pick<
    AccountContextValue,
    'account' | 'status' | 'accountError' | 'hasCurrentConsent' | 'workerOnboardingState'
  >,
  phoneOtpEnabled = isPhoneOtpEnabled()
): AccessState {
  const { session, isSessionLoading, sessionError, recoveryStatus } = sessionValue;
  const { account, status, hasCurrentConsent, workerOnboardingState } =
    accountValue;

  if (isSessionLoading) return 'session-restoring';
  if (isRecoverySurfaceActive(recoveryStatus)) return 'password-recovery';
  if (!session) return sessionError ? 'session-error' : 'signed-out';

  // Authenticated from here on.
  if (status === 'idle' || status === 'pending') return 'account-pending';
  if (status === 'resolved' && account !== null && account.id !== session.user.id) {
    return 'account-pending';
  }
  if (
    phoneOtpEnabled &&
    status === 'error' &&
    accountValue.accountError?.code === 'phone_verification_required'
  ) {
    return 'needs-phone-verification';
  }

  const resolved = status === 'resolved' && account !== null;
  if (resolved && account.is_active === false) return 'blocked';
  // Administrators are provisioned, not self-registered — never lock them
  // behind consent or Worker ID onboarding.
  if (resolved && account.is_active === true && account.role === 'administrator') {
    return 'administrator';
  }
  if (resolved && account.is_active === true && account.role === 'worker') {
    if (hasCurrentConsent !== true) return 'needs-consent';
    return canEnterWorkerApp(workerOnboardingState) ? 'worker' : 'worker-identity';
  }
  if (resolved && account.is_active === true && account.role === 'client') {
    if (hasCurrentConsent !== true) return 'needs-consent';
    return 'client';
  }

  // status === 'error', resolved with null account, invalid role, invalid
  // is_active, or any other malformed authenticated non-pending state.
  return 'account-failure';
}

/** Forward target per routed state. Inline states have no route. */
export const ACCESS_ROUTE: Partial<Record<AccessState, Href>> = {
  'signed-out': '/login',
  'password-recovery': '/update-password',
  'needs-phone-verification': '/verify-phone' as Href,
  blocked: '/blocked',
  'needs-consent': '/legal-consent',
  'worker-identity': '/verify-identity',
  worker: '/worker',
  client: '/client',
  administrator: '/admin',
  'account-failure': '/bootstrap-error',
};

function RootNavigator() {
  const access = deriveAccessState(useSession(), useAccount());

  // Inline-only states: no route tree.
  if (access === 'session-restoring') {
    return <StateScreen loading title="Loading SkillMatch" message="Restoring your session…" />;
  }
  if (access === 'account-pending') {
    return <StateScreen loading title="Loading SkillMatch" message="Checking your account…" />;
  }
  if (access === 'session-error') {
    return (
      <StateScreen
        tone="error"
        icon={{ android: 'cloud_off', ios: 'icloud.slash' }}
        title="Session error"
        message="Your session could not be restored. Please close and reopen the app."
      />
    );
  }

  return (
    // The root navigator's screens are route groups and terminal states, none of
    // which sets a title, so its header would only ever render a raw internal
    // name such as "(worker)". Root transitions are guard-driven (Stack.Protected
    // plus the index <Redirect>), never user back-navigation, so no affordance is
    // lost by hiding it. Group layouts keep their own headers.
    <Stack screenOptions={{ headerShown: false }}>
      {/* `index` is declared first so it is the fallback route whenever a
          guard flips and purges the current screen from history. */}
      <Stack.Screen name="index" />
      <Stack.Screen name="+not-found" options={{ statusBarStyle: 'dark' }} />
      <Stack.Protected
        guard={
          access === 'signed-out' ||
          access === 'needs-phone-verification' ||
          access === 'needs-consent' ||
          access === 'worker-identity'
        }
      >
        <Stack.Screen name="(auth)" options={{ statusBarStyle: 'dark' }} />
      </Stack.Protected>
      <Stack.Protected guard={access === 'password-recovery'}>
        <Stack.Screen name="update-password" options={{ statusBarStyle: 'dark' }} />
      </Stack.Protected>
      <Stack.Protected guard={access === 'blocked'}>
        <Stack.Screen name="blocked" options={{ statusBarStyle: 'dark' }} />
      </Stack.Protected>
      <Stack.Protected guard={access === 'worker'}>
        <Stack.Screen name="(worker)" />
      </Stack.Protected>
      <Stack.Protected guard={access === 'client'}>
        <Stack.Screen name="(client)" />
      </Stack.Protected>
      <Stack.Protected guard={access === 'administrator'}>
        <Stack.Screen name="(admin)" />
      </Stack.Protected>
      <Stack.Protected guard={access === 'account-failure'}>
        <Stack.Screen name="bootstrap-error" options={{ statusBarStyle: 'dark' }} />
      </Stack.Protected>
      {/* Loading is inline-only; the route is never navigable. */}
      <Stack.Protected guard={false}>
        <Stack.Screen name="loading" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <AccountProvider>
        <TamaguiProvider config={tamaguiConfig} defaultTheme="skillmatch">
          <PushNotificationInboxIntent />
          <RootNavigator />
          <IncomingMessageBannerHost />
        </TamaguiProvider>
      </AccountProvider>
    </SessionProvider>
  );
}

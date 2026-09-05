import { Stack, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

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
 * pending) render no route tree at all.
 */
export type AccessState =
  | 'session-restoring'
  | 'session-error'
  | 'signed-out'
  | 'account-pending'
  | 'blocked'
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
  sessionValue: Pick<SessionContextValue, 'session' | 'isSessionLoading' | 'sessionError'>,
  accountValue: Pick<AccountContextValue, 'account' | 'status'>
): AccessState {
  const { session, isSessionLoading, sessionError } = sessionValue;
  const { account, status } = accountValue;

  if (isSessionLoading) return 'session-restoring';
  if (!session) return sessionError ? 'session-error' : 'signed-out';

  // Authenticated from here on.
  if (status === 'idle' || status === 'pending') return 'account-pending';

  const resolved = status === 'resolved' && account !== null;
  if (resolved && account.is_active === false) return 'blocked';
  if (resolved && account.is_active === true && account.role === 'worker') return 'worker';
  if (resolved && account.is_active === true && account.role === 'client') return 'client';
  if (resolved && account.is_active === true && account.role === 'administrator') {
    return 'administrator';
  }

  // status === 'error', resolved with null account, invalid role, invalid
  // is_active, or any other malformed authenticated non-pending state.
  return 'account-failure';
}

/** Forward target per routed state. Inline states have no route. */
export const ACCESS_ROUTE: Partial<Record<AccessState, Href>> = {
  'signed-out': '/login',
  blocked: '/blocked',
  worker: '/worker',
  client: '/client',
  administrator: '/admin',
  'account-failure': '/bootstrap-error',
};

function InlineGate({ title, note, spinner }: { title: string; note: string; spinner: boolean }) {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
      {spinner ? <ActivityIndicator /> : null}
    </View>
  );
}

function RootNavigator() {
  const access = deriveAccessState(useSession(), useAccount());

  // Inline-only states: no route tree.
  if (access === 'session-restoring') {
    return <InlineGate title="Loading SkillMatch" note="Restoring your session…" spinner />;
  }
  if (access === 'account-pending') {
    return <InlineGate title="Loading SkillMatch" note="Checking your account…" spinner />;
  }
  if (access === 'session-error') {
    return (
      <InlineGate
        title="Session Error"
        note="Your session could not be restored. Please close and reopen the app."
        spinner={false}
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
      <Stack.Screen name="+not-found" />
      <Stack.Protected guard={access === 'signed-out'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={access === 'blocked'}>
        <Stack.Screen name="blocked" />
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
        <Stack.Screen name="bootstrap-error" />
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
        <RootNavigator />
      </AccountProvider>
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  note: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
});

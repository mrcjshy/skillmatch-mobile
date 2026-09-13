import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ACCESS_ROUTE, deriveAccessState } from '@/app/_layout';
import {
  decidePendingInboxNavigation,
  hasPendingNotificationsInboxIntent,
} from '@/lib/push-notifications';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

/**
 * Sole forward dispatcher. Derives the same access state as the root layout
 * guards and forwards with a single <Redirect> (replace semantics). It is the
 * first-declared root route, so it is also the fallback whenever a guard
 * flips and purges the current screen from history.
 */
export default function RootIndex() {
  const sessionValue = useSession();
  const accountValue = useAccount();
  const access = deriveAccessState(sessionValue, accountValue);
  const home = ACCESS_ROUTE[access];
  const inbox = decidePendingInboxNavigation({
    hasPendingInboxIntent: hasPendingNotificationsInboxIntent(),
    isSessionLoading: sessionValue.isSessionLoading,
    hasSession: Boolean(sessionValue.session),
    accountStatus: accountValue.status,
    role: accountValue.account?.role,
    isActive: accountValue.account?.is_active,
  });

  // A pending inbox intent must win over the ordinary role-home redirect so
  // the dispatcher cannot overwrite a captured cold-start tap.
  if (inbox.kind === 'replace') {
    return <Redirect href={inbox.href} />;
  }

  // Inline states are held by the root layout and never reach here; this is
  // a defensive no-navigation render for the brief window before they do.
  if (!home) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={home} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

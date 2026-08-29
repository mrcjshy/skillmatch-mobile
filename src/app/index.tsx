import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ACCESS_ROUTE, deriveAccessState } from '@/app/_layout';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

/**
 * Sole forward dispatcher. Derives the same access state as the root layout
 * guards and forwards with a single <Redirect> (replace semantics). It is the
 * first-declared root route, so it is also the fallback whenever a guard
 * flips and purges the current screen from history.
 */
export default function RootIndex() {
  const access = deriveAccessState(useSession(), useAccount());
  const target = ACCESS_ROUTE[access];

  // Inline states are held by the root layout and never reach here; this is
  // a defensive no-navigation render for the brief window before they do.
  if (!target) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={target} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

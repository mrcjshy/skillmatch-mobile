import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

/**
 * Fail-closed surface for authoritative account lookup/bootstrap failure
 * (network, database, malformed row, unusable bootstrap input).
 *
 * This is NOT the blocked screen: /blocked is reserved for a successfully
 * resolved account whose authoritative state denies access.
 *
 * Escape routes: Retry (re-runs bootstrap) or Sign Out (session transition
 * drives the root router). No manual navigation.
 */
export default function BootstrapErrorScreen() {
  const { status, accountError, isAccountLoading, retryAccountBootstrap } =
    useAccount();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const hasActiveError = status === 'error' && accountError !== null;

  async function handleSignOut() {
    if (isSigningOut) return;
    setSignOutError(null);
    setIsSigningOut(true);
    try {
      const { error } = await signOutCurrentUser();
      if (error) setSignOutError(error.message || 'Sign out failed. Please try again.');
    } catch {
      setSignOutError('Sign out failed. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  const statusMessage = hasActiveError
    ? accountError.message
    : isAccountLoading
      ? 'Checking your account…'
      : 'Your account could not be resolved into a valid SkillMatch account.';

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Account Setup Error</Text>

      <InlineStatus
        variant={hasActiveError ? 'error' : isAccountLoading ? 'loading' : 'note'}
        message={statusMessage}
      />

      <AppButton
        label="Retry"
        onPress={retryAccountBootstrap}
        loading={isAccountLoading}
        disabled={isSigningOut}
        style={styles.action}
      />

      <AppButton
        label="Sign Out"
        variant="ghost"
        onPress={handleSignOut}
        loading={isSigningOut}
        disabled={isAccountLoading}
        style={styles.action}
      />
      {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  heading: {
    ...type.screenTitle,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  action: {
    alignSelf: 'stretch',
  },
  error: {
    ...type.helper,
    color: colors.danger,
    textAlign: 'center',
  },
});

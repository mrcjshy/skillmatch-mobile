import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { SkillMatchTheme } from '@/constants/theme';
import { signOutCurrentUser } from '@/lib/sign-out';

const { colors, type, spacing } = SkillMatchTheme.ui;

/**
 * Reserved for a successfully resolved authoritative account whose
 * is_active === false. Not used for bootstrap/network/session failures.
 * No Retry: the account state is known and denies access. Sign Out only.
 */
export default function BlockedScreen() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

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

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Access Blocked</Text>
      <Text style={styles.note}>
        Your SkillMatch account is currently inactive. Please contact the
        administrator for assistance.
      </Text>
      <AppButton label="Sign Out" onPress={handleSignOut} loading={isSigningOut} />
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
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  heading: {
    ...type.screenTitle,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  note: {
    ...type.helper,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  error: {
    ...type.helper,
    color: colors.danger,
    textAlign: 'center',
  },
});

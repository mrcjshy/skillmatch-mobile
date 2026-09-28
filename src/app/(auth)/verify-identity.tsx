import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppNotice } from '@/components/app-notice';
import { WorkerIdentitySection } from '@/components/worker-identity-section';
import { SkillMatchTheme } from '@/constants/theme';
import { IDENTITY_COPY } from '@/lib/worker-identity';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

export default function VerifyIdentityScreen() {
  const insets = useSafeAreaInsets();
  const { refreshIdentity, workerOnboardingState, identitySubmission } = useAccount();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSubmitted = useCallback(async () => {
    await refreshIdentity();
  }, [refreshIdentity]);

  useFocusEffect(useCallback(() => {
    void refreshIdentity();
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshIdentity();
    });
    return () => listener.remove();
  }, [refreshIdentity]));

  async function handleRetry() {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await refreshIdentity();
    } finally {
      setIsRetrying(false);
    }
  }

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
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xxxl },
      ]}
    >
      <View style={styles.brand}>
        <Image
          source={require('@/assets/images/skillmatch-logo.png')}
          style={styles.brandLogo}
          accessibilityIgnoresInvertColors
        />
        <Text style={styles.brandName}>SkillMatch</Text>
      </View>
      <Text style={styles.heading}>
        {workerOnboardingState === 'pending-review' ? 'Verification Pending'
          : workerOnboardingState === 'rejected' ? 'Verification Needs Attention'
            : 'Verify your identity'}
      </Text>
      <Text style={styles.note}>
        {workerOnboardingState === 'pending-review'
          ? 'Your valid ID has been submitted and is waiting for administrator review.'
          : workerOnboardingState === 'rejected'
            ? 'Your previous ID submission was not approved. Please submit another supported valid ID.'
            : 'A valid ID is required before you can use the Worker app. There is no skip.'}
      </Text>

      {workerOnboardingState === 'loading' ? <AppNotice variant="warning" message="Checking verification status..." /> : null}
      {workerOnboardingState === 'load-error' ? (
        <View style={styles.retryBlock}>
          <AppNotice variant="danger" message={IDENTITY_COPY.loadFailed} />
          <AppButton
            label="Try again"
            variant="secondary"
            onPress={() => {
              void handleRetry();
            }}
            loading={isRetrying}
          />
        </View>
      ) : null}

      {workerOnboardingState === 'pending-review' ? (
        <AppButton label="Refresh Status" variant="secondary" onPress={() => { void handleRetry(); }} loading={isRetrying} />
      ) : null}
      {(workerOnboardingState === 'needs-submission' || workerOnboardingState === 'rejected') ? (
        <WorkerIdentitySection
          disabled={false}
          surface="onboarding"
          authoritativeSubmission={identitySubmission}
          onSubmitted={handleSubmitted}
        />
      ) : null}
      <AppButton label="Sign Out" variant="ghost" onPress={() => { void handleSignOut(); }} loading={isSigningOut} />
      {signOutError ? <AppNotice variant="danger" message={signOutError} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandLogo: {
    width: 48,
    height: 48,
  },
  brandName: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  heading: {
    ...type.display,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  note: {
    ...type.helper,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBlock: {
    gap: spacing.md,
  },
});

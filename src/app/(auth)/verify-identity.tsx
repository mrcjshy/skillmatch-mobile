import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AuthScreen, AuthSection } from '@/components/auth-screen';
import { FormMessage } from '@/components/form-message';
import { StepList, type Step } from '@/components/step-list';
import { WorkerIdentitySection } from '@/components/worker-identity-section';
import { useUiTheme, type UiTheme, RefinementThemeProvider } from '@/components/refinement-theme';
import { IDENTITY_COPY } from '@/lib/worker-identity';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';

export default function VerifyIdentityScreen() {
  return <RefinementThemeProvider><VerifyIdentityContent /></RefinementThemeProvider>;
}

function VerifyIdentityContent() {
  const ui = useUiTheme();
  const styles = createStyles(ui);

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

  const isPending = workerOnboardingState === 'pending-review';
  const isRejected = workerOnboardingState === 'rejected';
  const showsForm = workerOnboardingState === 'needs-submission' || isRejected;

  // The real Worker onboarding order: account and email are already done, the ID is now, and the
  // work profile opens only once an administrator approves the ID.
  const steps: readonly Step[] = [
    { label: 'Account and email', state: 'done' },
    {
      label: 'Verify your ID',
      detail: isPending
        ? 'Submitted. An administrator is reviewing it.'
        : isRejected
          ? 'Your last submission was not approved.'
          : 'Upload a photo of a valid ID.',
      state: 'current',
    },
    { label: 'Set up your work profile', detail: 'Opens after your ID is approved.', state: 'upcoming' },
  ];

  return (
    <AuthScreen
      title={
        isPending
          ? 'Verification pending'
          : isRejected
            ? 'Verification needs attention'
            : 'Verify your identity'
      }
      description={
        isPending
          ? 'Your valid ID has been submitted and is waiting for administrator review.'
          : isRejected
            ? 'Your previous ID submission was not approved. Please submit another supported valid ID.'
            : 'A valid ID is required before you can use the Worker app. There is no skip.'
      }
      footer={
        <>
          <AppButton label="Sign out" variant="ghost" onPress={() => { void handleSignOut(); }} loading={isSigningOut} />
          {signOutError ? <FormMessage tone="error" message={signOutError} /> : null}
        </>
      }
    >
      <StepList steps={steps} />

      {workerOnboardingState === 'loading' ? <FormMessage tone="info" message="Checking verification status..." /> : null}
      {workerOnboardingState === 'load-error' ? (
        <View style={styles.block}>
          <FormMessage tone="error" message={IDENTITY_COPY.loadFailed} />
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

      {isPending ? (
        <View style={styles.block}>
          {IDENTITY_COPY.homePendingBody.map((line) => (
            <Text key={line} style={styles.line}>{line}</Text>
          ))}
          <AppButton label="Refresh status" variant="secondary" onPress={() => { void handleRetry(); }} loading={isRetrying} />
        </View>
      ) : null}

      {showsForm ? (
        <>
          <AuthSection title="Why we ask">
            <Text style={styles.line}>Only verified Workers are included in job matching.</Text>
            <Text style={styles.line}>An administrator reviews your ID. Clients cannot see it.</Text>
          </AuthSection>
          <WorkerIdentitySection
            disabled={false}
            surface="onboarding"
            authoritativeSubmission={identitySubmission}
            onSubmitted={handleSubmitted}
          />
        </>
      ) : null}
    </AuthScreen>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
  return StyleSheet.create({
    block: { gap: spacing.md },
    line: { ...type.body, color: colors.textSecondary },
  });
}

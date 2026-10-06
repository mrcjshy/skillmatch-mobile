import { useState } from 'react';

import { AppButton } from '@/components/app-button';
import { FormMessage } from '@/components/form-message';
import { StateScreen } from '@/components/state-screen';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';

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
  const isChecking = !hasActiveError && isAccountLoading;

  return (
    <StateScreen
      tone={hasActiveError ? 'error' : 'neutral'}
      loading={isChecking}
      icon={{ android: 'error', ios: 'exclamationmark.circle' }}
      title={isChecking ? 'Checking your account' : "We couldn't set up your account"}
      message={statusMessage}
    >
      <AppButton
        label="Try again"
        onPress={retryAccountBootstrap}
        loading={isAccountLoading}
        disabled={isSigningOut}
      />
      <AppButton
        label="Sign out"
        variant="ghost"
        onPress={handleSignOut}
        loading={isSigningOut}
        disabled={isAccountLoading}
      />
      {signOutError ? <FormMessage tone="error" message={signOutError} /> : null}
    </StateScreen>
  );
}

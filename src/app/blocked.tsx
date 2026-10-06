import { useState } from 'react';

import { AppButton } from '@/components/app-button';
import { FormMessage } from '@/components/form-message';
import { StateScreen } from '@/components/state-screen';
import { signOutCurrentUser } from '@/lib/sign-out';

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
    <StateScreen
      tone="warning"
      icon={{ android: 'block', ios: 'nosign' }}
      title="Account inactive"
      message="Your SkillMatch account is currently inactive. Please contact the administrator for assistance."
    >
      <AppButton label="Sign out" onPress={handleSignOut} loading={isSigningOut} />
      {signOutError ? <FormMessage tone="error" message={signOutError} /> : null}
    </StateScreen>
  );
}

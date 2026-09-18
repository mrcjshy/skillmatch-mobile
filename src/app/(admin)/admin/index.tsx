import { useState } from 'react';
import { type Href, useRouter } from 'expo-router';

import { AppButton } from '@/components/app-button';
import { AppNotice } from '@/components/app-notice';
import { IdentityReviewQueue } from '@/components/identity-review-queue';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';

/**
 * Administrator Home = pending Worker ID review list.
 *
 * Approve/reject and ID preview live on Verification Details. Approve there
 * calls public.approve_worker_identity, which wraps verify_worker — the sole
 * writer of is_verified. This screen does not call verify_worker directly and
 * never uses getPublicUrl() for identity images.
 */
export default function AdminHome() {
  const router = useRouter();
  const { account } = useAccount();
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
    <IdentityReviewQueue
      adminId={account?.id}
      onSelectWorker={(userId) => {
        router.push({
          pathname: '/admin/verification-details',
          params: { userId },
        } as unknown as Href);
      }}
      header={
        <AppButton
          label="Reports"
          variant="secondary"
          onPress={() => router.push('/admin/reports' as unknown as Href)}
        />
      }
      footer={
        <>
          <AppButton
            label="Sign Out"
            variant="secondary"
            onPress={() => {
              void handleSignOut();
            }}
            loading={isSigningOut}
            disabled={isSigningOut}
          />
          {signOutError ? <AppNotice variant="danger" message={signOutError} /> : null}
        </>
      }
    />
  );
}

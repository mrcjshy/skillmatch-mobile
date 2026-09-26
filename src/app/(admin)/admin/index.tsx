import { useCallback, useEffect, useState } from 'react';
import { type Href, useFocusEffect, useRouter } from 'expo-router';

import { AdminAnalyticsDashboard } from '@/components/admin-analytics-dashboard';
import { AppButton } from '@/components/app-button';
import { AppNotice } from '@/components/app-notice';
import {
  AdminAnalyticsCoordinator, loadAdminAnalyticsSummary, type AdminAnalyticsView,
} from '@/lib/admin-analytics';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

export default function AdminHome() {
  const router = useRouter();
  const { account, status } = useAccount();
  const { session } = useSession();
  const sessionUserId = session?.user.id;
  const authorizedId =
    status === 'resolved' && account?.role === 'administrator' &&
    account.is_active && account.id === sessionUserId
      ? account.id
      : null;
  const [view, setView] = useState<AdminAnalyticsView>({
    ownerId: null, snapshot: null, loading: false, refreshing: false, error: null,
  });
  const [controller] = useState(
    () => new AdminAnalyticsCoordinator(loadAdminAnalyticsSummary, setView)
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (authorizedId === null) {
        controller.clear();
        return undefined;
      }
      controller.activate(authorizedId);
      return () => controller.deactivate();
    }, [authorizedId, controller])
  );

  useEffect(() => () => controller.dispose(), [controller]);

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

  // Do not pass a previous account's snapshot to the dashboard while the
  // focus effect invalidates that request lifetime.
  const visibleView: AdminAnalyticsView = authorizedId !== null && view.ownerId === authorizedId
    ? view
    : { ownerId: authorizedId, snapshot: null, loading: true, refreshing: false, error: null };

  return (
    <AdminAnalyticsDashboard
      view={visibleView}
      onRefresh={() => controller.refresh()}
      onRetry={() => controller.refresh()}
      onNotifications={() => router.push('/admin/notifications' as Href)}
      onIdentityReviews={() => router.push('/admin/identity-reviews' as Href)}
      onReports={() => router.push('/admin/reports' as Href)}
      onWorkers={() => router.push('/admin/workers' as Href)}
      onClients={() => router.push('/admin/clients' as Href)}
      footer={
        <>
          <AppButton
            label="Sign Out"
            variant="secondary"
            onPress={() => { void handleSignOut(); }}
            loading={isSigningOut}
            disabled={isSigningOut}
          />
          {signOutError ? <AppNotice variant="danger" message={signOutError} /> : null}
        </>
      }
    />
  );
}

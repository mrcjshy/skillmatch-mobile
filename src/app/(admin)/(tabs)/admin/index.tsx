import { useCallback, useEffect, useState } from 'react';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AdminAnalyticsDashboard } from '@/components/admin-analytics-dashboard';
import { AppButton } from '@/components/app-button';
import { AppNotice } from '@/components/app-notice';
import { FactRow } from '@/components/fact-row';
import { HomeStickyHeader } from '@/components/home-header';
import { RefinementThemeProvider } from '@/components/refinement-theme';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
import { SkillMatchTheme } from '@/constants/theme';
import {
  AdminAnalyticsCoordinator, loadAdminAnalyticsSummary, type AdminAnalyticsView,
} from '@/lib/admin-analytics';
import { signOutCurrentUser } from '@/lib/sign-out';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

const { colors, spacing } = SkillMatchTheme.ui;

/** The name the Admin Home greeting uses, whatever the account is called. */
const ADMIN_GREETING_NAME = 'Admin';

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
  const fullName = authorizedId !== null ? account?.full_name ?? '' : '';

  return (
    <RefinementThemeProvider>
      <View style={styles.screen}>
        {/* Compact and fixed: greeting and the bell. Admin has no Active booking block. The greeting
            addresses the role ("Good morning, Admin"), not the account's stored name, which stays
            unchanged and still shows under "Signed in as". Presentation only. */}
        <HomeStickyHeader name={authorizedId !== null ? ADMIN_GREETING_NAME : ''} role="admin" />
        <AdminAnalyticsDashboard
          view={visibleView}
          onRefresh={() => controller.refresh()}
          onRetry={() => controller.refresh()}
          onIdentityReviews={() => router.push('/admin/identity-reviews' as Href)}
          onReports={() => router.push('/admin/reports' as Href)}
          footer={
            // Quietly last: Sign out is an account action, not a Home destination.
            <View style={styles.account}>
              <SectionHeader title="Account" />
              <SurfaceGroup>
                <FactRow label="Signed in as" value={fullName || null} />
                <FactRow label="Role" value="Administrator" />
              </SurfaceGroup>
              <AppButton
                label="Sign out"
                variant="secondary"
                icon={{ android: 'logout', ios: 'rectangle.portrait.and.arrow.right' }}
                onPress={() => { void handleSignOut(); }}
                loading={isSigningOut}
                disabled={isSigningOut}
              />
              {signOutError ? <AppNotice variant="danger" message={signOutError} /> : null}
            </View>
          }
        />
      </View>
    </RefinementThemeProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  account: { gap: spacing.md },
});

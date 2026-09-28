import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';

import { AppCard } from '@/components/app-card';
import { InitialsAvatar } from '@/components/initials-avatar';
import { SkillMatchTheme } from '@/constants/theme';
import { isRecoverySurfaceActive } from '@/lib/auth-recovery';
import { loadClientBookings, loadWorkerBookings } from '@/lib/booking-records';
import { bannerRole, createIncomingMessageBanner } from '@/lib/incoming-message-banner';
import { readNewBookingMessages, seedBookingMessageCursor } from '@/lib/messages';
import { subscribeInvalidation } from '@/lib/realtime';
import { canEnterWorkerApp } from '@/lib/worker-onboarding';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

const { colors, spacing } = SkillMatchTheme.ui;

/** One foreground presentation host, independent of persistent notification/push intents. */
export function IncomingMessageBannerHost() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const insets = useSafeAreaInsets();
  const { account, status, hasCurrentConsent, workerOnboardingState } = useAccount();
  const { session, isSessionLoading, recoveryStatus } = useSession();
  const controller = useMemo(() => createIncomingMessageBanner({
    loadBookings: role => role === 'worker' ? loadWorkerBookings() : loadClientBookings(),
    seed: seedBookingMessageCursor,
    read: readNewBookingMessages,
    subscribe: subscribeInvalidation,
    navigate: route => router.push(route),
  }), [router]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => null);
  const resolvedRole = bannerRole({ sessionId: session?.user.id ?? null, status, account });
  const role = !isSessionLoading && !isRecoverySurfaceActive(recoveryStatus) && hasCurrentConsent === true &&
    (resolvedRole !== 'worker' || canEnterWorkerApp(workerOnboardingState)) ? resolvedRole : null;
  const accountId = role === null ? null : account?.id ?? null;
  const bookingId = typeof params.bookingId === 'string' ? params.bookingId : null;
  // Include all route parameters: same-path/different-booking and unrelated navigation both clear.
  const routeKey = JSON.stringify([pathname, Object.keys(params).sort().map(key => [key, params[key]])]);
  // Only host/controller termination ends the observation. Ordinary eligible
  // navigation updates context below while preserving the Booking baselines.
  useLayoutEffect(() => () => controller.stop(), [controller]);
  useLayoutEffect(() => {
    const update = (state: string | null) => {
      controller.updateContext({ accountId, role, active: state === 'active', pathname, bookingId, routeKey });
    };
    // Handle both edges directly. A rapid background/foreground pair must not
    // depend on React rendering an intermediate background snapshot.
    const subscription = AppState.addEventListener('change', update);
    update(AppState.currentState);
    return () => { subscription.remove(); };
  }, [controller, accountId, role, pathname, bookingId, routeKey]);

  // Render gating also protects the interval before layout-effect cleanup on a context change.
  if (!snapshot || AppState.currentState !== 'active' || role === null || snapshot.role !== role ||
      snapshot.accountId !== accountId || snapshot.routeKey !== routeKey) return null;

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + spacing.sm }]}>
      <AppCard style={styles.card}>
        <XStack style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`New message from ${snapshot.name}. Open booking chat`}
            onPress={() => { void controller.tap(); }}
            style={styles.open}
          >
            <XStack style={styles.row}>
              <InitialsAvatar name={snapshot.name} initials={snapshot.initials} size={40}
                accent={role === 'worker' ? colors.accentClient : colors.accentWorker} />
              <YStack style={styles.copy}>
                <Text numberOfLines={1} style={styles.name}>{snapshot.name}</Text>
                <Text style={styles.message}>New message</Text>
              </YStack>
            </XStack>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss new message"
            onPress={controller.dismiss} style={styles.dismiss}>
            <Text style={styles.close}>×</Text>
          </Pressable>
        </XStack>
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: spacing.gutter, right: spacing.gutter, zIndex: 1000, elevation: 12 },
  card: { borderWidth: 1, borderColor: colors.border, elevation: 8, padding: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  open: { flex: 1, padding: spacing.sm, minHeight: 48 },
  copy: { flex: 1, gap: 2 },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  message: { color: colors.textSecondary, fontSize: 14 },
  dismiss: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  close: { color: colors.textSecondary, fontSize: 24 },
});

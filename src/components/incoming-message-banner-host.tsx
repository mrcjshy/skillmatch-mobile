import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSymbol } from '@/components/app-symbol';
import { InitialsAvatar } from '@/components/initials-avatar';
import { MotionView, useMotion } from '@/components/motion';
import { SkillMatchTheme } from '@/constants/theme';
import { isRecoverySurfaceActive } from '@/lib/auth-recovery';
import { loadClientBookings, loadWorkerBookings } from '@/lib/booking-records';
import { bannerRole, createIncomingMessageBanner } from '@/lib/incoming-message-banner';
import { readNewBookingMessages, seedBookingMessageCursor } from '@/lib/messages';
import { subscribeInvalidation } from '@/lib/realtime';
import { canEnterWorkerApp } from '@/lib/worker-onboarding';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

const { colors, type, spacing, radius, size, elevation } = SkillMatchTheme.ui;

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
  // Presentation only: the banner drops in and lifts away. Its timer, routing and push are unchanged.
  const motion = useMotion();
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

  // Lightweight snackbar, not a card: one raised row (who, what, the action) that floats over the
  // screen with the floating elevation and goes away on tap, dismiss, route change or its own timer.
  return (
    <MotionView entering={motion.bannerEnter} exiting={motion.bannerExit}
      pointerEvents="box-none" style={[styles.overlay, { top: insets.top + spacing.sm }]}>
      <View accessibilityLiveRegion="polite" style={styles.snackbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`New message from ${snapshot.name}. Open booking chat`}
          onPress={() => { void controller.tap(); }}
          style={({ pressed }) => [styles.open, pressed ? styles.openPressed : null]}
        >
          <InitialsAvatar name={snapshot.name} initials={snapshot.initials} size={36}
            accent={role === 'worker' ? colors.accentSubtle : colors.accentSubtle} />
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.name}>{snapshot.name}</Text>
            <Text style={styles.message}>New message</Text>
          </View>
          <Text style={styles.action}>Open</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss new message"
          onPress={controller.dismiss} style={styles.dismiss}>
          <AppSymbol synchronousGlyph pointerEvents="none" accessible={false}
            name={{ android: 'close', ios: 'xmark' }} size={20} tintColor={colors.textSecondary} />
        </Pressable>
      </View>
    </MotionView>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: spacing.gutter, right: spacing.gutter, zIndex: 1000, elevation: 12 },
  snackbar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.listRowMinHeight,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderCurve: 'continuous',
    ...elevation.floating,
  },
  open: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: size.minTarget,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    borderRadius: radius.control,
  },
  openPressed: { backgroundColor: colors.surfaceSunken },
  copy: { flex: 1, minWidth: 0 },
  name: { ...type.bodyEmphasis, color: colors.textPrimary },
  message: { ...type.helper, color: colors.textSecondary },
  action: { ...type.label, color: colors.accent },
  dismiss: { minWidth: size.minTarget, minHeight: size.minTarget, alignItems: 'center', justifyContent: 'center' },
});

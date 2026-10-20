import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { pickPrimaryHomeBooking } from '@/components/active-booking-home-card';
import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import type { BookingRole, RoleBooking } from '@/lib/booking-records';
import { formatCardDateTime } from '@/lib/date-time';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

type DockProps = {
  role: BookingRole;
  bookings: readonly RoleBooking[];
  /** Kept for the Home screens' contract; the dock itself no longer reads bookings. */
  onBookings?: (rows: RoleBooking[]) => void;
  onPressPrimary: (booking: RoleBooking) => void;
  onPressViewAll?: () => void;
};

/**
 * The Home dock for the primary confirmed booking (UI-V3, owner direction 2026-10-20). A tap or a swipe up opens
 * the booking's map-first Booking details (the full map with its swipe-up panel) directly. The former intermediate
 * "Active booking" sheet repeated that booking and is gone, along with its own protected reads; Booking details
 * owns the authorized booking, location and live-location lifetimes.
 */
export function ActiveBookingHomeDock(props: DockProps) {
  const { account, status, hasCurrentConsent } = useAccount();
  const { session, sessionRevision, sessionLifetime, isSessionRevisionCurrent,
    isSessionLoading, sessionError, recoveryStatus } = useSession();
  const authorized = () => Boolean(status === 'resolved' && hasCurrentConsent && account?.is_active &&
    account.role === props.role && account.id === session?.user.id && !isSessionLoading && !sessionError && recoveryStatus === 'idle' &&
    sessionLifetime?.ownerId === account.id && sessionLifetime.isCurrent() && sessionRevision !== undefined && isSessionRevisionCurrent?.(sessionRevision));
  const primary = pickPrimaryHomeBooking(props.bookings);
  if (!authorized() || !primary) return null;
  return <BookingDock key={`${account!.id}:${props.role}:${sessionRevision}:${primary.booking_id}:${primary.job_id}`}
    {...props} primary={primary} authorized={authorized} />;
}

function BookingDock(props: DockProps & { primary: RoleBooking; authorized: () => boolean }) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const currentProps = useRef(props);
  const focused = useRef(false);
  const mounted = useRef(true);
  useLayoutEffect(() => { currentProps.current = props; });
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  // Navigation is offered only while this Home is focused, foreground and still authorized for this account.
  const open = useCallback(() => {
    const current = currentProps.current;
    if (mounted.current && focused.current && AppState.currentState === 'active' && current.authorized()) current.onPressPrimary(current.primary);
  }, []);
  // eslint-disable-next-line react-hooks/refs -- PanResponder stores handlers; refs are read only during a gesture.
  const gesture = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, { dx, dy }) => dy < -12 && -dy > Math.abs(dx) * 1.5,
    onPanResponderRelease: (_event, { dx, dy }) => { if (dy < -48 && -dy > Math.abs(dx) * 1.5) open(); },
  }), [open]);
  const schedule = formatCardDateTime(props.primary.job_scheduled_at);

  return (
    <View style={styles.dock} {...gesture.panHandlers}>
      <Pressable onPress={open}
        accessibilityRole="button" accessibilityLabel={`Active booking: ${props.primary.job_title}. Confirmed${schedule ? `. ${schedule}` : ''}`}
        accessibilityHint="Opens the booking on the map. You can also swipe up."
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.copy}>
          <View style={styles.heading}>
            <Text style={styles.label}>Active booking</Text>
            <Text style={styles.status}>Confirmed</Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>{props.primary.job_title}</Text>
          {schedule ? <Text style={styles.meta}>{schedule}</Text> : null}
        </View>
        <AppSymbol name={{ android: 'map', ios: 'map' }} size={24} tintColor={ui.colors.textSecondary} />
      </Pressable>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
  return StyleSheet.create({
    // A flex sibling below Home's scrolling viewport; the navigator owns its own inset and height.
    dock: { flexShrink: 0, paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: spacing.sm, backgroundColor: colors.canvas },
    card: { minHeight: size.minTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
      backgroundColor: colors.surfaceRaised, borderColor: colors.hairline, borderWidth: 1, borderRadius: radius.card },
    pressed: { backgroundColor: colors.surfaceSunken },
    copy: { flex: 1, minWidth: 0, gap: spacing.xs },
    heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
    label: { ...type.label, color: colors.textSecondary, flexShrink: 1 },
    status: { ...type.helper, color: colors.info, flexShrink: 1 },
    title: { ...type.bodyEmphasis, color: colors.textPrimary },
    meta: { ...type.helper, color: colors.textSecondary },
  });
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { homeBookingCounterpart, homeConfirmedBookings, pickPrimaryHomeBooking } from '@/components/active-booking-home-card';
import { AppButton } from '@/components/app-button';
import { AppSheet } from '@/components/app-sheet';
import { AppSymbol } from '@/components/app-symbol';
import { InitialsAvatar } from '@/components/initials-avatar';
import { StaticJobMap } from '@/components/job-location-map';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { loadClientBookings, loadWorkerBookings, type BookingRole, type RoleBooking } from '@/lib/booking-records';
import { formatBudget, formatLocation } from '@/lib/bookings';
import { formatCardDateTime } from '@/lib/date-time';
import { createHomeBookingSheet } from '@/lib/home-booking-sheet';
import { getAuthorizedJobLocation } from '@/lib/job-location';
import { BOOKING_STATUS_CHANGED, bookingMessagesTopic, subscribeInvalidation } from '@/lib/realtime';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

type DockProps = {
  role: BookingRole;
  bookings: readonly RoleBooking[];
  onBookings: (rows: RoleBooking[]) => void;
  onPressPrimary: (booking: RoleBooking) => void;
  onPressViewAll: () => void;
};

/** The Home owns the list; this surface owns only an expansion's protected read lifetime. */
export function ActiveBookingHomeDock(props: DockProps) {
  const { account, status, hasCurrentConsent } = useAccount();
  const { session, sessionRevision, sessionLifetime, isSessionRevisionCurrent, subscribeSessionLifecycle,
    isSessionLoading, sessionError, recoveryStatus } = useSession();
  const authorized = () => Boolean(status === 'resolved' && hasCurrentConsent && account?.is_active &&
    account.role === props.role && account.id === session?.user.id && !isSessionLoading && !sessionError && recoveryStatus === 'idle' &&
    sessionLifetime?.ownerId === account.id && sessionLifetime.isCurrent() && sessionRevision !== undefined && isSessionRevisionCurrent?.(sessionRevision));
  const primary = pickPrimaryHomeBooking(props.bookings);
  if (!authorized() || !primary) return null;
  return <BookingDock key={`${account!.id}:${props.role}:${sessionRevision}:${primary.booking_id}:${primary.job_id}`}
    {...props} primary={primary} authorized={authorized} subscribeSessionLifecycle={subscribeSessionLifecycle} />;
}

function BookingDock(props: DockProps & {
  primary: RoleBooking;
  authorized: () => boolean;
  subscribeSessionLifecycle?: (listener: () => void) => () => void;
}) {
  const ui = useUiTheme();
  const styles = createStyles(ui);
  const currentProps = useRef(props);
  const mounted = useRef(true);
  const focused = useRef(false);
  useLayoutEffect(() => { currentProps.current = props; });
  const isCurrent = () => mounted.current && focused.current && AppState.currentState === 'active' && currentProps.current.authorized();
  // eslint-disable-next-line react-hooks/refs -- The factory stores these callbacks; it never calls them during render.
  const [sheet] = useState(() => createHomeBookingSheet({
    bookingId: props.primary.booking_id,
    jobId: props.primary.job_id,
    isCurrent,
    readBookings: props.role === 'worker' ? loadWorkerBookings : loadClientBookings,
    readLocation: getAuthorizedJobLocation,
    onBookings: rows => currentProps.current.onBookings(rows),
    onNavigate: (action, booking) => {
      if (isCurrent()) {
        if (action === 'details') currentProps.current.onPressPrimary(booking);
        else currentProps.current.onPressViewAll();
      }
    },
  }));
  const state = useSyncExternalStore(sheet.subscribe, sheet.snapshot, sheet.snapshot);
  const { subscribeSessionLifecycle } = props;

  useLayoutEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeSessionLifecycle?.(sheet.collapse);
    return () => { mounted.current = false; sheet.collapse(); unsubscribe?.(); };
  }, [sheet, subscribeSessionLifecycle]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    const listener = AppState.addEventListener('change', () => sheet.collapse());
    return () => { focused.current = false; sheet.collapse(); listener.remove(); };
  }, [sheet]));

  const gesture = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, { dx, dy }) => dy < -12 && -dy > Math.abs(dx) * 1.5,
    onPanResponderRelease: (_event, { dx, dy }) => { if (dy < -48 && -dy > Math.abs(dx) * 1.5) sheet.expand(); },
  }), [sheet]);
  const schedule = formatCardDateTime(props.primary.job_scheduled_at);
  const multiple = homeConfirmedBookings(props.bookings).length > 1;
  const booking = state.booking;
  const counterpart = booking ? homeBookingCounterpart(props.role, booking) : null;
  const bookingSchedule = booking ? formatCardDateTime(booking.job_scheduled_at) : null;
  const budget = booking ? formatBudget(booking.job_budget) : null;
  const area = state.location ? formatLocation(state.location.barangay, state.location.city) : null;
  const areaCaption = area && !state.location?.address?.toLowerCase().includes(area.toLowerCase()) ? area : null;
  const expanded = state.expanded && props.authorized();
  const bookingId = props.primary.booking_id;
  useEffect(() => {
    if (!expanded) return;
    return subscribeInvalidation({
      topic: bookingMessagesTopic(bookingId),
      events: [BOOKING_STATUS_CHANGED],
      // Includes subscribe/reconnect catch-up. Revalidation synchronously conceals private fields.
      onInvalidate: sheet.revalidate,
      onUnavailable: sheet.collapse,
    });
  }, [expanded, bookingId, sheet]);

  return (
    <View style={styles.dock} {...gesture.panHandlers}>
      <Pressable onPress={sheet.expand}
        accessibilityRole="button" accessibilityLabel={`Active booking: ${props.primary.job_title}. Confirmed${schedule ? `. ${schedule}` : ''}`}
        accessibilityHint="Expand booking summary" accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.copy}>
          <View style={styles.heading}>
            <Text style={styles.label}>Active booking</Text>
            <Text style={styles.status}>Confirmed</Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>{props.primary.job_title}</Text>
          {schedule ? <Text style={styles.meta}>{schedule}</Text> : null}
        </View>
        <AppSymbol name={{ android: 'expand_less', ios: 'chevron.up' }} size={24} tintColor={ui.colors.textSecondary} />
      </Pressable>
      <AppSheet visible={expanded} title="Active booking" onClose={sheet.collapse} swipeToClose>
        {/* Remove private children immediately, including during the sheet's exit animation. */}
        {expanded ? state.status === 'loading' ? (
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading active booking" accessibilityState={{ busy: true }} style={styles.details}>
            <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.summary}>
              <View style={[styles.placeholder, styles.placeholderShort]} />
              <View style={styles.placeholder} />
              <View style={[styles.placeholder, styles.placeholderShort]} />
            </View>
            <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.placeholder, styles.placeholderMap]} />
            <Text style={styles.meta}>Loading booking…</Text>
          </View>
        ) : booking ? (
          <View style={styles.details}>
            <View style={styles.summary}>
              <View style={styles.summaryHeading}>
                <View style={styles.summaryCopy}>
                  <View style={styles.inline}>
                    <AppSymbol accessible={false} name={{ android: 'check_circle', ios: 'checkmark.circle.fill' }} size={ui.size.icon} tintColor={ui.colors.accent} />
                    <Text style={styles.confirmed}>Confirmed</Text>
                  </View>
                  <Text accessibilityRole="header" style={styles.jobTitle}>{booking.job_title}</Text>
                </View>
                <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.serviceIcon}>
                  <AppSymbol name={{ android: 'handyman', ios: 'wrench.and.screwdriver' }} size={ui.size.tabIcon} tintColor={ui.colors.accent} />
                </View>
              </View>
              {bookingSchedule ? (
                <View accessible accessibilityLabel={`Schedule: ${bookingSchedule}`} style={styles.schedule}>
                  <AppSymbol accessible={false} name={{ android: 'schedule', ios: 'clock' }} size={ui.size.icon} tintColor={ui.colors.accent} />
                  <Text style={styles.scheduleText}>{bookingSchedule}</Text>
                </View>
              ) : null}
            </View>

            {counterpart?.name ? (
              <View accessible accessibilityLabel={`${counterpart.label}: ${counterpart.name}`} style={styles.counterpart}>
                <View importantForAccessibility="no-hide-descendants">
                  <InitialsAvatar name={counterpart.name} accent={ui.colors.accentSubtle} size={ui.size.minTarget} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.meta}>{props.role === 'worker' ? 'Your client' : 'Your worker'}</Text>
                  <Text style={styles.personName}>{counterpart.name}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.locationSection}>
              <View style={styles.inline}>
                <AppSymbol accessible={false} name={{ android: 'location_on', ios: 'mappin' }} size={ui.size.icon} tintColor={ui.colors.accent} />
                <Text accessibilityRole="header" style={styles.sectionTitle}>Service location</Text>
              </View>
              {state.location?.pin ? <StaticJobMap pin={state.location.pin} accessibilityLabel="Exact confirmed service location" /> : (
                <View style={styles.locationUnavailable}>
                  <AppSymbol accessible={false} name={{ android: 'location_off', ios: 'mappin.slash' }} size={ui.size.tabIcon} tintColor={ui.colors.textSecondary} />
                  <View style={styles.copy}>
                    <Text style={styles.personName}>Location unavailable</Text>
                    <Text style={styles.meta}>An exact map pin is not available for this booking.</Text>
                  </View>
                </View>
              )}
              {state.location?.address || areaCaption ? (
                <View style={styles.address}>
                  {state.location?.address ? <Text style={styles.addressText}>{state.location.address}</Text> : null}
                  {areaCaption ? <Text style={styles.meta}>{areaCaption}</Text> : null}
                </View>
              ) : null}
            </View>

            {budget || booking.payment_status ? (
              <View style={styles.money}>
                {budget ? <View accessible accessibilityLabel={`Job budget: ${budget}`} style={styles.moneyItem}>
                  <Text style={styles.meta}>Job budget</Text>
                  <Text style={styles.amount}>{budget}</Text>
                </View> : null}
                {booking.payment_status ? <View accessible accessibilityLabel={`Payment status: ${booking.payment_status}`} style={styles.moneyItem}>
                  <Text style={styles.meta}>Payment status</Text>
                  <Text style={styles.payment}>{booking.payment_status}</Text>
                </View> : null}
              </View>
            ) : null}
            <View style={styles.actions}>
              <AppButton label="View booking details" onPress={() => sheet.navigate('details')} />
              {multiple ? <AppButton label="View all bookings" variant="ghost" onPress={() => sheet.navigate('all')} /> : null}
            </View>
          </View>
        ) : null : null}
      </AppSheet>
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
    details: { gap: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm },
    summary: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.card, backgroundColor: colors.accentSubtle },
    summaryHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    summaryCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
    inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    confirmed: { ...type.label, color: colors.accent, flexShrink: 1 },
    jobTitle: { ...type.screenTitle, color: colors.textPrimary },
    serviceIcon: { width: size.actionCircle, height: size.actionCircle, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    schedule: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.accentSubtlePressed },
    scheduleText: { ...type.label, color: colors.accent, flex: 1 },
    counterpart: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    personName: { ...type.bodyEmphasis, color: colors.textPrimary },
    locationSection: { gap: spacing.sm },
    sectionTitle: { ...type.bodyEmphasis, color: colors.textPrimary, flexShrink: 1 },
    locationUnavailable: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.surfaceSunken },
    address: { gap: spacing.xs, paddingHorizontal: spacing.xs },
    addressText: { ...type.body, color: colors.textPrimary },
    // Each fact can wrap onto its own line at large font scales or on a narrow window.
    money: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.canvas },
    moneyItem: { flex: 1, minWidth: 120, gap: spacing.xs },
    amount: { ...type.money, color: colors.textPrimary },
    payment: { ...type.bodyEmphasis, color: colors.textPrimary, textTransform: 'capitalize' },
    actions: { gap: spacing.xs },
    placeholder: { height: type.body.lineHeight, borderRadius: radius.sm, backgroundColor: colors.accentSubtlePressed },
    placeholderShort: { width: '55%' },
    placeholderMap: { height: size.mapApproxHeight, borderRadius: radius.card, backgroundColor: colors.surfaceSunken },
  });
}

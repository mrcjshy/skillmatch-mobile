import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppSymbol } from '@/components/app-symbol';
import { BookingCompactCard } from '@/components/booking-compact-card';
import { SectionHeader } from '@/components/section-header';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import { type BaseBooking, type BookingRole, type RoleBooking } from '@/lib/booking-records';
import { formatBookingStatus } from '@/lib/bookings';
import { formatCardDateTime } from '@/lib/date-time';



/**
 * V3-1 P5 — confirmed Booking Home card.
 *
 * Selection lives here so `booking-records.ts` stays the RPC/row contract
 * and does not grow Home-only ranking. The card never loads or mutates:
 * callers pass the already-fetched list and handle navigation.
 */

export type ActiveBookingHomeCardProps = {
  role: BookingRole;
  bookings: readonly RoleBooking[];
  onPressPrimary: (booking: RoleBooking) => void;
  onPressViewAll?: () => void;
  featured?: boolean;
  /** Small Home-only summary; selection and detail navigation are unchanged. */
  compact?: boolean;
};

/** The other participant's name as the participant RPC already returns it to this role. */
export function homeBookingCounterpart(role: BookingRole, booking: RoleBooking): { label: 'Client' | 'Worker'; name: string } | null {
  if (role === 'worker' && 'client_full_name' in booking && booking.client_full_name) return { label: 'Client', name: booking.client_full_name };
  if (role === 'client' && 'worker_full_name' in booking && booking.worker_full_name) return { label: 'Worker', name: booking.worker_full_name };
  return null;
}

export function homeConfirmedBookings<T extends BaseBooking>(
  bookings: readonly T[]
): T[] {
  return bookings.filter((booking) => booking.booking_status === 'confirmed');
}

/**
 * Among `confirmed` rows only: soonest `job_scheduled_at` (nulls last),
 * then `booked_at` DESC (nulls last), then `booking_id` DESC.
 */
export function pickPrimaryHomeBooking<T extends BaseBooking>(
  bookings: readonly T[]
): T | null {
  const confirmed = homeConfirmedBookings(bookings);
  if (confirmed.length === 0) return null;
  return [...confirmed].sort(comparePrimaryHomeBookings)[0] ?? null;
}

export function ActiveBookingHomeCard({
  role,
  bookings,
  onPressPrimary,
  onPressViewAll,
  featured = true,
  compact = false,
}: ActiveBookingHomeCardProps) {
  const ui = useUiTheme();
  const { styles } = createStyles(ui);

  const confirmed = homeConfirmedBookings(bookings);
  const primary = pickPrimaryHomeBooking(confirmed);
  if (primary === null) return null;

  const extraCount = confirmed.length - 1;

  if (compact) {
    // Sticky Home summary: a divider, one label row with View all, and one two-line row. No card.
    const status = formatBookingStatus(primary.booking_status);
    const schedule = formatCardDateTime(primary.job_scheduled_at);
    const counterpart = homeBookingCounterpart(role, primary);
    const meta = [status, schedule, counterpart ? `${counterpart.label}: ${counterpart.name}` : null].filter(Boolean).join(' · ');
    return (
      <View style={styles.compactSection}>
        <View style={styles.compactHeader}>
          <Text style={styles.compactLabel} accessibilityRole="header">
            {confirmed.length > 1 ? `Active bookings · ${confirmed.length}` : 'Active booking'}
          </Text>
          {onPressViewAll ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all active bookings"
              onPress={onPressViewAll}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
            >
              <Text style={styles.viewAllText}>View all</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Active booking: ${primary.job_title}, ${meta}. View booking details`}
          onPress={() => onPressPrimary(primary)}
          style={({ pressed }) => [styles.compact, pressed && styles.compactPressed]}
        >
          <View style={styles.compactCopy}>
            <Text style={styles.compactTitle} numberOfLines={1}>{primary.job_title}</Text>
            <Text style={styles.compactMeta} numberOfLines={2}>{meta}</Text>
          </View>
          <AppSymbol name={{ android: 'chevron_right', ios: 'chevron.right' }} size={20} tintColor={ui.colors.textSecondary} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <SectionHeader
        title="Active booking"
        style={styles.header}
        trailing={
          extraCount > 0 ? (
            <AppButton
              variant="ghost"
              label="View all"
              onPress={onPressViewAll}
              accessibilityLabel="View all confirmed bookings"
            />
          ) : undefined
        }
      />
      <View style={styles.cardPad}>
        <BookingCompactCard
          role={role}
          booking={primary}
          onPress={() => onPressPrimary(primary)}
          featured={featured}
        />
      </View>
      {extraCount > 0 ? (
        <Text
          style={styles.more}
          accessibilityRole="text"
          accessibilityLabel={
            extraCount === 1
              ? '1 more confirmed booking'
              : `${extraCount} more confirmed bookings`
          }
        >
          +{extraCount} more
        </Text>
      ) : null}
    </View>
  );
}

function comparePrimaryHomeBookings<T extends BaseBooking>(a: T, b: T): number {
  const scheduled = compareNullableAsc(
    timestampMs(a.job_scheduled_at),
    timestampMs(b.job_scheduled_at)
  );
  if (scheduled !== 0) return scheduled;

  const booked = compareNullableDesc(timestampMs(a.booked_at), timestampMs(b.booked_at));
  if (booked !== 0) return booked;

  if (a.booking_id === b.booking_id) return 0;
  return a.booking_id > b.booking_id ? -1 : 1;
}

function timestampMs(value: string | null): number | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function compareNullableAsc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareNullableDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing } = ui;
const styles = StyleSheet.create({
  compactSection: {
    marginTop: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline,
  },
  compactHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  compactLabel: { ...type.label, color: colors.textSecondary, flexShrink: 1 },
  // 32dp visible height; the hit slop keeps the 48dp touch target.
  viewAll: { minHeight: 32, justifyContent: 'center', paddingHorizontal: spacing.xs, borderRadius: ui.radius.sm },
  viewAllPressed: { backgroundColor: colors.surfaceSunken },
  viewAllText: { ...type.label, color: colors.accent },
  compact: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: ui.size.listRowMinHeight, paddingVertical: spacing.xs, borderRadius: ui.radius.sm,
  },
  compactPressed: { backgroundColor: colors.surfaceSunken },
  compactCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  compactTitle: { ...type.bodyEmphasis, color: colors.textPrimary },
  compactMeta: { ...type.helper, color: colors.textSecondary },
  wrap: {
    gap: spacing.xs,
  },
  header: {
    paddingHorizontal: spacing.gutter,
  },
  cardPad: {
    paddingHorizontal: spacing.gutter,
  },
  more: {
    paddingHorizontal: spacing.gutter,
    ...type.helper,
    color: colors.textSecondary,
  },
});

  return { styles };
}

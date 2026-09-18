import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { BookingCompactCard } from '@/components/booking-compact-card';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { type BaseBooking, type BookingRole, type RoleBooking } from '@/lib/booking-records';

const { colors, type, spacing } = SkillMatchTheme.ui;

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
};

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
}: ActiveBookingHomeCardProps) {
  const confirmed = homeConfirmedBookings(bookings);
  const primary = pickPrimaryHomeBooking(confirmed);
  if (primary === null) return null;

  const extraCount = confirmed.length - 1;

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

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
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

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppChip } from '@/components/app-chip';
import { SkillMatchTheme } from '@/constants/theme';
import {
  formatBookingStatus,
  formatBudget,
  formatLocation,
  formatTimestamp,
  isCounterpartyReleased,
} from '@/lib/bookings';
import {
  BookingRole,
  RoleBooking,
  isClientBooking,
  isWorkerBooking,
} from '@/lib/booking-records';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

function counterpartySummary(role: BookingRole, booking: RoleBooking): string | null {
  if (!isCounterpartyReleased(booking.booking_status)) return null;
  if (role === 'worker' && isWorkerBooking(booking)) {
    return booking.client_full_name ? `Client: ${booking.client_full_name}` : null;
  }
  if (role === 'client' && isClientBooking(booking)) {
    return booking.worker_full_name ? `Worker: ${booking.worker_full_name}` : null;
  }
  return null;
}

export function BookingCompactCard({
  role,
  booking,
  onPress,
}: {
  role: BookingRole;
  booking: RoleBooking;
  onPress: () => void;
}) {
  const isHistory =
    booking.booking_status === 'completed' ||
    booking.booking_status === 'cancelled' ||
    booking.booking_status === 'no_show';
  const schedule = formatTimestamp(booking.job_scheduled_at);
  const completedAt = formatTimestamp(booking.completed_at);
  const timestamp = booking.booking_status === 'completed' ? completedAt ?? schedule : schedule;
  const budget = formatBudget(booking.job_budget);
  // Compact cards intentionally omit the exact street address.
  const generalLocation = formatLocation(booking.job_barangay, booking.job_city);
  const counterparty = counterpartySummary(role, booking);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isHistory ? styles.historyCard : null,
        pressed ? styles.pressed : null,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${booking.job_title}, ${formatBookingStatus(booking.booking_status)}. View booking details`}
    >
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={2}>{booking.job_title}</Text>
        <AppChip
          label={formatBookingStatus(booking.booking_status)}
          variant={isHistory ? 'neutral' : 'positive'}
        />
      </View>

      {timestamp ? <Text style={styles.primaryLine}>{timestamp}</Text> : null}
      <View style={styles.metaRow}>
        {budget ? <Text style={styles.meta}>{budget}</Text> : null}
        {generalLocation ? <Text style={styles.meta} numberOfLines={1}>{generalLocation}</Text> : null}
      </View>
      {counterparty ? <Text style={styles.counterparty} numberOfLines={1}>{counterparty}</Text> : null}

      <Text style={styles.affordance}>View details →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  historyCard: {
    backgroundColor: colors.surfaceSubtle,
  },
  pressed: { opacity: 0.72 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: {
    flex: 1,
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  primaryLine: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  meta: {
    ...type.helper,
    color: colors.textSecondary,
  },
  counterparty: {
    ...type.helper,
    color: colors.textSecondary,
  },
  affordance: {
    ...type.bodyEmphasis,
    color: colors.primary,
  },
});

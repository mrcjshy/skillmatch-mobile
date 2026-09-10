import { Pressable, StyleSheet, Text, View } from 'react-native';

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
        isHistory ? styles.historyCard : styles.activeCard,
        pressed ? styles.pressed : null,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${booking.job_title}, ${formatBookingStatus(booking.booking_status)}. View booking details`}
    >
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={2}>{booking.job_title}</Text>
        <View style={[styles.statusPill, isHistory ? styles.historyPill : styles.activePill]}>
          <Text style={[styles.statusText, isHistory ? styles.historyStatusText : null]}>
            {formatBookingStatus(booking.booking_status)}
          </Text>
        </View>
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
    backgroundColor: SkillMatchTheme.surface.default,
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.card,
    padding: SkillMatchTheme.spacing.cardPadding,
    gap: 9,
  },
  activeCard: { borderLeftWidth: 4, borderLeftColor: SkillMatchTheme.brand.primary },
  historyCard: { backgroundColor: SkillMatchTheme.surface.subtle },
  pressed: { opacity: 0.72 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { flex: 1, color: SkillMatchTheme.text.primary, fontSize: 17, fontWeight: '700' },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  activePill: { backgroundColor: SkillMatchTheme.brand.primaryMuted },
  historyPill: { backgroundColor: SkillMatchTheme.surface.default },
  statusText: { color: SkillMatchTheme.brand.primary, fontSize: 12, fontWeight: '700' },
  historyStatusText: { color: SkillMatchTheme.text.secondary },
  primaryLine: { color: SkillMatchTheme.text.primary, fontSize: 14, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  meta: { color: SkillMatchTheme.text.secondary, fontSize: 13 },
  counterparty: { color: SkillMatchTheme.text.secondary, fontSize: 13 },
  affordance: { color: SkillMatchTheme.brand.primary, fontSize: 14, fontWeight: '700' },
});

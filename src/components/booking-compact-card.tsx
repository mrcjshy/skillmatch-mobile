import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppChip } from '@/components/app-chip';
import { AppSymbol as SymbolView } from '@/components/app-symbol';
import { DateLandmark } from '@/components/date-landmark';
import { groupedRowStyle, type GroupPosition } from '@/components/grouped-row';
import { ServiceMark } from '@/components/service-mark';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
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
import { bookingStatusVariant } from '@/lib/status-presentation';

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

/**
 * A booking as one row of a grouped list: date landmark, title, when, who, where, status and
 * budget. `position` places it in its group (one surface made of rows); `featured` is the Home
 * summary, a single row that omits the secondary identity and area.
 */
export function BookingCompactCard({
  role,
  booking,
  onPress,
  featured = false,
  position = 'only',
}: {
  role: BookingRole;
  booking: RoleBooking;
  onPress: () => void;
  featured?: boolean;
  position?: GroupPosition;
}) {
  const ui = useUiTheme();
  const { colors } = ui;
  const styles = createStyles(ui);

  const schedule = formatTimestamp(booking.job_scheduled_at);
  const completedAt = formatTimestamp(booking.completed_at);
  const timestamp = booking.booking_status === 'completed' ? completedAt ?? schedule : schedule;
  const budget = formatBudget(booking.job_budget);
  // Compact rows intentionally omit the exact street address.
  const generalLocation = formatLocation(booking.job_barangay, booking.job_city);
  const counterparty = featured ? null : counterpartySummary(role, booking);
  const dateValue = booking.booking_status === 'completed' ? booking.completed_at ?? booking.job_scheduled_at : booking.job_scheduled_at;
  const hasDate = dateValue !== null && !Number.isNaN(new Date(dateValue).getTime());

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${booking.job_title}, ${formatBookingStatus(booking.booking_status)}. View booking details`}
      style={({ pressed }) => [
        styles.row,
        groupedRowStyle(ui, position),
        pressed ? styles.pressed : null,
      ]}
    >
      {hasDate ? <DateLandmark value={dateValue} compact /> : <ServiceMark subject={booking.job_title} />}
      <View style={styles.copy}>
        <Text style={styles.title}>{booking.job_title}</Text>
        {timestamp ? <Text style={styles.primaryLine}>{timestamp}</Text> : null}
        {counterparty ? <Text style={styles.secondary}>{counterparty}</Text> : null}
        {!featured && generalLocation ? <Text style={styles.secondary}>{generalLocation}</Text> : null}
        <View style={styles.metaRow}>
          <AppChip label={formatBookingStatus(booking.booking_status)} variant={bookingStatusVariant(booking.booking_status)} />
          {budget ? <Text style={styles.budget}>{budget}</Text> : null}
        </View>
      </View>
      <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right' }} size={20} tintColor={colors.textSecondary} />
    </Pressable>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, size } = ui;
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      minHeight: size.listRowMinHeight,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      maxWidth: '100%',
    },
    pressed: { backgroundColor: colors.surfaceSunken },
    copy: { flex: 1, minWidth: 0, gap: spacing.xs },
    title: { ...type.bodyEmphasis, color: colors.textPrimary, flexShrink: 1, maxWidth: '100%' },
    primaryLine: { ...type.helper, color: colors.textPrimary, flexShrink: 1, maxWidth: '100%' },
    secondary: { ...type.helper, color: colors.textSecondary, flexShrink: 1, maxWidth: '100%' },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, maxWidth: '100%' },
    budget: { ...type.numeric, fontSize: 16, lineHeight: 24, color: colors.textPrimary, flexShrink: 1, maxWidth: '100%' },
  });
}

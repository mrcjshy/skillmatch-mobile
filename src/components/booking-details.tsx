import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import BookingLifecycle from '@/components/booking-lifecycle';
import BookingPayment from '@/components/booking-payment';
import RateWorker from '@/components/rate-worker';
import { StarRatingDisplay } from '@/components/star-rating-display';
import { SkillMatchTheme } from '@/constants/theme';
import {
  BookingLoadError,
  formatBookingStatus,
  formatBudget,
  formatLocation,
  formatSkills,
  formatVerification,
  isCounterpartyReleased,
  loadErrorCopy,
} from '@/lib/bookings';
import {
  BookingRole,
  RoleBooking,
  isClientBooking,
  isWorkerBooking,
  loadClientBookings,
  loadWorkerBookings,
} from '@/lib/booking-records';
import { isLifecycleActionableStatus } from '@/lib/booking-lifecycle';
import { formatDetailDateTime } from '@/lib/date-time';
import {
  BookingPayment as BookingPaymentState,
  fetchBookingPayments,
  isPayableStatus,
} from '@/lib/payments';
import { COPY as RATING_COPY, fetchMyRatedBookingIds, isRateableStatus } from '@/lib/ratings';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNAVAILABLE = 'This booking is unavailable.';

type DetailState = {
  booking: RoleBooking;
  payment: BookingPaymentState | undefined;
  isRated: boolean;
};

export default function BookingDetails({ role, bookingId }: { role: BookingRole; bookingId: string | null }) {
  const router = useRouter();
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (bookingId === null || !UUID_PATTERN.test(bookingId)) {
      setDetail(null);
      setLoadError(UNAVAILABLE);
      return;
    }

    const rows = role === 'worker' ? await loadWorkerBookings() : await loadClientBookings();
    const booking = rows.find((row) => row.booking_id === bookingId) ?? null;
    if (booking === null) {
      setDetail(null);
      setLoadError(UNAVAILABLE);
      return;
    }

    const payable = isPayableStatus(booking.booking_status);
    const payments = payable ? await fetchBookingPayments([booking.booking_id]) : new Map();
    const rated =
      role === 'client' && isRateableStatus(booking.booking_status)
        ? await fetchMyRatedBookingIds([booking.booking_id])
        : new Set<string>();

    setDetail({
      booking,
      payment: payments.get(booking.booking_id),
      isRated: rated.has(booking.booking_id),
    });
    setLoadError(null);
  }, [bookingId, role]);

  const applyError = useCallback((error: unknown) => {
    if (error instanceof BookingLoadError) {
      console.warn(`[R1-B] ${role} booking detail load failed:`, error.code, error.message);
    } else if (error instanceof Error && error.message) {
      console.warn(`[R1-B] ${role} booking detail load failed:`, error.message);
    }
    setLoadError(loadErrorCopy(error));
  }, [role]);

  /* eslint-disable react-hooks/set-state-in-effect -- established fetch-on-mount convention */
  useEffect(() => {
    const run = { cancelled: false };
    load()
      .catch((error: unknown) => {
        if (!run.cancelled) applyError(error);
      })
      .finally(() => {
        if (!run.cancelled) setIsLoading(false);
      });
    return () => { run.cancelled = true; };
  }, [load, applyError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function retry() {
    setIsLoading(true);
    try {
      await load();
    } catch (error: unknown) {
      applyError(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function refresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await load();
    } catch (error: unknown) {
      applyError(error);
    } finally {
      setIsRefreshing(false);
    }
  }

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator /><Text style={styles.secondary}>Loading booking…</Text></View>;
  }

  if (loadError || detail === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError ?? UNAVAILABLE}</Text>
        <Pressable style={styles.outlineButton} onPress={retry} accessibilityRole="button">
          <Text style={styles.outlineButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { booking, payment, isRated } = detail;
  const schedule = formatDetailDateTime(booking.job_scheduled_at);
  const bookedAt = formatDetailDateTime(booking.booked_at);
  const completedAt = formatDetailDateTime(booking.completed_at);
  const budget = formatBudget(booking.job_budget);
  const location = formatLocation(booking.job_address, booking.job_barangay, booking.job_city);
  const released = isCounterpartyReleased(booking.booking_status);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
    >
      <View style={styles.statusCard}>
        <Text style={styles.eyebrow}>STATUS</Text>
        <Text style={styles.status}>{formatBookingStatus(booking.booking_status)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{booking.job_title}</Text>
        {booking.job_description ? <Text style={styles.body}>{booking.job_description}</Text> : null}
        <DetailLine label="Booking ID" value={booking.booking_id} />
        <DetailLine label="Schedule" value={schedule} />
        <DetailLine label="Budget" value={budget} />
        <DetailLine label="Location" value={location} />
        <DetailLine label="Booked" value={bookedAt} />
        <DetailLine label="Completed" value={completedAt} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{role === 'worker' ? 'Client' : 'Assigned Worker'}</Text>
        {!released ? (
          <Text style={styles.secondary}>
            {role === 'worker'
              ? 'Client contact is not available for this booking status.'
              : 'Worker details are not available for this booking status.'}
          </Text>
        ) : role === 'worker' && isWorkerBooking(booking) ? (
          <>
            <DetailLine label="Name" value={booking.client_full_name ?? 'Not provided'} />
            <DetailLine label="Phone" value={booking.client_phone ?? 'Not provided'} />
          </>
        ) : role === 'client' && isClientBooking(booking) ? (
          <>
            <DetailLine label="Name" value={booking.worker_full_name ?? 'Not provided'} />
            <DetailLine label="Phone" value={booking.worker_phone ?? 'Not provided'} />
            <DetailLine label="Barangay" value={booking.worker_barangay ?? 'Not provided'} />
            <DetailLine label="Skills" value={formatSkills(booking.worker_skills)} />
            <DetailLine label="Verification" value={formatVerification(booking.worker_is_verified)} />
            <View style={styles.ratingRow}>
              <Text style={styles.detailLabel}>Rating</Text>
              <StarRatingDisplay average={booking.worker_rating_avg} count={booking.worker_rating_count} />
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Actions</Text>
        {isLifecycleActionableStatus(booking.booking_status) ? (
          <BookingLifecycle role={role} bookingId={booking.booking_id} onChanged={load} />
        ) : null}
        {isPayableStatus(booking.booking_status) ? (
          <BookingPayment role={role} bookingId={booking.booking_id} payment={payment} onChanged={load} />
        ) : null}
        {role === 'client' && isRateableStatus(booking.booking_status) ? (
          isRated ? <Text style={styles.secondary}>{RATING_COPY.rated}</Text> : <RateWorker bookingId={booking.booking_id} onRated={load} />
        ) : null}
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            const pathname = role === 'worker' ? '/worker/chat' : '/client/chat';
            router.push({ pathname, params: { bookingId: booking.booking_id } } as Href);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Open Chat</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function DetailLine({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { padding: SkillMatchTheme.spacing.screenGutter, gap: SkillMatchTheme.spacing.cardGap, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: SkillMatchTheme.brand.background },
  card: { backgroundColor: SkillMatchTheme.surface.default, borderWidth: 1, borderColor: SkillMatchTheme.border.default, borderRadius: SkillMatchTheme.radius.card, padding: SkillMatchTheme.spacing.cardPadding, gap: 10 },
  statusCard: { backgroundColor: SkillMatchTheme.brand.primaryMuted, borderRadius: SkillMatchTheme.radius.card, padding: SkillMatchTheme.spacing.cardPadding },
  eyebrow: { color: SkillMatchTheme.text.secondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  status: { color: SkillMatchTheme.brand.primary, fontSize: 24, fontWeight: '800' },
  title: { color: SkillMatchTheme.text.primary, fontSize: 22, fontWeight: '800' },
  body: { color: SkillMatchTheme.text.secondary, fontSize: 15, lineHeight: 21 },
  sectionTitle: { color: SkillMatchTheme.text.primary, fontSize: 17, fontWeight: '700' },
  detailRow: { gap: 2 },
  detailLabel: { color: SkillMatchTheme.text.secondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  detailValue: { color: SkillMatchTheme.text.primary, fontSize: 15 },
  ratingRow: { gap: 5 },
  secondary: { color: SkillMatchTheme.text.secondary, fontSize: 14 },
  error: { color: SkillMatchTheme.feedback.danger, fontSize: 14, textAlign: 'center' },
  outlineButton: { borderWidth: 1, borderColor: SkillMatchTheme.brand.primary, borderRadius: SkillMatchTheme.radius.input, paddingHorizontal: 18, paddingVertical: 10 },
  outlineButtonText: { color: SkillMatchTheme.brand.primary, fontWeight: '700' },
  primaryButton: { minHeight: SkillMatchTheme.size.primaryCtaHeight, backgroundColor: SkillMatchTheme.brand.primary, borderRadius: SkillMatchTheme.radius.input, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryButtonText: { color: SkillMatchTheme.text.inverse, fontSize: 16, fontWeight: '700' },
});

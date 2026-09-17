import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppChip, type AppChipVariant } from '@/components/app-chip';
import BookingLifecycle from '@/components/booking-lifecycle';
import BookingPayment from '@/components/booking-payment';
import { InlineStatus } from '@/components/inline-status';
import { WorkerAssignedJobLocation, nativeJobMapsLoaded, openWorkerMapsUrl } from '@/components/job-location-map';
import RateWorker from '@/components/rate-worker';
import { SectionHeader } from '@/components/section-header';
import { StarRatingDisplay } from '@/components/star-rating-display';
import { SkillMatchTheme } from '@/constants/theme';
import {
  BookingLoadError,
  formatBookingStatus,
  formatBudget,
  formatLocation,
  formatSkills,
  formatVerification,
  isBookingChatAvailable,
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
  fetchJobPaymentMethod,
  type JobPaymentMethod,
} from '@/lib/job-payment';
import {
  BookingPayment as BookingPaymentState,
  fetchBookingPayments,
  isPayableStatus,
} from '@/lib/payments';
import { CLIENT_PORTFOLIO_COPY, CLIENT_PORTFOLIO_PATH, isClientPortfolioVisible } from '@/lib/client-portfolio';
import { COPY as RATING_COPY, fetchMyRatedBookingIds, isRateableStatus } from '@/lib/ratings';
import { COPY as REPORT_COPY, isBookingReportableStatus } from '@/lib/reports';
import {
  COPY as JOB_LOCATION_COPY,
  JobLocationError,
  classifyMapAvailability,
  getAuthorizedJobLocation,
  projectAssignedWorkerLocation,
  type AuthorizedJobLocation,
} from '@/lib/job-location';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNAVAILABLE = 'This booking is unavailable.';

type DetailState = {
  booking: RoleBooking;
  payment: BookingPaymentState | undefined;
  jobPaymentMethod: JobPaymentMethod | null;
  jobPaymentReady: boolean;
  isRated: boolean;
  exactLocation:
    | { status: 'skipped' }
    | { status: 'ready'; location: AuthorizedJobLocation }
    | { status: 'denied' }
    | { status: 'error' };
};

function statusChipVariant(status: string): AppChipVariant {
  if (status === 'confirmed') return 'positive';
  if (status === 'completed') return 'positive';
  if (status === 'pending') return 'warning';
  if (status === 'cancelled' || status === 'no_show') return 'danger';
  return 'neutral';
}

export default function BookingDetails({ role, bookingId }: { role: BookingRole; bookingId: string | null }) {
  const router = useRouter();
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapsNote, setMapsNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (bookingId === null || !UUID_PATTERN.test(bookingId)) {
      setDetail(null);
      setLoadError(UNAVAILABLE);
      setMapsNote(null);
      return;
    }

    const rows = role === 'worker' ? await loadWorkerBookings() : await loadClientBookings();
    const booking = rows.find((row) => row.booking_id === bookingId) ?? null;
    if (booking === null) {
      setDetail(null);
      setLoadError(UNAVAILABLE);
      setMapsNote(null);
      return;
    }

    const payable = isPayableStatus(booking.booking_status);
    const payments = payable ? await fetchBookingPayments([booking.booking_id]) : new Map();
    let jobPaymentMethod: JobPaymentMethod | null = null;
    let jobPaymentReady = !payable;
    if (payable) {
      try {
        jobPaymentMethod = await fetchJobPaymentMethod(booking.job_id);
        jobPaymentReady = true;
      } catch (error: unknown) {
        if (error instanceof Error && error.message) {
          console.warn('[R4] job payment_method read failed:', error.message);
        }
        jobPaymentReady = false;
      }
    }
    const rated =
      role === 'client' && isRateableStatus(booking.booking_status)
        ? await fetchMyRatedBookingIds([booking.booking_id])
        : new Set<string>();

    let exactLocation: DetailState['exactLocation'] = { status: 'skipped' };
    if (role === 'worker' && booking.booking_status === 'confirmed') {
      try {
        exactLocation = { status: 'ready', location: await getAuthorizedJobLocation(booking.job_id) };
      } catch (error: unknown) {
        const code = error instanceof JobLocationError ? error.code : null;
        console.warn('[R5E-M2] get_authorized_job_location failed:', code);
        exactLocation = code === 'SM409' || code === '42501' ? { status: 'denied' } : { status: 'error' };
      }
    }

    setDetail({
      booking,
      payment: payments.get(booking.booking_id),
      jobPaymentMethod,
      jobPaymentReady,
      isRated: rated.has(booking.booking_id),
      exactLocation,
    });
    setLoadError(null);
    setMapsNote(null);
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
    return (
      <View style={styles.center}>
        <InlineStatus variant="loading" message="Loading booking…" />
      </View>
    );
  }

  if (loadError || detail === null) {
    return (
      <View style={styles.center}>
        <InlineStatus
          variant="error"
          message={loadError ?? UNAVAILABLE}
          action={<AppButton label="Retry" variant="secondary" onPress={retry} />}
        />
      </View>
    );
  }

  const { booking, payment, jobPaymentMethod, jobPaymentReady, isRated, exactLocation } = detail;
  const schedule = formatDetailDateTime(booking.job_scheduled_at);
  const bookedAt = formatDetailDateTime(booking.booked_at);
  const completedAt = formatDetailDateTime(booking.completed_at);
  const budget = formatBudget(booking.job_budget);
  const location = formatLocation(booking.job_address, booking.job_barangay, booking.job_city);
  const released = isCounterpartyReleased(booking.booking_status);
  const chatAvailable = isBookingChatAvailable(booking.booking_status);
  const workerLocationSurface =
    role === 'worker'
      ? projectAssignedWorkerLocation({
          bookingStatus: booking.booking_status,
          exact: exactLocation.status === 'ready' ? exactLocation.location : null,
          mapAvailable: classifyMapAvailability(nativeJobMapsLoaded()),
        })
      : null;
  const showLifecycle = isLifecycleActionableStatus(booking.booking_status);
  const showPayment = isPayableStatus(booking.booking_status);
  const showRate = role === 'client' && isRateableStatus(booking.booking_status);
  const showReport = isBookingReportableStatus(booking.booking_status);
  const showPortfolio = role === 'client' && isClientPortfolioVisible(booking.booking_status);
  const showActions = showLifecycle || showPayment || showRate || chatAvailable || showReport || showPortfolio;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
    >
      <AppChip
        label={formatBookingStatus(booking.booking_status)}
        variant={statusChipVariant(booking.booking_status)}
        style={styles.statusChip}
      />

      <View style={styles.section}>
        <Text style={styles.jobTitle}>{booking.job_title}</Text>
        {booking.job_description ? <Text style={styles.body}>{booking.job_description}</Text> : null}
        <View style={styles.summaryPanel}>
          <DetailLine label="Booking ID" value={booking.booking_id} />
          <DetailLine label="Schedule" value={schedule} />
          <DetailLine label="Budget" value={budget} />
          <DetailLine label="Location" value={location} />
          {role === 'worker' && booking.booking_status === 'confirmed' && exactLocation.status === 'error' ? (
            <Text style={styles.note}>{JOB_LOCATION_COPY.workerLocationGeneric}</Text>
          ) : workerLocationSurface ? (
            <WorkerAssignedJobLocation
              surface={workerLocationSurface}
              mapsNote={mapsNote}
              onOpenMaps={() => {
                const url = workerLocationSurface.kind === 'exact' ? workerLocationSurface.openInMapsUrl : null;
                void openWorkerMapsUrl(url).then((ok) => {
                  setMapsNote(ok ? null : JOB_LOCATION_COPY.openInMapsFailed);
                });
              }}
            />
          ) : null}
          <DetailLine label="Booked" value={bookedAt} />
          <DetailLine label="Completed" value={completedAt} />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title={role === 'worker' ? 'Client' : 'Assigned Worker'} />
        {!released ? (
          <Text style={styles.note}>
            {role === 'worker'
              ? 'Client contact is not available for this booking status.'
              : 'Worker details are not available for this booking status.'}
          </Text>
        ) : role === 'worker' && isWorkerBooking(booking) ? (
          <View style={styles.summaryPanel}>
            <DetailLine label="Name" value={booking.client_full_name ?? 'Not provided'} />
            <DetailLine label="Phone" value={booking.client_phone ?? 'Not provided'} />
          </View>
        ) : role === 'client' && isClientBooking(booking) ? (
          <View style={styles.summaryPanel}>
            <DetailLine label="Name" value={booking.worker_full_name ?? 'Not provided'} />
            <DetailLine label="Phone" value={booking.worker_phone ?? 'Not provided'} />
            <DetailLine label="Barangay" value={booking.worker_barangay ?? 'Not provided'} />
            <DetailLine label="Skills" value={formatSkills(booking.worker_skills)} />
            <DetailLine label="Verification" value={formatVerification(booking.worker_is_verified)} />
            <View style={styles.ratingRow}>
              <Text style={styles.detailLabel}>Rating</Text>
              <StarRatingDisplay average={booking.worker_rating_avg} count={booking.worker_rating_count} />
            </View>
          </View>
        ) : null}
      </View>

      {showActions ? (
        <View style={styles.section}>
          {showLifecycle ? (
            <BookingLifecycle role={role} bookingId={booking.booking_id} onChanged={load} />
          ) : null}
          {showPayment ? (
            jobPaymentReady ? (
              <BookingPayment
                role={role}
                bookingId={booking.booking_id}
                payment={payment}
                jobPaymentMethod={jobPaymentMethod}
                onChanged={load}
              />
            ) : (
              <Text style={styles.note}>Could not load the agreed payment method.</Text>
            )
          ) : null}
          {showRate ? (
            isRated ? <Text style={styles.note}>{RATING_COPY.rated}</Text> : <RateWorker bookingId={booking.booking_id} onRated={load} />
          ) : null}
          {chatAvailable ? (
            <AppButton
              variant="primary"
              label="Open Chat"
              onPress={() => {
                const pathname = role === 'worker' ? '/worker/chat' : '/client/chat';
                router.push({ pathname, params: { bookingId: booking.booking_id } } as Href);
              }}
            />
          ) : null}
          {showReport ? (
            <AppButton
              variant="ghost"
              label={REPORT_COPY.reportAction}
              onPress={() => {
                const pathname = role === 'worker' ? '/worker/report-booking' : '/client/report-booking';
                router.push({ pathname, params: { bookingId: booking.booking_id } } as unknown as Href);
              }}
            />
          ) : null}
          {showPortfolio ? (
            <AppButton
              variant="secondary"
              label={CLIENT_PORTFOLIO_COPY.viewAction}
              accessibilityLabel={CLIENT_PORTFOLIO_COPY.viewAction}
              onPress={() => {
                router.push({ pathname: CLIENT_PORTFOLIO_PATH, params: { bookingId: booking.booking_id } } as unknown as Href);
              }}
            />
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function DetailLine({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.gutter,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.gutter,
  },
  statusChip: {
    alignSelf: 'flex-start',
  },
  section: {
    gap: spacing.md,
  },
  jobTitle: {
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  body: {
    ...type.body,
    color: colors.textSecondary,
  },
  summaryPanel: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  detailRow: {
    gap: spacing.xxs,
  },
  detailLabel: {
    ...type.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailValue: {
    ...type.body,
    color: colors.textPrimary,
  },
  ratingRow: {
    gap: spacing.xs,
  },
  note: {
    ...type.helper,
    color: colors.textSecondary,
  },
});

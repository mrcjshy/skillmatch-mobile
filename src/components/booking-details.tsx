import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
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
import { JobPhotoGallery } from '@/components/job-photo-gallery';
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
import { listJobPhotos, type SignedJobPhoto } from '@/lib/job-photos';
import {
  BookingPayment as BookingPaymentState,
  bookingActionPresentation,
  fetchBookingPayments,
  isPayableStatus,
} from '@/lib/payments';
import { CLIENT_PORTFOLIO_COPY, CLIENT_PORTFOLIO_PATH, isClientPortfolioVisible } from '@/lib/client-portfolio';
import { COPY as RATING_COPY, fetchMyRatedBookingIds, isRateableStatus } from '@/lib/ratings';
import { COPY as REPORT_COPY, isBookingReportableStatus, loadMyReportedBookingIds } from '@/lib/reports';
import {
  COPY as JOB_LOCATION_COPY,
  JobLocationError,
  classifyMapAvailability,
  getAuthorizedJobLocation,
  projectAssignedWorkerLocation,
  type AuthorizedJobLocation,
} from '@/lib/job-location';
import {
  createLoadGenerationTracker,
  isBookingStatusChangedListenStatus,
  isProtectedProjectionReleased,
  shouldSuppressProtectedBeforeRefresh,
  stripProtectedBookingFields,
} from '@/lib/booking-details-freshness';
import {
  BOOKING_STATUS_CHANGED,
  bookingMessagesTopic,
  subscribeInvalidation,
} from '@/lib/realtime';
import { bookingDialUrl } from '@/lib/booking-call';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNAVAILABLE = 'This booking is unavailable.';

type DetailState = {
  booking: RoleBooking;
  payment: BookingPaymentState | undefined;
  paymentReadSucceeded: boolean;
  jobPaymentMethod: JobPaymentMethod | null;
  jobPaymentReady: boolean;
  isRated: boolean;
  reportReadSucceeded: boolean;
  isReported: boolean;
  exactLocation:
    | { status: 'skipped' }
    | { status: 'ready'; location: AuthorizedJobLocation }
    | { status: 'denied' }
    | { status: 'error' };
  jobPhotos:
    | { status: 'skipped' }
    | { status: 'ready'; photos: SignedJobPhoto[] }
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
  const [suppressProtected, setSuppressProtected] = useState(false);
  const loadGate = useRef(createLoadGenerationTracker());
  const hasLoaded = useRef(false);
  const displayedStatusRef = useRef<string | null>(null);
  const focused = useRef(false);
  const visibleDetail =
    detail !== null && bookingId !== null && detail.booking.booking_id === bookingId ? detail : null;

  useEffect(() => {
    const gate = createLoadGenerationTracker();
    loadGate.current = gate;
    hasLoaded.current = false;
    displayedStatusRef.current = null;
    return () => {
      gate.cancel();
    };
  }, [bookingId, role]);

  const load = useCallback(async (options?: { preserveProtected?: boolean }) => {
    if (options?.preserveProtected !== true) hideProtectedProjection();
    if (!focused.current || AppState.currentState !== 'active') return;
    const token = loadGate.current.start();
    if (bookingId === null || !UUID_PATTERN.test(bookingId)) {
      if (!loadGate.current.isCurrent(token)) return;
      displayedStatusRef.current = null;
      setDetail(null);
      setLoadError(UNAVAILABLE);
      setMapsNote(null);
      setSuppressProtected(false);
      return;
    }

    const rows = role === 'worker' ? await loadWorkerBookings() : await loadClientBookings();
    if (!loadGate.current.isCurrent(token)) return;
    const booking = rows.find((row) => row.booking_id === bookingId) ?? null;
    if (booking === null) {
      displayedStatusRef.current = null;
      setDetail(null);
      setLoadError(UNAVAILABLE);
      setMapsNote(null);
      setSuppressProtected(false);
      return;
    }

    const payable = isPayableStatus(booking.booking_status);
    let payments = new Map<string, BookingPaymentState>();
    let paymentReadSucceeded = !payable;
    if (payable) {
      try {
        payments = await fetchBookingPayments([booking.booking_id]);
        paymentReadSucceeded = payments.has(booking.booking_id);
      } catch (error: unknown) {
        if (error instanceof Error && error.message) {
          console.warn('[FT-05] booking payment read failed:', error.message);
        }
        paymentReadSucceeded = false;
      }
    }
    let jobPaymentMethod: JobPaymentMethod | null = null;
    let jobPaymentReady = !payable;
    if (payable && paymentReadSucceeded) {
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
    let reportReadSucceeded = !isBookingReportableStatus(booking.booking_status);
    let isReported = false;
    if (isBookingReportableStatus(booking.booking_status)) {
      try {
        isReported = (await loadMyReportedBookingIds([booking.booking_id])).has(booking.booking_id);
        reportReadSucceeded = true;
      } catch {
        reportReadSucceeded = false;
      }
    }

    let exactLocation: DetailState['exactLocation'] = { status: 'skipped' };
    let jobPhotos: DetailState['jobPhotos'] = { status: 'skipped' };
    if (booking.booking_status === 'confirmed') {
      try {
        exactLocation = { status: 'ready', location: await getAuthorizedJobLocation(booking.job_id) };
      } catch (error: unknown) {
        const code = error instanceof JobLocationError ? error.code : null;
        console.warn('[R5E-M2] get_authorized_job_location failed:', code);
        exactLocation = code === 'SM409' || code === '42501' ? { status: 'denied' } : { status: 'error' };
      }
      if (isWorkerBooking(booking)) {
        try {
          jobPhotos = {
            status: 'ready',
            photos: await listJobPhotos({
              clientId: booking.client_user_id,
              jobId: booking.job_id,
            }),
          };
        } catch {
          console.warn('[V4-9] authorized Job photo load failed');
          jobPhotos = { status: 'error' };
        }
      }
    }

    if (!loadGate.current.isCurrent(token)) return;
    displayedStatusRef.current = booking.booking_status;
    setDetail({
      booking,
      payment: payments.get(booking.booking_id),
      paymentReadSucceeded,
      jobPaymentMethod,
      jobPaymentReady,
      isRated: rated.has(booking.booking_id),
      reportReadSucceeded,
      isReported,
      exactLocation,
      jobPhotos,
    });
    setLoadError(null);
    setMapsNote(null);
    setSuppressProtected(false);
  }, [bookingId, role]);

  const applyError = useCallback((error: unknown) => {
    if (error instanceof BookingLoadError) {
      console.warn(`[R1-B] ${role} booking detail load failed:`, error.code, error.message);
    } else if (error instanceof Error && error.message) {
      console.warn(`[R1-B] ${role} booking detail load failed:`, error.message);
    }
    setLoadError(loadErrorCopy(error));
  }, [role]);

  function hideProtectedProjection() {
    loadGate.current.start();
    setSuppressProtected(true);
    setDetail((current) => {
      if (current === null) return current;
      return {
        ...current,
        booking: stripProtectedBookingFields(current.booking),
        exactLocation: { status: 'skipped' },
        jobPhotos: { status: 'skipped' },
      };
    });
    setMapsNote(null);
  }

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const run = { cancelled: false };
      if (
        shouldSuppressProtectedBeforeRefresh({
          reason: 'focus',
          displayedStatus: displayedStatusRef.current,
        })
      ) {
        hideProtectedProjection();
      }
      if (!hasLoaded.current) setIsLoading(true);
      load()
        .catch((error: unknown) => {
          if (run.cancelled) return;
          if (!hasLoaded.current) applyError(error);
          else console.warn('[R6-8D-FIX] booking detail focus refresh failed:', error);
        })
        .finally(() => {
          if (!run.cancelled) {
            hasLoaded.current = true;
            setIsLoading(false);
          }
        });
      return () => {
        run.cancelled = true;
        focused.current = false;
        hideProtectedProjection();
      };
    }, [load, applyError])
  );

  const listenStatus = visibleDetail?.booking.booking_status;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      hideProtectedProjection();
      if (state === 'active' && focused.current) void load().catch(applyError);
    });
    return () => subscription.remove();
  }, [load, applyError]);

  useEffect(() => {
    if (bookingId === null || !UUID_PATTERN.test(bookingId)) return;
    if (!isBookingStatusChangedListenStatus(listenStatus)) return;

    const run = { cancelled: false, inFlight: false, pending: false, initialCatchUp: true };
    const revalidate = () => {
      if (run.cancelled) return;
      const preserveProtected = !shouldSuppressProtectedBeforeRefresh({
        reason: 'subscribed',
        displayedStatus: displayedStatusRef.current,
        initialCatchUp: run.initialCatchUp,
      });
      run.initialCatchUp = false;
      if (!preserveProtected) hideProtectedProjection();
      if (run.inFlight) {
        run.pending = true;
        return;
      }
      run.inFlight = true;
      load({ preserveProtected })
        .catch((error: unknown) => {
          if (error instanceof Error && error.message) {
            console.warn('[R6-8D-FIX] booking detail revalidate failed:', error.message);
          }
        })
        .finally(() => {
          run.inFlight = false;
          if (run.pending && !run.cancelled) {
            run.pending = false;
            revalidate();
          }
        });
    };

    const cleanup = subscribeInvalidation({
      topic: bookingMessagesTopic(bookingId),
      events: [BOOKING_STATUS_CHANGED],
      onBroadcastEvent: hideProtectedProjection,
      onInvalidate: revalidate,
      onUnavailable: hideProtectedProjection,
    });

    return () => {
      run.cancelled = true;
      cleanup();
    };
  }, [bookingId, listenStatus, load]);

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

  if (isLoading && visibleDetail === null) {
    return (
      <View style={styles.center}>
        <InlineStatus variant="loading" message="Loading booking…" />
      </View>
    );
  }

  if (loadError || visibleDetail === null) {
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

  const {
    booking,
    payment,
    paymentReadSucceeded,
    jobPaymentMethod,
    jobPaymentReady,
    isRated,
    reportReadSucceeded,
    isReported,
    exactLocation,
    jobPhotos,
  } = visibleDetail;
  const schedule = formatDetailDateTime(booking.job_scheduled_at);
  const bookedAt = formatDetailDateTime(booking.booked_at);
  const completedAt = formatDetailDateTime(booking.completed_at);
  const budget = formatBudget(booking.job_budget);
  const protectedReleased = isProtectedProjectionReleased(booking.booking_status, suppressProtected);
  const location = formatLocation(
    protectedReleased ? booking.job_address : null,
    booking.job_barangay,
    booking.job_city
  );
  const released = protectedReleased && isCounterpartyReleased(booking.booking_status);
  const counterpartyPhone =
    role === 'worker' && isWorkerBooking(booking)
      ? booking.client_phone
      : role === 'client' && isClientBooking(booking)
        ? booking.worker_phone
        : null;
  const dialUrl = bookingDialUrl(released, counterpartyPhone);
  const chatAvailable = protectedReleased && isBookingChatAvailable(booking.booking_status);
  const workerLocationSurface =
    protectedReleased
      ? projectAssignedWorkerLocation({
          bookingStatus: booking.booking_status,
          exact: exactLocation.status === 'ready' ? exactLocation.location : null,
          mapAvailable: classifyMapAvailability(nativeJobMapsLoaded()),
        })
      : null;
  const actionPresentation = bookingActionPresentation(
    role,
    booking.booking_status,
    payment,
    paymentReadSucceeded
  );
  const showLifecycle =
    protectedReleased &&
    isLifecycleActionableStatus(booking.booking_status) &&
    (actionPresentation.showCompletion || actionPresentation.showCancellation);
  const showPayment = actionPresentation.showPayment;
  const paymentUnavailable = isPayableStatus(booking.booking_status) && !paymentReadSucceeded;
  const showRate = role === 'client' && isRateableStatus(booking.booking_status);
  const showReport = isBookingReportableStatus(booking.booking_status) && reportReadSucceeded;
  const showPortfolio =
    protectedReleased && role === 'client' && isClientPortfolioVisible(booking.booking_status);
  const showActions =
    showLifecycle || showPayment || paymentUnavailable || showRate || chatAvailable || showReport || showPortfolio;

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
          {protectedReleased && exactLocation.status === 'error' ? (
            <Text style={styles.note}>{JOB_LOCATION_COPY.workerLocationGeneric}</Text>
          ) : workerLocationSurface ? (
            <WorkerAssignedJobLocation
              surface={workerLocationSurface}
              mapsNote={mapsNote}
              allowNavigation={role === 'worker'}
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
        {role === 'worker' && protectedReleased && booking.booking_status === 'confirmed' ? (
          <JobPhotoGallery
            photos={jobPhotos.status === 'ready' ? jobPhotos.photos : []}
            error={jobPhotos.status === 'error'}
          />
        ) : null}
        {dialUrl ? (
          <AppButton
            variant="secondary"
            label="Call"
            accessibilityLabel="Call booking counterpart"
            onPress={() => void Linking.openURL(dialUrl)}
          />
        ) : null}
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
          {paymentUnavailable ? (
            <Text style={styles.note}>Could not load the authoritative payment state. Payment and lifecycle actions are unavailable.</Text>
          ) : null}
          {showLifecycle ? (
            <BookingLifecycle
              role={role}
              bookingId={booking.booking_id}
              showCompletion={actionPresentation.showCompletion}
              showCancellation={actionPresentation.showCancellation}
              onChanged={load}
            />
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
            isReported ? (
              <Text style={styles.note}>Report submitted</Text>
            ) : (
              <AppButton
                variant="ghost"
                label={REPORT_COPY.reportAction}
                onPress={() => {
                  const pathname = role === 'worker' ? '/worker/report-booking' : '/client/report-booking';
                  router.push({ pathname, params: { bookingId: booking.booking_id } } as unknown as Href);
                }}
              />
            )
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

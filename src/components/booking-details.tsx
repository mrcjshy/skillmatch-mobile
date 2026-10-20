import { type Href, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AppState,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppIconButton } from '@/components/app-icon-button';
import { BookingLocationMap, type LocationPanel } from '@/components/booking-location-map';
import { BookingSheet } from '@/components/booking-sheet';
import { AppChip } from '@/components/app-chip';
import BookingLifecycle from '@/components/booking-lifecycle';
import BookingPayment from '@/components/booking-payment';
import { InlineStatus } from '@/components/inline-status';
import { JobPhotoGallery } from '@/components/job-photo-gallery';
import { WorkerAssignedJobLocation, nativeJobMapsLoaded, openWorkerMapsUrl } from '@/components/job-location-map';
import RateWorker from '@/components/rate-worker';
import { FactRow } from '@/components/fact-row';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
import { StarRatingDisplay } from '@/components/star-rating-display';
import { InitialsAvatar } from '@/components/initials-avatar';
import { ServiceMark } from '@/components/service-mark';
import { useUiTheme, type UiTheme, RefinementThemeProvider } from '@/components/refinement-theme';
import {
  BookingLoadError,
  cancellationDetails,
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
  isAwaitingCash,
  isPaidCod,
  isPaidQrph,
  isPayableStatus,
} from '@/lib/payments';
import { CLIENT_PORTFOLIO_COPY, CLIENT_PORTFOLIO_PATH, isClientPortfolioVisible } from '@/lib/client-portfolio';
import { COPY as RATING_COPY, fetchMyRatedBookingIds, isRateableStatus } from '@/lib/ratings';
import { COPY as REPORT_COPY, isBookingReportableStatus, loadMyReportedBookingIds } from '@/lib/reports';
import { bookingStatusVariant } from '@/lib/status-presentation';
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
import { createDetailsAppStateHandler } from '@/lib/booking-details-app-state';
import { mapInsetsForPanel } from '@/lib/booking-sheet';
import { systemPromptPending } from '@/lib/system-prompt';
import { useAccount } from '@/providers/account-provider';



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

export default function BookingDetails({ role, bookingId }: { role: BookingRole; bookingId: string | null }) {
  const defaultUi = useUiTheme();

  const router = useRouter();
  const { account } = useAccount();
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapsNote, setMapsNote] = useState<string | null>(null);
  const [suppressProtected, setSuppressProtected] = useState(false);
  const [pinsSession, setPinsSession] = useState(0);
  // Map-first layout: the collapsed panel height frames markers in the visible map above it.
  const [panelHeight, setPanelHeight] = useState(0);
  const safeArea = useSafeAreaInsets();
  const loadGate = useRef(createLoadGenerationTracker());
  const hasLoaded = useRef(false);
  const displayedStatusRef = useRef<string | null>(null);
  const focused = useRef(false);
  // Retain geometry only; protected values are still stripped before every read.
  const participantHeight = useRef(0);
  const locationHeight = useRef(0);
  const controlsHeight = useRef(0);
  const visibleDetail =
    detail !== null && bookingId !== null && detail.booking.booking_id === bookingId ? detail : null;

  const ui = defaultUi;
  const { colors } = ui;
  const styles = createStyles(ui);

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
        setPinsSession(session => session + 1);
        hideProtectedProjection();
      };
    }, [load, applyError])
  );

  const listenStatus = visibleDetail?.booking.booking_status;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', createDetailsAppStateHandler({
      endPinsSession: () => setPinsSession(session => session + 1),
      hideProtected: hideProtectedProjection,
      reload: () => void load().catch(applyError),
      isFocused: () => focused.current,
      promptPending: systemPromptPending,
    }));
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
  const cancellation = cancellationDetails({
    bookingStatus: booking.booking_status,
    role,
    viewerUserId: account?.id,
    counterpartyUserId:
      role === 'worker' && isWorkerBooking(booking)
        ? booking.client_user_id
        : role === 'client' && isClientBooking(booking)
          ? booking.worker_user_id
          : '',
    reasonCode: booking.cancellation_reason_code,
    reasonDetail: booking.cancellation_reason_detail,
    cancelledBy: booking.cancelled_by,
    cancelledAt: booking.cancelled_at,
  });
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
  const participantName = released
    ? role === 'worker' && isWorkerBooking(booking)
      ? booking.client_full_name ?? 'Not provided'
      : role === 'client' && isClientBooking(booking)
        ? booking.worker_full_name ?? 'Not provided'
        : null
    : null;
  // The inline booking map (destination + Worker live position) replaces the static destination map.
  const inlineMapShown = protectedReleased && booking.booking_status === 'confirmed' && account?.is_active === true && account.role === role;
  const locationHasAddress =
    workerLocationSurface &&
    (workerLocationSurface.kind === 'exact' || workerLocationSurface.kind === 'text-fallback') &&
    workerLocationSurface.address;

  // The one current primary action. Chat is primary only when nothing else on the screen is
  // (a payment step to take, or the Client's completion), so there is never a competing filled button.
  const paymentActionable =
    showPayment && jobPaymentReady &&
    (role === 'worker'
      ? isAwaitingCash(payment)
      : !isPaidCod(payment) && !isPaidQrph(payment));
  const clientCompletion = role === 'client' && showLifecycle && actionPresentation.showCompletion;
  const hasOtherPrimary = paymentActionable || clientCompletion;
  const chatVariant = hasOtherPrimary ? 'secondary' : 'primary';
  // A Worker can only cancel, so their lifecycle control closes the screen. A Client's completion is
  // the primary action and stays with the payment step.
  const lifecycleAtBottom = role === 'worker';
  const reportMessage = isReported ? (
    <Text style={styles.note}>Report submitted</Text>
  ) : (
    <AppButton
      variant="ghost"
      label={REPORT_COPY.reportAction}
      icon={{ android: 'flag', ios: 'flag' }}
      onPress={() => {
        const pathname = role === 'worker' ? '/worker/report-booking' : '/client/report-booking';
        router.push({ pathname, params: { bookingId: booking.booking_id } } as unknown as Href);
      }}
    />
  );

  const communicationAndFeedback = (
    <>
      {showPortfolio || showRate ? (
        <View style={styles.section}>
          {showPortfolio ? (
            <AppButton
              variant="secondary"
              label={CLIENT_PORTFOLIO_COPY.viewAction}
              icon={{ android: 'photo_library', ios: 'photo.on.rectangle' }}
              accessibilityLabel={CLIENT_PORTFOLIO_COPY.viewAction}
              onPress={() => {
                router.push({ pathname: CLIENT_PORTFOLIO_PATH, params: { bookingId: booking.booking_id } } as unknown as Href);
              }}
            />
          ) : null}
          {showRate ? (
            isRated ? <Text style={styles.note}>{RATING_COPY.rated}</Text> : <RateWorker bookingId={booking.booking_id} onRated={load} />
          ) : null}
        </View>
      ) : null}
    </>
  );

  // A confirmed booking opens map-first: full-screen map, floating Back, and the booking in a draggable panel.
  const mapFirst = booking.booking_status === 'confirmed' && account?.is_active === true && account.role === role;
  const openVideo = () => router.push({ pathname: role === 'worker' ? '/worker/video' : '/client/video', params: { bookingId: booking.booking_id } } as Href);

  // 1-2. Status and the reference people quote when they call for help.
  const statusBlock = (
    <View style={styles.referenceHeader}>
      <AppChip label={formatBookingStatus(booking.booking_status)} variant={bookingStatusVariant(booking.booking_status)} />
      <View style={styles.referenceCopy}>
        <Text style={styles.note}>Booking reference</Text>
        <Text selectable style={styles.reference}>{booking.booking_id}</Text>
      </View>
    </View>
  );

  // 3-4. The job: what, when, how much.
  const summaryBlock = (
    <View style={styles.summary}>
      <View style={styles.titleRow}>
        <ServiceMark subject={booking.job_title} synchronousGlyph />
        <Text accessibilityRole="header" style={styles.jobTitle}>{booking.job_title}</Text>
      </View>
      <SurfaceGroup>
        <FactRow icon={{ android: 'schedule', ios: 'clock' }} label="Schedule" value={schedule} strong />
        <FactRow icon={{ android: 'account_balance_wallet', ios: 'wallet.pass' }} label="Job budget" value={budget} strong inline />
      </SurfaceGroup>
    </View>
  );

  // 5. The other person, when this status releases them.
  const participantBlock = (
    <View style={[styles.section, suppressProtected && { minHeight: participantHeight.current }]}
      onLayout={event => { if (!suppressProtected) participantHeight.current = event.nativeEvent.layout.height; }}>
      <SectionHeader title={role === 'worker' ? 'Client details' : 'Worker details'} />
      {suppressProtected ? <InlineStatus variant="loading" message="Checking booking details" /> : !released ? (
        <Text style={styles.note}>
          {role === 'worker'
            ? 'Client contact is not available for this booking status.'
            : 'Worker details are not available for this booking status.'}
        </Text>
      ) : participantName ? (
        <View style={styles.panel}>
          <View style={styles.identityRow}>
            <InitialsAvatar name={participantName} accent={colors.accentSubtle} size={48} />
            <View style={styles.identityCopy}>
              <Text style={styles.note}>{role === 'worker' ? 'Your client' : 'Your worker'}</Text>
              <Text style={styles.participantName}>{participantName}</Text>
              <Text selectable style={styles.value}>{counterpartyPhone ?? 'Phone not provided'}</Text>
              {role === 'client' && isClientBooking(booking) ? <>
                <Text style={styles.note}>{formatVerification(booking.worker_is_verified)}</Text>
                <StarRatingDisplay average={booking.worker_rating_avg} count={booking.worker_rating_count} />
              </> : null}
            </View>
          </View>
          {role === 'client' && isClientBooking(booking) ? (
            <View style={styles.detailsList}>
              <DetailLine label="Barangay" value={booking.worker_barangay ?? 'Not provided'} />
              <DetailLine label="Skills" value={formatSkills(booking.worker_skills)} />
            </View>
          ) : null}
          {dialUrl || chatAvailable || inlineMapShown ? <View style={styles.contactActions}>
            {dialUrl ? <AppButton
              variant="secondary"
              label="Call"
              icon={{ android: 'call', ios: 'phone' }}
              accessibilityLabel="Call booking counterpart"
              style={styles.contactButton}
              onPress={() => void Linking.openURL(dialUrl)}
            /> : null}
            {chatAvailable ? <AppButton
              variant={chatVariant}
              label="Open chat"
              icon={{ android: 'chat_bubble_outline', ios: 'bubble.left' }}
              style={styles.contactButton}
              onPress={() => {
                const pathname = role === 'worker' ? '/worker/chat' : '/client/chat';
                router.push({ pathname, params: { bookingId: booking.booking_id } } as Href);
              }}
            /> : null}
            {inlineMapShown ? <AppButton variant="secondary" label="Video call" icon={{ android: 'videocam', ios: 'video' }}
              style={styles.contactButton} onPress={openVideo} /> : null}
          </View> : null}
        </View>
      ) : null}
    </View>
  );

  // 6. Where, only as far as this status authorizes. On the map-first layout the map itself is behind the
  // panel; this section keeps the address, Open in Maps and the role's location sharing details.
  const locationBlock = (sharing: ReactNode) => (
    <View style={[styles.section, suppressProtected && { minHeight: locationHeight.current }]}
      onLayout={event => { if (!suppressProtected) locationHeight.current = event.nativeEvent.layout.height; }}>
      {suppressProtected ? <InlineStatus variant="loading" message="Checking job location" /> : <>
      {sharing ? <View style={styles.section}><SectionHeader title={role === 'worker' ? 'Your live location' : 'Worker location'} />{sharing}</View> : null}
      {/* The address surface titles itself when it shows the exact address. */}
      {!locationHasAddress ? <><SectionHeader title="Job location" /><Text selectable style={styles.body}>{location}</Text></> : null}
      {protectedReleased && exactLocation.status === 'error' ? <Text style={styles.note}>{JOB_LOCATION_COPY.workerLocationGeneric}</Text>
        : workerLocationSurface ? <WorkerAssignedJobLocation surface={workerLocationSurface} mapsNote={mapsNote}
          allowNavigation={role === 'worker'} showMap={!inlineMapShown && !mapFirst}
          onOpenMaps={() => {
            const url = workerLocationSurface.kind === 'exact' ? workerLocationSurface.openInMapsUrl : null;
            void openWorkerMapsUrl(url).then(ok => setMapsNote(ok ? null : JOB_LOCATION_COPY.openInMapsFailed));
          }} /> : null}
      {role === 'worker' && protectedReleased && booking.booking_status === 'confirmed' ? <JobPhotoGallery
        photos={jobPhotos.status === 'ready' ? jobPhotos.photos : []} error={jobPhotos.status === 'error'} /> : null}
      </>}
    </View>
  );

  // 7. The immediate step: payment first, then (Client) completion.
  const paymentAndLifecycle = <>
    {showPayment || paymentUnavailable ? <View style={styles.panel}>
      {showPayment ? jobPaymentReady ? <BookingPayment role={role} bookingId={booking.booking_id} payment={payment}
        jobPaymentMethod={jobPaymentMethod} onChanged={load} />
        : <Text style={styles.note}>Could not load the agreed payment method.</Text> : null}
      {paymentUnavailable ? <Text style={styles.note}>Could not load the authoritative payment state. Payment and lifecycle actions are unavailable.</Text> : null}
    </View> : null}
    {!lifecycleAtBottom && showLifecycle ? (
      <BookingLifecycle
        role={role}
        bookingId={booking.booking_id}
        showCompletion={actionPresentation.showCompletion}
        showCancellation={actionPresentation.showCancellation}
        onChanged={load}
      >
        {communicationAndFeedback}
      </BookingLifecycle>
    ) : communicationAndFeedback}
  </>;

  const supportingRecord = <>
    {/* 8. About the job, always in view. */}
    {booking.job_description ? <View style={styles.section}>
      <SectionHeader title="About the job" />
      <Text selectable style={styles.jobDescription}>{booking.job_description}</Text>
    </View> : null}

    {/* 9. Supporting record. */}
    <View style={styles.section}>
      <SectionHeader title="Booking record" />
      <SurfaceGroup>
        <DetailLine label="Booked" value={bookedAt} />
        {/* Only a value takes a row: SurfaceGroup draws a divider for every element it is given. */}
        {completedAt ? <DetailLine label="Completed" value={completedAt} /> : null}
        {/* V4 #19: an array, not a fragment, so SurfaceGroup divides each fact into its own row. */}
        {cancellation ? [
          <DetailLine key="cancelled-by" label="Cancelled by" value={cancellation.cancelledBy} />,
          <DetailLine key="cancel-reason" label="Reason" value={cancellation.reason} />,
          ...(cancellation.detail ? [<DetailLine key="cancel-detail" label="Details" value={cancellation.detail} />] : []),
          <DetailLine key="cancelled-at" label="Cancelled" value={formatDetailDateTime(cancellation.cancelledAt)} />,
        ] : null}
      </SurfaceGroup>
    </View>

    {showReport ? (
      <View style={styles.supportSection}>
        <SectionHeader title="Help and reporting" />
        {reportMessage}
      </View>
    ) : null}

    {/* 10. Cancellation is last: consequential, quiet, and away from the forward action. */}
    {lifecycleAtBottom && (showLifecycle || (suppressProtected && controlsHeight.current > 0)) ? <View
      style={[styles.destructiveArea, suppressProtected && { minHeight: controlsHeight.current }]}
      onLayout={event => { if (!suppressProtected) controlsHeight.current = event.nativeEvent.layout.height; }}>
      {suppressProtected ? <InlineStatus variant="loading" message="Checking booking controls" /> : <>
      <Text style={styles.note}>Booking controls</Text>
      <BookingLifecycle role={role} bookingId={booking.booking_id} showCompletion={actionPresentation.showCompletion}
        showCancellation={actionPresentation.showCancellation} onChanged={load} />
      </>}
    </View> : null}
  </>;

  const refreshControl = <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />;

  if (!mapFirst) {
    return (
      <RefinementThemeProvider>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={refreshControl}
      >
        {statusBlock}
        {summaryBlock}
        {participantBlock}
        {locationBlock(null)}
        {paymentAndLifecycle}
        {supportingRecord}
      </ScrollView>
      </RefinementThemeProvider>
    );
  }

  // Map-first layout. The floating header replaces the stack header; the panel reserves the space under it.
  const headerBottom = safeArea.top + ui.spacing.sm + ui.size.iconButton + ui.spacing.sm;
  const panel = (sharing: LocationPanel) => (
    <BookingSheet topReserve={headerBottom} onCollapsedHeight={setPanelHeight} refreshControl={refreshControl}
      header={<>
        <View style={styles.sheetTitleRow}>
          <AppChip label={formatBookingStatus(booking.booking_status)} variant={bookingStatusVariant(booking.booking_status)} />
          <Text accessibilityRole="header" numberOfLines={2} style={styles.sheetTitle}>{booking.job_title}</Text>
        </View>
        <Text numberOfLines={2} style={styles.note}>{[schedule, budget].filter(Boolean).join(' · ')}</Text>
        {sharing.primary}
      </>}>
      {statusBlock}
      {summaryBlock}
      {participantBlock}
      {locationBlock(sharing.secondary)}
      {paymentAndLifecycle}
      {supportingRecord}
    </BookingSheet>
  );
  return (
    <RefinementThemeProvider>
    <View style={styles.mapScreen}>
      <Stack.Screen options={{ headerShown: false }} />
      {inlineMapShown && account ? <BookingLocationMap key={`${account.id}:${booking.booking_id}:${pinsSession}`} bookingId={booking.booking_id}
        accountId={account.id} role={role} destination={exactLocation.status === 'ready' ? exactLocation.location.pin : null}
        insets={mapInsetsForPanel({ headerBottom, collapsedHeight: panelHeight })} renderPanel={panel} /> : <>
        <View style={[StyleSheet.absoluteFill, styles.mapPlaceholder]}><InlineStatus variant="loading" message="Checking job location" /></View>
        {panel({ primary: <InlineStatus variant="loading" message="Checking location sharing" />, secondary: null })}
      </>}
      <View pointerEvents="box-none" style={[styles.floatingHeader, { top: safeArea.top + ui.spacing.sm }]}>
        <AppIconButton icon={{ android: 'arrow_back', ios: 'chevron.left' }} accessibilityLabel="Navigate up" style={styles.floatingButton}
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace((role === 'worker' ? '/worker/bookings' : '/client/bookings') as Href); }} />
        <View style={styles.floatingTitle}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.floatingTitleText}>Booking details</Text>
        </View>
      </View>
    </View>
    </RefinementThemeProvider>
  );
}

function DetailLine({ label, value }: { label: string; value: string | null }) {
  const ui = useUiTheme();
  const styles = createStyles(ui);

  if (value === null) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius } = ui;
  const styles = StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    mapScreen: { flex: 1, backgroundColor: colors.surfaceSunken },
    mapPlaceholder: { backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
    floatingHeader: { position: 'absolute', left: spacing.gutter, right: spacing.gutter, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    floatingButton: { backgroundColor: colors.surfaceRaised, ...ui.elevation.floating },
    floatingTitle: {
      flexShrink: 1, minHeight: ui.size.iconButton, justifyContent: 'center', paddingHorizontal: spacing.lg,
      borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, ...ui.elevation.floating,
    },
    floatingTitleText: { ...type.label, color: colors.textPrimary },
    sheetTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
    sheetTitle: { ...type.sectionTitle, color: colors.textPrimary, flexShrink: 1 },
    content: {
      flexGrow: 1,
      backgroundColor: colors.canvas,
      padding: spacing.gutter,
      gap: spacing.xl,
      paddingBottom: spacing.xxxxl,
    },
    center: {
      flex: 1,
      backgroundColor: colors.canvas,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.gutter,
    },
    section: {
      gap: spacing.md,
    },
    referenceHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
    referenceCopy: { flexShrink: 1, gap: spacing.xxs },
    reference: { ...type.helper, fontVariant: ['tabular-nums'], color: colors.textPrimary, maxWidth: '100%' },
    summary: { gap: spacing.lg },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    jobTitle: { ...type.screenTitle, color: colors.textPrimary, flex: 1, flexShrink: 1 },
    panel: {
      gap: spacing.lg,
      padding: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
      borderCurve: 'continuous',
    },
    identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    identityCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
    participantName: { ...type.sectionTitle, color: colors.textPrimary },
    detailsList: { gap: spacing.xs },
    contactActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    contactButton: { flexGrow: 1, flexBasis: 130, paddingHorizontal: spacing.md },
    jobDescription: { ...type.body, color: colors.textPrimary },
    supportSection: { gap: spacing.md },
    destructiveArea: { gap: spacing.md, paddingTop: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
    body: {
      ...type.body,
      color: colors.textSecondary,
    },
    value: { ...type.body, color: colors.textPrimary },
    detailRow: {
      minHeight: ui.size.listRowMinHeight,
      maxWidth: '100%',
      justifyContent: 'center',
      gap: spacing.xxs,
      paddingVertical: spacing.sm,
    },
    detailLabel: {
      ...type.helper,
      color: colors.textSecondary,
    },
    detailValue: {
      ...type.body,
      maxWidth: '100%',
      flexShrink: 1,
      color: colors.textPrimary,
    },
    note: {
      ...type.helper,
      color: colors.textSecondary,
    },
  });

  return styles;
}

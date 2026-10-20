import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppIconButton } from '@/components/app-icon-button';
import { BookingSheet } from '@/components/booking-sheet';
import BookingDetails from '@/components/booking-details';
import { FactLine } from '@/components/booking-card-parts';
import { FindingCard, SupportEntry } from '@/components/finding-worker';
import { FindingWorkerCarousel } from '@/components/finding-worker-carousel';
import { FindingJobMap } from '@/components/finding-job-map';
import { RefinementThemeProvider } from '@/components/refinement-theme';
import { InlineStatus } from '@/components/inline-status';
import { JobPhotoGallery } from '@/components/job-photo-gallery';
import { SectionHeader } from '@/components/section-header';
import { ClientJobLocation } from '@/components/client-job-location';
import { CancelOpenJob } from '@/components/cancel-open-job';
import { SkillMatchTheme } from '@/constants/theme';
import { mapInsetsForPanel, type SheetPosition } from '@/lib/booking-sheet';
import { sessionRouteContinuation } from '@/lib/session-route-continuation';
import { createCoalescedInvalidation, NOTIFICATION_INSERTED, subscribeInvalidation, userNotificationsTopic } from '@/lib/realtime';
import { formatCardDateTime } from '@/lib/date-time';
import { formatJobPaymentLabel } from '@/lib/job-payment';
import { jobStatusLabel, jobStatusVariant } from '@/lib/status-presentation';
import { loadClientBookings, type ClientBooking } from '@/lib/booking-records';
import { listJobPhotos, type SignedJobPhoto } from '@/lib/job-photos';
import { useAccount } from '@/providers/account-provider';
import { useSession, type SessionLifetime } from '@/providers/session-provider';
import { useClientJobs, type PostedJob } from '@/providers/client-jobs-provider';
import { useClientPostJobDraft } from '@/providers/client-post-job-draft-provider';

const { colors, type, spacing, size, radius, elevation } = SkillMatchTheme.ui;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type ReadOperation = { isCurrent: () => boolean; locationCurrent: () => boolean; cancel: () => void };
type DetailRead = { operation: ReadOperation; job: PostedJob; ownerId: string; revision: number; lifetime: SessionLifetime | null | undefined; ownerCurrent: () => boolean; photos: SignedJobPhoto[]; photoState: 'loading' | 'ready' | 'error'; booking: ClientBooking | null; bookingState: 'loading' | 'ready' | 'error' };

/** A pushed detail owns one cancellable presentation lifetime, never a module cache. */
export default function ClientJobDetails({ jobId, postingWarning }: { jobId: string | null; postingWarning?: string }) {
  const router = useRouter(), session = useSession(), account = useAccount();
  const { sessionRevision = -1, sessionLifetime, isSessionRevisionCurrent, subscribeSessionLifecycle } = session;
  const { clientDraftTermination } = account;
  const draft = useClientPostJobDraft();
  const { jobs, isLoading, loadError, refresh } = useClientJobs();
  const { ownerId, isOwnerCurrent } = draft;
  const pathname = usePathname(), params = useGlobalSearchParams();
  const job = typeof jobId === 'string' && uuid.test(jobId) ? jobs.find(row => row.id === jobId) : undefined;
  const [focused, setFocused] = useState(false), [active, setActive] = useState(AppState.currentState === 'active');
  const [read, setRead] = useState<DetailRead | null>(null), [locationOpen, setLocationOpen] = useState(false);
  // Map-first open job (UI-V3): the collapsed panel's height frames the pin; an edited location re-reads the pin.
  const [panelHeight, setPanelHeight] = useState(0), [locationRevision, setLocationRevision] = useState(0);
  const [sheetPosition, setSheetPosition] = useState<SheetPosition>(() => sessionRouteContinuation.sheetPosition({
    access: 'client', ownerId, lifetime: sessionLifetime, pathname, params,
  }) ?? 'collapsed');
  const rememberSheetPosition = useCallback((position: SheetPosition) => {
    setSheetPosition(position);
    sessionRouteContinuation.rememberSheetPosition({ access: 'client', ownerId, lifetime: sessionLifetime, pathname, params }, position);
  }, [ownerId, sessionLifetime, pathname, params]);
  const safeArea = useSafeAreaInsets();
  const [retry, setRetry] = useState(0), [refreshing, setRefreshing] = useState(false), [refreshError, setRefreshError] = useState(false);
  const operation = useRef<ReadOperation | null>(null);
  const refreshCancellation = useRef<(() => void) | null>(null);
  const committed = useRef({ authorized: false, job, jobId, focused: false, active: false });
  let authorized = false;
  try {
    authorized = account.status === 'resolved' && account.account?.id === ownerId && account.account.role === 'client' &&
      account.account.is_active && account.hasCurrentConsent === true && !session.isSessionLoading && !session.sessionError &&
      session.recoveryStatus === 'idle' && session.sessionLifetime?.ownerId === ownerId && session.sessionLifetime.isCurrent() &&
      (session.isSessionRevisionCurrent?.(session.sessionRevision ?? -1) ?? false) && isOwnerCurrent();
  } catch { /* unavailable authority is inaccessible */ }
  const cancel = useCallback(() => { operation.current?.cancel(); refreshCancellation.current?.(); }, []);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => { cancel(); setFocused(false); };
  }, [cancel]));
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      cancel(); setActive(state === 'active');
      // Android may emit active again (or batch background/active). Cancellation
      // still hides the old read; every resume must start a fresh invocation.
      if (state === 'active') setRetry(value => value + 1);
    });
    return () => listener.remove();
  }, [cancel]);
  // Layout cleanup also runs when Suspense hides committed content. Replay starts
  // a new invocation; a later same-owner authorization never revives its predecessor.
  useLayoutEffect(() => {
    committed.current = { authorized, job, jobId, focused, active };
    cancel();
    if (!authorized || !job || !focused || !active || !subscribeSessionLifecycle || !clientDraftTermination) return cancel;
    const revision = sessionRevision, lifetime = sessionLifetime;
    let cancelled = false;
    const releases: (() => void)[] = [];
    const next: ReadOperation = {
      isCurrent: () => {
        if (cancelled || operation.current !== next) return false;
        const current = committed.current;
        let valid = false;
        try { valid = current.authorized && current.focused && current.active && AppState.currentState === 'active' &&
          current.job?.id === job.id && lifetime?.isCurrent() === true &&
          isSessionRevisionCurrent?.(revision) === true && isOwnerCurrent(); } catch { /* fail closed */ }
        if (!valid) next.cancel();
        return valid;
      },
      locationCurrent: () => next.isCurrent() && committed.current.job?.status === 'open',
      cancel: () => {
        if (cancelled) return;
        cancelled = true; releases.splice(0).forEach(release => release());
        if (operation.current === next) { operation.current = null; setRead(null); setLocationOpen(false); setRefreshError(false); setRefreshing(false); }
      },
    };
    operation.current = next;
    const register = (release: () => void) => { if (cancelled) release(); else releases.push(release); };
    register(subscribeSessionLifecycle(next.cancel));
    if (!cancelled) register(clientDraftTermination.subscribe(next.cancel));
    if (!next.isCurrent()) return cancel;
    const initial: DetailRead = { operation: next, job, ownerId, revision, lifetime, ownerCurrent: isOwnerCurrent,
      photos: [], photoState: 'loading', booking: null, bookingState: 'loading' };
    // Subscriptions remain through display, so settled protected media/actions
    // disappear synchronously on lifecycle termination as well as during reads.
    if (next.isCurrent()) void listJobPhotos({ clientId: ownerId, jobId: job.id, isOperationCurrent: next.isCurrent })
      .then(photos => { if (next.isCurrent()) setRead(previous => ({ ...(previous?.operation === next ? previous : initial), photos, photoState: 'ready' })); })
      .catch(() => { if (next.isCurrent()) setRead(previous => ({ ...(previous?.operation === next ? previous : initial), photos: [], photoState: 'error' })); });
    if (next.isCurrent()) void loadClientBookings()
      .then(bookings => { if (next.isCurrent()) setRead(previous => ({ ...(previous?.operation === next ? previous : initial), booking: bookings.find(row => row.job_id === job.id) ?? null, bookingState: 'ready' })); })
      .catch(() => { if (next.isCurrent()) setRead(previous => ({ ...(previous?.operation === next ? previous : initial), booking: null, bookingState: 'error' })); });
    return () => { next.cancel(); refreshCancellation.current?.(); };
  }, [authorized, job, jobId, focused, active, ownerId, isOwnerCurrent, sessionRevision, sessionLifetime,
    isSessionRevisionCurrent, subscribeSessionLifecycle, clientDraftTermination, retry, cancel]);
  // Acceptance already emits an own-user notification. It invalidates the
  // waiting presentation; only fresh participant/Job reads establish a booking.
  // Depend on the route lifetime, not the Job object changed by refresh.
  useEffect(() => {
    if (!authorized || !focused || !active || !jobId || !uuid.test(jobId)) return;
    let live = true;
    const current = () => {
      const latest = committed.current;
      try { return live && latest.authorized && latest.focused && latest.active && latest.jobId === jobId &&
        AppState.currentState === 'active' && sessionLifetime?.isCurrent() === true &&
        isSessionRevisionCurrent?.(sessionRevision) === true && isOwnerCurrent(); } catch { return false; }
    };
    const rereader = createCoalescedInvalidation(async () => {
      if (!current()) return;
      try { await refresh(ownerId); }
      catch { if (current()) setRefreshError(true); }
      if (current()) setRetry(value => value + 1);
    });
    const invalidate = () => {
      if (!current()) return;
      operation.current?.cancel();
      rereader.invalidate();
    };
    const unsubscribe = subscribeInvalidation({ topic: userNotificationsTopic(ownerId), events: [NOTIFICATION_INSERTED],
      onInvalidate: invalidate,
      onUnavailable: () => { if (current()) { operation.current?.cancel(); setRefreshError(true); } },
    });
    return () => { live = false; rereader.cancel(); unsubscribe(); };
  }, [authorized, focused, active, jobId, ownerId, refresh, sessionLifetime, sessionRevision, isSessionRevisionCurrent, isOwnerCurrent]);
  async function reload() {
    const state = committed.current, revision = session.sessionRevision ?? -1, lifetime = session.sessionLifetime;
    if (!jobId || !uuid.test(jobId) || !state.authorized || !state.focused || !state.active || state.jobId !== jobId || refreshing ||
      !session.subscribeSessionLifecycle || !account.clientDraftTermination) return;
    refreshCancellation.current?.();
    let cancelled = false;
    const releases: (() => void)[] = [];
    const end = () => {
      cancelled = true; releases.splice(0).forEach(release => release());
      if (refreshCancellation.current === end) { setRefreshing(false); setRefreshError(false); }
    };
    refreshCancellation.current = end;
    const current = () => {
      const latest = committed.current;
      try { return !cancelled && latest.authorized && latest.focused && latest.active && latest.jobId === jobId &&
        AppState.currentState === 'active' && lifetime?.isCurrent() === true && session.isSessionRevisionCurrent?.(revision) === true && isOwnerCurrent(); }
      catch { end(); return false; }
    };
    const register = (release: () => void) => { if (cancelled) release(); else releases.push(release); };
    register(session.subscribeSessionLifecycle(end));
    if (!cancelled) register(account.clientDraftTermination.subscribe(end));
    if (!current()) { end(); return; }
    setRefreshing(true); setRefreshError(false);
    try { await refresh(ownerId); if (current()) setRetry(value => value + 1); }
    catch { if (current()) setRefreshError(true); }
    finally {
      if (current()) setRefreshing(false);
      cancelled = true; releases.splice(0).forEach(release => release());
      // Retain only local presentation cleanup after releasing subscriptions.
      // A settled missing-row error still belongs to this focus lifetime.
    }
  }
  // Render gate removes private presentation before effects commit an unresolved
  // authority snapshot. The operation latch itself is only mutated in effects/events.
  const visible = authorized && focused && active && job && read?.job === job && read.ownerId === ownerId &&
    read.revision === sessionRevision && read.lifetime === sessionLifetime && read.ownerCurrent === isOwnerCurrent;
  // Waiting for the first eligible acceptance (D-003): the reference "being connected" presentation. Same facts.
  const finding = Boolean(visible && !refreshing && !refreshError && job && job.status === 'open' && read?.bookingState === 'ready' && !read.booking);
  const budgetText = job?.budget == null ? 'Not set' : `₱${job.budget.toLocaleString()}`;

  // Same route, real participant Booking ID, existing role/payment/share logic.
  // Retain the sheet detent across the Job -> Booking presentation change.
  if (visible && read?.bookingState === 'ready' && read.booking) {
    return <BookingDetails role="client" bookingId={read.booking.booking_id}
      initialSheetPosition={sheetPosition} onSheetPositionChange={rememberSheetPosition} postingWarning={postingWarning} />;
  }

  // Waiting for a worker (owner reference): the whole map with the swipe-up panel, as on a confirmed booking.
  // Collapsed, the panel shows the status and the searching carousel; swiped up, the job card and its details.
  if (authorized && focused && active && job) {
    const headerBottom = safeArea.top + spacing.sm + size.iconButton + spacing.sm;
    const closeLocation = () => { setLocationOpen(false); setLocationRevision(value => value + 1); };
    return <RefinementThemeProvider>
      <View style={styles.mapScreen}>
        <Stack.Screen options={{ headerShown: false }} />
        {finding && read ? <FindingJobMap jobId={job.id} clientId={ownerId} isOperationCurrent={read.operation.locationCurrent} revision={locationRevision}
          insets={mapInsetsForPanel({ headerBottom, collapsedHeight: panelHeight })} /> : null}
        <BookingSheet topReserve={headerBottom} onCollapsedHeight={setPanelHeight} panelName="Job details panel"
          initialPosition={sheetPosition} onPositionChange={rememberSheetPosition}
          header={<>
            {/* D-003 wording: the job is open to eligible workers; nobody is picked or assigned until one accepts. */}
            {finding ? <>
              <Text accessibilityRole="header" style={styles.findingTitle}>Hang tight! Your job is open to eligible workers.</Text>
              <FindingWorkerCarousel blendInto={colors.surfaceRaised} />
            </> : <>
              <AppChip label={jobStatusLabel(job.status)} variant={jobStatusVariant(job.status)} />
              <Text accessibilityRole="header" style={styles.findingTitle}>{job.title}</Text>
              <InlineStatus variant={read?.bookingState === 'error' || refreshError ? 'error' : 'loading'}
                message={read?.bookingState === 'error' ? 'Booking context is unavailable. Retry to check assignment.' : refreshError ? 'Could not refresh job status. Please retry.' : job.status !== 'open' && visible && read?.bookingState === 'ready' ? `Job status: ${jobStatusLabel(job.status)}. No current booking context.` : 'Checking job and booking status…'} />
            </>}
          </>}>
          {postingWarning ? <InlineStatus variant="error" message={postingWarning} /> : null}
          {finding ? <View style={styles.findingHead}>
            <AppChip label="Waiting for a worker" variant="info" />
            <Text selectable style={styles.line}>Waiting for acceptance. The first eligible worker to accept books it, and you will be notified.</Text>
          </View> : null}
          <FindingCard title={job.title} id={job.id} time={formatCardDateTime(job.scheduled_at) ?? 'No schedule'}
            payment={{ label: job.payment_method_readable && job.payment_method ? formatJobPaymentLabel(job.payment_method) : 'Cash / QR', qr: job.payment_method === 'qrph' }}
            amount={budgetText}>
            <FactLine label="Skills" value={job.skills.length ? job.skills.join(', ') : 'None'} />
          </FindingCard>
          <SupportEntry onPress={() => router.push('/client/help')} />
          <View style={styles.section}>
            <SectionHeader title="Description" />
            <Text selectable style={styles.body}>{job.description?.trim() ? job.description : 'No description provided.'}</Text>
          </View>
          <View style={styles.section}>
            <SectionHeader title="Photos" />
            <JobPhotoGallery photos={visible && read ? read.photos : []} loading={!visible || read?.photoState === 'loading'} error={visible && read?.photoState === 'error'} />
            {visible && read?.photoState === 'ready' && read.photos.length === 0 ? <Text selectable style={styles.line}>No job photos.</Text> : null}
          </View>
          {finding && read ? <AppButton label="View or edit location" variant="secondary" onPress={() => { if (read.operation.locationCurrent()) setLocationOpen(true); }} /> : null}
          {refreshError ? <InlineStatus variant="error" message="Could not refresh. Displayed facts may be out of date. Please retry." /> : null}
          <AppButton label="Refresh job" variant="ghost" loading={refreshing} disabled={isLoading} onPress={() => void reload()} />
          {finding && read ? <CancelOpenJob jobId={job.id} clientId={ownerId}
            isCurrent={read.operation.locationCurrent}
            onStatusChanged={() => void reload()}
            onCancelled={() => {
              void refresh(ownerId).catch(() => {});
              router.replace('/client');
            }} /> : null}
        </BookingSheet>
        <View pointerEvents="box-none" style={[styles.floatingHeader, { top: safeArea.top + spacing.sm }]}>
          <AppIconButton icon={{ android: 'arrow_back', ios: 'chevron.left' }} accessibilityLabel="Navigate up" style={styles.floatingButton}
            onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/client'); }} />
          <View style={styles.floatingTitle}>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.floatingTitleText}>Job details</Text>
          </View>
        </View>
        {locationOpen && finding && read ? <ClientJobLocation jobId={job.id} clientId={ownerId}
          dismissalLabel="Back to job details" isOperationCurrent={read.operation.locationCurrent} onClose={closeLocation} /> : null}
      </View>
    </RefinementThemeProvider>;
  }
  return <View style={[styles.scroll, styles.container]}>
    <InlineStatus variant={!authorized || !focused || !active || isLoading ? 'loading' : loadError ? 'error' : 'empty'}
      message={!authorized || !focused || !active ? 'Job details are unavailable until access is current.' : isLoading ? 'Loading your job…' : loadError ?? 'This job is unavailable.'} />
    {refreshError ? <InlineStatus variant="error" message="Could not refresh. Please retry." /> : null}
    {authorized && focused && active ? <AppButton label="Refresh job" variant="ghost" loading={refreshing} onPress={() => void reload()} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.canvas },
  container: { padding: spacing.gutter, paddingBottom: spacing.xxxxl, gap: spacing.xl, backgroundColor: colors.canvas },
  header: { gap: spacing.sm, alignItems: 'flex-start' },
  title: { ...type.screenTitle, color: colors.textPrimary },
  body: { ...type.body, color: colors.textPrimary },
  line: { ...type.helper, color: colors.textSecondary },
  section: { gap: spacing.md },
  findingHead: { gap: spacing.sm, alignItems: 'flex-start' },
  findingTitle: { ...type.sectionTitle, color: colors.textPrimary },
  mapScreen: { flex: 1, backgroundColor: colors.surfaceSunken },
  floatingHeader: { position: 'absolute', left: spacing.gutter, right: spacing.gutter, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  floatingButton: { backgroundColor: colors.surfaceRaised, ...elevation.floating },
  floatingTitle: {
    flexShrink: 1, minHeight: size.iconButton, justifyContent: 'center', paddingHorizontal: spacing.lg,
    borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, ...elevation.floating,
  },
  floatingTitleText: { ...type.label, color: colors.textPrimary },
});

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { FactRow } from '@/components/fact-row';
import { InlineStatus } from '@/components/inline-status';
import { JobPhotoGallery } from '@/components/job-photo-gallery';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
import { ClientJobLocation } from '@/components/client-job-location';
import { SkillMatchTheme } from '@/constants/theme';
import { formatCardDateTime } from '@/lib/date-time';
import { formatClientPostedPaymentLine } from '@/lib/job-payment';
import { jobStatusLabel, jobStatusVariant } from '@/lib/status-presentation';
import { loadClientBookings, type ClientBooking } from '@/lib/booking-records';
import { listJobPhotos, type SignedJobPhoto } from '@/lib/job-photos';
import { useAccount } from '@/providers/account-provider';
import { useSession, type SessionLifetime } from '@/providers/session-provider';
import { useClientJobs, type PostedJob } from '@/providers/client-jobs-provider';
import { useClientPostJobDraft } from '@/providers/client-post-job-draft-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type ReadOperation = { isCurrent: () => boolean; locationCurrent: () => boolean; cancel: () => void };
type DetailRead = { operation: ReadOperation; job: PostedJob; ownerId: string; revision: number; lifetime: SessionLifetime | null | undefined; ownerCurrent: () => boolean; photos: SignedJobPhoto[]; photoState: 'loading' | 'ready' | 'error'; booking: ClientBooking | null; bookingState: 'loading' | 'ready' | 'error' };

/** A pushed detail owns one cancellable presentation lifetime, never a module cache. */
export default function ClientJobDetails({ jobId }: { jobId: string | null }) {
  const router = useRouter(), session = useSession(), account = useAccount();
  const { sessionRevision = -1, sessionLifetime, isSessionRevisionCurrent, subscribeSessionLifecycle } = session;
  const { clientDraftTermination } = account;
  const draft = useClientPostJobDraft();
  const { jobs, isLoading, loadError, refresh } = useClientJobs();
  const { ownerId, isOwnerCurrent } = draft;
  const job = typeof jobId === 'string' && uuid.test(jobId) ? jobs.find(row => row.id === jobId) : undefined;
  const [focused, setFocused] = useState(false), [active, setActive] = useState(AppState.currentState === 'active');
  const [read, setRead] = useState<DetailRead | null>(null), [locationOpen, setLocationOpen] = useState(false);
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
    const listener = AppState.addEventListener('change', state => { cancel(); setActive(state === 'active'); });
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
  return <ScrollView style={styles.scroll} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
    {!authorized || !focused || !active ? <InlineStatus variant="loading" message="Job details are unavailable until access is current." /> :
      isLoading ? <InlineStatus variant="loading" message="Loading your job…" /> :
        !job ? <InlineStatus variant={loadError ? 'error' : 'empty'} message={loadError ?? 'This job is unavailable.'} /> : <>
          <View style={styles.header}>
            <AppChip label={jobStatusLabel(job.status)} variant={jobStatusVariant(job.status)} />
            <Text selectable accessibilityRole="header" style={styles.title}>{job.title}</Text>
          </View>
          <SurfaceGroup>
            <FactRow icon={{ android: 'schedule', ios: 'clock' }} label="Schedule" value={formatCardDateTime(job.scheduled_at) ?? 'No schedule'} strong selectable />
            <FactRow icon={{ android: 'account_balance_wallet', ios: 'wallet.pass' }} label="Budget" value={job.budget === null ? 'Not set' : `₱${job.budget.toLocaleString()}`} strong inline />
            {job.payment_method_readable ? <FactRow icon={{ android: 'receipt_long', ios: 'doc.plaintext' }} label="Payment" value={formatClientPostedPaymentLine(job.payment_method)} /> : null}
            <FactRow icon={{ android: 'handyman', ios: 'wrench.and.screwdriver' }} label="Skills" value={job.skills.length ? job.skills.join(', ') : 'None'} />
          </SurfaceGroup>
          <View style={styles.section}>
            <SectionHeader title="Description" />
            <Text selectable style={styles.body}>{job.description?.trim() ? job.description : 'No description provided.'}</Text>
          </View>
          {visible ? <>
            {read.bookingState === 'loading' ? <InlineStatus variant="loading" message="Loading booking context…" /> :
              read.bookingState === 'error' ? <InlineStatus variant="error" message="Booking context is unavailable. Retry to check assignment." /> :
                read.booking ? <View style={styles.section}>
                  <SectionHeader title="Booking" />
                  <Text selectable style={styles.body}>{read.booking.booking_status === 'confirmed' ? 'Assigned' : `Booking status: ${read.booking.booking_status}`}</Text>
                  <AppButton label="Booking details" variant="primary" onPress={() => {
                    if (read.operation.isCurrent() && read.booking) router.push({ pathname: '/client/booking-details', params: { bookingId: read.booking.booking_id } });
                  }} />
                </View> : job.status === 'open' ? <View style={styles.section}>
                  <SectionHeader title="Waiting for a worker" />
                  <Text selectable style={styles.body}>Waiting for acceptance</Text>
                  <Text style={styles.line}>Eligible workers can see this job. The first worker to accept books it, and you will be notified.</Text>
                </View> : <Text selectable style={styles.line}>No current booking context.</Text>}
            <View style={styles.section}>
              <SectionHeader title="Photos" />
              <JobPhotoGallery photos={read.photos} loading={read.photoState === 'loading'} error={read.photoState === 'error'} />
              {read.photoState === 'ready' && read.photos.length === 0 ? <Text selectable style={styles.line}>No job photos.</Text> : null}
            </View>
            {job.status === 'open' ? <AppButton label="View or edit location" variant="secondary" onPress={() => { if (read.operation.locationCurrent()) setLocationOpen(true); }} /> : null}
            {locationOpen && job.status === 'open' ? <ClientJobLocation jobId={job.id} clientId={ownerId}
              dismissalLabel="Back to job details" isOperationCurrent={read.operation.locationCurrent} onClose={() => setLocationOpen(false)} /> : null}
          </> : <InlineStatus variant="loading" message="Loading protected job details…" />}
        </>}
    {refreshError ? <InlineStatus variant="error" message="Could not refresh. Displayed facts may be out of date. Please retry." /> : null}
    {authorized && focused && active ? <AppButton label="Refresh job" variant="ghost" loading={refreshing} disabled={isLoading}
      onPress={() => void reload()} /> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.canvas },
  container: { padding: spacing.gutter, paddingBottom: spacing.xxxxl, gap: spacing.xl, backgroundColor: colors.canvas },
  header: { gap: spacing.sm, alignItems: 'flex-start' },
  title: { ...type.screenTitle, color: colors.textPrimary },
  body: { ...type.body, color: colors.textPrimary },
  line: { ...type.helper, color: colors.textSecondary },
  section: { gap: spacing.md },
});

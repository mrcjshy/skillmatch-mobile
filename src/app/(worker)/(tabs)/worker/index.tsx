import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, AppState, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ActiveBookingHomeCard } from '@/components/active-booking-home-card';
import { AppSegment } from '@/components/app-segment';
import { AvailabilityControl } from '@/components/availability-control';
import { groupPosition } from '@/components/grouped-row';
import { HomeStickyHeader } from '@/components/home-header';
import { InlineStatus } from '@/components/inline-status';
import { JobOpportunityCompactCard } from '@/components/job-opportunity-compact-card';
import { MotionFlatList, MotionView, useListReveal, useMotion } from '@/components/motion';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchMascot } from '@/components/skillmatch-mascot';
import { AppSymbol } from '@/components/app-symbol';
import { useUiTheme, type UiTheme, RefinementThemeProvider } from '@/components/refinement-theme';
import { loadWorkerBookings, type WorkerBooking } from '@/lib/booking-records';
import { firstNameFromFullName } from '@/lib/initials';
import {
  JOB_OPPORTUNITY_COPY,
  loadMyJobOpportunities,
  type JobOpportunity,
} from '@/lib/job-opportunities';
import {
  createCoalescedInvalidation,
  JOB_OPPORTUNITIES_CHANGED,
  subscribeInvalidation,
  workerOpportunitiesTopic,
} from '@/lib/realtime';
import {
  IDENTITY_COPY,
  getMyIdentitySubmission,
  workerHomeIdentityNotice,
  type IdentityDocumentStatus,
} from '@/lib/worker-identity';
import {
  WORKER_JOB_SORT_COPY,
  WORKER_JOB_SORT_OPTIONS,
  loadJobPostedAt,
  sortWorkerOpportunities,
  type WorkerJobSort,
} from '@/lib/worker-opportunity-sort';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';
import { useWorkerProfile } from '@/providers/worker-profile-provider';



export default function WorkerHome() {
  const { account } = useAccount();
  const { session, sessionRevision } = useSession();
  return <RefinementThemeProvider><WorkerHomeContent key={`${account?.id}:${account?.role}:${account?.is_active}:${session?.user.id}:${sessionRevision}`} /></RefinementThemeProvider>;
}

function WorkerHomeContent() {
  const ui = useUiTheme();
  const { colors } = ui;
  const styles = createStyles(ui);

  const { account } = useAccount();
  const { session, sessionRevision, isSessionRevisionCurrent } = useSession();
  const {
    availability,
    isLoading,
    loadError,
    isVerified,
    isPersistingAvailability,
    persistAvailabilityError,
    persistAvailability,
    refreshPersistedAvailabilityError,
    refreshPersistedAvailability,
  } = useWorkerProfile();
  const router = useRouter();

  const [oppLoading, setOppLoading] = useState(false);
  const [oppError, setOppError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<JobOpportunity[]>([]);
  const [bookings, setBookings] = useState<WorkerBooking[]>([]);
  const [identityStatus, setIdentityStatus] = useState<IdentityDocumentStatus | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const accountId = account?.id;
  const ownerScope = `${accountId}:${sessionRevision ?? 'legacy'}`;
  const [contentOwner] = useState(ownerScope);
  const canRenderOwnedContent = contentOwner === ownerScope && account?.role === 'worker' &&
    account.is_active && session?.user.id === accountId;
  const authorizedWorker = Boolean(accountId && account?.role === 'worker' && account.is_active && session?.user.id === accountId);
  const canLoadOpportunities = Boolean(
    accountId && session?.user.id === accountId && account?.role === 'worker' && account.is_active &&
    !isLoading && !loadError && availability === 'available'
  );
  const refreshOpportunities = useRef<(() => void) | null>(null);
  const opportunityRequest = useRef<Promise<JobOpportunity[]> | null>(null);
  const refreshStatus = useRef<(() => Promise<unknown>) | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Display order only (Wave 7). Best match is the server's ranking as received.
  const [sort, setSort] = useState<WorkerJobSort>('match');
  const [postedAt, setPostedAt] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [postedError, setPostedError] = useState(false);
  // The moment Job date order splits upcoming from passed work; taken when the order is chosen.
  const [sortNow, setSortNow] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      if (!authorizedWorker) return;
      let cancelled = false;
      let revision = 0;
      const isCurrent = (readRevision: number) => !cancelled && revision === readRevision && AppState.currentState === 'active' &&
        (sessionRevision === undefined || !isSessionRevisionCurrent || isSessionRevisionCurrent(sessionRevision));
      const read = () => {
        const readRevision = revision;
        return Promise.allSettled([
          refreshPersistedAvailability(),
          loadWorkerBookings().then(rows => { if (isCurrent(readRevision)) setBookings(rows); })
            .catch(() => { if (isCurrent(readRevision)) setBookings([]); }),
          getMyIdentitySubmission().then(row => { if (isCurrent(readRevision)) setIdentityStatus(row?.status ?? null); })
            .catch(() => { if (isCurrent(readRevision)) setIdentityStatus(null); })
            .finally(() => { if (isCurrent(readRevision)) setIdentityReady(true); }),
        ]);
      };
      refreshStatus.current = read;
      void read();
      const listener = AppState.addEventListener('change', state => {
        revision++;
        setBookings([]); setIdentityStatus(null); setIdentityReady(false);
        if (state === 'active') void read();
      });
      return () => { cancelled = true; if (refreshStatus.current === read) refreshStatus.current = null; listener.remove(); };
    }, [authorizedWorker, sessionRevision, isSessionRevisionCurrent, refreshPersistedAvailability])
  );

  useFocusEffect(useCallback(() => {
    if (!canLoadOpportunities) return;

    let cancelled = false;
    let firstRead = true;
    let revision = 0;
    // One queue serves mount, focus, SUBSCRIBED/reconnect, and Broadcast.
    // Keep the rendered rows in place during background revalidation.
    const rereader = createCoalescedInvalidation(async () => {
      if (firstRead) {
        firstRead = false;
        setOppLoading(true);
        setOpportunities([]);
        setOppError(null);
      }
      // A prior account/eligibility scope may still have a request in flight.
      // Drain it before starting another; its own cleanup suppresses its result.
      if (opportunityRequest.current) {
        await opportunityRequest.current.catch(() => undefined);
      }
      if (cancelled || AppState.currentState !== 'active') return;
      const readRevision = revision;
      const request = loadMyJobOpportunities();
      opportunityRequest.current = request;
      try {
        const rows = await request;
        if (cancelled || readRevision !== revision) return;
        setOpportunities(rows);
        setOppError(null);
      } catch (error: unknown) {
        if (cancelled || readRevision !== revision) return;
        if (error instanceof Error && error.message) {
          console.warn('[V2-A] list_my_job_opportunities failed:', error.message);
        }
        setOppError(JOB_OPPORTUNITY_COPY.loadFailed);
      } finally {
        if (opportunityRequest.current === request) opportunityRequest.current = null;
        if (!cancelled) setOppLoading(false);
      }
    });
    refreshOpportunities.current = rereader.invalidate;
    // Initial authoritative load must still work when Realtime is unavailable.
    rereader.invalidate();
    const unsubscribe = subscribeInvalidation({
      topic: workerOpportunitiesTopic(),
      events: [JOB_OPPORTUNITIES_CHANGED],
      onInvalidate: rereader.invalidate,
    });

    const listener = AppState.addEventListener('change', state => {
      revision++;
      setOpportunities([]);
      setOppLoading(true);
      if (state === 'active') rereader.invalidate();
    });

    return () => {
      cancelled = true;
      listener.remove();
      refreshOpportunities.current = null;
      rereader.cancel();
      unsubscribe();
    };
  }, [canLoadOpportunities]));

  // Defined after queue setup: focus never starts a separate competing read.
  useFocusEffect(
    useCallback(() => {
      if (accountId && canLoadOpportunities) refreshOpportunities.current?.();
    }, [accountId, canLoadOpportunities])
  );

  // One pull refreshes the whole Home through the same reads focus, resume and live updates use.
  const refreshHome = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const status = refreshStatus.current?.();
      refreshOpportunities.current?.();
      await Promise.allSettled([status, opportunityRequest.current]);
    } finally {
      setRefreshing(false);
    }
  };

  const firstName = firstNameFromFullName(account?.full_name ?? '');
  const identityNotice = workerHomeIdentityNotice(isVerified, identityStatus);
  const profileReady = !isLoading && !loadError;
  // Authoritative rows from list_my_job_opportunities; nothing is shown while a read is unsettled.
  const rankedJobs = canRenderOwnedContent && canLoadOpportunities && !oppLoading && !oppError ? opportunities : [];
  const jobs = sortWorkerOpportunities(rankedJobs, sort, { now: sortNow, postedAt });
  // Motion only explains changes: arriving rows fade in once, re-sorted rows glide to their places.
  // Order, count and the fixed Sort by control are untouched; reduced motion makes both immediate.
  const motion = useMotion();
  const rowEnter = useListReveal(jobs.map(job => job.job_id));
  const missingPostedKey = sort === 'posted' ? rankedJobs.filter(job => !postedAt.has(job.job_id)).map(job => job.job_id).join(',') : '';
  const jobsStatusKind = !profileReady ? null
    : availability !== 'available' ? 'busy' : oppLoading ? 'loading' : oppError ? 'error' : 'empty';
  const jobsStatus = !profileReady ? null
    : availability !== 'available' ? <InlineStatus variant="note" message="Set your status to Available to see matching jobs." />
      : oppLoading ? <InlineStatus variant="loading" message="Loading available jobs…" />
        : oppError ? <InlineStatus variant="error" message={oppError} />
          : <InlineStatus variant="empty" message="No matching jobs right now." illustration={<SkillMatchMascot pose="empty" />} />;

  // Posting times are read only when Date posted is chosen, for listed jobs not yet known.
  useEffect(() => {
    if (!missingPostedKey) return;
    let cancelled = false;
    loadJobPostedAt(missingPostedKey.split(','))
      .then(rows => {
        if (cancelled) return;
        setPostedAt(previous => new Map([...previous, ...rows]));
        setPostedError(false);
      })
      .catch(() => { if (!cancelled) setPostedError(true); });
    return () => { cancelled = true; };
  }, [missingPostedKey]);

  return (
    <View style={styles.screen}>
      <HomeStickyHeader name={firstName} role="worker">
        {isLoading ? (
          <Text style={styles.headerNote}>Loading your profile…</Text>
        ) : loadError ? (
          <Text style={styles.headerNote}>Work status unavailable</Text>
        ) : (
          <View style={styles.statusRow}>
            <AvailabilityControl
              compact
              value={availability}
              onChange={(status) => {
                void persistAvailability(status);
              }}
              disabled={isPersistingAvailability}
            />
            {isPersistingAvailability ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
        )}
        {/* Current work stays in reach with the header; it renders nothing without a confirmed booking. */}
        <ActiveBookingHomeCard
          role="worker"
          compact
          bookings={canRenderOwnedContent ? bookings : []}
          onPressPrimary={(booking) =>
            router.push({
              pathname: '/worker/booking-details',
              params: { bookingId: booking.booking_id },
            } as unknown as Href)
          }
          onPressViewAll={() => router.push({ pathname: '/worker/bookings', params: { segment: 'active' } } as unknown as Href)}
        />
        {/* One fixed surface: opportunity controls share the existing Home header. */}
        <View style={styles.opportunityHeader}>
          <SectionHeader
            title="Available jobs"
            trailing={jobs.length > 0 ? <Text style={styles.count}>{jobs.length === 1 ? '1 job' : `${jobs.length} jobs`}</Text> : undefined}
          />
          {jobs.length > 1 ? (
            <View style={styles.sort}>
              <Text style={styles.sortLabel} accessible={false} importantForAccessibility="no">{WORKER_JOB_SORT_COPY.label}</Text>
              <AppSegment
                accessibilityLabel={WORKER_JOB_SORT_COPY.label}
                options={WORKER_JOB_SORT_OPTIONS}
                value={sort}
                onChange={(next) => { setSortNow(Date.now()); setSort(next); }}
              />
              {sort === 'posted' && postedError ? <InlineStatus variant="note" message={WORKER_JOB_SORT_COPY.postedUnavailable} /> : null}
            </View>
          ) : null}
        </View>
      </HomeStickyHeader>

      <MotionFlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={jobs}
        keyExtractor={job => job.job_id}
        itemLayoutAnimation={motion.rowLayout}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refreshHome(); }} tintColor={colors.accent} colors={[colors.accent]} />}
        ListHeaderComponent={
          <View style={styles.lead}>
            {loadError ? <View style={styles.inset}><InlineStatus variant="error" message={loadError} /></View> : null}
            {persistAvailabilityError ? <View style={styles.inset}><InlineStatus variant="error" message={persistAvailabilityError} /></View> : null}
            {refreshPersistedAvailabilityError ? <View style={styles.inset}><InlineStatus variant="error" message={refreshPersistedAvailabilityError} /></View> : null}

            {canRenderOwnedContent && profileReady && identityReady && identityNotice !== 'none' ? (
              <View style={styles.notice} accessibilityRole="summary">
                <AppSymbol name={{ android: 'warning', ios: 'exclamationmark.triangle' }} size={20} tintColor={colors.warning} />
                <View style={styles.noticeCopy}>
                  <Text style={styles.noticeHeadline}>
                    {identityNotice === 'rejected' ? IDENTITY_COPY.homeRejectedHeadline : IDENTITY_COPY.homePendingHeadline}
                  </Text>
                  {(identityNotice === 'rejected' ? IDENTITY_COPY.homeRejectedBody : IDENTITY_COPY.homePendingBody).map((line) => (
                    <Text key={line} style={styles.noticeBody}>
                      {line}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <MotionView entering={rowEnter(item.job_id)} style={styles.inset}>
            <JobOpportunityCompactCard
              compact
              opportunity={item}
              position={groupPosition(index, jobs.length)}
              onPress={() => router.push({ pathname: '/worker/opportunity-details', params: { jobId: item.job_id } } as unknown as Href)}
            />
          </MotionView>
        )}
        // Keyed by kind so an empty result settles in after the spinner; loading, busy and error
        // states change at once (no motion on errors).
        ListEmptyComponent={jobsStatus ? (
          <MotionView key={jobsStatusKind} entering={jobsStatusKind === 'empty' ? motion.fadeIn : undefined} style={styles.inset}>
            {jobsStatus}
          </MotionView>
        ) : null}
      />
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    list: { flex: 1, backgroundColor: colors.canvas },
    content: {
      flexGrow: 1,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxxxl,
    },
    // Notices scroll with the rows; opportunity controls stay in the existing fixed header.
    lead: { gap: spacing.lg },
    opportunityHeader: { gap: spacing.sm, paddingTop: spacing.md },
    inset: { paddingHorizontal: spacing.gutter },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    headerNote: { ...type.helper, color: colors.textSecondary, minHeight: size.minTarget, textAlignVertical: 'center' },
    count: { ...type.label, color: colors.textSecondary },
    sort: { gap: spacing.sm },
    sortLabel: { ...type.label, color: colors.textSecondary },
    notice: {
      marginHorizontal: spacing.gutter,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.control,
      backgroundColor: colors.warningTint,
      borderCurve: 'continuous',
    },
    noticeCopy: { flex: 1, gap: spacing.xs },
    noticeHeadline: { ...type.bodyEmphasis, color: colors.warning },
    noticeBody: { ...type.body, color: colors.textPrimary },
  });

  return styles;
}

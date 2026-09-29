import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { InlineStatus } from '@/components/inline-status';
import { WorkerOpportunityJobLocation } from '@/components/job-location-map';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { formatOpportunityPaymentLine } from '@/lib/job-payment';
import { loadWorkerBookings } from '@/lib/booking-records';
import {
  createWorkerAcceptHandoff,
  type WorkerAcceptFocus,
} from '@/lib/worker-accept-handoff-focus';
import {
  ACCEPT_JOB_COPY,
  JOB_OPPORTUNITY_COPY,
  acceptJobNotice,
  acceptJobOpportunity,
  formatLocationScoreLine,
  formatOpportunityArea,
  formatOpportunityBudget,
  formatOpportunityMatchLine,
  formatOpportunitySchedule,
  formatRatingScoreLine,
  formatSkillScoreLine,
  loadMyJobOpportunities,
  loadOpportunityRequiredSkills,
  type AcceptJobNotice,
  type JobOpportunity,
  type SkillRef,
} from '@/lib/job-opportunities';
import { createOpportunityLocationAccess, getMyOpportunityLocation, type OpportunityLocation } from '@/lib/opportunity-location';
import { JOB_OPPORTUNITIES_CHANGED, subscribeInvalidation, workerOpportunitiesTopic } from '@/lib/realtime';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RequirementsState =
  | { status: 'loading' }
  | { status: 'ready'; skills: SkillRef[] }
  | { status: 'error' };

export default function JobOpportunityDetails({ jobId }: { jobId: string | null }) {
  const { account } = useAccount();
  const { session } = useSession();
  return <OpportunityDetails key={`${account?.id}:${account?.is_active}:${account?.role}:${session?.user.id}:${jobId}`} jobId={jobId} />;
}

function OpportunityDetails({ jobId }: { jobId: string | null }) {
  const { account } = useAccount();
  const { session } = useSession();
  const router = useRouter();
  const workerId = account?.id;
  const sessionUserId = session?.user.id;
  const activeWorker = account?.role === 'worker' && account.is_active;

  const [location, setLocation] = useState<OpportunityLocation | null>(null);
  const accessRef = useRef<ReturnType<typeof createOpportunityLocationAccess> | null>(null);
  const [opportunity, setOpportunity] = useState<JobOpportunity | null>(null);
  const [requirements, setRequirements] = useState<RequirementsState>({ status: 'loading' });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [notice, setNotice] = useState<AcceptJobNotice | null>(null);
  const [handoff] = useState(createWorkerAcceptHandoff);
  const acceptanceFocus = useRef<WorkerAcceptFocus | null>(null);
  const currentIdentity = useRef<{
    workerId: string | undefined;
    sessionUserId: string | undefined;
    jobId: string | null;
    activeWorker: boolean;
  } | null>(null);

  // Layout timing closes the gap before passive focus-dependency cleanup.
  // Use the session's user id: token refresh must not restart a handoff.
  useLayoutEffect(() => {
    currentIdentity.current = { workerId, sessionUserId, jobId, activeWorker };
    return () => { currentIdentity.current = null; };
  }, [workerId, sessionUserId, jobId, activeWorker]);

  useFocusEffect(useCallback(() => {
    if (!activeWorker || !workerId || sessionUserId !== workerId ||
        jobId === null || !UUID_PATTERN.test(jobId)) return;
    const focus = handoff.focus({
      workerId,
      sessionUserId,
      jobId,
      isIdentityCurrent: () => {
        const current = currentIdentity.current;
        return current?.activeWorker === true && current.workerId === workerId &&
          current.sessionUserId === sessionUserId && current.jobId === jobId;
      },
      acceptJob: acceptJobOpportunity,
      readBookings: loadWorkerBookings,
      onState: ({ pending, result, handoffFailed }) => {
        if (result && ['accepted', 'unavailable', 'ineligible', 'forbidden'].includes(result.status)) {
          accessRef.current?.invalidate();
        }
        setIsAccepting(pending);
        setAccepted(result?.status === 'accepted');
        setNotice(handoffFailed ? {
          tone: 'success',
          headline: ACCEPT_JOB_COPY.accepted,
          detail: ACCEPT_JOB_COPY.bookingHandoffFailed,
        } : result ? acceptJobNotice(result) : null);
      },
      onNavigate: (bookingId) => router.replace({
        pathname: '/worker/booking-details',
        params: { bookingId },
      } as unknown as Href),
    });
    acceptanceFocus.current = focus;
    return () => {
      focus.cancel();
      if (acceptanceFocus.current === focus) acceptanceFocus.current = null;
    };
  }, [activeWorker, workerId, sessionUserId, jobId, handoff, router]));

  useFocusEffect(useCallback(() => {
    if (!activeWorker || !workerId || sessionUserId !== workerId || !jobId || !UUID_PATTERN.test(jobId)) {
      setLocation(null); setOpportunity(null); setIsLoading(false);
      setLoadError(JOB_OPPORTUNITY_COPY.unavailable);
      return;
    }
    const access = createOpportunityLocationAccess({
      jobId, readOpportunities: loadMyJobOpportunities, readLocation: getMyOpportunityLocation,
      onState: (state) => {
        setLocation(state.location);
        setOpportunity(state.opportunity);
        setIsLoading(state.status === 'loading');
        setLoadError(state.status === 'error' ? JOB_OPPORTUNITY_COPY.loadFailed :
          state.status === 'unavailable' ? JOB_OPPORTUNITY_COPY.unavailable : null);
      },
    });
    accessRef.current = access;
    const revalidate = () => {
      if (AppState.currentState === 'active') void access.refresh();
      else access.invalidate();
    };
    revalidate();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void access.refresh();
      else access.invalidate();
    });
    const unsubscribe = subscribeInvalidation({
      topic: workerOpportunitiesTopic(), events: [JOB_OPPORTUNITIES_CHANGED], onInvalidate: revalidate,
      onUnavailable: () => access.invalidate(),
    });
    return () => {
      appState.remove(); unsubscribe(); access.cancel();
      if (accessRef.current === access) accessRef.current = null;
    };
  }, [activeWorker, workerId, sessionUserId, jobId]));

  const loadRequirements = useCallback(async (id: string) => {
    setRequirements({ status: 'loading' });
    try {
      const skills = await loadOpportunityRequiredSkills(id);
      setRequirements({ status: 'ready', skills });
    } catch (error: unknown) {
      if (error instanceof Error && error.message) {
        console.warn('[V3-1 P3] required skills load failed:', error.message);
      }
      setRequirements({ status: 'error' });
    }
  }, []);

  const loadedJobId = opportunity?.job_id ?? null;

  /* eslint-disable react-hooks/set-state-in-effect -- requirements follow the loaded job id */
  useEffect(() => {
    if (loadedJobId === null) return;
    const run = { cancelled: false };
    loadRequirements(loadedJobId).catch(() => {
      if (!run.cancelled) setRequirements({ status: 'error' });
    });
    return () => {
      run.cancelled = true;
    };
  }, [loadedJobId, loadRequirements]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function retry() {
    if (!isAccepting) await accessRef.current?.refresh();
  }

  async function refresh() {
    if (isRefreshing || isAccepting) return;
    setIsRefreshing(true);
    try { await accessRef.current?.refresh(); }
    finally { setIsRefreshing(false); }
  }

  async function handleAccept() {
    const focus = acceptanceFocus.current;
    if (!focus?.isCurrent() || opportunity === null || opportunity.job_id !== jobId ||
        isAccepting || accepted || isLoading || isRefreshing) return;
    const result = await focus.accept();
    if (!focus.isCurrent() || result === null) return;
    if (result.status === 'unavailable' || result.status === 'ineligible' || result.status === 'accepted') {
      accessRef.current?.invalidate();
    }
  }

  if (accepted) {
    return (
      <View style={styles.center}>
        <InlineStatus variant="note" headline={notice?.headline ?? ACCEPT_JOB_COPY.accepted}
          message={notice?.detail ?? ACCEPT_JOB_COPY.accepted} />
        <AppButton label="View bookings" variant="secondary"
          onPress={() => router.replace('/worker/bookings' as Href)} />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <InlineStatus variant="loading" message={JOB_OPPORTUNITY_COPY.loading} />
      </View>
    );
  }

  if (loadError || opportunity === null) {
    return (
      <View style={styles.center}>
        <InlineStatus
          variant="error"
          message={loadError ?? JOB_OPPORTUNITY_COPY.unavailable}
          action={<AppButton label="Retry" variant="secondary" onPress={retry} disabled={isAccepting} />}
        />
      </View>
    );
  }

  const area = formatOpportunityArea(opportunity.barangay, opportunity.city);
  const budget = formatOpportunityBudget(opportunity.budget);
  const schedule = formatOpportunitySchedule(opportunity.scheduled_at);
  const acceptDisabled = isAccepting || accepted || isLoading || isRefreshing;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {notice ? (
        <InlineStatus
          variant="note"
          headline={notice.detail ? notice.headline : undefined}
          message={notice.detail ?? notice.headline}
        />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.jobTitle}>{opportunity.title}</Text>
        <Text style={styles.match}>{formatOpportunityMatchLine(opportunity.total_points)}</Text>
        {opportunity.description ? <Text style={styles.body}>{opportunity.description}</Text> : null}

        <View style={styles.summaryPanel}>
          <DetailLine label="Schedule" value={schedule} />
          <DetailLine label="Budget" value={budget} />
          <DetailLine label="Area" value={area} />
          <Text style={styles.detailValue}>{formatOpportunityPaymentLine(opportunity.payment_method)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Required skills" />
        {requirements.status === 'loading' ? (
          <InlineStatus variant="loading" message={JOB_OPPORTUNITY_COPY.loadingRequirements} />
        ) : requirements.status === 'error' ? (
          <Text style={styles.note}>{JOB_OPPORTUNITY_COPY.requirementsFailed}</Text>
        ) : requirements.skills.length === 0 ? (
          <Text style={styles.note}>{JOB_OPPORTUNITY_COPY.noRequirements}</Text>
        ) : (
          <View style={styles.skillWrap}>
            {requirements.skills.map((skill) => (
              <AppChip key={skill.id} label={skill.name} variant="neutral" />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <WorkerOpportunityJobLocation location={location} />
      </View>

      <View style={styles.section}>
        <SectionHeader title="Match score" />
        <View style={styles.summaryPanel}>
          <Text style={styles.detailValue}>{formatSkillScoreLine(opportunity.skill_points)}</Text>
          <Text style={styles.detailValue}>{formatLocationScoreLine(opportunity.location_points)}</Text>
          <Text style={styles.detailValue}>{formatRatingScoreLine(opportunity.rating_points)}</Text>
        </View>
      </View>

      <AppButton
        variant="primary"
        label={accepted ? 'Acceptance submitted' : 'Accept'}
        loading={isAccepting}
        disabled={acceptDisabled}
        onPress={handleAccept}
        accessibilityLabel={`Accept ${opportunity.title}`}
      />
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
  section: {
    gap: spacing.md,
  },
  jobTitle: {
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  match: {
    ...type.sectionTitle,
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
  skillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  note: {
    ...type.helper,
    color: colors.textSecondary,
  },
});

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { FactRow } from '@/components/fact-row';
import { FormMessage } from '@/components/form-message';
import { InlineStatus } from '@/components/inline-status';
import { AppSymbol } from '@/components/app-symbol';
import { MotionView, useMotion } from '@/components/motion';
import { WorkerOpportunityJobLocation } from '@/components/job-location-map';
import { SectionHeader } from '@/components/section-header';
import { Collapsible } from '@/components/ui/collapsible';
import { ServiceMark } from '@/components/service-mark';
import { GuidanceSection } from '@/components/skill-gap';
import { SurfaceGroup } from '@/components/surface-group';
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
import { computeSkillGap, loadMyWorkerSkills, type WorkerSkillRef } from '@/lib/skill-gap';
import { createOpportunityLocationAccess, getMyOpportunityLocation, type OpportunityLocation } from '@/lib/opportunity-location';
import { JOB_OPPORTUNITIES_CHANGED, subscribeInvalidation, workerOpportunitiesTopic } from '@/lib/realtime';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

const { colors, type, spacing, size } = SkillMatchTheme.ui;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RequirementsState =
  | { status: 'loading' }
  | { status: 'ready'; skills: SkillRef[]; workerSkills: WorkerSkillRef[] }
  | { status: 'error' };

export default function JobOpportunityDetails({ jobId }: { jobId: string | null }) {
  const { account } = useAccount();
  const { session } = useSession();
  return <OpportunityDetails key={`${account?.id}:${account?.is_active}:${account?.role}:${session?.user.id}:${jobId}`} jobId={jobId} />;
}

function OpportunityDetails({ jobId }: { jobId: string | null }) {
  const insets = useSafeAreaInsets();
  const motion = useMotion();
  const { account } = useAccount();
  const { session } = useSession();
  const router = useRouter();
  const workerId = account?.id;
  const sessionUserId = session?.user.id;
  const activeWorker = account?.role === 'worker' && account.is_active;

  const [location, setLocation] = useState<OpportunityLocation | null>(null);
  const accessRef = useRef<ReturnType<typeof createOpportunityLocationAccess> | null>(null);
  const requirementsAuthority = useRef<string | null>(null);
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
      requirementsAuthority.current = null;
      setLocation(null); setOpportunity(null); setIsLoading(false);
      setLoadError(JOB_OPPORTUNITY_COPY.unavailable);
      return;
    }
    const access = createOpportunityLocationAccess({
      jobId, readOpportunities: loadMyJobOpportunities, readLocation: getMyOpportunityLocation,
      onState: (state) => {
        requirementsAuthority.current = state.opportunity?.job_id ?? null;
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
      requirementsAuthority.current = null;
      appState.remove(); unsubscribe(); access.cancel();
      if (accessRef.current === access) accessRef.current = null;
    };
  }, [activeWorker, workerId, sessionUserId, jobId]));

  const loadRequirements = useCallback(async (id: string, isCurrent: () => boolean) => {
    setRequirements({ status: 'loading' });
    try {
      if (!account) throw new Error('Worker account unavailable');
      const [skills, workerSkills] = await Promise.all([
        loadOpportunityRequiredSkills(id),
        loadMyWorkerSkills(account),
      ]);
      if (isCurrent()) setRequirements({ status: 'ready', skills, workerSkills: workerSkills ?? [] });
    } catch (error: unknown) {
      if (error instanceof Error && error.message) {
        console.warn('[V3-1 P3] required skills load failed:', error.message);
      }
      if (isCurrent()) setRequirements({ status: 'error' });
    }
  }, [account]);

  const loadedJobId = opportunity?.job_id ?? null;

  useEffect(() => {
    if (loadedJobId === null) return;
    const run = { cancelled: false };
    const isCurrent = () => !run.cancelled && AppState.currentState === 'active' && requirementsAuthority.current === loadedJobId;
    loadRequirements(loadedJobId, isCurrent).catch(() => {
      if (isCurrent()) setRequirements({ status: 'error' });
    });
    return () => {
      run.cancelled = true;
    };
  }, [loadedJobId, loadRequirements]);

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
    // The booking confirmation moment: one short check reveal, then the unchanged words and action.
    // Decorative only; the status text below carries the meaning for TalkBack.
    return (
      <View style={styles.center}>
        <MotionView entering={motion.successEnter} style={styles.successMark}
          accessible={false} importantForAccessibility="no-hide-descendants">
          <AppSymbol synchronousGlyph name={{ android: 'check_circle', ios: 'checkmark.circle.fill' }} size={32} tintColor={colors.success} style={styles.successSymbol} />
        </MotionView>
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
  const skillGap =
    requirements.status === 'ready'
      ? computeSkillGap(requirements.skills, requirements.workerSkills)
      : null;

  const paymentLine = formatOpportunityPaymentLine(opportunity.payment_method);

  return (
    <View style={styles.screen}>
    <ScrollView
      style={styles.scroll}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {notice ? (
        <View style={styles.pad}>
          <FormMessage
            tone={notice.tone === 'success' ? 'success' : notice.tone === 'warning' ? 'warning' : 'info'}
            message={notice.detail ? `${notice.headline} ${notice.detail}` : notice.headline}
          />
        </View>
      ) : null}

      {/* Decision header: what the work is, then when, where, how much. */}
      <View style={[styles.pad, styles.heading]}>
        <ServiceMark subject={opportunity.title} synchronousGlyph />
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.jobTitle}>{opportunity.title}</Text>
          <Text style={styles.match}>{formatOpportunityMatchLine(opportunity.total_points)}</Text>
        </View>
      </View>

      <View style={styles.pad}>
        <SurfaceGroup>
          <FactRow icon={{ android: 'schedule', ios: 'clock' }} label="Schedule" value={schedule} strong />
          <FactRow icon={{ android: 'location_on', ios: 'mappin' }} label="Area" value={area} />
          <FactRow icon={{ android: 'account_balance_wallet', ios: 'wallet.pass' }} label="Job budget" value={budget} strong inline />
          <FactRow icon={{ android: 'receipt_long', ios: 'doc.plaintext' }} label="Payment" value={paymentLine} />
        </SurfaceGroup>
      </View>

      <View style={[styles.pad, styles.section]}>
        <SectionHeader title="Skills for this job" />
        {requirements.status === 'loading' ? (
          <InlineStatus variant="loading" message={JOB_OPPORTUNITY_COPY.loadingRequirements} />
        ) : requirements.status === 'error' ? (
          <Text style={styles.note}>{JOB_OPPORTUNITY_COPY.requirementsFailed}</Text>
        ) : requirements.skills.length === 0 ? (
          <Text style={styles.note}>{JOB_OPPORTUNITY_COPY.noRequirements}</Text>
        ) : skillGap === null ? null : (
          <>
            <Text style={styles.detailLabel}>Matched</Text>
            {skillGap.matchedSkills.length === 0 ? (
              <Text style={styles.note}>No listed skills matched yet.</Text>
            ) : (
              <View style={styles.skillWrap}>
                {skillGap.matchedSkills.map((skill) => (
                  <AppChip key={skill.id} label={skill.name} variant="positive" />
                ))}
              </View>
            )}
            <Text style={styles.detailLabel}>Missing</Text>
            {skillGap.missingSkills.length === 0 ? (
              <Text style={styles.note}>You meet all listed skill requirements.</Text>
            ) : (
              <View style={styles.skillWrap}>
                {skillGap.missingSkills.map((skill) => (
                  <AppChip key={skill.id} label={skill.name} variant="warning" />
                ))}
              </View>
            )}
          </>
        )}
      </View>

      {opportunity.description ? (
        <View style={[styles.pad, styles.section]}>
          <SectionHeader title="Description" />
          <Text style={styles.body}>{opportunity.description}</Text>
        </View>
      ) : null}

      <View style={[styles.pad, styles.section]}>
        <SectionHeader title="Location" subtitle="Only the general area is shown before you accept." />
        <WorkerOpportunityJobLocation location={location} />
      </View>

      <View style={styles.pad}>
        <SurfaceGroup>
          <Collapsible title="Match details" subtitle={formatOpportunityMatchLine(opportunity.total_points)} contained={false}
            icon={{ android: 'check_circle', ios: 'checkmark.circle' }}>
            <View style={styles.scoreBreakdown}>
              <Text style={styles.scoreValue}>{formatSkillScoreLine(opportunity.skill_points)}</Text>
              <Text style={styles.scoreValue}>{formatLocationScoreLine(opportunity.location_points)}</Text>
              <Text style={styles.scoreValue}>{formatRatingScoreLine(opportunity.rating_points)}</Text>
            </View>
          </Collapsible>
        </SurfaceGroup>
      </View>

      {requirements.status === 'ready' && requirements.skills.length > 0 && skillGap ? (
        <View style={styles.pad}>
          <GuidanceSection
            jobId={opportunity.job_id}
            missingSkillNames={skillGap.missingSkills.map((skill) => skill.name)}
            buttonLabel="View skill gap guidance"
          />
        </View>
      ) : null}

    </ScrollView>
    <View style={[styles.actionDock, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={styles.dockSummary} accessible accessibilityLabel={`Job budget: ${budget}`}>
        <Text style={styles.dockCaption}>Job budget</Text>
        <Text style={styles.dockAmount}>{budget}</Text>
      </View>
      <View style={styles.acceptAction}>
      <AppButton
        variant="primary"
        label={accepted ? 'Acceptance submitted' : 'Accept'}
        loading={isAccepting}
        disabled={acceptDisabled}
        onPress={handleAccept}
        accessibilityLabel={`Accept ${opportunity.title}`}
      />
      </View>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: spacing.xl },
  pad: { marginHorizontal: spacing.gutter },
  center: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', padding: spacing.gutter },
  successMark: { width: size.actionCircle, height: size.actionCircle, borderRadius: size.actionCircle / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successTint },
  // Centre the native glyph's actual bounds within AppSymbol's reserved scaled box.
  successSymbol: { alignItems: 'center', justifyContent: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headingCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  jobTitle: { ...type.screenTitle, color: colors.textPrimary, flexShrink: 1 },
  match: { ...type.label, color: colors.textSecondary, flexShrink: 1 },
  section: { gap: spacing.md },
  body: { ...type.body, color: colors.textPrimary },
  scoreBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  scoreValue: { ...type.helper, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  detailLabel: { ...type.label, color: colors.textSecondary },
  skillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { ...type.helper, color: colors.textSecondary },
  actionDock: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.gutter, paddingTop: spacing.md, backgroundColor: colors.canvas, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  dockSummary: { gap: spacing.xxs },
  dockCaption: { ...type.helper, color: colors.textSecondary },
  dockAmount: { ...type.money, color: colors.textPrimary },
  acceptAction: { flex: 1, minWidth: 148 },
});

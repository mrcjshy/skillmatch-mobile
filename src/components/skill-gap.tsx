import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppNotice } from '@/components/app-notice';
import { InlineStatus } from '@/components/inline-status';
import { SectionHeader } from '@/components/section-header';
import { SkillMatchTheme } from '@/constants/theme';
import { formatCardDateTime } from '@/lib/date-time';
import {
  computeSkillGap,
  GapOpportunity,
  loadJobRequiredSkills,
  loadMyOpportunities,
  loadMyWorkerSkills,
  PROFICIENCY_LABEL,
  SKILL_GAP_COPY,
  SkillRef,
  WorkerSkillRef,
} from '@/lib/skill-gap';
import {
  createGuidanceRunner,
  guidanceOwnerKey,
  GuidanceState,
  SKILL_GAP_GUIDANCE_COPY,
} from '@/lib/skill-gap-guidance';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

/**
 * The Skill Gap screen body (AI-03, deterministic core).
 *
 * WHAT THIS SCREEN DOES
 * ---------------------
 * Lets the signed-in Worker pick one of their CURRENT Job Opportunities and
 * shows, as a visible equation,
 *
 *     REQUIRED JOB SKILLS  minus  YOUR SKILLS  equals  MISSING SKILLS
 *
 * computed by `computeSkillGap` in src/lib/skill-gap.ts -- a set difference
 * on `skill_id`. Nothing here decides anything: the Jobs come from the trusted
 * zero-argument opportunity RPC, the Worker is the authenticated account, and
 * the gap is arithmetic. Optional guidance is requested separately and can
 * only explain the already-rendered result.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It is not a matching factor and changes no eligibility, score, or booking
 * state. It performs no writes. It never says "qualified" or "eligible":
 * other Stage 1 gates exist that skills alone do not settle.
 *
 * TWO LOADS, BOTH LIFECYCLE-OWNED
 * -------------------------------
 * The base load (opportunities + the Worker's skills) and the per-Job
 * requirements load each originate from exactly one effect whose cleanup
 * owns a cancel flag. Unmount, an account change, Retry, and a change of the
 * selected Job all invalidate the in-flight run, so a late response for Job A
 * can never overwrite Job B's gap; as a second guard the requirements state
 * records which Job it belongs to and is only rendered for that Job.
 *
 * Cancellation covers in-flight runs; ALREADY-RESOLVED state needs an owner,
 * so the base state is tagged with the account id it was loaded for and is
 * only read when that id is the current account's. See the BaseState note.
 *
 * The selected Job is DERIVED from the current opportunity list rather than
 * trusted from state: if the stored selection disappears after a refresh, the
 * first current opportunity (or nothing) is used, and requirements are only
 * ever loaded for a Job that is in the list right now. No free-text Job id.
 *
 * Rendered only inside the protected (worker) group.
 */

/**
 * Every BaseState carries the account id it was resolved for. Cancellation
 * alone is not enough: an ALREADY-RESOLVED state has no owner, so after the
 * provider switches from Worker A to Worker B, A's opportunities and skills
 * would stay on screen until B's load finished. Tagging makes that
 * structurally impossible -- state whose `accountId` is not the current
 * account is never rendered and never feeds the Job derivation.
 *
 * `accountId` is null only for the initial pre-account loading state.
 */
type BaseState =
  | { kind: 'loading'; accountId: string | null }
  | { kind: 'error'; accountId: string }
  | { kind: 'no-profile'; accountId: string }
  | {
      kind: 'ready';
      accountId: string;
      opportunities: GapOpportunity[];
      mySkills: WorkerSkillRef[];
    };

type RequirementsState =
  | { kind: 'idle' }
  | { kind: 'loading'; jobId: string }
  | { kind: 'error'; jobId: string }
  | { kind: 'ready'; jobId: string; required: SkillRef[] };

export default function SkillGap() {
  const { account } = useAccount();
  const [base, setBase] = useState<BaseState>({ kind: 'loading', accountId: null });
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<RequirementsState>({ kind: 'idle' });
  const [retryToken, setRetryToken] = useState(0);
  const [requirementsToken, setRequirementsToken] = useState(0);

  const loadBase = useCallback(
    async (run: { cancelled: boolean }) => {
      if (!account) return;
      // Captured up front: every write this run makes is stamped with the
      // account it was actually loaded for.
      const accountId = account.id;
      try {
        const [opportunities, mySkills] = await Promise.all([
          loadMyOpportunities(),
          loadMyWorkerSkills(account),
        ]);
        if (run.cancelled) return;
        setBase(
          mySkills === null
            ? { kind: 'no-profile', accountId }
            : { kind: 'ready', accountId, opportunities, mySkills }
        );
      } catch {
        if (run.cancelled) return;
        // Codes only, never row contents; nothing here is worth logging.
        setBase({ kind: 'error', accountId });
      }
    },
    [account]
  );

  /**
   * Every base load originates here, and only here, so the effect cleanup
   * owns the cancel flag for all of them (the AI-02 pattern). An account
   * change recreates `loadBase`; Retry advances `retryToken`.
   *
   * react-hooks/set-state-in-effect rejects any setState reachable from an
   * effect. Fetch-on-mount is the established convention in this codebase and
   * worker/bookings.tsx (N11-UI) records why the rule is narrowed rather than
   * satisfied. The suppression is confined to the two effects on this screen.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; see the note above */
  useEffect(() => {
    const run = { cancelled: false };
    void loadBase(run);
    return () => {
      run.cancelled = true;
    };
  }, [loadBase, retryToken]);

  /**
   * Base state belonging to the CURRENT account, or null. Null covers the
   * first render, a signed-out account, and the window after an account change
   * while the new Worker's load is still pending -- in all three the screen
   * shows its loading state rather than the previous Worker's data.
   */
  const currentBase = account !== null && base.accountId === account.id ? base : null;

  // The Job actually compared: the stored selection if it is still in the
  // current list, else the first current opportunity, else none. Derived from
  // the current account's opportunities ONLY, so an account change drives
  // `effectiveJobId` to null, which cleans up the previous Job's requirements
  // run instead of letting Worker B inherit Worker A's selected Job.
  const opportunities =
    currentBase !== null && currentBase.kind === 'ready' ? currentBase.opportunities : [];
  const selectedJob =
    opportunities.find((o) => o.jobId === selectedJobId) ?? opportunities[0] ?? null;
  const effectiveJobId = selectedJob === null ? null : selectedJob.jobId;

  /**
   * Requirements load for the effective Job. Re-runs (and cancels the prior
   * run) whenever that Job changes or Retry advances `requirementsToken`.
   */
  useEffect(() => {
    if (effectiveJobId === null) {
      setRequirements({ kind: 'idle' });
      return;
    }
    const jobId = effectiveJobId;
    const run = { cancelled: false };
    setRequirements({ kind: 'loading', jobId });
    void (async () => {
      try {
        const required = await loadJobRequiredSkills(jobId);
        if (run.cancelled) return;
        setRequirements({ kind: 'ready', jobId, required });
      } catch {
        if (run.cancelled) return;
        setRequirements({ kind: 'error', jobId });
      }
    })();
    return () => {
      run.cancelled = true;
    };
  }, [effectiveJobId, requirementsToken]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function retryBase() {
    setBase({ kind: 'loading', accountId: account?.id ?? null });
    setRetryToken((token) => token + 1);
  }

  function retryRequirements() {
    setRequirementsToken((token) => token + 1);
  }

  if (currentBase === null || currentBase.kind === 'loading') {
    return (
      <View style={styles.center}>
        <InlineStatus variant="loading" message={SKILL_GAP_COPY.loading} />
      </View>
    );
  }

  if (currentBase.kind === 'error') {
    return (
      <View style={styles.center}>
        <InlineStatus
          variant="error"
          message={SKILL_GAP_COPY.loadFailed}
          action={<AppButton label={SKILL_GAP_COPY.retry} variant="secondary" onPress={retryBase} />}
        />
      </View>
    );
  }

  if (currentBase.kind === 'no-profile') {
    return (
      <View style={styles.center}>
        <InlineStatus variant="empty" message={SKILL_GAP_COPY.noProfile} />
      </View>
    );
  }

  if (selectedJob === null) {
    return (
      <View style={styles.center}>
        <InlineStatus variant="empty" message={SKILL_GAP_COPY.noOpportunities} />
      </View>
    );
  }

  // Only requirements that belong to the Job being compared are ever shown.
  const current = requirements.kind !== 'idle' && requirements.jobId === selectedJob.jobId ? requirements : null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <SectionHeader title={SKILL_GAP_COPY.compareWith} />
      <View style={styles.picker} accessibilityRole="radiogroup">
        {opportunities.map((o) => {
          const selected = o.jobId === selectedJob.jobId;
          return (
            <Pressable
              key={o.jobId}
              style={[styles.pickerRow, selected && styles.pickerRowSelected]}
              onPress={() => setSelectedJobId(o.jobId)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.pickerTitle, selected && styles.pickerTitleSelected]}>{o.title}</Text>
              {describeOpportunity(o) === null ? null : (
                <Text style={styles.muted}>{describeOpportunity(o)}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {current === null || current.kind === 'loading' ? (
        <InlineStatus variant="loading" message={SKILL_GAP_COPY.loadingRequirements} />
      ) : current.kind === 'error' ? (
        <InlineStatus
          variant="error"
          message={SKILL_GAP_COPY.requirementsFailed}
          action={
            <AppButton label={SKILL_GAP_COPY.retry} variant="secondary" onPress={retryRequirements} />
          }
        />
      ) : (
        <GapEquation
          required={current.required}
          mine={currentBase.mySkills}
          guidanceKey={guidanceOwnerKey({
            accountId: currentBase.accountId,
            jobId: selectedJob.jobId,
            baseRetry: retryToken,
            requirementsRetry: requirementsToken,
          })}
          jobId={selectedJob.jobId}
        />
      )}
    </ScrollView>
  );
}

/** Display-only second line for a picker row: location and/or device-local schedule. */
function describeOpportunity(o: GapOpportunity): string | null {
  const place = [o.barangay, o.city].filter((p): p is string => p !== null).join(', ');
  let when: string | null = null;
  if (o.scheduledAt !== null) {
    when = formatCardDateTime(o.scheduledAt);
  }
  const parts = [place === '' ? null : place, when].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * Wrapping skill pill. AppChip is height-locked at 28 and clips the Worker
 * `✓ ` prefix plus proficiency suffix, so these match AppChip fills/type
 * with wrap allowed.
 */
function SkillPill({
  label,
  variant = 'neutral',
}: {
  label: string;
  variant?: 'neutral' | 'positive' | 'warning';
}) {
  return (
    <View style={[styles.chip, chipFills[variant]]}>
      <Text style={[styles.chipText, chipLabels[variant]]}>{label}</Text>
    </View>
  );
}

/**
 * The equation. `computeSkillGap` normalizes both sides, so this component
 * renders exactly what the pure function returns and adds nothing.
 */
function GapEquation({
  required,
  mine,
  guidanceKey,
  jobId,
}: {
  required: SkillRef[];
  mine: WorkerSkillRef[];
  guidanceKey: string;
  jobId: string;
}) {
  const gap = computeSkillGap(required, mine);

  if (gap.requiredSkills.length === 0) {
    return (
      <AppCard>
        <Text style={styles.muted}>{SKILL_GAP_COPY.noRequirements}</Text>
      </AppCard>
    );
  }

  const matchedIds = new Set(gap.matchedSkills.map((s) => s.id));
  const hasMissing = gap.missingSkills.length > 0;

  return (
    <>
      <AppCard>
        <Text style={styles.cardTitle}>{SKILL_GAP_COPY.required}</Text>
        <View style={styles.chips}>
          {gap.requiredSkills.map((s) => (
            <SkillPill key={s.id} label={s.name} />
          ))}
        </View>
      </AppCard>

      <Text style={styles.operator}>{SKILL_GAP_COPY.minus}</Text>

      <AppCard>
        <Text style={styles.cardTitle}>{SKILL_GAP_COPY.yours}</Text>
        {gap.workerSkills.length === 0 ? (
          <Text style={styles.muted}>{SKILL_GAP_COPY.noWorkerSkills}</Text>
        ) : (
          <View style={styles.chips}>
            {gap.workerSkills.map((s) => {
              const matched = matchedIds.has(s.id);
              return (
                <SkillPill
                  key={s.id}
                  variant={matched ? 'positive' : 'neutral'}
                  label={`${matched ? '✓ ' : ''}${s.name}${
                    s.proficiency === null ? '' : ` · ${PROFICIENCY_LABEL[s.proficiency]}`
                  }`}
                />
              );
            })}
          </View>
        )}
      </AppCard>

      <Text style={styles.operator}>{SKILL_GAP_COPY.equals}</Text>

      <AppCard variant="status" tone={hasMissing ? 'warning' : 'success'}>
        <Text style={styles.cardTitle}>
          {SKILL_GAP_COPY.missing} · {gap.missingSkills.length}
        </Text>
        {hasMissing ? (
          <>
            <View style={styles.chips}>
              {gap.missingSkills.map((s) => (
                <SkillPill key={s.id} variant="warning" label={`− ${s.name}`} />
              ))}
            </View>
            <AppNotice variant="warning" message={SKILL_GAP_COPY.missingHint} />
          </>
        ) : (
          <Text style={styles.zeroGap}>{SKILL_GAP_COPY.zeroGap}</Text>
        )}
      </AppCard>

      <GuidanceSection
        key={guidanceKey}
        jobId={jobId}
        missingSkillNames={gap.missingSkills.map((skill) => skill.name)}
      />
    </>
  );
}

/**
 * Optional, explicit guidance for exactly one keyed deterministic context.
 * The `key` this is mounted under is owned by account + Job + both AI-03 Retry
 * generations, so any change to those remounts this subtree and the guidance
 * starts idle again. Within one owner, the runner enforces the rest: unmount
 * disposes it, so a late result cannot emit into a replaced owner, and a press
 * while a request is in flight is ignored.
 *
 * Nothing here can change the equation above; it is a subordinate explanation
 * of an already-rendered deterministic result, and its failure is local.
 */
function GuidanceSection({
  jobId,
  missingSkillNames,
}: {
  jobId: string;
  missingSkillNames: readonly string[];
}) {
  const [state, setState] = useState<GuidanceState>({ kind: 'idle' });
  const [runner] = useState(() =>
    createGuidanceRunner({
      jobId,
      missingSkillNames,
      // The deterministic zero-gap sentence is reused, never restated.
      zeroGapCopy: SKILL_GAP_COPY.zeroGap,
    })
  );

  useEffect(() => () => runner.dispose(), [runner]);

  const requestGuidance = useCallback(() => runner.request(setState), [runner]);

  return (
    <AppCard variant="status">
      <Text style={styles.cardTitle}>{SKILL_GAP_GUIDANCE_COPY.title}</Text>

      {state.kind === 'idle' ? (
        <AppButton
          label={SKILL_GAP_GUIDANCE_COPY.get}
          variant="primary"
          onPress={requestGuidance}
        />
      ) : state.kind === 'loading' ? (
        <InlineStatus variant="loading" message={SKILL_GAP_GUIDANCE_COPY.loading} />
      ) : state.kind === 'error' ? (
        <InlineStatus
          variant="error"
          message={SKILL_GAP_GUIDANCE_COPY.unavailable}
          action={
            <AppButton
              label={SKILL_GAP_GUIDANCE_COPY.retry}
              variant="secondary"
              onPress={requestGuidance}
            />
          }
        />
      ) : (
        <>
          <Text style={styles.guidanceText}>{state.guidance}</Text>
          <Text style={styles.muted}>
            {state.source === 'deterministic'
              ? SKILL_GAP_GUIDANCE_COPY.deterministicSource
              : SKILL_GAP_GUIDANCE_COPY.geminiSource}
          </Text>
        </>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.gutter,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.gutter,
    backgroundColor: colors.background,
  },
  picker: {
    gap: spacing.sm,
  },
  pickerRow: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xxs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderCurve: 'continuous',
  },
  pickerRowSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.selected,
  },
  pickerTitle: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  pickerTitleSelected: {
    color: colors.primary,
  },
  cardTitle: {
    ...type.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.textPrimary,
  },
  operator: {
    ...type.bodyEmphasis,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    maxWidth: '100%',
  },
  chipText: {
    ...type.badge,
  },
  zeroGap: {
    ...type.bodyEmphasis,
    color: colors.success,
  },
  muted: {
    ...type.helper,
    color: colors.textSecondary,
  },
  guidanceText: {
    ...type.body,
    color: colors.textPrimary,
  },
});

const chipFills = StyleSheet.create({
  neutral: { backgroundColor: colors.surfaceSubtle },
  positive: { backgroundColor: colors.accentSoft },
  warning: { backgroundColor: colors.warningTint },
});

const chipLabels = StyleSheet.create({
  neutral: { color: colors.primary },
  positive: { color: colors.primary },
  warning: { color: colors.warning },
});

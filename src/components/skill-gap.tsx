import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppSheet } from '@/components/app-sheet';
import { AppSymbol } from '@/components/app-symbol';
import { FormMessage } from '@/components/form-message';
import { InlineStatus } from '@/components/inline-status';
import { RadioRow } from '@/components/radio-row';
import { SectionHeader } from '@/components/section-header';
import { SurfaceGroup } from '@/components/surface-group';
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
  const [pickerOpen, setPickerOpen] = useState(false);

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
      {/* The chosen job is one row; changing it opens the shared sheet, so the result stays in view. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${SKILL_GAP_COPY.compareWith}: ${selectedJob.title}`}
        accessibilityHint="Choose a different job opportunity"
        accessibilityState={{ expanded: pickerOpen }}
        onPress={() => setPickerOpen(true)}
        style={({ pressed }) => [styles.chosen, pressed ? styles.chosenPressed : null]}
      >
        <View style={styles.chosenCopy}>
          <Text style={styles.chosenTitle}>{selectedJob.title}</Text>
          {describeOpportunity(selectedJob) === null ? null : (
            <Text style={styles.muted}>{describeOpportunity(selectedJob)}</Text>
          )}
        </View>
        <AppSymbol synchronousGlyph name={{ android: 'expand_more', ios: 'chevron.down' }} size={20} tintColor={colors.textSecondary} />
      </Pressable>
      <AppSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title={SKILL_GAP_COPY.compareWith}>
        <View style={styles.picker} accessibilityRole="radiogroup" accessibilityLabel={SKILL_GAP_COPY.compareWith}>
          {opportunities.map((o) => (
            <RadioRow
              key={o.jobId}
              label={o.title}
              meaning={describeOpportunity(o) ?? undefined}
              selected={o.jobId === selectedJob.jobId}
              accessibilityLabel={o.title}
              onPress={() => {
                setSelectedJobId(o.jobId);
                setPickerOpen(false);
              }}
            />
          ))}
        </View>
      </AppSheet>

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
 * Wrapping skill pill. AppChip is height-locked at 28 and would clip a long skill name with its
 * proficiency suffix, so this matches AppChip fills and type with wrapping allowed. Meaning is
 * carried by an icon and the group it sits in, never by colour alone.
 */
function SkillPill({
  label,
  variant = 'neutral',
}: {
  label: string;
  variant?: 'neutral' | 'positive' | 'warning';
}) {
  const ink = pillInk[variant];
  return (
    <View style={[styles.chip, chipFills[variant]]}>
      {variant === 'positive' ? (
        <AppSymbol synchronousGlyph name={{ android: 'check', ios: 'checkmark' }} size={14} tintColor={ink} />
      ) : variant === 'warning' ? (
        <AppSymbol synchronousGlyph name={{ android: 'warning', ios: 'exclamationmark.triangle' }} size={14} tintColor={ink} />
      ) : null}
      <Text style={[styles.chipText, chipLabels[variant]]}>{label}</Text>
    </View>
  );
}

/**
 * The comparison, read top to bottom: what the job asks for, what you have, what is missing.
 * `computeSkillGap` normalizes both sides, so this component renders exactly what the pure
 * function returns and adds nothing. One surface, three labelled blocks.
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
    return <Text style={styles.muted}>{SKILL_GAP_COPY.noRequirements}</Text>;
  }

  const matchedIds = new Set(gap.matchedSkills.map((s) => s.id));
  const hasMissing = gap.missingSkills.length > 0;

  return (
    <>
      <SurfaceGroup>
        <View style={styles.block}>
          <Text style={styles.blockTitle}>{SKILL_GAP_COPY.required}</Text>
          <View style={styles.chips}>
            {gap.requiredSkills.map((s) => (
              <SkillPill key={s.id} label={s.name} />
            ))}
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>{SKILL_GAP_COPY.yours}</Text>
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
                    label={`${s.name}${s.proficiency === null ? '' : ` · ${PROFICIENCY_LABEL[s.proficiency]}`}`}
                  />
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>
            {SKILL_GAP_COPY.missing} · {gap.missingSkills.length}
          </Text>
          {hasMissing ? (
            <>
              <View style={styles.chips}>
                {gap.missingSkills.map((s) => (
                  <SkillPill key={s.id} variant="warning" label={s.name} />
                ))}
              </View>
              <FormMessage tone="warning" message={SKILL_GAP_COPY.missingHint} />
            </>
          ) : (
            <Text style={styles.zeroGap}>{SKILL_GAP_COPY.zeroGap}</Text>
          )}
        </View>
      </SurfaceGroup>

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
export function GuidanceSection({
  jobId,
  missingSkillNames,
  buttonLabel = SKILL_GAP_GUIDANCE_COPY.get,
}: {
  jobId: string;
  missingSkillNames: readonly string[];
  buttonLabel?: string;
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
    <View style={styles.guidance}>
      <SectionHeader title={SKILL_GAP_GUIDANCE_COPY.title} />

      {state.kind === 'idle' ? (
        <AppButton
          label={buttonLabel}
          variant="secondary"
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
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  container: {
    flexGrow: 1,
    backgroundColor: colors.canvas,
    padding: spacing.gutter,
    gap: spacing.lg,
    paddingBottom: spacing.xxxxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.gutter,
    backgroundColor: colors.canvas,
  },
  picker: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderCurve: 'continuous',
  },
  chosenPressed: { backgroundColor: colors.surfaceSunken },
  chosenCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  chosenTitle: { ...type.bodyEmphasis, color: colors.textPrimary },
  block: { gap: spacing.md, padding: spacing.lg },
  blockTitle: {
    ...type.label,
    color: colors.textSecondary,
  },
  guidance: { gap: spacing.md },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    maxWidth: '100%',
  },
  chipText: {
    ...type.badge,
    flexShrink: 1,
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
  neutral: { backgroundColor: colors.surfaceSunken },
  positive: { backgroundColor: colors.successTint },
  warning: { backgroundColor: colors.warningTint },
});

const chipLabels = StyleSheet.create({
  neutral: { color: colors.textPrimary },
  positive: { color: colors.success },
  warning: { color: colors.warning },
});

const pillInk = { neutral: colors.textPrimary, positive: colors.success, warning: colors.warning } as const;

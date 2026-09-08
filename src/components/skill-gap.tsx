import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
import { useAccount } from '@/providers/account-provider';

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
 * the gap is arithmetic. There is no AI section; that is a separate piece and
 * nothing on this screen pretends otherwise.
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
        <ActivityIndicator />
        <Text style={styles.note}>{SKILL_GAP_COPY.loading}</Text>
      </View>
    );
  }

  if (currentBase.kind === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{SKILL_GAP_COPY.loadFailed}</Text>
        <Pressable style={styles.button} onPress={retryBase} accessibilityRole="button">
          <Text style={styles.buttonText}>{SKILL_GAP_COPY.retry}</Text>
        </Pressable>
      </View>
    );
  }

  if (currentBase.kind === 'no-profile') {
    return (
      <View style={styles.center}>
        <Text style={styles.note}>{SKILL_GAP_COPY.noProfile}</Text>
      </View>
    );
  }

  if (selectedJob === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.note}>{SKILL_GAP_COPY.noOpportunities}</Text>
      </View>
    );
  }

  // Only requirements that belong to the Job being compared are ever shown.
  const current = requirements.kind !== 'idle' && requirements.jobId === selectedJob.jobId ? requirements : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionLabel}>{SKILL_GAP_COPY.compareWith}</Text>
      <View style={styles.picker}>
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
        <View style={styles.centerInline}>
          <ActivityIndicator />
          <Text style={styles.note}>{SKILL_GAP_COPY.loadingRequirements}</Text>
        </View>
      ) : current.kind === 'error' ? (
        <View style={styles.centerInline}>
          <Text style={styles.error}>{SKILL_GAP_COPY.requirementsFailed}</Text>
          <Pressable style={styles.button} onPress={retryRequirements} accessibilityRole="button">
            <Text style={styles.buttonText}>{SKILL_GAP_COPY.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <GapEquation required={current.required} mine={currentBase.mySkills} />
      )}
    </ScrollView>
  );
}

/** Display-only second line for a picker row: location and/or device-local schedule. */
function describeOpportunity(o: GapOpportunity): string | null {
  const place = [o.barangay, o.city].filter((p): p is string => p !== null).join(', ');
  let when: string | null = null;
  if (o.scheduledAt !== null) {
    const parsed = new Date(o.scheduledAt);
    when = Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString();
  }
  const parts = [place === '' ? null : place, when].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * The equation. `computeSkillGap` normalizes both sides, so this component
 * renders exactly what the pure function returns and adds nothing.
 */
function GapEquation({ required, mine }: { required: SkillRef[]; mine: WorkerSkillRef[] }) {
  const gap = computeSkillGap(required, mine);

  if (gap.requiredSkills.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>{SKILL_GAP_COPY.noRequirements}</Text>
      </View>
    );
  }

  const matchedIds = new Set(gap.matchedSkills.map((s) => s.id));

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{SKILL_GAP_COPY.required}</Text>
        <View style={styles.chips}>
          {gap.requiredSkills.map((s) => (
            <View key={s.id} style={styles.chip}>
              <Text style={styles.chipText}>{s.name}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.operator}>{SKILL_GAP_COPY.minus}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{SKILL_GAP_COPY.yours}</Text>
        {gap.workerSkills.length === 0 ? (
          <Text style={styles.muted}>{SKILL_GAP_COPY.noWorkerSkills}</Text>
        ) : (
          <View style={styles.chips}>
            {gap.workerSkills.map((s) => {
              const matched = matchedIds.has(s.id);
              return (
                <View key={s.id} style={[styles.chip, matched && styles.chipMatched]}>
                  <Text style={[styles.chipText, matched && styles.chipTextMatched]}>
                    {matched ? '✓ ' : ''}
                    {s.name}
                    {s.proficiency === null ? '' : ` · ${PROFICIENCY_LABEL[s.proficiency]}`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Text style={styles.operator}>{SKILL_GAP_COPY.equals}</Text>

      <View style={[styles.card, gap.missingSkills.length > 0 && styles.cardMissing]}>
        <Text style={styles.cardTitle}>
          {SKILL_GAP_COPY.missing} · {gap.missingSkills.length}
        </Text>
        {gap.missingSkills.length === 0 ? (
          <Text style={styles.zeroGap}>{SKILL_GAP_COPY.zeroGap}</Text>
        ) : (
          <>
            <View style={styles.chips}>
              {gap.missingSkills.map((s) => (
                <View key={s.id} style={[styles.chip, styles.chipMissing]}>
                  <Text style={[styles.chipText, styles.chipTextMissing]}>− {s.name}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.muted}>{SKILL_GAP_COPY.missingHint}</Text>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  centerInline: {
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  picker: {
    gap: 8,
  },
  pickerRow: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    gap: 2,
  },
  pickerRowSelected: {
    borderColor: '#1d4ed8',
    backgroundColor: '#eff6ff',
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  pickerTitleSelected: {
    color: '#1d4ed8',
  },
  card: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  cardMissing: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  operator: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  chipMatched: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  chipMissing: {
    borderColor: '#f59e0b',
    backgroundColor: '#ffffff',
  },
  chipText: {
    fontSize: 14,
  },
  chipTextMatched: {
    color: '#166534',
    fontWeight: '600',
  },
  chipTextMissing: {
    color: '#92400e',
    fontWeight: '600',
  },
  zeroGap: {
    fontSize: 14,
    color: '#166534',
    fontWeight: '600',
  },
  muted: {
    fontSize: 13,
    opacity: 0.6,
  },
  note: {
    fontSize: 14,
    opacity: 0.8,
    textAlign: 'center',
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  buttonText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600',
  },
});

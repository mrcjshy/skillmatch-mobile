import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { formatCardDateTime } from '@/lib/date-time';
import {
  formatOpportunityPaymentLine,
  parseJobPaymentMethod,
  type JobPaymentMethod,
} from '@/lib/job-payment';
import { SkillMatchTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';

/**
 * Worker "Job Opportunities" = read-only discovery of the jobs this Worker has
 * matched into (N8-UI).
 *
 * The ONLY data source is the hosted RPC `public.list_my_job_opportunities()`,
 * called with ZERO arguments. The Worker identity comes from `auth.uid()`
 * inside that SECURITY DEFINER function, so there is no worker id to pass and
 * none that could be substituted to view someone else's opportunities.
 *
 * Nothing about matching is reimplemented here. Stage 1 eligibility
 * (role/active/verified/available/skill overlap) and the Skill 50 /
 * Location 30 / Rating 20 scoring both remain authoritative inside
 * `private.compute_job_matches(job_id)`, which the RPC reuses. This screen
 * does not query job_postings or job_skills directly, does not join Worker
 * skills locally, does not call `public.match_workers_for_job()` (that is the
 * owning-Client surface), and never re-sorts the rows — the server's ordering
 * is rendered as received.
 *
 * Zero rows is a SUCCESS state, not an error and not a blocked account: an
 * active Worker who is unverified, busy, offline, or simply unmatched gets an
 * empty list from the RPC. Only a genuine RPC/network failure shows the error
 * state, and it never routes to /blocked or /bootstrap-error, which carry
 * different meanings.
 *
 * The RPC withholds Client identity/contact data, competitor Workers, their
 * scores, and this Worker's rank; this screen renders only what it returns and
 * makes no supplementary lookup to fill those in. Client contact details are
 * released only after a confirmed booking.
 *
 * N9-UI adds the ONE write this screen performs: `Accept`, which calls
 * `public.accept_job_opportunity(p_job_id)`. That RPC is the entire acceptance
 * contract — it locks the Job row, re-checks D-002 Stage 1 eligibility through
 * the same authoritative scorer, and creates the confirmed Booking atomically.
 * Nothing about first-wins, eligibility, or booking state is decided here.
 *
 * The Worker id is never sent: the RPC derives it from auth.uid(), exactly as
 * the read RPC does. There is still no Booking screen, no Client contact
 * surface, and no notification — those are separate modules.
 */

/** Exactly the 12 fields `public.list_my_job_opportunities()` returns. */
type WorkerOpportunity = {
  job_id: string;
  title: string;
  description: string | null;
  barangay: string | null;
  city: string | null;
  budget: number | null;
  scheduled_at: string | null;
  skill_points: number;
  location_points: number;
  rating_points: number;
  total_points: number;
  payment_method: JobPaymentMethod | null;
};

/**
 * PostgREST may serialise `numeric` as a JSON number or as a string depending
 * on server version, so coerce rather than assume. Matches the existing
 * convention of never trusting a row's shape.
 */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toNullableText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/**
 * Validate one RPC row. The four score fields and job_id/title are NOT NULL by
 * construction, so a row missing them is malformed rather than merely sparse
 * and is dropped instead of rendered half-blank.
 */
function toOpportunity(row: unknown): WorkerOpportunity | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;

  const jobId = typeof r.job_id === 'string' ? r.job_id : null;
  const title = typeof r.title === 'string' ? r.title : null;
  const skill = toNumber(r.skill_points);
  const location = toNumber(r.location_points);
  const rating = toNumber(r.rating_points);
  const total = toNumber(r.total_points);

  if (jobId === null || title === null) return null;
  if (skill === null || location === null || rating === null || total === null) return null;

  const payment = parseJobPaymentMethod(r.payment_method);
  if (!payment.ok) return null;

  return {
    job_id: jobId,
    title,
    description: toNullableText(r.description),
    barangay: toNullableText(r.barangay),
    city: toNullableText(r.city),
    budget: toNumber(r.budget),
    scheduled_at: toNullableText(r.scheduled_at),
    skill_points: skill,
    location_points: location,
    rating_points: rating,
    total_points: total,
    payment_method: payment.method,
  };
}

async function loadOpportunities(): Promise<WorkerOpportunity[]> {
  // Zero arguments: the RPC derives the Worker from auth.uid().
  const res = await supabase.rpc('list_my_job_opportunities');
  if (res.error) {
    throw new Error(res.error.message || 'The request failed.');
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  // Server order is preserved — no client-side re-ranking.
  return rows
    .map(toOpportunity)
    .filter((o): o is WorkerOpportunity => o !== null);
}

/* ------------------------------------------------------------------ *
 * Acceptance (N9-UI)
 * ------------------------------------------------------------------ */

/**
 * Observed live against the hosted project: supabase-js does NOT throw for a
 * PostgREST/database error — it resolves with `{ data: null, error }`, and the
 * SQLSTATE arrives verbatim in `error.code`:
 *
 *   { code: '42501', message: 'not authorized to accept opportunities',  details: null, hint: null }
 *   { code: 'SM409', message: 'this opportunity is no longer available', details: null, hint: null }
 *   { code: 'SM403', message: 'you are no longer eligible for this opportunity', details: null, hint: null }
 *
 * So classification reads `error.code` exactly and never parses `message`.
 * Anything else — including a transport failure, which supabase-js also
 * surfaces as an error rather than a rejection — falls through to the generic
 * branch. The raw message is never shown to the Worker.
 */
const ACCEPT_ERROR = {
  /** Job is matched, cancelled, completed, or nonexistent — deliberately indistinguishable. */
  UNAVAILABLE: 'SM409',
  /** Caller is a real Worker but no longer passes Stage 1 for this Job. */
  INELIGIBLE: 'SM403',
} as const;

const COPY = {
  taken: 'This job was already accepted by another worker.',
  ineligible: "You're no longer eligible for this job.",
  generic: "We couldn't accept this job. Please refresh and try again.",
  accepted: 'Job accepted. It is now booked to you.',
  /**
   * The acceptance may already be committed, so this must never read as a
   * failure to accept. Only the list read failed.
   */
  refreshFailed:
    "Your acceptance was submitted, but we couldn't refresh your opportunities. " +
    'Refresh the list to see the latest status.',
} as const;

/** Stage 1 reasons the Worker's own authoritative state can actually explain. */
const REASON = {
  unverified: 'Your worker profile is not currently verified.',
  unavailable: 'Your availability is no longer set to Available.',
  noSkillOverlap: "Your current skills no longer match this job's requirements.",
  /**
   * Nothing locally observable explains the server's rejection. Deliberately
   * vague: rating and location are NOT Stage 1 gates under D-002/N9 and must
   * never be offered as the reason.
   */
  unexplained: "Your profile no longer meets this job's eligibility requirements.",
} as const;

/**
 * SM403 reason resolution — from a FRESH read of the Worker's own state, never
 * from whatever this screen cached when it loaded. The Worker may have been
 * unverified or made unavailable while the list sat open, in which case a
 * cached value would explain the rejection wrongly.
 *
 * Reuses the same tables the Worker profile screen already owns
 * (`worker_profiles`, `worker_skills`) plus the job's requirements from
 * `job_skills`; no new endpoint is introduced. Stage 1 is not reimplemented as
 * a decision — the server already decided. This only picks the explanation,
 * and any read failure or unexpected combination yields the vague fallback
 * rather than a guess.
 */
async function resolveIneligibilityReason(userId: string, jobId: string): Promise<string> {
  const profileRes = await supabase
    .from('worker_profiles')
    .select('id, is_verified, availability_status')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileRes.error || !profileRes.data) return REASON.unexplained;

  if (profileRes.data.is_verified !== true) return REASON.unverified;
  if (profileRes.data.availability_status !== 'available') return REASON.unavailable;

  // Both account-level gates pass, so the remaining explainable Stage 1
  // condition is required-skill overlap.
  const requiredRes = await supabase.from('job_skills').select('skill_id').eq('job_id', jobId);
  if (requiredRes.error) return REASON.unexplained;
  const required = (requiredRes.data ?? [])
    .map((r) => r.skill_id)
    .filter((id): id is string => typeof id === 'string');
  if (required.length === 0) return REASON.unexplained;

  const mineRes = await supabase
    .from('worker_skills')
    .select('skill_id')
    .eq('worker_id', profileRes.data.id);
  if (mineRes.error) return REASON.unexplained;
  const mine = new Set(
    (mineRes.data ?? []).map((r) => r.skill_id).filter((id): id is string => typeof id === 'string')
  );

  return required.some((id) => mine.has(id)) ? REASON.unexplained : REASON.noSkillOverlap;
}

type NoticeTone = 'success' | 'info' | 'warning';

type AcceptNotice = {
  tone: NoticeTone;
  headline: string;
  /** Second line, currently only the SM403 reason. */
  detail: string | null;
  /** Only the refresh-after-success case offers its own list-refresh action. */
  offerRefresh: boolean;
};

/** Grouped peso amount. Locale-independent so it renders identically on any device. */
function formatBudget(value: number | null): string | null {
  if (value === null) return null;
  const [whole, cents] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = value < 0 ? '-' : '';
  return cents === '00' ? `${sign}₱${grouped}` : `${sign}₱${grouped}.${cents}`;
}

/** Display-only conversion of the stored timestamptz to device-local time. */
function formatSchedule(iso: string | null): string | null {
  return formatCardDateTime(iso);
}

/** Never renders "null, null" — drops absent parts and returns null if both are absent. */
function formatLocation(barangay: string | null, city: string | null): string | null {
  const parts = [barangay, city].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Keeps whole scores clean (50, not 50.00) while allowing fractional ones (12.5). */
function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export default function WorkerOpportunities() {
  const { account } = useAccount();
  const workerId = account?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<WorkerOpportunity[]>([]);

  /** The one Job whose acceptance is in flight; null when idle. */
  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);
  /**
   * Jobs whose acceptance RPC already returned success in this screen session.
   * Only reachable when the follow-up server re-read failed and left the card
   * on screen: that acceptance may be committed, so its Accept control must
   * not be offered again.
   */
  const [submittedJobIds, setSubmittedJobIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<AcceptNotice | null>(null);

  /**
   * Single place that applies a successful result: rows in, stale error out.
   * Keeping the state writes here (rather than in an effect's promise
   * callbacks) mirrors `applyLoaded` in the Worker profile screen.
   */
  const load = useCallback(async () => {
    const rows = await loadOpportunities();
    setOpportunities(rows);
    setLoadError(null);
  }, []);

  /**
   * Failure path. The raw database/network message is logged for developers
   * but never surfaced to the Worker.
   */
  const applyError = useCallback((e: unknown) => {
    if (e instanceof Error && e.message) {
      console.warn('[N8-UI] list_my_job_opportunities failed:', e.message);
    }
    setLoadError('Unable to load job opportunities. Please try again.');
  }, []);

  const finishInitialLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  /**
   * Load once when the Worker id becomes available, with a cancel flag so a
   * late response cannot write to an unmounted screen. `isLoading` starts true
   * and `loadError` starts null, so the effect body performs no synchronous
   * setState, and both state writes go through the callbacks above rather than
   * being inlined — the same shape `applyLoaded` gives the Worker profile
   * screen.
   *
   * react-hooks/set-state-in-effect still fires on the error path: the rule
   * rejects any setState reachable from an effect, including one reached
   * through a useCallback inside a promise rejection handler. Fetch-on-mount
   * is the established convention in this codebase (worker/index.tsx,
   * client/index.tsx, account-provider.tsx all trip the same rule), and
   * satisfying it properly would mean introducing a data-fetching library or
   * restructuring those screens — neither of which is in N8-UI's scope. The
   * suppression is therefore narrowed to this single line, and the pre-existing
   * violations elsewhere are deliberately left untouched.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; see the note above */
  useEffect(() => {
    if (!workerId) return;
    const run = { cancelled: false };
    load()
      .catch((e: unknown) => {
        if (run.cancelled) return;
        applyError(e);
      })
      .finally(() => {
        if (!run.cancelled) finishInitialLoad();
      });
    return () => {
      run.cancelled = true;
    };
  }, [workerId, load, applyError, finishInitialLoad]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleRetry() {
    if (isLoading || isRefreshing || acceptingJobId !== null) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      await load();
      // A successful authoritative read resolves any outcome message.
      setNotice(null);
    } catch (e: unknown) {
      applyError(e);
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Acceptance. The server is the only authority here: this handler decides
   * nothing about eligibility or who won, and never edits the list to reflect
   * an outcome. Every terminal branch — success, SM409, SM403 — ends by
   * re-reading `list_my_job_opportunities()` and rendering whatever the server
   * returns.
   */
  async function handleAccept(jobId: string) {
    // One acceptance at a time, and never a second submit for the same Job.
    if (acceptingJobId !== null || isLoading || isRefreshing) return;
    if (submittedJobIds.includes(jobId)) return;

    setAcceptingJobId(jobId);
    setNotice(null);
    try {
      // The Worker is auth.uid() inside the RPC; only the Job id is sent.
      const res = await supabase.rpc('accept_job_opportunity', { p_job_id: jobId });

      if (res.error) {
        const code = res.error.code;
        // Developer-only. The Worker never sees a raw database message.
        console.warn('[N9-UI] accept_job_opportunity failed:', code, res.error.message);

        if (code === ACCEPT_ERROR.UNAVAILABLE) {
          // The ordinary losing-race outcome, not a fault.
          setNotice({ tone: 'info', headline: COPY.taken, detail: null, offerRefresh: false });
          await refreshAfterOutcome();
          return;
        }
        if (code === ACCEPT_ERROR.INELIGIBLE) {
          const detail = workerId
            ? await resolveIneligibilityReason(workerId, jobId)
            : REASON.unexplained;
          setNotice({ tone: 'warning', headline: COPY.ineligible, detail, offerRefresh: false });
          await refreshAfterOutcome();
          return;
        }
        // 42501 and anything unexpected (including transport failure). No
        // reason is invented, and no role/session state is changed here —
        // account routing stays with the bootstrap gates.
        setNotice({ tone: 'warning', headline: COPY.generic, detail: null, offerRefresh: false });
        return;
      }

      // Success. The Booking is NOT reconstructed locally and the card is NOT
      // spliced out — the Job disappears only because the server says so.
      setSubmittedJobIds((ids) => (ids.includes(jobId) ? ids : [...ids, jobId]));
      try {
        await load();
        setNotice({ tone: 'success', headline: COPY.accepted, detail: null, offerRefresh: false });
      } catch (e: unknown) {
        // Acceptance succeeded; only the re-read failed. Saying "acceptance
        // failed" here would be wrong, and re-sending the RPC could not make
        // it more true — so it is never retried automatically.
        if (e instanceof Error && e.message) {
          console.warn('[N9-UI] post-acceptance refresh failed:', e.message);
        }
        setNotice({
          tone: 'warning',
          headline: COPY.refreshFailed,
          detail: null,
          offerRefresh: true,
        });
      }
    } catch (e: unknown) {
      // supabase-js returns rather than rejects, so this is defensive only.
      if (e instanceof Error && e.message) {
        console.warn('[N9-UI] accept_job_opportunity threw:', e.message);
      }
      setNotice({ tone: 'warning', headline: COPY.generic, detail: null, offerRefresh: false });
    } finally {
      setAcceptingJobId(null);
    }
  }

  /**
   * Authoritative re-read after a handled acceptance outcome. A failure here
   * must not overwrite the outcome message, so it goes to the list's own error
   * state (which carries its own Retry).
   */
  async function refreshAfterOutcome() {
    try {
      await load();
    } catch (e: unknown) {
      applyError(e);
    }
  }

  async function handleRefresh() {
    if (isLoading || isRefreshing || acceptingJobId !== null) return;
    setIsRefreshing(true);
    try {
      await load();
      setNotice(null);
    } catch (e: unknown) {
      applyError(e);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Job Opportunities' }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        <Text style={styles.heading}>Job Opportunities</Text>
        <Text style={styles.note}>
          Jobs you have been matched with, ranked by your match score.
        </Text>

        {/*
          Rendered above the load/error/empty/list switch so an outcome message
          survives whatever the follow-up server read does to the list below.
        */}
        {notice ? (
          <View
            style={[
              styles.notice,
              notice.tone === 'success'
                ? styles.noticeSuccess
                : notice.tone === 'info'
                  ? styles.noticeInfo
                  : styles.noticeWarning,
            ]}
          >
            <Text style={styles.noticeHeadline}>{notice.headline}</Text>
            {notice.detail ? <Text style={styles.noticeDetail}>{notice.detail}</Text> : null}
            {notice.offerRefresh ? (
              <Pressable
                style={styles.secondaryButton}
                onPress={handleRefresh}
                disabled={isLoading || isRefreshing || acceptingJobId !== null}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>Refresh</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {isLoading ? (
          // Rendered instead of, never before, the empty state.
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.note}>Loading your opportunities…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.center}>
            <Text style={styles.error}>{loadError}</Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={handleRetry}
              disabled={isLoading || isRefreshing}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : opportunities.length === 0 ? (
          // A successful call that matched nothing — not an error, not a block.
          <View style={styles.center}>
            <Text style={styles.note}>No matching job opportunities right now.</Text>
          </View>
        ) : (
          opportunities.map((job) => {
            const location = formatLocation(job.barangay, job.city);
            const budget = formatBudget(job.budget);
            const schedule = formatSchedule(job.scheduled_at);
            const isAcceptingThis = acceptingJobId === job.job_id;
            const isSubmitted = submittedJobIds.includes(job.job_id);
            // Every card locks while ANY acceptance is in flight, so a rapid
            // second tap cannot start an acceptance on a different Job. This
            // is only a UI guard — first-wins correctness is the RPC's.
            const isAcceptDisabled =
              acceptingJobId !== null || isSubmitted || isLoading || isRefreshing;
            return (
              <View key={job.job_id} style={styles.card}>
                <Text style={styles.cardTitle}>{job.title}</Text>

                {job.description ? (
                  <Text style={styles.cardLine}>{job.description}</Text>
                ) : null}
                {location ? <Text style={styles.cardLine}>{location}</Text> : null}
                {budget ? <Text style={styles.cardLine}>Budget: {budget}</Text> : null}
                {schedule ? <Text style={styles.cardLine}>Schedule: {schedule}</Text> : null}
                <Text style={styles.cardLine}>{formatOpportunityPaymentLine(job.payment_method)}</Text>

                <Text style={styles.scoreTotal}>
                  Match Score: {formatPoints(job.total_points)}/100
                </Text>
                {/*
                  Score components exactly as returned. "Rating score" is a
                  computed match component out of 20 — it is NOT a star rating
                  and must never be presented as one. The RPC deliberately does
                  not expose rating_avg or is_new_worker, and neither is
                  inferred here.
                */}
                <Text style={styles.scoreLine}>
                  Skill: {formatPoints(job.skill_points)}/50
                </Text>
                <Text style={styles.scoreLine}>
                  Location: {formatPoints(job.location_points)}/30
                </Text>
                <Text style={styles.scoreLine}>
                  Rating score: {formatPoints(job.rating_points)}/20
                </Text>

                <Pressable
                  style={[
                    styles.acceptButton,
                    isAcceptDisabled && styles.acceptButtonDisabled,
                  ]}
                  onPress={() => handleAccept(job.job_id)}
                  disabled={isAcceptDisabled}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isAcceptDisabled, busy: isAcceptingThis }}
                  accessibilityLabel={`Accept ${job.title}`}
                >
                  {isAcceptingThis ? (
                    <View style={styles.acceptBusy}>
                      <ActivityIndicator color="#ffffff" />
                      <Text style={styles.acceptButtonText}>Accepting…</Text>
                    </View>
                  ) : (
                    <Text style={styles.acceptButtonText}>
                      {/* Reached only when the post-success re-read failed. */}
                      {isSubmitted ? 'Acceptance submitted' : 'Accept'}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 12,
    paddingBottom: 48,
  },
  center: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  note: {
    fontSize: 14,
    opacity: 0.7,
  },
  card: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.border.default,
    borderRadius: SkillMatchTheme.radius.card,
    padding: SkillMatchTheme.spacing.cardPadding,
    gap: SkillMatchTheme.spacing.cardGap,
    backgroundColor: SkillMatchTheme.surface.default,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardLine: {
    fontSize: 14,
    opacity: 0.8,
  },
  scoreTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: SkillMatchTheme.brand.primary,
    marginTop: 6,
  },
  scoreLine: {
    fontSize: 14,
    opacity: 0.8,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
  },
  acceptButton: {
    marginTop: 10,
    backgroundColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    opacity: 0.5,
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  acceptBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notice: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  noticeSuccess: {
    borderColor: '#15803d',
    backgroundColor: '#f0fdf4',
  },
  noticeInfo: {
    borderColor: SkillMatchTheme.brand.primary,
    backgroundColor: '#eff6ff',
  },
  noticeWarning: {
    borderColor: '#b45309',
    backgroundColor: '#fffbeb',
  },
  noticeHeadline: {
    fontSize: 15,
    fontWeight: '600',
  },
  noticeDetail: {
    fontSize: 14,
    opacity: 0.8,
  },
  secondaryButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});

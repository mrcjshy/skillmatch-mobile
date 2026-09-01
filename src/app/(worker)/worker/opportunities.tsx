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
 * There is deliberately NO Accept / Claim / Book / Contact control: N9
 * acceptance and the atomic booking claim do not exist yet, and this screen
 * performs no writes of any kind.
 */

/** Exactly the 11 fields `public.list_my_job_opportunities()` returns. */
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
  if (iso === null) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
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
    if (isLoading || isRefreshing) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      await load();
    } catch (e: unknown) {
      applyError(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefresh() {
    if (isLoading || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await load();
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
            return (
              <View key={job.job_id} style={styles.card}>
                <Text style={styles.cardTitle}>{job.title}</Text>

                {job.description ? (
                  <Text style={styles.cardLine}>{job.description}</Text>
                ) : null}
                {location ? <Text style={styles.cardLine}>{location}</Text> : null}
                {budget ? <Text style={styles.cardLine}>Budget: {budget}</Text> : null}
                {schedule ? <Text style={styles.cardLine}>Schedule: {schedule}</Text> : null}

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
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    gap: 2,
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
    color: '#1d4ed8',
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
  secondaryButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '600',
  },
});

import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppNotice } from '@/components/app-notice';
import { InlineStatus } from '@/components/inline-status';
import { formatCardDateTime } from '@/lib/date-time';
import { SkillMatchTheme } from '@/constants/theme';
import { signOutCurrentUser } from '@/lib/sign-out';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing } = SkillMatchTheme.ui;

/**
 * Administrator "Worker Verification" dashboard = the pending verification
 * queue plus the verifying act (N10-UI).
 *
 * The ONLY data sources are the two hosted RPCs:
 *
 *   public.list_unverified_workers()          -- zero arguments
 *   public.verify_worker(p_worker_user_id)    -- the Worker ACCOUNT id
 *
 * Both are SECURITY DEFINER and admin-gated by private.is_admin() inside the
 * database. The Administrator identity comes from auth.uid() in there, so
 * there is no admin id to pass and none that could be substituted. This
 * screen queries no table directly: `users` SELECT is self-row only, so the
 * pending Worker's identity is not readable any other way, and
 * `worker_profiles` UPDATE is self-row only, so the verifying write is not
 * reachable any other way either (docs/SECURITY.md GAP-003).
 *
 * Nothing about verification policy is reimplemented here. Who is pending
 * (role = worker AND is_verified IS DISTINCT FROM true), who may verify, and
 * whether a target is still verifiable are all decided by the RPCs. This
 * screen renders what the server returns and never re-sorts it — the queue
 * order (oldest application first) is part of the contract.
 *
 * Zero rows is a SUCCESS state, not an error and not a denial: an
 * Administrator with an empty queue simply has nobody waiting. Only a genuine
 * RPC/network failure shows the error state.
 *
 * The list projection deliberately carries no email and no worker_profiles id,
 * so neither is displayed or depended on here.
 */

/** Exactly the 8 fields `public.list_unverified_workers()` returns. */
type PendingWorker = {
  user_id: string;
  full_name: string;
  phone: string | null;
  barangay: string | null;
  city: string | null;
  availability_status: string | null;
  skills: string[];
  registered_at: string | null;
};

function toNullableText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/**
 * `skills` is a Postgres text[] and arrives as a JSON array of strings.
 * Coerced defensively rather than trusted: a malformed element is dropped,
 * and anything that is not an array becomes an empty list so the Worker still
 * renders and stays verifiable.
 */
function toSkills(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === 'string' && s.trim() !== '');
}

/**
 * Validate one RPC row. user_id and full_name are NOT NULL by construction, so
 * a row missing either is malformed rather than merely sparse and is dropped
 * instead of rendered half-blank.
 */
function toPendingWorker(row: unknown): PendingWorker | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;

  const userId = typeof r.user_id === 'string' ? r.user_id : null;
  const fullName = typeof r.full_name === 'string' ? r.full_name : null;
  if (userId === null || fullName === null) return null;

  return {
    user_id: userId,
    full_name: fullName,
    phone: toNullableText(r.phone),
    barangay: toNullableText(r.barangay),
    city: toNullableText(r.city),
    availability_status: toNullableText(r.availability_status),
    skills: toSkills(r.skills),
    registered_at: toNullableText(r.registered_at),
  };
}

async function loadPendingWorkers(): Promise<PendingWorker[]> {
  // Zero arguments: the RPC derives the Administrator from auth.uid().
  const res = await supabase.rpc('list_unverified_workers');
  if (res.error) {
    throw new Error(res.error.message || 'The request failed.');
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  // Server order is preserved — no client-side re-ranking.
  return rows.map(toPendingWorker).filter((w): w is PendingWorker => w !== null);
}

/* ------------------------------------------------------------------ *
 * Verification outcome handling
 * ------------------------------------------------------------------ */

/**
 * Classification reads `error.code` ONLY, never `error.message`.
 *
 * This is load-bearing for 42501, which N10 can produce with two different
 * messages for the same code — both observed live against hosted:
 *
 *   { code: '42501', message: 'not authorized to verify workers' }          <- function body
 *   { code: '42501', message: 'permission denied for function verify_worker' } <- ACL layer
 *
 * Matching on message text would therefore miss one of them. SM409 is matched
 * the same way for consistency:
 *
 *   { code: 'SM409', message: 'this worker is not available for verification' }
 *
 * supabase-js resolves with `{ data: null, error }` rather than throwing, so
 * these arrive as return values. Anything else, including a transport
 * failure, falls through to the generic branch, and no raw message is ever
 * shown to the Administrator.
 */
const VERIFY_ERROR = {
  /** Caller is not an active Administrator (body gate) or lacks EXECUTE (ACL). */
  FORBIDDEN: '42501',
  /** Already verified, not a Worker, or no such account — deliberately indistinguishable. */
  UNAVAILABLE: 'SM409',
} as const;

const COPY = {
  forbidden: "You don't have permission to verify workers.",
  unavailable:
    'This worker was already verified or is no longer pending verification.',
  generic: "We couldn't verify this worker. Please try again.",
  verified: 'Worker verified.',
  /**
   * The verification may already be committed, so this must never read as a
   * failure to verify. Only the list read failed.
   */
  refreshFailed:
    'The worker was verified, but the pending list could not be refreshed. ' +
    'Refresh the list to see the latest status.',
} as const;

type NoticeTone = 'success' | 'info' | 'warning';

type VerifyNotice = {
  tone: NoticeTone;
  headline: string;
  /** Only the refresh-after-success case offers its own list-refresh action. */
  offerRefresh: boolean;
};

/** Never renders "null, null" — drops absent parts and returns null if both are absent. */
function formatLocation(barangay: string | null, city: string | null): string | null {
  const parts = [barangay, city].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Display-only conversion of the stored timestamptz to device-local time.
 * Identical to the Worker opportunities screen's convention — the app has
 * exactly one date/time convention and N10-UI does not introduce a second.
 * A UTC device and a UTC+8 device therefore show different local clock values
 * for the same instant, which is the intended behaviour, not drift.
 */
function formatRegisteredAt(iso: string | null): string | null {
  return formatCardDateTime(iso);
}

/** Skills are rendered as received; an empty list is a state, not a hidden row. */
function formatSkills(skills: string[]): string {
  return skills.length > 0 ? skills.join(' • ') : 'No skills added';
}

export default function AdminHome() {
  const router = useRouter();
  const { account } = useAccount();
  const adminId = account?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workers, setWorkers] = useState<PendingWorker[]>([]);

  /** The one Worker whose verification is in flight; null when idle. */
  const [verifyingUserId, setVerifyingUserId] = useState<string | null>(null);
  /**
   * Workers whose verification RPC already returned success in this screen
   * session. Only reachable when the follow-up server re-read failed and left
   * the row on screen: that verification may be committed, so its Verify
   * control must not be offered again.
   */
  const [submittedUserIds, setSubmittedUserIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<VerifyNotice | null>(null);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  /** Single place that applies a successful result: rows in, stale error out. */
  const load = useCallback(async () => {
    const rows = await loadPendingWorkers();
    setWorkers(rows);
    setLoadError(null);
  }, []);

  /**
   * Failure path. The raw database/network message is logged for developers
   * but never surfaced to the Administrator.
   */
  const applyError = useCallback((e: unknown) => {
    if (e instanceof Error && e.message) {
      console.warn('[N10-UI] list_unverified_workers failed:', e.message);
    }
    setLoadError('Unable to load the verification queue. Please try again.');
  }, []);

  const finishInitialLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  /**
   * Load once when the Administrator id becomes available, with a cancel flag
   * so a late response cannot write to an unmounted screen. Same shape as the
   * Worker opportunities screen, including the narrowed suppression: the
   * react-hooks/set-state-in-effect rule rejects any setState reachable from
   * an effect, and fetch-on-mount is the established convention in this
   * codebase. The suppression is scoped to this effect only and no
   * pre-existing violation elsewhere is touched.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; see the note above */
  useEffect(() => {
    if (!adminId) return;
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
  }, [adminId, load, applyError, finishInitialLoad]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleRetry() {
    if (isLoading || isRefreshing || verifyingUserId !== null) return;
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

  async function handleRefresh() {
    if (isLoading || isRefreshing || verifyingUserId !== null) return;
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

  /**
   * Authoritative re-read after a handled outcome. A failure here must not
   * overwrite the outcome message, so it goes to the list's own error state
   * (which carries its own Retry).
   */
  async function refreshAfterOutcome() {
    try {
      await load();
    } catch (e: unknown) {
      applyError(e);
    }
  }

  /**
   * Verification. The server is the only authority: this handler decides
   * nothing about who may verify or who is still pending, and never edits the
   * list to reflect an outcome. Both terminal branches — success and SM409 —
   * end by re-reading `list_unverified_workers()` and rendering whatever the
   * server returns.
   */
  async function handleVerify(userId: string) {
    // One verification at a time, and never a second submit for the same Worker.
    if (verifyingUserId !== null || isLoading || isRefreshing) return;
    if (submittedUserIds.includes(userId)) return;

    setVerifyingUserId(userId);
    setNotice(null);
    try {
      // The Administrator is auth.uid() inside the RPC; only the target is sent.
      const res = await supabase.rpc('verify_worker', { p_worker_user_id: userId });

      if (res.error) {
        const code = res.error.code;
        // Developer-only. The Administrator never sees a raw database message.
        console.warn('[N10-UI] verify_worker failed:', code, res.error.message);

        if (code === VERIFY_ERROR.UNAVAILABLE) {
          // Ordinary outcome: another Administrator got there first, or the
          // Worker stopped being pending. Not a fault.
          setNotice({ tone: 'info', headline: COPY.unavailable, offerRefresh: false });
          await refreshAfterOutcome();
          return;
        }
        if (code === VERIFY_ERROR.FORBIDDEN) {
          // Both 42501 shapes land here, because only the CODE is matched.
          // No role/session state is changed — account routing stays with the
          // bootstrap gates.
          setNotice({ tone: 'warning', headline: COPY.forbidden, offerRefresh: false });
          return;
        }
        setNotice({ tone: 'warning', headline: COPY.generic, offerRefresh: false });
        return;
      }

      // Success. The returned projection is a confirmation, NOT list state:
      // the row disappears only because the server's next read says so.
      setSubmittedUserIds((ids) => (ids.includes(userId) ? ids : [...ids, userId]));
      try {
        await load();
        setNotice({ tone: 'success', headline: COPY.verified, offerRefresh: false });
      } catch (e: unknown) {
        // Verification succeeded; only the re-read failed. Saying "verification
        // failed" here would be wrong, and re-sending the RPC could not make it
        // more true — so it is never retried automatically.
        if (e instanceof Error && e.message) {
          console.warn('[N10-UI] post-verification refresh failed:', e.message);
        }
        setNotice({ tone: 'warning', headline: COPY.refreshFailed, offerRefresh: true });
      }
    } catch (e: unknown) {
      // supabase-js returns rather than rejects, so this is defensive only.
      if (e instanceof Error && e.message) {
        console.warn('[N10-UI] verify_worker threw:', e.message);
      }
      setNotice({ tone: 'warning', headline: COPY.generic, offerRefresh: false });
    } finally {
      setVerifyingUserId(null);
    }
  }

  async function handleSignOut() {
    if (isSigningOut || verifyingUserId !== null) return;
    setSignOutError(null);
    setIsSigningOut(true);
    try {
      const { error } = await signOutCurrentUser();
      if (error) setSignOutError(error.message || 'Sign out failed. Please try again.');
    } catch {
      setSignOutError('Sign out failed. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <AppButton
        label="Reports"
        variant="secondary"
        onPress={() => router.push('/admin/reports' as unknown as Href)}
        disabled={verifyingUserId !== null}
      />
      <Text style={styles.heading}>Worker Verification</Text>
      <Text style={styles.note}>
        Workers waiting to be verified, oldest application first.
      </Text>

      {/*
        Rendered above the load/error/empty/list switch so an outcome message
        survives whatever the follow-up server read does to the list below.
      */}
      {notice ? (
        <View style={styles.noticeBlock}>
          {notice.tone === 'info' ? (
            <AppCard variant="status">
              <Text style={styles.infoNotice}>{notice.headline}</Text>
            </AppCard>
          ) : (
            <AppNotice
              variant={notice.tone === 'success' ? 'success' : 'warning'}
              message={notice.headline}
            />
          )}
          {notice.offerRefresh ? (
            <AppButton
              label="Refresh"
              variant="secondary"
              onPress={handleRefresh}
              disabled={isLoading || isRefreshing || verifyingUserId !== null}
            />
          ) : null}
        </View>
      ) : null}

      {isLoading ? (
        // Rendered instead of, never before, the empty state.
        <InlineStatus variant="loading" message="Loading the verification queue…" />
      ) : loadError ? (
        <InlineStatus
          variant="error"
          message={loadError}
          action={
            <AppButton
              label="Retry"
              variant="secondary"
              onPress={handleRetry}
              disabled={isLoading || isRefreshing || verifyingUserId !== null}
            />
          }
        />
      ) : workers.length === 0 ? (
        // A successful call with nobody pending — not an error, not a denial.
        <InlineStatus variant="empty" message="No workers are waiting for verification." />
      ) : (
        workers.map((worker) => {
          const location = formatLocation(worker.barangay, worker.city);
          const registered = formatRegisteredAt(worker.registered_at);
          const isVerifyingThis = verifyingUserId === worker.user_id;
          const isSubmitted = submittedUserIds.includes(worker.user_id);
          // Every row locks while ANY verification is in flight, so a rapid
          // second tap cannot start a verification on a different Worker.
          // This is only a UI guard — authorization and "still pending"
          // remain the RPC's decisions.
          const isVerifyDisabled =
            verifyingUserId !== null || isSubmitted || isLoading || isRefreshing;
          return (
            <AppCard key={worker.user_id}>
              <Text style={styles.cardTitle}>{worker.full_name}</Text>

              <View style={styles.meta}>
                {worker.phone ? (
                  <Text style={styles.cardLine}>Phone: {worker.phone}</Text>
                ) : null}
                {location ? <Text style={styles.cardLine}>{location}</Text> : null}
                {worker.availability_status ? (
                  <Text style={styles.cardLine}>
                    Availability: {worker.availability_status}
                  </Text>
                ) : null}
                <Text style={styles.cardLine}>Skills: {formatSkills(worker.skills)}</Text>
                {registered ? (
                  <Text style={styles.cardLine}>Registered: {registered}</Text>
                ) : null}
              </View>

              <AppButton
                variant="primary"
                /* Reached only when the post-success re-read failed. */
                label={
                  isVerifyingThis
                    ? 'Verifying…'
                    : isSubmitted
                      ? 'Verification submitted'
                      : 'Verify'
                }
                loading={isVerifyingThis}
                disabled={isVerifyDisabled}
                onPress={() => handleVerify(worker.user_id)}
                accessibilityLabel={`Verify ${worker.full_name}`}
              />
            </AppCard>
          );
        })
      )}

      <AppButton
        label="Sign Out"
        variant="secondary"
        onPress={handleSignOut}
        loading={isSigningOut}
        disabled={isSigningOut || verifyingUserId !== null}
      />
      {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}
    </ScrollView>
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
    gap: spacing.md,
    paddingBottom: spacing.xxxl + spacing.sm,
  },
  heading: {
    ...type.screenTitle,
    color: colors.textPrimary,
  },
  note: {
    ...type.helper,
    color: colors.textSecondary,
  },
  noticeBlock: {
    gap: spacing.md,
  },
  infoNotice: {
    ...type.helper,
    color: colors.textPrimary,
  },
  cardTitle: {
    ...type.cardTitle,
    color: colors.textPrimary,
  },
  meta: {
    gap: spacing.xs,
  },
  cardLine: {
    ...type.helper,
    color: colors.textSecondary,
  },
  error: {
    ...type.helper,
    color: colors.danger,
    textAlign: 'center',
  },
});

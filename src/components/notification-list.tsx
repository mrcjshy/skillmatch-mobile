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

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { AppChip } from '@/components/app-chip';
import { AppNotice } from '@/components/app-notice';
import { InlineStatus } from '@/components/inline-status';
import { SkillMatchTheme } from '@/constants/theme';
import {
  NOTIFICATION_INSERTED,
  subscribeInvalidation,
  userNotificationsTopic,
} from '@/lib/realtime';
import { supabase } from '@/lib/supabase';
import {
  COPY,
  formatNotificationLabel,
  formatTimestamp,
  isUnread,
  loadErrorCopy,
  markErrorCopy,
  NotificationError,
  NotificationRow,
  toNotificationRow,
} from '@/lib/notifications';
import { useAccount } from '@/providers/account-provider';

const { colors, type, spacing, radius } = SkillMatchTheme.ui;

/**
 * The Notifications inbox, shared by the Worker and Client routes.
 *
 * WHY ONE COMPONENT FOR BOTH ROLES
 * --------------------------------
 * Unlike N11's Booking lists, which consume two genuinely different
 * projections, both roles here read the SAME table through the SAME
 * recipient-only policy and mark read through the SAME RPC. There is no
 * per-role difference to express, so duplicating this file per role would only
 * create two copies of the unread rule and the mark-read flow that could
 * drift. The route files stay per-role so each screen keeps living inside its
 * own protected group.
 *
 * READ PATH
 * ---------
 * A direct SELECT of the caller's own rows, newest first. RLS
 * (`user_id = auth.uid()`) is the whole row filter; this screen sends no user
 * id and cannot ask for anyone else's rows. Zero rows is a SUCCESS state, not
 * an error and not a blocked account.
 *
 * WRITE PATH
 * ----------
 * Tapping an unread notification calls `mark_my_notification_read(id)`, which
 * sets is_read = true on one owned row and nothing else. The list is NEVER
 * flipped locally: a successful RPC is followed by an authoritative re-read,
 * so what the screen shows is always what the server says. If that re-read
 * fails, the mark is still committed, and the message says exactly that rather
 * than claiming the mark failed.
 */

async function loadNotifications(): Promise<NotificationRow[]> {
  // Recipient scoping comes from RLS, not from a filter written here.
  // nullsFirst: false keeps a NULL created_at from floating above real rows.
  const res = await supabase
    .from('notifications')
    .select('id, type, message, is_read, created_at')
    .order('created_at', { ascending: false, nullsFirst: false });

  if (res.error) {
    throw new NotificationError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  // Server order is preserved — no client-side re-sorting.
  return rows.map(toNotificationRow).filter((n): n is NotificationRow => n !== null);
}

type Notice = { tone: 'info' | 'warning'; text: string };

export default function NotificationList({
  onNotificationPress,
}: {
  onNotificationPress?: (notification: NotificationRow) => void;
}) {
  const { account } = useAccount();
  const accountId = account?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  /** The one notification whose mark-read is in flight; null when idle. */
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  /** Single place that applies a successful result: rows in, stale error out. */
  const load = useCallback(async () => {
    const rows = await loadNotifications();
    setNotifications(rows);
    setLoadError(null);
  }, []);

  /**
   * Failure path. The raw database/network message is logged for developers
   * but never surfaced, and 42501 is classified by CODE.
   *
   * A forbidden read does not sign the user out, change their role, or route
   * to /blocked or /bootstrap-error — account routing stays with
   * AccountProvider and the bootstrap gates.
   */
  const applyError = useCallback((e: unknown) => {
    if (e instanceof NotificationError) {
      console.warn('[N12-UI] notifications load failed:', e.code, e.message);
    } else if (e instanceof Error && e.message) {
      console.warn('[N12-UI] notifications load failed:', e.message);
    }
    setLoadError(loadErrorCopy(e));
  }, []);

  const finishInitialLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  /**
   * Fetch on mount, with a cancel flag so a late response cannot write to an
   * unmounted screen. The narrow react-hooks/set-state-in-effect suppression
   * matches the established convention across this codebase; see the note in
   * worker/bookings.tsx.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; established convention */
  useEffect(() => {
    if (!accountId) return;
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
  }, [accountId, load, applyError, finishInitialLoad]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * Subscribed only while this inbox is mounted, and only to the caller's own
   * topic — the policy compares it to `auth.uid()`, so no other user's topic is
   * authorized. R5 adds no app-global listener: the bell stays navigation-only
   * and OS-level push remains out of scope.
   *
   * A Broadcast event does one thing: the same authoritative
   * `loadNotifications()` that entry and pull-to-refresh use. The event carries
   * only a notification id and this screen never sees it — a notification
   * appears because the server returned the row, never because an event
   * described one.
   *
   * `accountId` is a dependency, so a sign-out or account switch removes the
   * previous channel, and `run.cancelled` then stops any further re-read from
   * STARTING — which is what keeps one account's rows from landing in another
   * account's inbox. `inFlight`/`pending` coalesce a burst into a single
   * follow-up read so an older response cannot overwrite a newer one.
   *
   * A failed re-read is logged and dropped rather than raised: `load()` writes
   * state only on success, so the inbox the user is reading survives a dropped
   * socket untouched, and pull-to-refresh remains the recovery.
   */
  useEffect(() => {
    if (!accountId) return;
    const run = { cancelled: false, inFlight: false, pending: false };

    const revalidate = () => {
      if (run.cancelled) return;
      if (run.inFlight) {
        run.pending = true;
        return;
      }
      run.inFlight = true;
      load()
        .catch((e: unknown) => {
          if (e instanceof Error && e.message) {
            console.warn('[R5-UI] notifications revalidate failed:', e.message);
          }
        })
        .finally(() => {
          run.inFlight = false;
          if (run.pending && !run.cancelled) {
            run.pending = false;
            revalidate();
          }
        });
    };

    const cleanup = subscribeInvalidation({
      topic: userNotificationsTopic(accountId),
      events: [NOTIFICATION_INSERTED],
      onInvalidate: revalidate,
    });

    return () => {
      run.cancelled = true;
      cleanup();
    };
  }, [accountId, load]);

  const busy = isLoading || isRefreshing || markingId !== null;

  async function handleRetry() {
    if (busy) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      await load();
      setNotice(null);
    } catch (e: unknown) {
      applyError(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefresh() {
    if (busy) return;
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
   * Mark one owned notification read. The server decides the outcome; this
   * handler never edits the row locally.
   *
   * Note the zero-row case is NOT an error: the RPC returns an empty set for
   * an id the caller does not own and for one that does not exist, which is
   * deliberately indistinguishable. Reaching it from this screen would mean
   * the list was stale, so the re-read below is the right answer either way.
   */
  async function handleMarkRead(id: string) {
    if (busy) return;
    setMarkingId(id);
    setNotice(null);
    try {
      const res = await supabase.rpc('mark_my_notification_read', { p_notification_id: id });

      if (res.error) {
        const code = res.error.code;
        // Developer-only; the user never sees a raw database message.
        console.warn('[N12-UI] mark_my_notification_read failed:', code, res.error.message);
        setNotice({ tone: 'warning', text: markErrorCopy(code ?? null) });
        return;
      }

      // Success. Authoritative re-read — the row turns read because the server
      // says so, never because this screen assumed it.
      try {
        await load();
      } catch (e: unknown) {
        if (e instanceof Error && e.message) {
          console.warn('[N12-UI] post-mark refresh failed:', e.message);
        }
        // The mark is committed; only the re-read failed. Saying "mark failed"
        // here would be wrong, and re-sending the RPC could not make it more
        // true, so it is never retried automatically.
        setNotice({ tone: 'warning', text: COPY.markRefreshFailed });
      }
    } catch (e: unknown) {
      // supabase-js returns rather than rejects, so this is defensive only.
      if (e instanceof Error && e.message) {
        console.warn('[N12-UI] mark_my_notification_read threw:', e.message);
      }
      setNotice({ tone: 'warning', text: COPY.markGeneric });
    } finally {
      setMarkingId(null);
    }
  }

  async function handleNotificationPress(notification: NotificationRow) {
    if (busy) return;
    if (isUnread(notification.is_read)) {
      await handleMarkRead(notification.id);
    }
    onNotificationPress?.(notification);
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
      <Text style={styles.note}>{COPY.intro}</Text>

      {notice ? <AppNotice variant="warning" message={notice.text} /> : null}

      {isLoading ? (
        // Rendered instead of, never before, the empty state.
        <InlineStatus variant="loading" message={COPY.loading} />
      ) : loadError ? (
        <InlineStatus
          variant="error"
          message={loadError}
          action={<AppButton label="Retry" variant="secondary" onPress={handleRetry} disabled={busy} />}
        />
      ) : notifications.length === 0 ? (
        // A successful call that returned nothing — not an error, not a block.
        <InlineStatus variant="empty" message={COPY.empty} />
      ) : (
        notifications.map((n) => {
          const unread = isUnread(n.is_read);
          const canOpen = onNotificationPress !== undefined;
          const created = formatTimestamp(n.created_at);
          const isMarkingThis = markingId === n.id;

          const body = (
            <>
              <View style={styles.cardHeader}>
                <Text style={styles.cardLabel}>{formatNotificationLabel(n.type)}</Text>
                {unread ? <AppChip label={COPY.unread} variant="neutral" /> : null}
              </View>
              {/*
                The server's own message. After N12-DB only trusted
                postgres-owned functions can create a notification, so this
                text is authoritative rather than user-supplied.
              */}
              <Text style={[styles.message, unread && styles.messageUnread]}>{n.message}</Text>
              {created ? <Text style={styles.timestamp}>{created}</Text> : null}
              {isMarkingThis ? (
                <View style={styles.markingRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.note}>Marking as read…</Text>
                </View>
              ) : unread ? (
                <Text style={styles.hint}>
                  {canOpen ? 'Tap to mark as read and open' : 'Tap to mark as read'}
                </Text>
              ) : canOpen ? (
                <Text style={styles.hint}>Tap to open</Text>
              ) : null}
            </>
          );

          // Worker/Client behavior stays mark-read-only. A caller may opt into
          // activation (the Admin inbox does) so already-read rows can still
          // open their trusted destination.
          return unread || canOpen ? (
            <Pressable
              key={n.id}
              onPress={() => { void handleNotificationPress(n); }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy: isMarkingThis }}
              accessibilityLabel={`${formatNotificationLabel(n.type)}${unread ? ', unread' : ''}. ${n.message}`}
              style={busy && !isMarkingThis ? styles.cardDisabled : undefined}
            >
              <AppCard style={unread ? styles.cardUnread : undefined}>{body}</AppCard>
            </Pressable>
          ) : (
            <AppCard key={n.id}>{body}</AppCard>
          );
        })
      )}
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
  note: {
    ...type.helper,
    color: colors.textSecondary,
  },
  cardUnread: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardLabel: {
    ...type.cardTitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  message: {
    ...type.body,
    color: colors.textSecondary,
  },
  messageUnread: {
    ...type.bodyEmphasis,
    color: colors.textPrimary,
  },
  timestamp: {
    ...type.caption,
    color: colors.textSecondary,
  },
  hint: {
    ...type.bodyEmphasis,
    color: colors.primary,
  },
  markingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});

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

import { SkillMatchTheme } from '@/constants/theme';
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

export default function NotificationList() {
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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <Text style={styles.heading}>Notifications</Text>
      <Text style={styles.note}>{COPY.intro}</Text>

      {notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice.text}</Text>
        </View>
      ) : null}

      {isLoading ? (
        // Rendered instead of, never before, the empty state.
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.note}>{COPY.loading}</Text>
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={styles.error}>{loadError}</Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={handleRetry}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : notifications.length === 0 ? (
        // A successful call that returned nothing — not an error, not a block.
        <View style={styles.center}>
          <Text style={styles.note}>{COPY.empty}</Text>
        </View>
      ) : (
        notifications.map((n) => {
          const unread = isUnread(n.is_read);
          const created = formatTimestamp(n.created_at);
          const isMarkingThis = markingId === n.id;

          const body = (
            <>
              <View style={styles.cardHeader}>
                <Text style={styles.cardLabel}>{formatNotificationLabel(n.type)}</Text>
                {unread ? (
                  <View style={styles.unreadPill}>
                    <Text style={styles.unreadPillText}>{COPY.unread}</Text>
                  </View>
                ) : null}
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
                  <ActivityIndicator />
                  <Text style={styles.note}>Marking as read…</Text>
                </View>
              ) : unread ? (
                <Text style={styles.hint}>Tap to mark as read</Text>
              ) : null}
            </>
          );

          // Only unread rows are interactive: a read row has nothing left to
          // do, so making it pressable would offer an action with no effect.
          return unread ? (
            <Pressable
              key={n.id}
              style={[styles.card, styles.cardUnread, busy && !isMarkingThis && styles.cardDisabled]}
              onPress={() => handleMarkRead(n.id)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy: isMarkingThis }}
              accessibilityLabel={`${formatNotificationLabel(n.type)}, unread. ${n.message}`}
            >
              {body}
            </Pressable>
          ) : (
            <View key={n.id} style={styles.card}>
              {body}
            </View>
          );
        })
      )}
    </ScrollView>
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
    gap: 4,
    backgroundColor: SkillMatchTheme.surface.default,
  },
  cardUnread: {
    borderColor: SkillMatchTheme.feedback.info,
    backgroundColor: '#eff6ff',
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: SkillMatchTheme.brand.primary,
    flexShrink: 1,
  },
  unreadPill: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.feedback.info,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  unreadPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: SkillMatchTheme.feedback.info,
  },
  message: {
    fontSize: 15,
    opacity: 0.85,
  },
  messageUnread: {
    fontWeight: '600',
    opacity: 1,
  },
  timestamp: {
    fontSize: 13,
    opacity: 0.6,
  },
  hint: {
    fontSize: 13,
    color: SkillMatchTheme.brand.primary,
    marginTop: 2,
  },
  markingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
  },
  notice: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    borderColor: '#b45309',
    backgroundColor: '#fffbeb',
  },
  noticeText: {
    fontSize: 14,
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

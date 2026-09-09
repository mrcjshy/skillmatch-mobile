import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BookingLoadError, formatBookingStatus } from '@/lib/bookings';
import { SkillMatchTheme } from '@/constants/theme';
import {
  canSendInStatus,
  COPY,
  fetchBookingMessages,
  formatTimestamp,
  isForbidden,
  loadErrorCopy,
  MESSAGE_MAX_LENGTH,
  MessageRow,
  remainingCharacters,
  sendBookingMessage,
  sendErrorCopy,
  validateContent,
  validationCopy,
} from '@/lib/messages';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';

/**
 * Booking chat, shared by the Worker and Client routes (BL-01C-UI).
 *
 * Both roles consume the identical server contract — one table, two
 * participant-scoped policies, one status boundary — so there is nothing to
 * fork per role except which Booking-list RPC supplies the authoritative
 * status. Keeping one component is what stops the two surfaces from drifting
 * into different ideas of when the composer is open.
 *
 * WHERE THE BOOKING STATUS COMES FROM, AND WHY IT IS RE-READ
 * ----------------------------------------------------------
 * NOT from a route parameter. The status decides whether the composer is
 * offered, so taking it from navigation state would let a screen opened before
 * a completion or cancellation keep presenting a composer whose every send the
 * server will refuse. It is read instead from the same N11 RPC the Bookings
 * list already uses — `list_my_worker_bookings()` / `list_my_client_bookings()`
 * — on entry, on refresh, and again whenever a send is rejected.
 *
 * That RPC is also the membership check: it returns only the caller's own
 * Bookings, so a `bookingId` naming someone else's Booking simply is not in
 * the result and the screen reports the Booking as unavailable. The server
 * would refuse anyway; this only avoids rendering a composer over an empty
 * conversation the caller cannot write to.
 *
 * NO COUNTERPARTY DATA IS READ TO RENDER A CONVERSATION
 * -----------------------------------------------------
 * The RPC projects counterparty contact for released statuses, and this screen
 * uses NONE of it — not the name, phone, barangay, skills, verification or
 * rating. Only `booking_status` and `job_title` are consumed. Bubbles are
 * labelled from `sender_id` alone, so the terminal-state privacy suppression
 * N11 established cannot be reopened here, and a label never flips from a
 * person's name to "Other participant" as a Booking ends.
 *
 * HISTORY IS NEVER HIDDEN
 * -----------------------
 * Terminal Bookings keep their conversation: the SELECT policy carries no
 * status predicate, and this screen carries none either. `completed`,
 * `cancelled` and `no_show` render the full history with the composer replaced
 * by a closed notice — they do not render an empty screen, and the entry point
 * that leads here is not withdrawn.
 *
 * REFRESH IS EXPLICIT
 * -------------------
 * Screen entry, pull-to-refresh, and an authoritative re-read immediately
 * after a successful send. No Realtime subscription, no polling timer, no
 * background listener.
 */

export type ChatRole = 'worker' | 'client';

/** The only two fields consumed from the Booking-list row. */
type ChatBooking = {
  status: string;
  jobTitle: string;
};

const RPC_FOR_ROLE: Record<ChatRole, string> = {
  worker: 'list_my_worker_bookings',
  client: 'list_my_client_bookings',
};

/**
 * Find this Booking in the caller's own list. Returns null when the Booking is
 * not the caller's — which is indistinguishable from it not existing, and
 * deliberately so: reporting the difference would confirm the existence of a
 * Booking the caller cannot see.
 */
async function loadChatBooking(role: ChatRole, bookingId: string): Promise<ChatBooking | null> {
  const res = await supabase.rpc(RPC_FOR_ROLE[role]);
  if (res.error) {
    throw new BookingLoadError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    if (r.booking_id !== bookingId) continue;
    const status = typeof r.booking_status === 'string' ? r.booking_status : null;
    const jobTitle = typeof r.job_title === 'string' ? r.job_title : null;
    if (status === null || jobTitle === null) return null;
    return { status, jobTitle };
  }
  return null;
}

export default function BookingChat({
  role,
  bookingId,
}: {
  role: ChatRole;
  bookingId: string | null;
}) {
  const { account } = useAccount();
  /** The authenticated user id, from the session — never from a row or a route
   *  parameter. The policy re-checks it as `auth.uid() = sender_id`. */
  const senderId = account?.id ?? null;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [booking, setBooking] = useState<ChatBooking | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  /**
   * One authoritative round trip: status first, then history.
   *
   * Status is fetched before messages so a Booking that has left `confirmed`
   * closes the composer in the same render that shows the conversation, rather
   * than one frame later.
   */
  const load = useCallback(async () => {
    if (bookingId === null) {
      setBooking(null);
      setMessages([]);
      setLoadError(null);
      return;
    }
    const found = await loadChatBooking(role, bookingId);
    if (found === null) {
      // Not the caller's Booking, or gone. No history is fetched: the SELECT
      // would return zero rows anyway, and asking would imply the id is worth
      // probing.
      setBooking(null);
      setMessages([]);
      setLoadError(null);
      return;
    }
    const rows = await fetchBookingMessages(bookingId);
    setBooking(found);
    setMessages(rows);
    setLoadError(null);
  }, [role, bookingId]);

  /**
   * Failure path. The raw database/network message is logged for developers
   * but never surfaced, and a 42501 is classified by CODE, never by text.
   *
   * A forbidden read does not sign the user out, change their role, or route
   * to /blocked — AccountProvider and the bootstrap gates stay authoritative
   * for who this account is, exactly as in the Bookings screens.
   */
  const applyError = useCallback((e: unknown) => {
    if (e instanceof Error && e.message) {
      console.warn('[BL-01C-UI] booking chat load failed:', e.message);
    }
    setLoadError(loadErrorCopy(e));
  }, []);

  const finishInitialLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  /**
   * Load once when the Booking id and account are available, with a cancel
   * flag so a late response cannot write to an unmounted screen.
   *
   * The eslint suppression matches the established convention in this codebase
   * (worker/bookings.tsx, client/bookings.tsx, notification-list.tsx and
   * others trip the same rule for the same reason): the rule rejects any
   * setState reachable from an effect, and satisfying it properly would mean
   * introducing a data-fetching library or restructuring every screen, neither
   * of which is in BL-01C's scope. It is narrowed to this hook alone.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; see the note above */
  useEffect(() => {
    if (!senderId) return;
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
  }, [senderId, load, applyError, finishInitialLoad]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleRetry() {
    if (isLoading || isRefreshing || isSending) return;
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
    if (isLoading || isRefreshing || isSending) return;
    setIsRefreshing(true);
    try {
      await load();
    } catch (e: unknown) {
      applyError(e);
    } finally {
      setIsRefreshing(false);
    }
  }

  /**
   * Send, then re-read.
   *
   * `isSending` is the in-flight guard: a second press while a send is
   * outstanding is ignored, so a double tap cannot post the message twice.
   * There is no optimistic append — the conversation only ever shows what the
   * server returned, so a message can never appear locally that the policy
   * refused.
   *
   * On a 42501 the draft is KEPT. The most likely cause is that the Booking
   * left `confirmed` while the screen was open, and the reload that follows
   * closes the composer; discarding what the user wrote on top of that would
   * lose their text with no way to recover it. The reload is attempted once
   * and is not retried in a loop.
   */
  async function handleSend() {
    if (isSending || isLoading || isRefreshing) return;
    if (senderId === null || bookingId === null) return;

    const validation = validateContent(draft);
    if (!validation.ok) {
      setSendError(validationCopy(validation.reason));
      return;
    }

    setIsSending(true);
    setSendError(null);
    try {
      await sendBookingMessage(bookingId, senderId, validation.content);
      setDraft('');
      try {
        await load();
      } catch {
        // The message IS committed; only the follow-up read failed. This must
        // never be reported as a send failure.
        setSendError(COPY.sendRefreshFailed);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message) {
        console.warn('[BL-01C-UI] send failed:', e.message);
      }
      setSendError(sendErrorCopy(e));
      if (isForbidden(e)) {
        // Re-read the authoritative Booking state once, so the composer closes
        // if the Booking is no longer open for messaging.
        try {
          await load();
        } catch {
          // Leave the existing view in place; the send error already explains
          // what happened and a failed refresh must not overwrite it.
        }
      }
    } finally {
      setIsSending(false);
    }
  }

  const canSend = booking !== null && canSendInStatus(booking.status);
  const remaining = remainingCharacters(draft);
  const isDraftSendable = validateContent(draft).ok;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        {booking !== null ? (
          <>
            <Text style={styles.heading}>{booking.jobTitle}</Text>
            <Text style={styles.status}>Status: {formatBookingStatus(booking.status)}</Text>
          </>
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
              disabled={isLoading || isRefreshing || isSending}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : booking === null ? (
          // Not the caller's Booking, or no Booking id was supplied. Says
          // nothing about whether such a Booking exists.
          <View style={styles.center}>
            <Text style={styles.note}>{COPY.notFound}</Text>
          </View>
        ) : messages.length === 0 ? (
          // A successful read that returned nothing — not an error.
          <View style={styles.center}>
            <Text style={styles.note}>{COPY.empty}</Text>
          </View>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === senderId;
            // Formatted at render from the raw ISO instant, never cached in
            // state, so a device timezone change re-derives it on reload.
            const sentAt = formatTimestamp(message.created_at);

            return (
              <View
                key={message.id}
                style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
              >
                <Text style={styles.bubbleAuthor}>{mine ? COPY.you : COPY.other}</Text>
                {/* Plain text. React Native <Text> renders no markup, so there
                    is nothing to sanitise and nothing is interpreted. */}
                <Text style={styles.bubbleText}>{message.content}</Text>
                {sentAt ? <Text style={styles.bubbleTime}>{sentAt}</Text> : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/*
        The composer is offered only while the server would accept a send. For
        every terminal status the conversation above stays fully readable and
        this area becomes a plain notice — the screen is never withdrawn.
      */}
      {!isLoading && !loadError && booking !== null ? (
        canSend ? (
          <View style={styles.composer}>
            {sendError ? <Text style={styles.error}>{sendError}</Text> : null}
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={COPY.composerPlaceholder}
              multiline
              editable={!isSending}
              accessibilityLabel={COPY.composerPlaceholder}
            />
            <View style={styles.composerRow}>
              {/* Counts down against the same trimmed length the server
                  measures. Over-length is reported, never truncated. */}
              <Text style={remaining < 0 ? styles.counterOver : styles.counter}>
                {remaining} / {MESSAGE_MAX_LENGTH}
              </Text>
              <Pressable
                style={[
                  styles.primaryButton,
                  !isDraftSendable || isSending ? styles.primaryButtonDisabled : null,
                ]}
                onPress={handleSend}
                disabled={!isDraftSendable || isSending}
                accessibilityRole="button"
              >
                <Text style={styles.primaryButtonText}>{isSending ? 'Sending…' : 'Send'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.composer}>
            <Text style={styles.closed}>{COPY.closed}</Text>
          </View>
        )
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: 24,
    gap: 12,
    paddingBottom: 24,
  },
  center: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  status: {
    fontSize: 15,
    fontWeight: '600',
    color: SkillMatchTheme.brand.primary,
    marginBottom: 4,
  },
  note: {
    fontSize: 14,
    opacity: 0.7,
  },
  bubble: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 10,
    gap: 2,
    maxWidth: '90%',
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
  },
  bubbleAuthor: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
  },
  bubbleText: {
    fontSize: 15,
  },
  bubbleTime: {
    fontSize: 11,
    opacity: 0.6,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    padding: 12,
    gap: 8,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 120,
  },
  counter: {
    fontSize: 12,
    opacity: 0.6,
  },
  counterOver: {
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '600',
  },
  closed: {
    fontSize: 14,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
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

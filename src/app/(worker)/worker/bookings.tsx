import { Stack, useRouter } from 'expo-router';
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

import {
  BookingLoadError,
  formatBookingStatus,
  formatBudget,
  formatLocation,
  formatTimestamp,
  isCounterpartyReleased,
  LOAD_COPY,
  loadErrorCopy,
  toNullableText,
  toNumber,
} from '@/lib/bookings';
import { isLifecycleActionableStatus } from '@/lib/booking-lifecycle';
import {
  BookingPayment as BookingPaymentState,
  fetchBookingPayments,
  isPayableStatus,
} from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';

import BookingLifecycle from '@/components/booking-lifecycle';
import BookingPayment from '@/components/booking-payment';

/**
 * Worker "My Bookings" = the Bookings this Worker holds, listed in full history
 * (N11-UI), with the one lifecycle control BL-01A-UI adds.
 *
 * The ONLY data source is the hosted RPC `public.list_my_worker_bookings()`,
 * called with ZERO arguments. The Worker identity comes from `auth.uid()`
 * inside that SECURITY DEFINER function, so there is no worker id to pass and
 * none that could be substituted to view someone else's Bookings.
 *
 * THE LIST STAYS SERVER-AUTHORITATIVE
 * -----------------------------------
 * `public.bookings` has NO INSERT and NO UPDATE policy (N9 removed both), so no
 * direct Booking write exists on this screen and none could be added. BL-01A-UI
 * offers exactly ONE lifecycle transition to the Worker, through its narrow
 * SECURITY DEFINER RPC: on a CONFIRMED Booking the assigned Worker may cancel
 * (`cancel_my_booking()`), which either participant may do.
 *
 * THE WORKER CANNOT COMPLETE
 * --------------------------
 * `complete_my_client_booking()` requires an active Client who OWNS the
 * Booking and refuses the assigned Worker outright, so no completion control is
 * rendered here in any status. That is not cosmetic: it is what stops a Worker
 * declaring their own job finished and unlocking payment. No no-show, strike,
 * rematching or reopen control exists here either.
 *
 * BL-01D adds the one write this screen does perform, and it changes no
 * lifecycle column: on a COMPLETED Booking the Client chose Cash on Delivery,
 * the assigned Worker confirms the cash was actually received through
 * `confirm_my_cod_payment_received()`, and only `payment_status` moves. The
 * Worker never chooses the payment method — that control belongs to the Client.
 *
 * The ONE action added by BL-01C-UI is navigation: "Open Chat" routes to
 * /worker/chat, which reads and writes `public.messages` — never `bookings`.
 * It is offered in EVERY status, because message history stays readable after
 * a Booking ends; the chat screen itself decides whether a composer is shown,
 * from a server re-read rather than from anything passed here.
 *
 * TWO INDEPENDENT AXES
 * --------------------
 * Ownership decides whether a Booking is LISTED — every status is listed, so
 * history never disappears. Status decides only whether the CLIENT'S CONTACT
 * was released: confirmed/completed release `client_full_name` and
 * `client_phone`; pending/cancelled/no_show return both as NULL. Those NULLs
 * are the contract working correctly, not missing data, and are rendered as a
 * neutral sentence rather than as `null`. The Client's EMAIL is never
 * projected in any status and is never displayed.
 *
 * Nothing here reconstructs Booking state. This screen does not query
 * `job_postings` or `users` directly, performs no cross-user lookup to fill in
 * a suppressed field, does not infer a Booking from job status or from a
 * previous acceptance in `worker/opportunities`, and never re-sorts the rows —
 * the server's newest-first ordering is rendered as received. It reads one
 * thing from `bookings` directly, restricted by RLS to Bookings this Worker is
 * assigned to and narrowed to three columns: the payment tuple, because the
 * N11 RPC projects `payment_status` but not `payment_method` (BL-01D).
 *
 * Zero rows is a SUCCESS state, not an error and not a blocked account.
 */

/** Exactly the 16 fields `public.list_my_worker_bookings()` returns. */
type WorkerBooking = {
  booking_id: string;
  job_id: string;
  booking_status: string;
  /**
   * Consumed for contract completeness but NOT rendered from here. The payment
   * section reads the authoritative tuple (method AND status) directly instead,
   * because this projection carries no `payment_method` and so cannot tell
   * "nothing chosen yet" apart from "COD awaiting cash".
   */
  payment_status: string | null;
  booked_at: string | null;
  completed_at: string | null;
  job_title: string;
  job_description: string | null;
  job_scheduled_at: string | null;
  job_address: string | null;
  job_barangay: string | null;
  job_city: string | null;
  job_budget: number | null;
  client_user_id: string;
  client_full_name: string | null;
  client_phone: string | null;
};

/**
 * Validate one RPC row. `booking_id`, `job_id`, `booking_status`, `job_title`
 * and `client_user_id` are NOT NULL by construction, so a row missing any of
 * them is malformed rather than merely sparse and is dropped instead of
 * rendered half-blank. The counterparty fields are legitimately NULL for a
 * suppressed status and are never treated as a defect.
 */
function toWorkerBooking(row: unknown): WorkerBooking | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;

  const bookingId = typeof r.booking_id === 'string' ? r.booking_id : null;
  const jobId = typeof r.job_id === 'string' ? r.job_id : null;
  const status = typeof r.booking_status === 'string' ? r.booking_status : null;
  const title = typeof r.job_title === 'string' ? r.job_title : null;
  const clientUserId = typeof r.client_user_id === 'string' ? r.client_user_id : null;

  if (bookingId === null || jobId === null) return null;
  if (status === null || title === null || clientUserId === null) return null;

  return {
    booking_id: bookingId,
    job_id: jobId,
    booking_status: status,
    payment_status: toNullableText(r.payment_status),
    booked_at: toNullableText(r.booked_at),
    completed_at: toNullableText(r.completed_at),
    job_title: title,
    job_description: toNullableText(r.job_description),
    job_scheduled_at: toNullableText(r.job_scheduled_at),
    job_address: toNullableText(r.job_address),
    job_barangay: toNullableText(r.job_barangay),
    job_city: toNullableText(r.job_city),
    job_budget: toNumber(r.job_budget),
    client_user_id: clientUserId,
    client_full_name: toNullableText(r.client_full_name),
    client_phone: toNullableText(r.client_phone),
  };
}

async function loadWorkerBookings(): Promise<WorkerBooking[]> {
  // Zero arguments: the RPC derives the Worker from auth.uid().
  const res = await supabase.rpc('list_my_worker_bookings');
  if (res.error) {
    // The SQLSTATE is carried through so the screen can branch on error.code.
    // It must never branch on error.message: 42501 arrives with two different
    // messages for the same code.
    throw new BookingLoadError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  // Server order is preserved — no client-side re-sorting.
  return rows.map(toWorkerBooking).filter((b): b is WorkerBooking => b !== null);
}

const COPY = {
  suppressedContact: 'Client contact is not available for this booking status.',
  loading: 'Loading your bookings…',
  intro: 'Jobs booked to you.',
} as const;

export default function WorkerBookings() {
  const { account } = useAccount();
  const router = useRouter();
  const workerId = account?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<WorkerBooking[]>([]);
  /** Payment tuple per completed Booking id, read authoritatively from the
   *  server on every load — never inferred from a successful confirmation. */
  const [bookingPayments, setBookingPayments] = useState<Map<string, BookingPaymentState>>(
    new Map()
  );

  /** Single place that applies a successful result: rows in, stale error out. */
  const load = useCallback(async () => {
    const rows = await loadWorkerBookings();
    // Payment tuples come straight from `bookings` because the N11 RPC projects
    // payment_status but not payment_method, so it cannot tell "no method
    // chosen" apart from "COD awaiting cash". RLS scopes the read to Bookings
    // this Worker is assigned to.
    const payments = await fetchBookingPayments(
      rows.filter((b) => isPayableStatus(b.booking_status)).map((b) => b.booking_id)
    );
    setBookings(rows);
    setBookingPayments(payments);
    setLoadError(null);
  }, []);

  /**
   * Failure path. The raw database/network message is logged for developers
   * but never surfaced to the Worker, and a 42501 is classified by CODE.
   *
   * Note what does NOT happen here: a forbidden read does not sign the Worker
   * out, change their role, or route to /blocked or /bootstrap-error. Account
   * routing stays with AccountProvider and the bootstrap gates.
   */
  const applyError = useCallback((e: unknown) => {
    if (e instanceof BookingLoadError) {
      console.warn('[N11-UI] list_my_worker_bookings failed:', e.code, e.message);
    } else if (e instanceof Error && e.message) {
      console.warn('[N11-UI] list_my_worker_bookings failed:', e.message);
    }
    setLoadError(loadErrorCopy(e));
  }, []);

  const finishInitialLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  /**
   * Load once when the Worker id becomes available, with a cancel flag so a
   * late response cannot write to an unmounted screen.
   *
   * react-hooks/set-state-in-effect fires on the error path: the rule rejects
   * any setState reachable from an effect, including one reached through a
   * useCallback inside a promise handler. Fetch-on-mount is the established
   * convention in this codebase (worker/index.tsx, client/index.tsx,
   * worker/opportunities.tsx, admin/index.tsx and account-provider.tsx all
   * trip the same rule), and satisfying it properly would mean introducing a
   * data-fetching library or restructuring those screens — neither of which is
   * in N11-UI's scope. The suppression is therefore narrowed to this single
   * line, and the pre-existing violations elsewhere are left untouched.
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
      <Stack.Screen options={{ title: 'My Bookings' }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.heading}>My Bookings</Text>
        <Text style={styles.note}>{COPY.intro}</Text>

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
              disabled={isLoading || isRefreshing}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : bookings.length === 0 ? (
          // A successful call that returned nothing — not an error, not a block.
          <View style={styles.center}>
            <Text style={styles.note}>{LOAD_COPY.empty}</Text>
          </View>
        ) : (
          bookings.map((booking) => {
            const location = formatLocation(
              booking.job_address,
              booking.job_barangay,
              booking.job_city
            );
            const budget = formatBudget(booking.job_budget);
            // Formatted at render from the raw ISO instant, never cached in
            // state, so a device timezone change re-derives it on reload.
            const schedule = formatTimestamp(booking.job_scheduled_at);
            const bookedAt = formatTimestamp(booking.booked_at);
            const completedAt = formatTimestamp(booking.completed_at);
            const contactReleased = isCounterpartyReleased(booking.booking_status);

            return (
              <View key={booking.booking_id} style={styles.card}>
                <Text style={styles.cardTitle}>{booking.job_title}</Text>
                <Text style={styles.status}>
                  Status: {formatBookingStatus(booking.booking_status)}
                </Text>

                {booking.job_description ? (
                  <Text style={styles.cardLine}>{booking.job_description}</Text>
                ) : null}
                {schedule ? <Text style={styles.cardLine}>Schedule: {schedule}</Text> : null}
                {budget ? <Text style={styles.cardLine}>Budget: {budget}</Text> : null}
                {location ? <Text style={styles.cardLine}>Location: {location}</Text> : null}
                {bookedAt ? <Text style={styles.cardLine}>Booked: {bookedAt}</Text> : null}
                {completedAt ? (
                  <Text style={styles.cardLine}>Completed: {completedAt}</Text>
                ) : null}

                {/*
                  Client contact. The block is chosen by the Booking status
                  because that is the locked release rule — but every value
                  shown comes from the RPC, and nothing is fetched or invented
                  to fill a suppressed field.
                */}
                <Text style={styles.sectionTitle}>Client</Text>
                {contactReleased ? (
                  <>
                    <Text style={styles.cardLine}>
                      Name: {booking.client_full_name ?? 'Not provided'}
                    </Text>
                    <Text style={styles.cardLine}>
                      Phone: {booking.client_phone ?? 'Not provided'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.suppressed}>{COPY.suppressedContact}</Text>
                )}

                {/*
                  Lifecycle actions (BL-01A-UI). Offered only while the Booking
                  is CONFIRMED, and for the Worker that means Cancel alone —
                  the component renders no completion control for this role at
                  any status. Every terminal status renders nothing here.
                */}
                {isLifecycleActionableStatus(booking.booking_status) ? (
                  <BookingLifecycle
                    role="worker"
                    bookingId={booking.booking_id}
                    onChanged={load}
                  />
                ) : null}

                {/*
                  COD payment (BL-01D-UI). The assigned Worker is the only
                  party who can attest that cash changed hands, so the confirm
                  control lives here and nowhere else. The Worker never chooses
                  the method — that is the Client's decision on their screen.
                */}
                {isPayableStatus(booking.booking_status) ? (
                  <BookingPayment
                    role="worker"
                    bookingId={booking.booking_id}
                    payment={bookingPayments.get(booking.booking_id)}
                    onChanged={load}
                  />
                ) : null}

                {/*
                  Offered in EVERY status. Withdrawing it for a terminal
                  Booking would hide history the SELECT policy deliberately
                  keeps readable. Only the Booking id travels: the chat screen
                  re-reads the status from the server rather than trusting a
                  navigation parameter.
                */}
                <Pressable
                  style={styles.chatButton}
                  onPress={() =>
                    router.push({
                      pathname: '/worker/chat',
                      params: { bookingId: booking.booking_id },
                    })
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.chatButtonText}>Open Chat</Text>
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
  status: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1d4ed8',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  suppressed: {
    fontSize: 14,
    fontStyle: 'italic',
    opacity: 0.7,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
  },
  chatButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  chatButtonText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600',
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

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
  formatRating,
  formatSkills,
  formatTimestamp,
  formatVerification,
  isCounterpartyReleased,
  LOAD_COPY,
  loadErrorCopy,
  toNullableBoolean,
  toNullableText,
  toNumber,
  toStringArrayOrNull,
} from '@/lib/bookings';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/providers/account-provider';

/**
 * Client "My Bookings" = READ-ONLY history of the Bookings this Client owns
 * (N11-UI).
 *
 * The ONLY data source is the hosted RPC `public.list_my_client_bookings()`,
 * called with ZERO arguments. The Client identity comes from `auth.uid()`
 * inside that SECURITY DEFINER function, so there is no client id to pass and
 * none that could be substituted to view someone else's Bookings.
 *
 * THE LIST ITSELF STAYS READ-ONLY
 * -------------------------------
 * `public.bookings` has NO INSERT and NO UPDATE policy, so nothing on this
 * screen changes Booking state: there is no cancel, complete, no-show, pay or
 * rate control. BL-01A added the two lifecycle RPCs server-side, but no UI
 * calls them yet; that remains a separate piece. Ratings in particular are
 * DISPLAY-ONLY: no submission action exists, and `public.ratings` INSERT is
 * currently unguarded, which is a separate security piece.
 *
 * The ONE action added by BL-01C-UI is navigation: "Open Chat" routes to
 * /client/chat, which reads and writes `public.messages` — never `bookings`.
 * It is offered in EVERY status, because message history stays readable after
 * a Booking ends; the chat screen itself decides whether a composer is shown,
 * from a server re-read rather than from anything passed here.
 *
 * TWO INDEPENDENT AXES
 * --------------------
 * Ownership decides whether a Booking is LISTED — every status is listed, so
 * history never disappears. Status decides only whether the WORKER PROFILE
 * BLOCK was released, and the server releases it as ONE UNIT: name, phone,
 * barangay, skills, verification and rating aggregates all arrive together for
 * confirmed/completed, and all arrive NULL for pending/cancelled/no_show.
 * Those NULLs are the contract working correctly, not missing data. The
 * Worker's EMAIL and `verified_by` are never projected and are never
 * displayed.
 *
 * This screen does not query `bookings`, `job_postings`, `users`,
 * `worker_profiles` or `ratings` directly, performs no cross-user lookup to
 * fill in a suppressed field, does not join the Worker's details locally, and
 * never re-sorts the rows.
 */

/** Exactly the 21 fields `public.list_my_client_bookings()` returns. */
type ClientBooking = {
  booking_id: string;
  job_id: string;
  booking_status: string;
  /**
   * Consumed for contract completeness but deliberately NOT rendered: payment
   * lifecycle is untouched by this piece and `payment_status` defaults to
   * 'pending' for every row, so displaying it would imply a payment surface
   * that does not exist.
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
  worker_user_id: string;
  worker_full_name: string | null;
  worker_phone: string | null;
  worker_barangay: string | null;
  /** THREE-VALUED: null = suppressed, [] = released but no skills, [...] = released. */
  worker_skills: string[] | null;
  worker_is_verified: boolean | null;
  worker_rating_avg: number | null;
  worker_rating_count: number | null;
};

/**
 * Validate one RPC row. `booking_id`, `job_id`, `booking_status`, `job_title`
 * and `worker_user_id` are NOT NULL by construction, so a row missing any of
 * them is malformed rather than merely sparse and is dropped instead of
 * rendered half-blank. The Worker profile fields are legitimately NULL for a
 * suppressed status and are never treated as a defect.
 */
function toClientBooking(row: unknown): ClientBooking | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;

  const bookingId = typeof r.booking_id === 'string' ? r.booking_id : null;
  const jobId = typeof r.job_id === 'string' ? r.job_id : null;
  const status = typeof r.booking_status === 'string' ? r.booking_status : null;
  const title = typeof r.job_title === 'string' ? r.job_title : null;
  const workerUserId = typeof r.worker_user_id === 'string' ? r.worker_user_id : null;

  if (bookingId === null || jobId === null) return null;
  if (status === null || title === null || workerUserId === null) return null;

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
    worker_user_id: workerUserId,
    worker_full_name: toNullableText(r.worker_full_name),
    worker_phone: toNullableText(r.worker_phone),
    worker_barangay: toNullableText(r.worker_barangay),
    // Must NOT collapse SQL NULL into an empty array: that would erase the
    // difference between "suppressed" and "released, but no skills".
    worker_skills: toStringArrayOrNull(r.worker_skills),
    worker_is_verified: toNullableBoolean(r.worker_is_verified),
    worker_rating_avg: toNumber(r.worker_rating_avg),
    worker_rating_count: toNumber(r.worker_rating_count),
  };
}

async function loadClientBookings(): Promise<ClientBooking[]> {
  // Zero arguments: the RPC derives the Client from auth.uid().
  const res = await supabase.rpc('list_my_client_bookings');
  if (res.error) {
    // The SQLSTATE is carried through so the screen can branch on error.code.
    // It must never branch on error.message: 42501 arrives with two different
    // messages for the same code.
    throw new BookingLoadError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  // Server order is preserved — no client-side re-sorting.
  return rows.map(toClientBooking).filter((b): b is ClientBooking => b !== null);
}

const COPY = {
  suppressedWorker: 'Worker details are not available for this booking status.',
  loading: 'Loading your bookings…',
  intro: 'Workers booked to your jobs. This list is read-only.',
} as const;

export default function ClientBookings() {
  const { account } = useAccount();
  const router = useRouter();
  const clientId = account?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<ClientBooking[]>([]);

  /** Single place that applies a successful result: rows in, stale error out. */
  const load = useCallback(async () => {
    const rows = await loadClientBookings();
    setBookings(rows);
    setLoadError(null);
  }, []);

  /**
   * Failure path. The raw database/network message is logged for developers
   * but never surfaced to the Client, and a 42501 is classified by CODE.
   *
   * Note what does NOT happen here: a forbidden read does not sign the Client
   * out, change their role, or route to /blocked or /bootstrap-error. Account
   * routing stays with AccountProvider and the bootstrap gates.
   */
  const applyError = useCallback((e: unknown) => {
    if (e instanceof BookingLoadError) {
      console.warn('[N11-UI] list_my_client_bookings failed:', e.code, e.message);
    } else if (e instanceof Error && e.message) {
      console.warn('[N11-UI] list_my_client_bookings failed:', e.message);
    }
    setLoadError(loadErrorCopy(e));
  }, []);

  const finishInitialLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  /**
   * Load once when the Client id becomes available, with a cancel flag so a
   * late response cannot write to an unmounted screen. The narrow
   * react-hooks/set-state-in-effect suppression matches the established
   * fetch-on-mount convention in this codebase; see the note in
   * worker/bookings.tsx.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount; established convention */
  useEffect(() => {
    if (!clientId) return;
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
  }, [clientId, load, applyError, finishInitialLoad]);
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
            const profileReleased = isCounterpartyReleased(booking.booking_status);

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
                  Assigned Worker. The block is chosen by the Booking status
                  because that is the locked release rule — but every value
                  shown comes from the RPC, and nothing is fetched or invented
                  to fill a suppressed field. The whole block is released or
                  suppressed together, exactly as the server projects it.
                */}
                <Text style={styles.sectionTitle}>Assigned Worker</Text>
                {profileReleased ? (
                  <>
                    <Text style={styles.cardLine}>
                      Name: {booking.worker_full_name ?? 'Not provided'}
                    </Text>
                    <Text style={styles.cardLine}>
                      Phone: {booking.worker_phone ?? 'Not provided'}
                    </Text>
                    <Text style={styles.cardLine}>
                      Barangay: {booking.worker_barangay ?? 'Not provided'}
                    </Text>
                    <Text style={styles.cardLine}>
                      Skills: {formatSkills(booking.worker_skills)}
                    </Text>
                    <Text style={styles.cardLine}>
                      {formatVerification(booking.worker_is_verified)}
                    </Text>
                    {/*
                      Display-only. A count of 0 renders "No ratings yet" —
                      never 0 stars, and never N8's neutral 3.0 matching
                      constant. There is no rating submission control here.
                    */}
                    <Text style={styles.cardLine}>
                      Rating:{' '}
                      {formatRating(booking.worker_rating_avg, booking.worker_rating_count)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.suppressed}>{COPY.suppressedWorker}</Text>
                )}

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
                      pathname: '/client/chat',
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

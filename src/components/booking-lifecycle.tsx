import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  cancelBooking,
  cancelErrorCopy,
  completeClientBooking,
  completeErrorCopy,
  COPY,
} from '@/lib/booking-lifecycle';

/**
 * The lifecycle action section of one CONFIRMED Booking card (BL-01A-UI).
 *
 * Shared by the Client and Worker screens for the same reason BookingPayment is
 * shared: both roles act on the same Booking and must never disagree about what
 * is possible in a given state. Only the controls offered differ.
 *
 * THE TWO ROLES HAVE STRICTLY DIFFERENT POWERS
 * --------------------------------------------
 * The Client may complete or cancel. The Worker may only cancel -- there is no
 * Worker completion control at any state, and this component contains no code
 * path that could render one. That asymmetry is enforced server-side
 * (`complete_my_client_booking` requires an active Client who owns the Booking
 * and refuses the assigned Worker outright), but the UI must not imply an
 * action the server will refuse, so the branch below simply does not exist for
 * the Worker.
 *
 * NOTHING IS OPTIMISTIC
 * ---------------------
 * Neither action mutates local state on success. Each calls `onChanged()`, and
 * the screen re-reads the authoritative Booking list. A card therefore only
 * changes shape once the server has confirmed the new state -- a button can
 * never vanish on the strength of a request the server did not honour, and
 * `booking_status`, `completed_at`, the Job status and the payment tuple are
 * never written locally.
 *
 * Rendered only where the screen has already established
 * `booking_status = 'confirmed'`; both RPCs re-check that under a row lock.
 */

export type LifecycleRole = 'client' | 'worker';

type LifecycleAction = 'complete' | 'cancel';

export default function BookingLifecycle({
  role,
  bookingId,
  onChanged,
}: {
  role: LifecycleRole;
  bookingId: string;
  onChanged: () => Promise<void>;
}) {
  /**
   * One busy slot per Booking card, holding WHICH action is in flight. Both
   * controls on this card are disabled while either runs, since completing and
   * cancelling the same Booking concurrently is never coherent. Other cards are
   * untouched: each renders its own instance with its own state.
   */
  const [busyAction, setBusyAction] = useState<LifecycleAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isBusy = busyAction !== null;

  /**
   * `busyAction` is the in-flight guard, so a double tap cannot fire twice.
   * Even if one slipped through, the server is safe: the second call finds the
   * Booking no longer `confirmed` and raises SM409 without writing anything.
   * The guard exists so the user is not shown a confusing conflict error for
   * their own duplicate tap.
   */
  async function run(
    action: LifecycleAction,
    call: () => Promise<void>,
    copyFor: (e: unknown) => string
  ) {
    if (isBusy) return;
    setBusyAction(action);
    setError(null);
    try {
      await call();
      try {
        await onChanged();
      } catch {
        // The transition IS committed; only the follow-up read failed. This
        // must never read as a failed lifecycle action.
        setError(COPY.refreshFailed);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message) {
        console.warn('[BL-01A-UI] lifecycle action failed:', action, e.message);
      }
      setError(copyFor(e));
    } finally {
      setBusyAction(null);
    }
  }

  /**
   * Completion is not destructive, but it IS one-way and it unlocks payment, so
   * it is confirmed too — and the prompt says explicitly that completing does
   * not mean payment has been received.
   */
  function promptComplete() {
    if (isBusy) return;
    Alert.alert(COPY.completeConfirmTitle, COPY.completeConfirmBody, [
      { text: COPY.dismiss, style: 'cancel' },
      {
        text: COPY.completeConfirmAction,
        onPress: () => {
          void run('complete', () => completeClientBooking(bookingId), completeErrorCopy);
        },
      },
    ]);
  }

  /**
   * Cancellation is terminal for both the Booking and the Job, and the Job does
   * not automatically reopen. The prompt states that rather than leaving the
   * user to discover it.
   */
  function promptCancel() {
    if (isBusy) return;
    Alert.alert(COPY.cancelConfirmTitle, COPY.cancelConfirmBody, [
      { text: COPY.dismiss, style: 'cancel' },
      {
        text: COPY.cancelConfirmAction,
        style: 'destructive',
        onPress: () => {
          void run('cancel', () => cancelBooking(bookingId), cancelErrorCopy);
        },
      },
    ]);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{COPY.heading}</Text>

      {/* Client only. The Worker branch below never renders this control. */}
      {role === 'client' ? (
        <Pressable
          style={[styles.button, isBusy ? styles.buttonDisabled : null]}
          onPress={promptComplete}
          disabled={isBusy}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>
            {busyAction === 'complete' ? COPY.completing : COPY.complete}
          </Text>
        </Pressable>
      ) : null}

      {/* Offered to both participants. */}
      <Pressable
        style={[styles.button, styles.cancelButton, isBusy ? styles.buttonDisabled : null]}
        onPress={promptCancel}
        disabled={isBusy}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, styles.cancelButtonText]}>
          {busyAction === 'cancel' ? COPY.cancelling : COPY.cancel}
        </Text>
      </Pressable>

      {isBusy ? <ActivityIndicator style={styles.spinner} /> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
    gap: 4,
  },
  heading: {
    fontSize: 15,
    fontWeight: '600',
  },
  button: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    borderColor: '#b91c1c',
  },
  cancelButtonText: {
    color: '#b91c1c',
  },
  spinner: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    marginTop: 4,
  },
});

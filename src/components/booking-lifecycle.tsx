import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { SkillMatchTheme } from '@/constants/theme';
import {
  cancelBooking,
  cancelErrorCopy,
  completeClientBooking,
  completeErrorCopy,
  COPY,
} from '@/lib/booking-lifecycle';

const { colors, type, spacing } = SkillMatchTheme.ui;

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

      {/*
        Client only. The Worker branch below never renders this control.

        Completion is the Client's one mutation on a confirmed Booking, so it
        is the filled primary here. The Worker sees no primary at all rather
        than a manufactured one -- there is no Worker action in this state.
      */}
      {role === 'client' ? (
        <AppButton
          variant="primary"
          label={busyAction === 'complete' ? COPY.completing : COPY.complete}
          onPress={promptComplete}
          loading={busyAction === 'complete'}
          disabled={isBusy}
        />
      ) : null}

      {/*
        Offered to both participants, and deliberately the quietest control on
        the card: cancelling is terminal and never rematches, so it must not
        sit at the same weight as the action the participant actually came to
        perform. The confirmation dialog is unchanged.
      */}
      <AppButton
        variant="destructive"
        label={busyAction === 'cancel' ? COPY.cancelling : COPY.cancel}
        onPress={promptCancel}
        loading={busyAction === 'cancel'}
        disabled={isBusy}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  heading: {
    ...type.sectionTitle,
    color: colors.textPrimary,
  },
  error: {
    ...type.helper,
    color: colors.danger,
  },
});

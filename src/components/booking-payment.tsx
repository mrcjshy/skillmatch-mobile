import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BookingPayment as BookingPaymentState,
  canSelectCod,
  confirmCashReceived,
  confirmErrorCopy,
  COPY,
  formatPaymentMethod,
  isAwaitingCash,
  isPaid,
  selectCod,
  selectErrorCopy,
} from '@/lib/payments';

/**
 * The COD payment section of one completed Booking card (BL-01D-UI).
 *
 * Shared by the Client and Worker screens because the two roles read the SAME
 * payment tuple and must never disagree about what it means; only the control
 * they are offered differs. Keeping one component is what stops the two
 * surfaces drifting into different ideas of when cash may be confirmed.
 *
 * THE TWO ROLES HAVE STRICTLY DIFFERENT POWERS
 * --------------------------------------------
 * The Client can choose COD and can never mark anything paid. The Worker can
 * confirm cash received and can never choose the method. That is not enforced
 * by this component -- the two RPCs have different account gates and refuse the
 * other role outright -- but the UI must not imply otherwise, so neither branch
 * renders the other's control at any state.
 *
 * NOTHING IS OPTIMISTIC
 * ---------------------
 * Neither action updates local state on success. Each calls `onChanged()`, and
 * the screen re-reads the authoritative Booking list and payment tuples. The
 * control is only considered finished once that refresh resolves, so a button
 * can never disappear on the strength of a request the server did not honour.
 *
 * Rendered only where the screen has already established
 * `booking_status = 'completed'`; both RPCs re-check that server-side.
 */

export type PaymentRole = 'client' | 'worker';

export default function BookingPayment({
  role,
  bookingId,
  payment,
  onChanged,
}: {
  role: PaymentRole;
  bookingId: string;
  payment: BookingPaymentState | undefined;
  onChanged: () => Promise<void>;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const methodLabel = formatPaymentMethod(payment?.payment_method ?? null);

  /**
   * `isBusy` is the in-flight guard, so a double tap cannot fire twice. Even if
   * one did, the server is safe either way: a repeated COD selection is a
   * no-op, and a repeated confirmation raises SM403 before writing or
   * notifying.
   */
  async function run(action: () => Promise<void>, copyFor: (e: unknown) => string) {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      await action();
      try {
        await onChanged();
      } catch {
        // The transition IS committed; only the follow-up read failed. This
        // must never read as a failed payment action.
        setError(COPY.refreshFailed);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message) {
        console.warn('[BL-01D-UI] payment action failed:', e.message);
      }
      setError(copyFor(e));
    } finally {
      setIsBusy(false);
    }
  }

  /* ---------------- Client ---------------- */
  if (role === 'client') {
    return (
      <View style={styles.section}>
        <Text style={styles.heading}>{COPY.heading}</Text>

        {canSelectCod(payment) ? (
          <>
            <Text style={styles.line}>{COPY.notSelected}</Text>
            <Pressable
              style={[styles.button, isBusy ? styles.buttonDisabled : null]}
              onPress={() => run(() => selectCod(bookingId), selectErrorCopy)}
              disabled={isBusy}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{isBusy ? COPY.selecting : COPY.selectCod}</Text>
            </Pressable>
          </>
        ) : (
          <>
            {methodLabel ? (
              <Text style={styles.line}>{COPY.methodLine(methodLabel)}</Text>
            ) : (
              <Text style={styles.line}>{COPY.notSelected}</Text>
            )}
            {/* Never a "mark paid" control for the Client at any state. */}
            {isPaid(payment) ? (
              <Text style={styles.paid}>{COPY.paid}</Text>
            ) : isAwaitingCash(payment) ? (
              <Text style={styles.line}>{COPY.awaitingClient}</Text>
            ) : null}
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  /* ---------------- Worker ---------------- */
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{COPY.heading}</Text>

      {methodLabel ? (
        <Text style={styles.line}>{COPY.methodLine(methodLabel)}</Text>
      ) : (
        // Stated rather than left blank, so the absence of a confirm control is
        // explained: the Client has not chosen a method yet.
        <Text style={styles.line}>{COPY.notSelected}</Text>
      )}

      {isPaid(payment) ? (
        <Text style={styles.paid}>{COPY.paidWorker}</Text>
      ) : isAwaitingCash(payment) ? (
        <>
          <Text style={styles.line}>{COPY.awaitingWorker}</Text>
          {/* Offered only for a completed COD Booking still awaiting cash, and
              never for gcash/maya — the server refuses those too. */}
          <Pressable
            style={[styles.button, isBusy ? styles.buttonDisabled : null]}
            onPress={() => run(() => confirmCashReceived(bookingId), confirmErrorCopy)}
            disabled={isBusy}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {isBusy ? COPY.confirming : COPY.confirmCash}
            </Text>
          </Pressable>
        </>
      ) : null}

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
  line: {
    fontSize: 14,
    opacity: 0.8,
  },
  paid: {
    fontSize: 14,
    fontWeight: '600',
    color: '#15803d',
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    marginTop: 4,
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
});

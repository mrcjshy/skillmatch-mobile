import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BookingPayment as BookingPaymentState,
  canSelectCod,
  confirmCashReceived,
  confirmErrorCopy,
  COPY,
  formatPaymentMethod,
  initiateQrph,
  isAwaitingCash,
  isAwaitingQrph,
  isPaidCod,
  isPaidQrph,
  QrphInitiation,
  qrphErrorCopy,
  reconcileQrph,
  selectCod,
  selectErrorCopy,
} from '@/lib/payments';

/**
 * The payment section of one completed Booking card (BL-01D-UI, extended by
 * PM-01D with QR Ph).
 *
 * Shared by the Client and Worker screens because the two roles read the SAME
 * payment tuple and must never disagree about what it means; only the control
 * they are offered differs. Keeping one component is what stops the two
 * surfaces drifting into different ideas of when a payment may be confirmed.
 *
 * THE TWO ROLES HAVE STRICTLY DIFFERENT POWERS
 * --------------------------------------------
 * The Client can choose a method, ask for a QR code and refresh payment
 * state; it can never mark anything paid. The Worker can confirm cash
 * received and can never choose the method, generate a QR, open the provider
 * simulator or refresh provider state. That is not enforced by this component
 * -- the RPCs and Edge Functions have different account gates and refuse the
 * other role outright -- but the UI must not imply otherwise, so neither
 * branch renders the other's control at any state.
 *
 * METHOD-SPECIFIC WORDING IS LOAD-BEARING
 * ---------------------------------------
 * Cash wording and QR Ph wording never cross. A QR Ph Booking must never read
 * "cash received" or offer "Confirm Cash Received", and a COD Booking must
 * never offer a QR. Every branch below is keyed on the METHOD as well as the
 * status for exactly that reason.
 *
 * NOTHING IS OPTIMISTIC
 * ---------------------
 * No action updates the payment tuple locally on success. Each calls
 * `onChanged()`, and the screen re-reads the authoritative Booking list and
 * payment tuples. `payment_status` is never set to `paid` here -- not even
 * after reconciliation reports it -- because the authoritative row is what
 * the card must render.
 *
 * Rendered only where the screen has already established
 * `booking_status = 'completed'`; every server call re-checks that too.
 */

/** Carries no URL and no provider text; only its existence matters. */
class PaymentOpenError extends Error {
  constructor() {
    super('Could not open the payment page.');
    this.name = 'PaymentOpenError';
  }
}

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
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Transient QR payload. Component memory only, for as long as this card is
   * mounted: never persisted, never logged, never rendered as text. Lost on
   * unmount by design -- the Client simply asks for a fresh code, which the
   * server serves from the same Payment Intent.
   */
  const [qr, setQr] = useState<QrphInitiation | null>(null);

  const methodLabel = formatPaymentMethod(payment?.payment_method ?? null);

  /**
   * `isBusy` is the single in-flight guard for the whole card, so a double tap
   * cannot fire twice and two payment actions cannot race. Even if one did,
   * the server is safe: a repeated COD selection is a no-op, a repeated
   * confirmation raises SM403 before writing, a repeated initiation resumes
   * the same Payment Intent, and reconciliation of a settled Booking returns
   * `settled: false` without touching anything.
   *
   * `log` is false for every QR Ph path: those errors can carry provider or
   * server text, which must not reach the console either.
   */
  async function run(
    action: () => Promise<void>,
    copyFor: (e: unknown) => string,
    opts: { refresh: boolean; log: boolean }
  ) {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (opts.refresh) {
        try {
          await onChanged();
        } catch {
          // The transition IS committed; only the follow-up read failed. This
          // must never read as a failed payment action.
          setError(COPY.refreshFailed);
        }
      }
    } catch (e: unknown) {
      if (opts.log && e instanceof Error && e.message) {
        console.warn('[BL-01D-UI] payment action failed:', e.message);
      }
      setError(copyFor(e));
    } finally {
      setIsBusy(false);
    }
  }

  /** Client picks QR Ph for the first time: the method genuinely changes. */
  function startQrph() {
    return run(
      async () => {
        setQr(await initiateQrph(bookingId));
      },
      qrphErrorCopy,
      { refresh: true, log: false }
    );
  }

  /**
   * RESUME. The authoritative tuple is already (qrph, pending) and does not
   * change, so no list refresh is needed -- and skipping it keeps the fresh
   * QR from being torn down by a re-render.
   */
  function refreshQr() {
    return run(
      async () => {
        setQr(await initiateQrph(bookingId));
      },
      qrphErrorCopy,
      { refresh: false, log: false }
    );
  }

  /**
   * One tap, exactly one reconciliation. No timer, no polling, no Realtime.
   * A `paid` answer is not written locally: it triggers the authoritative
   * re-read, which is what actually moves the card.
   */
  function refreshStatus() {
    return run(
      async () => {
        const r = await reconcileQrph(bookingId);
        if (r.payment_status === 'paid') {
          setQr(null);
          await onChanged();
        } else {
          setNotice(COPY.stillPending);
        }
      },
      qrphErrorCopy,
      { refresh: false, log: false }
    );
  }

  /** Guarded, and the URL never appears in copy, a log or an error. */
  function openTestPage(url: string) {
    return run(
      async () => {
        const supported = await Linking.canOpenURL(url);
        if (!supported) throw new PaymentOpenError();
        await Linking.openURL(url);
      },
      () => COPY.generic,
      { refresh: false, log: false }
    );
  }

  /* ---------------- Client ---------------- */
  if (role === 'client') {
    return (
      <View style={styles.section}>
        <Text style={styles.heading}>{COPY.heading}</Text>

        {canSelectCod(payment) ? (
          <>
            <Text style={styles.line}>{COPY.chooseMethod}</Text>
            <Pressable
              style={[styles.button, isBusy ? styles.buttonDisabled : null]}
              onPress={() => run(() => selectCod(bookingId), selectErrorCopy, {
                refresh: true,
                log: true,
              })}
              disabled={isBusy}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{isBusy ? COPY.selecting : COPY.selectCod}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, isBusy ? styles.buttonDisabled : null]}
              onPress={startQrph}
              disabled={isBusy}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{isBusy ? COPY.starting : COPY.selectQrph}</Text>
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
            {isPaidCod(payment) ? (
              <Text style={styles.paid}>{COPY.paid}</Text>
            ) : isPaidQrph(payment) ? (
              <Text style={styles.paid}>{COPY.paidQrph}</Text>
            ) : isAwaitingCash(payment) ? (
              <Text style={styles.line}>{COPY.awaitingClient}</Text>
            ) : isAwaitingQrph(payment) ? (
              <>
                <Text style={styles.line}>{COPY.awaitingQrphClient}</Text>

                {qr !== null && qr.qr_image !== null ? (
                  <>
                    <Image
                      style={styles.qr}
                      source={{ uri: qr.qr_image }}
                      resizeMode="contain"
                      accessibilityLabel="QR Ph payment code"
                    />
                    <Text style={styles.testTitle}>{COPY.testModeTitle}</Text>
                    <Text style={styles.testBody}>{COPY.testModeBody}</Text>
                    {qr.test_url !== null ? (
                      <Pressable
                        style={[styles.button, isBusy ? styles.buttonDisabled : null]}
                        // The URL is passed straight to the handler and is
                        // never rendered, logged or stored.
                        onPress={() => openTestPage(qr.test_url as string)}
                        disabled={isBusy}
                        accessibilityRole="button"
                      >
                        <Text style={styles.buttonText}>{COPY.openTestPage}</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}

                <Pressable
                  style={[styles.button, isBusy ? styles.buttonDisabled : null]}
                  onPress={refreshQr}
                  disabled={isBusy}
                  accessibilityRole="button"
                >
                  <Text style={styles.buttonText}>
                    {isBusy ? COPY.refreshingQr : COPY.showQr}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.button, isBusy ? styles.buttonDisabled : null]}
                  onPress={refreshStatus}
                  disabled={isBusy}
                  accessibilityRole="button"
                >
                  <Text style={styles.buttonText}>
                    {isBusy ? COPY.checking : COPY.refreshStatus}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </>
        )}

        {notice ? <Text style={styles.line}>{notice}</Text> : null}
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

      {isPaidCod(payment) ? (
        <Text style={styles.paid}>{COPY.paidWorker}</Text>
      ) : isPaidQrph(payment) ? (
        <Text style={styles.paid}>{COPY.paidQrph}</Text>
      ) : isAwaitingQrph(payment) ? (
        // Information only. The Worker gets no QR, no simulator, no status
        // refresh and no confirmation: nothing here can unlock a QR Ph
        // payment, which only the provider webhook settles.
        <Text style={styles.line}>{COPY.awaitingQrphWorker}</Text>
      ) : isAwaitingCash(payment) ? (
        <>
          <Text style={styles.line}>{COPY.awaitingWorker}</Text>
          {/* Offered only for a completed COD Booking still awaiting cash, and
              never for qrph/gcash/maya — the server refuses those too. */}
          <Pressable
            style={[styles.button, isBusy ? styles.buttonDisabled : null]}
            onPress={() => run(() => confirmCashReceived(bookingId), confirmErrorCopy, {
              refresh: true,
              log: true,
            })}
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
  qr: {
    marginTop: 8,
    width: 220,
    height: 220,
    alignSelf: 'flex-start',
  },
  testTitle: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#b45309',
  },
  testBody: {
    fontSize: 13,
    color: '#b45309',
  },
});

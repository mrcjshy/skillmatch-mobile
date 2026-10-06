import { type ReactNode, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppNotice } from '@/components/app-notice';
import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
import { useUiTheme, type UiTheme } from '@/components/refinement-theme';
import {
  CANCELLATION_DETAIL_MAX,
  CANCELLATION_REASON_OPTIONS,
  cancelBooking,
  cancelErrorCopy,
  completeClientBooking,
  completeErrorCopy,
  COPY,
  remainingCancellationDetailCharacters,
  validateCancellationInput,
} from '@/lib/booking-lifecycle';
import type { CancellationReasonCode } from '@/lib/bookings';



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
  showCompletion,
  showCancellation,
  onChanged,
  children,
}: {
  role: LifecycleRole;
  bookingId: string;
  showCompletion: boolean;
  showCancellation: boolean;
  onChanged: () => Promise<void>;
  children?: ReactNode;
}) {
  const ui = useUiTheme();
  const { styles } = createStyles(ui);

  /**
   * One busy slot per Booking card, holding WHICH action is in flight. Both
   * controls on this card are disabled while either runs, since completing and
   * cancelling the same Booking concurrently is never coherent. Other cards are
   * untouched: each renders its own instance with its own state.
   */
  const [busyAction, setBusyAction] = useState<LifecycleAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<CancellationReasonCode | null>(null);
  const [reasonDetail, setReasonDetail] = useState('');
  const actionInFlight = useRef(false);

  const isBusy = busyAction !== null;
  const cancellationInput = validateCancellationInput(reasonCode, reasonDetail);
  const remainingDetailCharacters = remainingCancellationDetailCharacters(reasonDetail);

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
    if (actionInFlight.current) return;
    actionInFlight.current = true;
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
      actionInFlight.current = false;
      setBusyAction(null);
    }
  }

  /**
   * Final completion is one-way and appears only after the authoritative
   * payment read says paid, so it receives an explicit confirmation.
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
  function openCancelModal() {
    if (isBusy) return;
    setError(null);
    setCancelModalOpen(true);
  }

  function closeCancelModal() {
    if (isBusy) return;
    setCancelModalOpen(false);
    setReasonCode(null);
    setReasonDetail('');
  }

  function reviewCancellation() {
    if (isBusy || !cancellationInput.ok) return;
    const selectedReason = cancellationInput.reasonCode;
    Alert.alert(
      COPY.cancelConfirmTitle,
      `${COPY.cancelConfirmBody}\n\nReason: ${
        CANCELLATION_REASON_OPTIONS.find((option) => option.value === selectedReason)?.label ??
        selectedReason
      }`,
      [
        { text: COPY.dismiss, style: 'cancel' },
        {
          text: COPY.cancelConfirmAction,
          style: 'destructive',
          onPress: () => {
            setCancelModalOpen(false);
            void run(
              'cancel',
              () => cancelBooking(bookingId, selectedReason, reasonDetail),
              cancelErrorCopy
            );
          },
        },
      ]
    );
  }

  if (!showCompletion && !showCancellation) return null;

  return (
    <View style={styles.section}>
      {role === 'client' && showCompletion ? <Text style={styles.heading}>{COPY.heading}</Text> : null}

      {/*
        Client only. The Worker branch below never renders this control.

        Completion is the Client's one mutation on a confirmed Booking, so it
        is the filled primary here. The Worker sees no primary at all rather
        than a manufactured one -- there is no Worker action in this state.
      */}
      {role === 'client' && showCompletion ? (
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
      {children}

      {showCancellation ? (
        <View style={styles.cancellation}>
          {role === 'client' ? <Text style={styles.modalBody}>Either party may cancel.</Text> : null}
          <AppButton variant="destructive" label={busyAction === 'cancel' ? COPY.cancelling : COPY.cancel}
            onPress={openCancelModal} loading={busyAction === 'cancel'} disabled={isBusy} />
        </View>
      ) : null}

      {error ? <AppNotice variant="danger" message={error} /> : null}

      <Modal visible={cancelModalOpen} transparent animationType="fade" onRequestClose={closeCancelModal}>
        <View style={styles.overlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close cancellation reason"
            style={StyleSheet.absoluteFill}
            onPress={closeCancelModal}
            disabled={isBusy}
          />
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalCard} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{COPY.cancelReasonTitle}</Text>
            <Text style={styles.modalBody}>{COPY.cancelReasonBody}</Text>
            <View style={styles.reasonOptions} accessibilityRole="radiogroup">
              {CANCELLATION_REASON_OPTIONS.map((option) => {
                const selected = reasonCode === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={({ pressed }) => [styles.reasonOption, pressed && styles.reasonOptionPressed]}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected, disabled: isBusy }}
                    disabled={isBusy}
                    onPress={() => setReasonCode(option.value)}
                  >
                    <AppChip label={option.label} variant={selected ? 'selected' : 'neutral'} />
                  </Pressable>
                );
              })}
            </View>
            <AppField
              label={COPY.cancelDetailLabel}
              accessibilityLabel={COPY.cancelDetailLabel}
              value={reasonDetail}
              onChangeText={setReasonDetail}
              placeholder={
                reasonCode === 'other'
                  ? COPY.cancelDetailOtherPlaceholder
                  : COPY.cancelDetailPlaceholder
              }
              multiline
              editable={!isBusy}
              errorText={
                cancellationInput.ok || cancellationInput.reason === 'reason_required'
                  ? undefined
                  : cancellationInput.reason === 'detail_required'
                    ? COPY.cancelDetailRequired
                    : COPY.cancelDetailTooLong
              }
            />
            <Text style={remainingDetailCharacters < 0 ? styles.counterOver : styles.counter}>
              {remainingDetailCharacters} / {CANCELLATION_DETAIL_MAX}
            </Text>
            {reasonCode === null ? <Text style={styles.helper}>{COPY.cancelReasonRequired}</Text> : null}
            <AppButton
              label={COPY.cancelReview}
              onPress={reviewCancellation}
              disabled={!cancellationInput.ok || isBusy}
            />
            <AppButton label={COPY.dismiss} variant="ghost" onPress={closeCancelModal} disabled={isBusy} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(ui: UiTheme) {
  const { colors, type, spacing, radius, size } = ui;
const styles = StyleSheet.create({
  section: {
    gap: spacing.xl,
  },
  cancellation: { gap: spacing.md },
  heading: {
    ...type.sectionTitle,
    color: colors.textPrimary,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.gutter,
    backgroundColor: colors.scrim,
  },
  modalScroll: { maxHeight: '90%', width: '100%', flexGrow: 0 },
  reasonOption: {
    minHeight: size.compactButton,
    minWidth: size.compactButton,
    maxWidth: '100%',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  reasonOptionPressed: { backgroundColor: colors.surfaceSunken },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: { ...type.sectionTitle, color: colors.textPrimary },
  modalBody: { ...type.body, color: colors.textSecondary },
  reasonOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  counter: { ...type.caption, color: colors.textSecondary },
  counterOver: { ...type.caption, color: colors.error, fontWeight: '600' },
  helper: { ...type.helper, color: colors.error },
});

  return { styles };
}

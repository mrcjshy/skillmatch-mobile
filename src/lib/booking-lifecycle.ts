/**
 * BL-01A-UI Booking lifecycle contract.
 *
 * The two lifecycle transitions a participant may perform on a CONFIRMED
 * Booking, and nothing else:
 *
 *   complete_my_client_booking(booking_id)  confirmed -> completed  (Client only)
 *   cancel_my_booking(booking_id, reason, detail)
 *                                             confirmed -> cancelled (either party)
 *
 * Both are SECURITY DEFINER, both are granted to `authenticated` alone, and
 * neither accepts a status, actor, timestamp or payment parameter. Cancellation
 * supplies only the descriptive reason fields required by the published RPC.
 *
 * WHY COMPLETION AND CANCELLATION ARE NOT ONE CALL
 * ------------------------------------------------
 * They have different actor gates. Completion requires an active Client who
 * OWNS the Booking; the assigned Worker cannot complete their own job.
 * Cancellation is participant-wide, because either side may need to call the
 * booking off. Collapsing them into one helper would blur that split at exactly
 * the place it matters.
 *
 * WHAT COMPLETION IS NOT
 * ----------------------
 * Completion is the Client's final acknowledgement after payment has settled.
 * The payment tuple is preserved untouched by completion.
 *
 * WHAT THIS MODULE DOES NOT DO
 * ----------------------------
 * No no-show, no strike, no rematching, no reopening of a cancelled Job, no
 * Worker-side completion, no direct `bookings` or `job_postings` update, no
 * QR Ph, no refund or reversal. Those either belong to a different piece or are
 * deliberately deferred.
 */

import {
  CANCELLATION_DETAIL_MAX,
  CANCELLATION_REASON_LABELS,
  cancellationDetailLength,
  type CancellationReasonCode,
} from './bookings';
import { supabase } from './supabase';

export { CANCELLATION_DETAIL_MAX } from './bookings';

/**
 * Lifecycle actions exist for exactly one status.
 *
 * `pending` is excluded deliberately: both RPCs require `confirmed` and would
 * refuse it, so offering a control there would promise an action the server
 * will not perform. `completed`, `cancelled` and `no_show` are terminal — there
 * is no un-complete and no un-cancel path anywhere in this system.
 *
 * This is a rendering gate only. Both RPCs re-check the status under a row lock
 * and are what actually decide.
 */
export function isLifecycleActionableStatus(status: string): boolean {
  return status === 'confirmed';
}

export const CANCELLATION_REASON_OPTIONS = (
  Object.entries(CANCELLATION_REASON_LABELS) as [CancellationReasonCode, string][]
).map(([value, label]) => ({ value, label }));

export type CancellationInputValidation =
  | { ok: true; reasonCode: CancellationReasonCode; detail: string | null }
  | { ok: false; reason: 'reason_required' | 'detail_required' | 'detail_too_long' };

export function validateCancellationInput(
  reasonCode: CancellationReasonCode | null,
  rawDetail: string
): CancellationInputValidation {
  if (reasonCode === null) return { ok: false, reason: 'reason_required' };
  const detail = rawDetail.trim();
  if (cancellationDetailLength(detail) > CANCELLATION_DETAIL_MAX) {
    return { ok: false, reason: 'detail_too_long' };
  }
  if (reasonCode === 'other' && detail === '') {
    return { ok: false, reason: 'detail_required' };
  }
  return { ok: true, reasonCode, detail: detail === '' ? null : detail };
}

export function remainingCancellationDetailCharacters(rawDetail: string): number {
  return CANCELLATION_DETAIL_MAX - cancellationDetailLength(rawDetail);
}

/* ------------------------------------------------------------------ *
 * Error classification
 * ------------------------------------------------------------------ */

/**
 * Carries the SQLSTATE so screens branch on `error.code` and never on
 * `error.message` -- the lesson N10, N11, N12, BL-01B, BL-01C and BL-01D all
 * recorded independently, where one code arrives with several different message
 * texts (a function-body RAISE and a missing-EXECUTE denial both surface as
 * 42501 with unrelated wording).
 */
export class LifecycleError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'LifecycleError';
    this.code = code;
  }
}

/** Wrong role or account for the action entirely, or no EXECUTE grant. */
const FORBIDDEN = '42501';
/**
 * Collapsed conflict. Both RPCs fold "no such Booking", "not yours", "not
 * confirmed" and "the Job is no longer matched" into this one code so a caller
 * cannot probe another participant's Booking. The UI must therefore never claim
 * which of those applied.
 */
const CONFLICT = 'SM409';
/**
 * Cancellation only. Raised AFTER participation has already been proven, so it
 * leaks nothing the caller does not already know: their own Booking is no
 * longer `payment_status = 'pending'` and cancelling would strand a settled
 * payment. Distinct from SM409 precisely because it is safe to be specific.
 */
const PAYMENT_BLOCKED = 'SM403';

export const COPY = {
  heading: 'Booking Actions',

  complete: 'Mark as Completed',
  completing: 'Completing…',
  cancel: 'Cancel Booking',
  cancelling: 'Cancelling…',

  /** Says what completion does and, just as importantly, what it does not do. */
  completeConfirmTitle: 'Mark as Completed',
  completeConfirmBody:
    'Payment is settled. Mark this booking and job as finally completed?',
  completeConfirmAction: 'Mark as Completed',

  /**
   * Cancellation is terminal and the Job does NOT return to the matching pool.
   * Saying so plainly is the point: automatic rematching does not exist, and
   * copy that implied it would describe a system this project does not have.
   */
  cancelConfirmTitle: 'Cancel Booking',
  cancelConfirmBody:
    'Cancelling ends this booking and the job will not automatically reopen.',
  cancelConfirmAction: 'Cancel Booking',
  cancelReasonTitle: 'Why are you cancelling?',
  cancelReasonBody: 'Choose the reason that best describes this cancellation.',
  cancelDetailLabel: 'Cancellation details',
  cancelDetailPlaceholder: 'Add helpful context (optional)',
  cancelDetailOtherPlaceholder: 'Tell us why you need to cancel',
  cancelReview: 'Review cancellation',
  cancelReasonRequired: 'Choose a cancellation reason.',
  cancelDetailRequired: 'Add a reason when you choose Other.',
  cancelDetailTooLong: 'Cancellation details must be 300 characters or fewer.',

  dismiss: 'Not now',

  completeForbidden: 'You are not allowed to complete this booking.',
  completeConflict: 'This booking is no longer available for completion.',
  completePaymentRequired: 'Payment must be settled before final completion.',
  completeGeneric: 'The booking could not be completed. Please try again.',

  cancelForbidden: 'You are not allowed to cancel this booking.',
  cancelBlocked: 'This booking cannot be cancelled in its current payment state.',
  cancelConflict: 'This booking is no longer available for cancellation.',
  cancelGeneric: 'The booking could not be cancelled. Please try again.',

  /** The transition IS committed; only the follow-up read failed. */
  refreshFailed: 'That worked, but the list could not be refreshed. Pull down to refresh.',
} as const;

/**
 * Two mappers rather than one, because the two actions do not share a failure
 * vocabulary: SM403 is reachable only from cancellation, and the safe wording
 * for a refused completion differs from a refused cancellation. This mirrors
 * `selectErrorCopy` / `confirmErrorCopy` in the payments module.
 *
 * A raw backend message never reaches the screen in either case -- only the
 * code decides the copy, so no SQLSTATE name, constraint name or database text
 * is ever displayed.
 */
export function completeErrorCopy(e: unknown): string {
  const code = e instanceof LifecycleError ? e.code : null;
  if (code === FORBIDDEN) return COPY.completeForbidden;
  if (code === CONFLICT) return COPY.completeConflict;
  if (code === PAYMENT_BLOCKED) return COPY.completePaymentRequired;
  return COPY.completeGeneric;
}

export function cancelErrorCopy(e: unknown): string {
  const code = e instanceof LifecycleError ? e.code : null;
  if (code === FORBIDDEN) return COPY.cancelForbidden;
  if (code === PAYMENT_BLOCKED) return COPY.cancelBlocked;
  if (code === CONFLICT) return COPY.cancelConflict;
  return COPY.cancelGeneric;
}

/* ------------------------------------------------------------------ *
 * Server calls
 *
 * The Booking id is the ONLY business input. No client_id, worker_id, job_id,
 * status, completed_at, payment field or role is passed -- the RPCs derive the
 * caller from auth.uid() and derive every written value themselves, so there is
 * nothing here a tampered client could substitute.
 * ------------------------------------------------------------------ */

/**
 * Client marks their own confirmed Booking completed. The server moves the
 * Booking to `completed` and the Job to `completed` in one transaction under a
 * fixed lock order, and sets `completed_at` itself.
 *
 * The returned projection is intentionally ignored: the screen re-reads the
 * authoritative list instead, so a rendered card can never be built from an
 * echo of the write.
 */
export async function completeClientBooking(bookingId: string): Promise<void> {
  const res = await supabase.rpc('complete_my_client_booking', {
    p_booking_id: bookingId,
  });
  if (res.error) {
    throw new LifecycleError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
}

/**
 * Either participant cancels a confirmed, unpaid Booking. The server moves the
 * Booking to `cancelled` and the Job to `cancelled`; the Job is NOT reopened
 * and no rematching is triggered.
 */
export async function cancelBooking(
  bookingId: string,
  reasonCode: CancellationReasonCode,
  rawDetail: string
): Promise<void> {
  const validated = validateCancellationInput(reasonCode, rawDetail);
  if (!validated.ok) throw new LifecycleError('Invalid cancellation reason.', null);
  const res = await supabase.rpc('cancel_my_booking', {
    p_booking_id: bookingId,
    p_reason_code: validated.reasonCode,
    p_reason_detail: validated.detail,
  });
  if (res.error) {
    throw new LifecycleError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
}

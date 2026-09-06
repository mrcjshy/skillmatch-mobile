/**
 * BL-01D-UI COD payment contract.
 *
 * Payment happens AFTER completion (docs/DECISIONS.md, "Payment sequencing").
 * The Client chooses Cash on Delivery; the assigned Worker alone confirms that
 * cash actually changed hands. Those are two different actors and two different
 * server functions, and this module keeps that split intact on the client side.
 *
 * TWO RPCs, NO PAYMENT VALUES
 * --------------------------
 * `select_my_booking_cod(booking_id)` and
 * `confirm_my_cod_payment_received(booking_id)` each take a Booking id and
 * nothing else. There is no method, status, amount or reference parameter, so
 * this module cannot ask the server to mark something paid or to name a
 * provider -- those transitions are the server's to derive.
 *
 * WHY THE STATE IS READ DIRECTLY RATHER THAN FROM N11
 * ---------------------------------------------------
 * The N11 Booking-list RPCs project `payment_status` but NOT `payment_method`,
 * so they cannot distinguish "no method chosen yet" from "COD awaiting cash".
 * Adding a column to their RETURNS TABLE would require dropping and recreating
 * both functions -- PostgreSQL cannot CREATE OR REPLACE a changed return type --
 * and would disturb a contract three screens depend on.
 *
 * Instead the payment tuple is read straight from `public.bookings`, which after
 * BL-01D grants `authenticated` SELECT and nothing else, scoped by the existing
 * participant SELECT policy. That is the same shape BL-01B used for reading the
 * caller's own rating rows. RLS does the scoping; the id filter is only a
 * narrowing convenience.
 *
 * WHAT THIS MODULE DOES NOT DO
 * ----------------------------
 * No GCash, no Maya, no PayMongo, no provider reference, no refund, no payment
 * edit or reversal, no generic method picker, no payment history, no Realtime
 * and no polling. A Worker can never choose a method here and a Client can never
 * mark anything paid, because neither call exists.
 */

import { supabase } from '@/lib/supabase';

/** The three values `bookings_payment_method_check` permits. Only `cod` is
 *  reachable pre-defense; the other two exist so the UI can recognise a future
 *  online Booking and stay out of its way. */
export type PaymentMethod = 'cod' | 'gcash' | 'maya';

/** The three values `bookings_payment_status_check` permits. `refunded` is a
 *  schema value no code path currently produces. */
export type PaymentStatus = 'pending' | 'paid' | 'refunded';

/** Exactly what the payment controls need. Nothing identifying is read:
 *  client_id, worker_id, paymongo_ref and every contact field are deliberately
 *  left out of the projection. */
export type BookingPayment = {
  id: string;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus | null;
};

/**
 * Payment only exists after the service is finished. This gates every control;
 * both RPCs re-check `status = 'completed'` server-side and are what actually
 * decide.
 */
export function isPayableStatus(bookingStatus: string): boolean {
  return bookingStatus === 'completed';
}

/** The Client may still choose COD: no method picked, nothing settled. */
export function canSelectCod(p: BookingPayment | undefined): boolean {
  return p !== undefined && p.payment_method === null && p.payment_status === 'pending';
}

/** COD chosen, cash not yet confirmed — the Worker's window to confirm. */
export function isAwaitingCash(p: BookingPayment | undefined): boolean {
  return p !== undefined && p.payment_method === 'cod' && p.payment_status === 'pending';
}

/** Settled. Terminal pre-defense: there is no reversal or refund path. */
export function isPaid(p: BookingPayment | undefined): boolean {
  return p !== undefined && p.payment_status === 'paid';
}

/**
 * Human label for a chosen method. An online method is labelled rather than
 * hidden so a future PayMongo Booking reads correctly here instead of looking
 * like an error, but this piece offers no control for one.
 */
const METHOD_LABEL: Record<PaymentMethod, string> = {
  cod: 'Cash on Delivery',
  gcash: 'GCash',
  maya: 'Maya',
};

export function formatPaymentMethod(method: PaymentMethod | null): string | null {
  return method === null ? null : METHOD_LABEL[method];
}

/* ------------------------------------------------------------------ *
 * Error classification
 * ------------------------------------------------------------------ */

/**
 * Carries the SQLSTATE so screens branch on `error.code` and never on
 * `error.message` -- the lesson N11, N12, BL-01C and BL-01B all recorded, where
 * one code arrives with several different message texts.
 */
export class PaymentError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
  }
}

/** Wrong account or role for the surface entirely. */
const FORBIDDEN = '42501';
/**
 * Collapsed conflict. Both RPCs fold "no such Booking", "not yours", "not
 * completed", and (for confirmation) "not COD" into this one code so a caller
 * cannot probe another participant's Booking or payment state. The UI therefore
 * must not claim which of those happened.
 */
const CONFLICT = 'SM409';
/**
 * Proven participant, blocked by a specific rule the caller already knows about:
 * the Worker's own completed COD Booking is already paid. Distinct from SM409
 * precisely because it leaks nothing.
 */
const ALREADY = 'SM403';

export const COPY = {
  heading: 'Payment',
  selectCod: 'Select COD',
  selecting: 'Selecting…',
  confirmCash: 'Confirm Cash Received',
  confirming: 'Confirming…',
  awaitingClient: 'Status: Awaiting cash confirmation',
  awaitingWorker: 'Awaiting your cash confirmation',
  paid: 'Status: Paid — cash received',
  paidWorker: 'Cash received — paid',
  methodLine: (label: string) => `Payment method: ${label}`,
  notSelected: 'No payment method selected yet.',
  /** Covers every collapsed SM409 cause without asserting which applies. */
  selectConflict: 'This booking cannot use COD right now.',
  confirmConflict: 'This cash payment cannot be confirmed.',
  /** SM403 — safe to be specific: the caller is the proven assigned Worker. */
  alreadyConfirmed: 'Payment has already been confirmed.',
  forbidden: "You don't have permission to do that.",
  generic: 'Something went wrong. Please try again.',
  /** The transition IS committed; only the follow-up read failed. */
  refreshFailed: 'That worked, but the list could not be refreshed. Pull down to refresh.',
} as const;

/** Raw backend text never reaches the screen; only the code decides the copy. */
export function selectErrorCopy(e: unknown): string {
  const code = e instanceof PaymentError ? e.code : null;
  if (code === CONFLICT) return COPY.selectConflict;
  if (code === FORBIDDEN) return COPY.forbidden;
  return COPY.generic;
}

export function confirmErrorCopy(e: unknown): string {
  const code = e instanceof PaymentError ? e.code : null;
  if (code === ALREADY) return COPY.alreadyConfirmed;
  if (code === CONFLICT) return COPY.confirmConflict;
  if (code === FORBIDDEN) return COPY.forbidden;
  return COPY.generic;
}

/* ------------------------------------------------------------------ *
 * Row coercion — never trust a row's shape.
 * ------------------------------------------------------------------ */

const METHODS: readonly string[] = ['cod', 'gcash', 'maya'];
const STATUSES: readonly string[] = ['pending', 'paid', 'refunded'];

function toMethod(v: unknown): PaymentMethod | null {
  return typeof v === 'string' && METHODS.includes(v) ? (v as PaymentMethod) : null;
}

function toStatus(v: unknown): PaymentStatus | null {
  return typeof v === 'string' && STATUSES.includes(v) ? (v as PaymentStatus) : null;
}

/**
 * An unrecognised value maps to null rather than being rendered verbatim, so a
 * widened CHECK constraint could never surface a raw database token in the UI.
 * A null method genuinely means "not chosen"; a null status is only reachable
 * from malformed data and is treated as not-payable by every predicate above.
 */
function toBookingPayment(row: unknown): BookingPayment | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : null;
  if (id === null) return null;
  return {
    id,
    payment_method: toMethod(r.payment_method),
    payment_status: toStatus(r.payment_status),
  };
}

/* ------------------------------------------------------------------ *
 * Server calls
 * ------------------------------------------------------------------ */

/**
 * Payment tuples for the caller's own Bookings, keyed by Booking id.
 *
 * One `.in(...)` read for the whole list rather than a query per card. Only the
 * three needed columns are selected. RLS restricts the result to Bookings the
 * caller participates in regardless of the filter.
 */
export async function fetchBookingPayments(
  bookingIds: string[]
): Promise<Map<string, BookingPayment>> {
  const byId = new Map<string, BookingPayment>();
  if (bookingIds.length === 0) return byId;

  const res = await supabase
    .from('bookings')
    .select('id, payment_method, payment_status')
    .in('id', bookingIds);

  if (res.error) {
    throw new PaymentError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
  for (const row of Array.isArray(res.data) ? res.data : []) {
    const p = toBookingPayment(row);
    if (p !== null) byId.set(p.id, p);
  }
  return byId;
}

/**
 * Client chooses COD. Server-side this is a no-op when the Booking is already
 * (cod, pending), so a double tap is harmless and is NOT an error the UI should
 * surface.
 */
export async function selectCod(bookingId: string): Promise<void> {
  const res = await supabase.rpc('select_my_booking_cod', { p_booking_id: bookingId });
  if (res.error) {
    throw new PaymentError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
}

/**
 * Assigned Worker confirms cash was received. This is the only path to
 * `paid`, and it also emits the Client's notification inside the same
 * transaction.
 */
export async function confirmCashReceived(bookingId: string): Promise<void> {
  const res = await supabase.rpc('confirm_my_cod_payment_received', {
    p_booking_id: bookingId,
  });
  if (res.error) {
    throw new PaymentError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
}

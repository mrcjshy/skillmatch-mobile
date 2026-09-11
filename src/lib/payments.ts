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

import type { JobPaymentMethod } from './job-payment';
import { supabase } from './supabase';

/** The values `bookings_payment_method_check` permits. `cod` and `qrph` are
 *  both reachable; `gcash` and `maya` exist only so the UI can recognise a
 *  future online Booking and stay out of its way -- PM-01D ships no control
 *  for either, and PM-01C settles `qrph` server-side. */
export type PaymentMethod = 'cod' | 'gcash' | 'maya' | 'qrph';

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

/**
 * R4 Client entry on a completed Booking. Job intent decides the unclaimed
 * branch; a non-NULL Booking method stays on the existing processing path.
 */
export type ClientPaymentEntry = 'legacy-choice' | 'cash' | 'qrph' | 'processing' | 'none';

export function clientPaymentEntry(
  payment: BookingPayment | undefined,
  jobMethod: JobPaymentMethod | null
): ClientPaymentEntry {
  if (payment === undefined) return 'none';
  if (payment.payment_method !== null) return 'processing';
  if (payment.payment_status !== 'pending') return 'none';
  if (jobMethod === 'cod') return 'cash';
  if (jobMethod === 'qrph') return 'qrph';
  return 'legacy-choice';
}

/** COD chosen, cash not yet confirmed — the Worker's window to confirm. */
export function isAwaitingCash(p: BookingPayment | undefined): boolean {
  return p !== undefined && p.payment_method === 'cod' && p.payment_status === 'pending';
}

/**
 * QR Ph chosen, provider has not settled yet. Deliberately separate from
 * `isAwaitingCash`: the two methods award completely different controls, and
 * one predicate covering both is exactly how cash wording would leak onto a
 * QR Ph card. Neither role may confirm this state by hand -- only the
 * provider webhook (PM-01C) moves it to paid.
 */
export function isAwaitingQrph(p: BookingPayment | undefined): boolean {
  return p !== undefined && p.payment_method === 'qrph' && p.payment_status === 'pending';
}

/** Settled, and settled by cash. Gates the cash-specific paid wording. */
export function isPaidCod(p: BookingPayment | undefined): boolean {
  return p !== undefined && p.payment_method === 'cod' && p.payment_status === 'paid';
}

/** Settled, and settled through the provider. Never says "cash received". */
export function isPaidQrph(p: BookingPayment | undefined): boolean {
  return p !== undefined && p.payment_method === 'qrph' && p.payment_status === 'paid';
}

/** Settled. Terminal pre-defense: there is no reversal or refund path. */
export function isPaid(p: BookingPayment | undefined): boolean {
  return p !== undefined && p.payment_status === 'paid';
}

/**
 * Human label for a chosen method. An online method is labelled rather than
 * hidden so a future PayMongo Booking reads correctly here instead of looking
 * like an error, but this piece offers no control for one.
 *
 * DISPLAY WORDING DIFFERS FROM THE STORED VALUE ON PURPOSE
 * --------------------------------------------------------
 * Users read "Cash Payment"; the database, the two RPCs and every predicate in
 * this module still speak `cod`. That is not drift to be tidied up: the stored
 * value is a locked contract (`bookings_payment_method_check`,
 * `select_my_booking_cod`, `confirm_my_cod_payment_received`) and renaming it
 * to match a label would be a migration, not a copy change. This table is the
 * one place the two vocabularies meet.
 */
const METHOD_LABEL: Record<PaymentMethod, string> = {
  cod: 'Cash Payment',
  gcash: 'GCash',
  maya: 'Maya',
  qrph: 'QR Ph',
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
  selectCod: 'Select Cash Payment',
  continueCash: 'Continue with Cash Payment',
  startQrphPayment: 'Start QR Ph Payment',
  waitingClientCash: 'Waiting for the client to continue with Cash Payment.',
  waitingClientQrph: 'Waiting for the client to start QR Ph payment.',
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
  selectConflict: 'This booking cannot use Cash Payment right now.',
  confirmConflict: 'This cash payment cannot be confirmed.',
  /** SM403 — safe to be specific: the caller is the proven assigned Worker. */
  alreadyConfirmed: 'Payment has already been confirmed.',
  forbidden: "You don't have permission to do that.",
  generic: 'Something went wrong. Please try again.',
  /** The transition IS committed; only the follow-up read failed. */
  refreshFailed: 'That worked, but the list could not be refreshed. Pull down to refresh.',

  /* ---------------- PM-01D — QR Ph ---------------- */
  /** Shown when a method is still open to the Client. The Worker keeps
   *  `notSelected`, which explains an absent control rather than inviting
   *  a choice the Worker is not allowed to make. */
  chooseMethod: 'Choose a payment method.',
  selectQrph: 'QR Ph',
  starting: 'Starting…',
  showQr: 'Show / Refresh QR',
  refreshingQr: 'Refreshing…',
  openTestPage: 'Open PayMongo Test Payment',
  refreshStatus: 'Refresh Payment Status',
  checking: 'Checking…',
  /** Method-specific on purpose: never the cash wording. */
  awaitingQrphClient: 'Status: Awaiting payment confirmation',
  awaitingQrphWorker: 'Awaiting QR Ph payment confirmation.',
  paidQrph: 'Status: Paid — QR Ph',
  /** Neutral, not an error: reconciliation answered, it is simply not settled. */
  stillPending: 'Payment is still pending.',
  testModeTitle: 'TEST MODE',
  testModeBody:
    'Do not scan this QR with GCash, Maya, or a banking app. Use the PayMongo test payment page for the demo.',
  /** Collapsed provider-side conflict; asserts nothing about the cause. */
  qrphConflict: 'This booking cannot use QR Ph right now.',
  providerUnavailable: 'Payment provider is temporarily unavailable.',
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

/**
 * Edge Function codes, not SQLSTATEs. `booking_unavailable` is the collapsed
 * conflict both QR Ph functions return for "no such Booking", "not yours",
 * "not completed" and "not eligible", so the copy must not claim which.
 * Anything unrecognised falls through to the generic line rather than
 * surfacing a provider or server string.
 */
export function qrphErrorCopy(e: unknown): string {
  const code = e instanceof PaymentError ? e.code : null;
  if (code === 'booking_unavailable') return COPY.qrphConflict;
  if (code === 'provider_unavailable' || code === 'server_misconfigured') {
    return COPY.providerUnavailable;
  }
  if (code === 'forbidden' || code === 'unauthenticated' || code === FORBIDDEN) {
    return COPY.forbidden;
  }
  return COPY.generic;
}

/* ------------------------------------------------------------------ *
 * Row coercion — never trust a row's shape.
 * ------------------------------------------------------------------ */

const METHODS: readonly string[] = ['cod', 'gcash', 'maya', 'qrph'];
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

/* ------------------------------------------------------------------ *
 * PM-01D — QR Ph
 *
 * Two Edge Functions, ONE input each. `initiate-qrph-payment` and
 * `reconcile-qrph-payment` both take a Booking id and nothing else, so this
 * module -- like the COD pair above -- has no way to assert an amount, a
 * currency, a provider status or a Payment Intent. The Client cannot claim
 * `paid`; only the signed provider webhook can (PM-01C).
 *
 * The Payment Intent reference is deliberately absent from both response
 * types. The app never receives it, never stores it and never displays it.
 * ------------------------------------------------------------------ */

/**
 * `qr_image` and `test_url` are TRANSIENT. They belong in component state for
 * as long as the code is on screen and nowhere else: never logged, never
 * persisted to AsyncStorage or SecureStore, never written to disk, never
 * rendered as text and never folded into an error message.
 */
export type QrphInitiation = {
  booking_id: string;
  amount_centavos: number;
  currency: 'PHP';
  payment_status: PaymentStatus;
  provider_status: string;
  qr_image: string | null;
  test_url: string | null;
};

export type QrphReconciliation = {
  booking_id: string;
  payment_status: PaymentStatus;
  settled: boolean;
};

/**
 * The Edge Functions answer a non-2xx with `{ error: { code, message } }`.
 * Only the code is kept -- the message is provider- or server-authored text
 * that must never reach the screen.
 */
async function edgeErrorCode(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown } | null)?.context as
    | { json?: () => Promise<unknown> }
    | undefined;
  if (ctx === undefined || typeof ctx.json !== 'function') return null;
  try {
    const body = (await ctx.json()) as { error?: { code?: unknown } } | null;
    const code = body?.error?.code;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

async function invokeQrph(fn: string, bookingId: string): Promise<unknown> {
  const res = await supabase.functions.invoke(fn, {
    // The ONLY business input. No amount, currency, payment_method,
    // payment_status, provider_status, client_id, paymongo_ref or Payment
    // Intent id is sent: every one of those is the server's to derive.
    body: { booking_id: bookingId },
  });
  if (res.error) {
    throw new PaymentError('The request failed.', await edgeErrorCode(res.error));
  }
  return res.data;
}

/** Accepts a number or a numeric string; anything else is malformed. */
function toCentavos(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isInteger(n) && n > 0 ? n : Number.NaN;
}

/**
 * A response that does not match the contract is rejected outright rather
 * than partially rendered, so a malformed or unexpected provider value can
 * never reach the UI.
 */
function toQrphInitiation(bookingId: string, data: unknown): QrphInitiation | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const amount = toCentavos(d.amount_centavos);
  const status = toStatus(d.payment_status);
  if (d.booking_id !== bookingId) return null;
  if (Number.isNaN(amount)) return null;
  if (d.currency !== 'PHP') return null;
  if (status === null) return null;
  if (typeof d.provider_status !== 'string') return null;
  return {
    booking_id: bookingId,
    amount_centavos: amount,
    currency: 'PHP',
    payment_status: status,
    provider_status: d.provider_status,
    qr_image: typeof d.qr_image === 'string' && d.qr_image !== '' ? d.qr_image : null,
    test_url: typeof d.test_url === 'string' && d.test_url !== '' ? d.test_url : null,
  };
}

function toQrphReconciliation(bookingId: string, data: unknown): QrphReconciliation | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const status = toStatus(d.payment_status);
  if (d.booking_id !== bookingId) return null;
  if (status === null) return null;
  if (typeof d.settled !== 'boolean') return null;
  return { booking_id: bookingId, payment_status: status, settled: d.settled };
}

/**
 * Client asks for a QR Ph code. Also the RESUME path: called again for a
 * Booking already bound to a Payment Intent, the server returns a fresh code
 * on the SAME Intent rather than creating a second one (proven hosted,
 * PM-01B). The app neither knows nor needs the Intent id for that.
 */
export async function initiateQrph(bookingId: string): Promise<QrphInitiation> {
  const parsed = toQrphInitiation(bookingId, await invokeQrph('initiate-qrph-payment', bookingId));
  if (parsed === null) throw new PaymentError('Malformed payment response.', 'malformed_response');
  return parsed;
}

/**
 * Client refreshes payment state. This cannot settle anything the provider
 * has not already settled: the function re-reads the Payment Intent from
 * PayMongo itself and returns `settled: false` for an already-paid Booking
 * (proven hosted, PM-01C). One tap, one call -- there is no polling here.
 */
export async function reconcileQrph(bookingId: string): Promise<QrphReconciliation> {
  const parsed = toQrphReconciliation(
    bookingId,
    await invokeQrph('reconcile-qrph-payment', bookingId)
  );
  if (parsed === null) throw new PaymentError('Malformed payment response.', 'malformed_response');
  return parsed;
}

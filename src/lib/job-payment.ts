/**
 * R4 Job posting-time payment intent.
 *
 * Stored values stay `cod` | `qrph`. UI labels are Cash / QR Ph.
 * NULL is legacy compatibility only. `gcash` and `maya` are Booking-schema
 * leftovers and are not Job-level choices.
 *
 * METHOD is not TIMING. This module names HOW a Job is paid (Cash or the
 * PayMongo QR Ph TEST simulation). WHEN payment settles (while the Booking is
 * confirmed, before the Client's final completion) is owned by the server
 * lifecycle and is not changed or restated as a separate "method" here. A
 * legacy NULL Job is "not specified", never a third "pay after" option and
 * never silently shown as Cash.
 */

import { supabase } from './supabase';

export type JobPaymentMethod = 'cod' | 'qrph';

export class JobPaymentError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'JobPaymentError';
    this.code = code;
  }
}

export type JobPaymentParse =
  | { ok: true; method: JobPaymentMethod | null }
  | { ok: false };

const JOB_METHODS: readonly JobPaymentMethod[] = ['cod', 'qrph'];

/** The one place the QR Ph label is spelled. The test warning lives on the QR payment step (QR-12). */
export const QRPH_LABEL = 'QR Ph';

const JOB_LABEL: Record<JobPaymentMethod, string> = {
  cod: 'Cash',
  qrph: QRPH_LABEL,
};

/** Neutral copy for a legacy NULL Job intent. Never "Cash", never a method. */
const LEGACY_UNSPECIFIED = 'Not specified (older job)';

/** The only selectable posting methods, in display order. */
export const JOB_PAYMENT_OPTIONS: readonly { value: JobPaymentMethod; label: string }[] = [
  { value: 'cod', label: JOB_LABEL.cod },
  { value: 'qrph', label: JOB_LABEL.qrph },
];

export function parseJobPaymentMethod(value: unknown): JobPaymentParse {
  if (value === null || value === undefined) return { ok: true, method: null };
  if (typeof value === 'string' && JOB_METHODS.includes(value as JobPaymentMethod)) {
    return { ok: true, method: value as JobPaymentMethod };
  }
  return { ok: false };
}

export function formatJobPaymentLabel(method: JobPaymentMethod): string {
  return JOB_LABEL[method];
}

/** Value only, for rows that already carry a "Payment method" label. Never defaults to Cash. */
export function formatPostedPaymentValue(method: JobPaymentMethod | null): string {
  return method === null ? LEGACY_UNSPECIFIED : JOB_LABEL[method];
}

export function formatClientPostedPaymentLine(method: JobPaymentMethod | null): string {
  return `Payment method: ${formatPostedPaymentValue(method)}`;
}

export function formatOpportunityPaymentLine(method: JobPaymentMethod | null): string {
  return `Payment method: ${method === null ? LEGACY_UNSPECIFIED : JOB_LABEL[method]}`;
}

/** Posting review value for an in-progress draft; unset stays "Not selected". */
export function formatJobPaymentReviewValue(method: JobPaymentMethod | null): string {
  return method === null ? 'Not selected' : JOB_LABEL[method];
}

export function isPayableQrphBudget(budget: number | null): boolean {
  return budget !== null && budget >= 1;
}

export function postingPaymentError(
  method: JobPaymentMethod | null,
  budget: number | null
): string | null {
  if (method === null) return 'Please select a payment method.';
  if (method === 'qrph' && !isPayableQrphBudget(budget)) {
    return `${QRPH_LABEL} requires a budget of at least ₱1.00.`;
  }
  return null;
}

/**
 * One-column Job-intent read for a Booking the caller already holds.
 * Does not select address, client_id, title, or contact fields.
 */
export async function fetchJobPaymentMethod(jobId: string): Promise<JobPaymentMethod | null> {
  const res = await supabase
    .from('job_postings')
    .select('payment_method')
    .eq('id', jobId)
    .maybeSingle();

  if (res.error) {
    throw new JobPaymentError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
  if (res.data == null) {
    throw new JobPaymentError('Job payment method is unavailable.', 'not_found');
  }

  const parsed = parseJobPaymentMethod(
    (res.data as { payment_method?: unknown }).payment_method
  );
  if (!parsed.ok) {
    throw new JobPaymentError('Malformed job payment method.', 'malformed');
  }
  return parsed.method;
}

/**
 * R4 Job posting-time payment intent.
 *
 * Stored values stay `cod` | `qrph`. UI labels are Cash / QR Ph.
 * NULL is legacy compatibility only. `gcash` and `maya` are Booking-schema
 * leftovers and are not Job-level choices.
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

const JOB_LABEL: Record<JobPaymentMethod, string> = {
  cod: 'Cash',
  qrph: 'QR Ph',
};

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

export function formatClientPostedPaymentLine(method: JobPaymentMethod | null): string {
  return method === null
    ? 'Payment method: Not specified (legacy job)'
    : `Payment method: ${JOB_LABEL[method]}`;
}

export function formatOpportunityPaymentLine(method: JobPaymentMethod | null): string {
  return method === null
    ? 'Payment method: Client selects after completion (legacy job)'
    : `Payment method: ${JOB_LABEL[method]}`;
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
    return 'QR Ph requires a budget of at least ₱1.00.';
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

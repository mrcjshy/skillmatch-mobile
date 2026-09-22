/**
 * V3-1 P3 — Worker job-opportunity model, parsers, loaders, compact fields,
 * and acceptance. Presentation lives in the compact card and details screen.
 *
 * The list source is the hosted RPC `public.list_my_job_opportunities()`,
 * called with ZERO arguments. The Worker identity comes from `auth.uid()`
 * inside that SECURITY DEFINER function, so there is no worker id to pass and
 * none that could be substituted to view someone else's opportunities.
 *
 * Nothing about matching is reimplemented here. Stage 1 eligibility
 * (role/active/verified/available/skill overlap) and the Skill 50 /
 * Location 30 / Rating 20 scoring both remain authoritative inside
 * `private.compute_job_matches(job_id)`, which the RPC reuses. This module
 * does not query job_postings, does not join Worker skills for ranking, does
 * not call `public.match_workers_for_job()`, and never re-sorts rows — the
 * server's ordering is kept as received.
 *
 * Required-skill names for the details screen reuse `loadJobRequiredSkills`
 * from Skill Gap (a job_skills + skills label read). That is display only;
 * it is not a matching factor.
 *
 * Acceptance is `public.accept_job_opportunity(p_job_id)`. That RPC is the
 * entire acceptance contract. The Worker id is never sent.
 */

import { formatBudget, formatLocation } from './bookings';
import { formatCardDateTime } from './date-time';
import { parseJobPaymentMethod, type JobPaymentMethod } from './job-payment';
import { loadJobRequiredSkills, type SkillRef } from './skill-gap';
import { supabase } from './supabase';

export type { SkillRef };
export { loadJobRequiredSkills };

/** Exactly the 12 fields `public.list_my_job_opportunities()` returns. */
export type JobOpportunity = {
  job_id: string;
  title: string;
  description: string | null;
  barangay: string | null;
  city: string | null;
  budget: number | null;
  scheduled_at: string | null;
  skill_points: number;
  location_points: number;
  rating_points: number;
  total_points: number;
  payment_method: JobPaymentMethod | null;
};

export type JobOpportunityCompactFields = {
  title: string;
  primarySkillName: string | null;
  descriptionPreview: string | null;
  area: string | null;
  schedule: string | null;
  budget: string | null;
  matchTotal: string;
  matchLine: string;
};

export class JobOpportunityError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'JobOpportunityError';
    this.code = code;
  }
}

/**
 * Observed live against the hosted project: supabase-js does NOT throw for a
 * PostgREST/database error — it resolves with `{ data: null, error }`, and the
 * SQLSTATE arrives verbatim in `error.code`:
 *
 *   { code: '42501', message: 'not authorized to accept opportunities' }
 *   { code: 'SM409', message: 'this opportunity is no longer available' }
 *   { code: 'SM403', message: 'you are no longer eligible for this opportunity' }
 *
 * Classification reads `error.code` exactly and never parses `message`.
 */
export const ACCEPT_JOB_ERROR = {
  /** Job is matched, cancelled, completed, or nonexistent — deliberately indistinguishable. */
  UNAVAILABLE: 'SM409',
  /** Caller is a real Worker but no longer passes Stage 1 for this Job. */
  INELIGIBLE: 'SM403',
  /** Not authorized / EXECUTE ACL. Same generic Worker copy as any unexpected code. */
  FORBIDDEN: '42501',
} as const;

export type AcceptJobErrorKind = 'unavailable' | 'ineligible' | 'generic';

export type AcceptJobResult =
  | { status: 'accepted' }
  | { status: 'unavailable' }
  | { status: 'ineligible'; reason: string }
  | { status: 'generic' };

export type AcceptJobNotice = {
  tone: 'success' | 'info' | 'warning';
  headline: string;
  detail: string | null;
};

export const ACCEPT_JOB_COPY = {
  taken: 'This job was already accepted by another worker.',
  ineligible: "You're no longer eligible for this job.",
  generic: "We couldn't accept this job. Please refresh and try again.",
  accepted: 'Job accepted. It is now booked to you.',
  bookingHandoffFailed:
    'Your acceptance was submitted successfully, but the booking could not be opened. ' +
    'Open Bookings to continue.',
  refreshFailed:
    "Your acceptance was submitted, but we couldn't refresh this opportunity. " +
    'Refresh to see the latest status.',
} as const;

export const JOB_OPPORTUNITY_COPY = {
  loadFailed: 'Unable to load job opportunities. Please try again.',
  unavailable: 'This opportunity is unavailable.',
  loading: 'Loading job opportunity…',
  loadingRequirements: 'Loading required skills…',
  requirementsFailed: "This job's requirements could not be loaded.",
  noRequirements: 'This job does not list any required skills.',
  viewDetails: 'View details →',
} as const;

/** Stage 1 reasons the Worker's own authoritative state can actually explain. */
export const INELIGIBILITY_REASON = {
  unverified: 'Your worker profile is not currently verified.',
  unavailable: 'Your availability is no longer set to Available.',
  noSkillOverlap: "Your current skills no longer match this job's requirements.",
  unexplained: "Your profile no longer meets this job's eligibility requirements.",
} as const;

/* ------------------------------------------------------------------ *
 * Coercion — never trust a row's shape.
 * ------------------------------------------------------------------ */

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toNullableText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/**
 * Validate one RPC row. The four score fields and job_id/title are NOT NULL by
 * construction, so a row missing them is malformed rather than merely sparse
 * and is dropped instead of rendered half-blank.
 */
export function parseJobOpportunity(row: unknown): JobOpportunity | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;

  const jobId = typeof r.job_id === 'string' ? r.job_id : null;
  const title = typeof r.title === 'string' ? r.title : null;
  const skill = toNumber(r.skill_points);
  const location = toNumber(r.location_points);
  const rating = toNumber(r.rating_points);
  const total = toNumber(r.total_points);

  if (jobId === null || title === null) return null;
  if (skill === null || location === null || rating === null || total === null) return null;

  const payment = parseJobPaymentMethod(r.payment_method);
  if (!payment.ok) return null;

  return {
    job_id: jobId,
    title,
    description: toNullableText(r.description),
    barangay: toNullableText(r.barangay),
    city: toNullableText(r.city),
    budget: toNumber(r.budget),
    scheduled_at: toNullableText(r.scheduled_at),
    skill_points: skill,
    location_points: location,
    rating_points: rating,
    total_points: total,
    payment_method: payment.method,
  };
}

/** Server order is preserved — no client-side re-ranking. Malformed rows are dropped. */
export function parseJobOpportunityRows(data: unknown): JobOpportunity[] {
  const rows = Array.isArray(data) ? data : [];
  return rows.map(parseJobOpportunity).filter((row): row is JobOpportunity => row !== null);
}

export async function loadMyJobOpportunities(): Promise<JobOpportunity[]> {
  const res = await supabase.rpc('list_my_job_opportunities');
  if (res.error) {
    throw new JobOpportunityError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
  return parseJobOpportunityRows(res.data);
}

/**
 * Locate one opportunity in an already-loaded list by `job_id`. First match
 * wins. Blank ids and misses return null — the caller must not invent a row.
 */
export function findOpportunityById(
  opportunities: readonly JobOpportunity[],
  jobId: string
): JobOpportunity | null {
  if (jobId.trim() === '') return null;
  return opportunities.find((row) => row.job_id === jobId) ?? null;
}

/** Reuses Skill Gap's required-skill loader. Display only; not a matching factor. */
export async function loadOpportunityRequiredSkills(jobId: string): Promise<SkillRef[]> {
  return loadJobRequiredSkills(jobId);
}

/* ------------------------------------------------------------------ *
 * Compact / details field helpers
 * ------------------------------------------------------------------ */

/** Keeps whole scores clean (50, not 50.00) while allowing fractional ones (12.5). */
export function formatMatchPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function formatOpportunityArea(barangay: string | null, city: string | null): string | null {
  return formatLocation(barangay, city);
}

export function formatOpportunityBudget(budget: number | null): string | null {
  return formatBudget(budget);
}

export function formatOpportunitySchedule(scheduledAt: string | null): string | null {
  return formatCardDateTime(scheduledAt);
}

export function formatOpportunityMatchTotal(totalPoints: number): string {
  return `${formatMatchPoints(totalPoints)}/100`;
}

export function formatOpportunityMatchLine(totalPoints: number): string {
  return `Match Score: ${formatOpportunityMatchTotal(totalPoints)}`;
}

export function formatSkillScoreLine(skillPoints: number): string {
  return `Skill: ${formatMatchPoints(skillPoints)}/50`;
}

export function formatLocationScoreLine(locationPoints: number): string {
  return `Location: ${formatMatchPoints(locationPoints)}/30`;
}

export function formatRatingScoreLine(ratingPoints: number): string {
  return `Rating score: ${formatMatchPoints(ratingPoints)}/20`;
}

export function previewOpportunityDescription(description: string | null): string | null {
  if (description === null) return null;
  const trimmed = description.trim();
  return trimmed === '' ? null : trimmed;
}

export function compactPrimarySkillName(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed === '' ? null : trimmed;
}

export function compactOpportunityFields(
  opportunity: JobOpportunity,
  primarySkillName?: string | null
): JobOpportunityCompactFields {
  return {
    title: opportunity.title,
    primarySkillName: compactPrimarySkillName(primarySkillName),
    descriptionPreview: previewOpportunityDescription(opportunity.description),
    area: formatOpportunityArea(opportunity.barangay, opportunity.city),
    schedule: formatOpportunitySchedule(opportunity.scheduled_at),
    budget: formatOpportunityBudget(opportunity.budget),
    matchTotal: formatOpportunityMatchTotal(opportunity.total_points),
    matchLine: formatOpportunityMatchLine(opportunity.total_points),
  };
}

/* ------------------------------------------------------------------ *
 * Acceptance
 * ------------------------------------------------------------------ */

export function classifyAcceptJobErrorCode(code: string | null | undefined): AcceptJobErrorKind {
  if (code === ACCEPT_JOB_ERROR.UNAVAILABLE) return 'unavailable';
  if (code === ACCEPT_JOB_ERROR.INELIGIBLE) return 'ineligible';
  return 'generic';
}

export function acceptJobNotice(result: AcceptJobResult): AcceptJobNotice {
  if (result.status === 'accepted') {
    return { tone: 'success', headline: ACCEPT_JOB_COPY.accepted, detail: null };
  }
  if (result.status === 'unavailable') {
    return { tone: 'info', headline: ACCEPT_JOB_COPY.taken, detail: null };
  }
  if (result.status === 'ineligible') {
    return { tone: 'warning', headline: ACCEPT_JOB_COPY.ineligible, detail: result.reason };
  }
  return { tone: 'warning', headline: ACCEPT_JOB_COPY.generic, detail: null };
}

/**
 * SM403 reason resolution — from a FRESH read of the Worker's own state.
 * Stage 1 is not reimplemented as a decision — the server already decided.
 * This only picks the explanation.
 */
export async function resolveAcceptIneligibilityReason(
  userId: string,
  jobId: string
): Promise<string> {
  const profileRes = await supabase
    .from('worker_profiles')
    .select('id, is_verified, availability_status')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileRes.error || !profileRes.data) return INELIGIBILITY_REASON.unexplained;

  if (profileRes.data.is_verified !== true) return INELIGIBILITY_REASON.unverified;
  if (profileRes.data.availability_status !== 'available') return INELIGIBILITY_REASON.unavailable;

  const requiredRes = await supabase.from('job_skills').select('skill_id').eq('job_id', jobId);
  if (requiredRes.error) return INELIGIBILITY_REASON.unexplained;
  const required = (requiredRes.data ?? [])
    .map((r) => r.skill_id)
    .filter((id): id is string => typeof id === 'string');
  if (required.length === 0) return INELIGIBILITY_REASON.unexplained;

  const mineRes = await supabase
    .from('worker_skills')
    .select('skill_id')
    .eq('worker_id', profileRes.data.id);
  if (mineRes.error) return INELIGIBILITY_REASON.unexplained;
  const mine = new Set(
    (mineRes.data ?? []).map((r) => r.skill_id).filter((id): id is string => typeof id === 'string')
  );

  return required.some((id) => mine.has(id))
    ? INELIGIBILITY_REASON.unexplained
    : INELIGIBILITY_REASON.noSkillOverlap;
}

/**
 * The Worker is auth.uid() inside the RPC; only the Job id is sent.
 * `userId` is used solely to pick an SM403 explanation from the Worker's own
 * tables — it is never forwarded to `accept_job_opportunity`.
 */
export async function acceptJobOpportunity(
  jobId: string,
  userId?: string | null
): Promise<AcceptJobResult> {
  const res = await supabase.rpc('accept_job_opportunity', { p_job_id: jobId });

  if (res.error) {
    const code = res.error.code ?? null;
    console.warn('[V3-1 P3] accept_job_opportunity failed:', code, res.error.message);
    const kind = classifyAcceptJobErrorCode(code);
    if (kind === 'unavailable') return { status: 'unavailable' };
    if (kind === 'ineligible') {
      const reason = userId
        ? await resolveAcceptIneligibilityReason(userId, jobId)
        : INELIGIBILITY_REASON.unexplained;
      return { status: 'ineligible', reason };
    }
    return { status: 'generic' };
  }

  return { status: 'accepted' };
}

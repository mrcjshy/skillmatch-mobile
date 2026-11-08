import type { AppChipVariant } from '@/components/app-chip';

/**
 * One status vocabulary for Worker, Client and Admin (Iteration 06 Wave 5). Presentation only: the
 * stored values are never changed, only the chip tone and casing they are shown with.
 *
 * - positive: finished well (completed, matched, resolved)
 * - warning: waiting on someone (pending, submitted)
 * - danger: cancelled, failed or a no-show
 * - info: in progress or open (confirmed, under review, open)
 * - neutral: closed without an outcome, or a value this app does not know
 *
 * Brand blue is never used for success, warning or failure; `info` shares the accent family because
 * "in progress" is not a judgement.
 */
export function bookingStatusVariant(status: string): AppChipVariant {
  if (status === 'confirmed') return 'info';
  if (status === 'completed') return 'positive';
  if (status === 'pending') return 'warning';
  if (status === 'cancelled' || status === 'no_show') return 'danger';
  return 'neutral';
}

export function reportStatusVariant(status: string): AppChipVariant {
  if (status === 'submitted') return 'warning';
  if (status === 'under_review') return 'info';
  if (status === 'resolved') return 'positive';
  return 'neutral';
}

export function jobStatusVariant(status: string): AppChipVariant {
  if (status === 'open') return 'info';
  if (status === 'matched' || status === 'completed') return 'positive';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

/**
 * NOSHOW-01 (owner 2026-11-06): an open Job whose scheduled time has passed no longer reaches Workers
 * and cannot be accepted. Shown to the Client as "Date passed".
 */
export function isOpenJobPastDate(status: string, scheduledAt: string | null, now: number = Date.now()): boolean {
  if (status !== 'open' || !scheduledAt) return false;
  const at = Date.parse(scheduledAt);
  return Number.isFinite(at) && at <= now;
}

export const PAST_DATE_COPY = {
  chip: 'Date passed',
  note: 'The date for this job has passed, so Workers can no longer see or accept it. Cancel it and post the job again with a new date.',
} as const;

/** `open` -> `Open`, `matched` -> `Matched`. */
export function jobStatusLabel(status: string): string {
  const spaced = status.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

import type { AppChipVariant } from '@/components/app-chip';
import type { AdminAnalyticsSummary } from '@/lib/admin-analytics';

/**
 * Presentation-only wording for the Admin screens (Iteration 06 Wave 4). Every value comes from an
 * existing Admin read; nothing here adds a field, a count or an action.
 */
export type AdminStatus = { label: string; variant: AppChipVariant };

export function plural(count: number, singular: string, many = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : many}`;
}

export function accountStatus(isActive: boolean): AdminStatus {
  return isActive ? { label: 'Active', variant: 'positive' } : { label: 'Inactive', variant: 'danger' };
}

/** Read-only meaning of the account state; the Admin app has no control that changes it. */
export function accountStatusExplanation(isActive: boolean): string {
  return isActive
    ? 'This account can sign in and use SkillMatch.'
    : 'This account is inactive. Signing in shows the inactive-account screen instead of the app.';
}

type WorkerVerificationInput = { has_profile?: boolean; is_verified?: boolean | null };

export function workerVerificationStatus(worker: WorkerVerificationInput): AdminStatus {
  if (!worker.has_profile) return { label: 'No profile', variant: 'neutral' };
  if (worker.is_verified === true) return { label: 'Verified', variant: 'positive' };
  if (worker.is_verified === false) return { label: 'Unverified', variant: 'warning' };
  return { label: 'Verification not set', variant: 'neutral' };
}

/**
 * One status chip per directory row. An inactive account outranks everything; otherwise a Worker
 * shows verification and a Client (who has no verification) shows the account state.
 */
export function directoryRowStatus(
  kind: 'worker' | 'client', item: WorkerVerificationInput & { is_active: boolean }
): AdminStatus {
  if (!item.is_active) return accountStatus(false);
  return kind === 'worker' ? workerVerificationStatus(item) : accountStatus(true);
}

/** `available` -> `Available`, `on_leave` -> `On leave`; null stays explicit. */
export function availabilityLabel(status: string | null | undefined): string {
  if (!status) return 'Availability not set';
  const words = status.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Open reports are the ones an Admin can still act on (the summary's "needing attention" set). */
export function isOpenReport(status: string): boolean {
  return status === 'submitted' || status === 'under_review';
}

export function idReviewAttention(snapshot: AdminAnalyticsSummary | null): string {
  if (!snapshot) return 'Count loading';
  const pending = snapshot.pendingWorkerVerifications;
  return pending === 0 ? 'No Workers waiting' : `${plural(pending, 'Worker')} waiting for review`;
}

export function reportAttention(snapshot: AdminAnalyticsSummary | null): string {
  if (!snapshot) return 'Count loading';
  const open = snapshot.reportsNeedingAttention;
  return open === 0 ? 'Nothing needs attention' : `${plural(open, 'report')} need${open === 1 ? 's' : ''} attention`;
}

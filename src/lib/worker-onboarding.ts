import type { WorkerIdentitySubmission } from './worker-identity';

export type WorkerOnboardingState =
  | 'loading'
  | 'verified'
  | 'needs-submission'
  | 'pending-review'
  | 'rejected'
  | 'load-error';

/** Verification comes only from worker_profiles.is_verified. */
export function deriveWorkerOnboardingState(
  isVerified: boolean,
  submission: WorkerIdentitySubmission | null
): WorkerOnboardingState {
  if (isVerified) return 'verified';
  if (submission === null) return 'needs-submission';
  if (submission.status === 'pending') return 'pending-review';
  if (submission.status === 'rejected') return 'rejected';
  // An approved document without authoritative verification is inconsistent.
  return 'load-error';
}

/** The loading and error states never grant access to Worker routes. */
export function canEnterWorkerApp(state: WorkerOnboardingState): boolean {
  return state === 'verified';
}

export type WorkerOnboardingSnapshot = {
  identitySubmission: WorkerIdentitySubmission | null;
  workerIsVerified: boolean;
  workerOnboardingState: WorkerOnboardingState;
};

/** Read-only bootstrap. Failed or malformed reads are distinct from no ID. */
export async function loadWorkerOnboarding(
  readVerification: () => Promise<boolean | null>,
  readSubmission: () => Promise<WorkerIdentitySubmission | null>
): Promise<WorkerOnboardingSnapshot> {
  try {
    const verified = await readVerification();
    if (verified === true) {
      return { identitySubmission: null, workerIsVerified: true, workerOnboardingState: 'verified' };
    }
    if (verified !== false && verified !== null) throw new Error('Invalid verification flag');
    const identitySubmission = await readSubmission();
    return {
      identitySubmission,
      workerIsVerified: false,
      workerOnboardingState: deriveWorkerOnboardingState(false, identitySubmission),
    };
  } catch {
    return { identitySubmission: null, workerIsVerified: false, workerOnboardingState: 'load-error' };
  }
}

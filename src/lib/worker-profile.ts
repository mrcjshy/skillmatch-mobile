/**
 * R5C-1 Worker Profile helpers — presentation and write-payload seams.
 *
 * Verification is read-only. `worker_profiles.is_verified` is authoritative.
 * These helpers never invent a Worker write path for protected columns.
 */

export const WORKER_PROFILE_PROTECTED_WRITE_FIELDS = [
  'is_verified',
  'verified_by',
  'rating_avg',
  'strike_count',
  'badge_level',
] as const;

export type WorkerProfileWriteAvailability = 'available' | 'busy' | 'offline';

/** Authoritative verification is the boolean true only. */
export function isWorkerVerified(value: unknown): boolean {
  return value === true;
}

export function workerVerificationLabel(isVerified: boolean): string {
  return isVerified ? 'Verified' : 'Verification pending';
}

export function buildWorkerProfileInsertRow(input: {
  userId: string;
  bio: string | null;
  availabilityStatus: WorkerProfileWriteAvailability;
}): { user_id: string; bio: string | null; availability_status: WorkerProfileWriteAvailability } {
  return {
    user_id: input.userId,
    bio: input.bio,
    availability_status: input.availabilityStatus,
  };
}

export function buildWorkerProfileUpdateRow(input: {
  bio: string | null;
  availabilityStatus: WorkerProfileWriteAvailability;
}): { bio: string | null; availability_status: WorkerProfileWriteAvailability } {
  return {
    bio: input.bio,
    availability_status: input.availabilityStatus,
  };
}

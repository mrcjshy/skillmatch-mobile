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

/** Home-only persist. Writes availability_status and nothing else. */
export function buildWorkerProfileAvailabilityUpdateRow(input: {
  availabilityStatus: WorkerProfileWriteAvailability;
}): { availability_status: WorkerProfileWriteAvailability } {
  return {
    availability_status: input.availabilityStatus,
  };
}

/** Home authority refresh. Reads availability_status and nothing else. */
export const WORKER_PROFILE_AVAILABILITY_READ_COLUMNS = ['availability_status'] as const;

export function parseWorkerProfileAvailabilityStatus(
  value: unknown
): WorkerProfileWriteAvailability | null {
  if (value === 'available' || value === 'busy' || value === 'offline') return value;
  return null;
}

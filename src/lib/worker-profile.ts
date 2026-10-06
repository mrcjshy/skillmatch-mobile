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
export type AvailabilityControlPresentedValue = 'available' | 'busy';
/** Profile/Home control options. Offline remains a readable DB value until BE-5. */
export const AVAILABILITY_CONTROL_OPTIONS: {
  value: AvailabilityControlPresentedValue;
  label: string;
}[] = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
];

/** Control display only. Historical `offline` is shown as Busy; DB CHECK stays tri-state. */
export function presentAvailabilityControlValue(
  status: WorkerProfileWriteAvailability
): AvailabilityControlPresentedValue {
  return status === 'available' ? 'available' : 'busy';
}

/** Persist only when the presented choice differs from the presented stored value. */
export function shouldPersistAvailabilityChange(
  stored: WorkerProfileWriteAvailability,
  chosen: AvailabilityControlPresentedValue
): boolean {
  return presentAvailabilityControlValue(stored) !== chosen;
}

/** Authoritative verification is the boolean true only. */
export function isWorkerVerified(value: unknown): boolean {
  return value === true;
}

export function workerVerificationLabel(isVerified: boolean): string {
  return isVerified ? 'Verified' : 'Not yet verified';
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

/** Profile header avatar diameter, in dp. */
export const WORKER_PROFILE_AVATAR_SIZE = 64;
/** Narrowest the identity (name, trade, verification) and contact columns may get at 100% text. */
const PROFILE_IDENTITY_MIN_WIDTH = 96;
const PROFILE_CONTACT_MIN_WIDTH = 160;

export type WorkerProfileHeaderLayout =
  | { columns: 'side-by-side'; identityMinWidth: number; identityMaxWidth: number; contactMinWidth: number }
  | { columns: 'stacked' };

/**
 * Whether the contact column fits beside the identity column to the right of the avatar.
 * Both minimum widths grow with the system font scale, so larger text stacks the contacts
 * under the identity only when the two columns genuinely cannot share the row.
 */
export function workerProfileHeaderLayout(input: { windowWidth: number; fontScale: number; gutter: number; avatarGap: number; columnGap: number }): WorkerProfileHeaderLayout {
  const scale = Math.max(1, input.fontScale);
  const available = input.windowWidth - 2 * input.gutter - WORKER_PROFILE_AVATAR_SIZE - input.avatarGap;
  const identityMinWidth = Math.ceil(PROFILE_IDENTITY_MIN_WIDTH * scale);
  const contactMinWidth = Math.ceil(PROFILE_CONTACT_MIN_WIDTH * scale);
  if (available < identityMinWidth + input.columnGap + contactMinWidth) return { columns: 'stacked' };
  return { columns: 'side-by-side', identityMinWidth, identityMaxWidth: available - input.columnGap - contactMinWidth, contactMinWidth };
}

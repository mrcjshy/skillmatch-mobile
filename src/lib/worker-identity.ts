/**
 * V3 Wave 1 — Worker valid-ID submit/status and Administrator review.
 *
 * Storage bucket worker-identity is private. Paths use worker_profiles.id,
 * never users.id. Upload does not set is_verified. No getPublicUrl().
 */

import { supabase } from './supabase';
import { buildWorkerProfileInsertRow } from './worker-profile';

export const WORKER_IDENTITY_BUCKET = 'worker-identity';
export const WORKER_IDENTITY_SIGNED_URL_EXPIRES_IN = 3600;
export const WORKER_IDENTITY_UNIQUE_VIOLATION = '23505';

export type IdentityImageExt = 'jpg' | 'jpeg' | 'png' | 'webp';
export type WorkerIdentitySurface = 'profile' | 'onboarding';

export const IDENTITY_ID_TYPES = [
  'national_id',
  'drivers_license',
  'passport',
  'umid',
  'postal_id',
] as const;

export type IdentityIdType = (typeof IDENTITY_ID_TYPES)[number];
export type IdentityDocumentStatus = 'pending' | 'approved' | 'rejected';

export type WorkerIdentitySubmission = {
  id: string;
  idType: IdentityIdType;
  status: IdentityDocumentStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

export type PendingIdentityReview = {
  userId: string;
  documentId: string;
  fullName: string;
  phone: string | null;
  barangay: string | null;
  city: string | null;
  idType: IdentityIdType;
  submittedAt: string | null;
  skills: string[];
};

export type WorkerIdentityForReview = PendingIdentityReview & {
  storagePath: string;
};

export class WorkerIdentityError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'WorkerIdentityError';
    this.code = code;
  }
}

export const IDENTITY_ERROR = {
  FORBIDDEN: '42501',
  INVALID: '22023',
  UNAVAILABLE: 'SM409',
  MULTIPLE_ROWS: 'PGRST116',
} as const;

export const IDENTITY_COPY = {
  loadFailed: 'Unable to load your ID submission. Please try again.',
  submitFailed: "We couldn't submit your ID. Please try again.",
  forbidden: "You don't have permission to submit an ID.",
  invalidType: 'Please choose a valid ID type.',
  invalidImage: 'Please choose a JPEG, PNG, or WebP image of 5 MB or less.',
  invalidSubmission: 'The identity submission is invalid. Check the ID type and image, then try again.',
  alreadyApproved: 'Your approved ID cannot be replaced.',
  pending: 'Submitted — waiting for review',
  approved: 'Approved',
  rejected: 'Rejected',
  none: 'Not submitted',
  reviewLoadFailed: 'Unable to load the ID review queue. Please try again.',
  reviewForbidden: "You don't have permission to review identity documents.",
  reviewUnavailable: 'This identity submission is no longer pending review.',
  approveFailed: "We couldn't approve this ID. Please try again.",
  rejectFailed: "We couldn't reject this ID. Please try again.",
  rejectReasonRequired: 'Please enter a rejection reason (1–500 characters).',
  approvedNotice: 'Your identity document was approved.',
  rejectedNotice: 'Identity submission rejected.',
  homePendingHeadline: 'Your account is under review.',
  homePendingBody: [
    'Verification usually takes up to 24 hours.',
    'You will be notified when your account is verified.',
  ],
  homeRejectedHeadline: 'Your verification needs attention.',
  homeRejectedBody: [
    'Your identity submission was not approved.',
    'Open Profile to review the reason and submit a new ID.',
  ],
} as const;

export const IDENTITY_TYPE_LABELS: Record<IdentityIdType, string> = {
  national_id: 'PhilSys National ID / ePhilID',
  drivers_license: "LTO Driver's License",
  passport: 'Philippine Passport',
  umid: 'UMID',
  postal_id: 'Postal ID',
};

export const IDENTITY_PROFILE_STATUS_LABELS = {
  pending: 'Pending review',
  approved: 'Identity approved',
  rejected: 'Identity rejected',
  none: IDENTITY_COPY.none,
} as const;

export const IDENTITY_TYPE_OPTIONS: { value: IdentityIdType; label: string }[] = IDENTITY_ID_TYPES.map(
  (value) => ({ value, label: IDENTITY_TYPE_LABELS[value] })
);

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function toSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

export function isIdentityIdType(value: unknown): value is IdentityIdType {
  return (
    value === 'national_id' ||
    value === 'drivers_license' ||
    value === 'passport' ||
    value === 'umid' ||
    value === 'postal_id'
  );
}

export function identityTypeLabel(value: string | null | undefined): string {
  if (!isIdentityIdType(value)) return 'Valid ID';
  return IDENTITY_TYPE_LABELS[value];
}

export function identityStatusLabel(status: IdentityDocumentStatus | null): string {
  if (status === 'pending') return IDENTITY_COPY.pending;
  if (status === 'approved') return IDENTITY_COPY.approved;
  if (status === 'rejected') return IDENTITY_COPY.rejected;
  return IDENTITY_COPY.none;
}

export function identityProfileStatusLabel(status: IdentityDocumentStatus | null): string {
  if (status === 'pending') return IDENTITY_PROFILE_STATUS_LABELS.pending;
  if (status === 'approved') return IDENTITY_PROFILE_STATUS_LABELS.approved;
  if (status === 'rejected') return IDENTITY_PROFILE_STATUS_LABELS.rejected;
  return IDENTITY_PROFILE_STATUS_LABELS.none;
}

export type WorkerHomeIdentityNoticeKind = 'none' | 'pending' | 'rejected';

export function workerHomeIdentityNotice(
  isVerified: boolean,
  identityStatus: IdentityDocumentStatus | null
): WorkerHomeIdentityNoticeKind {
  if (isVerified) return 'none';
  if (identityStatus === 'rejected') return 'rejected';
  return 'pending';
}

export function canResubmitIdentity(status: IdentityDocumentStatus | null): boolean {
  return status !== 'approved';
}

export function shouldShowWorkerIdentityForm(input: {
  surface: WorkerIdentitySurface;
  status: IdentityDocumentStatus | null;
  resubmitOpen: boolean;
}): boolean {
  if (input.status === 'approved') return false;
  if (input.status === null) return true;
  if (input.surface === 'onboarding') return input.status === 'rejected';
  return input.resubmitOpen;
}

export function minimalWorkerIdentityProfileInsert(userId: string) {
  return buildWorkerProfileInsertRow({
    userId,
    bio: null,
    availabilityStatus: 'available',
  });
}

export function isIdentityDocumentStatus(value: unknown): value is IdentityDocumentStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected';
}

export function buildWorkerIdentityStoragePath(
  workerProfileId: string,
  objectId: string,
  ext: IdentityImageExt
): string | null {
  const profile = workerProfileId.trim();
  const id = objectId.trim().toLowerCase();
  const canonical =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (!canonical.test(profile) || !canonical.test(id)) return null;
  if (ext !== 'jpg' && ext !== 'jpeg' && ext !== 'png' && ext !== 'webp') return null;
  return `${profile}/${id}.${ext}`;
}

export function parseIdentitySubmission(row: unknown): WorkerIdentitySubmission | null {
  if (typeof row !== 'object' || row === null) return null;
  const record = row as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : null;
  const idType = isIdentityIdType(record.id_type) ? record.id_type : null;
  const status = isIdentityDocumentStatus(record.status) ? record.status : null;
  const submittedAt = toText(record.submitted_at);
  if (id === null || idType === null || status === null || submittedAt === null) return null;
  return {
    id,
    idType,
    status,
    rejectionReason: status === 'rejected' ? toText(record.rejection_reason) : null,
    submittedAt,
    reviewedAt: toText(record.reviewed_at),
  };
}

export function parseIdentitySubmissionResult(data: unknown): WorkerIdentitySubmission | null {
  const rows = Array.isArray(data) ? data : data !== null && data !== undefined ? [data] : [];
  return parseIdentitySubmission(rows[0] ?? null);
}

export function parsePendingIdentityReview(row: unknown): PendingIdentityReview | null {
  if (typeof row !== 'object' || row === null) return null;
  const record = row as Record<string, unknown>;
  const userId = typeof record.user_id === 'string' ? record.user_id : null;
  const documentId = typeof record.document_id === 'string' ? record.document_id : null;
  const fullName = typeof record.full_name === 'string' ? record.full_name : null;
  const idType = isIdentityIdType(record.id_type) ? record.id_type : null;
  if (userId === null || documentId === null || fullName === null || idType === null) return null;
  return {
    userId,
    documentId,
    fullName,
    phone: toText(record.phone),
    barangay: toText(record.barangay),
    city: toText(record.city),
    idType,
    submittedAt: toText(record.submitted_at),
    skills: toSkills(record.skills),
  };
}

export function parsePendingIdentityReviewRows(data: unknown): PendingIdentityReview[] {
  const rows = Array.isArray(data) ? data : [];
  return rows
    .map(parsePendingIdentityReview)
    .filter((row): row is PendingIdentityReview => row !== null);
}

export function parseWorkerIdentityForReview(row: unknown): WorkerIdentityForReview | null {
  const review = parsePendingIdentityReview(row);
  if (review === null) return null;
  const storagePath = toText((row as Record<string, unknown>).storage_path);
  if (storagePath === null) return null;
  return {
    ...review,
    skills: [],
    storagePath,
  };
}

export function identityErrorCopy(error: unknown): string {
  const code = error instanceof WorkerIdentityError ? error.code : null;
  if (code === IDENTITY_ERROR.FORBIDDEN) return IDENTITY_COPY.forbidden;
  if (code === IDENTITY_ERROR.UNAVAILABLE) return IDENTITY_COPY.alreadyApproved;
  if (code === IDENTITY_ERROR.INVALID) return IDENTITY_COPY.invalidSubmission;
  return IDENTITY_COPY.submitFailed;
}

export function classifyWorkerIdentityFailure(errorOrCode: unknown): string {
  const code =
    errorOrCode instanceof WorkerIdentityError
      ? errorOrCode.code
      : typeof errorOrCode === 'string' || errorOrCode === null
        ? errorOrCode
        : typeof errorOrCode === 'object' &&
            errorOrCode !== null &&
            'code' in errorOrCode &&
            typeof (errorOrCode as { code?: unknown }).code === 'string'
          ? (errorOrCode as { code: string }).code
          : null;
  if (code === IDENTITY_ERROR.FORBIDDEN) return 'forbidden';
  if (code === IDENTITY_ERROR.INVALID) return 'invalid';
  if (code === IDENTITY_ERROR.UNAVAILABLE) return 'unavailable';
  if (code === IDENTITY_ERROR.MULTIPLE_ROWS) return 'profile_select_ambiguous';
  if (code === WORKER_IDENTITY_UNIQUE_VIOLATION) return 'unique_violation';
  if (typeof code === 'string' && code.length > 0) return code;
  return 'unclassified';
}

export function reviewErrorCopy(error: unknown, action: 'approve' | 'reject' = 'approve'): string {
  const code = error instanceof WorkerIdentityError ? error.code : null;
  if (code === IDENTITY_ERROR.FORBIDDEN) return IDENTITY_COPY.reviewForbidden;
  if (code === IDENTITY_ERROR.UNAVAILABLE) return IDENTITY_COPY.reviewUnavailable;
  return action === 'reject' ? IDENTITY_COPY.rejectFailed : IDENTITY_COPY.approveFailed;
}

export function validateRejectionReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length < 1 || trimmed.length > 500) return IDENTITY_COPY.rejectReasonRequired;
  return null;
}

function throwIdentityError(error: { message?: string; code?: string | null }, fallback: string): never {
  const code = error.code ?? null;
  console.warn('[V3-W1] worker identity failed:', classifyWorkerIdentityFailure(code));
  throw new WorkerIdentityError(error.message || fallback, code);
}

export async function getMyIdentitySubmission(): Promise<WorkerIdentitySubmission | null> {
  const result = await supabase.rpc('get_my_identity_submission');
  if (result.error) throwIdentityError(result.error, IDENTITY_COPY.loadFailed);
  return parseIdentitySubmissionResult(result.data);
}

function parseOwnWorkerProfileId(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const id = (data as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

async function selectOwnWorkerProfileId(userId: string): Promise<string | null> {
  const result = await supabase
    .from('worker_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (result.error) throwIdentityError(result.error, IDENTITY_COPY.submitFailed);
  return parseOwnWorkerProfileId(result.data);
}

export async function ensureOwnWorkerProfileId(): Promise<string> {
  const auth = await supabase.auth.getUser();
  const userId = auth.data?.user?.id;
  if (auth.error || typeof userId !== 'string' || userId.length === 0) {
    console.warn('[V3-W1] worker identity failed:', classifyWorkerIdentityFailure(auth.error?.code ?? null));
    throw new WorkerIdentityError(IDENTITY_COPY.submitFailed, auth.error?.code ?? null);
  }

  const existingId = await selectOwnWorkerProfileId(userId);
  if (existingId !== null) return existingId;

  const inserted = await supabase
    .from('worker_profiles')
    .insert(minimalWorkerIdentityProfileInsert(userId))
    .select('id')
    .single();

  if (inserted.error) {
    if (inserted.error.code === WORKER_IDENTITY_UNIQUE_VIOLATION) {
      const retryId = await selectOwnWorkerProfileId(userId);
      if (retryId !== null) return retryId;
    }
    throwIdentityError(inserted.error, IDENTITY_COPY.submitFailed);
  }

  const insertedId = parseOwnWorkerProfileId(inserted.data);
  if (insertedId === null) {
    console.warn('[V3-W1] worker identity failed:', 'unclassified');
    throw new WorkerIdentityError(IDENTITY_COPY.submitFailed, null);
  }
  return insertedId;
}

export async function submitMyValidIdImage(input: {
  idType: IdentityIdType;
  imageUri: string;
}): Promise<WorkerIdentitySubmission> {
  if (!isIdentityIdType(input.idType)) {
    throw new WorkerIdentityError(IDENTITY_COPY.invalidType, IDENTITY_ERROR.INVALID);
  }

  const { loadValidatedLocalImage } = await import('./portfolio-images');
  const loaded = await loadValidatedLocalImage(input.imageUri);
  if (!loaded.ok) {
    throw new WorkerIdentityError(IDENTITY_COPY.invalidImage, IDENTITY_ERROR.INVALID);
  }

  const profileId = await ensureOwnWorkerProfileId();
  const Crypto = await import('expo-crypto');
  const objectId = Crypto.randomUUID().toLowerCase();
  const storagePath = buildWorkerIdentityStoragePath(profileId, objectId, loaded.image.ext);
  if (storagePath === null) {
    throw new WorkerIdentityError(IDENTITY_COPY.submitFailed, IDENTITY_ERROR.INVALID);
  }

  const uploaded = await supabase.storage.from(WORKER_IDENTITY_BUCKET).upload(storagePath, loaded.image.bytes, {
    upsert: false,
    contentType: loaded.image.mime,
  });
  if (uploaded.error) {
    throwIdentityError(uploaded.error, IDENTITY_COPY.submitFailed);
  }

  const submitted = await supabase.rpc('submit_my_valid_id', {
    p_id_type: input.idType,
    p_storage_path: storagePath,
  });
  if (submitted.error) {
    await supabase.storage.from(WORKER_IDENTITY_BUCKET).remove([storagePath]);
    throwIdentityError(submitted.error, IDENTITY_COPY.submitFailed);
  }

  const row = parseIdentitySubmissionResult(submitted.data);
  if (row === null) {
    throw new WorkerIdentityError(IDENTITY_COPY.submitFailed, null);
  }
  return row;
}

export async function listWorkersPendingIdReview(): Promise<PendingIdentityReview[]> {
  const result = await supabase.rpc('list_workers_pending_id_review');
  if (result.error) throwIdentityError(result.error, IDENTITY_COPY.reviewLoadFailed);
  return parsePendingIdentityReviewRows(result.data);
}

export async function createPendingIdentitySignedUrl(storagePath: string): Promise<string | null> {
  const trimmed = storagePath.trim();
  if (trimmed.length === 0) return null;
  const result = await supabase.storage
    .from(WORKER_IDENTITY_BUCKET)
    .createSignedUrl(trimmed, WORKER_IDENTITY_SIGNED_URL_EXPIRES_IN);
  if (result.error || typeof result.data?.signedUrl !== 'string' || result.data.signedUrl.length === 0) {
    return null;
  }
  return result.data.signedUrl;
}

export async function getWorkerIdentityForReview(
  workerUserId: string
): Promise<WorkerIdentityForReview | null> {
  const result = await supabase.rpc('get_worker_identity_for_review', {
    p_worker_user_id: workerUserId,
  });
  if (result.error) throwIdentityError(result.error, IDENTITY_COPY.reviewLoadFailed);
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  return parseWorkerIdentityForReview(rows[0] ?? null);
}

export async function getWorkerIdentityReviewImage(workerUserId: string): Promise<string | null> {
  const payload = await getWorkerIdentityForReview(workerUserId);
  if (payload === null) return null;
  return createPendingIdentitySignedUrl(payload.storagePath);
}

export async function approveWorkerIdentity(workerUserId: string): Promise<void> {
  const result = await supabase.rpc('approve_worker_identity', {
    p_worker_user_id: workerUserId,
  });
  if (result.error) throwIdentityError(result.error, IDENTITY_COPY.approveFailed);
}

export async function rejectWorkerIdentity(workerUserId: string, reason: string): Promise<void> {
  const invalid = validateRejectionReason(reason);
  if (invalid !== null) {
    throw new WorkerIdentityError(invalid, IDENTITY_ERROR.INVALID);
  }
  const result = await supabase.rpc('reject_worker_identity', {
    p_worker_user_id: workerUserId,
    p_reason: reason.trim(),
  });
  if (result.error) throwIdentityError(result.error, IDENTITY_COPY.rejectFailed);
}

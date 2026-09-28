/**
 * FT-02 — private Worker profile photo validation and Storage access.
 *
 * Every operation derives the one canonical object path from the authenticated
 * Worker's explicit users.id. Arbitrary object paths are never caller input.
 */

import { supabase } from './supabase';

export const WORKER_PROFILE_PHOTO_BUCKET = 'worker-profile-photos';
export const MAX_WORKER_PROFILE_PHOTO_BYTES = 5242880;
export const WORKER_PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS = 60;

export type WorkerProfilePhotoMime = 'image/jpeg' | 'image/png' | 'image/webp';

export type ValidatedWorkerProfilePhoto = {
  bytes: ArrayBuffer;
  mime: WorkerProfilePhotoMime;
  byteLength: number;
};

export type WorkerProfilePhotoValidationResult =
  | { ok: true; image: ValidatedWorkerProfilePhoto }
  | { ok: false; reason: 'empty' | 'too_large' | 'unsupported_type' };

export type WorkerProfilePhotoWriteResult = {
  status: 'uploaded' | 'already_present';
  path: string;
  mime: WorkerProfilePhotoMime;
};

export type WorkerProfilePhotoRemoveResult = {
  status: 'removed' | 'already_missing';
  path: string;
};

export type WorkerProfilePhotoReadResult =
  | { status: 'available'; path: string; signedUrl: string }
  | { status: 'fallback'; reason: 'missing' | 'unavailable' };

export type SanitizedWorkerProfilePhotoError = {
  category:
    | 'authorization'
    | 'conflict'
    | 'not_found'
    | 'rate_limited'
    | 'service_unavailable'
    | 'storage_error'
    | 'unknown';
  status?: number;
};

export type WorkerProfilePhotoStage = 'upload' | 'remove' | 'reconcile' | 'signed_url';

export class WorkerProfilePhotoError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'WorkerProfilePhotoError';
    this.code = code;
  }
}

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function copyArrayBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  const bytes = toBytes(input);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return (
    bytes.length >= offset + signature.length &&
    signature.every((value, index) => bytes[offset + index] === value)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function statusFromError(error: unknown): number | undefined {
  const record = asRecord(error);
  for (const value of [record?.status, record?.statusCode]) {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && /^\d{3}$/.test(value)) return Number(value);
  }
  return undefined;
}

function isMissingStorageError(error: unknown): boolean {
  const status = statusFromError(error);
  if (status === 404) return true;
  const record = asRecord(error);
  const signals = [record?.code, record?.error, record?.name, record?.message];
  return signals.some(
    (value) =>
      typeof value === 'string' &&
      /^(not[_ -]?found|no[_ -]?such[_ -]?(key|object)|object not found)$/i.test(value.trim())
  );
}

export function sanitizeWorkerProfilePhotoError(error: unknown): SanitizedWorkerProfilePhotoError {
  const status = statusFromError(error);
  let category: SanitizedWorkerProfilePhotoError['category'] = 'unknown';
  if (status === 401 || status === 403) category = 'authorization';
  else if (status === 404) category = 'not_found';
  else if (status === 409) category = 'conflict';
  else if (status === 429) category = 'rate_limited';
  else if (status !== undefined && status >= 500 && status <= 599) category = 'service_unavailable';
  else if (status !== undefined) category = 'storage_error';
  return status === undefined ? { category } : { category, status };
}

export function logWorkerProfilePhotoFailure(
  stage: WorkerProfilePhotoStage,
  error: unknown
): void {
  console.warn(`[worker-profile-photo] ${stage}`, sanitizeWorkerProfilePhotoError(error));
}

export function detectWorkerProfilePhotoMime(
  input: ArrayBuffer | Uint8Array
): WorkerProfilePhotoMime | null {
  const bytes = toBytes(input);
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg';
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(bytes, RIFF_SIGNATURE) && startsWith(bytes, WEBP_SIGNATURE, 8)) {
    return 'image/webp';
  }
  return null;
}

export function validateWorkerProfilePhotoBytes(
  input: ArrayBuffer | Uint8Array
): WorkerProfilePhotoValidationResult {
  const bytes = toBytes(input);
  if (bytes.byteLength === 0) return { ok: false, reason: 'empty' };
  if (bytes.byteLength > MAX_WORKER_PROFILE_PHOTO_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  const mime = detectWorkerProfilePhotoMime(bytes);
  if (mime === null) return { ok: false, reason: 'unsupported_type' };
  return {
    ok: true,
    image: { bytes: copyArrayBuffer(bytes), mime, byteLength: bytes.byteLength },
  };
}

export async function loadValidatedWorkerProfilePhoto(uri: string): Promise<
  WorkerProfilePhotoValidationResult | { ok: false; reason: 'read_failed' }
> {
  if (typeof uri !== 'string' || uri === '') return { ok: false, reason: 'read_failed' };
  try {
    const response = await fetch(uri);
    if (!response.ok) return { ok: false, reason: 'read_failed' };
    return validateWorkerProfilePhotoBytes(await response.arrayBuffer());
  } catch {
    return { ok: false, reason: 'read_failed' };
  }
}

export function buildWorkerProfilePhotoPath(workerUserId: string): string {
  if (!CANONICAL_UUID_PATTERN.test(workerUserId)) {
    throw new WorkerProfilePhotoError('invalid workerUserId', 'invalid_uuid');
  }
  return `${workerUserId}/avatar`;
}

async function readExactWorkerProfilePhoto(
  path: string
): Promise<
  | { status: 'available'; signedUrl: string }
  | { status: 'missing' }
  | { status: 'unavailable'; error: unknown }
> {
  const result = await supabase.storage
    .from(WORKER_PROFILE_PHOTO_BUCKET)
    .createSignedUrl(path, WORKER_PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS);
  if (
    !result.error &&
    typeof result.data?.signedUrl === 'string' &&
    result.data.signedUrl !== ''
  ) {
    return { status: 'available', signedUrl: result.data.signedUrl };
  }
  if (isMissingStorageError(result.error)) return { status: 'missing' };
  return { status: 'unavailable', error: result.error ?? { status: 500 } };
}

export async function getWorkerProfilePhoto(
  workerUserId: string
): Promise<WorkerProfilePhotoReadResult> {
  const path = buildWorkerProfilePhotoPath(workerUserId);
  const read = await readExactWorkerProfilePhoto(path);
  if (read.status === 'available') {
    return { status: 'available', path, signedUrl: read.signedUrl };
  }
  if (read.status === 'missing') return { status: 'fallback', reason: 'missing' };
  logWorkerProfilePhotoFailure('signed_url', read.error);
  return { status: 'fallback', reason: 'unavailable' };
}

export async function uploadWorkerProfilePhoto(input: {
  workerUserId: string;
  image: ValidatedWorkerProfilePhoto;
}): Promise<WorkerProfilePhotoWriteResult> {
  const path = buildWorkerProfilePhotoPath(input.workerUserId);
  const checked = validateWorkerProfilePhotoBytes(input.image.bytes);
  if (!checked.ok) {
    throw new WorkerProfilePhotoError('invalid profile photo', 'invalid_photo');
  }

  const uploaded = await supabase.storage
    .from(WORKER_PROFILE_PHOTO_BUCKET)
    .upload(path, checked.image.bytes, {
      contentType: checked.image.mime,
      upsert: false,
    });
  if (!uploaded.error) {
    return { status: 'uploaded', path, mime: checked.image.mime };
  }

  const reconciled = await readExactWorkerProfilePhoto(path);
  if (reconciled.status === 'available') {
    return { status: 'already_present', path, mime: checked.image.mime };
  }
  logWorkerProfilePhotoFailure(
    reconciled.status === 'unavailable' ? 'reconcile' : 'upload',
    reconciled.status === 'unavailable' ? reconciled.error : uploaded.error
  );
  throw new WorkerProfilePhotoError('profile photo upload failed', 'upload_failed');
}

export async function removeWorkerProfilePhoto(
  workerUserId: string
): Promise<WorkerProfilePhotoRemoveResult> {
  const path = buildWorkerProfilePhotoPath(workerUserId);
  const removed = await supabase.storage.from(WORKER_PROFILE_PHOTO_BUCKET).remove([path]);
  if (!removed.error) return { status: 'removed', path };

  const reconciled = await readExactWorkerProfilePhoto(path);
  if (reconciled.status === 'missing') return { status: 'already_missing', path };
  logWorkerProfilePhotoFailure(
    reconciled.status === 'unavailable' ? 'reconcile' : 'remove',
    reconciled.status === 'unavailable' ? reconciled.error : removed.error
  );
  throw new WorkerProfilePhotoError('profile photo removal failed', 'remove_failed');
}

export async function replaceWorkerProfilePhoto(input: {
  workerUserId: string;
  image: ValidatedWorkerProfilePhoto;
}): Promise<WorkerProfilePhotoWriteResult> {
  const checked = validateWorkerProfilePhotoBytes(input.image.bytes);
  if (!checked.ok) {
    throw new WorkerProfilePhotoError('invalid profile photo', 'invalid_photo');
  }
  await removeWorkerProfilePhoto(input.workerUserId);
  return uploadWorkerProfilePhoto({ workerUserId: input.workerUserId, image: checked.image });
}

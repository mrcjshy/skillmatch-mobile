/**
 * V4-9 — private Job photo validation and Storage access.
 *
 * A Job is created elsewhere before this module is called. Storage paths contain
 * the authoritative Client and Job UUIDs followed by one immutable slot.
 */

import { supabase } from './supabase';

export const JOB_PHOTOS_BUCKET = 'job-photos';
export const MAX_JOB_PHOTOS = 3;
export const MAX_JOB_PHOTO_BYTES = 5242880;
export const JOB_PHOTO_SIGNED_URL_TTL_SECONDS = 60;
export const JOB_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const JOB_PHOTO_SLOTS = [1, 2, 3] as const;

export type JobPhotoMime = (typeof JOB_PHOTO_MIME_TYPES)[number];
export type JobPhotoSlot = (typeof JOB_PHOTO_SLOTS)[number];

export type ValidatedJobPhoto = {
  bytes: ArrayBuffer;
  mime: JobPhotoMime;
  byteLength: number;
};

export type JobPhotoValidationResult =
  | { ok: true; image: ValidatedJobPhoto }
  | { ok: false; reason: 'empty' | 'too_large' | 'unsupported_type' };

export type JobPhotoCountResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'invalid_count' };

export type SanitizedJobPhotoError = {
  category: 'authorization' | 'conflict' | 'rate_limited' | 'service_unavailable' | 'storage_error' | 'unknown';
  status?: number;
};

export class JobPhotoError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'JobPhotoError';
    this.code = code;
  }
}

export type JobPhotoUploadSlotResult =
  | {
      slot: JobPhotoSlot;
      path: string;
      mime: JobPhotoMime;
      status: 'uploaded' | 'already_present';
    }
  | {
      slot: JobPhotoSlot;
      path: string;
      mime: JobPhotoMime;
      status: 'failed';
      error: SanitizedJobPhotoError;
    };

export type JobPhotoUploadResult = {
  outcome: 'all' | 'partial' | 'none';
  requestedCount: number;
  successfulCount: number;
  failedCount: number;
  slots: JobPhotoUploadSlotResult[];
};

export type JobPhotoRetry = {
  slot: JobPhotoSlot;
  image: ValidatedJobPhoto;
};

export type SignedJobPhoto = {
  slot: JobPhotoSlot;
  path: string;
  signedUrl: string;
};

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
  return bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function assertCanonicalUuid(value: string, field: 'clientId' | 'jobId'): void {
  if (!CANONICAL_UUID_PATTERN.test(value)) {
    throw new JobPhotoError(`invalid ${field}`, 'invalid_uuid');
  }
}

function isJobPhotoSlot(value: number): value is JobPhotoSlot {
  return value === 1 || value === 2 || value === 3;
}

function slotFromObjectName(name: unknown): JobPhotoSlot | null {
  if (name === '1') return 1;
  if (name === '2') return 2;
  if (name === '3') return 3;
  return null;
}

export function validateJobPhotoCount(count: number): JobPhotoCountResult {
  if (!Number.isInteger(count) || count < 0 || count > MAX_JOB_PHOTOS) {
    return { ok: false, reason: 'invalid_count' };
  }
  return { ok: true, count };
}

export function detectJobPhotoMime(input: ArrayBuffer | Uint8Array): JobPhotoMime | null {
  const bytes = toBytes(input);
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg';
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(bytes, RIFF_SIGNATURE) && startsWith(bytes, WEBP_SIGNATURE, 8)) return 'image/webp';
  return null;
}

export function validateJobPhotoBytes(input: ArrayBuffer | Uint8Array): JobPhotoValidationResult {
  const bytes = toBytes(input);
  if (bytes.byteLength === 0) return { ok: false, reason: 'empty' };
  if (bytes.byteLength > MAX_JOB_PHOTO_BYTES) return { ok: false, reason: 'too_large' };
  const mime = detectJobPhotoMime(bytes);
  if (mime === null) return { ok: false, reason: 'unsupported_type' };
  return {
    ok: true,
    image: {
      bytes: copyArrayBuffer(bytes),
      mime,
      byteLength: bytes.byteLength,
    },
  };
}

export async function loadValidatedJobPhoto(uri: string): Promise<
  JobPhotoValidationResult | { ok: false; reason: 'read_failed' }
> {
  if (typeof uri !== 'string' || uri === '') return { ok: false, reason: 'read_failed' };
  try {
    const response = await fetch(uri);
    if (!response.ok) return { ok: false, reason: 'read_failed' };
    return validateJobPhotoBytes(await response.arrayBuffer());
  } catch {
    return { ok: false, reason: 'read_failed' };
  }
}

export function buildJobPhotoPrefix(clientId: string, jobId: string): string {
  assertCanonicalUuid(clientId, 'clientId');
  assertCanonicalUuid(jobId, 'jobId');
  return `${clientId}/${jobId}`;
}

export function buildJobPhotoPath(clientId: string, jobId: string, slot: JobPhotoSlot): string {
  if (!isJobPhotoSlot(slot)) throw new JobPhotoError('invalid photo slot', 'invalid_slot');
  return `${buildJobPhotoPrefix(clientId, jobId)}/${slot}`;
}

export function sanitizeJobPhotoError(error: unknown): SanitizedJobPhotoError {
  const record = asRecord(error);
  const status = typeof record?.status === 'number' && Number.isInteger(record.status) ? record.status : undefined;
  let category: SanitizedJobPhotoError['category'] = 'unknown';
  if (status === 401 || status === 403) category = 'authorization';
  else if (status === 409) category = 'conflict';
  else if (status === 429) category = 'rate_limited';
  else if (status !== undefined && status >= 500 && status <= 599) category = 'service_unavailable';
  else if (status !== undefined) category = 'storage_error';
  return status === undefined ? { category } : { category, status };
}

export function logJobPhotoFailure(stage: 'upload' | 'reconcile' | 'list' | 'signed_url', error: unknown): void {
  console.error(`[job-photo] ${stage}`, sanitizeJobPhotoError(error));
}

async function listCanonicalSlots(clientId: string, jobId: string): Promise<{
  slots: JobPhotoSlot[];
  error: unknown | null;
}> {
  const prefix = buildJobPhotoPrefix(clientId, jobId);
  const listed = await supabase.storage.from(JOB_PHOTOS_BUCKET).list(prefix, {
    limit: 100,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (listed.error) return { slots: [], error: listed.error };
  const slots = (listed.data ?? [])
    .map((object) => slotFromObjectName(object.name))
    .filter((slot): slot is JobPhotoSlot => slot !== null);
  return { slots: [...new Set(slots)].sort((a, b) => a - b), error: null };
}

export async function uploadJobPhotos(input: {
  clientId: string;
  jobId: string;
  images: readonly ValidatedJobPhoto[];
}): Promise<JobPhotoUploadResult> {
  buildJobPhotoPrefix(input.clientId, input.jobId);
  if (!validateJobPhotoCount(input.images.length).ok) {
    throw new JobPhotoError('invalid photo count', 'invalid_count');
  }

  const results: JobPhotoUploadSlotResult[] = [];
  for (let index = 0; index < input.images.length; index += 1) {
    const slot = (index + 1) as JobPhotoSlot;
    const image = input.images[index];
    if (image === undefined) continue;
    const checked = validateJobPhotoBytes(image.bytes);
    if (!checked.ok) {
      results.push({
        slot,
        path: buildJobPhotoPath(input.clientId, input.jobId, slot),
        mime: image.mime,
        status: 'failed',
        error: { category: 'storage_error' },
      });
      continue;
    }

    const path = buildJobPhotoPath(input.clientId, input.jobId, slot);
    const uploaded = await supabase.storage.from(JOB_PHOTOS_BUCKET).upload(path, checked.image.bytes, {
      contentType: checked.image.mime,
      upsert: false,
    });
    if (!uploaded.error) {
      results.push({ slot, path, mime: checked.image.mime, status: 'uploaded' });
      continue;
    }

    // A duplicate response or a lost/ambiguous response is resolved from fresh
    // authoritative Storage state before this caller decides whether to retry.
    const reconciled = await listCanonicalSlots(input.clientId, input.jobId);
    if (reconciled.error === null && reconciled.slots.includes(slot)) {
      results.push({ slot, path, mime: checked.image.mime, status: 'already_present' });
      continue;
    }
    const error = reconciled.error ?? uploaded.error;
    logJobPhotoFailure(reconciled.error === null ? 'upload' : 'reconcile', error);
    results.push({ slot, path, mime: checked.image.mime, status: 'failed', error: sanitizeJobPhotoError(error) });
  }

  const successfulCount = results.filter((result) => result.status !== 'failed').length;
  const failedCount = results.length - successfulCount;
  const outcome = failedCount === 0 ? 'all' : successfulCount === 0 ? 'none' : 'partial';
  return { outcome, requestedCount: input.images.length, successfulCount, failedCount, slots: results };
}

/**
 * Retries explicit missing slots without remapping draft order or overwriting an
 * existing object. Each slot is freshly listed before upload, and any failed
 * upload response is listed again before being reported as a failure.
 */
export async function retryMissingJobPhotos(input: {
  clientId: string;
  jobId: string;
  retries: readonly JobPhotoRetry[];
}): Promise<JobPhotoUploadResult> {
  buildJobPhotoPrefix(input.clientId, input.jobId);
  if (!validateJobPhotoCount(input.retries.length).ok) {
    throw new JobPhotoError('invalid photo retry count', 'invalid_count');
  }
  const seen = new Set<JobPhotoSlot>();
  for (const retry of input.retries) {
    if (!isJobPhotoSlot(retry.slot) || seen.has(retry.slot)) {
      throw new JobPhotoError('invalid photo retry slot', 'invalid_slot');
    }
    seen.add(retry.slot);
  }

  const results: JobPhotoUploadSlotResult[] = [];
  for (const retry of input.retries) {
    const path = buildJobPhotoPath(input.clientId, input.jobId, retry.slot);
    const checked = validateJobPhotoBytes(retry.image.bytes);
    if (!checked.ok) {
      results.push({
        slot: retry.slot,
        path,
        mime: retry.image.mime,
        status: 'failed',
        error: { category: 'storage_error' },
      });
      continue;
    }

    const before = await listCanonicalSlots(input.clientId, input.jobId);
    if (before.error) {
      logJobPhotoFailure('reconcile', before.error);
      results.push({
        slot: retry.slot,
        path,
        mime: checked.image.mime,
        status: 'failed',
        error: sanitizeJobPhotoError(before.error),
      });
      continue;
    }
    if (before.slots.includes(retry.slot)) {
      results.push({ slot: retry.slot, path, mime: checked.image.mime, status: 'already_present' });
      continue;
    }

    const uploaded = await supabase.storage.from(JOB_PHOTOS_BUCKET).upload(path, checked.image.bytes, {
      contentType: checked.image.mime,
      upsert: false,
    });
    if (!uploaded.error) {
      results.push({ slot: retry.slot, path, mime: checked.image.mime, status: 'uploaded' });
      continue;
    }

    const after = await listCanonicalSlots(input.clientId, input.jobId);
    if (after.error === null && after.slots.includes(retry.slot)) {
      results.push({ slot: retry.slot, path, mime: checked.image.mime, status: 'already_present' });
      continue;
    }
    const error = after.error ?? uploaded.error;
    logJobPhotoFailure(after.error === null ? 'upload' : 'reconcile', error);
    results.push({
      slot: retry.slot,
      path,
      mime: checked.image.mime,
      status: 'failed',
      error: sanitizeJobPhotoError(error),
    });
  }

  const successfulCount = results.filter((result) => result.status !== 'failed').length;
  const failedCount = results.length - successfulCount;
  const outcome = failedCount === 0 ? 'all' : successfulCount === 0 ? 'none' : 'partial';
  return { outcome, requestedCount: input.retries.length, successfulCount, failedCount, slots: results };
}

export async function listJobPhotos(input: {
  clientId: string;
  jobId: string;
}): Promise<SignedJobPhoto[]> {
  const listed = await listCanonicalSlots(input.clientId, input.jobId);
  if (listed.error) {
    logJobPhotoFailure('list', listed.error);
    throw new JobPhotoError('job photos could not be loaded', 'list_failed');
  }
  if (listed.slots.length === 0) return [];

  const paths = listed.slots.map((slot) => buildJobPhotoPath(input.clientId, input.jobId, slot));
  const signed = await supabase.storage
    .from(JOB_PHOTOS_BUCKET)
    .createSignedUrls(paths, JOB_PHOTO_SIGNED_URL_TTL_SECONDS);
  if (signed.error || !Array.isArray(signed.data)) {
    logJobPhotoFailure('signed_url', signed.error ?? { message: 'signed URL response missing' });
    throw new JobPhotoError('job photos could not be loaded', 'signed_url_failed');
  }

  const expected = new Map(paths.map((path, index) => [path, listed.slots[index]] as const));
  return signed.data.flatMap((row) => {
    const path = typeof row.path === 'string' ? row.path : null;
    const slot = path === null ? undefined : expected.get(path);
    if (
      path === null ||
      slot === undefined ||
      typeof row.signedUrl !== 'string' ||
      row.signedUrl === '' ||
      row.error != null
    ) {
      return [];
    }
    return [{ slot, path, signedUrl: row.signedUrl }];
  });
}

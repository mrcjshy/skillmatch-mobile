/**
 * R5D-IMG-M1C — Worker portfolio image helpers.
 *
 * Presentation-only. Paths use worker_profiles.id, never users.id.
 * Magic bytes decide MIME. Picker metadata is not authoritative.
 * Image IDs come from Expo Crypto, not the global Web Crypto API.
 */

import * as Crypto from 'expo-crypto';

export const MAX_PORTFOLIO_IMAGES = 5;
export const MAX_PORTFOLIO_IMAGE_BYTES = 5242880;
export const PORTFOLIO_BUCKET = 'portfolio';
export const PORTFOLIO_SIGNED_URL_EXPIRES_IN = 3600;

export type PortfolioImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type PortfolioImageExt = 'jpg' | 'png' | 'webp';

export type ImageCountResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'too_many' };

export type ImageBytesResult =
  | { ok: true; mime: PortfolioImageMime; ext: PortfolioImageExt; byteLength: number }
  | { ok: false; reason: 'empty' | 'too_large' | 'unsupported_type' };

export type ValidatedImageBytes = {
  bytes: ArrayBuffer;
  mime: PortfolioImageMime;
  ext: PortfolioImageExt;
  byteLength: number;
};

export type PortfolioImageMetadataInsert = {
  id: string;
  portfolio_item_id: string;
  storage_path: string;
  position: number;
};

export class PortfolioImageError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'PortfolioImageError';
    this.code = code;
  }
}

export type PortfolioImageStage =
  | 'item_insert'
  | 'image_id'
  | 'storage_upload'
  | 'metadata_insert'
  | 'cleanup_storage'
  | 'cleanup_parent'
  | 'authoritative_reload'
  | 'signed_url';

export type SanitizedPortfolioImageError = {
  message?: string;
  status?: number;
  statusCode?: string;
  name?: string;
  code?: string | null;
};

const SECRET_FIELD = /authorization|access.?token|refresh.?token|anon.?key|password|api.?key|bearer|service.?role/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function safeText(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  if (SECRET_FIELD.test(value)) return undefined;
  return value;
}

export function sanitizePortfolioImageError(error: unknown): SanitizedPortfolioImageError {
  const rec = asRecord(error);
  const sanitized: SanitizedPortfolioImageError = {};
  const message = safeText(rec?.message) ?? safeText(error instanceof Error ? error.message : undefined);
  if (message !== undefined) sanitized.message = message;

  const statusRaw = rec?.status;
  if (typeof statusRaw === 'number' && Number.isFinite(statusRaw)) sanitized.status = statusRaw;

  const statusCode = safeText(rec?.statusCode) ?? (typeof rec?.status === 'string' ? safeText(rec.status) : undefined);
  if (statusCode !== undefined) sanitized.statusCode = statusCode;

  const name =
    safeText(typeof rec?.error === 'string' ? rec.error : undefined) ??
    safeText(rec?.name) ??
    (error instanceof Error ? safeText(error.name) : undefined);
  if (name !== undefined) sanitized.name = name;

  if (rec !== null && 'code' in rec) {
    if (rec.code === null) sanitized.code = null;
    else {
      const code = safeText(rec.code);
      if (code !== undefined) sanitized.code = code;
    }
  }
  return sanitized;
}

export function logPortfolioImageFailure(stage: PortfolioImageStage, error: unknown): void {
  console.error(`[portfolio-image] ${stage}`, sanitizePortfolioImageError(error));
}

const JPEG_SIG = [0xff, 0xd8, 0xff] as const;
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47] as const;
const RIFF_SIG = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIG = [0x57, 0x45, 0x42, 0x50] as const;

function asBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function remainingPortfolioImageSlots(currentCount: number): number {
  if (currentCount >= MAX_PORTFOLIO_IMAGES) return 0;
  if (currentCount <= 0) return MAX_PORTFOLIO_IMAGES;
  return MAX_PORTFOLIO_IMAGES - currentCount;
}

export function validateImageCount(count: number): ImageCountResult {
  if (count < 0 || count > MAX_PORTFOLIO_IMAGES || !Number.isInteger(count)) {
    return { ok: false, reason: 'too_many' };
  }
  return { ok: true, count };
}

export function detectImageMime(input: ArrayBuffer | Uint8Array): PortfolioImageMime | null {
  const bytes = asBytes(input);
  if (startsWith(bytes, JPEG_SIG)) return 'image/jpeg';
  if (startsWith(bytes, PNG_SIG)) return 'image/png';
  if (startsWith(bytes, RIFF_SIG) && startsWith(bytes, WEBP_SIG, 8)) return 'image/webp';
  return null;
}

export function extensionForMime(mime: PortfolioImageMime): PortfolioImageExt {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return 'webp';
}

export function validateImageBytes(input: ArrayBuffer | Uint8Array): ImageBytesResult {
  const bytes = asBytes(input);
  if (bytes.byteLength === 0) return { ok: false, reason: 'empty' };
  if (bytes.byteLength > MAX_PORTFOLIO_IMAGE_BYTES) return { ok: false, reason: 'too_large' };
  const mime = detectImageMime(bytes);
  if (mime === null) return { ok: false, reason: 'unsupported_type' };
  return { ok: true, mime, ext: extensionForMime(mime), byteLength: bytes.byteLength };
}

export async function readLocalImageBytes(uri: string): Promise<ArrayBuffer> {
  if (typeof uri !== 'string' || uri === '') {
    throw new PortfolioImageError('image read failed', 'read_failed');
  }
  let response: Response;
  try {
    response = await fetch(uri);
  } catch {
    throw new PortfolioImageError('image read failed', 'read_failed');
  }
  if (!response.ok) {
    throw new PortfolioImageError('image read failed', 'read_failed');
  }
  try {
    return await response.arrayBuffer();
  } catch {
    throw new PortfolioImageError('image read failed', 'read_failed');
  }
}

export async function loadValidatedLocalImage(uri: string): Promise<
  | { ok: true; image: ValidatedImageBytes }
  | { ok: false; reason: 'read_failed' | 'empty' | 'too_large' | 'unsupported_type' }
> {
  let bytes: ArrayBuffer;
  try {
    bytes = await readLocalImageBytes(uri);
  } catch {
    return { ok: false, reason: 'read_failed' };
  }
  const checked = validateImageBytes(bytes);
  if (!checked.ok) return { ok: false, reason: checked.reason };
  return {
    ok: true,
    image: {
      bytes,
      mime: checked.mime,
      ext: checked.ext,
      byteLength: checked.byteLength,
    },
  };
}

export function buildPortfolioStoragePath(input: {
  workerProfileId: string;
  portfolioItemId: string;
  imageId: string;
  ext: PortfolioImageExt;
}): string {
  if (
    input.workerProfileId === '' ||
    input.portfolioItemId === '' ||
    input.imageId === '' ||
    input.workerProfileId.includes('/') ||
    input.portfolioItemId.includes('/') ||
    input.imageId.includes('/') ||
    input.imageId.includes('.')
  ) {
    throw new PortfolioImageError('invalid storage path', 'invalid_path');
  }
  return `${input.workerProfileId}/${input.portfolioItemId}/${input.imageId}.${input.ext}`;
}

export function buildImageMetadataRows(input: {
  workerProfileId: string;
  portfolioItemId: string;
  images: readonly { id: string; ext: PortfolioImageExt }[];
}): PortfolioImageMetadataInsert[] {
  const counted = validateImageCount(input.images.length);
  if (!counted.ok) {
    throw new PortfolioImageError('too many images', 'too_many');
  }
  return input.images.map((image, index) => ({
    id: image.id,
    portfolio_item_id: input.portfolioItemId,
    storage_path: buildPortfolioStoragePath({
      workerProfileId: input.workerProfileId,
      portfolioItemId: input.portfolioItemId,
      imageId: image.id,
      ext: image.ext,
    }),
    position: index + 1,
  }));
}

export function assertExactObjectPath(path: string): string {
  const parts = path.split('/');
  if (parts.length !== 3 || parts.some((part) => part === '' || part.includes('*'))) {
    throw new PortfolioImageError('cleanup requires an exact object path', 'invalid_path');
  }
  const filename = parts[2] ?? '';
  if (!filename.includes('.') || filename.endsWith('.')) {
    throw new PortfolioImageError('cleanup requires an exact object path', 'invalid_path');
  }
  return path;
}

export function recordExactUploadedPath(uploadedPaths: readonly string[], path: string): string[] {
  return [...uploadedPaths, assertExactObjectPath(path)];
}

export function exactObjectCleanupPaths(uploadedPaths: readonly string[]): string[] {
  return uploadedPaths.map(assertExactObjectPath);
}

export function newPortfolioImageId(): string {
  try {
    const id = Crypto.randomUUID();
    if (typeof id !== 'string' || id === '') {
      throw new PortfolioImageError('image id generation unavailable', 'uuid_unavailable');
    }
    return id;
  } catch (error) {
    if (error instanceof PortfolioImageError) throw error;
    throw new PortfolioImageError('image id generation unavailable', 'uuid_unavailable');
  }
}

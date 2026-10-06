import { fromByteArray, toByteArray } from 'base64-js';

export type AiImageInput = { mime_type: 'image/png'; data: string };

export type AiImageRef = { width: number; height: number; scale?: number; release?(): void };
export type AiImageNative = {
  cacheRoot: string;
  createKey(): string;
  sourceSize(uri: string): Promise<number>;
  decode(uri: string): Promise<AiImageRef>;
  write(image: AiImageRef, key: string): Promise<void>;
  lookup(key: string): Promise<string | null>;
  read(path: string, maxBytes: number): Promise<Uint8Array>;
  remove(path: string): Promise<boolean>;
};
export type PrepareAiImageInputResult =
  | { ok: true; image: AiImageInput }
  | { ok: false; reason: 'invalidated' | 'image_unavailable' };
export async function prepareAiImageInput(input: {
  selectedPhoto: { uri: string } | null;
  draftPhotos: readonly { uri: string }[];
  isCurrent(): boolean;
}, native?: AiImageNative): Promise<PrepareAiImageInputResult> {
  const unavailable = { ok: false, reason: 'image_unavailable' } as const;
  const photo = input.selectedPhoto;
  if (photo === null || !input.draftPhotos.includes(photo) ||
      !/^(file:\/\/\/|content:\/\/).+/.test(photo.uri) || photo.uri.length > 4096 || /[\x00-\x1f]/.test(photo.uri)) return unavailable;
  const sourceUri = photo.uri;
  const invalidated = { ok: false, reason: 'invalidated' } as const;
  let revoked = false;
  function current(): boolean {
    if (revoked) return false;
    try {
      if (photo !== null && photo.uri === sourceUri && input.draftPhotos.includes(photo) && input.isCurrent() === true) return true;
    } catch { /* unresolvable authority is permanently invalidated */ }
    revoked = true;
    return false;
  }
  function assertCurrent() { if (!current()) throw invalidated; }
  if (!current()) return invalidated;
  try { native ??= await defaultNative(); } catch { return current() ? unavailable : invalidated; }
  if (!current()) return invalidated;
  const cacheRoot = localCacheUri(native.cacheRoot);
  if (cacheRoot === null) return unavailable;
  let ref: AiImageRef | null = null;
  let path: string | null = null;
  let key: string | null = null;
  let attemptedWrite = false;
  let cleanupOk = true;
  let result: PrepareAiImageInputResult = unavailable;
  const ownedPath = (candidate: string | null): string | null => {
    if (candidate === null) return null;
    const canonical = localCacheUri(candidate);
    if (canonical === null || canonical === localCacheUri(sourceUri) ||
        !canonical.startsWith(`${cacheRoot.replace(/\/$/, '')}/`)) return null;
    return canonical;
  };
  try {
    assertCurrent();
    const size = await native.sourceSize(sourceUri);
    assertCurrent();
    if (!Number.isSafeInteger(size) || size < 1 || size > 5242880) return unavailable;
    const { loadValidatedJobPhoto } = await import('./job-photos');
    assertCurrent();
    const source = await loadValidatedJobPhoto(sourceUri);
    assertCurrent();
    if (!source.ok) return unavailable;
    assertCurrent(); key = native.createKey(); assertCurrent();
    if (!/^skillmatch-ai-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)) return unavailable;
    const preflightPath = await native.lookup(key);
    assertCurrent();
    if (preflightPath !== null) return unavailable;
    ref = await native.decode(sourceUri);
    assertCurrent();
    const scale = ref.scale ?? 1; // Injected boundary may omit scale; native ImageRef exposes it.
    const pixelWidth = ref.width * scale;
    const pixelHeight = ref.height * scale;
    if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(ref.width) || !Number.isFinite(ref.height) ||
        ref.width <= 0 || ref.height <= 0 || !Number.isFinite(pixelWidth) || !Number.isFinite(pixelHeight) ||
        pixelWidth < 1 - 1e-6 || pixelHeight < 1 - 1e-6 ||
        pixelWidth > MAX_AI_PNG_DIMENSION + 1e-6 || pixelHeight > MAX_AI_PNG_DIMENSION + 1e-6) return unavailable;
    attemptedWrite = true;
    await native.write(ref, key);
    assertCurrent();
    path = ownedPath(await native.lookup(key));
    assertCurrent();
    if (path === null) return unavailable;
    const cleaned = sanitizeAiPng(await native.read(path, MAX_AI_PNG_BYTES));
    assertCurrent();
    if (cleaned !== null) result = { ok: true, image: { mime_type: 'image/png', data: fromByteArray(cleaned) } };
  } catch { result = current() ? unavailable : invalidated; }
  finally {
    if (attemptedWrite && key !== null) {
      if (path === null) {
        try { path = ownedPath(await native.lookup(key)); } catch { /* unknown artifact holds the request */ }
      }
      cleanupOk = path !== null && await native.remove(path).catch(() => false);
    }
    try { ref?.release?.(); } catch { /* best effort native memory release */ }
  }
  return !cleanupOk ? unavailable : current() ? result : invalidated;
}

async function defaultNative(): Promise<AiImageNative> {
  const [{ Image }, { File, Paths, FileMode }, { randomUUID }] = await Promise.all([
    import('expo-image'), import('expo-file-system'), import('expo-crypto'),
  ]);
  if (typeof Image.loadAsync !== 'function' || typeof Image.writeToCacheAsync !== 'function' ||
      typeof Image.getCachePathAsync !== 'function') throw new Error('Image preparation unavailable.');
  return {
    cacheRoot: Paths.cache.uri,
    createKey: () => `skillmatch-ai-${randomUUID()}`,
    async sourceSize(uri) { const file = new File(uri); return file.exists ? file.size : 0; },
    decode: (uri) => Image.loadAsync({ uri }, { maxWidth: MAX_AI_PNG_DIMENSION, maxHeight: MAX_AI_PNG_DIMENSION }),
    write: (ref, key) => Image.writeToCacheAsync(ref as Awaited<ReturnType<typeof Image.loadAsync>>, key),
    lookup: (key) => Image.getCachePathAsync(key),
    async read(path, maxBytes) {
      const file = new File(path);
      if (!file.exists || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > maxBytes) {
        throw new Error('Image preparation unavailable.');
      }
      const handle = file.open(FileMode.ReadOnly);
      try {
        const bytes = handle.readBytes(maxBytes + 1);
        if (bytes.length > maxBytes) throw new Error('Image preparation unavailable.');
        return bytes;
      } finally { handle.close(); }
    },
    async remove(path) {
      const file = new File(path);
      if (file.exists) file.delete();
      return !file.exists;
    },
  };
}

function localCacheUri(value: string): string | null {
  const uri = value.startsWith('/') ? `file://${value}` : value;
  if (!uri.startsWith('file:///') || /[\\?#\x00-\x1f]/.test(uri)) return null;
  try {
    const decoded = decodeURIComponent(uri);
    if (decoded.includes('%') || decoded.split('/').some((part) => part === '.' || part === '..') ||
        /[\\?#\x00-\x1f]/.test(decoded)) return null;
    return decoded;
  } catch { return null; }
}

export function validateAiImageInput(value: unknown): AiImageInput | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const image = value as Record<string, unknown>;
  if (Object.keys(image).length !== 2 || image.mime_type !== 'image/png' ||
      typeof image.data !== 'string' || image.data.length === 0 || image.data.length > 699052 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data)) return null;
  try {
    const bytes = toByteArray(image.data);
    if (fromByteArray(bytes) !== image.data) return null;
    const cleaned = sanitizeAiPng(bytes);
    if (cleaned === null || cleaned.length !== bytes.length) return null;
    return { mime_type: 'image/png', data: image.data };
  } catch { return null; }
}

export const MAX_AI_PNG_BYTES = 524288;
export const MAX_AI_PNG_DIMENSION = 320;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function sanitizeAiPng(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8 || bytes.length > MAX_AI_PNG_BYTES ||
      !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let header = false;
  let dataBytes = 0;
  let dataChunks = 0;
  let dataEnded = false;
  let ended = false;
  for (; offset < bytes.length;) {
    if (offset + 12 > bytes.length) return null;
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return null;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[a-zA-Z]{2}[A-Z][a-zA-Z]$/.test(type) ||
        crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) return null;
    if (type === 'IHDR') {
      if (header || offset !== 8 || length !== 13) return null;
      const width = view.getUint32(offset + 8);
      const height = view.getUint32(offset + 12);
      if (width < 1 || height < 1 || width > MAX_AI_PNG_DIMENSION || height > MAX_AI_PNG_DIMENSION ||
          bytes[offset + 16] !== 8 || ![0, 2, 4, 6].includes(bytes[offset + 17]) ||
          bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0) return null;
      header = true;
    } else if (type === 'IDAT') {
      dataChunks += 1;
      if (!header || dataEnded || dataChunks > 64 || length === 0) return null;
      dataBytes += length;
    } else if (type === 'IEND') {
      if (!header || dataBytes < 6 || length !== 0 || end !== bytes.length) return null;
      ended = true;
    } else {
      if (!header || type[0] === type[0].toUpperCase()) return null;
      if (dataChunks > 0) dataEnded = true;
    }
    if (['IHDR', 'IDAT', 'IEND'].includes(type)) parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  if (!ended) return null;
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { output.set(part, at); at += part.length; }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  JOB_PHOTOS_BUCKET,
  JOB_PHOTO_MIME_TYPES,
  JOB_PHOTO_SIGNED_URL_TTL_SECONDS,
  MAX_JOB_PHOTOS,
  MAX_JOB_PHOTO_BYTES,
  buildJobPhotoPath,
  buildJobPhotoPrefix,
  detectJobPhotoMime,
  listJobPhotos,
  loadValidatedJobPhoto,
  logJobPhotoFailure,
  retryMissingJobPhotos,
  sanitizeJobPhotoError,
  uploadJobPhotos,
  validateJobPhotoBytes,
  validateJobPhotoCount,
  type ValidatedJobPhoto,
} from './job-photos';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({
  supabase: {
    storage: { from: vi.fn() },
  },
}));

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const PREFIX = `${CLIENT_ID}/${JOB_ID}`;
const storageFrom = vi.mocked(supabase.storage.from);

function jpegBytes(length = 16): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0xff, 0xd8, 0xff]);
  return bytes;
}

function pngBytes(length = 16): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function webpBytes(length = 16): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  return bytes;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function validated(bytes: Uint8Array): ValidatedJobPhoto {
  const result = validateJobPhotoBytes(bytes);
  if (!result.ok) throw new Error('test image did not validate');
  return result.image;
}

function storageApi(input: {
  upload?: ReturnType<typeof vi.fn>;
  list?: ReturnType<typeof vi.fn>;
  createSignedUrls?: ReturnType<typeof vi.fn>;
} = {}) {
  const upload = input.upload ?? vi.fn(async () => ({ data: { path: '' }, error: null }));
  const list = input.list ?? vi.fn(async () => ({ data: [], error: null }));
  const createSignedUrls = input.createSignedUrls ??
    vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null })),
      error: null,
    }));
  const getPublicUrl = vi.fn();
  storageFrom.mockReturnValue({ upload, list, createSignedUrls, getPublicUrl } as never);
  return { upload, list, createSignedUrls, getPublicUrl };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('V4-9 Job photo contract constants', () => {
  it('owns the exact private bucket client contract', () => {
    expect(JOB_PHOTOS_BUCKET).toBe('job-photos');
    expect(MAX_JOB_PHOTOS).toBe(3);
    expect(MAX_JOB_PHOTO_BYTES).toBe(5242880);
    expect(JOB_PHOTO_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(JOB_PHOTO_SIGNED_URL_TTL_SECONDS).toBe(60);
  });

  it('accepts zero through three photos and rejects four', () => {
    expect(validateJobPhotoCount(0)).toEqual({ ok: true, count: 0 });
    expect(validateJobPhotoCount(3)).toEqual({ ok: true, count: 3 });
    expect(validateJobPhotoCount(4)).toEqual({ ok: false, reason: 'invalid_count' });
  });
});

describe('canonical extensionless paths', () => {
  it('builds only slots 1, 2, and 3 under the canonical prefix', () => {
    expect(buildJobPhotoPrefix(CLIENT_ID, JOB_ID)).toBe(PREFIX);
    expect(buildJobPhotoPath(CLIENT_ID, JOB_ID, 1)).toBe(`${PREFIX}/1`);
    expect(buildJobPhotoPath(CLIENT_ID, JOB_ID, 2)).toBe(`${PREFIX}/2`);
    expect(buildJobPhotoPath(CLIENT_ID, JOB_ID, 3)).toBe(`${PREFIX}/3`);
    expect(buildJobPhotoPath(CLIENT_ID, JOB_ID, 1)).not.toContain('.');
  });

  it('rejects noncanonical, uppercase, slash-injected, and extension-bearing UUID input', () => {
    const letteredClientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(() => buildJobPhotoPrefix('NOT-A-UUID', JOB_ID)).toThrow(/invalid clientId/);
    expect(() => buildJobPhotoPrefix(letteredClientId.toUpperCase(), JOB_ID)).toThrow(/invalid clientId/);
    expect(() => buildJobPhotoPrefix(`${CLIENT_ID}/other`, JOB_ID)).toThrow(/invalid clientId/);
    expect(() => buildJobPhotoPrefix(CLIENT_ID, `${JOB_ID}.jpg`)).toThrow(/invalid jobId/);
  });

  it('rejects runtime slot bypasses 0 and 4', () => {
    expect(() => buildJobPhotoPath(CLIENT_ID, JOB_ID, 0 as 1)).toThrow(/invalid photo slot/);
    expect(() => buildJobPhotoPath(CLIENT_ID, JOB_ID, 4 as 1)).toThrow(/invalid photo slot/);
  });
});

describe('byte-authoritative validation', () => {
  it('detects JPEG, PNG, and WebP signatures', () => {
    expect(detectJobPhotoMime(jpegBytes())).toBe('image/jpeg');
    expect(detectJobPhotoMime(pngBytes())).toBe('image/png');
    expect(detectJobPhotoMime(webpBytes())).toBe('image/webp');
  });

  it('requires the complete canonical eight-byte PNG signature', () => {
    expect(detectJobPhotoMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(detectJobPhotoMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a]))).toBeNull();
    expect(detectJobPhotoMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull();
    expect(validateJobPhotoBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
  });

  it('rejects empty, disguised, and unsupported bytes', () => {
    expect(validateJobPhotoBytes(new Uint8Array())).toEqual({ ok: false, reason: 'empty' });
    expect(validateJobPhotoBytes(Uint8Array.from([0x25, 0x50, 0x44, 0x46]))).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
    expect(validateJobPhotoBytes(Uint8Array.from([0x47, 0x49, 0x46, 0x38]))).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
  });

  it('accepts exactly 5 MiB and rejects more than 5 MiB', () => {
    expect(validateJobPhotoBytes(jpegBytes(MAX_JOB_PHOTO_BYTES))).toMatchObject({
      ok: true,
      image: { mime: 'image/jpeg', byteLength: MAX_JOB_PHOTO_BYTES },
    });
    expect(validateJobPhotoBytes(jpegBytes(MAX_JOB_PHOTO_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('loads local bytes and ignores picker-declared metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => arrayBuffer(webpBytes()) })));
    await expect(loadValidatedJobPhoto('file:///picked/photo.jpg')).resolves.toMatchObject({
      ok: true,
      image: { mime: 'image/webp' },
    });
  });
});

describe('immutable uploads and reconciliation', () => {
  it('uploads ordered images to deterministic slots with detected MIME and upsert false', async () => {
    const api = storageApi();
    const result = await uploadJobPhotos({
      clientId: CLIENT_ID,
      jobId: JOB_ID,
      images: [validated(jpegBytes()), validated(pngBytes()), validated(webpBytes())],
    });
    expect(api.upload.mock.calls.map((call) => call[0])).toEqual([`${PREFIX}/1`, `${PREFIX}/2`, `${PREFIX}/3`]);
    expect(api.upload.mock.calls.map((call) => call[2])).toEqual([
      { contentType: 'image/jpeg', upsert: false },
      { contentType: 'image/png', upsert: false },
      { contentType: 'image/webp', upsert: false },
    ]);
    expect(result).toMatchObject({ outcome: 'all', requestedCount: 3, successfulCount: 3, failedCount: 0 });
  });

  it('uses byte-detected MIME even if a caller supplies conflicting picker metadata', async () => {
    const api = storageApi();
    const actualJpeg = validated(jpegBytes());
    await uploadJobPhotos({
      clientId: CLIENT_ID,
      jobId: JOB_ID,
      images: [{ ...actualJpeg, mime: 'image/png' }],
    });
    expect(api.upload).toHaveBeenCalledWith(`${PREFIX}/1`, expect.any(ArrayBuffer), {
      contentType: 'image/jpeg',
      upsert: false,
    });
  });

  it('allows zero images without any Storage call', async () => {
    const result = await uploadJobPhotos({ clientId: CLIENT_ID, jobId: JOB_ID, images: [] });
    expect(storageFrom).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'all', requestedCount: 0, successfulCount: 0, failedCount: 0, slots: [] });
  });

  it('rejects four images before any upload', async () => {
    const photo = validated(jpegBytes());
    await expect(
      uploadJobPhotos({ clientId: CLIENT_ID, jobId: JOB_ID, images: [photo, photo, photo, photo] })
    ).rejects.toMatchObject({ code: 'invalid_count' });
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('returns a structured partial result and does not retry failed upload', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ data: { path: `${PREFIX}/1` }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'network response unavailable', status: 503 } })
      .mockResolvedValueOnce({ data: { path: `${PREFIX}/3` }, error: null });
    const list = vi.fn(async () => ({ data: [{ name: '1' }], error: null }));
    const api = storageApi({ upload, list });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await uploadJobPhotos({
      clientId: CLIENT_ID,
      jobId: JOB_ID,
      images: [validated(jpegBytes()), validated(pngBytes()), validated(webpBytes())],
    });
    expect(result).toMatchObject({ outcome: 'partial', successfulCount: 2, failedCount: 1 });
    expect(result.slots[1]).toMatchObject({ slot: 2, status: 'failed' });
    expect(api.upload).toHaveBeenCalledTimes(3);
    expect(api.list).toHaveBeenCalledWith(PREFIX, expect.any(Object));
  });

  it('distinguishes a none-uploaded result after authoritative reconciliation', async () => {
    const upload = vi.fn(async () => ({ data: null, error: { message: 'upload unavailable', status: 503 } }));
    const list = vi.fn(async () => ({ data: [], error: null }));
    storageApi({ upload, list });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await uploadJobPhotos({
      clientId: CLIENT_ID,
      jobId: JOB_ID,
      images: [validated(jpegBytes()), validated(pngBytes())],
    });
    expect(result).toMatchObject({ outcome: 'none', requestedCount: 2, successfulCount: 0, failedCount: 2 });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('treats a canonical slot found by fresh listing as authoritative success', async () => {
    const upload = vi.fn(async () => ({ data: null, error: { message: 'duplicate' } }));
    const list = vi.fn(async () => ({ data: [{ name: '1' }, { name: '1.jpg' }, { name: '4' }], error: null }));
    storageApi({ upload, list });
    const result = await uploadJobPhotos({
      clientId: CLIENT_ID,
      jobId: JOB_ID,
      images: [validated(jpegBytes())],
    });
    expect(result.slots).toEqual([
      { slot: 1, path: `${PREFIX}/1`, mime: 'image/jpeg', status: 'already_present' },
    ]);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('explicit missing-slot retries', () => {
  it('checks each explicit slot and uploads only absent slot 3 without remapping or overwriting slot 2', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ name: '1' }, { name: '2' }], error: null })
      .mockResolvedValueOnce({ data: [{ name: '1' }, { name: '2' }], error: null });
    const api = storageApi({ list });
    const result = await retryMissingJobPhotos({
      clientId: CLIENT_ID,
      jobId: JOB_ID,
      retries: [
        { slot: 2, image: validated(pngBytes()) },
        { slot: 3, image: validated(webpBytes()) },
      ],
    });
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenCalledWith(`${PREFIX}/3`, expect.any(ArrayBuffer), {
      contentType: 'image/webp',
      upsert: false,
    });
    expect(result.slots).toEqual([
      { slot: 2, path: `${PREFIX}/2`, mime: 'image/png', status: 'already_present' },
      { slot: 3, path: `${PREFIX}/3`, mime: 'image/webp', status: 'uploaded' },
    ]);
  });

  it('reconciles an ambiguous slot 2 upload and never sends an overwrite', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ name: '1' }], error: null })
      .mockResolvedValueOnce({ data: [{ name: '1' }, { name: '2' }], error: null });
    const upload = vi.fn(async () => ({ data: null, error: { status: 503, message: 'opaque failure' } }));
    storageApi({ list, upload });
    const result = await retryMissingJobPhotos({
      clientId: CLIENT_ID,
      jobId: JOB_ID,
      retries: [{ slot: 2, image: validated(jpegBytes()) }],
    });
    expect(upload).toHaveBeenCalledWith(`${PREFIX}/2`, expect.any(ArrayBuffer), {
      contentType: 'image/jpeg',
      upsert: false,
    });
    expect(result.slots[0]).toMatchObject({ slot: 2, status: 'already_present' });
  });

  it('rejects duplicate and noncanonical explicit retry slots before Storage access', async () => {
    const photo = validated(jpegBytes());
    await expect(
      retryMissingJobPhotos({
        clientId: CLIENT_ID,
        jobId: JOB_ID,
        retries: [
          { slot: 2, image: photo },
          { slot: 2, image: photo },
        ],
      })
    ).rejects.toMatchObject({ code: 'invalid_slot' });
    await expect(
      retryMissingJobPhotos({
        clientId: CLIENT_ID,
        jobId: JOB_ID,
        retries: [{ slot: 4 as 1, image: photo }],
      })
    ).rejects.toMatchObject({ code: 'invalid_slot' });
    expect(storageFrom).not.toHaveBeenCalled();
  });
});

describe('authorized private reads', () => {
  it('lists the canonical prefix, excludes unexpected names, and signs exact slots for 60 seconds', async () => {
    const list = vi.fn(async () => ({
      data: [{ name: '3' }, { name: '1.jpg' }, { name: '1' }, { name: '4' }, { name: 'nested' }],
      error: null,
    }));
    const api = storageApi({ list });
    const photos = await listJobPhotos({ clientId: CLIENT_ID, jobId: JOB_ID });
    expect(api.list).toHaveBeenCalledWith(PREFIX, {
      limit: 100,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });
    expect(api.createSignedUrls).toHaveBeenCalledWith([`${PREFIX}/1`, `${PREFIX}/3`], 60);
    expect(photos.map((photo) => photo.slot)).toEqual([1, 3]);
    expect(api.getPublicUrl).not.toHaveBeenCalled();
  });

  it('returns an empty list without creating URLs when no canonical slot exists', async () => {
    const api = storageApi({ list: vi.fn(async () => ({ data: [{ name: '1.jpg' }], error: null })) });
    await expect(listJobPhotos({ clientId: CLIENT_ID, jobId: JOB_ID })).resolves.toEqual([]);
    expect(api.createSignedUrls).not.toHaveBeenCalled();
  });
});

describe('safe Storage errors', () => {
  it('returns only allowlisted structural diagnostics and drops every external string', () => {
    expect(sanitizeJobPhotoError({ message: 'Object exists', status: 409, code: 'Duplicate' })).toEqual({
      category: 'conflict',
      status: 409,
    });
    expect(
      sanitizeJobPhotoError({
        message: 'opaque-sb_secret_5b3f9c',
        statusCode: 'opaque-access-key-value',
        name: 'opaque-refresh-value',
        code: 'opaque-api-key-value',
      })
    ).toEqual({ category: 'unknown' });
  });

  it('logs only the sanitized error shape', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    logJobPhotoFailure('upload', {
      message: 'sb_secret_opaque-value',
      status: 401,
      code: 'access-token-opaque-value',
      error: 'refresh-token-opaque-value',
    });
    expect(logged).toHaveBeenCalledWith('[job-photo] upload', { category: 'authorization', status: 401 });
    expect(JSON.stringify(logged.mock.calls)).not.toContain('opaque-value');
  });
});

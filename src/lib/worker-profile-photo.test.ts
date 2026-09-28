import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_WORKER_PROFILE_PHOTO_BYTES,
  WORKER_PROFILE_PHOTO_BUCKET,
  WORKER_PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS,
  buildWorkerProfilePhotoPath,
  detectWorkerProfilePhotoMime,
  getWorkerProfilePhoto,
  loadValidatedWorkerProfilePhoto,
  logWorkerProfilePhotoFailure,
  removeWorkerProfilePhoto,
  replaceWorkerProfilePhoto,
  sanitizeWorkerProfilePhotoError,
  uploadWorkerProfilePhoto,
  validateWorkerProfilePhotoBytes,
  type ValidatedWorkerProfilePhoto,
} from './worker-profile-photo';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({
  supabase: {
    storage: { from: vi.fn() },
  },
}));

const WORKER_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const PATH = `${WORKER_USER_ID}/avatar`;
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

function validated(bytes: Uint8Array): ValidatedWorkerProfilePhoto {
  const result = validateWorkerProfilePhotoBytes(bytes);
  if (!result.ok) throw new Error('test photo did not validate');
  return result.image;
}

function storageApi(input: {
  upload?: ReturnType<typeof vi.fn>;
  remove?: ReturnType<typeof vi.fn>;
  createSignedUrl?: ReturnType<typeof vi.fn>;
} = {}) {
  const upload = input.upload ?? vi.fn(async () => ({ data: { path: PATH }, error: null }));
  const remove = input.remove ?? vi.fn(async () => ({ data: [{ name: 'avatar' }], error: null }));
  const createSignedUrl = input.createSignedUrl ??
    vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/avatar' }, error: null }));
  const list = vi.fn();
  const getPublicUrl = vi.fn();
  storageFrom.mockReturnValue({ upload, remove, createSignedUrl, list, getPublicUrl } as never);
  return { upload, remove, createSignedUrl, list, getPublicUrl };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FT-02 Worker profile photo contract', () => {
  it('owns the private bucket, size, short-lived URL, and canonical extensionless path', () => {
    expect(WORKER_PROFILE_PHOTO_BUCKET).toBe('worker-profile-photos');
    expect(MAX_WORKER_PROFILE_PHOTO_BYTES).toBe(5242880);
    expect(WORKER_PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS).toBe(60);
    expect(buildWorkerProfilePhotoPath(WORKER_USER_ID)).toBe(PATH);
    expect(buildWorkerProfilePhotoPath(WORKER_USER_ID)).not.toContain('.');
  });

  it('rejects noncanonical or path-injected user IDs', () => {
    const letteredWorkerUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(() => buildWorkerProfilePhotoPath('NOT-A-UUID')).toThrow(/invalid workerUserId/);
    expect(() => buildWorkerProfilePhotoPath(letteredWorkerUserId.toUpperCase())).toThrow(
      /invalid workerUserId/
    );
    expect(() => buildWorkerProfilePhotoPath(`${WORKER_USER_ID}/${OTHER_USER_ID}`)).toThrow(
      /invalid workerUserId/
    );
  });
});

describe('byte-authoritative profile photo validation', () => {
  it('detects JPEG, complete PNG, and WebP signatures with normalized content types', () => {
    expect(detectWorkerProfilePhotoMime(jpegBytes())).toBe('image/jpeg');
    expect(detectWorkerProfilePhotoMime(pngBytes())).toBe('image/png');
    expect(detectWorkerProfilePhotoMime(webpBytes())).toBe('image/webp');
    expect(detectWorkerProfilePhotoMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it('rejects empty, oversized, and unsupported bytes', () => {
    expect(validateWorkerProfilePhotoBytes(new Uint8Array())).toEqual({ ok: false, reason: 'empty' });
    expect(validateWorkerProfilePhotoBytes(jpegBytes(MAX_WORKER_PROFILE_PHOTO_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(validateWorkerProfilePhotoBytes(Uint8Array.from([0x47, 0x49, 0x46, 0x38]))).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
  });

  it('loads local bytes and ignores a misleading filename extension', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => arrayBuffer(webpBytes()) }))
    );
    await expect(loadValidatedWorkerProfilePhoto('file:///picked/avatar.jpg')).resolves.toMatchObject({
      ok: true,
      image: { mime: 'image/webp', byteLength: 16 },
    });
  });
});

describe('canonical private Storage writes', () => {
  it('uploads only the own canonical path with byte-detected content type and upsert false', async () => {
    const api = storageApi();
    const actualJpeg = validated(jpegBytes());
    await expect(
      uploadWorkerProfilePhoto({
        workerUserId: WORKER_USER_ID,
        image: { ...actualJpeg, mime: 'image/png' },
      })
    ).resolves.toEqual({ status: 'uploaded', path: PATH, mime: 'image/jpeg' });
    expect(storageFrom).toHaveBeenCalledWith(WORKER_PROFILE_PHOTO_BUCKET);
    expect(api.upload).toHaveBeenCalledWith(PATH, expect.any(ArrayBuffer), {
      contentType: 'image/jpeg',
      upsert: false,
    });
    expect(api.remove).not.toHaveBeenCalled();
  });

  it('rejects a cross-user path injection before upload or removal', async () => {
    const image = validated(jpegBytes());
    const injected = `${WORKER_USER_ID}/${OTHER_USER_ID}`;
    await expect(uploadWorkerProfilePhoto({ workerUserId: injected, image })).rejects.toMatchObject({
      code: 'invalid_uuid',
    });
    await expect(removeWorkerProfilePhoto(injected)).rejects.toMatchObject({ code: 'invalid_uuid' });
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('reconciles an ambiguous upload only through the exact canonical signed object', async () => {
    const api = storageApi({
      upload: vi.fn(async () => ({ data: null, error: { status: 503, message: 'opaque upload' } })),
    });
    await expect(
      uploadWorkerProfilePhoto({ workerUserId: WORKER_USER_ID, image: validated(webpBytes()) })
    ).resolves.toEqual({ status: 'already_present', path: PATH, mime: 'image/webp' });
    expect(api.createSignedUrl).toHaveBeenCalledWith(PATH, 60);
    expect(api.list).not.toHaveBeenCalled();
    expect(api.getPublicUrl).not.toHaveBeenCalled();
  });

  it('replaces by deleting the exact object before a non-upsert upload', async () => {
    const api = storageApi();
    await expect(
      replaceWorkerProfilePhoto({ workerUserId: WORKER_USER_ID, image: validated(pngBytes()) })
    ).resolves.toEqual({ status: 'uploaded', path: PATH, mime: 'image/png' });
    expect(api.remove).toHaveBeenCalledWith([PATH]);
    expect(api.remove.mock.invocationCallOrder[0]).toBeLessThan(api.upload.mock.invocationCallOrder[0]);
    expect(api.upload).toHaveBeenCalledWith(PATH, expect.any(ArrayBuffer), {
      contentType: 'image/png',
      upsert: false,
    });
  });

  it('rejects invalid replacement bytes before deleting the existing photo', async () => {
    const api = storageApi();
    await expect(
      replaceWorkerProfilePhoto({
        workerUserId: WORKER_USER_ID,
        image: {
          bytes: arrayBuffer(Uint8Array.from([0x47, 0x49, 0x46, 0x38])),
          mime: 'image/jpeg',
          byteLength: 4,
        },
      })
    ).rejects.toMatchObject({ code: 'invalid_photo' });
    expect(api.remove).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('does not upload when an ambiguous replacement delete still leaves the object readable', async () => {
    const api = storageApi({
      remove: vi.fn(async () => ({ data: null, error: { status: 503, message: 'opaque delete' } })),
    });
    await expect(
      replaceWorkerProfilePhoto({ workerUserId: WORKER_USER_ID, image: validated(pngBytes()) })
    ).rejects.toMatchObject({ code: 'remove_failed' });
    expect(api.createSignedUrl).toHaveBeenCalledWith(PATH, 60);
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('reconciles an ambiguous remove as already missing and never accepts a caller path', async () => {
    const api = storageApi({
      remove: vi.fn(async () => ({ data: null, error: { status: 503, message: 'opaque delete' } })),
      createSignedUrl: vi.fn(async () => ({ data: null, error: { statusCode: '404', message: 'opaque missing' } })),
    });
    await expect(removeWorkerProfilePhoto(WORKER_USER_ID)).resolves.toEqual({
      status: 'already_missing',
      path: PATH,
    });
    expect(api.remove).toHaveBeenCalledWith([PATH]);
    expect(api.createSignedUrl).toHaveBeenCalledWith(PATH, 60);
  });
});

describe('authorized exact-object reads and initials fallback signaling', () => {
  it('signs only the canonical object for 60 seconds without public URL or list access', async () => {
    const api = storageApi();
    await expect(getWorkerProfilePhoto(WORKER_USER_ID)).resolves.toEqual({
      status: 'available',
      path: PATH,
      signedUrl: 'https://signed.example/avatar',
    });
    expect(api.createSignedUrl).toHaveBeenCalledWith(PATH, 60);
    expect(api.list).not.toHaveBeenCalled();
    expect(api.getPublicUrl).not.toHaveBeenCalled();
  });

  it('signals initials fallback separately for missing and unavailable photos', async () => {
    storageApi({
      createSignedUrl: vi.fn(async () => ({ data: null, error: { status: 404, message: 'opaque missing' } })),
    });
    await expect(getWorkerProfilePhoto(WORKER_USER_ID)).resolves.toEqual({
      status: 'fallback',
      reason: 'missing',
    });

    storageApi({
      createSignedUrl: vi.fn(async () => ({ data: null, error: { status: 503, message: 'opaque outage' } })),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(getWorkerProfilePhoto(WORKER_USER_ID)).resolves.toEqual({
      status: 'fallback',
      reason: 'unavailable',
    });
  });
});

describe('sanitized profile photo errors', () => {
  it('returns and logs only allowlisted structural diagnostics', () => {
    expect(
      sanitizeWorkerProfilePhotoError({
        status: 401,
        message: 'person@example.test bearer opaque-token',
        payload: { secret: 'opaque-object' },
      })
    ).toEqual({ category: 'authorization', status: 401 });

    const logged = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logWorkerProfilePhotoFailure('signed_url', {
      status: 503,
      message: 'person@example.test bearer opaque-token',
      payload: { secret: 'opaque-object' },
    });
    expect(logged).toHaveBeenCalledWith('[worker-profile-photo] signed_url', {
      category: 'service_unavailable',
      status: 503,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(/example\.test|opaque-token|opaque-object/);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Crypto from 'expo-crypto';

import {
  MAX_PORTFOLIO_IMAGES,
  MAX_PORTFOLIO_IMAGE_BYTES,
  PORTFOLIO_BUCKET,
  buildImageMetadataRows,
  buildPortfolioStoragePath,
  detectImageMime,
  exactObjectCleanupPaths,
  extensionForMime,
  logPortfolioImageFailure,
  newPortfolioImageId,
  readLocalImageBytes,
  recordExactUploadedPath,
  remainingPortfolioImageSlots,
  sanitizePortfolioImageError,
  validateImageBytes,
  validateImageCount,
} from './portfolio-images';

vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(),
}));

const WORKER_PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const PORTFOLIO_ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const IMAGE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const IMAGE_ID_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function jpegBytes(length = 16): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
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

function gifBytes(): Uint8Array {
  return Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
}

function heicBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
  return bytes;
}

function pdfBytes(): Uint8Array {
  return Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
}

function mp4Bytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  return bytes;
}

describe('validateImageCount', () => {
  it('accepts 0 images', () => {
    expect(validateImageCount(0)).toEqual({ ok: true, count: 0 });
  });

  it('accepts 1 through 5 images', () => {
    expect(validateImageCount(1)).toEqual({ ok: true, count: 1 });
    expect(validateImageCount(2)).toEqual({ ok: true, count: 2 });
    expect(validateImageCount(3)).toEqual({ ok: true, count: 3 });
    expect(validateImageCount(4)).toEqual({ ok: true, count: 4 });
    expect(validateImageCount(5)).toEqual({ ok: true, count: 5 });
  });

  it('rejects 6 images', () => {
    expect(validateImageCount(6)).toEqual({ ok: false, reason: 'too_many' });
  });
});

describe('remainingPortfolioImageSlots', () => {
  it('returns remaining slots against the max of 5', () => {
    expect(MAX_PORTFOLIO_IMAGES).toBe(5);
    expect(remainingPortfolioImageSlots(0)).toBe(5);
    expect(remainingPortfolioImageSlots(3)).toBe(2);
    expect(remainingPortfolioImageSlots(5)).toBe(0);
  });
});

describe('detectImageMime', () => {
  it('accepts JPEG magic FF D8 FF', () => {
    expect(detectImageMime(jpegBytes())).toBe('image/jpeg');
  });

  it('accepts PNG magic 89 50 4E 47', () => {
    expect(detectImageMime(pngBytes())).toBe('image/png');
  });

  it('accepts WebP magic RIFF .... WEBP', () => {
    expect(detectImageMime(webpBytes())).toBe('image/webp');
  });

  it('rejects GIF bytes', () => {
    expect(detectImageMime(gifBytes())).toBeNull();
  });

  it('rejects HEIC bytes', () => {
    expect(detectImageMime(heicBytes())).toBeNull();
  });

  it('rejects PDF bytes', () => {
    expect(detectImageMime(pdfBytes())).toBeNull();
  });

  it('rejects video/non-image bytes', () => {
    expect(detectImageMime(mp4Bytes())).toBeNull();
  });

  it('rejects empty bytes', () => {
    expect(detectImageMime(new Uint8Array())).toBeNull();
  });
});

describe('validateImageBytes', () => {
  it('rejects empty bytes', () => {
    expect(validateImageBytes(new ArrayBuffer(0))).toEqual({ ok: false, reason: 'empty' });
  });

  it('accepts exactly 5242880 JPEG bytes', () => {
    const bytes = jpegBytes(MAX_PORTFOLIO_IMAGE_BYTES);
    expect(validateImageBytes(bytes)).toEqual({
      ok: true,
      mime: 'image/jpeg',
      ext: 'jpg',
      byteLength: 5242880,
    });
  });

  it('rejects 5242881 bytes', () => {
    expect(validateImageBytes(jpegBytes(MAX_PORTFOLIO_IMAGE_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('rejects GIF even when under the size limit', () => {
    expect(validateImageBytes(gifBytes())).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
  });
});

describe('extensionForMime', () => {
  it('maps jpeg to .jpg, png to .png, and webp to .webp', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('image/webp')).toBe('webp');
  });
});

describe('buildPortfolioStoragePath', () => {
  it('uses worker_profiles.id, portfolio item id, and image UUID in the filename', () => {
    expect(
      buildPortfolioStoragePath({
        workerProfileId: WORKER_PROFILE_ID,
        portfolioItemId: PORTFOLIO_ITEM_ID,
        imageId: IMAGE_ID,
        ext: 'jpg',
      })
    ).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'
    );
  });

  it('never uses users.id as the first folder', () => {
    const path = buildPortfolioStoragePath({
      workerProfileId: WORKER_PROFILE_ID,
      portfolioItemId: PORTFOLIO_ITEM_ID,
      imageId: IMAGE_ID,
      ext: 'png',
    });
    expect(path.startsWith(`${WORKER_PROFILE_ID}/`)).toBe(true);
    expect(path.startsWith(`${USER_ID}/`)).toBe(false);
    expect(path).not.toContain(USER_ID);
  });

  it('derives jpeg/png/webp filename extensions from detected MIME', () => {
    expect(
      buildPortfolioStoragePath({
        workerProfileId: WORKER_PROFILE_ID,
        portfolioItemId: PORTFOLIO_ITEM_ID,
        imageId: IMAGE_ID,
        ext: 'jpg',
      })
    ).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'
    );
    expect(
      buildPortfolioStoragePath({
        workerProfileId: WORKER_PROFILE_ID,
        portfolioItemId: PORTFOLIO_ITEM_ID,
        imageId: IMAGE_ID,
        ext: 'png',
      })
    ).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png'
    );
    expect(
      buildPortfolioStoragePath({
        workerProfileId: WORKER_PROFILE_ID,
        portfolioItemId: PORTFOLIO_ITEM_ID,
        imageId: IMAGE_ID,
        ext: 'webp',
      })
    ).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp'
    );
  });
});

describe('buildImageMetadataRows', () => {
  it('assigns positions 1..N from selection order and marks the first image as cover', () => {
    const rows = buildImageMetadataRows({
      workerProfileId: WORKER_PROFILE_ID,
      portfolioItemId: PORTFOLIO_ITEM_ID,
      images: [
        { id: IMAGE_ID, ext: 'jpg' },
        { id: IMAGE_ID_2, ext: 'png' },
      ],
    });
    expect(rows).toEqual([
      {
        id: IMAGE_ID,
        portfolio_item_id: PORTFOLIO_ITEM_ID,
        storage_path:
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
        position: 1,
      },
      {
        id: IMAGE_ID_2,
        portfolio_item_id: PORTFOLIO_ITEM_ID,
        storage_path:
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png',
        position: 2,
      },
    ]);
    expect(rows[0]?.position).toBe(1);
  });

  it('uses the image metadata UUID in the filename', () => {
    const [row] = buildImageMetadataRows({
      workerProfileId: WORKER_PROFILE_ID,
      portfolioItemId: PORTFOLIO_ITEM_ID,
      images: [{ id: IMAGE_ID, ext: 'webp' }],
    });
    expect(row?.id).toBe(IMAGE_ID);
    expect(row?.storage_path).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp'
    );
  });
});

describe('exact successful-upload bookkeeping', () => {
  it('records only exact successful object paths', () => {
    const first =
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg';
    const second =
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png';
    const uploaded = recordExactUploadedPath([], first);
    expect(recordExactUploadedPath(uploaded, second)).toEqual([first, second]);
  });

  it('does not produce broad prefix or wildcard cleanup input', () => {
    const exact =
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg';
    const cleanup = exactObjectCleanupPaths([exact]);
    expect(cleanup).toEqual([exact]);
    expect(cleanup).not.toContain(`${WORKER_PROFILE_ID}/`);
    expect(cleanup).not.toContain(`${WORKER_PROFILE_ID}/${PORTFOLIO_ITEM_ID}/`);
    expect(cleanup.some((path) => path.endsWith('/') || path.includes('*'))).toBe(false);
    expect(PORTFOLIO_BUCKET).toBe('portfolio');
  });
});

describe('readLocalImageBytes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the fetched ArrayBuffer when the local URI read succeeds', async () => {
    const bytes = jpegBytes();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => toArrayBuffer(bytes),
      }))
    );
    await expect(readLocalImageBytes('file:///tmp/photo.jpg')).resolves.toEqual(toArrayBuffer(bytes));
  });

  it('fails closed when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('nope');
      })
    );
    await expect(readLocalImageBytes('file:///tmp/photo.jpg')).rejects.toMatchObject({
      code: 'read_failed',
    });
  });

  it('fails closed when the local URI response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        arrayBuffer: async () => toArrayBuffer(jpegBytes()),
      }))
    );
    await expect(readLocalImageBytes('file:///tmp/photo.jpg')).rejects.toMatchObject({
      code: 'read_failed',
    });
  });
});

describe('sanitizePortfolioImageError', () => {
  it('keeps message, status, statusCode, name, and code', () => {
    expect(
      sanitizePortfolioImageError({
        message: 'Object not found',
        status: 400,
        statusCode: '404',
        error: 'NoSuchKey',
        name: 'StorageApiError',
        code: 'NoSuchKey',
      })
    ).toEqual({
      message: 'Object not found',
      status: 400,
      statusCode: '404',
      name: 'NoSuchKey',
      code: 'NoSuchKey',
    });
  });

  it('omits authorization, tokens, anon keys, and passwords', () => {
    expect(
      sanitizePortfolioImageError({
        message: 'Authorization Bearer secret-token',
        statusCode: 'access_token',
        name: 'refresh_token',
        code: 'anon_key',
        error: 'password',
      })
    ).toEqual({});
  });
});

describe('logPortfolioImageFailure', () => {
  it('writes a stage-prefixed sanitized console error', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    logPortfolioImageFailure('storage_upload', {
      message: 'Payload too large',
      status: 413,
      statusCode: '413',
      name: 'StorageApiError',
      code: 'EntityTooLarge',
    });
    expect(logged).toHaveBeenCalledWith('[portfolio-image] storage_upload', {
      message: 'Payload too large',
      status: 413,
      statusCode: '413',
      name: 'StorageApiError',
      code: 'EntityTooLarge',
    });
    logged.mockRestore();
  });
});

describe('newPortfolioImageId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the Expo Crypto.randomUUID value unchanged', () => {
    vi.mocked(Crypto.randomUUID).mockReturnValueOnce(IMAGE_ID);
    expect(newPortfolioImageId()).toBe(IMAGE_ID);
  });

  it('uses the Expo Crypto UUID as metadata id and Storage filename', () => {
    vi.mocked(Crypto.randomUUID).mockReturnValueOnce(IMAGE_ID);
    const id = newPortfolioImageId();
    const [row] = buildImageMetadataRows({
      workerProfileId: WORKER_PROFILE_ID,
      portfolioItemId: PORTFOLIO_ITEM_ID,
      images: [{ id, ext: 'png' }],
    });
    expect(id).toBe(IMAGE_ID);
    expect(row).toEqual({
      id: IMAGE_ID,
      portfolio_item_id: PORTFOLIO_ITEM_ID,
      storage_path: `${WORKER_PROFILE_ID}/${PORTFOLIO_ITEM_ID}/${IMAGE_ID}.png`,
      position: 1,
    });
  });

  it('fails closed when Expo Crypto.randomUUID throws', () => {
    vi.mocked(Crypto.randomUUID).mockImplementationOnce(() => {
      throw new Error('native module unavailable');
    });
    expect(() => newPortfolioImageId()).toThrow(
      expect.objectContaining({
        code: 'uuid_unavailable',
        message: 'image id generation unavailable',
      })
    );
  });
});

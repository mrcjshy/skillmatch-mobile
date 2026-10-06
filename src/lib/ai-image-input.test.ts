// @ts-expect-error -- Node-only independent PNG fixture codec/CRC; excluded from native type surface.
import { crc32, deflateSync } from 'node:zlib';
// @ts-expect-error -- Node-only independent fixture base64 encoder; excluded from native type surface.
import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitizeAiPng, validateAiImageInput, prepareAiImageInput, type AiImageNative } from './ai-image-input';

vi.mock('./supabase', () => ({ supabase: {} })); // existing Job-photo module's external client is unused
afterEach(() => { vi.unstubAllGlobals(); });
const expo = vi.hoisted(() => ({
  Image: { loadAsync: vi.fn(), writeToCacheAsync: vi.fn(), getCachePathAsync: vi.fn() },
  File: vi.fn(), Paths: { cache: { uri: 'file:///cache/' } }, randomUUID: vi.fn(),
}));
vi.mock('expo-image', () => ({ Image: expo.Image }));
vi.mock('expo-file-system', () => ({ File: expo.File, Paths: expo.Paths, FileMode: { ReadOnly: 'r' } }));
vi.mock('expo-crypto', () => ({ randomUUID: expo.randomUUID }));

const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
function chunk(type: string, data = new Uint8Array()): Uint8Array {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}
function header(width = 1, height = 1, depth = 8, color = 6, interlace = 0): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width); view.setUint32(4, height);
  data[8] = depth; data[9] = color; data[12] = interlace;
  return chunk('IHDR', data);
}
const pixels = new Uint8Array([0, 255, 0, 0, 255]); // one opaque red pixel, filter 0
const idat = chunk('IDAT', deflateSync(pixels));
const clean = concat(signature, header(), idat, chunk('IEND'));

function nativeHarness(bytes = clean) {
  const photo = { uri: 'file:///original/photo.jpg' };
  const ref = { width: 1, height: 1, scale: 1, release: vi.fn() };
  let stored = false;
  const native: AiImageNative = {
    cacheRoot: 'file:///cache/',
    createKey: vi.fn(() => 'skillmatch-ai-00000000-0000-4000-8000-000000000001'),
    sourceSize: vi.fn(async () => 64),
    decode: vi.fn(async () => ref),
    write: vi.fn(async () => { stored = true; }),
    lookup: vi.fn(async () => stored ? '/cache/hashed-owned-image' : null),
    read: vi.fn(async () => bytes),
    remove: vi.fn(async () => { stored = false; return true; }),
  };
  return { photo, ref, native };
}

function source(bytes: Uint8Array) {
  const fetch = vi.fn(async () => new Response(new Uint8Array(bytes)));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('bounded metadata-free PNG normalization', () => {
  it('accepts an actual synthetic 1x1 RGBA PNG and preserves compressed pixels', () => {
    expect(sanitizeAiPng(clean)).toEqual(clean);
  });

  it('removes every ancillary chunk while preserving IHDR/IDAT/IEND bytes', () => {
    const metadata = ['eXIf', 'tEXt', 'iTXt', 'zTXt', 'iCCP', 'gAMA', 'pHYs', 'acTL', 'fcTL'];
    const value = concat(signature, header(), ...metadata.map((type) => chunk(type, new TextEncoder().encode('GPS PRIVATE'))),
      idat, chunk('tEXt', new TextEncoder().encode('LOCATION PRIVATE')), chunk('IEND'));
    expect(sanitizeAiPng(value)).toEqual(clean);
  });

  it.each([
    concat(signature, header(0), idat, chunk('IEND')),
    concat(signature, header(321), idat, chunk('IEND')),
    concat(signature, header(1, 321), idat, chunk('IEND')),
    concat(signature, header(1, 1, 16), idat, chunk('IEND')),
    concat(signature, header(1, 1, 8, 3), idat, chunk('IEND')),
    concat(signature, header(1, 1, 8, 6, 1), idat, chunk('IEND')),
    concat(signature, header(), chunk('PLTE', new Uint8Array(3)), idat, chunk('IEND')),
    concat(signature, header(), header(), idat, chunk('IEND')),
    concat(signature, idat, header(), chunk('IEND')),
    concat(signature, header(), chunk('IEND')),
    concat(signature, header(), chunk('IDAT'), chunk('IEND')),
    concat(signature, header(), idat),
    concat(clean, chunk('IEND')),
    concat(clean, new Uint8Array([0])),
    concat(signature, header(), idat, chunk('tEXt'), idat, chunk('IEND')),
    concat(signature, header(), idat, chunk('IEND', new Uint8Array([0]))),
    concat(signature, header(), chunk('texT'), idat, chunk('IEND')),
    concat(signature, header(), chunk('t1Xt'), idat, chunk('IEND')),
  ].map((bytes) => ({ bytes })))('rejects unsafe/malformed PNG structure %#', ({ bytes }) => {
    expect(sanitizeAiPng(bytes)).toBeNull();
  });

  it('rejects invalid CRC in both pixel and discarded metadata chunks', () => {
    const corrupted = clean.slice(); corrupted[corrupted.length - 5] ^= 1;
    expect(sanitizeAiPng(corrupted)).toBeNull();
    const meta = chunk('tEXt', new Uint8Array([1])); meta[8] ^= 1;
    expect(sanitizeAiPng(concat(signature, header(), meta, idat, chunk('IEND')))).toBeNull();
  });

  it('rejects malformed signature, huge chunk declarations and oversized derivative', () => {
    const signatureError = clean.slice(); signatureError[0] = 0;
    expect(sanitizeAiPng(signatureError)).toBeNull();
    const largeDeclaration = clean.slice(); new DataView(largeDeclaration.buffer).setUint32(8, 0xffffffff);
    expect(sanitizeAiPng(largeDeclaration)).toBeNull();
    expect(sanitizeAiPng(new Uint8Array(524289))).toBeNull();
  });

  it.each([0, 2, 4, 6])('accepts 8-bit supported colour type %i with contiguous IDAT chunks', (color) => {
    const value = concat(signature, header(320, 320, 8, color), idat, idat, chunk('IEND'));
    expect(sanitizeAiPng(value)).toEqual(value);
  });

  it('caps IDAT chunks at the server boundary of 64', () => {
    const atLimit = concat(signature, header(), ...Array.from({ length: 64 }, () => idat), chunk('IEND'));
    expect(sanitizeAiPng(atLimit)).toEqual(atLimit);
    expect(sanitizeAiPng(concat(signature, header(), ...Array.from({ length: 65 }, () => idat), chunk('IEND')))).toBeNull();
  });

  it('rejects interrupted IDAT even when the first data chunk is empty', () => {
    expect(sanitizeAiPng(concat(signature, header(), chunk('IDAT'), chunk('tEXt'), idat, chunk('IEND')))).toBeNull();
  });

  it('rejects every empty IDAT and compressed streams shorter than six bytes', () => {
    expect(sanitizeAiPng(concat(signature, header(), chunk('IDAT'), idat, chunk('IEND')))).toBeNull();
    expect(sanitizeAiPng(concat(signature, header(), idat, chunk('IDAT'), chunk('IEND')))).toBeNull();
    expect(sanitizeAiPng(concat(signature, header(), chunk('IDAT', new Uint8Array(5)), chunk('IEND')))).toBeNull();
  });
});

describe('explicit draft-photo normalization and owned cleanup', () => {
  it.each([
    { mime: 'image/jpeg', bytes: new Uint8Array([255, 216, 255, 0]) },
    { mime: 'image/png', bytes: clean },
    { mime: 'image/webp', bytes: new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]) },
  ])('reuses actual Job-photo signature validation for $mime and encodes decoded pixels', async ({ bytes }) => {
    const h = nativeHarness();
    const fetch = source(bytes);
    const result = await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native);
    expect(result).toEqual({ ok: true, image: { mime_type: 'image/png', data: Buffer.from(clean).toString('base64') } });
    expect(fetch.mock.calls).toEqual([[h.photo.uri]]);
    expect(h.native.write).toHaveBeenCalledWith(h.ref, 'skillmatch-ai-00000000-0000-4000-8000-000000000001');
    expect(h.native.read).toHaveBeenCalledWith('file:///cache/hashed-owned-image', 524288);
    expect(h.native.remove).toHaveBeenCalledWith('file:///cache/hashed-owned-image');
    expect(h.ref.release).toHaveBeenCalledTimes(1);
  });

  it('removes derivative metadata before returning a DTO, after exact artifact deletion', async () => {
    source(clean);
    const h = nativeHarness(concat(signature, header(), chunk('eXIf', new TextEncoder().encode('GPS PRIVATE')), idat, chunk('IEND')));
    let deleted = false;
    h.native.remove = vi.fn(async () => { deleted = true; return true; });
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native)).toEqual({
      ok: true, image: { mime_type: 'image/png', data: Buffer.from(clean).toString('base64') },
    });
    expect(deleted).toBe(true);
    expect(h.native.remove).not.toHaveBeenCalledWith(h.photo.uri);
  });

  it.each(['https://private/photo', 'data:image/png;base64,AAAA', '/arbitrary/photo', ''])('rejects nonlocal/nonexplicit URI %s', async (uri) => {
    const h = nativeHarness(); source(clean); h.photo.uri = uri;
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native))
      .toEqual({ ok: false, reason: 'image_unavailable' });
    expect(h.native.decode).not.toHaveBeenCalled();
  });

  it('rejects a fake same-URI object absent from the actual current draft list', async () => {
    const h = nativeHarness(); source(clean);
    expect(await prepareAiImageInput({ selectedPhoto: { ...h.photo }, draftPhotos: [h.photo], isCurrent: () => true }, h.native))
      .toEqual({ ok: false, reason: 'image_unavailable' });
    expect(h.native.sourceSize).not.toHaveBeenCalled();
  });

  it('bounds source file size before Job-photo reads or decoding', async () => {
    const h = nativeHarness(); const fetch = source(clean);
    h.native.sourceSize = vi.fn(async () => 5242881);
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native))
      .toEqual({ ok: false, reason: 'image_unavailable' });
    expect(fetch).not.toHaveBeenCalled(); expect(h.native.decode).not.toHaveBeenCalled();
  });

  it.each(['file:///outside/cache-image', 'file:///cache/../original/photo.jpg', 'file:///cache/%2e%2e/original',
    'file:///cacheevil/image', 'file:///original/photo.jpg'])('forbids reading/deleting unowned cache path %s', async (path) => {
    const h = nativeHarness(); source(clean);
    h.native.lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(path);
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native))
      .toEqual({ ok: false, reason: 'image_unavailable' });
    expect(h.native.read).not.toHaveBeenCalled(); expect(h.native.remove).not.toHaveBeenCalled();
  });

  it.each(['remove', 'read', 'write', 'decode'] as const)('sanitizes native %s failure, releases and cleans only owned derivative', async (operation) => {
    const h = nativeHarness(); source(clean);
    h.native[operation] = vi.fn(async () => { throw new Error('PRIVATE_URI_TOKEN'); }) as never;
    const result = await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native);
    expect(result).toEqual({ ok: false, reason: 'image_unavailable' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_URI_TOKEN');
    expect(h.native.remove).not.toHaveBeenCalledWith(h.photo.uri);
  });

  it('holds image transmission when exact derivative deletion cannot be verified', async () => {
    const h = nativeHarness(); source(clean); h.native.remove = vi.fn(async () => false);
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native))
      .toEqual({ ok: false, reason: 'image_unavailable' });
  });

  it('cleans malformed/oversized derivative without transferring original bytes', async () => {
    source(clean);
    const h = nativeHarness(new Uint8Array(524289));
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native))
      .toEqual({ ok: false, reason: 'image_unavailable' });
    expect(h.native.remove).toHaveBeenCalledWith('file:///cache/hashed-owned-image');
  });

  it.each([{ width: 321 }, { width: 0 }, { width: NaN }, { width: Infinity }, { width: 321.5 },
    { height: 321 }, { height: 0 }, { height: NaN }])('rejects unsupported decoded native dimensions before cache encoding %#', async (patch) => {
    const h = nativeHarness(); source(clean); Object.assign(h.ref, patch);
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native))
      .toEqual({ ok: false, reason: 'image_unavailable' });
    expect(h.native.write).not.toHaveBeenCalled(); expect(h.native.remove).not.toHaveBeenCalled();
    expect(h.ref.release).toHaveBeenCalledTimes(1);
  });

  it('accepts fractional logical dimensions with bounded pixel dimensions from scale', async () => {
    const h = nativeHarness(); source(clean); h.ref.width = 128.0000001; h.ref.height = 0.4; h.ref.scale = 2.5;
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native))
      .toEqual({ ok: true, image: { mime_type: 'image/png', data: Buffer.from(clean).toString('base64') } });
  });

  it.each([{ width: 161, scale: 2 }, { height: 161, scale: 2 }, { scale: 0 }, { scale: NaN }, { scale: Infinity }])(
    'rejects unsupported estimated pixel size/scale before encoding %#', async (patch) => {
      const h = nativeHarness(); source(clean); Object.assign(h.ref, patch);
      expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native))
        .toEqual({ ok: false, reason: 'image_unavailable' });
      expect(h.native.write).not.toHaveBeenCalled(); expect(h.ref.release).toHaveBeenCalledTimes(1);
    }
  );
});

describe('image preparation lifetime ownership', () => {
  it.each([false, 'throws'])('rejects missing/throwing current authority before reading %#', async (authority) => {
    const h = nativeHarness(); source(clean);
    const result = await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo],
      isCurrent: () => { if (authority === 'throws') throw new Error('PRIVATE'); return false; },
    }, h.native);
    expect(result).toEqual({ ok: false, reason: 'invalidated' });
    expect(h.native.sourceSize).not.toHaveBeenCalled();
  });

  it.each(['sourceSize', 'decode', 'write', 'read', 'remove'] as const)(
    'invalidates during awaited %s, releases reference, and removes any owned derivative', async (stage) => {
      const h = nativeHarness(); source(clean);
      let current = true;
      const original = h.native[stage];
      h.native[stage] = vi.fn(async (...args: unknown[]) => {
        const result = await (original as (...args: unknown[]) => Promise<unknown>)(...args);
        current = false;
        return result;
      }) as never;
      const result = await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => current }, h.native);
      expect(result).toEqual({ ok: false, reason: 'invalidated' });
      if (stage === 'write' || stage === 'read' || stage === 'remove') {
        expect(h.native.remove).toHaveBeenCalledWith('file:///cache/hashed-owned-image');
      }
      if (stage === 'decode') { expect(h.ref.release).toHaveBeenCalledTimes(1); expect(h.native.write).not.toHaveBeenCalled(); }
      if (stage === 'write') expect(h.native.read).not.toHaveBeenCalled();
    }
  );

  it('invalidates after actual source validation and makes no codec call', async () => {
    const h = nativeHarness(); let current = true;
    vi.stubGlobal('fetch', vi.fn(async () => { current = false; return new Response(new Uint8Array(clean)); }));
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => current }, h.native))
      .toEqual({ ok: false, reason: 'invalidated' });
    expect(h.native.decode).not.toHaveBeenCalled();
  });

  it('cleans after cache lookup loses authority without reading or returning pixels', async () => {
    const h = nativeHarness(); source(clean); let current = true;
    h.native.lookup = vi.fn().mockResolvedValueOnce(null).mockImplementation(async () => {
      current = false; return '/cache/hashed-owned-image';
    });
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => current }, h.native))
      .toEqual({ ok: false, reason: 'invalidated' });
    expect(h.native.read).not.toHaveBeenCalled();
    expect(h.native.remove).toHaveBeenCalledWith('file:///cache/hashed-owned-image');
  });

  it('reports invalidation after a preflight lookup loses authority and returns a collision', async () => {
    const h = nativeHarness(); source(clean); let current = true;
    h.native.lookup = vi.fn(async () => { current = false; return '/cache/collision'; });
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => current }, h.native))
      .toEqual({ ok: false, reason: 'invalidated' });
    expect(h.native.decode).not.toHaveBeenCalled(); expect(h.native.remove).not.toHaveBeenCalled();
  });

  it('cannot retarget the selected original URI through caller mutation', async () => {
    const h = nativeHarness(); source(clean);
    h.native.decode = vi.fn(async () => { h.photo.uri = 'file:///new-owner/private.jpg'; return h.ref; });
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }, h.native))
      .toEqual({ ok: false, reason: 'invalidated' });
    expect(h.native.write).not.toHaveBeenCalled();
    expect(h.ref.release).toHaveBeenCalledTimes(1);
  });

  it('removal from the captured draft list invalidates even if the guard is mistakenly still true', async () => {
    const h = nativeHarness(); source(clean); const photos = [h.photo];
    h.native.decode = vi.fn(async () => { photos.splice(0); return h.ref; });
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: photos, isCurrent: () => true }, h.native))
      .toEqual({ ok: false, reason: 'invalidated' });
    expect(h.native.write).not.toHaveBeenCalled();
  });
});

describe('installed Expo default native boundary', () => {
  function setup(derivative = clean) {
    source(clean);
    const h = nativeHarness();
    expo.randomUUID.mockReturnValue('00000000-0000-4000-8000-000000000001');
    expo.Image.loadAsync.mockResolvedValue(h.ref);
    expo.Image.writeToCacheAsync.mockResolvedValue(undefined);
    expo.Image.getCachePathAsync.mockReset().mockResolvedValueOnce(null).mockResolvedValue('/cache/hashed-native-path');
    const file = { exists: true, size: derivative.length, open: vi.fn(), delete: vi.fn() };
    const handle = { readBytes: vi.fn(() => derivative), close: vi.fn() };
    file.open.mockReturnValue(handle);
    file.delete.mockImplementation(() => { file.exists = false; });
    expo.File.mockReset().mockImplementation(function (uri: string) {
      return uri === h.photo.uri ? { exists: true, size: clean.length } : file;
    });
    return { ...h, file, handle };
  }

  it('decodes within 320px, writes ImageRef rather than URI, bounds read and verifies deletion', async () => {
    const h = setup();
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }))
      .toEqual({ ok: true, image: { mime_type: 'image/png', data: Buffer.from(clean).toString('base64') } });
    expect(expo.Image.loadAsync).toHaveBeenLastCalledWith({ uri: h.photo.uri }, { maxWidth: 320, maxHeight: 320 });
    expect(expo.Image.writeToCacheAsync).toHaveBeenLastCalledWith(h.ref, 'skillmatch-ai-00000000-0000-4000-8000-000000000001');
    expect(h.file.open).toHaveBeenCalledWith('r');
    expect(h.handle.readBytes).toHaveBeenCalledWith(524289);
    expect(h.handle.close).toHaveBeenCalledTimes(1);
    expect(h.file.delete).toHaveBeenCalledTimes(1);
    expect(h.file.exists).toBe(false);
  });

  it('rejects oversized native derivative before opening it, then deletes only it', async () => {
    const h = setup(); h.file.size = 524289;
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }))
      .toEqual({ ok: false, reason: 'image_unavailable' });
    expect(h.file.open).not.toHaveBeenCalled(); expect(h.file.delete).toHaveBeenCalledTimes(1);
  });

  it('rejects unavailable development-shell encoder and never transfers an original', async () => {
    const h = setup(); expo.Image.writeToCacheAsync.mockRejectedValueOnce(new Error('Native method unavailable'));
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }))
      .toEqual({ ok: false, reason: 'image_unavailable' });
    expect(h.native.read).not.toHaveBeenCalled();
  });

  it('rejects a non-PNG native encoding such as an iOS JPEG cache entry', async () => {
    const h = setup(new Uint8Array([255, 216, 255, 0]));
    expect(await prepareAiImageInput({ selectedPhoto: h.photo, draftPhotos: [h.photo], isCurrent: () => true }))
      .toEqual({ ok: false, reason: 'image_unavailable' });
    expect(h.file.delete).toHaveBeenCalledTimes(1);
  });
});

describe('one exact normalized PNG DTO', () => {
  const value = { mime_type: 'image/png' as const, data: Buffer.from(clean).toString('base64') };
  it('accepts canonical normalized PNG and retains only the two fields', () => {
    expect(validateAiImageInput(value)).toEqual(value);
  });
  it.each([
    null, [], [value], { ...value, uri: 'file://private' }, { ...value, mime_type: 'image/jpeg' },
    { ...value, data: 'not base64!' }, { ...value, data: value.data + '\n' },
    { ...value, data: value.data.slice(0, -1) },
    { ...value, data: Buffer.from(new Uint8Array([255, 216, 255])).toString('base64') },
    { ...value, data: Buffer.from(concat(signature, header(), chunk('tEXt'), idat, chunk('IEND'))).toString('base64') },
    { ...value, data: 'A'.repeat(699056) },
  ])('rejects original formats, metadata, extra keys, arrays and noncanonical base64 %#', (input) => {
    expect(validateAiImageInput(input)).toBeNull();
  });
});

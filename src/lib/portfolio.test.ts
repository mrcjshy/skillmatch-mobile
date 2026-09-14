import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Crypto from 'expo-crypto';

import {
  PORTFOLIO_COPY,
  PORTFOLIO_INSERT_FORBIDDEN_FIELDS,
  PORTFOLIO_INSERT_KEYS,
  PORTFOLIO_TITLE_MAX,
  buildPortfolioInsertPayload,
  createOwnPortfolioItem,
  deleteOwnPortfolioItem,
  loadOwnPortfolio,
} from './portfolio';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}));

vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(),
}));

function stubImageIds(...ids: string[]) {
  const randomUUID = vi.mocked(Crypto.randomUUID);
  for (const id of ids) randomUUID.mockReturnValueOnce(id);
  return randomUUID;
}

const WORKER_PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';


function acceptedPayload(overrides: {
  workerId?: string;
  title?: string;
  description?: string;
  projectScale?: string;
} = {}) {
  return buildPortfolioInsertPayload({
    workerId: overrides.workerId ?? WORKER_PROFILE_ID,
    title: overrides.title ?? 'Kitchen cabinet install',
    description: overrides.description ?? 'Replaced lower cabinets.',
    projectScale: overrides.projectScale ?? 'small',
  });
}

describe('buildPortfolioInsertPayload', () => {
  it('trims surrounding whitespace from the title', () => {
    const result = acceptedPayload({ title: '  Kitchen cabinet install  ' });
    expect(result).toEqual({
      ok: true,
      payload: {
        worker_id: WORKER_PROFILE_ID,
        title: 'Kitchen cabinet install',
        description: 'Replaced lower cabinets.',
        project_scale: 'small',
      },
    });
  });

  it('rejects a whitespace-only title', () => {
    expect(acceptedPayload({ title: '   ' })).toEqual({ ok: false, reason: 'empty_title' });
  });

  it('rejects a title longer than 150 characters', () => {
    expect(acceptedPayload({ title: 'x'.repeat(PORTFOLIO_TITLE_MAX + 1) })).toEqual({
      ok: false,
      reason: 'title_too_long',
    });
  });

  it('trims surrounding whitespace from the description', () => {
    const result = acceptedPayload({ description: '  Replaced lower cabinets.  ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.description).toBe('Replaced lower cabinets.');
  });

  it('stores a whitespace-only description as null', () => {
    const result = acceptedPayload({ description: '   ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.description).toBeNull();
  });

  it('accepts project_scale small', () => {
    const result = acceptedPayload({ projectScale: 'small' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.project_scale).toBe('small');
  });

  it('accepts project_scale medium', () => {
    const result = acceptedPayload({ projectScale: 'medium' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.project_scale).toBe('medium');
  });

  it('accepts project_scale large', () => {
    const result = acceptedPayload({ projectScale: 'large' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.project_scale).toBe('large');
  });

  it('rejects an unsupported project_scale', () => {
    expect(acceptedPayload({ projectScale: 'huge' })).toEqual({
      ok: false,
      reason: 'invalid_scale',
    });
  });

  it('builds an insert payload with only worker_id, title, description, and project_scale', () => {
    const result = acceptedPayload();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.payload).sort()).toEqual([...PORTFOLIO_INSERT_KEYS]);
  });

  it('never includes image_url, badge_level, verification, or matching fields', () => {
    const result = acceptedPayload();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(PORTFOLIO_INSERT_FORBIDDEN_FIELDS).toEqual([
      'image_url',
      'badge_level',
      'is_verified',
      'verified_by',
      'rating_avg',
      'strike_count',
      'id',
      'user_id',
      'skill_id',
      'job_id',
    ]);
    for (const key of PORTFOLIO_INSERT_FORBIDDEN_FIELDS) {
      expect(result.payload).not.toHaveProperty(key);
    }
  });
});

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const IMAGE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const IMAGE_ID_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const JPEG_PATH = `${WORKER_PROFILE_ID}/${ITEM_ID}/${IMAGE_ID}.jpg`;
const PNG_PATH = `${WORKER_PROFILE_ID}/${ITEM_ID}/${IMAGE_ID_2}.png`;

const fromMock = vi.mocked(supabase.from);
const storageFromMock = vi.mocked(supabase.storage.from);

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };

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

function chain(result: QueryResult) {
  const final = Promise.resolve(result);
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = vi.fn(self);
  api.insert = vi.fn(self);
  api.delete = vi.fn(self);
  api.eq = vi.fn(self);
  api.in = vi.fn(self);
  api.order = vi.fn(self);
  api.single = vi.fn(() => final);
  api.maybeSingle = vi.fn(() => final);
  api.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    final.then(onFulfilled, onRejected);
  return api;
}

function queueFrom(results: { table: string; result: QueryResult }[]) {
  const remaining = [...results];
  fromMock.mockImplementation(((table: string) => {
    const next = remaining.shift();
    if (!next) throw new Error(`unexpected from(${table})`);
    if (next.table !== table) {
      throw new Error(`expected from(${next.table}), got from(${table})`);
    }
    return chain(next.result);
  }) as never);
  return remaining;
}

function storageApi(overrides: {
  upload?: ReturnType<typeof vi.fn>;
  remove?: ReturnType<typeof vi.fn>;
  createSignedUrls?: ReturnType<typeof vi.fn>;
} = {}) {
  const upload = overrides.upload ?? vi.fn(async () => ({ data: { path: 'ok' }, error: null }));
  const remove = overrides.remove ?? vi.fn(async () => ({ data: [], error: null }));
  const createSignedUrls =
    overrides.createSignedUrls ??
    vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null })),
      error: null,
    }));
  const getPublicUrl = vi.fn();
  storageFromMock.mockReturnValue({
    upload,
    remove,
    createSignedUrls,
    getPublicUrl,
  } as never);
  return { upload, remove, createSignedUrls, getPublicUrl };
}

function stubJpegFetch(uriMap: Record<string, Uint8Array> = { 'file:///one.jpg': jpegBytes() }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (uri: string) => ({
      ok: true,
      arrayBuffer: async () => {
        const bytes = uriMap[uri];
        if (!bytes) throw new Error(`unexpected uri ${uri}`);
        return toArrayBuffer(bytes);
      },
    }))
  );
}

function createDraft(overrides: Partial<{ title: string; description: string; projectScale: string; images: { uri: string }[] }> = {}) {
  return {
    accountId: USER_ID,
    title: overrides.title ?? 'Kitchen cabinet install',
    description: overrides.description ?? 'Replaced lower cabinets.',
    projectScale: overrides.projectScale ?? 'small',
    images: overrides.images,
  };
}

describe('createOwnPortfolioItem', () => {
  beforeEach(() => {
    fromMock.mockReset();
    storageFromMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the new portfolio item id and skips Storage for a 0-image create', async () => {
    const { upload, getPublicUrl, createSignedUrls } = storageApi();
    queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      { table: 'portfolio_items', result: { data: { id: ITEM_ID }, error: null } },
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      {
        table: 'portfolio_items',
        result: {
          data: [
            {
              id: ITEM_ID,
              worker_id: WORKER_PROFILE_ID,
              title: 'Kitchen cabinet install',
              description: 'Replaced lower cabinets.',
              project_scale: 'small',
              created_at: '2026-09-14T00:00:00Z',
            },
          ],
          error: null,
        },
      },
      { table: 'portfolio_item_images', result: { data: [], error: null } },
    ]);

    const result = await createOwnPortfolioItem(createDraft());
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.workerProfileId).toBe(WORKER_PROFILE_ID);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(ITEM_ID);
    expect(result.items[0]?.images).toEqual([]);
    expect(upload).not.toHaveBeenCalled();
    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('uploads N images then inserts metadata with positions 1..N', async () => {
    stubJpegFetch({
      'file:///one.jpg': jpegBytes(),
      'file:///two.jpg': jpegBytes(),
    });
    stubImageIds(IMAGE_ID, IMAGE_ID_2);
    const { upload, createSignedUrls, getPublicUrl } = storageApi();
    const remaining = queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      { table: 'portfolio_items', result: { data: { id: ITEM_ID }, error: null } },
      { table: 'portfolio_item_images', result: { data: null, error: null } },
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      {
        table: 'portfolio_items',
        result: {
          data: [
            {
              id: ITEM_ID,
              worker_id: WORKER_PROFILE_ID,
              title: 'Kitchen cabinet install',
              description: 'Replaced lower cabinets.',
              project_scale: 'small',
              created_at: '2026-09-14T00:00:00Z',
            },
          ],
          error: null,
        },
      },
      {
        table: 'portfolio_item_images',
        result: {
          data: [
            {
              id: IMAGE_ID,
              portfolio_item_id: ITEM_ID,
              storage_path: JPEG_PATH,
              position: 1,
              created_at: '2026-09-14T00:00:00Z',
            },
            {
              id: IMAGE_ID_2,
              portfolio_item_id: ITEM_ID,
              storage_path: PNG_PATH.replace('.png', '.jpg'),
              position: 2,
              created_at: '2026-09-14T00:00:00Z',
            },
          ],
          error: null,
        },
      },
    ]);

    const result = await createOwnPortfolioItem(
      createDraft({ images: [{ uri: 'file:///one.jpg' }, { uri: 'file:///two.jpg' }] })
    );
    expect(remaining).toEqual([]);
    expect(result.status).toBe('success');
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0]?.[0]).toBe(JPEG_PATH);
    expect(upload.mock.calls[0]?.[2]).toEqual({ upsert: false, contentType: 'image/jpeg' });
    expect(upload.mock.calls[1]?.[0]).toBe(
      `${WORKER_PROFILE_ID}/${ITEM_ID}/${IMAGE_ID_2}.jpg`
    );
    expect(upload.mock.calls[0]?.[0]?.startsWith(`${WORKER_PROFILE_ID}/`)).toBe(true);
    expect(String(upload.mock.calls[0]?.[0])).not.toContain(USER_ID);
    expect(createSignedUrls).toHaveBeenCalledWith(
      [JPEG_PATH, `${WORKER_PROFILE_ID}/${ITEM_ID}/${IMAGE_ID_2}.jpg`],
      3600
    );
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('cleans up only exact successful paths when a middle upload fails', async () => {
    stubJpegFetch({
      'file:///one.jpg': jpegBytes(),
      'file:///two.jpg': jpegBytes(),
    });
    stubImageIds(IMAGE_ID, IMAGE_ID_2);
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ data: { path: JPEG_PATH }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'upload failed' } });
    const remove = vi.fn(async () => ({ data: [], error: null }));
    storageApi({ upload, remove });
    const remaining = queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      { table: 'portfolio_items', result: { data: { id: ITEM_ID }, error: null } },
      { table: 'portfolio_items', result: { data: null, error: null } },
    ]);

    const result = await createOwnPortfolioItem(
      createDraft({ images: [{ uri: 'file:///one.jpg' }, { uri: 'file:///two.jpg' }] })
    );
    expect(result).toEqual({
      status: 'rolled_back',
      message: PORTFOLIO_COPY.rolledBack,
    });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([JPEG_PATH]);
    expect(remaining).toEqual([]);
  });

  it('cleans up exact uploaded paths when metadata insert fails', async () => {
    stubJpegFetch();
    stubImageIds(IMAGE_ID);
    const { upload, remove } = storageApi();
    queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      { table: 'portfolio_items', result: { data: { id: ITEM_ID }, error: null } },
      { table: 'portfolio_item_images', result: { data: null, error: { message: 'insert failed' } } },
      { table: 'portfolio_items', result: { data: null, error: null } },
    ]);

    const result = await createOwnPortfolioItem(createDraft({ images: [{ uri: 'file:///one.jpg' }] }));
    expect(result.status).toBe('rolled_back');
    expect(upload).toHaveBeenCalledWith(JPEG_PATH, expect.any(ArrayBuffer), {
      upsert: false,
      contentType: 'image/jpeg',
    });
    expect(remove).toHaveBeenCalledWith([JPEG_PATH]);
  });

  it('returns needs_reconciliation when cleanup cannot finish', async () => {
    stubJpegFetch({
      'file:///one.jpg': jpegBytes(),
      'file:///two.jpg': jpegBytes(),
    });
    stubImageIds(IMAGE_ID, IMAGE_ID_2);
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ data: { path: JPEG_PATH }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'upload failed' } });
    const remove = vi.fn(async () => ({ data: null, error: { message: 'remove failed' } }));
    storageApi({ upload, remove });
    queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      { table: 'portfolio_items', result: { data: { id: ITEM_ID }, error: null } },
    ]);

    const result = await createOwnPortfolioItem(
      createDraft({ images: [{ uri: 'file:///one.jpg' }, { uri: 'file:///two.jpg' }] })
    );
    expect(result).toEqual({
      status: 'needs_reconciliation',
      message: PORTFOLIO_COPY.needsReconciliation,
    });
    expect(remove).toHaveBeenCalledWith([JPEG_PATH]);
    expect(fromMock.mock.calls.map((call) => call[0])).toEqual(['worker_profiles', 'portfolio_items']);
  });

  it('returns needs_reconciliation when objects are removed but the parent row cannot be deleted', async () => {
    stubJpegFetch();
    stubImageIds(IMAGE_ID);
    const { remove } = storageApi();
    queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      { table: 'portfolio_items', result: { data: { id: ITEM_ID }, error: null } },
      { table: 'portfolio_item_images', result: { data: null, error: { message: 'insert failed' } } },
      { table: 'portfolio_items', result: { data: null, error: { message: 'delete failed' } } },
    ]);

    const result = await createOwnPortfolioItem(createDraft({ images: [{ uri: 'file:///one.jpg' }] }));
    expect(result).toEqual({
      status: 'needs_reconciliation',
      message: PORTFOLIO_COPY.needsReconciliation,
    });
    expect(remove).toHaveBeenCalledWith([JPEG_PATH]);
  });



  it('returns saved_refresh_failed when writes succeed but reload fails', async () => {
    stubJpegFetch();
    stubImageIds(IMAGE_ID);
    const { remove } = storageApi();
    queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      { table: 'portfolio_items', result: { data: { id: ITEM_ID }, error: null } },
      { table: 'portfolio_item_images', result: { data: null, error: null } },
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      { table: 'portfolio_items', result: { data: null, error: { message: 'reload failed', code: 'PGRST' } } },
    ]);

    const result = await createOwnPortfolioItem(createDraft({ images: [{ uri: 'file:///one.jpg' }] }));
    expect(result).toEqual({
      status: 'saved_refresh_failed',
      message: PORTFOLIO_COPY.savedRefreshFailed,
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('logs image_id and rolls back the parent when Expo Crypto.randomUUID throws', async () => {
    stubJpegFetch();
    vi.mocked(Crypto.randomUUID).mockImplementationOnce(() => {
      throw new Error('native module unavailable');
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { upload, remove } = storageApi();
    queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      { table: 'portfolio_items', result: { data: { id: ITEM_ID }, error: null } },
      { table: 'portfolio_items', result: { data: null, error: null } },
    ]);

    const result = await createOwnPortfolioItem(createDraft({ images: [{ uri: 'file:///one.jpg' }] }));
    expect(result).toEqual({
      status: 'rolled_back',
      message: PORTFOLIO_COPY.rolledBack,
    });
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      '[portfolio-image] image_id',
      expect.objectContaining({
        code: 'uuid_unavailable',
        message: 'image id generation unavailable',
      })
    );
  });

  it('uses the Expo Crypto UUID unchanged for the Storage filename', async () => {
    stubJpegFetch();
    stubImageIds(IMAGE_ID);
    const { upload, remove } = storageApi();
    queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      { table: 'portfolio_items', result: { data: { id: ITEM_ID }, error: null } },
      { table: 'portfolio_item_images', result: { data: null, error: null } },
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      {
        table: 'portfolio_items',
        result: {
          data: [
            {
              id: ITEM_ID,
              worker_id: WORKER_PROFILE_ID,
              title: 'Kitchen cabinet install',
              description: 'Replaced lower cabinets.',
              project_scale: 'small',
              created_at: '2026-09-14T00:00:00Z',
            },
          ],
          error: null,
        },
      },
      {
        table: 'portfolio_item_images',
        result: {
          data: [
            {
              id: IMAGE_ID,
              portfolio_item_id: ITEM_ID,
              storage_path: JPEG_PATH,
              position: 1,
              created_at: '2026-09-14T00:00:00Z',
            },
          ],
          error: null,
        },
      },
    ]);

    const result = await createOwnPortfolioItem(createDraft({ images: [{ uri: 'file:///one.jpg' }] }));
    expect(result.status).toBe('success');
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(JPEG_PATH, expect.any(ArrayBuffer), {
      upsert: false,
      contentType: 'image/jpeg',
    });
    expect(String(upload.mock.calls[0]?.[0])).toBe(
      `${WORKER_PROFILE_ID}/${ITEM_ID}/${IMAGE_ID}.jpg`
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('logs storage_upload when the first object upload fails and then rolls back the parent', async () => {
    stubJpegFetch();
    stubImageIds(IMAGE_ID);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const upload = vi.fn(async () => ({
      data: null,
      error: {
        message: 'Unauthorized',
        status: 403,
        statusCode: '403',
        error: 'Unauthorized',
        name: 'StorageApiError',
      },
    }));
    const remove = vi.fn(async () => ({ data: [], error: null }));
    storageApi({ upload, remove });
    queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      { table: 'portfolio_items', result: { data: { id: ITEM_ID }, error: null } },
      { table: 'portfolio_items', result: { data: null, error: null } },
    ]);

    const result = await createOwnPortfolioItem(createDraft({ images: [{ uri: 'file:///one.jpg' }] }));
    expect(result).toEqual({
      status: 'rolled_back',
      message: PORTFOLIO_COPY.rolledBack,
    });
    expect(upload).toHaveBeenCalledWith(JPEG_PATH, expect.any(ArrayBuffer), {
      upsert: false,
      contentType: 'image/jpeg',
    });
    expect(remove).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      '[portfolio-image] storage_upload',
      expect.objectContaining({
        message: 'Unauthorized',
        status: 403,
        statusCode: '403',
        name: 'Unauthorized',
      })
    );
  });
});

describe('deleteOwnPortfolioItem', () => {
  beforeEach(() => {
    fromMock.mockReset();
    storageFromMock.mockReset();
  });

  it('deletes a 0-image item without Storage remove', async () => {
    const { remove } = storageApi();
    queueFrom([
      { table: 'portfolio_item_images', result: { data: [], error: null } },
      { table: 'portfolio_items', result: { data: null, error: null } },
    ]);

    await expect(deleteOwnPortfolioItem(WORKER_PROFILE_ID, ITEM_ID)).resolves.toEqual({
      status: 'success',
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes exact objects before deleting the parent row', async () => {
    const { remove } = storageApi();
    const remaining = queueFrom([
      {
        table: 'portfolio_item_images',
        result: { data: [{ storage_path: JPEG_PATH }, { storage_path: PNG_PATH }], error: null },
      },
      { table: 'portfolio_items', result: { data: null, error: null } },
    ]);

    await expect(deleteOwnPortfolioItem(WORKER_PROFILE_ID, ITEM_ID)).resolves.toEqual({
      status: 'success',
    });
    expect(remove).toHaveBeenCalledWith([JPEG_PATH, PNG_PATH]);
    expect(remaining).toEqual([]);
  });

  it('does not delete the parent when Storage object deletion fails', async () => {
    const remove = vi.fn(async () => ({ data: null, error: { message: 'busy' } }));
    storageApi({ remove });
    const remaining = queueFrom([
      {
        table: 'portfolio_item_images',
        result: { data: [{ storage_path: JPEG_PATH }], error: null },
      },
    ]);

    await expect(deleteOwnPortfolioItem(WORKER_PROFILE_ID, ITEM_ID)).resolves.toEqual({
      status: 'retryable_failure',
      message: PORTFOLIO_COPY.deleteFailed,
    });
    expect(remaining).toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('portfolio_item_images');
    expect(fromMock).not.toHaveBeenCalledWith('portfolio_items');
  });
});

describe('loadOwnPortfolio signed reads', () => {
  beforeEach(() => {
    fromMock.mockReset();
    storageFromMock.mockReset();
  });

  it('creates signed URLs for exact storage paths and keeps the item if signing fails', async () => {
    const createSignedUrls = vi.fn(async () => ({ data: null, error: { message: 'sign failed' } }));
    const { getPublicUrl } = storageApi({ createSignedUrls });
    queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      {
        table: 'portfolio_items',
        result: {
          data: [
            {
              id: ITEM_ID,
              worker_id: WORKER_PROFILE_ID,
              title: 'Kitchen cabinet install',
              description: null,
              project_scale: 'small',
              created_at: '2026-09-14T00:00:00Z',
            },
          ],
          error: null,
        },
      },
      {
        table: 'portfolio_item_images',
        result: {
          data: [
            {
              id: IMAGE_ID,
              portfolio_item_id: ITEM_ID,
              storage_path: JPEG_PATH,
              position: 1,
              created_at: '2026-09-14T00:00:00Z',
            },
          ],
          error: null,
        },
      },
    ]);

    const loaded = await loadOwnPortfolio(USER_ID);
    expect(loaded.kind).toBe('ready');
    if (loaded.kind !== 'ready') return;
    expect(loaded.items).toHaveLength(1);
    expect(loaded.items[0]?.images).toEqual([
      {
        id: IMAGE_ID,
        portfolioItemId: ITEM_ID,
        storagePath: JPEG_PATH,
        position: 1,
        createdAt: '2026-09-14T00:00:00Z',
        signedUrl: null,
      },
    ]);
    expect(createSignedUrls).toHaveBeenCalledWith([JPEG_PATH], 3600);
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
});

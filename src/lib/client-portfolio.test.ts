import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assembleClientPortfolioItems,
  isClientPortfolioVisible,
  loadClientBookingPortfolio,
  resolveClientPortfolioAccess,
  type ClientPortfolioBooking,
} from './client-portfolio';
import type { PortfolioItem, PortfolioItemImage } from './portfolio';
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

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_BOOKING_ID = '66666666-6666-4666-8666-666666666666';
const WORKER_USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_WORKER_USER_ID = '88888888-8888-4888-8888-888888888888';
const WORKER_PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_NEW_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_OLD_ID = '55555555-5555-4555-8555-555555555555';
const IMAGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IMAGE_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const JPEG_PATH = `${WORKER_PROFILE_ID}/${ITEM_NEW_ID}/${IMAGE_ID}.jpg`;

const fromMock = vi.mocked(supabase.from);
const storageFromMock = vi.mocked(supabase.storage.from);

function clientBooking(overrides: Partial<ClientPortfolioBooking> = {}): ClientPortfolioBooking {
  return {
    booking_id: BOOKING_ID,
    booking_status: 'confirmed',
    worker_user_id: WORKER_USER_ID,
    worker_full_name: 'Demo Worker',
    ...overrides,
  };
}

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };

function chain(result: QueryResult) {
  const final = Promise.resolve(result);
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = vi.fn(self);
  api.eq = vi.fn(self);
  api.in = vi.fn(self);
  api.order = vi.fn(self);
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

function storageApi(overrides: { createSignedUrls?: ReturnType<typeof vi.fn> } = {}) {
  const createSignedUrls =
    overrides.createSignedUrls ??
    vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null })),
      error: null,
    }));
  const getPublicUrl = vi.fn();
  const upload = vi.fn();
  const remove = vi.fn();
  storageFromMock.mockReturnValue({
    createSignedUrls,
    getPublicUrl,
    upload,
    remove,
  } as never);
  return { createSignedUrls, getPublicUrl, upload, remove };
}

describe('isClientPortfolioVisible', () => {
  it('enables Client portfolio entry while confirmed', () => {
    expect(isClientPortfolioVisible('confirmed')).toBe(true);
  });

  it('hides Client portfolio entry while pending', () => {
    expect(isClientPortfolioVisible('pending')).toBe(false);
  });

  it('hides Client portfolio entry after completion', () => {
    expect(isClientPortfolioVisible('completed')).toBe(false);
  });

  it('hides Client portfolio entry after cancellation', () => {
    expect(isClientPortfolioVisible('cancelled')).toBe(false);
  });

  it('hides Client portfolio entry for no_show', () => {
    expect(isClientPortfolioVisible('no_show')).toBe(false);
  });
});

describe('resolveClientPortfolioAccess', () => {
  it('accepts only a booking id and the caller own booking list', () => {
    expect(resolveClientPortfolioAccess.length).toBe(2);
    expect(resolveClientPortfolioAccess(BOOKING_ID, [clientBooking()])).toEqual({
      kind: 'allowed',
      workerUserId: WORKER_USER_ID,
      workerName: 'Demo Worker',
    });
  });

  it('rejects an invalid booking id before consulting bookings', () => {
    expect(resolveClientPortfolioAccess('not-a-uuid', [clientBooking()])).toEqual({ kind: 'invalid' });
    expect(resolveClientPortfolioAccess(WORKER_USER_ID, [clientBooking()])).toEqual({ kind: 'missing' });
  });

  it('requires the booking to exist in the caller own Client bookings', () => {
    expect(resolveClientPortfolioAccess(OTHER_BOOKING_ID, [clientBooking()])).toEqual({ kind: 'missing' });
  });

  it('stops a non-confirmed own booking before portfolio access', () => {
    expect(
      resolveClientPortfolioAccess(BOOKING_ID, [clientBooking({ booking_status: 'completed' })])
    ).toEqual({ kind: 'revoked' });
  });

  it('does not treat another Worker user id as booking authority', () => {
    const own = clientBooking({ worker_user_id: WORKER_USER_ID });
    expect(resolveClientPortfolioAccess(OTHER_WORKER_USER_ID, [own])).toEqual({ kind: 'missing' });
  });
});

describe('assembleClientPortfolioItems', () => {
  const older: Omit<PortfolioItem, 'images'> = {
    id: ITEM_OLD_ID,
    workerId: WORKER_PROFILE_ID,
    title: 'Older fence repair',
    description: 'Repaired posts.',
    projectScale: 'small',
    createdAt: '2026-09-01T00:00:00Z',
  };
  const newer: Omit<PortfolioItem, 'images'> = {
    id: ITEM_NEW_ID,
    workerId: WORKER_PROFILE_ID,
    title: 'Kitchen cabinet install',
    description: null,
    projectScale: 'medium',
    createdAt: '2026-09-14T00:00:00Z',
  };

  it('orders items newest-first', () => {
    const assembled = assembleClientPortfolioItems([older, newer], []);
    expect(assembled.map((item) => item.id)).toEqual([ITEM_NEW_ID, ITEM_OLD_ID]);
  });

  it('orders images by position ascending', () => {
    const second: PortfolioItemImage = {
      id: IMAGE_ID_2,
      portfolioItemId: ITEM_NEW_ID,
      storagePath: `${WORKER_PROFILE_ID}/${ITEM_NEW_ID}/${IMAGE_ID_2}.png`,
      position: 2,
      createdAt: '2026-09-14T00:00:00Z',
      signedUrl: 'https://signed.example/two',
    };
    const first: PortfolioItemImage = {
      id: IMAGE_ID,
      portfolioItemId: ITEM_NEW_ID,
      storagePath: JPEG_PATH,
      position: 1,
      createdAt: '2026-09-14T00:00:00Z',
      signedUrl: 'https://signed.example/one',
    };
    const assembled = assembleClientPortfolioItems([newer], [second, first]);
    expect(assembled[0]?.images.map((image) => image.position)).toEqual([1, 2]);
  });

  it('keeps a 0-image portfolio item present', () => {
    const assembled = assembleClientPortfolioItems([newer], []);
    expect(assembled).toHaveLength(1);
    expect(assembled[0]?.title).toBe('Kitchen cabinet install');
    expect(assembled[0]?.images).toEqual([]);
  });

  it('keeps item text when a signed URL is missing', () => {
    const unsigned: PortfolioItemImage = {
      id: IMAGE_ID,
      portfolioItemId: ITEM_NEW_ID,
      storagePath: JPEG_PATH,
      position: 1,
      createdAt: '2026-09-14T00:00:00Z',
      signedUrl: null,
    };
    const assembled = assembleClientPortfolioItems([newer], [unsigned]);
    expect(assembled[0]?.title).toBe('Kitchen cabinet install');
    expect(assembled[0]?.projectScale).toBe('medium');
    expect(assembled[0]?.images[0]?.signedUrl).toBeNull();
  });
});

describe('loadClientBookingPortfolio', () => {
  beforeEach(() => {
    fromMock.mockReset();
    storageFromMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fails an invalid booking UUID before any booking or portfolio query', async () => {
    const loadBookings = vi.fn(async () => [clientBooking()]);
    const loaded = await loadClientBookingPortfolio('not-a-uuid', { loadBookings });
    expect(loaded).toEqual({ kind: 'unavailable' });
    expect(loadBookings).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does not query portfolio when the booking is not in the caller list', async () => {
    const loadBookings = vi.fn(async () => [clientBooking()]);
    const loaded = await loadClientBookingPortfolio(OTHER_BOOKING_ID, { loadBookings });
    expect(loaded).toEqual({ kind: 'unavailable' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does not query portfolio when the own booking is not confirmed', async () => {
    const loadBookings = vi.fn(async () => [clientBooking({ booking_status: 'completed' })]);
    const loaded = await loadClientBookingPortfolio(BOOKING_ID, { loadBookings });
    expect(loaded).toEqual({ kind: 'revoked' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does not treat a Worker user id as a booking id', async () => {
    const loadBookings = vi.fn(async () => [clientBooking()]);
    const loaded = await loadClientBookingPortfolio(WORKER_USER_ID, { loadBookings });
    expect(loaded).toEqual({ kind: 'unavailable' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('loads only the assigned Worker portfolio and keeps text if signing fails', async () => {
    const loadBookings = vi.fn(async () => [clientBooking()]);
    const { createSignedUrls, getPublicUrl, upload, remove } = storageApi({
      createSignedUrls: vi.fn(async () => ({ data: null, error: { message: 'sign failed' } })),
    });
    queueFrom([
      { table: 'worker_profiles', result: { data: { id: WORKER_PROFILE_ID }, error: null } },
      {
        table: 'portfolio_items',
        result: {
          data: [
            {
              id: ITEM_NEW_ID,
              worker_id: WORKER_PROFILE_ID,
              title: 'Kitchen cabinet install',
              description: 'Replaced lower cabinets.',
              project_scale: 'medium',
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
              portfolio_item_id: ITEM_NEW_ID,
              storage_path: JPEG_PATH,
              position: 1,
              created_at: '2026-09-14T00:00:00Z',
            },
          ],
          error: null,
        },
      },
    ]);

    const loaded = await loadClientBookingPortfolio(BOOKING_ID, { loadBookings });
    expect(loaded.kind).toBe('ready');
    if (loaded.kind !== 'ready') return;
    expect(loaded.workerName).toBe('Demo Worker');
    expect(loaded.items).toHaveLength(1);
    expect(loaded.items[0]?.title).toBe('Kitchen cabinet install');
    expect(loaded.items[0]?.description).toBe('Replaced lower cabinets.');
    expect(loaded.items[0]?.images[0]?.signedUrl).toBeNull();
    expect(createSignedUrls).toHaveBeenCalledWith([JPEG_PATH], 3600);
    expect(getPublicUrl).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(fromMock.mock.calls.map((call) => call[0])).toEqual([
      'worker_profiles',
      'portfolio_items',
      'portfolio_item_images',
    ]);
  });
});

describe('client portfolio module surface', () => {
  it('exposes no create, update, delete, or upload operations', async () => {
    const clientPortfolio = await import('./client-portfolio');
    expect(clientPortfolio).not.toHaveProperty('createOwnPortfolioItem');
    expect(clientPortfolio).not.toHaveProperty('deleteOwnPortfolioItem');
    expect(clientPortfolio).not.toHaveProperty('create');
    expect(clientPortfolio).not.toHaveProperty('update');
    expect(clientPortfolio).not.toHaveProperty('delete');
    expect(clientPortfolio).not.toHaveProperty('upload');
    expect(typeof clientPortfolio.loadClientBookingPortfolio).toBe('function');
    expect(clientPortfolio.loadClientBookingPortfolio.length).toBe(1);
  });
});

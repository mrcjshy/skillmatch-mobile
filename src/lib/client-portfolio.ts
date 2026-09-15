/**
 * R5D-CLIENT-M1 — confirmed-booking Client portfolio read.
 *
 * Authority is bookingId → own confirmed Booking → assigned Worker.
 * Route params never carry worker identifiers as portfolio authority.
 * Worker authoring (create / delete / upload) is not imported here.
 */

import {
  PortfolioError,
  type PortfolioImage,
  type PortfolioItem,
  type PortfolioItemImage,
  type ProjectScale,
} from './portfolio';
import {
  PORTFOLIO_BUCKET,
  PORTFOLIO_SIGNED_URL_EXPIRES_IN,
  logPortfolioImageFailure,
} from './portfolio-images';
import { supabase } from './supabase';

export const CLIENT_PORTFOLIO_PATH = '/client/portfolio';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CLIENT_PORTFOLIO_COPY = {
  title: 'Portfolio',
  empty: 'No projects yet.',
  loading: 'Loading portfolio…',
  retry: 'Try again',
  loadFailed: 'This portfolio could not be loaded. Please try again.',
  unavailable: 'This portfolio is unavailable.',
  imageUnavailable: 'Photo could not be loaded.',
  viewAction: 'View Portfolio',
} as const;

export function isClientPortfolioVisible(status: string): boolean {
  return status === 'confirmed';
}

export function isClientPortfolioBookingId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export type ClientPortfolioBooking = {
  booking_id: string;
  booking_status: string;
  worker_user_id: string;
  worker_full_name: string | null;
};

export type ClientPortfolioAccess =
  | { kind: 'invalid' }
  | { kind: 'missing' }
  | { kind: 'revoked' }
  | { kind: 'allowed'; workerUserId: string; workerName: string | null };

export type ClientPortfolioLoad =
  | { kind: 'unavailable' }
  | { kind: 'revoked' }
  | { kind: 'ready'; workerName: string | null; items: PortfolioItem[] };

export function resolveClientPortfolioAccess(
  bookingId: string | null | undefined,
  bookings: readonly ClientPortfolioBooking[]
): ClientPortfolioAccess {
  if (!isClientPortfolioBookingId(bookingId)) return { kind: 'invalid' };
  const booking = bookings.find((row) => row.booking_id === bookingId);
  if (booking === undefined) return { kind: 'missing' };
  if (!isClientPortfolioVisible(booking.booking_status)) return { kind: 'revoked' };
  if (booking.worker_user_id === '') return { kind: 'missing' };
  return {
    kind: 'allowed',
    workerUserId: booking.worker_user_id,
    workerName: booking.worker_full_name,
  };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isProjectScale(value: unknown): value is ProjectScale {
  return value === 'small' || value === 'medium' || value === 'large';
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function isPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

function toPortfolioItem(row: unknown): Omit<PortfolioItem, 'images'> | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id !== '' ? r.id : null;
  const workerId = typeof r.worker_id === 'string' && r.worker_id !== '' ? r.worker_id : null;
  const title = text(r.title);
  if (id === null || workerId === null || title === null || !isProjectScale(r.project_scale)) {
    return null;
  }
  return {
    id,
    workerId,
    title,
    description: text(r.description),
    projectScale: r.project_scale,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  };
}

function toPortfolioImage(row: unknown): PortfolioImage | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id !== '' ? r.id : null;
  const portfolioItemId =
    typeof r.portfolio_item_id === 'string' && r.portfolio_item_id !== '' ? r.portfolio_item_id : null;
  const storagePath = typeof r.storage_path === 'string' && r.storage_path !== '' ? r.storage_path : null;
  if (id === null || portfolioItemId === null || storagePath === null || !isPosition(r.position)) {
    return null;
  }
  return {
    id,
    portfolioItemId,
    storagePath,
    position: r.position,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  };
}

export function assembleClientPortfolioItems(
  items: readonly Omit<PortfolioItem, 'images'>[],
  images: readonly PortfolioItemImage[]
): PortfolioItem[] {
  const imagesByItem = new Map<string, PortfolioItemImage[]>();
  for (const image of images) {
    const current = imagesByItem.get(image.portfolioItemId) ?? [];
    current.push(image);
    imagesByItem.set(image.portfolioItemId, current);
  }

  return [...items]
    .sort((a, b) => compareText(b.createdAt ?? '', a.createdAt ?? '') || compareText(b.id, a.id))
    .map((item) => ({
      ...item,
      images: [...(imagesByItem.get(item.id) ?? [])].sort(
        (a, b) => a.position - b.position || compareText(a.id, b.id)
      ),
    }));
}

async function resolveCounterpartWorkerProfileId(workerUserId: string): Promise<string | null> {
  const res = await supabase.from('worker_profiles').select('id').eq('user_id', workerUserId).maybeSingle();
  if (res.error) throw new PortfolioError('profile read failed', res.error.code ?? null);
  return typeof res.data?.id === 'string' && res.data.id !== '' ? res.data.id : null;
}

async function attachSignedUrls(images: PortfolioImage[]): Promise<PortfolioItemImage[]> {
  if (images.length === 0) return [];
  const paths = images.map((image) => image.storagePath);
  const signed = await supabase.storage.from(PORTFOLIO_BUCKET).createSignedUrls(paths, PORTFOLIO_SIGNED_URL_EXPIRES_IN);
  const byPath = new Map<string, string | null>();
  if (signed.error || !Array.isArray(signed.data)) {
    logPortfolioImageFailure('signed_url', signed.error ?? { message: 'signed url response missing' });
    for (const image of images) byPath.set(image.storagePath, null);
  } else {
    for (const row of signed.data) {
      const path = typeof row.path === 'string' ? row.path : '';
      const url =
        typeof row.signedUrl === 'string' && row.signedUrl !== '' && row.error == null ? row.signedUrl : null;
      if (path !== '') byPath.set(path, url);
    }
  }
  return images.map((image) => ({
    ...image,
    signedUrl: byPath.get(image.storagePath) ?? null,
  }));
}

export type ClientPortfolioDeps = {
  loadBookings?: () => Promise<readonly ClientPortfolioBooking[]>;
};

export async function loadClientBookingPortfolio(
  bookingId: string | null,
  deps: ClientPortfolioDeps = {}
): Promise<ClientPortfolioLoad> {
  if (!isClientPortfolioBookingId(bookingId)) return { kind: 'unavailable' };

  const loadBookings = deps.loadBookings;
  if (loadBookings === undefined) {
    throw new PortfolioError('portfolio read failed', null);
  }
  const bookings = await loadBookings();
  const access = resolveClientPortfolioAccess(bookingId, bookings);
  if (access.kind === 'invalid' || access.kind === 'missing') return { kind: 'unavailable' };
  if (access.kind === 'revoked') return { kind: 'revoked' };

  const workerProfileId = await resolveCounterpartWorkerProfileId(access.workerUserId);
  if (workerProfileId === null) {
    return { kind: 'ready', workerName: access.workerName, items: [] };
  }

  const itemsRes = await supabase
    .from('portfolio_items')
    .select('id, worker_id, title, description, project_scale, created_at')
    .eq('worker_id', workerProfileId)
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });
  if (itemsRes.error) throw new PortfolioError('portfolio read failed', itemsRes.error.code ?? null);

  const baseItems = (itemsRes.data ?? [])
    .map(toPortfolioItem)
    .filter((item): item is Omit<PortfolioItem, 'images'> => item !== null && item.workerId === workerProfileId);

  if (baseItems.length === 0) {
    return { kind: 'ready', workerName: access.workerName, items: [] };
  }

  const imageRes = await supabase
    .from('portfolio_item_images')
    .select('id, portfolio_item_id, storage_path, position, created_at')
    .in(
      'portfolio_item_id',
      baseItems.map((item) => item.id)
    )
    .order('position', { ascending: true });
  if (imageRes.error) throw new PortfolioError('portfolio image read failed', imageRes.error.code ?? null);

  const metadata = (imageRes.data ?? [])
    .map(toPortfolioImage)
    .filter((image): image is PortfolioImage => image !== null);
  const displayed = await attachSignedUrls(metadata);

  return {
    kind: 'ready',
    workerName: access.workerName,
    items: assembleClientPortfolioItems(baseItems, displayed),
  };
}

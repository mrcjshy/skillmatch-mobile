/**
 * RF-L limited foreground location sharing — pure rules and RPC wrappers.
 *
 * The server is the authority for who may share or see a position
 * (RF-01 RPCs). Everything here is presentation or transport:
 * - ages come from the server's `server_now` plus local elapsed time, so a
 *   wrong phone clock cannot make a pin look live;
 * - a read lease (60 s) bounds how long already-received coordinates may be
 *   shown without a successful re-authorization;
 * - the share id is held only by the sharing controller and is never
 *   returned by a read.
 */

import { supabase } from './supabase';

export const LIVE_MS = 45_000;
export const VISIBLE_MS = 600_000;
export const LEASE_RENEW_MS = 30_000;
export const MIN_MOVE_M = 15;
export const HEARTBEAT_MS = 30_000;
export const MAX_READING_AGE_MS = 30_000;
export const APPROXIMATE_ACCURACY_M = 100;

export type PinRole = 'worker' | 'client';
export type Pin = { role: PinRole; latitude: number; longitude: number; accuracyM: number; receivedAt: string };
export type MyShare = 'yours_active' | 'active_on_other_device' | 'none';
export type PinsRead = { serverNow: string; leaseExpiresAt: string; myShare: MyShare; counterpart: Pin | null };
export type Freshness = 'live' | 'stale' | 'expired';
export type PublishResult = 'ok' | 'not_current' | 'expired' | 'stale_seq' | 'throttled';
export type PinsErrorKind = 'denied' | 'invalid' | 'network';

const ms = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** Server-relative age of a reading at local time `nowMs`. */
export function pinFreshness(receivedAt: string, serverNow: string, readAtMs: number, nowMs: number): Freshness {
  const received = ms(receivedAt);
  const server = ms(serverNow);
  if (received === null || server === null) return 'expired';
  const age = server - received + Math.max(0, nowMs - readAtMs);
  if (age <= LIVE_MS) return 'live';
  if (age <= VISIBLE_MS) return 'stale';
  return 'expired';
}

export function leaseValid(leaseExpiresAt: string, serverNow: string, readAtMs: number, nowMs: number): boolean {
  const lease = ms(leaseExpiresAt);
  const server = ms(serverNow);
  if (lease === null || server === null) return false;
  return nowMs - readAtMs < lease - server;
}

type Point = { latitude: number; longitude: number };

export function distanceM(a: Point, b: Point): number {
  const r = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function shouldPublish(
  last: (Point & { sentAtMs: number }) | null,
  next: Point & { capturedAtMs: number },
  nowMs: number,
): boolean {
  if (nowMs - next.capturedAtMs > MAX_READING_AGE_MS) return false;
  if (last === null) return true;
  return distanceM(last, next) >= MIN_MOVE_M || nowMs - last.sentAtMs >= HEARTBEAT_MS;
}

export function isApproximate(accuracyM: number): boolean {
  return accuracyM > APPROXIMATE_ACCURACY_M;
}

/** Groups screen points closer than `thresholdPx`, so overlapping markers
 * become one selectable chip listing every participant. */
export function mergeOverlap<T extends string>(points: { id: T; x: number; y: number }[], thresholdPx = 48) {
  const groups: { ids: T[]; x: number; y: number }[] = [];
  for (const p of points) {
    const g = groups.find((group) => Math.hypot(group.x - p.x, group.y - p.y) < thresholdPx);
    if (g) g.ids.push(p.id);
    else groups.push({ ids: [p.id], x: p.x, y: p.y });
  }
  return groups;
}

const isCoord = (lat: unknown, lng: unknown) =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

export function parsePinsRead(data: unknown): PinsRead | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.server_now !== 'string' || typeof d.lease_expires_at !== 'string') return null;
  if (d.my_share !== 'yours_active' && d.my_share !== 'active_on_other_device' && d.my_share !== 'none') return null;
  let counterpart: Pin | null = null;
  if (d.counterpart !== null && d.counterpart !== undefined) {
    const c = d.counterpart as Record<string, unknown>;
    if ((c.role !== 'worker' && c.role !== 'client') || !isCoord(c.latitude, c.longitude) ||
        typeof c.accuracy_m !== 'number' || typeof c.received_at !== 'string') return null;
    counterpart = { role: c.role, latitude: c.latitude as number, longitude: c.longitude as number,
      accuracyM: c.accuracy_m, receivedAt: c.received_at };
  }
  return { serverNow: d.server_now, leaseExpiresAt: d.lease_expires_at, myShare: d.my_share, counterpart };
}

/**
 * The only live position SkillMatch shows is the Worker's, to the booking's
 * Client. A Worker never keeps a Client position, even if a server that still
 * returns one (before the RF-04 enforcement) sends it.
 */
export function workerPinForViewer(viewerRole: PinRole, read: PinsRead): PinsRead {
  return viewerRole === 'client' && read.counterpart?.role === 'worker' ? read : { ...read, counterpart: null };
}

export function classifyPinsError(error: { code?: string | null } | null): PinsErrorKind {
  if (error?.code === '42501') return 'denied';
  if (error?.code === '22023') return 'invalid';
  return 'network';
}

export class PinsError extends Error {
  constructor(readonly kind: PinsErrorKind, readonly code: string | null) {
    super(`location pins ${kind}`);
  }
}

type RpcClient = Pick<typeof supabase, 'rpc'>;

async function call<T>(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn as never, args as never);
  if (error) throw new PinsError(classifyPinsError(error), error.code ?? null);
  return data as T;
}

export function createPinsApi(client: RpcClient = supabase) {
  return {
    start: (bookingId: string) => call<string>(client, 'start_my_booking_location_share', { p_booking_id: bookingId }),
    publish: (a: { bookingId: string; shareId: string; seq: number; latitude: number; longitude: number; accuracyM: number; capturedAtMs: number }) =>
      call<PublishResult>(client, 'publish_my_booking_location', {
        p_booking_id: a.bookingId, p_share_id: a.shareId, p_seq: a.seq, p_latitude: a.latitude,
        p_longitude: a.longitude, p_accuracy_m: Math.min(5000, Math.max(0, a.accuracyM)),
        p_captured_at: new Date(a.capturedAtMs).toISOString(),
      }),
    stop: (bookingId: string, shareId: string) =>
      call<string>(client, 'stop_my_booking_location_share', { p_booking_id: bookingId, p_share_id: shareId }),
    stopAll: (bookingId: string) => call<number>(client, 'stop_all_my_booking_location_shares', { p_booking_id: bookingId }),
    read: async (bookingId: string, shareId: string | null): Promise<PinsRead | 'denied' | 'error'> => {
      try {
        const parsed = parsePinsRead(await call<unknown>(client, 'get_booking_location_pins',
          { p_booking_id: bookingId, p_share_id: shareId }));
        return parsed ?? 'error';
      } catch (e) {
        return e instanceof PinsError && e.kind === 'denied' ? 'denied' : 'error';
      }
    },
  };
}

/**
 * Booking Details freshness / terminal-privacy helpers (R6-8D-FIX).
 *
 * Broadcast is an invalidation signal only. Status and protected fields
 * always come from the participant list RPC after a re-read. This module
 * never reads an event payload.
 */

import { bookingMessagesTopic } from './realtime';

export type DetailsRefreshReason = 'focus' | 'status-changed' | 'manual' | 'subscribed';

/**
 * The booking topic is authorized only while confirmed. Details therefore
 * listens only after an authoritative confirmed read, and removes the
 * channel once the re-read reports any other status.
 */
export function isBookingStatusChangedListenStatus(status: string | null | undefined): boolean {
  return status === 'confirmed';
}

/**
 * Confirmed-only contact, exact address, map, lifecycle, chat, and
 * portfolio stay hidden while a re-read is outstanding after a status
 * invalidation or a focus return onto a still-confirmed snapshot.
 */
export function isProtectedProjectionReleased(
  status: string,
  suppressProtected: boolean
): boolean {
  return !suppressProtected && status === 'confirmed';
}

/**
 * Focus onto a confirmed snapshot is the Chat → Details return path.
 * Suppress first so a missed booking_status_changed cannot flash
 * address/contact/actions. A completed snapshot is already suppressed.
 * Manual refresh and SUBSCRIBED reconnect do not hide a live confirmed
 * projection before the read returns.
 */
export function shouldSuppressProtectedBeforeRefresh(input: {
  reason: DetailsRefreshReason;
  displayedStatus: string | null;
}): boolean {
  if (input.reason === 'status-changed') return true;
  return input.reason === 'focus' && input.displayedStatus === 'confirmed';
}

export function isMatchingBookingBroadcastTopic(bookingId: string, topic: string): boolean {
  return topic === bookingMessagesTopic(bookingId);
}

export function stripProtectedBookingFields<T extends { job_address: string | null }>(booking: T): T {
  const next = { ...booking, job_address: null };
  if ('client_full_name' in next) {
    return { ...next, client_full_name: null, client_phone: null };
  }
  if ('worker_full_name' in next) {
    return {
      ...next,
      worker_full_name: null,
      worker_phone: null,
      worker_barangay: null,
      worker_skills: null,
      worker_is_verified: null,
      worker_rating_avg: null,
      worker_rating_count: null,
    };
  }
  return next;
}

/**
 * Serializes authoritative reads so a slower older response cannot
 * restore a confirmed projection after a newer focus, event, booking
 * change, or unmount.
 */
export function createLoadGenerationTracker() {
  let generation = 0;
  let cancelled = false;

  return {
    start(): number {
      generation += 1;
      return generation;
    },
    isCurrent(token: number): boolean {
      return !cancelled && token === generation;
    },
    cancel(): void {
      cancelled = true;
    },
  };
}

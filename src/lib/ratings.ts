/**
 * BL-01B-UI Rating contract.
 *
 * Ratings are Client -> assigned Worker only, on a completed Booking the
 * Client owns, exactly once, and immutable once written. This module is the
 * single place that encodes those rules for the UI.
 *
 * THE WRITE PATH IS AN RPC, NOT A TABLE INSERT
 * --------------------------------------------
 * After BL-01B-DB the client holds exactly SELECT on `public.ratings` and
 * nothing else -- INSERT, UPDATE and DELETE are all revoked, and there is no
 * INSERT policy either. `public.rate_my_completed_worker()` is the sole writer.
 *
 * It takes only `booking_id`, `score` and `comment`. It does NOT take a rater
 * or a rated user: `rated_by` is `auth.uid()` and `rated_user` is read from the
 * Booking, server-side. Identity substitution is not something this module
 * declines to do -- there is no parameter through which to attempt it.
 *
 * THE READ IS OWN-ROW ONLY
 * ------------------------
 * The SELECT policy is `rated_by = auth.uid() OR rated_user = auth.uid()`, so
 * the "have I already rated this?" query below returns the caller's own rows
 * and nothing else. RLS enforces that, not the filter.
 *
 * WHAT THIS MODULE DOES NOT DO
 * ----------------------------
 * No editing, no deletion, no Worker-to-Client rating, no rating management or
 * review feed, no rating notifications, no sorting or filtering, no Realtime
 * and no polling. Displayed aggregates keep coming from the N11 Booking-list
 * RPC, which is unchanged.
 */

import { supabase } from '@/lib/supabase';

/** Mirrors the RPC's own limit on the normalised comment. */
export const RATING_COMMENT_MAX = 1000;

/** The five values `ratings_score_check` permits. */
export const RATING_SCORES = [1, 2, 3, 4, 5] as const;

export type RatingScore = (typeof RATING_SCORES)[number];

/**
 * Only completed Bookings can be rated. This gates the control; the RPC
 * re-checks the status server-side and is what actually decides.
 */
export function isRateableStatus(status: string): boolean {
  return status === 'completed';
}

/* ------------------------------------------------------------------ *
 * Comment normalisation
 * ------------------------------------------------------------------ */

export type CommentValidation =
  | { ok: true; comment: string | null }
  | { ok: false; reason: 'too_long' };

/**
 * Normalise exactly the way the RPC does: trim, and treat empty or
 * whitespace-only as "no comment" rather than as a blank string, so absence
 * has one representation instead of three. Length is measured on the trimmed
 * value, so trailing whitespace cannot push a valid comment over the limit.
 *
 * Over-length is reported, never truncated -- a truncated comment would
 * misrepresent what the Client wrote.
 */
export function validateComment(raw: string): CommentValidation {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, comment: null };
  if (trimmed.length > RATING_COMMENT_MAX) return { ok: false, reason: 'too_long' };
  return { ok: true, comment: trimmed };
}

/** Counts down against the same trimmed length the server measures. */
export function remainingCommentCharacters(raw: string): number {
  return RATING_COMMENT_MAX - raw.trim().length;
}

/* ------------------------------------------------------------------ *
 * Error classification
 * ------------------------------------------------------------------ */

/**
 * Carries the SQLSTATE so screens branch on `error.code` and never on
 * `error.message` -- the same lesson N11, N12 and BL-01C recorded, where one
 * code arrives with several different message texts.
 */
export class RatingError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'RatingError';
    this.code = code;
  }
}

/** Account/role class: not an active Client, or no EXECUTE. */
const FORBIDDEN = '42501';
/**
 * Conflict class. The RPC deliberately collapses "no such Booking", "someone
 * else's Booking", "not completed", "no assigned Worker" and "already rated"
 * into this ONE code, so a Client cannot use rating attempts to discover
 * whether another Client's Booking exists. The UI therefore must NOT claim
 * which of those happened -- in particular it must not say "you already rated
 * this", because it genuinely does not know that.
 */
const CONFLICT = 'SM409';
/** Caller-input class: score outside 1..5, or comment over the limit. */
const INVALID_INPUT = '22023';

export const COPY = {
  action: 'Rate Worker',
  heading: 'Rate this worker',
  scoreLabel: 'Score',
  commentLabel: 'Comment (optional)',
  commentPlaceholder: 'How did it go?',
  submit: 'Submit rating',
  submitting: 'Submitting…',
  cancel: 'Cancel',
  rated: 'You rated this booking.',
  /**
   * Covers every collapsed SM409 cause without asserting which one applies.
   * "Already rated" is deliberately not claimed here.
   */
  conflict: 'This booking can no longer be rated.',
  invalidScore: 'Choose a rating from 1 to 5.',
  invalidComment: `Comment must be ${RATING_COMMENT_MAX} characters or less.`,
  forbidden: "You don't have permission to rate this booking.",
  generic: "We couldn't submit your rating. Please try again.",
  loadFailed: "We couldn't check your existing ratings. Pull down to refresh.",
  /** The rating IS written; only the follow-up read failed. */
  refreshFailed:
    'Your rating was submitted, but the list could not be refreshed. Pull down to refresh.',
} as const;

/**
 * Maps a submit failure to copy. Raw backend text is never surfaced, and a
 * constraint name or SQL internal can never reach the screen because only the
 * code is consulted.
 */
export function submitErrorCopy(e: unknown): string {
  const code = e instanceof RatingError ? e.code : null;
  if (code === CONFLICT) return COPY.conflict;
  if (code === INVALID_INPUT) return COPY.invalidComment;
  if (code === FORBIDDEN) return COPY.forbidden;
  return COPY.generic;
}

/* ------------------------------------------------------------------ *
 * Server calls
 * ------------------------------------------------------------------ */

/**
 * Which of these Bookings the caller has already rated.
 *
 * Only `booking_id` is selected: the screen needs to know whether a row exists,
 * not who wrote it or what it said, and requesting `rated_by` / `rated_user`
 * would pull identifiers the UI has no use for. RLS restricts the result to the
 * caller's own rows regardless of this filter.
 *
 * An empty input short-circuits rather than issuing an `in.()` with no values.
 */
export async function fetchMyRatedBookingIds(bookingIds: string[]): Promise<Set<string>> {
  if (bookingIds.length === 0) return new Set();

  const res = await supabase.from('ratings').select('booking_id').in('booking_id', bookingIds);

  if (res.error) {
    throw new RatingError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  const rated = new Set<string>();
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const id = (row as Record<string, unknown>).booking_id;
    if (typeof id === 'string') rated.add(id);
  }
  return rated;
}

/**
 * Submit one rating.
 *
 * No rater and no rated user are passed, because the RPC has no such
 * parameters. The Booking id is the only thing that identifies the target, and
 * the server derives everything else from it.
 */
export async function submitRating(
  bookingId: string,
  score: RatingScore,
  comment: string | null
): Promise<void> {
  const res = await supabase.rpc('rate_my_completed_worker', {
    p_booking_id: bookingId,
    p_score: score,
    p_comment: comment,
  });

  if (res.error) {
    throw new RatingError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
}

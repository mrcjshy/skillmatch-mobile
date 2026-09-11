import { formatCardDateTime } from './date-time';

/**
 * N11-UI shared Booking presentation contract.
 *
 * The Worker list and the Client list are two views of the SAME server
 * contract (`public.list_my_worker_bookings()` /
 * `public.list_my_client_bookings()`, N11-DB-01), and the rule that decides
 * whether the counterparty block is released is privacy-critical. Encoding it
 * once here is the point of this module: if the two screens each carried their
 * own copy, they could silently drift and one of them could start rendering a
 * block the other suppresses.
 *
 * WHAT THIS MODULE DOES NOT DO
 * ----------------------------
 * It does not decide what data exists. Suppression is performed SERVER-SIDE:
 * for a non-released status the RPC already returns NULL for every
 * counterparty field, and this module never sees the hidden values. The
 * release rule below therefore only chooses WHICH BLOCK TO RENDER — it can
 * reveal nothing, because there is nothing in the row to reveal.
 *
 * Nothing here reconstructs Booking ownership, re-sorts rows, or infers a
 * Booking from job status, matching results or local acceptance state. The RPC
 * result is authoritative (N11-UI §12).
 */

/**
 * The five values `bookings_status_check` permits, read from the schema rather
 * than assumed. `ongoing` is NOT a domain value and must never appear.
 */
export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

export function isBookingStatus(v: string): v is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(v);
}

/**
 * Human label for a status. An unrecognised value is rendered verbatim rather
 * than coerced into a known one: inventing a status would misreport the
 * server, and the check constraint makes this unreachable in practice.
 */
export function formatBookingStatus(status: string): string {
  return isBookingStatus(status) ? BOOKING_STATUS_LABEL[status] : status;
}

/**
 * R3B live release rule: ownership still decides whether a Booking is LISTED
 * (every status is listed, so history never disappears); status decides only
 * whether the COUNTERPARTY projection was released.
 *
 *   confirmed                     -> released
 *   completed / cancelled /
 *   pending / no_show / unknown   -> suppressed (fields arrive NULL)
 */
export function isCounterpartyReleased(status: string): boolean {
  return status === 'confirmed';
}

/**
 * Ordinary chat is available only while the Booking is confirmed. Terminal,
 * pending, no_show, and unknown statuses fail closed: no Open Chat entry and
 * no conversation UI on a direct route.
 */
export function isBookingChatAvailable(status: string): boolean {
  return isCounterpartyReleased(status);
}

/* ------------------------------------------------------------------ *
 * Row coercion
 *
 * PostgREST may serialise `numeric` as a JSON number or as a string depending
 * on server version, and `text[]` arrives as a JSON array. Coerce rather than
 * assume — the existing screens follow the same convention of never trusting a
 * row's shape.
 * ------------------------------------------------------------------ */

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function toNullableText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

export function toNullableBoolean(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

/**
 * `worker_skills` is deliberately THREE-VALUED and the distinction must not be
 * flattened (N11-DB-01):
 *
 *   null  -> the profile projection is suppressed for this status
 *   []    -> released, and the Worker genuinely has no skills
 *   [...] -> released, already alphabetical and de-duplicated by the server
 *
 * A non-array (including SQL NULL) therefore maps to null, NOT to [].
 */
export function toStringArrayOrNull(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((s): s is string => typeof s === 'string');
}

/* ------------------------------------------------------------------ *
 * Formatting
 *
 * Every formatter takes the RAW value and is called during render, so no
 * formatted string is ever held in state. That is what makes the timezone
 * behaviour correct: after a device timezone change and a reload, timestamps
 * are re-derived from the stored ISO instant rather than replayed from a
 * stale cached string.
 * ------------------------------------------------------------------ */

/** Grouped peso amount. Locale-independent so it renders identically on any device. */
export function formatBudget(value: number | null): string | null {
  if (value === null) return null;
  const [whole, cents] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = value < 0 ? '-' : '';
  return cents === '00' ? `${sign}₱${grouped}` : `${sign}₱${grouped}.${cents}`;
}

/**
 * Display-only conversion of a stored timestamptz to DEVICE-LOCAL time. The
 * instant is absolute; only its presentation is local, so the same Booking
 * shows 6:30 PM on a GMT device and 2:30 AM the next calendar day on an
 * Asia/Manila device.
 */
export function formatTimestamp(iso: string | null): string | null {
  return formatCardDateTime(iso);
}

/** Never renders "null, null" — drops absent parts and returns null if all are absent. */
export function formatLocation(...parts: (string | null)[]): string | null {
  const present = parts.filter((p): p is string => p !== null);
  return present.length > 0 ? present.join(', ') : null;
}

/** "2 ratings" / "1 rating" — used only where a count is already known to be > 0. */
function pluraliseRatings(count: number): string {
  return count === 1 ? '1 rating' : `${count} ratings`;
}

/**
 * Rating presentation, display-only.
 *
 * `count = 0` with a NULL average means NO RATINGS YET and must never render
 * as 0, as zero stars, or as N8's neutral 3.0 matching constant (which is a
 * MATCHING weight, not a rating). A real average is shown only when the server
 * actually counted rating rows. Nothing here touches the unmaintained
 * `worker_profiles.rating_avg` (N8-OBS-05, still open).
 */
export function formatRating(avg: number | null, count: number | null): string {
  // Only reachable if the profile block was released without a count, which
  // the contract does not produce. No score is invented to fill the gap.
  if (count === null) return 'Not available';
  if (count === 0) return 'No ratings yet';
  // Counted rows but no average is likewise unreachable; report the count
  // rather than fabricate a score.
  if (avg === null) return pluraliseRatings(count);
  return `${(Math.round(avg * 10) / 10).toFixed(1)} out of 5 (${pluraliseRatings(count)})`;
}

/** Preserves the three-valued `worker_skills` distinction described above. */
export function formatSkills(skills: string[] | null): string {
  if (skills === null) return 'Not available';
  if (skills.length === 0) return 'No skills added';
  return skills.join(' • ');
}

/**
 * `worker_profiles.is_verified` is nullable, and N10's pending queue keys on
 * `is_verified IS DISTINCT FROM true` — so NULL and false BOTH mean "not
 * verified" and must not become a third displayed state. `verified_by` is
 * never projected by the RPC and is never shown.
 */
export function formatVerification(isVerified: boolean | null): string {
  return isVerified === true ? 'Verified Worker' : 'Not yet verified';
}

/* ------------------------------------------------------------------ *
 * Load failure classification
 * ------------------------------------------------------------------ */

/**
 * Carries the SQLSTATE from supabase-js through to the screen.
 *
 * supabase-js resolves with `{ data: null, error }` rather than throwing, and
 * the SQLSTATE arrives verbatim in `error.code`. Classification must read that
 * CODE and never the message, because 42501 has TWO different messages for the
 * same code — both observed live against hosted during N11-DB:
 *
 *   { code: '42501', message: 'not authorized to view worker bookings' } <- function body
 *   { code: '42501', message: 'permission denied for function ...' }     <- EXECUTE ACL
 *
 * Matching on message text would therefore miss one of them. This is the same
 * lesson N10-UI hit; see src/app/(admin)/admin/index.tsx.
 */
export class BookingLoadError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'BookingLoadError';
    this.code = code;
  }
}

/** Caller is not an active participant of the expected role, or lacks EXECUTE. */
const FORBIDDEN = '42501';

export const LOAD_COPY = {
  forbidden: "You don't have permission to view these bookings.",
  generic: "We couldn't load your bookings. Please refresh and try again.",
  empty: "You don't have any bookings yet.",
} as const;

/**
 * Maps a load failure to user-facing copy. A raw backend message is NEVER
 * surfaced. Note what this does NOT do: a 42501 from a READ does not mutate
 * role or session state — AccountProvider and the root routing gates remain
 * authoritative for who this account is (N11-UI §13).
 */
export function loadErrorCopy(e: unknown): string {
  const code = e instanceof BookingLoadError ? e.code : null;
  return code === FORBIDDEN ? LOAD_COPY.forbidden : LOAD_COPY.generic;
}

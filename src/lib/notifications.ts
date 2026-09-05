/**
 * N12-UI shared Notification contract.
 *
 * Unlike Bookings, the Worker and Client notification surfaces consume the
 * IDENTICAL server contract: the same table, the same recipient-only RLS
 * policy (`user_id = auth.uid()`), and the same mark-read RPC. There is no
 * per-role projection to diverge, so the two routes render one shared list and
 * every rule below is single-sourced here.
 *
 * READ PATH IS A DIRECT SELECT, ON PURPOSE
 * ----------------------------------------
 * There is no read RPC and none is needed. `public.notifications` SELECT is
 * already recipient-only, a notification names no counterparty, and the row
 * carries no related-entity id, so nothing requires the SECURITY DEFINER
 * treatment N11's Booking lists needed. Adding a read RPC purely for symmetry
 * with the write path would be unjustified surface.
 *
 * THE ONLY WRITE IS mark_my_notification_read()
 * ---------------------------------------------
 * After N12-DB the client holds SELECT and nothing else on this table: direct
 * INSERT, UPDATE and DELETE are all denied at the GRANT layer. The RPC changes
 * exactly one column on exactly one row the caller owns, so the UI cannot
 * flip read state locally even if it wanted to -- and it does not: every
 * successful mark is followed by an authoritative server re-read.
 */

/** Exactly the columns the list needs. `user_id` is omitted: RLS already
 *  guarantees every visible row belongs to the caller, so selecting it would
 *  add nothing but noise. */
export type NotificationRow = {
  id: string;
  type: string;
  message: string;
  is_read: boolean | null;
  created_at: string | null;
};

/**
 * Human-readable label per notification type. A raw type string such as
 * `booking_confirmed` or `no_show_strike` must NEVER reach the screen.
 *
 * These are the eight values `notifications_type_check` permits after N12-DB.
 * The four that no current server path emits yet are still mapped, because the
 * type domain allows them and a future writer must not be able to surface a
 * raw identifier just because this map was left incomplete.
 */
const NOTIFICATION_LABEL: Record<string, string> = {
  booking_request: 'Booking request',
  booking_confirmed: 'Booking confirmed',
  booking_cancelled: 'Booking cancelled',
  booking_completed: 'Booking completed',
  no_show_strike: 'No-show recorded',
  account_suspended: 'Account suspended',
  payment_received: 'Payment received',
  worker_verified: 'Profile verified',
};

/**
 * Never renders the raw type. An unrecognised value -- only reachable if the
 * CHECK constraint were widened without updating this map -- falls back to a
 * neutral word rather than leaking a database identifier to the user.
 */
export function formatNotificationLabel(type: string): string {
  return NOTIFICATION_LABEL[type] ?? 'Notification';
}

/**
 * UNREAD IS `is_read IS DISTINCT FROM true`.
 *
 * `is_read` is nullable with DEFAULT false and N12-DB deliberately did not
 * migrate that. A NULL therefore means unread, and the naive `is_read === false`
 * test would silently drop those rows from both the list styling and any count
 * -- proven hosted, where the naive filter returned 0 rows for a NULL row the
 * correct filter returned. Read state is the ONLY thing this predicate decides.
 */
export function isUnread(isRead: boolean | null): boolean {
  return isRead !== true;
}

/**
 * Display-only conversion of the stored timestamptz to device-local time,
 * called during render from the raw ISO instant so nothing formatted is ever
 * held in state. `created_at` makes this screen a date/time surface.
 */
export function formatTimestamp(iso: string | null): string | null {
  if (iso === null) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
}

/* ------------------------------------------------------------------ *
 * Row coercion — never trust a row's shape.
 * ------------------------------------------------------------------ */

function toNullableText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/**
 * `id`, `type` and `message` are NOT NULL by construction, so a row missing any
 * of them is malformed rather than sparse and is dropped instead of rendered
 * half-blank. `is_read` is deliberately three-state here: true / false / null,
 * and a non-boolean maps to null, which `isUnread` treats as unread.
 */
export function toNotificationRow(row: unknown): NotificationRow | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;

  const id = typeof r.id === 'string' ? r.id : null;
  const type = typeof r.type === 'string' ? r.type : null;
  const message = typeof r.message === 'string' ? r.message : null;
  if (id === null || type === null || message === null) return null;

  return {
    id,
    type,
    message,
    is_read: typeof r.is_read === 'boolean' ? r.is_read : null,
    created_at: toNullableText(r.created_at),
  };
}

/* ------------------------------------------------------------------ *
 * Error classification
 * ------------------------------------------------------------------ */

/**
 * Carries the SQLSTATE so screens branch on `error.code` and NEVER on
 * `error.message`. 42501 arrives with more than one message for the same code
 * -- the function body's text, the EXECUTE ACL's "permission denied for
 * function ...", and the table GRANT's "permission denied for table ..." were
 * all observed against hosted during N12. Matching on text would miss some.
 */
export class NotificationError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'NotificationError';
    this.code = code;
  }
}

const FORBIDDEN = '42501';

export const COPY = {
  loadForbidden: "You don't have permission to view these notifications.",
  loadGeneric: "We couldn't load your notifications. Please refresh and try again.",
  empty: 'You have no notifications yet.',
  loading: 'Loading your notifications…',
  intro: 'Updates about your bookings and account.',
  markForbidden: "You don't have permission to update this notification.",
  markGeneric: "We couldn't mark that notification as read. Please try again.",
  /**
   * The mark may already be committed, so this must never read as a failure to
   * mark -- only the follow-up read failed.
   */
  markRefreshFailed:
    'That notification was marked as read, but the list could not be refreshed. ' +
    'Refresh to see the latest state.',
  unread: 'Unread',
} as const;

/** Raw backend text is never surfaced; only the code decides the copy. */
export function loadErrorCopy(e: unknown): string {
  const code = e instanceof NotificationError ? e.code : null;
  return code === FORBIDDEN ? COPY.loadForbidden : COPY.loadGeneric;
}

export function markErrorCopy(code: string | null): string {
  return code === FORBIDDEN ? COPY.markForbidden : COPY.markGeneric;
}

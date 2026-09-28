/**
 * BL-01C-UI shared booking-messaging contract.
 *
 * The Worker and Client chat surfaces consume the IDENTICAL server contract:
 * the same table, the same two participant-scoped policies, the same status
 * boundary. There is no per-role projection to diverge, so both routes render
 * one shared component and every rule below is single-sourced here.
 *
 * THE READ AND WRITE PATHS ARE BOTH DIRECT TABLE ACCESS, ON PURPOSE
 * -----------------------------------------------------------------
 * There is no messaging RPC and none is needed. After BL-01C-DB the client
 * holds exactly SELECT and INSERT on `public.messages` and nothing else --
 * UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN are all revoked,
 * and `anon` holds nothing at all. Both remaining privileges are then narrowed
 * by RLS to the caller's own Bookings:
 *
 *   SELECT -- participant, Booking `confirmed` (R3B: terminal history is no
 *             longer readable by ordinary participants)
 *   INSERT -- participant, Booking `confirmed`, sender_id = auth.uid(),
 *             non-blank content, at most 2000 characters
 *
 * THE SERVER IS THE AUTHORITY, ALWAYS
 * -----------------------------------
 * Everything this module validates is validated again by the policy, and the
 * policy is what decides. Client-side checks exist to give the sender an
 * immediate, specific reason instead of an opaque rejection -- they are a
 * courtesy, never a gate. Nothing here can widen what the server permits, and
 * a send this module would allow is still refused if the Booking has since
 * left `confirmed`.
 *
 * WHAT THIS MODULE DOES NOT DO
 * ----------------------------
 * No read receipts and no `is_read` maintenance: the column exists, defaults
 * to false, and has no UPDATE policy or grant behind it, so writing it is
 * impossible by construction and is deliberately deferred. No attachments, no
 * typing indicator, no group chat, no polling timer.
 *
 * Since R5 a confirmed Booking chat also listens on a private Broadcast topic,
 * but that changes only WHEN this module is called, never what it returns: an
 * event triggers `fetchBookingMessages` and nothing else. Reads still happen on
 * screen entry, on pull-to-refresh, and immediately after a successful send.
 *
 * It also never reads counterparty contact data. A chat bubble is labelled
 * from `sender_id` alone, so no phone, email, address or verification field is
 * queried to render a conversation -- the terminal-state privacy suppression
 * N11 established is not reopened through this screen.
 */

import { formatCompactDateTime } from './date-time';
import { supabase } from './supabase';

/**
 * The locked maximum, in CHARACTERS, mirroring `length(content) <= 2000` in
 * the INSERT policy. `length()` counts characters rather than bytes, so this
 * means the same thing for Taglish text containing multi-byte characters as it
 * does for ASCII, and `String.length`'s UTF-16 code-unit count agrees with it
 * for everything in the Basic Multilingual Plane.
 */
export const MESSAGE_MAX_LENGTH = 2000;

/**
 * Sending is permitted in exactly one Booking status. Reading is confined to
 * the same one (R3B), so this predicate gates the composer while
 * `isBookingChatAvailable` gates the conversation itself — the two agree
 * today and are kept separate because they answer different questions.
 */
export function canSendInStatus(status: string): boolean {
  return status === 'confirmed';
}

/** Exactly the columns the conversation needs. `booking_id` is omitted: every
 *  row was fetched for one Booking and re-carrying it would add nothing.
 *  `is_read` is omitted because nothing maintains it and rendering an
 *  always-false flag would imply a read-receipt feature that does not exist. */
export type MessageRow = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string | null;
};

/* ------------------------------------------------------------------ *
 * Content validation
 * ------------------------------------------------------------------ */

export type ContentValidation =
  | { ok: true; content: string }
  | { ok: false; reason: 'empty' | 'too_long' };

/**
 * Validate what the user typed and return the exact string that will be sent.
 *
 * Trimming happens FIRST and the trimmed value is what gets both length-checked
 * and transmitted, so the client and the policy measure the same string.
 *
 * A deliberate asymmetry: JavaScript's `trim()` removes newlines and tabs,
 * while SQL `btrim(content)` with its default character set removes only
 * spaces. This module is therefore STRICTER than the server -- a newline-only
 * message is rejected here though the policy would accept it. Strictness in
 * this direction is safe: it can only refuse a send, never permit one the
 * server would refuse.
 */
export function validateContent(raw: string): ContentValidation {
  const content = raw.trim();
  if (content === '') return { ok: false, reason: 'empty' };
  if (content.length > MESSAGE_MAX_LENGTH) return { ok: false, reason: 'too_long' };
  return { ok: true, content };
}

/**
 * Characters still available, measured on the trimmed value so the number
 * agrees with what validation and the server will actually see. Negative means
 * over the limit; the composer reports that rather than truncating, because a
 * silently truncated message would misrepresent what the sender wrote.
 */
export function remainingCharacters(raw: string): number {
  return MESSAGE_MAX_LENGTH - raw.trim().length;
}

/* ------------------------------------------------------------------ *
 * Row coercion — never trust a row's shape.
 * ------------------------------------------------------------------ */

function toNullableText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/**
 * `id`, `sender_id` and `content` are NOT NULL by construction, so a row
 * missing any of them is malformed rather than sparse and is dropped instead
 * of rendered as an empty bubble. `content` is checked for type only, not for
 * emptiness: the policy already guarantees a stored message is non-blank, and
 * a row that somehow is blank should surface as itself rather than vanish.
 */
export function toMessageRow(row: unknown): MessageRow | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;

  const id = typeof r.id === 'string' ? r.id : null;
  const senderId = typeof r.sender_id === 'string' ? r.sender_id : null;
  const content = typeof r.content === 'string' ? r.content : null;
  if (id === null || senderId === null || content === null) return null;

  return { id, sender_id: senderId, content, created_at: toNullableText(r.created_at) };
}

/* ------------------------------------------------------------------ *
 * Error classification
 * ------------------------------------------------------------------ */

/**
 * Carries the SQLSTATE so screens branch on `error.code` and NEVER on
 * `error.message` — the same lesson N11 and N12 recorded: 42501 arrives with
 * more than one message for the same code (the table GRANT's "permission
 * denied for table messages" and RLS's "new row violates row-level security
 * policy for table messages" are both 42501), so matching on text would miss
 * one of them.
 */
export class MessageError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'MessageError';
    this.code = code;
  }
}

const FORBIDDEN = '42501';

/**
 * A rejected send is deliberately NOT diagnosable from the client.
 *
 * The policy collapses every failed conjunct into one 42501: a Booking that is
 * no longer `confirmed`, a caller who is not a participant, a spoofed
 * `sender_id` and over-length content are indistinguishable in the response.
 * That is the same anti-oracle discipline BL-01A applied by collapsing its
 * unavailable/conflict cases into a single SM409 — a distinguishable rejection
 * would let a caller probe a Booking they cannot see.
 *
 * The client can be specific only about the cases IT rejected before sending
 * (blank, over-length), which is exactly why those are validated locally.
 */
export function isForbidden(e: unknown): boolean {
  return e instanceof MessageError && e.code === FORBIDDEN;
}

export const COPY = {
  loading: 'Loading messages…',
  empty: 'No messages yet. Say hello to get started.',
  loadForbidden: "You don't have permission to view this conversation.",
  loadGeneric: "We couldn't load this conversation. Pull down to refresh.",
  /**
   * Shown for a 42501 on send. It must not assert WHICH conjunct failed,
   * because the server does not say — and by far the most likely cause is the
   * one this sentence names: the Booking left `confirmed` after the screen
   * loaded.
   */
  sendForbidden: 'This booking is no longer open for messaging.',
  sendGeneric: "We couldn't send your message. Please try again.",
  /** The message IS sent; only the follow-up read failed. Must never read as
   *  a send failure. */
  sendRefreshFailed:
    'Your message was sent, but the conversation could not be refreshed. ' +
    'Pull down to refresh.',
  validationEmpty: 'Type a message before sending.',
  validationTooLong: `Messages are limited to ${MESSAGE_MAX_LENGTH} characters.`,
  closed: 'This booking is closed. Messaging is no longer available.',
  notFound: 'This booking is not available.',
  composerPlaceholder: 'Write a message…',
  you: 'You',
  other: 'Other participant',
} as const;

/** Raw backend text is never surfaced; only the code decides the copy. */
export function loadErrorCopy(e: unknown): string {
  return isForbidden(e) ? COPY.loadForbidden : COPY.loadGeneric;
}

export function sendErrorCopy(e: unknown): string {
  return isForbidden(e) ? COPY.sendForbidden : COPY.sendGeneric;
}

export function validationCopy(reason: 'empty' | 'too_long'): string {
  return reason === 'empty' ? COPY.validationEmpty : COPY.validationTooLong;
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/**
 * Display-only conversion of the stored timestamptz to device-local time,
 * called during render from the raw ISO instant so nothing formatted is ever
 * held in state — the same convention as bookings.ts and notifications.ts, and
 * what makes a device timezone change re-derive correctly on reload.
 */
export function formatTimestamp(iso: string | null): string | null {
  return formatCompactDateTime(iso);
}

/* ------------------------------------------------------------------ *
 * Server calls
 * ------------------------------------------------------------------ */

/**
 * Oldest-first, which is chat order. `id` is the tiebreak so rows sharing a
 * `created_at` have a stable, repeatable order across refreshes rather than
 * whatever the planner returns.
 *
 * No `sender_id` filter and no participant filter are applied here: RLS
 * already restricts the result to Bookings the caller participates in, and
 * re-stating that client-side would imply the filter is what protects it.
 * A non-participant receives zero rows, not an error.
 */
export async function fetchBookingMessages(bookingId: string): Promise<MessageRow[]> {
  const res = await supabase
    .from('messages')
    .select('id, sender_id, content, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (res.error) {
    throw new MessageError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map(toMessageRow).filter((m): m is MessageRow => m !== null);
}

/** Banner observation never fetches bodies or read-state columns. */
export type MessageCursor = { created_at: string; id: string };
export type IncomingMessageRow = MessageCursor & { sender_id: string };
export const INCOMING_MESSAGE_PAGE_SIZE = 100;

const CURSOR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

function cursorTime(value: string): bigint {
  const match = CURSOR_TIME.exec(value);
  if (!match) throw new MessageError('Invalid message cursor.', null);
  const milliseconds = Date.parse(match[1] + match[3]);
  if (!Number.isFinite(milliseconds)) throw new MessageError('Invalid message cursor.', null);
  // Preserve PostgreSQL microseconds; Date alone loses the last three digits.
  return BigInt(milliseconds) * BigInt(1000) + BigInt((match[2] ?? '').padEnd(6, '0'));
}

function readCursor(row: unknown): MessageCursor {
  if (typeof row !== 'object' || row === null || !('id' in row) ||
      !('created_at' in row) || typeof row.id !== 'string' || !CURSOR_UUID.test(row.id) ||
      typeof row.created_at !== 'string') throw new MessageError('Invalid message cursor.', null);
  cursorTime(row.created_at);
  return { id: row.id.toLowerCase(), created_at: row.created_at };
}

export function compareMessageCursors(a: MessageCursor, b: MessageCursor): number {
  const left = cursorTime(a.created_at), right = cursorTime(b.created_at);
  return left < right ? -1 : left > right ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** One bounded authoritative read, including for conversations larger than the API cap. */
export async function seedBookingMessageCursor(bookingId: string): Promise<MessageCursor | null> {
  const result = await supabase.from('messages').select('id, created_at')
    .eq('booking_id', bookingId).order('created_at', { ascending: false })
    .order('id', { ascending: false }).limit(1);
  if (result.error) throw new MessageError(result.error.message, result.error.code ?? null);
  if (!Array.isArray(result.data)) throw new MessageError('Invalid message response.', null);
  return result.data.length === 0 ? null : readCursor(result.data[0]);
}

/**
 * Keyset pagination up to a bounded latest-row snapshot. Never infer exhaustion
 * from a short page: the server can impose a smaller cap than our request.
 * No partial result escapes on failure or cancellation. The caller performs
 * participant Booking authorization before this call and again before display.
 */
export async function readNewBookingMessages(
  bookingId: string,
  after: MessageCursor | null,
  isCurrent: () => boolean,
): Promise<{ cursor: MessageCursor | null; messages: IncomingMessageRow[] }> {
  const check = () => {
    if (!isCurrent()) throw new MessageError('Message observation invalidated.', null);
  };
  check();
  let cursor = after === null ? null : readCursor(after);
  const upper = await seedBookingMessageCursor(bookingId);
  check();
  if (upper === null || (cursor !== null && compareMessageCursors(upper, cursor) <= 0)) {
    return { cursor, messages: [] };
  }
  const messages: IncomingMessageRow[] = [];
  const ids = new Set<string>();
  while (cursor === null || compareMessageCursors(cursor, upper) < 0) {
    check();
    // Only validated UUIDs and ISO timestamps enter the raw PostgREST grammar.
    const ceiling = `or(created_at.lt.${upper.created_at},and(created_at.eq.${upper.created_at},id.lte.${upper.id}))`;
    const floor = cursor === null ? null :
      `or(created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id}))`;
    const result = await supabase.from('messages').select('id, sender_id, created_at')
      .eq('booking_id', bookingId).or(floor === null ? ceiling : `and(${floor},${ceiling})`)
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .limit(INCOMING_MESSAGE_PAGE_SIZE);
    check();
    if (result.error) throw new MessageError(result.error.message, result.error.code ?? null);
    if (!Array.isArray(result.data)) throw new MessageError('Invalid message response.', null);
    const previous = cursor;
    for (const raw of result.data) {
      const next = readCursor(raw);
      if (typeof raw.sender_id !== 'string' || !CURSOR_UUID.test(raw.sender_id)) {
        throw new MessageError('Invalid message sender.', null);
      }
      if (compareMessageCursors(next, upper) > 0) throw new MessageError('Invalid message page.', null);
      // Defensive overlap suppression; keyset SELECT itself uses a strict floor.
      if (cursor !== null && compareMessageCursors(next, cursor) <= 0) continue;
      cursor = next;
      if (!ids.has(next.id)) {
        ids.add(next.id);
        messages.push({ ...next, sender_id: raw.sender_id.toLowerCase() });
      }
    }
    if (cursor === null || (previous !== null && compareMessageCursors(cursor, previous) <= 0)) {
      // Includes RLS returning zero rows mid-pagination. Never spin or disclose a partial batch.
      throw new MessageError('Message observation could not complete.', null);
    }
  }
  return { cursor, messages };
}

/**
 * Insert one message.
 *
 * `senderId` is supplied by the caller from AccountProvider, whose `id` comes
 * from the authenticated session — never from a row, a route parameter or any
 * other screen state that a user could influence. Even so it is not trusted:
 * the policy's `auth.uid() = sender_id` conjunct rejects any value that is not
 * the caller, so passing the wrong id produces a rejection rather than a
 * forged message.
 *
 * `is_read` and `created_at` are deliberately not written: the first has no
 * maintenance path, and the second is the database's `now()` default, so the
 * ordering above reflects server time rather than a device clock.
 */
export async function sendBookingMessage(
  bookingId: string,
  senderId: string,
  content: string
): Promise<void> {
  const res = await supabase
    .from('messages')
    .insert({ booking_id: bookingId, sender_id: senderId, content });

  if (res.error) {
    throw new MessageError(res.error.message || 'The request failed.', res.error.code ?? null);
  }
}

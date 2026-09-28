import type { RoleBooking } from './booking-records';
import { chatBookingFromRow, counterpartPresentation, type ChatRole } from './chat-presentation';
import { compareMessageCursors, type IncomingMessageRow, type MessageCursor } from './messages';
import type { SubscribeInvalidationOptions } from './realtime';

export type BannerContext = {
  accountId: string | null;
  role: ChatRole | null;
  active: boolean;
  pathname: string;
  bookingId: string | null;
  routeKey: string;
};
export type IncomingBanner = {
  bookingId: string; messageId: string; name: string; initials: string;
  accountId: string; role: ChatRole; routeKey: string;
};
export const INCOMING_BANNER_DURATION_MS = 5000;

export function bannerRole(input: {
  sessionId: string | null; status: string;
  account: { id: string; role: string; is_active: boolean } | null;
}): ChatRole | null {
  const { account, sessionId, status } = input;
  return status === 'resolved' && account !== null && account.id === sessionId &&
    account.is_active && (account.role === 'worker' || account.role === 'client') ? account.role : null;
}

export function bannerChatRoute(role: ChatRole, bookingId: string) {
  return { pathname: role === 'worker' ? '/worker/chat' as const : '/client/chat' as const,
    params: { bookingId } };
}

export function isExactBannerChat(context: BannerContext, bookingId: string): boolean {
  return context.role !== null && context.pathname === `/${context.role}/chat` && context.bookingId === bookingId;
}

export function bannerPresentation(role: ChatRole, booking: RoleBooking | null) {
  return counterpartPresentation(role, chatBookingFromRow(role, booking));
}

export type IncomingBannerDependencies = {
  loadBookings: (role: ChatRole) => Promise<RoleBooking[]>;
  seed: (bookingId: string) => Promise<MessageCursor | null>;
  read: (bookingId: string, cursor: MessageCursor | null, current: () => boolean) =>
    Promise<{ cursor: MessageCursor | null; messages: IncomingMessageRow[] }>;
  subscribe: (options: SubscribeInvalidationOptions) => () => void;
  navigate: (route: ReturnType<typeof bannerChatRoute>) => void;
};
type Observation = {
  // Option A: ready means the first authorized baseline is established, even
  // when B is null. It does NOT mean the transport is SUBSCRIBED. B is set once;
  // only P advances through completed authoritative handling in this lifetime.
  id: string; generation: number; ready: boolean;
  baselineCursor: MessageCursor | null; processedCursor: MessageCursor | null;
  seeding: boolean; busy: boolean; pending: number | null; cleanup: (() => void)[];
};

/**
 * Ephemeral banner controller. The host supplies existing RPC/table/Realtime
 * adapters and foreground/route/account context. No React, storage or transport
 * is owned here; the injected boundaries make races testable without a device.
 */
export function createIncomingMessageBanner(deps: IncomingBannerDependencies) {
  let context: BannerContext | null = null;
  let runtime = 0, reconciliation = 0, arrival = 0, lastPresented = 0;
  let identity: string | null = null;
  const observed = new Set<string>(); // Incremental IDs only; never enumerate history.
  const entries = new Map<string, Observation>();
  const listeners = new Set<() => void>();
  let notificationCleanup: (() => void) | null = null;
  let snapshot: IncomingBanner | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function dismiss() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (snapshot === null) return;
    snapshot = null;
    for (const listener of listeners) listener();
  }
  function remove(entry: Observation) {
    entry.generation++;
    entry.ready = false;
    entry.pending = null;
    for (const cleanup of entry.cleanup) cleanup();
    entry.cleanup = [];
    if (entries.get(entry.id) === entry) entries.delete(entry.id);
    if (snapshot?.bookingId === entry.id) dismiss();
  }
  function stop() {
    runtime++; reconciliation++;
    context = null;
    notificationCleanup?.(); notificationCleanup = null;
    for (const entry of entries.values()) remove(entry);
    dismiss();
  }
  function capture(entry: Observation) {
    const version = runtime, generation = entry.generation;
    return () => context !== null && context.active && runtime === version &&
      entries.get(entry.id) === entry && entry.generation === generation;
  }
  async function authorized(role: ChatRole, id: string): Promise<RoleBooking | null> {
    const rows = await deps.loadBookings(role);
    return rows.find(b => b.booking_id === id && b.booking_status === 'confirmed') ?? null;
  }
  async function seed(entry: Observation) {
    const role = context?.role;
    if (!role || entry.ready || entry.seeding) return;
    entry.seeding = true;
    const current = capture(entry);
    try {
      const booking = await authorized(role, entry.id);
      if (!current()) return;
      if (!booking) { remove(entry); return; }
      const cursor = await deps.seed(entry.id);
      if (!current()) return;
      // Seeding cannot release identity; still stop listening if status changed during the read.
      const confirmed = await authorized(role, entry.id);
      if (!current()) return;
      if (!confirmed) { remove(entry); return; }
      entry.baselineCursor = cursor; entry.processedCursor = cursor; entry.ready = true;
    } catch { if (current()) remove(entry); }
    finally {
      entry.seeding = false;
      if (entries.get(entry.id) === entry && entry.pending !== null) {
        if (entry.ready) void evaluate(entry);
        // A newer invalidation must survive cancellation of this seed. This
        // consumes pending work, not a timer or an automatic failure retry.
        else if (!current()) void seed(entry);
      }
    }
  }
  function invalidate(entry: Observation) {
    entry.pending = ++arrival;
    if (entry.ready) void evaluate(entry); else void seed(entry);
  }
  async function evaluate(entry: Observation) {
    if (entry.busy || !entry.ready) return;
    entry.busy = true;
    let candidate: IncomingMessageRow | null = null;
    try {
      while (entry.pending !== null && entry.ready) {
        const sequence = entry.pending;
        entry.pending = null;
        const start = context;
        if (!start?.role || !start.accountId) return;
        const observationCurrent = capture(entry);
        const current = () => observationCurrent() && context === start;
        try {
          const before = await authorized(start.role, entry.id);
          if (!current()) return;
          if (!before) { remove(entry); return; }
          const result = await deps.read(entry.id, entry.processedCursor, current);
          if (!current()) return;
          if (entry.processedCursor !== null && (result.cursor === null ||
              compareMessageCursors(result.cursor, entry.processedCursor) < 0)) {
            throw new Error('Message cursor regressed.');
          }
          const arrivals = result.messages.filter(row => entry.processedCursor === null ||
            compareMessageCursors(row, entry.processedCursor) > 0);
          const newRows = arrivals.filter(row => !observed.has(row.id));
          // Final authority read is after ALL pages and immediately before committing.
          const final = await authorized(start.role, entry.id);
          if (!current()) return;
          if (!final) { remove(entry); return; }
          // Only a complete, currently authorized batch is handled. Failed or
          // stale reads cannot consume arrivals by advancing P or observed IDs.
          entry.processedCursor = result.cursor;
          for (const row of arrivals) observed.add(row.id);
          const counterpartId = 'client_user_id' in final ? final.client_user_id : final.worker_user_id;
          candidate = newRows.filter(row => row.sender_id !== start.accountId && row.sender_id === counterpartId).at(-1) ?? candidate;
          // Drain coalesced invalidations before presenting. A row can already be
          // in this batch when its later event arrives; an empty follow-up must
          // neither lose that row nor let an older cross-booking arrival win.
          if (entry.pending !== null) continue;
          const newest = candidate?.sender_id === counterpartId ? candidate : null;
          const presentation = bannerPresentation(start.role, final);
          if (!newest || !presentation || isExactBannerChat(start, entry.id) || sequence < lastPresented) continue;
          dismiss();
          lastPresented = sequence;
          snapshot = { bookingId: entry.id, messageId: newest.id, name: presentation.name,
            initials: presentation.initials, accountId: start.accountId, role: start.role, routeKey: start.routeKey };
          candidate = null;
          timer = setTimeout(dismiss, INCOMING_BANNER_DURATION_MS);
          for (const listener of listeners) listener();
        } catch {
          // A transport/read failure is not a new historical observation.
          // Keep B/P for the next real invalidation; never retry on a timer.
          if (current() && snapshot?.bookingId === entry.id) dismiss();
          return;
        }
      }
    } finally {
      entry.busy = false;
      if (entry.ready && entry.pending !== null && entries.get(entry.id) === entry) void evaluate(entry);
    }
  }
  function listen(id: string) {
    const entry: Observation = { id, generation: 0, ready: false, baselineCursor: null,
      processedCursor: null, seeding: false, busy: false, pending: null, cleanup: [] };
    entries.set(id, entry);
    try {
      // Independent event registrations share ONE physical channel in the existing registry.
      // onBroadcastEvent has no payload; its paired onInvalidate must not look like reconnect.
      let actualMessage = false;
      entry.cleanup.push(deps.subscribe({ topic: `booking:${id}:messages`, events: ['message_inserted'],
        onBroadcastEvent: () => {
          actualMessage = true;
          invalidate(entry);
        },
        onInvalidate: () => {
          if (actualMessage) { actualMessage = false; return; }
          invalidate(entry);
        },
      }));
      entry.cleanup.push(deps.subscribe({ topic: `booking:${id}:messages`, events: ['booking_status_changed'],
        onBroadcastEvent: () => {
          // Hide disclosure and cancel stale work immediately. The hint is
          // not authority to reset history: reconciliation must confirm loss.
          entry.generation++;
          if (snapshot?.bookingId === id) dismiss();
          void reconcile();
        },
        onInvalidate: () => {},
      }));
      void seed(entry);
    } catch { remove(entry); }
  }
  async function reconcile() {
    const start = context, version = runtime, request = ++reconciliation;
    if (!start?.role || !start.accountId || !start.active) return;
    dismiss();
    const current = () => runtime === version && request === reconciliation && context === start;
    try {
      const bookings = await deps.loadBookings(start.role);
      if (!current()) return;
      const ids = new Set(bookings.filter(b => b.booking_status === 'confirmed').map(b => b.booking_id));
      for (const entry of entries.values()) if (!ids.has(entry.id)) remove(entry);
      for (const id of ids) {
        const entry = entries.get(id);
        if (entry) invalidate(entry); else listen(id);
      }
    } catch {
      // Failed discovery proves no loss of membership. Cancel stale work and
      // disclosure, but preserve established B/P until authority can be read
      // on a later invalidation. Only a successful exclusion ends membership.
      if (current()) {
        dismiss();
        for (const entry of entries.values()) entry.generation++;
      }
    }
  }
  function updateContext(next: BannerContext) {
    const nextIdentity = next.accountId && next.role ? `${next.accountId}:${next.role}` : null;
    if (identity !== nextIdentity) { observed.clear(); identity = nextIdentity; }
    if (!next.active || !next.accountId || !next.role ||
        !(next.pathname === `/${next.role}` || next.pathname.startsWith(`/${next.role}/`))) {
      stop(); return;
    }
    if (context?.accountId === next.accountId && context.role === next.role) {
      // Route work becomes stale, but eligible navigation does not end the
      // foreground observation or turn unprocessed arrivals into history.
      context = next;
      void reconcile();
      return;
    }
    stop();
    context = next;
    try {
      notificationCleanup = deps.subscribe({ topic: `user:${next.accountId}:notifications`,
        events: ['notification_inserted'], onInvalidate: () => { void reconcile(); } });
      void reconcile();
    } catch { stop(); }
  }
  async function tap() {
    const banner = snapshot, start = context, version = runtime;
    dismiss();
    if (!banner || !start?.role) return;
    const entry = entries.get(banner.bookingId);
    if (!entry) return;
    const current = capture(entry);
    try {
      const booking = await authorized(start.role, banner.bookingId);
      if (!current() || runtime !== version || context !== start || !booking) return;
      // Push the existing route with only its UUID. Never supply cached identity/status.
      deps.navigate(bannerChatRoute(start.role, banner.bookingId));
    } catch { /* No cached authorization fallback. */ }
  }
  return { updateContext, stop, dismiss, tap, getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}

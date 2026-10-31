import type { SessionLifetime } from '@/providers/session-provider';
import type { SheetPosition } from '@/lib/booking-sheet';

type Destination = { pathname: string; params: Record<string, string> };
type RawRoute = { pathname: string; params: Record<string, unknown> };
type Observation = {
  access: string; ownerId: string | null; lifetime: SessionLifetime | null | undefined;
  pathname: string; params: Record<string, unknown>;
  /** The focused role stack as the navigator reports it, bottom first (see stackFromNavigationState). */
  stack?: readonly RawRoute[];
};
/** A Chat reading position: a message id and a clamped offset into it. Never message content. */
export type ChatAnchor = { bookingId: string; messageId: string; offset: number };
/** `unconfirmed`: a reset rebuilding the parents was dispatched; the resulting navigation is not confirmed (the
 *  restore hook records every dispatched rebuild this way). `restored` would claim a confirmed rebuild; no caller
 *  observes the committed stack, so none records it. `preserved`: a valid stack (or nothing to rebuild) was kept.
 *  None of these is a native Back check. */
export type RestoreOutcome = 'none' | 'restored' | 'preserved' | 'unconfirmed' | 'fallback';
/** How a re-entry's parent restoration ended (see completeParentChain). */
export type ParentChainResult = 'restored' | 'preserved' | 'unconfirmed';
const prefixFor = (access: string) => access === 'administrator' ? '/admin' : access === 'worker' ? '/worker' : access === 'client' ? '/client' : null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ownDestination({ access, pathname, params }: Observation): Destination | null {
  const prefix = prefixFor(access);
  if (!prefix || (pathname !== prefix && !pathname.startsWith(prefix + '/'))) return null;
  const safeParams: Record<string, string> = {};
  for (const key of ['bookingId', 'jobId', 'reportId', 'userId', 'workerId']) {
    const value = params[key];
    if (typeof value === 'string' && uuid.test(value)) safeParams[key] = value;
  }
  return { pathname, params: safeParams };
}
const sameDestination = (left: Destination, right: Destination) =>
  left.pathname === right.pathname && JSON.stringify(left.params) === JSON.stringify(right.params);
const isMapDestination = ({ pathname, params }: Destination) =>
  (pathname === '/client/job-details' && Boolean(params.jobId)) ||
  (/^\/(client|worker)\/booking-details$/.test(pathname) && Boolean(params.bookingId));

// The only screens a parent chain may contain, with the exact IDs each needs. Post, payment, report, video,
// sign-in and recovery screens are absent, so a restore can never reopen a form, a call or a business action.
const CHAIN_ROUTES: Record<string, Record<string, readonly string[]>> = {
  client: { '/client': [], '/client/jobs': [], '/client/bookings': [], '/client/profile': [],
    '/client/job-details': ['jobId'], '/client/booking-details': ['bookingId'], '/client/chat': ['bookingId'] },
  worker: { '/worker': [], '/worker/bookings': [], '/worker/profile': [],
    '/worker/booking-details': ['bookingId'], '/worker/chat': ['bookingId'] },
};
const TAB_ROOTS = new Set(['/client', '/client/jobs', '/client/bookings', '/client/profile', '/worker', '/worker/bookings', '/worker/profile']);
const MAX_CHAIN = 4;
const MAX_ANCHOR_OFFSET = 4000;
/** The actual stack, if every entry is an allowlisted own-role screen with exact valid IDs and it starts at a tab root. */
function allowedStack(access: string, stack: readonly RawRoute[] | undefined): Destination[] | null {
  const routes = CHAIN_ROUTES[access];
  if (!routes || !stack || stack.length < 1 || stack.length > MAX_CHAIN) return null;
  const allowed: Destination[] = [];
  for (const [index, entry] of stack.entries()) {
    const keys = Object.hasOwn(routes, entry.pathname) ? routes[entry.pathname] : null;
    if (!keys || (index === 0) !== TAB_ROOTS.has(entry.pathname)) return null;
    const params: Record<string, string> = {};
    for (const key of keys) {
      const value = entry.params[key];
      if (typeof value !== 'string' || !uuid.test(value)) return null;
      params[key] = value;
    }
    allowed.push({ pathname: entry.pathname, params });
  }
  return allowed;
}

type NavigationRoute = { name?: unknown; params?: Record<string, unknown>; state?: NavigationState };
type NavigationState = { index?: number; routes?: NavigationRoute[] };
/**
 * Reads the focused role group's stack from expo-router's root navigation state (useRootNavigationState). In
 * expo-router 57 that is the state of the navigator ExpoRoot wraps around the app's root _layout (id and single route
 * `__root`), so a focused `__root` route is stepped into once to reach the root Stack. Only the focused route is read
 * at each level. The tab shell `(tabs)` maps to its focused tab; `client/index` is `/client`. Raw params are returned;
 * the continuation allowlist validates them. Anything unrecognised yields undefined (no chain is saved).
 */
export function stackFromNavigationState(state: unknown): RawRoute[] | undefined {
  let root = state as NavigationState | undefined;
  const top = root?.routes?.[root.index ?? 0];
  if (top?.name === '__root') root = top.state;
  const group = root?.routes?.[root.index ?? 0];
  const routes = group?.state?.routes;
  if ((group?.name !== '(client)' && group?.name !== '(worker)') || !routes?.length) return undefined;
  const stack: RawRoute[] = [];
  for (const route of routes.slice(0, (group.state?.index ?? routes.length - 1) + 1)) {
    let name = route.name, params = route.params;
    if (name === '(tabs)') {
      const tab = route.state?.routes?.[route.state.index ?? 0];
      name = tab?.name ?? route.params?.screen;
      params = tab?.params;
    }
    if (typeof name !== 'string') return undefined;
    stack.push({ pathname: '/' + name.replace(/(^|\/)index$/, ''), params: { ...(params ?? {}) } });
  }
  return stack;
}

/** Navigation intent only. Never retains account/data authority or keeps a protected tree mounted. */
export function createSessionRouteContinuation() {
  let saved: { ownerId: string; lifetime: SessionLifetime; access: string; destination: Destination; sheetPosition?: SheetPosition;
    parents?: Destination[]; chatAnchor?: ChatAnchor } | null = null;
  let pending = false;
  // Armed when the dispatcher hands the intent to a fresh re-entry, or dropped when the user goes elsewhere first.
  // `parents`: armed (destination read not yet passed) → dispatched (chain handed out) → done (completed). Only a
  // Chat destination also waits for its reading anchor; every other destination retires once its parents are done.
  let restore: { parents: 'armed' | 'dispatched' | 'done'; anchor: boolean } | null = null;
  let outcome: RestoreOutcome = 'none';
  const clear = () => { saved = null; pending = false; restore = null; };
  const same = (ownerId: string | null, lifetime: SessionLifetime | null | undefined) =>
    saved !== null && saved.ownerId === ownerId && saved.lifetime === lifetime && saved.lifetime.isCurrent();
  const isSaved = (observation: Observation) => {
    const destination = ownDestination(observation);
    return destination !== null && same(observation.ownerId, observation.lifetime) && saved?.access === observation.access &&
      sameDestination(saved.destination, destination);
  };
  const settle = () => { if (restore && restore.parents === 'done' && !restore.anchor) restore = null; };
  return {
    clear,
    observe(observation: Observation) {
      const { access, ownerId, lifetime } = observation;
      if (!ownerId || !lifetime?.isCurrent()) { clear(); return; }
      if (access === 'account-pending') {
        if (same(ownerId, lifetime)) pending = true; else clear();
        return;
      }
      const prefix = prefixFor(access);
      if (!prefix || (saved && (!same(ownerId, lifetime) || saved.access !== access))) clear();
      if (!prefix) return;
      // During re-entry the dispatcher briefly owns '/'. Preserve the intent until its Redirect
      // reaches an authorized role URL. Never restore external, auth, recovery or another role's URL.
      const destination = ownDestination(observation);
      if (!destination) return;
      // A rebuilt navigator can briefly report the saved path without its IDs before the dispatcher's
      // Redirect lands. That is not a new destination: keep the pending intent and its detent.
      if ((pending || restore) && saved && same(ownerId, lifetime) && saved.access === access && destination.pathname === saved.destination.pathname &&
          Object.keys(destination.params).length === 0 && Object.keys(saved.destination.params).length > 0) return;
      const carry = same(ownerId, lifetime) && saved?.access === access && sameDestination(saved.destination, destination);
      if (restore && !carry) restore = null;
      // While the re-entered screen awaits its fresh read, the navigator shows it alone: keep the saved parents.
      // Otherwise the parents are the actual allowlisted stack beneath this exact destination, or nothing.
      const stack = allowedStack(access, observation.stack);
      const parents = restore?.parents === 'armed' && carry ? saved?.parents
        : stack && sameDestination(stack[stack.length - 1], destination) ? stack.slice(0, -1) : undefined;
      saved = { ownerId, lifetime, access, destination, sheetPosition: carry ? saved?.sheetPosition : undefined,
        parents, chatAnchor: carry ? saved?.chatAnchor : undefined };
      pending = false;
    },
    /** The reader's position on the saved exact Chat URL (null = following the latest message). */
    rememberChatAnchor(observation: Observation, anchor: ChatAnchor | null) {
      // Teardown, re-entry and late scroll callbacks cannot overwrite the snapshot awaiting restore.
      if (pending || restore?.anchor || !isSaved(observation) || !saved) return;
      const { pathname, params } = saved.destination;
      if (pathname !== `${prefixFor(saved.access)}/chat` || !params.bookingId) return;
      if (anchor === null) { saved.chatAnchor = undefined; return; }
      if (anchor.bookingId !== params.bookingId || typeof anchor.messageId !== 'string' || !uuid.test(anchor.messageId) ||
          typeof anchor.offset !== 'number' || !Number.isFinite(anchor.offset)) return;
      saved.chatAnchor = { bookingId: params.bookingId, messageId: anchor.messageId,
        offset: Math.min(MAX_ANCHOR_OFFSET, Math.max(0, anchor.offset)) };
    },
    /**
     * Once, after a refresh re-entry and the destination's own authorized read: the parents to rebuild beneath it
     * ([] = nothing to rebuild). Handing them out is not a restoration; the caller reports how it ended with
     * completeParentChain.
     */
    takeParentChain(observation: Observation): Destination[] | null {
      if (pending || restore?.parents !== 'armed' || !isSaved(observation) || !saved) return null;
      restore.parents = 'dispatched';
      return (saved.parents ?? []).map(entry => ({ pathname: entry.pathname, params: { ...entry.params } }));
    },
    /**
     * Ends the parent restoration of the saved destination: `restored`/`unconfirmed` only after takeParentChain,
     * `preserved` also when a valid existing stack was kept instead. A non-Chat restoration retires here, so a later
     * unavailability of the same screen is ordinary (abandonRestore declines it).
     */
    completeParentChain(observation: Observation, result: ParentChainResult): boolean {
      if (!restore || restore.parents === 'done' || !isSaved(observation)) return false;
      if (result !== 'preserved' && restore.parents !== 'dispatched') return false;
      restore.parents = 'done'; outcome = result; settle();
      return true;
    },
    /** Once, after a refresh re-entry and a fresh authorized read of this exact conversation. */
    takeChatAnchor(observation: Observation, bookingId: string): ChatAnchor | null {
      if (pending || !restore?.anchor || !isSaved(observation) || !saved) return null;
      const anchor = saved.chatAnchor;
      if (anchor && anchor.bookingId !== bookingId) return null;
      restore.anchor = false; saved.chatAnchor = undefined; settle();
      return anchor ? { ...anchor } : null;
    },
    /**
     * The re-entered destination is unavailable or no longer authorized before its own read passed: drop the restore
     * (caller takes the own-role fallback). Once the chain was handed out, unavailability is the screen's own state.
     */
    abandonRestore(observation: Observation): boolean {
      if (restore?.parents !== 'armed' || !isSaved(observation) || !saved) return false;
      restore = null; saved.parents = undefined; saved.chatAnchor = undefined; outcome = 'fallback';
      return true;
    },
    lastRestoreOutcome: () => outcome,
    /** One non-sensitive detent, on the already saved exact map URL. Never authority or map data. */
    rememberSheetPosition(observation: Observation, position: SheetPosition) {
      const destination = ownDestination(observation);
      if (pending || (position !== 'collapsed' && position !== 'expanded') || !destination || !isMapDestination(destination) ||
          !same(observation.ownerId, observation.lifetime) || saved?.access !== observation.access ||
          !sameDestination(saved.destination, destination)) return;
      saved.sheetPosition = position;
    },
    sheetPosition(observation: Observation): SheetPosition | undefined {
      const destination = ownDestination(observation);
      return destination && isMapDestination(destination) && same(observation.ownerId, observation.lifetime) &&
        saved?.access === observation.access && sameDestination(saved.destination, destination)
        ? saved.sheetPosition : undefined;
    },
    destination(access: string, ownerId: string | null, lifetime: SessionLifetime | null | undefined): Destination | null {
      // Called only after the root derives fresh resolved access. A changed owner, lifetime,
      // consent/verification state, role, failure or recovery can never inherit this intent.
      if (!(pending && same(ownerId, lifetime) && saved?.access === access && prefixFor(access)) || !saved) return null;
      restore = { parents: 'armed', anchor: saved.destination.pathname === `${prefixFor(access)}/chat` }; outcome = 'none';
      return saved.destination;
    },
  };
}

export const sessionRouteContinuation = createSessionRouteContinuation();

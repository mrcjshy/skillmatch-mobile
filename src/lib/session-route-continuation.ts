import type { SessionLifetime } from '@/providers/session-provider';
import type { SheetPosition } from '@/lib/booking-sheet';

type Destination = { pathname: string; params: Record<string, string> };
type Observation = {
  access: string; ownerId: string | null; lifetime: SessionLifetime | null | undefined;
  pathname: string; params: Record<string, unknown>;
};
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

/** Navigation intent only. Never retains account/data authority or keeps a protected tree mounted. */
export function createSessionRouteContinuation() {
  let saved: { ownerId: string; lifetime: SessionLifetime; access: string; destination: Destination; sheetPosition?: SheetPosition } | null = null;
  let pending = false;
  const clear = () => { saved = null; pending = false; };
  const same = (ownerId: string | null, lifetime: SessionLifetime | null | undefined) =>
    saved !== null && saved.ownerId === ownerId && saved.lifetime === lifetime && saved.lifetime.isCurrent();
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
      const sheetPosition = same(ownerId, lifetime) && saved?.access === access && sameDestination(saved.destination, destination)
        ? saved.sheetPosition : undefined;
      saved = { ownerId, lifetime, access, destination, sheetPosition };
      pending = false;
    },
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
      return pending && same(ownerId, lifetime) && saved?.access === access && prefixFor(access)
        ? saved.destination : null;
    },
  };
}

export const sessionRouteContinuation = createSessionRouteContinuation();

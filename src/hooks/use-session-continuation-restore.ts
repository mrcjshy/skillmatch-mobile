import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useIsFocused, useNavigation, useRoute } from 'expo-router';

import { sessionRouteContinuation } from '@/lib/session-route-continuation';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';

/** What the destination screen's own authorized read has established so far. */
export type ContinuationReadOutcome = 'pending' | 'ready' | 'unavailable';

type StackRoute = { key?: string; name: string; params?: object };
type StackState = { index?: number; routes?: StackRoute[] };
type StackNavigation = { getState?: () => StackState | undefined; isFocused?: () => boolean;
  reset?: (state: { index: number; routes: StackRoute[] }) => void };
type ContinuationObservation = { access: 'client' | 'worker'; ownerId: string | null;
  lifetime: ReturnType<typeof useSession>['sessionLifetime']; pathname: string; params: Record<string, unknown> };

// File-route names inside the role group Stack (expo-router 57): the tab shell is `(tabs)`, opened on one tab.
const TAB_SCREEN: Record<string, string> = {
  '/client': 'client/index', '/client/jobs': 'client/jobs', '/client/bookings': 'client/bookings', '/client/profile': 'client/profile',
  '/worker': 'worker/index', '/worker/bookings': 'worker/bookings', '/worker/profile': 'worker/profile',
};
function stackRoute(entry: { pathname: string; params: Record<string, string> }): StackRoute {
  const tab = TAB_SCREEN[entry.pathname];
  return tab ? { name: '(tabs)', params: { screen: tab } } : { name: entry.pathname.slice(1), params: entry.params };
}
/**
 * The calling screen's own continuation identity: its route (not the app-wide URL), and only while that route is
 * the focused route of its Stack. Read at the moment of use, so a delayed result rechecks focus.
 */
export function useContinuationOwner(access: 'client' | 'worker') {
  const route = useRoute() as unknown as StackRoute;
  const navigation = useNavigation() as unknown as StackNavigation;
  const { session, sessionLifetime } = useSession();
  const latest = useRef({ route, navigation, ownerId: session?.user.id ?? null, lifetime: sessionLifetime });
  useLayoutEffect(() => {
    latest.current = { route, navigation, ownerId: session?.user.id ?? null, lifetime: sessionLifetime };
  });
  return useCallback((): ContinuationObservation | null => {
    const { route: own, navigation: stack, ownerId, lifetime } = latest.current;
    const state = stack.getState?.();
    const focused = state?.routes?.[state.index ?? 0];
    if (!own?.key || !focused || focused.key !== own.key || stack.isFocused?.() !== true) return null;
    return { access, ownerId, lifetime, pathname: '/' + own.name, params: { ...(own.params ?? {}) } };
  }, [access]);
}

/**
 * Option B (refresh continuation). After a refresh re-entry, the destination screen calls this with the result of
 * its OWN authorized read. Only the calling route, while it is the focused route of the role group Stack, may act:
 * then the saved allowlisted parents are rebuilt beneath it with React Navigation's `reset` (the current route
 * object, and so the mounted screen, is kept). That reset is recorded as dispatched (`unconfirmed`): this hook does
 * not observe the navigation it produces, and it is not a native Back check. A kept
 * existing stack completes as preserved. An unavailable destination before its read passed takes the existing
 * own-role Home fallback. Nothing is restored without fresh resolved access for the same owner and session
 * lifetime; no business action, sharing or call is ever resumed from here.
 */
export function useSessionContinuationRestore(access: 'client' | 'worker', outcome: ContinuationReadOutcome) {
  const navigation = useNavigation() as unknown as StackNavigation;
  const focused = useIsFocused();
  const owner = useContinuationOwner(access);
  const { session } = useSession();
  const { account, status } = useAccount();
  const ownerId = session?.user.id ?? null;
  const authorized = status === 'resolved' && account !== null && account.id === ownerId && account.role === access && account.is_active === true;
  useEffect(() => {
    if (outcome === 'pending' || !authorized || !focused) return;
    const observation = owner();
    if (!observation) return;
    if (outcome === 'unavailable') {
      if (sessionRouteContinuation.abandonRestore(observation)) navigation.reset?.({ index: 0, routes: [stackRoute({ pathname: `/${access}`, params: {} })] });
      return;
    }
    const state = navigation.getState?.();
    const current = state?.routes?.[state.index ?? 0];
    if (!current) return;
    // An existing user stack is never reordered: it completes the restoration as preserved.
    if (state?.routes?.length !== 1) { sessionRouteContinuation.completeParentChain(observation, 'preserved'); return; }
    const parents = sessionRouteContinuation.takeParentChain(observation);
    if (parents === null) return;
    if (!parents.length) { sessionRouteContinuation.completeParentChain(observation, 'preserved'); return; }
    const routes = [...parents.map(stackRoute), current];
    // Dispatched, not confirmed: the navigator commits the reset after this call (on the real builder an immediate
    // getState() still reports the pre-reset stack), so the outcome is `unconfirmed`, never `restored`.
    try {
      navigation.reset?.({ index: parents.length, routes });
    } finally {
      sessionRouteContinuation.completeParentChain(observation, 'unconfirmed');
    }
  }, [outcome, authorized, focused, owner, access, navigation]);
}

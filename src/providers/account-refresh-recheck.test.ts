import { act, createElement, Suspense, useEffect } from 'react';
import { fromByteArray } from 'base64-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '@/app/_layout';
import { sessionRouteContinuation } from '@/lib/session-route-continuation';
import { useSession } from '@/providers/session-provider';

// Option B refresh recheck (2026-10-21). Actual RootLayout, SessionProvider and AccountProvider; scripted
// Supabase responses only (no network, no database, no device). The protected group is a probe that counts mounts.
const b = vi.hoisted(() => ({
  authListener: null as null | ((event: string, session: unknown) => void),
  session: null as any, account: null as any, consent: null as any,
  selects: [] as (() => Promise<any>)[], selectCalls: 0, inserts: [] as unknown[], rpcs: [] as string[],
  protectedMounts: 0, protectedUnmounts: 0, failureShown: 0, messages: [] as string[],
  signOut: vi.fn(), signOutCurrentUser: vi.fn(), deactivate: vi.fn(),
  // Rework F2: the URL the root observes, and the session lifetime the protected group last mounted with.
  pathname: '/client', params: {} as Record<string, string>, lifetime: null as any,
  // Follow-up: an optional scripted consent read (the authorization stage after the account row).
  consentRead: null as null | (() => Promise<any>),
  // Worker deadline regression (final verify, agent A): scripted worker_profiles.is_verified reads. With no script
  // and no default, the worker_profiles table stays unexpected, exactly as before this extension.
  workerReads: [] as (() => Promise<any>)[], workerDefault: null as null | (() => Promise<any>), workerReadCalls: 0,
  workerMounts: 0, workerUnmounts: 0, lastAccount: null as any,
}));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: b.session }, error: null }),
    onAuthStateChange: (callback: typeof b.authListener) => {
      b.authListener = callback;
      return { data: { subscription: { unsubscribe: () => { b.authListener = null; } } } };
    },
    signOut: b.signOut,
    setSession: () => { throw Error('Unexpected setSession'); },
    startAutoRefresh: () => { throw Error('Unexpected native refresh'); },
    stopAutoRefresh: () => { throw Error('Unexpected native refresh'); },
  },
  rpc: (name: string) => {
    b.rpcs.push(name);
    if (name === 'get_my_consent') return (b.consentRead ?? (() => Promise.resolve({ data: b.consent, error: null })))();
    if (name === 'get_my_identity_submission' && b.workerDefault) return Promise.resolve({ data: null, error: null });
    throw Error('Unexpected RPC ' + name);
  },
  from: (table: string) => {
    if (table === 'worker_profiles' && (b.workerReads.length > 0 || b.workerDefault)) {
      return { select: () => ({ eq: () => ({ maybeSingle: () => { b.workerReadCalls++; return (b.workerReads.shift() ?? b.workerDefault!)(); } }) }) };
    }
    if (table !== 'users') throw Error('Unexpected table ' + table);
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => { b.selectCalls++; return (b.selects.shift() ?? (() => Promise.resolve({ data: b.account, error: null })))(); } }) }),
      insert: (row: unknown) => { b.inserts.push(row); return Promise.resolve({ error: null }); },
    };
  },
  storage: { from: () => { throw Error('Unexpected Storage'); } },
} }));
vi.mock('@/lib/sign-out', () => ({ signOutCurrentUser: b.signOutCurrentUser }));
vi.mock('@supabase/supabase-js', () => ({ AuthError: class AuthError extends Error {} }));
vi.mock('expo-linking', () => ({ getInitialURL: async () => null, addEventListener: () => ({ remove() {} }) }));
vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (values: any) => values.web ?? values.default }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  StyleSheet: { create: (styles: unknown) => styles }, View: () => null, Text: () => null, ActivityIndicator: () => null,
}));
vi.mock('tamagui', () => ({ TamaguiProvider: ({ children }: any) => children }));
vi.mock('../../tamagui.config', () => ({ tamaguiConfig: {} }));
vi.mock('@/components/push-notification-inbox-intent', () => ({ PushNotificationInboxIntent: () => null }));
vi.mock('@/components/incoming-message-banner-host', () => ({ IncomingMessageBannerHost: () => null }));
vi.mock('@/components/incoming-call-host', () => ({ IncomingCallHost: () => null }));
vi.mock('@/components/location-stop-host', () => ({ LocationStopHost: () => null }));
vi.mock('@/components/state-screen', () => ({ StateScreen: ({ message }: any) => { b.messages.push(message); return null; } }));
vi.mock('@/components/session-reconnecting-screen', () => ({ SessionReconnectingScreen: () => null }));
vi.mock('expo-router', () => {
  const Stack = ({ children }: any) => children;
  Stack.Protected = function ProtectedBoundary({ guard, children }: any) { return guard ? children : null; };
  Stack.Screen = function ScreenBoundary({ name }: any) {
    return name === '(client)' ? createElement(ProtectedProbe) : name === '(worker)' ? createElement(WorkerProbe)
      : name === 'bootstrap-error' ? createElement(FailureProbe) : null;
  };
  return { Stack, usePathname: () => b.pathname, useGlobalSearchParams: () => b.params, useRootNavigationState: () => undefined };
});
function ProtectedProbe() {
  const { sessionLifetime } = useSession();
  useEffect(() => { b.lifetime = sessionLifetime; }, [sessionLifetime]);
  useEffect(() => { b.protectedMounts++; return () => { b.protectedUnmounts++; }; }, []);
  return null;
}
function FailureProbe() { useEffect(() => { b.failureShown++; }, []); return null; }
function WorkerProbe() { useEffect(() => { b.workerMounts++; return () => { b.workerUnmounts++; }; }, []); return null; }
const mounted = () => b.protectedMounts - b.protectedUnmounts;
const workerMounted = () => b.workerMounts - b.workerUnmounts;

type Root = { render(node: unknown): void; unmount(): void };
const roots: Root[] = [];
async function start() {
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const rendererModule: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ rendererModule);
  const root = renderer.createRoot(container) as Root; roots.push(root);
  await act(async () => root.render(createElement(Suspense, { fallback: null }, createElement(RootLayout))));
  await settle();
}
async function settle(rounds = 30) { for (let i = 0; i < rounds; i++) await act(async () => { await Promise.resolve(); }); }
const ISS = 'https://synthetic.supabase.co/auth/v1', OTHER_ISS = 'http://10.0.2.2:54321/auth/v1';
function token(iat: number, marker = '22222222-2222-4222-8222-222222222222', user = '11111111-1111-4111-8111-111111111111', iss = ISS) {
  const json = JSON.stringify({ iss, sub: user, session_id: marker, iat });
  return 'e30.' + fromByteArray(new Uint8Array(Array.from(json, c => c.charCodeAt(0)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.c2ln';
}
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; }
let iat = 1;
async function refresh(marker?: string, iss?: string) {
  const next = { ...b.session, access_token: token(++iat, marker, b.session.user.id, iss), user: { ...b.session.user } };
  b.session = next;
  await act(async () => { b.authListener!('TOKEN_REFRESHED', next); });
}
const REGISTRATION = { registration_full_name: 'Synthetic Client', registration_phone: '09170000000', registration_role_intent: 'client' };
const DEADLINE = 10_000;

describe('Option B refresh account recheck', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://synthetic.supabase.co');
    b.session = { access_token: token(1), refresh_token: 'r', user: { id: '11111111-1111-4111-8111-111111111111', email: 'client@example.test', user_metadata: {} } };
    b.account = { id: '11111111-1111-4111-8111-111111111111', email: 'client@example.test', full_name: 'Synthetic Client', phone: '09170000000',
      role: 'client', barangay: 'Santa Ana', city: 'Pateros', is_active: true };
    b.consent = { user_id: b.account.id, terms_version: '2026-09-v1', terms_accepted_at: '2026-09-25T00:00:00Z',
      privacy_version: '2026-10-v1', privacy_acknowledged_at: '2026-09-25T00:00:00Z' };
    Object.assign(b, { selects: [], selectCalls: 0, inserts: [], rpcs: [], protectedMounts: 0, protectedUnmounts: 0, failureShown: 0, messages: [] });
    b.signOut.mockReset(); b.signOutCurrentUser.mockReset(); b.deactivate.mockReset();
    sessionRouteContinuation.clear();
  });
  afterEach(async () => {
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    // No path under test may sign anyone out or touch push tokens.
    expect(b.signOut).not.toHaveBeenCalled(); expect(b.signOutCurrentUser).not.toHaveBeenCalled();
    vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });

  it('hides protected content for the whole pending recheck and remounts only after fresh success', async () => {
    await start(); expect(mounted()).toBe(1);
    const read = deferred(); b.selects.push(() => read.promise);
    await refresh();
    expect(mounted()).toBe(0); expect(b.messages.at(-1)).toBe('Checking your account…');
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE - 1); });
    expect(mounted()).toBe(0);
    await act(async () => { read.resolve({ data: b.account, error: null }); }); await settle();
    expect(mounted()).toBe(1); expect(b.failureShown).toBe(0);
  });

  it('never INSERTs a missing account row at refresh; it fails closed instead (initial provisioning unchanged)', async () => {
    // Valid registration metadata: the shared bootstrap WOULD provision here if the refresh path reached it.
    b.session.user.user_metadata = { registration_full_name: 'Synthetic Client', registration_phone: '09170000000', registration_role_intent: 'client' };
    await start(); expect(b.inserts).toEqual([]);
    b.selects.push(() => Promise.resolve({ data: null, error: null }));
    await refresh(); await settle();
    expect(b.inserts).toEqual([]); expect(mounted()).toBe(0); expect(b.failureShown).toBe(1);
  });

  it('initial bootstrap still provisions a genuinely missing row exactly once (control)', async () => {
    b.session.user.user_metadata = { registration_full_name: 'Synthetic New', registration_phone: '09170000001', registration_role_intent: 'client' };
    b.selects.push(() => Promise.resolve({ data: null, error: null }));
    await start();
    expect(b.inserts).toHaveLength(1); expect(mounted()).toBe(1);
  });

  it('times out after 10 s total into an explicit Retry state, and a late response cannot reopen access', async () => {
    await start();
    const late = deferred(); b.selects.push(() => late.promise);
    await refresh();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE); }); await settle();
    expect(mounted()).toBe(0); expect(b.failureShown).toBe(1);
    await act(async () => { late.resolve({ data: b.account, error: null }); }); await settle();
    expect(mounted()).toBe(0);
  });

  it('overlapping refreshes do not extend the original deadline', async () => {
    await start();
    b.selects.push(() => new Promise(() => {}), () => new Promise(() => {}));
    await refresh();
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    await refresh();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE - 6_000); }); await settle();
    expect(b.failureShown).toBe(1); expect(mounted()).toBe(0);
  });

  it('retries one transient account read inside the budget, then succeeds', async () => {
    await start(); const before = b.selectCalls;
    b.selects.push(() => Promise.resolve({ data: null, error: { message: 'network', code: '' } }));
    await refresh(); await settle();
    expect(b.selectCalls - before).toBe(2); expect(mounted()).toBe(1);
  });

  it('allows at most one transient retry', async () => {
    await start(); const before = b.selectCalls;
    const transient = () => Promise.resolve({ data: null, error: { message: 'network', code: '' } });
    b.selects.push(transient, transient, transient);
    await refresh(); await settle();
    expect(b.selectCalls - before).toBe(2); expect(b.failureShown).toBe(1); expect(mounted()).toBe(0);
  });

  it.each(['42501', 'PGRST301'])('a definite denial (%s) fails closed immediately without a retry', async code => {
    await start(); const before = b.selectCalls;
    b.selects.push(() => Promise.resolve({ data: null, error: { message: 'denied', code } }));
    await refresh(); await settle();
    expect(b.selectCalls - before).toBe(1); expect(b.failureShown).toBe(1); expect(mounted()).toBe(0);
  });

  it('an inactive or changed-role account at refresh never reopens the protected group', async () => {
    await start();
    b.selects.push(() => Promise.resolve({ data: { ...b.account, is_active: false }, error: null }));
    await refresh(); await settle();
    expect(mounted()).toBe(0);
    b.selects.push(() => Promise.resolve({ data: { ...b.account, role: 'worker' }, error: null }));
    await refresh(); await settle();
    expect(mounted()).toBe(0);
  });

  it('a user Retry after timeout gets a fresh budget and can succeed', async () => {
    await start();
    b.selects.push(() => new Promise(() => {}));
    await refresh();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE); }); await settle();
    expect(b.failureShown).toBe(1);
    const { useAccount } = await import('@/providers/account-provider');
    void useAccount; // the Retry control calls retryAccountBootstrap; the probe below reaches it through the context
    await act(async () => { retry!(); }); await settle();
    expect(mounted()).toBe(1);
  });

  // Rework F2 replaces the former "a new session lifetime is an initial bootstrap" case: for a user this provider
  // already confirmed, only a real sign-out or a user change ends read-only rechecking (see the block below).
  it('a new session lifetime for the confirmed user (no sign-out) is still a read-only recheck: the deadline applies', async () => {
    await start();
    b.selects.push(() => new Promise(() => {}));
    await refresh('99999999-9999-4999-8999-999999999999');
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE); }); await settle();
    expect(b.failureShown).toBe(1); expect(mounted()).toBe(0);
  });

  it('after a real sign-out, the next sign-in is an initial bootstrap: no deadline applies', async () => {
    await start();
    await act(async () => { b.authListener!('SIGNED_OUT', null); }); await settle();
    b.selects.push(() => new Promise(() => {}));
    const next = { ...b.session, access_token: token(++iat, '99999999-9999-4999-8999-999999999999') };
    b.session = next;
    await act(async () => { b.authListener!('SIGNED_IN', next); });
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE * 3); }); await settle();
    expect(b.failureShown).toBe(0); expect(mounted()).toBe(0);
    expect(b.messages.at(-1)).toBe('Checking your account…');
  });
});

// Rework F2 (2026-10-21): read-only classification is the provider's own confirmation history, not the parsed
// session lifetime. History only selects read-only mode; every check still needs a fresh authoritative row.
describe('Option B rework: confirmed-user rechecks stay read-only', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://synthetic.supabase.co');
    b.session = { access_token: token(1), refresh_token: 'r', user: { id: '11111111-1111-4111-8111-111111111111', email: 'client@example.test', user_metadata: { ...REGISTRATION } } };
    b.account = { id: '11111111-1111-4111-8111-111111111111', email: 'client@example.test', full_name: 'Synthetic Client', phone: '09170000000',
      role: 'client', barangay: 'Santa Ana', city: 'Pateros', is_active: true };
    b.consent = { user_id: b.account.id, terms_version: '2026-09-v1', terms_accepted_at: '2026-09-25T00:00:00Z',
      privacy_version: '2026-10-v1', privacy_acknowledged_at: '2026-09-25T00:00:00Z' };
    Object.assign(b, { selects: [], selectCalls: 0, inserts: [], rpcs: [], protectedMounts: 0, protectedUnmounts: 0, failureShown: 0, messages: [],
      pathname: '/client', params: {}, lifetime: null, consentRead: null });
    b.signOut.mockReset(); b.signOutCurrentUser.mockReset(); b.deactivate.mockReset();
    sessionRouteContinuation.clear();
  });
  afterEach(async () => {
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    expect(b.signOut).not.toHaveBeenCalled(); expect(b.signOutCurrentUser).not.toHaveBeenCalled();
    vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });
  const missing = () => Promise.resolve({ data: null, error: null });
  const transient = () => Promise.resolve({ data: null, error: { message: 'network', code: '' } });

  it('confirmed user, mismatched issuer, missing row: zero INSERTs and fail closed', async () => {
    await start(); expect(mounted()).toBe(1);
    b.selects.push(missing);
    await refresh(undefined, OTHER_ISS); await settle();
    expect(b.inserts).toEqual([]); expect(mounted()).toBe(0); expect(b.failureShown).toBe(1);
  });

  it('confirmed user, mismatched issuer, existing row: a fresh authorization still decides access', async () => {
    await start(); const before = b.selectCalls;
    // History never authorizes: a fresh inactive row keeps the group closed even for a confirmed user.
    b.selects.push(() => Promise.resolve({ data: { ...b.account, is_active: false }, error: null }));
    await refresh(undefined, OTHER_ISS); await settle();
    expect(b.selectCalls - before).toBe(1); expect(mounted()).toBe(0);
    b.selects.push(() => Promise.resolve({ data: b.account, error: null }));
    await refresh(undefined, OTHER_ISS); await settle();
    expect(mounted()).toBe(1); expect(b.inserts).toEqual([]);
  });

  it.each([
    ['error', ISS], ['timeout', ISS], ['error', OTHER_ISS], ['timeout', OTHER_ISS],
  ] as const)('%s (issuer %s) followed by Try again: a missing row still cannot be provisioned', async (kind, iss) => {
    await start();
    b.selects.push(...(kind === 'error' ? [transient, transient] : [() => new Promise<any>(() => {})]));
    await refresh(undefined, iss);
    if (kind === 'timeout') await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE); });
    await settle(); expect(b.failureShown).toBe(1);
    // Only the Try-again read is scripted from here, so a different retry count cannot mask provisioning.
    b.selects.length = 0;
    b.selects.push(missing);
    await act(async () => { retry!(); }); await settle();
    expect(b.inserts).toEqual([]); expect(mounted()).toBe(0); expect(b.failureShown).toBe(2);
  });

  it('a stale result after sign-out revives neither access nor the confirmation history', async () => {
    await start();
    const late = deferred(); b.selects.push(() => late.promise);
    await refresh();
    await act(async () => { b.authListener!('SIGNED_OUT', null); }); await settle();
    await act(async () => { late.resolve({ data: b.account, error: null }); }); await settle();
    expect(mounted()).toBe(0);
    // Had the stale success re-recorded the user, this sign-in would be a read-only recheck with no INSERT.
    b.selects.push(missing);
    const next = { ...b.session, access_token: token(++iat, '77777777-7777-4777-8777-777777777777') };
    b.session = next;
    await act(async () => { b.authListener!('SIGNED_IN', next); }); await settle();
    expect(b.inserts).toHaveLength(1); expect(mounted()).toBe(1);
  });

  it("a user change discards the previous user's late result; the new user's initial bootstrap provisions once", async () => {
    await start();
    const late = deferred(); b.selects.push(() => late.promise);
    await refresh();
    const OTHER = '33333333-3333-4333-8333-333333333333';
    const otherRow = { ...b.account, id: OTHER, email: 'other@example.test', full_name: 'Synthetic Other' };
    const other = { access_token: token(++iat, '88888888-8888-4888-8888-888888888888', OTHER), refresh_token: 'r2',
      user: { id: OTHER, email: 'other@example.test', user_metadata: { ...REGISTRATION, registration_full_name: 'Synthetic Other' } } };
    b.selects.push(missing, () => Promise.resolve({ data: otherRow, error: null }));
    b.consent = { ...b.consent, user_id: OTHER };
    b.session = other;
    await act(async () => { b.authListener!('SIGNED_IN', other); }); await settle();
    await act(async () => { late.resolve({ data: { ...b.account }, error: null }); }); await settle();
    expect(b.inserts).toEqual([expect.objectContaining({ id: OTHER })]);
    expect(mounted()).toBe(1);
  });

  it('initial signup provisions exactly once; a later refresh that finds the row gone never inserts again', async () => {
    b.selects.push(missing);
    await start();
    expect(b.inserts).toHaveLength(1); expect(mounted()).toBe(1);
    for (const iss of [ISS, OTHER_ISS]) {
      b.selects.push(missing);
      await refresh(undefined, iss); await settle();
    }
    expect(b.inserts).toHaveLength(1); expect(mounted()).toBe(0);
  });

  // Follow-up (independent review, 2026-10-21): the 10 s recheck budget is absolute. A response that settles after
  // the deadline, while the timeout callback is still queued, must take the timeout path, never publish success.
  it('follow-up: the deadline passes with its timeout still queued and a valid account read resolves first: timeout state', async () => {
    await start();
    const read = deferred(); b.selects.push(() => read.promise);
    await refresh();
    expect(mounted()).toBe(0);
    vi.setSystemTime(Date.now() + DEADLINE + 1); // the clock is past the deadline; the queued timeout has not run
    await act(async () => { read.resolve({ data: b.account, error: null }); }); await settle();
    expect(mounted()).toBe(0); expect(b.failureShown).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE); }); await settle();
    expect(mounted()).toBe(0); expect(b.failureShown).toBe(1);
    // The spent budget was not cleared by a success path: a further refresh without Try again stays closed.
    b.selects.push(() => Promise.resolve({ data: b.account, error: null }));
    await refresh(); await settle();
    expect(mounted()).toBe(0);
    // A deliberate Try again gets a fresh budget.
    await act(async () => { retry!(); }); await settle();
    expect(mounted()).toBe(1);
  });

  it('follow-up: a later authorization-stage (consent) response after the deadline cannot publish success', async () => {
    await start();
    const consent = deferred(); b.consentRead = () => consent.promise;
    await refresh(); await settle(); // the own row is read; the consent stage is still pending
    expect(mounted()).toBe(0);
    vi.setSystemTime(Date.now() + DEADLINE + 1);
    await act(async () => { consent.resolve({ data: b.consent, error: null }); }); await settle();
    expect(mounted()).toBe(0); expect(b.failureShown).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE); }); await settle();
    expect(mounted()).toBe(0); expect(b.failureShown).toBe(1);
  });

  it('follow-up: a response settling just inside the deadline still succeeds (the bound is not early)', async () => {
    await start();
    const read = deferred(); b.selects.push(() => read.promise);
    await refresh();
    vi.setSystemTime(Date.now() + DEADLINE - 1);
    await act(async () => { read.resolve({ data: b.account, error: null }); }); await settle();
    expect(mounted()).toBe(1); expect(b.failureShown).toBe(0);
  });

  // Follow-up: a sign-out and the same user's sign-in delivered in one React batch never show the account effect
  // a null session, so the identity boundary must come from the auth lifecycle itself.
  it('follow-up: SIGNED_OUT then same-user SIGNED_IN in one batch ends the confirmation history and the spent budget', async () => {
    await start();
    b.selects.push(() => new Promise<any>(() => {}));
    await refresh();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE); }); await settle();
    expect(b.failureShown).toBe(1); // the recheck budget is spent
    const next = { ...b.session, access_token: token(++iat, '77777777-7777-4777-8777-777777777777') };
    b.session = next;
    b.selects.length = 0; b.selects.push(missing);
    await act(async () => { b.authListener!('SIGNED_OUT', null); b.authListener!('SIGNED_IN', next); }); await settle();
    // A real identity boundary: an initial bootstrap (this registration provisions once), not an expired recheck.
    expect(b.inserts).toHaveLength(1); expect(mounted()).toBe(1);
    // An ordinary issuer-mismatched refresh afterwards is still not a boundary: read-only, no second INSERT.
    b.selects.push(missing);
    await refresh(undefined, OTHER_ISS); await settle();
    expect(b.inserts).toHaveLength(1); expect(mounted()).toBe(0);
  });

  it('follow-up: a response from before a batched sign-out/sign-in stays invalid', async () => {
    await start();
    const late = deferred(); b.selects.push(() => late.promise);
    await refresh();
    const next = { ...b.session, access_token: token(++iat, '77777777-7777-4777-8777-777777777777') };
    b.session = next;
    b.selects.push(() => Promise.resolve({ data: b.account, error: null }));
    await act(async () => { b.authListener!('SIGNED_OUT', null); b.authListener!('SIGNED_IN', next); }); await settle();
    expect(mounted()).toBe(1);
    await act(async () => { late.resolve({ data: { ...b.account, is_active: false }, error: null }); }); await settle();
    expect(mounted()).toBe(1); expect(b.inserts).toEqual([]);
  });

  it('continuation follows the auth lifecycle: kept across a same-lifetime refresh, discarded when continuity is unknown', async () => {
    const BOOKING = '44444444-4444-4444-8444-444444444444', USER = b.session.user.id;
    const onChat = () => { b.pathname = '/client/chat'; b.params = { bookingId: BOOKING }; };
    // While a re-entry is pending the dispatcher owns '/', as in the app.
    const onDispatcher = () => { b.pathname = '/'; b.params = {}; };
    onChat(); await start();
    onDispatcher(); await refresh(); await settle();
    // Same session_id under the expected issuer: the root keeps the saved destination for the fresh re-entry.
    expect(sessionRouteContinuation.destination('client', USER, b.lifetime)).toEqual({ pathname: '/client/chat', params: { bookingId: BOOKING } });
    sessionRouteContinuation.clear();
    onChat(); await refresh(); await settle();
    const before = b.lifetime;
    onDispatcher(); await refresh(undefined, OTHER_ISS); await settle();
    // Unknown continuity (issuer mismatch): a new lifetime, so the intent is discarded and re-entry takes role Home.
    expect(b.lifetime).not.toBe(before);
    expect(sessionRouteContinuation.destination('client', USER, b.lifetime)).toBeNull();
    expect(b.inserts).toEqual([]);
  });
});

// Final verification (agent A, 2026-10-21): the Worker identity-verification stage is the last authorization read
// before a recheck publishes. A valid is_verified=true response that settles after the absolute 10 s deadline, while
// the timeout callback is still queued, must take the timeout path and never admit the Worker group.
describe('Option B recheck deadline: Worker identity-verification stage', () => {
  const WORKER = '55555555-5555-4555-8555-555555555555';
  const TIMEOUT_MESSAGE = 'Checking your account took too long. Please try again.';
  const verified = () => Promise.resolve({ data: { is_verified: true }, error: null });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://synthetic.supabase.co');
    b.session = { access_token: token(1, undefined, WORKER), refresh_token: 'r', user: { id: WORKER, email: 'worker@example.test',
      user_metadata: { registration_full_name: 'Synthetic Worker', registration_phone: '09170000002', registration_role_intent: 'worker' } } };
    b.account = { id: WORKER, email: 'worker@example.test', full_name: 'Synthetic Worker', phone: '09170000002',
      role: 'worker', barangay: 'Santa Ana', city: 'Pateros', is_active: true };
    b.consent = { user_id: WORKER, terms_version: '2026-09-v1', terms_accepted_at: '2026-09-25T00:00:00Z',
      privacy_version: '2026-10-v1', privacy_acknowledged_at: '2026-09-25T00:00:00Z' };
    Object.assign(b, { selects: [], selectCalls: 0, inserts: [], rpcs: [], protectedMounts: 0, protectedUnmounts: 0, failureShown: 0, messages: [],
      pathname: '/worker', params: {}, lifetime: null, consentRead: null,
      workerReads: [], workerDefault: verified, workerReadCalls: 0, workerMounts: 0, workerUnmounts: 0, lastAccount: null });
    b.signOut.mockReset(); b.signOutCurrentUser.mockReset(); b.deactivate.mockReset();
    sessionRouteContinuation.clear();
  });
  afterEach(async () => {
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    expect(b.signOut).not.toHaveBeenCalled(); expect(b.signOutCurrentUser).not.toHaveBeenCalled();
    // A confirmed Worker's recheck never provisions, whatever the outcome.
    expect(b.inserts).toEqual([]);
    Object.assign(b, { workerReads: [], workerDefault: null, lastAccount: null });
    vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });
  /** Start as an admitted, verified Worker, then begin a TOKEN_REFRESHED recheck whose Worker verification read is
   *  held open after the account row and the consent stage have both resolved inside the budget. */
  async function recheckHeldAtWorkerStage() {
    await start();
    expect(workerMounted()).toBe(1); expect(mounted()).toBe(0); expect(b.failureShown).toBe(0);
    const selectsBefore = b.selectCalls, workerBefore = b.workerReadCalls;
    const consentBefore = b.rpcs.filter(name => name === 'get_my_consent').length;
    const verification = deferred(); b.workerReads.push(() => verification.promise);
    await refresh(); await settle();
    // Account and consent resolved; the run is now waiting on the Worker verification read only.
    expect(b.selectCalls - selectsBefore).toBe(1);
    expect(b.rpcs.filter(name => name === 'get_my_consent').length - consentBefore).toBe(1);
    expect(b.workerReadCalls - workerBefore).toBe(1);
    expect(workerMounted()).toBe(0); expect(b.failureShown).toBe(0); expect(b.messages.at(-1)).toBe('Checking your account…');
    return verification;
  }

  it('a valid Worker verification that settles after the deadline, timeout still queued, shows the timeout Retry state', async () => {
    const verification = await recheckHeldAtWorkerStage();
    vi.setSystemTime(Date.now() + DEADLINE + 1); // past the deadline; the queued timeout callback has NOT run
    await act(async () => { verification.resolve({ data: { is_verified: true }, error: null }); }); await settle();
    expect(workerMounted()).toBe(0); expect(mounted()).toBe(0); expect(b.failureShown).toBe(1);
    expect(b.lastAccount.status).toBe('error');
    expect(b.lastAccount.accountError).toEqual({ code: 'account_fetch_failed', message: TIMEOUT_MESSAGE });
    expect(b.lastAccount.account).toBeNull(); expect(b.lastAccount.workerIsVerified).toBe(false);
    expect(b.lastAccount.workerOnboardingState).toBe('loading');
    // The queued timer now runs: a no-op on an already timed-out run. Access stays closed.
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE); }); await settle();
    expect(workerMounted()).toBe(0); expect(b.failureShown).toBe(1);
    // The spent budget was not cleared: a further refresh without Try again, every read valid, stays closed.
    await refresh(); await settle();
    expect(workerMounted()).toBe(0); expect(b.lastAccount.accountError?.message).toBe(TIMEOUT_MESSAGE);
    // A deliberate Try again gets a fresh budget and re-reads verification; a valid result now admits the Worker.
    const workerBefore = b.workerReadCalls;
    await act(async () => { retry!(); }); await settle();
    expect(b.workerReadCalls - workerBefore).toBe(1);
    expect(workerMounted()).toBe(1); expect(b.lastAccount.status).toBe('resolved'); expect(b.lastAccount.workerIsVerified).toBe(true);
  });

  it('control: the same Worker verification settling just inside the deadline admits the Worker', async () => {
    const verification = await recheckHeldAtWorkerStage();
    vi.setSystemTime(Date.now() + DEADLINE - 1);
    await act(async () => { verification.resolve({ data: { is_verified: true }, error: null }); }); await settle();
    expect(workerMounted()).toBe(1); expect(b.failureShown).toBe(0);
    expect(b.lastAccount.status).toBe('resolved'); expect(b.lastAccount.workerOnboardingState).toBe('verified');
    // The success cleared its own timer: running past the old deadline changes nothing.
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE); }); await settle();
    expect(workerMounted()).toBe(1); expect(b.failureShown).toBe(0);
  });

  it('stale: after the timer times out, a late valid verification, and one arriving during Try again, never reopen access', async () => {
    const verification = await recheckHeldAtWorkerStage();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE); }); await settle();
    expect(workerMounted()).toBe(0); expect(b.failureShown).toBe(1);
    expect(b.lastAccount.accountError?.message).toBe(TIMEOUT_MESSAGE);
    // Try again with its own verification read held open, then release the OLD run's valid response first.
    const fresh = deferred(); b.workerReads.push(() => fresh.promise);
    await act(async () => { retry!(); }); await settle();
    expect(b.messages.at(-1)).toBe('Checking your account…');
    await act(async () => { verification.resolve({ data: { is_verified: true }, error: null }); }); await settle();
    expect(workerMounted()).toBe(0); expect(b.lastAccount.status).toBe('pending');
    // The fresh, authoritative answer decides: not verified, so the Worker group stays closed (ID onboarding).
    await act(async () => { fresh.resolve({ data: { is_verified: false }, error: null }); }); await settle();
    expect(workerMounted()).toBe(0); expect(b.lastAccount.status).toBe('resolved');
    expect(b.lastAccount.workerIsVerified).toBe(false); expect(b.lastAccount.workerOnboardingState).toBe('needs-submission');
  });
});

let retry: null | (() => void) = null;
vi.mock('@/app/bootstrap-error', () => ({ default: () => null }));
// Capture the context's Retry action the way the bootstrap-error screen's "Try again" uses it.
vi.mock('@/providers/account-provider', async importOriginal => {
  const actual = await importOriginal<any>();
  return { ...actual, useAccount: () => { const value = actual.useAccount(); retry = value.retryAccountBootstrap; b.lastAccount = value; return value; } };
});

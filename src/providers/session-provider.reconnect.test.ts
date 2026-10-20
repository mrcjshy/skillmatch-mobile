import { GoTrueClient } from '@supabase/auth-js';
import { act, createElement, useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveAccessState } from '@/app/_layout';
import { withAuthRequestTimeout } from '@/lib/auth-request-timeout';
import { SessionProvider, useSession, type SessionContextValue } from './session-provider';

// Real auth-js client over an in-memory store and a scripted fetch: the event order
// below is the library's own, not an assumption. No network, no hosted backend.
const h = vi.hoisted(() => ({
  auth: null as any,
  latest: null as SessionContextValue | null,
  log: [] as string[],
  respond: null as null | ((path: string) => Promise<Response>),
  appState: null as null | ((state: string) => void),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { get auth() { return h.auth; } } }));
vi.mock('expo-linking', () => ({ getInitialURL: async () => null, addEventListener: () => ({ remove() {} }) }));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { currentState: 'active', addEventListener: (_: string, fn: (state: string) => void) => { h.appState = fn; return { remove() { h.appState = null; } }; } },
}));
// The root layout is imported only for its pure access derivation.
vi.mock('expo-router', () => ({ Stack: Object.assign(() => null, { Screen: () => null, Protected: () => null }) }));
vi.mock('tamagui', () => ({ TamaguiProvider: () => null }));
vi.mock('../../tamagui.config', () => ({ tamaguiConfig: {} }));
vi.mock('@/components/push-notification-inbox-intent', () => ({ PushNotificationInboxIntent: () => null }));
vi.mock('@/components/incoming-message-banner-host', () => ({ IncomingMessageBannerHost: () => null }));
vi.mock('@/components/incoming-call-host', () => ({ IncomingCallHost: () => null }));
vi.mock('@/components/location-stop-host', () => ({ LocationStopHost: () => null }));
vi.mock('@/components/state-screen', () => ({ StateScreen: () => null }));
vi.mock('@/components/app-button', () => ({ AppButton: () => null }));
vi.mock('@/providers/account-provider', () => ({ AccountProvider: () => null, useAccount: () => null }));

const USER = '11111111-1111-4111-8111-111111111111';
const STORAGE_KEY = 'sb-synthetic-auth-token';
const user = { id: USER, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
const nowSeconds = () => Math.floor(Date.now() / 1000);
const stored = (expiresAt: number) => ({ access_token: 'e30.e30.b2xk', refresh_token: 'stored-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user });
// A gateway timeout holds the request for a long time before answering 504; moving the
// (faked) clock reproduces when auth-js's own refresh backoff gives up.
const gateway = () => { vi.setSystemTime(Date.now() + 30_000); return Promise.resolve(new Response('Gateway Timeout', { status: 504 })); };
const refreshed = () => Promise.resolve(new Response(JSON.stringify({ ...stored(nowSeconds() + 3600), access_token: 'e30.e30.bmV3', refresh_token: 'rotated-refresh' }), { status: 200, headers: { 'content-type': 'application/json' } }));
const revoked = () => Promise.resolve(new Response(JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }), { status: 400, headers: { 'content-type': 'application/json' } }));
// A resolved, verified Worker: if a session were ever exposed, this would grant the Worker shell.
const verifiedWorker = { account: { id: USER, role: 'worker', is_active: true }, status: 'resolved', accountError: null, hasCurrentConsent: true, workerOnboardingState: 'verified' } as any;
const access = (account: any = { account: null, status: 'idle', accountError: null, hasCurrentConsent: false, workerOnboardingState: null }) => deriveAccessState(h.latest!, account, false);

let memory: Map<string, string>;
function client({ deadlineMs }: { deadlineMs?: number } = {}) {
  const storage = { getItem: async (k: string) => memory.get(k) ?? null, setItem: async (k: string, v: string) => { memory.set(k, v); }, removeItem: async (k: string) => { memory.delete(k); } };
  const scriptedFetch = (async (input: RequestInfo | URL) => { const path = new URL(String(input)).pathname + new URL(String(input)).search; h.log.push('fetch ' + path); return h.respond!(path); }) as typeof fetch;
  const auth = new GoTrueClient({
    url: 'https://synthetic.supabase.co/auth/v1', headers: { apikey: 'synthetic' }, storageKey: STORAGE_KEY, storage,
    autoRefreshToken: true, persistSession: true, detectSessionInUrl: false,
    // The app wraps the same fetch with the Auth-only deadline (src/lib/supabase.ts).
    fetch: deadlineMs === undefined ? scriptedFetch : withAuthRequestTimeout('https://synthetic.supabase.co', { fetch: scriptedFetch, timeoutMs: deadlineMs }),
  });
  const on = auth.onAuthStateChange.bind(auth);
  (auth as any).onAuthStateChange = (cb: any) => on((event, session) => { h.log.push(`${event}:${session ? 'session' : 'null'}`); return cb(event, session); });
  const get = auth.getSession.bind(auth);
  (auth as any).getSession = async () => { h.log.push('getSession called'); const r = await get(); h.log.push('getSession ' + (r.error ? r.error.name : r.data.session ? 'session' : 'null')); return r; };
  return auth;
}

function Observer() { const value = useSession(); useLayoutEffect(() => { h.latest = value; }); return null; }
let root: any;
async function mount() {
  const doc = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const win = { document: doc, event: undefined, HTMLIFrameElement: class {} }; doc.defaultView = win;
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const module: string = 'react-dom/client'; const renderer = await import(/* @vite-ignore */ module);
  root = renderer.createRoot({ nodeType: 1, tagName: 'DIV', ownerDocument: doc, firstChild: null, lastChild: null, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} });
  await act(async () => root.render(createElement(SessionProvider, null, createElement(Observer))));
}
async function settle(until: () => boolean) {
  for (let i = 0; i < 200 && !until(); i++) await act(async () => { await new Promise(done => setTimeout(done, 5)); });
  expect(until(), h.log.join(' | ')).toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  memory = new Map(); h.latest = null; h.log = []; h.respond = gateway; h.appState = null;
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  if (root) await act(async () => root.unmount()); root = null;
  h.auth?.stopAutoRefresh(); h.auth = null;
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('session restore while Supabase Auth is temporarily unreachable (real auth-js, offline)', () => {
  it('keeps a stored session and shows reconnecting, never Sign in, when refresh returns 504', async () => {
    memory.set(STORAGE_KEY, JSON.stringify(stored(nowSeconds() - 60)));
    h.auth = client(); await mount();
    await settle(() => h.log.includes('getSession AuthRetryableFetchError') && h.latest!.isSessionLoading === false);
    // Verified order: the ambiguous INITIAL_SESSION(null) lands between the restore
    // call and its retryable error, which is what used to discard the error.
    const order = ['getSession called', 'INITIAL_SESSION:null', 'getSession AuthRetryableFetchError'].map(step => h.log.indexOf(step));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(access()).toBe('session-reconnecting');
    expect(access(verifiedWorker)).toBe('session-reconnecting');
    expect(h.latest).toMatchObject({ session: null, sessionError: null, isSessionReconnecting: true });
    expect(JSON.parse(memory.get(STORAGE_KEY)!).refresh_token).toBe('stored-refresh');
  });

  it('stays in restoring, not Sign in, while the first restore result is delayed', async () => {
    memory.set(STORAGE_KEY, JSON.stringify(stored(nowSeconds() - 60)));
    let release!: () => void; const held = new Promise<void>(done => { release = done; });
    h.respond = async () => { await held; return gateway(); };
    h.auth = client(); await mount();
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise(done => setTimeout(done, 5)); });
    expect(access()).toBe('session-restoring');
    release();
    await settle(() => h.latest!.isSessionLoading === false);
    expect(access()).toBe('session-reconnecting');
  });

  it('recovers through the background refresh without a password, then still requires the account checks', async () => {
    memory.set(STORAGE_KEY, JSON.stringify(stored(nowSeconds() - 60)));
    h.auth = client(); await mount();
    await settle(() => h.latest!.isSessionReconnecting === true);
    h.respond = refreshed;
    vi.setSystemTime(Date.now() + 61_000); // past auth-js's refresh-failure cooldown
    await act(async () => { h.appState!('background'); h.appState!('active'); });
    await settle(() => h.latest!.session !== null);
    expect(h.log).toContain('TOKEN_REFRESHED:session');
    expect(h.latest).toMatchObject({ isSessionReconnecting: false, sessionError: null });
    expect(h.latest!.session!.user.id).toBe(USER);
    expect(access()).toBe('account-pending');
    expect(JSON.parse(memory.get(STORAGE_KEY)!).refresh_token).toBe('rotated-refresh');
  });

  it('recovers through Try again once Auth answers', async () => {
    memory.set(STORAGE_KEY, JSON.stringify(stored(nowSeconds() - 60)));
    h.auth = client(); await mount();
    await settle(() => h.latest!.isSessionReconnecting === true);
    await act(async () => { await h.latest!.retrySessionRestore!(); }); // inside the cooldown: still reconnecting
    expect(access()).toBe('session-reconnecting');
    h.respond = refreshed; vi.setSystemTime(Date.now() + 61_000);
    await act(async () => { await h.latest!.retrySessionRestore!(); });
    await settle(() => h.latest!.session !== null);
    expect(h.latest!.isSessionReconnecting).toBe(false);
    expect(access()).toBe('account-pending');
  });

  it('a refresh token Auth confirms invalid still clears the session and leaves the device signed out', async () => {
    memory.set(STORAGE_KEY, JSON.stringify(stored(nowSeconds() - 60)));
    h.respond = revoked;
    h.auth = client(); await mount();
    await settle(() => h.latest!.isSessionLoading === false && h.log.includes('getSession null'));
    expect(h.log).toContain('SIGNED_OUT:null');
    expect(memory.has(STORAGE_KEY)).toBe(false);
    expect(h.latest).toMatchObject({ session: null, isSessionReconnecting: false });
    expect(access(verifiedWorker)).toBe('signed-out');
  });

  it('a confirmed invalid refresh while reconnecting ends in signed out', async () => {
    memory.set(STORAGE_KEY, JSON.stringify(stored(nowSeconds() - 60)));
    h.auth = client(); await mount();
    await settle(() => h.latest!.isSessionReconnecting === true);
    h.respond = revoked; vi.setSystemTime(Date.now() + 61_000);
    await act(async () => { h.appState!('background'); h.appState!('active'); });
    await settle(() => h.log.includes('SIGNED_OUT:null'));
    await settle(() => h.latest!.isSessionReconnecting === false);
    expect(memory.has(STORAGE_KEY)).toBe(false);
    expect(access(verifiedWorker)).toBe('signed-out');
  });

  it('explicit sign-out still removes the session', async () => {
    memory.set(STORAGE_KEY, JSON.stringify(stored(nowSeconds() + 3600)));
    h.respond = async path => path.startsWith('/auth/v1/logout') ? new Response(null, { status: 204 }) : gateway();
    h.auth = client(); await mount();
    await settle(() => h.latest!.session !== null);
    await act(async () => { await h.auth.signOut(); });
    await settle(() => h.latest!.session === null);
    expect(memory.has(STORAGE_KEY)).toBe(false);
    expect(h.latest!.isSessionReconnecting).toBe(false);
    expect(access(verifiedWorker)).toBe('signed-out');
  });
});

describe('stale restore results (scripted auth events)', () => {
  type Listener = (event: string, session: unknown) => void;
  function scripted() {
    const listeners: Listener[] = []; const restores: ((value: any) => void)[] = [];
    return {
      emit: (event: string, session: unknown) => listeners.forEach(fn => fn(event, session)),
      resolveRestore: (value: any) => restores.shift()!(value),
      pending: () => restores.length,
      listeners,
      auth: {
        onAuthStateChange: (fn: Listener) => { listeners.push(fn); return { data: { subscription: { unsubscribe: () => { listeners.splice(listeners.indexOf(fn), 1); } } } }; },
        getSession: () => new Promise(done => restores.push(done)),
        setSession: async () => ({ data: { session: null }, error: null }),
        startAutoRefresh() {}, stopAutoRefresh() {},
      },
    };
  }
  const retryable = async () => { const { AuthRetryableFetchError } = await import('@supabase/auth-js'); return new AuthRetryableFetchError('Gateway Timeout', 504); };
  const live = { access_token: 'e30.e30.c2ln', refresh_token: 'r', user: { id: USER } };

  it('a sign-in that lands before the late retryable restore result is not undone by it', async () => {
    const fake = scripted(); h.auth = fake.auth; await mount();
    await act(async () => { fake.emit('SIGNED_IN', live); });
    await act(async () => { fake.resolveRestore({ data: { session: null }, error: await retryable() }); });
    expect(h.latest).toMatchObject({ isSessionReconnecting: false, sessionError: null });
    expect(h.latest!.session).toBe(live);
  });

  it('a retry result that arrives after a newer refreshed session is ignored', async () => {
    const fake = scripted(); h.auth = fake.auth; await mount();
    await act(async () => { fake.resolveRestore({ data: { session: null }, error: await retryable() }); });
    expect(h.latest!.isSessionReconnecting).toBe(true);
    let retry!: Promise<void>;
    await act(async () => { retry = h.latest!.retrySessionRestore!(); });
    await act(async () => { await h.latest!.retrySessionRestore!(); }); // a second tap while one is running starts nothing
    expect(fake.pending()).toBe(1);
    await act(async () => { fake.emit('TOKEN_REFRESHED', live); });
    await act(async () => { fake.resolveRestore({ data: { session: null }, error: await retryable() }); await retry; });
    expect(h.latest).toMatchObject({ isSessionReconnecting: false, sessionError: null });
    expect(h.latest!.session).toBe(live);
    expect(fake.listeners).toHaveLength(1);
  });

  it('a plain missing session still lands on Sign in', async () => {
    const fake = scripted(); h.auth = fake.auth; await mount();
    await act(async () => { fake.emit('INITIAL_SESSION', null); fake.resolveRestore({ data: { session: null }, error: null }); });
    expect(h.latest).toMatchObject({ session: null, sessionError: null, isSessionReconnecting: false, isSessionLoading: false });
    expect(access()).toBe('signed-out');
  });
});

describe('a refresh request that never answers (real auth-js)', () => {
  let hung: ((response: Response) => void)[];
  // The request is accepted and then never answered. Each hang stands for a full
  // deadline passing, so auth-js's own retry window is respected on the faked clock.
  const hang = () => { vi.setSystemTime(Date.now() + 20_000); return new Promise<Response>(resolve => hung.push(resolve)); };
  const stale = () => new Response(JSON.stringify({ ...stored(nowSeconds() + 3600), access_token: 'e30.e30.c3RhbGU', refresh_token: 'stale-refresh' }), { status: 200, headers: { 'content-type': 'application/json' } });
  const fetches = () => h.log.filter(step => step.startsWith('fetch ')).length;
  beforeEach(() => { hung = []; });

  it('reproduces the stall without a deadline: Try again joins the stuck refresh and never returns', async () => {
    memory.set(STORAGE_KEY, JSON.stringify(stored(nowSeconds() - 60)));
    h.auth = client(); await mount();
    await settle(() => h.latest!.isSessionReconnecting === true);
    h.respond = hang; vi.setSystemTime(Date.now() + 61_000);
    await act(async () => { h.appState!('background'); h.appState!('active'); }); // the background refresh starts and hangs
    await settle(() => hung.length === 1);
    let returned = false;
    await act(async () => { void h.latest!.retrySessionRestore!().then(() => { returned = true; }); });
    for (let i = 0; i < 20; i++) await act(async () => { await new Promise(done => setTimeout(done, 5)); });
    expect(returned).toBe(false);
    expect(hung).toHaveLength(1); // no new request: everything waits on the stuck one
    await act(async () => { hung[0](new Response('Gateway Timeout', { status: 504 })); });
  });

  it('with the Auth deadline, a stuck restore settles as a temporary failure and keeps the saved session', async () => {
    memory.set(STORAGE_KEY, JSON.stringify(stored(nowSeconds() - 60)));
    h.respond = hang;
    h.auth = client({ deadlineMs: 25 }); await mount();
    await settle(() => h.latest!.isSessionReconnecting === true);
    expect(h.log).toContain('getSession AuthRetryableFetchError');
    expect(access(verifiedWorker)).toBe('session-reconnecting');
    expect(JSON.parse(memory.get(STORAGE_KEY)!).refresh_token).toBe('stored-refresh');
  });

  it('Try again returns from loading while Auth still hangs, then recovers, and late answers cannot overwrite the newer session', async () => {
    memory.set(STORAGE_KEY, JSON.stringify(stored(nowSeconds() - 60)));
    h.respond = hang;
    h.auth = client({ deadlineMs: 25 }); await mount();
    await settle(() => h.latest!.isSessionReconnecting === true);
    vi.setSystemTime(Date.now() + 61_000); // past the refresh-failure cooldown, so Try again really sends
    const before = fetches();
    let returned = false;
    await act(async () => { void h.latest!.retrySessionRestore!().then(() => { returned = true; }); });
    await settle(() => returned);
    expect(fetches()).toBeGreaterThan(before);
    expect(access()).toBe('session-reconnecting');
    expect(JSON.parse(memory.get(STORAGE_KEY)!).refresh_token).toBe('stored-refresh');

    h.respond = refreshed; vi.setSystemTime(Date.now() + 61_000);
    await act(async () => { await h.latest!.retrySessionRestore!(); });
    await settle(() => h.latest!.session !== null);
    expect(h.latest!.isSessionReconnecting).toBe(false);
    expect(access()).toBe('account-pending');
    expect(h.latest!.session!.access_token).toBe('e30.e30.bmV3');

    expect(hung.length).toBeGreaterThan(0);
    await act(async () => { hung.forEach(answer => answer(stale())); });
    for (let i = 0; i < 10; i++) await act(async () => { await new Promise(done => setTimeout(done, 5)); });
    expect(JSON.parse(memory.get(STORAGE_KEY)!).refresh_token).toBe('rotated-refresh');
    expect(h.latest!.session!.access_token).toBe('e30.e30.bmV3');
  });

  it('with the Auth deadline, a refresh token Auth rejects still ends the session', async () => {
    memory.set(STORAGE_KEY, JSON.stringify(stored(nowSeconds() - 60)));
    h.respond = revoked;
    h.auth = client({ deadlineMs: 25 }); await mount();
    await settle(() => h.latest!.isSessionLoading === false && h.log.includes('getSession null'));
    expect(memory.has(STORAGE_KEY)).toBe(false);
    expect(access(verifiedWorker)).toBe('signed-out');
  });
});

import { act, createElement, useEffect, useLayoutEffect, StrictMode, Suspense, startTransition } from 'react';
import { fromByteArray } from 'base64-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RootLayout, { deriveAccessState } from '@/app/_layout';
import ClientLayout from '@/app/(client)/_layout';
import { useAccount } from '@/providers/account-provider';
import { useSession } from '@/providers/session-provider';
import { useClientJobs } from '@/providers/client-jobs-provider';
import { submitClientPostJob } from '@/lib/client-post-job-submission';
import { SANTA_ANA_PATEROS_INTERIOR_TEST_PIN } from '@/lib/santa-ana-service-area';
import { useClientPostJobDraft, type ClientPostJobDraftContextValue } from '@/providers/client-post-job-draft-provider';

const boundary = vi.hoisted(() => ({
  authListener: null as null | ((event: string, session: unknown) => void),
  session: null as any, account: null as any, consent: null as any,
  accountResponses: [] as Promise<any>[], consentResponses: [] as Promise<any>[],
  createResponses: [] as Promise<any>[], workerVerified: true as boolean | null,
  calls: [] as string[], sequence: [] as any[], mounts: 0, unmounts: 0,
  latest: null as ClientPostJobDraftContextValue | null,
  latestAccount: null as ReturnType<typeof useAccount> | null,
  latestSession: null as ReturnType<typeof useSession> | null,
  latestJobs: null as ReturnType<typeof useClientJobs> | null,
  linkListener: null as null | ((event: { url: string }) => void),
  blockRender: false, workerResponses: [] as Promise<any>[],
}));

// Inert adapters only. All authorization, bootstrap, route gating, Client layout,
// draft owner/provider and jobs provider execute their actual production code.
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: boundary.session }, error: null }),
    onAuthStateChange: (callback: typeof boundary.authListener) => {
      boundary.authListener = callback;
      return { data: { subscription: { unsubscribe: () => { boundary.authListener = null; } } } };
    },
    setSession: () => { throw Error('Unexpected setSession'); },
    startAutoRefresh: () => { throw Error('Unexpected native refresh'); },
    stopAutoRefresh: () => { throw Error('Unexpected native refresh'); },
  },
  rpc: (name: string) => {
    boundary.calls.push(name);
    if (name === 'create_my_job_with_location') return boundary.createResponses.shift();
    if (name === 'get_my_identity_submission') return Promise.resolve({ data: null, error: null });
    if (name !== 'get_my_consent') throw Error('Unexpected RPC '+name);
    return boundary.consentResponses.shift() ?? Promise.resolve({ data: boundary.consent, error: null });
  },
  from: (table: string) => ({ select: () => ({
    eq: () => ({
      maybeSingle: () => {
        boundary.calls.push('select:'+table);
        if (table === 'worker_profiles') return boundary.workerResponses.shift() ?? Promise.resolve({ data: { is_verified: boundary.workerVerified }, error: null });
        if (table !== 'users') throw Error('Unexpected maybeSingle '+table);
        return boundary.accountResponses.shift() ?? Promise.resolve({ data: boundary.account, error: null });
      },
      order: () => { boundary.calls.push('select:'+table); return Promise.resolve({ data: [], error: null }); },
    }),
    order: () => { boundary.calls.push('select:'+table); return Promise.resolve({ data: [], error: null }); },
  }) }),
  storage: { from: () => { throw Error('Unexpected Storage'); } },
} }));
vi.mock('@supabase/supabase-js', () => ({ AuthError: class AuthError extends Error {} }));
vi.mock('expo-linking', () => ({ getInitialURL: async () => null, addEventListener: (_: string, listener: typeof boundary.linkListener) => { boundary.linkListener = listener; return { remove() {} }; } }));
vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (values: any) => values.web ?? values.default }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  StyleSheet: { create: (styles: unknown) => styles },
  View: () => null, Text: () => null, ActivityIndicator: () => null,
}));
vi.mock('tamagui', () => ({ TamaguiProvider: ({ children }: any) => createElement(GateObserver, null, children) }));
vi.mock('../../tamagui.config', () => ({ tamaguiConfig: {} }));
vi.mock('@/components/push-notification-inbox-intent', () => ({ PushNotificationInboxIntent: () => null }));
vi.mock('@/components/incoming-message-banner-host', () => ({ IncomingMessageBannerHost: () => null }));
vi.mock('@/components/state-screen', () => ({ StateScreen: () => null }));
vi.mock('@/components/push-notification-registration', () => ({ PushNotificationRegistration: () => null }));
vi.mock('expo-router', () => {
  const Stack = ({ children }: any) => children;
  Stack.Protected = function ProtectedBoundary({ guard, children }: any) { return guard ? children : null; };
  Stack.Screen = function ScreenBoundary({ name }: any) { return name === '(client)' ? createElement(ClientLayout) : name === '(tabs)' ? createElement(DraftObserver) : null; };
  return { Stack };
});

function GateObserver({ children }: any) {
  const account = useAccount(), session = useSession();
  useLayoutEffect(() => {
    boundary.latestAccount = account; boundary.latestSession = session;
    boundary.sequence.push({ accountStatus: account.status, access: deriveAccessState(session, account, false),
      accountPresent: account.account !== null, consent: account.hasCurrentConsent,
      authenticated: session.session !== null });
  });
  if (boundary.blockRender) suspendRender();
  return children;
}
const neverSettles = new Promise<void>(() => {});
const suspendRender = vi.fn(() => { throw neverSettles; });
function DraftObserver() {
  const draft = useClientPostJobDraft(), jobs = useClientJobs();
  useLayoutEffect(() => { boundary.latest = draft; boundary.latestJobs = jobs; });
  useEffect(() => { boundary.mounts++; return () => { boundary.unmounts++; }; }, []);
  return null;
}
type RenderRoot = { render(node: unknown): void; unmount(): void };
const roots: RenderRoot[] = [];
async function makeRoot(strict = false) {
  // Reuses the installed ReactDOM no-host-children mounting seam retained in
  // worker-onboarding.test.ts. Native Stack is an inert conditional boundary.
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any,
    addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const rendererModule: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ rendererModule);
  const root = renderer.createRoot(container) as RenderRoot; roots.push(root);
  const app = createElement(Suspense, { fallback: null }, createElement(RootLayout));
  await act(async () => root.render(strict ? createElement(StrictMode, null, app) : app));
  await until(() => boundary.mounts - boundary.unmounts === 1);
}
async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (condition()) return;
    await act(async () => { await Promise.resolve(); });
  }
  throw Error('Actual provider state did not reach expected boundary');
}
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; }
function syntheticToken(revision = 1, marker = '22222222-2222-4222-8222-222222222222', user = '11111111-1111-4111-8111-111111111111') {
  const json = JSON.stringify({ iss: 'https://synthetic.supabase.co/auth/v1', sub: user, session_id: marker, iat: revision });
  const encoded = fromByteArray(new Uint8Array(Array.from(json, char => char.charCodeAt(0)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'e30.' + encoded + '.c2ln';
}
const fields = { description: 'Repair sink with retained description', address: 'Synthetic confirmed address',
  pin: { latitude: 14.55, longitude: 121.07 }, wizardStep: 4 as const, budgetText: '500', primarySkillId: 'synthetic-skill',
  jobPhotos: [{ uri: 'file:///synthetic-photo.jpg', assetId: 'synthetic', fileName: 'photo.jpg', fileSize: 4, pickerMimeType: 'image/jpeg' },
    { uri: 'file:///synthetic-second.jpg', assetId: 'second', fileName: 'second.jpg', fileSize: 4, pickerMimeType: 'image/jpeg' }] };
async function refresh(mode: 'posting' | 'pending') {
  await makeRoot();
  const before = boundary.latest!;
  let operation!: ReturnType<typeof before.beginPost>;
  await act(async () => {
    before.updateDraft(fields);
    operation = before.beginPost();
    expect(operation).not.toBeNull();
    expect(operation!.draft).toMatchObject(fields);
    if (mode === 'pending') {
      expect(before.recordCreatedJob(operation!, 'synthetic-created-job')).toBe(true);
      expect(before.settlePost(operation!, { success: 'Synthetic local settlement', error: null })).toBe(true);
      expect(before.finishPost(operation!)).toBe(true);
    }
  });
  const accountRead = deferred(), consentRead = deferred();
  boundary.accountResponses.push(accountRead.promise); boundary.consentResponses.push(consentRead.promise);
  const newSession = { ...boundary.session, access_token: syntheticToken(2), refresh_token: 'synthetic-refresh-rotation',
    user: { ...boundary.session.user } };
  await act(async () => { boundary.authListener!('TOKEN_REFRESHED', newSession); });
  expect(boundary.sequence.at(-1)).toMatchObject({ accountStatus: 'pending', access: 'account-pending', consent: false });
  expect(boundary.mounts - boundary.unmounts).toBe(0);
  expect(before.isOwnerCurrent()).toBe(false);
  expect(before.isOperationCurrent(operation!)).toBe(false);
  const pendingDuring = before.takePendingCreatedJob();
  await act(async () => { accountRead.resolve({ data: boundary.account, error: null }); });
  await until(() => boundary.calls.filter(c => c === 'get_my_consent').length === 2);
  expect(boundary.sequence.at(-1)).toMatchObject({ accountStatus: 'pending', access: 'account-pending' });
  await act(async () => { consentRead.resolve({ data: boundary.consent, error: null }); });
  await until(() => boundary.mounts === 2);
  const after = boundary.latest!;
  const outcome = { mode, sequence: boundary.sequence, mounts: boundary.mounts, unmounts: boundary.unmounts,
    sameLifetime: before.beginPost === after.beginPost, oldOperationCurrent: before.isOperationCurrent(operation!),
    capturedDraftBefore: operation!.draft, draftAfter: after.draft,
    pendingDuring, pendingAfter: after.takePendingCreatedJob(), calls: boundary.calls };

  return { before, after, outcome };
}

describe('actual-provider refresh continuity regression', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://synthetic.supabase.co');
    boundary.session = { access_token: syntheticToken(), refresh_token: 'synthetic-original-refresh',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'client@example.test', user_metadata: {} } };
    boundary.account = { id: '11111111-1111-4111-8111-111111111111', email: 'client@example.test', full_name: 'Synthetic Client', phone: '09170000000',
      role: 'client', barangay: 'Santa Ana', city: 'Pateros', is_active: true };
    boundary.consent = { user_id: '11111111-1111-4111-8111-111111111111', terms_version: '2026-09-v1', terms_accepted_at: '2026-09-25T00:00:00Z',
      privacy_version: '2026-09-v1', privacy_acknowledged_at: '2026-09-25T00:00:00Z' };
    boundary.accountResponses = []; boundary.consentResponses = []; boundary.calls = []; boundary.sequence = [];
    boundary.createResponses = []; boundary.workerVerified = true;
    boundary.blockRender = false; suspendRender.mockClear(); boundary.workerResponses = [];
    boundary.mounts = 0; boundary.unmounts = 0; boundary.latest = null;
    boundary.latestAccount = null; boundary.latestSession = null; boundary.latestJobs = null; boundary.linkListener = null;
  });
  afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('retains private fields through real pending/root removal after same-session refresh', async () => {
    const { after, outcome } = await refresh('posting');
    expect(outcome.sameLifetime).toBe(true); expect(outcome.oldOperationCurrent).toBe(false);
    expect(after.draft).toMatchObject(fields);
    expect(outcome.pendingAfter).toBeNull();
  });
  it('preserves settled one-shot handoff privately during suspension', async () => {
    const { outcome } = await refresh('pending');
    expect(outcome.sameLifetime).toBe(true); expect(outcome.pendingDuring).toBeNull(); expect(outcome.pendingAfter).toBe('synthetic-created-job');
  });
  it('retains populated photos/order and step four after both authoritative reads', async () => {
    const { after } = await refresh('posting');
    expect(after.draft).toMatchObject(fields);
  });
  it('StrictMode effect replay leaves a usable fresh owner and does not revive a canceled operation', async () => {
    await makeRoot(true); const before = boundary.latest!;
    await act(async () => { expect(before.updateDraft(fields)).toBe(true); });
    expect(boundary.latest!.draft).toMatchObject(fields);
    await act(async () => boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(2) }));
    expect(boundary.latest!.draft).toMatchObject(fields); expect(boundary.latest!.beginPost).toBe(before.beginPost);
  });
  it('suspends stale operations and protected reads synchronously inside the Auth callback batch before effects', async () => {
    await makeRoot(); const before = boundary.latest!, oldAccount = boundary.latestAccount!, jobs = boundary.latestJobs!;
    await act(async () => before.updateDraft(fields));
    const accountRead = deferred(), consentRead = deferred(); boundary.accountResponses.push(accountRead.promise); boundary.consentResponses.push(consentRead.promise);
    const originalCallCount = boundary.calls.length;
    await act(async () => {
      boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(2) });
      expect(before.isOwnerCurrent()).toBe(false); expect(before.updateDraft({ description: 'Stale' })).toBe(false);
      expect(before.beginPost()).toBeNull(); expect(before.takePendingCreatedJob()).toBeNull();
      const oldConsent = oldAccount.refreshConsent(), oldJobs = jobs.refresh(before.ownerId);
      expect(boundary.calls).toHaveLength(originalCallCount);
      await oldConsent; await expect(oldJobs).rejects.toThrow('owner changed');
    });
    expect(boundary.sequence.at(-1)).toMatchObject({ access: 'account-pending', accountPresent: false, consent: false });
    expect(boundary.sequence.slice(-2).every(item => item.access === 'account-pending')).toBe(true);
    expect(boundary.mounts - boundary.unmounts).toBe(0);
    const count = boundary.calls.length; await before.updateDraft({ description: 'Pending' }); expect(boundary.calls).toHaveLength(count);
    await act(async () => accountRead.resolve({ data: boundary.account, error: null }));
    expect(boundary.sequence.at(-1).access).toBe('account-pending');
    await act(async () => consentRead.resolve({ data: boundary.consent, error: null }));
    expect(boundary.latest!.draft).toMatchObject(fields); expect(boundary.latest!.beginPost).toBe(before.beginPost);
  });
  it.each(['different-marker', 'batched-null', 'signed-out-event', 'missing', 'malformed', 'mismatched-subject', 'different-user', 'PASSWORD_RECOVERY'] as const)('clears old private state for %s even with batched reentry', async mode => {
    await makeRoot(); const before = boundary.latest!; await act(async () => before.updateDraft(fields));
    let next = { ...boundary.session, access_token: syntheticToken(2) };
    if (mode === 'different-marker') next.access_token = syntheticToken(2, '33333333-3333-4333-8333-333333333333');
    if (mode === 'missing') next.access_token = 'e30.e30.c2ln';
    if (mode === 'malformed') next.access_token = 'not-jwt';
    if (mode === 'mismatched-subject') next.access_token = syntheticToken(2, undefined, '33333333-3333-4333-8333-333333333333');
    if (mode === 'different-user') {
      next = { ...next, user: { ...next.user, id: '33333333-3333-4333-8333-333333333333' }, access_token: syntheticToken(2, undefined, '33333333-3333-4333-8333-333333333333') };
      boundary.account = { ...boundary.account, id: next.user.id }; boundary.consent = { ...boundary.consent, user_id: next.user.id };
    }
    await act(async () => {
      if (mode === 'batched-null') boundary.authListener!('SIGNED_OUT', null);
      boundary.authListener!(mode === 'signed-out-event' ? 'SIGNED_OUT' : mode === 'PASSWORD_RECOVERY' ? mode : 'SIGNED_IN', next);
      expect(before.isOwnerCurrent()).toBe(false);
    });
    expect(boundary.latest!.draft).toMatchObject({ description: '', jobPhotos: [], wizardStep: 1 });
    expect(boundary.latest!.beginPost).not.toBe(before.beginPost);
    expect(boundary.latestSession!.canUpdateRecoveryPassword).toBe(false);
  });
  it.each(['inactive', 'role', 'consent', 'consent-error', 'invalid-account'] as const)('disposes retained draft after authoritative %s failure', async failure => {
    await makeRoot(); const before = boundary.latest!; await act(async () => before.updateDraft(fields));
    if (failure === 'inactive') boundary.account = { ...boundary.account, is_active: false };
    if (failure === 'role') { boundary.account = { ...boundary.account, role: 'administrator' }; }
    if (failure === 'consent') boundary.consent = null;
    if (failure === 'consent-error') boundary.consentResponses.push(Promise.resolve({ data: null, error: { message: 'Synthetic consent unavailable' } }));
    if (failure === 'invalid-account') boundary.account = { ...boundary.account, role: 'invalid' };
    await act(async () => boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(2) }));
    expect(boundary.mounts - boundary.unmounts).toBe(0); expect(before.isOwnerCurrent()).toBe(false);
    boundary.account = { ...boundary.account, role: 'client', is_active: true };
    boundary.consent = { user_id: boundary.account.id, terms_version: '2026-09-v1', terms_accepted_at: '2026-09-25T00:00:00Z', privacy_version: '2026-09-v1', privacy_acknowledged_at: '2026-09-25T00:00:00Z' };
    await act(async () => boundary.latestAccount!.retryAccountBootstrap());
    expect(boundary.latest!.draft.description).toBe(''); expect(boundary.latest!.beginPost).not.toBe(before.beginPost);
  });
  it('keeps private draft inaccessible through retryable account error and restores only uninterrupted valid lifetime', async () => {
    await makeRoot(); const before = boundary.latest!; await act(async () => before.updateDraft(fields));
    boundary.accountResponses.push(Promise.resolve({ data: null, error: { message: 'Synthetic offline' } }));
    await act(async () => boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(2) }));
    expect(boundary.sequence.at(-1).access).toBe('account-failure'); expect(before.isOwnerCurrent()).toBe(false);
    expect(before.beginPost()).toBeNull(); expect(before.updateDraft({ description: 'Hidden' })).toBe(false);
    await act(async () => boundary.latestAccount!.retryAccountBootstrap());
    expect(boundary.latest!.beginPost).toBe(before.beginPost); expect(boundary.latest!.draft).toMatchObject(fields);
  });
  it('recovery link processing terminates private lifetime before restoration and cannot restore it after error', async () => {
    await makeRoot(); const before = boundary.latest!; await act(async () => before.updateDraft(fields));
    await act(async () => { boundary.linkListener!({ url: 'skillmatchmobile://update-password?error=access_denied' }); expect(before.isOwnerCurrent()).toBe(false); });
    expect(boundary.sequence.at(-1).access).toBe('password-recovery');
    expect(boundary.latestSession!.canUpdateRecoveryPassword).toBe(false);
    await act(async () => { boundary.latestSession!.clearRecoveryAuthorization(); boundary.authListener!('SIGNED_IN', { ...boundary.session, access_token: syntheticToken(3) }); });
    expect(boundary.latest!.draft.description).toBe(''); expect(boundary.latest!.beginPost).not.toBe(before.beginPost);
  });
  it('ignores stale account and consent completions from superseded revisions', async () => {
    await makeRoot(); const before = boundary.latest!; await act(async () => before.updateDraft(fields));
    const oldRead = deferred(), freshRead = deferred(), oldConsent = deferred();
    boundary.accountResponses.push(oldRead.promise); boundary.consentResponses.push(oldConsent.promise);
    await act(async () => boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(2) }));
    await act(async () => oldRead.resolve({ data: boundary.account, error: null }));
    boundary.accountResponses.push(freshRead.promise);
    await act(async () => boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(3) }));
    await act(async () => oldConsent.resolve({ data: boundary.consent, error: null }));
    expect(boundary.sequence.at(-1)).toMatchObject({ access: 'account-pending', consent: false, accountPresent: false });
    await act(async () => freshRead.resolve({ data: boundary.account, error: null }));
    expect(boundary.latest!.draft).toMatchObject(fields);
  });
  it.each([false, true])('actual posting completion during pending records only a permitted same-lifetime receipt; terminated=%s', async terminated => {
    await makeRoot(); const before = boundary.latest!, create = deferred(), account = deferred(), consent = deferred();
    await act(async () => before.updateDraft({ ...fields, pin: SANTA_ANA_PATEROS_INTERIOR_TEST_PIN, scheduleDate: new Date(2099, 0, 2), scheduleTime: new Date(2099, 0, 2, 12), paymentMethod: 'cod' }));
    boundary.createResponses.push(create.promise); const refresh = vi.fn(); const skills = [{ id: 'synthetic-skill', skill_name: 'Plumbing' }];
    let posting!: Promise<void>;
    await act(async () => { posting = submitClientPostJob({ owner: before, skills, refresh }); });
    expect(boundary.calls.filter(name => name === 'create_my_job_with_location')).toHaveLength(1);
    boundary.accountResponses.push(account.promise); boundary.consentResponses.push(consent.promise);
    await act(async () => {
      if (terminated) boundary.authListener!('SIGNED_OUT', null);
      boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(2) });
    });
    expect(before.beginPost()).toBeNull(); expect(before.takePendingCreatedJob()).toBeNull();
    await act(async () => { create.resolve({ data: '44444444-4444-4444-8444-444444444444', error: null }); await posting; });
    expect(refresh).not.toHaveBeenCalled(); expect(before.takePendingCreatedJob()).toBeNull();
    await act(async () => account.resolve({ data: boundary.account, error: null }));
    await act(async () => consent.resolve({ data: boundary.consent, error: null }));
    const after = boundary.latest!;
    await act(async () => { await submitClientPostJob({ owner: after, skills, refresh }); });
    expect(boundary.calls.filter(name => name === 'create_my_job_with_location')).toHaveLength(1); expect(refresh).not.toHaveBeenCalled();
    expect(after.takePendingCreatedJob()).toBe(terminated ? null : '44444444-4444-4444-8444-444444444444');
    expect(after.takePendingCreatedJob()).toBeNull();
    if (!terminated) expect(after.draft.postSuccess).toContain('completion is unknown');
  });
  it.each([
    ['administrator', true, true, 'administrator'], ['worker', true, true, 'worker'],
    ['worker', true, false, 'worker-identity'], ['worker', false, true, 'blocked'],
    ['client', false, true, 'blocked'],
  ] as const)('actual authoritative %s active=%s verified=%s retains its existing root guard', async (role, active, verified, access) => {
    await makeRoot(); const before = boundary.latest!; await act(async () => before.updateDraft(fields));
    boundary.account = { ...boundary.account, role, is_active: active }; boundary.workerVerified = verified;
    await act(async () => boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(2) }));
    expect(boundary.sequence.at(-1).access).toBe(access); expect(before.isOwnerCurrent()).toBe(false); expect(boundary.mounts - boundary.unmounts).toBe(0);
  });
  it.each(['worker', 'inactive'] as const)('does not restore a draft after known authoritative %s row is superseded during consent', async mode => {
    await makeRoot(); const before = boundary.latest!; await act(async () => before.updateDraft(fields));
    const consent = deferred(); boundary.consentResponses.push(consent.promise);
    boundary.account = { ...boundary.account, role: mode === 'worker' ? 'worker' : 'client', is_active: mode !== 'inactive' };
    await act(async () => boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(2) }));
    expect(boundary.sequence.at(-1).access).toBe('account-pending');
    boundary.account = { ...boundary.account, role: 'client', is_active: true };
    await act(async () => boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(3) }));
    await act(async () => consent.resolve({ data: boundary.consent, error: null }));
    expect(boundary.latest!.draft.description).toBe(''); expect(boundary.latest!.beginPost).not.toBe(before.beginPost);
  });
  it('disposes after authoritative Worker read even when its later profile read rejects, then Client retry is empty', async () => {
    await makeRoot(); const before = boundary.latest!; await act(async () => before.updateDraft(fields));
    const worker = deferred(); boundary.workerResponses.push(worker.promise); boundary.account = { ...boundary.account, role: 'worker' };
    await act(async () => boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(2) }));
    await act(async () => worker.resolve({ data: null, error: { message: 'Synthetic Worker stage failure' } }));
    expect(boundary.sequence.at(-1).access).toBe('worker-identity');
    boundary.account = { ...boundary.account, role: 'client' };
    await act(async () => boundary.latestAccount!.retryAccountBootstrap());
    expect(boundary.latest!.draft.description).toBe(''); expect(boundary.latest!.beginPost).not.toBe(before.beginPost);
  });
  it('an abandoned retry render cannot cancel or publish authority for the committed draft', async () => {
    await makeRoot(); const before = boundary.latest!, account = boundary.latestAccount!;
    let operation!: ReturnType<typeof before.beginPost>;
    await act(async () => {
      before.updateDraft(fields); const receiptOperation = before.beginPost()!;
      before.recordCreatedJob(receiptOperation, 'committed-receipt');
      before.settlePost(receiptOperation, { success: 'Already created', error: null }); before.finishPost(receiptOperation);
      before.updateDraft(fields); operation = before.beginPost();
    });
    const read = deferred(); boundary.accountResponses.push(read.promise); boundary.blockRender = true;
    await act(async () => startTransition(() => account.retryAccountBootstrap()));
    expect(suspendRender).toHaveBeenCalled();
    expect(before.isOwnerCurrent()).toBe(true); expect(before.isOperationCurrent(operation!)).toBe(true);
    await act(async () => { expect(before.finishPost(operation!)).toBe(true); });
    boundary.blockRender = false;
    await act(async () => roots.at(-1)!.render(createElement(Suspense, { fallback: null }, createElement(RootLayout))));
    await act(async () => read.resolve({ data: boundary.account, error: null }));
    expect(boundary.latest!.draft).toMatchObject(fields);
    expect(boundary.latest!.takePendingCreatedJob()).toBe('committed-receipt'); expect(boundary.latest!.takePendingCreatedJob()).toBeNull();
  });
  it('Suspense hiding does not dispose committed private fields or receipts and hidden Auth changes still cancel', async () => {
    await makeRoot(); const before = boundary.latest!;
    let operation!: ReturnType<typeof before.beginPost>;
    await act(async () => {
      before.updateDraft(fields); const receiptOperation = before.beginPost()!;
      before.recordCreatedJob(receiptOperation, 'committed-receipt'); before.settlePost(receiptOperation, { success: 'Created', error: null }); before.finishPost(receiptOperation);
      before.updateDraft(fields); operation = before.beginPost();
    });
    boundary.blockRender = true;
    await act(async () => roots.at(-1)!.render(createElement(Suspense, { fallback: null }, createElement(RootLayout))));
    expect(suspendRender).toHaveBeenCalled(); expect(before.isOperationCurrent(operation!)).toBe(true);
    await act(async () => {
      boundary.authListener!('TOKEN_REFRESHED', { ...boundary.session, access_token: syntheticToken(2) });
      expect(before.isOperationCurrent(operation!)).toBe(false);
    });
    boundary.blockRender = false;
    await act(async () => roots.at(-1)!.render(createElement(Suspense, { fallback: null }, createElement(RootLayout))));
    expect(boundary.latest!.draft).toMatchObject(fields);
    expect(boundary.latest!.takePendingCreatedJob()).toBe('committed-receipt'); expect(boundary.latest!.takePendingCreatedJob()).toBeNull();
  });
});

import { act, createElement, useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProvider, useAccount, type AccountContextValue } from './account-provider';
const inert = vi.hoisted(() => ({ revision: 0, session: null as any, reads: [] as Promise<any>[], consents: [] as Promise<any>[], calls: [] as string[], latest: null as AccountContextValue | null }));
vi.mock('@/providers/session-provider', () => ({ useSession: () => ({ session: inert.session, isSessionLoading: false, sessionError: null, sessionRevision: inert.revision, isSessionRevisionCurrent: (revision: number) => revision === inert.revision }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: () => { inert.calls.push(table); return inert.reads.shift(); } }) }), insert: () => { throw Error('Unrequested insert'); } }) } }));
vi.mock('@/lib/user-consent', () => ({ getMyConsent: () => { inert.calls.push('consent'); return inert.consents.shift(); }, isCurrentLegalConsent: (row: any) => row?.current === true }));
vi.mock('@/lib/worker-identity', () => ({ getMyIdentitySubmission: () => { throw Error('Unrequested identity'); } }));
function Observer() { const account = useAccount(); useLayoutEffect(() => { inert.latest = account; }); return null; }
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; }
const row = { id: 'client-id', email: 'client@example.test', full_name: 'Synthetic', phone: '09170000000', role: 'client', barangay: 'Santa Ana', city: 'Pateros', is_active: true };
let root: any;
async function render() {
  if (!root) {
    const doc = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
    const win = { document: doc, event: undefined, HTMLIFrameElement: class {} }; doc.defaultView = win;
    vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const module: string = 'react-dom/client'; const renderer = await import(/* @vite-ignore */ module);
    root = renderer.createRoot({ nodeType: 1, tagName: 'DIV', ownerDocument: doc, firstChild: null, lastChild: null, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} });
  }
  await act(async () => root.render(createElement(AccountProvider, null, createElement(Observer))));
}
async function authorized() { inert.reads.push(Promise.resolve({ data: row, error: null })); inert.consents.push(Promise.resolve({ current: true })); await render(); expect(inert.latest!.status).toBe('resolved'); }
beforeEach(() => { inert.revision = 0; inert.session = { user: { id: row.id, user_metadata: {} } }; inert.reads = []; inert.consents = []; inert.calls = []; inert.latest = null; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; vi.unstubAllGlobals(); });
describe('actual AccountProvider session-revision authority (offline)', () => {
  it('blocks stale refresh callbacks immediately before the replacement render/effect', async () => {
    await authorized(); const prior = inert.latest!, before = inert.calls.length;
    inert.revision++; inert.session = { ...inert.session };
    await prior.refreshConsent(); await prior.refreshIdentity(); expect(inert.calls).toHaveLength(before);
    const account = deferred(), consent = deferred(); inert.reads.push(account.promise); inert.consents.push(consent.promise);
    await render(); expect(inert.latest).toMatchObject({ status: 'pending', account: null, hasCurrentConsent: false });
    await act(async () => account.resolve({ data: row, error: null })); expect(inert.latest!.status).toBe('pending');
    await act(async () => consent.resolve({ current: true })); expect(inert.latest!.status).toBe('resolved');
  });
  it('does not let a late previous account read start consent or authorize a newer session', async () => {
    const old = deferred(), current = deferred(); inert.reads.push(old.promise); await render();
    inert.revision++; inert.session = { ...inert.session }; inert.reads.push(current.promise); inert.consents.push(Promise.resolve({ current: true })); await render();
    await act(async () => old.resolve({ data: row, error: null })); expect(inert.calls).toEqual(['users', 'users']); expect(inert.latest!.status).toBe('pending');
    await act(async () => current.resolve({ data: row, error: null })); expect(inert.latest!.status).toBe('resolved');
  });
  it('does not publish a late consent result into a newer revision', async () => {
    const oldConsent = deferred(), current = deferred(); inert.reads.push(Promise.resolve({ data: row, error: null })); inert.consents.push(oldConsent.promise); await render();
    inert.revision++; inert.session = { ...inert.session }; inert.reads.push(current.promise); await render();
    await act(async () => oldConsent.resolve({ current: true })); expect(inert.latest).toMatchObject({ status: 'pending', account: null, hasCurrentConsent: false });
  });
  it('preserves account error/retry behavior while exposing no stale account', async () => {
    await authorized(); inert.revision++; inert.session = { ...inert.session }; inert.reads.push(Promise.resolve({ data: null, error: { message: 'offline' } })); await render();
    expect(inert.latest).toMatchObject({ status: 'error', account: null, hasCurrentConsent: false, accountError: { code: 'account_fetch_failed' } });
    inert.reads.push(Promise.resolve({ data: row, error: null })); inert.consents.push(Promise.resolve({ current: true }));
    await act(async () => inert.latest!.retryAccountBootstrap()); expect(inert.latest!.status).toBe('resolved');
  });
});

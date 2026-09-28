import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountProvider, type AccountContextValue, useAccount } from '../providers/account-provider';
import { SessionProvider } from '../providers/session-provider';
import type { WorkerIdentitySubmission } from './worker-identity';
import {
  canEnterWorkerApp,
  deriveWorkerOnboardingState,
  loadWorkerOnboarding,
} from './worker-onboarding';

type BoundaryResult = { data: unknown; error: null };
type TestSession = { user: { id: string; email: string; user_metadata: Record<string, unknown> } };
type RenderRoot = { render: (node: ReturnType<typeof createElement>) => void; unmount: () => void };

// The only app module replaced here is the Supabase client adapter: it is the
// network/persistence boundary. Session, consent, identity, onboarding, and
// AccountProvider run as their real implementations.
const boundary = vi.hoisted(() => {
  const state = {
    session: null as TestSession | null,
    accountRow: null as Record<string, unknown> | null,
    consentRow: null as Record<string, unknown> | null,
    identityRow: null as Record<string, unknown> | null,
    profileResponses: [] as Promise<BoundaryResult>[],
    identityResponses: [] as Promise<BoundaryResult>[],
    identityCalls: 0,
    authListener: null as null | ((event: string, session: TestSession | null) => void),
  };
  return Object.assign(state, { supabase: {
    auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
      onAuthStateChange: (listener: (event: string, session: TestSession | null) => void) => {
        state.authListener = listener;
        return { data: { subscription: { unsubscribe: () => { state.authListener = null; } } } };
      },
    },
    rpc: (name: string) => {
      if (name === 'get_my_consent') {
        return Promise.resolve({ data: state.consentRow, error: null });
      }
      if (name === 'get_my_identity_submission') {
        state.identityCalls += 1;
        return state.identityResponses.shift() ?? Promise.resolve({ data: state.identityRow, error: null });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            if (table === 'users') return Promise.resolve({ data: state.accountRow, error: null });
            if (table === 'worker_profiles') {
              return state.profileResponses.shift() ??
                Promise.resolve({ data: { is_verified: false }, error: null });
            }
            throw new Error(`Unexpected table: ${table}`);
          },
        }),
      }),
    }),
  } });
});

vi.mock('@/lib/supabase', () => ({ supabase: boundary.supabase }));
vi.mock('./supabase', () => ({ supabase: boundary.supabase }));

// Vitest does not apply the Expo TypeScript path alias. These mappings return
// the real modules; they replace no app behavior and hold no test state.
vi.mock('@/lib/user-consent', async () => await import('./user-consent'));
vi.mock('@/lib/worker-identity', async () => await import('./worker-identity'));
vi.mock('@/lib/worker-onboarding', async () => await import('./worker-onboarding'));
vi.mock('@/providers/session-provider', async () => await import('../providers/session-provider'));
vi.mock('@/lib/auth-recovery', async () => await import('./auth-recovery'));

vi.mock('expo-linking', () => ({
  addEventListener: () => ({ remove: () => {} }),
  getInitialURL: async () => null,
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
}));

const pending: WorkerIdentitySubmission = {
  id: 'document-id',
  idType: 'national_id',
  status: 'pending',
  rejectionReason: null,
  submittedAt: '2026-09-25T00:00:00Z',
  reviewedAt: null,
};
const rejected: WorkerIdentitySubmission = {
  ...pending,
  status: 'rejected',
  rejectionReason: 'Please use a clearer photo.',
};

describe('persisted Worker onboarding', () => {
  it('admits a grandfathered verified Worker without reading a modern ID', async () => {
    const readSubmission = vi.fn(async () => null);
    const state = await loadWorkerOnboarding(async () => true, readSubmission);
    expect(state.workerOnboardingState).toBe('verified');
    expect(canEnterWorkerApp(state.workerOnboardingState)).toBe(true);
    expect(readSubmission).not.toHaveBeenCalled();
  });

  it('sends a fresh unverified Worker to required submission', async () => {
    const state = await loadWorkerOnboarding(async () => false, async () => null);
    expect(state.workerOnboardingState).toBe('needs-submission');
    expect(canEnterWorkerApp(state.workerOnboardingState)).toBe(false);
  });

  it('restores pending review from server state without any write', async () => {
    const readSubmission = vi.fn(async () => pending);
    const state = await loadWorkerOnboarding(async () => false, readSubmission);
    expect(state.workerOnboardingState).toBe('pending-review');
    expect(state.identitySubmission).toEqual(pending);
    expect(readSubmission).toHaveBeenCalledTimes(1);
    expect(canEnterWorkerApp(state.workerOnboardingState)).toBe(false);
  });

  it('restores rejection and the server-provided reason', async () => {
    const state = await loadWorkerOnboarding(async () => false, async () => rejected);
    expect(state.workerOnboardingState).toBe('rejected');
    expect(state.identitySubmission?.rejectionReason).toBe(rejected.rejectionReason);
    expect(canEnterWorkerApp(state.workerOnboardingState)).toBe(false);
  });

  it('releases pending review only after a new verified profile read', async () => {
    const before = await loadWorkerOnboarding(async () => false, async () => pending);
    const after = await loadWorkerOnboarding(async () => true, async () => pending);
    expect(before.workerOnboardingState).toBe('pending-review');
    expect(after.workerOnboardingState).toBe('verified');
  });

  it('shows rejection after a pending-to-rejected refresh', async () => {
    const before = await loadWorkerOnboarding(async () => false, async () => pending);
    const after = await loadWorkerOnboarding(async () => false, async () => rejected);
    expect(before.workerOnboardingState).toBe('pending-review');
    expect(after.workerOnboardingState).toBe('rejected');
  });

  it('fails closed on identity lookup failure', async () => {
    const state = await loadWorkerOnboarding(async () => false, async () => { throw new Error('offline'); });
    expect(state.workerOnboardingState).toBe('load-error');
    expect(canEnterWorkerApp(state.workerOnboardingState)).toBe(false);
  });

  it('fails closed on profile lookup failure or inconsistent approval', async () => {
    const failed = await loadWorkerOnboarding(async () => { throw new Error('offline'); }, async () => pending);
    expect(failed.workerOnboardingState).toBe('load-error');
    expect(deriveWorkerOnboardingState(false, { ...pending, status: 'approved' })).toBe('load-error');
  });

  it('derives a restored session solely from repeated persisted reads', async () => {
    const readVerification = vi.fn(async () => false);
    const readSubmission = vi.fn(async () => pending);
    const first = await loadWorkerOnboarding(readVerification, readSubmission);
    const restored = await loadWorkerOnboarding(readVerification, readSubmission);
    expect(restored).toEqual(first);
    expect(readVerification).toHaveBeenCalledTimes(2);
    expect(readSubmission).toHaveBeenCalledTimes(2);
  });
});

function rawIdentity(status: 'pending' | 'rejected') {
  return {
    id: 'document-id',
    id_type: 'national_id',
    status,
    rejection_reason: status === 'rejected' ? 'Blurry photo' : null,
    submitted_at: '2026-09-25T00:00:00Z',
    reviewed_at: null,
  };
}

function deferredBoundaryResult() {
  let resolve!: (result: BoundaryResult) => void;
  const promise = new Promise<BoundaryResult>((done) => { resolve = done; });
  return { promise, resolve };
}

// React DOM is already a production dependency. This root has no host children:
// it supplies only the small DOM host surface React needs to run its own hooks
// and effects. The app is observed through useAccount, its public context API.
async function makeReactRoot(): Promise<RenderRoot> {
  const documentHost = {
    nodeType: 9,
    activeElement: null,
    documentElement: {},
    defaultView: null as unknown,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = {
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: documentHost,
    firstChild: null,
    lastChild: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    insertBefore: () => {},
  };
  vi.stubGlobal('document', documentHost);
  vi.stubGlobal('window', windowHost);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const rendererModule: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ rendererModule) as {
    createRoot: (host: unknown) => RenderRoot;
  };
  return renderer.createRoot(container);
}

const mountedRoots: RenderRoot[] = [];

async function until(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (condition()) return;
    await act(async () => { await Promise.resolve(); });
  }
  throw new Error('The public AccountProvider operation did not reach the expected state');
}

async function mountWorker(): Promise<{ value: () => AccountContextValue }> {
  const root = await makeReactRoot();
  mountedRoots.push(root);
  let latest: AccountContextValue | null = null;
  function Observer() {
    latest = useAccount();
    return null;
  }
  await act(async () => {
    root.render(createElement(SessionProvider, null,
      createElement(AccountProvider, null, createElement(Observer))));
  });
  await until(() => latest?.status === 'resolved');
  return { value: () => {
    if (latest === null) throw new Error('AccountProvider did not render');
    return latest;
  } };
}

describe('Worker onboarding provider refresh races', () => {
  beforeEach(() => {
    boundary.session = {
      user: { id: 'worker-user', email: 'worker@example.test', user_metadata: {} },
    };
    boundary.accountRow = {
      id: 'worker-user',
      email: 'worker@example.test',
      full_name: 'Test Worker',
      phone: '09170000000',
      role: 'worker',
      barangay: 'Santa Ana',
      city: 'Pateros',
      is_active: true,
    };
    boundary.consentRow = {
      user_id: 'worker-user',
      terms_version: '2026-09-v1',
      terms_accepted_at: '2026-09-25T00:00:00Z',
      privacy_version: '2026-09-v1',
      privacy_acknowledged_at: '2026-09-25T00:00:00Z',
    };
    boundary.identityRow = rawIdentity('pending');
    boundary.identityCalls = 0;
    boundary.profileResponses = [];
    boundary.identityResponses = [];
    boundary.authListener = null;
  });

  afterEach(async () => {
    for (const root of mountedRoots.splice(0)) {
      await act(async () => { root.unmount(); });
    }
    vi.unstubAllGlobals();
  });

  it('an older consent refresh cannot replace a newer verified identity', async () => {
    const app = await mountWorker();
    const olderRead = deferredBoundaryResult();
    boundary.identityResponses.push(olderRead.promise);
    let olderRefresh!: Promise<void>;
    await act(async () => { olderRefresh = app.value().refreshConsent(); });
    await until(() => boundary.identityCalls === 2);

    boundary.profileResponses.push(Promise.resolve({ data: { is_verified: true }, error: null }));
    await act(async () => { await app.value().refreshIdentity(); });
    expect(app.value().workerOnboardingState).toBe('verified');

    await act(async () => {
      olderRead.resolve({ data: rawIdentity('pending'), error: null });
      await olderRefresh;
    });
    expect(app.value()).toMatchObject({
      identitySubmission: null,
      workerIsVerified: true,
      workerOnboardingState: 'verified',
    });
  });

  it('a session reset invalidates an older consent refresh', async () => {
    const app = await mountWorker();
    const olderRead = deferredBoundaryResult();
    boundary.identityResponses.push(olderRead.promise);
    let olderRefresh!: Promise<void>;
    await act(async () => { olderRefresh = app.value().refreshConsent(); });
    await until(() => boundary.identityCalls === 2);

    await act(async () => { boundary.authListener?.('SIGNED_OUT', null); });
    expect(app.value().status).toBe('idle');
    await act(async () => {
      olderRead.resolve({ data: rawIdentity('pending'), error: null });
      await olderRefresh;
    });
    expect(app.value()).toMatchObject({
      identitySubmission: null,
      workerIsVerified: false,
      workerOnboardingState: 'loading',
    });
  });

  it('the current consent refresh can update onboarding', async () => {
    const app = await mountWorker();
    boundary.identityResponses.push(Promise.resolve({ data: rawIdentity('rejected'), error: null }));
    await act(async () => { await app.value().refreshConsent(); });
    expect(app.value()).toMatchObject({
      identitySubmission: { status: 'rejected', rejectionReason: 'Blurry photo' },
      workerIsVerified: false,
      workerOnboardingState: 'rejected',
    });
  });
});

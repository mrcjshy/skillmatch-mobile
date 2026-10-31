// 2026-10-14 standalone APK P0: choosing an ID photo backgrounds the app for the system Photo
// Picker. Returning fires AppState 'active', and verify-identity refreshes identity. That refresh
// used to drop the onboarding state to 'loading', which unmounted the ID form and silently
// discarded the chosen photo and ID type (physical Infinix X6871 / Android 15: same pid, same
// ActivityRecord, one refresh-only request pair).
//
// Real modules: SessionProvider, AccountProvider, the verify-identity route, WorkerIdentitySection,
// worker-identity and worker-onboarding. Replaced: the Supabase client (network boundary), the
// system picker, and React Native view primitives (no native host in Vitest).
import { act, createElement, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: null | { code: string; message: string } };
type TestSession = { user: { id: string; email: string; user_metadata: Record<string, unknown> } };
type PickResult = { canceled: true; assets: [] } | { canceled: false; assets: { uri: string }[] };

const b = vi.hoisted(() => ({
  session: null as TestSession | null,
  accounts: {} as Record<string, Record<string, unknown>>,
  verified: {} as Record<string, boolean>,
  identity: {} as Record<string, Record<string, unknown> | null>,
  identityResponses: [] as Promise<Result>[],
  identityCalls: 0,
  profileCalls: 0,
  storageCalls: 0,
  submitCalls: 0,
  authListener: null as null | ((event: string, session: TestSession | null) => void),
  appState: [] as ((state: string) => void)[],
  picks: [] as { result: PickResult; order: 'resolve-then-active' | 'active-then-resolve' }[],
  permission: null as Promise<{ granted: boolean }> | null,
  pickerBusy: false,
  // Latest rendered UI facts.
  title: null as string | null,
  screenMessages: [] as string[],
  photoButton: null as string | null,
  previewUri: null as string | null,
  radios: {} as Record<string, boolean>,
  radioPress: {} as Record<string, () => void>,
  buttonPress: {} as Record<string, () => void>,
  formMounted: 0,
  formMounts: 0,
}));

function currentUserId(): string {
  if (!b.session) throw new Error('No session');
  return b.session.user.id;
}

vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: b.session }, error: null }),
    onAuthStateChange: (listener: typeof b.authListener) => {
      b.authListener = listener;
      return { data: { subscription: { unsubscribe: () => { b.authListener = null; } } } };
    },
    startAutoRefresh: () => {},
    stopAutoRefresh: () => {},
  },
  rpc: (name: string) => {
    if (name === 'get_my_consent') {
      return Promise.resolve({ data: {
        user_id: currentUserId(), terms_version: '2026-09-v1', terms_accepted_at: '2026-09-25T00:00:00Z',
        privacy_version: '2026-10-v1', privacy_acknowledged_at: '2026-09-25T00:00:00Z',
      }, error: null });
    }
    if (name === 'get_my_identity_submission') {
      b.identityCalls += 1;
      const user = currentUserId();
      return b.identityResponses.shift() ?? Promise.resolve({ data: b.identity[user] ?? null, error: null });
    }
    if (name === 'submit_my_valid_id') { b.submitCalls += 1; throw new Error('Submit is never exercised here'); }
    throw new Error(`Unexpected RPC: ${name}`);
  },
  from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: () => {
    const user = currentUserId();
    if (table === 'users') return Promise.resolve({ data: b.accounts[user] ?? null, error: null });
    if (table === 'worker_profiles') {
      b.profileCalls += 1;
      return Promise.resolve({ data: { is_verified: b.verified[user] ?? false }, error: null });
    }
    throw new Error(`Unexpected table: ${table}`);
  } }) }) }),
  storage: { from: () => { b.storageCalls += 1; throw new Error('Storage is never exercised here'); } },
} }));
vi.mock('@supabase/supabase-js', () => ({ AuthError: class AuthError extends Error {} }));
vi.mock('expo-linking', () => ({ addEventListener: () => ({ remove: () => {} }), getInitialURL: async () => null }));
vi.mock('react-native', () => ({
  Platform: { OS: 'android', select: (v: Record<string, unknown>) => v.android ?? v.default },
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      b.appState.push(listener);
      return { remove: () => { b.appState = b.appState.filter((l) => l !== listener); } };
    },
  },
  View: ({ children }: { children?: unknown }) => children ?? null,
  Text: () => null,
  Image: (props: { source?: { uri?: string } }) => { b.previewUri = props.source?.uri ?? null; return null; },
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { useEffect(() => effect(), [effect]); },
}));
vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: async () => b.permission ?? { granted: true },
  launchImageLibraryAsync: async () => {
    const next = b.picks.shift();
    if (!next) throw new Error('No scripted pick');
    // The system Photo Picker is a separate activity: MainActivity goes to the background.
    emitAppState('background');
    if (next.order === 'active-then-resolve') {
      emitAppState('active');
      await Promise.resolve();
      return next.result;
    }
    queueMicrotask(() => emitAppState('active'));
    return next.result;
  },
}));
const theme: object = new Proxy({}, { get: (_t, key) => (key === Symbol.iterator ? undefined : theme), ownKeys: () => [] });
vi.mock('@/components/refinement-theme', () => ({
  useUiTheme: () => theme,
  RefinementThemeProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/components/auth-screen', () => ({
  AuthScreen: ({ title, children }: { title: string; children: unknown }) => {
    b.title = title;
    b.screenMessages = [];
    return children;
  },
  AuthSection: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/components/form-message', () => ({
  FormMessage: ({ message }: { message: string }) => { b.screenMessages.push(message); return null; },
}));
vi.mock('@/components/app-button', () => ({
  AppButton: ({ label, onPress, loading }: { label: string; onPress: () => void; loading?: boolean }) => {
    if (label.startsWith('Opening photo picker')) b.pickerBusy = loading === true;
    b.buttonPress[label] = onPress;
    if (/ID photo$/.test(label)) {
      b.photoButton = label;
      if (label === 'Choose ID photo') b.previewUri = null;
    }
    return null;
  },
}));
vi.mock('@/components/radio-row', () => ({
  RadioRow: ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => {
    b.radios[label] = selected;
    b.radioPress[label] = onPress;
    return null;
  },
}));
vi.mock('@/components/step-list', () => ({ StepList: () => null }));
vi.mock('@/components/inline-status', () => ({ InlineStatus: () => null }));
vi.mock('@/components/section-header', () => ({ SectionHeader: () => null }));
vi.mock('@/lib/sign-out', () => ({ signOutCurrentUser: async () => ({ error: null }) }));
// The real form, observed only for mount/unmount.
vi.mock('@/components/worker-identity-section', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/worker-identity-section')>();
  return {
    WorkerIdentitySection: (props: Parameters<typeof real.WorkerIdentitySection>[0]) => {
      useEffect(() => {
        b.formMounted += 1;
        b.formMounts += 1;
        return () => { b.formMounted -= 1; };
      }, []);
      return createElement(real.WorkerIdentitySection, props);
    },
  };
});

function emitAppState(state: string) { for (const listener of [...b.appState]) listener(state); }

function workerRow(id: string) {
  return { id, email: `${id}@example.test`, full_name: 'Test Worker', phone: '09170000000', role: 'worker',
    barangay: 'Santa Ana', city: 'Pateros', is_active: true };
}
function identityRow(status: 'pending' | 'rejected') {
  return { id: 'document-id', id_type: 'national_id', storage_path: 'p/x.jpg', status,
    rejection_reason: status === 'rejected' ? 'Blurry photo' : null,
    submitted_at: '2026-10-14T00:00:00Z', reviewed_at: null };
}
function deferred() {
  let resolve!: (r: Result) => void;
  const promise = new Promise<Result>((done) => { resolve = done; });
  return { promise, resolve };
}
const PHOTO_A = 'file:///synthetic/picked-a.png';
const PHOTO_B = 'file:///synthetic/picked-b.png';
const DRIVERS = "LTO Driver's License";

type Root = { render: (node: unknown) => void; unmount: () => void };
const roots: Root[] = [];
let accountValue: (() => import('@/providers/account-provider').AccountContextValue) | null = null;

async function settle() {
  // Several macrotask turns: identity reads resolve on later turns, like a network round trip.
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 2)); });
}
async function mount() {
  const doc: Record<string, unknown> = { nodeType: 9, activeElement: null, documentElement: {},
    addEventListener() {}, removeEventListener() {} };
  const win = { document: doc, event: undefined, HTMLIFrameElement: class {} };
  doc.defaultView = win;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: doc, firstChild: null, lastChild: null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const rendererModule: string = 'react-dom/client';
  const { createRoot } = await import(/* @vite-ignore */ rendererModule) as { createRoot: (c: unknown) => Root };
  const { SessionProvider } = await import('@/providers/session-provider');
  const { AccountProvider, useAccount } = await import('@/providers/account-provider');
  const { default: VerifyIdentityScreen } = await import('@/app/(auth)/verify-identity');
  let latest: ReturnType<typeof useAccount> | null = null;
  function Observer() { latest = useAccount(); return null; }
  accountValue = () => { if (!latest) throw new Error('not rendered'); return latest; };
  const root = createRoot(container); roots.push(root);
  await act(async () => {
    root.render(createElement(SessionProvider, null, createElement(AccountProvider, null,
      createElement(Observer), createElement(VerifyIdentityScreen))));
  });
}
async function choosePhoto(uri: string, order: 'resolve-then-active' | 'active-then-resolve' = 'resolve-then-active') {
  b.picks.push({ result: { canceled: false, assets: [{ uri }] }, order });
  await act(async () => { b.buttonPress[b.photoButton ?? 'Choose ID photo']!(); });
  await settle();
}
async function cancelPicker() {
  b.picks.push({ result: { canceled: true, assets: [] }, order: 'resolve-then-active' });
  await act(async () => { b.buttonPress[b.photoButton ?? 'Choose ID photo']!(); });
  await settle();
}
async function selectType(label: string) { await act(async () => { b.radioPress[label]!(); }); }
function selection() { return { type: b.radios[DRIVERS] === true, photo: b.photoButton, preview: b.previewUri }; }

beforeEach(() => {
  b.permission = null; b.pickerBusy = false;
  b.session = { user: { id: 'worker-a', email: 'worker-a@example.test', user_metadata: {} } };
  b.accounts = { 'worker-a': workerRow('worker-a'), 'worker-b': workerRow('worker-b') };
  b.verified = {}; b.identity = {}; b.identityResponses = []; b.picks = [];
  b.identityCalls = 0; b.profileCalls = 0; b.storageCalls = 0; b.submitCalls = 0;
  b.title = null; b.screenMessages = []; b.photoButton = null; b.previewUri = null;
  b.radios = {}; b.radioPress = {}; b.buttonPress = {}; b.formMounted = 0; b.formMounts = 0;
});
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  b.appState = []; b.authListener = null; accountValue = null;
  vi.unstubAllGlobals();
});

describe('Worker ID form across the Android photo-picker foreground refresh', () => {
  it('shows picker busy state while permission is pending and explains denied access', async () => {
    let resolve!: (value: { granted: boolean }) => void;
    b.permission = new Promise(r => { resolve = r; });
    await mount(); await settle();
    await act(async () => { b.buttonPress['Choose ID photo'](); });
    expect(b.pickerBusy).toBe(true);
    await act(async () => { resolve({ granted: false }); }); await settle();
    expect(b.screenMessages.some(message => message.includes('Allow photo access'))).toBe(true);
    expect(b.storageCalls + b.submitCalls).toBe(0);
  });
  it('shows the initial loading state, then the empty form', async () => {
    const first = deferred();
    b.identityResponses.push(first.promise);
    await mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 2)); });
    expect(accountValue!().workerOnboardingState).toBe('loading');
    expect(b.formMounted).toBe(0);
    await act(async () => { first.resolve({ data: null, error: null }); });
    await settle();
    expect(accountValue!().workerOnboardingState).toBe('needs-submission');
    expect(b.formMounted).toBe(1);
    expect(selection()).toEqual({ type: false, photo: 'Choose ID photo', preview: null });
  });

  for (const order of ['resolve-then-active', 'active-then-resolve'] as const) {
    it(`keeps the ID type and photo after the picker returns (${order})`, async () => {
      await mount(); await settle();
      await selectType(DRIVERS);
      const mounts = b.formMounts, identityReads = b.identityCalls, profileReads = b.profileCalls;
      await choosePhoto(PHOTO_A, order);
      expect(b.formMounts).toBe(mounts);
      expect(b.formMounted).toBe(1);
      expect(selection()).toEqual({ type: true, photo: 'Change ID photo', preview: PHOTO_A });
      expect(b.screenMessages).not.toContain('Checking verification status...');
      // Exactly one re-read per foreground return; no loop, no write.
      expect(b.identityCalls - identityReads).toBe(1);
      expect(b.profileCalls - profileReads).toBe(1);
      await settle();
      expect(b.identityCalls - identityReads).toBe(1);
      expect(b.storageCalls + b.submitCalls).toBe(0);
    });
  }

  it('keeps the previous choice when the picker is cancelled', async () => {
    await mount(); await settle();
    await selectType(DRIVERS);
    await choosePhoto(PHOTO_A);
    await cancelPicker();
    expect(b.formMounted).toBe(1);
    expect(selection()).toEqual({ type: true, photo: 'Change ID photo', preview: PHOTO_A });
  });

  it('replaces the photo on a repeated pick and keeps the ID type', async () => {
    await mount(); await settle();
    await selectType(DRIVERS);
    await choosePhoto(PHOTO_A);
    await choosePhoto(PHOTO_B);
    expect(selection()).toEqual({ type: true, photo: 'Change ID photo', preview: PHOTO_B });
    expect(b.formMounted).toBe(1);
  });

  it('a background return that finds a pending submission closes the form', async () => {
    await mount(); await settle();
    await selectType(DRIVERS);
    b.identity['worker-a'] = identityRow('pending');
    await choosePhoto(PHOTO_A);
    expect(accountValue!().workerOnboardingState).toBe('pending-review');
    expect(b.title).toBe('Verification pending');
    expect(b.formMounted).toBe(0);
  });

  it('a background return that finds approval leaves onboarding', async () => {
    await mount(); await settle();
    b.verified['worker-a'] = true;
    await choosePhoto(PHOTO_A);
    expect(accountValue!().workerOnboardingState).toBe('verified');
    expect(accountValue!().workerIsVerified).toBe(true);
    expect(b.formMounted).toBe(0);
  });

  it('a background return that finds a rejection shows the reason and keeps the form', async () => {
    await mount(); await settle();
    await selectType(DRIVERS);
    b.identity['worker-a'] = identityRow('rejected');
    await choosePhoto(PHOTO_A);
    expect(accountValue!().workerOnboardingState).toBe('rejected');
    expect(b.title).toBe('Verification needs attention');
    expect(b.formMounted).toBe(1);
  });

  it('a failed refresh fails closed: no usable form, error shown', async () => {
    await mount(); await settle();
    await selectType(DRIVERS);
    b.identityResponses.push(Promise.resolve({ data: null, error: { code: '08006', message: 'offline' } }));
    await choosePhoto(PHOTO_A);
    expect(accountValue!().workerOnboardingState).toBe('load-error');
    expect(b.formMounted).toBe(0);
    expect(b.screenMessages).toContain('Unable to load your ID submission. Please try again.');
    expect(b.storageCalls + b.submitCalls).toBe(0);
  });

  it('logout clears the form and a late refresh cannot restore it', async () => {
    await mount(); await settle();
    await selectType(DRIVERS);
    await choosePhoto(PHOTO_A);
    const late = deferred();
    b.identityResponses.push(late.promise);
    await act(async () => { emitAppState('background'); emitAppState('active'); });
    await act(async () => { b.authListener?.('SIGNED_OUT', null); });
    b.session = null;
    await settle();
    await act(async () => { late.resolve({ data: identityRow('rejected'), error: null }); });
    await settle();
    expect(accountValue!().status).toBe('idle');
    expect(accountValue!().workerOnboardingState).toBe('loading');
    expect(accountValue!().identitySubmission).toBeNull();
    expect(b.formMounted).toBe(0);
  });

  it('an account switch drops the previous Worker\'s selection and stale refresh', async () => {
    await mount(); await settle();
    await selectType(DRIVERS);
    await choosePhoto(PHOTO_A);
    const late = deferred();
    b.identityResponses.push(late.promise);
    await act(async () => { emitAppState('background'); emitAppState('active'); });
    b.session = { user: { id: 'worker-b', email: 'worker-b@example.test', user_metadata: {} } };
    b.identity['worker-b'] = null;
    await act(async () => { b.authListener?.('SIGNED_IN', b.session); });
    await settle();
    await act(async () => { late.resolve({ data: identityRow('pending'), error: null }); });
    await settle();
    expect(accountValue!().account?.id).toBe('worker-b');
    expect(accountValue!().workerOnboardingState).toBe('needs-submission');
    expect(accountValue!().identitySubmission).toBeNull();
    expect(b.formMounted).toBe(1);
    expect(selection()).toEqual({ type: false, photo: 'Choose ID photo', preview: null });
  });

  it('an older refresh response cannot overwrite a newer one', async () => {
    await mount(); await settle();
    const older = deferred();
    b.identityResponses.push(older.promise);
    await act(async () => { emitAppState('background'); emitAppState('active'); });
    b.identityResponses.push(Promise.resolve({ data: identityRow('rejected'), error: null }));
    await act(async () => { emitAppState('background'); emitAppState('active'); });
    await settle();
    expect(accountValue!().workerOnboardingState).toBe('rejected');
    await act(async () => { older.resolve({ data: identityRow('pending'), error: null }); });
    await settle();
    expect(accountValue!().workerOnboardingState).toBe('rejected');
  });
});

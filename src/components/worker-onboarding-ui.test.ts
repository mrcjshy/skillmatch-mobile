// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { resolve } from 'node:path';
// @ts-expect-error -- Vitest runs in Node; the Expo app tsconfig omits Node declarations.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import { canEnterWorkerApp } from '../lib/worker-onboarding';

type Props = Record<string, any>;
type Element = { type: string | ((props: Props) => Element); props: Props };

function compileModule(file: string, modules: Record<string, unknown>): Props {
  const exports: Props = {};
  const compiled = ts.transpileModule(readFileSync(resolve('src', file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => (modules['@/constants/theme'] as { SkillMatchTheme: { ui: unknown } }).SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: any) => children };
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
    },
  });
  return exports;
}

function all(tree: Element | null, predicate: (node: Element) => boolean): Element[] {
  if (!tree || typeof tree !== 'object') return [];
  const children = [tree.props?.children].flat(Infinity) as Element[];
  return [
    ...(predicate(tree) ? [tree] : []),
    ...children.flatMap((child) => all(child, predicate)),
  ];
}

function account(overrides: Props = {}) {
  return {
    account: {
      id: 'worker-user',
      role: 'worker',
      is_active: true,
    },
    status: 'resolved',
    accountError: null,
    hasCurrentConsent: true,
    workerOnboardingState: 'needs-submission',
    ...overrides,
  };
}

const session = {
  session: { user: { id: 'worker-user' } },
  isSessionLoading: false,
  sessionError: null,
  recoveryStatus: 'idle',
};

function routingModule() {
  const jsx = (type: Element['type'], props: Props) => ({ type, props });
  const Stack = Object.assign('Stack', { Screen: 'Stack.Screen', Protected: 'Stack.Protected' });
  return compileModule('app/_layout.tsx', {
    react: {},
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { Stack },
    '@/components/state-screen': { StateScreen: 'StateScreen' },
    tamagui: { TamaguiProvider: 'TamaguiProvider' },
    '../../tamagui.config': { tamaguiConfig: {} },
    '@/components/push-notification-inbox-intent': { PushNotificationInboxIntent: 'Push' },
    '@/components/incoming-message-banner-host': { IncomingMessageBannerHost: 'Banner' },
    '@/lib/auth-recovery': {
      isRecoverySurfaceActive: (status: string) => status === 'active',
    },
    '@/lib/phone-verification': { isPhoneOtpEnabled: () => false },
    '@/lib/worker-onboarding': { canEnterWorkerApp },
    '@/providers/account-provider': { AccountProvider: 'AccountProvider', useAccount: vi.fn() },
    '@/providers/session-provider': { SessionProvider: 'SessionProvider', useSession: vi.fn() },
  });
}

function screenHarness(workerOnboardingState: string, identitySubmission: Props | null = null) {
  const refreshIdentity = vi.fn(async () => {});
  const focusEffects: (() => void | (() => void))[] = [];
  const jsx = (type: Element['type'], props: Props) => typeof type === 'function' ? type(props) : ({ type, props });
  const ui = {
    colors: {},
    type: {},
    spacing: { xxxxl: 48, gutter: 16, xxl: 24, lg: 12, sm: 4, md: 8 },
  };
  const exports = compileModule('app/(auth)/verify-identity.tsx', {
    react: {
      useCallback: (callback: unknown) => callback,
      useState: (initial: unknown) => [initial, vi.fn()],
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useFocusEffect: (effect: () => void | (() => void)) => focusEffects.push(effect) },
    'react-native': {
      AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
      StyleSheet: { create: (styles: unknown) => styles },
      Text: 'Text',
      View: 'View',
    },
    '@/components/app-button': { AppButton: 'AppButton' },
    '@/components/auth-screen': { AuthScreen: 'AuthScreen', AuthSection: 'AuthSection' },
    '@/components/form-message': { FormMessage: 'FormMessage' },
    '@/components/step-list': { StepList: 'StepList' },
    '@/components/worker-identity-section': { WorkerIdentitySection: 'WorkerIdentitySection' },
    '@/constants/theme': { SkillMatchTheme: { ui } },
    '@/lib/worker-identity': {
      IDENTITY_COPY: {
        loadFailed: 'Identity unavailable.',
        homePendingBody: ['Verification usually takes up to 24 hours.', 'You will be notified when your account is verified.'],
      },
    },
    '@/lib/sign-out': { signOutCurrentUser: vi.fn() },
    '@/providers/account-provider': {
      useAccount: () => ({ refreshIdentity, workerOnboardingState, identitySubmission }),
    },
  });
  const tree = exports.default() as Element;
  return { tree, refreshIdentity, focusEffects };
}

describe('Worker onboarding route protection', () => {
  const routing = routingModule();
  const deriveAccessState = routing.deriveAccessState as (
    sessionValue: Props,
    accountValue: Props,
    phoneOtpEnabled?: boolean
  ) => string;

  it('maps the incomplete and complete states to separate route surfaces', () => {
    expect(routing.ACCESS_ROUTE).toMatchObject({
      'worker-identity': '/verify-identity',
      worker: '/worker',
    });
  });

  it('routes an unverified phone only when phone OTP is enabled', () => {
    expect(routing.ACCESS_ROUTE).toMatchObject({
      'needs-phone-verification': '/verify-phone',
    });
    const phoneRequiredAccount = account({
      account: null,
      status: 'error',
      accountError: { code: 'phone_verification_required' },
    });
    expect(deriveAccessState(session, phoneRequiredAccount, true)).toBe('needs-phone-verification');
    expect(deriveAccessState(session, phoneRequiredAccount, false)).toBe('account-failure');
  });

  it.each([
    'loading',
    'needs-submission',
    'pending-review',
    'rejected',
    'load-error',
  ])('keeps %s outside the operational Worker routes', (workerOnboardingState) => {
    expect(deriveAccessState(session, account({ workerOnboardingState }))).toBe('worker-identity');
  });

  it('admits only an authoritative verified state', () => {
    expect(deriveAccessState(session, account({ workerOnboardingState: 'verified' }))).toBe('worker');
  });

  it('does not let stale local submission or verification flags bypass the current state', () => {
    expect(deriveAccessState(session, account({
      workerOnboardingState: 'pending-review',
      identitySubmission: { status: 'approved' },
      workerIsVerified: true,
    }))).toBe('worker-identity');
  });

  it('re-derives the correct gate after logout and a restored login', () => {
    expect(deriveAccessState({ ...session, session: null }, account())).toBe('signed-out');
    expect(deriveAccessState(session, account({ workerOnboardingState: 'rejected' }))).toBe(
      'worker-identity'
    );
  });
});

describe('Worker onboarding presentation', () => {
  it('renders the submission step only for a fresh incomplete Worker', () => {
    const { tree } = screenHarness('needs-submission');
    expect(tree.type).toBe('AuthScreen');
    expect(tree.props.title).toBe('Verify your identity');
    const section = all(tree, (node) => node.type === 'WorkerIdentitySection');
    expect(section).toHaveLength(1);
    expect(section[0].props).toMatchObject({ surface: 'onboarding', authoritativeSubmission: null });
  });

  it('resumes pending review without rendering another upload form', () => {
    const pending = { status: 'pending', id: 'id-row' };
    const { tree } = screenHarness('pending-review', pending);
    expect(all(tree, (node) => node.type === 'WorkerIdentitySection')).toHaveLength(0);
    expect(all(tree, (node) => node.type === 'AppButton' && node.props.label === 'Refresh status'))
      .toHaveLength(1);
  });

  it('resumes a rejection with the authoritative submission', () => {
    const rejected = { status: 'rejected', rejectionReason: 'Use a clearer photo.' };
    const { tree } = screenHarness('rejected', rejected);
    const section = all(tree, (node) => node.type === 'WorkerIdentitySection');
    expect(section).toHaveLength(1);
    expect(section[0].props.authoritativeSubmission).toBe(rejected);
  });

  it.each(['loading', 'load-error', 'verified'])('never exposes an upload step for %s', (state) => {
    const { tree } = screenHarness(state);
    expect(all(tree, (node) => node.type === 'WorkerIdentitySection')).toHaveLength(0);
  });

  it.each([
    ['needs-submission', 'Verify your identity', ['done', 'current', 'upcoming']],
    ['pending-review', 'Verification pending', ['done', 'current', 'upcoming']],
    ['rejected', 'Verification needs attention', ['done', 'current', 'upcoming']],
  ])('titles %s as "%s" and shows the real three-step onboarding order', (state, title, states) => {
    const { tree } = screenHarness(state);
    expect(tree.props.title).toBe(title);
    const steps = all(tree, (node) => node.type === 'StepList')[0].props.steps as { label: string; state: string }[];
    expect(steps.map((step) => step.label)).toEqual(['Account and email', 'Verify your ID', 'Set up your work profile']);
    expect(steps.map((step) => step.state)).toEqual(states);
  });

  it('explains why only on the states that ask for an ID, from facts the Terms already state', () => {
    for (const state of ['needs-submission', 'rejected']) {
      const { tree } = screenHarness(state);
      expect(all(tree, (node) => node.type === 'AuthSection').map((node) => node.props.title)).toEqual(['Why we ask']);
    }
    for (const state of ['pending-review', 'loading', 'load-error', 'verified']) {
      const { tree } = screenHarness(state);
      expect(all(tree, (node) => node.type === 'AuthSection')).toHaveLength(0);
    }
  });

  it('keeps Sign out as the subordinate footer action and Try again only for a load error', () => {
    const { tree } = screenHarness('load-error');
    const footer = all(tree.props.footer as Element, (node) => node.type === 'AppButton');
    expect(footer.map((node) => [node.props.label, node.props.variant])).toEqual([['Sign out', 'ghost']]);
    expect(all(tree, (node) => node.type === 'AppButton' && node.props.label === 'Try again')).toHaveLength(1);
    expect(all(screenHarness('needs-submission').tree, (node) => node.type === 'AppButton' && node.props.label === 'Try again')).toHaveLength(0);
  });

  it('reloads authoritative state when the route is focused', async () => {
    const { refreshIdentity, focusEffects } = screenHarness('pending-review');
    expect(focusEffects).toHaveLength(1);
    focusEffects[0]();
    expect(refreshIdentity).toHaveBeenCalledTimes(1);
  });

  it('waits for the authoritative reload after submission', async () => {
    let release!: () => void;
    const refresh = new Promise<void>((resolve) => { release = resolve; });
    const { tree, refreshIdentity } = screenHarness('needs-submission');
    refreshIdentity.mockReturnValueOnce(refresh);
    const section = all(tree, (node) => node.type === 'WorkerIdentitySection')[0];
    let completed = false;
    const callback = (section.props.onSubmitted as () => Promise<void>)().then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    release();
    await callback;
    expect(completed).toBe(true);

    const identitySection = readFileSync(
      resolve('src', 'components/worker-identity-section.tsx'),
      'utf8'
    );
    expect(identitySection).toContain('await onSubmitted?.(row);');
  });
});

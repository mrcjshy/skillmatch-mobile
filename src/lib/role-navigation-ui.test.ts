// @ts-expect-error -- Node-only offline navigation composition.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// C3R: independently specified from the approved routing contract. No historical
// visual, font, sizing, palette or provider-lifetime expectations are adopted.
type Props = Record<string, any>;
type Element = { type: any; props: Props };
const element = (type: any, props: Props): Element => ({ type, props });
const noop = () => undefined;
const stack = Object.assign('Stack', { Screen: 'Stack.Screen', Protected: 'Stack.Protected' });
const tabs = Object.assign('Tabs', { Screen: 'Tabs.Screen' });
const native = { View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (value: Props) => value }, Platform: { OS: 'android', select: (value: Props) => value.android ?? value.default } };
const account = { id: 'owner', role: 'client', is_active: true };
const session = { session: { user: { id: 'owner' } }, isSessionLoading: false, sessionError: null, recoveryStatus: 'idle' };
const accountState = { account, status: 'resolved', accountError: null, hasCurrentConsent: true, workerOnboardingState: 'verified' };

function load(file: string, overrides: Props = {}): Props {
  const exports: Props = {};
  const seams: Props = {
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    react: { useMemo: (fn: () => any) => fn(), useLayoutEffect: noop },
    'react-native': native,
    'expo-router': { Stack: stack, Tabs: tabs, Redirect: 'Redirect', useRouter: () => ({ push: noop }) },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    tamagui: { TamaguiProvider: 'TamaguiProvider' },
    '../../tamagui.config': { tamaguiConfig: {} },
    '@/global.css': {},
    '@/components/app-tab-bar': { useAppTabScreenOptions: () => ({ headerShown: true }), TabIcon: 'TabIcon', TabLabel: 'TabLabel' },
    '@/components/client-tab-bar': { ClientTabBar: 'ClientTabBar' },
    '@/components/push-notification-registration': { PushNotificationRegistration: 'PushNotificationRegistration' },
    '@/components/push-notification-inbox-intent': { PushNotificationInboxIntent: 'PushNotificationInboxIntent' },
    '@/components/incoming-message-banner-host': { IncomingMessageBannerHost: 'IncomingMessageBannerHost' },
    '@/components/state-screen': { StateScreen: 'StateScreen' },
    '@/providers/session-provider': { SessionProvider: 'SessionProvider', useSession: () => session },
    '@/providers/account-provider': { AccountProvider: 'AccountProvider', useAccount: () => accountState },
    '@/providers/client-jobs-provider': { ClientJobsProvider: 'ClientJobsProvider', useClientJobs: () => ({ isLoading: false, loadError: null }) },
    '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => ({ isPosting: false, isOwnerCurrent: () => true }) },
    '@/providers/worker-profile-provider': { WorkerProfileProvider: 'WorkerProfileProvider' },
    '@/lib/auth-recovery': { isRecoverySurfaceActive: (value: string) => ['processing', 'ready', 'error', 'complete'].includes(value) },
    '@/lib/phone-verification': { isPhoneOtpEnabled: () => false },
    '@/lib/worker-onboarding': { canEnterWorkerApp: (value: string) => value === 'verified' },
    '@/lib/push-notifications': { hasPendingNotificationsInboxIntent: () => false, getPendingChatBookingId: () => null, decidePendingInboxNavigation: () => ({ kind: 'none' }) },
    ...overrides,
  };
  const requireLocal = (id: string): Props => {
    if (Object.hasOwn(seams, id)) return seams[id];
    if (id === '@/constants/theme') return load('src/constants/theme.ts');
    if (id === '@/components/app-header-options') return load('src/components/app-header-options.ts');
    if (id === '@/app/_layout') return load('src/app/_layout.tsx', overrides);
    throw new Error('Missing offline navigation seam: ' + id);
  };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(requireLocal, exports);
  return exports;
}
function all(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(all);
  if (!value?.props) return [];
  return [value, ...all(value.props.children)];
}
function render(file: string, seams: Props = {}): Element { return load(file, seams).default(); }
const tabContract = {
  worker: [['worker/index', 'Home'], ['worker/bookings', 'Bookings'], ['worker/profile', 'Profile']],
  client: [['client/index', 'Home'], ['client/jobs', 'My jobs'], ['client/bookings', 'Bookings'], ['client/profile', 'Profile']],
  admin: [['admin/index', 'Home'], ['admin/workers', 'Workers'], ['admin/clients', 'Clients'], ['admin/reports', 'Reports']],
};

describe('approved role destinations and native history ownership', () => {
  for (const [role, routes] of Object.entries(tabContract)) {
    it(`${role} exposes exactly its approved tabs and returns tab Back to Home`, () => {
      const tree = render(`src/app/(${role})/(tabs)/_layout.tsx`);
      expect(all(tree).filter(node => node.type === 'Tabs.Screen').map(node => node.props.name)).toEqual(routes.map(([route]) => route));
      expect(all(tree).find(node => node.type === tabs)?.props.backBehavior).toBe('initialRoute');
    });
    for (const [route, label] of routes) it(`${role}/${label} keeps its authoritative destination and accessible label`, () => {
      const tree = render(`src/app/(${role})/(tabs)/_layout.tsx`);
      const screen = all(tree).find(node => node.type === 'Tabs.Screen' && node.props.name === route)!;
      expect(screen.props.options.title).toBe(label);
      expect(screen.props.options.tabBarAccessibilityLabel).toBe(label);
      expect(screen.props.options.headerShown).toBe(label === 'Home' ? false : undefined);
      expect(screen.props.options.headerRight).toBeUndefined();
    });
    it(`${role} keeps pushed screens outside the tab shell with native Stack Back`, () => {
      const tree = render(`src/app/(${role})/_layout.tsx`);
      const navigator = all(tree).find(node => node.type === stack)!;
      expect(all(navigator).filter(node => node.type === 'Stack.Screen' && node.props.name === '(tabs)').map(node => node.props.options)).toEqual([{ headerShown: false }]);
      expect(all(tree).some(node => node.type === tabs)).toBe(false);
      expect(navigator.props.screenOptions.headerLeft).toBeUndefined();
      expect(navigator.props.screenOptions.headerBackVisible).toBeUndefined();
    });
  }
});

describe('approved Client Post Job is a guarded pushed action, never a tab', () => {
  const cases = [
    { label: 'ready owner', loading: false, error: null, posting: false, owner: true, allowed: true },
    { label: 'loading jobs', loading: true, error: null, posting: false, owner: true, allowed: false },
    { label: 'failed jobs', loading: false, error: 'unavailable', posting: false, owner: true, allowed: false },
    { label: 'posting', loading: false, error: null, posting: true, owner: true, allowed: false },
    { label: 'lost owner', loading: false, error: null, posting: false, owner: false, allowed: false },
  ];
  it.each(cases)('$label', ({ loading, error, posting, owner, allowed }) => {
    const push = vi.fn();
    const tree = render('src/app/(client)/(tabs)/_layout.tsx', {
      'expo-router': { Tabs: tabs, useRouter: () => ({ push }) },
      '@/providers/client-jobs-provider': { useClientJobs: () => ({ isLoading: loading, loadError: error }) },
      '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => ({ isPosting: posting, isOwnerCurrent: () => owner }) },
    });
    expect(all(tree).some(node => node.type === 'Tabs.Screen' && /post-job/.test(node.props.name))).toBe(false);
    const bar = all(tree).find(node => node.type === tabs)!.props.tabBar({});
    expect(bar.props.postDisabled).toBe(!allowed);
    bar.props.onPostJob();
    expect(push.mock.calls).toEqual(allowed ? [['/client/post-job']] : []);
  });
  it('rechecks owner authority when a previously rendered Post Job action is pressed', () => {
    let current = true;
    const push = vi.fn();
    const tree = render('src/app/(client)/(tabs)/_layout.tsx', {
      'expo-router': { Tabs: tabs, useRouter: () => ({ push }) },
      '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => ({ isPosting: false, isOwnerCurrent: () => current }) },
    });
    const bar = all(tree).find(node => node.type === tabs)!.props.tabBar({});
    current = false; bar.props.onPostJob(); expect(push).not.toHaveBeenCalled();
  });
});

describe('single authoritative root dispatcher', () => {
  // Independent decision table: active role + consent + Worker verification.
  const roles = ['worker', 'client', 'administrator'];
  const roleCases = roles.flatMap(role => [true, false].flatMap(active => [true, false].flatMap(consent => ['verified', 'required', 'pending'].map(identity => {
    const expected = !active ? 'blocked' : role === 'administrator' ? 'administrator' : !consent ? 'needs-consent' : role === 'client' ? 'client' : identity === 'verified' ? 'worker' : 'worker-identity';
    return { role, active, consent, identity, expected };
  }))));
  const paths: Props = { blocked: '/blocked', administrator: '/admin', 'needs-consent': '/legal-consent', client: '/client', worker: '/worker', 'worker-identity': '/verify-identity' };
  it.each(roleCases)('$role active=$active consent=$consent identity=$identity', ({ role, active, consent, identity, expected }) => {
    const state = { ...accountState, account: { ...account, role, is_active: active }, hasCurrentConsent: consent, workerOnboardingState: identity };
    const root = load('src/app/_layout.tsx');
    expect(root.deriveAccessState(session, state, false)).toBe(expected);
    expect(root.ACCESS_ROUTE[expected]).toBe(paths[expected]);
    const tree = render('src/app/index.tsx', { '@/providers/account-provider': { useAccount: () => state } });
    expect(tree.type).toBe('Redirect'); expect(tree.props.href).toBe(paths[expected]);
  });
  const holds = [
    { label: 'session restoration', session: { ...session, isSessionLoading: true }, state: accountState, expected: 'session-restoring' },
    { label: 'signed out', session: { ...session, session: null }, state: accountState, expected: 'signed-out', href: '/login' },
    { label: 'session failure', session: { ...session, session: null, sessionError: 'unavailable' }, state: accountState, expected: 'session-error' },
    { label: 'pending account', session, state: { ...accountState, status: 'pending' }, expected: 'account-pending' },
    { label: 'owner mismatch', session, state: { ...accountState, account: { ...account, id: 'other' } }, expected: 'account-pending' },
    { label: 'missing account', session, state: { ...accountState, account: null }, expected: 'account-failure', href: '/bootstrap-error' },
    { label: 'unknown role', session, state: { ...accountState, account: { ...account, role: 'unknown' } }, expected: 'account-failure', href: '/bootstrap-error' },
    { label: 'account failure', session, state: { ...accountState, status: 'error' }, expected: 'account-failure', href: '/bootstrap-error' },
  ];
  it.each(holds)('$label never defaults to a role', ({ session: value, state, expected, href }) => {
    const root = load('src/app/_layout.tsx');
    expect(root.deriveAccessState(value, state, false)).toBe(expected);
    const tree = render('src/app/index.tsx', {
      '@/providers/session-provider': { useSession: () => value },
      '@/providers/account-provider': { useAccount: () => state },
    });
    if (href) { expect(tree.type).toBe('Redirect'); expect(tree.props.href).toBe(href); }
    else expect(all(tree).some(node => node.type === 'Redirect')).toBe(false);
  });
  it.each(['processing', 'ready', 'error', 'complete'])('recovery %s remains in the recovery route', recoveryStatus => {
    const value = { ...session, recoveryStatus };
    const root = load('src/app/_layout.tsx');
    expect(root.deriveAccessState(value, accountState, false)).toBe('password-recovery');
    expect(render('src/app/index.tsx', { '@/providers/session-provider': { useSession: () => value } }).props.href).toBe('/update-password');
  });
});

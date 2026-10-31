import { act, Children, createElement, Fragment, isValidElement, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
// @ts-expect-error -- Node-only: reads the installed expo-router build and the app's route files.
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import RootLayout from '@/app/_layout';
import RootIndex from '@/app/index';
import { useSessionContinuationRestore } from '@/hooks/use-session-continuation-restore';
import { sessionRouteContinuation } from '@/lib/session-route-continuation';

// Option B root capture regression (2026-10-23, Navigation back after a refresh re-entry).
// On device the Chat restored by a same-session refresh had no parents: the root layout's capture read the state of
// expo-router 57's OUTER navigator (ExpoRoot Content, id and single route `__root`), so no parent chain was saved and
// the restore hook completed as `preserved` without a reset. The earlier tests fed `observe()` a hand-written stack, or
// gave stackFromNavigationState a root state without the `__root` level, so they never covered this capture.
//
// What runs for real here:
// - the INSTALLED expo-router `ExpoRoot` module (ExpoRoot -> ContextNavigator -> Content: the `__root` wrapper built with
//   useNavigationBuilder(StackRouter, { id: '__root' })) and the INSTALLED `useRootNavigationState` hook module, both
//   executed from node_modules/expo-router/build; only the leaf modules they import and this scenario never reaches
//   (native container/linking, splash, safe area, DOM components, sitemap/not-found views) are inert stand-ins;
// - the INSTALLED routing queue and imperative-API emitter, through which expo-router dispatches `router.replace`;
// - expo-router's vendored React Navigation core: BaseNavigationContainer, useNavigationBuilder, StackRouter, TabRouter;
// - the app's actual root layout `src/app/_layout.tsx` (RootNavigator: useRootNavigationState -> stackFromNavigationState
//   -> sessionRouteContinuation.observe), the actual dispatcher `src/app/index.tsx`, the actual continuation store and
//   the actual restore hook.
// Limits (not exercised for real): the native container, linking, BackHandler and the native-stack/tab VIEWS (every
// route stays mounted, as in a native stack); expo-router's URL hooks (`usePathname`/`useGlobalSearchParams` are derived
// here from the subscribed navigation state); `<Redirect>`'s href resolution (the REPLACE action that `router.replace`
// produces for the role URL is built here, not by expo-router's linking config, then queued and dispatched as above);
// the role group and tab layouts (real routers with the app's file-route names, pinned below, but not the app's layout
// files or screens; Booking details and Chat are reduced to their restore-hook call with a scripted read outcome); the
// providers (a resolved/pending account switch stands in for the account recheck). Nothing here is native Back acceptance.
const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    me: '55555555-5555-4555-8555-555555555555',
    lifetime: { ownerId: '55555555-5555-4555-8555-555555555555', isCurrent: () => true },
    auth: { role: 'client' as 'client' | 'worker', status: 'resolved' as 'resolved' | 'pending', version: 0 },
    read: 'ready' as 'pending' | 'ready',
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    notify: () => { for (const fn of [...listeners]) fn(); },
    StackScreen: function StackScreen() { return null; },
    StackProtected: function StackProtected() { return null; },
    impl: {} as Record<string, (...args: any[]) => any>,
    rootStates: [] as any[], resets: [] as any[], wrappers: new WeakMap<object, unknown>(),
    mounts: new Map<string, number>(), unmounts: new Map<string, number>(),
  };
});
vi.mock('@/components/skeleton', () => ({ Skeleton: () => null, PulseDots: () => null, KeyboardSpacer: () => null }));
vi.mock('expo-router', () => {
  const delegate = (name: string) => (...args: unknown[]) => h.impl[name](...args);
  const Stack = Object.assign((props: object) => h.impl.Stack(props), { Screen: h.StackScreen, Protected: h.StackProtected });
  return { Stack, Redirect: delegate('Redirect'), usePathname: delegate('usePathname'), useGlobalSearchParams: delegate('useGlobalSearchParams'),
    useRootNavigationState: delegate('useRootNavigationState'), useNavigation: delegate('useNavigation'), useRoute: delegate('useRoute'),
    useIsFocused: delegate('useIsFocused') };
});
vi.mock('@/providers/session-provider', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    SessionProvider: ({ children }: { children?: unknown }) => children,
    useSession: () => {
      useSyncExternalStore(h.subscribe, () => h.auth.version);
      return { session: { user: { id: h.me } }, isSessionLoading: false, sessionError: null, recoveryStatus: 'idle',
        isSessionReconnecting: false, sessionLifetime: h.lifetime, retrySessionRestore() {} };
    },
  };
});
vi.mock('@/providers/account-provider', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    AccountProvider: ({ children }: { children?: unknown }) => children,
    useAccount: () => {
      useSyncExternalStore(h.subscribe, () => h.auth.version);
      return { account: { id: h.me, role: h.auth.role, is_active: true }, status: h.auth.status, accountError: null,
        hasCurrentConsent: true, workerOnboardingState: 'verified' };
    },
  };
});
vi.mock('react-native', () => ({
  Platform: { OS: 'android', select: (values: any) => values.android ?? values.default },
  StyleSheet: { create: (styles: unknown) => styles }, View: () => null, ActivityIndicator: () => null,
}));
vi.mock('@/constants/theme', () => ({ SkillMatchTheme: { ui: { colors: { canvas: '#ffffff' } } } }));
vi.mock('@/lib/push-notifications', () => ({ decidePendingInboxNavigation: () => ({ kind: 'idle' }), getPendingChatBookingId: () => null,
  getPendingCall: () => null, hasPendingNotificationsInboxIntent: () => false }));
vi.mock('tamagui', () => ({ TamaguiProvider: ({ children }: { children?: unknown }) => children }));
vi.mock('../../tamagui.config', () => ({ tamaguiConfig: {} }));
vi.mock('@/components/push-notification-inbox-intent', () => ({ PushNotificationInboxIntent: () => null }));
vi.mock('@/components/incoming-message-banner-host', () => ({ IncomingMessageBannerHost: () => null }));
vi.mock('@/components/incoming-call-host', () => ({ IncomingCallHost: () => null }));
vi.mock('@/components/location-stop-host', () => ({ LocationStopHost: () => null }));
vi.mock('@/components/state-screen', () => ({ StateScreen: () => null }));
vi.mock('@/components/session-reconnecting-screen', () => ({ SessionReconnectingScreen: () => null }));

const ROUTER_BUILD = `${process.cwd()}/node_modules/expo-router/build/`;
const routerFile = (file: string): string => readFileSync(ROUTER_BUILD + file, 'utf8');
/** Executes one compiled module of the installed expo-router; every require must be listed in `deps`. */
function loadInstalled(file: string, deps: Record<string, unknown>) {
  const mod = { exports: {} as Record<string, any> };
  const requireDep = (id: string) => {
    if (!Object.hasOwn(deps, id)) throw Error(`${file}: unexpected require('${id}')`);
    return deps[id];
  };
  new Function('exports', 'require', 'module', routerFile(file))(mod.exports, requireDep, mod);
  return mod.exports;
}
const interop = (mod: any) => (mod?.default && typeof mod.default === 'object' ? mod.default : mod);

type Role = 'client' | 'worker';
const B = '11111111-1111-4111-8111-111111111111';
const ANCHOR = '33333333-3333-4333-8333-333333333333';
const TABS: Record<Role, string[]> = {
  client: ['client/index', 'client/jobs', 'client/bookings', 'client/profile'],
  worker: ['worker/index', 'worker/bookings', 'worker/profile'],
};
/** The user's own stack before the refresh: the Bookings tab, then Booking details, then Chat for the same booking. */
const userStack = (role: Role) => ({ index: 2, routes: [
  { name: '(tabs)', state: { index: TABS[role].indexOf(`${role}/bookings`), routes: TABS[role].map(name => ({ name })) } },
  { name: `${role}/booking-details`, params: { bookingId: B } },
  { name: `${role}/chat`, params: { bookingId: B } },
] });
const expectedChain = (role: Role) => [
  { pathname: `/${role}/bookings`, params: {} },
  { pathname: `/${role}/booking-details`, params: { bookingId: B } },
  { pathname: `/${role}/chat`, params: { bookingId: B } },
];

let core: any;
let installed: { ExpoRoot: any; store: Record<string, unknown> };
type Root = { render(node: unknown): void; unmount(): void };
const roots: Root[] = [];
async function settle(rounds = 40) { for (let i = 0; i < rounds; i++) await act(async () => { await Promise.resolve(); }); }
const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

beforeAll(async () => {
  core = await import('expo-router/build/react-navigation/core');
  const React = interop(await import('react')), jsxRuntime = interop(await import('react/jsx-runtime'));
  // `react-navigation/native` re-exports `../core` and defines none of the members these modules use (pinned below).
  const native = core;
  const constants = loadInstalled('constants.js', {});
  const hook = loadInstalled('hooks/useRootNavigationState.js', { '../constants': constants, '../react-navigation/native': native });
  const primitives = loadInstalled('primitives/navigation.js', { '../react-navigation/native': native });
  // expo-router's imperative routing: router.replace() queues an action that the container dispatches in a later effect.
  const { routingQueue } = loadInstalled('global-state/routingQueue.js', {
    './getNavigationAction': { getNavigateAction() { throw Error('ROUTER_LINK resolution is not emulated'); } },
  });
  const imperative = loadInstalled('imperative-api.js', { react: React, './global-state/router': {}, './global-state/routing': { routingQueue } });
  const passthrough = ({ children }: { children?: ReactNode }) => children;
  const store: Record<string, any> = { rootComponent: null, navigationRef: null, state: undefined, onReady() {} };
  // Stands in for expo-router's fork NavigationContainer: the vendored BaseNavigationContainer plus the installed
  // imperative-API emitter it mounts (no linking, BackHandler or document title).
  function Container({ initialState, onUnhandledAction, children }: any) {
    imperative.useImperativeApiEmitter(store.navigationRef);
    return createElement(core.BaseNavigationContainer, { ref: store.navigationRef, initialState, onUnhandledAction }, children);
  }
  const expoRoot = loadInstalled('ExpoRoot.js', {
    'react/jsx-runtime': jsxRuntime, react: React,
    'react-native': { Platform: { OS: 'android' } },
    'react-native-safe-area-context': { SafeAreaProvider: passthrough },
    './constants': constants,
    './domComponents/useDomComponentNavigation': { useDomComponentNavigation() {} },
    './fork/NavigationContainer': { NavigationContainer: Container },
    './global-state/router-store': { store, useStore: () => ({ navigationRef: store.navigationRef, state: store.state, linking: undefined,
      onStateChange: undefined, shouldShowTutorial: () => false }) },
    './global-state/serverLocationContext': { ServerContext: React.createContext(undefined) },
    './global-state/storeContext': { StoreContext: React.createContext(null) },
    // app.json sets `extra.router: {}`, so the installed defaults append both generated routes.
    './global-state/utils': { shouldAppendNotFound: () => true, shouldAppendSitemap: () => true },
    './link/preview/LinkPreviewContext': { LinkPreviewContextProvider: passthrough },
    './navigationEvents/navigation': { handleNavigationOnReady() {} },
    './primitives': primitives,
    './react-navigation/native': native,
    './screensFeatureFlags': { initScreensFeatureFlags() {} },
    './utils/url': { parseUrlUsingCustomBase: (url: string) => new URL(url) },
    './views/RootUnmatched': { RootUnmatched: () => null },
    './views/Sitemap': { Sitemap: () => null },
    './views/Splash': { hideAsync() {} },
  });
  installed = { ExpoRoot: expoRoot.ExpoRoot, store };

  const view = (router: unknown) => function NavView(props: any) {
    const { state, descriptors, NavigationContent } = core.useNavigationBuilder(router, props);
    return createElement(NavigationContent, null, ...state.routes.map((route: any) => createElement(Fragment, { key: route.key }, descriptors[route.key].render())));
  };
  const createStack = core.createNavigatorFactory(view(core.StackRouter));
  const createTabs = core.createNavigatorFactory(view(core.TabRouter));
  const Empty = () => null;
  // Booking details and Chat: here only their call into the actual restore hook with the outcome of their own read,
  // which (as on device) completes after the screen mounted.
  function RestoringScreen() {
    const route = core.useRoute();
    const read = useSyncExternalStore(h.subscribe, () => h.read);
    useLayoutEffect(() => { count(h.mounts, route.key); return () => { count(h.unmounts, route.key); }; }, [route.key]);
    useSessionContinuationRestore(h.auth.role, read);
    return null;
  }
  const roleGroup = (role: Role) => {
    const Group = createStack(), Tabs = createTabs();
    const RoleTabs = () => createElement(Tabs.Navigator, null, ...TABS[role].map(name => createElement(Tabs.Screen, { key: name, name, component: Empty })));
    return function RoleGroup() {
      return createElement(Group.Navigator, null,
        createElement(Group.Screen, { name: '(tabs)', component: RoleTabs }),
        createElement(Group.Screen, { name: `${role}/booking-details`, component: RestoringScreen }),
        createElement(Group.Screen, { name: `${role}/chat`, component: RestoringScreen }));
    };
  };
  const RootStack = createStack();
  const ROOT_SCREENS: Record<string, unknown> = { index: RootIndex, '(client)': roleGroup('client'), '(worker)': roleGroup('worker') };
  // The production root layout's <Stack>: its Stack.Protected guards decide which screens the real root Stack has.
  const screensOf = (children: ReactNode): ReactNode[] => Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    const props = child.props as { name: string; guard?: boolean; children?: ReactNode };
    if (child.type === h.StackProtected) return props.guard ? screensOf(props.children) : [];
    if (child.type !== h.StackScreen) throw Error('unexpected root Stack child');
    return [createElement(RootStack.Screen, { key: props.name, name: props.name, component: ROOT_SCREENS[props.name] ?? Empty })];
  });
  // The focused leaf of the root state, for the URL hooks the root layout also reads.
  const leaf = (state: any): { name: string; params: Record<string, unknown> } => {
    const route = state?.routes?.[state.index ?? 0];
    if (!route) return { name: '', params: {} };
    if (route.state) return leaf(route.state);
    if (typeof route.params?.screen === 'string') return leaf({ routes: [{ name: route.params.screen, params: route.params.params }] });
    return { name: route.name, params: route.params ?? {} };
  };
  // Subscribed like expo-router's store-backed URL hooks: the root layout re-renders when the route changes.
  const url = () => {
    const { name, params } = leaf(core.useNavigationState((state: unknown) => state));
    return { pathname: !name || name === '__root' || name === 'index' || name.startsWith('(') ? '/' : '/' + name.replace(/\/index$/, ''), params };
  };
  // expo-router's <Redirect> replaces the dispatcher route; the role group then opens on `params.screen`.
  const replaceTarget = (href: any): [string, object] => {
    const { pathname, params = {} } = typeof href === 'string' ? { pathname: href } : href;
    const [, role, ...rest] = (pathname as string).split('/');
    const screen = `${role}/${rest.length ? rest.join('/') : 'index'}`;
    return [`(${role})`, TABS[role as Role]?.includes(screen) ? { screen: '(tabs)', params: { screen, params } } : { screen, params }];
  };
  h.impl = {
    Stack: ({ children }: { children?: ReactNode }) => createElement(RootStack.Navigator, null, ...screensOf(children)),
    useRootNavigationState: () => { const state = hook.useRootNavigationState(); h.rootStates.push(state); return state; },
    usePathname: () => url().pathname,
    useGlobalSearchParams: () => url().params,
    Redirect: ({ href }: { href: unknown }) => {
      const navigation = core.useNavigation(), done = useRef(false);
      useEffect(() => {
        if (done.current || !navigation.isFocused()) return;
        done.current = true;
        const [name, params] = replaceTarget(href);
        routingQueue.add({ type: 'REPLACE', target: navigation.getState().key, payload: { name, params } });
      }, [navigation, href]);
      return null;
    },
    // The restore hook's navigation, wrapped only to record the resets it dispatches.
    useNavigation: () => {
      const navigation = core.useNavigation();
      if (!h.wrappers.has(navigation)) h.wrappers.set(navigation, { ...navigation, reset: (payload: any) => { h.resets.push(payload); navigation.reset(payload); } });
      return h.wrappers.get(navigation);
    },
    useRoute: () => core.useRoute(),
    useIsFocused: () => core.useIsFocused(),
  };
});

async function mountApp(role: Role) {
  h.auth.role = role; h.auth.status = 'resolved';
  const documentHost = { nodeType: 9, activeElement: null, documentElement: {}, defaultView: null as any, addEventListener() {}, removeEventListener() {} };
  const windowHost = { document: documentHost, event: undefined, HTMLIFrameElement: class {} };
  documentHost.defaultView = windowHost;
  const container = { nodeType: 1, tagName: 'DIV', ownerDocument: documentHost, firstChild: null, lastChild: null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} };
  vi.stubGlobal('document', documentHost); vi.stubGlobal('window', windowHost); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const rendererModule: string = 'react-dom/client';
  const renderer = await import(/* @vite-ignore */ rendererModule);
  const root = renderer.createRoot(container) as Root; roots.push(root);
  const ref = core.createNavigationContainerRef();
  // The app as the installed ExpoRoot mounts it, with the root Stack holding the user's role group stack.
  installed.store.navigationRef = ref; installed.store.rootComponent = RootLayout;
  installed.store.state = { routes: [{ name: '__root', state: { routes: [{ name: `(${role})`, state: userStack(role) }] } }] };
  await act(async () => root.render(createElement(installed.ExpoRoot, { context: {} })));
  await settle();
  return ref;
}
const setAccountStatus = async (status: 'resolved' | 'pending') => {
  await act(async () => { h.auth.status = status; h.auth.version++; h.notify(); });
  await settle();
};
const rootStackOf = (ref: any) => ref.getRootState().routes[0].state;
const roleGroupOf = (ref: any, role: Role) => rootStackOf(ref).routes.find((route: any) => route.name === `(${role})`).state;
const chatObservation = (role: Role) => ({ access: role, ownerId: h.me, lifetime: h.lifetime as any, pathname: `/${role}/chat`, params: { bookingId: B } });

beforeEach(() => {
  sessionRouteContinuation.clear(); h.read = 'ready'; h.rootStates = []; h.resets = []; h.mounts.clear(); h.unmounts.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Option B root capture under the installed expo-router `__root` wrapper', () => {
  it.each(['client', 'worker'] as const)('%s: the actual root layout captures Bookings > Booking details > Chat from useRootNavigationState()', async role => {
    const observe = vi.spyOn(sessionRouteContinuation, 'observe');
    const ref = await mountApp(role);
    // (a) The installed ExpoRoot wraps the app's root layout in its own navigator, and the installed hook returns it.
    const outer = ref.getRootState();
    expect(outer.routes.map((route: any) => route.name)).toEqual(['__root']);
    expect(outer.routeNames).toEqual(['__root', '+not-found', '_sitemap']);
    const read = h.rootStates.at(-1);
    expect(read.routes[read.index ?? 0].name).toBe('__root');
    // (c) The focused role navigator and its parents, as the real routers hold them.
    expect(rootStackOf(ref).routes.map((route: any) => route.name)).toEqual([`(${role})`]);
    const group = roleGroupOf(ref, role);
    expect(group.routes.map((route: any) => route.name)).toEqual(['(tabs)', `${role}/booking-details`, `${role}/chat`]);
    expect(group.routes[0].state.routes[group.routes[0].state.index].name).toBe(`${role}/bookings`);
    // (b) What the production RootNavigator handed to the continuation store.
    const last = observe.mock.calls.at(-1)![0];
    console.log(`ROOT-CAPTURE ${role} ${JSON.stringify({ access: last.access, pathname: last.pathname, params: last.params, stack: last.stack })}`);
    expect(last).toMatchObject({ access: role, ownerId: h.me, pathname: `/${role}/chat`, params: { bookingId: B } });
    expect(last.stack).toEqual(expectedChain(role));
  });

  it.each(['client', 'worker'] as const)('%s: a same-session refresh re-entry fed by the real capture rebuilds both Chat parents beneath the kept Chat', async role => {
    const observe = vi.spyOn(sessionRouteContinuation, 'observe');
    const ref = await mountApp(role);
    sessionRouteContinuation.rememberChatAnchor(chatObservation(role), { bookingId: B, messageId: ANCHOR, offset: 12 });
    const before = [...h.mounts.keys()];
    // 1. Account recheck: the root layout renders its pending state, so the whole root Stack unmounts.
    await setAccountStatus('pending');
    expect(observe.mock.calls.at(-1)![0].access).toBe('account-pending');
    expect(before.map(key => h.unmounts.get(key))).toEqual(before.map(() => 1));
    // 2. Fresh resolved access: the actual dispatcher redirects to the saved Chat, which re-enters alone while its own
    //    read is in flight (the state the device showed).
    h.read = 'pending';
    await setAccountStatus('resolved');
    const landed = roleGroupOf(ref, role);
    expect(landed.routes.map((route: any) => [route.name, route.params])).toEqual([[`${role}/chat`, { bookingId: B }]]);
    expect(observe.mock.calls.at(-1)![0]).toMatchObject({ access: role, pathname: `/${role}/chat`, params: { bookingId: B } });
    expect(h.resets).toEqual([]);
    // 3. Chat's read passes: the actual restore hook rebuilds the saved parents beneath it.
    await act(async () => { h.read = 'ready'; h.notify(); });
    await settle();
    const group = roleGroupOf(ref, role);
    console.log(`ROOT-REENTRY ${role} ${JSON.stringify({ outcome: sessionRouteContinuation.lastRestoreOutcome(), resets: h.resets,
      root: rootStackOf(ref).routes.map((route: any) => route.name), group: group.routes.map((route: any) => [route.name, route.params]), index: group.index })}`);
    expect(sessionRouteContinuation.lastRestoreOutcome()).toBe('unconfirmed');
    const chat = group.routes[group.routes.length - 1];
    expect(h.resets).toEqual([{ index: 2, routes: [
      { name: '(tabs)', params: { screen: `${role}/bookings` } },
      { name: `${role}/booking-details`, params: { bookingId: B } },
      expect.objectContaining({ key: chat.key, name: `${role}/chat`, params: { bookingId: B } }),
    ] }]);
    expect(rootStackOf(ref).routes.map((route: any) => route.name)).toEqual([`(${role})`]);
    expect(group.index).toBe(2);
    expect(group.routes.map((route: any) => [route.name, route.params])).toEqual([
      ['(tabs)', { screen: `${role}/bookings` }], [`${role}/booking-details`, { bookingId: B }], [`${role}/chat`, { bookingId: B }]]);
    // The Bookings tab is the one selected under the rebuilt tab shell.
    const tabs = group.routes[0].state;
    expect(tabs.routes[tabs.index].name).toBe(`${role}/bookings`);
    // The re-entered Chat route is kept: mounted once, never remounted by the reset.
    expect(chat.key).toBe(landed.routes[0].key);
    expect(before).not.toContain(chat.key);
    expect(h.mounts.get(chat.key)).toBe(1); expect(h.unmounts.get(chat.key) ?? 0).toBe(0);
    // The destination identity is retained, and the root now observes the rebuilt chain beneath it.
    const last = observe.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ access: role, pathname: `/${role}/chat`, params: { bookingId: B } });
    expect(last.stack).toEqual(expectedChain(role));
    expect(sessionRouteContinuation.takeParentChain(chatObservation(role))).toBeNull();
    expect(sessionRouteContinuation.takeChatAnchor(chatObservation(role), B)).toEqual({ bookingId: B, messageId: ANCHOR, offset: 12 });
    expect(sessionRouteContinuation.takeChatAnchor(chatObservation(role), B)).toBeNull();
    expect(h.resets).toHaveLength(1);
  });

  it('pins the production capture entry point and the installed modules executed above', () => {
    const layout: string = readFileSync(`${process.cwd()}/src/app/_layout.tsx`, 'utf8');
    expect(layout).toMatch(/import \{[^}]*\buseRootNavigationState\b[^}]*\} from 'expo-router';/);
    expect(layout).toContain('const navigationState = useRootNavigationState();');
    expect(layout).toContain('const stack = useMemo(() => stackFromNavigationState(navigationState), [navigationState]);');
    expect(layout).toContain('sessionRouteContinuation.observe({ access, ownerId, lifetime: sessionValue.sessionLifetime, pathname, params, stack });');
    // `useRootNavigationState` from 'expo-router' is the hook module executed above.
    expect(routerFile('index.js')).toContain('__exportStar(require("./exports"), exports);');
    expect(routerFile('exports.js')).toContain('return hooks_1.useRootNavigationState;');
    expect(routerFile('hooks/index.js')).toContain('require("./useRootNavigationState")');
    // `react-navigation/native` is the vendored core plus web/linking extras, none of which these modules use.
    const native = routerFile('react-navigation/native/index.js');
    expect(native).toContain('__exportStar(require("../core"), exports);');
    expect(native).not.toMatch(/exports\.(useNavigation|useNavigationBuilder|StackRouter|createNavigatorFactory)\b/);
    // The navigators above use the app's own file-route names.
    for (const role of ['client', 'worker'] as const) {
      const files = [`(tabs)/${role}/bookings.tsx`, `${role}/booking-details.tsx`, `${role}/chat.tsx`, '_layout.tsx', '(tabs)/_layout.tsx'];
      for (const file of files) expect(existsSync(`${process.cwd()}/src/app/(${role})/${file}`), file).toBe(true);
      const tabsLayout: string = readFileSync(`${process.cwd()}/src/app/(${role})/(tabs)/_layout.tsx`, 'utf8');
      for (const tab of TABS[role]) expect(tabsLayout).toContain(`name="${tab}"`);
      expect(readFileSync(`${process.cwd()}/src/app/(${role})/_layout.tsx`, 'utf8')).toContain('<Stack.Screen name="(tabs)"');
    }
  });
});

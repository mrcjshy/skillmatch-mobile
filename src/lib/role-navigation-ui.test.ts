// @ts-expect-error -- Node-only static composition harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
type Modules = Record<string, Props>;
const source = (path: string): string => readFileSync(path, 'utf8');
const noop = () => undefined;
const node = (type: unknown, props: Props): Element => ({ type, props });
const native = Object.fromEntries(['Text', 'View', 'ScrollView', 'Pressable', 'KeyboardAvoidingView', 'Modal', 'TextInput', 'ActivityIndicator', 'RefreshControl'].map(name => [name, name]));

// Execute actual TSX with inert framework/provider seams; never mount a native
// navigator or run passive/layout effects. This proves configuration/composition.
function load(path: string, seams: Modules = {}): Props {
  const raw = source(path);
  const defaults: Modules = {
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    react: { useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, noop], useRef: (value: unknown) => ({ current: value }), useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn, useEffect: noop, useLayoutEffect: noop },
    'react-native': { ...native, StyleSheet: { create: (value: unknown) => value }, Platform: { OS: 'android', select: (choices: Props) => choices.default } },
    'expo-router': { Stack: Object.assign('Stack', { Screen: 'Stack.Screen' }), Tabs: Object.assign('Tabs', { Screen: 'Tabs.Screen' }), useRouter: () => ({ push: noop }), useFocusEffect: noop },
    'expo-symbols': { SymbolView: 'SymbolView' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 37, bottom: 21 }) },
    '@/global.css': {},
    '@/providers/account-provider': { useAccount: () => ({ account: { id: 'client-id', role: 'client', is_active: true }, status: 'resolved', hasCurrentConsent: true }) },
    '@/providers/session-provider': { useSession: () => ({ session: { user: { id: 'client-id' } }, isSessionLoading: false, sessionError: null, recoveryStatus: 'idle' }) },
  };
  const exports: Props = {};
  const requireSeam = (id: string): Props => {
    if (seams[id]) return seams[id];
    if (defaults[id]) return defaults[id];
    if (id === '@/constants/theme') return load('src/constants/theme.ts');
    const named = ts.preProcessFile(raw).importedFiles.some(item => item.fileName === id);
    if (!named) throw new Error(`Unapproved import: ${id}`);
    // Leaf UI is kept inert; business/data functions must be explicitly supplied.
    if (id.startsWith('@/components/') || id.startsWith('@/providers/')) {
      const names = [...raw.matchAll(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g)].filter(match => match[2] === id).flatMap(match => match[1].split(',').map(name => name.trim()).filter(name => !name.startsWith('type ')));
      return Object.fromEntries(names.map(name => [name, name]));
    }
    throw new Error(`Missing inert business seam: ${id}`);
  };
  const output = ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', output)(requireSeam, exports);
  return exports;
}
function render(path: string, seams: Modules = {}, props: Props = {}): Element { return (load(path, seams).default as (props: Props) => Element)(props); }
function descendants(element: unknown): Element[] {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(descendants);
  const current = element as Element;
  return current.props ? [current, ...descendants(current.props.children)] : [];
}
function invoke(element: Element): Element { return (element.type as (props: Props) => Element)(element.props); }
const ui = load('src/constants/theme.ts').SkillMatchTheme as { ui: { colors: Record<string, string>; type: { caption: Props }; size: { tabIcon: number } } };
const colors = ui.ui.colors;
const roleTabs = (role: string) => render(`src/app/(${role})/(tabs)/_layout.tsx`);
const navigator = (tree: Element, kind: string) => descendants(tree).find(item => String(item.type) === kind)!;
const options = (tree: Element, route: Element): Props => ({ ...navigator(tree, 'Tabs').props.screenOptions as Props, ...route.props.options as Props });

describe('role navigation static composition (not native runtime)', () => {
  it.each(['client', 'worker'])('%s Home has one navigation-owned light header and its existing role bell', role => {
    const tree = roleTabs(role);
    const home = descendants(tree).find(item => item.props.name === `${role}/index`)!;
    const effective = options(tree, home);
    expect(effective.headerShown).toBe(true);
    expect(effective.title).toBe('Home');
    expect(effective.headerStyle).toEqual({ backgroundColor: colors.background });
    expect(effective.headerTintColor).toBe(colors.textPrimary);
    const configuredBell = (effective.headerRight as () => Element)();
    expect(configuredBell.type).toBe('NotificationBell');
    expect(configuredBell.props.role).toBe(role);
    const push = vi.fn();
    const bell = load('src/components/notification-bell.tsx', { 'expo-router': { useRouter: () => ({ push }) } });
    const output = (bell.NotificationBell as (props: Props) => Element)(configuredBell.props);
    expect(output.props.accessibilityLabel).toBe('Notifications');
    expect(output.props.accessibilityRole).toBe('button');
    (output.props.onPress as () => void)();
    expect(push).toHaveBeenCalledExactlyOnceWith(`/${role}/notifications`);
    expect(effective.headerLeft).toBeUndefined();
    expect(effective.headerTitleStyle).toBeUndefined();
  });
});

describe('role Stack light styling and parent ownership', () => {
  it.each(['client', 'worker'])('%s keeps tabs headerless and pushed screens on normal Stack Back', role => {
    const tree = render(`src/app/(${role})/_layout.tsx`);
    const stack = navigator(tree, 'Stack');
    expect(stack.props.screenOptions).toEqual({ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.textPrimary, contentStyle: { backgroundColor: colors.background } });
    expect(descendants(tree).filter(item => item.type === 'Stack.Screen').map(item => item.props)).toEqual([{ name: '(tabs)', options: { headerShown: false } }]);
    expect(descendants(tree).filter(item => item.type === 'PushNotificationRegistration').map(item => item.props.role)).toEqual([role]);
  });
});

describe('JS Tabs retain configuration and scaling', () => {
  it.each(['client', 'worker'])('%s preserves route order, icons, labels, providers and navigator focus', role => {
    const tree = roleTabs(role);
    expect(String(tree.type)).toBe(role === 'client' ? 'Tabs' : 'WorkerProfileProvider');
    expect(navigator(tree, 'Tabs').props.backBehavior).toBe('initialRoute');
    const routes = descendants(tree).filter(item => item.type === 'Tabs.Screen');
    expect(routes.map(item => item.props.name)).toEqual(role === 'client' ? ['client/index', 'client/jobs', 'client/bookings', 'client/profile'] : ['worker/index', 'worker/opportunities', 'worker/bookings', 'worker/profile']);
    const expected = role === 'client' ? ['Home', 'My Jobs', 'Bookings', 'Profile'] : ['Home', 'Bookings', 'Profile'];
    const visible = routes.filter(route => (route.props.options as Props).href !== null);
    for (const [index, route] of visible.entries()) {
      const effective = options(tree, route);
      expect(effective.tabBarAccessibilityLabel).toBe(expected[index]);
      expect(effective.title).toBe(expected[index]);
      const expectedIcon = index === 0 ? { android: 'home', ios: 'house.fill' } : expected[index] === 'My Jobs' ? { android: 'list_alt', ios: 'list.bullet.rectangle' } : expected[index] === 'Bookings' ? { android: 'event_list', ios: 'calendar' } : { android: 'person', ios: 'person.fill' };
      for (const focused of [false, true]) {
        const color = focused ? colors.primary : colors.textDisabled;
        const label = invoke((effective.tabBarLabel as (props: Props) => Element)({ focused, color }));
        expect(label.props.children).toBe(expected[index]);
        expect(label.props.style).toEqual({ ...ui.ui.type.caption, color, fontWeight: focused ? '700' : '400' });
        expect(label.props.allowFontScaling).toBeUndefined();
        expect(label.props.maxFontSizeMultiplier).toBeUndefined();
        expect(label.props.numberOfLines).toBeUndefined();
        expect(label.props.accessibilityState).toBeUndefined();
        const icon = invoke((effective.tabBarIcon as (props: Props) => Element)({ focused, color }));
        expect(icon.props).toEqual({ name: expectedIcon, size: ui.ui.size.tabIcon, tintColor: color });
      }
      expect(effective.tabBarButton).toBeUndefined();
      expect((effective.tabBarStyle as Props).height).toBeUndefined();
      expect(effective.tabBarAllowFontScaling).toBeUndefined();
    }
    if (role === 'worker') expect(routes[1].props.options).toEqual({ href: null, headerShown: false });
    const effective = options(tree, visible[0]);
    const label = invoke((effective.tabBarLabel as (props: Props) => Element)({ focused: false, color: colors.textDisabled }));
    const long = (label.type === 'Text') && invoke({ type: ((effective.tabBarLabel as (props: Props) => Element)({ focused: false, color: colors.textDisabled })).type, props: { focused: false, color: colors.textDisabled, children: 'A very long localized tab label that requires system text scaling' } });
    expect(long && long.props.children).toBe('A very long localized tab label that requires system text scaling');
  });
});

function homeSeams(role: string): Modules {
  return {
    '@/providers/account-provider': { useAccount: () => ({ account: { id: `${role}-id`, full_name: 'Alex With A Very Long Family Name For Larger Text', role, is_active: true } }) },
    '@/providers/client-jobs-provider': { useClientJobs: () => ({ isLoading: false, loadError: null, skills: [], jobs: [], refresh: noop }) },
    '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => ({ isPosting: false, isOwnerCurrent: () => true, takePendingCreatedJob: () => null }) },
    '@/lib/date-time': { formatCardDateTime: noop },
    '@/providers/worker-profile-provider': { useWorkerProfile: () => ({ availability: 'busy', isLoading: false, isVerified: true, refreshPersistedAvailability: noop }) },
    '@/lib/booking-records': { loadClientBookings: noop, loadWorkerBookings: noop },
    '@/lib/client-home-booking-focus': { createClientHomeBookingFocus: () => ({ refresh: noop, cancel: noop }) },
    '@/lib/home-greeting': { homeGreeting: () => 'Good evening' },
    '@/lib/initials': { firstNameFromFullName: () => 'Alex' },
    '@/lib/job-location': { COPY: {}, initialJobPin: null },
    '@/lib/job-photos': { JOB_PHOTO_SLOTS: [] },
    '@/lib/job-payment': {},
    '@/lib/job-posting-schedule': {},
    '@/lib/post-job-wizard': {},
    '@/lib/recent-locations': {},
    '@/lib/job-opportunities': {},
    '@/lib/realtime': {},
    '@/lib/worker-identity': { workerHomeIdentityNotice: () => 'none' },
  };
}

describe('Home chrome removal preserves content composition', () => {
  it.each(['client', 'worker'])('%s has no custom HomeHeader or extra top inset and retains greeting/actions', role => {
    const path = `src/app/(${role})/(tabs)/${role}/index.tsx`;
    const tree = render(path, homeSeams(role));
    expect(descendants(tree).filter(item => item.type === 'HomeHeader')).toHaveLength(0);
    expect(source(path)).not.toContain('HomeHeader');
    const text = descendants(tree).filter(item => item.type === 'Text').map(item => item.props.children);
    expect(text).toContain('Good evening');
    expect(text).toContain('Alex');
    const scroll = descendants(tree).find(item => item.type === 'ScrollView')!;
    expect((scroll.props.contentContainerStyle as Props).paddingTop).toBeUndefined();
    expect((scroll.props.contentContainerStyle as Props).paddingBottom).toBe(48);
    expect(descendants(tree).filter(item => item.type === 'ActiveBookingHomeCard')).toHaveLength(1);
    if (role === 'client') {
      expect(descendants(tree).filter(item => item.type === 'AppButton').length).toBeGreaterThan(0);
      expect(source('src/components/client-post-job-screen.tsx')).toContain('paddingTop: insets.top + spacing.lg'); // moved modal-specific inset
      expect(source('src/components/client-post-job-screen.tsx')).toContain('keyboardShouldPersistTaps="handled"');
    } else expect(descendants(tree).filter(item => item.type === 'AvailabilityControl')).toHaveLength(1);
  });
});

describe('actual Client push callbacks with inert history (not Android Back)', () => {
  function history(origin: string) {
    const entries: unknown[] = [origin];
    const push = vi.fn((target: unknown) => entries.push(target));
    return { push, entries, back: () => { entries.pop(); return entries.at(-1); } };
  }
  it('Bookings card pushes its booking ID and mocked history returns to Bookings', () => {
    const navigation = history('/client/bookings');
    const booking = { booking_id: 'booking-from-list', job_id: 'job-from-list', booking_status: 'confirmed' };
    let state = 0;
    const tree = render('src/components/my-bookings-list.tsx', {
      react: { useState: (initial: unknown) => { const index = state++; return [index === 2 ? [booking] : index === 3 ? false : typeof initial === 'function' ? initial() : initial, noop]; }, useRef: (value: unknown) => ({ current: value }), useCallback: (fn: unknown) => fn, useLayoutEffect: noop },
      'expo-router': { useRouter: () => ({ push: navigation.push }), useFocusEffect: noop },
      '@/providers/account-provider': { useAccount: () => ({ account: { id: 'client-id' } }) },
      '@/lib/bookings': {},
      '@/lib/booking-records': { bookingsForSegment: (rows: unknown) => rows },
      '@/lib/booking-refresh-coordinator': { createBookingRefreshCoordinator: () => ({}) },
      '@/lib/realtime': {},
    }, { role: 'client' });
    const card = descendants(tree).find(item => item.type === 'BookingCompactCard')!;
    expect(card.props.booking).toBe(booking);
    (card.props.onPress as () => void)();
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith({ pathname: '/client/booking-details', params: { bookingId: 'booking-from-list' } });
    expect(navigation.back()).toBe('/client/bookings');
  });
  it('Home acceptance onNavigate pushes its booking ID and mocked history returns to Home', () => {
    const navigation = history('/client');
    const focusCallbacks: (() => unknown)[] = [];
    let acceptance: ((bookingId: string) => void) | undefined;
    const refresh = vi.fn();
    const cancel = vi.fn();
    const createFocus = vi.fn((options: Props) => { acceptance = options.onNavigate as (bookingId: string) => void; return { refresh, cancel }; });
    render('src/app/(client)/(tabs)/client/index.tsx', {
      ...homeSeams('client'),
      'expo-router': { useRouter: () => ({ push: navigation.push }), useFocusEffect: (callback: () => unknown) => focusCallbacks.push(callback) },
      '@/lib/client-home-booking-focus': { createClientHomeBookingFocus: createFocus },
    });
    expect(focusCallbacks).toHaveLength(1);
    const cleanup = focusCallbacks[0]() as () => void;
    expect(createFocus).toHaveBeenCalledOnce();
    expect(createFocus.mock.calls[0][0].clientId).toBe('client-id');
    expect(refresh).toHaveBeenCalledOnce();
    acceptance!('booking-from-acceptance');
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith({ pathname: '/client/booking-details', params: { bookingId: 'booking-from-acceptance' } });
    expect(navigation.back()).toBe('/client');
    cleanup();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('missing account does not arm a Client Home acceptance watcher', () => {
    let callback!: () => void;
    const createFocus = vi.fn();
    render('src/app/(client)/(tabs)/client/index.tsx', {
      ...homeSeams('client'),
      '@/providers/account-provider': { useAccount: () => ({ account: null }) },
      'expo-router': { useRouter: () => ({ push: noop }), useFocusEffect: (fn: () => void) => { callback = fn; } },
      '@/lib/client-home-booking-focus': { createClientHomeBookingFocus: createFocus },
    });
    callback();
    expect(createFocus).not.toHaveBeenCalled();
  });
});

describe('long secondary titles and token-derived contrast', () => {
  it.each(['client', 'worker'])('%s secondary Help title keeps default typography and Back', role => {
    const title = 'Help and frequently asked questions with a long localized navigation title';
    const tree = render(`src/app/(${role})/${role}/help.tsx`, { '@/lib/faq': { FAQ_COPY: { title } } });
    const overrides = descendants(tree).find(item => item.type === 'Stack.Screen')!.props.options as Props;
    expect(overrides).toEqual({ title });
    const defaults = navigator(render(`src/app/(${role})/_layout.tsx`), 'Stack').props.screenOptions as Props;
    expect({ ...defaults, ...overrides }).toMatchObject({ title, headerTintColor: colors.textPrimary });
    expect(defaults.headerLeft).toBeUndefined();
    expect(defaults.headerTitleStyle).toBeUndefined();
  });
  it.each(['client', 'worker'])('%s tab sizing/typography consume ui tokens rather than numeric copies', role => {
    const themed = { ...ui, ui: { ...ui.ui, type: { ...ui.ui.type, caption: { fontSize: 19, lineHeight: 27, fontWeight: '500' } }, size: { tabIcon: 31 } } };
    const tree = render(`src/app/(${role})/(tabs)/_layout.tsx`, { '@/constants/theme': { SkillMatchTheme: themed } });
    const route = descendants(tree).find(item => item.props.name === `${role}/index`)!;
    const effective = options(tree, route);
    expect(invoke((effective.tabBarIcon as (props: Props) => Element)({ color: colors.primary })).props.size).toBe(31);
    expect(invoke((effective.tabBarLabel as (props: Props) => Element)({ focused: false, color: colors.primary })).props.style).toMatchObject({ fontSize: 19, lineHeight: 27, fontWeight: '400' });
  });
  it.each(['client', 'worker'])('%s composed header/tab colors exceed text and icon contrast thresholds', role => {
    const tree = roleTabs(role);
    const route = descendants(tree).find(item => item.props.name === `${role}/index`)!;
    const effective = options(tree, route);
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return r * 0.2126 + g * 0.7152 + b * 0.0722;
    };
    const contrast = (foreground: string, background: string) => {
      const a = luminance(foreground), b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    expect(contrast(effective.headerTintColor as string, (effective.headerStyle as Props).backgroundColor as string)).toBeGreaterThanOrEqual(4.5);
    const background = (effective.tabBarStyle as Props).backgroundColor as string;
    for (const tint of [effective.tabBarActiveTintColor, effective.tabBarInactiveTintColor]) expect(contrast(tint as string, background)).toBeGreaterThanOrEqual(4.5);
  });
});

 describe('Client account subtree ownership', () => {
  it('revokes the old lifetime on loss, never revives it for same-account reentry, and ignores token refresh alone', () => {
    let memo: unknown, memoDependency: unknown, effectDependency: unknown;
    let cleanup: (() => void) | undefined;
    let account: Props | null = { id: 'client-id', role: 'client', is_active: true };
    let session: Props | null = { user: { id: 'client-id' }, access_token: 'original' };
    const layout = load('src/app/(client)/_layout.tsx', {
      react: {
        useMemo: (fn: () => unknown, [dependency]: unknown[]) => {
          if (memoDependency !== dependency) { memo = fn(); memoDependency = dependency; }
          return memo;
        },
        useLayoutEffect: (fn: () => (() => void) | undefined, [dependency]: unknown[]) => {
          if (effectDependency !== dependency) { cleanup?.(); cleanup = fn(); effectDependency = dependency; }
        },
      },
      '@/providers/account-provider': { useAccount: () => ({ account, status: 'resolved', hasCurrentConsent: true }) },
      '@/providers/session-provider': { useSession: () => ({ session, isSessionLoading: false, sessionError: null, recoveryStatus: 'idle' }) },
    }).default as () => Element | null;
    const first = layout()!; const oldGuard = first.props.isOwnerCurrent as () => boolean;
    expect(oldGuard()).toBe(true);
    session = { user: { id: 'client-id' }, access_token: 'refreshed' };
    expect(layout()!.props.isOwnerCurrent).toBe(oldGuard); expect(oldGuard()).toBe(true);
    session = null; expect(layout()).toBeNull(); expect(oldGuard()).toBe(false);
    session = { user: { id: 'client-id' } };
    const next = layout()!; const currentGuard = next.props.isOwnerCurrent as () => boolean;
    expect(currentGuard).not.toBe(oldGuard); expect(oldGuard()).toBe(false); expect(currentGuard()).toBe(true);
    cleanup!(); expect(currentGuard()).toBe(false);
    account = { id: 'other-client', role: 'client', is_active: true };
    expect(layout()).toBeNull(); expect(oldGuard()).toBe(false);
  });
  it.each([
    { status: 'pending' }, { hasCurrentConsent: false },
    { account: { id: 'client-id', role: 'worker', is_active: true } },
    { account: { id: 'client-id', role: 'client', is_active: false } },
  ])('does not expose providers for unauthorized state %j', override => {
    expect(render('src/app/(client)/_layout.tsx', {
      '@/providers/account-provider': { useAccount: () => ({ account: { id: 'client-id', role: 'client', is_active: true }, status: 'resolved', hasCurrentConsent: true, ...override }) },
    })).toBeNull();
  });
  it('keeps one jobs provider below the route gate while draft memory is owned above route removal', () => {
    const tree = render('src/app/(client)/_layout.tsx');
    const jobs = descendants(tree).filter(item => item.type === 'ClientJobsProvider');
    const drafts = descendants(tree).filter(item => item.type === 'ClientPostJobDraftProvider');
    expect(jobs).toHaveLength(1); expect(drafts).toHaveLength(0);
    expect(jobs[0].props.ownerId).toBe('client-id');
    expect((jobs[0].props.isOwnerCurrent as () => boolean)()).toBe(true);
    expect(descendants(jobs[0]).some(item => String(item.type) === 'Stack')).toBe(true);
    expect(descendants(roleTabs('client')).some(item => item.type === 'ClientJobsProvider')).toBe(false);
  });
  it('the live Client jobs guard rejects a new revision before render or passive cleanup', () => {
    let revision = 1;
    const tree = render('src/app/(client)/_layout.tsx', {
      '@/providers/session-provider': { useSession: () => ({ session: { user: { id: 'client-id' } }, isSessionLoading: false, sessionError: null, recoveryStatus: 'idle', sessionRevision: 1, isSessionRevisionCurrent: (candidate: number) => candidate === revision }) },
    });
    const guard = tree.props.isOwnerCurrent as () => boolean;
    expect(guard()).toBe(true); revision++; expect(guard()).toBe(false);
  });
});


describe('Client Job Details native-title route contract (offline composition)', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  it.each([id, undefined, '', [id], [id, id], 'not-a-uuid', id.toUpperCase().replace('11111111', 'ABCDEFAB')].map(jobId => ({ jobId })))('passes only a single canonical UUID to the detail caller: %j', ({ jobId }) => {
    const tree = render('src/app/(client)/client/job-details.tsx', {
      'expo-router': { Stack: Object.assign('Stack', { Screen: 'Stack.Screen' }), useLocalSearchParams: () => ({ jobId }) },
      '@/components/client-job-details': { __esModule: true, default: 'ClientJobDetails' },
    });
    expect(descendants(tree).find(e => e.type === 'Stack.Screen')!.props.options).toEqual({ title: 'Job Details' });
    expect(descendants(tree).find(e => e.type === 'ClientJobDetails')!.props).toEqual({ jobId: jobId === id ? id : null });
  });
  it('keeps native history/back ownership without a hardcoded destination', () => {
    const tree = render('src/app/(client)/client/job-details.tsx', {
      'expo-router': { Stack: Object.assign('Stack', { Screen: 'Stack.Screen' }), useLocalSearchParams: () => ({ jobId: id }) },
      '@/components/client-job-details': { __esModule: true, default: 'ClientJobDetails' },
    });
    const options = descendants(tree).find(e => e.type === 'Stack.Screen')!.props.options as Props;
    expect(options.headerLeft).toBeUndefined(); expect(options.headerBackVisible).toBeUndefined();
    expect(descendants(tree).filter(e => e.type === 'AppButton')).toHaveLength(0);
  });
});

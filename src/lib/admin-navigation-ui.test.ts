import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminLayout from '../app/(admin)/_layout';
import { SkillMatchTheme } from '../constants/theme';
import AdminHome from '../app/(admin)/(tabs)/admin/index';
import type { AdminAnalyticsSummary, AdminAnalyticsView } from './admin-analytics';

vi.mock('@/components/refinement-theme', () => ({
  useUiTheme: () => SkillMatchTheme.ui,
  RefinementThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

const seams = vi.hoisted(() => ({
  cells: [] as unknown[], cursor: 0, push: vi.fn(), signOut: vi.fn(), refresh: vi.fn(),
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = seams.cursor++;
    if (!(index in seams.cells)) seams.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [seams.cells[index], (value: unknown) => { seams.cells[index] = value; }];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: () => undefined,
}));
vi.mock('@/providers/account-provider', () => ({ useAccount: () => ({
  status: 'resolved', account: { id: 'admin-1', role: 'administrator', is_active: true, full_name: 'Alma Reyes Santos' },
}) }));
vi.mock('@/providers/session-provider', () => ({ useSession: () => ({ session: { user: { id: 'admin-1' } } }) }));
vi.mock('@/lib/sign-out', () => ({ signOutCurrentUser: () => seams.signOut() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/lib/admin-analytics', async (importOriginal) => ({
  ...await importOriginal<typeof import('./admin-analytics')>(),
  AdminAnalyticsCoordinator: class {
    refresh() { seams.refresh(); }
  },
}));
// The shared sticky header (greeting, date, bell) has its own tests; here it is an inert host.
vi.mock('@/components/home-header', () => ({ HomeStickyHeader: 'HomeStickyHeader' }));

vi.mock('@/global.css', () => ({}));
vi.mock('expo-font', () => ({ useFonts: () => [true] }));
vi.mock('expo-symbols/androidWeights/regular', () => ({ default: { name: 'MaterialSymbols_400Regular', font: 1 } }));
vi.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
vi.mock('react-native', () => ({
  Platform: { select: (options: Record<string, unknown>) => options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl',
  ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable',
  useWindowDimensions: () => ({ fontScale: 1, width: 1080, height: 2400 }),
}));
vi.mock('expo-router', () => ({
  Stack: Object.assign('Stack', { Screen: 'Stack.Screen' }),
  useRouter: () => ({ push: seams.push }), useFocusEffect: () => undefined,
}));
vi.mock('@/components/push-notification-registration', () => ({
  PushNotificationRegistration: 'PushNotificationRegistration',
}));

type Props = Record<string, unknown> & { children?: ReactNode };
function elements(node: ReactNode): ReactElement<Props>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<Props>(child)) return [];
    return [child, ...elements(child.props.children)];
  });
}
// Evaluate real stateless components down to inert native host output. This is
// composition/callback evidence, not React reconciliation or device behavior.
function composed(node: ReactNode): ReactElement<Props>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<Props>(child)) return [];
    if (typeof child.type === 'function') {
      return composed((child.type as (props: Props) => ReactNode)(child.props));
    }
    const nested = Object.entries(child.props).filter(([key, value]) => key !== 'children' && isValidElement(value)).map(([, value]) => value) as ReactNode[];
    return [child, ...composed(child.props.children), ...nested.flatMap((value) => composed(value))];
  });
}
function text(nodes: ReactElement<Props>[]) {
  return nodes.filter((node) => node.type === ('Text' as unknown))
    .map((node) => Children.toArray(node.props.children).join(''));
}
function button(nodes: ReactElement<Props>[], label: string) {
  const result = nodes.find((node) => node.props.accessibilityLabel === label);
  expect(result).toBeDefined();
  return result!;
}
function press(nodes: ReactElement<Props>[], label: string) {
  (button(nodes, label).props.onPress as () => void)();
}
const bucket = { pending: 1, paid: 2, refunded: 0, unset: 0 };
const snapshot: AdminAnalyticsSummary = {
  asOf: '2026-09-23T02:12:26Z', totalWorkers: 1234567, verifiedWorkers: 3,
  totalClients: 4, pendingWorkerVerifications: 2, completedBookings: 3,
  jobsByStatus: { open: 2, matched: 1, completed: 3, cancelled: 0, unset: 0 },
  bookingsByStatus: { pending: 1, confirmed: 2, completed: 3, cancelled: 0, no_show: 0 },
  paymentsByMethodStatus: { gcash: bucket, maya: bucket, qrph: bucket, cod: bucket, unset: bucket },
  reportsByStatus: { submitted: 1, under_review: 2, resolved: 3, dismissed: 0 }, reportsNeedingAttention: 3,
};
const view: AdminAnalyticsView = {
  ownerId: 'admin-1', snapshot, loading: false, refreshing: false, error: null,
};
const ID_REVIEWS = 'ID reviews, 2 Workers waiting for review';
const REPORTS = 'Reports, 3 reports need attention';
function home() {
  seams.cursor = 0;
  return composed(AdminHome());
}

describe('Admin navigation configuration (static composition, not native layout)', () => {
  beforeEach(() => {
    vi.clearAllMocks(); seams.cells = []; seams.cursor = 0;
    seams.signOut.mockResolvedValue({ error: null });
  });
  it('mounts the tab shell headerless in a light, centered-title Admin Stack', () => {
    const tree = elements(AdminLayout());
    const stack = tree.find((node) => node.props.screenOptions !== undefined)!;
    expect(stack.props.screenOptions).toMatchObject({
      headerTitleAlign: 'center', headerShadowVisible: false, statusBarStyle: 'dark',
      headerStyle: { backgroundColor: SkillMatchTheme.ui.colors.canvas },
      headerTintColor: SkillMatchTheme.ui.colors.textPrimary,
      contentStyle: { backgroundColor: SkillMatchTheme.ui.colors.canvas },
    });
    expect(stack.props.screenOptions).not.toHaveProperty('headerLeft');
    expect(stack.props.screenOptions).not.toHaveProperty('headerRight');
    const shell = tree.filter((node) => node.props.name === '(tabs)');
    expect(shell).toHaveLength(1);
    expect(shell[0].props.options).toEqual({ headerShown: false });
    expect(tree.filter((node) => node.props.name === 'admin/index')).toHaveLength(0);
  });
  it('replaces the dashboard title and button list with attention rows, plain counts and a quiet account section', () => {
    seams.cells[0] = view;
    const nodes = home();
    const header = nodes.find((node) => node.type === ('HomeStickyHeader' as unknown))!;
    // Wave 7: the greeting addresses the role, not the stored account name (presentation only).
    expect(header.props).toMatchObject({ name: 'Admin', role: 'admin' });
    const strings = text(nodes);
    expect(strings).not.toContain('Admin Dashboard');
    for (const removed of ['Inbox', 'Directories', 'Overview', 'Total Workers', 'Open ID reviews', 'Open Reports', 'Sign Out']) {
      expect(strings).not.toContain(removed);
    }
    expect(strings).toEqual(expect.arrayContaining([
      'Needs attention', 'ID reviews', '2 Workers waiting for review', '2 waiting',
      'Reports', '3 reports need attention', '3 open',
      'Platform summary', 'Workers', '1,234,567', '3 verified', 'Bookings', '3 completed',
      'Payments', 'QR Ph (PayMongo TEST)', 'Pending 1 · Paid 2 · Refunded 0 · Not set 0',
      'Reports by status', 'Account', 'Signed in as', 'Alma Reyes Santos', 'Sign out',
    ]));
    // Attention comes before the summary, and the account section is last.
    expect(strings.indexOf('Needs attention')).toBeLessThan(strings.indexOf('Platform summary'));
    expect(strings.indexOf('Platform summary')).toBeLessThan(strings.indexOf('Account'));
    expect(nodes.filter((node) => node.props.accessibilityLabel === 'Sign out')).toHaveLength(1);
  });
  it('registers every secondary Admin screen as a pushed Stack screen with a sentence-case title', () => {
    const nodes = elements(AdminLayout());
    expect(nodes.filter((node) => node.props.name && node.props.name !== '(tabs)')
      .map((node) => [node.props.name, node.props.options])).toEqual([
      ['admin/notifications', { title: 'Notifications' }],
      ['admin/user-detail', { title: 'Account details' }],
      ['admin/identity-reviews', { title: 'ID reviews' }],
      ['admin/verification-details', { title: 'ID review' }],
      ['admin/report-details', { title: 'Report details' }],
    ]);
    expect(nodes.filter((node) => node.props.role === 'administrator')).toHaveLength(1);
    for (const node of nodes.filter((entry) => entry.props.options !== undefined)) {
      expect(node.props.options).not.toHaveProperty('headerLeft');
      expect(node.props.options).not.toHaveProperty('headerRight');
    }
  });
  it.each([
    [ID_REVIEWS, '/admin/identity-reviews'], [REPORTS, '/admin/reports'],
  ])('invokes the actual %s attention row at its existing destination', (label, destination) => {
    seams.cells[0] = view;
    press(home(), label);
    expect(seams.push).toHaveBeenCalledExactlyOnceWith(destination);
    expect(seams.signOut).not.toHaveBeenCalled();
  });
  it('keeps the attention rows reachable while the first snapshot loads, without an empty snapshot', () => {
    const nodes = home();
    expect(text(nodes)).toContain('Loading Admin analytics…');
    expect(text(nodes)).not.toContain('Platform summary');
    expect(text(nodes).filter((line) => line === 'Count loading')).toHaveLength(2);
    expect(text(nodes)).not.toContain('2 waiting');
    for (const label of ['ID reviews, Count loading', 'Reports, Count loading', 'Sign out']) button(nodes, label);
    press(nodes, 'ID reviews, Count loading');
    expect(seams.push).toHaveBeenCalledExactlyOnceWith('/admin/identity-reviews');
  });
  it('retains long error content, previous snapshot, refresh and actual retry callbacks', () => {
    const error = 'Unable to load the current retained-data snapshot. '.repeat(8);
    seams.cells[0] = { ...view, error, refreshing: true };
    const nodes = home();
    expect(text(nodes)).toContain(`${error} Showing the previous snapshot.`);
    expect(text(nodes)).toContain('Platform summary');
    press(nodes, 'Retry');
    const scroll = nodes.find((node) => node.props.refreshControl !== undefined)!;
    const refresh = scroll.props.refreshControl as ReactElement<Props>;
    expect(refresh.props.refreshing).toBe(true);
    (refresh.props.onRefresh as () => void)();
    expect(seams.refresh).toHaveBeenCalledTimes(2);
  });
  it('retains Sign out busy suppression and success through its actual footer callback', async () => {
    let resolve!: (result: { error: null }) => void;
    seams.signOut.mockReturnValue(new Promise((done) => { resolve = done; }));
    press(home(), 'Sign out');
    const busy = home();
    expect(button(busy, 'Sign out').props).toMatchObject({
      disabled: true, accessibilityRole: 'button', accessibilityState: { busy: true, disabled: true },
    });
    press(busy, 'Sign out');
    expect(seams.signOut).toHaveBeenCalledTimes(1);
    resolve({ error: null });
    await Promise.resolve(); await Promise.resolve();
    expect(button(home(), 'Sign out').props).toMatchObject({ disabled: false });
    expect(text(home())).not.toContain('Sign out failed. Please try again.');
    expect(seams.push).not.toHaveBeenCalled();
  });
  it.each(['returned', 'thrown'] as const)('retains %s Sign out failure, error presentation and retry', async (failure) => {
    const expected = failure === 'returned' ? 'Sign out unavailable; try again.' : 'Sign out failed. Please try again.';
    if (failure === 'returned') seams.signOut.mockResolvedValueOnce({ error: { message: expected } });
    else seams.signOut.mockRejectedValueOnce(new Error('inert failure'));
    press(home(), 'Sign out');
    await Promise.resolve(); await Promise.resolve();
    expect(text(home())).toContain(expected);
    expect(button(home(), 'Sign out').props.disabled).toBe(false);
    press(home(), 'Sign out');
    await Promise.resolve(); await Promise.resolve();
    expect(seams.signOut).toHaveBeenCalledTimes(2);
    expect(text(home())).not.toContain(expected);
    expect(seams.push).not.toHaveBeenCalled();
  });
  it('keeps long content uncapped, scaling enabled, and exactly three Home actions', () => {
    seams.cells[0] = view;
    const nodes = home();
    for (const node of nodes) {
      expect(node.props.allowFontScaling).not.toBe(false);
      expect(node.props.maxFontSizeMultiplier).toBeUndefined();
      expect(node.props.adjustsFontSizeToFit).not.toBe(true);
      expect(node.props.numberOfLines).toBeUndefined();
      expect(node.props.accessibilityRole).not.toBe('menu');
    }
    expect(nodes.filter((node) => node.props.accessibilityRole === 'button')
      .map((node) => node.props.accessibilityLabel)).toEqual([ID_REVIEWS, REPORTS, 'Sign out']);
  });
  it('composes header token colors with readable foreground contrast', () => {
    const stack = elements(AdminLayout()).find((node) => node.props.screenOptions !== undefined)!;
    const options = stack.props.screenOptions as { headerStyle: { backgroundColor: string }; headerTintColor: string };
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const background = luminance(options.headerStyle.backgroundColor);
    const foreground = luminance(options.headerTintColor);
    expect((Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

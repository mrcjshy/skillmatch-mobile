// @ts-expect-error -- Node-only static composition harness (the app tsconfig carries no Node types).
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  accountStatus, accountStatusExplanation, availabilityLabel, directoryRowStatus, idReviewAttention,
  isOpenReport, plural, reportAttention, workerVerificationStatus,
} from '@/lib/admin-presentation';
import { reportStatusVariant } from '@/lib/status-presentation';
import type { AdminAnalyticsSummary } from '@/lib/admin-analytics';

/**
 * Iteration 06 Wave 4 (Admin). Static composition evidence only: real TSX is executed with inert
 * framework seams, so this proves structure, wiring and copy, not native layout (the TesterArmy
 * Admin e2e suite covers runtime).
 */
type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
const source = (path: string): string => readFileSync(path, 'utf8');
const noop = () => undefined;
const node = (type: unknown, props: Props): Element => ({ type, props });
const hosts = Object.fromEntries(['Text', 'View', 'ScrollView', 'FlatList', 'Pressable', 'ActivityIndicator', 'RefreshControl', 'Modal', 'TextInput'].map((name) => [name, name]));
const cache: Record<string, Props> = {};

function load(path: string): Props {
  if (cache[path]) return cache[path];
  const raw = source(path);
  const exports: Props = {};
  cache[path] = exports;
  const theme = () => (load('src/constants/theme.ts').SkillMatchTheme as { ui: unknown }).ui;
  const seams: Record<string, Props> = {
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    react: { useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, noop], useRef: (value: unknown) => ({ current: value }), useCallback: (fn: unknown) => fn, useEffect: noop, useMemo: (fn: () => unknown) => fn() },
    'react-native': { ...hosts, useWindowDimensions: () => ({ fontScale: 1 }), StyleSheet: { create: (value: unknown) => value }, Platform: { OS: 'android', select: (choices: Props) => choices.android ?? choices.default } },
    'expo-router': { Stack: Object.assign('Stack', { Screen: 'Stack.Screen' }), Tabs: Object.assign('Tabs', { Screen: 'Tabs.Screen' }), useRouter: () => ({ push: noop }), useFocusEffect: noop },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-image': { Image: 'Image' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    '@/components/app-symbol': { AppSymbol: 'SymbolView' },
    '@/global.css': {},
    'expo-symbols': { SymbolView: 'SymbolView' },
    '@/components/refinement-theme': { useUiTheme: theme, RefinementThemeProvider: ({ children }: Props) => children },
    // Wave 7: the Client tab shell (compared below) guards its central Post a job action with these.
    'expo-router/react-navigation': { CommonActions: { navigate: noop } },
    '@/providers/client-jobs-provider': { useClientJobs: () => ({ isLoading: false, loadError: null }) },
    '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => ({ isPosting: false, isOwnerCurrent: () => true }) },
    // Motion (M2): the Client centre + press scale is inert here; this compares bar grammar only.
    '@/components/motion': { MotionView: 'MotionView', usePressScale: () => ({ style: {}, onPressIn: noop, onPressOut: noop }) },
  };
  const requireSeam = (id: string): Props => {
    if (seams[id]) return seams[id];
    if (id.startsWith('@/')) {
      const base = 'src/' + id.slice(2);
      const exists = (file: string) => { try { readFileSync(file); return true; } catch { return false; } };
      const file = [base + '.tsx', base + '.ts'].find(exists);
      if (file) return load(file);
    }
    throw new Error(`Unapproved import: ${id}`);
  };
  const output = ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', output)(requireSeam, exports);
  return exports;
}
function render(tree: unknown): unknown {
  if (Array.isArray(tree)) return tree.map(render);
  if (!tree || typeof tree !== 'object') return tree;
  const element = tree as Element;
  if (typeof element.type === 'function') return render((element.type as (props: Props) => unknown)(element.props));
  return { ...element, props: { ...element.props, children: render(element.props.children) } };
}
function all(tree: unknown, kind?: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((item) => all(item, kind));
  if (!tree || typeof tree !== 'object') return [];
  const element = tree as Element;
  return [...(kind === undefined || String(element.type) === kind ? [element] : []), ...all(element.props.children, kind)];
}
const texts = (tree: unknown): string[] => all(tree, 'Text').map((item) => [item.props.children].flat().join(''));
const flat = (style: unknown): Props => Array.isArray(style)
  ? Object.assign({}, ...style.filter(Boolean).map(flat)) : (style as Props) ?? {};

const ADMIN_FILES = [
  'src/app/(admin)/_layout.tsx', 'src/app/(admin)/(tabs)/_layout.tsx',
  'src/app/(admin)/(tabs)/admin/index.tsx', 'src/app/(admin)/(tabs)/admin/workers.tsx',
  'src/app/(admin)/(tabs)/admin/clients.tsx', 'src/app/(admin)/(tabs)/admin/reports.tsx',
  'src/app/(admin)/admin/identity-reviews.tsx', 'src/app/(admin)/admin/verification-details.tsx',
  'src/app/(admin)/admin/user-detail.tsx', 'src/app/(admin)/admin/report-details.tsx',
  'src/app/(admin)/admin/notifications.tsx',
  'src/components/admin-analytics-dashboard.tsx', 'src/components/admin-directory.tsx',
  'src/components/admin-rows.tsx', 'src/components/admin-user-detail-view.tsx',
  'src/components/identity-review-queue.tsx',
];

const bucket = { pending: 0, paid: 0, refunded: 0, unset: 0 };
const summary = (pending: number, open: number): AdminAnalyticsSummary => ({
  asOf: '2026-10-03T02:00:00Z', totalWorkers: 1, verifiedWorkers: 1, totalClients: 1,
  pendingWorkerVerifications: pending, completedBookings: 0,
  jobsByStatus: { open: 0, matched: 0, completed: 0, cancelled: 0, unset: 0 },
  bookingsByStatus: { pending: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 },
  paymentsByMethodStatus: { gcash: bucket, maya: bucket, qrph: bucket, cod: bucket, unset: bucket },
  reportsByStatus: { submitted: 0, under_review: 0, resolved: 0, dismissed: 0 }, reportsNeedingAttention: open,
});

describe('Admin presentation wording (existing data only)', () => {
  it('words account, verification and availability without inventing states', () => {
    expect(accountStatus(true)).toEqual({ label: 'Active', variant: 'positive' });
    expect(accountStatus(false)).toEqual({ label: 'Inactive', variant: 'danger' });
    expect(accountStatusExplanation(false)).toMatch(/inactive-account screen/);
    expect(workerVerificationStatus({ has_profile: false, is_verified: null }).label).toBe('No profile');
    expect(workerVerificationStatus({ has_profile: true, is_verified: true })).toEqual({ label: 'Verified', variant: 'positive' });
    expect(workerVerificationStatus({ has_profile: true, is_verified: false })).toEqual({ label: 'Unverified', variant: 'warning' });
    expect(workerVerificationStatus({ has_profile: true, is_verified: null }).label).toBe('Verification not set');
    expect(availabilityLabel('available')).toBe('Available');
    expect(availabilityLabel('on_leave')).toBe('On leave');
    expect(availabilityLabel(null)).toBe('Availability not set');
  });
  it('gives each directory row one chip: Inactive first, then verification (Worker) or account (Client)', () => {
    const worker = { is_active: true, has_profile: true, is_verified: true };
    expect(directoryRowStatus('worker', worker).label).toBe('Verified');
    expect(directoryRowStatus('worker', { ...worker, is_active: false }).label).toBe('Inactive');
    expect(directoryRowStatus('client', { is_active: true }).label).toBe('Active');
    expect(directoryRowStatus('client', { is_active: false }).variant).toBe('danger');
  });
  it('maps report status to the shared chip semantics and splits open from closed', () => {
    expect(['submitted', 'under_review', 'resolved', 'dismissed'].map(reportStatusVariant))
      .toEqual(['warning', 'info', 'positive', 'neutral']);
    expect(['submitted', 'under_review', 'resolved', 'dismissed'].map(isOpenReport)).toEqual([true, true, false, false]);
  });
  it('states attention counts from the snapshot and never guesses while it loads', () => {
    expect(idReviewAttention(null)).toBe('Count loading');
    expect(reportAttention(null)).toBe('Count loading');
    expect(idReviewAttention(summary(0, 0))).toBe('No Workers waiting');
    expect(idReviewAttention(summary(1, 0))).toBe('1 Worker waiting for review');
    expect(reportAttention(summary(0, 1))).toBe('1 report needs attention');
    expect(reportAttention(summary(0, 1200))).toBe('1,200 reports need attention');
    expect(plural(2, 'Worker')).toBe('2 Workers');
  });
});

describe('Admin navigation shell', () => {
  const tabs = render((load('src/app/(admin)/(tabs)/_layout.tsx').default as () => Element)());
  const navigator = all(tabs, 'Tabs')[0];
  const screens = all(tabs, 'Tabs.Screen');
  const effective = (screen: Element) => ({ ...(navigator.props.screenOptions as Props), ...(screen.props.options as Props) });

  it('presents exactly four existing destinations through the shared bar grammar', () => {
    expect(screens.map((screen) => screen.props.name)).toEqual(['admin/index', 'admin/workers', 'admin/clients', 'admin/reports']);
    expect(screens.map((screen) => effective(screen).title)).toEqual(['Home', 'Workers', 'Clients', 'Reports']);
    expect(navigator.props.backBehavior).toBe('initialRoute');
    const client = render((load('src/app/(client)/(tabs)/_layout.tsx').default as () => Element)());
    const clientOptions = all(client, 'Tabs')[0].props.screenOptions as Props;
    // Same bar, same label and indicator behaviour as Client: one shared options hook.
    expect(Object.keys(navigator.props.screenOptions as Props).sort()).toEqual(Object.keys(clientOptions).sort());
    expect((navigator.props.screenOptions as Props).tabBarStyle).toEqual(clientOptions.tabBarStyle);
    for (const screen of screens) {
      const options = effective(screen);
      const label = (options.tabBarLabel as (state: Props) => Element)({ focused: true, color: '#000' });
      expect(texts(render(label))).toEqual([options.title]);
      expect(options.tabBarAccessibilityLabel).toBe(options.title);
    }
  });
  it('centers non-Home titles through the navigator and puts no bell on any tab', () => {
    for (const screen of screens) {
      const options = effective(screen);
      expect(options.headerRight).toBeUndefined();
      expect(options.headerLeft).toBeUndefined();
      if (screen.props.name === 'admin/index') expect(options.headerShown).toBe(false);
      else {
        expect(options.headerShown).not.toBe(false);
        expect(options.headerTitleAlign).toBe('center');
      }
    }
    const bellUsers = ADMIN_FILES.filter((file) => /NotificationBell/.test(source(file)));
    expect(bellUsers).toEqual([]);
    // The only Admin bell is the shared Home header's, which renders it for role="admin".
    // Wave 7: the Admin greeting says "Admin", whatever the account is called.
    expect(source('src/app/(admin)/(tabs)/admin/index.tsx')).toContain("<HomeStickyHeader name={authorizedId !== null ? ADMIN_GREETING_NAME : ''} role=\"admin\" />");
    expect(source('src/components/home-header.tsx')).toContain('<NotificationBell role={role} />');
    expect(source('src/hooks/use-unread-notifications.ts')).toContain("role === 'admin' ? 'administrator' : role");
  });
  it('keeps every Admin URL: tab files moved into a group, details stay pushed', () => {
    const stack = source('src/app/(admin)/_layout.tsx');
    for (const route of ['admin/notifications', 'admin/user-detail', 'admin/identity-reviews', 'admin/verification-details', 'admin/report-details']) {
      expect(stack).toContain(`name="${route}"`);
    }
    for (const href of ["'/admin/identity-reviews'", "'/admin/reports'", "pathname: '/admin/user-detail'", "pathname: '/admin/verification-details'", "pathname: '/admin/report-details'"]) {
      expect(ADMIN_FILES.some((file) => source(file).includes(href))).toBe(true);
    }
    expect(source('src/app/_layout.tsx')).toContain("administrator: '/admin'");
  });
});

describe('Admin screens: hierarchy and authority', () => {
  const order = (file: string, markers: string[]) => {
    const text = source(file);
    const positions = markers.map((marker) => text.indexOf(marker));
    for (const position of positions) expect(position).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  };

  it('Home leads with attention, then the summary and breakdowns; Sign out sits last and quiet', () => {
    order('src/components/admin-analytics-dashboard.tsx', [
      'title="Needs attention"', 'title="Platform summary"', 'title="Bookings by status"',
      'title="Jobs by status"', 'title="Payments"', 'title="Reports by status"', '{footer}',
    ]);
    const dashboard = source('src/components/admin-analytics-dashboard.tsx');
    expect(dashboard).toContain('PayMongo runs in TEST mode, so no real money moves.');
    expect(dashboard).not.toMatch(/AppCard|metricGrid|function Metric|onWorkers|onClients|onNotifications/);
    const home = source('src/app/(admin)/(tabs)/admin/index.tsx');
    expect(home).toContain('label="Sign out"');
    expect(home).toContain('variant="secondary"');
    expect(home.indexOf('<AdminAnalyticsDashboard')).toBeLessThan(home.indexOf('label="Sign out"'));
  });
  it('verification details reads identity, submission, evidence, skills, decision, with unchanged actions', () => {
    const file = 'src/app/(admin)/admin/verification-details.tsx';
    order(file, ['<InitialsAvatar', 'title="Submitted information"', 'title="ID photo"', 'title="Skills"', 'title="Decision"', 'label="Rejection reason"', "'Approve ID'", 'label="Reject ID"']);
    const text = source(file);
    expect(text).toContain('await approveWorkerIdentity(userId);');
    expect(text).toContain('await rejectWorkerIdentity(userId, reason);');
    expect(text).toContain('const invalid = validateRejectionReason(reason);');
    expect(text).not.toMatch(/textTransform|DetailLine/);
  });
  it('report details reads status, context, people, report, evidence, response, review; strike confirm is the shared dialog', () => {
    const file = 'src/app/(admin)/admin/report-details.tsx';
    order(file, ['<AppChip label={formatReportStatus', 'title="Context"', 'title="People"', 'title="Description"', 'title={COPY.evidenceTitle}', 'title="Admin response"', 'title="Review"', 'title="Outcome email"', '<AppDialog']);
    const text = source(file);
    expect(text).not.toMatch(/\bAlert\b|textTransform|letterSpacing/);
    expect(text).toContain('await reviewReport(reportId, status, validated.response);');
    expect(text).toContain('await resolveNoShowReportWithStrike(reportId, adminResponse);');
    expect(text).toContain('if (confirmed) void applyStrike(confirmed.response);');
    expect(text).toContain('discipline.wouldSuspend ? COPY.strikeSuspendBody : COPY.strikeConfirmBody');
    const reports = source('src/lib/reports.ts');
    expect(reports).toContain("strikeAction: 'Resolve and apply strike'");
    expect(reports).toContain("retryEmail: 'Send or retry outcome email'");
  });
  it('the Reports tab rereads on focus and groups the same rows into Open and Closed', () => {
    const text = source('src/app/(admin)/(tabs)/admin/reports.tsx');
    expect(text).toContain('useFocusEffect(');
    expect(text).not.toContain('useEffect(');
    expect(text).toContain("renderGroup('Open', open,");
    expect(text).toContain("renderGroup('Closed', closed,");
    expect(text).toContain('const rows = await loadAdminReports();');
  });
  it('directories and the ID queue use grouped rows with one chip, not card stacks', () => {
    for (const file of ['src/components/admin-directory.tsx', 'src/components/identity-review-queue.tsx', 'src/app/(admin)/(tabs)/admin/reports.tsx']) {
      const text = source(file);
      expect(text).toContain('groupedRowStyle(ui, groupPosition(index,');
      expect(text).toContain('<AdminRow');
      expect(text).not.toMatch(/AppCard|opacity: 0\.72/);
    }
  });
  it('Admin source keeps sentence case and shared primitives only', () => {
    for (const file of ADMIN_FILES) {
      const text = source(file);
      expect(text).not.toMatch(/textTransform: 'uppercase'|>STATUS<|'Sign Out'|"Sign Out"|Admin Dashboard|Worker Directory|Client Directory|User Details|Identity Reviews|Report Details|Verification Details|Pending Identity Reviews/);
      expect(text).not.toMatch(/function (StatusChip|Chip|TabBar|Dialog)\b/);
    }
  });
});

describe('Admin compositions (rendered from source)', () => {
  const { colors } = (load('src/constants/theme.ts').SkillMatchTheme as { ui: { colors: Record<string, string> } }).ui;
  const lum = (hex: string) => hex.slice(1).match(/../g)!.map((x) => parseInt(x, 16) / 255)
    .map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
    .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  it('AdminRow is one labelled 56dp button with decorative glyphs and readable pressed text', () => {
    const { AdminRow } = load('src/components/admin-rows.tsx');
    let pressed = 0;
    const tree = render(node(AdminRow, {
      icon: { android: 'flag', ios: 'flag' }, title: 'Reports', lines: ['3 reports need attention', null, ''],
      onPress: () => { pressed++; }, accessibilityLabel: 'Reports, 3 reports need attention',
    })) as Element;
    expect(tree.type).toBe('Pressable');
    expect(tree.props.accessibilityRole).toBe('button');
    expect(tree.props.accessibilityLabel).toBe('Reports, 3 reports need attention');
    expect(texts(tree)).toEqual(['Reports', '3 reports need attention']);
    const resting = flat((tree.props.style as (state: Props) => unknown)({ pressed: false }));
    const down = flat((tree.props.style as (state: Props) => unknown)({ pressed: true }));
    expect(resting.minHeight).toBeGreaterThanOrEqual(48);
    expect(down.backgroundColor).toBe(colors.surfaceSunken);
    expect(down.opacity).toBeUndefined();
    for (const text of all(tree, 'Text')) {
      const color = flat(text.props.style).color as string;
      expect(contrast(color, colors.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color, colors.surfaceSunken)).toBeGreaterThanOrEqual(4.5);
      expect(text.props.numberOfLines).toBeUndefined();
    }
    const decorative = all(tree, 'View').filter((view) => view.props.importantForAccessibility === 'no-hide-descendants');
    expect(decorative).toHaveLength(2); // leading glyph and chevron
    (tree.props.onPress as () => void)();
    expect(pressed).toBe(1);
  });
  it('AdminCountRow speaks label, value and detail together and wraps instead of clipping', () => {
    const { AdminCountRow } = load('src/components/admin-rows.tsx');
    const tree = render(node(AdminCountRow, { label: 'Bookings', value: 1234567, detail: '3 completed' })) as Element;
    expect(tree.props.accessibilityLabel).toBe('Bookings: 1,234,567, 3 completed');
    expect(flat(tree.props.style).flexWrap).toBe('wrap');
    expect(texts(tree)).toEqual(['Bookings', '3 completed', '1,234,567']);
  });
  it('account details are read-only sections with the state explained, Worker verification included', () => {
    const { AdminUserDetailView } = load('src/components/admin-user-detail-view.tsx');
    const worker = render(node(AdminUserDetailView, { detail: {
      user_id: 'w', full_name: 'Juan dela Cruz', is_active: true, created_at: '2026-09-30T07:00:00Z',
      has_profile: true, is_verified: true, availability_status: 'available', completed_bookings_count: 12,
    } }));
    const lines = texts(worker);
    expect(lines.indexOf('Account')).toBeLessThan(lines.indexOf('Verification'));
    expect(lines.indexOf('Verification')).toBeLessThan(lines.indexOf('Activity'));
    expect(lines).toEqual(expect.arrayContaining(['Juan dela Cruz', 'Worker account', 'Active', 'Verified', 'Available', '12']));
    expect(lines.some((line) => line.includes('it is not changed from this screen'))).toBe(true);
    expect(all(worker, 'Pressable')).toHaveLength(0);
    const client = texts(render(node(AdminUserDetailView, { detail: {
      user_id: 'c', full_name: 'Ana Santos', is_active: false, created_at: null, posted_jobs_count: 4,
    } })));
    expect(client).toEqual(expect.arrayContaining(['Client account', 'Inactive', 'Not recorded', 'Jobs posted', '4']));
    expect(client).not.toContain('Verification');
  });
});

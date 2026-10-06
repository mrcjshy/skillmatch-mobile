// @ts-expect-error -- Node-only static composition harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

/**
 * Iteration 06 Wave 7 — Josh owner correction pass (W7-C1). Static composition evidence: real TSX
 * runs with inert framework seams, so this proves structure, wiring, semantics and copy, not native
 * layout. TesterArmy covers runtime.
 */
type Props = Record<string, any>;
type Element = { type: unknown; props: Props };
const source = (path: string): string => readFileSync(path, 'utf8');
const node = (type: unknown, props: Props): Element => ({ type, props });
const flat = (style: unknown): Props => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : (style as Props) ?? {};
function compile(path: string, seams: Record<string, Props>): Props {
  const exports: Props = {};
  const requireSeam = (id: string): Props => {
    if (id in seams) return seams[id];
    if (id === 'react/jsx-runtime') return { jsx: node, jsxs: node, Fragment: 'Fragment' };
    if (id === '@/constants/theme') return compile('src/constants/theme.ts', seams);
    if (id === '@/global.css') return {};
    throw new Error('Unapproved import: ' + id);
  };
  new Function('require', 'exports', ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(requireSeam, exports);
  return exports;
}
function all(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(all);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  return [value as Element, ...all((value as Element).props.children)];
}
const theme = compile('src/constants/theme.ts', { 'react-native': { Platform: { OS: 'android', select: (x: Props) => x.android ?? x.default } } }).SkillMatchTheme.ui;

// Inert motion seam: the press-scale hook's handlers are recorded so wiring can be asserted.
const pressScale = { style: { transform: [{ scale: 1 }] }, onPressIn: vi.fn(), onPressOut: vi.fn() };
function tabBar(focusedIndex = 0, extra: Props = {}) {
  const navigate = vi.fn((route: Props) => ({ type: 'NAVIGATE', payload: { name: route.name } }));
  const { ClientTabBar, CLIENT_POST_ACTION_LABEL } = compile('src/components/client-tab-bar.tsx', {
    'react-native': { Animated: { View: 'Animated.View' }, Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: (x: Props) => x }, Platform: { OS: 'android', select: (x: Props) => x.android ?? x.default } },
    'expo-router/react-navigation': { CommonActions: { navigate } },
    '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
    '@/components/app-tab-bar': { TAB_ACTIVE_COLOR: theme.colors.accent, TAB_INACTIVE_COLOR: theme.colors.textMuted },
    '@/components/motion': { MotionView: 'MotionView', usePressScale: () => pressScale },
  });
  const names = ['client/index', 'client/jobs', 'client/bookings', 'client/profile'];
  const titles = ['Home', 'My jobs', 'Bookings', 'Profile'];
  const routes = names.map((name) => ({ key: name + '-key', name, params: undefined }));
  const descriptors = Object.fromEntries(routes.map((route, i) => [route.key, { options: {
    title: titles[i], tabBarAccessibilityLabel: titles[i],
    tabBarIcon: ({ focused, color }: Props) => node('TabIcon', { focused, color }),
    tabBarLabel: ({ focused, color, children }: Props) => node('TabLabel', { focused, color, children }),
    tabBarItemStyle: { minHeight: 48 }, tabBarStyle: { height: 101, backgroundColor: theme.colors.surface },
  } }]));
  const emitted: Props[] = [];
  const dispatched: Props[] = [];
  const navigation = { emit: (event: Props) => { emitted.push(event); return { defaultPrevented: false }; }, dispatch: (action: Props) => dispatched.push(action) };
  const onPostJob = vi.fn();
  const tree = ClientTabBar({ state: { key: 'tabs-key', index: focusedIndex, routes }, descriptors, navigation, insets: { bottom: 21, left: 0, right: 0, top: 0 }, onPostJob, postDisabled: false, posting: false, ...extra }) as Element;
  return { tree, emitted, dispatched, onPostJob, label: CLIENT_POST_ACTION_LABEL };
}

describe('W7-C1 Client central Post a job action', () => {
  it('sits at the geometric centre: Home, My jobs | + | Bookings, Profile, in one flex row', () => {
    const { tree } = tabBar();
    const row = all(tree).find((n) => n.props.role === 'tablist')!;
    const children = row.props.children.flat();
    expect(children.map((c: Element) => c.props['aria-label'] ?? 'action')).toEqual(['Home', 'My jobs', 'action', 'Bookings', 'Profile']);
    // Equal flexible tabs either side of one fixed slot: the slot's centre is the bar's centre.
    const tabs = children.filter((c: Element) => c.props.role === 'tab');
    for (const t of tabs) expect(flat(t.props.style).flex).toBe(1);
    const slot = children[2];
    expect(flat(slot.props.style)).toMatchObject({ width: theme.size.actionCircle + theme.spacing.lg, alignItems: 'center', justifyContent: 'center' });
    expect(flat(slot.props.style).position).toBeUndefined();
  });

  it('is a circular Work Blue + button, >= 48dp, labelled "Post a job", inside the bar and above the gesture inset', () => {
    const { tree, label } = tabBar();
    expect(label).toBe('Post a job');
    const action = all(tree).find((n) => n.props.accessibilityLabel === 'Post a job')!;
    expect(action.props.accessibilityRole).toBe('button');
    const style = flat(action.props.style({ pressed: false }));
    expect(style.width).toBe(56); expect(style.height).toBe(56); expect(style.borderRadius).toBe(28);
    expect(style.width).toBeGreaterThanOrEqual(48);
    expect(style.backgroundColor).toBe(theme.colors.accent);
    expect(style.elevation).toBeGreaterThan(0);
    expect(style.position).toBeUndefined(); expect(style.transform).toBeUndefined(); expect(style.marginTop).toBeUndefined();
    expect(flat(action.props.style({ pressed: true })).backgroundColor).toBe(theme.colors.accentPressed);
    const glyph = all(action).find((n) => n.type === 'AppSymbol')!;
    expect(glyph.props).toMatchObject({ name: { android: 'add', ios: 'plus' }, tintColor: theme.colors.onAccent });
    // The bar keeps the bottom inset as padding, so nothing sits in the gesture area.
    expect(flat(tree.props.style)).toMatchObject({ paddingBottom: 21, height: 101 });
  });

  it('pressing + calls the Post Job handler; disabled while posting or unavailable', () => {
    const live = tabBar();
    const action = all(live.tree).find((n) => n.props.accessibilityLabel === 'Post a job')!;
    action.props.onPress(); expect(live.onPostJob).toHaveBeenCalledOnce();
    expect(action.props.accessibilityState).toEqual({ disabled: false, busy: false });
    const busy = tabBar(0, { postDisabled: true, posting: true });
    const blocked = all(busy.tree).find((n) => n.props.accessibilityLabel === 'Post a job')!;
    expect(blocked.props.disabled).toBe(true);
    expect(blocked.props.accessibilityState).toEqual({ disabled: true, busy: true });
  });

  it('keeps the stock tab semantics: tab role, selected state, tabPress then navigate, tabLongPress', () => {
    const { tree, emitted, dispatched } = tabBar(1);
    const tabs = all(tree).filter((n) => n.props.role === 'tab');
    expect(tabs.map((t) => t.props['aria-selected'])).toEqual([false, true, false, false]);
    expect(all(tabs[1]).find((n) => n.type === 'TabLabel')!.props).toMatchObject({ focused: true, color: theme.colors.accent, children: 'My jobs' });
    tabs[2].props.onPress();
    expect(emitted.at(-1)).toEqual({ type: 'tabPress', target: 'client/bookings-key', canPreventDefault: true });
    expect(dispatched.at(-1)).toEqual({ type: 'NAVIGATE', payload: { name: 'client/bookings' }, target: 'tabs-key' });
    tabs[1].props.onPress();
    expect(dispatched).toHaveLength(1); // the focused tab does not navigate again
    tabs[3].props.onLongPress();
    expect(emitted.at(-1)).toEqual({ type: 'tabLongPress', target: 'client/profile-key' });
    for (const t of tabs) expect(flat(t.props.style).minHeight).toBeGreaterThanOrEqual(48);
  });

  it('the Client tab layout keeps all four destinations and routes + to the existing Post Job flow', () => {
    const layout = source('src/app/(client)/(tabs)/_layout.tsx');
    for (const name of ['client/index', 'client/jobs', 'client/bookings', 'client/profile']) expect(layout).toContain(`name="${name}"`);
    expect(layout).toContain("router.push('/client/post-job' as Href)");
    expect(layout).toContain('const postDisabled = isLoading || !!loadError || isPosting || !isOwnerCurrent();');
    expect(layout).toContain('<ClientTabBar');
    // Post a job is not a route: no placeholder tab, no hidden href.
    expect(layout).not.toMatch(/href:\s*null|name="client\/post/);
  });
});

describe('W7-C1 Home headings and Admin greeting', () => {
  it('no role Home renders a "Home" heading; the shared header has exactly one header-role text (the name)', () => {
    const header = source('src/components/home-header.tsx');
    expect(header).not.toMatch(/>Home</);
    expect((header.match(/accessibilityRole="header"/g) ?? []).length).toBe(1);
    for (const role of ['worker', 'client', 'admin']) {
      expect(source(`src/app/(${role})/(tabs)/${role}/index.tsx`)).not.toMatch(/>Home<|title="Home"/);
    }
  });

  it('Admin greeting addresses "Admin" and never "System Admin"; the stored name still shows under Signed in as', () => {
    const admin = source('src/app/(admin)/(tabs)/admin/index.tsx');
    expect(admin).toContain("const ADMIN_GREETING_NAME = 'Admin';");
    expect(admin).not.toContain('System Admin');
    expect(admin).not.toContain('firstNameFromFullName');
    expect(admin).toContain('<FactRow label="Signed in as" value={fullName || null} />');
    expect(admin).toContain('<FactRow label="Role" value="Administrator" />');
  });

  it('Worker sorting is display-only: the opportunity loader and its server order are unchanged', () => {
    const lib = source('src/lib/job-opportunities.ts');
    expect(lib).toContain("const res = await supabase.rpc('list_my_job_opportunities');");
    const home = source('src/app/(worker)/(tabs)/worker/index.tsx');
    expect(home).toContain("useState<WorkerJobSort>('match')");
    expect(home).toContain('sortWorkerOpportunities(rankedJobs, sort, { now: sortNow, postedAt })');
    expect(home).not.toMatch(/match_workers_for_job|compute_job_matches|total_points\s*[-+*]/);
  });
});

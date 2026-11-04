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
    if (id === '@/constants/cobalt-material') return compile('src/constants/cobalt-material.ts', {});
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
// The Post a job page's cobalt material, shared by its primary button and the bar's + (pure strings).
const material = compile('src/constants/cobalt-material.ts', {});

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

  it('is an M3 FAB (16dp rounded square) in the lit cobalt of the Post a job page, >= 48dp, labelled "Post a job", inside the bar and above the gesture inset', () => {
    const { tree, label } = tabBar();
    expect(label).toBe('Post a job');
    const action = all(tree).find((n) => n.props.accessibilityLabel === 'Post a job')!;
    expect(action.props.accessibilityRole).toBe('button');
    const style = flat(action.props.style({ pressed: false }));
    // M3 FAB: a 56dp rounded square with the large (16dp) shape.
    expect(style.width).toBe(56); expect(style.height).toBe(56); expect(style.borderRadius).toBe(16);
    expect(style.width).toBeGreaterThanOrEqual(48);
    // The Post a job page's cobalt material (owner 2026-11-04): solid cobalt under a finish lit from
    // above, settling into the brand cobalt.
    expect(style.backgroundColor).toBe(theme.colors.accent);
    expect(style.experimental_backgroundImage).toBe(material.COBALT_LIT);
    expect(material.COBALT_LIT).toBe(`linear-gradient(180deg, #2D4DC8 0%, ${theme.colors.accent} 100%)`);
    // It floats on the cobalt shadow, in its own hue, as a box shadow (Expo native-UI rule: never the
    // legacy elevation prop).
    expect(style.boxShadow).toBe(material.COBALT_SHADOW);
    expect(material.COBALT_SHADOW).toBe('0px 14px 28px rgba(28, 58, 166, 0.30), 0px 4px 10px rgba(20, 43, 127, 0.18)');
    expect(style.elevation).toBeUndefined();
    expect(style.position).toBeUndefined(); expect(style.transform).toBeUndefined(); expect(style.marginTop).toBeUndefined();
    // Under the finger: the same light a shade deeper, ending on the pressed cobalt; the shadow stays.
    const down = flat(action.props.style({ pressed: true }));
    expect(down.backgroundColor).toBe(theme.colors.accentPressed);
    expect(down.experimental_backgroundImage).toBe(material.COBALT_LIT_PRESSED);
    expect(material.COBALT_LIT_PRESSED).toBe(`linear-gradient(180deg, ${theme.colors.accent} 0%, ${theme.colors.accentPressed} 100%)`);
    expect(down.boxShadow).toBe(material.COBALT_SHADOW);
    const glyph = all(action).find((n) => n.type === 'AppSymbol')!;
    expect(glyph.props).toMatchObject({ name: { android: 'add', ios: 'plus' }, tintColor: theme.colors.onAccent });
    // The bar overlays the scene at the bottom, keeps the bottom inset (plus a gap) clear, lets
    // touches above the pill through, and fades the canvas in behind a translucent rounded pill.
    expect(flat(tree.props.style)).toMatchObject({ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 21 + theme.spacing.sm, paddingLeft: theme.spacing.md, paddingRight: theme.spacing.md });
    expect(flat(tree.props.style).backgroundColor).toBeUndefined();
    expect(tree.props.pointerEvents).toBe('box-none');
    const fade = tree.props.children.find((n: Element | null) => n?.props?.pointerEvents === 'none');
    expect(String(flat(fade.props.style).experimental_backgroundImage)).toMatch(/^linear-gradient\(to bottom, rgba\(251, 248, 255, 0\)/); // the canvas (M3 surface #FBF8FF), clear at the top
    const pill = all(tree).find((n) => n.props.role === 'tablist')!;
    expect(flat(pill.props.style)).toMatchObject({ flexDirection: 'row', borderRadius: 34 });
    // M3 surfaceContainer (#EFEDF4), still slightly see-through so content ghosts under the pill.
    expect(flat(pill.props.style).backgroundColor).toMatch(/^rgba\(239, 237, 244, 0\.\d+\)$/);
    expect(flat(pill.props.style).boxShadow).toBeTruthy();
    // Only the selected tab draws the M3 tonal indicator, as a layer (Android ripple replaces backgrounds).
    const capsules = all(pill).filter((n) => n.type === 'View' && n.props.pointerEvents === 'none' && flat(n.props.style).backgroundColor);
    expect(capsules).toHaveLength(1);
    expect(flat(pill.props.style).minHeight).toBeGreaterThanOrEqual(style.height);
  });

  it('wears exactly the material of the primary button on the Post a job page (CobaltButton), at rest and pressed', () => {
    const action = all(tabBar().tree).find((n) => n.props.accessibilityLabel === 'Post a job')!;
    const { CobaltButton } = compile('src/components/cobalt-ui.tsx', {
      'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: (x: Props) => x, hairlineWidth: 1 }, Platform: { OS: 'android', select: (x: Props) => x.android ?? x.default } },
      'react-native-reanimated': {
        __esModule: true, default: { View: 'Animated.View' }, Easing: { bezier: () => 'ease' }, Keyframe: class { duration() { return this; } },
        useAnimatedStyle: (fn: () => Props) => fn(), useReducedMotion: () => false, useSharedValue: () => ({ get: () => 0, set: vi.fn() }), withSpring: (to: number) => to,
      },
      react: { useEffect: vi.fn(), useState: (initial: unknown) => [initial, vi.fn()] },
      'expo-haptics': { impactAsync: vi.fn(async () => undefined), ImpactFeedbackStyle: { Light: 'light' } },
      '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
      '@/components/skeleton': { PulseDots: 'PulseDots' },
    });
    const button = all(CobaltButton({ label: 'Next', onPress: vi.fn() })).find((n) => n.type === 'Pressable')!;
    const finish = (style: Props) => ({ backgroundColor: style.backgroundColor, experimental_backgroundImage: style.experimental_backgroundImage, boxShadow: style.boxShadow });
    for (const pressed of [false, true]) {
      const fab = finish(flat(action.props.style({ pressed })));
      expect(fab.experimental_backgroundImage, `pressed: ${pressed}`).toMatch(/^linear-gradient\(/);
      expect(fab, `pressed: ${pressed}`).toEqual(finish(flat(button.props.style({ pressed }))));
    }
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
    // Icons only (owner request 2026-11-04): no visible label, the name stays the accessible label.
    expect(all(tabs[1]).some((n) => n.type === 'TabLabel' || n.type === 'Text')).toBe(false);
    expect(tabs[1].props['aria-label']).toBe('My jobs');
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
    // Owner and posting readiness are exercised through the real layout in role-navigation-ui.test.ts.
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

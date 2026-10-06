// @ts-expect-error -- Offline source/prop harness; native reflow needs device evidence.
import { readFileSync, existsSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

type Props = Record<string, any>;
const jsx = (type: any, props: Props): any => typeof type === 'function' ? type(props) : ({ type, props });
const noop = () => undefined;
const native = {
  ...Object.fromEntries(['View', 'Text', 'ScrollView', 'RefreshControl', 'Pressable', 'ActivityIndicator'].map(name => [name, name])),
  Platform: { select: (values: Props) => values.android ?? values.default },
  StyleSheet: { create: (styles: Props) => styles, hairlineWidth: 1 },
};
const id = '11111111-1111-4111-8111-111111111111';
const opportunity = {
  job_id: id,
  title: 'Pagkukumpuni ng bubong at ligtas na kable sa tahanan ng pamilya',
  description: 'Kailangan ng masusing pagsusuri at pagkukumpuni. '.repeat(12),
  barangay: 'Santa Ana', city: 'Pateros', budget: 987654321.75,
  scheduled_at: '2026-10-01T07:00:00.000Z', payment_method: 'cod',
  skill_points: 35.5, location_points: 30, rating_points: 12, total_points: 77.5,
};
function render(job: Props, skills: Props[] = [{ id: 4, name: 'Electrical installation' }], options: { accepted?: boolean; fontScale?: number; reduced?: boolean; notice?: Props } = {}) {
  const location = { latitude: 14.542, longitude: 121.07 };
  const states = [location, job, { status: 'ready', skills, workerSkills: [] }, false, false, null, false, options.accepted ?? false, options.notice ?? null, {}];
  const successEnter = options.reduced ? undefined : { preset: 'successEnter' };
  const routes: unknown[] = [];
  let cursor = 0;
  const cache: Props = {};
  function load(file: string): Props {
    file = path.resolve(file);
    if (cache[file]) return cache[file];
    const exports: Props = {}; cache[file] = exports;
    const raw = readFileSync(file, 'utf8');
    const require = (name: string): any => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => load('src/constants/theme.ts').SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: any) => children };
      if (name === 'react') return {
        useState: () => [states[cursor++], noop], useRef: () => ({ current: null }),
        useCallback: (fn: any) => fn, useEffect: noop, useLayoutEffect: noop,
      };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'react-native') return { ...native, Platform: { ...native.Platform, OS: 'android' }, useWindowDimensions: () => ({ fontScale: options.fontScale ?? 1 }) };
      if (name === 'expo-symbols') return { SymbolView: 'SymbolView' };
      if (name === 'expo-font') return { useFonts: () => [true] };
      if (name === 'expo-symbols/androidWeights/regular') return { __esModule: true, default: { name: 'MaterialSymbols_400Regular', font: 'font' } };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 24 }) };
      if (name === 'expo-router') return { useRouter: () => ({ replace: (route: unknown) => routes.push(route) }), useFocusEffect: noop };
      if (name === '@/global.css') return {};
      if (name === '@/components/motion') return { MotionView: 'MotionView', useMotion: () => ({ reduced: options.reduced ?? false, successEnter }) };
      if (name.endsWith('/supabase')) return { supabase: new Proxy({}, { get() { throw Error('No database access in presentation checks'); } }) };
      if (name.endsWith('/account-provider')) return { useAccount: () => ({ account: { id: 'worker', role: 'worker', is_active: true } }) };
      if (name.endsWith('/session-provider')) return { useSession: () => ({ session: { user: { id: 'worker' } } }) };
      if (name.endsWith('/worker-accept-handoff-focus') || name.endsWith('/booking-records') || name.endsWith('/opportunity-location') || name.endsWith('/realtime')) return {};
      if (name.endsWith('/skill-gap') && !name.includes('/components/')) return { computeSkillGap: () => ({ matchedSkills: [], missingSkills: skills }) };
      // Compose the real symbol in accepted-state checks: its scalable wrapper caused KI-UI-130-01.
      if (options.accepted && ['@/components/app-symbol', '@/components/inline-status', '@/components/app-button'].includes(name)) return load('src/components/' + name.slice('@/components/'.length) + '.tsx');
      if (name.startsWith('@/components/')) {
        const names = [...raw.matchAll(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g)]
          .filter(match => match[2] === name).flatMap(match => match[1].split(',').map((part: string) => part.trim()));
        return Object.fromEntries(names.map(component => [component, component]));
      }
      const stem = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name);
      const target = [stem + '.ts', stem + '.tsx'].find(existsSync);
      if (!target) throw Error('Unexpected dependency: ' + name);
      return load(target);
    };
    new Function('require', 'exports', ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(require, exports);
    return exports;
  }
  const screen = load('src/components/job-opportunity-details.tsx');
  const tree = screen.default({ jobId: id });
  return { tree, location, successEnter, routes, format: load('src/lib/job-opportunities.ts'), payment: load('src/lib/job-payment.ts'), colors: load('src/constants/theme.ts').SkillMatchTheme.ui.colors };
}
function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  return tree?.props ? [tree, ...all(tree.props.children)] : [];
}
const text = (tree: any): string => Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
const flatStyle = (style: any): Props => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatStyle)) : style ?? {};

it.each([1, 1.3])('centres the accepted check inside its own symbol wrapper at font scale %s, independently of native glyph metrics', (fontScale) => {
  const { tree, colors } = render(opportunity, [], { accepted: true, fontScale });
  const mark = all(tree).find(node => node.type === 'MotionView');
  const symbol = mark.props.children;
  // Android's native SP conversion need not equal size * fontScale. Both nested
  // containers must centre their actual child, rather than anchor ink at the top-left.
  expect(flatStyle(mark.props.style)).toMatchObject({ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.successTint, alignItems: 'center', justifyContent: 'center' });
  expect(symbol.type).toBe('View');
  expect(flatStyle(symbol.props.style)).toMatchObject({ alignItems: 'center', justifyContent: 'center' });
  expect(flatStyle(symbol.props.style).transform).toBeUndefined();
  expect(symbol.props.children.type).toBe('Text');
  expect(symbol.props.children.props.children).toBe('\ue86c');
  expect(symbol.props.children.props.style).toMatchObject({ fontSize: 32, lineHeight: 32, color: colors.success });
});

it.each([false, true])('preserves the accepted-state hierarchy, decorative semantics and bookings action with reduced motion %s', (reduced) => {
  const headline = 'Job accepted. It is now booked to you.';
  const detail = 'Your acceptance was submitted successfully, but the booking could not be opened. Open Bookings to continue.';
  const { tree, successEnter, routes } = render(opportunity, [], { accepted: true, fontScale: 1.3, reduced, notice: { headline, detail, tone: 'success' } });
  const nodes = all(tree);
  const mark = nodes.find(node => node.type === 'MotionView');
  expect(mark.props.entering).toBe(successEnter);
  expect(mark.props).toMatchObject({ accessible: false, importantForAccessibility: 'no-hide-descendants' });
  const glyph = all(mark).find(node => node.type === 'Text');
  expect(glyph.props.accessible).toBe(false);
  const words = nodes.filter(node => node.type === 'Text' && node !== glyph);
  expect(words.map(node => node.props.children)).toEqual([headline, detail, 'View bookings']);
  for (const word of words) {
    expect(word.props.accessibilityRole).toBeUndefined();
    expect(word.props.accessibilityLiveRegion).toBeUndefined();
    expect(word.props.allowFontScaling).not.toBe(false);
    expect(word.props.numberOfLines).toBeUndefined();
  }
  const action = nodes.find(node => node.type === 'Pressable');
  expect(action.props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'View bookings', disabled: false, accessibilityState: { disabled: false, busy: false } });
  expect(nodes.indexOf(mark)).toBeLessThan(nodes.indexOf(words[0]));
  expect(nodes.indexOf(words[1])).toBeLessThan(nodes.indexOf(action));
  action.props.onPress();
  expect(routes).toEqual(['/worker/bookings']);
});

it('keeps complete long job facts, original scores, requirements and authorized map props in scroll-owned content', () => {
  const { tree, location, format, payment } = render(opportunity);
  const copy = text(tree);
  const nodes = all(tree);
  // The decision facts are labelled rows (FactRow is an inert seam here, so read its props).
  const facts = Object.fromEntries(nodes.filter(node => node.type === 'FactRow').map(node => [node.props.label, node.props.value]));
  expect(Object.keys(facts)).toEqual(['Schedule', 'Area', 'Job budget', 'Payment']);
  expect(facts).toEqual({
    Schedule: format.formatOpportunitySchedule(opportunity.scheduled_at),
    Area: format.formatOpportunityArea(opportunity.barangay, opportunity.city),
    'Job budget': format.formatOpportunityBudget(opportunity.budget),
    Payment: payment.formatOpportunityPaymentLine(opportunity.payment_method),
  });
  for (const value of [opportunity.title, opportunity.description,
    format.formatOpportunityMatchLine(opportunity.total_points), format.formatSkillScoreLine(opportunity.skill_points),
    format.formatLocationScoreLine(opportunity.location_points), format.formatRatingScoreLine(opportunity.rating_points)]) expect(copy).toContain(value);
  expect(nodes.find(node => node.type === 'WorkerOpportunityJobLocation').props.location).toBe(location);
  expect(nodes.find(node => node.type === 'AppChip').props.label).toBe('Electrical installation');
  expect(nodes.find(node => node.type === 'GuidanceSection').props.missingSkillNames).toEqual(['Electrical installation']);
  expect(tree.type).toBe('View');
  const scroller = nodes.find(node => node.type === 'ScrollView');
  expect(scroller).toBeDefined();
  expect(all(scroller).some(node => node.props?.accessibilityLabel === `Accept ${opportunity.title}`)).toBe(false);
  expect(nodes.at(-1).props).toMatchObject({ label: 'Accept', disabled: false, accessibilityLabel: `Accept ${opportunity.title}` });
  for (const node of nodes.filter(node => node.type === 'Text')) {
    expect(node.props.numberOfLines).toBeUndefined(); expect(node.props.ellipsizeMode).toBeUndefined();
    expect(node.props.allowFontScaling).not.toBe(false); expect(node.props.style.height).toBeUndefined();
  }
});

it('omits absent optional facts while retaining legacy payment disclosure and no-requirements behavior', () => {
  const { tree, payment } = render({ ...opportunity, description: null, budget: null, scheduled_at: null, barangay: null, city: null, payment_method: null }, []);
  const nodes = all(tree);
  const facts = Object.fromEntries(nodes.filter(node => node.type === 'FactRow').map(node => [node.props.label, node.props.value]));
  // An absent fact renders nothing (FactRow returns null for a null value); nothing is invented.
  for (const label of ['Job budget', 'Schedule', 'Area']) expect(facts[label]).toBeNull();
  expect(facts.Payment).toBe(payment.formatOpportunityPaymentLine(null));
  expect(nodes.filter(node => node.type === 'GuidanceSection')).toHaveLength(0);
  expect(nodes.at(-1).props.label).toBe('Accept');
});

it('preserves normal-text contrast through composed detail surfaces', () => {
  const { tree, colors } = render(opportunity);
  const luminance = (hex: string) => hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  function check(node: any, inherited: string) {
    if (Array.isArray(node)) { node.forEach(child => check(child, inherited)); return; }
    if (!node?.props) return;
    const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style ?? {}, background = style.backgroundColor ?? inherited;
    expect(style.opacity ?? 1).toBe(1);
    if (node.type === 'Text') {
      const front = luminance(style.color), back = luminance(background);
      expect((Math.max(front, back) + .05) / (Math.min(front, back) + .05)).toBeGreaterThanOrEqual(4.5);
    }
    check(node.props.children, background);
  }
  check(tree, colors.canvas);
});

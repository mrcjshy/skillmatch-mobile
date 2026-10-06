// @ts-expect-error -- Offline TSX component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { createWorkerAcceptHandoff } from '@/lib/worker-accept-handoff-focus';

type P = Record<string, any>;
const noop = () => undefined;
const node = (type: any, props: P): any => typeof type === 'function' ? type(props) : ({ type, props });
const motionSeam = { reduced: false, rowLayout: 'rowLayout', fadeIn: 'fadeIn' };
const revealIds: string[][] = [];
function harness(file: string, overrides: P = {}) {
  const raw = readFileSync(file, 'utf8');
  const states: any[] = [], refs: any[] = [], focuses: any[] = [], effects: any[] = [];
  let cursor = 0, refCursor = 0;
  const account = { id: 'worker-id', role: 'worker', is_active: true, full_name: 'Maria Ysabel dela Cruz' };
  const navigation: any[] = [];
  const transitions: Record<string, (event: any) => void> = {};
  const modules: P = {
    react: { useState: (initial: any) => { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (value: any) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; }, useRef: (value: any) => refs[refCursor++] ?? (refs[refCursor - 1] = { current: value }), useCallback: (fn: any) => fn, useEffect: (fn: any) => effects.push(fn), useLayoutEffect: (fn: any) => effects.push(fn) },
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    'react-native': { ...Object.fromEntries(['View', 'Text', 'ScrollView', 'FlatList', 'RefreshControl', 'ActivityIndicator'].map(x => [x, x])), StyleSheet: { create: (value: any) => value }, AppState: { currentState: 'active', addEventListener: () => ({ remove: noop }) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 24 }) },
    'expo-router': { useNavigation: () => ({ addListener: (name: string, fn: any) => { transitions[name] = fn; return () => { delete transitions[name]; }; } }), useRouter: () => ({ push: (target: any) => navigation.push(target), replace: (target: any) => navigation.push(target) }), useFocusEffect: (fn: any) => focuses.push(fn) },
    '@/providers/account-provider': { useAccount: () => ({ account }) },
    '@/providers/session-provider': { useSession: () => ({ session: { user: { id: account.id } } }) },
    '@/providers/worker-profile-provider': { useWorkerProfile: () => ({ availability: 'available', isVerified: true, isLoading: false, refreshPersistedAvailability: async () => undefined }) },
    '@/constants/theme': leaf('src/constants/theme.ts'),
    '@/lib/job-opportunities': { JOB_OPPORTUNITY_COPY: { loadFailed: 'Read failed' }, loadMyJobOpportunities: async () => [], formatOpportunityArea: () => 'Santa Ana', formatOpportunityBudget: () => '₱2,500', formatOpportunitySchedule: () => 'October 1', formatOpportunityMatchLine: () => 'Match Score: 91/100', formatSkillScoreLine: () => 'Skills: 50', formatLocationScoreLine: () => 'Location: 30', formatRatingScoreLine: () => 'Rating: 11' },
    '@/lib/home-greeting': { homeGreeting: () => 'Good evening' },
    '@/lib/initials': { firstNameFromFullName: () => 'Maria' },
    '@/lib/booking-records': { loadWorkerBookings: async () => [] },
    '@/lib/worker-identity': { workerHomeIdentityNotice: () => 'none', getMyIdentitySubmission: async () => null },
    '@/lib/realtime': { createCoalescedInvalidation: (fn: any) => ({ invalidate: fn, cancel: noop }), subscribeInvalidation: () => noop, workerOpportunitiesTopic: () => 'worker' },
    '@/components/grouped-row': leaf('src/components/grouped-row.ts'),
    '@/lib/worker-opportunity-sort': sortModule(),
    // Inert motion seam: the Reanimated list host stays a FlatList; reveal and presets are recorded.
    '@/components/motion': { MotionFlatList: 'FlatList', MotionView: 'MotionView', useMotion: () => motionSeam, useListReveal: (ids: string[]) => { revealIds.push([...ids]); return (id: string) => ({ entering: id }); } },
  };
  const exports: P = {};
  function require(id: string): any {
    if (id === '@/components/refinement-theme') return { useUiTheme: () => leaf('src/constants/theme.ts').SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: P) => children };
    if (id in overrides) return overrides[id];
    if (id in modules) return modules[id];
    if (id.startsWith('@/components/')) {
      const names = [...raw.matchAll(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g)].filter(x => x[2] === id).flatMap(x => x[1].split(',').map((x: string) => x.trim()));
      return Object.fromEntries(names.map(name => [name, name]));
    }
    throw Error('Missing inert seam ' + id);
  }
  new Function('require', 'exports', ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(require, exports);
  return { states, account, navigation, focuses, effects, transitions, render: (props: P = {}) => { cursor = 0; refCursor = 0; focuses.length = 0; effects.length = 0; const tree = exports.default(props); return typeof tree.type === 'function' ? tree.type(tree.props) : tree; } };
}
function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  return tree?.props ? [tree, ...all(tree.props.children)] : [];
}
const home = 'src/app/(worker)/(tabs)/worker/index.tsx';
const rows = [{ job_id: 'ranked-first', title: 'A complete long opportunity name', total_points: 91 }, { job_id: 'ranked-tie', title: 'Second tied record', total_points: 91 }];
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function leaf(file: string): P {
  const exports: P = {};
  const require = (id: string): any => {
    if (id === '@/components/refinement-theme') return { useUiTheme: () => leaf('src/constants/theme.ts').SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: P) => children };
    if (id === '@/global.css') return {};
    if (id === 'react/jsx-runtime') return { jsx: node, jsxs: node };
    if (id === 'react-native') return { StyleSheet: { create: (x: any) => x, hairlineWidth: 1 }, Platform: { select: (x: any) => x.android ?? x.default }, Text: 'Text', View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator' };
      if (id === '@/components/app-symbol') return { AppSymbol: 'SymbolView' };
    if (id === '@/constants/theme') return leaf('src/constants/theme.ts');
    throw Error('Unexpected leaf dependency ' + id);
  };
  new Function('require', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(require, exports);
  return exports;
}
/** The real Wave 7 sort module; only its posting-date read is stubbed (no network). */
function sortModule(postedAt: Record<string, string> = {}): P {
  const exports: P = {};
  const require = (id: string): any => {
    if (id === './supabase') return { supabase: { from: () => ({ select: () => ({ in: async (_: string, ids: string[]) => ({ data: ids.filter(id => postedAt[id]).map(id => ({ id, created_at: postedAt[id] })), error: null }) }) }) } };
    throw Error('Unexpected sort dependency ' + id);
  };
  new Function('require', 'exports', ts.transpileModule(readFileSync('src/lib/worker-opportunity-sort.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(require, exports);
  return exports;
}
const flatten = (style: any): P => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : style ?? {};
function contrast(tree: any, pressed: boolean, background: string): void {
  if (Array.isArray(tree)) { tree.forEach(x => contrast(x, pressed, background)); return; }
  if (!tree?.props) return;
  const style = flatten(typeof tree.props.style === 'function' ? tree.props.style({ pressed }) : tree.props.style);
  expect(style.opacity ?? 1).toBe(1);
  const surface = style.backgroundColor && style.backgroundColor !== 'transparent' ? style.backgroundColor : background;
  const luminance = (hex: string) => hex.slice(1).match(/../g)!.map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  if (tree.type === 'Text' || tree.type === 'ActivityIndicator') {
    const front = luminance(tree.type === 'Text' ? style.color : tree.props.color), back = luminance(surface);
    expect((Math.max(front, back) + .05) / (Math.min(front, back) + .05)).toBeGreaterThanOrEqual(tree.type === 'Text' ? 4.5 : 3);
  }
  contrast(tree.props.children, pressed, surface);
}

it('Home keeps name and status in the sticky header above the list and renders every available job as a row', () => {
  const h = harness(home); h.states.splice(0, 6, false, null, [...rows, ...rows], [], null, true);
  const nodes = all(h.render());
  const header = nodes.find(x => x.type === 'HomeStickyHeader');
  expect(header.props).toMatchObject({ name: 'Maria', role: 'worker' });
  expect(all(header).filter(x => x.type === 'AvailabilityControl').map(x => x.props.compact)).toEqual([true]);
  const list = nodes.find(x => x.type === 'FlatList');
  // The header is a sibling above the scroller, never part of the scrolling content.
  expect(nodes.indexOf(header)).toBeLessThan(nodes.indexOf(list));
  const lead = all(list.props.ListHeaderComponent);
  expect(lead.some(x => x.type === 'HomeStickyHeader' || x.type === 'AvailabilityControl')).toBe(false);
  // Active work rides in the sticky header (compact, with View all to the Active list), not the scroller.
  expect(lead.filter(x => x.type === 'ActiveBookingHomeCard')).toHaveLength(0);
  const active = all(header).find(x => x.type === 'ActiveBookingHomeCard');
  expect(active.props).toMatchObject({ role: 'worker', compact: true });
  active.props.onPressViewAll();
  expect(h.navigation.at(-1)).toEqual({ pathname: '/worker/bookings', params: { segment: 'active' } });
  active.props.onPressPrimary({ booking_id: 'b-1' });
  expect(h.navigation.at(-1)).toEqual({ pathname: '/worker/booking-details', params: { bookingId: 'b-1' } });
  h.navigation.length = 0;
  expect(all(header).find(x => x.type === 'SectionHeader').props.title).toBe('Available jobs');
  // Server order is kept and every job is listed; there is no entry button, overlay or modal.
  expect(list.props.data.map((x: P) => x.job_id)).toEqual(['ranked-first', 'ranked-tie', 'ranked-first', 'ranked-tie']);
  expect(nodes.some(x => x.type === 'FindWorkOverlay' || x.type === 'Modal' || x.type === 'AppButton')).toBe(false);
  const card = all(list.props.renderItem({ item: rows[0], index: 0 })).find(x => x.type === 'JobOpportunityCompactCard');
  expect(card.props.compact).toBe(true); expect(card.props.opportunity).toBe(rows[0]);
  card.props.onPress();
  expect(h.navigation).toEqual([{ pathname: '/worker/opportunity-details', params: { jobId: 'ranked-first' } }]);
});

it('Home explains an empty list by state: busy, loading, failed or nothing matching', () => {
  const status = (h: ReturnType<typeof harness>) => all(all(h.render()).find(x => x.type === 'FlatList').props.ListEmptyComponent).find(x => x.type === 'InlineStatus').props;
  const h = harness(home); h.states.splice(0, 6, false, null, [], [], null, true);
  expect(status(h)).toMatchObject({ variant: 'empty', message: 'No matching jobs right now.' });
  h.states[0] = true; expect(status(h).variant).toBe('loading');
  h.states.splice(0, 2, false, 'Read failed'); expect(status(h)).toMatchObject({ variant: 'error', message: 'Read failed' });
  const busy = harness(home, { '@/providers/worker-profile-provider': { useWorkerProfile: () => ({ availability: 'busy', isVerified: true, isLoading: false, refreshPersistedAvailability: async () => undefined }) } });
  busy.states.splice(0, 6, false, null, rows, [], null, true);
  expect(status(busy)).toMatchObject({ variant: 'note', message: 'Set your status to Available to see matching jobs.' });
  expect(all(busy.render()).find(x => x.type === 'FlatList').props.data).toEqual([]);
});

it('Details keeps summary before description and location before guidance, with acceptance outside the scroll area', () => {
  const h = harness('src/components/job-opportunity-details.tsx', {
    '@/lib/worker-accept-handoff-focus': { createWorkerAcceptHandoff: () => ({}) },
    '@/lib/skill-gap': { computeSkillGap: () => ({ matchedSkills: [], missingSkills: [{ id: 1, name: 'Electrical installation' }] }) },
    '@/lib/opportunity-location': {}, '@/lib/job-payment': { formatOpportunityPaymentLine: () => 'Cash on delivery' },
  });
  h.states.splice(0, 10, { latitude: 15 }, { ...rows[0], description: 'Long complete job description', job_id: '11111111-1111-4111-8111-111111111111' }, { status: 'ready', skills: [{ id: 1, name: 'Electrical installation' }], workerSkills: [] }, false, false, null, false, false, null, {});
  const tree = h.render({ jobId: '11111111-1111-4111-8111-111111111111' }); const nodes = all(tree);
  const schedule = nodes.findIndex(x => x.type === 'FactRow' && x.props.label === 'Schedule');
  const description = nodes.findIndex(x => x.type === 'Text' && x.props.children === 'Long complete job description');
  expect(schedule).toBeLessThan(description);
  expect(nodes.findIndex(x => x.type === 'WorkerOpportunityJobLocation')).toBeLessThan(nodes.findIndex(x => x.type === 'GuidanceSection'));
  expect(tree.type).toBe('View');
  const scroller = nodes.find(x => x.type === 'ScrollView');
  expect(scroller).toBeDefined();
  expect(all(scroller).some(x => x.props?.label === 'Accept')).toBe(false);
  expect(nodes.at(-1).props.label).toBe('Accept');
  expect(nodes.at(-1).props.disabled).toBe(false);
});

it('Details preserves no-requirements presentation without introducing a guidance-generation entry', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const h = harness('src/components/job-opportunity-details.tsx', {
    '@/lib/worker-accept-handoff-focus': { createWorkerAcceptHandoff: () => ({}) },
    '@/lib/skill-gap': { computeSkillGap: () => ({ matchedSkills: [], missingSkills: [] }) },
    '@/lib/opportunity-location': {}, '@/lib/job-payment': { formatOpportunityPaymentLine: noop },
  });
  h.states.splice(0, 10, null, { ...rows[0], job_id: id }, { status: 'ready', skills: [], workerSkills: [] }, false, false, null, false, false, null, {});
  expect(all(h.render({ jobId: id })).filter(x => x.type === 'GuidanceSection')).toHaveLength(0);
});

it('Home focus cleanup suppresses late booking/identity reads', async () => {
  let bookingReply: any, identityReply: any;
  const h = harness(home, {
    '@/lib/booking-records': { loadWorkerBookings: () => new Promise(r => { bookingReply = r; }) },
    '@/lib/worker-identity': { workerHomeIdentityNotice: () => 'none', getMyIdentitySubmission: () => new Promise(r => { identityReply = r; }) },
  });
  h.render(); const cleanup = h.focuses[0](); cleanup?.();
  bookingReply([{ booking_id: 'stale-booking' }]); identityReply({ status: 'rejected' }); await flush();
  expect(h.states[3]).toEqual([]); expect(h.states[4]).toBe(null); expect(h.states[5]).toBe(false);
});

it('Home revokes pending booking/identity reads across suspension and clears private content', async () => {
  let bookingReply: any, identityReply: any, listener: any;
  const h = harness(home, {
    '@/lib/booking-records': { loadWorkerBookings: () => new Promise(r => { bookingReply = r; }) },
    '@/lib/worker-identity': { workerHomeIdentityNotice: () => 'none', getMyIdentitySubmission: () => new Promise(r => { identityReply = r; }) },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', StyleSheet: { create: (x: any) => x }, AppState: { currentState: 'active', addEventListener: (_: any, fn: any) => { listener = fn; return { remove: noop }; } } },
  });
  h.render(); const cleanup = h.focuses[0](); listener?.('background');
  bookingReply([{ booking_id: 'suspended-booking' }]); identityReply({ status: 'rejected' }); await flush();
  expect(h.states[3]).toEqual([]); expect(h.states[4]).toBe(null); expect(h.states[5]).toBe(false); cleanup();
});

it('Home hides already-loaded booking/opportunity content before passive cleanup on account/authorization loss', () => {
  const h = harness(home);
  h.states.splice(0, 6, false, null, rows, [{ booking_id: 'private-booking' }], null, true);
  const list = () => all(h.render()).find(x => x.type === 'FlatList');
  const booking = () => all(all(h.render()).find(x => x.type === 'HomeStickyHeader')).find(x => x.type === 'ActiveBookingHomeCard').props.bookings;
  expect(list().props.data).toHaveLength(2); expect(booking()).toHaveLength(1);
  h.account.id = 'new-worker';
  expect(list().props.data).toHaveLength(0);
  expect(booking()).toEqual([]);
  h.account.is_active = false; expect(booking()).toEqual([]); expect(list().props.data).toHaveLength(0);
});

it('Details required-skill replies cannot replace a later authorized job or survive access loss', async () => {
  let requiredReply: any, workerReply: any;
  const h = harness('src/components/job-opportunity-details.tsx', {
    '@/lib/worker-accept-handoff-focus': { createWorkerAcceptHandoff: () => ({}) },
    '@/lib/skill-gap': { loadMyWorkerSkills: () => new Promise(r => { workerReply = r; }), computeSkillGap: () => ({ matchedSkills: [], missingSkills: [] }) },
    '@/lib/job-opportunities': { JOB_OPPORTUNITY_COPY: {}, loadOpportunityRequiredSkills: () => new Promise(r => { requiredReply = r; }), formatOpportunityArea: noop, formatOpportunityBudget: noop, formatOpportunitySchedule: noop, formatOpportunityMatchLine: noop, formatSkillScoreLine: noop, formatLocationScoreLine: noop, formatRatingScoreLine: noop },
    '@/lib/opportunity-location': {}, '@/lib/job-payment': { formatOpportunityPaymentLine: noop },
  });
  h.states.splice(0, 10, null, { ...rows[0], job_id: 'old-job' }, { status: 'loading' }, false, false, null, false, false, null, {});
  h.render({ jobId: 'old-job' }); const cleanup = h.effects.at(-1)(); cleanup();
  h.states[1] = null; requiredReply([{ id: 1, name: 'Stale skill' }]); workerReply([]); await flush();
  expect(h.states[2]).toEqual({ status: 'loading' });
});

it('Details access invalidation revokes an in-flight skill reply before passive effect cleanup', async () => {
  let publish: any, requiredReply: any;
  const id = '11111111-1111-4111-8111-111111111111';
  const h = harness('src/components/job-opportunity-details.tsx', {
    '@/lib/worker-accept-handoff-focus': { createWorkerAcceptHandoff: () => ({}) },
    '@/lib/skill-gap': { loadMyWorkerSkills: async () => [], computeSkillGap: () => ({ matchedSkills: [], missingSkills: [] }) },
    '@/lib/job-opportunities': { JOB_OPPORTUNITY_COPY: {}, loadOpportunityRequiredSkills: () => new Promise(r => { requiredReply = r; }), formatOpportunityArea: noop, formatOpportunityBudget: noop, formatOpportunitySchedule: noop, formatOpportunityMatchLine: noop, formatSkillScoreLine: noop, formatLocationScoreLine: noop, formatRatingScoreLine: noop },
    '@/lib/opportunity-location': { createOpportunityLocationAccess: (options: any) => { publish = options.onState; return { refresh: async () => undefined, cancel: noop, invalidate: noop }; } },
    '@/lib/job-payment': { formatOpportunityPaymentLine: noop },
  });
  h.render({ jobId: id }); const cleanup = h.focuses[1]();
  publish({ status: 'ready', opportunity: { ...rows[0], job_id: id }, location: null });
  h.render({ jobId: id }); h.effects.at(-1)();
  publish({ status: 'unavailable', opportunity: null, location: null });
  requiredReply([{ id: 99, name: 'Revoked private skill' }]); await flush();
  expect(h.states[2]).toEqual({ status: 'loading' }); cleanup();
});

it('actual Details Accept callback retains the real handoff duplicate-action gate and booking result navigation', async () => {
  let calls = 0, reply: any;
  const id = '11111111-1111-4111-8111-111111111111';
  const h = harness('src/components/job-opportunity-details.tsx', {
    '@/lib/worker-accept-handoff-focus': { createWorkerAcceptHandoff },
    '@/lib/skill-gap': { computeSkillGap: () => ({ matchedSkills: [], missingSkills: [] }) },
    '@/lib/job-opportunities': { JOB_OPPORTUNITY_COPY: {}, ACCEPT_JOB_COPY: {}, acceptJobNotice: () => ({ headline: 'Accepted' }), acceptJobOpportunity: () => { calls++; return new Promise(r => { reply = r; }); }, formatOpportunityArea: noop, formatOpportunityBudget: noop, formatOpportunitySchedule: noop, formatOpportunityMatchLine: noop, formatSkillScoreLine: noop, formatLocationScoreLine: noop, formatRatingScoreLine: noop },
    '@/lib/booking-records': { loadWorkerBookings: async () => [{ booking_id: 'accepted-booking', job_id: id }] },
    '@/lib/opportunity-location': {}, '@/lib/job-payment': { formatOpportunityPaymentLine: noop },
  });
  h.states.splice(0, 10, null, { ...rows[0], job_id: id }, { status: 'ready', skills: [], workerSkills: [] }, false, false, null, false, false, null, createWorkerAcceptHandoff());
  const tree = h.render({ jobId: id }); h.effects[0](); const cleanup = h.focuses[0]();
  const accept = all(tree).find(x => x.props.label === 'Accept');
  const first = accept.props.onPress(); const duplicate = accept.props.onPress(); expect(calls).toBe(1);
  reply({ status: 'accepted' }); await Promise.all([first, duplicate]); await flush();
  expect(h.navigation).toEqual([{ pathname: '/worker/booking-details', params: { bookingId: 'accepted-booking' } }]); cleanup();
});

it('Details composes real theme/buttons/chips with readable long text and resting/pressed/disabled/loading contrast', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  for (const [accepting, refreshing] of [[false, false], [true, false], [false, true]]) {
    const h = harness('src/components/job-opportunity-details.tsx', {
      '@/constants/theme': leaf('src/constants/theme.ts'),
      '@/components/app-button': leaf('src/components/app-button.tsx'), '@/components/app-chip': leaf('src/components/app-chip.tsx'), '@/components/section-header': leaf('src/components/section-header.tsx'),
      '@/lib/worker-accept-handoff-focus': { createWorkerAcceptHandoff: () => ({}) },
      '@/lib/skill-gap': { computeSkillGap: () => ({ matchedSkills: [{ id: 1, name: 'Complete long roofing and electrical installation skill name' }], missingSkills: [{ id: 2, name: 'Safe wiring inspection and troubleshooting of residential installations' }] }) },
      '@/lib/opportunity-location': {}, '@/lib/job-payment': { formatOpportunityPaymentLine: () => 'Cash on delivery' },
    });
    h.states.splice(0, 10, null, { ...rows[0], title: 'Complete long job name for installation and inspection of residential electrical systems', description: 'Full long description '.repeat(20), job_id: id }, { status: 'ready', skills: [{ id: 1 }], workerSkills: [] }, false, refreshing, null, accepting, false, null, {});
    const tree = h.render({ jobId: id });
    for (const text of all(tree).filter(x => x.type === 'Text')) { expect(text.props.numberOfLines).toBeUndefined(); expect(text.props.ellipsizeMode).toBeUndefined(); }
    const accept = all(tree).find(x => x.type === 'Pressable');
    expect(accept.props.disabled).toBe(accepting || refreshing); expect(accept.props.accessibilityState.busy).toBe(accepting);
    contrast(tree, false, '#FFFFFF'); contrast(tree, true, '#FFFFFF');
  }
});


it('returns from a job to the same mounted Home list, with no overlay to reopen and no transition listener', () => {
  const h = harness(home);
  h.states.splice(0, 6, false, null, rows, [], null, true);
  const list = () => all(h.render()).find(x => x.type === 'FlatList');
  all(list().props.renderItem({ item: rows[1], index: 1 })).find(x => x.type === 'JobOpportunityCompactCard').props.onPress();
  expect(h.navigation).toEqual([{ pathname: '/worker/opportunity-details', params: { jobId: 'ranked-tie' } }]);
  expect(Object.keys(h.transitions)).toEqual([]);
  expect(list().props.data).toEqual(rows);
  expect(readFileSync(home, 'utf8')).not.toMatch(/transitionEnd|useNavigation|returnToFindWork|findWorkOpen/);
});

it('Wave 7: Home offers Sort by (Best match, Job date, Date posted) and only reorders the server rows', async () => {
  const dated = [
    { job_id: 'best', title: 'Best match, posted first', total_points: 95, scheduled_at: '2099-03-01T01:00:00Z' },
    { job_id: 'soon', title: 'Soonest work', total_points: 90, scheduled_at: '2099-01-01T01:00:00Z' },
    { job_id: 'past', title: 'Already passed', total_points: 85, scheduled_at: '2000-01-01T01:00:00Z' },
    { job_id: 'unscheduled', title: 'No schedule', total_points: 80, scheduled_at: null },
  ];
  const h = harness(home, { '@/lib/worker-opportunity-sort': sortModule({ best: '2026-09-01T00:00:00Z', soon: '2026-09-03T00:00:00Z', past: '2026-09-02T00:00:00Z' }) });
  h.states.splice(0, 6, false, null, dated, [], null, true);
  const list = () => all(h.render()).find(x => x.type === 'FlatList');
  const control = () => all(h.render()).find(x => x.type === 'AppSegment');
  const ids = () => list().props.data.map((x: P) => x.job_id);
  // Default keeps the server ranking exactly as received.
  expect(control().props).toMatchObject({ accessibilityLabel: 'Sort by', value: 'match' });
  expect(control().props.options.map((x: P) => x.label)).toEqual(['Best match', 'Job date', 'Date posted']);
  expect(ids()).toEqual(['best', 'soon', 'past', 'unscheduled']);
  control().props.onChange('jobDate');
  expect(ids()).toEqual(['soon', 'best', 'past', 'unscheduled']);
  control().props.onChange('posted');
  h.render(); await h.effects.at(-1)(); await flush();
  expect(ids()).toEqual(['soon', 'past', 'best', 'unscheduled']);
  // The same rows every time: nothing added, dropped or re-scored.
  expect([...list().props.data].sort((a: P, b: P) => b.total_points - a.total_points)).toEqual(dated);
});

it('Wave 7: Sort by is hidden for zero or one job, so empty states stay as they were', () => {
  const h = harness(home); h.states.splice(0, 6, false, null, [rows[0]], [], null, true);
  expect(all(h.render()).some(x => x.type === 'AppSegment')).toBe(false);
  h.states[2] = [];
  const list = all(h.render()).find(x => x.type === 'FlatList');
  expect(all(h.render()).some(x => x.type === 'AppSegment')).toBe(false);
  expect(all(list.props.ListEmptyComponent).find(x => x.type === 'InlineStatus').props.variant).toBe('empty');
});


it('UI-L1: pulling the job list refreshes its rows and finishes while keeping the selected display order', async () => {
  const initial = [
    { job_id: 'later', title: 'Later', scheduled_at: '2099-03-01T00:00:00Z', total_points: 95 },
    { job_id: 'soon', title: 'Soon', scheduled_at: '2099-01-01T00:00:00Z', total_points: 90 },
  ];
  let release!: (rows: P[]) => void;
  let first = true;
  const h = harness(home, {
    '@/lib/job-opportunities': {
      JOB_OPPORTUNITY_COPY: { loadFailed: 'Read failed' },
      loadMyJobOpportunities: () => {
        if (first) { first = false; return Promise.resolve(initial); }
        return new Promise<P[]>(resolve => { release = resolve; });
      },
    },
  });
  h.render();
  const cleanups = h.focuses.slice(0, 2).map(fn => fn());
  await flush();
  const list = () => all(h.render()).find(x => x.type === 'FlatList');
  const sort = () => all(h.render()).find(x => x.type === 'AppSegment');
  expect(list().props.data.map((row: P) => row.job_id)).toEqual(['later', 'soon']);
  sort().props.onChange('jobDate');
  list().props.refreshControl.props.onRefresh();
  expect(list().props.refreshControl.props.refreshing).toBe(true);
  expect(sort().props.value).toBe('jobDate');
  expect(list().props.data.map((row: P) => row.job_id)).toEqual(['soon', 'later']);
  release([...initial, { job_id: 'earliest', title: 'New work', scheduled_at: '2098-12-01T00:00:00Z', total_points: 80 }]);
  await flush();
  expect(list().props.refreshControl.props.refreshing).toBe(false);
  expect(list().props.data.map((row: P) => row.job_id)).toEqual(['earliest', 'soon', 'later']);
  expect(sort().props.value).toBe('jobDate');
  cleanups.forEach(cleanup => cleanup?.());
});

it('Motion: rows reveal by id in display order, sorting glides the same rows, and only an empty result fades in', () => {
  const dated = [
    { job_id: 'best', title: 'Best', total_points: 95, scheduled_at: '2099-03-01T01:00:00Z' },
    { job_id: 'soon', title: 'Soon', total_points: 90, scheduled_at: '2099-01-01T01:00:00Z' },
  ];
  const h = harness(home); h.states.splice(0, 6, false, null, dated, [], null, true);
  revealIds.length = 0;
  const list = () => all(h.render()).find(x => x.type === 'FlatList');
  // The reorder transition is the shared preset, on the list's own cells (not on the fixed header).
  expect(list().props.itemLayoutAnimation).toBe('rowLayout');
  expect(revealIds.at(-1)).toEqual(['best', 'soon']);
  const row = list().props.renderItem({ item: dated[0], index: 0 });
  expect(row.type).toBe('MotionView');
  expect(row.props.entering).toEqual({ entering: 'best' });
  expect(all(row).find(x => x.type === 'JobOpportunityCompactCard').props.opportunity).toBe(dated[0]);
  // Changing the sort hands the same ids, in the new order, to the reveal (a reorder, not an arrival).
  all(h.render()).find(x => x.type === 'AppSegment').props.onChange('jobDate');
  list();
  expect(revealIds.at(-1)).toEqual(['soon', 'best']);
  expect([...revealIds.at(-1)!].sort()).toEqual([...revealIds.at(-2)!].sort());
  // Empty result: keyed fade. Loading and error: no entering motion at all.
  const empty = (h2: ReturnType<typeof harness>) => list2(h2).props.ListEmptyComponent;
  const list2 = (h2: ReturnType<typeof harness>) => all(h2.render()).find(x => x.type === 'FlatList');
  const e = harness(home); e.states.splice(0, 6, false, null, [], [], null, true);
  expect(empty(e).type).toBe('MotionView');
  expect(empty(e).props.entering).toBe('fadeIn');
  e.states[0] = true; expect(empty(e).props.entering).toBeUndefined();
  e.states.splice(0, 2, false, 'Read failed'); expect(empty(e).props.entering).toBeUndefined();
  // The inert JSX seam drops React keys; the status kind keys the wrapper so each state remounts.
  expect(readFileSync(home, 'utf8')).toContain("<MotionView key={jobsStatusKind} entering={jobsStatusKind === 'empty' ? motion.fadeIn : undefined}");
});

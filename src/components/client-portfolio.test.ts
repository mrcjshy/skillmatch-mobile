// @ts-expect-error -- Node-only component harness; no native layout claims.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { createLoadGenerationTracker } from '@/lib/booking-details-freshness';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

type Props = Record<string, any>;
const BOOKING = '11111111-1111-4111-8111-111111111111';
const ready = (name = 'Synthetic Worker', items: Props[] = []) => ({
  kind: 'ready', workerName: name, workerPhotoUrl: null, items,
  resume: { fullName: name, phone: '09170000000', barangay: 'Santa Ana', skills: ['Carpentry'], isVerified: true, ratingAvg: 4.5, ratingCount: 2 },
});
const copy = { loading: 'Loading resume and portfolio', retry: 'Try again', loadFailed: 'Load failed', unavailable: 'Confirmed booking required', empty: 'No projects yet.', imageUnavailable: 'Photo could not be loaded.' };
const same = (a: any[], b: any[]) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

function harness() {
  let cursor = 0, slots: any[] = []; const mainSlots = slots, effects = new Map<number, Props>();
  let pending: (() => void)[] = [], bookingId: string | null = BOOKING;
  let account: Props = { id: 'client-a', role: 'client', is_active: true };
  let revision = 1, guardAvailable = true, consent = true, accountStatus = 'resolved', lifecycle: (next: string) => void = () => {};
  const load = vi.fn(async (_id: unknown, _deps: Props) => ready() as Props);
  const subscriptions: Props[] = [];
  const subscribe = vi.fn((options: Props) => { subscriptions.push(options); return vi.fn(); });
  const effect = (fn: () => any, deps: any[]) => {
    const i = cursor++, old = effects.get(i);
    if (!old || !same(old.deps, deps)) pending.push(() => { old?.cleanup?.(); effects.set(i, { deps, cleanup: fn() }); });
  };
  const isRevisionCurrent = (captured: number) => captured === revision;
  const react = {
    useState: (initial: any) => { const i = cursor++, owner = slots; if (!(i in owner)) owner[i] = typeof initial === 'function' ? initial() : initial; return [owner[i], (value: any) => { owner[i] = typeof value === 'function' ? value(owner[i]) : value; }]; },
    useRef: (value: any) => { const i = cursor++; return slots[i] ??= { current: value }; },
    useCallback: (fn: any, deps: any[]) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect: effect,
  };
  const native: Props = { ...Object.fromEntries(['View', 'Text', 'ScrollView', 'FlatList', 'RefreshControl'].map(name => [name, name])),
    StyleSheet: { create: (value: any) => value, hairlineWidth: 1 },
    AppState: { currentState: 'active', addEventListener: (_event: string, fn: (next: string) => void) => { lifecycle = fn; return { remove: vi.fn() }; } },
  };
  const jsx = (type: any, props: Props, key?: string) => ({ type, props, key });
  const modules: Props = {
    react, 'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-router': { useFocusEffect: (fn: () => any) => effect(fn, [fn]) }, 'expo-image': { Image: 'Image' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 24 }) },
    '@/lib/client-portfolio': { CLIENT_PORTFOLIO_COPY: copy, loadClientBookingPortfolio: load },
    '@/lib/booking-records': { loadClientBookings: vi.fn() },
    '@/lib/booking-details-freshness': { createLoadGenerationTracker },
    '@/lib/realtime': { subscribeInvalidation: subscribe, bookingMessagesTopic: (id: string) => `booking:${id}:messages`, BOOKING_STATUS_CHANGED: 'booking_status_changed' },
    '@/lib/portfolio': { projectScaleLabel: (scale: string) => `${scale} project` },
    '@/providers/account-provider': { useAccount: () => ({ account, status: accountStatus, hasCurrentConsent: consent }) },
    '@/providers/session-provider': { useSession: () => ({ session: { user: { id: account.id } }, isSessionLoading: false, sessionError: null, recoveryStatus: 'idle', sessionRevision: guardAvailable ? revision : undefined, isSessionRevisionCurrent: guardAvailable ? isRevisionCurrent : undefined }) },
    '@/constants/theme': { SkillMatchTheme: { ui: { colors: {}, type: {}, spacing: {}, radius: {} } } },
    ...Object.fromEntries(['app-button', 'initials-avatar', 'inline-status', 'section-header', 'surface-group'].map(name => [
      '@/components/' + name, { [name.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join('')]: name },
    ])),
  };
  const exports: Props = {};
  new Function('require', 'exports', ts.transpileModule(readFileSync('src/components/client-portfolio.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText)((name: string) => { if (!(name in modules)) throw Error('Unexpected module ' + name); return modules[name]; }, exports);
  const childSlots = new Map<string, any[]>();
  function expand(tree: any): any {
    if (Array.isArray(tree)) return tree.map(expand);
    if (!tree || typeof tree !== 'object' || !tree.props) return tree;
    if (typeof tree.type === 'function') {
      const key = `${tree.type.name}:${tree.key ?? tree.props.image?.id ?? tree.props.item?.id ?? ''}`;
      const previous = slots, index = cursor; slots = childSlots.get(key) ?? []; childSlots.set(key, slots); cursor = 0;
      try { return expand(tree.type(tree.props)); } finally { slots = previous; cursor = index; }
    }
    return { ...tree, props: { ...tree.props, children: expand(tree.props.children), ListHeaderComponent: expand(tree.props.ListHeaderComponent), ListEmptyComponent: expand(tree.props.ListEmptyComponent), action: expand(tree.props.action) } };
  }
  const render = (flush = true) => { slots = mainSlots; cursor = 0; pending = []; const tree = exports.default({ bookingId }); if (flush) pending.splice(0).forEach(fn => fn()); return expand(tree); };
  return { load, subscribe, subscriptions, render, expand,
    account: (next: Props) => { account = next; revision++; },
    booking: (next: string) => { bookingId = next; },
    consent: (next: boolean) => { consent = next; },
    accountStatus: (next: string) => { accountStatus = next; },
    rotateSession: () => { revision++; },
    omitSessionGuard: () => { guardAvailable = false; },
    appState: (next: string) => { native.AppState.currentState = next; lifecycle(next); },
    unmount: () => { effects.forEach(value => value.cleanup?.()); effects.clear(); },
  };
}
function nodes(tree: any): any[] {
  return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' && tree.props ?
    [tree, ...nodes(tree.props.children), ...nodes(tree.props.ListHeaderComponent), ...nodes(tree.props.ListEmptyComponent), ...nodes(tree.props.action)] : [];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return [tree.props?.title, tree.props?.message, tree.props?.label, text(tree.props?.children), text(tree.props?.ListHeaderComponent), text(tree.props?.ListEmptyComponent), text(tree.props?.action)].filter(Boolean).join(' ');
}
async function settle() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function deferred() { let resolve!: (result: Props) => void; const promise = new Promise<Props>(done => { resolve = done; }); return { promise, resolve }; }

it('shows the automatic professional resume and portfolio in one virtualized accessible view', async () => {
  const h = harness(); const item = { id: 'project-a', title: 'Saved project', description: 'Saved details', projectScale: 'small', images: [] };
  h.load.mockResolvedValue(ready('Synthetic Worker', [item])); h.render(); await settle(); const tree = h.render();
  expect(text(tree)).toContain('Carpentry'); expect(text(tree)).toContain('09170000000'); expect(text(tree)).toContain('4.5');
  const list = nodes(tree).find(node => node.type === 'FlatList'); expect(list).toBeDefined();
  expect(list.props.initialNumToRender).toBeLessThanOrEqual(3); expect(list.props.data).toEqual([item]);
  expect(text(h.expand(list.props.renderItem({ item })))).toContain('Saved details');
  expect(nodes(tree).some(node => node.props.accessibilityRole === 'header')).toBe(true);
  expect(nodes(tree).some(node => /Generate|Share|Export/.test(node.props.label ?? ''))).toBe(false);
});

it('fails closed without the session authority guard', () => {
  const h = harness(); h.omitSessionGuard();
  expect(text(h.render())).toContain(copy.unavailable);
  expect(h.load).not.toHaveBeenCalled();
});

it('keeps an honest partial resume and no-project state without invented sections', async () => {
  const h = harness(); const data = ready(); data.resume = { fullName: null, phone: null, barangay: null, skills: [], isVerified: null, ratingAvg: null, ratingCount: null } as any;
  h.load.mockResolvedValue(data); h.render(); await settle(); const content = text(h.render());
  expect(content).toContain('No skills shared yet.'); expect(content).toContain('No projects yet.');
  expect(content).not.toMatch(/Education|Certification|Employment|References|Verified Worker|09170000000/);
});

it('masks the previous account immediately and ignores its late result', async () => {
  const h = harness(), old = deferred(); h.load.mockImplementationOnce(() => old.promise); h.render();
  h.account({ id: 'client-b', role: 'client', is_active: true }); h.load.mockResolvedValue(ready('Worker B'));
  expect(text(h.render(false))).not.toContain('Synthetic Worker'); h.render(); await settle();
  old.resolve(ready('PRIVATE WORKER A')); await settle();
  expect(text(h.render())).toContain('Worker B'); expect(text(h.render())).not.toContain('PRIVATE WORKER A');
  expect(h.load.mock.calls[0][1].isCurrent()).toBe(false);
});

it('masks old booking data before effects and ignores late booking responses', async () => {
  const h = harness(); h.render(); await settle(); expect(text(h.render())).toContain('Synthetic Worker');
  const slow = deferred(); h.load.mockImplementationOnce(() => slow.promise);
  h.booking('22222222-2222-4222-8222-222222222222'); expect(text(h.render(false))).not.toContain('Synthetic Worker'); h.render();
  h.booking('33333333-3333-4333-8333-333333333333'); h.load.mockResolvedValue(ready('Worker C')); h.render(); await settle();
  slow.resolve(ready('PRIVATE WORKER B')); await settle(); expect(text(h.render())).toContain('Worker C'); expect(text(h.render())).not.toContain('PRIVATE WORKER B');
});

it.each(['consent', 'accountStatus', 'inactive', 'role'])('hides data as soon as %s authority is lost', async (boundary) => {
  const h = harness(); h.render(); await settle(); expect(text(h.render())).toContain('Synthetic Worker');
  if (boundary === 'consent') h.consent(false);
  if (boundary === 'accountStatus') h.accountStatus('error');
  if (boundary === 'inactive') h.account({ id: 'client-a', role: 'client', is_active: false });
  if (boundary === 'role') h.account({ id: 'client-a', role: 'worker', is_active: true });
  expect(text(h.render(false))).not.toContain('Synthetic Worker');
});

it('clears content during a status invalidation and retains no terminal access', async () => {
  const h = harness(); h.render(); await settle(); h.render();
  expect(h.subscriptions[0]?.topic).toBe(`booking:${BOOKING}:messages`);
  h.load.mockResolvedValue({ kind: 'revoked' }); h.subscriptions[0].onInvalidate();
  expect(text(h.render())).not.toContain('Synthetic Worker'); await settle(); expect(text(h.render())).toContain(copy.unavailable);
});

it('does not restore private data from an in-flight read after transport loss', async () => {
  const h = harness(); h.render(); await settle(); h.render(); const slow = deferred();
  h.load.mockImplementationOnce(() => slow.promise); h.subscriptions[0].onInvalidate(); h.subscriptions[0].onUnavailable();
  slow.resolve(ready('STALE CONTENT')); await settle(); expect(text(h.render())).not.toContain('STALE CONTENT');
});

it('clears content in background and reauthorizes on foreground', async () => {
  const h = harness(); h.render(); await settle(); h.render(); h.appState('background');
  expect(text(h.render())).not.toContain('Synthetic Worker'); h.load.mockResolvedValue({ kind: 'unavailable' });
  h.appState('active'); await settle(); expect(text(h.render())).toContain(copy.unavailable);
});

it('uses a fixed retryable error, and treats permission denial as unavailable', async () => {
  const h = harness(); h.load.mockRejectedValueOnce(Error('PRIVATE SERVER ERROR')); h.render(); await settle();
  expect(text(h.render())).toContain(copy.loadFailed); expect(text(h.render())).not.toContain('PRIVATE SERVER');
  nodes(h.render()).find(node => node.props.label === copy.retry).props.onPress(); await settle(); expect(text(h.render())).toContain('Synthetic Worker');
  h.load.mockRejectedValueOnce({ code: '42501' }); h.subscriptions[0].onInvalidate(); await settle(); expect(text(h.render())).toContain(copy.unavailable);
});

it('does not publish after unmount or reuse a previous session of the same account', async () => {
  const h = harness(), slow = deferred(); h.load.mockImplementationOnce(() => slow.promise); h.render();
  h.rotateSession(); h.load.mockResolvedValue({ kind: 'unavailable' }); h.render(); await settle();
  slow.resolve(ready('OLD SESSION')); await settle(); expect(text(h.render())).not.toContain('OLD SESSION');
  const last = deferred(); h.load.mockImplementationOnce(() => last.promise); h.rotateSession(); h.render(); h.unmount();
  last.resolve(ready('UNMOUNTED')); await settle(); expect(h.load.mock.calls.at(-1)?.[1].isCurrent()).toBe(false);
});

it('retains project text and an accessible fallback when a private image cannot load', async () => {
  const h = harness();
  const item = { id: 'project-a', title: 'Saved project', description: 'Saved details', projectScale: 'small', images: [{ id: 'photo-a', position: 1, signedUrl: 'https://signed.example/photo' }, { id: 'photo-b', position: 2, signedUrl: null }] };
  h.load.mockResolvedValue(ready('Synthetic Worker', [item])); h.render(); await settle();
  const tree = h.render(), list = nodes(tree).find(node => node.type === 'FlatList');
  expect(list).toBeDefined();
  const card = () => h.expand(list.props.renderItem({ item }));
  const image = nodes(card()).find(node => node.type === 'Image');
  expect(image.props.accessibilityLabel).toContain('Saved project'); expect(image.props.cachePolicy).toBe('memory');
  image.props.onError();
  expect(text(card())).toContain('Saved details'); expect(text(card())).toContain(copy.imageUnavailable);
  expect(nodes(card()).filter(node => node.type === 'Image')).toHaveLength(0);
});

it('replaces an obsolete Worker resume deep link with Worker Profile without loading private resume data', () => {
  const exports: Record<string, any> = {};
  const dependencies: string[] = [];
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  new Function('require', 'exports', ts.transpileModule(
    readFileSync('src/app/(worker)/worker/resume.tsx', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText)((name: string) => {
    dependencies.push(name);
    if (name === 'expo-router') return { Redirect: 'Redirect', Stack: { Screen: 'Screen' } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    return { default: 'LegacyResume', RESUME_COPY: { title: 'Legacy' } };
  }, exports);
  expect(exports.default()).toEqual({ type: 'Redirect', props: { href: '/worker/profile' } });
  expect(dependencies).not.toContain('@/components/resume-builder');
  expect(dependencies).not.toContain('@/lib/resume');
});

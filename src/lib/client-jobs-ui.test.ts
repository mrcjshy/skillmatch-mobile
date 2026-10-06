// @ts-expect-error -- Node-only inert TSX harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { formatCardDateTime } from './date-time';
import { formatClientPostedPaymentLine } from './job-payment';
vi.mock('./supabase', () => ({ supabase: {} }));
type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
const noop = () => {};
const node = (type: unknown, props: Props): Element => ({ type, props });
function load(path: string, seams: Record<string, Props>): Props {
  const raw = readFileSync(path, 'utf8'); const exports = {};
  const requireSeam = (id: string): Props => {
    if (seams[id]) return seams[id];
    if (id === '@/global.css') return {};
    if (id === 'react/jsx-runtime') return { jsx: node, jsxs: node, Fragment: 'Fragment' };
    if (id === '@/constants/theme') return load('src/constants/theme.ts', seams);
    if (id.startsWith('@/components/')) {
      const names = [...raw.matchAll(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g)].filter(m => m[2] === id).flatMap(m => m[1].split(',').map((n: string) => n.trim()).filter((n: string) => !n.startsWith('type ')));
      return Object.fromEntries(names.map(n => [n, n]));
    }
    throw new Error('Missing inert seam: ' + id);
  };
  new Function('require', 'exports', ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(requireSeam, exports);
  return exports;
}
function all(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(all);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const element = value as Element; return [element, ...all(element.props.children), ...all(Array.isArray(element.props.data) && element.props.data.length ? null : element.props.ListEmptyComponent), ...all(element.props.ListHeaderComponent)];
}
const sample = { id: '11111111-1111-4111-8111-111111111111', title: 'A long job title with a family name and content that wraps naturally', description: 'Long Unicode description trabaho\nsecond line '.repeat(8), status: 'open', scheduled_at: '2030-02-04T03:30:00Z', budget: 1500, payment_method: null, payment_method_readable: true, skills: ['Cleaning'] };
function setup(overrides: Props = {}) {
  const state: unknown[] = []; let cursor = 0; let focus!: () => (() => void) | undefined;
  const jobsState = { isLoading: false, loadError: null, jobs: [sample], refresh: vi.fn(async () => {}), ...overrides };
  let authorized = true; const push = vi.fn(), photo = vi.fn(), booking = vi.fn(), location = vi.fn();
  const sessionListeners = new Set<() => void>(); const appListeners = new Set<(next: string) => void>(); const effects: (() => unknown)[] = [];
  const native = { ...Object.fromEntries(['Text','View','ScrollView','FlatList','RefreshControl','Pressable','ActivityIndicator'].map(n => [n,n])), StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 }, Platform: { select: (p: Props) => p.default }, AppState: { currentState: 'active', addEventListener: (_: string, fn: (next: string) => void) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } } };
  const seams: Record<string, Props> = {
    react: { useState: (initial: unknown) => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], (next: unknown) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; }, useRef: (initial: unknown) => { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; }, useCallback: (fn: unknown) => fn, useEffect: (fn: () => unknown) => { effects.push(fn); }, useLayoutEffect: (fn: () => unknown) => { fn(); } },
    'react-native': native, 'expo-router': { useRouter: () => ({ push }), useFocusEffect: (fn: typeof focus) => { focus = fn; } },
    '@/providers/account-provider': { useAccount: () => ({ account: { id: 'client-a', role: 'client', is_active: true }, clientDraftTermination: { subscribe: () => noop } }) },
    '@/providers/session-provider': { useSession: () => ({ sessionRevision: 1, isSessionRevisionCurrent: () => authorized, subscribeSessionLifecycle: (fn: () => void) => { sessionListeners.add(fn); return () => { sessionListeners.delete(fn); }; } }) },
    '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => ({ isOwnerCurrent: () => authorized }) },
    '@/providers/client-jobs-provider': { useClientJobs: () => jobsState }, '@/lib/date-time': { formatCardDateTime }, '@/lib/job-payment': { formatClientPostedPaymentLine },
    '@/lib/job-photos': { listJobPhotos: photo }, '@/lib/booking-records': { loadClientBookings: booking }, '@/components/client-job-location': { ClientJobLocation: location },
  };
  const screen = load('src/app/(client)/(tabs)/client/jobs.tsx', seams).default as () => Element;
  const render = () => { cursor = 0; return screen(); };
  return { render, seams, appListenerCount: () => appListeners.size, mountEffects: () => { effects.forEach(fn => fn()); }, app: (next: string) => { native.AppState.currentState = next; for (const fn of [...appListeners]) fn(next); }, jobsState, push, photo, booking, location, focus: () => focus(), revoke: () => { authorized = false; for (const fn of sessionListeners) fn(); }, restore: () => { authorized = true; } };
}
const list = (tree: Element) => all(tree).find(e => e.type === 'FlatList')!;
const text = (tree: Element) => all(tree).filter(e => e.type === 'Text').map(e => e.props.children);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
describe('My Jobs actual static/offline composition; no native or Argent execution', () => {
  it('virtualizes original ordering, presents descriptions/dates/payment and pushes only jobId without private reads', () => {
    const s = setup({ jobs: [sample, { ...sample, id: '22222222-2222-4222-8222-222222222222', status: 'matched' }] });
    const tree = s.render(); s.focus(); const rows = list(tree);
    expect(tree.type).toBe('FlatList'); expect(rows.props.data).toBe(s.jobsState.jobs); expect(rows.props.contentInsetAdjustmentBehavior).toBe('automatic');
    const row = (rows.props.renderItem as (p: Props) => Element)({ item: sample });
    expect(text(row)).toContain(sample.title); expect(text(row)).toContain(sample.description);
    expect(text(row)).toContainEqual(['Schedule: ', formatCardDateTime(sample.scheduled_at)]);
    expect(text(row)).toContainEqual(['Budget: ', '\u20b1' + sample.budget.toLocaleString()]);
    expect(text(row)).toContain(formatClientPostedPaymentLine(null));
    expect(all(row).find(e => e.type === 'AppChip')!.props.label).toBe('Status: open');
    const details = all(row).find(e => e.type === 'AppButton')!;
    expect(details.props.label).toBe('Details'); expect(details.props.accessibilityLabel).toBe('Details for ' + sample.title);
    (details.props.onPress as () => void)(); expect(s.push).toHaveBeenCalledExactlyOnceWith({ pathname: '/client/job-details', params: { jobId: sample.id } });
    expect(s.photo).not.toHaveBeenCalled(); expect(s.booking).not.toHaveBeenCalled(); expect(s.location).not.toHaveBeenCalled();
    for (const element of all(row).filter(e => e.type === 'Text')) { expect(element.props.allowFontScaling).toBeUndefined(); expect(element.props.maxFontSizeMultiplier).toBeUndefined(); expect(element.props.numberOfLines).toBeUndefined(); }
  });
  it('renders sparse/unknown facts without guessing values or changing status', () => {
    const sparse = { ...sample, description: null, status: 'unknown-existing-status', scheduled_at: 'invalid', budget: null, skills: [], payment_method_readable: false };
    const s = setup({ jobs: [sparse] }); const row = (list(s.render()).props.renderItem as (p: Props) => Element)({ item: sparse });
    expect(text(row)).toContainEqual(['Schedule: ', 'No schedule']); expect(text(row)).toContainEqual(['Budget: ', 'Not set']); expect(text(row)).toContainEqual(['Skills: ', 'None']);
    expect(text(row)).not.toContain(formatClientPostedPaymentLine(null)); expect(all(row).find(e => e.type === 'AppChip')!.props.label).toBe('Status: unknown-existing-status');
  });
  it.each(['loading', 'error', 'empty'])('preserves %s state and never flashes empty during loading/error', state => {
    const s = setup({ jobs: [], isLoading: state === 'loading', loadError: state === 'error' ? 'Safe failure' : null });
    const statuses = all(s.render()).filter(e => e.type === 'InlineStatus');
    expect(statuses.map(e => e.props.variant)).toEqual([state]);
    if (state === 'error') expect(all(s.render()).find(e => e.type === 'AppButton')!.props.label).toBe('Retry');
  });
  it('focus/manual refresh preserves rows on failure and retry clears the local stale notice', async () => {
    const s = setup(); s.jobsState.refresh.mockRejectedValueOnce(new Error('Private backend error')).mockResolvedValueOnce(undefined);
    s.render(); const cleanup = s.focus(); await flush();
    const failed = s.render(); expect(list(failed).props.data).toHaveLength(1); expect(all(failed).find(e => e.type === 'InlineStatus')!.props.message).toBe("Couldn't refresh your jobs. Showing the last loaded jobs.");
    const retry = all(failed).find(e => e.type === 'AppButton')!; (retry.props.onPress as () => void)(); await flush();
    expect(all(s.render()).filter(e => e.type === 'InlineStatus')).toHaveLength(0); expect(s.jobsState.refresh).toHaveBeenCalledTimes(2); cleanup?.();
  });
  it('blur and same-owner reauthorization cannot revive a pending refresh error', async () => {
    let reject!: (reason: Error) => void; const pending = new Promise<void>((_, fail) => { reject = fail; });
    const s = setup(); s.jobsState.refresh.mockReturnValueOnce(pending); s.render(); const cleanup = s.focus();
    cleanup?.(); s.revoke(); s.restore(); reject(new Error('Late failure')); await flush();
    expect(all(s.render()).filter(e => e.type === 'InlineStatus')).toHaveLength(0);
  });
  it('current-authorization checks deny stale Details callbacks', () => {
    const s = setup(); s.render(); s.focus(); const row = (list(s.render()).props.renderItem as (p: Props) => Element)({ item: sample }); const details = all(row).find(e => e.type === 'AppButton')!;
    s.revoke(); (details.props.onPress as () => void)(); expect(s.push).not.toHaveBeenCalled();
  });
});


const flattenStyle = (value: unknown): Props => Array.isArray(value) ? Object.assign({}, ...value.map(flattenStyle)) : value && typeof value === 'object' ? value as Props : {};
function ratio(a: string, b: string): number {
  const l = (hex: string) => { const v = [1,3,5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return v[0]*0.2126 + v[1]*0.7152 + v[2]*0.0722; };
  return (Math.max(l(a), l(b)) + 0.05) / (Math.min(l(a), l(b)) + 0.05);
}
function checkComposed(element: Element, background: string, seams: Record<string, Props>, pressed: boolean): void {
  if (element.type === 'AppButton' || element.type === 'AppChip' || element.type === 'InlineStatus') {
    const paths: Record<string, string> = { AppButton: 'app-button', AppChip: 'app-chip', InlineStatus: 'inline-status' };
    const component = load('src/components/' + paths[element.type] + '.tsx', seams)[element.type] as (p: Props) => Element;
    checkComposed(component(element.props), background, seams, pressed); return;
  }
  const style = flattenStyle(typeof element.props.style === 'function' ? element.props.style({ pressed }) : element.props.style);
  const ownBackground = typeof style.backgroundColor === 'string' && style.backgroundColor !== 'transparent' ? style.backgroundColor : background;
  if (element.type === 'Text') {
    expect(ratio(style.color as string, ownBackground)).toBeGreaterThanOrEqual(4.5);
    expect(element.props.allowFontScaling).toBeUndefined(); expect(element.props.maxFontSizeMultiplier).toBeUndefined(); expect(element.props.numberOfLines).toBeUndefined();
  }
  if (element.type === 'Pressable' && style.borderColor) expect(ratio(style.borderColor as string, ownBackground)).toBeGreaterThanOrEqual(3);
  if (element.type === 'ActivityIndicator') expect(ratio(element.props.color as string, ownBackground)).toBeGreaterThanOrEqual(3);
  for (const child of all(element.props.children).filter((value, index, values) => values.indexOf(value) === index)) {
    // Recurse immediate children only: each subtree owns its nested surface.
    if (Array.isArray(element.props.children) ? element.props.children.includes(child) : child === element.props.children) checkComposed(child, ownBackground, seams, pressed);
  }
}
describe('actual list leaf states and nested-surface contrast (offline, not native geometry)', () => {
  it.each([false, true])('composes populated row, status and Details pressed=%s using real primitives', pressed => {
    const s = setup(); const row = (list(s.render()).props.renderItem as (p: Props) => Element)({ item: sample });
    checkComposed(row, '#FFFFFF', s.seams, pressed);
    const button = all(row).find(e => e.type === 'AppButton')!;
    const actual = (load('src/components/app-button.tsx', s.seams).AppButton as (p: Props) => Element)(button.props);
    expect(actual.props.accessibilityRole).toBe('button'); expect(actual.props.accessibilityLabel).toBe('Details for ' + sample.title);
  });
  it('composes actual disabled Details state without suppressing font scaling or weakening contrast', () => {
    const s = setup(); s.revoke(); const row = (list(s.render()).props.renderItem as (p: Props) => Element)({ item: sample });
    const details = all(row).find(e => e.type === 'AppButton')!;
    expect(details.props.disabled).toBe(true); checkComposed(row, '#FFFFFF', s.seams, false);
  });
  it('manual Retry exposes real loading/busy primitive and pull-refresh state', async () => {
    let resolve!: () => void; const pending = new Promise<void>(done => { resolve = done; });
    const s = setup({ jobs: [], loadError: 'Safe load error' }); s.jobsState.refresh.mockReturnValueOnce(pending);
    s.render(); const cleanup = s.focus(); const tree = s.render();
    const retry = all(tree).find(e => e.type === 'AppButton')!; expect(retry.props.loading).toBe(true);
    const actual = (load('src/components/app-button.tsx', s.seams).AppButton as (p: Props) => Element)(retry.props);
    expect(actual.props.accessibilityState).toEqual({ disabled: true, busy: true }); checkComposed(actual, '#FFFFFF', s.seams, false);
    const refresh = tree.props.refreshControl as Element; expect(refresh.props.refreshing).toBe(true);
    resolve(); await flush(); cleanup?.();
  });
});


describe('My Jobs operation replacement', () => {
  it('background then active creates a fresh focused refresh and old errors cannot revive', async () => {
    let reject!: (reason: Error) => void; const old = new Promise<void>((_, fail) => { reject = fail; });
    const s = setup(); s.jobsState.refresh.mockReturnValueOnce(old).mockResolvedValueOnce(undefined);
    s.render(); s.mountEffects(); s.focus(); expect(s.jobsState.refresh).toHaveBeenCalledTimes(1);
    s.app('background'); expect(s.appListenerCount()).toBe(1); s.render(); s.focus(); expect(s.jobsState.refresh).toHaveBeenCalledTimes(1);
    s.app('active'); s.render(); s.focus(); expect(s.jobsState.refresh).toHaveBeenCalledTimes(2);
    reject(new Error('Late old error')); await flush(); expect(all(s.render()).filter(e => e.type === 'InlineStatus')).toHaveLength(0);
  });
  it('old Details callback cannot navigate after blur', () => {
    const s = setup(); s.render(); const cleanup = s.focus(); const row = (list(s.render()).props.renderItem as (p: Props) => Element)({ item: sample });
    const details = all(row).find(e => e.type === 'AppButton')!; cleanup?.(); (details.props.onPress as () => void)(); expect(s.push).not.toHaveBeenCalled();
  });
});


describe('My Jobs repeated cleanup isolation', () => {
  it('old repeated cleanup cannot clear a successor refresh loading state', async () => {
    let resolve!: () => void; const pending = new Promise<void>(done => { resolve = done; });
    const s = setup(); s.render(); const oldCleanup = s.focus(); await flush(); oldCleanup?.();
    s.jobsState.refresh.mockReturnValueOnce(pending); s.render(); const nextCleanup = s.focus();
    oldCleanup?.(); const tree = s.render(); expect((tree.props.refreshControl as Element).props.refreshing).toBe(true);
    resolve(); await flush(); nextCleanup?.();
  });
});


describe('My Jobs required continuity signals', () => {
  it.each(['revision', 'revisionGuard', 'sessionSubscription', 'accountSubscription'])('fails closed before reads/presentation when %s is absent', missing => {
    const s = setup();
    if (missing === 'accountSubscription') s.seams['@/providers/account-provider'].useAccount = () => ({ account: { id: 'client-a', role: 'client', is_active: true } });
    else s.seams['@/providers/session-provider'].useSession = () => ({ sessionRevision: missing === 'revision' ? undefined : 1, isSessionRevisionCurrent: missing === 'revisionGuard' ? undefined : () => true, subscribeSessionLifecycle: missing === 'sessionSubscription' ? undefined : () => noop });
    const tree = s.render(); expect(list(tree).props.data).toEqual([]); expect(() => s.focus()).not.toThrow(); expect(s.jobsState.refresh).not.toHaveBeenCalled();
  });
});

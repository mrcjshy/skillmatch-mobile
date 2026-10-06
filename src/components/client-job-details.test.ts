import { act, createElement, createContext, useContext, useLayoutEffect, useId, Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientJobDetails from './client-job-details';
import { ClientJobsProvider } from '@/providers/client-jobs-provider';
import { createClientPostJobDraftOwner } from '@/providers/client-post-job-draft-provider';
import { AppButton } from '@/components/app-button';
import { SkillMatchTheme } from '@/constants/theme';

const { colors } = SkillMatchTheme.ui;
vi.mock('@/components/refinement-theme', () => ({ useUiTheme: () => SkillMatchTheme.ui }));

const b = vi.hoisted(() => ({
  nodes: new Map<string, any>(), owner: null as any, session: null as any, account: null as any,
  sessionEvents: new Set<() => void>(), terminationEvents: new Set<() => void>(),
  focus: true, active: 'active', appEvents: new Set<(state: string) => void>(),
  jobs: [] as any[], bookingReply: null as any, listReply: null as any, signReply: null as any,
  rpc: vi.fn(), list: vi.fn(), sign: vi.fn(), push: vi.fn(), jobsReply: null as any,
}));
const NativeParent = createContext<string | null>(null);
function Native({ kind, children, ...props }: any) {
  const id = useId(), parentId = useContext(NativeParent);
  useLayoutEffect(() => { b.nodes.set(id, { id, parentId, kind, children, ...props }); return () => { b.nodes.delete(id); }; });
  return kind === 'Image' || kind === 'Text' || kind === 'ActivityIndicator' ? null : createElement(NativeParent.Provider, { value: id }, children);
}
vi.mock('react-native', () => ({
  ...Object.fromEntries(['View', 'Text', 'ScrollView', 'Pressable', 'ActivityIndicator', 'Modal'].map(kind => [kind, (props: any) => createElement(Native, { ...props, kind })])),
  StyleSheet: { create: (s: any) => s }, Platform: { OS: 'web', select: (s: any) => s.default },
  useWindowDimensions: () => ({ width: 412, height: 915, fontScale: 1 }),
  AppState: { get currentState() { return b.active; }, addEventListener: (_: string, fn: (s: string) => void) => { b.appEvents.add(fn); return { remove: () => b.appEvents.delete(fn) }; } },
}));
vi.mock('expo-image', () => ({ Image: (props: any) => createElement(Native, { ...props, kind: 'Image' }) }));
vi.mock('expo-font', () => ({ useFonts: () => [true] }));
vi.mock('expo-symbols/androidWeights/regular', () => ({ default: { name: 'MaterialSymbols_400Regular', font: 1 } }));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: b.push }),
  useFocusEffect: (fn: () => void | (() => void)) => { const focused = b.focus; useLayoutEffect(() => focused ? fn() : undefined, [fn, focused]); } }));
vi.mock('@/providers/account-provider', () => ({ useAccount: () => b.account }));
vi.mock('@/providers/session-provider', () => ({ useSession: () => b.session }));
vi.mock('@/providers/client-post-job-draft-provider', async importOriginal => {
  const real = await importOriginal<any>(); return { ...real, useClientPostJobDraft: () => ({ ...b.owner }) };
});
vi.mock('@/components/client-job-location', () => ({ ClientJobLocation: (props: any) => createElement(Native, { ...props, kind: 'ClientJobLocation' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => ({ select: () => ({
    order: async () => ({ data: [], error: null }),
    eq: () => ({ order: () => b.jobsReply ?? Promise.resolve({ data: b.jobs, error: null }) }),
    in: async () => ({ data: [], error: null }),
  }) }),
  rpc: (name: string) => { b.rpc(name); return b.bookingReply ?? Promise.resolve({ data: [], error: null }); },
  storage: { from: () => ({ list: (...args: any[]) => { b.list(...args); return b.listReply ?? Promise.resolve({ data: [], error: null }); },
    createSignedUrls: (...args: any[]) => { b.sign(...args); return b.signReply ?? Promise.resolve({ data: args[0].map((path: string) => ({ path, signedUrl: 'signed-private', error: null })), error: null }); } }) },
} }));
const CLIENT = '11111111-1111-4111-8111-111111111111', JOB = '22222222-2222-4222-8222-222222222222';
const nodes = (kind: string) => [...b.nodes.values()].filter(n => n.kind === kind);
const text = () => nodes('Text').map(n => [n.children].flat(Infinity).join('')).join('\n');
const button = (label: string) => nodes('Pressable').find(n => n.accessibilityLabel === label);
function deferred<T = any>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const roots: any[] = [];
async function flush() { await act(async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); }); }
beforeEach(() => {
  vi.clearAllMocks(); b.nodes.clear(); b.sessionEvents.clear(); b.terminationEvents.clear(); b.appEvents.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {});
  b.focus = true; b.active = 'active'; b.listReply = b.signReply = b.bookingReply = b.jobsReply = null;
  let revision = 1;
  const lifetime = { ownerId: CLIENT, isCurrent: () => true };
  b.session = { sessionRevision: revision, sessionLifetime: lifetime, isSessionRevisionCurrent: (r: number) => r === revision,
    subscribeSessionLifecycle: (fn: () => void) => { b.sessionEvents.add(fn); return () => b.sessionEvents.delete(fn); },
    session: { user: { id: CLIENT } }, recoveryStatus: 'idle', isSessionLoading: false, sessionError: null };
  b.account = { status: 'resolved', account: { id: CLIENT, role: 'client', is_active: true }, hasCurrentConsent: true,
    clientDraftTermination: { subscribe: (fn: () => void) => { b.terminationEvents.add(fn); return () => b.terminationEvents.delete(fn); }, snapshot: () => 0 } };
  b.owner = createClientPostJobDraftOwner(CLIENT, undefined, () => b.account.status === 'resolved');
  b.jobs = [{ id: JOB, title: 'Long job title', description: 'Real provider description\nUnicode ñ', status: 'open', scheduled_at: '2030-02-04T03:30:00Z', budget: 1500, payment_method: 'cash' }];
  // Lifecycle events invalidate even if the same owner is revalidated before replies settle.
  b.session.advance = () => { revision++; b.session.sessionRevision = revision; for (const fn of [...b.sessionEvents]) fn(); };
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function mount(jobId: any = JOB) {
  const doc: any = { nodeType: 9, activeElement: null, documentElement: {}, addEventListener() {}, removeEventListener() {} };
  const win = { document: doc, HTMLIFrameElement: class {}, event: undefined }; doc.defaultView = win;
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const name: string = 'react-dom/client'; const renderer = await import(/* @vite-ignore */ name);
  const root = renderer.createRoot({ nodeType: 1, tagName: 'DIV', ownerDocument: doc, firstChild: null, lastChild: null, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, insertBefore() {} }); roots.push(root);
  let id = jobId, blocked = false; const pending = deferred();
  function Screen() { if (blocked) throw pending.promise; return createElement(ClientJobDetails, { jobId: id }); }
  const render = async () => {
    // React supplies the required children through createElement's third argument.
    const providerProps = { ownerId: CLIENT, isOwnerCurrent: b.owner.isOwnerCurrent } as Parameters<typeof ClientJobsProvider>[0];
    await act(async () => root.render(createElement(Suspense, { fallback: null }, createElement(ClientJobsProvider, providerProps, createElement(Screen)))));
    await flush();
  };
  await render();
  return { render, route: async (next: any) => { id = next; await render(); }, suspend: async () => { blocked = true; await render(); }, resume: async () => { blocked = false; pending.resolve(undefined); await render(); } };
}
describe('actual owner-provider / detail / private-photo composition', () => {
  it('renders provider description and only resolved open/no-booking waiting context', async () => {
    await mount(); expect(text()).toContain('Real provider description\nUnicode ñ'); expect(text()).toContain('Waiting for acceptance');
    expect(text()).toContain('1,500'); expect(text()).toContain('Schedule'); expect(text()).toContain('Skills'); expect(text()).toContain('None');
    expect(b.rpc).toHaveBeenCalledWith('list_my_client_bookings'); expect(b.list).toHaveBeenCalledWith(CLIENT + '/' + JOB, expect.any(Object));
    expect(text()).toContain('No job photos'); expect(button('View or edit location')).toBeDefined();
  });
  it.each([null, '', '   '])('uses missing description fallback for %s', async description => {
    b.jobs[0].description = description; await mount(); expect(text()).toContain('No description provided.');
  });
  it.each([null, '', 'bad', [JOB], '33333333-3333-4333-8333-333333333333'])('does no protected reader for invalid/foreign ID %s', async id => {
    await mount(id); expect(b.list).not.toHaveBeenCalled(); expect(b.rpc).not.toHaveBeenCalled(); expect(text()).not.toContain('Real provider description');
  });
  it('does not invent waiting or assignment for pending/failed booking context', async () => {
    const pending = deferred(); b.bookingReply = pending.promise; await mount(); expect(text()).not.toContain('Waiting for acceptance');
    await act(async () => pending.resolve({ data: null, error: { code: '42501', message: 'private-service-detail' } })); await flush();
    expect(text()).toContain('Booking context is unavailable'); expect(text()).not.toContain('private-service-detail'); expect(text()).not.toContain('Waiting for acceptance');
  });
  it('links only actual booking ID and does not duplicate counterparty data', async () => {
    b.bookingReply = Promise.resolve({ data: [{ booking_id: 'booking-a', job_id: JOB, booking_status: 'confirmed', job_title: 'job', worker_user_id: 'worker-a', worker_full_name: 'Private person', worker_phone: 'private-phone' }], error: null });
    await mount(); expect(text()).toContain('Assigned'); expect(text()).not.toContain('Private person');
    button('Booking details').onPress(); expect(b.push).toHaveBeenCalledWith({ pathname: '/client/booking-details', params: { bookingId: 'booking-a' } });
  });
  it.each(['blur', 'background', 'session', 'termination', 'pending-account', 'route', 'suspense'])('irreversibly invalidates pending listing on %s then permits a new lifetime', async kind => {
    const pending = deferred(); b.listReply = pending.promise; const h = await mount(); expect(b.list).toHaveBeenCalledTimes(1);
    if (kind === 'blur') { b.focus = false; await h.render(); }
    if (kind === 'background') await act(async () => { b.active = 'background'; for (const fn of b.appEvents) fn('background'); });
    if (kind === 'session') await act(async () => { b.account.status = 'loading'; b.session.advance(); });
    if (kind === 'termination') await act(async () => { b.owner.dispose(); for (const fn of [...b.terminationEvents]) fn(); });
    if (kind === 'pending-account') { b.account.status = 'loading'; await h.render(); b.account.status = 'resolved'; }
    if (kind === 'route') await h.route('bad');
    if (kind === 'suspense') await h.suspend();
    b.listReply = null;
    await act(async () => pending.resolve({ data: [{ name: '1' }], error: null })); await flush(); expect(b.sign).not.toHaveBeenCalled();
    expect(nodes('Image')).toHaveLength(0);
    if (kind === 'session') b.account.status = 'resolved';
    if (kind === 'termination') b.owner = createClientPostJobDraftOwner(CLIENT, undefined, () => b.account.status === 'resolved');
    if (kind === 'blur') b.focus = true;
    if (kind === 'background') await act(async () => { b.active = 'active'; for (const fn of b.appEvents) fn('active'); });
    if (kind === 'route') await h.route(JOB); else if (kind === 'suspense') await h.resume(); else await h.render();
    expect(b.list.mock.calls.length).toBeGreaterThan(1);
  });
  it('does not publish URLs when signing settles after route replacement', async () => {
    b.listReply = Promise.resolve({ data: [{ name: '1' }], error: null }); const pending = deferred(); b.signReply = pending.promise;
    const h = await mount(); expect(b.sign).toHaveBeenCalledTimes(1); await h.route('bad');
    await act(async () => pending.resolve({ data: [{ path: CLIENT + '/' + JOB + '/1', signedUrl: 'stale-url' }], error: null })); await flush(); expect(nodes('Image')).toHaveLength(0);
  });
  it('distinguishes photo error from empty and renders actual gallery images', async () => {
    b.listReply = Promise.resolve({ data: [{ name: '1' }, { name: '3' }], error: null });
    const h = await mount(); expect(nodes('Image')).toHaveLength(2); expect(text()).not.toContain('No job photos');
    await h.route('bad'); b.listReply = Promise.resolve({ data: [], error: { status: 403 } }); await h.route(JOB);
    expect(text()).toContain('Job photos are unavailable'); expect(text()).not.toContain('No job photos'); expect(nodes('Image')).toHaveLength(0);
  });
  it('passes a current open lifetime to location, closes locally, and invalidates acceptance', async () => {
    const h = await mount(); await act(async () => button('View or edit location').onPress()); await flush(); const location = nodes('ClientJobLocation')[0];
    expect(location.dismissalLabel).toBe('Back to job details'); expect(location.isOperationCurrent()).toBe(true);
    await act(async () => location.onClose()); await flush(); expect(nodes('ClientJobLocation')).toHaveLength(0);
    await h.route('bad'); expect(location.isOperationCurrent()).toBe(false);
  });
  it('releases subscriptions registered by a synchronous invalidation without dispatch', async () => {
    const release = vi.fn(); b.session.subscribeSessionLifecycle = (fn: () => void) => { fn(); return release; };
    await mount(); expect(b.list).not.toHaveBeenCalled(); expect(b.rpc).not.toHaveBeenCalled(); expect(release).toHaveBeenCalled();
  });
  it('cancels missing-row refresh errors and stale callbacks across blur', async () => {
    b.jobs = []; const h = await mount(); const retry = button('Refresh job');
    const pending = deferred(); b.jobsReply = pending.promise;
    await act(async () => retry.onPress()); b.focus = false; await h.render();
    await act(async () => pending.resolve({ data: null, error: { code: '503', message: 'private' } })); await flush();
    expect(text()).not.toContain('Could not refresh.');
  });
  it('removes a settled missing-row refresh error on blur instead of restoring it on refocus', async () => {
    b.jobs = []; const h = await mount(); b.jobsReply = Promise.resolve({ data: null, error: { code: '503', message: 'private' } });
    await act(async () => button('Refresh job').onPress()); await flush(); expect(text()).toContain('Could not refresh.');
    b.focus = false; await h.render(); expect(text()).not.toContain('Could not refresh.');
    b.focus = true; await h.render(); expect(text()).not.toContain('Could not refresh.');
  });
  it('does not revive an old list after same-owner suspension and successful fresh revalidation', async () => {
    const old = deferred(); b.listReply = old.promise; const h = await mount();
    b.account.status = 'loading'; await h.render();
    b.listReply = Promise.resolve({ data: [{ name: '3' }], error: null }); b.account.status = 'resolved'; await h.render();
    expect(nodes('Image')).toHaveLength(1); expect(b.sign).toHaveBeenCalledTimes(1);
    await act(async () => old.resolve({ data: [{ name: '1' }], error: null })); await flush();
    expect(b.sign).toHaveBeenCalledTimes(1); expect(nodes('Image')).toHaveLength(1);
    expect(b.sign.mock.calls[0][0]).toEqual([CLIENT + '/' + JOB + '/3']);
  });
  it('clears settled photos and actions when authoritative membership disappears', async () => {
    b.listReply = Promise.resolve({ data: [{ name: '1' }], error: null }); await mount(); expect(nodes('Image')).toHaveLength(1);
    b.jobs = []; await act(async () => button('Refresh job').onPress()); await flush();
    expect(nodes('Image')).toHaveLength(0); expect(button('View or edit location')).toBeUndefined(); expect(text()).not.toContain('Real provider description');
  });
  it('shows partial signing as actual remaining photos without empty/error success', async () => {
    b.listReply = Promise.resolve({ data: [{ name: '1' }, { name: '3' }], error: null });
    b.signReply = Promise.resolve({ data: [{ path: CLIENT + '/' + JOB + '/1', signedUrl: 'private-one' }, { path: CLIENT + '/' + JOB + '/3', signedUrl: '', error: 'unavailable' }], error: null });
    await mount(); expect(nodes('Image')).toHaveLength(1); expect(text()).not.toContain('No job photos'); expect(text()).not.toContain('photos are unavailable');
  });
  it('checks contrast of actual detail composition and nested controls across resting/pressed/disabled/loading states', async () => {
    const pending = deferred(); b.listReply = pending.promise; await mount();
    const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : style ?? {};
    const luminance = (hex: string) => { const rgb = hex.replace('#', '').match(/../g)!.map(part => parseInt(part, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
    const contrast = (fg: string, bg: string) => { const a = luminance(fg), c = luminance(bg); return (Math.max(a,c) + .05) / (Math.min(a,c) + .05); };
    function composition(node: any, pressed: boolean) {
      const ancestors: any[] = []; let ancestor = node;
      while (ancestor) { ancestors.push(ancestor); ancestor = b.nodes.get(ancestor.parentId); }
      const resolved = ancestors.reverse().reduce((result, item) => {
        const style = flatten(typeof item.style === 'function' ? item.style({ pressed }) : item.style);
        if (style.backgroundColor && style.backgroundColor !== 'transparent') result.background = style.backgroundColor;
        if (style.color) result.foreground = style.color;
        result.opacity *= style.opacity ?? 1; return result;
      }, { background: null, foreground: null, opacity: 1 });
      expect(resolved.background).not.toBeNull(); expect(resolved.opacity).toBe(1); return resolved;
    }
    function checkMounted() {
      for (const pressed of [false, true]) {
        for (const node of nodes('Text')) {
          const resolved = composition(node, pressed); expect(resolved.foreground).not.toBeNull();
          expect(contrast(resolved.foreground, resolved.background)).toBeGreaterThanOrEqual(4.5);
          expect(node.allowFontScaling).not.toBe(false); expect(node.maxFontSizeMultiplier).toBeUndefined();
        }
        for (const node of nodes('Pressable')) {
          const style = flatten(node.style({ pressed })), resolved = composition(node, pressed);
          expect(contrast(style.borderColor, resolved.background)).toBeGreaterThanOrEqual(3);
        }
        for (const node of nodes('ActivityIndicator')) {
          const resolved = composition(node, pressed); expect(contrast(node.color, resolved.background)).toBeGreaterThanOrEqual(3);
        }
      }
    }
    checkMounted(); // Actual InlineStatus loading tint and status-chip nested surfaces.
    await act(async () => pending.resolve({ data: [], error: null })); await flush(); checkMounted();
    const refresh = deferred(); b.jobsReply = refresh.promise;
    await act(async () => button('Refresh job').onPress()); checkMounted(); // Actual loading button.
    await act(async () => refresh.resolve({ data: [], error: { code: '503', message: 'private' } })); await flush(); checkMounted(); // Actual error tint.
    for (const state of [{ disabled: true }, { loading: true }, {}]) {
      const element = AppButton({ label: 'Refresh job', variant: 'secondary', ...state });
      const props = element.props as any;
      for (const pressed of [false, true]) {
        const style = flatten(props.style({ pressed })), child = props.children.props;
        const background = style.backgroundColor === 'transparent' ? colors.canvas : style.backgroundColor;
        expect(contrast(style.borderColor, background)).toBeGreaterThanOrEqual(3);
        if (state.loading) expect(contrast(child.color, background)).toBeGreaterThanOrEqual(3);
        else expect(contrast(flatten(child.style).color, background)).toBeGreaterThanOrEqual(4.5);
        expect(style.opacity ?? 1).toBe(1); expect(child.allowFontScaling).not.toBe(false);
      }
    }
  });
});

// @ts-expect-error -- Node-only inert component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as cobaltMaterial from '../constants/cobalt-material';
import { SkillMatchTheme } from '@/constants/theme';
import { presentClientProfile } from '@/lib/client-profile';

vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (values: Record<string, unknown>) => values.android ?? values.default } }));

type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
type Account = (NonNullable<Parameters<typeof presentClientProfile>[0]> & { id?: string; role?: string; is_active?: boolean }) | null;
const noop = () => {};
function harness(signOut = vi.fn(async () => ({ error: null as { message: string } | null })), account: Account = {
  id: 'client-a', role: 'client', is_active: true,
  full_name: 'Alexandra Maria Santos Dela Cruz with a long family name',
  phone: '+63 917 123 4567', email: 'alexandra.maria.santos.delacruz@example.test',
  barangay: 'Barangay with an exceptionally long name', city: 'Santa Ana, Pampanga',
}) {
  const push = vi.fn();
  const homeRead = vi.fn(async (_clientId: string): Promise<unknown> => ({ pin: { latitude: 14.545, longitude: 121.069 }, address: '12 M. Almeda St., Santa Ana, Pateros' }));
  const jobs = { isLoading: false, loadError: null as string | null, jobs: [{ id: 'a', status: 'open' }, { id: 'b', status: 'open' }, { id: 'c', status: 'completed' }] };
  const draft = { isPosting: false, owner: true };
  const state: unknown[] = []; let cursor = 0; const effects: (() => unknown)[] = []; let cleanups: (() => void)[] = [];
  const native = { ...Object.fromEntries(['View', 'Text', 'ScrollView', 'Pressable', 'PulseDots'].map(name => [name, name])), StyleSheet: { create: (styles: unknown) => styles }, useWindowDimensions: () => ({ width: 411, height: 914, fontScale: 1 }) };
  const jsx = (type: unknown, props: Props): Element => typeof type === 'function' ? type(props) : { type, props };
  const inert = (name: string) => ({ [name]: (props: Props) => ({ type: name, props }) });
  const cache: Record<string, Props> = {};
  function load(file: string): Props {
    if (cache[file]) return cache[file];
    const exports: Props = {}; cache[file] = exports;
    const seams: Record<string, unknown> = {
    '@/components/skeleton': { Skeleton: 'Skeleton', PulseDots: 'PulseDots', KeyboardSpacer: 'KeyboardSpacer' },

    '@/components/app-symbol': { AppSymbol: 'SymbolView' },
    '@/components/skillmatch-mascot': { SkillMatchMascot: 'SkillMatchMascot' }, '@/components/initials-avatar': inert('InitialsAvatar'),
      react: { useState: (initial: unknown) => { const slot = cursor++; if (!(slot in state)) state[slot] = initial; return [state[slot], (value: unknown) => { state[slot] = value; }]; }, useCallback: (fn: unknown) => fn },
      'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
      'expo-router': { useRouter: () => ({ push }), useFocusEffect: (fn: () => unknown) => { effects.push(fn); } },
      '@/constants/theme': { SkillMatchTheme }, '@/lib/client-profile': { presentClientProfile, CLIENT_HELP_PATH: '/client/help' }, '@/lib/client-onboarding': { CLIENT_ONBOARDING_PATH: '/client/onboarding' },
      '@/lib/profile-details': { loadMyHomeLocation: homeRead },
      '@/lib/sign-out': { signOutCurrentUser: signOut }, '@/providers/account-provider': { useAccount: () => ({ account }) },
      '@/providers/client-jobs-provider': { useClientJobs: () => jobs },
      '@/providers/client-post-job-draft-provider': { useClientPostJobDraft: () => ({ isPosting: draft.isPosting, isOwnerCurrent: () => draft.owner }) },
    };
    new Function('require', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)((name: string) => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => SkillMatchTheme.ui };
      if (name === '@/constants/cobalt-material') return cobaltMaterial;
      if (name in seams) return seams[name];
      if (name.startsWith('@/components/')) return load('src/' + name.slice(2) + '.tsx');
      throw new Error('Unexpected component dependency: ' + name);
    }, exports);
    return exports;
  }
  const screen = load('src/app/(client)/(tabs)/client/profile.tsx').default as () => Element;
  return {
    signOut, push, homeRead, jobs, draft,
    effects: () => { effects.splice(0).forEach(fn => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup as () => void); }); },
    cleanup: () => { cleanups.forEach(fn => fn()); cleanups = []; },
    render: () => { cursor = 0; effects.length = 0; return screen(); },
  };
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
const texts = (tree: Element) => nodes(tree).filter(node => node.type === 'Text').map(node => node.props.children);
const action = (tree: Element, label: string) => nodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)!;
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
/** The Profile hero: the one cobalt card drawn with the sheen. */
const heroCard = (tree: unknown) => nodes(tree).find(n => n.type === 'View' && typeof style(n).experimental_backgroundImage === 'string')!;
const stats = (tree: unknown) => nodes(heroCard(tree)).filter(n => /^(Open jobs|Home pin): /.test(String(n.props.accessibilityLabel ?? ''))).map(n => n.props.accessibilityLabel);
const NAVIGATION = ['Edit details', 'Post a job', 'How to post a job', 'Your details', 'Help and FAQ', 'My reports', 'Report an app issue'];
const ROWS_AND_TILES = NAVIGATION.slice(1);
function flatten(value: unknown): Props {
  return Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value && typeof value === 'object' ? value as Props : {};
}
function style(node: Element, pressed = false) { return flatten(typeof node.props.style === 'function' ? node.props.style({ pressed }) : node.props.style); }
function contrast(a: string, b: string) {
  const lum = (hex: string) => hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const values = [lum(a), lum(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05);
}
function rgba(color: string): number[] {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (hex) return [...hex[1].match(/../g)!.map(v => parseInt(v, 16)), hex[2] ? parseInt(hex[2], 16) / 255 : 1];
  const fn = /^rgba?\(([^)]+)\)$/.exec(color);
  if (!fn) throw new Error('Unreadable colour: ' + color);
  const [r, g, b, a = 1] = fn[1].split(',').map(Number); return [r, g, b, a];
}
/** A translucent colour as it shows over the opaque colour beneath it (glass pills and tiles on the hero). */
function over(top: string, below: string) {
  const [r, g, b, a] = rgba(top); const under = rgba(below);
  return '#' + [r, g, b].map((value, i) => Math.round(value * a + under[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
}
function assertReadableTree(value: unknown, pressed: boolean, inheritedBackground: string = SkillMatchTheme.ui.colors.canvas, inheritedOpacity = 1) {
  if (Array.isArray(value)) { value.forEach(child => assertReadableTree(child, pressed, inheritedBackground, inheritedOpacity)); return; }
  if (!value || typeof value !== 'object' || !('props' in value)) return;
  const node = value as Element; const current = style(node, pressed);
  const background = typeof current.backgroundColor === 'string' && current.backgroundColor !== 'transparent' ? over(current.backgroundColor, inheritedBackground) : inheritedBackground;
  const opacity = inheritedOpacity * Number(current.opacity ?? 1);
  if (node.type === 'Text' && typeof current.color === 'string') {
    expect(opacity).toBe(1); expect(contrast(over(current.color, background), background)).toBeGreaterThanOrEqual(4.5);
  }
  if (node.type === 'PulseDots') expect(contrast(String(node.props.color), background)).toBeGreaterThanOrEqual(3);
  assertReadableTree(node.props.children, pressed, background, opacity);
}

describe('Client Profile composed presentation', () => {
  it('opens with the shared hero, then quick actions, contact, support, legal, sign out and the footer, retaining long own-account fields', () => {
    const tree = harness().render(); const values = texts(tree); const hero = heroCard(tree);
    expect(style(hero)).toMatchObject({ borderRadius: 28, padding: 20, overflow: 'hidden', backgroundColor: SkillMatchTheme.ui.colors.accent });
    const name = nodes(hero).find(node => node.type === 'Text' && node.props.accessibilityRole === 'header')!;
    expect(name.props.children).toBe('Alexandra Maria Santos Dela Cruz with a long family name');
    expect(texts(hero)).toEqual(['Alexandra Maria Santos Dela Cruz with a long family name', 'Client', 'Barangay with an exceptionally long name, Santa Ana, Pampanga', '2', 'Open jobs', '—', 'Home pin', 'Edit details']);
    expect(nodes(hero).find(node => node.props.accessibilityLabel === 'Area: Barangay with an exceptionally long name, Santa Ana, Pampanga')).toBeDefined();
    expect(nodes(hero).find(node => node.type === 'SkillMatchMascot')!.props).toMatchObject({ expression: 'hello', size: 84 });
    const order = ['Alexandra Maria Santos Dela Cruz with a long family name', 'Quick actions', 'Contact', 'Support', 'Sign out', 'SkillMatch · Barangay Santa Ana, Pateros'];
    for (let i = 1; i < order.length; i++) expect(values.indexOf(order[i - 1])).toBeLessThan(values.indexOf(order[i]));
    expect(values.at(-1)).toBe('SkillMatch · Barangay Santa Ana, Pateros');
    expect(values).toContain('alexandra.maria.santos.delacruz@example.test'); expect(values).toContain('+63 917 123 4567');
    for (const node of nodes(tree).filter(node => node.type === 'Text')) expect(node.props.numberOfLines).toBeUndefined();
    expect(nodes(tree).some(node => node.type === 'TextInput')).toBe(false);
    expect(nodes(tree).some(node => node.props.accessibilityLabel === 'Edit profile')).toBe(false);
    for (const value of ['Alexandra Maria Santos Dela Cruz with a long family name', 'Barangay with an exceptionally long name, Santa Ana, Pampanga', '+63 917 123 4567', 'alexandra.maria.santos.delacruz@example.test']) {
      expect(nodes(tree).find(node => node.type === 'Text' && node.props.children === value)?.props.selectable).toBe(true);
    }
    // Your details and How to post a job moved into the tiles: every destination is offered once.
    for (const label of ROWS_AND_TILES) expect(nodes(tree).filter(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)).toHaveLength(1);
  });
  it('counts open jobs from the jobs provider and reads the home pin each time Profile is shown', async () => {
    const h = harness(); let tree = h.render();
    expect(stats(tree)).toEqual(['Open jobs: 2', 'Home pin: Not available']);
    expect(h.homeRead).not.toHaveBeenCalled();
    h.effects(); await flush(); tree = h.render();
    expect(h.homeRead).toHaveBeenCalledExactlyOnceWith('client-a');
    expect(stats(tree)).toEqual(['Open jobs: 2', 'Home pin: Set']);
    h.homeRead.mockResolvedValueOnce(null); h.cleanup(); h.effects(); await flush();
    expect(stats(h.render())).toEqual(['Open jobs: 2', 'Home pin: Not set']);
    h.homeRead.mockRejectedValueOnce(new Error('offline')); h.cleanup(); h.effects(); await flush();
    expect(stats(h.render())).toEqual(['Open jobs: 2', 'Home pin: Not available']);
    h.jobs.isLoading = true; expect(stats(h.render())[0]).toBe('Open jobs: Not available');
    h.jobs.isLoading = false; h.jobs.loadError = "Couldn't load your jobs. Please try again."; expect(stats(h.render())[0]).toBe('Open jobs: Not available');
  });
  it('preserves every existing destination and exposes no additional profile write action', () => {
    const s = harness(); const tree = s.render();
    for (const [label, path] of [['Edit details', '/client/details'], ['Post a job', '/client/post-job'], ['How to post a job', '/client/onboarding'], ['Your details', '/client/details'], ['Help and FAQ', '/client/help'], ['My reports', '/client/my-reports'], ['Report an app issue', '/client/report-app']]) {
      (action(tree, label).props.onPress as () => void)(); expect(s.push).toHaveBeenLastCalledWith(path);
    }
    expect(nodes(tree).filter(node => node.type === 'Pressable').map(node => node.props.accessibilityLabel)).toEqual([...NAVIGATION, 'Sign out']);
    expect(s.signOut).not.toHaveBeenCalled();
  });
  it.each([
    { label: 'ready owner', posting: false, owner: true, allowed: true },
    { label: 'posting', posting: true, owner: true, allowed: false },
    { label: 'lost owner', posting: false, owner: false, allowed: false },
  ])('guards the Post a job tile like the bar action: $label', ({ posting, owner, allowed }) => {
    const s = harness(); s.draft.isPosting = posting; s.draft.owner = owner;
    const tile = action(s.render(), 'Post a job');
    expect(tile.props.disabled).toBe(!allowed); expect(tile.props.accessibilityState).toEqual({ disabled: !allowed });
    (tile.props.onPress as () => void)();
    expect(s.push.mock.calls).toEqual(allowed ? [['/client/post-job']] : []);
  });
  it('rechecks owner authority when a rendered Post a job tile is pressed', () => {
    const s = harness(); const tile = action(s.render(), 'Post a job');
    s.draft.owner = false; (tile.props.onPress as () => void)();
    expect(s.push).not.toHaveBeenCalled();
  });
  it('retains null-account fallback without substituting another identity or reading a home pin', () => {
    const h = harness(undefined, null); const tree = h.render(); const hero = heroCard(tree);
    expect(nodes(hero).find(node => node.type === 'Text' && node.props.accessibilityRole === 'header')!.props.children).toBe('—');
    expect(nodes(hero).find(node => node.props.accessibilityLabel === 'Area: —')).toBeDefined();
    for (const label of ['Phone', 'Email']) expect(nodes(tree).filter(node => node.props.accessibilityLabel === `${label}: —`)).toHaveLength(1);
    // The four account fields plus the unread home pin.
    expect(texts(tree).filter(v => v === '—')).toHaveLength(5);
    expect(texts(tree)).not.toContain('Alexandra Maria Santos Dela Cruz with a long family name');
    h.effects(); expect(h.homeRead).not.toHaveBeenCalled();
  });
  it('delegates successful sign out once without inventing navigation or an account write', async () => {
    const s = harness(); await (action(s.render(), 'Sign out').props.onPress as () => Promise<void>)();
    expect(s.signOut).toHaveBeenCalledTimes(1); expect(s.push).not.toHaveBeenCalled();
    expect(action(s.render(), 'Sign out').props.accessibilityState).toEqual({ disabled: false, busy: false });
    expect(texts(s.render())).not.toContain('Sign out failed. Please try again.');
  });
  it.each(['returned', 'thrown'] as const)('blocks navigation during sign out and restores controls with %s failure', async failure => {
    let finish: () => void = noop;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const signOut = vi.fn(async () => { await pending; if (failure === 'thrown') throw new Error('transport'); return { error: { message: 'Session could not be cleared.' } }; });
    const s = harness(signOut); const running = (action(s.render(), 'Sign out').props.onPress as () => Promise<void>)();
    const tree = s.render(); expect(action(tree, 'Sign out').props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(nodes(tree).some(node => node.type === 'PulseDots')).toBe(true);
    for (const label of ROWS_AND_TILES) {
      expect(action(tree, label).props.disabled).toBe(true); expect(action(tree, label).props.accessibilityState).toEqual({ disabled: true });
    }
    expect(action(tree, 'Edit details').props.disabled).toBe(true); expect(action(tree, 'Edit details').props.accessibilityState).toEqual({ disabled: true, busy: false });
    await (action(tree, 'Sign out').props.onPress as () => Promise<void>)(); expect(signOut).toHaveBeenCalledTimes(1);
    finish(); await running;
    expect(texts(s.render())).toContain(failure === 'returned' ? 'Session could not be cleared.' : 'Sign out failed. Please try again.');
    for (const label of NAVIGATION) expect(action(s.render(), label).props.disabled).toBe(false);
  });
  it('uses real shared row and tile styles and maintains readable normal, pressed and disabled copy', async () => {
    let finish: () => void = noop;
    const s = harness(vi.fn(async () => { await new Promise<void>(resolve => { finish = resolve; }); return { error: null }; }));
    const ui = SkillMatchTheme.ui;
    for (const pressed of [false, true]) {
      assertReadableTree(s.render(), pressed);
      const row = action(s.render(), 'My reports');
      expect(style(row).minHeight).toBe(ui.size.listRowMinHeight);
      const background = String(style(row, pressed).backgroundColor ?? ui.colors.surface);
      for (const copy of nodes(row.props.children).filter(node => node.type === 'Text')) {
        expect(contrast(String(style(copy).color), background)).toBeGreaterThanOrEqual(4.5);
      }
      const tile = action(s.render(), 'Help and FAQ');
      expect(style(tile)).toMatchObject({ minHeight: 104, borderRadius: 20, padding: 16, backgroundColor: ui.colors.surface });
      expect(style(tile, pressed).backgroundColor).toBe(pressed ? ui.colors.surfaceSunken : ui.colors.surface);
      const glyph = nodes(tile.props.children).find(node => node.type === 'View' && style(node).width === ui.size.iconCircle)!;
      expect(style(glyph)).toMatchObject({ height: 40, borderRadius: 20, backgroundColor: ui.colors.accentSubtle });
      expect(nodes(glyph).find(node => node.type === 'SymbolView')!.props.tintColor).toBe(ui.colors.accent);
      for (const copy of nodes(tile.props.children).filter(node => node.type === 'Text')) {
        expect(contrast(String(style(copy).color), String(style(tile, pressed).backgroundColor))).toBeGreaterThanOrEqual(4.5);
      }
    }
    const running = (action(s.render(), 'Sign out').props.onPress as () => Promise<void>)();
    assertReadableTree(s.render(), true);
    const row = action(s.render(), 'My reports'); expect(style(row, true).opacity ?? 1).toBe(1);
    for (const copy of nodes(row.props.children).filter(node => node.type === 'Text')) expect(contrast(String(style(copy).color), String(style(row, true).backgroundColor ?? ui.colors.surface))).toBeGreaterThanOrEqual(4.5);
    // A disabled tile neither fades nor takes the pressed fill; its glyph and title turn grey.
    const tile = action(s.render(), 'Help and FAQ');
    expect(style(tile, true).opacity ?? 1).toBe(1); expect(style(tile, true).backgroundColor).toBe(ui.colors.surface);
    expect(nodes(tile.props.children).find(node => node.type === 'SymbolView')!.props.tintColor).toBe(ui.colors.textSecondary);
    finish(); await running;
    const signOut = action(s.render(), 'Sign out');
    for (const pressed of [false, true]) {
      const background = style(signOut, pressed).backgroundColor;
      const label = nodes(signOut.props.children).find(node => node.type === 'Text')!;
      expect(contrast(String(style(label).color), background === 'transparent' ? ui.colors.canvas : String(background))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// @ts-expect-error -- Node-only inert component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as cobaltMaterial from '../constants/cobalt-material';
import { SkillMatchTheme } from '@/constants/theme';
import * as catalog from '@/lib/skill-catalog';
import * as profileHelpers from '@/lib/worker-profile';
import * as identityHelpers from '@/lib/worker-identity';
import * as workerStats from '@/lib/worker-profile-stats';
import * as dates from '@/lib/date-time';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (values: Record<string, unknown>) => values.android ?? values.default } }));

type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
const noop = () => {};
function harness() {
  const push = vi.fn(), handleSave = vi.fn(async (_selection?: unknown) => true), setBio = vi.fn(), signOut = vi.fn(async (): Promise<{ error: null | { message: string } }> => ({ error: null }));
  const profile = { isLoading: false, loadError: null as string | null, skills: [{ id: 'one', skill_name: 'A very long complete specialist skill name' }, { id: 'two', skill_name: 'Plumbing' }], bio: 'Long work experience description', setBio, selection: { one: 'expert' }, persistedSelection: { one: 'expert' }, isVerified: true, isSaving: false, saveError: null, saveSuccess: null, handleSave, availability: 'available', isPersistingAvailability: false, persistAvailability: vi.fn(), persistAvailabilityError: null };
  let account: Props | null = { id: 'worker-a', role: 'worker', is_active: true, full_name: 'Alexandra Maria Santos Dela Cruz with a long family name', phone: '+63 917 123 4567', email: 'alexandra@example.test', barangay: 'Barangay long complete name', city: 'Santa Ana' };
  const state: unknown[] = []; let cursor = 0; const refs: Record<number, { current: unknown }> = {}; const effects: (() => void | (() => void))[] = []; let cleanups: (() => void)[] = [];
  const alert = vi.fn(), photoRead = vi.fn(async () => ({ status: 'available', signedUrl: 'signed-worker-a' }));
  const statsRead = vi.fn(async (_userId: string): Promise<workerStats.WorkerProfileStats> => ({ ratingAvg: 4.5, strikeCount: 1 }));
  let lifecycle: (next: string) => void = noop;
  let windowMetrics = { width: 411, height: 914, scale: 2.625, fontScale: 1 };
  const native = { ...Object.fromEntries(['View', 'Text', 'ScrollView', 'Pressable', 'ActivityIndicator', 'TextInput', 'KeyboardAvoidingView', 'Modal'].map(name => [name, name])), Platform: { OS: 'android' }, useWindowDimensions: () => windowMetrics, AppState: { currentState: 'active', addEventListener: vi.fn((_event: string, fn: (next: string) => void) => { lifecycle = fn; return { remove: noop }; }) }, Alert: { alert }, StyleSheet: { create: (styles: unknown) => styles } };
  const jsx = (type: unknown, props: Props): Element | null => {
    if (type === 'Modal' && !props.visible) return null;
    return typeof type === 'function' ? type(props) : { type, props };
  };
  const cache: Record<string, Props> = {};
  function load(file: string): Props {
    if (cache[file]) return cache[file]; const exports: Props = {}; cache[file] = exports;
    const inert = (name: string) => ({ [name]: (props: Props) => ({ type: name, props }) });
    const seams: Record<string, unknown> = {
      react: { useState: (initial: unknown) => { const slot = cursor++; if (!(slot in state)) state[slot] = initial; return [state[slot], (value: unknown) => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }]; }, useRef: (initial: unknown) => { const slot = cursor++; return refs[slot] ??= { current: initial }; }, useCallback: (fn: unknown) => fn, useEffect: (fn: () => void) => effects.push(fn) },
      'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'expo-image': { Image: 'Image' },
    '@/components/skillmatch-mascot': { SkillMatchMascot: 'SkillMatchMascot' },
    '@/components/skeleton': { Skeleton: 'Skeleton', PulseDots: 'PulseDots', KeyboardSpacer: 'KeyboardSpacer' },

    '@/components/app-symbol': { AppSymbol: 'SymbolView' },
      'expo-router': { useRouter: () => ({ push }), useFocusEffect: (fn: () => void) => effects.push(fn) }, 'expo-image-picker': { requestMediaLibraryPermissionsAsync: vi.fn(), launchImageLibraryAsync: vi.fn() }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
      '@/constants/theme': { SkillMatchTheme }, '@/lib/skill-catalog': catalog, '@/lib/worker-profile': profileHelpers,
      '@/lib/portfolio': { PORTFOLIO_PATH: '/worker/portfolio' }, '@/lib/sign-out': { signOutCurrentUser: signOut },
      '@/providers/account-provider': { useAccount: () => ({ account }) }, '@/providers/worker-profile-provider': { useWorkerProfile: () => profile, PROFICIENCY_OPTIONS: [{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'expert', label: 'Expert' }] },
      '@/lib/worker-profile-photo': { getWorkerProfilePhoto: photoRead },
      '@/lib/worker-profile-stats': { ...workerStats, loadMyWorkerStats: statsRead },
      '@/lib/worker-identity': { ...identityHelpers, getMyIdentitySubmission: vi.fn(async () => ({ id: 'id-1', status: 'approved', idType: 'national_id', submittedAt: '2026-09-24T08:16:42Z', rejectionReason: null })) }, '@/lib/date-time': dates, '@/components/worker-profile-photo-picker': inert('WorkerProfilePhotoPicker'), '@/components/worker-strike-status': inert('WorkerStrikeStatus'), '@/components/initials-avatar': inert('InitialsAvatar'),
    };
    new Function('require', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)((name: string) => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: any) => children };
      if (name === '@/constants/cobalt-material') return cobaltMaterial;
      if (name in seams) return seams[name]; if (name === '@/components/grouped-row') return load('src/components/grouped-row.ts'); if (name.startsWith('@/components/')) return load('src/' + name.slice(2) + '.tsx'); throw new Error('Unexpected component dependency: ' + name);
    }, exports); return exports;
  }
  const screen = load('src/app/(worker)/(tabs)/worker/profile.tsx').default as () => Element;
  return { appState: (next: string) => { native.AppState.currentState = next; lifecycle(next); }, profile, handleSave, setBio, push, alert, signOut, photoRead, statsRead, changeAccount: (next: Props | null) => { account = next; }, setFontScale: (fontScale: number) => { windowMetrics = { ...windowMetrics, fontScale }; }, cleanup: () => { cleanups.forEach(fn => fn()); cleanups = []; }, effects: () => { effects.splice(0).forEach(fn => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); }); }, render: () => { cursor = 0; effects.length = 0; return screen(); } };
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
function visibleNodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(visibleNodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Element;
  if (style(node).display === 'none' || node.props.accessibilityElementsHidden === true) return [];
  return [node, ...visibleNodes(node.props.children)];
}
const texts = (tree: Element) => visibleNodes(tree).filter(node => node.type === 'Text').map(node => node.props.children);
const action = (tree: Element, label: string) => visibleNodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)!;
function open(h: ReturnType<typeof harness>, ...labels: string[]) {
  let tree = h.render();
  for (const label of labels) { (action(tree, label).props.onPress as () => void)(); tree = h.render(); }
  return tree;
}
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
/** The Profile hero: the one cobalt card drawn with the sheen. */
const heroCard = (tree: unknown) => nodes(tree).find(n => n.type === 'View' && typeof style(n).experimental_backgroundImage === 'string')!;
const statTiles = (tree: unknown) => nodes(heroCard(tree)).filter(n => /^(Rating|Skills|Strikes): /.test(String(n.props.accessibilityLabel ?? '')));
const statLabels = (tree: unknown) => statTiles(tree).map(n => n.props.accessibilityLabel);
const pills = (tree: unknown) => nodes(heroCard(tree)).filter(n => n.type === 'View' && n.props.accessible === true && style(n).borderRadius === SkillMatchTheme.ui.radius.pill);
const quickTiles = (tree: Element) => visibleNodes(tree).filter(n => n.type === 'Pressable' && n.props.accessibilityHint !== undefined);
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
  if (node.type === 'ActivityIndicator') expect(contrast(String(node.props.color), background)).toBeGreaterThanOrEqual(3);
  assertReadableTree(node.props.children, pressed, background, opacity);
}

describe('Worker Profile overview and deliberate editing', () => {
  it('opens with the shared hero: ringed avatar, name header, trade, verified and area pills, three stats and Edit profile', async () => {
    const h = harness(); h.render(); h.effects(); await flush();
    const tree = h.render(); const hero = heroCard(tree); const ui = SkillMatchTheme.ui;
    expect(style(hero)).toMatchObject({ borderRadius: 28, borderCurve: 'continuous', padding: 20, overflow: 'hidden', backgroundColor: ui.colors.accent });
    expect(String(style(hero).experimental_backgroundImage)).toMatch(/^linear-gradient\(135deg, #1C3AA6 0%, #2F55D4 \d+%, #4C7BEA 100%\)$/);
    expect(nodes(tree).indexOf(hero)).toBeLessThan(nodes(tree).findIndex(n => n.type === 'TextInput'));
    const avatar = nodes(hero).find(n => n.type === 'InitialsAvatar')!;
    expect(avatar.props).toMatchObject({ size: 72, photoUri: 'signed-worker-a', name: 'Alexandra Maria Santos Dela Cruz with a long family name' });
    const ring = nodes(hero).find(n => n.type === 'View' && n.props.children === avatar)!;
    expect(style(ring)).toMatchObject({ padding: 3, backgroundColor: ui.colors.onAccent });
    const name = nodes(hero).find(n => n.type === 'Text' && n.props.accessibilityRole === 'header')!;
    expect(style(name)).toMatchObject({ fontSize: 24, fontWeight: '800', color: ui.colors.onAccent });
    expect(texts(hero)).toEqual(['Alexandra Maria Santos Dela Cruz with a long family name', 'Worker · A very long complete specialist skill name', 'Verified', 'Barangay long complete name, Santa Ana', '4.5', 'Rating', '1', 'Skills', '1 of 3', 'Strikes', 'Edit profile']);
    const [verified, area] = pills(tree);
    expect(pills(tree).map(n => n.props.accessibilityLabel)).toEqual(['Verified', 'Area: Barangay long complete name, Santa Ana']);
    expect(style(verified).backgroundColor).toBe(ui.colors.onAccent);
    expect(nodes(verified).find(n => n.type === 'SymbolView')!.props).toMatchObject({ name: { android: 'verified', ios: 'checkmark.seal.fill' }, tintColor: ui.colors.success });
    expect(style(area).backgroundColor).toMatch(/^rgba\(255, 255, 255, 0\.\d+\)$/);
    expect(statLabels(tree)).toEqual(['Rating: 4.5', 'Skills: 1', 'Strikes: 1 of 3']);
    expect(h.statsRead).toHaveBeenCalledWith('worker-a');
    const edit = action(tree, 'Edit profile');
    expect(nodes(hero)).toContain(edit);
    expect(edit.props.accessibilityState).toEqual({ disabled: false, busy: false, expanded: false });
    expect(style(edit)).toMatchObject({ backgroundColor: ui.colors.surface, borderRadius: ui.radius.pill });
    expect(style(edit).minHeight).toBeGreaterThanOrEqual(48);
    const mascot = nodes(hero).find(n => n.type === 'SkillMatchMascot')!;
    expect(mascot.props).toMatchObject({ expression: 'hello', size: 84 });
    const stage = nodes(hero).find(n => n.props.pointerEvents === 'none' && nodes(n.props.children).includes(mascot))!;
    expect(stage.props).toMatchObject({ accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
    expect(style(stage).position).toBe('absolute');
    // Contact moved out of the identity block: once each, copyable, below the hero.
    for (const [label, value] of [['Phone', '+63 917 123 4567'], ['Email', 'alexandra@example.test']]) {
      const matches = visibleNodes(tree).filter(n => n.props.accessibilityLabel === `${label}: ${value}`);
      expect(matches).toHaveLength(1);
      expect(nodes(hero)).not.toContain(matches[0]);
      expect(nodes(matches[0]).find(n => n.type === 'Text' && n.props.children === value)!.props.selectable).toBe(true);
    }
  });
  it('shows a dash until the numbers arrive, New before the first rating, and never invents a strike count', async () => {
    const h = harness(); let tree = h.render();
    expect(statLabels(tree)).toEqual(['Rating: Not available', 'Skills: 1', 'Strikes: Not available']);
    expect(texts(heroCard(tree)).filter(value => value === '—')).toHaveLength(2);
    h.statsRead.mockResolvedValueOnce({ ratingAvg: null, strikeCount: 0 });
    h.effects(); await flush(); tree = h.render();
    expect(statLabels(tree)).toEqual(['Rating: New', 'Skills: 1', 'Strikes: 0 of 3']);
    h.statsRead.mockResolvedValueOnce({ ratingAvg: null, strikeCount: null });
    h.cleanup(); h.render(); h.effects(); await flush();
    expect(statLabels(h.render())).toEqual(['Rating: New', 'Skills: 1', 'Strikes: Not available']);
  });
  it('PERF-01: coming back to Profile keeps the photo on screen while a fresh signature is read', async () => {
    const h = harness(); h.render(); h.effects(); await flush();
    const avatar = () => nodes(h.render()).find(n => n.type === 'InitialsAvatar')!;
    expect(avatar().props.photoUri).toBe('signed-worker-a');
    let finish!: (value: { status: string; signedUrl: string }) => void;
    h.photoRead.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    h.cleanup(); h.render(); h.effects(); // leave Profile and come back; the new signature is on its way
    expect(h.photoRead).toHaveBeenCalledTimes(2);
    expect(avatar().props.photoUri).toBe('signed-worker-a');
    finish({ status: 'available', signedUrl: 'signed-worker-a-2' }); await flush();
    expect(avatar().props.photoUri).toBe('signed-worker-a-2');
    h.cleanup();
  });
  it('keeps the hero numbers with the account that read them and reads none without a Worker account', async () => {
    const h = harness(); h.render(); h.effects(); await flush();
    expect(statLabels(h.render())[0]).toBe('Rating: 4.5');
    h.changeAccount({ id: 'worker-b', role: 'worker', is_active: true, full_name: 'Second worker' });
    expect(statLabels(h.render())).toEqual(['Rating: Not available', 'Skills: 1', 'Strikes: Not available']);
    h.cleanup(); h.changeAccount(null); h.render(); h.effects(); await flush();
    expect(h.statsRead).toHaveBeenCalledTimes(1);
  });
  it('keeps the hero whole at 130% text: nothing truncates, pills wrap, and stat and action tiles reserve room for their words', () => {
    const regular = harness().render();
    const h = harness(); h.setFontScale(1.3);
    const tree = h.render();
    for (const node of nodes(tree).filter(n => n.type === 'Text')) expect(node.props.numberOfLines).toBeUndefined();
    const row = (t: unknown, child: Element) => nodes(heroCard(t)).find(n => Array.isArray(n.props.children) && (n.props.children as unknown[]).includes(child))!;
    expect(style(row(tree, pills(tree)[0]))).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    expect(style(row(tree, statTiles(tree)[0]))).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    const statMin = Number(style(statTiles(regular)[0]).minWidth);
    expect(statMin).toBeGreaterThanOrEqual(72);
    for (const tile of statTiles(tree)) {
      expect(style(tile)).toMatchObject({ flexGrow: 1, flexBasis: 0 });
      expect(style(tile).minWidth).toBe(Math.ceil(statMin * 1.3));
    }
    const actionMin = Number(style(quickTiles(regular)[0]).minWidth);
    for (const tile of quickTiles(tree)) {
      expect(style(tile)).toMatchObject({ flexGrow: 1, flexBasis: '40%' });
      expect(style(tile).minWidth).toBe(Math.ceil(actionMin * 1.3));
      expect(style(tile).minHeight).toBeGreaterThanOrEqual(48);
    }
  });
  it('omits unavailable contacts without leaving duplicate or empty contact rows', () => {
    const h = harness(); h.changeAccount({ id: 'worker-a', role: 'worker', is_active: true, full_name: 'Worker' });
    const tree = h.render();
    expect(visibleNodes(tree).filter(n => String(n.props.accessibilityLabel ?? '').startsWith('Phone:'))).toHaveLength(0);
    expect(visibleNodes(tree).filter(n => String(n.props.accessibilityLabel ?? '').startsWith('Email:'))).toHaveLength(0);
    expect(texts(tree)).not.toContain('Contact');
    expect(pills(tree).map(n => n.props.accessibilityLabel)).toEqual(['Verified']);
    h.changeAccount({ id: 'worker-a', role: 'worker', is_active: true, full_name: 'Worker', email: 'worker@example.test' });
    const single = h.render();
    const section = nodes(single).find(n => n.type === 'View' && Array.isArray(n.props.children) && nodes((n.props.children as unknown[])[0]).some(c => c.type === 'Text' && c.props.children === 'Contact'))!;
    expect(visibleNodes(section).filter(n => String(n.props.accessibilityLabel ?? '').includes(': '))).toHaveLength(1);
    expect(nodes(section).filter(n => n.props.importantForAccessibility === 'no-hide-descendants' && style(n).backgroundColor === SkillMatchTheme.ui.colors.hairline)).toHaveLength(0);
  });
  it('keeps profile and portfolio maintenance without resume builder or Skill Gap actions', () => {
    const h = harness(); const tree = h.render(); const values = texts(tree);
    const titles = ['Edit profile', 'Work skills', 'About me', 'Portfolio and resume', 'Contact', 'Settings and support', 'Sign out', 'SkillMatch · Barangay Santa Ana, Pateros'];
    for (const title of titles) expect(values).toContain(title);
    for (let i = 1; i < titles.length; i++) expect(values.indexOf(titles[i - 1])).toBeLessThan(values.indexOf(titles[i]));
    expect(values.at(-1)).toBe('SkillMatch · Barangay Santa Ana, Pateros');
    expect(values).toContain('Alexandra Maria Santos Dela Cruz with a long family name');
    expect(action(tree, 'Availability')).toBeUndefined();
    expect(action(tree, 'Verification')).toBeUndefined();
    expect(action(tree, 'Resume builder')).toBeUndefined();
    expect(action(tree, 'Skill guidance')).toBeUndefined();
    expect(values).toContain('Long work experience description');
    // Editing stays behind its own disclosure; nothing else on the profile is hidden.
    expect(action(tree, 'Save profile')).toBeUndefined();
    expect(action(tree, 'Sign out')).toBeDefined();
    // Contact sits after the professional content and before support, each labelled once.
    for (const contact of ['+63 917 123 4567', 'alexandra@example.test']) {
      expect(values.indexOf(contact)).toBeGreaterThan(values.indexOf('Contact'));
      expect(values.indexOf(contact)).toBeLessThan(values.indexOf('Settings and support'));
    }
    expect(values.filter(value => value === 'Phone')).toHaveLength(1); expect(values.filter(value => value === 'Email')).toHaveLength(1);
    expect(values).not.toContain('About Me');
    for (const node of nodes(tree).filter(n => n.type === 'Text')) expect(node.props.numberOfLines).toBeUndefined();
    expect(visibleNodes(tree).filter(n => n.type === 'Pressable' && (n.props.accessibilityState as Props | undefined)?.expanded !== undefined).map(n => n.props.accessibilityLabel)).toEqual(['Edit profile']);
    expect(quickTiles(tree).map(n => n.props.accessibilityLabel)).toEqual(['Portfolio', 'Portfolio files', 'Resume', 'Resume details']);
    for (const [label, path] of [['Portfolio', '/worker/portfolio'], ['Portfolio files', '/worker/portfolio-files'], ['Resume', '/worker/resume'], ['Resume details', '/worker/resume-details'], ['Settings', '/worker/settings'], ['Help and FAQ', '/worker/help'], ['My reports', '/worker/my-reports'], ['Report an app issue', '/worker/report-app']]) { (action(tree, label).props.onPress as () => void)(); expect(h.push).toHaveBeenLastCalledWith(path); }
    expect(h.push).toHaveBeenCalledTimes(8);
    expect(h.handleSave).not.toHaveBeenCalled();
  });
  it('while the profile loads, the hero keeps the account but offers no Edit profile and invents no work facts', () => {
    const h = harness(); h.profile.isLoading = true; const tree = h.render();
    expect(texts(heroCard(tree))).toContain('Worker');
    expect(pills(tree).map(n => n.props.accessibilityLabel)).toEqual(['Area: Barangay long complete name, Santa Ana']);
    expect(statLabels(tree)).toEqual(['Rating: Not available', 'Skills: Not available', 'Strikes: Not available']);
    expect(action(tree, 'Edit profile')).toBeUndefined();
    expect(nodes(tree).some(n => n.type === 'TextInput')).toBe(false);
    expect(action(tree, 'Sign out')).toBeDefined();
  });
  it.each([1, 1.3])('Manage skills asks for no skill level at font scale %s (owner, 2026-11-05) and saves nothing until confirmed', fontScale => {
    const h = harness(); h.setFontScale(fontScale);
    const tree = open(h, 'Edit profile');
    (action(tree, 'Manage skills').props.onPress as () => void)();
    const modal = nodes(h.render());
    const LEVEL = /Beginner|Intermediate|Expert|proficiency/i;
    expect(modal.filter(n => n.props.accessibilityRole === 'radio')).toHaveLength(0);
    expect(modal.some(n => LEVEL.test(String(n.props.accessibilityLabel ?? '')))).toBe(false);
    expect(modal.some(n => typeof n.props.children === 'string' && LEVEL.test(n.props.children))).toBe(false);
    expect(h.profile.selection).toEqual({ one: 'expert' });
    expect(h.handleSave).not.toHaveBeenCalled(); expect(h.alert).not.toHaveBeenCalled();
    (action(h.render(), 'Cancel').props.onPress as () => void)();
    expect(h.profile.selection).toEqual({ one: 'expert' }); expect(h.handleSave).not.toHaveBeenCalled();
  });
  it('keeps bio callback and save, and cancels only the copied skill draft', async () => {
    const h = harness(); const tree = open(h, 'Edit profile');
    const field = nodes(tree).find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'About me')!;
    (field.props.onChangeText as (s: string) => void)('Edited bio'); expect(h.setBio).toHaveBeenCalledWith('Edited bio');
    (action(tree, 'Manage skills').props.onPress as () => void)();
    let modal = h.render(); (action(modal, 'Plumbing').props.onPress as () => void)();
    expect(h.profile.selection).toEqual({ one: 'expert' }); expect(h.handleSave).not.toHaveBeenCalled();
    (action(h.render(), 'Cancel').props.onPress as () => void)(); expect(h.handleSave).not.toHaveBeenCalled();
    (action(h.render(), 'Manage skills').props.onPress as () => void)();
    modal = h.render(); (action(modal, 'Plumbing').props.onPress as () => void)();
    (action(h.render(), 'Save skills').props.onPress as () => void)();
    // The app's own dialog asks, not the stock Android alert (owner, 2026-11-06).
    expect(h.handleSave).not.toHaveBeenCalled(); expect(h.alert).not.toHaveBeenCalled();
    const dialog = nodes(h.render());
    expect(dialog.some(n => n.props.accessibilityRole === 'header' && n.props.children === 'Confirm selected skills?')).toBe(true);
    (action(h.render(), 'Confirm skills').props.onPress as () => void)(); await Promise.resolve();
    expect(h.handleSave).toHaveBeenCalledWith({ one: 'expert', two: 'beginner' });
    (action(h.render(), 'Save profile').props.onPress as () => void)(); expect(h.handleSave).toHaveBeenLastCalledWith();
  });
  it('keeps all busy text readable with composed normal and pressed styles', () => {
    const h = harness(); open(h, 'Edit profile');
    for (const pressed of [false, true]) assertReadableTree(h.render(), pressed);
    h.profile.isSaving = true; const tree = h.render();
    for (const pressed of [false, true]) assertReadableTree(tree, pressed);
    for (const label of ['Manage skills', 'Portfolio', 'Sign out']) expect(action(tree, label).props.disabled).toBe(true);
  });
  it('blocks profile saves while the existing availability update is pending', () => {
    const h = harness(); h.profile.isPersistingAvailability = true; const tree = open(h, 'Edit profile');
    expect(action(tree, 'Save profile').props.disabled).toBe(true); expect(action(tree, 'Manage skills').props.disabled).toBe(true);
    for (const pressed of [false, true]) assertReadableTree(tree, pressed); expect(h.handleSave).not.toHaveBeenCalled();
  });
  it('keeps verification passive and work facts tied to persisted skills', () => {
    const h = harness();
    h.profile.selection = { one: 'expert', two: 'beginner' } as typeof h.profile.selection;
    let tree = h.render();
    expect(texts(tree)).toContain('Verified');
    expect(action(tree, 'Verification')).toBeUndefined();
    expect(nodes(tree).some(node => node.type === 'WorkerIdentitySection')).toBe(false);
    expect(statLabels(tree)).toContain('Skills: 1');
    expect(texts(tree)).not.toContain('Plumbing');
    // Every persisted skill is listed, never a "+N more" summary.
    h.profile.persistedSelection = { one: 'expert', two: 'beginner' } as typeof h.profile.persistedSelection;
    tree = h.render();
    expect(statLabels(tree)).toContain('Skills: 2');
    expect(texts(tree)).toEqual(expect.arrayContaining(['A very long complete specialist skill name', 'Plumbing']));
    // The skills sit in one sideways-scrolling row instead of wrapping onto more lines.
    const carousel = nodes(tree).find(n => n.type === 'ScrollView' && n.props.accessibilityLabel === 'Work skills')!;
    expect(carousel.props.horizontal).toBe(true);
    expect(carousel.props.showsHorizontalScrollIndicator).toBe(false);
    expect(flatten(carousel.props.contentContainerStyle)).toMatchObject({ flexDirection: 'row' });
    expect(flatten(carousel.props.contentContainerStyle).flexWrap).toBeUndefined();
    expect(texts(carousel)).toEqual(['A very long complete specialist skill name', 'Plumbing']);
    expect(texts(tree).some(value => /more$/.test(String(value)))).toBe(false);
    h.profile.isVerified = false;
    tree = h.render();
    expect(texts(tree)).not.toContain('Verified');
    expect(texts(tree)).toContain('Not yet verified');
    expect(nodes(pills(tree)[0]).find(n => n.type === 'SymbolView')!.props.tintColor).toBe(SkillMatchTheme.ui.colors.warning);
    expect(action(tree, 'Verification')).toBeUndefined();
  });
  it('reveals and hides editing without dropping the mounted editor or its unsaved provider draft', () => {
    const h = harness(); let tree = h.render();
    expect(action(tree, 'Edit profile').props.accessibilityState).toEqual({ disabled: false, busy: false, expanded: false });
    expect(visibleNodes(tree).some(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'About me')).toBe(false);
    expect(nodes(tree).some(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'About me')).toBe(true);
    tree = open(h, 'Edit profile');
    expect(action(tree, 'Edit profile').props.accessibilityState).toEqual({ disabled: false, busy: false, expanded: true });
    expect(action(tree, 'Save profile')).toBeDefined();
    h.profile.bio = 'Unsaved provider draft';
    tree = open(h, 'Edit profile');
    expect(action(tree, 'Save profile')).toBeUndefined();
    const hiddenEditor = nodes(tree).find(n => n.props.accessibilityElementsHidden === true && nodes(n).some(c => c.type === 'TextInput'))!;
    expect(style(hiddenEditor).maxHeight).toBe(0);
    expect(style(hiddenEditor).overflow).toBe('hidden');
    expect(hiddenEditor.props.pointerEvents).toBe('none');
    expect(hiddenEditor.props.importantForAccessibility).toBe('no-hide-descendants');
    tree = open(h, 'Edit profile');
    expect(visibleNodes(tree).find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'About me')!.props.value).toBe('Unsaved provider draft');
    expect(h.handleSave).not.toHaveBeenCalled();
  });
  it('preserves sign out delegation and blocks repeated actions with readable failure feedback', async () => {
    const h = harness(); let finish: (value: { error: null | { message: string } }) => void = noop;
    h.render();
    h.signOut.mockImplementation(() => new Promise(resolve => { finish = resolve as typeof finish; }));
    const running = (action(h.render(), 'Sign out').props.onPress as () => Promise<void>)();
    const tree = h.render(); expect(action(tree, 'Sign out').props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(action(tree, 'Help and FAQ').props.disabled).toBe(true); for (const pressed of [false, true]) assertReadableTree(tree, pressed);
    await (action(tree, 'Sign out').props.onPress as () => Promise<void>)(); expect(h.signOut).toHaveBeenCalledTimes(1); expect(h.push).not.toHaveBeenCalled();
    finish({ error: { message: 'Session could not be cleared.' } }); await running;
    expect(texts(h.render())).toContain('Session could not be cleared.'); expect(action(h.render(), 'Sign out').props.disabled).toBe(false);
  });
  it('invalidates successful private photo replies during suspension and refreshes on foreground', async () => {
    const h = harness(); let finish: (value: { status: string; signedUrl: string }) => void = noop;
    h.photoRead.mockImplementation(() => new Promise(resolve => { finish = resolve; })); h.render(); h.effects(); h.appState('background');
    finish({ status: 'available', signedUrl: 'background-private-photo' }); await Promise.resolve(); await Promise.resolve();
    expect(nodes(h.render()).find(n => n.type === 'InitialsAvatar')!.props.photoUri).toBeNull();
    h.appState('active'); finish({ status: 'available', signedUrl: 'fresh-private-photo' }); await Promise.resolve(); await Promise.resolve();
    expect(nodes(h.render()).find(n => n.type === 'InitialsAvatar')!.props.photoUri).toBe('fresh-private-photo');
  });
  it('ignores late successful photo reads after losing account authorization', async () => {
    const h = harness(); let finish: (value: { status: string; signedUrl: string }) => void = noop;
    h.photoRead.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    h.render(); h.effects(); h.cleanup(); h.changeAccount(null); h.render(); h.effects();
    finish({ status: 'available', signedUrl: 'stale-private-photo' }); await Promise.resolve(); await Promise.resolve();
    expect(nodes(h.render()).find(n => n.type === 'InitialsAvatar')!.props.photoUri).toBeNull();
  });
});

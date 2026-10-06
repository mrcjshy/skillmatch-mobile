// @ts-expect-error -- Node-only inert component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { SkillMatchTheme } from '@/constants/theme';
import * as catalog from '@/lib/skill-catalog';
import * as profileHelpers from '@/lib/worker-profile';
import * as identityHelpers from '@/lib/worker-identity';
import * as dates from '@/lib/date-time';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (values: Record<string, unknown>) => values.android ?? values.default } }));

type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
const noop = () => {};
function harness() {
  const push = vi.fn(), handleSave = vi.fn(async (_selection?: unknown) => true), setBio = vi.fn(), signOut = vi.fn(async (): Promise<{ error: null | { message: string } }> => ({ error: null }));
  const profile = { isLoading: false, loadError: null, skills: [{ id: 'one', skill_name: 'A very long complete specialist skill name' }, { id: 'two', skill_name: 'Plumbing' }], bio: 'Long work experience description', setBio, selection: { one: 'expert' }, persistedSelection: { one: 'expert' }, isVerified: true, isSaving: false, saveError: null, saveSuccess: null, handleSave, availability: 'available', isPersistingAvailability: false, persistAvailability: vi.fn(), persistAvailabilityError: null };
  let account: Props | null = { id: 'worker-a', role: 'worker', is_active: true, full_name: 'Alexandra Maria Santos Dela Cruz with a long family name', phone: '+63 917 123 4567', email: 'alexandra@example.test', barangay: 'Barangay long complete name', city: 'Santa Ana' };
  const state: unknown[] = []; let cursor = 0; const refs: Record<number, { current: unknown }> = {}; const effects: (() => void | (() => void))[] = []; let cleanups: (() => void)[] = [];
  const alert = vi.fn(), photoRead = vi.fn(async () => ({ status: 'available', signedUrl: 'signed-worker-a' }));
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
    '@/components/app-symbol': { AppSymbol: 'SymbolView' },
      'expo-router': { useRouter: () => ({ push }), useFocusEffect: (fn: () => void) => effects.push(fn) }, 'expo-image-picker': { requestMediaLibraryPermissionsAsync: vi.fn(), launchImageLibraryAsync: vi.fn() }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
      '@/constants/theme': { SkillMatchTheme }, '@/lib/skill-catalog': catalog, '@/lib/worker-profile': profileHelpers,
      '@/lib/portfolio': { PORTFOLIO_PATH: '/worker/portfolio' }, '@/lib/sign-out': { signOutCurrentUser: signOut },
      '@/providers/account-provider': { useAccount: () => ({ account }) }, '@/providers/worker-profile-provider': { useWorkerProfile: () => profile, PROFICIENCY_OPTIONS: [{ value: 'expert', label: 'Expert' }] },
      '@/lib/worker-profile-photo': { getWorkerProfilePhoto: photoRead },
      '@/lib/worker-identity': { ...identityHelpers, getMyIdentitySubmission: vi.fn(async () => ({ id: 'id-1', status: 'approved', idType: 'national_id', submittedAt: '2026-09-24T08:16:42Z', rejectionReason: null })) }, '@/lib/date-time': dates, '@/components/worker-profile-photo-picker': inert('WorkerProfilePhotoPicker'), '@/components/initials-avatar': inert('InitialsAvatar'),
    };
    new Function('require', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)((name: string) => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: any) => children };
      if (name in seams) return seams[name]; if (name === '@/components/grouped-row') return load('src/components/grouped-row.ts'); if (name.startsWith('@/components/')) return load('src/' + name.slice(2) + '.tsx'); throw new Error('Unexpected component dependency: ' + name);
    }, exports); return exports;
  }
  const screen = load('src/app/(worker)/(tabs)/worker/profile.tsx').default as () => Element;
  return { appState: (next: string) => { native.AppState.currentState = next; lifecycle(next); }, profile, handleSave, setBio, push, alert, signOut, photoRead, changeAccount: (next: Props | null) => { account = next; }, setFontScale: (fontScale: number) => { windowMetrics = { ...windowMetrics, fontScale }; }, cleanup: () => { cleanups.forEach(fn => fn()); cleanups = []; }, effects: () => { effects.splice(0).forEach(fn => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); }); }, render: () => { cursor = 0; effects.length = 0; return screen(); } };
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
function flatten(value: unknown): Props {
  return Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value && typeof value === 'object' ? value as Props : {};
}
function style(node: Element, pressed = false) { return flatten(typeof node.props.style === 'function' ? node.props.style({ pressed }) : node.props.style); }
function contrast(a: string, b: string) {
  const lum = (hex: string) => hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const values = [lum(a), lum(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05);
}
function assertReadableTree(value: unknown, pressed: boolean, inheritedBackground: string = SkillMatchTheme.ui.colors.canvas, inheritedOpacity = 1) {
  if (Array.isArray(value)) { value.forEach(child => assertReadableTree(child, pressed, inheritedBackground, inheritedOpacity)); return; }
  if (!value || typeof value !== 'object' || !('props' in value)) return;
  const node = value as Element; const current = style(node, pressed);
  const background = typeof current.backgroundColor === 'string' && current.backgroundColor !== 'transparent' ? current.backgroundColor : inheritedBackground;
  const opacity = inheritedOpacity * Number(current.opacity ?? 1);
  if (node.type === 'Text' && typeof current.color === 'string') {
    expect(opacity).toBe(1); expect(contrast(current.color, background)).toBeGreaterThanOrEqual(4.5);
  }
  if (node.type === 'ActivityIndicator') expect(contrast(String(node.props.color), background)).toBeGreaterThanOrEqual(3);
  assertReadableTree(node.props.children, pressed, background, opacity);
}

describe('Worker Profile overview and deliberate editing', () => {
  it('lays the header out as avatar, identity column and a separate contact column at 100%, contacts once each at 16sp', () => {
    const tree = harness().render();
    const identityRow = nodes(tree).find(n => n.type === 'View' && Array.isArray(n.props.children) && n.props.children.some(child => child?.type === 'InitialsAvatar'))!;
    expect(style(identityRow)).toMatchObject({ flexDirection: 'row', alignItems: 'flex-start' });
    const [avatar, body] = identityRow.props.children as Element[];
    expect(avatar.type).toBe('InitialsAvatar');
    expect(avatar.props.size).toBe(64);
    expect(style(body)).toMatchObject({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 8 });
    const [identity, contacts] = body.props.children as Element[];
    expect(style(identity)).toMatchObject({ flexGrow: 0, flexShrink: 1, minWidth: 96, maxWidth: 127 });
    expect(style(contacts)).toMatchObject({ flex: 1, minWidth: 160 });
    expect(style(identity).position).toBeUndefined();
    expect(style(contacts).position).toBeUndefined();
    const identityTexts = nodes(identity).filter(n => n.type === 'Text').map(n => n.props.children);
    expect(identityTexts).toEqual(['Alexandra Maria Santos Dela Cruz with a long family name', 'A very long complete specialist skill name', 'Verified']);
    for (const [label, value] of [['Phone', '+63 917 123 4567'], ['Email', 'alexandra@example.test'], ['Area', 'Barangay long complete name, Santa Ana']]) {
      const matches = visibleNodes(tree).filter(n => n.props.accessibilityLabel === `${label}: ${value}`);
      expect(matches).toHaveLength(1);
      expect(nodes(contacts)).toContain(matches[0]);
      expect(nodes(identity)).not.toContain(matches[0]);
      const glyph = nodes(matches[0]).find(n => n.type === 'SymbolView')!;
      expect(glyph.props.size).toBe(18);
      const text = nodes(matches[0]).find(n => n.type === 'Text')!;
      expect(style(text).fontSize).toBe(16);
      expect(text.props.numberOfLines).toBeUndefined();
    }
    expect(nodes(identityRow).some(n => n.props.accessibilityLabel === 'Edit profile')).toBe(false);
    expect(action(tree, 'Edit profile')).toBeDefined();
  });
  it('moves the contact column under the identity at 130% text instead of squeezing both columns', () => {
    const h = harness(); h.setFontScale(1.3);
    const tree = h.render();
    const identityRow = nodes(tree).find(n => n.type === 'View' && Array.isArray(n.props.children) && n.props.children.some(child => child?.type === 'InitialsAvatar'))!;
    const body = (identityRow.props.children as Element[])[1];
    expect(style(body).flexDirection).toBeUndefined();
    const [identity, contacts] = body.props.children as Element[];
    expect(style(identity).maxWidth).toBeUndefined();
    expect(style(contacts).minWidth).toBeUndefined();
    expect(nodes(contacts).filter(n => String(n.props.accessibilityLabel ?? '').match(/^(Phone|Email|Area): /))).toHaveLength(3);
    expect(nodes(identityRow).some(n => n.props.accessibilityLabel === 'Edit profile')).toBe(false);
  });
  it('omits unavailable contacts without leaving duplicate or empty contact rows', () => {
    const h = harness(); h.changeAccount({ id: 'worker-a', role: 'worker', is_active: true, full_name: 'Worker' });
    const tree = h.render();
    expect(visibleNodes(tree).filter(n => String(n.props.accessibilityLabel ?? '').startsWith('Phone:'))).toHaveLength(0);
    expect(visibleNodes(tree).filter(n => String(n.props.accessibilityLabel ?? '').startsWith('Email:'))).toHaveLength(0);
  });
  it('keeps identity and work overview primary while every original destination remains reachable', () => {
    const h = harness(); let tree = h.render(); const values = texts(tree);
    const titles = ['Edit profile', 'Work skills', 'About me', 'Professional identity', 'Account and support'];
    for (const title of titles) expect(values).toContain(title);
    for (let i = 1; i < titles.length; i++) expect(values.indexOf(titles[i - 1])).toBeLessThan(values.indexOf(titles[i]));
    expect(values).toContain('Alexandra Maria Santos Dela Cruz with a long family name');
    expect(action(tree, 'Availability')).toBeUndefined();
    expect(action(tree, 'Verification')).toBeUndefined();
    expect(action(tree, 'Resume builder')).toBeDefined();
    expect(values).toContain('Long work experience description');
    expect(action(tree, 'View portfolio')).toBeDefined();
    // Editing stays behind its own disclosure; nothing else on the profile is hidden.
    expect(action(tree, 'Save profile')).toBeUndefined();
    expect(action(tree, 'Sign out')).toBeDefined();
    expect(values).toContain('alexandra@example.test');
    expect(values).toContain('+63 917 123 4567');
    // Contact details sit with the identity, above the professional content, not in Account and support.
    for (const contact of ['+63 917 123 4567', 'alexandra@example.test']) expect(values.indexOf(contact)).toBeLessThan(values.indexOf('Edit profile'));
    expect(values).not.toContain('Phone'); expect(values).not.toContain('Email');
    expect(values).not.toContain('About Me');
    for (const node of nodes(tree).filter(n => n.type === 'Text')) expect(node.props.numberOfLines).toBeUndefined();
    expect(visibleNodes(tree).filter(n => n.type === 'Pressable' && (n.props.accessibilityState as Props | undefined)?.expanded !== undefined).map(n => n.props.accessibilityLabel)).toEqual(['Edit profile']);
    for (const [label, path] of [['View portfolio', '/worker/portfolio'], ['Resume builder', '/worker/resume'], ['Skill guidance', '/worker/skill-gap'], ['Help and FAQ', '/worker/help'], ['My reports', '/worker/my-reports'], ['Report an app issue', '/worker/report-app'], ['Terms and conditions', '/worker/terms'], ['Privacy policy', '/worker/privacy']]) { (action(tree, label).props.onPress as () => void)(); expect(h.push).toHaveBeenLastCalledWith(path); }
    expect(h.handleSave).not.toHaveBeenCalled();
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
    expect(h.handleSave).not.toHaveBeenCalled(); const buttons = h.alert.mock.calls[0][2] as { onPress?: () => Promise<void> }[];
    await buttons[1].onPress!(); expect(h.handleSave).toHaveBeenCalledWith({ one: 'expert', two: 'beginner' });
    (action(h.render(), 'Save profile').props.onPress as () => void)(); expect(h.handleSave).toHaveBeenLastCalledWith();
  });
  it('keeps all busy text readable with composed normal and pressed styles', () => {
    const h = harness(); open(h, 'Edit profile');
    for (const pressed of [false, true]) assertReadableTree(h.render(), pressed);
    h.profile.isSaving = true; const tree = h.render();
    for (const pressed of [false, true]) assertReadableTree(tree, pressed);
    for (const label of ['Manage skills', 'Resume builder', 'Sign out']) expect(action(tree, label).props.disabled).toBe(true);
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
    const count = nodes(tree).find(node => node.type === 'Text' && Array.isArray(node.props.children) && node.props.children[1] === ' skills');
    expect(count?.props.children).toEqual([1, ' skills']);
    expect(texts(tree)).not.toContain('Plumbing');
    h.profile.isVerified = false;
    tree = h.render();
    expect(texts(tree)).not.toContain('Verified');
    expect(texts(tree)).toContain('Not yet verified');
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

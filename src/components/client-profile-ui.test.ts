// @ts-expect-error -- Node-only inert component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { SkillMatchTheme } from '@/constants/theme';
import { presentClientProfile } from '@/lib/client-profile';

vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (values: Record<string, unknown>) => values.android ?? values.default } }));

type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
const noop = () => {};
function harness(signOut = vi.fn(async () => ({ error: null as { message: string } | null })), account: Parameters<typeof presentClientProfile>[0] = {
  full_name: 'Alexandra Maria Santos Dela Cruz with a long family name',
  phone: '+63 917 123 4567', email: 'alexandra.maria.santos.delacruz@example.test',
  barangay: 'Barangay with an exceptionally long name', city: 'Santa Ana, Pampanga',
}) {
  const push = vi.fn();
  const state: unknown[] = []; let cursor = 0;
  const native = { ...Object.fromEntries(['View', 'Text', 'ScrollView', 'Pressable', 'ActivityIndicator'].map(name => [name, name])), StyleSheet: { create: (styles: unknown) => styles }, useWindowDimensions: () => ({ fontScale: 1 }) };
  const jsx = (type: unknown, props: Props): Element => typeof type === 'function' ? type(props) : { type, props };
  const cache: Record<string, Props> = {};
  function load(file: string): Props {
    if (cache[file]) return cache[file];
    const exports: Props = {}; cache[file] = exports;
    const seams: Record<string, unknown> = {
    '@/components/app-symbol': { AppSymbol: 'SymbolView' },
      react: { useState: (initial: unknown) => { const slot = cursor++; if (!(slot in state)) state[slot] = initial; return [state[slot], (value: unknown) => { state[slot] = value; }]; } },
      'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
      'expo-router': { useRouter: () => ({ push }) },
      '@/constants/theme': { SkillMatchTheme }, '@/lib/client-profile': { presentClientProfile, CLIENT_HELP_PATH: '/client/help' },
      '@/lib/sign-out': { signOutCurrentUser: signOut }, '@/providers/account-provider': { useAccount: () => ({ account }) },
    };
    new Function('require', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)((name: string) => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => SkillMatchTheme.ui };
      if (name in seams) return seams[name];
      if (name.startsWith('@/components/')) return load('src/' + name.slice(2) + '.tsx');
      throw new Error('Unexpected component dependency: ' + name);
    }, exports);
    return exports;
  }
  const screen = load('src/app/(client)/(tabs)/client/profile.tsx').default as () => Element;
  return { signOut, push, render: () => { cursor = 0; return screen(); } };
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
const texts = (tree: Element) => nodes(tree).filter(node => node.type === 'Text').map(node => node.props.children);
const action = (tree: Element, label: string) => nodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)!;
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

describe('Client Profile composed presentation', () => {
  it('separates account information, support, legal and sign out while retaining long own-account fields', () => {
    const tree = harness().render(); const values = texts(tree);
    expect(values).toContain('Account information'); expect(values).toContain('Support and reports'); expect(values).toContain('Legal'); expect(values).toContain('Sign out');
    expect(values).toContain('Alexandra Maria Santos Dela Cruz with a long family name');
    expect(values).toContain('Barangay with an exceptionally long name, Santa Ana, Pampanga');
    expect(values).toContain('alexandra.maria.santos.delacruz@example.test'); expect(values).toContain('+63 917 123 4567');
    for (const node of nodes(tree).filter(node => node.type === 'Text')) expect(node.props.numberOfLines).toBeUndefined();
    expect(values.indexOf('Account information')).toBeLessThan(values.indexOf('Support and reports'));
    expect(values.indexOf('Support and reports')).toBeLessThan(values.indexOf('Legal'));
    expect(values.indexOf('Legal')).toBeLessThan(values.indexOf('Sign out'));
    expect(nodes(tree).some(node => node.type === 'TextInput')).toBe(false);
    expect(nodes(tree).some(node => node.props.accessibilityLabel === 'Edit profile')).toBe(false);
    for (const value of ['Alexandra Maria Santos Dela Cruz with a long family name', 'Barangay with an exceptionally long name, Santa Ana, Pampanga', '+63 917 123 4567', 'alexandra.maria.santos.delacruz@example.test']) {
      expect(nodes(tree).find(node => node.type === 'Text' && node.props.children === value)?.props.selectable).toBe(true);
    }
  });
  it('preserves every existing destination and exposes no additional profile write action', () => {
    const s = harness(); const tree = s.render();
    for (const [label, path] of [['Help and FAQ', '/client/help'], ['My reports', '/client/my-reports'], ['Report an app issue', '/client/report-app'], ['Terms and conditions', '/client/terms'], ['Privacy policy', '/client/privacy']]) {
      (action(tree, label).props.onPress as () => void)(); expect(s.push).toHaveBeenLastCalledWith(path);
    }
    expect(s.signOut).not.toHaveBeenCalled();
  });
  it('retains null-account fallback without substituting another identity', () => {
    const tree = harness(undefined, null).render(); expect(texts(tree).filter(v => v === '\u2014')).toHaveLength(4);
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
    expect(nodes(tree).some(node => node.type === 'ActivityIndicator')).toBe(true);
    for (const label of ['Help and FAQ', 'My reports', 'Report an app issue', 'Terms and conditions', 'Privacy policy']) {
      expect(action(tree, label).props.disabled).toBe(true); expect(action(tree, label).props.accessibilityState).toEqual({ disabled: true });
    }
    await (action(tree, 'Sign out').props.onPress as () => Promise<void>)(); expect(signOut).toHaveBeenCalledTimes(1);
    finish(); await running;
    expect(texts(s.render())).toContain(failure === 'returned' ? 'Session could not be cleared.' : 'Sign out failed. Please try again.');
    expect(action(s.render(), 'Help and FAQ').props.disabled).toBe(false);
  });
  it('uses real shared row styles and maintains readable normal, pressed and disabled copy', async () => {
    let finish: () => void = noop;
    const s = harness(vi.fn(async () => { await new Promise<void>(resolve => { finish = resolve; }); return { error: null }; }));
    for (const pressed of [false, true]) {
      assertReadableTree(s.render(), pressed);
      const row = action(s.render(), 'Help and FAQ');
      expect(style(row).minHeight).toBe(SkillMatchTheme.ui.size.listRowMinHeight);
      const background = String(style(row, pressed).backgroundColor ?? SkillMatchTheme.ui.colors.surface);
      for (const copy of nodes(row.props.children).filter(node => node.type === 'Text')) {
        expect(contrast(String(style(copy).color), background)).toBeGreaterThanOrEqual(4.5);
      }
    }
    const running = (action(s.render(), 'Sign out').props.onPress as () => Promise<void>)();
    assertReadableTree(s.render(), true);
    const row = action(s.render(), 'Help and FAQ'); expect(style(row, true).opacity ?? 1).toBe(1);
    for (const copy of nodes(row.props.children).filter(node => node.type === 'Text')) expect(contrast(String(style(copy).color), String(style(row, true).backgroundColor ?? SkillMatchTheme.ui.colors.surface))).toBeGreaterThanOrEqual(4.5);
    finish(); await running;
    const signOut = action(s.render(), 'Sign out');
    for (const pressed of [false, true]) {
      const background = style(signOut, pressed).backgroundColor;
      const label = nodes(signOut.props.children).find(node => node.type === 'Text')!;
      expect(contrast(String(style(label).color), background === 'transparent' ? SkillMatchTheme.ui.colors.canvas : String(background))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

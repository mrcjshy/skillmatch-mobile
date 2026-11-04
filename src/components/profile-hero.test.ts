// @ts-expect-error -- Node-only inert component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as cobaltMaterial from '../constants/cobalt-material';
import { SkillMatchTheme } from '@/constants/theme';

vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (values: Record<string, unknown>) => values.android ?? values.default } }));

/** Static render evidence for the shared Profile hero and quick actions; native layout is not covered. */
type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
const ui = SkillMatchTheme.ui;
let fontScale = 1;
const jsx = (type: unknown, props: Props): Element => (typeof type === 'function' ? (type as (p: Props) => Element)(props) : { type, props });
const cache: Record<string, Props> = {};
function load(file: string): Props {
  if (cache[file]) return cache[file];
  const exports: Props = {};
  cache[file] = exports;
  const seams: Record<string, unknown> = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 }, useWindowDimensions: () => ({ fontScale }) },
    '@/components/refinement-theme': { useUiTheme: () => ui },
    '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
    '@/components/skeleton': { PulseDots: 'PulseDots' },
    '@/components/initials-avatar': { InitialsAvatar: 'InitialsAvatar' },
    '@/components/skillmatch-mascot': { SkillMatchMascot: 'SkillMatchMascot' },
  };
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', output)((name: string) => {
    if (name in seams) return seams[name];
    if (name === '@/components/app-button') return load('src/components/app-button.tsx');
    if (name === '@/constants/cobalt-material') return cobaltMaterial;
    throw new Error('Unexpected import: ' + name);
  }, exports);
  return exports;
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}
const flatten = (value: unknown): Props => (Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value && typeof value === 'object' ? (value as Props) : {});
const style = (node: Element, pressed = false) => flatten(typeof node.props.style === 'function' ? node.props.style({ pressed }) : node.props.style);
const texts = (tree: unknown) => nodes(tree).filter((node) => node.type === 'Text').map((node) => node.props.children);

const hero = load('src/components/profile-hero.tsx') as {
  ProfileHero: (props: Props) => Element; ProfileFooter: () => Element; PROFILE_HERO_SHEEN: string; PROFILE_FOOTER: string;
};
const { ProfileQuickActions } = load('src/components/profile-quick-actions.tsx') as { ProfileQuickActions: (props: Props) => Element };

describe('ProfileHero', () => {
  const props = {
    name: 'Ana Reyes', role: 'Client', photoUri: 'signed-photo',
    badges: [
      { label: 'Verified', icon: { android: 'verified', ios: 'checkmark.seal.fill' }, statusColor: ui.colors.success },
      { label: 'Santa Ana, Pateros', accessibilityLabel: 'Area: Santa Ana, Pateros', icon: { android: 'location_on', ios: 'mappin' } },
    ],
    stats: [{ label: 'Open jobs', value: '2' }, { label: 'Home pin', value: null }],
  };

  it('draws the cobalt card: ringed avatar, the name as header, status and glass pills, stat tiles and an inverse pill action', () => {
    fontScale = 1;
    const onPress = vi.fn();
    const tree = hero.ProfileHero({ ...props, action: { label: 'Edit details', icon: { android: 'edit', ios: 'pencil' }, onPress } });
    expect(style(tree)).toMatchObject({ borderRadius: 28, borderCurve: 'continuous', padding: 20, overflow: 'hidden', backgroundColor: ui.colors.accent, experimental_backgroundImage: hero.PROFILE_HERO_SHEEN });
    expect(hero.PROFILE_HERO_SHEEN).toMatch(/^linear-gradient\(135deg, #1C3AA6 0%, #2F55D4 \d+%, #4C7BEA 100%\)$/);
    const avatar = nodes(tree).find((node) => node.type === 'InitialsAvatar')!;
    expect(avatar.props).toMatchObject({ name: 'Ana Reyes', size: ui.size.profileAvatar, photoUri: 'signed-photo', accent: ui.colors.accentSubtle });
    expect(style(nodes(tree).find((node) => node.props.children === avatar)!)).toMatchObject({ padding: 3, backgroundColor: ui.colors.onAccent });
    const name = nodes(tree).find((node) => node.type === 'Text' && node.props.accessibilityRole === 'header')!;
    expect(name.props).toMatchObject({ children: 'Ana Reyes', selectable: true });
    expect(name.props.numberOfLines).toBeUndefined();
    expect(texts(tree)).toEqual(['Ana Reyes', 'Client', 'Verified', 'Santa Ana, Pateros', '2', 'Open jobs', '—', 'Home pin', 'Edit details']);
    const [status, glass] = nodes(tree).filter((node) => node.props.accessible === true && style(node).borderRadius === ui.radius.pill);
    expect(status.props.accessibilityLabel).toBe('Verified');
    expect(style(status).backgroundColor).toBe(ui.colors.onAccent);
    expect(nodes(status).find((node) => node.type === 'AppSymbol')!.props.tintColor).toBe(ui.colors.success);
    expect(style(nodes(status).find((node) => node.type === 'Text')!).color).toBe(ui.colors.success);
    expect(glass.props.accessibilityLabel).toBe('Area: Santa Ana, Pateros');
    expect(style(glass).backgroundColor).toMatch(/^rgba\(255, 255, 255, 0\.\d+\)$/);
    expect(nodes(tree).filter((node) => /^(Open jobs|Home pin): /.test(String(node.props.accessibilityLabel ?? ''))).map((node) => node.props.accessibilityLabel)).toEqual(['Open jobs: 2', 'Home pin: Not available']);
    const button = nodes(tree).find((node) => node.type === 'Pressable')!;
    expect(button.props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'Edit details', accessibilityState: { disabled: false, busy: false } });
    expect(style(button)).toMatchObject({ backgroundColor: ui.colors.surface, borderRadius: ui.radius.pill, minHeight: 48 });
    expect(style(button, true).backgroundColor).toBe(ui.colors.accentSubtle);
    (button.props.onPress as () => void)();
    expect(onPress).toHaveBeenCalledTimes(1);
    const mascot = nodes(tree).find((node) => node.type === 'SkillMatchMascot')!;
    expect(mascot.props).toMatchObject({ expression: 'hello', size: 84 });
    const stage = nodes(tree).find((node) => node.props.pointerEvents === 'none' && nodes(node.props.children).includes(mascot))!;
    expect(stage.props).toMatchObject({ accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
  });

  it('reports a disclosure, leaves out absent pills and actions, and widens stat tiles with the text size', () => {
    fontScale = 1;
    const toggle = hero.ProfileHero({ ...props, action: { label: 'Edit profile', icon: { android: 'edit', ios: 'pencil' }, onPress: () => undefined, expanded: true } });
    expect(nodes(toggle).find((node) => node.type === 'Pressable')!.props.accessibilityState).toEqual({ disabled: false, busy: false, expanded: true });
    const bare = hero.ProfileHero({ name: 'Ana Reyes', role: 'Worker', stats: props.stats });
    expect(nodes(bare).some((node) => node.type === 'Pressable')).toBe(false);
    expect(nodes(bare).some((node) => style(node).borderRadius === ui.radius.pill)).toBe(false);
    const tile = (tree: Element) => nodes(tree).find((node) => node.props.accessibilityLabel === 'Open jobs: 2')!;
    const regular = Number(style(tile(bare)).minWidth);
    fontScale = 1.5;
    const large = tile(hero.ProfileHero({ name: 'Ana Reyes', role: 'Worker', stats: props.stats }));
    expect(style(large)).toMatchObject({ flexGrow: 1, flexBasis: 0, minWidth: Math.ceil(regular * 1.5) });
    fontScale = 1;
  });

  it('closes the tab with the quiet SkillMatch footer line', () => {
    const footer = hero.ProfileFooter();
    expect(footer.props.children).toBe('SkillMatch · Barangay Santa Ana, Pateros');
    expect(style(footer)).toMatchObject({ color: ui.colors.textMuted, textAlign: 'center' });
  });
});

describe('ProfileQuickActions', () => {
  it('renders each shortcut as a white tile button with an accent glyph circle, and honours disabled', () => {
    fontScale = 1;
    const open = vi.fn(), blocked = vi.fn();
    const tree = ProfileQuickActions({ actions: [
      { label: 'Post a job', hint: 'Get help with a task', icon: { android: 'add', ios: 'plus' }, onPress: open },
      { label: 'Your details', hint: 'Name and home address', icon: { android: 'badge', ios: 'person.text.rectangle' }, onPress: blocked, disabled: true },
    ] });
    expect(style(tree)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    const [ready, disabled] = nodes(tree).filter((node) => node.type === 'Pressable');
    expect(ready.props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'Post a job', accessibilityHint: 'Get help with a task', accessibilityState: { disabled: false }, disabled: false });
    expect(style(ready)).toMatchObject({ minHeight: 104, padding: 16, borderRadius: 20, backgroundColor: ui.colors.surface, flexGrow: 1, flexBasis: '40%' });
    expect(style(ready, true).backgroundColor).toBe(ui.colors.surfaceSunken);
    const glyph = nodes(ready).find((node) => node.type === 'View' && style(node).width === 40)!;
    expect(style(glyph)).toMatchObject({ height: 40, borderRadius: 20, backgroundColor: ui.colors.accentSubtle });
    expect(nodes(glyph).find((node) => node.type === 'AppSymbol')!.props).toMatchObject({ name: { android: 'add', ios: 'plus' }, tintColor: ui.colors.accent });
    expect(texts(ready)).toEqual(['Post a job', 'Get help with a task']);
    expect(style(nodes(ready).find((node) => node.type === 'Text')!)).toMatchObject({ fontSize: 16, fontWeight: '500', color: ui.colors.textPrimary });
    (ready.props.onPress as () => void)();
    expect(open).toHaveBeenCalledTimes(1);
    expect(disabled.props).toMatchObject({ disabled: true, accessibilityState: { disabled: true } });
    expect(style(disabled, true)).toMatchObject({ backgroundColor: ui.colors.surface });
    expect(style(disabled, true).opacity).toBeUndefined();
    expect(nodes(disabled).find((node) => node.type === 'AppSymbol')!.props.tintColor).toBe(ui.colors.textSecondary);
  });
});

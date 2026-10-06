// @ts-expect-error -- Node-only inert component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { SkillMatchTheme } from '@/constants/theme';
import * as portfolio from '@/lib/portfolio';
import * as portfolioImages from '@/lib/portfolio-images';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'inert-id' }));

vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (values: Record<string, unknown>) => values.android ?? values.default } }));

type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };
const noop = () => {};
function harness() {
  let account: Props | null = { id: 'worker-a', role: 'worker', is_active: true };
  const state: unknown[] = []; let cursor = 0; const refs: Record<number, { current: unknown }> = {}; const effects: (() => void | (() => void))[] = []; let cleanups: (() => void)[] = [];
  const items = [{ id: 'project-1', title: 'A long complete portfolio project name', description: 'A long complete project description with work details.', projectScale: 'small', images: [{ id: 'cover', position: 1, signedUrl: 'signed-cover' }, { id: 'extra', position: 2, signedUrl: null }] }];
  const loadOwnPortfolio = vi.fn(async () => ({ kind: 'ready', workerProfileId: 'profile-a', items }));
  const createOwnPortfolioItem = vi.fn(async (_input: unknown): Promise<unknown> => ({ status: 'success', workerProfileId: 'profile-a', items }));
  const deleteOwnPortfolioItem = vi.fn(async () => ({ status: 'success' })), alert = vi.fn();
  const picker = { requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ granted: true })), launchImageLibraryAsync: vi.fn(async () => ({ canceled: false, assets: Array.from({ length: 9 }, (_, i) => ({ uri: 'image-' + i })) })) };
  let lifecycle: (next: string) => void = noop;
  const native = { ...Object.fromEntries(['View', 'Text', 'ScrollView', 'Pressable', 'ActivityIndicator', 'TextInput'].map(name => [name, name])), AppState: { currentState: 'active', addEventListener: vi.fn((_event: string, fn: (next: string) => void) => { lifecycle = fn; return { remove: noop }; }) }, Alert: { alert }, StyleSheet: { create: (styles: unknown) => styles } };
  const jsx = (type: unknown, props: Props): Element => typeof type === 'function' ? type(props) : { type, props };
  const cache: Record<string, Props> = {};
  function load(file: string): Props {
    if (cache[file]) return cache[file]; const exports: Props = {}; cache[file] = exports;
    const seams: Record<string, unknown> = {
    '@/components/app-symbol': { AppSymbol: 'SymbolView' },
      react: { useState: (initial: unknown) => { const slot = cursor++; if (!(slot in state)) state[slot] = initial; return [state[slot], (value: unknown) => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }]; }, useRef: (initial: unknown) => { const slot = cursor++; return refs[slot] ??= { current: initial }; }, useCallback: (fn: unknown) => fn, useEffect: (fn: () => void) => effects.push(fn) },
      'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'expo-image': { Image: 'Image' }, 'expo-image-picker': picker,
      '@/constants/theme': { SkillMatchTheme }, '@/lib/portfolio': { ...portfolio, loadOwnPortfolio, createOwnPortfolioItem, deleteOwnPortfolioItem }, '@/lib/portfolio-images': portfolioImages,
      '@/providers/account-provider': { useAccount: () => ({ account }) },
    };
    new Function('require', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)((name: string) => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => SkillMatchTheme.ui };
      if (name in seams) return seams[name]; if (name.startsWith('@/components/')) return load('src/' + name.slice(2) + '.tsx'); throw new Error('Unexpected component dependency: ' + name);
    }, exports); return exports;
  }
  const screen = load('src/components/worker-portfolio.tsx').default as () => Element;
  return { appState: (next: string) => { native.AppState.currentState = next; lifecycle(next); }, createOwnPortfolioItem, deleteOwnPortfolioItem, loadOwnPortfolio, alert, picker, items, changeAccount: (next: Props | null) => { account = next; }, cleanup: () => { cleanups.forEach(fn => fn()); cleanups = []; }, effects: () => { effects.splice(0).forEach(fn => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); }); }, render: () => { cursor = 0; effects.length = 0; return screen(); } };
}
async function ready(h: ReturnType<typeof harness>) { h.render(); h.effects(); await Promise.resolve(); await Promise.resolve(); return h.render(); }
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

describe('Worker Portfolio actual composition and existing callbacks', () => {
  it('keeps gallery first, full copy, unavailable images, and existing deletion confirmation', async () => {
    const h = harness(), tree = await ready(h); const values = texts(tree);
    expect(values).toContain(h.items[0].title); expect(values).toContain(h.items[0].description);
    expect(values).toContain(portfolio.PORTFOLIO_COPY.imageUnavailable);
    expect(values.indexOf(h.items[0].title)).toBeLessThan(values.indexOf(portfolio.PORTFOLIO_COPY.add));
    (action(tree, portfolio.PORTFOLIO_COPY.delete + ' ' + h.items[0].title).props.onPress as () => void)();
    expect(h.alert.mock.calls[0][0]).toBe(portfolio.PORTFOLIO_COPY.deleteTitle); expect(h.deleteOwnPortfolioItem).not.toHaveBeenCalled();
    const buttons = h.alert.mock.calls[0][2] as { style: string; onPress?: () => void }[];
    expect(buttons[0].style).toBe('cancel'); expect(buttons[1].style).toBe('destructive');
    buttons[1].onPress!(); await Promise.resolve(); await Promise.resolve(); expect(h.deleteOwnPortfolioItem).toHaveBeenCalledWith('profile-a', 'project-1');
  });
  it('presents an empty gallery before the unchanged Add Project form', async () => {
    const h = harness(); h.items.splice(0); const tree = await ready(h);
    expect(texts(tree)).toContain(portfolio.PORTFOLIO_COPY.empty); expect(texts(tree)).toContain(portfolio.PORTFOLIO_COPY.add);
    expect(h.createOwnPortfolioItem).not.toHaveBeenCalled(); expect(h.deleteOwnPortfolioItem).not.toHaveBeenCalled();
  });
  it('retains ordered draft images and limit while saving through the existing callback and readable busy controls', async () => {
    const h = harness(); let tree = await ready(h);
    (nodes(tree).find(n => n.type === 'TextInput' && n.props.accessibilityLabel === portfolio.PORTFOLIO_COPY.titleLabel)!.props.onChangeText as (s: string) => void)('Fixture project');
    (nodes(tree).find(n => n.props.accessibilityRole === 'radio')!.props.onPress as () => void)();
    await (action(tree, portfolio.PORTFOLIO_COPY.addPhotos).props.onPress as () => Promise<void>)();
    await Promise.resolve(); await Promise.resolve();
    tree = h.render(); expect(nodes(tree).filter(n => n.type === 'Image' && String((n.props.source as Props).uri).startsWith('image-')).map(n => (n.props.source as Props).uri)).toEqual(Array.from({ length: portfolioImages.MAX_PORTFOLIO_IMAGES }, (_, i) => 'image-' + i));
    let finish: (v: unknown) => void = noop; h.createOwnPortfolioItem.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const running = (action(tree, portfolio.PORTFOLIO_COPY.save).props.onPress as () => Promise<void>)();
    tree = h.render(); expect(action(tree, portfolio.PORTFOLIO_COPY.addPhotos).props.disabled).toBe(true); expect(action(tree, portfolio.PORTFOLIO_COPY.save).props.accessibilityState).toEqual({ disabled: true, busy: true });
    for (const pressed of [false, true]) assertReadableTree(tree, pressed);
    await (action(tree, portfolio.PORTFOLIO_COPY.save).props.onPress as () => Promise<void>)(); expect(h.createOwnPortfolioItem).toHaveBeenCalledTimes(1);
    expect(h.createOwnPortfolioItem.mock.calls[0][0]).toMatchObject({ accountId: 'worker-a', title: 'Fixture project', images: Array.from({ length: portfolioImages.MAX_PORTFOLIO_IMAGES }, (_, i) => ({ uri: 'image-' + i })) });
    finish({ status: 'success', workerProfileId: 'profile-a', items: h.items }); await running;
    expect(texts(h.render())).toContain(portfolio.PORTFOLIO_COPY.saved);
  });
  it('does not render retained or late gallery content after account loss', async () => {
    const h = harness(); await ready(h); h.cleanup(); h.changeAccount(null);
    expect(texts(h.render())).not.toContain(h.items[0].title);
  });
  it('cannot repopulate gallery from a late reply during suspension', async () => {
    const h = harness(); let finish: (v: unknown) => void = noop;
    h.loadOwnPortfolio.mockImplementation(() => new Promise(resolve => { finish = resolve as (v: unknown) => void; }));
    h.render(); h.effects(); h.appState('background'); finish({ kind: 'ready', workerProfileId: 'profile-a', items: h.items });
    await Promise.resolve(); await Promise.resolve(); expect(texts(h.render())).not.toContain(h.items[0].title);
    h.appState('active'); expect(texts(h.render())).not.toContain(h.items[0].title);
  });
  it('ignores cancelled late loader replies and presents load failure/retry without mutation', async () => {
    const h = harness(); let finish: (v: unknown) => void = noop;
    h.loadOwnPortfolio.mockImplementation(() => new Promise(resolve => { finish = resolve as (v: unknown) => void; })); h.render(); h.effects(); h.cleanup(); h.changeAccount(null);
    finish({ kind: 'ready', workerProfileId: 'profile-a', items: h.items }); await Promise.resolve(); await Promise.resolve(); expect(texts(h.render())).not.toContain(h.items[0].title);
    const e = harness(); e.loadOwnPortfolio.mockRejectedValue(new Error('network')); const tree = await ready(e);
    expect(texts(tree)).toContain(portfolio.PORTFOLIO_COPY.loadFailed); (action(tree, portfolio.PORTFOLIO_COPY.retry).props.onPress as () => void)(); expect(texts(e.render())).toContain(portfolio.PORTFOLIO_COPY.loading); expect(e.createOwnPortfolioItem).not.toHaveBeenCalled();
  });
});

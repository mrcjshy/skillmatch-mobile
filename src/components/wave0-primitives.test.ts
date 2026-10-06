// @ts-expect-error -- Node-only static composition harness; not native runtime evidence.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Props = Record<string, any>;
const flat = (style: any): Props => (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style || {});
const nodes = (tree: any): any[] =>
  !tree ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

const jsx = (type: any, props: Props) => ({ type, props });
const native = {
  Platform: { OS: 'android', select: (v: Props) => v.android ?? v.default },
  StyleSheet: { create: (v: Props) => v, absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, hairlineWidth: 1 },
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal',
};

function compile(file: string, modules: Props): Props {
  const exports: Props = {};
  new Function('require', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText)((name: string) => { if (!(name in modules)) throw Error('Unexpected import: ' + name); return modules[name]; }, exports);
  return exports;
}

const theme = compile('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} }).SkillMatchTheme;
const ui = theme.ui;
const seams = {
  '@/components/refinement-theme': { useUiTheme: () => ui },
  '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
  'expo-symbols': {},
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
};
const iconButton = compile('src/components/app-icon-button.tsx', { ...seams, 'react-native': native });

describe('AppDivider', () => {
  it('is a hairline decorative separator that can be inset', () => {
    const { AppDivider } = compile('src/components/app-divider.tsx', { ...seams, 'react-native': native });
    const line = AppDivider({ inset: 16 });
    expect(line.props.accessible).toBe(false);
    expect(flat(line.props.style)).toMatchObject({ height: 1, backgroundColor: ui.colors.hairline, marginLeft: 16 });
  });
});

describe('AppIconButton', () => {
  it('is a 48 x 48 named control with a distinct pressed state and a muted disabled glyph', () => {
    const button = iconButton.AppIconButton({ icon: { android: 'close', ios: 'xmark' }, accessibilityLabel: 'Close filters', onPress: vi.fn() });
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Close filters');
    const rest = flat(button.props.style({ pressed: false }));
    expect(rest).toMatchObject({ width: ui.size.minTarget, height: ui.size.minTarget });
    expect(flat(button.props.style({ pressed: true })).backgroundColor).toBe(ui.colors.accentSubtle);
    expect(button.props.children.props.accessible).toBe(false);
    const disabled = iconButton.AppIconButton({ icon: 'x', accessibilityLabel: 'Close', disabled: true });
    expect(disabled.props.disabled).toBe(true);
    expect(disabled.props.accessibilityState).toEqual({ disabled: true });
    expect(disabled.props.children.props.tintColor).toBe(ui.colors.textMuted);
  });
});

describe('AppDialog', () => {
  const { AppDialog } = compile('src/components/app-dialog.tsx', { ...seams, 'react-native': native });

  it('fades over the whole window with the scrim from the first frame, and Back closes it', () => {
    const onRequestClose = vi.fn();
    const modal = AppDialog({ visible: true, onRequestClose, title: 'Cancel this booking?', message: 'This cannot be undone.' });
    expect(modal.props).toMatchObject({ visible: true, transparent: true, animationType: 'fade', statusBarTranslucent: true, navigationBarTranslucent: true });
    modal.props.onRequestClose();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    const [scrim] = nodes(modal.props.children).filter((n) => n.type === 'View');
    expect(flat(scrim.props.style)).toMatchObject({ flex: 1, backgroundColor: ui.colors.scrim });
  });

  it('presents a titled, scrollable, capped card with stacked actions and a scrim dismiss that can be disabled', () => {
    const modal = AppDialog({ visible: true, onRequestClose: vi.fn(), title: 'Title', message: 'Body', actions: 'ACTIONS', dismissible: false });
    const all = nodes(modal.props.children);
    const scroll = all.find((n) => n.type === 'ScrollView');
    expect(scroll.props.accessibilityViewIsModal).toBe(true);
    expect(flat(scroll.props.style)).toMatchObject({ maxHeight: '90%' });
    const card = flat(scroll.props.contentContainerStyle);
    expect(card).toMatchObject({ backgroundColor: ui.colors.surfaceRaised, borderRadius: ui.radius.card });
    expect(card.elevation).toBe(ui.elevation.floating.elevation);
    const header = all.find((n) => n.props?.accessibilityRole === 'header');
    expect(header.props.children).toBe('Title');
    expect(flat(header.props.style).fontSize).toBe(ui.type.sectionTitle.fontSize);
    const scrimPress = all.find((n) => n.type === 'Pressable');
    expect(scrimPress.props.disabled).toBe(true);
    expect(all.some((n) => n.props?.children === 'ACTIONS')).toBe(true);
  });
});

describe('AppSheet', () => {
  function sheetHarness(visible: boolean, extra: Props = {}, reduced = false) {
    const state: any[] = []; let cursor = 0; const effects: (() => any)[] = [];
    const timing = vi.fn((_value: unknown, config: Props) => ({ start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), config }));
    class Value { constructor(public v: number) {} interpolate(c: Props) { return { interpolated: c }; } }
    const rn = {
      ...native,
      AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(reduced) },
      Animated: { Value, timing, View: 'Animated.View' },
      Easing: { bezier: (...points: number[]) => ({ bezier: points }) },
      useWindowDimensions: () => ({ width: 360, height: 800 }),
    };
    const react = {
      useState: (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], (v: any) => { state[i] = v; }]; },
      useEffect: (fn: () => any) => { effects.push(fn); },
    };
    const sheet = compile('src/components/app-sheet.tsx', {
      ...seams, react, 'react-native': rn,
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 34 }) },
      '@/components/app-icon-button': iconButton,
      '@/constants/motion': compile('src/constants/motion.ts', {}),
    });
    const render = (v: boolean, props: Props = {}) => { cursor = 0; effects.length = 0; return sheet.AppSheet({ visible: v, onClose: vi.fn(), title: 'Work status', ...props }); };
    return { render: (v = visible, props = extra) => render(v, props), effects, timing };
  }

  it('renders nothing while closed and mounts a transparent, translucent, non-native-animated Modal when opened', () => {
    const closed = sheetHarness(false);
    expect(closed.render()).toBeNull();
    const open = sheetHarness(true);
    open.render(); // first pass mounts (state set during render), second pass returns the Modal
    const modal = open.render();
    expect(modal.props).toMatchObject({ visible: true, transparent: true, animationType: 'none', statusBarTranslucent: true, navigationBarTranslucent: true });
  });

  it('slides a bottom-anchored, 90%-capped sheet with 24dp top corners, inset padding, a decorative handle and a named close', async () => {
    const h = sheetHarness(true);
    h.render();
    const modal = h.render(true, { footer: 'FOOT', children: 'CHILD' });
    const all = nodes(modal.props.children);
    const sheet = all.find((n) => n.type === 'Animated.View' && n.props.accessibilityViewIsModal);
    const style = flat(sheet.props.style);
    expect(style).toMatchObject({ maxHeight: 800 * ui.size.sheetMaxHeightRatio, paddingBottom: 34 + ui.spacing.lg, borderTopLeftRadius: ui.radius.sheet, borderTopRightRadius: ui.radius.sheet, backgroundColor: ui.colors.surfaceRaised });
    expect(style.transform[0].translateY).toBeTruthy();
    expect(all.find((n) => n.props?.accessibilityRole === 'header').props.children).toBe('Work status');
    const close = all.find((n) => n.props?.accessibilityLabel === 'Close Work status');
    expect(close).toBeTruthy();
    expect(all.some((n) => n.props?.importantForAccessibility === 'no-hide-descendants' && flat(n.props.style).width === ui.size.sheetHandleWidth)).toBe(true);
    expect(all.some((n) => n.props?.children === 'FOOT')).toBe(true);
  });

  it('closes on Back and scrim tap, and ignores both while a request is in flight', () => {
    const onClose = vi.fn();
    const h = sheetHarness(true);
    h.render();
    let modal = h.render(true, { onClose });
    modal.props.onRequestClose();
    nodes(modal.props.children).find((n) => n.props?.accessibilityLabel === 'Close' && n.type === 'Pressable').props.onPress();
    expect(onClose).toHaveBeenCalledTimes(2);
    onClose.mockClear();
    modal = h.render(true, { onClose, dismissible: false });
    modal.props.onRequestClose();
    const scrim = nodes(modal.props.children).find((n) => n.props?.accessibilityLabel === 'Close' && n.type === 'Pressable');
    expect(scrim.props.disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('enters in 240ms, and skips motion entirely when the system asks for reduced motion', async () => {
    for (const [reduced, duration] of [[false, 240], [true, 0]] as const) {
      const h = sheetHarness(true, {}, reduced);
      h.render();
      h.render();
      for (const effect of h.effects) effect();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(h.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration, useNativeDriver: true, easing: { bezier: [0.05, 0.7, 0.1, 1] } }));
    }
  });

  it('unmounts only after the exit animation completes', async () => {
    const h = sheetHarness(true);
    h.render(); h.render();
    expect(h.render(true)).not.toBeNull();
    const closing = h.render(false);
    expect(closing).not.toBeNull(); // still mounted so the exit can play
    for (const effect of h.effects) effect();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    // Motion tokens: the sheet leaves in `exit` (160) on the accelerate curve, faster than it entered.
    expect(h.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0, duration: 160, easing: { bezier: [0.3, 0, 0.8, 0.15] } }));
    expect(h.render(false)).toBeNull(); // exit finished -> rendered=false
  });
});

describe('shared tab bar (Worker, Client, later Admin)', () => {
  const bar = (fontScale: number, bottom = 21) => compile('src/components/app-tab-bar.tsx', {
    ...seams,
    '@/components/app-header-options': compile('src/components/app-header-options.ts', { '@/constants/theme': { SkillMatchTheme: theme } }),
    'react-native': { ...native, useWindowDimensions: () => ({ fontScale }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom }) },
    '@/constants/theme': { SkillMatchTheme: theme },
  });

  it('shows the selected destination as an accent pill behind an on-accent glyph, and leaves inactive ones plain', () => {
    const { TabIcon, TAB_ACTIVE_COLOR, TAB_INACTIVE_COLOR } = bar(1);
    const active = TabIcon({ name: 'home', color: TAB_ACTIVE_COLOR, size: 24 });
    expect(flat(active.props.style)).toMatchObject({ width: ui.size.tabIndicatorWidth, height: ui.size.tabIndicatorHeight, backgroundColor: ui.colors.accent });
    expect(active.props.children.props.tintColor).toBe(ui.colors.onAccent);
    const inactive = TabIcon({ name: 'home', color: TAB_INACTIVE_COLOR, size: 24 });
    expect(flat(inactive.props.style).backgroundColor).toBe('transparent');
    expect(inactive.props.children.props.tintColor).toBe(TAB_INACTIVE_COLOR);
  });

  it('keeps labels always visible, bold only when selected, within the 400/600/700 weights', () => {
    const { TabLabel } = bar(1);
    expect(flat(TabLabel({ focused: true, color: '#000', children: 'Home' }).props.style).fontWeight).toBe('700');
    expect(flat(TabLabel({ focused: false, color: '#000', children: 'Home' }).props.style).fontWeight).toBe(ui.type.label.fontWeight);
  });

  it('grows the bar with system text size and the bottom inset, with 48dp items and a hairline top boundary', () => {
    const base = bar(1).useAppTabScreenOptions(() => null);
    const large = bar(1.3, 34).useAppTabScreenOptions(() => null);
    expect(base.tabBarItemStyle.minHeight).toBeGreaterThanOrEqual(48);
    expect(base.tabBarStyle).toMatchObject({ borderTopWidth: 1, borderTopColor: ui.colors.hairline, backgroundColor: ui.colors.surface });
    expect(base.tabBarStyle.height).toBe(Math.max(80, ui.size.tabIndicatorHeight + ui.type.label.lineHeight + ui.spacing.xl) + 21);
    expect(large.tabBarStyle.height).toBeGreaterThan(base.tabBarStyle.height);
    expect(base.tabBarActiveTintColor).toBe(ui.colors.accent);
    expect(base.sceneStyle.backgroundColor).toBe(ui.colors.canvas);
  });
});

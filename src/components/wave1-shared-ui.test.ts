// @ts-expect-error -- Node-only static composition harness; not native runtime evidence.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Props = Record<string, any>;
const flat = (style: any): Props => (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style || {});
const nodes = (tree: any): any[] =>
  !tree ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const ofType = (tree: any, type: string) => nodes(tree).filter((node) => node.type === type);
const read = (file: string): string => readFileSync(file, 'utf8');
const code = (file: string): string => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const jsx = (type: any, props: Props) => (typeof type === 'function' ? type(props) : { type, props });
const element = (type: any, props: Props) => ({ type, props });
const native = {
  Platform: { OS: 'android', select: (v: Props) => v.android ?? v.default },
  StyleSheet: { create: (v: Props) => v, hairlineWidth: 1 },
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Image: 'Image',
  KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator', TextInput: 'TextInput',
};

function compile(file: string, modules: Props): Props {
  const exports: Props = {};
  new Function('require', 'exports', ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText)((name: string) => { if (!(name in modules)) throw Error('Unexpected import: ' + name); return modules[name]; }, exports);
  return exports;
}

const ui = compile('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} }).SkillMatchTheme.ui;
const base = {
  react: { useRef: (initial: any) => ({ current: initial }), useCallback: (fn: any) => fn },
  'react-native': native,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  '@/components/refinement-theme': { useUiTheme: () => ui },
  '@/components/app-symbol': { AppSymbol: 'AppSymbol' },
  'expo-symbols': {},
  'expo-status-bar': { StatusBar: 'StatusBar' },
  'expo-router': { Link: 'Link' },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
  '@/assets/images/skillmatch-logo.png': 'logo',
};

/** Minimal hook store so stateful components can be driven press by press. */
function withState(modules: Props = {}) {
  const slots: any[] = [];
  let cursor = 0;
  return {
    reset: () => { cursor = 0; },
    modules: {
      ...modules,
      react: {
        useState: (initial: any) => {
          const slot = cursor++;
          if (!(slot in slots)) slots[slot] = initial;
          return [slots[slot], (next: any) => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }];
        },
      },
    },
  };
}

describe('AuthScreen shell', () => {
  const { AuthScreen, AuthSection, AuthLink } = compile('src/components/auth-screen.tsx', base);

  it('applies edge-to-edge insets as padding, keeps a clipped viewport and pads for the keyboard', () => {
    const tree = AuthScreen({ title: 'Sign in', children: element('Child', {}) });
    expect(tree.type).toBe('View');
    expect(tree.props.style).toContainEqual({ paddingTop: 24, paddingBottom: 16 });
    expect(flat(tree.props.style).backgroundColor).toBe(ui.colors.canvas);
    expect(ofType(tree, 'StatusBar')[0].props.style).toBe('dark');
    expect(ofType(tree, 'KeyboardAvoidingView')[0].props.behavior).toBe('padding');
    const scroll = ofType(tree, 'ScrollView')[0];
    expect(scroll.props.style).toMatchObject({ flex: 1, overflow: 'hidden' });
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('is one left-aligned flat column: title as header, description, then children, then footer', () => {
    const tree = AuthScreen({ title: 'Sign in', description: 'Enter your details.', footer: element('Footer', {}), children: element('Child', {}) });
    const column = ofType(tree, 'ScrollView')[0].props.children;
    const style = flat(column.props.style);
    expect(style).toMatchObject({ maxWidth: 520, width: '100%', gap: ui.spacing.xl });
    const title = ofType(tree, 'Text').find((node) => node.props.children === 'Sign in')!;
    expect(title.props.accessibilityRole).toBe('header');
    expect(flat(title.props.style)).toMatchObject({ fontSize: ui.type.screenTitle.fontSize, color: ui.colors.textPrimary });
    expect(flat(title.props.style).textAlign).toBeUndefined();
    const order = nodes(tree).map((node) => node.type === 'Text' ? node.props.children : node.type);
    expect(order.indexOf('Sign in')).toBeLessThan(order.indexOf('Enter your details.'));
    expect(order.indexOf('Enter your details.')).toBeLessThan(order.indexOf('Child'));
    expect(order.indexOf('Child')).toBeLessThan(order.indexOf('Footer'));
  });

  it('shows a compact wordmark by default and omits it for later steps', () => {
    const withBrand = AuthScreen({ title: 'T' });
    expect(ofType(withBrand, 'Image')[0].props.source).toBe('logo');
    expect(flat(ofType(withBrand, 'Image')[0].props.style)).toMatchObject({ width: 32, height: 32 });
    expect(ofType(AuthScreen({ title: 'T', brand: false }), 'Image')).toHaveLength(0);
  });

  it('pins a sticky action below the scrolling content with a hairline top edge', () => {
    const tree = AuthScreen({ title: 'T', stickyFooter: element('Action', {}) });
    const keyboard = ofType(tree, 'KeyboardAvoidingView')[0];
    const [scroll, sticky] = keyboard.props.children;
    expect(scroll.type).toBe('ScrollView');
    expect(flat(sticky.props.style)).toMatchObject({ borderTopWidth: 1, borderTopColor: ui.colors.hairline, backgroundColor: ui.colors.canvas });
    expect(ofType(AuthScreen({ title: 'T' }), 'KeyboardAvoidingView')[0].props.children.filter(Boolean)).toHaveLength(1);
  });

  it('gives section titles a header role and links a 48dp accent target that forwards navigation props', () => {
    const section = AuthSection({ title: 'About you', children: element('Field', {}) });
    expect(ofType(section, 'Text')[0].props.accessibilityRole).toBe('header');
    expect(AuthSection({ children: element('Field', {}) }).props.children[0]).toBeNull();
    const link = AuthLink({ href: '/login', dismissTo: true, children: 'Sign in' });
    expect(link.type).toBe('Link');
    expect(link.props).toMatchObject({ href: '/login', dismissTo: true });
    expect(flat(link.props.style)).toMatchObject({ minHeight: 48, color: ui.colors.accent, textAlign: 'center' });
  });
});

describe('useAuthScroll (validation focus keeps the label visible)', () => {
  const { useAuthScroll } = compile('src/components/auth-screen.tsx', base);

  it('focuses the field and then scrolls it to leave room above for its label', () => {
    vi.useFakeTimers();
    const { scrollRef, focusField } = useAuthScroll();
    const scrollTo = vi.fn();
    const inner = { node: 'inner' };
    scrollRef.current = { getInnerViewRef: () => inner, scrollTo };
    const focus = vi.fn();
    const measureLayout = vi.fn((_relativeTo: any, onSuccess: (x: number, y: number) => void) => onSuccess(0, 640));
    focusField({ current: { focus, measureLayout } });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(scrollTo).not.toHaveBeenCalled(); // waits for the keyboard and viewport to settle
    vi.advanceTimersByTime(150);
    expect(measureLayout.mock.calls[0][0]).toBe(inner);
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 640 - 88, animated: true });
    vi.useRealTimers();
  });

  it('never scrolls above the top and tolerates missing handles', () => {
    vi.useFakeTimers();
    const { scrollRef, focusField } = useAuthScroll();
    const scrollTo = vi.fn();
    scrollRef.current = { getInnerViewRef: () => ({}), scrollTo };
    focusField({ current: { focus: vi.fn(), measureLayout: (_r: any, ok: (x: number, y: number) => void) => ok(0, 20) } });
    vi.advanceTimersByTime(150);
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
    expect(() => { focusField({ current: null }); focusField({ current: { focus: vi.fn() } }); vi.advanceTimersByTime(150); }).not.toThrow();
    vi.useRealTimers();
  });
});

describe('StateScreen', () => {
  const { StateScreen } = compile('src/components/state-screen.tsx', base);

  it('orders cue, title, explanation and recovery action in one scrollable flat column', () => {
    const tree = StateScreen({ tone: 'error', icon: { android: 'error' }, title: 'We could not load', message: 'Try again.', children: element('Action', {}) });
    expect(tree.props.style).toContainEqual({ paddingTop: 24, paddingBottom: 16 });
    const scroll = ofType(tree, 'ScrollView')[0];
    expect(flat(scroll.props.contentContainerStyle)).toMatchObject({ flexGrow: 1, justifyContent: 'center' });
    const kinds = nodes(tree).map((node) => node.type === 'Text' ? node.props.children : node.type).filter((x) => ['AppSymbol', 'We could not load', 'Try again.', 'Action'].includes(x));
    expect(kinds).toEqual(['AppSymbol', 'We could not load', 'Try again.', 'Action']);
    expect(ofType(tree, 'Text').find((node) => node.props.children === 'We could not load')!.props.accessibilityRole).toBe('header');
    const column = scroll.props.children;
    expect(flat(column.props.style).borderWidth).toBeUndefined(); // no card chrome
    expect(flat(column.props.style).backgroundColor).toBeUndefined();
  });

  it('shows a spinner instead of an icon while loading and keeps the message announced', () => {
    const tree = StateScreen({ loading: true, title: 'Loading', message: 'Restoring your session…' });
    expect(ofType(tree, 'ActivityIndicator')).toHaveLength(1);
    expect(ofType(tree, 'AppSymbol')).toHaveLength(0);
    expect(ofType(tree, 'Text').find((node) => node.props.children === 'Restoring your session…')!.props.accessibilityLiveRegion).toBe('polite');
  });

  it('tints the cue by meaning and hides it from TalkBack (the title carries the meaning)', () => {
    for (const [tone, fill, ink] of [['error', ui.colors.errorTint, ui.colors.error], ['warning', ui.colors.warningTint, ui.colors.warning], ['success', ui.colors.successTint, ui.colors.success], ['neutral', ui.colors.accentSubtle, ui.colors.accent]]) {
      const tree = StateScreen({ tone, title: 'T' });
      const cue = ofType(tree, 'View').find((node) => node.props.importantForAccessibility === 'no-hide-descendants')!;
      expect(flat(cue.props.style).backgroundColor).toBe(fill);
      expect(ofType(tree, 'AppSymbol')[0].props.tintColor).toBe(ink);
    }
  });
});

describe('FormMessage', () => {
  const { FormMessage } = compile('src/components/form-message.tsx', base);

  it('always pairs an icon with words and announces politely; errors are alerts', () => {
    for (const [tone, role, fill] of [['error', 'alert', ui.colors.errorTint], ['warning', undefined, ui.colors.warningTint], ['success', undefined, ui.colors.successTint], ['info', undefined, ui.colors.accentSubtle]]) {
      const tree = FormMessage({ tone, message: 'Something happened.' });
      expect(tree.props.accessibilityRole).toBe(role);
      expect(tree.props.accessibilityLiveRegion).toBe('polite');
      expect(flat(tree.props.style).backgroundColor).toBe(fill);
      const [icon, text] = tree.props.children;
      expect(icon.type).toBe('AppSymbol');
      expect(icon.props.accessible).toBe(false);
      expect(text.props.children).toBe('Something happened.');
      expect(flat(text.props.style).fontSize).toBe(16);
    }
  });

  it('uses primary ink for informational text so no muted text sits on an accent surface', () => {
    const info = FormMessage({ tone: 'info', message: 'x' });
    expect(flat(info.props.children[1].props.style).color).toBe(ui.colors.textPrimary);
  });
});

describe('PasswordField', () => {
  function password(props: Props = {}) {
    const store = withState({ ...base, '@/components/app-field': { AppField: 'AppField' } });
    const { PasswordField } = compile('src/components/password-field.tsx', store.modules);
    const render = (extra: Props = {}) => { store.reset(); return PasswordField({ label: 'Password', ...props, ...extra }); };
    return { render };
  }

  it('hides the password by default and names the control by the action it will take', () => {
    const field = password().render();
    expect(field.props.secureTextEntry).toBe(true);
    const toggle = field.props.trailing;
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(toggle.props.accessibilityLabel).toBe('Show password');
    expect(flat(toggle.props.style)).toMatchObject({ width: 48, height: 48 });
    expect(toggle.props.children.props.name.android).toBe('visibility');
  });

  it('toggles visibility without losing the field contract, then names the opposite action', () => {
    const h = password({ autoComplete: 'current-password' });
    h.render().props.trailing.props.onPress();
    const shown = h.render();
    expect(shown.props.secureTextEntry).toBe(false);
    expect(shown.props.trailing.props.accessibilityLabel).toBe('Hide password');
    expect(shown.props.trailing.props.children.props.name.android).toBe('visibility_off');
    expect(shown.props).toMatchObject({ label: 'Password', autoComplete: 'current-password', autoCapitalize: 'none', autoCorrect: false });
  });

  it('disables the control with the field while a submit is in flight', () => {
    const busy = password().render({ disabled: true });
    expect(busy.props.disabled).toBe(true);
    expect(busy.props.trailing.props.disabled).toBe(true);
    expect(busy.props.trailing.props.accessibilityState).toEqual({ disabled: true });
  });
});

describe('RadioRow', () => {
  const { RadioRow } = compile('src/components/radio-row.tsx', base);

  it('is a radio with a 56dp minimum, an accent outline and fill when selected, and a named state', () => {
    const selected = RadioRow({ label: 'Worker', meaning: 'I offer my skills.', selected: true, onPress: vi.fn() });
    expect(selected.props.accessibilityRole).toBe('radio');
    expect(selected.props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(selected.props.accessibilityHint).toBe('I offer my skills.');
    const rest = flat(selected.props.style({ pressed: false }));
    expect(rest).toMatchObject({ minHeight: 56, borderWidth: 2, borderColor: ui.colors.accent, backgroundColor: ui.colors.accentSubtle });
    expect(flat(selected.props.style({ pressed: true })).backgroundColor).toBe(ui.colors.accentSubtlePressed);
    const unselected = RadioRow({ label: 'Client', selected: false, onPress: vi.fn() });
    expect(flat(unselected.props.style({ pressed: false }))).toMatchObject({ borderWidth: 1, borderColor: ui.colors.controlBorder, backgroundColor: ui.colors.surface });
    expect(flat(unselected.props.style({ pressed: true })).backgroundColor).toBe(ui.colors.surfaceSunken);
    expect(flat(unselected.props.style({ pressed: true })).opacity).toBeUndefined();
  });

  it('never puts muted text on a subtle-accent surface', () => {
    expect(code('src/components/radio-row.tsx')).not.toMatch(/textMuted|textDisabled/);
    const row = RadioRow({ label: 'Worker', meaning: 'x', selected: true, onPress: vi.fn() });
    const texts = ofType(row, 'Text');
    expect(texts.map((node) => flat(node.props.style).color)).toEqual([ui.colors.textPrimary, ui.colors.textSecondary]);
  });

  it('does not react while disabled', () => {
    const row = RadioRow({ label: 'Client', selected: false, disabled: true, onPress: vi.fn() });
    expect(row.props.disabled).toBe(true);
    expect(flat(row.props.style({ pressed: true })).backgroundColor).toBe(ui.colors.surface);
  });
});

describe('ConsentCheck', () => {
  const { ConsentCheck } = compile('src/components/consent-check.tsx', base);
  const props = { accessibilityLabel: 'I agree to the Terms and Conditions', lead: 'I agree to the', linkLabel: 'Terms and Conditions', href: '/terms', onToggle: vi.fn() };

  it('is a 48dp named checkbox with the document one tap away as an inline link', () => {
    const row = ConsentCheck({ ...props, checked: false });
    const [hit, text] = row.props.children;
    expect(hit.props.accessibilityRole).toBe('checkbox');
    expect(hit.props.accessibilityLabel).toBe('I agree to the Terms and Conditions');
    expect(hit.props.accessibilityState).toEqual({ checked: false, disabled: false });
    expect(flat(hit.props.style)).toMatchObject({ minWidth: 48, minHeight: 48 });
    const link = ofType(text, 'Link')[0];
    expect(link.props.href).toBe('/terms');
    expect(link.props.children).toBe('Terms and Conditions');
    expect(ofType(hit, 'AppSymbol')).toHaveLength(0);
  });

  it('draws a real check icon, not a text glyph, when checked and fills the box with the accent', () => {
    const row = ConsentCheck({ ...props, checked: true });
    const hit = row.props.children[0];
    expect(hit.props.accessibilityState.checked).toBe(true);
    expect(ofType(hit, 'AppSymbol')[0].props.name.android).toBe('check');
    expect(ofType(hit, 'Text')).toHaveLength(0);
    expect(flat(hit.props.children.props.style).backgroundColor).toBe(ui.colors.accent);
    hit.props.onPress();
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('StepList', () => {
  const { StepList } = compile('src/components/step-list.tsx', base);
  const steps = [
    { label: 'Account and email', state: 'done' },
    { label: 'Verify your ID', detail: 'Upload a photo.', state: 'current' },
    { label: 'Set up your work profile', state: 'upcoming' },
  ];

  it('speaks position, name, state and detail for each step so order is never visual only', () => {
    const list = StepList({ steps });
    const rows = list.props.children;
    expect(rows.map((row: any) => row.props.accessibilityLabel)).toEqual([
      'Step 1 of 3: Account and email, done',
      'Step 2 of 3: Verify your ID, current step. Upload a photo.',
      'Step 3 of 3: Set up your work profile, upcoming',
    ]);
  });

  it('marks done with a check, current and upcoming with numbers, and ends the rail at the last step', () => {
    const list = StepList({ steps });
    const [done, current, upcoming] = list.props.children;
    expect(ofType(done, 'AppSymbol')[0].props.name.android).toBe('check');
    expect(ofType(current, 'Text').some((node) => node.props.children === 2)).toBe(true);
    expect(ofType(upcoming, 'Text').some((node) => node.props.children === 3)).toBe(true);
    const rails = (row: any) => ofType(row, 'View').filter((node) => flat(node.props.style).width === 2);
    expect(rails(done)).toHaveLength(1);
    expect(rails(current)).toHaveLength(1);
    expect(rails(upcoming)).toHaveLength(0);
    expect(flat(rails(done)[0].props.style).backgroundColor).toBe(ui.colors.accent);
  });
});

describe('AppField additions (inputRef, trailing)', () => {
  function appField(props: Props = {}) {
    const store = withState({ ...base });
    const { AppField } = compile('src/components/app-field.tsx', store.modules);
    return AppField({ label: 'Email', ...props });
  }

  it('keeps the exact layout when no trailing control is given', () => {
    const tree = appField();
    expect(tree.props.children[1].type).toBe('TextInput');
    expect(flat(tree.props.children[1].props.style).paddingRight).not.toBe(48);
  });

  it('wraps the input and a 48dp trailing slot, reserving space so text never runs under it', () => {
    const trailing = element('Toggle', {});
    const tree = appField({ trailing });
    const wrap = tree.props.children[1];
    expect(wrap.type).toBe('View');
    const [input, slot] = wrap.props.children;
    expect(input.type).toBe('TextInput');
    expect(flat(input.props.style).paddingRight).toBe(48);
    expect(flat(slot.props.style)).toMatchObject({ position: 'absolute', top: 0, bottom: 0, right: 0, width: 48 });
    expect(slot.props.children).toBe(trailing);
  });

  it('hands the caller a focus handle without changing the input contract', () => {
    const inputRef = { current: null };
    const tree = appField({ inputRef });
    expect(tree.props.children[1].props.ref).toBe(inputRef);
  });
});

describe('Incoming message banner as a snackbar', () => {
  const host = read('src/components/incoming-message-banner-host.tsx');

  it('is one raised row, not a card, and keeps its accessible names and gating', () => {
    expect(host).not.toContain('AppCard');
    expect(host).not.toContain('tamagui');
    expect(host).toContain('accessibilityLiveRegion="polite"');
    expect(host).toContain('accessibilityLabel="Dismiss new message"');
    expect(host).toContain('Open booking chat');
    expect(host).toContain('...elevation.floating');
    expect(host).toMatch(/dismiss: \{ minWidth: size\.minTarget, minHeight: size\.minTarget/);
    expect(host).toMatch(/open: \{[^}]*minHeight: size\.minTarget/s);
  });

  it('uses a drawn close icon, not a multiplication-sign glyph', () => {
    expect(host).not.toContain('×');
    expect(host).toContain("android: 'close'");
  });
});

describe('Wave 1 contrast guard', () => {
  it('keeps muted text off every surface that can be pressed-subtle', () => {
    for (const file of ['radio-row', 'form-message', 'step-list', 'notification-list', 'consent-check']) {
      expect(code(`src/components/${file}.tsx`), file).not.toMatch(/textMuted|textDisabled/);
    }
  });
});

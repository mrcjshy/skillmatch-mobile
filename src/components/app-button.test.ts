// @ts-expect-error -- Node-only harness; Expo app omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type Props = Record<string, any>;
type Element = { type: string; props: Props };
const flatten = (style: any): Props => Array.isArray(style)
  ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : style || {};

function controls() {
  const native = { Platform: { select: (values: Props) => values.android ?? values.default },
    StyleSheet: { create: (styles: Props) => styles },
    Pressable: 'Pressable', Text: 'Text', ActivityIndicator: 'ActivityIndicator' };
  const jsx = (type: string, props: Props) => ({ type, props });
  const compile = (file: string, modules: Props) => {
    const exports: Props = {};
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(code, { exports, require: (name: string) => {
      if (!(name in modules)) throw Error(`Unexpected import: ${name}`);
      return modules[name];
    } });
    return exports;
  };
  const theme = compile('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} });
  const { AppButton } = compile('src/components/app-button.tsx', {
    'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/constants/theme': theme,
  });
  return { theme, render: (props: Props): Element => AppButton(props) };
}

describe('Shared control dimensions', () => {
  it('uses the approved minimum target tokens and retains legacy aliases', () => {
    const { theme } = controls();
    expect(theme.SkillMatchTheme.ui.size).toMatchObject({ primaryButton: 56, fieldHeight: 52,
      secondaryButton: 52, searchHeight: 52, ghostButton: 48, compactButton: 48,
      segmentHeight: 40, chipHeight: 28 });
    expect(theme.SkillMatchTheme.size).toEqual({ iconTarget: 48, primaryCtaHeight: 52 });
  });
});

describe('AppButton growing targets', () => {
  for (const [variant, minHeight] of Object.entries({ primary: 56, secondary: 52, destructive: 52, ghost: 48, compact: 48 })) {
    it(`${variant} grows around scalable, wrapping labels without hitSlop dependence`, () => {
      const button = controls().render({ label: 'A long control label that can wrap', variant });
      const style = flatten(button.props.style({ pressed: false }));
      expect(style.minHeight).toBe(minHeight);
      expect(style.height).toBeUndefined();
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
      expect(style.paddingVertical).toBeGreaterThanOrEqual(8);
      expect(button.props.hitSlop).toBeUndefined();
      const text = button.props.children;
      expect(flatten(text.props.style).flexShrink).toBe(1);
      expect(flatten(text.props.style).maxWidth).toBe('100%');
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.adjustsFontSizeToFit).not.toBe(true);
      expect(text.props.numberOfLines).toBeUndefined();
    });
  }
});

describe('AppButton blocked presentation', () => {
  for (const variant of ['primary', 'secondary', 'ghost', 'destructive', 'compact']) {
    it(`${variant} disabled surface and label stay neutral and readable without opacity`, () => {
      const button = controls().render({ label: 'Continue', variant, disabled: true });
      for (const pressed of [false, true]) {
        const style = flatten(button.props.style({ pressed }));
        expect(style.opacity).toBeUndefined();
        expect(style.backgroundColor).toBe('#F4F4EC');
        expect(style.borderColor).toBe('#737A70');
      }
      expect(flatten(button.props.children.props.style).color).toBe('#5F6360');
    });
    it(`${variant} loading surface has no opacity and a contrasting spinner`, () => {
      const button = controls().render({ label: 'Continue', variant, loading: true });
      expect(flatten(button.props.style({ pressed: true })).opacity).toBeUndefined();
      expect(flatten(button.props.style({ pressed: false })).backgroundColor).toBe('#F4F4EC');
      expect(button.props.children.type).toBe('ActivityIndicator');
      expect(button.props.children.props.color).toBe(variant === 'destructive' ? '#B91C1C' : '#163300');
    });
  }
});

describe('AppButton essential boundaries', () => {
  for (const [variant, borderColor] of Object.entries({ primary: '#163300', secondary: '#737A70',
    ghost: '#737A70', destructive: '#B91C1C', compact: '#163300' })) {
    it(`${variant} has an essential visible boundary`, () => {
      const button = controls().render({ label: 'Action', variant });
      const style = flatten(button.props.style({ pressed: false }));
      expect(style.borderColor).toBe(borderColor);
      expect(style.borderWidth).toBeGreaterThanOrEqual(1.5);
    });
  }
});

describe('AppButton pressed contrast', () => {
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/../g)!.map(c => parseInt(c, 16) / 255)
      .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const ratio = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05)
    / (Math.min(luminance(a), luminance(b)) + 0.05);
  const composite = (fg: string, bg: string, opacity: number) => '#'
    + fg.slice(1).match(/../g)!.map((c, i) => Math.round(parseInt(c, 16) * opacity
      + parseInt(bg.slice(1).match(/../g)![i], 16) * (1 - opacity)).toString(16).padStart(2, '0')).join('');
  for (const variant of ['secondary', 'ghost', 'destructive', 'compact']) {
    it(`${variant} keeps pressed text and essential boundary above their contrast thresholds`, () => {
      const button = controls().render({ label: 'Action', variant });
      const style = flatten(button.props.style({ pressed: true }));
      const text = flatten(button.props.children.props.style).color;
      for (const surface of ['#FFFFFF', '#F4F4EC']) {
        const background = style.backgroundColor === 'transparent' ? surface : style.backgroundColor;
        const alpha = style.opacity ?? 1;
        expect(ratio(composite(style.borderColor, surface, alpha), surface)).toBeGreaterThanOrEqual(3);
        expect(ratio(composite(text, surface, alpha), composite(background, surface, alpha))).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe('AppButton preserved interaction contract', () => {
  it('keeps exact primary normal/pressed colors, destructive text and compact enabled text', () => {
    const { render } = controls();
    const primary = render({ label: 'Continue' });
    expect(flatten(primary.props.style({ pressed: false })).backgroundColor).toBe('#9FE870');
    expect(flatten(primary.props.style({ pressed: true })).backgroundColor).toBe('#7ED856');
    expect(flatten(primary.props.children.props.style).color).toBe('#163300');
    expect(flatten(render({ label: 'Delete', variant: 'destructive' }).props.children.props.style).color).toBe('#B91C1C');
    expect(flatten(render({ label: 'Next', variant: 'compact' }).props.children.props.style).color).toBe('#FFFFFF');
  });
  it('retains action identity, accessible names and accurate disabled/busy state through transitions', () => {
    const { render } = controls();
    let count = 0;
    const onPress = () => { count++; };
    // Model the native Pressable disabled gate; this is not proof of native suppression.
    const activate = (element: Element) => { if (!element.props.disabled) element.props.onPress?.(); };
    for (const [disabled, loading, blocked] of [[false, false, false], [true, false, true], [false, true, true], [true, true, true], [false, false, false]]) {
      const button = render({ label: 'Continue', accessibilityLabel: 'Submit application', onPress, disabled, loading });
      expect(button.props.onPress).toBe(onPress);
      expect(button.props.disabled).toBe(blocked);
      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.accessibilityLabel).toBe('Submit application');
      expect(button.props.accessibilityState).toEqual({ disabled: blocked, busy: loading });
      activate(button);
    }
    expect(count).toBe(2);
    expect(render({ label: 'Send', loading: true }).props.accessibilityLabel).toBe('Send');
  });
  it('keeps arbitrary caller style last in every state', () => {
    const { render } = controls();
    const style = [{ height: 71, opacity: 0.9 }, { backgroundColor: '#123456' }];
    for (const props of [{}, { disabled: true }, { loading: true }]) {
      const button = render({ label: 'Action', style, ...props });
      for (const pressed of [false, true]) {
        expect(button.props.style({ pressed }).at(-1)).toBe(style);
        expect(flatten(button.props.style({ pressed }))).toMatchObject({ height: 71, opacity: 0.9, backgroundColor: '#123456' });
      }
    }
  });
});

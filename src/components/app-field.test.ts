// @ts-expect-error -- Node-only harness; Expo app omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Props = Record<string, any>;
type Element = { type: string; props: Props };
const flatten = (style: any): Props => Array.isArray(style)
  ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : style || {};

function field() {
  let focused = false;
  const jsx = (type: string, props: Props) => ({ type, props });
  const native = { Platform: { select: (values: Props) => values.android ?? values.default },
    StyleSheet: { create: (styles: Props) => styles }, Text: 'Text', TextInput: 'TextInput', View: 'View' };
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
  const { AppField } = compile('src/components/app-field.tsx', {
    'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/constants/theme': theme,
    react: { useState: () => [focused, (next: boolean) => { focused = next; }] },
  });
  return { render: (props: Props = {}): Element => AppField(props) };
}
const input = (tree: Element): Element => tree.props.children.find((node: Element | null) => node?.type === 'TextInput');

describe('AppField growing editing viewport', () => {
  for (const variant of ['default', 'search']) {
    it(`${variant} has a growing single-line minimum of 52`, () => {
      const node = input(field().render({ variant }));
      expect(flatten(node.props.style).minHeight).toBe(52);
      expect(flatten(node.props.style).height).toBeUndefined();
      expect(node.props.multiline).toBe(false);
      expect(node.props.allowFontScaling).not.toBe(false);
    });
    it(`${variant} multiline retains native behavior, top alignment and minimum 96`, () => {
      const node = input(field().render({ variant, multiline: true }));
      expect(flatten(node.props.style)).toMatchObject({ minHeight: 96, textAlignVertical: 'top' });
      expect(flatten(node.props.style).height).toBeUndefined();
      expect(node.props.multiline).toBe(true);
    });
  }
});

describe('AppField essential boundary and event identity', () => {
  for (const variant of ['default', 'search']) {
    it(`${variant} has a controlBorder at rest, primary focus and danger error precedence`, () => {
      const h = field();
      const props = { variant, onFocus: vi.fn(), onBlur: vi.fn() };
      const focusEvent = { nativeEvent: { target: 17 } };
      const blurEvent = { nativeEvent: { target: 17 } };
      expect(flatten(input(h.render(props)).props.style).borderColor).toBe('#737A70');
      input(h.render(props)).props.onFocus(focusEvent);
      expect(props.onFocus).toHaveBeenCalledExactlyOnceWith(focusEvent);
      expect(flatten(input(h.render(props)).props.style).borderColor).toBe('#163300');
      expect(flatten(input(h.render({ ...props, errorText: 'Required' })).props.style).borderColor).toBe('#B91C1C');
      input(h.render(props)).props.onBlur(blurEvent);
      expect(props.onBlur).toHaveBeenCalledExactlyOnceWith(blurEvent);
      expect(flatten(input(h.render(props)).props.style).borderColor).toBe('#737A70');
      expect(flatten(input(h.render({ ...props, errorText: 'Required' })).props.style).borderColor).toBe('#B91C1C');
    });
  }
});

describe('AppField noneditable presentation and state', () => {
  for (const props of [{ disabled: true, editable: true }, { editable: false }]) {
    it(`uses neutral readable colors without opacity for ${JSON.stringify(props)}`, () => {
      const node = input(field().render(props));
      expect(node.props.editable).toBe(false);
      expect(flatten(node.props.style).opacity).toBeUndefined();
      expect(flatten(node.props.style).backgroundColor).toBe('#F4F4EC');
      expect(flatten(node.props.style).color).toBe('#5F6360');
    });
    it(`merges disabled state without losing unrelated accessibility state for ${JSON.stringify(props)}`, () => {
      const node = input(field().render({ ...props, 'aria-disabled': false,
        accessibilityState: { disabled: false, busy: true, selected: true, expanded: false } }));
      expect(node.props.accessibilityState).toEqual({ disabled: true, busy: true, selected: true, expanded: false });
      expect(node.props['aria-disabled']).toBe(true);
    });
  }
  it('reports editable controls enabled and preserves default native editable behavior', () => {
    const h = field();
    const node = input(h.render({ 'aria-disabled': true, accessibilityState: { selected: false, disabled: true } }));
    expect(node.props.editable).toBeUndefined();
    expect(node.props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(node.props['aria-disabled']).toBe(false);
    expect(input(h.render({ editable: true })).props.editable).toBe(true);
  });
});

describe('AppField accessible naming and unchanged descriptions', () => {
  it('uses the visible label as fallback name without helper/error concatenation', () => {
    const node = input(field().render({ label: 'Job title', helperText: 'Use a short title', errorText: 'Required' }));
    expect(node.props.accessibilityLabel).toBe('Job title');
    expect(node.props.accessibilityHint).toBeUndefined();
  });
  it('keeps an explicit accessible name and caller hint unchanged across helper/error states', () => {
    const h = field();
    for (const errorText of [undefined, 'Required']) {
      const tree = h.render({ label: 'Job title', accessibilityLabel: 'Title of job',
        accessibilityHint: 'Enter the title used in your posting', helperText: 'Use a short title', errorText });
      expect(input(tree).props.accessibilityLabel).toBe('Title of job');
      expect(input(tree).props.accessibilityHint).toBe('Enter the title used in your posting');
      expect(tree.props.accessible).toBeUndefined();
      expect(tree.props.accessibilityLabel).toBeUndefined();
    }
    expect(input(h.render({ label: 'Title', accessibilityLabel: '' })).props.accessibilityLabel).toBe('');
  });
  for (const reference of [{ accessibilityLabelledBy: 'title-label' },
    { accessibilityLabelledBy: ['first-label', 'second-label'] }, { 'aria-labelledby': 'title-label' },
    { 'aria-label': 'Explicit native alias' }]) {
    it(`preserves supported caller name reference ${JSON.stringify(reference)} without fallback`, () => {
      const node = input(field().render({ label: 'Title', ...reference }));
      expect(node.props).toMatchObject(reference);
      expect(node.props.accessibilityLabel).toBeUndefined();
    });
  }
});

describe('AppField preserved native editing and visible copy', () => {
  it('forwards controlled/native editing props and callbacks without taking ownership', () => {
    const onChangeText = vi.fn();
    const onSubmitEditing = vi.fn();
    const props = { value: 'Draft', onChangeText, onSubmitEditing, keyboardType: 'email-address',
      autoComplete: 'email', textContentType: 'emailAddress', secureTextEntry: true, maxLength: 37,
      returnKeyType: 'send', blurOnSubmit: false, autoCorrect: false, autoCapitalize: 'none',
      selection: { start: 1, end: 2 }, testID: 'field', placeholderTextColor: '#123456' };
    const node = input(field().render(props));
    expect(node.props).toMatchObject(props);
    expect(node.props.onChangeText).toBe(onChangeText);
    expect(node.props.onSubmitEditing).toBe(onSubmitEditing);
    node.props.onChangeText('Next draft');
    expect(onChangeText).toHaveBeenCalledExactlyOnceWith('Next draft');
    expect(node.props.value).toBe('Draft');
    const event = { nativeEvent: { text: 'Draft' } };
    node.props.onSubmitEditing(event);
    expect(onSubmitEditing).toHaveBeenCalledExactlyOnceWith(event);
  });
  it('keeps style then inputStyle precedence even when noneditable, focused, multiline or in error', () => {
    const h = field();
    const style = [{ color: '#123456', minHeight: 99 }];
    const inputStyle = { color: '#654321', minHeight: 123, borderColor: '#abcdef' };
    const containerStyle = { margin: 17 };
    for (const props of [{}, { disabled: true }, { editable: false }, { multiline: true }, { errorText: 'Required' }]) {
      const tree = h.render({ ...props, style, inputStyle, containerStyle });
      expect(tree.props.style).toBe(containerStyle);
      const node = input(tree);
      node.props.onFocus({ nativeEvent: {} });
      expect(node.props.style.at(-2)).toBe(style);
      expect(node.props.style.at(-1)).toBe(inputStyle);
      expect(flatten(input(h.render({ ...props, style, inputStyle })).props.style)).toMatchObject(inputStyle);
    }
  });
  it('displays error instead of helper while preserving label and default helper', () => {
    const h = field();
    const texts = (tree: Element) => tree.props.children.filter((n: Element | null) => n?.type === 'Text').map((n: Element) => n.props.children);
    expect(texts(h.render({ label: 'Title', helperText: 'Helper' }))).toEqual(['Title', 'Helper']);
    expect(texts(h.render({ label: 'Title', helperText: 'Helper', errorText: 'Error' }))).toEqual(['Title', 'Error']);
    expect(texts(h.render({ helperText: 'Helper', errorText: '' }))).toEqual(['Helper']);
  });
});

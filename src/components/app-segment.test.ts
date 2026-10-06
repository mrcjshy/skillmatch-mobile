// @ts-expect-error -- Node-only harness; Expo app omits Node declarations.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
type Props = Record<string, any>;
const flatten = (style: any): Props => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : style || {};
const children = (tree: any): any[] => !tree ? [] : Array.isArray(tree) ? tree.flatMap(children) : typeof tree === 'object' ? [tree, ...children(tree.props?.children)] : [];
const states = (element: any, pressed: boolean) => flatten(typeof element.props.style === 'function' ? element.props.style({ pressed }) : element.props.style);
function harness(file: string, name: string) {
  const native = { Platform: { select: (values: Props) => values.android ?? values.default }, StyleSheet: { create: (value: Props) => value, absoluteFill: { position: 'absolute' } }, Pressable: 'Pressable', Text: 'Text', View: 'View', Modal: 'Modal' };
  const jsx = (type: any, props: Props) => ({ type, props });
  const compile = (path: string, modules: Props): Props => {
    const exports: Props = {};
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(code, { exports, require: (key: string) => { if (!(key in modules)) throw Error(`Unexpected import: ${key}`); return modules[key]; } });
    return exports;
  };
  const theme = compile('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} });
  let state = false;
  const setState = (next: boolean) => { state = next; };
  const Component = compile(`src/components/${file}.tsx`, { 'react-native': native, react: { useState: () => [state, setState] }, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, '@/constants/theme': theme,
    '@/components/app-field': { AppField: 'AppField' }, '@/lib/worker-profile': compile('src/lib/worker-profile.ts', {}), '@/lib/skill-catalog': compile('src/lib/skill-catalog.ts', {}) })[name];
  return { render: (props: Props) => Component(props), ui: theme.SkillMatchTheme.ui };
}
function ratio(a: string, b: string) {
  const lum = (hex: string) => { const rgb = hex.slice(1).match(/../g)!.map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
  const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
function contrast(element: any, parent: string, tag: string) {
  for (const pressed of [false, true]) {
    const style = states(element, pressed);
    const background = !style.backgroundColor || style.backgroundColor === 'transparent' ? parent : style.backgroundColor;
    expect(style.opacity).toBeUndefined();
    for (const text of children(element.props.children).filter(n => n.type === 'Text')) {
      const color = flatten(text.props.style).color;
      if (color) { const value = ratio(color, background); expect(value).toBeGreaterThanOrEqual(4.5); console.log(tag, { pressed, color, background, textContrast: value }); }
    }
    if (style.borderColor && style.borderColor !== 'transparent') { const value = ratio(style.borderColor, background); expect(value).toBeGreaterThanOrEqual(3); console.log(tag, { pressed, boundaryContrast: value }); }
  }
}

describe('AppSegment actual controlled options', () => {
  const options = [{ value: 'one', label: 'Beginner with a long scalable label' }, { value: 'two', label: 'Experienced' }];
  it('grows at 48 minima, wraps labels, shows selected meaning and composed press feedback', () => {
    const h = harness('app-segment', 'AppSegment');
    const tree = h.render({ options, value: 'one', onChange: vi.fn(), accessibilityLabel: 'Skill proficiency', style: { backgroundColor: '#FFFFFF' } });
    expect(tree.props.accessibilityRole).toBe('radiogroup');
    expect(tree.props.accessibilityLabel).toBe('Skill proficiency');
    const track = flatten(tree.props.style);
    expect(track.height).toBeUndefined();
    for (const option of children(tree).filter(n => n.type === 'Pressable')) {
      expect(states(option, false).minHeight).toBeGreaterThanOrEqual(48);
      expect(states(option, false).minWidth).toBeGreaterThanOrEqual(48);
      expect(states(option, true).backgroundColor).not.toBe(states(option, false).backgroundColor);
      const label = option.props.children;
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.allowFontScaling).not.toBe(false);
      expect(flatten(label.props.style).flexShrink).toBe(1);
      if (option.props.accessibilityState.selected) expect(flatten(label.props.style).textDecorationLine).toBe('underline');
      contrast(option, track.backgroundColor, 'segment');
    }
  });
  it('preserves exact values/names and one callback per activation; disabled props and neutral states remain', () => {
    const h = harness('app-segment', 'AppSegment'), onChange = vi.fn();
    const tree = h.render({ options, value: 'one', onChange });
    const buttons = children(tree).filter(n => n.type === 'Pressable');
    expect(buttons.map(b => b.props.accessibilityLabel)).toEqual(options.map(o => o.label));
    expect(buttons.map(b => b.props.accessibilityRole)).toEqual(['radio', 'radio']);
    expect(buttons.map(b => b.props.accessibilityState.selected)).toEqual([true, false]);
    buttons[1].props.onPress(); expect(onChange.mock.calls).toEqual([['two']]);
    const disabledTree = h.render({ options, value: 'one', disabled: true, onChange });
    for (const button of children(disabledTree).filter(n => n.type === 'Pressable')) {
      expect(button.props.disabled).toBe(true); expect(button.props.accessibilityState.disabled).toBe(true);
      expect(states(button, true)).toEqual(states(button, false));
      contrast(button, flatten(disabledTree.props.style).backgroundColor, 'segment-disabled');
    }
  });
});

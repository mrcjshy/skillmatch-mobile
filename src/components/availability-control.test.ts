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

describe('AvailabilityControl actual local interactions', () => {
  it('keeps the 52 trigger, essential boundary, scalable labels and neutral disabled feedback', () => {
    const h = harness('availability-control', 'AvailabilityControl');
    for (const disabled of [false, true]) {
      const tree = h.render({ value: 'available', onChange: vi.fn(), disabled });
      const trigger = children(tree).find(n => n.props.accessibilityLabel === 'Availability');
      const idle = states(trigger, false);
      expect(idle.minHeight).toBe(52);
      expect(idle.borderColor).toBe(h.ui.colors.controlBorder);
      expect(trigger.props.disabled).toBe(disabled);
      expect(trigger.props.accessibilityState).toEqual({ disabled, expanded: false });
      if (disabled) expect(states(trigger, true)).toEqual(idle);
      else expect(states(trigger, true).backgroundColor).not.toBe(idle.backgroundColor);
      expect(flatten(trigger.props.children[0].props.style).flexShrink).toBe(1);
      contrast(trigger, h.ui.colors.surface, disabled ? 'availability-disabled' : 'availability');
    }
  });
  it('keeps open, unchanged selection, offline-as-busy, change and close sequencing', () => {
    const h = harness('availability-control', 'AvailabilityControl'), onChange = vi.fn();
    const props = { value: 'offline', onChange };
    let tree = h.render(props);
    const modal = () => children(tree).find(n => n.type === 'Modal');
    expect(modal().props.visible).toBe(false);
    const trigger = () => children(tree).find(n => n.props.accessibilityLabel === 'Availability');
    trigger().props.onPress(); tree = h.render(props); expect(modal().props.visible).toBe(true);
    expect(trigger().props.accessibilityState.expanded).toBe(true);
    let options = children(tree).filter(n => n.props.accessibilityRole === 'menuitem');
    expect(options.map(n => n.props.accessibilityLabel)).toEqual(['Available', 'Busy']);
    expect(options.map(n => n.props.accessibilityState.selected)).toEqual([false, true]);
    options[1].props.onPress(); tree = h.render(props);
    expect(modal().props.visible).toBe(false); expect(onChange).not.toHaveBeenCalled();
    trigger().props.onPress(); tree = h.render(props);
    options = children(tree).filter(n => n.props.accessibilityRole === 'menuitem');
    options[0].props.onPress(); tree = h.render(props);
    expect(modal().props.visible).toBe(false); expect(onChange.mock.calls).toEqual([['available']]);
    trigger().props.onPress(); tree = h.render(props);
    children(tree).find(n => n.props.accessibilityLabel === 'Close availability options').props.onPress();
    tree = h.render(props); expect(modal().props.visible).toBe(false);
    trigger().props.onPress(); tree = h.render(props); modal().props.onRequestClose();
    tree = h.render(props); expect(modal().props.visible).toBe(false);
  });
  it('selected option conveys meaning beyond color and options keep readable composed pressed states', () => {
    const h = harness('availability-control', 'AvailabilityControl');
    const tree = h.render({ value: 'available', onChange: vi.fn() });
    for (const option of children(tree).filter(n => n.props.accessibilityRole === 'menuitem')) {
      expect(states(option, false).minHeight).toBeGreaterThanOrEqual(48);
      expect(states(option, true).backgroundColor).not.toBe(states(option, false).backgroundColor);
      expect(option.props.children.props.numberOfLines).toBeUndefined();
      if (option.props.accessibilityState.selected) expect(flatten(option.props.children.props.style).textDecorationLine).toBe('underline');
      contrast(option, h.ui.colors.surface, 'availability-option');
    }
  });
});

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

const skills = [{ id: 'b', skill_name: 'Long skill label preserved in supplied ordering' }, { id: 'a', skill_name: 'Plumbing' }];
describe('SelectedSkillChips actual removal controls', () => {
  it('keeps growing 48 minima, unclipped labels and composed readable feedback over actual chip parent', () => {
    const h = harness('selected-skill-chips', 'SelectedSkillChips');
    for (const disabled of [false, true]) {
      const tree = h.render({ skills, onRemove: vi.fn(), disabled });
      for (const block of tree.props.children) {
        const chip = block.props.children[0], button = chip.props.children[1];
        const label = chip.props.children[0];
        expect(label.props.numberOfLines).toBeUndefined();
        expect(label.props.allowFontScaling).not.toBe(false);
        const resting = states(button, false), pressed = states(button, true);
        expect(resting.minHeight).toBeGreaterThanOrEqual(48); expect(resting.minWidth).toBeGreaterThanOrEqual(48);
        expect(resting.height).toBeUndefined();
        expect(resting.maxWidth).toBe('100%');
        expect(button.props.children.props.numberOfLines).toBeUndefined();
        expect(flatten(button.props.children.props.style).flexShrink).toBe(1);
        expect(button.props.disabled).toBe(disabled);
        expect(button.props.accessibilityState).toEqual({ disabled });
        if (disabled) { expect(pressed).toEqual(resting); expect(flatten(button.props.children.props.style).color).toBe(h.ui.colors.textSecondary); }
        else expect(pressed.backgroundColor).not.toBe(resting.backgroundColor);
        contrast(button, flatten(chip.props.style).backgroundColor, 'skill-remove');
      }
    }
  });
  it('keeps names, supplied ordering, exact callback IDs and render-after siblings without nested activation', () => {
    const h = harness('selected-skill-chips', 'SelectedSkillChips'), onRemove = vi.fn();
    const renderAfterSkill = vi.fn((skill: Props) => ({ type: 'After', props: { id: skill.id } }));
    const tree = h.render({ skills, onRemove, renderAfterSkill });
    const buttons = children(tree).filter(n => n.type === 'Pressable');
    expect(buttons.map(n => n.props.accessibilityLabel)).toEqual(skills.map(s => `Remove ${s.skill_name}`));
    expect(buttons.map(n => n.props.accessibilityRole)).toEqual(['button', 'button']);
    buttons[0].props.onPress(); buttons[1].props.onPress(); expect(onRemove.mock.calls).toEqual([['b'], ['a']]);
    expect(renderAfterSkill.mock.calls).toEqual([[skills[0]], [skills[1]]]);
    for (const button of buttons) expect(children(button).filter(n => n.type === 'Pressable')).toHaveLength(1);
    expect(tree.props.children.map((block: Props) => block.props.children[1].type)).toEqual(['After', 'After']);
    expect(h.render({ skills: [], onRemove, emptyLabel: 'Empty selection' }).props.children).toBe('Empty selection');
  });
});

// @ts-expect-error -- Node-only harness.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
type Props = Record<string, any>;
const flat = (s: any): Props => Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map(flat)) : s || {};
function summary(props: Props) {
  const native = { Platform: { select: (v: Props) => v.android ?? v.default }, StyleSheet: { create: (s: Props) => s }, Pressable: 'Pressable', Text: 'Text', View: 'View' };
  const jsx = (type: any, props: Props) => ({ type, props });
  const load = (file: string, modules: Props) => {
    const exports: Props = {};
    runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
      { exports, require: (name: string) => { if (!(name in modules)) throw Error(name); return modules[name]; } });
    return exports;
  };
  const theme = load('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} });
  const { SkillListSummary } = load('src/components/skill-list-summary.tsx', { 'react-native': native,
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@/constants/theme': theme });
  // Inspected caller ancestry: section -> form -> scroll/container, with no intervening fill.
  const source = readFileSync('src/components/client-post-job-screen.tsx','utf8');
  const exports: Props = {};
  runInNewContext(ts.transpileModule(source.slice(source.lastIndexOf('const styles = StyleSheet.create(')) + '\nexports.styles = styles;',
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, StyleSheet: native.StyleSheet, ...theme.SkillMatchTheme.ui });
  const tree = SkillListSummary(props);
  tree.parentSurface = flat(exports.styles.container).backgroundColor || flat(exports.styles.scroll).backgroundColor;
  return tree;
}
function all(tree: any, kind: string): any[] {
  if (Array.isArray(tree)) return tree.flatMap(x => all(x, kind));
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === kind ? [tree] : []), ...all(tree.props.children, kind)];
}
const skills = ['Plumbing', 'Electrical', 'Painting', 'Very long carpentry skill name'].map((skill_name, id) => ({ id: String(id), skill_name }));
it('gives only interactive more and View controls growing 48 by 48 targets and wrapping labels', () => {
  const tree = summary({ skills, onPressView() {} });
  const buttons = all(tree, 'Pressable');
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    const s = flat(button.props.style({ pressed: false }));
    expect(s.minHeight).toBe(48);
    expect(s.minWidth).toBe(48);
    expect(s.height).toBeUndefined();
    expect(s.maxWidth).toBe('100%');
    expect(button.props.children.props.numberOfLines).toBeUndefined();
  }
});
it('preserves counts, controlled slicing, names, callback identity and exactly one activation', () => {
  let calls = 0;
  const callback = () => { calls++; };
  const buttons = all(summary({ skills, maxVisible: 2.9, onPressView: callback, viewLabel: 'Open skill list' }), 'Pressable');
  expect(buttons.map(x => x.props.accessibilityLabel)).toEqual(['View 2 more skills', 'Open skill list']);
  for (const b of buttons) { expect(b.props.onPress).toBe(callback); b.props.onPress(); expect(b.props.accessibilityRole).toBe('button'); }
  expect(calls).toBe(2);
  expect(buttons[0].props.children.props.children).toEqual(['+', 2, ' more']);
});
it('preserves four bounded growing static chips, full names and static more without Pressables', () => {
  const longSkills = skills.map((skill, index) => ({ ...skill, skill_name: index === 0 ? 'Pagkukumpuni ng bubong at elektrikal na serbisyo para kay Maria Ysabel dela Cruz Villanueva' : skill.skill_name }));
  const tree = summary({ skills: longSkills });
  expect(all(tree, 'Pressable')).toHaveLength(0);
  const chips = all(tree, 'View').filter(x => flat(x.props.style).borderRadius === 999);
  expect(chips).toHaveLength(4);
  for (const chip of chips) {
    const style = flat(chip.props.style);
    expect(style.minHeight).toBe(28);
    expect(style.height).toBeUndefined();
    expect(style.maxWidth).toBe('100%');
    expect(style.flexShrink).toBe(1);
    expect(chip.props.children.props.numberOfLines).toBeUndefined();
    expect(chip.props.children.props.allowFontScaling).not.toBe(false);
    expect(style.opacity).toBeUndefined();
    const label = flat(chip.props.children.props.style);
    const lum = (c: string) => c.slice(1).match(/../g)!.map(x => parseInt(x,16)/255).map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4).reduce((a,x,i) => a+x*[.2126,.7152,.0722][i],0);
    const a=lum(label.color), b=lum(style.backgroundColor || tree.parentSurface), ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5); expect(ratio).toBeGreaterThanOrEqual(3);
    console.log('Static summary chip contrast', label.color, style.backgroundColor, 'caller', tree.parentSurface, ratio);

  }
  expect(all(tree, 'Text').map(x => x.props.children)).toEqual([longSkills[0].skill_name, 'Electrical', 'Painting', ['+', 1, ' more']]);
  expect(summary({ skills: [], emptyLabel: 'Empty' }).props.children).toBe('Empty');
});
it('composes contrasting pressed backgrounds without fading text and returns to resting styles', () => {
  const tree = summary({ skills, onPressView() {} });
  for (const b of all(tree, 'Pressable')) {
    const rest = flat(b.props.style({ pressed: false })), pressed = flat(b.props.style({ pressed: true }));
    expect(pressed.backgroundColor).not.toBe(rest.backgroundColor);
    expect(pressed.opacity).toBeUndefined();
    expect(flat(b.props.style({ pressed: false }))).toEqual(rest);
    const label = flat(b.props.children.props.style).color;
    const lum = (c: string) => c.slice(1).match(/../g)!.map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((a, x, i) => a + x * [.2126, .7152, .0722][i], 0);
    for (const s of [rest, pressed]) {
      const bg = s.backgroundColor || tree.parentSurface;
      const a = lum(label), z = lum(bg), ratio = (Math.max(a,z)+.05)/(Math.min(a,z)+.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      console.log('Summary contrast', label, bg, ratio);
    }
  }
});

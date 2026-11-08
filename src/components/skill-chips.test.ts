// @ts-expect-error -- Node-only harness.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';

type Props = Record<string, any>;
const jsx = (type: any, props: Props) => ({ type, props });
const load = (file: string, modules: Props) => {
  const exports: Props = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: (name: string) => { if (!(name in modules)) throw Error(name); return modules[name]; } });
  return exports;
};
const native = { StyleSheet: { create: (s: any) => s }, Platform: { select: (v: Props) => v.android ?? v.default }, Text: 'Text', View: 'View' };
const theme = load('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} }).SkillMatchTheme.ui;
const categories = load('src/lib/skill-categories.ts', { './supabase': { supabase: {} } });
let known: Map<string, string> | null = null;
const { SkillChips } = load('src/components/skill-chips.tsx', {
  react: { useState: (initial: unknown) => [known ?? initial, () => undefined], useEffect: () => undefined },
  'react-native': native,
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@/components/refinement-theme': { useUiTheme: () => theme },
  '@/lib/skill-categories': categories,
});
const flat = (style: any): Props => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style ?? {};
const chipsOf = (tree: any): any[] => tree.props.children;

it('SKL-02: shows each skill as its own pill with a category dot, grouped by category, instead of one long line', () => {
  known = new Map([['Plumbing', 'Home repair & construction'], ['Caregiving', 'Care & personal services'], ['Carpentry', 'Home repair & construction']]);
  const tree = SkillChips({ skills: ['Caregiving', 'Plumbing', 'Carpentry'] });
  expect(flat(tree.props.style)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
  const chips = chipsOf(tree);
  expect(chips.map((chip) => chip.props.children[1].props.children)).toEqual(['Carpentry', 'Plumbing', 'Caregiving']);
  for (const chip of chips) {
    expect(flat(chip.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'center', borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceSunken });
    expect(flat(chip.props.children[0].props.style)).toMatchObject({ width: 10, height: 10, borderRadius: 5 });
  }
  expect(flat(chips[0].props.children[0].props.style).backgroundColor).toBe(categories.SKILL_CATEGORY_COLORS['Home repair & construction']);
  expect(flat(chips[2].props.children[0].props.style).backgroundColor).toBe(categories.SKILL_CATEGORY_COLORS['Care & personal services']);
  expect(chips[2].props).toMatchObject({ accessible: true, accessibilityLabel: 'Caregiving, Care & personal services' });
  known = null;
});

it('SKL-02: keeps the given order with neutral dots while the catalog loads', () => {
  known = null;
  const chips = chipsOf(SkillChips({ skills: ['Plumbing', 'Caregiving'] }));
  expect(chips.map((chip) => chip.props.children[1].props.children)).toEqual(['Plumbing', 'Caregiving']);
  for (const chip of chips) expect(flat(chip.props.children[0].props.style).backgroundColor).toBe(categories.UNKNOWN_SKILL_COLOR);
  expect(chips[0].props.accessibilityLabel).toBe('Plumbing');
});

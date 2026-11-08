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
const native = {
  StyleSheet: { create: (s: any) => s, absoluteFill: {} }, Platform: { select: (v: Props) => v.android ?? v.default },
  Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
};
const theme = load('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} });
const { AppDialog } = load('src/components/app-dialog.tsx', {
  'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/components/refinement-theme': { useUiTheme: () => theme.SkillMatchTheme.ui },
});
const all = (tree: any): any[] => Array.isArray(tree) ? tree.flatMap(all) : tree?.props ? [tree, ...all(tree.props.children)] : [];

it('SCH-01: shows an optional hero (Itik) centred above the title, and nothing extra without one', () => {
  const hero = { type: 'Itik', props: {} };
  const nodes = all(AppDialog({ visible: true, onRequestClose: () => undefined, title: 'Title', message: 'Message', hero }));
  const title = nodes.findIndex((node) => node.type === 'Text' && node.props.children === 'Title');
  expect(nodes.indexOf(hero)).toBeGreaterThan(-1);
  expect(nodes.indexOf(hero)).toBeLessThan(title);
  expect(nodes.find((node) => node.props?.children === hero).props.style).toMatchObject({ alignItems: 'center' });
  const plain = all(AppDialog({ visible: true, onRequestClose: () => undefined, title: 'Title', message: 'Message' }));
  expect(nodes.filter((node) => node.type === 'View')).toHaveLength(plain.filter((node) => node.type === 'View').length + 1);
  expect(plain.some((node) => node.type === 'Itik')).toBe(false);
});

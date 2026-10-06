// @ts-expect-error -- Offline native composition harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';

type Props = Record<string, any>;
const jsx = (type: any, props: Props) => ({ type, props });
function harness() {
  let open = false;
  const native = { Platform: { select: (v: Props) => v.android ?? v.default }, StyleSheet: { create: (v: any) => v }, View: 'View', Pressable: 'Pressable', Text: 'Text' };
  const load = (file: string): Props => {
    const exports = {};
    const seams: Props = { 'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/app-symbol': { AppSymbol: 'SymbolView' }, '@/global.css': {}, react: { useState: () => [open, (next: any) => { open = typeof next === 'function' ? next(open) : next; }] } };
    new Function('require', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)((id: string) => id === '@/components/refinement-theme' ? { useUiTheme: () => load('src/constants/theme.ts').SkillMatchTheme.ui } : id === '@/constants/theme' ? load('src/constants/theme.ts') : seams[id] ?? (() => { throw Error(id); })(), exports);
    return exports;
  };
  return { Disclosure: load('src/components/ui/collapsible.tsx').Collapsible, ui: load('src/constants/theme.ts').SkillMatchTheme.ui };
}

it('keeps draft children mounted while hiding them from layout/accessibility; opens and closes without losing ownership', () => {
  const { Disclosure } = harness();
  const draft = jsx('TextInput', { value: 'Unsaved biography' });
  const render = () => Disclosure({ title: 'Edit profile', children: draft });
  let tree = render();
  const body = () => tree.props.children[1];
  expect(body().props.children).toBe(draft);
  expect(body().props.importantForAccessibility).toBe('no-hide-descendants');
  expect(body().props.style[1]).toEqual({ maxHeight: 0, overflow: 'hidden', paddingBottom: 0 });
  expect(body().props.pointerEvents).toBe('none');
  tree.props.children[0].props.onPress(); tree = render();
  expect(tree.props.children[0].props.accessibilityState.expanded).toBe(true);
  expect(body().props.children).toBe(draft);
  expect(body().props.importantForAccessibility).toBe('auto');
  expect(body().props.pointerEvents).toBe('auto');
  tree.props.children[0].props.onPress(); tree = render();
  expect(body().props.children).toBe(draft);
  expect(body().props.accessibilityElementsHidden).toBe(true);
  const revoked = Disclosure({ title: 'Edit profile', children: null });
  expect(revoked.props.children[1].props.children).toBeNull();
});

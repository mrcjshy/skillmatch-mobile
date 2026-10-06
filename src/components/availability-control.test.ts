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

function harness() {
  const native = { Platform: { select: (values: Props) => values.android ?? values.default }, StyleSheet: { create: (value: Props) => value }, Pressable: 'Pressable', Text: 'Text', View: 'View' };
  const jsx = (type: any, props: Props) => ({ type, props });
  const compile = (path: string, modules: Props): Props => {
    const exports: Props = {};
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(code, { exports, require: (key: string) => {
      if (key === '@/components/refinement-theme') return { useUiTheme: () => modules['@/constants/theme'].SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: any) => children };
      if (!(key in modules)) throw Error(`Unexpected import: ${key}`);
      return modules[key];
    } });
    return exports;
  };
  const theme = compile('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} });
  let open = false;
  const { AvailabilityControl } = compile('src/components/availability-control.tsx', {
    'react-native': native, react: { useState: () => [open, (next: boolean) => { open = next; }] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, '@/constants/theme': theme,
    '@/components/app-sheet': { AppSheet: 'AppSheet' }, '@/components/app-symbol': { AppSymbol: 'SymbolView' },
    '@/components/radio-row': { RadioRow: 'RadioRow' },
    '@/lib/worker-profile': compile('src/lib/worker-profile.ts', {}),
  });
  return { render: (props: Props) => AvailabilityControl(props), ui: theme.SkillMatchTheme.ui };
}
function ratio(a: string, b: string) {
  const lum = (hex: string) => { const rgb = hex.slice(1).match(/../g)!.map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
  const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
const sheet = (tree: any) => children(tree).find(n => n.type === 'AppSheet');
const trigger = (tree: any) => children(tree).find(n => n.props.accessibilityLabel === 'Availability');
const options = (tree: any) => children(sheet(tree)).filter(n => n.type === 'RadioRow');

describe('AvailabilityControl as a Work status row opening the shared bottom sheet', () => {
  it('is a 56dp status row with an accessible current value, wrapping text and neutral disabled feedback', () => {
    for (const disabled of [false, true]) {
      const h = harness();
      const tree = h.render({ value: 'available', onChange: vi.fn(), disabled });
      const row = trigger(tree), idle = states(row, false);
      expect(idle.minHeight).toBeGreaterThanOrEqual(56);
      expect(row.props.accessibilityRole).toBe('button');
      expect(row.props.accessibilityValue).toEqual({ text: 'Available' });
      expect(row.props.accessibilityState).toEqual({ disabled, expanded: false });
      if (disabled) expect(states(row, true)).toEqual(idle); else expect(states(row, true).backgroundColor).toBe(h.ui.colors.surfaceSunken);
      expect(states(row, true).opacity).toBeUndefined();
      const texts = children(row).filter(n => n.type === 'Text');
      expect(texts.map(n => n.props.children)).toEqual(['Work status', 'Available']);
      expect(texts.every(n => n.props.numberOfLines === undefined)).toBe(true);
      for (const text of texts) expect(ratio(flatten(text.props.style).color, h.ui.colors.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('opens the sheet without selecting anything, titled Work status with Available and Busy and the current one marked', () => {
    const h = harness(), onChange = vi.fn();
    let tree = h.render({ value: 'offline', onChange });
    expect(sheet(tree).props.visible).toBe(false);
    trigger(tree).props.onPress(); tree = h.render({ value: 'offline', onChange });
    expect(sheet(tree).props.visible).toBe(true);
    expect(sheet(tree).props.title).toBe('Work status');
    expect(trigger(tree).props.accessibilityState.expanded).toBe(true);
    expect(options(tree).map(n => n.props.label)).toEqual(['Available', 'Busy']);
    expect(options(tree).map(n => n.props.selected)).toEqual([false, true]); // historical offline reads as Busy
    expect(onChange).not.toHaveBeenCalled();
    expect(children(sheet(tree)).find(n => n.props.accessibilityRole === 'radiogroup').props.accessibilityLabel).toBe('Work status');
  });

  it('keeps unchanged-selection, change and dismissal sequencing; Back and the scrim both reach onClose', () => {
    const h = harness(), onChange = vi.fn(), props = { value: 'offline', onChange };
    let tree = h.render(props);
    trigger(tree).props.onPress(); tree = h.render(props);
    options(tree)[1].props.onPress(); tree = h.render(props);
    expect(sheet(tree).props.visible).toBe(false); expect(onChange).not.toHaveBeenCalled();
    trigger(tree).props.onPress(); tree = h.render(props);
    options(tree)[0].props.onPress(); tree = h.render(props);
    expect(sheet(tree).props.visible).toBe(false); expect(onChange.mock.calls).toEqual([['available']]);
    trigger(tree).props.onPress(); tree = h.render(props);
    sheet(tree).props.onClose(); tree = h.render(props);
    expect(sheet(tree).props.visible).toBe(false); expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('explains each choice in one plain sentence and never relies on colour alone for the current status', () => {
    const h = harness();
    const tree = h.render({ value: 'available', onChange: vi.fn() });
    trigger(tree).props.onPress();
    const rows = options(h.render({ value: 'available', onChange: vi.fn() }));
    expect(rows.map(n => n.props.meaning)).toEqual(['See jobs that match your skills.', 'Pause matching for new work.']);
    expect(rows.map(n => n.props.accessibilityLabel)).toEqual(['Available', 'Busy']);
    expect(children(trigger(tree)).filter(n => n.type === 'SymbolView').some(n => n.props.name.android === 'check_circle')).toBe(true);
    const busy = h.render({ value: 'busy', onChange: vi.fn() });
    expect(children(trigger(busy)).filter(n => n.type === 'SymbolView').some(n => n.props.name.android === 'pause')).toBe(true);
  });
});
